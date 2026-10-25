import { allItems, type AuditData, type PrivateDoc, type SessionDoc, type TS } from './types';

export const ITEM_COLUMNS = ['session_id', 'auditor', 'group', 'condition', 'item_id', 'heuristic', 'severity', 'unclear', 'comment'];
export const OUTSIDE_COLUMNS = ['session_id', 'auditor', 'group', 'condition', 'issue_text', 'tag', 'severity', 'verification_answer', 'verification_reason'];

export interface SessionRecord { id: string; data: AuditData }

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(columns: string[], rows: unknown[][]) {
  return [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function itemsCsv(sessions: SessionRecord[]) {
  const rows: unknown[][] = [];
  for (const { id, data } of sessions) {
    for (const item of allItems) {
      const a = data.items?.[item.id];
      rows.push([id, data.auditor, data.group, data.condition, item.id, item.heuristic,
        a && !a.unclear && a.severity !== null ? a.severity : '', a?.unclear ? 'true' : 'false', a?.comment ?? '']);
    }
  }
  return toCsv(ITEM_COLUMNS, rows);
}

export function outsideCsv(sessions: SessionRecord[]) {
  const rows: unknown[][] = [];
  for (const { id, data } of sessions) {
    const base = [id, data.auditor, data.group, data.condition];
    const v = [data.verification?.answer ?? '', data.verification?.reason ?? ''];
    const issues = data.outside ?? [];
    if (issues.length === 0) rows.push([...base, '', '', '', ...v]);
    for (const i of issues) rows.push([...base, i.text, i.tag, i.severity ?? '', ...v]);
  }
  return toCsv(OUTSIDE_COLUMNS, rows);
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- operator exports ----------

export interface FullRecord { code: string; session: SessionDoc; priv: PrivateDoc }

const iso = (t?: TS | null) => (t ? t.toDate().toISOString() : '');
const ms = (t?: TS | null) => (t ? t.toMillis() : NaN);

export const SESSION_COLUMNS = ['session_id', 'auditor', 'group', 'condition', 'screen_reader', 'status', 'created_at', 'joined_at', 'task_started_at', 'task_ended_at', 'task_seconds', 'submitted_at', 'verification_answer', 'operator_verdict', 'recording_started_at', 'recording_stopped_at', 'notes_count', 'task'];
export function sessionsCsv(rows: FullRecord[]) {
  return toCsv(SESSION_COLUMNS, rows.map(({ code, session: s, priv: p }) => {
    const secs = (ms(s.taskEndedAt) - ms(s.taskStartedAt)) / 1000;
    const start = p.marks.find((m) => m.kind === 'recording_started');
    const stop = [...p.marks].reverse().find((m) => m.kind === 'recording_stopped');
    return [code, s.auditor, s.group, s.condition, s.screenReader, s.status ?? 'legacy', iso(s.createdAt), iso(s.joinedAt), iso(s.taskStartedAt), iso(s.taskEndedAt),
      Number.isFinite(secs) ? Math.round(secs) : '', iso(s.submittedAt), s.verificationAnswer ?? '', p.verdict,
      start ? new Date(start.at).toISOString() : '', stop ? new Date(stop.at).toISOString() : '', p.notes.length, s.task ?? ''];
  }));
}

export const NOTE_COLUMNS = ['session_id', 'auditor', 'time', 'seconds_since_task_start', 'note'];
export function notesCsv(rows: FullRecord[]) {
  return toCsv(NOTE_COLUMNS, rows.flatMap(({ code, session: s, priv: p }) => p.notes.map((n) => {
    const since = (n.at - ms(s.taskStartedAt)) / 1000;
    return [code, s.auditor, new Date(n.at).toISOString(), Number.isFinite(since) ? Math.round(since) : '', n.text];
  })));
}

export const MEASUREMENT_COLUMNS = ['session_id', 'auditor', 'what', 'expected', 'measured', 'unit', 'matches', 'operator_verdict'];
export function measurementsCsv(rows: FullRecord[]) {
  return toCsv(MEASUREMENT_COLUMNS, rows.flatMap(({ code, session: s, priv: p }) =>
    (p.measurements.length ? p.measurements : [null]).map((m) => [code, s.auditor, m?.what ?? '', m?.expected ?? '', m?.measured ?? '', m?.unit ?? '', m?.matches ?? '', p.verdict])));
}

/** Everything, with timestamps as ISO strings. */
export function fullJson(rows: FullRecord[]) {
  const conv = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' && 'toDate' in v ? (v as TS).toDate().toISOString() : v]));
  return JSON.stringify(rows.map((r) => ({ session_id: r.code, ...conv(r.session as unknown as Record<string, unknown>), operator: r.priv })), null, 2);
}
