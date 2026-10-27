// Issue #34: JA Vega 1.1.1 shipped wp-config.php and its theme 0600/0700 — the modes of the
// worktree the theme was copied from — and the fleet, which extracts as root and runs PHP and
// wp-cli as www-data, could not read them. pack now writes the fleet's modes whatever the stand
// holds, and restore/verify read the restore as the fleet does. The Docker half of the proof is
// scripts/test/quickstart-fleet.integration.mjs; this file holds what runs without Docker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  renameSync,
  symlinkSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildWebrootTar, checkWebrootTar } from '../quickstart/pack.mjs'
import { identityProblems, preparePack, prepareWebroot, unsafeMembers } from '../quickstart/restore.mjs'
import { checkAccess } from '../quickstart/verify-parity.mjs'
import {
  MODE_POLICY,
  PROBE_MARK,
  LINT_MARK,
  configLintPhp,
  lintVerdict,
  accessProbePhp,
  acquireLock,
  archivePy,
  auditArchiveMembers,
  checkRootRunner,
  evaluateAccess,
  listArchive,
  parseProbe,
  probeWebroot,
  renderQuickstartConfig,
  readPack,
  sha256File,
  sumsText,
  checkWebrootPath,
  withRootCleanup,
  WEBROOT_ANCHOR,
  anchorRoot,
  bindingProblems,
  dirIdentity,
  manifestProblems
} from '../quickstart/lib.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const dockerConfig = readFileSync(path.join(HERE, '..', '..', 'assets', 'quickstart', 'wp-config-docker.php'), 'utf8')
const ROOT = process.env.TRACY_QUICKSTART_TEST_ROOT
if (ROOT) mkdirSync(ROOT, { recursive: true })
const tmp = () => mkdtempSync(path.join(ROOT || tmpdir(), 'qs-perm-'))
const mode = (p) => statSync(p).mode & 0o7777
const NEWLINE_NAME = 'a b\nc.txt'

// A webroot as an agent with umask 077 writes it: files 0600, directories 0700, an executable
// 0700, an empty directory, a name with a space and a newline, and the stand's wp-config.php 0600.
function umask077Webroot() {
  const root = tmp()
  const files = {
    'index.php': '<?php // core\n',
    'wp-includes/version.php': "<?php $wp_version = '7.1';\n",
    'wp-content/themes/vega/style.css': '/*\nTheme Name: Vega\nTemplate: base\n*/\n',
    'wp-content/themes/vega/templates/index.html': '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->\n',
    'wp-content/themes/base/style.css': '/*\nTheme Name: Base\n*/\n',
    'wp-content/themes/vega/bin/build.sh': '#!/bin/sh\necho build\n',
    [`wp-content/uploads/2026/09/${NEWLINE_NAME}`]: 'upload\n',
    'wp-config.php': dockerConfig
  }
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  mkdirSync(path.join(root, 'wp-content', 'upgrade'), { recursive: true })
  const walk = (rel) => {
    const abs = path.join(root, rel)
    if (statSync(abs).isDirectory()) {
      for (const n of readdirSync(abs)) walk(rel ? `${rel}/${n}` : n)
      if (rel) chmodSync(abs, 0o700)
    } else chmodSync(abs, rel.endsWith('.sh') ? 0o700 : 0o600)
  }
  walk('')
  return root
}
const snapshot = (root) => {
  const out = {}
  const walk = (rel) => {
    const abs = rel ? path.join(root, rel) : root
    out[rel || '.'] = { mode: mode(abs), body: statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null }
    if (statSync(abs).isDirectory()) for (const n of readdirSync(abs)) walk(rel ? `${rel}/${n}` : n)
  }
  walk('')
  return out
}

// ---------------------------------------------------------------- pack

test('pack: a umask-077 webroot ships 0644 files, 0755 directories and declared executables, owner 0:0; the stand is not touched', () => {
  const root = umask077Webroot()
  const before = snapshot(root)
  const dir = tmp()
  const out = path.join(dir, 'w.tar.gz')
  const rendered = renderQuickstartConfig(dockerConfig)
  const built = buildWebrootTar({ webroot: root, out, config: rendered.source })
  const rows = listArchive(out)
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  for (const r of rows) {
    assert.equal(r.uid, 0, r.name)
    assert.equal(r.gid, 0, r.name)
    assert.equal(r.uname, 'root', r.name)
    assert.ok(r.type === 'file' || r.type === 'dir', `${r.name} is ${r.type}`)
    assert.deepEqual(r.pax.filter((k) => /xattr|acl|fflags/i.test(k)), [], r.name)
  }
  assert.equal(by['wp-config.php'].mode, 0o644, 'the rewritten config is world-readable')
  assert.equal(by['wp-content/themes/vega/style.css'].mode, 0o644)
  assert.equal(by['wp-content/themes/vega/bin/build.sh'].mode, 0o755, 'an executable the source declares keeps its x bit')
  assert.equal(by['wp-content/themes/vega'].mode, 0o755)
  assert.equal(by['wp-content/upgrade'].mode, 0o755, 'an empty directory ships, traversable')
  assert.equal(by[`wp-content/uploads/2026/09/${NEWLINE_NAME}`].mode, 0o644, 'a name with a space and a newline')
  assert.deepEqual(built.executables, ['wp-content/themes/vega/bin/build.sh'])
  assert.deepEqual(built.modes, { 'dir 0755': 11, 'file 0644': 7, 'file 0755': 1 })
  const check = checkWebrootTar(out, { standConfig: dockerConfig, placeholders: rendered.placeholders })
  assert.deepEqual(check.problems, [])
  assert.deepEqual(check.unreadable, [])
  assert.deepEqual(snapshot(root), before, 'modes and contents of the stand are what they were')
  assert.deepEqual(readdirSync(dir), ['w.tar.gz'], 'no partial archive left beside it')
  assert.equal(MODE_POLICY.file, '0644')
  assert.equal(MODE_POLICY.directory, '0755')
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('pack check: an archive written with the stand\'s modes (what 3175819 shipped) lists every member others cannot read', () => {
  const root = umask077Webroot()
  const dir = tmp()
  const out = path.join(dir, 'old.tar.gz')
  // the pre-#34 pack: tar with owner 0:0 and the modes it finds
  const bsd = /bsdtar|libarchive/.test(spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout)
  const owner = bsd ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'] : ['--owner=0', '--group=0', '--numeric-owner']
  const r = spawnSync('tar', [...owner, '-czf', out, '-C', root, 'index.php', 'wp-includes', 'wp-content', 'wp-config.php'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const check = checkWebrootTar(out, { standConfig: null, placeholders: {} })
  const unreadable = check.unreadable.map((u) => u.name.replace(/\/$/, ''))
  for (const name of ['wp-config.php', 'index.php', 'wp-content', 'wp-content/themes/vega', 'wp-content/themes/vega/style.css', 'wp-content/uploads', `wp-content/uploads/2026/09/${NEWLINE_NAME}`])
    assert.ok(unreadable.includes(name), `${JSON.stringify(name)} listed (listed: ${unreadable.length})`)
  assert.ok(check.problems.includes('member wp-config.php is a file 0600 (others cannot read it) — the policy is 0644 or 0755'), check.problems.join('\n'))
  assert.ok(check.problems.some((p) => /^member wp-content\/themes\/vega\/? is a directory 0700 \(others cannot list or enter it\) — the policy is 0755$/.test(p)))
  assert.ok(check.problems.some((p) => /^member wp-content\/themes\/vega\/bin\/build\.sh is a file 0700/.test(p)))
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('pack: a member it cannot normalise stops it by name, and nothing is left at --out', (t) => {
  const dir = tmp()
  const rendered = renderQuickstartConfig(dockerConfig)
  const cases = [
    ['fifo', (root) => spawnSync('mkfifo', [path.join(root, 'wp-content', 'uploads', 'pipe')]).status === 0, /member wp-content\/uploads\/pipe: fifo — only regular files and directories ship/],
    ['unreadable', (root) => (chmodSync(path.join(root, 'wp-content', 'themes', 'base', 'style.css'), 0o000), true), /member wp-content\/themes\/base\/style\.css: the packer cannot read it \(permission denied\)$/]
  ]
  for (const [name, make, expected] of cases) {
    if (name === 'unreadable' && process.getuid?.() === 0) continue // root reads 0000
    const root = umask077Webroot()
    assert.ok(make(root), `${name}: set up`)
    const out = path.join(dir, `${name}.tar.gz`)
    writeFileSync(out, 'an older archive')
    assert.throws(() => buildWebrootTar({ webroot: root, out, config: rendered.source }), expected, name)
    assert.ok(!existsSync(out), `${name}: the older archive at --out is gone`)
    assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.partial-')), [], `${name}: no partial`)
    chmodSync(path.join(root, 'wp-content', 'themes', 'base', 'style.css'), 0o600)
    rmSync(root, { recursive: true, force: true })
  }
  rmSync(dir, { recursive: true, force: true })
})

test('archive.py: a hardlink ships as a regular file; a member gone since the walk, listed twice, not relative or of another kind than the walk saw is named', () => {
  const root = umask077Webroot()
  const dir = tmp()
  linkSync(path.join(root, 'index.php'), path.join(root, 'wp-content', 'twin.php'))
  const out = path.join(dir, 'h.tar.gz')
  buildWebrootTar({ webroot: root, out, config: '<?php\n', keepRoot: [] })
  const twin = listArchive(out).find((r) => r.name === 'wp-content/twin.php')
  assert.equal(twin.type, 'file')
  assert.equal(twin.mode, 0o644)
  const cfg = path.join(dir, 'wp-config.php')
  writeFileSync(cfg, '<?php\n')
  const build = (names) => {
    const list = path.join(dir, 'list.nul')
    writeFileSync(list, names.join('\0') + '\0')
    return () => archivePy(['build', '--root', root, '--root-id', dirIdentity(root), '--list', list, '--config', cfg, '--out', path.join(dir, 'x.tar.gz')])
  }
  assert.throws(build(['index.php', 'gone.php']), /^Error: member gone\.php: gone since the webroot was walked/)
  assert.throws(build(['index.php', 'index.php']), /^Error: member index\.php: listed twice$/)
  for (const name of ['../etc', './index.php', 'wp-content//x', 'wp-content/./x', '/etc/passwd'])
    assert.throws(build([name]), new RegExp(`^Error: member ${name.replace(/[./]/g, '\\$&')}: not a canonical relative path$`), name)
  assert.throws(build(['index.php/']), /^Error: member index\.php: was a directory when the webroot was walked, is now a file$/)
  assert.throws(build(['wp-content']), /^Error: member wp-content: was a file when the webroot was walked, is now a directory$/)
  assert.throws(() => listArchive(path.join(dir, 'list.nul')), /cannot be read/)
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('auditArchiveMembers: every way a member leaves the policy is one named problem', () => {
  const row = (name, type, m, extra = {}) => ({ name, type, mode: m, uid: 0, gid: 0, pax: [], linkname: '', ...extra })
  const a = auditArchiveMembers([
    row('index.php', 'file', 0o644),
    row('wp-content', 'dir', 0o755),
    row('wp-content/x.sh', 'file', 0o755),
    row('wp-config.php', 'file', 0o600),
    row('wp-content/themes', 'dir', 0o711),
    row('wp-content/g.php', 'file', 0o664),
    row('wp-content/s.php', 'file', 0o4755),
    row('wp-content/link', 'symlink', 0o777, { linkname: '/etc/passwd' }),
    row('wp-content/hard', 'hardlink', 0o644, { linkname: 'index.php' }),
    row('wp-content/p', 'fifo', 0o644),
    row('index.php', 'file', 0o644),
    row('wp-content/u.php', 'file', 0o644, { uid: 501, gid: 20 }),
    row('wp-content/a.php', 'file', 0o644, { pax: ['LIBARCHIVE.xattr.com.apple.provenance'] })
  ])
  assert.deepEqual(a.problems, [
    'member wp-config.php is a file 0600 (others cannot read it) — the policy is 0644 or 0755',
    'member wp-content/themes is a directory 0711 (others cannot list or enter it) — the policy is 0755',
    'member wp-content/g.php is a file 0664 — the policy is 0644 or 0755',
    'member wp-content/s.php is a file 04755 — the policy is 0644 or 0755',
    'unsupported member symlink: wp-content/link → /etc/passwd — only regular files and directories ship',
    'unsupported member hardlink: wp-content/hard → index.php — only regular files and directories ship',
    'unsupported member fifo: wp-content/p — only regular files and directories ship',
    'duplicate member: index.php',
    'member wp-content/u.php is owned by 501:20, not 0:0',
    'member wp-content/a.php carries LIBARCHIVE.xattr.com.apple.provenance'
  ])
  assert.deepEqual(a.unreadable.map((u) => u.name), ['wp-config.php', 'wp-content/themes'])
  assert.deepEqual(a.executables, ['wp-content/x.sh'])
  assert.deepEqual(unsafeMembers([row('a', 'file', 0o644), row('b', 'symlink', 0o777), row('../c', 'file', 0o644), row('a', 'file', 0o644)]), [
    'symlink b',
    'unsafe path "../c": not a canonical relative path (a ".", ".." or empty segment)',
    'duplicate a'
  ])
})

// ---------------------------------------------------------------- runtime access

const answer = (over = {}) => ({
  nonce: 'n1',
  sapi: 'cli',
  euid: 33,
  user: null,
  canary: false,
  entries: 10,
  unreadable: [],
  notRoot: [],
  truncated: false,
  required: {
    'wp-config.php': { type: 'file', mode: '0644', uid: 0, gid: 0, ok: true },
    'wp-content/uploads': { type: 'dir', mode: '0755', uid: 0, gid: 0, ok: true },
    'wp-content/themes/vega': { type: 'dir', mode: '0755', uid: 0, gid: 0, ok: true },
    'wp-content/themes/vega/style.css': { type: 'file', mode: '0644', uid: 0, gid: 0, ok: true }
  },
  themes: { vega: 'wp-content/themes/vega' },
  ...over
})

test('evaluateAccess: a 0600 wp-config.php, an unreadable theme, uploads that cannot be entered are named failures', () => {
  const opts = { nonce: 'n1', via: 'wp-cli', runtimeUid: 33 }
  assert.deepEqual(evaluateAccess(answer(), opts), [])
  const bad = answer({
    unreadable: [
      { path: 'wp-config.php', type: 'file', mode: '0600', uid: 0, gid: 0, ok: false },
      { path: 'wp-content/themes/vega/style.css', type: 'file', mode: '0600', uid: 0, gid: 0, ok: false },
      { path: 'wp-content/uploads', type: 'dir', mode: '0700', uid: 0, gid: 0, ok: false },
      { path: 'wp-includes/x.php', type: 'file', mode: '0640', uid: 0, gid: 0, ok: false }
    ],
    notRoot: [{ path: 'wp-content/cache', type: 'dir', mode: '0755', uid: 33, gid: 33, ok: true }]
  })
  bad.required['wp-config.php'].ok = false
  assert.deepEqual(evaluateAccess(bad, opts), [
    'wp-cli: wp-config.php file wp-config.php is not readable by uid 33 (mode 0600, owner 0:0)',
    'wp-cli: theme vega file wp-content/themes/vega/style.css is not readable by uid 33 (mode 0600, owner 0:0)',
    'wp-cli: uploads directory wp-content/uploads is not listable/enterable by uid 33 (mode 0700, owner 0:0)',
    'wp-cli: webroot file wp-includes/x.php is not readable by uid 33 (mode 0640, owner 0:0)',
    'wp-cli: wp-content/cache is owned by 33:33, not root — the fleet\'s files are root-owned'
  ])
  const missing = answer()
  missing.required['wp-content/uploads'] = null
  assert.match(evaluateAccess(missing, opts)[0], /runtime path wp-content\/uploads \(uploads\) is missing/)
})

test('evaluateAccess: root, the wrong uid, an unknown identity, a canary it could read, a stale nonce are all failures', () => {
  const opts = { nonce: 'n1', via: 'wp-cli', runtimeUid: 33 }
  assert.match(evaluateAccess(answer({ euid: 0, user: 'root' }), opts)[0], /runs as root/)
  assert.match(evaluateAccess(answer({ euid: 82, user: 'www-data' }), opts)[0], /runs as uid 82 \(www-data\), not the fleet's www-data \(uid 33\)/)
  assert.match(evaluateAccess(answer({ euid: null }), opts)[0], /identity unknown/)
  assert.match(evaluateAccess(answer({ canary: true }), opts)[0], /does not enforce file modes/)
  assert.match(evaluateAccess(answer({ canary: null }), opts)[0], /canary was not found/)
  assert.match(evaluateAccess(answer({ nonce: 'old' }), opts)[0], /answered for another run/)
  assert.match(evaluateAccess(null, opts)[0], /gave no answer/)
  assert.match(evaluateAccess(answer({ user: 'daemon' }), { ...opts, via: 'http', userName: 'www-data' })[0], /http runs as uid 33 \(daemon\), not www-data/)
  assert.deepEqual(identityProblems(answer({ unreadable: [{ path: 'x', type: 'file', mode: '0600', uid: 0, gid: 0 }] }), opts), [], 'what the old webroot holds does not block the wipe')
  assert.equal(parseProbe(`PHP Warning: x\n${PROBE_MARK}{"a":1}${PROBE_MARK}`).a, 1)
  assert.equal(parseProbe('Error: Strange wp-config.php file'), null)
})

test('the access probe itself (php CLI): names an unreadable wp-config.php, uploads it cannot enter, and finds the parent theme', (t) => {
  if (spawnSync('php', ['-v']).status !== 0) return t.skip('php not on this host (the Docker integration runs it)')
  if (process.getuid?.() === 0) return t.skip('root reads every mode')
  const root = umask077Webroot()
  const nonce = 'abc123'
  writeFileSync(path.join(root, `tracy-probe-${nonce}.php`), accessProbePhp({ nonce, webroot: root, themes: ['vega'] }))
  writeFileSync(path.join(root, `tracy-probe-${nonce}.canary`), 'canary')
  chmodSync(path.join(root, `tracy-probe-${nonce}.canary`), 0o000)
  chmodSync(path.join(root, 'wp-config.php'), 0o000)
  chmodSync(path.join(root, 'wp-content', 'uploads'), 0o300)
  const r = spawnSync('php', [path.join(root, `tracy-probe-${nonce}.php`)], { encoding: 'utf8' })
  const probe = parseProbe(r.stdout)
  assert.ok(probe, r.stdout + r.stderr)
  assert.equal(probe.canary, false)
  assert.equal(probe.euid, process.getuid())
  assert.deepEqual(Object.keys(probe.themes), ['vega', 'base'], 'the parent named by Template:')
  assert.deepEqual(probe.unreadable.map((u) => u.path).sort(), ['wp-config.php', 'wp-content/uploads'])
  assert.ok(!JSON.stringify(probe).includes('DB_PASSWORD'), 'no file contents')
  const problems = evaluateAccess(probe, { nonce, via: 'wp-cli', runtimeUid: process.getuid() })
  const cfg = probe.unreadable.find((u) => u.path === 'wp-config.php')
  const who = `uid ${probe.euid}${probe.user ? ` (${probe.user})` : ''}`
  assert.ok(problems.includes(`wp-cli: wp-config.php file wp-config.php is not readable by ${who} (mode 0000, owner ${cfg.uid}:${cfg.gid})`), problems.join('\n'))
  assert.ok(problems.some((p) => /uploads directory wp-content\/uploads is not listable\/enterable/.test(p)))
  chmodSync(path.join(root, 'wp-content', 'uploads'), 0o700)
  rmSync(root, { recursive: true, force: true })
})

// A rendered wp-config.php with the four defines render_wp_config.py needs; BROKEN has them all and
// still does not compile.
const CONFIG = "<?php\ndefine( 'DB_NAME', 'verify' );\ndefine( 'DB_USER', 'root' );\ndefine( 'DB_PASSWORD', 's3cret' );\ndefine( 'DB_HOST', 'db' );\n$table_prefix = 'wp_';\n/* That's all, stop editing! Happy publishing. */\nif ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', __DIR__ . '/' ); }\nrequire_once ABSPATH . 'wp-settings.php';\n"
const BROKEN = CONFIG.replace("$table_prefix = 'wp_';", "$table_prefix = 'wp_'\nif ( true ) {")

// The parameters a probe or compile-check script carries (lib.mjs phpBase64: 76-char literals joined with `.`).
const scriptParams = (php) => JSON.parse(Buffer.from([.../base64_decode\(([^)]*)\)/.exec(php)[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).join(''), 'base64').toString())

// Injected runners: `root` answers the scripts restore sends, `wp` answers the probe for the nonce
// it was written with.
function fakes({ uid = '0', echo = true, empty = true, probe = {}, wpFails = false, wpStatus = 0, webrootKind = 'dir 2049:77', writeFails = false, rmFails = false, lint = { exit: 0, output: 'No syntax errors detected in Standard input code' } } = {}) {
  const calls = []
  let nonce = null
  let lintNonce = null
  const root = (script, opts = {}) => {
    calls.push(script)
    if (script === 'id -u') return `${uid}\n`
    if (script === 'cat') return echo ? opts.input : ''
    if (script.includes('[ -d "$1" ]')) return `${webrootKind}\n`
    if (script.includes('ls -A')) return empty ? 'empty\n' : ''
    if (script.includes('cat > "$1.php"')) {
      nonce = scriptParams(opts.input).nonce
      if (writeFails) throw new Error('root runner: write the access probe exited 1: chown: changing ownership: Operation not permitted')
    }
    if (script.includes('cat > "$1.lint.php"')) lintNonce = scriptParams(opts.input).nonce
    if (script.includes('rm -f --')) return rmFails ? { status: 1, stdout: '', stderr: 'rm: read-only file system' } : { status: 0, stdout: '', stderr: '' }
    return ''
  }
  const wp = (args) => {
    calls.push(`wp ${args.join(' ')}`)
    if (args[0] === 'option') return { status: 0, stdout: 'vega\n', stderr: '' }
    if (args[0] === 'eval-file' && args[1].endsWith('.lint.php')) {
      if (lint === 'no-answer') return { status: 255, stdout: '', stderr: 'PHP Fatal error: proc_open(): Exec failed' }
      const a = { nonce: lint.nonce ?? lintNonce, ok: lint.exit === 0 && !lint.error, exit: lint.exit ?? null, output: lint.output ?? '', error: lint.error ?? null }
      return { status: lint.status ?? 0, stdout: `${LINT_MARK}${JSON.stringify(a)}${LINT_MARK}`, stderr: '' }
    }
    if (wpFails === 'root') return { status: 1, stdout: '', stderr: "Error: YIKES! It looks like you're running this as root. You probably meant to run this as the user that your WordPress installation exists under." }
    if (wpFails) return { status: 1, stdout: '', stderr: 'Error: This does not seem to be a WordPress installation.' }
    return { status: wpStatus, stdout: `${PROBE_MARK}${JSON.stringify(answer({ nonce, ...probe }))}${PROBE_MARK}`, stderr: wpStatus ? 'PHP Fatal error: after the probe' : '' }
  }
  return { root, wp, calls }
}

test('prepareWebroot: a runner that is not root, loses stdin, or a www-data runner that is root or not held to modes — refused before anything is wiped', async () => {
  const wiped = (calls) => calls.some((c) => c.includes('rm -rf'))
  for (const [setup, expected] of [
    [{ uid: '1000' }, /runs as uid 1000, not root/],
    [{ echo: false }, /does not pass stdin through/],
    [{ probe: { euid: 0, user: 'root' } }, /nothing was wiped:\n {2}wp-cli runs as root/],
    [{ probe: { canary: true } }, /does not enforce file modes/],
    [{ wpFails: true }, /wp-cli could not run the access probe/],
    [{ wpFails: 'root' }, /nothing was wiped:\n {2}wp-cli runs as root/],
    // a valid probe answer from a run that then failed is a failure to run, not a finding to skip
    [{ wpStatus: 1 }, /nothing was wiped:\n {2}wp-cli ran the access probe but exited 1: PHP Fatal error/]
  ]) {
    const f = fakes({ ...setup, empty: false })
    await assert.rejects(() => prepareWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: CONFIG }), expected)
    assert.ok(!wiped(f.calls), `${expected}: nothing wiped`)
  }
  const kept = fakes({ empty: false })
  await assert.rejects(() => prepareWebroot({ root: kept.root, wp: kept.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: false, config: CONFIG }), /is not empty — pass --wipe/)
  const ok = fakes({ empty: false })
  const r = await prepareWebroot({ root: ok.root, wp: ok.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: CONFIG })
  assert.deepEqual({ identity: r.identity, wiped: r.wiped }, { identity: { euid: 33, user: null, canaryReadable: false }, wiped: true })
  assert.equal(r.root.id, '2049:77', 'the runner every later step uses is bound to the checked webroot')
  // every root step after the check runs inside the checked directory, on relative names
  const inside = ok.calls.filter((c) => c.includes('ls -A') || c.includes('rm -rf') || c.includes('cat > "$1.php"'))
  assert.equal(inside.length, 3)
  for (const c of inside) assert.ok(c.startsWith(WEBROOT_ANCHOR), c)
  assert.ok(wiped(ok.calls))
  assert.ok(ok.calls.some((c) => c.includes('rm -f -- "$1.php"')), 'probe removed')
  assert.ok(ok.calls.some((c) => c.startsWith(WEBROOT_ANCHOR) && c.includes('rm -f -- "$1.lint.php"')), 'compile check removed')
})

test('prepareWebroot: a wp-config.php that has the four defines but does not compile is named before anything is wiped', async () => {
  const wiped = (calls) => calls.some((c) => c.includes('rm -rf'))
  const parse = "PHP Parse error:  syntax error, unexpected token \"if\" in Standard input code on line 7\nErrors parsing Standard input code"
  for (const [lint, expected] of [
    [{ exit: 255, output: parse }, /^Error: wp-config\.php as rendered for this stand does not compile \(php -l exit 255\): PHP Parse error: {2}syntax error, unexpected token "if" in Standard input code on line 7 — nothing was wiped$/],
    [{ exit: 0, error: 'this PHP cannot run php -l (no proc_open or no PHP_BINARY)' }, /^Error: wp-config\.php: this PHP cannot run php -l .* — nothing was wiped$/],
    ['no-answer', /^Error: wp-config\.php: wp-cli could not run the compile check \(exit 255\): PHP Fatal error: proc_open\(\): Exec failed — nothing was wiped$/],
    [{ exit: 0, status: 1 }, /^Error: wp-config\.php: wp-cli ran the compile check but exited 1/],
    [{ exit: 0, nonce: 'stale' }, /^Error: wp-config\.php: the compile check answered for another run/]
  ]) {
    const f = fakes({ empty: false, lint })
    await assert.rejects(() => prepareWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: BROKEN }), expected)
    assert.ok(!wiped(f.calls), `${expected}: nothing wiped`)
    assert.ok(f.calls.some((c) => c.includes('rm -f -- "$1.lint.php"')), `${expected}: compile check removed`)
  }
  // the file holds the database password: written for the runtime uid only, 0400
  const f = fakes({ empty: false })
  await prepareWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: CONFIG })
  const write = f.calls.find((c) => c.includes('cat > "$1.lint.php"'))
  assert.ok(write.startsWith(WEBROOT_ANCHOR) && write.includes('umask 077') && write.includes('chown "$2:0"') && write.includes('chmod 0400'), write)
  assert.ok(f.calls.indexOf(write) < f.calls.findIndex((c) => c.includes('rm -rf')), 'compiled before the wipe')
  // a write that fails half way is still removed, and nothing is wiped
  const wf = fakes({ empty: false })
  const root = (script, opts) => {
    if (script.includes('cat > "$1.lint.php"')) {
      wf.calls.push(script)
      throw new Error('root runner: write the config compile check exited 1: chown: invalid user')
    }
    return wf.root(script, opts)
  }
  await assert.rejects(() => prepareWebroot({ root, wp: wf.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: CONFIG }), /write the config compile check exited 1/)
  assert.ok(!wiped(wf.calls) && wf.calls.some((c) => c.includes('rm -f -- "$1.lint.php"')))
  await assert.rejects(() => prepareWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true }), /needs the rendered wp-config\.php/)
})

test('the config compile check itself (php CLI): php -l on stdin passes the stock shape, names a parse error, runs under the CLI only', (t) => {
  if (spawnSync('php', ['-v']).status !== 0) return t.skip('php not on this host (the Docker integration runs it)')
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-lint-'))
  const run = (config, nonce = 'n1') => {
    writeFileSync(path.join(dir, 'lint.php'), configLintPhp({ nonce, config }))
    return spawnSync('php', [path.join(dir, 'lint.php')], { encoding: 'utf8' })
  }
  assert.equal(lintVerdict(run(CONFIG), 'n1'), null)
  const bad = lintVerdict(run(BROKEN), 'n1')
  assert.match(bad, /^wp-config\.php as rendered for this stand does not compile \(php -l exit 255\): .*(Parse|syntax) error/, bad)
  assert.ok(!bad.includes('s3cret'), 'the verdict carries no config text')
  assert.equal(lintVerdict(run(CONFIG, 'n2'), 'n1'), 'wp-config.php: the compile check answered for another run')
  // `wp eval-file` silently runs nothing for a script with a literal of a few KB: a config the size
  // of the stock one (~6 KB) travels as 76-char literals, and still decodes whole
  const big = CONFIG.replace('<?php\n', `<?php\n/* ${'x'.repeat(8000)} */\n`)
  for (const php of [configLintPhp({ nonce: 'n1', config: big }), accessProbePhp({ nonce: 'n1', webroot: '/var/www/html', themes: Array.from({ length: 300 }, (_, i) => `theme-${i}`) })])
    assert.ok(Math.max(...[...php.matchAll(/'[^'\n]*'/g)].map((m) => m[0].length)) <= 78, 'no literal longer than 76 chars')
  assert.equal(scriptParams(configLintPhp({ nonce: 'n1', config: big })).config, big)
  assert.equal(lintVerdict(run(big), 'n1'), null)
  // it runs under the CLI only: a web server's PHP gets a 404 before the config is decoded
  assert.match(configLintPhp({ nonce: 'n1', config: CONFIG }), /^<\?php\nif \(PHP_SAPI !== 'cli'\) \{ http_response_code\(404\); exit; \}\n/)
  rmSync(dir, { recursive: true, force: true })
})

test('probeWebroot: the probe is removed even when wp-cli throws; an HTTP answer from another identity fails', async () => {
  const f = fakes()
  const throwing = () => {
    throw new Error('wp timed out')
  }
  await assert.rejects(() => probeWebroot({ root: f.root, wp: throwing, webroot: '/var/www/html', runtimeUid: 33 }), /wp timed out/)
  assert.ok(f.calls.at(-1).includes('rm -f'), 'removed in finally')
  const g = fakes()
  let asked = null
  const fetchImpl = async (url) => {
    asked = url
    const nonce = new URL(url).searchParams.get('n')
    return { status: 200, text: async () => `${PROBE_MARK}${JSON.stringify(answer({ nonce, sapi: 'apache2handler', euid: 0, user: 'root' }))}${PROBE_MARK}` }
  }
  const r = await probeWebroot({ root: g.root, wp: g.wp, webroot: '/var/www/html', runtimeUid: 33, siteUrl: 'http://b.test/', fetchImpl })
  assert.match(asked, /^http:\/\/b\.test\/tracy-probe-[0-9a-f]{24}\.php\?n=[0-9a-f]{24}$/)
  assert.equal(r.ok, false)
  assert.ok(r.problems.includes('http runs as root — the fleet runs PHP and wp-cli as www-data, so a root probe proves nothing'), r.problems.join('\n'))
  assert.ok(r.problems.includes('wp-cli runs as uid 33 but the web server\'s PHP as uid 0 — the fleet runs both as www-data'))
  const late = await probeWebroot({ root: g.root, wp: g.wp, webroot: '/var/www/html', runtimeUid: 33, siteUrl: 'http://b.test', fetchImpl: async () => { throw new Error('The operation was aborted due to timeout') } })
  assert.ok(late.problems.some((p) => /^http: the access probe at http:\/\/b\.test failed: The operation was aborted/.test(p)))
  const html = await probeWebroot({ root: g.root, wp: g.wp, webroot: '/var/www/html', runtimeUid: 33, siteUrl: 'http://b.test', fetchImpl: async () => ({ status: 404, text: async () => '<html>' }) })
  assert.ok(html.problems.some((p) => /answered 404 without a probe result/.test(p)))
})

test('checkRootRunner and checkAccess: no runner, a red restore report, a report of another archive are failures, never passes', async () => {
  assert.throws(() => checkRootRunner(fakes({ uid: '' }).root, '/var/www/html'), /runs as uid \(nothing\), not root/)
  const none = await checkAccess({ wp: null, root: null, webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33 })
  assert.equal(none.ok, false)
  assert.match(none.problems[0], /access probe did not run — pass --wp-b and --root-b/)
  const f = fakes()
  const fetchImpl = async (url) => ({ status: 200, text: async () => `${PROBE_MARK}${JSON.stringify(answer({ nonce: new URL(url).searchParams.get('n'), sapi: 'apache2handler', user: 'www-data' }))}${PROBE_MARK}` })
  const manifest = { theme: { name: 'vega' }, webroot: { file: 'w.tar.gz', sha256: 'aaa' }, database: { file: 'd.sql.gz', sha256: 'ddd' } }
  const measured = { manifest: 'mmm', webrootArchive: 'aaa', databaseArchive: 'ddd', webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33 }
  const good = { ok: true, binding: { ...measured }, access: { afterRestore: { ok: true } } }
  const run = (over) => checkAccess({ wp: f.wp, root: f.root, webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33, manifest, measured, restoreReport: good, fetchImpl, ...over })
  const ok = await run({})
  assert.deepEqual(ok.problems, [])
  assert.equal(ok.ok, true)
  assert.equal(ok.http.user, 'www-data')
  const stale = await run({ restoreReport: { ...good, binding: { ...measured, webrootArchive: 'bbb' } } })
  assert.deepEqual(stale.problems, ['the restore report is of webrootArchive "bbb", not "aaa"'])
  // the archive changed on disk since the restore: the manifest and the report both speak for the old one
  const changed = await run({ measured: { ...measured, webrootArchive: 'ccc' } })
  assert.deepEqual(changed.problems, ["the pack's archive w.tar.gz is ccc, its manifest says aaa", 'the restore report is of webrootArchive "aaa", not "ccc"'])
  const unmeasured = await run({ measured: { ...measured, webrootArchive: null } })
  assert.equal(unmeasured.ok, false)
  const badPack = await run({ manifest: null, packProblems: ['the pack /p does not check out: SHA256SUMS does not cover manifest.json'] })
  assert.deepEqual(badPack.problems, ['the pack /p does not check out: SHA256SUMS does not cover manifest.json', 'the restore report cannot be matched to a pack — pass --pack'])
  const red = await run({ restoreReport: { ok: false, error: 'the restored webroot is not usable\n  x' } })
  assert.deepEqual(red.problems.slice(0, 2), ['the restore report says the restore did not finish: the restored webroot is not usable', 'the restore report carries no passing access check'])
})

// ---------------------------------------------------------------- review round 3 (Sol, 28/09)

test('restore report binding: the database, the manifest and the restore target are held to the report as the webroot archive is', async () => {
  const f = fakes()
  const fetchImpl = async (url) => ({ status: 200, text: async () => `${PROBE_MARK}${JSON.stringify(answer({ nonce: new URL(url).searchParams.get('n'), sapi: 'apache2handler', user: 'www-data' }))}${PROBE_MARK}` })
  const manifest = { theme: { name: 'vega' }, webroot: { file: 'w.tar.gz', sha256: 'aaa' }, database: { file: 'd.sql.gz', sha256: 'ddd' } }
  const measured = { manifest: 'mmm', webrootArchive: 'aaa', databaseArchive: 'ddd', webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33 }
  const report = (binding) => ({ ok: true, binding, access: { afterRestore: { ok: true } } })
  const run = (restoreReport, m = measured, mf = manifest) => checkAccess({ wp: f.wp, root: f.root, webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33, manifest: mf, measured: m, restoreReport, fetchImpl })
  // database archive, manifest and SHA256SUMS swapped together after the restore: sums hold, the report does not
  const swapped = { ...manifest, database: { file: 'd.sql.gz', sha256: 'eee' } }
  assert.deepEqual((await run(report({ ...measured }), { ...measured, databaseArchive: 'eee', manifest: 'nnn' }, swapped)).problems, [
    'the restore report is of manifest "mmm", not "nnn"',
    'the restore report is of databaseArchive "ddd", not "eee"'
  ])
  // a database archive changed on disk alone: the manifest no longer speaks for it either
  assert.deepEqual((await run(report({ ...measured }), { ...measured, databaseArchive: 'fff' })).problems, [
    "the pack's database d.sql.gz is fff, its manifest says ddd",
    'the restore report is of databaseArchive "ddd", not "fff"'
  ])
  for (const [k, v] of [['webroot', '/srv/other'], ['siteUrl', 'http://c'], ['runtimeUid', 1001]])
    assert.deepEqual((await run(report({ ...measured, [k]: v }))).problems, [`the restore report is of ${k} ${JSON.stringify(v)}, not ${JSON.stringify(measured[k])}`], k)
  assert.deepEqual((await run({ ok: true, archive: { sha256: 'aaa' }, access: { afterRestore: { ok: true } } })).problems, ['the restore report carries no binding to a pack and a webroot (restored by an older restore.mjs?)'])
  assert.deepEqual(bindingProblems({ ...measured }, { ...measured, manifest: null }), ['manifest: not measured by verify — the restore report cannot be matched to it'])
})

test('checkAccess: an active theme wp-cli cannot read, an empty one, or another than the manifest\'s is a named failure; a probe that checked no theme is not a pass', async () => {
  const fetchImpl = async (url) => ({ status: 200, text: async () => `${PROBE_MARK}${JSON.stringify(answer({ nonce: new URL(url).searchParams.get('n'), sapi: 'apache2handler', user: 'www-data' }))}${PROBE_MARK}` })
  const withOptions = (answerOption) => {
    const f = fakes()
    const wp = (args, opts) => (args[0] === 'option' ? answerOption(args[2]) : f.wp(args, opts))
    return { root: f.root, wp }
  }
  const base = { webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33, fetchImpl }
  const failing = withOptions(() => ({ status: 1, stdout: '', stderr: 'Error: Error establishing a database connection.' }))
  const a = await checkAccess({ ...base, ...failing })
  assert.equal(a.ok, false)
  assert.deepEqual(a.problems.slice(0, 2), [
    'wp-cli cannot read the active theme (option stylesheet exited 1: Error: Error establishing a database connection.)',
    'wp-cli cannot read the active theme (option template exited 1: Error: Error establishing a database connection.)'
  ])
  assert.ok(a.problems.includes('wp-cli: no theme to check — the active theme was not determined'), a.problems.join('\n'))
  const empty = await checkAccess({ ...base, ...withOptions(() => ({ status: 0, stdout: '\n', stderr: '' })) })
  assert.ok(empty.problems.includes('wp-cli cannot read the active theme (option stylesheet is empty)'), empty.problems.join('\n'))
  const other = await checkAccess({ ...base, ...withOptions(() => ({ status: 0, stdout: 'vega\n', stderr: '' })), manifest: { theme: { name: 'kinetic' }, webroot: {}, database: {} } })
  assert.ok(other.problems.includes("the active theme is vega, the pack's manifest says kinetic"), other.problems.join('\n'))
  assert.ok(other.problems.includes('wp-cli: theme "kinetic" was not checked by the probe'), other.problems.join('\n'))
  // the probe's own verdict: a theme it was asked for and did not take (not a directory name) is not checked
  assert.deepEqual(evaluateAccess(answer(), { nonce: 'n1', via: 'wp-cli', runtimeUid: 33, themes: ['vega', '../x'] }), ['wp-cli: theme "../x" was not checked by the probe'])
  assert.deepEqual(evaluateAccess(answer(), { nonce: 'n1', via: 'wp-cli', runtimeUid: 33, themes: [] }), ['wp-cli: no theme to check — the active theme was not determined'])
  const g = fakes()
  const none = await probeWebroot({ root: g.root, wp: g.wp, webroot: '/var/www/html', runtimeUid: 33 })
  assert.deepEqual(none.problems, ['wp-cli: no theme to check — the active theme was not determined'])
})

test('readPack: every manifest field restore and verify read is checked before anything runs; restore stops on it before a root command', () => {
  const dir = tmp()
  const write = (name, body) => writeFileSync(path.join(dir, name), body)
  write('w.tar.gz', 'webroot bytes')
  write('d.sql.gz', 'database bytes')
  const full = {
    schemaVersion: 'tracy-quickstart/v1', id: 'x/wp7', version: '1.0.0', platform: 'wordpress', wpVersion: '7.0',
    theme: { name: 'vega', version: '1.0.0' },
    webroot: { file: 'w.tar.gz', sha256: sha256File(path.join(dir, 'w.tar.gz')) },
    database: { file: 'd.sql.gz', sha256: sha256File(path.join(dir, 'd.sql.gz')) }
  }
  assert.deepEqual(manifestProblems(full), [])
  const without = (key, sub) => {
    const m = structuredClone(full)
    if (sub) delete m[key][sub]
    else delete m[key]
    return m
  }
  for (const [m, expected] of [
    [without('theme', 'name'), /theme\.name undefined is not a theme directory name/],
    [without('theme'), /theme\.name undefined is not a theme directory name/],
    [{ ...full, theme: { name: '../etc' } }, /theme\.name "\.\.\/etc" is not a theme directory name/],
    [without('wpVersion'), /wpVersion undefined is not a WordPress version/],
    [without('id'), /manifest\.json has no id/],
    [without('version'), /manifest\.json has no version/],
    [without('schemaVersion'), /schemaVersion is undefined, not "tracy-quickstart\/v1"/],
    [without('database', 'sha256'), /database\.sha256 undefined is not a sha256/],
    [{ ...full, database: { ...full.database, file: 'w.tar.gz', sha256: full.webroot.sha256 } }, /names w\.tar\.gz as both archives/],
    [[], /manifest\.json is not a JSON object/]
  ]) {
    write('manifest.json', JSON.stringify(m))
    write('SHA256SUMS', sumsText(['manifest.json', 'w.tar.gz', 'd.sql.gz'].map((file) => ({ file, sha256: sha256File(path.join(dir, file)) }))))
    assert.throws(() => readPack(dir), expected, JSON.stringify(m))
  }
  // the restore CLI: the pack is refused before the root runner is ever called
  write('manifest.json', JSON.stringify(without('theme', 'name')))
  write('SHA256SUMS', sumsText(['manifest.json', 'w.tar.gz', 'd.sql.gz'].map((file) => ({ file, sha256: sha256File(path.join(dir, file)) }))))
  const marker = path.join(dir, 'root-was-called')
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'quickstart', 'restore.mjs'), '--pack', dir, '--root-runner', `touch ${marker};`, '--wp', `touch ${marker};`, '--site-url', 'http://x', '--db-host', 'h', '--db-password', 'p', '--report', path.join(dir, 'r.json')], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /theme\.name undefined is not a theme directory name/)
  assert.ok(!existsSync(marker), 'no root or wp command ran')
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'r.json'), 'utf8')).ok, false)
  rmSync(dir, { recursive: true, force: true })
})

// A root runner on this host: the anchor's `stat -c` answered by BSD stat on macOS (same %d %i).
function anchorShell(dir) {
  const shim = path.join(dir, 'bin')
  mkdirSync(shim)
  writeFileSync(path.join(shim, 'stat'), '#!/bin/sh\nif [ "$1" = -c ] && ! /usr/bin/stat --version >/dev/null 2>&1; then f=$2; shift 2; exec /usr/bin/stat -f "$f" "$@"; fi\nexec /usr/bin/stat "$@"\n', { mode: 0o755 })
  return (webroot, id, script) => spawnSync('sh', ['-c', WEBROOT_ANCHOR + script, 'sh', webroot, id], { encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}` } })
}

test('WEBROOT_ANCHOR: a root step runs inside the directory that was checked; a webroot replaced or reached through a symlink since is refused', () => {
  const dir = realpathSync(tmp())
  const sh = anchorShell(dir)
  const webroot = path.join(dir, 'srv', 'html')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(path.join(webroot, 'index.php'), '<?php\n')
  const id = dirIdentity(webroot)
  const ok = sh(webroot, id, 'pwd -P; ls')
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.stdout, `${webroot}\nindex.php\n`)
  // the parent swapped for a symlink to elsewhere: same path, another directory
  const elsewhere = path.join(dir, 'elsewhere', 'html')
  mkdirSync(elsewhere, { recursive: true })
  renameSync(path.join(dir, 'srv'), path.join(dir, 'srv-old'))
  symlinkSync(path.join(dir, 'elsewhere'), path.join(dir, 'srv'))
  const viaLink = sh(webroot, id, 'touch wiped-here')
  assert.equal(viaLink.status, 97)
  assert.match(viaLink.stderr, /is not the directory checked before \(replaced, or a symlink on its path\)/)
  assert.ok(!existsSync(path.join(elsewhere, 'wiped-here')), 'nothing written through the swapped parent')
  // the webroot replaced by another directory at the same path
  rmSync(path.join(dir, 'srv'))
  mkdirSync(webroot, { recursive: true })
  const replaced = sh(webroot, id, 'touch wiped-here')
  assert.equal(replaced.status, 97)
  assert.ok(!existsSync(path.join(webroot, 'wiped-here')))
  // anchorRoot binds a checked runner to one webroot and passes $1… after the anchor's own
  const calls = []
  const fake = fakes()
  const at = anchorRoot((script, opts) => (calls.push(opts?.args), fake.root(script, opts)), '/var/www/html')
  at('cat > "$1"', { args: ['x.sql'] })
  assert.deepEqual(calls.at(-1), ['/var/www/html', '2049:77', 'x.sql'])
  assert.throws(() => anchorRoot(at, '/srv/other'), /bound to \/var\/www\/html, not \/srv\/other/)
  assert.throws(() => checkRootRunner(fakes({ webrootKind: 'dir ' }).root, '/var/www/html'), /cannot identify \/var\/www\/html/)
  rmSync(dir, { recursive: true, force: true })
})

test('pack: a webroot replaced between the walk and archive.py, or before the archive is published, is refused and nothing is published', () => {
  const root = umask077Webroot()
  const dir = tmp()
  const cfg = path.join(dir, 'wp-config.php')
  writeFileSync(cfg, '<?php\n')
  const list = path.join(dir, 'list.nul')
  writeFileSync(list, 'index.php\0')
  const out = path.join(dir, 'x.tar.gz')
  // archive.py handed another directory's identity (the walk read another directory)
  const other = path.join(dir, 'other')
  mkdirSync(other)
  assert.throws(
    () => archivePy(['build', '--root', root, '--root-id', dirIdentity(other), '--list', list, '--config', cfg, '--out', out]),
    /^Error: webroot .*: is not the directory the walk read \(\d+:\d+\) when the build opened it — replaced since the walk$/
  )
  // the webroot itself a symlink now: never followed
  const link = path.join(dir, 'link')
  symlinkSync(root, link)
  assert.throws(
    () => archivePy(['build', '--root', link, '--root-id', dirIdentity(root), '--list', list, '--config', cfg, '--out', out]),
    /^Error: webroot .*link: cannot be opened as a directory without following a symlink/
  )
  // swapped while the members are written: the members read from the opened directory still hold,
  // the path no longer names it
  const names = ['index.php', 'wp-content/']
  assert.match(
    buildWhile(root, dir, names, "if info.name == 'wp-config.php':\n    os.rename(root, root + '.old'); os.mkdir(root)"),
    /^webroot .*: is not the directory the walk read \(\d+:\d+\) when the build ended — replaced since the walk$/
  )
  rmSync(root + '.old', { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('acquireLock: one restore or verify per webroot; a lock whose process is gone is taken over', () => {
  const dir = tmp()
  const a = acquireLock('root-runner\n/var/www/html', { dir })
  assert.throws(() => acquireLock('root-runner\n/var/www/html', { dir }), new RegExp(`another restore or verify \\(pid ${process.pid}\\) is using this webroot`))
  const other = acquireLock('root-runner\n/srv/other', { dir })
  other.release()
  a.release()
  assert.deepEqual(readdirSync(dir), [])
  writeFileSync(path.join(dir, path.basename(a.file)), '999999999\n')
  const b = acquireLock('root-runner\n/var/www/html', { dir })
  assert.equal(readFileSync(b.file, 'utf8').trim(), String(process.pid))
  b.release()
  rmSync(dir, { recursive: true, force: true })
})

test('restore and verify-parity CLIs: no root runner is a usage error; verify without one is not ok', () => {
  const QS = path.join(HERE, '..', 'quickstart')
  const r = spawnSync(process.execPath, [path.join(QS, 'restore.mjs'), '--pack', '/nope', '--wp', 'wp', '--site-url', 'http://x', '--db-host', 'h', '--db-password', 'p'], { encoding: 'utf8' })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /--root-runner/)
  const bad = spawnSync(process.execPath, [path.join(QS, 'restore.mjs'), '--pack', '/nope', '--root-runner', 'x', '--wp', 'wp', '--site-url', 'http://x', '--db-host', 'h', '--db-password', 'p', '--runtime-uid', '0'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /--runtime-uid must be a uid other than 0/)
})

test('pack CLI: a run that fails leaves no manifest.json or SHA256SUMS of an earlier pack in --out', () => {
  const root = umask077Webroot()
  const out = tmp()
  writeFileSync(path.join(out, 'manifest.json'), '{"id":"old"}\n')
  writeFileSync(path.join(out, 'SHA256SUMS'), `${'0'.repeat(64)}  manifest.json\n`)
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'quickstart', 'pack.mjs'), '--webroot', root, '--wp', 'false', '--site-url', 'http://x', '--out', out, '--id', 'x/wp7', '--version', '1.0.0'], { encoding: 'utf8', env: { ...process.env, TRACY_WP_KEEP: '0' } })
  assert.equal(r.status, 1, r.stderr)
  assert.deepEqual(readdirSync(out), [])
  rmSync(root, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

// ---------------------------------------------------------------- review round 2 (Sol, 28/09)

test('archive.py: a parent swapped for a symlink since the walk is refused, never followed out of the webroot', () => {
  const root = umask077Webroot()
  const dir = tmp()
  const outside = path.join(dir, 'outside')
  mkdirSync(outside)
  writeFileSync(path.join(outside, 'style.css'), 'not from the webroot\n')
  const cfg = path.join(dir, 'wp-config.php')
  writeFileSync(cfg, '<?php\n')
  const list = path.join(dir, 'list.nul')
  writeFileSync(list, ['wp-content/', 'wp-content/themes/', 'wp-content/themes/base/', 'wp-content/themes/base/style.css', ''].join('\0'))
  // the walk saw a directory; the tree now has a symlink to elsewhere in its place
  renameSync(path.join(root, 'wp-content', 'themes', 'base'), path.join(dir, 'base-moved'))
  symlinkSync(outside, path.join(root, 'wp-content', 'themes', 'base'))
  const out = path.join(dir, 'x.tar.gz')
  const rid = dirIdentity(root)
  assert.throws(
    () => archivePy(['build', '--root', root, '--root-id', rid, '--list', list, '--config', cfg, '--out', out]),
    /^Error: member wp-content\/themes\/base: was a directory when the webroot was walked, is now a symlink$/
  )
  writeFileSync(list, ['wp-content/themes/base/style.css', ''].join('\0'))
  assert.throws(
    () => archivePy(['build', '--root', root, '--root-id', rid, '--list', list, '--config', cfg, '--out', out]),
    /^Error: member wp-content\/themes\/base\/style\.css: its parent wp-content\/themes\/base is no longer a directory \(a symlink or a file since the walk\)$/
  )
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

// archive.py driven from python with tarfile's addfile wrapped: what the stand does while a member
// is written, or after, is what the build must catch before it returns an archive.
function buildWhile(root, dir, names, hook) {
  const cfg = path.join(dir, 'wp-config.php')
  writeFileSync(cfg, '<?php\n')
  const list = path.join(dir, 'list.nul')
  writeFileSync(list, names.join('\0') + '\0')
  const script = `
import importlib.util, os, sys, tarfile, json
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('archive', ${JSON.stringify(path.join(HERE, '..', 'quickstart', 'archive.py'))})
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)
root = ${JSON.stringify(root)}
st = os.stat(root)
rid = '%d:%d' % (st.st_dev, st.st_ino)
orig = tarfile.TarFile.addfile
def addfile(self, info, fileobj=None):
    r = orig(self, info, fileobj)
${hook.split('\n').map((l) => '    ' + l).join('\n')}
    return r
tarfile.TarFile.addfile = addfile
try:
    a.build(root, rid, ${JSON.stringify(list)}, ${JSON.stringify(cfg)}, ${JSON.stringify(path.join(dir, 'x.tar.gz'))})
    print('built')
except a.MemberError as e:
    print(e)
`
  const r = spawnSync('python3', ['-c', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

test('archive.py: a file written to while it is read, replaced after it is read, or changed after it is archived stops the build by name', () => {
  const dir = tmp()
  const names = ['index.php', 'wp-content/', 'wp-content/themes/', 'wp-content/themes/vega/', 'wp-content/themes/vega/style.css']
  const cases = [
    // bytes appended to the member being written, before its descriptor is looked at again
    ["if info.name == 'index.php':\n    open(os.path.join(root, 'index.php'), 'a').write('// more\\n')", /^member index\.php: changed while it was archived$/],
    // another file renamed over the name once it has been read
    ["if info.name == 'index.php':\n    p = os.path.join(root, 'index.php'); open(p + '.new', 'w').write('<?php // other\\n'); os.chmod(p + '.new', 0o600); os.rename(p + '.new', p)", /^member index\.php: (was replaced or )?changed while it was archived$/],
    // an earlier member changed while later ones are written
    ["if info.name == 'wp-config.php':\n    os.chmod(os.path.join(root, 'index.php'), 0o644)", /^member index\.php: changed after it was archived$/],
    ["if info.name == 'wp-config.php':\n    os.rename(os.path.join(root, 'wp-content', 'themes', 'vega'), os.path.join(root, 'wp-content', 'themes', 'moved')); os.mkdir(os.path.join(root, 'wp-content', 'themes', 'vega'))", /^member wp-content\/themes\/vega: changed after it was archived$/]
  ]
  for (const [hook, expected] of cases) {
    const root = umask077Webroot()
    assert.match(buildWhile(root, dir, names, hook), expected, hook)
    rmSync(root, { recursive: true, force: true })
  }
  const root = umask077Webroot()
  assert.equal(buildWhile(root, dir, names, 'pass'), 'built', 'a stand that holds still builds')
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('unsafeMembers and auditArchiveMembers: names tar would write to one place twice, or below a file, are refused before extraction', () => {
  const row = (name, type = 'file') => ({ name, type, mode: type === 'dir' ? 0o755 : 0o644, uid: 0, gid: 0, pax: [], linkname: '' })
  assert.deepEqual(unsafeMembers([row('wp-content', 'dir'), row('wp-content/x'), row('wp-content/./x'), row('wp-content//x'), row('./index.php'), row('/etc/cron.d/x'), row('')]), [
    'unsafe path "wp-content/./x": not a canonical relative path (a ".", ".." or empty segment)',
    'unsafe path "wp-content//x": not a canonical relative path (a ".", ".." or empty segment)',
    'unsafe path "./index.php": not a canonical relative path (a ".", ".." or empty segment)',
    'unsafe path "/etc/cron.d/x": an absolute path',
    'unsafe path "": an empty name'
  ])
  assert.deepEqual(unsafeMembers([row('a'), row('a/', 'dir'), row('f'), row('f/x'), row('d/', 'dir'), row('d/y')]), ['duplicate a', 'f/x is below f, which is not a directory'])
  assert.deepEqual(unsafeMembers([row('wp-content', 'dir'), row('wp-content/uploads/', 'dir'), row('wp-content/uploads/a.jpg')]), [])
  const audit = auditArchiveMembers([row('wp-content/./x'), row('wp-content/x')])
  assert.deepEqual(audit.problems, ['member "wp-content/./x" is not a canonical relative path (a ".", ".." or empty segment)'])
})

test('readPack: SHA256SUMS must cover manifest.json and both archives, hash for hash with the manifest; names are plain files in the pack', () => {
  const dir = tmp()
  const write = (name, body) => writeFileSync(path.join(dir, name), body)
  write('w.tar.gz', 'webroot bytes')
  write('d.sql.gz', 'database bytes')
  const manifest = (over = {}) => ({
    schemaVersion: 'tracy-quickstart/v1',
    id: 'x/wp7',
    version: '1.0.0',
    wpVersion: '7.0',
    theme: { name: 'vega' },
    platform: 'wordpress',
    webroot: { file: 'w.tar.gz', sha256: sha256File(path.join(dir, 'w.tar.gz')) },
    database: { file: 'd.sql.gz', sha256: sha256File(path.join(dir, 'd.sql.gz')) },
    ...over
  })
  const sums = (files) => write('SHA256SUMS', sumsText(files.map((f) => ({ file: f, sha256: sha256File(path.join(dir, f)) }))))
  write('manifest.json', JSON.stringify(manifest()))
  sums(['manifest.json', 'w.tar.gz', 'd.sql.gz'])
  assert.equal(readPack(dir).manifest.webroot.file, 'w.tar.gz')
  write('SHA256SUMS', '')
  assert.throws(() => readPack(dir), /SHA256SUMS does not cover manifest\.json/, 'an empty SHA256SUMS is not a pass')
  sums(['manifest.json'])
  assert.throws(() => readPack(dir), /SHA256SUMS does not cover w\.tar\.gz \(the webroot archive\)/)
  sums(['manifest.json', 'w.tar.gz'])
  assert.throws(() => readPack(dir), /SHA256SUMS does not cover d\.sql\.gz \(the database archive\)/)
  write('SHA256SUMS', 'not a sum line\n')
  assert.throws(() => readPack(dir), /SHA256SUMS has lines that are not/)
  write('SHA256SUMS', `${'a'.repeat(64)}  ../outside\n`)
  assert.throws(() => readPack(dir), /SHA256SUMS names "\.\.\/outside" — not a plain file name in the pack/)
  write('manifest.json', JSON.stringify(manifest({ webroot: { file: '../w.tar.gz', sha256: 'a'.repeat(64) } })))
  sums(['manifest.json', 'w.tar.gz', 'd.sql.gz'])
  assert.throws(() => readPack(dir), /manifest\.json webroot\.file "\.\.\/w\.tar\.gz" is not a plain file name in the pack/)
  write('manifest.json', JSON.stringify(manifest({ webroot: { file: 'w.tar.gz', sha256: 'b'.repeat(64) } })))
  sums(['manifest.json', 'w.tar.gz', 'd.sql.gz'])
  assert.throws(() => readPack(dir), /manifest\.json says w\.tar\.gz is b{64}, SHA256SUMS says [0-9a-f]{64}/)
  write('manifest.json', JSON.stringify(manifest()))
  sums(['manifest.json', 'w.tar.gz', 'd.sql.gz'])
  write('w.tar.gz', 'changed since')
  assert.throws(() => readPack(dir), /SHA256SUMS mismatch: w\.tar\.gz/)
  rmSync(path.join(dir, 'w.tar.gz'))
  assert.throws(() => readPack(dir), /SHA256SUMS mismatch: w\.tar\.gz \(missing\)/)
  rmSync(path.join(dir, 'SHA256SUMS'))
  assert.throws(() => readPack(dir), /the pack has no readable SHA256SUMS \(ENOENT\)/)
  rmSync(dir, { recursive: true, force: true })
})

test('checkWebrootPath and checkRootRunner: /, a system tree, a non-canonical path or a symlinked webroot is refused before anything is wiped', async () => {
  assert.equal(checkWebrootPath('/var/www/html/'), '/var/www/html')
  assert.equal(checkWebrootPath('/srv/site'), '/srv/site')
  for (const p of ['/', '', 'var/www/html', '/var', '/var/www', '/tmp', '/etc/wordpress', '/usr/share/x', '/var/www/../..', '/var//www/html', '/var/www/./html', '/root/site'])
    assert.throws(() => checkWebrootPath(p), /the container webroot .* (is not an absolute path|has a "\.", "\.\." or empty segment|is \/ , a top-level directory or a system tree) — restore empties it as root/, p)
  for (const [kind, expected] of [
    ['link', /\/var\/www\/html is a symlink as the root runner sees it/],
    ['via /', /\/var\/www\/html resolves to \/ through a symlink on its path/],
    ['', /the root runner sees no directory at \/var\/www\/html/]
  ]) {
    const f = fakes({ webrootKind: kind, empty: false })
    await assert.rejects(() => prepareWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33, wipe: true, config: CONFIG }), expected)
    assert.ok(!f.calls.some((c) => c.includes('rm -rf')), `${kind}: nothing wiped`)
  }
  const slash = fakes({ empty: false })
  await assert.rejects(() => prepareWebroot({ root: slash.root, wp: slash.wp, webroot: '/', runtimeUid: 33, wipe: true, config: CONFIG }), /is \/ , a top-level directory/)
  assert.deepEqual(slash.calls, [], 'not one root command for /')
  const f = fakes({ webrootKind: 'link' })
  const a = await checkAccess({ wp: f.wp, root: f.root, webroot: '/var/www/html', siteUrl: 'http://b', runtimeUid: 33 })
  assert.equal(a.ok, false)
  assert.match(a.problems[0], /the root runner cannot write the access probe: \/var\/www\/html is a symlink/)
  assert.ok(!f.calls.some((c) => c.includes('cat > "$1.php"')), 'no probe written')
})

test('probeWebroot and withRootCleanup: a probe or SQL whose chown/chmod failed is removed; a failed removal is named, never hidden', async () => {
  const f = fakes({ writeFails: true })
  await assert.rejects(() => probeWebroot({ root: f.root, wp: f.wp, webroot: '/var/www/html', runtimeUid: 33 }), /chown: changing ownership/)
  assert.ok(f.calls.at(-1).endsWith('rm -f -- "$1.php" "$1.canary"'), 'the half-written probe is removed')
  assert.ok(!f.calls.some((c) => c.startsWith('wp ')), 'nothing ran it')
  const both = fakes({ writeFails: true, rmFails: true })
  await assert.rejects(() => probeWebroot({ root: both.root, wp: both.wp, webroot: '/var/www/html', runtimeUid: 33 }), /chown: changing ownership[\s\S]*and could not remove the access probe \/var\/www\/html\/tracy-probe-[0-9a-f]+: exited 1: rm: read-only file system/)
  const rmOnly = fakes({ rmFails: true })
  await assert.rejects(() => probeWebroot({ root: rmOnly.root, wp: rmOnly.wp, webroot: '/var/www/html', runtimeUid: 33 }), /^Error: could not remove the access probe/)
  // restore stages its SQL through the same helper
  const calls = []
  const root = (script) => {
    calls.push(script)
    if (script.startsWith('umask 022; cat > "$1" && chmod')) throw new Error('root runner: stage the SQL exited 1: chmod: Operation not permitted')
    return { status: 0 }
  }
  await assert.rejects(
    () => withRootCleanup(root, 'rm -f -- "$1"', ['/var/www/html/.tracy-restore-x.sql'], 'the staged SQL', () => root('umask 022; cat > "$1" && chmod 0644 "$1"')),
    /chmod: Operation not permitted/
  )
  assert.deepEqual(calls.at(-1), 'rm -f -- "$1"')
})

test('probe verdicts: uploads that is a file, a theme without style.css, a wp-cli run that exits non-zero or an HTTP answer that is not 200 are failures', async () => {
  const opts = { nonce: 'n1', via: 'wp-cli', runtimeUid: 33 }
  const fileUploads = answer()
  fileUploads.required['wp-content/uploads'] = { type: 'file', mode: '0644', uid: 0, gid: 0, ok: true }
  assert.deepEqual(evaluateAccess(fileUploads, opts), ['wp-cli: runtime path wp-content/uploads (uploads) is a file, WordPress needs a directory'])
  const dirConfig = answer()
  dirConfig.required['wp-config.php'] = { type: 'dir', mode: '0755', uid: 0, gid: 0, ok: true }
  assert.deepEqual(evaluateAccess(dirConfig, opts), ['wp-cli: runtime path wp-config.php (wp-config.php) is a dir, WordPress needs a regular file'])
  const noCss = answer()
  noCss.required['wp-content/themes/vega/style.css'] = null
  assert.match(evaluateAccess(noCss, opts)[0], /runtime path wp-content\/themes\/vega\/style\.css \(theme vega\) is missing/)
  const unchecked = answer()
  delete unchecked.required['wp-content/themes/vega/style.css']
  assert.deepEqual(evaluateAccess(unchecked, opts), ['wp-cli: runtime path wp-content/themes/vega/style.css (theme vega) was not checked by the probe'])
  const fatal = fakes({ wpStatus: 255 })
  const r = await probeWebroot({ root: fatal.root, wp: fatal.wp, webroot: '/var/www/html', runtimeUid: 33, themes: ['vega'] })
  assert.equal(r.ok, false)
  assert.deepEqual(r.problems, ['wp-cli ran the access probe but exited 255: PHP Fatal error: after the probe'])
  const g = fakes()
  const status500 = async (url) => ({ status: 500, text: async () => `${PROBE_MARK}${JSON.stringify(answer({ nonce: new URL(url).searchParams.get('n'), sapi: 'apache2handler', user: 'www-data' }))}${PROBE_MARK}` })
  const h = await probeWebroot({ root: g.root, wp: g.wp, webroot: '/var/www/html', runtimeUid: 33, siteUrl: 'http://b.test', fetchImpl: status500, themes: ['vega'] })
  assert.deepEqual(h.problems, ['http: the access probe at http://b.test answered 500, not 200'])
})

test('preparePack: a database that does not decompress, a webroot archive cut short, a wp-config.php missing or that will not render, a theme not in the archive — named before the webroot is touched', async () => {
  const dir = tmp()
  const tree = path.join(dir, 'tree')
  mkdirSync(path.join(tree, 'wp-content', 'themes', 'vega'), { recursive: true })
  writeFileSync(path.join(tree, 'wp-content', 'themes', 'vega', 'style.css'), '/* Theme Name: vega */\n')
  const config = "<?php\ndefine( 'DB_NAME', 'a' );\ndefine( 'DB_USER', 'a' );\ndefine( 'DB_PASSWORD', 'a' );\ndefine( 'DB_HOST', 'a' );\n/* That's all, stop editing! */\n"
  const archive = (cfg, members = ['wp-config.php', 'wp-content/themes/vega/style.css']) => {
    rmSync(path.join(tree, 'wp-config.php'), { force: true })
    if (cfg !== null) writeFileSync(path.join(tree, 'wp-config.php'), cfg)
    const out = path.join(dir, 'w.tar.gz')
    const r = spawnSync('tar', ['-czf', out, '-C', tree, ...members.filter((m) => existsSync(path.join(tree, m)))], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const archiveBytes = readFileSync(out)
    return { archiveBytes, rows: listArchive(out, { input: archiveBytes, read: ['wp-config.php'] }) }
  }
  const manifest = { theme: { name: 'vega' }, webroot: { file: 'w.tar.gz' }, database: { file: 'd.sql.gz' } }
  const db = { host: 'db', user: 'root', password: 'pw', name: 'wp' }
  const good = archive(config)
  const sqlBytes = gzipSync('DROP TABLE IF EXISTS wp_options;\n')
  const ok = await preparePack({ manifest, ...good, sqlBytes, db, siteUrl: 'http://b' })
  assert.equal(ok.sql.toString(), 'DROP TABLE IF EXISTS wp_options;\n')
  assert.match(ok.rendered, /define\( 'DB_HOST', 'db' \);/)
  assert.match(ok.rendered, /define\('WP_HOME', 'http:\/\/b'\);/)
  // gzip's CRC is in the last 8 bytes: a flipped byte there has a valid header and inflates, then fails
  const badCrc = Buffer.from(sqlBytes)
  badCrc[badCrc.length - 6] ^= 0xff
  for (const [args, expected] of [
    [{ sqlBytes: badCrc }, /d\.sql\.gz does not decompress \(Z_DATA_ERROR\) — nothing was wiped$/],
    [{ sqlBytes: Buffer.from('not gzip') }, /d\.sql\.gz does not decompress .* — nothing was wiped/],
    [{ sqlBytes: gzipSync('') }, /d\.sql\.gz decompresses to nothing — nothing was wiped/],
    [{ archiveBytes: good.archiveBytes.subarray(0, good.archiveBytes.length - 4) }, /w\.tar\.gz does not decompress .* — nothing was wiped/],
    [archive(null), /w\.tar\.gz carries no wp-config\.php file — nothing was wiped/],
    [archive("<?php\n$x = 1;\n"), /w\.tar\.gz: wp-config\.php cannot be rendered for this stand \(wp-config\.php does not define DB_NAME, DB_USER, DB_PASSWORD, DB_HOST directly\) — nothing was wiped/],
    [archive(config, ['wp-config.php']), /w\.tar\.gz carries no wp-content\/themes\/vega\/style\.css for the manifest's theme — nothing was wiped/]
  ])
    await assert.rejects(() => preparePack({ manifest, ...good, sqlBytes, db, siteUrl: 'http://b', ...args }), expected)

  // the restore CLI: a .sql.gz that is corrupt but listed with matching sums stops before a root command
  const pack = path.join(dir, 'pack')
  mkdirSync(pack)
  writeFileSync(path.join(pack, 'w.tar.gz'), good.archiveBytes)
  writeFileSync(path.join(pack, 'd.sql.gz'), badCrc)
  const full = {
    schemaVersion: 'tracy-quickstart/v1', id: 'x/wp7', version: '1.0.0', platform: 'wordpress', wpVersion: '7.0',
    theme: { name: 'vega', version: '1.0.0' },
    webroot: { file: 'w.tar.gz', sha256: sha256File(path.join(pack, 'w.tar.gz')) },
    database: { file: 'd.sql.gz', sha256: sha256File(path.join(pack, 'd.sql.gz')) }
  }
  writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify(full))
  writeFileSync(path.join(pack, 'SHA256SUMS'), sumsText(['manifest.json', 'w.tar.gz', 'd.sql.gz'].map((file) => ({ file, sha256: sha256File(path.join(pack, file)) }))))
  const marker = path.join(dir, 'root-was-called')
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'quickstart', 'restore.mjs'), '--pack', pack, '--root-runner', `touch ${marker};`, '--wp', `touch ${marker};`, '--site-url', 'http://x', '--db-host', 'h', '--db-password', 'p', '--wipe', '--report', path.join(dir, 'r.json')], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /d\.sql\.gz does not decompress .* — nothing was wiped/)
  assert.ok(!existsSync(marker), 'no root or wp command ran')
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'r.json'), 'utf8')).ok, false)
  rmSync(dir, { recursive: true, force: true })
})
