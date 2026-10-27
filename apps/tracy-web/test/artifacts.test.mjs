import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presign, signedCall, artifactKey, storeForSource, PART_URL_TTL_S } from '../src/sites/artifacts.js'

const store = { endpoint: 'https://r2.example.com', bucket: 'artifacts', accessKey: 'AK', secretKey: 'SK' }

test('presign: pinning `now` produces the exact same URL as pinning Date.now() itself — the port changed nothing', async () => {
  const now = 1_700_000_000_000
  const viaParam = await presign(store, { method: 'PUT', key: 'sites/x/a.tar', now })

  const realNow = Date.now
  Date.now = () => now
  let viaGlobal
  try {
    viaGlobal = await presign(store, { method: 'PUT', key: 'sites/x/a.tar' })
  } finally {
    Date.now = realNow
  }

  assert.equal(viaParam, viaGlobal)
  assert.match(viaParam, /^https:\/\/r2\.example\.com\/artifacts\/sites\/x\/a\.tar\?/)
  assert.match(viaParam, /X-Amz-Algorithm=AWS4-HMAC-SHA256/)
  assert.match(viaParam, /X-Amz-Expires=900/)
  assert.match(viaParam, /X-Amz-Signature=[0-9a-f]{64}$/)
})

test('presign: expiresIn is honored, and a different key or method changes the signature', async () => {
  const now = 1_700_000_000_000
  const a = await presign(store, { method: 'PUT', key: 'sites/x/a.tar', now, expiresIn: 60 })
  assert.match(a, /X-Amz-Expires=60/)

  const b = await presign(store, { method: 'PUT', key: 'sites/x/b.tar', now })
  const c = await presign(store, { method: 'GET', key: 'sites/x/a.tar', now })
  const signatureOf = (url) => new URL(url).searchParams.get('X-Amz-Signature')
  const base = await presign(store, { method: 'PUT', key: 'sites/x/a.tar', now })
  assert.notEqual(signatureOf(b), signatureOf(base))
  assert.notEqual(signatureOf(c), signatureOf(base))
})

test('presign: default expiresIn is PART_URL_TTL_S', async () => {
  const url = await presign(store, { method: 'PUT', key: 'k', now: 1 })
  assert.match(url, new RegExp(`X-Amz-Expires=${PART_URL_TTL_S}$|X-Amz-Expires=${PART_URL_TTL_S}&`))
})

test('signedCall: signs a request and sends it through the given fetchImpl, never the real fetch', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response('<UploadId>abc</UploadId>', { status: 200 })
  }
  const res = await signedCall(
    store,
    { method: 'POST', key: 'sites/x/a.tar', query: { uploads: '' }, now: 1_700_000_000_000 },
    fetchImpl
  )
  assert.equal(calls.length, 1)
  assert.equal(res.status, 200)
  assert.match(calls[0].url, /^https:\/\/r2\.example\.com\/artifacts\/sites\/x\/a\.tar\?/)
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AK\//)
  assert.equal(calls[0].init.method, 'POST')
})

test('artifactKey: a key under sites/<label>/, named by kind, and pinnable for a deterministic test', () => {
  const key = artifactKey('joomlart-com', 'webroot', 1_700_000_000_000)
  assert.match(key, /^sites\/joomlart-com\/\d{8}T\d{6}Z-webroot\.tar$/)
  assert.match(artifactKey('joomlart-com', 'db', 1_700_000_000_000), /-db\.sql\.gz$/)
})

test('storeForSource: no public endpoint configured → the very same store, so every URL is signed as before', () => {
  assert.equal(storeForSource(store), store)
})

test('storeForSource: a public endpoint signs the host the source site reaches, and only the host differs', async () => {
  const local = {
    endpoint: 'http://host.docker.internal:51740',
    publicEndpoint: 'https://store.example.net',
    bucket: 'artifacts',
    accessKey: 'AK',
    secretKey: 'SK'
  }
  const now = 1_700_000_000_000
  const query = { partNumber: '1', uploadId: 'u-1' }
  const forSource = await presign(storeForSource(local), { method: 'PUT', key: 'sites/x/w.tar', query, now })
  const internal = await presign(local, { method: 'PUT', key: 'sites/x/w.tar', query, now })

  assert.equal(new URL(forSource).origin, 'https://store.example.net')
  assert.equal(new URL(internal).origin, 'http://host.docker.internal:51740')
  // Same path and query apart from the signature: SigV4 covers `host`, so the signature must change.
  const strip = (url) => {
    const u = new URL(url)
    const sig = u.searchParams.get('X-Amz-Signature')
    u.searchParams.delete('X-Amz-Signature')
    return { rest: `${u.pathname}?${u.searchParams}`, sig }
  }
  assert.equal(strip(forSource).rest, strip(internal).rest)
  assert.notEqual(strip(forSource).sig, strip(internal).sig)
  // The store handed on keeps its own keys and bucket.
  assert.equal(storeForSource(local).bucket, 'artifacts')
})
