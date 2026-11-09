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
  return { ...address, view: 'mine', opp: id, page: 'details', brief: null }
}

export function listAddress(address: MyAddress): MyAddress {
  return { ...address, opp: null, page: null, brief: null }
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

/** A new page (list to Details, Details to Brief) is a history entry; anything else rewrites the current one. */
export function historyWrite(prev: MyAddress, next: MyAddress): 'push' | 'replace' {
  const opened = next.page !== null && (next.page !== prev.page || next.opp !== prev.opp)
  return opened && (prev.page === null || next.page !== prev.page) ? 'push' : 'replace'
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
