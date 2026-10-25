import { test, expect } from '@playwright/test';
import { readFree, readScore, readYesNo } from '../src/answers';

test('scores from speech, including common mishearings', () => {
  const v = (s: string) => { const a = readScore(s); return a.kind === 'score' ? a.value : a.kind === 'command' ? a.command : a.kind; };
  expect(v('three')).toBe(3);
  expect(v('I would say a 2')).toBe(2);
  expect(v('for')).toBe(4);
  expect(v('tree')).toBe(3);
  expect(v('zero')).toBe(0);
  expect(v('no problem at all')).toBe(0);
  expect(v('major')).toBe(3);
  expect(v('catastrophe')).toBe(4);
  expect(v('two or three')).toBe(3);
  expect(v("I'm not sure")).toBe('na');
  expect(v('n')).toBe('na');
  expect(v('can you repeat that')).toBe('repeat');
  expect(v('what do the numbers mean')).toBe('explain');
  expect(v('go back')).toBe('back');
  expect(v('slower please')).toBe('slower');
  expect(v('banana')).toBe('text');
  expect(v('')).toBe('silence');
});

test('yes / no and free answers', () => {
  expect(readYesNo('yes it did').kind).toBe('yes');
  expect(readYesNo('no').kind).toBe('no');
  expect(readYesNo("I couldn't tell").kind).toBe('na');
  expect(readFree('next').kind).toBe('command');
  expect(readFree('The AI never told me the size').kind).toBe('text');
});
