// Assigning a brand door in /ops (brand step trial bench, #320): an Anthropic model is refused when it is assigned, with
// the reason, not only when a run starts. Only the /ops llm routes are mounted; no network.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { llmRoutes } from '../src/ops/llm.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = { sessionSecret: 's'.repeat(32), origin: 'http://tracy.test' }

async function staff(pool, email) {
  const account = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
    .id
  const workspace = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    "insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())",
    [workspace, account]
  )
}

async function client(pool) {
  const app = new Hono().route('/', llmRoutes({ pool, config }))
  await staff(pool, 'owner@tracy.test')
  const cookie = `tracy_sess=${await mintSession('owner@tracy.test', config.sessionSecret)}`
  const send = (method, path, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { cookie, 'content-type': 'application/json', origin: config.origin },
        body: JSON.stringify(body)
      })
    )
  await send('PUT', '/api/ops/llm/providers/openrouter', {
    presetId: 'openrouter',
    apiKey: 'k',
    enabled: true
  })
  return send
}

test('an Anthropic model cannot be assigned to a brand door', opts, async () => {
  const send = await client(db.pool)
  for (const door of ['brandAgent', 'brandReviewer'])
    for (const model of ['anthropic/claude-opus-5.5', 'vendor/Sonnet-5']) {
      const res = await send('PUT', `/api/ops/llm/doors/${door}`, { providerId: 'openrouter', model })
      assert.equal(res.status, 400, `${door} ${model}`)
      const body = await res.json()
      assert.equal(body.error, 'MODEL_NOT_ALLOWED')
      assert.match(body.reason, /Anthropic model.*never uses Opus or Sonnet/)
    }
  const { rows } = await db.pool.query("select door from llm_assignment where door like 'brand%'")
  assert.deepEqual(rows, [], 'nothing was assigned')
})

test('another model is assigned to a brand door', opts, async () => {
  const send = await client(db.pool)
  const res = await send('PUT', '/api/ops/llm/doors/brandAgent', {
    providerId: 'openrouter',
    model: 'deepseek/deepseek-v4.1-flash'
  })
  assert.equal(res.status, 200)
})

test('an Anthropic model can still be assigned to a door that is not a brand door', opts, async () => {
  const send = await client(db.pool)
  const res = await send('PUT', '/api/ops/llm/doors/sitePlanner', {
    providerId: 'openrouter',
    model: 'anthropic/claude-opus-5.5'
  })
  assert.equal(res.status, 200)
})
