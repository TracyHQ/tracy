/**
 * The settings dialog at Tracy's own scale (02/10/2026, option B of the settings review),
 * rendered to markup: an icon on every nav item with the open one marked, the open section's name as
 * the page title, a 26px ghost close, and the Language row as title, description and a compact menu
 * button naming the active language.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
// react-dom is not a dependency of this package; @tracy/core carries it, and pnpm resolves both
// packages' react to the same copy, so the render below has one React.
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-modal-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { SettingsPage } from './index'
        import { LanguageRow, LanguageMenu } from './language-row'
        import { en } from './strings'
        const t = (key, params) =>
          (en[key] ?? key).replace(/\\{(\\w+)\\}/g, (m, name) => (params && name in params ? String(params[name]) : m))
        const locales = [{ id: 'en', label: 'English' }, { id: 'vi', label: 'Tiếng Việt' }]
        const noop = { setLocale: () => {}, clearPreference: () => {} }
        export function row(active, preference) {
          const face = { getSnapshot: () => ({ active, preference, locales }), subscribe: () => () => {}, ...noop }
          return renderToStaticMarkup(createElement(LanguageRow, { t, language: face }))
        }
        export function menu(active, preference) {
          return renderToStaticMarkup(createElement(LanguageMenu, { t, snapshot: { active, preference, locales }, language: noop }))
        }
        export function page(activeId) {
          const rows = [
            { id: 'tracy-account', order: 20, label: 'Account', group: 'user' },
            { id: 'general', order: 0, label: 'General', group: '' }
          ]
          const renderSlot = (name, _owner, options) =>
            createElement('i', { 'data-rendered': name + (options && options.only ? ':' + options.only : '') })
          return renderToStaticMarkup(
            createElement(SettingsPage, { t, renderSlot, rows, activeId, onSelect: () => {}, onClose: () => {} })
          )
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    // The client entry reads the Tailwind sheet from a build-time constant.
    define: { __TAILWIND_CSS__: '""' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

test('every nav item carries an icon, and only the open one is marked current', () => {
  const html = lib.page('general')
  const items = [...html.matchAll(/<button[^>]*class="ts-nav"[^>]*>([\s\S]*?)<\/button>/g)]
  assert.equal(items.length, 2)
  for (const [, inner] of items) assert.match(inner, /<svg[^>]*ts-nav-icon/)
  const current = [
    ...html.matchAll(
      /<button[^>]*class="ts-nav"[^>]*aria-current="page"[^>]*>[\s\S]*?<span class="truncate">([^<]+)/g
    )
  ]
  assert.deepEqual(
    current.map((m) => m[1]),
    ['General']
  )
})

test('the open section names the page, and the section itself is rendered', () => {
  assert.match(lib.page('general'), /<h2 class="ts-page-title">General<\/h2>/)
  assert.match(lib.page('general'), /data-rendered="settings.section:general"/)
  assert.match(lib.page('tracy-account'), /<h2 class="ts-page-title">Account<\/h2>/)
})

test('close is a ghost icon button with a spoken label', () => {
  assert.match(lib.page('general'), /<button type="button" class="ts-close" aria-label="Close settings">/)
})

test('Language row: title, description, and a menu button naming the picked language', () => {
  const html = lib.row('vi', 'vi')
  assert.match(html, /<div class="ts-row-title">Language<\/div>/)
  assert.match(html, /<div class="ts-row-desc">Language of the Tracy interface<\/div>/)
  assert.match(html, /class="ts-select"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/)
  assert.match(html, /class="ts-select"[^>]*>Tiếng Việt<svg/)
})

test('Language row while following the device: the button names the mode and the language', () => {
  const html = lib.row('en', undefined)
  assert.match(html, /class="ts-select"[^>]*>Follow device \(English\)<svg/)
  assert.match(html, /aria-label="Language: Follow device \(English\)"/)
})

/** Each menu row as [label, checked], in order, plus where the hairline sits. */
function menuRows(html) {
  return [
    ...html.matchAll(
      /<button[^>]*role="menuitemradio"[^>]*aria-checked="(true|false)"[^>]*>([\s\S]*?)<\/button>|(<div class="-mx-1 my-1 h-px bg-border"><\/div>)/g
    )
  ].map((m) => (m[3] ? '---' : [m[2].replace(/<svg[\s\S]*?<\/svg>/g, ''), m[1] === 'true']))
}

test('Language menu: Follow device first, above a hairline, checked while nothing is picked', () => {
  assert.deepEqual(menuRows(lib.menu('en', undefined)), [
    ['Follow device', true],
    '---',
    ['English', false],
    ['Tiếng Việt', false]
  ])
})

test('Language menu: an explicit pick checks that language only', () => {
  assert.deepEqual(menuRows(lib.menu('vi', 'vi')), [
    ['Follow device', false],
    '---',
    ['English', false],
    ['Tiếng Việt', true]
  ])
})
