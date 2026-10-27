// Regressions from the JA Vega M5 packaging run (27/09, issue #29): a prune audit whose trash and
// auto-draft lists carried the site's published sticky posts, a package gate that read the
// runner's stderr (docker compose status lines) as the values it checks, and an install gate that
// failed the theme for a warning WordPress core wrote when it could not reach api.wordpress.org.
//
// No Docker and no stand: the runner is a node stand-in driven by a scenario file, the debug log
// is a local file it measures, and the front page is a local server. One test hands the PHP the
// gate sends to `wp eval` to a local php binary (skipped, and said so, when there is none).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { collectFacts, applyPrune } from '../quickstart/prune-audit.mjs'
import { classifyPrune } from '../quickstart/lib.mjs'

const made = []
const scratch = (name) => {
  const dir = mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), `${name}-`))
  made.push(dir)
  return dir
}

// ── prune-audit: a sticky post is not trash ──────────────────────────────────────────────────────
// WP_Query puts the published sticky posts in front of page 1 of a "home" query — one that names
// no archive, which `--post_type=any` is — whatever post_status it asked for, unless the query
// says ignore_sticky_posts. The stand-in answers `post list` the same way.
function stickyStand() {
  const posts = [
    { ID: 7, post_title: 'Featured one', post_status: 'publish', post_type: 'post' },
    { ID: 8, post_title: 'Featured two', post_status: 'publish', post_type: 'post' },
    { ID: 30, post_title: 'Auto Draft', post_status: 'auto-draft', post_type: 'post' },
    { ID: 31, post_title: 'Old page', post_status: 'trash', post_type: 'page' },
    { ID: 32, post_title: 'Featured one', post_status: 'inherit', post_type: 'revision' }
  ]
  const sticky = [7, 8]
  const calls = []
  const flag = (args, name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const postList = (args) => {
    const type = flag(args, 'post_type')
    const status = flag(args, 'post_status')
    const found = posts.filter((p) => (type === 'any' ? p.post_type !== 'revision' : p.post_type === type) && (status === 'any' || p.post_status === status))
    const ignore = ['1', 'true'].includes(flag(args, 'ignore_sticky_posts') ?? '')
    const isHome = type === 'any' || type === 'post'
    const stickies = isHome && !ignore ? posts.filter((p) => sticky.includes(p.ID) && p.post_status === 'publish') : []
    const fields = (flag(args, 'fields') ?? 'ID').split(',')
    return [...stickies, ...found.filter((p) => !stickies.includes(p))].map((p) => Object.fromEntries(fields.map((f) => [f, p[f]])))
  }
  const wp = (args, opts = {}) => {
    calls.push(args)
    if (args[0] === 'eval') return { status: 0, stdout: '', stderr: '' }
    if (args[0] === 'option' && args[1] === 'get') return opts.raw ? { status: 1, stdout: '', stderr: '' } : 'http://s'
    if (args[0] === 'user' && args[1] === 'session') return '0'
    return opts.raw ? { status: 0, stdout: '', stderr: '' } : ''
  }
  wp.json = (args) => {
    calls.push(args)
    if (args[0] === 'user') return [{ ID: 1, user_login: 'admin', roles: ['administrator'] }]
    if (args[0] === 'post' && args[1] === 'list') return postList(args)
    return []
  }
  wp.field = (args) => wp(args).trim()
  const webroot = scratch('prune-sticky')
  mkdirSync(path.join(webroot, 'wp-content', 'themes'), { recursive: true })
  return { wp, calls, webroot, posts }
}

test('prune-audit: published sticky posts are not collected as auto-drafts or trash; the real auto-draft, trash and revision are, and --apply deletes only those', () => {
  const st = stickyStand()
  const facts = collectFacts({ webroot: st.webroot, wp: st.wp, admin: 'admin', siteUrl: 'http://s', standOptions: [] })
  const ids = (list) => list.map((p) => p.ID)
  assert.deepEqual(ids(facts.autoDrafts), [30], 'the auto-draft list holds the auto-draft only')
  assert.deepEqual(ids(facts.trash), [31], 'the trash list holds the trashed page only')
  assert.deepEqual(ids(facts.revisions), [32])
  for (const c of st.calls.filter((c) => c[0] === 'post' && c[1] === 'list'))
    assert.ok(c.includes('--ignore_sticky_posts=1'), `every prune query ignores sticky posts: ${c.join(' ')}`)
  const rows = classifyPrune(facts)
  const deleted = []
  const spy = (args) => {
    // The re-read applyPrune makes before it deletes (lib.mjs ownersPhp), answered from the same posts.
    if (args[0] === 'eval') return { status: 0, stdout: `__TRACY_OWNERS__${JSON.stringify({ users: [{ ID: '1', user_login: 'admin', seeded: '0' }], posts: st.posts.map(({ ID, post_type, post_status }) => ({ ID: String(ID), post_type, post_status })) })}`, stderr: '' }
    if (args[0] === 'post' && args[1] === 'delete') deleted.push(...args.slice(2).filter((a) => a !== '--force'))
    return ''
  }
  applyPrune(rows, { wp: spy, webroot: st.webroot })
  assert.deepEqual(deleted.sort(), ['30', '31', '32'])
})

test('prune-audit: a published, unknown-status or status-less row a query returns is never deleted (classifyPrune stays the guard)', () => {
  const rows = classifyPrune({
    users: [{ ID: 1, user_login: 'admin', roles: ['administrator'] }],
    admin: 'admin',
    autoDrafts: [{ ID: 7, post_title: 'Featured', post_status: 'publish' }, { ID: 9, post_title: 'odd', post_status: 'future' }, { ID: 10, post_title: 'bare' }],
    trash: [{ ID: 8, post_title: 'Featured two', post_status: 'publish' }]
  })
  const post = rows.filter((r) => r.area.startsWith('post:'))
  assert.deepEqual(post.map((r) => `${r.verdict} ${r.item}`), ['KEEP #7 Featured', 'KEEP #9 odd', 'UNKNOWN #10 bare', 'KEEP #8 Featured two'])
  const deleted = []
  applyPrune(rows, { wp: (a) => deleted.push(a), webroot: '.' })
  assert.deepEqual(deleted.filter((a) => a[0] === 'post'), [])
})

// ── package.mjs through a stand-in runner ────────────────────────────────────────────────────────
const PKG = path.join(import.meta.dirname, '..', 'package.mjs')
const ROOT = '/var/www/html/'
const THEMES = `${ROOT}wp-content/themes`
const at = '[27-Sep-2026 12:21:19 UTC]'
const CORE_UPDATE_WARNING = `${at} PHP Warning:  wp_update_themes(): An unexpected error occurred. Something may be wrong with WordPress.org or this server&#8217;s configuration. If you continue to have problems, please try the <a href="https://wordpress.org/support/forums/">support forums</a>. (WordPress could not establish a secure connection to WordPress.org. Please contact your server administrator.) in ${ROOT}wp-includes/functions.php on line 6260\n`
const COMPOSE = ' Container javm5theme-db-1 Running \n Container javm5theme-cli-run-1921b8e380f8 Creating \n Container javm5theme-cli-run-1921b8e380f8 Created\n'

// The stand-in: every call is logged; each kind of call has a default answer on stdout, which a
// scenario can override ({stdout, stderr, code, signal, sleepMs}); `events` append to (or rotate,
// or truncate) the debug log when that call runs. Debug-log probes are answered by measuring the
// local log file — in JS, or by running the probe's PHP through php when the scenario says so.
const FAKE = `import { appendFileSync, readFileSync, writeFileSync, writeSync, lstatSync, openSync, readSync, closeSync, renameSync, truncateSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const S = JSON.parse(readFileSync(process.env.FAKE_SCENARIO, 'utf8'))
const a = process.argv.slice(2)
appendFileSync(S.calls, JSON.stringify(a) + '\\n')
if (S.compose) process.stderr.write(${JSON.stringify(COMPOSE)})
const code = a[0] === 'eval' ? a[1] : ''
const key =
  code.includes('tracy-probe:log-stat') ? 'log-stat'
  : code.includes('tracy-probe:log-read') ? 'log-read'
  : code.includes('filesize(WP_CONTENT_DIR') ? 'log-size'
  : code.includes('wp_mkdir_p') ? 'pot-dir'
  : code.includes('unlink(') ? 'pot-cleanup'
  : code.includes('is_readable') ? 'readable'
  : code.includes('get_theme_root') ? 'theme-dir'
  : code.includes('substr_count') ? 'pot-count'
  : a[0] === 'eval' ? 'eval'
  : a[0] === 'theme' ? 'theme-' + a[1]
  : a[0] === 'theme-check' ? 'themecheck'
  : a[0] === 'i18n' ? 'make-pot'
  : a.slice(0, 2).join('-')
const readSlice = (file, from, len) => {
  const fd = openSync(file, 'r'); const b = Buffer.alloc(len); const n = readSync(fd, b, 0, len, from); closeSync(fd); return b.subarray(0, n)
}
const event = S.events?.[key]
if (event?.append !== undefined) appendFileSync(S.log, event.append)
if (event?.rotate !== undefined) { renameSync(S.log, S.log + '.1'); writeFileSync(S.log, event.rotate) }
if (event?.truncate !== undefined) { truncateSync(S.log, 0); appendFileSync(S.log, event.truncate) }
if (event?.overwrite) {
  // Same inode, same size: bytes replaced in place.
  const text = readFileSync(S.log, 'latin1')
  const i = text.indexOf(event.overwrite.find)
  const fd = openSync(S.log, 'r+'); writeSync(fd, Buffer.from(event.overwrite.replace, 'latin1'), 0, event.overwrite.replace.length, i); closeSync(fd)
}
const php = (src) => {
  const pre = "define('WP_DEBUG', true); define('WP_DEBUG_LOG', true); define('WP_CONTENT_DIR', " + JSON.stringify(S.contentDir) + "); define('ABSPATH', '${ROOT}'); define('WP_PLUGIN_DIR', '${ROOT}wp-content/plugins'); define('WPMU_PLUGIN_DIR', '${ROOT}wp-content/mu-plugins'); function get_theme_root() { return '${THEMES}'; }"
  const r = spawnSync('php', ['-r', pre + ' eval(' + JSON.stringify(src).replace(/\\$/g, '\\\\$') + ');'], { encoding: 'utf8', timeout: 20000 })
  return r.error ? 'php failed: ' + r.error.message : r.stdout
}
const answer = () => {
  if (S.php && ['log-stat', 'log-read', 'log-size'].includes(key)) return php(code)
  if (key === 'log-size') return existsSync(S.log) ? String(lstatSync(S.log).size) : '0'
  if (key === 'log-stat') {
    if (S.logOff) return 'off'
    const meta = JSON.parse(code.match(/tracy-probe:log-stat (\\{.*?\\})/)[1])
    let st
    try { st = lstatSync(S.log) } catch { return '0' }
    if (!st.isFile()) return 'bad ' + S.log + ' is not a regular file'
    const n = meta.prefix === null ? st.size : Math.min(meta.prefix, st.size)
    const sha = (b) => createHash('sha256').update(b).digest('hex')
    return st.size + ' ' + st.ino + ' ' + sha(readSlice(S.log, 0, n)) + ' ' + sha(readSlice(S.log, n, st.size - n))
  }
  if (key === 'log-read') {
    const meta = JSON.parse(code.match(/tracy-probe:log-read (\\{.*?\\})/)[1])
    const st = lstatSync(S.log)
    if (!st.isFile() || String(st.ino) !== meta.ino || st.size < meta.to) return JSON.stringify({ error: 'the debug log changed' })
    return JSON.stringify({ themeRoot: '${THEMES}', abspath: '${ROOT}', contentDir: '${ROOT}wp-content', pluginDir: '${ROOT}wp-content/plugins', muPluginDir: '${ROOT}wp-content/mu-plugins', cliRoot: S.cliRoot ?? 'phar://wp-cli.phar/vendor/wp-cli/wp-cli', cliPhar: S.cliPhar ?? 'phar:///usr/local/bin/wp', prefixSha: createHash('sha256').update(readSlice(S.log, 0, meta.from)).digest('hex'), bytes: readSlice(S.log, meta.at, meta.to - meta.at).toString('base64') })
  }
  return {
    readable: 'readable',
    'theme-dir': '${THEMES}/tb',
    'pot-count': '12',
    'pot-dir': '1',
    'pot-cleanup': '0',
    'theme-install': 'Success: Installed 1 of 1 themes.',
    'theme-activate': "Success: Switched to 'TB' theme.",
    'theme-list': 'tb',
    themecheck: 'INFO\\tfine',
    'make-pot': 'Success: POT file successfully generated.'
  }[key] ?? ''
}
const o = S.override?.[key] ?? {}
if (o.sleepMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, o.sleepMs)
process.stdout.write(o.stdout ?? answer())
if (o.stderr) process.stderr.write(o.stderr)
if (o.signal) process.kill(process.pid, o.signal)
process.exitCode = o.code ?? 0
`

let fixture
function packageFixture() {
  if (fixture) return fixture
  const dir = scratch('package29')
  mkdirSync(path.join(dir, 'tb', 'templates'), { recursive: true })
  writeFileSync(path.join(dir, 'tb', 'style.css'), '/* Theme Name: TB */')
  writeFileSync(path.join(dir, 'tb', 'theme.json'), '{}')
  writeFileSync(path.join(dir, 'tb', 'templates', 'index.html'), '<!-- wp:post-content /-->')
  assert.equal(spawnSync('zip', ['-qr', 'tb.zip', 'tb'], { cwd: dir }).status, 0)
  writeFileSync(path.join(dir, 'fake-wp.mjs'), FAKE)
  fixture = { dir, zip: path.join(dir, 'tb.zip'), fake: path.join(dir, 'fake-wp.mjs') }
  return fixture
}

function serve(handler) {
  return new Promise((resolve) => {
    const srv = createServer(handler)
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

let runs = 0
// One package.mjs run against a scenario. `log` is the debug log's content before the run (null:
// no log file); `home` is the front page's answer ({status, append}).
async function runPackage(scenario = {}, { log = '', prepare, home = {}, zip, extra = [], env = {}, out } = {}) {
  const fx = packageFixture()
  const run = path.join(fx.dir, `run-${++runs}`)
  mkdirSync(run)
  const contentDir = path.join(run, 'wp-content')
  mkdirSync(contentDir)
  const logFile = path.join(contentDir, 'debug.log')
  if (prepare) prepare(logFile)
  else if (log !== null) writeFileSync(logFile, log)
  const calls = path.join(run, 'calls.log')
  writeFileSync(calls, '')
  const S = { calls, log: logFile, contentDir, ...scenario }
  writeFileSync(path.join(run, 'scenario.json'), JSON.stringify(S))
  const srv = await serve(home.handler ? (req, res) => home.handler(req, res, logFile) : (req, res) => {
    if (home.append) appendFileSync(logFile, home.append)
    res.writeHead(home.status ?? 200, { 'content-type': 'text/html' })
    res.end('<html><body>home</body></html>')
  })
  const report = out ?? path.join(run, 'report.json')
  try {
    const r = await new Promise((resolve) =>
      execFile(
        process.execPath,
        [PKG, '--zip', zip ?? fx.zip, '--slug', 'tb', '--wp', `${process.execPath} ${fx.fake}`, '--site-url', home.url ?? srv.origin, '--out', report, ...extra],
        { encoding: 'utf8', timeout: 90000, env: { ...process.env, FAKE_SCENARIO: path.join(run, 'scenario.json'), ...env } },
        (err, stdout, stderr) => resolve({ status: err ? (err.code ?? 1) : 0, stdout, stderr })
      )
    )
    return {
      ...r,
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)),
      report: existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null,
      logFile,
      run
    }
  } finally {
    await srv.close()
  }
}
const verdicts = (r) => Object.fromEntries(Object.entries(r.report?.checks ?? {}).map(([k, v]) => [k, v.ok]))
const ALL_PASS = { zip: true, install: true, themecheck: true, i18n: true }

test('package: compose status lines on stderr are not values — slug, theme path and msgid count come from stdout; stderr is kept as diagnostics', async () => {
  const r = await runPackage({ compose: true })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(verdicts(r), ALL_PASS)
  assert.equal(r.report.checks.install.summary, 'active=tb home=200 debug.log unchanged')
  assert.equal(r.report.checks.i18n.summary, '12 msgid')
  assert.ok(!JSON.stringify(r.report.checks).includes('Container '), 'no status line leaked into a check')
  assert.ok(r.report.diagnostics.some((d) => d.stderr.some((l) => /Container javm5theme-cli-run-\w+ Created/.test(l))), 'stderr is kept for diagnostics')
  assert.ok(/package: passed/.test(r.stdout))
})

test('package: stderr cannot stand in for a value stdout did not give — readable, active slug, theme path and msgid count', async () => {
  const blind = await runPackage({ override: { readable: { stdout: '', stderr: 'readable\n' } } })
  assert.equal(blind.status, 1)
  assert.equal(verdicts(blind).install, false)
  assert.ok(!blind.calls.some((c) => c[0] === 'theme'), 'nothing installed on an answer stdout did not give')
  const noisy = await runPackage({ override: { readable: { stdout: 'Notice: x\nreadable' } } })
  assert.equal(verdicts(noisy).install, false, 'readable must be the whole answer')
  const other = await runPackage({ override: { 'theme-list': { stdout: 'twentytwentyfive', stderr: 'tb\n' } } })
  assert.equal(verdicts(other).install, false)
  assert.match(other.report.checks.install.summary, /active=twentytwentyfive/)
  const two = await runPackage({ override: { 'theme-list': { stdout: 'tb\ntb\n' } } })
  assert.equal(verdicts(two).install, false, 'two lines are not one active theme')
  const count = await runPackage({ override: { 'pot-count': { stdout: '', stderr: '12\n' } } })
  assert.equal(verdicts(count).i18n, false)
  const garbled = await runPackage({ override: { 'pot-count': { stdout: '12 Container x Created' } } })
  assert.equal(verdicts(garbled).i18n, false)
  const dir = await runPackage({ override: { 'theme-dir': { stdout: '', stderr: `${THEMES}/tb\n` } } })
  assert.equal(verdicts(dir).i18n, false)
  assert.ok(!dir.calls.some((c) => c[0] === 'i18n'), 'make-pot is not pointed at a directory stdout did not name')
  const rows = await runPackage({ override: { themecheck: { stdout: '', stderr: 'INFO\tfine\n' } } })
  assert.equal(verdicts(rows).themecheck, false, 'Theme Check rows come from stdout')
})

test('package: a runner that failed — non-zero exit, signal, timeout, missing binary — is no pass, even with a valid answer printed first', async () => {
  const inst = await runPackage({ override: { 'theme-install': { code: 1, stderr: 'Error: boom\n' } } })
  assert.equal(verdicts(inst).install, false)
  const count = await runPackage({ override: { 'pot-count': { code: 255 } } })
  assert.equal(verdicts(count).i18n, false, 'a count printed by a failed call is not a count')
  const list = await runPackage({ override: { 'theme-list': { signal: 'SIGKILL' } } })
  assert.equal(verdicts(list).install, false)
  const pot = await runPackage({ override: { 'make-pot': { code: 1 } } })
  assert.equal(verdicts(pot).i18n, false)
  const tc = await runPackage({ override: { themecheck: { code: 2, stdout: 'INFO\tfine' } } })
  assert.equal(verdicts(tc).themecheck, false, 'rows from a Theme Check run that crashed are not a verdict')
  const tcReq = await runPackage({ override: { themecheck: { code: 1, stdout: 'REQUIRED\tUpdate URI: is found' } } }, { extra: ['--accept-theme-check', 'Update URI'] })
  assert.equal(verdicts(tcReq).themecheck, true, 'Theme Check exits 1 on REQUIRED rows; accepted ones still pass')
  const slow = await runPackage({ override: { 'theme-activate': { sleepMs: 10000 } } }, { env: { TRACY_WP_TIMEOUT: '4' } })
  assert.equal(verdicts(slow).install, false)
  assert.ok(slow.report.diagnostics.some((d) => /timed out/.test(d.failure ?? '')), JSON.stringify(slow.report.diagnostics))
  const fx = packageFixture()
  const gone = await new Promise((resolve) =>
    execFile(process.execPath, [PKG, '--zip', fx.zip, '--slug', 'tb', '--wp', '/nonexistent/wp-runner', '--site-url', 'http://127.0.0.1:9', '--out', path.join(fx.dir, 'gone.json')], { encoding: 'utf8', timeout: 60000 }, (err, stdout) =>
      resolve({ status: err ? (err.code ?? 1) : 0, stdout })
    )
  )
  assert.equal(gone.status, 1)
  assert.match(JSON.parse(readFileSync(path.join(fx.dir, 'gone.json'), 'utf8')).checks.install.summary, /not found|could not be asked/)
})

test('package: bad arguments, a missing zip, a bad URL, a failing front page and an unwritable report end non-zero with a reason', async () => {
  const fx = packageFixture()
  const cli = (argv) => spawnSync(process.execPath, [PKG, ...argv], { encoding: 'utf8', timeout: 60000 })
  const badUrl = cli(['--zip', fx.zip, '--slug', 'tb', '--wp', 'x', '--site-url', 'not a url', '--out', path.join(fx.dir, 'bad-url.json')])
  assert.equal(badUrl.status, 2)
  assert.match(badUrl.stderr, /--site-url/)
  const noZip = await runPackage({}, { zip: path.join(fx.dir, 'missing.zip') })
  assert.equal(noZip.status, 1)
  assert.equal(verdicts(noZip).zip, false)
  assert.match(noZip.report.checks.zip.summary, /missing\.zip/)
  const h500 = await runPackage({}, { home: { status: 500 } })
  assert.equal(verdicts(h500).install, false)
  assert.match(h500.report.checks.install.summary, /home=500/)
  const down = await runPackage({}, { home: { url: 'http://127.0.0.1:9' } })
  assert.equal(verdicts(down).install, false)
  const unwritable = await runPackage({}, { out: path.join(fx.dir, 'no-such-dir', 'report.json') })
  assert.notEqual(unwritable.status, 0)
  assert.ok(!/package: passed/.test(unwritable.stdout), 'no pass is printed before the report is written')
})

test('package: a core warning with a known source (the update check that cannot reach WordPress.org) is reported, not counted against the theme', async () => {
  const r = await runPackage({ events: { 'theme-install': { append: CORE_UPDATE_WARNING } } })
  assert.equal(r.status, 0, r.stdout + JSON.stringify(r.report?.checks.install))
  assert.deepEqual(verdicts(r), ALL_PASS)
  const install = r.report.checks.install
  assert.match(install.summary, /debug\.log \+\d+ bytes: 1 core, 0 theme, 0 unknown/)
  assert.deepEqual(install.debugLog.entries.map((e) => e.source), ['core'])
  // The same line already in the log before the install is not in the window.
  const old = await runPackage({}, { log: CORE_UPDATE_WARNING })
  assert.equal(old.report.checks.install.summary, 'active=tb home=200 debug.log unchanged')
})

test('package: a warning from the theme\'s files or its exact text domain fails install; a look-alike theme or a mention of the name does not; an unplaced entry blocks as unknown', async () => {
  const cases = {
    theme: [`${at} PHP Warning:  Undefined variable $x in ${THEMES}/tb/functions.php on line 12\n`, false, { theme: 1 }],
    fatalStack: [`${at} PHP Fatal error:  Uncaught Error: nope in ${ROOT}wp-includes/class-wp-hook.php:324\nStack trace:\n#0 ${THEMES}/tb/inc/extra.php(40): apply_filters()\n#1 {main}\n  thrown in ${ROOT}wp-includes/class-wp-hook.php on line 324\n`, false, { theme: 1 }],
    domain: [`${at} PHP Notice:  Function _load_textdomain_just_in_time was called <strong>incorrectly</strong>. Translation loading for the <code>tb</code> domain was triggered too early. in ${ROOT}wp-includes/functions.php on line 6121\n`, false, { theme: 1 }],
    lookalike: [`${at} PHP Warning:  Undefined index in ${THEMES}/tb-child/functions.php on line 3\n`, true, { 'other-theme': 1 }],
    lookalikeDomain: [`${at} PHP Notice:  Function _load_textdomain_just_in_time was called <strong>incorrectly</strong>. Translation loading for the <code>tb-extra</code> domain was triggered too early. in ${ROOT}wp-includes/functions.php on line 6121\n`, false, { unknown: 1 }],
    nameOnly: [`${at} PHP Warning:  The tb theme option could not be cached in ${ROOT}wp-includes/option.php on line 90\n`, true, { core: 1 }],
    plugin: [`${at} PHP Warning:  Undefined index in ${ROOT}wp-content/plugins/theme-check/checkbase.php on line 3\n`, true, { plugin: 1 }],
    noSource: [`${at} something went wrong\n`, false, { unknown: 1 }],
    elsewhere: [`${at} PHP Warning:  x in /opt/other/app.php on line 3\n`, false, { unknown: 1 }],
    callerNotice: [`${at} PHP Deprecated:  Function get_page_by_title is <strong>deprecated</strong> since version 6.2.0! Use WP_Query instead. in ${ROOT}wp-includes/functions.php on line 6121\n`, false, { unknown: 1 }]
  }
  for (const [name, [line, pass, counts]] of Object.entries(cases)) {
    const r = await runPackage({ events: { 'theme-activate': { append: line } } })
    assert.equal(verdicts(r).install, pass, `${name}: ${JSON.stringify(r.report?.checks.install)}`)
    const got = {}
    for (const e of r.report.checks.install.debugLog.entries) got[e.source] = (got[e.source] ?? 0) + 1
    assert.deepEqual(got, counts, name)
  }
  const home = await runPackage({}, { home: { append: `${at} PHP Warning:  x in ${THEMES}/tb/parts/header.php on line 1\n` } })
  assert.equal(verdicts(home).install, false, 'a warning the front page raises is inside the window')
})

test('package: a debug log that cannot be measured is a failure with its reason, never zero warnings', async () => {
  const reason = (r) => r.report.checks.install.summary
  const off = await runPackage({ logOff: true })
  assert.equal(verdicts(off).install, false)
  assert.match(reason(off), /WP_DEBUG_LOG/)
  const statFails = await runPackage({ override: { 'log-stat': { code: 1, stderr: 'Error: db down\n' } } })
  assert.equal(verdicts(statFails).install, false)
  assert.match(reason(statFails), /debug log .*could not be measured|exited 1/)
  const garbled = await runPackage({ override: { 'log-stat': { stdout: '0 Container x Created' } } })
  assert.equal(verdicts(garbled).install, false)
  const readFails = await runPackage({ events: { 'theme-install': { append: CORE_UPDATE_WARNING } }, override: { 'log-read': { code: 255 } } })
  assert.equal(verdicts(readFails).install, false)
  const short = await runPackage({ events: { 'theme-install': { append: CORE_UPDATE_WARNING } }, override: { 'log-read': { stdout: JSON.stringify({ themeRoot: THEMES, abspath: ROOT, contentDir: `${ROOT}wp-content`, pluginDir: `${ROOT}wp-content/plugins`, muPluginDir: `${ROOT}wp-content/mu-plugins`, prefixSha: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', bytes: Buffer.from('[27-Sep').toString('base64') }) } } })
  assert.equal(verdicts(short).install, false, 'a slice shorter than the window is not the window')
  const absent = await runPackage({}, { log: null })
  assert.equal(verdicts(absent).install, true, 'no log before and none after is nothing logged')
  const created = await runPackage({ events: { 'theme-install': { append: `${at} PHP Warning:  x in ${THEMES}/tb/functions.php on line 1\n` } } }, { log: null })
  assert.equal(verdicts(created).install, false, 'a log created inside the window is read from its first byte')
  const target = path.join(packageFixture().dir, 'elsewhere.log')
  writeFileSync(target, '')
  const sym = await runPackage({}, { prepare: (f) => symlinkSync(target, f) })
  assert.equal(verdicts(sym).install, false)
  assert.match(reason(sym), /not a regular file/)
})

test('package: a log rotated, truncated or rewritten in the window, or ending inside an entry, is not read as clean', async () => {
  const rotated = await runPackage({ events: { 'theme-activate': { rotate: '' } } }, { log: CORE_UPDATE_WARNING })
  assert.equal(verdicts(rotated).install, false)
  assert.match(rotated.report.checks.install.summary, /replaced|rotated/)
  const truncated = await runPackage({ events: { 'theme-activate': { truncate: '' } } }, { log: CORE_UPDATE_WARNING })
  assert.equal(verdicts(truncated).install, false)
  assert.match(truncated.report.checks.install.summary, /shrank|truncated/)
  const rewritten = await runPackage({ events: { 'theme-activate': { truncate: CORE_UPDATE_WARNING.replace('12:21:19', '12:21:20') } } }, { log: CORE_UPDATE_WARNING })
  assert.equal(verdicts(rewritten).install, false, 'same size, other bytes: the log was rewritten')
  const partial = await runPackage({ events: { 'theme-activate': { append: `${at} PHP Warning:  half an entry` } } })
  assert.equal(verdicts(partial).install, false)
  assert.match(partial.report.checks.install.summary, /incomplete/)
  const midEntry = await runPackage({ events: { 'theme-activate': { append: ` in ${ROOT}wp-includes/x.php on line 1\n` } } }, { log: `${at} PHP Warning:  started before` })
  assert.equal(verdicts(midEntry).install, false, 'a window that starts inside an entry cannot attribute it')
})

test('package: the debug-log probes run as real PHP — absent, regular, grown, symlinked and FIFO logs', async (t) => {
  if (spawnSync('php', ['-v']).status !== 0) {
    t.skip('no php binary on this machine: the PHP the gate sends to wp eval was not executed')
    return
  }
  const clean = await runPackage({ php: true }, { log: null })
  assert.equal(verdicts(clean).install, true, JSON.stringify(clean.report.checks.install))
  const grown = await runPackage({ php: true, events: { 'theme-install': { append: CORE_UPDATE_WARNING } } }, { log: 'x\n' })
  assert.equal(verdicts(grown).install, true, JSON.stringify(grown.report.checks.install))
  assert.deepEqual(grown.report.checks.install.debugLog.entries.map((e) => e.source), ['core'])
  const theme = await runPackage({ php: true, events: { 'theme-install': { append: `${at} PHP Warning:  x in ${THEMES}/tb/functions.php on line 1\n` } } })
  assert.equal(verdicts(theme).install, false)
  const target = path.join(packageFixture().dir, 'php-target.log')
  writeFileSync(target, '')
  const sym = await runPackage({ php: true }, { prepare: (f) => symlinkSync(target, f) })
  assert.equal(verdicts(sym).install, false)
  assert.match(sym.report.checks.install.summary, /not a regular file/)
  const fifo = await runPackage({ php: true }, { prepare: (f) => assert.equal(spawnSync('mkfifo', [f]).status, 0) })
  assert.equal(verdicts(fifo).install, false, 'a FIFO is refused, not opened (which would hang)')
  assert.match(fifo.report.checks.install.summary, /not a regular file/)
})

test('package: the front page is read to its last byte before the window closes; a body cut short is no 200', async () => {
  const late = await runPackage({}, {
    home: {
      handler: (req, res, logFile) => {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.flushHeaders()
        setTimeout(() => {
          appendFileSync(logFile, `${at} PHP Warning:  x in ${THEMES}/tb/parts/footer.php on line 1\n`)
          res.end('<html><body>home</body></html>')
        }, 500)
      }
    }
  })
  assert.equal(verdicts(late).install, false, 'a warning written after the headers, while the body renders, is inside the window')
  assert.deepEqual(late.report.checks.install.debugLog.entries.map((e) => e.source), ['theme'])
  const cut = await runPackage({}, {
    home: {
      handler: (req, res) => {
        res.writeHead(200, { 'content-type': 'text/html', 'content-length': '1000' })
        res.write('<html>')
        setTimeout(() => res.destroy(), 100)
      }
    }
  })
  assert.equal(verdicts(cut).install, false)
  assert.match(cut.report.checks.install.summary, /home=200 \(body not read/)
})

test('package: a log edited in place after it was measured, or a window that starts inside a stack trace, is not attributed', async () => {
  const theme = `${at} PHP Warning:  x in ${THEMES}/tb/functions.php on line 1\n`
  // Same length, same inode: the theme's path swapped for a core path between measurement and read.
  const swap = { find: `${THEMES}/tb/functions.php`, replace: `${ROOT}wp-includes/functions.php`.padEnd(`${THEMES}/tb/functions.php`.length, 'x') }
  assert.equal(swap.replace.length, swap.find.length)
  const window = await runPackage({ events: { 'theme-install': { append: theme }, 'log-read': { overwrite: swap } } })
  assert.equal(verdicts(window).install, false, JSON.stringify(window.report.checks.install))
  assert.match(window.report.checks.install.summary, /changed in place/)
  const prefix = await runPackage({ events: { 'theme-install': { append: CORE_UPDATE_WARNING }, 'log-read': { overwrite: { find: '12:00:00', replace: '12:00:01' } } } }, { log: `[27-Sep-2026 12:00:00 UTC] PHP Notice:  old in ${ROOT}wp-includes/x.php on line 1\n` })
  assert.equal(verdicts(prefix).install, false)
  assert.match(prefix.report.checks.install.summary, /changed in place/)
  const trace = await runPackage(
    { events: { 'theme-install': { append: `#1 ${ROOT}wp-includes/class-wp-hook.php(324): tb_boot()\n#2 {main}\n` } } },
    { log: `${at} PHP Fatal error:  Uncaught Error: nope in ${THEMES}/tb/functions.php:3\nStack trace:\n#0 ${ROOT}wp-settings.php(1): x()\n` }
  )
  assert.equal(verdicts(trace).install, false, 'the tail of an entry that began before the window is not a core entry')
  assert.match(trace.report.checks.install.summary, /first line has no timestamp/)
})

test('package: only WP-CLI\'s own phar is WP-CLI — any other phar is unplaced and blocks', async () => {
  const cases = {
    pharPath: [`${at} PHP Deprecated:  x in phar:///usr/local/bin/wp/vendor/wp-cli/wp-cli/php/utils.php on line 3\n`, {}, true, 'wp-cli'],
    pharAlias: [`${at} PHP Deprecated:  x in phar://wp-cli.phar/vendor/mustache/mustache/src/Engine.php on line 3\n`, {}, true, 'wp-cli'],
    composer: [`${at} PHP Deprecated:  x in /root/.composer/vendor/wp-cli/entity-command/src/Post.php on line 3\n`, { cliRoot: '/root/.composer/vendor/wp-cli/wp-cli', cliPhar: '' }, true, 'wp-cli'],
    composerOther: [`${at} PHP Deprecated:  x in /root/.composer/vendor/acme/lib/src/A.php on line 3\n`, { cliRoot: '/root/.composer/vendor/wp-cli/wp-cli', cliPhar: '' }, false, 'unknown'],
    otherPhar: [`${at} PHP Warning:  x in phar:///opt/tools/other.phar/src/run.php on line 3\n`, {}, false, 'unknown'],
    prefixPhar: [`${at} PHP Warning:  x in phar:///usr/local/bin/wp-evil/src/run.php on line 3\n`, {}, false, 'unknown'],
    noCli: [`${at} PHP Deprecated:  x in phar:///usr/local/bin/wp/php/utils.php on line 3\n`, { cliRoot: '', cliPhar: '' }, false, 'unknown']
  }
  for (const [name, [line, cli, pass, source]] of Object.entries(cases)) {
    const r = await runPackage({ ...cli, events: { 'theme-activate': { append: line } } })
    assert.equal(verdicts(r).install, pass, `${name}: ${JSON.stringify(r.report?.checks.install)}`)
    assert.deepEqual(r.report.checks.install.debugLog.entries.map((e) => e.source), [source], name)
  }
})

test('package: Theme Check is no pass when its plugin could not be activated or its output has a line that is not a row', async () => {
  const header = await runPackage({ override: { themecheck: { stdout: 'type\tvalue\nINFO\tfine\nWARNING\tsoft\n' } } })
  assert.equal(verdicts(header).themecheck, true, JSON.stringify(header.report.checks.themecheck))
  const malformed = await runPackage({ override: { themecheck: { stdout: 'INFO\tfine\nREQUIRED: Update URI is found\n' } } })
  assert.equal(verdicts(malformed).themecheck, false)
  assert.deepEqual(malformed.report.checks.themecheck.unread, ['REQUIRED: Update URI is found'])
  const emptyRow = await runPackage({ override: { themecheck: { stdout: 'INFO\tfine\nREQUIRED\t\n' } } })
  assert.equal(verdicts(emptyRow).themecheck, false, 'a REQUIRED row with no text is not dropped')
  const lateHeader = await runPackage({ override: { themecheck: { stdout: 'INFO\tfine\ntype\tvalue\n' } } })
  assert.equal(verdicts(lateHeader).themecheck, false, 'a header is only a header as the first line')
  const activate = await runPackage({ override: { 'plugin-activate': { code: 1, stderr: 'Error: Plugin could not be activated.\n' } } })
  assert.equal(verdicts(activate).themecheck, false)
  assert.match(activate.report.checks.themecheck.summary, /plugin is not active/)
  const install = await runPackage({ override: { 'plugin-is-installed': { code: 1 }, 'plugin-install': { code: 1 } } })
  assert.equal(verdicts(install).themecheck, false)
  assert.ok(install.calls.some((c) => c[0] === 'plugin' && c[1] === 'install'), 'not installed → installed')
  const crashed = await runPackage({ override: { 'plugin-is-installed': { code: 255 } } })
  assert.equal(verdicts(crashed).themecheck, false)
  assert.ok(!crashed.calls.some((c) => c[0] === 'plugin' && c[1] !== 'is-installed'), 'a failed is-installed is not "absent"')
  const fresh = await runPackage({ override: { 'plugin-is-installed': { code: 1 } } })
  assert.equal(verdicts(fresh).themecheck, true, 'absent, installed and activated, then run')
})

test.after(() => {
  if (!process.env.TRACY_KEEP_SCRATCH) for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

test('package: Theme Check reads only its own column header — any other first line of words is a line not read, not a header', async () => {
  const lower = await runPackage({ override: { themecheck: { stdout: 'required\tbroken\nINFO\tfine\n' } } })
  assert.equal(verdicts(lower).themecheck, false, JSON.stringify(lower.report.checks.themecheck))
  assert.deepEqual(lower.report.checks.themecheck.unread, ['required\tbroken'])
  for (const first of ['type\tvalue\textra', 'value\ttype', 'type\tvalue ', 'type']) {
    const r = await runPackage({ override: { themecheck: { stdout: `${first}\nINFO\tfine\n` } } })
    assert.equal(verdicts(r).themecheck, false, JSON.stringify(first))
  }
})

test('package: a count or size past the safe-integer range is no value — the msgid count and the debug-log size', async () => {
  const huge = '9007199254740993'
  const pot = await runPackage({ override: { 'pot-count': { stdout: huge } } })
  assert.equal(verdicts(pot).i18n, false, JSON.stringify(pot.report.checks.i18n))
  assert.match(pot.report.checks.i18n.summary, /no msgid count/)
  const safe = await runPackage({ override: { 'pot-count': { stdout: String(Number.MAX_SAFE_INTEGER) } } })
  assert.equal(verdicts(safe).i18n, true, 'the largest safe integer is still a count')
  // Both measurements answer the same size past the range: equal after Number(), not a window of 0.
  const sha = '0'.repeat(64)
  const log = await runPackage({ override: { 'log-stat': { stdout: `${huge} 42 ${sha} ${sha}` } } })
  assert.equal(verdicts(log).install, false, JSON.stringify(log.report.checks.install))
  assert.match(log.report.checks.install.debugLog.error, /not a safe integer/)
})

test('package: the .pot cleanup must answer that nothing it made is left — a failed or unclear cleanup fails i18n', async () => {
  const cases = {
    'cleanup call failed': [{ 'pot-cleanup': { code: 1, stderr: 'Error: boom\n' } }, false, true],
    'the .pot is still there': [{ 'pot-cleanup': { stdout: '1' } }, false, true],
    'no answer': [{ 'pot-cleanup': { stdout: '' } }, false, true],
    'an answer that is not a count': [{ 'pot-cleanup': { stdout: 'done' } }, false, true],
    'languages/ could not be made': [{ 'pot-dir': { stdout: 'cannot create /x/languages' } }, false, false],
    'languages/ probe failed': [{ 'pot-dir': { code: 1 } }, false, false],
    'languages/ was already there': [{ 'pot-dir': { stdout: '0' } }, true, false]
  }
  for (const [name, [override, pass, leftBehind]] of Object.entries(cases)) {
    const r = await runPackage({ override })
    assert.equal(verdicts(r).i18n, pass, `${name}: ${JSON.stringify(r.report.checks.i18n)}`)
    if (leftBehind) assert.match(r.report.checks.i18n.cleanup, /may be left/, name)
  }
  // languages/ is removed only when this run made it.
  const cleanup = (r) => r.calls.find((c) => c[0] === 'eval' && c[1].includes('unlink('))[1]
  assert.match(cleanup(await runPackage({})), /rmdir/)
  assert.doesNotMatch(cleanup(await runPackage({ override: { 'pot-dir': { stdout: '0' } } })), /rmdir/)
})
