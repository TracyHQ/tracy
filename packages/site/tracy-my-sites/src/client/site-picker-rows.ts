/**
 * Which sites the chat's site picker offers beside the one this page works on.
 *
 * The same rule as a My Sites row that opens (`openable` in `index.tsx`): an accepted seat, an
 * agent that answers, and not the current site. Rows that need something else first (an
 * invitation to accept, an agent to start) stay in My Sites, where their button lives.
 */

import { siteKeyFor } from '@tracy/core/site-key'

/** The part of an `/api/sites` row this rule reads. */
export interface PickerSite {
  siteKey: string
  displayName?: string
  aliases?: string[]
  status: string
  agent: string | null
}

/**
 * The sites to list under the current one, in the seat book's order.
 * @param sites - rows from `/api/sites`.
 * @param current - the site this page works on — by any of its names: the address carries the name
 *   a rename gave it, the rows its immutable key — or `null` when the address names none.
 * @returns the rows a press can open in a new tab.
 */
export function otherOpenableSites<S extends PickerSite>(sites: readonly S[], current: string | null): S[] {
  const own = siteKeyFor(sites, current) ?? current
  return sites.filter((s) => s.siteKey !== own && s.status === 'accepted' && s.agent !== null)
}
