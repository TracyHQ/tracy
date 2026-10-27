/**
 * The seat-only side-card tabs, and who is allowed to see one.
 *
 * WHY THIS IS A TEST AND NOT A GATE. The thing that broke on 06/09 was an invariant held by the
 * ABSENCE of a configuration line: `@tracy/dsh-guest-bundle` never listed the two tabs, and
 * `scripts/check-lane-tabs.ts` read that one file. ADR 0014 removed the bundle, so there is no
 * file left to read — the decision moved into a running page, and only a test can stand where
 * the decision now is. `check-bundles` still pins that both plugins ship the built form of it.
 *
 * Everything here is the real helper; only `fetch`, the viewer and the side card are doubles.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUEST,
  SEAT,
  UNKNOWN,
  isLocalSurface,
  mayHoldSeatOnlyTab,
  readViewer,
  seatOnlyTab,
  tabIdsOfType,
  viewerFromAnswer
} from '@tracy/core/seat'

/** Let the helper's `then` run: it registers (or sweeps) one microtask after the answer. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A side card that records what was asked of it. */
function fakeSidebar(state = { bottomSplits: { kind: 'leaf', tabs: [] } }, records = []) {
  const listeners = new Set()
  return {
    registered: [],
    closed: [],
    state,
    /** The native records `openTabsOf` answers with (better-sidebar 0.21.1-tracy.1). */
    records,
    openTabsOf(type) {
      return this.records.filter((tab) => tab.type === type)
    },
    registerTab(descriptor) {
      this.registered.push(descriptor)
      return () => {
        this.registered = this.registered.filter((entry) => entry !== descriptor)
      }
    },
    closeTab(tabId) {
      this.closed.push(tabId)
    },
    getSnapshot() {
      return { state: this.state }
    },
    subscribeState(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    fire() {
      for (const listener of listeners) listener()
    },
    nativeTabs: [],
    mountedSession: undefined,
    nativeClosed: [],
    nativeListeners: new Set(),
    nativeSidebar() {
      return {
        close: (tabId) => {
          this.nativeClosed.push(tabId)
          this.nativeTabs = this.nativeTabs.filter((tab) => tab.tabId !== tabId)
          for (const listener of this.nativeListeners) listener()
        },
        mounted: {
          getSnapshot: () => this.mountedSession,
          subscribe: (listener) => {
            this.nativeListeners.add(listener)
            return () => this.nativeListeners.delete(listener)
          }
        },
        openTabs: {
          getSnapshot: () => this.nativeTabs,
          subscribe: (listener) => {
            this.nativeListeners.add(listener)
            return () => this.nativeListeners.delete(listener)
          }
        }
      }
    },
    fireNative() {
      for (const listener of this.nativeListeners) listener()
    }
  }
}

test('the door names the viewer: an address is a seat, a null address is a guest', () => {
  assert.equal(viewerFromAnswer(200, { email: 'lee@example.com', defaultSite: 'fijitrips.example' }), SEAT)
  assert.equal(viewerFromAnswer(200, { email: null, defaultSite: null }), GUEST)
  assert.equal(viewerFromAnswer(401, { code: 'NOT_SIGNED_IN' }), GUEST)
  assert.equal(viewerFromAnswer(403, null), GUEST)
})

test('an answer that is not this door says nothing — and nothing is not a seat', () => {
  // A login page, an app shell served for an unknown path, an empty address: all UNKNOWN.
  assert.equal(viewerFromAnswer(200, null), UNKNOWN)
  assert.equal(viewerFromAnswer(200, { defaultSite: null }), UNKNOWN)
  assert.equal(viewerFromAnswer(200, { email: '   ' }), UNKNOWN)
  assert.equal(viewerFromAnswer(200, { email: 42 }), UNKNOWN)
  assert.equal(viewerFromAnswer(502, { email: 'lee@example.com' }), UNKNOWN)
})

test('an unreadable answer refuses the tab everywhere a guest can exist', () => {
  assert.equal(mayHoldSeatOnlyTab(SEAT, 'cowork.tracy.ai'), true)
  assert.equal(mayHoldSeatOnlyTab(GUEST, 'cowork.tracy.ai'), false)
  assert.equal(mayHoldSeatOnlyTab(UNKNOWN, 'cowork.tracy.ai'), false)
  // A proven guest stays refused even on this machine: the answer was read, and it said no.
  assert.equal(mayHoldSeatOnlyTab(GUEST, 'localhost'), false)
  // No Worker in front means no guest session can exist — `./run.sh native` keeps both tabs.
  assert.equal(mayHoldSeatOnlyTab(UNKNOWN, 'localhost'), true)
})

test('a loopback surface is the only carve-out', () => {
  assert.equal(isLocalSurface('localhost'), true)
  assert.equal(isLocalSurface('127.0.0.1'), true)
  assert.equal(isLocalSurface('::1'), true)
  assert.equal(isLocalSurface('dsh.localhost'), true)
  assert.equal(isLocalSurface('cowork.tracy.ai'), false)
  assert.equal(isLocalSurface('localhost.tracy.ai'), false)
})

test('the door is read over the network, and a broken read is never a seat', async () => {
  const answer =
    (status, body, type = 'application/json') =>
    async () =>
      new Response(body === null ? '' : JSON.stringify(body), {
        status,
        headers: { 'content-type': type }
      })
  assert.equal(
    await readViewer({ fetch: answer(200, { email: 'lee@example.com', defaultSite: null }) }),
    SEAT
  )
  assert.equal(await readViewer({ fetch: answer(200, { email: null, defaultSite: null }) }), GUEST)
  assert.equal(
    await readViewer({
      fetch: async () => new Response('<!doctype html><title>Sign in</title>', { status: 200 })
    }),
    UNKNOWN
  )
  assert.equal(
    await readViewer({
      fetch: async () => {
        throw new Error('offline')
      }
    }),
    UNKNOWN
  )
})

test("the side card's own panel is walked, split tree and all", () => {
  const state = {
    bottomSplits: {
      kind: 'split',
      children: [
        {
          kind: 'leaf',
          tabs: [
            { id: 'tab-1', type: 'tracy:add-site' },
            { id: 'tab-2', type: 'editor' }
          ]
        },
        { kind: 'leaf', tabs: [{ id: 'tab-3', type: 'tracy:add-site' }] }
      ]
    }
  }
  assert.deepEqual(tabIdsOfType(state, 'tracy:add-site'), ['tab-1', 'tab-3'])
  assert.deepEqual(tabIdsOfType(undefined, 'tracy:add-site'), [])
  assert.deepEqual(tabIdsOfType(state, 'tracy:my-sites'), [])
})

/**
 * 🔒 THE SEED IS GONE, THE SWEEP IS NOT. better-sidebar 0.21.1 has no `seedTabs`, so nothing opens a
 * Tracy tab for a guest by type string any more. What the sweep still closes is a tab the side card
 * KNOWS — its own panel restored from a browser's storage, or a native record — for a viewer who may
 * not have it.
 */
test('a guest gets no registration, and every tab of the type the side card knows is closed', async () => {
  const sidebar = fakeSidebar(
    { bottomSplits: { kind: 'leaf', tabs: [{ id: 'restored-1', type: 'tracy:add-site' }] } },
    [
      { id: 'native-1', type: 'tracy:add-site' },
      { id: 'native-2', type: 'tracy:my-sites' }
    ]
  )
  let built = 0
  const dispose = seatOnlyTab(
    sidebar,
    'tracy:add-site',
    () => {
      built += 1
      return { id: 'tracy:add-site' }
    },
    { readViewer: async () => GUEST, hostname: 'cowork.tracy.ai' }
  )
  await settled()
  assert.deepEqual(sidebar.registered, [])
  assert.equal(built, 0, 'a refused viewer never even pays to build the descriptor')
  assert.deepEqual(sidebar.closed, ['restored-1', 'native-1'])
  dispose()
})

test('the sweep keeps watching: a tab of the type appearing later is closed too', async () => {
  const sidebar = fakeSidebar()
  const dispose = seatOnlyTab(sidebar, 'tracy:my-sites', () => ({ id: 'tracy:my-sites' }), {
    readViewer: async () => GUEST,
    hostname: 'cowork.tracy.ai'
  })
  await settled()
  assert.deepEqual(sidebar.closed, [])
  sidebar.state = { bottomSplits: { kind: 'leaf', tabs: [{ id: 'later-2', type: 'tracy:my-sites' }] } }
  sidebar.fire()
  assert.deepEqual(sidebar.closed, ['later-2'])
  // The disposer stops the watch: a torn-down plugin must not keep closing tabs.
  dispose()
  sidebar.state = { bottomSplits: { kind: 'leaf', tabs: [{ id: 'later-3', type: 'tracy:my-sites' }] } }
  sidebar.fire()
  assert.deepEqual(sidebar.closed, ['later-2'])
})

test('a signed-in viewer registers once, and nothing of theirs is closed', async () => {
  const sidebar = fakeSidebar(
    { bottomSplits: { kind: 'leaf', tabs: [{ id: 'theirs-1', type: 'tracy:add-site' }] } },
    [{ id: 'native-1', type: 'tracy:add-site' }]
  )
  const dispose = seatOnlyTab(sidebar, 'tracy:add-site', () => ({ id: 'tracy:add-site', order: 1 }), {
    readViewer: async () => SEAT,
    hostname: 'cowork.tracy.ai'
  })
  await settled()
  assert.deepEqual(sidebar.registered, [{ id: 'tracy:add-site', order: 1 }])
  assert.deepEqual(sidebar.closed, [])
  dispose()
  assert.deepEqual(sidebar.registered, [], 'the disposer releases the registration')
})

test('a door that throws is refused, not registered', async () => {
  const sidebar = fakeSidebar()
  const dispose = seatOnlyTab(sidebar, 'tracy:add-site', () => ({ id: 'tracy:add-site' }), {
    readViewer: async () => {
      throw new Error('the door is down')
    },
    hostname: 'cowork.tracy.ai'
  })
  await settled()
  assert.deepEqual(sidebar.registered, [])
  dispose()
})

test('disposing before the answer arrives registers nothing', async () => {
  const sidebar = fakeSidebar()
  const dispose = seatOnlyTab(sidebar, 'tracy:add-site', () => ({ id: 'tracy:add-site' }), {
    readViewer: async () => SEAT,
    hostname: 'cowork.tracy.ai'
  })
  dispose()
  await settled()
  assert.deepEqual(sidebar.registered, [])
})

test('a refused viewer closes only matching native tabs in the mounted session, including late restores', async () => {
  const sidebar = fakeSidebar()
  sidebar.mountedSession = 'session-active'
  sidebar.nativeTabs = [
    { sessionId: 'session-active', tabId: 'orphan-active', kind: 'tracy:add-site' },
    { sessionId: 'session-other', tabId: 'orphan-other', kind: 'tracy:add-site' },
    { sessionId: 'session-active', tabId: 'unrelated', kind: 'tracy:team' }
  ]
  const dispose = seatOnlyTab(sidebar, 'tracy:add-site', () => ({ id: 'tracy:add-site' }), {
    readViewer: async () => UNKNOWN,
    hostname: 'cowork.tracy.ai',
    nativeSidebar: () => sidebar.nativeSidebar()
  })
  await settled()
  assert.deepEqual(sidebar.nativeClosed, ['orphan-active'])
  sidebar.nativeTabs.push({ sessionId: 'session-active', tabId: 'restored-late', kind: 'tracy:add-site' })
  sidebar.fireNative()
  assert.deepEqual(sidebar.nativeClosed, ['orphan-active', 'restored-late'])
  sidebar.mountedSession = 'session-other'
  sidebar.nativeTabs.push({ sessionId: 'session-other', tabId: 'other-now-active', kind: 'tracy:add-site' })
  sidebar.fireNative()
  assert.deepEqual(sidebar.nativeClosed, [
    'orphan-active',
    'restored-late',
    'orphan-other',
    'other-now-active'
  ])
  dispose()
  sidebar.nativeTabs.push({ sessionId: 'session-other', tabId: 'after-dispose', kind: 'tracy:add-site' })
  sidebar.fireNative()
  assert.equal(sidebar.nativeClosed.includes('after-dispose'), false)
})

test('native orphan sweeping leaves seat viewers and loopback UNKNOWN viewers alone', async () => {
  for (const [viewer, hostname, expected] of [
    [SEAT, 'cowork.tracy.ai', []],
    [UNKNOWN, 'localhost', []],
    [GUEST, 'localhost', ['native-orphan']]
  ]) {
    const sidebar = fakeSidebar()
    sidebar.mountedSession = 'session-active'
    sidebar.nativeTabs = [{ sessionId: 'session-active', tabId: 'native-orphan', kind: 'tracy:add-site' }]
    const dispose = seatOnlyTab(sidebar, 'tracy:add-site', () => ({ id: 'tracy:add-site' }), {
      readViewer: async () => viewer,
      hostname,
      nativeSidebar: () => sidebar.nativeSidebar()
    })
    await settled()
    assert.deepEqual(sidebar.nativeClosed, expected)
    dispose()
  }
})
