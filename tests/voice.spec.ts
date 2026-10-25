import { test, expect } from '@playwright/test';

// Simulates the browser's speech recogniser so the voice path can be tested without a microphone.
test('voice command: interim text, final result is sent and marked as spoken', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRec {
      lang = ''; interimResults = false; continuous = false; maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() {
        const say = (window as unknown as { __say: string }).__say ?? 'add a box twenty by twenty by ten';
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: say.split(' ').slice(0, 3).join(' ') }], { isFinal: false })] }), 50);
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: say }], { isFinal: true })] }), 150);
        setTimeout(() => this.onend?.(), 200);
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
  });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hci3d-settings-v1', JSON.stringify({ pace: 'instant', soundCues: false })); });
  await page.reload();
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('.msg.user').last()).toContainText('You said:');
  await expect(page.locator('.msg.user').last()).toContainText('add a box twenty by twenty by ten');
  await expect(page.locator('.msg.agent').last()).toContainText('Added Part 1: a box, 20 mm wide, 20 mm deep, 10 mm tall');

  // With auto-send off, the words wait in the command box.
  await page.locator('#settings').getByLabel('Send voice commands automatically').uncheck();
  await page.evaluate(() => { (window as unknown as { __say: string }).__say = 'make it taller by five'; });
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#command-input')).toHaveValue('make it taller by five');
  await expect(page.locator('#command-input')).toBeFocused();
  await expect(page.locator('#announcer')).toContainText('Heard: make it taller by five. Press Enter to send');
  await page.keyboard.press('Enter');
  await expect(page.locator('.msg.agent').last()).toContainText('height from 10 to 15 mm');
});

test('voice unavailable: clear explanation, typing still works', async ({ page }) => {
  await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; delete (window as unknown as Record<string, unknown>).SpeechRecognition; });
  await page.goto('/');
  await expect(page.getByText('Voice input is not available in this browser')).toBeVisible();
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#alerts')).toContainText('Voice input is not available in this browser');
});
