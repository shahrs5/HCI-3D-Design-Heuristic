import { useEffect, useState } from 'react';
import { AnnouncerProvider } from './Announcer';
import Landing from './Landing';
import Participant from './Participant';
import { ConsoleHome, ConsoleSession } from './Console';

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const fn = () => { setPath(window.location.pathname); window.scrollTo(0, 0); };
    window.addEventListener('popstate', fn);
    return () => window.removeEventListener('popstate', fn);
  }, []);
  return path.replace(/\/+$/, '') || '/';
}

export default function App() {
  const path = usePath();
  let page: React.ReactNode;
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/s\/([A-Za-z0-9]{6})$/))) page = <Participant key={m[1]} code={m[1].toUpperCase()} />;
  else if ((m = path.match(/^\/console\/([A-Za-z0-9]{6,20})$/))) page = <ConsoleSession key={m[1]} code={m[1]} />;
  else if (path === '/console' || path === '/admin') page = <ConsoleHome />;
  else page = <Landing />;
  const isConsole = path.startsWith('/console') || path === '/admin';

  // Move focus to the new page's heading after client-side navigation.
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) {
      requestAnimationFrame(() => (document.querySelector('main h1') as HTMLElement | null)?.focus());
    }
  }, [path]);

  return (
    <AnnouncerProvider>
      <header className="site-header">
        <p className="site-name">{isConsole ? 'Accessibility audit: operator console' : 'Accessibility audit: AI-assisted 3D design tools'}</p>
      </header>
      <main id="main" className={isConsole ? 'wide-main' : undefined}>{page}</main>
    </AnnouncerProvider>
  );
}
