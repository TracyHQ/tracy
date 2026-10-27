import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRANDS_INTERVAL_MS,
  BRANDS_TIMEOUT_MS,
  COPY_SNAPSHOTS_INTERVAL_MS,
  COPY_SNAPSHOTS_TIMEOUT_MS,
  FIRST_RUN_DELAY_MS,
  SITE_FOLDERS_INTERVAL_MS,
  SITE_FOLDERS_TIMEOUT_MS,
  start,
  sweepCopySnapshots,
  syncBrands,
  syncSiteFolders
} from '../src/sync.js'
import { start as startServer } from '../src/server.js'

const config = { scriptsDir: '/opt/tracy-fleet', logDir: '/var/lib/tracy-host/logs' }

test('syncSiteFolders: runs bash tools/sync-site-folders.sh under scriptsDir, with a time limit', async () => {
  let seen = null
  const run = async (args) => {
    seen = args
    return { code: 0, tail: [] }
  }
  await syncSiteFolders({ config, run })
  assert.equal(seen.script, 'bash')
  assert.deepEqual(seen.args, ['/opt/tracy-fleet/tools/sync-site-folders.sh'])
  assert.equal(seen.logPath, '/var/lib/tracy-host/logs/sync-site-folders.log')
  assert.equal(seen.timeoutMs, SITE_FOLDERS_TIMEOUT_MS)
  assert.ok(SITE_FOLDERS_TIMEOUT_MS < SITE_FOLDERS_INTERVAL_MS, 'a hung run is killed before the next tick')
})

test('syncBrands: runs bash tools/sync-brands.sh under scriptsDir, with a time limit', async () => {
  let seen = null
  const run = async (args) => {
    seen = args
    return { code: 0, tail: [] }
  }
  await syncBrands({ config, run })
  assert.equal(seen.script, 'bash')
  assert.deepEqual(seen.args, ['/opt/tracy-fleet/tools/sync-brands.sh'])
  assert.equal(seen.timeoutMs, BRANDS_TIMEOUT_MS)
})

test('sweepCopySnapshots: runs bash tools/sweep-copy-snapshots.sh under scriptsDir, with a time limit', async () => {
  let seen = null
  const run = async (args) => {
    seen = args
    return { code: 0, tail: [] }
  }
  await sweepCopySnapshots({ config, run })
  assert.equal(seen.script, 'bash')
  assert.deepEqual(seen.args, ['/opt/tracy-fleet/tools/sweep-copy-snapshots.sh'])
  assert.equal(seen.logPath, '/var/lib/tracy-host/logs/sweep-copy-snapshots.log')
  assert.equal(seen.timeoutMs, COPY_SNAPSHOTS_TIMEOUT_MS)
  assert.ok(
    COPY_SNAPSHOTS_TIMEOUT_MS < COPY_SNAPSHOTS_INTERVAL_MS,
    'a hung run is killed before the next tick'
  )
})

/** Records every timer call instead of scheduling anything — a test that waited five minutes and
 * then an hour for a tick would be a test nobody could run. */
function fakeClock() {
  const timeouts = []
  const intervals = []
  const cleared = []
  let nextHandle = 1
  return {
    setTimeoutFn: (fn, ms) => {
      const handle = nextHandle++
      timeouts.push({ handle, fn, ms })
      return handle
    },
    clearTimeoutFn: (handle) => cleared.push(handle),
    setIntervalFn: (fn, ms) => {
      const handle = nextHandle++
      intervals.push({ handle, fn, ms })
      return handle
    },
    clearIntervalFn: (handle) => cleared.push(handle),
    timeouts,
    intervals,
    cleared
  }
}

const clockOpts = (clock) => ({
  setTimeoutFn: clock.setTimeoutFn,
  clearTimeoutFn: clock.clearTimeoutFn,
  setIntervalFn: clock.setIntervalFn,
  clearIntervalFn: clock.clearIntervalFn
})

const quiet = { log() {}, warn() {}, error() {} }

test('start: nothing runs at boot; the first run of each clock is ~5 minutes later, then hourly / every ten minutes', async () => {
  const clock = fakeClock()
  const ran = []
  const run = async ({ args }) => {
    ran.push(args[0].split('/').at(-1))
    return { code: 0, tail: [] }
  }
  const handle = start({ config, run, log: quiet, ...clockOpts(clock) })

  assert.equal(ran.length, 0, 'no run at boot')
  assert.equal(clock.intervals.length, 0, 'no interval before the first run')
  assert.deepEqual(
    clock.timeouts.map((t) => t.ms),
    [FIRST_RUN_DELAY_MS, FIRST_RUN_DELAY_MS, FIRST_RUN_DELAY_MS]
  )
  assert.equal(FIRST_RUN_DELAY_MS, 5 * 60 * 1000)

  // Five minutes on: each clock runs once and only now starts its interval.
  clock.timeouts[0].fn()
  clock.timeouts[1].fn()
  clock.timeouts[2].fn()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(ran, ['sync-site-folders.sh', 'sync-brands.sh', 'sweep-copy-snapshots.sh'])
  assert.deepEqual(
    clock.intervals.map((i) => i.ms),
    [SITE_FOLDERS_INTERVAL_MS, BRANDS_INTERVAL_MS, COPY_SNAPSHOTS_INTERVAL_MS]
  )
  assert.equal(SITE_FOLDERS_INTERVAL_MS, 60 * 60 * 1000)
  assert.equal(BRANDS_INTERVAL_MS, 10 * 60 * 1000)
  // test-quality: contract the copy-snapshot sweep runs once a day, by the owner's decision (24/10/2026)
  assert.equal(COPY_SNAPSHOTS_INTERVAL_MS, 24 * 60 * 60 * 1000)

  handle.stop()
  assert.deepEqual(
    [...clock.cleared].sort(),
    [...clock.timeouts.map((t) => t.handle), ...clock.intervals.map((i) => i.handle)].sort()
  )
})

test('start: stop() before the first run means no run and no interval ever starts', () => {
  const clock = fakeClock()
  let runs = 0
  const handle = start({
    config,
    run: async () => {
      runs++
      return { code: 0, tail: [] }
    },
    log: quiet,
    ...clockOpts(clock)
  })
  handle.stop()
  // A fake clock does not honour clear; the callback itself must notice the stop.
  clock.timeouts[0].fn()
  assert.equal(runs, 0)
  assert.equal(clock.intervals.length, 0)
})

test('start: a tick while the previous run of the same script hangs is skipped, not stacked (R8)', async () => {
  const clock = fakeClock()
  const warnings = []
  const log = { log() {}, error() {}, warn: (msg) => warnings.push(msg) }
  let calls = 0
  let release
  const hung = new Promise((resolve) => {
    release = resolve
  })
  const run = async ({ args }) => {
    if (!args[0].endsWith('sync-site-folders.sh')) return { code: 0, tail: [] }
    calls++
    await hung
    return { code: 0, tail: [] }
  }
  const handle = start({ config, run, log, ...clockOpts(clock) })

  const first = handle.ticks.siteFolders()
  const second = handle.ticks.siteFolders() // an hour later, the first still hangs
  await second
  assert.equal(calls, 1, 'the second tick did not start a second run')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /sync-site-folders: the previous run is still going/)

  // The other clock is independent: its own tick still runs.
  await handle.ticks.brands()

  release()
  await first
  await handle.ticks.siteFolders() // once the hung run ends, the next tick runs again
  assert.equal(calls, 2)
  handle.stop()
})

test('start: a tick that runs a script with a non-zero exit code logs and does not throw', async () => {
  const clock = fakeClock()
  const errors = []
  const log = { log() {}, warn() {}, error: (msg) => errors.push(msg) }
  const run = async () => ({ code: 1, tail: ['git push rejected'] })
  const handle = start({ config, run, log, ...clockOpts(clock) })

  await handle.ticks.siteFolders()
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('sync-site-folders'))
  assert.ok(errors[0].includes('git push rejected'))
  handle.stop()
})

test('start: a tick whose run() throws is caught and logged, never left to crash the process', async () => {
  const clock = fakeClock()
  const errors = []
  const log = { log() {}, warn() {}, error: (msg) => errors.push(msg) }
  const run = async () => {
    throw new Error('spawn ENOENT')
  }
  const handle = start({ config, run, log, ...clockOpts(clock) })

  await handle.ticks.brands()
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('sync-brands'))
  assert.ok(errors[0].includes('spawn ENOENT'))
  handle.stop()
})

const serverEnv = {
  HOST_NAME: 'local',
  HOST_SECRET: 's3cr3t',
  TRACY_SITES_ROOT: process.cwd(),
  TRACY_PRIVATE_ROOT: process.cwd(),
  TRACY_FLEET_DIR: process.cwd(),
  TRACY_HOST_REFRESH_MTIMES: '0',
  TRACY_HOST_CONTENT_IDENTITY: '0',
  PORT: '0'
}

test('server.start: starts the sync clocks after listening, and close() stops them', async () => {
  const calls = []
  let stopped = 0
  const startSync = (input) => {
    calls.push(input)
    return { stop: () => stopped++ }
  }
  const run = async () => ({ code: 0, tail: [] })
  const { close } = await startServer({ env: serverEnv, log: quiet, run, startSync })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].run, run, "the clocks get the server's own runner")
  assert.equal(calls[0].config.scriptsDir, process.cwd())
  await close()
  assert.equal(stopped, 1)
})

test('server.start: TRACY_HOST_SYNC=0 leaves the sync clocks off', async () => {
  let calls = 0
  const startSync = () => {
    calls++
    return { stop() {} }
  }
  const { close } = await startServer({
    env: { ...serverEnv, TRACY_HOST_SYNC: '0' },
    log: quiet,
    run: async () => ({ code: 0, tail: [] }),
    startSync
  })
  await close()
  assert.equal(calls, 0)
})
