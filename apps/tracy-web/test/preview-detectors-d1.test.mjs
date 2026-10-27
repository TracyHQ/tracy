/**
 * Three detectors of the design system preview (PR 2 of 14/10/2026), each judged on samples cut from
 * the previews of that day (`preview-check.mjs`, Moxie, fleet01 demos): the page as the visitor sees it
 * wearing the system, and the same page without it. Each detector must fail the broken sample the eye
 * audit found and pass a clean one. No sample is exempted: the detectors take no list of templates.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import * as logo from '../scripts/preview-detectors/logo-invisible.mjs'
import * as reveal from '../scripts/preview-detectors/reveal-hidden.mjs'
import * as fonts from '../scripts/preview-detectors/template-fonts-left.mjs'
import { judgePreview, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

const SEVERITY = JSON.parse(
  readFileSync(
    new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
    'utf8'
  )
)

/** One sample: { source, scheme, plain, worn, slot } as captured. */
const sample = (/** @type {string} */ name) =>
  JSON.parse(readFileSync(new URL(`fixtures/preview-detectors/${name}.json`, import.meta.url), 'utf8'))

/** The detector's input from a sample, as `detectAll` builds it. */
const input = (/** @type {any} */ s) => ({
  worn: { base: null, data: s.worn, html: s.slot ?? '' },
  plain: { base: null, data: s.plain, html: '' },
  systemColours: [],
  scheme: s.scheme
})

test('each of the three kinds is loaded, has its rule in the registry and a severity entry with its text', () => {
  for (const k of ['logo-invisible', 'template-fonts-left', 'reveal-hidden']) {
    assert.ok(
      DETECTORS.some((d) => d.kind === k && typeof d.probe === 'string'),
      `${k} loaded with a probe`
    )
    const entry = PREVIEW_KINDS[k]
    assert.ok(entry?.rule && entry.what && entry.fix, `${k} registry line`)
    const sev = SEVERITY.rules[entry.rule]
    assert.ok(sev && /^(must-fix|worth-fixing)$/.test(sev.group) && sev.text, `${entry.rule} severity`)
  }
})

test('logo-invisible fails a light logo inverted onto a dark header (ja-trip, dark visitor)', () => {
  const r = logo.detect(input(sample('logo-ja-trip-dark')))
  assert.ok(r.count >= 1, JSON.stringify(r))
  assert.match(r.findings[0].at, /logo/)
  assert.ok(r.findings[0].contrast < logo.LOGO_FLOOR)
})

test('logo-invisible fails a dark logo kept on the system dark band (ja-nova)', () => {
  const r = logo.detect(input(sample('logo-ja-nova-light')))
  assert.ok(r.count >= 1, JSON.stringify(r))
})

test('logo-invisible passes a logo the system keeps readable (ja-voyara)', () => {
  const r = logo.detect(input(sample('logo-ja-voyara-light')))
  assert.equal(r.count, 0, JSON.stringify(r))
})

test('logo-invisible: an inversion the system adds flips the ink; a logo already poor on the template is not the system', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const black = { r: 0, g: 0, b: 0, a: 1 }
  const plain = [{ path: 'a', at: 'img.logo', src: 'logo.png', filter: null, ground: white, ink: null }]
  const inverted = [{ ...plain[0], ground: black, filter: 'invert(1) hue-rotate(180deg)' }]
  assert.equal(logo.detect({ worn: { data: inverted }, plain: { data: plain } }).count, 0)
  assert.equal(
    logo.detect({ worn: { data: [{ ...plain[0], ground: black }] }, plain: { data: plain } }).count,
    1
  )
  const poor = [{ ...plain[0], ink: 0.9 }]
  assert.equal(
    logo.detect({ worn: { data: [{ ...poor[0], ground: white }] }, plain: { data: poor } }).count,
    0
  )
})

test('template-fonts-left fails text kept in the template fonts (ja-trip DM Sans)', () => {
  const r = fonts.detect(input(sample('fonts-ja-trip-light')))
  assert.ok(r.count > 0, JSON.stringify(r))
  assert.ok(r.findings.some((f) => f.family === 'dm sans'))
})

test('template-fonts-left passes a page whose text all moved to the system (ja-voyara)', () => {
  const r = fonts.detect(input(sample('fonts-ja-voyara-light')))
  assert.equal(r.count, 0, JSON.stringify(r))
})

test('template-fonts-left reads the system families from the slot only', () => {
  const html =
    '<style id="tracy-ds-slot">:root{--ds-font-body:"IBM Plex Sans", sans-serif} h1{font-family:var(--x)}</style>'
  assert.deepEqual([...fonts.systemFamilies(html)], ['ibm plex sans'])
  const data = { families: { metropolis: { blocks: 3, chars: 90, at: ['span'] } } }
  // no slot on the page: the system moved nothing, nothing is left behind
  assert.equal(fonts.detect({ worn: { data, html: '' }, plain: { data } }).count, 0)
})

test('reveal-hidden fails blocks left at opacity 0 by data-aos (ja-phio)', () => {
  const r = reveal.detect(input(sample('reveal-ja-phio-light')))
  assert.ok(r.count >= 5, JSON.stringify(r).slice(0, 300))
})

test('reveal-hidden fails .ja-animate blocks (ja-resume)', () => {
  const r = reveal.detect(input(sample('reveal-ja-resume-light')))
  assert.ok(r.count >= 5, JSON.stringify(r).slice(0, 300))
})

test('reveal-hidden passes a page with nothing waiting for a script (ja-voyara)', () => {
  const r = reveal.detect(input(sample('reveal-ja-voyara-light')))
  assert.equal(r.count, 0, JSON.stringify(r))
})

test('a kind with a count fails its rule in judgePreview', () => {
  const row = {
    system: 'refero:moxie',
    scheme: 'light',
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
    detectors: {
      'logo-invisible': { count: 0, where: [] },
      'template-fonts-left': { count: 0, where: [] },
      'reveal-hidden': { count: 23, where: ['div.hero-item'] }
    }
  }
  const j = judgePreview([row])
  assert.equal(j['PREV-2'].status, 'fail')
  assert.equal(j['IDENT-2'].status, 'pass')
  assert.equal(j['FONT-2'].status, 'pass')
})
