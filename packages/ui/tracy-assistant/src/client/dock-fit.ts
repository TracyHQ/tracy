/**
 * Keep the chat box on screen when the Help strip of the start screen grows.
 *
 * The strip (`.tv-help-dock`) sits above the chat box on a blank session and is as tall as its rows.
 * dsh's start screen is a column that does not shrink, so a strip that takes its full height pushes
 * the chat box below the window edge: on an 800 px high window with two answers the box sat 44 px
 * under the edge (measured 08/10/2026, when the heading and the four cards still stood above it).
 * Since the cards give way once anything is sent (@tracy/dsh-chat-input) the strip has no height
 * cap of its own: this measure is the only thing that bounds it.
 *
 * The room left for the strip is not a number to guess (a fifth card, a longer heading or another
 * language would move it), so it is measured: how far the nearest scrolling ancestor overflows is
 * how much the strip must give back. The strip scrolls inside itself, so nothing is lost.
 */

/** The strip never gets shorter than this, so it stays a readable window onto the newest answer. */
export const MIN_DOCK_PX = 96

/**
 * The `max-height` the strip needs, in px, or `null` when it fits as it is.
 * @param dockHeight - the strip's height with the stylesheet's own cap.
 * @param overflow - how far the scrolling ancestor's content exceeds its box with the strip as it is.
 */
export function dockLimit(dockHeight: number, overflow: number): number | null {
  if (!(overflow > 0)) return null
  return Math.max(MIN_DOCK_PX, Math.floor(dockHeight - overflow))
}

/** The nearest ancestor that scrolls vertically, or `null` when nothing above the strip does. */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let up = el.parentElement; up !== null; up = up.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(up).overflowY)) return up
  }
  return null
}

/**
 * Size the strip for the room it has now: drop the last limit, look at the overflow, set the new one.
 * Runs in one task, so nothing is painted between the two states.
 *
 * The reader keeps their place. Measuring without a cap leaves nothing to scroll, so the browser sets
 * the strip's `scrollTop` to 0, and putting the cap back does not bring it back. Until 10/10/2026
 * nothing did: with two answers at 1000x600 the strip opened at its top with the newest answer cut
 * off, a strip scrolled to its bottom jumped back to the top when the window shrank by 20 px, and on a
 * phone a bare /help added its four questions below the strip's edge, because the jump's scroll event
 * had also marked the reader as scrolled up (measured on the stand 09/10/2026). So a strip that showed
 * its end before the measure shows its end after it — a strip with no cap yet shows everything, so it
 * opens on its newest row — and any other strip gets its `scrollTop` back, as the browser keeps it when
 * a box changes height: the rows being read stay put.
 */
export function fitDock(dock: HTMLElement): void {
  const top = dock.scrollTop
  const atEnd = dock.scrollHeight - top - dock.clientHeight <= 1
  dock.style.removeProperty('max-height')
  const scroller = scrollerOf(dock)
  if (scroller !== null) {
    const limit = dockLimit(dock.offsetHeight, scroller.scrollHeight - scroller.clientHeight)
    if (limit !== null) dock.style.maxHeight = `${limit}px`
  }
  dock.scrollTop = atEnd ? dock.scrollHeight : top
}

/**
 * Fit the strip now and again whenever the room changes (the window, the sidebar, a card that loads
 * late). Returns the stop function.
 */
export function keepDockFitted(dock: HTMLElement): () => void {
  fitDock(dock)
  const scroller = scrollerOf(dock)
  if (scroller === null || typeof ResizeObserver === 'undefined') return () => {}
  let frame = 0
  const refit = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => fitDock(dock))
  }
  const watch = new ResizeObserver(refit)
  watch.observe(scroller)
  // The strip's own column grows with what is in it, which the scroller's box does not show.
  if (dock.parentElement !== null) watch.observe(dock.parentElement)
  return () => {
    cancelAnimationFrame(frame)
    watch.disconnect()
  }
}
