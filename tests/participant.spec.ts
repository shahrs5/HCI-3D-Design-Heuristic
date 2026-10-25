import { test, expect, type Page } from '@playwright/test';
import checklist from '../src/checklist.json' with { type: 'json' };
import { axe, checkTabOrder, noHorizontalScroll, resetStore, seedSession, useFakes } from './helpers';

const TOTAL = 5 + checklist.length; // task, doing, verify, H1-H5, outside, review

test.beforeEach(async ({ context, page }) => {
  await useFakes(context);
  await resetStore(page);
  await seedSession(page);
});

async function expectStep(page: Page, n: number, title: string) {
  await expect(page.locator('main h1')).toHaveText(title);
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page.locator('.progress')).toHaveText(`Step ${n} of ${TOTAL}`);
  await expect(page.locator('#live-region')).toHaveText(`Step ${n} of ${TOTAL}: ${title}`);
}

test('landing: code entry with accessible errors', async ({ page }) => {
  await page.goto('/');
  await axe(page, 'landing');
  await page.getByRole('button', { name: 'Open session' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('Enter the 6-character session code');
  await axe(page, 'landing error');
  await page.getByLabel('Session code').fill('k7p4qx');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/s\/K7P4QX$/);
  await expect(page.locator('main h1')).toHaveText('Your task');
  // unknown code
  await page.goto('/s/ZZZZZZ');
  await expect(page.locator('main')).toContainText('There is no session with the code ZZZZZZ');
  await axe(page, 'not found');
});

test('full participant journey by keyboard: every step axe-clean, focus and announcements', async ({ page }) => {
  await page.goto('/s/K7P4QX');
  await expect(page.locator('main h1')).toHaveText('Your task');
  await expect(page.locator('main')).toContainText('Make a box 40 mm wide');
  await axe(page, 'welcome');
  await checkTabOrder(page, 'welcome');

  // Start the task (keyboard only)
  await page.getByRole('button', { name: 'Start the task' }).focus();
  await page.keyboard.press('Enter');
  await expectStep(page, 2, 'Doing the task');
  await expect(page.locator('main')).toContainText('You started the task at');
  await axe(page, 'doing');
  await page.getByRole('button', { name: 'How long have I been working?' }).press('Enter');
  await expect(page.locator('#live-region')).toContainText('You have been working for');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'I have finished the task' }).press('Enter');
  await expectStep(page, 3, 'Verification question');
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0); // cannot return to the task
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await axe(page, 'verify error');
  await page.getByLabel('Could not tell').check();
  await page.getByLabel('How did you decide?').fill('I only had the code to go on.');
  await page.getByRole('button', { name: 'Next' }).click();

  for (const [ci, cat] of checklist.entries()) {
    await expectStep(page, 4 + ci, `${cat.heuristic} ${cat.title}`);
    if (ci === 0) {
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.locator('#live-region')).toContainText(`There are ${cat.items.length} problems`);
      await axe(page, `${cat.heuristic} errors`);
    }
    for (const [ii, item] of cat.items.entries()) {
      const group = page.getByRole('group', { name: `Severity for ${item.id}` });
      await (ii === 0 ? group.getByLabel('Unclear / N/A') : group.getByLabel(new RegExp(`^${ii}:`))).check();
    }
    if (ci === 0) { await axe(page, cat.heuristic); await checkTabOrder(page, cat.heuristic); }
    await page.getByRole('button', { name: 'Next' }).click();
  }

  await expectStep(page, 4 + checklist.length, 'Problems outside the checklist');
  await page.getByRole('button', { name: 'Add an issue' }).click();
  await expect(page.locator('#live-region')).toHaveText('Problem 1 added.');
  await expect(page.getByLabel('Description of issue 1')).toBeFocused();
  await page.getByLabel('Description of issue 1').fill('Could not tell which face was the top.');
  await page.getByLabel('Tag for issue 1').selectOption('Describing spatial relations');
  await page.getByRole('group', { name: 'Severity for issue 1' }).getByLabel(/^3:/).check();
  await axe(page, 'outside');
  await page.getByRole('button', { name: 'Next' }).click();

  await expectStep(page, TOTAL, 'Review and submit');
  await axe(page, 'review');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('main h1')).toHaveText('Thank you, you are done');
  await expect(page.locator('main h1')).toBeFocused();
  await axe(page, 'done');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-db')!).sessions.K7P4QX);
  expect(stored.status).toBe('submitted');
  expect(stored.answers['H1.1']).toBe('NA');
  expect(stored.answers['H1.2']).toBe(1);
  expect(stored.verificationAnswer).toBe('Could not tell');
  expect(stored.issueTags).toEqual(['Describing spatial relations']);
});

test('reload resumes at the right step; answers kept', async ({ page }) => {
  await page.goto('/s/K7P4QX');
  await page.getByRole('button', { name: 'Start the task' }).click();
  await expect(page.locator('main h1')).toHaveText('Doing the task');
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Doing the task');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'I have finished the task' }).click();
  await page.getByLabel('Incorrect').check();
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Verification question');
  await expect(page.getByLabel('Incorrect')).toBeChecked();
});

test('a second browser cannot open a session that is in use; unlocking allows it', async ({ page, context }) => {
  await page.goto('/s/K7P4QX');
  await expect(page.locator('main h1')).toHaveText('Your task');
  const other = await context.newPage(); // new tab = new sessionStorage = different anonymous user
  await other.goto('/s/K7P4QX');
  await expect(other.locator('main')).toContainText('is already open in another browser');
  await axe(other, 'locked');
  // operator unlocks
  await page.evaluate(() => { const db = JSON.parse(localStorage.getItem('fake-db')!); db.sessions.K7P4QX.participantUid = null; localStorage.setItem('fake-db', JSON.stringify(db)); });
  await other.getByRole('button', { name: 'Try again' }).click();
  await expect(other.locator('main h1')).toHaveText('Your task');
});

test('network failure on start is reported and recoverable', async ({ page }) => {
  await page.goto('/s/K7P4QX');
  await expect(page.locator('main h1')).toHaveText('Your task');
  await page.evaluate(() => localStorage.setItem('fake-offline', '1'));
  await page.getByRole('button', { name: 'Start the task' }).click();
  await expect(page.getByRole('alert')).toContainText('That did not work');
  await expect(page.locator('#live-region')).toContainText('That did not work');
  await page.evaluate(() => localStorage.removeItem('fake-offline'));
  await page.getByRole('button', { name: 'Start the task' }).click();
  await expect(page.locator('main h1')).toHaveText('Doing the task');
});

for (const width of [320, 640]) {
  test(`participant pages reflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/s/K7P4QX');
    await expect(page.locator('main h1')).toHaveText('Your task');
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: 'Start the task' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'I have finished the task' }).click();
    await page.getByLabel('Correct', { exact: true }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('main h1')).toHaveText('H1 Agent Interface');
    await noHorizontalScroll(page);
  });
}
