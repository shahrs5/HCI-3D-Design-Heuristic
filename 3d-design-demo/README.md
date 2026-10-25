# 3D Design Agent (accessible demo)

A demo of a conversational 3D design tool for blind and low-vision (BLV) makers, built to follow the
accessibility heuristics of our project (adapted from *Vibe Check*, W4A '26). It pairs with the evaluation app in
[`../evaluation-app`](../evaluation-app), so auditors can score it as a reference tool.

**Live:** https://hci-3d-design-demo.web.app

There is **no LLM**. A rule-based agent understands a fixed set of commands, typed or spoken (see the
in-app Help), and builds the model as OpenSCAD code. Everything the agent says about the model is computed
from the geometry, so its descriptions are always true.

See **HEURISTICS.md** for how each of the 20 checklist items is addressed.

## What you can do

- Add boxes, cylinders, spheres and cones with sizes in mm, cm or inches, placed on top of, beside, under,
  in front of or behind other parts, at centres, edges or corners.
- Drill holes through parts or partway into them. Move, resize, scale, rename and delete parts.
- Ask questions: describe, list parts, how big, where is, is X touching Y, distance between, check for problems.
- Undo, redo, go back to any step in the history, and stop the agent mid-task (Escape).
- Get the model as text, a parts table, OpenSCAD code, an audio height profile, an STL file for 3D printing,
  or a text file.
- Voice input (Chrome, Edge, Safari), optional read-aloud, sound cues, three detail levels, text size,
  and light, dark and high-contrast themes.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

## Tests

```bash
npm run build
npx playwright test                                         # 26 tests: core logic, accessibility (axe, keyboard, focus, reflow), voice
BASE_URL=https://hci-3d-design-demo.web.app npx playwright test a11y voice   # against the live site
```

## Deploy

Hosted as a second site (`hci-3d-design-demo`) in the same Firebase project as the evaluation app:

```bash
npm run build && npx firebase deploy --only hosting
```

## Code map

| Path | What |
|---|---|
| `src/agent/parser.ts` | Command grammar: spoken numbers, units, part references, placements |
| `src/agent/agent.ts` | Runs commands; writes replies (what changed, notes, warnings) |
| `src/model/` | Data model, geometry relations and checks, descriptions, OpenSCAD output |
| `src/mesh.ts`, `src/Preview.tsx` | three.js preview with CSG holes; STL export |
| `src/App.tsx` | Conversation pipeline, status, stop, history, focus and announcements |
| `src/Panels.tsx`, `src/CommandBuilder.tsx` | Model, history, code, outputs, settings, help; form-based command builder |
| `src/audio.ts`, `src/speech.ts` | Sound cues, height-profile sonification; voice input and read-aloud |
| `src/help.ts`, `src/examples.ts` | Help topics (also used by "help <topic>"); example models |

## Not verified

- Not tried with real screen readers (NVDA, JAWS, VoiceOver, TalkBack). Live-region timing and verbosity
  need checking with real users.
- Voice input was only tested with a simulated recogniser. Accuracy for real speech and accents is unknown.
  Use headphones so the microphone does not pick up the screen reader.
- Only Chromium was tested (no Firefox or Safari). The sound cues and audio profile weren't listened to by a person.
- Descriptions use bounding boxes, so spheres and cones are described as their enclosing box. Holes are
  always vertical, and there's no rotation.
