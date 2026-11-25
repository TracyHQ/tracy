// The write step bench's site record in Postgres (src/write-step/bench-site-store.js): `others` lists every earlier site
// the bench made and did not remove, and with `startedBy` only those of that label, so a bench line of its own (the chain
// build replay, `--keep-others`) never deletes another's trial site. Needs TEST_DATABASE_URL.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { pgBenchSiteStore } from '../src/write-step/bench-site-store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

const spec = { quickstart: 'quickstart/ja-diner/j6', contract: 'ja-diner/j6/1.0.8' }

test('others lists every earlier site, or only those started under one label', opts, async () => {
  const store = pgBenchSiteStore(db.pool)
  const theirs = await store.begin({ label: 'write-bench-aaa111', ...spec, startedBy: 'cli' })
  const replay = await store.begin({ label: 'write-bench-bbb222', ...spec, startedBy: 'cli:chain-replay' })
  const gone = await store.begin({ label: 'write-bench-ccc333', ...spec, startedBy: 'cli:chain-replay' })
  await store.settle(gone.id, { status: 'removed' })
  const current = await store.begin({ label: 'write-bench-ddd444', ...spec, startedBy: 'cli:chain-replay' })

  const all = await store.others(current.id)
  assert.deepEqual(
    all.map((r) => r.id),
    [theirs.id, replay.id]
  )
  const own = await store.others(current.id, { startedBy: 'cli:chain-replay' })
  assert.deepEqual(
    own.map((r) => r.id),
    [replay.id]
  )
})
