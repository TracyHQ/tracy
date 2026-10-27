/**
 * Exercise the real dsh, Tracy composer and Help styles on DraftEditor's DOM seam.
 * This checks the CSS cascade, including generated placeholders; it does not simulate a live agent.
 * A missing browser is a failure, never a skipped font-size check.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(pkgRoot, '../../..')
const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

async function sheet(file, exported) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent'
  })
  return (
    await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  )[exported]
}

const dshCss = readFileSync(
  path.join(
    repoRoot,
    'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
  ),
  'utf8'
).replace(/\.(root|hero|card|scroll|grow|input|placeholder|row)\b(?![\w-])/g, '._$1_test')
const css =
  dshCss +
  (await sheet(path.join(pkgRoot, 'src/client/composer-styles.ts'), 'COMPOSER_CSS')) +
  (await sheet(path.join(repoRoot, 'packages/ui/tracy-assistant/src/client/styles.ts'), 'CSS'))

function composer(hero) {
  return `<section class="${hero ? '_composerHero_test' : '_composerDock_test'}">
    ${hero ? '<div data-tracy-start="site"></div>' : ''}
    <div data-slot="conversation.composer.bar"><div class="_root_test ${hero ? '_hero_test' : ''}">
      <div class="_card_test" data-composer-card style="width:300px">
        <div class="_scroll_test" data-input-scroll><div class="_grow_test">
          <div class="_input_test" data-composer-input contenteditable="true"><p><br></p></div>
          <div class="_placeholder_test" data-composer-placeholder>Describe a change</div>
        </div></div><div class="_row_test"></div>
      </div>
    </div></div></section>`
}

let browser
let page
before(async () => {
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
  await page.setContent(
    `<html><head><style>${css}</style></head><body>${composer(true)}${composer(false)}</body></html>`
  )
})
after(async () => {
  await browser?.close()
})

for (const size of [10, 14, 18, 22]) {
  for (const dark of [false, true]) {
    for (const mode of ['plain', 'help', 'viewer']) {
      test(`${size}px, ${dark ? 'dark' : 'light'}, ${mode}: both composers follow the content preference`, async () => {
        const measured = await page.evaluate(
          ({ size, dark, mode }) => {
            const root = document.documentElement
            document.body.toggleAttribute('data-ds-dark-theme', dark)
            document.body.style.setProperty('--dsh-content-font-size', `${size}px`)
            document.body.style.setProperty('--dsh-content-font-delta', `${size - 14}px`)
            root.toggleAttribute('data-tv-help-hero', mode !== 'plain')
            root.toggleAttribute('data-tracy-seat-viewer', mode === 'viewer')
            root.style.setProperty('--tv-help-hero-hint', '"Describe a change. /help for Tracy"')
            root.style.setProperty('--tv-help-hint', '"/help to ask Tracy "')
            root.style.setProperty('--tc-viewer-hint', '"Ask about this site"')
            const read = (el, pseudo) => {
              const style = getComputedStyle(el, pseudo)
              return { font: style.fontSize, line: style.lineHeight }
            }
            return [...document.querySelectorAll('[data-composer-card]')].map((card) => {
              const input = card.querySelector('[data-composer-input]')
              const placeholder = card.querySelector('[data-composer-placeholder]')
              const hint = read(placeholder, mode === 'plain' ? undefined : '::before')
              const suffix = mode === 'viewer' ? read(placeholder, '::after') : null
              const empty = read(input)
              // DraftEditor removes the placeholder once there is text. Check the typed surface too.
              placeholder.remove()
              input.innerHTML = '<p>A draft at the selected font size</p>'
              const typed = read(input)
              input.innerHTML = '<p><br></p>'
              input.after(placeholder)
              return { hint, suffix, empty, typed }
            })
          },
          { size, dark, mode }
        )
        for (const card of measured) {
          for (const value of [card.hint, card.suffix, card.empty, card.typed].filter(Boolean)) {
            assert.equal(value.font, `${size}px`, 'drafts and visible placeholder text follow Settings')
            assert.equal(
              value.line,
              `${size + 6}px`,
              'leading grows with the text without changing the default'
            )
          }
        }
      })
    }
  }
}
