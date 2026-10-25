# Accessibility: what was tested

## Participant view (the screen-reader user)

- One task per screen, with **Step N of 10** shown as text. On every screen change, focus moves to the `<h1>` and a polite
  live region announces "Step 3 of 10: Verification question".
- The task text is shown on the first two screens under a "The task" heading. "Start the task" and
  "I have finished the task" are ordinary buttons. Finishing asks for confirmation with a native dialog, because it can't be undone.
- While the task is running, nothing is announced automatically, so it never talks over the AI chat in their other window.
  "How long have I been working?" announces the elapsed time on request.
- Real `<fieldset>`/`<legend>` for every radio group; GOV.UK-style error summary that receives focus,
  with links to each field; inline "Error:" text (never colour alone).
- The answers are saved in the browser after every change. Reloading returns to the same step, consistent with the
  server (task started or finished).
- Failures (no network, session locked to another browser, unknown code) are explained in words, with
  a way to recover (Try again, Enter a different code).
- Landing page: one labelled code field. Lower-case and extra spaces are fine, and invalid input gets the same error pattern.

## Operator console

The same patterns throughout: labelled fields, an error summary, live-region announcements for added notes and measurements,
and "Participant update: …" announcements when the participant moves on. There's a "Jump to" list for the sections,
and every scrolling table can be reached and scrolled by keyboard.

## Automated checks (all passing)

`npm test` (Chromium, fake backend):
1. **axe-core** (WCAG 2.0, 2.1 and 2.2 A/AA plus best practice) on the landing page and its error state, the not-found and locked screens,
   every participant step including the error states, review and done, and the console: signed out, empty, new-session errors,
   a session page empty and filled, and the sessions list. No violations.
2. **Focus and announcements**: on every participant step change, the `<h1>` gets focus and the live region holds "Step N of 10: Title".
   Error summaries take focus, and adding or removing items is announced.
3. **Keyboard only**: the welcome screen, start, finish and elapsed time are all operated with the Enter key. A tab-order check on the
   welcome page, the first rating page and the console session page: the order follows the DOM, every control is reachable,
   and every control shows a visible focus ring.
4. **Live link between the roles**: a participant tab and a console tab, with the console updating and announcing progress.
   Operator notes never appear on the participant's page.
5. **Recovery**: resuming after a reload, a second browser refused, then allowed after unlocking, and a simulated network failure
   reported and retried.
6. **Reflow**: no horizontal scrolling at 320 px and 640 px for participant pages, and at 320 px for the console.

Also: `npm run test:rules` (39 security cases) and `npm run test:live` (a real participant run on the deployed site).

## Not verified

- **Real screen readers** (NVDA, JAWS, VoiceOver): how announcements sound, and whether the focused `<h1>` plus the live region
  is read twice. Please pilot the participant view with NVDA + Firefox/Chrome and VoiceOver + Safari before real sessions.
- Browsers other than Chromium, and real browser zoom (only approximated by viewport width).
- **Google sign-in on the console**: the tests use a fake sign-in. The real popup and admin access were not exercised here.
- The native confirm dialog on "I have finished the task" is announced by screen readers in general, but wasn't tested with each one.
