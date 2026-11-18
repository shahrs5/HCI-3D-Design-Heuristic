# Rate the 3D design tool (voice-first evaluation)

**Live:** https://hci-a11y-audit-edc867.web.app

A simple page for blind and low-vision participants to rate the AI-assisted 3D design tool they just
used. It works out of the box: no accounts, no codes, no admin page.

## How it works

1. (Optional, researcher) Open **"For the researcher"** at the bottom of the page. Enter the participant code and choose the tool they used. These are remembered on this computer.
2. The participant presses one of two big buttons:
   - **"Start: the page talks and listens"**: the page reads everything aloud and they answer out loud after a beep.
   - **"Start with my screen reader and keyboard"**: their screen reader reads each question, and they type the answer and press Enter.
3. The page says what they're evaluating ("You just used OpenSCAD with Claude…") and explains the 0–4 scale.
   It then reads the 20 statements one at a time and asks **"What would you rate it, 0 to 4?"**
   - **Answers it understands:** a number ("three"), a word ("major", "no problem", "catastrophe"), or "not sure". Common mishearings like "for" (4) and "to" (2) also work.
   - **After a rating of 2 or worse,** it asks "Would you like to say why?" and records what they say.
   - **Anytime commands:** "repeat", "explain", "go back", "slower", "faster", "pause" (or press Escape).
   - **Typed shortcuts:** 0–4, n (not sure), r (repeat), e (explain), b (back).
4. Last questions: "Did the final model match what you asked for?" (yes, no or not sure), "How did you decide?", and
   "Any other problem we didn't ask about?" (each with a 0–4 rating).
5. "Thank you, please tell the researcher you have finished."

If the microphone is blocked or there's no internet (browser speech recognition needs it), the page says so and
switches to typed answers. Progress is saved after every answer, so a reload offers "Continue where it stopped".

## Getting the results

Results are saved **in the browser on the computer used**. Open "For the researcher" (on the start or finish page):
- **Download ratings (CSV):** session_id, auditor, group, condition, item_id, heuristic, severity, unclear, comment
- **Download verification and other problems (CSV):** session_id, auditor, group, condition, issue_text, tag, severity, verification_answer, verification_reason
- **Download everything (JSON)**

Download after each session: clearing the browser's data deletes the results.

Voice answers work in **Chrome, Edge and Safari** (not Firefox). Use headphones so the microphone doesn't pick up the screen reader.

## Google Form version

If you'd rather use Google Forms, `google-form/create-form.gs` builds the same questionnaire in your Google account:
1. Go to https://script.google.com and choose **New project**.
2. Paste in the whole file and save.
3. Choose `createForm` and press **Run**, allowing the permissions it asks for.
4. The execution log shows three links: the one to send participants, the one to edit the form, and the responses spreadsheet.

The Google Form has no voice: it relies on the participant's own screen reader. It has one statement per question (no grids, which are hard to use with screen readers), one page per category, and a linked Google Sheet for results.

## Change the statements

Edit `src/checklist.json` (`{ id, heuristic, title, items: [{ id, text }] }[]`), then `npm run deploy`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # answer-understanding tests + full voice run (simulated voice) + keyboard run + axe
npm run deploy     # build and publish to Firebase Hosting
```
