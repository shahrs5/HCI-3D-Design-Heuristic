// End-to-end against the DEPLOYED site and the real database:
//   npm run test:live
// Creates a session with the Firebase CLI's owner credentials (as the console would), completes the
// participant flow in the browser, checks the stored result, then deletes the session.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import checklist from '../src/checklist.json' with { type: 'json' };

const url = process.env.E2E_URL;
test.skip(!url, 'set E2E_URL to run against the deployed site');

const require = createRequire(import.meta.url);
const project = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/sessions`;
async function token() {
  const { configstore } = require('firebase-tools/lib/configstore.js');
  const { getAccessToken } = require('firebase-tools/lib/auth.js');
  return (await getAccessToken(configstore.get('tokens').refresh_token, [])).access_token as string;
}
const str = (v: string) => ({ stringValue: v });

test('participant flow on the live site writes a valid submission', async ({ page }) => {
  const tok = await token();
  const code = 'E2E' + Array.from({ length: 3 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const create = await fetch(`${base}?documentId=${code}`, { method: 'POST', headers: H, body: JSON.stringify({ fields: {
    schemaVersion: { integerValue: '3' }, auditor: str('E2E-TEST'), group: str('Sighted pilot (blindfolded)'), condition: str('B: OpenSCAD + Claude'),
    screenReader: str('none'), task: str('Automated test task.'), status: str('created'), createdAt: { timestampValue: new Date().toISOString() }, createdBy: str('e2e'),
  } }) });
  expect(create.ok, await create.text()).toBe(true);
  try {
    await page.goto(`${url}/s/${code}`);
    await expect(page.locator('main h1')).toHaveText('Your task', { timeout: 20000 });
    await expect(page.locator('main')).toContainText('Automated test task.');
    await page.getByRole('button', { name: 'Start the task' }).click();
    await expect(page.locator('main h1')).toHaveText('Doing the task');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'I have finished the task' }).click();
    await page.getByLabel('Correct', { exact: true }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    for (let s = 0; s < checklist.length; s++) {
      await expect(page.locator('main h1')).toHaveText(`${checklist[s].heuristic} ${checklist[s].title}`);
      for (const g of await page.locator('fieldset').all()) await g.getByLabel(/^2:/).check();
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.getByRole('button', { name: 'Next' }).click(); // no outside problems
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('main h1')).toHaveText('Thank you, you are done', { timeout: 20000 });

    const doc = await (await fetch(`${base}/${code}`, { headers: H })).json();
    expect(doc.fields.status.stringValue).toBe('submitted');
    expect(doc.fields.answers.mapValue.fields['H3.2'].integerValue).toBe('2');
    expect(doc.fields.taskStartedAt.timestampValue).toBeTruthy();
    expect(doc.fields.taskEndedAt.timestampValue).toBeTruthy();
    expect(doc.fields.verificationAnswer.stringValue).toBe('Correct');
  } finally {
    await fetch(`${base}/${code}`, { method: 'DELETE', headers: H });
  }
});
