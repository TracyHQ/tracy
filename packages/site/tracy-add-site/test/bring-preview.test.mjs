/**
 * A site page's own preview, brought into dsh's right column on page load, never covers the
 * conversation on a narrow frame (dev acceptance 12/10/2026, develop 245be29854 at 360px: a plain
 * load of `/<site>/` ended with the Browser tab fullscreen over the composer).
 *
 * Two ways the load's open got past the fork's narrow rule (fork tracy.41, "an open no gesture
 * caused stays behind the toggle on a frame below 768px"):
 *   - a Browser tab already in the column was shown with `revealTab`, which expands the column
 *     itself — the rule is never asked;
 *   - the open runs after the credentials request, and the fork reads `navigator.userActivation
 *     .isActive`, which stays true for seconds after ANY tap (dismissing the Getting started dialog,
 *     tapping the composer) — so the load's open passed as pressed.
 *
 * The fake column below behaves like dsh's with a live activation: an open expands it.
 *
 *   node --test packages/site/tracy-add-site/test/bring-preview.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bringPreview } from '../src/client/bring-preview.ts'

function column({ expanded = false, tabs = [] } = {}) {
  const state = { expanded, tabs: [...tabs], active: undefined, calls: [] }
  const right = {
    active: () => state.active,
    isExpanded: () => state.expanded,
    toggleExpanded: () => {
      state.expanded = !state.expanded
      state.calls.push(state.expanded ? 'expand' : 'collapse')
    },
    focus: (id) => {
      state.active = { id, kind: 'tracy:browser' }
      state.calls.push(`focus:${id}`)
    }
  }
  // dsh's open with a transient user activation on the page: it lands in sight.
  const open = () => {
    state.tabs.push('tab9')
    state.active = { id: 'tab9', kind: 'tracy:browser' }
    state.expanded = true
    state.calls.push('open')
  }
  return { right, open, state }
}

test('on load at 360px, a Browser tab already in the column is focused, not revealed', () => {
  const c = column({ tabs: ['tab2'] })
  bringPreview({ right: c.right, already: 'tab2', open: c.open, unasked: true, narrow: true })
  assert.equal(c.state.expanded, false, 'the composer stays in sight')
  assert.equal(c.state.active?.id, 'tab2')
})

test('on load at 360px, a new preview is placed behind the toggle even while the page has an activation', () => {
  const c = column()
  bringPreview({ right: c.right, already: null, open: c.open, unasked: true, narrow: true })
  assert.equal(c.state.expanded, false)
  assert.deepEqual(c.state.tabs, ['tab9'], 'the tab is there for the toggle to show')
})

test('on load at 360px, a column the person already opened stays open', () => {
  const c = column({ expanded: true })
  bringPreview({ right: c.right, already: null, open: c.open, unasked: true, narrow: true })
  assert.equal(c.state.expanded, true)
})

test('on load at 1440px the preview opens beside the chat, as before', () => {
  const placed = column()
  bringPreview({ right: placed.right, already: null, open: placed.open, unasked: true, narrow: false })
  assert.equal(placed.state.expanded, true)
  const kept = column({ tabs: ['tab2'] })
  bringPreview({ right: kept.right, already: 'tab2', open: kept.open, unasked: true, narrow: false })
  assert.deepEqual(kept.state.calls, ['focus:tab2', 'expand'])
})

test('a press (a site row, a session switch) still reveals the preview at 360px', () => {
  const kept = column({ tabs: ['tab2'] })
  bringPreview({ right: kept.right, already: 'tab2', open: kept.open, unasked: false, narrow: true })
  assert.equal(kept.state.expanded, true)
  const placed = column()
  bringPreview({ right: placed.right, already: null, open: placed.open, unasked: false, narrow: true })
  assert.equal(placed.state.expanded, true)
})

test('no column to read: the open still runs, and nothing throws', () => {
  const c = column()
  bringPreview({ right: undefined, already: null, open: c.open, unasked: true, narrow: true })
  assert.deepEqual(c.state.calls, ['open'])
})

test('a preview already on the site with no column to read is left on its own page', () => {
  const c = column({ tabs: ['tab2'] })
  bringPreview({ right: undefined, already: 'tab2', open: c.open, unasked: true, narrow: true })
  assert.deepEqual(c.state.calls, [])
})
