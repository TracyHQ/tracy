/**
 * A link `?open=my-sites&team=<siteKey>&member=<email>` (the team mails and notification mails)
 * must land on that site's Team tab, on that member, even when it arrives before the page has bound
 * a session. Measured 04/10 on the stand: the open was sent at boot, dsh's column refused it (no
 * session yet), the saved layout kept the Browser tab in sight, and the request waited for a My
 * Sites tab that nothing mounted.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { openFromLink } from '../src/client/preview-open.ts'

function page({ bound, mounted }) {
  const listeners = new Set()
  const state = { bound, mounted }
  const opened = []
  const updated = []
  return {
    opened,
    updated,
    sidebar: {
      getSnapshot: () => ({ sessionId: state.bound }),
      subscribeState: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
      openTab: (seed) => {
        // dsh's column drops an open it has no session for.
        if (state.bound === undefined) return
        opened.push(seed)
      },
      updateTab: (id, patch) => updated.push({ id, patch })
    },
    right: {
      mounted: {
        getSnapshot: () => state.mounted,
        subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn))
      },
      tabs: () => opened.map((seed, i) => ({ id: `t${i}`, type: seed.type, sessionId: state.bound }))
    },
    bind(id) {
      state.bound = id
      state.mounted = id
      for (const fn of Array.from(listeners)) fn()
    }
  }
}

const TABS = { team: 'tracy:team', list: 'tracy:my-sites' }

const tick = () => new Promise((resolve) => setTimeout(resolve, 300))

test('a team link that arrives at boot, with no column and no session yet, opens the Team tab once they come', async () => {
  const p = page({ bound: undefined, mounted: undefined })
  // The exact boot of 04/10: dsh's right column cannot be read yet either.
  let column
  const stop = openFromLink(
    { team: 'javoyara.tracy.test', member: 'lee@lab3.example' },
    p.sidebar,
    () => column,
    TABS
  )
  assert.deepEqual(p.opened, [])
  await tick()
  assert.deepEqual(p.opened, [])
  column = p.right
  p.bind('S1')
  await tick()
  stop()
  assert.equal(p.opened.length, 1)
  assert.equal(p.opened[0].type, 'tracy:team')
  assert.deepEqual(p.opened[0].meta, { siteKey: 'javoyara.tracy.test', member: 'lee@lab3.example' })
})

test('with the session already bound, the Team tab opens at once, without a member when none was named', () => {
  const p = page({ bound: 'S1', mounted: 'S1' })
  openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS)
  assert.equal(p.opened.length, 1)
  assert.deepEqual(p.opened[0].meta, { siteKey: 'kinetic.vn' })
})

test('a side card still following another session than the one on screen waits', async () => {
  const p = page({ bound: 'OLD', mounted: 'OLD' })
  const right = { mounted: { getSnapshot: () => 'NEW', subscribe: () => () => {} } }
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => right, TABS)
  await tick()
  stop()
  assert.deepEqual(p.opened, [])
})

test('a link naming no site opens the My Sites table', () => {
  const p = page({ bound: 'S1', mounted: 'S1' })
  openFromLink({ team: null, member: null }, p.sidebar, () => p.right, TABS)
  assert.deepEqual(p.opened, [{ type: 'tracy:my-sites' }])
})

// ── Mail audit 04/10: the bare address Akemi copied is what the bar shows AFTER the query is
//    stripped, so the link was read and then the Team tab never opened. ─────────────────────────

test('a session that binds after the old 20 s budget still gets its Team tab (cold load after a deploy)', async () => {
  const p = page({ bound: undefined, mounted: undefined })
  // The budget is a parameter; 200 ms stands for 20 s. The session binds well after it.
  const stop = openFromLink({ team: 'wptest0929.tracy.site', member: null }, p.sidebar, () => p.right, TABS, {
    timeoutMs: 200
  })
  await tick()
  p.bind('S1')
  await tick()
  stop()
  assert.equal(p.opened.length, 1, 'the open still happens after a slow bind')
})

test('the link is kept in the address bar until the Team tab actually opened', async () => {
  const p = page({ bound: undefined, mounted: undefined })
  const stripped = []
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS, {
    onOpened: () => stripped.push('now')
  })
  await tick()
  assert.deepEqual(stripped, [], 'nothing opened yet, so the query must stay')
  p.bind('S1')
  await tick()
  stop()
  assert.deepEqual(stripped, ['now'])
})

test('an open the column swallowed is sent again until the Team tab is the active one', async () => {
  const p = page({ bound: 'S1', mounted: 'S1' })
  let swallow = 2
  const openTab = p.sidebar.openTab
  p.sidebar.openTab = (seed) => (swallow-- > 0 ? undefined : openTab(seed))
  let active = 'tracy:browser'
  p.right.active = () => ({ id: 'x', kind: p.opened.length > 0 ? 'tracy:team' : active })
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS)
  await tick()
  await tick()
  stop()
  assert.equal(p.opened.length, 1)
})

// ── Live on cowork.tracy.site 04/10 (1 of 2 clicks): the Team tab opened, then the session's
//    restored Browser tab took focus back, and the address became ?open=browser&page=/. ─────────

/** A column whose active tab a restore can steal. */
function columnPage() {
  const p = page({ bound: 'S1', mounted: 'S1' })
  let active = 'tracy:browser'
  p.sidebar.openTab = (seed) => {
    p.opened.push(seed)
    active = seed.type
  }
  p.right.active = () => ({ id: 'x', kind: active })
  p.restore = () => {
    active = 'tracy:browser'
  }
  p.activeKind = () => active
  return p
}

test('a restore that takes focus back after the Team tab opened is answered: Team is re-asserted', async () => {
  const p = columnPage()
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS, {
    guardMs: 2000
  })
  assert.equal(p.activeKind(), 'tracy:team')
  p.restore()
  await tick()
  stop()
  assert.equal(p.activeKind(), 'tracy:team', 'the link wins over the restored tab')
})

test('a restore that lands before the open does not win either', async () => {
  const p = columnPage()
  p.restore()
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS, {
    guardMs: 2000
  })
  await tick()
  stop()
  assert.equal(p.activeKind(), 'tracy:team')
})

test('once the person acts, the link stops re-asserting: their own pick stands', async () => {
  const p = columnPage()
  const input = new EventTarget()
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS, {
    guardMs: 2000,
    input
  })
  input.dispatchEvent(new Event('pointerdown'))
  p.restore()
  await tick()
  stop()
  assert.equal(p.activeKind(), 'tracy:browser')
})

test('the guard ends after guardMs', async () => {
  const p = columnPage()
  const stop = openFromLink({ team: 'kinetic.vn', member: null }, p.sidebar, () => p.right, TABS, {
    guardMs: 100
  })
  await tick()
  p.restore()
  await tick()
  stop()
  assert.equal(p.activeKind(), 'tracy:browser')
})
