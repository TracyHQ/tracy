/**
 * The build chat's empty chat reads its own title and input hint (TracyHQ/tracy#613); the site's
 * workspace and the assistant's hero keep what they read.
 *
 * Pinned here, in a real browser:
 *   - the build hero shows "Tell me about your business" (the real KindStart component, server
 *     rendered) and the chat box's hint "Describe your business or paste a link to it" at the draft's
 *     size on one line, with dsh's words and tracy-assistant's sentence taking no room;
 *   - the site hero beside it keeps tracy-assistant's sentence and no hint of ours, and its start
 *     block carries no kind mark;
 *   - a hero with no start block at all (the assistant's own) keeps tracy-assistant's sentence.
 *
 * Seam as in `viewer-placeholder.test.mjs`: the DOM skeleton DraftEditor renders, dsh's own
 * InputBar.module.css with its classes hashed as the build does, this plugin's real CSS and
 * COMPOSER_CSS, and tracy-assistant's real stylesheet, with the custom properties each plugin sets
 * on <html>. The composer itself (Lexical, session contexts) is too heavy to mount here.
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
const ASSISTANT_HERO = 'Describe a change. /help for Tracy, / commands, @ files or sessions'
const DSH_INPUT_BAR_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
)

const hashModuleClasses = (css) =>
  css.replace(/\.(root|hero|card|scroll|grow|input|placeholder|row)\b(?![\w-])/g, '._$1_x7k2')

/** One source file's exports, compiled from source. */
async function load(file, stdin) {
  const built = await esbuild.build({
    ...(stdin ? { stdin: { ...stdin, resolveDir: pkgRoot } } : { entryPoints: [file] }),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    jsx: 'automatic'
  })
  // CommonJS, run here: react-dom/server needs node's own require, which an ES module bundle lacks.
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports
}

/** The real component, rendered to the HTML the page would hold. */
async function startHtml() {
  const mod = await load(null, {
    contents: `
      import { renderToStaticMarkup } from 'react-dom/server'
      import { KindStart } from './src/client/build-start.tsx'
      import { en } from './src/client/strings.ts'
      const t = (key) => en[key]
      module.exports = { default: renderToStaticMarkup(<KindStart kind="build" t={t} sent={false} />) }`,
    loader: 'tsx'
  })
  return mod.default
}

const draft = (words) =>
  '<div class="_scroll_x7k2" data-input-scroll><div class="_grow_x7k2">' +
  `<div class="_input_x7k2" contenteditable="true" data-placeholder="${words}"><p><br></p></div>` +
  `<div aria-hidden="true" class="_placeholder_x7k2" data-composer-placeholder>${words}</div>` +
  '</div></div>'

/** dsh's hero: its own title stack, the start block slot, then the composer card. */
const hero = (id, startBlock) =>
  `<div class="_composerHero_q1" id="${id}"><div class="_root_x7k2">dsh title</div>` +
  `<div data-slot="conversation.input.dock">${startBlock}</div>` +
  '<div data-slot="conversation.composer.bar"><div class="_root_x7k2 _hero_x7k2">' +
  `<div class="_card_x7k2" data-composer-card style="width:600px;box-sizing:border-box">${draft(DSH_WORDS)}` +
  '<div class="_row_x7k2"></div></div></div></div></div>'

let browser
let page

before(async () => {
  const startBlock = await startHtml()
  const { CSS } = await load(path.join(pkgRoot, 'src/client/styles.ts'))
  const { COMPOSER_CSS } = await load(path.join(pkgRoot, 'src/client/composer-styles.ts'))
  const { CSS: ASSISTANT_CSS } = await load(path.join(pkgRoot, '..', 'tracy-assistant/src/client/styles.ts'))
  const sheet =
    hashModuleClasses(readFileSync(DSH_INPUT_BAR_CSS, 'utf8')) + CSS + COMPOSER_CSS + ASSISTANT_CSS
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage()
  const siteBlock =
    '<div class="tv-dock" data-tracy-start="site"><div class="tv-start tv-start-site"></div></div>'
  const html =
    '<!doctype html><html data-tv-help-hero style=\'--tv-help-hint:"/help to ask Tracy · ";' +
    `--tv-help-hero-hint:"${ASSISTANT_HERO}";--tc-start-hint-build:"Describe your business or paste a link to it"'>` +
    '<head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}</style>' +
    `<style>${sheet}</style></head><body>${hero('build', startBlock)}${hero('site', siteBlock)}` +
    `${hero('assistant', '')}</body></html>`
  await page.setContent(html)
})

after(async () => {
  await browser?.close()
})

const read = (id) =>
  page.evaluate((heroId) => {
    const root = document.getElementById(heroId)
    const ph = root.querySelector('[data-composer-placeholder]')
    const before = getComputedStyle(ph, '::before')
    const after = getComputedStyle(ph, '::after')
    const box = ph.getBoundingClientRect()
    return {
      title: root.querySelector('.tv-start-title')?.textContent ?? null,
      kind: root.querySelector('[data-tracy-copy]')?.getAttribute('data-tracy-copy') ?? null,
      ownSize: getComputedStyle(ph).fontSize,
      beforeContent: before.content,
      beforeSize: before.fontSize,
      afterContent: after.content,
      afterSize: after.fontSize,
      height: box.height
    }
  }, id)

test('the build hero: its title and its hint, nothing of dsh or the assistant in the hint', async () => {
  const m = await read('build')
  assert.equal(m.title, 'Tell me about your business')
  assert.equal(m.kind, 'build')
  assert.equal(m.ownSize, '0px', 'dsh’s words take no room')
  assert.equal(m.afterContent, '"Describe your business or paste a link to it"')
  assert.equal(m.afterSize, '14px')
  assert.ok(
    m.beforeContent === '""' || m.beforeContent === 'none' || m.beforeContent === 'normal',
    m.beforeContent
  )
  assert.equal(m.height, 20, 'one 20px line')
})

test('the site hero keeps the assistant’s sentence and carries no kind', async () => {
  const m = await read('site')
  assert.equal(m.kind, null)
  assert.equal(m.title, null)
  assert.equal(m.ownSize, '0px')
  assert.equal(m.beforeContent, `"${ASSISTANT_HERO}"`)
  assert.equal(m.afterContent, 'none')
})

test('a hero with no start block keeps the assistant’s sentence', async () => {
  const m = await read('assistant')
  assert.equal(m.kind, null)
  assert.equal(m.beforeContent, `"${ASSISTANT_HERO}"`)
  assert.equal(m.afterContent, 'none')
})
