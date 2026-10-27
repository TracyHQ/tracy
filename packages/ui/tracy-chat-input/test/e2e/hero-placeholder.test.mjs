/**
 * The start screen's composer placeholder wraps inside its three-line draft (Akemi, 01/10/2026).
 *
 * Measured on cowork.tracy.site: the site start screen's hero draft is three 22px lines (66px) and
 * ~417px wide, yet its placeholder "Describe what you want to build, / commands, @ files or
 * sessions" was forced onto one line and cut with an ellipsis, so "@ files or sessions" never
 * showed. The rule that did it was this plugin's own (composer-styles.ts, HERO_CARD placeholder).
 *
 * Pinned here, in a real browser:
 *   - at the draft width of the default 300px conversation (247px, since 14/10/2026: 14px text on
 *     20px lines) the whole placeholder shows on two lines: no horizontal or vertical overflow, and
 *     the empty draft is exactly as tall as it (no empty row under the hint);
 *   - at a narrow width where the text needs more than three lines it is clamped at three lines
 *     (60px) instead of spilling out of the draft, and the draft is that tall.
 *
 * Seam: the composer is dsh's InputBar (Lexical, session contexts), too heavy to mount here. The
 * page holds the DOM skeleton DraftEditor renders (the same stable attributes and CSS-module class
 * tails), dsh's own InputBar.module.css read from the fork with its class names hashed as the build
 * does, and this plugin's real COMPOSER_CSS loaded after it, as in dsh's page.
 *
 * Harness rules as in tracy-site-tabs `team-roster.test.mjs`: `playwright` from apps/tracy-host,
 * system Chrome, and a missing dependency or browser FAILS instead of skipping.
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

const PLACEHOLDER = 'Describe what you want to build, / commands, @ files or sessions'
const DSH_INPUT_BAR_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
)

/** dsh's CSS-module classes this page uses, renamed the way the build hashes them (_name_hash). */
function hashModuleClasses(css) {
  return css.replace(/\.(root|hero|card|scroll|grow|input|placeholder|row)\b(?![\w-])/g, '._$1_x7k2')
}

/** This plugin's real composer sheet, compiled from source. */
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

let browser
let page

before(async () => {
  const sheet = hashModuleClasses(readFileSync(DSH_INPUT_BAR_CSS, 'utf8')) + (await composerCss())
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}</style>' +
      `<style>${sheet}</style></head><body>` +
      '<div class="_composerHero_q1"><div data-tracy-start="site"></div>' +
      '<div data-slot="conversation.composer.bar"><div class="_root_x7k2 _hero_x7k2">' +
      '<div class="_card_x7k2" data-composer-card id="card">' +
      '<div class="_scroll_x7k2" data-input-scroll><div class="_grow_x7k2">' +
      `<div class="_input_x7k2" contenteditable="true" data-placeholder="${PLACEHOLDER}"><p><br></p></div>` +
      `<div aria-hidden="true" class="_placeholder_x7k2" data-composer-placeholder>${PLACEHOLDER}</div>` +
      '</div></div>' +
      '<div class="_row_x7k2"></div>' +
      '</div></div></div></div></body></html>'
  )
})

after(async () => {
  await browser?.close()
})

/** Size the hero card so the draft's text column is `draftWidth` px, then measure. */
async function measure(draftWidth) {
  return page.evaluate((w) => {
    const card = document.getElementById('card')
    const input = card.querySelector('[class*="_input"]')
    const ph = card.querySelector('[data-composer-placeholder]')
    // The card's border (1px) and side padding (10px) plus the draft's side padding (4px) sit
    // around the draft's text column on each side.
    card.style.width = `${w + 2 * (1 + 10 + 4)}px`
    card.style.boxSizing = 'border-box'
    const cs = getComputedStyle(ph)
    const probe = document.createElement('span')
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font}`
    probe.textContent = ph.textContent
    document.body.append(probe)
    const oneLineWidth = probe.getBoundingClientRect().width
    probe.remove()
    const inputBox = input.getBoundingClientRect()
    const phBox = ph.getBoundingClientRect()
    return {
      oneLineWidth,
      clientWidth: ph.clientWidth,
      scrollWidth: ph.scrollWidth,
      clientHeight: ph.clientHeight,
      scrollHeight: ph.scrollHeight,
      lineHeight: Number.parseFloat(cs.lineHeight),
      textOverflow: cs.textOverflow,
      inputHeight: inputBox.height,
      phTop: phBox.top - inputBox.top,
      phBottom: phBox.bottom - inputBox.top
    }
  }, draftWidth)
}

test('at the 247px draft of the default 300px conversation the whole placeholder shows, wrapped inside the three lines', async () => {
  const m = await measure(247)
  // The precondition the bug needs: the text is wider than one line of the draft.
  assert.ok(
    m.oneLineWidth > m.clientWidth,
    `text ${m.oneLineWidth}px must exceed one line (${m.clientWidth}px)`
  )
  assert.equal(m.inputHeight, 2 * m.lineHeight, 'the draft is as tall as the two-line hint, no empty row')
  assert.ok(
    m.scrollWidth <= m.clientWidth,
    `no sideways cut: scrollWidth ${m.scrollWidth} > ${m.clientWidth}`
  )
  assert.ok(
    m.scrollHeight <= m.clientHeight,
    `no line hidden: scrollHeight ${m.scrollHeight} > ${m.clientHeight}`
  )
  assert.ok(m.clientHeight > m.lineHeight, 'the placeholder takes more than one line')
  assert.ok(
    m.phTop >= 0 && m.phBottom <= m.inputHeight,
    `inside the draft: ${m.phTop}..${m.phBottom} of ${m.inputHeight}`
  )
})

test('at a narrow draft the placeholder is clamped at three lines, inside the draft', async () => {
  const m = await measure(120)
  assert.equal(m.inputHeight, 60, 'the draft is as tall as the three-line clamp')
  assert.ok(
    m.scrollWidth <= m.clientWidth,
    `no sideways cut: scrollWidth ${m.scrollWidth} > ${m.clientWidth}`
  )
  assert.equal(m.clientHeight, 3 * m.lineHeight, 'exactly three lines show')
  assert.ok(m.phBottom <= m.inputHeight, `does not spill below the draft: ${m.phBottom} > ${m.inputHeight}`)
})
