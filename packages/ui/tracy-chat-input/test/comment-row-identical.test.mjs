/**
 * The durable row of a comment turn is the SAME drawing as the echo it replaces (28/09).
 *
 * Until 28/09 two things drew a comment turn: the echo between Send and the durable message went
 * through dsh's fenced-block fold (chip inside the bubble, under the sentence, 64px), and the
 * durable row through this plugin's `conversation.chat.node` wrapper (chip ABOVE the bubble, 70px).
 * The chip moved when the durable message arrived. Now the fold is the only drawing, and two
 * things are pinned here:
 *
 *   1. `apply` registers no `conversation.chat.node` entry — only the fold. A wrapper brought back
 *      "to style the durable row" would reopen the jump, and nothing else would go red.
 *   2. The durable message and the echo, projected by dsh's REAL `projectUserText` (the fork's
 *      source, `vendor/tracy/deepseek-harness`) with Tracy's REAL fold registered, give identical
 *      HTML for the sentence + chip: pointer icon, plain words, the element's address as tooltip,
 *      no raw block, no hint line.
 *
 * What this does not mount: ui-chat's bubble around the projected text (`UserStyleBubble`,
 * module-private in `MessageItem.tsx`). That the echo and the durable row wrap the projection in
 * the same bubble is held by the fork's own ChatView test ("draws a registered fenced-block fold
 * identically in the echo and the durable row", `packages/client/ui-chat/tests/
 * chat-view.client.spec.tsx`, `outerHTML` equal), which needs the fork's vitest + jsdom harness.
 * This file holds the half only Tracy can hold: Tracy's grammar through that projector.
 *
 * The render bundles with esbuild (this plugin's devDependency) and renders with
 * `react-dom/server`, resolved from `@tracy/core`, which declares it. ONE React for the whole
 * bundle, as on the page (dsh's host shares one): the fork's packages carry their own React
 * devDependency, and an element built by one copy is not a valid child for another.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildCommentTurn, chipLabel, COMMENT_FENCE, parseCommentTurn } from '../src/client/comment-turn.mjs'
import { NEUTRAL_FACE_COLOUR } from '../src/client/comment-view.mjs'
import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.join(repoRoot, 'packages', 'core', 'tracy-core')
const userText = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/user-text.tsx'
)
const require = createRequire(import.meta.url)

/** React from this plugin, react-dom from `@tracy/core`: one copy of each for every importer. */
const oneReact = {
  name: 'one-react',
  setup(build) {
    const fromPlugin = createRequire(path.join(pkgRoot, 'package.json'))
    const fromCore = createRequire(path.join(corePkg, 'package.json'))
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
      path: (args.path.startsWith('react-dom') ? fromCore : fromPlugin).resolve(args.path)
    }))
  }
}

let outDir
/** @type {{ apply: Function, project: (text: string, folds: unknown[]) => string, Icon: unknown }} */
let bundle

before(async () => {
  const esbuild = require('esbuild')
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-row-'))
  const outfile = path.join(outDir, 'bundle.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { projectUserText } from ${JSON.stringify(userText)}
        export { apply } from './index'
        export function project(text, folds) {
          return renderToStaticMarkup(createElement('div', null, projectUserText(text, [], [], 'skill', undefined, folds)))
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    // CommonJS: react-dom/server requires Node built-ins, which an ESM bundle cannot `require`.
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    // CSS modules keep their class names, so the markup carries the classes the page would.
    loader: { '.css': 'local-css' },
    plugins: [oneReact],
    outfile,
    logLevel: 'silent'
  })
  bundle = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Run `apply` with a context that records what it registers. `effect` bodies are not run: they
 * touch the page (style tag, shell trim, window listeners), and what matters here is the slots
 * and folds `apply` asks for.
 */
function applied() {
  const slots = []
  const folds = []
  const saved = globalThis.document
  globalThis.document = {
    querySelector: () => null,
    baseURI: 'https://cowork.tracy.site/capiv2j.tracy.site/'
  }
  try {
    bundle.apply({
      effect: () => {},
      betterSidebar: { getTab: () => undefined, openTab: () => {}, subscribe: () => () => {} },
      sessions: { binding: () => undefined },
      conversation: { sendSession: async () => ({ kind: 'sent' }) },
      uiConversation: {
        userTextFolds: {
          register(fold) {
            folds.push(fold)
            return () => {}
          }
        }
      },
      slots: {
        inject: (name, register) => {
          slots.push(name)
          register()
        },
        register: () => () => {}
      },
      // The English catalogue, as dsh's locale hands it on an English page.
      locale: {
        register: () => () => {},
        bind: () => (key, params) =>
          String(en[key] ?? key).replace(/\{(\w+)\}/g, (w, k) => String(params?.[k] ?? w))
      }
    })
  } finally {
    globalThis.document = saved
  }
  return { slots, folds }
}

const TURN = buildCommentTurn({
  text: 'Make only this menu item orange.',
  element: {
    url: 'https://capiv2j.tracy.site/services',
    selector: 'nav > ul > li:nth-child(2) > a',
    label: 'Services',
    text: 'Services'
  },
  locate: {
    status: 'resolved',
    levels: [{ kind: 'record', id: 'joomla:menu:104', label: 'Services', writable: true }]
  }
})

test('apply draws a comment turn only through the fold: no conversation.chat.node entry', () => {
  const { slots, folds } = applied()
  assert.equal(slots.includes('conversation.chat.node'), false, `slots: ${slots.join(', ')}`)
  // Two folds in the one registry: an element's block, and a comment about a whole page (plan
  // "comment review", H4).
  assert.deepEqual(
    folds.map((f) => f.fence),
    [COMMENT_FENCE, 'tracy-page']
  )
})

test('the durable message and its echo project to identical HTML: sentence, then the chip', () => {
  const { folds } = applied()
  // The durable row reads the message's content parts joined (ui-chat `contentParts`); the echo
  // reads the text that was sent. Same bytes on the wire, so the same text reaches the projector.
  const durable = [{ type: 'text', text: TURN }]
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
  const echo = TURN
  const durableHtml = bundle.project(durable, folds)
  const echoHtml = bundle.project(echo, folds)
  assert.equal(durableHtml, echoHtml)

  const parsed = parseCommentTurn(TURN)
  assert.ok(parsed)
  const label = chipLabel(parsed.element)
  assert.equal(label, 'Services')
  // One chip, marked with the fence, the element's address as tooltip, the pointer icon inside.
  const chips = durableHtml.match(/<span[^>]*data-fold="tracy-element"[^>]*>/g) ?? []
  assert.equal(chips.length, 1, durableHtml)
  assert.match(chips[0], /title="https:\/\/capiv2j\.tracy\.site\/services"/)
  assert.match(durableHtml, /<span[^>]*aria-hidden="true"[^>]*><svg[^>]*class="[^"]*tv-comment-chip-icon/)
  assert.match(durableHtml, />Services</)
  // The sentence comes first, the chip after it; nothing of the block or the hint shows.
  assert.ok(durableHtml.indexOf('Make only this menu item orange.') < durableHtml.indexOf('data-fold='))
  assert.doesNotMatch(durableHtml, /```|mentioned-element|tracy_site/)
})

test('without the fold (a dsh older than tracy.6) the turn stays raw text, nothing hides it', () => {
  const html = bundle.project(TURN, [])
  assert.doesNotMatch(html, /data-fold=/)
  assert.match(html, /tracy-element/)
})

test('stage 6: one chip per item with its AUTHOR’s bubble and no number, under the lines; durable = echo', () => {
  const { folds } = applied()
  const lee = { name: 'Lee', email: 'lee@example.com' }
  const pin = (n, text, element, author) => ({ n, text, element, locate: null, author })
  const turn = buildCommentTurn({
    items: [
      pin(
        141,
        "Change to 'Building the groundwork'",
        {
          url: 'https://capiv2j.tracy.site/',
          selector: 'main h1',
          label: 'Hero',
          text: 'Industrial construction, from design to handover'
        },
        lee
      ),
      pin(
        142,
        'A construction site with modern machines',
        {
          url: 'https://capiv2j.tracy.site/',
          selector: 'main img',
          label: '01K5Z8W3J9Q2M4N6P8R0T2V4X6.webp',
          text: ''
        },
        { name: 'Mai' }
      )
    ],
    numbered: true
  })
  const html = bundle.project(turn, folds)
  assert.equal(bundle.project([{ type: 'text', text: turn }].map((p) => p.text).join(''), folds), html)
  assert.equal((html.match(/data-fold="tracy-element"/g) ?? []).length, 2, html)
  assert.deepEqual(
    [...html.matchAll(/class="tv-comment-chip-author" style="background:([^"]+)">(\w)</g)].map((m) => [
      m[1],
      m[2]
    ]),
    // A turn that names people but carries no colour, and no list naming them: the neutral grey.
    [
      [NEUTRAL_FACE_COLOUR, 'L'],
      [NEUTRAL_FACE_COLOUR, 'M']
    ]
  )
  assert.doesNotMatch(html, /tv-comment-chip-n|>141<|>142</)
  assert.doesNotMatch(html, /01K5Z8W3J9Q2M4N6P8R0T2V4X6/)
  // The lines first; the chips under them; no block, no hint.
  const firstChip = html.indexOf('data-fold=')
  assert.ok(html.indexOf('141. Change to') < firstChip)
  assert.ok(html.indexOf('142. A construction site') < firstChip)
  assert.doesNotMatch(html, /```|mentioned-element|tracy_site/)
})

test('a many-comment turn sent before stage 6 keeps its chips, now without their number badge', () => {
  const { folds } = applied()
  const pin = (n, text, selector) => ({
    n,
    text,
    element: { url: 'https://capiv2j.tracy.site/', selector, label: 'Hero', text: `Words of ${n}` },
    locate: null
  })
  const html = bundle.project(buildCommentTurn({ items: [pin(1, 'One', 'h1'), pin(2, 'Two', 'h2')] }), folds)
  assert.equal((html.match(/data-fold="tracy-element"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /tv-comment-chip-n|tv-comment-chip-author/)
  assert.equal((html.match(/tv-comment-chip-icon/g) ?? []).length, 2)
})

test('F6 + Brian bug 4 (30/09): a send from a thread card draws the chip, then "Thread" with EVERY people line, the newest reply included; durable = echo', () => {
  const { folds } = applied()
  const NOW = Date.UTC(2026, 8, 29, 21, 0, 0)
  const element = {
    url: 'https://capiv2j.tracy.site/',
    selector: '.stats p',
    label: '',
    text: '13 subsidiaries'
  }
  const thread = [
    { author: { name: 'Mai' }, at: NOW - 20 * 60_000, text: 'We have 14 subsidiaries now.' },
    { author: { name: 'Lee' }, at: NOW - 6 * 60_000, text: 'The About page says 13 as well.' },
    { author: { name: 'Mai' }, at: NOW - 4 * 60_000, text: 'Good catch, both then.' }
  ]
  const turn = buildCommentTurn({
    items: [
      {
        n: 143,
        text: 'Update it on both pages, please.',
        element,
        locate: null,
        author: { name: 'Lee' },
        thread
      }
    ],
    numbered: true,
    now: NOW
  })
  const html = bundle.project(turn, folds)
  assert.equal(bundle.project(turn, folds), html)
  const chip = html.slice(html.indexOf('data-fold="tracy-element"'))
  assert.match(
    chip,
    /tv-comment-chip-face.*tv-comment-chip-author[^>]*>L<.*tv-comment-chip-words">&quot;13 subsidiaries&quot;</s
  )
  assert.match(chip, /tv-comment-thread-title">Thread<\/span>/)
  const lines = [...chip.matchAll(/tv-comment-thread-who">([^<]+)<\/span> ([^<]+)</g)].map(
    (m) => `${m[1]} ${m[2]}`
  )
  assert.deepEqual(lines, [
    'Mai: We have 14 subsidiaries now.',
    'Lee: The About page says 13 as well.',
    'Mai: Good catch, both then.'
  ])
  assert.doesNotMatch(chip, /tv-comment-thread-more/, 'a short thread has nothing to fold')
  // The sender's words are the bubble's own line, not a thread line; no raw block, no hint.
  assert.ok(html.indexOf('143. Update it on both pages') < html.indexOf('data-fold='))
  assert.doesNotMatch(chip, /Update it on both pages/)
  assert.doesNotMatch(html, /```|mentioned-element|tracy_site|thread: /)
})

test('Brian bug 4: a very long thread keeps its NEWEST lines in view, "Show all N" above them', () => {
  const { folds } = applied()
  const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
  const element = { url: 'https://capiv2j.tracy.site/', selector: 'h1', label: '', text: 'Heading' }
  const thread = Array.from({ length: 15 }, (_, i) => ({
    author: { name: i % 2 === 0 ? 'Mai' : 'Lee' },
    at: NOW - (30 - i) * 60_000,
    text: `line ${i + 1}`
  }))
  const turn = buildCommentTurn({
    items: [{ n: 7, text: 'Sum it up, please.', element, locate: null, author: { name: 'Lee' }, thread }],
    numbered: true,
    now: NOW
  })
  const chip = bundle.project(turn, folds)
  const lines = [...chip.matchAll(/tv-comment-thread-who">([^<]+)<\/span> ([^<]+)</g)].map((m) => m[2])
  assert.equal(lines.length, 12)
  assert.equal(lines.at(-1), 'line 15', 'the newest reply is never hidden')
  assert.equal(lines[0], 'line 4')
  const more = chip.indexOf('tv-comment-thread-more')
  assert.ok(more !== -1 && more < chip.indexOf('line 4'), '"Show all" sits above the lines it unfolds')
  assert.match(chip, />Show all 15<\/button>/)
})

test('a turn that carries its author’s colour paints the chip in it, not the name’s colour', () => {
  const { folds } = applied()
  const element = {
    url: 'https://capiv2j.tracy.site/',
    selector: 'main h1',
    label: 'Hero',
    text: 'Industrial construction, from design to handover'
  }
  // A colour of the palette: with no list naming Lee, the chip can only have it from the turn.
  const colour = '#7c3aed'
  const turn = buildCommentTurn({
    items: [
      {
        n: 9,
        text: 'Shorter, please.',
        element,
        locate: null,
        author: { accountId: 'acc-lee', name: 'Lee', email: 'lee@example.com', initial: 'L', color: colour }
      }
    ],
    numbered: true
  })
  const html = bundle.project(turn, folds)
  assert.match(html, new RegExp(`tv-comment-chip-author" style="background:${colour}">L<`))
})
