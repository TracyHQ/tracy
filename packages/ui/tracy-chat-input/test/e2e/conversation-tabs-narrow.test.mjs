/**
 * dsh's tab strip (Chat | Comments | Trajectory) never breaks a label inside its word (Akemi, 21/10/2026).
 *
 * Measured on the local cluster: below a ~290px Conversation column dsh's tabs wrapped to "Ch/at",
 * "Comm/ents", "Traject/ory" and the strip grew to three lines. Pinned here, in a real browser: dsh's
 * header and tabs as ConversationRoot.module.css draws them, plus this plugin's real stylesheet, at
 * 340/300/250/240/220px columns in light and dark. Every label stays one line, the gap narrows with
 * the header (20px, 12px, then 8px with 12px labels), a strip that still does not fit scrolls sideways
 * rather than wrapping, and the selection bar is not clipped by that scrolling strip.
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

const DSH_ROOT_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css'
)
/** dsh's CSS-module classes this page uses, renamed the way the build hashes them; `:global()` unwrapped. */
const hashModuleClasses = (css) =>
  css.replace(/:global\(([^()]*)\)/g, '$1').replace(/\.(header|tabs|tab|tabActive)\b(?![\w-])/g, '._$1_x7k2')

/** Expected gap and label size per column width: the header's content box is the column less 48px. */
const EXPECT = {
  340: ['20px', '13px'],
  300: ['20px', '13px'],
  250: ['12px', '13px'],
  240: ['12px', '13px'],
  220: ['8px', '12px']
}

let outDir = ''
let sheet = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-conversation-tabs-'))
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
  sheet = hashModuleClasses(readFileSync(DSH_ROOT_CSS, 'utf8')) + require(cssFile).CSS
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** dsh's header with its three tabs, Chat selected, in a column of `width` px. */
function page(width, theme) {
  const tabs = ['Chat', 'Comments', 'Trajectory']
    .map(
      (words, i) =>
        `<button type="button" role="tab" class="_tab_x7k2${i === 0 ? ' _tabActive_x7k2' : ''}">${words}</button>`
    )
    .join('')
  return `<!doctype html><html${theme === 'dark' ? ' data-ds-dark-theme' : ''}><head><style>${sheet}
    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; }
    #column { width: ${width}px; }</style></head><body${theme === 'dark' ? ' data-ds-dark-theme' : ''}>
    <div id="column"><header class="_header_x7k2"><div class="_tabs_x7k2" data-conversation-tabs role="tablist">${tabs}</div></header></div>
    </body></html>`
}

for (const theme of ['light', 'dark']) {
  for (const width of [340, 300, 250, 240, 220]) {
    test(`tab labels stay one line in a ${width}px column (${theme})`, async () => {
      const tab = await browser.newPage({ viewport: { width: 800, height: 300 } })
      try {
        await tab.setContent(page(width, theme))
        const m = await tab.evaluate(() => {
          const strip = document.querySelector('[data-conversation-tabs]')
          const tabs = [...strip.querySelectorAll('[role="tab"]')]
          // One client rect per rendered line of the label's text.
          const lines = (t) => {
            const r = document.createRange()
            r.selectNodeContents(t)
            return r.getClientRects().length
          }
          const active = tabs[0].getBoundingClientRect()
          return {
            gap: getComputedStyle(strip).columnGap,
            font: getComputedStyle(tabs[0]).fontSize,
            lines: tabs.map(lines),
            whiteSpace: getComputedStyle(tabs[0]).whiteSpace,
            overflowX: getComputedStyle(strip).overflowX,
            clippedY: strip.scrollHeight - strip.clientHeight,
            barBottom: active.bottom + 1,
            stripBottom: strip.getBoundingClientRect().bottom
          }
        })
        assert.deepEqual(m.lines, [1, 1, 1], `a tab label wrapped: ${JSON.stringify(m)}`)
        assert.equal(m.whiteSpace, 'nowrap')
        assert.equal(m.overflowX, 'auto', 'a strip that does not fit scrolls instead of wrapping')
        assert.deepEqual([m.gap, m.font], EXPECT[width], `gap and label size at ${width}px`)
        assert.equal(m.clippedY, 0, 'the scrolling strip has no vertical overflow')
        assert.ok(m.barBottom <= m.stripBottom, `the selection bar is clipped: ${JSON.stringify(m)}`)
      } finally {
        await tab.close()
      }
    })
  }
}
