/**
 * The Browser toolbar's Publish and More (⋯) buttons, Tracy's half (Akemi 15/10/2026). The toolbar
 * is drawn by the `dsh-better-sidebar` fork, which imports nothing of Tracy's: it draws what
 * `tracy:site-toolbar-state` says for its site and says a press back on `tracy:site-toolbar-press`
 * (`site-toolbar-state.ts` says which buttons and which words).
 *
 * - Publish opens the site's Publish tab (`tracy:site-publish`), through the same row action the My
 *   Sites menu runs (`runMoreAction`).
 * - More raises My Sites' own `…` menu (`MoreMenu`, one source): its trigger is a transparent button
 *   laid over the fork's More button, so the panel places itself from that button's rectangle (below
 *   it, right-aligned, clamped to the viewport) and a second press on it closes the menu. Leave and
 *   Delete ask with the sidebar site row's dialogs (`raiseDialog`).
 *
 * When it is said: whenever the page's site facts change (the read shared with `site-row-menu.tsx`),
 * and whenever the fork asks (`tracy:site-toolbar-ask`, when its store starts).
 */
import { createRoot, type Root } from 'react-dom/client'
import { siteKeyHere, siteNameFor } from '@tracy/core/site-key'
import type { SidebarRight } from '@tracy/core/tab-link'

import { MoreMenu } from './more'
import { type ActionHooks, runMoreAction, type SiteTabOpener } from './site-actions'
import { raiseDialog, siteFactsNow, subscribeSiteFacts } from './site-row-menu'
import {
  moreSiteOf,
  SITE_TOOLBAR_ASK_EVENT,
  SITE_TOOLBAR_PRESS_EVENT,
  SITE_TOOLBAR_STATE_EVENT,
  type ToolbarSite,
  toolbarSiteOf,
  toolbarStateOf
} from './site-toolbar-state'
import type { Translate } from './strings'

/** Above the page, under the menu's own panel (`Popover`: z 2147483000). */
const OVERLAY_Z = 2147482999

/**
 * Wire the toolbar for this page's site. Returns the disposer; nothing happens off a site page.
 */
export function registerSiteToolbar(deps: {
  t: Translate
  sidebar: SiteTabOpener | undefined
  right: () => SidebarRight | undefined
  target?: Window
}): () => void {
  const { t, sidebar, right } = deps
  const target = deps.target ?? window
  const here = siteKeyHere()
  if (here === null) return () => {}

  const siteNow = (): ToolbarSite | null => toolbarSiteOf(here, siteFactsNow().sites)
  const say = (): void => {
    target.dispatchEvent(
      new CustomEvent(SITE_TOOLBAR_STATE_EVENT, { detail: toolbarStateOf(here, siteNow(), t) })
    )
  }

  const hooks: ActionHooks = {
    sidebar,
    right,
    // The toolbar has no row to write "Copied" on; the address is on the clipboard all the same.
    copied: () => undefined,
    leave: (siteKey) => raiseDialog('leave', { siteKey, siteName: nameOf(siteKey) }, t),
    remove: (siteKey) => raiseDialog('delete', { siteKey, siteName: nameOf(siteKey) }, t)
  }
  const nameOf = (siteKey: string): string => siteNameFor(siteFactsNow().sites as ToolbarSite[], siteKey)
  const actionSite = (site: ToolbarSite) => ({
    siteKey: site.siteKey,
    name: nameOf(site.siteKey),
    liveUrl: site.copyUrl ?? null,
    platform: site.platform
  })

  // ── The menu raised from the More button ───────────────────────────────────────────────
  let open: { root: Root; host: HTMLDivElement; anchor: HTMLElement } | null = null
  const closeMenu = (): void => {
    const was = open
    if (was === null) return
    open = null
    window.removeEventListener('resize', closeMenu)
    // After the render that reported the close: a root does not unmount inside its own effect.
    setTimeout(() => {
      const active = document.activeElement
      const focusFell = active === null || active === document.body || was.host.contains(active)
      was.root.unmount()
      was.host.remove()
      if (focusFell && was.anchor.isConnected) was.anchor.focus()
    }, 0)
  }
  const openMenu = (anchor: HTMLElement, site: ToolbarSite): void => {
    closeMenu()
    const rect = anchor.getBoundingClientRect()
    const host = document.createElement('div')
    host.className = 'tracy-mysites tms-toolbar-menu-host'
    Object.assign(host.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: String(OVERLAY_Z)
    })
    document.body.append(host)
    const root = createRoot(host)
    open = { root, host, anchor }
    window.addEventListener('resize', closeMenu)
    root.render(
      <MoreMenu
        site={moreSiteOf(site, siteFactsNow().lastOwner)}
        onAction={(action) => runMoreAction(actionSite(site), action, hooks)}
        t={t}
        defaultOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) closeMenu()
        }}
        trigger={(props) => (
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('action.more')}
            {...props}
            style={{
              display: 'block',
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              padding: 0,
              border: 0,
              background: 'transparent',
              opacity: 0,
              cursor: 'pointer'
            }}
          />
        )}
      />
    )
  }

  const onPress = (event: Event): void => {
    const d = (event as CustomEvent).detail as {
      siteKey?: unknown
      action?: unknown
      anchor?: unknown
    } | null
    if (!d || d.siteKey !== here) return
    const site = siteNow()
    if (site === null) return
    if (d.action === 'publish') {
      runMoreAction(actionSite(site), { kind: 'publish' }, hooks)
    } else if (d.action === 'more' && d.anchor instanceof HTMLElement) {
      const anchor = d.anchor
      // A frame later: the press may have taken the Browser tab out of fullscreen, which moves it.
      window.requestAnimationFrame(() => {
        if (anchor.isConnected) openMenu(anchor, site)
      })
    }
  }

  const unsubscribe = subscribeSiteFacts(say)
  target.addEventListener(SITE_TOOLBAR_ASK_EVENT, say)
  target.addEventListener(SITE_TOOLBAR_PRESS_EVENT, onPress)
  say()
  return () => {
    unsubscribe()
    target.removeEventListener(SITE_TOOLBAR_ASK_EVENT, say)
    target.removeEventListener(SITE_TOOLBAR_PRESS_EVENT, onPress)
    closeMenu()
  }
}
