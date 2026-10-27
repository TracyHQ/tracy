/**
 * The conversation column never scrolls sideways (Akemi, 14/10/2026).
 *
 * Measured at a 300px chat column: opening the model picker left the column root (dsh
 * ConversationRoot, overflow: hidden in the active phase) at scrollLeft 61 with scrollWidth 520,
 * so messages and the chat box were cut on the left until a reload. The 520px came from dsh's right
 * transcript width handle, placed from the 680px content width at 514px, whose 2px glow kept its
 * width while the strip resolved to zero.
 *
 * Pinned here, in a real browser: dsh's root, band and width handle as ConversationRoot.module.css
 * draws them at a 300px column, plus this plugin's real column stylesheet. Bringing the chat box's
 * model button into view, or setting scrollLeft directly, leaves the root at 0, and the root's
 * content is no wider than the column.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system
 * Chrome, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
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

/** This plugin's real column stylesheet, compiled from source. */
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

/** dsh ConversationRoot.module.css, the rules that matter here, with hashed class tails. */
const DSH_CSS = `
.x_root { position: relative; display: flex; flex-direction: column; height: 100%; min-width: 0; }
.x_root[data-phase='active'] { overflow: hidden; }
.x_body {
  position: relative; display: flex; flex: 1; flex-direction: column; min-height: 0;
  --dsh-chat-content-width: clamp(680px, calc(300px * .64), 920px);
}
.x_scrollBody { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; }
.x_widthHandle {
  position: absolute; top: 0; bottom: 0;
  width: min(10px, calc((100% - var(--dsh-chat-content-width)) / 2 - 24px - 24px));
}
.x_widthHandle[data-side='left'] { right: calc(50% + var(--dsh-chat-content-width) / 2 + 24px); }
.x_widthHandle[data-side='right'] { left: calc(50% + var(--dsh-chat-content-width) / 2 + 24px); }
.x_widthHandle::after { content: ''; position: absolute; top: 0; bottom: 0; width: 2px; }
.x_widthHandle[data-side='left']::after { right: 4px; }
.x_widthHandle[data-side='right']::after { left: 4px; }
`

/**
 * The column as dsh renders it in the active phase, a chat box with its model button inside. The
 * header holds a 168px chip from 210px, 22px past the column as measured on the live header, so
 * the root has overflow of its own beyond the band's handles.
 */
const COLUMN =
  '<div id="column" style="width:300px;height:600px">' +
  '<div class="x_root" id="root" data-phase="active">' +
  '<div data-slot="conversation.header"><header style="height:40px;padding-left:210px"><span style="display:inline-block;width:168px">Model chip</span></header></div>' +
  '<div class="x_body" id="body">' +
  '<div class="x_scrollBody" data-conversation-scroll>' +
  '<p style="margin:8px">A message in the transcript.</p>' +
  '<div style="margin:8px;height:80px;border:1px solid"><button id="model" aria-label="Select model">M</button></div>' +
  '</div>' +
  '<div class="x_widthHandle" data-side="left"></div><div class="x_widthHandle" data-side="right"></div>' +
  '</div></div></div>'

let browser
let page

/** Load the column with dsh's rules and, when given, this plugin's sheet. */
async function load(sheet) {
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}</style>' +
      `<style>${DSH_CSS}</style><style>${sheet}</style></head><body>${COLUMN}</body></html>`
  )
}

/** The root's scroll offset and widths after the model button is brought into view. */
function measure() {
  return page.evaluate(() => {
    const root = document.getElementById('root')
    document.getElementById('model').scrollIntoView({ inline: 'center', block: 'center' })
    const afterIntoView = root.scrollLeft
    root.scrollLeft = 61
    return {
      afterIntoView,
      afterSet: root.scrollLeft,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth
    }
  })
}

before(async () => {
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
})

after(async () => {
  await browser?.close()
})

test("dsh's own rules alone let the 300px column scroll sideways (the defect this guards)", async () => {
  await load('')
  const m = await measure()
  assert.equal(m.afterSet, 61, 'without the plugin the root is a scroll container')
  assert.ok(m.rootScrollWidth > m.rootClientWidth, 'the right handle widens the column content')
})

test('with the plugin the column root cannot be scrolled sideways', async () => {
  await load(await columnCss())
  const m = await measure()
  assert.equal(m.afterIntoView, 0)
  assert.equal(m.afterSet, 0)
})

test("with the plugin the band's handles add nothing to the column's width", async () => {
  await load(await columnCss())
  const m = await measure()
  // 378px: the header chip's right edge, the widest thing left once the handles are clipped.
  assert.equal(m.rootScrollWidth, 378)
})

test('the root clips instead of hiding, in both axes', async () => {
  await load(await columnCss())
  const overflow = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('root'))
    return [cs.overflowX, cs.overflowY]
  })
  assert.deepEqual(overflow, ['clip', 'clip'])
})
