// A picture bench run after a redeploy (#340): the process dies mid-run and the lease lapses; the next worker claims
// the run again and resumes from what was saved. Killed before round 0 was checked, it repeats the same code work and
// writes the same files once (stored by hash, one row per file); killed after round 0 was checked, it redoes nothing
// and only ends the run. No model is called.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { filesOf, readRun } from '../src/site-pictures/bench-store.js'
import { createSitePicturesQueue } from '../src/site-pictures/bench-worker.js'
import { fileDb } from './_db.mjs'
import { drain, kitIndex, noModel, quiet, startRun, storeDir } from './_site-pictures-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)
const store = storeDir()
after(store.done)
const where = { index: kits.index, dir: store.dir }

/** One worker that dies at the first query `dies(sql, params)` matches: the lease moves on, nothing after is written. */
async function drainDying(pool, dies) {
  let dead = false
  const watched = new Proxy(pool, {
    get: (target, key) =>
      key === 'query'
        ? async (sql, params) => {
            if (!dead && dies(String(sql), params)) {
              dead = true
              await target.query('update site_picture_run set lease_token = lease_token + 1')
              throw new Error('killed')
            }
            return target.query(sql, params)
          }
        : target[key]
  })
  await createSitePicturesQueue({
    pool: watched,
    index: kits.index,
    storeDir: store.dir,
    fetchImpl: noModel,
    log: quiet
  })
    .drain()
    .catch(() => {})
  assert.ok(dead, 'the worker died where the test said')
  await pool.query(`update site_picture_run set lease_until = now() - interval '1 second'`)
}

const savingChecked = (sql, params) => /insert into site_picture_round/.test(sql) && params?.[2] === 'checked'

test(
  'killed before round 0 is checked: the next claim repeats the code work, files are written once',
  opts,
  async () => {
    const { pool } = db
    const started = await startRun(pool, where)
    await drainDying(pool, savingChecked)
    const before = await filesOf(pool, started.id)
    assert.ok(before.length > 0, 'the files were stored before the process died')
    assert.equal((await readRun(pool, started.id)).status, 'queued')

    await drain(pool, where)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.attempts, 2)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [[0, 'checked']]
    )
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
    // The same files: the code work is deterministic and every file is kept once.
    const after_ = await filesOf(pool, started.id)
    assert.deepEqual(after_.map((f) => f.sha256).sort(), before.map((f) => f.sha256).sort())
    const placed = [...run.rounds[0].pictures.frames, ...run.rounds[0].pictures.siteSettings].filter(
      (e) => e.file
    )
    assert.deepEqual(new Set(after_.map((f) => f.sha256)), new Set(placed.map((e) => e.sha256)))
  }
)

test('killed after round 0 was checked: the next claim redoes nothing and ends the run', opts, async () => {
  const { pool } = db
  const started = await startRun(pool, where)
  let checked = false
  await drainDying(pool, (sql, params) => {
    if (savingChecked(sql, params)) checked = true
    // The first write after the round was saved: the run's finish.
    return checked && /update site_picture_run set/.test(sql) && params?.includes?.('succeeded')
  })
  const saved = await readRun(pool, started.id)
  assert.equal(saved.status, 'queued')
  assert.equal(saved.rounds[0].state, 'checked')
  const manifest = saved.rounds[0].pictures

  let fileWrites = 0
  const counting = new Proxy(pool, {
    get: (target, key) =>
      key === 'query'
        ? (sql, params) => {
            if (/insert into site_picture_file/.test(String(sql))) fileWrites += 1
            return target.query(sql, params)
          }
        : target[key]
  })
  await drain(counting, where)
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(fileWrites, 0, 'no code work was redone')
  assert.deepEqual(run.rounds[0].pictures, manifest)
})
