// The change feed under contention: many publishers committing at once through the one counter row, with a reader
// following the feed meanwhile. Positions stay contiguous and the reader, page after page, sees every one exactly
// once: none drawn below a position it already passed. Throughput numbers: `scripts/bench-hub-feed.mjs`.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { appendChange, readFeed } from '../src/hub/feed.js'
import { migrate } from '../src/schema/index.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const PUBLISHERS = 16
const EACH = 10

let db
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
})
after(async () => db?.close())

async function publish(pool) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await appendChange(client, { kind: 'upsert', placeId: randomUUID(), revision: 1 })
    // Hold the transaction open a moment after the append, as a publish does until its commit.
    await client.query('select pg_sleep(0.002)')
    await client.query('commit')
  } finally {
    client.release()
  }
}

test(
  'concurrent publishers get contiguous positions and a reader following the feed misses none',
  opts,
  async () => {
    let cursor = (await readFeed(db.pool, 'changes')).cursor
    const seen = []
    let done = false
    const reader = (async () => {
      for (;;) {
        const page = await readFeed(db.pool, 'changes', { cursor, limit: 7 })
        seen.push(...page.events.map((e) => e.placeId))
        cursor = page.cursor
        if (done && !page.more && !page.events.length) return
      }
    })()
    await Promise.all(
      Array.from({ length: PUBLISHERS }, async () => {
        for (let i = 0; i < EACH; i++) await publish(db.pool)
      })
    )
    done = true
    await reader

    const { rows } = await db.pool.query('select seq, place_id from wo_hub_change order by seq')
    assert.equal(rows.length, PUBLISHERS * EACH)
    assert.deepEqual(
      rows.map((r) => Number(r.seq)),
      Array.from({ length: PUBLISHERS * EACH }, (_, i) => i + 1)
    )
    assert.deepEqual(
      seen,
      rows.map((r) => r.place_id),
      'the reader saw every change once, in position order'
    )
  }
)
