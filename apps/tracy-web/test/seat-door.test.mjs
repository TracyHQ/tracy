import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signSeatCall, mintSeatSession } from '../src/workspace/seat-door.js'

/**
 * The three headers `workers/seat-door/src/index.js` produced for these exact inputs, read off that
 * implementation on the last commit that carried it and frozen here when `workers/` was deleted
 * (16/09/2026). The lane's verifier is the other half of this contract and is UNCHANGED
 * (`vendor/tracy/dsh-passwords/src/tracy/seat.ts`), so a signature that stops matching this fixture is a
 * signature every running dsh will refuse — a 403 nobody is watching, on every seat minted.
 */
const HEADERS_THE_WORKER_SIGNED = {
  'x-seat-timestamp': '1700000000000',
  'x-seat-nonce': 'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
  'x-seat-signature': '9d38ac9d8ca384784678f9c5f41af5c4a40537058eb35491a9697fe354c636d2'
}

test('same inputs, same three headers the seat door has always signed', async () => {
  const input = {
    secret: 'k',
    path: '/gateway/seat/session',
    body: '{"a":1}',
    now: 1_700_000_000_000,
    nonce: 'n'.repeat(32)
  }
  assert.deepEqual(await signSeatCall(input), HEADERS_THE_WORKER_SIGNED)
})

test('mintSeatSession returns the token on 200 and null on refusal', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ token: 'v1.t' }), { status: 200 })
  }
  const token = await mintSeatSession({
    origin: 'http://dsh',
    secret: 'k',
    grant: { role: 'owner', email: 'a@b.c', folders: ['/site/x'], site: 'x.localhost' },
    fetchImpl
  })
  assert.equal(token, 'v1.t')
  assert.equal(calls[0].url, 'http://dsh/gateway/seat/session')
  assert.equal(calls[0].init.method, 'POST')
  assert.ok(calls[0].init.headers['x-seat-signature'])
  const refused = await mintSeatSession({
    origin: 'http://dsh',
    secret: 'k',
    grant: {},
    fetchImpl: async () => new Response('{}', { status: 403 })
  })
  assert.equal(refused, null)
})

test('🔒 a gateway that redirects a seat route to its sign-in page is a refusal, not a done revoke or forget', async () => {
  const { createServer } = await import('node:http')
  const { revokeSeatAtDoor, forgetWorkspaceAtDoor } = await import('../src/workspace/seat-door.js')
  // What a dsh image older than a seat route answers: 302 to its login page, which is a 200 page.
  const server = createServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><title>Sign in</title>')
      return
    }
    res.writeHead(302, { location: '/login' })
    res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const revoked = await revokeSeatAtDoor({ origin, secret: 'k', email: 'a@b.c' })
    assert.equal(revoked.ok, false, 'the sign-in page is not a revoke')
    const forgot = await forgetWorkspaceAtDoor({ origin, secret: 'k', path: '/site/x' })
    assert.equal(forgot.ok, false, 'the sign-in page is not a forget')
  } finally {
    server.close()
  }
})

test('a 200 that is not JSON is not ok; a JSON 200 still is', async () => {
  const { revokeSeatAtDoor } = await import('../src/workspace/seat-door.js')
  const html = await revokeSeatAtDoor({
    origin: 'http://dsh',
    secret: 'k',
    email: 'a@b.c',
    fetchImpl: async () => new Response('<html></html>', { status: 200 })
  })
  assert.deepEqual(html, { ok: false, revoked: null })
  const json = await revokeSeatAtDoor({
    origin: 'http://dsh',
    secret: 'k',
    email: 'a@b.c',
    fetchImpl: async () => new Response(JSON.stringify({ revoked: 2 }), { status: 200 })
  })
  assert.deepEqual(json, { ok: true, revoked: 2 })
})
