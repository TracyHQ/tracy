/**
 * Stage 6 files in the Comments tab's real components, rendered to markup
 * (`tasks/evidence/comment-people/attachments-contract.md` §D): a row with stored files shows its
 * pictures as thumbnails and counts the others beside a paperclip. (The page box that picked files is
 * gone since layout B, Akemi 01/10/2026.)
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
  // The keys a button shows follow the system; Node reports the host's, so the test names one.
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-att-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView } from './CommentsView'
        import { CSS } from './styles'
        export { CSS }
        export function draw(lists) {
          const state = createCommentsState()
          for (const list of lists) state.lists.accept(list)
          return { view: renderToStaticMarkup(createElement(makeCommentsView(state), {})) }
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

const HOME = 'https://northgate-ind.ru/'
const list = (extra = {}, comments = []) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'acbj2709',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const ON = { attachments: { enabled: true, maxBytes: 20 * 1024 * 1024, maxFiles: 20 } }

test('a row with stored files: pictures as chips that open full screen (redesign A, from the address the list gives), any other file counted beside a paperclip; a row without shows none', () => {
  const at = Date.now()
  const { view } = render.draw([
    list(ON, [
      {
        id: 'c1',
        url: HOME,
        text: 'Two photos for the hero.',
        createdAt: at,
        element: null,
        attachments: [
          { id: 'f1', name: 'a.png', size: 1, type: 'image/png', url: '/x/f1' },
          { id: 'f2', name: 'b.png', size: 1, type: 'image/png', url: '/x/f2' },
          { id: 'f3', name: 'brief.pdf', size: 1, type: 'application/pdf', url: '/x/f3' },
          { id: 'f4', name: 'notes.txt', size: 1, type: 'text/plain', url: '/x/f4' },
          // Not a source a page should load: counted, never drawn.
          { id: 'f5', name: 'evil.png', size: 1, type: 'image/png', url: 'javascript:alert(1)' }
        ]
      },
      { id: 'c2', url: HOME, text: 'Words only.', createdAt: at - 1000, element: null }
    ])
  ])
  const row = (id) => {
    const s = view.indexOf(`data-comment="${id}"`)
    const n = view.indexOf('data-comment="', s + 1)
    return view.slice(s, n === -1 ? undefined : n)
  }
  // Redesign A: a picture is the chat-style chip that opens it full screen.
  assert.match(
    row('c1'),
    /data-tracy-picture="\/x\/f1"><img class="tv-ci-att-img" src="\/x\/f1" alt="" loading="lazy"\/><span class="tv-ci-att-name">a\.png</
  )
  assert.match(row('c1'), /<img class="tv-ci-att-img" src="\/x\/f2"/)
  assert.doesNotMatch(row('c1'), /javascript:/)
  assert.match(row('c1'), /data-tracy-files="3">.*lucide-paperclip.*3 files</s)
  assert.doesNotMatch(row('c2'), /data-tracy-files/)
})

// ── Round 5 (acceptance e2e v3, 30/09) in the real components ──

test('round 5: a tombstone root reads "Comment deleted" with its replies; a long comment is folded to two lines (redesign A)', () => {
  const { view } = render.draw([
    list({}, [
      {
        id: 't',
        url: HOME,
        text: '',
        removed: true,
        replyCount: 2,
        createdAt: 1,
        element: null,
        author: { name: 'Mai' }
      },
      {
        id: 'r1',
        url: HOME,
        text: 'reply',
        replyTo: 't',
        createdAt: 2,
        element: null,
        author: { name: 'Lee' }
      },
      {
        id: 'long',
        url: HOME,
        text: 'word '.repeat(900),
        createdAt: 3,
        element: null,
        author: { name: 'Lee' }
      }
    ])
  ])
  assert.match(view, /class="tv-ci-text tv-ci-text-deleted">Comment deleted</)
  assert.match(view, /2 replies/)
  assert.match(view, /<span class="tv-ci-text">word word/)
  assert.match(render.CSS, /\.tv-ci-text \{[^}]*-webkit-line-clamp: 2/)
})

test('round 5: the Send all list takes the column’s height and scrolls its rows', () => {
  assert.match(render.CSS, /\.tv-cv\s*\{[^}]*flex:\s*1 0 auto/)
  assert.match(render.CSS, /\.tv-cv-checklist-rows\s*\{[^}]*overflow-y:\s*auto/)
})
