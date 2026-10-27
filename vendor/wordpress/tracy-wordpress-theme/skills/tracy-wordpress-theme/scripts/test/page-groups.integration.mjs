#!/usr/bin/env node
// The page-group pipeline end to end, on Docker, from the recipe in references/build-subagents.md §Parallel page groups
// (each step below is the recipe block of that name, extracted and run as written):
//
//   seed        one immutable seed pack: a fresh WordPress from the LOCAL image, packed with pack.mjs
//   stands      main, g1, g2 — three compose projects restored from that one pack (no pull, no wordpress.org)
//   groups      each group, on its own stand: measure the baseline (verdict must NOT be done), apply ONE content record and
//               ONE owned template, build + seed, assert its own stand serves both, measure four stages → group-verdict `done`
//   controls    a site contract or another group's evidence never closes a group; a group's dossier never runs a checkpoint
//   merge       group-merge.mjs keeps BOTH groups' changes (and a second merge is refused: baseline drift)
//   integration ONE build + seed on the main stand: it serves both changes; the full four-stage checkpoint passes on the main contract
//
// The fixture is a small block theme built by a minimal generator package (scripts/test/lib/page-groups-fixture.mjs) — the
// Tracy generator package is not part of this repository. Minutes and UTC times of every step go to <scratch>/report.json.
// Every compose project is removed with `down -v` at the end, after a failure and on SIGINT/SIGTERM.
//
// Not part of `npm test` (Docker, Chromium, ~10-20 min). Usage:
//   node scripts/test/page-groups.integration.mjs --scratch <dir> --project-prefix <prefix> [--timeout 2400]
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import nodeHttp from 'node:http'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GAMMA_SOURCE_ROUTE, MOVED, OVERLAY, PAGES, PKG, SLUG, SPEC, TASK, TEXT, manifest, pageTemplate, sourcePage, writeFixture } from './lib/page-groups-fixture.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.resolve(HERE, '..', '..')
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : dflt
}
const usage = 'usage: page-groups.integration.mjs --scratch <dir> --project-prefix <prefix> [--timeout 2400]'
const scratchArg = arg('--scratch')
const PREFIX = arg('--project-prefix')
if (!scratchArg || !PREFIX || !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(PREFIX)) {
  console.error(usage)
  process.exit(2)
}
const SCRATCH = path.resolve(scratchArg)
const TIMEOUT = Number(arg('--timeout', '2400'))
const until = Date.now() + TIMEOUT * 1000
const PW = randomBytes(9).toString('hex')
const PROJECT = { main: `${PREFIX}-main`, g1: `${PREFIX}-g1`, g2: `${PREFIX}-g2` }
const IMAGES = ['mariadb:11', 'wordpress:apache', 'wordpress:cli']
const LOG = path.join(SCRATCH, 'integration.log')
const log = (s) => appendFileSync(LOG, s.endsWith('\n') ? s : s + '\n')
const utc = () => new Date().toISOString()
const steps = []
const groupSteps = []
const bare = (x) => (x.length > 1 ? x.replace(/\/+$/, '') : x)
const checks = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, note = '') {
  checks.push({ name, ok: Boolean(ok), note })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
  if (!ok) throw new Error(`check failed: ${name}${note ? ` (${note})` : ''}`)
}

/** Run a command; resolves { status, stdout, stderr }. Output goes to the log (the password masked). */
function exec(cmd, args, { env = {}, cwd, input, timeout = 900, label = cmd } = {}) {
  return new Promise((resolve) => {
    if (Date.now() > until) return resolve({ status: 124, stdout: '', stderr: `integration timed out after ${TIMEOUT}s before ${label}` })
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const cap = (s, t) => (s + t).slice(-400000)
    child.stdout.on('data', (d) => (stdout = cap(stdout, d)))
    child.stderr.on('data', (d) => (stderr = cap(stderr, d)))
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.min(timeout * 1000, Math.max(1000, until - Date.now())))
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      const mask = (t) => t.split(PW).join('<pw>')
      log(`$ ${label}\n→ ${status ?? signal}\n${mask(stdout).slice(-6000)}${mask(stderr).slice(-6000)}`)
      resolve({ status: status ?? 128, stdout, stderr })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ status: 127, stdout, stderr: String(e.message) })
    })
    child.stdin.end(input ?? '')
  })
}

// ───────────────────────────────────────────────────────────── the documented recipe
const doc = readFileSync(path.join(SKILL, 'references', 'build-subagents.md'), 'utf8')
function block(name) {
  const m = new RegExp(`<!-- recipe:${name} -->\\n\`\`\`bash\\n([\\s\\S]*?)\\n\`\`\`\\n<!-- recipe:${name}-end -->`).exec(doc)
  if (!m) throw new Error(`references/build-subagents.md has no recipe:${name} block`)
  return m[1]
}
const RECIPE = Object.fromEntries(['stand', 'build-seed', 'measure', 'parity', 'verdict', 'merge', 'integration'].map((n) => [n, block(n)]))
/** Run recipe block `name` as written, with `env` exported. */
const recipe = (name, env, label) => exec('bash', ['-c', RECIPE[name]], { env, timeout: 1500, label: label ?? `recipe:${name}` })

// ───────────────────────────────────────────────────────────── steps and minutes
async function step(name, fn) {
  const start = Date.now()
  const entry = { name, start: utc(), end: null, minutes: null, ok: false }
  steps.push(entry)
  console.log(`==> ${name}`)
  try {
    const r = await fn()
    entry.ok = true
    return r
  } finally {
    entry.end = utc()
    entry.minutes = Math.round(((Date.now() - start) / 60000) * 100) / 100
    console.log(`    ${name}: ${entry.minutes} min`)
  }
}
const mustOk = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().slice(-1200)}`)
  return r
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

// ───────────────────────────────────────────────────────────── layout
const T = {
  base: path.join(SCRATCH, 'trees', 'base'),
  main: path.join(SCRATCH, 'trees', 'main'),
  g1: path.join(SCRATCH, 'trees', 'g1'),
  g2: path.join(SCRATCH, 'trees', 'g2')
}
const SEED = path.join(SCRATCH, 'seed-pack')
const IMG = path.join(SCRATCH, 'images')
const stand = (id, port) => ({ id, project: PROJECT[id], port, tree: T[id], D: path.join(SCRATCH, 'dossiers', id), url: `http://127.0.0.1:${port}` })
// The seeder reports a page at its page-map path (it moves a route only for a secondary locale under Polylang, a plugin the local
// images do not carry). The fixture's `zeta` page really is served at /our-zeta/ (its slug), so the hook the recipe runs after the seed
// writes the route the way the seeder writes a moved one — `{ path: <served>, pagemapPath }` — after it has read the page there.
const POST_SEED = path.join(SCRATCH, 'post-seed.mjs')
const POST_SEED_SRC = `import { readFileSync, writeFileSync } from 'node:fs'
const [pm, served, words] = ${JSON.stringify([PAGES.zeta.path, MOVED.zeta, TEXT.zeta])}
const res = await fetch(\`http://127.0.0.1:\${process.env.PORT}\${served}\`, { redirect: 'manual' })
if (res.status !== 200 || !(await res.text()).includes(words)) { console.error('post-seed: ' + served + ' does not serve ' + pm + ' (' + res.status + ')'); process.exit(1) }
const file = process.env.D + '/seed.json'
const r = JSON.parse(readFileSync(file, 'utf8'))
const i = r.routes.findIndex((x) => x.path === pm)
if (i < 0) { console.error('post-seed: no route ' + pm + ' in the seed report'); process.exit(1) }
r.routes[i] = { ...r.routes[i], path: served, pagemapPath: pm, status: 200, location: null, canonical: null, expect: 200, ok: true }
writeFileSync(file, JSON.stringify(r, null, 2) + '\\n')
`
const envOf = (s, extra = {}) => ({
  POST_SEED,
  SKILL, PKG: path.join(s.tree, PKG), S: path.join(s.tree, TASK), SEED, IMAGES: IMG, D: s.D, P: s.project, PORT: String(s.port), PW, SLUG,
  // the pack's reference is the exported html: `s.src` serves its snapshot files, and the `url` pages' live routes with their EXPECTED pages (independent of the stand)
  SOURCE_SITE: s.src ?? s.url, SOURCE_DARK_HOOK: 'cookie:tracy_theme=dark',
  ...(s.id === 'main' ? {} : { G: s.id, GP: GROUP_PAGES[s.id] }), ...extra
})
// MIXED groups under a NON-HTTP pack default (`none`): g1 = html + none + a MOVED html page (asked by its seeded route),  g2 = html + url (gamma through a pair, epsilon without one) — each effective kind needs its own parity source mode
const GROUP_PAGES = { g1: `${PAGES.alpha.path},${PAGES.delta.path},${MOVED.zeta}`, g2: `${PAGES.beta.path},${PAGES.gamma.path},${PAGES.epsilon.path}` }
const PARITY_FILES = { g1: ['html'], g2: ['html', 'url'] }
const GROUP_FIX = {
  g1: { page: PAGES.alpha, draft: TEXT.alphaDraft, final: TEXT.alphaFinal, color: 'accent' },
  g2: { page: PAGES.beta, draft: TEXT.betaDraft, final: TEXT.betaFinal, color: 'accent-2' }
}

async function http(url, cookie) {
  const res = await fetch(url, { redirect: 'follow', headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(30000) })
  return { status: res.status, html: await res.text() }
}

// ───────────────────────────────────────────────────────────── source server
// A file of the stand's own spec/reference is served as is (the html source); any other path is the stand's.
const LIVE = { [GAMMA_SOURCE_ROUTE]: sourcePage('Gamma', TEXT.gamma, 'contrast', { live: true }), [PAGES.epsilon.path]: sourcePage('Epsilon', TEXT.epsilon, 'contrast', { live: true }) }
const sourceServers = []
function serveSource(s) {
  const root = path.join(s.tree, TASK, 'spec', 'reference')
  const server = nodeHttp.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
    // the live source answers on its own, with the EXPECTED page (not the stand's): gamma at the route pairs.json maps, epsilon at its own path
    const live = LIVE[new URL(req.url, 'http://x').pathname.replace(/\/+$/, '')]
    if (live) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(live)
    }
    const file = path.resolve(root, rel)
    if (rel && file.startsWith(root + path.sep) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' })
      return res.end(readFileSync(file))
    }
    // the source serves a moved page at its PAGE-MAP route (/zeta); the stand serves it where the seed put it (/our-zeta/)
    const asked = new URL(req.url, 'http://x')
    const upstream = asked.pathname.replace(/(.)\/+$/, '$1') === PAGES.zeta.path ? `${MOVED.zeta}${asked.search}` : req.url
    const up = nodeHttp.request(new URL(upstream, s.url), { method: req.method, headers: { ...req.headers, host: new URL(s.url).host } }, (r) => {
      // WordPress canonicalises to its own origin; the source keeps the visitor on the source origin
      const headers = { ...r.headers }
      if (headers.location) headers.location = headers.location.replace(s.url, s.src)
      res.writeHead(r.statusCode, headers)
      r.pipe(res)
    })
    up.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(up)
  })
  sourceServers.push(server)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { s.src = `http://127.0.0.1:${server.address().port}`; resolve() }))
}

// ───────────────────────────────────────────────────────────── teardown
let toreDown = null
/** Resolves the problems of the teardown (a failed `down -v`, a container or volume left): any one fails the gate. */
function teardown() {
  toreDown ??= doTeardown()
  return toreDown
}
async function doTeardown() {
  const t0 = Date.now()
  const entry = { name: 'teardown (down -v)', start: utc(), end: null, minutes: null, ok: false }
  steps.push(entry)
  const problems = []
  for (const sv of sourceServers) sv.close()
  console.log('==> teardown (down -v)')
  for (const id of ['main', 'g1', 'g2']) {
    const D = path.join(SCRATCH, 'dossiers', id)
    const files = [path.join(D, 'compose.yml'), path.join(SCRATCH, 'seed-build', 'compose.yml')].filter((f) => existsSync(f))
    for (const f of files) {
      const r = spawnSync('docker', ['compose', '-p', PROJECT[id], '-f', f, 'down', '-v', '--remove-orphans', '--timeout', '5'], { encoding: 'utf8', env: { ...process.env, PW, PORT: '1', D, P: PROJECT[id], IMAGES: IMG, WEBROOT: path.join(SCRATCH, 'seed-build', 'webroot') }, timeout: 120000 })
      log(`$ down -v ${PROJECT[id]} (${path.basename(path.dirname(f))}) → ${r.status}\n${(r.stderr || '').slice(-600)}`)
      if (r.status !== 0) problems.push(`down -v ${PROJECT[id]} (${path.basename(path.dirname(f))}) exited ${r.status}`)
    }
  }
  // what is left of the three owned projects, by label
  const left = spawnSync('sh', ['-c', `docker ps -aq --filter label=com.docker.compose.project=${PREFIX}-main --filter label=com.docker.compose.project=${PREFIX}-g1 --filter label=com.docker.compose.project=${PREFIX}-g2; docker volume ls -q | grep '^${PREFIX}-' || true`], { encoding: 'utf8' })
  log(`left after down -v: ${JSON.stringify((left.stdout || '').trim())}`)
  const vols = spawnSync('sh', ['-c', `docker volume ls -q | grep '^${PREFIX}-' || true`], { encoding: 'utf8' }).stdout.trim()
  const ctrs = spawnSync('sh', ['-c', `for p in main g1 g2; do docker ps -aq --filter label=com.docker.compose.project=${PREFIX}-$p; done`], { encoding: 'utf8' }).stdout.trim()
  rmSync(path.join(SCRATCH, 'seed-build', 'webroot'), { recursive: true, force: true })
  writeFileSync(path.join(SCRATCH, 'teardown.json'), JSON.stringify({ at: utc(), volumesLeft: vols ? vols.split('\n') : [], containersLeft: ctrs ? ctrs.split('\n') : [] }, null, 2) + '\n')
  if (vols) problems.push(`volumes left: ${vols.split('\n').join(', ')}`)
  if (ctrs) problems.push(`containers left: ${ctrs.split('\n').join(', ')}`)
  entry.end = utc()
  entry.minutes = Math.round(((Date.now() - t0) / 60000) * 100) / 100
  entry.ok = problems.length === 0
  console.log(problems.length ? `TEARDOWN FAILED: ${problems.join('; ')}` : 'teardown: no container or volume of the three projects is left')
  return problems
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => teardown().finally(() => process.exit(sig === 'SIGINT' ? 130 : 143)))

// ───────────────────────────────────────────────────────────── the run
async function main() {
  rmSync(SCRATCH, { recursive: true, force: true })
  mkdirSync(SCRATCH, { recursive: true })
  writeFileSync(LOG, `# ${PREFIX} ${utc()}\n`)
  mkdirSync(IMG, { recursive: true })
  writeFileSync(POST_SEED, POST_SEED_SRC)

  await step('preflight: docker, local images, disk', async () => {
    mustOk(await exec('docker', ['version', '--format', '{{.Server.Os}} {{.Server.Version}}'], { timeout: 30 }), 'docker is not reachable — this check is not a pass without it:')
    for (const img of IMAGES) check(`image ${img} is in the local cache (nothing is pulled)`, (await exec('docker', ['image', 'inspect', img, '--format', '{{.Id}}'], { timeout: 30 })).status === 0)
    const df = spawnSync('df', ['-k', SCRATCH], { encoding: 'utf8' }).stdout.trim().split('\n').pop().split(/\s+/)
    check('disk has at least 6 GB free', Number(df[3]) > 6 * 1024 * 1024, `${Math.round(Number(df[3]) / 1048576)} GB`)
    check('the three owned projects do not exist yet', (await exec('sh', ['-c', `docker ps -aq --filter label=com.docker.compose.project=${PROJECT.main} --filter label=com.docker.compose.project=${PROJECT.g1} --filter label=com.docker.compose.project=${PROJECT.g2}`], { timeout: 30 })).stdout.trim() === '')
  })

  await step('fixture: baseline tree and one worktree each for main, g1, g2', async () => {
    writeFixture(T.base)
    for (const id of ['main', 'g1', 'g2']) cpSync(T.base, T[id], { recursive: true })
    for (const id of ['main', 'g1', 'g2']) mkdirSync(path.join(SCRATCH, 'dossiers', id), { recursive: true })
    check('three worktrees cut from one baseline', ['main', 'g1', 'g2'].every((id) => existsSync(path.join(T[id], SPEC, 'content.json'))))
  })

  await step('seed: one immutable seed pack from a fresh WordPress (local image)', async () => {
    const dir = path.join(SCRATCH, 'seed-build')
    const webroot = path.join(dir, 'webroot')
    mkdirSync(webroot, { recursive: true })
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    writeFileSync(path.join(dir, 'compose.yml'), `x-db: &db { WORDPRESS_DB_HOST: db, WORDPRESS_DB_USER: root, WORDPRESS_DB_PASSWORD: "\${PW}", WORDPRESS_DB_NAME: wp, WORDPRESS_TABLE_PREFIX: tr_ }
services:
  db:  { image: "mariadb:11", pull_policy: never, environment: { MARIADB_ROOT_PASSWORD: "\${PW}", MARIADB_DATABASE: wp }, volumes: ["db:/var/lib/mysql"] }
  web: { image: "wordpress:apache", pull_policy: never, depends_on: [db], ports: ["127.0.0.1:${port}:80"], volumes: ["\${WEBROOT}:/var/www/html"], environment: *db }
  cli: { image: "wordpress:cli", pull_policy: never, depends_on: [db], entrypoint: ["wp"], user: "33:33", environment: *db, volumes: ["\${WEBROOT}:/var/www/html"] }
volumes: { db: { name: "${PROJECT.main}_seeddb" } }
`)
    const env = { PW, WEBROOT: webroot, PORT: String(port), D: dir, IMAGES: IMG }
    const dc = (args, o = {}) => exec('docker', ['compose', '-p', PROJECT.main, '-f', path.join(dir, 'compose.yml'), ...args], { env, ...o, label: `compose ${args.slice(0, 4).join(' ')}` })
    mustOk(await dc(['up', '-d', '--pull', 'never', 'db', 'web'], { timeout: 300 }), 'seed stand up')
    const t0 = Date.now()
    while (!(existsSync(path.join(webroot, 'wp-includes', 'version.php')) && existsSync(path.join(webroot, 'wp-config.php')))) {
      if (Date.now() - t0 > 180000) throw new Error('the seed stand never wrote its webroot')
      await sleep(1000)
    }
    const wp = (args, o = {}) => dc(['run', '--rm', '-T', 'cli', ...args], o)
    let installed = false
    for (let i = 0; i < 40 && !installed; i++) {
      installed = (await wp(['core', 'install', `--url=${url}`, '--title=Fix', '--admin_user=tracyagent', '--admin_password=x', '--admin_email=fix@example.invalid', '--skip-email'], { timeout: 120 })).status === 0
      if (!installed) await sleep(3000)
    }
    check('the seed stand installed WordPress without a download', installed)
    mustOk(await wp(['rewrite', 'structure', '/%postname%/', '--hard']), 'permalinks')
    mustOk(await wp(['rewrite', 'flush', '--hard']), 'rewrite flush')
    const runner = `docker compose -p ${PROJECT.main} -f ${path.join(dir, 'compose.yml')} run --rm -T cli`
    const packed = await exec(process.execPath, [path.join(SKILL, 'scripts', 'quickstart', 'pack.mjs'), '--webroot', webroot, '--wp', runner, '--site-url', url, '--out', SEED, '--id', 'fix/seed', '--version', '1.0.0', '--prefix', 'tr_'], { env, label: 'pack.mjs' })
    mustOk(packed, 'pack.mjs')
    check('the seed pack is complete', ['manifest.json', 'SHA256SUMS'].every((f) => existsSync(path.join(SEED, f))))
    mustOk(await dc(['down', '-v', '--remove-orphans', '--timeout', '5'], { timeout: 120 }), 'seed stand down -v')
    rmSync(webroot, { recursive: true, force: true })
  })

  const ports = { main: await freePort(), g1: await freePort(), g2: await freePort() }
  const S = { main: stand('main', ports.main), g1: stand('g1', ports.g1), g2: stand('g2', ports.g2) }
  for (const s of Object.values(S)) await serveSource(s)

  // ── three stands, one seed ──
  await step('stands: main, g1, g2 restored from the one seed pack (recipe:stand, no pull, offline checksums)', async () => {
    const rs = await Promise.all(Object.values(S).map((s) => recipe('stand', envOf(s), `recipe:stand ${s.id}`)))
    rs.forEach((r, i) => mustOk(r, `recipe:stand ${Object.keys(S)[i]}`))
    for (const s of Object.values(S)) {
      const rep = readJson(path.join(s.D, 'restore.json'))
      check(`${s.id}: restore ok, core checksums skipped offline, same pack`, rep.ok === true && rep.offlineChecksums === true && rep.steps.some((x) => x.name === 'core-checksums' && x.offline), rep.id ?? '')
    }
    const manifests = new Set(Object.values(S).map((s) => readJson(path.join(s.D, 'restore.json')).binding?.manifest))
    check('all three stands restored the same pack bytes (one manifest hash)', manifests.size === 1 && !manifests.has(undefined), [...manifests].join(','))
    const all = readFileSync(LOG, 'utf8')
    check('no request to wordpress.org in any restore or seed output', !/api\.wordpress\.org|downloads\.wordpress\.org/.test(all))
  })

  await step('main: baseline build + seed + site contract (recipe:build-seed, no group)', async () => {
    mustOk(await recipe('build-seed', envOf(S.main), 'recipe:build-seed main (baseline)'), 'build-seed main')
    const c = readJson(path.join(S.main.D, 'visual.contract.json'))
    check('the main contract is the site contract: every page of the pack, no group', c.pages.length === Object.keys(PAGES).length && c.group === undefined, c.pages.map((p) => p.id).join(','))
  })

  // ── each group on its own stand, in parallel ──
  const verdictOf = async (s, n, env = {}) => {
    const r = await recipe('verdict', envOf(s, { N: String(n), ...env }), `recipe:verdict ${s.id} #${n}`)
    const file = path.join(s.D, 'runs', `verdict-${n}.json`)
    return { status: r.status, verdict: existsSync(file) ? readJson(file) : null, stderr: r.stderr }
  }
  const groupRun = async (id) => {
    const s = S[id]
    const fix = GROUP_FIX[id]
    const t = {}
    const lap = async (name, fn) => {
      const t0 = Date.now()
      const entry = { group: id, name, start: utc(), end: null, minutes: null }
      groupSteps.push(entry)
      try {
        return await fn()
      } finally {
        entry.end = utc()
        entry.minutes = Math.round(((Date.now() - t0) / 60000) * 100) / 100
        t[name] = entry.minutes
      }
    }
    await lap('build-seed baseline', async () => mustOk(await recipe('build-seed', envOf(s), `recipe:build-seed ${id} (baseline)`), `build-seed ${id}`))
    const gc = readJson(path.join(s.D, 'visual.contract.json'))
    check(`${id}: its contract is its own — group ${id}, only ${GROUP_PAGES[id]}, bound to its stand`, gc.group?.id === id && gc.pages.length === GROUP_PAGES[id].split(',').length && Boolean(gc.group.dossier) && Boolean(gc.bindings.seedReportHash) && Boolean(gc.bindings.artifactHash), `${gc.pages.map((p) => p.id)}`)
    // negative control: the baseline is not done
    await lap('measure baseline', async () => mustOk(await recipe('measure', envOf(s, { N: '0' }), `recipe:measure ${id} #0`), `measure ${id} #0`))
    await lap('parity baseline', async () => mustOk(await recipe('parity', envOf(s, { N: '0' }), `recipe:parity ${id} #0`), `parity ${id} #0`))
    const before = await lap('verdict baseline', () => verdictOf(s, 0))
    check(`${id}: the baseline is NOT done (the verdict is not vacuous)`, before.verdict && before.verdict.verdict !== 'done', `${before.verdict?.verdict}: ${(before.verdict?.open ?? []).length} open`)
    // the group's fix: ONE content record and ONE owned file, in its own worktree
    const contentFile = path.join(s.tree, SPEC, 'content.json')
    const content = readJson(contentFile)
    const rec = content.pages.find((p) => p.path === fix.page.path)
    rec.content = rec.content.replace(fix.draft, fix.final)
    writeFileSync(contentFile, JSON.stringify(content, null, 2) + '\n')
    writeFileSync(path.join(s.tree, OVERLAY, 'templates', `page-${fix.page.slug}.html`), pageTemplate(fix.color))
    await lap('build-seed fix', async () => mustOk(await recipe('build-seed', envOf(s), `recipe:build-seed ${id} (fix)`), `build-seed ${id} (fix)`))
    const served = await http(`${s.url}${fix.page.path}/`)
    check(`${id}: its own stand serves the content fix and the owned template`, served.status === 200 && served.html.includes(fix.final) && !served.html.includes(fix.draft) && served.html.includes(`has-${fix.color}-color`), `${served.status}`)
    await lap('measure', async () => mustOk(await recipe('measure', envOf(s, { N: '1' }), `recipe:measure ${id} #1`), `measure ${id} #1`))
    await lap('parity', async () => mustOk(await recipe('parity', envOf(s, { N: '1' }), `recipe:parity ${id} #1`), `parity ${id} #1`))
    const after = await lap('verdict', () => verdictOf(s, 1))
    check(`${id}: group-verdict = done on its own stand`, after.status === 0 && after.verdict?.verdict === 'done', `${after.verdict?.verdict} ${JSON.stringify(after.verdict?.incomplete ?? [])} ${JSON.stringify((after.verdict?.open ?? []).slice(0, 3))}`)
    // HTTP parity is part of the closure of an html group: its route reached the page, and without its file the group is not done
    const kinds = PARITY_FILES[id]
    const files = kinds.map((k) => path.join(s.D, 'runs', `parity-1-${k}.json`))
    check(`${id}: one parity run per reference kind of the group (${kinds.join(' + ')}), none for its none page`, files.every(existsSync) && readdirSync(path.join(s.D, 'runs')).filter((f) => /^parity-1-.*\.json$/.test(f)).length === kinds.length, readdirSync(path.join(s.D, 'runs')).join(','))
    const routes = files.flatMap((f) => readJson(f).routes ?? [])
    const httpPages = id === 'g1' ? [PAGES.alpha.path, MOVED.zeta] : [PAGES.beta.path, PAGES.gamma.path, PAGES.epsilon.path]
    check(`${id}: HTTP parity reached every html/url page of the group and passed; the none page has no route`, routes.length === httpPages.length && httpPages.every((p) => routes.some((r) => bare(r.targetPath) === bare(p) && r.ok === true)) && after.verdict?.parityScope?.http?.length === httpPages.length && after.verdict?.parityScope?.none?.length === (id === 'g1' ? 1 : 0), `${routes.map((r) => `${r.route} → ${r.targetPath} ok=${r.ok}`)} ${JSON.stringify(after.verdict?.parityScope)}`)
    if (id === 'g1') {
      // the MOVED page: the page-map says /zeta, the stand serves /our-zeta/; the plan, the parity run and the verdict all use the served route
      const plan = readJson(path.join(s.D, 'runs', 'plan-1', 'route-plan.json')).pages
      const z = plan.find((x) => x.pagemapPath === PAGES.zeta.path)
      check('g1: route plan — the moved page lands at its seeded route, read from its exported file', z?.path === MOVED.zeta && z.kind === 'html' && z.sourceRoute === `/${PAGES.zeta.file}`, JSON.stringify(z))
      const seededRoute = readJson(path.join(s.D, 'seed.json')).routes.find((r) => r.pagemapPath === PAGES.zeta.path)
      check('g1: the seed report names the moved route and the stand serves the page there', seededRoute?.path === MOVED.zeta && (await http(`${s.url}${MOVED.zeta}`)).html.includes(TEXT.zeta), JSON.stringify(seededRoute))
      check('g1: parity read the exported file and landed on the seeded route', routes.some((r) => r.route === `/${PAGES.zeta.file}` && bare(r.targetPath) === bare(MOVED.zeta) && r.ok), routes.map((r) => `${r.route}→${r.targetPath}`).join(','))
      // a report measured only at the obsolete page-map path /zeta is no evidence for the page served at /our-zeta/
      const stale = readJson(files[0])
      for (const r of stale.routes) if (bare(r.targetPath) === bare(MOVED.zeta)) r.targetPath = PAGES.zeta.path
      writeFileSync(`${files[0]}.obsolete`, JSON.stringify(stale))
      const obsolete = await exec('bash', ['-c', RECIPE.verdict.replace('"$D/runs/parity-$N"-*.json', `"${files[0]}.obsolete"`).replace('--out "$D/runs/verdict-$N.json"', `--out "${path.join(s.D, 'runs', 'verdict-obsolete.json')}"`)], { env: envOf(s, { N: '1' }), label: `verdict ${id} with parity at the obsolete route` })
      check('g1: parity measured only at the obsolete page-map path /zeta is not done', obsolete.status === 3 && /parity: no route reached \/our-zeta/.test(readFileSync(path.join(s.D, 'runs', 'verdict-obsolete.json'), 'utf8')), `exit ${obsolete.status}`)
    }
    if (id === 'g2') {
      // the route plan: gamma is read at its own source route, epsilon (no pair) at its own path, both landing at the seeded target
      const plan = readJson(path.join(s.D, 'runs', 'plan-1', 'route-plan.json')).pages
      const planOf = (p) => plan.find((x) => x.pagemapPath === p)
      check('g2: route plan — gamma from its pair route, epsilon from its own path (no pairs.json entry), html page from its exported file', planOf(PAGES.gamma.path)?.sourceRoute === GAMMA_SOURCE_ROUTE && planOf(PAGES.epsilon.path)?.sourceRoute === PAGES.epsilon.path && planOf(PAGES.beta.path)?.sourceRoute === `/${PAGES.beta.file}`, JSON.stringify(plan.map((x) => [x.pagemapPath, x.kind, x.sourceRoute, x.path])))
      check('g2: parity read gamma at its source route and epsilon at its own, each landing on the seeded target', routes.some((r) => r.route === GAMMA_SOURCE_ROUTE && r.targetPath === PAGES.gamma.path && r.ok) && routes.some((r) => r.route === PAGES.epsilon.path && r.targetPath === PAGES.epsilon.path && r.ok), routes.map((r) => `${r.route}→${r.targetPath}`).join(','))
      // the expected source is independent of the stand's parity: the source origin answers the pair route with gamma's words
      const src = await http(`${s.src}${GAMMA_SOURCE_ROUTE}`)
      check('g2: the source origin serves gamma\'s expected content at the pair route', src.status === 200 && src.html.includes(TEXT.gamma), `${src.status}`)
      // …and it is its own page, not the stand's: the live source and the stand are two sites (the parity run compared two different pages)
      const standGamma = await http(`${s.url}${PAGES.gamma.path}/`)
      const srcEps = await http(`${s.src}${PAGES.epsilon.path}`)
      check('g2: the live url source is independent of the stand — its pages carry the source marker, the stand\'s do not', src.html.includes('independent-live') && srcEps.html.includes('independent-live') && srcEps.html.includes(TEXT.epsilon) && !standGamma.html.includes('independent-live') && routes.every((r) => r.route && r.targetPath), `${s.src} vs ${s.url}`)
      check('g2: every url row of the parity report was read from the live source origin', files.filter((f) => f.endsWith('-url.json')).every((f) => readJson(f).source === s.src), files.map((f) => readJson(f).source).join(','))
    }
    // each kind's parity file is needed: without one the same evidence is incomplete, never done
    for (const [i, pf] of files.entries()) {
      renameSync(pf, `${pf}.off`)
      const noParity = await verdictOf(s, 1)
      renameSync(`${pf}.off`, pf)
      check(`${id}: without its ${kinds[i]} parity run the same evidence is incomplete, never done`, noParity.status === 3 && /parity: (--parity is required|no route reached)/.test((noParity.verdict?.incomplete ?? []).join(' ')), `exit ${noParity.status}`)
    }
    // parity measured on ANOTHER stand, and a byte-identical copy of the contract, never close the group (the copy names the dossier it was cut from)
    const other = JSON.parse(JSON.stringify(readJson(files[0])))
    other.target = `http://127.0.0.1:${s.id === 'g1' ? S.g2.port : S.g1.port}`
    writeFileSync(`${files[0]}.other`, JSON.stringify(other))
    const wrongParity = await exec('bash', ['-c', RECIPE.verdict.replace('"$D/runs/parity-$N"-*.json', `"${files[0]}.other" "${files.slice(1).join('" "')}"`).replace('--out "$D/runs/verdict-$N.json"', `--out "${path.join(s.D, 'runs', 'verdict-parity.json')}"`)], { env: envOf(s, { N: '1' }), label: `verdict ${id} with parity of another stand` })
    check(`${id}: parity measured at another stand is not done`, wrongParity.status === 3 && /parity: measured at/.test(readFileSync(path.join(s.D, 'runs', 'verdict-parity.json'), 'utf8')), `exit ${wrongParity.status}`)
    mkdirSync(path.join(s.D, 'copy'), { recursive: true })
    cpSync(path.join(s.D, 'visual.contract.json'), path.join(s.D, 'copy', 'visual.contract.json'))
    const copied = await exec('bash', ['-c', RECIPE.verdict.replace('--contract "$D/visual.contract.json"', `--contract "${path.join(s.D, 'copy', 'visual.contract.json')}"`).replace('--out "$D/runs/verdict-$N.json"', `--out "${path.join(s.D, 'runs', 'verdict-copy.json')}"`)], { env: envOf(s, { N: '1' }), label: `verdict ${id} with a copy of the contract` })
    check(`${id}: a copy of the group contract is not the contract the run measured against`, copied.status === 3 && /not the canonical visual.contract.json of the dossier/.test(readFileSync(path.join(s.D, 'runs', 'verdict-copy.json'), 'utf8')), `exit ${copied.status}`)
    return { id, minutes: t, verdict: after.verdict }
  }
  const results = await step('groups: g1 and g2 in parallel — baseline, fix, serve, measure four stages, verdict', async () => {
    const out = await Promise.allSettled(['g1', 'g2'].map(groupRun))
    const bad = out.find((o) => o.status === 'rejected')
    if (bad) throw bad.reason
    return out.map((o) => o.value)
  })
  writeFileSync(path.join(SCRATCH, 'group-minutes.json'), JSON.stringify(results.map((r) => ({ id: r.id, minutes: r.minutes })), null, 2) + '\n')

  await step('controls: a site contract, another group\'s evidence and a group dossier never close or checkpoint anything', async () => {
    // g1's verdict asked with the MAIN stand's site contract
    const mainContract = path.join(S.main.D, 'visual.contract.json')
    const siteC = await exec('bash', ['-c', RECIPE.verdict.replace('--contract "$D/visual.contract.json"', `--contract "${mainContract}"`)], { env: envOf(S.g1, { N: '1' }), label: 'verdict g1 with the main contract' })
    check('g1 asked with the main stand\'s contract is not done (exit 3, "not a page group contract")', siteC.status === 3 && /not a page group contract/.test(readFileSync(path.join(S.g1.D, 'runs', 'verdict-1.json'), 'utf8')), `exit ${siteC.status}`)
    // g1's evidence put to g2's verdict
    const other = await exec('bash', ['-c', RECIPE.verdict.replace('--visual "$D/runs/$N"', `--visual "${path.join(S.g1.D, 'runs', '1')}"`).replace('--out "$D/runs/verdict-$N.json"', `--out "${path.join(S.g2.D, 'runs', 'verdict-x.json')}"`)], { env: envOf(S.g2, { N: '1' }), label: 'verdict g2 with g1 evidence' })
    check('g2 asked with g1\'s run is not done', other.status !== 0 && readJson(path.join(S.g2.D, 'runs', 'verdict-x.json')).verdict === 'incomplete', `exit ${other.status}`)
    // g1's verdict asked about another stand: the report was measured at g1's origin, not this one
    const wrongSite = await exec('bash', ['-c', RECIPE.verdict.replace('--out "$D/runs/verdict-$N.json"', `--out "${path.join(S.g1.D, 'runs', 'verdict-site.json')}"`)], { env: envOf(S.g1, { N: '1', PORT: String(S.g2.port) }), label: 'verdict g1 against the other stand' })
    check('g1 asked about another stand is not done (the report names g1\'s own origin)', wrongSite.status === 3 && /measured at .*the group's stand is|bound to .*this verdict is for the stand/.test(readFileSync(path.join(S.g1.D, 'runs', 'verdict-site.json'), 'utf8')), `exit ${wrongSite.status}`)
    // a checkpoint on a group dossier is refused
    const cfg = path.join(S.g1.D, 'round-control.json')
    writeFileSync(cfg, JSON.stringify({ runRoot: S.g1.D, evidence: path.join(S.g1.D, 'evidence'), site: S.g1.url, spec: path.join(S.g1.tree, SPEC), theme: path.join(S.g1.tree, PKG, 'src', SLUG), artifact: path.join(S.g1.D, 'install', `${SLUG}.zip`), seedReport: path.join(S.g1.D, 'seed.json'), stages: ['light-desktop'] }))
    const round = await exec(process.execPath, [path.join(SKILL, 'scripts', 'visual', 'round.mjs'), '--config', cfg, '--name', 'control', '--scope', 'full', '--skip-deploy'], { label: 'round on a group dossier' })
    const ledger = path.join(S.g1.D, 'evidence', 'rounds.jsonl')
    const line = existsSync(ledger) ? readFileSync(ledger, 'utf8') : ''
    check('a checkpoint on a group dossier is refused (page group\'s contract)', /page group g1/.test(round.stderr + round.stdout + line) && !/"complete":true/.test(line), `exit ${round.status}`)
  })

  await step('merge: group-merge keeps BOTH groups\' content and owned file; a second merge is refused', async () => {
    const manifestFile = path.join(SCRATCH, 'ownership.json')
    writeFileSync(manifestFile, JSON.stringify(manifest(), null, 2) + '\n')
    const report = path.join(S.main.D, 'merge-report.json')
    const env = { SKILL, BASE: T.base, MAIN: T.main, MANIFEST: manifestFile, MERGE_REPORT: report, GROUP_TREES: `g1=${T.g1}\ng2=${T.g2}` }
    mustOk(await recipe('merge', env, 'recipe:merge'), 'recipe:merge')
    const rep = readJson(report)
    const content = readJson(path.join(T.main, SPEC, 'content.json'))
    check('the merge report names both groups, their records and their files', rep.status === 'merged' && rep.groups.length === 2 && rep.groups.every((g) => g.changed && g.records.length === 1 && g.files.length === 1) && rep.noopGroups.length === 0, JSON.stringify(rep.groups.map((g) => [g.id, g.records.map((r) => r.key), g.files.map((f) => f.path)])))
    check('main spec keeps both content records', content.pages.find((p) => p.path === '/alpha').content.includes(TEXT.alphaFinal) && content.pages.find((p) => p.path === '/beta').content.includes(TEXT.betaFinal))
    check('main theme keeps both owned templates, shared files untouched', readFileSync(path.join(T.main, OVERLAY, 'templates', 'page-alpha.html'), 'utf8') === pageTemplate('accent') && readFileSync(path.join(T.main, OVERLAY, 'templates', 'page-beta.html'), 'utf8') === pageTemplate('accent-2') && readFileSync(path.join(T.main, OVERLAY, 'theme.json'), 'utf8') === readFileSync(path.join(T.base, OVERLAY, 'theme.json'), 'utf8'))
    const again = await recipe('merge', { ...env, MERGE_REPORT: path.join(S.main.D, 'merge-report-2.json') }, 'recipe:merge (second time)')
    check('a second merge is refused: baseline drift', again.status === 1 && /baseline-drift/.test(again.stderr), `exit ${again.status}`)
  })

  await step('integration: ONE build + seed on the main stand, both changes served, full checkpoint on the main contract', async () => {
    mustOk(await recipe('build-seed', envOf(S.main), 'recipe:build-seed main (integration)'), 'build-seed main (integration)')
    for (const id of ['g1', 'g2']) {
      const fix = GROUP_FIX[id]
      const served = await http(`${S.main.url}${fix.page.path}/`)
      check(`main serves ${id}'s content fix and owned template after the merge`, served.status === 200 && served.html.includes(fix.final) && served.html.includes(`has-${fix.color}-color`), `${served.status}`)
    }
    const c = readJson(path.join(S.main.D, 'visual.contract.json'))
    check('the integration contract is the main one: every page, no group', c.pages.length === Object.keys(PAGES).length && c.group === undefined)
    const r = await recipe('integration', envOf(S.main), 'recipe:integration')
    const ledger = path.join(S.main.D, 'evidence', 'rounds.jsonl')
    const line = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop() : null
    check('the full four-stage integration checkpoint passed on the main contract', r.status === 0 && line?.kind === 'checkpoint' && line.scope?.kind === 'full' && line.complete === true && line.findings?.total === 0, `${line ? JSON.stringify({ kind: line.kind, complete: line.complete, findings: line.findings, failedStep: line.failedStep, next: line.next }) : r.stderr.slice(-400)}`)
  })
}

let failure = null
try {
  await main()
} catch (e) {
  failure = e
  console.error(`FAIL: ${e.message}`)
} finally {
  const leftovers = await teardown()
  if (!failure && leftovers.length) failure = new Error(`teardown failed: ${leftovers.join('; ')}`)
  const out = { prefix: PREFIX, ok: !failure, error: failure ? String(failure.message) : null, steps, groupSteps, checks, teardown: leftovers }
  mkdirSync(SCRATCH, { recursive: true })
  writeFileSync(path.join(SCRATCH, 'report.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(`\n${groupSteps.map((g) => `  ${g.group}: ${g.name}: ${g.minutes} min (${g.start} → ${g.end})`).join('\n')}\n${steps.map((s) => `${s.name}: ${s.minutes} min (${s.start} → ${s.end})`).join('\n')}`)
  console.log(failure ? `\nFAILED: ${failure.message}` : `\nALL ${checks.length} CHECKS PASSED`)
  process.exit(failure ? 1 : 0)
}
