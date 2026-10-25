# Accessibility Heuristics for AI-Assisted 3D Design Tools

A university HCI research project. We adapt the *Vibe Check* heuristic evaluation framework
(Madan, Surabiyil Bindu & Potluri, W4A '26) from AI coding tools to **AI-assisted 3D design
tools** (OpenSCAD + an LLM). Then we test whether **blind and low-vision (BLV) people** can use
those tools, and whether they can rate them reliably with the heuristics.

This repository has two web apps, both built for screen-reader and keyboard users first:

| App | What it is | Live |
|---|---|---|
| [**evaluation-app**](evaluation-app) | **"Rate the 3D design tool"**: a voice-first questionnaire. It tells the participant what they are evaluating, reads the 20 heuristic statements one at a time, and asks *"What would you rate it, 0 to 4?"* They answer by speaking or typing. | https://hci-a11y-audit-edc867.web.app |
| [**3d-design-demo**](3d-design-demo) | **"3D Design Agent"**: a prototype conversational 3D design tool designed *to follow* the heuristics. You describe a model in plain words, typed or spoken, and the agent builds it as OpenSCAD and describes it back. No real AI: a rule-based agent understands a fixed set of commands. | https://hci-3d-design-demo.web.app |

## How they fit together in a session

1. The participant does a fixed design task with a tool (OpenSCAD + ChatGPT, OpenSCAD + Claude, or our demo), using their own screen reader.
2. They then open the **evaluation app** and choose **"Start: the page talks and listens"**. It explains the 0–4 severity scale and asks about each statement.
   They can say *repeat*, *explain*, *go back*, *slower*, *faster* or *pause* at any time. If the problem was a 2 or higher, it asks *"Would you like to say why?"*
3. It ends with three questions: *"Did the final model match what you asked for?"*, *"How did you decide?"* and *"Any other problem we didn't ask about?"*
4. The researcher downloads the answers as CSV from **"For the researcher"** at the bottom of the page. Answers are stored in that browser; no accounts or server are needed.

## The heuristics (20 statements, 5 categories)

| Category | Asks whether… |
|---|---|
| **H1 Agent Interface** | the agent's replies, labels, model previews and status are all perceivable without sight |
| **H2 Agent Operation** | the user is told when the agent works, what it changed (parts, dimensions), the history of edits, and when it did something different from what was asked |
| **H3 User Operation** | everything works by keyboard, navigation is predictable, focus lands sensibly, and the agent can be interrupted |
| **H4 Help & Recovery** | errors are announced, edits can be undone, the model can be checked non-visually (dimensions, part lists), and help is screen-reader friendly |
| **H5 Adaptability** | it works with the user's screen reader, detail can be adjusted, output can be inspected in several non-visual ways, and settings persist |

Full wording: [`evaluation-app/src/checklist.json`](evaluation-app/src/checklist.json). How the demo addresses each item: [`3d-design-demo/HEURISTICS.md`](3d-design-demo/HEURISTICS.md).
Severity scale (unchanged from Vibe Check): 0 not a problem · 1 cosmetic · 2 minor · 3 major · 4 catastrophe; plus "not sure / N/A".

## Run locally

Requires Node.js 20+.

```bash
cd evaluation-app      # or: cd 3d-design-demo
npm install
npm run dev            # open the printed localhost URL
npm test               # automated tests (Playwright + axe-core); first run: npx playwright install chromium
```

Voice features use the browser's Web Speech API: use **Chrome, Edge or Safari** (Firefox has no speech recognition), and headphones so the microphone doesn't hear the screen reader.

## Accessibility testing

Both apps are tested automatically with Playwright and axe-core: WCAG 2.0, 2.1 and 2.2 A/AA plus best practice, with no violations.
The tests also cover keyboard-only use, focus management, live-region announcements, reflow at 320 px, and full runs with a simulated voice.
Details and known gaps (most importantly, **not yet tested with real screen readers or real users**):
[`evaluation-app/ACCESSIBILITY.md`](evaluation-app/ACCESSIBILITY.md) and [`3d-design-demo/README.md`](3d-design-demo/README.md#not-verified).

## Repository layout

```
evaluation-app/    voice-first rating questionnaire (Vite + React + TypeScript)
3d-design-demo/    accessible conversational 3D design prototype (Vite + React + TypeScript + three.js)
```

Each app has its own README with details, and deploys to Firebase Hosting with `npm run deploy`.

## Team

Ateeb (29010) · Ameer Hamza (28308) · Shaheer Shahid (29053)

## Acknowledgements

Based on *Vibe Check: Accessibility Heuristics for Vibe Coding Interfaces*, Madan, Surabiyil Bindu & Potluri, W4A '26.
Related systems that inspired the domain: A11yShape, shapeCAD, RAVEN.
