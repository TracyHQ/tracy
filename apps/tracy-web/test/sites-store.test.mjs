import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import {
  siteByKey,
  siteByLabel,
  createSite,
  setHost,
  setPort,
  setAddress,
  setAttached,
  setGuestOpen,
  deleteSite,
  putJob,
  updateJob,
  jobById,
  audit
} from '../src/sites/store.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

test(
  'createSite/siteByKey/siteByLabel: a fresh key is claimed, and a second insert of the same key is refused (on conflict do nothing)',
  opts,
  async () => {
    const { pool } = db
    const row = await createSite(pool, {
      siteKey: 'x.y',
      label: 'x-y-00000000',
      host: 'local',
      platform: 'wordpress'
    })
    assert.equal(row.site_key, 'x.y')
    assert.equal(row.attached, false)
    assert.equal(row.publish, 'draft')

    const again = await createSite(pool, { siteKey: 'x.y', label: 'other-label', host: 'local' })
    assert.equal(again, null, 'a second claim of the same site_key returns null, not an overwrite')

    assert.deepEqual(await siteByKey(pool, 'x.y'), row)
    assert.deepEqual(await siteByLabel(pool, 'x-y-00000000'), row)
    assert.equal(await siteByKey(pool, 'nowhere.y'), null)
    assert.equal(await siteByLabel(pool, 'nowhere'), null)
  }
)

test(
  'setHost/setPort/setAddress/setAttached/setGuestOpen: each writes exactly its own column',
  opts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'x.y', label: 'x-y-00000000', host: 'local' })
    await setHost(pool, 'x.y', 'contabo')
    await setPort(pool, 'x.y', 8123)
    await setAddress(pool, 'x.y', { address: 'https://x-y-00000000.tracy.ai/', publish: 'published' })
    await setAttached(pool, 'x.y', true)
    await setGuestOpen(pool, 'x.y', true)

    const row = await siteByKey(pool, 'x.y')
    assert.equal(row.host, 'contabo')
    assert.equal(row.port, 8123)
    assert.equal(row.address, 'https://x-y-00000000.tracy.ai/')
    assert.equal(row.publish, 'published')
    assert.equal(row.attached, true)
    assert.equal(row.guest_open, true)
  }
)

test(
  'deleteSite: the row is gone, and a second delete of the same key is a harmless no-op',
  opts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'x.y', label: 'x-y-00000000', host: 'local' })
    await deleteSite(pool, 'x.y')
    assert.equal(await siteByKey(pool, 'x.y'), null)
    await assert.doesNotReject(deleteSite(pool, 'x.y'))
  }
)

test(
  'putJob/jobById/updateJob: a job starts queued, and an update only ever touches state/step/detail',
  opts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'x.y', label: 'x-y-00000000', host: 'local' })
    await putJob(pool, { id: 'job-1', siteKey: 'x.y', host: 'local', kind: 'provision' })
    const queued = await jobById(pool, 'job-1')
    assert.equal(queued.state, 'queued')
    assert.equal(queued.site_key, 'x.y')
    assert.equal(queued.host, 'local')
    assert.equal(queued.kind, 'provision')
    assert.equal(queued.step, null)

    // A second `putJob` of the same id is a no-op (`on conflict do nothing`) — the row a poll
    // reads back is the one the FIRST accepted call wrote, not a later duplicate.
    await putJob(pool, { id: 'job-1', siteKey: 'z.y', host: 'other', kind: 'teardown' })
    assert.equal((await jobById(pool, 'job-1')).site_key, 'x.y')

    const updated = await updateJob(pool, 'job-1', { state: 'running', step: 'seed' })
    assert.equal(updated.state, 'running')
    assert.equal(updated.step, 'seed')
    assert.equal(updated.detail, null)
    assert.ok(updated.updated_at >= queued.updated_at)

    const done = await updateJob(pool, 'job-1', { state: 'done', detail: { port: 8123 } })
    assert.equal(done.state, 'done')
    // `step` was not passed this time — coalesce keeps the value the previous update left.
    assert.equal(done.step, 'seed')
    assert.deepEqual(done.detail, { port: 8123 })

    assert.equal(await updateJob(pool, 'unknown-job', { state: 'done' }), null)
    assert.equal(await jobById(pool, 'unknown-job'), null)
  }
)

test('audit: one row per call, with a null actor/detail when none is given', opts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'x.y', label: 'x-y-00000000', host: 'local' })
  await audit(pool, {
    actor: 'ceo@tracy.ai',
    action: 'provision',
    siteKey: 'x.y',
    detail: { platform: 'wordpress' }
  })
  await audit(pool, { action: 'sweep' })
  const { rows } = await pool.query('select * from audit order by id asc')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].actor, 'ceo@tracy.ai')
  assert.equal(rows[0].action, 'provision')
  assert.equal(rows[0].site_key, 'x.y')
  assert.deepEqual(rows[0].detail, { platform: 'wordpress' })
  assert.equal(rows[1].actor, null)
  assert.equal(rows[1].site_key, null)
  assert.equal(rows[1].detail, null)
})
