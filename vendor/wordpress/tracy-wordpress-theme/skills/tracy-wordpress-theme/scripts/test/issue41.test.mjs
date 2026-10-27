// #41 (JA Vega M6, part 3): the intended drafts the prune audit must keep, article tags, the Joomla
// pager, "More Articles" before the pager, a drawer opened and closed by touch, and the page slug
// of a menu item that shows an article. Tests named `M6-<n>:` reproduce the item through entry
// points that existed before the fix (scripts/test/issue41-baseline.mjs runs them against the base
// commit and requires an assertion failure for every item); a helper added by the fix is reached
// through `need()`, which fails as an assertion — not a TypeError — on a tree that does not have
// it, so this file loads on the base. Such a failure says "missing on this tree": the baseline
// counts it as a missing export, never as the item reproduced.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import * as quickstartLib from '../quickstart/lib.mjs'
import * as cycle from '../quickstart/cycle.mjs'
import * as seedApi from '../seed.mjs'
import * as inventoryApi from '../lib/joomla-inventory.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { fakeSite } from './lib/fake-site.mjs'
import { parseBlocks, findAll, checkMarkup, serializeBlocks } from '../lib/block-fill.mjs'
import * as functionalApi from '../review/functional.mjs'
import { withBrowser } from '../lib/browser.mjs'
import { createServer } from 'node:http'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..', '..')
const FIXTURES = join(here, 'fixtures', 'issue41')
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
const tmp = (prefix) => {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})
/** An export of the fix: an assertion failure (not a TypeError) on a tree that lacks it. */
const need = (mod, name) => {
  assert.equal(typeof mod[name], 'function', `missing on this tree: ${name} is not exported`)
  return mod[name]
}
const JA_VEGA = JSON.parse(readFileSync(join(FIXTURES, 'ja-vega.json'), 'utf8'))
const JOOMLA_MIN = join(here, 'fixtures', 'joomla-min')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// ── a whole seed against the fake site (as issue33.test.mjs) ─────────────────────

const HOME = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: '<!-- wp:paragraph --><p>Home.</p><!-- /wp:paragraph -->', meta: {}, images: [] }
const NEWS = [{ id: '15', title: 'News', wpSlug: 'news', description: '' }]
const post = (slug, extra = {}) => ({ slug, path: `/news/${slug}`, title: slug, category: 'news', content: `<!-- wp:paragraph --><p>The ${slug} article body.</p><!-- /wp:paragraph -->`, images: [], ...extra })
function seedFixture({ posts = [], pages = [HOME], archives = [], categories = NEWS } = {}) {
  const root = tmp('i41-seed-')
  const spec = join(root, 'spec')
  mkdirSync(spec, { recursive: true })
  const files = {
    'page-map.json': { pages: [...pages.map((x) => ({ file: x.file ?? `${x.slug}.html`, path: x.path, title: x.title, view: x.view ?? 'page' })), { file: 'single.html', path: '/single', title: 'Single', view: 'single' }, ...archives.map((a) => ({ file: a.file, path: a.path, title: a.title, view: a.view }))] },
    'content.json': { site: { name: 'Fixture' }, pages, posts, categories, archives, images: [] },
    'sections.json': { acm: [], custom: [], other: [] },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': { types: {} }
  }
  for (const [name, value] of Object.entries(files)) writeFileSync(join(spec, name), JSON.stringify(value))
  const opts = (extra = []) => seedApi.parseArgs(['--spec', spec, '--wp', 'fake', '--theme', 'fixture', '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img', '--base-url', 'http://x', '--report', join(root, 'report.json'), '--out', join(root, 'out'), ...extra])
  return { root, spec, opts }
}
const seed = (site, fx, extra = []) => seedApi.runSeed(fx.opts(extra), { runner: site.wp, fetch: async () => ({ status: 200, headers: new Map() }) })

// ── M6-20: the drafts the prune audit keeps ─────────────────────────────────────────

/**
 * A stand for prune-audit: the JA Vega state in a state file answered by fixtures/issue41/fake-wp.mjs,
 * a webroot with a themes directory, and the page-map beside it. `edit(stand)` changes the state.
 */
function jaVegaStand(edit = (s) => s) {
  const dir = tmp('i41-prune-')
  const state = edit(structuredClone(JA_VEGA.stand))
  const statePath = join(dir, 'state.json')
  writeFileSync(statePath, JSON.stringify(state))
  const capture = join(dir, 'capture')
  mkdirSync(join(capture, 'wp-content', 'themes'), { recursive: true })
  // a wp-config with the constants pack.mjs replaces: the audit reads them from the file
  writeFileSync(join(capture, 'wp-config.php'), `<?php\n${[...quickstartLib.DB_CONSTANTS, ...quickstartLib.SALT_CONSTANTS].map((n) => `define( '${n}', 'x' );`).join('\n')}\n`)
  const pageMap = join(dir, 'page-map.json')
  writeFileSync(pageMap, JSON.stringify(JA_VEGA.pageMap))
  return { dir, statePath, capture, pageMap, runner: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(FIXTURES, 'fake-wp.mjs'))} ${JSON.stringify(statePath)}`, state: () => JSON.parse(readFileSync(statePath, 'utf8')) }
}
const audit = (st, extra = []) => {
  const r = spawnSync(process.execPath, [join(pkg, 'scripts', 'quickstart', 'prune-audit.mjs'), '--webroot', st.capture, '--wp', st.runner, '--admin', 'tracyagent', '--site-url', JA_VEGA.stand.siteUrl, ...extra], { encoding: 'utf8', timeout: 120000, env: { ...process.env, TRACY_WP_KEEP: '0' } })
  let report = null
  if (extra.includes('--json') && r.status !== 2)
    try {
      report = JSON.parse(r.stdout)
    } catch {}
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, report }
}
const draftRow = (report, id) => report?.rows.find((r) => r.area === 'page:draft' && r.item.startsWith(`#${id} `))

// The audit exits 1 while a PRUNE row remains (the revision #574, removed by --apply): the draft
// tests read a stand the apply already cleaned, the cycle test below keeps it.
const noRevision = (s) => ({ ...s, revisions: [] })

test('M6-20: with the page-map, the seeder\'s search-view draft and the privacy-policy draft WordPress names are kept; an undecided draft is still UNKNOWN', () => {
  const st = jaVegaStand(noRevision)
  const r = audit(st, ['--page-map', st.pageMap, '--json'])
  assert.equal(r.code, 0, `exit ${r.code}: ${r.stderr}`)
  assert.ok(r.report, r.stdout.slice(0, 500))
  const search = draftRow(r.report, 185)
  assert.equal(search?.verdict, 'KEEP', JSON.stringify(search))
  assert.match(search.why, /search view/)
  const privacy = draftRow(r.report, 3)
  assert.equal(privacy?.verdict, 'KEEP', JSON.stringify(privacy))
  assert.match(privacy.why, /wp_page_for_privacy_policy/)
  assert.equal(draftRow(r.report, 258)?.verdict, 'KEEP')
  // #590 is seeded too, but no page-map entry calls its path a search view: no fail-open.
  const other = draftRow(r.report, 590)
  assert.equal(other?.verdict, 'UNKNOWN', JSON.stringify(other))
  assert.match(other.why, /--keep-draft 590/)
  assert.equal(r.report.unknown, 1)
  for (const id of [3, 185, 258, 590]) assert.equal(draftRow(r.report, id).remove, undefined, `#${id} carries a removal`)
})

test('M6-20: --keep-draft <id> keeps that draft and records the decision in the report; the text report prints every draft with its reason', () => {
  const st = jaVegaStand(noRevision)
  const r = audit(st, ['--page-map', st.pageMap, '--keep-draft', '590', '--keep-draft', '590', '--json'])
  assert.equal(r.code, 0, `exit ${r.code}: ${r.stderr}`)
  const row = draftRow(r.report, 590)
  assert.equal(row?.verdict, 'KEEP', JSON.stringify(row))
  assert.equal(row.decision, 'keep-draft')
  assert.match(row.why, /--keep-draft 590/)
  assert.deepEqual(r.report.keptDrafts, [590])
  assert.equal(r.report.unknown, 0)
  const text = audit(st, ['--page-map', st.pageMap, '--keep-draft', '590'])
  assert.equal(text.code, 0, text.stderr)
  assert.match(text.stdout, /KEEP +page:draft +#590 Old landing .*--keep-draft 590/)
  assert.match(text.stdout, /KEEP +page:draft +#185 Smart Search .*search view/)
  assert.match(text.stdout, /— \d+ keep, 0 prune, 0 removed, 0 to decide/)
})

test('M6-20: a --keep-draft or a --page-map that cannot be used is refused before anything is read or removed', () => {
  const st = jaVegaStand()
  const before = readFileSync(st.statePath, 'utf8')
  for (const bad of [['--keep-draft', '0'], ['--keep-draft', 'abc'], ['--keep-draft', '-3'], ['--keep-draft', '9007199254740993'], ['--keep-draft', '1.5'], ['--keep-draft']]) {
    const r = audit(st, ['--page-map', st.pageMap, ...bad, '--apply'])
    assert.equal(r.code, 2, `${bad.join(' ')}: exit ${r.code} ${r.stdout}`)
  }
  // ids that are not a draft page of this stand: missing, a published page, a revision
  for (const id of ['999', '12', '574']) {
    const r = audit(st, ['--page-map', st.pageMap, '--keep-draft', id, '--apply'])
    assert.equal(r.code, 2, `--keep-draft ${id}: exit ${r.code}`)
    assert.match(r.stderr, new RegExp(`--keep-draft ${id}`))
  }
  const dir = tmp('i41-pm-')
  const files = {
    missing: join(dir, 'nope.json'),
    directory: dir,
    malformed: join(dir, 'bad.json'),
    empty: join(dir, 'empty.json'),
    list: join(dir, 'list.json'),
    pathless: join(dir, 'pathless.json'),
    symlink: join(dir, 'link.json'),
    fifo: join(dir, 'fifo.json')
  }
  // a link to a good page-map, and a FIFO nothing writes to (a read of it would never return)
  symlinkSync(st.pageMap, files.symlink)
  assert.equal(spawnSync('mkfifo', [files.fifo]).status, 0, 'mkfifo')
  writeFileSync(files.malformed, '{"pages": [')
  writeFileSync(files.empty, '{"pages": []}')
  writeFileSync(files.list, '["/smart-search"]')
  writeFileSync(files.pathless, JSON.stringify({ pages: [{ view: 'search', title: 'Search' }] }))
  for (const [what, f] of Object.entries(files)) {
    const r = audit(st, ['--page-map', f, '--apply'])
    assert.equal(r.code, 2, `${what}: exit ${r.code} ${r.stdout.slice(0, 300)}`)
    assert.match(r.stderr, /--page-map/, what)
  }
  assert.equal(readFileSync(st.statePath, 'utf8'), before, 'a refused run changed the stand')
})

test('M6-20: a search-view draft needs both the seed marker and the page-map view — any doubt stays UNKNOWN', () => {
  const classifyDraftPages = quickstartLib.classifyDraftPages
  const searchViewsOf = need(quickstartLib, 'searchViewsOf')
  const media = (edit = (m) => m) => edit({ ...structuredClone({ content: JA_VEGA.stand.content, meta: JA_VEGA.stand.meta, options: JA_VEGA.stand.options }), attachments: [], termmeta: [] })
  const views = searchViewsOf(JA_VEGA.pageMap)
  const verdict = (m, v = views, keepDrafts = []) => classifyDraftPages(m, { searchViews: v, keepDrafts }).find((r) => r.item.startsWith('#185 '))?.verdict
  assert.equal(verdict(media()), 'KEEP')
  // no page-map: the seeded draft at a redirect's path is a person's call, as before
  assert.equal(verdict(media(), null), 'UNKNOWN')
  // no seed marker, or an empty one
  assert.equal(verdict(media((m) => ({ ...m, meta: m.meta.filter((x) => x.post_id !== '185') }))), 'UNKNOWN')
  assert.equal(verdict(media((m) => ({ ...m, meta: m.meta.map((x) => (x.post_id === '185' ? { ...x, meta_value: ' ' } : x)) }))), 'UNKNOWN')
  // the page-map calls the path something else, or claims it twice with different views
  assert.equal(verdict(media(), searchViewsOf({ pages: JA_VEGA.pageMap.pages.map((p) => (p.view === 'search' ? { ...p, path: '/search' } : p)) })), 'UNKNOWN')
  const twice = classifyDraftPages(media(), { searchViews: searchViewsOf({ pages: [...JA_VEGA.pageMap.pages, { path: '/smart-search/', view: 'page', title: 'X' }] }) }).find((r) => r.item.startsWith('#185 '))
  assert.equal(twice.verdict, 'UNKNOWN')
  assert.match(twice.why, /2 entries/)
  // the draft sits under a parent the read does not hold, or in a parent loop: its path is not known
  assert.equal(verdict(media((m) => ({ ...m, content: m.content.map((c) => (c.ID === '185' ? { ...c, post_parent: '77' } : c)) }))), 'UNKNOWN')
  assert.equal(verdict(media((m) => ({ ...m, content: [...m.content.map((c) => (c.ID === '185' ? { ...c, post_parent: '186' } : c)), { ID: '186', post_type: 'page', post_status: 'publish', post_name: 'x', post_title: 'x', post_parent: '185' }] }))), 'UNKNOWN')
  // a published page at the path is not a draft to keep: not listed at all
  assert.equal(verdict(media((m) => ({ ...m, content: m.content.map((c) => (c.ID === '185' ? { ...c, post_status: 'publish' } : c)) }))), undefined)
  // an option that only looks like a core one names nothing
  const privacy = (options) => classifyDraftPages(media((m) => ({ ...m, options })), { searchViews: views }).find((r) => r.item.startsWith('#3 '))?.verdict
  assert.equal(privacy([{ option_name: 'wp_page_for_privacy_policy', option_value: '3' }]), 'KEEP')
  for (const option_name of ['my_wp_page_for_privacy_policy', 'wp_page_for_privacy_policy_old', 'WP_PAGE_FOR_PRIVACY_POLICY'])
    assert.equal(privacy([{ option_name, option_value: '3' }]), 'UNKNOWN', option_name)
  assert.equal(privacy([{ option_name: 'wp_page_for_privacy_policy', option_value: '30' }]), 'UNKNOWN')
  // the 404 option is the one of the theme the stand runs, and no other
  const notFound = (options) => classifyDraftPages(media((m) => ({ ...m, options })), { searchViews: views }).find((r) => r.item.startsWith('#258 '))?.verdict
  assert.equal(notFound([{ option_name: 'stylesheet', option_value: 'wp-ja-vega' }, { option_name: 'wp_ja_vega_404_page', option_value: '258' }]), 'KEEP')
  for (const options of [
    [{ option_name: 'stylesheet', option_value: 'wp-ja-vega' }, { option_name: 'fake_404_page', option_value: '258' }],
    [{ option_name: 'stylesheet', option_value: 'twentytwentyfive' }, { option_name: 'wp_ja_vega_404_page', option_value: '258' }],
    [{ option_name: 'wp_ja_vega_404_page', option_value: '258' }],
    [{ option_name: 'stylesheet', option_value: 'wp-ja-vega' }, { option_name: 'stylesheet', option_value: 'other' }, { option_name: 'wp_ja_vega_404_page', option_value: '258' }]
  ])
    assert.equal(notFound(options), 'UNKNOWN', JSON.stringify(options))
  // every page-map entry is checked, not only the search ones: a path or a view that cannot be read stops the audit
  for (const bad of [{ view: 'page', path: 42 }, { view: 'page' }, { view: 'page', path: 'about' }, { path: '/about' }, { view: '', path: '/about' }, { view: 7, path: '/about' }, ['/about'], null])
    assert.throws(() => searchViewsOf({ pages: [...JA_VEGA.pageMap.pages, bad] }), /pages\[\d+\]/, JSON.stringify(bad))
})

/** A run-root whose canonical contracts are bound to its spec-pack, so cycle.mjs's freshness gate passes. */
async function freshDossier() {
  const { writeContracts } = await import('./quickstart-contracts.mjs')
  const runRoot = tmp('cycle-dossier-')
  const spec = join(runRoot, 'spec')
  mkdirSync(spec)
  for (const f of ['sections.json', 'content.json']) writeFileSync(join(spec, f), '{}')
  // the page map the cycle's --routes is: verify and release read the same routes (cycle.mjs routeProblems)
  writeFileSync(join(spec, 'page-map.json'), JSON.stringify(JA_VEGA.pageMap))
  writeContracts({ runRoot, specDir: spec })
  // the cycle plans a contract-bind phase for the release (cycle.mjs inputProblems): it needs the contract's slug and the theme zip, even
  // though these tests run only the prune phase
  const themeZip = join(runRoot, 'theme.zip')
  writeFileSync(themeZip, 'zip')
  return { runRoot, spec, contract: 'ja-vega/wp7/1.1.2', themeZip }
}

test('M6-20: the cycle passes the page-map and every --keep-draft to both prune audits, and its prune phase passes with the drafts kept', async () => {
  const st = jaVegaStand()
  const o = { stand: st.dir, id: 'ja-vega/wp7', version: '1.1.2', siteA: JA_VEGA.stand.siteUrl, siteB: 'http://b', wpA: st.runner, wpB: 'wpb', rootB: 'rootb', routes: st.pageMap, admin: 'tracyagent', darkHook: 'cookie:tracy_theme=dark', dbHost: 'verify-db', dbPasswordEnv: 'PW', ...(await freshDossier()), keepDraft: ['590'] }
  const p = cycle.plan(o)
  for (const step of p.prune) {
    const at = step.argv.indexOf('--page-map')
    assert.ok(at > 0 && step.argv[at + 1] === st.pageMap, `no --page-map in ${step.argv.join(' ')}`)
    assert.equal(step.argv[step.argv.indexOf('--keep-draft') + 1], '590', `no --keep-draft in ${step.argv.join(' ')}`)
  }
  // The real prune phase — apply, then the re-audit that must read "0 prune … 0 to decide" — against
  // the stand in the state file; the later phases are not this item's. (The cycle tees the phases'
  // output to stdout; the test runner's own report is not on it, so nothing is silenced.)
  let state
  try {
    process.env.TRACY_WP_KEEP = '0'
    state = await cycle.runCycle(o, { planOverride: { ...p, pack: [], restore: [], verify: [], 'contract-bind': [], release: [] }, timeout: 300 })
  } catch (e) {
    state = { error: e.message }
  }
  const log = existsSync(join(st.dir, 'cycle.log')) ? readFileSync(join(st.dir, 'cycle.log'), 'utf8') : ''
  assert.equal(state.phases?.prune?.ok, true, `${state.error ?? ''}\n${log.slice(-1500)}`)
  assert.match(log, /— \d+ keep, 0 prune, 1 removed, 0 to decide/)
  assert.match(log, /— \d+ keep, 0 prune, 0 removed, 0 to decide/)
  // the revision went; every draft is still there, with its id and status
  const after = st.state()
  assert.deepEqual(after.revisions, [])
  assert.deepEqual(after.content.filter((c) => c.post_status === 'draft').map((c) => Number(c.ID)).sort((a, b) => a - b), [3, 185, 258, 590])
})

test('M6-20: a draft nobody decided on still stops the cycle at prune', async () => {
  const st = jaVegaStand()
  const o = { stand: st.dir, id: 'ja-vega/wp7', version: '1.1.2', siteA: JA_VEGA.stand.siteUrl, siteB: 'http://b', wpA: st.runner, wpB: 'wpb', rootB: 'rootb', routes: st.pageMap, admin: 'tracyagent', darkHook: 'cookie:tracy_theme=dark', dbHost: 'verify-db', dbPasswordEnv: 'PW', ...(await freshDossier()) }
  let error = null
  try {
    process.env.TRACY_WP_KEEP = '0'
    await cycle.runCycle(o, { planOverride: { ...cycle.plan(o), pack: [], restore: [], verify: [], 'contract-bind': [], release: [] }, timeout: 300 })
  } catch (e) {
    error = e.message
  }
  assert.match(String(error), /prune failed/)
  const log = readFileSync(join(st.dir, 'cycle.log'), 'utf8')
  assert.match(log, /UNKNOWN +page:draft +#590 /)
  assert.match(log, /1 to decide/)
  assert.equal(st.state().content.filter((c) => c.post_status === 'draft').length, 4, 'a draft was removed')
})

// ── M6-15: article tags from the tag tables ──────────────────────────────────────────

/**
 * A Joomla database for joomla-dump.mjs: the joomla-min tables under `jm_`, #__extensions with the
 * fixture's com_content options as its params column, plus the JA Vega tag rows (or not).
 */
function joomlaDb({ tags = true, edit = (db) => db, status = 0 } = {}) {
  const dir = tmp('i41-dump-')
  const inv = readJson(join(JOOMLA_MIN, 'inventory.json'))
  let db = Object.fromEntries(Object.entries(inv).map(([t, rows]) => [`jm_${t}`, rows]))
  db.jm_extensions = [
    { extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', params: readFileSync(join(JOOMLA_MIN, 'content-params.json'), 'utf8').trim() },
    { extension_id: '120', name: 'mod_menu', type: 'module', element: 'mod_menu', folder: '', client_id: '0', enabled: '1', params: '{"secret":"not-exported"}' }
  ]
  if (tags) {
    db.jm_tags = JA_VEGA.tags.tags
    db.jm_contentitem_tag_map = JA_VEGA.tags.map
  }
  db = edit(db)
  const dbPath = join(dir, 'db.json')
  writeFileSync(dbPath, JSON.stringify(db))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(FIXTURES, 'fake-docker.mjs'))} "$@"\n`, { mode: 0o755 })
  const j6 = join(dir, 'j6')
  const r = spawnSync(process.execPath, [join(pkg, 'scripts', 'ingest', 'joomla-dump.mjs'), '--out', j6, '--container', 'fake-joomla-db', '--password', 'x', '--prefix', 'jm_'], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_JOOMLA_DB: dbPath } })
  assert.equal(r.status, status, `joomla-dump exited ${r.status}: ${r.stderr}${r.stdout}`)
  if (status !== 0) return { dir, j6, stderr: r.stderr, wrote: existsSync(join(j6, 'inventory.json')) }
  // the dump makes inventory.json (the com_content options included) and render-routes.json; the
  // template capture is the fixture's
  cpSync(join(JOOMLA_MIN, 'capture'), join(j6, 'capture'), { recursive: true })
  // a capture/ put beside a dump that recorded none is not that generation: the record goes, as a dump made before it
  { const dj = readJson(join(j6, 'dump.json')); delete dj.generation; writeFileSync(join(j6, 'dump.json'), JSON.stringify(dj)) }
  return { dir, j6, sql: readFileSync(`${dbPath}.sql`, 'utf8') }
}
const specOf = (j6Dir) => {
  const out = join(tmp('i41-fj-'), 'pack')
  buildSpecPack({ j6Dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  return { out, content: readJson(join(out, 'content.json')), provenance: readJson(join(out, 'provenance.json')) }
}

test('M6-15: the dump reads the tag tables, the adapter puts each article\'s tags in posts[].tags in tag-tree order, and the seeder writes them to tags_input', async () => {
  const { j6, sql } = joomlaDb()
  const inv = readJson(join(j6, 'inventory.json'))
  assert.ok(Array.isArray(inv.tags), `the dump did not read #__tags; it sent:\n${sql}`)
  assert.ok(Array.isArray(inv.contentitem_tag_map), 'the dump did not read #__contentitem_tag_map')
  // the map is dumped whole — no WHERE on type_alias could drop a row before the adapter sees it;
  // the adapter picks the article rows
  assert.doesNotMatch(sql, /FROM `jm_contentitem_tag_map` WHERE/)
  assert.deepEqual(inv.contentitem_tag_map.length, JA_VEGA.tags.map.length)
  assert.ok(inv.contentitem_tag_map.some((r) => r.type_alias === 'com_contact.contact'), 'another component\'s rows are dumped too')
  const { content } = specOf(j6)
  const strategy = content.posts.find((p) => p.joomla.articleId === '3')
  assert.deepEqual(strategy?.tags, JA_VEGA.tags.expect['3'], JSON.stringify(strategy?.tags))
  // Through a seed: the spec's tags are the post's tags_input, in that order; a post that
  // declares [] has none — the tags row at the end of a body is not read over it.
  const tail = '<!-- wp:html --><div class="tags">Tags: <a href="/t/old">old-tail-tag</a></div><!-- /wp:html -->'
  const fx = seedFixture({ posts: [post('strategy', { tags: strategy.tags }), post('untagged', { tags: [], content: `<!-- wp:paragraph --><p>Body.</p><!-- /wp:paragraph -->\n${tail}` }), post('legacy', { content: `<!-- wp:paragraph --><p>Body.</p><!-- /wp:paragraph -->\n${tail}` })] })
  const site = fakeSite()
  await seed(site, fx)
  assert.equal(String(site.post((p) => p.post_name === 'strategy').tags_input), JA_VEGA.tags.expect['3'].join(','))
  assert.equal(String(site.post((p) => p.post_name === 'untagged').tags_input), '')
  assert.equal(String(site.post((p) => p.post_name === 'legacy').tags_input), 'old-tail-tag', 'no spec tags: the body\'s tags row still decides')
  const second = await seed(site, fx)
  assert.deepEqual(second.counts.posts, { created: 0, updated: 0, skipped: 3 })
})

test('M6-15: a page\'s tags, another component\'s rows, an unpublished, missing or repeated tag and a second tag of one name are not a post\'s tags', () => {
  const articleTags = need(inventoryApi, 'articleTags')
  const inv = { tags: JA_VEGA.tags.tags, contentitem_tag_map: JA_VEGA.tags.map }
  const { byArticle, notes } = articleTags(inv)
  assert.deepEqual(byArticle.get('3'), JA_VEGA.tags.expect['3'])
  assert.deepEqual(byArticle.get('45'), JA_VEGA.tags.expect['45'])
  assert.ok(!byArticle.get('3').includes('contact-only') && !byArticle.get('3').includes('retired') && !byArticle.get('3').includes('Business'))
  assert.match(notes.join('\n'), /tag\(s\) 99 /)
  // the order is the tree's, whatever order the map rows come in
  assert.deepEqual(articleTags({ ...inv, contentitem_tag_map: [...inv.contentitem_tag_map].reverse() }).byArticle.get('3'), JA_VEGA.tags.expect['3'])
  // tables not dumped: not declared (null); empty tables: no tags
  assert.equal(articleTags({}), null)
  assert.equal(articleTags({ tags: [], contentitem_tag_map: [] }).byArticle.size, 0)
  // one table without the other, or a table that is not a list, is a dump gone wrong — not "no tags"
  assert.throws(() => articleTags({ tags: [] }), /#__contentitem_tag_map: not in the inventory/)
  assert.throws(() => articleTags({ contentitem_tag_map: inv.contentitem_tag_map }), /#__tags: not in the inventory/)
  for (const bad of [{}, null, 'rows', 3])
    assert.throws(() => articleTags({ ...inv, tags: bad }), /#__tags: not a list of rows/, JSON.stringify(bad))
  assert.throws(() => articleTags({ ...inv, contentitem_tag_map: { 0: inv.contentitem_tag_map[0] } }), /#__contentitem_tag_map: not a list of rows/)
  assert.throws(() => articleTags({ ...inv, contentitem_tag_map: [...inv.contentitem_tag_map, null] }), /#__contentitem_tag_map: a row that is not an object/)
  // a shown tag an article carries without a title is not dropped quietly
  const shownOn3 = JA_VEGA.tags.tags.find((t) => t.title === JA_VEGA.tags.expect['3'][0]).id
  for (const title of [undefined, '', '  '])
    assert.throws(() => articleTags({ ...inv, tags: inv.tags.map((t) => (t.id === shownOn3 ? { ...t, title } : t)) }), new RegExp(`#__tags: tag ${shownOn3}, on article 3, has no title`), JSON.stringify(title))
  // a tag nobody carries may have no title
  assert.deepEqual(articleTags({ ...inv, tags: [...inv.tags, { id: '500', parent_id: '1', lft: '90', title: '', alias: 'x', published: '1' }] }).byArticle.get('3'), JA_VEGA.tags.expect['3'])
  // malformed rows throw, naming the table
  assert.throws(() => articleTags({ ...inv, tags: inv.tags.map((t) => (t.id === '2' ? { ...t, lft: 'x' } : t)) }), /#__tags: row "2" has no integer lft/)
  assert.throws(() => articleTags({ ...inv, tags: [...inv.tags, inv.tags[1]] }), /appears twice/)
  assert.throws(() => articleTags({ ...inv, contentitem_tag_map: [...inv.contentitem_tag_map, { type_alias: 'com_content.article', content_item_id: 'abc', tag_id: '2' }] }), /#__contentitem_tag_map/)
  // a map row without a component cannot be told from an article's row: it throws, it is not skipped
  for (const type_alias of [undefined, null, '', '  ', 3])
    assert.throws(() => articleTags({ ...inv, contentitem_tag_map: [...inv.contentitem_tag_map, { type_alias, content_item_id: '3', tag_id: '2' }] }), /#__contentitem_tag_map: a row without a type_alias/, JSON.stringify(type_alias))
  // the page (#45) is not a post: its tags go nowhere; the post (#3) has them
  const { j6 } = joomlaDb()
  const { content, provenance } = specOf(j6)
  assert.equal(content.posts.some((p) => p.joomla.articleId === '45'), false)
  assert.match(JSON.stringify(provenance), /article tags: 1 of 1 posts tagged/)
})

test('M6-15: an inventory without the tag tables says so and the posts carry no tags field; tags of the wrong shape stop the seed before anything is written', async () => {
  const { j6 } = joomlaDb({ tags: false })
  const inv = readJson(join(j6, 'inventory.json'))
  assert.equal(inv.tags, undefined, 'a table the site does not have is not an empty list')
  const { content, provenance } = specOf(j6)
  assert.ok(content.posts.length > 0)
  for (const p of content.posts) assert.equal(p.tags, undefined, p.slug)
  assert.match(JSON.stringify(provenance), /article tags are not in the inventory/)
  // a tag table that is there but cannot be read, lacks a column the join needs, or has no partner
  // stops the dump — it is never written as a site without tags
  const denied = joomlaDb({ edit: (db) => ({ ...db, __fail__: { jm_tags: "ERROR 1142 (42000): SELECT command denied to user 'x' for table 'jm_tags'" } }), status: 1 })
  assert.match(denied.stderr, /SHOW COLUMNS FROM jm_tags failed: ERROR 1142/)
  assert.equal(denied.wrote, false)
  const titleless = joomlaDb({ edit: (db) => ({ ...db, jm_tags: db.jm_tags.map(({ title, ...t }) => t) }), status: 1 })
  assert.match(titleless.stderr, /jm_tags has no column title/)
  assert.equal(titleless.wrote, false)
  // SHOW COLUMNS that succeeds with no column is not a table the site does not have — for one table or both
  const columnless = joomlaDb({ edit: (db) => ({ ...db, __columns__: { jm_tags: [], jm_contentitem_tag_map: [] } }), status: 1 })
  assert.match(columnless.stderr, /jm_tags has no column .*SHOW COLUMNS answered no column at all/)
  assert.equal(columnless.wrote, false)
  const mapColumnless = joomlaDb({ edit: (db) => ({ ...db, __columns__: { jm_contentitem_tag_map: [] } }), status: 1 })
  assert.match(mapColumnless.stderr, /jm_contentitem_tag_map has no column type_alias, content_item_id, tag_id/)
  // an empty table that has its columns is an answer: no tags
  const empty = joomlaDb({ edit: (db) => ({ ...db, jm_contentitem_tag_map: [], __columns__: { jm_contentitem_tag_map: ['type_alias', 'content_item_id', 'tag_id'] } }) })
  assert.deepEqual(readJson(join(empty.j6, 'inventory.json')).contentitem_tag_map, [])
  // a line of the SELECT that is not a row stops the dump; it is not dropped as a tag the site lacks
  for (const line of ['{"type_alias": "com_content.article", "content_item_id": "3", "tag_id"', 'Warning (Code 1265): Data truncated', '[1,2]', 'null'])
    for (const table of ['jm_tags', 'jm_contentitem_tag_map']) {
      const garbled = joomlaDb({ edit: (db) => ({ ...db, __lines__: { [table]: [line] } }), status: 1 })
      assert.match(garbled.stderr, new RegExp(`${table} answered a line that is not a row`), `${table}: ${line}`)
      assert.equal(garbled.wrote, false)
    }
  // a map row whose type_alias is NULL, empty or blank stops the dump — it is not filtered away in SQL
  // before anything could tell whether it was an article's tag; and an inventory holding one stops
  // the adapter
  for (const type_alias of [null, '', '  ']) {
    const aliasless = joomlaDb({ edit: (db) => ({ ...db, jm_contentitem_tag_map: [...db.jm_contentitem_tag_map, { type_alias, content_item_id: '3', tag_id: '2' }] }), status: 1 })
    assert.match(aliasless.stderr, /jm_contentitem_tag_map has 1 row\(s\) without a type_alias/, JSON.stringify(type_alias))
    assert.equal(aliasless.wrote, false)
  }
  const dumped = joomlaDb()
  const invPath = join(dumped.j6, 'inventory.json')
  const edited = readJson(invPath)
  edited.contentitem_tag_map.push({ type_alias: null, content_item_id: '3', tag_id: '2' })
  writeFileSync(invPath, JSON.stringify(edited))
  assert.throws(() => specOf(dumped.j6), /#__contentitem_tag_map: a row without a type_alias/)
  const half = joomlaDb({ edit: ({ jm_contentitem_tag_map, ...db }) => db, status: 1 })
  assert.match(half.stderr, /jm_contentitem_tag_map does not exist while jm_tags does/)
  assert.equal(half.wrote, false)
  for (const tags of ['business,technology', [''], [3], { a: 1 }]) {
    const site = fakeSite()
    await assert.rejects(seed(site, seedFixture({ posts: [post('bad', { tags })] })), /posts\[\]\.tags/, JSON.stringify(tags))
    assert.equal([...site.posts.values()].filter((p) => p.post_type === 'post').length, 0, 'a post was written')
  }
  // a name holding a comma goes as a list, so WordPress does not split it
  const tagsInput = need(seedApi, 'tagsInput')
  assert.deepEqual(tagsInput(['Research, Development', 'app']), ['Research, Development', 'app'])
  assert.equal(tagsInput(['business', 'app', 'Business']), 'business,app')
})

// ── M6-16 / M6-17: the Joomla pager, and "More Articles" before it ───────────────────

const CARDS = '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'
const archiveCtx = (cards = CARDS) => ({
  patterns: { 'tracy/cards': cards },
  terms: new Map([['news', { id: 5, slug: 'news', name: 'News' }]]),
  spec: { content: { categories: [{ title: 'News', wpSlug: 'news', description: '' }] } },
  descendants: () => [],
  categoryUrl: () => '/news',
  rewrite: (x) => x,
  tags: new Map([['archived', { id: 9 }]])
})
// JA Vega's /category-blog as the adapter records it: 1 leading + 6 intro a page, 4 link-only titles.
const PAGING = { leading: 1, intro: 6, links: 4, from: { leading: 'global', intro: 'menu', links: 'global' } }
const MORE = { heading: 'More Articles …', from: 'Joomla core language string COM_CONTENT_MORE_ARTICLES (en-GB)' }
const blogArchive = (extra = {}) => ({ file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7, paging: PAGING, moreArticles: MORE, ...extra })
const pagersOf = (markup) => findAll(parseBlocks(markup), (b) => b.name === 'core/query-pagination')

test('M6-16: a listing the Joomla adapter pages gets the Joomla pager, and the seeder installs the plugin that draws it; another listing keeps core\'s', async () => {
  const joomla = pagersOf(seedApi.buildArchiveContent(blogArchive({ moreArticles: undefined, paging: { ...PAGING, links: 0 } }), archiveCtx()))
  assert.equal(joomla.length, 1)
  assert.match(String(joomla[0].attrs.className), /(^|\s)tracy-joomla-pager(\s|$)/, JSON.stringify(joomla[0].attrs))
  // the controls stay core blocks inside it: the editor still edits a core pager
  assert.deepEqual(joomla[0].innerBlocks.map((b) => b.name), ['core/query-pagination-previous', 'core/query-pagination-numbers', 'core/query-pagination-next'])
  const plain = pagersOf(seedApi.buildArchiveContent({ path: '/news', view: 'category', category: 'news', perPage: 7 }, archiveCtx()))
  assert.equal(plain.length, 1)
  assert.doesNotMatch(String(plain[0].attrs.className ?? ''), /tracy-joomla-pager/)
  // a pattern's own pager is marked, its classes kept
  const own = CARDS.replace('<!-- /wp:post-template -->', '<!-- /wp:post-template -->\n<!-- wp:query-pagination {"className":"own"} -->\n<!-- wp:query-pagination-next /-->\n<!-- /wp:query-pagination -->')
  assert.deepEqual(pagersOf(seedApi.buildArchiveContent(blogArchive({ moreArticles: undefined }), archiveCtx(own))).map((b) => b.attrs.className), ['own tracy-joomla-pager'])
  // Through a seed: the plugin is written once, the second seed finds it the same.
  const posts = Array.from({ length: 9 }, (_, i) => post(`p${i + 1}`))
  const fx = seedFixture({ posts, archives: [blogArchive()] })
  const site = fakeSite()
  const report = await seed(site, fx)
  assert.equal(report.joomlaPager?.plugin?.action, 'written', JSON.stringify(report.joomlaPager))
  assert.equal(site.muPlugins.get('tracy-joomla-pagination.php'), readFileSync(join(pkg, 'scripts', 'php', 'joomla-pagination.php'), 'utf8'))
  const again = await seed(site, fx)
  assert.equal(again.joomlaPager.plugin.action, 'same')
  assert.deepEqual(again.counts.pages, { created: 0, updated: 0, skipped: again.counts.pages.skipped })
})

// The plugin's PHP, run by a real PHP with the WordPress calls it makes stubbed: the block's own
// query answers `max_num_pages`, the request's page is $_GET.
const phpOk = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
function renderPager({ total, get = {}, className = 'tracy-joomla-pager', queryId = 2, pages = 0 }) {
  const file = join(pkg, 'scripts', 'php', 'joomla-pagination.php')
  assert.ok(existsSync(file), 'missing on this tree: no scripts/php/joomla-pagination.php')
  const stubs = `
    class WP_Block { public $context; function __construct($c) { $this->context = $c; } }
    class WP_Query { public $max_num_pages; function __construct($v) { $GLOBALS['asked'][] = $v; $this->max_num_pages = $v['paged'] > ${Number(total)} ? 0 : ${Number(total)}; } }
    function add_filter() {} function apply_filters($n, $v) { return $v; }
    function build_query_vars_from_query_block($b, $page) { return array('paged' => $page, 'queryId' => $b->context['queryId']); }
    function esc_url($u) { return htmlspecialchars($u, ENT_QUOTES); } function esc_attr($s) { return htmlspecialchars($s, ENT_QUOTES); } function esc_html($s) { return htmlspecialchars($s, ENT_QUOTES); }
    function wp_unslash($v) { return $v; }
    function add_query_arg($k, $v) { $q = $_GET; $q[$k] = $v; return '/news/?' . http_build_query($q); }
    function remove_query_arg($k) { $q = $_GET; unset($q[$k]); return '/news/' . ($q ? '?' . http_build_query($q) : ''); }
    function wp_register_style() {} function wp_add_inline_style($h, $css) { $GLOBALS['css'] = $css; } function wp_enqueue_style() {}
    $_GET = json_decode(${JSON.stringify(JSON.stringify(get))}, true);
    $GLOBALS['asked'] = array();
    require ${JSON.stringify(file)};
    $block = new WP_Block(array('queryId' => ${queryId}, 'query' => array('perPage' => 7, 'pages' => ${pages})));
    echo json_encode(array('html' => tracy_joomla_pager_render('<core pager>', array('attrs' => array('className' => ${JSON.stringify(className)})), $block), 'asked' => $GLOBALS['asked'], 'css' => isset($GLOBALS['css']) ? $GLOBALS['css'] : null));`
  const r = spawnSync('php', ['-d', 'display_errors=stderr', '-r', stubs], { encoding: 'utf8', timeout: 30000 })
  assert.equal(r.status, 0, `php: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const ENTITIES = { '&laquo;': '«', '&lsaquo;': '‹', '&rsaquo;': '›', '&raquo;': '»', '&amp;': '&' }
const decode = (s) => s.replace(/&(?:laquo|lsaquo|rsaquo|raquo|amp);/g, (e) => ENTITIES[e])
const items = (html) => [...html.matchAll(/<li class="tracy-pager__item( is-[a-z]+)?">(<a [^>]*href="([^"]*)"[^>]*>|<span [^>]*>)([^<]*)</g)].map((m) => ({ state: (m[1] ?? '').trim() || 'link', href: m[3] ? decode(m[3]) : null, text: decode(m[4]) }))

test('M6-16: the pager draws start · previous · numbers · next · end with the disabled ends, and "Page N of M", from its own query', { skip: !phpOk && 'no php binary on this machine: the pager plugin was not executed (the WordPress proof renders it)' }, () => {
  const first = renderPager({ total: 3, get: { cat: 'x' } })
  assert.deepEqual(items(first.html).map((i) => [i.state, i.text]), [['is-disabled', '«'], ['is-disabled', '‹'], ['is-current', '1'], ['link', '2'], ['link', '3'], ['link', '›'], ['link', '»']].map(([s, t]) => [s, t]), first.html)
  assert.match(first.html, /<p class="tracy-pager__counter">Page 1 of 3<\/p>/)
  assert.deepEqual(first.asked, [{ paged: 1, queryId: 2 }], 'the total is read from the block\'s own query')
  // the links keep the other arguments and name this query's page
  assert.deepEqual(items(first.html).filter((i) => i.href).map((i) => i.href), ['/news/?cat=x&query-2-page=2', '/news/?cat=x&query-2-page=3', '/news/?cat=x&query-2-page=2', '/news/?cat=x&query-2-page=3'])
  const middle = renderPager({ total: 3, get: { 'query-2-page': '2' } })
  assert.deepEqual(items(middle.html).map((i) => i.state), ['link', 'link', 'link', 'is-current', 'link', 'link', 'link'])
  assert.equal(items(middle.html)[0].href, '/news/', 'page 1 is the listing without the page argument')
  const last = renderPager({ total: 3, get: { 'query-2-page': '3' } })
  assert.deepEqual(items(last.html).slice(-2).map((i) => i.state), ['is-disabled', 'is-disabled'])
  assert.match(last.html, /Page 3 of 3/)
  // a page past the end is the last page, as Joomla clamps it; junk is page 1; one page or none draws nothing
  // (WordPress counts no rows for a page without posts: the total is read again from page 1)
  const past = renderPager({ total: 3, get: { 'query-2-page': '99' } })
  assert.match(past.html, /Page 3 of 3/)
  assert.deepEqual(past.asked.map((v) => v.paged), [99, 1])
  for (const junk of ['-2', 'abc', '2x', '']) assert.match(renderPager({ total: 3, get: { 'query-2-page': junk } }).html, /Page 1 of 3/, junk)
  assert.equal(renderPager({ total: 1 }).html, '')
  assert.equal(renderPager({ total: 0 }).html, '')
  // the query's `pages` caps the total, as core's pager does
  assert.match(renderPager({ total: 9, pages: 4 }).html, /Page 1 of 4/)
  // ten numbers at most, around the current page
  const long = renderPager({ total: 30, get: { 'query-2-page': '15' } })
  assert.deepEqual(items(long.html).filter((i) => /^\d+$/.test(i.text)).map((i) => Number(i.text)), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  // another query's page argument does not move this pager; a pager without the class is core's
  assert.match(renderPager({ total: 3, get: { 'query-5-page': '3' } }).html, /Page 1 of 3/)
  assert.equal(renderPager({ total: 3, className: 'own' }).html, '<core pager>')
  // the style wraps and takes its colours from the presets and the text colour
  assert.match(first.css, /flex-wrap:wrap/)
  assert.doesNotMatch(first.css, /#[0-9a-f]{3,8}\b/i, 'a fixed colour in the pager style')
  // markup in the request is escaped
  assert.doesNotMatch(renderPager({ total: 3, get: { q: '"><script>x</script>' } }).html, /<script>/)
})

test('M6-17: "More Articles" sits between the cards and the pager, inside the cards query; its query, heading and offset are unchanged', () => {
  const markup = seedApi.buildArchiveContent(blogArchive(), archiveCtx())
  const blocks = parseBlocks(markup)
  const queries = findAll(blocks, (b) => b.name === 'core/query')
  assert.equal(queries.length, 2, markup)
  const cards = queries.find((q) => q.attrs.queryId === 2)
  const more = queries.find((q) => q.attrs.queryId === 5)
  assert.ok(cards && more, markup)
  const at = (name) => markup.indexOf(name)
  assert.ok(at('tracy-more-articles') > at('<!-- /wp:post-template -->'), 'More Articles is after the cards')
  assert.ok(at('tracy-more-articles') < at('<!-- wp:query-pagination '), 'More Articles is before the pager')
  // nested in the cards query, right before its pager
  assert.deepEqual(cards.innerBlocks.map((b) => b.name), ['core/post-template', 'core/query', 'core/query-pagination'])
  assert.deepEqual(more.attrs.query.tracyMore, { after: 2, skip: 7 })
  assert.equal(more.attrs.query.perPage, 4)
  assert.deepEqual(more.attrs.query.taxQuery, cards.attrs.query.taxQuery)
  assert.match(findAll([more], (b) => b.name === 'core/heading')[0].innerContent.join(''), /More Articles …/)
  assert.ok(checkMarkup(markup))
  assert.equal(serializeBlocks(parseBlocks(markup)), markup, 'the markup round-trips')
  // a pattern whose pager sits in a group: the list goes in front of it there
  const grouped = CARDS.replace('<!-- /wp:post-template -->', '<!-- /wp:post-template -->\n<!-- wp:group {"className":"pager-row"} -->\n<div class="wp-block-group pager-row"><!-- wp:query-pagination -->\n<!-- wp:query-pagination-next /-->\n<!-- /wp:query-pagination --></div>\n<!-- /wp:group -->')
  const g = seedApi.buildArchiveContent(blogArchive(), archiveCtx(grouped))
  const row = findAll(parseBlocks(g), (b) => b.attrs?.className === 'pager-row')[0]
  assert.deepEqual(row.innerBlocks.map((b) => b.name), ['core/query', 'core/query-pagination'], g)
  assert.ok(checkMarkup(g))
  assert.equal(serializeBlocks(parseBlocks(g)), g)
})

// ── M6-18: the drawer, opened and closed by a real tap ──────────────────────────────

// A header with a drawer as ports draw one. `variant`: good · covered (the JA Vega fault: the close
// button sits in the header under the open panel, z-index 80 over 10 — its centre hits the panel,
// only Escape closes) · noaria (aria-expanded never changes) · nofocus (focus is not returned) ·
// core (core/navigation's overlay markup, is-menu-open) · corecovered (the same overlay with a
// layer of the open panel drawn over its close button) · none (no drawer at all).
const drawerPage = (variant) => {
  const css = `*{box-sizing:border-box}body{margin:0;font:16px sans-serif;background:rgb(255,255,255);color:rgb(20,20,20)}
html[data-theme="dark"] body{background:rgb(17,17,17);color:rgb(238,238,238)}
header{position:relative;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 12px}
#open,#close{width:48px;height:48px}
#menu{position:fixed;inset:0 0 0 60px;z-index:80;background:rgb(240,240,240)}
html[data-theme="dark"] #menu{background:rgb(40,40,40)}
#menu[hidden]{display:none}
${variant === 'covered' ? '#close{position:fixed;top:8px;right:12px;z-index:10}' : '#close{position:absolute;top:8px;right:12px}'}
.wp-block-navigation__responsive-container{display:none}.wp-block-navigation__responsive-container.is-menu-open{display:block;position:fixed;inset:0;z-index:100;background:rgb(240,240,240)}`
  const js = `const o=document.getElementById('open'),m=document.getElementById('menu'),c=document.getElementById('close');
o.addEventListener('click',()=>{m.hidden=false;${variant === 'noaria' ? '' : "o.setAttribute('aria-expanded','true');"}c.hidden=false});
c.addEventListener('click',()=>{m.hidden=true;${variant === 'noaria' ? '' : "o.setAttribute('aria-expanded','false');"}${variant === 'covered' ? 'c.hidden=true;' : ''}${variant === 'nofocus' ? 'document.body.focus();' : 'o.focus();'}});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){m.hidden=true;o.setAttribute('aria-expanded','false');o.focus()}});`
  const core = `<nav class="wp-block-navigation"><button class="wp-block-navigation__responsive-container-open" aria-haspopup="dialog" aria-label="Open menu">≡</button>
<div class="wp-block-navigation__responsive-container" id="m1"><div class="wp-block-navigation__responsive-dialog" aria-modal="true" role="dialog"><button class="wp-block-navigation__responsive-container-close" aria-label="Close menu">×</button><a href="/">Home</a></div>${variant === 'corecovered' ? '<div class="panel-layer" style="position:absolute;inset:0;z-index:5"></div>' : ''}</div></nav>
<script>const n=document.querySelector('nav'),o=n.querySelector('.wp-block-navigation__responsive-container-open'),p=n.querySelector('#m1'),c=p.querySelector('.wp-block-navigation__responsive-container-close');
o.addEventListener('click',()=>p.classList.add('is-menu-open','has-modal-open'));c.addEventListener('click',()=>{p.classList.remove('is-menu-open','has-modal-open');o.focus()});</script>`
  const header = variant === 'none' ? '<header><a href="/">Logo</a></header>' : variant === 'core' || variant === 'corecovered' ? `<header><a href="/">Logo</a>${core}</header>` : `<header><a href="/">Logo</a><button id="open" aria-expanded="false" aria-controls="menu" aria-label="Open the menu">≡</button>${variant === 'covered' ? '<button id="close" aria-label="Close the menu" hidden>×</button>' : ''}</header>
<nav id="menu" hidden>${variant === 'covered' ? '' : '<button id="close" aria-label="Close the menu">×</button>'}<a href="/">Home</a></nav><script>${js}</script>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><style>${css}</style></head><body>${header}<main><h1>Northwind drawer</h1><p>Northwind body.</p></main></body></html>`
}
const RESULTS_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><main><h1>Search</h1><ul class="wp-block-post-template"><li class="wp-block-post"><h2><a href="/">Northwind drawer</a></h2></li></ul></main></body></html>'
function drawerServer() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      const variant = u.pathname.replace(/\//g, '') || 'good'
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(u.searchParams.has('s') ? RESULTS_PAGE : drawerPage(variant))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}
const PORT_DRAWER = { open: '#open', panel: '#menu', close: '#close' }
/** `node <argv>` without blocking this process's event loop; resolves `{ status, stdout, stderr }`, killed after `ms`. */
const runNode = (argv, ms = 180000) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), ms)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
  })
const kinds = (r) => (r.drawer?.findings ?? []).map((f) => `${f.kind}@${f.mode}`).sort()

// Through the entry points functional.mjs already had — runFunctional with its defaults and the
// CLI with the flags it already took: a core/navigation overlay whose close button a layer of the
// panel covers (a tap at its centre lands on the layer, the drawer stays open) is a failed review.
test('M6-18: the review as it is run — no drawer option — fails a core navigation drawer whose close button the open panel covers, in light and dark', async () => {
  const srv = await drawerServer()
  try {
    const r = await withBrowser((b) => functionalApi.runFunctional(b, { site: srv.origin, routes: ['/corecovered/'], searchWord: 'northwind' }))
    assert.equal(r.ok, false, 'a drawer that a tap cannot close passed the review')
    assert.deepEqual(kinds(r), ['drawer-close-covered@dark', 'drawer-close-covered@light', 'drawer-close-failed@dark', 'drawer-close-failed@light'], JSON.stringify(r.drawer?.findings))
    assert.match(r.drawer.findings.find((f) => f.kind === 'drawer-close-covered').hit, /panel-layer/)
    const out = join(tmp('i41-fn-'), 'functional.json')
    const cli = await runNode([join(pkg, 'scripts', 'review', 'functional.mjs'), srv.origin, '--routes', '/corecovered/', '--search-word', 'northwind', '--out', out])
    assert.equal(cli.status, 1, `the CLI exits ${cli.status} on a drawer a tap cannot close\n${cli.stdout}${cli.stderr}`)
    assert.ok(readJson(out).drawer.findings.some((f) => f.kind === 'drawer-close-covered' && f.mode === 'dark'))
  } finally {
    await srv.close()
  }
})

test('M6-18: functional opens and closes a working drawer by touch in light and dark, and reports what it tapped', async () => {
  const srv = await drawerServer()
  try {
    const r = await withBrowser((b) => functionalApi.runFunctional(b, { site: srv.origin, routes: ['/good/'], searchWord: 'northwind', drawer: need(functionalApi, 'drawerConfig')(PORT_DRAWER), darkHook: 'attr:data-theme=dark' }))
    assert.ok(r.drawer, 'functional has no drawer check')
    assert.deepEqual(kinds(r), [], JSON.stringify(r.drawer.findings))
    assert.equal(r.ok, true, JSON.stringify(r.routes.map((x) => x.findings)))
    assert.deepEqual(r.drawer.examined.modes, ['light', 'dark'])
    assert.equal(r.drawer.examined.taps, 4, 'open + close, in each mode')
    assert.equal(r.drawer.examined.closedByTap, 2)
    const dark = r.drawer.passes.find((p) => p.mode === 'dark')
    assert.equal(dark.theme.hook, true)
    assert.notEqual(dark.theme.background, r.drawer.passes.find((p) => p.mode === 'light').theme.background)
    assert.deepEqual(dark.drawers[0].steps.close.hitsItself, true)
    assert.equal(dark.drawers[0].steps.ariaOpen, 'true')
    assert.equal(dark.drawers[0].steps.ariaClosed, 'false')
    assert.match(functionalApi.formatMarkdown(r), /Drawer \(custom, required, 390 px touch\): 2 drawer\(s\) over 2 pass\(es\), 4 tap\(s\), 2 closed by a tap, modes light \+ dark — 0 finding/)
    // core/navigation's overlay is found by default and passes: a dialog button whose panel is modal
    const core = await withBrowser((b) => functionalApi.runFunctional(b, { site: srv.origin, routes: ['/core/'], searchWord: 'northwind' }))
    assert.deepEqual(kinds(core), [], JSON.stringify(core.drawer.findings))
    assert.equal(core.drawer.examined.closedByTap, 2)
  } finally {
    await srv.close()
  }
})

test('M6-18: a close button the panel covers, a drawer that keeps aria-expanded, one that drops focus, or a required drawer that is not there each fail, per mode', async () => {
  const srv = await drawerServer()
  try {
    const run = (route, drawer = PORT_DRAWER) => withBrowser((b) => functionalApi.runFunctional(b, { site: srv.origin, routes: [route], searchWord: 'northwind', drawer: need(functionalApi, 'drawerConfig')(drawer), darkHook: 'attr:data-theme=dark' }))
    const covered = await run('/covered/')
    assert.deepEqual(kinds(covered), ['drawer-close-covered@dark', 'drawer-close-covered@light', 'drawer-close-failed@dark', 'drawer-close-failed@light'], JSON.stringify(covered.drawer?.findings))
    assert.match(covered.drawer.findings.find((f) => f.kind === 'drawer-close-covered').hit, /nav#menu/)
    assert.equal(covered.ok, false)
    assert.deepEqual(kinds(await run('/noaria/')), ['drawer-aria-expanded@dark', 'drawer-aria-expanded@light'])
    assert.deepEqual(kinds(await run('/nofocus/')), ['drawer-focus@dark', 'drawer-focus@light'])
    assert.deepEqual(kinds(await run('/none/')), ['drawer-missing@dark', 'drawer-missing@light'])
    assert.deepEqual(kinds(await run('/none/', { drawer: 'core' })), ['drawer-missing@dark', 'drawer-missing@light'])
    // a port selector that names two panels is not guessed at
    assert.deepEqual(kinds(await run('/good/', { ...PORT_DRAWER, panel: 'nav, main' })), ['drawer-ambiguous@dark', 'drawer-ambiguous@light'])
    // not asked for, no drawer: recorded, not failed
    const auto = await withBrowser((b) => functionalApi.runFunctional(b, { site: srv.origin, routes: ['/none/'], searchWord: 'northwind' }))
    assert.deepEqual(kinds(auto), [])
    assert.equal(auto.drawer.examined.drawers, 0)
    // a half-given selector set is refused
    assert.throws(() => functionalApi.drawerConfig({ open: '#open' }), /go together/)
    // the CLI exits 1 on the covered close button, with the finding in the report
    const out = join(tmp('i41-fn-'), 'functional.json')
    // (spawned asynchronously: the fixture server answers from this process's event loop)
    const cli = await runNode([join(pkg, 'scripts', 'review', 'functional.mjs'), srv.origin, '--routes', '/covered/', '--search-word', 'northwind', '--drawer-open', '#open', '--drawer-panel', '#menu', '--drawer-close', '#close', '--dark-hook', 'attr:data-theme=dark', '--out', out])
    assert.equal(cli.status, 1, cli.stderr)
    assert.ok(readJson(out).drawer.findings.some((f) => f.kind === 'drawer-close-covered' && f.mode === 'light'), JSON.stringify(readJson(out).drawer.findings))
    const half = await runNode([join(pkg, 'scripts', 'review', 'functional.mjs'), srv.origin, '--routes', '/good/', '--drawer-open', '#open', '--out', out])
    assert.equal(half.status, 2, half.stderr)
  } finally {
    await srv.close()
  }
})

// ── M6-19: an article page's slug ────────────────────────────────────────────────────

/** joomla-min with the JA Vega services rows (fixtures/issue41/ja-vega.json `slugs`); `reverse` flips every table's row order and the routes. */
function slugFixture({ reverse = false, edit = null } = {}) {
  const dir = tmp('i41-slug-')
  cpSync(JOOMLA_MIN, dir, { recursive: true })
  const inv = readJson(join(dir, 'inventory.json'))
  const S = structuredClone(JA_VEGA.slugs)
  inv.categories.push(...S.categories)
  inv.content.push(...S.content)
  inv.menu.push(...S.menu)
  // the About page links to the cloud page through its menu item, as Joomla writes a link
  inv.content.find((c) => c.id === '45').introtext += S.link
  let routes = [...readJson(join(dir, 'render-routes.json')), ...S.routes]
  if (edit) routes = edit(inv, routes)
  if (reverse) {
    for (const t of ['categories', 'content', 'menu']) inv[t].reverse()
    routes = routes.reverse()
  }
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  const out = join(tmp('i41-fj-'), 'pack')
  buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  const read = (f) => readJson(join(out, f))
  return { out, pageMap: read('page-map.json'), content: read('content.json'), redirects: read('redirects.json'), menus: read('menus.json'), provenance: read('provenance.json') }
}

test('M6-19: an article page whose menu alias is the article alias with Joomla\'s -2 takes the article alias; its child route, links, menu and redirects follow', () => {
  const r = slugFixture()
  const byMenu = (id) => r.pageMap.pages.find((p) => p.source?.menuId === id)
  const cloud = byMenu('148')
  assert.equal(cloud?.path, '/services/cloud-services', JSON.stringify(cloud))
  assert.equal(cloud.source.joomlaPath, '/services/cloud-services-2', 'the source address is kept as the source')
  const page = r.content.pages.find((p) => p.joomla?.articleId === '77')
  assert.deepEqual([page.slug, page.path, page.parent], ['cloud-services', '/services/cloud-services', '/services'])
  // the route below it moves with it
  assert.equal(byMenu('150').path, '/services/cloud-services/faq')
  assert.equal(r.content.pages.find((p) => p.joomla?.articleId === '78').parent, '/services/cloud-services')
  // the old addresses redirect to the new ones, once each, never onto themselves
  const rule = (from) => r.redirects.rules.filter((x) => x.from === from)
  assert.deepEqual(rule('/services/cloud-services-2').map((x) => [x.to, x.status]), [['/services/cloud-services', 301]])
  assert.match(rule('/services/cloud-services-2')[0].reason, /article #77's alias "cloud-services"/)
  assert.deepEqual(rule('/services/cloud-services-2/faq').map((x) => x.to), ['/services/cloud-services/faq'])
  assert.equal(r.redirects.rules.some((x) => x.from === x.to), false)
  // the menu item and a link in another page point at the new address
  const items = (list) => list.flatMap((i) => [i, ...items(i.children ?? [])])
  assert.equal(items(r.menus.menus.flatMap((m) => m.items)).find((i) => i.id === '148').url, '/services/cloud-services')
  assert.match(r.content.pages.find((p) => p.joomla?.articleId === '45').content, /href="\/services\/cloud-services\/?"/)
  // the category of the same alias is a term, not a page: it takes nothing from the page
  assert.ok(r.content.categories.some((c) => c.wpSlug === 'cloud-services'))
  assert.match(JSON.stringify(r.provenance), /route \/services\/cloud-services-2 \(menu item 148\) → \/services\/cloud-services: page slug from article #77/)
})

test('M6-19: a path a route already holds, two articles asking for one path, or a menu alias the site chose keep the menu alias, and the notes say why; the order of the inventory changes nothing', () => {
  const r = slugFixture()
  const byMenu = (id) => r.pageMap.pages.find((p) => p.source?.menuId === id)?.path
  assert.equal(byMenu('151'), '/services/managed-services-2')
  assert.equal(byMenu('152'), '/services/managed-services')
  assert.equal(byMenu('153'), '/services/app-dev-2')
  assert.equal(byMenu('154'), '/services/app-dev-3')
  assert.equal(byMenu('248'), '/company/about')
  const notes = JSON.stringify(r.provenance)
  assert.match(notes, /menu item 151\) keeps its menu alias \\"managed-services-2\\": \/services\/managed-services is held by menu item 152/)
  assert.match(notes, /menu items 153, 154 all open an article with alias \\"app-dev\\"/)
  assert.match(notes, /menu item 248\) keeps its menu alias \\"about\\": it is not article #45's alias \\"about-us\\" with Joomla's -N suffix/)
  const flipped = slugFixture({ reverse: true })
  const paths = (x) => x.pageMap.pages.map((p) => `${p.source?.menuId} ${p.path}`).sort()
  assert.deepEqual(paths(flipped), paths(r))
  const rules = (x) => x.redirects.rules.map((y) => `${y.from} → ${y.to}`).sort()
  assert.deepEqual(rules(flipped), rules(r))
})

// The FAQ below the cloud page asks for its article's alias too (menu alias faq-2): both move, and
// the child lands under the parent's new path — decided on the final paths, in either order.
const faq2 = (inv, routes) => {
  const m = inv.menu.find((x) => x.id === '150')
  Object.assign(m, { alias: 'faq-2', path: 'services/cloud-services-2/faq-2' })
  return routes.map((r) => (r.id === '150' ? { ...r, path: '/services/cloud-services-2/faq-2' } : r))
}
test('M6-19: a page and the page below it that both take their article alias move together, in any order; a sibling that holds the child\'s path keeps it where it is', () => {
  for (const reverse of [false, true]) {
    const r = slugFixture({ reverse, edit: faq2 })
    const byMenu = (id) => r.pageMap.pages.find((p) => p.source?.menuId === id)?.path
    assert.equal(byMenu('148'), '/services/cloud-services', `reverse ${reverse}`)
    assert.equal(byMenu('150'), '/services/cloud-services/faq', `reverse ${reverse}`)
    assert.equal(r.content.pages.find((p) => p.joomla?.articleId === '78').parent, '/services/cloud-services')
    const to = (from) => r.redirects.rules.filter((x) => x.from === from).map((x) => x.to)
    assert.deepEqual(to('/services/cloud-services-2'), ['/services/cloud-services'])
    assert.deepEqual(to('/services/cloud-services-2/faq-2'), ['/services/cloud-services/faq'])
    // no rule lands on an address no route has
    const paths = new Set(r.pageMap.pages.map((p) => p.path))
    for (const x of r.redirects.rules.filter((y) => y.from.startsWith('/services/cloud-services'))) assert.ok(paths.has(x.to), `${x.from} → ${x.to}`)
    assert.match(JSON.stringify(r.provenance), /route \/services\/cloud-services-2\/faq-2 \(menu item 150\) → \/services\/cloud-services\/faq: page slug from article #78/)
  }
  // a sibling page at .../faq under the old parent holds the child's path: the child keeps faq-2,
  // the parent still moves and takes both along
  const held = (reverse) =>
    slugFixture({
      reverse,
      edit: (inv, routes) => {
        inv.content.push({ ...inv.content.find((c) => c.id === '78'), id: '83', title: 'Cloud FAQ (current)', ordering: '83' })
        inv.menu.push({ ...inv.menu.find((x) => x.id === '150'), id: '155', title: 'Cloud FAQ (current)', link: 'index.php?option=com_content&view=article&id=83', lft: '252', rgt: '253' })
        return [...faq2(inv, routes), { id: '155', path: '/services/cloud-services-2/faq' }]
      }
    })
  const a = held(false)
  const byMenu = (x, id) => x.pageMap.pages.find((p) => p.source?.menuId === id)?.path
  assert.deepEqual(['148', '150', '155'].map((id) => byMenu(a, id)), ['/services/cloud-services', '/services/cloud-services/faq-2', '/services/cloud-services/faq'])
  assert.match(JSON.stringify(a.provenance), /menu item 150\) → \/services\/cloud-services\/faq-2: keeps its menu alias \\"faq-2\\": \/services\/cloud-services\/faq is held by menu item 155/)
  const b = held(true)
  assert.deepEqual(['148', '150', '155'].map((id) => byMenu(b, id)), ['/services/cloud-services', '/services/cloud-services/faq-2', '/services/cloud-services/faq'])
  const notes = (x) => x.provenance.notes.filter((n) => /menu item 15\d/.test(n)).sort()
  assert.deepEqual(notes(b), notes(a))
})
