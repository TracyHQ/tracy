// The self-hoster's token command: `node src/hub/cli.js token issue|rotate|revoke --principal <id>`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { migrate } from '../src/schema/index.js'
import { createHubTokens } from '../src/hub/tokens.js'
import { scratchDatabase } from './scratch-database.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const CLI = fileURLToPath(new URL('../src/hub/cli.js', import.meta.url))
let db
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  db = await scratchDatabase()
  await migrate(db.pool)
})
after(async () => db?.close())

const run = (...args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, DATABASE_URL: db.url },
    encoding: 'utf8'
  })

test('issue prints a token once; rotate replaces it; revoke stops it', opts, async () => {
  const p = (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id
  const tokens = createHubTokens({ pool: db.pool })
  const issued = run('token', 'issue', '--principal', p)
  assert.equal(issued.status, 0, issued.stderr)
  const first = issued.stdout.trim()
  assert.ok(await tokens.authenticate(first))
  assert.equal(run('token', 'issue', '--principal', p).status, 1)
  const second = run('token', 'rotate', '--principal', p).stdout.trim()
  assert.equal(await tokens.authenticate(first), null)
  assert.ok(await tokens.authenticate(second))
  assert.equal(run('token', 'revoke', '--principal', p).status, 0)
  assert.equal(await tokens.authenticate(second), null)
})

test('a missing principal or an unknown command explains itself', opts, async () => {
  const bad = run('token', 'issue')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /usage/i)
  assert.equal(run('token', 'issue', '--principal', '00000000-0000-0000-0000-000000000000').status, 1)
})

test('an operator blocks and unblocks an account: its token stops and starts working', opts, async () => {
  const p = (await db.pool.query(`insert into wo_principal (kind) values ('test') returning id`)).rows[0].id
  const tokens = createHubTokens({ pool: db.pool })
  const { token, accountId } = await tokens.issue(p)
  assert.equal(run('account', 'block', '--account', accountId).status, 0)
  assert.equal(await tokens.authenticate(token), null)
  assert.equal(run('account', 'unblock', '--account', accountId).status, 0)
  assert.ok(await tokens.authenticate(token))
  assert.equal(run('account', 'block', '--account', '00000000-0000-0000-0000-000000000000').status, 1)
})

test(
  'an operator withdraws a contribution, revokes or removes a place and revokes a picture',
  opts,
  async () => {
    const { makePlace, observe } = await import('./hub-fixtures.mjs')
    const { placeId, identities } = await makePlace(db.pool)
    const observation = await observe(db.pool, { subject: identities[0], field: 'name', value: 'Cafe Cli' })
    const contribution = (
      await db.pool.query('select contribution_id from wo_hub_observation where id = $1', [observation])
    ).rows[0].contribution_id
    const withdrawn = run('contribution', 'withdraw', '--id', contribution)
    assert.equal(withdrawn.status, 0, withdrawn.stderr)
    const status = (await db.pool.query('select status from wo_hub_observation where id = $1', [observation]))
      .rows[0].status
    assert.equal(status, 'withdrawn')

    assert.equal(run('place', 'revoke', '--place', placeId).status, 2, 'a revocation needs a reason')
    const revoked = run('place', 'revoke', '--place', placeId, '--reason', 'wrong data')
    assert.equal(revoked.status, 0, revoked.stderr)
    assert.equal(
      (await db.pool.query('select state from wo_hub_place where place_id = $1', [placeId])).rows[0].state,
      'revoked'
    )

    const other = await makePlace(db.pool)
    const media = (
      await db.pool.query(
        `insert into wo_place_media (place_id, sha256, kind, source, source_url) values ($1, $2, 'image', 'website', 'https://cafe.example/a.jpg')
       returning id`,
        [other.placeId, 'b'.repeat(64)]
      )
    ).rows[0].id
    const pic = run('media', 'revoke', '--media', media, '--reason', 'not theirs')
    assert.equal(pic.status, 0, pic.stderr)
    assert.ok(
      (await db.pool.query('select revoked_at from wo_place_media where id = $1', [media])).rows[0].revoked_at
    )

    const removed = run('place', 'suppress', '--place', other.placeId, '--reason', 'owner asked')
    assert.equal(removed.status, 0, removed.stderr)
    const suppressed = await db.pool.query(
      'select 1 from wo_hub_suppressed_identity where external_id = $1',
      [other.identities[0].externalId]
    )
    assert.equal(suppressed.rowCount, 1)
  }
)
