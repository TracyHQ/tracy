#!/usr/bin/env node
// Pack a WordPress build stand into the two archives the fleet's quickstart path consumes
// (provision/quickstart.py → provision.sh: `tar -xf webroot.tar -C <webroot>`, `gunzip -c
// db.sql.gz | mariadb`), plus manifest.json and SHA256SUMS.
//
//   <slug>-webroot-<version>.tar.gz   the whole webroot minus the prune list (lib.mjs FILE_EXCLUDES),
//                                     with wp-config.php rewritten: {{DB_*}} placeholders, literal
//                                     $table_prefix, eight fresh salts. Entries are plain relative
//                                     paths (quickstart.py refuses absolute or `..` members), owned
//                                     by 0:0, no macOS xattrs or AppleDouble sidecars; modes are the
//                                     fleet's, not the stand's (lib.mjs MODE_POLICY: files 0644,
//                                     declared executables 0755, directories 0755 — archive.py).
//                                     A member that is not a plain file or directory, or cannot be
//                                     read, stops the pack by name. Pack stops,
//                                     archiving nothing, on a root entry outside WordPress's own
//                                     (lib.mjs WP_ROOT_NAMES) — printing what refers to each — or a
//                                     define outside the stock set (lib.mjs STOCK_DEFINES), unless
//                                     --keep-root / --keep-define declares it.
//   <slug>-database-<version>.sql.gz  export-db.sh: prefix literal, stand URL → placeholder,
//                                     passwords and sessions blanked.
//   manifest.json                     {id, version, platform, wpVersion, phpVersion, prefix,
//                                     placeholderUrl, theme, plugins[], webroot{…, modePolicy, modes,
//                                     executables}, database{…}, createdAt}
//   SHA256SUMS
//
// The stand is only READ (wp-cli reads, a directory walk); the rewritten wp-config.php is staged
// in a temp dir and archived from there. The archive is read back and checked (every member's
// type, owner and mode among the rest) before the manifest is written; a pack that fails leaves no
// manifest.json or SHA256SUMS behind to vouch for what is in --out. secret-scan.sh runs last
// unless told not to.
//
// Usage: node pack.mjs --webroot <dir> --wp "<runner>" --site-url <url> --out <dir>
//        --id tracy-base/wp7 --version 1.0.0 [--prefix tr_] [--placeholder-url …] [--exclude rel]…
//        [--config <wp-config.php>] [--keep-root name]… [--keep-define NAME]… [--keep-passwords] [--env-file <stand .env>] [--skip-secret-scan]
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  cli,
  parseArgs,
  wpRunner,
  startDeadline,
  walkWebroot,
  dirIdentity,
  renderQuickstartConfig,
  sha256File,
  sumsText,
  defineLiteral,
  archiveConfig,
  CONFIG_MEMBERS,
  readRegularBytes,
  PLACEHOLDER_URL,
  SALT_CONSTANTS,
  rootStrangers,
  unknownDefines,
  namedBy,
  auditArchiveMembers,
  archivePy,
  listArchive,
  MODE_POLICY
} from './lib.mjs'
import { collectMedia } from './prune-audit.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const SPEC = {
  '--webroot': { placeholder: 'dir', required: true, help: 'the stand webroot' },
  '--wp': { placeholder: 'runner', required: true, help: 'wp-cli runner for the stand' },
  '--site-url': {
    placeholder: 'url',
    required: true,
    help: "the stand's address (must equal its siteurl option)"
  },
  '--out': { placeholder: 'dir', required: true, help: 'pack output directory' },
  '--id': { placeholder: 'id', required: true, help: 'quickstart id, e.g. tracy-base/wp7' },
  '--version': { placeholder: 'x.y.z', required: true, help: 'quickstart version' },
  '--prefix': {
    placeholder: 'p_',
    default: 'tr_',
    help: 'table prefix (written literally into wp-config.php, checked in the dump)'
  },
  '--placeholder-url': {
    placeholder: 'url',
    default: PLACEHOLDER_URL,
    help: 'address written into the dump'
  },
  '--exclude': { placeholder: 'rel', repeat: true, help: 'extra webroot path to leave out (repeatable)' },
  '--keep-root': {
    placeholder: 'name',
    repeat: true,
    help: 'a webroot root entry the design ships besides WordPress\'s own (repeatable)'
  },
  '--keep-define': {
    placeholder: 'NAME',
    repeat: true,
    help: 'a wp-config.php constant the design ships besides the stock ones (repeatable)'
  },
  '--config': {
    placeholder: 'file',
    help: "a wp-config.php to render and ship in place of the stand's (the stand's file is not edited); the written archive must hold the accepted form (assets/quickstart/wp-config-docker.php)"
  },
  '--keep-passwords': {
    value: false,
    help: 'ship user_pass as it is (secret-scan then needs --allow-hashes)'
  },
  '--env-file': { placeholder: 'file', help: "the stand's compose .env, for secret-scan" },
  '--skip-secret-scan': { value: false, help: 'do not run secret-scan.sh at the end' },
  '--timeout': { placeholder: 's', default: '1800', help: 'seconds for the whole pack; past it the run ends with exit 1' }
}
let deadline = null // startDeadline(), set by the CLI; every spawn below is capped by it

// The asset prefix is the id's last two segments — `<product>/<cms>`. A JoomlArt design's release
// tag carries an owner segment in front (`quickstart/ja-kinetic/wp7`), which is not part of the
// asset name: its j6 sibling ships `ja-kinetic-j6-webroot-1.0.0.tar.gz`.
export const slugOf = (id) =>
  id
    .split('/')
    .slice(-2)
    .join('/')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

function sh(cmd, args, opts = {}) {
  deadline?.check(`${cmd} ${args[0] ?? ''}`)
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    timeout: deadline?.remainingMs(),
    ...opts
  })
  if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Error(`${cmd} ${args.slice(0, 3).join(' ')} timed out`) : r.error
  if (r.status !== 0)
    throw new Error(
      `${cmd} ${args.slice(0, 4).join(' ')}… exited ${r.status}: ${(r.stderr || '').trim().slice(-400)}`
    )
  return r.stdout
}
// Every member is written by archive.py with owner 0:0, files 0644 (0755 where the source file
// carries an execute bit), directories 0755, no xattrs — whatever modes the stand holds, and without
// touching the stand. The archive is read back and held to the same policy before it is moved to
// `out`: an archive off the policy is never left where a manifest could vouch for it.
export function buildWebrootTar({ webroot, out, config, extraExcludes = [], keepRoot = [] }) {
  // `root` is the webroot's real path, `rootId` its dev:ino when it was walked: archive.py opens that
  // very directory, and the archive is published only while the path still names it
  const { kept, dropped, root, rootId } = walkWebroot(webroot, { extraExcludes })
  const strangers = rootStrangers(kept.map((k) => k.rel), keepRoot)
  if (strangers.length)
    throw Object.assign(
      new Error(
        `the webroot root holds ${strangers.length} entr${strangers.length === 1 ? 'y' : 'ies'} WordPress does not ship: ${strangers.join(', ')} — take each off the stand, or pass --keep-root <name> for one the design ships`
      ),
      { strangers }
    )
  const members = kept.filter((k) => k.rel !== 'wp-config.php')
  rmSync(out, { force: true })
  const partial = `${out}.partial-${process.pid}`
  const work = mkdtempSync(path.join(tmpdir(), 'tracy-pack-'))
  try {
    const list = path.join(work, 'members.nul')
    // a directory carries a trailing `/`: archive.py refuses a member whose kind changed since the walk
    writeFileSync(list, members.map((m) => (m.kind === 'dir' ? `${m.rel}/` : m.rel)).join('\0') + '\0')
    writeFileSync(path.join(work, 'wp-config.php'), config, { mode: 0o644 })
    archivePy(['build', '--root', root, '--root-id', rootId, '--list', list, '--config', path.join(work, 'wp-config.php'), '--out', partial], { deadline })
    const audit = auditArchiveMembers(listArchive(partial, { deadline }))
    if (audit.problems.length)
      throw Object.assign(new Error(`the written archive breaks the mode policy:\n  ${audit.problems.join('\n  ')}`), { modeProblems: audit.problems })
    let now = null
    try {
      now = dirIdentity(root)
    } catch (e) {
      now = e.message
    }
    if (now !== rootId) throw new Error(`the webroot ${root} is not the directory that was archived (${rootId}, now ${now}) — nothing published`)
    renameSync(partial, out)
    return { members: members.length + 1, dropped, modes: audit.modes, executables: audit.executables }
  } finally {
    rmSync(partial, { force: true })
    rmSync(work, { recursive: true, force: true })
  }
}

/** A wp-config.php read as a regular file (no symlink, no FIFO) and as UTF-8; the error names the file. */
function decodeConfig(file) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readRegularBytes(file))
  } catch (e) {
    throw new Error(`${file}: wp-config.php cannot be used (${e instanceof TypeError ? 'not valid UTF-8' : String(e.message).split('\n')[0]})`)
  }
}

export function checkWebrootTar(file, { standConfig, placeholders, keepRoot = [], keepDefines = [] }) {
  const rows = listArchive(file, { deadline, read: CONFIG_MEMBERS })
  const entries = rows.map((r) => r.name)
  const problems = []
  for (const e of entries) {
    if (e.startsWith('/') || e.split('/').includes('..')) problems.push(`unsafe member ${e}`)
    if (/(^|\/)\._/.test(e) || e.endsWith('.DS_Store')) problems.push(`macOS metadata member ${e}`)
    if (/(^|\/)(node_modules|\.git)(\/|$)/.test(e) || e.endsWith('debug.log'))
      problems.push(`excluded member shipped: ${e}`)
  }
  for (const s of rootStrangers(entries, keepRoot)) problems.push(`root entry WordPress does not ship: ${s}`)
  // owner, type and mode of every member, read from the archive (MODE_POLICY)
  const audit = auditArchiveMembers(rows)
  problems.push(...audit.problems)
  const archived = archiveConfig(rows, 'archive')
  problems.push(...archived.problems)
  if (archived.text !== null) {
    const cfg = archived.text
    for (const [c, v] of Object.entries(placeholders))
      if (defineLiteral(cfg, c) !== v)
        problems.push(`${c} is not the placeholder in the shipped wp-config.php`)
    if (/getenv_docker\(\s*['"$]/.test(cfg))
      problems.push('getenv_docker() survived in the shipped wp-config.php')
    for (const d of unknownDefines(cfg, keepDefines)) problems.push(`${d} defined in the shipped wp-config.php, not a stock setting`)
    if (standConfig)
      for (const s of SALT_CONSTANTS) {
        const sv = (standConfig.match(new RegExp(`define\\(\\s*'${s}'[^\\n]*'([^']{20,})'\\s*\\)`)) || [])[1]
        if (sv && cfg.includes(sv)) problems.push(`the stand's ${s} shipped`)
      }
  }
  return { entries: entries.length, problems, modes: audit.modes, unreadable: audit.unreadable, executables: audit.executables }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(
      process.argv.slice(2),
      SPEC,
      'usage: pack.mjs --webroot <dir> --wp "<runner>" --site-url <url> --out <dir> --id <id> --version <x.y.z> [options]'
    )
    const webroot = path.resolve(o.webroot)
    const out = path.resolve(o.out)
    const siteUrl = o.siteUrl.replace(/\/$/, '')
    const slug = slugOf(o.id)
    if (!existsSync(path.join(webroot, 'wp-config.php'))) throw new Error(`${webroot} has no wp-config.php`)
    mkdirSync(out, { recursive: true })
    // the manifest and sums of an earlier pack would vouch for whatever this run leaves half-done
    for (const f of ['manifest.json', 'SHA256SUMS']) rmSync(path.join(out, f), { force: true })
    deadline = startDeadline(Number(o.timeout), 'pack')
    const wp = wpRunner(o.wp, { deadline })

    console.log('==> reading the stand')
    const liveUrl = wp.field(['option', 'get', 'siteurl'])
    if (liveUrl.replace(/\/$/, '') !== siteUrl)
      throw new Error(`--site-url ${siteUrl} but the stand's siteurl is ${liveUrl}`)
    const wpVersion = wp.field(['core', 'version'])
    const phpVersion = wp.field(['eval', 'echo PHP_VERSION;'])
    const stylesheet = wp.field(['option', 'get', 'stylesheet'])
    const themeRows = wp.json(['theme', 'list', '--fields=name,status,version'])
    const theme = themeRows.find((t) => t.name === stylesheet)
    if (!theme || theme.status !== 'active')
      throw new Error(`stylesheet ${stylesheet} is not an active theme on the stand`)
    const plugins = wp
      .json(['plugin', 'list', '--fields=name,status,version'])
      .map((p) => ({ name: p.name, version: p.version, status: p.status }))
    const livePrefix = wp.field(['eval', 'global $wpdb; echo $wpdb->prefix;'])
    if (livePrefix !== o.prefix) throw new Error(`--prefix ${o.prefix} but the stand uses ${livePrefix}`)
    const counts = {}
    for (const t of ['post', 'page', 'attachment', 'wp_navigation', 'wp_template_part', 'wp_block'])
      counts[t] = wp.count(['post', 'list', `--post_type=${t}`, '--post_status=any'])
    counts.category = wp.count(['term', 'list', 'category'])
    counts.user = wp.count(['user', 'list'])
    console.log(
      `    WordPress ${wpVersion}, PHP ${phpVersion}, theme ${stylesheet} ${theme.version}, prefix ${o.prefix}`
    )

    console.log('==> rewriting wp-config.php (staged copy)')
    const standConfig = decodeConfig(path.join(webroot, 'wp-config.php'))
    const shipConfig = o.config ? decodeConfig(path.resolve(o.config)) : standConfig
    const rendered = renderQuickstartConfig(shipConfig, { prefix: o.prefix, keepDefines: o.keepDefine ?? [] })

    const webrootFile = `${slug}-webroot-${o.version}.tar.gz`
    const dbFile = `${slug}-database-${o.version}.sql.gz`
    console.log(`==> archiving the webroot → ${webrootFile}`)
    let built
    try {
      built = buildWebrootTar({
        webroot,
        out: path.join(out, webrootFile),
        config: rendered.source,
        extraExcludes: o.exclude ?? [],
        keepRoot: o.keepRoot ?? []
      })
    } catch (e) {
      if (!e.strangers) throw e
      // What refers to each, read the way prune-audit reads media references: a stranger nothing
      // names can go from the stand; one something names is looked at before anything else.
      const refs = collectMedia({ wp, webroot })
      console.log('==> root entries WordPress does not ship, and what refers to each')
      for (const s of e.strangers) {
        const hits = refs.error ? [] : namedBy(s, refs)
        console.log(`    ${s}`)
        if (refs.error) console.log(`      not known — references were not collected (${refs.error}); treat it as referred to`)
        else if (!hits.length) console.log('      nothing: no content, meta, term meta, option or theme file names it')
        else for (const h of hits) console.log(`      ${h}`)
      }
      throw e
    }
    for (const d of built.dropped) console.log(`    left out: ${d.rel} (${d.why})`)
    const check = checkWebrootTar(path.join(out, webrootFile), {
      standConfig,
      placeholders: rendered.placeholders,
      keepRoot: o.keepRoot ?? [],
      keepDefines: o.keepDefine ?? []
    })
    if (check.problems.length) {
      rmSync(path.join(out, webrootFile), { force: true })
      throw new Error(`webroot archive failed its own check:\n  ${check.problems.join('\n  ')}`)
    }
    console.log(`    ${check.entries} members · ${Object.entries(check.modes).map(([k, n]) => `${n} ${k}`).join(', ')} · owner 0:0`)

    console.log(`==> exporting the database → ${dbFile}`)
    const exp = spawnSync(
      'bash',
      [
        path.join(HERE, 'export-db.sh'),
        '--wp',
        o.wp,
        '--site-url',
        siteUrl,
        '--out',
        path.join(out, dbFile),
        '--placeholder-url',
        o.placeholderUrl,
        '--prefix',
        o.prefix,
        ...(o.keepPasswords ? ['--keep-passwords'] : [])
      ],
      { stdio: ['ignore', 'inherit', 'inherit'], timeout: deadline.remainingMs() }
    )
    if (exp.error?.code === 'ETIMEDOUT') throw new Error('export-db.sh timed out')
    if (exp.status !== 0) throw new Error('export-db.sh failed')

    const describe = (file) => ({
      file,
      bytes: statSync(path.join(out, file)).size,
      sha256: sha256File(path.join(out, file))
    })
    const manifest = {
      schemaVersion: 'tracy-quickstart/v1',
      id: o.id,
      version: o.version,
      platform: 'wordpress',
      wpVersion,
      phpVersion,
      prefix: o.prefix,
      placeholderUrl: o.placeholderUrl,
      theme: { name: stylesheet, version: theme.version },
      plugins,
      counts,
      webroot: {
        ...describe(webrootFile),
        members: check.entries,
        modePolicy: MODE_POLICY,
        modes: check.modes,
        executables: check.executables
      },
      database: describe(dbFile),
      passwordsBlanked: !o.keepPasswords,
      createdAt: new Date().toISOString()
    }
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    const sums = ['manifest.json', webrootFile, dbFile].map((f) => ({
      file: f,
      sha256: sha256File(path.join(out, f))
    }))
    writeFileSync(path.join(out, 'SHA256SUMS'), sumsText(sums))
    console.log(`==> manifest.json + SHA256SUMS written to ${out}`)

    if (!o.skipSecretScan) {
      console.log('==> secret-scan')
      const scan = spawnSync(
        'bash',
        [
          path.join(HERE, 'secret-scan.sh'),
          '--pack',
          out,
          '--site-url',
          siteUrl,
          '--stand-config',
          path.join(webroot, 'wp-config.php'),
          ...(o.envFile ? ['--env-file', o.envFile] : []),
          ...(o.keepPasswords ? ['--allow-hashes'] : [])
        ],
        { stdio: 'inherit', timeout: deadline.remainingMs() }
      )
      if (scan.error?.code === 'ETIMEDOUT') throw new Error('secret-scan.sh timed out')
      if (scan.status !== 0) throw new Error('secret-scan.sh blocked the pack')
    }
    console.log(
      `pack: ${webrootFile} (${manifest.webroot.bytes} bytes) + ${dbFile} (${manifest.database.bytes} bytes)`
    )
    return 0
  })
