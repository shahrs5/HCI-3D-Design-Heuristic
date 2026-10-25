import { AnnouncerProvider } from './Announcer';
import Wizard from './Wizard';
import Admin from './Admin';

export default function App() {
  const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';
  return (
    <AnnouncerProvider>
      <header className="site-header">
        <p className="site-name">Accessibility heuristic audit: AI-assisted 3D design tools</p>
      </header>
      <main id="main">{isAdmin ? <Admin /> : <Wizard />}</main>
    </AnnouncerProvider>
  );
}
