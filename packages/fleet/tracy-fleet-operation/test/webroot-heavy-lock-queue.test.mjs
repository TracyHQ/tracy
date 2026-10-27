/**
 * A baseline that waits for the machine-wide heavy lock SAYS it is waiting.
 *
 * 12/10/2026 on fleet01: eight demo installs pressed together all showed the step "building the
 * webroot baseline (ADR 0073)" for 10+ minutes, while seven of them were only queued behind the one
 * heavy lock (`run_heavy` in `webroot-git.sh`). The step a job shows is the last `==> ` line its
 * script printed (`apps/tracy-host/src/provision.js`), so a queue was indistinguishable from work.
 * The lock and `nice 19` stay; only the narration changes.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-heavy-lock-queue.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const GIT = join(here, '..', 'scripts', 'webroot', 'webroot-git.sh')
const LABEL = 'site-under-test'
const WAITING = /^==> waiting for another site's webroot baseline/m
const BUILDING = /^==> building the webroot baseline \(ADR 0073\)$/m

/** A WordPress-shaped webroot in a throwaway tree. */
function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-heavy-'))
  const webroot = join(srv, LABEL, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  return { srv, lock: join(srv, 'heavy.lock'), dispose: () => rmSync(srv, { recursive: true, force: true }) }
}

/** Start `--op ensure`; resolve with its exit code and both streams once it ends. */
function ensure(s, extra = {}) {
  const child = spawn('bash', [GIT, '--label', LABEL, '--op', 'ensure'], {
    env: {
      ...process.env,
      ...extra,
      PATH: pathWithFlock(),
      TRACY_SRV: s.srv,
      TRACY_SITES_ROOT: s.srv,
      TRACY_HEAVY_LOCK: s.lock,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const out = { stdout: '', stderr: '' }
  child.stdout.on('data', (d) => {
    out.stdout += d
  })
  child.stderr.on('data', (d) => {
    out.stderr += d
  })
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, ...out })))
  return { out, done }
}

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

test('a baseline queued behind another heavy job says it is waiting, then says it is building', async () => {
  const s = stack()
  // Both of the machine's slots taken (lib/heavy-slots.sh: the lock, then `<lock>.1`).
  const other = holdLock(s.lock)
  const second = holdLock(`${s.lock}.1`)
  try {
    await other.held
    await second.held
    const job = ensure(s)
    assert.ok(await until(() => WAITING.test(job.out.stderr)), `no waiting line; stderr:\n${job.out.stderr}`)
    // Still queued: nothing claims to be building yet.
    assert.doesNotMatch(job.out.stderr, BUILDING)
    other.release()
    second.release()
    const result = await job.done
    assert.equal(result.code, 0, result.stderr)
    // The step flips back to the real work once the lock is ours, so the screen shows the build.
    assert.match(result.stderr, BUILDING)
    assert.ok(result.stderr.search(WAITING) < result.stderr.search(BUILDING), 'waiting comes first')
    // stdout stays the JSON answer the callers parse.
    assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).ok, true)
  } finally {
    other.release()
    second.release()
    s.dispose()
  }
})

test('one heavy job running leaves the machine a second slot: a baseline starts at once beside it; one slot makes it wait', async () => {
  const s = stack()
  const other = holdLock(s.lock)
  try {
    await other.held
    const beside = await ensure(s).done
    assert.equal(beside.code, 0, beside.stderr)
    assert.doesNotMatch(beside.stderr, WAITING, 'the second slot was free')
    // TRACY_HEAVY_SLOTS=1, the old one-at-a-time: queued until the other job ends.
    const s1 = stack()
    try {
      const other1 = holdLock(s1.lock)
      await other1.held
      const job = ensure(s1, { TRACY_HEAVY_SLOTS: '1' })
      assert.ok(
        await until(() => WAITING.test(job.out.stderr)),
        `no waiting line; stderr:\n${job.out.stderr}`
      )
      other1.release()
      assert.equal((await job.done).code, 0)
    } finally {
      s1.dispose()
    }
  } finally {
    other.release()
    s.dispose()
  }
})

test('a baseline with the lock free starts at once and prints no waiting line', async () => {
  const s = stack()
  try {
    const result = await ensure(s).done
    assert.equal(result.code, 0, result.stderr)
    assert.doesNotMatch(result.stderr, WAITING)
  } finally {
    s.dispose()
  }
})
