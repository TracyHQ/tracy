/**
 * Two reads of ja-products at once write the same released questionnaire once, and neither throws.
 * Measured 21/10/2026 right after boot: the startup read in cron and a Refresh press in /ops both
 * missed the set in `known` and both inserted it; the second insert raised 23505 on
 * `question_set_released` (owner, sha256) and the door answered 500.
 *
 * Real Postgres: the race lives between one statement's conflict check and its index insert, which
 * no fake pool can reproduce. Both reads are held at the insert until both have arrived, then let
 * go together; with `on conflict (id)` about one round in four raised (71 of 300, measured on
 * Postgres 16), so twenty rounds miss it with odds near 1 in 300.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { createReleaseReadCache, syncReleases } from '../src/lib/quickstart-releases.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const sha = (c) => c.repeat(64)
const FILES = {
  'tracy-business-emdash-quickstart-1.0.0.zip': 'zip bytes',
  'tracy-business-emdash-state-1.0.0.tar.gz': 'tar bytes'
}
const setting = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  install: {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha('a') },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: sha('b') }
  }
}

/** ja-products with one release under `tag`, carrying a questionnaire. */
function github(tag) {
  const files = new Map()
  const body = {
    ...FILES,
    'tracy_setting.json': setting,
    'tracy_site_question.json': {
      schemaVersion: 'tracy-questions/v1',
      owner: tag,
      languages: ['en'],
      questions: [{ id: 'name', kind: 'text', step: 1, label: { en: 'Business name' }, feeds: ['site.name'] }]
    }
  }
  const assets = Object.entries(body).map(([name, value]) => {
    const url = `https://api.github.invalid/${tag}/${name}`
    files.set(url, typeof value === 'string' ? value : JSON.stringify(value))
    return { name, url, browser_download_url: url }
  })
  const list = [
    {
      tag_name: tag,
      name: tag,
      draft: false,
      prerelease: false,
      published_at: '2026-10-01T00:00:00Z',
      assets
    }
  ]
  return async (url) => {
    if (String(url).includes('/releases')) return new Response(JSON.stringify(list))
    const file = files.get(String(url))
    return file === undefined ? new Response('not found', { status: 404 }) : new Response(file)
  }
}

/** The shared pool, with every `insert into question_set` held until `count` reads have reached one. */
function barrier(pool, count) {
  let arrived = 0
  let open
  const gate = new Promise((resolve) => (open = resolve))
  return {
    query: async (sql, params) => {
      if (/^\s*insert into question_set/.test(sql)) {
        arrived += 1
        if (arrived === count) open()
        await gate
      }
      return pool.query(sql, params)
    }
  }
}

test('two reads at once record a released questionnaire once, and neither throws', dbOpts, async () => {
  for (let round = 0; round < 20; round += 1) {
    const tag = `tracy-business/emdash-race-${round}`
    const fetchImpl = github(tag)
    const held = barrier(db.pool, 2)
    // eslint-disable-next-line no-await-in-loop -- each round is one race; they must not overlap.
    const reads = await Promise.allSettled([
      syncReleases(held, { token: 't', fetchImpl, cache: createReleaseReadCache() }),
      syncReleases(held, { token: 't', fetchImpl, cache: createReleaseReadCache() })
    ])
    const thrown = reads.filter((r) => r.status === 'rejected').map((r) => r.reason)
    assert.deepEqual(
      thrown.map((e) => `${e.code} ${e.constraint ?? ''} ${e.message}`),
      [],
      `round ${round}: a concurrent read threw`
    )
    for (const r of reads) assert.equal(r.status === 'fulfilled' && r.value.ok, true)
    // eslint-disable-next-line no-await-in-loop -- same.
    const { rows } = await db.pool.query(
      `select count(*)::int as n from question_set where owner = $1 and source = 'released'`,
      [tag]
    )
    assert.equal(rows[0].n, 1, `round ${round}: the set is recorded exactly once`)
  }
})
