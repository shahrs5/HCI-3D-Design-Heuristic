import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, getDocs, orderBy, query, type Timestamp } from 'firebase/firestore';
import { ADMIN_EMAILS, auth, db, firebaseConfigured } from './firebase';
import { useAnnounce } from './Announcer';
import { download, itemsCsv, outsideCsv, type SessionRecord } from './csv';
import type { AuditData } from './types';

type Row = SessionRecord & { submittedAt: Date | null };

export default function Admin() {
  const announce = useAnnounce();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Admin – Accessibility heuristic audit';
    if (!firebaseConfigured) {
      setReady(true);
      return;
    }
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const email = user?.email?.toLowerCase() ?? '';
  const allowed = !!user && !user.isAnonymous && ADMIN_EMAILS.includes(email);

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    announce('Loading sessions.');
    try {
      const snap = await getDocs(query(collection(db(), 'sessions'), orderBy('submittedAt', 'desc')));
      const r = snap.docs.map((d) => {
        const v = d.data() as AuditData & { submittedAt?: Timestamp };
        return { id: d.id, data: v, submittedAt: v.submittedAt ? v.submittedAt.toDate() : null };
      });
      setRows(r);
      announce(`${r.length} sessions loaded.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not load sessions: ${msg}`);
      announce('Could not load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) void loadSessions();
  }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => {
    setError('');
    try {
      await signInWithPopup(auth(), new GoogleAuthProvider());
      announce('Signed in.');
    } catch (e) {
      setError(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
      announce('Sign-in failed.');
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h1 tabIndex={-1}>Admin: submitted sessions</h1>
      {!firebaseConfigured && <p className="field-error"><strong>Error:</strong> Firebase is not configured.</p>}
      {error && <p className="field-error" role="alert"><strong>Error:</strong> {error}</p>}
      {ready && firebaseConfigured && (!user || user.isAnonymous) && (
        <>
          <p>Sign in with an approved Google account to view and download data.</p>
          <button type="button" className="primary" onClick={signIn}>Sign in with Google</button>
        </>
      )}
      {user && !user.isAnonymous && (
        <p>
          Signed in as {user.email}.{' '}
          <button type="button" onClick={() => signOut(auth()).then(() => { setRows(null); announce('Signed out.'); })}>Sign out</button>
        </p>
      )}
      {user && !user.isAnonymous && !allowed && (
        <p className="field-error"><strong>Error:</strong> This account is not on the admin list.</p>
      )}
      {allowed && (
        <>
          <h2>Downloads</h2>
          <div className="button-row">
            <button type="button" disabled={!rows?.length} onClick={() => rows && download(`all_items_${stamp}.csv`, itemsCsv(rows), 'text/csv')}>
              Download all items CSV
            </button>
            <button type="button" disabled={!rows?.length} onClick={() => rows && download(`all_outside_verification_${stamp}.csv`, outsideCsv(rows), 'text/csv')}>
              Download outside-framework and verification CSV
            </button>
            <button type="button" onClick={loadSessions} disabled={loading}>Refresh list</button>
          </div>
          <h2>Sessions</h2>
          {loading && <p>Loading…</p>}
          {rows && (
            <table>
              <caption>{rows.length} submitted sessions, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Session ID</th>
                  <th scope="col">Auditor</th>
                  <th scope="col">Group</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <th scope="row">{r.data.auditor}</th>
                    <td>{r.data.group}</td>
                    <td>{r.data.condition}</td>
                    <td>{r.submittedAt ? r.submittedAt.toLocaleString() : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
