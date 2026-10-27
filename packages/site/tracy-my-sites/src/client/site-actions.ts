/**
 * What a row of the `…` site menu does (`MoreMenu` in `more.tsx`), one copy for every place that
 * raises it: the My Sites list and the Browser toolbar's More button (`site-toolbar.tsx`). The
 * caller keeps only what is its own: what "Copied" looks like, and how Leave and Delete ask.
 */
import { canFrameCopy } from '@tracy/core/preview'
import { openTabWithMeta, type SidebarRight } from '@tracy/core/tab-link'

import { tabOfAction } from './more-actions.ts'
import type { MoreAction } from './more'

/** The side card's site preview, a page kind of dsh's native right column (better-sidebar 0.21.1-tracy.1). */
export const PREVIEW_TAB = 'tracy:browser'

/** The Team tab's type, registered by `@tracy/dsh-site-tabs`; My Sites only opens it. */
export const TEAM_TAB = 'tracy:team'

/** The part of better-sidebar's service the menu's rows use. */
export type SiteTabOpener = Parameters<typeof openTabWithMeta>[0] & {
  openTab: (seed: { type: string; url?: string; title?: string; meta?: unknown }) => void
}

/**
 * Open the Team tab of one site (Lee, 04/09: the book is a tab now, not a drawer under the row).
 * `meta` names the site; `member` marks a row, `invite` opens the wizard on arrival. dsh's right
 * column keeps one Team tab in a pane, so an open for another site retargets the tab already there
 * — which only works because the meta is patched onto it (`openTabWithMeta`).
 */
export function openTeam(
  sidebar: SiteTabOpener,
  right: SidebarRight | undefined,
  siteKey: string,
  extra: { member?: string; invite?: boolean } = {}
): void {
  openTabWithMeta(sidebar, right, { type: TEAM_TAB, meta: { siteKey, ...extra } })
}

/**
 * The way into the admin page, INFERRED from the platform: nothing stores it.
 *
 * Measured 02/09: the hand-over step of `provision.sh` only returns `TRACY_RESULT port=… label=…`,
 * and `tracy-infra` itself writes in `apps/web/src/model.ts` that `adminUrl` is a field with "no read
 * door yet — leave it null or INFER it". So this table is the second copy of the one in
 * `tracy-add-site` (`admin-path.mjs`), and it must match: a wrong guess is a 404 for the customer.
 *
 * 🔒 `shopify` deliberately has NO path: its admin lives on `admin.shopify.com`, a host this tab
 * never opens. Guessing a path here is worse than opening nothing.
 */
const ADMIN_PATH: Record<string, string> = {
  joomla: '/administrator',
  wordpress: '/wp-admin',
  emdash: '/_emdash/admin'
}

export function adminUrlFor(liveUrl: string | null, platform: string | null | undefined): string | null {
  const path = platform ? ADMIN_PATH[platform] : undefined
  if (!path || !liveUrl) return null
  try {
    return new URL(path, liveUrl).toString()
  } catch {
    return null
  }
}

/** The site a row acts on. */
export interface ActionSite {
  siteKey: string
  /** What the site is shown by (its current name), the preview tab's title. */
  name: string
  /** The public address (`copyUrl`), or null while the site has none yet. */
  liveUrl: string | null
  platform: string | null | undefined
}

/** What stays with the caller. */
export interface ActionHooks {
  sidebar: SiteTabOpener | undefined
  /** dsh's right column, read when a tab is opened (`sidebarRightOf`). */
  right: () => SidebarRight | undefined
  /** The address went to the clipboard. */
  copied: (siteKey: string) => void
  leave: (siteKey: string) => void
  remove: (siteKey: string) => void
}

/** Run one row of the menu for `site`. */
export function runMoreAction(site: ActionSite, action: MoreAction, hooks: ActionHooks): void {
  const { sidebar } = hooks
  const live = site.liveUrl
  switch (action.kind) {
    case 'live':
      // A frameable copy goes to the side card's preview, one per pane — a second press navigates
      // the one already there. Every platform frames since 19/09 (`canFrameCopy`); one that refuses
      // again opens in a real tab — synchronously in this click so the pop-up blocker allows it,
      // with `noopener,noreferrer` so it cannot reach back through `window.opener`.
      if (!live) break
      if (canFrameCopy(site.platform)) {
        if (sidebar && typeof sidebar.openTab === 'function')
          sidebar.openTab({
            type: PREVIEW_TAB,
            url: live,
            title: site.name,
            meta: { siteKey: site.siteKey, url: live }
          })
      } else {
        window.open(live, '_blank', 'noopener,noreferrer')
      }
      break
    case 'admin': {
      // A real window: the admin page wants a sign-in, and the Browser tab is an iframe where
      // third-party cookies never arrive (measured 02/09).
      const admin = adminUrlFor(live, site.platform)
      if (admin) window.open(admin, '_blank', 'noreferrer')
      break
    }
    case 'copy':
      if (live) {
        void navigator.clipboard?.writeText(live).catch(() => undefined)
        hooks.copied(site.siteKey)
      }
      break
    case 'team':
      if (sidebar) openTeam(sidebar, hooks.right(), site.siteKey)
      break
    case 'changes':
    case 'settings':
    case 'publish':
      // One of the site tabs. Same seed shape as the Team cluster's.
      if (sidebar)
        openTabWithMeta(sidebar, hooks.right(), {
          type: tabOfAction(action.kind) as string,
          // Export site as ZIP and Sync from live land on the Publish tab's ZIP flow, Sync to live on its own.
          meta:
            action.kind === 'publish' && action.entry
              ? { siteKey: site.siteKey, publishEntry: action.entry }
              : { siteKey: site.siteKey }
        })
      break
    case 'leave':
      hooks.leave(site.siteKey)
      break
    case 'delete':
      hooks.remove(site.siteKey)
      break
  }
}
