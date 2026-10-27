#!/usr/bin/env node
// Real-WordPress proof for #37 (JA Vega M6, part 2): what the fixture tests show, on a WordPress of
// its own — a new compose project (mariadb:11 + wordpress:php8.3-apache + wordpress:cli-php8.3),
// never a live stand. It seeds a small spec twice through the seeder's CLI (Contact Form 7 is
// installed by the seeder from wordpress.org), renders the pages over HTTP, opens the block editor
// in Chromium and edits a heading there:
//
//   M6-11  the contact form's required labels print the star in `span.wtb-form__required`, after
//          CF7 has rendered the form; the optional field has none; CF7's required tags hold
//   M6-12  a module field's bare <br> renders as a break in a core/heading and in a composed,
//          repeated core/paragraph; markup around it that is not a bare <br> renders as text;
//          parse_blocks → serialize_blocks gives the stored content back; the block editor reads
//          every block of the page as valid, the heading's content with its break; an edit made in
//          the editor (a new line, still broken) is saved and rendered
//   seed   the second seed writes nothing: forms and pages +0 ~0, the same ids
//
// The stand lives in a temporary directory; `--out` gets the logs, the seed reports and
// report.json only. Ownership is by run, never by name: the run holds a lock on its project from
// before the preflight to after the cleanup (a file under TRACY_ISSUE37_LOCK_DIR, default
// /tmp/tracy-issue37-locks, hard-linked into place so two runs cannot both take it); the preflight refuses
// any container, volume or network the project's name or compose label already covers; every
// container and the network the run creates carry `org.tracy.issue37.run=<run id>`, and the
// cleanup removes exactly those ids and the anonymous volumes mounted in them, never `compose down`
// by project. Absence is only ever read from a listing docker answered: a listing or an inspect
// that fails is an error, never "not there". Anything of the project that is not this run's —
// found before a seed or at the end — is reported under `foreign`, left alone, and fails the run.
// Everything after the lock is taken runs inside one block that releases it; a release that fails
// is in report.json and fails the run. A run killed before its cleanup leaves the lock: the next
// one refuses until someone has looked. `--keep` leaves the stand, and the run then exits 1. Nothing is skipped: Docker missing,
// an image missing, a project held or already present, CF7 that does not install, a browser that
// does not start, a failed assertion or a failed cleanup is exit 1 with the reason in report.json.
// No form is submitted.
//
// Usage: node scripts/test/issue37-wordpress.mjs --project tracy-issue37-<id> --out <dir>
//          [--timeout <s>] [--keep]
// Exit 0 when every check passed and the stand is gone; 1 otherwise; 2 on a usage error.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, lstatSync, linkSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createRunner } from '../lib/wp-cli.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const THEME = 'i37fixture'
const IMAGES = { db: 'mariadb:11', web: 'wordpress:php8.3-apache', cli: 'wordpress:cli-php8.3' }
const ADMIN = 'i37admin'
/** The label every container and network of one run carries: the cleanup removes these ids only. */
const RUN_LABEL = 'org.tracy.issue37.run'
const lockDir = () => process.env.TRACY_ISSUE37_LOCK_DIR || '/tmp/tracy-issue37-locks'

export function args(argv) {
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
  // A name of this shape only: the harness makes and removes a stand under it, so it must never
  // be pointed at a stand someone works on (and the preflight refuses one that is there).
  if (!/^tracy-issue37-[a-z0-9][a-z0-9-]*$/.test(o.project)) throw new Error(`--project: "${o.project}" must be tracy-issue37-<lower-case id>`)
  return o
}

/** The container lib/wp-cli.mjs keeps for the `cli` service of this project. */
const keepName = (o) => `${o.project}-cli-keep`

/**
 * The project's lock for this run: a file holding the owner, written aside and hard-linked into
 * place (link is atomic and fails when the name exists — of two runs, one gets it, and nobody
 * reads a lock without its owner). A lock already there is refused with its owner, live or not: a
 * killed run leaves its lock and possibly its stand, and nobody guesses which. `release()` removes
 * it only while it still names this run.
 */
export function takeLock(project, runId) {
  const dir = lockDir()
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${project}.lock`)
  const aside = join(dir, `.${project}.${runId}.tmp`)
  const read = () => JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(aside, JSON.stringify({ pid: process.pid, run: runId, started: new Date().toISOString() }) + '\n')
  let held = false
  try {
    linkSync(aside, path)
    held = true
  } catch (e) {
    if (e.code !== 'EEXIST') throw new Error(`cannot take the lock ${path}: ${e.message}`)
    let owner = null
    try {
      owner = read()
    } catch {}
    let alive = false
    try {
      alive = Number.isInteger(owner?.pid) && process.kill(owner.pid, 0)
    } catch (k) {
      alive = k.code === 'EPERM'
    }
    const who = owner ? `pid ${owner.pid} (${alive ? 'running' : 'not running'}), run ${owner.run}, since ${owner.started}` : 'its owner cannot be read'
    throw new Error(`project ${project} is held by ${path}: ${who}; another proof runs on it or a killed one left it — check the project's containers, volumes and networks, then remove the lock`)
  } finally {
    try {
      rmSync(aside, { force: true })
    } catch (e) {
      // the lock is not handed out with a file of ours beside it: give it back, say why
      if (held) rmSync(path, { force: true })
      throw new Error(`cannot remove ${aside}: ${e.message}`)
    }
  }
  let released = false
  return {
    path,
    /** Remove the lock; throws when it cannot, or when the file there no longer names this run (it is then left). */
    release() {
      if (released) return
      released = true
      let owner
      try {
        owner = read()
      } catch (e) {
        throw new Error(`cannot read the lock ${path} to release it: ${e.message}`)
      }
      if (owner?.run !== runId) throw new Error(`the lock ${path} names run ${owner?.run}, not this run ${runId}; left in place`)
      rmSync(path)
    }
  }
}

/**
 * Every container, volume and network the project covers — by compose label or by the names
 * compose and the wp-cli runner give (`<project>-…`, `<project>_…`), labelled or not — as
 * `{ kind, id, names, run }` (`run`: its RUN_LABEL, '' when it has none). A listing docker refuses
 * is an error: nothing is taken as absent unread.
 */
export function projectResources(project, docker) {
  const label = `{{.Label "com.docker.compose.project"}}\t{{.Label "${RUN_LABEL}"}}`
  const out = []
  for (const [kind, argv] of [
    ['container', ['ps', '-a', '--format', `{{.ID}}\t{{.Names}}\t${label}`]],
    ['volume', ['volume', 'ls', '--format', `{{.Name}}\t{{.Name}}\t${label}`]],
    ['network', ['network', 'ls', '--format', `{{.ID}}\t{{.Name}}\t${label}`]]
  ]) {
    const r = docker(argv)
    if (r.error || r.status !== 0) throw new Error(`docker ${argv.slice(0, 2).join(' ')} failed: ${(r.error?.message ?? r.stderr ?? '').trim().slice(0, 500)}`)
    for (const line of String(r.stdout).split('\n').filter((l) => l.trim())) {
      const [id, names = '', owner = '', run = ''] = line.split('\t')
      const hit = owner === project || names.split(',').some((n) => n === project || n.startsWith(`${project}-`) || n.startsWith(`${project}_`))
      if (hit) out.push({ kind, id, names, run: run === '<no value>' ? '' : run })
    }
  }
  return out
}
const describe = (r) => `${r.kind} ${r.id} ${r.names}`

/**
 * What the project covers that is not this run's: not labelled with its run id, and not a volume
 * mounted in one of its containers (anonymous volumes carry no label of ours). Throws when any
 * listing or inspect cannot be read.
 */
export function strangers(project, runId, docker) {
  const all = projectResources(project, docker)
  const ours = new Set()
  for (const c of all.filter((r) => r.kind === 'container' && r.run === runId)) {
    const m = docker(['inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}', c.id])
    if (m.error || m.status !== 0) throw new Error(`docker inspect ${c.id} failed: ${(m.error?.message ?? m.stderr ?? '').trim().slice(0, 500)}`)
    for (const v of String(m.stdout).trim().split(/\s+/).filter(Boolean)) ours.add(v)
  }
  return all.filter((r) => r.run !== runId && !(r.kind === 'volume' && ours.has(r.id)))
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
const record = (item, name, ok, extra) => {
  results.push({ item, name, ok, ...extra })
  log(`${ok ? 'ok  ' : 'FAIL'} ${item} ${name}${ok ? '' : `: ${String(extra.error).split('\n')[0]}`}`)
}
/** One named check: recorded pass or fail with what was measured; never thrown past the caller. */
async function check(item, name, fn) {
  try {
    const measured = await fn()
    record(item, name, true, measured === undefined ? {} : { measured })
  } catch (e) {
    record(item, name, false, { error: String(e.message ?? e).slice(0, 2000) })
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
    console.error(`issue37-wordpress: ${e.message}`)
    return 2
  }
  const deadline = Date.now() + o.timeout * 1000
  const env = dockerEnv()
  if (existsSync(o.out) && (lstatSync(o.out).isSymbolicLink() || !lstatSync(o.out).isDirectory())) {
    console.error(`issue37-wordpress: --out ${o.out} exists and is not a directory`)
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
  // ── preflight: nothing is created until the project is held, Docker, the images, disk and a free project are confirmed ──
  let lock
  try {
    lock = takeLock(o.project, runId)
  } catch (e) {
    report.error = e.message
    return finish(1)
  }
  report.lock = { path: lock.path, released: false }
  // From here on, whatever throws, the lock is released and a release that fails fails the run.
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

/** The run while it holds the project's lock: preflight, stand, proof, cleanup. Returns the exit code. */
export async function held({ o, runId, env, deadline, report }) {
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
  // Docker dies silently on a full disk: 2 GB free on the temporary directory's volume, or no stand.
  const df = spawnSync('df', ['-k', tmpdir()], { encoding: 'utf8' })
  const freeKb = Number(String(df.stdout).trim().split('\n').pop()?.split(/\s+/)[3])
  if (!(freeKb > 2 * 1024 * 1024)) {
    report.error = `less than 2 GB free under ${tmpdir()} (${Number.isFinite(freeKb) ? Math.round(freeKb / 1024) : '?'} MB): no stand`
    return 1
  }
  // Any container, volume or network the project already covers is someone else's: compose would
  // adopt it, and the wp-cli runner adopts a running `<project>-cli-keep` labelled or not.
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

  const stand = mkdtempSync(join(tmpdir(), 'i37-wp-'))
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

/**
 * Remove what this run made, by id: the containers and networks labelled with its run id, and the
 * anonymous volumes mounted in those containers. Nothing is removed by project or by name; what
 * of this run is still there afterwards is `retained`, what else the project covers is `foreign`
 * (left alone for someone to look at); either, or a listing that cannot be read, fails the
 * cleanup. The final project listing classifies every entry it holds, so a resource of this run
 * that appears after the labelled re-check is still `retained`. The temporary stand goes too.
 */
export function cleanup({ o, runId, stand }, { spawn = spawnSync } = {}) {
  if (o.keep) return { ok: true, kept: true, stand, note: `--keep: stand left at ${stand}, project ${o.project}, run ${runId}` }
  const out = { ok: true, removed: [], retained: [], foreign: [] }
  // A deadline that already passed must not stop the cleanup: these calls get their own clock.
  const raw = (argv) => spawn('docker', argv, { env: dockerEnv(), encoding: 'utf8', timeout: 180000 })
  const ids = (kind, argv) => {
    const r = raw(argv)
    if (r.error || r.status !== 0) {
      out.retained.push(`${kind} (docker ${argv.slice(0, 2).join(' ')} failed: ${(r.error?.message ?? r.stderr ?? '').trim().slice(0, 200)})`)
      return []
    }
    return String(r.stdout).trim().split(/\s+/).filter(Boolean)
  }
  const mine = ['--filter', `label=${RUN_LABEL}=${runId}`]
  const volumes = new Set()
  for (const id of ids('container', ['ps', '-a', '-q', ...mine])) {
    const m = raw(['inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}', id])
    if (m.status === 0) for (const v of String(m.stdout).trim().split(/\s+/).filter(Boolean)) volumes.add(v)
    else out.retained.push(`container ${id} (its mounts could not be read)`)
    const r = raw(['rm', '-f', '-v', id])
    if (r.status === 0) out.removed.push(`container ${id}`)
  }
  for (const v of ids('volume', ['volume', 'ls', '-q', ...mine])) volumes.add(v)
  for (const v of volumes) if (raw(['volume', 'rm', v]).status === 0) out.removed.push(`volume ${v}`)
  for (const id of ids('network', ['network', 'ls', '-q', ...mine])) if (raw(['network', 'rm', id]).status === 0) out.removed.push(`network ${id}`)
  // What is still there of this run.
  for (const [kind, argv] of [
    ['container', ['ps', '-a', '-q', ...mine]],
    ['volume', ['volume', 'ls', '-q', ...mine]],
    ['network', ['network', 'ls', '-q', ...mine]]
  ])
    for (const id of ids(kind, argv)) out.retained.push(`${kind} ${id}`)
  // The anonymous volumes carry no label of ours: still there is read from the full listing, never
  // from an inspect that fails.
  if (volumes.size) for (const v of ids('volume', ['volume', 'ls', '-q'])) if (volumes.has(v) && !out.retained.includes(`volume ${v}`)) out.retained.push(`volume ${v}`)
  // The project listing is read last and is the one that decides: whatever it holds is still there,
  // this run's (labelled with its run id, or a volume its containers mounted) is `retained` —
  // however late it appeared — and the rest is `foreign`. Nothing it lists goes unclassified.
  try {
    for (const r of projectResources(o.project, raw)) {
      if (r.run === runId || (r.kind === 'volume' && volumes.has(r.id))) {
        if (!out.retained.includes(`${r.kind} ${r.id}`)) out.retained.push(`${r.kind} ${r.id}`)
      } else out.foreign.push(describe(r))
    }
  } catch (e) {
    out.foreign = [`(not listed: ${e.message})`]
  }
  try {
    rmSync(stand, { recursive: true, force: true })
  } catch (e) {
    out.retained.push(`directory ${stand} (${e.message})`)
  }
  if (existsSync(stand)) out.retained.push(`directory ${stand}`)
  out.ok = out.retained.length === 0 && out.foreign.length === 0
  return out
}

// ── the stand ─────────────────────────────────────────────────────────────────────

// Every service (so `compose run` containers too, the wp-cli runner's kept one included) and the
// network carry the run's label: the cleanup removes by it.
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
      - ./webroot:/var/www/html
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
      - ./webroot:/var/www/html
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

/** A block theme with the two module patterns the proof fills (metadata.name per field). */
const TEAM_PATTERN = [
  '<!-- wp:group {"className":"acm-team"} -->\n<div class="wp-block-group acm-team">',
  '<!-- wp:paragraph {"metadata":{"role":"content","name":"team.title"},"className":"t-title"} -->\n<p class="t-title">Placeholder</p>\n<!-- /wp:paragraph -->',
  '<!-- wp:heading {"metadata":{"role":"content","name":"team.desc"},"className":"t-desc"} -->\n<h2 class="wp-block-heading t-desc">Placeholder</h2>\n<!-- /wp:heading -->',
  '</div>\n<!-- /wp:group -->'
].join('\n')
const HERO_PATTERN = [
  '<!-- wp:group {"className":"acm-hero"} -->\n<div class="wp-block-group acm-hero">',
  '<!-- wp:group {"metadata":{"name":"hero.item.1"},"className":"hero-item"} -->\n<div class="wp-block-group hero-item">',
  '<!-- wp:paragraph {"metadata":{"role":"content","name":"hero.avatar-title.1"},"className":"avatar-title"} -->\n<p class="avatar-title">x</p>\n<!-- /wp:paragraph -->',
  '</div>\n<!-- /wp:group -->',
  '</div>\n<!-- /wp:group -->'
].join('\n')
const php = (slug, title, content) => `<?php\n/**\n * Title: ${title}\n * Slug: ${THEME}/${slug}\n * Inserter: no\n */\n?>\n${content}\n`
const THEME_FILES = {
  'style.css': `/*\nTheme Name: I37 Fixture\nDescription: Scratch theme of the #37 WordPress proof.\nVersion: 1.0.0\nRequires at least: 6.6\n*/\n`,
  'theme.json': JSON.stringify({ version: 3 }),
  'templates/index.html': `${block('post-title', null)}\n${block('post-content', null)}\n`,
  'templates/page.html': `${block('post-title', null)}\n${block('post-content', null)}\n`,
  'patterns/team.php': php('team', 'Team', TEAM_PATTERN),
  'patterns/hero.php': php('hero', 'Hero', HERO_PATTERN)
}

// ── the spec ──────────────────────────────────────────────────────────────────────

// The port's `contact-form` section: every required label carries the source's star element.
const CONTACT_FORM = `<div class="jv-contact__form"><form class="form-validate">
<div class="control-group"><label for="n" class="required control-label">Name<span class="star"> *</span></label><input type="text" id="n" required></div>
<div class="control-group"><label for="e" class="required control-label">Email<span class="star"> *</span></label><input type="email" id="e" required></div>
<div class="control-group"><label for="s" class="required control-label">Subject<span class="star"> *</span></label><input type="text" id="s" required></div>
<div class="control-group"><label for="m" class="required control-label">Message<span class="star"> *</span></label><textarea id="m" required></textarea></div>
<div class="control-group"><label for="p">Phone</label><input type="tel" id="p"></div>
<button type="submit">Send Email</button></form></div>`
const TEAM_DESC = 'Meet the Minds <br>Behind Our Success'
const HOSTILE = 'x <br onclick="alert(37)"> y <script>alert(37)</script> <!-- /wp:paragraph --> z'
const para = (text) => block('paragraph', null, `<p>${text}</p>`)
const acm = (id, type, position, fields, items) => ({
  id,
  type,
  style: 'style-1',
  title: type,
  position,
  published: true,
  ordering: 1,
  showtitle: false,
  pages: [{ file: 'index.html', wpPath: '/', via: 'menu-assignment' }],
  spacing: {},
  moduleClass: '',
  itemGroup: null,
  fields,
  items,
  scope: 'page'
})
const PATTERNS_MAP = {
  namespace: THEME,
  types: {
    'team:style-1': {
      pattern: `${THEME}/team`,
      fields: {
        'team-title': { block: 'core/paragraph', path: 'team.title', attr: 'text' },
        'team-desc': { block: 'core/heading', path: 'team.desc', attr: 'content' }
      }
    },
    'hero:style-1': {
      pattern: `${THEME}/hero`,
      item: 'hero.item.<n>',
      fields: {
        'avatar-accent': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 1, wrap: 'span', wrapClass: 'accent' },
        'avatar-title': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 2 }
      }
    }
  }
}

function spec() {
  const home = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: para('I37 home.'), meta: {}, images: [] }
  const contact = { file: 'contact.html', path: '/contact', slug: 'contact', title: 'Contact', view: 'page-contact', parent: null, status: 'publish', content: para('I37 contact page.'), meta: {}, images: [] }
  return {
    'page-map.json': {
      pages: [
        { file: 'index.html', path: '/', title: 'Home', view: 'front-page' },
        { file: 'contact.html', path: '/contact', title: 'Contact', view: 'page-contact' }
      ]
    },
    'content.json': { site: { name: 'I37' }, pages: [home, contact], posts: [], categories: [], archives: [], authors: [], images: [] },
    'sections.json': {
      acm: [
        acm('160', 'team', 'section-5', { 'team-title': 'Our team', 'team-desc': TEAM_DESC }, []),
        acm('111', 'hero', 'section-1', {}, [
          { 'avatar-accent': '20K+', 'avatar-title': 'USERS HAVE SIGNED UP TO GROW<br/> ON THEIR TERMS' },
          { 'avatar-accent': '', 'avatar-title': HOSTILE }
        ])
      ],
      custom: [{ id: 'contact-form', sectionType: 'form', title: 'Contact form', html: CONTACT_FORM, pages: [{ path: '/contact' }] }],
      other: []
    },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': PATTERNS_MAP
  }
}

// ── the proof ─────────────────────────────────────────────────────────────────────

async function prove({ o, runId, stand, compose, dc, docker, runnerSpec, deadline, report, setWp }) {
  const password = randomBytes(12).toString('hex')
  mkdirSync(join(stand, 'webroot'), { recursive: true })
  // The spec names no picture; the seeder still wants the image directories.
  mkdirSync(join(stand, 'images'), { recursive: true })
  writeFileSync(compose, COMPOSE(password, runId))
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
  // The harness's own calls run one `compose run --rm … cli wp` each: it keeps no container by name. The
  // seeder keeps its `<project>-cli-keep` (the preflight refused one already there); before each
  // seed everything the project covers must be this run's — read from listings docker answered —
  // or the seed would adopt someone else's.
  const wp = createRunner(`${runnerSpec} wp`, { deadline, keep: false })
  setWp(wp)
  wp.run(['core', 'install', `--url=${url}`, '--title=I37', `--admin_user=${ADMIN}`, `--admin_password=${password}`, '--admin_email=i37@example.invalid', '--skip-email'])
  wp.run(['rewrite', 'structure', '/%postname%/'])
  const themeDir = join(stand, 'webroot', 'wp-content', 'themes', THEME)
  for (const [rel, text] of Object.entries(THEME_FILES)) {
    mkdirSync(dirname(join(themeDir, rel)), { recursive: true })
    writeFileSync(join(themeDir, rel), text)
  }
  wp.run(['theme', 'activate', THEME])
  wp.run(['rewrite', 'flush'])
  report.wordpress = wp.out(['core', 'version'], { mutate: false })

  const specDir = join(stand, 'spec')
  mkdirSync(specDir, { recursive: true })
  for (const [f, v] of Object.entries(spec())) writeFileSync(join(specDir, f), JSON.stringify(v, null, 1))
  const seed = (name) => {
    const others = strangers(o.project, runId, (argv) => docker(argv, { allowFail: true }))
    if (others.length) throw new Error(`the project has what this run did not make: ${others.map(describe).join('; ')}; the seed (its ${keepName(o)}) would adopt it`)
    const reportFile = join(o.out, `seed-${name}.json`)
    rmSync(reportFile, { force: true })
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
  const idOf = (name, type = 'page') => Number(wp.out(['post', 'list', `--post_type=${type}`, '--post_status=any', `--name=${name}`, '--field=ID'], { mutate: false }))
  const content = (id) => wp.out(['post', 'get', String(id), '--field=post_content'], { mutate: false })
  const stamps = () =>
    JSON.parse(wp.phpEval(`echo json_encode(array_map(function($p){return array($p->ID,$p->post_type,$p->post_name,$p->post_modified_gmt,md5($p->post_content));},get_posts(array('post_type'=>array('page','wpcf7_contact_form'),'post_status'=>'any','numberposts'=>-1,'orderby'=>'ID','order'=>'ASC'))));`))
  const get = (path, save = null) => {
    const r = spawnSync('curl', ['-sS', '-L', '--max-time', '30', '-o', '-', '-w', '\n%{http_code}', `${url}${path}`], { encoding: 'utf8', maxBuffer: 32 << 20 })
    if (r.status !== 0) throw new Error(`curl ${path}: ${r.stderr.trim()}`)
    const i = r.stdout.lastIndexOf('\n')
    const out = { status: Number(r.stdout.slice(i + 1)), body: r.stdout.slice(0, i) }
    // the rendered page is evidence for the review: kept in --out
    if (save) writeFileSync(join(o.out, save), out.body)
    return out
  }

  // First seed: installs CF7, builds the form from the section, fills the module patterns.
  const s1 = seed('first')
  await check('seed', 'the first seed exits 0 and builds one Contact Form 7 form', () => {
    expect(s1.code === 0, `exit ${s1.code}: ${s1.stderr.slice(-1500)}`)
    same(s1.report?.counts?.forms, { created: 1, updated: 0, skipped: 0 }, 'counts.forms')
    const cf7 = wp.json(['plugin', 'list', '--name=contact-form-7', '--fields=name,status,version'])
    same(cf7?.[0]?.status, 'active', 'Contact Form 7')
    return { forms: s1.report.counts.forms, pages: s1.report.counts.pages, cf7: cf7[0].version }
  })
  // The seeder's form by its title: CF7 creates a sample "Contact form 1" of its own on activation.
  const formId = Number(wp.phpEval(`$p=array_values(array_filter(get_posts(array('post_type'=>'wpcf7_contact_form','post_status'=>'any','numberposts'=>-1)),function($x){return $x->post_title==='Contact';}));echo count($p)===1?$p[0]->ID:0;`).trim())
  const home = idOf('home')
  const contactPage = idOf('contact')

  // M6-11: the star as CF7 renders it.
  await check('M6-11', 'the stored form wraps every required star in span.wtb-form__required, the optional field has none', () => {
    expect(formId > 0, 'not exactly one Contact Form 7 form titled Contact on the site')
    const form = wp.out(['post', 'meta', 'get', String(formId), '_form'], { mutate: false })
    for (const name of ['Name', 'Email', 'Subject', 'Message']) expect(new RegExp(`<label class="wtb-form__field"> ${name} <span class="wtb-form__required" aria-hidden="true">\\*</span>`).test(form), `${name}: ${form.slice(0, 600)}`)
    expect(/<label class="wtb-form__field"> Phone\n/.test(form), `Phone: ${form}`)
    expect(/\[text\* name\]/.test(form) && /\[email\* email\]/.test(form) && /\[textarea\* message\]/.test(form) && /\[tel phone\]/.test(form), `CF7 tags: ${form}`)
    return form
  })
  await check('M6-11', 'the contact page renders the star inside the label as an element, after CF7 and its sanitising', () => {
    const r = get('/contact/', 'contact.html')
    same(r.status, 200, 'GET /contact/')
    const labels = [...r.body.matchAll(/<label class="wtb-form__field">([\s\S]*?)<\/label>/g)].map((m) => m[1])
    same(labels.length, 5, 'labels')
    const stars = labels.map((l) => (l.match(/<span class="wtb-form__required" aria-hidden="true">\*<\/span>/g) ?? []).length)
    same(stars, [1, 1, 1, 1, 0], 'stars per label (Name, Email, Subject, Message, Phone)')
    for (const l of labels) expect(!/(^|>)\s*[^<]*\*\s*(<br|<span class="wpcf7-form-control-wrap)/.test(l.replace(/<span class="wtb-form__required"[^>]*>\*<\/span>/g, '')), `a bare star is left in ${l.slice(0, 200)}`)
    expect(/aria-required="true"/.test(r.body), 'CF7 no longer marks the required fields')
    return labels.map((l) => l.replace(/\s+/g, ' ').slice(0, 160))
  })

  // M6-12: the breaks in the rendered page and in the stored blocks.
  await check('M6-12', 'a field\'s bare <br> renders as a break in the heading and in the composed, repeated paragraph', () => {
    const r = get('/', 'home.html')
    same(r.status, 200, 'GET /')
    expect(/<h2 class="wp-block-heading t-desc">Meet the Minds <br ?\/?>Behind Our Success<\/h2>/.test(r.body), `heading: ${(/<h2[^>]*t-desc[^>]*>[\s\S]*?<\/h2>/.exec(r.body) ?? ['none'])[0]}`)
    // WordPress adds its own block class to the paragraph (wp-block-paragraph, WordPress 7)
    expect(/<p class="avatar-title[^"]*"><span class="accent">20K\+<\/span> USERS HAVE SIGNED UP TO GROW <br ?\/?>ON THEIR TERMS<\/p>/.test(r.body), `avatar title: ${(/<p class="avatar-title[^"]*">[\s\S]*?<\/p>/.exec(r.body) ?? ['none'])[0]}`)
    expect(!/&lt;br\s*\/?&gt;/i.test(r.body), 'a bare break printed as text')
    return [...r.body.matchAll(/<(h2|p) class="(?:wp-block-heading t-desc|avatar-title[^"]*)">[\s\S]*?<\/\1>/g)].map((m) => m[0])
  })
  await check('M6-12', 'markup in a field that is not a bare <br> renders as text, and the block around it holds', () => {
    const r = get('/')
    const para = [...r.body.matchAll(/<p class="avatar-title[^"]*">([\s\S]*?)<\/p>/g)].map((m) => m[1])
    same(para.length, 2, 'avatar titles')
    // the words as text (wptexturize curls the quotes and the comment's dashes on output; the tags stay escaped)
    expect(/^x &lt;br onclick=\S+alert\(37\)\S+&gt; y &lt;script&gt;alert\(37\)&lt;\/script&gt; &lt;!\S+ \/wp:paragraph \S+&gt; z$/.test(para[1]), `second title: ${para[1]}`)
    expect(!/<script>alert\(37\)/.test(r.body) && !/<br onclick/.test(r.body), 'hostile markup executed')
    return para[1]
  })
  await check('M6-12', 'parse_blocks → serialize_blocks gives the stored page content back', () => {
    for (const id of [home, contactPage]) {
      const v = JSON.parse(wp.phpEval(`$c=get_post(${id})->post_content;$b=parse_blocks($c);echo json_encode(array('same'=>serialize_blocks($b)===$c,'blocks'=>count(array_filter($b,function($x){return $x['blockName']!==null;}))));`))
      expect(v.same, `page ${id}: serialize_blocks(parse_blocks()) differs`)
    }
    const c = content(home)
    writeFileSync(join(o.out, 'home.post_content.html'), c)
    expect(c.includes('Meet the Minds <br>Behind Our Success'), 'the stored heading has no <br>')
    expect(!/<script|<br onclick/.test(c), 'hostile markup stored as markup')
  })

  // Second seed: nothing changes.
  const before = stamps()
  const s2 = seed('second')
  await check('seed', 'a second seed writes nothing: forms and pages +0 ~0, the same ids and contents', () => {
    expect(s2.code === 0, `exit ${s2.code}: ${s2.stderr.slice(-1500)}`)
    same(s2.report?.counts?.forms, { created: 0, updated: 0, skipped: 1 }, 'counts.forms')
    const pages = s2.report?.counts?.pages
    same([pages?.created, pages?.updated], [0, 0], 'counts.pages created/updated')
    same(stamps(), before, 'pages and forms (id, slug, modified, content)')
    expect(/forms \+0 ~0/.test(s2.stdout + s2.stderr), 'the seed line does not say forms +0 ~0')
    return { forms: s2.report.counts.forms, pages }
  })

  // The block editor: every block valid, the heading's break read as rich text, an edit saved.
  await check('M6-12', 'the block editor reads the page as valid blocks and an edit to the broken heading is saved and rendered', async () => {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      page.setDefaultTimeout(Math.min(90000, Math.max(10000, deadline - Date.now())))
      await page.goto(`${url}/wp-login.php`)
      await page.fill('#user_login', ADMIN)
      await page.fill('#user_pass', password)
      // The dashboard's `load` waits on its widgets (feeds from wordpress.org): the login is done
      // once the redirect commits; the editor is where the proof is.
      await Promise.all([page.waitForURL(/wp-admin/, { waitUntil: 'commit' }), page.click('#wp-submit')]).catch(async (e) => {
        throw new Error(`login did not reach wp-admin (at ${page.url()}: ${(await page.textContent('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}): ${e.message.split('\n')[0]}`)
      })
      await page.goto(`${url}/wp-admin/post.php?post=${home}&action=edit`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0)
      const blocks = await page.evaluate(() => {
        const out = []
        const walk = (bs) => {
          for (const b of bs) {
            const c = b.attributes?.content
            out.push({ clientId: b.clientId, name: b.name, isValid: b.isValid, content: c == null ? null : String(c), className: b.attributes?.className ?? null })
            walk(b.innerBlocks ?? [])
          }
        }
        walk(window.wp.data.select('core/block-editor').getBlocks())
        return out
      })
      const invalid = blocks.filter((b) => !b.isValid)
      expect(!invalid.length, `invalid blocks: ${JSON.stringify(invalid)}`)
      const h = blocks.find((b) => b.name === 'core/heading' && b.className === 't-desc')
      expect(h && /^Meet the Minds <br>Behind Our Success$/.test(h.content), `heading content: ${JSON.stringify(h)}`)
      // The owner changes the words, keeps a break: saved through the editor, rendered on the site.
      await page.evaluate(
        ([id]) => {
          window.wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { content: 'Meet the Team <br>Behind Our Work' })
          return window.wp.data.dispatch('core/editor').savePost()
        },
        [h.clientId]
      )
      await page.waitForFunction(() => !window.wp.data.select('core/editor').isSavingPost() && !window.wp.data.select('core/editor').isEditedPostDirty())
      const r = get('/', 'home-after-edit.html')
      expect(/<h2 class="wp-block-heading t-desc">Meet the Team <br ?\/?>Behind Our Work<\/h2>/.test(r.body), `after the edit: ${(/<h2[^>]*t-desc[^>]*>[\s\S]*?<\/h2>/.exec(r.body) ?? ['none'])[0]}`)
      return { blocks: blocks.length, heading: h.content }
    } finally {
      await browser.close()
    }
  })
  return results.every((r) => r.ok) ? 0 : 1
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().then((code) => (process.exitCode = code))
