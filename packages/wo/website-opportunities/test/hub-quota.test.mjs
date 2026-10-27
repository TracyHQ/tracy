// Hub quota: per account, per category, day and month limits together; a refused charge counts nothing.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { createHubQuota } from '../src/hub/quota.js'
import { ensureHubAccount } from '../src/hub/tokens.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
let db
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
})
after(async () => db?.close())

const account = async () => {
  const p = (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id
  return (await ensureHubAccount(db.pool, p)).accountId
}

test(
  'without set limits, an account researches five places a day and the sixth is refused',
  opts,
  async () => {
    // Five a day is the council's pilot number (decided 24/10), until a price is set.
    const now = Date.parse('2026-10-24T10:00:00Z')
    const quota = createHubQuota({ pool: db.pool, now: () => now })
    const a = await account()
    for (let i = 0; i < 5; i += 1)
      assert.equal((await quota.charge(a, 'research', 1)).ok, true, `research ${i + 1}`)
    assert.equal((await quota.charge(a, 'research', 1)).ok, false)
  }
)

test('day and month limits apply together, and a refused charge counts nothing', opts, async () => {
  let now = Date.parse('2026-10-24T10:00:00Z')
  const quota = createHubQuota({ pool: db.pool, now: () => now, limits: { research: { day: 3, month: 4 } } })
  const a = await account()
  assert.equal((await quota.charge(a, 'research', 2)).ok, true)
  assert.deepEqual(await quota.charge(a, 'research', 2), {
    ok: false,
    category: 'research',
    period: 'day',
    limit: 3,
    used: 2
  })
  now = Date.parse('2026-10-25T10:00:00Z')
  assert.equal((await quota.charge(a, 'research', 2)).ok, true)
  const refused = await quota.charge(a, 'research', 1)
  assert.equal(refused.period, 'month')
  assert.deepEqual(await quota.usage(a), {
    read_places: { day: 0, month: 0 },
    research: { day: 2, month: 4 },
    observations: { day: 0, month: 0 },
    image_bytes: { day: 0, month: 0 }
  })
})

test('accounts do not share quota', opts, async () => {
  const quota = createHubQuota({ pool: db.pool, limits: { observations: { day: 1, month: null } } })
  const [a, b] = [await account(), await account()]
  assert.equal((await quota.charge(a, 'observations', 1)).ok, true)
  assert.equal((await quota.charge(a, 'observations', 1)).ok, false)
  assert.equal((await quota.charge(b, 'observations', 1)).ok, true)
})

test('an unknown category is a programming error', opts, async () => {
  const quota = createHubQuota({ pool: db.pool })
  await assert.rejects(quota.charge(await account(), 'everything', 1), TypeError)
})
