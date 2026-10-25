# Accessibility heuristic audit app

The data-collection instrument for our study of AI-assisted 3D design tools (OpenSCAD + an LLM) with
blind/low-vision (BLV) auditors, using our adaptation of the *Vibe Check* (W4A '26) heuristics.

The app has **two roles**, on **different pages**, linked by a **session code**:

| Who | Page | What they do |
|---|---|---|
| **Participant** (the auditor) | https://hci-a11y-audit-edc867.web.app → type the code, or `/s/CODE` | On their own computer, with their screen reader and keyboard: read the task, **Start the task**, do it in their other window (ChatGPT or Claude plus the editor, nobody types for them), come back and choose **I have finished the task**, answer the verification question, rate the 20 items, add any problems outside the checklist, then submit. The app talks to them directly. |
| **Operator** (you) | https://hci-a11y-audit-edc867.web.app/console | On your own laptop: create the session and give them the code, follow progress live, mark recording start/stop, take timestamped notes, paste the AI chat transcript, record measurements of the final model and your verdict, and export everything. |

Your notes, transcript and measurements are stored in a separate operator-only document. The
participant's browser can never read them.

## Running a session

1. Open **/console**, sign in with Google (admin list below).
2. **New session**: auditor code (not a name), group, condition, screen reader, and the task text (remembered for next time). Create.
3. The session page shows a 6-character **code** (e.g. `K7P4QX`) and a link. On the participant's computer, open
   the site and type the code (or open the link). The code has no easily confused characters (no 0/O or 1/I).
4. Watch **Progress**: joined, task started (server time), task finished, task time, submitted. The console announces each change.
5. **Mark recording started/stopped** when you start or stop your recorder (OBS, a phone…).
6. **Notes**: type and press Ctrl+Enter. Each note is stamped with the clock time and the time since the task started.
7. After the task: paste the **AI chat transcript**, open the final model, and fill in **Final model**
   (measurement rows with expected, measured, unit and match; your verdict; optionally the final OpenSCAD code and observations).
8. When they submit, their answers appear under **Participant answers**.

Other controls on the session page:
- **Unlock for another browser:** if the participant has to switch computer or browser. A session is locked to the first browser that opens it, so nobody else can answer in their place.
- **Edit session details:** the participant sees task text changes straight away, and the page announces them.
- **Delete:** you type the code to confirm.

## Data

`sessions/{CODE}` (schemaVersion 3). Created by the operator; only the progress and answer fields can be written by the participant:

| Field | Who writes it |
|---|---|
| `auditor`, `group`, `condition`, `screenReader`, `task`, `createdAt`, `createdBy` | operator |
| `participantUid`, `joinedAt`, `taskStartedAt`, `taskEndedAt`, `submittedAt`, `status` | participant (timestamps are server time and can each be set only once) |
| `answers` (item → 0–4 or `"NA"`), `comments`, `issueTexts` / `issueTags` / `issueSeverities`, `verificationAnswer`, `verificationReason` | participant, once, on submit |

`status` goes `created → joined → in_task → task_done → submitted`.

`sessions/{CODE}/private/operator` (operator only): `notes` [{at, text}], `marks` [{at, kind}],
`transcript`, `measurements` [{what, expected, measured, unit, matches}], `verdict`, `finalCode`, `summary`.

Two older test sessions from before the operator console (`RULES-TEST`, `E2E-TEST`) show as "Old format" in the
console. Delete them there if you don't want them in the exports.

## Exports (console → Sessions → Export all data)

| File | Columns |
|---|---|
| Sessions CSV | session_id, auditor, group, condition, screen_reader, status, created_at, joined_at, task_started_at, task_ended_at, task_seconds, submitted_at, verification_answer, operator_verdict, recording_started_at, recording_stopped_at, notes_count, task |
| Items CSV | session_id, auditor, group, condition, item_id, heuristic, severity, unclear, comment (submitted sessions) |
| Outside-problems and verification CSV | session_id, auditor, group, condition, issue_text, tag, severity, verification_answer, verification_reason |
| Notes CSV | session_id, auditor, time, seconds_since_task_start, note |
| Measurements CSV | session_id, auditor, what, expected, measured, unit, matches, operator_verdict |
| Everything (JSON) | all of the above plus transcripts and final code |

Times are ISO 8601 (UTC). `severity` is empty when `unclear` is `true`.

## Run locally

```bash
npm install
cp .env.example .env      # fill in from Firebase console > Project settings > Your apps
npm run dev               # http://localhost:5173 (console at /console)
```

## Edit the checklist

All rating pages are rendered from `src/checklist.json` (`{ id, heuristic, title, items: [{ id, text }] }[]`).
The Firestore rules check the exact item IDs, so after changing IDs run `npm run deploy` (it regenerates
`firestore.rules`). Groups, conditions and tags live in `src/types.ts` and `scripts/gen-rules.mjs`, so change both.

## Admin emails

`VITE_ADMIN_EMAILS=a@x.com,b@y.com` in `.env`. If it's empty, the Firebase CLI's account is used (currently
shahrs55555@gmail.com). Then run `npm run deploy`: the list is built into both the app and the rules.

## Deploy and test

```bash
npm run deploy        # rules + hosting
npm test              # UI tests: participant + console with an in-memory fake backend (never touches the database)
npm run test:rules    # 39 security-rule cases on Google's Rules test API (no writes)
npm run test:live     # one real participant run on the deployed site; creates and deletes a temporary session
```

See `ACCESSIBILITY.md` for what was and wasn't verified.
