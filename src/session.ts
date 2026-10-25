// Firestore operations for the two roles. See scripts/gen-rules.mjs for what each role may write.
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, ensureAnonymousUser } from './firebase';
import { emptyPrivate, type PrivateDoc, type Responses, type SessionDoc } from './types';

// Unambiguous characters (no 0/O, 1/I/L) so codes are easy to read out and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function randomCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => ALPHABET[v % ALPHABET.length]).join('');
}

const sessionRef = (code: string) => doc(db(), 'sessions', code);
const privateRef = (code: string) => doc(db(), 'sessions', code, 'private', 'operator');

function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('The server did not respond within 20 seconds. Check the internet connection.')), ms))]);
}

// ---------- operator ----------

export async function createSession(input: { auditor: string; group: string; condition: string; screenReader: string; task: string }): Promise<string> {
  const email = auth().currentUser?.email ?? '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ok = await runTransaction(db(), async (tx) => {
      const snap = await tx.get(sessionRef(code));
      if (snap.exists()) return false;
      tx.set(sessionRef(code), {
        schemaVersion: 3, ...input, status: 'created', createdAt: serverTimestamp(), createdBy: email,
      });
      return true;
    });
    if (ok) {
      await setDoc(privateRef(code), emptyPrivate());
      return code;
    }
  }
  throw new Error('Could not find a free session code. Try again.');
}

export function watchAllSessions(cb: (rows: { code: string; data: SessionDoc }[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(collection(db(), 'sessions'), (snap) => {
    const rows = snap.docs.map((d) => ({ code: d.id, data: d.data() as SessionDoc }));
    rows.sort((a, b) => (b.data.createdAt?.toMillis?.() ?? b.data.submittedAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? a.data.submittedAt?.toMillis?.() ?? 0));
    cb(rows);
  }, onError);
}

export function watchSession(code: string, cb: (s: SessionDoc | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(sessionRef(code), (snap) => cb(snap.exists() ? (snap.data() as SessionDoc) : null), onError);
}

export function watchPrivate(code: string, cb: (p: PrivateDoc) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(privateRef(code), (snap) => cb({ ...emptyPrivate(), ...(snap.data() as Partial<PrivateDoc> | undefined) }), onError);
}

export async function getPrivate(code: string): Promise<PrivateDoc> {
  const snap = await getDoc(privateRef(code));
  return { ...emptyPrivate(), ...(snap.data() as Partial<PrivateDoc> | undefined) };
}

export const savePrivate = (code: string, patch: Partial<PrivateDoc>) => setDoc(privateRef(code), patch, { merge: true });

export const updateSessionAsOperator = (code: string, patch: Partial<Record<keyof SessionDoc, unknown>>) => updateDoc(sessionRef(code), patch);

/** Lets the participant open the session on a different device or browser. */
export const unlockSession = (code: string, s: SessionDoc) =>
  updateDoc(sessionRef(code), { participantUid: null, ...(s.status === 'joined' ? { status: 'created' } : {}) });

export async function deleteSession(code: string) {
  await deleteDoc(privateRef(code)).catch(() => undefined);
  await deleteDoc(sessionRef(code));
}

export async function listAll(): Promise<{ code: string; data: SessionDoc }[]> {
  const snap = await getDocs(collection(db(), 'sessions'));
  return snap.docs.map((d) => ({ code: d.id, data: d.data() as SessionDoc }));
}

// ---------- participant ----------

export type JoinResult = { ok: true; uid: string } | { ok: false; reason: 'not-found' | 'locked' | 'legacy' | 'error'; message?: string };

export async function joinSession(code: string): Promise<JoinResult> {
  try {
    const user = await withTimeout(ensureAnonymousUser());
    const snap = await withTimeout(getDoc(sessionRef(code)));
    if (!snap.exists()) return { ok: false, reason: 'not-found' };
    const s = snap.data() as SessionDoc;
    if (s.schemaVersion !== 3) return { ok: false, reason: 'legacy' };
    if (s.participantUid && s.participantUid !== user.uid) return { ok: false, reason: 'locked' };
    if (!s.participantUid && s.status !== 'submitted') {
      await withTimeout(updateDoc(sessionRef(code), {
        participantUid: user.uid,
        ...(s.status === 'created' ? { status: 'joined' } : {}),
        ...(s.joinedAt ? {} : { joinedAt: serverTimestamp() }),
      }));
    }
    return { ok: true, uid: user.uid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/permission/i.test(msg)) return { ok: false, reason: 'locked' };
    return { ok: false, reason: 'error', message: msg };
  }
}

export const startTask = (code: string) => withTimeout(updateDoc(sessionRef(code), { status: 'in_task', taskStartedAt: serverTimestamp() }));
export const finishTask = (code: string) => withTimeout(updateDoc(sessionRef(code), { status: 'task_done', taskEndedAt: serverTimestamp() }));
export const submitResponses = (code: string, r: Responses) =>
  withTimeout(updateDoc(sessionRef(code), { ...r, status: 'submitted', submittedAt: serverTimestamp() }));
