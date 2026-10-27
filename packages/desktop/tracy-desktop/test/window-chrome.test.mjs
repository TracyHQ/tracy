/**
 * The window frame on each operating system, and what the page is told so dsh's CSS clears room for
 * it. The platform and the theme are passed in, so every branch runs on any host.
 *
 *   node --test packages/desktop/tracy-desktop/test/window-chrome.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const {
  captionColors,
  measuredPalette,
  overlayColors,
  pageMarks,
  validCaptionColor,
  windowChrome
} = require('../src/window-chrome.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const HEIGHT = 40

test('macOS keeps the hidden-inset frame dsh places its first row around, unchanged', () => {
  const expected = {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000'
  }
  assert.deepEqual(windowChrome('darwin', { dark: false, captionHeight: HEIGHT }), expected)
  assert.deepEqual(windowChrome('darwin', { dark: true, captionHeight: HEIGHT }), expected)
})

test('Windows hides the title bar and keeps the system buttons as an overlay in the light palette', () => {
  assert.deepEqual(windowChrome('win32', { dark: false, captionHeight: HEIGHT }), {
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: HEIGHT, color: '#f9fafb', symbolColor: '#0f1115' },
    backgroundColor: '#f9fafb'
  })
})

test('Windows overlay buttons follow the dark palette', () => {
  assert.deepEqual(windowChrome('win32', { dark: true, captionHeight: HEIGHT }), {
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: HEIGHT, color: '#1b1b1c', symbolColor: '#f9fafb' },
    backgroundColor: '#1b1b1c'
  })
})

test('Linux keeps the system frame, with the menu bar hidden until Alt', () => {
  assert.deepEqual(windowChrome('linux', { dark: false, captionHeight: HEIGHT }), { autoHideMenuBar: true })
})

test("the fallback caption colours are dsh's sidebar fill and label, per theme", () => {
  assert.deepEqual(captionColors(false), { color: '#f9fafb', symbolColor: '#0f1115' })
  assert.deepEqual(captionColors(true), { color: '#1b1b1c', symbolColor: '#f9fafb' })
})

test('only a CSS colour value the page measured may reach the overlay', () => {
  for (const ok of ['#fff', '#1b1b1c', '#1b1b1cff', 'rgba(27, 27, 28, 1)', 'rgb(0,0,0)'])
    assert.equal(validCaptionColor(ok), true, ok)
  for (const bad of ['', 'red', 'url(x)', 'rgba(1,2,3', '#12', 42, null, undefined, 'rgb(0,0,0); x'])
    assert.equal(validCaptionColor(bad), false, String(bad))
})

test('the page is marked on every platform, as dsh marks its own page', () => {
  for (const platform of ['darwin', 'win32', 'linux'])
    assert.equal(pageMarks(platform).platform, true, platform)
})

test('macOS alone gets the integrated chrome row and the kept rail (Tracy fork patches answer them for darwin only)', () => {
  assert.equal(pageMarks('darwin').integratedChrome, true)
  assert.equal(pageMarks('win32').integratedChrome, false)
  assert.equal(pageMarks('linux').integratedChrome, false)
})

test("Windows alone gets dsh's caption row, which the overlay buttons sit in", () => {
  assert.equal(pageMarks('win32').windowsCaption, true)
  assert.equal(pageMarks('darwin').windowsCaption, false)
  assert.equal(pageMarks('linux').windowsCaption, false)
})

test('fullscreen is mirrored where it hides window controls the page clears: macOS and Windows', () => {
  assert.equal(pageMarks('darwin').fullscreen, true)
  assert.equal(pageMarks('win32').fullscreen, true)
  assert.equal(pageMarks('linux').fullscreen, false)
})

test('a palette the page measured reaches the overlay as it was measured', () => {
  assert.deepEqual(measuredPalette('rgba(255, 255, 255, 1)', 'rgba(15, 17, 21, 1)'), {
    color: 'rgba(255, 255, 255, 1)',
    symbolColor: 'rgba(15, 17, 21, 1)'
  })
  assert.deepEqual(measuredPalette('#101010', '#fafafa'), { color: '#101010', symbolColor: '#fafafa' })
})

test("a transparent fill is no palette: a Tracy page without dsh's sidebar fill keeps the theme fallback", () => {
  // dsh's probe reads var(--dsw-specific-sidebar-fill); on a page that never declares it the fill is
  // transparent, and a transparent overlay over a page that later turns dark hid the buttons (VM 10/10).
  for (const clear of ['rgba(0, 0, 0, 0)', 'rgba(255,255,255,0)', '#0000', '#ffffff00'])
    assert.equal(measuredPalette(clear, 'rgba(15, 17, 21, 1)'), null, clear)
  assert.equal(measuredPalette('rgba(0, 0, 0, 0.5)', 'rgba(15, 17, 21, 1)')?.color, 'rgba(0, 0, 0, 0.5)')
  assert.equal(measuredPalette('red', '#fff'), null)
  assert.equal(measuredPalette('#fff', 'url(x)'), null)
})

const WAITING = 'file:///C:/Users/t/AppData/Local/Programs/Tracy/resources/app/src/signin-waiting.html'

test('the overlay takes the page palette when there is one, else the theme fallback', () => {
  const page = { color: 'rgba(1, 2, 3, 1)', symbolColor: 'rgba(4, 5, 6, 1)' }
  assert.deepEqual(overlayColors({ url: 'https://cowork.tracy.ai/', dark: true, measured: page }), page)
  assert.deepEqual(overlayColors({ url: 'https://cowork.tracy.ai/', dark: true }), captionColors(true))
  assert.deepEqual(overlayColors({ url: 'https://cowork.tracy.ai/', dark: false }), captionColors(false))
})

test('the sign-in waiting page is always dark, so its overlay is dark in either theme', () => {
  const dark = overlayColors({ url: `${WAITING}?code=AB12&home=https%3A%2F%2Fcowork.tracy.ai`, dark: false })
  assert.deepEqual(dark, overlayColors({ url: WAITING, dark: true }))
  assert.notDeepEqual(dark, captionColors(false))
  // Only the app's own local file: a web page of the same name is any other page.
  assert.deepEqual(
    overlayColors({ url: 'https://example.com/signin-waiting.html', dark: false }),
    captionColors(false)
  )
})

/** One custom property of a page stylesheet's first `:root` block (the pages load their CSS from a file). */
function rootColor(file, name) {
  const css = readFileSync(path.join(SRC, file), 'utf8')
  const match = new RegExp(`${name}:\\s*(#[\\da-f]+)`, 'i').exec(css)
  assert.ok(match, `${file} declares ${name}`)
  return match[1].toLowerCase()
}

test("the waiting page's overlay is painted in the page's own background and text colours", () => {
  assert.deepEqual(overlayColors({ url: WAITING, dark: false }), {
    color: rootColor('signin-waiting.css', '--bg'),
    symbolColor: rootColor('signin-waiting.css', '--fg')
  })
})

test("the spare window's page is the theme fallback's own fill, so its overlay needs nothing of its own", () => {
  const css = readFileSync(path.join(SRC, 'window-waiting.css'), 'utf8')
  assert.match(css, new RegExp(`background: ${captionColors(false).color};`))
  assert.match(css, new RegExp(`background: ${captionColors(true).color};`))
})
