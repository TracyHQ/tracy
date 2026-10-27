/**
 * The minimum version guard (src/policy-guard.js): what the app knows of the policy at start, from
 * the network later, at the deadline and after a wake — with a fake clock, so no test waits.
 *
 *   node --test packages/desktop/tracy-desktop/test/policy-guard.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPolicyGuard } = require('../src/policy-guard.js')

const T0 = Date.parse('2026-10-20T00:00:00Z')
const DAY = 86_400_000

/** A clock and timers that move only when told. */
function fakeTime(start = T0) {
  let now = start
  let id = 0
  const pending = new Map()
  return {
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => {
        pending.set(++id, { at: now + ms, fn })
        return id
      },
      clearTimeout: (handle) => pending.delete(handle)
    },
    pending,
    async advance(ms) {
      const until = now + ms
      for (;;) {
        const next = [...pending.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        pending.delete(next[0])
        now = next[1].at
        next[1].fn()
        await new Promise((r) => setImmediate(r))
      }
      now = until
      await new Promise((r) => setImmediate(r))
    }
  }
}

function memoryStore(record = null) {
  let saved = record
  return {
    read: () => saved,
    write: (r) => (saved = r),
    get saved() {
      return saved
    }
  }
}

/** A check the test answers by hand. */
function manualCheck() {
  const calls = []
  const check = () => new Promise((resolve) => calls.push(resolve))
  return { check, calls }
}

const setup = ({ running = '0.5.1', stored = null, check, time = fakeTime() } = {}) => {
  const store = memoryStore(stored)
  const verdicts = []
  const lines = []
  const guard = createPolicyGuard({
    running,
    store,
    check: check ?? (async () => ({ kind: 'ok', policy: null })),
    now: time.now,
    timers: time.timers,
    log: (l) => lines.push(l),
    onVerdict: (v) => verdicts.push(v)
  })
  return { guard, store, verdicts, lines, time }
}

const blockedAt060 = {
  policy: { minimumVersion: '0.6.0', policyRevision: 3 },
  revision: 3,
  verifiedAt: T0 - DAY
}

test('start: the stored policy decides at once, before the network answers', async () => {
  const { check, calls } = manualCheck()
  const { guard, verdicts } = setup({ stored: blockedAt060, check })
  const started = guard.start()
  assert.equal(guard.current().level, 'blocked')
  assert.equal(verdicts.at(-1).level, 'blocked')
  calls[0]({ kind: 'ok', policy: { minimumVersion: '0.6.0', policyRevision: 3 } })
  const result = await started
  assert.equal(result.outcome, 'ok')
})

test('start offline with nothing stored: opens (ok) after at most 1.5 s; timeout is logged', async () => {
  const { check, calls } = manualCheck()
  const time = fakeTime()
  const { guard, lines } = setup({ check, time })
  const started = guard.start()
  let done = null
  started.then((r) => (done = r))
  await time.advance(1499)
  assert.equal(done, null)
  await time.advance(1)
  assert.deepEqual(done, {
    outcome: 'timeout',
    verdict: { level: 'ok', minimumVersion: null, after: null, offline: true }
  })
  assert.ok(lines.some((l) => /policy check: timeout/.test(l)))
  // A late answer is still taken.
  calls[0]({ kind: 'ok', policy: { minimumVersion: '0.5.2', policyRevision: 1 } })
  await time.advance(0)
  assert.equal(guard.current().level, 'blocked')
  assert.equal(guard.current().offline, false)
})

test('start offline with a stored "blocked": still blocked, and marked offline', async () => {
  const time = fakeTime()
  const { guard } = setup({
    stored: blockedAt060,
    check: async () => ({ kind: 'unreachable', reason: 'fetch failed' }),
    time
  })
  const result = await guard.start()
  assert.equal(result.outcome, 'unreachable')
  assert.deepEqual(guard.current(), { level: 'blocked', minimumVersion: '0.6.0', after: null, offline: true })
})

test('a refused (badly signed) answer changes nothing and says so in the log', async () => {
  const { guard, lines, store } = setup({
    stored: blockedAt060,
    check: async () => ({ kind: 'refused', reason: 'signature: bad' })
  })
  const result = await guard.start()
  assert.equal(result.outcome, 'refused')
  assert.equal(guard.current().level, 'blocked')
  assert.equal(store.saved, blockedAt060)
  assert.ok(lines.some((l) => /policy check \(start\): refused/.test(l)))
})

test('a higher revision lowering the minimum lets a blocked app go; a replay of an older one does not', async () => {
  const { guard, store } = setup({ stored: blockedAt060 })
  guard.start()
  guard.accept({ minimumVersion: '0.5.0', policyRevision: 4 })
  assert.equal(guard.current().level, 'ok')
  assert.equal(store.saved.revision, 4)
  guard.accept({ minimumVersion: '0.6.0', policyRevision: 3 })
  assert.equal(guard.current().level, 'ok')
  assert.equal(store.saved.revision, 4)
})

test('warn turns into blocked at the deadline, by its own timer, without a poll', async () => {
  const time = fakeTime()
  const { guard, verdicts } = setup({ time })
  await guard.start()
  guard.accept({
    minimumVersion: '0.6.0',
    minimumVersionAfter: new Date(T0 + DAY).toISOString(),
    policyRevision: 1
  })
  assert.equal(guard.current().level, 'warn')
  await time.advance(DAY - 1)
  assert.equal(guard.current().level, 'warn')
  await time.advance(1)
  assert.equal(guard.current().level, 'blocked')
  assert.deepEqual(
    verdicts.map((v) => v.level),
    ['ok', 'warn', 'blocked']
  )
})

test('after a wake past the deadline, resume() blocks at once', async () => {
  const time = fakeTime()
  const { guard } = setup({ time })
  await guard.start()
  guard.accept({
    minimumVersion: '0.6.0',
    minimumVersionAfter: new Date(T0 + DAY).toISOString(),
    policyRevision: 1
  })
  // The machine slept: the clock jumped and the timer has not run yet.
  for (const [id] of time.pending) time.timers.clearTimeout(id)
  await time.advance(2 * DAY)
  assert.equal(guard.current().level, 'warn')
  guard.resume()
  assert.equal(guard.current().level, 'blocked')
})

test('the policy is checked again every 24 hours, whatever automatic update checks say', async () => {
  const time = fakeTime()
  let checks = 0
  const { guard } = setup({ time, check: async () => (checks++, { kind: 'ok', policy: null }) })
  await guard.start()
  assert.equal(checks, 1)
  await time.advance(DAY)
  assert.equal(checks, 2)
  guard.stop()
  await time.advance(3 * DAY)
  assert.equal(checks, 2)
})

test('retry(): one check now; two presses share it', async () => {
  const { check, calls } = manualCheck()
  const { guard } = setup({ check })
  const started = guard.start()
  calls[0]({ kind: 'unreachable', reason: 'x' })
  await started
  const a = guard.retry()
  const b = guard.retry()
  assert.equal(calls.length, 2)
  calls[1]({ kind: 'ok', policy: null })
  assert.deepEqual(await a, await b)
})
