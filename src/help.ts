// Help topics: shown in the Help section and answered in the conversation ("help holes").
export interface HelpTopic { id: string; title: string; keywords: string[]; text: string[]; examples: string[] }

export const HELP: HelpTopic[] = [
  {
    id: 'start', title: 'Getting started', keywords: ['start', 'begin', 'intro', 'basics'],
    text: [
      'Type a command in the command box and press Enter, or press Speak and say it. The agent replies in the conversation, and the reply is read out by your screen reader.',
      'This is a demo: there is no AI model behind it. The agent understands the short commands listed in this help, and tells you when it had to guess.',
      'All sizes are in millimetres unless you say cm or inches.',
    ],
    examples: ['add a box 40 by 30 by 10', 'load the keychain example', 'describe the model'],
  },
  {
    id: 'directions', title: 'Directions and the build plate', keywords: ['direction', 'axis', 'axes', 'left', 'front', 'coordinates', 'plate', 'orientation'],
    text: [
      'Imagine the model on a table in front of you. Left and right are left and right. Front is the side nearest you; back is the far side. Up is up.',
      'The build plate is the table surface (height 0). The first part goes in the centre of the plate.',
      'In coordinates: x goes left to right, y goes front to back, z goes up. Sizes are width (left to right), depth (front to back) and height.',
    ],
    examples: ['move part 1 to x 0 y 0', 'where is part 2'],
  },
  {
    id: 'shapes', title: 'Adding shapes', keywords: ['add', 'shape', 'shapes', 'box', 'cube', 'cylinder', 'sphere', 'cone', 'create', 'size', 'sizes', 'units'],
    text: [
      'Shapes: box (or cube, plate, block), cylinder (or rod, peg, disc), sphere (or ball), cone.',
      'Box sizes are width by depth by height. Round shapes take a diameter (or radius) and a height. If you leave a size out, the agent uses 20 mm and tells you.',
      'You can name a part when you add it ("called base") and use the name afterwards.',
    ],
    examples: ['add a box 40 by 30 by 10', 'add a cylinder 10 wide and 25 tall', 'add a sphere with a radius of 8', 'add a 2 cm cube called block'],
  },
  {
    id: 'placing', title: 'Placing parts', keywords: ['place', 'placing', 'position', 'on top', 'next to', 'left of', 'corner', 'edge', 'under', 'behind'],
    text: [
      'Say where a new part goes relative to another part: on top of, under, to the left of, to the right of, in front of, behind. Side placements touch the other part.',
      'On top, you can add a spot: at the centre, at the front, back, left or right edge, or at a corner such as the back-left corner.',
      'If you do not say where, the new part goes to the right of the model, and the agent tells you.',
    ],
    examples: ['add a cylinder 10 wide 20 tall on top of part 1 at the back-left corner', 'add a box 10 by 30 by 10 to the left of the base'],
  },
  {
    id: 'holes', title: 'Holes', keywords: ['hole', 'holes', 'drill', 'cut', 'hollow'],
    text: [
      'Holes go straight down from the top of a part. By default they go all the way through; give a depth for a hole that stops partway.',
      'Place a hole at the centre, an edge or a corner. The agent keeps a small wall between the hole and the edge, and warns you if a wall is thinner than 1.2 mm.',
    ],
    examples: ['add a hole 5 wide through part 1', 'drill a 4 mm hole in the tag at the front-right corner', 'add a hole 20 wide and 10 deep in part 1', 'make hole 1 wider by 1'],
  },
  {
    id: 'moving', title: 'Moving parts', keywords: ['move', 'moving', 'shift', 'centre', 'center', 'align', 'raise', 'lower'],
    text: [
      'Move a part in a direction by a distance, onto or next to another part, to coordinates, or centre it on another part.',
      'Parts resting on top of a part, and its holes, move with it. Nothing can go below the build plate; the agent stops it there and tells you.',
    ],
    examples: ['move part 2 left by 10', 'move the peg on top of the base', 'centre part 2 on part 1', 'move everything up 5'],
  },
  {
    id: 'resizing', title: 'Changing sizes', keywords: ['resize', 'size', 'bigger', 'smaller', 'taller', 'wider', 'scale', 'height', 'width', 'change'],
    text: [
      'Set a size directly, change it by an amount or a percentage, or scale it. If you only say "bigger", the agent changes it by 20% and tells you.',
      'When a part gets taller or shorter, parts resting on it move up or down so they stay on top.',
    ],
    examples: ['make part 1 50 wide', 'set the height of the base to 8', 'make the peg taller by 5', 'make part 2 twice as big', 'make everything 50% bigger'],
  },
  {
    id: 'referring', title: 'Naming and referring to parts', keywords: ['name', 'rename', 'call', 'refer', 'it', 'which', 'part'],
    text: [
      'Parts are numbered in the order you add them: part 1, part 2. Holes are numbered separately: hole 1, hole 2. Numbers never change, even after a delete.',
      'You can also say a name you gave, a shape ("the cylinder"), or "it" for the part you used last. If a shape matches more than one part, the agent uses the newest one and tells you.',
    ],
    examples: ['call part 1 base', 'make it taller', 'delete the sphere'],
  },
  {
    id: 'checking', title: 'Checking the model without seeing it', keywords: ['check', 'describe', 'question', 'questions', 'measure', 'size', 'distance', 'where', 'verify', 'listen'],
    text: [
      'Ask for a description, a list of parts, sizes, where a part is, whether two parts touch, or the distance between them. All answers are calculated from the geometry, not guessed.',
      '"Check" looks for printing problems: floating parts, parts below the plate, parts hanging over an edge, holes that cut through a side, and thin walls.',
      'The Model section always shows the current description and a table of parts. Listen plays the model\'s height from left to right as sound: higher pitch means taller.',
    ],
    examples: ['describe the model in detail', 'how tall is part 2', 'is part 2 touching part 1', 'distance between part 2 and part 3', 'check for problems', 'listen to the shape'],
  },
  {
    id: 'undo', title: 'Undo, history and stopping', keywords: ['undo', 'redo', 'history', 'back', 'revert', 'stop', 'cancel', 'mistake'],
    text: [
      'Every change is a step in the edit history. Undo and redo move one step; you can also go back to any step. Going back does not delete later steps until you make a new change.',
      'While the agent is working, press Escape, the Stop button, or say "stop". Nothing is changed when you stop.',
    ],
    examples: ['undo', 'undo 3 times', 'redo', 'show history', 'go back to step 2', 'stop'],
  },
  {
    id: 'outputs', title: 'Code, files and other outputs', keywords: ['export', 'download', 'stl', 'scad', 'code', 'print', 'file', 'save'],
    text: [
      'The OpenSCAD code updates after every change. You can read it line by line, copy it, or download it as a .scad file to open in OpenSCAD.',
      'Download STL gives a file for 3D printing, for example to make a tactile copy of the model. You can also download the text description.',
      'Your model, history and conversation are saved in this browser, so a refresh does not lose them.',
    ],
    examples: ['export stl', 'download the code', 'download the description'],
  },
  {
    id: 'voice', title: 'Voice input and read-aloud', keywords: ['voice', 'speak', 'speech', 'microphone', 'mic', 'talk', 'read aloud'],
    text: [
      'Press Speak, say one command, and pause. The words appear in the command box and are sent automatically (you can turn that off in Settings to check them first).',
      'Use headphones so the microphone does not pick up your screen reader. Voice input works in Chrome, Edge and Safari; it is not available in Firefox.',
      'If you are not using a screen reader, turn on "Read replies aloud" in Settings.',
    ],
    examples: [],
  },
  {
    id: 'keyboard', title: 'Keyboard and navigation', keywords: ['keyboard', 'shortcut', 'shortcuts', 'navigate', 'navigation', 'focus', 'tab'],
    text: [
      'Every control works with the keyboard. The page always has the same sections in the same order, each with a heading and a landmark: Conversation, Model, Visual preview, Edit history, OpenSCAD code, Other outputs, Settings, Help. Use the "Jump to" links at the top to move between them.',
      'Escape stops the agent. Press slash (/) when you are not in a text box to jump to the command box.',
      'After each reply, focus stays in the command box so you can keep typing. In Settings you can choose to move focus to the reply instead.',
    ],
    examples: [],
  },
  {
    id: 'settings', title: 'Settings', keywords: ['settings', 'detail', 'brief', 'verbose', 'verbosity', 'contrast', 'text size', 'theme', 'sound'],
    text: [
      'Detail level controls how much the agent says after each change: brief, standard, or detailed (which adds a full description). You can also say "be brief" or "more detail".',
      'You can also change text size, colour theme (including high contrast), sound cues, agent pace, and what happens after a voice command. Settings are saved in this browser.',
    ],
    examples: ['be brief', 'more detail'],
  },
];

export function findHelp(topic: string): HelpTopic | undefined {
  const t = topic.toLowerCase().replace(/\b(?:with|about|on|for|the|me|a|an|to)\b/g, ' ').trim();
  if (!t) return undefined;
  return HELP.find((h) => h.id === t || h.title.toLowerCase().includes(t))
    ?? HELP.find((h) => h.keywords.some((k) => t.includes(k) || k.includes(t)));
}
