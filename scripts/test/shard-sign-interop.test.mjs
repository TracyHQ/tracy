// The shard channel's bash signer against the contract (the shard interface contract, section 2)
// and the JavaScript already in the repo. The canonical string carries the REAL method; for a POST
// it is byte for byte the host channel's (apps/tracy-host/src/auth.js verifies it,
// apps/tracy-web/src/host/client.js signs it), which anchors the POST half on code that runs today.
// Once W2 has merged, one more test holds bash against lib/shard-channel.js itself.
//   node --test scripts/test/shard-sign-interop.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bash, script, shardSignature, tempDir, verifyShardHeaders } from './_shard.mjs'

const { verifyHostCall } = await import(pathToFileURL(path.resolve('apps/tracy-host/src/auth.js')).href)
const { signHostCall } = await import(pathToFileURL(path.resolve('apps/tracy-web/src/host/client.js')).href)
const CHANNEL = path.resolve('apps/tracy-web/src/lib/shard-channel.js')

// A shard secret is 64 lowercase hex (contract section 2, `openssl rand -hex 32`); the HMAC key is
// the UTF-8 bytes of that string, not the 32 bytes it spells.
const SECRET = 'ab'.repeat(32)
const TS = '1760500000000'
const NONCE = '0123456789abcdef0123456789abcdef'

// method null leaves --method out (a usage error); extra arguments go last, so a second --nonce wins.
function sign(signPath, body, method = 'POST', env = { SHARD_SECRET: SECRET }, extra = []) {
  const args = [script('shard-sign.sh'), ...(method ? ['--method', method] : []), signPath]
  if (body !== null) {
    const file = path.join(tempDir('shard-sign-'), 'body')
    writeFileSync(file, body)
    args.push(file)
  }
  const run = bash([...args, '--timestamp', TS, '--nonce', NONCE, ...extra], { env })
  const headers = Object.fromEntries(
    run.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf(': ')), line.slice(line.indexOf(': ') + 2)])
  )
  return { run, headers }
}

const asHostHeaders = (h) => ({
  'x-host-timestamp': h['x-shard-timestamp'],
  'x-host-nonce': h['x-shard-nonce'],
  'x-host-signature': h['x-shard-signature']
})

test('a POST signed in bash passes tracy-host verifyHostCall (the same string when the method is POST)', async () => {
  const body = '{"app_tag":"app-0123456789ab","sites":3}'
  const { run, headers } = sign('/api/shards/s1/check', body)
  assert.equal(run.status, 0, run.stderr)
  const verdict = await verifyHostCall({
    secret: SECRET,
    path: '/api/shards/s1/check',
    body,
    headers: asHostHeaders(headers),
    now: Number(TS)
  })
  assert.deepEqual(verdict, { ok: true })
})

test('bash and tracy-web produce the same POST signature for the same inputs', async () => {
  const body = '{"email":"anh@example.com"}'
  const { headers } = sign('/_shard/adopt', body)
  const js = await signHostCall({
    secret: SECRET,
    path: '/_shard/adopt',
    body,
    now: Number(TS),
    nonce: NONCE
  })
  assert.equal(headers['x-shard-signature'], js['x-host-signature'])
  assert.equal(headers['x-shard-timestamp'], js['x-host-timestamp'])
})

test('one changed byte in the body fails verification', async () => {
  const body = '{"hold":false}'
  const { headers } = sign('/api/shards/s1/check', body)
  const verdict = await verifyHostCall({
    secret: SECRET,
    path: '/api/shards/s1/check',
    body: '{"hold":true}',
    headers: asHostHeaders(headers),
    now: Number(TS)
  })
  assert.deepEqual(verdict, { ok: false, why: 'signature' })
})

test('UTF-8 and a trailing newline are signed as the exact bytes sent', async () => {
  const body = '{"displayName":"Zoë Ångström 東京"}\n'
  const { headers } = sign('/_shard/adopt', body)
  const verdict = await verifyHostCall({
    secret: SECRET,
    path: '/_shard/adopt',
    body,
    headers: asHostHeaders(headers),
    now: Number(TS)
  })
  assert.deepEqual(verdict, { ok: true })
})

test('GET /_shard/status signs the real method and the empty body (contract section 2)', () => {
  const { run, headers } = sign('/_shard/status', null, 'GET')
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(
    verifyShardHeaders({ secret: SECRET, method: 'GET', path: '/_shard/status', body: '', headers }),
    {
      ok: true
    }
  )
  assert.deepEqual(
    verifyShardHeaders({ secret: SECRET, method: 'POST', path: '/_shard/status', body: '', headers }),
    { ok: false, why: 'signature' },
    'the method is part of the signed string'
  )
})

test('every signature is the contract canonical string, for both methods', () => {
  for (const [method, signPath, body] of [
    ['POST', '/api/shards/s1/check', '{"sites":null,"accepting":false}'],
    ['GET', '/_shard/status', null]
  ]) {
    const { headers } = sign(signPath, body, method)
    const expected = shardSignature({
      secret: SECRET,
      timestamp: TS,
      nonce: NONCE,
      method,
      path: signPath,
      body: body ?? ''
    })
    assert.equal(headers['x-shard-signature'], expected, `${method} ${signPath}`)
  }
})

test("W2's lib/shard-channel.js signs the same bytes", {
  skip: existsSync(CHANNEL) ? false : 'apps/tracy-web/src/lib/shard-channel.js is not in this tree yet (W2)'
}, async () => {
  // The export name is the contract's (section 1). W2 Task 2 settles the argument shape: if it differs
  // from { secret, method, path, body, now, nonce } -> headers, follow W2 here, never the other way.
  const { signShardRequest } = await import(pathToFileURL(CHANNEL).href)
  for (const [method, signPath, body] of [
    ['POST', '/api/shards/s1/check', '{"sites":3}'],
    ['GET', '/_shard/status', '']
  ]) {
    const js = await signShardRequest({
      secret: SECRET,
      method,
      path: signPath,
      body,
      now: Number(TS),
      nonce: NONCE
    })
    const { headers } = sign(signPath, body || null, method)
    assert.equal(headers['x-shard-signature'], js['x-shard-signature'], `${method} ${signPath}`)
  }
})

test('the secret is never printed, and a missing secret is a usage error', () => {
  const { run } = sign('/api/shards/s1/check', '{}')
  assert.ok(!run.stdout.includes(SECRET) && !run.stderr.includes(SECRET))
  const missing = sign('/api/shards/s1/check', '{}', 'POST', { SHARD_SECRET: '' })
  assert.equal(missing.run.status, 2)
  assert.match(missing.run.stderr, /SHARD_SECRET is not set/)
})

test('a path with a query string is refused (the contract signs the path without one)', () => {
  assert.equal(sign('/_shard/status?x=1', null, 'GET').run.status, 2)
})

test('no --method, another method, a GET with a body, or a nonce that is not 32 hex is a usage error', () => {
  assert.equal(sign('/_shard/status', null, null).run.status, 2)
  assert.equal(sign('/_shard/status', null, 'PUT').run.status, 2)
  assert.equal(sign('/_shard/status', '{}', 'GET').run.status, 2)
  assert.equal(
    sign('/_shard/status', null, 'GET', { SHARD_SECRET: SECRET }, ['--nonce', 'abc']).run.status,
    2
  )
})

test('with no --timestamp the signer uses 13-digit milliseconds, even under uutils date', () => {
  // uutils date (newer Ubuntu) ignores the width in `%3N` and prints nine digits of nanoseconds.
  // This fake does the same at a fixed second, so the test reads no clock (CI's clock-shift run
  // moves Date.now() but not bash's date); a signer that still asked for `%3N` would send 19 digits.
  const bin = tempDir('shard-sign-date-')
  writeFileSync(
    path.join(bin, 'date'),
    '#!/bin/sh\ncase "$1" in *%3N) echo 1760500000123456789 ;; +%s) echo 1760500000 ;; *) exit 1 ;; esac\n',
    { mode: 0o755 }
  )
  const run = bash([script('shard-sign.sh'), '--method', 'GET', '/_shard/status'], {
    env: { SHARD_SECRET: SECRET, PATH: `${bin}:${process.env.PATH}` }
  })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^x-shard-timestamp: 1760500000000$/m)
})
