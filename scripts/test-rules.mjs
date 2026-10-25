// Tests deployed Firestore rules as an anonymous user (no Java/emulator needed).
// Creates documents with auditor "RULES-TEST"; delete them afterwards from the console or with
//   npx firebase firestore:delete sessions/<id>
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { readEnvFile } from './admin-emails.mjs';

const env = { ...readEnvFile(), ...process.env };
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const checklist = JSON.parse(readFileSync('src/checklist.json', 'utf8'));

const user = (await signInAnonymously(auth)).user;
const items = {};
checklist.forEach((c) => c.items.forEach((i, n) => (items[i.id] = n === 0 ? { severity: null, unclear: true, comment: '' } : { severity: n % 5, unclear: false, comment: 'test' })));
const valid = () => ({
  schemaVersion: 1, uid: user.uid, auditor: 'RULES-TEST', group: 'BLV screen-reader user', condition: 'A: OpenSCAD + ChatGPT',
  screenReader: 'NVDA', items: structuredClone(items),
  outside: [{ text: 'Rules test issue', tag: 'Other', severity: 2 }],
  verification: { answer: 'Correct', reason: '' }, submittedAt: serverTimestamp(),
});

let failed = 0;
async function expectResult(name, fn, shouldSucceed) {
  try {
    await fn();
    if (shouldSucceed) console.log(`PASS  ${name} (allowed)`);
    else { failed++; console.log(`FAIL  ${name}: was allowed but should be denied`); }
  } catch (e) {
    const denied = e.code === 'permission-denied';
    if (!shouldSucceed && denied) console.log(`PASS  ${name} (denied)`);
    else { failed++; console.log(`FAIL  ${name}: ${e.code ?? ''} ${e.message}`); }
  }
}

const ref = doc(collection(db, 'sessions'));
await expectResult('anonymous create valid session', () => setDoc(ref, valid()), true);
await expectResult('anonymous get own session', () => getDoc(ref), false);
await expectResult('anonymous list sessions', () => getDocs(collection(db, 'sessions')), false);
await expectResult('anonymous update session', () => updateDoc(ref, { auditor: 'X' }), false);
await expectResult('anonymous delete session', () => deleteDoc(ref), false);
const bad = (patch) => () => setDoc(doc(collection(db, 'sessions')), { ...valid(), ...patch });
await expectResult('reject extra field', bad({ name: 'Jane' }), false);
await expectResult('reject bad group', bad({ group: 'Other' }), false);
await expectResult('reject severity 5', bad({ items: { ...items, 'H1.2': { severity: 5, unclear: false, comment: '' } } }), false);
await expectResult('reject missing item', bad({ items: Object.fromEntries(Object.entries(items).slice(1)) }), false);
await expectResult('reject oversize comment', bad({ items: { ...items, 'H1.2': { severity: 1, unclear: false, comment: 'x'.repeat(1001) } } }), false);
await expectResult('reject bad issue tag', bad({ outside: [{ text: 'a', tag: 'Nope', severity: 1 }] }), false);
await expectResult('reject spoofed uid', bad({ uid: 'someone-else' }), false);
await expectResult('reject client timestamp', bad({ submittedAt: new Date() }), false);
console.log(`\nTest session created: sessions/${ref.id}`);
console.log(failed ? `${failed} rule test(s) FAILED` : 'All rule tests passed');
process.exit(failed ? 1 : 0);
