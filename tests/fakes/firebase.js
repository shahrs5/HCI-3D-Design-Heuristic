// Test double for src/firebase.ts (served in place of it by Playwright). Not used in production.
export const firebaseConfigured = true;
const ADMIN = 'admin@test.example';
export const ADMIN_EMAILS = [ADMIN];
const listeners = new Set();
function current() {
  try { return JSON.parse(localStorage.getItem('fake-user') || 'null'); } catch { return null; }
}
function anonUid() {
  let u = sessionStorage.getItem('fake-anon');
  if (!u) { u = 'anon-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('fake-anon', u); }
  return u;
}
export const auth = () => ({ currentUser: current() });
export const db = () => ({});
export async function ensureAnonymousUser() {
  const c = current();
  if (c && !c.isAnonymous) return c;
  return { uid: anonUid(), isAnonymous: true, email: null };
}
export function watchAuth(cb) { listeners.add(cb); setTimeout(() => cb(current()), 0); return () => listeners.delete(cb); }
export async function signInWithGoogle() {
  localStorage.setItem('fake-user', JSON.stringify({ uid: 'admin-uid', email: window.__fakeEmail || ADMIN, isAnonymous: false }));
  listeners.forEach((l) => l(current()));
}
export async function signOutUser() { localStorage.removeItem('fake-user'); listeners.forEach((l) => l(null)); }
