/**
 * A Viewer's start screen (ADR 0028): the chat box's hint reads "/help to ask Tracy · Ask about this
 * site" — tracy-assistant's prefix, then ours in place of dsh's own words, which this plugin cannot
 * change (dsh draws them as the placeholder's own text node).
 *
 * Pinned here, in a real browser, with the same seam as `hero-placeholder.test.mjs` (dsh's
 * DraftEditor skeleton, its InputBar.module.css hashed as the build does, this plugin's real
 * COMPOSER_CSS after it, and the assistant's ::before rule):
 *   - on a Viewer's start block dsh's own words take no room, the prefix and ours show at the
 *     draft's size, on one line inside the draft;
 *   - on every other seat's start block nothing changes: dsh's words at full size, no ::after;
 *   - through the session (the docked chat box, and the hero after a / command) a Viewer's page
 *     (<html data-tracy-seat-viewer>) keeps the same hint on one line at the card's draft size;
 *     without the mark the docked box keeps dsh's words.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const DSH_WORDS = 'Describe what you want to build, / commands, @ files or sessions'
const DSH_INPUT_BAR_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
)
/** tracy-assistant's prefix rule (its styles.ts), as the page carries it. */
const ASSISTANT_CSS = '[data-composer-placeholder]::before { content: var(--tv-help-hint); }'

function hashModuleClasses(css) {
  return css.replace(/\.(root|hero|card|scroll|grow|input|placeholder|row)\b(?![\w-])/g, '._$1_x7k2')
}

async function composerCss() {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/client/composer-styles.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
  return mod.COMPOSER_CSS
}

const SESSION_WORDS = 'Message or run a task, / commands, @ files or sessions'

/** The draft and its placeholder, as dsh's DraftEditor renders them. */
const draft = (words) =>
  '<div class="_scroll_x7k2" data-input-scroll><div class="_grow_x7k2">' +
  `<div class="_input_x7k2" contenteditable="true" data-placeholder="${words}"><p><br></p></div>` +
  `<div aria-hidden="true" class="_placeholder_x7k2" data-composer-placeholder>${words}</div>` +
  '</div></div>'

/** The docked chat box once the conversation runs: dsh's root without _hero. */
const docked = (id) =>
  '<div class="_composerDock_q1"><div data-slot="conversation.composer.bar"><div class="_root_x7k2">' +
  `<div class="_card_x7k2" data-composer-card id="${id}" style="width:600px;box-sizing:border-box">` +
  `${draft(SESSION_WORDS)}<div class="_row_x7k2"></div></div></div></div></div>`

/** dsh's hero after a / command: the start block emptied to its wrapper, no Viewer mark on it. */
const sentHero = (id) =>
  '<div class="_composerHero_q1"><div data-tracy-start="site" data-tracy-sent=""></div>' +
  '<div data-slot="conversation.composer.bar"><div class="_root_x7k2 _hero_x7k2">' +
  `<div class="_card_x7k2" data-composer-card id="${id}" style="width:600px;box-sizing:border-box">` +
  `${draft(DSH_WORDS)}<div class="_row_x7k2"></div></div></div></div></div>`

const hero = (id, viewer) =>
  `<div class="_composerHero_q1"><div data-tracy-start="site"${viewer ? ' data-tracy-viewer=""' : ''}></div>` +
  '<div data-slot="conversation.composer.bar"><div class="_root_x7k2 _hero_x7k2">' +
  `<div class="_card_x7k2" data-composer-card id="${id}" style="width:600px;box-sizing:border-box">` +
  '<div class="_scroll_x7k2" data-input-scroll><div class="_grow_x7k2">' +
  `<div class="_input_x7k2" contenteditable="true" data-placeholder="${DSH_WORDS}"><p><br></p></div>` +
  `<div aria-hidden="true" class="_placeholder_x7k2" data-composer-placeholder>${DSH_WORDS}</div>` +
  '</div></div><div class="_row_x7k2"></div></div></div></div></div>'

let browser
let page

before(async () => {
  const sheet =
    hashModuleClasses(readFileSync(DSH_INPUT_BAR_CSS, 'utf8')) + (await composerCss()) + ASSISTANT_CSS
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
  await page.setContent(
    '<!doctype html><html style=\'--tv-help-hint:"/help to ask Tracy · ";--tc-viewer-hint:"Ask about this site"\'>' +
      '<head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}</style>' +
      `<style>${sheet}</style></head><body>${hero('viewer', true)}${hero('editor', false)}` +
      `${docked('session')}${sentHero('sent')}</body></html>`
  )
})

after(async () => {
  await browser?.close()
})

const read = (id) =>
  page.evaluate((cardId) => {
    const card = document.getElementById(cardId)
    const ph = card.querySelector('[data-composer-placeholder]')
    const input = card.querySelector('[class*="_input"]')
    const own = getComputedStyle(ph)
    const before = getComputedStyle(ph, '::before')
    const after = getComputedStyle(ph, '::after')
    const phBox = ph.getBoundingClientRect()
    const inputBox = input.getBoundingClientRect()
    return {
      ownSize: own.fontSize,
      beforeSize: before.fontSize,
      beforeContent: before.content,
      afterSize: after.fontSize,
      afterContent: after.content,
      height: phBox.height,
      inside: phBox.top >= inputBox.top && phBox.bottom <= inputBox.bottom
    }
  }, id)

test('a Viewer: dsh’s words take no room; the prefix and "Ask about this site" show at the draft’s size', async () => {
  const m = await read('viewer')
  assert.equal(m.ownSize, '0px')
  assert.equal(m.beforeContent, '"/help to ask Tracy · "')
  assert.equal(m.beforeSize, '14px')
  assert.equal(m.afterContent, '"Ask about this site"')
  assert.equal(m.afterSize, '14px')
  assert.equal(m.height, 20, 'one 20px line')
  assert.ok(m.inside, 'inside the draft')
})

test('any other seat: the placeholder is dsh’s own, untouched', async () => {
  const m = await read('editor')
  assert.equal(m.ownSize, '14px')
  assert.equal(m.afterContent, 'none')
  assert.equal(m.beforeContent, '"/help to ask Tracy · "')
})

/** Sets or clears the page's Viewer mark, as index.tsx does from the seat's role. */
const seatViewer = (on) =>
  page.evaluate((v) => document.documentElement.toggleAttribute('data-tracy-seat-viewer', v), on)

test('a Viewer through the session: the docked chat box keeps "Ask about this site" after the prefix', async () => {
  await seatViewer(true)
  try {
    const m = await read('session')
    assert.equal(m.ownSize, '0px', 'dsh’s generic words take no room')
    assert.equal(m.beforeContent, '"/help to ask Tracy · "')
    assert.equal(m.afterContent, '"Ask about this site"')
    assert.equal(m.afterSize, '14px', 'the card’s own draft size')
    assert.equal(m.beforeSize, m.afterSize)
    assert.equal(m.height, 20, 'one 20px line')
    assert.ok(m.inside, 'inside the draft')
  } finally {
    await seatViewer(false)
  }
})

test('a Viewer after a / command: the hero keeps the hint though the start block lost its mark', async () => {
  await seatViewer(true)
  try {
    const m = await read('sent')
    assert.equal(m.ownSize, '0px')
    assert.equal(m.afterContent, '"Ask about this site"')
    assert.equal(m.afterSize, '14px')
  } finally {
    await seatViewer(false)
  }
})

test('any other seat through the session: the docked chat box keeps dsh’s own words', async () => {
  const m = await read('session')
  assert.equal(m.ownSize, '14px')
  assert.equal(m.afterContent, 'none')
})
