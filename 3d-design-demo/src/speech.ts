// Voice input (Web Speech API) and optional read-aloud (speech synthesis).

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function speechInputSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startListening(handlers: { onInterim: (t: string) => void; onFinal: (t: string) => void; onError: (msg: string) => void; onEnd: () => void }): () => void {
  const w = window as unknown as Record<string, new () => Rec>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    if (interim) handlers.onInterim(final + interim);
  };
  rec.onerror = (e) => {
    const map: Record<string, string> = {
      'not-allowed': 'Microphone access was blocked. Allow the microphone for this site in your browser settings, or type your command instead.',
      'no-speech': 'I did not hear anything. Press Speak and try again.',
      'audio-capture': 'No microphone was found.',
      network: 'Voice input needs an internet connection in this browser.',
      aborted: '',
    };
    const msg = map[e.error] ?? `Voice input error: ${e.error}.`;
    if (msg) handlers.onError(msg);
  };
  rec.onend = () => { if (final.trim()) handlers.onFinal(final.trim()); handlers.onEnd(); };
  rec.start();
  return () => rec.stop();
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
