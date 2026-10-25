import { expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const FAKE_FIREBASE = readFileSync('tests/fakes/firebase.js', 'utf8');
const FAKE_SESSION = readFileSync('tests/fakes/session.js', 'utf8');

/** Serve the fake backend modules in place of the real ones, for every page in the context. */
export async function useFakes(context: BrowserContext) {
  await context.route(/\/src\/firebase\.ts(\?.*)?$/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_FIREBASE }));
  await context.route(/\/src\/session\.ts(\?.*)?$/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_SESSION }));
}

export async function resetStore(page: Page, extra: Record<string, string> = {}) {
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, extra);
}

/** Puts a session straight into the fake store (as if the operator had created it). */
export async function seedSession(page: Page, code = 'K7P4QX', task = 'Make a box 40 mm wide, 30 mm deep and 10 mm tall, with a 5 mm hole through the middle.') {
  await page.evaluate(({ code, task }) => {
    const db = JSON.parse(localStorage.getItem('fake-db') || '{"sessions":{},"private":{}}');
    db.sessions[code] = { schemaVersion: 3, auditor: 'P1', group: 'BLV screen-reader user', condition: 'B: OpenSCAD + Claude', screenReader: 'NVDA', task, status: 'created', createdAt: Date.now(), createdBy: 'admin@test.example' };
    db.private[code] = { notes: [], marks: [], transcript: '', measurements: [], verdict: '', finalCode: '', summary: '' };
    localStorage.setItem('fake-db', JSON.stringify(db));
  }, { code, task });
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
export async function axe(page: Page, label: string) {
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `axe on ${label}`).toEqual([]);
}

/** Tab through the page: order follows the DOM, every control reachable, visible focus ring. */
export async function checkTabOrder(page: Page, label: string) {
  await page.locator('main h1').focus();
  const seen: { key: string; index: number; ring: boolean }[] = [];
  for (let i = 0; i < 500; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const key = el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : el.id || el.outerHTML.slice(0, 80);
      return { key, index: Array.from(document.querySelectorAll('*')).indexOf(el), ring: (cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none' };
    });
    if (!info || (seen.length && info.index <= seen[seen.length - 1].index)) break;
    seen.push(info);
  }
  for (const s of seen) expect(s.ring, `${label}: focus ring on ${s.key}`).toBe(true);
  const expected = await page.evaluate(() => {
    const h1 = document.querySelector('main h1')!;
    const els = Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button:not([disabled]), main input, main select, main textarea, main summary, main [tabindex="0"]'))
      .filter((el) => h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [...new Set(els.filter((el) => el.offsetParent !== null).map((el) => (el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : el.id || el.outerHTML.slice(0, 80))))];
  });
  const keys = seen.map((s) => s.key);
  for (const e of expected) expect(keys, `${label}: ${e} reachable by Tab`).toContain(e);
}

export const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
