/**
 * `tracy-add-site` — add a site to Tracy, right inside dsh.
 *
 * The plugin registers ONE tab in `dsh-better-sidebar`. That tab is the whole flow: pick a source (create or
 * import), pick a platform, name it, watch progress, receive the handover. One plugin for both sources rather
 * than two — ADR 0088 §1 measured that they *"really differ in only one step"*, the content
 * source; every other step shares one code path.
 *
 * ⚠ STATUS: the `create` branch runs end to end — name it, call `POST /api/sites`, follow the job,
 * then open the freshly built site in a browser tab. The `import` branch is on screen but has no content export
 * path in this repo yet. The progress console shows the fleet's raw output; per-platform vocabulary and
 * versioned step filtering are D4–D5. See `tasks/todo-tracy-add-site.md`.
 */
import { useSyncExternalStore, type JSX } from 'react'

import { seatOnlyTab } from '@tracy/core/seat'
import { siteNameFor, siteRowFor } from '@tracy/core/site-key'
import { FORM_PANEL_WIDTH, type OpenTab, sidebarRightOf } from '@tracy/core/tab-link'
// Same seat rule as the tab itself, for showing the workspace's site in every conversation (below).
import { mayHoldSeatOnlyTab, readViewer } from '@tracy/core/seat'
// The left column's own reading of "which site is this page open on" — reused, not restated.
import { currentSiteKey, hasPageToShow, sharedSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

import { pollJob } from './create'
import { CREATE_PLATFORMS, platformPressOf, toggleKeyFor } from './platforms'
import { canFrameCopy } from './preview.mjs'
import { en, NS, type Translate } from './strings'
import { dshUrl } from './dsh-url'
import { CSS, TAILWIND } from './styles'
import { AddSiteWizard } from './wizard'
import { AddSiteIcon } from './icons'
import { allPending, clearJob, onScreen, pendingForSite } from './resume.mjs'
import { backgroundPoller } from './background-poll.mjs'
import { PREVIEW_TAB, browserTabOn } from './preview-tab.mjs'
import { bringPreview } from './bring-preview'

/** The tab's id. Package prefix as better-sidebar recommends; must not clash with a built-in tab. */
const TAB_ID = 'tracy:add-site'

/**
 * ⚠ THIS PLUGIN DOES NOT OPEN ITS OWN TAB, AND THAT IS A DECISION, NOT AN OMISSION.
 *
 * Versions 0.6.7–0.6.8 had an effect calling `/api/sites` and, if the list was empty, `openTab`. It produced
 * two bugs in one afternoon: it swallowed the 403 the seat book returns to people without a seat, then it wrote
 * a `sessionStorage` flag BEFORE knowing the answer — so a failed ask was remembered as a
 * success and that tab never asked again.
 *
 * Which tab a person meets first is not this plugin's call. Up to better-sidebar 0.18 it was the
 * deployment's `seedTabs`; 0.21.1 dropped both its own right column and `seedTabs`, and dsh's native
 * right column starts COLLAPSED in every session (`ui-dockkit` `createInitialState`, `expanded:
 * false`), opening on a guide that lists the tab types — Add site first, by `order: 1`.
 */

interface LocaleRuntime {
  /** Returns the namespace-bound `t`. */
  bind: (ns: string) => Translate
  /** Object form = the package OWNS the namespace. Language packages use the three-argument per-locale form. */
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

/** Only the part of better-sidebar's contract this plugin uses. */
interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  /** Lands in dsh's native right column (better-sidebar 0.21.1) and expands it. */
  openTab: (seed: { type: string; url?: string; title?: string; meta?: unknown }) => void
  /** v0.12+: close one tab. `seatOnlyTab` sweeps a tab of a refused type with it. */
  closeTab?: (tabId: string) => void
  /** v0.12+: the session the side card follows, and its own bottom panel (read by the sweep). */
  getSnapshot?: () => { state?: unknown; sessionId?: string }
  /** v0.12+: the side card's changes — a session switch among them. */
  subscribeState?: (listener: () => void) => () => void
  /**
   * 0.21.1-tracy.1+: the open tabs of one type, native records first — where a preview's address is
   * (`meta.url`), and the id the right column's `focus` takes.
   */
  openTabsOf?: (type: string) => readonly OpenTab[]
}

/**
 * better-sidebar's store, exactly the part this plugin touches.
 *
 * 🔒 `getSnapshot()`, NOT `getState()`. The first version of this file guessed the second name — plausible,
 * and wrong. Symptom measured 31/08: the tab opened with a red line
 * `dsh-better-sidebar: store.getState is not a function` instead of content. The real shape is in
 * `vendor/tracy/dsh-better-sidebar/src/client/state.ts`, class `SidebarStore`.
 *
 * `pluginSettings` lives in `prefs` (the user's configuration, `prefs-shared.ts`), NOT in
 * `state` (a session's state: which tabs are open, the split tree). Put it in the wrong place and it reads
 * `undefined` and every switch quietly reads as "not configured".
 */
interface SidebarStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => {
    /** The dsh session the side card is showing. */
    sessionId?: string
    prefs?: { pluginSettings?: Record<string, Record<string, unknown>> }
  }
}

const NO_SETTINGS: Record<string, unknown> = {}

/**
 * The tab's own configuration, READ LIVE.
 *
 * 🔒 Never read once and keep: the tab's gear writes straight into the store, so a snapshot taken at
 * mount would leave the wizard offering platforms just switched off until people close the tab and reopen it.
 * `useSyncExternalStore` is the React API meant for exactly such an external store.
 * @param store better-sidebar's store.
 * @returns This descriptor's configuration blob.
 */
function usePluginSettings(store: SidebarStore): Record<string, unknown> {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    // Return THE SAME object when there is nothing: `useSyncExternalStore` compares with `Object.is` and
    // a new `{}` on every call would make React render forever.
    () => store.getSnapshot().prefs?.pluginSettings?.[TAB_ID] ?? NO_SETTINGS
  )
}

function AddSiteTab({
  store,
  tab,
  t,
  openSite,
  onMySites
}: {
  store: SidebarStore
  /** The tab better-sidebar renders: its `meta` carries a "Create with <CMS>" press (#381). */
  tab?: { meta?: unknown }
  t: Translate
  openSite: (url: string, siteKey: string) => void
  onMySites: () => void
}): JSX.Element {
  const sessionId = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot().sessionId
  )
  const shown = useSyncExternalStore(
    (listener) => {
      shownBuildListeners.add(listener)
      return () => shownBuildListeners.delete(listener)
    },
    () => shownBuild
  )
  // The platform and template a press asked for. Read here, not from the address: `tracy-tab-link`
  // drops the intent once the tab is open, and a press from the redirect path arrives only as
  // `tab.meta` — on this tab whether it was just opened or already open (#381, #386).
  const pressed = platformPressOf(tab?.meta)
  // `key`: each conversation mounts its own wizard, reading its own pending build (`resume.mjs`) —
  // or the build of the site a workspace row asked to show.
  return (
    <AddSiteWizard
      key={`${sessionId ?? ''}:${shown ?? ''}`}
      t={t}
      settings={usePluginSettings(store)}
      openSite={openSite}
      onMySites={onMySites}
      sessionId={sessionId}
      siteKey={shown ?? undefined}
      pressedPlatform={pressed?.platform}
      pressedDesign={pressed?.design}
      pressedOrigin={pressed?.origin}
      pressKey={pressed?.key}
    />
  )
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ — there is no optional injection. Declaring it here means the plugin activates only once
 * better-sidebar is ready; on a profile without better-sidebar (like `web`), cordis leaves the
 * plugin PENDING — not loaded, silent, and that is the right failure: a tab with no
 * sidebar to dock into has nothing to do.
 *
 * `locale` is a dsh core package, in the boot list of every dsh this repo runs.
 */
export const inject = ['betterSidebar', 'locale']

/** `localStorage`, or null where the browser refuses it (a throw on access, not a missing value). */
function localStore(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Fired by the left column (`tracy-sidebar` `other-sites.tsx`, `rail.tsx`) to show a workspace's site. */
const SHOW_SITE = 'tracy:show-site'
/** Fired by the wizard once a site is started (`wizard.tsx`). */
const SITES_CHANGED = 'tracy:sites-changed'

/**
 * The site whose build the Add site tab was last asked to show. A build is otherwise read from the
 * conversation or the page's own site; a site shown from another workspace's row is neither.
 */
let shownBuild: string | null = null
const shownBuildListeners = new Set<() => void>()
function setShownBuild(siteKey: string | null): void {
  if (shownBuild === siteKey) return
  shownBuild = siteKey
  for (const listener of shownBuildListeners) listener()
}

export { browserTabOn }

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /** dsh's right column is probed through it, not injected (`sidebarRightOf`). */
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-add-site="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyAddSite = '1'
    // Tailwind first, hand-written rules after: source order decides when both are equally specific.
    el.textContent = `${TAILWIND}\n${CSS}`
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-add-site: styles')

  // This package OWNS the `tracy-add-site` namespace: it ships the `en` base, other languages are added by language
  // packages in the per-locale form. `register` THROWS on a duplicate `(ns, locale)`.
  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-add-site: dictionaries')

  const t = ctx.locale.bind(NS)

  /**
   * Every conversation's build keeps moving, not only the one on screen. The job door is where a
   * finished provision is handed over (address, component, repo, agent), and only a poll reaches it;
   * the wizard polls just its own conversation's build. So this asks after every pending build in
   * this browser that no wizard is showing, until each answers done, failed, or gone (403/404 — the
   * site was deleted). The rules, and why a settled build is never asked again: `background-poll.mjs`.
   */
  ctx.effect(() => {
    const round = backgroundPoller({ store: localStore, poll: pollJob, allPending, clearJob, onScreen })
    const timer = window.setInterval(round, 10_000)
    return () => window.clearInterval(timer)
  }, 'tracy-add-site: background builds')

  /**
   * Open a site address IN THE SIDEBAR, after asking for a key so it opens signed in.
   *
   * ⚠ BOTH PREVIOUS VERSIONS OF THIS FUNCTION WERE WRONG, EACH IN ITS OWN WAY:
   *
   *   1. The first opened a `browser` tab straight onto the site. Joomla and WordPress send
   *      `X-Frame-Options: SAMEORIGIN`, so the frame showed "refused to connect" for a perfectly
   *      healthy site (measured 31/08).
   *   2. The second switched to `window.open` — it worked, but threw the person who had just built the site out of Tracy,
   *      and for the admin page it was the only way to open it signed in.
   *
   * Now the sidebar's embed route fetches the page server-side AND sends the viewing session along, so both reasons
   * are gone. The key is asked for before opening: a press that opens a sign-in screen is a broken press, and the
   * user was never given a CMS password to get out of it.
   *
   * If asking for the key FAILS it still opens. The door still opens, just at the sign-in screen — the same trade-off
   * `siteDoors.ts` in `tracy-desk` accepts when minting fails.
   * @param url The address to open.
   * @param siteKey The site, to ask for the right session.
   * @param title What the tab is titled: the site's current name (a rename changes it, not the key).
   */
  const openSite = async (url: string, siteKey: string, title = siteKey, unasked = false): Promise<void> => {
    if (!url) return
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return
    }
    try {
      await fetch(dshUrl('/api/tracy-add-site/credentials'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteKey, host })
      })
    } catch {
      /* opening signed-out beats not opening */
    }
    // 🔒 ASK AGAIN AFTER THE AWAIT. `show` checked for a preview on this host before calling here,
    // but the credentials request above takes its time (a 502 on the stand, 27/09), and meanwhile a
    // `?open=browser&page=/about/` link (`@tracy/dsh-site-tabs`) can have opened the Browser tab on
    // its page. One preview per pane: this open would land on THAT tab and send it back to the
    // site's root — measured 27/09, `/about/` at 13490 ms, `/` at 13507 ms. A preview already on the
    // site is brought into sight as it stands instead; one that cannot be focused is left alone.
    // On the page's own load (`unasked`) a narrow frame keeps the conversation in sight
    // (`bringPreview`).
    const already = browserTabOn(ctx.betterSidebar.openTabsOf?.(PREVIEW_TAB), host)
    try {
      bringPreview({
        right: sidebarRightOf(ctx),
        already,
        unasked,
        // One preview per pane: a second open with another address navigates the one already there.
        open: () => ctx.betterSidebar.openTab({ type: PREVIEW_TAB, url, title, meta: { siteKey, url } })
      })
    } catch (error) {
      // A preview already there with no seat mounted to focus in stays on its own page.
      if (already === null) {
        console.warn('[tracy-add-site] could not open the browser tab:', error)
        window.dispatchEvent(new CustomEvent('tracy:import-preview-failed', { detail: { url, siteKey } }))
      }
    }
  }

  /**
   * ONE WORKSPACE, ONE SITE (15/09/2026): the side card shows the site of the workspace in hand,
   * with no page load.
   *
   * - Switching conversation in a site's workspace (`/<siteKey>/`) shows that site.
   * - `tracy:show-site` — fired by the left column when a workspace row or a session row is
   *   pressed — shows the named site, or the page's own when it names none. Another site is shown
   *   in the side card only: its conversations belong to its own seat, which only its own page
   *   holds.
   *
   * Showing a site focuses the browser tab already on its host, or opens one at the address
   * `/api/sites` hands out (`copyUrl`), never one assembled here. A site still being created (its
   * row carries no agent yet, and this browser holds its build) has nothing to show but "Site
   * unavailable", so the Add site tab shows its build instead. Only for a viewer a seat-only tab
   * exists for; the creation workspace (`/new/`) opens nothing on a switch.
   */
  ctx.effect(() => {
    const own = currentSiteKey({
      pathname: location.pathname,
      basePathname: new URL(document.baseURI).pathname,
      cookie: document.cookie
    })
    let allowed = false
    let rows: Array<{
      siteKey?: string
      copyUrl?: string | null
      agent?: string | null
      platform?: string | null
    }> = []
    let last: string | undefined
    const arrival = performance.getEntriesByType('navigation')[0]?.name
    const hasTabLanding =
      new URLSearchParams(location.search).has('tab') ||
      Boolean(arrival && new URL(arrival).searchParams.has('tab'))
    const show = (
      siteKey: string,
      known: { url?: string; ready?: boolean; platform?: string | null } = {},
      unasked = false
    ): void => {
      if (!allowed) return
      // Any name of the site finds its row: the page's address carries the name a rename gave it.
      const row = siteRowFor(rows, siteKey) ?? undefined
      const key = row?.siteKey ?? siteKey
      const name = siteNameFor(rows, siteKey)
      if (row === undefined && known.url === undefined) return
      if (!known.ready && row !== undefined && !hasPageToShow(row)) {
        // Not built yet. The wizard's own build is shown in its tab; any other one (a Build press
        // claimed this site and moved here) has its own tab on screen, and a browser tab opened on
        // the draft address would cover it with "Site unavailable" (measured 17/09).
        if (pendingForSite(localStore(), key) !== null) {
          setShownBuild(key)
          ctx.betterSidebar.openTab({ type: TAB_ID })
        }
        return
      }
      const url = known.url ?? row?.copyUrl ?? null
      if (url === null) return
      // A site with its own page to show: the Add site tab stops pointing at another site's build.
      setShownBuild(null)
      let host = ''
      try {
        host = new URL(url).hostname
      } catch {
        return
      }
      // An EmDash copy refuses framing (`preview.mjs`) and this path is a session switch or
      // `tracy:show-site`, not a user gesture — so open nothing (a framed tab errors, a pop-up on
      // load is blocked). The person opens it from My Sites' "Open" action. Platform rides the
      // event or comes from the `/api/sites` row.
      const platform = known.platform ?? row?.platform ?? null
      if (!canFrameCopy(platform)) return
      // A preview already on the site is brought back as it stands — the page the person navigated
      // to inside it included — rather than opened again at the address `/api/sites` hands out.
      const open = browserTabOn(ctx.betterSidebar.openTabsOf?.(PREVIEW_TAB), host)
      const right = sidebarRightOf(ctx)
      if (open === null || right === undefined) {
        void openSite(url, key, name, unasked)
        return
      }
      try {
        bringPreview({ right, already: open, open: () => {}, unasked })
      } catch {
        // No seat mounted to focus in (the column refuses a command then): open it the long way,
        // which the side card queues until the seat is there.
        void openSite(url, key, name, unasked)
      }
    }
    const ensure = (): void => {
      const sessionId = ctx.betterSidebar.getSnapshot?.().sessionId
      if (own === null || !allowed || sessionId === undefined || sessionId === last) return
      const firstBinding = last === undefined
      last = sessionId
      // The explicit tab owns landing focus; subsequent user session switches still
      // reveal the site's preview as before. The first binding is the page's own load: nobody
      // asked for the preview, so a narrow frame keeps the conversation (`bringPreview`).
      if (firstBinding && hasTabLanding) return
      show(own, {}, firstBinding)
    }
    const asked = (event: Event): void => {
      const detail = (
        event as CustomEvent<
          { siteKey?: string; url?: string; ready?: boolean; platform?: string | null } | undefined
        >
      ).detail
      const siteKey = detail?.siteKey ?? own
      if (siteKey) show(siteKey, { url: detail?.url, ready: detail?.ready, platform: detail?.platform })
    }
    window.addEventListener(SHOW_SITE, asked)
    void Promise.all([readViewer(), sharedSites()]).then(([viewer, body]) => {
      allowed = mayHoldSeatOnlyTab(viewer, location.hostname)
      rows = (body as { sites?: typeof rows } | null)?.sites ?? []
      ensure()
    })
    // A site started from here is a new row: read the list again, as the left column does.
    const changed = (): void => {
      void sharedSites({ refresh: true }).then((body) => {
        rows = (body as { sites?: typeof rows } | null)?.sites ?? rows
      })
    }
    window.addEventListener(SITES_CHANGED, changed)
    const unsubscribe = ctx.betterSidebar.subscribeState?.(ensure)
    return () => {
      window.removeEventListener(SHOW_SITE, asked)
      window.removeEventListener(SITES_CHANGED, changed)
      unsubscribe?.()
    }
  }, 'tracy-add-site: the workspace site in the side card')

  /**
   * 🔒 WRAPPED IN `ctx.effect`. `registerTab` returns a disposer the cordis fiber calls on teardown;
   * unwrapped, HMR or a plugin off/on leaves the old registration, and the next activation throws
   * `tab type "tracy:add-site" already registered`.
   *
   * 🔒 `seatOnlyTab`, NOT `registerTab` DIRECTLY. This tab builds a real site on the fleet, so
   * it only means something to someone signed in. Since ADR 0014 the customer is a ROLE in the same dsh, same
   * `native` profile, so the profile's `seedTabs` seeds it even for strangers not signed in — they go through the whole
   * wizard and then get a 403 at `POST /api/sites`. The helper asks `/auth/me` once, registers when the viewer
   * is signed in, and sweeps the seeded tab when not. The full rule: `@tracy/core/seat` (which also
   * says why the sweep stays now that better-sidebar 0.21.1 has no `seedTabs`).
   */
  ctx.effect(
    () =>
      seatOnlyTab(
        ctx.betterSidebar,
        TAB_ID,
        () => ({
          id: TAB_ID,
          title: () => t('tab_title'),
          icon: (size: number) => <AddSiteIcon size={size} />,
          // FIRST in the `+` menu and the welcome card grid — `order` ascending, default 100, and better-sidebar's
          // built-in tabs take 10…50 (editor · git · subagent · sidechat · terminal · browser).
          //
          // Before 02/09 the value was 60, so Add site fell to the END of both surfaces. That is the worst place
          // for the action this product most wants to steer people to — a newcomer had to read all seven entries
          // before meeting what they came to do. Since better-sidebar 0.21.1 this is also the order of dsh's
          // native guide, the page a collapsed right column opens on.
          order: 1,
          // An unfinished site addition must NOT be duplicated because someone presses `+` again.
          single: true,
          // A form, not a site preview. The width is recorded for dsh, which no longer sizes the panel
          // by it (14/10/2026: every tab opens beside a narrow 320px conversation). No `maxWidth`
          // ceiling either, so the conversation stays narrow here too; the form caps itself
          // (styles.ts note 1).
          preferredWidth: FORM_PANEL_WIDTH,
          settings: {
            /**
             * `pluginToggles`, not `toggles`: `toggles` keys must be fields of the host's
             * PrefsSchema, while `pluginToggles` belong to this descriptor alone and are
             * stored in `pluginSettings['tracy:add-site']` (the seam opened in better-sidebar v0.12.0).
             * Using `toggles` here would have the seam throw the values away without a word.
             */
            pluginToggles: CREATE_PLATFORMS.map((entry) => ({
              key: toggleKeyFor(entry.value),
              // Platform names are proper nouns — they do NOT go through `t`.
              title: entry.label
            }))
          },
          // `tab` too, not only `store`: a "Create with <CMS>" press rides in `tab.meta.platform`, and
          // a component that dropped it opened every press on the default platform (#381).
          component: ({ store, tab }: { store: SidebarStore; tab?: { meta?: unknown } }) => (
            <AddSiteTab
              store={store}
              tab={tab}
              t={t}
              openSite={openSite}
              onMySites={() => ctx.betterSidebar.openTab({ type: 'tracy:my-sites' })}
            />
          )
        }),
        { nativeSidebar: () => sidebarRightOf(ctx) }
      ),
    'tracy-add-site: tab'
  )

  // THE FIRST-RUN CASE (Akemi, 15/09) needs nothing here any more: a conversation in the creation
  // workspace keeps the side card closed because dsh's right column starts collapsed in every
  // session (better-sidebar 0.21.1 has no `openByDefault` to open it). The effect that collapsed it,
  // and `first-run.mjs` behind it, went with that setting.
}
