// preflight.mjs: before a full Visual QA pass, the five measuring tools read at most six pages and
// their reading is judged against a plain census of the same pages; each capability of the site the
// sample covers is measured, read against itself and shown to catch an injected defect; and the run
// is sealed in a measurement lock. The misreads JA Vega paid three full passes for (M4/M4b, 26/09)
// must each stop the preflight by name; a theme that really differs from its source must not be
// called a tool bug, and its findings stay; a capability nobody measured is never a pass.
//
// P4_TEST_ROOT keeps every run's evidence under one directory (else a temporary one, removed after).
// P4_JA_VEGA_SMOKE=1 adds the read-only run on the JA Vega stands (:8261 source, :8262 port) — see
// the last test for its inputs.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  boundariesOf,
  certify,
  certifyControl,
  containerObservation,
  changedInputs,
  containerFindings,
  cssScanInPage,
  epochOf,
  execBounded,
  fetchHash,
  formatMarkdown,
  GATES,
  hashInputs,
  hiddenFindings,
  hiddenUnsettled,
  httpParityInputs,
  inspectContainers,
  judge,
  layoutFindings,
  lockDigest,
  LOCK_FILE,
  LOCK_SCHEMA,
  main,
  mdText,
  namedFindings,
  MAX_PAGES,
  pageList,
  parseArgs,
  passArgs,
  probeHidden,
  probeWidths,
  readInput,
  reasonText,
  REASON_BOUNDS,
  readLock,
  requirementsOf,
  resourceLog,
  routeProblem,
  runProbe,
  runTool,
  SEALED_ARTIFACTS,
  selectSample,
  sourcePathOf,
  sourceUrlOf,
  stableJson,
  toolCommands,
  toolFingerprint,
  toolFiles,
  targetGaps,
  TOOLS,
  urlOn,
  validateRuntimeManifest,
  verifyRun,
  writeAtomic
} from '../visual/preflight.mjs'
import { bindReferenceKinds } from '../visual/applicability.mjs'
import { buildContract, specHash } from '../visual/contract.mjs'
import { lazyBrowser } from '../lib/browser.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOL = path.resolve(HERE, '..', 'visual', 'preflight.mjs')
const REC = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'visual-preflight', 'recorded.json'), 'utf8'))
const sample = () => structuredClone(REC.sample)
const R = REC.runs
const KEEP = Boolean(process.env.P4_TEST_ROOT)
const ROOT = KEEP ? path.resolve(process.env.P4_TEST_ROOT) : mkdtempSync(path.join(tmpdir(), 'preflight-test-'))
mkdirSync(ROOT, { recursive: true })
const scratch = (name) => mkdtempSync(path.join(ROOT, `${name}-`))

/** Results where every tool read the sample cleanly, to replace one tool's reading at a time. */
function cleanResults() {
  return {
    'visual-qa': [{ key: 'run', run: R.ok, report: { summary: { findings: 0, unclassified: 0 }, pages: [{ id: 'en-home', path: '/', findings: [], axes: [{ examined: 30, components: [{}], findings: [] }] }, { id: 'en-missing-page', path: '/missing-page/', findings: [], axes: [{ examined: 3, components: [], findings: [] }] }] } }],
    'layout-boxes': [
      { key: '/', run: R.ok, report: { results: [{ route: '/', paired: 10, differing: 0, rows: [], onlySource: [], onlySite: [] }] } },
      { key: '/missing-page/', run: R.ok, report: { results: [{ route: '/missing-page/', paired: 1, differing: 0, rows: [], onlySource: [], onlySite: [] }] } }
    ],
    motion: [{ key: '/', run: R.ok, report: { results: [{ route: '/', source: { reveals: 0 }, site: { reveals: 0 }, rows: [] }] } }],
    'http-parity': [{ key: 'run', run: R.ok, report: { routes: [{ route: '/', sourceStatus: 200, targetStatus: 200, sourceRuns: 30, matched: 30, missing: [], ok: true }, { route: '/missing-page/', sourceStatus: 404, targetStatus: 404, sourceRuns: 1, matched: 1, missing: [], ok: true }] } }],
    functional: [{ key: 'run', run: R.ok, report: { findings: 0, routes: [{ route: '/', status: 200, findings: [], examined: { links: 12 } }, { route: '/missing-page/', status: 404, expectedStatus: 404, findings: [], examined: { links: 2 } }] } }]
  }
}
const codes = (v, tool) => v.tools[tool].reasons.map((r) => r.code)

// ── the sample: capabilities, the bound, the accounting ──────────────────────────────────────────

/** A contract-shaped object with `n` layouts, one page each (the fields selectSample reads). */
function layoutsContract(n, extra = {}) {
  const pages = Array.from({ length: n }, (_, i) => ({ id: `en-p${String(i)}`, pagemapPath: i ? `/p${String(i)}/` : '/', path: i ? `/p${String(i)}/` : '/', layout: `l${String(i)}` }))
  pages.push({ id: 'en-404', pagemapPath: '/missing/', path: '/missing/', layout: '404' })
  return { pages, layouts: [...pages.map((p) => ({ id: p.layout, pages: [p.id], representative: p.id }))], design: { containers: { none: 'fixture' } }, ...extra }
}
const mapOf = (n) => ({ pages: [...Array.from({ length: n }, (_, i) => ({ path: i ? `/p${String(i)}/` : '/', view: i ? 'page' : 'front-page' })), { path: '/missing/', view: '404', synthetic: true }] })
const scanned = (paths, obs = {}) => ({ pages: Object.fromEntries(paths.map((p) => [p, { libraries: [], reveals: { hidden: 0 }, toggles: 0, css: { targets: [] }, ...(obs[p] ?? {}) }])), failed: {}, skipped: [], unreadable: [] })

test('preflight sample: capability-driven, deterministic, no duplicates, never past the bound — the error page, every layout, dark, libraries, hidden content', () => {
  const contract = layoutsContract(3)
  const pm = mapOf(3)
  const discovery = scanned(['/', '/p1/', '/p2/', '/missing/'], { '/p2/': { libraries: [{ id: 'aos', recognised: true, count: 4 }], reveals: { hidden: 4 } }, '/p1/': { toggles: 2 } })
  const a = selectSample(pm, { contract, discovery, darkMark: 'attr:data-theme=dark' })
  const b = selectSample(structuredClone(pm), { contract: structuredClone(contract), discovery: structuredClone(discovery), darkMark: 'attr:data-theme=dark' })
  assert.deepEqual(a.sample.map((s) => s.path), b.sample.map((s) => s.path), 'the same inputs choose the same pages')
  assert.deepEqual(a.sample.map((s) => s.path), ['/', '/p1/', '/p2/', '/missing/'])
  assert.equal(new Set(a.sample.map((s) => s.path)).size, a.sample.length)
  const s = a.coverage.summary
  assert.deepEqual(s.uncovered, [])
  assert.ok(['error-status', 'layout:l0', 'layout:l1', 'layout:l2', 'layout:404', 'dark', 'animation:aos', 'hidden:scroll', 'hidden:toggle'].every((id) => s.covered.includes(id)), JSON.stringify(s))
  assert.deepEqual(s['not-applicable'], ['containers'], 'no container grid, evidenced by the contract and a complete scan')
  assert.equal(a.sample.find((x) => x.path === '/missing/').covers.includes('error-status'), true)
  assert.equal(a.sample.find((x) => x.path === '/p2/').covers.includes('animation:aos'), true)
})

test('preflight sample: none pages retain target status/layout/dark and name source-only obligations as N/A', () => {
  const contract = layoutsContract(1)
  contract.pages.find((p) => p.pagemapPath === '/') .referenceKind = 'none'
  const referenceKinds = { 'en-p0': 'none', '/': 'none', '/p0/': 'none' }
  const chosen = selectSample(mapOf(1), { contract, discovery: scanned(['/']), darkMark: 'attr:data-theme=dark', referenceKinds })
  const caps = chosen.coverage.capabilities
  assert.ok(caps.some((c) => c.id === 'status:target:/' && c.state === 'covered'))
  assert.ok(caps.some((c) => c.id === 'layout:target:/' && c.state === 'covered'))
  assert.ok(caps.some((c) => c.id === 'layout-source:l0' && c.state === 'not-applicable'))
  assert.ok(caps.some((c) => c.id === 'dark' && c.state === 'covered'))
  assert.ok(caps.some((c) => c.id === 'preflight-source-census:/' && c.state === 'not-applicable'))
  assert.ok(caps.some((c) => c.id === 'preflight-source-layout:/' && c.state === 'not-applicable'))
  assert.ok(caps.some((c) => c.id === 'preflight-source-http:/' && c.state === 'not-applicable'))
  assert.equal(chosen.sample[0].referenceKind, 'none')
  assert.equal(parseArgs(['--routes', 'routes.json', '--site', 'http://site.test', '--contract', 'contract.json', '--spec', 'spec', '--out', 'new']).source, null)
})

test('preflight N/A binding: a contract kind must match the spec reference kind, and no spec means no N/A authority', async () => {
  const contract = layoutsContract(1)
  contract.pages.find((p) => p.pagemapPath === '/').referenceKind = 'none'
  const ref = { kind: 'html', pages: [] }
  const binding = bindReferenceKinds(contract.pages, mapOf(1), ref)
  assert.match(binding.errors.join(), /referenceKind none does not match reference.json kind html/)
  const unbound = requirementsOf({ list: pageList(mapOf(1)), contract, discovery: scanned(['/']), darkMark: 'attr:data-theme=dark' })
  assert.ok(!unbound.inventory.some((c) => c.state === 'not-applicable' && c.id.startsWith('preflight-source-')), 'the contract alone cannot authorize source N/A')
  const input = requirementsOf({ list: pageList(mapOf(1)), contract, discovery: scanned(['/']), darkMark: 'attr:data-theme=dark', referenceKinds: { 'en-p0': 'html', '/': 'html', '/p0/': 'html' } })
  assert.ok(!input.inventory.some((c) => c.state === 'not-applicable' && c.id.startsWith('preflight-source-')))

  const fx = fixtureSpec(page())
  const liveContract = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
  liveContract.pages.find((p) => p.pagemapPath === '/').referenceKind = 'none'
  writeFileSync(fx.contractFile, JSON.stringify(liveContract))
  writeFileSync(path.join(fx.spec, 'reference.json'), JSON.stringify({ kind: 'html', pages: [] }))
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', site.origin, '--contract', fx.contractFile, '--out', path.join(fx.root, 'unbound'), '--tools', 'motion']), 2)
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', site.origin, '--contract', fx.contractFile, '--spec', fx.spec, '--out', path.join(fx.root, 'mismatch'), '--tools', 'motion']), 2)
  assert.equal(existsSync(path.join(fx.root, 'unbound')), false)
  assert.equal(existsSync(path.join(fx.root, 'mismatch')), false)

  const htmlFx = fixtureSpec(page())
  const legacyOut = path.join(htmlFx.root, 'legacy-without-spec')
  const legacy = await main(['--routes', htmlFx.pageMapFile, '--site', site.origin, '--source', source.origin, '--contract', htmlFx.contractFile, '--runtime-manifest', htmlFx.runtime, '--out', legacyOut, '--tools', 'motion', '--timeout-ms', '1000'])
  assert.notEqual(legacy, 2, 'an HTML-only preflight keeps working without --spec as it did before N/A binding')
  assert.equal(existsSync(legacyOut), true)
})

test('preflight sample: nine layouts on a six-page bound leave three uncovered by name — never dropped to make the sample fit', () => {
  const { sample: smp, coverage } = selectSample(mapOf(9), { contract: layoutsContract(9), discovery: scanned([]), darkMark: 'attr:data-theme=dark' })
  assert.equal(smp.length, MAX_PAGES)
  const layoutReqs = coverage.capabilities.filter((c) => c.gate === 'layout')
  assert.equal(layoutReqs.length, 10, 'nine content layouts and the 404 layout, each a requirement')
  const uncovered = coverage.summary.uncovered
  // the front page (its layout and dark) and the 404 (its status and layout) first, then one layout a page
  assert.deepEqual(smp.map((s) => s.path), ['/', '/p1/', '/p2/', '/p3/', '/p4/', '/missing/'])
  assert.deepEqual(uncovered, ['layout:l5', 'layout:l6', 'layout:l7', 'layout:l8'])
  for (const id of uncovered) assert.match(coverage.capabilities.find((c) => c.id === id).reason, /the 6-page bound is reached/)
  const cert = certify({ capabilities: coverage.capabilities, probeCerts: Object.fromEntries(coverage.summary.covered.map((id) => [id, { certified: true, reasons: [] }])), verdict: { verdict: 'trusted', tools: Object.fromEntries(TOOLS.map((t) => [t, { verdict: 'trusted' }])) } })
  assert.equal(cert.gates.layout.status, 'not-certified', 'uncovered layouts stop the gate')
  assert.equal(cert.status, 'partial')
  // a smaller bound is the same accounting
  const three = selectSample(mapOf(9), { contract: layoutsContract(9), discovery: scanned([]), darkMark: 'attr:data-theme=dark', maxPages: 3 })
  assert.equal(three.sample.length, 3)
  assert.throws(() => selectSample(mapOf(2), { maxPages: 7 }), /1–6 pages/)
})

test('preflight sample: --pages by hand has the same bound and the same accounting; unknown and not-applicable are told apart', () => {
  const pm = { pages: [{ path: '/about/', view: 'page' }, { path: '/', view: 'front-page' }, { path: '/blog/', view: 'home', synthetic: true }, { path: '/missing/', view: '404', synthetic: true }] }
  const auto = selectSample(pm)
  assert.deepEqual(auto.sample.map((s) => [s.path, s.role, s.status]), [['/about/', 'content', null], ['/', 'content', null], ['/missing/', 'error', 404]], 'no contract: a layout is a view; synthetic pages only as the error page')
  const hand = selectSample(pm, { pages: ['/about/'] })
  assert.deepEqual(hand.sample.map((s) => s.path), ['/about/'])
  assert.ok(hand.coverage.summary.uncovered.includes('error-status') && hand.coverage.summary.uncovered.includes('layout:front-page'))
  assert.match(hand.coverage.capabilities.find((c) => c.id === 'error-status').reason, /none of --pages shows it/)
  assert.throws(() => selectSample(pm, { pages: ['/nope/'] }), /not a page of the page-map/)
  assert.throws(() => selectSample(pm, { pages: ['/', '/about/', '/missing/'], maxPages: 2 }), /at most 2/)
  assert.throws(() => selectSample(pm, { pages: ['/', '/'] }), /twice/)
  assert.throws(() => selectSample(pm, { pages: ['/missing/'] }), /no content page/, 'the 404 alone leaves nothing to read')
  assert.deepEqual(selectSample(pm, { pages: ['/missing/', '/about/'] }).sample.map((s) => s.role), ['content', 'error'])
  // no dark hook, no error page, no scan: unknown, never a pass; a complete scan that saw nothing: not applicable
  const bare = selectSample({ pages: [{ path: '/', view: 'front-page' }] })
  const state = (x, id) => x.coverage.capabilities.find((c) => c.id === id).state
  assert.equal(state(bare, 'dark'), 'unknown')
  assert.equal(state(bare, 'error-status'), 'unknown')
  assert.equal(state(bare, 'animation'), 'unknown')
  assert.equal(state(bare, 'containers'), 'unknown')
  const seen = selectSample({ pages: [{ path: '/', view: 'front-page' }] }, { discovery: scanned(['/']), contract: null })
  assert.equal(state(seen, 'animation'), 'not-applicable')
  assert.equal(state(seen, 'hidden'), 'not-applicable')
  assert.equal(state(seen, 'containers'), 'unknown', 'no declaration of the containers: not measured, not "absent"')
  // a scan that could not read a page leaves every library it might carry unknown
  const part = selectSample({ pages: [{ path: '/', view: 'front-page' }, { path: '/b/', view: 'page' }] }, { discovery: { ...scanned(['/'], { '/': { libraries: [{ id: 'aos', recognised: true, count: 1 }] } }), failed: { '/b/': 'net::ERR_CONNECTION_RESET' } } })
  assert.equal(state(part, 'animation:unscanned'), 'unknown')
  // a contract layout whose pages the page-map does not have is uncovered, never skipped
  const ghost = layoutsContract(2)
  ghost.layouts.push({ id: 'ghost', pages: ['en-ghost'], representative: 'en-ghost' })
  const g = selectSample(mapOf(2), { contract: ghost, discovery: scanned([]), darkMark: 'attr:data-theme=dark' })
  assert.equal(state(g, 'layout:ghost'), 'uncovered')
  assert.match(g.coverage.capabilities.find((c) => c.id === 'layout:ghost').reason, /no page of the page-map can show it/)
})

test('preflight sample: malformed page-maps are refused, not guessed', () => {
  assert.throws(() => pageList({}), /no "pages" list/)
  assert.throws(() => pageList({ pages: [] }), /no pages/)
  assert.throws(() => pageList({ pages: [{ path: 'about' }] }), /no path starting with \//)
  assert.throws(() => pageList({ pages: [{ path: '/a/' }, { path: '/a/' }] }), /listed twice/)
  assert.throws(() => pageList({ pages: [{ path: '/a/', status: 'gone' }] }), /not an HTTP status/)
  assert.throws(() => pageList({ pages: [null] }), /no path/)
  assert.deepEqual(pageList(['/', '/x/']).map((e) => e.path), ['/', '/x/'])
  // a path joined to an origin must stay that origin's, and that path
  for (const [p, re] of [
    ['//evil.example/x', /names another host/],
    ['/a/../b/', /dot segment/],
    ['/a/./b/', /dot segment/],
    ['/a/%2E%2e/b/', /dot segment/],
    ['/a?x=1', /query, fragment/],
    ['/a#top', /query, fragment/],
    ['/a\\b', /query, fragment, backslash/],
    ['/a b/', /whitespace/]
  ]) {
    assert.throws(() => pageList({ pages: [{ path: p }] }), re, p)
    assert.match(String(routeProblem(p)), re, p)
    assert.throws(() => urlOn('http://127.0.0.1:1', p), re, p)
  }
  assert.equal(urlOn('http://127.0.0.1:1', '/about-us/'), 'http://127.0.0.1:1/about-us/')
  assert.equal(sourceUrlOf('http://127.0.0.1:2', '/index.php', '/about-us/'), 'http://127.0.0.1:2/index.php/about-us/')
  assert.throws(() => sourceUrlOf('http://127.0.0.1:2', '', '//evil.example/'), /another host/)
})

test('preflight sample: the capability scan is judged against every page the source serves — a page outside the contract that was not read leaves its libraries unknown, one that was read and carries a library leaves it uncovered', () => {
  const contract = layoutsContract(2)
  const pm = mapOf(2)
  pm.pages.splice(2, 0, { path: '/extra/', view: 'page' })
  const onlyContract = scanned(['/', '/p1/', '/missing/'])
  const state = (x, id) => x.coverage.capabilities.find((c) => c.id === id)?.state
  // the old scan read only the contract pages and called the rest "none seen"
  const a = selectSample(pm, { contract, discovery: onlyContract, darkMark: 'attr:data-theme=dark', needContract: true })
  assert.equal(state(a, 'animation'), 'unknown', JSON.stringify(a.coverage.capabilities))
  assert.equal(state(a, 'hidden'), 'unknown')
  assert.match(a.coverage.capabilities.find((c) => c.id === 'animation').reason, /3 of 4 source page\(s\) scanned, 1 not scanned \(\/extra\/\)/)
  // read, the page outside the contract carries AOS: a capability no contract page can show is uncovered by name
  const b = selectSample(pm, { contract, discovery: scanned(['/', '/p1/', '/missing/', '/extra/'], { '/extra/': { libraries: [{ id: 'aos', recognised: true, count: 3 }], reveals: { hidden: 3 } } }), darkMark: 'attr:data-theme=dark', needContract: true })
  assert.equal(state(b, 'animation:aos'), 'uncovered')
  assert.match(b.coverage.capabilities.find((c) => c.id === 'animation:aos').reason, /among the contract pages/)
  assert.equal(state(b, 'hidden:scroll'), 'uncovered')
  // a synthetic page the source does not serve is not a page to scan; the declared error page is
  const r = requirementsOf({ list: pageList({ pages: [{ path: '/' }, { path: '/made-up/', synthetic: true, view: 'single' }, { path: '/404', view: '404', synthetic: true }] }), discovery: scanned(['/', '/404']) })
  assert.equal(r.inventory.find((c) => c.id === 'animation').state, 'not-applicable')
})

test('preflight breakpoints: the boundaries of the source CSS, read through the CSS object model — px only, below/at/above', () => {
  assert.deepEqual(boundariesOf(['(min-width: 576px)', 'screen and (max-width: 767.98px)', '(width >= 992px)', '(1200px <= width < 1400px)']), { boundaries: [576, 768, 992, 1200, 1400], unsupported: [] })
  assert.deepEqual(boundariesOf(['(width > 575.5px)', '(max-width: 1199px)']).boundaries, [576, 1200])
  const odd = boundariesOf(['(min-width: 40em)', 'print and (min-width: 100px)', 'not all and (monochrome)', '(min-device-width: 320px)', 'not all and (max-width: 500px)'])
  assert.deepEqual(odd.boundaries, [])
  assert.deepEqual(odd.unsupported.map((u) => u.replace(/^.*: /, '')), ['a threshold in em', 'a device width or aspect ratio is not a viewport width', 'a negated width query'])
  assert.deepEqual(probeWidths([576, 1200]), [575, 576, 577, 1199, 1200, 1201])
})

test('preflight breakpoints: what the CSS scan could not read is a gap of the container it touches — an @container width, an @import that never loaded, a scan stopped at its bound', async () => {
  const browser = lazyBrowser()
  try {
    const b = await browser.get()
    const ctx = await b.newContext()
    const pg = await ctx.newPage()
    await pg.route('**/*', (r) => (/\/(missing|gone)\.css$/.test(r.request().url()) ? r.fulfill({ status: 404, body: '' }) : r.request().url().endsWith('/empty.css') ? r.fulfill({ status: 200, contentType: 'text/css', body: '' }) : r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/gone.css"><link rel="stylesheet" href="/empty.css"><style>@import url("/missing.css"); .c{width:100%} @media (min-width: 768px){.c{max-width:720px}} .wrapper{container-type:inline-size} @container (min-width: 500px){.c{max-width:480px}} .x{color:red}</style></head><body><div class="wrapper"><div class="c">x</div></div></body></html>' })))
    await pg.goto('http://preflight.test/')
    const run = (o) => pg.evaluate(`(${String(cssScanInPage)})(${JSON.stringify(o)})`)
    const css = await run({ targets: [{ item: 'main', selector: '.c' }], heuristic: false, chrome: 'header', maxRules: 1000, extra: [] })
    const t = css.targets[0]
    assert.deepEqual(t.rules.map((x) => x.conditions), [['(min-width: 768px)']], 'the media rule is a breakpoint')
    assert.equal(t.queries.length, 1, 'the @container rule setting its width is kept apart')
    assert.equal(t.queries[0].container, '(min-width: 500px)')
    assert.deepEqual(css.unreadable.sort(), ['http://preflight.test/gone.css', 'http://preflight.test/missing.css'], 'a stylesheet or @import that never loaded is not read, and says so; an empty sheet that loaded is not a gap')
    assert.equal(css.truncated, false)
    const gaps = targetGaps(t, css)
    assert.equal(gaps.length, 2)
    assert.match(gaps[0], /@container \(min-width: 500px\): \.c sets max-width by a container query/)
    assert.match(gaps[1], /stylesheet\(s\) not read: http:\/\/preflight\.test\/(gone|missing)\.css/)
    // a rule bound reached before the breakpoint: the scan says it stopped, and the gap names it
    const cut = await run({ targets: [{ item: 'main', selector: '.c' }], heuristic: false, chrome: 'header', maxRules: 2, extra: [] })
    assert.equal(cut.truncated, true)
    assert.deepEqual(cut.targets[0].rules, [])
    assert.match(targetGaps(cut.targets[0], cut, 2).join(), /stopped at 2 rules/)
    // more rules setting one target's width than it keeps: the rest are counted and named, never dropped quietly
    const many = Array.from({ length: 203 }, (_, i) => `@media (min-width: ${String(300 + i)}px){.c{max-width:${String(200 + i)}px}}`).join('') + Array.from({ length: 52 }, (_, i) => `@container (min-width: ${String(100 + i)}px){.c{max-width:${String(90 + i)}px}}`).join('')
    await pg.setContent(`<!doctype html><html><head><style>.wrapper{container-type:inline-size}${many}</style></head><body><div class="wrapper"><div class="c">x</div></div></body></html>`)
    const full = await run({ targets: [{ item: 'main', selector: '.c' }], heuristic: false, chrome: 'header', maxRules: 1000, extra: [] })
    assert.equal(full.targets[0].rules.length, 200)
    assert.deepEqual(full.targets[0].dropped, { rules: 3, queries: 2 })
    const g = targetGaps(full.targets[0], full).join('; ')
    assert.match(g, /3 media rule\(s\) setting its width beyond the 200 kept for it/)
    assert.match(g, /2 @container rule\(s\) setting its width beyond the 50 kept for it/)
    await ctx.close()
  } finally {
    await browser.close()
  }
  // the gate: a truncated scan leaves the containers unknown; a declared container is not certified on gaps
  const contract = layoutsContract(1, { design: { containers: { items: [{ id: 'main', source: '.c', site: '.w', pages: ['en-p0'] }] } } })
  const discovery = scanned(['/', '/missing/'], { '/': { css: { targets: [{ item: 'main', found: true, breakpoints: [768], unsupported: ['x'] }], truncated: true } } })
  const r = requirementsOf({ list: pageList(mapOf(1)), contract, discovery, darkMark: 'attr:data-theme=dark' })
  assert.equal(r.inventory.find((c) => c.id === 'containers:css-truncated').state, 'unknown')
  const cert = certify({ capabilities: [...r.requirements.map((q) => ({ id: q.id, gate: q.gate, state: 'covered' })), ...r.inventory], probeCerts: Object.fromEntries(r.requirements.map((q) => [q.id, { certified: true, reasons: [] }])), verdict: { verdict: 'trusted', tools: Object.fromEntries(TOOLS.map((x) => [x, { verdict: 'trusted' }])) } })
  assert.equal(cert.gates.containers.status, 'not-certified')
  assert.match(cert.gates.containers.reasons.join(), /containers:css-truncated: unknown/)
})

test('preflight containers: the breakpoints probed are the sampled page\'s own; one set on another scanned page, a condition not read there, or a page not scanned is a gap — never a fallback to another page', () => {
  const item = { id: 'main', source: '.c', site: '.w' }
  const t = (breakpoints, unsupported = []) => ({ css: { targets: [{ item: 'main', found: true, breakpoints, unsupported }] } })
  const whole = scanned(['/', '/p1/', '/p2/'], { '/': t([768]), '/p1/': t([768, 992]), '/p2/': t([768], ['(min-width: 40em): a threshold in em']) })
  const o = containerObservation(whole, item, '/')
  assert.deepEqual(o.breakpoints, [768], 'the sampled page\'s own breakpoints are probed')
  assert.equal(o.found, true)
  assert.match(o.gaps.join('; '), /breakpoint-elsewhere: 992 px is set on \/p1\/, not on \/ — not probed where it applies/)
  assert.match(o.gaps.join('; '), /unsupported-conditions \(1\): \(min-width: 40em\): a threshold in em \(\/p2\/\)/)
  // every page with the same breakpoints and nothing unread: no gap
  assert.deepEqual(containerObservation(scanned(['/', '/p1/'], { '/': t([768]), '/p1/': t([768]) }), item, '/').gaps, [])
  // the sampled page not scanned: no other page's reading stands in for it
  const other = containerObservation(scanned(['/p1/'], { '/p1/': t([768]) }), item, '/')
  assert.deepEqual(other.breakpoints, [])
  assert.match(other.gaps.join(), /page-not-scanned: the source CSS of \/ was not read/)
  // the selector not on the sampled page, though found elsewhere
  assert.match(containerObservation(scanned(['/', '/p1/'], { '/p1/': t([768]) }), item, '/').gaps.join(), /selector-not-found: .* on \//)
  // pages the scan did not read (failed or past its bound) may set the width
  const part = { ...scanned(['/'], { '/': t([768]) }), failed: { '/p1/': 'timeout' }, skipped: ['/p2/'] }
  assert.match(containerObservation(part, item, '/').gaps.join(), /pages-not-scanned \(2\): the CSS of \/p1\/, \/p2\/ was not read/)
  assert.match(containerObservation(null, item, '/').gaps.join(), /css-not-scanned/)
  // and the gate: a declared container with pages the scan did not read is unknown, never certified
  const contract = layoutsContract(1, { design: { containers: { items: [{ id: 'main', source: '.c', site: '.w', pages: ['en-p0'] }] } } })
  const r = requirementsOf({ list: pageList(mapOf(1)), contract, discovery: scanned(['/'], { '/': t([768]) }), darkMark: 'attr:data-theme=dark' })
  assert.equal(r.inventory.find((c) => c.id === 'containers:unscanned')?.state, 'unknown', JSON.stringify(r.inventory))
  const all = requirementsOf({ list: pageList(mapOf(1)), contract, discovery: scanned(['/', '/missing/'], { '/': t([768]) }), darkMark: 'attr:data-theme=dark' })
  assert.equal(all.inventory.find((c) => c.id === 'containers:unscanned'), undefined)
})

test('preflight containers: a width is required on both sides at every probed width — missing on both is not "equal", missing at one width is named there', () => {
  const items = [{ id: 'main', widths: [767, 768, 769] }]
  const at = (a, b, c) => ({ widths: { main: { 767: a, 768: b, 769: c } } })
  assert.deepEqual(containerFindings(items, at(700, 720, 720), at(700, 720, 720), 1), [])
  assert.deepEqual(containerFindings(items, at(700, 720, 720), at(700, 720.5, 720), 1), [], 'within the tolerance')
  assert.deepEqual(containerFindings(items, at(700, 720, 720), at(700, 680, 720), 1).map((f) => [f.detector, f.measurement]), [['container-width', 'main@768']])
  // the old detector read null against null as equal: a container that vanishes at a width passed its control
  assert.deepEqual(containerFindings(items, at(700, null, 720), at(700, null, 720), 1).map((f) => [f.detector, f.measurement]), [['container-missing', 'main@768']])
  assert.deepEqual(containerFindings(items, at(700, 720, 720), at(700, 720, undefined), 1).map((f) => [f.detector, f.measurement]), [['container-missing', 'main@769']])
  assert.deepEqual(containerFindings(items, {}, {}, 1).map((f) => f.measurement), ['main@767', 'main@768', 'main@769'], 'no reading is three missing widths, never a pass')
  // a defect that makes the container vanish is not the width detector catching a narrowing
  const expect = { detector: 'container-width', measurement: 'main@768' }
  assert.match(certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: containerFindings(items, at(700, 720, 720), at(700, null, 720), 1) }, expect }).reasons.join(), /defect-missed/)
})

// ── commands and inputs ───────────────────────────────────────────────────────────────────────────

test('preflight commands: visual-qa targeted at the contract pages, layout-boxes per route with the contract hooks, motion on the content pages', () => {
  const s = [{ path: '/', status: null, role: 'content' }, { path: '/about/', status: null, role: 'content' }, { path: '/missing/', status: 404, role: 'error' }]
  const cmds = toolCommands({ sample: s, samplePageMap: '/o/sample.json', routePageMaps: ['/o/r0.json', '/o/r1.json', '/o/r2.json'], site: 'http://site', source: 'http://src', sourcePrefix: '/index.php', contract: '/c.json', spec: '/spec', contractPageIds: ['en-home', 'en-about', 'en-missing'], out: '/o', pass: passArgs(['visual-qa:--theme=/theme', 'functional:--search-word=groundwork']) })
  assert.deepEqual(Object.keys(cmds), TOOLS)
  const vqa = cmds['visual-qa'][0].argv
  assert.deepEqual(vqa.slice(vqa.indexOf('--pages'), vqa.indexOf('--pages') + 4), ['--pages', 'en-home,en-about,en-missing', '--stage', 'light-desktop'])
  assert.ok(!vqa.includes('--scope'), 'targeted-debug is --pages, not a --scope value')
  assert.deepEqual(vqa.slice(-2), ['--theme', '/theme'])
  assert.equal(cmds['layout-boxes'].length, 3)
  assert.deepEqual(cmds['layout-boxes'].map((c) => c.argv[c.argv.indexOf('--routes') + 1]), ['/o/r0.json', '/o/r1.json', '/o/r2.json'])
  assert.ok(cmds['layout-boxes'].every((c) => c.argv.includes('--contract') && c.argv[c.argv.indexOf('--source-prefix') + 1] === '/index.php'))
  assert.equal(cmds.motion.length, 1)
  assert.equal(cmds.motion[0].argv[cmds.motion[0].argv.indexOf('--routes') + 1], '/,/about/', 'the content pages, not the 404')
  assert.equal(cmds['http-parity'][0].argv[cmds['http-parity'][0].argv.indexOf('--routes') + 1], '/o/sample.json')
  assert.ok(cmds['http-parity'][0].argv.includes('--no-cache'))
  assert.deepEqual(cmds.functional[0].argv.slice(-2), ['--search-word', 'groundwork'])
  assert.throws(() => passArgs(['nothing:--x']), /expected <tool>:--flag/)
  // the flags that shape the reading are the preflight's: a --pass may not replace them
  for (const p of ['layout-boxes:--routes=/x.json', 'motion:--source=http://evil', 'visual-qa:--pages=a', 'http-parity:--out=/tmp/x', 'functional:--routes=/y.json']) assert.throws(() => passArgs([p]), /sets --[a-z-]+ for [a-z-]+ itself/, p)
})

test('preflight commands: under --source-prefix http-parity reads the source paths the census reads, paired to the site paths', () => {
  const s = [{ path: '/', status: null, role: 'content', entry: { path: '/', view: 'front-page' } }, { path: '/missing/', status: 404, role: 'error', entry: { route: '/missing/', view: '404' } }]
  assert.equal(httpParityInputs({ pages: [] }, s, ''), null, 'no prefix, nothing to carry')
  const hp = httpParityInputs({ site: 'x', pages: [] }, s, '/index.php')
  assert.deepEqual(hp.pageMap, { site: 'x', pages: [{ path: '/', view: 'front-page' }, { path: '/index.php/missing/', view: '404' }] })
  assert.deepEqual(hp.pairs, { pairs: [{ from: '/index.php/missing/', to: '/missing/', status: 404 }] })
  assert.equal(sourceUrlOf('http://src', '/index.php', '/missing/'), 'http://src' + sourcePathOf('/index.php', '/missing/'))
  const cmds = toolCommands({ sample: s, samplePageMap: '/o/sample.json', httpParityRoutes: '/o/hp.json', httpParityPairs: '/o/pairs.json', routePageMaps: ['/o/r0.json', '/o/r1.json'], site: 'http://site', source: 'http://src', sourcePrefix: '/index.php', out: '/o', tools: ['http-parity'] })
  const argv = cmds['http-parity'][0].argv
  assert.equal(argv[argv.indexOf('--routes') + 1], '/o/hp.json')
  assert.equal(argv[argv.indexOf('--pairs') + 1], '/o/pairs.json')
  // the report names the source path; the judge looks the sample route up by it
  const results = cleanResults()
  for (const e of results['http-parity'][0].report.routes) if (e.route !== '/') e.route = `/index.php${e.route}`
  const smp = sample().map((x) => ({ ...x, sourcePath: sourcePathOf('/index.php', x.path) }))
  assert.equal(judge({ sample: smp, census: REC['t4-headings'].census, results }).tools['http-parity'].verdict, 'trusted')
  assert.deepEqual(codes(judge({ sample: sample(), census: REC['t4-headings'].census, results }), 'http-parity'), ['http-parity-route-missing'])
})

test('preflight commands: none routes do not launch source-comparison tools; target functional checks still launch', () => {
  const calls = toolCommands({
    sample: [{ path: '/', role: 'content', referenceKind: 'none', entry: { path: '/' } }],
    samplePageMap: '/sample.json', routePageMaps: ['/route.json'], site: 'http://site.test', source: null,
    out: '/out', tools: ['layout-boxes', 'motion', 'http-parity', 'functional']
  })
  assert.deepEqual(Object.keys(calls), ['functional'])
  const verdict = judge({
    sample: [{ path: '/', role: 'content', referenceKind: 'none' }],
    census: { '/': { source: { notApplicable: true }, site: { status: 200 } } },
    results: {}, tools: ['layout-boxes', 'motion', 'http-parity']
  })
  assert.ok(Object.values(verdict.tools).every((v) => v.notApplicable?.status === 'not-applicable'))
  assert.equal(verdict.verdict, 'trusted', 'source-only tool obligations are explicit N/A')
})

test('preflight commands: mixed pages compare only source-bound routes while functional still reads every target route', () => {
  const sample = [
    { path: '/source/', role: 'content', referenceKind: 'html', entry: { path: '/source/' } },
    { path: '/brief/', role: 'content', referenceKind: 'none', entry: { path: '/brief/' } }
  ]
  const calls = toolCommands({
    sample, samplePageMap: '/sample.json', routePageMaps: ['/source.json', '/brief.json'], site: 'http://site.test', source: 'http://source.test',
    out: '/out', tools: ['layout-boxes', 'motion', 'functional']
  })
  assert.deepEqual(calls['layout-boxes'].map((c) => c.key), ['/source/'])
  assert.match(calls.motion[0].key, /^\/source\/$/)
  assert.ok(calls.functional, 'the target-only functional tool still runs')
})

test('preflight arguments: unknown, repeated, malformed and out-of-range values are refused before anything runs', () => {
  const ok = ['--routes', 'r.json', '--site', 'http://127.0.0.1:1', '--source', 'http://127.0.0.1:2', '--out', 'o', '--tools', 'motion']
  assert.equal(parseArgs(ok).site, 'http://127.0.0.1:1')
  assert.equal(parseArgs([...ok.slice(0, 2), '--site', 'http://127.0.0.1:1/', ...ok.slice(4)]).site, 'http://127.0.0.1:1', 'a trailing slash is the origin')
  const bad = [
    [['--nope', 'x'], /unknown argument/],
    [[...ok, '--site', 'http://x'], /given twice/],
    [[...ok, '--pages'], /needs a value/],
    [[...ok, '--pages', ''], /needs a value/],
    [ok.map((v) => (v === 'http://127.0.0.1:1' ? 'ftp://x' : v)), /http\(s\) origin/],
    [ok.map((v) => (v === 'http://127.0.0.1:1' ? 'http://x/path' : v)), /http\(s\) origin/],
    [ok.map((v) => (v === 'http://127.0.0.1:1' ? 'http://u:p@x' : v)), /http\(s\) origin/],
    [ok.map((v) => (v === 'http://127.0.0.1:1' ? 'not a url' : v)), /not a URL/],
    [[...ok, '--max-pages', '7'], /1 to 6/],
    [[...ok, '--max-pages', '0'], /1 to 6/],
    [[...ok, '--concurrency', '2.5'], /whole number/],
    [[...ok, '--timeout-ms', '-5'], /needs a value|whole number/],
    [[...ok, '--tool-timeout-ms', '10'], /from 1000/],
    [[...ok, '--discovery-limit', '100000'], /whole number/],
    [[...ok, '--source-prefix', 'index.php'], /a path like/],
    [[...ok, '--source-prefix', '/a/../b'], /a path like/],
    // percent-encoded dot segments, in either case, and any other percent-encoding: only the plain form is accepted
    [[...ok, '--source-prefix', '/%2e%2e/evil'], /no percent-encoding/],
    [[...ok, '--source-prefix', '/%2E%2E/evil'], /no percent-encoding/],
    [[...ok, '--source-prefix', '/.%2e/evil'], /no percent-encoding/],
    [[...ok, '--source-prefix', '/index%2Ephp'], /no percent-encoding/],
    [[...ok, '--source-prefix', '/./index.php'], /no dot segment/],
    [[...ok, '--source-prefix', '/index.php/'], /without a trailing slash/],
    [[...ok, '--source-prefix', '//evil.example'], /a path like/],
    [[...ok, '--pages', 'about'], /paths starting with/],
    [[...ok, '--pages', '//evil.example/'], /staying on the origin \(a path starting with \/\/ names another host\)/],
    [[...ok, '--pages', '/a/../b/'], /staying on the origin \(a dot segment/],
    [ok.map((v) => (v === 'motion' ? 'motion,motion' : v)), /twice/],
    [[...ok, '--runtime-containers', 'a;rm'], /container names/],
    [[...ok, '--runtime-containers', 'a', '--runtime-manifest', 'm.json'], /name the runtime once/],
    [['--verify', 'o', '--site', 'http://x'], /stands alone/],
    [ok.filter((v, i) => i > 1), /--routes is required/]
  ]
  for (const [argv, re] of bad) assert.throws(() => parseArgs(argv), re, argv.join(' '))
  assert.deepEqual(parseArgs(['--verify', 'o']), { verify: 'o' })
  assert.equal(parseArgs([...ok, '--source-prefix', '/index.php']).sourcePrefix, '/index.php')
  assert.equal(parseArgs([...ok, '--source-prefix', '/j6/index.php']).sourcePrefix, '/j6/index.php')
})

test('preflight inputs: links, FIFOs, directories, oversized and malformed files are refused before they are read; spec files may not escape the spec', () => {
  const dir = scratch('inputs')
  const good = path.join(dir, 'good.json')
  writeFileSync(good, '{"pages":[]}')
  assert.deepEqual(readInput(good), { pages: [] })
  symlinkSync(good, path.join(dir, 'link.json'))
  assert.throws(() => readInput(path.join(dir, 'link.json')), /symbolic link/)
  assert.throws(() => readInput(dir), /not a regular file/)
  const fifo = path.join(dir, 'fifo')
  if (spawnSync('mkfifo', [fifo]).status === 0) assert.throws(() => readInput(fifo), /not a regular file/, 'a FIFO would block the read')
  writeFileSync(path.join(dir, 'big.json'), 'x'.repeat(2048))
  assert.throws(() => readInput(path.join(dir, 'big.json'), { maxBytes: 1024 }), /beyond the 1024-byte bound/)
  writeFileSync(path.join(dir, 'bad.json'), '{"pages": [')
  assert.throws(() => readInput(path.join(dir, 'bad.json')), /not readable JSON/)
  assert.throws(() => readInput(path.join(dir, 'none.json')), /no such file/)
  // a spec file that is a link out of the spec is not hashed as the spec's
  const spec = path.join(dir, 'spec')
  mkdirSync(spec)
  writeFileSync(path.join(spec, 'page-map.json'), '{}')
  symlinkSync(good, path.join(spec, 'content.json'))
  const h = hashInputs({ routes: good, spec })
  assert.match(h['spec/page-map.json'].sha256, /^sha256:/)
  assert.match(h['spec/content.json'].error, /outside the spec|symbolic link/)
  // bytes that change between two hashings are named
  const before = hashInputs({ routes: good })
  writeFileSync(good, '{"pages":[1]}')
  assert.deepEqual(changedInputs(before, hashInputs({ routes: good })).map((x) => x.split(' ')[0]), ['routes'])
})

test('preflight runtime identity: a manifest must carry digests; docker inspect is read, never a tag turned into a digest', async () => {
  const d = `sha256:${'a'.repeat(64)}`
  assert.deepEqual(validateRuntimeManifest({ images: [{ name: 'web', image: 'wordpress:php8.3-apache', digest: d, provenance: 'docker inspect web' }] }), [{ name: 'web', image: 'wordpress:php8.3-apache', digest: d, provenance: 'docker inspect web' }])
  assert.throws(() => validateRuntimeManifest({ images: [{ name: 'web', image: 'wordpress:latest', digest: 'wordpress:latest', provenance: 'x' }] }), /not a tag, not inferred/)
  assert.throws(() => validateRuntimeManifest({ images: [{ name: 'web', image: 'x', digest: d }] }), /provenance must be/)
  assert.throws(() => validateRuntimeManifest({ images: [] }), /at least one image/)
  assert.throws(() => validateRuntimeManifest({ images: [{ name: 'a', image: 'x', digest: d, provenance: 'p' }, { name: 'a', image: 'y', digest: d, provenance: 'p' }] }), /listed twice/)
  const calls = []
  const docker = async (argv) => {
    calls.push(argv.join(' '))
    if (argv[1] === 'inspect' && argv.at(-1) === 'web') return { status: 0, stdout: JSON.stringify({ Image: d, Config: { Image: 'wordpress:php8.3-apache' } }), stderr: '' }
    if (argv[1] === 'image') return { status: 0, stdout: JSON.stringify([`wordpress@${d}`]), stderr: '' }
    return { status: 1, stdout: '', stderr: 'Error: No such container', error: null }
  }
  const got = await inspectContainers(['web', 'gone'], docker)
  assert.deepEqual(got.images, [{ name: 'web', image: 'wordpress:php8.3-apache', digest: d, repoDigests: [`wordpress@${d}`], provenance: 'docker inspect web (read-only)' }])
  assert.deepEqual(got.unresolved, ['runtime gone: docker inspect gave no image id (Error: No such container)'])
  assert.ok(calls.every((c) => / inspect /.test(c)), 'only inspect: nothing about the stand is changed')
  const tagOnly = await inspectContainers(['web'], async () => ({ status: 0, stdout: JSON.stringify({ Image: 'wordpress:latest', Config: { Image: 'wordpress:latest' } }), stderr: '' }))
  assert.deepEqual(tagOnly.images, [], 'a tag where the image id should be is not an identity')
})

test('preflight execBounded: a command past its deadline is killed with its group and reported', async () => {
  const t0 = Date.now()
  const r = await execBounded([process.execPath, '-e', 'setInterval(()=>{},1000)'], { timeoutMs: 500 })
  assert.equal(r.timedOut, true)
  assert.match(r.error, /timed out after 500 ms/)
  assert.ok(Date.now() - t0 < 5000)
  const missing = await execBounded(['/nonexistent/binary'])
  assert.ok(missing.error)
})

// ── controls, certification and the lock ─────────────────────────────────────────────────────────

test('preflight controls: a detector that always reads clean misses the defect; one that differs on identical inputs fails its control', () => {
  const expect = { detector: 'layout-boxes', measurement: 'our work#1' }
  const hit = { detector: 'layout-boxes', measurement: 'our work#1' }
  const ok = certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: [hit] }, expect })
  assert.deepEqual(ok, { certified: true, reasons: [] })
  const blind = certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: [] }, expect })
  assert.equal(blind.certified, false)
  assert.match(blind.reasons.join(), /defect-missed/)
  const noisy = certifyControl({ control: { site: { findings: [hit, { detector: 'layout-boxes', measurement: 'our method#1' }] } }, defect: { injected: true, findings: [hit, { detector: 'layout-boxes', measurement: 'our method#1' }] }, expect })
  assert.equal(noisy.certified, false)
  assert.match(noisy.reasons.join(), /control-not-clean/)
  assert.match(noisy.reasons.join(), /defect-unrelated: besides the defect, layout-boxes our method#1/)
  // a finding of another detector at the same place is unrelated too; a declared consequence is not
  assert.match(certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: [hit, { detector: 'motion', measurement: 'our work#1' }] }, expect }).reasons.join(), /defect-unrelated/)
  assert.equal(certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: [{ detector: 'dark-state', measurement: 'stable' }, { detector: 'dark-state', measurement: 'bgLater' }] }, expect: { detector: 'dark-state', measurement: 'stable', related: ['bgLater'] } }).certified, true)
  for (const [defect, re] of [
    [null, /defect-missing/],
    [{ notInjectable: 'no heading' }, /defect-not-injectable: no heading/],
    [{ injected: false, findings: [] }, /defect-not-injected/],
    [{ error: 'Timeout' }, /defect-not-measured/]
  ])
    assert.match(certifyControl({ control: { site: { findings: [] } }, defect, expect }).reasons.join(), re)
  assert.match(certifyControl({ control: { site: { findings: [] } }, defect: { injected: true, findings: [hit] }, expect: { detector: 'motion', measurement: null } }).reasons.join(), /defect-unlocated/)
  assert.match(certifyControl({ control: { site: { error: 'net::ERR' } }, defect: { injected: true, findings: [hit] }, expect }).reasons.join(), /control-not-measured/)
  assert.match(certifyControl({ control: {}, defect: { injected: true, findings: [hit] }, expect }).reasons.join(), /control-missing/)
})

test('preflight certification: a gate is certified only when every capability is covered and certified and its tools ran trusted', () => {
  const trusted = { verdict: 'trusted', tools: Object.fromEntries(TOOLS.map((t) => [t, { verdict: 'trusted' }])) }
  const caps = [
    { id: 'error-status', gate: 'status', state: 'covered' },
    { id: 'layout:a', gate: 'layout', state: 'covered' },
    { id: 'dark', gate: 'dark', state: 'covered' },
    { id: 'animation', gate: 'animation', state: 'not-applicable', reason: 'none seen' },
    { id: 'hidden', gate: 'hidden', state: 'not-applicable', reason: 'none seen' },
    { id: 'containers', gate: 'containers', state: 'not-applicable', reason: 'none' }
  ]
  const certs = { 'error-status': { certified: true, reasons: [] }, 'layout:a': { certified: true, reasons: [] }, dark: { certified: true, reasons: [] } }
  const all = certify({ capabilities: caps, probeCerts: certs, verdict: trusted })
  assert.equal(all.status, 'complete', JSON.stringify(all))
  assert.deepEqual(Object.keys(all.gates), Object.keys(GATES))
  assert.equal(all.gates.animation.status, 'not-applicable')
  const omitted = certify({ capabilities: caps, probeCerts: certs, verdict: trusted, tools: ['layout-boxes', 'visual-qa'] })
  assert.equal(omitted.gates.status.status, 'not-certified')
  assert.match(omitted.gates.status.reasons.join(), /tool http-parity was left out/)
  assert.equal(omitted.gates.layout.status, 'certified')
  const unknown = certify({ capabilities: [...caps.filter((c) => c.id !== 'dark'), { id: 'dark', gate: 'dark', state: 'unknown', reason: 'no hook' }], probeCerts: certs, verdict: trusted })
  assert.equal(unknown.gates.dark.status, 'not-certified')
  const failedProbe = certify({ capabilities: caps, probeCerts: { ...certs, dark: { certified: false, reasons: ['defect-missed: x'] } }, verdict: trusted })
  assert.match(failedProbe.gates.dark.reasons[0], /defect-missed/)
  const missingProbe = certify({ capabilities: caps, probeCerts: { 'error-status': certs['error-status'] }, verdict: trusted })
  assert.match(missingProbe.gates.layout.reasons[0], /no probe measured it/)
  for (const extra of [{ unresolved: ['runtime images: none'] }, { inputsChanged: ['routes (a → b)'] }, { late: true }, { verdict: { ...trusted, verdict: 'not-trusted' } }]) assert.equal(certify({ capabilities: caps, probeCerts: certs, verdict: trusted, ...extra }).status, 'partial', JSON.stringify(extra))
  assert.equal(certify({ capabilities: [], verdict: trusted }).gates.status.status, 'not-certified', 'nothing inventoried is not a pass')
})

const SRC_DOC = { url: 'http://src/', sha256s: [`sha256:${'2'.repeat(64)}`], statuses: [200] }
/** A sealed lock of a whole run and its artifacts in a fresh directory; `edit` changes the lock before it is sealed. */
function sealed(dir, { status = 'complete', fingerprint = `sha256:${'1'.repeat(64)}`, sequence = 1, artifacts = SEALED_ARTIFACTS, edit = (l) => l } = {}) {
  writeFileSync(path.join(dir, 'PREFLIGHT.json'), JSON.stringify({ lock: { fingerprint }, certification: { status } }))
  writeFileSync(path.join(dir, 'PREFLIGHT.md'), '# x\n')
  writeFileSync(path.join(dir, 'census.json'), '{}\n')
  writeFileSync(path.join(dir, 'sample.page-map.json'), '{"pages":[{"path":"/"}]}\n')
  writeFileSync(path.join(dir, 'routes.json'), '{"pages":[{"path":"/"}]}\n')
  const sha = (f) => `sha256:${createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex')}`
  const lock = edit({
    schema: LOCK_SCHEMA,
    complete: true,
    epoch: { fingerprint, sequence, previous: null, changed: null },
    tool: { commit: 'a'.repeat(40), dirty: false, files: { 'scripts/visual/preflight.mjs': `sha256:${'3'.repeat(64)}` }, changedDuringRun: [] },
    browser: { engine: 'chromium', version: '140.0.0.0', playwright: '1.63.0' },
    runtime: { from: 'manifest', images: [{ name: 'web', image: 'x', digest: `sha256:${'4'.repeat(64)}`, provenance: 'test' }] },
    inputs: { files: { routes: { path: path.join(dir, 'routes.json'), sha256: sha('routes.json') } }, changedDuringRun: [] },
    source: { documents: [SRC_DOC], stylesheets: [] },
    certification: { status, reasons: status === 'complete' ? [] : ['gate(s) not certified: layout'] },
    artifacts: Object.fromEntries(artifacts.map((a) => [a, sha(a)])),
    unresolved: []
  })
  lock.digest = lockDigest(lock)
  writeFileSync(path.join(dir, LOCK_FILE), JSON.stringify(lock, null, 2))
  return lock
}
const SAME_SOURCE = { [SRC_DOC.url]: { sha256: SRC_DOC.sha256s[0], status: 200 } }

test('preflight lock: sealed, read back only whole — a truncated, edited, unfinished or foreign lock is refused', () => {
  const dir = scratch('lock')
  const lock = sealed(dir)
  assert.deepEqual(readLock(path.join(dir, LOCK_FILE)), lock)
  assert.equal(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}')
  const text = readFileSync(path.join(dir, LOCK_FILE), 'utf8')
  const bad = (name, content) => {
    const f = path.join(dir, name)
    writeFileSync(f, content)
    return f
  }
  assert.throws(() => readLock(bad('truncated.json', text.slice(0, text.length / 2))), /not readable JSON/)
  assert.throws(() => readLock(bad('edited.json', text.replace('"complete"', '"complete "'))), /seal does not match|not marked complete|schema/)
  const edited = { ...lock, certification: { status: 'complete', reasons: [] }, epoch: { ...lock.epoch, sequence: 9 } }
  assert.throws(() => readLock(bad('edited2.json', JSON.stringify(edited))), /seal does not match/)
  const unfinished = { ...lock, complete: false }
  unfinished.digest = lockDigest(unfinished)
  assert.throws(() => readLock(bad('unfinished.json', JSON.stringify(unfinished))), /not marked complete/)
  const foreign = { ...lock, schema: 'other/1' }
  foreign.digest = lockDigest(foreign)
  assert.throws(() => readLock(bad('foreign.json', JSON.stringify(foreign))), /schema/)
})

test('preflight lock: epochs — the same tools keep the epoch, changed measuring code or dependencies start the next; a run is accepted only whole, complete and current', () => {
  const files = toolFiles()
  assert.ok(files['scripts/visual/preflight.mjs'] && files['scripts/visual/layout-boxes.mjs'] && files['scripts/lib/motion.mjs'] && files['package-lock.json'], 'the measuring code and its dependencies are in the fingerprint')
  const browser = { engine: 'chromium', version: '140.0.0.0' }
  const fp = toolFingerprint({ files, playwright: '1.63.0', browser })
  assert.equal(toolFingerprint({ files: { ...files }, playwright: '1.63.0', browser }), fp, 'the same tools, the same epoch')
  assert.notEqual(toolFingerprint({ files: { ...files, 'scripts/visual/layout-boxes.mjs': 'sha256:changed' }, playwright: '1.63.0', browser }), fp)
  assert.notEqual(toolFingerprint({ files: { ...files, 'package-lock.json': 'sha256:changed' }, playwright: '1.63.0', browser }), fp)
  assert.notEqual(toolFingerprint({ files, playwright: '1.64.0', browser }), fp)
  assert.notEqual(toolFingerprint({ files, playwright: '1.63.0', browser: { ...browser, version: '141.0.0.0' } }), fp)
  const first = epochOf(fp)
  assert.deepEqual(first, { fingerprint: fp, sequence: 1, previous: null, changed: null })
  const prior = { epoch: first, digest: 'sha256:prior' }
  assert.deepEqual(epochOf(fp, prior), { fingerprint: fp, sequence: 1, previous: { fingerprint: fp, sequence: 1, digest: 'sha256:prior' }, changed: false })
  assert.equal(epochOf('sha256:new', prior).sequence, 2)
  assert.equal(epochOf('sha256:new', prior).changed, true)
  // verifyRun
  const dir = scratch('verify')
  sealed(dir, { fingerprint: fp })
  assert.deepEqual(verifyRun(dir, { fingerprint: fp, sourceNow: SAME_SOURCE }).reasons, [])
  assert.match(verifyRun(dir, { fingerprint: 'sha256:other', sourceNow: SAME_SOURCE }).reasons.join(), /stale epoch/)
  assert.match(verifyRun(dir, { sourceNow: SAME_SOURCE }).reasons.join(), /epoch is not confirmed/)
  // the source and the inputs as they are now
  assert.match(verifyRun(dir, { fingerprint: fp }).reasons.join(), /source was not read again/)
  assert.match(verifyRun(dir, { fingerprint: fp, sourceNow: { [SRC_DOC.url]: { sha256: `sha256:${'9'.repeat(64)}` } } }).reasons.join(), /serves other bytes than the lock recorded/)
  assert.match(verifyRun(dir, { fingerprint: fp, sourceNow: { [SRC_DOC.url]: { error: 'ECONNREFUSED' } } }).reasons.join(), /not read again \(ECONNREFUSED\)/)
  // the same bytes under another status: a declared 404 the source now answers 200 is not the page measured
  assert.match(verifyRun(dir, { fingerprint: fp, sourceNow: { [SRC_DOC.url]: { sha256: SRC_DOC.sha256s[0], status: 404 } } }).reasons.join(), /answers 404 now, the lock recorded 200/)
  writeFileSync(path.join(dir, 'routes.json'), '{"pages":[{"path":"/"},{"path":"/b/"}]}\n')
  assert.match(verifyRun(dir, { fingerprint: fp, sourceNow: SAME_SOURCE }).reasons.join(), /input routes .*: changed since the lock/)
  writeFileSync(path.join(dir, 'PREFLIGHT.md'), '# changed\n')
  assert.match(verifyRun(dir, { fingerprint: fp, sourceNow: SAME_SOURCE }).reasons.join(), /PREFLIGHT.md: changed since the lock sealed it/)
  const partial = scratch('verify-partial')
  sealed(partial, { status: 'partial', fingerprint: fp })
  assert.match(verifyRun(partial, { fingerprint: fp, sourceNow: SAME_SOURCE }).reasons.join(), /certification is partial/)
  assert.equal(verifyRun(scratch('verify-empty')).ok, false, 'no lock, no run')
  // a lock that seals less than a whole run, or an identity with a hole, is not accepted
  for (const [name, opts, re] of [
    ['no-census', { artifacts: ['PREFLIGHT.json', 'PREFLIGHT.md', 'sample.page-map.json'] }, /seals no census\.json/],
    ['no-sample', { artifacts: ['PREFLIGHT.json', 'PREFLIGHT.md', 'census.json'] }, /seals no sample\.page-map\.json/],
    ['unresolved', { edit: (l) => ({ ...l, unresolved: ['runtime images: none'] }) }, /unresolved identity: runtime images/],
    ['no-runtime', { edit: (l) => ({ ...l, runtime: { from: null, images: [] } }) }, /no runtime image digests/],
    ['no-browser', { edit: (l) => ({ ...l, browser: null }) }, /names no browser/],
    ['no-commit', { edit: (l) => ({ ...l, tool: { ...l.tool, commit: null } }) }, /names no tool commit/],
    ['no-status', { edit: (l) => ({ ...l, source: { documents: [{ url: SRC_DOC.url, sha256s: SRC_DOC.sha256s }], stylesheets: [] } }) }, /records no status, not one HTTP status/],
    ['two-statuses', { edit: (l) => ({ ...l, source: { documents: [{ ...SRC_DOC, statuses: [404, 200] }], stylesheets: [] } }) }, /statuses 404\/200, not one HTTP status/],
    ['two-bodies', { edit: (l) => ({ ...l, source: { documents: [{ ...SRC_DOC, sha256s: [...SRC_DOC.sha256s, `sha256:${'5'.repeat(64)}`] }], stylesheets: [] } }) }, /more than one body/],
    ['tool-changed', { edit: (l) => ({ ...l, tool: { ...l.tool, changedDuringRun: ['tool file scripts/visual/motion.mjs (a → b)'] } }) }, /changed while the run measured/],
    ['foreign-artifact', { edit: (l) => ({ ...l, artifacts: { ...l.artifacts, '../elsewhere.json': 'sha256:x' } }) }, /not an artifact of this directory/]
  ]) {
    const d = scratch(`verify-${name}`)
    sealed(d, { fingerprint: fp, ...opts })
    const v = verifyRun(d, { fingerprint: fp, sourceNow: SAME_SOURCE })
    assert.equal(v.ok, false, name)
    assert.match(v.reasons.join('; '), re, name)
  }
})

test('preflight writeAtomic: a file is written whole or not at all, and never over existing evidence', () => {
  const dir = scratch('atomic')
  const f = path.join(dir, 'PREFLIGHT.json')
  writeAtomic(f, '{"a":1}\n')
  assert.equal(readFileSync(f, 'utf8'), '{"a":1}\n')
  assert.throws(() => writeAtomic(f, '{"a":2}\n'), /EEXIST/)
  assert.equal(readFileSync(f, 'utf8'), '{"a":1}\n', 'the first writer keeps its evidence')
  assert.deepEqual(readdirSync(dir), ['PREFLIGHT.json'], 'no temporary file is left behind')
})

// ── the recorded misreads ────────────────────────────────────────────────────────────────────────

test('preflight judge: a clean reading of every tool is trusted', () => {
  const v = judge({ sample: sample(), census: REC['t4-headings'].census, results: cleanResults() })
  assert.equal(v.verdict, 'trusted', JSON.stringify(v.tools, null, 1))
})

test('preflight judge: T4 section headings missed by layout-boxes (1 of 10 paired) is named', () => {
  const results = cleanResults()
  results['layout-boxes'][0].report = REC['t4-headings'].layoutBoxes
  const v = judge({ sample: sample(), census: REC['t4-headings'].census, results })
  assert.equal(v.verdict, 'not-trusted')
  assert.equal(v.tools['layout-boxes'].verdict, 'misread')
  assert.deepEqual(codes(v, 'layout-boxes'), ['layout-boxes-headings-missed'])
  assert.match(v.tools['layout-boxes'].reasons[0].detail, /1 heading\(s\) paired, the census finds 10/)
})

test('preflight judge: 0 reveals where the page reveals a dozen elements on scroll is named, per side and per content page', () => {
  const results = cleanResults()
  results.motion[0].report = REC.reveals.motion
  const v = judge({ sample: sample(), census: REC.reveals.census, results })
  assert.deepEqual(codes(v, 'motion'), ['motion-reveals-missed'])
  assert.match(v.tools.motion.reasons[0].detail, /0 reveals on the site, while 12 element/)
  // the same zero on a page that reveals nothing is a correct reading
  const quiet = judge({ sample: sample(), census: REC['t4-headings'].census, results: { ...results, motion: [{ key: '/', run: R.ok, report: { results: [{ route: '/', source: { reveals: 0 }, site: { reveals: 0 }, rows: [] }] } }] } })
  assert.equal(quiet.tools.motion.verdict, 'trusted')
  // a second content page is judged too: missing from the report is not a pass
  const two = [...sample(), { path: '/about/', status: null, view: 'page', role: 'content', contractId: 'en-about' }]
  const census = { ...REC['t4-headings'].census, '/about/': REC['t4-headings'].census['/'] }
  assert.deepEqual(codes(judge({ sample: two, census, results: cleanResults(), tools: ['motion'] }), 'motion'), ['motion-route-missing'])
})

test('preflight judge: a declared 404 failed on its status in four tools while the census reads 404 is named in each', () => {
  const x = REC['status-404']
  const results = cleanResults()
  results.functional[0].report = x.functional
  results['http-parity'][0].report = x.httpParity
  results['layout-boxes'][1] = { key: '/missing-page/', run: { ...R.usage, stderrTail: x.layoutBoxesStderr }, report: null }
  results['visual-qa'][0].report = x.visualQa
  const v = judge({ sample: sample(), census: x.census, results })
  assert.deepEqual(codes(v, 'functional'), ['functional-status-misread'])
  assert.deepEqual(codes(v, 'http-parity'), ['http-parity-status-misread'])
  assert.deepEqual(codes(v, 'layout-boxes'), ['layout-boxes-status-misread'])
  assert.deepEqual(codes(v, 'visual-qa'), ['visual-qa-status-misread'])
  // when the site really answers 200 where 404 is declared, the tools read it right: a finding, not a misread
  const real = structuredClone(x.census)
  real['/missing-page/'].site.status = 200
  const w = judge({ sample: sample(), census: real, results })
  assert.equal(w.tools.functional.verdict, 'trusted')
  assert.equal(w.tools['visual-qa'].verdict, 'trusted')
  assert.equal(w.tools['http-parity'].verdict, 'trusted')
  assert.ok(w.tools['http-parity'].findings >= 1)
})

test('preflight judge: every block differing is a misread when the page differs from itself, real when it does not, and blocks when unverified — the control of each route is its own', () => {
  const x = REC['all-differ']
  const results = cleanResults()
  results['layout-boxes'][0].report = x.layoutBoxes
  const run = (report) => ({ run: R.findings, report })
  const unstable = judge({ sample: sample(), census: x.census, results, controls: { site: run(x.controlUnstable), source: run(x.controlClean) } })
  assert.deepEqual(codes(unstable, 'layout-boxes'), ['layout-boxes-self-differs'])
  const real = judge({ sample: sample(), census: x.census, results, controls: { '/': { site: run(x.controlClean), source: run(x.controlClean) } } })
  assert.equal(real.tools['layout-boxes'].verdict, 'trusted')
  assert.equal(real.tools['layout-boxes'].findings, 12, 'the twelve differences are kept')
  assert.match(real.tools['layout-boxes'].notes[0], /differences of the theme, kept as findings/)
  const unverified = judge({ sample: sample(), census: x.census, results, controls: { site: { run: { ...R.ok, timedOut: true }, report: null }, source: run(x.controlClean) } })
  assert.deepEqual(codes(unverified, 'layout-boxes'), ['layout-boxes-all-differ-unverified'])
  assert.equal(unverified.verdict, 'not-trusted')
  // another route's clean control does not vouch for this one
  const elsewhere = judge({ sample: sample(), census: x.census, results, controls: { '/other/': { site: run(x.controlClean), source: run(x.controlClean) } } })
  assert.deepEqual(codes(elsewhere, 'layout-boxes'), ['layout-boxes-all-differ-unverified'])
})

test('preflight judge: no reading is never a pass — timeout, crash, missing report, missing route, census that failed (the declared 404 too)', () => {
  const results = cleanResults()
  results.motion[0].run = { ...R.ok, timedOut: true, status: null, signal: 'SIGKILL' }
  results.functional[0].run = { ...R.ok, status: null, signal: 'SIGSEGV' }
  results['http-parity'][0].report = null
  results['visual-qa'][0].report = { summary: {}, pages: [] }
  const v = judge({ sample: sample(), census: REC['t4-headings'].census, results })
  assert.deepEqual(codes(v, 'motion'), ['motion-timeout'])
  assert.deepEqual(codes(v, 'functional'), ['functional-crashed'])
  assert.deepEqual(codes(v, 'http-parity'), ['http-parity-no-report'])
  assert.deepEqual(codes(v, 'visual-qa'), ['visual-qa-page-missing', 'visual-qa-page-missing'])
  const census = structuredClone(REC['t4-headings'].census)
  census['/'].source = { status: 0, error: 'net::ERR_CONNECTION_REFUSED' }
  const c = judge({ sample: sample(), census, results: cleanResults() })
  assert.equal(c.verdict, 'not-trusted')
  assert.ok(codes(c, 'layout-boxes').includes('census-failed'))
  assert.deepEqual(judge({ sample: sample(), census, results: {}, tools: ['motion'] }).tools.motion.reasons.map((r) => r.code), ['motion-not-run'])
  // a census that could not read one side of the declared 404 while every tool reads it cleanly
  const on404 = structuredClone(REC['t4-headings'].census)
  on404['/missing-page/'].site = { status: 0, error: 'page.goto: Timeout 30000ms exceeded' }
  const e = judge({ sample: sample(), census: on404, results: cleanResults() })
  assert.ok(Object.values(e.tools).every((t) => t.verdict === 'trusted'))
  assert.equal(e.verdict, 'not-trusted')
  assert.deepEqual(e.reasons.map((r) => r.code), ['census-failed'])
  assert.match(e.reasons[0].detail, /\/missing-page\/: the census could not read the site \(page\.goto: Timeout/)
  assert.deepEqual(judge({ sample: sample(), census: REC['t4-headings'].census, results: cleanResults() }).reasons, [])
})

test('preflight judge: a sample page layout-boxes or motion could not load, and the census could not confirm, is not measured — never trusted', () => {
  const census = structuredClone(REC['t4-headings'].census)
  census['/'].site = { status: 0, error: 'net::ERR_CONNECTION_REFUSED' }
  const results = cleanResults()
  results['layout-boxes'][0] = { key: '/', run: { ...R.usage, stderrTail: 'layout-boxes: not measured — site http://127.0.0.1:1/ did not load' }, report: null }
  results.motion[0].report = { results: [{ route: '/', error: 'site did not load: net::ERR_CONNECTION_REFUSED', rows: [] }] }
  const v = judge({ sample: sample(), census, results, tools: ['layout-boxes', 'motion'] })
  assert.equal(v.verdict, 'not-trusted')
  assert.equal(v.tools['layout-boxes'].verdict, 'failed')
  assert.deepEqual(codes(v, 'layout-boxes'), ['layout-boxes-not-measured'])
  assert.equal(v.tools.motion.verdict, 'failed')
  assert.deepEqual(codes(v, 'motion'), ['motion-not-measured'])
  // a route answering what is not declared (a 200 where 404 is declared) stops layout-boxes: not measured either
  const x = REC['status-404']
  const real = structuredClone(x.census)
  real['/missing-page/'].site.status = 200
  const r2 = cleanResults()
  r2['layout-boxes'][1] = { key: '/missing-page/', run: { ...R.usage, stderrTail: x.layoutBoxesStderr }, report: null }
  assert.deepEqual(codes(judge({ sample: sample(), census: real, results: r2, tools: ['layout-boxes'] }), 'layout-boxes'), ['layout-boxes-not-measured'])
})

test('preflight runTool: a timeout kills the whole process group, the grandchild too', async () => {
  const dir = scratch('run')
  const pidFile = path.join(dir, 'grandchild.pid')
  const script = `const {spawn}=require('node:child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setInterval(()=>{},1000)`
  const r = await runTool([process.execPath, '-e', script], { timeoutMs: 1500, logDir: dir, name: 'sleeper' })
  assert.equal(r.timedOut, true)
  const pid = Number(readFileSync(pidFile, 'utf8'))
  await new Promise((res) => setTimeout(res, 300))
  assert.throws(() => process.kill(pid, 0), /ESRCH/, 'the grandchild is gone')
  assert.ok(existsSync(path.join(dir, 'sleeper.stderr.log')))
  const missing = await runTool(['/nonexistent/binary'], { timeoutMs: 5000, logDir: dir, name: 'missing' })
  assert.ok(missing.error, 'a child that cannot start is an error, not a reading')
})

// ── live: the five tools and the capability probes against an HTTP source and site ─────────────

test('preflight controls: a control that differs names the page, the side and each difference with its two readings — bounded, never a code alone (#57)', () => {
  const expect = { detector: 'hidden-content', measurement: 'scroll-revealed' }
  const hit = { detector: 'hidden-content', measurement: 'scroll-revealed' }
  const diff = { detector: 'hidden-content', measurement: 'scroll-revealed', detail: '4 → 3: main > div > section:nth-of-type(5) > div "Words of part 4" opacity 1 → 0' }
  const r = certifyControl({ page: '/services/', control: { source: { findings: [diff] } }, defect: { injected: true, findings: [hit] }, expect })
  assert.deepEqual(r, { certified: false, reasons: ['control-not-clean: the source read against itself differs on /services/ at hidden-content scroll-revealed (4 → 3: main > div > section:nth-of-type(5) > div "Words of part 4" opacity 1 → 0)'] })
  // the layout detector keeps each property with both readings, not only its name
  const lay = layoutFindings({ rows: [{ text: 'our work#1', deltas: [['font-size', '32px', '44px'], ['panel', null, 'Card']] }], onlySource: ['our method#1'], onlySite: [] })
  assert.deepEqual(lay.map((f) => f.detail), ['font-size 32px → 44px; panel null → Card', 'in the first reading only'])
  assert.match(certifyControl({ page: '/', control: { site: { findings: lay } }, defect: { injected: true, findings: [] }, expect }).reasons[0], /differs on \/ at layout-boxes our work#1 \(font-size 32px → 44px; panel null → Card\), layout-boxes-pairing our method#1 \(in the first reading only\)/)
  // a finding without a detail, one that is not an object, and more than the bound stay readable
  const many = [{ detector: 'dark-state', measurement: 'stable' }, 'junk', null, { detector: 'motion' }, { measurement: 'x' }]
  assert.equal(namedFindings(many), 'dark-state stable, (an unreadable finding), (an unreadable finding), and 2 more')
  assert.equal(namedFindings([{ detector: 'motion' }, { measurement: 'x' }]), 'motion (no measurement), (no detector) x')
  assert.equal(namedFindings(undefined), '')
  assert.match(certifyControl({ control: { site: { findings: 'nope' } }, defect: { injected: true, findings: [hit] }, expect }).reasons.join(), /control-not-measured: the site read against itself gave no readable findings/)
  assert.match(certifyControl({ control: { site: { findings: [] } }, defect: { injected: true }, expect }).reasons.join(), /defect-not-measured: the reading with the defect gave no readable findings/)
  // hostile or oversized text cannot break the reason: control characters folded, every field cut
  const hostile = { detector: 'layout-boxes', measurement: `h2\n| injected |\u2028${'x'.repeat(5000)}`, detail: `a\u0000b\r\n${'y'.repeat(5000)}` }
  const [reason] = certifyControl({ page: `/p\n${'z'.repeat(500)}`, control: { site: { findings: [hostile] } }, defect: { injected: true, findings: [hit] }, expect }).reasons
  assert.doesNotMatch(reason, /[\u0000-\u001f\u2028]/)
  assert.ok(reason.length < 200 + 160 + REASON_BOUNDS.field + 200, String(reason.length))
  assert.equal(reasonText('a\tb\u0085c', 3), 'a …')
  // a clean control and a caught defect are certified exactly as before
  assert.deepEqual(certifyControl({ page: '/', control: { source: { findings: [] }, site: { findings: [] } }, defect: { injected: true, findings: [hit] }, expect }), { certified: true, reasons: [] })
})

test('preflight hidden content: a reading whose reveals never settled is not measured — counts that agree do not certify it (#57 review)', () => {
  const read = (settled, waitedMs = 4000) => ({ scroll: { hidden: 3, revealed: 3, settled, waitedMs, elements: [], more: 0 }, toggles: [] })
  // the counts agree, so the detector reports nothing: the reading itself has to say it is not one
  assert.deepEqual(hiddenFindings(read(false), read(false)).filter((f) => f.measurement.startsWith('scroll')), [])
  assert.equal(hiddenUnsettled(read(false)), 'had scroll reveals still changing after 4000 ms')
  assert.equal(hiddenUnsettled(read(true, 300)), null)
  assert.equal(hiddenUnsettled({ scroll: { hidden: 0, revealed: 0 } }), null, 'a reading from before the settle field is judged by its counts, as before')
  assert.equal(hiddenUnsettled(null), null)
  const expect = { detector: 'hidden-content', measurement: 'scroll-revealed' }
  const r = certifyControl({ page: '/services/', control: { source: { unsettled: 'the second reading had scroll reveals still changing after 4000 ms' } }, defect: { injected: true, findings: [expect] }, expect })
  assert.deepEqual(r, { certified: false, reasons: ['control-not-measured: the source read against itself never settled on /services/ (the second reading had scroll reveals still changing after 4000 ms)'] })
})

test('preflight hidden content: a scroll count that differs names each element read otherwise, its opacity in both readings, and a read that had not settled; equal counts are clean as before (#57)', () => {
  const el = (n, opacity, extra = {}) => ({ selector: `main > section:nth-of-type(${String(n)}) > div`, words: `Part ${String(n)}`, opacity, revealed: opacity >= 0.5, ...extra })
  const read = (elements, extra = {}) => ({ scroll: { hidden: elements.length, revealed: elements.filter((e) => e.revealed).length, settled: true, waitedMs: 300, elements, more: 0, ...extra }, toggles: [{ key: '#more-1', revealed: true }] })
  const a = read([el(2, 1), el(3, 1), el(4, 1)])
  assert.deepEqual(hiddenFindings(a, structuredClone(a)), [])
  const b = read([el(2, 1), el(3, 0.3), el(4, 1)], { settled: false, waitedMs: 4000 })
  assert.deepEqual(hiddenFindings(a, b), [{ detector: 'hidden-content', measurement: 'scroll-revealed', detail: '3 → 2: main > section:nth-of-type(3) > div "Part 3" opacity 1 → 0.3; the second reading\'s reveals had not settled after 4000 ms' }])
  // an element transparent at load in one reading only is named on its side
  const c = read([el(2, 1), el(3, 1)])
  assert.deepEqual(hiddenFindings(a, c).map((f) => f.detail), [
    '3 → 2: main > section:nth-of-type(4) > div "Part 4" transparent at load in the first reading only',
    '3 → 2: main > section:nth-of-type(4) > div "Part 4" transparent at load in the first reading only'
  ])
  // two elements swapping their reveal leave the counts equal: not a difference, as before
  assert.deepEqual(hiddenFindings(read([el(2, 1), el(3, 0)]), read([el(2, 0), el(3, 1)])), [])
  // more rows than are named are counted; readings of an older shape (no elements) stay readable
  const wide = read(Array.from({ length: 9 }, (_, i) => el(i + 2, 1)))
  const dim = read(Array.from({ length: 9 }, (_, i) => el(i + 2, 0)))
  assert.match(hiddenFindings(wide, dim)[0].detail, /opacity 1 → 0; and 4 more$/)
  assert.deepEqual(hiddenFindings({ scroll: { hidden: 3, revealed: 3 }, toggles: [] }, { scroll: { hidden: 3, revealed: 2 }, toggles: [] }).map((f) => f.detail), ['3 → 2: no element read differently'])
  // toggles are compared by key, as before
  assert.deepEqual(hiddenFindings(a, { ...structuredClone(a), toggles: [{ key: '#more-1', revealed: false }] }).map((f) => [f.measurement, f.detail]), [['toggle:#more-1', 'true → false']])
})

test('preflight report: reasons quoting pages and elements cannot break PREFLIGHT.md — cells, code and markup are escaped', () => {
  assert.equal(mdText('a|b `c` <script> *d* [e](f) \\ g\nh'), 'a\\|b \\`c\\` \\<script\\> \\*d\\* \\[e\\](f) \\\\ g h')
  const reason = 'hidden:scroll: not certified — control-not-clean: the source read against itself differs on / at hidden-content scroll-revealed (4 → 3: main > div "a | b <img src=x>" opacity 1 → 0)'
  const md = formatMarkdown({ verdict: 'trusted', sample: [], site: 's', source: 'r', tools: {}, reasons: [], certification: { status: 'partial', reasons: ['gate(s) not certified: hidden'], gates: { hidden: { status: 'not-certified', reasons: [reason] } } }, census: {} })
  const row = md.split('\n').find((l) => l.startsWith('| hidden |'))
  assert.equal(row.split(/(?<!\\)\|/).length, 5, 'the reason stays inside its cell')
  assert.match(row, /main \\> div "a \\\| b \\<img src=x\\>" opacity 1 → 0/)
  const none = formatMarkdown({
    verdict: 'trusted', sample: [{ path: '/', role: 'content', referenceKind: 'none' }], site: 'site', source: null,
    tools: { 'http-parity': { verdict: 'trusted', findings: 0, reasons: [], notes: [], notApplicable: { status: 'not-applicable', reason: 'the sample has only reference.kind=none pages' } } },
    reasons: [], census: { '/': { source: { notApplicable: true, reason: 'reference.kind=none' }, site: { status: 200, headings: [], texts: [], links: 0, reveals: { revealed: 0, hidden: 0 } } } }
  })
  assert.match(none, /http-parity \| not-applicable/)
  assert.match(none, /`\/` source: NOT APPLICABLE — reference.kind=none/)
})

const REVEAL = ({ delay = false, hold = false } = {}) =>
  `<!doctype html><html lang="en"><head><style>body{margin:0;font-family:Arial}section{padding:24px}.fx{opacity:0;transition:opacity ${delay ? '.8s linear 1.2s' : '.15s'}}.fx.in{opacity:1}</style><script>addEventListener("DOMContentLoaded",()=>{const all=[...document.querySelectorAll(".fx")];const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting&&!(${String(hold)}&&e.target===all[all.length-1]))e.target.classList.add("in")}));all.forEach((el)=>io.observe(el))})</script></head><body><header><nav><a href="/">Home</a></nav></header><main><div><section><h1>Top</h1><p>Intro words here.</p></section>${[1, 2, 3, 4].map((i) => `<section><h2>Part ${String(i)}</h2><div class="fx" style="margin-top:700px"><p>Words of part ${String(i)} to read.</p></div></section>`).join('')}</div></main></body></html>`

test('preflight hidden content live: a delayed reveal is read once it settles — whole on every read, the control clean; a page that reveals otherwise on the next load names the element, the page and both readings (#57)', async () => {
  let loads = 0
  const src = await serve({ '/': REVEAL({ delay: true }) })
  const other = await serve({ '/': REVEAL() })
  const browser = lazyBrowser()
  try {
    const ctx = { browser: await browser.get(), hooks: { light: { site: null, source: null }, dark: null, check: null }, site: other.origin, source: src.origin, sourcePrefix: '', deadline: Date.now() + 240000, probeTimeoutMs: 90000, log: resourceLog(), extraReasons: {} }
    const s = { path: '/', covers: ['hidden:scroll'] }
    // the entrance ends 2 s after its element is reached: counted 1.2 s after the scroll it was half-way
    const late = await probeHidden(ctx, s)
    assert.deepEqual([late.readings.source.scroll.hidden, late.readings.source.scroll.revealed, late.readings.source.scroll.settled], [4, 4, true])
    assert.deepEqual(late.out.controls, { source: { findings: [] }, site: { findings: [] } })
    assert.deepEqual(late.out.certified['hidden:scroll'], { certified: true, reasons: [] }, 'the defect is still caught')
    // every second load keeps the last part transparent: the control names it
    src.set({ '/': () => REVEAL({ hold: loads++ % 2 === 1 }) })
    const flaky = await probeHidden(ctx, s)
    const [reason] = flaky.out.certified['hidden:scroll'].reasons
    assert.equal(reason, 'control-not-clean: the source read against itself differs on / at hidden-content scroll-revealed (4 → 3: main > div > section:nth-of-type(5) > div "Words of part 4 to read." opacity 1 → 0)')
    assert.equal(flaky.out.controls.source.findings[0].detail, '4 → 3: main > div > section:nth-of-type(5) > div "Words of part 4 to read." opacity 1 → 0')
  } finally {
    await browser.close()
    await src.close()
    await other.close()
  }
})

const PARAS = (n, tag) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${String(i)} of ${tag} carries enough words to be read as text.</p>`).join('')
const SECTIONS = ['Our work', 'Our method', 'Our people', 'Our places']
const AOS_STUB = '<script>addEventListener("DOMContentLoaded",()=>{const io=new IntersectionObserver((es)=>es.forEach((e)=>e.isIntersecting&&e.target.classList.add("aos-animate")));document.querySelectorAll("[data-aos]").forEach((el)=>io.observe(el))})</script>'
/** The container grid of the fixture: `.container` on the source, `.wrap` on the site, stepping at 768 and 1200. */
const grid = (cls, steps = true) =>
  `.${cls}{box-sizing:border-box;width:100%;margin:0 auto;padding:0 12px}${
    Array.isArray(steps) ? steps.map((w) => `@media (min-width: ${String(w)}px){.${cls}{max-width:${String(w - 40)}px}}`).join('') : steps ? `@media (min-width: 768px){.${cls}{max-width:720px}}@media (min-width: 1200px){.${cls}{max-width:1140px}}` : ''
  }`
/**
 * One page of the fixture: `site` pages carry the body class and identity visual-qa reads. `aos`
 * draws the sections' words through an AOS-marked reveal (the library motion recognises); `reveal`
 * through an IntersectionObserver fade no library marks; `toggle` adds a button over a hidden region;
 * `dark: false` leaves out the script that applies the stored theme.
 */
function page({ site = false, h2 = 32, paint = 'rgb(255, 255, 255)', reveal = false, random = false, aos = false, toggle = false, dark = true, grid: steps = true } = {}) {
  const box = site ? 'wrap' : 'container'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(255,255,255)} html[data-theme=dark] body{background:rgb(16,18,20);color:rgb(236,234,228)}
main{padding:40px 0} h1{font-size:40px;line-height:44px;margin:0 0 16px} h2{font-size:${String(h2)}px;line-height:40px;margin:0} p{font-size:16px;line-height:24px}
section{padding:24px;background:${paint}} a{color:rgb(20,72,58)} .fx{opacity:0;transition:opacity .15s} .fx.in{opacity:1}
[data-aos]{opacity:0;transition:opacity .15s} [data-aos].aos-animate{opacity:1} ${grid(box, steps)}
</style>
${dark ? "<script>try{const m=document.cookie.match(/tracy_theme=(dark|light)/);if(m){document.documentElement.setAttribute('data-theme',m[1])}}catch(e){}</script>" : ''}
${reveal ? '<script>addEventListener("DOMContentLoaded",()=>{const io=new IntersectionObserver((es)=>es.forEach((e)=>e.isIntersecting&&e.target.classList.add("in")));document.querySelectorAll(".fx").forEach((el)=>io.observe(el))})</script>' : ''}
${aos ? AOS_STUB : ''}
${random ? '<script>addEventListener("DOMContentLoaded",()=>{for(const s of document.querySelectorAll("section"))s.style.background="rgb("+Math.floor(Math.random()*200)+", 90, 90)"})</script>' : ''}
${toggle ? '<script>addEventListener("DOMContentLoaded",()=>{for(const b of document.querySelectorAll("[aria-controls]"))b.addEventListener("click",()=>{const r=document.getElementById(b.getAttribute("aria-controls"));r.hidden=!r.hidden;b.setAttribute("aria-expanded",String(!r.hidden))})})</script>' : ''}
</head><body class="${site ? 'tracy-page-home' : 'home'}"><header><nav><a href="/">Home</a> <a href="/about/">About</a></nav></header><main><div class="${box}">
<section><h1>Building the groundwork</h1><p>Design and build for industrial parks, from the first survey to the keys.</p>${toggle ? '<button type="button" aria-expanded="false" aria-controls="more-1">Read more</button><div id="more-1" hidden><p>The rest of the story, shown when asked for.</p></div>' : ''}</section>
${SECTIONS.map((h, i) => `<section><h2>${h}</h2><div class="${reveal && i ? 'fx' : ''}" ${aos && i ? 'data-aos="fade-up"' : ''} style="margin-top:${i ? '700' : '0'}px">${PARAS(6, h)}</div></section>`).join('\n')}
</div></main><footer><p>Groundwork Ltd, all rights reserved.</p></footer></body></html>`
}
const notFound = (site) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial}main{padding:40px}h1{font-size:40px}</style></head><body class="${site ? 'tracy-page-page' : 'error'}"><main><h1>Not found</h1><p>The page you asked for is not here any more.</p><p><a href="/">Back to the home page</a></p></main></body></html>`

function serve(pages) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const p = new URL(req.url, 'http://x').pathname
      const body = typeof pages[p] === 'function' ? pages[p]() : pages[p]
      if (typeof body === 'string' && body.startsWith('REDIRECT ')) {
        res.writeHead(302, { location: body.slice(9) })
        return res.end()
      }
      // compressed whenever the client accepts it, as a production server answers: the preflight's
      // recorded pages must ask for identity to hash within their bound
      const text = body ?? pages.__404
      const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && typeof text === 'string'
      res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', ...(gzip ? { 'content-encoding': 'gzip' } : {}) })
      res.end(gzip ? gzipSync(text) : text)
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${String(srv.address().port)}`, set: (next) => Object.assign(pages, next), close: () => new Promise((r) => srv.close(r)) }))
  })
}

/**
 * A spec, a page-map and a visual contract for the fixture pages, as contract.mjs builds them.
 * `containers` is the review config's declaration (default: none); `about` adds the /about/ page.
 */
function fixtureSpec(sourceHtml, { containers = { none: 'fixture without a container grid' }, about = false, aboutHtml = sourceHtml } = {}) {
  const root = scratch('spec')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  const pageMap = {
    locales: ['en'],
    defaultLocale: 'en',
    theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } },
    pages: [
      { file: 'index.html', view: 'front-page', title: 'Building the groundwork', path: '/', locale: 'en' },
      ...(about ? [{ file: 'about.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }] : []),
      { file: '404.html', view: '404', title: 'Not found', path: '/missing-page/', locale: 'en' }
    ]
  }
  writeFileSync(path.join(spec, 'reference', 'rendered', 'home--1440-light.html'), sourceHtml)
  if (about) writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), aboutHtml)
  writeFileSync(path.join(spec, 'reference', 'rendered', 'missing-page--1440-light.html'), notFound(false))
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(pageMap, null, 2))
  for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const reference = { pages: [{ page: 'index.html', path: 'reference/rendered/home--1440-light.html' }, ...(about ? [{ page: 'about.html', path: 'reference/rendered/about--1440-light.html' }] : []), { page: '404.html', path: 'reference/rendered/missing-page--1440-light.html' }] }
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify(reference))
  const templates = { '/': 'front-page', '/missing-page/': '404', ...(about ? { '/about/': 'page' } : {}) }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates }, themeTemplates: new Set(Object.values(templates)), specHash: specHash(spec), id: 'preflight-fixture' })
  assert.deepEqual(contract.pending, [], JSON.stringify(contract.pending))
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  const runtime = path.join(root, 'runtime.json')
  writeFileSync(runtime, JSON.stringify({ images: [{ name: 'fixture-http', image: 'node-http-fixture', digest: `sha256:${'0'.repeat(64)}`, provenance: 'the test process serves both sides' }] }))
  return { root, spec, contractFile, pageMapFile: path.join(spec, 'page-map.json'), runtime }
}
const GRID = { breakpoints: [768, 1200], evidence: 'fixture: .container max-width 720/1140 from min-width 768/1200', items: [{ id: 'main', source: 'main .container', site: 'main .wrap' }] }

const cli = (args) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, [TOOL, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('close', (status) => resolve({ status, out, err }))
  })
const report = (out) => JSON.parse(readFileSync(path.join(out, 'PREFLIGHT.json'), 'utf8'))
const gate = (r, g) => r.certification.gates[g]

let source
let site
before(async () => {
  source = await serve({ '/': page(), '/about/': page(), __404: notFound(false) })
  site = await serve({ '/': page({ site: true, h2: 30 }), '/about/': page({ site: true }), __404: notFound(true) })
})
after(async () => {
  await source?.close()
  await site?.close()
  if (!KEEP) rmSync(ROOT, { recursive: true, force: true })
})

test('preflight live: the five tools read a sound site; every capability it has is covered, controlled and caught its defect; the lock seals the run', async () => {
  const home = page({ aos: true, grid: true })
  const about = page({ toggle: true })
  source.set({ '/': home, '/about/': about })
  site.set({ '/': page({ site: true, h2: 30, aos: true }), '/about/': page({ site: true, toggle: true }) })
  const fx = fixtureSpec(home, { containers: GRID, about: true, aboutHtml: about })
  const out = path.join(fx.root, 'out')
  const r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--contract', fx.contractFile, '--spec', fx.spec, '--out', out, '--tool-timeout-ms', '200000', '--runtime-manifest', fx.runtime, '--pass', 'functional:--search-word=groundwork'])
  const rep = report(out)
  const why = `${r.out}\n${r.err}\n${JSON.stringify(rep.tools, null, 1)}\n${JSON.stringify(rep.certification, null, 1)}`
  assert.equal(rep.verdict, 'trusted', why)
  assert.equal(rep.certification.status, 'complete', why)
  assert.equal(r.status, 0, why)
  assert.deepEqual(Object.keys(rep.tools), TOOLS)
  assert.deepEqual(rep.sample.map((s) => [s.path, s.status]), [['/', null], ['/about/', null], ['/missing-page/', 404]])
  for (const t of TOOLS) assert.ok(rep.tools[t].runs.length >= 1, `${t} ran`)
  assert.ok(rep.tools['layout-boxes'].findings >= 4, 'the four h2 at 30 px against 32 px are kept')
  assert.equal(rep.census['/'].sharedHeadings, 5)
  assert.equal(rep.census['/missing-page/'].site.status, 404)
  // every capability covered and certified; the real differences kept as findings
  const s = rep.coverage.summary
  for (const id of ['error-status', 'layout:front-page', 'layout:page', 'layout:404', 'dark', 'animation:aos', 'animation@site:aos', 'hidden:scroll', 'hidden:toggle', 'containers:main']) {
    assert.ok(s.covered.includes(id), `${id} covered: ${JSON.stringify(s)}`)
    assert.equal(rep.probeCerts[id]?.certified, true, `${id}: ${JSON.stringify(rep.probeCerts[id])}`)
  }
  for (const g of Object.keys(GATES)) assert.equal(gate(rep, g).status, 'certified', `${g}: ${gate(rep, g).reasons.join('; ')}`)
  const layout = rep.probes.find((p) => p.kind === 'layout' && p.page === '/')
  assert.ok(layout.real.findings.some((f) => f.measurement === 'our work#1'), 'the 30 px heading is a finding of the real comparison')
  // the defects each landed on their detector and measurement
  const defect = (kind, cap) => rep.probes.find((p) => p.kind === kind && p.capabilities.includes(cap)).defects.find((d) => d.capability === cap)
  assert.deepEqual(defect('status', 'error-status').findings.map((f) => f.measurement), ['status'])
  assert.deepEqual(defect('dark', 'dark').findings.map((f) => f.measurement)[0], 'stable')
  assert.deepEqual(defect('containers', 'containers:main').findings.map((f) => f.measurement), ['main@768'], 'narrowed at exactly 768: 767 and 769 unaffected')
  const cont = rep.probes.find((p) => p.kind === 'containers')
  assert.deepEqual(cont.items[0].widths, [767, 768, 769, 1199, 1200, 1201])
  assert.deepEqual(cont.items[0].observed, [768, 1200], 'the breakpoints come from the source CSS')
  assert.equal(rep.discovery.pages['/'].css.targets[0].rules.length, 2)
  // the lock
  const lock = readLock(path.join(out, LOCK_FILE))
  assert.equal(lock.certification.status, 'complete')
  assert.deepEqual(lock.unresolved, [])
  assert.equal(rep.lock.fingerprint, lock.epoch.fingerprint)
  assert.equal(lock.epoch.sequence, 1)
  assert.match(lock.tool.commit ?? '', /^[0-9a-f]{40}/)
  assert.ok(lock.tool.files['scripts/visual/preflight.mjs'])
  assert.match(lock.browser.version, /\d+\.\d+/)
  assert.equal(lock.runtime.images[0].digest, `sha256:${'0'.repeat(64)}`)
  assert.ok(lock.source.documents.some((d) => d.url === `${source.origin}/missing-page/`), 'the declared 404 document is hashed too')
  assert.ok(lock.inputs.files.contract.sha256 && lock.inputs.files['spec/page-map.json'].sha256)
  assert.deepEqual(lock.inputs.changedDuringRun, [])
  assert.ok(lock.fonts.families.site.some((f) => /Arial/.test(f)))
  assert.deepEqual(lock.tool.changedDuringRun, [], 'the measuring files hashed before and after the run are the same')
  assert.deepEqual(Object.keys(lock.artifacts).sort(), [...SEALED_ARTIFACTS].sort())
  const now = Object.fromEntries(await Promise.all([...lock.source.documents, ...lock.source.stylesheets].map(async (x) => [x.url, await fetchHash(x.url)])))
  assert.deepEqual(verifyRun(out, { fingerprint: lock.epoch.fingerprint, sourceNow: now }).reasons, [])
  assert.equal(await main(['--verify', out]), 0, 'accepted against the tools, the inputs and the source as they are now')
  assert.match(readFileSync(path.join(out, 'PREFLIGHT.md'), 'utf8'), /TRUSTED.*certification COMPLETE/)
  // the same port again with the prior lock: the same tools keep the epoch
  const again = path.join(fx.root, 'again')
  const r2 = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', again, '--tools', 'layout-boxes', '--pages', '/', '--runtime-manifest', fx.runtime, '--prior-lock', path.join(out, LOCK_FILE)])
  const lock2 = readLock(path.join(again, LOCK_FILE))
  assert.equal(r2.status, 1, 'one page and one tool: not a certified run')
  assert.equal(lock2.epoch.sequence, 1)
  assert.equal(lock2.epoch.changed, false)
  assert.equal(lock2.epoch.previous.digest, lock.digest)
  // the source changes after the lock: the run no longer stands for it
  source.set({ '/': page({ aos: true, grid: true, h2: 31 }) })
  assert.equal(await main(['--verify', out]), 1, 'the source serves other bytes than the lock recorded')
})

test('preflight live: a source that serves a different body on each load has no single identity — unresolved, never certified', async () => {
  let n = 0
  source.set({ '/': () => page().replace('</body>', `<!-- token ${String((n += 1))} --></body>`) })
  site.set({ '/': page({ site: true }) })
  const fx = fixtureSpec(page())
  const out = path.join(fx.root, 'out')
  const r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'layout-boxes', '--pages', '/', '--runtime-manifest', fx.runtime])
  assert.equal(r.status, 1, r.out + r.err)
  const lock = readLock(path.join(out, LOCK_FILE))
  const doc = lock.source.documents.find((d) => d.url === `${source.origin}/`)
  assert.ok(doc.sha256s.length > 1, 'every body seen is kept')
  assert.match(lock.unresolved.join(), new RegExp(`source document ${source.origin}/: \\d+ different bodies`))
  assert.equal(lock.certification.status, 'partial')
  assert.match(lock.certification.reasons.join(), /unresolved identity: source document/)
})

test('preflight live: an interrupted run closes its own browser and the tool children before it exits', async () => {
  source.set({ '/': page() })
  site.set({ '/': page({ site: true }) })
  const fx = fixtureSpec(page())
  const out = path.join(fx.root, 'out')
  const c = spawn(process.execPath, [TOOL, '--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'layout-boxes,motion', '--runtime-manifest', fx.runtime], { stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  c.stdout.on('data', (d) => (log += d))
  c.stderr.on('data', (d) => (log += d))
  const exited = new Promise((resolve) => c.on('close', (status, signal) => resolve({ status, signal })))
  const children = () =>
    spawnSync('ps', ['-eo', 'pid=,ppid=,args='])
      .stdout.toString()
      .split('\n')
      .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
      .filter((m) => m && Number(m[2]) === c.pid)
      .map((m) => ({ pid: Number(m[1]), args: m[3] }))
  // wait for the preflight's own browser (a child of the preflight, not of a tool)
  let seen = []
  for (let i = 0; i < 300 && !seen.some((x) => /chrom/i.test(x.args)); i += 1) {
    await new Promise((r) => setTimeout(r, 100))
    seen = children()
  }
  assert.ok(seen.some((x) => /chrom/i.test(x.args)), `the browser was never seen: ${log}`)
  c.kill('SIGTERM')
  const end = await exited
  assert.equal(end.status, 130, log)
  await new Promise((r) => setTimeout(r, 500))
  const alive = seen.filter((x) => {
    try {
      process.kill(x.pid, 0)
      return true
    } catch {
      return false
    }
  })
  assert.deepEqual(alive, [], 'every process the preflight started is gone')
  assert.ok(!spawnSync('ps', ['-eo', 'args']).stdout.toString().includes(out), 'no tool child of this run is still running')
  assert.equal(existsSync(path.join(out, LOCK_FILE)), false, 'an interrupted run writes no lock')
})

test('preflight live: a reveal library motion does not know is caught against the census, and its gate is not certified', async () => {
  source.set({ '/': page({ reveal: true }) })
  site.set({ '/': page({ site: true, reveal: true }) })
  const fx = fixtureSpec(page({ reveal: true }))
  const out = path.join(fx.root, 'out')
  const r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'motion'])
  assert.equal(r.status, 1, r.out + r.err)
  const rep = report(out)
  assert.deepEqual(rep.tools.motion.reasons.map((x) => x.code), ['motion-reveals-missed', 'motion-reveals-missed'])
  assert.ok(rep.census['/'].site.reveals.revealed >= 3)
  assert.ok(rep.coverage.summary.covered.includes('animation:unrecognised-reveal'))
  assert.match(rep.probeCerts['animation:unrecognised-reveal'].reasons.join(), /library-not-recognised/)
  assert.equal(gate(rep, 'animation').status, 'not-certified')
  assert.match(gate(rep, 'status').reasons.join(), /left out/)
  assert.match(gate(rep, 'containers').reasons.join(), /unknown/, 'no contract: the containers are not measured')
  assert.match(readLock(path.join(out, LOCK_FILE)).unresolved.join(), /runtime images/)
})

test('preflight live: every block differing — an unstable page is the tool’s misread, a stable one is the theme’s difference', async () => {
  source.set({ '/': page() })
  site.set({ '/': page({ site: true, random: true }) })
  let fx = fixtureSpec(page())
  let out = path.join(fx.root, 'out')
  let r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'layout-boxes', '--pages', '/'])
  let rep = report(out)
  assert.equal(r.status, 1, r.out + r.err)
  assert.deepEqual(rep.tools['layout-boxes'].reasons.map((x) => x.code), ['layout-boxes-self-differs'])
  // the probe's own control reads the same instability
  assert.match(rep.probeCerts['layout:front-page'].reasons.join(), /control-not-clean/)

  site.set({ '/': page({ site: true, paint: 'rgb(245, 245, 247)' }) })
  fx = fixtureSpec(page())
  out = path.join(fx.root, 'out')
  r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'layout-boxes', '--pages', '/'])
  rep = report(out)
  assert.equal(rep.verdict, 'trusted', r.out + r.err + JSON.stringify(rep.tools, null, 1))
  assert.equal(rep.tools['layout-boxes'].findings, 5, 'the five painted sections are real differences, kept')
  assert.deepEqual(rep.controls, { '/': { site: { status: 0, timedOut: false, differing: 0, paired: 5 }, source: { status: 0, timedOut: false, differing: 0, paired: 5 } } })
  assert.equal(rep.probeCerts['layout:front-page'].certified, true)
  // one page and one tool is not a certified preflight: the rest is named, not passed
  assert.equal(r.status, 1)
  assert.equal(rep.certification.status, 'partial')
  assert.ok(rep.coverage.summary.uncovered.includes('error-status') && rep.coverage.summary.uncovered.includes('layout:404'))
  assert.match(gate(rep, 'status').reasons.join(), /error-status: uncovered/)
})

test('preflight live: a declared capability the site does not show is not certified — dark not applied, a container selector that matches nothing, more breakpoints than the bound', async () => {
  source.set({ '/': page({ grid: [400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300] }) })
  site.set({ '/': page({ site: true, dark: false }) })
  const fx = fixtureSpec(page(), { containers: { ...GRID, items: [{ id: 'main', source: 'main .container', site: 'main .nothing-here' }] } })
  const out = path.join(fx.root, 'out')
  const r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--contract', fx.contractFile, '--out', out, '--tools', 'layout-boxes', '--runtime-manifest', fx.runtime])
  assert.equal(r.status, 1, r.out + r.err)
  const rep = report(out)
  assert.equal(gate(rep, 'dark').status, 'not-certified')
  assert.match(rep.probeCerts.dark.reasons.join(), /dark-not-observed/)
  assert.equal(gate(rep, 'containers').status, 'not-certified')
  assert.match(rep.probeCerts['containers:main'].reasons.join(), /selector-not-found: main \.nothing-here/)
  assert.match(rep.probeCerts['containers:main'].reasons.join(), /breakpoints-beyond-bound: 10 observed, 8 probed/)
  assert.equal(rep.probes.find((p) => p.kind === 'containers').items[0].boundaries.length, 8)
  assert.equal(rep.probeCerts['layout:front-page'].certified, true, 'what the site does show is still certified')
  assert.match(gate(rep, 'layout').reasons.join(), /tool visual-qa was left out/)
})

test('preflight probes: the probe runner itself rejects a detector that always reads clean and one that differs on identical pages', async () => {
  source.set({ '/': page() })
  site.set({ '/': page({ site: true }) })
  const browser = lazyBrowser()
  try {
    const ctx = { browser: await browser.get(), hooks: { light: { site: null, source: null }, dark: null, check: null }, site: site.origin, source: source.origin, sourcePrefix: '', deadline: Date.now() + 120000, probeTimeoutMs: 60000, log: resourceLog(), extraReasons: {} }
    const s = { path: '/', covers: ['layout:front-page'] }
    const measure = async (p) => ({ size: await p.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize) })
    const defects = () => [{ capability: 'layout:front-page', side: 'site', initScripts: ["addEventListener('load',()=>{const h=document.querySelector('h1');h.style.fontSize='60px';h.setAttribute('data-preflight-defect','x')})"], expect: { detector: 'h1-size', measurement: 'h1' } }]
    const honest = (a, b) => (a.size !== b.size ? [{ detector: 'h1-size', measurement: 'h1' }] : [])
    const good = await runProbe(ctx, s, { kind: 't', caps: ['layout:front-page'], measure, compare: honest, real: () => [], defects })
    assert.equal(good.out.certified['layout:front-page'].certified, true, JSON.stringify(good.out))
    const blind = await runProbe(ctx, s, { kind: 't', caps: ['layout:front-page'], measure, compare: () => [], real: () => [], defects })
    assert.match(blind.out.certified['layout:front-page'].reasons.join(), /defect-missed/)
    const noisy = await runProbe(ctx, s, { kind: 't', caps: ['layout:front-page'], measure, compare: () => [{ detector: 'h1-size', measurement: 'h1' }], real: () => [], defects })
    assert.match(noisy.out.certified['layout:front-page'].reasons.join(), /control-not-clean/)
    // a reading that loaded but never settled: its control and its defect are not measured, even
    // where the detector compares clean and the defect is caught (#57 review)
    let reads = 0
    const restless = await runProbe(ctx, s, { kind: 't', caps: ['layout:front-page'], measure: async (p) => ({ ...(await measure(p)), n: ++reads }), compare: honest, real: () => [], defects, unsettled: (x) => (x.n === 3 ? 'had reveals still changing after 4000 ms' : null) })
    const why = restless.out.certified['layout:front-page']
    assert.equal(why.certified, false)
    assert.deepEqual(why.reasons, ['control-not-measured: the site read against itself never settled on / (the second reading had reveals still changing after 4000 ms)'])
    assert.deepEqual(restless.out.controls.site, { unsettled: 'the second reading had reveals still changing after 4000 ms' })
    const still = await runProbe(ctx, s, { kind: 't', caps: ['layout:front-page'], measure, compare: honest, real: () => [], defects, unsettled: () => 'had reveals still changing after 4000 ms' })
    assert.match(still.out.certified['layout:front-page'].reasons.join('\n'), /control-not-measured: the site read against itself never settled.*\ndefect-not-measured: the clean reading had reveals still changing after 4000 ms; the defect reading had reveals/)
    // a page that redirects out of the measured origin is not read as that page
    site.set({ '/away/': `REDIRECT ${source.origin}/` })
    const away = await runProbe(ctx, { path: '/away/', covers: ['layout:x'] }, { kind: 't', caps: ['layout:x'], sides: ['site'], measure, compare: honest, real: () => [], defects: () => [] })
    assert.match(away.out.real.error, /redirected out of the measured origin/)
    assert.equal(away.out.certified['layout:x'].certified, false)
    // a deadline already spent reads nothing, and certifies nothing
    const late = await runProbe({ ...ctx, deadline: Date.now() }, s, { kind: 't', caps: ['layout:front-page'], measure, compare: honest, real: () => [], defects })
    assert.match(late.out.real.error, /time budget/)
    assert.equal(late.out.certified['layout:front-page'].certified, false)
  } finally {
    await browser.close()
  }
})

test('preflight resources: font files, documents and stylesheets are hashed within bounds; what is not is listed, never dropped', async () => {
  const { EventEmitter } = await import('node:events')
  const fake = new EventEmitter()
  const frame = {}
  fake.mainFrame = () => frame
  fake.url = () => 'http://src/'
  const log = resourceLog({ maxBytes: 16, maxEntries: 2 })
  const settle = log.attach(fake, 'source')
  const bodiesRead = []
  const res = (url, type, body, headers = {}, status = 200, delivered = Buffer.byteLength(body)) => ({
    url: () => url,
    status: () => status,
    headers: () => headers,
    frame: () => frame,
    request: () => ({ resourceType: () => type, sizes: async () => ({ responseBodySize: delivered }) }),
    body: async () => {
      bodiesRead.push(url)
      return Buffer.from(body)
    }
  })
  fake.emit('response', res('http://src/', 'document', '<p>hi</p>'))
  fake.emit('response', res('http://src/a.css', 'stylesheet', 'a{}'))
  fake.emit('response', res('http://src/big.woff2', 'font', 'x', { 'content-length': '999' }))
  // chunked, no Content-Length: the bytes delivered are known before the body is read
  fake.emit('response', res('http://src/chunked.woff2', 'font', 'x', {}, 200, 5000))
  fake.emit('response', res('http://src/c.css', 'stylesheet', 'c{}'))
  fake.emit('response', res('http://src/moved', 'document', '', {}, 301))
  fake.emit('response', res('http://src/x.png', 'image', 'png'))
  await settle()
  assert.deepEqual([...log.entries.keys()], ['source document http://src/', 'source stylesheet http://src/a.css'])
  assert.match(log.unresolved.join('\n'), /big\.woff2: 999 bytes, beyond the 16-byte bound/)
  assert.match(log.unresolved.join('\n'), /chunked\.woff2: 5000 bytes delivered, beyond the 16-byte bound/)
  assert.ok(!bodiesRead.includes('http://src/big.woff2') && !bodiesRead.includes('http://src/chunked.woff2'), 'a body over the bound is never read into memory')
  assert.match(log.unresolved.join('\n'), /c\.css: beyond the 2-resource bound/)
  assert.equal(log.texts.get('http://src/a.css'), 'a{}', 'a stylesheet is kept for the browser to parse again')
  // a body served compressed: the bytes delivered do not bound what body() decodes into memory, so it
  // is never read (a recorded page asks for identity); an unencoded one is still checked after the read
  const log2 = resourceLog({ maxBytes: 16 })
  const settle2 = log2.attach(fake, 'source')
  bodiesRead.length = 0
  fake.emit('response', res('http://src/zip.css', 'stylesheet', 'y'.repeat(64), { 'content-encoding': 'gzip' }, 200, 10))
  fake.emit('response', res('http://src/br.woff2', 'font', 'y', { 'content-encoding': 'BR' }, 200, 1))
  fake.emit('response', res('http://src/plain.css', 'stylesheet', 'y'.repeat(64), { 'content-encoding': 'identity' }, 200, 10))
  await settle2()
  assert.match(log2.unresolved.join(), /zip\.css: served gzip-encoded although identity was asked — its decoded size is not bounded before the read/)
  assert.match(log2.unresolved.join(), /br\.woff2: served br-encoded/)
  // (the first log still listens on the same page, so the plain body is read once per log)
  assert.deepEqual([...new Set(bodiesRead)], ['http://src/plain.css'], 'an encoded body is never read into memory')
  assert.match(log2.unresolved.join(), /plain\.css: 64 bytes, beyond the bound/)
  // each entry keeps the status it was served with, and every other one it was served with later
  const log3 = resourceLog()
  const settle3 = log3.attach(fake, 'source')
  fake.emit('response', res('http://src/404', 'document', 'gone', {}, 404))
  fake.emit('response', res('http://src/404', 'document', 'gone', {}, 200))
  await settle3()
  assert.deepEqual(log3.entries.get('source document http://src/404').statuses, [404, 200])
  assert.equal(log3.entries.get('source document http://src/404').sha256s.length, 1, 'the same bytes under two statuses')
})

test('preflight fetchHash: the source read again is streamed within the bound, never followed through a redirect', async () => {
  const srv = createServer((req, res) => {
    if (req.url === '/moved') {
      res.writeHead(302, { location: '/' })
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/plain' }) // chunked: no Content-Length
    res.write('a'.repeat(1024))
    res.end(req.url === '/big' ? 'b'.repeat(64 * 1024) : '')
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const at = `http://127.0.0.1:${String(srv.address().port)}`
  try {
    const ok = await fetchHash(`${at}/`)
    assert.equal(ok.sha256, `sha256:${createHash('sha256').update('a'.repeat(1024)).digest('hex')}`)
    assert.match((await fetchHash(`${at}/big`, { maxBytes: 4096 })).error, /beyond the bound/)
    assert.match((await fetchHash(`${at}/moved`)).error, /302 \(a redirect\)/)
    assert.ok((await fetchHash('http://127.0.0.1:1/')).error)
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

test('preflight live: a browser that does not launch leaves a sealed record with the browser unresolved — nothing certified', async () => {
  source.set({ '/': page() })
  site.set({ '/': page({ site: true }) })
  const fx = fixtureSpec(page())
  const out = path.join(fx.root, 'out')
  const r = await new Promise((resolve) => {
    const c = spawn(process.execPath, [TOOL, '--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'motion', '--runtime-manifest', fx.runtime, '--tool-timeout-ms', '60000'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(fx.root, 'no-browsers') } })
    let o = ''
    c.stdout.on('data', (d) => (o += d))
    c.stderr.on('data', (d) => (o += d))
    c.on('close', (status) => resolve({ status, o }))
  })
  assert.equal(r.status, 1, r.o)
  const lock = JSON.parse(readFileSync(path.join(out, LOCK_FILE), 'utf8'))
  assert.equal(lock.digest, lockDigest(lock), 'the record is sealed')
  assert.throws(() => readLock(path.join(out, LOCK_FILE)), /no epoch/, 'but it names no epoch: it cannot stand as a prior lock')
  assert.match(lock.unresolved.join(), /browser: did not launch/)
  assert.equal(lock.browser, null)
  assert.equal(lock.epoch.fingerprint, null, 'no renderer, no epoch')
  assert.equal(lock.certification.status, 'partial')
  const rep = report(out)
  assert.equal(rep.verdict, 'not-trusted')
  assert.ok(rep.coverage.capabilities.some((c) => c.id === 'browser' && c.state === 'unknown'))
})

test('preflight live: a time budget spent before the pages are read gives a sealed, uncertified record and leaves no child running', async () => {
  source.set({ '/': page() })
  site.set({ '/': page({ site: true }) })
  const fx = fixtureSpec(page())
  const out = path.join(fx.root, 'out')
  const r = await cli(['--routes', fx.pageMapFile, '--site', site.origin, '--source', source.origin, '--out', out, '--tools', 'layout-boxes,motion', '--timeout-ms', '1000', '--runtime-manifest', fx.runtime])
  assert.equal(r.status, 1, r.out + r.err)
  const lock = readLock(path.join(out, LOCK_FILE))
  assert.equal(lock.certification.status, 'partial')
  assert.match(lock.certification.reasons.join(), /time budget|not certified/)
  assert.equal(verifyRun(out).ok, false)
  const ps = spawnSync('ps', ['-eo', 'args']).stdout.toString()
  assert.ok(!ps.includes(path.join(out, 'layout-boxes')), 'no layout-boxes child of this run is still running')
})

test('preflight CLI: usage errors before anything runs — missing inputs, unknown tool, a non-empty or claimed --out, a 404-only sample, a pairs file against the prefix, unsafe inputs', async () => {
  const fx = fixtureSpec(page())
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'o1')]), 2, 'visual-qa needs --contract and --spec')
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'o2'), '--tools', 'motion,lens']), 2)
  mkdirSync(path.join(fx.root, 'full'))
  writeFileSync(path.join(fx.root, 'full', 'x'), '')
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'full'), '--tools', 'motion']), 2)
  // another preflight already writing into --out
  mkdirSync(path.join(fx.root, 'claimed'))
  writeFileSync(path.join(fx.root, 'claimed', '.preflight.owner'), '')
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'claimed'), '--tools', 'motion']), 2)
  // the 404 alone is no sample: refused while parsing, before a tool runs or --out is made
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'o3'), '--tools', 'motion', '--pages', '/missing-page/']), 2)
  assert.equal(existsSync(path.join(fx.root, 'o3')), false)
  // a pairs file of the user's would replace the prefix mapping http-parity needs
  assert.equal(await main(['--routes', fx.pageMapFile, '--site', 'http://x', '--source', 'http://y', '--out', path.join(fx.root, 'o4'), '--tools', 'http-parity', '--source-prefix', '/index.php', '--pass', 'http-parity:--pairs=/p.json']), 2)
  assert.equal(existsSync(path.join(fx.root, 'o4')), false)
  // unsafe or malformed inputs: a linked page-map, a runtime manifest with a tag for a digest, a broken prior lock, a contract that is not one
  symlinkSync(fx.pageMapFile, path.join(fx.root, 'linked.json'))
  writeFileSync(path.join(fx.root, 'runtime-tag.json'), JSON.stringify({ images: [{ name: 'web', image: 'wordpress:latest', digest: 'wordpress:latest', provenance: 'guess' }] }))
  writeFileSync(path.join(fx.root, 'prior.json'), '{"schema":')
  writeFileSync(path.join(fx.root, 'not-contract.json'), '{"id":"x"}')
  const base = ['--site', 'http://x', '--source', 'http://y', '--tools', 'motion']
  for (const [extra, name] of [
    [['--routes', path.join(fx.root, 'linked.json')], 'o5'],
    [['--routes', fx.pageMapFile, '--runtime-manifest', path.join(fx.root, 'runtime-tag.json')], 'o6'],
    [['--routes', fx.pageMapFile, '--prior-lock', path.join(fx.root, 'prior.json')], 'o7'],
    [['--routes', fx.pageMapFile, '--contract', path.join(fx.root, 'not-contract.json')], 'o8'],
    [['--routes', fx.pageMapFile, '--spec', fx.pageMapFile], 'o9']
  ]) {
    assert.equal(await main([...extra, ...base, '--out', path.join(fx.root, name)]), 2, extra.join(' '))
    assert.equal(existsSync(path.join(fx.root, name)), false, `${name}: nothing made`)
  }
  assert.equal(await main(['--verify', path.join(fx.root, 'nothing-here')]), 1, 'no lock: not accepted')
})

// ── JA Vega, read-only ───────────────────────────────────────────────────────────────────────────
//
// Opt-in (P4_JA_VEGA_SMOKE=1). Probes the two stands with a deadline and keeps what it saw in
// $P4_TEST_ROOT/ja-vega-availability.json. Unreachable stands: fixtures only, recorded. Reachable
// stands: the inputs come from $P4_TEST_ROOT/dossier.json — { "dossier": "<run root with
// visual.contract.json and spec/>", "runtimeContainers": ["…"] } — and are verified (the contract is
// bound to that spec) before a real preflight runs; a missing or unverified input is a failure, not
// a skip. The run only reads the stands: HTTP GETs of five tools and a browser, `docker inspect`.

const STANDS = { source: 'http://127.0.0.1:8261', site: 'http://127.0.0.1:8262' }
test('preflight JA Vega read-only: a real run on the stands when they are up, else fixtures only with the evidence why', { skip: process.env.P4_JA_VEGA_SMOKE === '1' ? false : 'set P4_JA_VEGA_SMOKE=1' }, async () => {
  const probe = async (url) => {
    const t0 = Date.now()
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' })
      return { url, up: r.status > 0 && r.status < 500, status: r.status, ms: Date.now() - t0 }
    } catch (e) {
      return { url, up: false, error: String(e.cause?.code ?? e.message), ms: Date.now() - t0 }
    }
  }
  const seen = { at: new Date().toISOString(), source: await probe(`${STANDS.source}/`), site: await probe(`${STANDS.site}/`) }
  const evidence = path.join(ROOT, 'ja-vega-availability.json')
  if (!seen.source.up || !seen.site.up) {
    writeFileSync(evidence, `${JSON.stringify({ ...seen, mode: 'fixtures-only', why: `${!seen.source.up ? 'the source stand' : 'the port'} is not reachable; a preflight needs both sides` }, null, 2)}\n`)
    return
  }
  const pointer = path.join(ROOT, 'dossier.json')
  assert.ok(existsSync(pointer), `both stands answer, but ${pointer} does not name the JA Vega dossier: the run's inputs are missing`)
  const { dossier, runtimeContainers = [] } = JSON.parse(readFileSync(pointer, 'utf8'))
  const contractFile = path.join(dossier, 'visual.contract.json')
  const spec = path.join(dossier, 'spec')
  assert.ok(existsSync(contractFile) && existsSync(path.join(spec, 'page-map.json')), `${dossier}: no visual.contract.json or spec/page-map.json`)
  const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
  assert.equal(contract.source?.hash, specHash(spec), 'the contract is bound to another spec than the one beside it: regenerate it before measuring')
  const out = path.join(ROOT, `ja-vega-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  const r = await cli(['--routes', path.join(spec, 'page-map.json'), '--site', STANDS.site, '--source', STANDS.source, '--contract', contractFile, '--spec', spec, '--out', out, ...(runtimeContainers.length ? ['--runtime-containers', runtimeContainers.join(',')] : [])])
  writeFileSync(path.join(out, 'run.log'), `${r.out}\n${r.err}`)
  writeFileSync(evidence, `${JSON.stringify({ ...seen, mode: 'live', out, exit: r.status }, null, 2)}\n`)
  assert.ok([0, 1].includes(r.status), `the preflight did not complete (exit ${String(r.status)}): ${r.err.slice(-2000)}`)
  const rep = report(out)
  const lock = readLock(path.join(out, LOCK_FILE))
  assert.ok(rep.sample.length >= 1 && rep.sample.length <= MAX_PAGES)
  assert.equal(new Set(rep.sample.map((s) => s.path)).size, rep.sample.length)
  assert.equal(rep.lock.fingerprint, lock.epoch.fingerprint)
  for (const c of rep.coverage.capabilities) assert.ok(['covered', 'uncovered', 'unknown', 'not-applicable'].includes(c.state))
  assert.equal(r.status === 0, lock.certification.status === 'complete' && rep.verdict === 'trusted', 'exit 0 only for a complete, trusted run')
})
