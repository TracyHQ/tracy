/**
 * The six preview detectors of E3 (PR 2, 14/10/2026), for what the eye saw on dev after PR 1 while
 * every rule passed, judged on probe data cut from real previews (`fixtures/preview-detectors/<kind>.json`,
 * fleet01 demos under Moxie, scripts off as in the frame, preview-check.mjs PREVIEW_DATA=1):
 * - icon-invisible (ICON-1): JA Spa Joomla's hamburger bars painted the sidebar's own #1a1a1a;
 * - hover-unreadable (HOVER-1): JA Seven Joomla's outline buttons, white on cream on hover;
 * - pseudo-colour (TPL-1): pseudo-elements in the template's colours while their element moved;
 * - border-colour (TPL-1): JA Rent Joomla's blue header underline and grey topbar rules;
 * - harsh-border (BORDER-1): cream text-colour hairlines on Moxie's dark grounds (Space, Vogue, Voyara);
 * - foreign-colour (FOREIGN-1): colours in neither palette.
 * Each fails its broken samples and passes clean ones. No exemption list.
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

const KINDS = [
  'icon-invisible',
  'hover-unreadable',
  'pseudo-colour',
  'border-colour',
  'harsh-border',
  'foreign-colour'
]
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

test('each E3 kind is loaded with a probe, has its registry line, its rule and the severity asked', () => {
  const group = {
    'icon-invisible': 'must-fix',
    'hover-unreadable': 'must-fix',
    'pseudo-colour': 'must-fix',
    'border-colour': 'must-fix',
    'harsh-border': 'worth-fixing',
    'foreign-colour': 'must-fix'
  }
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
    assert.ok(sev?.text && (sev.fix || entry.rule === 'TPL-1'), `${entry.rule} severity`)
    assert.equal(sev.group, group[/** @type {keyof typeof group} */ (k)], `${k} weighs ${group[k]}`)
  }
  // a template colour is TPL-1's, the system's own harsh line BORDER-1's
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['pseudo-colour'].rule, 'TPL-1')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['border-colour'].rule, 'TPL-1')
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

test('an E3 kind with a count fails its rule in judgePreview, and none measured is not a pass', () => {
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
    detectors: {
      'icon-invisible': { count: 1, where: ['a.d-none.d-lg-flex'] },
      'hover-unreadable': { count: 0, where: [] },
      'pseudo-colour': { count: 0, where: [] },
      'border-colour': { count: 2, where: ['header.wrap.t3-header'] },
      'harsh-border': { count: 0, where: [] },
      'foreign-colour': { count: 0, where: [] }
    }
  }
  const j = judgePreview([row])
  assert.equal(j['ICON-1'].status, 'fail')
  assert.match(j['ICON-1'].note, /d-lg-flex/)
  assert.equal(j['HOVER-1'].status, 'pass')
  assert.equal(j['TPL-1'].status, 'fail', 'a template-coloured border fails TPL-1')
  assert.equal(j['BORDER-1'].status, 'pass')
  const { detectors: _, ...old } = row
  assert.equal(judgePreview([old])['ICON-1'].status, 'unmeasurable')
  assert.equal(judgePreview([old])['TPL-1'].status, 'pass', 'TPL-1 keeps its own reading')
})

test('each E3 finding says what it saw', async () => {
  const [spa] = fixture('icon-invisible').broken
  const burger = (await run('icon-invisible', spa)).findings.find((x) => /d-lg-flex/.test(x.at))
  assert.ok(burger && burger.ratio < 1.1 && burger.was >= 3, "JA Spa's hamburger, gone under Moxie")
  const [seven] = fixture('hover-unreadable').broken
  const hover = (await run('hover-unreadable', seven)).findings.find((x) =>
    /Start your project now/.test(x.at)
  )
  assert.ok(hover, 'JA Seven: "Start your project now" on hover')
  assert.equal(hover.colour, '#ffffff')
  assert.equal(hover.ground, '#f4efd4')
  const [rent] = fixture('border-colour').broken
  const underline = (await run('border-colour', rent)).findings.find((x) => /t3-header/.test(x.at))
  assert.equal(underline?.colour, '#079aee', "JA Rent's blue header underline")
  for (const s of fixture('harsh-border').broken)
    assert.ok(
      (await run('harsh-border', s)).findings.every((x) => x.colour === '#f4efd4'),
      `${s.source}: Moxie's cream text colour as a line`
    )
  const [nova] = fixture('foreign-colour').broken
  assert.deepEqual(
    (await run('foreign-colour', nova)).findings.map((x) => x.colour),
    ['#c8174a']
  )
})
