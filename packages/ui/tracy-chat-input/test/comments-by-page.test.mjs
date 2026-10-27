/**
 * The Comments tab, layout B (01/10/2026, mock "New Comments tab", options B and E1):
 *   - the Current page / All pages switch stays; in All pages each page is a group that folds — a
 *     button head with a chevron (`aria-expanded`), the page's NAME with its path small beside it, a
 *     "Current" mark on the page the Browser tab shows, its count, and "Open page" on every other
 *     page; the current page's group comes first and open, the others folded;
 *   - a page is named by its CMS title when a comment's locate answer says it (`page "Pricing"`),
 *     else by the page's document title without the site's name, "/" is Home, else its path;
 *   - the page-level "Add a comment…" box is gone: a fixed bottom row says how to comment, with
 *     "Start commenting" (the Browser tab in Edit mode);
 *   - no open comment in the view: no Delete all, no Ask Tracy to edit all, no bottom row — a centred
 *     block (icon, title, one line, Start commenting) instead of the dashed box.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createCommentLists,
  headActions,
  pageLabel,
  pageGroups,
  rowsOf,
  viewModel
} from '../src/client/comment-view.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-by-page-'))
  const outfile = path.join(outDir, 'lib.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import * as view from './CommentsView'
        import { CSS } from './styles'
        export { CSS }
        export const exported = Object.keys(view)
        export const createCommentsState = view.createCommentsState
        export const draw = (state) => renderToStaticMarkup(createElement(view.makeCommentsView(state), {}))
        export const footer = (state) => renderToStaticMarkup(createElement(view.makeCommentsFooter(state), {}))`,
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

const ORIGIN = 'https://kineticakemi.tracy.site'
const HOME = `${ORIGIN}/`
const PRICING = `${ORIGIN}/pricing/`
const ABOUT = `${ORIGIN}/about-us/`
const AKEMI = { accountId: 'a1', email: 'akemi@example.com', name: 'Akemi', initial: 'A' }
const locateOn = (label) => ({ status: 'resolved', levels: [{ kind: 'record', id: 'r', label }] })
let seq = 0
const comment = (url, over = {}) => ({
  id: `c${++seq}`,
  url,
  text: `note ${seq}`,
  status: 'pending',
  createdAt: Date.now() - seq * 60_000,
  element: { url, selector: `p:nth-of-type(${seq})`, text: `words ${seq}`, tag: 'p' },
  author: AKEMI,
  can: { edit: true, delete: true },
  ...over
})
const tab = (url, comments) => ({
  sessionId: 's1',
  tabId: 'tab1',
  siteKey: 'kineticakemi.tracy.site',
  host: 'kineticakemi.tracy.site',
  active: true,
  url,
  comments
})
const SITE = [
  comment(HOME),
  comment(HOME),
  comment(PRICING),
  comment(PRICING),
  comment(PRICING),
  comment(ABOUT)
]

/** A state whose lists heard `list`, with the filter set and the two Browser verbs recorded. */
function stateWith(list, filter = 'all') {
  const calls = { open: /** @type {string[]} */ ([]), start: 0 }
  const state = lib.createCommentsState({
    storage: null,
    openPage: (url) => calls.open.push(url),
    startCommenting: () => {
      calls.start += 1
    }
  })
  if (list) state.lists.accept(list)
  state.lists.focus('s1')
  state.setFilter(filter)
  return { state, calls }
}

// ── Names ────────────────────────────────────────────────────────────────────────────────

test('a page is named by its CMS title, else its document title without the site name, "/" is Home, else its path', () => {
  assert.deepEqual(pageLabel({ path: '/pricing/', record: 'Pricing plans' }), {
    name: 'Pricing plans',
    home: false
  })
  assert.deepEqual(pageLabel({ path: '/pricing/', title: 'Pricing — Kinetic' }), {
    name: 'Pricing',
    home: false
  })
  assert.deepEqual(pageLabel({ path: '/pricing/', title: 'Pricing | Kinetic' }), {
    name: 'Pricing',
    home: false
  })
  assert.deepEqual(pageLabel({ path: '/pricing/', title: 'Pricing - Kinetic' }), {
    name: 'Pricing',
    home: false
  })
  // Only the last separator is the site's: a title with a dash of its own keeps it.
  assert.deepEqual(pageLabel({ path: '/a/', title: 'Plans - Teams | Kinetic' }), {
    name: 'Plans - Teams',
    home: false
  })
  // Nothing before the separator: the title is kept whole.
  assert.deepEqual(pageLabel({ path: '/a/', title: ' — Kinetic' }), { name: '— Kinetic', home: false })
  assert.deepEqual(pageLabel({ path: '/' }), { name: '', home: true })
  assert.deepEqual(pageLabel({ path: '/about-us/' }), { name: '/about-us/', home: false })
  // The CMS title wins over the document's, and over Home.
  assert.deepEqual(pageLabel({ path: '/', record: 'Front page', title: 'Welcome | Kinetic' }), {
    name: 'Front page',
    home: false
  })
})

test('the CMS title comes from the locate answers of a page’s comments — only when they agree', () => {
  const lists = createCommentLists()
  lists.accept(
    tab(HOME, [
      comment(PRICING, { locate: locateOn('page "Pricing plans"') }),
      comment(PRICING, { locate: locateOn('page "Pricing plans"') }),
      comment(ABOUT, { locate: locateOn('post "Hello"') }),
      comment(ABOUT, { locate: locateOn('post "Other"') }),
      comment(HOME, { locate: locateOn('Menu item "Services"') })
    ])
  )
  const groups = pageGroups(rowsOf(lists.getSnapshot()))
  const byPath = Object.fromEntries(groups.map((g) => [g.path, g.title]))
  assert.equal(byPath['/pricing/'], 'Pricing plans')
  assert.equal(byPath['/about-us/'], '', 'two records disagree: no title')
  assert.equal(byPath['/'], '', 'a menu item is not the page')
})

// ── All pages: groups that fold ──────────────────────────────────────────────────────────────

test('All pages: the current page first and open, the others folded, each card head with chevron, name, path, count', () => {
  const { state } = stateWith(tab(PRICING, SITE))
  const html = lib.draw(state)
  const heads = [
    ...html.matchAll(
      /<button[^>]*class="tv-cv-card-head"[^>]*aria-expanded="(true|false)"[^>]*>([\s\S]*?)<\/button>/g
    )
  ]
  assert.equal(heads.length, 3)
  assert.equal(heads[0][1], 'true')
  assert.match(heads[0][2], /lucide-chevron-right/)
  assert.match(heads[0][2], /\/pricing\//)
  assert.match(heads[0][2], /tv-cv-here/)
  assert.deepEqual(
    heads.slice(1).map((h) => h[1]),
    ['false', 'false']
  )
  assert.match(heads[1][2] + heads[2][2], />Home</)
  // Rows: only the open card's three are drawn.
  assert.equal((html.match(/data-comment="/g) ?? []).length, 3)
  // A plain muted count in each head, no pill.
  const counts = [...html.matchAll(/class="tv-cv-page-count"[^>]*>(\d+)</g)].map((m) => m[1])
  assert.deepEqual(counts, ['3', '2', '1'])
})

test('no "Open page" button and no page icon on a card head (redesign A)', () => {
  const { state } = stateWith(tab(PRICING, SITE))
  const html = lib.draw(state)
  assert.doesNotMatch(html, /data-tracy-open-page|Open page|lucide-file/)
})

test('Current page: one head named for the page, no "Current page" chip, its rows', () => {
  const { state } = stateWith(tab(HOME, SITE), 'page')
  const html = lib.draw(state)
  assert.match(html, /class="tv-cv-page-name"[^>]*>Home</)
  assert.doesNotMatch(html, /<button[^>]*class="tv-cv-card-head"/, 'Current page does not fold')
  assert.doesNotMatch(html, />Current page<\/span><span class="tv-cv-page-count/)
  assert.equal((html.match(/data-comment="/g) ?? []).length, 2)
})

// ── The bottom row, and the empty view ─────────────────────────────────────────────────────

test('the page-level box is gone; the bottom row says how to comment and offers Start commenting', () => {
  assert.ok(!lib.exported.includes('makeCommentsComposer'))
  const { state } = stateWith(tab(HOME, SITE))
  const row = lib.footer(state)
  assert.match(row, /data-tracy-comments-footer/)
  assert.match(row, /Click any block on the page to comment on it\./)
  assert.match(row, /<button[^>]*data-tracy-start-commenting[^>]*>[\s\S]*Start commenting/)
  assert.doesNotMatch(row, /<textarea|Note for team|New comment on/)
})

test('with open comments: Delete all and Ask Tracy to edit all show', () => {
  const vm = viewModel(stateWith(tab(HOME, SITE)).state.lists.getSnapshot(), { filter: 'all' })
  assert.equal(headActions(vm).shown, true)
  const html = lib.draw(stateWith(tab(HOME, SITE)).state)
  assert.match(html, /class="tv-cv-del"/)
  assert.match(html, /tv-cv-send-all/)
})

test('no comment at all: a centred block with Start commenting, no toolbar, no bottom row (E1)', () => {
  const { state } = stateWith(tab(HOME, []))
  const html = lib.draw(state)
  assert.doesNotMatch(html, /tv-cv-del|tv-cv-send-all|data-tracy-toolbar/)
  assert.match(html, /data-tracy-empty=""/)
  assert.match(html, /class="tv-cv-empty-icon"/)
  assert.match(html, /Click any block on the page to leave a note for your team or ask Tracy to change it\./)
  assert.match(html, /<button[^>]*data-tracy-start-commenting[^>]*>[\s\S]*Start commenting/)
  assert.equal(lib.footer(state), '', 'no bottom row while empty')
})

test('nothing open in the view: the page shown stays as a card saying so; no Delete all, no Ask Tracy to edit all; the bottom row stays', () => {
  const resolved = [comment(HOME, { status: 'resolved', resolvedAt: new Date().toISOString() })]
  const { state } = stateWith(tab(HOME, resolved))
  const html = lib.draw(state)
  assert.doesNotMatch(html, /class="tv-cv-del"|tv-cv-send-all/)
  assert.match(html, /data-tracy-status-filter="open"/)
  assert.match(html, /data-tracy-none-here="">No open comments on this page\.</)
  assert.notEqual(lib.footer(state), '')
  state.status.set('resolved')
  assert.match(lib.draw(state), /class="tv-cv-del"/, 'in Resolved the resolved one is there to delete')
})

test('the new pieces are drawn with tokens only — one rule for light and dark', () => {
  const css = lib.CSS
  for (const cls of [
    'tv-cv-card',
    'tv-cv-card-head',
    'tv-cv-here',
    'tv-ci',
    'tv-ci-tag',
    'tv-cv-del',
    'tv-cv-footer',
    'tv-cv-empty',
    'tv-cv-empty-icon'
  ]) {
    const rules = [...css.matchAll(new RegExp(`[^}]*\\.${cls}\\b[^{]*\\{([^}]*)\\}`, 'g'))].map((m) => m[1])
    assert.ok(rules.length > 0, cls)
    for (const body of rules) {
      // A colour is a token (its fallback inside var() aside), never a literal of one theme.
      // A drop shadow is black in both themes, so it is not a colour of one theme.
      const bare = body.replace(/box-shadow:[^;]*;/g, '').replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '')
      assert.doesNotMatch(bare, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i, `${cls}: ${body}`)
    }
  }
})
