import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { cacheServer, signS3 } from '../ci/turbo-cache-server.mjs'

test('SigV4: the signature changes with the key, the path and the time, and names the R2 scope', () => {
  const at = new Date('2026-10-12T00:00:00Z')
  const base = { method: 'HEAD', accessKey: 'AK', secretKey: 'SK', now: at }
  const a = signS3({ ...base, url: new URL('https://acc.r2.cloudflarestorage.com/bucket/team/aaaa') })
  assert.match(
    a.authorization,
    /^AWS4-HMAC-SHA256 Credential=AK\/20261012\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
  )
  assert.equal(a['x-amz-date'], '20261012T000000Z')
  assert.equal(a['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD')
  const sig = (h) => h.authorization.split('Signature=')[1]
  assert.notEqual(
    sig(a),
    sig(signS3({ ...base, url: new URL('https://acc.r2.cloudflarestorage.com/bucket/team/bbbb') }))
  )
  assert.notEqual(
    sig(a),
    sig(
      signS3({
        ...base,
        secretKey: 'other',
        url: new URL('https://acc.r2.cloudflarestorage.com/bucket/team/aaaa')
      })
    )
  )
  assert.equal(
    sig(a),
    sig(signS3({ ...base, url: new URL('https://acc.r2.cloudflarestorage.com/bucket/team/aaaa') }))
  )
})

async function serve(store) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const key = new URL(url).pathname.replace(/^\/bucket\//, '')
    calls.push(`${init.method} ${key}`)
    if (init.method === 'PUT') {
      store.set(key, Buffer.from(init.body))
      return new Response(null, { status: 200 })
    }
    if (!store.has(key)) return new Response(null, { status: 404 })
    return new Response(init.method === 'HEAD' ? null : store.get(key), { status: 200 })
  }
  const server = cacheServer({
    endpoint: 'https://acc.example',
    bucket: 'bucket',
    accessKey: 'AK',
    secretKey: 'SK',
    token: 'T',
    fetchImpl
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, calls, close: () => server.close() }
}

test('the four routes Turbo uses, under <team>/<hash>, and nothing without the bearer token', async () => {
  const store = new Map([['ci/aaaa', Buffer.from('cached')]])
  const s = await serve(store)
  const auth = { authorization: 'Bearer T' }
  try {
    assert.equal((await fetch(`${s.base}/v8/artifacts/status`, { headers: auth })).status, 200)
    assert.equal(
      (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD', headers: auth })).status,
      200
    )
    assert.equal(
      (await fetch(`${s.base}/v8/artifacts/bbbb?teamId=ci`, { method: 'HEAD', headers: auth })).status,
      404
    )
    assert.equal(
      await (await fetch(`${s.base}/v8/artifacts/aaaa?slug=ci`, { headers: auth })).text(),
      'cached'
    )
    const put = await fetch(`${s.base}/v8/artifacts/cccc?teamId=ci`, {
      method: 'PUT',
      headers: auth,
      body: 'new'
    })
    assert.equal(put.status, 202)
    assert.equal(store.get('ci/cccc').toString(), 'new')
    assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD' })).status, 401)
    assert.equal(
      (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { headers: { authorization: 'Bearer x' } }))
        .status,
      401
    )
    // A path segment that could climb out of the team's prefix is refused before any S3 call.
    const before = s.calls.length
    assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=..`, { headers: auth })).status, 400)
    assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa`, { headers: auth })).status, 400)
    assert.equal(s.calls.length, before)
  } finally {
    s.close()
  }
})
