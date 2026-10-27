// Shared pieces of the Phase 10 quickstart tools (prune-audit, pack, restore, verify-parity,
// release). Everything here is pure or takes its I/O through an injected runner, so the tests
// can exercise the decisions without Docker or a WordPress.
//
// A "wp runner" is a shell command prefix that ends in a `wp` executable — for the build stand
// `docker compose -p tracy-base-wp7 run --rm -T cli`, for a bare host simply `wp`. Arguments are
// appended through `sh -c '<runner> "$@"'`, so nothing is re-quoted by this code. A runner that
// is a per-call docker container is turned into one kept container plus `docker exec` per call
// (lib/wp-cli.mjs keepAlivePlan — the same switch the seeder makes, for the same 2 s per call).
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { closeSync, constants as FS, fstatSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, lstatSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CONTAINER_GONE, createKeepAlive, keepAlivePlan, keepDefault, splitCommand } from '../lib/wp-cli.mjs'
import { USERMETA_KEY_PATTERN } from './prune-usermeta.mjs'

export const PLACEHOLDER_URL = 'https://quickstart.invalid'
export const DB_CONSTANTS = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
export const SALT_CONSTANTS = [
  'AUTH_KEY',
  'SECURE_AUTH_KEY',
  'LOGGED_IN_KEY',
  'NONCE_KEY',
  'AUTH_SALT',
  'SECURE_AUTH_SALT',
  'LOGGED_IN_SALT',
  'NONCE_SALT'
]

// ---------------------------------------------------------------- CLI arguments
// `spec` maps `--name` to { value: true|false, default, required, repeat, help }. Unknown flags are
// an error, `--help` prints the usage and exits 0 — every tool in this directory answers --help.
export function parseArgs(argv, spec, usage) {
  const out = {}
  const rest = []
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--help' || a === '-h') {
      console.log(usageText(spec, usage))
      process.exit(0)
    }
    if (!a.startsWith('--')) {
      rest.push(a)
      continue
    }
    const eq = a.indexOf('=')
    const name = eq === -1 ? a : a.slice(0, eq)
    const def = spec[name]
    if (!def) throw new UsageError(`unknown option ${name}`)
    if (def.value === false) {
      out[key(name)] = true
      continue
    }
    const value = eq === -1 ? args.shift() : a.slice(eq + 1)
    if (value === undefined) throw new UsageError(`${name} needs a value`)
    if (def.repeat) (out[key(name)] ||= []).push(value)
    else out[key(name)] = value
  }
  for (const [name, def] of Object.entries(spec)) {
    const k = key(name)
    if (out[k] === undefined) {
      if (def.required) throw new UsageError(`${name} is required`)
      if (def.default !== undefined) out[k] = def.default
      else if (def.value === false) out[k] = false
    }
  }
  out._ = rest
  return out
}
const key = (name) => name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
export class UsageError extends Error {}
export function usageText(spec, usage) {
  const lines = [usage, '']
  for (const [name, def] of Object.entries(spec)) {
    const head = def.value === false ? name : `${name} <${def.placeholder ?? 'value'}>`
    const tail = [
      def.help,
      def.required ? '(required)' : def.default !== undefined ? `(default: ${def.default})` : ''
    ]
      .filter(Boolean)
      .join(' ')
    lines.push(`  ${head.padEnd(30)} ${tail}`)
  }
  return lines.join('\n')
}
// Runs `main` and turns a UsageError into exit 2, any other error into exit 1 with the message.
export async function cli(main) {
  try {
    const code = await main()
    process.exit(typeof code === 'number' ? code : 0)
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`usage error: ${e.message} (try --help)`)
      process.exit(2)
    }
    console.error(`error: ${e.message}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------- deadlines
// One clock for a whole tool run (`--timeout`, seconds): `check(what)` throws once it is past,
// `remainingMs()` caps every spawn, and a timer ends the process should the run be waiting on
// something asynchronous when the clock runs out. A tool that stops answering ends with a named
// error, never a process that sits there — measured 14/09: a cycle typed by hand died in the
// middle of pack after eight minutes with nothing to say.
export function startDeadline(seconds, tool) {
  const until = Date.now() + seconds * 1000
  const timer = setTimeout(() => {
    console.error(`${tool}: timed out after ${seconds}s`)
    process.exit(1)
  }, seconds * 1000)
  timer.unref()
  return {
    until,
    remainingMs: () => Math.max(1, until - Date.now()),
    check: (what) => {
      if (Date.now() > until) throw new Error(`${tool}: timed out after ${seconds}s (at ${what})`)
    },
    stop: () => clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- wp runner
// One wp call that never returns (a container waiting on a database that is not there) must
// fail, not hang the whole cycle: TRACY_WP_TIMEOUT seconds per call, default 10 minutes, and no
// call outlives the tool's deadline.
const WP_TIMEOUT_MS = Number(process.env.TRACY_WP_TIMEOUT ?? 600) * 1000

export function wpRunner(runner, { keep = keepDefault(), spawn = spawnSync, deadline = null } = {}) {
  if (!runner) throw new UsageError('--wp "<runner>" is required')
  const plan = keep ? keepAlivePlan(splitCommand(runner)) : null
  const kept = plan ? createKeepAlive(plan, { spawn, env: process.env, log: (m) => console.error(m) }) : null
  const run = (args, opts = {}) => {
    deadline?.check(`wp ${args.slice(0, 3).join(' ')}`)
    const cap = Math.min(WP_TIMEOUT_MS, deadline?.remainingMs() ?? Infinity)
    const exec = () => {
      const argv = kept ? kept.argv(args) : ['sh', '-c', `${runner} "$@"`, 'wp', ...args]
      return spawn(argv[0], argv.slice(1), {
        encoding: 'utf8',
        maxBuffer: 1 << 30,
        stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        input: opts.input,
        env: process.env,
        timeout: cap
      })
    }
    let r = exec()
    if (kept && r.status !== 0 && CONTAINER_GONE.test(r.stderr ?? '')) {
      console.error(`wp-cli runner: container ${kept.name} is gone; starting another`)
      kept.reset()
      r = exec()
    }
    if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Error(`wp ${args.slice(0, 3).join(' ')} timed out after ${Math.round(cap / 1000)}s`) : r.error
    if (r.status !== 0 && !opts.allowFail) {
      const tail = (r.stderr || '')
        .trim()
        .split('\n')
        .filter((l) => !/^ *Container /.test(l))
        .slice(-4)
        .join(' | ')
      throw new Error(`wp ${args.join(' ')} exited ${r.status}: ${tail}`)
    }
    return opts.raw ? r : (r.stdout || '').replace(/\r/g, '')
  }
  run.json = (args) => {
    const out = run([...args, '--format=json']).trim()
    return out ? JSON.parse(out) : []
  }
  run.count = (args) => Number(run([...args, '--format=count']).trim() || 0)
  run.field = (args) => run(args).trim()
  run.dispose = () => kept?.dispose()
  return run
}

// ---------------------------------------------------------------- hashes and sums
/**
 * The bytes of a regular file, read through one descriptor opened without following a final symlink
 * and without waiting on a FIFO; the type is checked on that descriptor, so a file swapped between a
 * check and the read cannot be read in its place. Throws with `code` ELOOP (a symlink), ENOTREG
 * (anything but a regular file) or the open error's own code (ENOENT for a missing file).
 */
export function readRegularBytes(file) {
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ELOOP') throw Object.assign(new Error(`${file} is a symlink, not a regular file`), { code: 'ELOOP' })
    throw e
  }
  try {
    if (!fstatSync(fd).isFile()) throw Object.assign(new Error(`${file} is not a regular file`), { code: 'ENOTREG' })
    return readFileSync(fd)
  } finally {
    closeSync(fd)
  }
}
export function sha256File(file) {
  return createHash('sha256').update(readRegularBytes(file)).digest('hex')
}
export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}
// `SHA256SUMS` in the `sha256sum` layout — two spaces — so `sha256sum -c` and `shasum -a 256 -c`
// both read it.
export function sumsText(entries) {
  return entries.map(({ file, sha256 }) => `${sha256}  ${file}\n`).join('')
}
export function parseSums(text) {
  const out = []
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]{64})  (.+)$/)
    if (m) out.push({ sha256: m[1], file: m[2] })
  }
  return out
}
export function checkSums(dir, text) {
  const failures = []
  for (const { file, sha256 } of parseSums(text)) {
    let actual = null
    let error = null
    try {
      actual = sha256File(path.join(dir, file))
    } catch (e) {
      error = e
    }
    if (actual !== sha256) failures.push({ file, expected: sha256, actual, ...(error && { missing: error.code === 'ENOENT', error: error.message }) })
  }
  return failures
}

/** A pack artifact name as manifest.json and SHA256SUMS carry it: a plain file name in the pack dir. */
export const isArtifactName = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name) && !name.includes('..')

/** A theme directory name as WordPress keeps it under wp-content/themes: one plain segment. */
const isThemeSlug = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..')
const SHA256_RE = /^[0-9a-f]{64}$/
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * Every manifest.json field restore and verify act on, held to its exact shape — checked before
 * anything is wiped, so a pack whose sums hold but whose manifest lacks what a later step reads
 * never gets as far as that step. Pure; returns named problems.
 */
export function manifestProblems(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest.json is not a JSON object']
  const problems = []
  const need = (ok, what) => {
    if (!ok) problems.push(what)
  }
  need(manifest.schemaVersion === 'tracy-quickstart/v1', `manifest.json schemaVersion is ${JSON.stringify(manifest.schemaVersion)}, not "tracy-quickstart/v1"`)
  need(manifest.platform === 'wordpress', `manifest platform is ${manifest.platform}`)
  need(nonEmpty(manifest.id), 'manifest.json has no id')
  need(nonEmpty(manifest.version), 'manifest.json has no version')
  need(typeof manifest.wpVersion === 'string' && /^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/.test(manifest.wpVersion), `manifest.json wpVersion ${JSON.stringify(manifest.wpVersion)} is not a WordPress version`)
  need(isThemeSlug(manifest.theme?.name), `manifest.json theme.name ${JSON.stringify(manifest.theme?.name)} is not a theme directory name`)
  for (const key of ['webroot', 'database']) {
    const a = manifest[key]
    if (!a?.file) problems.push(`manifest.json names no ${key} archive`)
    else if (!isArtifactName(a.file)) problems.push(`manifest.json ${key}.file ${JSON.stringify(a.file)} is not a plain file name in the pack`)
    need(typeof a?.sha256 === 'string' && SHA256_RE.test(a.sha256), `manifest.json ${key}.sha256 ${JSON.stringify(a?.sha256)} is not a sha256`)
  }
  if (manifest.webroot?.file && manifest.webroot.file === manifest.database?.file) problems.push(`manifest.json names ${manifest.webroot.file} as both archives`)
  return problems
}

/**
 * A pack as restore and verify accept it: SHA256SUMS well formed and covering manifest.json and
 * both archives the manifest names (plain names in the pack dir), every hash matching the file on
 * disk and the manifest's own, and the manifest whole (manifestProblems). Throws one named error;
 * returns {manifest, sums, manifestSha} — manifestSha of the bytes that were parsed.
 */
export function readPack(pack) {
  // Every pack file is read through readRegularBytes: a link is never followed and a FIFO never
  // waited on, here and for each file the sums name.
  let text
  try {
    text = readRegularBytes(path.join(pack, 'SHA256SUMS')).toString('utf8')
  } catch (e) {
    if (e.code === 'ELOOP' || e.code === 'ENOTREG') throw new Error(`the pack has no readable SHA256SUMS: ${e.message}`)
    throw new Error(`the pack has no readable SHA256SUMS (${e.code ?? e.message})`)
  }
  const bad = text.split('\n').filter((l) => l.trim() && !/^[0-9a-f]{64} {2}\S.*$/.test(l))
  if (bad.length) throw new Error(`SHA256SUMS has lines that are not "<sha256>  <file>": ${bad.slice(0, 3).join(' | ')}`)
  const sums = parseSums(text)
  const byFile = new Map()
  for (const { file, sha256 } of sums) {
    if (!isArtifactName(file)) throw new Error(`SHA256SUMS names ${JSON.stringify(file)} — not a plain file name in the pack`)
    if (byFile.has(file)) throw new Error(`SHA256SUMS lists ${file} twice`)
    byFile.set(file, sha256)
  }
  if (!byFile.has('manifest.json')) throw new Error('SHA256SUMS does not cover manifest.json')
  const failures = checkSums(pack, text)
  if (failures.length) throw new Error(`SHA256SUMS mismatch: ${failures.map((f) => `${f.file}${f.actual ? '' : f.missing ? ' (missing)' : ` (${f.error})`}`).join(', ')}`)
  let manifest
  let manifestSha
  try {
    const bytes = readRegularBytes(path.join(pack, 'manifest.json'))
    manifestSha = sha256Text(bytes)
    manifest = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    throw new Error(`manifest.json cannot be read: ${e.message}`)
  }
  if (manifestSha !== byFile.get('manifest.json')) throw new Error(`manifest.json is ${manifestSha} now, SHA256SUMS says ${byFile.get('manifest.json')}`)
  const problems = manifestProblems(manifest)
  if (problems.length) throw new Error(`manifest.json does not hold what restore and verify need:\n  ${problems.join('\n  ')}`)
  for (const key of ['webroot', 'database']) {
    const a = manifest[key]
    if (!byFile.has(a.file)) throw new Error(`SHA256SUMS does not cover ${a.file} (the ${key} archive)`)
    if (byFile.get(a.file) !== a.sha256) throw new Error(`manifest.json says ${a.file} is ${a.sha256}, SHA256SUMS says ${byFile.get(a.file)}`)
  }
  return { manifest, sums, manifestSha }
}

/**
 * The identity of a pack as restore.json and parity.json bind to it — manifest.json's hash and the two
 * archives' sha256 from the manifest — read through readPack, so each is checked against the file on disk.
 */
export function packIdentity(pack) {
  const { manifest, manifestSha } = readPack(pack)
  return { manifest: manifestSha, webrootArchive: manifest.webroot.sha256, databaseArchive: manifest.database.sha256 }
}

// ---------------------------------------------------------------- restore ↔ verify binding
// What a restore report vouches for, and what verify must measure again before it takes the report
// as speaking for the stand it probes: the three pack artifacts (hashed from the bytes read) and the
// restore's target. One object, compared key by key — a field restore records is a field verify
// checks.
const BINDING_KEYS = ['manifest', 'webrootArchive', 'databaseArchive', 'webroot', 'siteUrl', 'runtimeUid']
export const normalSiteUrl = (u) => String(u ?? '').replace(/\/+$/, '')
/** Named differences between the binding a restore report carries and the one verify measured. */
export function bindingProblems(reported, measured) {
  if (!reported || typeof reported !== 'object') return ['the restore report carries no binding to a pack and a webroot (restored by an older restore.mjs?)']
  const out = []
  for (const k of BINDING_KEYS) {
    const want = measured?.[k]
    if (want === undefined || want === null) out.push(`${k}: not measured by verify — the restore report cannot be matched to it`)
    else if (reported[k] !== want) out.push(`the restore report is of ${k} ${JSON.stringify(reported[k] ?? null)}, not ${JSON.stringify(want)}`)
  }
  return out
}

// ---------------------------------------------------------------- wp-config.php
// The WordPress secret-key service's alphabet minus `)` and `;`: it already excludes the quote and
// the backslash so a value drops into a single-quoted PHP string unescaped, and without `);` no
// salt can end a define() early for the regex render_wp_config.py (and readDefine here) use.
const SALT_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*(-_ []{}<>~`+=,.:/?|'
export function generateSalt(length = 64) {
  let s = ''
  for (let i = 0; i < length; i++) s += SALT_ALPHABET[randomInt(SALT_ALPHABET.length)]
  return s
}
function phpString(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}
// Same regex as provision/render_wp_config.py: the value of `define('NAME', …);` up to the
// closing `);`, whatever shape it has (a literal, a getenv_docker() call, an expression).
function replaceDefine(source, name, phpLiteral) {
  const re = new RegExp(`(define\\s*\\(\\s*['"]${name}['"]\\s*,\\s*)[\\s\\S]*?(\\s*\\)\\s*;)`)
  let found = false
  const out = source.replace(re, (_, a, b) => {
    found = true
    return a + phpLiteral + b
  })
  return { source: out, found }
}
export function readDefine(source, name) {
  const m = source.match(new RegExp(`define\\s*\\(\\s*['"]${name}['"]\\s*,\\s*([\\s\\S]*?)\\s*\\)\\s*;`))
  return m ? m[1].trim() : null
}
// The literal a single-quoted define resolves to, or null when it is not a plain literal.
export function defineLiteral(source, name) {
  const raw = readDefine(source, name)
  const m = raw && raw.match(/^'((?:[^'\\]|\\.)*)'$/)
  return m ? m[1].replace(/\\(['\\])/g, '$1') : null
}

// Turns the build stand's wp-config.php into the one that ships in the webroot archive.
//
// Why rewrite rather than render fresh: the fleet's `render_wp_config.py` EDITS an existing file
// (it refuses one that does not define the four DB constants directly), and whatever the stand
// carried besides — the reverse-proxy HTTPS block, a custom constant — should survive. Why not
// ship the stand's file as it is: it is the official image's `wp-config-docker.php`, every value
// a `getenv_docker()` call, and both the fleet's `tracy_wp_table_prefix()` fallback and a person
// restoring by hand expect literals. And it carries the stand's salts.
//
// Result: DB constants are `{{DB_NAME}}`-style placeholders (PHP-valid, loud when left in place),
// `$table_prefix` is the literal prefix, the eight salts are fresh, WP_DEBUG is false, the
// `WORDPRESS_CONFIG_EXTRA` eval block is gone, and every other getenv_docker() call collapses to
// its default literal. Anything else in the file passes through unchanged — except a define
// outside STOCK_DEFINES, which stops the render unless `opts.keepDefines` names it.
export function renderQuickstartConfig(source, opts = {}) {
  const prefix = opts.prefix ?? 'tr_'
  const salts = opts.salts ?? Object.fromEntries(SALT_CONSTANTS.map((n) => [n, generateSalt()]))
  const placeholders = opts.placeholders ?? Object.fromEntries(DB_CONSTANTS.map((n) => [n, `{{${n}}}`]))
  // The official image writes wp-config.php with CRLF line ends (measured on the wp7 stand); the
  // block edits below anchor on newlines, and a shipped file is LF like every other core file.
  let out = source.replace(/\r\n/g, '\n')
  const missing = []
  for (const name of DB_CONSTANTS) {
    const r = replaceDefine(out, name, phpString(placeholders[name]))
    out = r.source
    if (!r.found) missing.push(name)
  }
  if (missing.length) throw new Error(`wp-config.php does not define ${missing.join(', ')} directly`)
  const missingSalts = []
  for (const name of SALT_CONSTANTS) {
    const r = replaceDefine(out, name, phpString(salts[name]))
    out = r.source
    if (!r.found) missingSalts.push(name)
  }
  if (missingSalts.length) throw new Error(`wp-config.php does not define ${missingSalts.join(', ')}`)
  // `$table_prefix = …;` — the one line the fleet's prefix fallback reads, and it reads only a
  // quoted literal on purpose (platform/wordpress.sh, tracy_wp_table_prefix).
  let prefixFound = false
  out = out.replace(/(\$table_prefix\s*=\s*)[^;]*;/, (_, a) => {
    prefixFound = true
    return `${a}${phpString(prefix)};`
  })
  if (!prefixFound) throw new Error('wp-config.php does not set $table_prefix')
  const dbg = replaceDefine(out, 'WP_DEBUG', 'false')
  out = dbg.source
  // The docker image's eval hook: nothing supplies WORDPRESS_CONFIG_EXTRA outside that image, and
  // an eval() of an environment variable is not something to ship.
  out = out.replace(
    /\n[^\n]*\$configExtra\s*=\s*getenv_docker\([^\n]*\{\s*\n[^\n]*eval\(\$configExtra\);\s*\n\}\n?/,
    '\n'
  )
  // Every remaining call collapses to its default; the helper itself goes once nothing calls it.
  out = out.replace(/!!getenv_docker\(\s*'[A-Z0-9_]+'\s*,\s*''\s*\)/g, 'false')
  out = out.replace(/getenv_docker\(\s*'[A-Z0-9_]+'\s*,\s*('(?:[^'\\]|\\.)*')\s*\)/g, '$1')
  out = out.replace(
    /\n\/\/ a helper function to lookup[^\n]*\nif \(!function_exists\('getenv_docker'\)\) \{[\s\S]*?\n\}\n/,
    '\n'
  )
  // A real call has an argument; a mention in a comment does not.
  const left = out.match(/getenv_docker\(\s*['"$][^)]*\)/g)
  if (left)
    throw new Error(
      `wp-config.php still calls getenv_docker() in a shape this cannot collapse: ${left.join(', ')}`
    )
  if (!/That's all, stop editing/.test(out))
    throw new Error('wp-config.php lacks the "That\'s all, stop editing" marker the fleet anchors on')
  // A webroot that was restored into a stand carries the two lines renderRestoreConfig added; they are the restore's,
  // not the design's, and a --keep-define of either keeps it.
  for (const name of ['WP_HOME', 'WP_SITEURL'])
    if (!(opts.keepDefines ?? []).includes(name)) out = out.replace(new RegExp(`^define\\(\\s*'${name}'\\s*,\\s*'(?:[^'\\\\]|\\\\.)*'\\s*\\);[ \\t]*\\n`, 'm'), '')
  const extra = unknownDefines(out, opts.keepDefines)
  if (extra.length)
    throw new Error(
      `wp-config.php defines ${extra.join(', ')} beyond WordPress's stock settings — a setting only the build stand needs goes in the stand's WORDPRESS_CONFIG_EXTRA (its eval block never ships); one the design needs ships only with --keep-define <NAME>`
    )
  return { source: out, salts, placeholders, prefix }
}

// The accepted wp-config.php of a shipped webroot is one text: the official image's `wp-config-docker.php`, verbatim (assets/quickstart/wp-config-docker.php), as renderQuickstartConfig
// writes it. A file is compared with it line by line after line endings are made LF; only the values that differ between sites
// may differ: the four DB_* values, the eight keys and salts and the `$table_prefix` value, each one single-quoted PHP literal
// on its line. Nothing else is read as PHP: a comment, a space, another define or an extra statement is a difference.
const CONFIG_FIXTURE = new URL('../../assets/quickstart/wp-config-docker.php', import.meta.url)
const CONFIG_SLOTS = [...DB_CONSTANTS, ...SALT_CONSTANTS, 'PREFIX']
const SLOT_LITERAL = "'(?:[^'\\\\\\n]|\\\\['\\\\])*'"
let acceptedConfigLines = null
function acceptedConfig() {
  if (acceptedConfigLines) return acceptedConfigLines
  const tag = (n) => `@@SLOT-${n}@@`
  const text = renderQuickstartConfig(readFileSync(CONFIG_FIXTURE, 'utf8'), {
    prefix: tag('PREFIX'),
    salts: Object.fromEntries(SALT_CONSTANTS.map((n) => [n, tag(n)])),
    placeholders: Object.fromEntries(DB_CONSTANTS.map((n) => [n, tag(n)]))
  }).source
  acceptedConfigLines = text.split('\n').map((line) => {
    const slots = CONFIG_SLOTS.filter((n) => line.includes(`'${tag(n)}'`))
    const re = new RegExp('^' + line.split(/('@@SLOT-[A-Z_]+@@')/).map((part) => (/^'@@SLOT-/.test(part) ? SLOT_LITERAL : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$')
    return { line, re, slots }
  })
  return acceptedConfigLines
}

/** Where a wp-config.php differs from the accepted form: messages naming `label`, empty when it is the accepted form. A line with a value that may differ is not quoted. */
export function configFormProblems(source, label = 'wp-config.php') {
  const want = acceptedConfig()
  const have = String(source).replace(/\r\n?/g, '\n').split('\n')
  const n = Math.max(want.length, have.length)
  for (let i = 0; i < n; i++) {
    const w = want[i]
    const h = have[i]
    if (w && h !== undefined && w.re.test(h)) continue
    const quote = (x) => x.replace(/'@@SLOT-([A-Z_]+)@@'/g, '<$1>').replace(/^(.{100}).+$/, '$1…')
    if (!w) return [`${label} differs from the accepted form: line ${i + 1} is beyond its end (${want.length} lines)`]
    if (h === undefined) return [`${label} differs from the accepted form: it ends at line ${have.length}, the accepted form has ${want.length} lines (line ${i + 1}: ${quote(w.line)})`]
    const expected = w.slots.length ? `a line shaped ${JSON.stringify(quote(w.line))} with the site's own value` : JSON.stringify(quote(w.line))
    return [`${label} differs from the accepted form at line ${i + 1}: expected ${expected}${w.slots.length ? '' : `, found ${JSON.stringify(quote(h))}`}`]
  }
  return []
}

export const CONFIG_MEMBERS = ['wp-config.php']

/**
 * The wp-config.php of an archive, from `listArchive` rows read with CONFIG_MEMBERS: {problems, text}. The whole member
 * list is held to restore's rule (`unsafeMembers`) first; only then is the member restore installs, `wp-config.php`, read
 * as UTF-8 and compared with the accepted form.
 */
export function archiveConfig(rows, label) {
  const unsafe = unsafeMembers(rows)
  if (unsafe.length) return { problems: [`${label}: the archive carries members restore will not extract: ${unsafe.join('; ')}`], text: null }
  const row = rows.find((r) => r.name === 'wp-config.php')
  if (!row) return { problems: [`${label}: wp-config.php missing from the archive`], text: null }
  if (row.type !== 'file' || !row.content) return { problems: [`${label}: wp-config.php in the archive is ${row.type === 'file' ? 'unreadable' : `a ${row.type}`}, not a regular file`], text: null }
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(row.content)
  } catch {
    return { problems: [`${label}: wp-config.php is not valid UTF-8`], text: null }
  }
  return { problems: configFormProblems(text, `${label} wp-config.php`), text }
}

// What WordPress's own wp-config.php defines — the image's `wp-config-docker.php` and every clean
// quickstart shipped so far (Tracy Base 1.0.0, Tracy Business 1.0.0–1.2.0) define exactly these.
// Why the render refuses anything else: Kinetic 1.0.0 shipped the stand's egress block and updater
// switch (WP_HTTP_BLOCK_EXTERNAL, AUTOMATIC_UPDATER_DISABLED), so its first Install demo on dev could
// not download the cowork plugin (25/09). A constant the design really needs still ships, named by
// --keep-define.
export const STOCK_DEFINES = [...DB_CONSTANTS, 'DB_CHARSET', 'DB_COLLATE', ...SALT_CONSTANTS, 'WP_DEBUG', 'ABSPATH']
// Names a wp-config.php defines, lines that are comments left out (`// define(…)` defines nothing).
export function configDefines(source) {
  const names = new Set()
  for (const line of source.split('\n')) {
    if (/^\s*(\/\/|#|\/\*|\*)/.test(line)) continue
    for (const m of line.matchAll(/\bdefine\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) names.add(m[1])
  }
  return [...names]
}
export function unknownDefines(source, keep = []) {
  return configDefines(source).filter((n) => !STOCK_DEFINES.includes(n) && !keep.includes(n))
}

// What restore.mjs does — the same edit `render_wp_config.py` makes on the fleet, so a restore on
// the verify stand exercises the exact seam the fleet will.
export function renderRestoreConfig(source, db, siteUrl) {
  let out = source
  const wanted = { DB_NAME: db.name, DB_USER: db.user, DB_PASSWORD: db.password, DB_HOST: db.host }
  const missing = []
  for (const name of DB_CONSTANTS) {
    const r = replaceDefine(out, name, phpString(wanted[name]))
    out = r.source
    if (!r.found) missing.push(name)
  }
  if (missing.length) throw new Error(`wp-config.php does not define ${missing.join(', ')} directly`)
  if (siteUrl) {
    for (const name of ['WP_HOME', 'WP_SITEURL']) {
      const r = replaceDefine(out, name, phpString(siteUrl))
      out = r.source
      if (!r.found) {
        const block = `define('${name}', ${phpString(siteUrl)});\n`
        const anchor = out.match(/^.*That's all, stop editing.*$/m)
        out = anchor
          ? out.slice(0, anchor.index) + block + out.slice(anchor.index)
          : out.replace(/(<\?php\s*\n)/, `$1${block}`)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- webroot walk + excludes
// What never ships from a webroot, whatever the prune audit says about the database. Matched on
// the path relative to the webroot, forward slashes, no leading `./`.
const FILE_EXCLUDES = [
  { test: (p) => p === 'wp-content/debug.log' || p.endsWith('/debug.log'), why: 'debug log' },
  {
    test: (p) => /^wp-content\/upgrade\/./.test(p),
    why: 'upgrade scratch space (the directory itself ships empty)'
  },
  { test: (p) => /^wp-content\/cache(\/|$)/.test(p), why: 'page/object cache' },
  { test: (p) => /(^|\/)\.DS_Store$/.test(p), why: 'Finder metadata' },
  { test: (p) => /(^|\/)\._[^/]*$/.test(p), why: 'AppleDouble sidecar' },
  { test: (p) => /(^|\/)\.git(\/|$|ignore$|attributes$|modules$)/.test(p), why: 'git' },
  { test: (p) => /(^|\/)node_modules(\/|$)/.test(p), why: 'node_modules' },
  { test: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p), why: 'env file' },
  { test: (p) => /(^|\/)apply\.json$/.test(p), why: 'seeder apply record' },
  { test: (p) => p === 'wp-config-docker.php', why: 'docker image template' },
  { test: (p) => /(^|\/)\.(idea|vscode|ddev)(\/|$)/.test(p), why: 'editor/dev tooling' },
  { test: (p) => /\.(log|swp|orig|rej|bak)$/.test(p), why: 'log/backup/editor file' }
]
export function excludeReason(rel) {
  for (const e of FILE_EXCLUDES) if (e.test(rel)) return e.why
  return null
}
// Lists every path under `root` as [{rel, kind: 'file'|'dir'|'symlink', size}], excludes applied,
// sorted, directories included so empty ones (uploads/, upgrade/) survive the archive.
/** `dev:ino` of a directory, as stat(2) gives it (bigint: an inode past 2^53 stays exact). */
export const dirIdentity = (p) => {
  const st = lstatSync(p, { bigint: true })
  if (!st.isDirectory()) throw new Error(`${p} is ${st.isSymbolicLink() ? 'a symlink' : 'not a directory'} now`)
  return `${st.dev}:${st.ino}`
}

// The walk reads the webroot's real path (a symlinked ancestor resolved once) and records the
// directory's identity; a root swapped for another directory while it is walked is refused, and
// pack holds archive.py and the published archive to the same identity (`rootId`).
export function walkWebroot(webroot, opts = {}) {
  const root = realpathSync(webroot)
  const rootId = dirIdentity(root)
  const extra = opts.extraExcludes ?? []
  const kept = []
  const dropped = []
  const visit = (rel) => {
    const abs = rel ? path.join(root, rel) : root
    for (const name of readdirSync(abs).sort()) {
      const r = rel ? `${rel}/${name}` : name
      const why =
        excludeReason(r) ?? (extra.some((x) => r === x || r.startsWith(x + '/')) ? 'excluded by flag' : null)
      if (why) {
        dropped.push({ rel: r, why })
        continue
      }
      const st = lstatSync(path.join(root, r))
      if (st.isSymbolicLink()) {
        dropped.push({ rel: r, why: 'symlink (the fleet extracts only files and directories)' })
        continue
      }
      if (st.isDirectory()) {
        kept.push({ rel: r, kind: 'dir', size: 0 })
        visit(r)
      } else kept.push({ rel: r, kind: 'file', size: st.size })
    }
  }
  visit('')
  if (dirIdentity(root) !== rootId) throw new Error(`the webroot ${root} was replaced while it was walked`)
  return { kept, dropped, root, rootId }
}

// What sits at the root of a WordPress webroot: core's own files and folders, plus wp-config.php
// and .htaccess. Measured on every clean quickstart shipped so far (Tracy Base 1.0.0, Tracy
// Business 1.0.0–1.2.0, Kinetic 1.0.0 once cleaned): these 21 names, nothing else.
// Why pack refuses any other root entry instead of adding to FILE_EXCLUDES: Kinetic 1.0.0 shipped
// 49 build-stand files at the webroot root (25/09), served to the public — probe pages, a copy of
// wp-config.php, and a script that deletes users and terms when run inside WordPress. The agents
// had "cleaned" them by renaming (`.done.<pid>`, `.discarded`), and `wp-config.php.bak-step3`
// slipped past the `.bak` rule. A prune list only knows the junk it has already seen; this list
// knows what WordPress is. An entry the design really ships is named by --keep-root.
const WP_ROOT_NAMES = [
  '.htaccess', 'index.php', 'license.txt', 'readme.html', 'wp-activate.php', 'wp-admin',
  'wp-blog-header.php', 'wp-comments-post.php', 'wp-config-sample.php', 'wp-config.php', 'wp-content',
  'wp-cron.php', 'wp-includes', 'wp-links-opml.php', 'wp-load.php', 'wp-login.php', 'wp-mail.php',
  'wp-settings.php', 'wp-signup.php', 'wp-trackback.php', 'xmlrpc.php'
]
/** Root entries of `rels` (webroot-relative paths, `./` or trailing `/` allowed) outside WP_ROOT_NAMES and `keep`. */
export function rootStrangers(rels, keep = []) {
  const roots = new Set(rels.map((r) => r.replace(/^\.\//, '').split('/')[0]).filter((n) => n && n !== '.'))
  return [...roots].filter((n) => !WP_ROOT_NAMES.includes(n) && !keep.includes(n)).sort()
}

// ---------------------------------------------------------------- prune classification
// Pure: takes the facts prune-audit.mjs collects (or a fixture) and returns the verdict rows.
// `facts` = { admin, siteUrl, options: {siteurl, home}, transients: [name], siteTransients: [name],
//   revisions: [{ID, post_title}], autoDrafts: [...], trash: [...], users: [{ID, user_login, roles}],
//   standOptions: [name], sessions: [{user_login, count}], files: [{rel, why}], config: {salts: bool,
//   dbLiteral: bool}, media: parseRefs(…) + {files: [{rel, text}]} (see classifyMedia),
//   searchViews: searchViewsOf(page-map) (optional), keepDrafts: [id] (optional, --keep-draft) }
export function classifyPrune(facts) {
  const rows = []
  const say = (area, item, verdict, why, remove) => rows.push({ area, item, verdict, why, remove })
  // Transients are not removed from the stand: WordPress writes some again on every bootstrap,
  // this audit's own wp-cli calls included, so a re-audit would never read zero. export-db's
  // scrub-sql.py drops every transient row from the dump instead — that is where none may ship.
  for (const name of facts.transients ?? [])
    say('option', name, 'KEEP', 'transient — regenerated on every load; export-db scrubs it from the dump')
  for (const name of facts.siteTransients ?? [])
    say('option', name, 'KEEP', 'site transient — regenerated on every load; export-db scrubs it from the dump')
  for (const name of facts.standOptions ?? [])
    say('option', name, 'PRUNE', 'stand-only option — set per site by the seeder/provisioner', {
      wp: ['option', 'delete', name]
    })
  // 🔒 The status a row CARRIES decides, not the query that found it. `wp post list
  // --post_status=trash` answered with two PUBLISHED posts on wp-tracy-business (15/09, Polylang
  // on the stand), the same two came back from `--post_status=auto-draft`, and `--apply` force-
  // deleted the site's two featured articles — the header of this file promises "a published post
  // or page is never touched". A row with no status at all is UNKNOWN: a person looks.
  // The TYPE it carries too: a revision query that answers an attachment (status inherit) or a
  // page is not listing a revision. A row missing either is UNKNOWN; applyPrune re-checks both.
  const deletable = new Set(['revision', 'auto-draft', 'trash', 'draft', 'inherit'])
  const postRow = (p, kind, why, expected, expectedType) => {
    const item = `#${p.ID} ${p.post_title ?? ''}`.trim()
    const status = typeof p.post_status === 'string' && p.post_status ? p.post_status : null
    const type = typeof p.post_type === 'string' && p.post_type ? p.post_type : null
    if (status === null) return say(kind, item, 'UNKNOWN', `${why} — the stand did not report a status; check it by hand`)
    // A status that is not the one queried keeps the row whatever its type; only then is the type needed.
    if (!deletable.has(status) || (expected && status !== expected))
      return say(kind, item, 'KEEP', `listed as ${expected ?? kind} but its status is ${status} — the query lied, the row stays`)
    if (type === null) return say(kind, item, 'UNKNOWN', `${why} — the stand did not report a type; check it by hand`)
    if (expectedType && type !== expectedType)
      return say(kind, item, 'KEEP', `listed as ${kind} but it is a ${type} — the query lied, the row stays`)
    const remove = postRemoval(p)
    if (!remove) return say(kind, item, 'UNKNOWN', `${why} — the stand gave no usable id; check it by hand`)
    return say(kind, item, 'PRUNE', why, remove)
  }
  for (const p of facts.revisions ?? [])
    postRow(p, 'post:revision', 'revision — editing history of the build, not content', 'inherit', 'revision')
  for (const p of facts.autoDrafts ?? [])
    postRow(p, 'post:auto-draft', 'auto-draft left by an editor session', 'auto-draft')
  for (const p of facts.trash ?? [])
    postRow(p, 'post:trash', 'trashed — already discarded by the builder', 'trash')
  const admin = (facts.users ?? []).find((u) => u.user_login === facts.admin)
  if (!admin)
    say(
      'user',
      facts.admin ?? '(none)',
      'UNKNOWN',
      'the declared quickstart admin does not exist on the stand — pass --admin <login>'
    )
  // An author the SPEC declares is content, not a builder trace: the article byline is a measured
  // part of the design (wp-tracy-business ships "Sergey Trofimov"), and deleting the user reassigns
  // every post to the admin — the shipped quickstart would then show a byline no source page has
  // (measured 15/09: the prune reassigned both authors and the article read "tracyagent").
  const keep = new Set(facts.keepUsers ?? [])
  // The users the seeder created for the source's authors (user meta tracy_source_author, read for
  // EVERY user in one pass: collectAuthorMeta) are content as a --keep-user is: the seeder filed each
  // article under its author, and deleting them reassigns every article to the admin (JA Vega M6-7:
  // nine authors of 56 articles). Each candidate needs its own answer — a row with its id, the same
  // login and a yes/no — before it is PRUNE: a list that could not be read, facts collected before
  // it existed, or a user the answer leaves out is UNKNOWN, since an author cannot be told from a
  // builder's account. applyPrune reads the answer again right before it deletes.
  const meta = Array.isArray(facts.authorMeta) ? facts.authorMeta : null
  const metaWhy = meta ? null : facts.authorMeta?.error ?? (facts.authorMeta === undefined ? 'not measured (facts without authorMeta)' : 'the answer was not a list')
  const idOf = (u) => (isPositiveId(u?.ID) ? Number(u.ID) : null)
  for (const u of facts.users ?? []) {
    const m = meta && idOf(u) !== null ? meta.filter((r) => idOf(r) === idOf(u)) : []
    if (u.user_login === facts.admin)
      say(
        'user',
        u.user_login,
        'KEEP',
        `the quickstart admin (${(u.roles || []).join?.(',') || u.roles}); password blanked at pack`
      )
    else if (keep.has(u.user_login))
      say('user', u.user_login, 'KEEP', 'an author the spec declares — content, and a byline the design measures')
    else if (!meta)
      say('user', u.user_login, 'UNKNOWN', `whether the seeder created this author could not be read (${metaWhy}) — check user meta ${SEEDED_AUTHOR_META}, or pass --keep-user`)
    else if (idOf(u) === null)
      say('user', u.user_login, 'UNKNOWN', `the user list gave no usable id (${JSON.stringify(u.ID ?? null)}) — check it by hand`)
    else if (m.length !== 1 || m[0].user_login !== u.user_login || typeof m[0].seeded !== 'boolean')
      say('user', u.user_login, 'UNKNOWN', `the author-meta read has ${m.length ? 'no matching yes/no' : 'no row'} for user #${idOf(u)} ${u.user_login} — check user meta ${SEEDED_AUTHOR_META} by hand`)
    else if (m[0].seeded)
      say('user', u.user_login, 'KEEP', `an author the seeder created for the source (user meta ${SEEDED_AUTHOR_META}) — content, its articles keep their byline`)
    // A user who still owns kept content — published posts, or an avatar the author pages show — is
    // content too, marked or not: deleting it reassigns the posts and orphans the avatar (ja-fresco
    // S-32: five authors of the author grid, seeded without the meta, lost with their avatars).
    else if (m[0].owns > 0)
      say('user', u.user_login, 'KEEP', `owns ${m[0].owns} kept item(s) (published posts it authors, avatars in its user meta) — content, deleting it would reassign or orphan them`)
    else
      say(
        'user',
        u.user_login,
        'PRUNE',
        'not the declared admin — content reassigned to the admin',
        isPositiveId(admin?.ID) ? { wp: ['user', 'delete', String(idOf(u)), `--reassign=${Number(admin.ID)}`, '--yes'], expect: { user_login: u.user_login } } : undefined
      )
  }
  rows.push(...classifyDraftPages(facts.media, { searchViews: facts.searchViews ?? null, keepDrafts: facts.keepDrafts ?? [] }))
  for (const s of facts.sessions ?? [])
    if (s.count > 0)
      say('session', s.user_login, 'PRUNE', `${s.count} login session(s) — the builder's cookies`, {
        wp: ['user', 'session', 'destroy', s.user_login, '--all']
      })
  for (const name of ['siteurl', 'home']) {
    const v = facts.options?.[name]
    if (v === undefined) continue
    if (v === facts.siteUrl) say('option', name, 'KEEP', `${v} — export-db rewrites it to the placeholder`)
    else if (v === PLACEHOLDER_URL) say('option', name, 'KEEP', 'already the placeholder')
    else
      say(
        'option',
        name,
        'PRUNE',
        `${v} is neither --site-url nor the placeholder — the export would ship it unchanged`
      )
  }
  for (const f of facts.files ?? []) say('file', f.rel, 'PRUNE', f.why, { rm: f.rel })
  // Media and WordPress's default content (classifyMedia). Facts collected before this check
  // existed carry no `media`: that is "not measured", an UNKNOWN row, not a clean answer.
  rows.push(...classifyMedia(facts.media))
  if (facts.config) {
    say(
      'wp-config',
      'salts',
      facts.config.salts ? 'KEEP' : 'UNKNOWN',
      facts.config.salts
        ? 'pack.mjs replaces all eight with fresh values'
        : 'no salts defined — pack.mjs will refuse'
    )
    say(
      'wp-config',
      'DB constants',
      facts.config.dbDefined ? 'KEEP' : 'UNKNOWN',
      facts.config.dbDefined
        ? 'pack.mjs replaces them with {{DB_*}} placeholders'
        : 'not defined directly — render_wp_config.py on the fleet will refuse'
    )
  }
  return rows
}

/**
 * A WordPress row id: a positive safe integer, or its decimal digits — never null, '' or 0 (Number()
 * makes those 0), and never one past Number.MAX_SAFE_INTEGER, which Number() rounds to its neighbour
 * (9007199254740993 → …992): a delete aimed at that would remove another row.
 */
export function isPositiveId(v) {
  return (typeof v === 'number' || (typeof v === 'string' && /^[1-9]\d*$/.test(v))) && Number.isSafeInteger(Number(v)) && Number(v) > 0
}

/**
 * The removal of one post row: `wp post delete <id> --force` with the type and status the audit saw,
 * which staleRemoval requires both of before anything is deleted — or null when the row has no
 * usable id, type or status (the caller makes it UNKNOWN).
 */
function postRemoval(p) {
  if (!isPositiveId(p?.ID)) return null
  for (const k of ['post_type', 'post_status']) if (typeof p[k] !== 'string' || !p[k]) return null
  return { wp: ['post', 'delete', String(Number(p.ID)), '--force'], expect: { post_type: p.post_type, post_status: p.post_status } }
}

/** The user meta the seeder puts on every author it creates (seed.mjs AUTHOR_ID_META). */
const SEEDED_AUTHOR_META = 'tracy_source_author'

// Ownership and status, read straight from the tables in one `wp eval` (no user or post query
// filter hides a row): every user with whether it carries SEEDED_AUTHOR_META, and — for the
// re-read applyPrune makes right before it deletes — the type and status of the given post ids.
export const OWNERS_MARKER = '__TRACY_OWNERS__'
export function ownersPhp(postIds = []) {
  const ids = postIds.map((v) => (isPositiveId(v) ? Number(v) : null))
  if (ids.includes(null)) throw new Error(`ownersPhp: not a post id in ${JSON.stringify(postIds)}`)
  const posts = ids.length
    ? `$o['posts'] = $wpdb->get_results("SELECT ID, post_type, post_status FROM {$wpdb->posts} WHERE ID IN (${ids.join(',')})", ARRAY_A);`
    : ''
  return String.raw`global $wpdb;
$o = array('posts' => array(), 'users' => null);
${posts}
$o['users'] = $wpdb->get_results($wpdb->prepare("SELECT u.ID, u.user_login, (SELECT COUNT(*) FROM {$wpdb->usermeta} m WHERE m.user_id = u.ID AND m.meta_key = %s) AS seeded, (SELECT COUNT(*) FROM {$wpdb->posts} p WHERE p.post_author = u.ID AND p.post_type NOT IN ('revision', 'attachment') AND p.post_status IN ('publish', 'private', 'future')) + (SELECT COUNT(*) FROM {$wpdb->usermeta} a JOIN {$wpdb->posts} f ON f.ID = a.meta_value AND f.post_type = 'attachment' WHERE a.user_id = u.ID AND (a.meta_key = 'tracy_avatar' OR a.meta_key REGEXP '${USERMETA_KEY_PATTERN}')) AS owns FROM {$wpdb->users} u ORDER BY u.ID", '${SEEDED_AUTHOR_META}'), ARRAY_A);
echo "\n" . '${OWNERS_MARKER}' . wp_json_encode($o);`
}

/**
 * What ownersPhp printed: `{ users: [{ ID, user_login, seeded }], posts: [{ ID, post_type, post_status }] }`,
 * or `{ error }` when the marker, a list, an id, a login, a count or a status is missing or malformed,
 * or an id repeats — a partial answer is not "no one else is an author".
 */
export function parseOwners(stdout) {
  const at = String(stdout ?? '').lastIndexOf(OWNERS_MARKER)
  if (at === -1) return { error: 'wp eval printed no ownership data' }
  let o
  try {
    o = JSON.parse(String(stdout).slice(at + OWNERS_MARKER.length).trim())
  } catch (e) {
    return { error: `ownership data is not JSON: ${e.message}` }
  }
  if (!o || !Array.isArray(o.users) || !Array.isArray(o.posts)) return { error: 'ownership data has no users or posts list' }
  const users = []
  for (const r of o.users) {
    if (!r || !isPositiveId(r.ID) || typeof r.user_login !== 'string' || !r.user_login || !/^\d+$/.test(String(r.seeded ?? '')))
      return { error: `ownership data has a user row without id, login or count: ${JSON.stringify(r)}` }
    // `owns` (published posts it authors + avatars it names, ja-fresco S-32): a read without it is a count not taken
    if (r.owns !== undefined && !/^\d+$/.test(String(r.owns))) return { error: `ownership data has a user row whose owns is not a count: ${JSON.stringify(r)}` }
    users.push({ ID: Number(r.ID), user_login: r.user_login, seeded: Number(r.seeded) > 0, ...(r.owns !== undefined ? { owns: Number(r.owns) } : {}) })
  }
  const posts = []
  for (const r of o.posts) {
    if (!r || !isPositiveId(r.ID) || typeof r.post_type !== 'string' || !r.post_type || typeof r.post_status !== 'string' || !r.post_status)
      return { error: `ownership data has a post row without id, type or status: ${JSON.stringify(r)}` }
    posts.push({ ID: Number(r.ID), post_type: r.post_type, post_status: r.post_status })
  }
  for (const list of [users, posts])
    if (new Set(list.map((r) => r.ID)).size !== list.length) return { error: 'ownership data names one id twice' }
  return { users, posts }
}

/**
 * Why a PRUNE row may no longer be removed, from `now` (parseOwners of the re-read), or null when
 * the stand still holds what the audit saw. Post and user deletions only; the rest pass.
 */
export function staleRemoval(row, now) {
  const [kind, verb, idArg] = row.remove?.wp ?? []
  if (verb !== 'delete' || (kind !== 'post' && kind !== 'user')) return null
  if (now?.error) return `the re-read before removal failed (${now.error})`
  const expect = row.remove.expect
  if (!expect || typeof expect !== 'object') return 'the audit recorded nothing to re-check it against'
  if (!isPositiveId(idArg)) return `${JSON.stringify(idArg)} is not a usable id`
  const id = Number(idArg)
  if (kind === 'post') {
    // Both, always: a status alone lets a revision that became a page (still `inherit`) through.
    for (const k of ['post_type', 'post_status'])
      if (typeof expect[k] !== 'string' || !expect[k]) return `the audit recorded no ${k} to re-check it against`
    const p = now.posts.find((r) => r.ID === id)
    if (!p) return `post #${id} is no longer on the stand`
    for (const k of ['post_type', 'post_status'])
      if (p[k] !== expect[k]) return `its ${k} is now ${p[k]}, the audit saw ${expect[k]}`
    return null
  }
  if (typeof expect.user_login !== 'string' || !expect.user_login) return 'the audit recorded no login to re-check it against'
  const u = now.users.find((r) => r.ID === id)
  if (!u) return `user #${id} is no longer on the stand`
  if (u.user_login !== expect.user_login) return `user #${id} is now ${u.user_login}, the audit saw ${expect.user_login}`
  if (u.seeded) return `user #${id} now carries ${SEEDED_AUTHOR_META} — an author the seeder created`
  if (u.owns > 0) return `user #${id} now owns ${u.owns} kept item(s)`
  return null
}

/**
 * The `from` paths of a `<theme>_redirects` option as the table holds it. The seeder writes it with
 * `wp option update --format=json`, which stores a PHP array — serialized (`a:1:{i:0;a:3:{s:4:"from";
 * s:12:"/blog-detail";…}}`), never the JSON text; a JSON value (an option set by hand) is read too.
 * A serialized string is read by its declared byte length. Anything else names no path.
 */
export function redirectSources(value) {
  const text = String(value ?? '')
  try {
    const list = JSON.parse(text)
    return Array.isArray(list) ? list.filter((r) => r && typeof r.from === 'string').map((r) => r.from) : []
  } catch {}
  if (!/^a:\d+:\{/.test(text)) return []
  const bytes = Buffer.from(text, 'utf8')
  const out = []
  const key = Buffer.from('s:4:"from";s:')
  for (let at = bytes.indexOf(key); at !== -1; at = bytes.indexOf(key, at + 1)) {
    const m = /^(\d+):"/.exec(bytes.subarray(at + key.length, at + key.length + 12).toString('latin1'))
    if (!m) continue
    const start = at + key.length + m[0].length
    const end = start + Number(m[1])
    if (end + 2 > bytes.length || bytes.subarray(end, end + 2).toString('latin1') !== '";') continue
    out.push(bytes.subarray(start, end).toString('utf8'))
  }
  return out
}

/**
 * The options WordPress core sets to name a page that is meant to exist — each one matched by its
 * whole name: an option that only ends like one (`x_page_for_privacy_policy`) names nothing. The
 * seeder's own, the 404 template's words (seed.mjs notFoundOption), is `<theme>_404_page` for the
 * theme the stand runs (its `stylesheet` option) and only that one: `fake_404_page`, or the option
 * of a theme the stand does not run, names nothing (pageOptionNames).
 */
const CORE_PAGE_OPTIONS = ['page_on_front', 'page_for_posts', 'wp_page_for_privacy_policy']
/** The option names that record a page meant to exist on this stand, from its options (REFS_PHP `options`). */
function pageOptionNames(options = []) {
  const names = new Set(CORE_PAGE_OPTIONS)
  const sheet = options.filter((o) => o.option_name === 'stylesheet').map((o) => String(o.option_value ?? '').trim())
  // one stylesheet, a theme slug: seed.mjs names the option after it (hyphens → underscores)
  if (sheet.length === 1 && /^[a-z0-9][a-z0-9_-]*$/i.test(sheet[0])) names.add(`${sheet[0].replace(/-/g, '_')}_404_page`)
  return names
}
const normPath = (p) => {
  let s = String(p)
  try {
    s = decodeURIComponent(s)
  } catch {}
  return s.replace(/\/+$/, '').toLowerCase() || '/'
}

/**
 * The search views a page-map declares, `Map<normalised path, [view…]>` — every view declared at
 * the path of a search view, so a path two entries claim with different views is seen as such.
 * A page-map that is not an object with a non-empty `pages` list, or a search entry without a
 * path, throws: a page-map that was asked for and could not be read is an error, never "no search
 * view" (and never a KEEP).
 */
export function searchViewsOf(pageMap, source = 'page-map') {
  if (!pageMap || typeof pageMap !== 'object' || Array.isArray(pageMap) || !Array.isArray(pageMap.pages))
    throw new UsageError(`${source}: not a page-map (an object with a "pages" list)`)
  if (!pageMap.pages.length) throw new UsageError(`${source}: the page-map lists no page`)
  const views = new Map()
  // Every entry, not only the search ones: a path two entries claim is only seen when each entry's
  // path can be read, so an entry whose path or view is not usable makes the whole map unusable.
  for (const [i, p] of pageMap.pages.entries()) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new UsageError(`${source}: pages[${i}] is not an object`)
    if (typeof p.view !== 'string' || !p.view.trim()) throw new UsageError(`${source}: pages[${i}] has no view`)
    if (typeof p.path !== 'string' || !p.path.startsWith('/')) throw new UsageError(`${source}: pages[${i}] (view ${p.view}) has no path starting with /`)
  }
  const search = new Set(pageMap.pages.filter((p) => p.view === 'search').map((p) => normPath(p.path)))
  for (const p of pageMap.pages) {
    const k = normPath(p.path)
    if (!search.has(k)) continue
    if (!views.has(k)) views.set(k, [])
    views.get(k).push(p.view)
  }
  return views
}

/** Read `--page-map` for the audit: a regular file (never a FIFO, directory or symlink), JSON, a page-map. */
export function readSearchViews(file) {
  let st
  try {
    st = lstatSync(file)
  } catch (e) {
    throw new UsageError(`--page-map ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`)
  }
  if (!st.isFile()) throw new UsageError(`--page-map ${file}: not a regular file`)
  let j
  try {
    j = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new UsageError(`--page-map ${file}: not JSON (${e.message})`)
  }
  return searchViewsOf(j, `--page-map ${file}`)
}

/**
 * `--keep-draft` values as ids: each a positive safe integer, repeats folded, in ascending order.
 * Anything else throws — a decision about the wrong page is worse than none.
 */
export function parseKeepDrafts(values = []) {
  const ids = []
  for (const v of values) {
    if (!isPositiveId(String(v).trim())) throw new UsageError(`--keep-draft ${JSON.stringify(v)}: not a page id (a positive integer)`)
    ids.push(Number(String(v).trim()))
  }
  return [...new Set(ids)].sort((a, b) => a - b)
}

/**
 * Why the `--keep-draft` ids cannot be recorded against this stand, or [] when every one is a
 * draft page on it. Drafts that were not measured cannot be checked, so no id is accepted then.
 */
export function keepDraftProblems(media, ids) {
  if (!ids.length) return []
  if (!media || media.error) return [`--keep-draft ${ids.join(', ')}: the stand's pages could not be read (${media?.error ?? 'not measured'}) — no decision is recorded`]
  const out = []
  for (const id of ids) {
    const r = (media.content ?? []).find((c) => Number(c.ID) === id)
    if (!r) out.push(`--keep-draft ${id}: no post #${id} on the stand`)
    else if (r.post_type !== 'page' || r.post_status !== 'draft') out.push(`--keep-draft ${id}: #${id} is a ${r.post_type} with status ${r.post_status}, not a draft page`)
  }
  return out
}

/**
 * Draft pages, from the one read of the stand's tables (REFS_PHP `content`, `meta`, `options`) —
 * a page a seed left as a draft (JA Vega's old /blog-detail, drafted by hand so the redirect to its
 * post could run, M6-7) ships to every customer site unless someone decides. Nothing here is
 * PRUNE: a draft is a person's call. KEEP only where the intent is recorded:
 *   - an option names it (pageOptionNames: the 404 template's words, `<theme>_404_page` of the
 *     theme the stand runs; the front page, the posts page; `wp_page_for_privacy_policy`, the
 *     draft WordPress creates at install);
 *   - the seeder wrote it (`_tracy_seed`) at the path of a search view of the page-map
 *     (`searchViews`, from `--page-map`): seed.mjs writes that page as a draft on purpose, so the
 *     path answers 404 and the redirect to WordPress's own search runs. Both are needed — a
 *     seeded draft at a path the page-map does not call a search view, or one the page-map claims
 *     with another view too, is UNKNOWN;
 *   - a person decided (`keepDrafts`, `--keep-draft <id>`), which the row records.
 * A draft at a redirect's path is otherwise UNKNOWN: a search view's draft and JA Vega's old
 * /blog-detail both sit at one, and without the page-map nothing on the stand tells them apart.
 * UNKNOWN for every other draft too, with its path and whether the seeder wrote it. A media
 * read that failed is one UNKNOWN row: the drafts were not measured.
 */
export function classifyDraftPages(media, { searchViews = null, keepDrafts = [] } = {}) {
  if (!media) return []
  if (media.error) return [{ area: 'page:draft', item: '(all)', verdict: 'UNKNOWN', why: `draft pages not measured — the stand's tables could not be read (${media.error})` }]
  const rows = []
  const content = media.content ?? []
  const byId = new Map(content.map((r) => [Number(r.ID), r]))
  const pathOf = (r) => {
    const segs = []
    const seen = new Set()
    for (let cur = r; cur; cur = Number(cur.post_parent) ? byId.get(Number(cur.post_parent)) : null) {
      if (seen.has(Number(cur.ID))) return null
      seen.add(Number(cur.ID))
      // a parent the read does not hold, or a page without a slug: the path is not known
      if (!cur.post_name) return null
      segs.unshift(cur.post_name)
      if (Number(cur.post_parent) && !byId.has(Number(cur.post_parent))) return null
    }
    return `/${segs.join('/')}`
  }
  const seedOf = new Map((media.meta ?? []).filter((m) => m.meta_key === '_tracy_seed').map((m) => [Number(m.post_id), m.meta_value]))
  const pageOptions = pageOptionNames(media.options ?? [])
  const optionsNaming = (id) => (media.options ?? []).filter((o) => pageOptions.has(String(o.option_name)) && String(o.option_value).trim() === String(id)).map((o) => o.option_name)
  const decided = new Set(keepDrafts.map(Number))
  const redirectFroms = new Set()
  for (const o of media.options ?? []) {
    if (!/_redirects$/.test(o.option_name)) continue
    for (const from of redirectSources(o.option_value)) redirectFroms.add(normPath(from))
  }
  for (const r of content) {
    if (r.post_type !== 'page' || r.post_status !== 'draft') continue
    const id = Number(r.ID)
    const path = pathOf(r)
    const shown = path ?? '(path unknown)'
    const item = `#${id} ${r.post_title ?? ''}`.trim()
    const seeded = seedOf.has(id) && String(seedOf.get(id) ?? '').trim() !== ''
    const by = seeded ? 'seeded by the seeder' : seedOf.has(id) ? 'an empty seed marker' : 'not written by the seeder'
    const named = optionsNaming(id)
    const views = path && searchViews ? searchViews.get(normPath(path)) : null
    if (named.length) rows.push({ area: 'page:draft', item, verdict: 'KEEP', why: `draft ${shown} is named by option ${named.join(', ')} — a draft on purpose (${by})` })
    else if (seeded && views && views.length === 1 && views[0] === 'search')
      rows.push({ area: 'page:draft', item, verdict: 'KEEP', why: `draft ${shown} is the page the seeder writes as a draft for the page-map's search view — the path answers 404 and the redirect to the site search runs (${by})` })
    else if (decided.has(id)) rows.push({ area: 'page:draft', item, verdict: 'KEEP', decision: 'keep-draft', why: `draft ${shown} (${by}) kept as a draft by decision: --keep-draft ${id}` })
    else if (views && views.length > 1)
      rows.push({ area: 'page:draft', item, verdict: 'UNKNOWN', why: `draft page ${shown} (${by}): the page-map declares ${views.length} entries at this path (${views.join(', ')}), so it cannot tell whether this is the search view's draft — fix the page-map, or decide with --keep-draft ${id}; the audit removes no draft` })
    else if (path && redirectFroms.has(normPath(path))) rows.push({ area: 'page:draft', item, verdict: 'UNKNOWN', why: `draft page ${shown} (${by}) holds a redirect's path: while it stays a draft the path answers 404 and the redirect runs — a search view's draft is on purpose, a page left from an earlier layout (a detail page now a post) is not; decide: keep it as a draft (--keep-draft ${id}), or trash it; the audit removes no draft` })
    else rows.push({ area: 'page:draft', item, verdict: 'UNKNOWN', why: `draft page ${shown} (${by}) — decide: publish it, keep it as a draft (--keep-draft ${id}), or trash it; the audit removes no draft` })
  }
  return rows
}

// ---------------------------------------------------------------- media and default content
// Tracy Base 1.1.0 shipped 36 attachments nothing showed (+10 MB in the pack) and WordPress's own
// "Hello world!" post and "Sample Page" while the audit said 0 to prune: nothing asked. The stand is
// read in ONE wp-cli call — `wp eval` of the read-only PHP below, straight from the tables through
// $wpdb so no query filter (Polylang's language, a plugin's pre_get_posts) hides a row — and the
// decision is made here, in pure code, on what it printed.
export const REFS_MARKER = '__TRACY_REFS__'
export const REFS_PHP = String.raw`global $wpdb;
$o = array('attachments' => array(), 'content' => array(), 'meta' => array(), 'termmeta' => array(), 'options' => array());
foreach ($wpdb->get_results("SELECT ID, post_type, post_status, post_name, post_title, post_parent FROM {$wpdb->posts} WHERE post_type = 'attachment' ORDER BY ID", ARRAY_A) as $a) {
  $m = maybe_unserialize(get_post_meta($a['ID'], '_wp_attachment_metadata', true));
  $a['file'] = get_post_meta($a['ID'], '_wp_attached_file', true) ?: null;
  $a['sizes'] = array();
  if (is_array($m) && !empty($m['sizes'])) foreach ($m['sizes'] as $x) if (!empty($x['file'])) $a['sizes'][] = $x['file'];
  if (is_array($m) && !empty($m['original_image'])) $a['sizes'][] = $m['original_image'];
  $o['attachments'][] = $a;
}
$o['content'] = $wpdb->get_results("SELECT ID, post_type, post_status, post_name, post_title, post_parent, post_date_gmt, post_modified_gmt, post_content, post_excerpt FROM {$wpdb->posts} WHERE post_type NOT IN ('attachment', 'revision')", ARRAY_A);
$o['meta'] = $wpdb->get_results("SELECT m.post_id, m.meta_key, m.meta_value FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE p.post_type NOT IN ('attachment', 'revision')", ARRAY_A);
$o['termmeta'] = $wpdb->get_results("SELECT term_id, meta_key, meta_value FROM {$wpdb->termmeta}", ARRAY_A);
$o['options'] = $wpdb->get_results("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name NOT LIKE '\\_transient\\_%' AND option_name NOT LIKE '\\_site\\_transient\\_%'", ARRAY_A);
echo "\n" . '__TRACY_REFS__' . wp_json_encode($o);`

// Every list REFS_PHP prints. One missing (a query that failed returns null) would read as "nothing
// in that table names an image", so it is an error, not an empty list.
const REFS_LISTS = ['attachments', 'content', 'meta', 'termmeta', 'options']

/** The JSON REFS_PHP printed after its marker, or `{error}` — never an empty answer that reads as "nothing references anything". */
export function parseRefs(stdout) {
  const at = String(stdout ?? '').lastIndexOf(REFS_MARKER)
  if (at === -1) return { error: 'wp eval printed no reference data' }
  try {
    const o = JSON.parse(String(stdout).slice(at + REFS_MARKER.length).trim())
    for (const k of REFS_LISTS) if (!Array.isArray(o[k])) return { error: `reference data has no ${k} list` }
    return o
  } catch (e) {
    return { error: `reference data is not JSON: ${e.message}` }
  }
}

// WordPress's own first content: the post and the page every install creates. The pair
// (post_type, post_name) finds it; the title confirms it — a page someone renamed but left at
// the slug `sample-page` is content, and a person looks. So is one edited after the install
// (modified ≠ created), one the site uses as its front or posts page, and one other content links to.
export const WP_DEFAULTS = [
  { post_type: 'post', post_name: 'hello-world', title: /^hello world!?$/i },
  { post_type: 'page', post_name: 'sample-page', title: /^sample page$/i }
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * What counts as a reference to an attachment — the ONE definition both prune passes read. Pass 1
 * (classifyMedia, below) applies it in JS; pass 2 (prune-usermeta.mjs deleteUnreferencedPhp) takes
 * this object into its PHP, so the two cannot drift. The patterns are written in the subset JS and
 * PCRE share; `@ID@` is the attachment id. A bare number, a short file stem, an array index or an
 * `i:N;` in any key is no reference: an id counts only in a shape that is made to hold one.
 */
export const REF_SHAPES = {
  /** `wp-image-N`, a block's `id`/`mediaId`/`attachmentId`, `"ids":[…]`, `[gallery ids="…"]`; the whole integer, so `12.5` and `120` are not 12. */
  id: 'wp-image-@ID@(?![\\w.])|"(?:id|mediaId|attachmentId)"\\s*:\\s*"?@ID@(?![\\w.])|"ids"\\s*:\\s*\\[[^\\]]*(?<![\\w.])@ID@(?![\\w.])|\\[gallery[^\\]]*\\bids="[^"]*(?<![\\w.])@ID@(?![\\w.])',
  /** A serialized key named like an image (theme mods, widgets) holding the id. */
  serial: 's:\\d+:"[^"]*(?:logo|icon|image|background|media)[^"]*";(?:i:@ID@;|s:\\d+:"@ID@";)',
  /** The file name (relative path, sized variants) inside a text: a token with a path boundary on both sides. */
  nameBefore: '(?:^|[/"\'\\s(=])',
  nameAfter: '(?:$|[?"\'\\s)#,])',
  /** An option whose whole value is a number is a setting far more often than an image: only these names count by id. */
  mediaOption: 'logo|icon|image|media|background|attachment',
  /** Post meta keys that hold an editor's id, not a reference. */
  editKey: '^_edit_(lock|last)$',
  /** `[gallery]` without `ids` takes the images attached to its post. */
  galleryAll: '\\[gallery(?![^\\]]*\\bids=)[^\\]]*\\]'
}

const unslashJson = (t) => String(t ?? '').replace(/\\\//g, '/').replace(/\\u002f/gi, '/')

/**
 * The needles of one attachment: `names` (its file's relative path and each size with the same
 * directory) are matched inside texts; `values` (those and the bare file names) are a use when a
 * meta, term meta or option value IS one.
 */
export function attachmentNames(a) {
  if (!a.file) return { names: [], values: [] }
  const dir = a.file.includes('/') ? a.file.slice(0, a.file.lastIndexOf('/') + 1) : ''
  const sizes = (a.sizes ?? []).filter(Boolean)
  const names = [a.file, ...sizes.map((n) => dir + n)]
  const base = a.file.slice(a.file.lastIndexOf('/') + 1)
  return { names, values: [...new Set([...names, base, ...sizes])] }
}

/** Every text in the reference data that can name something — content, post meta, term meta, options, theme files — each with where it lives. */
function refTexts(refs) {
  const unslash = unslashJson
  return [
    ...(refs.content ?? []).map((c) => ({ where: `${c.post_type} #${c.ID}`, text: unslash(`${c.post_content ?? ''}\n${c.post_excerpt ?? ''}`) })),
    ...(refs.meta ?? []).map((m) => ({ where: `meta ${m.meta_key} of #${m.post_id}`, text: unslash(m.meta_value) })),
    ...(refs.termmeta ?? []).map((m) => ({ where: `term meta ${m.meta_key} of term ${m.term_id}`, text: unslash(m.meta_value) })),
    ...(refs.options ?? []).map((o) => ({ where: `option ${o.option_name}`, text: unslash(o.option_value) })),
    ...(refs.files ?? []).map((f) => ({ where: `theme file ${f.rel}`, text: unslash(f.text) }))
  ]
}

/**
 * Where the reference data names a webroot root entry: `where (…text before it…name)` per hit.
 * Loose on purpose — any mention as a whole file/folder name counts, so an uploads path that ends
 * in the same name is reported too, with the text around it for the reader to judge. A missed
 * reference is the costly error: a file removed from the stand that the site still links to.
 */
export function namedBy(name, refs) {
  const re = new RegExp(`(?<![\\w.-])${escapeRe(name)}(?![\\w-])`)
  const hits = []
  for (const t of refTexts(refs)) {
    const m = re.exec(t.text)
    if (m) hits.push(`${t.where} (…${t.text.slice(Math.max(0, m.index - 40), m.index + name.length).replace(/\s+/g, ' ')})`)
  }
  return hits
}

/**
 * Pure: rows for attachments nothing shows and for WordPress's default content. An attachment is
 * USED when any of these names it: `_thumbnail_id` (a featured image); in content, the class
 * `wp-image-<id>`, a block attribute `"id"`/`"mediaId"`/`"ids"` or a `[gallery ids=…]`; the file
 * (or any of its generated sizes) by path anywhere in content, post meta, term meta, options or
 * the theme files, or a meta/term-meta/option value that IS its file name or relative path; a
 * meta/term-meta/option value that is exactly its id (ACF, site icon, logo); a
 * serialized logo/icon/image key holding its id (theme mods); or a `[gallery]` without ids on its
 * parent. `post_parent` alone is not use: an image uploaded to a page and never placed is still
 * an orphan. Missing reference data is one UNKNOWN row, never a list of orphans.
 */
export function classifyMedia(refs) {
  const rows = []
  const say = (area, item, verdict, why, remove) => rows.push({ area, item, verdict, why, remove })
  const missing = refs && !refs.error && [...REFS_LISTS, 'files'].find((k) => !Array.isArray(refs[k]))
  if (!refs || refs.error || missing) {
    const why = refs?.error ?? (missing ? `reference data has no ${missing} list` : null)
    say('attachment', '(all)', 'UNKNOWN', `references were not collected${why ? ` — ${why}` : ''}; no attachment is judged an orphan without them`)
    return rows
  }
  const content = refs.content ?? []
  const texts = refTexts(refs)
  const exact = [
    ...(refs.meta ?? []).map((m) => ({ key: m.meta_key, value: String(m.meta_value ?? '').trim(), where: `meta ${m.meta_key} of #${m.post_id}` })),
    ...(refs.termmeta ?? []).map((m) => ({ key: m.meta_key, value: String(m.meta_value ?? '').trim(), where: `term meta ${m.meta_key} of term ${m.term_id}` })),
    ...(refs.options ?? []).map((o) => ({ key: o.option_name, value: String(o.option_value ?? '').trim(), where: `option ${o.option_name}` }))
  ]
  const byId = new Map(content.map((c) => [String(c.ID), c]))
  const usedBy = (a) => {
    const id = String(a.ID)
    const thumb = exact.find((x) => x.key === '_thumbnail_id' && x.value === id)
    if (thumb) return `featured image (${thumb.where})`
    const idRe = new RegExp(REF_SHAPES.id.replaceAll('@ID@', id))
    const inContent = texts.find((t) => idRe.test(t.text))
    if (inContent) return `by id in ${inContent.where}`
    // An option whose whole value is a number is a setting far more often than an image
    // (`medium_size_w` 300, `posts_per_page` 10): only media-named options count by id.
    const same = exact.find((x) => x.value === id && x.key !== '_thumbnail_id' && !new RegExp(REF_SHAPES.editKey).test(x.key) && (!x.where.startsWith('option ') || new RegExp(REF_SHAPES.mediaOption, 'i').test(x.key)))
    if (same) return `id held by ${same.where}`
    // A value that IS the file's name or relative path is a use (a meta that stores `intro-image.jpg`).
    const { names, values } = attachmentNames(a)
    const named = exact.find((x) => x.value !== '' && values.includes(unslashJson(x.value)))
    if (named) return `file name held by ${named.where}`
    const serial = new RegExp(REF_SHAPES.serial.replaceAll('@ID@', id), 'i')
    const inSerial = texts.find((t) => serial.test(t.text))
    if (inSerial) return `id held by ${inSerial.where}`
    if (names.length) {
      const fileRe = new RegExp(`${REF_SHAPES.nameBefore}(?:${names.map(escapeRe).join('|')})${REF_SHAPES.nameAfter}`)
      const inText = texts.find((t) => fileRe.test(t.text))
      if (inText) return `file named in ${inText.where}`
    }
    const parent = byId.get(String(a.post_parent))
    if (parent && new RegExp(REF_SHAPES.galleryAll).test(parent.post_content ?? '')) return `[gallery] of its parent ${parent.post_type} #${parent.ID}`
    return null
  }
  for (const a of refs.attachments ?? []) {
    const label = `#${a.ID} ${a.file ?? a.post_name ?? ''}`.trim()
    const use = usedBy(a)
    if (use) say('attachment', label, 'KEEP', use)
    else if (!a.file) say('attachment', label, 'UNKNOWN', 'no file recorded and nothing names its id — check it by hand')
    else if (a.post_type !== 'attachment' || !postRemoval(a)) say('attachment', label, 'UNKNOWN', `orphan by its references, but the stand did not report it as an attachment with an id and a status (${JSON.stringify({ ID: a.ID, post_type: a.post_type, post_status: a.post_status })}) — check it by hand`)
    else say('attachment', label, 'PRUNE', 'orphan — no featured image, content, meta, option or theme file names it (its files ship in uploads/ for nothing)', postRemoval(a))
  }
  const option = (name) => String((refs.options ?? []).find((o) => o.option_name === name)?.option_value ?? '').trim()
  for (const d of WP_DEFAULTS)
    for (const c of content.filter((x) => x.post_type === d.post_type && x.post_name === d.post_name)) {
      const label = `#${c.ID} ${d.post_type}/${d.post_name}`
      const id = String(c.ID)
      const role = ['page_on_front', 'page_for_posts'].find((o) => option(o) === id)
      // A link to it from other content: a navigation/page block by id, or its slug, ?p= / page_id= in a URL.
      const linkRe = new RegExp(`"id"\\s*:\\s*${id}\\b|[/=]${escapeRe(d.post_name)}(?:[/"'?#\\s]|$)|[?&](?:p|page_id)=${id}\\b`)
      const linked = texts.find((t) => t.where !== `${c.post_type} #${c.ID}` && linkRe.test(t.text))
      if (!d.title.test(String(c.post_title ?? '').trim()))
        say('default', label, 'UNKNOWN', `WordPress default slug but the title is "${c.post_title}" — content someone reused? check it by hand`)
      else if (role) say('default', label, 'KEEP', `the site's ${role === 'page_on_front' ? 'front page' : 'posts page'} (option ${role})`)
      else if (!c.post_date_gmt || !c.post_modified_gmt)
        say('default', label, 'UNKNOWN', 'no created/modified dates in the reference data — whether it was edited is not known; check it by hand')
      else if (c.post_modified_gmt !== c.post_date_gmt)
        say('default', label, 'UNKNOWN', `edited after the install (created ${c.post_date_gmt}, modified ${c.post_modified_gmt}) — check it by hand`)
      else if (linked) say('default', label, 'UNKNOWN', `linked from ${linked.where} — check it by hand`)
      else if (!postRemoval(c)) say('default', label, 'UNKNOWN', 'the reference data gave no usable id, type or status for it — check it by hand')
      else say('default', label, 'PRUNE', `WordPress default ${d.post_type} "${c.post_title}" — no source has it`, postRemoval(c))
    }
  return rows
}

// ---------------------------------------------------------------- parity comparison (pure)
// `a`/`b` = { routes: {path: status}, counts: {name: number}, styles: {axisKey: {selector: {prop: value}}} }.
// `diff` is verify-render's diffSnapshots, injected so this file stays free of that import in
// tests that only care about routes and counts. `expected` (path → status, routeExpectations) is
// the status each route is declared to answer; a route it does not name must answer 200. A route
// row matches only when both stands answer its expected status: two stands agreeing on an
// undeclared 404, a 500 or the same failed request prove nothing about the page.
export function compareParity(a, b, opts = {}) {
  const routes = []
  const paths = [...new Set([...Object.keys(a.routes ?? {}), ...Object.keys(b.routes ?? {})])]
  const expectedOf = (p) => (opts.expected instanceof Map ? opts.expected.get(p) : opts.expected?.[p]) ?? 200
  for (const p of paths) {
    const sa = a.routes?.[p]
    const sb = b.routes?.[p]
    const expected = expectedOf(p)
    routes.push({ path: p, expected, a: sa ?? null, b: sb ?? null, ok: sa !== undefined && sa === sb && sa === expected })
  }
  const counts = []
  const names = [...new Set([...Object.keys(a.counts ?? {}), ...Object.keys(b.counts ?? {})])]
  for (const n of names) {
    const ca = a.counts?.[n]
    const cb = b.counts?.[n]
    counts.push({ name: n, a: ca ?? null, b: cb ?? null, ok: ca !== undefined && ca === cb })
  }
  // perAxis: the checks made on each axis, so an axis that compared nothing is visible under a
  // total that other axes carry
  const styles = { axes: 0, checked: 0, perAxis: {}, mismatches: [] }
  const axes = [...new Set([...Object.keys(a.styles ?? {}), ...Object.keys(b.styles ?? {})])]
  for (const axis of axes) {
    styles.axes++
    const before = styles.checked
    const sa = a.styles?.[axis] ?? {}
    const sb = b.styles?.[axis] ?? {}
    const selectors = [...new Set([...Object.keys(sa), ...Object.keys(sb)])]
    const pa = {}
    const pb = {}
    for (const sel of selectors) {
      const inA = sa[sel] && Object.keys(sa[sel]).length
      const inB = sb[sel] && Object.keys(sb[sel]).length
      if (inA && inB) {
        pa[sel] = sa[sel]
        pb[sel] = sb[sel]
      } else if (inA || inB) {
        styles.checked++
        styles.mismatches.push({
          axis,
          selector: sel,
          property: 'presence',
          a: inA ? 'present' : 'absent',
          b: inB ? 'present' : 'absent'
        })
      }
    }
    if (Object.keys(pa).length && opts.diff) {
      const r = opts.diff(pa, pb, { hexTolerance: opts.tolerance })
      styles.checked += r.checked
      for (const m of r.mismatches) styles.mismatches.push({ axis, ...m })
    }
    styles.perAxis[axis] = styles.checked - before
  }
  const ok = routes.every((r) => r.ok) && counts.every((c) => c.ok) && styles.mismatches.length === 0
  return { ok, routes, counts, styles }
}

// ---------------------------------------------------------------- route expectations
/**
 * A status a route may be declared to answer: 200, a redirect (3xx) or an error page (4xx/5xx).
 * Anything else (another 2xx, 1xx, a fraction, text) is not a declaration parity can hold a stand to.
 */
export const isRouteStatus = (s) => Number.isInteger(s) && (s === 200 || (s >= 300 && s <= 599))
/** A declared status whose response is a page to measure: 200 or an error page — never a redirect. */
export const isRenderableStatus = (s) => s === 200 || (Number.isInteger(s) && s >= 400 && s <= 599)
/**
 * A path on the stand it is requested from, exactly as it is requested: resolved against an origin,
 * it stays on that origin and its path and query are the declaration byte for byte. So `//host`
 * (another origin), a fragment (never sent), a dot segment (`/a/../404` requests `/404`), a
 * backslash, a space, an unencoded character or an empty `?` are not routes — each would be recorded
 * as one path while another is requested.
 */
function isLocalPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return false
  try {
    const u = new URL(p, 'http://route.invalid')
    return u.origin === 'http://route.invalid' && u.pathname + u.search === p
  } catch {
    return false
  }
}

/**
 * The status each route is declared to answer, from a page map or routes list: `[{path, expected}]`
 * in order, one per path. The declaration is lib/routes.mjs declaredStatus (an explicit `status`,
 * else 404 for the `view: "404"` page); an entry that declares nothing answers 200. A status that is
 * not a route status (isRouteStatus) and one path declared twice with two statuses are errors, not
 * a guess at which was meant. `/` is added (200) when absent so the front page is always compared.
 */
// lib/routes.mjs declaredStatus, restated here: this file is a tool file other bundles copy alone
// (ingest/quickstart-inventory.mjs imports it), so it takes no new import
const declaredStatus = (entry) => (entry.status != null ? Number(entry.status) : entry.view === '404' ? 404 : null)
export function routeExpectations(list, source = 'routes') {
  if (!Array.isArray(list)) throw new Error(`${source}: no pages[] or routes[] list`)
  const byPath = new Map()
  for (const [i, r] of list.entries()) {
    const entry = typeof r === 'string' ? { path: r } : r && typeof r === 'object' && !Array.isArray(r) ? { ...r, path: r.path ?? r.route } : null
    if (!entry) throw new Error(`${source}: entry ${i} is not a path or an object with a path`)
    if (entry.path === undefined || entry.path === null || entry.path === '') continue
    if (!isLocalPath(entry.path)) throw new Error(`${source}: entry ${i} path ${JSON.stringify(entry.path)} is not a /path on the stand`)
    const declared = declaredStatus(entry)
    const expected = declared ?? 200
    if (!isRouteStatus(expected)) throw new Error(`${source}: ${entry.path} declares status ${JSON.stringify(entry.status ?? null)}, not 200, a 3xx, a 4xx or a 5xx`)
    if (byPath.has(entry.path) && byPath.get(entry.path) !== expected)
      throw new Error(`${source}: ${entry.path} is declared twice, answering ${byPath.get(entry.path)} and ${expected}`)
    byPath.set(entry.path, expected)
  }
  if (!byPath.has('/')) return [{ path: '/', expected: 200 }, ...[...byPath].map(([path, expected]) => ({ path, expected }))]
  return [...byPath].map(([path, expected]) => ({ path, expected }))
}

// Routes out of `--routes`: a page-map.json ({pages:[{path}]}), a plain JSON list, a routes.json
// ([{path}] / [...strings] / {routes}), or a comma list of /paths — each with the status it is
// declared to answer (routeExpectations). A value that names no file and is not a list of /paths
// (a mistyped page-map.json among them) is an error, never a route called `page-map.json`. A value
// that names something other than a regular file — a directory, a FIFO — is an error too, not a
// route; only `/` itself, the front page, is read as the route it spells. The file is opened
// without waiting on a FIFO and its type is checked on the descriptor that is read.
export function readRouteExpectations(arg) {
  let text = null
  if (typeof arg === 'string' && arg !== '' && arg !== '/') {
    let fd = null
    try {
      fd = openSync(arg, FS.O_RDONLY | FS.O_NONBLOCK)
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw new Error(`--routes ${arg}: cannot be read (${e.code ?? e.message})`)
    }
    if (fd !== null)
      try {
        const st = fstatSync(fd)
        if (!st.isFile()) throw new Error(`--routes ${arg}: is ${st.isDirectory() ? 'a directory' : 'not a regular file'}, not a routes file or a list of /paths`)
        text = readFileSync(fd, 'utf8')
      } catch (e) {
        if (/^--routes /.test(e.message)) throw e
        throw new Error(`--routes ${arg}: cannot be read (${e.code ?? e.message})`)
      } finally {
        closeSync(fd)
      }
  }
  if (text !== null) {
    let j
    try {
      j = JSON.parse(text)
    } catch (e) {
      throw new Error(`--routes ${arg}: not valid JSON (${String(e.message).split('\n')[0]})`)
    }
    const list = Array.isArray(j) ? j : (j?.pages ?? j?.routes)
    return routeExpectations(list, `--routes ${arg}`)
  }
  const parts = String(arg ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (/\.json$/i.test(String(arg)) || !parts.length || parts.some((p) => !p.startsWith('/')))
    throw new Error(`--routes ${arg}: no such file, and not a list of /paths`)
  return routeExpectations(parts, '--routes')
}

/** The paths of `--routes`, `/` first when it was absent (readRouteExpectations). */
export const readRoutes = (arg) => readRouteExpectations(arg).map((r) => r.path)

// ---------------------------------------------------------------- secret patterns
// Shared with secret-scan.sh by way of a fixture test: the shell script greps for exactly these,
// and the test asserts the two lists agree, so a pattern added on one side is missed on neither.
export const SECRET_PATTERNS = [
  { name: 'anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'openai-style key', re: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: 'github token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'aws access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'slack token', re: /\bxox[abp]-[A-Za-z0-9-]{10,}/ },
  { name: 'cowork token option', re: /claude_cowork_token/ },
  { name: 'login session', re: /session_tokens/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
]

// ---------------------------------------------------------------- archive mode policy
// The fleet extracts the webroot as root (`tar -xf`, owner and modes from the archive) and runs
// PHP and wp-cli as www-data, so every member must be world-readable and every directory
// world-traversable. JA Vega 1.1.1 shipped `wp-config.php` and its whole theme 0600/0700 — the
// modes of the worktree they were copied from — and the fleet's provision died on "Strange
// wp-config.php file" (issue #34). archive.py writes this policy; auditArchiveMembers reads it
// back from the archive itself.
export const MODE_POLICY = {
  owner: '0:0 (root:root)',
  file: '0644',
  executable: '0755 — a regular file whose source mode carries an execute bit',
  directory: '0755',
  stripped: 'setuid, setgid and sticky bits; xattrs, ACLs and macOS metadata',
  members: 'regular files and directories only',
  writer: 'scripts/quickstart/archive.py'
}
const XATTR_PAX = /^(SCHILY\.(xattr|acl|fflags)|LIBARCHIVE\.xattr)/
const octal = (m) => '0' + (m & 0o7777).toString(8).padStart(3, '0')

/**
 * Why an archive member name is not one tar extracts to exactly one place — absolute, empty, or
 * with a `.`, `..` or empty segment (`a/./b`, `a//b` land where `a/b` does) — or null. A directory
 * may carry one trailing `/`. Its canonical name is `canonicalMember`.
 */
export function memberNameProblem(name) {
  const n = String(name ?? '').replace(/\/$/, '')
  if (!n) return 'an empty name'
  if (n.startsWith('/')) return 'an absolute path'
  if (n.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'not a canonical relative path (a ".", ".." or empty segment)'
  return null
}
export const canonicalMember = (name) => String(name).replace(/\/$/, '')

/**
 * Archive members restore refuses to extract: anything but plain files and directories, a name that
 * is not canonical (tar would write `a/./b` and `a//b` where `a/b` goes), two members with one
 * target, a member below a member that is a file.
 */
export function unsafeMembers(rows) {
  const out = []
  const kinds = new Map()
  for (const r of rows) {
    if (r.type !== 'file' && r.type !== 'dir') out.push(`${r.type} ${r.name}`)
    const bad = memberNameProblem(r.name)
    if (bad) {
      out.push(`unsafe path ${JSON.stringify(r.name)}: ${bad}`)
      continue
    }
    const n = canonicalMember(r.name)
    if (kinds.has(n)) out.push(`duplicate ${n}`)
    else kinds.set(n, r.type)
  }
  for (const n of kinds.keys()) {
    const parts = n.split('/')
    for (let i = 1; i < parts.length; i++) {
      const up = parts.slice(0, i).join('/')
      if (kinds.has(up) && kinds.get(up) !== 'dir') {
        out.push(`${n} is below ${up}, which is not a directory`)
        break
      }
    }
  }
  return out
}

/**
 * Rows of `archive.py list` → {problems, unreadable, modes, executables}. Pure. A member off the
 * policy is one problem naming it; one a non-owner cannot read (a file without o+r, a directory
 * without o+rx) is also listed in `unreadable`.
 */
export function auditArchiveMembers(rows) {
  const problems = []
  const unreadable = []
  const modes = {}
  const executables = []
  const seen = new Set()
  for (const r of rows) {
    const bad = memberNameProblem(r.name)
    if (bad) problems.push(`member ${JSON.stringify(r.name)} is ${bad}`)
    const name = canonicalMember(r.name)
    if (seen.has(name)) problems.push(`duplicate member: ${r.name}`)
    seen.add(name)
    if (r.type !== 'file' && r.type !== 'dir') {
      problems.push(`unsupported member ${r.type}: ${r.name}${r.linkname ? ` → ${r.linkname}` : ''} — only regular files and directories ship`)
      continue
    }
    const mode = r.mode & 0o7777
    modes[`${r.type} ${octal(mode)}`] = (modes[`${r.type} ${octal(mode)}`] ?? 0) + 1
    if (r.uid !== 0 || r.gid !== 0) problems.push(`member ${r.name} is owned by ${r.uid}:${r.gid}, not 0:0`)
    const allowed = r.type === 'dir' ? [0o755] : [0o644, 0o755]
    const readable = r.type === 'dir' ? (mode & 0o005) === 0o005 : (mode & 0o004) === 0o004
    if (!readable) unreadable.push({ name: r.name, type: r.type, mode: octal(mode) })
    if (!allowed.includes(mode))
      problems.push(
        `member ${r.name} is ${r.type === 'dir' ? 'a directory' : 'a file'} ${octal(mode)}${readable ? '' : r.type === 'dir' ? ' (others cannot list or enter it)' : ' (others cannot read it)'} — the policy is ${allowed.map(octal).join(' or ')}`
      )
    if (r.type === 'file' && mode === 0o755) executables.push(r.name)
    for (const k of r.pax ?? []) if (XATTR_PAX.test(k)) problems.push(`member ${r.name} carries ${k}`)
  }
  return { problems, unreadable, modes, executables }
}

// archive.py (next to this file) writes the members with MODE_POLICY and reads an archive back
// as structured rows; both through python3, which the pack already needs (scrub-sql.py).
const ARCHIVE_PY = path.join(path.dirname(new URL(import.meta.url).pathname), 'archive.py')
export function archivePy(args, { deadline = null, spawn = spawnSync, input } = {}) {
  deadline?.check(`archive.py ${args[0]}`)
  const r = spawn('python3', [ARCHIVE_PY, ...args], {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
    maxBuffer: 1 << 30,
    timeout: deadline?.remainingMs()
  })
  if (r.error)
    throw r.error.code === 'ETIMEDOUT'
      ? new Error(`archive.py ${args[0]} timed out`)
      : new Error(`archive.py ${args[0]} could not run (python3: ${r.error.message})`)
  if (r.status !== 0) throw new Error((r.stderr || '').trim() || `archive.py ${args[0]} exited ${r.status}`)
  return JSON.parse(r.stdout)
}
/**
 * The archive's members as rows {name, type, mode, uid, gid, uname, gname, size, linkname, pax}.
 * With `input` (the archive's bytes) the rows are of those bytes, read from stdin — restore lists
 * exactly what it extracts. A member named in `read` that is a regular file carries its bytes as
 * `content` (a Buffer).
 */
export function listArchive(file, { read = [], ...opts } = {}) {
  const rows = archivePy(['list', opts.input ? '-' : file, ...read.flatMap((m) => ['--read', m])], opts)
  for (const r of rows) if (typeof r.content === 'string') r.content = Buffer.from(r.content, 'base64')
  return rows
}

// ---------------------------------------------------------------- root runner
// A shell command prefix that runs its arguments as root INSIDE the filesystem the verify stand
// serves — `docker run --rm -i --user 0:0 -v <verify volume>:/var/www/html wordpress:cli`. Restore
// extracts and edits through it, as the fleet's provision does, instead of through the host's tar
// (on macOS a bind mount neither keeps owner 0:0 nor enforces modes: measured 28/09, uid 33 read a
// 0600 file owned by the host user). `-i` is needed: the archive and the config go in on stdin.
export function rootRunner(runner, { spawn = spawnSync, deadline = null } = {}) {
  if (!runner) throw new UsageError('a root runner ("<cmd>" that runs as root in the verify webroot) is required')
  return (script, { input, args = [], allowFail = false, what = 'root runner' } = {}) => {
    deadline?.check(what)
    const cap = Math.min(WP_TIMEOUT_MS, deadline?.remainingMs() ?? Infinity)
    const r = spawn('sh', ['-c', `${runner} "$@"`, 'root', 'sh', '-c', script, 'sh', ...args], {
      encoding: 'utf8',
      maxBuffer: 1 << 30,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      input,
      env: process.env,
      timeout: cap
    })
    if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Error(`${what} timed out after ${Math.round(cap / 1000)}s`) : r.error
    if (r.status !== 0 && !allowFail)
      throw new Error(`${what} exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-4).join(' | ')}`)
    return allowFail ? r : r.stdout
  }
}

// Restore empties the webroot as root and verify writes its probe there, so the path is held to a
// shape that cannot name `/`, a system tree or, through `.`/`..`/`//`, somewhere else than it reads.
const SYSTEM_TREES = new Set(['bin', 'boot', 'dev', 'etc', 'lib', 'lib32', 'lib64', 'libx32', 'proc', 'root', 'run', 'sbin', 'sys', 'usr'])
const SYSTEM_DIRS = new Set(['/home', '/mnt', '/media', '/opt', '/srv', '/tmp', '/var', '/var/lib', '/var/log', '/var/cache', '/var/spool', '/var/tmp', '/var/www'])
/** The container webroot as restore and verify accept it (trailing `/` dropped), or a UsageError. */
export function checkWebrootPath(p) {
  const raw = String(p ?? '')
  const w = raw.replace(/\/$/, '')
  const why = !raw.startsWith('/')
    ? 'is not an absolute path'
    : w === ''
      ? 'is / , a top-level directory or a system tree'
      : w.slice(1).split('/').some((s) => s === '' || s === '.' || s === '..')
      ? 'has a ".", ".." or empty segment'
      : w.split('/').length < 3 || SYSTEM_TREES.has(w.split('/')[1]) || SYSTEM_DIRS.has(w)
        ? 'is / , a top-level directory or a system tree'
        : null
  if (why) throw new UsageError(`the container webroot ${JSON.stringify(p)} ${why} — restore empties it as root; name the webroot itself (/var/www/html)`)
  return w
}

/**
 * What the root runner must be able to do before restore touches the webroot, and what the webroot
 * must be as root sees it: a directory reached without a symlink anywhere on its path (`pwd -P` is
 * the path itself). Throws a named error; returns the directory's `dev:ino` as root sees it.
 */
export function checkRootRunner(root, webroot) {
  checkWebrootPath(webroot)
  const uid = root('id -u', { what: 'root runner: id -u' }).trim()
  if (uid !== '0') throw new Error(`the root runner runs as uid ${uid || '(nothing)'}, not root — the fleet extracts the webroot as root`)
  const token = randomBytes(8).toString('hex')
  const echoed = root('cat', { input: token, what: 'root runner: stdin' }).trim()
  if (echoed !== token) throw new Error('the root runner does not pass stdin through (a `docker run` runner needs -i)')
  const dir = root('if [ -L "$1" ]; then echo link; elif [ -d "$1" ]; then cd -P -- "$1" && r=$(pwd -P) && if [ "$r" = "$1" ]; then echo "dir $(stat -c %d:%i .)"; else echo "via $r"; fi; fi', {
    args: [webroot],
    what: 'root runner: webroot'
  }).trim()
  if (dir === 'link') throw new Error(`${webroot} is a symlink as the root runner sees it — name the directory itself`)
  if (dir.startsWith('via ')) throw new Error(`${webroot} resolves to ${dir.slice(4)} through a symlink on its path — name the directory itself`)
  if (!dir.startsWith('dir')) throw new Error(`the root runner sees no directory at ${webroot}`)
  const id = dir.slice(4)
  if (!/^\d+:\d+$/.test(id)) throw new Error(`the root runner cannot identify ${webroot} (stat -c %d:%i gave ${JSON.stringify(id)})`)
  return id
}

// Every root operation inside the webroot starts from the directory itself: `cd -P` into it, check
// it is still the path (no symlink on it) and the very directory checkRootRunner identified, then
// work on relative names. A parent swapped after the check cannot redirect a wipe, an extraction
// or a write: the shell's working directory is the directory that was checked.
export const WEBROOT_ANCHOR =
  'cd -P -- "$1" && [ "$(pwd -P)" = "$1" ] && [ "$(stat -c %d:%i .)" = "$2" ] || { echo "the webroot $1 is not the directory checked before (replaced, or a symlink on its path)" >&2; exit 97; }; shift 2; '
/**
 * The root runner, checked (checkRootRunner) and bound to the webroot: `at(script, opts)` runs
 * `script` with the webroot as its working directory, `$1…` being `opts.args`. `at.webroot`,
 * `at.id` are what it is bound to.
 */
export function anchorRoot(root, webroot) {
  if (root?.anchored) {
    if (root.webroot !== webroot) throw new Error(`the root runner is bound to ${root.webroot}, not ${webroot}`)
    return root
  }
  const id = checkRootRunner(root, webroot)
  const at = (script, opts = {}) => root(WEBROOT_ANCHOR + script, { ...opts, args: [webroot, id, ...(opts.args ?? [])] })
  return Object.assign(at, { anchored: true, webroot, id })
}

// ---------------------------------------------------------------- runtime access probe
// One PHP file, written root-owned 0644 into the webroot through the root runner, run by wp-cli
// (`eval-file --skip-wordpress`, so an unreadable wp-config.php is reported, not fatal) and by the
// web server's PHP over HTTP. It answers who it runs as, whether a root-owned 0600 canary is
// readable (it must not be: a filesystem that lets it through does not enforce modes and proves
// nothing), and every entry under the webroot it cannot read or enter, plus what the fleet needs
// first, with its kind: wp-config.php, the wp-content/uploads directory, each probed theme directory
// and its style.css (and the parent that style.css names). It answers only to its nonce and never
// prints file contents.
export const PROBE_MARK = '__TRACY_ACCESS__'
// `wp eval-file` runs nothing — no output, exit 0 — for a script holding one string literal of a
// few KB (measured 28/09 on wordpress:cli-php8.3: a 4000-char literal ran, a 6000-char one did not;
// 150 literals of 76 chars joined with `.` ran). The scripts below carry their parameters as base64
// in 76-char literals joined with `.`: `phpBase64(value)` is that PHP expression.
const phpBase64 = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .match(/.{1,76}/g)
    .map((c) => `'${c}'`)
    .join(' .\n')
export function accessProbePhp({ nonce, webroot, themes = [] }) {
  const params = phpBase64({ nonce, root: webroot, themes, mark: PROBE_MARK })
  return String.raw`<?php
$P = json_decode(base64_decode(${params}), true);
if (PHP_SAPI !== 'cli' && (isset($_GET['n']) ? $_GET['n'] : '') !== $P['nonce']) { http_response_code(404); exit; }
@set_time_limit(120);
clearstatcache();
$root = rtrim($P['root'], '/');
$skip = 'tracy-probe-' . $P['nonce'];
function tracy_probe_info($p) {
  $st = @lstat($p);
  if ($st === false) return null;
  $t = $st['mode'] & 0170000;
  $type = $t === 0040000 ? 'dir' : ($t === 0100000 ? 'file' : ($t === 0120000 ? 'symlink' : 'other'));
  $ok = false;
  if ($type === 'file') { $h = @fopen($p, 'rb'); if ($h !== false) { $ok = true; fclose($h); } }
  elseif ($type === 'dir') { $h = @opendir($p); if ($h !== false) { closedir($h); $ok = @stat($p . '/.') !== false; } }
  return array('type' => $type, 'mode' => sprintf('0%03o', $st['mode'] & 07777), 'uid' => $st['uid'], 'gid' => $st['gid'], 'ok' => $ok);
}
$out = array('nonce' => $P['nonce'], 'sapi' => PHP_SAPI, 'euid' => null, 'user' => null, 'entries' => 0, 'unreadable' => array(), 'notRoot' => array(), 'truncated' => false, 'required' => array(), 'themes' => array());
if (function_exists('posix_geteuid')) {
  $out['euid'] = posix_geteuid();
  $pw = function_exists('posix_getpwuid') ? posix_getpwuid($out['euid']) : false;
  $out['user'] = $pw ? $pw['name'] : null;
}
$canary = tracy_probe_info($root . '/' . $skip . '.canary');
$out['canary'] = $canary === null ? null : $canary['ok'];
$stack = array('');
while ($stack) {
  $rel = array_pop($stack);
  $dir = $rel === '' ? $root : $root . '/' . $rel;
  $names = @scandir($dir);
  if ($names === false) continue;
  foreach ($names as $n) {
    if ($n === '.' || $n === '..' || ($rel === '' && strpos($n, $skip) === 0)) continue;
    $r = $rel === '' ? $n : $rel . '/' . $n;
    $i = tracy_probe_info($root . '/' . $r);
    if ($i === null) continue;
    $out['entries']++;
    if (!$i['ok'] && $i['type'] !== 'symlink') {
      if (count($out['unreadable']) < 400) $out['unreadable'][] = array('path' => $r) + $i; else $out['truncated'] = true;
    }
    if ($i['uid'] !== 0 || $i['gid'] !== 0) {
      if (count($out['notRoot']) < 100) $out['notRoot'][] = array('path' => $r) + $i; else $out['truncated'] = true;
    }
    if ($i['type'] === 'dir' && $i['ok']) $stack[] = $r;
  }
}
$themes = $P['themes'];
for ($k = 0; $k < count($themes); $k++) {
  $t = $themes[$k];
  if (!is_string($t) || $t === '' || strpos($t, '/') !== false || strpos($t, '..') !== false || isset($out['themes'][$t])) continue;
  $out['themes'][$t] = 'wp-content/themes/' . $t;
  $css = @file_get_contents($root . '/wp-content/themes/' . $t . '/style.css');
  if ($css !== false && preg_match('/^[ \t\/*#@]*Template:(.*)$/mi', $css, $m) && trim($m[1]) !== '') $themes[] = trim($m[1]);
}
$req = array('wp-config.php', 'wp-content/uploads');
foreach ($out['themes'] as $d) { $req[] = $d; $req[] = $d . '/style.css'; }
foreach ($req as $r) {
  $out['required'][$r] = tracy_probe_info($root . '/' . $r);
}
echo $P['mark'] . json_encode($out) . $P['mark'];
`
}

/** The probe's JSON out of a stream that may carry warnings around it. */
export function parseProbe(text) {
  const parts = String(text ?? '').split(PROBE_MARK)
  if (parts.length < 3) return null
  try {
    return JSON.parse(parts[1])
  } catch {
    return null
  }
}

/**
 * Probe answer → named problems. Pure. `via` is 'wp-cli' or 'http'; `runtimeUid` is the uid the
 * fleet runs PHP and wp-cli as (www-data, 33 in the wordpress images); `userName`, when set, is the
 * name that uid must carry (the web server's PHP resolves it; the alpine wp-cli image has no 33).
 */
export function evaluateAccess(probe, { nonce, via, runtimeUid, userName = null, paths = true, themes = null }) {
  if (!probe) return [`${via}: the access probe gave no answer`]
  if (probe.nonce !== nonce) return [`${via}: the access probe answered for another run (nonce ${probe.nonce}, expected ${nonce})`]
  const problems = []
  const who = `uid ${probe.euid}${probe.user ? ` (${probe.user})` : ''}`
  if (probe.euid === null || probe.euid === undefined) problems.push(`${via}: runtime identity unknown (no posix functions) — cannot prove it is not root`)
  else if (probe.euid === 0) problems.push(`${via} runs as root — the fleet runs PHP and wp-cli as www-data, so a root probe proves nothing`)
  else if (runtimeUid !== undefined && runtimeUid !== null && probe.euid !== runtimeUid)
    problems.push(`${via} runs as ${who}, not the fleet's www-data (uid ${runtimeUid})`)
  if (userName && probe.user !== userName) problems.push(`${via} runs as ${who}, not ${userName}`)
  if (probe.canary === null || probe.canary === undefined) problems.push(`${via}: the root-owned 0600 canary was not found — the probe did not see the webroot restore wrote`)
  else if (probe.canary === true)
    problems.push(`${via} read a root-owned 0600 file: this webroot's filesystem does not enforce file modes (a macOS bind mount?) — restore into a Linux volume, as the fleet has`)
  const themeDirs = Object.entries(probe.themes ?? {})
  const area = (p) => {
    if (p === 'wp-config.php') return 'wp-config.php'
    if (p === 'wp-content/uploads' || p.startsWith('wp-content/uploads/')) return 'uploads'
    for (const [name, dir] of themeDirs) if (p === dir || p.startsWith(dir + '/')) return `theme ${name}`
    return 'webroot'
  }
  const listed = new Set((probe.unreadable ?? []).map((u) => u.path))
  const unreadable = [...(probe.unreadable ?? [])]
  // What WordPress needs, and of which kind: a regular 0644 file where uploads should be, or a theme
  // directory without its style.css, is readable and still not a site.
  // (`paths: false` — identity and canary only: the webroot restore is about to replace)
  const needs = paths ? [['wp-config.php', 'file'], ['wp-content/uploads', 'dir']] : []
  if (paths) for (const [, dir] of themeDirs) needs.push([dir, 'dir'], [`${dir}/style.css`, 'file'])
  // `themes`: the ones the probe was asked for. None is a probe that checked no theme; one the probe
  // did not take (not a plain directory name) is a theme it did not check.
  if (paths && themes) {
    if (!themes.length) problems.push(`${via}: no theme to check — the active theme was not determined`)
    for (const t of themes) if (!(probe.themes ?? {})[t]) problems.push(`${via}: theme ${JSON.stringify(t)} was not checked by the probe`)
  }
  const required = probe.required ?? {}
  for (const [rel, kind] of needs) {
    const info = required[rel]
    if (info === undefined) problems.push(`${via}: runtime path ${rel} (${area(rel)}) was not checked by the probe`)
    else if (!info) problems.push(`${via}: runtime path ${rel} (${area(rel)}) is missing, or behind a directory ${who} cannot enter`)
    else if (info.type !== kind) problems.push(`${via}: runtime path ${rel} (${area(rel)}) is a ${info.type}, WordPress needs a ${kind === 'dir' ? 'directory' : 'regular file'}`)
    else if (!info.ok && !listed.has(rel)) unreadable.push({ path: rel, ...info })
  }
  for (const u of unreadable)
    problems.push(
      `${via}: ${area(u.path)} ${u.type === 'dir' ? 'directory' : 'file'} ${u.path} is not ${u.type === 'dir' ? 'listable/enterable' : 'readable'} by ${who} (mode ${u.mode}, owner ${u.uid}:${u.gid})`
    )
  for (const u of probe.notRoot ?? []) problems.push(`${via}: ${u.path} is owned by ${u.uid}:${u.gid}, not root — the fleet's files are root-owned`)
  if (probe.truncated) problems.push(`${via}: more entries than listed are unreadable or not root-owned`)
  return problems
}

const probeName = (nonce) => `tracy-probe-${nonce}`

/**
 * Run `body`, then always run the root `cleanup` script — also when the step that created what it
 * removes failed half-way. A cleanup that fails is an error of its own, added to the body's when
 * there is one (never hiding it).
 */
export async function withRootCleanup(root, cleanup, args, what, body) {
  let failure = null
  try {
    return await body()
  } catch (e) {
    failure = e
    throw e
  } finally {
    let gone = null
    try {
      const r = root(cleanup, { args, allowFail: true, what: `root runner: remove ${what}` })
      if (r && typeof r === 'object' && r.status !== 0) gone = `exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-2).join(' | ')}`
    } catch (e) {
      gone = e.message
    }
    if (gone) {
      const msg = `could not remove ${what}: ${gone}`
      if (failure) failure.message += `\n  and ${msg}`
      else throw new Error(msg)
    }
  }
}

/**
 * Write the probe through `root`, run it through `wp` (and over HTTP at `siteUrl` when given),
 * always remove it. Returns {nonce, cli, http, problems, ok}; never throws for a probe that fails —
 * its failure is a problem — but does throw when the probe cannot be written or removed.
 */
export async function probeWebroot({ root, wp, webroot, themes = [], runtimeUid, siteUrl = null, fetchImpl = fetch, timeoutMs = 30000 }) {
  const nonce = randomBytes(12).toString('hex')
  webroot = webroot.replace(/\/$/, '')
  const at = anchorRoot(root, webroot)
  const name = probeName(nonce)
  const base = `${webroot}/${name}`
  // `failed`: the probe did not run as asked (not run, root, a non-zero exit, no HTTP answer) — a
  // subset of `problems`, which also holds what it found about the files.
  const result = { nonce, runtimeUid, cli: null, http: null, problems: [], failed: [], ok: false }
  const failed = (p) => {
    result.failed.push(p)
    result.problems.push(p)
  }
  await withRootCleanup(at, 'rm -f -- "$1.php" "$1.canary"', [name], `the access probe ${base}`, async () => {
    // written inside the cleanup: a probe whose chown or chmod failed is removed all the same
    at('umask 022; cat > "$1.php" && printf canary > "$1.canary" && chown 0:0 "$1.php" "$1.canary" && chmod 0644 "$1.php" && chmod 0600 "$1.canary"', {
      input: accessProbePhp({ nonce, webroot, themes }),
      args: [name],
      what: 'root runner: write the access probe'
    })
    const r = wp(['eval-file', `${base}.php`, '--skip-wordpress'], { allowFail: true, raw: true })
    const probe = parseProbe(r.stdout)
    result.cli = probe
    const said = ((r.stderr || '') + (r.stdout || '')).trim()
    // wp-cli refuses to start as root without --allow-root ("YIKES! It looks like you're running this as root")
    if (!probe && /running this as root|--allow-root/i.test(said))
      failed('wp-cli runs as root — the fleet runs PHP and wp-cli as www-data, so a root probe proves nothing')
    else if (!probe) failed(`wp-cli could not run the access probe (exit ${r.status}): ${said.split('\n').slice(-3).join(' | ')}`)
    else {
      // an answer printed by a run that then failed is not a pass
      if (r.status !== 0) failed(`wp-cli ran the access probe but exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`)
      result.problems.push(...evaluateAccess(probe, { nonce, via: 'wp-cli', runtimeUid, themes }))
    }
    if (siteUrl) {
      let probeHttp = null
      try {
        const res = await fetchImpl(`${siteUrl.replace(/\/$/, '')}/${probeName(nonce)}.php?n=${nonce}`, {
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs)
        })
        const text = await res.text()
        probeHttp = parseProbe(text)
        if (!probeHttp) failed(`http: the access probe at ${siteUrl} answered ${res.status} without a probe result — the site does not serve the webroot restore wrote`)
        else if (res.status !== 200) failed(`http: the access probe at ${siteUrl} answered ${res.status}, not 200`)
      } catch (e) {
        failed(`http: the access probe at ${siteUrl} failed: ${e.message}`)
      }
      result.http = probeHttp
      if (probeHttp) {
        result.problems.push(...evaluateAccess(probeHttp, { nonce, via: 'http', runtimeUid, userName: 'www-data', themes }))
        if (probe && probe.euid !== probeHttp.euid)
          result.problems.push(`wp-cli runs as uid ${probe.euid} but the web server's PHP as uid ${probeHttp.euid} — the fleet runs both as www-data`)
      }
    }
  })
  result.problems = [...new Set(result.problems)]
  result.failed = [...new Set(result.failed)]
  result.ok = result.problems.length === 0
  return result
}

// ---------------------------------------------------------------- wp-config.php compile check
// Restore renders the archive's wp-config.php for its stand before the wipe; whether PHP will load
// it is not something a JavaScript check can answer. The fleet's PHP CLI answers it: this script,
// run by wp-cli (`eval-file --skip-wordpress`, so nothing of the old stand loads), feeds the
// rendered text to `php -l` (PHP_BINARY, the runtime's own php and ini) on stdin — compiled, never
// executed. The file carries the database password, so it is written 0400 for the runtime uid only,
// answers nothing but under the CLI, and is removed in every case (withRootCleanup).
export const LINT_MARK = '__TRACY_CONFIG_LINT__'
export function configLintPhp({ nonce, config }) {
  const params = phpBase64({ nonce, config, mark: LINT_MARK })
  return String.raw`<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$P = json_decode(base64_decode(${params}), true);
$out = array('nonce' => $P['nonce'], 'ok' => false, 'exit' => null, 'output' => '', 'error' => null);
if (!function_exists('proc_open') || !defined('PHP_BINARY') || PHP_BINARY === '') {
  $out['error'] = 'this PHP cannot run php -l (no proc_open or no PHP_BINARY)';
} else {
  $proc = @proc_open(array(PHP_BINARY, '-l'), array(0 => array('pipe', 'r'), 1 => array('pipe', 'w'), 2 => array('pipe', 'w')), $pipes);
  if (!is_resource($proc)) {
    $out['error'] = 'php -l did not start';
  } else {
    fwrite($pipes[0], $P['config']);
    fclose($pipes[0]);
    $o = stream_get_contents($pipes[1]);
    $e = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $out['exit'] = proc_close($proc);
    $out['output'] = trim($o . "\n" . $e);
    $out['ok'] = $out['exit'] === 0;
  }
}
echo $P['mark'] . json_encode($out) . $P['mark'];
`
}

/** One named problem, or null when the runtime's `php -l` compiled `config` and said so (exit 0). */
export function lintVerdict(r, nonce) {
  const parts = String(r?.stdout ?? '').split(LINT_MARK)
  let a = null
  try {
    a = parts.length >= 3 ? JSON.parse(parts[1]) : null
  } catch {}
  const said = ((r?.stderr || '') + (r?.stdout || '')).trim().split('\n').slice(-3).join(' | ')
  if (!a) return `wp-config.php: wp-cli could not run the compile check (exit ${r?.status}): ${said}`
  if (a.nonce !== nonce) return 'wp-config.php: the compile check answered for another run'
  if (a.error) return `wp-config.php: ${a.error}`
  if (r.status !== 0) return `wp-config.php: wp-cli ran the compile check but exited ${r.status}: ${said}`
  if (!a.ok || a.exit !== 0) {
    const why = String(a.output || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^Errors parsing /.test(l))
      .slice(0, 2)
      .join(' | ')
    return `wp-config.php as rendered for this stand does not compile (php -l exit ${a.exit}): ${why || '(no message)'}`
  }
  return null
}

/**
 * Compile `config` with the runtime's PHP (configLintPhp) through `root` (writes and removes) and
 * `wp` (runs). Returns a named problem or null; throws only when the file cannot be written or removed.
 */
export async function lintConfig({ root, wp, webroot, config, runtimeUid }) {
  const nonce = randomBytes(12).toString('hex')
  const at = anchorRoot(root, webroot.replace(/\/$/, ''))
  const name = `tracy-lint-${nonce}`
  let problem = null
  await withRootCleanup(at, 'rm -f -- "$1.lint.php"', [name], `the config compile check ${at.webroot}/${name}.lint.php`, () => {
    at('umask 077; cat > "$1.lint.php" && chown "$2:0" "$1.lint.php" && chmod 0400 "$1.lint.php"', {
      input: configLintPhp({ nonce, config }),
      args: [name, String(runtimeUid)],
      what: 'root runner: write the config compile check'
    })
    problem = lintVerdict(wp(['eval-file', `${at.webroot}/${name}.lint.php`, '--skip-wordpress'], { allowFail: true, raw: true }), nonce)
  })
  return problem
}

// ---------------------------------------------------------------- one run per webroot
// Restore and verify on the same webroot at once would read each other's half-written state. A
// lock file per (root runner, webroot) in the temp dir, holding the pid; one whose pid is gone is
// stale and taken over.
export function acquireLock(key, { dir = tmpdir() } = {}) {
  const file = path.join(dir, `tracy-quickstart-${sha256Text(key).slice(0, 16)}.lock`)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx')
      writeSync(fd, `${process.pid}\n`)
      closeSync(fd)
      return {
        file,
        release: () => {
          try {
            if (readFileSync(file, 'utf8').trim() === String(process.pid)) rmSync(file, { force: true })
          } catch {}
        }
      }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let pid = 0
      try {
        pid = Number(readFileSync(file, 'utf8').trim())
      } catch {}
      let alive = false
      if (pid > 0)
        try {
          process.kill(pid, 0)
          alive = true
        } catch (err) {
          alive = err.code === 'EPERM'
        }
      if (alive) throw new Error(`another restore or verify (pid ${pid}) is using this webroot (${file}) — wait for it, or stop it`)
      rmSync(file, { force: true })
    }
  }
  throw new Error(`could not take the webroot lock ${file}`)
}
