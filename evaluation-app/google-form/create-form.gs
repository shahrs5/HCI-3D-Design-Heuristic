/**
 * Creates the "Rate the 3D design tool" Google Form (accessibility heuristic evaluation)
 * and a linked Google Sheet for the responses.
 *
 * How to use:
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file, and click Save.
 *   3. Choose the function "createForm" and click Run. Allow the permissions it asks for.
 *   4. Open "Execution log": it shows the link to send participants and the link to edit the form.
 *
 * Accessibility choices: one statement per question (no grid questions, which are hard to use with
 * a screen reader), the same answer options in the same order every time, one page per category,
 * and a progress bar.
 */

const CHECKLIST = [
  {
    "title": "H1 Agent Interface",
    "items": [
      {
        "id": "H1.1",
        "text": "The agent's responses are exposed as text that the screen reader reads in full."
      },
      {
        "id": "H1.2",
        "text": "The code editor, chat box and preview have meaningful labels."
      },
      {
        "id": "H1.3",
        "text": "Any model preview or rendering has a text alternative describing what it shows."
      },
      {
        "id": "H1.4",
        "text": "Status and errors are not conveyed only by colour, icons or visuals."
      }
    ]
  },
  {
    "title": "H2 Agent Operation",
    "items": [
      {
        "id": "H2.1",
        "text": "The user is told when the agent starts, is working and has finished."
      },
      {
        "id": "H2.2",
        "text": "After each request, the agent states what changed in the model (which parts, which dimensions)."
      },
      {
        "id": "H2.3",
        "text": "The user can review the sequence of edits made so far."
      },
      {
        "id": "H2.4",
        "text": "The agent reports when it did something different from what was asked."
      }
    ]
  },
  {
    "title": "H3 User Operation",
    "items": [
      {
        "id": "H3.1",
        "text": "Every function (prompting, editing, rendering, exporting) works by keyboard alone."
      },
      {
        "id": "H3.2",
        "text": "Navigation between chat, code and preview is consistent and predictable."
      },
      {
        "id": "H3.3",
        "text": "Focus lands somewhere sensible after each response or render."
      },
      {
        "id": "H3.4",
        "text": "The user can interrupt or cancel the agent mid-task."
      }
    ]
  },
  {
    "title": "H4 Help & Recovery",
    "items": [
      {
        "id": "H4.1",
        "text": "Errors in the code or the model are announced in an accessible form."
      },
      {
        "id": "H4.2",
        "text": "The user can undo or revert a bad edit."
      },
      {
        "id": "H4.3",
        "text": "The tool gives a non-visual way to check that the model matches the request, such as dimensions, a part list or a geometric description."
      },
      {
        "id": "H4.4",
        "text": "Help and documentation are readable with a screen reader."
      }
    ]
  },
  {
    "title": "H5 Adaptability & Personalization",
    "items": [
      {
        "id": "H5.1",
        "text": "It works with the screen reader and browser the auditor uses."
      },
      {
        "id": "H5.2",
        "text": "The user can control how much detail the agent gives when describing the model."
      },
      {
        "id": "H5.3",
        "text": "Output can be inspected in more than one non-visual way (text, audio or tactile export)."
      },
      {
        "id": "H5.4",
        "text": "Settings and preferences persist between sessions."
      }
    ]
  }
];

const SCALE = [
  "0 – Not an accessibility problem",
  "1 – Cosmetic problem only",
  "2 – Minor accessibility problem (low priority)",
  "3 – Major accessibility problem (high priority)",
  "4 – Accessibility catastrophe (must be fixed first)",
  "Not sure / does not apply",
];

const SCALE_HELP =
  "For each statement, choose how big a problem it was for you, from 0 (no problem) to 4 (catastrophe). " +
  "If you are not sure or it did not apply, choose Not sure. " +
  "To decide, think about: how often the problem happened, how hard it was to get around, and whether it kept bothering you.";

function createForm() {
  const form = FormApp.create("Rate the 3D design tool");
  form.setDescription(
    "Thank you for helping with our study. You have just used an AI-assisted 3D design tool " +
    "(OpenSCAD with ChatGPT or Claude). This form has 20 short statements about that tool, in 5 short pages. " +
    "For each one, choose how big a problem it was for you. It takes about 10 minutes. " +
    "Please do not enter your name or any personal information."
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage("Thank you! Your answers have been saved. Please tell the researcher that you have finished.");

  // About this session (the researcher can fill this in before handing over)
  form.addTextItem().setTitle("Participant code").setHelpText("For example P1. Not your name.").setRequired(true);
  form.addMultipleChoiceItem().setTitle("Which tool did you use?")
    .setChoiceValues(["OpenSCAD with ChatGPT", "OpenSCAD with Claude"]).setRequired(true);
  form.addMultipleChoiceItem().setTitle("Group")
    .setChoiceValues(["Blind or low-vision screen-reader user", "Sighted pilot (blindfolded)"]).setRequired(true);
  form.addTextItem().setTitle("Screen reader and browser used").setHelpText("For example NVDA with Chrome. Optional.");

  // One page per heuristic category
  CHECKLIST.forEach(function (cat, k) {
    form.addPageBreakItem().setTitle("Part " + (k + 1) + " of 5: " + cat.title).setHelpText(SCALE_HELP);
    cat.items.forEach(function (item) {
      form.addMultipleChoiceItem()
        .setTitle(item.id + ". " + item.text)
        .setChoiceValues(SCALE)
        .setRequired(true);
      form.addParagraphTextItem()
        .setTitle("Comment on " + item.id + " (optional)")
        .setHelpText("Why did you choose that rating? You can leave this empty.");
    });
  });

  // Verification and anything else
  form.addPageBreakItem().setTitle("Last questions");
  form.addMultipleChoiceItem().setTitle("Did you believe the final model matched what you asked for?")
    .setChoiceValues(["Yes, it matched (correct)", "No, it did not match (incorrect)", "I could not tell"]).setRequired(true);
  form.addParagraphTextItem().setTitle("How did you decide?");
  form.addParagraphTextItem().setTitle("Was there any other problem that this form did not ask about?")
    .setHelpText("Describe it in your own words, and say how big a problem it was from 0 to 4. Leave empty if none.");

  // Responses go to a Google Sheet
  const sheet = SpreadsheetApp.create("Rate the 3D design tool (responses)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log("Send this link to participants: " + form.getPublishedUrl());
  Logger.log("Edit the form: " + form.getEditUrl());
  Logger.log("Responses spreadsheet: " + sheet.getUrl());
}
