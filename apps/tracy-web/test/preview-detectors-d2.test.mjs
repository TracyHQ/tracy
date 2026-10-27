/**
 * The five preview detectors of D2 (PR 2, 14/10/2026), judged on probe data cut from real Add site
 * previews (`fixtures/preview-detectors/<kind>.json`): each must fail on its broken samples (ja-trip,
 * ja-space, ja-sensei, ja-mood gradients; ja-mood and ja-prodex shapes; Tracy Base EmDash and ja-resume
 * hand-written colours; ja-nova's periwinkle band with white text; ja-trip's Search and ja-voyara's
 * Subscribe) and pass on a clean page. There is no exemption list to pass by: a detector reads only
 * what the page shows.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'

const KINDS = ['gradient-stop', 'shape-fill', 'mock-colour', 'accent-surface', 'collapsed-button']
const fixture = (/** @type {string} */ kind) =>
  JSON.parse(readFileSync(new URL(`./fixtures/preview-detectors/${kind}.json`, import.meta.url), 'utf8'))
const run = async (/** @type {string} */ kind, /** @type {any} */ s) => {
  const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
  return m.detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' },
    systemColours: s.systemColours,
    scheme: 'light'
  })
}

for (const kind of KINDS)
  test(`${kind}: fails on every broken sample of a real preview, passes on a clean one`, async () => {
    const f = fixture(kind)
    assert.ok(f.broken.length && f.clean.length, 'both kinds of sample')
    for (const s of f.broken) {
      const r = await run(kind, s)
      assert.ok(r.count > 0, `broken: ${s.source}`)
      assert.equal(r.count, r.findings.length)
      for (const x of r.findings) assert.ok(String(x.at ?? '').trim(), 'each finding says where')
    }
    for (const s of f.clean) assert.equal((await run(kind, s)).count, 0, `clean: ${s.source}`)
  })

test('each finding says what it saw', async () => {
  const [trip, space] = fixture('gradient-stop').broken
  const g = (await run('gradient-stop', trip)).findings[0]
  assert.ok(g.text && g.half, 'ja-trip: a text gradient, its first stop the system')
  assert.deepEqual(g.template, ['#00affa', '#0190cd', '#764ada'], 'every stop past the first')
  assert.ok((await run('gradient-stop', space)).findings.some((x) => x.template.includes('#f55d59')))
  const mood = (await run('shape-fill', fixture('shape-fill').broken[0])).findings[0]
  assert.match(mood.at, /elementor-shape-fill/)
  assert.deepEqual(mood.colours, ['#f4f5f6'], "the template's light grey, not the system's cream")
  const bars = (await run('mock-colour', fixture('mock-colour').broken[0])).findings
  assert.ok(bars.every((x) => x.source === 'class' && x.colours.backgroundColor === '#0a4fa8'))
  const nova = (await run('accent-surface', fixture('accent-surface').broken[0])).findings[0]
  assert.equal(nova.colour, '#84acfb')
  assert.ok(nova.low.every((/** @type {any} */ x) => x.ratio < 4.5))
  const [search, subscribe] = (
    await Promise.all(fixture('collapsed-button').broken.map((s) => run('collapsed-button', s)))
  ).map((r) => r.findings[0])
  assert.match(search.why, /collapsed to 42×14px/)
  assert.equal(subscribe.why, 'label cut')
})

test('a shape painted in a colour of the system, or a picture, is not counted', async () => {
  const m = await import('../scripts/preview-detectors/shape-fill.mjs')
  const shape = (/** @type {string} */ c) => ({
    shapes: [{ path: 'div:1/svg:1/path:1', at: 'div svg path', area: 9000, colours: [JSON.parse(c)] }],
    excluded: [{ at: 'div::before', reason: 'raster background of a pseudo-element' }]
  })
  const grey = '{"r":244,"g":245,"b":246,"a":1}'
  const kept = m.detect({
    worn: { data: shape(grey) },
    plain: { data: shape(grey) },
    systemColours: ['#f4efd4']
  })
  assert.equal(kept.count, 1)
  assert.equal(kept.excluded[0].reason, 'raster background of a pseudo-element')
  const sys = m.detect({
    worn: { data: shape(grey) },
    plain: { data: shape(grey) },
    systemColours: ['#f4f5f0']
  })
  assert.equal(sys.count, 0)
})

test('every D2 kind has its registry line, its rule in the check, and a severity with a fix', async () => {
  const ids = RULES.map((r) => r.id)
  for (const kind of KINDS) {
    const k = PREVIEW_KINDS[kind]
    assert.ok(k?.rule && k.what && k.fix, kind)
    assert.ok(BUILT_SITE_RULES.includes(k.rule), `${kind}: ${k.rule} in BUILT_SITE_RULES`)
    assert.ok(ids.includes(k.rule), `${kind}: ${k.rule} is a rule of the check`)
    const s = DS_RULE_SEVERITY[k.rule]
    assert.ok(s && ['must-fix', 'worth-fixing'].includes(s.group) && String(s.fix ?? '').trim(), k.rule)
    const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
    assert.equal(m.kind, kind)
    // the probe is one expression the page evaluates; here it must at least parse
    assert.doesNotThrow(() => new Function(`return ${m.probe}`), kind)
  }
})
