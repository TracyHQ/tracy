import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from '../verify-render.mjs';

test('diffSnapshots flags color mismatch, ignores within tolerance', () => {
  const a = { '.btn': { color: '#ffffff', backgroundColor: '#2b6cb0' } };
  const b = { '.btn': { color: '#ffffff', backgroundColor: '#2b6db1' } };
  const out = diffSnapshots(a, b, { hexTolerance: 4 });
  assert.equal(out.mismatches.length, 0);
  const out2 = diffSnapshots(a, { '.btn': { color: '#000000', backgroundColor: '#2b6cb0' } }, { hexTolerance: 4 });
  assert.equal(out2.mismatches.length, 1);
});
