/**
 * ACCENT-LEAK is born with preview probe 10 (Akemi, 17/10/2026): its detector kind carries `since: 10`, and
 * until PREVIEW_PROBE_VERSION reaches it neither the kind nor its rule is judged, so a file measured at 9 never
 * reads "not measured" for a rule its probe could not see. At 10 a row that measured it is judged like any
 * preview rule: a leak fails with where it was seen, a clean row passes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACCENT_LEAK_SINCE,
  activeKinds,
  BUILT_SITE_RULES,
  judgePreview,
  PREVIEW_KINDS,
  previewRuleIds
} from '../src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../src/preview-probe-version.mjs'

const row = (/** @type {number} */ probeVersion, /** @type {any} */ detectors) => ({
  system: 'refero:b8ce0a90-40c6-4518-940c-8c97ccf9c1a0',
  scheme: 'light',
  page: '/',
  probeVersion,
  kept: 0,
  glare: 0,
  keptText: 0,
  lowText: 0,
  lostButtons: 0,
  docs: 1,
  failedFonts: 0,
  empty: 0,
  detectors
})

test('the kind and its rule are registered, and dormant before probe 10', () => {
  // on the rule list only from its probe (the batch's final gate flips PREVIEW_PROBE_VERSION to 10)
  assert.equal(BUILT_SITE_RULES.includes('ACCENT-LEAK'), PREVIEW_PROBE_VERSION >= ACCENT_LEAK_SINCE)
  assert.ok(!('accent-leak' in activeKinds(PREVIEW_KINDS, 9)))
  assert.ok(!previewRuleIds(PREVIEW_KINDS, 9).includes('ACCENT-LEAK'))
  assert.ok(previewRuleIds(PREVIEW_KINDS, 10).includes('ACCENT-LEAK'))
  // the kinds without `since` are all there at 9 (nothing else moved)
  const without = Object.keys(PREVIEW_KINDS).filter((k) => k !== 'accent-leak')
  assert.deepEqual(Object.keys(activeKinds(PREVIEW_KINDS, 9)).sort(), without.sort())
  if (PREVIEW_PROBE_VERSION < 10) assert.ok(!previewRuleIds().includes('ACCENT-LEAK'))
})

test('a v9 file: no ACCENT-LEAK entry, every other rule judged as before', () => {
  const at9 = judgePreview([row(9, {})], undefined, PREVIEW_KINDS, null, 9)
  assert.ok(!('ACCENT-LEAK' in at9))
  assert.ok('FOREIGN-1' in at9)
})

test('at probe 10 a leak fails with its place, a clean row passes, a row without the kind is unmeasured', () => {
  const leak = {
    count: 2,
    unique: 2,
    where: ['div.cta-wrap picture #2358de (bg-cta.jpg)', 'nav.menu a:hover words #1d4ed8']
  }
  const bad = judgePreview([row(10, { 'accent-leak': leak })], undefined, PREVIEW_KINDS, null, 10)[
    'ACCENT-LEAK'
  ]
  assert.equal(bad.status, 'fail')
  assert.match(bad.note, /bg-cta\.jpg/)
  assert.match(bad.note, /brand colour/)
  const ok = judgePreview(
    [row(10, { 'accent-leak': { count: 0, unique: 0, where: [] } })],
    undefined,
    PREVIEW_KINDS,
    null,
    10
  )
  assert.equal(ok['ACCENT-LEAK'].status, 'pass')
  const none = judgePreview([row(10, {})], undefined, PREVIEW_KINDS, null, 10)
  assert.equal(none['ACCENT-LEAK'].status, 'unmeasurable')
})
