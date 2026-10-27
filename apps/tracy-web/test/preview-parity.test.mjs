/**
 * PREVIEW-PARITY (probe v10): the Design system popup against the page after Try on. The probe readings
 * below are cut from the lane measure of 17/10/2026 (scratchpad popup-parity): JA Essence's Owl hero left
 * unbuilt by the static popup, JA Vital's Font Awesome refused in the popup before 34df1669e8.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareParity } from '../scripts/preview-parity/compare.mjs'
import {
  BUILT_SITE_RULES,
  judgeMeasurement,
  judgeParity,
  PARITY_RULE,
  PARITY_SINCE,
  validateMeasurement
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { validateParity } from '../../../packages/design/tracy-ds-slot/src/preview-parity.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

const page = (over = {}) => ({
  width: 1440,
  height: 6000,
  slot: 'refero:x',
  icons: { 'Font Awesome 6 Free': { glyphs: 12, ok: true, at: 'header > nav' } },
  fonts: { inter: { words: 120, ok: true, at: 'main > p' } },
  boxes: {
    '#t4-header': { w: 1440, h: 96, seen: true },
    '#t4-main-body': { w: 1440, h: 2400, seen: true },
    '#t4-main-body > div.container': { w: 1170, h: 2400, seen: true }
  },
  sliders: { '#hero > div.owl-carousel': { built: true, showing: 3, itemW: 380, h: 520, w: 1170 } },
  ...over
})

test('the same page under the same rules: nothing differs', () => {
  assert.deepEqual(compareParity(page(), page()), { count: 0, findings: [] })
})

test('a few pixels of a later animation frame or a font metric are not a difference', () => {
  const popup = page({
    height: 6060,
    boxes: { ...page().boxes, '#t4-header': { w: 1440, h: 120, seen: true } },
    sliders: { '#hero > div.owl-carousel': { built: true, showing: 3, itemW: 372, h: 540, w: 1170 } }
  })
  assert.equal(compareParity(popup, page()).count, 0)
})

test('JA Vital before 34df1669e8: Font Awesome refused in the popup draws empty squares', () => {
  const popup = page({ icons: { 'Font Awesome 6 Free': { glyphs: 12, ok: false, at: 'header > nav' } } })
  const r = compareParity(popup, page())
  assert.equal(r.count, 1)
  assert.equal(r.findings[0].kind, 'icon')
  assert.equal(r.findings[0].family, 'Font Awesome 6 Free')
})

test('a text font Try on loads and the popup does not', () => {
  const r = compareParity(page({ fonts: { inter: { words: 120, ok: false, at: 'main > p' } } }), page())
  assert.deepEqual(
    r.findings.map((f) => f.kind),
    ['font']
  )
})

test("JA Essence's Owl hero unbuilt in the static popup: one slider finding, its section not told twice", () => {
  const popup = page({
    boxes: {
      ...page().boxes,
      '#t4-main-body': { w: 1440, h: 3400, seen: true },
      '#t4-main-body > div.container': { w: 1170, h: 3400, seen: true }
    },
    sliders: {}
  })
  const r = compareParity(popup, page())
  const kinds = r.findings.map((f) => `${f.kind} ${f.at}`)
  assert.ok(kinds.includes('slider #hero > div.owl-carousel'))
  // the container's height follows from what is inside it; only the innermost block is a finding
  assert.ok(kinds.includes('box #t4-main-body > div.container'))
  assert.ok(!kinds.includes('box #t4-main-body'))
})

test('a carousel built in both but with two slides showing instead of three', () => {
  const popup = page({
    sliders: { '#hero > div.owl-carousel': { built: true, showing: 2, itemW: 560, h: 520, w: 1170 } }
  })
  const [f] = compareParity(popup, page()).findings
  assert.equal(f.kind, 'slider')
  assert.match(f.why, /2 slides showing, not 3/)
  assert.match(f.why, /slide 560px wide/)
})

test('a block Try on shows and the popup hides', () => {
  const popup = page({ boxes: { ...page().boxes, '#t4-header': { w: 0, h: 0, seen: false } } })
  assert.deepEqual(compareParity(popup, page()).findings, [
    { kind: 'box', at: '#t4-header', tryOn: [1440, 96], popup: 'hidden' }
  ])
})

const block = (rows, over = {}) => ({
  probeVersion: PARITY_SINCE,
  popup: 'live',
  measuredAt: '2026-10-17T12:00:00.000Z',
  pages: ['/', '/about'],
  rows,
  ...over
})
const row = (pagePath, count = 0, findings = []) => ({
  page: pagePath,
  system: 'refero:a',
  width: 1440,
  count,
  findings
})

test('judgeParity: every declared page compared and the same is a pass', () => {
  assert.equal(judgeParity(block([row('/'), row('/about')])).status, 'pass')
})

test('judgeParity: a difference fails and names the kind, the place and the page', () => {
  const r = judgeParity(
    block([row('/', 1, [{ kind: 'icon', at: 'header > nav', family: 'FontAwesome' }]), row('/about')])
  )
  assert.equal(r.status, 'fail')
  assert.match(r.note, /icon glyphs that do not load/)
  assert.match(r.note, /FontAwesome \(header > nav\) on \/ refero:a\/1440/)
})

test('judgeParity: no block, an older probe or a declared page without a row is never a pass', () => {
  assert.equal(judgeParity(undefined).status, 'unmeasurable')
  assert.equal(judgeParity(block([row('/'), row('/about')], { probeVersion: 9 })).status, 'unmeasurable')
  assert.equal(judgeParity(block([row('/')])).status, 'unmeasurable')
})

test('validateParity: the block the script writes validates; a broken one does not', () => {
  assert.deepEqual(validateParity(block([row('/')])), [])
  assert.ok(validateParity({ rows: 'x' }).length >= 3)
})

test('dormant until probe v10: not a built-site rule, not judged, and the block does not trip a v9 file', () => {
  if (PREVIEW_PROBE_VERSION >= PARITY_SINCE) {
    assert.ok(BUILT_SITE_RULES.includes(PARITY_RULE))
    return
  }
  assert.ok(!BUILT_SITE_RULES.includes(PARITY_RULE))
  const doc = {
    schemaVersion: 'tdsr-measurement/v1',
    perSystem: [],
    previewParity: block([row('/', 1, [{ kind: 'page', at: 'page' }])])
  }
  assert.ok(!(PARITY_RULE in judgeMeasurement(doc)))
  assert.ok(!validateMeasurement(doc).some((m) => m.startsWith('previewParity')))
})

test('dormant until probe v10: /ops does not list the rule', async () => {
  const { RULES } = await import('../src/lib/template-design-system-readiness/index.js')
  assert.equal(
    RULES.some((r) => r.id === PARITY_RULE),
    PREVIEW_PROBE_VERSION >= PARITY_SINCE
  )
})
