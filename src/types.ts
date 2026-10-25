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

/** Shape of a document in the Firestore `sessions` collection (see scripts/gen-rules.mjs). */
export interface StoredSession {
  schemaVersion: 2;
  uid: string;
  auditor: string;
  group: string;
  condition: string;
  screenReader: string;
  answers: Record<string, number | 'NA'>;
  comments: Record<string, string>;
  issueTexts: string[];
  issueTags: string[];
  issueSeverities: number[];
  verificationAnswer: string;
  verificationReason: string;
}

export function toStored(d: AuditData, uid: string): StoredSession {
  const answers: Record<string, number | 'NA'> = {};
  const comments: Record<string, string> = {};
  for (const i of allItems) {
    const a = d.items[i.id];
    answers[i.id] = !a || a.unclear || a.severity === null ? 'NA' : a.severity;
    comments[i.id] = (a?.comment ?? '').trim();
  }
  return {
    schemaVersion: 2,
    uid,
    auditor: d.auditor.trim(),
    group: d.group,
    condition: d.condition,
    screenReader: d.screenReader.trim(),
    answers,
    comments,
    issueTexts: d.outside.map((o) => o.text.trim()),
    issueTags: d.outside.map((o) => o.tag),
    issueSeverities: d.outside.map((o) => o.severity ?? 0),
    verificationAnswer: d.verification.answer,
    verificationReason: d.verification.reason.trim(),
  };
}

export function fromStored(s: StoredSession): AuditData {
  const items: Record<string, ItemAnswer> = {};
  for (const i of allItems) {
    const v = s.answers?.[i.id];
    items[i.id] = { severity: typeof v === 'number' ? v : null, unclear: v === 'NA', comment: s.comments?.[i.id] ?? '' };
  }
  return {
    auditor: s.auditor,
    group: s.group,
    condition: s.condition,
    screenReader: s.screenReader,
    items,
    outside: (s.issueTexts ?? []).map((text, n) => ({ key: String(n), text, tag: s.issueTags?.[n] ?? '', severity: s.issueSeverities?.[n] ?? null })),
    verification: { answer: s.verificationAnswer ?? '', reason: s.verificationReason ?? '' },
  };
}
