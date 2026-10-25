import { useEffect, useRef, useState } from 'react';
import { useAnnounce } from './Announcer';
import { ErrorSummary, type FieldError } from './ErrorSummary';
import { CODE_RE, normalizeCode } from './session';
import { navigate } from './nav';

export default function Landing() {
  const announce = useAnnounce();
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { document.title = 'Accessibility audit – enter your session code'; }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!CODE_RE.test(c)) {
      const err = [{ id: 'code', message: 'Enter the 6-character session code the researcher gave you, for example K7P4QX' }];
      setErrors(err);
      announce(err[0].message);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    navigate(`/s/${c}`);
  };
  return (
    <>
      <h1 tabIndex={-1}>Accessibility audit</h1>
      <p>Welcome. The researcher will give you a 6-character session code. Type it below to open your session.</p>
      <ErrorSummary ref={summary} errors={errors} />
      <form noValidate onSubmit={submit}>
        <div className={`field${errors.length ? ' has-error' : ''}`}>
          <label htmlFor="code">Session code</label>
          <p id="code-hint" className="hint">Letters and numbers, for example K7P4QX. Capitals don't matter.</p>
          {errors.length > 0 && <p id="code-error" className="field-error"><strong>Error:</strong> {errors[0].message}</p>}
          <input id="code" type="text" className="code-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby={`code-hint${errors.length ? ' code-error' : ''}`} aria-invalid={errors.length ? true : undefined} />
        </div>
        <button type="submit" className="primary">Open session</button>
      </form>
      <h2>For researchers</h2>
      <p><a href="/console" onClick={(e) => { e.preventDefault(); navigate('/console'); }}>Operator console</a> (sign-in required).</p>
    </>
  );
}
