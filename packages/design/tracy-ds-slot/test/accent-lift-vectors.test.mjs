// The brand step's neutral rule and accent lift (03/11/2026, #317/#318). The vector table below is repeated
// VERBATIM in apps/tracy-web/test/brand-gate-colour-math.test.mjs: the slot (colour-lift.mjs) and the gate
// (brand-step/colour-math.js) are twins of one approved rule, and the same table in both suites is what stops them
// drifting. The expected values come from running the approved lab lift on these grounds.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandProfile, isNeutralAccent } from '../src/brand.mjs'
import { liftAccent, neutralReason } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract } from '../src/library.mjs'

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
  for (const tinted of ['#00001e', '#001e0f']) {
    assert.equal(neutralReason(tinted), null, tinted)
    assert.equal(isNeutralAccent(tinted), false, tinted)
  }
  for (const grey of ['#808080', '#000000', '#ffffff', '#1a1a1a']) {
    assert.ok(neutralReason(grey), grey)
    assert.equal(isNeutralAccent(grey), true, grey)
  }
  assert.ok(neutralReason('red'))
})

test('accent-only takes the lab lift as given: the profile and the opening side wear exactly the lifted colour', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
  const modes = loadContract('joomla-ja-boxing-modes')
  const base = contractBase(root, modes)
  for (const [from] of VECTORS.filter((v) => v[2])) {
    const lift = liftAccent(from, base['--bg'], OTHER)
    assert.equal(lift.lifted, true, from)
    const r = /** @type {any} */ (brandProfile({ accent: lift.to }, modes, base, { accentOnly: true }))
    assert.ok('profile' in r, `${from}: ${JSON.stringify(r)}`)
    assert.equal(r.profile.colors.accent.v.toLowerCase(), lift.to, from)
    const slot = /** @type {any} */ (joomlaSlot(r.profile, base, modes, { accentOnly: true }))
    assert.ok(new RegExp(`--ds-c-accent:${lift.to}`).test(slot.css), `${from}: ${lift.to}`)
  }
})
