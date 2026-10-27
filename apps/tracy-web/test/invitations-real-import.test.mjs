import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { dbClock, withRealDb, syntheticSnapshot, snapshotCsv } from './_invitations-real.mjs'
import {
  previewRealImport,
  commitRealImport,
  listRealRecipients,
  readRealRecipient
} from '../src/invitations/real-import.js'

const opts = { skip: !process.env.TEST_DATABASE_URL }
const actorId = randomUUID()
test('supplementary CSV preview TTL cannot outlive its campaign', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const { campaign: c } = await importSynthetic({ pool, keys, fixture: syntheticSnapshot({ total: 1 }) })
    const expiry = (
      await pool.query("select clock_timestamp()+interval '1 minute' as t")
    ).rows[0].t.toISOString()
    await pool.query('update invitations_real_campaign set expires_at=$2 where id=$1', [c.id, expiry])
    const p = await previewRealImport({
      pool,
      keys,
      campaignId: c.id,
      csvBytes: syntheticSnapshot({ total: 1, offset: 5 }).csvBytes,
      name: 'Synthetic',
      sourceDate: '2026-10-07',
      actorId
    })
    assert.equal(p.expiresAt, expiry)
    assert.equal((await keys.read({ campaignId: p.previewId, now: await dbClock(pool) })).expiresAt, expiry)
  })
)
for (const reason of ['expired', 'revoked'])
  test(
    `supplementary CSV preview rolls back and revokes staged key when campaign is ${reason} during persistence`,
    opts,
    async () =>
      withRealDb(async ({ pool, keys }) => {
        const { campaign: c } = await importSynthetic({
          pool,
          keys,
          fixture: syntheticSnapshot({ total: 1 })
        })
        let stagedId
        const raceKeys = {
          ...keys,
          async create(input) {
            stagedId = input.campaignId
            await keys.create(input)
            if (reason === 'revoked') await keys.revoke({ campaignId: c.id, now: await dbClock(pool) })
          }
        }
        if (reason === 'expired')
          await pool.query(
            `create function synthetic_preview_expire() returns trigger language plpgsql as $$ begin update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id='${c.id}'; return new; end $$; create trigger synthetic_preview_expire before insert on invitations_real_import for each row execute function synthetic_preview_expire()`
          )
        await assert.rejects(
          () =>
            previewRealImport({
              pool,
              keys: raceKeys,
              campaignId: c.id,
              csvBytes: syntheticSnapshot({ total: 1, offset: 5 }).csvBytes,
              name: 'Synthetic',
              sourceDate: '2026-10-07',
              actorId
            }),
          { code: 'REAL_EXPIRED' }
        )
        assert.equal(
          (
            await pool.query(
              "select count(*)::int as n from invitations_real_import where campaign_id=$1 and status='preview'",
              [c.id]
            )
          ).rows[0].n,
          0
        )
        await assert.rejects(async () => keys.read({ campaignId: stagedId, now: await dbClock(pool) }), {
          code: 'REAL_EXPIRED'
        })
      })
  )
test('supplementary import rechecks preview expiry before publishing its rows', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const { campaign: c } = await importSynthetic({ pool, keys, fixture: syntheticSnapshot({ total: 1 }) })
    const p = await previewRealImport({
      pool,
      keys,
      campaignId: c.id,
      csvBytes: syntheticSnapshot({ total: 1, offset: 5 }).csvBytes,
      name: 'Synthetic',
      sourceDate: '2026-10-07',
      actorId
    })
    await pool.query(
      `create function synthetic_expire_preview() returns trigger language plpgsql as $$ begin update invitations_real_import set expires_at=clock_timestamp()-interval '1 second' where id='${p.previewId}'; return new; end $$; create trigger synthetic_expire before insert on invitations_real_recipient for each row execute function synthetic_expire_preview()`
    )
    await assert.rejects(
      () =>
        commitRealImport({
          pool,
          keys,
          previewId: p.previewId,
          digest: p.digest,
          revision: p.revision,
          requestKey: randomUUID(),
          actorId
        }),
      { code: 'REAL_EXPIRED' }
    )
    assert.equal(
      (
        await pool.query('select count(*)::int as n from invitations_real_recipient where campaign_id=$1', [
          c.id
        ])
      ).rows[0].n,
      1
    )
  })
)
export async function importSynthetic({
  pool,
  keys,
  campaignId = null,
  revision,
  fixture = syntheticSnapshot(),
  requestKey = randomUUID()
}) {
  const preview = await previewRealImport({
    pool,
    keys,
    campaignId,
    csvBytes: fixture.csvBytes,
    name: 'Synthetic handoff',
    sourceDate: '2026-10-07',
    actorId
  })
  const input = {
    pool,
    keys,
    previewId: preview.previewId,
    digest: preview.digest,
    revision: revision ?? preview.revision,
    requestKey,
    actorId
  }
  return { preview, input, campaign: await commitRealImport(input) }
}

test(
  '1340 real-path synthetic recipients preserve five groups, all 43 cells and unknown assertions; retry is idempotent',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const fixture = syntheticSnapshot()
      const { preview, input, campaign: c } = await importSynthetic({ pool, keys, fixture })
      assert.deepEqual(c.counts, {
        total: 1340,
        groups: [318, 276, 103, 351, 292],
        suppressed: 42,
        recheck: 1298
      })
      assert.equal(c.eligibleNow, null)
      assert.equal(c.sendingEnabled, false)
      assert.equal(Date.parse(c.expiresAt) - Date.parse(c.firstImportedAt), 30 * 86400000)
      assert.ok(Date.parse(c.firstImportedAt) <= Date.parse(await dbClock(pool)))
      assert.equal(preview.issues.filter((i) => i.code === 'invalid_internal').length, 1319)
      assert.deepEqual(await commitRealImport(input), c)
      await assert.rejects(() => commitRealImport({ ...input, revision: input.revision + 1 }), {
        status: 409
      })
      const p = await listRealRecipients({ pool, keys, campaignId: c.id, limit: 100 })
      assert.equal(p.items.length, 100)
      assert.equal(p.total, 1340)
      const r = await readRealRecipient({ pool, keys, campaignId: c.id, recipientId: p.items[0].id })
      const n = Number(r.email.match(/synthetic(\d+)@/)[1])
      assert.deepEqual(r.rawSource, { headers: fixture.headers, values: fixture.rows[n] })
      assert.equal(r.firstName, 'there')
      const dump = (
        await pool.query(
          'select row_to_json(c)::text as data from invitations_real_campaign c union all select row_to_json(r)::text from invitations_real_recipient r union all select row_to_json(i)::text from invitations_real_import i'
        )
      ).rows
        .map((r) => r.data)
        .join('')
      for (const canary of [
        'synthetic0@example.test',
        'Synthetic handoff',
        'Synthetic company',
        'SUM(1,2)',
        'Synthetic Unicode'
      ])
        assert.ok(!dump.includes(canary))
    })
)

test(
  'simultaneous confirmations create exactly one campaign and bind actor, digest and request key',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const p = await previewRealImport({
        pool,
        keys,
        campaignId: null,
        csvBytes: syntheticSnapshot({ total: 2 }).csvBytes,
        name: 'Synthetic',
        sourceDate: '2026-10-07',
        actorId
      })
      const input = {
        pool,
        keys,
        previewId: p.previewId,
        digest: p.digest,
        revision: p.revision,
        requestKey: randomUUID(),
        actorId
      }
      const [a, b] = await Promise.all([commitRealImport(input), commitRealImport(input)])
      assert.deepEqual(a, b)
      assert.equal(
        (await pool.query('select count(*)::int as n from invitations_real_campaign')).rows[0].n,
        1
      )
      await assert.rejects(() => commitRealImport({ ...input, actorId: randomUUID() }))
      await assert.rejects(() => commitRealImport({ ...input, digest: 'wrong' }))
      await assert.rejects(() => commitRealImport({ ...input, requestKey: randomUUID() }), { status: 409 })
      const other = await previewRealImport({
        pool,
        keys,
        campaignId: null,
        csvBytes: syntheticSnapshot({ total: 1, offset: 20 }).csvBytes,
        name: 'Other',
        sourceDate: '2026-10-07',
        actorId
      })
      await assert.rejects(
        () => commitRealImport({ ...input, previewId: other.previewId, digest: other.digest }),
        { status: 409 }
      )
    })
)

test(
  'failure in the second 1000-row batch publishes no campaign or recipient and revokes the orphan key',
  opts,
  async () =>
    withRealDb(async ({ pool, keys, root }) => {
      await pool.query(
        "create sequence synthetic_insert_counter; create function synthetic_fail_batch() returns trigger language plpgsql as $$ begin if nextval('synthetic_insert_counter')=1001 then raise exception 'Synthetic batch failure'; end if; return new; end $$; create trigger synthetic_fail before insert on invitations_real_recipient for each row execute function synthetic_fail_batch()"
      )
      const p = await previewRealImport({
        pool,
        keys,
        campaignId: null,
        csvBytes: syntheticSnapshot().csvBytes,
        name: 'Synthetic',
        sourceDate: '2026-10-07',
        actorId
      })
      await assert.rejects(() =>
        commitRealImport({
          pool,
          keys,
          previewId: p.previewId,
          digest: p.digest,
          revision: p.revision,
          requestKey: randomUUID(),
          actorId
        })
      )
      assert.equal(
        (await pool.query('select count(*)::int as n from invitations_real_campaign')).rows[0].n,
        0
      )
      assert.equal(
        (await pool.query('select count(*)::int as n from invitations_real_recipient')).rows[0].n,
        0
      )
      const { readdir } = await import('node:fs/promises')
      const now = await dbClock(pool)
      for (const id of (await readdir(root)).filter((id) => !id.endsWith('.lock') && id !== p.previewId))
        await assert.rejects(() => keys.read({ campaignId: id, now }))
    })
)

test(
  'additional import preserves retention, deduplicates identity aliases and never silently chooses conflicting raw data',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const fixture = syntheticSnapshot({ total: 1 })
      const { campaign: c } = await importSynthetic({ pool, keys, fixture })
      const { campaign: more } = await importSynthetic({
        pool,
        keys,
        campaignId: c.id,
        fixture: syntheticSnapshot({ total: 2 })
      })
      assert.equal(more.counts.total, 2)
      assert.equal(more.expiresAt, c.expiresAt)
      const alias = fixture.rows.map((r) => [...r])
      alias[0][0] = 'additional-member'
      const { campaign: dedup } = await importSynthetic({
        pool,
        keys,
        campaignId: c.id,
        fixture: { csvBytes: snapshotCsv(fixture.headers, alias) }
      })
      assert.equal(dedup.counts.total, 2)
      assert.equal(
        (await pool.query("select count(*)::int as n from invitations_real_identity where kind='member'"))
          .rows[0].n,
        3
      )
      for (const [column, value] of [
        [1, 'other@example.test'],
        [2, '5 ca nhan'],
        [10, 'Conflicting raw']
      ]) {
        const rows = fixture.rows.map((r) => [...r])
        rows[0][column] = value
        const p = await previewRealImport({
          pool,
          keys,
          campaignId: c.id,
          csvBytes: snapshotCsv(fixture.headers, rows),
          name: 'Synthetic',
          sourceDate: '2026-10-07',
          actorId
        })
        assert.ok(p.issues.some((i) => i.blocking))
        await assert.rejects(() =>
          commitRealImport({
            pool,
            keys,
            previewId: p.previewId,
            digest: p.digest,
            revision: p.revision,
            requestKey: randomUUID(),
            actorId
          })
        )
      }
    })
)

test(
  'invalid emails, conflicting identities/groups/raw cells block the entire preview; unknown flags remain review issues',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      for (const [column, value] of [
        [1, 'invalid'],
        [0, '1'],
        [2, 'unrecognized'],
        [10, 'conflicting raw']
      ]) {
        const f = syntheticSnapshot({ total: 2 })
        if (column === 10) {
          f.rows[1] = [...f.rows[0]]
        }
        f.rows[1][column] = value
        const p = await previewRealImport({
          pool,
          keys,
          campaignId: null,
          csvBytes: snapshotCsv(f.headers, f.rows),
          name: 'Synthetic',
          sourceDate: '2026-10-07',
          actorId
        })
        assert.ok(p.issues.some((i) => i.blocking))
        await assert.rejects(() =>
          commitRealImport({
            pool,
            keys,
            previewId: p.previewId,
            digest: p.digest,
            revision: p.revision,
            requestKey: randomUUID(),
            actorId
          })
        )
      }
    })
)

test(
  'expired previews and revoked campaigns cannot be read, retried or used for supplementary import',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const { input, campaign: c } = await importSynthetic({
        pool,
        keys,
        fixture: syntheticSnapshot({ total: 1 })
      })
      await keys.revoke({ campaignId: c.id, now: await dbClock(pool) })
      await assert.rejects(() => commitRealImport(input))
      await assert.rejects(() => listRealRecipients({ pool, keys, campaignId: c.id, limit: 1 }))
      const p = await previewRealImport({
        pool,
        keys,
        campaignId: null,
        csvBytes: syntheticSnapshot({ total: 1 }).csvBytes,
        name: 'Synthetic',
        sourceDate: '2026-10-07',
        actorId
      })
      await pool.query(
        "update invitations_real_import set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [p.previewId]
      )
      await assert.rejects(() =>
        commitRealImport({
          pool,
          keys,
          previewId: p.previewId,
          digest: p.digest,
          revision: p.revision,
          requestKey: randomUUID(),
          actorId
        })
      )
    })
)
