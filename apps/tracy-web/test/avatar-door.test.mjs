// `GET /auth/avatar/:accountId` — a person's provider picture, served by Tracy (09/10/2026). The
// page never asks Google or GitHub itself: no viewer's address reaches a third party, `img-src
// 'self'` holds, and an expired provider address does not break a face.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import { avatarPictures } from '../src/identity/avatar.js'
import { mintSession } from '../src/lib/session.js'
import { personFace } from '../src/lib/person-face.js'

const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

const PICTURE = 'https://lh3.googleusercontent.com/a/ACg8oc-sam=s96-c'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

/** A fake picture CDN: `routes` maps an address to a function answering it. Records every call. */
function cdn(routes) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    const answer = routes[String(input)]
    if (!answer) return new Response('not found', { status: 404 })
    return answer(init)
  }
  return { calls, fetchImpl }
}

const png = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })

async function world({ routes = { [PICTURE]: png }, picture = PICTURE } = {}) {
  const store = memoryIdentityStore()
  const sam = await store.touchAccount('sam@example.test')
  if (picture) await store.rememberProfile(sam.id, { picture })
  const viewer = await store.touchAccount('lee@example.test')
  const { calls, fetchImpl } = cdn(routes)
  const app = buildApp({ config, identity: store, mail: { send: async () => {} }, fetchImpl })
  const cookie = `tracy_sess=${await mintSession('lee@example.test', config.sessionSecret)}`
  const get = (path, headers = {}) =>
    app.fetch(new Request(`http://tracy.test${path}`, { headers: { cookie, ...headers } }))
  const door = personFace({ id: sam.id, email: 'sam@example.test', avatar_url: picture }).avatarUrl
  return { store, sam, viewer, calls, get, app, door }
}

test('a signed-in viewer gets the picture: image bytes, a long private cache, an ETag, no sniffing', async () => {
  const { get, door, calls } = await world()
  const res = await get(door)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG)
  assert.match(res.headers.get('cache-control'), /^private, max-age=\d{5,}/)
  assert.match(res.headers.get('etag'), /^"[0-9a-f]{16,}"$/)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(calls.length, 1)
  // Fetched server-side, sending nothing of the viewer's (no cookie), following no redirect blindly.
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(calls[0].init.headers?.cookie, undefined)
})

test('nobody signed in → 401, and the provider is never asked', async () => {
  const { app, door, calls } = await world()
  const res = await app.fetch(new Request(`http://tracy.test${door}`))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { code: 'NOT_SIGNED_IN' })
  assert.equal(calls.length, 0)
})

test('an account with no picture, or no account at all → 404', async () => {
  const { get, viewer, calls } = await world()
  assert.equal((await get(`/auth/avatar/${viewer.id}`)).status, 404)
  assert.equal((await get('/auth/avatar/00000000-0000-0000-0000-000000000000')).status, 404)
  assert.equal(calls.length, 0)
})

test('a stored address outside the provider picture hosts is never fetched → 404', async () => {
  const evil = 'https://evil.example/track.png'
  const { get, sam, calls } = await world({ picture: evil, routes: { [evil]: png } })
  assert.equal((await get(`/auth/avatar/${sam.id}`)).status, 404)
  assert.equal(calls.length, 0)
})

test('the second read is served from Tracy’s cache, and a matching If-None-Match answers 304', async () => {
  const { get, door, calls } = await world()
  const first = await get(door)
  const etag = first.headers.get('etag')
  assert.equal((await get(door)).status, 200)
  const again = await get(door, { 'if-none-match': etag })
  assert.equal(again.status, 304)
  assert.equal(again.headers.get('etag'), etag)
  assert.equal(calls.length, 1, 'one provider request for three reads')
})

test('a new picture after a later sign-in is fetched anew, under a new address', async () => {
  const next = 'https://avatars.githubusercontent.com/u/7?v=4'
  const { get, door, sam, store, calls } = await world({ routes: { [PICTURE]: png, [next]: png } })
  await get(door)
  await store.rememberProfile(sam.id, { picture: next })
  const newDoor = personFace({ id: sam.id, email: 'sam@example.test', avatar_url: next }).avatarUrl
  assert.notEqual(newDoor, door)
  assert.equal((await get(newDoor)).status, 200)
  assert.deepEqual(
    calls.map((c) => c.url),
    [PICTURE, next]
  )
})

test('an answer that is not an image (or is SVG) → 502, nothing passed through', async () => {
  for (const type of ['text/html', 'image/svg+xml', '']) {
    const { get, door } = await world({
      routes: { [PICTURE]: () => new Response('<html>', { status: 200, headers: { 'content-type': type } }) }
    })
    const res = await get(door)
    assert.equal(res.status, 502, type)
    assert.deepEqual(await res.json(), { code: 'AVATAR_UNAVAILABLE' })
  }
})

test('a picture over 1 MB → 502, whether or not the provider said its length', async () => {
  const big = new Uint8Array(1024 * 1024 + 1)
  for (const headers of [
    { 'content-type': 'image/png' },
    { 'content-type': 'image/png', 'content-length': String(big.length) }
  ]) {
    const { get, door } = await world({
      routes: { [PICTURE]: () => new Response(big, { status: 200, headers }) }
    })
    assert.equal((await get(door)).status, 502)
  }
})

test('a redirect is followed only onto another provider picture host', async () => {
  const hop = 'https://lh4.googleusercontent.com/a/sam'
  const ok = await world({
    routes: {
      [PICTURE]: () => new Response(null, { status: 302, headers: { location: hop } }),
      [hop]: png
    }
  })
  assert.equal((await ok.get(ok.door)).status, 200)
  assert.equal(ok.calls[1].init.redirect, 'manual')

  const away = 'https://tracker.example/pixel.png'
  const bad = await world({
    routes: {
      [PICTURE]: () => new Response(null, { status: 302, headers: { location: away } }),
      [away]: png
    }
  })
  assert.equal((await bad.get(bad.door)).status, 502)
  assert.deepEqual(
    bad.calls.map((c) => c.url),
    [PICTURE],
    'the other host is never asked'
  )
})

test('a provider that does not answer in time → 502 (the module gives up on its own timeout)', async (t) => {
  // The fake fetch has no socket to keep Node alive for AbortSignal.timeout's unreferenced timer.
  const pendingSocket = setInterval(() => {}, 1000)
  t.after(() => clearInterval(pendingSocket))
  const pictures = avatarPictures({
    timeoutMs: 20,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      })
  })
  assert.equal(await pictures.get('acc-1', PICTURE), null)
})

test('a failed fetch is not cached: the next read asks the provider again', async () => {
  let n = 0
  const { get, door, calls } = await world({
    routes: { [PICTURE]: () => (++n === 1 ? new Response('busy', { status: 503 }) : png()) }
  })
  assert.equal((await get(door)).status, 502)
  assert.equal((await get(door)).status, 200)
  assert.equal(calls.length, 2)
})
