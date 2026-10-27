import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withRealDb } from './_invitations-real.mjs'
import { contentCampaign } from './_invitations-real-content.mjs'
import { readRealRecipient } from '../src/invitations/real-import.js'
import { checkRealEligibility, readRealEligibility } from '../src/invitations/real-eligibility.js'

const opts = { skip: !process.env.TEST_DATABASE_URL }
const config = (
  beta = { apiKey: 'fixture-amember', apiUrl: 'https://amember.fixture.test/api/check-access/by-email' }
) => ({
  origin: 'http://localhost:8080',
  beta
})

test(
  'Check eligibility asks aMember once per unsuppressed recipient, page by page, and keeps no address',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 5 })
      // Suppress one recipient: it must never be asked.
      const ids = (await pool.query('select id from invitations_real_recipient order by id')).rows.map(
        (r) => r.id
      )
      await pool.query("update invitations_real_recipient set state='suppressed' where id=$1", [ids[0]])
      const emails = new Map()
      for (const id of ids) emails.set((await readRealRecipient({ ...c, recipientId: id })).email, id)
      const asked = []
      const fetcher = async (url) => {
        const email = new URL(url).searchParams.get('email')
        asked.push(email)
        const i = ids.indexOf(emails.get(email))
        if (i === 1) return Response.json({ ok: true, user_id: 1, subscriptions: { 10: '2099-01-01' } })
        if (i === 2) return Response.json({ ok: false, code: -1, msg: 'Failure' })
        if (i === 3) return new Response('down', { status: 502 })
        return Response.json({ ok: true, user_id: 2, subscriptions: { 10: '2000-01-01' } })
      }
      await assert.rejects(checkRealEligibility({ ...c, config: config({}), fetcher }), {
        code: 'REAL_MEMBER_CHECK_OFF'
      })
      assert.equal(asked.length, 0)
      const first = await checkRealEligibility({ ...c, config: config(), fetcher, limit: 3 })
      assert.equal(first.checked, 3)
      assert.ok(first.nextCursor)
      const second = await checkRealEligibility({
        ...c,
        config: config(),
        fetcher,
        limit: 3,
        cursor: first.nextCursor
      })
      assert.equal(second.checked, 1)
      assert.equal(second.nextCursor, null)
      assert.equal(asked.length, 4)
      assert.ok(!asked.includes([...emails].find(([, id]) => id === ids[0])[0]))
      const read = await readRealEligibility(c)
      assert.equal(read.checkable, 4)
      assert.equal(read.checked, 4)
      assert.deepEqual(read.counts, { allow: 1, none: 2, unknown: 1 })
      const byId = new Map(read.items.map((i) => [i.recipientId, i]))
      assert.equal(byId.get(ids[1]).status, 'allow')
      assert.equal(byId.get(ids[3]).reason, 'HTTP_502')
      assert.equal(byId.has(ids[0]), false)
      // Stored rows hold ids and codes only.
      const stored = JSON.stringify((await pool.query('select * from invitations_real_member_check')).rows)
      assert.ok(!stored.includes('@'))
      // A second pass replaces answers instead of adding rows.
      await checkRealEligibility({
        ...c,
        config: config(),
        fetcher: async () => Response.json({ ok: true, user_id: 1, subscriptions: { 10: '2099-01-01' } })
      })
      assert.deepEqual((await readRealEligibility(c)).counts, { allow: 4, none: 0, unknown: 0 })
      assert.equal(
        (await pool.query('select count(*)::int n from invitations_real_member_check')).rows[0].n,
        4
      )
    })
)
