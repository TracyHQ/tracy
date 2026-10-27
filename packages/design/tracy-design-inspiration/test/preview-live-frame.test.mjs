/**
 * The live preview frame (17/10/2026): the preview door answers the site itself at its own address with a ticket
 * (`{ live: true, src, mode }`), and the popup frames it with the page's scripts running, so it shows what Try on
 * shows. The page is another origin: Light | Dark reaches it by message only once pressed (the page's own script
 * opens the system's side), and the page it reports being on is where a device switch reopens it.
 *
 *   node --test packages/design/tracy-design-inspiration/test/preview-live-frame.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom, SYSTEMS } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

const SRC = 'http://shop.tracy.test:51710/?tracy_ds_preview=abc.def'
const ORIGIN = 'http://shop.tracy.test:51710'

/** The doors, with the preview door answering the live frame. */
function live(mode = 'dark') {
  const state = doors({})
  const inner = state.fetch
  state.fetch = async (input, init) =>
    String(input).includes('/design-system/preview?')
      ? Response.json({ live: true, src: SRC, mode })
      : inner(input, init)
  return state
}

const frame = () => ui.body().querySelector('[data-system-preview-frame]')
const pressed = () =>
  [...ui.body().querySelectorAll('[data-preview-theme]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('data-preview-theme'))

/** Give the frame a window that records what it is told; returns the list of messages. */
function spyWindow(el) {
  /** @type {{ data: any, origin: string }[]} */
  const told = []
  const win = { postMessage: (data, origin) => told.push({ data, origin }) }
  Object.defineProperty(el, 'contentWindow', { configurable: true, get: () => win })
  return { told, win }
}

/** The frame's page says where it is (and, `extra.theme`, the side it shows), as Tracy's script in it does on load. */
/** The frame's page says its side changed (its own switch, a press), as Tracy's script in it does. */
async function side(win, theme, origin = ORIGIN) {
  const e = new ui.dom.Event('message')
  Object.defineProperty(e, 'data', { value: { type: 'tracy-ds-side', theme } })
  Object.defineProperty(e, 'origin', { value: origin })
  Object.defineProperty(e, 'source', { value: win })
  globalThis.window.dispatchEvent(e)
  await ui.settle()
}

async function report(win, href, origin = ORIGIN, extra = {}) {
  const e = new ui.dom.Event('message')
  Object.defineProperty(e, 'data', { value: { type: 'tracy-ds-at', href, ...extra } })
  Object.defineProperty(e, 'origin', { value: origin })
  Object.defineProperty(e, 'source', { value: win })
  globalThis.window.dispatchEvent(e)
  await ui.settle()
}

test('the live answer is framed by its address, scripts allowed, no form, and no "runs without scripts" line', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: live(), props: { modes: true } })
  const el = frame()
  assert.ok(el, 'a frame')
  assert.equal(el.getAttribute('src'), SRC)
  assert.equal(el.hasAttribute('srcdoc'), false)
  const sandbox = String(el.getAttribute('sandbox')).split(/\s+/)
  assert.ok(sandbox.includes('allow-scripts'))
  assert.ok(!sandbox.includes('allow-forms') && !sandbox.includes('allow-top-navigation'))
  assert.equal(ui.body().querySelectorAll('[data-system-preview-note]').length, 0)
  assert.deepEqual(pressed(), ['dark'], 'the side the door said the system opens on')
  await popup.unmount()
})

test('Light | Dark reaches the page by message, only once pressed, and only to its origin', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: live(), props: { modes: true } })
  const { told, win } = spyWindow(frame())
  await ui.fire(frame(), 'load')
  await report(win, SRC)
  assert.deepEqual(told, [], 'not pressed: the page opens on its own side')
  await ui.fire(ui.body().querySelector('[data-preview-theme="light"]'))
  assert.deepEqual(told.at(-1), { data: { type: 'tracy-ds-theme', theme: 'light' }, origin: ORIGIN })
  // a page loaded after the press (a link followed) is told again when it reports
  const n = told.length
  await report(win, `${ORIGIN}/about?tracy_ds_preview=abc.def`)
  assert.equal(told.length, n + 1)
  // a message from another origin is not believed
  await report(win, 'http://evil.test/', 'http://evil.test')
  assert.equal(told.length, n + 1)
  await popup.unmount()
})

test('a device switch reopens the live frame on the page it reported, not the home', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: live(), props: { modes: false } })
  const { win } = spyWindow(frame())
  const about = `${ORIGIN}/about?tracy_ds_preview=abc.def`
  await report(win, about)
  assert.equal(frame().getAttribute('src'), SRC, 'following a link does not re-render the frame')
  await ui.fire(ui.body().querySelector('[data-device="mobile"]'))
  assert.equal(frame().getAttribute('src'), about)
  await popup.unmount()
})

test('the switch lights the side the page reports showing, not the side the system declares (JA Vega under Moxie)', async () => {
  const popup = await ui.mountPreview({ system: SYSTEMS[1], state: live('dark'), props: { modes: true } })
  const { told, win } = spyWindow(frame())
  await ui.fire(frame(), 'load')
  assert.deepEqual(pressed(), ['dark'], 'before the page says anything: the side the door declared')
  await report(win, SRC, ORIGIN, { theme: 'light' })
  assert.deepEqual(pressed(), ['light'], 'the page opened on its template default')
  assert.deepEqual(told, [], 'telling the side changes nothing on the page')
  // the page's own switch
  await side(win, 'dark')
  assert.deepEqual(pressed(), ['dark'])
  // another origin, or a side that is no side, is not believed
  await side(win, 'light', 'http://evil.test')
  await side(win, 'blue')
  assert.deepEqual(pressed(), ['dark'])
  // a press is sent; the switch then follows what the page reports
  await ui.fire(ui.body().querySelector('[data-preview-theme="light"]'))
  assert.deepEqual(told.at(-1), { data: { type: 'tracy-ds-theme', theme: 'light' }, origin: ORIGIN })
  await side(win, 'light')
  assert.deepEqual(pressed(), ['light'])
  await popup.unmount()
})
