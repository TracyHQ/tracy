/**
 * Keep the row the person is looking at where it is while rows are added above it — a refresh of
 * Site changes puts the newest events at the top of a list that may be scrolled.
 *
 * The browser's own scroll anchoring does not do it here: measured 03/10 in the e2e fixture, the
 * row moved down by the new row's height (the tab's loading bar changing in the same commit is
 * enough to suppress anchoring). At the very top nothing is held: there the new row is the news.
 */

/** Rows of the Site changes list, by the attribute that names each. */
const ROW_ATTRS = ['data-event', 'data-backup', 'data-backup-divider'] as const

/** The nearest ancestor that scrolls vertically, or null. */
function scrollerOf(el: Element): HTMLElement | null {
  for (let at = el.parentElement; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight) return at
  }
  return null
}

/**
 * Note which row of `list` is first in view and where; the returned function, called once the new
 * rows are laid out (a layout effect), scrolls so that row is back where it was. Null when there is
 * nothing to hold: no list, no scroller, or a list scrolled to its top.
 */
export function holdScroll(list: Element | null): (() => void) | null {
  if (list === null) return null
  const scroller = scrollerOf(list)
  if (scroller === null || scroller.scrollTop <= 0) return null
  const top = scroller.getBoundingClientRect().top
  const rows = list.querySelectorAll<HTMLElement>(ROW_ATTRS.map((a) => `[${a}]`).join(','))
  const anchor = Array.from(rows).find((row) => row.getBoundingClientRect().bottom > top)
  if (anchor === undefined) return null
  const attr = ROW_ATTRS.find((a) => anchor.hasAttribute(a))
  if (attr === undefined) return null
  const selector = `[${attr}="${CSS.escape(anchor.getAttribute(attr) ?? '')}"]`
  const was = anchor.getBoundingClientRect().top
  return () => {
    const now = list.querySelector<HTMLElement>(selector)
    if (now === null) return
    const moved = now.getBoundingClientRect().top - was
    if (moved !== 0) scroller.scrollTop += moved
  }
}
