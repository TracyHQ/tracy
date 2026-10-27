/**
 * The four gaps the JA Kinetic acceptance found by eye on the local stand (Akemi, 14/10/2026), judged on
 * probe data cut from real Add site previews (`fixtures/preview-detectors/<kind>.json`, preview-check.mjs
 * PREVIEW_DATA=1, no script as the frame runs), before and after the fix:
 * - struck-text (CON-2): the timeline connector through the t+0s…t+9m labels (Figma light, Moxie dark);
 * - edge-split (LAYOUT-3): Joomla sections at two left edges, WordPress Spotify's narrow header and footer;
 * - heading-split (HIER-2): the Joomla timeline heading near-black beside plum headings (Toggl Track);
 * - loud-band (GROUND-2): the Joomla timeline band and footer as grey blocks on Moxie's black page.
 * Each fails its broken samples and passes the fixed ones. No exemption list.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import { BUILT_SITE_RULES, PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { DETECTORS } from '../scripts/preview-detectors/index.mjs'

const KINDS = ['struck-text', 'edge-split', 'heading-split', 'loud-band']
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
  test(`${kind}: fails on every broken sample of a real preview, passes on a fixed one`, async () => {
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

test('each kind has its registry line, its rule in the check, a severity, and loads', async () => {
  const ids = RULES.map((r) => r.id)
  for (const kind of KINDS) {
    const k = PREVIEW_KINDS[kind]
    assert.ok(k?.rule && k.what && k.fix, kind)
    assert.ok(BUILT_SITE_RULES.includes(k.rule), `${kind}: ${k.rule} in BUILT_SITE_RULES`)
    assert.ok(ids.includes(k.rule), `${kind}: ${k.rule} is a rule of the check`)
    const s = DS_RULE_SEVERITY[k.rule]
    // the kind's own line says how to fix it (CON-2 predates the rules' fix field)
    assert.ok(s && ['must-fix', 'worth-fixing'].includes(s.group), k.rule)
    assert.ok(
      DETECTORS.some((d) => d.kind === kind),
      `${kind} is loaded by index.mjs`
    )
    const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
    assert.doesNotThrow(() => new Function(`return ${m.probe}`), kind)
  }
  // test-quality: contract the decision of 14/10/2026: a grey band on a black page still reads, it warns only
  assert.equal(DS_RULE_SEVERITY['GROUND-2'].group, 'worth-fixing')
})

test("struck-text: the timeline labels of both CMSs, and the template's own hairline passes", async () => {
  const f = fixture('struck-text')
  for (const cms of ['wp7', 'j6'])
    assert.ok(
      f.broken.some((/** @type {any} */ s) => s.source.includes(`ja-kinetic/${cms}`)),
      `${cms} sample`
    )
  for (const s of f.broken) {
    const r = await run('struck-text', s)
    assert.ok(
      r.findings.some((/** @type {any} */ x) => /"t\+(0s|30s|4m|9m)"/.test(x.at)),
      s.source
    )
  }
  const { detect, strike } = await import('../scripts/preview-detectors/struck-text.mjs')
  const at = (/** @type {any} */ c) => ({
    path: 'body/div:1/span:1',
    at: 'span.hx-inc-time',
    text: 't+0s',
    c,
    ground: { r: 242, g: 245, b: 238 }
  })
  const hairline = at({ r: 228, g: 232, b: 224 })
  assert.ok(strike(hairline) < 1.2)
  assert.equal(
    detect({ worn: { data: { crossings: [hairline] } }, plain: { data: { crossings: [hairline] } } }).count,
    0
  )
  const black = at({ r: 0, g: 0, b: 0 })
  assert.equal(
    detect({ worn: { data: { crossings: [black] } }, plain: { data: { crossings: [hairline] } } }).count,
    1
  )
  // the template strikes as hard on its own page: not the system's doing
  assert.equal(
    detect({ worn: { data: { crossings: [black] } }, plain: { data: { crossings: [black] } } }).count,
    0
  )
})

test("edge-split: Joomla's two edges and WordPress Spotify's header and footer", async () => {
  const f = fixture('edge-split')
  const joomla = f.broken.filter((/** @type {any} */ s) => s.source.includes('ja-kinetic/j6'))
  assert.ok(joomla.length >= 3, 'three Joomla systems or more')
  const spotify = f.broken.find((/** @type {any} */ s) => /wp7.*1514a95f/.test(s.source))
  assert.ok(spotify, 'the WordPress Spotify sample')
  const r = await run('edge-split', spotify)
  assert.ok(
    r.findings.some((/** @type {any} */ x) => /tracy-(header|footer)__inner/.test(x.why)),
    'names the header or footer'
  )
  const { edgeGroups, detect } = await import('../scripts/preview-detectors/edge-split.mjs')
  const col = (/** @type {string} */ path, /** @type {number} */ x) => ({
    path,
    at: path,
    x,
    w: 1440 - 2 * x
  })
  assert.deepEqual(
    edgeGroups([col('a', 100), col('b', 101), col('c', 300)]).map((g) => g.length),
    [2],
    'one edge within 2px, a lone column is no group'
  )
  const plain = { data: { columns: [col('a', 100), col('b', 100), col('c', 100)] } }
  assert.equal(
    detect({ worn: { data: { columns: [col('a', 120), col('b', 120), col('c', 120)] } }, plain }).count,
    0,
    'all moved together'
  )
  assert.equal(
    detect({ worn: { data: { columns: [col('a', 120), col('b', 100), col('c', 120)] } }, plain }).count,
    1
  )
})

test('heading-split: the Joomla timeline heading, and a heading recoloured for its band passes', async () => {
  for (const s of fixture('heading-split').broken) {
    const r = await run('heading-split', s)
    assert.ok(
      r.findings.some((/** @type {any} */ x) => /From alert to resolved/.test(x.at)),
      s.source
    )
  }
  const { detect } = await import('../scripts/preview-detectors/heading-split.mjs')
  const white = { r: 255, g: 255, b: 255 }
  const ink = { r: 16, g: 20, b: 15 }
  const plum = { r: 96, g: 75, b: 104 }
  const h = (/** @type {string} */ path, /** @type {any} */ fg, ground = white) => ({
    path,
    at: 'h2',
    text: path,
    level: '2',
    fg,
    ground
  })
  const plain = { data: { headings: ['a', 'b', 'c', 'd'].map((p) => h(p, ink)) } }
  const odd = { data: { headings: [h('a', plum), h('b', plum), h('c', plum), h('d', ink)] } }
  assert.equal(detect({ worn: odd, plain }).count, 1)
  // the fourth sits on a dark band now, where the plum would not read: it is right to differ
  const band = { data: { headings: [h('a', plum), h('b', plum), h('c', plum), h('d', white, ink)] } }
  assert.equal(detect({ worn: band, plain }).count, 0)
})

test('loud-band: grey blocks on a black page, a band the template already lifts passes', async () => {
  for (const s of fixture('loud-band').broken) {
    const r = await run('loud-band', s)
    assert.ok(
      r.findings.some((/** @type {any} */ x) => /kinetic-footer|hx-section/.test(x.at)),
      s.source
    )
  }
  const { detect, lift } = await import('../scripts/preview-detectors/loud-band.mjs')
  const b = (/** @type {any} */ c, /** @type {any} */ around) => ({
    path: 'body/footer:1',
    at: 'footer',
    c,
    around
  })
  const black = { r: 0, g: 0, b: 0 }
  const grey = { r: 26, g: 26, b: 26 }
  const quiet = b({ r: 15, g: 19, b: 17 }, { r: 10, g: 13, b: 12 })
  assert.ok(lift(quiet) < 1.12)
  assert.equal(
    detect({ worn: { data: { bands: [b(grey, black)] } }, plain: { data: { bands: [quiet] } } }).count,
    1
  )
  assert.equal(
    detect({
      worn: { data: { bands: [b({ r: 6, g: 6, b: 5 }, black)] } },
      plain: { data: { bands: [quiet] } }
    }).count,
    0
  )
  // a band the template already sets apart (a dark footer on a light page) is the template's own
  const apart = b({ r: 30, g: 30, b: 30 }, { r: 255, g: 255, b: 255 })
  assert.equal(
    detect({ worn: { data: { bands: [b(grey, black)] } }, plain: { data: { bands: [apart] } } }).count,
    0
  )
})
