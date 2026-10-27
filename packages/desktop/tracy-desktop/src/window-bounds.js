/**
 * The window comes back where the person left it: position and size, plus maximized and fullscreen
 * as states on top of them (Cherry Studio does the same; tasks/todo-desktop-window-shell.md, step 2).
 *
 * WHAT IS KEPT. The NORMAL bounds (`getNormalBounds()`: what the window returns to when it leaves
 * maximized or fullscreen) and the two states separately — never the maximized rectangle, and never
 * "minimized": a window that reopens minimized looks like an app that did not start.
 *
 * WHERE IT COMES BACK. Displays change between runs (a monitor unplugged, a laptop lid closed): the
 * saved place goes to the display holding the largest part of it, or the first display when none
 * does, and is clamped WHOLE into that display's work area, so the title strip and the traffic
 * lights are always reachable — overlapping by a few pixels is not enough. Coordinates are DIP, as
 * Electron's `screen` reports them; negative ones are a display left of or above the main one.
 *
 * HOW IT IS WRITTEN. After a quiet period (moving a window fires dozens of events), to a temporary
 * file renamed over the old one, so a crash mid-write never leaves half a file. A file that does not
 * parse is treated as nothing saved.
 *
 * `placeWindow`, `readSaved` and `createSaver` are pure or file-only, so test/window-bounds.test.mjs
 * holds them; `rememberWindow` is the Electron glue.
 */
const fs = require('node:fs')

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{ bounds: Rect, maximized: boolean, fullscreen: boolean }} SavedWindow
 * @typedef {{ workArea: Rect }} DisplayLike
 * @typedef {{ width: number, height: number, minWidth: number, minHeight: number }} Limits
 * @typedef {{ bounds: Rect | { width: number, height: number }, maximized: boolean, fullscreen: boolean }} Placement
 */

/**
 * The window's default and minimum size. Big enough for the first-run screen, a panel of about
 * 1100x760 (tasks/todo-desktop-onboard-agent.md §3.1): a saved place smaller than the minimum comes
 * back at the minimum, and every size is still clamped to the display's work area (`placeWindow`).
 * @type {Readonly<Limits>}
 */
const WINDOW_LIMITS = Object.freeze({ width: 1280, height: 860, minWidth: 1024, minHeight: 700 })

/** @param {unknown} value */
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * @param {unknown} saved
 * @returns {SavedWindow | undefined} the saved state when it has the right shape.
 */
function validSaved(saved) {
  if (saved === null || typeof saved !== 'object') return undefined
  const { bounds, maximized, fullscreen } = /** @type {Record<string, any>} */ (saved)
  if (bounds === null || typeof bounds !== 'object') return undefined
  const { x, y, width, height } = bounds
  if (![x, y, width, height].every(finite) || width <= 0 || height <= 0) return undefined
  return { bounds: { x, y, width, height }, maximized: maximized === true, fullscreen: fullscreen === true }
}

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {number} the area they share.
 */
function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(Math.max(value, low), high)

/**
 * Where the window opens.
 * @param {unknown} saved - what `readSaved` returned (anything: it is checked here).
 * @param {readonly DisplayLike[]} displays - `screen.getAllDisplays()`, the main display first.
 * @param {Limits} limits - the window's default size and minimum size.
 * @returns {Placement} bounds without x/y when the system should place a default-size window.
 */
function placeWindow(saved, displays, limits) {
  const fallback = {
    bounds: { width: limits.width, height: limits.height },
    maximized: false,
    fullscreen: false
  }
  const state = validSaved(saved)
  if (state === undefined || !Array.isArray(displays) || displays.length === 0) return fallback
  let best = displays[0]
  let bestShare = 0
  for (const display of displays) {
    const share = overlap(state.bounds, display.workArea)
    if (share > bestShare) {
      best = display
      bestShare = share
    }
  }
  const area = best.workArea
  // Shrink to the work area; keep the minimum unless the work area itself is smaller.
  const width = clamp(state.bounds.width, Math.min(limits.minWidth, area.width), area.width)
  const height = clamp(state.bounds.height, Math.min(limits.minHeight, area.height), area.height)
  const x = clamp(state.bounds.x, area.x, area.x + area.width - width)
  const y = clamp(state.bounds.y, area.y, area.y + area.height - height)
  return { bounds: { x, y, width, height }, maximized: state.maximized, fullscreen: state.fullscreen }
}

/** How far down and right a second window opens from the window in use. */
const CASCADE_STEP = 32

/**
 * Where a SECOND window opens (tasks/todo-desktop-multi-window.md): next to the window in use, one
 * step down and right, at its size, kept whole on the display that holds most of it. Nothing is
 * remembered for second windows; the main window alone comes back where it was (`rememberWindow`).
 * @param {Rect | undefined} from - the window in use (`getNormalBounds()`), if any.
 * @param {readonly DisplayLike[]} displays - `screen.getAllDisplays()`.
 * @param {Limits} limits
 * @returns {Partial<Rect>} bounds; without x/y the system places a default-size window.
 */
function cascadeWindow(from, displays, limits) {
  if (from === undefined) return { width: limits.width, height: limits.height }
  const moved = { ...from, x: from.x + CASCADE_STEP, y: from.y + CASCADE_STEP }
  return placeWindow({ bounds: moved, maximized: false, fullscreen: false }, displays, limits).bounds
}

/**
 * @param {string} file
 * @returns {unknown} the parsed file, or undefined when it is missing or does not parse.
 */
function readSaved(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * A writer that waits for `quietMs` without changes, then writes the last state atomically.
 * @param {string} file
 * @param {number} quietMs
 * @param {(fn: () => void, ms: number) => () => void} [setTimer]
 */
function createSaver(file, quietMs, setTimer = defaultTimer) {
  /** @type {SavedWindow | undefined} */
  let next
  let cancel = () => {}
  const write = () => {
    cancel()
    cancel = () => {}
    if (next === undefined) return
    const body = `${JSON.stringify(next)}\n`
    next = undefined
    try {
      const temporary = `${file}.tmp`
      fs.writeFileSync(temporary, body)
      fs.renameSync(temporary, file)
    } catch (error) {
      process.stderr.write(`tracy-desktop: could not save the window's place: ${error.message}\n`)
    }
  }
  return {
    /** @param {SavedWindow} state */
    save(state) {
      next = state
      cancel()
      cancel = setTimer(write, quietMs)
    },
    /** Write now (the window is closing). */
    flush: write
  }
}

/** @param {() => void} fn @param {number} ms */
function defaultTimer(fn, ms) {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

/**
 * Electron glue: open-time options, and keeping the file up to date while the window lives.
 * @param {string} file - `<userData>/window-state.json`.
 * @param {Limits} limits
 * @param {{ getAllDisplays(): DisplayLike[], getPrimaryDisplay(): DisplayLike, on(event: string, fn: () => void): void, removeListener(event: string, fn: () => void): void }} screen
 */
function rememberWindow(file, limits, screen) {
  const displays = () => {
    const primary = screen.getPrimaryDisplay()
    return [primary, ...screen.getAllDisplays().filter((d) => d !== primary && d.id !== primary.id)]
  }
  const placement = placeWindow(readSaved(file), displays(), limits)
  const saver = createSaver(file, 500)
  return {
    /** Spread into `new BrowserWindow(...)`. */
    options: placement.bounds,
    /**
     * Restore the states and follow the window from now on.
     * @param {import('electron').BrowserWindow} window
     */
    attach(window) {
      if (placement.maximized) window.maximize()
      if (placement.fullscreen) window.setFullScreen(true)
      const capture = () => {
        if (window.isDestroyed() || window.isMinimized()) return
        saver.save({
          bounds: window.getNormalBounds(),
          maximized: window.isMaximized(),
          fullscreen: window.isFullScreen()
        })
      }
      for (const event of [
        'resize',
        'move',
        'maximize',
        'unmaximize',
        'enter-full-screen',
        'leave-full-screen'
      ])
        window.on(/** @type {any} */ (event), capture)
      // A display unplugged or rearranged while the app runs: bring the window back onto one.
      const replace = () => {
        if (window.isDestroyed() || window.isFullScreen() || window.isMaximized()) return
        const current = { bounds: window.getNormalBounds(), maximized: false, fullscreen: false }
        const { bounds } = placeWindow(current, displays(), limits)
        const now = window.getNormalBounds()
        if (
          'x' in bounds &&
          (bounds.x !== now.x ||
            bounds.y !== now.y ||
            bounds.width !== now.width ||
            bounds.height !== now.height)
        )
          window.setBounds(bounds)
      }
      screen.on('display-removed', replace)
      screen.on('display-metrics-changed', replace)
      window.on('close', () => {
        capture()
        saver.flush()
      })
      window.on('closed', () => {
        screen.removeListener('display-removed', replace)
        screen.removeListener('display-metrics-changed', replace)
      })
    }
  }
}

module.exports = { WINDOW_LIMITS, cascadeWindow, placeWindow, readSaved, createSaver, rememberWindow }
