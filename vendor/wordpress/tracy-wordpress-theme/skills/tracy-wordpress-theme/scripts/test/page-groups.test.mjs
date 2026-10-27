// A page group's own contract (contract.mjs init --group/--pages), the guards that keep it out of the integration
// checkpoint and the release, and the offline restore of group stands.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildContract, validateContract } from '../visual/contract.mjs'
import { groupIdOf, identityOf } from '../lib/canonical.mjs'
import { groupPages, parityInputs } from '../visual/group-pages.mjs'
import { mergeParity } from '../visual/group-verdict.mjs'
import { contractProblems, runtimeProblems } from '../quickstart/release.mjs'
import { testDir } from './lib/test-root.mjs'

const pageMap = {
  locales: ['en'],
  defaultLocale: 'en',
  source: { kind: 'html' },
  pages: [
    { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en' },
    { file: 'About.html', view: 'page', title: 'About', path: '/about', locale: 'en' },
    { file: 'Team.html', view: 'page', title: 'Team', path: '/team', locale: 'en' },
    { file: 'Post.html', view: 'single', title: 'Post', path: '/article', locale: 'en' }
  ]
}
const reviewConfig = {
  containers: { breakpoints: [576, 992], evidence: 'fixture css', items: [{ id: 'page', source: '.container', site: '.wrap', layouts: ['page'] }, { id: 'post', source: '.container', site: '.wrap', layouts: ['single'] }] },
  templates: { '/': 'front-page', '/about': 'page', '/team': 'page', '/article': 'single' }
}
const themeTemplates = new Set(['front-page', 'page', 'single'])
const hash = (c) => `sha256:${c.repeat(64)}`
const build = (group, extra = {}) => buildContract({ pageMap, reference: extra.reference ?? { pages: [] }, reviewConfig, themeTemplates, specHash: hash('a'), bindings: { specHash: hash('a'), seedReportHash: hash('b'), artifactHash: hash('c') }, id: group ? `t--${group.id}` : 't', group: group && { dossier: '/dossier/' + group.id, ...group }, targetSite: group ? 'http://127.0.0.1:8081' : null, ...extra })

test('a group contract holds exactly its pages, derives layouts and representatives from them and names its group', () => {
  const site = build(null)
  assert.equal(site.pages.length, 4)
  assert.equal(site.group, undefined)
  assert.equal(groupIdOf(site), null)
  const g = build({ id: 'g1', pages: ['/team', '/about'] })
  assert.deepEqual(g.pages.map((p) => p.id), ['en-about', 'en-team'])
  assert.deepEqual(g.layouts.map((l) => [l.id, l.pages, l.representative]), [['page', ['en-about', 'en-team'], 'en-about']])
  assert.deepEqual(g.group, { id: 'g1', pages: ['/team', '/about'], dossier: '/dossier/g1' })
  assert.equal(groupIdOf(g), 'g1')
  assert.deepEqual(g.target, { site: 'http://127.0.0.1:8081' })
  assert.equal(site.target, undefined)
  // the container item of a layout this group does not hold is another group's, not a pending decision
  assert.deepEqual(g.design.containers.items.map((i) => i.id), ['page'])
  assert.deepEqual(g.pending, [])
  assert.deepEqual(validateContract(g), [])
  const other = build({ id: 'g2', pages: ['/article'] })
  assert.deepEqual(other.design.containers.items.map((i) => i.id), ['post'])
  assert.deepEqual(validateContract(other), [])
})

test('a group contract differs from the site contract by hash: the same pages in two groups are two contracts', async () => {
  const { contractHash } = await import('../lib/canonical.mjs')
  assert.notEqual(contractHash(build({ id: 'g1', pages: ['/about'] })), contractHash(build({ id: 'g2', pages: ['/about'] })))
  assert.notEqual(contractHash(build({ id: 'g1', pages: ['/about'] })), contractHash(build(null)))
})

test('a group page that no page answers to is refused, never dropped; a bad group id or page list fails validation', () => {
  assert.throws(() => build({ id: 'g1', pages: ['/about', '/nope'] }), /group g1: --pages \/nope is not a page/)
  const g = build({ id: 'g1', pages: ['/about'] })
  const noTarget = { ...g }
  delete noTarget.target
  assert.match(validateContract(noTarget).join('|'), /records the origin of its own stand/)
  assert.match(validateContract({ ...g, group: { id: 'bad id!', pages: ['/about'] } }).join('|'), /group\.id must be a name/)
  assert.match(validateContract({ ...g, group: { id: 'g1', pages: [] } }).join('|'), /pages must be a non-empty list/)
  assert.match(validateContract({ ...g, group: { id: 'g1', pages: ['about'] } }).join('|'), /pages must be a non-empty list/)
  assert.match(validateContract({ ...g, group: { id: 'g1', pages: ['/a', '/a'] } }).join('|'), /each once/)
})

test('a group contract that holds a seeded route resolves through the seed report (a moved page is still the group\'s)', () => {
  const seed = { routes: [{ path: '/our-team/', pagemapPath: '/team', status: 200 }] }
  const g = build({ id: 'g1', pages: ['/our-team'] }, { seedReport: seed })
  assert.deepEqual(g.pages.map((p) => [p.id, p.path, p.pagemapPath]), [['en-team', '/our-team/', '/team']])
})

test('identity says which group a report was measured for; the site contract says none', () => {
  const dir = testDir('pg-identity')
  const file = path.join(dir, 'visual.contract.json')
  writeFileSync(file, '{}')
  assert.equal(identityOf({ contractPath: file, contract: build({ id: 'g1', pages: ['/about'] }) }).group, 'g1')
  assert.equal(identityOf({ contractPath: file, contract: build(null) }).group, null)
})

test('a group contract can never back a release: it is refused by name', () => {
  const dir = testDir('pg-release')
  const run = path.join(dir, 'dossier')
  const spec = path.join(dir, 'spec')
  mkdirSync(run)
  mkdirSync(spec)
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  writeFileSync(path.join(run, 'visual.contract.json'), JSON.stringify(build({ id: 'g1', pages: ['/about'] })))
  const { problems } = contractProblems({ runRoot: run, specDir: spec })
  const p = problems.find((x) => x.code === 'contract-group')
  assert.ok(p, JSON.stringify(problems))
  assert.match(p.message ?? p.detail ?? JSON.stringify(p), /page group g1/)
})

test('CLI: --group and --pages go together; --pages alone would narrow the site contract', () => {
  const dir = testDir('pg-cli')
  const cli = (...a) => spawnSync(process.execPath, [new URL('../visual/contract.mjs', import.meta.url).pathname, 'init', '--run-root', path.join(dir, 'r'), '--spec', dir, ...a], { encoding: 'utf8' })
  const a = cli('--pages', '/about')
  assert.equal(a.status, 2)
  assert.match(a.stderr, /--group <id> and --pages \/a,\/b go together/)
  const b = cli('--group', 'g1')
  assert.equal(b.status, 2)
  assert.match(b.stderr, /go together/)
  const c = cli('--group', 'bad id', '--pages', '/about', '--built-theme', dir, '--site', 'http://127.0.0.1:8081')
  assert.equal(c.status, 2)
  assert.match(c.stderr, /--group <id> needs --pages/)
  // a group contract is bound to its own stand: no --site, or one that is no http(s) URL, is refused before any write
  const d = cli('--group', 'g1', '--pages', '/about', '--built-theme', dir)
  assert.equal(d.status, 2)
  assert.match(d.stderr, /--group needs --site <origin>/)
  const e = cli('--group', 'g1', '--pages', '/about', '--built-theme', dir, '--site', 'ftp://x')
  assert.equal(e.status, 2)
  assert.match(e.stderr, /only http\(s\) origins/)
})

test('offline restore (group stands): the flag exists, the report says so, and a release refuses such a restore by name', () => {
  const dir = testDir('pg-offline')
  const r = spawnSync(process.execPath, [new URL('../quickstart/restore.mjs', import.meta.url).pathname, '--pack', path.join(dir, 'none'), '--root-runner', 'x', '--wp', 'wp', '--site-url', 'http://x', '--db-host', 'h', '--db-password', 'p', '--offline-checksums'], { encoding: 'utf8' })
  assert.doesNotMatch(r.stderr, /unknown option|unknown argument|--offline-checksums/i, r.stderr)
  const steps = [{ name: 'core-checksums', ok: true, offline: true }]
  for (const restore of [{ ok: true, offlineChecksums: true }, { ok: true, steps }]) {
    const { problems } = runtimeProblems({ restore, parity: {}, measured: {}, archives: [] })
    assert.ok(problems.some((p) => p.code === 'restore-offline'), JSON.stringify(problems))
  }
  const normal = runtimeProblems({ restore: { ok: true, steps: [{ name: 'core-checksums', ok: true }] }, parity: {}, measured: {}, archives: [] })
  assert.ok(!normal.problems.some((p) => p.code === 'restore-offline'))
})

test('group-pages: one route plan — seeded target, source route per kind; a moved page lands at its seeded path; ambiguity fails closed', () => {
  const seed = { routes: [{ path: '/our-team/', pagemapPath: '/team', status: 200 }] }
  const reference = { kind: 'html', pages: [{ page: 'About.html', kind: 'url' }, { page: 'Post.html', kind: 'none' }] }
  const g = build({ id: 'g1', pages: ['/our-team', '/about', '/article'] }, { seedReport: seed, reference, sourceSite: 'http://src.test' })
  const pages = groupPages(g, pageMap, reference)
  const of = (p) => pages.find((x) => x.pagemapPath === p)
  assert.deepEqual([of('/team').kind, of('/team').path, of('/team').sourceRoute], ['html', '/our-team/', '/Team.html'])
  // a url page with no pairs is read at the same path on source.site (identity route)
  assert.deepEqual([of('/about').kind, of('/about').sourceRoute, g.pages.find((x) => x.pagemapPath === '/about').sourceRoute], ['url', '/about', '/about'])
  assert.deepEqual([of('/article').kind, of('/article').sourceRoute], ['none', null])
  const inp = parityInputs(pages, 'html')
  assert.deepEqual(inp.routes, ['/Team.html'])
  assert.deepEqual(inp.pairs, { rules: [{ from: '/Team.html', to: '/our-team/' }] })
  assert.deepEqual(inp.pages, ['/our-team/'])
  assert.deepEqual(parityInputs(pages, 'url').pairs.rules, [{ from: '/about', to: '/about' }])
  assert.throws(() => groupPages(build(null), pageMap, reference), /not a page group contract/)
  // a url page with no source.site, two pages on one seeded path or source route: refused
  assert.throws(() => groupPages(build({ id: 'g1', pages: ['/about'] }, { reference }), pageMap, reference), /no source.site/)
  const dup = { ...g, pages: [...g.pages, { ...g.pages[0], id: 'other' }] }
  assert.throws(() => groupPages(dup, pageMap, reference), /route index is ambiguous: pages .* both answer to/)
  // a page-map that lists one path twice cannot say which entry is the page
  assert.throws(() => groupPages(g, { ...pageMap, pages: [...pageMap.pages, pageMap.pages[0]] }, reference), /page-map is ambiguous: two entries carry the path/)
  const twin = { ...g, pages: g.pages.map((p) => (p.pagemapPath === '/about' ? { ...p, sourceRoute: '/x' } : p)).concat([{ ...g.pages.find((p) => p.pagemapPath === '/about'), id: 'about2', path: '/about-2', pagemapPath: '/about-2', sourceRoute: '/x' }]) }
  assert.throws(() => groupPages(twin, { ...pageMap, pages: [...pageMap.pages, { file: 'About2.html', view: 'page', title: 'About 2', path: '/about-2', locale: 'en' }] }, { ...reference, pages: [...reference.pages, { page: 'About2.html', kind: 'url' }] }), /ambiguous: pages .* read the same url source route/)
  // the CLI writes routes/pairs files in the http-parity formats and prints the SEEDED paths; refuses a bad call
  const dir = testDir('pg-group-pages')
  mkdirSync(path.join(dir, 'spec'), { recursive: true })
  writeFileSync(path.join(dir, 'spec', 'page-map.json'), JSON.stringify(pageMap))
  writeFileSync(path.join(dir, 'spec', 'reference.json'), JSON.stringify(reference))
  writeFileSync(path.join(dir, 'visual.contract.json'), JSON.stringify(g))
  const cli = (...a) => spawnSync(process.execPath, [new URL('../visual/group-pages.mjs', import.meta.url).pathname, ...a], { encoding: 'utf8', env: { ...process.env, TMPDIR: dir } })
  const base = ['--contract', path.join(dir, 'visual.contract.json'), '--spec', path.join(dir, 'spec')]
  const out = path.join(dir, 'plan')
  const kindPages = (kind) => JSON.parse(cli(...base, '--kind', kind, '--out-dir', out, '--json').stdout).pages.join(',')
  assert.equal(kindPages('html'), '/our-team/')
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'pairs-html.json'), 'utf8')), { rules: [{ from: '/Team.html', to: '/our-team/' }] })
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'routes-html.json'), 'utf8')), ['/Team.html'])
  assert.equal(kindPages('url'), '/about')
  assert.equal(JSON.parse(cli(...base, '--json').stdout).pages.length, 3)
  // default output: one line, no JSON; kind mode points at the group-pages-<kind>.json it wrote, plan mode at a saved file
  const kindLine = cli(...base, '--kind', 'html', '--out-dir', out).stdout
  assert.equal(kindLine, `group-pages html: pages=1 /our-team/ -> ${path.join(out, 'group-pages-html.json')}\n`)
  assert.equal(JSON.parse(readFileSync(path.join(out, 'route-plan.json'), 'utf8')).pages.length, 3)
  // the file the line names is the complete result of the kind — what --json prints — and route-plan.json stays the whole group's plan
  const kindJson = JSON.parse(cli(...base, '--kind', 'html', '--out-dir', out, '--json').stdout)
  assert.deepEqual(kindJson, JSON.parse(readFileSync(path.join(out, 'group-pages-html.json'), 'utf8')))
  assert.deepEqual([kindJson.kind, kindJson.pages, kindJson.routes, kindJson.pairs], ['html', ['/our-team/'], ['/Team.html'], { rules: [{ from: '/Team.html', to: '/our-team/' }] }])
  assert.equal(kindJson.plan, path.join(out, 'route-plan.json'), 'the documented top-level plan path stays')
  assert.equal(kindJson.files.plan, kindJson.plan)
  const planLine = cli(...base).stdout.trim().match(/^group-pages plan: pages=3 -> (\/.+\.json)$/)
  assert.ok(planLine)
  assert.equal(JSON.parse(readFileSync(planLine[1], 'utf8')).pages.length, 3)
  const planOut = path.join(dir, 'plan.json')
  assert.match(cli(...base, '--out', planOut).stdout, / -> .*plan\.json\n$/)
  assert.equal(JSON.parse(readFileSync(planOut, 'utf8')).pages.length, 3)
  assert.equal(cli(...base, '--out', path.join(dir, 'spec', 'page-map.json')).status, 2, 'an input is never the output')
  assert.equal(cli(...base, '--kind', 'html', '--out-dir', out, '--out', planOut).status, 2)
  for (const bad of [['--kind', 'html'], [...base, '--kind', 'none', '--out-dir', out], [...base, '--kind', 'html'], [...base, '--kind'], [...base, '--kind', 'html', '--kind', 'url'], [...base, '--bogus', 'x']]) assert.equal(cli(...bad).status, 2, JSON.stringify(bad))
  assert.equal(cli('--contract', path.join(dir, 'nope.json'), '--spec', path.join(dir, 'spec'), '--kind', 'html', '--out-dir', out).status, 2)
})

test('mergeParity: the reports of one group\'s kinds are one picture — routes joined, oldest generation, a disagreement visible', () => {
  const r = (t, at, hash, routes) => ({ target: t, generatedAt: at, inputs: { acceptHash: hash }, routes })
  const m = mergeParity([r('http://a', '2030-01-02T00:00:00Z', 'h', [{ targetPath: '/a' }]), r('http://a', '2030-01-01T00:00:00Z', 'h', [{ targetPath: '/b' }])])
  assert.deepEqual([m.target, m.generatedAt, m.inputs.acceptHash, m.routes.length], ['http://a', '2030-01-01T00:00:00Z', 'h', 2])
  assert.match(mergeParity([r('http://a', 'x', 'h', []), r('http://b', 'x', 'h', [])]).target, /differs/)
  assert.match(mergeParity([r('http://a', 'x', 'h', []), r('http://a', 'x', 'k', [])]).inputs.acceptHash, /differs/)
  assert.equal(mergeParity([]), null)
})

test('a group contract refuses one requested route that two pages answer to', () => {
  // /team is page-map /team AND the seeded route of /about-us: asking for it cannot pick one of them
  const pm = { ...pageMap, pages: [...pageMap.pages, { file: 'AboutUs.html', view: 'page', title: 'About us', path: '/about-us', locale: 'en' }] }
  const seed = { routes: [{ path: '/team', pagemapPath: '/about-us', status: 200 }] }
  const ctx = { pageMap: pm, reviewConfig: { ...reviewConfig, templates: { ...reviewConfig.templates, '/about-us': 'page' } }, themeTemplates, reference: { pages: [] }, specHash: hash('a'), bindings: { specHash: hash('a') }, id: 't--g1', seedReport: seed, targetSite: 'http://127.0.0.1:8081' }
  assert.throws(() => buildContract({ ...ctx, group: { id: 'g1', dossier: '/d', pages: ['/team'] } }), /--pages \/team is ambiguous/)
})

test('a group of the home page and the search view plans one measured path for the search page: route plan, parity pair and --pages agree', () => {
  const map = {
    ...pageMap,
    pages: [pageMap.pages[0], { file: 'Search.html', view: 'search', title: 'Search', path: '/pages/smart-search', locale: 'en' }]
  }
  const config = { ...reviewConfig, search: { default: 'steel' }, templates: { '/': 'front-page', '/pages/smart-search?s=steel': 'search', '/?s=steel': 'search' } }
  const themes = new Set(['front-page', 'search'])
  for (const [routes, measured] of [
    [[{ path: '/pages/smart-search', status: 200 }], '/pages/smart-search?s=steel'],
    [[{ path: '/pages/smart-search', status: 301, location: 'http://x/' }], '/?s=steel']
  ]) {
    const c = buildContract({ pageMap: map, reference: { pages: [] }, reviewConfig: config, themeTemplates: themes, seedReport: { routes }, specHash: hash('a'), group: { id: 'g1', pages: ['/', '/pages/smart-search'], dossier: '/dossier/g1' }, targetSite: 'http://127.0.0.1:8081', bindings: { specHash: hash('a'), seedReportHash: hash('b'), artifactHash: hash('c'), configHash: hash('d') } })
    const search = c.pages.find((p) => p.view === 'search')
    assert.equal(search.path, measured)
    const plan = groupPages(c, map, { kind: 'html', pages: [] })
    assert.deepEqual(plan.map((e) => e.path).sort(), ['/', measured].sort())
    const inp = parityInputs(plan, 'html')
    assert.ok(inp.pairs.rules.some((r) => r.from === '/Search.html' && r.to === measured), JSON.stringify(inp.pairs))
    assert.ok(inp.pages.includes(measured))
  }
})
