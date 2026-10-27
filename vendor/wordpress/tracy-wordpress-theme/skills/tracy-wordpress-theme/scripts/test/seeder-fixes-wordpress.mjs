#!/usr/bin/env node
// Real-WordPress proof for the seeder fixes of #68 and #74: what the fixture tests show against the fake
// site, measured on a WordPress of its own — a new compose project (mariadb:11 + wordpress:php8.3-apache
// + wordpress:cli-php8.3), never a live stand. It seeds a small spec twice through the seeder's CLI and
// runs the prune audit (--apply) on the result:
//
//   #68  a new attachment on a page route's slug is renamed, the page keeps its slug; the front page and a
//        nested /home/... route get distinct slugs; a category named "Design & Build" is created once and
//        the repeat seed changes nothing (every count +0 ~0, every id unchanged, owner edits kept)
//   #74  a category route draws its layout row (the CTA) after the list; a tag route lists only the posts
//        that carry its declared tag; pages[].tags reach the page; authors[].meta is user meta; the
//        redirect rule is served with a 301; the audit keeps the author avatar (usermeta only) and still
//        removes an attachment nothing names
//
// The stand lives in a temporary directory (under TRACY_TEST_SCRATCH when set); `--out` gets the logs, the
// seed reports and report.json only. Every container, volume and network of the project and the temporary
// directory are removed at the end, pass or fail (`--keep` leaves them, and the run then exits 1). Nothing
// is skipped: Docker missing, an image missing, a project that already has containers, a failed assertion or
// a failed cleanup is exit 1 with the reason in report.json.
//
// Usage: node scripts/test/seeder-fixes-wordpress.mjs --project tracy-seeder-<id> --out <dir>
//          [--timeout <s>] [--keep]
// Exit 0 when every check passed and the stand is gone; 1 otherwise; 2 on a usage error.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, lstatSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createRunner } from '../lib/wp-cli.mjs'
import { wpRunner } from '../quickstart/lib.mjs'
import { deleteUnreferenced } from '../quickstart/prune-usermeta.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const THEME = 'seederfixture'
const IMAGES = { db: 'mariadb:11', web: 'wordpress:php8.3-apache', cli: 'wordpress:cli-php8.3' }
const ADMIN = 'seederadmin'

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
  if (!/^tracy-seeder-[a-z0-9][a-z0-9-]*$/.test(o.project)) throw new Error(`--project: "${o.project}" must be tracy-seeder-<lower-case id>`)
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
    console.error(`seeder-fixes-wordpress: ${e.message}`)
    return 2
  }
  const deadline = Date.now() + o.timeout * 1000
  const env = dockerEnv()
  if (existsSync(o.out) && (lstatSync(o.out).isSymbolicLink() || !lstatSync(o.out).isDirectory())) {
    console.error(`seeder-fixes-wordpress: --out ${o.out} exists and is not a directory`)
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

  const stand = mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'seeder-wp-'))
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

/** A block theme with just what the proof needs: the cards pattern and the templates. */
const THEME_FILES = {
  'style.css': `/*\nTheme Name: Seeder Fixture\nDescription: Scratch theme of the seeder-fixes WordPress proof.\nVersion: 1.0.0\nRequires at least: 6.6\n*/\n`,
  'theme.json': JSON.stringify({ version: 3 }),
  'templates/index.html': `${block('query', { queryId: 0, query: { inherit: true } }, `<div class="wp-block-query">${block('post-template', null, block('post-title', { isLink: true }))}</div>`)}\n`,
  'templates/page.html': `${block('post-title', null)}\n${block('post-content', null)}\n`,
  'templates/single.html': `${block('post-title', null)}\n${block('post-content', null)}\n`,
  'patterns/cards.php': `<?php\n/**\n * Title: Cards\n * Slug: tracy/cards\n * Inserter: no\n */\n?>\n<!-- wp:query {"queryId":1,"query":{"perPage":6,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query"><!-- wp:post-template -->\n<!-- wp:post-title {"isLink":true,"className":"seeder-card"} /-->\n<!-- /wp:post-template --></div>\n<!-- /wp:query -->\n`
}

// ── the spec ──────────────────────────────────────────────────────────────────────

const para = (text) => block('paragraph', null, `<p>${text}</p>`)
const CTA = 'If you want to talk! We are here'

function specOf() {
  const page = (o) => ({ status: 'publish', parent: null, meta: {}, images: [], ...o })
  const home = page({ file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', content: para('Home body.') })
  const about = page({
    file: 'about-us.html', path: '/about-us', slug: 'about-us', title: 'About us', view: 'page', tags: ['Development'],
    content: para('About body.') + '\n' + block('image', { sizeSlug: 'full' }, '<figure class="wp-block-image size-full"><img src="/wp-content/uploads/about-us.jpg" alt=""/></figure>'),
    images: [{ src: '/wp-content/uploads/about-us.jpg', file: 'about-us.jpg', original: 'images/about-us.jpg', alt: '' }]
  })
  const style = page({ file: 'home-style-1.html', path: '/home/home-style-1', slug: 'home-style-1', title: 'Home Style 1', view: 'page', parent: '/home', content: para('Style one body.') })
  const posts = [
    { slug: 'tagged-post', path: '/blog/tagged-post', category: 'design-build', title: 'Tagged post', tags: ['Development'], date: '2026-01-10 10:00:00', author: { id: 'joomla-user-50', name: 'Ada' }, content: para('Tagged body.'), images: [] },
    { slug: 'plain-post', path: '/blog/plain-post', category: 'design-build', title: 'Plain post', date: '2026-01-09 10:00:00', author: { id: 'joomla-user-50', name: 'Ada' }, content: para('Plain body.'), images: [] }
  ]
  return {
    'page-map.json': {
      pages: [
        { file: 'index.html', path: '/', title: 'Home', view: 'front-page' },
        { file: 'about-us.html', path: '/about-us', title: 'About us', view: 'page' },
        { file: 'home-style-1.html', path: '/home/home-style-1', title: 'Home Style 1', view: 'page' },
        { file: 'work.html', path: '/work', title: 'Work', view: 'category' },
        { file: 'tagged.html', path: '/tagged-items', title: 'Tagged items', view: 'tag' }
      ]
    },
    'content.json': {
      site: { name: 'Seeder' },
      pages: [home, about, style],
      posts,
      categories: [{ id: '8', title: 'Design & Build', wpSlug: 'design-build', parent: null, description: '' }],
      archives: [
        { file: 'work.html', view: 'category', path: '/work', title: 'Work', category: 'design-build', sections: [{ position: 'main-bottom-1', via: 'layout', modules: ['138'] }], aside: [] },
        { file: 'tagged.html', view: 'tag', path: '/tagged-items', title: 'Tagged items', tags: ['Development'], sections: [], aside: [] }
      ],
      authors: [{ id: 'joomla-user-50', name: 'Ada', login: 'ada', avatar: 'images/authors/ada.jpg', meta: { user_jobtitle: 'Designer' } }],
      images: []
    },
    'sections.json': {
      acm: [],
      custom: [{ id: '138', title: 'CTA', position: 'main-bottom-1', scope: 'page', pages: ['ALL'], html: `<div><p>${CTA}</p></div>`, blocks: para(CTA), images: [] }],
      other: []
    },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [{ from: '/old-path', to: '/about-us/', status: 301 }] },
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
  const until = Date.now() + 180000
  while (!existsSync(join(stand, 'webroot', 'wp-config.php')) || !existsSync(join(stand, 'webroot', 'wp-includes', 'version.php'))) {
    expect(Date.now() < until && Date.now() < deadline, 'WordPress files never appeared in the webroot')
    spawnSync('sleep', ['1'])
  }
  const wp = createRunner(runnerSpec, { deadline })
  setWp(wp)
  wp.run(['core', 'install', `--url=${url}`, '--title=Seeder', `--admin_user=${ADMIN}`, `--admin_password=${password}`, '--admin_email=seeder@example.invalid', '--skip-email'])
  wp.run(['rewrite', 'structure', '/%postname%/'])
  const themeDir = join(stand, 'webroot', 'wp-content', 'themes', THEME)
  for (const [rel, text] of Object.entries(THEME_FILES)) {
    mkdirSync(dirname(join(themeDir, rel)), { recursive: true })
    writeFileSync(join(themeDir, rel), text)
  }
  wp.run(['theme', 'activate', THEME])
  wp.run(['rewrite', 'flush'])
  // Real JPEGs from GD in the web container: the page image, the author photo and one nothing names.
  dc(['exec', '-T', 'web', 'php', '-r', `
    foreach (array('about-us.jpg' => array(200, 40, 40), 'authors/ada.jpg' => array(40, 40, 200), 'orphan.jpg' => array(40, 160, 40)) as $f => $c) {
      $p = '/src-images/' . $f; @mkdir(dirname($p), 0777, true);
      $im = imagecreatetruecolor(64, 48); imagefill($im, 0, 0, imagecolorallocate($im, $c[0], $c[1], $c[2]));
      if (!imagejpeg($im, $p, 90)) { fwrite(STDERR, "cannot write $p\\n"); exit(1); }
    }`])

  const dir = join(stand, 'spec')
  mkdirSync(dir, { recursive: true })
  for (const [f, v] of Object.entries(specOf())) writeFileSync(join(dir, f), JSON.stringify(v, null, 1))
  const seed = (name) => {
    const reportFile = join(o.out, `seed-${name}.json`)
    rmSync(reportFile, { force: true })
    const seconds = Math.max(60, Math.floor((deadline - Date.now()) / 1000) - 60)
    const r = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'seed.mjs'), '--spec', dir, '--wp', runnerSpec, '--theme', THEME, '--patterns-map', join(dir, 'patterns.map.json'), '--images', '/src-images', '--images-local', join(stand, 'images'), '--base-url', url, '--report', reportFile, '--out', join(stand, 'seed-out'), '--timeout', String(seconds)],
      { cwd: pkg, encoding: 'utf8', env: { ...dockerEnv() }, maxBuffer: 64 << 20, timeout: seconds * 1000 + 30000 }
    )
    writeFileSync(join(o.out, `seed-${name}.log`), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`)
    log(`seed ${name}: exit ${r.status}`)
    return { code: r.status, stderr: r.stderr ?? '', report: existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null }
  }
  const pages = () => wp.json(['post', 'list', '--post_type=page', '--post_status=any', '--fields=ID,post_name,post_parent', '--orderby=ID', '--order=asc', '--posts_per_page=-1'])
  const all = () => wp.json(['post', 'list', '--post_type=any', '--post_status=any', '--fields=ID,post_type,post_name,post_status', '--orderby=ID', '--order=asc', '--posts_per_page=-1'])
  const idOf = (name, type = 'page') => Number(wp.out(['post', 'list', `--post_type=${type}`, '--post_status=any', `--name=${name}`, '--field=ID'], { mutate: false }))
  const get = (path, follow = true) => {
    const r = spawnSync('curl', ['-sS', ...(follow ? ['-L'] : []), '--max-time', '30', '-D', '-', '-o', '-', '-w', '\n%{http_code}', `${url}${path}`], { encoding: 'utf8', maxBuffer: 32 << 20 })
    if (r.status !== 0) throw new Error(`curl ${path}: ${r.stderr.trim()}`)
    const i = r.stdout.lastIndexOf('\n')
    return { status: Number(r.stdout.slice(i + 1)), body: r.stdout.slice(0, i) }
  }

  const s1 = seed('first')
  check('seed', 'the first seed exits 0', () => {
    expect(s1.code === 0, `exit ${s1.code}: ${s1.stderr.slice(-1500)}`)
    return s1.report?.counts
  })
  const about = idOf('about-us')
  check('#68', 'the page keeps the slug its image shares; the attachment gave it up', () => {
    expect(about > 0, 'no page with the slug about-us')
    const att = wp.json(['post', 'list', '--post_type=attachment', '--fields=ID,post_name', '--posts_per_page=-1'])
    expect(att.some((a) => a.post_name === 'about-us-image'), `attachments: ${JSON.stringify(att)}`)
    expect(!att.some((a) => a.post_name === 'about-us'), 'an attachment holds the page slug')
    expect(!pages().some((p) => /^about-us-\d+$/.test(p.post_name)), `a suffixed page: ${JSON.stringify(pages())}`)
  })
  check('#68', 'the front page and the nested /home/... route get distinct slugs; the child sits under its parent', () => {
    const p = pages()
    const parent = p.find((x) => x.post_name === 'home')
    const child = p.find((x) => x.post_name === 'home-style-1')
    expect(parent && child && Number(child.post_parent) === Number(parent.ID), `pages: ${JSON.stringify(p)}`)
    expect(p.some((x) => x.post_name === 'home-front'), `no home-front: ${JSON.stringify(p)}`)
    const r = get('/home/home-style-1/')
    same(r.status, 200, 'GET /home/home-style-1/')
  })
  check('#68', 'a category with & is stored once, encoded, and named as the spec says', () => {
    const t = wp.json(['term', 'list', 'category', '--slug=design-build', '--fields=term_id,name'])
    same(t.length, 1, 'terms with the slug')
    same(t[0].name, 'Design &amp; Build', 'stored name')
  })
  check('#74 S-20', 'the category route draws its layout row (the CTA) after the list', () => {
    const r = get('/work/')
    same(r.status, 200, 'GET /work/')
    expect(r.body.includes(CTA), 'the CTA is not on the page')
    expect(r.body.includes('Tagged post'), 'the list is not on the page')
    expect(r.body.indexOf('Tagged post') < r.body.indexOf(CTA), 'the CTA stands before the list')
  })
  check('#74 S-29', 'the tag route lists the posts that carry its declared tag and no other', () => {
    const r = get('/tagged-items/')
    same(r.status, 200, 'GET /tagged-items/')
    expect(r.body.includes('Tagged post'), 'the tagged post is missing')
    expect(!r.body.includes('Plain post'), 'a post without the tag is listed')
  })
  check('#74 S-38', 'the page keeps its source tag', () => {
    same(wp.out(['post', 'term', 'list', String(about), 'post_tag', '--field=name'], { mutate: false, allowFail: true }).trim(), 'Development', 'page tags')
  })
  check('#74 S-39', 'the author\'s profile value is user meta', () => {
    const id = wp.out(['user', 'list', '--meta_key=tracy_source_author', '--meta_value=joomla-user-50', '--field=ID'], { mutate: false }).trim()
    same(wp.out(['user', 'meta', 'get', id, 'user_jobtitle'], { mutate: false }).trim(), 'Designer', 'user_jobtitle')
  })
  check('#68', 'the redirect rule is served with a 301 to its target', () => {
    const r = spawnSync('curl', ['-sS', '--max-time', '30', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', `${url}/old-path`], { encoding: 'utf8' })
    expect(/^301 .*\/about-us\/$/.test(r.stdout.trim()), `got ${r.stdout.trim()} ${r.stderr.trim()}`)
  })

  // Repeat: no creates, no updates, the same ids; an owner's edit survives.
  const ownerEdit = 'Owner edited excerpt'
  wp.run(['post', 'update', String(about), `--post_excerpt=${ownerEdit}`])
  const before = all()
  const s2 = seed('second')
  check('#68', 'a repeat seed creates and updates nothing, and every id is unchanged', () => {
    expect(s2.code === 0, `exit ${s2.code}: ${s2.stderr.slice(-1500)}`)
    const moved = Object.entries(s2.report?.counts ?? {}).filter(([, c]) => c.created || c.updated)
    same(moved, [], 'kinds with creates or updates on the repeat')
    same(all(), before, 'posts, their types, slugs and statuses')
    same(wp.json(['term', 'list', 'category', '--slug=design-build', '--fields=term_id']).length, 1, 'terms named design-build')
  })

  // Prune: the avatar (named only by usermeta) survives --apply; an attachment nothing names goes.
  const avatarId = Number(wp.out(['user', 'meta', 'get', wp.out(['user', 'list', '--meta_key=tracy_source_author', '--meta_value=joomla-user-50', '--field=ID'], { mutate: false }).trim(), 'tracy_avatar'], { mutate: false }).trim())
  const orphanId = Number(wp.out(['media', 'import', '/src-images/orphan.jpg', '--porcelain']).trim())
  expect(avatarId > 0 && orphanId > 0, `avatar ${avatarId}, orphan ${orphanId}`)
  const audit = (apply) => {
    const r = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'quickstart', 'prune-audit.mjs'), '--webroot', join(stand, 'webroot'), '--wp', runnerSpec, '--admin', ADMIN, '--site-url', url, '--json', '--keep-user', 'ada', '--timeout', String(Math.max(60, Math.floor((deadline - Date.now()) / 1000) - 60)), ...(apply ? ['--apply'] : [])],
      { cwd: pkg, encoding: 'utf8', env: dockerEnv(), maxBuffer: 64 << 20 }
    )
    writeFileSync(join(o.out, `prune-audit${apply ? '-apply' : ''}.log`), `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`)
    const at = r.stdout.indexOf('{')
    return { code: r.status, out: at === -1 ? null : JSON.parse(r.stdout.slice(at)) }
  }
  const a1 = audit(false)
  check('#74 S-48', 'the audit keeps the avatar (user meta only) and marks the unreferenced attachment PRUNE', () => {
    expect(a1.out, `no JSON (exit ${a1.code})`)
    const row = (id) => a1.out.rows.find((r) => r.area === 'attachment' && r.item.startsWith(`#${id} `))
    same(row(avatarId)?.verdict, 'KEEP', `attachment ${avatarId}`)
    expect(/user meta tracy_avatar/.test(row(avatarId).why), row(avatarId).why)
    same(row(orphanId)?.verdict, 'PRUNE', `attachment ${orphanId}`)
  })
  const a2 = audit(true)
  check('#74 S-48', '--apply removes the unreferenced attachment and keeps the avatar', () => {
    expect(a2.out, `no JSON (exit ${a2.code})`)
    const alive = (id) => wp.run(['post', 'get', String(id), '--field=post_type'], { allowFail: true, mutate: false })
    same(alive(avatarId).stdout.trim(), 'attachment', 'the avatar')
    expect(alive(orphanId).code !== 0, 'the orphan is still there')
  })
  // The combined check and delete works from the stand as it is at that moment, not from the audit:
  // an attachment a post names since, an avatar set since, and a row whose status changed all stay.
  check('#74 S-48', 'the combined check and delete keeps an attachment that gained a reference or changed status since the audit, and deletes a free one', () => {
    const imp = () => Number(wp.out(['media', 'import', '/src-images/orphan.jpg', '--porcelain']).trim())
    const [inPost, avatarLate, changed, free] = [imp(), imp(), imp(), imp()]
    wp.run(['post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Late reference', `--post_content=<img class="wp-image-${inPost}" src="x.jpg">`])
    const uid = wp.out(['user', 'list', '--meta_key=tracy_source_author', '--meta_value=joomla-user-50', '--field=ID'], { mutate: false }).trim()
    wp.run(['user', 'meta', 'add', uid, 'tracy_avatar', String(avatarLate)])
    const row = (id, status = 'inherit') => ({ area: 'attachment', verdict: 'PRUNE', why: 'orphan', remove: { wp: ['post', 'delete', String(id), '--force'], expect: { post_type: 'attachment', post_status: status } } })
    const rows = [row(inPost), row(avatarLate), row(changed, 'private'), row(free)]
    const removed = deleteUnreferenced(wpRunner(runnerSpec, { keep: false }), rows)
    same(removed.map((r) => r.remove.wp[2]), [String(free)], `deleted (${rows.map((r) => r.why).join(' | ')})`)
    same(rows.map((r) => r.verdict), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'REMOVED'], 'verdicts')
    expect(/named: content of #/.test(rows[0].why) && /named: tracy_avatar/.test(rows[1].why) && /changed since the audit/.test(rows[2].why), rows.map((r) => r.why).join(' | '))
    for (const id of [inPost, avatarLate, changed]) same(wp.run(['post', 'get', String(id), '--field=post_type'], { allowFail: true, mutate: false }).stdout.trim(), 'attachment', `attachment ${id}`)
  })
  // What classifyMedia counts as a reference must stop the deletion however late it appears: a
  // generated size's file name, a bare [gallery] on the parent, a theme file. Files go only after
  // the rows are committed, so a kept attachment still has its file and a deleted one has none.
  check('#74 S-48', 'the combined check and delete also keeps an attachment named by a size file, a parent [gallery] or a theme file; files of a kept attachment stay, of a deleted one go', () => {
    const imp = () => Number(wp.out(['media', 'import', '/src-images/orphan.jpg', '--porcelain']).trim())
    const [bySize, byGallery, byTheme, free] = [imp(), imp(), imp(), imp()]
    const php = (code) => wp.out(['eval', code], { mutate: false }).trim()
    // The relative path under uploads/ (2026/10/x.jpg): the matcher counts a file by its path, not by a bare name.
    const relOf = (id) => php(`echo get_post_meta(${id}, '_wp_attached_file', true);`)
    const there = (id) => php(`echo file_exists(get_attached_file(${id})) ? 'yes' : 'no';`)
    wp.run(['eval', `$m = wp_get_attachment_metadata(${bySize}); if (!is_array($m)) $m = array(); $m['sizes'] = array('thumbnail' => array('file' => 'sized-thumb-150x150.jpg', 'width' => 150, 'height' => 150)); wp_update_attachment_metadata(${bySize}, $m);`])
    wp.run(['post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Late size', `--post_content=<img src="/wp-content/uploads/${relOf(bySize).replace(/[^/]*$/, '')}sized-thumb-150x150.jpg">`])
    const gallery = Number(wp.out(['post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Late gallery', '--post_content=[gallery]', '--porcelain']).trim())
    wp.run(['post', 'update', String(byGallery), `--post_parent=${gallery}`])
    const themeFile = php(`echo get_stylesheet_directory() . '/late-ref.html';`)
    wp.run(['eval', `file_put_contents('${themeFile}', '<img src="/wp-content/uploads/' . '${relOf(byTheme)}' . '">');`])
    try {
      const row = (id) => ({ area: 'attachment', verdict: 'PRUNE', why: 'orphan', remove: { wp: ['post', 'delete', String(id), '--force'], expect: { post_type: 'attachment', post_status: 'inherit' } } })
      const rows = [row(bySize), row(byGallery), row(byTheme), row(free)]
      same([bySize, byGallery, byTheme, free].map((id) => there(id)), ['yes', 'yes', 'yes', 'yes'], 'files before')
      const freePath = php(`echo get_attached_file(${free});`)
      const removed = deleteUnreferenced(wpRunner(runnerSpec, { keep: false }), rows)
      same(removed.map((r) => r.remove.wp[2]), [String(free)], `deleted (${rows.map((r) => r.why).join(' | ')})`)
      expect(/size file|sized-thumb|named:/.test(rows[0].why) && /\[gallery\] of its parent/.test(rows[1].why) && /theme file .*late-ref\.html/.test(rows[2].why), rows.map((r) => r.why).join(' | '))
      same([bySize, byGallery, byTheme].map((id) => there(id)), ['yes', 'yes', 'yes'], 'files of the kept attachments')
      same(php(`echo file_exists('${freePath}') ? 'yes' : 'no';`), 'no', 'the deleted attachment\'s file')
    } finally {
      wp.run(['eval', `@unlink('${themeFile}');`])
    }
  })
  check('#68', 'the owner\'s edit survived the repeat seed', () => {
    same(wp.out(['post', 'get', String(about), '--field=post_excerpt'], { mutate: false }).trim(), ownerEdit, 'the excerpt')
  })
  // A changed spec: the page loses its only tag; the repeat seed must clear it on WordPress, and a
  // seed after that must find nothing left to change.
  const contentFile = join(dir, 'content.json')
  const changed = JSON.parse(readFileSync(contentFile, 'utf8'))
  delete changed.pages.find((p) => p.slug === 'about-us').tags
  writeFileSync(contentFile, JSON.stringify(changed, null, 1))
  const s3 = seed('third')
  check('#74 S-38', 'a page whose source lost its only tag loses it on WordPress, and the next seed changes nothing', () => {
    expect(s3.code === 0, `exit ${s3.code}: ${s3.stderr.slice(-1500)}`)
    same(wp.out(['post', 'term', 'list', String(about), 'post_tag', '--field=name'], { mutate: false, allowFail: true }).trim(), '', 'page tags after the change')
    const s4 = seed('fourth')
    expect(s4.code === 0, `exit ${s4.code}: ${s4.stderr.slice(-1500)}`)
    same(Object.entries(s4.report?.counts ?? {}).filter(([, c]) => c.created || c.updated), [], 'kinds with creates or updates after the change settled')
  })

  return results.every((r) => r.ok) ? 0 : 1
}

process.exitCode = main()
