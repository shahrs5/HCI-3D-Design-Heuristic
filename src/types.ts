import checklistData from './checklist.json';

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
