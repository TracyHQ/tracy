/**
 * The sites the viewer holds a seat on, from the page's one shared `/api/sites` answer
 * (`readSites`): eight tabs asking eight times is how a panel rate-limits itself, and every other
 * plugin on the page reads the same answer (#340).
 *
 * 🔒 AN EMPTY LIST IS AN ANSWER. It is taken as it comes — never asked again on the spot (that was a
 * second request on every `/new` of a viewer with no site) — and it replaces the last list, so a
 * failed read afterwards can never bring back a site the door stopped listing.
 *
 * 🔒 `tracy:sites-changed` DROPS THE LAST LIST TOO. After a delete or leave, the list kept from before
 * still names the site that is gone; a failed read then would hand it back to every tab. Until the
 * door answers again, the tabs list nothing rather than a site the viewer no longer has.
 */
import { SITES_CHANGED, readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

/**
 * @typedef {{ siteKey: string, displayName?: string, role: string | null, status: string, copyUrl?: string | null, aliases?: string[], platform?: string | null, imported?: boolean }} SiteRow
 *   one row of `/api/sites`, the part the picker and the reload need.
 */

/** @type {SiteRow[]} */
let lastRows = []

/** @type {WeakSet<object>} */
const heard = new WeakSet()

/**
 * Forget the last list whenever the viewer's sites change. Idempotent per target.
 * @param {{ addEventListener?: (type: string, fn: () => void, capture?: boolean) => void } | undefined} [target]
 */
export function forgetOnSitesChanged(target = /** @type {any} */ (globalThis).window) {
  if (!target || typeof target.addEventListener !== 'function' || heard.has(target)) return
  heard.add(target)
  // Capture, like the shared read: a tab refreshing on the same event never sees the old list.
  target.addEventListener(SITES_CHANGED, () => (lastRows = []), true)
}

forgetOnSitesChanged()

/**
 * @param {() => Promise<{ status: number, body: unknown }>} [read]
 * @returns {Promise<SiteRow[]>}
 */
export async function acceptedSites(read = readSites) {
  const answer = await read()
  // A failed read (no answer, a 5xx, a 401) keeps the last list the door gave.
  if (answer.status < 200 || answer.status >= 300) return lastRows
  const body = /** @type {{ sites?: SiteRow[] } | null} */ (answer.body)
  lastRows = (body?.sites ?? []).filter((s) => s.status === 'accepted')
  return lastRows
}

/** Resolve an address segment or historical name to the immutable workspace key. */
/**
 * Only the key and aliases are read, so any site list (a picker's rows included) can be passed.
 * @param {string | null | undefined} name @param {readonly Pick<SiteRow, 'siteKey' | 'aliases'>[]} rows
 */
export function canonicalSiteKey(name, rows) {
  const wanted = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const row = (Array.isArray(rows) ? rows : []).find((item) =>
    [item?.siteKey, ...(Array.isArray(item?.aliases) ? item.aliases : [])].some(
      (value) => typeof value === 'string' && value.trim().toLowerCase() === wanted
    )
  )
  return typeof row?.siteKey === 'string' ? row.siteKey : null
}

/** Tests only: forget the last list. */
export function resetAcceptedSites() {
  lastRows = []
}
