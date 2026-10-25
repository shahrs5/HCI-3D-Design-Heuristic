import { allItems, type AuditData } from './types';

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

