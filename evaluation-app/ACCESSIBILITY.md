# Accessibility: what was tested

Designed for blind participants first:
- **Answering:** answers can be spoken or typed, one question at a time.
- **Opening the page:** focus lands on the heading, and the two start buttons are large and clearly labelled.
- **Voice mode:** the page speaks for itself, beeps before it listens, and asks again if it didn't hear anything or didn't understand ("I heard: banana. Please say a number from 0 to 4"). After 3 silences it pauses.
- **Keyboard mode:** focus stays in one answer box. Each question goes to an assertive live region, and short confirmations ("Not sure. Noted.") are read together with the next question, so one announcement never cuts off another.
- **Anytime:** repeat, explain the scale, go back, slower or faster speech, and pause (Escape).
- **Failures:** if the microphone is blocked or there's no network, the page says so and switches to typed answers.
- **Progress:** saved after every answer, with a "Continue where it stopped" option.
- **Low vision:** large text (prompt at about 29 px), strong focus ring, high contrast, dark mode, and no horizontal scrolling down to 320 px.

## Automated checks (`npm test`, all passing, also run against the live site)
- **Answer understanding:** numbers, words, mishearings, "not sure", commands, and yes/no.
- **A complete voice run with a simulated voice**, covering repeat, explain, back, silence, an unrecognised answer, slower, a comment, verification and another problem. The test then checks every stored answer and the CSV download.
- **A complete keyboard run:** the live-region text, focus staying in the answer box, typed shortcuts and confirmations read with the next question.
- **Recovery:** a blocked microphone switches to typing, plus pausing and continuing after a reload.
- **axe-core** (WCAG 2.x A/AA plus best practice) on the start page, a question in keyboard mode, and the finish page.
- **Reflow** at 320 and 640 px.

## Not verified
- **A real microphone and real speech recognition:** accuracy with different voices and accents. Chrome sends audio to Google for recognition.
- **Real screen readers** (NVDA, JAWS, VoiceOver): how the live region and the page's own voice interact. In voice mode the screen reader may also speak, and the start page tells people how to quiet it.
- Browsers other than Chromium.
