/**
 * The quickstart preview's phone frame (#630), driven in a real browser.
 *
 * The frame was `w-[390px]` border-box with a 4-px bezel, so its content was 382 px while the demo
 * inside was laid out at 390: the page's right 8 px were cut off (a page with 16-px side gaps showed
 * 16 left, 8 right). Pinned here, on the REAL `TemplateBody` with the plugin's own Tailwind sheet
 * (`fixtures/template-body-page.mjs`), framing a loopback page:
 *
 *   - the frame's content box and the framed page's layout viewport are both 390 px, the bezel
 *     outside them, and nothing is clipped — at a 390-px room (the phone shrinks whole) and a
 *     1440-px one (it does not grow);
 *   - resizing the room rescales without reloading the page or changing its 390-px viewport, and a
 *     room hidden then shown never yields a NaN, zero or stale scale;
 *   - the screenshot fallback fills the same 390-px content box, and a card with no live demo still
 *     opens on its picture;
 *   - desktop still fills the room;
 *   - `tracy:frame-height` is used only from this frame and only as a finite, positive number;
 *   - the room's ResizeObserver is disconnected when the phone goes (device switch, unmount).
 *
 * A browser, not a DOM stub: the bug is layout (border-box, a transform that leaves layout size
 * alone), which no layout-free DOM can measure. A missing dependency or browser fails, never skips.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'

import {
  measure,
  openHarness,
  PAGE_GAP,
  pkgRoot,
  scratchRoot,
  settle,
  show,
  templateCard
} from '../fixtures/template-body-page.mjs'

const require = createRequire(import.meta.url)
const BEZEL = 4
const TOL = 0.5

let h
let page
/** @type {{ phoneScale: (w: number) => number | null, frameHeight: (v: unknown) => number | null, PHONE_WIDTH: number, PHONE_OUTER: number }} */
let helpers
let helperDir

before(async () => {
  helperDir = mkdtempSync(path.join(scratchRoot(), 'tdi-body-helpers-'))
  const outfile = path.join(helperDir, 'helpers.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export { phoneScale, frameHeight, PHONE_WIDTH, PHONE_OUTER } from './TemplateBody'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  helpers = require(outfile)
  h = await openHarness()
  page = await h.browser.newPage({ viewport: { width: 1700, height: 900 } })
  await page.goto(`${h.base}/index.html`)
})

after(async () => {
  await h?.close()
  if (helperDir) rmSync(helperDir, { recursive: true, force: true })
})

const props = (over = {}, card = {}) => ({
  template: templateCard(h.base, card),
  name: 'Preview',
  device: 'mobile',
  theme: 'light',
  ...over
})

async function waitLive() {
  await page.waitForFunction(() => {
    const f = document.querySelector('#dialog iframe')
    return f?.contentWindow?.document?.getElementById('page') != null
  })
  await settle(page)
}

/** The same geometry every mobile case must hold, whatever the room. */
function assertPhone(m, room) {
  const scale = Math.min(1, room / 398)
  assert.ok(Math.abs(m.drawnScale - scale) < 0.002, `drawn scale ${m.drawnScale}, want ${scale}`)
  assert.ok(Math.abs(m.scale - scale) < 0.002, `declared scale ${m.scale}`)
  assert.deepEqual(m.bezel, [`${BEZEL}px`, `${BEZEL}px`])
  // Content box = the page's viewport; the bezel is outside it.
  assert.equal(m.frameOffsetWidth, 390 + 2 * BEZEL)
  assert.equal(m.frameOffsetWidth - 2 * BEZEL, 390)
  // Inside the room, top to bottom and side to side, and nothing wider than its box.
  assert.ok(m.frame.left >= m.room.left - TOL, `frame left ${m.frame.left} < room ${m.room.left}`)
  assert.ok(m.frame.right <= m.room.right + TOL, `frame right ${m.frame.right} > room ${m.room.right}`)
  assert.ok(m.frame.bottom <= m.room.bottom + TOL, 'frame taller than the room')
  assert.deepEqual(m.overflow, { room: 0, dialog: 0, document: 0 })
}

function assertLive(m, room) {
  assertPhone(m, room)
  const s = m.drawnScale
  assert.equal(m.inside.innerWidth, 390, 'the framed page is laid out at 390 px')
  assert.equal(m.inside.scrollWidth, 390, 'and has no sideways scroll of its own')
  assert.ok(Math.abs(m.iframe.width - 390 * s) <= TOL)
  // The page's own gutters, as drawn inside the bezel, in the page's CSS px: 16 and 16, not 16 and 8.
  const innerLeft = m.frame.left + BEZEL * s
  const innerRight = m.frame.right - BEZEL * s
  assert.ok(Math.abs(m.iframe.left - innerLeft) <= TOL && Math.abs(m.iframe.right - innerRight) <= TOL)
  const left = (m.iframe.left + m.inside.left * s - innerLeft) / s
  const right = (innerRight - (m.iframe.left + (m.inside.innerWidth - m.inside.right) * s)) / s
  assert.ok(Math.abs(left - PAGE_GAP) <= TOL, `left gap ${left}`)
  assert.ok(Math.abs(right - PAGE_GAP) <= TOL, `right gap ${right}`)
}

test('the scale fits the whole phone and refuses a room it cannot fit', () => {
  const { phoneScale, PHONE_WIDTH, PHONE_OUTER } = helpers
  assert.equal(PHONE_WIDTH, 390)
  assert.equal(PHONE_OUTER, 398)
  assert.equal(phoneScale(1440), 1)
  assert.equal(phoneScale(398), 1)
  assert.equal(phoneScale(390), 390 / 398)
  assert.equal(phoneScale(199), 0.5)
  for (const room of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(phoneScale(room), null)
})

test('a frame height is a finite, positive number or nothing', () => {
  const { frameHeight } = helpers
  assert.equal(frameHeight(1400), 1400)
  assert.equal(frameHeight(0.5), 0.5)
  for (const v of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, '900', null, undefined, {}]) {
    assert.equal(frameHeight(v), null, String(v))
  }
})

for (const room of [390, 1440]) {
  test(`live phone at a ${room}-px room: 390-px content box = 390-px page, 16/16, not clipped`, async () => {
    await show(page, { room, props: props() })
    await waitLive()
    const m = await measure(page)
    assertLive(m, room)
    // The page said 1400 px; the room is shorter, so the phone is capped at the room's height.
    assert.equal(m.iframeHeight, '1400px')
    assert.ok(m.room.bottom - m.frame.bottom <= 1, 'a page taller than the room fills the room')
  })
}

test('resizing rescales in place: same page, same 390-px viewport', async () => {
  await show(page, { room: 1440, props: props() })
  await waitLive()
  await page.evaluate(() => {
    document.querySelector('#dialog iframe').contentWindow.__marker = 'kept'
  })
  for (const room of [390, 430, 300, 1440]) {
    await show(page, { room })
    const m = await measure(page)
    assertLive(m, room)
    assert.equal(m.inside.marker, 'kept', `the frame reloaded at ${room}`)
  }
})

test('a room hidden then shown keeps a real scale and measures again', async () => {
  await show(page, { room: 390, props: props() })
  await waitLive()
  await page.evaluate(() => {
    document.getElementById('dialog').style.display = 'none'
  })
  await settle(page)
  const hidden = await page.evaluate(() => ({
    scale: document.querySelector('[data-phone-frame]').parentElement.dataset.phoneScale,
    transform: document.querySelector('[data-phone-frame]').style.transform
  }))
  assert.equal(Number(hidden.scale), 390 / 398, 'a hidden room keeps the last scale')
  assert.doesNotMatch(hidden.transform, /NaN|Infinity|scale\(0\)/)
  await show(page, { room: 430 })
  assertLive(await measure(page), 430)
})

test('screenshot mode: the picture fills the same 390-px content box, scaled with the bezel', async () => {
  await show(page, { room: 390, mode: 'shot', props: props() })
  await page.click('button:has-text("template.viewShot")')
  await page.waitForFunction(() => document.querySelector('#dialog img[alt^="Preview"]')?.complete)
  await settle(page)
  const m = await measure(page)
  assertPhone(m, 390)
  const s = m.drawnScale
  assert.equal(m.imgOffsetWidth, 390)
  assert.ok(Math.abs(m.img.left - (m.frame.left + BEZEL * s)) <= TOL)
  assert.ok(Math.abs(m.img.width - 390 * s) <= TOL)
  // And back to live, around the same frame.
  await page.click('button:has-text("template.viewLive")')
  await waitLive()
  await show(page, { room: 390 })
  assertLive(await measure(page), 390)
})

test('a card with no live demo opens on its picture in the same phone', async () => {
  await show(page, { room: 1440, mode: 'shot', props: props({}, { demo: false }) })
  await page.waitForFunction(() => document.querySelector('#dialog img[alt^="Preview"]')?.complete)
  await settle(page)
  const m = await measure(page)
  assert.equal(m.iframe, null)
  assertPhone(m, 1440)
  assert.equal(m.imgOffsetWidth, 390)
})

test('desktop is unchanged: the frame fills the room, the page is as wide as the frame', async () => {
  await show(page, { room: 1440, props: props({ device: 'desktop' }) })
  await waitLive()
  const m = await measure(page)
  assert.equal(await page.evaluate(() => document.querySelector('[data-phone-room]')), null)
  assert.equal(m.drawnScale, 1)
  assert.ok(Math.abs(m.frame.width - m.room.width) <= TOL && Math.abs(m.frame.height - m.room.height) <= TOL)
  // A 1-px border each side, the page inside it.
  assert.ok(Math.abs(m.iframe.width - (m.room.width - 2)) <= TOL)
  assert.equal(m.inside.innerWidth, Math.round(m.room.width - 2))
  assert.deepEqual(m.overflow, { room: 0, dialog: 0, document: 0 })
})

test('the room observer goes with the phone: device switch and unmount', async () => {
  await show(page, { room: 430, props: props() })
  await waitLive()
  assert.equal(await page.evaluate(() => window.__observing), 1, 'one room, one observation')
  await show(page, { room: 430, props: props({ device: 'desktop' }) })
  assert.equal(await page.evaluate(() => window.__observing), 0, 'desktop keeps no phone observer')
  await show(page, { room: 430, props: props() })
  await waitLive()
  assert.equal(await page.evaluate(() => window.__observing), 1)
  assertLive(await measure(page), 430)
  await page.evaluate(() => window.__render(null))
  assert.equal(await page.evaluate(() => window.__observing), 0, 'unmount disconnects')
})

test('frame height: only a finite, positive number from this frame is used', async () => {
  await show(page, { room: 430, props: props({}, { badHeights: true }) })
  await waitLive()
  // The fixture posted NaN, -5, 0, Infinity, '900' and null: none of them is a height.
  assert.equal((await measure(page)).iframeHeight, '760px')
  // Same origin, wrong window: the host page itself is not the frame.
  await page.evaluate(() => window.postMessage({ type: 'tracy:frame-height', height: 500 }, '*'))
  await settle(page)
  assert.equal((await measure(page)).iframeHeight, '760px')
  // The frame itself, with a real height, is heard.
  await page.evaluate(() =>
    document
      .querySelector('#dialog iframe')
      .contentWindow.eval("parent.postMessage({ type: 'tracy:frame-height', height: 500 }, '*')")
  )
  await page.waitForFunction(() => document.querySelector('#dialog iframe').style.height === '500px')
  assertLive(await measure(page), 430)
})
