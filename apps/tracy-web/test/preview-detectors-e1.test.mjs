/**
 * E1 of PR 2 (14/10/2026): two role inversions the eye saw on fleet01 after PR 1356, judged on probe
 * data cut from real Add site previews under Moxie (`fixtures/preview-detectors/<kind>.json`):
 * - muted-highlight (HIER-1): JA Nova Joomla's highlighted words ("We make", "Start building",
 *   "1200+") went from the template's green, red or yellow to a khaki dimmer than the heading around
 *   them; JA Podcast (its highlight turned cream, louder), Phio, Prodex, Voyara and Morgan pass.
 * - button-dark (BTN-1): JA Podcast's and JA Prodex's btn-dark became a cream pill, the lightest fill
 *   of the page; JA Voyara, Nova, Morgan and Phio pass.
 * No exemption list: a detector reads only what the page shows.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'

const KINDS = /** @type {const} */ (['muted-highlight', 'button-dark'])
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
const severity = JSON.parse(
  readFileSync(
    new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
    'utf8'
  )
)

test('the two kinds are registered: HIER-1 is a must-fix rule of its own, button-dark fails BTN-1', () => {
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['muted-highlight'].rule, 'HIER-1')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['button-dark'].rule, 'BTN-1')
  assert.ok(BUILT_SITE_RULES.includes('HIER-1'))
  assert.ok(RULES.some((r) => r.id === 'HIER-1'))
  assert.equal(severity.rules['HIER-1'].group, 'must-fix')
  assert.equal(severity.rules['BTN-1'].group, 'must-fix')
  for (const k of KINDS) assert.ok(DETECTORS.some((d) => d.kind === k && d.probe))
})

for (const kind of KINDS)
  test(`${kind}: fails on every broken sample of a real preview, passes on every clean one`, async () => {
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

test("muted-highlight: JA Nova's highlighted words are the ones the eye saw turn khaki", async () => {
  for (const s of fixture('muted-highlight').broken) {
    const r = await run('muted-highlight', s)
    const words = r.findings.map((x) => x.text)
    for (const w of ['We make', 'Start building', 'Share', '1200+', 'great assessing'])
      assert.ok(words.includes(w), w)
    // a highlight the system painted in its accent still stands out
    assert.ok(!words.includes('grow faster'))
    for (const x of r.findings) assert.match(x.why, /reads .*:1 where the text around it .* reads .*:1/)
  }
})

test('muted-highlight: what counts as standing out, and as quieter', async () => {
  const { standsOut, quieter } = await import('../scripts/preview-detectors/muted-highlight.mjs')
  const c = (/** @type {string} */ h) => ({
    r: Number.parseInt(h.slice(1, 3), 16),
    g: Number.parseInt(h.slice(3, 5), 16),
    b: Number.parseInt(h.slice(5, 7), 16),
    a: 1
  })
  const page = { around: c('#333333'), aroundWeight: 400, weight: 400, ground: c('#ffffff') }
  assert.ok(standsOut({ ...page, fg: c('#04ad68') }), 'a brand colour')
  assert.ok(standsOut({ ...page, fg: c('#000000') }), 'a stronger contrast')
  assert.ok(standsOut({ ...page, fg: c('#333333'), weight: 700 }), 'a heavier weight')
  assert.ok(!standsOut({ ...page, fg: c('#999999') }), "a template's own quiet sub-line")
  const worn = { around: c('#f4efd4'), aroundWeight: 400, weight: 400, ground: c('#1a1a1a') }
  assert.ok(quieter({ ...worn, fg: c('#868474') }), 'a muted grey under cream')
  assert.equal(quieter({ ...worn, fg: c('#84acfb') }), null, 'the accent keeps a hue')
  assert.equal(quieter({ ...worn, fg: c('#f4efd4') }), null, 'as loud as the text')
})

test('button-dark: the cream pills of JA Podcast and JA Prodex, not their accent buttons', async () => {
  for (const s of fixture('button-dark').broken) {
    const r = await run('button-dark', s)
    if (/ja-prodex/.test(s.source))
      assert.deepEqual(r.findings.map((x) => x.text).sort(), ['Get started', 'Play video', 'View pricing'])
    else
      assert.ok(
        r.findings.some((x) => x.text === 'Start Listening'),
        s.source
      )
    for (const x of r.findings) {
      assert.match(x.at, /btn-(dark|secondary)/, s.source)
      assert.match(x.why, /painted #f4efd4, the lightest fill of the page/)
    }
  }
  const { darkRole } = await import('../scripts/preview-detectors/button-dark.mjs')
  const white = { r: 255, g: 255, b: 255, a: 1 }
  assert.ok(darkRole({ cls: 'btn btn-dark', fill: { r: 33, g: 37, b: 41, a: 1 }, ground: white }))
  assert.ok(
    darkRole({ cls: 'btn', fill: { r: 30, g: 30, b: 30, a: 1 }, ground: white }),
    'a dark neutral fill'
  )
  assert.ok(
    !darkRole({ cls: 'btn btn-primary', fill: { r: 0, g: 113, b: 227, a: 1 }, ground: white }),
    'a brand fill'
  )
  assert.ok(
    !darkRole({ cls: 'btn btn-dark', fill: white, ground: { r: 20, g: 20, b: 20, a: 1 } }),
    "the template's own dark scheme already lights it"
  )
})

test('heading-quiet: HIER-2, worth fixing; fails JA Phio, Prodex and Podcast, passes Voyara, Nova and Morgan', async () => {
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['heading-quiet'].rule, 'HIER-2')
  assert.ok(BUILT_SITE_RULES.includes('HIER-2'))
  assert.ok(RULES.some((r) => r.id === 'HIER-2'))
  assert.equal(severity.rules['HIER-2'].group, 'worth-fixing')
  assert.ok(DETECTORS.some((d) => d.kind === 'heading-quiet' && d.probe))
  const f = fixture('heading-quiet')
  for (const s of f.broken) {
    const r = await run('heading-quiet', s)
    assert.ok(r.count > 0, `broken: ${s.source}`)
    for (const x of r.findings) assert.match(x.why, /where the body text on its ground .* reads/)
  }
  const phio = await run(
    'heading-quiet',
    f.broken.find((/** @type {any} */ s) => /ja-phio/.test(s.source))
  )
  for (const w of ['Brand', 'Experience', 'Studio'])
    assert.ok(
      phio.findings.some((x) => x.text === w),
      w
    )
  for (const s of f.clean) assert.equal((await run('heading-quiet', s)).count, 0, `clean: ${s.source}`)
})
