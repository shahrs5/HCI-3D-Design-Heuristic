import { emptyAudit, type AuditData } from './types';

// Everything is stored in this browser, so the page works out of the box with no accounts or server.
const PROGRESS = 'hci-eval-progress-v1';
const DONE = 'hci-eval-done-v1';
const SETUP = 'hci-eval-setup-v1';

export interface Setup { participant: string; tool: string; group: string }
export interface Progress { id: string; startedAt: string; pos: number; mode: 'voice' | 'keyboard'; data: AuditData }
export interface Completed { id: string; startedAt: string; finishedAt: string; mode: 'voice' | 'keyboard'; data: AuditData }

const get = <T,>(k: string): T | null => { try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : null; } catch { return null; } };
const set = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const loadSetup = (): Setup => ({ participant: '', tool: '', group: '', ...(get<Setup>(SETUP) ?? {}) });
export const saveSetup = (s: Setup) => set(SETUP, s);
export const loadProgress = () => get<Progress>(PROGRESS);
export const saveProgress = (p: Progress) => set(PROGRESS, p);
export const clearProgress = () => { try { localStorage.removeItem(PROGRESS); } catch { /* ignore */ } };
export const listCompleted = () => get<Completed[]>(DONE) ?? [];
export const addCompleted = (c: Completed) => set(DONE, [...listCompleted(), c]);
export const newId = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6);
export const freshData = (s: Setup): AuditData => ({ ...emptyAudit(), auditor: s.participant.trim(), group: s.group, condition: s.tool });
