import { test, expect } from '@playwright/test';
import { axe, checkTabOrder, noHorizontalScroll, resetStore, useFakes } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await useFakes(context);
  await resetStore(page);
});

test('console: sign-in gate, create session, live progress, notes, recording, measurements', async ({ page, context }) => {
  await page.goto('/console');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await axe(page, 'console signed out');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.locator('main h1')).toHaveText('Sessions');
  await axe(page, 'sessions empty');

  // validation
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await axe(page, 'new session errors');
  await page.getByLabel('Auditor code').fill('P3');
  await page.getByLabel('BLV screen-reader user').check();
  await page.getByLabel('A: OpenSCAD + ChatGPT').check();
  await page.getByLabel('Screen reader and browser (optional)').fill('JAWS 2025, Chrome');
  await page.getByLabel('Task the participant will see').fill('Make a 20 mm cube.');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page).toHaveURL(/\/console\/K7P4QX$/);
  await expect(page.locator('main h1')).toContainText('Session K7P4QX: P3');
  await expect(page.locator('main')).toContainText('/s/K7P4QX');
  await axe(page, 'session page');
  await checkTabOrder(page, 'session page');

  // Participant opens the link in another tab: the console updates live and announces it.
  const p = await context.newPage();
  await p.goto('/s/K7P4QX');
  await expect(p.locator('main')).toContainText('Make a 20 mm cube.');
  await expect(page.locator('.status-big')).toHaveText('Participant has the session open');
  await expect(page.locator('#live-region')).toContainText('Participant update: Participant has the session open');
  await p.getByRole('button', { name: 'Start the task' }).click();
  await expect(page.locator('.status-big')).toHaveText('Participant is doing the task');

  // Recording marks and notes
  await page.getByRole('button', { name: 'Mark recording started' }).click();
  await expect(page.locator('#recording')).toContainText('Recording started at');
  await page.getByLabel('New note').fill('Asked the AI for a hole; it moved the box instead.');
  await page.getByLabel('New note').press('Control+Enter');
  await expect(page.locator('#notes')).toContainText('Asked the AI for a hole');
  await expect(page.locator('#live-region')).toHaveText('Note added.');
  await expect(page.getByLabel('New note')).toHaveValue('');

  // Transcript autosave
  await page.getByLabel('Paste the full ChatGPT or Claude conversation').fill('User: make a cube\nAssistant: cube(20);');
  await expect(page.locator('.save-state')).toContainText('all changes saved');

  // Measurements
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await expect(page.locator('#live-region')).toHaveText('Measurement 1 added.');
  await page.getByLabel('What').fill('Overall width');
  await page.getByLabel('Expected').fill('20');
  await page.getByLabel('Measured').fill('20');
  await page.getByLabel('Matches?').selectOption('Yes');
  await page.getByRole('group', { name: 'Your verdict: does the final model match the task?' }).getByLabel('Correct', { exact: true }).check();
  await axe(page, 'session page filled');
  await expect(page.locator('.save-state')).toContainText('all changes saved');
  const priv = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-db')!).private.K7P4QX);
  expect(priv.notes).toHaveLength(1);
  expect(priv.marks[0].kind).toBe('recording_started');
  expect(priv.transcript).toContain('cube(20)');
  expect(priv.measurements[0]).toMatchObject({ what: 'Overall width', expected: '20', measured: '20', matches: 'Yes' });
  expect(priv.verdict).toBe('Correct');

  // Participant never sees operator data
  await expect(p.locator('body')).not.toContainText('Asked the AI for a hole');

  // Back to the list
  await page.getByRole('link', { name: '← All sessions' }).click();
  await expect(page.locator('main h1')).toHaveText('Sessions');
  await expect(page.locator('table')).toContainText('Participant is doing the task');
  await axe(page, 'sessions list');
});

test('console exports and delete', async ({ page }) => {
  await page.goto('/console');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await page.getByLabel('Auditor code').fill('P4');
  await page.getByLabel('Sighted pilot (blindfolded)').check();
  await page.getByLabel('B: OpenSCAD + Claude').check();
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page).toHaveURL(/\/console\/K7P4QX$/);
  await page.getByRole('link', { name: '← All sessions' }).click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sessions CSV (timing, status, verdicts)' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^sessions_.*\.csv$/);
  const text = await (await import('node:fs/promises')).readFile((await csv.path())!, 'utf8');
  expect(text.split('\r\n')[0]).toContain('"session_id","auditor","group","condition","screen_reader","status"');
  expect(text).toContain('"K7P4QX","P4","Sighted pilot (blindfolded)"');
  await page.getByRole('link', { name: 'K7P4QX' }).click();
  page.once('dialog', (d) => d.accept('K7P4QX'));
  await page.getByRole('button', { name: 'Delete this session' }).click();
  await expect(page.locator('main h1')).toHaveText('Sessions');
  await expect(page.locator('main')).toContainText('No sessions yet.');
});

test('non-admin account is refused', async ({ page }) => {
  await page.goto('/console');
  await page.evaluate(() => { (window as unknown as { __fakeEmail: string }).__fakeEmail = 'stranger@example.com'; });
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.locator('main')).toContainText('stranger@example.com is not on the operator list');
});

test('console reflows at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/console');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.locator('main h1')).toHaveText('Sessions');
  await noHorizontalScroll(page);
});
