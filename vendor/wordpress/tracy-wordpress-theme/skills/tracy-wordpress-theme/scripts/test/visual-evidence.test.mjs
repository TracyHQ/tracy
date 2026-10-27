// One closed schema per evidence file of the visual gates (scripts/visual/evidence.mjs), validated where the file is read:
// a missing, null or mistyped field is a named refusal, never a default that passes. One fixture per field class
// (null, wrong type, missing, unknown id form, oversized, hostile file) on top of valid controls the producers emit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closeSync, mkdirSync, openSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { testDir } from './lib/test-root.mjs'
import { assessFastGate } from '../visual/fast-gate.mjs'
import { auditOf } from './lib/visual-evidence-fixtures.mjs'
const gate = (dir, o = {}) => assessFastGate(dir, { audit: auditOf(dir) ?? null, ...o })
import { CLUSTERS, INDEX, MACHINE, MANIFEST, NOTES, PLAN, RECEIPT, SECTIONS, VISUAL, VISUAL_PRIOR, problems, readEvidence } from '../visual/evidence.mjs'
import { machineNotes, writeRun } from '../visual/report.mjs'
import { mergeNotes } from '../visual/notes.mjs'
import { claimsOf, reportOf } from './lib/intrinsic-fixtures.mjs'
import { STAGE, axisOf, clone, indexFor, indexOf, machineRow, notesOf, planOf, shotOf, todoOf, visualOf, writeRunDir } from './lib/visual-evidence-fixtures.mjs'
import { clusterFindings } from '../visual/cluster.mjs'
import { SOURCE_DEPENDENT_CHECKS } from '../visual/applicability.mjs'

const CENSUS = { headers: 1, triggers: 1, openAtRest: 0, overCap: 0, labels: ['Menu'], drawers: 0, kinds: ['button'] }
const openSide = (o = {}) => ({ opened: true, via: 'hover', rect: { x: 0, y: 0, width: 10, height: 10 }, surface: null, items: [], moreItems: 0, screenshot: 'shots/m.png', clipped: false, closed: 'escape', ...o })
const menusOf = (o = {}) => ({ measured: true, site: CENSUS, source: CENSUS, pairs: 1, menus: [], unmatched: [], notMeasured: [], ms: 12, ...o })
const verdict = (over = {}, opts = {}) => gate(writeRunDir(testDir('evidence-run'), over), { contractHash: 'sha256:c', expectedRoutes: ['/'], ...opts })
const reasons = (over, opts) => verdict(over, opts).reasons.join(' | ')

test('controls: a complete producer-shaped run passes, and every schema accepts what its producer writes', () => {
  const v = verdict()
  assert.deepEqual(v.reasons, [])
  assert.equal(v.status, 'pass')
  assert.deepEqual(problems(planOf(), PLAN, 'plan'), [])
  assert.deepEqual(problems(v, RECEIPT, 'FAST-GATE.json'), [], 'the verdict is a valid receipt')
  assert.deepEqual(problems(gate(testDir('evidence-none'), {}), RECEIPT, 'FAST-GATE.json'), [], 'a failed verdict without a run is a valid (failing) receipt')
  // the real writers: report.mjs (visual.json, index.json, machine.json) and notes.mjs (NOTES)
  const out = testDir('evidence-writer')
  const claims = claimsOf(reportOf())
  const axis = { ...axisOf('v1'), layout: 'home', screenshot: 'shots/p1--v1.png', shotConsumers: ['layout', 'color'], tiles: ['shots/t.png'], tilesCoverPicture: true, sourceShotMissing: 'no source', findings: [{ kind: 'contrast', element: 'a', rule: 'r' }] }
  const pages = [{ id: 'p1', path: '/', layout: 'home', hash: 'sha256:p1', hashParts: { source: 's' }, axes: [axis], findings: [{ kind: 'contrast', element: 'a', rule: 'r', axis: 'v1' }] }]
  const report = writeRun({ out, site: 'http://x', contractFile: 'c.json', identity: { contractHash: 'sha256:c', capturedAt: '2026-09-30T00:00:00.000Z' }, stageReports: [{ id: STAGE, variants: ['v1'], pages: 1, axes: 1, findings: 1, reused: 0, status: 'fail' }], pages, stageOf: () => STAGE, method: 'test', intrinsic: { ...claims.intrinsic, rows: [], errorRows: [] } })
  assert.deepEqual(problems(JSON.parse(JSON.stringify(report)), VISUAL, 'visual.json'), [])
  const index = readEvidence(path.join(out, 'index.json'), INDEX)
  assert.equal(index.missing.length, 1)
  const machine = readEvidence(path.join(out, 'notes', 'machine.json'), MACHINE)
  assert.deepEqual(machine, machineNotes(pages, () => STAGE))
  const merged = mergeNotes({ stage: STAGE, machine, lensNotes: { layout: '## Opened\n\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n| p1 | v1 | a thing | | | | LEE |\n' }, shots: index.shots, hashOf: () => null })
  assert.deepEqual(problems(JSON.parse(JSON.stringify(merged)), NOTES, `NOTES-${STAGE}.json`), [])
  assert.equal(merged.todos.length, 2)
  assert.ok(merged.todos.some((t) => t.id.startsWith('M-')) && merged.todos.some((t) => t.id.startsWith('N-')))
})

test('not-applicable evidence is typed per check, and is refused on a source-backed page', () => {
  const v = visualOf()
  const page = v.pages[0]
  page.referenceKind = 'none'
  page.axes[0].notApplicable = SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' }))
  v.summary.notApplicable = Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 1]))
  page.axes[0].menus = {
    measured: true, targetOnly: true,
    site: { headers: 1, triggers: 1, openAtRest: 0, overCap: 0, labels: ['Menu'], drawers: 0, kinds: ['button'] },
    source: null, pairs: 0,
    menus: [{ trigger: 'Menu', key: 'menu:menu', site: { opened: true, via: 'click', rect: {}, surface: null, items: [], moreItems: 0, screenshot: 'shots/menu.png', clipped: false, closed: 'escape' }, findings: 0 }],
    unmatched: [], notMeasured: [], ms: 10,
    comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' }
  }
  assert.deepEqual(problems(v, VISUAL, 'visual.json'), [])
  assert.match(problems(v, VISUAL, 'visual.json', { referenceKinds: { p1: 'url' } }).join(' | '), /reference\.kind=none/)
  assert.match(problems(v, VISUAL, 'visual.json', { referenceKinds: {} }).join(' | '), /N\/A evidence requires --spec to bind reference\.kind=none/)
  const wrongTotals = clone(v)
  wrongTotals.summary.notApplicable['content-parity'] = 0
  assert.match(problems(wrongTotals, VISUAL, 'visual.json').join(' | '), /summary\.notApplicable\.content-parity is 0, but the axes hold 1/)
  const missingTarget = clone(v)
  delete missingTarget.pages[0].axes[0].menus.targetOnly
  assert.notDeepEqual(problems(missingTarget, VISUAL, 'visual.json'), [])
  page.referenceKind = 'html'
  assert.match(problems(v, VISUAL, 'visual.json').join(' | '), /only valid for reference\.kind=none/)
})

// one fixture per field class, for each of the five reproduced bypasses and their siblings
const BYPASSES = [
  ['scope.plan null on a fast-gate run', { 'visual.json': (() => { const v = visualOf(); v.scope.plan = null; return v })() }, /visual\.json\.scope\.plan must be an object/],
  ['scope.plan without cases', { 'visual.json': (() => { const v = visualOf(); delete v.scope.plan.cases; return v })() }, /scope\.plan\.cases is missing/],
  ['scope.plan with no cases', { 'visual.json': (() => { const v = visualOf(); v.scope.plan.cases = []; return v })() }, /scope\.plan\.cases must hold at least 1/],
  ['a shot without consumers', { 'index.json': indexOf([(() => { const s = shotOf(); delete s.consumers; return s })()]) }, /index\.json\.shots\[0\]\.consumers is missing/],
  ['a shot whose consumers is a string', { 'index.json': indexOf([shotOf({ consumers: 'layout' })]) }, /shots\[0\]\.consumers must be an array/],
  ['a shot whose consumers is null', { 'index.json': indexOf([shotOf({ consumers: null })]) }, /shots\[0\]\.consumers must be an array/],
  ['a shot with an empty consumer list', { 'index.json': indexOf([shotOf({ consumers: [] })]) }, /consumers must hold at least 1/],
  ['a shot with an unknown lens', { 'index.json': indexOf([shotOf({ consumers: ['layout', 'vibes'] })]) }, /consumers\[1\] "vibes" is not one of/],
  ['an open todo with an id outside N-/M-', { [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos: [todoOf({ id: 'X-1' })] }) }, /todos\[0\]\.id "X-1" is not an allowed form/],
  ['a todo id of the N- form but not a hash', { [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos: [todoOf({ id: 'N-abc' })] }) }, /todos\[0\]\.id "N-abc" is not an allowed form/],
  ['counts that say 0 open over an open row', { [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos: [todoOf()], counts: { open: 0 } }) }, /counts\.open is 0 but 1 todo row/],
  ['counts that hide a LEE flag', { [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos: [todoOf({ flag: 'LEE', status: 'closed' }), todoOf({ id: 'N-0a1b2d', flag: 'LEE' })], counts: { leeFlagged: 0 } }) }, /counts\.leeFlagged is 0 but 1/],
  ['a shot on a stage the run does not have', { 'index.json': indexOf([shotOf({ stage: 'nope' })]) }, /shots row p1\/v1 \(site\) names stage "nope"/],
  ['a shot on no stage (null)', { 'index.json': indexOf([shotOf({ stage: null })]) }, /names stage null/]
]
for (const [name, over, re] of BYPASSES)
  test(`refusal: ${name}`, () => {
    const v = verdict(over)
    assert.equal(v.status, 'fail')
    assert.match(v.reasons.join(' | '), re)
  })

test('an open todo of any id form is counted, not only N-', () => {
  const todos = [todoOf({ id: 'M-0a1b2c', status: 'open' })]
  assert.match(reasons({ [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos }) }), /1 note\(s\) not closed/)
  assert.equal(verdict({ [`NOTES-${STAGE}.json`]: notesOf(STAGE, { todos: [todoOf({ id: 'M-0a1b2c', status: 'closed' })] }) }).status, 'pass')
})

// every field class against every schema: null, wrong type, missing, unknown field
const SCHEMAS = [
  ['visual.json', 'visual.json', () => visualOf(), ['scope', 'identity', 'stages', 'summary', 'pages', 'scope.kind', 'identity.contractHash', 'summary.findings', 'stages.0.id', 'stages.0.status', 'pages.0.id', 'pages.0.hash', 'pages.0.axes', 'pages.0.axes.0.variant', 'pages.0.axes.0.findings', 'scope.plan.cases.0.variants', 'scope.plan.cases.0.page', 'scope.plan.coverage', 'scope.plan.errors']],
  ['index.json', 'index.json', () => indexOf(), ['shots', 'missing', 'shots.0.consumers', 'shots.0.tiles', 'shots.0.file', 'shots.0.side', 'shots.0.hash']],
  ['notes/machine.json', 'notes/machine.json', () => [machineRow()], ['0.id', '0.status', '0.what', '0.lens']],
  [`NOTES-${STAGE}.json`, `NOTES-${STAGE}.json`, () => notesOf(STAGE, { todos: [todoOf()] }), ['stage', 'counts', 'counts.open', 'lenses', 'coverage', 'coverage.missing', 'todos', 'todos.0.id', 'todos.0.status', 'todos.0.lenses', 'todos.0.flag']]
]
function pick(root, dotted) {
  const keys = dotted.split('.')
  const last = keys.pop()
  const holder = keys.reduce((o, k) => o[k], root)
  return [holder, last]
}
for (const [file, label, build, fields] of SCHEMAS)
  for (const field of fields)
    for (const kind of ['null', 'mistyped', 'missing']) {
      test(`${label}: ${field} ${kind} is a named refusal`, () => {
        const doc = build()
        const [holder, key] = pick(doc, field)
        const current = holder[key]
        if (kind === 'null') holder[key] = null
        else if (kind === 'missing') delete holder[key]
        else holder[key] = Array.isArray(current) ? 'x' : typeof current === 'object' && current !== null ? [] : typeof current === 'number' ? 'x' : { x: 1 }
        const v = verdict({ [file]: doc })
        assert.equal(v.status, 'fail')
        const text = v.reasons.join(' | ')
        // the nullable fields (a shot's layout, a machine row's stage) are not in the lists; everything here is required
        assert.match(text, new RegExp(label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), 'names the file')
        assert.match(text, /malformed|unusable|no usable/, 'is a refusal')
      })
    }
for (const [file, label, build] of SCHEMAS)
  test(`${label}: an unknown field at the top or nested is refused`, () => {
    const doc = build()
    const target = Array.isArray(doc) ? doc[0] : doc
    target.surprise = 1
    const v = verdict({ [file]: doc })
    assert.equal(v.status, 'fail')
    assert.match(v.reasons.join(' | '), /surprise is not a known field/)
  })

test('the receipt: a pass without page hashes, a fail without a reason, a pass with reasons and unknown fields are refused', () => {
  const good = verdict()
  const check = (mutate) => {
    const r = clone(good)
    mutate(r)
    return problems(r, RECEIPT, 'FAST-GATE.json').join(' | ')
  }
  assert.match(check((r) => delete r.pageHashes), /pageHashes is missing/)
  assert.match(check((r) => (r.pageHashes = {})), /pageHashes must hold at least 1/)
  assert.match(check((r) => (r.pageHashes = null)), /pageHashes must be an object/)
  assert.match(check((r) => (r.status = 'passed')), /status "passed"/)
  assert.match(check((r) => (r.reasons = ['x'])), /reasons must be empty for a pass/)
  assert.match(check((r) => ((r.status = 'fail'), (r.reasons = []))), /reasons must name why/)
  assert.match(check((r) => (r.extra = 1)), /extra is not a known field/)
  assert.match(check((r) => (r.contractHash = null)), /contractHash must be a string for a pass/)
  assert.match(check((r) => (r.cases = [])), /cases must hold at least 1/)
  assert.match(check((r) => (r.stale = ['p1'])), /stale must be empty for a pass/)
})

test('plan: duplicate cases, empty variants, unknown stage and a plan with errors are refused', () => {
  const dup = planOf([{ page: 'p1', variants: ['v1'] }, { page: 'p1', variants: ['v2'] }])
  assert.match(problems(dup, PLAN, 'plan').join(' | '), /lists "p1" twice/)
  assert.match(problems(planOf([{ page: 'p1', variants: [] }]), PLAN, 'plan').join(' | '), /variants must hold at least 1/)
  assert.match(problems(planOf([{ page: 'p1', variants: ['v1', 'v1'] }]), PLAN, 'plan').join(' | '), /lists "v1" twice/)
  const withErrors = { ...planOf(), errors: ['coverage: x'] }
  assert.match(problems(withErrors, PLAN, 'plan').join(' | '), /errors must be empty/)
  const v = visualOf()
  v.scope.plan.cases[0].stages = ['ghost']
  assert.match(reasons({ 'visual.json': v }), /names stage "ghost" the run does not have/)
  // full and targeted runs keep their null plan; a fast-gate scope with another plan shape is not a plan
  assert.deepEqual(problems(visualOf({ kind: 'full' }), VISUAL, 'visual.json'), [])
  assert.deepEqual(problems(visualOf({ kind: 'targeted-debug' }), VISUAL, 'visual.json'), [])
  const full = visualOf({ kind: 'full' })
  full.scope.plan = planOf()
  assert.match(problems(full, VISUAL, 'visual.json').join(' | '), /scope\.plan must be null/)
  const unknownKind = visualOf()
  unknownKind.scope.kind = 'partial'
  assert.match(problems(unknownKind, VISUAL, 'visual.json').join(' | '), /scope\.kind "partial" is not one of/)
  assert.match(reasons({ 'visual.json': visualOf({ kind: 'full' }) }), /scope is full, not fast-gate/)
  const empty = visualOf()
  empty.stages = []
  assert.match(problems(empty, VISUAL, 'visual.json').join(' | '), /stages must hold at least 1/)
  const dupStage = visualOf({ stages: ['s1', 's1'] })
  assert.match(problems(dupStage, VISUAL, 'visual.json').join(' | '), /lists "s1" twice/)
})

test('a stage of the visual.json with no notes file, a mismatched stage name and a machine row of another stage', () => {
  assert.match(reasons({ [`NOTES-${STAGE}.json`]: false }), /notes not merged/)
  assert.match(reasons({ [`NOTES-${STAGE}.json`]: notesOf('other') }), /stage is "other", not s1/)
  assert.match(reasons({ 'notes/machine.json': [machineRow()], 'visual.json': visualOf({ findings: 1 }) }), /1 machine finding/)
})

test('oversized, empty, truncated, non-JSON, linked, directory and FIFO evidence: named refusals without following or blocking', () => {
  for (const file of ['visual.json', 'index.json', 'notes/machine.json', `NOTES-${STAGE}.json`]) {
    const cases = {
      oversized: (d) => {
        const f = path.join(d, file)
        closeSync(openSync(f, 'w'))
        truncateSync(f, 40 * 1024 * 1024)
      },
      empty: (d) => writeFileSync(path.join(d, file), ''),
      truncated: (d) => writeFileSync(path.join(d, file), '{"shots": ['),
      null: (d) => writeFileSync(path.join(d, file), 'null'),
      directory: (d) => mkdirSync(path.join(d, file), { recursive: true }),
      linked: (d) => {
        writeFileSync(path.join(d, 'real.json'), '{}')
        symlinkSync(path.join(d, 'real.json'), path.join(d, file))
      }
    }
    for (const [name, make] of Object.entries(cases)) {
      const dir = testDir('evidence-hazard')
      writeRunDir(dir, { [file]: false })
      make(dir)
      const v = gate(dir, { contractHash: 'sha256:c', expectedRoutes: ['/'] })
      assert.equal(v.status, 'fail', `${file} ${name}`)
      assert.match(v.reasons.join(' | '), new RegExp(file.replace('.', '\\.')), `${file} ${name}`)
    }
    // a FIFO must not block the verdict
    const dir = testDir('evidence-fifo')
    writeRunDir(dir, { [file]: false })
    spawnSync('mkfifo', [path.join(dir, file)])
    const href = new URL('../visual/fast-gate.mjs', import.meta.url).href
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { assessFastGate } from ${JSON.stringify(href)}; const v = assessFastGate(${JSON.stringify(dir)}, { expectedRoutes: ['/'], audit: ${JSON.stringify(auditOf(dir) ?? null)} }); console.log(v.status)`], { timeout: 15000, encoding: 'utf8' })
    assert.equal(child.status, 0, `${file}: a FIFO must not block: ${String(child.error ?? child.stderr)}`)
    assert.equal(child.stdout.trim(), 'fail', file)
  }
})

test('the oversized file is refused before it is parsed (its size, not its content, decides)', () => {
  const dir = testDir('evidence-big')
  const f = path.join(dir, 'x.json')
  closeSync(openSync(f, 'w'))
  truncateSync(f, 5 * 1024 * 1024)
  assert.throws(() => readEvidence(f, MACHINE, { what: 'x.json', max: 1024 }), /x\.json: .*larger than 1024 bytes/)
})

// review round 2: producer rows the schema must accept, and open measurement / orphan / receipt variants it must refuse
// the three row kinds the ingest writers emit (from-joomla.mjs customModules / sectionsAcm / otherModules; from-html.mjs customSections / footerCustoms)
const customRow = (o = {}) => ({ id: 'c1', title: 'T', position: 'main', scope: 'page', ordering: 1, showtitle: false, sectionType: 'hero', pages: ['ALL'], html: '<p>x</p>', blocks: '', images: [], ...o })
const acmRow = (o = {}) => ({ id: 'a1', type: 'hero', style: 'style-1', title: 'T', position: 'main', published: true, ordering: 1, showtitle: false, pages: ['ALL'], spacing: { top: null, bottom: '10' }, moduleClass: '', itemGroup: null, fields: {}, items: [], scope: 'page', ...o })
const otherRow = (o = {}) => ({ id: 'o1', title: 'T', module: 'mod_menu', position: 'main', scope: 'page', ordering: 2, pages: [{ menuId: '3', file: null }], params: {}, ...o })
const sectionsOf = (o = {}) => ({ slotBlock: 'tracy-base/slot', acm: [acmRow()], custom: [customRow(), customRow({ id: 'footnav-1', sectionType: null, locale: 'en', pages: ['ALL'] })], other: [otherRow({ frame: { chrome: 'T3Section' } })], ...o })
test('sections.json: every row kind the ingest writers emit validates — a custom row of a non-page module has sectionType null', () => {
  const ok = sectionsOf()
  assert.deepEqual(problems(ok, SECTIONS, 'sections.json'), [])
  for (const [name, bad, re] of [
    ['a custom row with no sectionType', sectionsOf({ custom: [(({ sectionType, ...r }) => r)(customRow())] }), /custom\[0\]\.sectionType is missing/],
    ['a row with no id', sectionsOf({ acm: [(({ id, ...r }) => r)(acmRow())] }), /acm\[0\]\.id is missing/],
    ['a numeric id', sectionsOf({ other: [otherRow({ id: 3 })] }), /other\[0\]\.id must be a string/],
    ['a row of the wrong type', sectionsOf({ other: ['x'] }), /other\[0\] must be an object/],
    ['a missing list', (({ other, ...r }) => r)(sectionsOf()), /other is missing/],
    ['an empty type', sectionsOf({ custom: [customRow({ sectionType: '' })] }), /sectionType must not be empty/],
    ['an unknown field on a custom row', sectionsOf({ custom: [customRow({ extra: 1 })] }), /custom\[0\]\.extra is not a known field/],
    ['an unknown field on an acm row', sectionsOf({ acm: [acmRow({ sectionType: null })] }), /acm\[0\]\.sectionType is not a known field/],
    ['an unknown field on an other row', sectionsOf({ other: [otherRow({ extra: 1 })] }), /other\[0\]\.extra is not a known field/],
    ['an unknown field at the root', sectionsOf({ extra: [] }), /sections\.json\.extra is not a known field/],
    ['a mistyped slotBlock', sectionsOf({ slotBlock: { x: 1 } }), /slotBlock must be "tracy-base\/slot"/],
    ['a missing slotBlock', (({ slotBlock, ...r }) => r)(sectionsOf()), /slotBlock is missing/],
    ['an id twice in one list', sectionsOf({ custom: [customRow(), customRow()] }), /custom lists section "c1" twice/],
    ['an id across two lists', sectionsOf({ other: [otherRow({ id: 'c1' })] }), /other lists section "c1" twice/]
  ])
    assert.match(problems(bad, SECTIONS, 'sections.json').join(' | '), re, name)
})

const MUTATIONS = [
  ['an axis with no measured and no coverage (menus {})', (v) => { const a = v.pages[0].axes[0]; delete a.measured; delete a.coverage; a.menus = {} }, /axes\[0\]\.measured is missing.*coverage is missing|coverage is missing.*measured is missing/],
  ['an axis measured by hand-written text', (v) => { v.pages[0].axes[0].measured = 'yes' }, /axes\[0\]\.measured "yes" is not one of now \| reused/],
  ['a menus record that says it was measured and holds nothing', (v) => { v.pages[0].axes[0].menus = { measured: true } }, /menus\.pairs is missing/],
  ['a menus record not measured with no reason', (v) => { v.pages[0].axes[0].menus = { measured: false } }, /menus\.reason is missing|menus\.reason must be a string/],
  ['a reused axis that names no run', (v) => { v.pages[0].axes[0].measured = 'reused' }, /reusedFrom is missing/],
  ['coverage mistyped', (v) => { v.pages[0].axes[0].coverage = { examined: 'x', classified: 0, unclassified: [] } }, /coverage\.examined must be an integer/],
  ['summary.findings 0 over an axis finding', (v) => { v.pages[0].axes[0].findings = [{ kind: 'x' }] }, /summary\.findings is 0 but the axes hold 1/],
  ['summary.axes disagreeing with the axes', (v) => { v.summary.axes = 5 }, /summary\.axes is 5 but the run holds 1/],
  ['a stage count disagreeing with its axes', (v) => { v.stages[0].findings = 3 }, /findings is 3 but its axes hold 0/],
  ['an axis of a stage the run does not have', (v) => { v.pages[0].axes[0].stage = 'ghost' }, /names stage "ghost" the run does not have/],
  ['an axis of a stage its case does not run', (v) => { v.stages.push({ id: 's2', status: 'pass', variants: ['v1'], pages: 0, axes: 0, findings: 0, reused: 0 }); v.pages[0].axes[0].stage = 's2' }, /measured in stage "s2", which its plan case does not run/],
  ['an axis of a variant its case does not measure', (v) => { v.pages[0].axes[0].variant = 'v9' }, /not a variant its plan case measures/],
  ['axes on a page the plan has no case for', (v) => { v.pages.push({ id: 'p9', hash: 'sha256:p9', axes: [axisOf('v1')], findings: [] }); v.summary.axes = 2 }, /p9 has axes but the plan has no case/],
  ['a clean axis with coverage null', (v) => { v.pages[0].axes[0].coverage = null }, /axes\[0\]\.coverage must be an object/],
  ['a clean axis with no menus record', (v) => { delete v.pages[0].axes[0].menus }, /axes\[0\]\.menus is missing/],
  ['a lost axis that also carries coverage', (v) => { v.pages[0].axes[0].findings = [{ kind: 'axis-error' }]; v.pages[0].findings = [{ kind: 'axis-error', axis: 'v1' }]; v.summary.findings = 1; v.stages[0].findings = 1 }, /coverage must be absent from an axis lost to an axis-error/],
  ['a lost axis with a second finding', (v) => { const a = v.pages[0].axes[0]; delete a.coverage; delete a.menus; a.findings = [{ kind: 'axis-error' }, { kind: 'x' }]; v.pages[0].findings = a.findings.map((f) => ({ ...f, axis: 'v1' })); v.summary.findings = 2; v.stages[0].findings = 2 }, /findings of a lost axis is the one axis-error/],
  ['a stage with no axis count', (v) => { delete v.stages[0].axes }, /stages\[0\]\.axes is missing/],
  ['a stage with no variants', (v) => { delete v.stages[0].variants }, /stages\[0\]\.variants is missing/],
  ['a summary with no axis count', (v) => { delete v.summary.axes }, /summary\.axes is missing/],
  ['a stage axis count disagreeing with the axes', (v) => { v.stages[0].axes = 4 }, /stages s1\.axes is 4 but its axes hold 1/],
  ['a page whose findings are not its axes\' findings', (v) => { v.pages[0].findings = [{ kind: 'x', axis: 'v1' }] }, /pages p1\.findings \(1\) are not the findings of its axes \(0\)/],
  ['a page with no findings copy', (v) => { delete v.pages[0].findings }, /pages\[0\]\.findings is missing/],
  ['a case variant with no axis', (v) => { v.pages[0].axes = []; v.summary.axes = 0; v.stages[0].axes = 0; v.stages[0].pages = 0 }, /pages p1\/v1 has no axis, which the plan owes in stage s1/],
  ['a case page with no entry at all', (v) => { v.pages = []; v.summary.axes = 0; v.summary.pages = 0; v.stages[0].axes = 0; v.stages[0].pages = 0 }, /pages p1\/v1 has no axis/],
  ['a case that lists a stage none of its variants runs in', (v) => { v.stages.push({ id: 's2', status: 'pass', variants: ['v2'], pages: 0, axes: 0, findings: 0, reused: 0 }); v.scope.plan.cases[0].stages = ['s1', 's2'] }, /lists stage "s2", which none of its variants runs in/],
  ['a case with a variant no stage measures', (v) => { v.scope.plan.cases[0].variants = ['v1', 'v9']; v.scope.plan.axes = { fast: 2, full: 2 } }, /names variant "v9", which no stage of the run measures/],
  ['a plan case with no stage', (v) => { v.scope.plan.cases[0].stages = [] }, /cases\[0\]\.stages must hold at least 1/]
]
for (const [name, mutate, re] of MUTATIONS)
  test(`visual.json open-measurement and orphan refusals: ${name}`, () => {
    const v = visualOf()
    mutate(v)
    assert.match(problems(JSON.parse(JSON.stringify(v)), VISUAL, 'visual.json').join(' | '), re)
    // and the verdict refuses the same run
    const r = verdict({ 'visual.json': v })
    assert.equal(r.status, 'fail')
  })

test('a run read to be reused may predate the menu record, and nothing else: the verdict never takes it', () => {
  const legacy = visualOf()
  delete legacy.pages[0].axes[0].menus
  assert.match(problems(legacy, VISUAL, 'visual.json').join(' | '), /menus is missing/)
  assert.deepEqual(problems(legacy, VISUAL_PRIOR, 'visual.json'), [])
  legacy.pages[0].axes[0].coverage = null
  assert.match(problems(legacy, VISUAL_PRIOR, 'visual.json').join(' | '), /coverage must be an object/)
  const typed = visualOf()
  typed.pages[0].axes[0].menus = { measured: true }
  assert.match(problems(typed, VISUAL_PRIOR, 'visual.json').join(' | '), /menus\.pairs is missing/)
})

test('a lost axis (axis-error) has no coverage to read and is still a valid axis; it is a finding', () => {
  const v = visualOf({ findings: 1 })
  const a = v.pages[0].axes[0]
  delete a.coverage
  delete a.menus
  a.findings = [{ kind: 'axis-error', error: 'x' }]
  v.pages[0].findings = [{ kind: 'axis-error', error: 'x', axis: 'v1' }]
  assert.deepEqual(problems(v, VISUAL, 'visual.json'), [])
  assert.match(verdict({ 'visual.json': v }).reasons.join(' | '), /1 machine finding/)
})

test('orphan rows: a machine row, a missing or menu row of a stage the run does not have is refused', () => {
  assert.match(reasons({ 'notes/machine.json': [machineRow({ stage: 'ghost' })] }), /notes\/machine\.json: M1 names stage "ghost"/)
  const missing = { layout: 'home', page: 'p1', variant: 'v1', stage: 'ghost', side: 'source', reason: 'r' }
  assert.match(reasons({ 'index.json': { ...indexOf(), missing: [missing] } }), /missing row p1\/v1 \(source\) names stage "ghost"/)
  const { tiles, tilesCoverPicture, ...base } = shotOf({ stage: 'ghost' })
  const menu = { ...base, state: 'menu-open', trigger: 't', via: 'hover', clipped: false }
  assert.match(reasons({ 'index.json': { ...indexOf(), menuShots: [menu] } }), /menuShots row p1\/v1 \(site\) names stage "ghost"/)
})

test('the pass receipt stands on a probe that ran clean and an inventory that agrees with itself', () => {
  const pass = () => clone(gate(writeRunDir(testDir('evidence-run')), { contractHash: 'sha256:c', expectedRoutes: ['/'] }))
  assert.equal(pass().status, 'pass')
  for (const [name, mutate, re] of [
    ['intrinsic null', (r) => { r.intrinsic = null }, /intrinsic must be the probe's result/],
    ['intrinsic not run', (r) => { r.intrinsic = { status: 'skipped', siteOnly: null, shared: null, sourceFixed: null } }, /intrinsic\.status must be "run"/],
    ['site-only defects', (r) => { r.intrinsic.siteOnly = 2 }, /intrinsic\.siteOnly must be 0/],
    ['no shared count', (r) => { r.intrinsic.shared = null }, /intrinsic\.shared must be a count/],
    ['a case with no page hash', (r) => { r.cases.push({ page: 'p2', layout: null, stages: ['s1'], variants: ['v1'] }) }, /cases p2 has no entry in pageHashes/],
    ['a page hash no case measures', (r) => { r.pageHashes.p9 = 'sha256:p9' }, /pageHashes p9 is a page no case measures/],
    ['a case twice', (r) => { r.cases.push(clone(r.cases[0])) }, /cases lists "p1" twice/],
    ['a variant twice', (r) => { r.cases[0].variants.push('v1') }, /variants lists "v1" twice/],
    ['a stage twice', (r) => { r.stages.push('s1') }, /stages lists "s1" twice/],
    ['a stage no case runs in', (r) => { r.stages.push('s2') }, /stages s2 is a stage no case runs in/],
    ['a case stage the receipt does not list', (r) => { r.cases[0].stages.push('s2') }, /cases p1 names stage "s2", which the receipt does not list/],
    ['a case with no stages', (r) => { r.cases[0].stages = [] }, /cases\[0\]\.stages must hold at least 1/]
  ]) {
    const r = pass()
    mutate(r)
    assert.match(problems(r, RECEIPT, 'FAST-GATE.json').join(' | '), re, name)
  }
})

// an index row is bound to the plan: its page, variant, stage and layout are the case's
test('index.json rows of a page, variant, stage or layout the plan does not owe are refused', () => {
  const orphan = (name, row, re) => assert.match(reasons({ 'index.json': indexOf([shotOf(), shotOf(row)]) }), re, name)
  orphan('a page with no case', { page: 'p9' }, /index\.json: shots row p9\/v1 \(site\) is of a page the plan has no case for/)
  orphan('a variant its case does not measure', { variant: 'v9' }, /shots row p1\/v9 \(site\) is of a variant its plan case does not measure/)
  orphan('a layout other than the case\'s', { layout: 'blog' }, /shots row p1\/v1 \(site\) names layout "blog", its plan case is "home"/)
  const gone = { layout: 'home', page: 'p9', variant: 'v1', stage: STAGE, side: 'source', reason: 'r' }
  assert.match(reasons({ 'index.json': { ...indexOf(), missing: [gone] } }), /missing row p9\/v1 \(source\) is of a page the plan has no case for/)
  const { tiles, tilesCoverPicture, ...base } = shotOf({ variant: 'v9' })
  assert.match(reasons({ 'index.json': { ...indexOf(), menuShots: [{ ...base, state: 'menu-open', trigger: 't', via: 'hover', clipped: false }] } }), /menuShots row p1\/v9 \(site\) is of a variant its plan case does not measure/)
})

test('sections.json with a non-page custom module (sectionType null) does not break the plan', async () => {
  const { resolveFastGate } = await import('../visual/fast-gate.mjs')
  const spec = testDir('evidence-spec')
  writeFileSync(path.join(spec, 'sections.json'), JSON.stringify(sectionsOf({ acm: [], custom: [customRow({ id: 'about-en-2' }), customRow({ id: 'footnav-1', sectionType: null })], other: [] })))
  const plan = resolveFastGate({ pages: [], layouts: [], visual: { stages: [] }, variants: [] }, { specDir: spec })
  assert.ok(!plan.errors.some((e) => /sections\.json/.test(e)), plan.errors.join('; '))
})

// ── the evidence SET: each file valid alone, but one that omits or contradicts what the others owe ──
const CASES2 = [{ page: 'p1', variants: ['v1'] }, { page: 'p2', variants: ['v1'] }]
test('stale runs: a recorded identity.stale, a recorded summary.stale and a current binding staleness each refuse the pass; the diagnostic stays readable', () => {
  const marked = (f) => { const v = visualOf(); f(v); return v }
  const identity = marked((v) => (v.identity.stale = ['specHash: contract a ≠ now b']))
  const summary = marked((v) => (v.summary.stale = ['specHash: contract a ≠ now b']))
  assert.deepEqual(problems(JSON.parse(JSON.stringify(identity)), VISUAL, 'visual.json'), [], 'a stale diagnostic report is valid evidence')
  assert.match(reasons({ 'visual.json': identity }), /stale: the run recorded identity\.stale/)
  assert.match(reasons({ 'visual.json': summary }), /stale: the run recorded summary\.stale/)
  assert.match(reasons({}, { currentStale: ['specHash: contract a ≠ now b'] }), /stale: the contract is stale against its inputs now/)
  assert.equal(verdict({}, { currentStale: [] }).status, 'pass')
})

test('one stage assignment per variant: two stage rows naming a variant are refused, so an axis in the first cannot satisfy the second', () => {
  const v = visualOf({ stages: ['s1', 's2'] })
  v.stages[1].variants = ['v1']
  v.scope.plan.cases[0].stages = ['s1', 's2']
  v.scope.plan.coverage.stages = { total: 2, covered: 2, uncovered: [] }
  assert.match(problems(JSON.parse(JSON.stringify(v)), VISUAL, 'visual.json').join(' | '), /variant "v1" is assigned to 2 stages \(s1, s2\)/)
  const r = verdict({ 'visual.json': v })
  assert.equal(r.status, 'fail')
  assert.match(r.reasons.join(' | '), /assigned to 2 stages/)
})

test('a stage that passed with no axis measured is no pass', () => {
  const v = visualOf({ stages: ['s1', 's2'] })
  assert.match(reasons({ 'visual.json': v }), /stage s2: passed with no axis measured/)
})

// index.json is the projection of the axes: a deleted, added or changed row is a refusal in its own right
const INDEX_MUTATIONS = [
  ['a deleted shot', (i) => i.shots.splice(0, 1), /shots row p1\/v1 \(site\) is not as the run's axes produce it/],
  ['a shot of another page added', (i) => i.shots.push({ ...i.shots[0], page: 'p2' }), /shots row p2\/v1 \(site\) is not produced by the run's axes|p2/],
  ['consumers weakened to the reviewer', (i) => (i.shots[0].consumers = ['reviewer']), /shots row p1\/v1 \(site\) is not as the run's axes produce it/],
  ['a changed hash', (i) => (i.shots[0].hash = 'sha256:other'), /is not as the run's axes produce it/],
  ['a changed tile list', (i) => (i.shots[0].tiles = []), /is not as the run's axes produce it/],
  ['a changed picture path', (i) => (i.shots[0].file = '/elsewhere.png'), /is not as the run's axes produce it/],
  ['a duplicated shot', (i) => i.shots.push({ ...i.shots[0] }), /not produced by the run's axes/],
  ['a menu shot nothing produced', (i) => { const { tiles, tilesCoverPicture, ...row } = i.shots[0]; i.menuShots.push({ ...row, state: 'menu-open', trigger: 't', via: 'hover', clipped: false }) }, /menuShots row p1\/v1 \(site, t\) is not produced/],
  ['a source-missing row nothing produced', (i) => i.missing.push({ layout: 'home', page: 'p1', variant: 'v1', stage: STAGE, side: 'source', reason: 'x', measured: 'now' }), /missing row p1\/v1 \(source\) is not produced/]
]
for (const [name, mutate, re] of INDEX_MUTATIONS)
  test(`index.json is reconciled with the axes: ${name}`, () => {
    const dir = testDir('evidence-index')
    writeRunDir(dir)
    const visual = visualOf()
    const index = JSON.parse(JSON.stringify(indexFor(visual, dir)))
    mutate(index)
    const r = gate(writeRunDir(dir, { 'index.json': index }), { contractHash: 'sha256:c', expectedRoutes: ['/'] })
    assert.equal(r.status, 'fail')
    assert.match(r.reasons.join(' | '), re)
  })

test('lens obligations come from the axes: a shot the index lost or re-labelled for the reviewer still owes its lenses', () => {
  const dir = testDir('evidence-lens')
  const visual = visualOf()
  const index = indexFor(visual, dir)
  index.shots[0].consumers = ['reviewer']
  const notes = notesOf(STAGE, { lenses: ['layout'] })
  const r = gate(writeRunDir(dir, { 'index.json': index, [`NOTES-${STAGE}.json`]: notes }), { contractHash: 'sha256:c', expectedRoutes: ['/'] })
  assert.match(r.reasons.join(' | '), /stage s1: lens color never reported/)
  const gone = indexFor(visual, dir)
  gone.shots = []
  assert.match(gate(writeRunDir(dir, { 'index.json': gone, [`NOTES-${STAGE}.json`]: notes }), { contractHash: 'sha256:c', expectedRoutes: ['/'] }).reasons.join(' | '), /stage s1: lens color never reported/)
})

test('a menu picture and a source picture the run owed are in the index exactly: valid controls pass, mutations do not', () => {
  const visual = visualOf()
  const a = visual.pages[0].axes[0]
  a.sourceScreenshot = 'shots/p1--v1--source.png'
  a.sourceConsumers = ['layout']
  a.sourceTiles = ['shots/p1--v1--source/0.png']
  a.sourceTilesCoverPicture = true
  a.menus = menusOf({ menus: [{ trigger: 'Menu', key: 'menu', by: 'words', site: openSide(), source: { opened: false, reason: 'no panel', closed: null }, findings: 0 }] })
  const dir = testDir('evidence-menus')
  const index = indexFor(visual, dir)
  assert.equal(index.menuShots.length, 1)
  assert.equal(index.menuMissing.length, 1)
  const ok = gate(writeRunDir(dir, { 'visual.json': visual }), { contractHash: 'sha256:c', expectedRoutes: ['/'] })
  assert.deepEqual(ok.reasons, [])
  index.menuMissing = []
  assert.match(gate(writeRunDir(dir, { 'visual.json': visual, 'index.json': index }), { contractHash: 'sha256:c', expectedRoutes: ['/'] }).reasons.join(' | '), /menuMissing row p1\/v1 \(source, Menu\) is not as the run's axes produce it/)
})

test('a reused axis lists its pictures under the run it came from', () => {
  const visual = visualOf()
  Object.assign(visual.pages[0].axes[0], { measured: 'reused', reusedFrom: '/runs/earlier' })
  visual.summary.reused = 1
  visual.stages[0].reused = 1
  const dir = testDir('evidence-reused')
  const ok = gate(writeRunDir(dir, { 'visual.json': visual }), { contractHash: 'sha256:c', expectedRoutes: ['/'] })
  assert.deepEqual(ok.reasons, [])
  const index = indexFor(visual, dir)
  assert.equal(index.shots[0].file, '/runs/earlier/shots/p1--v1.png')
  index.shots[0].file = path.join(dir, 'shots/p1--v1.png')
  assert.match(gate(writeRunDir(dir, { 'visual.json': visual, 'index.json': index }), { contractHash: 'sha256:c', expectedRoutes: ['/'] }).reasons.join(' | '), /shots row p1\/v1 \(site\) is not as the run's axes produce it/)
})

// ── prototype names are names, never inherited fields ──
const PROTO = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
test('prototype-name keys: an unknown field of every closed level is refused, whatever it is called', () => {
  const at = (doc, steps) => steps.reduce((x, k) => x[k], doc)
  const levels = [
    ['plan', VISUAL, () => visualOf(), ['scope', 'plan']],
    ['plan case', VISUAL, () => visualOf(), ['scope', 'plan', 'cases', 0]],
    ['plan coverage', VISUAL, () => visualOf(), ['scope', 'plan', 'coverage']],
    ['stage row', VISUAL, () => visualOf(), ['stages', 0]],
    ['summary', VISUAL, () => visualOf(), ['summary']],
    ['identity', VISUAL, () => visualOf(), ['identity']],
    ['page', VISUAL, () => visualOf(), ['pages', 0]],
    ['visual root', VISUAL, () => visualOf(), []],
    ['shot', INDEX, () => indexOf(), ['shots', 0]],
    ['index root', INDEX, () => indexOf(), []],
    ['machine row', MACHINE, () => [machineRow()], [0]],
    ['todo', NOTES, () => notesOf(STAGE, { todos: [todoOf()] }), ['todos', 0]],
    ['notes counts', NOTES, () => notesOf(), ['counts']],
    ['receipt', RECEIPT, () => ({ status: 'fail', scope: 'fast-gate', reasons: ['x'], stale: [], cases: [], stages: [] }), []],
    ['sections root', SECTIONS, () => ({ slotBlock: 'tracy-base/slot', custom: [], acm: [], other: [] }), []]
  ]
  for (const [name, schema, build, steps] of levels)
    for (const key of PROTO) {
      const doc = JSON.parse(JSON.stringify(build()))
      // JSON.parse makes `__proto__` an own property, as a file on disk would
      Object.defineProperty(at(doc, steps), key, { value: 1, enumerable: true, configurable: true, writable: true })
      assert.match(problems(doc, schema, 'x.json').join(' | '), /is not a known field/, `${name}: ${key}`)
    }
})

test('prototype-name keys: a required field absent but inherited is missing, and a case named toString has no inherited page hash', () => {
  const v = visualOf()
  const doc = JSON.parse(JSON.stringify(v))
  delete doc.summary
  assert.match(problems(doc, VISUAL, 'v').join(' | '), /summary is missing/)
  const receipt = (name, hashes) => ({
    status: 'pass', scope: 'fast-gate', reasons: [], stale: [], schemaVersion: 1, run: '/r', at: 'x', contractHash: 'sha256:c',
    cases: [{ page: name, layout: null, stages: [STAGE], variants: ['v1'] }], stages: [STAGE], pageHashes: hashes,
    intrinsic: { status: 'run', siteOnly: 0, shared: 0, sourceFixed: 0 }
  })
  for (const name of PROTO) {
    const none = receipt(name, { other: 'sha256:o' })
    assert.match(problems(JSON.parse(JSON.stringify(none)), RECEIPT, 'FAST-GATE.json').join(' | '), /has no entry in pageHashes/, name)
    const own = JSON.parse(JSON.stringify(receipt(name, {})))
    Object.defineProperty(own.pageHashes, name, { value: 'sha256:x', enumerable: true, configurable: true, writable: true })
    assert.deepEqual(problems(own, RECEIPT, 'FAST-GATE.json'), [], `${name} with its own hash is a valid pass receipt`)
  }
})

// ── round 4: the pictures an axis owes, the menu record's closed forms, the machine rows and the snapshot ──
const axisProblems = (mutate) => {
  const v = visualOf()
  mutate(v.pages[0].axes[0], v)
  return problems(clone(v), VISUAL, 'visual.json').join(' | ')
}
const PICTURE_MUTATIONS = [
  ['a measured axis with no shotConsumers', (a) => { delete a.shotConsumers }, /shotConsumers is missing/],
  ['shotConsumers null over a picture', (a) => { a.shotConsumers = null }, /shotConsumers is missing/],
  ['shotConsumers mistyped', (a) => { a.shotConsumers = 'layout' }, /shotConsumers must be an array/],
  ['shotConsumers empty', (a) => { a.shotConsumers = [] }, /shotConsumers must hold at least 1/],
  ['a measured axis with no screenshot field', (a) => { delete a.screenshot }, /screenshot is missing/],
  ['a measured axis with no layout field', (a) => { delete a.layout }, /layout is missing/],
  ['a picture with no tiles', (a) => { delete a.tiles }, /tiles is missing/],
  ['a picture with no tilesCoverPicture', (a) => { delete a.tilesCoverPicture }, /tilesCoverPicture is missing/],
  ['consumers over no picture', (a) => { a.screenshot = null; delete a.tiles; delete a.tilesCoverPicture }, /shotConsumers must be null when the axis has no picture/],
  ['a source picture with no consumers', (a) => { a.sourceScreenshot = 's.png'; a.sourceTiles = []; a.sourceTilesCoverPicture = true }, /sourceConsumers is missing/],
  ['a source picture with no tiles', (a) => { a.sourceScreenshot = 's.png'; a.sourceConsumers = ['layout'] }, /sourceTiles is missing/],
  ['a source picture that is also missing', (a) => { Object.assign(a, { sourceScreenshot: 's.png', sourceConsumers: ['layout'], sourceTiles: [], sourceTilesCoverPicture: true, sourceShotMissing: 'x' }) }, /sourceShotMissing must be absent/],
  ['source tiles with no source picture', (a) => { a.sourceTiles = [] }, /sourceTiles must be absent/]
]
for (const [name, mutate, re] of PICTURE_MUTATIONS)
  test(`axis pictures: ${name} is a named refusal and never the reviewer`, () => {
    assert.match(axisProblems(mutate), re)
  })

test('axis pictures: a lost axis lists no picture it did not take, and a sampled one lists the picture it did', () => {
  assert.equal(axisProblems((a) => { a.screenshot = null; a.shotConsumers = null; delete a.tiles; delete a.tilesCoverPicture }), '')
  const lost = (a, v) => { for (const k of ['coverage', 'menus', 'screenshot', 'shotConsumers', 'tiles', 'tilesCoverPicture', 'layout']) delete a[k]; a.findings = [{ kind: 'axis-error' }]; v.pages[0].findings = [{ kind: 'axis-error', axis: 'v1' }]; v.summary.findings = 1; v.stages[0].findings = 1 }
  assert.equal(axisProblems(lost), '')
  assert.match(axisProblems((a, v) => { lost(a, v); a.screenshot = 'x.png' }), /shotConsumers is missing/)
})

test('index.json: menuShots and menuMissing are written by every run, so a file without them is refused', () => {
  for (const f of ['menuShots', 'menuMissing']) {
    const i = indexOf()
    delete i[f]
    assert.match(problems(i, INDEX, 'index.json').join(' | '), new RegExp(`${f} is missing`))
  }
})

test('menus: the three forms the producer writes validate; a menus object that is none of them is refused, never read', () => {
  const skipped = { measured: false, reason: 'the page declares no source to open its menus on (none)' }
  const failed = menusOf({ measured: false, reason: 'the source did not load', source: null, pairs: 0, ms: 1 })
  const read = menusOf({ menus: [{ trigger: 'Menu', key: 'menu', by: 'words', site: openSide({ clipped: { px: 12.5, items: 3 } }), source: openSide(), findings: 1 }] })
  for (const m of [skipped, failed, read]) assert.equal(axisProblems((a) => { a.menus = m }), '')
  const bad = [
    ['measured:false with a menus string', { ...skipped, menus: 'x' }, /menus is not a known field/],
    ['measured:false with a menus list but no site', { ...skipped, menus: [] }, /not a known field/],
    ['a failed record whose menus is an object', { ...failed, menus: {} }, /menus must be an array/],
    ['a read record with no site census', { ...read, site: null }, /site must be an object/],
    ['a clipped panel that is a string', menusOf({ menus: [{ ...read.menus[0], site: openSide({ clipped: 'yes' }) }] }), /clipped/],
    ['a clipped object without px', menusOf({ menus: [{ ...read.menus[0], site: openSide({ clipped: { items: 1 } }) }] }), /clipped/],
    ['an unknown field of the record', { ...read, extra: 1 }, /extra is not a known field/],
    ['a census with a prototype-name field', { ...read, site: { ...CENSUS, toString: 1 } }, /toString is not a known field/],
    ['a menu row with no trigger', menusOf({ menus: [{ ...read.menus[0], trigger: undefined }] }), /trigger is missing/],
    ['a side that opened with no screenshot field', menusOf({ menus: [{ ...read.menus[0], site: { ...openSide(), screenshot: undefined } }] }), /screenshot is missing/]
  ]
  for (const [name, m, re] of bad) assert.match(axisProblems((a) => { a.menus = m }), re, name)
  assert.match(axisProblems((a) => { a.menus = { ...failed, pairs: 1 } }), /pairs must be 0 when measured is false/)
})

test('cluster and lens selection evidence rejects unknown producer fields', () => {
  const cluster = { schemaVersion: 1, history: false, totals: Object.fromEntries(['findings', 'accepted', 'units', 'clusters', 'acceptedClusters', 'inMoreThanOneCluster', 'inferred', 'unchanged', 'compared'].map((k) => [k, 0])), clusters: [] }
  assert.deepEqual(problems(cluster, CLUSTERS, 'clusters.json'), [])
  const produced = clusterFindings([{ id: 'p', axes: [{ variant: 'v', findings: [{ kind: 'contrast', element: 'h1 "Title"', deltas: [{ property: 'color', expected: '#000', observed: '#fff' }] }], accepted: [] }] }])
  assert.deepEqual(problems(produced, CLUSTERS, 'clusters.json'), [])
  assert.match(problems({ ...cluster, totals: { ...cluster.totals, surprise: 1 } }, CLUSTERS, 'clusters.json').join(' '), /surprise is not a known field/)
  const manifest = { id: 'id', schema: 1, kind: 'lens-work', run: 'run', stage: 's1', lens: 'layout', requested: 1, chunks: 1, contract: { path: 'c', hash: 'h' }, index: { path: 'i', hash: 'h' }, visual: { path: 'v', hash: 'h' }, selection: { layouts: 0, representatives: [], extras: [{ page: 'p', layout: 'home', representative: 'r', uncovered: 'x' }], notMeasured: [] }, tiles: 0, load: { min: 1, max: 1, maxGroup: 1 }, groups: [], assignments: [] }
  assert.match(problems(manifest, MANIFEST, 'manifest.json').join(' '), /selection\.extras\[0\]\.uncovered must be an integer/)
})

test('index.json: a clipped menu picture (the {px, items} form) is a valid row, and the run that has it passes', () => {
  const visual = visualOf()
  visual.pages[0].axes[0].menus = menusOf({ menus: [{ trigger: 'Menu', key: 'menu', by: 'words', site: openSide({ clipped: { px: 4, items: 2 } }), source: openSide(), findings: 1 }] })
  const dir = testDir('evidence-clipped')
  const index = indexFor(visual, dir)
  assert.deepEqual(problems(clone(index), INDEX, 'index.json'), [])
  assert.deepEqual(index.menuShots.map((r) => r.clipped), [{ px: 4, items: 2 }, false])
})

test('machine.json is the findings the run holds: a deleted, added or edited row is a refusal, intrinsic rows included', () => {
  const dir = testDir('evidence-machine')
  const visual = visualOf({ findings: 1 })
  const rows = machineNotes(visual.pages, () => STAGE)
  assert.equal(rows.length, 1)
  const run = (machine, opts = {}) => gate(writeRunDir(testDir('evidence-machine-run'), { 'visual.json': visual, 'notes/machine.json': machine }), { contractHash: 'sha256:c', expectedRoutes: ['/'], ...opts }).reasons.join(' | ')
  assert.doesNotMatch(run(rows), /notes\/machine\.json: a machine row/)
  assert.match(run([]), /notes\/machine\.json: a machine row for machine:\S+ on p1\/v1 is missing/)
  assert.match(run([...rows, { ...rows[0], id: 'M2', page: 'p1', axis: 'v1', lens: 'machine:other' }]), /is not produced by the run's findings/)
  assert.match(run([{ ...rows[0], what: '{"edited":1}' }]), /is missing/)
  void dir
})

test('the verdict decides on the visual.json it was handed: a rewrite of the file between the reads cannot change it', () => {
  const dir = testDir('evidence-snapshot')
  const good = visualOf()
  writeRunDir(dir, { 'visual.json': good })
  const snapshot = readEvidence(path.join(dir, 'visual.json'), VISUAL)
  // the file is rewritten (a failing stage) after the snapshot; the verdict still reads the snapshot
  const changed = clone(good)
  changed.stages[0].status = 'fail'
  writeFileSync(path.join(dir, 'visual.json'), JSON.stringify(changed))
  const r = gate(dir, { contractHash: 'sha256:c', expectedRoutes: ['/'], visual: snapshot })
  assert.deepEqual(r.reasons, [])
  assert.match(gate(dir, { contractHash: 'sha256:c', expectedRoutes: ['/'] }).reasons.join(' | '), /stage s1: fail/)
})

test('lens-work: the manifest and the index are read through their schemas before any nested field is used', async () => {
  const { MANIFEST } = await import('../visual/evidence.mjs')
  assert.match(problems({}, MANIFEST, 'manifest.json').join(' | '), /kind is missing/)
  assert.match(problems({ kind: 'lens-work', groups: null }, MANIFEST, 'manifest.json').join(' | '), /groups must be an array|groups is missing|groups/)
})
