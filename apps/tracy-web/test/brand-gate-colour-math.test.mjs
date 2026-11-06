// The gate colour maths (lib/brand-accent/colour-math.js) is a frozen port of the approved lab rule; the design system
// slot keeps a twin (packages/design/tracy-ds-slot/src/colour.mjs). This vector table is repeated VERBATIM in
// packages/design/tracy-ds-slot/test/accent-lift-vectors.test.mjs: the same table in both suites is what stops the
// twins drifting. The expected values come from running the approved lab lift on these grounds.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liftAccent, neutralReason } from '../src/lib/brand-accent/colour-math.js'

const OPENING = '#121111'
const OTHER = '#f4f1ec'
/** [brand colour, lifted colour on OPENING / OTHER, lifted?] */
const VECTORS = [
  ['#042515', '#0e7e47', true],
  ['#0f4c4a', '#187b78', true],
  ['#7a1f2b', '#cb3448', true],
  ['#1e3a8a', '#4067d6', true],
  ['#00001e', '#5555ff', true],
  ['#001e0f', '#007f3f', true],
  ['#a78f45', '#a78f45', false],
  ['#ffe08a', '#ffe08a', false]
]

for (const [from, to, lifted] of VECTORS)
  test(`lift vector ${from} -> ${to}`, () => {
    const r = liftAccent(from, OPENING, OTHER)
    assert.equal(r.to, to)
    assert.equal(r.lifted, lifted)
  })

test('one neutral rule: dark tinted colours are real colours, a true grey is not', () => {
  for (const tinted of ['#00001e', '#001e0f']) assert.equal(neutralReason(tinted), null, tinted)
  for (const grey of ['#808080', '#000000', '#ffffff', '#1a1a1a']) assert.ok(neutralReason(grey), grey)
  assert.ok(neutralReason('red'))
})
