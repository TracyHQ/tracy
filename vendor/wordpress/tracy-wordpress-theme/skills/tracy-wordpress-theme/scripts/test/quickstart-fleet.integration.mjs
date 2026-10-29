#!/usr/bin/env node
// Issue #34 end to end, on Docker: a build stand whose theme, uploads and wp-config.php carry the
// modes an agent's umask 077 leaves (0600 files, 0700 directories) is packed, restored the way the
// fleet restores (root extracts into a Linux volume; wp-cli and the web server's PHP run as
// www-data) and verified. Then the negative cases the fleet would die on:
//
//   good          pack → restore → verify-parity green; the archive is 0644/0755, 0:0; the stand
//                 keeps its own modes; wp-cli and HTTP PHP both answer as uid 33 (www-data)
//   verify-0600   wp-config.php made 0600 on the restored stand → verify-parity fails, naming it
//   config-0600   an archive with valid checksums whose wp-config.php is 0600 → restore fails
//   theme-0600    … whose theme style.css is 0600 → restore fails naming the theme file
//   uploads-0700  … whose wp-content/uploads is 0700 → restore fails naming uploads
//   config-syntax … whose wp-config.php has the four defines but does not compile → restore fails
//                 on the runtime's php -l before the wipe; the stand's files stay
//   bind-mount    a root runner on a macOS bind mount → restore refuses before wiping anything
//   wp-as-root    a wp runner that runs as root → restore refuses before wiping anything
//
// And release.mjs acceptance on that runtime evidence (a synthetic four-tier Visual QA checkpoint
// bound to each pack's archives, so what decides is the restore and parity evidence): the good
// restore + parity is released; the 0600 wp-config.php parity, the config-0600 / theme-0600 /
// uploads-0700 restores and a parity probe run as root are each refused by name, writing nothing.
//
// Not part of `npm test` (it needs Docker and ~2 minutes). Every container, network and volume
// is named after this run (`--project`, default a random qs34-xxxxxx) and removed at the end; logs
// and reports stay under --scratch.
//
// Usage: node scripts/test/quickstart-fleet.integration.mjs --scratch <dir> [--project <name>] [--timeout 600]
//        [--web-image wordpress:php8.3-apache] [--cli-image wordpress:cli-php8.3] [--db-image mariadb:11]
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256File, sumsText, listArchive } from '../quickstart/lib.mjs'
import { acceptRelease, runRelease, AcceptanceError, BINDING_FILE, BINDING_SCHEMA } from '../quickstart/release.mjs'
import { contractHash, CANONICAL } from '../lib/canonical.mjs'
import { STAGES } from '../visual/contract.mjs'
import { writeContracts } from './quickstart-contracts.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const QS = path.join(HERE, '..', 'quickstart')
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : dflt
}
const scratchArg = arg('--scratch')
if (!scratchArg) {
  console.error('usage: quickstart-fleet.integration.mjs --scratch <dir> [--project <name>] [--timeout 600]')
  process.exit(2)
}
const PROJECT = arg('--project')
if (PROJECT !== undefined && !/^[a-z0-9][a-z0-9_.-]{0,40}$/.test(PROJECT)) {
  console.error(`--project ${JSON.stringify(PROJECT)}: a Docker resource prefix (lower-case letters, digits, . _ -)`)
  process.exit(2)
}
const SCRATCH = path.resolve(scratchArg)
const TIMEOUT = Number(arg('--timeout', '600'))
const WEB = arg('--web-image', 'wordpress:php8.3-apache')
const CLI = arg('--cli-image', 'wordpress:cli-php8.3')
const DB = arg('--db-image', 'mariadb:11')
const RUN = PROJECT ?? `qs34-${randomBytes(3).toString('hex')}`
const R = {
  netA: `${RUN}-a`,
  netB: `${RUN}-b`,
  db: `${RUN}-db`,
  build: `${RUN}-build`,
  verify: `${RUN}-verify`,
  vol: `${RUN}-verify-web`
}
const PW = randomBytes(9).toString('hex')
const until = Date.now() + TIMEOUT * 1000
const LOG = path.join(SCRATCH, 'integration.log')
const log = (s) => {
  appendFileSync(LOG, s.endsWith('\n') ? s : s + '\n')
}
const left = () => Math.max(1000, until - Date.now())

function run(cmd, args, { input, env, allowFail = false, timeout = 180000 } = {}) {
  if (Date.now() > until) throw new Error(`integration timed out after ${TIMEOUT}s (before ${cmd} ${args[0]})`)
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
    timeout: Math.min(timeout, left()),
    maxBuffer: 1 << 28
  })
  log(`$ ${cmd} ${args.map((a) => (a.includes(PW) ? '<pw>' : a)).join(' ')}\n→ ${r.status}${r.error ? ` ${r.error.message}` : ''}\n${(r.stdout || '').slice(-4000)}${(r.stderr || '').slice(-4000)}`)
  if (!allowFail && (r.error || r.status !== 0))
    throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed (${r.error?.message ?? `exit ${r.status}`}): ${(r.stderr || r.stdout || '').trim().slice(-600)}`)
  return r
}
const docker = (args, opts) => run('docker', args, opts)
const node = (tool, args, opts = {}) =>
  run(process.execPath, [path.join(QS, tool), ...args], { allowFail: true, timeout: 400000, ...opts, env: { QS34_DB_PW: PW, ...(opts.env ?? {}) } })

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(what, fn, ms = 120000) {
  const end = Math.min(Date.now() + ms, until)
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch {}
    await sleep(1000)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, ...detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail?.note ? ` — ${detail.note}` : ''}`)
}

function cleanup() {
  for (const c of [R.build, R.verify, R.db, `${R.netA}-wp-keep`, `${R.netB}-wp-keep`]) docker(['rm', '-f', c], { allowFail: true, timeout: 60000 })
  for (const n of [R.netA, R.netB]) docker(['network', 'rm', n], { allowFail: true, timeout: 60000 })
  docker(['volume', 'rm', '-f', R.vol], { allowFail: true, timeout: 60000 })
  // the WordPress copy under capture/ and the archives are large and rebuilt every run; the
  // manifests, reports and logs stay
  for (const d of ['capture', 'bind']) rmSync(path.join(SCRATCH, d), { recursive: true, force: true })
  for (const d of existsSync(SCRATCH) ? readdirSync(SCRATCH).filter((n) => n === 'pack' || n.startsWith('pack-') || n.startsWith('release-')) : [])
    for (const f of readdirSync(path.join(SCRATCH, d)).filter((n) => /\.(tar|sql)\.gz$/.test(n))) rmSync(path.join(SCRATCH, d, f), { force: true })
}

// A copy of the good pack whose archive gives the members named in `edits` another mode — checksums
// rewritten so they are VALID: what fails must be the modes, not the sums.
function variantPack(goodPack, name, edits) {
  const dir = path.join(SCRATCH, `pack-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const manifest = JSON.parse(readFileSync(path.join(goodPack, 'manifest.json'), 'utf8'))
  const src = path.join(goodPack, manifest.webroot.file)
  const dst = path.join(dir, manifest.webroot.file)
  const py = String.raw`
import sys, io, json, tarfile, gzip
src, dst, edits = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
with tarfile.open(src, 'r:gz') as tin, gzip.GzipFile(dst, 'wb', mtime=0) as gz, tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tout:
    for m in tin:
        e = edits.get(m.name)
        data = tin.extractfile(m).read() if m.isfile() else None
        if isinstance(e, str): m.mode = int(e, 8)
        elif e is not None:
            if e['find'].encode() not in data: sys.exit('variant %s: %r not in %s' % (dst, e['find'], m.name))
            data = data.replace(e['find'].encode(), e['put'].encode(), 1)
        if data is not None: m.size = len(data)
        tout.addfile(m, io.BytesIO(data) if data is not None else None)
`
  run('python3', ['-c', py, src, dst, JSON.stringify(edits)])
  writeFileSync(path.join(dir, manifest.database.file), readFileSync(path.join(goodPack, manifest.database.file)))
  manifest.webroot.sha256 = sha256File(dst)
  manifest.webroot.bytes = statSync(dst).size
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(
    path.join(dir, 'SHA256SUMS'),
    sumsText(['manifest.json', manifest.webroot.file, manifest.database.file].map((f) => ({ file: f, sha256: sha256File(path.join(dir, f)) })))
  )
  return dir
}

// ---------------------------------------------------------------- release acceptance inputs
// A spec-pack, a dossier whose canonical contracts are bound to it, a theme zip, and per case a
// complete four-tier checkpoint whose tiers are bound to that case's pack archives and the zip —
// the Visual QA evidence is synthetic (no visual-qa run here); the runtime evidence is the stand's.
function releaseInputs() {
  const base = path.join(SCRATCH, 'acceptance')
  rmSync(base, { recursive: true, force: true })
  const spec = path.join(base, 'spec')
  const runRoot = path.join(base, 'dossier')
  mkdirSync(spec, { recursive: true })
  mkdirSync(runRoot, { recursive: true })
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const { visual } = writeContracts({ runRoot, specDir: spec, id: 'qs34' })
  const themeZip = path.join(base, 'qs34-1.0.0.zip')
  writeFileSync(themeZip, 'qs34 theme zip')
  const tag = (file) => `sha256:${sha256File(file)}`
  /** The release options for `packDir` with its restore report and a parity.json; `name` keeps each case's evidence apart. */
  return (name, packDir, { restoreReport, parity }) => {
    const m = JSON.parse(readFileSync(path.join(packDir, 'manifest.json'), 'utf8'))
    const artifactHash = {
      theme: { file: path.basename(themeZip), sha256: tag(themeZip) },
      webroot: { file: m.webroot.file, sha256: tag(path.join(packDir, m.webroot.file)) },
      database: { file: m.database.file, sha256: tag(path.join(packDir, m.database.file)) }
    }
    const evidence = path.join(base, name)
    const now = new Date().toISOString()
    // every tier measured the restored site parity probed (visual-qa --site)
    const site = existsSync(parity) ? JSON.parse(readFileSync(parity, 'utf8')).b : null
    const line = { run: `qs34/${name}`, kind: 'checkpoint', scope: { kind: 'full', pages: 1 }, complete: true, start: now, end: now, findings: { total: 0, unclassified: 0 }, axisErrors: 0, determinism: { errors: [] }, stages: STAGES.map((st) => st.id), tiers: {} }
    for (const st of STAGES) {
      const dir = path.join(evidence, st.id)
      mkdirSync(dir, { recursive: true })
      line.tiers[st.id] = { out: dir, exit: 0, findings: { total: 0, unclassified: 0 }, axisErrors: 0 }
      const report = JSON.stringify({ schemaVersion: 1, at: now, site, identity: { contractPath: path.join(runRoot, CANONICAL.visual), contractHash: contractHash(visual), stale: [], capturedAt: now, artifactHash: artifactHash.theme.sha256 }, scope: { kind: 'full' }, stages: STAGES.map((x) => ({ id: x.id, status: x.id === st.id ? 'pass' : 'skipped', findings: 0 })), summary: { findings: 0, unclassified: 0 }, pages: [{ id: 'home', axes: st.variants.map((v) => ({ variant: v, measured: 'now', findings: [] })) }] })
      writeFileSync(path.join(dir, 'visual.json'), report)
      writeFileSync(path.join(dir, BINDING_FILE), JSON.stringify({ schema: BINDING_SCHEMA, stage: st.id, report: { file: 'visual.json', sha256: tag(path.join(dir, 'visual.json')) }, measuredAt: now, artifactHash }))
    }
    writeFileSync(path.join(evidence, 'rounds.jsonl'), JSON.stringify(line) + '\n')
    // an earlier run's release here lost its archives to cleanup(), so release would rightly refuse it as --out
    rmSync(path.join(SCRATCH, `release-${name}`), { recursive: true, force: true })
    return { pack: packDir, out: path.join(SCRATCH, `release-${name}`), parity, restoreReport, runRoot, spec, themeZip, visualLedger: path.join(evidence, 'rounds.jsonl'), checkpoint: line.run, repo: 'JoomlArt-Products/joomlart-products', admin: 'tracyagent' }
  }
}
/** The named refusal of acceptRelease, or null when it accepted. */
function refusalOf(o) {
  try {
    acceptRelease(o)
    return null
  } catch (e) {
    if (!(e instanceof AcceptanceError)) throw e
    return e
  }
}
function recordRefusal(name, o, codes, pattern) {
  const e = refusalOf(o)
  const got = e?.problems.map((p) => p.code) ?? []
  record(name, Boolean(e) && codes.every((c) => got.includes(c)) && (!pattern || pattern.test(e.message)) && !existsSync(o.out), { note: e ? e.message.split('\n').slice(0, 4).join(' | ').slice(0, 600) : 'accepted' })
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true })
  writeFileSync(LOG, `# ${RUN} ${new Date().toISOString()}\n`)
  const v = docker(['version', '--format', '{{.Server.Os}} {{.Server.Version}}'], { allowFail: true, timeout: 30000 })
  if (v.status !== 0) throw new Error(`Docker is not reachable — this check needs it and is not a pass without it: ${(v.stderr || '').trim().slice(-300)}`)
  for (const img of [WEB, CLI, DB])
    if (docker(['image', 'inspect', img], { allowFail: true, timeout: 30000 }).status !== 0) docker(['pull', img], { timeout: 300000 })

  const capture = path.join(SCRATCH, 'capture')
  const pack = path.join(SCRATCH, 'pack')
  for (const d of [capture, pack, path.join(SCRATCH, 'bind')]) rmSync(d, { recursive: true, force: true })
  mkdirSync(capture, { recursive: true })
  const [portA, portB] = [await freePort(), await freePort()]
  const siteA = `http://127.0.0.1:${portA}`
  const siteB = `http://127.0.0.1:${portB}`

  console.log(`==> ${RUN}: database, build stand (${siteA})`)
  docker(['network', 'create', R.netA])
  docker(['network', 'create', R.netB])
  docker(['run', '-d', '--name', R.db, '--network', R.netA, '--network-alias', 'db', '-e', `MARIADB_ROOT_PASSWORD=${PW}`, '-e', 'MARIADB_DATABASE=build', DB])
  docker(['network', 'connect', '--alias', 'db', R.netB, R.db])
  await waitFor('mariadb', () => docker(['exec', R.db, 'mariadb', '-uroot', `-p${PW}`, '-e', 'CREATE DATABASE IF NOT EXISTS verify'], { allowFail: true, timeout: 20000 }).status === 0)
  const stackEnv = ['-e', 'WORDPRESS_DB_HOST=db', '-e', 'WORDPRESS_DB_USER=root', '-e', `WORDPRESS_DB_PASSWORD=${PW}`, '-e', 'WORDPRESS_DB_NAME=build', '-e', 'WORDPRESS_TABLE_PREFIX=tr_']
  docker(['run', '-d', '--name', R.build, '--network', R.netA, '-p', `127.0.0.1:${portA}:80`, ...stackEnv, '-v', `${capture}:/var/www/html`, WEB])
  await waitFor('the build webroot', () => existsSync(path.join(capture, 'wp-includes', 'version.php')) && existsSync(path.join(capture, 'wp-config.php')))
  const wpA = `docker run --rm --network ${R.netA} --user 33:33 -v ${capture}:/var/www/html ${stackEnv.join(' ')} ${CLI} wp`
  const wpAr = (args) => run('sh', ['-c', `${wpA} "$@"`, 'wp', ...args])
  await waitFor('wp core install', () => wpAr(['core', 'install', `--url=${siteA}`, '--title=QS34', '--admin_user=tracyagent', '--admin_password=x', '--admin_email=qs34@example.invalid', '--skip-email']).status === 0, 60000)

  // The theme and uploads as an agent with umask 077 leaves them — plus the stand's wp-config.php.
  const themes = path.join(capture, 'wp-content', 'themes')
  const parent = path.join(themes, 'qs34')
  const child = path.join(themes, 'qs34-child')
  for (const d of [parent, path.join(parent, 'templates'), child]) mkdirSync(d, { recursive: true })
  writeFileSync(path.join(parent, 'style.css'), '/*\nTheme Name: QS34\nVersion: 1.0.0\n*/\n')
  writeFileSync(path.join(parent, 'index.php'), '<?php\n')
  writeFileSync(path.join(parent, 'templates', 'index.html'), '<!-- wp:paragraph --><p>qs34</p><!-- /wp:paragraph -->\n')
  writeFileSync(path.join(child, 'style.css'), '/*\nTheme Name: QS34 Child\nTemplate: qs34\nVersion: 1.0.0\n*/\n')
  const uploads = path.join(capture, 'wp-content', 'uploads', '2026', '09')
  mkdirSync(uploads, { recursive: true })
  writeFileSync(path.join(uploads, 'fixture.txt'), 'qs34\n')
  const umask077 = [
    [parent, 0o700], [path.join(parent, 'templates'), 0o700], [child, 0o700],
    [path.join(parent, 'style.css'), 0o600], [path.join(parent, 'index.php'), 0o600],
    [path.join(parent, 'templates', 'index.html'), 0o600], [path.join(child, 'style.css'), 0o600],
    [path.join(capture, 'wp-content', 'uploads'), 0o700], [path.join(capture, 'wp-content', 'uploads', '2026'), 0o700],
    [uploads, 0o700], [path.join(uploads, 'fixture.txt'), 0o600], [path.join(capture, 'wp-config.php'), 0o600]
  ]
  for (const [p, m] of umask077) chmodSync(p, m)
  wpAr(['theme', 'activate', 'qs34-child'])

  console.log('==> pack')
  const packed = node('pack.mjs', ['--webroot', capture, '--wp', wpA, '--site-url', siteA, '--out', pack, '--id', 'qs34/wp7', '--version', '1.0.0'])
  if (packed.status !== 0) throw new Error(`pack failed: ${(packed.stderr || packed.stdout).trim().slice(-800)}`)
  const manifest = JSON.parse(readFileSync(path.join(pack, 'manifest.json'), 'utf8'))
  const rows = listArchive(path.join(pack, manifest.webroot.file))
  const offPolicy = rows.filter((r) => r.uid !== 0 || r.gid !== 0 || (r.type === 'dir' ? r.mode !== 0o755 : ![0o644, 0o755].includes(r.mode)))
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
  const sourceKept = umask077.filter(([p, m]) => (statSync(p).mode & 0o777) !== m).map(([p]) => path.relative(capture, p))
  record('pack normalises modes', offPolicy.length === 0 && byName['wp-config.php']?.mode === 0o644 && byName['wp-content/themes/qs34/style.css']?.mode === 0o644 && byName['wp-content/uploads']?.mode === 0o755 && manifest.webroot.modePolicy?.file === '0644' && sourceKept.length === 0, {
    note: `${rows.length} members, ${offPolicy.length} off policy, manifest modes ${JSON.stringify(manifest.webroot.modes)}, stand modes changed: ${sourceKept.join(', ') || 'none'}`
  })

  const rootB = (vol) => `docker run --rm -i --network ${R.netB} --user 0:0 -v ${vol}:/var/www/html ${CLI}`
  const wpB = (vol, user = '33:33') => `docker run --rm --network ${R.netB} --user ${user} -v ${vol}:/var/www/html ${CLI} wp`
  const restoreArgs = (p, { root = rootB(R.vol), wp = wpB(R.vol), report } = {}) => [
    '--pack', p, '--root-runner', root, '--wp', wp, '--site-url', siteB, '--db-host', 'db', '--db-name', 'verify',
    '--db-user', 'root', '--db-password-env', 'QS34_DB_PW', '--origin-wp', wpA, '--wipe', '--timeout', '400',
    ...(report ? ['--report', report] : [])
  ]
  docker(['volume', 'create', R.vol])

  console.log(`==> restore (${siteB})`)
  const restored = node('restore.mjs', restoreArgs(pack, { report: path.join(pack, 'restore.json') }))
  const report = existsSync(path.join(pack, 'restore.json')) ? JSON.parse(readFileSync(path.join(pack, 'restore.json'), 'utf8')) : null
  record('restore as the fleet does', restored.status === 0 && report?.ok === true && report?.identity?.euid === 33 && report?.access?.afterRestore?.ok === true, {
    note: restored.status === 0 ? `wp-cli uid ${report?.identity?.euid}, ${report?.access?.beforeBootstrap?.entries} entries readable` : (restored.stderr || restored.stdout).trim().slice(-600)
  })
  // The volume's own root is not an archive member (Docker seeds an empty volume with the owner of
  // the image's /var/www/html); what the archive put in it must all be 0:0.
  const owners = docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'sh', '-c', 'find /w -mindepth 1 \\( ! -user 0 -o ! -group 0 \\) | head -5; stat -c "%a %u:%g %n" /w/wp-config.php /w/wp-content/themes/qs34/style.css /w/wp-content/uploads'])
  record('restored files are root-owned with the archive modes', owners.stdout.trim().split('\n').join(' | ') === '644 0:0 /w/wp-config.php | 644 0:0 /w/wp-content/themes/qs34/style.css | 755 0:0 /w/wp-content/uploads', { note: owners.stdout.trim().split('\n').join(' | ') })

  docker(['run', '-d', '--name', R.verify, '--network', R.netB, '-p', `127.0.0.1:${portB}:80`, '-v', `${R.vol}:/var/www/html`, WEB])
  await waitFor('the verify web server', async () => (await fetch(siteB + '/', { redirect: 'manual', signal: AbortSignal.timeout(5000) })).status < 500, 60000)

  console.log('==> verify-parity')
  const verifyArgs = (out) => ['--a', siteA, '--b', siteB, '--routes', '/', '--wp-a', wpA, '--wp-b', wpB(R.vol), '--root-b', rootB(R.vol), '--pack', pack, '--restore-report', path.join(pack, 'restore.json'), '--out', out]
  const parityOut = path.join(pack, 'parity.json')
  const verified = node('verify-parity.mjs', verifyArgs(parityOut))
  const parity = existsSync(parityOut) ? JSON.parse(readFileSync(parityOut, 'utf8')) : null
  record('verify reads the restore as www-data (wp-cli and HTTP PHP)', verified.status === 0 && parity?.ok === true && parity?.access?.cli?.euid === 33 && parity?.access?.http?.euid === 33 && parity?.access?.http?.user === 'www-data', {
    note: verified.status === 0 ? `cli ${JSON.stringify(parity.access.cli)} http ${JSON.stringify(parity.access.http)}` : (verified.stdout + verified.stderr).trim().slice(-800)
  })

  const releaseFor = releaseInputs()
  {
    const o = releaseFor('good', pack, { restoreReport: path.join(pack, 'restore.json'), parity: parityOut })
    let note = ''
    let ok = false
    try {
      const done = runRelease(o, { state: { exists: false }, log: () => {} })
      const v = JSON.parse(readFileSync(path.join(done.out, 'VERIFICATION.json'), 'utf8'))
      ok = v.acceptance?.runtime?.parity?.http?.euid === 33 && v.acceptance?.visual?.tiers?.length === 4 && v.acceptance?.artifacts?.webroot?.sha256 === `sha256:${manifest.webroot.sha256}`
      note = `runtime ${JSON.stringify(v.acceptance?.runtime?.parity)}`
    } catch (e) {
      note = e.message.slice(0, 600)
    }
    record('release accepts the green restore and parity with a complete bound checkpoint', ok, { note })
  }

  // The database archive, the manifest and SHA256SUMS swapped together after the restore: the sums
  // hold, the restore report is of another database — verify refuses it.
  const swapped = path.join(SCRATCH, 'pack-db-swapped')
  rmSync(swapped, { recursive: true, force: true })
  mkdirSync(swapped, { recursive: true })
  const m = JSON.parse(readFileSync(path.join(pack, 'manifest.json'), 'utf8'))
  writeFileSync(path.join(swapped, m.webroot.file), readFileSync(path.join(pack, m.webroot.file)))
  writeFileSync(path.join(swapped, m.database.file), Buffer.concat([readFileSync(path.join(pack, m.database.file)), readFileSync(path.join(pack, m.database.file))]))
  m.database.sha256 = sha256File(path.join(swapped, m.database.file))
  writeFileSync(path.join(swapped, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
  writeFileSync(path.join(swapped, 'SHA256SUMS'), sumsText(['manifest.json', m.webroot.file, m.database.file].map((f) => ({ file: f, sha256: sha256File(path.join(swapped, f)) }))))
  const swapOut = path.join(SCRATCH, 'parity-db-swapped.json')
  const sw = node('verify-parity.mjs', verifyArgs(swapOut).map((a) => (a === pack ? swapped : a)))
  const swParity = existsSync(swapOut) ? JSON.parse(readFileSync(swapOut, 'utf8')) : null
  const swProblems = swParity?.access?.problems ?? []
  record('verify refuses a restore report of another database', sw.status === 1 && swParity?.ok === false && swProblems.some((p) => /^the restore report is of databaseArchive /.test(p)) && swProblems.some((p) => /^the restore report is of manifest /.test(p)), { note: swProblems.join(' | ').slice(0, 500) || (sw.stdout + sw.stderr).trim().slice(-400) })

  docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'chmod', '600', '/w/wp-config.php'])
  const badOut = path.join(SCRATCH, 'parity-verify-0600.json')
  const bad = node('verify-parity.mjs', verifyArgs(badOut))
  const badParity = existsSync(badOut) ? JSON.parse(readFileSync(badOut, 'utf8')) : null
  const named = (badParity?.access?.problems ?? []).filter((p) => /^(wp-cli|http): wp-config\.php file wp-config\.php is not readable by uid 33( \(www-data\))? \(mode 0600, owner 0:0\)$/.test(p))
  record('verify fails on a 0600 wp-config.php', bad.status === 1 && badParity?.ok === false && named.length === 2, { note: (badParity?.access?.problems ?? []).join(' | ').slice(0, 600) || (bad.stdout + bad.stderr).trim().slice(-400) })
  recordRefusal('release refuses parity whose wp-config.php is unreadable by the runtime user', releaseFor('verify-0600', pack, { restoreReport: path.join(pack, 'restore.json'), parity: badOut }), ['parity-failed', 'runtime-access'], /wp-config\.php is not readable by uid 33/)

  // The access probe run as root proves nothing: verify says so, and release refuses its parity.
  const rootOut = path.join(SCRATCH, 'parity-wp-as-root.json')
  node('verify-parity.mjs', verifyArgs(rootOut).map((a) => (a === wpB(R.vol) ? wpB(R.vol, '0:0') : a)))
  recordRefusal('release refuses parity whose probes ran as root', releaseFor('verify-root', pack, { restoreReport: path.join(pack, 'restore.json'), parity: rootOut }), ['parity-failed', 'runtime-access'], /root/)

  // Restores of archives whose checksums are valid but whose modes the fleet cannot read.
  for (const [name, edits, pattern] of [
    ['config-0600', { 'wp-config.php': '600' }, /wp-config\.php file wp-config\.php is not readable by uid 33 \(mode 0600, owner 0:0\)/],
    ['theme-0600', { 'wp-content/themes/qs34/style.css': '600' }, /theme qs34 file wp-content\/themes\/qs34\/style\.css is not readable by uid 33/],
    ['uploads-0700', { 'wp-content/uploads': '700' }, /uploads directory wp-content\/uploads is not listable\/enterable by uid 33 \(mode 0700/]
  ]) {
    const p = variantPack(pack, name, edits)
    const r = node('restore.mjs', restoreArgs(p, { report: path.join(p, 'restore.json') }))
    const out = (r.stdout || '') + (r.stderr || '')
    record(`restore fails: ${name}`, r.status === 1 && pattern.test(out), { note: out.split('\n').filter((l) => /not (readable|listable)|error:/.test(l)).slice(0, 3).join(' | ').slice(0, 500) })
    // the release of that pack is refused on its restore report, naming the unreadable runtime file
    recordRefusal(`release refuses the restore: ${name}`, releaseFor(name, p, { restoreReport: path.join(p, 'restore.json'), parity: parityOut }), ['restore-failed', 'runtime-access'], pattern)
  }

  // A wp-config.php with the four defines render_wp_config.py replaces, which PHP cannot compile:
  // named by the runtime's php -l before the wipe; the stand's files stay.
  {
    const p = variantPack(pack, 'config-syntax', { 'wp-config.php': { find: "$table_prefix = 'tr_';", put: "$table_prefix = 'tr_'\nif ( true ) {" } })
    docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'touch', '/w/keep-me'])
    const r = node('restore.mjs', restoreArgs(p, { report: path.join(p, 'restore.json') }))
    const out = (r.stdout || '') + (r.stderr || '')
    const kept = docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'sh', '-c', 'test -f /w/keep-me && ls -A /w | grep -c tracy-lint-'], { allowFail: true })
    record('restore refuses a wp-config.php that does not compile, before the wipe', r.status === 1 && /wp-config\.php as rendered for this stand does not compile \(php -l exit 255\): .*(syntax|Parse) error/.test(out) && /nothing was wiped/.test(out) && kept.stdout.trim() === '0', { note: out.split('\n').filter((l) => /compile|error:/.test(l)).slice(0, 2).join(' | ').slice(0, 400) })
  }

  // Stands that cannot prove anything are refused before the webroot is touched.
  const bind = path.join(SCRATCH, 'bind')
  mkdirSync(bind, { recursive: true })
  writeFileSync(path.join(bind, 'keep-me'), 'x')
  const rb = node('restore.mjs', restoreArgs(pack, { root: rootB(bind), wp: wpB(bind) }))
  const rbOut = (rb.stdout || '') + (rb.stderr || '')
  record('restore refuses a bind mount that does not enforce modes', rb.status === 1 && /does not enforce file modes/.test(rbOut) && /nothing was wiped/.test(rbOut) && existsSync(path.join(bind, 'keep-me')), { note: rbOut.split('\n').filter((l) => /enforce|error/.test(l)).slice(0, 2).join(' | ').slice(0, 400) })
  docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'touch', '/w/keep-me'])
  const rr = node('restore.mjs', restoreArgs(pack, { wp: wpB(R.vol, '0:0') }))
  const rrOut = (rr.stdout || '') + (rr.stderr || '')
  const kept = docker(['run', '--rm', '--user', '0:0', '-v', `${R.vol}:/w`, CLI, 'sh', '-c', 'test -f /w/keep-me && echo kept'], { allowFail: true })
  record('restore refuses a wp runner that runs as root', rr.status === 1 && /runs as root/.test(rrOut) && kept.stdout.trim() === 'kept', { note: rrOut.split('\n').filter((l) => /root|error/.test(l)).slice(0, 2).join(' | ').slice(0, 400) })
}

let code = 1
const timer = setTimeout(() => {
  console.error(`integration: timed out after ${TIMEOUT}s — cleaning up`)
  try {
    cleanup()
  } finally {
    process.exit(1)
  }
}, TIMEOUT * 1000 + 30000)
try {
  await main()
  code = results.length > 0 && results.every((r) => r.ok) ? 0 : 1
} catch (e) {
  console.error(`integration: ${e.message}`)
  results.push({ name: 'harness', ok: false, note: e.message })
} finally {
  cleanup()
  clearTimeout(timer)
  writeFileSync(path.join(SCRATCH, 'integration.json'), JSON.stringify({ run: RUN, ok: code === 0, results }, null, 2) + '\n')
}
console.log(`integration: ${results.filter((r) => r.ok).length}/${results.length} passed (${path.join(SCRATCH, 'integration.json')})`)
process.exit(code)
