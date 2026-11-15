// What write safety covers (ticket #586, review round 3, V1): a picture the write plan names by reference (the build
// writes `{"ref": "picture:<place>"}` and the write resolves it to a stored file) is counted as a picture, not as a
// fixed value with no marker. An invented write plan.
import assert from 'node:assert/strict'
import test from 'node:test'
import { coverageOf } from '../ai-quickstart/gate/write-safety-coverage.mjs'

const loc = (slot) => ({ slot, entity: 'module-1', column: 'params', jsonPath: ['items', slot] })
const plan = {
  ops: [
    {
      values: [
        { loc: loc('a'), value: { ref: 'picture:home.hero-b1.image' } },
        { loc: loc('b'), value: 'images/sample/hero.webp' },
        { loc: loc('c'), value: 'fab fa-facebook' }
      ]
    }
  ]
}

test('V1: a picture named by reference in the write plan is a picture, not a value with no marker', () => {
  const c = coverageOf(plan, new Map())
  assert.deepEqual(c.notProbed, { picture: 2, no_marker: 1 })
})
