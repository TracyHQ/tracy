/**
 * dsh's turn trigger row ("Background task updated") keeps its time and chevron inside its border
 * (Akemi, 21/10/2026).
 *
 * Measured on dev: in a 300px Conversation column the title never shrank, so the time and the chevron
 * ran past the row's right edge. Pinned here, in a real browser: the row as TurnTriggerNodeView.module.css
 * draws it, plus this plugin's real stylesheet, in rows as wide as 300/250px columns give them. Every
 * piece ends inside the row's padding, the title wraps only between words, the time shows at 300px and
 * gives way at 250px.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system
 * Chrome, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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

const DSH_ROW_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-chat/src/client/chat/TurnTriggerNodeView.module.css'
)
/** dsh's CSS-module classes this page uses, renamed the way the build hashes them; `:global()` unwrapped. */
const hashModuleClasses = (css) =>
  css
    .replace(/:global\(([^()]*)\)/g, '$1')
    .replace(/\.(root|header|icon|title|time|chevron|openChevron|body)\b(?![\w-])/g, '._$1_x7k2')

/** Row width inside a Conversation column of that width: the transcript's 71px of side room. */
const ROW = { 300: 229, 250: 179 }

let outDir = ''
let sheet = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-turn-trigger-'))
  const cssFile = path.join(outDir, 'css.cjs')
  await esbuild.build({
    stdin: {
      contents: `export { CSS } from './styles'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'ts'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: cssFile,
    logLevel: 'silent'
  })
  sheet = hashModuleClasses(readFileSync(DSH_ROW_CSS, 'utf8')) + require(cssFile).CSS
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** dsh's turn trigger row, closed, in a box of `width` px. */
function page(width, theme) {
  const dark = theme === 'dark' ? ' data-ds-dark-theme' : ''
  return `<!doctype html><html${dark}><head><style>${sheet}
    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; font-size: 14px; }
    #row { width: ${width}px; }</style></head><body${dark}><div id="row">
    <section class="_root_x7k2" data-turn-trigger><button class="_header_x7k2" type="button" aria-expanded="false">
      <span class="_icon_x7k2" aria-hidden="true"><svg width="14" height="14"></svg></span>
      <span class="_title_x7k2">Background task updated</span>
      <time class="_time_x7k2" datetime="2026-10-21T13:26:00Z">17:26</time>
      <svg width="12" height="12" class="_chevron_x7k2"></svg>
    </button></section></div></body></html>`
}

for (const theme of ['light', 'dark']) {
  for (const [column, width] of Object.entries(ROW)) {
    test(`the turn trigger row fits a ${column}px column (${theme})`, async () => {
      const tab = await browser.newPage({ viewport: { width: 600, height: 300 } })
      try {
        await tab.setContent(page(width, theme))
        const m = await tab.evaluate(() => {
          const button = document.querySelector('[data-turn-trigger] > button')
          const inner =
            button.getBoundingClientRect().right - parseFloat(getComputedStyle(button).paddingRight)
          const pieces = [...button.children].filter((n) => getComputedStyle(n).display !== 'none')
          const title = button.querySelector('[class*="_title"]')
          const range = document.createRange()
          range.selectNodeContents(title)
          const words = [...range.getClientRects()].length
          return {
            overflow: Math.max(...pieces.map((n) => n.getBoundingClientRect().right)) - inner,
            time: getComputedStyle(button.querySelector('time')).display !== 'none',
            lines: words,
            broken: title.scrollWidth > title.clientWidth + 0.5
          }
        })
        assert.ok(m.overflow <= 0.5, `a piece ran past the row: ${JSON.stringify(m)}`)
        assert.equal(m.broken, false, 'the title wraps between words, not inside one')
        assert.equal(
          m.time,
          column === '300',
          `the time shows at 300px and gives way at 250px: ${JSON.stringify(m)}`
        )
      } finally {
        await tab.close()
      }
    })
  }
}
