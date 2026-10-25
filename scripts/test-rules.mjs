// Tests firestore.rules with the Firebase Rules test API (server-side evaluation of the LOCAL
// rules file; no Java/emulator needed and nothing is written to the database).
// Requires being logged into the Firebase CLI. Run: npm run test:rules
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { configstore } = require('firebase-tools/lib/configstore.js');
const { getAccessToken } = require('firebase-tools/lib/auth.js');
const project = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);

const src = readFileSync('firestore.rules', 'utf8');
const checklist = JSON.parse(readFileSync('src/checklist.json', 'utf8'));
const admin = (src.match(/in \["([^"]+)"/) ?? [])[1] ?? 'admin@example.com';
const time = '2026-01-01T12:00:00Z';
const path = '/databases/(default)/documents/sessions/s1';

const ids = checklist.flatMap((c) => c.items.map((i) => i.id));
const answers = Object.fromEntries(ids.map((id, n) => [id, n % 4 === 0 ? 'NA' : n % 5]));
const comments = Object.fromEntries(ids.map((id) => [id, 'c'.repeat(1000)]));
const valid = (patch = {}) => ({
  schemaVersion: 2, uid: 'anon1', auditor: 'P1', group: 'BLV screen-reader user', condition: 'B: OpenSCAD + Claude',
  screenReader: 'NVDA', answers: { ...answers }, comments: { ...comments },
  issueTexts: ['x'.repeat(2000)], issueTags: ['Tracking edits'], issueSeverities: [4],
  verificationAnswer: 'Could not tell', verificationReason: 'r', submittedAt: time, ...patch,
});
const issues = (n) => ({ issueTexts: Array(n).fill('x'.repeat(2000)), issueTags: Array(n).fill('Other'), issueSeverities: Array(n).fill(0) });
const anon = { uid: 'anon1', token: { firebase: { sign_in_provider: 'anonymous' } } };
const adminAuth = { uid: 'adm', token: { email: admin, email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const other = { uid: 'x', token: { email: 'someone@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const existing = { data: valid() };
const without = (k) => { const d = valid(); delete d[k]; return d; };
const create = (data) => ({ auth: anon, method: 'create', data });

const cases = [
  ['anonymous creates a valid session', 'ALLOW', create(valid())],
  ['anonymous creates with no outside issues', 'ALLOW', create(valid(issues(0)))],
  ['anonymous creates with 30 outside issues (max)', 'ALLOW', create(valid(issues(30)))],
  ['reject 31 outside issues', 'DENY', create(valid(issues(31)))],
  ['unauthenticated create', 'DENY', { auth: null, method: 'create', data: valid() }],
  ['anonymous get', 'DENY', { auth: anon, method: 'get', existing }],
  ['anonymous list', 'DENY', { auth: anon, method: 'list', existing }],
  ['anonymous update', 'DENY', { auth: anon, method: 'update', existing, data: valid({ auditor: 'P2' }) }],
  ['anonymous delete', 'DENY', { auth: anon, method: 'delete', existing }],
  ['non-admin Google user get', 'DENY', { auth: other, method: 'get', existing }],
  ['admin get', 'ALLOW', { auth: adminAuth, method: 'get', existing }],
  ['admin list', 'ALLOW', { auth: adminAuth, method: 'list', existing }],
  ['admin update', 'DENY', { auth: adminAuth, method: 'update', existing, data: valid({ auditor: 'P2' }) }],
  ['admin delete', 'DENY', { auth: adminAuth, method: 'delete', existing }],
  ['admin email unverified', 'DENY', { auth: { ...adminAuth, token: { ...adminAuth.token, email_verified: false } }, method: 'get', existing }],
  ['reject extra field (e.g. name)', 'DENY', create(valid({ name: 'Jane' }))],
  ['reject missing field', 'DENY', create(without('screenReader'))],
  ['reject spoofed uid', 'DENY', create(valid({ uid: 'other' }))],
  ['reject client-chosen timestamp', 'DENY', create(valid({ submittedAt: '2020-01-01T00:00:00Z' }))],
  ['reject unknown group', 'DENY', create(valid({ group: 'Other' }))],
  ['reject unknown condition', 'DENY', create(valid({ condition: 'C' }))],
  ['reject empty auditor', 'DENY', create(valid({ auditor: '' }))],
  ['reject auditor over 40 chars', 'DENY', create(valid({ auditor: 'x'.repeat(41) }))],
  ['reject screen reader over 100 chars', 'DENY', create(valid({ screenReader: 'x'.repeat(101) }))],
  ['reject severity 5', 'DENY', create(valid({ answers: { ...answers, 'H2.1': 5 } }))],
  ['reject unanswered item (null)', 'DENY', create(valid({ answers: { ...answers, 'H2.1': null } }))],
  ['reject missing item', 'DENY', create(valid({ answers: Object.fromEntries(Object.entries(answers).slice(1)) }))],
  ['reject unknown item id', 'DENY', create(valid({ answers: { ...Object.fromEntries(Object.entries(answers).slice(1)), 'H9.9': 1 } }))],
  ['reject non-string comment', 'DENY', create(valid({ comments: { ...comments, 'H2.1': ['a'] } }))],
  ['reject comments over total cap', 'DENY', create(valid({ comments: { ...comments, 'H2.1': 'x'.repeat(1001) } }))],
  ['reject bad issue tag', 'DENY', create(valid({ issueTags: ['Nope'] }))],
  ['reject empty issue text', 'DENY', create(valid({ issueTexts: [''] }))],
  // Known limitation: join() coerces numbers, so a numeric issue text is not rejected (harmless).
  ['reject issue texts over total cap', 'DENY', create(valid({ ...issues(30), issueTexts: Array(30).fill('x'.repeat(2001)) }))],
  ['reject issue severity null', 'DENY', create(valid({ issueSeverities: [null] }))],
  ['reject mismatched issue lists', 'DENY', create(valid({ issueTags: [] }))],
  ['reject bad verification answer', 'DENY', create(valid({ verificationAnswer: 'Yes' }))],
  ['reject verification reason over 2000', 'DENY', create(valid({ verificationReason: 'x'.repeat(2001) }))],
  ['reject write to another collection', 'DENY', { auth: anon, method: 'create', data: { a: 1 }, path: '/databases/(default)/documents/other/x' }],
];

const testCases = cases.map(([, expectation, c]) => ({
  expectation,
  request: { auth: c.auth, path: c.path ?? path, method: c.method, time, ...(c.data ? { resource: { data: c.data } } : {}) },
  ...(c.existing ? { resource: c.existing } : {}),
}));

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}:test`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': project },
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: src }] }, testSuite: { testCases } }),
});
const json = await res.json();
if (!res.ok) { console.error(JSON.stringify(json, null, 2)); process.exit(1); }
let failed = 0;
if (!json.testResults) { console.error(JSON.stringify(json, null, 2).slice(0, 3000)); process.exit(1); }
json.testResults.forEach((r, i) => {
  const ok = r.state === 'SUCCESS';
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${cases[i][1].padEnd(5)} ${cases[i][0]}${ok ? '' : `  ${JSON.stringify(r.debugMessages ?? r.errors ?? '')}`}`);
});
console.log(failed ? `\n${failed} of ${cases.length} rule tests FAILED` : `\nAll ${cases.length} rule tests passed`);
process.exit(failed ? 1 : 0);
