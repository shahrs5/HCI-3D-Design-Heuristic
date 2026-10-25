import checklistData from './checklist.json' with { type: 'json' };

export interface ChecklistItem { id: string; text: string }
export interface ChecklistCategory { id: string; heuristic: string; title: string; items: ChecklistItem[] }

export const checklist = checklistData as ChecklistCategory[];
export const allItems = checklist.flatMap((c) => c.items.map((i) => ({ ...i, heuristic: c.heuristic })));

export const GROUPS = ['Sighted pilot (blindfolded)', 'BLV screen-reader user'] as const;
export const CONDITIONS = ['A: OpenSCAD + ChatGPT', 'B: OpenSCAD + Claude'] as const;
export const TAGS = ['Verifying spatial output', 'Describing spatial relations', 'Tracking edits', 'Other'] as const;
export const VERIFICATION_ANSWERS = ['Correct', 'Incorrect', 'Could not tell'] as const;

export const SEVERITY_LABELS = [
  'Not an accessibility problem',
  'Cosmetic problem only',
  'Minor accessibility problem (low priority)',
  'Major accessibility problem (high priority)',
  'Accessibility catastrophe (must be fixed first)',
] as const;

export const GUIDING_QUESTIONS = [
  { name: 'Frequency', text: 'How often does the problem occur?' },
  { name: 'Impact', text: 'How difficult is it for users to overcome the problem?' },
  { name: 'Persistence', text: 'Will this problem continuously trouble users once encountered?' },
];

export const LIMITS = { short: 40, screenReader: 100, comment: 1000, issue: 2000, reason: 2000, maxIssues: 30 };

/** Answer for one checklist item. severity null + unclear true = "Unclear / N/A". */
export interface ItemAnswer { severity: number | null; unclear: boolean; comment: string }
export interface OutsideIssue { key: string; text: string; tag: string; severity: number | null }

export interface AuditData {
  auditor: string;
  group: string;
  condition: string;
  screenReader: string;
  items: Record<string, ItemAnswer>;
  outside: OutsideIssue[];
  verification: { answer: string; reason: string };
}

export const emptyAudit = (): AuditData => ({
  auditor: '',
  group: '',
  condition: '',
  screenReader: '',
  items: {},
  outside: [],
  verification: { answer: '', reason: '' },
});

export function isAnswered(a: ItemAnswer | undefined) {
  return !!a && (a.unclear || a.severity !== null);
}

/** Participant answers as stored in Firestore (flat, so the security rules can validate them cheaply). */
export interface Responses {
  answers: Record<string, number | 'NA'>;
  comments: Record<string, string>;
  issueTexts: string[];
  issueTags: string[];
  issueSeverities: number[];
  verificationAnswer: string;
  verificationReason: string;
}

export type SessionStatus = 'created' | 'joined' | 'in_task' | 'task_done' | 'submitted';
export const STATUS_TEXT: Record<SessionStatus, string> = {
  created: 'Waiting for the participant to open the link',
  joined: 'Participant has the session open',
  in_task: 'Participant is doing the task',
  task_done: 'Task finished; participant is answering questions',
  submitted: 'Submitted',
};

/** sessions/{code} (schemaVersion 3). Timestamps are Firestore Timestamps (or null). */
export interface TS { toDate(): Date; toMillis(): number }
export interface SessionDoc extends Partial<Responses> {
  schemaVersion: number;
  auditor: string;
  group: string;
  condition: string;
  screenReader: string;
  task: string;
  status: SessionStatus;
  createdAt?: TS | null;
  createdBy?: string;
  participantUid?: string | null;
  joinedAt?: TS | null;
  taskStartedAt?: TS | null;
  taskEndedAt?: TS | null;
  submittedAt?: TS | null;
}

export interface Note { at: number; text: string }
export interface Mark { at: number; kind: 'recording_started' | 'recording_stopped' }
export interface Measurement { key: string; what: string; expected: string; measured: string; unit: string; matches: '' | 'Yes' | 'Partly' | 'No' }
/** sessions/{code}/private/operator: operator-only data, never shown to the participant. */
export interface PrivateDoc {
  notes: Note[];
  marks: Mark[];
  transcript: string;
  measurements: Measurement[];
  verdict: '' | 'Correct' | 'Partly correct' | 'Incorrect';
  finalCode: string;
  summary: string;
}
export const emptyPrivate = (): PrivateDoc => ({ notes: [], marks: [], transcript: '', measurements: [], verdict: '', finalCode: '', summary: '' });

export function toResponses(d: AuditData): Responses {
  const answers: Record<string, number | 'NA'> = {};
  const comments: Record<string, string> = {};
  for (const i of allItems) {
    const a = d.items[i.id];
    answers[i.id] = !a || a.unclear || a.severity === null ? 'NA' : a.severity;
    comments[i.id] = (a?.comment ?? '').trim();
  }
  return {
    answers,
    comments,
    issueTexts: d.outside.map((o) => o.text.trim()),
    issueTags: d.outside.map((o) => o.tag),
    issueSeverities: d.outside.map((o) => o.severity ?? 0),
    verificationAnswer: d.verification.answer,
    verificationReason: d.verification.reason.trim(),
  };
}

/** Rebuilds form data from a stored session (works for v2 and v3 documents). */
export function fromSession(s: Partial<SessionDoc>): AuditData {
  const items: Record<string, ItemAnswer> = {};
  for (const i of allItems) {
    const v = s.answers?.[i.id];
    items[i.id] = { severity: typeof v === 'number' ? v : null, unclear: v === 'NA', comment: s.comments?.[i.id] ?? '' };
  }
  return {
    auditor: s.auditor ?? '',
    group: s.group ?? '',
    condition: s.condition ?? '',
    screenReader: s.screenReader ?? '',
    items,
    outside: (s.issueTexts ?? []).map((text, n) => ({ key: String(n), text, tag: s.issueTags?.[n] ?? '', severity: s.issueSeverities?.[n] ?? null })),
    verification: { answer: s.verificationAnswer ?? '', reason: s.verificationReason ?? '' },
  };
}

export function fmtTime(ts?: TS | null | number): string {
  if (ts === null || ts === undefined) return '';
  const d = typeof ts === 'number' ? new Date(ts) : ts.toDate();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDuration(ms: number): string {
  if (!(ms >= 0)) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}
