/**
 * The creation tab is opened in three steps — "preparing", then the form or the failure — and each
 * is an open of the same tab kind. dsh's native right column (better-sidebar 0.21.1) keeps ONE tab
 * per kind in a pane: a second open focuses the first one's tab and navigates it, and the side card
 * refreshes only `path`/`url` on a navigation, never `meta`. Every press in the creation workspace
 * lands both opens in the same session, so without a patch the tab stays on "Preparing your Joomla
 * assistant…" for ever (measured 14/09, local stack, on the old side card — same rule).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { landBuildTab } from '../src/client/build-handoff.mjs'

/**
 * A side card over a native column with the real rules: one tab per kind per session, an open of a
 * kind already there focuses it and keeps its meta, the landed tab is the active one, ids are minted
 * by the column, `updateTab` patches a record of the session on screen.
 */
function fakeColumn(onScreen) {
  const sessions = new Map()
  let minted = 0
  const tabsOf = (id) => sessions.get(id) ?? sessions.set(id, { active: undefined, tabs: new Map() }).get(id)
  const right = {
    active: () => {
      const surface = tabsOf(onScreen)
      const tab = surface.tabs.get(surface.active)
      return tab && { id: tab.id, kind: tab.type }
    },
    isExpanded: () => true,
    toggleExpanded() {},
    focus() {},
    mounted: { getSnapshot: () => onScreen, subscribe: () => () => {} }
  }
  const sidebar = {
    sessions,
    getSnapshot: () => ({ sessionId: onScreen }),
    openTab: (seed, scope) => {
      const surface = tabsOf(scope?.sessionId ?? onScreen)
      let tab = [...surface.tabs.values()].find((one) => one.type === seed.type)
      if (tab === undefined) {
        minted += 1
        tab = { id: `tab-${minted}`, type: seed.type, meta: seed.meta }
        surface.tabs.set(tab.id, tab)
      }
      surface.active = tab.id
    },
    updateTab: (id, patch) => {
      const tab = tabsOf(onScreen).tabs.get(id)
      if (tab) Object.assign(tab, patch)
    },
    openTabsOf: (type) => [...tabsOf(onScreen).tabs.values()].filter((tab) => tab.type === type)
  }
  const metaIn = (sessionId) => [...tabsOf(sessionId).tabs.values()][0]?.meta
  return { sidebar, right, metaIn }
}

const seed = (meta) => ({ type: 'tracy:add-site', meta })

test('the blank session is the fresh one: the second open updates the tab that is already there', () => {
  const { sidebar, right, metaIn } = fakeColumn('s-blank')
  landBuildTab(sidebar, right, seed({ setupPending: true }))
  landBuildTab(sidebar, right, seed({ setupPending: false }), { sessionId: 's-blank' })
  assert.deepEqual(metaIn('s-blank'), { setupPending: false })
})

test('a failed setup replaces the pending state the same way', () => {
  const { sidebar, right, metaIn } = fakeColumn('s-blank')
  landBuildTab(sidebar, right, seed({ setupPending: true }))
  landBuildTab(sidebar, right, seed({ setupFailed: true, setupPending: false }), { sessionId: 's-blank' })
  assert.equal(metaIn('s-blank').setupFailed, true)
})

test('a fresh session elsewhere gets its own tab; the pending tab in the old session is left alone', () => {
  const { sidebar, right, metaIn } = fakeColumn('s-old')
  landBuildTab(sidebar, right, seed({ setupPending: true }))
  landBuildTab(sidebar, right, seed({ setupPending: false }), { sessionId: 's-fresh' })
  assert.deepEqual(metaIn('s-old'), { setupPending: true })
  assert.deepEqual(metaIn('s-fresh'), { setupPending: false })
})

test('a sidebar without updateTab still opens the tab', () => {
  const { sidebar, right } = fakeColumn('s')
  delete sidebar.updateTab
  landBuildTab(sidebar, right, seed({ setupPending: true }))
  assert.equal(sidebar.sessions.get('s').tabs.size, 1)
})

test('an Add site tab already open from the + list receives the press, under the id dsh minted (#381)', () => {
  const { sidebar, right, metaIn } = fakeColumn('s')
  // Opened bare, the way the + list opens it: no meta at all.
  sidebar.openTab({ type: 'tracy:add-site' })
  const meta = { id: 'tracy-base', design: 'tracy-base', platform: 'wordpress', pressedAt: 1 }
  landBuildTab(sidebar, right, seed(meta))
  assert.deepEqual(metaIn('s'), meta)
})
