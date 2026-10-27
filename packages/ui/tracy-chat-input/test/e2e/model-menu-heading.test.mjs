/**
 * A click on the model menu's group heading keeps the menu open (Akemi, 14/10/2026).
 *
 * Measured on the local cluster: in the Model pane, clicking the group heading ("Tracy AI") closed
 * the whole menu and dropped focus to <body>. dsh's ModelSelect keeps focus only for a mousedown on
 * a button; on the heading the focused row blurs to <body> and its blur handler closes the menu.
 * model-menu-focus.ts default-prevents a mousedown on the card's non-interactive parts.
 *
 * Pinned here, in a real browser: dsh's real ModelSelect (read from the fork, bundled with its CSS
 * modules) with this plugin's real MODEL_MENU_CSS and keepModelMenuFocus. A heading click or a click
 * on the card's padding leaves the menu open with focus inside it; Escape then steps back one pane,
 * a second Escape closes and returns focus to the trigger; the keyboard path (ArrowDown, Enter)
 * still drills and selects.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system
 * Chrome, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const modelPkg = path.join(repoRoot, 'vendor/tracy/deepseek-harness/packages/client/ui-model-selection')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const GROUP = 'Tracy AI'

/** The page script: dsh's ModelSelect mounted on a stub directory, with this plugin's menu layer. */
const ENTRY = `
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ModelSelect } from './src/client/ModelSelect.tsx'
import { en } from './src/client/locales.ts'
import { keepModelMenuFocus } from ${JSON.stringify(path.join(pkgRoot, 'src/client/model-menu-focus.ts'))}
import { MODEL_MENU_CSS } from ${JSON.stringify(path.join(pkgRoot, 'src/client/model-menu-styles.ts'))}

const t = (key, params) => {
  const template = en[key] ?? key
  return params === undefined ? template : template.replace(/\\{(\\w+)\\}/g, (m, n) => (n in params ? String(params[n]) : m))
}
const reasoning = { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' }
const directory = createSnapshotStore({
  current: { provider: 'tracy', model: 'tracy-fast' },
  routable: true,
  // An empty catalog (window.__emptyCatalog) is the local cluster's state: "No models available."
  groups: window.__emptyCatalog ? [] : [{ id: 'tracy', name: ${JSON.stringify(GROUP)}, models: [
    { id: 'tracy-fast', name: 'Tracy Fast', reasoning },
    { id: 'tracy-pro', name: 'Tracy Pro', reasoning }
  ] }],
  failures: [], status: 'ready', pending: null, error: null
})
const select = async (selection) => {
  directory.set({ ...directory.getSnapshot(), current: selection })
  return { ok: true, value: undefined }
}
const style = document.createElement('style')
style.textContent = MODEL_MENU_CSS
document.head.appendChild(style)
keepModelMenuFocus()
createRoot(document.getElementById('app')).render(
  createElement(ModelSelect, { locked: false, available: true, directory, load: () => {}, select, t })
)
`

let browser
let page
let bundle

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: modelPkg, sourcefile: 'entry.mjs', loader: 'js' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outdir: 'out',
    write: false,
    jsx: 'automatic',
    // Fonts and images pulled in by dsh's primitives (KaTeX) do not matter to a menu.
    loader: {
      '.module.css': 'local-css',
      '.css': 'css',
      '.ttf': 'empty',
      '.woff': 'empty',
      '.woff2': 'empty',
      '.png': 'empty',
      '.svg': 'empty'
    },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent'
  })
  const file = (ext) => built.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? ''
  bundle = { js: file('.js'), css: file('.css') }
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

/** A fresh page with ModelSelect mounted in the composer's model seat. */
async function mount(emptyCatalog = false) {
  await page?.close()
  page = await browser.newPage()
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}' +
      '#app{position:absolute;left:200px;top:400px}</style>' +
      `<style>${bundle.css}</style></head><body>` +
      // The composer's model seat, where dsh mounts ModelSelect.
      '<div id="app" data-slot="conversation.input.model"></div></body></html>'
  )
  await page.evaluate((empty) => {
    window.__emptyCatalog = empty
  }, emptyCatalog)
  await page.addScriptTag({ content: bundle.js })
  await page.waitForSelector('#app button[aria-haspopup="menu"]')
}

beforeEach(() => mount())

after(async () => {
  await browser?.close()
})

const trigger = '#app button[aria-haspopup="menu"]'
const menu = '[role="menu"], [role="group"][aria-label]'
const heading = '[data-menu-group-heading]'

/** Where focus is: inside the card, on the trigger, or elsewhere (the tag name). */
const focusAt = () =>
  page.evaluate(
    (sel) => {
      const el = document.activeElement
      if (el?.matches('#app button[aria-haspopup="menu"]')) return 'trigger'
      if (el?.closest(sel.card) && el !== document.body) return 'menu'
      return el?.tagName ?? 'none'
    },
    { card: 'body > [id$="-menu"]' }
  )

const menuOpen = () => page.evaluate(() => document.querySelector('body > [id$="-menu"]') !== null)

/** Open the menu with the mouse and drill into the Model pane, as a customer does. */
async function openModelPane() {
  await page.click(trigger)
  await page.getByRole('menuitem', { name: /Model/ }).click()
  await page.waitForSelector(heading)
}

test('clicking the group heading keeps the menu open, focus inside it', async () => {
  await openModelPane()
  assert.equal(await focusAt(), 'menu', 'drilling focuses a row')
  await page.getByText(GROUP, { exact: true }).click()
  assert.equal(await menuOpen(), true, 'heading click closed the menu')
  assert.equal(await focusAt(), 'menu', 'heading click moved focus out of the menu')
  assert.ok(await page.$(heading), 'still on the Model pane')
})

test('clicking the card padding keeps the menu open, focus inside it', async () => {
  await openModelPane()
  const box = await page.$eval('body > [id$="-menu"]', (el) => {
    const r = el.getBoundingClientRect()
    // The top edge's middle: the corners are rounded, and a press outside the radius is outside the card.
    return { x: r.left + r.width / 2, y: r.top + 2 }
  })
  await page.mouse.click(box.x, box.y)
  assert.equal(await menuOpen(), true)
  assert.equal(await focusAt(), 'menu')
})

test('after a heading click, Escape steps back one pane, a second Escape closes onto the trigger', async () => {
  await openModelPane()
  await page.getByText(GROUP, { exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await menuOpen(), true, 'first Escape closed the whole menu')
  assert.equal(await page.$(heading), null, 'first Escape left the Model pane')
  assert.equal(await focusAt(), 'menu')
  await page.keyboard.press('Escape')
  assert.equal(await menuOpen(), false, 'second Escape kept the menu open')
  assert.equal(await focusAt(), 'trigger')
})

test('the keyboard still drills and selects: ArrowDown, Enter, ArrowDown, Enter', async () => {
  await page.focus(trigger)
  await page.keyboard.press('Enter')
  await page.waitForSelector(menu)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector(heading)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('body > [id$="-menu"]') === null)
  assert.match(await page.$eval(trigger, (el) => el.getAttribute('aria-label') ?? ''), /Tracy Pro/)
  assert.equal(await focusAt(), 'trigger')
})

test('with no models, clicking the empty message keeps the menu open, focus on the trigger', async () => {
  await mount(true)
  await page.click(trigger)
  await page.getByRole('menuitem', { name: /Model/ }).click()
  await page.getByText('No models available.').click()
  assert.equal(await menuOpen(), true, 'a click on the empty message closed the menu')
  assert.notEqual(await focusAt(), 'BODY', 'focus dropped to <body>')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  assert.equal(await menuOpen(), false)
  assert.equal(await focusAt(), 'trigger')
})
