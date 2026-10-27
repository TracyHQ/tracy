/**
 * The site preview preload stands down when a Browser tab already shows the site (27/09: a
 * `?open=browser&page=/about/` link was retargeted back to `/` by the preload).
 *
 *   node --test packages/site/tracy-my-sites/test/preview-open.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { browserInColumn, everySeat, openBehind, previewAlreadyOpen } from '../src/client/preview-open.ts'

const SITE = 'http://capiwl1643.tracy.test:8080/'

test('a Browser tab on any page of the site counts', () => {
  const tabs = [
    { id: 'tab2', type: 'tracy:browser', meta: { url: 'http://capiwl1643.tracy.test:8080/about/' } }
  ]
  assert.equal(previewAlreadyOpen(tabs, SITE), true)
})

test('a record that keeps its address in `path` counts too', () => {
  assert.equal(
    previewAlreadyOpen([{ type: 'tracy:browser', path: 'http://capiwl1643.tracy.test:8080/x' }], SITE),
    true
  )
})

test('a tab on another site, another kind of tab, or no tabs at all does not', () => {
  assert.equal(
    previewAlreadyOpen([{ type: 'tracy:browser', meta: { url: 'https://example.com/' } }], SITE),
    false
  )
  assert.equal(previewAlreadyOpen([{ type: 'tracy:team', meta: { url: SITE } }], SITE), false)
  assert.equal(previewAlreadyOpen([], SITE), false)
  assert.equal(previewAlreadyOpen(undefined, SITE), false)
  assert.equal(previewAlreadyOpen([{ type: 'tracy:browser', meta: { url: SITE } }], 'not a url'), false)
})

test('the preload asks right before it opens', () => {
  const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const guard = source.indexOf('previewAlreadyOpen(ctx.betterSidebar.openTabsOf?.(PREVIEW_TAB), copyUrl)')
  const open = source.indexOf('ctx.betterSidebar.openTab({', guard)
  assert.ok(guard !== -1 && open !== -1 && guard < open)
  assert.match(source.slice(open, source.indexOf('})', open)), /url:\s*copyUrl/)
  assert.match(source.slice(open, source.indexOf('})', open)), /siteKey:\s*siteKeyOfRow/)
})

/**
 * A fake of dsh's right column: which tab is in sight, whether the column is expanded, and what
 * an open does to both (an open activates its tab and expands the column, like better-sidebar).
 */
function column({ active, expanded, kind }) {
  const state = { active, expanded, focused: [], kind }
  return {
    state,
    right: {
      active: () => (state.active === undefined ? undefined : { id: state.active, kind: state.kind }),
      focus: (id) => {
        state.focused.push(id)
        state.active = id
      },
      isExpanded: () => state.expanded,
      toggleExpanded: () => {
        state.expanded = !state.expanded
      }
    },
    open: () => {
      state.active = 'preview'
      state.expanded = true
    }
  }
}

test('a tab a link opened stays in sight while the site preview opens behind it (28/09)', () => {
  const c = column({ active: 'tracy:my-sites', expanded: true })
  openBehind(c.right, c.open)
  assert.equal(c.state.active, 'tracy:my-sites')
  assert.equal(c.state.expanded, true)
})

test('a closed right column stays closed after the preview opens behind', () => {
  const c = column({ active: 'tracy:my-sites', expanded: false })
  openBehind(c.right, c.open)
  assert.equal(c.state.expanded, false)
  assert.equal(c.state.active, 'tracy:my-sites')
})

test('with nothing in sight before, the preview is what shows', () => {
  const c = column({ active: undefined, expanded: false })
  openBehind(c.right, c.open)
  assert.deepEqual(c.state.focused, [])
  assert.equal(c.state.active, 'preview')
  assert.equal(c.state.expanded, false)
})

test("a column showing only dsh's hidden guide shows the preview, not the guide again (03/10)", () => {
  const c = column({ active: 'guide-1', kind: 'guide', expanded: true })
  openBehind(c.right, c.open)
  assert.deepEqual(c.state.focused, [])
  assert.equal(c.state.active, 'preview')
})

test('without a right column to read, the preview still opens', () => {
  let opened = 0
  openBehind(undefined, () => {
    opened++
  })
  assert.equal(opened, 1)
})

test('a `?tab=` link no longer cancels the preview, and no once-per-browser-tab mark stops it', () => {
  const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('stop = everySeat(ctx.betterSidebar, right, (sessionId) => {')
  const effect = source.lastIndexOf('ctx.effect(() => {', start)
  assert.ok(effect !== -1 && start !== -1)
  assert.doesNotMatch(source.slice(effect, start), /searchParams\.has\('tab'\)/)
  assert.doesNotMatch(source.slice(effect, start), /sessionStorage/)
  const column = source.indexOf('browserInColumn(right?.openTabs, sessionId)', start)
  const guard = source.indexOf(
    'previewAlreadyOpen(ctx.betterSidebar.openTabsOf?.(PREVIEW_TAB), copyUrl)',
    start
  )
  assert.ok(column !== -1 && column < guard, 'the per-column check runs first, inside each seat')
  assert.match(source.slice(guard, source.indexOf('ctx.betterSidebar.openTab({', guard)), /openBehind\(/)
})

/**
 * Brian 03/10/2026: the Browser tab is the site workspace's own page, and dsh keeps one column per
 * conversation — so every conversation's column is asked, not the side card's `openTabsOf`, which
 * lists every conversation's Browser records (a tab left behind stays mounted).
 */
test("browserInColumn reads one conversation's column", () => {
  const openTabs = {
    getSnapshot: () => [
      { sessionId: 'S1', kind: 'tracy:browser' },
      { sessionId: 'S2', kind: 'tracy:team' }
    ]
  }
  assert.equal(browserInColumn(openTabs, 'S1'), true)
  assert.equal(browserInColumn(openTabs, 'S2'), false)
  assert.equal(browserInColumn(openTabs, 'S3'), false)
  // dsh cannot say: the caller falls back to the side card's records.
  assert.equal(browserInColumn(undefined, 'S1'), undefined)
  assert.equal(browserInColumn({}, 'S1'), undefined)
  assert.equal(browserInColumn(openTabs, undefined), undefined)
})

/**
 * The preload waits for a seat. Measured 28/09 on the stand: the site list answers before the page
 * has bound a session (`bound` and `mounted` both undefined, the path still `/<site>/`), dsh's
 * column refuses an open it has no session for, and the preview was silently dropped — the session
 * bound three seconds later with no Browser tab.
 */
function seat({ bound, mounted }) {
  const listeners = new Set()
  const state = { bound, mounted }
  return {
    state,
    sidebar: {
      getSnapshot: () => ({ sessionId: state.bound }),
      subscribeState: (fn) => (listeners.add(fn), () => listeners.delete(fn))
    },
    right: {
      mounted: {
        getSnapshot: () => state.mounted,
        subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn))
      }
    },
    bind(id) {
      state.bound = id
      state.mounted = id
      for (const fn of Array.from(listeners)) fn()
    },
    listeners
  }
}

test('with a seat already bound, the preview opens at once for that session', () => {
  const s = seat({ bound: 'S1', mounted: 'S1' })
  const runs = []
  everySeat(s.sidebar, s.right, (id) => runs.push(id))
  assert.deepEqual(runs, ['S1'])
})

test('before any seat is bound it waits, then opens once when one binds', () => {
  const s = seat({ bound: undefined, mounted: undefined })
  const runs = []
  everySeat(s.sidebar, s.right, (id) => runs.push(id))
  assert.deepEqual(runs, [])
  s.bind('S1')
  s.bind('S1')
  assert.deepEqual(runs, ['S1'])
})

test('a side card still following another session than the one on screen waits too', () => {
  const s = seat({ bound: 'OLD', mounted: 'NEW' })
  const runs = []
  everySeat(s.sidebar, s.right, (id) => runs.push(id))
  assert.deepEqual(runs, [])
  s.bind('NEW')
  assert.deepEqual(runs, ['NEW'])
})

test('every other conversation the column moves to opens once too, and a return opens nothing', () => {
  const s = seat({ bound: 'S1', mounted: 'S1' })
  const runs = []
  everySeat(s.sidebar, s.right, (id) => runs.push(id))
  s.bind('S2')
  s.bind('S1')
  s.bind('S3')
  assert.deepEqual(runs, ['S1', 'S2', 'S3'])
})

test('stopping leaves nothing subscribed', () => {
  const s = seat({ bound: undefined, mounted: undefined })
  const runs = []
  const stop = everySeat(s.sidebar, s.right, (id) => runs.push(id))
  stop()
  s.bind('S1')
  assert.deepEqual(runs, [])
  assert.equal(s.listeners.size, 0)
})

test('without a way to read the seat, the preview opens once, as before', () => {
  const runs = []
  everySeat({}, undefined, (id) => runs.push(id))
  assert.deepEqual(runs, [undefined])
})
