/**
 * Work that holds the machine-wide heavy lock runs at NORMAL CPU priority, and a backup queued
 * behind that lock says so.
 *
 * 12/10/2026 on fleet01 (2 cores): fourteen demo installs ran together; one baseline (`webroot-git.sh
 * --op ensure`) held `/var/lock/tracy-webroot-heavy.lock` for 46+ minutes while ten installs waited
 * on it. The holder ran at `nice -n 19` (CFS weight 15 against 1024), so any two normal-priority
 * processes on the two cores left it about 1% of a core: a priority inversion. Measured in a 2-core
 * lab with the real ja-space webroot (11,302 files): 2-3 s alone, 6 s at nice 0 beside two busy
 * processes, not finished after 240 s at nice 19 beside the same two.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-heavy-lock-priority.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPTS = join(here, '..', 'scripts', 'webroot')
const GIT = join(SCRIPTS, 'webroot-git.sh')
const BACKUP = join(SCRIPTS, 'webroot-backup.sh')
const LABEL = 'site-under-test'
const WAITING = /^==> waiting for another site's webroot baseline/m
const RESUMED = /^==> taking the Initial backup \(ADR 0024\)$/m

/** Code lines (comments dropped) of a script. */
const codeLines = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))

test('no script that takes the heavy lock runs its work under nice', () => {
  for (const name of ['webroot-git.sh', 'webroot-backup.sh', 'webroot-pack.sh']) {
    const file = join(SCRIPTS, name)
    assert.match(
      readFileSync(file, 'utf8'),
      /tracy-webroot-heavy\.lock/,
      `${name} no longer takes the heavy lock`
    )
    const niced = codeLines(file).filter((line) => /\bnice\b/.test(line))
    assert.deepEqual(niced, [], `${name} deprioritises the CPU of work every other heavy job waits for`)
  }
})

/** A throwaway stack whose webroot holds `files` files of 8 KiB of incompressible bytes. */
function stack(files) {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-heavy-prio-'))
  const webroot = join(srv, LABEL, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  for (let i = 0; i < files; i++) {
    const dir = join(webroot, 'wp-content', `d${i % 50}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `f${i}.php`), randomBytes(8192))
  }
  return { srv, lock: join(srv, 'heavy.lock'), dispose: () => rmSync(srv, { recursive: true, force: true }) }
}

const env = (s) => ({
  ...process.env,
  PATH: pathWithFlock(),
  TRACY_SRV: s.srv,
  TRACY_SITES_ROOT: s.srv,
  TRACY_HEAVY_LOCK: s.lock,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null'
})

/** Run `cmd` to its end; resolve with exit code, stderr and wall seconds. */
function run(cmd, args, options) {
  const started = Date.now()
  const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  const out = { stdout: '', stderr: '' }
  child.stdout.on('data', (d) => {
    out.stdout += d
  })
  child.stderr.on('data', (d) => {
    out.stderr += d
  })
  const done = new Promise((resolve) =>
    child.on('close', (code) => resolve({ code, ...out, seconds: (Date.now() - started) / 1000 }))
  )
  return { child, out, done }
}

const HAS_TASKSET = spawnSync('sh', ['-c', 'command -v taskset'], { encoding: 'utf8' }).stdout.trim() !== ''
/** The first core this process may run on (a container's cpuset need not include core 0). */
const firstCore = () =>
  /Cpus_allowed_list:\s*(\d+)/.exec(readFileSync('/proc/self/status', 'utf8'))?.[1] ?? '0'

// The behaviour itself, where it can be measured: Linux, one core, one normal-priority busy loop on
// it. Red on the nice-19 script (it gets ~1.4% of the core: tens of seconds to minutes for this
// webroot), green at normal priority (half the core: a second or two).
test('a baseline beside a busy normal-priority process on the same core still finishes promptly', {
  skip: HAS_TASKSET ? false : 'needs taskset (Linux); the static test above covers the rule'
}, async () => {
  const s = stack(3000)
  const core = firstCore()
  const hog = spawn('taskset', ['-c', core, 'sh', '-c', 'while :; do :; done'], { stdio: 'ignore' })
  try {
    // Its own process group, so the cut-off below stops git too and the test ends at once.
    const job = run('taskset', ['-c', core, 'bash', GIT, '--label', LABEL, '--op', 'ensure'], {
      env: env(s),
      detached: true
    })
    const timer = setTimeout(() => process.kill(-job.child.pid, 'SIGKILL'), 30_000)
    const result = await job.done
    clearTimeout(timer)
    assert.equal(result.code, 0, result.stderr)
    assert.ok(result.seconds < 20, `the baseline took ${result.seconds}s beside one busy process`)
  } finally {
    hog.kill('SIGKILL')
    s.dispose()
  }
})

/** Another heavy job: hold the lock with flock(2) until stdin closes. */
function holdLock(path) {
  const holder = spawn(
    'python3',
    [
      '-c',
      'import fcntl,sys\nf=open(sys.argv[1],"w")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("held",flush=True)\nsys.stdin.read()',
      path
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] }
  )
  const held = new Promise((resolve) => holder.stdout.once('data', resolve))
  return { held, release: () => holder.stdin.end() }
}

const until = async (check, ms = 10000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) return false
    await new Promise((r) => setTimeout(r, 50))
  }
  return true
}

test('an Initial backup queued behind another heavy job says it is waiting, then names its own step', async () => {
  const s = stack(0)
  const other = holdLock(s.lock)
  try {
    await other.held
    const job = run('bash', [BACKUP, '--label', LABEL, '--op', 'initial-backup'], { env: env(s) })
    assert.ok(await until(() => WAITING.test(job.out.stderr)), `no waiting line; stderr:\n${job.out.stderr}`)
    assert.doesNotMatch(job.out.stderr, RESUMED)
    other.release()
    const result = await job.done
    // The backup itself may stop later (this stack has no database); the narration is the subject.
    assert.match(result.stderr, RESUMED)
    assert.ok(result.stderr.search(WAITING) < result.stderr.search(RESUMED), 'waiting comes first')
  } finally {
    other.release()
    s.dispose()
  }
})
