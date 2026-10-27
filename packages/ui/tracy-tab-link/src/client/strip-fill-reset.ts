/**
 * A double-click on the empty gap of the right panel's tab strip resets the panel to the width its
 * tab declares — the same reset a double-click on the divider does (Akemi, 30/09: the divider is an
 * 8px handle nobody finds; the strip gap is big and obvious).
 *
 * dsh keeps that reset inside its frame (`ui-layout` AppFrame: `resetChat` plus forgetting the
 * saved width) and exposes it on nothing but the divider itself: `ctx.layout` has no reset call.
 * So this module hands the gesture to the divider — it dispatches the divider's own `dblclick`,
 * and the frame runs exactly the code a person's double-click on it runs. No second copy of the
 * width rule, nothing to drift.
 *
 * What counts as the gap: the strip row itself or dockkit's fill. The fill is a zero-height flex
 * item (the row centres its items), so a press in the gap lands on the row; chips, the `+`, the
 * split control and the embedder's chrome are children of the row and never match.
 *
 * Only inside the right panel (`ui-sidebar-right` marks it), and only while the divider exists:
 * fullscreen hides it, and a reset there would change nothing anyone sees.
 *
 * macOS desktop app: the strip row is a window-drag region there (`data-window-drag`), and
 * Electron hands presses in a drag region to the window, not the page — so there this gesture
 * never arrives and a double-click keeps zooming the window, as before. The web is unaffected.
 *
 * Every marker is a data attribute or ARIA role, never a hashed class (DESIGN.md §3).
 */

/** The right panel box `ui-sidebar-right` draws, in both its presentations. */
const PANEL = '[data-sidebar-right-panel]'
/** dockkit's tab strip row, and the flex item that takes its free space. */
const STRIP = '[data-dockkit-strip]'
const FILL = '[data-dockkit-strip-fill]'
/** The frame's divider between the Conversation and the right panel. */
const DIVIDER = '[role="separator"][data-side="rightbar"]'

/** @returns whether a press on this target is a press on the strip's empty gap in the right panel. */
export function isStripGap(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (!target.matches(STRIP) && !target.matches(FILL)) return false
  return target.closest(PANEL) !== null
}

/**
 * Install the gesture on a document.
 * @param doc - the page's document.
 * @returns a disposer that removes both listeners.
 */
export function installStripFillReset(doc: Document): () => void {
  // A double-click selects the nearest word (the tab title) before `dblclick` fires; cancelling
  // the second press's default is what stops it. Capture phase: nothing below may undo it.
  const onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0 && event.detail >= 2 && isStripGap(event.target)) event.preventDefault()
  }
  const onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0 || !isStripGap(event.target)) return
    const divider = doc.querySelector(DIVIDER)
    if (divider === null) return
    divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
  }
  doc.addEventListener('mousedown', onMouseDown, true)
  doc.addEventListener('dblclick', onDoubleClick)
  return () => {
    doc.removeEventListener('mousedown', onMouseDown, true)
    doc.removeEventListener('dblclick', onDoubleClick)
  }
}
