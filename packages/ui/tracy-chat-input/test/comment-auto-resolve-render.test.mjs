/**
 * ADR 0025 drawn: "Ask Tracy to edit all" with a comment already sent and waiting (unticked, "Sent
 * 23:43"), a resolved row Tracy resolved ("Tracy marked this done"), and the report under a comment
 * turn ("Done: 2 comments (reply to a comment if you want more changes)" · "Couldn't confirm: 1
 * comment", each line a button that opens its comment).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let render

before(async () => {
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-auto-resolve-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView } from './CommentsView'
        import { CommentReport } from './CommentReportCard'
        export function draw(lists, unticked, view = {}, sent) {
          const state = createCommentsState({ storage: null })
          for (const list of lists) state.lists.accept(list)
          if (unticked) state.checklist.set(new Set(unticked))
          if (sent) state.sent.set(new Map(sent))
          if (view.filter) state.setFilter(view.filter)
          if (view.status) state.status.set(view.status)
          return renderToStaticMarkup(createElement(makeCommentsView(state), {}))
        }
        export async function open(lists, fetch) {
          const state = createCommentsState({ storage: null, server: { siteKey: 'acbj2709', fetch } })
          for (const list of lists) state.lists.accept(list)
          state.lists.focus('s1')
          const { viewModel } = await import('./comment-view.mjs')
          const vmx = viewModel(state.lists.getSnapshot(), { filter: 'all' })
          await state.openChecklist(vmx)
          return { unticked: [...state.checklist.get()], sent: [...state.sent.get()] }
        }
        export function report(value, canReveal) {
          return renderToStaticMarkup(
            createElement(CommentReport, { report: value, reveal: (id) => (canReveal.includes(id) ? () => {} : null) })
          )
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
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const TRACY = { accountId: '', email: '', name: 'Tracy', initial: 'T', tracy: true }
const STAT = { url: HOME, selector: '.stats p', text: '13 subsidiaries', tag: 'p' }
const c = (id, extra) => ({
  id,
  url: HOME,
  status: 'pending',
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false,
  author: LEE,
  element: STAT,
  ...extra
})
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'acbj2709',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments
})
const SENT_AT = new Date(2026, 9, 4, 23, 43).getTime()

test('the checklist: a comment sent and waiting is unticked and says when it went; the others are ticked', () => {
  const view = render.draw(
    [
      list([
        c('fresh', { createdAt: NOW - 2 * MIN, text: 'Never sent' }),
        c('waiting', { createdAt: NOW - 30 * MIN, text: 'Sent already', sentToTracy: true })
      ])
    ],
    ['waiting'],
    {},
    [['waiting', SENT_AT]]
  )
  const box = view.slice(view.indexOf('class="tv-cv-checklist"'))
  const rows = box.split('class="tv-cv-checklist-row"').slice(1)
  const waiting = rows.find((r) => r.includes('Sent already'))
  const fresh = rows.find((r) => r.includes('Never sent'))
  assert.ok(waiting && fresh)
  assert.doesNotMatch(waiting, /checked=""/)
  assert.match(waiting, /data-sent-at="[^"]+"[^>]*>Sent 23:43</)
  assert.match(fresh, /checked=""/)
  assert.doesNotMatch(fresh, /data-sent-at/)
  assert.match(box, /1 of 2 comments/)
})

test('a resolved row Tracy resolved reads "Tracy marked this done"', () => {
  const view = render.draw(
    [
      list([
        c('done', {
          createdAt: NOW - 30 * MIN,
          text: 'Footer says Lantern',
          status: 'resolved',
          resolvedAt: NOW - MIN,
          resolvedBy: TRACY,
          sentToTracy: true
        })
      ])
    ],
    null,
    { status: 'resolved' }
  )
  assert.match(view, /data-tag="tracy">Tracy marked this done</)
})

test('the report: the two groups with their counts and the hint, each comment a button when it can be shown', () => {
  const html = render.report(
    {
      done: [
        { id: 'a', text: 'Footer says Lantern' },
        { id: 'b', text: '' }
      ],
      unconfirmed: [{ id: 'c', text: 'Make the header blue' }]
    },
    ['a', 'c']
  )
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
  assert.match(text, /Done: 2 comments \(reply to a comment if you want more changes\)/)
  assert.match(text, /Couldn't confirm: 1 comment/)
  assert.match(html, /data-tracy-comment-report=""/)
  assert.match(html, /<button type="button"[^>]*data-report-comment="a"[^>]*title="Show this comment"/)
  assert.match(html, /<button type="button"[^>]*data-report-comment="c"/)
  // `b` was deleted since (no words) and no Browser tab lists it: a plain line, "Comment deleted".
  assert.doesNotMatch(html, /<button[^>]*data-report-comment="b"/)
  assert.match(html, /data-report-comment="b"[^>]*>Comment deleted</)
})

test('the report with only one group draws only that group', () => {
  const html = render.report({ done: [], unconfirmed: [{ id: 'c', text: 'x' }] }, [])
  assert.doesNotMatch(html, /Done:/)
  assert.match(html, /Couldn&#x27;t confirm: 1 comment/)
})

test('"Ask Tracy to edit all" asks the server which comments wait, and opens with those unticked', async () => {
  const comments = [
    list([
      c('fresh', { createdAt: NOW, text: 'a' }),
      c('waiting', { createdAt: NOW - MIN, text: 'b', sentToTracy: true })
    ])
  ]
  const asked = []
  const answered = await render.open(comments, async (url) => {
    asked.push(url)
    return new Response(JSON.stringify({ sent: [{ id: 'waiting', at: new Date(SENT_AT).toISOString() }] }))
  })
  assert.deepEqual(asked, ['/api/sites/acbj2709/comments/sent'])
  assert.deepEqual(answered, { unticked: ['waiting'], sent: [['waiting', SENT_AT]] })
  // The server does not answer: everything ticked, as before.
  const failed = await render.open(comments, async () => {
    throw new Error('offline')
  })
  assert.deepEqual(failed, { unticked: [], sent: [] })
})
