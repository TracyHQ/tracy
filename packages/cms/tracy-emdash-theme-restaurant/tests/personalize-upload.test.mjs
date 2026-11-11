// The site's bearer token goes only to the site's own origin when a picture is uploaded: EmDash answers either its own
// relative route or a signed URL on the storage's origin, and a foreign origin must never see the token. The same rule
// as apps/tracy-web/src/write-step/emdash-brand-door.js.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { uploadPicture, uploadRequest } from '../tools/personalize.mjs'

const SITE = 'http://127.0.0.1:4321'
const TOKEN = 'ec_pat_secret'
const o = { site: SITE, token: TOKEN, mime: 'image/png' }

test("the site's own relative upload route carries the bearer and the request marker", () => {
  const { url, init } = uploadRequest({ uploadUrl: '/_emdash/api/media/m1/upload', method: 'PUT' }, o)
  assert.equal(url.href, `${SITE}/_emdash/api/media/m1/upload`)
  assert.equal(init.headers.get('authorization'), `Bearer ${TOKEN}`)
  assert.equal(init.headers.get('x-emdash-request'), '1')
  assert.equal(init.headers.get('content-type'), 'image/png')
  assert.equal(init.redirect, 'error')
})

test("an absolute URL on the site's own origin is the site's own door", () => {
  const { init } = uploadRequest({ uploadUrl: `${SITE}/_emdash/api/media/m1/upload` }, o)
  assert.equal(init.headers.get('authorization'), `Bearer ${TOKEN}`)
  assert.equal(init.method, 'PUT')
})

test('a signed URL on another origin gets no bearer and no marker, and keeps its signed headers', () => {
  const ask = {
    uploadUrl: 'https://bucket.storage.example/up/m1?X-Amz-Signature=abc',
    method: 'PUT',
    headers: {
      'x-amz-meta-owner': 'tracy',
      'x-amz-acl': 'private',
      authorization: 'Bearer leak',
      'X-EmDash-Request': '1'
    }
  }
  const { url, init } = uploadRequest(ask, o)
  assert.equal(url.origin, 'https://bucket.storage.example')
  assert.equal(init.headers.get('authorization'), null)
  assert.equal(init.headers.get('x-emdash-request'), null)
  assert.equal(init.headers.get('x-amz-meta-owner'), 'tracy')
  assert.equal(init.headers.get('x-amz-acl'), 'private')
  assert.equal(init.headers.get('content-type'), 'image/png')
  assert.equal(init.redirect, 'error', 'a redirect is refused: it could carry the request to another origin')
})

test('the same host on another port or scheme is another origin', () => {
  for (const uploadUrl of ['http://127.0.0.1:9000/up', 'https://127.0.0.1:4321/up', '//cdn.example/up']) {
    const { init } = uploadRequest({ uploadUrl }, o)
    assert.equal(init.headers.get('authorization'), null, uploadUrl)
  }
})

test('uploadPicture sends the bytes through that request and confirms the upload on the site', async () => {
  const calls = []
  const api = async (method, route, _body) => {
    calls.push([method, route])
    if (route === '/_emdash/api/media/upload-url')
      return {
        mediaId: 'm1',
        uploadUrl: 'https://bucket.storage.example/up/m1?sig=1',
        headers: { 'x-amz-acl': 'private' }
      }
    if (route === '/_emdash/api/media/m1') return { item: { id: 'm1', storageKey: 'k1', filename: 'a.png' } }
    return {}
  }
  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), init })
    return { ok: true, status: 200 }
  }
  const value = await uploadPicture(
    api,
    TOKEN,
    { bytes: Buffer.from('png'), mime: 'image/png', filename: 'a.png' },
    { fetchImpl, site: SITE }
  )
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, 'https://bucket.storage.example/up/m1?sig=1')
  assert.equal(sent[0].init.headers.get('authorization'), null)
  assert.equal(sent[0].init.headers.get('x-amz-acl'), 'private')
  assert.equal(sent[0].init.redirect, 'error')
  assert.deepEqual(calls.map((c) => c[1]).slice(0, 2), [
    '/_emdash/api/media/upload-url',
    '/_emdash/api/media/m1/confirm'
  ])
  assert.equal(value.id, 'm1')
  // a refused upload is an error, not a silent picture
  await assert.rejects(
    uploadPicture(
      api,
      TOKEN,
      { bytes: Buffer.from('png'), mime: 'image/png', filename: 'a.png' },
      { fetchImpl: async () => ({ ok: false, status: 403 }), site: SITE }
    ),
    /HTTP 403/
  )
})

test('no tool of this theme sends the token to the URL EmDash returned', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../tools/personalize.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /ask\.uploadUrl\.startsWith\('http'\)/, 'the old unconditional send is gone')
})
