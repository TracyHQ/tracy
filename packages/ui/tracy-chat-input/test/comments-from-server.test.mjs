/**
 * The Comments tab is filled from the server, whether or not the site's Browser tab is open
 * (Akemi 01/10/2026, measured on cowork.tracy.site: kineticakemi with 11 open comments, session
 * "Hello" with the right pane on My Sites — the tab read "No comments yet" and carried no count until
 * the Browser tab was shown, which then listed all 11 at once).
 *
 * Pinned here:
 *   - with NO Browser tab listing, a server answering N comments gives the badge N and N rows;
 *   - a Browser tab of the conversation on screen listing the same comments keeps it at N (one source
 *     at a time: the live tab's list wins while it exists, the server's fills in while none does);
 *   - while the server has not answered, the tab says it is loading, never "No comments yet"; a
 *     refusal says the comments could not be loaded, never "No comments yet";
 *   - with no Browser tab there is no current page: the tab shows All pages whatever was remembered;
 *   - rows from the server act on nothing (no tab to act through): no Resolve, not a button.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { badgeCount, createCommentLists, viewModel } from '../src/client/comment-view.mjs'
import { commentsDoor, createServerComments } from '../src/client/comment-server.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-from-server-'))
  const outfile = path.join(outDir, 'lib.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView } from './CommentsView'
        export { createCommentsState }
        export const draw = (state) => renderToStaticMarkup(createElement(makeCommentsView(state), {}))`,
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

const HOME = 'https://kineticakemi.tracy.site/'
const ABOUT = 'https://kineticakemi.tracy.site/about/'
const AKEMI = {
  accountId: 'a-akemi',
  email: 'akemi@example.com',
  name: 'Akemi',
  initial: 'A',
  color: '#7c3aed'
}

/** One row as `GET /api/sites/:key/comments` answers it (`apps/tracy-web` `comments.js` `shape`). */
const serverRow = (i, over = {}) => ({
  id: `c${i}`,
  n: i + 1,
  url: i % 3 === 0 ? ABOUT : HOME,
  element: {
    text: `Trusted by 2,000+ teams ${i}`,
    tag: 'p',
    image: null,
    domPath: 'main > section > p',
    selector: `section:nth-of-type(${i + 1}) p`,
    rect: { x: 0, y: 0, width: 10, height: 10 },
    marks: []
  },
  locate: null,
  text: `[TAM] comment ${i}`,
  status: 'pending',
  replyTo: null,
  createdAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
  updatedAt: null,
  resolvedAt: null,
  resolvedBy: null,
  deletedAt: null,
  deletedRoot: false,
  author: AKEMI,
  can: { edit: true, delete: true },
  sentToTracy: false,
  attachments: [],
  ...over
})
const N = 11
const ROWS = Array.from({ length: N }, (_, i) => serverRow(i))
const BODY = {
  comments: ROWS,
  n_next: N + 1,
  siteChangedAt: null,
  attachments: { enabled: true, maxBytes: 10_000_000, maxFiles: 5 },
  limits: { maxChars: 4000 }
}

/** A fetch that answers the door once `release()` is called. */
function door(answer = { status: 200, body: BODY }) {
  /** @type {string[]} */
  const asked = []
  /** @type {() => void} */
  let release = () => {}
  const gate = new Promise((resolve) => {
    release = () => resolve(undefined)
  })
  const fetch = async (/** @type {string} */ url) => {
    asked.push(url)
    await gate
    if (answer.status === 0) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { fetch, asked, release }
}

/** The fork's `tracy:comment-list` for the same comments, as a Browser tab of session s1 sends it. */
const tabList = (url = HOME) => ({
  sessionId: 's1',
  tabId: 'tab1',
  siteKey: 'kineticakemi.tracy.site',
  host: 'kineticakemi.tracy.site',
  active: true,
  url,
  comments: ROWS.map((r) => ({
    id: r.id,
    n: r.n,
    url: r.url,
    text: r.text,
    createdAt: r.createdAt,
    // `sendElementOf` in the fork: its plain label (`plainLabel`) beside the element's facts.
    element: {
      url: r.url,
      selector: r.element.selector,
      label: `"${r.element.text}"`,
      text: r.element.text,
      rect: r.element.rect,
      marks: [],
      tag: 'p',
      image: null
    },
    resolved: false,
    replyCount: 0,
    sentToTracy: false,
    attachments: [],
    author: AKEMI,
    can: r.can
  })),
  attachments: BODY.attachments,
  limits: BODY.limits
})

test('the door is the site root door, its key encoded', () => {
  assert.equal(commentsDoor('kineticakemi.tracy.site'), '/api/sites/kineticakemi.tracy.site/comments')
  assert.equal(commentsDoor('a b/c'), '/api/sites/a%20b%2Fc/comments')
})

test('no Browser tab: the server answering N comments gives the badge N and N rows', async () => {
  const lists = createCommentLists()
  lists.focus('session-hello')
  const d = door()
  const server = createServerComments({ lists, siteKey: 'kineticakemi.tracy.site', fetch: d.fetch })
  const done = server.load()
  d.release()
  await done
  assert.deepEqual(d.asked, ['/api/sites/kineticakemi.tracy.site/comments'])
  assert.equal(badgeCount(lists.getSnapshot()), N)
  const vm = viewModel(lists.getSnapshot(), { filter: 'all' })
  assert.equal(vm.open.length, N)
  assert.equal(vm.empty, false)
  assert.equal(vm.loading, false)
  assert.equal(vm.failed, false)
  assert.equal(vm.source, 'server')
})

test('a Browser tab listing the same comments keeps the count at N — no duplicates', async () => {
  const lists = createCommentLists()
  lists.focus('s1')
  const d = door()
  const server = createServerComments({ lists, siteKey: 'kineticakemi.tracy.site', fetch: d.fetch })
  const done = server.load()
  d.release()
  await done
  lists.accept(tabList())
  const vm = viewModel(lists.getSnapshot(), { filter: 'all' })
  assert.equal(badgeCount(lists.getSnapshot()), N)
  assert.equal(vm.open.length, N)
  assert.equal(new Set(vm.open.map((r) => r.id)).size, N)
  assert.equal(vm.source, 'tab')
  // The rows of the live tab act through it.
  assert.ok(vm.open.every((r) => r.tabId === 'tab1'))
  // The server answering again later changes nothing while the tab lists.
  const again = server.load()
  await again
  assert.equal(badgeCount(lists.getSnapshot()), N)
})

test('a row reads the same from the server as from the Browser tab (no flicker when the tab opens)', async () => {
  const lists = createCommentLists()
  lists.focus('s1')
  const d = door()
  const server = createServerComments({ lists, siteKey: 'kineticakemi.tracy.site', fetch: d.fetch })
  const done = server.load()
  d.release()
  await done
  const before = viewModel(lists.getSnapshot(), { filter: 'all' }).open
  lists.accept(tabList())
  const afterRows = viewModel(lists.getSnapshot(), { filter: 'all' }).open
  const face = (/** @type {any} */ r) => [r.id, r.text, r.chip, r.kind, r.path, r.author, r.initial, r.color]
  assert.deepEqual(before.map(face), afterRows.map(face))
})

test('while the server has not answered: loading, never empty; nothing counted', async () => {
  const lists = createCommentLists()
  lists.focus('session-hello')
  const d = door()
  const server = createServerComments({ lists, siteKey: 'kineticakemi.tracy.site', fetch: d.fetch })
  const done = server.load()
  const vm = viewModel(lists.getSnapshot())
  assert.equal(vm.loading, true)
  assert.equal(vm.empty, false)
  assert.equal(badgeCount(lists.getSnapshot()), 0)
  d.release()
  await done
})

test('a refusal or no answer: failed, never empty', async () => {
  for (const answer of [{ status: 403, body: { code: 'SEAT_NOT_AUTHORIZED' } }, { status: 0 }]) {
    const lists = createCommentLists()
    const d = door(answer)
    const server = createServerComments({ lists, siteKey: 'k', fetch: d.fetch })
    const done = server.load()
    d.release()
    await done
    const vm = viewModel(lists.getSnapshot())
    assert.equal(vm.failed, true, JSON.stringify(answer))
    assert.equal(vm.loading, false)
    assert.equal(vm.empty, false)
  }
})

test('a reload that fails after a good answer keeps the comments it had', async () => {
  const lists = createCommentLists()
  let ok = true
  const fetch = async () =>
    ok ? new Response(JSON.stringify(BODY), { status: 200 }) : new Response('{}', { status: 502 })
  const server = createServerComments({ lists, siteKey: 'k', fetch })
  await server.load()
  ok = false
  await server.load()
  const vm = viewModel(lists.getSnapshot(), { filter: 'all' })
  assert.equal(vm.failed, false)
  assert.equal(vm.open.length, N)
})

test('no Browser tab: there is no current page, so the tab shows All pages', async () => {
  const lists = createCommentLists()
  const server = createServerComments({
    lists,
    siteKey: 'k',
    fetch: async () => new Response(JSON.stringify(BODY), { status: 200 })
  })
  await server.load()
  const vm = viewModel(lists.getSnapshot(), { filter: 'page' })
  assert.equal(vm.filter, 'all')
  assert.equal(vm.open.length, N)
  assert.equal(vm.counts.page, 0)
  assert.equal(vm.shown, null)
})

test('the view: loading and failed never say "No comments yet"; N rows from the server, read-only', async () => {
  const state = lib.createCommentsState({ storage: null })
  state.lists.serve({ status: 'loading' })
  const loading = lib.draw(state)
  assert.doesNotMatch(loading, /No comments yet/)
  assert.match(loading, /data-tracy-comments-loading/)
  assert.match(loading, /Loading comments/)

  state.lists.serve({ status: 'failed' })
  const failed = lib.draw(state)
  assert.doesNotMatch(failed, /No comments yet/)
  assert.match(failed, /data-tracy-comments-failed/)
  assert.match(failed, /Could not load comments/)

  state.lists.serve({ status: 'ready', siteKey: 'k', body: BODY })
  const ready = lib.draw(state)
  assert.doesNotMatch(ready, /No comments yet/)
  // All pages, by page (layout B): every comment counted under its page's head; with no page shown the
  // first group is open, the others folded.
  const counts = [...ready.matchAll(/class="tv-cv-page-count"[^>]*>(\d+)</g)].map((m) => Number(m[1]))
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    N
  )
  assert.equal((ready.match(/data-comment="/g) ?? []).length, counts[0])
  // No tab to act through: no Resolve on a row, and a row is not a button.
  assert.doesNotMatch(ready, /tv-cv-resolve/)
  assert.doesNotMatch(ready, /class="tv-cv-row"[^>]*role="button"/)

  // An empty site, once the server said so: the plain empty state.
  state.lists.serve({ status: 'ready', siteKey: 'k', body: { ...BODY, comments: [] } })
  assert.match(lib.draw(state), /No comments yet/)
})
