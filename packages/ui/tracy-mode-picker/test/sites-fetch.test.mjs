#!/usr/bin/env node
/**
 * The picker asks `/api/sites` once per turn, not once per `sessions.list` change (issue #340).
 *
 * Measured 24/09 on dev: 53 slow `GET /api/sites` in one 10 s WordPress turn and 140 in one 53 s
 * EmDash turn. The picker re-read the site's platform on every `sessions.list` notification, and a
 * turn is dozens of them (each tool call, each status change). It now reads the page's one shared
 * answer (`tracy-sidebar`'s `readSites`), which every other plugin on the page reads too.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SITES_CHANGED, SITES_FRESH_MS, readSites } from '../../tracy-sidebar/src/client/sites.mjs'
import { sitePlatformReader } from '../src/client/site-platform.mjs'

/** A `/api/sites` door that counts its callers and answers what `rows()` holds at that moment. */
function door(rows, { status = 200 } = {}) {
  const door = { calls: 0 }
  door.fetch = async (url) => {
    assert.equal(url, '/api/sites')
    door.calls += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return { ok: status >= 200 && status < 300, status, json: async () => ({ sites: rows() }) }
  }
  return door
}

test('fifty session changes in one turn, while the first ask is still on the wire, ask once', async () => {
  const d = door(() => [{ siteKey: 'a.example', platform: 'wordpress' }])
  const read = sitePlatformReader({ fetch: d.fetch, scope: new EventTarget() })
  const answers = await Promise.all(Array.from({ length: 50 }, () => read('a.example')))
  assert.deepEqual(new Set(answers), new Set(['wordpress']))
  assert.equal(d.calls, 1)
})

test('140 changes spread over a 56 s turn ask once per freshness window, never once per change', async () => {
  let clock = 0
  const d = door(() => [{ siteKey: 'a.example', platform: 'emdash' }])
  const read = sitePlatformReader({ fetch: d.fetch, now: () => clock, scope: new EventTarget() })
  for (let i = 0; i < 140; i += 1) {
    clock += 400
    assert.equal(await read('a.example'), 'emdash')
  }
  assert.equal(d.calls, Math.ceil((140 * 400) / SITES_FRESH_MS))
})

test('the picker and the other readers on the page share one ask', async () => {
  const scope = new EventTarget()
  const d = door(() => [{ siteKey: 'a.example', platform: 'joomla' }])
  const read = sitePlatformReader({ fetch: d.fetch, scope })
  const [platform, list] = await Promise.all([read('a.example'), readSites({ fetch: d.fetch, scope })])
  assert.equal(platform, 'joomla')
  assert.equal(list.status, 200)
  assert.equal(d.calls, 1)
})

test('a site still being provisioned: its CMS is picked up by the next read after the window', async () => {
  let clock = 0
  let platform = null
  const d = door(() => [{ siteKey: 'new.example', platform }])
  const read = sitePlatformReader({ fetch: d.fetch, now: () => clock, scope: new EventTarget() })
  assert.equal(await read('new.example'), null)
  for (let i = 0; i < 20; i += 1) assert.equal(await read('new.example'), null)
  assert.equal(d.calls, 1, 'inside the window the null answer is reused')
  platform = 'joomla'
  clock += SITES_FRESH_MS
  assert.equal(await read('new.example'), 'joomla')
  assert.equal(d.calls, 2)
})

test('a site deleted and made again under the same key on another CMS is read afresh', async () => {
  const scope = new EventTarget()
  let platform = 'wordpress'
  const d = door(() => [{ siteKey: 'a.example', platform }])
  const read = sitePlatformReader({ fetch: d.fetch, scope })
  assert.equal(await read('a.example'), 'wordpress')
  platform = 'emdash'
  scope.dispatchEvent(new Event(SITES_CHANGED)) // My Sites' delete, then Add site's create
  assert.equal(await read('a.example'), 'emdash')
  assert.equal(d.calls, 2)
})

test('a refused or failed ask is not a platform', async () => {
  const refused = door(() => [], { status: 401 })
  const read = sitePlatformReader({ fetch: refused.fetch, scope: new EventTarget() })
  assert.equal(await read('a.example'), null)
  assert.equal(await read('a.example'), null)
  assert.equal(refused.calls, 1, 'a signed-out answer is kept like any answer')

  const broken = sitePlatformReader({
    fetch: async () => {
      throw new TypeError('network')
    },
    scope: new EventTarget()
  })
  assert.equal(await broken('a.example'), null)
})

test('a renamed site is read by its new name too: the address carries it (bug 03/10/2026)', async () => {
  const d = door(() => [
    {
      siteKey: 'jo.example',
      displayName: 'jo-lee.example',
      aliases: ['jo.example', 'jo-lee.example'],
      platform: 'joomla'
    }
  ])
  const read = sitePlatformReader({ fetch: d.fetch, scope: new EventTarget() })
  assert.equal(await read('jo-lee.example'), 'joomla')
  assert.equal(await read('jo.example'), 'joomla')
})
