/**
 * The harness — Tracy's own surface at `/ops`: one rail, one router, every screen.
 *
 * THE RAIL IS `@tracy/ui`'s `Sidebar` SINCE 22/09 (Lee), not a hand-written column. What that buys,
 * and why each piece is worth having rather than a preference:
 *
 *   - IT COLLAPSES. `collapsible="icon"` leaves a 3rem strip of icons with the label on hover, and
 *     ⌘B toggles it. ⚠ THE COOKIE IT WRITES IS NOT READ BY THE COMPONENT — `SidebarProvider` sets
 *     `sidebar_state` on every toggle but starts from a hard `defaultOpen = true`, because upstream
 *     shadcn reads that cookie on the SERVER and hands it in. This SPA has no such step, so the
 *     collapse quietly did not survive a reload until `sidebarDefaultOpen()` below read it back.
 *   - IT STOPS DISAPPEARING BELOW `md`. The old column was `hidden … md:flex` and a `<select>`
 *     labelled "Screen" stood in for it on a narrow viewport — TWO ways to change screen, one of
 *     which only existed because the first could not fit. `Sidebar` becomes a Sheet there, so the
 *     rail is the rail at every width and both pickers are gone (root's here, the cms area's in
 *     `cms/App.tsx`).
 *   - GROUPS FOLD, AND ARE REMEMBERED. Six groups, twelve rows; folding is not about length but
 *     about a person keeping the parts they are not working in out of the way (`FOLDED_GROUPS_KEY`).
 *     Every group obeys the reader, including the group containing the current screen.
 *   - THE FOOTER SAYS WHO IS READING. `GET /api/ops/me` (`shell/viewer.ts`), email AND role.
 *     Role, because it is what decides whether a screen's buttons work at all: every write door on
 *     this surface answers `writable: ['owner','admin'].includes(role)`, and until now a developer
 *     saw disabled buttons with nothing on screen explaining why.
 *
 * ONE SPA SINCE 19/09 (Lee). `/ops/cms` arrived as a SECOND Vite entry with its own rail and its own
 * router, because the task that added it had to leave `/ops` untouched; the two surfaces then had no
 * way from one to the other and two ways of reading an address. That constraint is gone: this file
 * owns the rail and the router for both areas, and `cms/App.tsx` (`CmsArea`) keeps what is genuinely
 * its own — the snapshot of the chosen environment and the bar that reports it.
 *
 * 🔒 THE URL IS THE STATE, for both areas. `/ops[/<screen>]` names a root screen; `/ops/cms[/<screen>]
 * ?env=&cms=&tag=&set=` names a cms screen, exactly as `cms/route.ts` always read it — every link
 * people sent each other still lands. `area` is the discriminant: both areas have a screen called
 * `presets` (agent presets here, build presets there) and neither is renamed.
 *
 * 🔒 `/ops` DOES NOT PAY FOR `/ops/cms`. The cms area is `lazy()`-loaded, and the only cms module
 * this file imports is the leaf `cms/route.ts` — see its docstring for what would happen otherwise.
 *
 * ⚠ THE ENVIRONMENT PICKER CAME UP HERE ON 22/09 AND WENT BACK DOWN THE SAME DAY, measured. `env`
 * names which REF the Builds screens read, and only SEVEN screens read one (`readsEnvironment` in
 * `cms/route.ts`) — the root screens report this deployment's live state, and Quickstarts and Demos
 * answer from live doors too. In the rail it therefore sat above a dozen screens it did not govern:
 * Dev → Main moved the commit on `/ops/cms/overview` (27f50f7bd → 13d2a4700) and moved nothing at
 * all on `/ops/servers`, correctly. A control that visibly does nothing reads as broken, so it
 * belongs in the screens it acts on (owner review: "it doesn't really make sense in the left rail").
 *
 * ⚠ THERE WAS A THIRD GROUP, `Agent lanes`, AND IT WENT WITH THE FLEET IT DESCRIBED (one dsh per
 * host leaves nothing to enumerate). `Fleet · Host agents` is not it returning: it asks which build
 * each MACHINE runs, read-only.
 */

import { useViewer } from '@tracy/core/seat/viewer'
import { Face, NEUTRAL_FACE_COLOUR, type PersonFace } from '@tracy/core/team/face'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from '@tracy/ui'
import {
  Activity,
  BellRing,
  Bot,
  Boxes,
  Braces,
  ChartColumn,
  ChevronRight,
  ChevronsUpDown,
  FlaskConical,
  Globe,
  Hourglass,
  LayoutGrid,
  LayoutTemplate,
  LifeBuoy,
  ListChecks,
  LogOut,
  Mail as MailIcon,
  MessageSquareText,
  Mic,
  Network,
  PanelsTopLeft,
  ScrollText,
  Server,
  SlidersHorizontal as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  Wrench
} from 'lucide-react'
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Attention } from './attention/Attention'
import { fetchAttentionCount } from './attention/api'
import { AppStatistic } from './beta/AppStatistic'
import { fetchStuckCount } from './beta/api'
import { Signals } from './beta/Signals'
import { Stuck } from './beta/Stuck'
import { Usage } from './beta/Usage'
import { Waitlist } from './beta/Waitlist'
import { Ci } from './Ci'
import { CmsAgents } from './CmsAgents'
import {
  CMS_SCREEN_LABEL,
  type CmsRoute,
  type ScreenId as CmsScreen,
  cmsHrefFor,
  cmsRouteFromLocation,
  isCmsPath
} from './cms/route'
import { HostAgents } from './HostAgents'
import { Invitations } from './invitations/Invitations'
import { Mail } from './Mail'
import type { PlatformId, RoleId } from './matrix'
import { Preset } from './Preset'
import { ReleaseChecklist } from './release/ReleaseChecklist'
import { ModelAi } from './settings/ModelAi'
import {
  isSettingsPath,
  movedPanelFor,
  panelFromPath,
  type SettingsPanel,
  settingsHref
} from './settings/route'
import { Servers } from './settings/Servers'
import { Settings } from './settings/Settings'
import { UserInterface } from './settings/UserInterface'
import { Shards } from './shards/Shards'
import { watchBadgeCounts } from './shell/badge-counts'
import { NewVersionNotice, useNewBundle } from './shell/NewVersionNotice'
import { createOpsNavigation } from './shell/navigation-guard'
import { ThemeSwitch } from './shell/theme'
import { TOPBAR_SLOT_ID } from './shell/topbar'
import { fetchViewer, signOut, type Viewer } from './shell/viewer'
import { Voice } from './Voice'
import { Widget } from './Widget'
import { Wo } from './Wo'
import { useT } from './i18n'
import { LanguageSwitch } from './shell/language-switch'

const CmsArea = lazy(() => import('./cms/App').then((m) => ({ default: m.CmsArea })))

type RootScreen =
  | 'agents'
  | 'presets'
  | 'voice'
  | 'hosts'
  | 'shards'
  | 'settings'
  | 'ui'
  | 'servers'
  | 'model'
  | 'widget'
  | 'mail'
  | 'attention'
  | 'signals'
  | 'app-statistic'
  | 'stuck'
  | 'waitlist'
  | 'usage'
  | 'ci'
  | 'release'
  | 'invitations'
  | 'wo'
const ROOT_SCREENS: readonly RootScreen[] = [
  'agents',
  'attention',
  'signals',
  'app-statistic',
  'stuck',
  'waitlist',
  'usage',
  'presets',
  'voice',
  'hosts',
  'shards',
  'settings',
  'ui',
  'servers',
  'model',
  'widget',
  'mail',
  'ci',
  'release',
  'invitations',
  'wo'
]

type CmsFields = Pick<CmsRoute, 'env' | 'cms' | 'tag' | 'set' | 'template' | 'view' | 'release'>
export type Route = ({ area: 'root'; screen: RootScreen } | { area: 'cms'; screen: CmsScreen }) &
  CmsFields & {
    /** Which Settings panel, when `screen` is `settings`. Carried on the Route for the same reason
     * `cms` and `tag` are: `/ops/settings/limits` is a link somebody can send. */
    panel: SettingsPanel
  }
/** What `go()` accepts: any subset; `area` and `screen` travel together when they change. */
type RouteChange = Partial<CmsFields> & {
  area?: Route['area']
  screen?: RootScreen | CmsScreen
  panel?: SettingsPanel
}

const BLANK: CmsFields & { panel: SettingsPanel } = {
  env: '',
  cms: 'joomla',
  tag: null,
  set: null,
  template: null,
  view: null,
  release: null,
  panel: 'team'
}

/** Read the address. Under `/ops/cms` the cms rules apply; elsewhere a root screen, `agents` by default. */
function routeFromLocation(): Route {
  const { pathname, search } = window.location
  if (isCmsPath(pathname))
    return { area: 'cms', ...cmsRouteFromLocation({ pathname, search }), panel: BLANK.panel }
  if (isSettingsPath(pathname)) {
    // A panel that grew into its own screen keeps its old address working (`MOVED_PANELS`) —
    // `/ops/settings/model` is a link people already sent each other.
    const moved = movedPanelFor(pathname)
    if (moved) {
      window.history.replaceState(window.history.state, '', moved)
      return routeFromLocation()
    }
    return { area: 'root', screen: 'settings', ...BLANK, panel: panelFromPath(pathname) }
  }
  const tail = pathname.replace(/^\/ops\/?/, '').replace(/\/+$/, '')
  // ⚠ `/ops/team` IS KEPT, as the address it became. The screen moved into Settings on 22/09 and
  // that path is in links people already sent each other; dropping it would land them on Agents
  // with no hint that the page still exists.
  if (tail === 'team') return { area: 'root', screen: 'settings', ...BLANK, panel: 'team' }
  const screen = (ROOT_SCREENS as readonly string[]).includes(tail) ? (tail as RootScreen) : 'agents'
  return { area: 'root', screen, ...BLANK }
}

function hrefFor(route: Route): string {
  if (route.area === 'cms') return cmsHrefFor(route)
  if (route.screen === 'settings') return settingsHref(route.panel)
  return route.screen === 'agents' ? '/ops' : `/ops/${route.screen}`
}

/** Rail words: a dictionary key, from the shell namespace or from the namespace of the screen it opens. */
type RailLabel = string
type Row =
  | {
      area: 'root'
      id: RootScreen
      label: RailLabel
      icon: ReactNode
      woView?: 'queue' | 'research' | 'places' | 'settings'
    }
  | { area: 'cms'; id: CmsScreen; icon: ReactNode }
  // A page tracy-web renders itself, outside this SPA: the row is a plain link the browser follows.
  | { area: 'page'; id: string; label: RailLabel; href: string; icon: ReactNode }
const cms = (id: CmsScreen, icon: ReactNode): Row => ({ area: 'cms', id, icon })

function woRailHref(view: 'queue' | 'research' | 'places' | 'settings'): string {
  return view === 'queue' ? '/ops/wo' : `/ops/wo?view=${view}`
}

/**
 * The rail, in the order a person reads it. Root's `presets` is labelled "Provider presets" (the
 * word `docs/references/vocabulary.md` keeps for it) so it is never confused with the build presets
 * three groups down (they share an id, not a meaning).
 * Widget sits with Demos on purpose: the person who installs a demo with a badge is the person who
 * edits the badge (Lee, 19/09).
 */
/**
 * `storageKey` is the group's English title as it was before translation: stored folds
 * (`FOLDED_GROUPS_KEY`) are keyed by it, so it must never follow the language.
 */
const NAV: readonly { title: RailLabel; storageKey: string; rows: readonly Row[] }[] = [
  {
    title: 'shell.group.campaigns',
    storageKey: 'Campaigns',
    rows: [{ area: 'root', id: 'invitations', label: 'shell.nav.invitations', icon: <MailIcon /> }]
  },
  {
    title: 'shell.group.wo',
    storageKey: 'Website Opportunities',
    rows: [
      { area: 'root', id: 'wo', woView: 'queue', label: 'shell.nav.woQueue', icon: <ListChecks /> },
      { area: 'root', id: 'wo', woView: 'research', label: 'shell.nav.woResearch', icon: <FlaskConical /> },
      { area: 'root', id: 'wo', woView: 'places', label: 'shell.nav.woPlaces', icon: <Globe /> },
      { area: 'root', id: 'wo', woView: 'settings', label: 'shell.nav.woSettings', icon: <SettingsIcon /> }
    ]
  },
  // The Tracy beta for JoomlArt customers (spec 4.7, 05/10/2026): who came in and from where,
  // and who is stuck on a system error. Its own group at the top, because it is read every morning,
  // and apart from "Needs attention" below, which is the template team's list, not the customers'.
  {
    title: 'beta.nav.group',
    storageKey: 'Beta',
    rows: [
      { area: 'root', id: 'signals', label: 'beta.nav.signals', icon: <Activity /> },
      { area: 'root', id: 'app-statistic', label: 'shell.nav.appStatistic', icon: <Activity /> },
      { area: 'root', id: 'stuck', label: 'beta.nav.stuck', icon: <LifeBuoy /> },
      { area: 'root', id: 'waitlist', label: 'beta.nav.waitlist', icon: <Hourglass /> },
      // What customers' chat requests and the Add site form did (plan `tasks/todo-do-dung-that.md`).
      { area: 'root', id: 'usage', label: 'beta.nav.usage', icon: <ChartColumn /> }
    ]
  },
  {
    title: 'shell.group.agents',
    storageKey: 'Agents',
    rows: [
      { area: 'root', id: 'agents', label: 'shell.nav.agents', icon: <Bot /> },
      { area: 'root', id: 'presets', label: 'shell.nav.presets', icon: <SlidersHorizontal /> },
      // Voice input in the customer's chat box, one switch for every agent (David 15/10/2026).
      { area: 'root', id: 'voice', label: 'shell.nav.voice', icon: <Mic /> }
    ]
  },
  // MACHINES, not what an agent carries — the distinction ADR 0014 drew.
  {
    title: 'shell.group.fleet',
    storageKey: 'Fleet',
    rows: [
      { area: 'root', id: 'hosts', label: 'shell.nav.hosts', icon: <Server /> },
      // The shard beta (docs/sre/2026-10-15-shard-beta-design.md): machines, like the row above.
      { area: 'root', id: 'shards', label: 'shell.nav.shards', icon: <Network /> }
    ]
  },
  {
    title: 'shell.group.builds',
    storageKey: 'Builds',
    rows: [cms('overview', <LayoutGrid />), cms('stages', <FlaskConical />)]
  },
  {
    title: 'shell.group.buildFrom',
    storageKey: 'What a build starts from',
    rows: [
      // FIRST in the group (Brian, 04/10/2026): what is not ready among the rows below it. Its
      // number is the server's `count` — quickstarts with something broken or missing.
      { area: 'root', id: 'attention', label: 'attention.rail', icon: <BellRing /> },
      // One row per template (Akemi, 10/10/2026): it folds Design inspiration (what customers on
      // this server are offered) and Quickstarts (every release on GitHub) into one screen. Both
      // old screens keep their addresses, so links already sent still land, but leave the rail.
      cms('templates', <LayoutTemplate />),
      // The warm stock sits under the quickstarts it is built from (Lee, 22/09).
      cms('inventory', <Boxes />),
      cms('demos', <Globe />),
      { area: 'root', id: 'widget', label: 'shell.nav.widget', icon: <Sticker /> },
      cms('catalog', <Boxes />),
      cms('contracts', <ScrollText />)
    ]
  },
  {
    title: 'shell.group.buildRuns',
    storageKey: 'What a build runs as',
    rows: [
      cms('presets', <SlidersHorizontal />),
      cms('tools', <Wrench />),
      cms('questions', <MessageSquareText />)
    ]
  },
  // Neither a machine nor what an agent carries: the deployment itself, and the people in it.
  // `Team` moved in here on 22/09 (Lee) — it is one panel of Settings now, not a rail row of its
  // own; `/ops/team` still lands on that panel.
  {
    title: 'shell.group.settings',
    storageKey: 'Tracy Settings',
    rows: [
      { area: 'root', id: 'settings', label: 'shell.nav.general', icon: <SettingsIcon /> },
      // What the customer's page shows, switch by switch (Lee, 28/09) — its own screen beside
      // General for the same reason Model & AI is: 55 switches in six areas are a screen.
      { area: 'root', id: 'ui', label: 'shell.nav.ui', icon: <PanelsTopLeft /> },
      // Its own screen rather than a General panel (Lee, 22/09): a provider list, a credential
      // form, a model list and four job assignments is a screen, not a panel.
      { area: 'root', id: 'model', label: 'shell.nav.model', icon: <Sparkles /> },
      { area: 'root', id: 'servers', label: 'shell.nav.servers', icon: <Server /> },
      // Customer sites' own mail after go-live: the deployment's relay switch and cap, and each
      // site's mode and limits (tasks/todo-mail-site-khach.md).
      { area: 'root', id: 'mail', label: 'shell.nav.mail', icon: <MailIcon /> },
      // The staff API reference, a server-rendered document (`apps/tracy-web/src/api-reference`).
      { area: 'page', id: 'api', label: 'shell.nav.api', href: '/ops/api', icon: <Braces /> }
    ]
  },
  // Everything to check before and after a version goes out (Vincent, 08/10/2026): last, below the
  // deployment's settings (Vincent, 08/10/2026: not at the top).
  {
    title: 'shell.group.devops',
    storageKey: 'DevOps',
    rows: [
      { area: 'root', id: 'ci', label: 'shell.nav.ci', icon: <FlaskConical /> },
      { area: 'root', id: 'release', label: 'shell.nav.release', icon: <ListChecks /> }
    ]
  }
]

/** The role in the language on screen; a role this build does not know shows as the server sent it. */
const roleName = (t: ShellText, role: string) =>
  ['owner', 'admin', 'developer'].includes(role) ? t(`shell.account.role.${role}`) : role

type ShellText = (key: string) => string
const wordsOf = (label: RailLabel, t: ShellText) => t(label)
const labelOf = (row: Row, t: ShellText) =>
  row.area === 'cms' ? CMS_SCREEN_LABEL[row.id] : wordsOf(row.label, t)

/**
 * Which groups a person left folded, per browser.
 *
 * 🔒 STORED AS THE FOLDED ONES, NOT THE OPEN ONES — so a group added to `NAV` later is open by
 * default for somebody who has used this page before. Storing the open set would have hidden every
 * new group behind a fold nobody chose, silently, on exactly the machines that already had the
 * page open.
 */
const FOLDED_GROUPS_KEY = 'tracy.ops.foldedGroups'

function readFolded(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FOLDED_GROUPS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [])
  } catch {
    // A browser that refuses storage (private window, storage disabled) gets every group open,
    // which is the state this page had before folding existed — never a crash on first paint.
    return new Set()
  }
}

/**
 * Was the rail left collapsed? `SidebarProvider` WRITES `sidebar_state` but never reads it (see
 * this file's own header), so without this the rail springs back open on every reload and the
 * toggle looks like it did not take.
 *
 * Anything that is not exactly `false` means open — including a missing cookie and a browser that
 * hands back nothing at all. Erring open is the safe direction: a rail nobody asked to hide.
 */
function sidebarDefaultOpen(): boolean {
  try {
    return !/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie)
  } catch {
    return true
  }
}

/** The face drawn before `/auth/me` answers, or when it cannot: a neutral disc, never a letter or a
 * colour guessed in the browser (`@tracy/core/team/face` says why). */
const NO_FACE: PersonFace = { initial: '', color: NEUTRAL_FACE_COLOUR }

export function App() {
  const t = useT()
  const [route, setRoute] = useState<Route>(routeFromLocation)
  const [woLocation, setWoLocation] = useState(() => window.location.href)
  const routeRef = useRef(route)
  routeRef.current = route
  const navigation = useRef<ReturnType<typeof createOpsNavigation> | null>(null)
  const [role, setRole] = useState<RoleId>('designer')
  const [platform, setPlatform] = useState<PlatformId>('wordpress')
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const me = useViewer()
  const [folded, setFolded] = useState<Set<string>>(readFolded)
  // The shell refreshes on navigation, return to the tab and every 30 seconds while visible.
  // Screen callbacks can also update their count immediately. Null (unknown) and 0 draw no badge.
  const [attentionCount, setAttentionCount] = useState<number | null>(null)
  // Sites currently needing help. Same freshness contract as `attentionCount`.
  const [stuckCount, setStuckCount] = useState<number | null>(null)

  // A deploy since this tab opened: say so, and let the next allowed navigation load it fresh.
  const { stale: newBundle, staleRef: newBundleRef } = useNewBundle()

  const go = useCallback(
    (next: RouteChange, replace = false) => {
      // Preserve the CMS selection on root screens. Ask before changing React state
      // or history, outside a state updater that Strict Mode can invoke twice.
      const merged = { ...routeRef.current, ...next } as Route
      if (!navigation.current?.navigate(hrefFor(merged), replace)) return
      // The address is already the new one; open it in the new bundle rather than in this tab's old
      // code (12/10/2026: a pre-#1255 tab stayed on "Reading…" until a hard reload).
      if (newBundleRef.current) {
        window.location.reload()
        return
      }
      routeRef.current = merged
      setRoute(merged)
    },
    [newBundleRef]
  )

  // Only accepted Back/Forward traversals may unmount the current screen.
  useEffect(() => {
    const guard = createOpsNavigation(window, (kind) => {
      setWoLocation(window.location.href)
      if (kind !== 'pop') return
      const next = routeFromLocation()
      routeRef.current = next
      setRoute(next)
    })
    navigation.current = guard
    return () => {
      guard.dispose()
      navigation.current = null
    }
  }, [])

  useEffect(() => {
    const brand = t('shell.brand.title')
    document.title = route.area === 'cms' ? t('shell.document.cms', { brand }) : brand
  }, [route.area, t])

  // Who is reading, once per load. A refusal leaves `viewer` null and the footer empty — see
  // `shell/viewer.ts` on why that is the right answer rather than a placeholder.
  useEffect(() => {
    const ac = new AbortController()
    fetchViewer(ac.signal).then((v) => {
      if (!ac.signal.aborted) setViewer(v)
    })
    return () => ac.abort()
  }, [])

  useEffect(() => {
    return watchBadgeCounts({
      win: window,
      fetchAttentionCount,
      fetchStuckCount,
      onAttentionCount: setAttentionCount,
      onStuckCount: setStuckCount
    })
  }, [route])

  const toggleGroup = useCallback((title: string) => {
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      try {
        window.localStorage.setItem(FOLDED_GROUPS_KEY, JSON.stringify([...next]))
      } catch {
        // Storage refused: the fold still works for this session, it simply is not remembered.
      }
      return next
    })
  }, [])

  const isActive = useCallback(
    (row: Row) => {
      if (row.area !== route.area || row.id !== route.screen) return false
      if (row.area !== 'root' || !row.woView) return true
      const address = new URL(woLocation)
      const view = address.searchParams.get('view')
      const activeView =
        view === 'research' || view === 'places' || view === 'settings'
          ? view
          : address.hash === '#dubai-pilot'
            ? 'research'
            : 'queue'
      return row.woView === activeView
    },
    [route.area, route.screen, woLocation]
  )

  /**
   * Keep the row you are standing on in view.
   *
   * ⚠ MEASURED 22/09: at 900px the rail's last group — the one that now holds Settings and
   * Servers — sits below the fold, so opening `/ops/servers` painted a rail with NO highlighted
   * row anywhere on screen. The page was right and looked broken. Scrolling the active row into
   * view costs nothing and is only ever a no-op when the row is already visible.
   */
  useEffect(() => {
    // `aria-current`, not `data-active`: the latter is base-ui's, written WITHOUT a value
    // (`data-active`, not `data-active="true"`), so the obvious selector matched nothing and the
    // scroll silently never happened — measured before this comment existed. `aria-current` is set
    // by this file on the anchor itself, so it cannot drift with the component's internals.
    //
    // ⚠ AND IT HAS TO WAIT FOR THE FOLD ANIMATION. `CollapsibleContent` transitions its height
    // over 150ms; scrolling on the same tick measures against heights that are still moving, and
    // lands short — measured: the row ended up under the footer anyway. One timeout past the
    // transition, cancelled on the next hop so a fast click does not leave a stale scroll queued.
    const timer = window.setTimeout(() => {
      document
        .querySelector('[data-slot="sidebar-content"] [aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest' })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [route.area, route.screen])

  const onRowClick = (row: Row) => (e: React.MouseEvent) => {
    // Plain left-click navigates in place; modifier clicks stay real links, so "open in a new tab"
    // keeps working on an internal tool people live in.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    // A row outside the SPA has no screen here: the browser loads its document.
    if (row.area === 'page') return
    e.preventDefault()
    if (row.area === 'root' && row.woView) {
      const href = woRailHref(row.woView)
      if (!navigation.current?.navigate(href)) return
      if (newBundleRef.current) {
        window.location.reload()
        return
      }
      const next = { ...routeRef.current, area: 'root', screen: 'wo' } as Route
      routeRef.current = next
      setRoute(next)
      return
    }
    // A rail row opens its screen at the top: an open template page is not carried along.
    go({ area: row.area, screen: row.id, template: null, view: null, release: null })
  }

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()} className="text-foreground">
      <Sidebar
        collapsible="icon"
        mobileTitle={t('shell.sidebar.mobileTitle')}
        mobileDescription={t('shell.sidebar.mobileDescription')}
      >
        <SidebarHeader className="gap-2">
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
            <div className="flex size-8 flex-none items-center justify-center rounded-lg bg-foreground font-semibold text-background text-xs">
              {t('shell.brand.mark')}
            </div>
            <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-sm">{t('shell.brand.title')}</span>
              <span className="truncate text-muted-foreground text-xs">{t('shell.brand.subtitle')}</span>
            </div>
            {/* The rail's own toggle lives in the rail (Akemi, 10/10/2026); collapsed to icons it
                sits under the brand, so the rail can always be reopened from itself. */}
            <SidebarTrigger label={t('shell.sidebar.toggle')} className="hidden md:inline-flex" />
          </div>
          {/* Light / Dark / System and the interface language for every /ops page, right under the
              brand (Akemi, 10/10/2026; Lee, 26/10/2026). */}
          <div className="flex items-center gap-1 px-2">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {NAV.map((group) => {
            // Labels may change; keep existing readers' stored choices under the original key.
            const storageKey = group.storageKey
            const title = wordsOf(group.title, t)
            const open = !folded.has(storageKey)
            return (
              <Collapsible key={storageKey} open={open} onOpenChange={() => toggleGroup(storageKey)}>
                <SidebarGroup className="py-1">
                  {/*
                    A REAL `<button>` inside the label, not the label rendered AS the trigger:
                    `SidebarGroupLabel` is a `<div>`, and base-ui's trigger declares `nativeButton`,
                    so handing it the div traded away native button semantics and said so in the
                    console on every paint (measured 22/09).
                  */}
                  <CollapsibleTrigger
                    render={<button type="button" aria-label={title} data-ops-group={storageKey} />}
                    className="flex h-8 w-full shrink-0 cursor-pointer items-center rounded-md border border-transparent px-2 font-medium text-[13px] text-sidebar-foreground/70 outline-none transition-[margin,opacity] duration-200 ease-linear hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0"
                  >
                    <span className="truncate">{title}</span>
                    <ChevronRight
                      className={cn(
                        'ms-auto size-3.5 transition-transform duration-150',
                        open && 'rotate-90'
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.rows.map((row) => {
                          const active = isActive(row)
                          const href =
                            row.area === 'root' && row.woView
                              ? woRailHref(row.woView)
                              : row.area === 'page'
                                ? row.href
                                : hrefFor({
                                    ...route,
                                    area: row.area,
                                    screen: row.id,
                                    template: null,
                                    view: null
                                  } as Route)
                          return (
                            <SidebarMenuItem
                              key={`${row.area}:${row.id}:${row.area === 'root' ? (row.woView ?? '') : ''}`}
                            >
                              <SidebarMenuButton
                                isActive={active}
                                className="data-active:bg-sidebar-foreground/10 data-active:hover:bg-sidebar-foreground/10 data-active:active:bg-sidebar-foreground/10"
                                tooltip={labelOf(row, t)}
                                render={
                                  <a
                                    href={href}
                                    onClick={onRowClick(row)}
                                    aria-current={active ? 'page' : undefined}
                                  />
                                }
                              >
                                {row.icon}
                                <span>{labelOf(row, t)}</span>
                              </SidebarMenuButton>
                              {row.area === 'root' && row.id === 'attention' && (attentionCount ?? 0) > 0 ? (
                                <SidebarMenuBadge data-attention-count={attentionCount}>
                                  {attentionCount}
                                </SidebarMenuBadge>
                              ) : null}
                              {row.area === 'root' && row.id === 'stuck' && (stuckCount ?? 0) > 0 ? (
                                <SidebarMenuBadge data-stuck-count={stuckCount}>
                                  {stuckCount}
                                </SidebarMenuBadge>
                              ) : null}
                            </SidebarMenuItem>
                          )
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            )
          })}
        </SidebarContent>

        <SidebarFooter>
          {viewer ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton size="lg" tooltip={viewer.email}>
                        {/* The same face the Team tab and the comments give this account:
                            the server's letter and colour, from `/auth/me`. */}
                        <Face face={me.face ?? NO_FACE} size={32} />
                        <div className="grid min-w-0 flex-1 text-left leading-tight">
                          <span className="truncate font-medium text-sm">{viewer.email}</span>
                          {/*
                            The ROLE, not a decoration: it is what `['owner','admin'].includes(role)`
                            decides on every write door here, so a developer looking at a disabled
                            button finally has the reason on screen.
                          */}
                          <span className="truncate text-muted-foreground text-xs">
                            {viewer.writable
                              ? roleName(t, viewer.role)
                              : t('shell.account.roleReadOnly', { role: roleName(t, viewer.role) })}
                          </span>
                        </div>
                        <ChevronsUpDown className="ms-auto size-4" />
                      </SidebarMenuButton>
                    }
                  />
                  <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
                    <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
                      {t('shell.account.signedInAs', { email: viewer.email })}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void signOut()}>
                      <LogOut />
                      {t('shell.account.signOut')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </SidebarFooter>
        <SidebarRail label={t('shell.sidebar.toggle')} />
      </Sidebar>

      <SidebarInset className="min-w-0">
        {/* On a narrow screen the rail is a drawer, and this bar holds the only way in. On a wide
            one the toggle is in the rail itself, so the bar shows only while a screen has put
            something in its slot (the environment picker, a search box). */}
        <div className="flex h-11 flex-none items-center gap-2 border-border border-b bg-background px-3 md:has-[[data-topbar-slot]:empty]:hidden">
          <SidebarTrigger label={t('shell.sidebar.toggle')} className="md:hidden" />
          {/* No screen name here: every screen titles itself below, so the bar would say it twice (Akemi, 10/10/2026). */}
          {/*
            An empty slot the AREA fills, never the shell (Lee, 22/09: the environment picker
            belongs on the same row as the screen's name).
            🔒 A SLOT AND NOT A PROP, because filling it from here would mean the shell knowing
            which refs this build published — and that read lives in `cms/api.ts`, whose module
            graph is the whole cms chunk. `cms/App.tsx` portals into this node instead, so the
            control is drawn by the code that owns it and disappears with it when the area
            unmounts. See this file's header on why `/ops` must not pay for `/ops/cms`.
          */}
          <div id={TOPBAR_SLOT_ID} data-topbar-slot="" className="ms-auto flex min-w-0 items-center gap-2" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {route.area === 'root' ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              {route.screen === 'agents' ? (
                <CmsAgents
                  role={role}
                  platform={platform}
                  onOpenPreset={(r, p) => {
                    setRole(r)
                    setPlatform(p)
                    go({ area: 'root', screen: 'presets' })
                  }}
                />
              ) : route.screen === 'presets' ? (
                <Preset
                  role={role}
                  platform={platform}
                  onBack={() => go({ area: 'root', screen: 'agents' })}
                />
              ) : route.screen === 'voice' ? (
                <Voice />
              ) : route.screen === 'hosts' ? (
                <HostAgents />
              ) : route.screen === 'shards' ? (
                <Shards />
              ) : route.screen === 'widget' ? (
                <Widget />
              ) : route.screen === 'mail' ? (
                <Mail />
              ) : route.screen === 'ci' ? (
                <Ci />
              ) : route.screen === 'release' ? (
                <ReleaseChecklist />
              ) : route.screen === 'invitations' ? (
                <Invitations />
              ) : route.screen === 'wo' ? (
                <Wo
                  entry={route}
                  navigate={(href, replace) => navigation.current?.navigate(href, replace) ?? false}
                />
              ) : route.screen === 'servers' ? (
                <Servers />
              ) : route.screen === 'model' ? (
                <ModelAi />
              ) : route.screen === 'ui' ? (
                <UserInterface />
              ) : route.screen === 'attention' ? (
                <Attention onCount={setAttentionCount} />
              ) : route.screen === 'signals' ? (
                <Signals onOpenWaitlist={() => go({ area: 'root', screen: 'waitlist' })} />
              ) : route.screen === 'app-statistic' ? (
                <AppStatistic />
              ) : route.screen === 'waitlist' ? (
                <Waitlist />
              ) : route.screen === 'stuck' ? (
                <Stuck onCount={setStuckCount} />
              ) : route.screen === 'usage' ? (
                <Usage />
              ) : (
                <Settings panel={route.panel} onPanel={(panel) => go({ panel })} />
              )}
            </div>
          ) : (
            // A plain fallback, not `Spinner` from `cms/parts` — importing it here would pull that
            // module, and everything it imports, into this chunk.
            <Suspense
              fallback={<div className="px-6 py-6 text-muted-foreground text-sm">{t('shell.loading')}</div>}
            >
              <CmsArea route={route} go={go} />
            </Suspense>
          )}
        </div>
      </SidebarInset>
      <NewVersionNotice stale={newBundle} />
    </SidebarProvider>
  )
}

/** A root screen's words, from the rail rather than a second list — one place to rename a screen. */
