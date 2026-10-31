// Where the site agent's calls to tracy-web are sent (#208): the host's internal origin when it names
// one, the public origin otherwise; never a malformed value, never for a call planned elsewhere.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callOrigin } from '../src/host/call-origin.mjs'

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
