#!/usr/bin/env node
// Phase 9 — the theme zip as a deliverable: is it clean, does Theme Check pass, do the strings
// extract, does it install and activate on a WordPress that has never seen it.
//
//   node scripts/package.mjs --zip <theme.zip> --slug <slug> --wp "<runner on a clean stand>" --site-url <url>
//        [--zip-in-container <path>] [--accept-theme-check <regex>[,<regex>...]] [--out <report.json>]
//
// The zip is read twice: on this host (the zip check) and by the RUNNER (`wp theme install`). A
// runner that is a container sees its own filesystem, so a host path means nothing to it — pass
// where the zip is mounted inside with --zip-in-container. That is checked before anything is
// installed; wp-cli's own answer was "theme could not be found", which blames the theme.
//
// Four checks, each reported, exit 1 if any fails:
//   zip        one root folder named <slug>; style.css + theme.json + templates/index.html present;
//              nothing from the deny list (.git, node_modules, .DS_Store, *.map, debug.log, .env);
//              no file over 2 MB unless listed with --allow-large.
//   install    `wp theme install <zip> --force` then `wp theme activate <slug>`, front page 200,
//              and nothing from the THEME in what the debug log gained between the install and
//              the front page (see "The debug-log window" below).
//   themecheck `wp theme-check run <slug>` (the Theme Check plugin, installed if absent) — a soft
//              gate by decision (Q12): REQUIRED lines are errors unless they match an accepted
//              regex; accepted ones are reported by name, never dropped. WARNING/INFO are listed.
//   i18n       `wp i18n make-pot` on the installed theme; fails on extraction errors, reports the
//              string count (a theme whose patterns forgot esc_html_e() shows up as a low count).
//
// Values come from the runner's stdout only. `docker compose run` writes its status lines
// ("Container … Created") to stderr, and read together with stdout they became the active slug
// and the msgid count — both gates failed a correct theme (JA Vega M5, 27/09). stderr is kept in
// the report's `diagnostics`; a call that exited non-zero, was killed or timed out is no answer.
//
// Nothing here touches the build stand: the runner points at a clean stand (the quickstart
// verify stand or a throwaway compose project), which is the point of an install-smoke.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i === -1 ? def : args[i + 1]
}
const zip = opt('--zip')
const slug = opt('--slug')
const wpRunner = opt('--wp')
const USAGE =
  'usage: package.mjs --zip <theme.zip> --slug <slug> --wp "<runner>" --site-url <url of the clean stand> [--zip-in-container <path>] [--accept-theme-check r1,r2] [--allow-large a,b] [--out report.json]'
if (!zip || !slug || !wpRunner) {
  console.error(USAGE)
  process.exit(2)
}
const zipInContainer = opt('--zip-in-container', zip)
const siteUrl = opt('--site-url')
if (!siteUrl) {
  console.error(`package.mjs: --site-url <url of the clean stand> is required\n${USAGE}`)
  process.exit(2)
}
const homeUrl = (() => {
  try {
    const u = new URL('/', siteUrl)
    return /^https?:$/.test(u.protocol) ? u : null
  } catch {
    return null
  }
})()
if (!homeUrl) {
  console.error(`package.mjs: --site-url ${siteUrl} is not an http(s) URL\n${USAGE}`)
  process.exit(2)
}
const accept = (opt('--accept-theme-check', '') || '')
  .split(',')
  .filter(Boolean)
  .map((r) => new RegExp(r, 'i'))
const allowLarge = new Set((opt('--allow-large', '') || '').split(',').filter(Boolean))
const out = opt('--out', 'package-report.json')

const DENY = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules\//,
  /\.DS_Store$/,
  /\.map$/,
  /debug\.log$/,
  /(^|\/)\.env/,
  /\.log$/
]
const REQUIRED = [`${slug}/style.css`, `${slug}/theme.json`, `${slug}/templates/index.html`]

const report = { zip, slug, checks: {}, diagnostics: [] }
let failed = false
const check = (name, ok, detail) => {
  report.checks[name] = { ok, ...detail }
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail?.summary ? `  ${detail.summary}` : ''}`)
}
const skipRest = (names, why) => {
  for (const name of names) report.checks[name] = { ok: false, skipped: why }
  failed = true
}
// The report is written before the verdict is printed: a run that cannot write it has no verdict.
const finish = () => {
  try {
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
  } catch (e) {
    console.error(`package: the report could not be written to ${out}: ${e.message}`)
    process.exit(1)
  }
  console.log(`package: ${failed ? 'FAILED' : 'passed'} → ${out}`)
  process.exit(failed ? 1 : 0)
}

// One runner call; TRACY_WP_TIMEOUT seconds at most, as the quickstart tools.
const WP_TIMEOUT_MS = Number(process.env.TRACY_WP_TIMEOUT ?? 600) * 1000
const lastLines = (text, n) => text.trim().split('\n').filter(Boolean).slice(-n)
const wp = (...a) => {
  const parts = wpRunner.split(' ').filter(Boolean)
  const r = spawnSync(parts[0], [...parts.slice(1), ...a], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: WP_TIMEOUT_MS })
  const stdout = (r.stdout || '').replace(/\r/g, '')
  const stderr = (r.stderr || '').replace(/\r/g, '')
  const failure = r.error
    ? r.error.code === 'ETIMEDOUT'
      ? `timed out after ${WP_TIMEOUT_MS / 1000}s`
      : r.error.code === 'ENOENT'
        ? `runner ${parts[0]} not found`
        : `${r.error.code ?? 'error'}: ${r.error.message}`
    : r.signal
      ? `killed by ${r.signal}`
      : r.status !== 0
        ? `exited ${r.status}`
        : null
  if (failure || stderr.trim()) {
    const call = a.map((x) => (x.length > 60 ? `${x.slice(0, 57)}...` : x)).join(' ')
    report.diagnostics.push({ call, failure, stderr: lastLines(stderr, 8) })
  }
  return { ok: failure === null, status: r.status, signal: r.signal, failure, stdout, stderr }
}
// The one line a value probe printed on stdout, or null: nothing, several lines, a failed call.
const oneLine = (r) => {
  if (!r.ok) return null
  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
  return lines.length === 1 ? lines[0].trim() : null
}
// A count or byte size a probe printed: decimal digits that are a safe integer, else null — a value
// past Number.MAX_SAFE_INTEGER is rounded by Number() and no longer the value that was printed.
const safeInt = (s) => (typeof s === 'string' && /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null)
const why = (r) => {
  const last = lastLines(r.stderr, 1)[0]
  return `${r.failure ?? 'no failure'}${last ? ` — ${last.trim()}` : ''}`
}

// ---------------------------------------------------------------- the debug-log window
// "debug.log did not grow" failed JA Vega for the warning core writes when wp_update_themes()
// cannot reach api.wordpress.org from the stand (0→456 bytes, M5). The window instead: the log is
// measured (size, inode, sha256 of what was there) before the install and after the front page's
// whole body; what it gained in between is read back whole, checked against the hashes of that
// measurement (an edit in place is not the snapshot measured), and each entry is attributed to where it came
// from — a path under the theme's own directory or its exact text domain is the theme. Theme
// entries and entries whose source cannot be placed fail the gate; core, plugin, wp-cli and
// other-theme entries are listed in the report. A log that is off, not a regular file, replaced,
// shrunk or rewritten, or a window that cuts an entry, fails with that reason — never "nothing
// logged". Nothing written after the second measurement is covered.
//
// The log is where wp_debug_mode() puts it: WP_CONTENT_DIR/debug.log for WP_DEBUG_LOG true, the
// path itself when WP_DEBUG_LOG is one, nowhere when WP_DEBUG or WP_DEBUG_LOG is off.
const LOG_PATH_PHP = `$d = defined('WP_DEBUG') && WP_DEBUG && defined('WP_DEBUG_LOG') ? WP_DEBUG_LOG : false; $p = in_array(strtolower((string) $d), array('true', '1'), true) ? WP_CONTENT_DIR . '/debug.log' : (is_string($d) && $d !== '' ? $d : false);`
const MAX_LOG_WINDOW = 4 << 20
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

// Prints `off`, `0` (no file), `bad <why>`, or `<size> <inode> <sha256 of the first `prefix` bytes>
// <sha256 of the bytes after them>` — the second hash is what the read of the window must match.
// A symlink or a FIFO is refused before it is opened: opening a FIFO blocks.
const statProbe = (prefix) => `/* tracy-probe:log-stat ${JSON.stringify({ prefix })} */
${LOG_PATH_PHP}
if ($p === false) { echo 'off'; return; }
clearstatcache();
if (!file_exists($p) && !is_link($p)) { echo '0'; return; }
if (is_link($p) || !is_file($p)) { echo 'bad ' . $p . ' is not a regular file'; return; }
$f = @fopen($p, 'rb');
if ($f === false) { echo 'bad ' . $p . ' cannot be opened'; return; }
$s = fstat($f);
$n = ${prefix === null ? "$s['size']" : `min(${Number(prefix)}, $s['size'])`};
$h = hash_init('sha256');
if ($n > 0) hash_update_stream($h, $f, $n);
$t = hash_init('sha256');
if ($s['size'] > $n) hash_update_stream($t, $f, $s['size'] - $n);
fclose($f);
echo $s['size'] . ' ' . $s['ino'] . ' ' . hash_final($h) . ' ' . hash_final($t);`

const logStat = (prefix) => {
  const r = wp('eval', statProbe(prefix))
  if (!r.ok) return { error: `the debug log could not be measured: ${why(r)}` }
  const s = r.stdout.trim()
  if (s === 'off')
    return { error: 'WP_DEBUG / WP_DEBUG_LOG are off on the stand — a warning the theme raises is written nowhere this gate can read' }
  if (s === '0') return { absent: true }
  const bad = s.match(/^bad (.+)$/)
  if (bad) return { error: `the debug log ${bad[1]}` }
  const m = s.match(/^(\d+) (\d+) ([0-9a-f]{64}) ([0-9a-f]{64})$/)
  if (!m) return { error: `the debug-log probe answered ${JSON.stringify(s.slice(0, 120))}` }
  const size = safeInt(m[1])
  if (size === null) return { error: `the debug-log probe answered a size that is not a safe integer (${m[1].slice(0, 40)})` }
  return { size, ino: m[2], sha: m[3], tail: m[4] }
}

// Bytes [at, to) of the log the window ended with, the sha256 of its first `from` bytes, and the
// directories that place an entry. `at` is one byte before the window when the log was not empty:
// that byte must end a line. The two hashes tie what is read to the two measurements — a log
// edited in place after them, or while this reads, is not the snapshot that was measured.
const readProbe = (at, from, to, ino) => `/* tracy-probe:log-read ${JSON.stringify({ at, from, to, ino })} */
${LOG_PATH_PHP}
clearstatcache();
if ($p === false || is_link($p) || !is_file($p)) { echo json_encode(array('error' => 'the debug log is no longer a regular file')); return; }
$f = @fopen($p, 'rb');
if ($f === false) { echo json_encode(array('error' => 'the debug log cannot be opened')); return; }
$s = fstat($f);
if ((string) $s['ino'] !== '${String(ino).replace(/\D/g, '')}' || $s['size'] < ${to}) { fclose($f); echo json_encode(array('error' => 'the debug log changed after the window closed (inode ' . $s['ino'] . ', ' . $s['size'] . ' bytes)')); return; }
$h = hash_init('sha256');
if (${from} > 0) hash_update_stream($h, $f, ${from});
fseek($f, ${at});
$b = '';
while (strlen($b) < ${to - at} && !feof($f)) { $c = fread($f, ${to - at} - strlen($b)); if ($c === false || $c === '') break; $b .= $c; }
fclose($f);
echo json_encode(array('themeRoot' => get_theme_root(), 'abspath' => ABSPATH, 'contentDir' => WP_CONTENT_DIR, 'pluginDir' => WP_PLUGIN_DIR, 'muPluginDir' => WPMU_PLUGIN_DIR, 'cliRoot' => defined('WP_CLI_ROOT') ? WP_CLI_ROOT : '', 'cliPhar' => defined('WP_CLI_PHAR_PATH') ? WP_CLI_PHAR_PATH : '', 'prefixSha' => hash_final($h), 'bytes' => base64_encode($b)));`

// An entry begins with error_log()'s timestamp; the lines after it (a stack trace) belong to it.
const ENTRY_START = /^\[\d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}:\d{2}(?: [^\]]+)?\] /
const PHP_PATH = /(?:phar:\/\/[^\s'"()<>,;/]*)?\/[^\s'"()<>,;]*?\.php(?![\w.])/g
// Core helpers that report on their CALLER (_doing_it_wrong, _deprecated_*): the file the entry
// names is functions.php, and the caller is not in it — the source is not known.
const CALLER_NOTICE = /<strong>(?:incorrectly|deprecated)<\/strong>|\bcalled incorrectly\b|\bdeprecated since version\b/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The theme's text domain named as one: `<code>slug</code> domain`, `text domain "slug"`.
const DOMAIN = new RegExp(
  `(?:^|[^\\w-])(?:<code>)?${escapeRe(slug)}(?:</code>)?\\s+(?:text\\s+)?domain\\b|\\bdomain\\s+(?:<code>|["'])?${escapeRe(slug)}(?:</code>|["'])?(?![\\w-])`
)

// WP-CLI's own files: the phar it runs from (WP_CLI_PHAR_PATH, and the archive WP_CLI_ROOT sits in —
// its stub includes through the alias phar://wp-cli.phar), or the vendor/wp-cli directory of a
// Composer install. Any other phar is not placed.
const cliRoots = (dirs) => {
  const roots = []
  const phar = String(dirs.cliPhar ?? '').replace(/\/+$/, '')
  if (phar.startsWith('phar://') && phar.length > 'phar://'.length) roots.push(phar)
  const root = String(dirs.cliRoot ?? '').replace(/\/+$/, '')
  const pkg = '/vendor/wp-cli/wp-cli'
  if (root.startsWith('phar://') && root.endsWith(pkg) && root.length > 'phar://'.length + pkg.length)
    roots.push(root.slice(0, -pkg.length))
  else if (root.startsWith('/') && root.endsWith(pkg)) roots.push(root.slice(0, -'/wp-cli'.length))
  return roots
}

function attributeEntries(text, dirs) {
  const trim = (d) => String(d ?? '').replace(/\/+$/, '')
  const themeRoot = trim(dirs.themeRoot)
  const abspath = trim(dirs.abspath)
  const cli = cliRoots(dirs)
  const under = (p, dir) => dir !== '' && p.startsWith(`${dir}/`)
  const place = (p) => {
    if (cli.some((dir) => under(p, dir))) return 'wp-cli'
    if (p.startsWith('phar://')) return 'unknown'
    if (under(p, `${themeRoot}/${slug}`)) return 'theme'
    if (under(p, themeRoot)) return 'other-theme'
    if (under(p, trim(dirs.pluginDir)) || under(p, trim(dirs.muPluginDir))) return 'plugin'
    if (under(p, `${abspath}/wp-includes`) || under(p, `${abspath}/wp-admin`)) return 'core'
    if (under(p, abspath) && !p.slice(abspath.length + 1).includes('/')) return 'core'
    return 'unknown'
  }
  const entries = []
  for (const line of text.split('\n').slice(0, -1)) {
    if (ENTRY_START.test(line)) entries.push([line])
    else entries[entries.length - 1].push(line)
  }
  return entries.map((lines) => {
    const entry = lines.join('\n')
    const places = (entry.match(PHP_PATH) ?? []).map(place)
    const source =
      places.includes('theme') || DOMAIN.test(entry)
        ? 'theme'
        : places.length === 0 || places.includes('unknown') || CALLER_NOTICE.test(entry)
          ? 'unknown'
          : places[0]
    return { source, text: lines[0].slice(0, 400) }
  })
}

function logWindow(before, after) {
  if (before.error) return { error: `before the install: ${before.error}` }
  if (after.error) return { error: `after the front page: ${after.error}` }
  if (after.absent)
    return before.absent ? { bytes: 0, entries: [] } : { error: 'the debug log was removed during the install — what was written in between cannot be read' }
  if (!before.absent) {
    if (after.ino !== before.ino) return { error: `the debug log was replaced during the install (inode ${before.ino}→${after.ino}) — rotated or recreated` }
    if (after.size < before.size) return { error: `the debug log shrank during the install (${before.size}→${after.size} bytes) — truncated` }
    if (after.sha !== before.sha) return { error: `the first ${before.size} bytes of the debug log changed during the install — rewritten` }
  }
  const from = before.absent ? 0 : before.size
  const bytes = after.size - from
  if (bytes === 0) return { bytes: 0, entries: [] }
  if (bytes > MAX_LOG_WINDOW)
    return { error: `the debug log grew ${bytes} bytes during the install, over the ${MAX_LOG_WINDOW} this gate reads and attributes` }
  const at = from > 0 ? from - 1 : 0
  const r = wp('eval', readProbe(at, from, after.size, after.ino))
  if (!r.ok) return { error: `the new debug-log bytes could not be read: ${why(r)}` }
  let got
  try {
    got = JSON.parse(r.stdout.trim())
  } catch {
    return { error: `the debug-log read answered ${JSON.stringify(r.stdout.trim().slice(0, 120))}` }
  }
  if (got?.error) return { error: String(got.error) }
  if (typeof got?.bytes !== 'string' || typeof got.themeRoot !== 'string' || typeof got.abspath !== 'string' || typeof got.prefixSha !== 'string')
    return { error: 'the debug-log read did not return the bytes, their hash and the WordPress directories' }
  const buf = Buffer.from(got.bytes, 'base64')
  if (buf.length !== after.size - at) return { error: `the debug-log read returned ${buf.length} of ${after.size - at} bytes` }
  const window = buf.subarray(from - at)
  if (got.prefixSha !== (before.absent ? sha256('') : before.sha) || sha256(window) !== after.tail)
    return { error: 'the debug log changed in place between its measurement and the read — what was read is not the window that was measured' }
  if (from > 0 && buf[0] !== 0x0a) return { error: 'the install window starts inside a debug-log line — it cannot be attributed' }
  const text = window.toString('utf8')
  if (!ENTRY_START.test(text)) return { error: 'the install window starts inside a debug-log entry (its first line has no timestamp) — it cannot be attributed' }
  if (!text.endsWith('\n')) return { error: 'the last debug-log entry of the window is incomplete (no line end) — it was still being written' }
  return { bytes, entries: attributeEntries(text, got) }
}

// 1. zip
{
  let list, sizes
  try {
    if (!fs.statSync(zip).isFile()) throw new Error('not a regular file')
    const unzip = (flag) => execFileSync('unzip', [flag, zip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    list = unzip('-Z1').split('\n').filter(Boolean)
    sizes = unzip('-l')
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+\S+\s+\S+\s+(.+)$/))
      .filter(Boolean)
      .map((m) => ({ bytes: safeInt(m[1]) ?? Infinity, file: m[2] }))
  } catch (e) {
    check('zip', false, { summary: `${zip} could not be listed: ${String(e.stderr || e.message).trim().split('\n').slice(-1)[0]}` })
    skipRest(['install', 'themecheck', 'i18n'], 'the zip could not be read')
    finish()
  }
  const roots = new Set(list.map((f) => f.split('/')[0]))
  const denied = list.filter((f) => DENY.some((re) => re.test(f)))
  const missing = REQUIRED.filter((f) => !list.includes(f))
  const large = sizes.filter((s) => s.bytes > 2 * 1024 * 1024 && !allowLarge.has(path.basename(s.file)))
  const ok =
    roots.size === 1 && roots.has(slug) && denied.length === 0 && missing.length === 0 && large.length === 0
  check('zip', ok, {
    summary: `${list.length} entries, root ${[...roots].join(',')}`,
    denied,
    missing,
    large: large.map((l) => `${l.file} ${l.bytes}`)
  })
}

// 2. install + activate + front page + debug log — only when the runner can read the zip at all
const phpString = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const readable = wp('eval', `echo is_readable(${phpString(zipInContainer)}) ? 'readable' : 'unreadable';`)
const readableAnswer = oneLine(readable)
if (readableAnswer !== 'readable') {
  const reason = !readable.ok
    ? `the runner could not be asked whether it can read ${zipInContainer}: ${why(readable)}`
    : readableAnswer !== 'unreadable'
      ? `the runner's answer to whether it can read ${zipInContainer} was not "readable" or "unreadable": ${JSON.stringify(readable.stdout.trim().slice(0, 120))}`
      : zipInContainer === zip
        ? `the runner cannot read ${zip} — when the runner is a container, pass --zip-in-container <path> (where the zip is mounted inside it)`
        : `--zip-in-container ${zipInContainer} is not readable inside the runner — pass --zip-in-container <path> as the container sees it`
  check('install', false, { summary: reason })
  skipRest(['themecheck', 'i18n'], 'the theme was not installed')
  finish()
}
{
  const before = logStat(null)
  const inst = wp('theme', 'install', zipInContainer, '--force')
  const act = wp('theme', 'activate', slug)
  const activeR = wp('theme', 'list', '--status=active', '--field=name')
  const active = oneLine(activeR)
  // Fetched from the host: a per-call cli container cannot reach the stand's web service by
  // the name WordPress has for itself, and the point is what a visitor gets. The whole body is read
  // before the window closes: a page that sends its headers first is still rendering after them.
  let homeStatus = 0
  const home = await fetch(homeUrl, { signal: AbortSignal.timeout(60000) })
    .then(async (r) => {
      homeStatus = r.status
      await r.arrayBuffer()
      return { status: r.status }
    })
    .catch((e) => ({ status: homeStatus, error: `${homeStatus ? 'body not read: ' : ''}${e.cause?.code ?? e.name ?? e.message}` }))
  const after = before.error ? before : logStat(before.absent ? 0 : before.size)
  const log = logWindow(before, after)
  const count = (source) => (log.entries ?? []).filter((e) => e.source === source).length
  const logOk = !log.error && count('theme') === 0 && count('unknown') === 0
  const logSummary = log.error
    ? `debug log: ${log.error}`
    : log.bytes === 0
      ? 'debug.log unchanged'
      : `debug.log +${log.bytes} bytes: ${['core', 'theme', 'unknown', 'plugin', 'wp-cli', 'other-theme']
          .filter((s, i) => i < 3 || count(s) > 0)
          .map((s) => `${count(s)} ${s}`)
          .join(', ')}`
  const activeSaid = active ?? `(no answer: ${activeR.ok ? JSON.stringify(activeR.stdout.trim().slice(0, 80)) : why(activeR)})`
  const ok = inst.ok && act.ok && active === slug && home.status === 200 && !home.error && logOk
  check('install', ok, {
    summary: `active=${activeSaid} home=${home.status}${home.error ? ` (${home.error})` : ''} ${logSummary}`,
    install: inst.ok ? lastLines(inst.stdout, 2) : [why(inst)],
    activate: act.ok ? lastLines(act.stdout, 1) : [why(act)],
    debugLog: { error: log.error, bytes: log.bytes, entries: log.entries ?? [] }
  })
}

// 3. Theme Check
{
  // `is-installed` exits 1 for "not installed"; anything else that is not 0 is a call that failed.
  const has = wp('plugin', 'is-installed', 'theme-check')
  const absent = !has.ok && has.status === 1 && !has.signal && has.failure === 'exited 1'
  const plugin = has.ok ? wp('plugin', 'activate', 'theme-check') : absent ? wp('plugin', 'install', 'theme-check', '--activate') : has
  const r = wp('theme-check', 'run', slug)
  // Every stdout line is a row (`TYPE<tab>text`) or, first, the one column header WP-CLI's table
  // prints for Theme Check's `type`/`value` fields when stdout is not a terminal. Anything else — a
  // malformed row, another header, a notice — is an output this gate does not understand, and no
  // verdict is read from it.
  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
  const rows = []
  const unread = []
  lines.forEach((l, i) => {
    const m = l.match(/^(REQUIRED|WARNING|RECOMMENDED|INFO)\t(.*\S.*)$/)
    if (m) rows.push({ type: m[1], text: m[2].trim() })
    else if (!(i === 0 && l === 'type\tvalue')) unread.push(l.slice(0, 200))
  })
  const required = rows.filter((x) => x.type === 'REQUIRED')
  const acceptedRows = required.filter((x) => accept.some((re) => re.test(x.text)))
  const errors = required.filter((x) => !accept.some((re) => re.test(x.text)))
  // Theme Check's CLI exits 1 whenever any REQUIRED row exists, accepted or not; the verdict here
  // is the rows read against the accept list, not that exit code. Any other failure — another
  // code, a signal, a timeout, exit 1 without a REQUIRED row — is a run that did not finish.
  const ran = r.ok || (r.status === 1 && !r.signal && required.length > 0)
  const ok = plugin.ok && ran && unread.length === 0 && errors.length === 0 && rows.length > 0
  check('themecheck', ok, {
    summary: `${plugin.ok ? '' : `the Theme Check plugin is not active (${why(plugin)}); `}${ran ? '' : `theme-check did not finish (${why(r)}); `}${unread.length ? `${unread.length} output line(s) not read as rows; ` : ''}${required.length} REQUIRED (${acceptedRows.length} accepted by decision), ${rows.filter((x) => x.type === 'WARNING').length} WARNING, ${rows.filter((x) => x.type !== 'REQUIRED' && x.type !== 'WARNING').length} INFO`,
    ...(plugin.ok ? {} : { plugin: why(plugin) }),
    ...(unread.length ? { unread } : {}),
    errors: errors.map((x) => x.text),
    accepted: acceptedRows.map((x) => x.text),
    warnings: rows.filter((x) => x.type === 'WARNING').map((x) => x.text),
    info: rows.filter((x) => x.type === 'INFO' || x.type === 'RECOMMENDED').map((x) => x.text)
  })
}

// 4. i18n make-pot
{
  // The .pot lands in the mounted webroot: with a fresh container per call, /tmp does not survive
  // between make-pot and the count. Removed afterwards so the clean stand stays clean.
  const dirR = wp('eval', `echo get_theme_root()."/${slug}";`)
  const themeDir = oneLine(dirR)
  if (themeDir === null || !themeDir.startsWith('/') || !themeDir.endsWith(`/${slug}`)) {
    check('i18n', false, {
      summary: `the installed theme's directory could not be read from the runner: ${dirR.ok ? JSON.stringify(dirR.stdout.trim().slice(0, 120)) : why(dirR)}`
    })
  } else {
    const pot = `${themeDir}/languages/${slug}.pot`
    const langDir = `${themeDir}/languages`
    // 1: languages/ was created for the .pot (and is removed with it); 0: the theme already had it.
    const mk = wp(
      'eval',
      `$d=${phpString(langDir)}; if (is_dir($d)) { echo 0; } elseif (wp_mkdir_p($d)) { echo 1; } else { echo 'cannot create ' . $d; }`
    )
    const mkLine = oneLine(mk)
    const made = mkLine === '1'
    const dirOk = mkLine === '0' || made
    const r = wp('i18n', 'make-pot', themeDir, pot, `--domain=${slug}`, '--skip-audit')
    const countR = wp(
      'eval',
      `$p=@file_get_contents(${phpString(pot)}); echo $p===false?'unreadable':substr_count($p, "\\nmsgid \\"");`
    )
    const countLine = oneLine(countR)
    const count = safeInt(countLine)
    // The cleanup answers how many of what it made are still there: the .pot, and languages/ when
    // it was made here. Anything but 0 leaves the stand not clean, and the gate fails.
    const rm = wp(
      'eval',
      `$p=${phpString(pot)}; $d=${phpString(langDir)}; if (file_exists($p)) @unlink($p); ${made ? 'if (is_dir($d)) @rmdir($d); ' : ''}clearstatcache(); echo (file_exists($p) ? 1 : 0) + (${made ? 'is_dir($d)' : 'false'} ? 1 : 0);`
    )
    const left = safeInt(oneLine(rm))
    const cleanOk = left === 0
    const ok = dirOk && r.ok && count !== null && count > 0 && cleanOk
    const said = (x) => (x.ok ? JSON.stringify(x.stdout.trim().slice(0, 120)) : why(x))
    check('i18n', ok, {
      summary: `${count !== null ? `${count} msgid` : `no msgid count (${said(countR)})`}${dirOk ? '' : `; languages/ not created: ${said(mk)}`}${r.ok ? '' : `; make-pot ${why(r)}`}${cleanOk ? '' : `; the .pot was not removed from the stand (cleanup answered ${said(rm)})`}`,
      output: r.ok ? lastLines(r.stdout, 2) : [why(r)],
      ...(cleanOk ? {} : { cleanup: `the .pot may be left on the stand: ${said(rm)}` })
    })
  }
}

finish()
