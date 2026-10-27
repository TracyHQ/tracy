/** The room the Help strip of the start screen gives back (`src/client/dock-fit.ts`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dockLimit, fitDock, MIN_DOCK_PX } from '../src/client/dock-fit.ts'

test('dock-fit: a strip that fits is left to the stylesheet', () => {
  assert.equal(dockLimit(360, 0), null)
  assert.equal(dockLimit(360, -40), null)
  assert.equal(dockLimit(360, Number.NaN), null)
})

test('dock-fit: the strip gives back exactly what the column overflows by', () => {
  // 800 px window, two answers: the strip was 360 px and the chat box sat 143 px past the scroll box.
  assert.equal(dockLimit(360, 143), 217)
  assert.equal(dockLimit(405, 88), 317)
  assert.equal(dockLimit(300.9, 100.2), 200)
})

test('dock-fit: the strip never shrinks below a readable window', () => {
  assert.equal(dockLimit(270, 253), MIN_DOCK_PX)
  assert.equal(dockLimit(120, 500), MIN_DOCK_PX)
})

/** A strip and a scroller as the browser reports them; only what `fitDock` reads exists. */
function fakeColumn({ dockHeightByCap, scrollHeight, clientHeight }) {
  const style = {
    maxHeight: '',
    removeProperty(name) {
      if (name === 'max-height') this.maxHeight = ''
    }
  }
  const scroller = { parentElement: null, __scroller: true }
  const dock = {
    style,
    parentElement: scroller,
    get offsetHeight() {
      return dockHeightByCap(this.style.maxHeight)
    }
  }
  Object.defineProperty(scroller, 'scrollHeight', { get: () => scrollHeight(dock.offsetHeight) })
  Object.defineProperty(scroller, 'clientHeight', { get: () => clientHeight })
  return { dock, scroller }
}

test('dock-fit: fitDock clears the old cap, measures with the natural height, then sets the new one', () => {
  globalThis.getComputedStyle = (el) => ({ overflowY: el.__scroller ? 'auto' : 'visible' })
  try {
    // Other content is 583 px; the box is 800 px; the strip would be 360 px tall uncapped.
    const { dock } = fakeColumn({
      dockHeightByCap: (cap) => (cap === '' ? 360 : Math.min(360, Number.parseInt(cap, 10))),
      scrollHeight: (dockHeight) => Math.max(800, 583 + dockHeight),
      clientHeight: 800
    })
    dock.style.maxHeight = '100px' // a stale cap from a taller window
    fitDock(dock)
    assert.equal(dock.style.maxHeight, '217px')
    // The window grows: the old cap is dropped and nothing overflows any more.
    const roomy = fakeColumn({
      dockHeightByCap: (cap) => (cap === '' ? 360 : Math.min(360, Number.parseInt(cap, 10))),
      scrollHeight: (dockHeight) => Math.max(1000, 583 + dockHeight),
      clientHeight: 1000
    })
    roomy.dock.style.maxHeight = '217px'
    fitDock(roomy.dock)
    assert.equal(roomy.dock.style.maxHeight, '')
  } finally {
    delete globalThis.getComputedStyle
  }
})

/**
 * A strip that scrolls inside a column, the way a browser lays it out: its content is `content` px,
 * its box is the content up to the cap, and laying it out (reading `offsetHeight`) clamps `scrollTop`
 * into what the box can scroll at that moment — so a measure without the cap sets it to 0 and putting
 * the cap back does not bring it back.
 */
function scrollingColumn({ content, other, box }) {
  let stored = 0
  const style = {
    maxHeight: '',
    removeProperty(name) {
      if (name === 'max-height') this.maxHeight = ''
    }
  }
  const cap = () => (style.maxHeight === '' ? Number.POSITIVE_INFINITY : Number.parseInt(style.maxHeight, 10))
  const room = { box }
  const scroller = { parentElement: null, __scroller: true }
  const dock = {
    style,
    parentElement: scroller,
    get clientHeight() {
      return Math.min(content, cap())
    },
    get offsetHeight() {
      stored = Math.min(stored, content - this.clientHeight)
      return this.clientHeight
    },
    get scrollHeight() {
      return content
    },
    get scrollTop() {
      return Math.max(0, Math.min(stored, content - this.clientHeight))
    },
    set scrollTop(value) {
      stored = Math.max(0, Math.min(value, content - this.clientHeight))
    }
  }
  Object.defineProperty(scroller, 'scrollHeight', {
    get: () => Math.max(room.box, other + dock.offsetHeight)
  })
  Object.defineProperty(scroller, 'clientHeight', { get: () => room.box })
  return { dock, room }
}

test('dock-fit: fitDock keeps a strip at its end at its end, and any other strip where it was (10/10/2026)', () => {
  globalThis.getComputedStyle = (el) => ({ overflowY: el.__scroller ? 'auto' : 'visible' })
  try {
    // 600 px of answers under 400 px of heading and chat box, in a 600 px column: the strip gets 200 px.
    const { dock, room } = scrollingColumn({ content: 600, other: 400, box: 600 })
    // A strip with no cap yet shows everything, so it ends at its bottom once capped: the newest row.
    fitDock(dock)
    assert.equal(dock.style.maxHeight, '200px')
    assert.equal(dock.scrollTop, 400)
    // At the bottom, the window shrinks by 20 px: still at the bottom (it was sent to 0 before).
    room.box = 580
    fitDock(dock)
    assert.equal(dock.style.maxHeight, '180px')
    assert.equal(dock.scrollTop, 420)
    // Scrolled up to read: the window grows back and the rows being read stay where they were.
    dock.scrollTop = 120
    room.box = 600
    fitDock(dock)
    assert.equal(dock.style.maxHeight, '200px')
    assert.equal(dock.scrollTop, 120)
  } finally {
    delete globalThis.getComputedStyle
  }
})
