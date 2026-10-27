import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('machineNotes keeps measured deltas intact and shortens identity fields only when needed', async () => {
  const { machineNotes } = await import('../visual/report.mjs')
  const noteFor = (finding) => JSON.parse(machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [finding] }] }], () => 'light-desktop')[0].what)
  const delta = [{ property: 'panel-w', expected: '1440px', observed: '880px' }]
  const label = 'Our Services '.repeat(10)
  const menuFinding = {
    kind: 'menu-open-layout',
    element: `header menu "${label}" › panel`,
    trigger: label,
    subject: { text: label },
    properties: ['panel-w'],
    deltas: delta
  }
  const menuRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [menuFinding] }] }], () => 'light-desktop')[0]
  assert.ok(menuRow.what.length <= 300)
  assert.deepEqual(JSON.parse(menuRow.what).deltas, delta)
  assert.equal(JSON.parse(menuRow.what).trigger.endsWith('…'), true)

  const className = `.card-title-${'x'.repeat(43)}`
  const text = 'x'.repeat(40)
  const parityDelta = [{ property: 'font-size', expected: '24px', observed: '40px' }]
  const parityRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [{
    kind: 'parity-mismatch',
    element: `h3${className} "${text}"`,
    subject: { selector: className, text },
    properties: ['font-size'],
    deltas: parityDelta
  }] }] }], () => 'light-desktop')[0]
  assert.ok(parityRow.what.length <= 300)
  assert.deepEqual(JSON.parse(parityRow.what).deltas, parityDelta)
  assert.equal(JSON.parse(parityRow.what).element.endsWith('…'), true)

  const shortDetail = {
    element: 'h3.card-title "Welcome"',
    subject: { selector: 'h3.card-title', text: 'Welcome' },
    properties: ['font-size'],
    deltas: [{ property: 'font-size', expected: '24px', observed: '40px' }]
  }
  const shortFinding = { kind: 'parity-mismatch', ...shortDetail }
  const shortRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [shortFinding] }] }], () => 'light-desktop')[0]
  assert.equal(shortRow.what, JSON.stringify(shortDetail))

  const manyDeltas = Array.from({ length: 8 }, (_, i) => ({ property: `property-${i}`, expected: `expected-${i}`, observed: `observed-${i}` }))
  const manyRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [{
    kind: 'parity-mismatch',
    element: 'h3.card-title',
    side: 'site',
    property: 'font-size',
    expected: '24px',
    observed: '40px',
    properties: manyDeltas.map((item) => item.property),
    deltas: manyDeltas
  }] }] }], () => 'light-desktop')[0]
  assert.ok(manyRow.what.length <= 300)
  const many = JSON.parse(manyRow.what)
  assert.equal(many.deltas[0].observed, 'observed-0')
  assert.equal(many.more, 8 - many.deltas.length)
  assert.equal(many.side, 'site')
  assert.equal(many.property, 'font-size')
  assert.equal(many.expected, '24px')
  assert.equal(many.observed, '40px')

  const allFitFinding = {
    kind: 'parity-mismatch',
    reason: 'r'.repeat(360),
    deltas: [{ property: 'font-size', expected: '24px', observed: '40px' }]
  }
  const allFitRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [allFitFinding] }] }], () => 'light-desktop')[0]
  const allFit = JSON.parse(allFitRow.what)
  assert.ok(allFitRow.what.length <= 300)
  assert.deepEqual(allFit.deltas, allFitFinding.deltas)
  assert.equal(Object.hasOwn(allFit, 'more'), false)
  assert.equal(allFitRow.what.includes('null'), false)

  const reasonFinding = { kind: 'parity-mismatch', reason: 'source rendering differs '.repeat(20) }
  const reasonRow = machineNotes([{ id: 'page', axes: [{ variant: '1440-light', findings: [reasonFinding] }] }], () => 'light-desktop')[0]
  const reasonNote = JSON.parse(reasonRow.what)
  assert.ok(reasonRow.what.length <= 300)
  assert.equal(reasonRow.lens, 'machine:parity-mismatch')
  assert.ok(reasonNote.reason.endsWith('…'))
})

test('report counts source checks as not-applicable separately from measured axes', async () => {
  const { summarize, visualMarkdown } = await import('../visual/report.mjs')
  const { SOURCE_DEPENDENT_CHECKS } = await import('../visual/applicability.mjs')
  const axis = {
    variant: '1440-light', components: [], findings: [], accepted: [], scans: {}, measured: 'now',
    notApplicable: SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' })),
    menus: { measured: true, targetOnly: true, menus: [], findings: [], comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' } }
  }
  const summary = summarize([{ id: 'brief', referenceKind: 'none', axes: [axis] }], [])
  assert.equal(summary.axes, 1)
  assert.deepEqual(summary.notApplicable, Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 1])))
  assert.equal(summary.menus.notApplicable, 1)
  const markdown = visualMarkdown({ site: 'http://site.test', at: '2030-01-01T00:00:00Z', summary, stageReports: [], pages: [{ id: 'brief', path: '/', axes: [axis], findings: [] }] })
  assert.match(markdown, /Source checks not applicable: content-parity 1/)
  const unknown = summarize([{ id: 'brief', axes: [axis] }], [])
  assert.deepEqual(unknown.notApplicable, Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 0])))
})

// An unclassified element accepted by a cited decision is not a defect: the summary counts the
// unclassified FINDINGS left, not the raw coverage list — the raw count kept the exit code at 1
// after every one of them was accepted (15/09).
test('summarize: an accepted unclassified element does not count against the run', async () => {
  const { summarize } = await import('../visual/report.mjs')
  const pages = [
    {
      id: 'en-home',
      axes: [
        {
          variant: '1440-light',
          components: [],
          coverage: { unclassified: ['p "Read more"', 'p "Only here"'] },
          findings: [{ kind: 'unclassified-element', element: 'p "Only here"' }],
          accepted: [{ kind: 'unclassified-element', element: 'p "Read more"', exception: { decision: 'D24.19' } }]
        }
      ]
    }
  ]
  const s = summarize(pages, [{ id: 'light-desktop', status: 'fail' }])
  assert.equal(s.unclassified, 1)
  assert.equal(s.accepted, 1)
})

test('writeRun reports interaction coverage from the attestation result, not the claim', async () => {
  const { writeRun } = await import('../visual/report.mjs')
  const out = mkdtempSync(path.join(tmpdir(), 'visual-interaction-attestation-'))
  try {
    const report = writeRun({ out, site: 'http://site.test', contractFile: 'contract.json', stageReports: [], pages: [], stageOf: () => 'light-desktop', method: 'test', interaction: {
      claim: { status: 'run', blocking: 0, examined: 1, findings: 0, notMeasured: 0 },
      record: { tool: 'interaction-parity/6', status: 'run', pages: ['/'], checks: ['drawer'], coverage: [], examined: 1, findings: [], notMeasured: [] }
    } })
    assert.equal(report.summary.interaction.coverage.ok, false)
    assert.equal(report.summary.interaction.blocking, 0, 'the interaction claim continues to govern the probe run; finish consumers enforce the attestation')
    assert.match(report.summary.interaction.coverage.problems.join(), /expected interaction-parity\/7/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('writeRun scopes interaction attestation to the report site, source and routes', async () => {
  const { writeRun } = await import('../visual/report.mjs')
  const out = mkdtempSync(path.join(tmpdir(), 'visual-interaction-scope-'))
  try {
  const report = writeRun({ out, site: 'http://site.test', sourceSite: 'http://source.test', contractFile: 'contract.json', stageReports: [], pages: [{ id: 'home', path: '/', axes: [] }], stageOf: () => 'light-desktop', method: 'test', interaction: {
      claim: { status: 'run', blocking: 0, examined: 1, findings: 0, notMeasured: 0 },
      record: { tool: 'interaction-parity/7', status: 'run', pages: ['/other/'], checks: ['drawer'], coverage: [{ check: 'drawer', route: '/other/', width: 390, theme: 'light', measured: true }], examined: 1, findings: [], notMeasured: [], origins: { site: 'http://different.test', source: 'http://other-source.test' }, tiers: {}, chromePages: ['/other/'], obligations: [], outcomes: [], discoveries: [] }
    } })
    assert.equal(report.summary.interaction.coverage.ok, false)
    assert.match(report.summary.interaction.coverage.problems.join(' | '), /this consumer's site is http:\/\/site\.test/)
    assert.match(report.summary.interaction.coverage.problems.join(' | '), /this consumer's source is http:\/\/source\.test/)
    assert.match(report.summary.interaction.coverage.problems.join(' | '), /does not list the page \/ this consumer measured/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

// A digest nobody reads is the same failure as a gate nobody can fail. Measured 18/09 on the
// sibling EmDash base template: 12,898 of 12,898 component rows were `PASS` with no delta, and
// printing them made VISUAL.md 1.79 MB — 85% of it saying only "this was checked and it matched".
// The rows stay in visual.json; what changes is what a READER is handed first.
test('visualMarkdown: the component table prints exceptions and counts the rest; triage groups sightings into problems', async () => {
  const { visualMarkdown, summarize, distinctKey } = await import('../visual/report.mjs')
  const { parityByText } = await import('../visual/visual-qa.mjs')

  // ⚠ THE COMPONENTS COME FROM THE REAL PRODUCER, NOT FROM THIS FILE. An earlier version of this
  // test hand-wrote `status: 'PASS'` rows — a spelling `parityByText` never emits (it writes `ok`)
  // — so the filter under test matched nothing on real output while the test stayed green. A test
  // that invents its producer's output cannot fail for the reason it exists.
  const st = { color: 'rgb(0, 0, 0)', 'font-size': '16px' }
  const props = ['color', 'font-size']
  const site = [
    { tag: 'p', cls: '', text: 'Body copy one', styles: st },
    { tag: 'p', cls: '', text: 'Body copy two', styles: st },
    { tag: 'h1', cls: '', text: 'Title', styles: { color: 'rgb(51, 51, 51)', 'font-size': '16px' } }
  ]
  const index = {
    'Body copy one': [{ tag: 'p', styles: st }],
    'Body copy two': [{ tag: 'p', styles: st }],
    Title: [{ tag: 'h1', styles: { color: 'rgb(0, 0, 0)', 'font-size': '16px' } }]
  }
  const produced = parityByText(site, index, { properties: props, hexTolerance: 0, pxTolerance: 1 })
  const clean = produced.components.filter((c) => !(c.deltas ?? []).length)
  const dirty = produced.components.filter((c) => (c.deltas ?? []).length)
  assert.ok(clean.length >= 2 && dirty.length >= 1, JSON.stringify(produced.components))
  assert.ok(clean.every((c) => c.status === 'ok'), `the producer spells a clean row: ${clean[0].status}`)

  const axis = (variant) => ({
    variant,
    components: produced.components,
    // the SAME defect on two axes and two pages: four sightings, one problem
    findings: [{ kind: 'parity-not-measured', element: 'headerCta' }],
    accepted: [{ kind: 'scan:contrast', element: '.meta', exception: { reason: 'brand grey', decision: 'G-12' } }]
  })
  const pages = [
    { id: 'en-home', axes: [axis('1440-light'), axis('1440-dark')] },
    { id: 'en-about', axes: [axis('1440-light'), axis('1440-dark')] }
  ]
  const stages = [{ id: 'light-desktop', status: 'fail', pages: 2, axes: 4, reused: 0, findings: 4 }]
  const summary = summarize(pages, stages)
  const md = visualMarkdown({ site: 'http://x', at: '2026-09-19T00:00:00.000Z', summary, stageReports: stages, pages })

  // the mismatching row is printed; the clean ones are counted, not listed
  assert.match(md, new RegExp(`\\| en-home \\| 1440-light \\| ${dirty[0].rule} · `))
  assert.doesNotMatch(md, new RegExp(`\\| en-home \\| 1440-light \\| ${clean[0].rule} · \\\`${clean[0].element}`))
  assert.match(md, new RegExp(`${clean.length * 4} further component\\(s\\) matched with no delta`))

  // four sightings of one problem collapse to one triage row naming both axes and both pages
  assert.match(md, /## Triage/)
  assert.match(md, /\| parity-not-measured \| `headerCta` \| — \| 4 \| 2 \| 1440-dark, 1440-light \|/)
  // accepted exceptions are shown, not hidden: they are still discrepancies
  assert.match(md, /Accepted by a cited exception[\s\S]*\| scan:contrast \| `\.meta` \| — \| 4 \| 2 \|/)

  // the triage grouping and the summary count use ONE key, so they cannot drift apart
  assert.equal(summary.distinct, new Set(pages.flatMap((p) => p.axes.flatMap((a) => a.findings.map(distinctKey)))).size)
})

// ~140 findings of JA Vega M4c dd-1 were ONE card-title colour and were read one by one. The run
// now writes clusters.{json,md} and every file a fixing agent opens starts with them; findings,
// totals, machine.json and the verdict are exactly what they were.
test('writeRun: clusters come first in VISUAL.md and machine.md; machine.json and the summary do not move', async () => {
  const { readFileSync } = await import('node:fs')
  const { testDir } = await import('./lib/test-root.mjs')
  const path = await import('node:path')
  const { writeRun, writeClusterViews, summarize, machineNotes } = await import('../visual/report.mjs')
  const d = (w) => ({ kind: 'parity-mismatch', element: `h3.card__title "${w}"`, deltas: [{ property: 'color', expected: 'rgb(241, 243, 246)', observed: 'rgb(59, 139, 255)' }] })
  const u = { kind: 'unclassified-element', element: 'a "Blogs"' }
  const axis = (findings) => ({ variant: '1440-dark', stage: 'dark-desktop', components: [], findings, accepted: [] })
  const pages = [
    { id: 'en-blog', axes: [axis([d('One'), d('Two'), u])] },
    { id: 'en-portfolio', axes: [axis([d('Three')])] }
  ]
  const stages = [{ id: 'dark-desktop', status: 'fail', pages: 2, axes: 2, reused: 0, findings: 4 }]
  const out = testDir('report')
  const stageOf = () => 'dark-desktop'
  const report = writeRun({ out, site: 'http://x', contractFile: 'c.json', identity: { capturedAt: '2026-09-27T00:00:00.000Z' }, stageReports: stages, pages, stageOf, method: 'test' })
  assert.deepEqual(report.summary, { ...summarize(pages, stages) })
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'notes', 'machine.json'), 'utf8')), JSON.parse(JSON.stringify(machineNotes(pages, stageOf))))

  const clusters = JSON.parse(readFileSync(path.join(out, 'clusters.json'), 'utf8'))
  assert.equal(clusters.totals.findings, 4)
  assert.equal(clusters.totals.clusters, 2)
  assert.equal(clusters.clusters[0].size, 3)
  const visual = readFileSync(path.join(out, 'VISUAL.md'), 'utf8')
  const at = visual.indexOf('## Clusters — probable root causes; fix these first')
  assert.ok(at > 0 && at < visual.indexOf('## Triage'), 'clusters before triage')
  assert.match(visual, /4 open finding\(s\) → \*\*2 cluster\(s\)\*\*/)
  assert.match(visual, /\| C-[0-9a-f]{8} \| 3 \| parity-mismatch \| h3\.card__title \| color \| rgb\(241, 243, 246\) → rgb\(59, 139, 255\) \| 2 \| en-blog \|/)
  const machine = readFileSync(path.join(out, 'notes', 'machine.md'), 'utf8')
  assert.ok(machine.indexOf('## Clusters first') < machine.indexOf('| Id | Lens |'), 'machine rows are the members, after the clusters')
  assert.match(machine, /members and their keys are in \.\.\/clusters\.md/)
  assert.match(readFileSync(path.join(out, 'clusters.md'), 'utf8'), /en-blog\|1440-dark\|findings#0/)

  // round.mjs regroups with history: the unchanged cluster moves apart; nothing else in VISUAL.md moves
  const history = [{ run: 'dd-0', pages: [{ id: 'en-blog', axes: [axis([u])] }] }]
  const views = writeClusterViews(out, report, { history })
  assert.deepEqual(views.views, { clusters: true, visual: true, machine: true })
  assert.equal(views.clusters.totals.unchanged, 1)
  const again = readFileSync(path.join(out, 'VISUAL.md'), 'utf8')
  assert.match(again, /1 cluster\(s\) unchanged since the last measurement — still open/)
  const section = again.slice(at, again.indexOf('## Triage'))
  const [first, stuck] = section.split('Unchanged since the last measurement (largest 1 of 1')
  assert.doesNotMatch(first, /a "Blogs"/, 'the unchanged cluster is not in the first table')
  assert.match(stuck, /\| unclassified-element \| a "Blogs" \| — \| — \| ×1 \|/, 'it stays in sight, apart, with its streak')
  assert.equal(again.slice(again.indexOf('## Triage')), visual.slice(visual.indexOf('## Triage')), 'triage and every table after it are untouched')
  assert.equal(again.slice(0, at), visual.slice(0, at))
  assert.match(readFileSync(path.join(out, 'clusters.md'), 'utf8'), /## Unchanged since the last measurement[\s\S]*a "Blogs"[^\n]*unchanged ×1 since dd-0/)
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'visual.json'), 'utf8')).summary, report.summary)
})
