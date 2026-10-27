import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPool, migrate } from '../src/db/index.js'
import { memoryIdentityStore, pgIdentityStore } from '../src/identity/store.js'

const url = process.env.TEST_DATABASE_URL

test('pgIdentityStore reads back what it wrote, against the real migration', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const pool = createPool(url)
  const email = 'identity-store-test@b.c'
  try {
    await migrate(pool)
    const store = pgIdentityStore(pool)
    await store.deleteCode(email) // leftover from a prior failed run, if any

    await store.putCode({ email, codeHash: 'hash-one', expiresAt: Date.now() + 10_000 })
    const first = await store.takeCode(email)
    assert.equal(first.codeHash, 'hash-one')
    assert.equal(first.attempts, 0)

    assert.equal(await store.bumpAttempts(email), 1)
    assert.equal(await store.bumpAttempts(email), 2)

    // One code per email: a fresh putCode replaces the row, resetting attempts.
    await store.putCode({ email, codeHash: 'hash-two', expiresAt: Date.now() + 20_000 })
    const second = await store.takeCode(email)
    assert.equal(second.codeHash, 'hash-two')
    assert.equal(second.attempts, 0)

    await store.deleteCode(email)
    assert.equal(await store.takeCode(email), null)

    const account1 = await store.touchAccount(email)
    const account2 = await store.touchAccount(email)
    assert.equal(account1.id, account2.id)
  } finally {
    await pool.query('delete from otp_code where email = $1', [email])
    await pool.query('delete from account where email = $1', [email])
    await pool.end()
  }
})

test('pgIdentityStore: a link round keeps the device it was opened with, and is approved at most once', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const pool = createPool(url)
  const told = `identity-store-told-${process.pid}`.padEnd(64, '0')
  const silent = `identity-store-silent-${process.pid}`.padEnd(64, '0')
  const stale = `identity-store-stale-${process.pid}`.padEnd(64, '0')
  try {
    await migrate(pool)
    const store = pgIdentityStore(pool)
    await pool.query('delete from auth_link where nonce_hash = any($1)', [[told, silent, stale]])

    await store.putLink({
      nonceHash: told,
      clientSecretHash: 's1',
      expiresAt: Date.now() + 60_000,
      device: 'Lee laptop'
    })
    // A caller that says nothing — every lane in the field today — reads back an empty description.
    await store.putLink({ nonceHash: silent, clientSecretHash: 's2', expiresAt: Date.now() + 60_000 })
    assert.equal((await store.linkByNonce(told)).device, 'Lee laptop')
    assert.equal((await store.linkByNonce(silent)).device, '')
    assert.equal((await store.linkByNonce(silent)).status, 'pending')

    // Three approvals at once: one wins, and the address is the winner's, never overwritten.
    const answers = await Promise.all([
      store.approveLink(told, 'a@b.c'),
      store.approveLink(told, 'b@b.c'),
      store.approveLink(told, 'c@b.c')
    ])
    assert.equal(answers.filter(Boolean).length, 1)
    const row = await store.linkByNonce(told)
    assert.equal(row.status, 'approved')
    assert.equal(await store.approveLink(told, 'late@b.c'), false)
    assert.equal((await store.linkByNonce(told)).email, row.email)

    // A round past its window is not approved, even if nobody swept it yet.
    await store.putLink({ nonceHash: stale, clientSecretHash: 's3', expiresAt: Date.now() - 1_000 })
    assert.equal(await store.approveLink(stale, 'a@b.c'), false)
    assert.equal((await store.linkByNonce(stale)).status, 'pending')
  } finally {
    await pool.query('delete from auth_link where nonce_hash = any($1)', [[told, silent, stale]])
    await pool.end()
  }
})

test('pgIdentityStore: a link round expires by the app clock, not the database clock', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const pool = createPool(url)
  const day = 24 * 60 * 60 * 1000
  const late = `identity-store-late-${process.pid}`.padEnd(64, '0')
  const denied = `identity-store-denied-${process.pid}`.padEnd(64, '0')
  const inTime = `identity-store-intime-${process.pid}`.padEnd(64, '0')
  try {
    await migrate(pool)
    const store = pgIdentityStore(pool)
    await pool.query('delete from auth_link where nonce_hash = any($1)', [[late, denied, inTime]])
    // The app clock runs 400 days ahead of the database: the window is still open by Postgres
    // `now()`, but has closed by the time the app says it is.
    const appNow = Date.now() + 400 * day
    for (const nonceHash of [late, denied, inTime])
      await store.putLink({ nonceHash, clientSecretHash: 's', expiresAt: Date.now() + 200 * day })
    assert.equal(await store.approveLink(late, 'a@b.c', appNow), false)
    assert.equal((await store.linkByNonce(late)).status, 'pending')
    assert.equal(await store.denyLink(denied, appNow), false)
    assert.equal((await store.linkByNonce(denied)).status, 'pending')
    assert.equal(await store.approveLink(inTime, 'a@b.c', Date.now() + 100 * day), true)
  } finally {
    await pool.query('delete from auth_link where nonce_hash = any($1)', [[late, denied, inTime]])
    await pool.end()
  }
})

test('memoryIdentityStore: the same device read-back and single approval as the Postgres store', async () => {
  const store = memoryIdentityStore()
  await store.putLink({
    nonceHash: 'n1',
    clientSecretHash: 's',
    expiresAt: Date.now() + 60_000,
    device: 'Lee laptop'
  })
  await store.putLink({ nonceHash: 'n2', clientSecretHash: 's', expiresAt: Date.now() + 60_000 })
  assert.equal((await store.linkByNonce('n1')).device, 'Lee laptop')
  assert.equal((await store.linkByNonce('n2')).device, '')
  const answers = await Promise.all([store.approveLink('n1', 'a@b.c'), store.approveLink('n1', 'b@b.c')])
  assert.deepEqual(answers.sort(), [false, true])
  assert.equal((await store.linkByNonce('n1')).email, 'a@b.c')
})
