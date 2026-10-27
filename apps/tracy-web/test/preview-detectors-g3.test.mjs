/**
 * The three preview detectors of G3 (PR 2, 14/10/2026), for the leftovers the eye saw on dev after
 * PR 1356 while every rule passed, judged on probe data cut from that day's previews
 * (`fixtures/preview-detectors/<kind>.json`, Moxie, fleet01 demos, scripts off as in the frame):
 * - off-ground: JA Vega WordPress's black hero on Moxie's cream page, JA Kinetic Joomla's and
 *   JA Resort Joomla's grey grounds no role of Moxie paints;
 * - empty-block: JA Resort Joomla's flat slab whose items show nothing;
 * - unstyled-input: JA Vega WordPress's footer newsletter fields, the browser's own on both schemes.
 * Each fails its broken samples and passes clean ones. No exemption list: a detector reads only what
 * the page shows.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import {
  BUILT_SITE_RULES,
  judgePreview,
  PREVIEW_KINDS
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

const KINDS = ['off-ground', 'empty-block', 'unstyled-input']
const SEVERITY = JSON.parse(
  readFileSync(
    new URL('../src/lib/template-design-system-readiness/rule-severity.json', import.meta.url),
    'utf8'
  )
)
const fixture = (/** @type {string} */ kind) =>
  JSON.parse(readFileSync(new URL(`./fixtures/preview-detectors/${kind}.json`, import.meta.url), 'utf8'))
const run = async (/** @type {string} */ kind, /** @type {any} */ s) => {
  const m = await import(`../scripts/preview-detectors/${kind}.mjs`)
  return m.detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' },
    systemColours: s.systemColours,
    scheme: /scheme dark/.test(s.source) ? 'dark' : 'light'
  })
}

test('each G3 kind is loaded with a probe, has its registry line, its rule and a severity entry', () => {
  for (const k of KINDS) {
    assert.ok(
      DETECTORS.some((d) => d.kind === k && typeof d.probe === 'string'),
      `${k} loaded`
    )
    const entry = PREVIEW_KINDS[k]
    assert.ok(entry?.rule && entry.what && entry.fix, `${k} registry line`)
    assert.ok(BUILT_SITE_RULES.includes(entry.rule), `${entry.rule} is a built-site rule`)
    assert.ok(
      RULES.some((r) => r.id === entry.rule),
      `${entry.rule} is a rule /ops runs`
    )
    const sev = SEVERITY.rules[entry.rule]
    assert.ok(
      sev && /^(must-fix|worth-fixing)$/.test(sev.group) && sev.text && sev.fix,
      `${entry.rule} severity`
    )
  }
})

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
  const [vegaLight, kinetic, resort] = fixture('off-ground').broken
  const hero = (await run('off-ground', vegaLight)).findings.find((x) => /jv-hero/.test(x.at))
  assert.ok(hero, 'the Vega hero is found although black is a colour of Moxie (its text)')
  assert.equal(hero.colour, '#000000')
  assert.equal(hero.page, '#f4efd4')
  const grey = (await run('off-ground', kinetic)).findings[0]
  assert.equal(grey.colour, '#41403b', "Kinetic's grey ground, no ground role of Moxie")
  assert.ok((await run('off-ground', resort)).findings.every((x) => x.colour === '#41403b'))
  const slab = (await run('empty-block', fixture('empty-block').broken[0])).findings[0]
  assert.ok(slab.held > 0 && /×/.test(slab.size), 'a box that holds content and shows none of it')
  for (const s of fixture('unstyled-input').broken) {
    const r = await run('unstyled-input', s)
    assert.ok(
      r.findings.some((x) => /jv_email/.test(x.at) && /browser's own field/.test(x.why)),
      s.source
    )
  }
})

test('a G3 kind with a count fails its rule in judgePreview, and none measured is not a pass', () => {
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
      'off-ground': { count: 3, where: ['section.jv-hero'] },
      'empty-block': { count: 0, where: [] },
      'unstyled-input': { count: 2, where: ['input.jv-newsletter__email'] }
    }
  }
  const j = judgePreview([row])
  assert.equal(j['GROUND-1'].status, 'fail')
  assert.match(j['GROUND-1'].note, /jv-hero/)
  assert.equal(j['EMPTY-1'].status, 'pass')
  assert.equal(j['FORM-1'].status, 'fail')
  const { detectors: _, ...old } = row
  assert.equal(judgePreview([old])['GROUND-1'].status, 'unmeasurable')
})

test("off-ground: the system's own ink band (--ds-c-ink) is a ground, its text role is not", async () => {
  const { isGroundRole } = await import('../scripts/preview-detectors/lib/colour.mjs')
  assert.equal(isGroundRole('ink'), true, 'Tracy Business EmDash band-ink and footer')
  assert.equal(isGroundRole('on-ink'), false)
  assert.equal(isGroundRole('fg'), false)
})

test("off-ground: the system's accent band (--ds-c-accent-band) is a ground, its words are not", async () => {
  const { isGroundRole } = await import('../scripts/preview-detectors/lib/colour.mjs')
  // the Tracy EmDash call bands under Moxie light: the accent deepened to #2e3c58, a band the system designs
  assert.equal(isGroundRole('accent-band'), true)
  assert.equal(isGroundRole('on-accent-band'), false)
  assert.equal(isGroundRole('accent'), false)
})

test('unstyled-input: a bare field inside the box the template draws for it is seen through that box', async () => {
  // JA Kinetic Joomla's finder (Moxie, light): a transparent, borderless input inside the bordered search bar
  const finder = fixture('unstyled-input').clean.find((s) => /ja-kinetic\/j6.*\/pages\/search/.test(s.source))
  assert.ok(finder, 'the Kinetic finder sample')
  assert.equal((await run('unstyled-input', finder)).count, 0)
  // the same field without its drawn box is not seen as a field
  const bare = structuredClone(finder)
  for (const side of [bare.worn, bare.plain]) for (const f of side.data.fields) delete f.box
  const r = await run('unstyled-input', bare)
  assert.ok(r.findings.some((x) => /kinetic-finder__input/.test(x.at) && /not seen as a field/.test(x.why)))
})
