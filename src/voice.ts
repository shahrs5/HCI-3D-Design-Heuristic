// The page's own voice (speech synthesis) and ears (speech recognition).

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canListen = () => {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
};

let rate = 1;
export const getRate = () => rate;
export function setRate(r: number) { rate = Math.min(1.8, Math.max(0.6, Math.round(r * 10) / 10)); return rate; }

function pickVoice(): SpeechSynthesisVoice | undefined {
  const vs = window.speechSynthesis.getVoices();
  return vs.find((v) => /^en(-|_)/i.test(v.lang) && /natural|google|samantha|daniel|aria|jenny/i.test(v.name)) ?? vs.find((v) => /^en/i.test(v.lang));
}

/** Speaks text; resolves when finished (or cancelled). */
export function say(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    const v = pickVoice();
    if (v) u.voice = v;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some browsers never fire onend.
    setTimeout(finish, 1500 + (text.length * 90) / rate);
    window.speechSynthesis.speak(u);
  });
}
export function stopSpeaking() { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export interface Listening { result: Promise<{ text: string; error?: string }>; cancel: () => void }

/** Listens for one answer. Resolves with '' if nothing was heard. */
export function listen(onHeard?: (partial: string) => void): Listening {
  const w = window as unknown as Record<string, new () => Rec>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  let rec: Rec | null = null;
  let resolveFn: (v: { text: string; error?: string }) => void = () => {};
  const result = new Promise<{ text: string; error?: string }>((r) => { resolveFn = r; });
  let finalText = '';
  let error: string | undefined;
  let settled = false;
  const settle = () => { if (!settled) { settled = true; resolveFn({ text: finalText.trim(), error }); } };
  try {
    rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onHeard?.((finalText + interim).trim());
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') error = e.error; };
    rec.onend = settle;
    rec.start();
  } catch (e) {
    error = e instanceof Error ? e.message : 'could-not-start';
    settle();
  }
  return { result, cancel: () => { try { rec?.abort(); } catch { /* ignore */ } settle(); } };
}

// Short earcons so people know when the page is listening.
let ctx: AudioContext | null = null;
export function beep(kind: 'listen' | 'heard') {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = kind === 'listen' ? 880 : 660;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.linearRampToValueAtTime(0, t + 0.12);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.14);
  } catch { /* ignore */ }
}
