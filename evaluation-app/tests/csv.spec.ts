import { test, expect } from '@playwright/test';
import { emptyAudit } from '../src/types';
import { itemsCsv, outsideCsv } from '../src/csv';

test('CSV structure, quoting and formula-injection guard', () => {
  const data = {
    ...emptyAudit(), auditor: 'P1', group: 'BLV screen-reader user', condition: 'A: OpenSCAD + ChatGPT',
    items: { 'H1.1': { severity: null, unclear: true, comment: '' }, 'H1.2': { severity: 3, unclear: false, comment: 'Says "preview", =SUM(A1)' } },
    outside: [{ key: 'a', text: 'Line1\nLine2, with comma', tag: 'Other', severity: 4 }],
    verification: { answer: 'Incorrect', reason: 'Measured it' },
  };
  const items = itemsCsv([{ id: 'S1', data }]).trim().split('\r\n');
  expect(items[0]).toBe('"session_id","auditor","group","condition","item_id","heuristic","severity","unclear","comment"');
  expect(items).toHaveLength(21);
  expect(items[1]).toBe('"S1","P1","BLV screen-reader user","A: OpenSCAD + ChatGPT","H1.1","H1","","true",""');
  expect(items[2]).toBe(`"S1","P1","BLV screen-reader user","A: OpenSCAD + ChatGPT","H1.2","H1","3","false","Says ""preview"", =SUM(A1)"`);
  const out = outsideCsv([{ id: 'S1', data }, { id: 'S2', data: { ...data, outside: [] } }]).trim().split('\r\n');
  expect(out[0]).toBe('"session_id","auditor","group","condition","issue_text","tag","severity","verification_answer","verification_reason"');
  expect(out[1]).toBe('"S1","P1","BLV screen-reader user","A: OpenSCAD + ChatGPT","Line1\nLine2, with comma","Other","4","Incorrect","Measured it"');
  expect(out[2]).toBe('"S2","P1","BLV screen-reader user","A: OpenSCAD + ChatGPT","","","","Incorrect","Measured it"');
});
