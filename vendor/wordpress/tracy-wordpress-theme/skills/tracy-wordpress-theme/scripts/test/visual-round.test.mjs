// visual-round.test.mjs — the Visual QA fix loop: the determinism preflight, the change → pages
// selector (affected.mjs), the loop's decisions (rounds.mjs) and the orchestrator (round.mjs) end
// to end on a two-page mock site served from a temp dir.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import fs, { mkdtempSync, mkdirSync, readdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizeHtml, checkDeterminism } from '../visual/determinism.mjs'
import { cssRules, changedRules, selectorsFor, classifyChanges, pagesMatching } from '../visual/affected.mjs'
import { compareRuns, churn, ownerOf, ownersOf, stopRule, nextStep, lensesDue, lensesOf, missingLensNotes, isListingLayout, stableCount } from '../visual/rounds.mjs'
import { planScope, changedFiles, tierLines, runRound, loadConfig, packArtifacts, bindingFor, writeBinding, BINDING_FILE, BINDING_SCHEMA } from '../visual/round.mjs'
import { sumsText } from '../quickstart/lib.mjs'
import { buildContract, specHash } from '../visual/contract.mjs'

// ── determinism ─────────────────────────────────────────────────────────────────────────────────
test('determinism: nonces and the CF7 unit id are not content; a listing whose order changes per request is', async () => {
  const a = '<input type="hidden" name="_wpnonce" value="aa11"><script>var w={"nonce":"x1"}</script><div id="wpcf7-f1-p2-o1" data-nonce="n1">'
  const b = '<input type="hidden" name="_wpnonce" value="bb22"><script>var w={"nonce":"y2"}</script><div id="wpcf7-f1-p2-o3" data-nonce="n2">'
  assert.equal(normalizeHtml(a), normalizeHtml(b))
  let n = 0
  const fetchImpl = async (url) => ({ text: async () => (url.includes('/blog/') ? `<li>${n++ % 2 ? 'a</li><li>b' : 'b</li><li>a'}</li>` : '<p>same</p>') })
  const r = await checkDeterminism({ pages: [{ id: 'home', path: '/' }, { id: 'blog', path: '/blog/' }], site: 'http://x', fetches: 3, fetchImpl })
  assert.deepEqual(r.nondeterministic, ['blog'])
  assert.equal(r.pages.home.variants, 1)
  assert.equal(r.pages.blog.variants, 2)
  const failing = await checkDeterminism({ pages: [{ id: 'home', path: '/' }], site: 'http://x', fetches: 2, fetchImpl: async () => { throw new Error('refused') } })
  assert.equal(failing.errors[0].page, 'home', 'a page that cannot be fetched is reported, not passed')
})

// ── affected ────────────────────────────────────────────────────────────────────────────────────
test('affected: changed rules are keyed by at-rule context + selector; a comment is no change; pseudo-classes are stripped', () => {
  const a = '/* one */ .a{color:red} @media (max-width:600px){.b{color:blue}} .c:hover, .d::before{x:1}'
  const b = '/* two */ .a{ color:red } @media (max-width:700px){.b{color:blue}} .c:hover, .d::before{x:2}'
  const keys = changedRules(a, b)
  assert.equal(keys.length, 3, keys.join(' | '))
  assert.ok(!keys.some((k) => k.endsWith('.a')), 'whitespace and comments do not change a rule')
  assert.deepEqual(selectorsFor(keys), { full: null, selectors: ['.b', '.c', '.d'] })
  assert.match(selectorsFor(changedRules('@font-face{font-family:X;src:url(a)}', '@font-face{font-family:X;src:url(b)}')).full, /@font-face/)
  assert.throws(() => cssRules('.a{color:red'), /unbalanced/)
  assert.deepEqual(selectorsFor(changedRules('', ':root{--x:1}')).selectors, ['*'], ':root reaches every page')
})

test('affected: theme files are classified fail closed — CSS by selector, templates/parts/patterns by served HTML, the rest full', () => {
  const c = classifyChanges(['assets/css/tracy.css', 'assets/css/tokens.css', 'parts/header.html', 'templates/page.html', 'patterns/hero.php', 'theme.json', 'functions.php', 'inc/x.php', 'assets/js/menu.js', 'readme.txt'])
  assert.deepEqual(c.css, ['assets/css/tracy.css'])
  assert.deepEqual(c.html, ['parts/header.html', 'templates/page.html', 'patterns/hero.php'])
  assert.deepEqual(c.full.map((f) => f.file), ['assets/css/tokens.css', 'theme.json', 'functions.php', 'inc/x.php', 'assets/js/menu.js', 'readme.txt'])
})

// ── rounds ──────────────────────────────────────────────────────────────────────────────────────
const F = (kind, element = 'h1', axis = '1440-light', extra = {}) => ({ kind, element, axis, ...extra })
test('rounds.compareRuns: multisets per page; pointer kinds and nondeterministic pages counted apart; axis-error pages skipped', () => {
  const before = new Map([
    ['a', { id: 'a', findings: [F('parity-mismatch'), F('parity-mismatch'), F('image-missing'), F('mega-menu')] }],
    ['b', { id: 'b', findings: [F('parity-mismatch', 'li')] }],
    ['c', { id: 'c', findings: [F('parity-mismatch')] }]
  ])
  const after = [
    { id: 'a', findings: [F('parity-mismatch'), F('unclassified-element', 'p')] },
    { id: 'b', findings: [F('parity-mismatch', 'ul')] },
    { id: 'c', findings: [F('axis-error')] },
    { id: 'd', findings: [] }
  ]
  const d = compareRuns(before, after, { nondeterministic: ['b'] })
  assert.deepEqual(d.deterministic, { pages: 1, same: 1, closed: 2, new: 1 })
  assert.deepEqual(d.nondeterministic, { pages: 1, same: 0, closed: 1, new: 1 })
  assert.deepEqual(d.pointer, { closed: 1, new: 0 })
  assert.equal(d.skippedAxisError, 1)
  assert.deepEqual(d.notMeasuredBefore, ['d'])
})

test('rounds.churn: new ÷ closed on deterministic pages; above 0.3 means fix again before a full run', () => {
  const diff = (closed, added) => ({ deterministic: { closed, new: added } })
  assert.equal(churn(diff(10, 3)).verdict, 'pass')
  assert.equal(churn(diff(10, 4)).verdict, 'fix-again-before-full')
  assert.equal(churn(diff(0, 2)).verdict, 'fix-again-before-full', 'new findings and nothing closed')
  assert.deepEqual(churn(diff(0, 0)), { ratio: 0, limit: 0.3, verdict: 'pass' })
})

test('rounds.ownerOf: the kind+layout rule — listing pages route style and coverage findings to the seeder group', () => {
  const page = { id: 'page' }
  const cat = { id: 'category' }
  assert.equal(ownerOf(F('parity-mismatch'), page), 'tokens-css')
  assert.equal(ownerOf(F('parity-mismatch'), cat), 'seeder-spec')
  assert.equal(ownerOf(F('unclassified-element'), page), 'tokens-css')
  assert.equal(ownerOf(F('unclassified-element'), { id: 'tag' }), 'seeder-spec')
  assert.equal(ownerOf(F('image-missing'), cat), 'templates-patterns')
  assert.equal(ownerOf(F('examined-too-few'), page), 'LEE')
  assert.equal(ownerOf(F('scan:hover-not-measured'), page), 'noise')
  assert.equal(ownerOf(F('axis-error'), page), 'tool')
  assert.equal(isListingLayout({ id: 'front-page' }), false)
  assert.equal(isListingLayout({ id: 'x', family: 'listing' }), true)
  const groups = ownersOf([{ id: 'p1', layout: 'page', findings: [F('parity-mismatch')] }, { id: 'n1', layout: 'category', findings: [F('parity-mismatch')] }], { layouts: [{ id: 'page' }, { id: 'category' }] }, { nondeterministic: ['n1'] })
  assert.equal(groups['tokens-css'].findings, 1)
  assert.deepEqual(groups['seeder-spec'].pages, ['n1'], 'a nondeterministic page goes to the seeder group as a page')
  assert.equal(groups['seeder-spec'].findings, 0)
})

test('rounds.stopRule and nextStep: a targeted run never closes a tier; the bound, the churn guard and the stop rule decide in order', () => {
  assert.equal(stopRule(null, 50).stop, false)
  // net progress decides, not a 20 % drop: 100 → 85 went down and continues; flat or up stops
  assert.equal(stopRule(100, 85).stop, false)
  assert.equal(stopRule(100, 100).stop, true)
  assert.equal(stopRule(100, 70).stop, false)
  const base = { round: 1, maxRounds: 3, churnVerdict: 'pass', stop: null, findings: 0, unclassified: 0, nondeterministic: 0, axisErrors: 0 }
  assert.equal(nextStep({ ...base, scope: 'targeted' }).next, 'full')
  assert.equal(nextStep({ ...base, scope: 'full' }).next, 'close-tier')
  assert.equal(nextStep({ ...base, scope: 'full', nondeterministic: 2 }).next, 'fix')
  assert.equal(nextStep({ ...base, scope: 'targeted', findings: 5, churnVerdict: 'fix-again-before-full' }).next, 'fix-again')
  assert.equal(nextStep({ ...base, scope: 'full', findings: 5, stop: { stop: true, reason: 'x' } }).next, 'stop-decision-list')
  assert.equal(nextStep({ ...base, scope: 'full', findings: 5, round: 3 }).next, 'replan')
  assert.equal(nextStep({ ...base, scope: 'full', findings: 5 }).next, 'fix')
  assert.match(lensesDue({ tierFirstRun: true, next: 'fix' }), /^layout/)
  assert.match(lensesDue({ tierFirstRun: false, next: 'close-tier' }), /^all lenses/)
  assert.equal(lensesDue({ tierFirstRun: false, next: 'fix' }), null)
})

test('round.planScope: first round full; contract or global file change full; CSS by selector; HTML by hash, nondeterministic pages excluded', async () => {
  const contract = { pages: [{ id: 'a', path: '/a/' }, { id: 'b', path: '/b/' }, { id: 'c', path: '/c/' }] }
  const prev = { contractHash: 'h1', theme: { 'assets/css/x.css': '1', 'parts/header.html': '1' }, cssDir: '/nonexistent', html: { a: '1', b: '1', c: '1' }, nondeterministic: [] }
  const common = { contract, contractHashNow: 'h1', themeDir: '/nonexistent', nondeterministic: [], site: 'http://x' }
  assert.equal((await planScope({ ...common, prev: null, themeNow: prev.theme, html: prev.html })).kind, 'full')
  assert.equal((await planScope({ ...common, prev, contractHashNow: 'h2', themeNow: prev.theme, html: prev.html })).kind, 'full')
  const global = await planScope({ ...common, prev, themeNow: { ...prev.theme, 'theme.json': '2' }, html: prev.html })
  assert.equal(global.kind, 'full')
  assert.match(global.reason, /theme\.json/)
  assert.equal((await planScope({ ...common, prev, themeNow: prev.theme, html: prev.html })).kind, 'none')
  const byHtml = await planScope({ ...common, prev, themeNow: { ...prev.theme, 'parts/header.html': '2' }, html: { a: '1', b: '2', c: '2' }, nondeterministic: ['c'] })
  assert.deepEqual([byHtml.kind, byHtml.pages], ['targeted', ['b']])
  const byCss = await planScope({ ...common, prev, themeNow: { ...prev.theme, 'assets/css/x.css': '2' }, html: prev.html, affectedImpl: async ({ selectors }) => ({ affected: ['c'], failClosed: false, selectors }) })
  assert.deepEqual([byCss.kind, byCss.pages], ['targeted', ['c']])
  const bad = await planScope({ ...common, prev, themeNow: { ...prev.theme, 'assets/css/x.css': '2' }, html: prev.html, affectedImpl: async () => ({ affected: [], failClosed: true }) })
  assert.equal(bad.kind, 'full')
  assert.deepEqual(changedFiles({ a: '1', b: '1' }, { a: '1', c: '1' }), ['b', 'c'])
  assert.deepEqual(tierLines([{ stage: 's', run: 1, tierStart: true }, { stage: 's', run: 2 }, { stage: 't', run: 3 }, { stage: 's', run: 4, tierStart: true }, { stage: 's', run: 5 }], 's').map((l) => l.run), [4, 5])
})

// ── end to end on a mock site ───────────────────────────────────────────────────────────────────
const CSS = 'body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}'
const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const sitePage = (h1, extra = '') => `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/assets/css/site.css"></head><body class="tracy-page-page"><main><h1>${h1}</h1>${extra}${words}</main></body></html>`
const srcPage = (h1, extra = '') => `<!doctype html><html lang="en"><head><style>${CSS}</style></head><body><main><h1>${h1}</h1>${extra}${words}</main></body></html>`
let srv
let root
before(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'vqa-round-'))
  const site = path.join(root, 'site')
  const theme = path.join(root, 'theme')
  const spec = path.join(root, 'spec')
  const runRoot = path.join(root, 'dossier')
  for (const d of [path.join(site, 'about'), path.join(site, 'team'), path.join(theme, 'assets', 'css'), path.join(spec, 'reference', 'rendered'), runRoot]) mkdirSync(d, { recursive: true })
  writeFileSync(path.join(site, 'about', 'index.html'), sitePage('About us'))
  writeFileSync(path.join(site, 'team', 'index.html'), sitePage('Our team', '<p class="team-only">Team lead of the studio</p>'))
  writeFileSync(path.join(theme, 'assets', 'css', 'site.css'), CSS)
  // the built theme holds the template both pages are served by (the page hash reads it)
  mkdirSync(path.join(theme, 'templates'), { recursive: true })
  writeFileSync(path.join(theme, 'templates', 'page.html'), '<!-- wp:post-content /-->')
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), srcPage('About us'))
  // the source draws the team page's h1 larger: a finding that stays open through every round
  writeFileSync(path.join(spec, 'reference', 'rendered', 'team--1440-light.html'), srcPage('Our team', '<p>Team lead of the studio</p>').replace('</style>', 'h1{font-size:48px}</style>'))
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'About.html', view: 'page', title: 'About us', path: '/about/', locale: 'en' }, { file: 'Team.html', view: 'page', title: 'Our team', path: '/team/', locale: 'en' }] }
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }, { page: 'Team.html', path: 'reference/rendered/team--1440-light.html' }] }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page' } }, specHash: specHash(spec), id: 'mock' })
  writeFileSync(path.join(runRoot, 'visual.contract.json'), JSON.stringify(contract))
  // "deploy" applies what each named round changes: r1 nothing, r2 one CSS rule only the team page
  // matches, r2b nothing, r3 the about page's HTML, r4 another team-only rule.
  writeFileSync(
    path.join(root, 'deploy.mjs'),
    `import { writeFileSync, appendFileSync } from 'node:fs'
const [name, root] = process.argv.slice(2)
if (name === 'r2') appendFileSync(root + '/theme/assets/css/site.css', '.team-only{color:rgb(20,23,26)}')
if (name === 'r4') appendFileSync(root + '/theme/assets/css/site.css', '.team-only{font-weight:400}')
if (name === 'r3') writeFileSync(root + '/site/about/index.html', ${JSON.stringify(sitePage('About us', '<p>Founded in 2004 by two engineers.</p>'))})
console.log('deployed', name)`
  )
  srv = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const base = p.startsWith('/assets/') ? theme : site
      if (p.endsWith('/')) p += 'index.html'
      const file = path.join(base, p)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html lang="en"><body><main><h1>Not found</h1></main></body></html>')
        return
      }
      res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    })
    s.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => s.close(r)) }))
  })
  writeFileSync(
    path.join(root, 'round.json'),
    JSON.stringify({ runRoot: 'dossier', evidence: 'evidence', site: srv.origin, spec: 'spec', theme: 'theme', stage: 'light-desktop', concurrency: 2, fetches: 2, steps: { deploy: { cmd: [process.execPath, '${CONFIG_DIR}/deploy.mjs', '${NAME}', '${CONFIG_DIR}'] } } })
  )
})
after(async () => srv?.close())

test('affected.pagesMatching: the live DOM decides; a selector the browser rejects fails closed', async () => {
  const pages = [{ id: 'en-about', path: '/about/' }, { id: 'en-team', path: '/team/' }]
  const hit = await pagesMatching({ site: srv.origin, pages, selectors: ['.team-only'] })
  assert.deepEqual(hit.affected, ['en-team'])
  const bad = await pagesMatching({ site: srv.origin, pages, selectors: ['.a:::b'] })
  assert.equal(bad.failClosed, true)
  assert.deepEqual(bad.affected, ['en-about', 'en-team'])
})

test('round: full baseline, then a CSS rule measures only the page it matches, then an HTML change only its page; one ledger line each, timed by the script', async () => {
  const cfg = path.join(root, 'round.json')
  const r1 = await runRound(['--config', cfg, '--name', 'r1'])
  assert.equal(r1.failedStep, undefined, JSON.stringify(r1))
  assert.equal(r1.scope.kind, 'full')
  assert.equal(r1.tierStart, true)
  assert.equal(r1.round, 0)
  assert.ok(r1.durations_s.deploy >= 0 && r1.durations_s.visualQa > 0 && r1.durations_s.determinism >= 0)
  assert.deepEqual(r1.determinism.nondeterministic, [])
  assert.ok(r1.findings.total >= 1, 'the baseline has an open finding')
  assert.equal(r1.next, 'fix')
  assert.match(r1.lensesDue, /^layout/, 'the layout lens runs at the start of a tier')
  assert.ok(r1.owners['tokens-css'], JSON.stringify(r1.owners))
  // the layout lens r1 asked for writes its note before the next deploy (the lens gate)
  writeFileSync(path.join(r1.out, 'notes', 'layout.md'), '# Layout lens\n')
  const r2 = await runRound(['--config', cfg, '--name', 'r2'])
  assert.equal(r2.scope.kind, 'targeted', JSON.stringify(r2.scope))
  assert.deepEqual(r2.scope.pages, ['en-team'])
  assert.equal(r2.round, 1)
  assert.equal(r2.measuredPages, 1)
  assert.notEqual(r2.next, 'close-tier', 'a targeted round never closes a tier')
  assert.ok(r2.findings.same >= 1, 'the open team finding is the same finding, compared against the baseline')
  assert.deepEqual([r2.findings.closed, r2.findings.new], [0, 0], 'the rule changed nothing measured')
  assert.equal(r2.churn.verdict, 'pass')
  const same = await runRound(['--config', cfg, '--name', 'r2b'])
  assert.equal(same.scope.kind, 'none', 'a redeploy that changed nothing measures nothing')
  assert.equal(same.round, 2)
  const r3 = await runRound(['--config', cfg, '--name', 'r3'])
  assert.deepEqual(r3.scope.pages, ['en-about'], JSON.stringify(r3.scope))
  assert.equal(r3.round, 2, 'the no-change redeploy spent no round')
  const ledger = readFileSync(path.join(root, 'evidence', 'rounds.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(ledger.map((l) => l.run), ['r1', 'r2', 'r2b', 'r3'])
  assert.ok(existsSync(path.join(root, 'evidence', 'r2.round', 'visualQa.log')))
  await assert.rejects(() => runRound(['--config', cfg, '--name', 'r3']), /already exists/)
})

test('round: a fourth deploying round in one tier is refused and recorded; --new-tier starts a new count', async () => {
  const cfg = path.join(root, 'round.json')
  const r4 = await runRound(['--config', cfg, '--name', 'r4'])
  assert.equal(r4.round, 3)
  const r5 = await runRound(['--config', cfg, '--name', 'r5'])
  assert.equal(r5.failedStep, 'bound')
  assert.match(r5.why, /replan/)
  const r6 = await runRound(['--config', cfg, '--name', 'r6', '--new-tier'])
  assert.equal(r6.tierStart, true)
  assert.equal(r6.round, 0)
  assert.equal(r6.scope.kind, 'full')
})

test('rounds: a scan finding named by page position keeps its identity when the page moves', () => {
  const page = (y) => [{ id: 'p', findings: [{ axis: '1440-light', kind: 'scan:doubled-seam', what: `h@${y}: DIV:bB  +  DIV:bT` }] }]
  const before = new Map(page(1335).map((p) => [p.id, p]))
  const d = compareRuns(before, page(1375))
  assert.equal(d.deterministic.same, 1)
  assert.equal(d.deterministic.new, 0)
  assert.equal(d.deterministic.closed, 0)
})

test('rounds: the churn guard does not judge a tiny sample that is not net worse', () => {
  const diff = (closed, added) => ({ deterministic: { closed, new: added } })
  const small = churn(diff(1, 1))
  assert.equal(small.verdict, 'pass')
  assert.match(small.note, /sample 2 < 5/)
  assert.equal(churn(diff(1, 2)).verdict, 'fix-again-before-full', 'net worse is judged whatever the sample')
  assert.equal(churn(diff(10, 4)).verdict, 'fix-again-before-full')
})

test('determinism: plugin ids minted per request are ignored, content order is not', () => {
  assert.equal(normalizeHtml('<form id="formAcym33991" name="formAcym33991">'), normalizeHtml('<form id="formAcym47931" name="formAcym47931">'))
  assert.notEqual(normalizeHtml('<h3>Alpha</h3><h3>Beta</h3>'), normalizeHtml('<h3>Beta</h3><h3>Alpha</h3>'))
  assert.equal(normalizeHtml('<input id="email_field_607">'), normalizeHtml('<input id="email_field_519">'))
  assert.equal(normalizeHtml('<script>var P = "nocache=1790383506";</script>'), normalizeHtml('<script>var P = "nocache=1790383507";</script>'))
  assert.equal(normalizeHtml('post-123 in 2026'), 'post-123 in 2026', 'short ids and plain numbers stay')
})

// JA Vega M4 (26/09): the hover scan's `scan:hover-jump` moved with the pointer (a link inside a
// closed panel, a different one on each page) and counted as deterministic churn: ld-3 churn 1.11,
// 16 of 31 findings "new". Every `scan:hover-*` kind is a pointer kind.
test('rounds: every scan:hover-* kind is a pointer kind — it moves no churn and no stop count', () => {
  const before = new Map([['a', { id: 'a', findings: [F('parity-mismatch')] }]])
  const after = [{ id: 'a', findings: [F('parity-mismatch'), F('scan:hover-jump', 'a.x "Mobile Apps"'), F('scan:hover-not-measured', 'a.y "Cloud"')] }]
  const d = compareRuns(before, after)
  assert.deepEqual([d.deterministic.new, d.pointer.new], [0, 2])
  assert.equal(stableCount(after, new Set(['a'])), 1)
})

// JA Vega M4 (26/09): ld-0 said `lensesDue: "layout (…)"`, nothing stopped ld-1 from deploying
// without notes/layout.md, and the layout lens ran only at ld-3 (M4.7). A deploying round is
// refused before any build step while a lens the tier asked for has no note; the note of the run
// that asked for it is what counts.
test('round: a deploy is refused before build while the tier\'s due lens has no note, and runs once it has one', async () => {
  const gate = mkdtempSync(path.join(tmpdir(), 'vqa-gate-'))
  const runRoot = path.join(gate, 'dossier')
  const evidence = path.join(gate, 'evidence')
  const baseline = path.join(evidence, 'g0')
  mkdirSync(runRoot, { recursive: true })
  mkdirSync(path.join(baseline, 'notes'), { recursive: true })
  writeFileSync(path.join(baseline, 'notes', 'machine.md'), '# Machine notes\n')
  const contract = buildContract({ pageMap: { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'A.html', view: 'page', title: 'A', path: '/a/', locale: 'en' }] }, reference: { pages: [] }, reviewConfig: { containers: { none: 'fixture without a container grid' }, mega: false, templates: { '/a/': 'page' } }, specHash: 'sha256:x', id: 'gate' })
  writeFileSync(path.join(runRoot, 'visual.contract.json'), JSON.stringify(contract))
  // an earlier tier's layout note is not this tier's
  mkdirSync(path.join(evidence, 'old', 'notes'), { recursive: true })
  writeFileSync(path.join(evidence, 'old', 'notes', 'layout.md'), '# old tier\n')
  const ledger = [
    { run: 'old', stage: 'light-desktop', tierStart: true, round: 0, deployed: true, out: path.join(evidence, 'old'), scope: { kind: 'full' }, lensesDue: 'layout (representative page of each layout)', next: 'fix' },
    { run: 'g0', stage: 'light-desktop', tierStart: true, round: 0, deployed: true, out: baseline, scope: { kind: 'full' }, lensesDue: 'layout (representative page of each layout)', next: 'fix' }
  ]
  writeFileSync(path.join(evidence, 'rounds.jsonl'), ledger.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const marker = path.join(gate, 'built')
  writeFileSync(
    path.join(gate, 'round.json'),
    JSON.stringify({ runRoot: 'dossier', evidence: 'evidence', site: 'http://127.0.0.1:9', stage: 'light-desktop', steps: { build: { cmd: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1'); process.exit(3)`] } } })
  )
  const refused = await runRound(['--config', path.join(gate, 'round.json'), '--name', 'g1'])
  assert.equal(refused.failedStep, 'lenses', JSON.stringify(refused))
  assert.match(refused.why, /notes\/layout\.md/)
  assert.equal(existsSync(marker), false, 'no build ran')
  writeFileSync(path.join(baseline, 'notes', 'layout.md'), '# Layout lens\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n')
  const passed = await runRound(['--config', path.join(gate, 'round.json'), '--name', 'g2'])
  assert.equal(passed.failedStep, 'build', JSON.stringify(passed))
  assert.equal(existsSync(marker), true, 'the gate let the build run')
})

// "All lenses" is resolved from the contract's visual.shots consumers. When the contract could not be
// read, those consumers were [] and the gate asked for no note at all: a deploy went through with
// every lens of the tier's close unwritten. Consumers that cannot be determined refuse the deploy.
test('rounds: "all lenses" with consumers that cannot be determined is a missing note, not none', () => {
  const closed = { run: 'c0', out: '/ev/c0', lensesDue: 'all lenses the contract names for the tier (visual.shots consumers)', lenses: [] }
  assert.equal(lensesOf(closed, null), null)
  assert.equal(lensesOf(closed, []), null)
  assert.deepEqual(lensesOf(closed, ['layout', 'color']), ['layout', 'color'])
  const missing = missingLensNotes([closed], { stageConsumers: null, noteSize: () => 100 })
  assert.equal(missing.length, 1)
  assert.equal(missing[0].run, 'c0')
  assert.match(missing[0].why, /consumers/)
  assert.deepEqual(missingLensNotes([closed], { stageConsumers: ['layout'], noteSize: () => 100 }), [])
})

test('round: a deploy is refused before build when the contract that names the due lenses cannot be read', async () => {
  const gate = mkdtempSync(path.join(tmpdir(), 'vqa-gate-nc-'))
  const evidence = path.join(gate, 'evidence')
  const closed = path.join(evidence, 'c0')
  mkdirSync(path.join(gate, 'dossier'), { recursive: true })
  mkdirSync(path.join(closed, 'notes'), { recursive: true })
  writeFileSync(path.join(closed, 'notes', 'layout.md'), '# Layout lens\n')
  // the ledger line as round.mjs wrote it when the contract was not readable: lenses []
  const line = { run: 'c0', stage: 'light-desktop', tierStart: true, round: 0, deployed: true, out: closed, scope: { kind: 'full' }, lensesDue: 'all lenses the contract names for the tier (visual.shots consumers)', lenses: [], next: 'close-tier' }
  writeFileSync(path.join(evidence, 'rounds.jsonl'), JSON.stringify(line) + '\n')
  const marker = path.join(gate, 'built')
  writeFileSync(
    path.join(gate, 'round.json'),
    JSON.stringify({ runRoot: 'dossier', evidence: 'evidence', site: 'http://127.0.0.1:9', stage: 'light-desktop', steps: { build: { cmd: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1'); process.exit(3)`] } } })
  )
  const refused = await runRound(['--config', path.join(gate, 'round.json'), '--name', 'c1'])
  assert.equal(refused.failedStep, 'lenses', JSON.stringify(refused))
  assert.match(refused.why, /consumers/)
  assert.equal(existsSync(marker), false, 'no build ran')
})

// ── artifact binding (#59): the tier binding is written when the tier is measured ───────────────
const hex = (b) => createHash('sha256').update(b).digest('hex')
/** A quickstart pack that checks out (readPack) and a theme zip beside it, under `dir`. */
function writePack(dir, { webroot = 'webroot-bytes', database = 'database-bytes' } = {}) {
  const pack = path.join(dir, 'pack')
  mkdirSync(pack, { recursive: true })
  const manifest = { schemaVersion: 'tracy-quickstart/v1', id: 'tracy-base/wp7', version: '1.0.0', platform: 'wordpress', wpVersion: '7.1', theme: { name: 'tracy-base' }, webroot: { file: 'webroot.tar.gz', sha256: hex(webroot) }, database: { file: 'database.sql.gz', sha256: hex(database) } }
  writeFileSync(path.join(pack, manifest.webroot.file), webroot)
  writeFileSync(path.join(pack, manifest.database.file), database)
  const m = JSON.stringify(manifest)
  writeFileSync(path.join(pack, 'manifest.json'), m)
  writeFileSync(path.join(pack, 'SHA256SUMS'), sumsText([{ file: 'manifest.json', sha256: hex(m) }, { file: manifest.webroot.file, sha256: manifest.webroot.sha256 }, { file: manifest.database.file, sha256: manifest.database.sha256 }]))
  const artifact = path.join(dir, 'tracy-base-1.0.0.zip')
  if (!existsSync(artifact)) writeFileSync(artifact, 'theme-zip-bytes')
  const past = new Date(Date.now() - 3600_000)
  for (const f of [artifact, path.join(pack, manifest.webroot.file), path.join(pack, manifest.database.file)]) utimesSync(f, past, past)
  return { pack, artifact, manifest }
}

test('round.loadConfig: `pack` is resolved beside the config and needs `artifact`; a config without it binds nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-bind-cfg-'))
  try {
    const f = path.join(dir, 'round.json')
    writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', pack: 'pack', artifact: 'theme.zip' }))
    const c = loadConfig(f, { name: 'n' })
    assert.equal(c.pack, path.join(dir, 'pack'))
    assert.equal(c.artifact, path.join(dir, 'theme.zip'))
    writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', pack: 'pack' }))
    assert.throws(() => loadConfig(f, { name: 'n' }), /`pack` binds each tier to the theme zip.*set `artifact`/)
    writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', pack: 7, artifact: 'theme.zip' }))
    assert.throws(() => loadConfig(f, { name: 'n' }), /`pack` must be the path/)
    writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', artifact: 'theme.zip' }))
    assert.equal(loadConfig(f, { name: 'n' }).pack, null, 'an ordinary round stays unbound')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('round.packArtifacts: the pack must check out and each file must be a regular file with the bytes its manifest names', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-bind-pack-'))
  try {
    const { pack, artifact, manifest } = writePack(dir)
    const a = packArtifacts({ pack, artifact })
    assert.deepEqual(Object.keys(a), ['theme', 'webroot', 'database'])
    assert.equal(a.theme.file, 'tracy-base-1.0.0.zip')
    assert.equal(a.theme.sha256, `sha256:${hex('theme-zip-bytes')}`)
    assert.equal(a.webroot.sha256, `sha256:${manifest.webroot.sha256}`)
    assert.throws(() => packArtifacts({ pack: path.join(dir, 'nowhere'), artifact }), /nowhere does not check out: .*nowhere cannot be read \(ENOENT\)/)
    mkdirSync(path.join(dir, 'empty'))
    assert.throws(() => packArtifacts({ pack: path.join(dir, 'empty'), artifact }), /does not check out: .*no readable SHA256SUMS \(ENOENT\)/)
    assert.throws(() => packArtifacts({ pack, artifact: path.join(dir, 'missing.zip') }), /cannot be read \(ENOENT\)/)
    symlinkSync(artifact, path.join(dir, 'link.zip'))
    assert.throws(() => packArtifacts({ pack, artifact: path.join(dir, 'link.zip') }), /symlink, not a regular file/)
    assert.throws(() => packArtifacts({ pack, artifact: pack }), /not a regular file/)
    if (spawnSync('mkfifo', [path.join(dir, 'fifo.zip')]).status === 0) assert.throws(() => packArtifacts({ pack, artifact: path.join(dir, 'fifo.zip') }), /not a regular file/, 'a FIFO is refused, never waited on')
    writeFileSync(path.join(pack, manifest.database.file), 'other-bytes')
    assert.throws(() => packArtifacts({ pack, artifact }), /SHA256SUMS mismatch: database\.sql\.gz/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('round.packArtifacts: a pack file the pack reader would open — SHA256SUMS, manifest.json, an archive — that is a link, a FIFO or a directory is refused before it is read; the pack itself must be a directory', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-bind-packfiles-'))
  try {
    const fifo = spawnSync('mkfifo', [path.join(dir, 'probe')]).status === 0
    rmSync(path.join(dir, 'probe'), { force: true })
    const cases = [
      ['SHA256SUMS', 'link', /SHA256SUMS is a symlink, not a regular file/],
      ['manifest.json', 'link', /manifest\.json is a symlink, not a regular file/],
      ['webroot.tar.gz', 'link', /webroot\.tar\.gz is a symlink/],
      ['database.sql.gz', 'dir', /database\.sql\.gz is not a regular file/],
      ...(fifo
        ? [
            ['SHA256SUMS', 'fifo', /SHA256SUMS is not a regular file/],
            ['manifest.json', 'fifo', /manifest\.json is not a regular file/],
            ['database.sql.gz', 'fifo', /database\.sql\.gz is not a regular file/]
          ]
        : [])
    ]
    for (const [i, [name, kind, pattern]] of cases.entries()) {
      const { pack, artifact } = writePack(path.join(dir, `c${i}`))
      const file = path.join(pack, name)
      const real = path.join(dir, `c${i}`, `real-${name}`)
      writeFileSync(real, readFileSync(file))
      rmSync(file)
      if (kind === 'link') symlinkSync(real, file)
      else if (kind === 'dir') mkdirSync(file)
      else spawnSync('mkfifo', [file])
      // a FIFO nothing writes to would block a plain read for ever: the refusal must come at once
      assert.throws(() => packArtifacts({ pack, artifact }), (e) => /does not check out/.test(e.message) && pattern.test(e.message), `${name} as a ${kind}`)
    }
    const { pack, artifact } = writePack(path.join(dir, 'linked'))
    symlinkSync(pack, path.join(dir, 'pack-link'))
    assert.throws(() => packArtifacts({ pack: path.join(dir, 'pack-link'), artifact }), /pack-link is a symlink, not the pack directory/)
    assert.equal(packArtifacts({ pack, artifact }).database.file, 'database.sql.gz', 'the same pack by its own path checks out')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('round.bindingFor / writeBinding: the binding names the report bytes, its time and the three artifacts — or there is none', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-bind-unit-'))
  try {
    const { pack, artifact } = writePack(dir)
    const before = packArtifacts({ pack, artifact })
    const at = new Date().toISOString()
    const report = { at, identity: { capturedAt: at, artifactHash: before.theme.sha256 }, pages: [] }
    const bytes = Buffer.from(JSON.stringify(report))
    const b = bindingFor({ stage: 'dark-desktop', bytes, report, before, after: packArtifacts({ pack, artifact }) })
    assert.deepEqual(b, {
      schema: BINDING_SCHEMA,
      stage: 'dark-desktop',
      report: { file: 'visual.json', sha256: `sha256:${hex(bytes)}` },
      measuredAt: at,
      artifactHash: { theme: { file: before.theme.file, sha256: before.theme.sha256 }, webroot: { file: before.webroot.file, sha256: before.webroot.sha256 }, database: { file: before.database.file, sha256: before.database.sha256 } }
    })
    const refuse = (patch, pattern, after = packArtifacts({ pack, artifact })) => assert.throws(() => bindingFor({ stage: 'dark-desktop', bytes, report: { ...report, ...patch }, before, after }), pattern)
    refuse({ at: 'yesterday' }, /not an ISO-8601 timestamp/)
    refuse({ identity: { ...report.identity, capturedAt: '2020-01-01T00:00:00Z' } }, /its identity at/)
    refuse({ identity: { ...report.identity, artifactHash: `sha256:${hex('another zip')}` } }, /is not the theme zip/)
    refuse({ identity: { capturedAt: at } }, /identity\.artifactHash null/, undefined)
    refuse({}, /webroot artifact changed during the measurement/, { ...before, webroot: { ...before.webroot, sha256: `sha256:${hex('rebuilt')}` } })
    refuse({}, /theme artifact changed during the measurement/, { ...before, theme: { ...before.theme, file: 'tracy-base-1.0.1.zip' } })
    refuse({}, /before the database artifact .* was written/, { ...before, database: { ...before.database, mtimeMs: Date.now() + 3600_000 } })

    const out = path.join(dir, 'tier')
    mkdirSync(out)
    const file = writeBinding(out, b)
    assert.equal(file, path.join(out, BINDING_FILE))
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), b)
    assert.throws(() => writeBinding(out, b), /already exists/, 'a tier directory holds one binding')
    const other = path.join(dir, 'tier2')
    mkdirSync(other)
    symlinkSync(file, path.join(other, BINDING_FILE))
    assert.throws(() => writeBinding(other, b), /already exists/, 'a symlink in its place is never followed or replaced')
    assert.throws(() => writeBinding(path.join(dir, 'no-such-dir'), b), /cannot be written/)
    assert.deepEqual(readFileSync(file, 'utf8'), JSON.stringify(b, null, 2) + '\n', 'the first binding is untouched')
    // another binding created after the check and before publication is never replaced
    const raced = path.join(dir, 'tier3')
    mkdirSync(raced)
    const target = path.join(raced, BINDING_FILE)
    const lstat = fs.lstatSync
    fs.lstatSync = (p, ...rest) => {
      if (p === target && !existsSync(target)) {
        writeFileSync(target, 'another run\n')
        const e = new Error('ENOENT')
        e.code = 'ENOENT'
        throw e
      }
      return lstat(p, ...rest)
    }
    syncBuiltinESMExports()
    try {
      assert.throws(() => writeBinding(raced, b), /cannot be written: .*already exists/)
    } finally {
      fs.lstatSync = lstat
      syncBuiltinESMExports()
    }
    assert.equal(readFileSync(target, 'utf8'), 'another run\n', 'the binding that appeared is kept')
    assert.deepEqual(readdirSync(raced), [BINDING_FILE], 'no temporary file stays')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('round: with `pack` a measured tier writes its artifact binding; a pack that does not check out fails before visual-qa; an artifact newer than the report leaves the round incomplete', async () => {
  const dir = path.join(root, 'bound')
  mkdirSync(dir, { recursive: true })
  const { pack, artifact } = writePack(dir)
  const write = (file, o) => writeFileSync(path.join(root, file), JSON.stringify({ runRoot: 'dossier', site: srv.origin, spec: 'spec', theme: 'theme', stage: 'light-desktop', concurrency: 2, fetches: 2, artifact, pack, ...o }))
  write('round-bound.json', { evidence: 'evidence-bound' })
  const line = await runRound(['--config', path.join(root, 'round-bound.json'), '--name', 'b1', '--skip-deploy', '--scope', 'full'])
  assert.equal(line.failedStep, undefined, JSON.stringify(line).slice(0, 600))
  assert.equal(line.complete, true, line.incomplete)
  const bytes = readFileSync(path.join(line.out, 'visual.json'))
  const report = JSON.parse(bytes)
  const binding = JSON.parse(readFileSync(path.join(line.out, BINDING_FILE), 'utf8'))
  assert.equal(binding.schema, BINDING_SCHEMA)
  assert.equal(binding.stage, 'light-desktop')
  assert.deepEqual(binding.report, { file: 'visual.json', sha256: `sha256:${hex(bytes)}` })
  assert.equal(binding.measuredAt, report.at)
  const now = packArtifacts({ pack, artifact })
  for (const k of ['theme', 'webroot', 'database']) assert.deepEqual(binding.artifactHash[k], { file: now[k].file, sha256: now[k].sha256 })

  // without `pack` nothing is bound, as before
  write('round-unbound.json', { evidence: 'evidence-unbound', pack: undefined })
  const plain = await runRound(['--config', path.join(root, 'round-unbound.json'), '--name', 'u1', '--skip-deploy', '--scope', 'full'])
  assert.equal(plain.complete, true, plain.incomplete)
  assert.equal(existsSync(path.join(plain.out, BINDING_FILE)), false)

  // a pack whose sums do not hold: named, and visual-qa never runs
  const broken = path.join(dir, 'broken')
  mkdirSync(broken)
  writeFileSync(path.join(broken, 'SHA256SUMS'), `${'0'.repeat(64)}  manifest.json\n`)
  write('round-broken.json', { evidence: 'evidence-broken', pack: broken })
  const refused = await runRound(['--config', path.join(root, 'round-broken.json'), '--name', 'x1', '--skip-deploy', '--scope', 'full'])
  assert.equal(refused.failedStep, 'visualQa')
  assert.match(refused.why, /artifact binding: the pack .* does not check out/)
  assert.equal(existsSync(path.join(root, 'evidence-broken', 'x1', 'visual.json')), false, 'no measurement ran')

  // the theme zip written after the measurement started: the report predates it — no binding, not complete
  const future = new Date(Date.now() + 3600_000)
  utimesSync(artifact, future, future)
  write('round-late.json', { evidence: 'evidence-late' })
  const late = await runRound(['--config', path.join(root, 'round-late.json'), '--name', 'l1', '--skip-deploy', '--scope', 'full'])
  assert.equal(late.complete, false)
  assert.match(late.incomplete, /artifact binding: measured at .* before the theme artifact/)
  assert.equal(existsSync(path.join(late.out, BINDING_FILE)), false)
  assert.equal(readdirSync(late.out).some((f) => f.includes(BINDING_FILE)), false, 'no temporary binding left behind')
})

test('round: an exit 1 the report explains (interaction states not measured, intrinsic site-only defects) is a result, not a run to repeat; an unexplained one still is', async () => {
  const { reportProblems, blockingOf } = await import('../visual/round.mjs')
  const contract = { pages: [{ id: 'en-home', path: '/', variants: ['1440-light'] }] }
  const base = { scope: { kind: 'full' }, stages: [{ id: 'light-desktop', status: 'pass' }], pages: [{ id: 'en-home', axes: [{ variant: '1440-light', measured: 'now', findings: [] }] }] }
  const withSummary = (summary) => ({ ...base, summary: { findings: 0, unclassified: 0, ...summary } })
  const ask = (summary) => reportProblems({ contract, stage: 'light-desktop', report: withSummary(summary), exit: 1, pages: ['en-home'], full: true })
  // ja-restaurant rc-4: 0 findings, interaction states not measured (S-29 form probe) — exit 1, measured whole
  const notMeasured = { interaction: { status: 'run', examined: 120, notMeasured: 41, blocking: 41 } }
  assert.deepEqual(ask(notMeasured), [])
  assert.deepEqual(blockingOf(withSummary(notMeasured)), { interaction: 41, intrinsic: 0, unexplained: false })
  assert.deepEqual(ask({ intrinsic: { status: 'run', siteOnly: 2, errors: 0, blocking: 2 } }), [])
  // a probe that did not run, read nothing, or could not read a page: the run is broken, measure again
  for (const summary of [{ interaction: { status: 'not-run', blocking: 1 } }, { interaction: { status: 'run', examined: 0, notMeasured: 0, blocking: 1 } }, { intrinsic: { status: 'run', siteOnly: 0, errors: 3, blocking: 3 } }, {}])
    assert.ok(ask(summary).some((p) => /exited 1 on a report without findings/.test(p)), JSON.stringify(summary))
  assert.equal(blockingOf(withSummary({})), null)
})

test('round: over several tiers the whole-site probes run once — the first tier measures them, the others take its records (visual-qa --probes-from)', async () => {
  const cfg = path.join(root, 'round-probes.json')
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(path.join(root, 'round.json'), 'utf8')), evidence: 'ev-probes', stage: undefined, stages: ['light-desktop', 'light-responsive'], tierConcurrency: 2 }))
  const r = await runRound(['--config', cfg, '--name', 'p1', '--skip-deploy', '--scope', 'full'])
  assert.equal(r.failedStep, undefined, JSON.stringify(r))
  const [first, other] = ['light-desktop', 'light-responsive'].map((s) => r.tiers[s].out)
  assert.ok(existsSync(`${first}.ended`), 'the first tier marks its end for the tiers waiting on it')
  assert.ok(readFileSync(path.join(other, 'interaction.json')).equals(readFileSync(path.join(first, 'interaction.json'))), 'the second tier carries the first tier\'s interaction record')
  const log = readFileSync(path.join(root, 'ev-probes', 'p1.round', 'visualQa-light-responsive.log'), 'utf8')
  assert.match(log, /--probes-from/, 'the second tier was asked to take the probes')
  // the interaction record was taken, not measured again (this fixture's page-map gives the intrinsic probe nothing to read, so that one fails on both)
  assert.doesNotMatch(log, /its interaction probe|interaction record is inconsistent|measures the intrinsic and interaction probes itself/, log.slice(-2000))
})
