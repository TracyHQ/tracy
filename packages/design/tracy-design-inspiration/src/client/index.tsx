/**
 * `tracy-design-inspiration` — the 152 design inspirations as ONE tab type of dsh-better-sidebar
 * (`tracy:design-inspiration`; spec `tasks/spec-huong-thiet-ke.md` §3, Lee 05/09). The tab shows the
 * library for the site this lane serves; the site's own content comes from the host half, which
 * reads what the agent wrote in step 1 of `tracy-design-inspiration`.
 *
 * 🔒 THIS PLUGIN HOLDS NO SECRET AND KNOWS NO SEAT. Everything it fetches is its own host half,
 * through `dshUrl()`, on the lane the viewer is already inside.
 */

import { Button, TabLoadingScope, useTabLoading } from '@tracy/ui'
import { Palette } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'
import { mainSessionOf } from '@tracy/core/session'
import { siteNameFor, type NamedSiteRow } from '@tracy/core/site-key'
import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'
import { type OpenTab, type SidebarRight, sidebarRightOf } from '@tracy/core/tab-link'

import { fetchCatalog, fetchSite, type Inspiration, LibraryError, type SitePreview } from './api'
import { agentReachable, type InputActions, parkComposer } from './composer'
import { currentSiteKey, inOnboarding, markChosenDesign, onboardingBuildUrl } from './dsh-url'
import { Gallery } from './Gallery'
import { PicksRow } from './PicksRow'
import { picksDefinition, selectPicks, type TurnTailOwnerLike } from './picks'
import { landBuildTab } from './build-handoff.mjs'
import { claimPress, platformPressOf, withPlatformChip } from './platform-press.mjs'
import { presetFor } from './preset-for.mjs'
import { en, NS, type Translate } from './strings'
import { TAILWIND } from './styles'
import { useViewAddress } from './view-address'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'
import { uiSwitches } from '@tracy/core/ui-switches'
import { DesignSystemTab } from './DesignSystemTab'
import { mountTemplatePicker } from './TemplatePicker'
import { mountTryBar } from './try-bar-host'
import { DS_TOOLBAR_SWITCH, watchDesignSystemToolbar } from './design-system-toolbar.mjs'

const TAB = 'tracy:design-inspiration'
/** The site's Design system tab, opened from the start screen's Design system row. */
const DS_TAB = 'tracy:design-system'
const BROWSER_TAB = 'tracy:browser'

interface Meta {
  siteKey?: string
}

interface SidebarTabLike {
  id: string
  type: string
  title: string
  meta?: unknown
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  /**
   * Every open lands in dsh's native right column and expands it (better-sidebar 0.21.1), so a
   * press is always in sight. `scope` names the session the tab lands in.
   */
  openTab?: (seed: { type: string; title?: string; meta?: unknown }, scope?: { sessionId: string }) => void
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  getSnapshot?: () => { sessionId?: string; state?: unknown }
  /** 0.21.1-tracy.1+: the open tabs of one type — how a press finds the tab it landed on. */
  openTabsOf?: (type: string) => readonly OpenTab[]
  /** Reload a Browser tab's page (`undo` = a new change, never absorbed as the turn's own reload). */
  reloadTab?: (tabId: string, mode?: string) => void
  /** The side card's registry changed (a tab type registered or removed). */
  subscribe?: (listener: () => void) => () => void
  /** 0.21.1-tracy.1+: ask every descriptor's `available` again (the + menu and the Start guide). */
  refreshAvailable?: () => void
}

/** dsh's workspace navigation — the service the New session button rides (`ui-workspace`). */
interface UiWorkspace {
  startSession: (workspaceId?: unknown) => void
}

/**
 * The preset a Build press gives its new session (`preset-for.mjs`). `current` is the preset of the
 * session the press landed in; `select` is dsh's own RPC (`remote.agentPresets.select`), which only
 * takes a session that has not run a turn yet — so it is called before the sentence is sent.
 */
interface BuildPresets {
  current: () => string | undefined
  select: (sessionId: string, presetId: string) => Promise<unknown>
  /** Whether a session has run no turn yet — dsh's own `blank` bit off the session list. */
  blank: (sessionId: string) => boolean
}

/** dsh's slot registry, the part this plugin uses (same face `tracy-brand` registers through). */
interface Slots {
  inject: (name: string, register: () => () => void) => void
  register: (options: Record<string, unknown>, component: unknown) => () => void
}

/** dsh's conversation engine: where a Node Definition is registered. */
interface UiConversation {
  events: { register: (definition: unknown) => void }
}

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

type State =
  | { kind: 'reading' }
  | { kind: 'ready'; inspirations: Inspiration[]; site: SitePreview | null }
  | { kind: 'noLibrary' }
  | { kind: 'failed' }

function GalleryTab({
  tab,
  sidebar,
  right,
  workspace,
  presets,
  t
}: {
  tab: SidebarTabLike
  sidebar: BetterSidebar
  /** dsh's right column, read when a press lands (`sidebarRightOf`). */
  right: () => SidebarRight | undefined
  workspace: UiWorkspace
  presets: BuildPresets | null
  t: Translate
}): JSX.Element {
  const meta = (tab.meta ?? {}) as Meta
  const [siteKey] = useState<string | null>(meta.siteKey ?? currentSiteKey())
  const siteName = useSiteName(siteKey)
  const [state, setState] = useState<State>({ kind: 'reading' })
  const [attempt, setAttempt] = useState(0)
  // The filter and the open preview go on the address, beside `?tab=` and `?site=` — so a copied
  // address hands a colleague the view being looked at, not the library from the top.
  const view = useViewAddress()

  // "Change design" in the Add site wizard opens this tab with the CMS the wizard is on, and that
  // CMS's chip is ticked (Akemi, 30/09) — on a fresh tab and on one already open, once per press
  // (`platform-press.mjs`). The customer can untick it; any other way in preselects nothing.
  const press = platformPressOf(tab.meta)
  const pressKey = press?.key ?? null
  useEffect(() => {
    if (press === null || !claimPress(press.key)) return
    // A preview press must reveal its card even when a previous gallery filter excluded it.
    const previewDesign = (tab.meta as { previewDesign?: unknown } | undefined)?.previewDesign
    if (typeof previewDesign === 'string') {
      view.chooseFilter(
        { ticked: new Set(), picked: new Set(), platforms: new Set([press.platform]) },
        previewDesign
      )
    } else {
      view.chooseFilter(withPlatformChip(view.selection, press.platform))
    }
    // Keyed by the press alone: the selection it builds on is read as it stands when the press lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressKey])

  useEffect(() => {
    let live = true
    setState({ kind: 'reading' })
    Promise.all([fetchCatalog(), fetchSite()])
      .then(([inspirations, site]) => {
        if (live) setState({ kind: 'ready', inspirations, site })
      })
      .catch((error: unknown) => {
        if (!live) return
        setState({
          kind: error instanceof LibraryError && error.code === 'NO_LIBRARY' ? 'noLibrary' : 'failed'
        })
      })
    return () => {
      live = false
    }
  }, [attempt])

  // Name the tab after its site, and remember the site across reloads. `lang` re-runs it on a
  // language switch, so an open tab is renamed in the new language (spec #730).
  const lang = useInterfaceLocale()
  useEffect(() => {
    if (siteKey === null || siteName === null || typeof sidebar.updateTab !== 'function') return
    const title = `${t('tab.title')} · ${siteName}`
    if (tab.title !== title || meta.siteKey !== siteKey)
      sidebar.updateTab(tab.id, { title, meta: { siteKey } })
  }, [siteKey, siteName, sidebar, tab.id, tab.title, meta.siteKey, t, lang])

  // The tab's shared loading bar (under the tab strip) runs while the library is read; the body
  // stays empty, no sentence (Akemi, 30/09).
  useTabLoading(state.kind === 'reading')
  if (state.kind === 'reading') return <></>
  if (state.kind === 'noLibrary') {
    return (
      <p className="tracy-design-inspiration px-3 py-4 text-muted-foreground text-sm">
        {t('state.noLibrary')}
      </p>
    )
  }
  if (state.kind === 'failed') {
    return (
      <div className="tracy-design-inspiration flex flex-col items-start gap-2 px-3 py-4 text-muted-foreground text-sm">
        <p className="m-0">{t('state.failed')}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          {t('action.retry')}
        </Button>
      </div>
    )
  }
  return (
    <Gallery
      inspirations={state.inspirations}
      site={state.site}
      openBuild={buildOpener(sidebar, right, workspace, siteKey, presets)}
      selection={view.selection}
      onSelection={view.chooseFilter}
      openId={view.openId}
      onOpenId={view.choosePreview}
      t={t}
    />
  )
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ. Declaring it means this plugin only activates once better-sidebar is up; on a
 * profile without it, cordis leaves the plugin PENDING — silent, and the right failure.
 */
/**
 * The tab a press of "Create with <CMS>" opens: the Add site wizard, the one place a new site is
 * made (Akemi, 24/09/2026: one creation flow). Same value as `@tracy/core/tab-link`'s
 * `creationTabFor()`, kept local because a plugin's client bundle may not value-import another
 * package's runtime.
 *
 * It used to be that CMS's own Build tab (`tracy:build:joomla` and siblings) — a second form, a
 * second way of making a site, and a `POST /api/sites/claim` fired before the first question was
 * asked. What the press carries is unchanged: the design and the platform. Where they land is not.
 */
const creationTab = (): string => 'tracy:add-site'
/** How long to wait for the new session to become the active one before giving up on it. */
const SESSION_WAIT_MS = 8000
/** And for its composer to be handed to the dock occupant, once the session is active. */
const COMPOSER_WAIT_MS = 5000
const POLL_MS = 100

/** Poll `read` until it answers non-null, or the budget runs out. */
async function waitFor<T>(read: () => T | null, budgetMs: number): Promise<T | null> {
  const until = Date.now() + budgetMs
  for (;;) {
    const value = read()
    if (value !== null) return value
    if (Date.now() >= until) return null
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

/**
 * Create with <CMS>: a NEW session, then the Build tab in it, then the decision in its chat.
 *
 * WHY A NEW SESSION (Lee, 08/09 01:0x). The press lands while the customer may be mid-conversation
 * about something else; dropping "Build X with WordPress" into that thread derails it, and the
 * build's own questions and answers then share a transcript with unrelated work. So the flow opens
 * a fresh session in the SAME workspace — their tabs and their other sessions are untouched, since
 * a side card's tabs are per-session state.
 *
 * WHY THE WAITS. `startSession` returns before the session exists (measured on production 08/09:
 * ~1s for the request it fires). Opening the tab or sending the message too early lands both in the
 * OLD session — the exact accident this flow exists to avoid. So: wait for the active session id to
 * change, then select the CMS preset and wait for that session's composer. Both waits are bounded;
 * a failed setup leaves a visible error in the Build tab, preserving the original conversation.
 */
function buildOpener(
  sidebar: BetterSidebar,
  right: () => SidebarRight | undefined,
  workspace: UiWorkspace,
  siteKey: string | null,
  presets: BuildPresets | null
): ((platform: string, inspiration: Inspiration, message: string) => void) | null {
  if (typeof sidebar.openTab !== 'function') return null
  return (platform, inspiration, message) => {
    // 🔒 A NEW SITE IS NEVER BUILT FROM INSIDE ANOTHER SITE'S WORKSPACE (13/09, plan §2 row 6). A
    // press here used to start a session in the workspace in sight — a SITE's, when the library
    // was opened from one — so the build's job file, its ask and its progress were written into
    // that site's folder, and the agent dressing the new site stood in the old one. The press now
    // goes to the viewer's own creation workspace (`/new/`), where tracy-web mints a seat on no
    // site at all and the side card opens the Build tab from the address (`tracy-tab-link`). From
    // the creation workspace itself the press stays in place: there is nothing to leave.
    if (!inOnboarding()) {
      location.assign(onboardingBuildUrl(inspiration.id, platform))
      return
    }
    // The pick, said on the address before the tab opens — the wizard reads it from there, and
    // this is the only way in that does not pass through tracy-web to have it written.
    markChosenDesign(inspiration.id)
    // `pressedAt`: this tab was opened by a press, now — the Build tab in the creation workspace
    // claims a site on its own only for a fresh press, never for a tab restored from last time.
    // What the wizard reads: `design` is the template it starts from, `platform` the CMS it opens
    // on. The rest is what the Build tab wanted and is harmless to carry — a tab that no longer
    // reads it simply ignores it, and leaving it in keeps this press one shape across the change.
    const meta = {
      siteKey: siteKey ?? undefined,
      id: inspiration.id,
      design: inspiration.id,
      name: inspiration.name,
      platform,
      pressedAt: Date.now()
    }
    /**
     * `why` is logged, never shown: the sentence a customer reads is the same whichever of the four
     * ways this can fail, and without it they are indistinguishable from each other. Measured
     * 12/09 on a loaded dev machine — the tab said "could not be prepared" and nothing anywhere
     * said which of the two budgets above had run out, or whether a preset had been refused.
     */
    const open = (
      scope?: { sessionId: string },
      setupFailed = false,
      why = '',
      setupPending = false
    ): void => {
      if (why) console.warn(`[tracy-design-inspiration] build handoff: ${why}`)
      // Three opens of one tab (pending → form | failed): `landBuildTab` is what makes the second
      // one change the tab the first one left — the native column would only focus it (see that
      // helper).
      landBuildTab(
        sidebar,
        right(),
        { type: creationTab(), meta: { ...meta, setupFailed, setupPending } },
        scope
      )
    }
    const before = sidebar.getSnapshot?.().sessionId
    // Decided BEFORE the new session exists: `current` reads the session the press landed in.
    const preset = presetFor(presets?.current(), platform)
    if (
      typeof workspace.startSession !== 'function' ||
      typeof sidebar.getSnapshot !== 'function' ||
      !preset ||
      !presets
    ) {
      open(undefined, true, 'this composition cannot start a session or select a preset')
      return
    }
    // Show the Build tab immediately. Session creation and preset selection are asynchronous, but
    // the customer should see that the click was accepted instead of waiting on a blank sidebar.
    open(undefined, false, '', true)
    try {
      workspace.startSession()
    } catch {
      open(undefined, true, 'startSession threw')
      return
    }
    void (async () => {
      // 🔒 A BLANK SESSION IS HANDED BACK, NOT REPLACED. dsh's `connectWorkspace` returns the
      // workspace's blank session instead of making a second one, so on a site that has not
      // spoken yet the id never changes and the wait below runs out — every press on a fresh
      // workspace ended in "could not be prepared" (measured 13/09, local stack). A blank
      // session has run no turn, which is the one thing the preset needs, so it IS the fresh one.
      const fresh =
        before !== undefined && presets.blank(before)
          ? before
          : await waitFor(() => {
              const now = sidebar.getSnapshot?.().sessionId
              return now !== undefined && now !== before ? now : null
            }, SESSION_WAIT_MS)
      if (fresh === null) {
        open(undefined, true, `no new session within ${SESSION_WAIT_MS}ms`)
        return
      }
      // The platform's preset, on the session that has not spoken yet. A press of "Build with
      // Joomla" used to open a session wearing the WordPress preset (measured 09/09): the tools the
      // agent then held were the other CMS's. dsh refuses the change once a turn has run, so this
      // goes before the sentence. A refused preset leaves a visible error, never a wrong agent.
      try {
        const selected = await presets.select(fresh, preset)
        if (selected && typeof selected === 'object' && 'ok' in selected && selected.ok === false)
          throw new Error('Preset selection failed')
      } catch {
        open({ sessionId: fresh }, true, 'the platform preset was refused')
        return
      }
      // The dock occupant re-parks the composer on every render of the active session; the message
      // rides it, so it cannot be sent before that session's input exists.
      const ready = await waitFor(() => (agentReachable() ? true : null), COMPOSER_WAIT_MS)
      if (!ready || sidebar.getSnapshot?.().sessionId !== fresh) {
        open({ sessionId: fresh }, true, `composer not parked within ${COMPOSER_WAIT_MS}ms`)
        return
      }
      open({ sessionId: fresh })
      // The sentence that asked the agent to write its own questions (`message`) is no longer
      // sent: every press now lands in the creation workspace, where the Build tab shows the
      // standard questions at once — there is no site for an agent to read, and a model
      // round-trip is not what a first form waits on. The agent hears from the customer when the
      // answers are in. The parameter stays so the Gallery and the picks row keep one signature.
      void message
    })()
  }
}

/**
 * Cordis exposes nested remotes through the direct property on newer shells and through `get`
 * while a profile is booting (the latter is how ui-sidebar resolves uiWorkspace). Resolve both so
 * the customer-facing Create action does not report a preparation failure merely because the
 * service accessor differs between dsh profiles.
 */
export function presetServices(ctx: {
  get?: (name: string) => unknown
  remote?: { agentPresets?: { select?: (sessionId: string, presetId: string) => Promise<unknown> } }
  sessions?: {
    list?: {
      getSnapshot: () => {
        byId: Record<
          string,
          | {
              blank?: boolean
              projectionValues?: { agentPreset?: unknown }
              retainedBy?: Readonly<Partial<Record<string, number>>>
            }
          | undefined
        >
      }
    }
  }
}): {
  select?: (sessionId: string, presetId: string) => Promise<unknown>
  snapshot?: () => {
    byId: Record<
      string,
      | {
          blank?: boolean
          projectionValues?: { agentPreset?: unknown }
          retainedBy?: Readonly<Partial<Record<string, number>>>
        }
      | undefined
    >
  }
} {
  const remote = (ctx.get?.('remote') ?? ctx.remote) as
    | { agentPresets?: { select?: (sessionId: string, presetId: string) => Promise<unknown> } }
    | undefined
  const nested = (ctx.get?.('remote.agentPresets') ?? remote?.agentPresets) as
    | { select?: (sessionId: string, presetId: string) => Promise<unknown> }
    | undefined
  const sessions = (ctx.get?.('sessions') ?? ctx.sessions) as typeof ctx.sessions
  return {
    select: nested?.select,
    snapshot: sessions?.list?.getSnapshot
  }
}

// `remote.agentPresets` and `sessions` are what `tracy-mode-picker` injects for the same two reads:
// the preset RPC, and the current session's preset off the session list.
export const inject = [
  'betterSidebar',
  'locale',
  'slots',
  'uiConversation',
  'uiWorkspace',
  'remote',
  'remote.agentPresets',
  'sessions'
]

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

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  slots: Slots
  uiConversation: UiConversation
  uiWorkspace: UiWorkspace
  remote?: { agentPresets?: { select?: (sessionId: string, presetId: string) => Promise<unknown> } }
  sessions?: {
    list?: {
      getSnapshot: () => {
        byId: Record<
          string,
          | {
              blank?: boolean
              projectionValues?: { agentPreset?: unknown }
              retainedBy?: Readonly<Partial<Record<string, number>>>
            }
          | undefined
        >
      }
    }
  }
}): void {
  /**
   * Optional on purpose: a surface without the preset RPC (an older profile, a test host) still
   * builds — the new session simply keeps the workspace default, as it did before 09/09.
   */
  const resolved = presetServices(ctx)
  const select = resolved.select
  const snapshot = resolved.snapshot
  const presets: BuildPresets | null =
    typeof select === 'function' && typeof snapshot === 'function'
      ? {
          current: () => {
            // The conversation on screen is `mainSessionOf`, never `list.current`, which left the
            // sessions list in dsh 0.1.6-alpha.2 and reads `undefined` on every snapshot.
            const list = snapshot()
            const shown = mainSessionOf(list)
            const value = shown === undefined ? undefined : list.byId[shown]?.projectionValues?.agentPreset
            return typeof value === 'string' ? value : undefined
          },
          select: (sessionId, presetId) => select(sessionId, presetId),
          blank: (sessionId) => snapshot().byId[sessionId]?.blank === true
        }
      : null
  /**
   * `ui-workspace` is reached the way `tracy-sidebar` reaches it — through `ctx.get`, with the
   * property as the fallback. Measured 08/09 01:2x: `ctx.uiWorkspace.startSession` was not a
   * function on this surface while `ctx.get('uiWorkspace').startSession` was, so a press fell back
   * to the current session and the new one was never created.
   */
  const workspaceService = (): UiWorkspace => {
    const viaGet = ctx.get?.('uiWorkspace') as UiWorkspace | undefined
    return typeof viaGet?.startSession === 'function' ? viaGet : ctx.uiWorkspace
  }
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-design-inspiration="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyDesignInspiration = '1'
    el.textContent = TAILWIND
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-design-inspiration: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-design-inspiration: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => mountTemplatePicker(t), 'tracy-design-inspiration: template picker')

  // 🔒 Wrapped in `ctx.effect`: `registerTab` returns a disposer; without it HMR or a plugin
  // toggle leaves the old registration and the next activation throws "already registered".
  ctx.effect(
    () =>
      ctx.betterSidebar.registerTab({
        id: TAB,
        title: () => t('tab.title'),
        icon: (size: number) => <Palette size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 7,
        // One tab per site: a second open of the same site lands on the tab already there.
        dedupeKey: (tab: SidebarTabLike) => `${TAB}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
        component: ({ tab }: { tab: SidebarTabLike }) => (
          <TabLoadingScope label={t('loading.label')}>
            <GalleryTab
              tab={tab}
              sidebar={ctx.betterSidebar}
              right={() => sidebarRightOf(ctx)}
              workspace={workspaceService()}
              presets={presets}
              t={t}
            />
          </TabLoadingScope>
        )
      }),
    'tracy-design-inspiration: tab'
  )

  /** After the site's look changed (apply or undo): every open Browser tab shows the site afresh. */
  const reloadBrowserTabs = (): void => {
    const bar = ctx.betterSidebar
    for (const open of bar.openTabsOf?.(BROWSER_TAB) ?? []) bar.reloadTab?.(open.id, 'undo')
  }

  // The try's bar (`TryBar.tsx`), in a root of the plugin's own on the page: it must outlive the Design
  // system tab, which the Browser tab unmounts when a try lands (13/10/2026; `try-store.mjs`).
  ctx.effect(() => mountTryBar({ t, onChanged: reloadBrowserTabs }), 'tracy-design-inspiration: try bar')

  // The site's Design system tab (plan tasks/ke-hoach-nut-design-system.md), opened from the start
  // screen's Design system row. Off with the operator's switch `toolbar-design-system`, which also
  // governs the tab type (`catalogue.json` tabs).
  // The + menu and the Start guide list it when the operator turns `launch-design-system` on (the side
  // card's tab policy, `@tracy/core/ui-switches`), and only while `toolbar-design-system` is on too:
  // `available` reads it, and the side card is asked again once the switches land.
  ctx.effect(
    () => uiSwitches().subscribe(() => ctx.betterSidebar.refreshAvailable?.()),
    'tracy-design-inspiration: design system listing follows the switches'
  )
  ctx.effect(
    () =>
      ctx.betterSidebar.registerTab({
        id: DS_TAB,
        title: () => t('ds.tab.title'),
        icon: (size: number) => <Palette size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 8,
        available: () => uiSwitches().isShown(DS_TOOLBAR_SWITCH),
        dedupeKey: (tab: SidebarTabLike) => `${DS_TAB}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
        component: ({ tab }: { tab: SidebarTabLike }) => (
          <DesignSystemTab
            siteKey={((tab.meta ?? {}) as Meta).siteKey ?? currentSiteKey()}
            t={t}
            onBuild={(platform) => {
              const siteKey = ((tab.meta ?? {}) as Meta).siteKey ?? currentSiteKey()
              if (siteKey) ctx.betterSidebar.openTab?.({ type: `tracy:build:${platform}`, meta: { siteKey } })
            }}
            onChanged={reloadBrowserTabs}
            onApplied={() => {
              // WHERE A TRY LANDS (Akemi, 13/10/2026, D1): the normal workspace, the chat on the left and the
              // site's Browser panel on the right, not this tab. `openTab({type: 'tracy:browser'})` is the
              // activating call on dsh's native right column: better-sidebar hands it to the column as
              // `surface.openTab({kind, revealIfOpened: true})` (the Browser kind mints no tab of its own, one
              // page per pane), and the column's `openContent` either FOCUSES the Browser page already in the
              // pane (`focusTab`) or seats a new one as the pane's active tab (`openTab` sets the pane's
              // activeTabId) — so the Browser tab is the active one and this tab is UNMOUNTED (measured on dev
              // 13/10/2026). The bar (`TryBar.tsx`) is therefore the plugin's own root on the page, over the
              // try the plugin module holds (`try-store.mjs`), so Undo and Keep are there too. Verified in
              // `test/try-on-landing.test.mjs` against the plugin's own `apply()`.
              const siteKey = ((tab.meta ?? {}) as Meta).siteKey ?? currentSiteKey()
              if (siteKey) ctx.betterSidebar.openTab?.({ type: BROWSER_TAB, meta: { siteKey } })
            }}
          />
        )
      }),
    'tracy-design-inspiration: design system tab'
  )
  ctx.effect(() => {
    const ui = uiSwitches()
    const bar = ctx.betterSidebar
    return watchDesignSystemToolbar({
      siteKey: currentSiteKey(),
      target: window,
      isShown: () => ui.isShown(DS_TOOLBAR_SWITCH),
      open: (siteKey, sessionId) =>
        bar.openTab?.({ type: DS_TAB, meta: { siteKey } }, sessionId ? { sessionId } : undefined)
    })
  }, 'tracy-design-inspiration: design system tab opener')

  // The entrance in the conversation (spec §4): the agent's `tracy_design_propose` call becomes
  // turn data, and the tail of that turn draws the three cards. Same seam dsh's own
  // produced-files row uses (`ui-deliverables`).
  ctx.uiConversation.events.register(picksDefinition)

  // An invisible occupant of the input dock: dsh hands `inputActions` (setDraft, submit) only to
  // occupants, and the dialog needs them to ask the agent for a rewrite (spec §4f decision 6). It
  // renders nothing; it only parks the actions of the active session in `composer.ts`.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-design-composer', order: 90 },
      ({ inputActions }: { inputActions?: InputActions }) => {
        parkComposer(inputActions)
        return null
      }
    )
  )
  const openLibrary =
    typeof ctx.betterSidebar.openTab === 'function'
      ? () => ctx.betterSidebar.openTab?.({ type: TAB, meta: { siteKey: currentSiteKey() ?? undefined } })
      : null
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        // The id names the CELL this entry occupies. dsh requires one for a list slot and throws
        // at register time without it — a throw that takes the whole client boot down, not just
        // this row. A fresh id sits beside the shipped entries; reusing a shipped one replaces it.
        id: 'tracy-design-picks'
      },
      // dsh evaluates `select` for chain slots only; a list entry always renders with the owner
      // props (`ui-renderer` `scoped-slots.tsx`), so the selector runs here and the row renders
      // nothing for a turn that proposed no picks (measured 26/09/2026 as a crash on every tail).
      (owner: TurnTailOwnerLike) => {
        const picks = selectPicks(owner)
        return picks === null ? null : (
          <PicksRow
            picks={picks}
            openLibrary={openLibrary}
            openBuild={buildOpener(
              ctx.betterSidebar,
              () => sidebarRightOf(ctx),
              workspaceService(),
              currentSiteKey(),
              presets
            )}
            t={t}
          />
        )
      }
    )
  )
}
