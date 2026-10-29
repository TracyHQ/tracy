// Regressions from Tracy Base 1.1.0 and the JA Vega run-up (26/09): each test is one gap a round
// fell into — a selector biome spread over lines, a quickstart that carried orphans, a cycle that
// failed at its last phase, a release that could not be updated, a package that blamed the theme,
// and a bordered card the layout tool did not see.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { changedRules, selectorsFor, pagesMatching } from '../visual/affected.mjs'
import { collectFacts, applyPrune } from '../quickstart/prune-audit.mjs'
import { classifyPrune, classifyMedia, REFS_MARKER, OWNERS_MARKER } from '../quickstart/lib.mjs'

const scratch = (name) => mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), `${name}-`))

function serve(routes) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const body = routes[new URL(req.url, 'http://x').pathname]
      res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body ?? '<html><body>gone</body></html>')
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

// ── affected: a rule biome wrote over several lines ─────────────────────────────────────────────
test('affected: a multi-line :is()/:where() selector list is split at its top-level commas and still selects its pages; a selector the browser rejects stays FULL', async () => {
  const before = '.x{color:red}'
  const after = `.x{color:red}
.tracy-card :is(
  .card-title,
  .card-meta:hover
) > a::after,
:where(
  .team-grid,
  .team-list
) [data-role="lead,member"]:focus-visible {
  color: blue;
}`
  const { full, selectors } = selectorsFor(changedRules(before, after))
  assert.equal(full, null)
  assert.deepEqual(selectors, ['.tracy-card :is(.card-title, .card-meta) > a', ':where(.team-grid, .team-list) [data-role="lead,member"]'])
  const srv = await serve({
    '/cards/': '<html><body><div class="tracy-card"><h3 class="card-title"><a href="#">A</a></h3></div></body></html>',
    '/team/': '<html><body><ul class="team-list"><li data-role="lead,member">Lee</li></ul></body></html>',
    '/about/': '<html><body><div class="tracy-card"><p>no title here</p></div><ul class="team-list"><li>x</li></ul></body></html>'
  })
  try {
    const pages = [{ id: 'cards', path: '/cards/' }, { id: 'team', path: '/team/' }, { id: 'about', path: '/about/' }]
    const r = await pagesMatching({ site: srv.origin, pages, selectors })
    assert.equal(r.failClosed, false, JSON.stringify(r.pages))
    assert.deepEqual(r.affected, ['cards', 'team'], 'the page no selector matches is not measured again')
    const bad = await pagesMatching({ site: srv.origin, pages, selectors: [...selectors, '.a:::b'] })
    assert.equal(bad.failClosed, true)
    assert.deepEqual(bad.affected, ['cards', 'team', 'about'])
  } finally {
    await srv.close()
  }
})

test('affected: folding and stripping keep what a selector means — a :has() relative selector keeps its combinator, whitespace inside a quoted value is kept, and each still selects its page', async () => {
  const after = `.menu :has(
  > .selected
) {
  color: blue;
}
[title="two  spaces"]:hover {
  color: blue;
}`
  const { full, selectors } = selectorsFor(changedRules('', after))
  assert.equal(full, null)
  assert.deepEqual(selectors, ['.menu :has(> .selected)', '[title="two  spaces"]'])
  const srv = await serve({
    '/child/': '<html><body><ul class="menu"><li><a class="selected">A</a></li></ul></body></html>',
    '/two/': '<html><body><p title="two  spaces">x</p></body></html>',
    '/one/': '<html><body><p title="two spaces">x</p><ul class="menu"><li><span><a class="selected-no">A</a></span></li></ul></body></html>'
  })
  try {
    const pages = [{ id: 'child', path: '/child/' }, { id: 'two', path: '/two/' }, { id: 'one', path: '/one/' }]
    const r = await pagesMatching({ site: srv.origin, pages, selectors })
    assert.equal(r.failClosed, false, JSON.stringify(r.pages))
    assert.deepEqual(r.affected, ['child', 'two'], 'the direct child .selected is reached; one space is not two')
  } finally {
    await srv.close()
  }
})

test('affected: a pseudo-class that is a whole compound before a combinator becomes *, never dropped — `.menu :hover > .selected` still reaches a grandchild, in :has() too', async () => {
  const after = `.menu :hover > .selected {
  color: blue;
}
.nav:has(:hover > .current) {
  color: blue;
}`
  const { full, selectors } = selectorsFor(changedRules('', after))
  assert.equal(full, null)
  assert.deepEqual(selectors, ['.menu * > .selected', '.nav:has(* > .current)'])
  const srv = await serve({
    '/deep/': '<html><body><ul class="menu"><li><span><a class="selected">A</a></span></li></ul></body></html>',
    '/nav/': '<html><body><div class="nav"><ul><li><a class="current">A</a></li></ul></div></body></html>',
    '/none/': '<html><body><ul class="menu"><li>x</li></ul><div class="nav"><a class="current">A</a></div></body></html>'
  })
  try {
    const pages = [{ id: 'deep', path: '/deep/' }, { id: 'nav', path: '/nav/' }, { id: 'none', path: '/none/' }]
    const r = await pagesMatching({ site: srv.origin, pages, selectors })
    assert.equal(r.failClosed, false, JSON.stringify(r.pages))
    assert.deepEqual(r.affected, ['deep', 'nav'], 'a .selected under a hovered grandchild and a .current under a hovered descendant are reached; a direct child .current alone is not')
  } finally {
    await srv.close()
  }
})

// ── prune-audit: orphan attachments and WordPress's default content ────────────────────────────
// A stand in memory, answering the wp-cli calls prune-audit makes. `eval` prints what REFS_PHP
// prints (a PHP notice first, as a real stand may); `post delete … --force` removes the rows.
function fakeStand({ evalFails = false, termmetaFails = false } = {}) {
  const U = 'http://s/wp-content/uploads/2026/09/'
  const att = (ID, file, extra = {}) => ({ ID, post_type: 'attachment', post_status: 'inherit', post_name: `a${ID}`, post_title: `a${ID}`, post_parent: 0, file, sizes: [], ...extra })
  const state = {
    attachments: [
      att(10, '2026/09/hero.jpg'), // featured image
      att(11, '2026/09/team.jpg'), // wp-image-11 in content
      att(12, '2026/09/logo.png', { sizes: ['logo-300x100.png'] }), // a generated size, by URL
      att(13, '2026/09/icon.png'), // option site_icon
      att(14, '2026/09/bg.jpg'), // JSON-escaped URL in post meta
      att(15, '2026/09/orphan-a.jpg', { post_parent: 5 }), // parent only: still an orphan
      att(16, '2026/09/team-old.jpg'), // a name that merely starts like a used one
      att(17, '2026/09/theme-used.jpg'), // named by a theme part
      att(18, null), // no file, no reference: a person looks
      att(19, '2026/09/cover.jpg') // block attribute "id":19
    ],
    content: [
      { ID: 1, post_type: 'post', post_status: 'publish', post_name: 'hello-world', post_title: 'Hello world!', post_parent: 0, post_date_gmt: '2026-09-01 08:00:00', post_modified_gmt: '2026-09-01 08:00:00', post_content: '<p>Welcome to WordPress.</p>', post_excerpt: '' },
      { ID: 2, post_type: 'page', post_status: 'publish', post_name: 'sample-page', post_title: 'Sample Page', post_parent: 0, post_date_gmt: '2026-09-01 08:00:00', post_modified_gmt: '2026-09-01 08:00:00', post_content: '<p>This is an example page.</p>', post_excerpt: '' },
      { ID: 5, post_type: 'post', post_status: 'publish', post_name: 'news', post_title: 'News', post_parent: 0, post_content: `<figure><img class="wp-image-11" src="${U}team.jpg"></figure><img src="${U}logo-300x100.png"><!-- wp:cover {"id":19,"url":"x"} -->`, post_excerpt: '' }
    ],
    meta: [
      { post_id: 5, meta_key: '_thumbnail_id', meta_value: '10' },
      { post_id: 5, meta_key: 'hero_bg', meta_value: '{"url":"http:\\/\\/s\\/wp-content\\/uploads\\/2026\\/09\\/bg.jpg"}' },
      { post_id: 5, meta_key: '_edit_lock', meta_value: '16' }
    ],
    termmeta: [],
    options: [{ option_name: 'site_icon', option_value: '13' }, { option_name: 'medium_size_w', option_value: '15' }]
  }
  const calls = []
  const wp = (args, opts = {}) => {
    calls.push(args)
    if (args[0] === 'eval') {
      if (evalFails) return { status: 255, stdout: '', stderr: 'Error: Error establishing a database connection.' }
      // The ownership read (lib.mjs ownersPhp; applyPrune re-reads it before it deletes).
      if (args[1].includes(OWNERS_MARKER)) {
        const posts = [...state.attachments.map((a) => ({ ID: String(a.ID), post_type: a.post_type, post_status: a.post_status })), ...state.content.map((c) => ({ ID: String(c.ID), post_type: c.post_type, post_status: c.post_status }))]
        return { status: 0, stdout: `${OWNERS_MARKER}${JSON.stringify({ users: [{ ID: '1', user_login: 'admin', seeded: '0' }], posts })}`, stderr: '' }
      }
      // The user meta read (prune-usermeta.mjs): the audit asks it beside the references, and again before each attachment deletion.
      if (args[1].includes('__TRACY_USERMETA__')) return { status: 0, stdout: `__TRACY_USERMETA__${JSON.stringify({ usermeta: state.usermeta ?? [] })}`, stderr: '' }
      // The combined check-and-delete of attachments (prune-usermeta.mjs deleteUnreferencedPhp, #74 S-48): it carries the audited ids as base64 JSON.
      if (args[1].includes('__TRACY_ATTDEL__')) {
        const want = JSON.parse(Buffer.from(/base64_decode\('([^']+)'\)/.exec(args[1])[1], 'base64').toString())
        const ids = new Set(want.map((w) => w.id))
        state.attachments = state.attachments.filter((a) => !ids.has(a.ID))
        return { status: 0, stdout: `__TRACY_ATTDEL__${JSON.stringify({ results: Object.fromEntries(want.map((w) => [String(w.id), 'deleted'])), left: [], withheld: [] })}`, stderr: '' }
      }
      // A termmeta query that failed: $wpdb->get_results returns null, wp_json_encode prints null.
      const out = termmetaFails ? { ...state, termmeta: null } : state
      return { status: 0, stdout: `Deprecated: something in a plugin\n${REFS_MARKER}${JSON.stringify(out)}`, stderr: '' }
    }
    if (args[0] === 'post' && args[1] === 'delete') {
      const ids = new Set(args.slice(2).filter((a) => /^\d+$/.test(a)).map(Number))
      state.attachments = state.attachments.filter((a) => !ids.has(a.ID))
      state.content = state.content.filter((c) => !ids.has(c.ID))
      return ''
    }
    if (args[0] === 'option' && args[1] === 'get') return opts.raw ? { status: 1, stdout: '', stderr: '' } : 'http://s'
    if (args[0] === 'user' && args[1] === 'session') return '0'
    return opts.raw ? { status: 0, stdout: '', stderr: '' } : ''
  }
  wp.json = (args) => {
    calls.push(args)
    return args[0] === 'user' ? [{ ID: 1, user_login: 'admin', roles: ['administrator'] }] : []
  }
  wp.field = (args) => wp(args).trim()
  const webroot = scratch('prune-stand')
  mkdirSync(path.join(webroot, 'wp-content', 'themes', 'tracy-base', 'parts'), { recursive: true })
  writeFileSync(path.join(webroot, 'wp-content', 'themes', 'tracy-base', 'parts', 'header.html'), `<img src="${U}theme-used.jpg">`)
  return { state, calls, wp, webroot }
}
const WRITES = /^(delete|update|destroy|create|add|set|generate|reset|import|regenerate)$/
const audit = (st) => classifyPrune(collectFacts({ webroot: st.webroot, wp: st.wp, admin: 'admin', siteUrl: 'http://s', standOptions: [] }))

test('prune-audit: attachments nothing names and the two WordPress defaults are PRUNE; each kind of reference keeps its attachment; the audit alone writes nothing', () => {
  const st = fakeStand()
  const rows = audit(st)
  const by = (area) => rows.filter((r) => r.area === area).map((r) => `${r.verdict} ${r.item}`)
  assert.deepEqual(by('attachment'), [
    'KEEP #10 2026/09/hero.jpg',
    'KEEP #11 2026/09/team.jpg',
    'KEEP #12 2026/09/logo.png',
    'KEEP #13 2026/09/icon.png',
    'KEEP #14 2026/09/bg.jpg',
    'PRUNE #15 2026/09/orphan-a.jpg',
    'PRUNE #16 2026/09/team-old.jpg',
    'KEEP #17 2026/09/theme-used.jpg',
    'UNKNOWN #18 a18',
    'KEEP #19 2026/09/cover.jpg'
  ])
  const why = Object.fromEntries(rows.filter((r) => r.area === 'attachment').map((r) => [r.item.split(' ')[0], r.why]))
  assert.match(why['#10'], /featured image/)
  assert.match(why['#11'], /by id in post #5/)
  assert.match(why['#12'], /file named in post #5/)
  assert.match(why['#13'], /option site_icon/)
  assert.match(why['#14'], /meta hero_bg/)
  assert.match(why['#17'], /theme file wp-content\/themes\/tracy-base\/parts\/header\.html/)
  assert.match(why['#19'], /by id/)
  assert.deepEqual(by('default'), ['PRUNE #1 post/hello-world', 'PRUNE #2 page/sample-page'])
  assert.ok(!st.calls.some((c) => WRITES.test(c[1] ?? '')), `no write without --apply: ${JSON.stringify(st.calls.filter((c) => WRITES.test(c[1] ?? '')))}`)

  applyPrune(rows, { wp: st.wp, webroot: st.webroot })
  // #74 S-48: attachments go through one wp eval that re-checks the user meta and deletes (no window for an avatar set after the audit); only the WordPress defaults use `wp post delete`.
  const attachmentEvals = st.calls.filter((c) => c[0] === 'eval' && c[1].includes('__TRACY_ATTDEL__'))
  assert.equal(attachmentEvals.length, 1)
  assert.deepEqual(JSON.parse(Buffer.from(/base64_decode\('([^']+)'\)/.exec(attachmentEvals[0][1])[1], 'base64').toString()).map((w) => w.id), [15, 16])
  const deletes = st.calls.filter((c) => c[0] === 'post' && c[1] === 'delete')
  assert.deepEqual(deletes, [['post', 'delete', '1', '2', '--force']])
  const again = audit(st)
  assert.deepEqual(again.filter((r) => r.verdict === 'PRUNE').map((r) => r.item), [], 'the re-audit finds nothing more to prune')
  assert.ok(!again.some((r) => /#(15|16|1|2) /.test(r.item)), 'the removed rows are gone from the stand')
  assert.deepEqual(again.filter((r) => r.area === 'attachment' && r.verdict === 'UNKNOWN').map((r) => r.item), ['#18 a18'], 'the attachment without a file still waits for a person')
})

test('prune-audit: references that could not be collected are one UNKNOWN, never a list of orphans; a default page renamed is UNKNOWN', () => {
  const failed = audit(fakeStand({ evalFails: true }))
  const media = failed.filter((r) => r.area === 'attachment' || r.area === 'default')
  assert.deepEqual(media.map((r) => r.verdict), ['UNKNOWN'])
  assert.match(media[0].why, /not collected — wp eval exited 255/)
  assert.equal(classifyMedia({ error: 'reference data is not JSON' })[0].verdict, 'UNKNOWN')
  assert.equal(classifyPrune({ users: [] }).find((r) => r.area === 'attachment')?.verdict, 'UNKNOWN', 'facts without media were not measured')
  const renamed = classifyMedia({ attachments: [], meta: [], termmeta: [], options: [], files: [], content: [{ ID: 2, post_type: 'page', post_name: 'sample-page', post_title: 'Our services' }] })
  assert.deepEqual(renamed.map((r) => r.verdict), ['UNKNOWN'])
  // A default the site uses, edited, linked to, or read without dates is not WordPress's untouched default.
  const page = (over = {}) => ({ ID: 2, post_type: 'page', post_status: 'publish', post_name: 'sample-page', post_title: 'Sample Page', post_date_gmt: '2026-09-01 08:00:00', post_modified_gmt: '2026-09-01 08:00:00', post_content: '', ...over })
  const refs = (content, options = []) => ({ attachments: [], meta: [], termmeta: [], options, files: [], content })
  const verdict = (r) => r.map((x) => `${x.verdict}: ${x.why}`)
  assert.match(verdict(classifyMedia(refs([page()], [{ option_name: 'page_on_front', option_value: '2' }])))[0], /^KEEP: the site's front page/)
  assert.match(verdict(classifyMedia(refs([page({ post_modified_gmt: '2026-09-20 10:00:00' })])))[0], /^UNKNOWN: edited after the install/)
  assert.match(verdict(classifyMedia(refs([page({ post_date_gmt: undefined })])))[0], /^UNKNOWN: no created\/modified dates/)
  const nav = { ID: 40, post_type: 'wp_navigation', post_name: 'nav', post_title: 'Nav', post_content: '<!-- wp:navigation-link {"label":"Sample","type":"page","id":2,"url":"http://s/sample-page/","kind":"post-type"} /-->' }
  assert.match(verdict(classifyMedia(refs([page(), nav])))[0], /^UNKNOWN: linked from wp_navigation #40/)
  assert.match(verdict(classifyMedia(refs([page()])))[0], /^PRUNE/)
  const galleryParent = classifyMedia({ attachments: [{ ID: 30, file: '2026/09/g.jpg', sizes: [], post_parent: 7 }], meta: [], termmeta: [], options: [], files: [], content: [{ ID: 7, post_type: 'page', post_name: 'gallery', post_title: 'Gallery', post_content: '[gallery columns="3"]' }] })
  assert.match(galleryParent[0].why, /\[gallery\] of its parent page #7/)
})

test('prune-audit: a term-meta query that failed is UNKNOWN, not "no term names an image" — the attachment only a term names is not deleted, even with --apply', () => {
  const st = fakeStand({ termmetaFails: true })
  st.state.attachments.push({ ID: 20, post_type: 'attachment', post_status: 'inherit', post_name: 'a20', post_title: 'a20', post_parent: 0, file: '2026/09/category.jpg', sizes: [] })
  st.state.termmeta = [{ term_id: 3, meta_key: 'thumbnail_id', meta_value: '20' }]
  const rows = audit(st)
  const media = rows.filter((r) => r.area === 'attachment' || r.area === 'default')
  assert.deepEqual(media.map((r) => r.verdict), ['UNKNOWN'])
  assert.match(media[0].why, /no termmeta list/)
  applyPrune(rows, { wp: st.wp, webroot: st.webroot })
  assert.deepEqual(st.calls.filter((c) => c[0] === 'post' && c[1] === 'delete'), [], 'nothing deleted on partial reference data')
  // Collected whole, the same term meta keeps its attachment.
  const whole = fakeStand()
  whole.state.attachments.push({ ID: 20, post_type: 'attachment', post_status: 'inherit', post_name: 'a20', post_title: 'a20', post_parent: 0, file: '2026/09/category.jpg', sizes: [] })
  whole.state.termmeta = [{ term_id: 3, meta_key: 'thumbnail_id', meta_value: '20' }]
  const kept = audit(whole).find((r) => r.item.startsWith('#20 '))
  assert.equal(kept.verdict, 'KEEP')
  assert.match(kept.why, /term meta thumbnail_id of term 3/)
  assert.equal(classifyMedia({ attachments: [], content: [], meta: [], termmeta: [], options: [] })[0].verdict, 'UNKNOWN', 'theme files not read is not "no theme file names it"')
})

test('prune-audit: an image only a large theme file names (a 2 MiB built bundle) is kept, not deleted as an orphan', () => {
  const st = fakeStand()
  st.state.attachments.push({ ID: 21, post_type: 'attachment', post_status: 'inherit', post_name: 'a21', post_title: 'a21', post_parent: 0, file: '2026/09/bundled.jpg', sizes: [] })
  const bundle = `${'/* filler */\n'.repeat(180000)}const hero = "http://s/wp-content/uploads/2026/09/bundled.jpg";\n`
  assert.ok(bundle.length > 2 * (1 << 20))
  mkdirSync(path.join(st.webroot, 'wp-content', 'themes', 'tracy-base', 'assets'), { recursive: true })
  writeFileSync(path.join(st.webroot, 'wp-content', 'themes', 'tracy-base', 'assets', 'app.js'), bundle)
  const rows = audit(st)
  const row = rows.find((r) => r.item.startsWith('#21 '))
  assert.equal(row.verdict, 'KEEP')
  assert.match(row.why, /theme file wp-content\/themes\/tracy-base\/assets\/app\.js/)
  applyPrune(rows, { wp: st.wp, webroot: st.webroot })
  const deleted = st.calls.filter((c) => c[0] === 'post' && c[1] === 'delete').flat()
  assert.ok(!deleted.includes('21'), `#21 not deleted: ${JSON.stringify(deleted)}`)
})

// ── cycle: --run-root is checked before the first phase ─────────────────────────────────────────
test('cycle: without --run-root the cycle stops before the first phase and before creating or removing anything, --from release included; with it the plan runs and --from still guards', async () => {
  const { runCycle, plan, preflight, PHASES } = await import('../quickstart/cycle.mjs')
  const { existsSync, readFileSync } = await import('node:fs')
  const o = (stand, extra = {}) => ({ stand, id: 'x/wp7', version: '1.0.0', siteA: 'http://a', siteB: 'http://b', wpA: 'wpa', wpB: 'wpb', rootB: 'rootb', routes: '/r.json', admin: 'tracyagent', darkHook: 'cookie:t=dark', dbHost: 'verify-db', dbPasswordEnv: 'PW', ...extra })
  const stand = scratch('cycle-preflight')
  const shell = (real) => ({ prune: [{ sh: 'echo prune-ran' }], pack: [{ sh: 'echo pack-ran' }], restore: [{ sh: 'echo restore-ran' }], verify: [{ sh: 'echo verify-ran' }], 'contract-bind': [{ sh: 'echo bind-ran' }], release: real.release })
  for (const from of [null, 'release']) {
    await assert.rejects(() => runCycle(o(stand), { from, planOverride: shell(plan(o(stand))) }), /release\.mjs requires --run-root/)
    assert.equal(existsSync(path.join(stand, 'pack')), false, `nothing written (from ${from})`)
  }
  assert.deepEqual(preflight(plan(o(stand)), PHASES.slice(0, 4)), [], 'a run that stops before release does not need it')
  const release = { runRoot: '/dossier', spec: '/spec', themeZip: '/t.zip', visualLedger: '/rounds.jsonl', checkpoint: 'cp-1', behaviourSweep: '/site-sweep.json' }
  assert.deepEqual(preflight(plan(o(stand, release)), ['release']), [])
  // The run-root's contracts must also be fresh against the spec-pack (cycle.mjs freshness); with
  // a fresh dossier the plan runs — the real release.mjs is swapped for a shell step here.
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { writeContracts } = await import('./quickstart-contracts.mjs')
  const dossier = scratch('cycle-dossier')
  const spec = path.join(dossier, 'spec')
  mkdirSync(spec)
  for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/' }] }))
  writeContracts({ runRoot: dossier, specDir: spec })
  // verify compares the spec-pack's own routes (cycle.mjs routeProblems)
  const fresh = { runRoot: dossier, spec, routes: path.join(spec, 'page-map.json') }
  const ok = { ...shell(plan(o(stand, fresh))), release: [{ sh: 'echo release-ran' }] }
  const state = await runCycle(o(stand, fresh), { planOverride: ok })
  assert.deepEqual(Object.keys(state.phases), PHASES)
  assert.match(readFileSync(path.join(stand, 'cycle.log'), 'utf8'), /prune-ran[\s\S]*release-ran/)
  const resumed = await runCycle(o(stand, fresh), { from: 'release', planOverride: ok })
  assert.equal(resumed.phases.release.ok, true)
})

// ── release: an existing release is updated, not created again ──────────────────────────────────
test('release: the probe tells an existing release, a missing one and an unanswered question apart; upload replaces assets in order, archives first and tracy_setting.json last; nothing is published', async () => {
  const { releaseState, publishCommands, orderAssets } = await import('../quickstart/release.mjs')
  const calls = []
  const fake = (answer) => (cmd, args) => {
    calls.push([cmd, ...args])
    return answer
  }
  const tag = 'tracy-base/wp7'
  const repo = 'JoomlArt-Products/joomlart-products'
  const exists = releaseState({ tag, repo, run: fake({ status: 0, stdout: '{"tagName":"tracy-base/wp7","isDraft":false}', stderr: '' }) })
  const missing = releaseState({ tag, repo, run: fake({ status: 1, stdout: '', stderr: 'release not found' }) })
  const unknown = releaseState({ tag, repo, run: fake({ status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' }) })
  const noGh = releaseState({ tag, repo, run: () => ({ error: Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }) }) })
  assert.deepEqual(exists, { exists: true, draft: false })
  assert.deepEqual(missing, { exists: false })
  assert.match(unknown.error, /Bad credentials/)
  assert.equal(noGh.error, 'gh is not installed')
  assert.ok(calls.every((c) => c.slice(0, 3).join(' ') === 'gh release view'), 'the only gh call is the read-only view')

  const assets = ['/r/README.md', "/r/it's notes.md", '/r/tracy_setting.json', '/r/SHA256SUMS', '/r/webroot.tar.gz', '/r/manifest.json', '/r/database.sql.gz', '/r/tracy-base.zip']
  assert.deepEqual(orderAssets(assets), ['/r/webroot.tar.gz', '/r/database.sql.gz', '/r/tracy-base.zip', '/r/README.md', "/r/it's notes.md", '/r/SHA256SUMS', '/r/manifest.json', '/r/tracy_setting.json'])
  const args = { tag, repo, title: 'Quickstart: Tracy Base', notesFile: '/r/release-notes.md', assets }
  const up = publishCommands({ ...args, state: exists })
  // gh uploads the files of one command concurrently: the order is the order of the commands.
  assert.deepEqual(up.commands.slice(0, 3), [
    `gh release upload 'tracy-base/wp7' -R ${repo} --clobber '/r/webroot.tar.gz' '/r/database.sql.gz' '/r/tracy-base.zip'`,
    `gh release upload 'tracy-base/wp7' -R ${repo} --clobber '/r/README.md' '/r/it'\\''s notes.md' '/r/SHA256SUMS' '/r/manifest.json'`,
    `gh release upload 'tracy-base/wp7' -R ${repo} --clobber '/r/tracy_setting.json'`
  ])
  assert.equal(up.commands[3], `gh release edit 'tracy-base/wp7' -R ${repo} --title 'Quickstart: Tracy Base' --notes-file '/r/release-notes.md'`)
  const create = publishCommands({ ...args, state: missing })
  assert.equal(create.commands.length, 1)
  assert.match(create.commands[0], /^gh release create 'tracy-base\/wp7' -R \S+ --draft --title 'Quickstart: Tracy Base' --notes-file '\/r\/release-notes\.md' '\/r\/webroot\.tar\.gz'.*'\/r\/tracy_setting\.json'$/)
  const both = publishCommands({ ...args, state: unknown })
  assert.match(both.say, /could not tell .*Bad credentials/)
  assert.deepEqual(both.commands.map((c) => c.split(' ').slice(0, 3).join(' ')), ['gh release create', 'gh release upload', 'gh release upload', 'gh release upload'])
})

// ── package: a runner that cannot see the zip is named before anything is installed ─────────────
test('package: usage names --site-url; a runner that cannot read the zip is told to pass --zip-in-container before install/activate; a runner that can goes through the old gates', async () => {
  const { spawnSync } = await import('node:child_process')
  const { readFileSync } = await import('node:fs')
  const pkg = path.join(import.meta.dirname, '..', 'package.mjs')
  const usage = spawnSync(process.execPath, [pkg], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /--site-url <url/)
  const dir = scratch('package')
  mkdirSync(path.join(dir, 'tb', 'templates'), { recursive: true })
  writeFileSync(path.join(dir, 'tb', 'style.css'), '/* Theme Name: TB */')
  writeFileSync(path.join(dir, 'tb', 'theme.json'), '{}')
  writeFileSync(path.join(dir, 'tb', 'templates', 'index.html'), '<!-- wp:post-content /-->')
  assert.equal(spawnSync('zip', ['-qr', 'tb.zip', 'tb'], { cwd: dir }).status, 0)
  // A wp-cli stand-in: logs every call, and answers the readability probe from FAKE_WP_READABLE.
  const fake = path.join(dir, 'fake-wp.mjs')
  writeFileSync(fake, `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync(process.env.FAKE_WP_LOG, JSON.stringify(a) + '\\n')
const say = (s) => process.stdout.write(s)
if (a[0] === 'eval' && a[1].includes('is_readable')) say(process.env.FAKE_WP_READABLE)
else if (a[0] === 'eval' && a[1].includes('get_theme_root')) say('/var/www/html/wp-content/themes/tb')
else if (a[0] === 'eval' && a[1].includes('substr_count')) say('12')
else if (a[0] === 'eval') say('0')
else if (a[0] === 'theme' && a[1] === 'list') say('tb')
else if (a[0] === 'theme-check') say('INFO\\tfine')
`)
  const srv = await serve({ '/': '<html><body>home</body></html>' })
  try {
    // Asynchronous: package.mjs fetches the front page from the server in THIS process, and a
    // spawnSync would hold the event loop that has to answer it.
    const { execFile } = await import('node:child_process')
    const run = async (readable, extra = []) => {
      const log = path.join(dir, `wp-${readable}-${extra.length}.log`)
      writeFileSync(log, '')
      const r = await new Promise((resolve) =>
        execFile(process.execPath, [pkg, '--zip', path.join(dir, 'tb.zip'), '--slug', 'tb', '--wp', `${process.execPath} ${fake}`, '--site-url', srv.origin, '--out', path.join(dir, `report-${readable}.json`), ...extra], { encoding: 'utf8', timeout: 60000, env: { ...process.env, FAKE_WP_LOG: log, FAKE_WP_READABLE: readable } }, (err, stdout, stderr) => resolve({ status: err ? (err.code ?? 1) : 0, stdout, stderr }))
      )
      return { ...r, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)), report: JSON.parse(readFileSync(path.join(dir, `report-${readable}.json`), 'utf8')) }
    }
    const blind = await run('unreadable')
    assert.equal(blind.status, 1)
    assert.match(blind.report.checks.install.summary, /pass --zip-in-container <path>/)
    assert.ok(!blind.calls.some((c) => c[0] === 'theme'), `no install/activate was attempted: ${JSON.stringify(blind.calls)}`)
    const wrongInside = await run('unreadable', ['--zip-in-container', '/nowhere/tb.zip'])
    assert.match(wrongInside.report.checks.install.summary, /--zip-in-container \/nowhere\/tb\.zip is not readable inside the runner/)
    const seen = await run('readable')
    assert.equal(seen.status, 0, seen.stdout + seen.stderr)
    assert.deepEqual(Object.entries(seen.report.checks).map(([k, v]) => [k, v.ok]), [['zip', true], ['install', true], ['themecheck', true], ['i18n', true]])
    assert.ok(seen.calls.some((c) => c.join(' ') === `theme install ${path.join(dir, 'tb.zip')} --force`))
  } finally {
    await srv.close()
  }
})

// ── layout-boxes: a bordered card is a panel, and its border and corners are compared ──────────
test('layout-boxes: a bordered 18 px card in the source against a bare column is named; border width, colour and radius each differ by name; a wrapper that only rounds its corners is no panel', async () => {
  const { measureInPage, compareBlocks } = await import('../visual/layout-boxes.mjs')
  const { withBrowser } = await import('../lib/browser.mjs')
  const page = (card) => `<!doctype html><html><head><style>
body{margin:0;background:rgb(255,255,255);font-family:Arial} main{padding:40px}
.grid{display:grid;grid-template-columns:repeat(3,300px);gap:24px} .card{padding:24px;${card}}
.round{border-radius:24px;padding:10px}
</style></head><body><main><section><h2>The essentials</h2><div class="grid">
<div class="card"><h3>Hosting</h3><p>x</p></div><div class="card"><h3>Support</h3><p>y</p></div><div class="card"><h3>Updates</h3><p>z</p></div></div></section>
<section><div class="round"><h2>Only rounded</h2></div></section></main></body></html>`
  const variants = {
    source: 'border:1px solid rgb(220, 220, 220);border-radius:18px',
    bare: '',
    wide: 'border:2px solid rgb(220, 220, 220);border-radius:18px',
    tint: 'border:1px solid rgb(40, 90, 200);border-radius:18px',
    square: 'border:1px solid rgb(220, 220, 220);border-radius:0'
  }
  const srv = await serve(Object.fromEntries(Object.entries(variants).map(([k, v]) => [`/${k}`, page(v)])))
  try {
    const m = await withBrowser(async (browser) => {
      const out = {}
      const p = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      for (const k of Object.keys(variants)) {
        await p.goto(`${srv.origin}/${k}`)
        out[k] = await p.evaluate(measureInPage)
      }
      return out
    })
    const card = m.source.find((b) => b.words === 'hosting')
    assert.deepEqual([card.panel.border, card.panel.radius], ['1px rgb(220, 220, 220)', '18px'])
    assert.equal(m.source.find((b) => b.words === 'only rounded').panel, null, 'corners alone paint nothing')
    const rows = (k) => compareBlocks(m.source, m[k]).rows.filter((r) => r.tag === 'h3').map((r) => r.deltas.map(([name, a, b]) => `${name}: ${a} → ${b}`).join('; '))
    assert.deepEqual(rows('bare'), Array(3).fill('panel: 300px rgba(0, 0, 0, 0), border 1px rgb(220, 220, 220), radius 18px → none'))
    assert.deepEqual(rows('wide'), Array(3).fill('panel border width: 1px → 2px'))
    assert.deepEqual(rows('tint'), Array(3).fill('panel border colour: rgb(220, 220, 220) → rgb(40, 90, 200)'))
    assert.deepEqual(rows('square'), Array(3).fill('panel radius: 18px → 0px'))
    assert.equal(compareBlocks(m.source, m.source).differing, 0)
  } finally {
    await srv.close()
  }
})
