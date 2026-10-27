import test from 'node:test'
import assert from 'node:assert/strict'
import { publicOrigin } from '../src/lib/public-origin.ts'

test('public origin hides Docker hostnames behind the configured site address', () => {
  assert.equal(
    publicOrigin(new URL('http://business-web-1:4321/ru/about'), 'https://business.example/'),
    'https://business.example'
  )
})
test('standalone local development uses the request origin without configuration', () => {
  assert.equal(publicOrigin(new URL('http://127.0.0.1:4360/about'), ''), 'http://127.0.0.1:4360')
})
test('invalid configured origins fail explicitly', () => {
  for (const value of [
    'file:///tmp/site',
    'https://user:pass@example.test/',
    'https://example.test/subpath',
    'https://example.test/?token=secret'
  ]) {
    assert.throws(() => publicOrigin(new URL('http://internal:4321'), value))
  }
})
