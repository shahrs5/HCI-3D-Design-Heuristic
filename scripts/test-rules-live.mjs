// End-to-end check against the DEPLOYED project as a real anonymous user (uses the real SDK).
// Creates one session with auditor "RULES-TEST" (the ID is printed). Delete it afterwards:
//   npx firebase firestore:delete sessions/<id> --force
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { readEnvFile } from './admin-emails.mjs';

setLogLevel('silent');
const env = { ...readEnvFile(), ...process.env };
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
const db = getFirestore(app);
const user = (await signInAnonymously(getAuth(app))).user;
const ids = JSON.parse(readFileSync('src/checklist.json', 'utf8')).flatMap((c) => c.items.map((i) => i.id));
const valid = () => ({
  schemaVersion: 2, uid: user.uid, auditor: 'RULES-TEST', group: 'BLV screen-reader user', condition: 'A: OpenSCAD + ChatGPT', screenReader: 'NVDA',
  answers: Object.fromEntries(ids.map((id, n) => [id, n === 0 ? 'NA' : n % 5])), comments: Object.fromEntries(ids.map((id) => [id, ''])),
  issueTexts: ['Rules test'], issueTags: ['Other'], issueSeverities: [1], verificationAnswer: 'Correct', verificationReason: '', submittedAt: serverTimestamp(),
});

let failed = 0;
async function check(name, fn, allowed) {
  let ok;
  try { await fn(); ok = allowed; } catch (e) { ok = !allowed && e.code === 'permission-denied'; if (!ok) console.log('   ', e.code, e.message); }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${allowed ? 'ALLOW' : 'DENY '} ${name}`);
}
const ref = doc(collection(db, 'sessions'));
await check('anonymous create valid session', () => setDoc(ref, valid()), true);
await check('anonymous read it back', () => getDoc(ref), false);
await check('anonymous list sessions', () => getDocs(collection(db, 'sessions')), false);
await check('anonymous update', () => updateDoc(ref, { auditor: 'X' }), false);
await check('anonymous delete', () => deleteDoc(ref), false);
await check('anonymous create with extra field', () => setDoc(doc(collection(db, 'sessions')), { ...valid(), name: 'Jane' }), false);
console.log(`\nCreated sessions/${ref.id} (auditor RULES-TEST)`);
console.log(failed ? `${failed} FAILED` : 'All live checks passed');
process.exit(failed ? 1 : 0);
