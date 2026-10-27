/**
 * e2e v8 V8-2 (30/09, `tasks/evidence/comment-people/e2e-v8/verify.md`): in a conversation with no
 * message yet, the Comments view is on screen only while its definition says active
 * (`commentsViewDefinition`, `index.tsx`). Delete all takes the rows off the lists at the press
 * (`lists.hide`), so "the shown tab has a comment" went false 36–46 ms later, dsh put the session back
 * on its blank screen, and "N deleted · Undo (10)" was never seen — nor could a refusal's line be.
 * The view must stay open during the window, after it, and on a refusal, as it does in a conversation
 * that has messages.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { CLEAR_UNDO_MS } from '../src/client/comment-clear.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-delete-blank-'))
  const outfile = path.join(outDir, 'lib.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export { createCommentsState, commentsViewActive, deleteAll } from './CommentsView'`,
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
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const PAGE = 'https://northgate.tracy.test/'
const comment = (id, n) => ({
  id,
  n,
  url: PAGE,
  text: `comment ${n}`,
  status: 'pending',
  createdAt: Date.now() - 60_000 + n,
  element: null,
  author: { accountId: 'a1', email: 'lee@example.test', name: 'Lee', initial: 'L' },
  can: { edit: true, delete: true }
})
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'northgate',
  host: 'northgate.tracy.test',
  active: true,
  url: PAGE,
  comments
})

/**
 * A conversation with no message, its Comments view opened by its own tab (not the toolbar). The
 * Browser tab is played as the fork plays it: a `hide` takes the ids off the list it sends at once
 * (`comment-controller.ts` `setHidden` → `announceList` of `shownOf(store)`), a `show` puts them back,
 * and a `clear` leaves them gone.
 */
function blankConversation() {
  const target = new EventTarget()
  /** @type {(() => void)[]} */
  const due = []
  const sent = []
  const all = [comment('m1', 1), comment('m2', 2)]
  const off = new Set()
  /** @type {any} */
  let state
  const announce = () => state.lists.accept(list(all.filter((c) => !off.has(c.id))))
  state = lib.createCommentsState({
    act: (a) => {
      sent.push(a)
      if (a.kind === 'hide' || a.kind === 'clear') for (const id of a.ids) off.add(id)
      if (a.kind === 'show') for (const id of a.ids) off.delete(id)
      announce()
    },
    target,
    storage: null,
    timers: { set: (fn) => (due.push(fn), due.length), clear: () => {} }
  })
  announce()
  const clock = () => {
    for (let i = 0; i < CLEAR_UNDO_MS / 1000 && due.length > 0; i += 1) due.shift()()
  }
  return { state, target, sent, clock }
}

test('V8-2: the view stays active through Delete all in a conversation with no message — during the window, and after the clear went', () => {
  const { state, sent, clock } = blankConversation()
  // Since 01/10 a listed comment alone no longer makes a blank conversation active (start screen
  // Case 2): the person opens the view (Comments start card or Browser toolbar), which sets wanted.
  assert.equal(
    lib.commentsViewActive(state),
    false,
    'comments listed, view not asked for: start screen stays'
  )
  state.wanted.set(true)
  assert.equal(lib.commentsViewActive(state), true)

  lib.deleteAll(state, {})
  assert.deepEqual(state.clearing.get(), { count: 2, left: 10 }, '"2 deleted · Undo (10)" is up')
  assert.equal(lib.commentsViewActive(state), true, 'still active while the rows wait out the window')

  clock()
  assert.equal(sent.filter((a) => a.kind === 'clear').length, 1, 'the clear went at the end of the window')
  assert.equal(state.clearing.get(), null)
  assert.equal(lib.commentsViewActive(state), true, 'after the clear: "No comments yet", as with messages')
})

test('V8-2: a refused Delete all keeps the view active, so "Could not delete. Try again." has a place', () => {
  const { state, target, clock } = blankConversation()
  lib.deleteAll(state, {})
  clock()
  target.dispatchEvent(
    new CustomEvent('tracy:comment-act-failed', {
      detail: {
        tabId: 'tab-a',
        sessionId: 's1',
        kind: 'clear',
        ids: ['m1', 'm2'],
        text: '',
        code: 'SEAT_NOT_AUTHORIZED'
      }
    })
  )
  assert.equal(state.clearing.failed(), true)
  assert.equal(lib.commentsViewActive(state), true)
})

test('Undo in a conversation with no message keeps the view as it was', () => {
  const { state } = blankConversation()
  lib.deleteAll(state, {})
  state.clearing.undo()
  assert.equal(lib.commentsViewActive(state), true)
})

test('a conversation whose Browser tab never listed a comment, and never asked for the view, is not active', () => {
  const state = lib.createCommentsState({ act: () => {}, target: null, storage: null })
  state.lists.accept(list([]))
  assert.equal(lib.commentsViewActive(state), false)
})
