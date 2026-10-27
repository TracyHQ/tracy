/**
 * The Design system tab's preview reader (`design-system-door.mjs` `readSitePreview`): the tracy-web door
 * `GET /api/sites/:key/design-system/preview`, and the three states the popup draws from its answer.
 *
 *   node --test packages/design/tracy-design-inspiration/test/site-preview-reader.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SITE_PREVIEW_WAIT_MS, readSitePreview } from '../src/client/design-system-door.mjs'

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'

/** A fetch that records the address asked and answers with `res`. */
function fake(res) {
  /** @type {string[]} */
  const asked = []
  const doFetch = /** @type {any} */ (
    async (url) => {
      asked.push(String(url))
      if (res instanceof Error) throw res
      return res
    }
  )
  return { asked, doFetch }
}

test('asks the site door with the system and the template the read answered; a page is ready', async () => {
  const { asked, doFetch } = fake(new Response('<html><head></head></html>', { status: 200 }))
  const r = await readSitePreview(
    { siteKey: 'shop.tracy.test', id: MOXIE, template: 'joomla:tracy_base' },
    doFetch
  )
  assert.deepEqual(r, { at: 'ready', html: '<html><head></head></html>' })
  assert.equal(
    asked[0],
    `/api/sites/shop.tracy.test/design-system/preview?id=${encodeURIComponent(MOXIE)}&template=joomla%3Atracy_base&live=1`
  )
})

test('the live answer is the site itself to frame, with the side the system opens on; anything else in JSON is failed', async () => {
  const src = 'http://shop.tracy.test:51710/?tracy_ds_preview=abc.def'
  const live = fake(Response.json({ live: true, src, mode: 'dark' }))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, live.doFetch), {
    at: 'ready',
    src,
    mode: 'dark'
  })
  const noMode = fake(Response.json({ live: true, src, mode: 'sepia' }))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, noMode.doFetch), {
    at: 'ready',
    src,
    mode: null
  })
  for (const body of [{ live: true, src: 'javascript:alert(1)' }, { live: true }, { src }])
    assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, fake(Response.json(body)).doFetch), {
      at: 'failed'
    })
})

test('not available by the door is unavailable; any other refusal or no connection is failed', async () => {
  const unavailable = fake(
    Response.json({ code: 'DS_PREVIEW_UNAVAILABLE', reason: 'PLATFORM' }, { status: 409 })
  )
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, unavailable.doFetch), {
    at: 'unavailable',
    reason: 'PLATFORM'
  })
  assert.ok(!unavailable.asked[0].includes('template='), 'no template, none sent')
  // The door's reason comes along so the popup can say why (13/10/2026: a template without a slot said nothing).
  const noSlot = fake(Response.json({ code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' }, { status: 409 }))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, noSlot.doFetch), {
    at: 'unavailable',
    reason: 'NO_SLOT'
  })
  const bare = fake(Response.json({ code: 'DS_PREVIEW_UNAVAILABLE' }, { status: 409 }))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, bare.doFetch), {
    at: 'unavailable',
    reason: null
  })
  const failed = fake(Response.json({ code: 'DS_PREVIEW_FAILED' }, { status: 502 }))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, failed.doFetch), { at: 'failed' })
  const offline = fake(new Error('offline'))
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, offline.doFetch), { at: 'failed' })
  assert.deepEqual(await readSitePreview({ siteKey: null, id: MOXIE }, offline.doFetch), {
    at: 'unavailable',
    reason: null
  })
})

test('a door that never answers: failed after the wait, the request aborted', async () => {
  let aborted = false
  const never = (/** @type {string} */ _u, /** @type {any} */ init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted'))
      })
    )
  assert.deepEqual(
    await readSitePreview({ siteKey: 's', id: MOXIE }, /** @type {any} */ (never), { waitMs: 30 }),
    { at: 'failed' }
  )
  assert.equal(aborted, true)
  assert.deepEqual(
    await readSitePreview({ siteKey: 's', id: MOXIE }, /** @type {any} */ (() => new Promise(() => {})), {
      waitMs: 30
    }),
    { at: 'failed' }
  )
  assert.ok(SITE_PREVIEW_WAIT_MS >= 20_000 && SITE_PREVIEW_WAIT_MS <= 60_000)
})

test('over the per-account cap (429 RATE_LIMITED) is failed, so the popup offers Try again', async () => {
  const limited = fake(
    Response.json({ code: 'RATE_LIMITED' }, { status: 429, headers: { 'retry-after': '30' } })
  )
  assert.deepEqual(await readSitePreview({ siteKey: 's', id: MOXIE }, limited.doFetch), { at: 'failed' })
})
