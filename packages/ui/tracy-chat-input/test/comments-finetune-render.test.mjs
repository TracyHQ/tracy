/**
 * UI fine-tune of the Comments tab (Brian 30/09 morning; acceptance U1–U40,
 * `tasks/evidence/comment-people/test-plan-ui-finetune.md`), rendered to markup: one avatar per row, one
 * meta line, the sub-filter above the head, the Resolved group hidden behind a small line, the empty
 * page's shortcuts and the in-place "Resolved. Undo".
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CSS } from '../src/client/styles.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let render

before(async () => {
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-finetune-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { countName, createCommentsState, makeCommentsView, unreadWords } from './CommentsView'
        export { countName, unreadWords }
        export function stateOf(lists, options = {}) {
          const acts = []
          const state = createCommentsState({
            act: (a) => acts.push(a),
            resolveAct: (a) => acts.push(a),
            timers: { set: () => 1, clear: () => {} },
            storage: options.storage ?? null,
            target: null
          })
          for (const list of lists) state.lists.accept(list)
          // This person's read marks (comment-reads.mjs); absent = not in yet, so no unread pill.
          if (options.reads) state.lists.setReads(options.reads)
          if (options.viewer) state.setViewer(options.viewer)
          if (options.filter) state.setFilter(options.filter)
          if (options.status) state.status.set(options.status)
          for (const id of options.resolving ?? [])
            state.resolving.start({ tabId: 'tab-a', sessionId: 's1', kind: 'resolve', ids: [id] })
          return { state, acts }
        }
        export function view(state) {
          return renderToStaticMarkup(createElement(makeCommentsView(state), {}))
        }
        export function draw(lists, options) {
          return view(stateOf(lists, options).state)
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

/** Someone who wrote none of the fixtures' comments, so every open thread is unread to them. */
const READER = 'reader@example.test'
const NOW = Date.now()
const MIN = 60_000
const SITE = 'https://capiwl1643.tracy.test'
const HOME = `${SITE}/`
const SERVICES = `${SITE}/services/`
const ABOUT = `${SITE}/about/`
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const MAI = { accountId: 'a-mai', email: 'mai@northgate.ru', name: 'Mai', initial: 'M' }
const c = (id, extra = {}) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  status: 'pending',
  createdAt: NOW - 10 * MIN,
  element: { url: HOME, selector: 'h1', text: 'Industrial construction', tag: 'h1' },
  author: LEE,
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false,
  ...extra
})
const list = (comments, extra = {}) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'capiwl1643',
  host: 'capiwl1643.tracy.test',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const resolved = { status: 'resolved', resolvedAt: NOW - MIN }
const SITE_COMMENTS = [
  c('h1', { createdAt: NOW - 1 * MIN }),
  c('s1', { url: SERVICES, createdAt: NOW - 2 * MIN, author: MAI }),
  c('h2', { createdAt: NOW - 3 * MIN, element: null }),
  c('s2', { url: SERVICES, createdAt: NOW - 5 * MIN }),
  c('h3', { createdAt: NOW - 6 * MIN }),
  c('hx', { createdAt: NOW - 7 * MIN, ...resolved }),
  c('hy', { createdAt: NOW - 8 * MIN, ...resolved }),
  c('sx', { url: SERVICES, createdAt: NOW - 9 * MIN, ...resolved })
]
/** @param {string} html @param {string} id */
const rowOf = (html, id) => {
  const at = html.indexOf(`data-comment="${id}"`)
  assert.ok(at >= 0, `row ${id} drawn`)
  const start = html.lastIndexOf('<div', at)
  const next = html.indexOf('data-comment="', at + 1)
  return html.slice(start, next < 0 ? undefined : html.lastIndexOf('<div', next))
}
const text = (/** @type {string} */ html) => html.replace(/<[^>]+>/g, '')

test('U1/U2, redesign A: one avatar per row, on the name line; no block chip on the row', () => {
  const html = render.draw([list(SITE_COMMENTS)])
  for (const id of ['h1', 'h2', 'h3']) {
    const row = rowOf(html, id)
    assert.equal(row.match(/tv-ci-avatar/g)?.length, 1, `${id}: one avatar`)
    assert.doesNotMatch(row, /tv-cv-chip|tv-cv-dot/, `${id}: no block chip`)
  }
  assert.doesNotMatch(text(rowOf(html, 'h2')), /Whole page/)
})

test('L1: All pages folds by page — the page shown first and open with its name, path, "Current" and count, the others folded; a row never says its page', () => {
  const html = render.draw([list(SITE_COMMENTS)], { filter: 'all' })
  const heads = [
    ...html.matchAll(
      /<section class="tv-cv-card" data-tracy-page-group="([^"]+)"[^>]*><button type="button" class="tv-cv-card-head" (aria-expanded="(?:true|false)")>(.*?)<span class="tv-cv-page-count">(\d+)<\/span><\/button>/g
    )
  ]
  assert.deepEqual(
    heads.map((m) => [m[1], m[4]]),
    [
      ['/', '3'],
      ['/services/', '2']
    ]
  )
  assert.equal(heads[0][2], 'aria-expanded="true"')
  assert.match(heads[0][3], />Home<[^]*class="tv-cv-here">Current</)
  assert.equal(heads[1][2], 'aria-expanded="false"')
  assert.match(heads[1][3], />\/services\/</)
  assert.ok(html.indexOf('data-comment="h3"') < html.indexOf('data-tracy-page-group="/services/"'))
  assert.doesNotMatch(html, /data-comment="s1"/)
  assert.doesNotMatch(html, /capiwl1643 ·/)
  assert.doesNotMatch(html, /tv-cv-where|data-here|tv-cv-page"/)
})

test('L1: on Current page there is one card, the page shown, named, with its Current mark', () => {
  const html = render.draw([list(SITE_COMMENTS)])
  assert.equal(html.match(/data-tracy-page-group=/g)?.length, 1)
  assert.match(html, /<span class="tv-cv-page-name" title="Home">Home<\/span>/)
  assert.match(html, /class="tv-cv-here">Current</)
  assert.doesNotMatch(html, /data-here/)
})

test('redesign A: hover or focus shows Resolve (✓) and ⋯ in the fixed corner; a resolved row offers ⋯ only', () => {
  const html = render.draw([list(SITE_COMMENTS)])
  const row = rowOf(html, 'h1')
  assert.match(
    row,
    /<span class="tv-ci-corner"><span class="tv-ci-acts"><button type="button" class="tv-ci-act" title="Resolve" aria-label="Resolve" data-tracy-resolve="">.*?<\/button><button type="button" class="tv-ci-act" title="More actions"/
  )
  assert.match(CSS, /\.tv-ci-acts \{[^}]*visibility: hidden;/)
  assert.match(CSS, /\.tv-ci:hover \.tv-ci-acts, \.tv-ci:focus-within \.tv-ci-acts/)
  assert.match(CSS, /@media \(hover: none\) \{ \.tv-ci-acts \{ visibility: visible; \}/)
  const shown = render.draw([list(SITE_COMMENTS)], { status: 'resolved' })
  assert.match(rowOf(shown, 'hx'), /data-resolved=""/)
  assert.doesNotMatch(rowOf(shown, 'hx'), /data-tracy-resolve/)
  assert.match(rowOf(shown, 'hx'), /data-tracy-more="hx"/)
})

test('U10/U22: the filter sits above the Delete all / Send all row, Current page chosen, round unread counters on both sides', () => {
  const html = render.draw([list(SITE_COMMENTS)], { reads: [], viewer: READER })
  const filter = html.indexOf('data-tracy-filter')
  const del = html.indexOf('<span>Delete all</span>')
  assert.ok(filter >= 0 && del > filter, 'filter first')
  assert.match(
    html,
    /aria-pressed="true"[^>]*><span class="tv-cv-filter-long">Current page<.*?data-dot="" title="3 unread">3</
  )
  assert.match(
    html,
    /aria-pressed="false"[^>]*><span class="tv-cv-filter-long">All pages<.*?data-dot="" title="5 unread">5</
  )
  assert.match(
    html,
    /<\/svg><span class="tv-cv-swap" aria-hidden="true"><span>Delete all<\/span>/,
    'Delete all: no scope, no count'
  )
})

test('U12/U13: a remembered All pages comes back for the same person; another person gets Current page', () => {
  const m = new Map()
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
  render.stateOf([list(SITE_COMMENTS)], { storage, viewer: 'lee@example.com', filter: 'all' })
  assert.match(
    render.draw([list(SITE_COMMENTS)], { storage, viewer: 'lee@example.com' }),
    /aria-pressed="true"[^>]*><span class="tv-cv-filter-long">All pages/
  )
  assert.match(
    render.draw([list(SITE_COMMENTS)], { storage, viewer: 'mai@northgate.ru' }),
    /aria-pressed="true"[^>]*><span class="tv-cv-filter-long">Current page/
  )
})

test('U29/U30, status filter 02/10: the list shows Open or Resolved, never both; the Open | Resolved control shows both sides, the chosen one pressed', () => {
  const open = render.draw([list(SITE_COMMENTS)])
  assert.doesNotMatch(open, /data-comment="hx"/)
  assert.match(open, /data-tracy-status-filter="open"/)
  assert.match(open, /aria-pressed="true" data-tracy-status="open"><span class="tv-cv-filter-long">Open</)
  assert.match(
    open,
    /aria-pressed="false" data-tracy-status="resolved"><span class="tv-cv-filter-long">Resolved</
  )
  assert.doesNotMatch(open, /Show \d+ resolved|Hide resolved/)
  const shown = render.draw([list(SITE_COMMENTS)], { status: 'resolved' })
  assert.match(shown, /data-comment="hx"/)
  assert.doesNotMatch(shown, /data-comment="h1"/)
  assert.match(shown, /data-tracy-status-filter="resolved"/)
  assert.match(
    shown,
    /aria-pressed="true" data-tracy-status="resolved"><span class="tv-cv-filter-long">Resolved</
  )
})

test("U31, 04/10: the page filter's pills count OPEN threads, all authors, in Resolved too; the dot says this person's unread ones in each pill's scope, none before the read marks are in", () => {
  assert.match(
    render.draw([list(SITE_COMMENTS)], { filter: 'all', status: 'resolved', reads: [], viewer: READER }),
    /aria-pressed="true" aria-label="All pages 5, 5 unread"><span class="tv-cv-filter-long">All pages<.*?<span class="tv-cv-pill" data-dot="" title="5 unread">5</
  )
  assert.match(
    render.draw([list(SITE_COMMENTS)], { status: 'resolved', reads: [], viewer: READER }),
    /aria-pressed="true" aria-label="Current page 3, 3 unread"><span class="tv-cv-filter-long">Current page<.*?<span class="tv-cv-pill" data-dot="" title="3 unread">3</
  )
  // The read marks not in: the open counts at once, never resolved ones (not `counts`), no dot, no
  // "0 unread", and the buttons keep the names their words give them.
  for (const status of /** @type {const} */ (['open', 'resolved'])) {
    const before = render.draw([list(SITE_COMMENTS)], { status })
    assert.match(
      before,
      /<span class="tv-cv-filter-long">Current page<.*?<span class="tv-cv-pill">3<\/span>/,
      status
    )
    assert.match(
      before,
      /<span class="tv-cv-filter-long">All pages<.*?<span class="tv-cv-pill">5<\/span>/,
      status
    )
    assert.doesNotMatch(before, /data-dot|unread"|aria-label="(Current|All) page/, status)
  }
  // The page's threads read, another page's not: each pill's dot follows its own scope.
  const home = render.draw([list(SITE_COMMENTS)], {
    reads: ['h1', 'h2', 'h3'].map((id) => [id, NOW]),
    viewer: READER
  })
  assert.match(home, /<span class="tv-cv-filter-long">Current page<.*?<span class="tv-cv-pill">3<\/span>/)
  assert.match(
    home,
    /aria-label="All pages 5, 2 unread">.*?<span class="tv-cv-pill" data-dot="" title="2 unread">5</
  )
  // Every open thread read: the numbers stay, no dot anywhere.
  const read = SITE_COMMENTS.map((x) => [x.id, NOW])
  const none = render.draw([list(SITE_COMMENTS)], { reads: read, viewer: READER })
  assert.match(none, /<span class="tv-cv-pill">3<\/span>/)
  assert.match(none, /<span class="tv-cv-pill">5<\/span>/)
  assert.doesNotMatch(none, /data-dot/)
  // The status filter keeps its totals, plain numbers, no pill.
  assert.match(
    none,
    /data-tracy-status="open"><span class="tv-cv-filter-long">Open<\/span><span class="tv-cv-filter-num">3</
  )
})

test('the unread dot says "N unread" only above 0; unknown (marks not in) is no dot and no words, never "0 unread"', () => {
  assert.equal(render.unreadWords(1), '1 unread')
  assert.equal(render.unreadWords(4), '4 unread')
  for (const none of [0, null, undefined]) assert.equal(render.unreadWords(none), null, String(none))
  assert.equal(
    render.unreadWords(2, (key, params) => `${key}:${params?.count}`),
    'comments.unread.title:2',
    'through the translator'
  )
  assert.equal(render.countName('Comments', 3, '1 unread'), 'Comments 3, 1 unread')
})

test('U17, L1: a page with no open comment keeps its card and says so; the toolbar stays', () => {
  const html = render.draw([list(SITE_COMMENTS, { url: ABOUT })])
  assert.match(html, /data-tracy-none-here="">No open comments on this page\.</)
  assert.match(html, /data-tracy-filter/)
  assert.match(html, /data-tracy-toolbar/)
})

test("U17: switching to All pages shows the other pages' comments", () => {
  const { state } = render.stateOf([list(SITE_COMMENTS, { url: ABOUT })], { reads: [], viewer: READER })
  state.setFilter('all')
  assert.match(
    render.view(state),
    /aria-pressed="true"[^>]*><span class="tv-cv-filter-long">All pages<.*?data-dot="" title="5 unread">5</
  )
})

test('U18: a site with no comment at all: the plain empty state, no filter, no shortcuts', () => {
  const html = render.draw([list([])])
  assert.match(html, />No comments yet</)
  assert.doesNotMatch(html, /data-tracy-filter|data-tracy-toolbar|other pages|resolved comment/)
})

test('U33: a comment resolved while Resolved is hidden folds into "Resolved. Undo" in its place', () => {
  const html = render.draw([list(SITE_COMMENTS)], { resolving: ['h2'] })
  const at = html.indexOf('data-tracy-resolved-undo="h2"')
  assert.ok(at > html.indexOf('data-comment="h1"') && at < html.indexOf('data-comment="h3"'), 'in place')
  assert.doesNotMatch(html, /data-comment="h2"/)
  assert.match(text(html.slice(at)), /^[^<]*Resolved\.\s*Undo/)
})

test('U40: no on-screen string of the new UI carries an em-dash', () => {
  for (const html of [
    render.draw([list(SITE_COMMENTS)], { filter: 'all', status: 'resolved' }),
    render.draw([list(SITE_COMMENTS, { url: ABOUT })]),
    render.draw([list(SITE_COMMENTS)], { resolving: ['h1'] })
  ])
    assert.doesNotMatch(text(html), /—/)
})
