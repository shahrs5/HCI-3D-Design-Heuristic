import { forwardRef } from 'react';

export interface FieldError { id: string; message: string }

/** GOV.UK-style error summary. Each link moves focus to the offending field. */
export const ErrorSummary = forwardRef<HTMLDivElement, { errors: FieldError[] }>(function ErrorSummary({ errors }, ref) {
  if (errors.length === 0) return null;
  return (
    <div className="error-summary" ref={ref} tabIndex={-1} aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">
        {errors.length === 1 ? 'There is 1 problem' : `There are ${errors.length} problems`}
      </h2>
      <ul>
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                const el = document.getElementById(e.id);
                el?.focus();
                el?.scrollIntoView({ block: 'center' });
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

export function InlineError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      <strong>Error:</strong> {message}
    </p>
  );
}
