import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import checklist from '../src/checklist.json' with { type: 'json' };

const TOTAL = 4 + checklist.length;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function axe(page: Page, label: string) {
  // Open every <details> so hidden content is scanned too.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = false)));
}

/** Press Tab until the focused element matches `selector` (keyboard-only navigation). */
async function tabTo(page: Page, selector: string, max = 300) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => !!document.activeElement?.matches(s), selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${selector} with Tab`);
}

/** Tab through the whole page; check order follows the DOM and every control is reachable with a visible focus ring. */
async function checkTabOrder(page: Page, label: string) {
  await page.locator('h1').focus();
  const seen: { key: string; index: number; outline: string; shadow: string }[] = [];
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const all = Array.from(document.querySelectorAll('*'));
      const cs = getComputedStyle(el);
      const key = el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : el.id || el.outerHTML.slice(0, 80);
      return { key, index: all.indexOf(el), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, shadow: cs.boxShadow };
    });
    if (!info || (seen.length && info.index <= seen[seen.length - 1].index)) break; // wrapped
    seen.push(info);
  }
  // DOM order
  for (let i = 1; i < seen.length; i++) expect(seen[i].index, `${label}: tab order`).toBeGreaterThan(seen[i - 1].index);
  // Visible focus
  for (const s of seen) expect(s.outline.startsWith('solid') || s.shadow !== 'none', `${label}: focus ring on ${s.key}`).toBeTruthy();
  // Everything reachable
  const expected = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button:not([disabled]), main input, main select, main textarea, main summary'));
    return [...new Set(els.map((el) => (el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : el.id || el.outerHTML.slice(0, 80))))];
  });
  const keys = seen.map((s) => s.key);
  for (const e of expected) expect(keys, `${label}: ${e} reachable by Tab`).toContain(e);
  return keys;
}

async function expectStep(page: Page, n: number, title: string) {
  await expect(page.locator('h1')).toHaveText(title);
  await expect(page.locator('h1')).toBeFocused();
  await expect(page.locator('.progress')).toHaveText(`Step ${n} of ${TOTAL}`);
  await expect(page.locator('#live-region')).toHaveText(`Step ${n} of ${TOTAL}: ${title}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('every step: axe clean, errors announced, focus managed, tab order', async ({ page }) => {
  // Step 1 – empty submit shows error summary
  await axe(page, 'step 1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('There are 4 problems');
  await axe(page, 'step 1 errors');
  // Error link moves focus to field
  await page.getByRole('link', { name: /Enter an auditor code/ }).click();
  await expect(page.locator('#auditor')).toBeFocused();
  await checkTabOrder(page, 'step 1 errors');

  await page.fill('#auditor', 'P1');
  await page.getByLabel('BLV screen-reader user').check();
  await page.getByLabel('B: OpenSCAD + Claude').check();
  await page.fill('#screenReader', 'NVDA');
  await checkTabOrder(page, 'step 1');
  await page.getByRole('button', { name: 'Next' }).click();

  for (const [ci, cat] of checklist.entries()) {
    const n = ci + 2;
    await expectStep(page, n, `${cat.heuristic} ${cat.title}`);
    await expect(page.getByText('How often does the problem occur?')).toBeHidden();
    await page.locator('summary').click();
    await expect(page.getByText('How often does the problem occur?')).toBeVisible();
    await page.locator('summary').click();
    await axe(page, `step ${n}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#live-region')).toContainText(`There are ${cat.items.length} problems`);
    await expect(page.locator('.error-summary')).toBeFocused();
    await axe(page, `step ${n} errors`);
    for (const [ii, item] of cat.items.entries()) {
      const group = page.getByRole('group', { name: `Severity for ${item.id}` });
      if (ii === 0) await group.getByLabel('Unclear / N/A').check();
      else await group.getByLabel(new RegExp(`^${ii % 5}:`)).check();
    }
    await page.getByLabel(`Comment on ${cat.items[0].id} (optional)`).fill('Example comment');
    await checkTabOrder(page, `step ${n}`);
    await page.getByRole('button', { name: 'Next' }).click();
  }

  // Outside framework
  await expectStep(page, 7, 'Issues outside the framework');
  await axe(page, 'step 7 empty');
  await page.getByRole('button', { name: 'Add an issue' }).click();
  await expect(page.locator('#live-region')).toHaveText('Issue 1 added.');
  await expect(page.getByLabel('Description of issue 1')).toBeFocused();
  await page.getByRole('button', { name: 'Add another issue' }).click();
  await expect(page.locator('#live-region')).toHaveText('Issue 2 added.');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#live-region')).toContainText('There are 6 problems');
  await axe(page, 'step 7 errors');
  await page.getByRole('button', { name: 'Remove issue 2' }).click();
  await expect(page.locator('#live-region')).toHaveText('Issue 2 removed. 1 issues remain.');
  await expect(page.getByRole('button', { name: 'Add another issue' })).toBeFocused();
  await page.getByLabel('Description of issue 1').fill('No way to hear the bounding box of the model.');
  await page.getByLabel('Tag for issue 1').selectOption('Verifying spatial output');
  await page.getByRole('group', { name: 'Severity for issue 1' }).getByLabel(/^3:/).check();
  await axe(page, 'step 7 filled');
  await checkTabOrder(page, 'step 7');
  await page.getByRole('button', { name: 'Next' }).click();

  // Verification
  await expectStep(page, 8, 'Verification question');
  await axe(page, 'step 8');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#live-region')).toContainText('There is 1 problem');
  await axe(page, 'step 8 errors');
  await page.getByLabel('Could not tell').check();
  await page.getByLabel('How did you decide?').fill('Only had the code.');
  await checkTabOrder(page, 'step 8');
  await page.getByRole('button', { name: 'Next' }).click();

  // Review
  await expectStep(page, 9, 'Review and submit');
  await axe(page, 'step 9');
  await checkTabOrder(page, 'step 9');
  await expect(page.getByRole('cell', { name: 'Unclear / N/A' }).first()).toBeVisible();

  // Back works and moves focus
  await page.getByRole('button', { name: 'Back' }).click();
  await expectStep(page, 8, 'Verification question');

  // Refresh keeps work
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Verification question');
  await expect(page.getByLabel('Could not tell')).toBeChecked();
});

test('confirmation screen is accessible', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('hci-a11y-audit-v1', JSON.stringify({
      step: 8, submittedId: 'TESTSESSION123',
      data: { auditor: 'P1', group: 'BLV screen-reader user', condition: 'A: OpenSCAD + ChatGPT', screenReader: 'NVDA', items: {}, outside: [], verification: { answer: 'Correct', reason: '' } },
    })),
  );
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Session submitted');
  await expect(page.getByText('TESTSESSION123')).toBeVisible();
  await axe(page, 'confirmation');
  await checkTabOrder(page, 'confirmation');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start new session' }).click();
  await expectStep(page, 1, 'Session setup');
  await expect(page.locator('#auditor')).toHaveValue('');
});

test('complete the whole wizard with the keyboard only', async ({ page }) => {
  await page.locator('h1').focus();
  await tabTo(page, '#auditor');
  await page.keyboard.type('P2');
  await tabTo(page, 'input[name=group]');
  await page.keyboard.press('Space'); // first option
  await tabTo(page, 'input[name=condition]');
  await page.keyboard.press('ArrowDown'); // second option
  await tabTo(page, '#screenReader');
  await page.keyboard.type('VoiceOver');
  await page.keyboard.press('Enter'); // submits form = Next
  for (const cat of checklist) {
    await expect(page.locator('h1')).toHaveText(`${cat.heuristic} ${cat.title}`);
    await tabTo(page, 'summary');
    await page.keyboard.press('Enter');
    await expect(page.locator('details')).toHaveAttribute('open', '');
    for (const item of cat.items) {
      await tabTo(page, `input[name="sev-${item.id.replace('.', '_')}"]`);
      await page.keyboard.press('Space');
    }
    await tabTo(page, 'button[type=submit]');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('h1')).toHaveText('Issues outside the framework');
  await tabTo(page, '#add-issue');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Cannot tell which face is the top.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown'); // first tag
  await tabTo(page, 'input[type=radio]');
  await page.keyboard.press('Space');
  await tabTo(page, 'button[type=submit]');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText('Verification question');
  await tabTo(page, 'input[name=verify]');
  await page.keyboard.press('Space');
  await tabTo(page, 'button[type=submit]');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText('Review and submit');
  await expect(page.getByText('Cannot tell which face is the top.')).toBeVisible();
  await expect(page.getByText('0: Not an accessibility problem').first()).toBeVisible();
});

for (const width of [640, 320]) {
  test(`reflows at ${width}px (200% / 400% zoom), no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.fill('#auditor', 'P1');
    await page.getByLabel('Sighted pilot (blindfolded)').check();
    await page.getByLabel('A: OpenSCAD + ChatGPT').check();
    await page.fill('#screenReader', 'NVDA');
    for (let s = 0; s < 8; s++) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on step ${s + 1}`).toBeLessThanOrEqual(0);
      if (s >= 1 && s <= 5) for (const g of await page.locator('fieldset').all()) await g.getByLabel('Unclear / N/A').check();
      if (s === 6) await page.getByRole('button', { name: 'Add an issue' }).click().then(() => page.getByRole('button', { name: 'Remove issue 1' }).click());
      if (s === 7) await page.getByLabel('Correct', { exact: true }).check();
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await expect(page.locator('h1')).toHaveText('Review and submit');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('admin page is accessible (signed out)', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('h1')).toHaveText('Admin: submitted sessions');
  await axe(page, 'admin');
});
