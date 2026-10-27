#!/usr/bin/env node
// Restore a quickstart pack into a clean webroot + database — the verify stand — the way the
// fleet does: as root, `tar -x` into the webroot (owner and modes from the archive), edit
// wp-config.php in place (the same four-define rewrite as provision/render_wp_config.py), then as
// www-data import the SQL, rewrite the placeholder address through `wp search-replace`, and prove
// it: the runtime can read what it needs, core checksums, the expected theme active, rewrite rules
// flushed.
//
// Every file operation goes through `--root-runner`, a command prefix that runs as root inside the
// Linux filesystem the verify stand serves (a Docker volume) — never through the host's tar: on a
// macOS bind mount files are neither root-owned nor held to their modes, so a 0600 wp-config.php
// that kills the fleet's provision (JA Vega 1.1.1, issue #34) restored and served there. Restore
// never chmods or chowns what the archive carries: an archive the fleet cannot read fails here.
// Once the webroot is checked, every root step runs inside that very directory (lib.mjs anchorRoot),
// so a parent swapped after the check cannot redirect the wipe or the extraction. The manifest is
// checked whole (readPack) before the first root command, and so is everything restore needs from the
// pack's bytes (preparePack: the SQL decompresses, wp-config.php renders, the theme is there);
// restore.json's `binding` names the pack bytes and the target verify-parity must find again.
//
// The access probe (lib.mjs probeWebroot) runs through `--wp` — which must run as the fleet's
// www-data (`--runtime-uid`, 33), never root — before WordPress is bootstrapped, so an unreadable
// wp-config.php, theme or uploads directory is a named failure, not "Strange wp-config.php file";
// and again at the end with the active theme and its parent. Before anything is wiped, the root
// runner must be root and pass stdin, and a root-owned 0600 canary must be unreadable through
// `--wp` — a filesystem that lets it through does not enforce modes and proves nothing.
//
// Usage: node restore.mjs --pack <dir> --root-runner "<root cmd>" --wp "<www-data runner>"
//        --site-url <url> --db-host <host> --db-user <user> --db-name <db>
//        (--db-password <pw> | --db-password-env VAR) [--container-webroot /var/www/html]
//        [--runtime-uid 33] [--wipe] [--offline-checksums] [--admin-password <pw>] [--report <file>]
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  cli,
  parseArgs,
  wpRunner,
  rootRunner,
  anchorRoot,
  normalSiteUrl,
  probeWebroot,
  lintConfig,
  evaluateAccess,
  acquireLock,
  auditArchiveMembers,
  listArchive,
  readPack,
  sha256Text,
  checkWebrootPath,
  withRootCleanup,
  unsafeMembers,
  renderRestoreConfig,
  startDeadline,
  UsageError,
  PLACEHOLDER_URL
} from './lib.mjs'

export { unsafeMembers }

const SPEC = {
  '--pack': {
    placeholder: 'dir',
    required: true,
    help: 'pack.mjs output (manifest.json, SHA256SUMS, archives)'
  },
  '--root-runner': {
    placeholder: 'runner',
    required: true,
    help: 'runs a command as root in the verify webroot filesystem, stdin passed (docker run --rm -i --user 0:0 -v <volume>:/var/www/html <image>)'
  },
  '--wp': { placeholder: 'runner', required: true, help: 'wp-cli runner on the same webroot, as www-data (--user 33:33)' },
  '--site-url': { placeholder: 'url', required: true, help: 'address of the restored site' },
  '--db-host': {
    placeholder: 'host',
    required: true,
    help: 'database host as the web/cli containers see it'
  },
  '--db-user': { placeholder: 'user', default: 'root' },
  '--db-name': { placeholder: 'db', default: 'wp' },
  '--db-password': { placeholder: 'pw', help: 'database password (or --db-password-env)' },
  '--db-password-env': { placeholder: 'VAR', help: 'environment variable holding the database password' },
  '--container-webroot': {
    placeholder: 'path',
    default: '/var/www/html',
    help: 'the webroot as both runners see it'
  },
  '--runtime-uid': { placeholder: 'uid', default: '33', help: "the fleet's www-data: --wp must run as this uid, never 0" },
  '--placeholder-url': { placeholder: 'url', default: PLACEHOLDER_URL },
  '--origin-wp': {
    placeholder: 'runner',
    help: 'wp-cli runner on the stand the pack came from — what core checksums are read against'
  },
  '--offline-checksums': {
    value: false,
    help: "build/group stands only: do not ask wordpress.org for core checksums (no network). The pack's SHA256SUMS (verified before the wipe) and the core version in the manifest are the integrity evidence; the report says so and release.mjs refuses such a restore"
  },
  '--wipe': { value: false, help: 'empty the webroot first (refused without it when it is not empty)' },
  '--admin': { placeholder: 'login', default: 'tracyagent', help: 'account to give --admin-password to' },
  '--admin-password': {
    placeholder: 'pw',
    help: 'set a password on --admin after restore (the pack ships none)'
  },
  '--report': { placeholder: 'file', help: 'write a JSON report of what was verified (also on failure, ok: false)' },
  '--timeout': { placeholder: 's', default: '1800', help: 'seconds for the whole restore; past it the run ends with exit 1' }
}

/** Identity and canary problems only — what decides whether the stand can prove anything at all. */
export function identityProblems(probe, opts) {
  if (!probe) return evaluateAccess(null, opts)
  return evaluateAccess({ ...probe, required: {}, unreadable: [], notRoot: [], truncated: false }, { ...opts, paths: false })
}

/**
 * Before anything is removed: the root runner is root and passes stdin, the webroot exists, the
 * wp runner runs as the fleet's uid over a filesystem that enforces modes, and the runtime's PHP
 * compiles `config` (the wp-config.php preparePack rendered; lib.mjs lintConfig). Then empty it, or refuse.
 * Returns the root runner bound to the webroot (lib.mjs anchorRoot) that every later step uses.
 */
export async function prepareWebroot({ root, wp, webroot, runtimeUid, wipe, config }) {
  webroot = checkWebrootPath(webroot)
  const at = anchorRoot(root, webroot)
  const pre = await probeWebroot({ root: at, wp, webroot, runtimeUid })
  // Every way the probe failed to run blocks the wipe; of what it found, only identity and the
  // canary — the files of the stand about to be replaced are not what restore proves.
  const problems = [...pre.failed, ...(pre.cli ? identityProblems(pre.cli, { nonce: pre.nonce, via: 'wp-cli', runtimeUid }) : [])]
  if (problems.length) throw new Error(`the verify stand cannot stand in for the fleet — nothing was wiped:\n  ${problems.join('\n  ')}`)
  // what preparePack rendered, compiled by the runtime's PHP while the old stand is still there
  if (typeof config !== 'string' || !config) throw new Error('prepareWebroot needs the rendered wp-config.php to compile before the wipe')
  const lint = await lintConfig({ root: at, wp, webroot, config, runtimeUid })
  if (lint) throw new Error(`${lint} — nothing was wiped`)
  const empty = at('if [ -z "$(ls -A .)" ]; then echo empty; fi', { what: 'root runner: list the webroot' }).trim() === 'empty'
  if (!empty) {
    if (!wipe) throw new Error(`${webroot} is not empty — pass --wipe to replace it`)
    at('find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +', { what: 'root runner: wipe the webroot' })
  }
  return { identity: { euid: pre.cli.euid, user: pre.cli.user, canaryReadable: pre.cli.canary }, wiped: !empty, root: at }
}

/**
 * What restore needs from the pack's bytes, taken before the stand is touched: the SQL decompressed
 * whole (gzip's CRC and length checked), the webroot archive's gzip stream checked end to end, the
 * archive's wp-config.php rendered for this stand, and the manifest's theme present in the archive.
 * A pack that fails any of these is named here, while the webroot is still what it was.
 */
export async function preparePack({ manifest, archiveBytes, sqlBytes, rows, db, siteUrl }) {
  let sql
  try {
    sql = gunzipSync(sqlBytes)
  } catch (e) {
    throw new Error(`${manifest.database.file} does not decompress (${e.code || e.message}) — nothing was wiped`)
  }
  if (!sql.length) throw new Error(`${manifest.database.file} decompresses to nothing — nothing was wiped`)
  try {
    // tarfile streams the listing without checking gzip's trailer; this does, without holding the
    // decompressed webroot in memory
    await pipeline(Readable.from([archiveBytes]), createGunzip(), new Writable({ write: (_c, _e, done) => done() }))
  } catch (e) {
    throw new Error(`${manifest.webroot.file} does not decompress (${e.code || e.message}) — nothing was wiped`)
  }
  const config = rows.find((r) => r.name === 'wp-config.php')
  if (!config || config.type !== 'file' || !Buffer.isBuffer(config.content))
    throw new Error(`${manifest.webroot.file} carries no wp-config.php file — nothing was wiped`)
  let rendered
  try {
    rendered = renderRestoreConfig(config.content.toString('utf8'), db, siteUrl)
  } catch (e) {
    throw new Error(`${manifest.webroot.file}: wp-config.php cannot be rendered for this stand (${e.message}) — nothing was wiped`)
  }
  const style = `wp-content/themes/${manifest.theme.name}/style.css`
  if (!rows.some((r) => r.name === style && r.type === 'file'))
    throw new Error(`${manifest.webroot.file} carries no ${style} for the manifest's theme — nothing was wiped`)
  return { sql, rendered }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(
      process.argv.slice(2),
      SPEC,
      'usage: restore.mjs --pack <dir> --root-runner "<root cmd>" --wp "<runner>" --site-url <url> --db-host <host> [--db-password <pw> | --db-password-env VAR] [options]'
    )
    const pack = path.resolve(o.pack)
    const cw = checkWebrootPath(o.containerWebroot)
    const siteUrl = normalSiteUrl(o.siteUrl)
    const runtimeUid = Number(o.runtimeUid)
    if (!Number.isInteger(runtimeUid) || runtimeUid <= 0) throw new UsageError('--runtime-uid must be a uid other than 0')
    const password = o.dbPassword ?? (o.dbPasswordEnv ? process.env[o.dbPasswordEnv] : undefined)
    const deadline = startDeadline(Number(o.timeout), 'restore')
    if (password === undefined) throw new Error('--db-password or --db-password-env is required')
    const report = { pack, webroot: cw, siteUrl, runtimeUid, ok: false, steps: [] }
    const step = (name, detail) => {
      report.steps.push({ name, ...detail })
      console.log(`    ${name}${detail?.note ? ` — ${detail.note}` : ''}`)
    }
    const lock = acquireLock(`${o.rootRunner}\n${cw}`)
    const root = rootRunner(o.rootRunner, { deadline })
    let wp = null
    try {
      console.log('==> checking the pack')
      // readPack holds the whole manifest to what the steps below read (manifestProblems)
      const { manifest, sums, manifestSha } = readPack(pack)
      report.id = manifest.id
      report.version = manifest.version
      // The bytes read here are the bytes listed, hashed, extracted and reported — not the file again.
      const archiveFile = path.join(pack, manifest.webroot.file)
      const archiveBytes = readFileSync(archiveFile)
      const archiveSha = sha256Text(archiveBytes)
      if (archiveSha !== manifest.webroot.sha256) throw new Error(`${manifest.webroot.file} is ${archiveSha} now, the manifest says ${manifest.webroot.sha256}`)
      const sqlBytes = readFileSync(path.join(pack, manifest.database.file))
      const sqlSha = sha256Text(sqlBytes)
      if (sqlSha !== manifest.database.sha256) throw new Error(`${manifest.database.file} is ${sqlSha} now, the manifest says ${manifest.database.sha256}`)
      report.archive = { file: manifest.webroot.file, sha256: archiveSha }
      report.database = { file: manifest.database.file, sha256: sqlSha }
      // what verify-parity measures again before it takes this report as speaking for its stand
      report.binding = { manifest: manifestSha, webrootArchive: archiveSha, databaseArchive: sqlSha, webroot: cw, siteUrl, runtimeUid }
      step('checksums', { files: sums.map((f) => f.file) })
      const rows = listArchive(archiveFile, { deadline, input: archiveBytes, read: ['wp-config.php'] })
      const unsafe = unsafeMembers(rows)
      if (unsafe.length) throw new Error(`the archive carries members restore will not extract:\n  ${unsafe.join('\n  ')}`)
      // Reported, never repaired: the probe below is what decides whether the runtime can read them.
      const audit = auditArchiveMembers(rows)
      report.archive.modes = audit.modes
      report.archive.offPolicy = audit.problems
      step('archive-modes', { note: audit.problems.length ? `${audit.problems.length} member(s) off the mode policy — restored as they are` : 'every member on the mode policy' })
      const { sql, rendered } = await preparePack({
        manifest,
        archiveBytes,
        sqlBytes,
        rows,
        db: { host: o.dbHost, user: o.dbUser, password, name: o.dbName },
        siteUrl
      })
      step('pack-contents', { note: 'database decompresses, wp-config.php renders, the theme is in the archive' })

      console.log(`==> preparing ${cw} (root runner, www-data runner)`)
      wp = wpRunner(o.wp, { deadline })
      const prep = await prepareWebroot({ root, wp, webroot: cw, runtimeUid, wipe: o.wipe, config: rendered })
      // from here every root step runs inside the webroot prepareWebroot checked (anchorRoot)
      const at = prep.root
      report.identity = prep.identity
      step('runtime-identity', { note: `wp-cli uid ${prep.identity.euid}${prep.identity.user ? ` (${prep.identity.user})` : ''}, modes enforced`, wiped: prep.wiped })

      console.log(`==> extracting as root into ${cw}`)
      at('tar -xzpf - -C .', { input: archiveBytes, what: 'root runner: tar -x' })
      if (at('if [ -f wp-config.php ] && [ ! -L wp-config.php ]; then echo yes; fi', { what: 'root runner: wp-config.php' }).trim() !== 'yes')
        throw new Error('the archive carried no wp-config.php')
      step('extract', { file: manifest.webroot.file, as: 'root' })

      console.log('==> rewriting wp-config.php in place for this stand (render_wp_config.py shape)')
      // rendered from the archive's wp-config.php before the wipe (preparePack)
      // `cat >` truncates the file in place: its owner and mode stay what the archive gave it
      at('[ -f wp-config.php ] && [ ! -L wp-config.php ] && cat > wp-config.php', { input: rendered, what: 'root runner: write wp-config.php' })
      step('wp-config', { dbHost: o.dbHost, dbName: o.dbName })

      console.log(`==> what www-data (uid ${runtimeUid}) can read, before WordPress loads`)
      const first = await probeWebroot({ root: at, wp, webroot: cw, themes: [manifest.theme.name], runtimeUid })
      report.access = { beforeBootstrap: { ok: first.ok, entries: first.cli?.entries ?? null, problems: first.problems } }
      if (!first.ok) throw new Error(`the restored webroot is not usable by the fleet's runtime user:\n  ${first.problems.join('\n  ')}`)
      step('access', { note: `${first.cli.entries} entries readable by uid ${first.cli.euid}` })

      console.log('==> importing the database')
      const sqlName = `.tracy-restore-${randomBytes(6).toString('hex')}.sql`
      const sqlPath = `${cw}/${sqlName}`
      await withRootCleanup(at, 'rm -f -- "$1"', [sqlName], `the staged SQL ${sqlPath}`, () => {
        // staged inside the cleanup: a half-written or un-chmod-ed dump is removed all the same
        at('umask 022; cat > "$1" && chmod 0644 "$1"', { input: sql, args: [sqlName], what: 'root runner: stage the SQL' })
        // A fresh database that already holds tables from an earlier restore is the ordinary case on
        // a verify stand; the dump carries DROP TABLE IF EXISTS for its own tables.
        wp(['db', 'import', sqlPath])
      })
      step('db-import', { file: manifest.database.file })

      console.log(`==> ${o.placeholderUrl} → ${siteUrl}`)
      const sr = wp([
        'search-replace',
        o.placeholderUrl,
        siteUrl,
        '--all-tables',
        '--precise',
        '--report-changed-only',
        '--format=count'
      ]).trim()
      step('search-replace', { replacements: Number(sr) || 0 })
      const escaped = o.placeholderUrl.replace(/\//g, '\\/')
      const sr2 = wp([
        'search-replace',
        escaped,
        siteUrl.replace(/\//g, '\\/'),
        '--all-tables',
        '--precise',
        '--report-changed-only',
        '--format=count'
      ]).trim()
      if (Number(sr2) > 0) step('search-replace (json-escaped)', { replacements: Number(sr2) })
      wp(['cache', 'flush'])

      console.log('==> verifying')
      const home = wp.field(['option', 'get', 'home'])
      if (home !== siteUrl) throw new Error(`home is ${home}, expected ${siteUrl}`)
      step('home', { value: home })
      // `core verify-checksums` judges the webroot against wordpress.org's list for this version, and
      // a container image can ship a core that already differs from it: `wordpress:apache` 7.1 has no
      // `wp-includes/css/dist/edit-site/*`, so the BUILD stand fails the same four lines (measured
      // 15/09 on wp-tracy-business). What the restore must prove is that it is a faithful copy of the
      // stand it packed — so the origin's own complaint is the baseline, and only a line the origin
      // does not have is a defect. Without `--origin-wp` there is no baseline and any failure stands.
      const lines = (r) =>
        new Set(
          ((r.stderr || '') + '\n' + (r.stdout || ''))
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => /^(Warning|Error):/.test(l) && !/doesn't verify against checksums/.test(l))
        )
      // A group stand restores from the local image cache and the packed seed with no route to wordpress.org: the
      // checksum list cannot be fetched. What proves the copy is faithful there is the pack's own SHA256SUMS (the
      // archives were verified against them before the wipe) and the core version below; a release restore never does this.
      if (o.offlineChecksums) {
        report.offlineChecksums = true
        step('core-checksums', { ok: true, offline: true, note: 'not checked against wordpress.org (--offline-checksums): archives matched SHA256SUMS, core version matched below' })
      }
      const checksums = o.offlineChecksums ? { status: 0, stderr: '', stdout: '' } : wp(['core', 'verify-checksums'], { allowFail: true, raw: true })
      const extra = (checksums.stderr || '')
        .split('\n')
        .filter((l) => /should not exist/.test(l))
        .map((l) => l.replace(/.*should not exist: /, '').trim())
      if (checksums.status !== 0) {
        const mine = lines(checksums)
        const originRunner = o.originWp ? wpRunner(o.originWp) : null
        const origin = originRunner ? lines(originRunner(['core', 'verify-checksums'], { allowFail: true, raw: true })) : new Set()
        const newOnes = [...mine].filter((l) => !origin.has(l))
        if (!originRunner || newOnes.length)
          throw new Error(`wp core verify-checksums failed: ${newOnes.join(' | ').slice(0, 300) || (checksums.stderr || '').trim().slice(-300)}`)
        step('core-checksums', { ok: true, sameAsOrigin: [...mine], extraFiles: extra })
      } else if (!o.offlineChecksums) step('core-checksums', { ok: true, extraFiles: extra })
      const active = wp.field(['theme', 'list', '--status=active', '--field=name'])
      if (active !== manifest.theme.name)
        throw new Error(`active theme is ${active}, manifest says ${manifest.theme.name}`)
      step('theme', { active })
      const version = wp.field(['core', 'version'])
      if (version !== manifest.wpVersion)
        throw new Error(`restored WordPress is ${version}, manifest says ${manifest.wpVersion}`)
      step('core-version', { version })
      wp(['rewrite', 'flush'])
      step('rewrite-flush', {})
      if (o.adminPassword) {
        wp(['user', 'update', o.admin, `--user_pass=${o.adminPassword}`, '--skip-email'])
        step('admin-password', { user: o.admin })
      }

      console.log('==> what www-data can read, with the active theme and its parent')
      const themes = [active, wp.field(['option', 'get', 'template'])].filter(Boolean)
      const last = await probeWebroot({ root: at, wp, webroot: cw, themes, runtimeUid })
      report.access.afterRestore = { ok: last.ok, themes, entries: last.cli?.entries ?? null, problems: last.problems }
      if (!last.ok) throw new Error(`the restored site is not usable by the fleet's runtime user:\n  ${last.problems.join('\n  ')}`)
      step('access-final', { note: `themes ${[...new Set(themes)].join(', ')} readable` })
      report.ok = true
      console.log(`restore: ${manifest.id} ${manifest.version} is serving at ${siteUrl}`)
      return 0
    } catch (e) {
      report.error = e.message
      throw e
    } finally {
      report.finishedAt = new Date().toISOString()
      if (o.report) writeFileSync(o.report, JSON.stringify(report, null, 2) + '\n')
      wp?.dispose()
      lock.release()
    }
  })
