import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { dbClock, seedRealCampaign, withRealDb } from './_invitations-real.mjs'
import { realTransaction } from '../src/invitations/real-store.js'
import { open } from '../src/invitations/real-crypto.js'

const options = { skip: !process.env.TEST_DATABASE_URL }
test('fresh real schema keeps customer content encrypted and has every separate store', options, async () =>
  withRealDb(async ({ pool, keys }) => {
    const campaign = await seedRealCampaign({ pool, keys })
    for (const suffix of [
      'setting',
      'campaign',
      'recipient',
      'identity',
      'import',
      'template',
      'asset',
      'draft',
      'audit'
    ]) {
      await pool.query(`select 1 from invitations_real_${suffix} limit 1`)
    }
    const dump = (await pool.query('select row_to_json(c)::text as data from invitations_real_campaign c'))
      .rows[0].data
    for (const canary of [
      'Synthetic canary company',
      'canary@example.test',
      'Synthetic canary body',
      'Synthetic canary image'
    ])
      assert.ok(!dump.includes(canary))
    const result = await realTransaction(
      { pool, keys, campaignId: campaign.id, write: false },
      async (_db, { row, key, now }) => {
        assert.equal(row.revision, 1)
        assert.ok(Date.parse(now) >= Date.parse(campaign.firstImportedAt))
        return JSON.parse(
          open({
            key,
            context: { campaignId: campaign.id, recordId: campaign.id, purpose: 'campaign', version: 1 },
            envelope: row.payload
          }).toString()
        ).email
      }
    )
    assert.equal(result, 'canary@example.test')
  })
)

test(
  'writes require revision and roll back callback failures without advancing the campaign',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await seedRealCampaign({ pool, keys })
      const input = { pool, keys, campaignId: c.id, write: true, expectedRevision: 1 }
      await assert.rejects(() => realTransaction({ ...input, expectedRevision: undefined }, () => {}))
      await assert.rejects(
        () =>
          realTransaction(input, async (db) => {
            await db.query('update invitations_real_campaign set source_date=$2 where id=$1', [
              c.id,
              '2026-10-08'
            ])
            throw new Error('Synthetic rollback')
          }),
        /Synthetic rollback/
      )
      const row = (
        await pool.query('select revision,source_date::text from invitations_real_campaign where id=$1', [
          c.id
        ])
      ).rows[0]
      assert.equal(Number(row.revision), 1)
      assert.equal(row.source_date, '2026-10-07')
      assert.equal(await realTransaction(input, () => 'saved'), 'saved')
      await assert.rejects(() => realTransaction(input, () => {}), { code: 'REAL_STALE_REVISION' })
    })
)

test('concurrent writes serialize and only one revision-bound request wins', options, async () =>
  withRealDb(async ({ pool, keys }) => {
    const c = await seedRealCampaign({ pool, keys })
    const input = { pool, keys, campaignId: c.id, expectedRevision: 1, write: true }
    const results = await Promise.allSettled([
      realTransaction(input, () => 1),
      realTransaction(input, () => 2)
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'REAL_STALE_REVISION')
  })
)

test('database expiry and revoked or absent keys refuse before revealing a row', options, async () =>
  withRealDb(async ({ pool, keys }) => {
    for (const mode of ['expired', 'revoked', 'missing']) {
      const c = await seedRealCampaign({ pool, keys })
      if (mode === 'expired')
        await pool.query(
          "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
          [c.id]
        )
      if (mode === 'revoked') await keys.revoke({ campaignId: c.id, now: await dbClock(pool) })
      const campaignId = mode === 'missing' ? randomUUID() : c.id
      let called = false
      await assert.rejects(() =>
        realTransaction({ pool, keys, campaignId, write: false }, () => {
          called = true
        })
      )
      assert.equal(called, false)
    }
  })
)

test(
  'expiry during a write rolls back its content and permanently revokes the campaign key',
  options,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await seedRealCampaign({ pool, keys })
      let called = false
      await assert.rejects(
        () =>
          realTransaction({ pool, keys, campaignId: c.id, expectedRevision: 1, write: true }, async (db) => {
            called = true
            await db.query(
              "update invitations_real_campaign set expires_at=clock_timestamp()+interval '200 milliseconds' where id=$1",
              [c.id]
            )
            await db.query("update invitations_real_campaign set source_date='2026-10-08' where id=$1", [
              c.id
            ])
            await db.query('select pg_sleep(0.3)')
          }),
        { code: 'REAL_EXPIRED' }
      )
      assert.equal(called, true)
      assert.equal(
        (await pool.query('select source_date::text from invitations_real_campaign where id=$1', [c.id]))
          .rows[0].source_date,
        '2026-10-07'
      )
      // Simulate restoring a pre-expiry database row, without restoring the vault.
      await pool.query('update invitations_real_campaign set expires_at=$2 where id=$1', [c.id, c.expiresAt])
      await assert.rejects(() => realTransaction({ pool, keys, campaignId: c.id, write: false }, () => {}))
    })
)
