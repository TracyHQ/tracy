/**
 * UI fine-tune of the Comments tab, round 2 (30/09 noon; rules `tasks/todo-comment-people.md`
 * §"UI fine-tune 30/09 — round 2" items 5–7, acceptance U41–U48 in
 * `tasks/evidence/comment-people/test-plan-ui-finetune.md`), rendered to markup:
 *   5. the resolved toggle stands centred in the tab;
 *   6. (round 3, 30/09) on Delete all nothing in the head row moves: "OPEN" reads "5 deleted" in its
 *      slot, the Delete all button itself reads "Undo (10)" counting down, Send all stays dimmed; the rows
 *      stay where they were, dimmed and not clickable, for the 10 s; then the clear goes and the empty
 *      state shows; Undo brings the rows and the head back;
 *   7. every number counts threads (the thread card's Send has none: the fork's `editSend`).
 * Pixel checks (heights, tops, narrow columns) are measured in a browser: see the round's evidence.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { CLEAR_UNDO_MS } from '../src/client/comment-clear.mjs'
import { CSS } from '../src/client/styles.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
/** Someone who wrote none of the fixtures' comments, so every open thread is unread to them. */
const READER = 'reader@example.test'
let render

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-finetune2-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView } from './CommentsView'
        export function stateOf(lists, options = {}) {
          const acts = []
          let due = null
          const state = createCommentsState({
            act: (a) => acts.push(a),
            timers: { set: (fn) => { due = fn; return 1 }, clear: () => { due = null } },
            storage: null,
            target: null
          })
          for (const list of lists) state.lists.accept(list)
          // This person's read marks (comment-reads.mjs); absent = not in yet, so no unread pill.
          if (options.reads) state.lists.setReads(options.reads)
          if (options.viewer) state.setViewer(options.viewer)
          if (options.status) state.status.set(options.status)
          return { state, acts, tick: () => due?.() }
        }
        export function view(state) {
          return renderToStaticMarkup(createElement(makeCommentsView(state), { sessionId: 's1' }))
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
const LEE = { accountId: 'a1', email: 'lee@example.test', name: 'Lee', initial: 'L' }
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
/** @param {object[]} comments */
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'northgate',
  host: 'northgate.tracy.test',
  active: true,
  url: PAGE,
  comments
})
/** Five open comments, one with three replies (U42, U47), and one resolved. */
const FIVE = [
  c('m1', 1),
  c('m2', 2),
  c('m3', 3),
  c('m4', 4),
  c('m5', 5, { replyCount: 3 }),
  c('x1', 6, { replyTo: 'm5' }),
  c('x2', 7, { replyTo: 'm5' }),
  c('x3', 8, { replyTo: 'm5' }),
  c('r9', 9, { status: 'resolved', resolvedAt: NOW })
]
/** @param {string} html @returns {string[]} the comment rows in order, with `*` for a frozen one. */
const rows = (html) =>
  [...html.matchAll(/<div class="tv-ci" data-comment="([^"]+)"([^>]*)>/g)].map(
    (m) => `${m[1]}${m[2].includes('data-frozen=""') ? '*' : ''}`
  )

test('rule 6: the Undo window is 10 s, counted down 10 → 1 on the button', () => {
  assert.equal(CLEAR_UNDO_MS, 10_000)
  const t = render.stateOf([list(FIVE)])
  t.state.clearing.start({})
  const seen = []
  for (let i = 0; i < 10; i += 1) {
    seen.push(t.state.clearing.get()?.left)
    t.tick()
  }
  assert.deepEqual(seen, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  assert.equal(t.state.clearing.get(), null, 'the clear went at 0')
})

/** @param {string} html @returns {string} the toolbar's markup (`.tv-cv-bar` … the list). */
const headOf = (html) => {
  const at = html.indexOf('<div class="tv-cv-bar"')
  assert.ok(at >= 0, 'a toolbar is drawn')
  return html.slice(at, html.indexOf('data-tracy-comment-list', at))
}

test('U42/U43 (round 3, redesign A): nothing in the toolbar moves — Delete all itself becomes Undo, Ask Tracy to edit all stays dimmed, a thin bar drains; the rows stay, in place, dimmed and inert', () => {
  const t = render.stateOf([list(FIVE)])
  const before = render.view(t.state)
  assert.deepEqual(rows(before), ['m5', 'm4', 'm3', 'm2', 'm1'])
  t.state.clearing.start({})
  const html = render.view(t.state)
  assert.deepEqual(rows(html), ['m5*', 'm4*', 'm3*', 'm2*', 'm1*'], 'same rows, same order, all frozen')
  const head = headOf(html)
  // Delete all's own button, the undo icon for the trash, "Undo" for its words, the count in its name.
  assert.match(
    head,
    /<button type="button" class="tv-cv-del" title="Undo" aria-label="Undo · 5 deleted" data-tracy-undo="">.*?<svg[^>]*lucide-rotate-ccw.*?<span class="tv-cv-swap" aria-hidden="true"><span>Undo<\/span>/
  )
  assert.ok(!/lucide-trash/.test(head), 'the trash icon gave way to the undo icon')
  assert.match(head, /class="tv-cv-bar-drain"/, 'the countdown is the draining bar')
  assert.match(head, /<button type="button" class="tv-cv-primary tv-cv-small tv-cv-send-all" disabled=""/)
  // The button keeps one width whatever it reads: both wordings sit, hidden, in the same cell.
  const sizers = (h) => [...h.matchAll(/<span class="tv-cv-sizer">([^<]*)<\/span>/g)].map((m) => m[1])
  assert.deepEqual(sizers(head), ['Delete all', 'Undo'])
  assert.deepEqual(sizers(headOf(before)), ['Delete all', 'Undo'])
  assert.match(CSS, /\.tv-cv-swap \{[^}]*display: inline-grid;/)
  assert.match(CSS, /\.tv-cv-swap > \* \{[^}]*grid-area: 1 \/ 1;/)
  assert.match(CSS, /\.tv-cv-sizer \{[^}]*visibility: hidden;/)
  // Not clickable: the row is inert (no focus, no click reaches it).
  assert.match(html, /<div class="tv-ci" data-comment="m5" data-frozen="" inert="(?:true)?" role="button">/)
  assert.ok(!/data-frozen=""[^>]*tabindex="0"/.test(html), 'a frozen row takes no focus')
})

test('U43, redesign A: the countdown is the bar, started where the window stands; the button keeps its slot', () => {
  const t = render.stateOf([list(FIVE)])
  t.state.clearing.start({})
  t.tick()
  t.tick()
  const head = headOf(render.view(t.state))
  assert.match(head, /<span class="tv-cv-swap" aria-hidden="true"><span>Undo<\/span>/)
  assert.match(head, /animation-duration:10000ms;animation-delay:-2000ms/)
})

test('U42, redesign A: in Resolved, Delete all takes the resolved ones; they stay in place, frozen', () => {
  const t = render.stateOf([list(FIVE)], { status: 'resolved' })
  t.state.clearing.start({ status: 'resolved' })
  const html = render.view(t.state)
  assert.deepEqual(rows(html), ['r9*'])
  assert.match(headOf(html), /aria-label="Undo · 1 deleted"/)
})

test('U43, redesign A + status filter 02/10: no uppercase OPEN label any more; in a narrow tab the actions wrap whole under the filter, their words never', () => {
  assert.doesNotMatch(CSS, /tv-cv-label-text/)
  assert.match(CSS, /\.tv-cv-bar \{[^}]*display: flex; flex-wrap: wrap; align-items: center/)
  assert.match(CSS, /\.tv-cv-bar-actions \{[^}]*margin-left: auto/)
  assert.match(CSS, /\.tv-cv-del \{[^}]*white-space: nowrap/)
})

test('U44: after the 10 s the clear is sent and, once the tab lists them gone, the empty state shows', () => {
  const t = render.stateOf([list(FIVE)])
  t.state.clearing.start({})
  for (let i = 0; i < 10; i += 1) t.tick()
  assert.deepEqual(
    t.acts.filter((a) => a.kind === 'clear').map((a) => a.ids),
    [['m5', 'm4', 'm3', 'm2', 'm1']]
  )
  t.state.lists.accept(list(FIVE.filter((x) => x.status === 'resolved')))
  const html = render.view(t.state)
  assert.deepEqual(rows(html), [])
  assert.ok(!html.includes('data-tracy-clear-notice'))
  assert.ok(!html.includes('deleted<'))
  assert.match(html, /Page has no open comments|No open comments|data-tracy-none/)
})

test('U45: Undo brings the rows back lit and the head row as it was; nothing is sent', () => {
  const t = render.stateOf([list(FIVE)])
  const before = render.view(t.state)
  t.state.clearing.start({})
  t.tick()
  t.tick()
  t.tick()
  t.state.clearing.undo()
  const html = render.view(t.state)
  assert.equal(html, before)
  assert.deepEqual(
    t.acts.map((a) => a.kind),
    ['hide', 'show'],
    'the Browser tab hid the pins at once and shows them again'
  )
})

test('deleting every comment of the site: the rows still stand frozen under the head until the window ends', () => {
  const t = render.stateOf([list([c('m1', 1)])])
  t.state.clearing.start({})
  const html = render.view(t.state)
  assert.deepEqual(rows(html), ['m1*'])
  assert.match(html, /aria-label="Undo · 1 deleted"/)
  assert.ok(!html.includes('No comments yet'), 'the empty state waits for the clear')
})

test('U46/U47: the page filter counts threads: a thread with 3 replies is 1', () => {
  const html = render.view(render.stateOf([list(FIVE)], { reads: [], viewer: READER }).state)
  assert.match(
    html,
    /Current page<\/span><span class="tv-cv-filter-short">Page<\/span><span class="tv-cv-pill" data-dot="" title="5 unread">5</
  )
  assert.match(html, /Ask Tracy to edit all/)
})

test('rule 5, redesign A: the resolved toggle is gone; Resolved is a choice of the status filter', () => {
  const html = render.view(render.stateOf([list(FIVE)]).state)
  assert.doesNotMatch(html, /data-tracy-resolved-toggle|Show 1 resolved comment/)
  assert.match(html, /data-tracy-status-filter="open"/)
})

test('U42, redesign A: ten pixels under the toolbar, so a stuck page header never touches it', () => {
  assert.match(CSS, /\.tv-cv-bar \{[^}]*padding: 10px 0 10px;/)
  assert.match(CSS, /\.tv-cv-card-head \{\s*position: sticky; top: 0;/)
})

test("e2e L3: the chat chip takes the colour the Comments tab shows for that name (the fork's, by account), else the neutral grey", async () => {
  const { chipColor, createCommentLists, NEUTRAL_FACE_COLOUR } = await import(
    '../src/client/comment-view.mjs'
  )
  const store = createCommentLists()
  const SAM_A = { accountId: 'acct-5', email: 'pick-a@example.test', name: 'Sam Tester', color: '#db2777' }
  const SAM_B = { accountId: 'acct-16', email: 'pick-b@example.test', name: 'Sam Tester', color: '#4f46e5' }
  const MAI = { accountId: 'acct-2', email: 'mai@example.test', name: 'Mai', color: '#0d9488' }
  store.accept(
    list([
      c('a', 1, { author: SAM_A }),
      c('b', 2, { author: SAM_B }),
      c('r', 3, { author: MAI, replyTo: 'a' })
    ])
  )
  const snapshot = store.getSnapshot()
  // The turn names namesakes "Name (e-mail local part)", as the tab does.
  assert.equal(chipColor(snapshot, 'Sam Tester (pick-a)'), '#db2777')
  assert.equal(chipColor(snapshot, 'Sam Tester (pick-b)'), '#4f46e5')
  assert.equal(chipColor(snapshot, 'mai'), '#0d9488', 'a reply author too; case does not matter')
  // No account to take a colour from: grey, never a colour hashed from the name in the browser.
  assert.equal(chipColor(snapshot, 'Sam Tester'), NEUTRAL_FACE_COLOUR, 'ambiguous: two accounts')
  assert.equal(chipColor(snapshot, 'Nobody'), NEUTRAL_FACE_COLOUR, 'not listed (another site, an old turn)')
  // A turn that carries its author's colour (`author-color`) is painted in it, whatever the lists say.
  assert.equal(chipColor(snapshot, 'Sam Tester', '#059669'), '#059669', 'the turn names the account')
  assert.equal(chipColor(snapshot, 'Nobody', '#7c3aed'), '#7c3aed', 'another site: still the server’s')
  assert.equal(chipColor(snapshot, 'mai', 'not-a-colour'), '#0d9488', 'a bad colour is no colour')
})
