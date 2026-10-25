import { test, expect } from '@playwright/test';
import { parse, normalize } from '../src/agent/parser';
import { run, type Reply } from '../src/agent/agent';
import { emptyModel, type Model } from '../src/model/types';
import { problems, modelBounds } from '../src/model/geometry';
import { toScad } from '../src/model/scad';
import { describeModel } from '../src/model/describe';

function session() {
  let model: Model = emptyModel();
  let last: number | null = null;
  const replies: Reply[] = [];
  const say = (text: string) => {
    const p = parse(text, model.parts.map((x) => x.name).filter(Boolean));
    const r = run(p.intent, { model, lastTouched: last, detail: 'standard' }, p.notes);
    if (r.model) model = r.model;
    if (r.touched !== undefined) last = r.touched;
    replies.push(r);
    return r;
  };
  return { say, get model() { return model; }, replies };
}
const part = (m: Model, n: number) => m.parts.find((p) => p.kind === 'solid' && p.num === n)!;
const hole = (m: Model, n: number) => m.parts.find((p) => p.kind === 'hole' && p.num === n)!;

test('normalisation: spoken numbers, units, filler', () => {
  expect(normalize('Please add a box twenty five by forty by two point five')).toBe('add a box 25 by 40 by 2.5');
  expect(normalize('Could you make it one hundred and twenty millimetres wide')).toBe('make it 120 mm wide');
  expect(normalize('move this one left 5 cm')).toBe('move this one left 5 cm');
  expect(normalize('40x30x10')).toBe('40 by 30 by 10');
  expect(normalize('put it in the middle')).toBe('put it in the centre');
});

test('add shapes with many phrasings', () => {
  const s = session();
  let r = s.say('add a box 40 by 30 by 10');
  expect(r.kind).toBe('change');
  expect(part(s.model, 1)).toMatchObject({ shape: 'box', sx: 40, sy: 30, sz: 10, x: 0, y: 0, z: 0 });
  expect(r.text).toContain('Added Part 1');
  expect(r.text).toContain('Overall size: 40 by 30 by 10 mm');

  r = s.say('put a cylinder 10 wide and 15 tall on top of part 1 at the back left corner');
  const c = part(s.model, 2);
  expect(c).toMatchObject({ shape: 'cylinder', sx: 10, sz: 15, z: 10, x: -15, y: 10 });
  expect(r.text).toContain('on top of Part 1, at the back-left corner');
  expect(r.text).toContain('(before: 40 by 30 by 10 mm)');

  r = s.say('Create a sphere with a radius of 5 to the right of part 1');
  expect(part(s.model, 3)).toMatchObject({ shape: 'sphere', sx: 10, x: 25, z: 0 });

  r = s.say('a 2 cm cube');
  expect(r.notes.join(' ')).toContain('converted 2 cm to 20 mm');
  expect(part(s.model, 4)).toMatchObject({ sx: 20, sy: 20, sz: 20 });
  expect(r.notes.join(' ')).toContain("didn't say where");

  r = s.say('add a cone twenty wide and thirty tall called spike on part 1');
  expect(part(s.model, 5)).toMatchObject({ shape: 'cone', sx: 20, sz: 30, topD: 0, name: 'spike', z: 10 });
});

test('defaults and assumptions are reported (H2.4)', () => {
  const s = session();
  let r = s.say('add a box');
  expect(r.notes.join(' ')).toContain("You didn't give the width, depth or height, so I used 20 mm for each");
  r = s.say('add a cylinder 10 by 30 on top of it');
  expect(r.notes.join(' ')).toContain('as 10 mm across and 30 mm tall');
  expect(part(s.model, 2)).toMatchObject({ sx: 10, sz: 30, z: 20 });
  r = s.say('add a box 30 mm');
  expect(r.notes.join(' ')).toContain('made it a 30 mm cube');
});

test('holes', () => {
  const s = session();
  s.say('add a box 40 by 20 by 3 called tag');
  let r = s.say('drill a 5 mm hole through the tag at the left edge');
  const h = hole(s.model, 1);
  expect(h).toMatchObject({ sx: 5, through: true });
  expect(h.x).toBeLessThan(-10);
  expect(r.text).toContain('Added Hole 1: 5 mm wide, all the way through Part 1 (tag), at the left edge');
  r = s.say('add a hole');
  expect(r.notes.join(' ')).toContain('5 mm wide');
  r = s.say('add a 30 mm hole in part 1');
  expect(r.kind).toBe('error');
  expect(r.text).toContain('cut it in two');
  s.say('add a cylinder 60 wide 80 tall to the right of part 1');
  r = s.say('add a hole 54 wide and 75 deep in part 2');
  expect(hole(s.model, 3)).toMatchObject({ sx: 54, through: false });
  expect(r.text).toContain('75 mm deep into Part 2');
});

test('move: directions, clamping, stacking, placement, coordinates', () => {
  const s = session();
  s.say('add a box 40 by 40 by 10');
  s.say('add a cylinder 10 wide 20 tall on top of part 1');
  let r = s.say('move part 1 left by 10');
  expect(part(s.model, 1).x).toBe(-10);
  expect(part(s.model, 2).x).toBe(-10);
  expect(r.notes.join(' ')).toContain('Part 2 sits on it, so it moved too');
  r = s.say('move part 1 down 5');
  expect(r.notes.join(' ')).toContain('already on the build plate');
  r = s.say('move part 2 up');
  expect(r.notes.join(' ')).toContain("didn't say how far, so I moved it 10 mm");
  expect(r.warnings.join(' ')).toContain('floating');
  r = s.say('move it down by 50');
  expect(r.notes.join(' ')).toContain('instead of 50');
  expect(r.notes.join(' ')).toContain('Fixed');
  expect(part(s.model, 2).z).toBe(0);
  r = s.say('put part 2 on top of part 1');
  expect(part(s.model, 2).z).toBe(10);
  s.say('move part 2 to x 5 y 5');
  expect(part(s.model, 2)).toMatchObject({ x: 5, y: 5 });
  s.say('centre part 2 on part 1');
  expect(part(s.model, 2)).toMatchObject({ x: -10, y: 0 });
  r = s.say('move part 1 on top of part 2');
  expect(r.kind).toBe('error');
});

test('resize: set, delta, percent, scale, vague; stack follows height', () => {
  const s = session();
  s.say('add a box 40 by 40 by 10');
  s.say('add a cylinder 10 wide 20 tall on top of it');
  let r = s.say('make part 1 taller by 5');
  expect(part(s.model, 1).sz).toBe(15);
  expect(part(s.model, 2).z).toBe(15);
  expect(r.notes.join(' ')).toContain('moved it up 5 mm');
  s.say('set the width of part 1 to 60');
  expect(part(s.model, 1).sx).toBe(60);
  s.say('make part 1 50 deep');
  expect(part(s.model, 1).sy).toBe(50);
  r = s.say('make the cylinder wider');
  expect(r.notes.join(' ')).toContain('by 20%');
  expect(part(s.model, 2).sx).toBe(12);
  s.say('make part 2 twice as tall');
  expect(part(s.model, 2).sz).toBe(40);
  s.say('make part 2 shorter by 50%');
  expect(part(s.model, 2).sz).toBe(20);
  r = s.say('make part 1 shorter by 100');
  expect(r.kind).toBe('error');
  r = s.say('make everything twice as big');
  expect(part(s.model, 1).sx).toBe(120);
});

test('references: names, shapes, it, ambiguity, missing', () => {
  const s = session();
  s.say('add a box 40 by 40 by 10');
  s.say('call it base');
  expect(part(s.model, 1).name).toBe('base');
  s.say('add a cylinder 10 wide 10 tall on the base');
  s.say('add a cylinder 5 wide 10 tall on top of the base at the front');
  let r = s.say('make the cylinder taller by 5');
  expect(r.notes.join(' ')).toContain('There are 2 cylinders; I used the newest one, Part 3');
  r = s.say('delete part 9');
  expect(r.kind).toBe('error');
  expect(r.text).toContain('There is no part 9');
  r = s.say('rename part 2 to part');
  expect(r.kind).toBe('error');
});

test('queries: describe, list, size, where, relation, distance, check', () => {
  const s = session();
  s.say('add a box 40 by 30 by 10');
  s.say('add a cylinder 10 wide 20 tall on top of part 1');
  s.say('add a sphere 10 to the right of part 1');
  expect(s.say('describe').text).toContain('The model has 3 parts');
  expect(s.say('how tall is it').text).toBe('The whole model is 50 mm wide, 30 mm deep and 30 mm tall.');
  expect(s.say('how big is part 2').text).toContain('10 mm diameter, 20 mm tall');
  expect(s.say('where is part 2').text).toContain('is on top of Part 1, centred');
  expect(s.say('is part 2 touching part 1').text).toContain('Yes');
  expect(s.say('what is the distance between part 2 and part 3').text).toContain('gap');
  expect(s.say('list parts').details).toHaveLength(3);
  expect(s.say('check for problems').text).toContain('No problems');
  s.say('move part 2 up 5');
  const r = s.say('any problems');
  expect(r.warnings.join(' ')).toContain('floating');
});

test('unknown input gives suggestions; control intents parse', () => {
  const s = session();
  const r = s.say('flibbertigibbet');
  expect(r.kind).toBe('error');
  expect(r.text).toContain('Say "help"');
  expect(parse('ad a box').intent.type).toBe('add'); // tolerant: the bare shape word still adds
  expect((parse('mvoe part 1 lft').intent as { suggestions: string[] }).suggestions[0]).toContain('move');
  for (const [t, type] of [['undo', 'undo'], ['undo that 3 times', 'undo'], ['redo', 'redo'], ['go back to step 2', 'revert'], ['show history', 'history'],
    ['help with holes', 'help'], ['what can I say', 'help'], ['start over', 'new'], ['yes', 'confirm'], ['no', 'deny'], ['stop', 'stop'],
    ['export stl', 'export'], ['download the code', 'export'], ['play the sound', 'listen'], ['be brief', 'detail'], ['load the keychain example', 'example'],
    ['repeat that', 'repeat']] as const)
    expect(parse(t).intent.type, t).toBe(type);
  expect((parse('download the code').intent as { format: string }).format).toBe('scad');
  expect((parse('load the phone stand example').intent as { name: string }).name).toBe('phone stand');
  expect((parse('show me an example of a keychain').intent as { name: string }).name).toBe('keychain');
});

test('OpenSCAD output and descriptions', () => {
  const s = session();
  s.say('add a box 40 by 20 by 3');
  s.say('add a hole 4 wide at the left edge');
  const code = toScad(s.model);
  expect(code).toContain('difference() {');
  expect(code).toContain('cube([40, 20, 3]);');
  expect(code).toContain('cylinder(h = 4, d = 4, $fn = 48);');
  const d = describeModel(s.model, 'detailed');
  expect(d[0]).toContain('1 part and 1 hole');
  expect(problems(s.model)).toEqual([]);
  expect(modelBounds(s.model)).toMatchObject({ minX: -20, maxX: 20 });
});

test('covered hole and overlap are reported', () => {
  const s = session();
  s.say('load the phone stand example'); // not handled by agent; build manually
  s.say('add a box 80 by 60 by 5 called base');
  s.say('add a box 80 by 8 by 70 on top of the base at the back edge');
  const r = s.say('add a hole 4 wide through the base at the back-right corner');
  expect(r.warnings.join(' ')).toContain('Hole 1 is covered: Part 2 sits over its opening');
  const r2 = s.say('add a box 10 by 10 by 10 on top of the base at the back-left corner');
  expect(r2.notes.join(' ')).toContain('overlaps Part 2, so they merge into one solid');
});
