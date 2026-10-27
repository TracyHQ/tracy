/**
 * One workspace, one site (15/09/2026): which sites the left column lists beside the open one.
 * A site that is not open is its own seat, so it is one row that opens `/<siteKey>/`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  currentSiteKey,
  hasPageToShow,
  inCreationWorkspace,
  otherSites,
  siteWorkspacePath
} from '../src/client/sites.mjs'

test('the creation workspace opens on no site', () => {
  assert.equal(inCreationWorkspace('/new/'), true)
  assert.equal(inCreationWorkspace('/'), false)
  assert.equal(
    currentSiteKey({
      pathname: '/new/s/session-1',
      basePathname: '/new/',
      cookie: 'tracy_site=lantern.tracy.test'
    }),
    null
  )
})

test('the open site comes from the path on arrival, else from the tracy_site pointer', () => {
  assert.equal(
    currentSiteKey({ pathname: '/lantern.tracy.test/', basePathname: '/', cookie: '' }),
    'lantern.tracy.test'
  )
  assert.equal(
    currentSiteKey({
      pathname: '/s/session-1',
      basePathname: '/',
      cookie: 'a=1; tracy_site=harbor.tracy.test'
    }),
    'harbor.tracy.test'
  )
  assert.equal(
    currentSiteKey({ pathname: '/manifest.webmanifest', basePathname: '/', cookie: '' }),
    null,
    "dsh's own root file is not a site"
  )
  assert.equal(currentSiteKey({ pathname: '/s/session-1', basePathname: '/', cookie: '' }), null)
})

test('other sites: accepted seats only, never the open one, by key', () => {
  const body = {
    sites: [
      { siteKey: 'zeta.tracy.test', status: 'accepted' },
      { siteKey: 'lantern.tracy.test', status: 'accepted' },
      { siteKey: 'alpha.tracy.test', status: 'accepted' },
      { siteKey: 'pending.tracy.test', status: 'pending' },
      { siteKey: '' },
      null
    ]
  }
  assert.deepEqual(otherSites(body, 'lantern.tracy.test'), ['alpha.tracy.test', 'zeta.tracy.test'])
  assert.deepEqual(otherSites({ code: 'NOT_SIGNED_IN' }, null), [])
  assert.deepEqual(otherSites(null, null), [])
})

test('other sites: a renamed open site stays out, named by its new address (bug 03/10/2026)', () => {
  const body = {
    sites: [
      {
        siteKey: 'scv2jo.scv2.tracy.test',
        displayName: 'scv2jo-lee.scv2.tracy.test',
        aliases: ['scv2jo.scv2.tracy.test', 'scv2jo-lee.scv2.tracy.test'],
        status: 'accepted'
      },
      { siteKey: 'scv2wp.scv2.tracy.test', status: 'accepted' }
    ]
  }
  assert.deepEqual(otherSites(body, 'scv2jo-lee.scv2.tracy.test'), ['scv2wp.scv2.tracy.test'])
})

test("choosing a site opens that site's own workspace", () => {
  assert.equal(siteWorkspacePath('harbor.tracy.test'), '/harbor.tracy.test/')
})

test('sharedSites asks once, again on refresh, and asks again soon after a failed ask', async () => {
  const { sharedSites, SITES_RETRY_MS } = await import('../src/client/sites.mjs')
  const scope = {}
  let clock = 0
  const now = () => clock
  let calls = 0
  let ok = true
  const fetch = async () => {
    calls += 1
    return { ok, json: async () => ({ sites: [{ siteKey: `s${calls}.tracy.test` }] }) }
  }
  const first = await sharedSites({ fetch, scope, now })
  const second = await sharedSites({ fetch, scope, now })
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
  await sharedSites({ fetch, scope, now, refresh: true })
  assert.equal(calls, 2)
  ok = false
  assert.equal(await sharedSites({ fetch, scope, now, refresh: true }), null)
  ok = true
  await sharedSites({ fetch, scope, now })
  assert.equal(calls, 3, 'a failed ask holds the next read back for a moment')
  clock += SITES_RETRY_MS
  await sharedSites({ fetch, scope, now })
  assert.equal(calls, 4)
})

// ── #340: one `/api/sites` ask serves the page ──────────────────────────────────────────────────

/** A door that counts asks and holds each answer until `release()`, so tests can act mid-flight. */
function slowDoor(rows, status = 200) {
  const d = { calls: 0, pending: [] }
  d.fetch = (url) => {
    assert.equal(url, '/api/sites')
    d.calls += 1
    const snapshot = rows()
    return new Promise((resolve) => {
      d.pending.push(() => resolve({ ok: status < 300, status, json: async () => ({ sites: snapshot }) }))
    })
  }
  d.release = () => {
    for (const r of d.pending.splice(0)) r()
  }
  return d
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

test('readSites: concurrent readers and later readers inside the window share one ask', async () => {
  const { readSites, SITES_FRESH_MS } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  let clock = 0
  const now = () => clock
  const d = slowDoor(() => [])
  const asks = Array.from({ length: 50 }, () => readSites({ fetch: d.fetch, scope, now }))
  d.release()
  const answers = await Promise.all(asks)
  assert.equal(d.calls, 1)
  // An empty list is an answer, kept like any other.
  assert.deepEqual(answers[49], { status: 200, body: { sites: [] } })
  clock += SITES_FRESH_MS - 1
  await readSites({ fetch: d.fetch, scope, now })
  assert.equal(d.calls, 1)
  clock += 1
  const late = readSites({ fetch: d.fetch, scope, now })
  d.release()
  await late
  assert.equal(d.calls, 2, 'past the window the next read asks; nothing asked on its own before it')
})

test('readSites: every listener refreshing on one tracy:sites-changed shares one ask', async () => {
  const { readSites, SITES_CHANGED } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  const d = slowDoor(() => [])
  const first = readSites({ fetch: d.fetch, scope })
  d.release()
  await first
  const refreshed = []
  for (let i = 0; i < 3; i += 1) {
    scope.addEventListener(SITES_CHANGED, () =>
      refreshed.push(readSites({ fetch: d.fetch, scope, refresh: true }))
    )
  }
  scope.dispatchEvent(new Event(SITES_CHANGED))
  d.release()
  await Promise.all(refreshed)
  assert.equal(d.calls, 2, 'one ask for the page load, one for the change — not one per listener')
})

test('readSites: an ask sent before a site was deleted never brings that site back', async () => {
  const { readSites, SITES_CHANGED } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  let rows = [{ siteKey: 'gone.tracy.test' }]
  const d = slowDoor(() => rows)
  const before = readSites({ fetch: d.fetch, scope }) // on the wire when the delete lands
  await tick()
  rows = []
  scope.dispatchEvent(new Event(SITES_CHANGED))
  const after = readSites({ fetch: d.fetch, scope })
  d.release()
  await tick()
  d.release()
  // The caller holding the old ask gets the fresh read, not the site that was deleted.
  assert.deepEqual((await before).body, { sites: [] })
  assert.deepEqual((await after).body, { sites: [] })
  assert.deepEqual(
    (await readSites({ fetch: d.fetch, scope })).body,
    { sites: [] },
    'the old answer was not kept'
  )
  assert.equal(d.calls, 2)
})

test('readSites: a change announced in the same task an ask left in still retires it, once', async () => {
  const { readSites, SITES_CHANGED } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  let rows = [{ siteKey: 'gone.tracy.test' }]
  const d = slowDoor(() => rows)
  const before = readSites({ fetch: d.fetch, scope })
  const refreshed = []
  for (let i = 0; i < 3; i += 1) {
    scope.addEventListener(SITES_CHANGED, () =>
      refreshed.push(readSites({ fetch: d.fetch, scope, refresh: true }))
    )
  }
  // No tick: the event comes in the very task the first ask left in.
  rows = []
  scope.dispatchEvent(new Event(SITES_CHANGED))
  d.release()
  const answers = await Promise.all([before, ...refreshed])
  assert.equal(d.calls, 2, 'the change retires the first ask; its three listeners share one more')
  for (const answer of answers) assert.deepEqual(answer.body, { sites: [] })
})

test('readSites: polls refreshing while a slow ask is held never put two asks on the wire', async () => {
  const { readSites } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  let rows = [{ siteKey: 'a.tracy.test', agent: null }]
  const d = slowDoor(() => rows)
  let onWire = 0
  let most = 0
  const fetch = (url) => {
    onWire += 1
    most = Math.max(most, onWire)
    return d.fetch(url).finally(() => {
      onWire -= 1
    })
  }
  // Add site and My Sites each poll with `refresh` every 5 s; the door takes 18 s to answer.
  const first = readSites({ fetch, scope, refresh: true })
  const polls = []
  for (let i = 0; i < 3; i += 1) {
    await tick() // a later task, as a 5 s timer would be
    polls.push(readSites({ fetch, scope, refresh: true }))
  }
  assert.equal(d.calls, 1, 'three ticks while the first ask is held: still one ask')
  rows = [{ siteKey: 'a.tracy.test', agent: { id: 'x' } }] // the agent arrived meanwhile
  d.release()
  assert.deepEqual((await first).body, { sites: [{ siteKey: 'a.tracy.test', agent: null }] })
  await tick()
  assert.equal(d.calls, 2, 'the refreshes that waited share one ask sent after the first came back')
  d.release()
  for (const answer of await Promise.all(polls)) {
    assert.deepEqual(answer.body, { sites: rows }, 'a refresh reads an answer asked after it was made')
  }
  assert.equal(most, 1)
  // The shared read is kept: a plain read afterwards asks nothing.
  assert.deepEqual((await readSites({ fetch, scope })).body, { sites: rows })
  assert.equal(d.calls, 2)
})

test('readSites: an ask retired by a change and finishing last never paints over the newer one', async () => {
  const { readSites, SITES_CHANGED } = await import('../src/client/sites.mjs')
  const scope = new EventTarget()
  let rows = [{ siteKey: 'a.tracy.test' }, { siteKey: 'b.tracy.test' }]
  const resolvers = []
  const fetch = () => {
    const snapshot = rows
    return new Promise((resolve) => {
      resolvers.push(() => resolve({ ok: true, status: 200, json: async () => ({ sites: snapshot }) }))
    })
  }
  const older = readSites({ fetch, scope })
  await tick()
  const waiting = readSites({ fetch, scope, refresh: true }) // queued behind the older ask
  rows = [{ siteKey: 'a.tracy.test' }]
  scope.dispatchEvent(new Event(SITES_CHANGED))
  const newer = readSites({ fetch, scope, refresh: true })
  assert.equal(resolvers.length, 2)
  resolvers[1]() // the newer answer comes back first
  assert.deepEqual((await newer).body, { sites: [{ siteKey: 'a.tracy.test' }] })
  resolvers[0]()
  assert.deepEqual(
    (await older).body,
    { sites: [{ siteKey: 'a.tracy.test' }] },
    'the older caller gets the newer list'
  )
  assert.deepEqual((await waiting).body, { sites: [{ siteKey: 'a.tracy.test' }] })
  assert.deepEqual((await readSites({ fetch, scope })).body, { sites: [{ siteKey: 'a.tracy.test' }] })
  assert.equal(resolvers.length, 2)
})

test('readSites: a 401 and a failed ask are told apart', async () => {
  const { readSites } = await import('../src/client/sites.mjs')
  const signedOut = slowDoor(() => [], 401)
  const a = readSites({ fetch: signedOut.fetch, scope: new EventTarget() })
  signedOut.release()
  assert.equal((await a).status, 401)
  const down = await readSites({
    fetch: async () => {
      throw new TypeError('network')
    },
    scope: new EventTarget()
  })
  assert.deepEqual(down, { status: 0, body: null })
})

test('a site has a page to open only once it is built: an address alone is a claim, not a site', () => {
  // A press on Build claims the site by name before anything is built (`POST /api/sites/claim`):
  // the row already carries its draft address, and opening it shows "Site unavailable" on top of
  // the Build tab the customer was sent there to fill in (measured 17/09 on cowork.tracy.site).
  const claimed = {
    siteKey: 'site-k0vrup.tracy.site',
    copyUrl: 'https://site-k0vrup.tracy.site/',
    agent: null
  }
  assert.equal(hasPageToShow(claimed), false)
  assert.equal(hasPageToShow({ ...claimed, agent: '/' }), true)
  assert.equal(hasPageToShow({ ...claimed, copyUrl: null, agent: '/' }), false)
  assert.equal(hasPageToShow(undefined), false)
})
