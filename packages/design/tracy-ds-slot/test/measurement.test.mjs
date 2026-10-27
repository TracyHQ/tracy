/**
 * The measurement file (`tdsr-measurement/v1`) and the pure judge of the eight built-site rules:
 * the file carries numbers, the judge turns them into pass/fail/warn/unmeasurable with the one
 * threshold table /ops reads too. Fixtures are rows of the 13/10/2026 sweep (iMac, four systems).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BUILT_SITE_RULES,
  fromFlow,
  fromSweepRow,
  judgeMeasurement,
  inheritanceProblem,
  measurementMatches,
  measurementPath,
  validateMeasurement
} from '../src/measurement.mjs'
import { writeMeasurement } from '../src/measurement-io.mjs'
import { PREVIEW_PROBE_VERSION } from '../src/preview-probe-version.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SWEEP = readFileSync(
  resolve(ROOT, 'packages/design/tracy-ds-slot/test/fixtures/ds-sweep-2026-10-13-moxie/results.jsonl'),
  'utf8'
)
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
const row = (id, cms) => SWEEP.find((r) => r.id === id && r.cms === cms)
const META = {
  measuredAt: '2026-10-13T12:40:11Z',
  machine: 'imac',
  measuredBy: 'tdsr pass-joomla.mjs --no-tokenize --bands'
}

test('a sweep row becomes a valid file with one entry per system and viewport', () => {
  const doc = fromSweepRow(row('ja-sensei', 'joomla'), META)
  assert.deepEqual(validateMeasurement(doc), [])
  assert.equal(doc.perSystem.length, 8)
  assert.equal(doc.version, '1.0.3')
  assert.equal(doc.tag, 'quickstart/ja-sensei/j6')
  assert.deepEqual(doc.controls, [0, 0, 0, 0])
  assert.equal(doc.perSystem[1].viewport, 390)
  assert.equal(doc.perSystem[6].system, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
})

test('the validator refuses a document that is not ours, each reason named', () => {
  assert.deepEqual(validateMeasurement(null), ['not an object'])
  const doc = fromSweepRow(row('ja-sensei', 'joomla'), META)
  const broken = { ...doc, schemaVersion: 'tdsr-measurement/v0', version: '', cms: 'drupal' }
  const why = validateMeasurement(broken)
  assert.ok(
    why.some((w) => w.startsWith('schemaVersion must be tdsr-measurement/v1')),
    why.join('\n')
  )
  assert.ok(why.includes('version must be a non-empty string'))
  assert.ok(why.some((w) => w.startsWith('cms must be joomla, wordpress or emdash')))
  const badRow = {
    ...doc,
    perSystem: [{ ...doc.perSystem[0], viewport: 1024, check: 'maybe', left: { first: 2 } }]
  }
  const why2 = validateMeasurement(badRow)
  assert.ok(why2.includes('perSystem[0].viewport must be 1440 or 390'))
  assert.ok(why2.includes('perSystem[0].check must be pass or fail'))
  assert.ok(why2.some((w) => w.startsWith('perSystem[0].left must hold')))
})

test('the file lives beside the contract of its version, one layout per CMS', () => {
  assert.equal(
    measurementPath({ cms: 'joomla', template: 'ja-conf', tag: 'quickstart/ja-conf/j6', version: '1.0.2' }),
    'packages/cms/tracy-joomla-quickstart/contracts/ja-conf/j6/1.0.2/design-system-measurement.json'
  )
  assert.equal(
    measurementPath({
      cms: 'wordpress',
      template: 'tracy-business',
      tag: 'tracy-business/wp7',
      version: '1.3.6'
    }),
    'packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.3.6/design-system-measurement.json'
  )
  assert.equal(
    measurementPath({
      cms: 'emdash',
      template: 'tracy-business',
      tag: 'tracy-business/emdash-0.x',
      version: '1.7.16'
    }),
    'packages/cms/tracy-emdash-theme-business/contracts/1.7.16/design-system-measurement.json'
  )
})

test('JA Sensei: the first screen keeps 90% of the template (SCREEN-1 fails), roles and text pass', () => {
  const j = judgeMeasurement(fromSweepRow(row('ja-sensei', 'joomla'), META))
  assert.equal(j['SCREEN-1'].status, 'fail')
  assert.match(j['SCREEN-1'].note, /90% of the first screen/)
  assert.equal(j['ROLE-1'].status, 'fail', 'Moxie follows 80%: under the interim floor')
  assert.equal(j['CON-1'].status, 'pass')
  assert.equal(j['UNDO-1'].status, 'pass')
  assert.equal(j['FONT-1'].status, 'pass')
  assert.equal(j['MODE-1'].status, 'unmeasurable', 'the sweep carried no mode flag')
})

test('JA Symphony: eight texts read worse than the template (CON-1 fails) and the display role misses', () => {
  const j = judgeMeasurement(fromSweepRow(row('ja-symphony', 'joomla'), META))
  assert.equal(j['CON-1'].status, 'fail')
  assert.match(j['CON-1'].note, /8 text\(s\)/)
  assert.equal(j['ROLE-1'].status, 'fail')
  assert.match(j['ROLE-1'].note, /display\.fontFamily/)
  assert.equal(j['SCREEN-1'].status, 'warn', 'desktop first screens are all pictures: only the phone reads')
})

test('Tracy Business EmDash: the mode flag says the page stays cream under a dark system (MODE-1 fails)', () => {
  const doc = fromSweepRow(row('tracy-business', 'emdash'), {
    ...META,
    measuredBy: 'tdsr flow.mjs --cms emdash',
    modeMatch: {
      'od:bmw': true,
      'od:stripe': true,
      'od:spotify': true,
      'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0': false
    }
  })
  const j = judgeMeasurement(doc)
  assert.equal(j['MODE-1'].status, 'fail')
  assert.match(j['MODE-1'].note, /Moxie\/1440, Moxie\/390/)
  assert.equal(
    j['FONT-1'].status,
    'warn',
    'no face loaded under the three OpenDesign systems; the sweep did not count the declared ones'
  )
  assert.equal(j['UNDO-1'].status, 'pass')
})

test('a flow.json becomes a file and judges the same as its verdicts for a green template', () => {
  const flow = {
    rows: [
      { step: 1, id: null },
      { step: 2, id: 'od:bmw' }
    ],
    verdicts: [
      { kind: 'control', step: 1, vw: 'desktop', differences: 0 },
      { kind: 'control', step: 1, vw: 'phone', differences: 0 },
      {
        kind: 'system',
        step: 2,
        vw: 'desktop',
        pass: true,
        match: 1,
        margin: 0.4,
        follows: { rate: 0.93 },
        left: { first: { share: 0.02 }, page: { share: 0.04 } },
        contrast: [{ name: 'text', ratio: 12.1, regressed: false }],
        misses: [],
        fontsLoaded: 3,
        fontsDeclared: 2,
        ident: true,
        modeMatch: true,
        toggleVisible: true,
        shot: '02-bmw-desktop.png'
      },
      {
        kind: 'system',
        step: 2,
        vw: 'phone',
        pass: true,
        match: 0.97,
        margin: 0.31,
        follows: { rate: 0.9 },
        left: { first: { share: null }, page: { share: 0.03 } },
        contrast: [{ name: 'text', ratio: 7, regressed: false }],
        misses: [],
        fontsLoaded: 3,
        fontsDeclared: 2,
        ident: true,
        modeMatch: true,
        toggleVisible: true,
        shot: '02-bmw-phone.png'
      }
    ]
  }
  const doc = fromFlow(flow, {
    template: 'ja-conf',
    cms: 'joomla',
    tag: 'quickstart/ja-conf/j6',
    version: '1.0.2',
    machine: 'imac',
    measuredBy: 'tdsr pass-joomla.mjs',
    systems: ['od:bmw'],
    evidence: 'tasks/evidence/x/ja-conf-j6'
  })
  assert.deepEqual(validateMeasurement(doc), [])
  assert.equal(doc.perSystem[0].system, 'od:bmw')
  const j = judgeMeasurement(doc)
  for (const id of ['ROLE-1', 'CON-1', 'UNDO-1', 'FONT-1', 'IDENT-1', 'MODE-1'])
    assert.equal(j[id].status, 'pass', id)
  assert.equal(j['SCREEN-1'].status, 'warn', 'one view all pictures')
  assert.equal(j['MODE-2'].status, 'warn', 'toggle stays, second mode not measured')
  assert.deepEqual(Object.keys(j), [...BUILT_SITE_RULES])
  assert.equal(doc.perSystem[0].apart, null, 'a flow before 15/10/2026 did not say')
  assert.deepEqual([doc.perSystem[0].followsSamples, doc.perSystem[0].followsKept], [null, null])
  // what follows read and what it left out as kept by the contract reach the file and the note /ops shows
  const counted = fromFlow(
    {
      ...flow,
      verdicts: flow.verdicts.map((v) =>
        v.kind === 'system' ? { ...v, follows: { ...v.follows, samples: 240, kept: 36 } } : v
      )
    },
    {
      template: 'ja-conf',
      cms: 'joomla',
      tag: 'quickstart/ja-conf/j6',
      version: '1.0.2',
      machine: 'imac',
      measuredBy: 'tdsr flow.mjs',
      systems: ['od:bmw']
    }
  )
  assert.deepEqual([counted.perSystem[0].followsSamples, counted.perSystem[0].followsKept], [240, 36])
  assert.deepEqual(validateMeasurement(counted), [])
  assert.match(judgeMeasurement(counted)['ROLE-1'].note, /240 paints read, 36 kept by the contract left out/)

  // the margin is judged as the flow judged it: two of 15 systems that want the same page leave margin 0
  const view = (over) => ({ ...doc, perSystem: doc.perSystem.map((r) => ({ ...r, ...over })) })
  assert.equal(judgeMeasurement(view({ margin: 0, apart: true }))['ROLE-1'].status, 'pass')
  assert.equal(judgeMeasurement(view({ margin: 0.4, apart: false }))['ROLE-1'].status, 'fail')
  // a file without `apart`: a view the flow passed was told apart; a failed one falls back to the margin
  assert.equal(judgeMeasurement(view({ margin: 0 }))['ROLE-1'].status, 'pass')
  assert.equal(judgeMeasurement(view({ margin: 0, check: 'fail' }))['ROLE-1'].status, 'fail')
  assert.equal(judgeMeasurement(view({ margin: 0.3, check: 'fail' }))['ROLE-1'].status, 'pass')
  const told = fromFlow(
    { ...flow, verdicts: flow.verdicts.map((v) => (v.kind === 'system' ? { ...v, apart: true } : v)) },
    {
      template: 'ja-conf',
      cms: 'joomla',
      tag: 'quickstart/ja-conf/j6',
      version: '1.0.2',
      machine: 'imac',
      measuredBy: 'tdsr flow.mjs',
      systems: ['od:bmw']
    }
  )
  assert.equal(told.perSystem[0].apart, true)
  assert.deepEqual(validateMeasurement(told), [])
  assert.deepEqual(validateMeasurement(view({ apart: 'yes' })).length, 2)
})

test('a template with no light/dark switch: MODE-2 is not applicable, never "not measured" (#1319)', () => {
  const sweep = row('ja-sensei', 'joomla')
  const none = fromSweepRow(sweep, { ...META, themeToggle: false })
  assert.deepEqual(validateMeasurement(none), [])
  assert.equal(none.themeToggle, false)
  assert.equal(judgeMeasurement(none)['MODE-2'].status, 'not-applicable')
  // the 13/10 sweep did not know: unmeasurable, as before
  const unknown = fromSweepRow(sweep, META)
  assert.equal(unknown.themeToggle, undefined, 'a run that did not look says nothing')
  assert.equal(judgeMeasurement(unknown)['MODE-2'].status, 'unmeasurable')
  // a template that declares a switch the run never watched stays unmeasurable
  const declared = fromSweepRow(sweep, { ...META, themeToggle: true })
  assert.equal(judgeMeasurement(declared)['MODE-2'].status, 'unmeasurable')
  assert.deepEqual(validateMeasurement({ ...none, themeToggle: 'no' }), [
    'themeToggle must be true, false or null'
  ])
})

test('a file counts only for the version and tag it measured', () => {
  const doc = fromSweepRow(row('ja-sensei', 'joomla'), META)
  assert.equal(measurementMatches(doc, { tag: 'quickstart/ja-sensei/j6', version: '1.0.3' }).ok, true)
  assert.equal(
    measurementMatches(doc, { tag: 'quickstart/ja-sensei/j6', version: '1.0.4' }).reason,
    'measured 1.0.3, published 1.0.4'
  )
  assert.equal(measurementMatches(null, { version: '1.0.3' }).ok, false)
})

test('a WordPress patch carries the numbers of the version before it only with a proof of the committed files', () => {
  const base = { ...fromSweepRow(row('ja-sensei', 'joomla'), META), tag: 'quickstart/ja-diner/wp7' }
  const tag = base.tag
  const doc = { ...base, version: '1.0.4', inheritedFrom: '1.0.3' }
  const published = { tag, version: '1.0.4' }
  const sha = (/** @type {string} */ c) => c.repeat(64)
  const evidence = {
    tag,
    version: '1.0.4',
    previous: 'ja-diner/wp7/1.0.3',
    themeZip: { sha256: sha('a'), previousSha256: sha('a') },
    slotContract: { sha256: sha('b'), previousSha256: sha('b') }
  }
  const proof = (/** @type {any} */ e) => (/** @type {string} */ from) =>
    inheritanceProblem(from, published, e)
  // the DB-only path: same theme zip, same slot contract, and the caller's proof holds
  assert.deepEqual(measurementMatches(doc, published, proof(evidence)), { ok: true, reason: null })
  // no proof: refused, as any older measurement
  assert.equal(
    measurementMatches(doc, published).reason,
    'inherited from 1.0.3: no patch-evidence.json beside it'
  )
  // the caller's proof of the committed files fails: refused whatever the evidence says of itself
  assert.equal(
    measurementMatches(doc, published, () => 'the theme files of 1.0.4 and 1.0.3 differ (presentation locks)')
      .reason,
    'inherited from 1.0.3: the theme files of 1.0.4 and 1.0.3 differ (presentation locks)'
  )
  // the hashes the evidence declares decide nothing: unequal ones are not a refusal here, equal ones are not a
  // proof; the theme, slot contract and content are read from the committed files by the caller's proof
  assert.equal(
    inheritanceProblem('1.0.3', published, {
      ...evidence,
      themeZip: { sha256: sha('a'), previousSha256: sha('c') }
    }),
    null
  )
  // evidence of another version, or naming another previous version
  assert.match(
    measurementMatches(doc, published, proof({ ...evidence, version: '1.0.5' })).reason ?? '',
    /is for 1\.0\.5/
  )
  assert.match(
    measurementMatches(doc, published, proof({ ...evidence, previous: 'ja-diner/wp7/1.0.2' })).reason ?? '',
    /names the previous version/
  )
  // an exact measurement never needs evidence
  assert.equal(measurementMatches({ ...base, version: '1.0.4' }, published).ok, true)
})

test('a Joomla (or EmDash) measurement never inherits, whatever its evidence says (no gate checks theirs)', () => {
  const base = fromSweepRow(row('ja-sensei', 'joomla'), META)
  const published = { tag: base.tag, version: '1.0.4' }
  const sha = 'a'.repeat(64)
  const evidence = {
    tag: base.tag,
    version: '1.0.4',
    previous: 'ja-sensei/j6/1.0.3',
    themeZip: { sha256: sha, previousSha256: sha },
    slotContract: { sha256: sha, previousSha256: sha }
  }
  const doc = { ...base, version: '1.0.4', inheritedFrom: '1.0.3' }
  assert.equal(
    measurementMatches(doc, published, () => null).reason,
    'inherited from 1.0.3: only a WordPress patch may inherit a measurement'
  )
  assert.equal(
    inheritanceProblem('1.0.3', published, evidence),
    'only a WordPress patch may inherit a measurement'
  )
})

test('the preview rules: unmeasured without a preview block, judged per system and scheme with one', async () => {
  const { judgePreview, validateMeasurement } = await import('../src/measurement.mjs')
  assert.equal(judgePreview(undefined)['TPL-1'].status, 'unmeasurable')
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
    docs: 1
  }
  const ok = judgePreview([row])
  for (const id of ['TPL-1', 'CON-2', 'BTN-1', 'PREV-1']) assert.equal(ok[id].status, 'pass', id)
  const bad = judgePreview([row, { ...row, scheme: 'dark', glare: 2, lowText: 3, lostButtons: 1, docs: 2 }])
  assert.equal(bad['TPL-1'].status, 'fail')
  assert.match(bad['TPL-1'].note, /\/dark 2/)
  assert.equal(bad['CON-2'].status, 'fail')
  assert.equal(bad['BTN-1'].status, 'fail')
  assert.equal(bad['PREV-1'].status, 'fail')
  const doc = { preview: [{ ...row, lowText: -1 }] }
  assert.ok(validateMeasurement(doc).some((e) => e.includes('preview[0].lowText')))
})

test('a preview detector kind adds its count to its rule, with where and the fix; unmeasured never passes', async () => {
  const { judgePreview } = await import('../src/measurement.mjs')
  const registry = {
    'logo-invisible': {
      rule: 'IDENT-2',
      what: 'logos that vanish on their ground',
      fix: 'give the logo a variant for the ground'
    },
    'gradient-stop': { rule: 'TPL-1', what: 'gradients with a template stop', fix: 'map every stop' }
  }
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
    docs: 1
  }
  const unmeasured = judgePreview([row], undefined, registry)
  assert.equal(unmeasured['IDENT-2'].status, 'unmeasurable')
  assert.equal(unmeasured['TPL-1'].status, 'pass')
  const clean = {
    ...row,
    detectors: { 'logo-invisible': { count: 0, where: [] }, 'gradient-stop': { count: 0, where: [] } }
  }
  assert.equal(judgePreview([clean], undefined, registry)['IDENT-2'].status, 'pass')
  const dirty = {
    ...row,
    scheme: 'dark',
    detectors: {
      'logo-invisible': { count: 1, where: ['img.logo-img'] },
      'gradient-stop': { count: 2, where: ['h3.text-gradient'] }
    }
  }
  const bad = judgePreview([clean, dirty], undefined, registry)
  assert.equal(bad['IDENT-2'].status, 'fail')
  assert.match(
    bad['IDENT-2'].note,
    /logos that vanish on their ground: refero:moxie\/dark 1 \(img\.logo-img\)/
  )
  assert.equal(bad['IDENT-2'].kinds[0].fix, 'give the logo a variant for the ground')
  assert.equal(bad['TPL-1'].status, 'fail')
  assert.deepEqual(bad['TPL-1'].kinds[0].where, ['h3.text-gradient'])
})

test('a row measured unstyled (its stylesheets failed) counts for PREV-1 only; the other rules wait for a styled row', async () => {
  const { judgePreview, PREVIEW_KINDS } = await import('../src/measurement.mjs')
  assert.equal(PREVIEW_KINDS['sheet-failed'].rule, 'PREV-1')
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
    docs: 1
  }
  // JA Directory with dev's 502 asset door: 6 sheets failed, and the unstyled page threw 16 low texts
  const unstyled = {
    ...row,
    lowText: 16,
    detectors: {
      'sheet-failed': { count: 6, where: ['link /t3-assets/css/a.css'] },
      'button-size': { count: 7, where: ['a.btn'] }
    }
  }
  const only = judgePreview([unstyled])
  assert.equal(only['PREV-1'].status, 'fail')
  assert.match(only['PREV-1'].note, /stylesheets/)
  assert.equal(only['CON-2'].status, 'unmeasurable')
  assert.equal(only['CLIP-1'].status, 'unmeasurable')
  assert.match(only['CON-2'].note, /without its stylesheets/)
  // with a styled row beside it, the other rules are judged on that row alone
  const styled = {
    ...row,
    scheme: 'dark',
    detectors: { 'sheet-failed': { count: 0, where: [] }, 'button-size': { count: 0, where: [] } }
  }
  const both = judgePreview([unstyled, styled])
  assert.equal(both['CON-2'].status, 'pass')
  assert.equal(both['CLIP-1'].status, 'pass')
  assert.equal(both['PREV-1'].status, 'fail')
})

test("a kind one system causes on most templates is the system's: listed once, never counted against a template", async () => {
  const { judgePreview, systemIssuesOf, PREVIEW_KINDS } = await import('../src/measurement.mjs')
  const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
  const row = (system, kinds) => ({
    system,
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
    detectors: Object.fromEntries(
      ['harsh-border', 'template-fonts-left'].map((k) => [k, { count: kinds.includes(k) ? 3 : 0, where: [] }])
    )
  })
  // 12 lines: Moxie's text-coloured border role draws hard lines on 10 of them, Stripe on none; the
  // template font names show under both systems (the templates' doing)
  const docs = Array.from({ length: 12 }, (_, i) => ({
    cms: 'joomla',
    tag: `quickstart/t${i}/j6`,
    preview: [
      row(MOXIE, [...(i < 10 ? ['harsh-border'] : []), ...(i < 9 ? ['template-fonts-left'] : [])]),
      row('stripe', i < 9 ? ['template-fonts-left'] : [])
    ]
  }))
  const issues = systemIssuesOf(docs)
  assert.deepEqual(Object.keys(issues.systems), [MOXIE])
  assert.deepEqual(Object.keys(issues.systems[MOXIE]), ['harsh-border'])
  assert.equal(issues.systems[MOXIE]['harsh-border'].lines, 10)
  // on one template: BORDER-1 does not fail for Moxie's lines, and says whose issue it is
  const rule = PREVIEW_KINDS['harsh-border'].rule
  const judged = judgePreview(docs[0].preview, undefined, PREVIEW_KINDS, issues)
  assert.equal(judged[rule].status, 'pass')
  assert.equal(judged[rule].systemIssues[0].system, MOXIE)
  assert.match(judged[rule].systemIssues[0].fix, /system's own border role/)
  // without the file the same row fails BORDER-1, and the templates' own kind still fails either way
  assert.equal(judgePreview(docs[0].preview)[rule].status, 'fail')
  assert.equal(judged[PREVIEW_KINDS['template-fonts-left'].rule].status, 'fail')
})

test('a built-site run that replaces the file keeps the preview block another measure wrote there', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-measure-'))
  try {
    const first = fromSweepRow(row('ja-sensei', 'joomla'), META)
    const preview = [{ system: 'refero:moxie', scheme: 'light', kept: 0 }]
    const file = writeMeasurement(first, { root })
    writeFileSync(
      file,
      `${JSON.stringify({ ...first, preview, previewMeasuredAt: '2026-10-14T09:00:00Z' }, null, 2)}\n`
    )
    writeMeasurement(
      fromSweepRow(row('ja-sensei', 'joomla'), { ...META, measuredAt: '2026-10-15T03:11:17Z' }),
      { root }
    )
    const now = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(now.measuredAt, '2026-10-15T03:11:17Z')
    assert.deepEqual(now.preview, preview)
    assert.equal(now.previewMeasuredAt, '2026-10-14T09:00:00Z')
    // the release's VERIFICATION.json block keeps its preview the same way
    const rel = join(root, 'release')
    mkdirSync(rel)
    writeFileSync(join(rel, 'VERIFICATION.json'), JSON.stringify({ verified: true, designSystem: now }))
    writeMeasurement({ ...first, measuredAt: '2026-10-15T04:00:00Z' }, { root, releaseDir: rel })
    const block = JSON.parse(readFileSync(join(rel, 'VERIFICATION.json'), 'utf8'))
    assert.equal(block.verified, true)
    assert.deepEqual(block.designSystem.preview, preview)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preview rows of an older probe (or none named) never pass: the rule waits for a new measurement', async () => {
  const { judgePreview, previewProbeOf, STALE_PROBE_NOTE, validateMeasurement } = await import(
    '../src/measurement.mjs'
  )
  const row = (probeVersion, scheme = 'light', lowText = 0) => ({
    system: 'refero:moxie',
    scheme,
    ...(probeVersion === undefined ? {} : { probeVersion }),
    kept: 0,
    keptShare: 0,
    glare: 0,
    keptText: 0,
    lowText,
    lostButtons: 0,
    failedFonts: 0,
    empty: 0,
    docs: 1
  })
  assert.equal(judgePreview([row(PREVIEW_PROBE_VERSION)])['BTN-1'].status, 'pass')
  for (const old of [undefined, PREVIEW_PROBE_VERSION - 1]) {
    const j = judgePreview([row(old)])
    assert.equal(j['BTN-1'].status, 'unmeasurable', `probe ${old}`)
    assert.equal(j['BTN-1'].note, STALE_PROBE_NOTE)
    assert.deepEqual(j['BTN-1'].kinds, [], 'still a preview rule, for its stamp')
  }
  // mixed: what the current probe found still fails; what it passed waits for the old rows
  const mixed = judgePreview([row(PREVIEW_PROBE_VERSION, 'light', 2), row(undefined, 'dark')])
  assert.equal(mixed['CON-2'].status, 'fail')
  assert.equal(mixed['BTN-1'].status, 'unmeasurable')
  assert.match(mixed['BTN-1'].note, /older preview probe — measure again on refero:moxie\/dark/)
  assert.deepEqual(previewProbeOf([row(PREVIEW_PROBE_VERSION)]), {
    version: PREVIEW_PROBE_VERSION,
    current: true
  })
  assert.deepEqual(previewProbeOf([row(PREVIEW_PROBE_VERSION), row(undefined)]), {
    version: null,
    current: false
  })
  assert.equal(previewProbeOf(undefined), null)
  // the file may name the probe (older files do not); a wrong value is refused
  const doc = fromSweepRow(
    SWEEP.find((r) => r.id === 'ja-sensei' && r.cms === 'joomla'),
    META
  )
  assert.deepEqual(validateMeasurement({ ...doc, preview: [row(PREVIEW_PROBE_VERSION)] }), [])
  assert.deepEqual(validateMeasurement({ ...doc, preview: [row(undefined)] }), [])
  assert.deepEqual(validateMeasurement({ ...doc, preview: [row('1')] }), [
    'preview[0].probeVersion must be a positive integer'
  ])
})

test('every declared page: a rule counts per page, and a declared page with no row is unmeasured, never a pass', async () => {
  const { judgePreview, judgeMeasurement, validateMeasurement } = await import('../src/measurement.mjs')
  const registry = {
    'layout-drift': { rule: 'LAYOUT-3', what: 'rows whose columns changed', fix: 'keep the grid' }
  }
  const row = (/** @type {string} */ page, /** @type {number} */ n, scheme = 'light') => ({
    system: 'refero:moxie',
    scheme,
    page,
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
    detectors: { 'layout-drift': { count: n, where: n ? ['div.row'] : [] } }
  })
  const pages = ['/', '/pricing', '/about']
  // clean on every declared page, both schemes: a pass that says nothing is missing
  const clean = judgePreview(
    pages.flatMap((p) => [row(p, 0), row(p, 0, 'dark')]),
    undefined,
    registry,
    null,
    PREVIEW_PROBE_VERSION,
    pages
  )
  assert.equal(clean['LAYOUT-3'].status, 'pass')
  assert.equal(clean['LAYOUT-3'].pages, 3)
  assert.equal(clean['LAYOUT-3'].unmeasuredPages, undefined)
  // the home page clean, /about never measured: not a pass, and it names the page
  const partial = judgePreview(
    [row('/', 0), row('/pricing', 0)],
    undefined,
    registry,
    null,
    PREVIEW_PROBE_VERSION,
    pages
  )
  assert.equal(partial['LAYOUT-3'].status, 'unmeasurable')
  assert.deepEqual(partial['LAYOUT-3'].unmeasuredPages, ['/about'])
  assert.match(partial['LAYOUT-3'].note, /not measured on 1 of 3 declared pages \(\/about\)/)
  assert.equal(partial['TPL-1'].status, 'unmeasurable')
  // a page measured under one scheme only is missing under the other
  const oneScheme = judgePreview(
    [...pages.map((p) => row(p, 0)), row('/', 0, 'dark')],
    undefined,
    registry,
    null,
    PREVIEW_PROBE_VERSION,
    pages
  )
  assert.deepEqual(oneScheme['LAYOUT-3'].unmeasuredPages, ['/pricing', '/about'])
  // findings on sub-pages: counted per page as unique issues (the dark row's div.row is one of the two
  // light ones), the elements say their page, the miss still told
  const bad = judgePreview(
    [row('/', 0), row('/pricing', 2), row('/pricing', 1, 'dark'), row('/', 0, 'dark')],
    undefined,
    registry,
    null,
    PREVIEW_PROBE_VERSION,
    pages
  )
  const k = bad['LAYOUT-3'].kinds[0]
  assert.equal(bad['LAYOUT-3'].status, 'fail')
  assert.equal(k.count, 2)
  assert.equal(k.occurrences, 3, 'the per-row detail stays')
  assert.deepEqual(k.perPage, ['/pricing 3'])
  assert.deepEqual(k.pages, ['/pricing 2'])
  assert.deepEqual(k.on, ['refero:moxie/light 2', 'refero:moxie/dark 1'])
  assert.deepEqual(k.where, ['/pricing: div.row'])
  assert.deepEqual(k.sitewide, [])
  assert.match(bad['LAYOUT-3'].note, /on pages \/pricing 2/)
  assert.match(bad['LAYOUT-3'].note, /not measured on 1 of 3 declared pages \(\/about\)/)
  // the file carries the declared list, and the judge reads it
  const doc = {
    preview: [row('/', 0), row('/pricing', 0)],
    previewPages: pages,
    previewMisses: [{ page: '/about', reason: 'PAGE_NOT_FOUND', scheme: 'light' }]
  }
  assert.ok(!validateMeasurement(doc).some((e) => /preview(Pages|Misses)|\.page/.test(e)))
  assert.ok(validateMeasurement({ previewPages: ['pricing'] }).some((e) => e.startsWith('previewPages')))
  assert.ok(validateMeasurement({ preview: [{ ...row('x', 0) }] }).some((e) => e.includes('preview[0].page')))
  assert.equal(judgeMeasurement({ ...doc, perSystem: [] })['TPL-1'].status, 'unmeasurable')
})

test('site-wide: an element shared by the pages is one issue told "on every page", not one per page', async () => {
  const { judgePreview, issuesOf } = await import('../src/measurement.mjs')
  const registry = {
    'button-role': { rule: 'BTN-1', what: 'buttons off the system', fix: 'route the button' }
  }
  // JA Kinetic WordPress 1.0.9 (preview-check, 15/10/2026): the footer Subscribe on all 30 pages under
  // Moxie and Figma, plus one button of /pricing alone
  const pages = Array.from({ length: 30 }, (_, i) => (i ? `/p${i}/` : '/'))
  const row = (
    /** @type {string} */ page,
    /** @type {string} */ system,
    /** @type {string[]} */ where,
    n = where.length
  ) => ({
    system,
    scheme: 'light',
    page,
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
    detectors: { 'button-role': { count: n, where } }
  })
  const footer = 'button.btn.btn-primary.button'
  const rows = pages.flatMap((p) =>
    ['refero:moxie', 'refero:figma'].map((s) => row(p, s, p === '/p1/' ? [footer, 'a.price-cta'] : [footer]))
  )
  const k = judgePreview(rows, undefined, registry, null, PREVIEW_PROBE_VERSION, pages)['BTN-1'].kinds[0]
  assert.equal(k.occurrences, 62, 'every page, every system, as the rows counted it')
  assert.equal(k.count, 2, 'two buttons: the footer one and the /p1/ one')
  assert.deepEqual(k.sitewide, [
    { at: footer, pages: 30, of: 30, on: ['refero:moxie/light', 'refero:figma/light'] }
  ])
  assert.deepEqual(k.pages, ['/p1/ 1'])
  assert.deepEqual(k.where, ['/p1/: a.price-cta'])
  assert.deepEqual(k.on, ['refero:moxie/light 2', 'refero:figma/light 2'])
  const note = judgePreview(rows, undefined, registry, null, PREVIEW_PROBE_VERSION, pages)['BTN-1'].note
  assert.match(note, /site-wide: button\.btn\.btn-primary\.button on every page/)
  assert.doesNotMatch(note, /\/p2\/ 1/, 'the shared element does not list every page')
  // on some of the pages: "on N of M pages"
  const some = issuesOf(rows.slice(0, 20), 'button-role', (/** @type {any} */ r) => r.system, 30)
  assert.equal(some.sitewide[0].pages, 10)
  assert.equal(some.sitewide[0].of, 30)
  // findings no selector names (a row lists at most 8) count once per page, the most any row saw
  const many = issuesOf(
    [row('/', 'refero:moxie', ['h3.card'], 4), row('/', 'refero:figma', ['h3.card'], 3)],
    'button-role',
    (/** @type {any} */ r) => r.system,
    1
  )
  assert.equal(many.count, 4)
  // probe 6 says how many distinct elements a row saw: 115 harsh borders under 9 elements are 9 issues
  const named = (/** @type {number} */ unique) => ({
    ...row(
      '/',
      'refero:moxie',
      ['div.a', 'div.b', 'div.c', 'div.d', 'div.e', 'div.f', 'div.g', 'div.h'],
      115
    ),
    detectors: {
      'button-role': {
        count: 115,
        unique,
        where: ['div.a', 'div.b', 'div.c', 'div.d', 'div.e', 'div.f', 'div.g', 'div.h']
      }
    }
  })
  assert.equal(issuesOf([named(9)], 'button-role', (/** @type {any} */ r) => r.system, 1).count, 9)
  assert.equal(issuesOf([named(8)], 'button-role', (/** @type {any} */ r) => r.system, 1).count, 8)
  // a kind the row's system causes on most templates (Moxie's harsh borders) is the system's: no
  // issue of the template's, listed only under the system's issues
  const sys = { systems: { 'refero:moxie': { 'button-role': { lines: 24, of: 40, examples: [] } } } }
  const j = judgePreview(rows, undefined, registry, sys, PREVIEW_PROBE_VERSION, pages)['BTN-1']
  assert.equal(j.kinds[0].count, 2, "Figma's rows still count")
  assert.deepEqual(j.kinds[0].on, ['refero:figma/light 2'])
  assert.deepEqual(
    j.systemIssues.map((/** @type {any} */ x) => [x.kind, x.system]),
    [['button-role', 'refero:moxie']]
  )
  const onlyMoxie = rows.filter((r) => r.system === 'refero:moxie')
  const m = judgePreview(onlyMoxie, undefined, registry, sys, PREVIEW_PROBE_VERSION, pages)['BTN-1']
  assert.equal(m.status, 'pass', 'nothing of the template counts')
  assert.equal(m.kinds[0].count, 0)
})
