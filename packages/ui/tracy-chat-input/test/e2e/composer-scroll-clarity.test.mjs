/** The real scroll mask must clear when a scrolled draft shrinks, including on submit. */
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

async function moduleSource(file) {
  const built = await build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent'
  })
  return built.outputFiles[0].text
}
async function sheet(file, exported) {
  return (
    await import(`data:text/javascript;base64,${Buffer.from(await moduleSource(file)).toString('base64')}`)
  )[exported]
}
const css =
  readFileSync(
    path.join(
      repoRoot,
      'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
    ),
    'utf8'
  ).replace(/\.(root|hero|card|scroll|grow|input|placeholder|row)\b(?![\w-])/g, '._$1_test') +
  (await sheet(path.join(pkgRoot, 'src/client/composer-styles.ts'), 'COMPOSER_CSS')) +
  (await sheet(path.join(repoRoot, 'packages/ui/tracy-assistant/src/client/styles.ts'), 'CSS'))
const watcher = await moduleSource(path.join(pkgRoot, 'src/client/composer-line.ts'))
let browser
let page
before(async () => {
  browser = await chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] })
  page = await browser.newPage()
})
after(async () => {
  await browser?.close()
})

async function mount(size, hero) {
  await page.setContent(`<!doctype html><html data-tv-help-hero><head><style>
    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; --foreground: CanvasText; --dsh-content-font-size: ${size}px; --dsh-content-font-delta: ${size - 14}px; }
    :root { --tv-help-hero-hint: "Describe a change. /help for Tracy, / commands, @ files or sessions"; }
    ${css}
    </style></head><body><section class="${hero ? '_composerHero_test' : '_composerDock_test'}"><div data-tracy-start="site"></div><div data-slot="conversation.composer.bar"><div class="_root_test ${hero ? '_hero_test' : ''}">
    <div class="_card_test" data-composer-card style="width:277px;box-sizing:border-box">
      <div class="_scroll_test" data-input-scroll><div class="_grow_test">
        <div class="_input_test" data-composer-input contenteditable="true"><p><br></p></div>
        <div class="_placeholder_test" data-composer-placeholder>Describe a change</div>
      </div></div><div class="_row_test"></div>
    </div></div></div></section></body></html>`)
  await page.evaluate(() => document.documentElement.setAttribute('data-tv-help-hero', ''))
  await page.addScriptTag({
    type: 'module',
    content: `${watcher}\nwindow.stopWatching = watchDraftLine(document.querySelector('[data-composer-card]'));`
  })
  await page.waitForFunction(() => typeof window.stopWatching === 'function')
}
async function settle() {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
}
async function read() {
  return page.locator('[data-input-scroll]').evaluate((e) => ({
    top: e.scrollTop,
    height: e.scrollHeight,
    client: e.clientHeight,
    fade: getComputedStyle(e).getPropertyValue('--tc-composer-fade'),
    mask: getComputedStyle(e).maskImage
  }))
}
async function draft(lines) {
  await page.evaluate((lines) => {
    const input = document.querySelector('[data-composer-input]')
    const grow = input.parentElement
    grow.querySelector('[data-composer-placeholder]')?.remove()
    input.replaceChildren(
      ...Array.from({ length: lines }, () => {
        const p = document.createElement('p')
        p.textContent = 'A readable draft line.'
        return p
      })
    )
  }, lines)
  await settle()
}

for (const hero of [false, true]) {
  for (const size of [14, 18]) {
    test(`${hero ? 'hero' : 'in-session'}, ${size}px: a completed scroll timeline cannot fade the empty composer after submit`, async () => {
      await mount(size, hero)
      await draft(20)
      await page.locator('[data-input-scroll]').evaluate((e) => {
        e.scrollTop = e.scrollHeight
      })
      await settle()
      const bottom = await read()
      assert.ok(bottom.top > 0, 'precondition: the long draft is scrolled to its bottom')
      assert.equal(bottom.fade, '16px', 'keep the intended fade while actually scrolled')
      assert.notEqual(bottom.mask, 'none', 'the token-backed mask must actually render')
      await page.evaluate(() => {
        const input = document.querySelector('[data-composer-input]')
        input.innerHTML = '<p><br></p>'
        const placeholder = document.createElement('div')
        placeholder.className = '_placeholder_test'
        placeholder.dataset.composerPlaceholder = ''
        placeholder.textContent = 'Describe a change'
        input.after(placeholder)
      })
      await settle()
      const empty = await read()
      assert.equal(empty.top, 0)
      assert.equal(empty.height, empty.client, 'precondition: there is no remaining scroll range')
      assert.equal(empty.fade, '0px', `no fade at the top after shrink: ${JSON.stringify(empty)}`)
      await draft(1)
      assert.equal((await read()).fade, '0px', 'a short draft after submit is also clear')
    })

    test(`${hero ? 'hero' : 'in-session'}, ${size}px: an overflowing draft is clear at top and fades only after scrolling`, async () => {
      await mount(size, hero)
      await draft(20)
      assert.equal((await read()).fade, '0px')
      for (const position of [0.5, 1, 0]) {
        await page.locator('[data-input-scroll]').evaluate((e, position) => {
          e.scrollTop = (e.scrollHeight - e.clientHeight) * position
        }, position)
        await settle()
        assert.equal((await read()).fade, position ? '16px' : '0px')
      }
      await page.evaluate(() => window.stopWatching())
    })
  }
}
