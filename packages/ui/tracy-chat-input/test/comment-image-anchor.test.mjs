/**
 * A comment anchored on an image names it as an image (Akemi 01/10/2026, option a): the Comments tab
 * row reads `Image · "<alt>"`, else `Image · <file name>`. Measured on dev: the wp-ja-kinetic hero's
 * terminal panel is an `<img>` whose alt repeats the heading, so its row read like a heading comment.
 * Any other anchor keeps its label.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { imageAnchor, rowsOf, createCommentLists } from '../src/client/comment-view.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let render

before(async () => {
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-image-anchor-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsView } from './CommentsView'
        export function draw(lists) {
          const state = createCommentsState({
            act: () => {},
            resolveAct: () => {},
            timers: { set: () => 1, clear: () => {} },
            storage: null,
            target: null
          })
          for (const list of lists) state.lists.accept(list)
          return renderToStaticMarkup(createElement(makeCommentsView(state), {}))
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

const SITE = 'https://kineticakemi.tracy.site'
const HOME = `${SITE}/`
const PANEL = `${SITE}/wp-content/themes/wp-ja-kinetic/assets/img/hero-terminal-panel-terminal.webp`
const HEADING_WORDS = 'Ship fast. Sleep through the night.'
/** The kinetic hero's terminal panel as the picker reports it: an `<img>` whose alt repeats the heading. */
const TERMINAL = {
  url: HOME,
  selector: 'img.hx-panelimg.is-terminal',
  label: HEADING_WORDS,
  text: HEADING_WORDS,
  tag: 'img',
  marks: [],
  image: { src: `${PANEL}?ver=1.4`, alt: HEADING_WORDS }
}
const NO_ALT = {
  ...TERMINAL,
  label: '',
  text: '',
  image: { src: `${SITE}/media/hero%20terminal.webp?ver=2#x`, alt: '  ' }
}
const HEADING = {
  url: HOME,
  selector: 'h1',
  label: '',
  text: HEADING_WORDS,
  tag: 'h1',
  marks: [],
  image: null
}
/** A section painted with a background image that has words of its own stays a section. */
const BACKDROP = {
  ...HEADING,
  selector: 'section.hero',
  tag: 'section',
  text: 'Hero words',
  image: { src: PANEL, alt: '' }
}

test('imageAnchor: an image names its alt, quoted; no alt → its file name, decoded, without query; anything else → null', () => {
  assert.equal(imageAnchor(TERMINAL), `"${HEADING_WORDS}"`)
  assert.equal(imageAnchor(NO_ALT), 'hero terminal.webp')
  assert.equal(imageAnchor(HEADING), null)
  assert.equal(imageAnchor(BACKDROP), null)
  assert.equal(imageAnchor(null), null)
  // A wrapper around one image (runtime 8) with no words of its own is the image.
  assert.equal(
    imageAnchor({ ...NO_ALT, tag: 'a', image: { src: PANEL, alt: '' } }),
    'hero-terminal-panel-terminal.webp'
  )
  // A long alt is cut like any other quote.
  const long = 'x'.repeat(60)
  assert.equal(imageAnchor({ ...TERMINAL, image: { src: PANEL, alt: long } }), `"${'x'.repeat(39)}…"`)
})

const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'kineticakemi',
  host: 'kineticakemi.tracy.site',
  active: true,
  url: HOME,
  comments
})
const c = (id, element) => ({
  id,
  url: HOME,
  text: `words of ${id}`,
  status: 'pending',
  createdAt: Date.now() - 60_000,
  element,
  author: { accountId: 'a-akemi', email: 'akemi@example.com', name: 'Akemi', initial: 'A' },
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false
})

test('a row on an image is marked as one; its chip carries the alt or file, other rows are unchanged', () => {
  const lists = createCommentLists()
  lists.accept(list([c('img', TERMINAL), c('bare', NO_ALT), c('h1', HEADING)]))
  const rows = new Map(rowsOf(lists.getSnapshot()).map((r) => [r.id, r]))
  assert.equal(rows.get('img')?.chip, `"${HEADING_WORDS}"`)
  assert.equal(rows.get('img')?.onImage, true)
  assert.equal(rows.get('bare')?.chip, 'hero terminal.webp')
  assert.equal(rows.get('h1')?.chip, `"${HEADING_WORDS}"`)
  assert.equal(rows.get('h1')?.onImage, undefined)
})

/** @param {string} html @param {string} id */
const rowHtml = (html, id) => {
  const at = html.indexOf(`data-comment="${id}"`)
  assert.ok(at >= 0, `row ${id} drawn`)
  const next = html.indexOf('data-comment="', at + 1)
  return html.slice(html.lastIndexOf('<div', at), next < 0 ? undefined : html.lastIndexOf('<div', next))
}
const text = (/** @type {string} */ html) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')

test('the Comments list draws an image anchor as a picture chip named by its file (redesign A); a heading gets none', () => {
  const html = render.draw([list([c('img', TERMINAL), c('bare', NO_ALT), c('h1', HEADING)])])
  // The block chip is gone from the list (its pin says where it is); a picture is a chat-style chip.
  assert.match(rowHtml(html, 'img'), /data-tracy-picture="[^"]*panel[^"]*"/)
  assert.match(text(rowHtml(html, 'img')), /\.webp|\.png|\.jpg/)
  assert.match(text(rowHtml(html, 'bare')), /hero terminal\.webp/, 'the file name, decoded, no query or hash')
  assert.doesNotMatch(rowHtml(html, 'h1'), /data-tracy-picture/)
  assert.doesNotMatch(text(html), /Image ·/)
})
