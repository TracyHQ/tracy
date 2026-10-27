#!/usr/bin/env node
/**
 * How the hub change feed's single counter row (`wo_hub_feed_state`, `src/hub/feed.js`) holds up when many
 * publishers commit at once. Each publisher runs transactions shaped like a publish: one snapshot-sized write, then
 * `appendChange` as the last write, then commit, so the counter lock is held from the append to the commit.
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/postgres node scripts/bench-hub-feed.mjs [--publishers 8,32] [--each 100]
 *
 * Each count runs twice: with the feed append, and without it (the same write and commit), so the share of the latency
 * the counter row adds is visible apart from what the server and machine cost anyway.
 *
 * It creates a database of its own on that server (needs CREATEDB), migrates it, measures, and drops it. Prints one
 * line per publisher count: publishes per second and the p50/p95/p99 latency of one publish transaction.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { appendChange } from '../src/hub/feed.js'
import { migrate } from '../src/schema/index.js'

const { values } = parseArgs({
  options: { publishers: { type: 'string', default: '8,32' }, each: { type: 'string', default: '100' } }
})
const counts = values.publishers.split(',').map(Number)
const each = Number(values.each)
if (!process.env.DATABASE_URL) {
  console.error('set DATABASE_URL')
  process.exit(2)
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

async function publish(pool, feed) {
  const client = await pool.connect()
  const started = performance.now()
  try {
    await client.query('begin')
    const placeId = randomUUID()
    await client.query('insert into bench_snapshot (place_id, body) values ($1, $2::jsonb)', [
      placeId,
      JSON.stringify({ name: 'Cafe', fields: randomBytes(512).toString('hex') })
    ])
    if (feed)
      await appendChange(client, { kind: 'upsert', placeId, revision: 1, detail: { contentChanged: true } })
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  return performance.now() - started
}

async function run(url, publishers, feed) {
  const pool = new pg.Pool({ connectionString: url, max: publishers })
  // Open every connection first, so connection setup is not measured.
  await Promise.all(Array.from({ length: publishers }, () => pool.query('select 1')))
  const latencies = []
  const started = performance.now()
  await Promise.all(
    Array.from({ length: publishers }, async () => {
      for (let i = 0; i < each; i++) latencies.push(await publish(pool, feed))
    })
  )
  const seconds = (performance.now() - started) / 1000
  await pool.end()
  latencies.sort((a, b) => a - b)
  return {
    publishers,
    feed,
    publishes: latencies.length,
    perSecond: Math.round(latencies.length / seconds),
    p50: quantile(latencies, 0.5),
    p95: quantile(latencies, 0.95),
    p99: quantile(latencies, 0.99)
  }
}

const name = `wo_bench_${randomBytes(4).toString('hex')}`
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
await admin.query(`create database ${name}`)
const url = new URL(process.env.DATABASE_URL)
url.pathname = `/${name}`
try {
  const setup = new pg.Pool({ connectionString: url.toString(), max: 1 })
  await migrate(setup)
  await setup.query(
    'create table bench_snapshot (id bigserial primary key, place_id uuid not null, body jsonb not null)'
  )
  await setup.end()
  for (const n of counts) {
    for (const feed of [true, false]) {
      const r = await run(url.toString(), n, feed)
      console.log(
        `${r.publishers} publishers ${feed ? 'with the feed   ' : 'without the feed'}, ${r.publishes} publishes: ` +
          `${r.perSecond}/s, p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, p99 ${r.p99.toFixed(1)} ms`
      )
    }
  }
} finally {
  await admin.query(`drop database if exists ${name} with (force)`).catch(() => {})
  await admin.end()
}
