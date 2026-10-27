import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { withRealDb, syntheticSnapshot } from './_invitations-real.mjs'
import {
  previewRealImport,
  commitRealImport,
  listRealRecipients,
  readRealRecipient
} from '../src/invitations/real-import.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
const actorId = randomUUID()
async function create(pool, keys, fixture = syntheticSnapshot({ total: 221 }), campaignId = null) {
  const p = await previewRealImport({
    pool,
    keys,
    campaignId,
    csvBytes: fixture.csvBytes,
    name: 'Synthetic',
    sourceDate: '2026-10-07',
    actorId
  })
  return commitRealImport({
    pool,
    keys,
    previewId: p.previewId,
    digest: p.digest,
    revision: p.revision,
    requestKey: randomUUID(),
    actorId
  })
}
test('pagination is bounded and complete; cursors bind campaign, revision and filters', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const c = await create(pool, keys)
    const input = { pool, keys, campaignId: c.id, limit: 100 }
    const a = await listRealRecipients(input)
    const b = await listRealRecipients({ ...input, cursor: a.nextCursor })
    const d = await listRealRecipients({ ...input, cursor: b.nextCursor })
    assert.deepEqual([a.items.length, b.items.length, d.items.length], [100, 100, 21])
    assert.equal(d.nextCursor, null)
    assert.equal(new Set([...a.items, ...b.items, ...d.items].map((r) => r.id)).size, 221)
    for (const limit of [0, 101, 1.5]) await assert.rejects(() => listRealRecipients({ ...input, limit }))
    await assert.rejects(() => listRealRecipients({ ...input, cursor: a.nextCursor, group: 'group_1' }))
    const other = await create(pool, keys, syntheticSnapshot({ total: 1 }))
    await assert.rejects(() => listRealRecipients({ ...input, campaignId: other.id, cursor: a.nextCursor }))
    await assert.rejects(() =>
      readRealRecipient({ pool, keys, campaignId: other.id, recipientId: a.items[0].id })
    )
    await create(pool, keys, syntheticSnapshot({ total: 1, offset: 500 }), c.id)
    await assert.rejects(() => listRealRecipients({ ...input, cursor: a.nextCursor }), { status: 409 })
  })
)
test(
  'group/status/search intersect and searching PII never places it in SQL parameters or cursors',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await create(pool, keys, syntheticSnapshot())
      const queries = []
      const tracking = {
        connect: async () => {
          const db = await pool.connect()
          return {
            query: (q, args) => {
              queries.push(JSON.stringify({ q, args }))
              return db.query(q, args)
            },
            release: () => db.release()
          }
        }
      }
      const a = await listRealRecipients({
        pool: tracking,
        keys,
        campaignId: c.id,
        search: 'synthetic1200@example.test',
        limit: 1
      })
      assert.equal(a.total, 1)
      assert.equal(a.items[0].email, 'synthetic1200@example.test')
      assert.ok(!queries.join('').includes('synthetic1200@example.test'))
      const b = await listRealRecipients({
        pool,
        keys,
        campaignId: c.id,
        group: 'group_1',
        state: 'suppressed',
        limit: 100
      })
      assert.equal(b.total, 42)
      assert.ok(b.items.every((r) => r.state === 'suppressed' && r.group === 'group_1'))
    })
)
