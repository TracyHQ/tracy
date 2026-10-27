/**
 * What the dsh sidebar's workspace row menu shows on a site page — the decision behind
 * `site-row-menu.tsx`, pure so it can be pinned without a page.
 *
 * 🔒 THE ROW IS MATCHED BY THE FOLDER `/api/sites` SENDS, NEVER BY A NAME GUESSED FROM THE KEY. A
 * site seat works in `/site/<label>` (`apps/tracy-web/src/lib/seat-grant.js`), and the label is
 * stored per site: for an imported site it is a hashed name, not the first part of its key. A row
 * whose folder the seat book does not name (an older server) matches nothing and keeps dsh's menu,
 * which is the menu every row had before.
 */
import { siteRowFor } from '@tracy/core/site-key'

/** The part of an `/api/sites` row this reads. */
export interface SiteRowFacts {
  siteKey: string
  displayName?: string
  aliases?: string[]
  role: string | null
  status: string
  /** `/site/<label>`, the seat's folder on the host's dsh; absent from an older server. */
  folder?: string | null
}

/** The site row's menu, or null: dsh's own Rename / Delete workspace stay. */
export type SiteRowPlan = null | {
  siteKey: string
  /** What the site is shown by (`displayName`), for the dialogs. */
  siteName: string
  /** Leave site, for every role; the last Owner sees it greyed with the reason (ADR 0036). */
  leave: { lastOwner: boolean }
  /** Delete site…: an accepted Owner only, absent rather than greyed for anyone else (as in My Sites). */
  delete: boolean
}

const trimSlash = (path: string): string => path.replace(/\/+$/, '')

/**
 * Decide one workspace row's menu.
 * @param input.path - the row's workspace path as dsh holds it.
 * @param input.here - the site this page names (`siteKeyHere`: a key or one of its names), null on `/new/`.
 * @param input.sites - the viewer's `/api/sites` rows.
 * @param input.lastOwner - whether the viewer is the site's only active Owner (`isLastOwner`).
 */
export function siteRowPlan(input: {
  path: string
  here: string | null
  sites: readonly SiteRowFacts[]
  lastOwner: boolean
}): SiteRowPlan {
  if (input.here === null) return null
  const site = siteRowFor(input.sites as SiteRowFacts[], input.here) as SiteRowFacts | null
  if (site === null || site.status !== 'accepted' || site.role === null) return null
  if (typeof site.folder !== 'string' || site.folder === '') return null
  if (trimSlash(input.path) !== trimSlash(site.folder)) return null
  return {
    siteKey: site.siteKey,
    siteName: site.displayName || site.siteKey,
    leave: { lastOwner: site.role === 'owner' && input.lastOwner },
    delete: site.role === 'owner'
  }
}

/**
 * Whether `email` is the site's only active Owner — the same reading My Sites makes from the team
 * book (`/api/team` `seats`). Unknown viewer or roster → false: the seat book refuses the leave
 * anyway, the greyed row is a courtesy.
 */
export function isLastOwner(
  seats: readonly { role?: string; status?: string; email?: string | null }[] | undefined,
  email: string | null
): boolean {
  if (!seats || email === null) return false
  const owners = seats.filter((s) => s.role === 'owner' && s.status === 'active')
  return owners.length === 1 && owners[0]?.email === email
}
