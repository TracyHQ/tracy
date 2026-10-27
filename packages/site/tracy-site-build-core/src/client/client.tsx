/**
 * The client half every Build plugin shares: the Build tab on the side card, the running card of
 * the plugin's tool call, and the picture card at the tail of the turn that built the site.
 * Design-inspiration's preview opens the tab (`betterSidebar.openTab({ type: <tab>, meta })`) when
 * the customer presses Create with <platform>; from there everything is the plugin's — and the
 * plugin is one of two, made here from what is the CMS's own (`makeSiteBuildClient`).
 */
import { type JSX, type ReactNode, useMemo } from 'react'

import { type BuildApi, makeApi } from './api'
import { type BlockLike, BuildCard } from './BuildCard'
import { type Meta, type TabSpec } from './BuildTab'
import { BuildWorkspace, type WorkspaceSpec } from './BuildWorkspace'
import { BuiltRow } from './BuiltRow'
import { makeBuiltDefinition, selectBuilt, type TurnTailOwnerLike } from './built'
import { type InputActions, parkComposer } from './composer'
import { readCarry } from './carry.mjs'
import { claimHere, openClaimedSite } from './claim-session.mjs'
import { currentSiteKey, inOnboarding } from './dsh-url'
import { type BrowserProps, LiveSiteTab } from './LiveSiteTab'
import { listsTabsFor, loadPlatforms } from './site-platform.mjs'
import type { Translate } from './strings'
import { type OpenTab, openTabWithMeta, sidebarRightOf } from '@tracy/core/tab-link'

interface SidebarTabLike {
  id: string
  type: string
  title: string
  meta?: unknown
}
interface BetterSidebar {
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  registerTab: (descriptor: Record<string, unknown>) => () => void
  openTab?: (seed: { type: string; title?: string; meta?: unknown }, scope?: { sessionId: string }) => void
  getTab?: (id: string) => { component: (props: BrowserProps) => ReactNode } | undefined
  isTabEnabled?: (id: string) => boolean
  getSnapshot?: () => { sessionId?: string }
  /** 0.21.1-tracy.1+: the open tabs of one type — how an open finds the tab it landed on. */
  openTabsOf?: (type: string) => readonly OpenTab[]
  /** 0.21.1-tracy.1+: re-ask every descriptor's `available` (the native guide lists by it). */
  refreshAvailable?: () => void
}

/**
 * The side card's site preview: a page kind of dsh's native right column since better-sidebar
 * 0.21.1 (`tracy:browser`, Tracy's fork — upstream's `browser` tab is gone). Its component is
 * borrowed in place by the workspace's preview toggle (`ScopedLive`).
 */
const PREVIEW_TAB = 'tracy:browser'
interface Slots {
  inject: (name: string, register: () => () => void) => void
  register: (options: Record<string, unknown>, component: unknown) => () => void
}
interface UiConversation {
  events: { register: (definition: unknown) => void }
}
interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

/**
 * dsh's own session and workspace services, as the claim's second half uses them
 * (`claim-session.mjs`, which is plain JavaScript and carries no types of its own).
 *
 * `workspaces.create` is idempotent — a folder already registered answers the same workspace — and,
 * for a seat, allowed inside the seat's own folder (ADR 0003's box rule).
 */
export interface ShellServices {
  sessions: {
    create: (input: { cwd: string } | { workspaceId: string }) => Promise<string>
    open: (id: string) => void
    refresh: () => Promise<void>
    list: {
      getSnapshot: () => {
        current?: string
        phase?: string
        byId: Record<string, { cwd?: string } | undefined>
      }
    }
  }
  remote: { agentPresets: { select: (id: string, preset: string) => Promise<unknown> } }
  workspaces: { create: (input: { path: string }) => Promise<{ workspaceId?: string } | unknown> }
}

/** What dsh hands the client half. The plugin declares these names as `inject`. */
export interface ClientContext extends ShellServices {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /** Services probed rather than injected — dsh's right column (`sidebarRightOf`). */
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  slots: Slots
  uiConversation: UiConversation
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ. The plugin re-exports this as its `inject`; declaring it means the plugin only
 * activates once better-sidebar is up.
 */
export const CLIENT_INJECT = [
  'betterSidebar',
  'locale',
  'slots',
  'uiConversation',
  'sessions',
  'remote',
  'remote.agentPresets',
  'workspaces'
] as const

/** What makes one Build plugin's client the WordPress one or the Joomla one. */
export interface ClientSpec {
  /** The cordis plugin name, and the `data-*` mark on the style tag. */
  name: string
  /** The locale namespace this plugin owns (`NS` of its strings.ts). */
  ns: string
  /** The English table: the base plus the CMS's own stage lines. */
  en: Record<string, string>
  /** The sidebar tab type: `tracy:build:wordpress`. Design-inspiration opens it by this name. */
  tab: string
  /**
   * The tab's icon: the CMS's own mark, at the size better-sidebar asks for.
   *
   * 🔒 THE ICON IS WHAT TELLS THE TWO TABS APART. Both are called "Build" — that is the customer's
   * word for what the tab does, and neither plugin gets to keep it to itself — so in the side
   * card's + menu they read as one entry twice (measured 09/09, the first press after the split).
   * The platform mark is the difference the customer already knows from the Create with buttons;
   * the title stays the plain word.
   */
  icon: (size: number) => JSX.Element
  /** The agent's tool: `tracy_site_build_wordpress`. */
  tool: string
  platform: string
  platformName: string
  stages: readonly string[]
  /** Restrict choices to language packs supported by this CMS's registered installer. */
  allowedLanguages?: readonly string[]
  /** The CSS Tailwind generated at build time for this plugin. */
  css: string
  /** Where this CMS's admin lives, for the workspace's Admin view and per-row links. */
  workspace?: WorkspaceSpec
}

/**
 * The key one Build tab is told apart from another by: the site, when the tab is for one; the
 * inspiration otherwise (the creation workspace, where no site exists yet and each press is a
 * different site to be). Exported so `@tracy/dsh-tab-link` and `tracy-design-inspiration` open the
 * tab with an id that follows the same rule.
 */
export function buildTabDedupeKey(tab: string, meta: Meta): string {
  return meta.siteKey ? `${tab}:${meta.siteKey}` : `${tab}::${meta.id ?? ''}`
}

/** The plugin's `apply`, made from what is the CMS's own. */
export function makeSiteBuildClient(spec: ClientSpec): (ctx: ClientContext) => void {
  // The host half answers at `/api/<name>`; `makeApi` spells that, so no client file carries the path.
  const api: BuildApi = makeApi({ name: spec.name, stages: spec.stages })
  const tabSpec: TabSpec = {
    api,
    platform: spec.platform,
    platformName: spec.platformName,
    allowedLanguages: spec.allowedLanguages
  }
  const builtDefinition = makeBuiltDefinition(spec.tool)
  const mark = spec.name

  return function apply(ctx: ClientContext): void {
    // One style tag per PLUGIN, not per page: the two plugins' sheets differ by the classes their
    // own forms use, so one skipping because the other is there would lose those.
    ctx.effect(() => {
      if (document.querySelector(`style[data-tracy-site-build="${mark}"]`)) return
      const el = document.createElement('style')
      el.dataset.tracySiteBuild = mark
      el.textContent = spec.css
      document.head.appendChild(el)
      return () => el.remove()
    }, `${spec.name}: styles`)

    ctx.effect(() => ctx.locale.register(spec.ns, { en: spec.en }), `${spec.name}: dictionaries`)
    const t = ctx.locale.bind(spec.ns)
    const liveTab = `tracy:live-${spec.platform}`
    const apiFor = (sessionId: string) => makeApi({ name: spec.name, stages: spec.stages }, sessionId)

    /**
     * A site this browser just claimed by name: register its folder as a workspace, start a session
     * in it, and open the Build tab there — the second half of the press, in the site it belongs to
     * (`claim-session.ts`). Once per page: the effect runs when the plugin loads, and a session
     * already standing in the folder is opened rather than doubled.
     */
    ctx.effect(() => {
      const carry = claimHere(readCarry())
      // 🔒 ONLY THE CMS THAT WAS PRESSED. All three Build plugins load this same file, so without
      // this every claim opened three Build tabs — WordPress's and Joomla's forms beside the one
      // the customer asked for (measured 15/09).
      if (!carry || carry.platform !== spec.platform) return
      let live = true
      void openClaimedSite(carry, {
        services: ctx,
        openBuild: (sessionId, value) => {
          if (!live) return
          const meta = {
            id: value.id,
            name: value.name ?? value.id,
            platform: value.platform,
            siteKey: value.siteKey
          }
          // 🔒 NO SCOPE ONCE THE SIDE CARD IS ALREADY ON THIS SESSION. A scoped open is a TARGETED
          // one, which lands in that session's column without bringing it on screen — so the form
          // the customer is waiting to fill sat out of sight, and only a reload showed it.
          // `openClaimedSite` waits for the side card to arrive before calling this; the scope stays
          // for the case where it never does.
          const on = ctx.betterSidebar.getSnapshot?.()?.sessionId
          const scope = on === sessionId ? undefined : { sessionId }
          // A Build tab `tracy-tab-link` already opened from the address (`?tab=&site=`) carries no
          // inspiration, and the native column keeps one tab per kind: this open FOCUSES it and keeps
          // its first meta — the header then reads nothing where a name belongs (measured 22/09 on
          // `site-re6yn5` under the old side card, same rule). `openTabWithMeta` patches the tab the
          // open landed on, and only in the session on screen.
          openTabWithMeta(ctx.betterSidebar, sidebarRightOf(ctx), { type: spec.tab, meta }, scope)
        }
      }).catch(() => undefined)
      return () => {
        live = false
      }
    }, `${spec.name}: a claimed site opens its own session`)

    /**
     * The platform's preset on a creation-workspace session, best effort. A press on the public
     * page arrives through `tracy-tab-link`, which starts a session and opens this tab but selects
     * no preset; the agent that then hears the brief would be whichever persona the shell defaults
     * to. Same choice `tracy-design-inspiration` makes for a press inside a workspace
     * (`designer-<platform>`), and the same refusal dsh gives once a turn has run — ignored here,
     * because the form does not depend on it.
     */
    const presetsOf = () => {
      const nested = (ctx as { get?: (name: string) => unknown }).get?.('remote.agentPresets') as
        | { select?: (sessionId: string, presetId: string) => Promise<unknown> }
        | undefined
      return nested?.select ? nested : ctx.remote?.agentPresets
    }
    const presetEnsured = new Set<string>()
    /** This page is a site a press claimed and has not built yet — the carry says so. */
    const continuingClaim = (): boolean => {
      const carried = readCarry()
      return carried?.siteKey !== undefined && carried.siteKey === currentSiteKey()
    }
    const ensurePreset = (sessionId: string) => {
      // In the creation workspace, and in a site whose build has not started yet: a claim's second
      // half opens a fresh session in the site (`todo-claim-then-workspace.md`), and that session
      // needs the CMS's persona just as the first one did. dsh refuses the change once a turn has
      // run, which is what keeps this off a working session.
      if ((!inOnboarding() && !continuingClaim()) || presetEnsured.has(sessionId)) return
      presetEnsured.add(sessionId)
      const presets = presetsOf()
      if (typeof presets?.select !== 'function') return
      void Promise.resolve(presets.select(sessionId, `designer-${spec.platform}`)).catch(() => undefined)
    }

    /**
     * The Build tab on one session: the questionnaire until a build has a site, the workspace
     * after. The tab remembers its site through its meta (`updateTab`), so a reload finds the same
     * job — and a second press on the same site lands here (`dedupeKey`), not on a twin.
     *
     * No Live tab opens on its own any more (Lee, 13/09: PA B): the workspace's preview toggle
     * borrows the browser in place. The Live tab type stays registered so a tab saved under it
     * before still renders.
     */
    function ScopedBuild(props: BrowserProps): JSX.Element {
      const { tab, scope } = props
      ensurePreset(scope.sessionId)
      const meta = (tab.meta ?? {}) as Meta
      const scoped = useMemo(
        () => ({
          ...tabSpec,
          api: apiFor(scope.sessionId),
          onStarted: (job: import('./api').Job) => {
            if (job.targetSiteKey && job.targetSiteKey !== meta.siteKey)
              ctx.betterSidebar.updateTab?.(tab.id, { meta: { ...meta, siteKey: job.targetSiteKey } })
          },
          // A provision that died takes the same road as a job that started: into the tab's meta,
          // where it outlives the component. Without it, leaving this workspace and coming back
          // showed "Tracy is preparing a few questions…" for a site that was never stood up.
          onProvisionFailed: (failed: { siteKey: string; message: string } | null) => {
            ctx.betterSidebar.updateTab?.(tab.id, {
              meta: { ...meta, provisionFailed: failed ?? undefined }
            })
          }
        }),
        [scope.sessionId, tab.id, meta.siteKey]
      )
      return (
        <BuildWorkspace
          key={`${scope.sessionId}:${meta.siteKey ?? ''}`}
          spec={scoped}
          workspace={spec.workspace ?? {}}
          meta={meta}
          t={t}
          icon={spec.icon(16)}
          onViewChange={(title) => ctx.betterSidebar.updateTab?.(tab.id, { title })}
          // The browser needs everything better-sidebar handed this tab (its store among them), so
          // the host props travel whole; only the site and the visibility are this tab's to say.
          preview={(siteKey) => (
            <ScopedLive {...props} visible tab={{ ...tab, meta: { ...meta, siteKey } }} />
          )}
        />
      )
    }

    function ScopedLive(props: BrowserProps): JSX.Element {
      const scopedApi = useMemo(() => apiFor(props.scope.sessionId), [props.scope.sessionId])
      const browser =
        ctx.betterSidebar.isTabEnabled?.(PREVIEW_TAB) === false
          ? undefined
          : ctx.betterSidebar.getTab?.(PREVIEW_TAB)?.component
      return (
        <LiveSiteTab
          api={scopedApi}
          browser={browser}
          browserProps={props}
          // A tab opened from the native column's guide carries no meta (dsh mints the tab, not an
          // opener of ours), so the site is the page's own — `currentSiteKey()` reads the
          // `/<siteKey>` mount. Without this the guide's Live site stayed at "Creating your site…"
          // on a finished site (measured 26/09/2026 on the local stand). A tab an opener minted
          // with `meta.siteKey` keeps that site, as before.
          siteKey={((props.tab.meta ?? {}) as Meta).siteKey ?? currentSiteKey() ?? ''}
          // The plugin IS the platform — `spec.platform` is what `Create with <platform>` pressed.
          platform={spec.platform}
          t={t}
        />
      )
    }

    // Warm before any menu opens: `listsTabsFor` answers `true` for a site it does not know yet, so
    // an unwarmed cache means the guide lists all three platforms — the state this replaced. The
    // side card cannot see the cache fill, so ask it to re-read `available` once it has
    // (`refreshAvailable`, better-sidebar 0.21.1-tracy.1; absent on an older side card).
    void loadPlatforms().then(() => ctx.betterSidebar.refreshAvailable?.())

    ctx.effect(
      () =>
        ctx.betterSidebar.registerTab({
          id: liveTab,
          title: () => t('preview.title'),
          icon: spec.icon,
          order: 10,
          // Three Build plugins ship in one image; only one of them is this site's CMS.
          available: (_c: unknown, scope: { cwd?: string }) => listsTabsFor(scope?.cwd, spec.platform),
          dedupeKey: (tab: SidebarTabLike) => `${liveTab}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
          component: ScopedLive
        }),
      `${spec.name}: live site tab`
    )

    // 🔒 Wrapped in `ctx.effect`: `registerTab` returns a disposer; without it HMR or a plugin
    // toggle leaves the old registration and the next activation throws "already registered".
    ctx.effect(
      () =>
        ctx.betterSidebar.registerTab({
          id: spec.tab,
          title: () => t('tab.title'),
          icon: (size: number) => spec.icon(size),
          order: 9,
          available: (_c: unknown, scope: { cwd?: string }) => listsTabsFor(scope?.cwd, spec.platform),
          // One tab per site — a second press for the same site lands on the tab already there.
          // With NO site (the creation workspace, where every press is for a site that does not
          // exist yet) one tab per INSPIRATION instead: the side card keeps an existing tab's meta
          // on a dedupe focus, so a second inspiration under one key kept showing the first one's
          // form (measured 13/09: Airbnb pressed, Stripe shown). `buildTabId` below is the id the
          // openers pass for the same reason — the side card also treats an id match as a focus.
          dedupeKey: (tab: SidebarTabLike) => buildTabDedupeKey(spec.tab, (tab.meta ?? {}) as Meta),
          component: ScopedBuild
        }),
      `${spec.name}: tab`
    )

    // An invisible occupant of the input dock: dsh hands `inputActions` (setDraft, submit) only to
    // occupants, and the form posts the customer's answers into the chat through them.
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register(
        { name: 'conversation.input.dock', id: `${spec.name}-composer`, order: 91 },
        ({ inputActions }: { inputActions?: InputActions }) => {
          parkComposer(inputActions)
          return null
        }
      )
    )

    // The running card: dsh dispatches `tool.call.toolview` by wire tool name, and the component
    // sees the call while it is still running (measured 07/09 on lucaswp).
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register(
        { name: 'tool.call.toolview', key: spec.tool },
        ({ block }: { block: BlockLike }) => <BuildCard api={api} block={block} t={t} />
      )
    )

    // The picture card: the turn's tail, once the build settled (dsh folds the tool call itself).
    ctx.uiConversation.events.register(builtDefinition)
    const openBuild =
      typeof ctx.betterSidebar.openTab === 'function'
        ? () =>
            ctx.betterSidebar.openTab?.({ type: spec.tab, meta: { siteKey: currentSiteKey() ?? undefined } })
        : null
    ctx.slots.inject('conversation.chat.turnTail', () =>
      ctx.slots.register(
        {
          name: 'conversation.chat.turnTail',
          // One cell per Build plugin: this factory runs once per CMS spec, and a shared id would
          // mean the second registration REPLACES the first rather than sitting beside it. dsh
          // requires the id at register time and throws without it, taking the client boot with it.
          id: `tracy-site-built-${spec.tool}`
        },
        // A LIST entry renders on every turn with the owner props only: dsh's renderer evaluates
        // `select` for chain slots alone (`ui-renderer` `scoped-slots.tsx`, the list branch never
        // calls it), so a `{ matched }` component here crashed on every tail ("reading 'rerun'",
        // measured 26/09/2026). The entry decides for itself and renders nothing when the turn
        // built no site.
        (owner: TurnTailOwnerLike) => {
          const built = selectBuilt(owner, spec.tool)
          return built ? <BuiltRow api={api} built={built} openBuild={openBuild} t={t} /> : null
        }
      )
    )
  }
}
