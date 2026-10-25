import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A fake voice: speech synthesis logs what the page says; speech recognition "hears" the next scripted answer.
async function fakeVoice(page: Page, answers: string[]) {
  await page.addInitScript((answers) => {
    const w = window as unknown as Record<string, unknown> & { __spoken: string[]; __answers: string[] };
    w.__spoken = []; w.__answers = answers;
    const synth = {
      speaking: false,
      speak(u: { text: string; onend?: () => void }) { w.__spoken.push(u.text); setTimeout(() => u.onend?.(), 5); },
      cancel() {}, getVoices: () => [], pause() {}, resume() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = class { text: string; rate = 1; voice = null; onend: (() => void) | null = null; onerror = null; constructor(t: string) { this.text = t; } };
    class FakeRec {
      lang = ''; interimResults = false; continuous = false; maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      ended = false;
      start() {
        const next = w.__answers.shift();
        setTimeout(() => {
          if (this.ended) return;
          if (next === undefined) return; // nothing more scripted: keep "listening"
          if (next === '<mic-blocked>') this.onerror?.({ error: 'not-allowed' });
          else if (next) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: next }], { isFinal: true })] });
          this.ended = true; this.onend?.();
        }, 20);
      }
      stop() { if (!this.ended) { this.ended = true; this.onend?.(); } }
      abort() { this.stop(); }
    }
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    (window as unknown as Record<string, unknown>).AudioContext = undefined;
  }, answers);
}

async function axe(page: Page, label: string) {
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), label).toEqual([]);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = false)));
}
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('voice: the whole evaluation by speaking, with repeat, explain, back, slower and silence', async ({ page }) => {
  const twenty = ['three', 'it never said what changed', 'one', 'not sure', 'four', 'next'];
  // statements 1..20 (comments asked for scores >= 2)
  const script = [
    'repeat',            // repeat statement 1
    'what do the numbers mean', // explain
    'three',             // S1 = 3
    'the agent text was cut off', // S1 comment
    'one',               // S2 = 1
    'go back',           // back to S2? no: back from S3 question → S2
    'zero',              // S2 = 0 (changed)
    '',                  // silence on S3
    'banana',            // not understood
    "I'm not sure",      // S3 = NA
    'slower',
    'for',               // S4 = 4
    'next',              // no comment
    ...Array.from({ length: 16 }, () => 'one'), // S5..S20 = 1
    'no',                // verification: Incorrect
    'I measured it with the code',
    'yes the preview had no labels', // other problem 1
    'two',               // its severity
    'no',                // nothing else
  ];
  void twenty;
  await fakeVoice(page, script);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('h1')).toBeFocused();
  await axe(page, 'start');
  await page.getByRole('button', { name: 'Start: the page talks and listens' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you, you are finished' })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('h1')).toBeFocused();
  await axe(page, 'done');

  const said = await spoken(page);
  expect(said[0]).toContain('You just used the 3D design tool');
  expect(said.filter((s) => s.includes('Statement 1 of 20')).length).toBe(2); // repeated
  expect(said.some((s) => s.startsWith('Here is the scale.'))).toBe(true);
  expect(said.some((s) => s.includes("Sorry, I didn't hear anything"))).toBe(true);
  expect(said.some((s) => s.includes('I heard: banana'))).toBe(true);
  expect(said.some((s) => s.includes('OK, slower'))).toBe(true);
  expect(said.some((s) => s.includes('Part 2 of 5: Agent Operation. Statement 5 of 20'))).toBe(true);
  expect(said.at(-1)).toContain('Please tell the researcher that you have finished');

  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('hci-eval-done-v1')!));
  const d = done[0].data;
  expect(d.items['H1.1']).toEqual({ severity: 3, unclear: false, comment: 'the agent text was cut off' });
  expect(d.items['H1.2'].severity).toBe(0);
  expect(d.items['H1.3'].unclear).toBe(true);
  expect(d.items['H1.4'].severity).toBe(4);
  expect(d.items['H5.4'].severity).toBe(1);
  expect(d.verification).toEqual({ answer: 'Incorrect', reason: 'I measured it with the code' });
  expect(d.outside[0]).toMatchObject({ text: 'yes the preview had no labels', severity: 2 });

  // Researcher downloads
  await page.getByText('For the researcher: results').click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ratings (CSV)' }).click()]);
  const text = await (await import('node:fs/promises')).readFile((await csv.path())!, 'utf8');
  expect(text.split('\r\n')).toHaveLength(22); // header + 20 + trailing
});

test('keyboard and screen reader: questions announced, answers typed', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText('For the researcher: participant and tool (optional)').click();
  await page.getByLabel('Participant code').fill('P7');
  await page.getByLabel('B: OpenSCAD + Claude').check();
  await page.getByRole('button', { name: 'Start with my screen reader and keyboard' }).click();
  const live = page.locator('#live-region');
  const answer = page.getByLabel('Your answer');
  await expect(answer).toBeFocused();
  await expect(live).toContainText('You just used OpenSCAD with Claude');
  await expect(live).toContainText('Statement 1 of 20');
  await expect(live).toContainText('Type 0 to 4, or n for not sure, then press Enter.');
  await axe(page, 'question (keyboard)');
  await answer.fill('2'); await answer.press('Enter');
  await expect(live).toContainText('2, minor problem. Would you like to say why?');
  await answer.press('Enter'); // skip comment
  await expect(live).toContainText('Statement 2 of 20');
  await answer.fill('r'); await answer.press('Enter');
  await expect(live).toContainText('Statement 2 of 20');
  await answer.fill('n'); await answer.press('Enter');
  // confirmation is read together with the next question
  await expect(live).toContainText('Not sure. Noted. Statement 3 of 20');
  await answer.fill('b'); await answer.press('Enter');
  await expect(live).toContainText('Going back. Statement 2 of 20');
  await answer.fill('1'); await answer.press('Enter');
  for (let i = 3; i <= 20; i++) { await expect(live).toContainText(`Statement ${i} of 20`); await answer.fill('0'); await answer.press('Enter'); }
  await expect(live).toContainText('Did the final model match');
  await answer.fill('y'); await answer.press('Enter');
  await expect(live).toContainText('How did you decide?');
  await answer.fill('It said the dimensions'); await answer.press('Enter');
  await expect(live).toContainText('any other problem');
  await answer.press('Enter');
  await expect(page.getByRole('heading', { name: 'Thank you, you are finished' })).toBeFocused();
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('hci-eval-done-v1')!)[0].data);
  expect(d.auditor).toBe('P7');
  expect(d.condition).toBe('B: OpenSCAD + Claude');
  expect(d.items['H1.2'].severity).toBe(1);
  expect(d.verification.answer).toBe('Correct');
});

test('microphone blocked: switches to typing and says so', async ({ page }) => {
  await fakeVoice(page, ['<mic-blocked>']);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Start: the page talks and listens' }).click();
  await expect(page.locator('#live-region')).toContainText('I cannot use the microphone. Please type your answers');
  await expect(page.getByLabel('Your answer')).toBeFocused();
});

test('pause with Escape, resume, and continue after a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Start with my screen reader and keyboard' }).click();
  const answer = page.getByLabel('Your answer');
  await expect(page.locator('#live-region')).toContainText('Statement 1 of 20');
  await answer.fill('3'); await answer.press('Enter');
  await expect(page.locator('#live-region')).toContainText('Would you like to say why?');
  await answer.press('Enter');
  await expect(page.locator('#live-region')).toContainText('Statement 2 of 20');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue where it stopped' })).toBeVisible();
  await expect(page.locator('main')).toContainText('statement 2 of 20');
  await page.getByRole('button', { name: 'Continue where it stopped' }).click();
  await expect(page.locator('#live-region')).toContainText('Statement 2 of 20');
});

for (const width of [320, 640]) {
  test(`reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Start with my screen reader and keyboard' }).click();
    await expect(page.locator('#live-region')).toContainText('Statement 1 of 20');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
