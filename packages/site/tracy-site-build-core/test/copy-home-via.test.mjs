/**
 * The Build's call to design-inspiration's copy door names the site it builds.
 *
 *   node --test packages/site/tracy-site-build-core/test/copy-home-via.test.mjs
 *
 * Measured 29/09/2026 on a private stand: the `copy` stage of a WordPress build for `brand:<host>`
 * answered `404 UNKNOWN_ID`. The door resolves its folder with `siteDirFor` — the gate's
 * `x-dsh-allowed-folders` header, else where dsh stands (`/site`, the sites ROOT). The build calls
 * the door over loopback, straight at dsh and past the gate, so no header arrived, the door looked
 * for `/site/Brand/<host>`, found no brand, and refused a brand that sat in `/site/<label>/Brand`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ALLOWED_FOLDERS_HEADER } from '@tracy/core/site-dir'

import { copyHomeVia } from '../src/host/host.ts'

/** A copy door that starts a job, then answers it done on the first poll; every call recorded. */
function fakeDoor() {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: { ...init.headers } })
    if ((init.method ?? 'GET') === 'POST') return new Response(JSON.stringify({ job: 'j1' }), { status: 202 })
    return new Response(JSON.stringify({ state: 'done', version: { id: 'v1', title: 'Take 1' } }), {
      status: 200
    })
  }
  return { calls, fetchImpl }
}

test('every call to the copy door names the build folder as the one folder this caller may use', async () => {
  const { calls, fetchImpl } = fakeDoor()
  const copyHome = copyHomeVia('http://127.0.0.1:51700', '/site/brandwp', fetchImpl, 0)
  const answer = await copyHome({ id: 'brand:acme.example', prompt: 'Hello', chip: 'landing' })
  assert.deepEqual(answer, { ok: true, version: { id: 'v1', title: 'Take 1' } })
  assert.equal(calls.length, 2, 'one start, one poll')
  for (const call of calls)
    assert.equal(call.headers[ALLOWED_FOLDERS_HEADER], JSON.stringify(['/site/brandwp']))
  assert.match(calls[0].url, /\/copy\/brand%3Aacme\.example\/pages\/landing\/versions$/)
})

test('a relative folder is not sent: the door would ignore it, and the header must not lie', async () => {
  const { calls, fetchImpl } = fakeDoor()
  await copyHomeVia('http://127.0.0.1:51700', 'relative/folder', fetchImpl, 0)({ id: 'apple', prompt: 'x' })
  for (const call of calls) assert.equal(call.headers[ALLOWED_FOLDERS_HEADER], undefined)
})
