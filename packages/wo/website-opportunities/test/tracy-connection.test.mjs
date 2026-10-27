// Connecting this server to a Tracy account (OAuth device flow, RFC 8628) and keeping the token pair alive, against a
// fake Tracy on a local port. The token is kept server-side in one file; nothing here reaches a browser.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createTracyConnection } from '../src/tracy-connection.js'
import { createTokenFile } from '../src/tracy-token-file.js'
import { startFakeTracy } from './tracy-fake.mjs'

let tracy
let dir

before(async () => {
  tracy = await startFakeTracy()
  dir = await mkdtemp(join(tmpdir(), 'wo-tracy-'))
})
after(async () => {
  await tracy?.close()
  if (dir) await rm(dir, { recursive: true, force: true })
})

let n = 0
/** A connection with its own token file and a clock the test moves. */
function connectionWith({ seal } = {}) {
  n += 1
  const clock = { t: Date.now() }
  const path = join(dir, `tracy-${n}.json`)
  const conn = createTracyConnection({
    tracyUrl: tracy.url,
    store: createTokenFile({ path, ...seal }),
    now: () => clock.t
  })
  return { conn, clock, path }
}

/** Connect and let the person allow the code. */
async function connected(opts) {
  const made = connectionWith(opts)
  const pending = await made.conn.connect()
  tracy.decide(pending.userCode)
  const done = await made.conn.poll()
  assert.equal(done.state, 'connected')
  return made
}

test('connect shows a code and a link, then reads the account once the person allows it', async () => {
  const { conn, path } = connectionWith()
  assert.equal((await conn.status()).state, 'disconnected')
  const pending = await conn.connect()
  assert.equal(pending.state, 'pending')
  assert.match(pending.userCode, /^[0-9A-F]{4}-[0-9A-F]{4}$/)
  assert.equal(pending.verificationUri, `${tracy.url}/connect`)
  assert.equal(pending.verificationUriComplete, `${tracy.url}/connect?code=${pending.userCode}`)
  assert.equal((await conn.poll()).state, 'pending', 'authorization_pending keeps waiting')
  tracy.decide(pending.userCode)
  const done = await conn.poll()
  assert.equal(done.state, 'connected')
  assert.deepEqual(done.account, { email: 'seller@example.com', name: 'Sam Seller' })
  assert.equal(JSON.stringify(done).includes('tra_'), false, 'no token in what the page sees')
  assert.equal(JSON.stringify(done).includes('dev_'), false, 'no device code either')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
})

test('slow_down makes the next poll wait five seconds longer', async () => {
  const { conn, clock } = connectionWith()
  const pending = await conn.connect()
  tracy.state.slowDownNext = 1
  await conn.poll()
  const polled = tracy.state.devices.size && [...tracy.state.devices.values()].at(-1).polls
  clock.t += 4_000
  await conn.poll()
  assert.equal([...tracy.state.devices.values()].at(-1).polls, polled, 'not asked again before 5 s')
  clock.t += 1_500
  tracy.decide(pending.userCode)
  assert.equal((await conn.poll()).state, 'connected')
})

test('a denied code ends the flow and says so', async () => {
  const { conn } = connectionWith()
  const pending = await conn.connect()
  tracy.decide(pending.userCode, false)
  const out = await conn.poll()
  assert.equal(out.state, 'disconnected')
  assert.equal(out.error, 'access_denied')
})

test('an expired code ends the flow and says so', async () => {
  const { conn } = connectionWith()
  await conn.connect()
  tracy.expireDevices()
  const out = await conn.poll()
  assert.equal(out.state, 'disconnected')
  assert.equal(out.error, 'expired_token')
})

test('the code expires on this side too, without asking Tracy', async () => {
  const { conn, clock } = connectionWith()
  await conn.connect()
  const before = tracy.state.calls.length
  clock.t += 601_000
  const out = await conn.poll()
  assert.equal(out.error, 'expired_token')
  assert.equal(tracy.state.calls.length, before)
})

test('an expired access token is refreshed, and the rotated pair is written before it is used', async () => {
  const { conn, path } = await connected()
  const first = JSON.parse(await readFile(path, 'utf8'))
  tracy.expireAccessTokens()
  const res = await conn.call('/v1/me')
  assert.equal(res.status, 200)
  const second = JSON.parse(await readFile(path, 'utf8'))
  assert.notEqual(second.refreshToken, first.refreshToken)
  assert.notEqual(second.accessToken, first.accessToken)
  assert.equal((await stat(path)).mode & 0o777, 0o600)
})

test('many calls that find the token expired share ONE refresh', async () => {
  const { conn, clock } = await connected()
  clock.t += 3_600_000
  tracy.expireAccessTokens()
  tracy.state.refreshDelayMs = 50
  const before = tracy.state.refreshCalls
  try {
    const answers = await Promise.all(Array.from({ length: 5 }, () => conn.call('/v1/me')))
    assert.deepEqual(
      answers.map((r) => r.status),
      [200, 200, 200, 200, 200]
    )
  } finally {
    tracy.state.refreshDelayMs = 0
  }
  assert.equal(tracy.state.refreshCalls - before, 1)
  assert.equal((await conn.status()).state, 'connected')
})

test('a grant revoked in Tracy turns the connection to Reconnect, without a token in the file', async () => {
  const { conn, path } = await connected()
  tracy.revokeAll()
  await assert.rejects(conn.call('/v1/me'), (e) => e.code === 'TRACY_RECONNECT')
  const status = await conn.status()
  assert.equal(status.state, 'reconnect')
  assert.equal(status.account.email, 'seller@example.com')
  const kept = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(kept.accessToken, null)
  assert.equal(kept.refreshToken, null)
})

test('Tracy unreachable on Connect is reported as unavailable, not as a refusal', async () => {
  const conn = createTracyConnection({
    tracyUrl: 'http://127.0.0.1:9',
    store: createTokenFile({ path: join(dir, 'down.json') }),
    timeoutMs: 500
  })
  await assert.rejects(conn.connect(), (e) => e.code === 'TRACY_UNAVAILABLE')
})

test('disconnect revokes the grant in Tracy and forgets the tokens', async () => {
  const { conn, path } = await connected()
  const { refreshToken } = JSON.parse(await readFile(path, 'utf8'))
  const out = await conn.disconnect()
  assert.equal(out.state, 'disconnected')
  assert.ok(tracy.state.revoked.includes(refreshToken))
  await assert.rejects(readFile(path, 'utf8'), { code: 'ENOENT' })
  await assert.rejects(conn.call('/v1/me'), (e) => e.code === 'TRACY_NOT_CONNECTED')
})

test('with a host that seals secrets, the file holds no token in clear', async () => {
  const seal = {
    seal: async (plain) => `sealed:${Buffer.from(plain).toString('base64')}`,
    open: async (cipher) => Buffer.from(cipher.slice(7), 'base64').toString('utf8')
  }
  const { conn, path } = await connected({ seal })
  const text = await readFile(path, 'utf8')
  assert.match(text, /^sealed:/)
  assert.equal(text.includes('tra_'), false)
  assert.equal((await conn.call('/v1/me')).status, 200)
  // A second connection on the same file reads the sealed pair back.
  const again = createTracyConnection({ tracyUrl: tracy.url, store: createTokenFile({ path, ...seal }) })
  assert.equal((await again.status()).state, 'connected')
})
