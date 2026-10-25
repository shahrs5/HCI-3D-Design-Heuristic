import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function axe(page: Page, label: string) {
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `axe on ${label}`).toEqual([]);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = false)));
}

async function fresh(page: Page, settings: Record<string, unknown> = {}) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('hci3d-settings-v1', JSON.stringify({ soundCues: false, ...s })); }, settings);
  await page.reload();
}

async function say(page: Page, cmd: string) {
  await page.locator('#command-input').fill(cmd);
  await page.locator('#command-input').press('Enter');
}
const lastAgent = (page: Page) => page.locator('.msg.agent').last();

test('axe: empty, populated, errors, all themes', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  await axe(page, 'empty model');
  await say(page, 'load the phone stand example');
  await expect(lastAgent(page)).toContainText('Loaded the Phone stand example');
  await say(page, 'add a hole 4 wide through the base at the back-right corner');
  await expect(lastAgent(page)).toContainText('Warning:');
  await say(page, 'flibbertigibbet');
  await expect(lastAgent(page)).toContainText("didn't understand");
  await say(page, 'help holes');
  await axe(page, 'populated, light');
  for (const theme of ['dark', 'contrast']) {
    await page.locator('#settings').getByLabel('Colours').selectOption(theme);
    await axe(page, `populated, ${theme}`);
  }
});

test('typing a command: status, announcements, focus stays in the command box (H2.1, H1.1, H3.3)', async ({ page }) => {
  await fresh(page);
  await say(page, 'add a box 40 by 30 by 10');
  await expect(page.locator('.status-line')).toContainText('Working:');
  await expect(page.locator('#announcer')).toHaveText('Working on it.');
  await expect(page.locator('#announcer')).toContainText('Added Part 1: a box, 40 mm wide, 30 mm deep, 10 mm tall', { timeout: 5000 });
  await expect(page.locator('.status-line')).toContainText('Agent: Ready');
  await expect(page.locator('#command-input')).toBeFocused();
  await expect(page.locator('#command-input')).toHaveValue('');
  // The model description, table and code update
  await expect(page.locator('#model')).toContainText('The model has 1 part. Overall it is 40 mm wide, 30 mm deep and 10 mm tall.');
  await expect(page.locator('#model table')).toContainText('Part 1');
  await expect(page.locator('#scad')).toHaveValue(/cube\(\[40, 30, 10\]\)/);
  // canvas has a text alternative
  await expect(page.locator('#preview canvas')).toHaveAttribute('aria-label', /The model has 1 part/);
});

test('changes report what changed and assumptions (H2.2, H2.4); errors are assertive (H4.1)', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  await say(page, 'add a box');
  await expect(page.locator('#announcer')).toContainText("Note: You didn't give the width, depth or height, so I used 20 mm for each.");
  await say(page, 'add a cylinder 10 wide 20 tall on top of part 1');
  await expect(page.locator('#announcer')).toContainText('Overall size is now 20 by 20 by 40 mm (before: 20 by 20 by 20 mm).');
  await say(page, 'add a hole 30 wide in part 1');
  await expect(page.locator('#alerts')).toContainText('Problem: A 30 mm hole is as wide as Part 1');
  await expect(lastAgent(page)).toContainText('Agent, problem:');
});

test('stop with Escape cancels without changing the model (H3.4)', async ({ page }) => {
  await fresh(page);
  await say(page, 'add a box 40 by 30 by 10');
  await expect(page.locator('.status-line')).toContainText('Working:');
  await page.keyboard.press('Escape');
  await expect(page.locator('#announcer')).toHaveText('Stopped. I did not change the model.');
  await expect(page.locator('#model')).toContainText('The model is empty');
  await expect(page.locator('#history')).toContainText('You are at step 0 of 0');
  // typed "stop" while working also works
  await say(page, 'add a box 40 by 30 by 10');
  await expect(page.locator('.status-line')).toContainText('Working:');
  await say(page, 'stop');
  await expect(lastAgent(page)).toContainText('Stopped. I did not change the model.');
});

test('undo, redo, history and going back to a step (H2.3, H4.2)', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  await say(page, 'add a box 40 by 30 by 10');
  await say(page, 'add a sphere 10 on top of part 1');
  await expect(page.locator('#history')).toContainText('You are at step 2 of 2');
  await say(page, 'undo');
  await expect(lastAgent(page)).toContainText('Undid one step: Add Part 2 (sphere). You are now at step 1.');
  await expect(page.locator('#history')).toContainText('1 later step can be redone');
  await say(page, 'redo');
  await expect(lastAgent(page)).toContainText('Redid one step');
  await page.getByRole('button', { name: 'Go to step 0' }).click();
  await expect(lastAgent(page)).toContainText('Went to step 0: Empty model');
  await say(page, 'show history');
  await expect(lastAgent(page)).toContainText('Step 2: Add Part 2 (sphere) (undone).');
});

test('keyboard: jump links, slash shortcut, quick commands, builder, settings persist', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  // Jump links move focus to the section heading
  await page.getByRole('navigation', { name: 'Jump to section' }).getByRole('link', { name: 'Help' }).press('Enter');
  await expect(page.locator('#help-title')).toBeFocused();
  // slash returns to the command box
  await page.keyboard.press('/');
  await expect(page.locator('#command-input')).toBeFocused();
  // Quick command via keyboard
  await page.getByRole('button', { name: 'Help', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(lastAgent(page)).toContainText('Help topics:');
  // Command builder entirely by keyboard
  await page.locator('summary', { hasText: 'Build a command step by step' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Shape', { exact: true }).selectOption('cylinder');
  await page.getByLabel('Diameter (mm)', { exact: true }).fill('12');
  await page.getByLabel('Height (mm)', { exact: true }).fill('30');
  await expect(page.locator('.built-command code')).toHaveText('add a cylinder 12 wide and 30 tall');
  await page.getByRole('button', { name: 'Send now' }).press('Enter');
  await expect(lastAgent(page)).toContainText('Added Part 1: a cylinder, 12 mm diameter, 30 mm tall');
  // Settings persist across reload (H5.4)
  await page.locator('#settings').getByLabel('Brief').check();
  await expect(page.locator('#announcer')).toContainText('Saved.');
  await page.reload();
  await expect(page.locator('#settings').getByLabel('Brief')).toBeChecked();
  // Project persists too
  await expect(page.locator('#model')).toContainText('The model has 1 part');
});

test('detail levels change what is announced (H5.2)', async ({ page }) => {
  await fresh(page, { pace: 'instant', detail: 'brief' });
  await say(page, 'add a box 40 by 30 by 10');
  await expect(page.locator('#announcer')).toHaveText('Added Part 1: a box, 40 mm wide, 30 mm deep, 10 mm tall, in the centre of the build plate.');
  await say(page, 'more detail');
  await say(page, 'add a cylinder 10 wide 10 tall on top of part 1');
  await expect(page.locator('#announcer')).toContainText('Part 2: cylinder, 10 mm diameter, 10 mm tall. It is on top of Part 1, centred.');
});

test('focus can go to the reply instead (setting)', async ({ page }) => {
  await fresh(page, { pace: 'instant', focusAfterReply: 'reply' });
  await say(page, 'add a box 40 by 30 by 10');
  await expect(lastAgent(page)).toBeFocused();
});

test('tab order follows the page and every control shows a focus ring', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  await say(page, 'load the keychain example');
  await expect(lastAgent(page)).toContainText('Loaded');
  await page.locator('h1').click();
  const seen: { idx: number; ring: boolean; desc: string }[] = [];
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { idx: Array.from(document.querySelectorAll('*')).indexOf(el), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, desc: el.tagName + (el.id ? '#' + el.id : '') + ' ' + (el.textContent ?? '').slice(0, 30) };
    });
    if (!info || (seen.length && info.idx <= seen[seen.length - 1].idx)) break;
    seen.push(info);
  }
  expect(seen.length).toBeGreaterThan(40);
  for (const s of seen) expect(s.ring, `focus ring on ${s.desc}`).toBe(true);
  // Order: skip links, then command box before model panel, etc.
  const order = seen.map((s) => s.desc);
  const idx = (re: RegExp) => order.findIndex((d) => re.test(d));
  expect(idx(/^A /)).toBeLessThan(idx(/#command-input/));
  expect(idx(/#command-input/)).toBeLessThan(idx(/#scad/));
});

for (const width of [320, 640]) {
  test(`reflows at ${width}px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fresh(page, { pace: 'instant' });
    await say(page, 'load the phone stand example');
    await expect(lastAgent(page)).toContainText('Loaded');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('200% text size setting keeps the page usable', async ({ page }) => {
  await fresh(page, { pace: 'instant', textSize: 200 });
  await say(page, 'load the keychain example');
  await expect(lastAgent(page)).toContainText('Loaded');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page, 'text 200%');
});

test('downloads and listen work', async ({ page }) => {
  await fresh(page, { pace: 'instant' });
  await say(page, 'load the keychain example');
  await expect(lastAgent(page)).toContainText('Loaded');
  const [stl] = await Promise.all([page.waitForEvent('download'), say(page, 'export stl')]);
  expect(stl.suggestedFilename()).toBe('model.stl');
  const [scad] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .scad file' }).click()]);
  expect(scad.suggestedFilename()).toBe('model.scad');
  await page.getByRole('button', { name: 'Play height profile' }).click();
  await expect(lastAgent(page)).toContainText('Playing the height profile');
});
