import { emptyAudit, type AuditData } from './types';

// In-progress answers are kept per session code, so a refresh never loses work.
const key = (code: string) => `hci-a11y-audit-v3-${code}`;

export interface Persisted { step: number; data: AuditData }

export function load(code: string): Persisted {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      return { step: p.step ?? 0, data: { ...emptyAudit(), ...p.data } };
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { step: 0, data: emptyAudit() };
}

export function save(code: string, p: Persisted) {
  try { localStorage.setItem(key(code), JSON.stringify(p)); } catch { /* ignore */ }
}

export function clear(code: string) {
  try { localStorage.removeItem(key(code)); } catch { /* ignore */ }
}
