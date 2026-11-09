/**
 * The tab open on Details (#517), kept in the page address as `wo-tab` beside `wo-page`, so a reload or a return from
 * the Brief page lands on the same tab. Overview is the default and is not written. `my-address.ts` drops the
 * parameter when the list comes back, so the next place opens on Overview.
 */
export const DETAIL_TABS = ['overview', 'brief', 'media', 'sources'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

export const DETAIL_TAB_PARAM = 'wo-tab'

const isTab = (v: string | null): v is DetailTab =>
  v !== null && (DETAIL_TABS as readonly string[]).includes(v)

export function detailTabFromSearch(search: string): DetailTab {
  const asked = new URLSearchParams(search).get(DETAIL_TAB_PARAM)
  return isTab(asked) ? asked : 'overview'
}

/** `search` with the tab written (or removed for Overview); every other parameter keeps its place. */
export function searchWithDetailTab(search: string, tab: DetailTab): string {
  const params = new URLSearchParams(search)
  params.delete(DETAIL_TAB_PARAM)
  if (tab !== 'overview') params.set(DETAIL_TAB_PARAM, tab)
  // URLSearchParams escapes the colon of `tab=tracy:…`; tracy-tab-link writes it bare too.
  const query = params.toString().replace(/%3A/gi, ':')
  return query === '' ? '' : `?${query}`
}

/** Reads the tab from the page address; Overview outside a browser. */
export function readDetailTab(): DetailTab {
  return typeof window === 'undefined' ? 'overview' : detailTabFromSearch(window.location.search)
}

/** Writes the tab into the page address without a new history entry, as the rest of the tab's address does. */
export function writeDetailTab(tab: DetailTab): void {
  if (typeof window === 'undefined') return
  const { pathname, search, hash } = window.location
  const next = searchWithDetailTab(search, tab)
  if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
}
