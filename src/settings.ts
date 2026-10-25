import type { Detail } from './model/describe';

export interface Settings {
  detail: Detail;
  focusAfterReply: 'input' | 'reply';
  speakReplies: boolean;
  soundCues: boolean;
  pace: 'realistic' | 'instant';
  autoSendVoice: boolean;
  textSize: 100 | 125 | 150 | 200;
  theme: 'system' | 'light' | 'dark' | 'contrast';
  previewLabels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  detail: 'standard',
  focusAfterReply: 'input',
  speakReplies: false,
  soundCues: true,
  pace: 'realistic',
  autoSendVoice: true,
  textSize: 100,
  theme: 'system',
  previewLabels: true,
};

const KEY = 'hci3d-settings-v1';
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadJSON<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function saveJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}
export function removeKey(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
