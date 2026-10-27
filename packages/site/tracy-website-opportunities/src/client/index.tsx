/**
 * `tracy-website-opportunities` — find restaurants, collect their public website and social presence,
 * write a site brief and build a demo site (tasks/spec-website-opportunities-contracts.md).
 *
 * 🔒 THIS PLUGIN HOLDS NO JOB. Research, briefs and builds live in tracy-web's tables and run in its
 * executor; the tab only calls `/api/website-opportunities/…` and draws the answers.
 *
 * Two pieces:
 * - a side-card tab `tracy:website-opportunities`, registered through `seatOnlyTab` (a guest on a
 *   public landing gets no tab; the doors would answer 401). It is opened by the row this plugin
 *   puts below New session in the left column (`sidebar.nav`, like the Inbox), by the desktop
 *   app's Help › Find Website Opportunities…, or by the address `/new/?tab=tracy:website-opportunities`
 *   (`@tracy/dsh-tab-link`). It is not in the right column's + menu: that list is the catalogue's
 *   `launch-*` switches, compiled into every bundle that reads them.
 * - Settings › Website Opportunities › Default CMS.
 *
 * The operator's switch is `website-opportunities` (`@tracy/core/ui-switches`). Off: Settings drops
 * the section (its id is the switch id), and the tab — which stays registered so a restored or
 * linked tab is not an unknown type — draws a notice and makes no request.
 */
import { type JSX, useSyncExternalStore } from 'react'
import { FileText, Store } from 'lucide-react'
import { Button, Spinner, TabLoadingScope } from '@tracy/ui'
import { mayHoldSeatOnlyTab, readViewer, seatOnlyTab } from '@tracy/core/seat'
import { LIST_PANEL_WIDTH, sidebarRightOf } from '@tracy/core/tab-link'
import { uiSwitches } from '@tracy/core/ui-switches'

import { customerText } from './customer-text.ts'
import { createApi } from './api.ts'
import { BRIEF_TAB, BriefTab, type BriefTabSeed, briefTabMeta } from './brief-tab.tsx'
import { desktopOpenHook, featureOn } from './gate.ts'
import { receiveHandoff } from './handoff-entry.ts'
import { clientChatState, receiveClientDemoChat, type ChatServices } from './client-demo-chat.ts'
import { WebsiteOpportunitiesNav } from './nav.tsx'
import { createRequestIds } from './request-ids.ts'
import { SECTION_ID, SettingsSection } from './settings-section.tsx'
import { en, NS, type Translate } from './strings.ts'
import { CSS, TAILWIND } from './styles.ts'
import { type FeatureState, WebsiteOpportunitiesTab } from './tab.tsx'

/** Id of the tab type. Package prefix, as better-sidebar recommends. */
const TAB_ID = 'tracy:website-opportunities'

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  openTab: (seed: { type: string; title?: string; meta?: unknown }) => void
  closeTab?: (tabId: string) => void
  getSnapshot?: () => { sessionId?: string; state?: unknown }
  subscribeState?: (listener: () => void) => () => void
  openTabsOf?: (type: string) => readonly { id: string; type: string; meta?: unknown }[]
}

const api = createApi((url, init) => fetch(url, init))
const ids = createRequestIds(() =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
)

/** `pending` until `/api/ui` answered (or failed: then the code default, off). */
function featureStore(): {
  getSnapshot: () => FeatureState
  subscribe: (listener: () => void) => () => void
} {
  const ui = uiSwitches()
  let answered = false
  const listeners = new Set<() => void>()
  void ui.ready.then(() => {
    answered = true
    for (const listener of listeners) listener()
  })
  return {
    getSnapshot: () => (answered ? (featureOn(ui) ? 'on' : 'off') : 'pending'),
    subscribe: (listener) => {
      listeners.add(listener)
      const stop = ui.subscribe(listener)
      return () => {
        listeners.delete(listener)
        stop()
      }
    }
  }
}

/** Whether this viewer gets the tab (`seatOnlyTab`'s rule): answered once per page by `/auth/me`. */
let viewerAllowed = false
const viewerListeners = new Set<() => void>()
function useViewerAllowed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      viewerListeners.add(listener)
      return () => viewerListeners.delete(listener)
    },
    () => viewerAllowed
  )
}

export const inject = ['betterSidebar', 'locale', 'slots', 'sessions']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /** dsh's right column is probed through it, not injected (`sidebarRightOf`). */
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  sessions: NonNullable<ChatServices['sessions']>
  locale: LocaleRuntime
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-website-opportunities="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyWebsiteOpportunities = '1'
    // Tailwind first, the hand-written rules after: source order decides when both match.
    el.textContent = `${TAILWIND}\n${CSS}`
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-website-opportunities: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-website-opportunities: dictionaries')
  const t = customerText(ctx.locale.bind(NS))
  const feature = featureStore()
  const useFeature = (): FeatureState => useSyncExternalStore(feature.subscribe, feature.getSnapshot)

  // The destination page owns submitting the user message, after its exact native session opens.
  // Only opaque action IDs cross the page load; private research is read through the signed-in API.
  ctx.effect(() => {
    let storage: Storage | null = null
    try {
      storage = window.sessionStorage
    } catch {
      /* Sending still reports an explicit failure. */
    }
    return receiveClientDemoChat({
      api,
      services: ctx,
      storage,
      location: window.location,
      replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
      open: (href) => window.location.assign(href)
    })
  }, 'tracy-website-opportunities: send the demo brief from its chat')
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-website-opportunities-demo-send', order: 8, locale: NS },
      function DemoChatDelivery() {
        const status = useSyncExternalStore(clientChatState.subscribe, clientChatState.getSnapshot)
        const enabled = useFeature()
        if (
          enabled !== 'on' ||
          status.actionId !== new URLSearchParams(window.location.search).get('wo-demo-chat')
        )
          return null
        if (status.phase === 'sending')
          return status.logo ? (
            <p className="flex items-center gap-2 p-2" role="status">
              <Spinner label={t('loading.label')} />
              <span className="tracy-wo-note">{t('demo.logoPending')}</span>
            </p>
          ) : (
            <Spinner label={t('loading.label')} />
          )
        if (status.phase !== 'failed') return null
        return (
          <div role="alert" className="flex items-center gap-2 p-2">
            <span className="tracy-wo-error">{t('action.failed')}</span>
            <Button variant="outline" size="sm" onClick={status.retry}>
              {t('action.retry')}
            </Button>
          </div>
        )
      }
    )
  )

  // 🔒 `seatOnlyTab`, never `registerTab` straight. Wrapped in `ctx.effect` so a reload disposes it.
  ctx.effect(
    () =>
      seatOnlyTab(ctx.betterSidebar, TAB_ID, () => ({
        id: TAB_ID,
        title: () => t('tab.title'),
        icon: (size: number) => <Store size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 40,
        single: true,
        preferredWidth: LIST_PANEL_WIDTH,
        component: function WebsiteOpportunitiesPane() {
          const state = useFeature()
          return (
            <TabLoadingScope label={t('loading.label')}>
              <WebsiteOpportunitiesTab
                t={t}
                api={api}
                ids={ids}
                feature={state}
                openBriefTab={openBriefTab}
              />
            </TabLoadingScope>
          )
        }
      })),
    'tracy-website-opportunities: tab'
  )

  // A site brief in its own side-card tab, one per brief; without `openTab` the Details page keeps its Brief page.
  const openBriefTab =
    typeof ctx.betterSidebar.openTab === 'function'
      ? (seed: BriefTabSeed) =>
          ctx.betterSidebar.openTab({
            type: BRIEF_TAB,
            title: seed.title,
            meta: { revisionId: seed.revisionId, opportunityId: seed.opportunityId }
          })
      : null
  ctx.effect(
    () =>
      seatOnlyTab(ctx.betterSidebar, BRIEF_TAB, () => ({
        id: BRIEF_TAB,
        title: () => t('revision.document'),
        icon: (size: number) => <FileText size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 41,
        dedupeKey: (tab: { meta?: unknown }) => `${BRIEF_TAB}:${briefTabMeta(tab.meta).revisionId ?? ''}`,
        component: function WebsiteOpportunitiesBrief({ tab }: { tab: { meta?: unknown } }) {
          return <BriefTab t={t} api={api} meta={briefTabMeta(tab.meta)} />
        }
      })),
    'tracy-website-opportunities: brief tab'
  )

  // Open the tab and reveal the column, only once the switch is known to be on.
  const openTab = (): void => {
    void uiSwitches().ready.then(() => {
      if (feature.getSnapshot() !== 'on') return
      ctx.betterSidebar.openTab({ type: TAB_ID })
      const right = sidebarRightOf(ctx)
      try {
        if (right !== undefined && !right.isExpanded()) right.toggleExpanded()
      } catch {
        // No seat mounted yet: dsh refuses the command; the open above already placed the tab.
      }
    })
  }

  // Help › Find Website Opportunities… in the desktop app (the app checks the switch too; this page decides for itself).
  const hook = desktopOpenHook(typeof window === 'undefined' ? null : window)
  if (hook !== null) ctx.effect(() => hook(openTab), 'tracy-website-opportunities: desktop help menu')

  // The web's door: the row below New session, for a viewer the tab exists for.
  ctx.effect(() => {
    let disposed = false
    void readViewer().then((viewer) => {
      if (disposed || !mayHoldSeatOnlyTab(viewer, location.hostname)) return
      viewerAllowed = true
      for (const listener of viewerListeners) listener()
    })
    return () => {
      disposed = true
    }
  }, 'tracy-website-opportunities: viewer')
  function NavSlot({ wide }: { wide: boolean }): JSX.Element | null {
    const on = useFeature() === 'on'
    const allowed = useViewerAllowed()
    return on && allowed ? <WebsiteOpportunitiesNav wide={wide} t={t} open={openTab} /> : null
  }
  // `slots.inject`: `sidebar.nav` is declared by `@tracy/dsh-sidebar`, whose activation order is not bound. After the Inbox (10).
  ctx.slots.inject('sidebar.nav', () =>
    ctx.slots.register({ name: 'sidebar.nav', id: 'tracy-website-opportunities', order: 20 }, NavSlot)
  )

  // Historical handoff links read the server receipt; the browser never submits an agent prompt.
  if (typeof window !== 'undefined') {
    ctx.effect(
      () =>
        receiveHandoff({
          location: window.location,
          api,
          replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
          onError: (code) => console.warn(`[tracy-website-opportunities] handoff: ${code}`)
        }),
      'tracy-website-opportunities: handoff'
    )
  }

  // Settings › Website Opportunities (user group, after Notifications at 22).
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        group: 'user',
        order: 23,
        label: () => t('tab.title'),
        inject: () => ({ t, api })
      },
      SettingsSection
    )
  )
}
