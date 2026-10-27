// Which Tracy the open app connects to: the app host for sign-in, the API host for /v1.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readStandaloneConfig } from '../src/standalone/config.js'

const base = { DATABASE_URL: 'postgres://x@localhost/x' }

test('with nothing set, sign-in goes to cowork.tracy.ai and /v1 to api.tracy.ai', () => {
  const c = readStandaloneConfig(base)
  assert.equal(c.tracyUrl, 'https://cowork.tracy.ai')
  assert.equal(c.tracyApiUrl, 'https://api.tracy.ai')
})

test('another Tracy names its own API, or answers /v1 on its app host', () => {
  const both = readStandaloneConfig({
    ...base,
    TRACY_URL: 'https://app.staging.example/',
    TRACY_API_URL: 'https://api.staging.example'
  })
  assert.equal(both.tracyUrl, 'https://app.staging.example')
  assert.equal(both.tracyApiUrl, 'https://api.staging.example')
  const one = readStandaloneConfig({ ...base, TRACY_URL: 'http://localhost:8080' })
  assert.equal(one.tracyApiUrl, null)
})
