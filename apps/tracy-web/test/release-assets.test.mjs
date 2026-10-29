/**
 * Writing one file onto a release — the half of the quickstart story `scripts/tracy-setting.mjs`
 * deliberately does not do.
 *
 * WHY THE SCRIPT REFUSES AND THIS DOES NOT. The script prints a `gh release upload` line for a
 * person to run, because attaching a file to a customer-facing release is a decision and a script
 * run from a laptop is not the place to make it. Here the decision has already been made: an
 * administrator pressed a button on the operations page. What is left is doing it correctly, and
 * the one thing GitHub gets wrong quietly is a REPLACEMENT — upload over an existing name and it
 * answers 422 rather than replacing, so the old bytes stay on the release and the screen says
 * nothing.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deleteReleaseAsset, uploadReleaseAsset } from '../src/lib/release-assets.js'

const config = { github: null, releasesToken: 'ghp_x' }
const TAG = 'tracy-business/emdash-0.x'
const FILE = 'tracy_design_inspiration.json'

/**
 * GitHub, as much of it as this module touches: one release, its assets, and the upload host.
 * Every call is recorded so a test can say WHICH requests were made, in which order — the delete
 * before the upload is the whole point.
 */
function github({ release = { id: 7, assets: [{ id: 99, name: FILE }] }, status = {} } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url: String(url), method, body: init.body, headers: init.headers ?? {} })
    if (status.all) return new Response('no', { status: status.all })
    if (String(url).includes('/releases/tags/')) {
      if (status.release) return new Response('no', { status: status.release })
      return release === null
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(release), { status: 200 })
    }
    if (method === 'DELETE')
      return status.delete
        ? new Response('no', { status: status.delete })
        : new Response(null, { status: 204 })
    if (status.upload) return new Response('no', { status: status.upload })
    return new Response(JSON.stringify({ id: 1234, name: FILE }), { status: 201 })
  }
  return { fetchImpl, calls }
}

test('a file that is not on the release yet is uploaded, once', async () => {
  const { fetchImpl, calls } = github({ release: { id: 7, assets: [] } })
  const result = await uploadReleaseAsset(
    config,
    { tag: TAG, name: FILE, body: '{"a":1}', contentType: 'application/json' },
    { fetchImpl }
  )
  assert.deepEqual(result, { ok: true, replaced: false, id: 1234 })
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 0, 'nothing to delete')
  const upload = calls.at(-1)
  assert.match(
    upload.url,
    /^https:\/\/uploads\.github\.com\/repos\/JoomlArt-Products\/joomlart-products\/releases\/7\/assets\?name=/
  )
  assert.match(upload.url, /name=tracy_design_inspiration\.json/)
  assert.equal(upload.method, 'POST')
  assert.equal(upload.body, '{"a":1}')
  assert.equal(upload.headers['content-type'], 'application/json')
})

test('a file already on the release is DELETED first — GitHub does not replace, it refuses', async () => {
  const { fetchImpl, calls } = github()
  const result = await uploadReleaseAsset(config, { tag: TAG, name: FILE, body: '{}' }, { fetchImpl })
  assert.deepEqual(result, { ok: true, replaced: true, id: 1234 })
  const order = calls.map((c) => c.method)
  assert.deepEqual(order, ['GET', 'DELETE', 'POST'])
  assert.match(calls[1].url, /\/releases\/assets\/99$/, 'the asset is deleted by its own id')
})

test('delete removes the asset, and says so when there was none to remove', async () => {
  const there = github()
  assert.deepEqual(
    await deleteReleaseAsset(config, { tag: TAG, name: FILE }, { fetchImpl: there.fetchImpl }),
    {
      ok: true,
      deleted: true
    }
  )
  assert.deepEqual(
    there.calls.map((c) => c.method),
    ['GET', 'DELETE']
  )

  const gone = github({ release: { id: 7, assets: [] } })
  assert.deepEqual(
    await deleteReleaseAsset(config, { tag: TAG, name: FILE }, { fetchImpl: gone.fetchImpl }),
    {
      ok: true,
      deleted: false
    }
  )
  assert.equal(gone.calls.filter((c) => c.method === 'DELETE').length, 0)
})

test('a token GitHub refuses is a sentence naming the status, never a thrown 500', async () => {
  const { fetchImpl } = github({ status: { all: 401 } })
  const result = await uploadReleaseAsset(config, { tag: TAG, name: FILE, body: '{}' }, { fetchImpl })
  assert.equal(result.ok, false)
  assert.match(result.reason, /401/)
  assert.match(result.reason, /JoomlArt-Products\/joomlart-products/)

  const del = await deleteReleaseAsset(config, { tag: TAG, name: FILE }, { fetchImpl })
  assert.equal(del.ok, false)
  assert.match(del.reason, /401/)
})

test('a tag no release carries is an answer, not a failure of GitHub', async () => {
  const { fetchImpl } = github({ release: null })
  const result = await uploadReleaseAsset(
    config,
    { tag: 'tracy-ghost/j6', name: FILE, body: '{}' },
    { fetchImpl }
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /tracy-ghost\/j6/)
})

test('an upload GitHub refuses says so, and does not claim the file is on the release', async () => {
  const { fetchImpl } = github({ release: { id: 7, assets: [] }, status: { upload: 422 } })
  const result = await uploadReleaseAsset(config, { tag: TAG, name: FILE, body: '{}' }, { fetchImpl })
  assert.equal(result.ok, false)
  assert.match(result.reason, /422/)
  assert.match(result.reason, /tracy_design_inspiration\.json/)
})

test('a deployment with no way into the repository says which credential to set', async () => {
  const result = await uploadReleaseAsset(
    { github: null, releasesToken: null },
    { tag: TAG, name: FILE, body: '{}' },
    { fetchImpl: async () => new Response('never called', { status: 500 }) }
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /TRACY_RELEASES_GITHUB_TOKEN|GitHub App/)
})
