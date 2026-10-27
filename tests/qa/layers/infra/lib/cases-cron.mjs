// Cron / reconcile cases on a fake clock and a fake pool (no PostgreSQL). They prove the SCHEDULE
// and lifecycle of `apps/tracy-web/src/cron.js`; locking and atomicity against a real database
// need PostgreSQL and stay out of this file (reported as PENDING by the denominator).
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { step } from './harness.mjs'

const CRON = 'apps/tracy-web/src/cron.js'

export const CRON_MUTATIONS = [
  {
    id: 'cron-boot-reconcile-dropped',
    tree: 'web',
    file: CRON,
    find: '  tickRefill()\n\n  let daily = null',
    replace: '\n  let daily = null'
  },
  {
    id: 'cron-reconcile-callback-dropped',
    tree: 'web',
    file: CRON,
    find: '    inventory.unref?.()\n    refill()\n  }',
    replace: '    inventory.unref?.()\n  }'
  },
  {
    id: 'cron-reconcile-not-rearmed',
    tree: 'web',
    file: CRON,
    find: '    inventory = setTimeout(tickRefill, periodMs)',
    replace: '    inventory = setTimeout(() => {}, periodMs)'
  },
  {
    id: 'cron-stop-leaks-sync-timer',
    tree: 'web',
    file: CRON,
    find: '      clearInterval(sync)\n',
    replace: ''
  },
  {
    id: 'cron-double-start-allowed',
    tree: 'web',
    file: CRON,
    find: '  if (current) {',
    replace: '  if (false) {'
  },
  {
    id: 'cron-stop-keeps-handle',
    tree: 'web',
    file: CRON,
    find: '      current = null\n      return opsRunning',
    replace: '      return opsRunning'
  },
  {
    id: 'cron-hourly-sweep-dropped',
    tree: 'web',
    file: CRON,
    find: "    sweepExpired(pool).catch((error) => log.error('[cron] hourly sweep failed', error))",
    replace: ''
  },
  {
    id: 'cron-daily-host-sweep-dropped',
    tree: 'web',
    file: CRON,
    find: "        sweepHosts(pool, config, { fetchImpl, log }).catch((error) =>\n          log.error('[cron] host sweep failed', error)\n        )",
    replace: ''
  },
  {
    id: 'cron-lock-ignored',
    tree: 'web',
    file: CRON,
    find: '    if (!rows[0].got) return false',
    replace: ''
  },
  {
    id: 'cron-lock-not-released',
    tree: 'web',
    file: CRON,
    find: "      await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})",
    replace: ''
  }
]

function fakePool({ lockHeldElsewhere = false, failOn = null } = {}) {
  const queries = []
  const state = { released: 0 }
  const client = () => ({
    query: async (sql) => {
      const text = String(sql).replace(/\s+/g, ' ').trim()
      queries.push(text)
      if (failOn && text.includes(failOn)) throw new Error('qa: injected query failure')
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ got: !lockHeldElsewhere }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
    release: () => {
      state.released += 1
    }
  })
  return { ...client(), connect: async () => client(), on() {}, queries, state }
}

const quietLog = () => {
  const lines = []
  const record =
    (level) =>
    (...args) =>
      lines.push([level, ...args.map((a) => String(a?.message ?? a))])
  return { lines, log: { log() {}, info() {}, warn: record('warn'), error: record('error') } }
}

const tick = async (ms) => {
  mock.timers.tick(ms)
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve))
}
const stamps = (pool) =>
  pool.queries.filter((q) => q.startsWith('insert into inventory_sweep (id, last_started_at)')).length

async function withCron(root, options, fn) {
  const cron = await import(pathToFileURL(path.join(root, CRON)).href)
  const pool = fakePool(options?.pool)
  const sink = quietLog()
  const hosts = options?.hosts ?? new Map()
  const config = { hosts, origin: 'http://tracy.test', siteDomain: 'localhost', siteAddressPrefix: '' }
  const fetches = []
  const fetchImpl = async (url) => {
    fetches.push(String(url))
    throw new Error('qa: no network')
  }
  mock.timers.enable({
    apis: ['setInterval', 'setTimeout', 'Date'],
    now: options?.now ?? new Date(2026, 9, 5, 10, 0, 0).getTime()
  })
  let handle = null
  try {
    return await fn({
      cron,
      pool,
      config,
      sink,
      fetchImpl,
      fetches,
      start: (extra = {}) => (handle = cron.start(pool, config, { log: sink.log, fetchImpl, ...extra }))
    })
  } finally {
    try {
      await handle?.stop?.()
    } catch {}
    mock.timers.reset()
  }
}

export function cronCases() {
  const cases = []
  const base = (item, extra) => ({
    targets: ['local'],
    effects: { reads: [], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    legacyIds: [],
    itemIds: [item],
    ...extra
  })
  const start = 'cron-start:start'

  cases.push(
    base('cron-timer:inventory', {
      id: 'QA-INFRA-cron-start-boot-reconcile',
      requirement: 'the warm-pool reconciler runs once at boot, before any timer has fired',
      oracle: 'inventory-reconcile-schedule',
      edgeTags: ['cold-warm', 'restart'],
      assertionIds: ['boot-stamp'],
      mutation: 'cron-boot-reconcile-dropped',
      redAssertion: 'boot-stamp',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          start()
          for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve))
          step('boot-stamp', () => assert.equal(stamps(pool), 1, `boot reconcile stamps: ${stamps(pool)}`))
        })
      }
    }),
    base('cron-timer:inventory', {
      id: 'QA-INFRA-cron-reconcile-periodic-callback',
      requirement:
        'the reconciler runs again about every 30 s: not yet at 15 s, done by 45 s (default period when the setting cannot be read)',
      oracle: 'inventory-reconcile-schedule',
      edgeTags: ['boundary', 'repeat'],
      assertionIds: ['not-early', 'runs-again'],
      mutation: 'cron-reconcile-callback-dropped',
      redAssertion: 'runs-again',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          start()
          await tick(0)
          const boot = stamps(pool)
          await tick(15_000)
          step('not-early', () => assert.equal(stamps(pool), boot, 'the reconciler fired before its period'))
          await tick(30_000)
          step('runs-again', () => assert.ok(stamps(pool) > boot, `stamps stayed ${stamps(pool)} after 45 s`))
        })
      }
    }),
    base('cron-timer:inventory', {
      id: 'QA-INFRA-cron-reconcile-keeps-rearming',
      requirement: 'the reconciler keeps re-arming itself: at least three runs inside two minutes',
      oracle: 'inventory-reconcile-schedule',
      edgeTags: ['repeat'],
      assertionIds: ['rearmed'],
      mutation: 'cron-reconcile-not-rearmed',
      redAssertion: 'rearmed',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          start()
          await tick(0)
          for (let i = 0; i < 4; i += 1) await tick(30_000)
          step('rearmed', () => assert.ok(stamps(pool) >= 3, `only ${stamps(pool)} runs in two minutes`))
        })
      }
    }),
    base(start, {
      id: 'QA-INFRA-cron-stop-clears-timers',
      requirement: 'after stop(), no timer fires again: three hours of fake time produce no database traffic',
      oracle: 'cron-lifecycle',
      edgeTags: ['cleanup', 'resource-leak'],
      assertionIds: ['silent-after-stop'],
      mutation: 'cron-stop-leaks-sync-timer',
      redAssertion: 'silent-after-stop',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          const handle = start()
          await tick(0)
          await handle.stop()
          pool.queries.length = 0
          await tick(3 * 3_600_000)
          step('silent-after-stop', () =>
            assert.equal(
              pool.queries.length,
              0,
              `queries after stop: ${[...new Set(pool.queries)].slice(0, 3).join(' | ')}`
            )
          )
        })
      }
    }),
    base(start, {
      id: 'QA-INFRA-cron-start-duplicate-invocation',
      requirement:
        'a second start() in the same process returns the same handle, warns, and schedules nothing more',
      oracle: 'cron-lifecycle',
      edgeTags: ['repeat', 'stale-lock'],
      assertionIds: ['same-handle-no-second-schedule'],
      mutation: 'cron-double-start-allowed',
      redAssertion: 'same-handle-no-second-schedule',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, sink, start }) => {
          const first = start()
          await tick(0)
          const before = stamps(pool)
          const second = start()
          await tick(0)
          step('same-handle-no-second-schedule', () => {
            assert.equal(second, first)
            assert.equal(stamps(pool), before, 'a second boot reconcile ran')
            assert.ok(
              sink.lines.some(([level]) => level === 'warn'),
              'no warning logged'
            )
          })
        })
      }
    }),
    base(start, {
      id: 'QA-INFRA-cron-restart-after-stop',
      requirement: 'after stop(), start() returns a fresh handle and runs the boot reconcile again',
      oracle: 'cron-lifecycle',
      edgeTags: ['restart'],
      assertionIds: ['fresh-handle-and-boot'],
      mutation: 'cron-stop-keeps-handle',
      redAssertion: 'fresh-handle-and-boot',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          const first = start()
          await tick(0)
          await first.stop()
          const before = stamps(pool)
          const second = start()
          await tick(0)
          step('fresh-handle-and-boot', () => {
            assert.notEqual(second, first)
            assert.equal(stamps(pool), before + 1, 'restart did not run the boot reconcile')
          })
        })
      }
    }),
    base('cron-timer:hourly', {
      id: 'QA-INFRA-cron-hourly-expired-sweep-boundary',
      requirement: 'the expired-row sweep does not run before the hour and runs at the hour',
      oracle: 'cron-lifecycle',
      edgeTags: ['boundary', 'time-boundary'],
      assertionIds: ['before-hour-quiet', 'at-hour-sweeps'],
      mutation: 'cron-hourly-sweep-dropped',
      redAssertion: 'at-hour-sweeps',
      async run({ root }) {
        await withCron(root, {}, async ({ pool, start }) => {
          start()
          await tick(0)
          const swept = () => pool.queries.filter((q) => q.startsWith('delete from otp_code')).length
          await tick(3_600_000 - 1000)
          step('before-hour-quiet', () => assert.equal(swept(), 0, 'swept before the hour'))
          await tick(1000)
          step('at-hour-sweeps', () => assert.ok(swept() >= 1, 'no sweep at the hour'))
        })
      }
    }),
    base('cron-timer:daily', {
      id: 'QA-INFRA-cron-daily-host-sweep-time',
      requirement: 'the nightly host sweep calls each seat door once at 03:17 local time and not before',
      oracle: 'cron-lifecycle',
      edgeTags: ['time-boundary', 'boundary'],
      assertionIds: ['quiet-before-0317', 'sweeps-at-0317'],
      mutation: 'cron-daily-host-sweep-dropped',
      redAssertion: 'sweeps-at-0317',
      async run({ root }) {
        const hosts = new Map([['qa', { dshOrigin: 'http://dsh.qa.test', seatSecret: 'qa-seat-secret' }]])
        await withCron(
          root,
          { hosts, now: new Date(2026, 9, 5, 3, 16, 0).getTime() },
          async ({ fetches, start }) => {
            start()
            await tick(0)
            const sweeps = () => fetches.filter((u) => u.includes('/gateway/seat/sweep')).length
            await tick(30_000)
            step('quiet-before-0317', () => assert.equal(sweeps(), 0, 'swept at 03:16:30'))
            await tick(31_000)
            step('sweeps-at-0317', () => assert.equal(sweeps(), 1, `sweeps at 03:17:01: ${sweeps()}`))
          }
        )
      }
    })
  )

  const locks = 'cron-timer:hourly'
  cases.push(
    base(locks, {
      id: 'QA-INFRA-cron-sweep-concurrent-replica-lock',
      requirement:
        'when another replica holds the sweep lock this replica deletes nothing and gives its connection back',
      oracle: 'cron-lifecycle',
      edgeTags: ['concurrent', 'stale-lock'],
      assertionIds: ['skips-when-locked'],
      mutation: 'cron-lock-ignored',
      redAssertion: 'skips-when-locked',
      async run({ root }) {
        await withCron(root, { pool: { lockHeldElsewhere: true } }, async ({ cron, pool }) => {
          const result = await cron.sweepExpired(pool)
          step('skips-when-locked', () => {
            assert.equal(result.ran, false)
            assert.ok(
              !pool.queries.some((q) => q.startsWith('delete from')),
              'deleted while another replica held the lock'
            )
            assert.equal(pool.state.released, 1, 'connection not released')
          })
        })
      }
    }),
    base(locks, {
      id: 'QA-INFRA-cron-sweep-partial-failure-releases-lock',
      requirement:
        'a sweep whose query fails still releases the advisory lock and the connection (no stuck lock for other replicas)',
      oracle: 'cron-lifecycle',
      edgeTags: ['partial-failure', 'cleanup', 'stale-lock'],
      assertionIds: ['lock-released-after-failure'],
      mutation: 'cron-lock-not-released',
      redAssertion: 'lock-released-after-failure',
      async run({ root }) {
        await withCron(root, { pool: { failOn: 'delete from oauth_state' } }, async ({ cron, pool }) => {
          await assert.rejects(() => cron.sweepExpired(pool), /injected query failure/)
          step('lock-released-after-failure', () => {
            assert.ok(
              pool.queries.some((q) => q.startsWith('select pg_advisory_unlock')),
              'advisory lock never released'
            )
            assert.equal(pool.state.released, 1)
          })
        })
      }
    })
  )
  return cases
}
