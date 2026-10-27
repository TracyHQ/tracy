#!/usr/bin/env node
/**
 * The Getting started dialog's top row keeps its Close (×) inside the dialog on a phone.
 *
 * Measured on dev 12/10/2026 (develop e5ea4dd849) at 360px: the row holds the logo, "Tracy Cowork",
 * the eyebrow, "Hide from account menu" and Close, none of the last two shrinking, so Close sat at
 * x=371 — past the dialog's right edge (336) and past the viewport. On a slightly wider phone it
 * shows as a stray × floating beside the card.
 *
 * The real view (`OnboardView`) and the real stylesheet (`STYLES`) are bundled into one page and
 * measured in Chrome at 360, 390 and 1440px, light theme. The browser is the one at
 * `CHROME_CDP` (`chrome-watch`, e.g. http://127.0.0.1:9222) when set, else Playwright's own; a
 * missing dependency or browser FAILS.
 *
 *   node --test packages/ui/tracy-onboard/test/e2e/top-row-fits.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)

let browser
let context
let script = ''

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { OnboardView } from './Onboard'
        import { initialState } from './flow'
        import { en } from './strings'
        import { STYLES } from './styles'
        const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        const style = document.createElement('style')
        style.textContent = STYLES
        document.head.appendChild(style)
        const noop = () => {}
        const reopened = window.__reopened === true
        createRoot(document.getElementById('root')).render(createElement(OnboardView, {
          t, reopened, state: { ...initialState({ steps: 3, scan: false }), step: 0 },
          viewer: { email: 'someone@example.test', name: null },
          panel: { kind: 'none' }, languageNote: null, offer: null, theme: 'light', notify: null,
          isMac: false, formatTime: String, dispatch: noop, onHideMenu: noop, onRefresh: noop,
          onInstall: noop, onPick: noop, onConnect: noop, onConnectCancel: noop, onConnectReopen: noop,
          onConnectSubmit: noop, onCopy: async () => true, onTheme: noop, onNotifyToggle: noop,
          onNotifyTest: noop, onNotifySettings: noop
        }))
      `,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    logLevel: 'silent'
  })
  script = built.outputFiles[0].text
  const playwright = await import(
    pathToFileURL(require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })).href
  )
  const chromium = playwright.chromium ?? playwright.default?.chromium
  browser = process.env.CHROME_CDP
    ? await chromium.connectOverCDP(process.env.CHROME_CDP)
    : await chromium.launch()
  context = await browser.newContext()
})

after(async () => {
  // A borrowed browser (chrome-watch) keeps running: closing the connection only drops this context.
  await browser?.close()
})

for (const reopened of [false, true]) {
  for (const width of [360, 390, 1440]) {
    test(`at ${width}px${reopened ? ', reopened from the menu' : ''}: Close and Hide stay inside the dialog`, async () => {
      const page = await context.newPage()
      await page.setViewportSize({ width, height: 800 })
      await page.setContent('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
      await page.evaluate(
        ({ code, reopened }) => {
          window.__reopened = reopened
          new Function(code)()
        },
        { code: script, reopened }
      )
      await page.waitForSelector('.tv-ob-close')
      const geo = await page.evaluate(() => {
        const box = (sel) => {
          const b = document.querySelector(sel).getBoundingClientRect()
          return { left: b.left, right: b.right }
        }
        return {
          vw: document.documentElement.clientWidth,
          dialog: box('.tv-ob-dialog'),
          close: box('.tv-ob-close'),
          hide: box('.tv-ob-hide')
        }
      })
      assert.ok(
        geo.close.right <= geo.dialog.right - 8,
        `Close ends at ${geo.close.right}, dialog at ${geo.dialog.right}`
      )
      assert.ok(geo.hide.left >= geo.dialog.left, `Hide starts at ${geo.hide.left}, before the dialog`)
      assert.ok(geo.close.right <= geo.vw, `Close ends past the viewport (${geo.close.right} > ${geo.vw})`)
    })
  }
}
