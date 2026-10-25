# How the demo follows the heuristics

The design follows the five *Vibe Check* (Madan, Surabiyil Bindu & Potluri, W4A '26) categories as
adapted in our project checklist (the same 20 items used in the audit app). Each item lists the
features that address it and the automated test that checks it, where there is one.

> Source note: the paper PDF could not be read while building this (the upload was empty and the ACM
> copy is paywalled), so the mapping uses the category definitions from our project deck and our
> adapted checklist. Cross-check against the paper before citing.

## H1 Agent Interface: can users perceive everything?

| Item | How the demo does it | Tested |
|---|---|---|
| H1.1 Agent responses are text read in full | Every reply is plain text in the Conversation list and is announced in full via a polite live region (errors via an assertive one). "Repeat last reply" / "repeat" re-announces. Optional browser read-aloud for non-screen-reader users. | a11y: typing a command |
| H1.2 Editor, chat and preview have meaningful labels | Eight named landmarks with headings in a fixed order (Conversation, Model, Visual preview, Edit history, OpenSCAD code, Other outputs, Settings, Help). Labelled command box, read-only code box, labelled button groups. | axe on every state |
| H1.3 Preview has a text alternative | The canvas has `role="img"` and a label with the view, overall size and part labels. The visible caption repeats it. The Model section holds the full description, a problems list and a parts table. | a11y: canvas aria-label |
| H1.4 Status/errors not only by colour, icons, visuals | Status is text ("Agent: Working: Updating the model (2 of 3)"). Messages are prefixed "You:", "Agent:", "Agent, problem:", "Note:", "Warning:". Parts carry numbers on the preview, and the selected view has a ✓ plus `aria-pressed`. | axe, visual review |

## H2 Agent Operation: can users track what the agent is doing?

| Item | How | Tested |
|---|---|---|
| H2.1 Told when the agent starts, works, finishes | "Working on it." is announced with a rising sound cue. The header shows step-by-step status. The reply is announced with a "done" cue. Pace setting: realistic (~2 s), slow (~6 s), instant. | a11y: typing a command |
| H2.2 After each request, says what changed (parts, dimensions) | Every change reply names the part, its shape and sizes, where it is placed relative to other parts, and the overall size before and after. In detailed mode it adds a full description. | core + a11y tests |
| H2.3 Can review the sequence of edits | The Edit history lists every step with what you said. "show history" reads it out. The current step is marked (`aria-current`). | a11y: undo/redo/history |
| H2.4 Reports when it did something different | Every assumption or adjustment becomes a "Note:": defaults used, unit conversions, ambiguous references ("There are 2 cylinders; I used the newest one…"), clamping at the build plate, parts that moved along with others, overlaps that merge parts. | core: defaults/assumptions |

## H3 User Operation: keyboard, navigation, focus, control

| Item | How | Tested |
|---|---|---|
| H3.1 Every function works by keyboard | Only native controls are used. There's a command builder for people who prefer forms, "/" jumps to the command box, and every control has a visible 3px focus ring with a halo. | a11y: tab order + keyboard test |
| H3.2 Navigation is consistent and predictable | Same sections in the same order, always. "Jump to" links move focus to each section heading. Nothing moves around or appears in pop-ups. | a11y: jump links |
| H3.3 Focus lands sensibly after each response | Focus stays in the command box (keep typing). A setting moves it to the new reply instead. Quick-command buttons keep focus on the button. | a11y: both focus modes |
| H3.4 Can interrupt or cancel mid-task | Escape, a Stop button, or saying/typing "stop". The model is never half-changed: the agent says "Stopped. I did not change the model." | a11y: stop test |

## H4 Help & Recovery

| Item | How | Tested |
|---|---|---|
| H4.1 Errors announced accessibly | Errors go to an assertive live region with an error sound. Messages explain why and suggest a fix ("A 30 mm hole is as wide as Part 1 (40 mm)… Try 13 mm"). Unknown commands get "did you mean" suggestions, and typos and swapped letters are tolerated. | a11y + core |
| H4.2 Undo / revert a bad edit | Undo and redo (also "undo 3 times"), go back to any step, and "start over", which is itself undoable. | a11y: undo test |
| H4.3 Non-visual check that the model matches the request | All answers are computed from geometry, not generated: describe, list parts, sizes, where, "is X touching Y", distances. "check" finds floating parts, parts below the plate, overhangs, covered holes, holes breaking through walls, thin walls and separate pieces. A height profile can be played as sound. | core: queries, covered hole |
| H4.4 Help readable with a screen reader | Help is part of the page (headings per topic, examples with "Put in command box"). "help <topic>" answers in the conversation. | axe |

## H5 Adaptability & Personalisation

| Item | How | Tested |
|---|---|---|
| H5.1 Works with the user's screen reader and browser | Standard HTML/ARIA only, no custom widgets. Voice input degrades to a clear message where it isn't available. | axe; real screen readers **not** tested |
| H5.2 Control over how much detail | Brief / standard / detailed setting, plus voice commands ("be brief", "more detail") and per-request "describe … in detail". | a11y: detail levels |
| H5.3 More than one non-visual output | Text description, parts table, OpenSCAD code, audio height profile, STL for tactile 3D printing, text file download, optional read-aloud. | a11y: downloads + listen |
| H5.4 Settings persist | Settings and the whole project (model, history, conversation) are saved in the browser. | a11y: settings persist |

Low-vision support beyond the checklist: text size up to 200%, light, dark and high-contrast (yellow on black) themes, large targets (≥ 44 px), reflow down to 320 px, reduced-motion support, and part numbers and orientation labels on the preview.
