import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { dbClock, seedRealCampaign, withRealDb } from './_invitations-real.mjs'
import {
  extendCampaign,
  getRetention,
  setRetention,
  sweepRealCampaigns
} from '../src/invitations/real-retention.js'
import { realTransaction } from '../src/invitations/real-store.js'
import { sweepExpired } from '../src/cron.js'
import { previewRealImport } from '../src/invitations/real-import.js'
import { syntheticSnapshot } from './_invitations-real.mjs'

const options = { skip: !process.env.TEST_DATABASE_URL }
const actorId = randomUUID()
test('a missing live key cannot block expired previews, orphan keys or later campaigns', options, async () =>
  withRealDb(async ({ pool, keys, root }) => {
    const broken = await seedRealCampaign({ pool, keys })
    await unlink(join(root, broken.id, 'key.json'))
    const preview = await previewRealImport({
      pool,
      keys,
      csvBytes: syntheticSnapshot({ total: 1 }).csvBytes,
      name: 'Synthetic',
      sourceDate: '2026-10-07',
      actorId
    })
    await pool.query(
      "update invitations_real_import set expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [preview.previewId]
    )
    const orphan = randomUUID(),
      now = await dbClock(pool)
    await keys.create({
      campaignId: orphan,
      now: new Date(Date.parse(now) - 2000).toISOString(),
      initialImportedAt: new Date(Date.parse(now) - 2000).toISOString(),
      expiresAt: new Date(Date.parse(now) - 1000).toISOString()
    })
    await sweepRealCampaigns({ pool, keys, limit: 1 })
    assert.equal(
      (
        await pool.query('select count(*)::int as n from invitations_real_import where id=$1', [
          preview.previewId
        ])
      ).rows[0].n,
      0
    )
    await assert.rejects(() => keys.read({ campaignId: orphan, now }), { code: 'REAL_EXPIRED' })
    const later = await seedRealCampaign({ pool, keys })
    await keys.revoke({ campaignId: later.id, now })
    assert.equal((await sweepRealCampaigns({ pool, keys, limit: 1 })).purged, 1)
  })
)
test('expiry during extension rolls back and permanently revokes the extended ledger', options, async () =>
  withRealDb(async ({ pool, keys }) => {
    const c = await seedRealCampaign({ pool, keys })
    const oldExpiry = (
      await pool.query("select clock_timestamp()+interval '500 milliseconds' as t")
    ).rows[0].t.toISOString()
    await pool.query('update invitations_real_campaign set expires_at=$2 where id=$1', [c.id, oldExpiry])
    const slowKeys = {
      ...keys,
      async extend(input) {
        await keys.extend(input)
        await pool.query(
          'select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.02)',
          [oldExpiry]
        )
      }
    }
    await assert.rejects(
      () =>
        extendCampaign({
          pool,
          keys: slowKeys,
          campaignId: c.id,
          revision: 1,
          expiresAt: new Date(Date.parse(c.firstImportedAt) + 60 * 86400000).toISOString(),
          actorId
        }),
      { code: 'REAL_EXPIRED' }
    )
    const row = (
      await pool.query('select revision,expires_at from invitations_real_campaign where id=$1', [c.id])
    ).rows[0]
    assert.equal(Number(row.revision), 1)
    assert.equal(row.expires_at.toISOString(), oldExpiry)
    await pool.query('update invitations_real_campaign set expires_at=$2 where id=$1', [c.id, c.expiresAt])
    await assert.rejects(async () => keys.read({ campaignId: c.id, now: await dbClock(pool) }), {
      code: 'REAL_EXPIRED'
    })
  })
)
test('retention defaults and settings apply only to future imports', options, async () =>
  withRealDb(async ({ pool, keys }) => {
    assert.equal(await getRetention({ db: pool }), 30)
    for (const days of [0, 366, 1.5, NaN, '30'])
      await assert.rejects(() => setRetention({ db: pool, days, actorId }))
    const c = await seedRealCampaign({ pool, keys })
    await setRetention({ db: pool, days: 60, actorId })
    assert.equal(await getRetention({ db: pool }), 60)
    assert.equal(
      (
        await pool.query('select expires_at from invitations_real_campaign where id=$1', [c.id])
      ).rows[0].expires_at.toISOString(),
      c.expiresAt
    )
  })
)

test(
  'extension is audited, revision bound, explicit and limited to the initial import plus 365 days',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await seedRealCampaign({ pool, keys })
      const expiresAt = new Date(Date.parse(c.firstImportedAt) + 365 * 86400000).toISOString()
      const input = { pool, keys, campaignId: c.id, revision: 1, expiresAt, actorId }
      await assert.rejects(() =>
        extendCampaign({ ...input, expiresAt: new Date(Date.parse(expiresAt) + 1).toISOString() })
      )
      await assert.rejects(() => extendCampaign({ ...input, expiresAt: c.expiresAt }))
      const result = await extendCampaign(input)
      assert.equal(result.revision, 2)
      assert.equal(result.expiresAt, expiresAt)
      assert.equal((await keys.read({ campaignId: c.id, now: await dbClock(pool) })).expiresAt, expiresAt)
      await assert.rejects(() => extendCampaign(input), { code: 'REAL_STALE_REVISION' })
      assert.equal(
        (
          await pool.query(
            "select count(*)::int as n from invitations_real_audit where campaign_id=$1 and action='retention_extended'",
            [c.id]
          )
        ).rows[0].n,
        1
      )
    })
)

test(
  'effective expiry is the earlier DB or ledger deadline, including a rolled-back extension',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await seedRealCampaign({ pool, keys })
      const now = await dbClock(pool)
      await keys.extend({
        campaignId: c.id,
        now,
        expiresAt: new Date(Date.parse(c.firstImportedAt) + 60 * 86400000).toISOString()
      })
      await pool.query(
        "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [c.id]
      )
      await assert.rejects(
        () => extendCampaign({ pool, keys, campaignId: c.id, revision: 1, expiresAt: c.expiresAt, actorId }),
        { code: 'REAL_EXPIRED' }
      )
      await pool.query('update invitations_real_campaign set expires_at=$2 where id=$1', [c.id, c.expiresAt])
      await assert.rejects(() => realTransaction({ pool, keys, campaignId: c.id, write: false }, () => {}))
    })
)

test(
  'bounded retention sweep revokes before purging ciphertext and keeps only aggregate metadata',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const cs = []
      for (let i = 0; i < 3; i++) cs.push(await seedRealCampaign({ pool, keys }))
      await pool.query(
        "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second',counts=$1",
        [{ total: 5, groups: [1, 1, 1, 1, 1], suppressed: 1, recheck: 4 }]
      )
      assert.deepEqual(await sweepRealCampaigns({ pool, keys, limit: 2 }), {
        expired: 2,
        purged: 2,
        keyErrors: []
      })
      assert.deepEqual(await sweepRealCampaigns({ pool, keys, limit: 2 }), {
        expired: 1,
        purged: 1,
        keyErrors: []
      })
      assert.deepEqual(await sweepRealCampaigns({ pool, keys, limit: 2 }), {
        expired: 0,
        purged: 0,
        keyErrors: []
      })
      const rows = (await pool.query('select payload,counts,tombstoned_at from invitations_real_campaign'))
        .rows
      assert.equal(rows.length, 3)
      for (const row of rows) {
        assert.equal(row.payload, null)
        assert.equal(row.counts.total, 5)
        assert.ok(row.tombstoned_at)
      }
      for (const c of cs) {
        const now = await dbClock(pool)
        await assert.rejects(() => keys.read({ campaignId: c.id, now }))
        await pool.query(
          'update invitations_real_campaign set expires_at=$2,tombstoned_at=null where id=$1',
          [c.id, c.expiresAt]
        )
        await assert.rejects(() => realTransaction({ pool, keys, campaignId: c.id, write: false }, () => {}))
      }
    })
)

test(
  'bounded sweeps eventually inspect a restored later-deadline campaign behind live campaigns',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      await seedRealCampaign({ pool, keys, days: 10 })
      await seedRealCampaign({ pool, keys, days: 20 })
      const c = await seedRealCampaign({ pool, keys, days: 30 })
      await keys.revoke({ campaignId: c.id, now: await dbClock(pool) })
      let purged = 0
      for (let i = 0; i < 3; i++) purged += (await sweepRealCampaigns({ pool, keys, limit: 1 })).purged
      assert.equal(purged, 1)
      assert.equal(
        (await pool.query('select payload from invitations_real_campaign where id=$1', [c.id])).rows[0]
          .payload,
        null
      )
    })
)

test(
  'the existing expiry sweep purges real campaigns only with explicitly provided keys',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await seedRealCampaign({ pool, keys })
      await pool.query(
        "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [c.id]
      )
      assert.deepEqual(await sweepExpired(pool), { ran: true, realSweepError: null, realKeyErrors: [] })
      assert.ok(
        (await pool.query('select payload from invitations_real_campaign where id=$1', [c.id])).rows[0]
          .payload
      )
      assert.deepEqual(await sweepExpired(pool, { invitationsRealKeys: keys }), {
        ran: true,
        realSweepError: null,
        realKeyErrors: []
      })
      assert.equal(
        (await pool.query('select payload from invitations_real_campaign where id=$1', [c.id])).rows[0]
          .payload,
        null
      )
    })
)
