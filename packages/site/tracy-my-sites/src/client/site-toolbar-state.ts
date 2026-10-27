/**
 * What the Browser toolbar's Publish and More buttons say for this page's site — the pure half of
 * `site-toolbar.tsx`, so `test/site-toolbar-state.test.mjs` pins it without a page.
 *
 * The toolbar is drawn by the `dsh-better-sidebar` fork (`site-toolbar.ts` there, `-tracy.90`):
 * it draws a button only for a word said here, and imports nothing of Tracy's.
 */
import { siteRowFor } from '@tracy/core/site-key'

import { showsPublish } from './more-actions.ts'
import { adminUrlFor } from './site-actions.ts'
import type { MoreSite } from './more'

export const SITE_TOOLBAR_STATE_EVENT = 'tracy:site-toolbar-state'
export const SITE_TOOLBAR_PRESS_EVENT = 'tracy:site-toolbar-press'
export const SITE_TOOLBAR_ASK_EVENT = 'tracy:site-toolbar-ask'

/** The part of an `/api/sites` row the toolbar reads. */
export interface ToolbarSite {
  siteKey: string
  displayName?: string
  aliases?: string[]
  platform?: string | null
  role: string | null
  status: string
  copyUrl?: string | null
  publish?: string | null
  publishing?: string | null
  /** Brought in with Import existing site (`/api/sites` `imported`). */
  imported?: boolean
}

export interface SiteToolbarDetail {
  siteKey: string
  publish: string | null
  more: string | null
}

/** This page's row among the viewer's sites, or null. */
export function toolbarSiteOf(here: string | null, sites: readonly unknown[]): ToolbarSite | null {
  if (here === null) return null
  return (siteRowFor(sites as ToolbarSite[], here) as ToolbarSite | null) ?? null
}

/**
 * The state for this page's site. More shows wherever the site is one of the viewer's (the menu's
 * own rows decide what that seat may do). Publish follows the row menu's rule (`showsPublish`): not
 * while the list has not said whether the site is published.
 */
export function toolbarStateOf(
  here: string,
  site: ToolbarSite | null,
  t: (key: string) => string
): SiteToolbarDetail {
  if (site === null) return { siteKey: here, publish: null, more: null }
  return {
    siteKey: here,
    publish: showsPublish(site) ? t('more.publish') : null,
    more: t('action.more')
  }
}

/** The platforms Sync from live can read and merge (tracy-web's `SYNC_PLATFORMS`): an imported
 *  site on one of them offers the menu's Sync from live. */
export const SYNC_FROM_LIVE_PLATFORMS: ReadonlySet<string> = new Set(['joomla', 'wordpress'])
export const syncsFromLive = (site: { imported?: boolean; platform?: string | null }): boolean =>
  site.imported === true && SYNC_FROM_LIVE_PLATFORMS.has(site.platform ?? '')

/** The menu's facts about the site, as the My Sites row builds them. */
export function moreSiteOf(site: ToolbarSite, lastOwner: boolean): MoreSite {
  const liveUrl = site.copyUrl ?? null
  return {
    siteKey: site.siteKey,
    role: site.role,
    status: site.status,
    liveUrl,
    adminUrl: adminUrlFor(liveUrl, site.platform),
    lastOwner: site.role === 'owner' && lastOwner,
    publish: site.publish ?? null,
    publishing: site.publishing ?? null,
    syncsFromLive: syncsFromLive(site)
  }
}
