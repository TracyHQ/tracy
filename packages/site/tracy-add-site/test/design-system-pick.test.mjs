#!/usr/bin/env node
/**
 * The Design system pick of the Add site form (U1 A + U7 A, Akemi 12/10/2026): only `ok` library rows are offered,
 * support is never invented (a door that does not say `supported: true` is a "no"), and the pick is written to the new
 * site once.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyPick,
  fontOf,
  jobPickOf,
  pickLine,
  quickstartTagOf,
  readLibrary,
  PREVIEW_WAIT_MS,
  previewModeOf,
  readPreview,
  readSupport,
  resetLibrary,
  shownSystems,
  swatchesOf
} from '../src/client/design-system-pick.mjs'

const answer = (status, body) => async () => new Response(JSON.stringify(body), { status })

test('the sheet offers only the rows that passed the quality gate', () => {
  const rows = shownSystems({
    systems: [
      { id: 'stripe', name: 'Stripe', ok: true },
      { id: 'airbnb', name: 'Airbnb', ok: false },
      { id: '', name: 'No id', ok: true },
      // OpenDesign is no longer offered (Akemi, 12/10/2026), even a row an older server marks ok.
      { id: 'od:linear', name: 'Linear', ok: true },
      { id: 'refero:9a', name: 'Notion', ok: true }
    ]
  })
  assert.deepEqual(
    rows?.map((r) => r.id),
    ['stripe', 'refero:9a']
  )
  assert.equal(shownSystems({ nope: true }), null)
})

test('a library door that fails is asked again on Try again', async () => {
  resetLibrary()
  assert.equal(await readLibrary(answer(500, {})), null)
  const rows = await readLibrary(answer(200, { systems: [{ id: 'stripe', name: 'Stripe', ok: true }] }))
  assert.equal(rows?.length, 1)
  resetLibrary()
})

test('support is only a door that answers supported: true', async () => {
  assert.equal(
    await readSupport(
      { quickstart: 'tracy-business/emdash-0.x', platform: 'emdash' },
      answer(200, { supported: true })
    ),
    true
  )
  assert.equal(
    await readSupport(
      { quickstart: 'x', platform: 'joomla' },
      answer(200, { supported: false, reason: 'r' })
    ),
    false
  )
  assert.equal(await readSupport({ quickstart: 'x', platform: 'joomla' }, answer(404, {})), false)
  assert.equal(
    await readSupport({ quickstart: 'x', platform: 'joomla' }, async () => {
      throw new Error('offline')
    }),
    false
  )
  // No tag to ask about: nothing is asked and nothing is promised.
  let asked = false
  assert.equal(
    await readSupport({ quickstart: undefined, platform: 'joomla' }, async () => {
      asked = true
      return new Response('{}')
    }),
    false
  )
  assert.equal(asked, false)
})

test('the quickstart tag is the card build on the platform in sight', () => {
  const card = {
    platforms: [
      { platform: 'joomla', tag: 'quickstart/ja-essence/j6' },
      { platform: 'emdash', tag: 'tb/emdash-0.x' }
    ]
  }
  assert.equal(quickstartTagOf(card, 'emdash'), 'tb/emdash-0.x')
  assert.equal(quickstartTagOf(card, 'wordpress'), undefined)
  assert.equal(quickstartTagOf(null, 'joomla'), undefined)
})

test('the pick travels with the create request: the server reports it on the job, read as sent, never invented', () => {
  const id = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
  assert.deepEqual(jobPickOf({ id, name: 'Moxie', state: 'applying' }), {
    id,
    name: 'Moxie',
    state: 'applying',
    reason: null
  })
  assert.deepEqual(jobPickOf({ id, name: 'Moxie', state: 'skipped', reason: 'DS_TEMPLATE_CANNOT_WEAR: X' }), {
    id,
    name: 'Moxie',
    state: 'skipped',
    reason: 'DS_TEMPLATE_CANNOT_WEAR: X'
  })
  // No name: the id is said rather than nothing.
  assert.equal(jobPickOf({ id, state: 'applied' })?.name, id)
  for (const bad of [undefined, null, 'x', [], {}, { id: 3, state: 'applied' }, { id, state: 'later' }])
    assert.equal(jobPickOf(bad), null, JSON.stringify(bad))
})

test('the line under the steps: running while the server applies, done once applied, failed when it was not', () => {
  const pick = (state) => ({ id: 'refero:x', name: 'Moxie', state, reason: null })
  assert.deepEqual(pickLine(pick('queued')), { at: 'running', name: 'Moxie' })
  assert.deepEqual(pickLine(pick('applying')), { at: 'running', name: 'Moxie' })
  assert.deepEqual(pickLine(pick('applied')), { at: 'done', name: 'Moxie' })
  assert.deepEqual(pickLine(pick('skipped')), { at: 'failed', name: 'Moxie' })
  assert.deepEqual(pickLine(pick('failed')), { at: 'failed', name: 'Moxie' })
  assert.equal(pickLine(null), null)
})

test('Try again on the ready screen posts { id } once and reports a refusal by its code', async () => {
  const sent = []
  const ok = await applyPick('fresh.tracy.ai', 'stripe', async (url, init) => {
    sent.push([url, init.method, init.body])
    return new Response('{}', { status: 200 })
  })
  assert.deepEqual(ok, { ok: true })
  assert.deepEqual(sent, [['/api/sites/fresh.tracy.ai/design-system', 'POST', '{"id":"stripe"}']])
  assert.deepEqual(await applyPick('s', 'stripe', answer(409, { code: 'DS_TEMPLATE_CANNOT_WEAR' })), {
    ok: false,
    code: 'DS_TEMPLATE_CANNOT_WEAR'
  })
})

test('the swatch font is read from the shapes the library may use', () => {
  assert.equal(fontOf(['Inter', 'Lora']), 'Inter')
  assert.equal(fontOf([{ family: 'Lora' }]), 'Lora')
  assert.equal(fontOf({ display: { name: 'Fraunces' }, body: 'Inter' }), 'Fraunces')
  assert.equal(fontOf(null), null)
})

test('swatchesOf: the own palette of the row, hex only, each once, at most four; none without one', () => {
  assert.deepEqual(
    swatchesOf(
      /** @type {any} */ ({
        colors: ['#FF385C', '#ffffff', '#ff385c', 'red', 3, '#222222', '#6a6a6a', '#000']
      })
    ),
    ['#ff385c', '#ffffff', '#222222', '#6a6a6a']
  )
  assert.deepEqual(swatchesOf(/** @type {any} */ ({ colors: [] })), [])
  assert.deepEqual(swatchesOf(/** @type {any} */ ({})), [])
  assert.deepEqual(swatchesOf(null), [])
})

test('readPreview: a door that never answers is failed after the wait, and the request is aborted', async () => {
  let aborted = false
  const never = (/** @type {string} */ _url, /** @type {any} */ init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted'))
      })
    )
  const at = Date.now()
  assert.deepEqual(
    await readPreview({ quickstart: 't', platform: 'joomla', id: 'x' }, /** @type {any} */ (never), {
      waitMs: 30
    }),
    { at: 'failed' }
  )
  assert.ok(Date.now() - at < 1000, 'gave up on time')
  assert.equal(aborted, true)
  // A fetch that ignores the abort still ends at the wait.
  assert.deepEqual(
    await readPreview(
      { quickstart: 't', platform: 'joomla', id: 'x' },
      /** @type {any} */ (() => new Promise(() => {})),
      { waitMs: 30 }
    ),
    { at: 'failed' }
  )
  assert.ok(
    PREVIEW_WAIT_MS >= 20_000 && PREVIEW_WAIT_MS <= 60_000,
    'longer than a slow first build, short of forever'
  )
})

test('readPreview: the page on 200, not available only when the door says so, failed otherwise, nothing asked without a build', async () => {
  /** @type {string[]} */
  const asked = []
  const page = async (/** @type {string} */ url) => {
    asked.push(url)
    return new Response('<html><head></head><body>demo</body></html>', { status: 200 })
  }
  assert.deepEqual(
    await readPreview(
      { quickstart: 'tracy-business/j6', platform: 'joomla', id: 'refero:x' },
      /** @type {any} */ (page)
    ),
    { at: 'ready', html: '<html><head></head><body>demo</body></html>' }
  )
  assert.deepEqual(asked, [
    '/api/design-system/preview?quickstart=tracy-business%2Fj6&platform=joomla&id=refero%3Ax'
  ])
  assert.deepEqual(
    await readPreview(
      { quickstart: 't', platform: 'wordpress', id: 'x' },
      /** @type {any} */ (answer(409, { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'PLATFORM' }))
    ),
    { at: 'unavailable' }
  )
  assert.deepEqual(
    await readPreview(
      { quickstart: 't', platform: 'joomla', id: 'x' },
      /** @type {any} */ (answer(500, { code: 'X' }))
    ),
    { at: 'failed' }
  )
  assert.deepEqual(
    await readPreview(
      { quickstart: 't', platform: 'joomla', id: 'x' },
      /** @type {any} */ (
        async () => {
          throw new Error('offline')
        }
      )
    ),
    { at: 'failed' }
  )
  assert.deepEqual(await readPreview({ quickstart: undefined, platform: 'joomla', id: 'x' }), {
    at: 'unavailable'
  })
})

test('readPreview: over the per-account cap (429 RATE_LIMITED) is failed, so the popup offers Try again', async () => {
  const limited = async () =>
    new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'retry-after': '30' } })
  assert.deepEqual(await readPreview({ quickstart: 't', platform: 'joomla', id: 'x' }, limited), {
    at: 'failed'
  })
})

test("readPreview: a two-mode page (the door's x-tracy-ds-modes: both) is ready with modes; previewModeOf opens on its side", async () => {
  const page = async () =>
    new Response('<html><style>/* mode: dark */</style></html>', {
      status: 200,
      headers: { 'x-tracy-ds-modes': 'both' }
    })
  assert.deepEqual(
    await readPreview({ quickstart: 't', platform: 'emdash', id: 'x' }, /** @type {any} */ (page)),
    {
      at: 'ready',
      html: '<html><style>/* mode: dark */</style></html>',
      modes: true
    }
  )
  assert.equal(previewModeOf('<style>/* mode: dark */</style>', 'light'), 'dark')
  assert.equal(previewModeOf('<html></html>', 'dark'), 'dark')
  assert.equal(previewModeOf(null, null), 'light')
})

test('readPreview live: the demo itself with its ticket, its side and its modes; a bad address is failed; the picture stays static', async () => {
  /** @type {string[]} */
  const asked = []
  const door = (/** @type {any} */ body) => async (/** @type {string} */ url) => {
    asked.push(url)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  const src = 'https://tb-demo.tracy.site/?tracy_ds_preview=abc.def'
  assert.deepEqual(
    await readPreview(
      { quickstart: 'tracy-business/j6', platform: 'joomla', id: 'refero:x', live: true },
      /** @type {any} */ (door({ live: true, src, mode: 'dark', modes: true }))
    ),
    { at: 'ready', src, mode: 'dark', modes: true }
  )
  assert.deepEqual(asked, [
    '/api/design-system/preview?quickstart=tracy-business%2Fj6&platform=joomla&id=refero%3Ax&live=1'
  ])
  assert.deepEqual(
    await readPreview(
      { quickstart: 't', platform: 'joomla', id: 'x', live: true },
      /** @type {any} */ (door({ live: true, src, mode: 'sepia' }))
    ),
    { at: 'ready', src, mode: null }
  )
  for (const bad of ['javascript:alert(1)', 'not a url', null])
    assert.deepEqual(
      await readPreview(
        { quickstart: 't', platform: 'joomla', id: 'x', live: true },
        /** @type {any} */ (door({ live: true, src: bad }))
      ),
      { at: 'failed' }
    )
  // without `live` (the sheet's picture), nothing asks for the live frame
  asked.length = 0
  await readPreview({ quickstart: 't', platform: 'joomla', id: 'x' }, /** @type {any} */ (door({})))
  assert.ok(!asked[0].includes('live=1'))
})
