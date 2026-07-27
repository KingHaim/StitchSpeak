import type { RepeatCountSemantics } from '../../src/services/techEditMath';

export const repeatSemanticsCases: Array<{
  quote: string;
  expected: Exclude<RepeatCountSemantics, 'unknown'>;
}> = [
  { quote: 'Repeat the decrease row a total of 4 times.', expected: 'total' },
  { quote: 'Work this shaping 4 times in all.', expected: 'total' },
  { quote: 'Continue until the decrease has been worked 4 times altogether.', expected: 'total' },
  { quote: 'Repeat the decrease row 4 more times.', expected: 'additional' },
  { quote: 'Work this shaping another 4 times.', expected: 'additional' },
  { quote: 'Repeat on each of the following 4 right-side rows.', expected: 'additional' },
];
