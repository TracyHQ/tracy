// Scratch Postgres, synthetic websites, and no provider/network calls.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileDb } from './_db.mjs'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { joinPlace } from 'website-opportunities/src/place-jobs.js'
import { resolvePlace } from 'website-opportunities/src/places.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

// Schedule real advisory-lock attempts in order. All tick callers have already entered
// their asynchronous claim path, but each claim sees the preceding real lock released.
function orderedClaims(pool) {
  let tail = Promise.resolve()
  return {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect()
      let releaseTurn
      return {
        release: () => client.release(),
        async query(sql, args) {
          if (typeof sql === 'string' && sql.startsWith('select pg_try_advisory_lock(')) {
            const preceding = tail
            tail = new Promise((resolve) => {
              releaseTurn = resolve
            })
            await preceding
          }
          try {
            return await client.query(sql, args)
          } finally {
            if (typeof sql === 'string' && sql.startsWith('select pg_advisory_unlock(')) releaseTurn?.()
          }
        }
      }
    }
  }
}

test(
  'concurrent ticks count in-flight claims against executor capacity before website work starts',
  opts,
  async () => {
    for (let n = 0; n < 6; n++) {
      const placeId = await resolvePlace(db.pool, {
        provider: 'url',
        providerId: `https://concurrency-${n}.example.test/`,
        name: `Synthetic restaurant ${n}`
      })
      const client = await db.pool.connect()
      try {
        await client.query('begin')
        await joinPlace(client, placeId)
        await client.query('commit')
      } finally {
        client.release()
      }
    }
    let releaseCollectors
    const holdCollectors = new Promise((resolve) => {
      releaseCollectors = resolve
    })
    let entered = 0
    let active = 0
    let peak = 0
    const real = await websiteOpportunitiesDomain()
    const domain = {
      ...real,
      connectorsFor: () => ({
        website: {
          available: true,
          async collect() {
            entered++
            active++
            peak = Math.max(peak, active)
            try {
              await holdCollectors
              return {
                status: 'complete',
                coverage: { fetched: 1 },
                profile: { name: 'Synthetic observed restaurant', links: [] },
                pages: [],
                media: []
              }
            } finally {
              active--
            }
          }
        }
      })
    }
    const ex = createExecutor({
      host: woHost,
      pool: orderedClaims(db.pool),
      shared: true,
      concurrency: 2,
      loadDomain: async () => domain,
      runtime: async () => ({
        keys: { google: null, apify: null },
        settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
      }),
      objects: null,
      switchOn: async () => true,
      fetchImpl: async () => {
        throw new Error('Unexpected network')
      },
      log: { warn() {}, error() {} }
    })
    let ticks = []
    try {
      ticks = await Promise.all(Array.from({ length: 6 }, () => ex.tick()))
      const claimed = ticks.filter((t) => t.claimed)
      const deadline = Date.now() + 3000
      while (entered < claimed.length && Date.now() < deadline) await delay(5)
      assert.equal(entered, claimed.length, 'Every claimed place reaches the held synthetic connector')
      assert.ok(claimed.length <= 2, `Concurrency 2 admitted ${claimed.length} overlapping jobs`)
      assert.equal(peak, 2, 'The two configured slots can both collect while the rest stay queued')
      const states = (await db.pool.query(`select state,count(*)::int as n from wo_place_job group by state`))
        .rows
      assert.equal(states.find((s) => s.state === 'running')?.n, 2)
      assert.equal(states.find((s) => s.state === 'queued')?.n, 4)
    } finally {
      releaseCollectors()
      await Promise.all(ticks.map((t) => t.done))
      await ex.idle()
    }
  }
)
