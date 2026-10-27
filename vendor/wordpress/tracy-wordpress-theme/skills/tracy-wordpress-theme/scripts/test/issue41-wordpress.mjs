#!/usr/bin/env node
// Real-WordPress proof for #41 (JA Vega M6, part 3): what the fixture tests show, on a WordPress of
// its own — a new compose project (mariadb:11 + wordpress:php8.3-apache + wordpress:cli-php8.3),
// never a live stand. It seeds a small spec twice through the seeder's CLI, renders the listing
// over HTTP and in Chromium, taps the header drawer, and runs the cycle's two prune audits:
//
//   M6-15  posts[].tags reach tags_input: each post carries its tags, in source order by term id;
//          a name holding a comma is one tag; a post declaring [] has none
//   M6-16  a paged Joomla listing draws start · previous · numbers · next · end with the ends
//          disabled and "Page N of M", from its own query, links keeping other query arguments;
//          at 390, 600 and 1024 px, light and dark, nothing overflows and the pager wraps at 390
//   M6-17  on every page with a list: cards → More Articles → pager in the DOM; the last page has
//          no More Articles; each page's cards and titles are the source's offsets
//   M6-18  review/functional.mjs's drawer check taps core/navigation's overlay open and closed in
//          light and dark; on a page where an element covers the close button it fails
//   M6-20  the cycle's prune phase (apply, then the re-audit that must read 0 to decide) passes
//          with the seeder's search-view draft, WordPress's privacy-policy draft and a draft kept
//          by --keep-draft; without that decision the undecided draft stops it; every draft keeps
//          its id and status, and a later seed recreates nothing
//   seed   the second seed writes nothing: posts and pages +0 ~0, the same ids
//
// The stand, its lock and its cleanup are issue37-wordpress.mjs's (takeLock, projectResources,
// strangers, cleanup), so every container and the network carry that harness's run label, and the
// cleanup removes exactly this run's ids. `--out` gets the logs, the seed reports, the functional
// and prune outputs and report.json only. Nothing is skipped: Docker, an image or a browser
// missing, a failed assertion or a failed cleanup is exit 1 with the reason in report.json.
//
// Usage: node scripts/test/issue41-wordpress.mjs --project tracy-issue41-<id> --out <dir>
//          [--timeout <s>] [--keep]
// Exit 0 when every check passed and the stand is gone; 1 otherwise; 2 on a usage error.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createRunner } from '../lib/wp-cli.mjs'
import { takeLock, projectResources, strangers, cleanup } from './issue37-wordpress.mjs'
import { plan as cyclePlan, runCycle } from '../quickstart/cycle.mjs'
import { writeContracts } from './quickstart-contracts.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const THEME = 'i41fixture'
const IMAGES = { db: 'mariadb:11', web: 'wordpress:php8.3-apache', cli: 'wordpress:cli-php8.3' }
const ADMIN = 'i41admin'
/** The label issue37-wordpress.mjs's cleanup and strangers() read: every container and network of one run carries it. */
const RUN_LABEL = 'org.tracy.issue37.run'
const DARK_HOOK = 'attr:data-theme=dark'

function args(argv) {
  const o = { timeout: 1200, keep: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--project') o.project = next()
    else if (a === '--out') o.out = resolve(next())
    else if (a === '--timeout') {
      o.timeout = Number(next())
      if (!Number.isFinite(o.timeout) || o.timeout <= 0) throw new Error('--timeout takes seconds')
    } else if (a === '--keep') o.keep = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (!o.project) throw new Error('--project <name> is required')
  if (!o.out) throw new Error('--out <dir> is required')
  if (!/^tracy-issue41-[a-z0-9][a-z0-9-]*$/.test(o.project)) throw new Error(`--project: "${o.project}" must be tracy-issue41-<lower-case id>`)
  return o
}

function dockerEnv() {
  const env = { ...process.env }
  delete env.DOCKER_HOST
  if (process.env.WP_DOCKER_HOST) env.DOCKER_HOST = process.env.WP_DOCKER_HOST
  return env
}
const describe = (r) => `${r.kind} ${r.id} ${r.names}`

const results = []
const logLines = []
const log = (s) => {
  logLines.push(`[${new Date().toISOString()}] ${s}`)
  console.error(s)
}
const record = (item, name, ok, extra) => {
  results.push({ item, name, ok, ...extra })
  log(`${ok ? 'ok  ' : 'FAIL'} ${item} ${name}${ok ? '' : `: ${String(extra.error).split('\n')[0]}`}`)
}
async function check(item, name, fn) {
  try {
    const measured = await fn()
    record(item, name, true, measured === undefined ? {} : { measured })
  } catch (e) {
    record(item, name, false, { error: String(e.message ?? e).slice(0, 3000) })
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const same = (a, b, msg) => expect(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)

async function main() {
  let o
  try {
    o = args(process.argv.slice(2))
  } catch (e) {
    console.error(`issue41-wordpress: ${e.message}`)
    return 2
  }
  const deadline = Date.now() + o.timeout * 1000
  const env = dockerEnv()
  if (existsSync(o.out) && (lstatSync(o.out).isSymbolicLink() || !lstatSync(o.out).isDirectory())) {
    console.error(`issue41-wordpress: --out ${o.out} exists and is not a directory`)
    return 2
  }
  mkdirSync(o.out, { recursive: true })
  const runId = `${process.pid}-${randomBytes(6).toString('hex')}`
  const report = { project: o.project, run: runId, started: new Date().toISOString(), results, stand: null, cleanup: null, lock: null, error: null }
  const finish = (code) => {
    report.finished = new Date().toISOString()
    report.passed = results.filter((r) => r.ok).length
    report.failed = results.filter((r) => !r.ok).length
    writeFileSync(join(o.out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    writeFileSync(join(o.out, 'harness.log'), logLines.join('\n') + '\n')
    return code
  }
  let lock
  try {
    lock = takeLock(o.project, runId)
  } catch (e) {
    report.error = e.message
    return finish(1)
  }
  report.lock = { path: lock.path, released: false }
  let code = 1
  try {
    code = await held({ o, runId, env, deadline, report })
  } catch (e) {
    report.error = String(e.stack ?? e).slice(0, 4000)
    log(`harness error: ${e.message}`)
    code = 1
  } finally {
    try {
      lock.release()
      report.lock.released = true
    } catch (e) {
      report.lock.error = e.message
      log(`lock: ${e.message}`)
      code = 1
    }
  }
  return finish(code)
}

/** Preflight, stand, proof, cleanup — while the project's lock is held. Returns the exit code. */
async function held({ o, runId, env, deadline, report }) {
  const remaining = () => Math.max(1000, deadline - Date.now())
  const docker = (argv, { allowFail = false, input, timeout } = {}) => {
    if (Date.now() > deadline) throw new Error(`timed out after ${o.timeout} s (at docker ${argv.slice(0, 3).join(' ')})`)
    const r = spawnSync('docker', argv, { env, encoding: 'utf8', input, maxBuffer: 64 << 20, timeout: Math.min(timeout ?? Infinity, remaining()) })
    if (r.error) throw new Error(`docker ${argv.slice(0, 3).join(' ')}: ${r.error.message}`)
    if (r.status !== 0 && !allowFail) throw new Error(`docker ${argv.slice(0, 4).join(' ')} failed (${r.status}): ${(r.stderr || r.stdout).trim().slice(0, 1500)}`)
    return r
  }
  try {
    docker(['info', '--format', '{{.ServerVersion}}'], { timeout: 30000 })
  } catch (e) {
    report.error = `Docker is not available: ${e.message}`
    return 1
  }
  const missing = Object.values(IMAGES).filter((img) => docker(['image', 'inspect', img], { allowFail: true }).status !== 0)
  if (missing.length) {
    report.error = `image(s) not on this machine: ${missing.join(', ')} — docker pull them first; this proof does not pull`
    return 1
  }
  const df = spawnSync('df', ['-k', tmpdir()], { encoding: 'utf8' })
  const freeKb = Number(String(df.stdout).trim().split('\n').pop()?.split(/\s+/)[3])
  if (!(freeKb > 2 * 1024 * 1024)) {
    report.error = `less than 2 GB free under ${tmpdir()} (${Number.isFinite(freeKb) ? Math.round(freeKb / 1024) : '?'} MB): no stand`
    return 1
  }
  let present
  try {
    present = projectResources(o.project, (argv) => docker(argv, { allowFail: true }))
  } catch (e) {
    report.error = `cannot list the project's resources: ${e.message}`
    return 1
  }
  if (present.length) {
    report.error = `project ${o.project} already has ${present.map(describe).join('; ')}; refusing to adopt or remove them — bring them down first`
    return 1
  }
  const stand = mkdtempSync(join(tmpdir(), 'i41-wp-'))
  report.stand = stand
  const compose = join(stand, 'compose.yml')
  const dc = (argv, opts) => docker(['compose', '--progress', 'quiet', '-f', compose, '-p', o.project, ...argv], opts)
  const runnerSpec = `docker compose --progress quiet -f ${compose} -p ${o.project} run --rm -T cli`
  let wp = null
  let code = 1
  try {
    code = await prove({ o, runId, stand, compose, dc, docker, runnerSpec, deadline, report, setWp: (w) => (wp = w) })
  } catch (e) {
    report.error = String(e.stack ?? e).slice(0, 4000)
    log(`harness error: ${e.message}`)
    code = 1
  } finally {
    try {
      wp?.dispose()
    } catch {}
    report.cleanup = cleanup({ o, runId, stand })
    if (!report.cleanup.ok) code = 1
    if (o.keep) code = 1
  }
  if (results.some((r) => !r.ok) || !results.length) code = 1
  return code
}

// ── the stand ─────────────────────────────────────────────────────────────────────

// The webroot is `capture/`: the cycle's prune phase reads `<stand>/capture` as the stand's webroot.
const COMPOSE = (dbPassword, runId) => `services:
  db:
    image: ${IMAGES.db}
    labels:
      ${RUN_LABEL}: "${runId}"
    environment:
      MARIADB_ROOT_PASSWORD: ${dbPassword}
      MARIADB_DATABASE: wp
      MARIADB_USER: wp
      MARIADB_PASSWORD: ${dbPassword}
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 2s
      timeout: 5s
      retries: 90
  web:
    image: ${IMAGES.web}
    labels:
      ${RUN_LABEL}: "${runId}"
    depends_on:
      db:
        condition: service_healthy
    environment: &wpenv
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: ${dbPassword}
      WORDPRESS_DB_NAME: wp
    ports:
      - "127.0.0.1::80"
    volumes:
      - ./capture:/var/www/html
      - ./images:/src-images
  cli:
    image: ${IMAGES.cli}
    labels:
      ${RUN_LABEL}: "${runId}"
    user: "33:33"
    depends_on:
      - db
    environment: *wpenv
    volumes:
      - ./capture:/var/www/html
      - ./images:/src-images:ro
networks:
  default:
    labels:
      ${RUN_LABEL}: "${runId}"
`

const block = (name, attrs, inner = null) => {
  const a = attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : ''
  return inner === null ? `<!-- wp:${name}${a} /-->` : `<!-- wp:${name}${a} -->${inner}<!-- /wp:${name} -->`
}
const para = (text) => block('paragraph', null, `<p>${text}</p>`)

// A block theme: a header with core/navigation (its overlay below 600 px), the cards pattern the
// seeder reads, and a palette restated under html[data-theme="dark"] as the theme kit does. The
// `.i41-cover` rule lets a page put a box over the overlay's close button (the JA Vega fault).
const HEADER = `${block('group', { tagName: 'header', className: 'i41-header' }, `<header class="wp-block-group i41-header">${block('site-title', null)}${block('navigation', { overlayMenu: 'mobile' }, `${block('navigation-link', { label: 'Home', url: '/' })}${block('navigation-link', { label: 'News', url: '/news/' })}`)}</header>`)}\n`
const THEME_JSON = {
  version: 3,
  settings: { color: { palette: [{ slug: 'base', name: 'Base', color: '#ffffff' }, { slug: 'contrast', name: 'Contrast', color: '#141414' }, { slug: 'primary', name: 'Primary', color: '#1d4ed8' }] }, layout: { contentSize: '720px' } },
  styles: {
    color: { background: 'var(--wp--preset--color--base)', text: 'var(--wp--preset--color--contrast)' },
    css: 'html[data-theme="dark"]{--wp--preset--color--base:#101418;--wp--preset--color--contrast:#e8eaed;--wp--preset--color--primary:#93b4ff}body{margin:0;padding:0 12px}.i41-cover{position:fixed;top:0;right:0;width:120px;height:120px;z-index:100001;margin:0}'
  }
}
const THEME_FILES = {
  'style.css': `/*\nTheme Name: I41 Fixture\nDescription: Scratch theme of the #41 WordPress proof.\nVersion: 1.0.0\nRequires at least: 6.6\n*/\n`,
  'theme.json': JSON.stringify(THEME_JSON),
  'parts/header.html': HEADER,
  'templates/index.html': `${block('template-part', { slug: 'header', tagName: 'div' })}\n${block('query', { queryId: 0, query: { inherit: true } }, `<div class="wp-block-query">${block('post-template', null, block('post-title', { isLink: true }))}</div>`)}\n`,
  'templates/page.html': `${block('template-part', { slug: 'header', tagName: 'div' })}\n${block('post-title', { level: 1 })}\n${block('post-content', null)}\n`,
  'templates/single.html': `${block('template-part', { slug: 'header', tagName: 'div' })}\n${block('post-title', { level: 1 })}\n${block('post-content', null)}\n`,
  'patterns/cards.php': `<?php\n/**\n * Title: Cards\n * Slug: tracy/cards\n * Inserter: no\n */\n?>\n<!-- wp:query {"queryId":1,"query":{"perPage":6,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query"><!-- wp:post-template -->\n<!-- wp:post-title {"isLink":true,"className":"i41-card"} /-->\n<!-- /wp:post-template --></div>\n<!-- /wp:query -->\n`
}

// ── the spec ──────────────────────────────────────────────────────────────────────

// Ten posts, newest first p01 … p10, in a Joomla category blog of 1 leading + 2 intro a page and 2
// link-only titles; their tags are JA Vega's (m6/ingest/tags.json), p03 declares none, p04 one name
// holding a comma.
const N = 10
const slugOf = (n) => `i41-post-${String(n).padStart(2, '0')}`
const TAGS = {
  1: ['business', 'technology', 'services'],
  2: ['business', 'technology', 'services', 'marketing', 'security', 'app'],
  3: [],
  4: ['Research, Development', 'business']
}
function specOf() {
  const posts = Array.from({ length: N }, (_, i) => {
    const n = i + 1
    return {
      title: `Post ${String(n).padStart(2, '0')}`,
      slug: slugOf(n),
      path: `/news/${slugOf(n)}`,
      date: `2026-01-${String(30 - n).padStart(2, '0')} 10:00:00`,
      category: 'news',
      ...(TAGS[n] ? { tags: TAGS[n] } : { tags: ['business'] }),
      joomla: { articleId: String(n) },
      content: para(`The body of post ${n}.`),
      images: []
    }
  })
  const home = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: para('I41 home.'), meta: {}, images: [] }
  const covered = { file: 'covered.html', path: '/covered', slug: 'covered', title: 'Covered', view: 'page', parent: null, status: 'publish', content: [para('A box sits over the drawer close button.'), block('group', { className: 'i41-cover' }, '<div class="wp-block-group i41-cover"></div>')].join('\n'), meta: {}, images: [] }
  const news = { file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 3, paging: { leading: 1, intro: 2, links: 2, from: { leading: 'menu', intro: 'menu', links: 'menu' } }, moreArticles: { heading: 'More Articles …' } }
  const search = { file: 'smart-search.html', path: '/smart-search', title: 'Smart Search', view: 'search' }
  const pagemap = [
    { file: 'index.html', path: '/', title: 'Home', view: 'front-page' },
    { file: 'covered.html', path: '/covered', title: 'Covered', view: 'page' },
    { file: 'news.html', path: '/news', title: 'News', view: 'category' },
    { file: 'smart-search.html', path: '/smart-search', title: 'Smart Search', view: 'search' }
  ]
  return {
    'page-map.json': { pages: pagemap },
    'content.json': { site: { name: 'I41' }, pages: [home, covered], posts, categories: [{ id: '15', title: 'News', wpSlug: 'news', description: '' }], archives: [news, search], authors: [], images: [] },
    'sections.json': { acm: [], custom: [], other: [] },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': { types: {} }
  }
}

// ── the proof ─────────────────────────────────────────────────────────────────────

async function prove({ o, runId, stand, compose, dc, docker, runnerSpec, deadline, report, setWp }) {
  const password = randomBytes(12).toString('hex')
  mkdirSync(join(stand, 'capture'), { recursive: true })
  mkdirSync(join(stand, 'images'), { recursive: true })
  writeFileSync(compose, COMPOSE(password, runId))
  log(`stand ${stand}, project ${o.project}`)
  dc(['up', '-d', '--wait', 'db', 'web'])
  const port = dc(['port', 'web', '80']).stdout.trim().split(':').pop()
  expect(/^\d+$/.test(port), `no port for web: ${port}`)
  const url = `http://127.0.0.1:${port}`
  report.url = url
  const until = Date.now() + 180000
  while (!existsSync(join(stand, 'capture', 'wp-config.php')) || !existsSync(join(stand, 'capture', 'wp-includes', 'version.php'))) {
    expect(Date.now() < until && Date.now() < deadline, 'WordPress files never appeared in the webroot')
    spawnSync('sleep', ['1'])
  }
  const wp = createRunner(`${runnerSpec} wp`, { deadline, keep: false })
  setWp(wp)
  wp.run(['core', 'install', `--url=${url}`, '--title=I41', `--admin_user=${ADMIN}`, `--admin_password=${password}`, '--admin_email=i41@example.invalid', '--skip-email'])
  wp.run(['rewrite', 'structure', '/%postname%/'])
  const themeDir = join(stand, 'capture', 'wp-content', 'themes', THEME)
  for (const [rel, text] of Object.entries(THEME_FILES)) {
    mkdirSync(dirname(join(themeDir, rel)), { recursive: true })
    writeFileSync(join(themeDir, rel), text)
  }
  wp.run(['theme', 'activate', THEME])
  wp.run(['rewrite', 'flush'])
  report.wordpress = wp.out(['core', 'version'], { mutate: false })

  const specDir = join(stand, 'spec')
  mkdirSync(specDir, { recursive: true })
  for (const [f, v] of Object.entries(specOf())) writeFileSync(join(specDir, f), JSON.stringify(v, null, 1))
  const seed = (name) => {
    const others = strangers(o.project, runId, (argv) => docker(argv, { allowFail: true }))
    if (others.length) throw new Error(`the project has what this run did not make: ${others.map(describe).join('; ')}`)
    const reportFile = join(o.out, `seed-${name}.json`)
    const seconds = Math.max(60, Math.floor((deadline - Date.now()) / 1000) - 60)
    const r = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'seed.mjs'), '--spec', specDir, '--wp', runnerSpec, '--theme', THEME, '--patterns-map', join(specDir, 'patterns.map.json'), '--images', '/src-images', '--images-local', join(stand, 'images'), '--base-url', url, '--report', reportFile, '--out', join(stand, 'seed-out'), '--timeout', String(seconds)],
      { cwd: pkg, encoding: 'utf8', env: { ...dockerEnv() }, maxBuffer: 64 << 20, timeout: seconds * 1000 + 30000 }
    )
    writeFileSync(join(o.out, `seed-${name}.log`), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`)
    log(`seed ${name}: exit ${r.status}`)
    return { code: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '', report: existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null }
  }
  const stamps = () =>
    JSON.parse(wp.phpEval(`echo json_encode(array_map(function($p){return array($p->ID,$p->post_type,$p->post_name,$p->post_status,$p->post_modified_gmt,md5($p->post_content));},get_posts(array('post_type'=>array('page','post'),'post_status'=>'any','numberposts'=>-1,'orderby'=>'ID','order'=>'ASC'))));`))
  const idOf = (name, type = 'page') => Number(wp.out(['post', 'list', `--post_type=${type}`, '--post_status=any', `--name=${name}`, '--field=ID'], { mutate: false }).trim())
  const get = (path, save = null) => {
    const r = spawnSync('curl', ['-sS', '--max-time', '30', '-o', '-', '-w', '\n%{http_code}', `${url}${path}`], { encoding: 'utf8', maxBuffer: 32 << 20 })
    if (r.status !== 0) throw new Error(`curl ${path}: ${r.stderr.trim()}`)
    const i = r.stdout.lastIndexOf('\n')
    const out = { status: Number(r.stdout.slice(i + 1)), body: r.stdout.slice(0, i) }
    if (save) writeFileSync(join(o.out, save), out.body)
    return out
  }

  const s1 = seed('first')
  await check('seed', 'the first seed exits 0 and installs the pager and More Articles plugins', () => {
    expect(s1.code === 0, `exit ${s1.code}: ${s1.stderr.slice(-1500)}`)
    same(s1.report?.joomlaPager?.plugin?.action, 'written', 'joomla pagination plugin')
    same(s1.report?.moreArticles?.plugin?.action, 'written', 'more articles plugin')
    return { posts: s1.report.counts.posts, pages: s1.report.counts.pages }
  })
  // get_page_by_path reads the draft too (a `post list --name` query answered nothing for it)
  const searchId = Number(wp.phpEval(`$p=get_page_by_path('smart-search',OBJECT,'page');echo $p?$p->ID:0;`).trim())
  const privacyId = Number(wp.out(['option', 'get', 'wp_page_for_privacy_policy'], { mutate: false }).trim())

  // M6-15: the tags as WordPress stores them.
  const tagsOf = (slug) => JSON.parse(wp.phpEval(`$p=get_page_by_path('${slug}',OBJECT,'post');$t=wp_get_post_tags($p->ID,array('orderby'=>'term_id','order'=>'ASC'));echo json_encode(array_map(function($x){return $x->name;},$t));`))
  await check('M6-15', 'each post carries its spec tags in tags_input, in source order by term id; [] is none; a name with a comma is one tag', () => {
    same(tagsOf(slugOf(1)), TAGS[1], `${slugOf(1)} tags`)
    same(tagsOf(slugOf(2)), TAGS[2], `${slugOf(2)} tags`)
    same(tagsOf(slugOf(3)), [], `${slugOf(3)} tags`)
    same(tagsOf(slugOf(4)).sort(), [...TAGS[4]].sort(), `${slugOf(4)} tags`)
    return Object.fromEntries([1, 2, 3, 4].map((n) => [slugOf(n), tagsOf(slugOf(n))]))
  })

  // M6-16 / M6-17 over HTTP: every page of the listing.
  const newsId = idOf('news')
  const cardsId = Number(/"queryId":(\d+)[^}]*"perPage":3/.exec(wp.out(['post', 'get', String(newsId), '--field=post_content'], { mutate: false }))?.[1])
  const decode = (s) => s.replace(/&#8230;/g, '…').replace(/&laquo;/g, '«').replace(/&lsaquo;/g, '‹').replace(/&rsaquo;/g, '›').replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/&#0?38;/g, '&')
  const listing = (page, extra = '') => {
    const q = [page === 1 ? null : `query-${cardsId}-page=${page}`, extra || null].filter(Boolean).join('&')
    const path = `/news/${q ? `?${q}` : ''}`
    const r = get(path, `news-${page}.html`)
    same(r.status, 200, `GET ${path}`)
    const body = r.body
    const at = { more: body.indexOf('tracy-more-articles'), pager: body.indexOf('<nav class="wp-block-query-pagination tracy-pager') }
    const titles = (html) => [...html.matchAll(/wp-block-post-title[^>]*>\s*<a [^>]*>([^<]+)<\/a>/g)].map((m) => Number(/Post (\d+)/.exec(decode(m[1]))?.[1]))
    const mainEnd = at.pager === -1 ? body.length : at.pager
    const pager = at.pager === -1 ? null : body.slice(at.pager, body.indexOf('</nav>', at.pager) + 6)
    const items = pager ? [...pager.matchAll(/<li class="tracy-pager__item( is-[a-z]+)?">(<a [^>]*href="([^"]*)"[^>]*>|<span [^>]*>)([^<]*)</g)].map((m) => ({ state: (m[1] ?? '').trim() || 'link', href: m[3] ? decode(m[3]) : null, text: decode(m[4]) })) : []
    return {
      cards: titles(body.slice(0, at.more === -1 ? mainEnd : at.more)),
      more: at.more === -1 ? null : titles(body.slice(at.more, mainEnd)),
      order: at.more === -1 ? 'no-more' : at.more < at.pager ? 'more-before-pager' : 'pager-before-more',
      counter: pager ? /<p class="tracy-pager__counter">([^<]*)<\/p>/.exec(pager)?.[1] : null,
      items,
      corePager: /wp-block-query-pagination-numbers/.test(body)
    }
  }
  const want = [
    { cards: [1, 2, 3], more: [4, 5] },
    { cards: [4, 5, 6], more: [7, 8] },
    { cards: [7, 8, 9], more: [10] },
    { cards: [10], more: null }
  ]
  for (const [i, w] of want.entries())
    await check('M6-17', `page ${i + 1} of 4: cards ${w.cards.join(',')} → More Articles ${w.more ? w.more.join(',') : 'none'} → pager`, () => {
      const got = listing(i + 1)
      same(got.cards, w.cards, 'cards')
      same(got.more, w.more, 'More Articles titles')
      same(got.order, w.more ? 'more-before-pager' : 'no-more', 'DOM order')
      return got
    })
  await check('M6-16', 'the pager: start and previous disabled on page 1, next and end disabled on page 4, the numbers, "Page N of M", no core numbers', () => {
    const p1 = listing(1)
    const p4 = listing(4)
    const p2 = listing(2, 'utm=x')
    same(p1.items.map((x) => [x.state, x.text]), [['is-disabled', '«'], ['is-disabled', '‹'], ['is-current', '1'], ['link', '2'], ['link', '3'], ['link', '4'], ['link', '›'], ['link', '»']], 'page 1')
    same(p4.items.map((x) => x.state), ['link', 'link', 'link', 'link', 'link', 'is-current', 'is-disabled', 'is-disabled'], 'page 4')
    same([p1.counter, p4.counter], ['Page 1 of 4', 'Page 4 of 4'], 'counters')
    expect(!p1.corePager, 'core numbers still printed')
    // the links name the cards query's page and keep the request's other arguments
    const next = p2.items.find((x) => x.text === '›').href
    expect(new URL(next, url).searchParams.get(`query-${cardsId}-page`) === '3' && new URL(next, url).searchParams.get('utm') === 'x', `next link ${next}`)
    const start = new URL(p2.items[0].href, url)
    expect(!start.searchParams.has(`query-${cardsId}-page`) && start.searchParams.get('utm') === 'x', `start link ${start}`)
    // a page past the end is the last page; junk is page 1
    same(listing(9).counter, 'Page 4 of 4', 'page 9')
    same(get(`/news/?query-${cardsId}-page=abc`).body.match(/tracy-pager__counter">([^<]*)</)?.[1], 'Page 1 of 4', 'page abc')
    return { p1: p1.items, p4: p4.items, next }
  })

  // Browser: the pager's layout at three widths in light and dark; the drawer.
  const { chromium } = await import('playwright')
  const { darkInitScript } = await import('../lib/browser.mjs')
  const functional = await import('../review/functional.mjs')
  const browser = await chromium.launch()
  try {
    const layouts = {}
    for (const width of [390, 600, 1024])
      for (const mode of ['light', 'dark'])
        await check('M6-16', `/news/ at ${width} px, ${mode}: no horizontal overflow; the pager wraps where the line is full`, async () => {
          const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode })
          try {
            if (mode === 'dark') await ctx.addInitScript(darkInitScript(DARK_HOOK))
            const page = await ctx.newPage()
            await page.goto(`${url}/news/?query-${cardsId}-page=2`, { waitUntil: 'load' })
            const m = await page.evaluate(() => {
              const nav = document.querySelector('nav.tracy-pager')
              const list = nav.querySelector('.tracy-pager__list')
              const counter = nav.querySelector('.tracy-pager__counter')
              const r = (el) => el.getBoundingClientRect()
              return {
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth,
                navRight: r(nav).right,
                listRows: new Set([...list.children].map((li) => Math.round(r(li).top))).size,
                counterBelow: r(counter).top >= r(list).bottom - 1,
                current: getComputedStyle(nav.querySelector('.is-current .tracy-pager__link')).backgroundColor,
                dark: document.documentElement.getAttribute('data-theme')
              }
            })
            expect(m.scrollWidth <= m.innerWidth, `the page is ${m.scrollWidth} px wide in a ${m.innerWidth} px viewport`)
            expect(m.navRight <= m.innerWidth, `the pager ends at ${m.navRight} px`)
            if (width === 390) expect(m.counterBelow, 'at 390 px "Page N of M" did not go under the numbers')
            if (width === 1024) expect(!m.counterBelow && m.listRows === 1, `at 1024 px the pager wrapped (${JSON.stringify(m)})`)
            same(m.dark, mode === 'dark' ? 'dark' : null, 'data-theme')
            await page.screenshot({ path: join(o.out, `pager-${width}-${mode}.png`), fullPage: false })
            layouts[`${width}-${mode}`] = m
            return m
          } finally {
            await ctx.close()
          }
        })
    await check('M6-16', 'the current page takes the palette: its colour changes with dark', () => {
      for (const w of [390, 600, 1024]) expect(layouts[`${w}-light`] && layouts[`${w}-dark`] && layouts[`${w}-light`].current !== layouts[`${w}-dark`].current, `${w}: ${JSON.stringify([layouts[`${w}-light`]?.current, layouts[`${w}-dark`]?.current])}`)
    })

    // M6-18: core/navigation's overlay, tapped open and closed; the covered close button fails.
    const cfg = functional.drawerConfig({ drawer: 'core' })
    const good = await functional.runDrawer(browser, { site: url, routes: ['/'], cfg, darkHook: DARK_HOOK, timeoutMs: 30000 })
    writeFileSync(join(o.out, 'drawer-good.json'), JSON.stringify(good, null, 2))
    await check('M6-18', 'the header drawer opens and closes by a tap in light and dark, focus back on the open button', () => {
      same(good.findings, [], 'findings')
      same(good.examined.modes, ['light', 'dark'], 'modes tapped')
      same([good.examined.taps, good.examined.closedByTap], [4, 2], 'taps, closed by a tap')
      return good.examined
    })
    const covered = await functional.runDrawer(browser, { site: url, routes: ['/covered/'], cfg, darkHook: DARK_HOOK, timeoutMs: 30000 })
    writeFileSync(join(o.out, 'drawer-covered.json'), JSON.stringify(covered, null, 2))
    // On core's overlay the tap on the box moves focus out of the dialog, which core answers by
    // closing it — without focus going back to the open button. Either way the pass fails.
    await check('M6-18', 'a box drawn over the close button is found at its centre in both modes, and the tap there does not close the drawer as the button does', () => {
      const kinds = covered.findings.map((f) => `${f.kind}@${f.mode}`).sort()
      for (const mode of ['light', 'dark']) {
        expect(kinds.includes(`drawer-close-covered@${mode}`), `no drawer-close-covered in ${mode}: ${kinds.join(', ')}`)
        expect(kinds.some((k) => k === `drawer-close-failed@${mode}` || k === `drawer-focus@${mode}`), `the ${mode} tap on the box passed as a close: ${kinds.join(', ')}`)
      }
      expect(covered.findings.every((f) => f.kind !== 'drawer-close-covered' || /i41-cover/.test(f.hit)), `hit: ${JSON.stringify(covered.findings)}`)
      return kinds
    })
    // the CLI on the covered page exits 1
    const fnOut = join(o.out, 'functional-covered.json')
    const cli = spawnSync(process.execPath, [join(pkg, 'scripts', 'review', 'functional.mjs'), url, '--routes', '/covered/', '--drawer', 'core', '--dark-hook', DARK_HOOK, '--search-word', 'covered', '--out', fnOut], { encoding: 'utf8', timeout: 240000 })
    await check('M6-18', 'review/functional.mjs --drawer core exits 1 on the covered page', () => {
      same(cli.status, 1, `exit (${cli.stderr.slice(-500)})`)
      expect(JSON.parse(readFileSync(fnOut, 'utf8')).drawer.findings.some((f) => f.kind === 'drawer-close-covered'), 'no drawer-close-covered in the report')
    })
  } finally {
    await browser.close()
  }

  // Second seed: nothing changes.
  const before = stamps()
  const s2 = seed('second')
  await check('seed', 'a second seed writes nothing: posts and pages +0 ~0, the same ids and contents, the plugins the same', () => {
    expect(s2.code === 0, `exit ${s2.code}: ${s2.stderr.slice(-1500)}`)
    for (const k of ['posts', 'pages']) same([s2.report?.counts?.[k]?.created, s2.report?.counts?.[k]?.updated], [0, 0], `${k} created/updated`)
    same(stamps(), before, 'posts and pages')
    same(s2.report.joomlaPager.plugin.action, 'same', 'joomla pagination plugin')
  })

  // M6-20: the cycle's prune phase on this stand. An extra draft nobody decided on first.
  const extra = Number(wp.out(['post', 'create', '--post_type=page', '--post_status=draft', '--post_title=Undecided', '--post_name=undecided', '--porcelain']).trim())
  const drafts = () => wp.json(['post', 'list', '--post_type=page', '--post_status=draft', '--fields=ID,post_name,post_status', '--orderby=ID', '--order=asc'])
  const draftsBefore = drafts()
  const o20 = { stand, id: 'i41/wp7', version: '0.0.1', siteA: url, siteB: 'http://unused.invalid', wpA: runnerSpec, wpB: 'unused', rootB: 'unused', routes: join(specDir, 'page-map.json'), admin: ADMIN, darkHook: DARK_HOOK, dbHost: 'db', dbPasswordEnv: 'X', runRoot: join(stand, 'dossier'), spec: specDir }
  // The cycle's freshness gate reads the run-root's canonical contracts against the spec-pack.
  mkdirSync(o20.runRoot, { recursive: true })
  writeContracts({ runRoot: o20.runRoot, specDir })
  const prunePhase = async (name, o) => {
    // cycle.log is appended to: each phase run starts from an empty pack directory and log, so its log is its own
    rmSync(join(stand, 'pack'), { recursive: true, force: true })
    rmSync(join(stand, 'cycle.log'), { force: true })
    const steps = cyclePlan(o)
    let error = null
    try {
      await runCycle(o, { planOverride: { ...steps, pack: [], restore: [], verify: [], release: [] }, timeout: Math.max(120, Math.floor((deadline - Date.now()) / 1000) - 120) })
    } catch (e) {
      error = e.message
    }
    const logFile = join(stand, 'cycle.log')
    const text = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
    writeFileSync(join(o.out, `prune-${name}.log`), text)
    return { error, log: text }
  }
  o20.out = o.out
  const undecided = await prunePhase('undecided', o20)
  await check('M6-20', 'with a draft nobody decided on, the prune phase stops at the re-audit', () => {
    expect(/prune failed/.test(String(undecided.error)), `the phase did not fail: ${undecided.error}`)
    expect(new RegExp(`UNKNOWN +page:draft +#${extra} Undecided`).test(undecided.log), 'the undecided draft is not listed')
    expect(/1 to decide/.test(undecided.log), 'the re-audit does not read 1 to decide')
  })
  const decided = await prunePhase('decided', { ...o20, keepDraft: [String(extra)] })
  await check('M6-20', 'with --keep-draft for it, the prune phase passes: the search-view draft, the privacy policy draft and the decided draft are kept', () => {
    expect(decided.error === null, `the phase failed: ${decided.error}\n${decided.log.slice(-2000)}`)
    expect(/— \d+ keep, 0 prune, \d+ removed, 0 to decide\s*\n== prune ok/.test(decided.log), 'no "0 prune … 0 to decide" re-audit before "prune ok"')
    expect(new RegExp(`KEEP +page:draft +#${searchId} Smart Search .*search view`).test(decided.log), `search draft #${searchId} is not kept as the search view's`)
    expect(new RegExp(`KEEP +page:draft +#${privacyId} Privacy Policy .*wp_page_for_privacy_policy`).test(decided.log), `privacy draft #${privacyId} not kept by its option`)
    expect(new RegExp(`KEEP +page:draft +#${extra} Undecided .*--keep-draft ${extra}`).test(decided.log), 'the decided draft is not recorded')
    same(drafts(), draftsBefore, 'the drafts, their ids and status')
    return { searchId, privacyId, extra }
  })
  const s3 = seed('third')
  await check('M6-20', 'a seed after the prune recreates nothing: the search-view draft keeps its id and status', () => {
    expect(s3.code === 0, `exit ${s3.code}: ${s3.stderr.slice(-1500)}`)
    same([s3.report?.counts?.pages?.created, s3.report?.counts?.posts?.created], [0, 0], 'pages/posts created')
    same(drafts(), draftsBefore, 'the drafts')
  })
  const again = await prunePhase('again', { ...o20, keepDraft: [String(extra)] })
  await check('M6-20', 'the prune phase passes again after that seed', () => {
    expect(again.error === null, `the phase failed: ${again.error}\n${again.log.slice(-2000)}`)
  })
  return results.every((r) => r.ok) ? 0 : 1
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().then((code) => (process.exitCode = code))
