/**
 * Moving inside the Opportunities tab (spec #512, ticket #514): the list and Details are two full-width routes. A row
 * or its name opens Details and pushes a history entry, so Back (the control or the browser's) comes back to the list.
 * The filter and search live in the address; the view and the scroll offset are kept in memory for the tab's life.
 * The pin beside an address is the only link out of the list: Google Maps, in a new tab.
 */
import type { MyView } from './column-prefs.ts'
import type { MyAddress } from './my-address.ts'

export type ClickKind = 'row' | 'name' | 'pin'
export type ClickTarget =
  | { kind: 'details'; address: MyAddress }
  | { kind: 'maps'; href: string; target: '_blank'; rel: 'noopener noreferrer' }

export function detailsAddress(address: MyAddress, id: string): MyAddress {
  return { ...address, view: 'mine', opp: id, page: 'details', brief: null, section: null }
}

export function listAddress(address: MyAddress): MyAddress {
  return { ...address, opp: null, page: null, brief: null, section: null }
}

export function clickTarget(
  kind: ClickKind,
  address: MyAddress,
  place: { id: string; mapsUrl: string }
): ClickTarget {
  if (kind === 'pin')
    return { kind: 'maps', href: place.mapsUrl, target: '_blank', rel: 'noopener noreferrer' }
  return { kind: 'details', address: detailsAddress(address, place.id) }
}

/**
 * A new page (list to Details, Details to Brief, Details to one of its sections) is a history entry; anything else
 * (the pager from one section to the next, a section back to Details, a filter) rewrites the current one.
 */
export function historyWrite(prev: MyAddress, next: MyAddress): 'push' | 'replace' {
  const opened = next.page !== null && (next.page !== prev.page || next.opp !== prev.opp)
  if (opened && (prev.page === null || next.page !== prev.page)) return 'push'
  const sectionOpened =
    next.page === 'details' && prev.page === 'details' && prev.section === null && next.section !== null
  return sectionOpened ? 'push' : 'replace'
}

/** How many pages deep an address is: the list 0, Details 1, a section of Details or a brief 2. */
export function pageDepth(address: MyAddress): number {
  if (address.page === null) return 0
  return address.page === 'brief' || address.section !== null ? 2 : 1
}

export interface ListSpot {
  view: MyView
  scroll: number
}

/** Where the list was when Details opened, for the tab's lifetime (in memory, never stored). */
export function createListMemory(): { remember(spot: ListSpot): void; recall(): ListSpot | null } {
  let spot: ListSpot | null = null
  return {
    remember: (next) => {
      spot = { ...next }
    },
    recall: () => (spot === null ? null : { ...spot })
  }
}
