// Submits one session through the DEPLOYED site. Run with: E2E_URL=https://<site> npx playwright test e2e-live
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const url = process.env.E2E_URL;
test.skip(!url, 'set E2E_URL to run against the deployed site');

test('submit a session to the deployed app', async ({ page }) => {
  await page.goto(url!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill('#auditor', 'E2E-TEST');
  await page.getByLabel('Sighted pilot (blindfolded)').check();
  await page.getByLabel('B: OpenSCAD + Claude').check();
  await page.fill('#screenReader', 'NVDA');
  await page.getByRole('button', { name: 'Next' }).click();
  for (let s = 0; s < 5; s++) {
    const groups = await page.locator('fieldset').all();
    for (const [i, g] of groups.entries()) await (i === 0 ? g.getByLabel('Unclear / N/A') : g.getByLabel(new RegExp(`^${i}:`))).check();
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Add an issue' }).click();
  await page.getByLabel('Description of issue 1').fill('E2E test issue');
  await page.getByLabel('Tag for issue 1').selectOption('Tracking edits');
  await page.getByRole('group', { name: 'Severity for issue 1' }).getByLabel(/^2:/).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Incorrect').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('h1')).toHaveText('Session submitted', { timeout: 30000 });
  await expect(page.locator('h1')).toBeFocused();
  await expect(page.locator('#live-region')).toHaveText('Session submitted');
  const id = await page.locator('.success strong').textContent();
  console.log('SUBMITTED_SESSION_ID', id);
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(res.violations.map((v) => v.id)).toEqual([]);
});
