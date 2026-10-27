/**
 * Which of the "…" menu's tab entries a row shows, and the tab type each opens. Pure, so
 * `test/more-settings.test.mjs` pins it without a page.
 */

/** The site's Settings tab, from `@tracy/dsh-site-tabs` (its `SETTINGS` descriptor). */
export const SITE_SETTINGS_TAB = 'tracy:site-settings'
/** The site's Publish tab, from `@tracy/dsh-site-tabs` (its `PUBLISH` descriptor). */
export const SITE_PUBLISH_TAB = 'tracy:site-publish'

/**
 * Settings is shown wherever the settings door (`GET /api/sites/:key/settings`, any accepted seat)
 * answers: an accepted seat of any role, never a pending invitation or request.
 */
export function showsSettings(site: { role: string | null; status: string }): boolean {
  return site.status === 'accepted'
}

/** The direction of the publish operation under way on a row, or null: only the two the list names. */
function underWay(site: { publishing?: string | null }): 'live' | 'draft' | null {
  return site.publishing === 'live' || site.publishing === 'draft' ? site.publishing : null
}

/**
 * Whether the row's menu has the "Publish" line, which opens the site's Publish tab: wherever
 * Settings is shown and the list said whether the site is published — a draft, a live site, one
 * being published, taken back to draft or deleted alike, for every role. The tab itself decides
 * what that seat may do there. False where Settings is not shown (a pending invitation or
 * request), or the list did not say whether the site is published.
 */
export function showsPublish(site: {
  role: string | null
  status: string
  publish?: string | null
}): boolean {
  if (!showsSettings(site)) return false
  return site.publish === 'draft' || site.publish === 'published'
}

/**
 * The row's publish state as the chip writes it, or null when the list did not say. `publishing`
 * only while a publish runs — the same rule as the site's Settings tab (`siteStatus`): going back
 * to draft is a draft from its first moment. `deleting` while the site is being taken off its
 * host: its row stays in the list until the host has said the site is gone.
 */
export function rowStatus(site: {
  status: string
  publish?: string | null
  publishing?: string | null
}): 'draft' | 'publishing' | 'live' | 'deleting' | null {
  if (site.status !== 'accepted') return null
  if (site.publishing === 'delete') return 'deleting'
  if (site.publish !== 'published' && site.publish !== 'draft') return null
  if (underWay(site) === 'live') return 'publishing'
  return site.publish === 'published' ? 'live' : 'draft'
}

/** The tab a menu entry opens, or null for an entry that is not a tab. */
export function tabOfAction(kind: string): string | null {
  if (kind === 'settings') return SITE_SETTINGS_TAB
  if (kind === 'publish') return SITE_PUBLISH_TAB
  if (kind === 'changes') return 'tracy:changes'
  return null
}
