/**
 * unworn-page (TPL-1, 15/10/2026): JA Kinetic WordPress's Blueprint and Signal homes pinned the theme's
 * presets on html[data-style], above the slot's :root presets, and kept their own cool greys with
 * indigo (Blueprint) and teal (Signal) under Moxie while TPL-1 read 0: the system's colours were read
 * off the worn page's `--ds-c-*`, which resolved to the template's palette there, so nothing kept
 * looked foreign. Judged on probe data cut from those previews (`fixtures/preview-detectors/
 * unworn-page.json`): the broken pages are found, the same pages after the slot fix, the template's
 * other home and Tracy Business pages are not.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { systemPaletteOf } from '../scripts/preview-detectors/lib/system-palette.mjs'
import { detect } from '../scripts/preview-detectors/unworn-page.mjs'
import { comparePreview } from '../src/sites/design-system-preview-probe.js'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/unworn-page.json', import.meta.url), 'utf8')
)
const run = (/** @type {any} */ s) =>
  detect({
    worn: { base: s.worn },
    plain: { base: s.plain },
    systemPalette: s.systemPalette
  })

test('unworn-page is loaded and fails TPL-1', () => {
  assert.ok(DETECTORS.some((d) => d.kind === 'unworn-page'))
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['unworn-page'].rule, 'TPL-1')
})

test("the system's palette comes from the library, both sides, not from the page", () => {
  const moxie = systemPaletteOf(
    new URL('../../..', import.meta.url).pathname,
    'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
  )
  // Moxie's own dark side and the light side derived from it
  for (const c of ['#000000', '#f4efd4', '#84acfb', '#4e6695']) assert.ok(moxie.includes(c), c)
  assert.deepEqual(systemPaletteOf('/nowhere', 'refero:00000000-0000-0000-0000-000000000000'), [])
})

test("why TPL-1 read 0: the page's own --ds-c-* named the template's palette as the system's", () => {
  for (const s of fixture.broken) {
    // what the worn page called the system's colours: the template's indigo or teal among them
    assert.ok(s.systemColours.includes(s === fixture.broken[0] ? '#4f46e5' : '#0e7490'), s.source)
    const old = comparePreview(s.worn, s.plain, s.systemColours)
    assert.equal(old.kept.length + old.keptText.length, 0, `${s.source}: the old checks saw nothing`)
  }
})

test("Kinetic WordPress's Blueprint and Signal homes kept the template's grounds and accent under Moxie", () => {
  assert.ok(fixture.broken.length >= 2)
  for (const s of fixture.broken) {
    const r = run(s)
    assert.ok(r.count > 0, s.source)
    assert.ok(
      r.findings.some((/** @type {any} */ f) => f.role === 'ground'),
      `${s.source}: a kept ground`
    )
    assert.ok(
      r.findings.some((/** @type {any} */ f) => f.role === 'accent'),
      `${s.source}: the kept accent`
    )
  }
  const [blueprint, signal] = fixture.broken.map(run)
  assert.ok(
    blueprint.findings.some((/** @type {any} */ f) => f.colour === '#4f46e5'),
    'Blueprint indigo'
  )
  assert.ok(
    signal.findings.some((/** @type {any} */ f) => f.colour === '#0e7490'),
    'Signal teal'
  )
})

test('the same pages after the slot fix, and pages that wore the system, pass', () => {
  assert.ok(fixture.clean.length >= 3)
  for (const s of fixture.clean) assert.equal(run(s).count, 0, s.source)
})

test('without the library palette (an older run) nothing is judged', () => {
  const s = fixture.broken[0]
  assert.equal(detect({ worn: { base: s.worn }, plain: { base: s.plain }, systemPalette: [] }).count, 0)
})
