import test from 'node:test';
import assert from 'node:assert/strict';
import { canCompleteWithProblems, withinCircleProblemLimit } from '../scripts/lib/circle-completion.mjs';

test('the per-source round allowance includes 100, rejects 101 and invalid counts', () => {
  for (const problems of [0, 1, 99, 100]) assert.equal(canCompleteWithProblems({ problems }), true);
  for (const problems of [101, -1, NaN, undefined, 1.5, '100']) assert.equal(withinCircleProblemLimit(problems), false);
});

test('a small tail never hides a stop, unattempted work, broken lists or failed writes', () => {
  for (const blocked of [{ stopped: true }, { incompleteLists: true }, { writeFailed: 1 }, { unattempted: 1 }]) {
    assert.equal(canCompleteWithProblems({ problems: 1, ...blocked }), false);
  }
});
