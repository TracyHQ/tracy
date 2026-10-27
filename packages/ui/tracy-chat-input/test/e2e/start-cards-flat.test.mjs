/**
 * The start screen's pill cards are flat in both themes (Akemi, 01/10/2026).
 *
 * Measured on cowork.tracy.site: on a site's start screen ("Your site, ready to edit")
 * the four cards (Edit, Comments, Site changes, Team) carried a drop shadow in the light theme,
 * while the dark one read flat. DESIGN.md allows no glow or shadow, and the two themes disagreed.
 *
 * Pinned here, in a real browser: a start card mounted with this plugin's real CSS has a computed
 * box-shadow of none in the light theme and under dsh's [data-ds-dark-theme], at rest and on hover,
 * while its border and fill stay drawn.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system
 * Chrome, and a missing dependency or browser FAILS instead of skipping.
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

/** This plugin's real stylesheet, compiled from source. */
async function pluginCss() {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/client/styles.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
  return mod.CSS
}

/** The markup StartCard renders (index.tsx), one card per site door. */
const CARDS = ['edit', 'comments', 'changes', 'design-system', 'team']
  .map(
    (tone) =>
      `<button type="button" class="tv-start-card" id="${tone}">` +
      `<span class="tv-start-card-icon" data-tone="${tone}" aria-hidden="true"></span>` +
      `<span class="tv-start-card-title">${tone}</span></button>`
  )
  .join('')

let browser
let page

before(async () => {
  const sheet = await pluginCss()
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}</style>' +
      `<style>${sheet}</style></head><body>` +
      `<div class="tv-start tv-start-site"><div class="tv-start-cards">${CARDS}</div></div></body></html>`
  )
})

after(async () => {
  await browser?.close()
})

/** Every card's computed shadow and border width, under the given theme. */
async function cardStyles(dark) {
  return page.evaluate((isDark) => {
    document.body.toggleAttribute('data-ds-dark-theme', isDark)
    return [...document.querySelectorAll('.tv-start-card')].map((el) => {
      const cs = getComputedStyle(el)
      return { id: el.id, boxShadow: cs.boxShadow, borderTopWidth: cs.borderTopWidth }
    })
  }, dark)
}

for (const [theme, dark] of [
  ['light', false],
  ['dark', true]
]) {
  test(`the start cards are flat in the ${theme} theme, border kept`, async () => {
    for (const card of await cardStyles(dark)) {
      assert.equal(card.boxShadow, 'none', `${card.id} card casts a shadow: ${card.boxShadow}`)
      assert.equal(card.borderTopWidth, '1px', `${card.id} card keeps its 1px border`)
    }
  })

  test(`a hovered start card stays flat in the ${theme} theme`, async () => {
    await page.evaluate((isDark) => document.body.toggleAttribute('data-ds-dark-theme', isDark), dark)
    await page.hover('#edit')
    const shadow = await page.$eval('#edit', (el) => getComputedStyle(el).boxShadow)
    assert.equal(shadow, 'none')
    await page.mouse.move(0, 0)
  })
}

/*
 * The start screen sits on the column's centre (Akemi, 14/10/2026).
 *
 * Measured on the local cluster at the default 300px conversation: column centre 206, cards 202.5.
 * dsh's scrollport (ConversationRoot .scrollBody) reserves a stable scrollbar gutter (5px, dsh's
 * scrollbar.css) and a 2px margin on its right only, so its content box, and everything centred in
 * it, sat 3.5px left of the column's centre.
 *
 * Pinned here: dsh's own .scrollBody rule and scrollbar sheet, read from the fork, with this
 * plugin's real COLUMN_CSS after them, as in dsh's page. With the start screen inside, the cards
 * and the composer seat are centred on the column within 1px; a transcript scrollport (no start
 * screen) keeps dsh's one-sided reservation.
 */
const DSH_CLIENT = path.join(repoRoot, 'vendor/tracy/deepseek-harness/packages/client')

/** dsh's .scrollBody rule from ConversationRoot.module.css, class hashed as the build does. */
function dshScrollBodyCss() {
  const sheet = readFileSync(
    path.join(DSH_CLIENT, 'ui-conversation/src/client/skeleton/ConversationRoot.module.css'),
    'utf8'
  )
  const rule = sheet.match(/^\.scrollBody \{[^}]*\}/m)
  assert.ok(rule, 'dsh ConversationRoot.module.css still has a .scrollBody rule')
  return rule[0].replace('.scrollBody', '._scrollBody_x7k2')
}

/** This plugin's real column sheet, compiled from source. */
async function columnCss() {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/client/column-styles.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
  return mod.COLUMN_CSS
}

/** A 300px conversation column whose scrollport holds `inner`, under dsh's and this plugin's CSS. */
async function columnPage(inner) {
  const sheets = [
    readFileSync(path.join(DSH_CLIENT, 'ui-theme/src/styles/scrollbar.css'), 'utf8'),
    dshScrollBodyCss(),
    await pluginCss(),
    await columnCss()
  ]
  const p = await browser.newPage()
  await p.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}' +
      '#col{position:absolute;left:56px;top:0;width:300px;height:600px;display:flex;flex-direction:column}' +
      '#seat{width:calc(100% - 16px);margin:0 auto;height:80px}</style>' +
      sheets.map((s) => `<style>${s}</style>`).join('') +
      '</head><body><div id="col"><div class="_scrollBody_x7k2" data-conversation-scroll="">' +
      `${inner}<div id="seat"></div></div></div></body></html>`
  )
  return p
}

const centreOf = (p, selector) =>
  p.$eval(selector, (el) => {
    const r = el.getBoundingClientRect()
    return r.left + r.width / 2
  })

test('the start screen hero and composer are centred on the conversation column', async () => {
  const p = await columnPage(
    `<div class="tv-start tv-start-site"><div class="tv-start-cards">${CARDS}</div></div>`
  )
  try {
    const column = await centreOf(p, '#col')
    for (const selector of ['.tv-start-cards', '#edit', '#seat']) {
      const centre = await centreOf(p, selector)
      assert.ok(Math.abs(centre - column) <= 1, `${selector} centre ${centre} vs column ${column}`)
    }
  } finally {
    await p.close()
  }
})

test('a transcript scrollport keeps dsh scrollbar reservation on the right only', async () => {
  const p = await columnPage('<div id="transcript" style="height:2000px"></div>')
  try {
    const gutter = await p.$eval('[data-conversation-scroll]', (el) => {
      const cs = getComputedStyle(el)
      return { gutter: cs.scrollbarGutter, marginLeft: cs.marginLeft }
    })
    assert.deepEqual(gutter, { gutter: 'stable', marginLeft: '0px' })
  } finally {
    await p.close()
  }
})
