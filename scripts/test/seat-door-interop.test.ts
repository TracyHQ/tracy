// A contract between two packages, checked in a place that belongs to neither.
//
// The seat door has two halves written for two different runtimes: the lane side is TypeScript on Node
// (`vendor/tracy/dsh-passwords/src/tracy/seat.ts`, `node:crypto`), the caller was JavaScript on Cloudflare
// Workers (`workers/seat-door/src/index.js`, `crypto.subtle`). If each side tests itself with its own
// algorithm, both are green while the signing strings differ by one character — and the symptom is a
// 403 `signature` on a real lane, where nobody is looking.
//
// So this test sends the caller's signature through the lane side's REAL verifier. It lives in
// `scripts/test/` rather than `vendor/`: the vendored copy must build on its own when published, and a
// test file importing outside its tree would break on the next clone.
//
//   node --import tsx --test scripts/test/seat-door-interop.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { verifySeatRequest } from '../../vendor/tracy/dsh-passwords/src/tracy/seat.js'
import {
  signSeatCall,
  callSeatDoor,
  mintSeatSession,
  revokeSeatAtDoor
} from '../../apps/tracy-web/src/workspace/seat-door.js'

const SECRET = 'interop-secret'

test("apps/tracy-web's signature passes the lane side's verifier", async () => {
  const path = '/gateway/seat/session'
  const body = JSON.stringify({ role: 'editor', email: 'user@example.com', folders: ['/work/alpha'] })
  const headers = await signSeatCall({ secret: SECRET, path, body })

  const verdict = verifySeatRequest({
    secret: SECRET,
    method: 'POST',
    path,
    body,
    timestamp: headers['x-seat-timestamp'],
    nonce: headers['x-seat-nonce'],
    signature: headers['x-seat-signature'],
    seen: new Map()
  })
  assert.deepEqual(verdict, { ok: true })
})

test('changing one byte of the body invalidates that signature', async () => {
  const path = '/gateway/seat/session'
  const body = JSON.stringify({ role: 'editor', email: 'user@example.com', folders: ['/work/alpha'] })
  const headers = await signSeatCall({ secret: SECRET, path, body })

  const verdict = verifySeatRequest({
    secret: SECRET,
    method: 'POST',
    path,
    body: body.replace('editor', 'owner'),
    timestamp: headers['x-seat-timestamp'],
    nonce: headers['x-seat-nonce'],
    signature: headers['x-seat-signature'],
    seen: new Map()
  })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.reason, 'signature')
})

test('mint returns a token when the lane accepts, and null when it refuses', async () => {
  const ok = await mintSeatSession({
    origin: 'https://lane.example',
    secret: SECRET,
    grant: { role: 'guest', folders: ['/work/alpha'] },
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, token: 'tok-1' }), { status: 200 })
  })
  assert.equal(ok, 'tok-1')

  // 502 rather than an empty page: the caller must be able to tell, so the function returns null.
  const refused = await mintSeatSession({
    origin: 'https://lane.example',
    secret: SECRET,
    grant: { role: 'guest', folders: ['/work/alpha'] },
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 403 })
  })
  assert.equal(refused, null)
})

test('every call carries a fresh nonce — a captured request cannot be replayed', async () => {
  const nonces = new Set<string>()
  const fetchImpl = async (_url: string, init: RequestInit) => {
    nonces.add(String((init.headers as Record<string, string>)['x-seat-nonce']))
    return new Response(JSON.stringify({ ok: true, token: 't' }), { status: 200 })
  }
  for (let i = 0; i < 5; i++) {
    await mintSeatSession({
      origin: 'https://lane.example',
      secret: SECRET,
      grant: { role: 'bot', folders: [] },
      fetchImpl
    })
  }
  assert.equal(nonces.size, 5)
})

test('revoke reports exactly which lane failed, without swallowing the error', async () => {
  const done = await revokeSeatAtDoor({
    origin: 'https://lane.example',
    secret: SECRET,
    email: 'user@example.com',
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, revoked: 7 }), { status: 200 })
  })
  assert.deepEqual(done, { ok: true, revoked: 7 })

  const down = await revokeSeatAtDoor({
    origin: 'https://lane.example',
    secret: SECRET,
    email: 'user@example.com',
    fetchImpl: async () => new Response('gateway down', { status: 502 })
  })
  assert.deepEqual(down, { ok: false, revoked: null })
})

test('the Access service token rides along without overwriting the signature headers', async () => {
  let sent: Record<string, string> = {}
  await callSeatDoor({
    origin: 'https://lane.example',
    secret: SECRET,
    path: '/gateway/seat/session',
    payload: { role: 'guest', folders: [] },
    headers: { 'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 'secret' },
    fetchImpl: async (_url: string, init: RequestInit) => {
      sent = init.headers as Record<string, string>
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
  })
  assert.equal(sent['CF-Access-Client-Id'], 'id')
  assert.ok(sent['x-seat-signature'], 'the signature must stay intact alongside the Access headers')
})
// ⚠ THE SECOND HALF OF THIS TEST LEFT WITH `workers/` (deleted 16/09/2026). It ran the lane's
// `noSessionAnswer` against `workers/cowork-web`'s `dshRejectedSession` — two halves of one redirect whose
// middle neither side's tests could see. That boundary no longer exists: `apps/tracy-web` MINTS the seat
// session before proxying (`workspace/route.js` calls `mintSeatSession`), so it never has to read a lane
// refusal and guess whether it means "no session yet". Keeping a test that reads deleted code would keep
// a gate green because it does not run.
