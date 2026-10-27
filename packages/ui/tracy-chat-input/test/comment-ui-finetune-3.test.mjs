/**
 * UI fine-tune of the Comments tab, round 3 layout (e2e UI fine-tune 2, 30/09 evening: a 320 px phone
 * screen gives a ~200 px head row; namesakes lost their page on the meta line), rendered to markup and
 * CSS shape. The pixel proof (200/240/297/317 px, en + vi) is measured in a browser:
 * `tasks/evidence/comment-people/ui-finetune-3/`.
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
/** Someone who wrote none of the fixtures' comments, so every open thread is unread to them. */
const READER = 'reader@example.test'
let render

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-finetune3-'))
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

/** @param {string} html @returns {string} the toolbar's markup. */
const headOf = (html) => {
  const at = html.indexOf('<div class="tv-cv-bar"')
  return html.slice(at, html.indexOf('data-tracy-comment-list', at))
}
/** @param {string} selector @returns {string} the CSS rule's body for that exact selector. */
const rule = (selector) => {
  const at = CSS.indexOf(`\n${selector} {`)
  assert.ok(at >= 0, `no rule ${selector}`)
  return CSS.slice(at, CSS.indexOf('}', at))
}

test('narrow toolbar (e2e UI fine-tune 2, 320 px phone, redesign A): no OPEN label to clip; Delete all keeps its trash icon only below a measured width', () => {
  const head = headOf(render.view(render.stateOf([list(FIVE)]).state))
  assert.doesNotMatch(head, /tv-cv-label-text/)
  assert.match(rule('.tv-cv-bar'), /container: tv-cv-head \/ inline-size;/)
  assert.match(
    CSS,
    /@container tv-cv-head \(max-width: \d+px\) \{[^@]*\.tv-cv-del:not\(\[data-tracy-undo\]\) \.tv-cv-swap \{ display: none; \}/
  )
})

test('narrow toolbar: below a measured width Ask Tracy to edit all reads "Ask Tracy"; the sentence stays in the tooltip', () => {
  const head = headOf(render.view(render.stateOf([list(FIVE)]).state))
  assert.match(
    head,
    /<span class="tv-cv-send-long">Ask Tracy to edit all<\/span><span class="tv-cv-send-short">Ask Tracy<\/span><\/button>/
  )
  assert.match(rule('.tv-cv-send-short'), /display: none;/)
  assert.match(
    CSS,
    /@container tv-cv-head \(max-width: \d+px\) \{\s*\.tv-cv-send-long \{ display: none; \}\s*\.tv-cv-send-short \{ display: inline; \}/
  )
})

test('narrow filter: "Current page | All pages" becomes "Page | All" before a counter could be cut; each counter is a round pill of its own (redesign A)', () => {
  const html = render.view(render.stateOf([list(FIVE)], { reads: [], viewer: READER }).state)
  assert.match(
    html,
    /aria-pressed="true" aria-label="Current page 5, 5 unread"><span class="tv-cv-filter-long">Current page<\/span><span class="tv-cv-filter-short">Page<\/span><span class="tv-cv-pill" data-dot="" title="5 unread">5<\/span><\/button>/
  )
  assert.match(
    html,
    /aria-pressed="false" aria-label="All pages 5, 5 unread"><span class="tv-cv-filter-long">All pages<\/span><span class="tv-cv-filter-short">All<\/span><span class="tv-cv-pill" data-dot="" title="5 unread">5<\/span><\/button>/
  )
  assert.match(rule('.tv-cv-filter'), /container: tv-cv-filter \/ inline-size;/)
  assert.match(
    CSS,
    /@container tv-cv-filter \(max-width: \d+px\) \{\s*\.tv-cv-filter-long \{ display: none; \}\s*\.tv-cv-filter-short \{ display: inline; \}/
  )
  // 04/10/2026: the pills count open threads (a dot says some are unread), and none is drawn at 0 (a
  // "0" reads as a signal).
  const none = render.view(
    render.stateOf([list([c('r1', 1, { status: 'resolved', resolvedAt: NOW })])], {
      reads: [],
      viewer: READER
    }).state
  )
  assert.doesNotMatch(none, /tv-cv-pill/)
})

test('namesake name line (e2e UI fine-tune 2): the display name gives way, its (e-mail part) the last to give; the page is on the group header, not the row (redesign A)', () => {
  const html = render.view(render.stateOf([list([c('m1', 1)])]).state)
  assert.doesNotMatch(html, /tv-cv-page"/, 'no page on the row')
  assert.match(
    html,
    /<span class="tv-cv-page-name" title="Home">Home<\/span>/,
    'the group header names the page'
  )
  assert.match(rule('.tv-cv-name-main'), /flex: 0 1000 auto;/)
  assert.match(rule('.tv-cv-name-tag'), /text-overflow: ellipsis;/)
})

test('e2e v7 INTH-2, redesign A: a row names its author by the e-mail part (namesakes told apart), the whole address in its tooltip; every open row has the same two icon actions, named for the screen reader', () => {
  const A = { accountId: 'a', email: 'e2e3-thread-a@example.test', name: 'Sam Tester', initial: 'S' }
  const B = { accountId: 'b', email: 'e2e3-thread-b@example.test', name: 'Sam Tester', initial: 'S' }
  const html = render.view(
    render.stateOf([list([c('m1', 1, { author: A }), c('m2', 2, { author: B }), c('m3', 3)])]).state
  )
  assert.match(html, /<span class="tv-ci-handle" title="e2e3-thread-a@example\.test">e2e3-thread-a<\/span>/)
  assert.match(html, /<span class="tv-ci-handle" title="e2e3-thread-b@example\.test">e2e3-thread-b<\/span>/)
  assert.equal(html.match(/aria-label="Resolve" data-tracy-resolve=""/g)?.length, 3)
  assert.equal(html.match(/aria-label="More actions"/g)?.length, 3)
  assert.match(rule('.tv-ci-handle'), /text-overflow: ellipsis; white-space: nowrap;/)
})

test('redesign A: with nothing open the page shown keeps its card saying so, the status filter is where Resolved is, and the bottom row stays', () => {
  const RESOLVED_ONLY = [
    c('r1', 1, { status: 'resolved', resolvedAt: NOW }),
    c('e2', 2, { url: `${PAGE}news` })
  ]
  const t = render.stateOf([list([RESOLVED_ONLY[0]])])
  const html = render.view(t.state)
  assert.doesNotMatch(html, /data-tracy-empty=""|data-tracy-resolved-toggle|data-tracy-other-pages/)
  assert.match(html, /data-tracy-none-here="">No open comments on this page\.</)
  t.state.status.set('resolved')
  assert.match(render.view(t.state), /data-comment="r1"/)
})
