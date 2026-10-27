/**
 * Keeps the site chip from pushing the header's own controls out of the column.
 *
 * dsh lays its header out as two grid columns: the leading seat (the site chip) at its natural width,
 * and the title row in a minmax(0, 1fr) column. The title row is an inline-size container, so the
 * grid sees no width it needs: on a narrow Conversation column the chip keeps its width and the title
 * row's controls (the job badge, the Chat/Voice button, More actions) run past the column's right
 * edge (dev 21/10/2026: More actions gone from 270px down). This measures what the title row's
 * controls need and writes the rest of the header as the chip's ceiling, --tracy-site-chip-max on the
 * chip, so the chip's name truncates first and every control stays in the column.
 */

/** The narrowest the chip gets: its logo, a few letters and the chevron. */
const CHIP_FLOOR = 56

const px = (value: string): number => Number.parseFloat(value) || 0

/**
 * The width an element's content needs, without the free space a growing flex item takes.
 * @param el - a title-row piece.
 * @param sum - add up the pieces inside even when the element does not grow (the title row itself,
 *   whose box is whatever the grid gives it).
 * @returns the width in px, margins excluded.
 */
function need(el: HTMLElement, sum = false): number {
  const style = getComputedStyle(el)
  if (style.display === 'none') return 0
  if (sum || style.display === 'contents' || (style.display === 'flex' && px(style.flexGrow) > 0)) {
    const kids = [...el.children].filter((k): k is HTMLElement => k instanceof HTMLElement)
    const shown = kids.filter((k) => getComputedStyle(k).display !== 'none')
    const gap = style.display === 'flex' ? px(style.columnGap) * Math.max(0, shown.length - 1) : 0
    return shown.reduce((total, k) => total + outer(k), gap) + px(style.paddingLeft) + px(style.paddingRight)
  }
  return el.getBoundingClientRect().width
}

/**
 * @returns a piece's need plus its horizontal margins (dsh's corner seat has a negative one). A flex
 *   item that may shrink to nothing (min-width 0, the model chip that truncates and then hides) needs
 *   no room: it gives way before the site chip does.
 */
function outer(el: HTMLElement): number {
  const style = getComputedStyle(el)
  if (style.display === 'none') return 0
  const parent = el.parentElement ? getComputedStyle(el.parentElement).display : ''
  if (parent === 'flex' && px(style.flexGrow) === 0 && px(style.flexShrink) > 0 && style.minWidth === '0px')
    return 0
  return need(el) + px(style.marginLeft) + px(style.marginRight)
}

/**
 * Watch the header the chip sits in and keep the chip's ceiling current.
 * @param chip - the chip's button.
 * @returns the disposer.
 */
export function watchHeaderRoom(chip: HTMLElement): () => void {
  const header = chip.closest('header')
  if (!header || typeof ResizeObserver === 'undefined') return () => {}
  let frame = 0
  const place = () => {
    frame = 0
    const row = header.querySelector<HTMLElement>('[class*="_titleRow"]')
    if (!row) return chip.style.removeProperty('--tracy-site-chip-max')
    const style = getComputedStyle(header)
    const content = header.clientWidth - px(style.paddingLeft) - px(style.paddingRight)
    // The chip's own -8px left margin lets it reach 8px past the leading seat.
    const room = Math.max(CHIP_FLOOR, Math.floor(content - need(row, true) + 8))
    chip.style.setProperty('--tracy-site-chip-max', `${room}px`)
  }
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(place)
  }
  const sizes = new ResizeObserver(schedule)
  const watch = () => {
    sizes.observe(header)
    for (const el of header.querySelectorAll<HTMLElement>('[class*="_titleRow"], [class*="_titleRow"] *'))
      sizes.observe(el)
    schedule()
  }
  // dsh fills the title row's seats after the chip mounts, and swaps them as the session changes.
  const changes = new MutationObserver(watch)
  changes.observe(header, { childList: true, subtree: true })
  watch()
  return () => {
    cancelAnimationFrame(frame)
    sizes.disconnect()
    changes.disconnect()
    chip.style.removeProperty('--tracy-site-chip-max')
  }
}
