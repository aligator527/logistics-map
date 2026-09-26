import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, score } from '../src/lib/score.ts';

test('percentile: ranks 0..100, ties share the mean rank, NaN stays NaN', () => {
  assert.deepEqual(percentile([10, 20, 30], 1), [0, 50, 100]);
  assert.deepEqual(percentile([10, 20, 30], -1), [100, 50, 0]);
  assert.deepEqual(percentile([5, 5, 9], 1), [25, 25, 100]);
  const p = percentile([1, NaN, 3], 1);
  assert.equal(p[0], 0); assert.ok(Number.isNaN(p[1])); assert.equal(p[2], 100);
});

test('score: weighted mean of percentiles, missing parts drop out of the denominator', () => {
  const c = (key, raw, dir = 1) => ({ key, ja: key, en: key, raw, dir, fmt: String, hint: { ja: '', en: '' }, source: { ja: '', en: '' }, group: 'market' });
  const r = score([c('a', [1, 2, 3]), c('b', [3, 2, NaN], -1)], [1, 3]);
  // area 0: a=0, b=0 → 0; area 1: a=50, b=100 → (50+300)/4; area 2: a=100, b missing → 100
  assert.deepEqual(r.total, [0, 87.5, 100]);
  // zero weight ignores a criterion
  assert.deepEqual(score([c('a', [1, 2]), c('b', [2, 1])], [1, 0]).total, [0, 100]);
});
