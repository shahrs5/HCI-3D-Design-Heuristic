// Test double for src/session.ts: an in-memory "Firestore" kept in localStorage so that two tabs
// (participant and operator) see each other's changes, like real-time listeners do.
import { auth, ensureAnonymousUser } from '/src/firebase.ts';

export const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
export const normalizeCode = (raw) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const KEY = 'fake-db';
const empty = () => ({ notes: [], marks: [], transcript: '', measurements: [], verdict: '', finalCode: '', summary: '' });
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{"sessions":{},"private":{}}'); } catch { return { sessions: {}, private: {} }; } };
const watchers = new Set();
const notify = () => watchers.forEach((w) => w());
window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
const write = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); notify(); };
const ts = (ms) => (ms == null ? null : { toDate: () => new Date(ms), toMillis: () => ms });
const TS_FIELDS = ['createdAt', 'joinedAt', 'taskStartedAt', 'taskEndedAt', 'submittedAt'];
const wrap = (d) => { if (!d) return null; const o = { ...d }; for (const k of TS_FIELDS) if (k in o) o[k] = ts(o[k]); return o; };
const delay = () => new Promise((r) => setTimeout(r, Number(localStorage.getItem('fake-delay') || 30)));
const failIf = () => { if (localStorage.getItem('fake-offline')) throw new Error('Network unavailable (simulated).'); };

export async function createSession(input) {
  await delay(); failIf();
  const db = read();
  const code = localStorage.getItem('fake-next-code') || 'K7P4QX';
  localStorage.removeItem('fake-next-code');
  db.sessions[code] = { schemaVersion: 3, ...input, status: 'created', createdAt: Date.now(), createdBy: auth().currentUser?.email };
  db.private[code] = empty();
  write(db);
  return code;
}
function watch(fn) { watchers.add(fn); setTimeout(fn, 0); return () => watchers.delete(fn); }
export const watchAllSessions = (cb) => watch(() => {
  const db = read();
  cb(Object.entries(db.sessions).map(([code, d]) => ({ code, data: wrap(d) })).sort((a, b) => (b.data.createdAt?.toMillis() ?? 0) - (a.data.createdAt?.toMillis() ?? 0)));
});
export const watchSession = (code, cb) => watch(() => cb(wrap(read().sessions[code]) ?? null));
export const watchPrivate = (code, cb) => watch(() => cb({ ...empty(), ...(read().private[code] || {}) }));
export async function getPrivate(code) { await delay(); return { ...empty(), ...(read().private[code] || {}) }; }
export async function savePrivate(code, patch) { await delay(); failIf(); const db = read(); db.private[code] = { ...(db.private[code] || empty()), ...patch }; write(db); }
export async function updateSessionAsOperator(code, patch) { await delay(); const db = read(); Object.assign(db.sessions[code], patch); write(db); }
export async function unlockSession(code, s) { await delay(); const db = read(); db.sessions[code].participantUid = null; if (s.status === 'joined') db.sessions[code].status = 'created'; write(db); }
export async function deleteSession(code) { await delay(); const db = read(); delete db.sessions[code]; delete db.private[code]; write(db); }
export async function listAll() { await delay(); return Object.entries(read().sessions).map(([code, d]) => ({ code, data: wrap(d) })); }

export async function joinSession(code) {
  await delay();
  if (localStorage.getItem('fake-offline')) return { ok: false, reason: 'error', message: 'Network unavailable (simulated).' };
  const user = await ensureAnonymousUser();
  const db = read();
  const s = db.sessions[code];
  if (!s) return { ok: false, reason: 'not-found' };
  if (s.schemaVersion !== 3) return { ok: false, reason: 'legacy' };
  if (s.participantUid && s.participantUid !== user.uid) return { ok: false, reason: 'locked' };
  if (!s.participantUid && s.status !== 'submitted') {
    s.participantUid = user.uid;
    if (s.status === 'created') s.status = 'joined';
    if (!s.joinedAt) s.joinedAt = Date.now();
    write(db);
  }
  return { ok: true, uid: user.uid };
}
async function patch(code, p) { await delay(); failIf(); const db = read(); Object.assign(db.sessions[code], p); write(db); }
export const startTask = (code) => patch(code, { status: 'in_task', taskStartedAt: Date.now() });
export const finishTask = (code) => patch(code, { status: 'task_done', taskEndedAt: Date.now() });
export const submitResponses = (code, r) => patch(code, { ...r, status: 'submitted', submittedAt: Date.now() });
