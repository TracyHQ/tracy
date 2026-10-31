// Where the site agent's calls to tracy-web are sent (#208): the host's internal origin when it names
// one, the public origin otherwise; never a malformed value, never for a call planned elsewhere.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callOrigin, createInternalOrigin, FLEET_TRACY_WEB } from '../src/host/call-origin.mjs'

const PUBLIC = 'https://cowork.tracy.site'

test('a host that names an internal origin sends its calls there; the public origin stays for people (#208)', () => {
  assert.equal(callOrigin(PUBLIC, PUBLIC, 'http://tracy-web:8080'), 'http://tracy-web:8080')
  assert.equal(callOrigin(PUBLIC, PUBLIC, null), PUBLIC, 'none named: the public origin, as before')
  assert.equal(callOrigin(PUBLIC, PUBLIC, ''), PUBLIC)
  assert.equal(callOrigin(PUBLIC, PUBLIC, 'http://tracy-web:8080/api'), PUBLIC, 'a path is not an origin')
  assert.equal(callOrigin(PUBLIC, PUBLIC, 'tracy-web:8080'), PUBLIC, 'no scheme')
  assert.equal(
    callOrigin('http://test.local', PUBLIC, 'http://tracy-web:8080'),
    'http://test.local',
    'a test’s own origin'
  )
})

// #208, what #261 left to the operator: a fleet dsh finds tracy-web on its own network by itself.
test('a fleet dsh finds tracy-web on its own network; a name that does not resolve keeps the public origin (#208)', async () => {
  let clock = 0
  let resolves = true
  let asked = 0
  const resolve = async (/** @type {string} */ host) => {
    asked += 1
    assert.equal(host, 'tracy-web')
    if (!resolves) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
  }
  const fleet = createInternalOrigin({ configured: () => null, fleet: () => true, resolve, now: () => clock })
  assert.equal(await fleet(), FLEET_TRACY_WEB)
  assert.equal(await fleet(), FLEET_TRACY_WEB)
  assert.equal(asked, 1, 'kept, not asked per call')
  assert.equal(callOrigin(PUBLIC, PUBLIC, await fleet()), 'http://tracy-web:8080')
  // A shard whose tracy-web is elsewhere: the name does not resolve, nothing was sent, public origin.
  resolves = false
  clock = 301_000
  assert.equal(await fleet(), null)
  assert.equal(callOrigin(PUBLIC, PUBLIC, await fleet()), PUBLIC)
  // The host's own setting wins; a dsh that is not a fleet host never guesses.
  const named = createInternalOrigin({ configured: () => 'http://10.0.0.5:8080', fleet: () => true, resolve })
  assert.equal(await named(), 'http://10.0.0.5:8080')
  const laptop = createInternalOrigin({ configured: () => null, fleet: () => false, resolve })
  asked = 0
  assert.equal(await laptop(), null)
  assert.equal(asked, 0)
})
