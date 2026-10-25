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

const ids = checklist.flatMap((c) => c.items.map((i) => i.id));
const answers = Object.fromEntries(ids.map((id, n) => [id, n % 4 === 0 ? 'NA' : n % 5]));
const comments = Object.fromEntries(ids.map((id) => [id, 'c'.repeat(1000)]));
const T0 = '2026-01-01T10:00:00Z';
const path = '/databases/(default)/documents/sessions/K7P4QX';
const privPath = path + '/private/operator';

const anon = { uid: 'u1', token: { firebase: { sign_in_provider: 'anonymous' } } };
const anon2 = { uid: 'u2', token: { firebase: { sign_in_provider: 'anonymous' } } };
const adminAuth = { uid: 'adm', token: { email: admin, email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const other = { uid: 'x', token: { email: 'someone@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };

const created = { schemaVersion: 3, auditor: 'P1', group: 'BLV screen-reader user', condition: 'B: OpenSCAD + Claude', screenReader: 'NVDA', task: 'Make a 40 by 30 by 10 mm box with a 5 mm hole.', status: 'created', createdAt: T0, createdBy: admin };
const newSession = { ...created, createdAt: time };
const joined = { ...created, participantUid: 'u1', status: 'joined', joinedAt: T0 };
const inTask = { ...joined, status: 'in_task', taskStartedAt: T0 };
const taskDone = { ...inTask, status: 'task_done', taskEndedAt: T0 };
const responses = {
  answers: { ...answers }, comments: { ...comments },
  issueTexts: ['x'.repeat(2000)], issueTags: ['Tracking edits'], issueSeverities: [4],
  verificationAnswer: 'Could not tell', verificationReason: 'r',
};
const submitted = { ...taskDone, ...responses, status: 'submitted', submittedAt: T0 };
const upd = (auth, existing, data) => ({ auth, method: 'update', existing: { data: existing }, data });

const cases = [
  ['operator creates a session', 'ALLOW', { auth: adminAuth, method: 'create', data: newSession }],
  ['anonymous cannot create a session', 'DENY', { auth: anon, method: 'create', data: newSession }],
  ['other Google user cannot create', 'DENY', { auth: other, method: 'create', data: newSession }],
  ['create rejects extra field', 'DENY', { auth: adminAuth, method: 'create', data: { ...newSession, name: 'Jane' } }],
  ['create rejects unknown group', 'DENY', { auth: adminAuth, method: 'create', data: { ...newSession, group: 'X' } }],
  ['create rejects client timestamp', 'DENY', { auth: adminAuth, method: 'create', data: { ...newSession, createdAt: '2020-01-01T00:00:00Z' } }],
  ['participant can read a session with its code', 'ALLOW', { auth: anon, method: 'get', existing: { data: created } }],
  ['signed-out user cannot read', 'DENY', { auth: null, method: 'get', existing: { data: created } }],
  ['participant cannot list sessions', 'DENY', { auth: anon, method: 'list', existing: { data: created } }],
  ['operator lists sessions', 'ALLOW', { auth: adminAuth, method: 'list', existing: { data: created } }],
  ['participant joins', 'ALLOW', upd(anon, created, { ...joined, joinedAt: time })],
  ['second device cannot take over a joined session', 'DENY', upd(anon2, joined, { ...joined, participantUid: 'u2' })],
  ['participant starts the task', 'ALLOW', upd(anon, joined, { ...inTask, taskStartedAt: time })],
  ['start time must be server time', 'DENY', upd(anon, joined, { ...inTask, taskStartedAt: '2020-01-01T00:00:00Z' })],
  ['cannot re-start the task', 'DENY', upd(anon, inTask, { ...inTask, taskStartedAt: time })],
  ['cannot be in_task without a start time', 'DENY', upd(anon, joined, { ...joined, status: 'in_task' })],
  ['participant finishes the task', 'ALLOW', upd(anon, inTask, { ...taskDone, taskEndedAt: time })],
  ['participant cannot change operator fields', 'DENY', upd(anon, inTask, { ...inTask, auditor: 'P9' })],
  ['participant cannot change the task text', 'DENY', upd(anon, inTask, { ...inTask, task: 'easier task' })],
  ['answers cannot be written before submitting', 'DENY', upd(anon, taskDone, { ...taskDone, ...responses })],
  ['participant submits', 'ALLOW', upd(anon, taskDone, { ...submitted, submittedAt: time })],
  ['submit with 30 issues (max)', 'ALLOW', upd(anon, taskDone, { ...submitted, submittedAt: time, issueTexts: Array(30).fill('x'), issueTags: Array(30).fill('Other'), issueSeverities: Array(30).fill(0) })],
  ['submit rejects 31 issues', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, issueTexts: Array(31).fill('x'), issueTags: Array(31).fill('Other'), issueSeverities: Array(31).fill(0) })],
  ['cannot submit before finishing the task', 'DENY', upd(anon, inTask, { ...inTask, ...responses, status: 'submitted', submittedAt: time })],
  ['submit rejects severity 5', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, answers: { ...answers, 'H2.1': 5 } })],
  ['submit rejects missing item', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, answers: Object.fromEntries(Object.entries(answers).slice(1)) })],
  ['submit rejects bad tag', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, issueTags: ['Nope'] })],
  ['submit rejects bad verification answer', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, verificationAnswer: 'Yes' })],
  ['submit rejects oversize comments', 'DENY', upd(anon, taskDone, { ...submitted, submittedAt: time, comments: { ...comments, 'H2.1': 'x'.repeat(1001) } })],
  ['no changes after submitting', 'DENY', upd(anon, submitted, { ...submitted, verificationAnswer: 'Correct' })],
  ['participant cannot delete', 'DENY', { auth: anon, method: 'delete', existing: { data: created } }],
  ['operator can edit a session (e.g. unlock device)', 'ALLOW', upd(adminAuth, joined, { ...joined, participantUid: null, status: 'created' })],
  ['operator can delete a session', 'ALLOW', { auth: adminAuth, method: 'delete', existing: { data: created } }],
  ['participant cannot read operator notes', 'DENY', { auth: anon, method: 'get', path: privPath, existing: { data: { notes: [] } } }],
  ['participant cannot write operator notes', 'DENY', { auth: anon, method: 'create', path: privPath, data: { notes: [] } }],
  ['operator reads notes', 'ALLOW', { auth: adminAuth, method: 'get', path: privPath, existing: { data: { notes: [] } } }],
  ['operator writes notes', 'ALLOW', { auth: adminAuth, method: 'update', path: privPath, existing: { data: { notes: [] } }, data: { notes: [{ at: 1, text: 'n' }] } }],
  ['legacy (v2) documents are read-only for participants', 'DENY', upd(anon, { schemaVersion: 2, status: 'x' }, { schemaVersion: 2, status: 'joined', participantUid: 'u1', joinedAt: time })],
  ['other collections are closed', 'DENY', { auth: anon, method: 'create', data: { a: 1 }, path: '/databases/(default)/documents/other/x' }],
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
