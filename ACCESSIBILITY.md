# Accessibility: what was tested

## Built in

- Real `<fieldset>`/`<legend>` for every radio group, `<label>` for every input, `<button>` for every
  action (no clickable divs). Each checklist item is an `<h2>` (navigable by heading), followed by a short
  legend ("Severity for H1.1") so radio announcements stay brief.
- One `aria-live="polite"` region, always in the DOM. It announces step changes ("Step 3 of 9: H2 Agent
  Operation"), validation errors, issues added/removed, submitting/failed/submitted.
- On every step change, focus moves to the step's `<h1>` and the page title updates. Progress is text
  ("Step 3 of 9").
- Validation follows the GOV.UK pattern: an error summary at the top gets focus, and each error is a link that
  moves focus to the field. Inline "Error:" messages are linked with `aria-describedby`, and the border
  plus the "Error:" text mean colour is never the only signal.
- Visible focus: 3px blue outline plus a yellow halo on every control. `forced-colors` (Windows high contrast) is supported.
- The guiding questions sit in a native `<details>`/`<summary>`.
- Native `confirm()` before clearing data, which screen readers announce as a dialog.
- Note: the wizard has **9 steps** (setup, H1–H5, outside issues, verification, review), not 7.

## Automated checks (all passing)

`npx playwright test` (Chromium):

1. **axe-core** (WCAG 2.0/2.1/2.2 A+AA and best-practice tags) on every step, every step's error state,
   the outside-issues step empty/with errors/filled, review, confirmation, and `/admin`, with `<details>`
   expanded so hidden content is scanned. 0 violations. Also run on the deployed confirmation screen.
2. **Focus management**: after each Next/Back, `<h1>` is focused, the live region holds "Step N of 9: Title",
   and the progress text is correct. A failed Next focuses the error summary and announces the count.
   Error links focus the field.
3. **Tab order** on every step: Tab is pressed through the whole page. The order follows the DOM, every
   button/input/select/textarea/summary and every radio group is reachable, and each focused element has a
   visible outline.
4. **Keyboard-only completion**: the whole wizard is filled in with Tab, Space, arrow keys, Enter and typing
   only (no clicks), including opening `<details>` and adding an issue.
5. **Live-region messages** for add/remove issue, and focus moving to the new issue's description, or back to
   "Add another issue" after removal.
6. **Reflow**: no horizontal scrolling at 640px (≈200% zoom) and 320px (≈400% zoom) on any step.
7. **Persistence**: answers survive a page reload. "Start new session" clears them after confirmation.
8. **Contrast**: covered by axe's color-contrast rule (text ≥ 4.5:1). The palette is near-black on white,
   error red #b00020 (≈6.6:1), link/button blue #0b4fb3 (≈7:1).

## Not verified (needs people / real assistive tech)

- **Real screen readers.** Nothing was tested with NVDA, JAWS, VoiceOver or TalkBack. Automated tests can't
  confirm how announcements actually sound, whether the live-region message and the focused `<h1>` are both
  read (some screen readers may say the step title twice), or how verbose the long item headings feel. A
  quick pilot with NVDA + Firefox/Chrome and VoiceOver + Safari is strongly recommended before real sessions.
- **Browsers other than Chromium** (Firefox, Safari) and mobile screen readers.
- **Real browser zoom at 200%** and OS text-size settings: only approximated by viewport width.
- **Focus-ring contrast** (the ≥3:1 non-text contrast of the outline) was chosen by hand, not measured by a tool.
- **Google sign-in popup on /admin**: the popup is Google's own UI, and I couldn't sign in as the admin from
  here, so the signed-in admin table and the combined CSV download were only verified through unit tests of the
  CSV/data conversion, not clicked through live.
- **Cognitive load / plain-language** quality of the checklist wording (that's a research question for the study).
