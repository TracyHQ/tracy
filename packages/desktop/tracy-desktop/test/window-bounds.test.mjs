/**
 * The window comes back where it was (`src/window-bounds.js`): which display, clamped so the title
 * strip and the traffic lights stay reachable, never minimized, and a broken file is no file.
 *
 *   node --test packages/desktop/tracy-desktop/test/window-bounds.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

/** A temp folder removed when the test ends, pass or fail. */
function tempDir(t, prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const require = createRequire(import.meta.url)
const { cascadeWindow, placeWindow, readSaved, createSaver } = require('../src/window-bounds.js')

const LIMITS = { width: 1280, height: 860, minWidth: 900, minHeight: 600 }
// A 1512x982 laptop (menu bar 33 px) and a 2560x1440 display to its right; DIP, as Electron reports.
const LAPTOP = { id: 1, workArea: { x: 0, y: 33, width: 1512, height: 949 } }
const RIGHT = { id: 2, workArea: { x: 1512, y: -200, width: 2560, height: 1415 } }

test('nothing saved: the default size, placed by the system', () => {
  assert.deepEqual(placeWindow(undefined, [LAPTOP], LIMITS), {
    bounds: { width: 1280, height: 860 },
    maximized: false,
    fullscreen: false
  })
})

test('a saved place on a display that is still there comes back as it was, negative coordinates too', () => {
  const saved = {
    bounds: { x: 1700, y: -150, width: 1400, height: 1000 },
    maximized: false,
    fullscreen: false
  }
  assert.deepEqual(placeWindow(saved, [LAPTOP, RIGHT], LIMITS), saved)
})

test('maximized and fullscreen come back as states over the normal bounds', () => {
  const saved = { bounds: { x: 100, y: 100, width: 1000, height: 700 }, maximized: true, fullscreen: true }
  assert.deepEqual(placeWindow(saved, [LAPTOP], LIMITS), saved)
})

test('the display it was on is gone: moved onto a display that is, whole', () => {
  const saved = { bounds: { x: 2000, y: 100, width: 1400, height: 900 }, maximized: false, fullscreen: false }
  const { bounds } = placeWindow(saved, [LAPTOP], LIMITS)
  assert.deepEqual(bounds, { x: 112, y: 82, width: 1400, height: 900 })
})

test('mostly off a display: pulled back so the title strip and traffic lights can be reached', () => {
  const saved = {
    bounds: { x: -1300, y: 900, width: 1300, height: 800 },
    maximized: false,
    fullscreen: false
  }
  const { bounds } = placeWindow(saved, [LAPTOP], LIMITS)
  assert.deepEqual(bounds, { x: 0, y: 182, width: 1300, height: 800 })
})

test('the display with the largest share of the window wins', () => {
  // 100 px on the laptop, 1300 px on the right display.
  const saved = { bounds: { x: 1412, y: 100, width: 1400, height: 900 }, maximized: false, fullscreen: false }
  const { bounds } = placeWindow(saved, [LAPTOP, RIGHT], LIMITS)
  assert.equal(bounds.x, 1512)
})

test('bigger than the display: shrunk to it, never under the minimum unless the display itself is smaller', () => {
  const saved = { bounds: { x: 0, y: 0, width: 3000, height: 2000 }, maximized: false, fullscreen: false }
  assert.deepEqual(placeWindow(saved, [LAPTOP], LIMITS).bounds, { x: 0, y: 33, width: 1512, height: 949 })
  const tiny = { id: 3, workArea: { x: 0, y: 25, width: 800, height: 575 } }
  assert.deepEqual(placeWindow(saved, [tiny], LIMITS).bounds, { x: 0, y: 25, width: 800, height: 575 })
})

test('a minimized window comes back as a normal one; nonsense comes back as the default', () => {
  const minimized = {
    bounds: { x: 10, y: 40, width: 1000, height: 700 },
    maximized: false,
    fullscreen: false,
    minimized: true
  }
  assert.deepEqual(placeWindow(minimized, [LAPTOP], LIMITS), {
    bounds: { x: 10, y: 40, width: 1000, height: 700 },
    maximized: false,
    fullscreen: false
  })
  for (const bad of [
    null,
    42,
    { bounds: { x: 'a', y: 0, width: 10, height: 10 } },
    { bounds: { x: 0, y: 0, width: -5, height: 10 } },
    { bounds: { x: Infinity, y: 0, width: 1000, height: 700 } }
  ])
    assert.deepEqual(
      placeWindow(bad, [LAPTOP], LIMITS),
      { bounds: { width: 1280, height: 860 }, maximized: false, fullscreen: false },
      JSON.stringify(bad)
    )
})

test('no display reported (should not happen): the default', () => {
  const saved = { bounds: { x: 10, y: 40, width: 1000, height: 700 }, maximized: false, fullscreen: false }
  assert.deepEqual(placeWindow(saved, [], LIMITS).bounds, { width: 1280, height: 860 })
})

test('readSaved: a missing or corrupt file is nothing saved', (t) => {
  const dir = tempDir(t, 'tracy-bounds-')
  assert.equal(readSaved(path.join(dir, 'missing.json')), undefined)
  writeFileSync(path.join(dir, 'bad.json'), '{"bounds": {"x": 1,')
  assert.equal(readSaved(path.join(dir, 'bad.json')), undefined)
  writeFileSync(
    path.join(dir, 'ok.json'),
    '{"bounds":{"x":1,"y":2,"width":1000,"height":700},"maximized":false,"fullscreen":false}'
  )
  assert.deepEqual(readSaved(path.join(dir, 'ok.json')).bounds, { x: 1, y: 2, width: 1000, height: 700 })
})

test('createSaver: many changes write once after the quiet period, atomically; flush writes at once', (t) => {
  const dir = tempDir(t, 'tracy-bounds-')
  const file = path.join(dir, 'window-state.json')
  const timers = []
  const saver = createSaver(file, 400, (fn) => {
    const timer = { fn, cancelled: false }
    timers.push(timer)
    return () => (timer.cancelled = true)
  })
  for (const x of [1, 2, 3])
    saver.save({ bounds: { x, y: 40, width: 1000, height: 700 }, maximized: false, fullscreen: false })
  assert.equal(readdirSync(dir).length, 0)
  for (const timer of timers) if (!timer.cancelled) timer.fn()
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).bounds.x, 3)
  assert.deepEqual(readdirSync(dir), ['window-state.json'], 'no temporary file left behind')
  saver.save({ bounds: { x: 9, y: 40, width: 1000, height: 700 }, maximized: true, fullscreen: false })
  saver.flush()
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).maximized, true)
})

// A second window opens next to the one in use, a step down and right, same size, on the same display.

test('a second window opens 32 px down and right of the window in use, at its size', () => {
  assert.deepEqual(cascadeWindow({ x: 100, y: 80, width: 1200, height: 800 }, [LAPTOP, RIGHT], LIMITS), {
    x: 132,
    y: 112,
    width: 1200,
    height: 800
  })
})

test('near the edge of the display the second window stays whole on it', () => {
  assert.deepEqual(cascadeWindow({ x: 300, y: 170, width: 1200, height: 800 }, [LAPTOP, RIGHT], LIMITS), {
    x: 312,
    y: 182,
    width: 1200,
    height: 800
  })
  // A window filling the work area: same place and size, nothing hangs off the display.
  assert.deepEqual(cascadeWindow(LAPTOP.workArea, [LAPTOP, RIGHT], LIMITS), { ...LAPTOP.workArea })
})

test('the second window opens on the display holding most of the window in use', () => {
  const placed = cascadeWindow({ x: 1400, y: 0, width: 1300, height: 900 }, [LAPTOP, RIGHT], LIMITS)
  assert.equal(placed.x >= RIGHT.workArea.x, true)
  assert.deepEqual(placed, { x: 1512, y: 32, width: 1300, height: 900 })
})

test('with no window in use the second window takes the default size and the system places it', () => {
  assert.deepEqual(cascadeWindow(undefined, [LAPTOP], LIMITS), { width: 1280, height: 860 })
})

test('the window opens big enough for the first-run screen (a ~1100x760 panel) and never shrinks below 1024x700', () => {
  const { WINDOW_LIMITS } = require('../src/window-bounds.js')
  assert.ok(WINDOW_LIMITS.width >= 1280 && WINDOW_LIMITS.height >= 840, JSON.stringify(WINDOW_LIMITS))
  assert.equal(WINDOW_LIMITS.minWidth, 1024)
  assert.equal(WINDOW_LIMITS.minHeight, 700)
  assert.deepEqual(placeWindow(undefined, [LAPTOP], WINDOW_LIMITS).bounds, {
    width: WINDOW_LIMITS.width,
    height: WINDOW_LIMITS.height
  })
})

test('a window saved smaller than the minimum comes back at the minimum, within the work area', () => {
  const { WINDOW_LIMITS } = require('../src/window-bounds.js')
  const saved = { bounds: { x: 100, y: 100, width: 900, height: 600 }, maximized: false, fullscreen: false }
  assert.deepEqual(placeWindow(saved, [LAPTOP], WINDOW_LIMITS).bounds, {
    x: 100,
    y: 100,
    width: 1024,
    height: 700
  })
  // A screen smaller than the minimum: the work area wins.
  const tiny = { id: 3, workArea: { x: 0, y: 25, width: 1000, height: 650 } }
  assert.deepEqual(placeWindow(saved, [tiny], WINDOW_LIMITS).bounds, {
    x: 0,
    y: 25,
    width: 1000,
    height: 650
  })
})
