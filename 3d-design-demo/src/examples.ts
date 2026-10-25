export interface Example { id: string; title: string; description: string; commands: string[] }

export const EXAMPLES: Example[] = [
  {
    id: 'keychain',
    title: 'Keychain tag',
    description: 'A flat tag with a hole for a key ring.',
    commands: ['add a box 50 by 20 by 3 called tag', 'add a hole 5 wide through the tag at the left edge'],
  },
  {
    id: 'pencil holder',
    title: 'Pencil holder',
    description: 'A cup: a cylinder with a deep hole that stops before the bottom.',
    commands: ['add a cylinder 70 wide and 90 tall called cup', 'add a hole 62 wide and 86 deep in the cup'],
  },
  {
    id: 'phone stand',
    title: 'Phone stand',
    description: 'A base plate with a back rest and a front lip.',
    commands: [
      'add a box 80 by 60 by 5 called base',
      'add a box 80 by 8 by 70 called back on top of the base at the back edge',
      'add a box 80 by 6 by 12 called lip on top of the base at the front edge',
    ],
  },
];

export function findExample(name: string): Example | undefined {
  const n = name.toLowerCase().replace(/\bexample\b/g, '').trim();
  if (!n) return undefined;
  return EXAMPLES.find((e) => n.includes(e.id) || e.id.includes(n) || e.title.toLowerCase().includes(n) || (n.includes('key') && e.id === 'keychain') || ((n.includes('pencil') || n.includes('cup')) && e.id === 'pencil holder') || ((n.includes('phone') || n.includes('stand')) && e.id === 'phone stand'));
}
