import type { Reply } from './agent/agent';
import { emptyModel, type Model } from './model/types';
import { loadJSON, saveJSON } from './settings';

export interface Step { model: Model; label: string; command: string }
export interface Msg {
  id: number;
  from: 'user' | 'agent';
  text: string;
  kind?: Reply['kind'] | 'help';
  notes?: string[];
  warnings?: string[];
  details?: string[];
  examples?: string[];
  source?: 'typed' | 'voice' | 'button' | 'builder';
}
export interface Project { steps: Step[]; index: number; lastTouched: number | null; messages: Msg[]; nextMsgId: number }

const KEY = 'hci3d-project-v1';

export const WELCOME: Msg = {
  id: 0,
  from: 'agent',
  kind: 'info',
  text: 'Hello. I am a design agent: I build 3D models from short commands, typed or spoken. This is a demo, so I understand a fixed set of commands. They are listed in the Help section, and I will tell you whenever I have to guess.',
  details: ['Sizes are in millimetres.', 'To start, try: add a box 40 by 30 by 10. Or: load the keychain example.', 'Say "help" at any time.'],
};

export function newProject(): Project {
  return { steps: [{ model: emptyModel(), label: 'Empty model', command: '' }], index: 0, lastTouched: null, messages: [WELCOME], nextMsgId: 1 };
}

export function loadProject(): Project {
  const p = loadJSON<Project>(KEY);
  if (p && Array.isArray(p.steps) && p.steps.length && typeof p.index === 'number') return p;
  return newProject();
}

export function saveProject(p: Project) {
  saveJSON(KEY, { ...p, messages: p.messages.slice(-300) });
}

export const PROJECT_KEY = KEY;
