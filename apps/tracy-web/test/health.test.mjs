import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'

test('GET /health answers 200 with ok:true', async () => {
  const app = buildApp({})
  const res = await app.fetch(new Request('http://tracy.test/health'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})
