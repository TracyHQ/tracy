#!/usr/bin/env node
// Real-WordPress proof for #33 (JA Vega M6): what the fixture tests show against the fake site,
// measured on a WordPress of its own — a new compose project (mariadb:11 + wordpress:php8.3-apache
// + wordpress:cli-php8.3), never a live stand. It seeds a small spec three times through the
// seeder's CLI, renders the pages over HTTP, edits post meta through the REST API and runs the
// prune audit (with --apply) on the result:
//
//   M6-9  a post naming a page-only template stops the seed before anything is written (with
//         --dist: before the theme is installed); a
//         template declared for posts is written on create, left alone unchanged, kept on update
//   M6-1  an image only a post's markup names is imported once and its src rewritten
//   M6-8  intro/item-1.jpg (featured) and detail/item-1.jpg (body) stay two pictures; the lead stays
//   M6-4  a centred image paragraph renders as a centred figure
//   M6-3  declared post meta is registered, printed through a core/post-meta binding, editable
//         through REST by an editor of the post and refused to a subscriber
//   M6-6  the source's own category blog (fixtures/issue33/source-category-blog.json): cards, More
//         Articles titles, heading and pager of each measured source page; and the rule it shows on
//         a listing long enough for a middle page (the source has none)
//   M6-2  a page the spec dropped, published at a redirect's path, is reported and left alone
//   M6-7  the seeder's author survives audit and --apply with its posts; a draft page is listed
//         for a decision and kept
//
// The stand lives in a temporary directory (the WordPress webroot is ~70 MB); `--out` gets the
// logs, the seed reports and report.json only. Every container, volume and network of the project
// and the temporary directory are removed at the end, pass or fail (`--keep` leaves them, and the
// run then exits 1: a kept stand is not a finished proof). Nothing is skipped: Docker missing, an
// image missing, a project that already has containers, a failed assertion or a failed cleanup is
// exit 1 with the reason in report.json.
//
// Usage: node scripts/test/issue33-wordpress.mjs --project tracy-issue33-<id> --out <dir>
//          [--timeout <s>] [--keep]
// Exit 0 when every check passed and the stand is gone; 1 otherwise; 2 on a usage error.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, lstatSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createRunner } from '../lib/wp-cli.mjs'
import { convertHtml } from '../lib/html-to-blocks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const THEME = 'i33fixture'
const IMAGES = { db: 'mariadb:11', web: 'wordpress:php8.3-apache', cli: 'wordpress:cli-php8.3' }
const ADMIN = 'i33admin'

function args(argv) {
  const o = { timeout: 900, keep: false }
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
  // A name of this shape only: the harness brings the project down with its volumes at the end,
  // so it must never be pointed at a stand someone works on.
  if (!/^tracy-issue33-[a-z0-9][a-z0-9-]*$/.test(o.project)) throw new Error(`--project: "${o.project}" must be tracy-issue33-<lower-case id>`)
  return o
}

/** The environment for docker: DOCKER_HOST dropped, as lib/wp-cli.mjs does (this machine's points at another host). */
function dockerEnv() {
  const env = { ...process.env }
  delete env.DOCKER_HOST
  if (process.env.WP_DOCKER_HOST) env.DOCKER_HOST = process.env.WP_DOCKER_HOST
  return env
}

const results = []
const logLines = []
const log = (s) => {
  logLines.push(`[${new Date().toISOString()}] ${s}`)
  console.error(s)
}
/** One named check: recorded pass or fail with what was measured; never thrown past the caller. */
function check(item, name, fn) {
  try {
    const measured = fn()
    results.push({ item, name, ok: true, ...(measured === undefined ? {} : { measured }) })
    log(`ok   ${item} ${name}`)
  } catch (e) {
    results.push({ item, name, ok: false, error: String(e.message ?? e).slice(0, 2000) })
    log(`FAIL ${item} ${name}: ${String(e.message ?? e).split('\n')[0]}`)
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const same = (a, b, msg) => expect(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)

function main() {
  let o
  try {
    o = args(process.argv.slice(2))
  } catch (e) {
    console.error(`issue33-wordpress: ${e.message}`)
    return 2
  }
  const deadline = Date.now() + o.timeout * 1000
  const env = dockerEnv()
  if (existsSync(o.out) && (lstatSync(o.out).isSymbolicLink() || !lstatSync(o.out).isDirectory())) {
    console.error(`issue33-wordpress: --out ${o.out} exists and is not a directory`)
    return 2
  }
  mkdirSync(o.out, { recursive: true })
  const report = { project: o.project, started: new Date().toISOString(), results, stand: null, cleanup: null, error: null }
  const finish = (code) => {
    report.finished = new Date().toISOString()
    report.passed = results.filter((r) => r.ok).length
    report.failed = results.filter((r) => !r.ok).length
    writeFileSync(join(o.out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    writeFileSync(join(o.out, 'harness.log'), logLines.join('\n') + '\n')
    return code
  }
  const remaining = () => Math.max(1000, deadline - Date.now())
  const docker = (argv, { allowFail = false, input, timeout } = {}) => {
    if (Date.now() > deadline) throw new Error(`timed out after ${o.timeout} s (at docker ${argv.slice(0, 3).join(' ')})`)
    const r = spawnSync('docker', argv, { env, encoding: 'utf8', input, maxBuffer: 64 << 20, timeout: Math.min(timeout ?? Infinity, remaining()) })
    if (r.error) throw new Error(`docker ${argv.slice(0, 3).join(' ')}: ${r.error.message}`)
    if (r.status !== 0 && !allowFail) throw new Error(`docker ${argv.slice(0, 4).join(' ')} failed (${r.status}): ${(r.stderr || r.stdout).trim().slice(0, 1500)}`)
    return r
  }

  // ── preflight: nothing is created until Docker, the images and a free project are confirmed ──
  try {
    docker(['info', '--format', '{{.ServerVersion}}'], { timeout: 30000 })
  } catch (e) {
    report.error = `Docker is not available: ${e.message}`
    return finish(1)
  }
  const missing = Object.values(IMAGES).filter((img) => docker(['image', 'inspect', img], { allowFail: true }).status !== 0)
  if (missing.length) {
    report.error = `image(s) not on this machine: ${missing.join(', ')} — docker pull them first; this proof does not pull`
    return finish(1)
  }
  const existing = docker(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${o.project}`]).stdout.trim()
  if (existing) {
    report.error = `compose project ${o.project} already has containers (${existing.split(/\s+/).join(', ')}); refusing to touch them — bring it down first`
    return finish(1)
  }

  const stand = mkdtempSync(join(tmpdir(), 'i33-wp-'))
  report.stand = stand
  const compose = join(stand, 'compose.yml')
  const dc = (argv, opts) => docker(['compose', '--progress', 'quiet', '-f', compose, '-p', o.project, ...argv], opts)
  const runnerSpec = `docker compose --progress quiet -f ${compose} -p ${o.project} run --rm -T cli`
  let wp = null
  let code = 1
  try {
    code = prove({ o, stand, compose, dc, runnerSpec, deadline, report, setWp: (w) => (wp = w) })
  } catch (e) {
    report.error = String(e.stack ?? e).slice(0, 4000)
    log(`harness error: ${e.message}`)
    code = 1
  } finally {
    try {
      wp?.dispose()
    } catch {}
    report.cleanup = cleanup({ o, stand, dc, docker })
    if (!report.cleanup.ok) code = 1
    if (o.keep) code = 1
  }
  if (results.some((r) => !r.ok) || !results.length) code = 1
  return finish(code)
}

/** Down with volumes, then confirm the project left nothing; the temporary stand goes too. */
function cleanup({ o, stand, dc, docker }) {
  if (o.keep) return { ok: true, kept: true, stand, note: `--keep: stand left at ${stand}, project ${o.project}` }
  const out = { ok: true, retained: [] }
  // A deadline that already passed must not stop the cleanup: these calls get their own clock.
  const raw = (argv) => spawnSync('docker', argv, { env: dockerEnv(), encoding: 'utf8', timeout: 180000 })
  raw(['rm', '-f', `${o.project}-cli-keep`])
  const down = raw(['compose', '--progress', 'quiet', '-f', join(stand, 'compose.yml'), '-p', o.project, 'down', '-v', '--remove-orphans', '--timeout', '5'])
  if (down.status !== 0 && existsSync(join(stand, 'compose.yml'))) out.downError = (down.stderr || '').trim().slice(0, 500)
  const label = `label=com.docker.compose.project=${o.project}`
  for (const [kind, argv] of [
    ['container', ['ps', '-a', '-q', '--filter', label]],
    ['volume', ['volume', 'ls', '-q', '--filter', label]],
    ['network', ['network', 'ls', '-q', '--filter', label]]
  ]) {
    const r = raw(argv)
    const ids = r.status === 0 ? r.stdout.trim().split(/\s+/).filter(Boolean) : [`(docker ${kind} list failed)`]
    for (const id of ids) out.retained.push(`${kind} ${id}`)
  }
  const kept = raw(['ps', '-a', '-q', '--filter', `name=^/${o.project}-cli-keep$`]).stdout?.trim()
  if (kept) out.retained.push(`container ${o.project}-cli-keep`)
  try {
    rmSync(stand, { recursive: true, force: true })
  } catch (e) {
    out.retained.push(`directory ${stand} (${e.message})`)
  }
  if (existsSync(stand)) out.retained.push(`directory ${stand}`)
  out.ok = out.retained.length === 0
  return out
}

// ── the stand ─────────────────────────────────────────────────────────────────────

const COMPOSE = (dbPassword) => `services:
  db:
    image: ${IMAGES.db}
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
      - ./webroot:/var/www/html
      - ./images:/src-images
  cli:
    image: ${IMAGES.cli}
    user: "33:33"
    depends_on:
      - db
    environment: *wpenv
    volumes:
      - ./webroot:/var/www/html
      - ./images:/src-images:ro
      - ./dist:/dist:ro
`

const block = (name, attrs, inner = null) => {
  const a = attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : ''
  return inner === null ? `<!-- wp:${name}${a} /-->` : `<!-- wp:${name}${a} -->${inner}<!-- /wp:${name} -->`
}

/** A block theme with just what the proof needs: the cards pattern, a template for posts and pages, one for pages only. */
const THEME_FILES = {
  'style.css': `/*\nTheme Name: I33 Fixture\nDescription: Scratch theme of the #33 WordPress proof.\nVersion: 1.0.0\nRequires at least: 6.6\n*/\n`,
  'theme.json': JSON.stringify({
    version: 3,
    customTemplates: [
      { name: 'page-article', title: 'Article', postTypes: ['page', 'post'] },
      { name: 'page-only', title: 'Page only' }
    ]
  }),
  'templates/index.html': `${block('query', { queryId: 0, query: { inherit: true } }, `<div class="wp-block-query">${block('post-template', null, block('post-title', { isLink: true }))}</div>`)}\n`,
  'templates/page.html': `${block('post-title', null)}\n${block('post-content', null)}\n`,
  'templates/single.html': `${block('paragraph', null, '<p>I33-SINGLE</p>')}\n${block('post-title', null)}\n${block('post-content', null)}\n`,
  'templates/page-article.html': `${block('paragraph', null, '<p>I33-ARTICLE-TEMPLATE</p>')}\n${block('post-title', null)}\n${block('post-content', null)}\n`,
  'templates/page-only.html': `${block('paragraph', null, '<p>I33-PAGE-ONLY</p>')}\n${block('post-content', null)}\n`,
  'patterns/cards.php': `<?php\n/**\n * Title: Cards\n * Slug: tracy/cards\n * Inserter: no\n */\n?>\n<!-- wp:query {"queryId":1,"query":{"perPage":6,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query"><!-- wp:post-template -->\n<!-- wp:post-title {"isLink":true,"className":"i33-card"} /-->\n<!-- /wp:post-template --></div>\n<!-- /wp:query -->\n`
}

// ── the spec ──────────────────────────────────────────────────────────────────────

// The source's own category blog (fixtures/issue33/source-category-blog.json, measured on the JA
// Vega Joomla source): its nine titles in its order, its paging, what each page shows.
const SOURCE = JSON.parse(readFileSync(join(here, 'fixtures', 'issue33', 'source-category-blog.json'), 'utf8')).archives.find((a) => a.path === '/category-blog')
const SOURCE_TITLES = [...new Set(SOURCE.pages.flatMap((pg) => [...pg.cards, ...pg.more]))]
// Titles as the page prints them: wptexturize and esc_html write entities.
const decodeEntities = (t) =>
  String(t)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const srcSlug = (n) => `src-${String(n).padStart(2, '0')}`

const DETAIL_IMG = '/images/joomlart/blogs/detail/item-1.jpg'
const INTRO_IMG = '/images/joomlart/blogs/intro/item-1.jpg'
const POSTS = 10
const title = (n) => `Post ${String(n).padStart(2, '0')}`
const slug = (n) => `post-${String(n).padStart(2, '0')}`
const para = (text) => block('paragraph', null, `<p>${text}</p>`)
const bound = (key) => block('paragraph', { metadata: { bindings: { content: { source: 'core/post-meta', args: { key } } } } }, '<p></p>')

function specOf(variant) {
  // The adapter's conversion: the markup and the image table row it lists for the picture.
  const centred = convertHtml('<p style="text-align: center;"><img src="/images/joomlart/others/center.jpg" alt="Centred picture"></p>')
  const posts = []
  for (let n = 1; n <= POSTS; n++) {
    const p = {
      title: title(n),
      slug: slug(n),
      path: `/blog/${slug(n)}`,
      // Newest first: post 01 opens the listing.
      date: `2026-01-${String(20 - n).padStart(2, '0')} 10:00:00`,
      category: 'blog',
      author: { id: 'joomla-user-50', name: 'Jane Author' },
      joomla: { articleId: String(n) },
      content: para(`The body of ${title(n)}.`),
      images: []
    }
    if (n === 1) {
      // M6-1 / M6-8 / M6-4: the body opens with a full-text picture that shares the featured
      // picture's file name from another directory, then the lead; a centred image closes it.
      p.featuredImage = INTRO_IMG
      p.content = [
        block('image', { sizeSlug: 'full' }, `<figure class="wp-block-image size-full"><img src="${DETAIL_IMG}" alt="Detail picture"/></figure>`),
        para('I33 lead paragraph of the first post.'),
        para('The rest of the first post.'),
        centred.markup
      ].join('\n')
      p.images = centred.images
    }
    if (n === 2) {
      // M6-9 / M6-3: a template of its own, and a field as post meta printed through a binding.
      p.meta = { _wp_page_template: variant === 'page-only' ? 'page-only' : 'page-article', client: variant === 'changed' ? 'GlobalTech Solutions' : 'SquareSparc Ltd.' }
      p.content = [para('The body of Post 02.'), bound('client'), ...(variant === 'changed' ? [para('A paragraph the third seed adds.')] : [])].join('\n')
    }
    posts.push(p)
  }
  // M6-6 against the source: the source's category blog, title for title, newest first in its order.
  SOURCE_TITLES.forEach((t, i) =>
    posts.push({
      title: t,
      slug: srcSlug(i + 1),
      path: `/source-blog/${srcSlug(i + 1)}`,
      date: `2026-02-${String(20 - i).padStart(2, '0')} 10:00:00`,
      category: 'source-blog',
      author: { id: 'joomla-user-50', name: 'Jane Author' },
      joomla: { articleId: String(100 + i) },
      content: para(`The body of ${t}.`),
      images: []
    })
  )
  const home = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: para('Home.'), meta: {}, images: [] }
  const detail = { file: 'blog-detail.html', path: '/blog-detail', slug: 'blog-detail', title: 'Blog detail', view: 'page', parent: null, status: 'publish', content: para('I33 old detail page body.'), meta: {}, images: [] }
  const archive = {
    file: 'blog.html',
    path: '/blog',
    title: 'Blog',
    view: 'category',
    category: 'blog',
    perPage: 3,
    paging: { leading: 1, intro: 2, links: 2, from: { leading: 'menu', intro: 'menu', links: 'menu' } },
    moreArticles: { heading: 'More Articles …' }
  }
  const sourceArchive = {
    file: 'source-blog.html',
    path: '/source-blog',
    title: 'Source blog',
    view: 'category',
    category: 'source-blog',
    perPage: SOURCE.paging.leading + SOURCE.paging.intro,
    paging: { ...SOURCE.paging, from: { leading: 'menu', intro: 'menu', links: 'global' } },
    moreArticles: { heading: SOURCE.pages[0].moreHeading }
  }
  // The third seed: /blog-detail is no longer a page but the single view of Post 02 (M6-2).
  const dropped = variant === 'changed'
  const pages = dropped ? [home] : [home, detail]
  const pagemap = [
    { file: 'index.html', path: '/', title: 'Home', view: 'front-page' },
    dropped ? { file: 'blog-detail.html', path: '/blog-detail', title: 'Blog detail', view: 'single', source: { articleId: '2' } } : { file: 'blog-detail.html', path: '/blog-detail', title: 'Blog detail', view: 'page' },
    { file: 'blog.html', path: '/blog', title: 'Blog', view: 'category' },
    { file: 'source-blog.html', path: '/source-blog', title: 'Source blog', view: 'category' }
  ]
  return {
    'page-map.json': { pages: pagemap },
    'content.json': {
      site: { name: 'I33' },
      pages,
      posts,
      categories: [{ id: '15', title: 'Blog', wpSlug: 'blog', description: '' }, { id: '16', title: 'Source blog', wpSlug: 'source-blog', description: '' }],
      archives: [archive, sourceArchive],
      authors: [{ id: 'joomla-user-50', name: 'Jane Author', login: 'jane' }],
      images: []
    },
    'sections.json': { acm: [], custom: [], other: [] },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': { types: {} }
  }
}

// ── the proof ─────────────────────────────────────────────────────────────────────

function prove({ o, stand, compose, dc, runnerSpec, deadline, report, setWp }) {
  const password = randomBytes(12).toString('hex')
  mkdirSync(join(stand, 'webroot'), { recursive: true })
  mkdirSync(join(stand, 'images'), { recursive: true })
  mkdirSync(join(stand, 'dist'), { recursive: true })
  writeFileSync(compose, COMPOSE(password))
  log(`stand ${stand}, project ${o.project}`)
  dc(['up', '-d', '--wait', 'db', 'web'])
  const port = dc(['port', 'web', '80']).stdout.trim().split(':').pop()
  expect(/^\d+$/.test(port), `no port for web: ${port}`)
  const url = `http://127.0.0.1:${port}`
  report.url = url
  // The web entrypoint copies WordPress into the webroot and writes wp-config.php on its first start.
  const until = Date.now() + 180000
  while (!existsSync(join(stand, 'webroot', 'wp-config.php')) || !existsSync(join(stand, 'webroot', 'wp-includes', 'version.php'))) {
    expect(Date.now() < until && Date.now() < deadline, 'WordPress files never appeared in the webroot')
    spawnSync('sleep', ['1'])
  }
  const wp = createRunner(runnerSpec, { deadline })
  setWp(wp)
  wp.run(['core', 'install', `--url=${url}`, '--title=I33', `--admin_user=${ADMIN}`, `--admin_password=${password}`, '--admin_email=i33@example.invalid', '--skip-email'])
  wp.run(['rewrite', 'structure', '/%postname%/'])
  const themeDir = join(stand, 'webroot', 'wp-content', 'themes', THEME)
  for (const [rel, text] of Object.entries(THEME_FILES)) {
    mkdirSync(dirname(join(themeDir, rel)), { recursive: true })
    writeFileSync(join(themeDir, rel), text)
  }
  wp.run(['theme', 'activate', THEME])
  wp.run(['rewrite', 'flush'])
  wp.run(['user', 'create', 'i33reader', 'i33reader@example.invalid', '--role=subscriber', `--user_pass=${password}`])
  // Three different pictures, two of one file name: GD in the web container writes real JPEGs.
  dc(['exec', '-T', 'web', 'php', '-r', `
    foreach (array('joomlart/blogs/intro/item-1.jpg' => array(200, 40, 40), 'joomlart/blogs/detail/item-1.jpg' => array(40, 40, 200), 'joomlart/others/center.jpg' => array(40, 160, 40)) as $f => $c) {
      $p = '/src-images/' . $f; @mkdir(dirname($p), 0777, true);
      $im = imagecreatetruecolor(64, 48); imagefill($im, 0, 0, imagecolorallocate($im, $c[0], $c[1], $c[2]));
      if (!imagejpeg($im, $p, 90)) { fwrite(STDERR, "cannot write $p\\n"); exit(1); }
    }`])

  const specDir = (name, variant) => {
    const dir = join(stand, 'spec-' + name)
    mkdirSync(dir, { recursive: true })
    for (const [f, v] of Object.entries(specOf(variant))) writeFileSync(join(dir, f), JSON.stringify(v, null, 1))
    return dir
  }
  // One --out for every seed: the seeder keeps its media index there (media.json), as a port does.
  const seed = (name, variant, extra = []) => {
    const dir = specDir(name, variant)
    const reportFile = join(o.out, `seed-${name}.json`)
    rmSync(reportFile, { force: true })
    const seconds = Math.max(60, Math.floor((deadline - Date.now()) / 1000) - 60)
    const r = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'seed.mjs'), '--spec', dir, '--wp', runnerSpec, '--theme', THEME, '--patterns-map', join(dir, 'patterns.map.json'), '--images', '/src-images', '--images-local', join(stand, 'images'), '--base-url', url, '--report', reportFile, '--out', join(stand, 'seed-out'), '--timeout', String(seconds), ...extra],
      { cwd: pkg, encoding: 'utf8', env: { ...dockerEnv() }, maxBuffer: 64 << 20, timeout: seconds * 1000 + 30000 }
    )
    writeFileSync(join(o.out, `seed-${name}.log`), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`)
    log(`seed ${name}: exit ${r.status}`)
    return { code: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '', report: existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null }
  }
  const snapshot = () => ({
    posts: wp.json(['post', 'list', '--post_type=any', '--post_status=any', '--fields=ID,post_type,post_name,post_status', '--orderby=ID', '--order=asc', '--posts_per_page=-1']),
    terms: wp.json(['term', 'list', 'category', '--fields=term_id,slug']),
    users: wp.json(['user', 'list', '--fields=ID,user_login']),
    postMetaOption: wp.run(['option', 'get', 'tracy_post_meta'], { allowFail: true, mutate: false }).code
  })
  const postsOf = () => wp.json(['post', 'list', '--post_type=post', '--post_status=any', '--fields=ID,post_name,post_author', '--orderby=ID', '--order=asc', '--posts_per_page=-1'])
  // Each post's seed fingerprint and modified time: which post a seed rewrote, when one did.
  const stamps = () =>
    Object.fromEntries(
      JSON.parse(wp.phpEval(`echo json_encode(array_map(function($p){return array($p->post_name,get_post_meta($p->ID,'_tracy_seed',true),$p->post_modified_gmt);},get_posts(array('post_type'=>array('post','page'),'post_status'=>'any','numberposts'=>-1))));`)).map(([n, fp, m]) => [n, `${fp} ${m}`])
    )
  const changedSince = (a, b) => Object.keys(b).filter((k) => a[k] !== b[k])
  const idOf = (name, type = 'post') => Number(wp.out(['post', 'list', `--post_type=${type}`, '--post_status=any', `--name=${name}`, '--field=ID'], { mutate: false }))
  const meta = (id, key) => wp.run(['post', 'meta', 'get', String(id), key], { allowFail: true, mutate: false }).stdout.trim()
  const attachments = () => wp.json(['post', 'list', '--post_type=attachment', '--post_status=any', '--fields=ID,post_name,guid', '--posts_per_page=-1'])
  const get = (path) => {
    const r = spawnSync('curl', ['-sS', '-L', '--max-time', '30', '-o', '-', '-w', '\n%{http_code}', `${url}${path}`], { encoding: 'utf8', maxBuffer: 32 << 20 })
    if (r.status !== 0) throw new Error(`curl ${path}: ${r.stderr.trim()}`)
    const i = r.stdout.lastIndexOf('\n')
    return { status: Number(r.stdout.slice(i + 1)), body: r.stdout.slice(0, i) }
  }

  // M6-9, before anything else: a page-only template stops the seed and the site is unchanged.
  const before = snapshot()
  const bad = seed('page-only', 'page-only')
  check('M6-9', 'a post naming a page-only template stops the seed before anything is written', () => {
    expect(bad.code !== 0, 'the seed exited 0')
    expect(/template "page-only" — the theme declares it for page only, not for posts/.test(bad.stderr), `stderr does not name the template and the post types: ${bad.stderr.slice(-800)}`)
    same(snapshot(), before, 'posts, terms, users and the post meta option')
    return { exit: bad.code }
  })

  // M6-9 with --theme-src --dist: the built theme declares page-article for pages only. The seed
  // must stop on the built theme.json, before the install writes the site.
  const themeSrc = join(stand, 'theme-src')
  for (const [rel, text] of Object.entries({ ...THEME_FILES, 'theme.json': JSON.stringify({ version: 3, customTemplates: [{ name: 'page-article', title: 'Article', postTypes: ['page'] }, { name: 'page-only', title: 'Page only' }] }) })) {
    mkdirSync(dirname(join(themeSrc, 'src', THEME, rel)), { recursive: true })
    writeFileSync(join(themeSrc, 'src', THEME, rel), text)
  }
  mkdirSync(join(themeSrc, 'scripts'), { recursive: true })
  writeFileSync(
    join(themeSrc, 'scripts', 'build.mjs'),
    `import { spawnSync } from 'node:child_process'\nimport { mkdirSync, rmSync } from 'node:fs'\nmkdirSync('dist', { recursive: true })\nrmSync('dist/${THEME}.zip', { force: true })\nconst r = spawnSync('zip', ['-qrX', '../dist/${THEME}.zip', '${THEME}'], { cwd: 'src', encoding: 'utf8' })\nif (r.status !== 0) { console.error(r.error?.message ?? r.stderr); process.exit(1) }\n`
  )
  const themeBefore = { list: wp.json(['theme', 'list', '--fields=name,status,version']), json: readFileSync(join(themeDir, 'theme.json'), 'utf8') }
  const beforeDist = snapshot()
  const badDist = seed('page-only-dist', 'first', ['--theme-src', themeSrc, '--dist', join(stand, 'dist')])
  check('M6-9', 'with --dist, a template the built theme declares for pages only stops the seed before the theme is installed', () => {
    expect(badDist.code !== 0, 'the seed exited 0')
    expect(/template "page-article" — the theme declares it for page only, not for posts/.test(badDist.stderr), `stderr: ${badDist.stderr.slice(-800)}`)
    expect(existsSync(join(themeSrc, 'dist', `${THEME}.zip`)), 'the theme was not built')
    expect(!existsSync(join(stand, 'dist', `${THEME}.zip`)), 'the zip reached the stand')
    same({ list: wp.json(['theme', 'list', '--fields=name,status,version']), json: readFileSync(join(themeDir, 'theme.json'), 'utf8') }, themeBefore, 'the installed theme')
    same(snapshot(), beforeDist, 'posts, terms, users and the post meta option')
    return { exit: badDist.code }
  })

  // First seed.
  const s1 = seed('first', 'first')
  check('seed', 'the first seed exits 0', () => {
    expect(s1.code === 0, `exit ${s1.code}: ${s1.stderr.slice(-1500)}`)
    return s1.report?.counts?.posts
  })
  const ids1 = postsOf()
  const stamps1 = stamps()
  const att1 = attachments()
  const p1 = idOf(slug(1))
  const p2 = idOf(slug(2))
  const detailPage = idOf('blog-detail', 'page')
  check('M6-9', 'a template declared for posts is written on create', () => {
    same(meta(p2, '_wp_page_template'), 'page-article', 'the post template')
    same(s1.report?.templates?.forPosts, ['page-article'], 'report.templates.forPosts')
  })
  check('M6-3', 'declared meta reaches the post; the keys are registered for REST', () => {
    same(meta(p2, 'client'), 'SquareSparc Ltd.', 'client')
    const reg = JSON.parse(wp.phpEval(`$k=get_registered_meta_keys('post','post');echo json_encode(isset($k['client'])?array('type'=>$k['client']['type'],'single'=>$k['client']['single'],'rest'=>(bool)$k['client']['show_in_rest']):null);`))
    same(reg, { type: 'string', single: true, rest: true }, 'registration')
    same(s1.report?.postMeta?.plugin?.action, 'written', 'the must-use plugin')
    return reg
  })
  check('M6-1', 'the post-only image and the featured image are imported as two attachments', () => {
    same(att1.length, 3, 'attachments (intro, detail, centre)')
    const body = wp.out(['post', 'get', String(p1), '--field=post_content'], { mutate: false })
    expect(!body.includes('/images/joomlart'), 'a source path is left in the post')
    const srcs = [...body.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    same(srcs.length, 2, 'pictures in the body')
    const thumb = Number(meta(p1, '_thumbnail_id'))
    const thumbUrl = wp.out(['eval', `echo wp_get_attachment_url(${thumb});`], { mutate: false })
    expect(thumb > 0, 'no featured image')
    expect(srcs.every((s) => s.includes('/wp-content/uploads/')), `not rewritten: ${srcs.join(', ')}`)
    expect(!srcs.some((s) => thumbUrl.endsWith(s.replace(/^https?:\/\/[^/]+/, ''))), `the body shows the featured file ${thumbUrl}: ${srcs.join(', ')}`)
    return { srcs, thumbUrl }
  })
  check('M6-8', 'the body picture of the same file name and the lead stay', () => {
    const body = wp.out(['post', 'get', String(p1), '--field=post_content'], { mutate: false })
    expect(body.includes('I33 lead paragraph of the first post.'), 'the lead was dropped')
    expect(body.indexOf('<img') < body.indexOf('I33 lead paragraph'), 'the body picture no longer opens the post')
  })

  // Second seed: nothing changes.
  const s2 = seed('second', 'first')
  check('seed', 'a second seed changes nothing: same ids, no import, no update', () => {
    expect(s2.code === 0, `exit ${s2.code}: ${s2.stderr.slice(-1500)}`)
    same(changedSince(stamps1, stamps()), [], 'posts and pages rewritten')
    same(s2.report?.counts?.posts, { created: 0, updated: 0, skipped: POSTS + SOURCE_TITLES.length }, 'counts.posts')
    same(postsOf(), ids1, 'posts')
    same(attachments(), att1, 'attachments')
    same(s2.report?.postMeta?.plugin?.action, 'same', 'the post meta plugin')
    same(s2.report?.moreArticles?.plugin?.action, 'same', 'the more-articles plugin')
  })

  // Third seed: Post 02 changes (content and meta) and /blog-detail becomes its single view.
  const s3 = seed('changed', 'changed')
  check('M6-9', 'a changed post keeps its declared template through the update', () => {
    expect(s3.code === 0, `exit ${s3.code}: ${s3.stderr.slice(-1500)}`)
    same(s3.report?.counts?.posts, { created: 0, updated: 1, skipped: POSTS + SOURCE_TITLES.length - 1 }, 'counts.posts')
    same(idOf(slug(2)), p2, 'the same post')
    same(meta(p2, '_wp_page_template'), 'page-article', 'the template')
    expect(wp.out(['post', 'get', String(p2), '--field=post_content'], { mutate: false }).includes('A paragraph the third seed adds.'), 'the update did not land')
  })
  check('M6-3', 'a changed value updates the same post', () => same(meta(p2, 'client'), 'GlobalTech Solutions', 'client'))
  check('M6-2', 'the dropped page at the redirected path is reported and left as it was', () => {
    const audit = s3.report?.pageAudit
    expect(audit?.ok === true, `pageAudit: ${JSON.stringify(audit)}`)
    const obsolete = audit.obsolete.find((r) => r.id === detailPage)
    const shadow = audit.shadowing.find((r) => r.id === detailPage)
    expect(obsolete && obsolete.path === '/blog-detail' && obsolete.status === 'publish', `obsolete: ${JSON.stringify(audit.obsolete)}`)
    expect(shadow && shadow.path === '/blog-detail' && shadow.seeded === true && /post-02/.test(shadow.redirect), `shadowing: ${JSON.stringify(audit.shadowing)}`)
    same(idOf('blog-detail', 'page'), detailPage, 'the page id')
    same(wp.out(['post', 'get', String(detailPage), '--field=post_status'], { mutate: false }), 'publish', 'the page status')
    expect(wp.out(['post', 'get', String(detailPage), '--field=post_content'], { mutate: false }).includes('I33 old detail page body.'), 'the page body changed')
    expect((s3.stderr + s3.stdout).includes('REDIRECT SHADOWED'), 'no log line')
    return { obsolete, shadow }
  })

  // Rendered pages.
  check('M6-4', 'the centred image paragraph renders as a centred figure', () => {
    const r = get(`/${slug(1)}/`)
    same(r.status, 200, `GET /${slug(1)}/`)
    expect(/<figure class="wp-block-image aligncenter size-full">\s*<img[^>]+src="[^"]*\/wp-content\/uploads\/[^"]*center[^"]*"/.test(r.body), 'no centred figure with the imported picture')
    expect(r.body.includes('I33 lead paragraph of the first post.'), 'the lead is not on the page')
    const pics = [...r.body.matchAll(/<img\b[^>]*\ssrc="([^"]*\/wp-content\/uploads\/[^"]+)"/g)].map((m) => m[1])
    for (const src of pics) same(get(src.replace(/^https?:\/\/[^/]+/, '')).status, 200, `GET ${src}`)
    return { pictures: pics.length }
  })
  check('M6-3', 'the core/post-meta binding prints the value through the template the post declares', () => {
    const r = get(`/${slug(2)}/`)
    same(r.status, 200, `GET /${slug(2)}/`)
    expect(r.body.includes('I33-ARTICLE-TEMPLATE'), 'not rendered through page-article')
    expect(r.body.includes('GlobalTech Solutions'), 'the bound meta value is not printed')
  })
  // A category page as a visitor reads it: the cards before the More Articles section, the titles
  // in it, its heading, and the pager — the page numbers it offers, the current one, a next link.
  const listing = (path, page) => {
    const cardsId = Number(/"queryId":(\d+)/.exec(wp.out(['post', 'get', String(idOf(path, 'page')), '--field=post_content'], { mutate: false }))?.[1])
    const url = page === 1 ? `/${path}/` : `/${path}/?query-${cardsId}-page=${page}`
    const r = get(url)
    same(r.status, 200, `GET ${url}`)
    const at = r.body.indexOf('tracy-more-articles')
    const titles = (html) => [...html.matchAll(/wp-block-post-title[^>]*>\s*<a [^>]*>([^<]+)<\/a>/g)].map((m) => decodeEntities(m[1].trim()))
    const pagers = [...r.body.matchAll(/<div class="wp-block-query-pagination-numbers">([\s\S]*?)<\/div>/g)].map((m) => m[1])
    expect(pagers.length === 1, `${url}: ${pagers.length} pagers, want one (the cards' own)`)
    const numbers = [...pagers[0].matchAll(/class="page-numbers( current)?"[^>]*>(\d+)</g)].map((m) => ({ n: Number(m[2]), current: Boolean(m[1]) }))
    return {
      cards: titles(at === -1 ? r.body : r.body.slice(0, at)),
      more: at === -1 ? null : titles(r.body.slice(at)),
      heading: at === -1 ? null : decodeEntities(/<h3[^>]*tracy-more-articles__title[^>]*>([^<]*)<\/h3>/.exec(r.body.slice(at))?.[1] ?? ''),
      pages: numbers.map((x) => x.n),
      current: numbers.find((x) => x.current)?.n ?? null,
      next: /<a\b[^>]*\bclass="wp-block-query-pagination-next\b/.test(r.body)
    }
  }
  // Against the source: each measured source page, cards, More Articles titles and heading, the
  // number of pages its counter gives ("Page 1 of 2") and whether it links onwards.
  SOURCE.pages.forEach((src, i) => {
    const [, current, total] = /Page (\d+) of (\d+)/.exec(src.counter).map(Number)
    check('M6-6', `source ${src.url} (${src.counter}) against /source-blog/ page ${i + 1}`, () => {
      const got = listing('source-blog', i + 1)
      same(got.cards, src.cards, 'cards, in the source\'s order')
      same(got.more, src.more.length ? src.more : null, 'More Articles titles')
      if (src.more.length) same(got.heading, src.moreHeading, 'the heading')
      same(got.current, current, 'the current page')
      same(Math.max(...got.pages), total, 'the number of pages')
      same(got.next, src.links.some((l) => /next page/.test(l.label)), 'a link to the next page')
      return got
    })
  })
  // The source has no category blog long enough for a middle page; the rule its two pages show
  // (a page starts where the previous page's cards end, its More Articles titles open the next
  // page) on 10 posts, 3 cards a page, 2 titles after them.
  const want = [
    { cards: [1, 2, 3], more: [4, 5] },
    { cards: [4, 5, 6], more: [7, 8] },
    { cards: [7, 8, 9], more: [10] },
    { cards: [10], more: null }
  ]
  want.forEach((w, i) =>
    check('M6-6', `category blog page ${i + 1} of 4: cards ${w.cards.join(',')}, More Articles ${w.more ? w.more.join(',') : 'none'}`, () => {
      const got = listing('blog', i + 1)
      same(got.cards, w.cards.map(title), 'cards')
      same(got.more, w.more ? w.more.map(title) : null, 'More Articles titles')
      if (w.more) same(got.heading, 'More Articles …', 'the heading')
      same(got.pages, [1, 2, 3, 4], 'the page numbers')
      same(got.current, i + 1, 'the current page')
      same(got.next, i + 1 < want.length, 'a link to the next page')
      return got
    })
  )
  check('M6-6', 'the heading is an editable core/heading in the page content', () => {
    const content = wp.out(['post', 'get', String(idOf('blog', 'page')), '--field=post_content'], { mutate: false })
    expect(/<!-- wp:heading \{[^}]*"level":3[^}]*\} -->\s*<h3[^>]*>More Articles …<\/h3>/.test(content) || /<!-- wp:heading[^>]*-->\s*<h3[^>]*>More Articles …<\/h3>/.test(content), 'no core/heading with the text')
  })

  // REST: an editor of the post may change the meta, a subscriber may not.
  check('M6-3', 'the meta is editable through REST by an editor of the post and refused to a subscriber', () => {
    const rest = (user) =>
      JSON.parse(
        wp.phpEval(
          `$u=get_user_by('login','${user}');wp_set_current_user($u->ID);$r=new WP_REST_Request('POST','/wp/v2/posts/${p2}');$r->set_body_params(array('meta'=>array('client'=>'Edited by ${user}')));$s=rest_do_request($r);echo json_encode(array('status'=>$s->get_status(),'value'=>get_post_meta(${p2},'client',true)));`
        )
      )
    const reader = rest('i33reader')
    expect(reader.status === 403 || reader.status === 401, `subscriber: ${JSON.stringify(reader)}`)
    same(reader.value, 'GlobalTech Solutions', 'value after the refused edit')
    const admin = rest(ADMIN)
    same(admin, { status: 200, value: `Edited by ${ADMIN}` }, 'admin edit')
    const pub = JSON.parse(get(`/wp-json/wp/v2/posts/${p2}`).body)
    same(pub?.meta?.client, `Edited by ${ADMIN}`, 'meta in the public REST answer')
    return { reader, admin }
  })

  // M6-7: prune audit and --apply keep the seeder's author and every draft page. The old detail
  // page is drafted by hand so the redirect to its post runs (JA Vega's /blog-detail): a draft at a
  // redirect's path, with no recorded intent. A builder's account and a trashed post are what
  // --apply still removes, after reading them again.
  const draft = Number(wp.out(['post', 'create', '--post_type=page', '--post_status=draft', '--post_title=I33 hand draft', '--post_name=i33-hand-draft', '--porcelain']))
  wp.run(['post', 'update', String(detailPage), '--post_status=draft'])
  wp.run(['user', 'create', 'i33builder', 'i33builder@example.invalid', '--role=author', `--user_pass=${password}`])
  const trashed = Number(wp.out(['post', 'create', '--post_type=post', '--post_status=draft', '--post_title=I33 thrown away', '--porcelain']))
  wp.run(['post', 'delete', String(trashed)])
  const authors = wp.json(['user', 'list', '--meta_key=tracy_source_author', '--fields=ID,user_login'])
  const postsBefore = postsOf()
  const audit = (apply) => {
    const r = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'quickstart', 'prune-audit.mjs'), '--webroot', join(stand, 'webroot'), '--wp', runnerSpec, '--admin', ADMIN, '--site-url', url, '--json', '--keep-user', 'i33reader', '--timeout', String(Math.max(60, Math.floor((deadline - Date.now()) / 1000) - 60)), ...(apply ? ['--apply'] : [])],
      { cwd: pkg, encoding: 'utf8', env: dockerEnv(), maxBuffer: 64 << 20 }
    )
    writeFileSync(join(o.out, `prune-audit${apply ? '-apply' : ''}.log`), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`)
    const at = r.stdout.indexOf('{')
    return { code: r.status, out: at === -1 ? null : JSON.parse(r.stdout.slice(at)) }
  }
  const a1 = audit(false)
  check('M6-7', 'the audit keeps the seeded author and lists the hand draft for a decision', () => {
    expect(a1.out, `no JSON (exit ${a1.code})`)
    expect(authors.length >= 1 && authors.some((u) => u.user_login === 'jane'), `seeded authors: ${JSON.stringify(authors)}`)
    for (const u of authors) {
      const row = a1.out.rows.find((r) => r.area === 'user' && r.item === u.user_login)
      same(row?.verdict, 'KEEP', `user ${u.user_login}`)
      expect(/tracy_source_author/.test(row.why), row.why)
    }
    const row = a1.out.rows.find((r) => r.area === 'page:draft' && r.item.startsWith(`#${draft} `))
    same(row?.verdict, 'UNKNOWN', 'the hand draft')
    const old = a1.out.rows.find((r) => r.area === 'page:draft' && r.item.startsWith(`#${detailPage} `))
    same(old?.verdict, 'UNKNOWN', 'the old detail page drafted at the redirect\'s path')
    expect(/\/blog-detail/.test(old.why) && /redirect/.test(old.why), old.why)
    same(a1.out.rows.find((r) => r.area === 'user' && r.item === 'i33builder')?.verdict, 'PRUNE', 'the builder account')
    same(a1.out.rows.find((r) => r.area === 'post:trash' && r.item.startsWith(`#${trashed} `))?.verdict, 'PRUNE', 'the trashed post')
    expect(!a1.out.rows.some((r) => r.area === 'page:draft' && r.verdict === 'PRUNE'), 'a draft is PRUNE')
    return a1.out.rows.filter((r) => r.area === 'user' || r.area === 'page:draft')
  })
  const a2 = audit(true)
  check('M6-7', '--apply deletes no seeded author, changes no authorship and keeps the drafts', () => {
    expect(a2.out, `no JSON (exit ${a2.code})`)
    same(wp.json(['user', 'list', '--meta_key=tracy_source_author', '--fields=ID,user_login']), authors, 'seeded authors')
    same(postsOf(), postsBefore, 'posts and their authors')
    same(wp.out(['post', 'get', String(draft), '--field=post_status'], { mutate: false }), 'draft', 'the hand draft')
    same(wp.out(['post', 'get', String(detailPage), '--field=post_status'], { mutate: false }), 'draft', 'the old detail page')
    // The re-read agreed with the audit for these two: removed.
    same(wp.json(['user', 'list', '--login=i33builder', '--fields=ID']), [], 'the builder account')
    same(wp.run(['post', 'get', String(trashed), '--field=ID'], { allowFail: true, mutate: false }).code !== 0, true, 'the trashed post')
    expect(!a2.out.rows.some((r) => /not removed/.test(r.why)), `a row the re-read refused: ${JSON.stringify(a2.out.rows.filter((r) => /not removed/.test(r.why)))}`)
    return { removed: a2.out.removed }
  })
  return results.every((r) => r.ok) ? 0 : 1
}

process.exitCode = main()
