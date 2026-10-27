/**
 * Delete all · Undo (Brian 29/09 ~18:00; stage 6 rule 12, Brian 21:10; renamed from "Clear all" 22:45): it takes EVERY open
 * comment of the page shown off the list at once — everyone's, a soft delete, never another page's —
 * and, in the head row's own slots, says "N deleted" and "Undo (10)" for {@link CLEAR_UNDO_MS} (round 3,
 * Brian 30/09); Undo puts them back and nothing
 * reaches the server; when the time is up, or the page hides or unloads first, the clear goes to the
 * Browser tab (`tracy:comment-act` `clear` with the ids it hid), and the fork writes it to the door
 * with `keepalive`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { CLEAR_UNDO_MS, commitClearOnLeave, createPendingClear } from '../src/client/comment-clear.mjs'
import { badgeCount, createCommentLists, rowsOf } from '../src/client/comment-view.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let render

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-clear-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView, watchCommentsBadge } from './CommentsView'
        export { createCommentsState, watchCommentsBadge }
        export function drawFailed(lists) {
          const target = new EventTarget()
          const state = createCommentsState({ act: () => {}, target, timers: { set: () => 1, clear: () => {} } })
          for (const list of lists) state.lists.accept(list)
          const ids = state.clearing.start({}) && state.clearing.held().visible.map((r) => r.id)
          state.clearing.commit()
          target.dispatchEvent(new CustomEvent('tracy:comment-act-failed', {
            detail: { tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids, text: '', code: 'SEAT_NOT_AUTHORIZED' }
          }))
          return renderToStaticMarkup(createElement(makeCommentsView(state), { sessionId: 's1' }))
        }
        export function drawCleared(lists, thenFilter) {
          const acts = []
          const state = createCommentsState({ act: (a) => acts.push(a), timers: { set: () => 1, clear: () => {} } })
          for (const list of lists) state.lists.accept(list)
          state.clearing.start({})
          if (thenFilter) state.setFilter(thenFilter)
          return { html: renderToStaticMarkup(createElement(makeCommentsView(state), { sessionId: 's1' })), acts }
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  render = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const NOW = Date.now()
const PAGE = 'https://northgate.tracy.test/'
const NEWS = 'https://northgate.tracy.test/news'
const LEE = { accountId: 'a1', email: 'lee@example.test', name: 'Lee', initial: 'L' }
const AKEMI = { accountId: 'a2', email: 'akemi@example.test', name: 'Akemi', initial: 'A' }
/** @param {string} id @param {number} n @param {object} [extra] */
const c = (id, n, extra = {}) => ({
  id,
  n,
  url: PAGE,
  text: `comment ${n}`,
  status: 'pending',
  createdAt: NOW - 60_000 + n,
  element: null,
  author: LEE,
  can: { edit: true, delete: true },
  ...extra
})
/** @param {object[]} comments @param {string} [tabId] */
const list = (comments, tabId = 'tab-a') => ({
  sessionId: 's1',
  tabId,
  siteKey: 'northgate',
  host: 'northgate.tracy.test',
  active: tabId === 'tab-a',
  url: PAGE,
  comments
})
/** Two of Lee's and one of Akemi's on this page, one on another page, one resolved. */
const ON_PAGE = [
  c('m1', 1),
  c('m2', 2),
  c('t3', 3, { author: AKEMI, can: { edit: false, delete: false } }),
  c('e4', 4, { url: NEWS }),
  c('r5', 5, { status: 'resolved', resolvedAt: NOW })
]

/** Comments list redesign A: the Open view — Delete all takes what it shows, never the resolved one. */
const SHOWN = { status: 'open' }

/** A pending clear over fresh lists, its acts recorded and its clock in the test's hand. */
function setup(lists = [list(ON_PAGE)], target = null) {
  const store = createCommentLists()
  for (const l of lists) store.accept(l)
  /** The clears sent (the writes). */
  /** @type {object[]} */
  const acts = []
  /** Every act sent to the Browser tab, `hide`/`show` included (TH-7). */
  /** @type {object[]} */
  const sent = []
  /** @type {(() => void) | null} */
  let due = null
  let armedFor = 0
  const clearing = createPendingClear({
    lists: store,
    target,
    act: (a) => {
      sent.push(a)
      if (a.kind === 'clear') acts.push(a)
    },
    timers: {
      set: (fn, ms) => {
        due = fn
        armedFor = ms
        return 1
      },
      clear: () => {
        due = null
      }
    }
  })
  const ids = () => rowsOf(store.getSnapshot()).map((r) => r.id)
  /** One tick of the clock (a second). */
  const tick = () => due?.()
  /** The whole window: ten ticks (a tick with no clock armed does nothing). */
  const fire = () => {
    for (let i = 0; i < CLEAR_UNDO_MS / 1000; i += 1) tick()
  }
  return { store, clearing, acts, sent, ids, tick, fire, armedFor: () => armedFor }
}

test('Delete all (redesign A): every open comment this page shows is deleted, anyone’s; Delete all itself reads Undo; the rows stay frozen in place; nothing sent yet', () => {
  const { html, acts } = render.drawCleared([list(ON_PAGE)])
  for (const id of ['m1', 'm2', 't3'])
    assert.match(html, new RegExp(`data-comment="${id}" data-frozen=""`), `${id} stays, frozen`)
  assert.ok(!html.includes('data-comment="e4"'), 'the page shown only (Current page)')
  assert.ok(!html.includes('data-comment="r5"'), 'the Open view only: the resolved one is not touched')
  assert.match(
    html,
    /<button[^>]*class="tv-cv-del"[^>]*aria-label="Undo · 3 deleted"[^>]*data-tracy-undo="">/
  )
  assert.deepEqual(
    acts.filter((a) => a.kind === 'clear'),
    [],
    'no clear yet'
  )
})

test('the countdown is a thin terracotta bar draining under the toolbar, never a number', () => {
  const { html } = render.drawCleared([list(ON_PAGE)])
  assert.match(html, /class="tv-cv-bar-drain"[^>]*><i style="animation-duration:10000ms/)
  assert.ok(!/Undo \(\d+\)/.test(html))
})

test('one comment: deleting everything keeps the row frozen under the toolbar (the empty tab waits for the clear)', () => {
  const { html } = render.drawCleared([list([c('m1', 1)])])
  assert.ok(!html.includes('No comments yet'))
  assert.match(html, /aria-label="Undo · 1 deleted"/)
  assert.ok(html.indexOf('data-tracy-undo') < html.indexOf('data-comment="m1"'))
})

test('IN PLACE of what was clicked: the toolbar stays ONE row — Undo where Delete all was, Ask Tracy to edit all dimmed', () => {
  const { html } = render.drawCleared([list(ON_PAGE)])
  assert.equal(html.split('data-tracy-undo').length - 1, 1, 'one Undo')
  assert.ok(!html.includes('<span>Delete all</span>'), 'Delete all itself reads Undo')
  assert.match(
    html,
    /class="tv-cv-primary tv-cv-small tv-cv-send-all" disabled=""/,
    'Ask Tracy to edit all stays, dimmed'
  )
})

test('the head comes back when the window ends or on Undo', () => {
  const t = render.createCommentsState({ act: () => {}, timers: { set: () => 1, clear: () => {} } })
  t.lists.accept(list(ON_PAGE))
  t.clearing.start(SHOWN)
  assert.notEqual(t.clearing.get(), null)
  t.clearing.undo()
  assert.equal(t.clearing.get(), null)
})

test('the tab badge (open threads, unread dot) drops at once on Delete all, and again once the window ends — even while the page paints no frame (a hidden tab)', async () => {
  const tab = {
    textContent: 'Comments',
    attrs: new Map(),
    getAttribute(k) {
      return this.attrs.get(k) ?? null
    },
    hasAttribute(k) {
      return this.attrs.has(k)
    },
    setAttribute(k, v) {
      this.attrs.set(k, v)
    },
    removeAttribute(k) {
      this.attrs.delete(k)
    }
  }
  /** What the tab carries: its count, its dot, and the words the dot says. */
  const badge = () => ({
    count: tab.getAttribute('data-tracy-count'),
    unread: tab.getAttribute('data-tracy-unread'),
    title: tab.getAttribute('title'),
    name: tab.getAttribute('aria-label')
  })
  const plain = (count) => ({ count, unread: null, title: null, name: null })
  const saved = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame
  }
  globalThis.document = /** @type {any} */ ({ body: {}, querySelectorAll: () => [tab] })
  globalThis.MutationObserver = /** @type {any} */ (
    class {
      observe() {}
      disconnect() {}
    }
  )
  // A hidden page runs no animation frame: a count painted only in one would stay stale.
  globalThis.requestAnimationFrame = /** @type {any} */ (() => 1)
  globalThis.cancelAnimationFrame = () => {}
  try {
    /** @type {(() => void) | null} */
    let due = null
    const state = render.createCommentsState({
      act: () => {},
      timers: {
        set: (fn) => {
          due = fn
          return 1
        },
        clear: () => {}
      }
    })
    const stop = render.watchCommentsBadge(state, () => 'Comments')
    state.lists.accept(list(ON_PAGE))
    await Promise.resolve()
    // Lee 04/10/2026: the number is every open thread of the site, all authors, and needs no read
    // marks; the dot (this person's unread ones) waits for them.
    assert.deepEqual(badge(), plain('4'), 'the open count at once, no dot before the read marks')
    state.setViewer(AKEMI.email)
    state.lists.setReads([])
    await Promise.resolve()
    // Akemi has opened nothing yet: Lee's three open threads are unread — e4 on another page included;
    // her own t3 never is.
    assert.deepEqual(
      badge(),
      { count: '4', unread: '3', title: '3 unread', name: 'Comments 4, 3 unread' },
      'open threads of the whole site, and the dot saying how many are unread'
    )
    state.clearing.start(SHOWN)
    await Promise.resolve()
    assert.deepEqual(
      badge(),
      { count: '1', unread: '1', title: '1 unread', name: 'Comments 1, 1 unread' },
      'at once, during the Undo window: e4 is left'
    )
    for (let i = 0; i < CLEAR_UNDO_MS / 1000; i += 1) due?.()
    // The fork lists them gone after the clear it was sent.
    state.lists.accept(list(ON_PAGE.filter((x) => !['m1', 'm2', 't3'].includes(x.id))))
    await Promise.resolve()
    assert.equal(badge().count, '1')
    // Opening e4 reads it: the dot and its words go, the number stays.
    state.lists.markRead('e4', NOW)
    await Promise.resolve()
    assert.deepEqual(badge(), plain('1'), 'read: no dot, the open count stays')
    // Nothing open anywhere: no pill at all (section 7, a "0" reads as a signal).
    state.lists.accept(list([]))
    await Promise.resolve()
    assert.deepEqual(badge(), plain(null))
    stop()
  } finally {
    globalThis.document = saved.document
    globalThis.MutationObserver = saved.MutationObserver
    globalThis.requestAnimationFrame = saved.raf
    globalThis.cancelAnimationFrame = saved.caf
  }
})

test('the notice lasts ten seconds (round 2, rule 6) and counts them down, 10 → 1, one a second; at 0 the clear goes', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  assert.equal(CLEAR_UNDO_MS, 10_000)
  assert.equal(t.armedFor(), 1000)
  const seen = [t.clearing.get()?.left]
  for (let i = 0; i < 9; i += 1) {
    t.tick()
    seen.push(t.clearing.get()?.left)
  }
  assert.deepEqual(seen, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  assert.deepEqual(t.clearing.get(), { count: 3, left: 1 })
  assert.deepEqual(t.acts, [])
  t.tick()
  assert.equal(t.clearing.get(), null)
  assert.equal(t.acts.length, 1)
})

test('Undo in the middle of the countdown stops it: nothing is sent, ever', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.tick()
  t.tick()
  t.clearing.undo()
  t.fire()
  assert.deepEqual(t.acts, [])
  assert.equal(t.clearing.get(), null)
})

test('Undo within the window: the rows come back and no clear is ever sent', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  assert.deepEqual(t.ids().sort(), ['e4', 'r5'])
  t.clearing.undo()
  assert.deepEqual(t.ids().sort(), ['e4', 'm1', 'm2', 'r5', 't3'])
  assert.equal(t.clearing.get(), null)
  t.fire()
  assert.deepEqual(t.acts, [])
})

test('when the window ends: one clear naming exactly the ids it hid; a comment made since is not in it', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.store.accept(list([...ON_PAGE, c('m6', 6)]))
  t.fire()
  assert.deepEqual(t.acts, [{ tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['t3', 'm2', 'm1'] }])
  assert.equal(t.clearing.get(), null)
  assert.deepEqual(t.ids().sort(), ['e4', 'm6', 'r5'])
})

test('the page hiding or unloading during the window sends the clear at once (the fork writes it with keepalive)', () => {
  for (const leave of ['pagehide', 'hidden']) {
    const t = setup()
    const target = new EventTarget()
    const doc = { visibilityState: 'visible' }
    const stop = commitClearOnLeave(t.clearing, target, doc)
    t.clearing.start(SHOWN)
    if (leave === 'pagehide') target.dispatchEvent(new Event('pagehide'))
    else {
      doc.visibilityState = 'hidden'
      target.dispatchEvent(new Event('visibilitychange'))
    }
    assert.deepEqual(
      t.acts,
      [{ tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['t3', 'm2', 'm1'] }],
      leave
    )
    t.fire()
    assert.equal(t.acts.length, 1, `${leave}: sent once`)
    stop()
  }
})

test('a poll during the window does not bring the rows back (nor into the badge)', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.store.accept(list(ON_PAGE))
  assert.deepEqual(t.ids().sort(), ['e4', 'r5'])
  assert.equal(badgeCount(t.store.getSnapshot()), 1, 'only e4, on another page, still counts')
})

test('U26: in Open, Delete all leaves the resolved comment alone', () => {
  const t = setup()
  assert.equal(t.clearing.start(), 3)
  assert.deepEqual(t.ids().sort(), ['e4', 'r5'])
  t.fire()
  assert.deepEqual(t.acts, [{ tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['t3', 'm2', 'm1'] }])
})

test('after the clear is sent the rows stay off until the tab lists them gone; a refused clear (the fork puts them back) shows them again', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.fire()
  assert.deepEqual(t.ids().sort(), ['e4', 'r5'])
  t.store.accept(list(ON_PAGE.slice(3, 4)))
  assert.deepEqual(t.ids().sort(), ['e4'])
  t.store.accept(list(ON_PAGE))
  assert.deepEqual(t.ids().sort(), ['e4', 'm1', 'm2', 'r5', 't3'])
})

test('a second Delete all during the window sends the first one before hiding the new rows', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.store.accept(list([...ON_PAGE, c('m6', 6)]))
  t.clearing.start(SHOWN)
  assert.deepEqual(t.acts, [{ tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['t3', 'm2', 'm1'] }])
  assert.deepEqual(t.clearing.get(), { count: 1, left: 10 })
  t.fire()
  assert.deepEqual(t.acts.at(-1), { tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['m6'] })
})

test('TH-7: Delete all tells the Browser tab to hide the same ids at once, so its pins and "Comments N" leave with the rows', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  assert.deepEqual(t.sent, [{ tabId: 'tab-a', sessionId: 's1', kind: 'hide', ids: ['t3', 'm2', 'm1'] }])
  t.fire()
  assert.deepEqual(
    t.sent,
    [
      { tabId: 'tab-a', sessionId: 's1', kind: 'hide', ids: ['t3', 'm2', 'm1'] },
      { tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids: ['t3', 'm2', 'm1'] }
    ],
    'hide, then the clear; no show once the window ended'
  )
})

test('TH-7: Undo tells the Browser tab to show them again; no clear is ever sent', () => {
  const t = setup()
  t.clearing.start(SHOWN)
  t.clearing.undo()
  t.fire()
  assert.deepEqual(t.sent, [
    { tabId: 'tab-a', sessionId: 's1', kind: 'hide', ids: ['t3', 'm2', 'm1'] },
    { tabId: 'tab-a', sessionId: 's1', kind: 'show', ids: ['t3', 'm2', 'm1'] }
  ])
})

test('nothing on this page: Delete all deletes nothing and shows no notice', () => {
  const t = setup([list([c('e4', 4, { url: NEWS })])])
  assert.equal(t.clearing.start(SHOWN), 0)
  assert.equal(t.clearing.get(), null)
})

/** e2e v7 INTH-1: the Browser tab says a Delete all was not saved (`tracy:comment-act-failed` `clear`). */
const refuseClear = (target, ids, code = 'SEAT_NOT_AUTHORIZED') =>
  target.dispatchEvent(
    new CustomEvent('tracy:comment-act-failed', {
      detail: { tabId: 'tab-a', sessionId: 's1', kind: 'clear', ids, text: '', code }
    })
  )

test('INTH-1: a Delete all the door refused is never silent — the rows come back at once and the head says "Could not delete. Try again."', () => {
  const target = new EventTarget()
  const t = setup([list(ON_PAGE)], target)
  t.clearing.start(SHOWN)
  t.fire()
  assert.equal(t.acts.length, 1)
  assert.equal(t.clearing.failed(), false)
  refuseClear(target, ['t3', 'm2', 'm1'])
  assert.deepEqual(t.ids().sort(), ['e4', 'm1', 'm2', 'r5', 't3'], 'every row is back, before any new list')
  assert.equal(t.clearing.failed(), true)
  // The next Delete all starts clean.
  t.clearing.start(SHOWN)
  assert.equal(t.clearing.failed(), false)
})

test('INTH-1: the failure line goes by itself after a while, and a refusal for ids this view did not send is not its own', () => {
  const target = new EventTarget()
  const t = setup([list(ON_PAGE)], target)
  refuseClear(target, ['m1'])
  assert.equal(t.clearing.failed(), false, 'nothing was sent from here')
  t.clearing.start(SHOWN)
  t.fire()
  refuseClear(target, ['m1', 'm2'])
  assert.equal(t.clearing.failed(), true)
  t.tick()
  assert.equal(t.clearing.failed(), false, 'the one timer armed for the line ran out')
})

test('INTH-1: an answered clear (already-gone threads counted as done) raises no failure line', () => {
  const target = new EventTarget()
  const t = setup([list(ON_PAGE)], target)
  t.clearing.start(SHOWN)
  t.fire()
  t.store.accept(list(ON_PAGE.map((x) => (['e4', 'r5'].includes(x.id) ? x : { ...x, removed: true }))))
  assert.deepEqual(t.ids().sort(), ['e4', 'r5'])
  assert.equal(t.clearing.failed(), false)
})

test('INTH-1: the head row reads the failure in plain words, as an alert, with the rows drawn again', () => {
  const html = render.drawFailed([list(ON_PAGE)])
  assert.match(html, /role="alert"[^>]*data-tracy-clear-failed="">Could not delete\. Try again\.</)
  for (const id of ['m1', 'm2', 't3']) assert.match(html, new RegExp(`data-comment="${id}"`))
  assert.ok(!html.includes('data-frozen'), 'the rows are live again, not frozen')
  assert.match(html, /<span>Delete all<\/span>/, 'Delete all is back to press again')
})
