#!/usr/bin/env node
/**
 * resync-access-plugin.sh, run for real against a throwaway TRACY_SITES_ROOT (#677).
 *
 * `provision/platform/wordpress.sh` copies `tracy-access.php` into a site only when the site is
 * created; this script is what carries a newer copy to every existing WordPress site on a deploy.
 * The file mints admin sessions, so what is asserted is the contract a deploy relies on:
 *
 *   1. a stale or absent copy becomes the shipped bytes, mode 0644, through a rename — and an
 *      identical copy is not rewritten at all (same inode, same mtime);
 *   2. only `platform: wordpress` sites with `.webroot/wp-content` are touched, and a site whose
 *      metadata cannot be read is named and counted, never guessed at;
 *   3. every failure on the way (staging, write, chmod, read-back, rename, compare, mkdir, an
 *      interruption — including one while the staging file is being created) leaves the previous
 *      complete file and no staging file, names the site, lets the other sites finish, and makes
 *      the exit code non-zero;
 *   4. symlinks and special files on the path are refused, not followed — and a directory swapped
 *      for a symlink AFTER it was opened still gets nothing written through the link;
 *   5. two runs never write at once, and a run that cannot take the lock writes nothing.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/resync-access-plugin.test.mjs
 *
 * The script and the two files it reads (`lib/roots.sh`, the plugin) are copied into a fixture
 * laid out like `/opt/tracy-fleet`, so the source path it resolves is the real one. Where the
 * machine has no `flock` (macOS), a stand-in calling flock(2) through python3 is put on PATH: the
 * lock it takes is the same kernel lock, so the contention test measures real waiting.
 *
 * Faults are injected into the script's python3 process by a `sitecustomize.py` on PYTHONPATH that
 * wraps the `os` calls it makes (see FAULTS below); the script itself carries no test hook beyond
 * the `LABEL` global naming the site it is on.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const SCRIPT = path.join(SCRIPTS, 'tools/resync-access-plugin.sh')
const ROOTS = path.join(SCRIPTS, 'lib/roots.sh')
const PLUGIN = path.join(SCRIPTS, 'provision/access/wordpress/tracy-access.php')
const SOURCE = readFileSync(PLUGIN)
const STALE = '<?php\n// tracy-access.php as provisioned before #618\n'

const which = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).stdout.trim()
const HAS_FLOCK = which('flock') !== ''
// By absolute path, so a case may hand the script a PATH without bash on it.
const BASH = which('bash')

// flock(2) on an inherited descriptor, as util-linux `flock [-n] <fd>` does. The lock belongs to the
// open file description the script holds, so it outlives this process exactly like the real tool's.
const FLOCK_SHIM = warmStub(
  'flock',
  `#!/usr/bin/env python3
import fcntl, sys
args = sys.argv[1:]
flags = fcntl.LOCK_EX
if args and args[0] == '-n':
    flags |= fcntl.LOCK_NB
    args = args[1:]
try:
    fcntl.flock(int(args[0]), flags)
except (OSError, ValueError, IndexError) as e:
    print(e, file=sys.stderr)
    sys.exit(1)
`,
  { warmArgs: ['-n', '0'] }
)

// A `flock` that always fails, for the "cannot take the lock" case.
const FAILING_FLOCK = warmStub('flock-fails', '#!/bin/sh\necho "flock: injected failure" >&2\nexit 1\n')

// Loaded by every python3 the script starts (PYTHONPATH). Inert unless INJECT_CMD is set and the
// script's `__main__.LABEL` is INJECT_LABEL. INJECT_CMD picks the call, INJECT_MODE what happens:
//   stage   os.open(O_CREAT)  fail: EIO · term: create it, then SIGTERM (arrives mid-creation)
//   write   os.write          fail: half written, then EIO · term: half written, then SIGTERM
//   fchmod  os.fchmod         fail: EIO
//   pread   os.pread          fail: EIO · short: one byte missing (a truncated staged copy)
//   rename  os.rename         fail: EIO
//   mkdir   os.mkdir          fail: EIO
//   read    os.read on the destination  fail: EIO
//   swap    just before the staging file is created, INJECT_MODE (mu-plugins | wp-content |
//           .webroot | site) of the site is moved aside and replaced by a symlink to $INJECT_OUTSIDE
//   swapdest  just before the rename, the destination becomes INJECT_MODE (dir | link → $INJECT_OUTSIDE)
const FAULTS = `
import errno, os, signal, sys
CMD = os.environ.get('INJECT_CMD')
MODE = os.environ.get('INJECT_MODE', 'fail')
TARGET = os.environ.get('INJECT_LABEL')
ROOT = os.environ.get('TRACY_SITES_ROOT', '')
OUTSIDE = os.environ.get('INJECT_OUTSIDE', '')
real = {n: getattr(os, n) for n in ('open', 'write', 'fchmod', 'pread', 'rename', 'mkdir', 'read')}

def hit(cmd):
    m = sys.modules.get('__main__')
    return CMD == cmd and m is not None and getattr(m, 'LABEL', None) == TARGET

def boom():
    raise OSError(errno.EIO, 'injected failure')

def term():
    os.kill(os.getpid(), signal.SIGTERM)

def fd_path(fd):
    try:
        return os.readlink('/proc/self/fd/%d' % fd)
    except OSError:
        import fcntl
        return fcntl.fcntl(fd, 50, b'\\0' * 1024).split(b'\\0')[0].decode()

def swap(rel):
    p = os.path.join(ROOT, TARGET, rel) if rel else os.path.join(ROOT, TARGET)
    os.replace(p, p + '.moved')
    os.symlink(OUTSIDE, p)

def _open(path, flags, *a, **k):
    if flags & os.O_CREAT and hit('stage'):
        if MODE == 'fail':
            boom()
        fd = real['open'](path, flags, *a, **k)
        term()
        return fd
    if flags & os.O_CREAT and hit('swap'):
        swap({'mu-plugins': '.webroot/wp-content/mu-plugins', 'wp-content': '.webroot/wp-content',
              '.webroot': '.webroot', 'site': ''}[MODE])
    return real['open'](path, flags, *a, **k)

def _write(fd, data):
    if hit('write'):
        real['write'](fd, bytes(data[: len(data) // 2]))
        if MODE == 'term':
            term()
            return len(data) // 2
        boom()
    return real['write'](fd, data)

def _fchmod(fd, mode):
    if hit('fchmod'):
        boom()
    return real['fchmod'](fd, mode)

def _pread(fd, n, off):
    if hit('pread'):
        if MODE == 'short':
            return real['pread'](fd, n, off)[:-1]
        boom()
    return real['pread'](fd, n, off)

def _rename(src, dst, *a, **k):
    if hit('rename'):
        boom()
    if hit('swapdest'):
        d = os.path.join(ROOT, TARGET, '.webroot/wp-content/mu-plugins/tracy-access.php')
        os.unlink(d)
        os.mkdir(d) if MODE == 'dir' else os.symlink(os.path.join(OUTSIDE, 'tracy-access.php'), d)
    return real['rename'](src, dst, *a, **k)

def _mkdir(path, *a, **k):
    if hit('mkdir'):
        boom()
    return real['mkdir'](path, *a, **k)

def _read(fd, n):
    if hit('read') and fd_path(fd).endswith('/mu-plugins/tracy-access.php'):
        boom()
    return real['read'](fd, n)

import subprocess
real_run = subprocess.run

def _run(args, *a, **k):
    # commit  the run is killed (SIGKILL: no cleanup) right where it would commit the copy
    if hit('commit') and 'deploy-commit' in args:
        os.kill(os.getpid(), signal.SIGKILL)
    return real_run(args, *a, **k)

if CMD:
    os.open, os.write, os.fchmod, os.pread = _open, _write, _fchmod, _pread
    os.rename, os.mkdir, os.read = _rename, _mkdir, _read
    subprocess.run = _run
`

/** A host laid out like /opt/tracy-fleet plus /srv/tracy-sites, with its own lock and stub dirs. */
function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'resync-access-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const fleet = path.join(dir, 'fleet')
  mkdirSync(path.join(fleet, 'tools'), { recursive: true })
  mkdirSync(path.join(fleet, 'lib'))
  mkdirSync(path.join(fleet, 'provision/access/wordpress'), { recursive: true })
  copyFileSync(SCRIPT, path.join(fleet, 'tools/resync-access-plugin.sh'))
  copyFileSync(ROOTS, path.join(fleet, 'lib/roots.sh'))
  copyFileSync(PLUGIN, path.join(fleet, 'provision/access/wordpress/tracy-access.php'))
  const sites = path.join(dir, 'sites')
  mkdirSync(sites)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  if (!HAS_FLOCK) linkStub(FLOCK_SHIM, path.join(bin, 'flock'))
  const inject = path.join(dir, 'inject')
  mkdirSync(inject)
  writeFileSync(path.join(inject, 'sitecustomize.py'), FAULTS)
  // P0: the private root carries each site's access key and readiness, and the rollout list.
  const privateRoot = path.join(dir, 'private')
  mkdirSync(path.join(privateRoot, '.site-access'), { recursive: true })
  writeFileSync(path.join(privateRoot, '.site-access', 'rollout.list'), '*\n')
  return {
    dir,
    privateRoot,
    sites,
    lock: path.join(dir, 'access.lock'),
    source: path.join(fleet, 'provision/access/wordpress/tracy-access.php'),
    script: path.join(fleet, 'tools/resync-access-plugin.sh'),
    bin,
    inject
  }
}

/** A site folder; `wp` builds `.webroot/wp-content`, `plugin` puts a mu-plugin copy there. */
function makeSite(
  host,
  label,
  { platform = 'wordpress', siteJson, wp = true, mu = true, plugin, ready = true } = {}
) {
  if (ready) markReady(host, label)
  const dir = path.join(host.sites, label)
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  if (siteJson !== null) {
    const body = siteJson ?? `${JSON.stringify({ siteKey: `${label}.tracy.ai`, platform }, null, 1)}\n`
    writeFileSync(path.join(dir, '.tracy/site.json'), body)
  }
  if (wp) mkdirSync(path.join(dir, '.webroot/wp-content'), { recursive: true })
  if (wp && mu) mkdirSync(path.join(dir, '.webroot/wp-content/mu-plugins'))
  if (plugin !== undefined) writeFileSync(destOf(host, label), plugin)
  return dir
}

/** What provision / secure-site-access.sh leave for a ready site: a key and a readiness record of its kid. */
function markReady(host, label, { kid = 'k-test', readyKid = kid } = {}) {
  const d = path.join(host.privateRoot, '.site-access', label)
  mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'key.json'), JSON.stringify({ v: 1, kid, site: label, key: 'x'.repeat(43) }))
  if (readyKid !== null) writeFileSync(path.join(d, 'ready.json'), JSON.stringify({ v: 1, kid: readyKid }))
}

const muOf = (host, label) => path.join(host.sites, label, '.webroot/wp-content/mu-plugins')
const destOf = (host, label) => path.join(muOf(host, label), 'tracy-access.php')
const staging = (host, label) =>
  existsSync(muOf(host, label))
    ? readdirSync(muOf(host, label)).filter((n) => n.startsWith('.tracy-access.php.'))
    : []

function env(host, extra = {}) {
  return {
    ...process.env,
    PATH: `${host.bin}:${process.env.PATH}`,
    TRACY_SITES_ROOT: host.sites,
    TRACY_PRIVATE_ROOT: host.privateRoot,
    TRACY_ACCESS_SYNC_LOCK: host.lock,
    ...extra
  }
}

/** Runs the script; `out` is stderr + stdout (every message goes to stderr). */
async function run(host, args = [], extra = {}) {
  const r = await sh(BASH, [host.script, ...args], { env: env(host, extra) })
  return { ...r, out: r.stderr + r.stdout }
}

/** Same, with a fault injected into `cmd` while the script is on site `label` (FAULTS). */
const runInjected = (host, cmd, label, mode = 'fail', extra = {}) =>
  run(host, [], {
    PYTHONPATH: host.inject,
    INJECT_CMD: cmd,
    INJECT_LABEL: label,
    INJECT_MODE: mode,
    ...extra
  })

function assertInstalled(host, label) {
  const dest = destOf(host, label)
  assert.ok(readFileSync(dest).equals(SOURCE), `${label}: installed bytes differ from the source`)
  assert.equal(statSync(dest).mode & 0o777, 0o644, `${label}: mode is not 0644`)
  assert.deepEqual(staging(host, label), [], `${label}: a staging file was left behind`)
}

describe('resync-access-plugin.sh — what it writes', { concurrency: 8 }, () => {
  test('a stale copy becomes the shipped bytes, mode 0644, and a second run writes nothing', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'kineticakemi', { plugin: STALE })
    chmodSync(destOf(host, 'kineticakemi'), 0o600)
    const first = await run(host)
    assert.equal(first.status, 0, first.out)
    assert.match(first.out, /kineticakemi: updated/)
    assert.match(first.out, /done: 1 updated, 0 up to date, 0 skipped, 0 held, 0 failed/)
    assertInstalled(host, 'kineticakemi')

    const before = statSync(destOf(host, 'kineticakemi'))
    const again = await run(host)
    assert.equal(again.status, 0, again.out)
    assert.match(again.out, /done: 0 updated, 1 up to date/)
    assert.equal(statSync(destOf(host, 'kineticakemi')).ino, before.ino)
  })

  test('an identical copy is not rewritten: same inode, same mtime', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'same', { plugin: SOURCE })
    const past = new Date('2026-01-01T00:00:00Z')
    utimesSync(destOf(host, 'same'), past, past)
    const before = statSync(destOf(host, 'same'))
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /same: up to date/)
    const after = statSync(destOf(host, 'same'))
    assert.equal(after.ino, before.ino)
    assert.equal(after.mtimeMs, before.mtimeMs)
  })

  test('an absent copy is installed', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'nocopy')
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'nocopy')
  })

  test('a missing mu-plugins directory is created', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'nomu', { mu: false })
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assert.ok(statSync(muOf(host, 'nomu')).isDirectory())
    assertInstalled(host, 'nomu')
  })

  test('<label> updates that site only', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'site-a', { plugin: STALE })
    makeSite(host, 'site-b', { plugin: STALE })
    const r = await run(host, ['site-a'])
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'site-a')
    assert.equal(readFileSync(destOf(host, 'site-b'), 'utf8'), STALE)
    assert.doesNotMatch(r.out, /site-b/)
  })
})

describe('resync-access-plugin.sh — what it leaves alone', { concurrency: 8 }, () => {
  test('non-WordPress, unknown-platform and WordPress-less sites are skipped with no writes', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'joomla-site', { platform: 'joomla', mu: false })
    makeSite(host, 'emdash-site', { platform: 'emdash', wp: false })
    makeSite(host, 'null-platform', { platform: null, mu: false })
    makeSite(host, 'no-platform-key', { siteJson: '{"siteKey":"x.tracy.ai"}\n', mu: false })
    makeSite(host, 'no-meta', { siteJson: null, mu: false })
    makeSite(host, 'no-wp-content', { wp: false })
    mkdirSync(path.join(host.sites, 'no-wp-content/.webroot'))
    writeFileSync(path.join(host.sites, 'stray-file'), 'not a site\n')
    makeSite(host, 'wp', { plugin: STALE })
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /joomla-site: platform joomla — skipped/)
    assert.match(r.out, /emdash-site: platform emdash — skipped/)
    assert.match(r.out, /null-platform: no platform in \.tracy\/site\.json — skipped/)
    assert.match(r.out, /no-platform-key: no platform/)
    assert.match(r.out, /no-meta: no \.tracy\/site\.json — platform unknown, skipped/)
    assert.match(r.out, /no-wp-content: no \.webroot\/wp-content/)
    assert.match(r.out, /done: 1 updated, 0 up to date, 7 skipped, 0 held, 0 failed/)
    for (const label of ['joomla-site', 'null-platform', 'no-platform-key', 'no-meta']) {
      assert.ok(!existsSync(muOf(host, label)), `${label}: mu-plugins was created`)
    }
    assert.ok(!existsSync(path.join(host.sites, 'emdash-site/.webroot')))
    assert.ok(!existsSync(path.join(host.sites, 'no-wp-content/.webroot/wp-content')))
    assertInstalled(host, 'wp')
  })

  for (const [name, siteJson] of [
    ['empty', ''],
    ['malformed', '{"platform": "wordpress"'],
    ['not an object', '["wordpress"]\n'],
    ['a non-string platform', '{"platform": 7}\n'],
    ['an object platform', '{"platform": {"name": "wordpress"}}\n'],
    ['not UTF-8', Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])]
  ]) {
    test(`site.json ${name}: named, counted as failed, nothing written, other sites still done`, async (t) => {
      const host = makeHost(t)
      makeSite(host, 'broken', { siteJson, plugin: STALE })
      makeSite(host, 'healthy', { plugin: STALE })
      const r = await run(host)
      assert.notEqual(r.status, 0, r.out)
      assert.match(r.out, /broken: \.tracy\/site\.json is unreadable or malformed/)
      assert.match(r.out, /1 failed/)
      assert.equal(readFileSync(destOf(host, 'broken'), 'utf8'), STALE)
      assertInstalled(host, 'healthy')
    })
  }

  test('site.json that is a directory or a FIFO is refused without blocking', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'meta-dir', { siteJson: null, plugin: STALE })
    mkdirSync(path.join(host.sites, 'meta-dir/.tracy/site.json'))
    makeSite(host, 'meta-fifo', { siteJson: null, plugin: STALE })
    spawnSync('mkfifo', [path.join(host.sites, 'meta-fifo/.tracy/site.json')])
    const r = await sh(BASH, [host.script], { env: env(host), timeout: 20000 })
    assert.equal(r.signal, null, 'the script blocked')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /meta-dir: .* is not a regular file — refused/)
    assert.match(r.stderr, /meta-fifo: .* is not a regular file — refused/)
    assert.equal(readFileSync(destOf(host, 'meta-dir'), 'utf8'), STALE)
  })
})

describe('resync-access-plugin.sh — links and special files are refused', { concurrency: 8 }, () => {
  /** Each case breaks one link in the chain of site `victim`; `outside` must never change. */
  for (const [name, arrange, pattern] of [
    [
      'the destination is a symlink',
      (host, outside) => {
        makeSite(host, 'victim')
        symlinkSync(outside, destOf(host, 'victim'))
      },
      /destination .* is a symlink — refused/
    ],
    [
      'mu-plugins is a symlink',
      (host, outside) => {
        makeSite(host, 'victim', { mu: false })
        symlinkSync(path.dirname(outside), muOf(host, 'victim'))
      },
      /mu-plugins .* is a symlink — refused/
    ],
    [
      'wp-content is a symlink',
      (host, outside) => {
        makeSite(host, 'victim', { wp: false })
        mkdirSync(path.join(host.sites, 'victim/.webroot'))
        mkdirSync(path.join(path.dirname(outside), 'mu-plugins'), { recursive: true })
        symlinkSync(path.dirname(outside), path.join(host.sites, 'victim/.webroot/wp-content'))
      },
      /wp-content .* is a symlink — refused/
    ],
    [
      'the webroot is a symlink',
      (host, outside) => {
        makeSite(host, 'victim', { wp: false })
        mkdirSync(path.join(path.dirname(outside), 'wp-content/mu-plugins'), { recursive: true })
        symlinkSync(path.dirname(outside), path.join(host.sites, 'victim/.webroot'))
      },
      /webroot .* is a symlink — refused/
    ],
    [
      'the site directory is a symlink',
      (host, outside) => {
        const real = path.join(path.dirname(outside), 'real-site')
        mkdirSync(path.join(real, '.tracy'), { recursive: true })
        mkdirSync(path.join(real, '.webroot/wp-content/mu-plugins'), { recursive: true })
        writeFileSync(path.join(real, '.tracy/site.json'), '{"platform":"wordpress"}\n')
        symlinkSync(real, path.join(host.sites, 'victim'))
      },
      /site directory .* is a symlink — refused/
    ],
    [
      '.tracy is a symlink',
      (host, outside) => {
        makeSite(host, 'victim', { siteJson: null })
        rmSync(path.join(host.sites, 'victim/.tracy'), { recursive: true })
        writeFileSync(path.join(path.dirname(outside), 'site.json'), '{"platform":"wordpress"}\n')
        symlinkSync(path.dirname(outside), path.join(host.sites, 'victim/.tracy'))
      },
      /metadata directory .* is a symlink — refused/
    ],
    [
      'site.json is a symlink',
      (host, outside) => {
        makeSite(host, 'victim', { siteJson: null })
        writeFileSync(path.join(path.dirname(outside), 'site.json'), '{"platform":"wordpress"}\n')
        symlinkSync(
          path.join(path.dirname(outside), 'site.json'),
          path.join(host.sites, 'victim/.tracy/site.json')
        )
      },
      /metadata .* is a symlink — refused/
    ]
  ]) {
    test(`${name}: refused, counted, nothing outside the webroot written`, async (t) => {
      const host = makeHost(t)
      const outsideDir = path.join(host.dir, 'outside')
      mkdirSync(outsideDir)
      const outside = path.join(outsideDir, 'tracy-access.php')
      writeFileSync(outside, 'customer file\n')
      arrange(host, outside)
      makeSite(host, 'healthy', { plugin: STALE })
      const r = await run(host)
      assert.notEqual(r.status, 0, r.out)
      assert.match(r.out, new RegExp(`victim: ${pattern.source}`))
      assert.equal(readFileSync(outside, 'utf8'), 'customer file\n')
      for (const sub of ['mu-plugins/tracy-access.php', 'wp-content/mu-plugins/tracy-access.php']) {
        assert.ok(!existsSync(path.join(outsideDir, sub)), `wrote ${sub} outside the site`)
      }
      assert.ok(
        !existsSync(path.join(outsideDir, 'real-site/.webroot/wp-content/mu-plugins/tracy-access.php'))
      )
      assertInstalled(host, 'healthy')
    })
  }

  test('a destination that is a directory or a FIFO is refused without blocking', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'dest-dir')
    mkdirSync(destOf(host, 'dest-dir'))
    makeSite(host, 'dest-fifo')
    spawnSync('mkfifo', [destOf(host, 'dest-fifo')])
    makeSite(host, 'mu-file', { mu: false })
    writeFileSync(muOf(host, 'mu-file'), 'not a directory\n')
    const r = await sh(BASH, [host.script], { env: env(host), timeout: 20000 })
    assert.equal(r.signal, null, 'the script blocked')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /dest-dir: .* is not a regular file — refused/)
    assert.match(r.stderr, /dest-fifo: .* is not a regular file — refused/)
    assert.match(r.stderr, /mu-file: .* is not a directory — refused/)
    assert.match(r.stderr, /3 failed/)
    assert.ok(lstatSync(destOf(host, 'dest-dir')).isDirectory())
    assert.ok(lstatSync(destOf(host, 'dest-fifo')).isFIFO())
  })
})

describe('resync-access-plugin.sh — a failed write keeps the old file', { concurrency: 8 }, () => {
  for (const [cmd, mode, pattern] of [
    ['stage', 'fail', /could not create a staging file in .*mu-plugins/],
    ['write', 'fail', /copy failed/],
    ['fchmod', 'fail', /chmod failed/],
    ['pread', 'fail', /could not read the staged copy back/],
    ['pread', 'short', /staged copy differs from the source/],
    ['rename', 'fail', /rename into place failed/],
    ['read', 'fail', /could not compare .*tracy-access\.php/]
  ]) {
    test(`${cmd} ${mode}: previous file intact, no staging file, other sites done, non-zero`, async (t) => {
      const host = makeHost(t)
      makeSite(host, 'victim', { plugin: STALE })
      makeSite(host, 'healthy', { plugin: STALE })
      const r = await runInjected(host, cmd, 'victim', mode)
      assert.notEqual(r.status, 0, r.out)
      assert.match(r.out, new RegExp(`victim: ${pattern.source}`))
      assert.match(r.out, /1 updated, 0 up to date, 0 skipped, 0 held, 1 failed/)
      assert.equal(readFileSync(destOf(host, 'victim'), 'utf8'), STALE)
      assert.deepEqual(staging(host, 'victim'), [])
      assertInstalled(host, 'healthy')
    })
  }

  test('mkdir of a missing mu-plugins fails: named, nothing written, non-zero', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'victim', { mu: false })
    const r = await runInjected(host, 'mkdir', 'victim')
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /victim: could not create .*mu-plugins/)
    assert.ok(!existsSync(muOf(host, 'victim')))
  })

  for (const [cmd, when] of [
    ['stage', 'while the staging file is being created'],
    ['write', 'while the staging file is being written']
  ]) {
    test(`SIGTERM ${when}: previous file intact, staging removed, exits 143`, async (t) => {
      const host = makeHost(t)
      makeSite(host, 'victim', { plugin: STALE })
      const r = await runInjected(host, cmd, 'victim', 'term')
      assert.equal(r.status, 143, r.out)
      assert.match(r.out, /terminated/)
      assert.equal(readFileSync(destOf(host, 'victim'), 'utf8'), STALE)
      assert.deepEqual(staging(host, 'victim'), [])
    })
  }
})

describe('resync-access-plugin.sh — a path swapped after it was opened', { concurrency: 8 }, () => {
  // The customer can rename inside their own webroot at any moment. Each case swaps one directory on
  // the chain for a symlink to `outside` after the script opened it and before it stages: the bytes
  // must land in the directory that was opened (now at `<dir>.moved`), never through the link.
  for (const [mode, moved] of [
    ['mu-plugins', '.webroot/wp-content/mu-plugins.moved/tracy-access.php'],
    ['wp-content', '.webroot/wp-content.moved/mu-plugins/tracy-access.php'],
    ['.webroot', '.webroot.moved/wp-content/mu-plugins/tracy-access.php']
  ]) {
    test(`${mode} swapped for a symlink: written where it was opened, nothing outside`, async (t) => {
      const host = makeHost(t)
      const outside = path.join(host.dir, 'outside')
      mkdirSync(path.join(outside, 'mu-plugins'), { recursive: true })
      makeSite(host, 'victim', { plugin: STALE })
      const r = await runInjected(host, 'swap', 'victim', mode, { INJECT_OUTSIDE: outside })
      assert.equal(r.status, 0, r.out)
      assert.deepEqual(readdirSync(outside), ['mu-plugins'], 'wrote outside the site')
      assert.deepEqual(readdirSync(path.join(outside, 'mu-plugins')), [], 'wrote outside the site')
      assert.ok(readFileSync(path.join(host.sites, 'victim', moved)).equals(SOURCE))
    })
  }

  test('the site directory swapped for a symlink: written where it was opened, nothing outside', async (t) => {
    const host = makeHost(t)
    const outside = path.join(host.dir, 'outside')
    mkdirSync(path.join(outside, '.webroot/wp-content/mu-plugins'), { recursive: true })
    makeSite(host, 'victim', { plugin: STALE })
    const r = await runInjected(host, 'swap', 'victim', 'site', { INJECT_OUTSIDE: outside })
    assert.equal(r.status, 0, r.out)
    assert.deepEqual(readdirSync(path.join(outside, '.webroot/wp-content/mu-plugins')), [])
    const moved = path.join(host.sites, 'victim.moved/.webroot/wp-content/mu-plugins/tracy-access.php')
    assert.ok(readFileSync(moved).equals(SOURCE))
  })

  test('the destination swapped for a directory before the rename: refused, not moved into it', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'victim', { plugin: STALE })
    makeSite(host, 'healthy', { plugin: STALE })
    const r = await runInjected(host, 'swapdest', 'victim', 'dir')
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /victim: rename into place failed/)
    assert.ok(lstatSync(destOf(host, 'victim')).isDirectory())
    assert.deepEqual(readdirSync(destOf(host, 'victim')), [], 'the file was moved into the directory')
    assert.deepEqual(staging(host, 'victim'), [])
    assertInstalled(host, 'healthy')
  })

  test('the destination swapped for a symlink before the rename: the link is replaced, its target untouched', async (t) => {
    const host = makeHost(t)
    const outside = path.join(host.dir, 'outside')
    mkdirSync(outside)
    writeFileSync(path.join(outside, 'tracy-access.php'), 'customer file\n')
    makeSite(host, 'victim', { plugin: STALE })
    const r = await runInjected(host, 'swapdest', 'victim', 'link', { INJECT_OUTSIDE: outside })
    assert.equal(r.status, 0, r.out)
    assert.equal(readFileSync(path.join(outside, 'tracy-access.php'), 'utf8'), 'customer file\n')
    assert.ok(lstatSync(destOf(host, 'victim')).isFile())
    assertInstalled(host, 'victim')
  })
})

describe('resync-access-plugin.sh — refuses before any write', { concurrency: 8 }, () => {
  for (const [name, args, pattern] of [
    ['two arguments', ['a', 'b'], /at most one argument/],
    ['an empty label', [''], /an empty label/],
    ['a traversal', ['..'], /not a site label/],
    ['a path', ['wp/../wp'], /not a site label/],
    ['an option', ['--all'], /not a site label/],
    ['a dot-name', ['.webroot'], /not a site label/],
    ['a label with a space', ['my site'], /not a site label/],
    ['a site that does not exist', ['ghost'], /no site 'ghost'/]
  ]) {
    test(`${name}: non-zero, nothing written`, async (t) => {
      const host = makeHost(t)
      makeSite(host, 'wp', { plugin: STALE })
      const r = await run(host, args)
      assert.notEqual(r.status, 0, r.out)
      assert.match(r.out, pattern)
      assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE)
    })
  }

  for (const [name, arrange, pattern] of [
    ['missing', (host) => rmSync(host.source), /no .*tracy-access\.php/],
    ['empty', (host) => writeFileSync(host.source, ''), /is empty/],
    [
      'a symlink',
      (host) => {
        const real = path.join(host.dir, 'elsewhere.php')
        copyFileSync(host.source, real)
        rmSync(host.source)
        symlinkSync(real, host.source)
      },
      /is a symlink/
    ],
    [
      'a directory',
      (host) => {
        rmSync(host.source)
        mkdirSync(host.source)
      },
      /no .*tracy-access\.php/
    ]
  ]) {
    test(`the source is ${name}: non-zero, nothing written`, async (t) => {
      const host = makeHost(t)
      makeSite(host, 'wp', { plugin: STALE })
      arrange(host)
      const r = await run(host)
      assert.notEqual(r.status, 0, r.out)
      assert.match(r.out, pattern)
      assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE)
    })
  }

  test('no sites root: non-zero', async (t) => {
    const host = makeHost(t)
    const r = await run(host, [], { TRACY_SITES_ROOT: path.join(host.dir, 'nowhere') })
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /no sites root at/)
  })

  test('no flock on PATH: refuses, nothing written', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'wp', { plugin: STALE })
    // A PATH holding every tool the script needs except flock.
    const only = path.join(host.dir, 'only')
    mkdirSync(only)
    for (const tool of ['dirname', 'python3', 'grep', 'basename']) {
      symlinkSync(which(tool), path.join(only, tool))
    }
    const r = await run(host, [], { PATH: only })
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /'flock' is not on PATH/)
    assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE)
  })

  test('the lock cannot be opened: refuses, nothing written', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'wp', { plugin: STALE })
    const r = await run(host, [], { TRACY_ACCESS_SYNC_LOCK: path.join(host.dir, 'no/such/dir/lock') })
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /cannot open the lock/)
    assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE)
  })

  test('flock fails: refuses, nothing written', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'wp', { plugin: STALE })
    const bin = path.join(host.dir, 'failing-flock')
    mkdirSync(bin)
    linkStub(FAILING_FLOCK, path.join(bin, 'flock'))
    const r = await run(host, [], { PATH: `${bin}:${process.env.PATH}` })
    assert.notEqual(r.status, 0, r.out)
    assert.match(r.out, /cannot take the lock/)
    assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE)
  })
})

test('a held lock makes a run wait before its first write, and it finishes once released', async (t) => {
  const host = makeHost(t)
  makeSite(host, 'wp', { plugin: STALE })
  // Holds an exclusive flock(2) on the lock file until its stdin closes.
  const holder = spawn(
    'python3',
    [
      '-c',
      'import fcntl,sys\nf=open(sys.argv[1],"w")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("held",flush=True)\nsys.stdin.read()',
      host.lock
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] }
  )
  t.after(() => holder.kill())
  await new Promise((resolve) => holder.stdout.once('data', resolve))

  const running = run(host)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE, 'wrote while another run held the lock')
  assert.deepEqual(staging(host, 'wp'), [])

  holder.stdin.end()
  const r = await running
  assert.equal(r.status, 0, r.out)
  assertInstalled(host, 'wp')
  t.diagnostic(HAS_FLOCK ? 'lock taken with util-linux flock' : 'lock taken with the flock(2) stand-in')
})

// ── The site's history gets the deploy's own commit (plan tasks/todo-site-changes.md §6, Q2) ─────
// For a site whose webroot repo exists, the copy runs under that site's webroot lock and leaves one
// outside commit holding exactly `tracy-access.php` — never a file in the next chat turn's moment.

const WEBROOT_SCRIPT = path.join(SCRIPTS, 'webroot/webroot-git.sh')
const REL = 'wp-content/mu-plugins/tracy-access.php'

/** `makeHost` plus what the history steps need: webroot-git.sh and its libs, a private root. */
function makeHistoryHost(t) {
  const host = makeHost(t)
  const fleet = path.dirname(path.dirname(host.script))
  mkdirSync(path.join(fleet, 'webroot'))
  copyFileSync(WEBROOT_SCRIPT, path.join(fleet, 'webroot/webroot-git.sh'))
  for (const lib of [
    'heavy-slots.sh',
    'webroot-excludes.sh',
    'webroot-platform.sh',
    'webroot-repo-git.sh',
    'webroot-sensitive.sh',
    'webroot-zones.cjs'
  ]) {
    copyFileSync(path.join(SCRIPTS, 'lib', lib), path.join(fleet, 'lib', lib))
  }
  mkdirSync(host.privateRoot, { recursive: true })
  host.webrootGit = path.join(fleet, 'webroot/webroot-git.sh')
  return host
}

const historyEnv = (host, tag = 'v2026.10.02') => ({
  TRACY_PRIVATE_ROOT: host.privateRoot,
  TRACY_DEPLOY_TAG: tag,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null'
})

/** webroot-git.sh on the fixture host, its last JSON line. */
function webrootGit(host, label, ...args) {
  // Not `env(host)`: its PATH carries the flock stand-in, which speaks only `flock [-n] <fd>`, and
  // webroot-git.sh's own locks wait with `-w` (on a machine without flock they are skipped).
  const r = spawnSync(BASH, [host.webrootGit, '--label', label, ...args], {
    env: {
      ...process.env,
      TRACY_SITES_ROOT: host.sites,
      TRACY_HEAVY_LOCK: path.join(host.dir, 'heavy.lock'),
      ...historyEnv(host)
    },
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

/** The site's commits, newest first: author email, subject, files. */
function log(host, label) {
  const repo = path.join(host.privateRoot, label, 'webroot-baseline.git')
  const out = spawnSync('git', ['--git-dir', repo, 'log', '--format=%x1e%ae%x09%s', '--name-only'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' }
  }).stdout
  return out
    .split('\x1e')
    .slice(1)
    .map((chunk) => {
      const [head, ...files] = chunk.split('\n').filter(Boolean)
      const [email, subject] = head.split('\t')
      return { email, subject, files }
    })
}

/** A WordPress site with a webroot repo built over the stale copy and one theme file. */
function historySite(host, label) {
  makeSite(host, label, { plugin: STALE })
  const theme = path.join(host.sites, label, '.webroot/wp-content/themes/t')
  mkdirSync(theme, { recursive: true })
  writeFileSync(path.join(theme, 'style.css'), 'body {}\n')
  mkdirSync(path.join(host.privateRoot, label)) // provision's private half of the site
  webrootGit(host, label, '--op', 'ensure')
  return { theme: path.join(theme, 'style.css') }
}

describe('history', () => {
  test('the copy is one outside commit holding exactly tracy-access.php, named for the deploy; a second run commits nothing', async (t) => {
    const host = makeHistoryHost(t)
    const { theme } = historySite(host, 'wp')
    writeFileSync(theme, 'body { color: red }\n') // an agent's turn, still open
    const r = await run(host, [], historyEnv(host))
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'wp')
    const [top] = log(host, 'wp')
    assert.deepEqual(top, {
      email: 'outside@tracy.ai',
      subject: 'outside Tracy: deploy v2026.10.02 updated tracy-access.php',
      files: [REL]
    })
    const again = await run(host, [], historyEnv(host, 'v2026.10.03'))
    assert.equal(again.status, 0, again.out)
    assert.equal(log(host, 'wp')[0].subject, top.subject, 'same bytes: no commit')
    // The theme edit is still the open turn's, untouched by the deploy.
    const made = webrootGit(host, 'wp', '--op', 'moment', '--title', 'Red', '--turn', 'session-a:1')
    assert.deepEqual(made.paths, ['wp-content/themes/t/style.css'])
  })

  test('BUG-DEV-2: a site whose private dir or repo is not where TRACY_PRIVATE_ROOT says is copied, and the run SAYS it was not recorded', async (t) => {
    const host = makeHistoryHost(t)
    makeSite(host, 'wp', { plugin: STALE }) // no private dir under this root: the dev fault of 02/10
    const r = await run(host, [], historyEnv(host))
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'wp')
    assert.match(
      r.out,
      /wp: WARNING this copy is not recorded in the site history: .* holds no wp — is TRACY_PRIVATE_ROOT right on this host\?/
    )
    assert.match(r.out, /WARNING: 1 site\(s\) not recorded in their history .*: wp/)
  })

  test('a destination someone edited is sealed as outside first, under its own commit — never relabelled a deploy', async (t) => {
    const host = makeHistoryHost(t)
    historySite(host, 'wp')
    writeFileSync(destOf(host, 'wp'), '<?php // hand-edited over SSH\n')
    const r = await run(host, [], historyEnv(host))
    assert.equal(r.status, 0, r.out)
    assert.deepEqual(
      log(host, 'wp')
        .slice(0, 2)
        .map((c) => [c.email, c.subject, c.files]),
      [
        ['outside@tracy.ai', 'outside Tracy: deploy v2026.10.02 updated tracy-access.php', [REL]],
        ['outside@tracy.ai', 'outside Tracy: changes made to the site outside Tracy', [REL]]
      ]
    )
  })

  test('killed after the copy: the next op commits it under the deploy that copied it, once', async (t) => {
    const host = makeHistoryHost(t)
    historySite(host, 'wp')
    const killed = await runInjected(host, 'commit', 'wp', 'kill', historyEnv(host, 'v-first'))
    assert.notEqual(killed.status, 0, killed.out)
    assertInstalled(host, 'wp')
    assert.ok(existsSync(path.join(host.privateRoot, 'wp/webroot-baseline.git/tracy-deploy-pending')))
    // The next moment (a chat turn stopping) commits the copy first, as the deploy's.
    const made = webrootGit(host, 'wp', '--op', 'moment', '--title', 'Anything', '--turn', 'session-a:1')
    assert.equal(made.committed, false, 'the copy is not the turn’s')
    assert.deepEqual(log(host, 'wp')[0], {
      email: 'outside@tracy.ai',
      subject: 'outside Tracy: deploy v-first updated tracy-access.php',
      files: [REL]
    })
    assert.ok(!existsSync(path.join(host.privateRoot, 'wp/webroot-baseline.git/tracy-deploy-pending')))
    const next = await run(host, [], historyEnv(host, 'v-second'))
    assert.equal(next.status, 0, next.out)
    assert.equal(log(host, 'wp').filter((c) => c.subject.includes('deploy')).length, 1)
  })

  test("the site's webroot lock held: the copy waits, then lands with its commit", async (t) => {
    const host = makeHistoryHost(t)
    historySite(host, 'wp')
    const lock = path.join(host.privateRoot, 'wp/webroot-baseline.git/tracy-webroot.lock')
    const holder = spawn(
      'python3',
      [
        '-c',
        'import fcntl,sys\nf=open(sys.argv[1],"w")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("held",flush=True)\nsys.stdin.read()',
        lock
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] }
    )
    t.after(() => holder.kill())
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    const running = run(host, [], historyEnv(host))
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(readFileSync(destOf(host, 'wp'), 'utf8'), STALE, 'copied while a moment held the site')
    holder.stdin.end()
    const r = await running
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'wp')
    assert.match(log(host, 'wp')[0].subject, /^outside Tracy: deploy /)
  })
})

// P0: from 0.4.0 the plugin believes only an assertion signed with the site's own key, so a deploy
// must never push it onto a site that cannot verify one, nor onto one nobody listed for the rollout.
describe('resync-access-plugin.sh — strict plugin only on ready, listed sites', { concurrency: 4 }, () => {
  const HELD = [
    [
      'not on the rollout list',
      (host) => {
        writeFileSync(path.join(host.privateRoot, '.site-access', 'rollout.list'), '# canary\nother-site\n')
        makeSite(host, 'wp', { plugin: STALE })
      },
      /wp: held — not on the rollout list/
    ],
    [
      'no access key',
      (host) => makeSite(host, 'wp', { plugin: STALE, ready: false }),
      /wp: held — no access key/
    ],
    [
      'a key whose kid was never proven ready',
      (host) => {
        markReady(host, 'wp', { kid: 'k-new', readyKid: 'k-old' })
        makeSite(host, 'wp', { plugin: STALE, ready: false })
      },
      /wp: held — not proven ready for kid k-new/
    ],
    [
      'a key with no readiness record',
      (host) => {
        markReady(host, 'wp', { readyKid: null })
        makeSite(host, 'wp', { plugin: STALE, ready: false })
      },
      /wp: held — not proven ready/
    ]
  ]
  for (const [name, arrange, said] of HELD) {
    test(`${name}: the site keeps the bytes it has, counted held, exit 0`, async (t) => {
      const host = makeHost(t)
      arrange(host)
      const r = await run(host)
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, said)
      assert.match(r.out, /done: 0 updated, 0 up to date, 0 skipped, 1 held, 0 failed/)
      assert.ok(readFileSync(destOf(host, 'wp'), 'utf8') === STALE)
    })
  }

  test('no private root to prove readiness with: nothing is upgraded', async (t) => {
    const host = makeHost(t)
    makeSite(host, 'wp', { plugin: STALE })
    const r = await run(host, [], { TRACY_PRIVATE_ROOT: path.join(host.dir, 'absent') })
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /wp: held — no private root/)
    assert.ok(readFileSync(destOf(host, 'wp'), 'utf8') === STALE)
  })

  test('a site born strict (strict.json from provision) is upgraded with no rollout.list line', async (t) => {
    const host = makeHost(t)
    writeFileSync(path.join(host.privateRoot, '.site-access', 'rollout.list'), '# nobody listed\n')
    makeSite(host, 'born', { plugin: STALE })
    makeSite(host, 'neighbour', { plugin: STALE })
    writeFileSync(path.join(host.privateRoot, '.site-access', 'born', 'strict.json'), '{"v":1}\n')
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'born')
    assert.ok(readFileSync(destOf(host, 'neighbour'), 'utf8') === STALE)
    assert.match(r.out, /done: 1 updated, 0 up to date, 0 skipped, 1 held, 0 failed/)
  })

  test('a canary line upgrades that site and holds its neighbour', async (t) => {
    const host = makeHost(t)
    writeFileSync(path.join(host.privateRoot, '.site-access', 'rollout.list'), 'canary\n')
    makeSite(host, 'canary', { plugin: STALE })
    makeSite(host, 'neighbour', { plugin: STALE })
    const r = await run(host)
    assert.equal(r.status, 0, r.out)
    assertInstalled(host, 'canary')
    assert.ok(readFileSync(destOf(host, 'neighbour'), 'utf8') === STALE)
    assert.match(r.out, /done: 1 updated, 0 up to date, 0 skipped, 1 held, 0 failed/)
  })
})
