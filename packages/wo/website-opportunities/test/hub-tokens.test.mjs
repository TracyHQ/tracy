// Hub accounts and their one token: issue, rotate, revoke, and who a bearer token speaks for.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
let db
let tokens

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
  tokens = createHubTokens({ pool: db.pool })
})
after(async () => db?.close())

const principal = async () =>
  (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id

test('an issued token authenticates as its account and is shown only once', opts, async () => {
  const p = await principal()
  const { token, accountId, prefix } = await tokens.issue(p)
  assert.match(token, /^woh_[A-Za-z0-9_-]{43}$/)
  assert.ok(token.startsWith(`woh_${prefix}`))
  assert.deepEqual(await tokens.authenticate(token), { accountId, principalId: p })
  const stored = await db.pool.query('select token_hash from wo_hub_token where account_id = $1', [accountId])
  assert.ok(!stored.rows.some((r) => r.token_hash.includes(token.slice(4))))
})

test('a second issue is refused: rotate replaces the token, the old one stops at once', opts, async () => {
  const p = await principal()
  const first = await tokens.issue(p)
  await assert.rejects(tokens.issue(p), { code: 'TOKEN_EXISTS' })
  const second = await tokens.rotate(p)
  assert.equal(second.accountId, first.accountId)
  assert.equal(await tokens.authenticate(first.token), null)
  assert.equal((await tokens.authenticate(second.token))?.accountId, first.accountId)
})

test('unknown, malformed and revoked tokens authenticate as nobody', opts, async () => {
  const p = await principal()
  const { token } = await tokens.issue(p)
  assert.equal(await tokens.authenticate(`woh_${'A'.repeat(43)}`), null)
  assert.equal(await tokens.authenticate('not-a-token'), null)
  assert.equal(await tokens.authenticate(''), null)
  assert.equal(await tokens.revoke(p), true)
  assert.equal(await tokens.authenticate(token), null)
  assert.equal(await tokens.revoke(p), false)
})

test('a blocked account authenticates as nobody', opts, async () => {
  const p = await principal()
  const { token, accountId } = await tokens.issue(p)
  await db.pool.query(`update wo_hub_account set state = 'blocked' where id = $1`, [accountId])
  assert.equal(await tokens.authenticate(token), null)
})

test('status names the account and the active token prefix, never the token', opts, async () => {
  const p = await principal()
  assert.deepEqual(await tokens.status(p), {
    accountId: null,
    state: null,
    tokenPrefix: null,
    tokenCreatedAt: null
  })
  const { prefix, accountId } = await tokens.issue(p)
  const status = await tokens.status(p)
  assert.equal(status.accountId, accountId)
  assert.equal(status.state, 'active')
  assert.equal(status.tokenPrefix, prefix)
})
