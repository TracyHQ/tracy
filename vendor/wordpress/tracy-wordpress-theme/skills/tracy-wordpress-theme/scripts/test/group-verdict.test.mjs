// group-verdict composes judgments the skill already makes: the run's own status (stages, intrinsic.blocking,
// measured:false), the canonical identity (contract hash + bindings, plus review.config.json and
// parity-accepted.json), the effective reference.kind per page, and SKILL.md §Done rule for exceptions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { groupVerdict, effectiveKinds } from '../visual/group-verdict.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { bindingsFrom, contractHash, fileHash } from '../lib/canonical.mjs'
import { cleanAudit } from './lib/finish-audit.mjs'
import { SOURCE_DEPENDENT_CHECKS, imageReferenceReason } from '../visual/applicability.mjs'

const V = ['1440-light', '390-light', '1440-dark', '390-dark']
const pm = (element) => ({ kind: 'parity-mismatch', element, deltas: [{ property: 'color', expected: 'rgb(1, 1, 1)', observed: 'rgb(2, 2, 2)' }] })
const axes = (findings = {}, accepted = {}) => V.map((variant) => ({ variant, findings: findings[variant] ?? [], accepted: accepted[variant] ?? [] }))
const pg = (id, p, f, a) => ({ id, path: p, axes: axes(f, a) })
const bindings = { specHash: 'sha256:spec', pageMapHash: 'sha256:pm', seedReportHash: 'sha256:s', artifactHash: 'sha256:a', configHash: 'sha256:cfg' }
const SITE = 'http://127.0.0.1:8081'
const SRC = 'http://source.example'
const contract = { id: 'site--g1', source: { site: SRC }, group: { id: 'g1', pages: ['/a', '/b'], dossier: '/dossier/g1' }, target: { site: SITE }, bindings }
const CPATH = '/dossier/g1/visual.contract.json'
const identity = { stale: [], canonical: true, contractPath: CPATH, group: 'g1', contractHash: contractHash(contract), sourceHash: 'sha256:spec', artifactHash: 'sha256:a', seedReportHash: 'sha256:s' }
const stages = ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive'].map((id) => ({ id, status: 'pass' }))
const intrinsic = { status: 'run', blocking: false }
const visual = (pages, over = {}) => ({ at: '2030-01-01T00:00:00Z', site: SITE, scope: { kind: 'targeted-debug' }, identity, stages, summary: { intrinsic }, pages, ...over })
const route = (targetPath, over = {}) => ({ route: targetPath, targetPath, sourceOrigin: SRC, ok: true, accepted: [], ...over })
const parity = (routes, over = {}) => ({ target: SITE, generatedAt: '2030-01-01T00:00:00Z', inputs: { acceptHash: 'sha256:acc' }, routes, ...over })
const current = { bindings, site: SITE, contractPath: CPATH, acceptHash: 'sha256:acc', newest: Date.parse('2029-12-31T00:00:00Z') }
const kinds = new Map([['/a', 'url'], ['/b', 'url'], ['/i', 'image'], ['/n', 'none']])
// a clean current finish audit of a dossier, over an interaction record of `pages`, made after the fixture's evidence (2030) — and `now` to match
const aud = (pages = ['/a', '/b'], routes = pages) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'group-audit-'))
  cleanAudit({ dossier: dir, site: SITE, source: SRC, routes, runs: [dir], pages, at: '2031-01-01T00:00:00Z' })
  return { dossier: dir, interaction: path.join(dir, 'interaction.json'), now: Date.parse('2031-06-01T00:00:00Z') }
}
// the group's contract owns exactly the pages the verdict is asked about (a test that asks about other pages gets its own)
const run = (o) => {
  const pages = o.pages ?? ['/a', '/b']
  const c = o.contract === undefined ? { ...contract, group: { id: 'g1', pages, dossier: '/dossier/g1' } } : o.contract
  const v = o.contract === undefined && o.visual?.identity?.contractHash === identity.contractHash ? { ...o.visual, identity: { ...o.visual.identity, contractHash: contractHash(c) } } : o.visual
  const plan = pages.filter((p) => ['url', 'html'].includes(kinds.get(p))).map((p) => ({ id: p.slice(1), path: p, pagemapPath: p, kind: kinds.get(p), sourceRoute: p }))
  return groupVerdict({ group: 'g1', pages, kinds, current, plan, audit: aud(pages), ...o, contract: c, visual: v })
}
const clean = () => ({ visual: visual([pg('a', '/a'), pg('b', '/b')]), parity: parity([route('/a'), route('/b')]) })
// DECISIONS.md as parsed: each [id, text] is one decision
const decisionsOf = (...rows) => parseDecisions(rows.map(([id, text]) => `- ${id}: ${text}`).join('\n'))
const why = (r) => r.incomplete.join(' | ')

test('clean whole evidence is done', () => {
  const r = run(clean())
  assert.equal(r.verdict, 'done', JSON.stringify(r))
})

test('effective kind: page entry over the pack default (spec-pack.md §3)', () => {
  const k = effectiveKinds({ pages: [{ file: 'a.html', path: '/a' }, { file: 'b.html', path: '/b' }, { file: 'c.html', path: '/c' }] }, { kind: 'url', pages: [{ page: 'b.html', kind: 'image' }, { page: 'a.html' }] })
  assert.deepEqual([...k], [['/a', 'url'], ['/b', 'image'], ['/c', 'url']])
})

test('parity scope: image/none pages need no parity; a mixed group sends only url/html pages', () => {
  const none = pg('n', '/n')
  for (const axis of none.axes) {
    axis.notApplicable = SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' }))
    axis.menus = { measured: true, targetOnly: true, site: { headers: 0, triggers: 0, openAtRest: 0, overCap: 0, labels: [], drawers: 0, kinds: [] }, source: null, pairs: 0, menus: [], unmatched: [], notMeasured: [], ms: 1, comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' } }
  }
  const imgOnly = { pages: ['/i', '/n'], visual: visual([pg('i', '/i'), none]) }
  const r = run(imgOnly)
  assert.equal(r.verdict, 'done', JSON.stringify(r))
  assert.deepEqual(r.parityScope, { http: [], none: ['/i', '/n'] })
  const mixed = { pages: ['/a', '/i'], visual: visual([pg('a', '/a'), pg('i', '/i')]), parity: parity([route('/a')]) }
  const m = run(mixed)
  assert.equal(m.verdict, 'done', JSON.stringify(m))
  assert.deepEqual(m.parityScope.http, ['/a'])
  assert.match(why(run({ ...mixed, parity: parity([route('/i')]) })), /no route reached \/a/)
  assert.match(why(run({ ...mixed, parity: null })), /--parity is required for \/a/)
  // a failing route on an image page is not a parity finding
  assert.equal(run({ ...mixed, parity: parity([route('/a'), route('/i', { ok: false })]) }).verdict, 'done')
  assert.match(why(run({ pages: ['/zz'], visual: visual([]) })), /not a page of the page-map/)
})

test('run status comes from the report: blocking intrinsic is open, measured:false and a missing probe are incomplete', () => {
  const c = clean()
  const blocked = run({ ...c, visual: visual(c.visual.pages, { summary: { intrinsic: { status: 'run', blocking: true } } }) })
  assert.equal(blocked.verdict, 'open')
  assert.equal(blocked.open[0].id, 'intrinsic-mobile')
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { summary: {} }) })), /no intrinsic mobile probe/)
  const unmeasured = pg('a', '/a'); unmeasured.axes[1].measured = false
  assert.match(why(run({ ...c, visual: visual([unmeasured, pg('b', '/b')]) })), /a 390-light was not measured/)
  const menus = pg('a', '/a'); menus.axes[0].menus = { measured: false, reason: 'no trigger' }
  assert.match(why(run({ ...c, visual: visual([menus, pg('b', '/b')]) })), /not measured \(no trigger\)/)
})

test('none-page menus need typed N/A plus target capture; a url page cannot forge N/A', () => {
  const pages = ['/a', '/b']
  const c = { ...contract, pages: [
    { id: 'a', path: '/a', pagemapPath: '/a', referenceKind: 'url' },
    { id: 'b', path: '/b', pagemapPath: '/b', referenceKind: 'none' }
  ] }
  const nonePage = (id, route) => {
    const x = pg(id, route)
    for (const a of x.axes) {
      a.notApplicable = SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' }))
      a.menus = { measured: true, targetOnly: true, site: { headers: 1, triggers: 1, openAtRest: 0, overCap: 0, labels: ['Menu'], drawers: 0, kinds: ['button'] }, source: null, pairs: 0, menus: [{ trigger: 'Menu', key: 'menu:menu', site: { opened: true, via: 'click', rect: {}, surface: null, items: [], moreItems: 0, screenshot: 'shots/menu.png', clipped: false, closed: 'escape' }, findings: 0 }], unmatched: [], notMeasured: [], ms: 10, comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' } }
    }
    return x
  }
  const ok = (vs) => run({ pages, contract: c, kinds: new Map([['/a', 'url'], ['/b', 'none']]), visual: visual(vs, { identity: { ...identity, contractHash: contractHash(c) } }), parity: parity([route('/a')]) })
  const valid = ok([pg('a', '/a'), nonePage('b', '/b')])
  assert.equal(valid.verdict, 'done')
  const unknownVisual = visual([nonePage('a', '/a'), nonePage('b', '/b')], { identity: { ...identity, contractHash: contractHash(c) } })
  assert.match(why(run({ pages, contract: c, kinds: new Map(), visual: unknownVisual, parity: parity([route('/a'), route('/b')]) })), /not-applicable evidence requires --spec to bind reference\.kind=none/)
  const forgedContract = { ...c, pages: c.pages.map((p) => p.id === 'a' ? { ...p, referenceKind: 'none' } : p) }
  const forged = run({ pages, contract: forgedContract, kinds: new Map([['/a', 'url'], ['/b', 'url']]), visual: visual([nonePage('a', '/a'), nonePage('b', '/b')], { identity: { ...identity, contractHash: contractHash(forgedContract) } }), parity: parity([route('/a'), route('/b')]) })
  assert.notEqual(forged.verdict, 'done', 'a contract cannot grant N/A when reference.json says url')
  assert.match(why(forged), /contract reference\.kind none differs from reference\.json \(url\)/)
  assert.ok(SOURCE_DEPENDENT_CHECKS.every((check) => valid.notApplicable[check] === V.length), JSON.stringify(valid.notApplicable))
  assert.match(why(ok([nonePage('a', '/a'), nonePage('b', '/b')])), /not-applicable evidence but reference\.kind is url/)
  const missing = nonePage('b', '/b'); missing.axes[0].menus = { measured: false, reason: 'no source' }
  assert.match(why(ok([pg('a', '/a'), missing])), /not measured/)
  const imageContract = { ...c, pages: c.pages.map((p) => ({ ...p, referenceKind: p.id === 'b' ? 'image' : 'url' })) }
  const image = pg('b', '/b')
  for (const a of image.axes) a.menus = { measured: false, reason: imageReferenceReason, comparison: { check: 'menu-comparison', status: 'source-unavailable', reason: imageReferenceReason } }
  const imageRun = run({ pages, contract: imageContract, kinds: new Map([['/a', 'url'], ['/b', 'image']]), visual: visual([pg('a', '/a'), image], { identity: { ...identity, contractHash: contractHash(imageContract) } }), parity: parity([route('/a')]) })
  assert.ok(!why(imageRun).includes('/b 1440-light was not measured'), why(imageRun))
})

test('a dark axis whose source has no dark of its own is closed only by the contract\'s source.darkDerived, and listed (ja-restaurant S-32)', () => {
  const noDark = { measured: false, reason: 'the source export has no dark of its own (contract.source.darkHook is null)' }
  const mk = (id, p, reason = noDark) => { const x = pg(id, p); for (const a of x.axes) if (a.variant.endsWith('-dark')) a.menus = reason; return x }
  const withC = (source, vs, now = { ...current, sourceDarkDerived: true }) => {
    const c = { ...contract, source: { ...contract.source, ...source } }
    return run({ contract: c, current: now, visual: visual(vs, { identity: { ...identity, contractHash: contractHash(c) } }), parity: parity([route('/a'), route('/b')]) })
  }
  // before: a contract with no declaration owes every such axis
  const owed = withC({ darkHook: null }, [mk('a', '/a'), mk('b', '/b')])
  assert.equal(owed.verdict, 'incomplete')
  assert.match(why(owed), /\/a 1440-dark was not measured \(the source export has no dark of its own/)
  // the declaration closes them, and says which
  const done = withC({ darkHook: null, darkDerived: true }, [mk('a', '/a'), mk('b', '/b')])
  assert.equal(done.verdict, 'done', why(done))
  assert.deepEqual(done.notOwed.map((n) => `${n.page} ${n.variant}`), ['/a 1440-dark', '/a 390-dark', '/b 1440-dark', '/b 390-dark'])
  // never another reason, never a light axis, never with a dark switch on the source, never an axis that was not measured
  assert.match(why(withC({ darkDerived: true }, [mk('a', '/a', { measured: false, reason: 'the source did not stay dark with attr:x=1' }), mk('b', '/b')])), /\/a 1440-dark was not measured \(the source did not stay dark/)
  const light = mk('a', '/a'); light.axes[0].menus = noDark
  assert.match(why(withC({ darkDerived: true }, [light, mk('b', '/b')])), /\/a 1440-light was not measured/)
  assert.match(why(withC({ darkHook: 'attr:data-theme=dark', darkDerived: true }, [mk('a', '/a'), mk('b', '/b')])), /\/a 1440-dark was not measured/)
  const cut = mk('a', '/a'); cut.axes[2].measured = false
  assert.match(why(withC({ darkDerived: true }, [cut, mk('b', '/b')])), /\/a 1440-dark was not measured/)
  // the declaration stands only checked fresh for the spec-pack being read (the CLI's darkDerivedProblems → current.sourceDarkDerived),
  // and on a contract none of whose bindings moved: otherwise it closes nothing (review: a stale contract still saying darkDerived)
  const unchecked = withC({ darkDerived: true }, [mk('a', '/a'), mk('b', '/b')], current)
  assert.deepEqual(unchecked.notOwed, [])
  assert.match(why(unchecked), /\/a 1440-dark was not measured \(the source export has no dark of its own/)
  const moved = withC({ darkDerived: true }, [mk('a', '/a'), mk('b', '/b')], { ...current, sourceDarkDerived: true, bindings: { ...bindings, pageMapHash: 'sha256:other' } })
  assert.deepEqual(moved.notOwed, [])
  assert.match(why(moved), /\/a 1440-dark was not measured/)
})

test('a severity label alone never accepts a failure; minor needs a named S-/D- exception', () => {
  const bad = { visual: visual([pg('a', '/a', { '1440-dark': [pm('h3.t "x"')] }), pg('b', '/b')]), parity: parity([route('/a'), route('/b')]) }
  const r = run(bad)
  assert.equal(r.verdict, 'open')
  assert.equal(r.open[0].severity, 'unclassified')
  const id = r.open[0].id
  const label = run({ ...bad, severity: { [id]: { severity: 'minor', reason: '1px' } } })
  assert.equal(label.verdict, 'open')
  assert.match(label.open[0].note, /without a named exception/)
  assert.equal(run({ ...bad, severity: { [id]: { severity: 'minor', reason: '1px', exception: 'S-12' } } }).verdict, 'done')
  assert.equal(run({ ...bad, severity: { [id]: { severity: 'minor', reason: '1px', exception: 'D-3' } } }).verdict, 'done')
  assert.equal(run({ ...bad, severity: { [id]: { severity: 'minor', reason: '1px', exception: 'whenever' } } }).verdict, 'open')
  // with the dossier's decisions given, the citation names ONE existing decision that is about this item
  const decisions = decisionsOf(['S-12', `the 1px at ${id} is a font-rendering difference, accepted`], ['D-3', `${id} stays as the source draws it`], ['D-4', 'a decision about the footer only'])
  const minor = (exception, d = decisions) => run({ ...bad, decisions: d, severity: { [id]: { severity: 'minor', reason: '1px', exception } } })
  assert.equal(minor('S-12').verdict, 'done')
  assert.equal(minor('D-3').verdict, 'done')
  assert.equal(minor('S-99').verdict, 'open', 'a well-formed id that names no decision accepts nothing')
  assert.match(minor('S-99').open[0].note, /does not exist/)
  assert.equal(minor('D-4').verdict, 'open', 'a decision that is about something else accepts nothing')
  assert.equal(minor('S-12', null).verdict, 'open', 'decisions that cannot be read accept nothing')
  assert.equal(minor('D-3', decisionsOf(['D-3', 'a'], ['D-3', `${id}`])).verdict, 'open', 'a duplicate id is ambiguous')
  assert.equal(run({ ...bad, severity: { [id]: { severity: 'major', reason: 'x' } } }).verdict, 'open')
  assert.throws(() => run({ ...bad, severity: { [id]: { severity: 'huge', reason: 'x' } } }), /severity/)
})

test('a failing parity route is open; only a minor with a named exception closes it', () => {
  const p = parity([route('/a', { ok: false }), route('/b')])
  assert.equal(run({ ...clean(), parity: p }).verdict, 'open')
  const label = run({ ...clean(), parity: p, severity: { 'parity:/a': { severity: 'minor', reason: 'r' } } })
  assert.equal(label.verdict, 'open', 'a severity label alone must not turn a failing route minor')
  assert.equal(run({ ...clean(), parity: p, severity: { 'parity:/a': { severity: 'minor', reason: 'r', exception: 'S-7' } } }).verdict, 'done')
  const r = run({ ...clean(), parity: parity([route('/a')]) })
  assert.equal(r.verdict, 'incomplete')
  assert.match(why(r), /no route reached \/b/)
})

test('an accepted finding (decision cited in the store) is a named exception, not an open cluster', () => {
  const v = visual([pg('a', '/a', {}, { '1440-dark': [{ ...pm('h3.t "x"'), exception: { decision: 'D-1' } }] }), pg('b', '/b')])
  const r = run({ visual: v, parity: parity([route('/a'), route('/b')]) })
  assert.equal(r.verdict, 'done')
  assert.equal(r.accepted.visualClusters, 1)
})

test('missing page, axis, stage, axis-error or stale run is incomplete — never done, even with no findings', () => {
  const c = clean()
  assert.match(why(run({ ...c, visual: visual([pg('a', '/a')]) })), /no page report for \/b/)
  const noAxis = pg('b', '/b'); noAxis.axes.pop()
  assert.match(why(run({ ...c, visual: visual([pg('a', '/a'), noAxis]) })), /no 390-dark axis/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { stages: stages.slice(0, 3) }) })), /stage dark-responsive is absent/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { stages: stages.map((s, i) => (i ? s : { ...s, status: 'skipped' })) }) })), /stage light-desktop is skipped/)
  const err = pg('a', '/a', { '1440-light': [{ kind: 'axis-error', error: 'x' }] })
  assert.match(why(run({ ...c, visual: visual([err, pg('b', '/b')]) })), /axis-error/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { identity: { ...identity, stale: ['spec changed'] } }) })), /contract stale/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { scope: { kind: 'fast-gate' } }) })), /scope fast-gate/)
  assert.match(why(run({ ...c, current: { ...current, newest: Date.parse('2031-01-01T00:00:00Z') } })), /before the last build/)
})

test('one test per bound input: each change to the identity makes the measurement stale', () => {
  const c = clean()
  const moved = (key) => run({ ...c, current: { ...current, bindings: { ...bindings, [key]: 'sha256:changed' } } })
  assert.match(why(moved('specHash')), /spec binding differs/)
  assert.match(why(moved('specHash')), /contract: stale — specHash/)
  assert.match(why(moved('pageMapHash')), /contract: stale — pageMapHash/)
  assert.match(why(moved('artifactHash')), /artifact binding differs/)
  assert.match(why(moved('seedReportHash')), /seed-report binding differs/)
  assert.match(why(moved('configHash')), /contract: stale — configHash/)
  // regenerated contract (different hash) than the one measured
  assert.match(why(run({ ...c, contract: { ...contract, extra: 1 } })), /different contract/)
  // a contract written before the config binding existed cannot prove the config is current
  const old = { id: 'site', group: contract.group, bindings: { ...bindings, configHash: undefined } }
  assert.match(why(run({ ...c, contract: old, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(old) } }) })), /records no review.config.json hash/)
  assert.match(why(run({ ...c, contract: null })), /contract: not given/)
  // parity-accepted.json changed (or appeared) after the parity run
  assert.match(why(run({ ...c, current: { ...current, acceptHash: 'sha256:other' } })), /parity-accepted.json differs/)
  assert.match(why(run({ ...c, parity: parity([route('/a'), route('/b')], { inputs: {} }) })), /parity-accepted.json differs/)
})

test('pages outside the group do not count', () => {
  const v = visual([pg('a', '/a'), pg('b', '/b'), pg('z', '/z', { '1440-dark': [pm('h3.t "x"')] })])
  assert.equal(run({ visual: v, parity: parity([route('/a'), route('/b'), route('/z', { ok: false })]) }).verdict, 'done')
})

test('CLI: exit 0 done, 1 open, 3 incomplete, 2 bad input; every hash is read from the files as they are now', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'group-verdict-'))
  try {
    const spec = path.join(dir, 'spec'); mkdirSync(spec)
    writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ file: 'a.html', path: '/a' }, { file: 'b.html', path: '/b' }] }))
    writeFileSync(path.join(spec, 'sections.json'), '{}'); writeFileSync(path.join(spec, 'content.json'), '{}')
    writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ kind: 'url', pages: [] }))
    const artifact = path.join(dir, 'theme.zip'), seed = path.join(dir, 'seed.json'), cfg = path.join(dir, 'review.config.json'), acc = path.join(dir, 'parity-accepted.json')
    writeFileSync(artifact, 'zip'); writeFileSync(seed, '{}'); writeFileSync(cfg, '{}'); writeFileSync(acc, '{"accept":[]}')
    const old = new Date('2020-01-01T00:00:00Z')
    for (const f of [artifact, seed, cfg, acc, ...['page-map', 'sections', 'content', 'reference'].map((n) => path.join(spec, `${n}.json`))]) utimesSync(f, old, old)
    const b = bindingsFrom({ specDir: spec, artifactPath: artifact, seedReportPath: seed, configPath: cfg })
    const ct = { id: 'site--g1', source: { site: SRC }, pages: [{ id: 'a', path: '/a', pagemapPath: '/a' }, { id: 'b', path: '/b', pagemapPath: '/b' }], group: { id: 'g1', pages: ['/a', '/b'], dossier: dir }, target: { site: SITE }, bindings: b }
    const contractFile = path.join(dir, 'visual.contract.json'); writeFileSync(contractFile, JSON.stringify(ct))
    const vis = path.join(dir, 'visual.json'), par = path.join(dir, 'parity.json')
    const bound = { stale: [], canonical: true, group: 'g1', contractHash: contractHash(ct), contractPath: contractFile, sourceHash: b.specHash, artifactHash: b.artifactHash, seedReportHash: b.seedReportHash }
    const write = (v, p) => { writeFileSync(vis, JSON.stringify(v)); writeFileSync(par, JSON.stringify(p)) }
    const goodParity = parity([{ ...route('/a'), sourceOrigin: undefined }, { ...route('/b'), sourceOrigin: undefined }], { source: SRC, inputs: { acceptHash: fileHash(acc) } })
    const cli = (extra = [], json = true) => spawnSync(process.execPath, [new URL('../visual/group-verdict.mjs', import.meta.url).pathname, ...(json ? ['--json'] : []), ...extra, '--pages', '/a,/b', '--group', 'g1', '--spec', spec, '--visual', vis, '--parity', par, '--accept', acc, '--artifact', artifact, '--seed-report', seed, '--config', cfg, '--site', SITE, '--contract', contractFile, '--port-audit', dir], { encoding: 'utf8', env: { ...process.env, TMPDIR: dir } })
    const c = clean()
    write(visual(c.visual.pages, { identity: bound, at: '2026-01-01T00:00:00Z' }), goodParity)
    cleanAudit({ dossier: dir, site: SITE, source: SRC, routes: ['/a', '/b'], runs: [dir], pages: ['/a', '/b'] })
    assert.equal(cli().status, 0, cli().stdout)
    // default output: ONE line, the verdict and where the complete JSON is; --json is the same result
    const lineOf = (r) => { const lines = r.stdout.split('\n').filter(Boolean); assert.equal(lines.length, 1, r.stdout); const m = lines[0].match(/^group-verdict g1: (verdict=\S+ .*) -> (\/.+\.json)$/); assert.ok(m, lines[0]); return { summary: m[1], file: m[2] } }
    const doneLine = lineOf(cli([], false))
    assert.match(doneLine.summary, /^verdict=done pages=2 incomplete=0 open=0 minor=0$/)
    assert.deepEqual(JSON.parse(readFileSync(doneLine.file, 'utf8')), JSON.parse(cli().stdout))
    const outFile = path.join(dir, 'verdict.json')
    assert.equal(lineOf(cli(['--out', outFile], false)).file, outFile)
    assert.equal(JSON.parse(readFileSync(outFile, 'utf8')).verdict, 'done')
    // the verdict is never written over what it read: spec files, the audit receipt, the run report, the contract
    for (const target of [path.join(spec, 'reference.json'), path.join(spec, 'page-map.json'), path.join(dir, 'port-audit.json'), path.join(dir, 'DECISIONS.md'), vis, contractFile]) {
      const before = readFileSync(target, 'utf8')
      const refused = cli(['--out', target], false)
      assert.equal(refused.status, 2, target)
      assert.match(refused.stderr, /must not replace it/)
      assert.equal(readFileSync(target, 'utf8'), before)
    }
    write(visual([pg('a', '/a', { '1440-dark': [pm('h3.t "x"')] }), pg('b', '/b')], { identity: bound, at: '2026-01-01T00:00:00Z' }), goodParity)
    assert.equal(cli().status, 1)
    const openRun = cli([], false)
    assert.equal(openRun.status, 1)
    assert.match(lineOf(openRun).summary, /^verdict=open pages=2 incomplete=0 open=\d+ minor=0 first=/)
    write(visual(c.visual.pages, { identity: bound, at: '2026-01-01T00:00:00Z' }), goodParity)
    writeFileSync(cfg, '{"visual":{"exceptions":[]}}'); utimesSync(cfg, old, old)
    assert.equal(cli().status, 3, 'review.config.json changed after the contract was written')
    const incompleteRun = cli([], false)
    assert.equal(incompleteRun.status, 3)
    assert.match(lineOf(incompleteRun).summary, /^verdict=incomplete pages=2 incomplete=\d+ open=0 minor=0 first=contract: stale — configHash/)
    writeFileSync(cfg, '{}'); utimesSync(cfg, old, old)
    assert.equal(cli().status, 0)
    writeFileSync(acc, '{"accept":[{"match":"x","reason":"y"}]}'); utimesSync(acc, old, old)
    assert.equal(cli().status, 3, 'parity-accepted.json changed after the parity run')
    writeFileSync(acc, '{"accept":[]}'); utimesSync(acc, old, old)
    writeFileSync(path.join(spec, 'content.json'), '{"x":1}')
    assert.equal(cli().status, 3, 'spec changed')
    writeFileSync(vis, '{ nope')
    assert.equal(cli().status, 2)
    assert.equal(spawnSync(process.execPath, [new URL('../visual/group-verdict.mjs', import.meta.url).pathname, '--pages', 'a'], { encoding: 'utf8' }).status, 2)
    // --site and --contract are mandatory: nothing is inferred from the report
    writeFileSync(path.join(spec, 'content.json'), '{}'); utimesSync(path.join(spec, 'content.json'), old, old)
    write(visual(c.visual.pages, { identity: bound, at: '2026-01-01T00:00:00Z' }), goodParity)
    const bare = (drop) => { const all = ['--pages', '/a,/b', '--group', 'g1', '--spec', spec, '--visual', vis, '--parity', par, '--accept', acc, '--artifact', artifact, '--seed-report', seed, '--config', cfg, '--site', SITE, '--contract', contractFile, '--port-audit', dir]; const i = all.indexOf(drop); all.splice(i, 2); return spawnSync(process.execPath, [new URL('../visual/group-verdict.mjs', import.meta.url).pathname, ...all], { encoding: 'utf8' }) }
    assert.equal(bare('--site').status, 2)
    assert.equal(bare('--contract').status, 2)
    // a byte-identical copy of the contract elsewhere is not the file the run measured against
    const copy = path.join(dir, 'copy'); mkdirSync(copy); const copied = path.join(copy, 'visual.contract.json'); writeFileSync(copied, JSON.stringify(ct))
    const viaCopy = cli(['--contract', copied]); assert.equal(viaCopy.status, 3); assert.match(viaCopy.stdout, /not the canonical visual.contract.json of the dossier/)
    // an attempts/ symlink to the canonical file is the same bytes at another path: neither asked for nor measured against
    const att = path.join(dir, 'attempts'); mkdirSync(att); const linked = path.join(att, 'visual.contract.json'); symlinkSync(contractFile, linked)
    const viaLink = cli(['--contract', linked]); assert.equal(viaLink.status, 3); assert.match(viaLink.stdout, /not the canonical visual.contract.json of the dossier/)
    write(visual(c.visual.pages, { identity: { ...bound, contractPath: linked } }), goodParity)
    const measuredLink = cli(); assert.equal(measuredLink.status, 3); assert.match(measuredLink.stdout, /the run measured against .*attempts.*not the group's contract/)
    // …and a run that measured against the copy cannot be closed with the canonical file
    write(visual(c.visual.pages, { identity: { ...bound, contractPath: copied } }), goodParity)
    const measuredCopy = cli(); assert.equal(measuredCopy.status, 3); assert.match(measuredCopy.stdout, /the run measured against .*copy.*not the group's contract/)
    write(visual(c.visual.pages, { identity: bound, at: '2026-01-01T00:00:00Z' }), goodParity)
    // parity measured on another stand
    write(visual(c.visual.pages, { identity: bound, at: '2026-01-01T00:00:00Z' }), { ...goodParity, target: 'http://127.0.0.1:9999' })
    const wrongParity = cli(); assert.equal(wrongParity.status, 3); assert.match(wrongParity.stdout, /parity: measured at http:\/\/127.0.0.1:9999/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the contract is the GROUP\'s own: a site contract, another group, a different page set or a foreign report never closes the group', () => {
  const c = clean()
  const site = { id: 'site', target: { site: SITE }, bindings }
  assert.match(why(run({ ...c, contract: site, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(site), group: null } }) })), /not a page group contract/)
  const other = { ...contract, group: { id: 'g2', pages: ['/a', '/b'] } }
  const r = run({ ...c, contract: other, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(other), group: 'g2' } }) })
  assert.match(why(r), /belongs to group g2, this verdict is for group g1/)
  assert.equal(r.verdict, 'incomplete')
  const wide = { ...contract, group: { id: 'g1', pages: ['/a', '/b', '/c'] } }
  assert.match(why(run({ ...c, contract: wide, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(wide) } }) })), /owns \/c, which --pages leaves out/)
  const narrow = { ...contract, group: { id: 'g1', pages: ['/a'] } }
  assert.match(why(run({ ...c, contract: narrow, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(narrow) } }) })), /\/b is not one of group g1's pages/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { identity: { ...identity, group: null } }) })), /the run's report is for a site contract/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { identity: { ...identity, group: 'g2' } }) })), /report is for group g2, not group g1/)
  // the group's own stand: a seed report or zip of another stand is stale against ITS bindings
  const moved = run({ ...c, current: { ...current, bindings: { ...bindings, seedReportHash: 'sha256:main-stand' } } })
  assert.equal(moved.verdict, 'incomplete')
  assert.match(why(moved), /contract: stale — seedReportHash/)
})

test('the group\'s own stand: a report measured at another origin, a contract without a target, and an attempt are never done', () => {
  const c = clean()
  assert.match(why(run({ ...c, visual: { ...c.visual, site: 'http://127.0.0.1:9999' } })), /measured at http:\/\/127.0.0.1:9999, the group's stand is http:\/\/127.0.0.1:8081/)
  assert.match(why(run({ ...c, visual: { ...c.visual, site: undefined } })), /no site/)
  assert.match(why(run({ ...c, current: { ...current, site: 'http://127.0.0.1:9999' } })), /bound to http:\/\/127.0.0.1:8081, this verdict is for the stand/)
  assert.equal(run({ ...c, current: { ...current, site: `${SITE}/` } }).verdict, 'done')
  const bare = { ...contract }
  delete bare.target
  assert.match(why(run({ ...c, contract: bare, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(bare) } }) })), /records no target site/)
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { identity: { ...identity, canonical: false } }) })), /not the canonical one/)
  assert.match(why(run({ ...c, current: { ...current, contractPath: '/d/attempts/x/visual.contract.json' } })), /not the canonical visual.contract.json of the dossier/)
  // a copy named visual.contract.json elsewhere is not the file the run measured against
  assert.match(why(run({ ...c, current: { ...current, contractPath: '/d/visual.contract.json' } })), /not the canonical visual.contract.json of the dossier/)
  // the run measured against a copy of the contract (a Visual QA run pointed at it): the report names another path
  assert.match(why(run({ ...c, visual: visual(c.visual.pages, { identity: { ...identity, contractPath: '/elsewhere/visual.contract.json' } }) })), /the run measured against \/elsewhere\/visual.contract.json, not the group's contract/)
  const noDossier = { ...contract, group: { id: 'g1', pages: ['/a', '/b'] } }
  assert.match(why(run({ ...c, contract: noDossier, visual: visual(c.visual.pages, { identity: { ...identity, contractHash: contractHash(noDossier) } }) })), /no group.dossier/)
  assert.match(why(run({ ...c, current: { ...current, site: null } })), /no --site/)
  assert.match(why(run({ ...c, parity: { ...c.parity, target: 'http://127.0.0.1:9999' } })), /parity: measured at http:\/\/127.0.0.1:9999/)
  assert.match(why(run({ ...c, parity: { ...c.parity, target: undefined } })), /parity: measured at \(no target\)/)
})

test('a seeded route answers for its page-map path: --pages /our-team/ finds the spec kind, the visual page and the parity route of /team', () => {
  const cp = { ...contract, group: { id: 'g1', pages: ['/our-team'], dossier: '/dossier/g1' }, pages: [{ id: 'en-team', path: '/our-team/', pagemapPath: '/team' }] }
  const k = new Map([['/team', 'url']])
  const ev = { visual: visual([pg('en-team', '/our-team/')], { identity: { ...identity, contractHash: contractHash(cp) } }), parity: parity([route('/our-team/')]) }
  const plan = [{ id: 'en-team', path: '/our-team/', pagemapPath: '/team', kind: 'url', sourceRoute: '/team' }]
  const evp = { ...ev, parity: parity([route('/our-team/', { route: '/team' })]) }
  for (const asked of ['/our-team', '/our-team/', '/team']) {
    const r = groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: [asked], kinds: k, current, contract: cp, plan, ...evp })
    assert.equal(r.verdict, 'done', `${asked}: ${JSON.stringify(r)}`)
    assert.deepEqual(r.parityScope.http.length, 1)
  }
  // a failing seeded route is open, not lost
  const failing = groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, plan, visual: ev.visual, parity: parity([route('/our-team', { route: '/team', ok: false })]) })
  assert.equal(failing.verdict, 'open')
  // a report measured only at the obsolete page-map path /team is no evidence for the page seeded at /our-team/
  const obsolete = groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, plan, visual: ev.visual, parity: parity([route('/team')]) })
  assert.equal(obsolete.verdict, 'incomplete')
  assert.match(why(obsolete), /no route reached \/our-team/)
  // a page of neither form is still named
  assert.match(why(groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/nowhere'], kinds: k, current, contract: cp, ...ev })), /\/nowhere is not a page of the page-map/)
  // the row at the seeded target must have been read from the PLANNED source route and the contract's live origin
  const at = (over) => groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, plan, visual: ev.visual, parity: parity([route('/our-team/', { route: '/team', ...over })]) })
  assert.match(why(at({ route: '/other' })), /read from the source route \/other, the plan says \/team/)
  assert.match(why(at({ sourceOrigin: 'http://elsewhere.example' })), /read from the source http:\/\/elsewhere.example, the contract's live source is http:\/\/source.example/)
  assert.match(why(at({ sourceOrigin: undefined })), /read from the source \(none\)/)
  assert.match(why(groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, visual: ev.visual, parity: evp.parity })), /no route plan for \/our-team/)
  // two rows for one seeded route are ambiguous evidence, never first-wins
  assert.match(why(groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, plan, visual: ev.visual, parity: parity([route('/our-team/', { route: '/team' }), route('/our-team', { route: '/team', ok: false })]) })), /more than one row for the seeded route \/our-team/)
  // two contract pages answering to one route, and two visual reports for one seeded route: named, never first-wins
  const amb = { ...cp, pages: [...cp.pages, { id: 'other', path: '/team', pagemapPath: '/team-2' }] }
  assert.match(why(groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: amb, plan, ...evp })), /route index is ambiguous: pages en-team and other both answer to \/team/)
  const twice = visual([pg('en-team', '/our-team/'), pg('en-team-2', '/our-team')], { identity: { ...identity, contractHash: contractHash(cp) } })
  assert.match(why(groupVerdict({ group: 'g1', audit: aud(['/our-team/'], ['/team']), pages: ['/our-team'], kinds: k, current, contract: cp, plan, visual: twice, parity: evp.parity })), /2 page reports for the seeded route \/our-team/)
})

test('the search view and the home page of one group are two routes: the verdict needs visual and parity evidence at the search page\'s own measured target', () => {
  const cp = {
    ...contract,
    group: { id: 'g1', pages: ['/', '/search'], dossier: '/dossier/g1' },
    pages: [
      { id: 'en-home', path: '/', pagemapPath: '/' },
      { id: 'en-search', path: '/?s=steel', pagemapPath: '/search' }
    ]
  }
  const k = new Map([['/', 'url'], ['/search', 'url']])
  const plan = [
    { id: 'en-home', path: '/', pagemapPath: '/', kind: 'url', sourceRoute: '/' },
    { id: 'en-search', path: '/?s=steel', pagemapPath: '/search', kind: 'url', sourceRoute: '/search' }
  ]
  const idn = { ...identity, contractHash: contractHash(cp) }
  const ask = (ev, pages = ['/', '/search']) => groupVerdict({ group: 'g1', audit: aud(['/', '/?s=steel'], ['/', '/search']), pages, kinds: k, current, contract: cp, plan, ...ev })
  const good = { visual: visual([pg('en-home', '/'), pg('en-search', '/?s=steel')], { identity: idn }), parity: parity([route('/'), route('/?s=steel', { route: '/search' })]) }
  assert.equal(ask(good).verdict, 'done', JSON.stringify(ask(good)))
  // asking for the measured route names the same page as asking for the page-map path
  assert.equal(ask(good, ['/', '/?s=steel']).verdict, 'done')
  // evidence of the home page (or of another query) is not evidence of the search page
  const homeOnly = ask({ ...good, visual: visual([pg('en-home', '/')], { identity: idn }) })
  assert.equal(homeOnly.verdict, 'incomplete')
  assert.match(why(homeOnly), /no page report for \/search/)
  const otherTerm = ask({ ...good, parity: parity([route('/'), route('/?s=other', { route: '/search' })]) })
  assert.equal(otherTerm.verdict, 'incomplete')
  assert.match(why(otherTerm), /no route reached \/\?s=steel/)
})
