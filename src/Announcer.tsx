import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useAnnounce = () => useContext(Ctx);

/** A single polite live region that is always in the DOM. */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const announce = useCallback((m: string) => {
    // Clear first so that repeating the same message is announced again.
    setMsg('');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(m), 100);
  }, []);
  return (
    <Ctx.Provider value={announce}>
      {children}
      <div id="live-region" className="visually-hidden" aria-live="polite" aria-atomic="true">
        {msg}
      </div>
    </Ctx.Provider>
  );
}
