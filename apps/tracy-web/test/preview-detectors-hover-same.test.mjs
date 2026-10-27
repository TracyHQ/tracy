/**
 * hover-same (HOVER-2, 20/10/2026): a button or link whose hover or focus state looks exactly like its
 * rest state under a system while the template's own page changes it. A code review of JA Restaurant
 * found it by hand (grey grounds and their grey hovers both read the surface role on the dark variants).
 * Judged on hover-unreadable's probe data (`dataOf`), cut from real previews
 * (`fixtures/preview-detectors/hover-same.json`). Added within probe 10: a file measured before it reads
 * "not measured yet" for HOVER-2, outside the step's numbers, so no release judged green turns red.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DETECTORS, detectAll } from '../scripts/preview-detectors/index.mjs'
import { detect } from '../scripts/preview-detectors/hover-same.mjs'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import {
  BUILT_SITE_RULES,
  judgePreview,
  PREVIEW_KINDS
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

const SEVERITY = JSON.parse(
  readFileSync(
    new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
    'utf8'
  )
)
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/hover-same.json', import.meta.url), 'utf8')
)
const run = (/** @type {any} */ s) => detect({ worn: { data: s.worn.data }, plain: { data: s.plain.data } })

const grey = { r: 240, g: 240, b: 240, a: 1 }
const darker = { r: 210, g: 210, b: 210, a: 1 }
const ink = { r: 20, g: 20, b: 20, a: 1 }
const state = (/** @type {any} */ rest, /** @type {any} */ on) => [
  { path: 'a:1', at: 'a.btn', text: 'Read more', rest, on }
]

test('hover-same is loaded on hover-unreadable data, has its registry line, its rule and weighs worth-fixing', () => {
  const d = DETECTORS.find((x) => x.kind === 'hover-same')
  assert.ok(d, 'loaded')
  assert.equal(d.dataOf, 'hover-unreadable')
  assert.equal(d.probe, undefined, 'no second walk of the hover rules')
  // the probe it reads is still one expression a page can evaluate, and it reads the cue of each state
  const hover = DETECTORS.find((x) => x.kind === 'hover-unreadable')
  assert.doesNotThrow(() => new Function(`return ${hover?.probe}`))
  assert.match(String(hover?.probe), /cue: cueOf\(e, w\)/)
  const entry = PREVIEW_KINDS['hover-same']
  assert.equal(entry.rule, 'HOVER-2')
  assert.equal(entry.addedWithin, PREVIEW_PROBE_VERSION)
  assert.ok(entry.what && entry.fix)
  assert.ok(BUILT_SITE_RULES.includes('HOVER-2'))
  assert.ok(RULES.some((r) => r.id === 'HOVER-2'))
  assert.equal(SEVERITY.rules['HOVER-2'].group, 'worth-fixing')
  assert.equal(SEVERITY.rules['HOVER-2'].question, 'Preview')
})

test('hover-same fails on every broken sample of a real preview, passes on a clean one', () => {
  assert.ok(fixture.broken.length && fixture.clean.length)
  for (const s of fixture.broken) {
    const r = run(s)
    assert.ok(r.count > 0, `broken: ${s.source}`)
    for (const x of r.findings)
      assert.ok(String(x.at).trim() && x.was, 'each finding says where and what it was')
  }
  for (const s of fixture.clean) assert.equal(run(s).count, 0, `clean: ${s.source}`)
  // JA Smallbiz's "more info": the template darkens its ground on hover, Moxie keeps it
  const more = run(fixture.broken[0]).findings[0]
  assert.match(more.at, /btn-primary "more info"/)
  assert.match(more.was, /#73552f → #ffffff on #4f3a20$/)
})

test('a state that changes anything else, or one the template never changed, is no finding', () => {
  // the template's hover darkens the ground; under the system only an underline moves: still a hover
  const underlined = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: 'none' }, { fg: ink, bg: grey, cue: 'underline' }) },
    plain: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: darker }) }
  })
  assert.equal(underlined.count, 0)
  // the template's own hover is identical too: nothing the system took away
  const never = detect({
    worn: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: grey }) },
    plain: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: grey }) }
  })
  assert.equal(never.count, 0)
  // the same pair with the worn ground left as it was at rest: one finding
  const same = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: 'none' }, { fg: ink, bg: grey, cue: 'none' }) },
    plain: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: darker }) }
  })
  assert.equal(same.count, 1)
  assert.equal(same.findings[0].ground, '#f0f0f0')
})

test('detectAll hands hover-same the hover-unreadable probe data', () => {
  const [s] = fixture.broken
  const out = detectAll(
    { base: null, data: { 'hover-unreadable': s.worn.data }, html: '' },
    { base: null, data: { 'hover-unreadable': s.plain.data }, html: '' },
    { systemColours: [], scheme: 'dark' }
  )
  assert.equal(out['hover-same'].count, run(s).count)
})

test('HOVER-2 on a file measured before the detector: not measured yet, outside the numbers; judged once measured', () => {
  const row = {
    system: 'refero:moxie',
    scheme: 'dark',
    probeVersion: PREVIEW_PROBE_VERSION,
    kept: 0,
    keptShare: 0,
    glare: 0,
    keptText: 0,
    lowText: 0,
    lostButtons: 0,
    failedFonts: 0,
    empty: 0,
    docs: 1,
    detectors: { 'hover-unreadable': { count: 0, where: [] } }
  }
  const before = judgePreview([row])
  assert.equal(before['HOVER-2'].status, 'not-applicable')
  assert.match(before['HOVER-2'].note, /^not measured yet/)
  assert.equal(before['HOVER-1'].status, 'pass', 'HOVER-1 judged as before')
  const measured = (/** @type {number} */ count) =>
    judgePreview([
      { ...row, detectors: { ...row.detectors, 'hover-same': { count, where: count ? ['a.btn'] : [] } } }
    ])['HOVER-2']
  assert.equal(measured(0).status, 'pass')
  assert.equal(measured(2).status, 'fail')
  // once the probe moves past the version the kind joined, a file without it is unmeasured like any other
  const next = judgePreview(
    [{ ...row, probeVersion: PREVIEW_PROBE_VERSION + 1 }],
    undefined,
    undefined,
    null,
    PREVIEW_PROBE_VERSION + 1
  )
  assert.equal(next['HOVER-2'].status, 'unmeasurable')
})

test('a template hover that only adds an underline, gone under the system, is a finding (Sol review)', () => {
  const rest = (/** @type {string} */ deco) => `${deco}|rgb(20, 20, 20)||none||none|1`
  const r = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: rest('none') }, { fg: ink, bg: grey, cue: rest('none') }) },
    plain: {
      data: state({ fg: ink, bg: grey, cue: rest('none') }, { fg: ink, bg: grey, cue: rest('underline') })
    }
  })
  assert.equal(r.count, 1)
  // a template hover that only nudges a colour of its cues (the underline follows a small shift of the
  // words) is no visible change of its own: no finding
  const nudged = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: rest('none') }, { fg: ink, bg: grey, cue: rest('none') }) },
    plain: {
      data: state(
        { fg: ink, bg: grey, cue: 'underline|rgb(20, 20, 20)||none||none|1' },
        { fg: { r: 26, g: 26, b: 26, a: 1 }, bg: grey, cue: 'underline|rgb(26, 26, 26)||none||none|1' }
      )
    }
  })
  assert.equal(nudged.count, 0)
})

test('under the system, a cue colour off by rounding is still the rest state', () => {
  const r = detect({
    worn: {
      data: state(
        { fg: ink, bg: grey, cue: 'underline|rgb(20, 20, 20)||none||none|1' },
        { fg: { r: 21, g: 20, b: 20, a: 1 }, bg: grey, cue: 'underline|rgb(21, 20, 20)||none||none|1' }
      )
    },
    plain: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: darker }) }
  })
  assert.equal(r.count, 1)
  // a cue colour the system really moves (a border turning the accent) is a hover
  const moved = detect({
    worn: {
      data: state(
        { fg: ink, bg: grey, cue: 'none|rgb(20, 20, 20)|rgb(200, 200, 200)|none||none|1' },
        { fg: ink, bg: grey, cue: 'none|rgb(20, 20, 20)|rgb(37, 99, 235)|none||none|1' }
      )
    },
    plain: { data: state({ fg: ink, bg: grey }, { fg: ink, bg: darker }) }
  })
  assert.equal(moved.count, 0)
})

test('a template hover that only turns its border a colour, kept still under the system, is a finding', () => {
  const cue = (/** @type {string} */ line) => `none|rgb(20, 20, 20)|${line}|none||none|1`
  const r = detect({
    worn: {
      data: state(
        { fg: ink, bg: grey, cue: cue('rgb(200, 200, 200)') },
        { fg: ink, bg: grey, cue: cue('rgb(200, 200, 200)') }
      )
    },
    plain: {
      data: state(
        { fg: ink, bg: grey, cue: cue('rgb(200, 200, 200)') },
        { fg: ink, bg: grey, cue: cue('rgb(37, 99, 235)') }
      )
    }
  })
  assert.equal(r.count, 1)
})

test('a template hover that only deepens its shadow, kept still under the system, is a finding (second review)', () => {
  const cue = (/** @type {string} */ shadow) => `none|rgb(20, 20, 20)||${shadow}||none|1`
  const soft = cue('rgba(0, 0, 0, 0.2) 0px 2px 6px 0px')
  const r = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: soft }, { fg: ink, bg: grey, cue: soft }) },
    plain: {
      data: state(
        { fg: ink, bg: grey, cue: soft },
        { fg: ink, bg: grey, cue: cue('rgba(0, 0, 0, 0.8) 0px 2px 6px 0px') }
      )
    }
  })
  assert.equal(r.count, 1)
})

test('the probe reads the colour of a side border too (second review)', async () => {
  const { CUE_OF } = await import('../scripts/preview-detectors/hover-unreadable.mjs')
  const styleOf = (/** @type {string} */ left) => ({
    textDecorationLine: 'none',
    textDecorationColor: 'rgb(20, 20, 20)',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '2px',
    borderRightWidth: '0px',
    borderColor: `rgb(20, 20, 20) rgb(20, 20, 20) rgb(20, 20, 20) ${left}`,
    boxShadow: 'none',
    outlineStyle: 'none',
    transform: 'none',
    opacity: '1'
  })
  const cueWith = (/** @type {string} */ left) =>
    new Function('getComputedStyle', `return (${CUE_OF})({}, {})`)(() => styleOf(left))
  const rest = cueWith('rgb(200, 200, 200)')
  const on = cueWith('rgb(220, 38, 38)')
  assert.notEqual(rest, on, 'a left border turning red is a different cue')
  // and a hover that only does that, kept still under the system, is a finding
  const r = detect({
    worn: { data: state({ fg: ink, bg: grey, cue: rest }, { fg: ink, bg: grey, cue: rest }) },
    plain: { data: state({ fg: ink, bg: grey, cue: rest }, { fg: ink, bg: grey, cue: on }) }
  })
  assert.equal(r.count, 1)
})
