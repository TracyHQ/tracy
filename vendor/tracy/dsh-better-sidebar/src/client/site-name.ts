/**
 * Tracy: a site's name on screen, and which site a page's address names (TCH #818, Brian 03/10/2026).
 *
 * A rename keeps a site's key (`siteKey`, immutable) and gives it a new address: tracy-web's
 * `/api/sites` row carries the name now shown as `displayName` and every older name in `aliases`. The
 * Browser chip and its site menu printed `siteKey`, so after a rename they kept the old address; and the
 * page's own path names the site by its CURRENT name, so comparing it with row keys missed, and picking
 * the site already open opened it again in a new window.
 */

/** The fields of an `/api/sites` row these rules read. */
export interface NamedSite {
  siteKey: string
  displayName?: string | null
  aliases?: readonly string[] | null
}

/**
 * What the chip and the menu print for a site.
 * @param site - its `/api/sites` row.
 * @returns the current name, or the key when the row carries none (an older tracy-web).
 */
export function siteNameOf(site: NamedSite): string {
  return typeof site.displayName === 'string' && site.displayName !== '' ? site.displayName : site.siteKey
}

/**
 * The site a name points at: its key, its current name, or one of its older names.
 * @param sites - the viewer's `/api/sites` rows.
 * @param name - a name from an address (`workspaceSiteKey()`), case-insensitive.
 * @returns the row, or undefined when none answers to it.
 */
export function siteNamed<T extends NamedSite>(sites: readonly T[], name: string | undefined): T | undefined {
  if (name === undefined || name === '') return undefined
  const wanted = name.toLowerCase()
  const is = (value: unknown): boolean => typeof value === 'string' && value.toLowerCase() === wanted
  return sites.find(site => is(site.siteKey)) ?? sites.find(site => is(site.displayName) || (site.aliases ?? []).some(is))
}
