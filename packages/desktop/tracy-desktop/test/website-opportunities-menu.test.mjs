/**
 * Help › Find Website Opportunities…: when the item shows, read from Tracy's `/api/ui` switch
 * `website-opportunities` (tasks/spec-website-opportunities-contracts.md §6).
 *
 *   node --test packages/desktop/tracy-desktop/test/website-opportunities-menu.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  SWITCH_ID,
  createWebsiteOpportunitiesMenu,
  hiddenFromAnswer
} = require('../src/website-opportunities-menu.js')

const A = 'https://cowork.tracy.ai'
const B = 'https://cowork.tracy.site'

/** A fake world: one focused window's origin, the sign-in flag, Tracy's answers, a manual clock. */
function world({ hidden = [], origin = A, signedIn = true } = {}) {
  const state = {
    origin,
    signedIn,
    hidden,
    windows: 1,
    reads: [],
    changes: 0,
    opened: 0,
    timers: new Map(),
    nextTimer: 1
  }
  const pending = []
  state.hold = false
  const menu = createWebsiteOpportunitiesMenu({
    currentOrigin: () => state.origin,
    hasWindows: () => state.windows > 0,
    signedIn: () => state.signedIn,
    readHidden: (at) => {
      state.reads.push(at)
      const answer = typeof state.hidden === 'function' ? state.hidden(at) : state.hidden
      if (!state.hold) return Promise.resolve(answer)
      return new Promise((resolve) => pending.push(() => resolve(answer)))
    },
    onChange: () => state.changes++,
    open: () => state.opened++,
    setInterval: (fn, ms) => {
      const id = state.nextTimer++
      state.timers.set(id, { fn, ms })
      return id
    },
    clearInterval: (id) => state.timers.delete(id)
  })
  state.release = () => pending.splice(0).forEach((resolve) => resolve())
  state.tick = async () => {
    for (const { fn } of state.timers.values()) await fn()
  }
  return { menu, state }
}

test('the switch id is the one in the contract', () => {
  assert.equal(SWITCH_ID, 'website-opportunities')
})

test('hiddenFromAnswer: the hidden ids, or null for anything that is not a readable answer', () => {
  assert.deepEqual(hiddenFromAnswer({ hidden: ['a', 'website-opportunities', 3] }), [
    'a',
    'website-opportunities'
  ])
  assert.deepEqual(hiddenFromAnswer({ hidden: [] }), [])
  assert.equal(hiddenFromAnswer(null), null)
  assert.equal(hiddenFromAnswer({}), null)
  assert.equal(hiddenFromAnswer({ hidden: 'website-opportunities' }), null)
  assert.equal(hiddenFromAnswer([]), null)
})

test('hidden before any read: an unknown switch is off', () => {
  const { menu } = world()
  assert.equal(menu.visible(), false)
})

test('switch on (not in hidden), signed in, a window: the item shows and the menu is rebuilt', async () => {
  const { menu, state } = world({ hidden: ['something-else'] })
  assert.equal(await menu.refresh(), true)
  assert.equal(menu.visible(), true)
  assert.deepEqual(state.reads, [A])
  assert.equal(state.changes, 1)
})

test('switch off (in hidden): the item stays hidden and the menu is not rebuilt for nothing', async () => {
  const { menu, state } = world({ hidden: ['website-opportunities'] })
  assert.equal(await menu.refresh(), false)
  assert.equal(state.changes, 0)
})

test('a failed read (null) hides an item that was showing', async () => {
  const { menu, state } = world()
  await menu.refresh()
  state.hidden = null
  assert.equal(await menu.refresh(), false)
  assert.equal(state.changes, 2)
})

test('signed out: no read, hidden', async () => {
  const { menu, state } = world({ signedIn: false })
  assert.equal(await menu.refresh(), false)
  assert.deepEqual(state.reads, [])
})

test('no product window: no read, hidden', async () => {
  const { menu, state } = world()
  state.origin = undefined
  assert.equal(await menu.refresh(), false)
  assert.deepEqual(state.reads, [])
})

test('reset (logout, window closed, renderer gone) hides at once and rebuilds the menu', async () => {
  const { menu, state } = world()
  await menu.refresh()
  menu.reset()
  assert.equal(menu.visible(), false)
  assert.equal(state.changes, 2)
})

test('a read still in flight when reset comes is dropped', async () => {
  const { menu, state } = world()
  state.hold = true
  const read = menu.refresh()
  menu.reset()
  state.release()
  assert.equal(await read, false)
  assert.equal(menu.visible(), false)
  assert.equal(state.changes, 0)
})

test('signed out after a read: visible() follows the sign-in at once', async () => {
  const { menu, state } = world()
  await menu.refresh()
  state.signedIn = false
  assert.equal(menu.visible(), false)
})

test('origin mismatch: a result read for origin A is never applied once the window shows origin B', async () => {
  const { menu, state } = world()
  state.hold = true
  const read = menu.refresh()
  state.origin = B
  state.release()
  assert.equal(await read, false)
  assert.equal(menu.visible(), false)
})

test("origin mismatch: A's cached result does not show the item for a window on B", async () => {
  const { menu, state } = world({ hidden: (at) => (at === A ? [] : ['website-opportunities']) })
  await menu.refresh()
  state.origin = B
  assert.equal(menu.visible(), false)
  assert.equal(await menu.refresh(), false)
  assert.deepEqual(state.reads, [A, B])
})

test('an older read that answers after a newer one does not overwrite it', async () => {
  const { menu, state } = world()
  state.hold = true
  const first = menu.refresh()
  state.hold = false
  state.hidden = ['website-opportunities']
  await menu.refresh()
  state.hidden = []
  // The first read was asked while the switch was on; it resolves last with that stale answer.
  state.hold = true
  state.release()
  await first
  assert.equal(menu.visible(), false)
})

test('click: reads again, then opens when the switch is still on', async () => {
  const { menu, state } = world()
  await menu.refresh()
  await menu.click()
  assert.equal(state.opened, 1)
  assert.equal(state.reads.length, 2)
})

test('click: switched off since the last read — nothing opens, the menu is rebuilt', async () => {
  const { menu, state } = world()
  await menu.refresh()
  state.hidden = ['website-opportunities']
  await menu.click()
  assert.equal(state.opened, 0)
  assert.equal(menu.visible(), false)
  assert.equal(state.changes, 2)
})

test('timer: one 30 s timer while a window exists, cleared when none is left', async () => {
  const { menu, state } = world()
  menu.windowsChanged()
  menu.windowsChanged()
  assert.equal(state.timers.size, 1)
  assert.equal([...state.timers.values()][0].ms, 30_000)
  await state.tick()
  assert.equal(menu.visible(), true)
  state.origin = undefined
  state.windows = 0
  menu.windowsChanged()
  assert.equal(state.timers.size, 0)
  assert.equal(menu.visible(), false)
})

test('timer: a tick that finds no window stops itself and hides the item', async () => {
  const { menu, state } = world()
  menu.windowsChanged()
  await state.tick()
  state.origin = undefined
  state.windows = 0
  await state.tick()
  assert.equal(state.timers.size, 0)
  assert.equal(menu.visible(), false)
})

test('timer: starts for a window whose page has not loaded yet; its ticks keep it hidden until then', async () => {
  const { menu, state } = world()
  state.origin = undefined
  menu.windowsChanged()
  assert.equal(state.timers.size, 1)
  await state.tick()
  assert.equal(state.timers.size, 1)
  assert.equal(menu.visible(), false)
  state.origin = A
  await state.tick()
  assert.equal(menu.visible(), true)
})

test('dispose clears the timer', () => {
  const { menu, state } = world()
  menu.windowsChanged()
  menu.dispose()
  assert.equal(state.timers.size, 0)
})
