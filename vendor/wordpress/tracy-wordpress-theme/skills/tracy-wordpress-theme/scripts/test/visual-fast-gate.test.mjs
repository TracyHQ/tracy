// The Fast Gate on the WordPress kit: a small, deterministic case set resolved from the contract
// (never a hard-coded page list), shot rules derived from the contract (never a hard-coded locale),
// and a verdict that refuses a machine-clean run whose reviewers still owe notes or pictures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { testDir } from './lib/test-root.mjs'
import { buildContract, STAGES } from '../visual/contract.mjs'
import { reportOf, claimsOf, row, clone, WIDTHS } from './lib/intrinsic-fixtures.mjs'
import { auditOf, indexFor, machineRow, notesOf, todoOf, visualOf, writeRunDir } from './lib/visual-evidence-fixtures.mjs'
import { SOURCE_DEPENDENT_CHECKS } from '../visual/applicability.mjs'
import { RECEIPT, problems } from '../visual/evidence.mjs'
import { resolveFastGate, deriveShots, localeRisks, layoutComponents, assessFastGate, affectedCases } from '../visual/fast-gate.mjs'
import { cleanAudit } from './lib/finish-audit.mjs'

// a block theme: templates include parts and patterns; pages carry section types
function theme(templates, parts = ['header', 'footer'], patterns = []) {
  const dir = testDir('fg-theme')
  for (const d of ['templates', 'parts', 'patterns']) mkdirSync(path.join(dir, d))
  for (const p of parts) writeFileSync(path.join(dir, 'parts', `${p}.html`), `<!-- wp:group --><div>${p}</div><!-- /wp:group -->`)
  for (const p of patterns) writeFileSync(path.join(dir, 'patterns', `${p}.php`), `<?php /* Title: ${p} */ ?><div>${p}</div>`)
  for (const [view, body] of Object.entries(templates)) writeFileSync(path.join(dir, 'templates', `${view}.html`), body)
  return dir
}
const tpl = (parts, patterns = [], extra = '') =>
  [...parts.map((p) => `<!-- wp:template-part {"slug":"${p}"} /-->`), ...patterns.map((p) => `<!-- wp:pattern {"slug":"tracy/${p}"} /-->`), extra].join('\n')

function pageMap({ locales = ['en'], texts = {} } = {}) {
  const pages = []
  const shapes = [
    { view: 'front-page', path: '/', title: 'Home', sections: ['hero', 'stats', 'cards'] },
    { view: 'page', path: '/about/', title: 'About', sections: ['stats', 'prose'] },
    { view: 'page', path: '/contact/', title: 'Contact', sections: ['form'] },
    { view: 'archive', path: '/news/', title: 'News', sections: ['cards', 'pager'] },
    { view: 'single', path: '/news/a/', title: 'Article', sections: ['prose', 'toc'] },
    { view: '404', path: '/nope/', title: 'Not found', sections: [] }
  ]
  for (const locale of locales)
    for (const s of shapes) {
      const prefix = locale === 'en' ? '' : `/${locale}`
      pages.push({ file: `${locale === 'en' ? '' : locale + '/'}${s.title}.html`, view: s.view, title: texts[locale]?.[s.title] ?? s.title, path: s.path === '/' ? (prefix ? `${prefix}/` : '/') : `${prefix}${s.path}`, locale, sections: s.sections.map((m) => ({ modules: [m] })) })
    }
  return { locales, defaultLocale: 'en', pages }
}
const reference = (pm) => ({ pages: pm.pages.map((p) => ({ page: p.file, path: `reference/rendered/${p.file.replace(/\W/g, '-')}--1440-light.html` })) })
// Each page is served by the template of its view in these themes; the contract needs it said.
const servedByView = (pm) => Object.fromEntries(pm.pages.map((p) => [p.path, p.view]))
const contractOf = (pm, extra = {}) => buildContract({ pageMap: pm, reference: reference(pm), reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, mega: true, templates: servedByView(pm) }, specHash: 'sha256:x', id: 'fg', ...extra })
const THEME = () =>
  theme({
    'front-page': tpl(['header', 'footer'], ['hero', 'stats-band']),
    page: tpl(['header', 'footer'], ['stats-band']),
    archive: tpl(['header', 'footer', 'sidebar'], ['card-grid']),
    single: tpl(['header', 'footer', 'sidebar'], ['prose']),
    404: tpl(['header', 'footer'], ['search-box'])
  }, ['header', 'footer', 'sidebar'], ['hero', 'stats-band', 'card-grid', 'prose', 'search-box'])

test('fast-gate: layoutComponents reads template parts and patterns from the template, transitively', () => {
  const dir = theme({ page: tpl(['header'], ['hero']) + '\n<!-- wp:template-part {"slug":"footer"} /-->' }, ['header', 'footer'], ['hero'])
  writeFileSync(path.join(dir, 'parts', 'header.html'), '<!-- wp:template-part {"slug":"nav"} /-->')
  writeFileSync(path.join(dir, 'parts', 'nav.html'), '<div/>')
  assert.deepEqual(layoutComponents(dir, { template: 'templates/page.html' }), ['parts/footer.html', 'parts/header.html', 'parts/nav.html', 'patterns/hero.php'])
})

test('fast-gate: the plan covers home, the 404 page, every family (view kind by default), every state, every shared part/pattern/section — with the fewest representatives, deterministically', () => {
  const c = contractOf(pageMap())
  const root = THEME()
  const plan = resolveFastGate(c, { themeDir: root })
  assert.deepEqual(plan.errors, [])
  const pages = plan.cases.map((x) => x.page).sort()
  // home (front-page, hero, stats, cards, mega), en-nope (404), one listing (archive: sidebar, card-grid, pager…),
  // one article (single: sidebar, prose), one page (kind page: stats-band, form…)
  assert.ok(pages.includes('en-home') && pages.includes('en-nope'), pages.join())
  assert.ok(pages.includes('en-news') && pages.includes('en-news-a'), 'listing and article families')
  assert.equal(plan.coverage.families.uncovered.length, 0)
  assert.equal(plan.coverage.components.uncovered.length, 0)
  assert.equal(plan.coverage.states.uncovered.length, 0)
  assert.deepEqual(plan.coverage.stages, { total: 4, covered: 4, uncovered: [] })
  assert.deepEqual(resolveFastGate(c, { themeDir: root }).cases, plan.cases, 'deterministic')
  assert.ok(plan.fullOnly.pages.length > 0 && plan.ratio < 1)
  const home = plan.cases.find((x) => x.page === 'en-home')
  assert.ok(home.why.includes('home') && home.why.includes('state:mega') && home.why.includes('family:home'))
  assert.deepEqual(home.stages, STAGES.map((s) => s.id))
})

test('fast-gate: no 404 page is an error; a one-page site is honestly near the full gate; a wrong override fails; a reasoned add is honoured', () => {
  const pm = pageMap()
  pm.pages = pm.pages.filter((p) => p.view !== '404')
  let plan = resolveFastGate(contractOf(pm), { themeDir: THEME() })
  assert.ok(plan.errors.some((e) => /unknown-route/.test(e)), plan.errors.join('\n'))
  const one = pageMap()
  one.pages = one.pages.filter((p) => ['front-page', '404'].includes(p.view))
  plan = resolveFastGate(contractOf(one), { themeDir: THEME() })
  assert.deepEqual(plan.errors, [])
  assert.equal(plan.nearFull, true)
  const c = contractOf(pageMap())
  plan = resolveFastGate({ ...c, visual: { ...c.visual, fastGate: { add: [{ page: 'nope-page', reason: 'x' }], drop: [{ layout: 'page' }] } } }, { themeDir: THEME() })
  assert.ok(plan.errors.some((e) => /add\[0\]: unknown/.test(e)) && plan.errors.some((e) => /drop\[0\]: reason required/.test(e)))
  plan = resolveFastGate({ ...c, visual: { ...c.visual, fastGate: { add: [{ page: 'en-contact', reason: 'the only form' }] } } }, { themeDir: THEME() })
  assert.deepEqual(plan.errors, [])
  assert.ok(plan.cases.some((x) => x.page === 'en-contact' && x.why[0].startsWith('override:')))
})

test('fast-gate: a locale with a risk of its own (Cyrillic, other fonts) adds the chosen pages on the narrowest variant of each stage; the shot rules add its own source beside them; a Latin locale of the same length adds nothing', () => {
  const texts = { ru: { Home: 'Главная страница', About: 'О компании', Contact: 'Контакты', News: 'Новости компании', Article: 'Статья о заводе', 'Not found': 'Не найдено' } }
  const c = contractOf(pageMap({ locales: ['en', 'ru'], texts }))
  assert.deepEqual(Object.keys(localeRisks(c)), ['ru'])
  const plan = resolveFastGate(c, { themeDir: THEME() })
  const ru = plan.cases.filter((x) => x.locale === 'ru')
  assert.ok(ru.length >= 2 && ru.every((x) => x.variants.join() === '390-light,390-dark'), JSON.stringify(ru.map((x) => [x.page, x.variants])))
  const rules = deriveShots(c).map((r) => `${r.side}:${r.locales.join('+')}:${r.stages.join('+')}:${(r.variants ?? []).join('+') || '*'}:${r.consumers.join('+')}`)
  assert.ok(rules.includes('site:ru:dark-responsive:390-dark:typography'), rules.join('\n'))
  assert.ok(rules.includes('source:ru:light-responsive:390-light:typography'), 'the Russian source at 390, not the English one')
  assert.ok(rules.includes('site:en+ru:light-responsive:*:layout+typography+images'), 'every locale keeps its light-responsive picture (the kit\'s standing rule)')
  const de = contractOf(pageMap({ locales: ['en', 'de'] }))
  assert.deepEqual(localeRisks(de), {})
  assert.ok(resolveFastGate(de, { themeDir: THEME() }).cases.every((x) => x.locale === 'en'))
})

test('fast-gate: --changed names the cases a theme file touches', () => {
  const c = contractOf(pageMap())
  const root = THEME()
  const plan = resolveFastGate(c, { themeDir: root })
  const hit = affectedCases(plan, c, ['patterns/prose.php'], { themeDir: root }).map((x) => x.page)
  assert.deepEqual(hit, ['en-news-a'])
  assert.equal(affectedCases(plan, c, ['parts/header.html'], { themeDir: root }).length, plan.cases.length)
})

// ---- the verdict on a fake run ----
// every fake run has a dossier with a clean current finish audit over the run's own interaction record (lib/finish-audit.mjs)
const audits = new Map()
const gate = (dir, opts = {}) => assessFastGate(dir, { audit: audits.get(dir) ?? null, ...opts })
function fakeRun(c, plan, { notes = {}, machine = [], scope = 'fast-gate', contractHash = 'sha256:c', missing = [], intrinsic, intrinsicFile, summaryIntrinsic } = {}) {
  const dir = testDir('fg-run')
  mkdirSync(path.join(dir, 'notes'))
  const stages = c.visual.stages.map((s) => s.id)
  const stageOf = (v) => c.visual.stages.find((s) => s.variants.includes(v)).id
  const w = (rel, o) => writeFileSync(path.join(dir, rel), JSON.stringify(o))
  const good = reportOf()
  const claims = claimsOf(good)
  const claim = intrinsic === undefined ? claims.intrinsic : intrinsic
  const summaryClaim = summaryIntrinsic === undefined ? claims.summary : summaryIntrinsic
  const visual = visualOf({ kind: scope, cases: plan.cases, stages, stageOf, contractHash, findings: machine.length, intrinsic: claim, summaryIntrinsic: summaryClaim === false ? false : summaryClaim })
  visual.scope = { kind: scope, plan: scope === 'fast-gate' ? plan : null, ...(scope === 'targeted-debug' ? { pages: plan.cases.map((k) => k.page) } : {}) }
  visual.pages.forEach((p) => (p.hash = `sha256:${p.id}`))
  // a source picture the run could not write is the axis's own record (`sourceShotMissing`); index.json lists it from there
  for (const m of missing) for (const p of visual.pages) for (const a of p.axes) if (p.id === m.page && a.variant === m.variant) a.sourceShotMissing = m.reason
  w('visual.json', visual)
  w('index.json', indexFor(visual, dir))
  if (intrinsicFile !== false) w('intrinsic.json', intrinsicFile ?? good)
  w('notes/machine.json', machine)
  for (const id of stages) if (notes[id] !== false) w(`NOTES-${id}.json`, notesOf(id, notes[id] ?? {}))
  const dossier = path.join(dir, '..', `${path.basename(dir)}-dossier`)
  cleanAudit({ dossier, runs: [dir] })
  audits.set(dir, { dossier, site: 'http://site.test', routes: ['/'] })
  return dir
}
test('fast-gate: the verdict passes only a clean, merged, fully reviewed fast-gate run whose contract has not moved; a clean machine alone is not enough', () => {
  const c = contractOf(pageMap())
  const plan = resolveFastGate(c, { themeDir: THEME() })
  const ok = gate(fakeRun(c, plan), { contractHash: 'sha256:c', expectedRoutes: ['/'] })
  assert.deepEqual(ok.reasons, [])
  assert.equal(ok.status, 'pass')
  const reasons = (opts, extra = {}) => gate(fakeRun(c, plan, opts), { contractHash: 'sha256:c', expectedRoutes: ['/'], ...extra }).reasons.join(' ')
  assert.match(reasons({ notes: { 'dark-desktop': { todos: [todoOf({ id: 'N-000001' })] } } }), /dark-desktop: 1 todo\(s\) open/)
  assert.match(reasons({ notes: { 'light-desktop': { lenses: ['layout'] } } }), /light-desktop: lens color never reported/)
  assert.match(reasons({ notes: { 'light-responsive': { missing: [{ file: '/x', lens: 'layout' }] } } }), /1 picture\(s\) not opened/)
  assert.match(reasons({ notes: { 'dark-responsive': false } }), /dark-responsive: notes not merged/)
  assert.match(reasons({ notes: { 'light-desktop': { todos: [todoOf({ id: 'N-0abc12', status: 'done' })] } } }), /1 note\(s\) not closed/)
  assert.match(reasons({ machine: [machineRow({ stage: 'light-desktop' })] }), /machine finding/)
  // the intrinsic mobile probe (#65) belongs to the run
  assert.match(reasons({ intrinsic: null }), /intrinsic mobile probe did not run/)
  assert.match(reasons({ intrinsic: { status: 'not-run', reason: 'needs --source-site' } }), /did not run — needs --source-site/)
  // the claim needs its evidence, and every formerly accepted contradiction is a failed verdict through the same path
  // (the validator's own fixtures — one per invariant — are in intrinsic-report.test.mjs)
  const verdict = (o, extra = {}) => gate(fakeRun(c, plan, o), { contractHash: 'sha256:c', expectedRoutes: ['/'], ...extra })
  const fails = (o, re, why, extra) => {
    const v = verdict(o, extra)
    assert.equal(v.status, 'fail', why)
    assert.match(v.reasons.join(' '), re, why)
  }
  fails({ intrinsicFile: false }, /intrinsic\.json not readable/, 'a claim without its file')
  const base = reportOf()
  const withRow = (r) => reportOf({ rowsAt: { '/@320': [r] } })
  const incomplete = clone(withRow(row('shared-source-defect')))
  incomplete.findings[0] = { class: 'shared-source-defect', kind: 'control-wrap', route: '/', width: 320, extra: 1 }
  fails({ intrinsicFile: incomplete, intrinsic: claimsOf(withRow(row('shared-source-defect'))).intrinsic }, /not the 1 classified row|unknown field/, 'an incomplete shared finding with an unknown field')
  const fixedCounts = clone(base)
  fixedCounts.readings[0].defects = 1
  fixedCounts.readings[0].fixed = 1
  fixedCounts.summary.sourceFixed = 1
  fails({ intrinsicFile: fixedCounts, intrinsic: { ...claimsOf(base).intrinsic, sourceFixed: 1 } }, /retains 0 row/, 'source-fixed counts without source-fixed rows')
  fails({ summaryIntrinsic: { ...claimsOf(base).summary, siteOnly: 1, blocking: 1 } }, /summary\.intrinsic siteOnly 1 ≠ 0/, 'a contradictory visual.summary.intrinsic')
  fails({ summaryIntrinsic: false }, /no summary\.intrinsic block/, 'an absent visual.summary.intrinsic')
  fails({ summaryIntrinsic: {} }, /summary\.intrinsic status/, 'an empty visual.summary.intrinsic')
  fails({ intrinsicFile: reportOf({ routes: ['/', '/extra/'] }), intrinsic: claimsOf(reportOf({ routes: ['/', '/extra/'] })).intrinsic }, /not in the page-map: \/extra\//, 'an extra fully measured route')
  fails({ intrinsicFile: reportOf({ widths: [...WIDTHS, 500] }), intrinsic: claimsOf(reportOf({ widths: [...WIDTHS, 500] })).intrinsic }, /width\(s\) 500 measured that are not owed/, 'an extra fully measured width')
  fails({ intrinsic: { ...claimsOf(base).intrinsic, file: 'other.json' } }, /only intrinsic\.json is read/, 'an alternate report name')
  fails({ intrinsic: { ...claimsOf(base).intrinsic, file: 'other.json' }, intrinsicFile: false }, /only intrinsic\.json is read/, 'an alternate name while intrinsic.json is absent')
  fails({ intrinsic: { ...claimsOf(base).intrinsic, file: '../intrinsic.json' } }, /only intrinsic\.json is read/, 'a traversal name')
  fails({}, /not measured: \/contact\//, 'a route of the page-map the probe left out', { expectedRoutes: ['/', '/contact/'] })
  fails({}, /no valid page-map route inventory/, 'no independent inventory', { expectedRoutes: null })
  const dup = clone(base)
  dup.errors = [{ route: '/', width: 320, error: 'x' }]
  fails({ intrinsicFile: dup, intrinsic: claimsOf(base).intrinsic }, /errors list/, 'an error row with no failed reading')
  // valid controls: clean, a defect the source shares (listed), a defect the port fixed (listed); a site-only defect blocks
  assert.equal(verdict({}).status, 'pass')
  const shared = withRow(row('shared-source-defect'))
  assert.equal(verdict({ intrinsicFile: shared, intrinsic: claimsOf(shared).intrinsic, summaryIntrinsic: claimsOf(shared).summary }).status, 'pass', 'a defect the source shares is listed, not blocking')
  const fixed = withRow(row('source-fixed'))
  assert.equal(verdict({ intrinsicFile: fixed, intrinsic: claimsOf(fixed).intrinsic, summaryIntrinsic: claimsOf(fixed).summary }).status, 'pass', 'a source-fixed defect is listed, not blocking')
  const site = withRow(row('site-only'))
  fails({ intrinsicFile: site, intrinsic: claimsOf(site).intrinsic, summaryIntrinsic: claimsOf(site).summary }, /1 site-only defect/, 'a site-only defect blocks')
  const failedRead = reportOf({ errorAt: { '/@320': 'timeout' } })
  fails({ intrinsicFile: failedRead, intrinsic: claimsOf(failedRead).intrinsic, summaryIntrinsic: claimsOf(failedRead).summary }, /failed reading/, 'a failed reading is never clean')
  assert.match(reasons({ scope: 'targeted-debug' }), /scope is targeted-debug/)
  // a source picture the rules owed and the run could not write fails the stage, not only the index (#19 item 6)
  assert.match(reasons({ missing: [{ layout: 'home', page: 'en-home', variant: '1440-dark', stage: 'dark-desktop', side: 'source', reason: 'the source screenshot failed: x' }] }), /stage dark-desktop: source picture of en-home\/1440-dark missing — the source screenshot failed/)
  assert.match(reasons({}, { contractHash: 'sha256:other' }), /stale: the contract changed/)
  // page hashes recomputed against the tree: a changed part is stale
  const stale = gate(fakeRun(c, plan), { contractHash: 'sha256:c', pageHashOf: (id) => (id === 'en-home' ? 'sha256:moved' : `sha256:${id}`) })
  assert.deepEqual(stale.stale, ['en-home'])
  assert.match(stale.reasons.join(' '), /stale: 1 page\(s\) changed/)
})

// ---- the runner: --scope fast-gate on a mock site, and a full run standing on a fast gate ----
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { run } from '../visual/visual-qa.mjs'
import { specHash } from '../visual/contract.mjs'
const CSS = `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}html[data-theme=dark] body{background:rgb(16,18,20);color:rgb(236,234,228)}main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}a{color:rgb(20,72,58);display:inline-block;padding:4px}.card{background:rgb(255,255,255);padding:16px}html[data-theme=dark] .card{background:rgb(25,28,31)}html[data-theme=dark] a{color:rgb(180,220,200)}`
const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const html = (h1, kind = 'page') => `<!doctype html><html lang="en"><head><style>${CSS}</style><script>try{const m=document.cookie.match(/tracy_theme=(dark|light)/);if(m){document.documentElement.setAttribute('data-theme',m[1])}}catch(e){}</script></head><body class="tracy-page-${kind}"><header><a href="/">Home</a></header><main><h1>${h1}</h1><p class="lead">Design-build main contractor.</p><div class="card">${words}</div><a href="/about/">Read the case study</a></main></body></html>`
function serve(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (p.endsWith('/')) p += 'index.html'
      const file = path.join(dir, p)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end(html('Not found'))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}
function siteFixture() {
  const root = testDir('fg-site')
  const site = path.join(root, 'site')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(site, 'about'), { recursive: true })
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(site, 'index.html'), html('Building the groundwork', 'home'))
  writeFileSync(path.join(site, 'about', 'index.html'), html('About us'))
  for (const f of ['page-map.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  writeFileSync(path.join(spec, 'sections.json'), JSON.stringify({ slotBlock: 'tracy-base/slot', acm: [], custom: [], other: [] }))
  const pm = {
    locales: ['en'],
    defaultLocale: 'en',
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Building the groundwork', path: '/', locale: 'en' },
      { file: 'About.html', view: 'page', title: 'About us', path: '/about/', locale: 'en' },
      { file: '404.html', view: '404', title: 'Not found', path: '/nope/', locale: 'en' }
    ]
  }
  const contract = buildContract({ pageMap: pm, reference: { pages: [] }, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: servedByView(pm) }, specHash: specHash(spec), id: 'mock' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  const themeDir = theme({ 'front-page': tpl(['header', 'footer'], ['hero']), page: tpl(['header', 'footer']), 404: tpl(['header', 'footer'], ['search-box']) }, ['header', 'footer'], ['hero', 'search-box'])
  return { root, site, spec, contractFile, contract, themeDir }
}
const runOn = async (fx, origin, extra = {}) => {
  const out = path.join(fx.root, `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  try {
    return { report: await run({ contract: fx.contractFile, site: origin, out, spec: fx.spec, theme: fx.themeDir, concurrency: 1, megaItems: '.none', ...extra }), out, error: null }
  } catch (error) {
    return { report: null, out, error }
  }
}

test('fast-gate: --scope fast-gate measures the resolver\'s cases on every stage and says so in visual.json / index.json; --pages is targeted-debug; a full run refuses a fast gate without a verdict, a stale one, and accepts a current passing one', async () => {
  const fx = siteFixture()
  const srv = await serve(fx.site)
  try {
    const fast = await runOn(fx, srv.origin, { scope: 'fast-gate' })
    assert.equal(fast.error, null, fast.error?.message)
    assert.equal(fast.report.scope.kind, 'fast-gate')
    assert.deepEqual(fast.report.scope.plan.cases.map((c) => c.page).sort(), ['en-home', 'en-nope'], 'root + 404; About shares nothing beyond the chrome')
    assert.deepEqual(fast.report.pages.map((p) => p.id).sort(), ['en-home', 'en-nope'])
    assert.deepEqual(Object.values(fast.report.summary.stages), ['pass', 'pass', 'pass', 'pass'])
    assert.ok(existsSync(path.join(fast.out, 'FAST-GATE-PLAN.md')))
    assert.equal(JSON.parse(readFileSync(path.join(fast.out, 'index.json'), 'utf8')).scope, 'fast-gate')
    const dbg = await runOn(fx, srv.origin, { pages: 'en-about', stage: 'light-desktop' })
    assert.equal(dbg.report.scope.kind, 'targeted-debug')
    await assert.rejects(runOn(fx, srv.origin, { pages: 'en-about', scope: 'fast-gate' }).then((r) => (r.error ? Promise.reject(r.error) : r)), /targeted-debug/)
    let full = await runOn(fx, srv.origin, { fastGate: fast.out, stage: 'light-desktop' })
    assert.match(String(full.error?.message), /has no verdict/)
    // a receipt is read through its closed schema: one with no recorded page hashes cannot be tied to any page
    const receipt = (over = {}) => ({
      schemaVersion: 1,
      scope: 'fast-gate',
      status: 'pass',
      run: path.resolve(fast.out),
      at: '2026-09-30T00:00:00.000Z',
      contractHash: fast.report.identity.contractHash,
      stages: fast.report.stages.map((st) => st.id),
      cases: fast.report.scope.plan.cases.map((k) => ({ page: k.page, layout: k.layout, stages: k.stages, variants: k.variants })),
      pageHashes: Object.fromEntries(fast.report.pages.map((p) => [p.id, p.hash])),
      intrinsic: { status: 'run', siteOnly: 0, shared: 0, sourceFixed: 0 },
      stale: [],
      reasons: [],
      ...over
    })
    for (const pageHashes of [undefined, {}, [], null]) {
      writeFileSync(path.join(fast.out, 'FAST-GATE.json'), JSON.stringify(receipt({ pageHashes })))
      full = await runOn(fx, srv.origin, { fastGate: fast.out, stage: 'light-desktop' })
      assert.match(String(full.error?.message), /FAST-GATE\.json is malformed.*pageHashes/, JSON.stringify(pageHashes ?? 'absent'))
    }
    writeFileSync(path.join(fast.out, 'FAST-GATE.json'), JSON.stringify(receipt()))
    full = await runOn(fx, srv.origin, { fastGate: fast.out, stage: 'light-desktop' })
    assert.equal(full.error, null, full.error?.message)
    assert.equal(full.report.scope.kind, 'full')
    assert.equal(full.report.fastGate.run, path.resolve(fast.out))
    assert.equal(full.report.pages.length, 3, 'full measures every page')
    // a receipt of a subset of the plan the contract resolves to now authorizes nothing, whatever it says of itself
    const one = fast.report.scope.plan.cases[0]
    writeFileSync(path.join(fast.out, 'FAST-GATE.json'), JSON.stringify(receipt({ cases: [{ page: one.page, layout: one.layout, stages: one.stages, variants: one.variants }], stages: one.stages, pageHashes: { [one.page]: fast.report.pages.find((p) => p.id === one.page).hash } })))
    full = await runOn(fx, srv.origin, { fastGate: fast.out, stage: 'light-desktop' })
    assert.match(String(full.error?.message), /stale or not clean.*the plan owes case/)
    writeFileSync(path.join(fast.out, 'FAST-GATE.json'), JSON.stringify(receipt()))
    // a prior that recorded itself stale (identity.stale or summary.stale) supplies no axis; the same prior without the marker does
    const priorOf = (mutate) => {
      const prior = testDir('reuse-stale')
      const r = clone(fast.report)
      mutate(r)
      writeFileSync(path.join(prior, 'visual.json'), JSON.stringify(r))
      return prior
    }
    const control = await runOn(fx, srv.origin, { reuse: [priorOf(() => {})], stage: 'light-desktop' })
    assert.equal(control.error, null, control.error?.message)
    assert.ok(control.report.summary.reused > 0, 'the control prior is reused')
    for (const [what, mutate] of [['identity.stale', (r) => (r.identity.stale = ['the contract moved'])], ['summary.stale', (r) => (r.summary.stale = ['the contract moved'])]]) {
      const out = await runOn(fx, srv.origin, { reuse: [priorOf(mutate)], stage: 'light-desktop' })
      assert.equal(out.error, null, out.error?.message)
      assert.equal(out.report.summary.reused, 0, `${what}: a run recorded stale is not reused`)
    }
    // a prior run whose visual.json is malformed is refused by name, never reused from
    for (const [what, mutate] of [['pages null', (r) => (r.pages = null)], ['axes of a page a string', (r) => (r.pages[0].axes = 'x')], ['unknown field', (r) => (r.extra = 1)]]) {
      const prior = testDir('reuse-bad')
      const r = clone(fast.report)
      mutate(r)
      writeFileSync(path.join(prior, 'visual.json'), JSON.stringify(r))
      const out = await runOn(fx, srv.origin, { reuse: [prior], stage: 'light-desktop' })
      assert.match(String(out.error?.message), /--reuse .*visual\.json.* is malformed/, what)
    }
    // the theme moved since the verdict → stale
    writeFileSync(path.join(fx.themeDir, 'parts', 'header.html'), '<div>changed</div>')
    full = await runOn(fx, srv.origin, { fastGate: fast.out, stage: 'light-desktop' })
    assert.match(String(full.error?.message), /stale/)
  } finally {
    await srv.close()
  }
})

// ── JA Vega M4b (26/09): a template the layout names and the theme does not have ─────────────────
// layoutComponents skipped a missing file and answered [] — no parts, no patterns — so the fast
// gate and `--changed` did not know six layouts drew parts/header.html and parts/footer.html, and
// one `page` layout named page.html for pages page-service.html serves.
test('fast-gate: a layout whose template is not in the theme is refused, never read as drawing nothing', () => {
  const dir = theme({ page: tpl(['header', 'footer']) })
  assert.throws(() => layoutComponents(dir, { id: 'page-login', template: 'templates/page-login.html' }), /page-login.*templates\/page-login\.html.*not in the theme/)
  assert.throws(() => layoutComponents(dir, { id: 'category', template: null }), /category.*no template/)
  const pm = { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'h', view: 'front-page', title: 'Home', path: '/', locale: 'en' }, { file: 'l', view: 'page-login', title: 'Login', path: '/login/', locale: 'en' }, { file: 'n', view: '404', title: 'Nope', path: '/nope/', locale: 'en' }] }
  const c = buildContract({ pageMap: pm, reference: { pages: [] }, reviewConfig: { containers: { none: 'fixture without a container grid' }, mega: false, templates: { '/': 'front-page', '/login/': 'page-login', '/nope/': '404' } }, specHash: 'sha256:x', id: 'fg' })
  const plan = resolveFastGate(c, { themeDir: theme({ 'front-page': tpl(['header']), 404: tpl(['header']) }) })
  assert.ok(plan.errors.some((e) => /page-login/.test(e) && /not in the theme/.test(e)), JSON.stringify(plan.errors))
})

test('fast-gate --changed: a shared part selects every case whose served template draws it; a custom template selects only its own pages', () => {
  const dir = theme({ 'front-page': tpl(['header', 'footer'], ['hero']), page: tpl(['header', 'footer']), 'page-service': tpl(['header', 'footer'], ['service-faq']), 404: tpl(['header']) }, ['header', 'footer'], ['hero', 'service-faq'])
  const pm = {
    locales: ['en'],
    defaultLocale: 'en',
    pages: [
      { file: 'h', view: 'front-page', title: 'Home', path: '/', locale: 'en' },
      { file: 'l', view: 'page-login', title: 'Login', path: '/login/', locale: 'en' },
      { file: 't', view: 'page', title: 'Typography', path: '/typography/', locale: 'en' },
      { file: 's', view: 'page', title: 'Cloud', path: '/services/cloud/', locale: 'en' },
      { file: 'n', view: '404', title: 'Nope', path: '/nope/', locale: 'en' }
    ]
  }
  const templates = { '/': 'front-page', '/login/': 'page', '/typography/': 'page', '/services/cloud/': 'page-service', '/nope/': '404' }
  const c = buildContract({ pageMap: pm, reference: { pages: [] }, reviewConfig: { containers: { none: 'fixture without a container grid' }, mega: false, templates }, specHash: 'sha256:x', id: 'fg' })
  const plan = resolveFastGate(c, { themeDir: dir })
  assert.deepEqual(plan.errors, [])
  // every page is a case here, so the selection is what the files decide
  const all = { ...plan, cases: c.pages.map((p) => ({ page: p.id, layout: p.layout })) }
  assert.deepEqual(affectedCases(all, c, ['parts/footer.html'], { themeDir: dir }).map((x) => x.page).sort(), ['en-home', 'en-login', 'en-services-cloud', 'en-typography'])
  assert.deepEqual(affectedCases(all, c, ['templates/page-service.html'], { themeDir: dir }).map((x) => x.page), ['en-services-cloud'])
  assert.deepEqual(affectedCases(all, c, ['patterns/service-faq.php'], { themeDir: dir }).map((x) => x.page), ['en-services-cloud'])
  assert.deepEqual(affectedCases(all, c, ['templates/page.html'], { themeDir: dir }).map((x) => x.page).sort(), ['en-login', 'en-typography'])
})

// JA Vega M4c (#19 item 6): `dd-0`/`dr-0` shot the site alone on 1440-dark and 390-dark, so the
// color and layout lenses of a dark stage compared the dark site with the LIGHT source picture.
// A source that can be put into dark (its export's own hook, or a request cookie for a live source)
// is shot in dark for the lenses of that stage, on the representative, default locale; a source
// with no dark of its own gets no dark source rule — nothing can honour it.
test('fast-gate: a source with a dark of its own is shot on the dark stages for their lenses; without one there is no dark source rule', () => {
  const line = (r) => `${r.side}:${r.locales.join('+')}:${r.stages.join('+')}:${(r.variants ?? []).join('+') || '*'}:${r.consumers.join('+')}`
  const withHook = { ...pageMap(), theme: { hook: { attribute: 'data-theme', darkValue: 'dark' } } }
  const rules = deriveShots(contractOf(withHook)).map(line)
  assert.ok(rules.includes('source:en:dark-desktop:*:color+layout'), rules.join('\n'))
  assert.ok(rules.includes('source:en:dark-responsive:*:layout+color'), rules.join('\n'))
  assert.ok(rules.includes('source:en:light-desktop+light-responsive:*:layout+typography+images'), 'the light source rule is unchanged')
  const live = deriveShots(contractOf(pageMap(), { sourceSite: 'http://127.0.0.1:1', sourceDarkRequestHook: 'cookie:theme=dark' })).map(line)
  assert.ok(live.includes('source:en:dark-desktop:*:color+layout'), 'a live source put into dark by a request cookie: ' + live.join('\n'))
  const none = deriveShots(contractOf(pageMap())).map(line)
  assert.ok(!none.some((r) => /^source:.*dark-/.test(r)), none.join('\n'))
})

test('fast-gate: reference.kind=none has no source screenshot obligation but retains target shots', () => {
  const pm = { defaultLocale: 'en', locales: ['en'], pages: [{ file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en' }] }
  const c = contractOf(pm, { reference: { kind: 'none', pages: [] } })
  const rules = deriveShots(c)
  assert.ok(rules.some((r) => r.side === 'site'), 'target screenshots remain required')
  assert.ok(!rules.some((r) => r.side === 'source'), 'none pages must not create a missing source screenshot')
})

test('fast-gate validates bound applicability and reports not-applicable totals separately', () => {
  const dir = testDir('fg-none-forged')
  writeRunDir(dir)
  const visual = visualOf()
  const page = visual.pages[0]
  page.referenceKind = 'none'
  page.axes[0].notApplicable = SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' }))
  page.axes[0].menus = { measured: true, targetOnly: true, site: { headers: 0, triggers: 0, openAtRest: 0, overCap: 0, labels: [], drawers: 0, kinds: [] }, source: null, pairs: 0, menus: [], unmatched: [], notMeasured: [], ms: 1, comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' } }
  const result = assessFastGate(dir, { visual, audit: auditOf(dir), referenceKinds: { p1: 'html' } })
  assert.ok(result.reasons.some((reason) => /referenceKind none differs from the contract \(html\)/.test(reason)), JSON.stringify(result.reasons))
  const boundNone = assessFastGate(dir, { visual, audit: auditOf(dir), referenceKinds: { p1: 'none' } })
  assert.ok(SOURCE_DEPENDENT_CHECKS.every((check) => boundNone.notApplicable[check] === 1), JSON.stringify(boundNone.notApplicable))
  assert.deepEqual(problems(boundNone, RECEIPT, 'FAST-GATE.json'), [])
})

test('fast-gate without --spec keeps legacy html behavior and refuses unbound N/A evidence', () => {
  const dir = testDir('fg-no-spec-kind')
  writeRunDir(dir)
  const html = visualOf()
  html.pages[0].referenceKind = 'html'
  const htmlResult = assessFastGate(dir, { visual: html, audit: auditOf(dir), expectedRoutes: ['/'], referenceKinds: {} })
  assert.equal(htmlResult.status, 'pass', JSON.stringify(htmlResult.reasons))

  const none = JSON.parse(JSON.stringify(html))
  none.pages[0].referenceKind = 'none'
  none.pages[0].axes[0].notApplicable = SOURCE_DEPENDENT_CHECKS.map((check) => ({ check, status: 'not-applicable', reason: 'reference.kind=none' }))
  none.pages[0].axes[0].menus = { measured: true, targetOnly: true, site: { headers: 0, triggers: 0, openAtRest: 0, overCap: 0, labels: [], drawers: 0, kinds: [] }, source: null, pairs: 0, menus: [], unmatched: [], notMeasured: [], ms: 1, comparison: { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' } }
  const unbound = assessFastGate(dir, { visual: none, audit: auditOf(dir), referenceKinds: {} })
  assert.ok(unbound.reasons.some((reason) => /not-applicable evidence requires --spec to bind reference\.kind=none/.test(reason)), JSON.stringify(unbound.reasons))
})

test('fast-gate: shared-component coverage reads the contract\'s resolved section types, with a populated sections dossier too', () => {
  const pm = pageMap()
  // the page-map holds module ids, the dossier says which type each is
  const ids = { hero: '101', stats: '102', cards: '103', prose: '104', toc: '105', form: '106', pager: '107' }
  for (const p of pm.pages) p.sections = p.sections.map((s) => ({ modules: s.modules.map((m) => ids[m] ?? m) }))
  const acm = Object.entries(ids).map(([type, id]) => ({ id, type, style: 'style-1', title: type, position: 'main', scope: 'page', published: true, ordering: 1, showtitle: false, pages: [], spacing: { top: null, bottom: null }, moduleClass: '', itemGroup: {}, fields: {}, items: [] }))
  const sections = { slotBlock: 'tracy-base/slot', acm, custom: [], other: [] }
  const resolved = contractOf(pm, { sections })
  const typed = contractOf(pageMap())
  assert.ok(resolved.pages.some((p) => p.sections.includes('stats:style-1')), JSON.stringify(resolved.pages.map((p) => p.sections)))
  assert.deepEqual(resolved.pending.filter((x) => x.what === 'section'), [])
  const plan = resolveFastGate(resolved, { themeDir: THEME() })
  assert.deepEqual(plan.errors, [])
  assert.ok(plan.coverage.components.total > 0 && plan.coverage.components.uncovered.length === 0)
  const sharedOf = (c) => resolveFastGate(c, { themeDir: THEME() }).coverage.components.total
  assert.equal(sharedOf(resolved), sharedOf(typed), 'resolved types count as shared exactly as direct type keys do')
})
