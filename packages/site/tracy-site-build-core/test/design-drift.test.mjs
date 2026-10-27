/**
 * What a WRITE is told about design drift (ADR 0023, "Addendum 30/09 — the write door returns its own warnings"):
 * the findings of one measured page, reduced to what the write may have caused. Warnings only.
 *
 *   node --test packages/site/tracy-site-build-core/test/design-drift.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { driftFindings, DRIFT_WARNINGS_MAX } from '../src/host/design-check.mjs'

/** A report as `judge` writes it, with only what drift reads. */
const report = ({ colors = [], fonts = [], score = 90, url = 'http://s/' } = {}) => ({
  schemaVersion: 'tracy-design-check/v1',
  url,
  elements: { seen: 10, judged: 10 },
  colors: { on: 0, near: 0, off: 0, offenders: colors },
  fonts: { on: 0, off: 0, offenders: fonts },
  score
})
const magenta = {
  prop: 'background-color',
  value: 'rgb(255, 0, 255)',
  band: 'off',
  nearest: { token: '--accent', distance: 200 },
  count: 1,
  where: ['a.wp-block-button__link']
}
const grey = {
  prop: 'border-top-color',
  value: 'rgb(221, 221, 221)',
  band: 'off',
  nearest: { token: '--border', distance: 60 },
  count: 3,
  where: ['hr']
}
const nearBlue = {
  prop: 'color',
  value: 'rgb(10, 100, 200)',
  band: 'near',
  nearest: { token: '--accent', distance: 30 },
  count: 2,
  where: ['a']
}
const arial = { family: 'Arial', count: 2, where: ['.legacy'] }

test('no earlier measure of the page: every OFF colour and foreign font is a warning, NEAR ones are not, and next names the worst', () => {
  const d = driftFindings(report({ colors: [magenta, nearBlue], fonts: [arial] }), null)
  assert.equal(d.baseline, false)
  assert.deepEqual(
    d.warnings.map((w) => w.code),
    ['OFF_PALETTE_COLOR', 'OFF_SYSTEM_FONT']
  )
  assert.deepEqual(d.warnings[0], { code: 'OFF_PALETTE_COLOR', ...magenta })
  assert.deepEqual(d.warnings[1], { code: 'OFF_SYSTEM_FONT', ...arial })
  assert.match(
    d.next,
    /rgb\(255, 0, 255\) on a\.wp-block-button__link is off the palette — write var\(--accent\)/
  )
  assert.doesNotMatch(d.next, /rgb\(10, 100, 200\)/)
  assert.equal(d.existing, 0)
})

test('against the last measure of the same page: only what is NEW (or grew) is a warning, near included; the rest is counted as existing', () => {
  const before = report({ colors: [grey, { ...nearBlue }] })
  const after = report({ colors: [magenta, grey, { ...nearBlue, count: 3 }] })
  const d = driftFindings(after, before)
  assert.equal(d.baseline, true)
  assert.deepEqual(
    d.warnings.map((w) => w.value),
    ['rgb(255, 0, 255)', 'rgb(10, 100, 200)']
  )
  assert.equal(d.existing, 1)
  assert.match(d.next, /rgb\(255, 0, 255\)/)
  assert.doesNotMatch(d.next, /221/)
})

test("nothing new since the last measure: no warnings, no next — drift the write did not cause is not the agent's errand", () => {
  const d = driftFindings(report({ colors: [grey] }), report({ colors: [grey] }))
  assert.deepEqual(d.warnings, [])
  assert.equal(d.next, null)
  assert.equal(d.existing, 1)
})

test('a page that drifted in many places carries at most DRIFT_WARNINGS_MAX warnings', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ ...magenta, value: `rgb(255, 0, ${i})` }))
  const d = driftFindings(report({ colors: many }), null)
  assert.equal(d.warnings.length, DRIFT_WARNINGS_MAX)
  assert.equal(d.more, 20 - DRIFT_WARNINGS_MAX)
})

test('one colour on one element is ONE warning, whatever sides it paints (measured 30/09: a magenta button read as five — background and four borders)', () => {
  const sides = [
    'background-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color'
  ]
  const d = driftFindings(report({ colors: sides.map((prop) => ({ ...magenta, prop })) }), null)
  assert.equal(d.warnings.length, 1)
  assert.equal(d.warnings[0].prop, 'background-color')
  assert.deepEqual(d.warnings[0].props, sides)
  assert.equal((d.next.match(/rgb\(255, 0, 255\)/g) ?? []).length, 1)
})

// Measured 30/09 on df2jbiz1 (final stand acceptance): the heading was made pink, then put back to
// the template's own #F0865A — and the revert was reported as NEW drift, because the last measure
// (the pink one) had no #F0865A. What the page wore before any write is a baseline too.
const coral = {
  prop: 'color',
  value: 'rgb(240, 134, 90)',
  band: 'off',
  nearest: { token: '--accent-hover', distance: 60 },
  count: 1,
  where: ['h1.tb-hero__title']
}
const pink = { ...coral, value: 'rgb(255, 0, 170)' }

test('a revert to what the page wore before any write is not new drift: off now, but off in the first measure of the page too', () => {
  const origin = report({ colors: [coral] })
  const before = report({ colors: [pink] })
  const d = driftFindings(report({ colors: [coral] }), before, origin)
  assert.equal(d.baseline, true)
  assert.deepEqual(d.warnings, [])
  assert.equal(d.next, null)
  assert.equal(d.existing, 1)
})

test('with a first measure of the page, what is new against BOTH it and the last measure is still a warning — and so is what grew past both', () => {
  const origin = report({ colors: [coral] })
  const before = report({ colors: [coral] })
  const d = driftFindings(report({ colors: [pink, { ...coral, count: 4 }] }), before, origin)
  assert.deepEqual(
    d.warnings.map((w) => w.value),
    ['rgb(255, 0, 170)', 'rgb(240, 134, 90)']
  )
  assert.equal(d.existing, 0)
})

test('the first measure alone (no last one) is a baseline: only what it lacked is a warning', () => {
  const d = driftFindings(report({ colors: [coral, pink] }), null, report({ colors: [coral] }))
  assert.equal(d.baseline, true)
  assert.deepEqual(
    d.warnings.map((w) => w.value),
    ['rgb(255, 0, 170)']
  )
  assert.equal(d.existing, 1)
})
