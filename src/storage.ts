import { emptyAudit, type AuditData } from './types';

const KEY = 'hci-a11y-audit-v1';

export interface Persisted {
  step: number;
  data: AuditData;
  submittedId: string | null;
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      return { step: p.step ?? 0, data: { ...emptyAudit(), ...p.data }, submittedId: p.submittedId ?? null };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return { step: 0, data: emptyAudit(), submittedId: null };
}

export function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore (private mode / quota) */
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
