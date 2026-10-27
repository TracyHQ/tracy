/**
 * The button gaps G2 of PR 2 found on dev after PR 1356 (14/10/2026), judged on probe data cut from
 * real Add site previews under Moxie, light and dark (`fixtures/preview-detectors/button-*.json`):
 * - button-size (CLIP-1): JA Resort Joomla's header BOOK NOW!, a 330 x 120 px block its header
 *   stretches, rounded into a 330 x 120 px pill; Tracy Base WordPress passes.
 * - button-role (BTN-1): Tracy Base WordPress's CTA band buttons, a square black wrapper around the
 *   pill where the system's buttons are pills; JA Resort, all pills in the accent or outline, passes.
 * No exemption list: a detector reads only what the page shows.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'

const KINDS = ['button-size', 'button-role']
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

test("button-size: JA Resort's header block became a pill, in both schemes", async () => {
  for (const s of fixture('button-size').broken) {
    const book = (await run('button-size', s)).findings.find((x) => /BOOK NOW!/.test(x.text))
    assert.ok(book, s.source)
    assert.equal(book.size, '330×120')
    assert.match(book.why, /stretched .* rounded into a pill/)
  }
})

test('button-size: a size change both ways, a padding or line-height blow-up', async () => {
  const { sizeChange } = await import('../scripts/preview-detectors/button-size.mjs')
  const was = { text: 'Go', w: 129, h: 44, padY: 28, lh: 16, font: 16, bw: 0, radius: 0 }
  assert.match(sizeChange({ ...was, w: 330, h: 120 }, was), /grew from 129×44 to 330×120px/)
  assert.match(sizeChange({ ...was, w: 60, h: 24 }, was), /shrank/)
  assert.equal(
    sizeChange({ ...was, w: 106, h: 37, padY: 12, lh: 22 }, { ...was, w: 123, h: 61 }),
    null,
    "JA Resort's CHECK: smaller, but it still holds its label"
  )
  assert.match(sizeChange({ ...was, padY: 80, h: 96 }, was), /vertical padding 28 to 80px/)
  assert.match(sizeChange({ ...was, lh: 60, h: 88 }, was), /line height 16 to 60px/)
  assert.equal(sizeChange({ ...was, w: 140, h: 48, radius: 999 }, was), null, 'a system-sized pill')
  assert.equal(sizeChange({ ...was, w: 20, h: 10 }, was), null, 'collapsed: left to collapsed-button')
})

test("button-role: Tracy Base's CTA wrappers are square where the system's buttons are pills", async () => {
  for (const s of fixture('button-role').broken) {
    const r = await run('button-role', s)
    assert.deepEqual(
      r.findings.map((x) => x.text),
      ['Start a conversation', 'Explore our services →'],
      s.source
    )
    for (const x of r.findings) {
      assert.match(x.at, /tracy-btn--inverse/, 'the box the visitor sees is the wrapper')
      assert.match(x.why, /corner 0px where the system's button has 17px/)
    }
  }
})

test("button-role: a fill or outline outside the system's colours, a corner off --ds-btn-radius", async () => {
  const { detect } = await import('../scripts/preview-detectors/button-role.mjs')
  const b = (/** @type {any} */ o) => ({
    path: 'a:1',
    at: 'a.btn',
    text: 'Go',
    w: 120,
    h: 40,
    radius: 8,
    fill: null,
    border: null,
    ...o
  })
  const page = (/** @type {any[]} */ buttons, radius = 8) => ({
    data: { tokens: { radius, accent: { r: 132, g: 172, b: 251, a: 1 } }, buttons }
  })
  const sys = ['#84acfb', '#000000', '#f4efd4']
  const kept = detect({
    worn: page([b({ fill: { r: 211, g: 178, b: 152, a: 1 } })]),
    plain: page([]),
    systemColours: sys
  })
  assert.match(kept.findings[0].why, /fill #d3b298 is none of the system's colours/)
  const outline = detect({
    worn: page([b({ border: { r: 211, g: 178, b: 152, a: 1 } })]),
    plain: page([]),
    systemColours: sys
  })
  assert.match(outline.findings[0].why, /outline #d3b298/)
  const square = detect({
    worn: page([b({ fill: { r: 132, g: 172, b: 251, a: 1 }, radius: 0 })]),
    plain: page([]),
    systemColours: sys
  })
  assert.match(square.findings[0].why, /corner 0px where the system's button has 8px/)
  const ok = detect({
    worn: page([b({ fill: { r: 132, g: 172, b: 251, a: 1 } }), b({})]),
    plain: page([]),
    systemColours: sys
  })
  assert.equal(ok.count, 0, 'the system button, and a text-like button with no fill nor outline')
})

test('each button kind has its registry line, its rule in the check, a severity with a fix, and loads', async () => {
  const ids = RULES.map((r) => r.id)
  for (const kind of KINDS) {
    const k = PREVIEW_KINDS[kind]
    assert.ok(k?.rule && k.what && k.fix, kind)
    assert.ok(BUILT_SITE_RULES.includes(k.rule), `${kind}: ${k.rule} in BUILT_SITE_RULES`)
    assert.ok(ids.includes(k.rule), `${kind}: ${k.rule} is a rule of the check`)
    const s = DS_RULE_SEVERITY[k.rule]
    assert.ok(s && ['must-fix', 'worth-fixing'].includes(s.group) && String(s.fix ?? '').trim(), k.rule)
    assert.ok(
      DETECTORS.some((d) => d.kind === kind),
      `${kind} is loaded by index.mjs`
    )
    const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
    assert.doesNotThrow(() => new Function(`return ${m.probe}`), kind)
  }
})

test('collapsed-button: a text-link toggle as high as its own type is not collapsed; a box under its type is', async () => {
  const { detect } = await import('../scripts/preview-detectors/collapsed-button.mjs')
  const toggle = {
    path: 'header:1/button:1',
    at: 'button.tb-theme-toggle',
    text: 'Dark',
    w: 49,
    h: 15,
    font: 13,
    clipped: false,
    icon: false
  }
  assert.equal(
    detect({ worn: { data: [toggle] }, plain: { data: [toggle] } }).count,
    0,
    "Tracy Business Joomla's theme switch"
  )
  const squashed = { ...toggle, h: 9 }
  assert.equal(detect({ worn: { data: [squashed] }, plain: { data: [toggle] } }).count, 1)
})

test('button-role: a link painted as a button with no button class is judged when it wears the accent', async () => {
  // JA Kinetic WordPress home under Moxie (15/10/2026): "Read the KineticQL docs" is a.acm-split-cta, an
  // accent-filled 8px box beside the system's pills; no button selector read it, and the check passed
  const f = fixture('button-role-link')
  for (const s of f.broken) {
    const r = await run('button-role', s)
    assert.deepEqual(
      r.findings.map((x) => x.text),
      ['Read the KineticQL docs'],
      s.source
    )
    assert.match(r.findings[0].at, /acm-split-cta/)
    assert.match(r.findings[0].why, /corner 8px where the system's button has 22px/)
  }
  for (const s of f.clean) assert.equal((await run('button-role', s)).count, 0, s.source)
  // a link filled with anything but the accent (a tag, a card) is not read as a button
  const { detect } = await import('../scripts/preview-detectors/button-role.mjs')
  const accent = { r: 132, g: 172, b: 251, a: 1 }
  const link = { path: 'a:1', at: 'a.tag', text: 'News', w: 80, h: 28, radius: 2, border: null, link: true }
  const page = (/** @type {any} */ fill) => ({
    data: { tokens: { radius: 22, accent }, buttons: [{ ...link, fill }] }
  })
  const colours = ['#84acfb', '#eeeeee']
  assert.equal(
    detect({ worn: page({ r: 238, g: 238, b: 238, a: 1 }), plain: page(null), systemColours: colours }).count,
    0
  )
  assert.equal(detect({ worn: page(accent), plain: page(null), systemColours: colours }).count, 1)
})
