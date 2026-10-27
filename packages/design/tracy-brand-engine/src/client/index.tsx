/**
 * `tracy-brand-engine`, browser half — TWO tab types of dsh-better-sidebar (Lee, 06/09,
 * spec-brand-engine §6): `tracy:brand` for the site this lane serves, `tracy:brand-builder` for
 * reference sites. Both talk only to this plugin's own host half through `dshUrl()`; the result of
 * either is a card in Design inspirations, which reads the same `Brand/` folder.
 *
 * 🔒 THIS PLUGIN HOLDS NO SECRET AND KNOWS NO SEAT. dsh's gateway already decided who may reach
 * this lane; the host half fetches public pages and writes the customer's own site folder.
 */
import { type JSX, useEffect, useState } from 'react'
import { Fingerprint, Layers } from 'lucide-react'

import { startFrom } from './api'
import { en, NS, type Translate } from './strings'
import { TAILWIND } from './styles'
import { BrandTab, BuilderTab } from './tabs'
import { siteKeyHere, siteNameFor, type NamedSiteRow } from '@tracy/core/site-key'
import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'

const BRAND_TAB = 'tracy:brand'
const BUILDER_TAB = 'tracy:brand-builder'
/** The tab Design inspirations registers; its Gallery opens `#<id>` on mount and on `hashchange`. */
const LIBRARY_TAB = 'tracy:design-inspiration'

interface Meta {
  siteKey?: string
  /** Set by the `?fork=` hook: the builder tab follows this host's running job. */
  forkHost?: string
}

interface SidebarTabLike {
  id: string
  type: string
  title: string
  meta?: unknown
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  openTab?: (seed: { type: string; id?: string; title?: string; meta?: unknown }) => void
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
}

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

/**
 * The site this page is on, by the one rule in `@tracy/core/site-key`: the address first, the
 * pointer cookie the Worker plants second, and NO site on the creation workspace (`/new/`), where
 * that cookie only names the last site visited (bug 01/10/2026).
 */
function currentSiteKey(): string | null {
  return siteKeyHere()
}

/**
 * What a site is shown by: its current name from the page's one `/api/sites` answer, the key until
 * that answers. A tab keeps the site's KEY in its meta; a rename changes only the name, and the
 * title written from the key kept the old address (bug 03/10/2026).
 */
function useSiteName(siteKey: string | null): string | null {
  const [rows, setRows] = useState<readonly NamedSiteRow[]>([])
  useEffect(() => {
    let alive = true
    void readSites().then((answer) => {
      const sites = (answer.body as { sites?: unknown } | null)?.sites
      if (alive && answer.status >= 200 && answer.status < 300 && Array.isArray(sites)) setRows(sites)
    })
    return () => {
      alive = false
    }
  }, [])
  return siteKey === null ? null : siteNameFor(rows, siteKey)
}

function useSiteTitle(
  tab: SidebarTabLike,
  sidebar: BetterSidebar,
  siteKey: string | null,
  title: string
): void {
  // Re-renders the tab on a language switch, so the title below is rebuilt in the new language.
  useInterfaceLocale()
  const meta = (tab.meta ?? {}) as Meta
  const siteName = useSiteName(siteKey)
  if (siteKey === null || siteName === null || typeof sidebar.updateTab !== 'function') return
  const full = `${title} · ${siteName}`
  if (tab.title !== full || meta.siteKey !== siteKey)
    sidebar.updateTab(tab.id, { title: full, meta: { siteKey } })
}

function BrandTabHost({
  tab,
  sidebar,
  t,
  openInspiration
}: {
  tab: SidebarTabLike
  sidebar: BetterSidebar
  t: Translate
  openInspiration: ((id: string) => void) | null
}): JSX.Element {
  const meta = (tab.meta ?? {}) as Meta
  const [siteKey] = useState<string | null>(meta.siteKey ?? currentSiteKey())
  useSiteTitle(tab, sidebar, siteKey, t('tab.brand'))
  return <BrandTab siteKey={siteKey} openInspiration={openInspiration} t={t} />
}

function BuilderTabHost({
  tab,
  sidebar,
  t,
  openInspiration
}: {
  tab: SidebarTabLike
  sidebar: BetterSidebar
  t: Translate
  openInspiration: ((id: string) => void) | null
}): JSX.Element {
  const meta = (tab.meta ?? {}) as Meta
  const [siteKey] = useState<string | null>(meta.siteKey ?? currentSiteKey())
  useSiteTitle(tab, sidebar, siteKey, t('tab.builder'))
  return <BuilderTab openInspiration={openInspiration} forkHost={meta.forkHost} t={t} />
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ. Declaring it means this plugin only activates once better-sidebar is up; on a
 * profile without it, cordis leaves the plugin PENDING — silent, and the right failure.
 */
export const inject = ['betterSidebar', 'locale']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-brand-engine="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyBrandEngine = '1'
    el.textContent = TAILWIND
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-brand-engine: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-brand-engine: dictionaries')
  const t = ctx.locale.bind(NS)

  // Design inspirations reads `#<id>` when its Gallery mounts and on `hashchange`; set the hash first
  // so both an open tab and a fresh one land on the brand's card.
  const openInspiration =
    typeof ctx.betterSidebar.openTab === 'function'
      ? (id: string) => {
          location.hash = id
          ctx.betterSidebar.openTab?.({ type: LIBRARY_TAB, meta: { siteKey: currentSiteKey() ?? undefined } })
        }
      : null

  // "Fork a site from any URL": the Add site wizard opens the new lane as `/<siteKey>?fork=<url>`
  // (cowork-web keeps the query through login and proxy). The param is consumed once — stripped
  // from the address before anything else, so a reload does not fork twice — the host half crawls
  // and extracts (idempotent: a fresh result is reused), and the Brand builder tab opens on the job.
  ctx.effect(() => {
    const params = new URLSearchParams(location.search)
    const fork = params.get('fork')?.trim()
    if (!fork) return
    params.delete('fork')
    const rest = params.toString()
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
    void startFrom(fork).then((started) => {
      const forkHost = 'refused' in started ? undefined : started.host
      // The wizard's link also carries `&tab=tracy:brand-builder` (tab-link opens it); this is the
      // fallback for a link without it, delayed past the sidebar's own seed so it is not overridden.
      window.setTimeout(() => {
        ctx.betterSidebar.openTab?.({
          type: BUILDER_TAB,
          meta: { siteKey: currentSiteKey() ?? undefined, forkHost }
        })
      }, 400)
    })
  }, 'tracy-brand-engine: fork')

  // 🔒 Wrapped in `ctx.effect`: `registerTab` returns a disposer; without it HMR or a plugin
  // toggle leaves the old registration and the next activation throws "already registered".
  ctx.effect(
    () =>
      ctx.betterSidebar.registerTab({
        id: BRAND_TAB,
        title: () => t('tab.brand'),
        icon: (size: number) => <Fingerprint size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 8,
        // One tab per site: a second open of the same site lands on the tab already there.
        dedupeKey: (tab: SidebarTabLike) => `${BRAND_TAB}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
        component: ({ tab }: { tab: SidebarTabLike }) => (
          <BrandTabHost tab={tab} sidebar={ctx.betterSidebar} t={t} openInspiration={openInspiration} />
        )
      }),
    'tracy-brand-engine: brand tab'
  )
  ctx.effect(
    () =>
      ctx.betterSidebar.registerTab({
        id: BUILDER_TAB,
        title: () => t('tab.builder'),
        icon: (size: number) => <Layers size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 9,
        dedupeKey: (tab: SidebarTabLike) => `${BUILDER_TAB}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
        component: ({ tab }: { tab: SidebarTabLike }) => (
          <BuilderTabHost tab={tab} sidebar={ctx.betterSidebar} t={t} openInspiration={openInspiration} />
        )
      }),
    'tracy-brand-engine: builder tab'
  )
}
