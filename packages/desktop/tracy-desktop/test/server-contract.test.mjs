import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { checkServerContract, judgeDoor, probeRequest } from '../build/check-server-contract.mjs'

const contract = JSON.parse(readFileSync(new URL('../server-contract.json', import.meta.url), 'utf8'))

/** A response as `judgeDoor` reads it. */
const answer = (status, { type = 'application/json', body = '', headers = {} } = {}) => ({
  status,
  headers: { 'content-type': type, ...headers },
  body
})

test('the contract names every door the signed-out shell calls on its origin', () => {
  const paths = contract.doors.map((door) => `${door.method} ${door.path}`)
  for (const expected of [
    'GET /',
    'GET /login',
    'POST /auth/link/browser',
    'GET /auth/link/:nonce',
    'POST /auth/link/:nonce/session',
    'GET /auth/me',
    'GET /signin',
    'GET /api/desktop/config',
    'POST /api/desktop/installs/opened'
  ])
    assert.ok(paths.includes(expected), `missing ${expected}`)
})

test('every door has a probe and an expectation beyond a status code', () => {
  for (const door of contract.doors) {
    assert.ok(door.probe, `${door.id}: no probe`)
    assert.equal(typeof door.expect.status, 'number', `${door.id}: no status`)
    const extra = ['contentType', 'json', 'location', 'headers'].filter((key) => key in door.expect)
    assert.ok(extra.length > 0, `${door.id}: a status alone proves only "not 404"`)
  }
})

test('a probe request carries the origin into headers and serialises the body', () => {
  const door = contract.doors.find((d) => d.id === 'auth-link-session')
  const { url, init } = probeRequest(door, 'https://cowork.example')
  assert.match(url, /^https:\/\/cowork\.example\/auth\/link\/[0-9a-f]{64}\/session$/)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Origin, 'https://cowork.example')
  assert.equal(init.redirect, 'manual')
  assert.equal(typeof init.body, 'string')
})

test('a door passes only when status, type and key fields all match', () => {
  const door = {
    id: 'link-status',
    expect: { status: 200, contentType: 'application/json', json: { status: 'expired' } }
  }
  assert.equal(judgeDoor(door, answer(200, { body: '{"status":"expired"}' })).ok, true)
  // The same status from a page that is not the door: an HTML 200 is a catch-all, not the contract.
  assert.equal(judgeDoor(door, answer(200, { type: 'text/html', body: '<html>' })).ok, false)
  assert.equal(judgeDoor(door, answer(200, { body: '{"state":"expired"}' })).ok, false)
  assert.equal(judgeDoor(door, answer(404, { type: 'text/plain', body: 'Not Found' })).ok, false)
})

test('json expectations distinguish a null field from a missing one', () => {
  const door = { id: 'me', expect: { status: 200, json: { email: { type: 'null' } } } }
  assert.equal(judgeDoor(door, answer(200, { body: '{"email":null}' })).ok, true)
  assert.equal(judgeDoor(door, answer(200, { body: '{}' })).ok, false)
  assert.equal(judgeDoor(door, answer(200, { body: 'not json' })).ok, false)
})

test('a redirect door is judged by where it sends the visitor', () => {
  const door = {
    id: 'approve',
    expect: { status: 302, location: { pathname: '/login', query: { next: { startsWith: '/signin?n=' } } } }
  }
  const to = (location) => answer(302, { type: '', headers: { location } })
  assert.equal(judgeDoor(door, to('https://o.example/login?next=%2Fsignin%3Fn%3Dab')).ok, true)
  assert.equal(judgeDoor(door, to('/login?next=%2Fsignin%3Fn%3Dab')).ok, true)
  assert.equal(judgeDoor(door, to('https://o.example/login')).ok, false)
  assert.equal(judgeDoor(door, to('https://o.example/elsewhere?next=%2Fsignin%3Fn%3Dab')).ok, false)
})

test('a failing door says what it saw', () => {
  const door = { id: 'x', expect: { status: 200, contentType: 'application/json' } }
  const verdict = judgeDoor(door, answer(302, { type: '', headers: { location: '/login' } }))
  assert.equal(verdict.ok, false)
  assert.match(verdict.reasons.join(' '), /302/)
})

test('a header expectation is matched case-insensitively on the name', () => {
  const door = { id: 'cfg', expect: { status: 200, headers: { 'Cache-Control': 'no-store' } } }
  assert.equal(judgeDoor(door, answer(200, { headers: { 'cache-control': 'no-store' } })).ok, true)
  assert.equal(judgeDoor(door, answer(200)).ok, false)
})

test('the whole check fails on exactly the door that broke, and on a lost request', async () => {
  const doors = [
    {
      id: 'a',
      method: 'GET',
      path: '/a',
      probe: { path: '/a' },
      expect: { status: 200, contentType: 'text/html' }
    },
    {
      id: 'b',
      method: 'GET',
      path: '/b',
      probe: { path: '/b' },
      expect: { status: 200, contentType: 'text/html' }
    },
    {
      id: 'c',
      method: 'GET',
      path: '/c',
      probe: { path: '/c' },
      expect: { status: 200, contentType: 'text/html' }
    }
  ]
  const fetch = async (url) => {
    if (url.endsWith('/c')) throw new Error('connection reset')
    return new Response(url.endsWith('/a') ? '<html>' : 'nope', {
      status: url.endsWith('/a') ? 200 : 404,
      headers: { 'content-type': url.endsWith('/a') ? 'text/html' : 'text/plain' }
    })
  }
  const results = await checkServerContract('https://o.example', { doors }, { fetch })
  assert.deepEqual(
    results.map((r) => [r.id, r.ok]),
    [
      ['a', true],
      ['b', false],
      ['c', false]
    ]
  )
  assert.match(results[2].reasons.join(' '), /connection reset/)
})

test('scope "packaged" leaves out doors only a source run with its own dsh calls', async () => {
  const doors = [
    {
      id: 'p',
      usedBy: 'packaged',
      method: 'GET',
      path: '/p',
      probe: { path: '/p' },
      expect: { status: 200, json: {} }
    },
    {
      id: 'l',
      usedBy: 'local-dsh',
      method: 'GET',
      path: '/l',
      probe: { path: '/l' },
      expect: { status: 200, json: {} }
    }
  ]
  const fetch = async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  const packaged = await checkServerContract('https://o.example', { doors }, { fetch, scope: 'packaged' })
  assert.deepEqual(
    packaged.map((r) => r.id),
    ['p']
  )
  const all = await checkServerContract('https://o.example', { doors }, { fetch, scope: 'all' })
  assert.deepEqual(
    all.map((r) => r.id),
    ['p', 'l']
  )
})

test("a probe is sent with the door's own method", () => {
  const door = {
    id: 'x',
    method: 'POST',
    path: '/x',
    probe: { path: '/x' },
    expect: { status: 400, json: {} }
  }
  assert.equal(probeRequest(door, 'https://o.example').init.method, 'POST')
})

test('an expectation the checker does not know is a broken contract, not a quiet mismatch', () => {
  const door = { id: 'typo', expect: { status: 200, json: { code: { oneof: ['A'] } } } }
  assert.throws(() => judgeDoor(door, answer(200, { body: '{"code":"A"}' })), /unknown expectation/)
})
