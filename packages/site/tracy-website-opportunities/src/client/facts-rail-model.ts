/**
 * The section rail of the Business facts sub-page (#537, layout B): what each band reports about itself (its name, how
 * many items it holds, whether it carries a Check this flag, whether its On the site switch is on) turned into the
 * rail's rows in page order, each with one state mark, and the count of sections left to check. Also which band is
 * the current one: the band at the top of the view, under the sticky header. Pure.
 */

/** What one band of the page reports to the rail. */
export interface BandSummary {
  id: string
  name: string
  /** The items the band holds; 0 or null draws no count. */
  count: number | null
  /** The band carries a Check this flag. */
  check: boolean
  /** The band's On the site switch is on. */
  on: boolean
}

/** One mark of the rail: nothing flagged, a Check this flag, or the band kept off the site. */
export type RailState = 'ok' | 'check' | 'off'

export interface RailItem {
  id: string
  name: string
  count: number | null
  state: RailState
}

export interface RailView {
  /** How many sections carry a Check this flag and are on the site. */
  toCheck: number
  items: RailItem[]
}

/** A band kept off the site needs no check: off wins over Check this. */
export const railState = (s: Pick<BandSummary, 'check' | 'on'>): RailState =>
  !s.on ? 'off' : s.check ? 'check' : 'ok'

/** The rail's rows in the page's order; a band the order does not name follows, in the order it reported. */
export function railView(summaries: readonly BandSummary[], order: readonly string[]): RailView {
  const rank = (id: string): number => {
    const at = order.indexOf(id)
    return at === -1 ? order.length : at
  }
  const items = [...summaries]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.id) - rank(b.s.id) || a.i - b.i)
    .map(({ s }) => ({
      id: s.id,
      name: s.name,
      count: s.count !== null && s.count > 0 ? s.count : null,
      state: railState(s)
    }))
  return { toCheck: items.filter((i) => i.state === 'check').length, items }
}

/** A band's box on screen, in the scroller's coordinates. */
export interface BandBox {
  id: string
  top: number
  bottom: number
}

/**
 * The current band: the one in view at the top of the view, just under the sticky header (the band crossing a line
 * `reach` px below `viewTop`, else the first band under that line), so a band the rail scrolled to is the current
 * one even when it is short. Scrolled to the very end, the last band that shows is current. Null when none shows.
 */
export function currentBand(
  boxes: readonly BandBox[],
  viewTop: number,
  viewBottom: number,
  atEnd = false,
  reach = 24
): string | null {
  const shown = boxes.filter((b) => Math.min(b.bottom, viewBottom) - Math.max(b.top, viewTop) > 0)
  if (shown.length === 0) return null
  if (atEnd) return (shown[shown.length - 1] as BandBox).id
  const line = viewTop + reach
  return (
    (shown.find((b) => b.top <= line && b.bottom > line) ?? shown.find((b) => b.top > line) ?? shown[0])
      ?.id ?? null
  )
}

/** Two reports are the same: the rail does not draw again. */
export const sameSummary = (a: BandSummary | undefined, b: BandSummary): boolean =>
  a !== undefined && a.name === b.name && a.count === b.count && a.check === b.check && a.on === b.on
