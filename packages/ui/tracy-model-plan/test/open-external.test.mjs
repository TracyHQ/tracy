/**
 * Opening a vendor's page (`src/client/device-sign-in.ts` `openExternal`). On the web it must open a
 * TAB: Chrome turns `window.open(url, '_blank', 'noopener,…')` into a popup window with no address
 * bar, and Claude's sign-in ends on a localhost address the person has to copy from that bar
 * (Lee, cowork.tracy.site, 12/10/2026). A clicked `<a target="_blank">` opens a tab, and
 * `rel="noopener noreferrer"` keeps the vendor's page from reaching back to ours. In the desktop app
 * the app's own links open it in the person's browser.
 *
 *   node --test packages/ui/tracy-model-plan/test/open-external.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const require = createRequire(import.meta.url)

/** jsdom, from a workspace member that declares it. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

const URL_CLAUDE =
  'https://claude.ai/oauth/authorize?code=true&redirect_uri=http%3A%2F%2Flocalhost%3A53692%2Fcallback&state=s'

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let JSDOM
/** @type {any} */
let dom
/** Every anchor click that reached the window, as the browser would follow it. */
/** @type {{ href: string, target: string, rel: string, attached: boolean }[]} */
let clicks = []
/** @type {string[]} */
let popups = []

before(async () => {
  JSDOM = loadJsdom().JSDOM
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-model-plan-open-'))
  const outfile = path.join(outDir, 'device.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'device-sign-in.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
    url: 'https://cowork.tracy.test/'
  })
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  clicks = []
  popups = []
  dom.window.open = (url) => {
    popups.push(String(url))
    return null
  }
  // Last in the bubble: record what the browser would follow, then stop jsdom navigating.
  dom.window.addEventListener('click', (event) => {
    const a = event.target
    if (a?.tagName !== 'A') return
    clicks.push({
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel') ?? '',
      attached: a.isConnected
    })
    event.preventDefault()
  })
})

afterEach(() => {
  dom?.window.close()
  delete globalThis.window
  delete globalThis.document
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

test('on the web the page opens in a new tab through a clicked anchor, never window.open', () => {
  lib.openExternal(URL_CLAUDE)
  assert.deepEqual(popups, [], 'window.open with noopener is a popup window in Chrome')
  assert.equal(clicks.length, 1, 'one anchor clicked')
  const [click] = clicks
  assert.equal(click.href, URL_CLAUDE)
  assert.equal(click.target, '_blank')
  assert.deepEqual(click.rel.split(/\s+/).sort(), ['noopener', 'noreferrer'])
  assert.equal(click.attached, true, 'clicked while in the document')
  assert.equal(document.querySelectorAll('a').length, 0, 'the anchor is gone afterwards')
})

test("in the desktop app the page opens through the app's links, with no anchor and no window.open", () => {
  const opened = []
  window.tracyDesktop = { links: { openExternal: (url) => opened.push(url) } }
  lib.openExternal(URL_CLAUDE)
  assert.deepEqual(opened, [URL_CLAUDE])
  assert.deepEqual(popups, [])
  assert.deepEqual(clicks, [])
})
