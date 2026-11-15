// Bisection for write safety (ticket #586): the units of a failing set that fail on their own, each with the failure of
// the trial that isolated it; two units that fail only together; a spent budget leaves units unnamed; the block stage
// takes blocks off the page and always puts them back.
import assert from 'node:assert/strict'
import test from 'node:test'
import { bisect, bisectBlocks, stepBudget } from '../ai-quickstart/gate/bisect.mjs'

const units = Array.from({ length: 16 }, (_, n) => 'u' + n)
const failsOn = (bad) => async (subset) => (subset.some((u) => bad.includes(u)) ? { code: 'x' } : null)

test('one culprit among sixteen is named in a few steps, with its failure', async () => {
  const out = await bisect(units, failsOn(['u11']), stepBudget(40))
  assert.deepEqual(out.culprits, [{ unit: 'u11', failure: { code: 'x' } }])
  assert.ok(out.steps <= 8, String(out.steps))
  assert.deepEqual(out.exhausted, [])
})

test('two culprits in both halves are both named', async () => {
  const out = await bisect(units, failsOn(['u2', 'u13']), stepBudget(40))
  assert.deepEqual(out.culprits.map((c) => c.unit).sort(), ['u13', 'u2'])
})

test('units that fail only together are reported together', async () => {
  const out = await bisect(['a', 'b'], async (s) => (s.length === 2 ? {} : null), stepBudget(40))
  assert.deepEqual(out.culprits, [])
  assert.deepEqual(out.together, [['a', 'b']])
})

test('a spent budget leaves the units unnamed', async () => {
  const budget = stepBudget(1)
  const out = await bisect(units, failsOn(['u11']), budget)
  assert.equal(out.culprits.length, 0)
  assert.ok(out.exhausted.includes('u11'))
  assert.equal(budget.left, 0)
})

test('the block stage puts every block back after each step', async () => {
  const away = new Set()
  const out = await bisectBlocks({
    blocks: ['b1', 'b2', 'b3', 'b4'],
    off: async (bs) => bs.forEach((b) => away.add(b)),
    back: async (bs) => bs.forEach((b) => away.delete(b)),
    pageFails: async () => (away.has('b3') ? null : { status: 500 }),
    budget: stepBudget(40)
  })
  assert.deepEqual(
    out.culprits.map((c) => c.unit),
    ['b3']
  )
  assert.equal(away.size, 0)
})
