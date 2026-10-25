# Accessibility heuristic audit app

A data-collection tool for scoring AI-assisted 3D design tools (OpenSCAD + an LLM) against an
adapted *Vibe Check* (W4A '26) heuristic framework. Auditors are blind/low-vision screen-reader
users and blindfolded sighted pilots, so the app is screen-reader and keyboard first.

- Auditor app: https://hci-a11y-audit-edc867.web.app
- Admin page: https://hci-a11y-audit-edc867.web.app/admin
- Firebase project: `hci-a11y-audit-edc867` (Firestore in `asia-south1`, Hosting, Anonymous + Google Auth)

Stack: Vite + React + TypeScript, plain semantic HTML/CSS, Firebase (Firestore, Auth, Hosting).

## Run locally

```bash
npm install
cp .env.example .env      # then fill in the values (Firebase console > Project settings > Your apps)
npm run dev               # http://localhost:5173  (admin: http://localhost:5173/admin)
```

In-progress answers are kept in `localStorage` (key `hci-a11y-audit-v1`), so a refresh never loses work.
"Start new session" clears it after a confirmation dialog.

## Deploy

```bash
npx firebase login        # once; on a headless machine: npx firebase login --no-localhost
npm run deploy            # regenerates rules, builds, deploys hosting + Firestore rules
```

`firebase.json` also declares the auth providers (anonymous + Google). Deploy them with
`npx firebase deploy --only auth` if you set up a new project.

## Edit the checklist

All heuristic screens are rendered from `src/checklist.json`:

```json
[{ "id": "H1", "heuristic": "H1", "title": "Agent Interface",
   "items": [{ "id": "H1.1", "text": "..." }] }]
```

Add, remove or reword items there. The Firestore rules check the exact list of item IDs, so after
changing IDs **redeploy** (`npm run deploy` regenerates `firestore.rules` from the checklist).
Changing only the text needs no rules change, but redeploy the app.
Other fixed options (groups, conditions, tags, severity labels) are in `src/types.ts`. If you change
them, update the matching lists in `scripts/gen-rules.mjs`, too.

## Configure admin emails

Set a comma-separated list in `.env`:

```
VITE_ADMIN_EMAILS=alice@example.com,bob@example.com
```

If it is empty, the email of the account logged into the Firebase CLI is used (currently
`shahrs55555@gmail.com`). The list is baked into both the app and `firestore.rules`, so after
changing it run `npm run deploy`. Only these Google accounts (with verified emails) can read data.
The Firestore rules enforce this, not just the UI.

## Data

Each submission is one document in the `sessions` collection (ID = the session ID shown to the
auditor). Documents can be created by any signed-in user (auditors get anonymous auth) but never
updated or deleted from the app. Shape (`schemaVersion: 2`):

| field | value |
|---|---|
| `auditor`, `group`, `condition`, `screenReader` | session setup (no personal data) |
| `answers` | `{ "H1.1": 0-4 or "NA", ... }` with every checklist item, `"NA"` = Unclear / N/A |
| `comments` | `{ "H1.1": "text", ... }` (may be empty strings) |
| `issueTexts`, `issueTags`, `issueSeverities` | parallel lists of outside-framework issues (max 30) |
| `verificationAnswer`, `verificationReason` | verification question |
| `uid`, `submittedAt` | anonymous user ID, server timestamp |

The flat shape is deliberate: Firestore rules may evaluate at most 1000 expressions per request,
and validating 20 nested item objects plus 30 nested issue objects exceeds that. Flat maps/lists can be
validated with `keys()`, `values().hasOnly()` and `join()` at constant cost. Trade-off: the rules
enforce *total* comment/issue-text size caps (20×1000 and 30×2000 characters), while per-field limits
(1000/2000) are enforced by the app's `maxlength`. `join()` also coerces numbers, so a hand-crafted
request could store a number as an issue text (harmless; exported as text).

### CSV structure

The admin page offers two combined downloads; the confirmation screen offers the same two files for
a single session, plus JSON.

**Items CSV**: one row per session × checklist item:

`session_id, auditor, group, condition, item_id, heuristic, severity, unclear, comment`

`severity` is 0–4, or empty when `unclear` is `true` (Unclear / N/A).

**Outside-framework and verification CSV**: one row per outside-framework issue (one row with
empty issue fields if the session has none), with the verification answer repeated on each row:

`session_id, auditor, group, condition, issue_text, tag, severity, verification_answer, verification_reason`

All cells are quoted; cells starting with `= + - @` are prefixed with `'` to stop spreadsheet formula injection.

## Tests

```bash
npx playwright test                    # accessibility (axe + keyboard + focus + reflow) and CSV tests
npm run test:rules                     # 38 Firestore rule cases via the Firebase Rules test API (no writes)
npm run test:rules:live                # real anonymous user against the deployed project (writes 1 RULES-TEST doc)
E2E_URL=https://hci-a11y-audit-edc867.web.app npx playwright test e2e-live   # submits 1 E2E-TEST session
```

The Firestore emulator needs Java, which this machine doesn't have, so `test:rules` evaluates the local rules file
on Google's Rules test API instead (you need to be logged into the Firebase CLI).
See `ACCESSIBILITY.md` for what was and wasn't verified.
