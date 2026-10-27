/**
 * What measuring every declared page of Tracy Business Joomla taught the checks (15/10/2026), each on
 * probe data cut from that day's previews (`fixtures/preview-detectors/tracy-business-joomla.json`):
 * - a ruled grid (a list painted in the border colour behind opaque cells, 1px gaps) is lines, not a
 *   block: under Moxie's dark side its cream fill was judged a glare block although the page shows
 *   thin cream lines between black cells (HAIRLINES_IN_PAGE marks it `lines`);
 * - a button the template draws with a class of its own (a "__cta" span) is a button: the drawn
 *   contact slide's orange call became a pale blue box on the blue slide and no check saw it;
 * - a button joined to the field before it (a search bar) wears the field's corner, and says nothing
 *   of the system's corner; a small square glyph button is an icon control, not a stretched pill.
 * - a band gradient with no stop of the system keeps the template wash far off the worn page (JA
 *   Kinetic Joomla tags masthead, found by eye): gradient-stop judges it against the page ground.
 * No exemption list: each rule reads only what the page shows.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { comparePreview, HAIRLINES_IN_PAGE } from '../src/sites/design-system-preview-probe.js'
import { offRole, systemCorner } from '../scripts/preview-detectors/button-role.mjs'
import { detect as buttonSize } from '../scripts/preview-detectors/button-size.mjs'
import { systemOf } from '../scripts/preview-detectors/lib/colour.mjs'

const F = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/tracy-business-joomla.json', import.meta.url), 'utf8')
)
const strip = (/** @type {any} */ p) => ({ ...p, blocks: p.blocks.map(({ lines: _lines, ...b }) => b) })

test('a ruled grid is lines: its border-coloured fill is not a glare block, the same box without the mark is', () => {
  const s = F.hairlineGrid
  assert.ok(s.worn.blocks[0].lines, 'the probe marked the services grid as lines')
  assert.equal(comparePreview(s.worn, s.plain, s.systemColours).glare.length, 0)
  // the mark is what decides: the same real box read as a plain block is glare
  assert.equal(comparePreview(strip(s.worn), strip(s.plain), s.systemColours).glare.length, 1)
  assert.match(HAIRLINES_IN_PAGE, /borderLeftWidth/, 'the open area is measured inside the grid border')
})

test('a drawn button that lost its shape on its ground is a lost button; painted with the page pair it is not', () => {
  const { broken, clean } = F.drawnButton
  const lost = comparePreview(broken.worn, broken.plain, broken.systemColours).lostButtons
  assert.equal(lost.length, 1, broken.source)
  assert.match(lost[0].at, /tb-kitslide__cta/)
  assert.equal(
    comparePreview(clean.worn, clean.plain, clean.systemColours).lostButtons.length,
    0,
    clean.source
  )
})

test('a button joined to its field keeps the field corner without a finding; unjoined, the same corner is one', () => {
  const s = F.joined
  const colours = systemOf(s.systemColours)
  const bar = s.worn['button-role'].buttons.find((/** @type {any} */ b) => /tb-searchbar__btn/.test(b.at))
  assert.ok(bar.field, 'the probe saw the search field before the button')
  // judged against a pill system button (Moxie's), the joined square button is not off
  assert.equal(offRole(bar, { radius: 1000 }, colours), null)
  const { field: _field, ...unjoined } = bar
  assert.match(String(offRole(unjoined, { radius: 1000 }, colours)), /corner/)
})

test("a joined accent button is not the system's corner: the round icon button is not judged off it", () => {
  const s = F.joinedAccent
  const colours = systemOf(s.systemColours)
  const data = s.worn['button-role']
  const icon = data.buttons.find((/** @type {any} */ b) => /tb-header__search/.test(b.at))
  assert.doesNotMatch(String(offRole(icon, systemCorner(data), colours)), /corner/)
  // read with the joined button as a system button, its square corner made the icon button "off"
  const asSystem = { ...data, buttons: data.buttons.map(({ field: _field, ...b }) => b) }
  assert.match(String(offRole(icon, systemCorner(asSystem), colours)), /corner/)
})

test('a small square glyph button rounded by the system is an icon control, not a stretched pill', () => {
  const s = F.joined
  const r = buttonSize({
    worn: { base: null, data: s.worn['button-size'], html: '' },
    plain: { base: null, data: s.plain['button-size'], html: '' }
  })
  assert.ok(!r.findings.some((/** @type {any} */ f) => /tb-header__search/.test(f.at)))
  // the same box with a word label would be a band-stretched pill
  const worded = s.worn['button-size'].map((/** @type {any} */ b) =>
    /tb-header__search/.test(b.at) ? { ...b, text: 'Search' } : b
  )
  const r2 = buttonSize({
    worn: { base: null, data: worded, html: '' },
    plain: { base: null, data: s.plain['button-size'], html: '' }
  })
  assert.ok(r2.findings.some((/** @type {any} */ f) => /tb-header__search/.test(f.at)))
})

test('a band gradient with no stop of the system keeps a template wash far off the worn page: a gradient-stop finding', async () => {
  // JA Kinetic Joomla's tags masthead under Moxie's dark side, found by eye 15/10/2026: a #F2F5EE wash
  // on the black page under a title turned light; no stop of that gradient is the system's
  const { detect } = await import('../scripts/preview-detectors/gradient-stop.mjs')
  const G = JSON.parse(
    readFileSync(
      new URL('./fixtures/preview-detectors/gradient-stop-band-glare.json', import.meta.url),
      'utf8'
    )
  )
  const run = (/** @type {any} */ s) =>
    detect({ worn: s.worn, plain: s.plain, systemColours: s.systemColours })
  for (const s of G.broken) {
    const r = run(s)
    assert.equal(r.count, 1, s.source)
    assert.deepEqual(r.findings[0].template, ['#f2f5ee'])
  }
  for (const s of G.clean) assert.equal(run(s).count, 0, s.source)
})
