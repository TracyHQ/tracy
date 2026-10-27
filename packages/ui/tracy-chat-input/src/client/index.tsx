/**
 * `@tracy/dsh-chat-input` — Tracy's first screen above dsh's input bar.
 *
 * UNTIL 03/09/2026 this package REPLACED dsh's input bar (it took the single
 * `conversation.composer.bar` slot). That cost every feature the bar carries through slot
 * children and injected seams — the + command launcher, `/` commands, `@` files and sessions,
 * the model chip with its Effort submenu, draft images, the turn statistics — and each one had
 * to be rebuilt by hand. Lee reversed it: on real sites dsh's bar stays, Tracy dresses it (dsh-brand's coat
 * CSS keys on `[data-slot="conversation.composer.bar"]`) and adds what is Tracy's through
 * `conversation.input.dock`, the list slot dsh renders above the bar.
 *
 * 🔒 NO PROMPT CHIPS IN A SITE'S WORKSPACE — removed 21/09/2026 (Lee). From 03/09 to 21/09 the
 * dock drew four site chips ("What is this site…", "Check this page's SEO", …) above the bar of
 * every blank session. They were written for a lane where the customer opened a finished site and
 * asked about it; since the Build tab drives the session (the site is created, imported and
 * configured from the side card, and the first message is the build conversation the tab starts)
 * the chips sat over a to-do list of a site that did not exist yet, asking about "this page". The
 * dock now carries the creation workspace's first screen, and on every workspace one line while a
 * Tracy update holds a message (`DeployHoldNotice.tsx`, #517). Bringing a chip set back is a
 * product decision, not a revert.
 *
 * `conversation.input.dock` is session-scoped and declared by ui-conversation's root entry, so
 * the runtime hands this occupant the session-standard props: `session` and `input` (draft,
 * image ids) as owner values, `inputActions` (setDraft, submit, …) from the runtime share.
 * The block reads `session.blank` so it only shows before the session's first message — an
 * empty draft alone isn't enough, since clearing the draft mid-conversation shouldn't bring it
 * back.
 */

import { mainSessionOf } from '@tracy/core/session'
import { NativeWidgetContext, nativeWidgetSession } from './NativeWidgetContext'
import { ActivityPieces } from '@tracy/core/input-activity/react'
import { uiSwitches } from '@tracy/core/ui-switches'
import { revealTab, type SidebarRight, sidebarRightOf } from '@tracy/core/tab-link'
import { StartTitle } from './start-title'
import {
  ArrowUpRight,
  Box,
  Globe,
  Link,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  MousePointer2,
  MousePointerClick,
  Paintbrush,
  Palette,
  Store,
  Users
} from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { addressFace, FaceStack } from '@tracy/core/team/face'
import { readTeam, TEAM_CHANGED_EVENT, teamCardOf } from './team-card.mjs'
import { commitClearOnLeave } from './comment-clear.mjs'
import { listenForComments, sentTurns } from './comment-send.mjs'
import { watchWorkingComments } from './comment-working.mjs'
import { watchTurnProgress } from './comment-status.mjs'
import { tellUnreadCount } from './comment-unread.mjs'
import { badgeText, createChangesCount, readUnseenChanges } from './changes-count.mjs'
import { tellChangesCount } from './changes-unseen.mjs'
import { sentFromChatBox } from './start-sent.mjs'
import { ONBOARDING_START_EVENT, openOnboardingStart, startPlatformOf } from './onboarding-start'
import { registerCommentFold } from './comment-turn.mjs'
import {
  ACT_EVENT,
  badgeCount,
  chipColor,
  commentsViewDefinition,
  senderOf,
  shownTab,
  revealDetail,
  storedTextOf,
  unreadBadge
} from './comment-view.mjs'
import { forgetWhenLeft } from './comments-wanted.mjs'
import { OPEN_EVENT, openChatView, openCommentsView, readOpenDetail } from './comments-open.mjs'
import { browserTargetOf } from '../../../../site/tracy-site-tabs/src/client/browser-link.mjs'
import { sendToChat } from '../../../../site/tracy-site-tabs/src/client/chat-send'
import {
  browserTabsOn,
  hostsOfSite,
  siteTabReloader
} from '../../../../site/tracy-site-tabs/src/client/site-reload.mjs'
import { readSites } from '../../../tracy-sidebar/src/client/sites.mjs'
import {
  COMMENTS_VIEW,
  commentsViewActive,
  type CommentsState,
  countName,
  createCommentsState,
  listenForCommentLists,
  makeCommentsFooter,
  makeCommentsView,
  unreadWords,
  watchCommentsBadge
} from './CommentsView'
import { ChatThread } from './ChatThread'
import { CommentReportCard, type CommentReportCardProps } from './CommentReportCard'
import { ComposerChips } from './ComposerChips'
import { ChatWaitLine } from './ChatWaitLine'
import { DeployHoldNotice } from './DeployHoldNotice'
import { timeOf, TurnUndoCard, type TurnUndoCardProps } from './TurnUndoCard'
import { onDesignSystemChanged, onSiteSynced, sameSiteKey } from '@tracy/core/turn-undo'
import {
  DS_SWITCH,
  DS_TAB,
  designSystemCardOf,
  pressDesignSystem,
  readWornDesignSystem
} from './design-system-card.mjs'
import { createTurnsBook } from './turn-undo.mjs'
import { followTurnUndone } from './turn-undo-sync.mjs'
import { watchUndoToolbar } from './undo-toolbar.mjs'
import { siteKeyFromPath } from './interrupted.mjs'
import {
  createAskedSites,
  createPromotedNotice,
  createSeatRole,
  isViewerRole,
  mirrorViewerAttr,
  NO_ROLE,
  watchRoleSignals
} from './seat-role.mjs'
import { SeatBar } from './SeatBar'
import { ViewerBar } from './ViewerBar'
import { en, fallback, NS, type Translate } from './strings'
import { CSS } from './styles'
import { COMPOSER_CSS } from './composer-styles'
import { keepModelMenuFocus } from './model-menu-focus'
import { MODEL_MENU_CSS } from './model-menu-styles'
import { COLUMN_CSS } from './column-styles'
import { viewToLeaveFor } from './hidden-view.mjs'
import { watchShell } from './trim'
import { speechFacts, type SpeechFacts, VoiceInput, type VoiceInputProps } from './VoiceInput'
import { chatMainLanguage, voiceHint } from './voice-language.mjs'
import { publishVoiceInput } from './voice-bridge.mjs'
import { VOICE_CSS, VOICE_MODE_CSS } from './voice-styles'
import {
  type ModeActions,
  ModeMenu,
  VoiceModeFooter,
  VoiceModeStart,
  VoiceModeView,
  VoiceTip
} from './VoiceMode'
import {
  CHAT_VIEW,
  flag,
  pressViewTab,
  shownSessions,
  tellSpoken,
  VOICE_VIEW,
  viewTab
} from './voice-mode-view.mjs'
import { dshUrl } from './dsh-url'
import { pendingPlan, pendingPlanReview, pendingQuestion } from './voice-answer.mjs'
import { createVoiceMode } from './voice-mode.mjs'
import { openPlayer } from './voice-player'
import { claimVoice } from './voice-claim.mjs'
import { openMicrophone } from './voice-capture'
import { openSpeechLink, pageSite, speechHttpPath, speechSocketUrl } from './voice-link.mjs'
import { createMicPicker, pageStorage } from './voice-mic.mjs'
import { sendTrace } from './voice-trace.mjs'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { messageLanguage } from '@tracy/core/language'

/**
 * Where this page stands: a site's workspace, or the viewer's own creation workspace.
 *
 * 🔒 READ THE PAGE, NOT A CONFIG FLAG. Until 14/09 the onboarding set was gated on a meta tag the
 * Node half wrote from `config.audience` — a decision made per BUNDLE, from the days when a
 * separate `onboard-dsh` container served everyone who had no site. Since ADR 0014 one dsh
 * serves both `/new/` and every site on the host, so no static flag can be right for both, and
 * no bundle ever set it: measured on a fresh account 14/09, `/new/` drew the four site chips
 * (`tasks/khao-sat-ux-nguoi-dung-moi-2026-09-14.md` §2.1).
 *
 * tracy-web serves the creation workspace with `<base href="/new/">` (`apps/tracy-web/src/
 * workspace/scope.js`), and dsh writes the session into the path, never into the base — so the
 * base is the one thing on the page that says which workspace this is. Same probe
 * `@tracy/dsh-design-inspiration` uses (`dsh-url.ts`, `inOnboarding`). The meta tag stays as an
 * override for a deployment that wants the onboarding surface on some other mount.
 */
const AUDIENCE_META = 'tracy-chat-input-audience'
const ONBOARDING_MOUNT = '/new'
/** The /ops › User Interface switch of the chat box's microphone (`VoiceInput.tsx`). */
const VOICE_SWITCH = 'composer-voice-input'
/** The switch that lets Voice take a plan's approval by voice (`voice-mode.mjs`; council 19/10/2026, A6). Off by default. */
const PLAN_BY_VOICE_SWITCH = 'voice-plan-approval'
/** Where this browser keeps the voice a person picked for Tracy (a convenience: the default otherwise). */
const VOICE_PICK_KEY = 'tracy.voice-mode.voice'
/** Written on <html> so plain CSS can key on the scope (styles.ts hides what has no meaning here). */
const SCOPE_ATTR = 'data-tracy-scope'
/** On <html> while this page's seat is a Viewer (ADR 0028): composer-styles.ts keys the chat box hint on it. */
const VIEWER_SEAT_ATTR = 'data-tracy-seat-viewer'

/** @returns true inside the creation workspace — signed in, no site, a site about to be made. */
function isOnboarding(): boolean {
  if (document.querySelector('meta[name="tracy-widget-native"]')) return true
  if (document.querySelector(`meta[name="${AUDIENCE_META}"]`)?.getAttribute('content') === 'onboarding')
    return true
  try {
    return new URL(document.baseURI).pathname === `${ONBOARDING_MOUNT}/`
  } catch {
    return false
  }
}

interface DockProps {
  /** Owner value from the slot: the session this input belongs to. */
  session?: { blank?: boolean; sessionId?: string }
  /** Owner value from the slot: the live input state; `sent` counts what the chat box sent (fork tracy.25). */
  input?: { draft?: string; sent?: number }
  /** Session-standard runtime share. */
  inputActions?: { setDraft?: (text: string) => void }
  t?: Translate
  /** The side card, when this lane carries one. Absent leaves the three cards disabled. */
  sidebar?: BetterSidebar
  /** dsh's right column, read when a card is pressed (`openTabWithMeta` patches the tab it lands on). */
  right?: () => SidebarRight | undefined
  /** Inside the creation workspace: draw the first screen. Elsewhere the dock stays empty. */
  onboarding: boolean
  /** The site this page is the workspace of; null on `/new/`. */
  siteKey: string | null
  /** The Comments view's state: the start card's count, and the view it opens. */
  comments: CommentsState
  /** The conversation on screen (`mainSessionOf`), which the Comments card opens the view in. */
  sessionOnScreen: () => string | undefined
  /** dsh's client-local transcript rows, where `@tracy/dsh-assistant` keeps Help questions (`start-sent.mjs`). */
  chatLocal: ChatLocal
  /** This page's seat role on its site (`seat-role.mjs`); a Viewer gets the read-only start screen. */
  seatRole: SeatRole
  /** The sites this page already asked edit access for, shared by both Viewer bars (`createAskedSites`). */
  asked: ReturnType<typeof createAskedSites>
}

/** The slice of ui-chat's `chatLocal` service the start screen reads. */
interface ChatLocal {
  for(sessionId: string): {
    nodes: {
      subscribe(listener: () => void): () => void
      getSnapshot(): readonly { kind: string; data?: unknown }[]
    }
  }
}

const NO_ROWS: readonly never[] = []

/**
 * Uses the side card's registry to decide whether a card can be pressed at all.
 *
 * 🔒 ASK THE SIDE CARD AGAIN WHENEVER ITS REGISTRY CHANGES, NEVER ONCE AT LOAD. Plugin order is
 * not a contract: reading `getTab` a single time while this plugin applies answers for whatever
 * happened to be registered at that instant, and a lane where the tab's plugin registers a moment
 * later would draw a dead card forever. Same reason tracy-tab-link waits on `subscribe`.
 */
function useTabKnown(sidebar: BetterSidebar | undefined, type: string): boolean {
  const [known, setKnown] = useState(() => sidebar?.getTab(type) !== undefined)
  useEffect(() => {
    if (!sidebar) return
    const read = () => setKnown(sidebar.getTab(type) !== undefined)
    read()
    return sidebar.subscribe(read)
  }, [sidebar, type])
  return known
}

/** The colour of a card's round icon: one tone per door, set in styles.ts for both themes. */
type StartTone =
  | 'create'
  | 'business'
  | 'template'
  | 'import'
  | 'edit'
  | 'comments'
  | 'changes'
  | 'design-system'
  | 'team'

function StartCard({
  sidebar,
  type,
  Icon,
  tone,
  title,
  count,
  countTitle,
  dot = false,
  unread,
  trailing,
  onPress
}: {
  sidebar?: BetterSidebar
  type: string
  Icon: LucideIcon
  tone: StartTone
  title: string
  /**
   * A round grey count at the card's end, drawn only above 0 and as `9+` past nine (`badgeText`):
   * the Comments card's open threads, the Site changes card's changes not yet looked at.
   */
  count?: number
  /** Hover and screen-reader words for the count (what the number is), when no dot speaks for it. */
  countTitle?: string
  /** A red dot on the count (the Comments card: this person has unread open threads). */
  dot?: boolean
  /** What the dot says ("N unread"): the count's tooltip, and part of the card's name. */
  unread?: string
  /** Whatever else the card's end carries (the Team card: faces and the number of members). */
  trailing?: ReactNode
  onPress: () => void
}): JSX.Element | null {
  const known = useTabKnown(sidebar, type)
  // A tab an operator switched off (/ops › User Interface, a tab-* switch) has no card either: the
  // card is only a road to the tab, and a road to nothing is worse than no road.
  const ui = uiSwitches()
  const allowed = useSyncExternalStore(ui.subscribe, () => ui.tabPolicy().isAllowed(type))
  if (!allowed) return null
  const shown = count !== undefined && count > 0
  const dotted = shown && dot && unread !== undefined
  return (
    <button
      type="button"
      className="tv-start-card"
      disabled={!known || !sidebar}
      aria-label={dotted ? countName(title, count, unread) : undefined}
      onClick={onPress}
    >
      <span className="tv-start-card-icon" data-tone={tone} aria-hidden="true">
        <Icon />
      </span>
      <span className="tv-start-card-title">{title}</span>
      {shown ? (
        <span
          className="tv-start-card-count"
          data-dot={dotted ? '' : undefined}
          title={dotted ? unread : countTitle}
          aria-label={dotted ? undefined : countTitle}
        >
          {badgeText(count)}
        </span>
      ) : null}
      {trailing}
    </button>
  )
}

/**
 * The first screen of somebody who has signed in and holds no site: the mark and the title, one
 * line under them, and the three doors that actually lead somewhere. Shape approved by Akemi
 * 01/10/2026. The local Option B experiment keeps these doors as a secondary row, while the
 * assistant plugin owns a Help-only composer so no question reaches the no-site agent.
 *
 * Two doors are the Add site tab opened on one of its origin cards, so "Add site" no longer hides
 * two different jobs behind one word: the press rides in the tab's `meta` as `origin`
 * (`@tracy/dsh-add-site` `platformPressOf`), stamped with `pressedAt` so a tab already open moves
 * to the card pressed and a restored tab never does. The third is the Design inspirations tab.
 */
function Start({
  t,
  sidebar,
  right
}: {
  t?: Translate
  sidebar?: BetterSidebar
  right?: () => SidebarRight | undefined
}): JSX.Element {
  // Build from my business shows only while the operator's switch is on (`site-from-business`, catalogue.json).
  const ui = uiSwitches()
  const fromBusiness = useSyncExternalStore(ui.subscribe, () => ui.isShown('site-from-business'))
  const openAddSite = (origin: 'create' | 'import' | 'business') => {
    if (!sidebar) return
    openOnboardingStart(sidebar, right?.(), origin)
  }
  return (
    <div className="tv-start">
      {/* The mark sits inline before the title's first word (Akemi 23/10/2026). dsh draws its own
          mark in the hero stack above the dock; styles.ts hides that stack while this block is
          up, so the mark is drawn once, here, from the one home the geometry has. */}
      <div className="tv-start-heading">
        <StartTitle text={fallback(t, 'start.title')} />
      </div>
      <p className="tv-start-subtitle">{fallback(t, 'start.subtitle')}</p>
      <div className="tv-start-cards">
        <StartCard
          sidebar={sidebar}
          type={ADD_SITE_TAB}
          Icon={Box}
          tone="create"
          title={fallback(t, 'start.create')}
          onPress={() => openAddSite('create')}
        />
        {fromBusiness ? (
          <StartCard
            sidebar={sidebar}
            type={ADD_SITE_TAB}
            Icon={Store}
            tone="business"
            title={fallback(t, 'start.business')}
            onPress={() => openAddSite('business')}
          />
        ) : null}
        <StartCard
          sidebar={sidebar}
          type={DESIGN_TAB}
          Icon={Palette}
          tone="template"
          title={fallback(t, 'start.template')}
          onPress={() => openOnboardingStart(sidebar, right?.(), 'templates')}
        />
        <StartCard
          sidebar={sidebar}
          type={ADD_SITE_TAB}
          Icon={Link}
          tone="import"
          title={fallback(t, 'start.import')}
          onPress={() => openAddSite('import')}
        />
      </div>
    </div>
  )
}

/**
 * The site's book as `GET /api/team` last answered it, read when the start screen of `siteKey` comes
 * up and again whenever the Team tab says it wrote a seat of this site (`TEAM_CHANGED_EVENT`).
 *
 * An answer is kept with the site it was asked for, and only the latest request's answer is kept:
 * switching sites quickly never shows the number of the site just left, and a slow first read never
 * overwrites a newer one. Undefined while nothing is read for this site; null when the door did not
 * answer with a book (signed out, refused, offline) — the card then says nothing.
 */
function useSiteTeam(siteKey: string): unknown {
  const [answer, setAnswer] = useState<{ siteKey: string; body: unknown } | null>(null)
  useEffect(() => {
    // Only a served page has the door (a file:// render harness has none, and would log a failed fetch).
    if (!/^https?:$/.test(globalThis.location?.protocol ?? '')) return
    let alive = true
    let latest = 0
    const read = () => {
      const asked = ++latest
      void readTeam((input, init) => globalThis.fetch(input, init)).then((body) => {
        if (alive && asked === latest) setAnswer({ siteKey, body })
      })
    }
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ siteKey?: unknown } | null>).detail?.siteKey === siteKey) read()
    }
    read()
    window.addEventListener(TEAM_CHANGED_EVENT, onChanged)
    return () => {
      alive = false
      window.removeEventListener(TEAM_CHANGED_EVENT, onChanged)
    }
  }, [siteKey])
  return answer?.siteKey === siteKey ? answer.body : undefined
}

/**
 * The Team card's end: up to three faces of the OTHER members and the number of all of them, or
 * "only you" (`clusterOf`, the rule the My Sites row draws). Nothing while the book is being read or
 * could not be read: no number is better than an invented one.
 */
function TeamTrailing({
  t,
  siteKey,
  comments
}: {
  t?: Translate
  siteKey: string
  comments: CommentsState
}): JSX.Element | null {
  const body = useSiteTeam(siteKey)
  // The viewer as `/auth/me` told the Comments view (read once per page there, never asked again).
  const viewer = useSyncExternalStore(
    comments.lists.subscribe,
    () => comments.lists.getSnapshot().viewer ?? null
  )
  const card = teamCardOf(body, siteKey, viewer)
  if (card === null) return null
  return (
    <span className="tv-start-card-faces" data-team-count={card.count}>
      {card.faces.length > 0 && <FaceStack people={card.faces} size={20} ring="var(--card, #ffffff)" />}
      <span className="tv-start-card-people">
        {card.onlyYou ? fallback(t, 'start.site.team.onlyYou') : card.count}
      </span>
    </span>
  )
}

/**
 * The first screen of a site's workspace (Akemi 01/10/2026, start-screen mockup, Case 2, option A):
 * the question, the site's address under it, and four round cards that open what the site already
 * has, which until now sat out of sight in the right column. No My Sites card: the site chip at the
 * top left switches sites (`@tracy/dsh-my-sites`); Team instead, because comments only mean
 * something once other people work on the site too.
 *
 * - Edit: the Browser tab on the site's home page, in Edit mode (the tab reads `?mode=edit` off the
 *   address it is opened at, `browser-link.mjs` `browserTargetOf`).
 * - Comments: the chat column's Comments view, through the same road as the Browser toolbar's
 *   Comments button (`tracy:comments-open`). The grey count is the site's open threads, all authors
 *   (`badgeCount`), the number the Comments tab and its All pages pill show; a red dot on it while this
 *   person has unread open threads (`unreadBadge` above 0; none until the read marks are in), its
 *   tooltip and the card's name saying "N unread" (Lee 04/10/2026).
 * - Site changes: that tab, as the + menu opens it. The count is the site's changes this person has
 *   not looked at and did not make through Tracy (`changes-count.mjs`, server door
 *   `/activity/unseen`); it drops to 0 as the tab marks the list seen (`tracy:changes-seen`).
 * - Team: that tab, as the + menu opens it. The card ends with the site's people (`TeamTrailing`):
 *   faces of the others and the number of members, or "only you".
 *
 * The composer stays at the bottom of the column under this block (styles.ts), with the role chip in
 * its control row (`@tracy/dsh-mode-picker`).
 */
/**
 * The address the site is served at (`/api/sites` `copyUrl`, the one the Browser tab opens), for the
 * host line under the start screen's heading to link to (Akemi 14/10/2026). Null while unknown, when
 * the door does not answer, or when the row has no http(s) address: the line is then plain text.
 */
function useSiteAddress(siteKey: string): string | null {
  const [answer, setAnswer] = useState<{ siteKey: string; url: string | null } | null>(null)
  useEffect(() => {
    // Only a served page has the door (a file:// render harness has none, and would log a failed fetch).
    if (!/^https?:$/.test(globalThis.location?.protocol ?? '')) return
    let alive = true
    void readSites()
      .then(({ status, body }) => {
        if (!alive || status < 200 || status >= 300) return
        const rows = (body as { sites?: SiteRow[] } | null)?.sites ?? []
        const row = rows.find((r) => r.siteKey === siteKey || (r.aliases ?? []).includes(siteKey))
        setAnswer({ siteKey, url: httpAddressOf(row?.copyUrl) })
      })
      .catch(() => {
        // No answer: the host line stays plain text.
      })
    return () => {
      alive = false
    }
  }, [siteKey])
  return answer?.siteKey === siteKey ? answer.url : null
}

/** @returns the address when it parses as an http(s) URL, else null (never a dead or script link). */
function httpAddressOf(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** The page's role store (`createSeatRole`). */
type SeatRole = {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => string | null
  isRemoved: () => boolean
  refresh: () => Promise<void>
}
type ChangesCount = { subscribe: (fn: () => void) => () => void; getSnapshot: () => number | null }
const NO_COUNT: ChangesCount = { subscribe: () => () => undefined, getSnapshot: () => null }
/**
 * The page's own store (`createChangesCount`), made once for the site the page is (`apply`), alive
 * for as long as the page: it also tells the right column's Site changes tab the number
 * (`changes-unseen.mjs`), which must not stop when the start screen gives way to a conversation.
 */
let pageChanges: { siteKey: string; store: ChangesCount } | null = null
/** The site's count for the start card: the page's store when it is this site's, else one of its own. */
function useUnseenChanges(siteKey: string): number | null {
  const shared = pageChanges !== null && pageChanges.siteKey === siteKey ? pageChanges.store : null
  const [own, setOwn] = useState<ChangesCount>(NO_COUNT)
  useEffect(() => {
    if (shared !== null) return
    const live = createChangesCount({ siteKey, read: () => readUnseenChanges(siteKey) })
    setOwn(live)
    return () => {
      live.stop()
      setOwn(NO_COUNT)
    }
  }, [siteKey, shared])
  const store = shared ?? own
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/**
 * What the site wears now, as the Design system door last answered (`design-system-card.mjs`), read
 * when the start screen of `siteKey` comes up and again on `tracy:design-system-changed` for this site.
 * Undefined while reading; `{kind: 'none'}` when the site has no door (404) or it failed.
 */
function useWornDesignSystem(siteKey: string): ReturnType<typeof designSystemCardOf> | undefined {
  const [answer, setAnswer] = useState<{
    siteKey: string
    card: ReturnType<typeof designSystemCardOf>
  } | null>(null)
  useEffect(() => {
    // Only a served page has the door (a file:// render harness has none).
    if (!/^https?:$/.test(globalThis.location?.protocol ?? '')) return
    let alive = true
    let latest = 0
    const read = () => {
      const asked = ++latest
      void readWornDesignSystem(siteKey).then((r) => {
        if (alive && asked === latest) setAnswer({ siteKey, card: designSystemCardOf(r) })
      })
    }
    read()
    const off = onDesignSystemChanged((detail) => {
      if (detail.siteKey === siteKey) read()
    })
    return () => {
      alive = false
      off()
    }
  }, [siteKey])
  return answer?.siteKey === siteKey ? answer.card : undefined
}

/**
 * The Design system card (Akemi U2 A, 12/10/2026): the site's Design system tab, opened through the same
 * page event as the site browser toolbar's Design system button, so both doors open one tab. Its end
 * names the system the site wears, or "Template default". No card while the operator's switch for the
 * button is off, or for a site whose door answers nothing (no invented name).
 */
function DesignSystemCard({
  t,
  sidebar,
  siteKey,
  sessionOnScreen
}: {
  t?: Translate
  sidebar?: BetterSidebar
  siteKey: string
  sessionOnScreen: () => string | undefined
}): JSX.Element | null {
  const ui = uiSwitches()
  const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown(DS_SWITCH))
  const card = useWornDesignSystem(siteKey)
  if (!shown || card === undefined || card.kind === 'none') return null
  const name = card.kind === 'worn' ? card.name : fallback(t, 'start.site.designSystem.default')
  return (
    <StartCard
      sidebar={sidebar}
      type={DS_TAB}
      Icon={Paintbrush}
      tone="design-system"
      title={fallback(t, 'start.site.designSystem')}
      trailing={
        <span className="tv-start-card-faces">
          <span className="tv-start-card-people tv-start-card-ds-name" title={name}>
            {name}
          </span>
        </span>
      }
      onPress={() => pressDesignSystem(window, siteKey, sessionOnScreen())}
    />
  )
}

function SiteStart({
  t,
  sidebar,
  siteKey,
  comments,
  sessionOnScreen,
  viewer = false
}: {
  t?: Translate
  sidebar?: BetterSidebar
  siteKey: string
  comments: CommentsState
  sessionOnScreen: () => string | undefined
  /** A Viewer seat (ADR 0028): a question instead of a change, and no Edit card. */
  viewer?: boolean
}): JSX.Element {
  const openComments = useSyncExternalStore(comments.lists.subscribe, () =>
    badgeCount(comments.lists.getSnapshot())
  )
  const unreadComments = useSyncExternalStore(comments.lists.subscribe, () =>
    unreadBadge(comments.lists.getSnapshot())
  )
  const unread = unreadWords(unreadComments, t)
  const unseenChanges = useUnseenChanges(siteKey)
  const address = useSiteAddress(siteKey)
  const openEdit = () => {
    if (!sidebar) return
    void readSites().then(({ status, body }) => {
      if (status < 200 || status >= 300) return
      const rows = (body as { sites?: SiteRow[] } | null)?.sites ?? []
      const row = rows.find((r) => r.siteKey === siteKey || (r.aliases ?? []).includes(siteKey))
      const url = browserTargetOf(row?.copyUrl, { page: '/', mode: 'edit' })
      // No address to open (a site still being provisioned): nothing to show, so nothing opens.
      if (url !== null) sidebar.openTab({ type: BROWSER_TAB, url })
    })
  }
  const openCommentsView = () => {
    const sessionId = sessionOnScreen()
    if (sessionId === undefined) return
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { sessionId } }))
  }
  return (
    <div className="tv-start tv-start-site">
      <StartTitle text={fallback(t, viewer ? 'start.site.titleViewer' : 'start.site.title')} />
      <p className="tv-start-subtitle">
        {address === null ? (
          siteKey
        ) : (
          <a
            className="tv-start-site-link"
            href={address}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={fallback(t, 'start.site.openSite', { host: siteKey })}
          >
            <span className="tv-start-site-host">{siteKey}</span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        )}
      </p>
      <div className="tv-start-cards">
        {/* Edit opens the preview in Edit mode: nothing a Viewer may do there, so no card at all. */}
        {!viewer && (
          <StartCard
            sidebar={sidebar}
            type={BROWSER_TAB}
            Icon={MousePointer2}
            tone="edit"
            title={fallback(t, 'start.site.edit')}
            onPress={openEdit}
          />
        )}
        <StartCard
          sidebar={sidebar}
          type={BROWSER_TAB}
          Icon={MessageSquare}
          tone="comments"
          title={fallback(t, 'start.site.comments')}
          count={openComments}
          dot={unread !== null}
          unread={unread ?? undefined}
          onPress={openCommentsView}
        />
        <StartCard
          sidebar={sidebar}
          type={CHANGES_TAB}
          Icon={ListChecks}
          tone="changes"
          title={fallback(t, 'start.site.changes')}
          count={unseenChanges ?? 0}
          countTitle={fallback(
            t,
            unseenChanges === 1 ? 'start.site.changesCountOne' : 'start.site.changesCount',
            { count: unseenChanges ?? 0 }
          )}
          onPress={() => sidebar?.openTab({ type: CHANGES_TAB })}
        />
        <DesignSystemCard t={t} sidebar={sidebar} siteKey={siteKey} sessionOnScreen={sessionOnScreen} />
        <StartCard
          sidebar={sidebar}
          type={TEAM_TAB}
          Icon={Users}
          tone="team"
          title={fallback(t, 'start.site.team')}
          trailing={<TeamTrailing t={t} siteKey={siteKey} comments={comments} />}
          onPress={() => sidebar?.openTab({ type: TEAM_TAB })}
        />
      </div>
    </div>
  )
}

/**
 * The first screen shows only before the session's first message, while the draft is empty.
 *
 * 🔒 `sentRef` EXISTS BECAUSE THE TWO CONDITIONS DO NOT FALL AT THE SAME TIME. Measured on
 * production 08/09: pressing Send empties `input.draft` immediately, but `session.blank` stays
 * true for about a second afterwards. For that second both tests pass again and the whole block
 * repaints — a 1039ms flash of the greeting over a conversation that has already started. The
 * chip set this dock used to carry flickered the same way; it only became obvious once a
 * full-size greeting rode along with it.
 *
 * Remembering that this session has been typed into closes the gap without waiting on `blank`.
 * The ref resets itself when `blank` goes false → true, which is what opening a new session
 * looks like from here.
 */
function Dock({
  session,
  input,
  inputActions,
  t,
  onboarding,
  siteKey,
  comments,
  sessionOnScreen,
  sidebar,
  right,
  chatLocal,
  seatRole,
  asked
}: DockProps): JSX.Element | null {
  const viewer = useSyncExternalStore(seatRole.subscribe, () => isViewerRole(seatRole.getSnapshot()))
  const sentRef = useRef({ typed: false, wasBlank: false })
  const blank = session?.blank === true
  const draft = input?.draft ?? ''
  const local = session?.sessionId !== undefined ? chatLocal.for(session.sessionId) : undefined
  const rows = useSyncExternalStore(
    (listener) => local?.nodes.subscribe(listener) ?? (() => {}),
    () => local?.nodes.getSnapshot() ?? NO_ROWS
  )
  // Anything sent from the chat box ends the start screen, a `/` command included (start-sent.mjs).
  const sent = sentFromChatBox(input, rows)
  // A new session: blank flips back to true, so the memory of the last one is stale.
  if (blank && !sentRef.current.wasBlank) sentRef.current.typed = false
  sentRef.current.wasBlank = blank
  if (draft !== '') sentRef.current.typed = true

  // An operator can take the Start block away (/ops › User Interface, id start-cards); the
  // composer then shows at once, because styles.ts hides it only while this block is on screen.
  const ui = uiSwitches()
  const showStart = useSyncExternalStore(ui.subscribe, () => ui.isShown('start-cards'))

  if (!showStart) return null
  if (nativeWidgetSession(session?.sessionId)) return null
  if (!blank) return null
  if (typeof inputActions?.setDraft !== 'function') return null
  if (!onboarding) {
    if (siteKey === null) return null
    // A site's workspace (Case 2): the composer stays under the block, so typing, or clearing what
    // was typed, keeps the cards in place. Send needs no memory here: dsh flips the session to
    // "engaging" on the click's own frame (session-controller `promptAttempted`), the hero docks,
    // and styles.ts draws this block only inside the hero.
    // A `/` command leaves the session blank, so the hero stays: once one was sent the block keeps its
    // wrapper and drops the title and cards. The wrapper is what styles.ts lays the hero out from (the
    // composer at the bottom of the column); without it dsh's centred hero would come back, with the
    // Help rows floating in the middle of the window.
    if (sent) return <div className="tv-dock" data-tracy-start="site" data-tracy-sent="" />
    return (
      <div className="tv-dock" data-tracy-start="site" data-tracy-viewer={viewer ? '' : undefined}>
        <SiteStart
          t={t}
          sidebar={sidebar}
          siteKey={siteKey}
          comments={comments}
          sessionOnScreen={sessionOnScreen}
          viewer={viewer}
        />
        {/* Right above the chat box: what this seat may do, and the way to ask for more. */}
        {viewer && (
          <ViewerBar
            siteKey={siteKey}
            t={t}
            asked={asked}
            place="start"
            onAlreadyEditor={() => seatRole.refresh()}
          />
        )}
      </div>
    )
  }
  // Help owns its own draft and local rows: keep the hero and secondary doors while it answers.
  return (
    <div className="tv-dock" data-tracy-start="1">
      <Start t={t} sidebar={sidebar} right={right} />
    </div>
  )
}

/**
 * The slice of `dsh-better-sidebar`'s service this plugin reads. Structural on purpose, as in
 * tracy-tab-link: importing the vendor's types would bundle the side card into this one.
 */
interface BetterSidebar {
  getTab: (type: string) => { hidden?: boolean } | undefined
  /**
   * Lands in dsh's native right column and expands it (better-sidebar 0.21.1): always in sight. A
   * `tracy:browser` seed carries the address to open (`url`); a second open navigates the tab.
   */
  openTab: (seed: { type: string; meta?: unknown; url?: string }) => void
  /** Patch the tab a press landed on (`openTabWithMeta`): a tab already open keeps its old meta otherwise. */
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  getSnapshot?: () => { sessionId?: string }
  openTabsOf?: (type: string) => readonly { id: string; type: string; meta?: unknown }[]
  /** 0.21.1-tracy.1+ (feature `reloadTab`): ask one open tab to re-fetch what it shows. */
  reloadTab?: (tabId: string, mode?: string) => void
  /** Registry changes: a tab type registered or disposed. */
  subscribe: (listener: () => void) => () => void
}

/** The slice of dsh's session list the comment listener reads (`comment-send.mjs`). */
interface Sessions {
  /** dsh's catalog: which session the main view retains is the conversation on screen (`mainSessionOf`). */
  list: {
    getSnapshot(): { byId: Record<string, { retainedBy?: Partial<Record<string, number>> } | undefined> }
    subscribe(listener: () => void): () => void
  }
  binding(id: string):
    | {
        session: {
          getSnapshot(): { running?: boolean; subagent?: unknown; removed?: boolean }
          /** dsh's Stop (`ui-conversation` service `cancel`): ends the running turn; saved work stays. */
          cancel?(): Promise<{ ok: boolean }>
        }
        /**
         * The session's event window — the voice hint reads its opening message (`voice-language.mjs`),
         * a voice conversation follows its turns (`voice-mode.mjs`).
         */
        eventSource?: {
          getSnapshot(): { entries?: readonly unknown[]; change?: unknown }
          subscribe(listener: () => void): () => void
        }
      }
    | undefined
}

/**
 * The slice of ui-conversation's service the comment listener calls: the session verb, never the
 * composer — and, for a send with files (`tracy:comment-send` v4), the draft verbs dsh's own composer
 * uses (`createDrafts`, `fileUploads`, `releaseDraftAttachments`).
 */
interface Conversation {
  sendSession(
    session: unknown,
    text: string,
    attachments: readonly string[],
    mode: 'queue' | 'steer'
  ): Promise<{ kind: string }>
  createDrafts(sessionId: string, files: readonly File[]): readonly { id: string; kind: string }[]
  fileUploads: {
    getSnapshot(): Record<string, { status: string }>
    subscribe(fn: () => void): () => void
  }
  releaseDraftAttachments(drafts: readonly { id: string; kind: string }[]): void
}

interface ClientContext {
  /** cordis's probe, for services read without injecting them (`sidebarRightOf`). */
  get?: (name: string) => unknown
  effect(fn: () => (() => void) | void, label?: string): void
  betterSidebar: BetterSidebar
  sessions: Sessions
  conversation: Conversation
  chatLocal: ChatLocal
  /** dsh's root conversation service: its user-text folds, view definitions and session bindings. */
  uiConversation: {
    userTextFolds?: Parameters<typeof registerCommentFold>[0]
    /** Target view definitions (the Comments view's, so comments open a blank conversation). */
    views?: { register(definition: ReturnType<typeof commentsViewDefinition>): () => void }
    /** One session's conversation assembly; only `activate` is called here. */
    binding?(sessionId: string): { activate(target: string): void }
  }
  slots: {
    inject(name: string, register: () => unknown): void
    register(spec: Record<string, unknown>, component: unknown): () => void
  }
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
    bind(namespace: string): Translate
    /** The interface language changed (dsh-client-locale); absent on an older host. */
    subscribe?(listener: () => void): () => void
  }
}

// `chatLocal` (ui-chat, the transcript this dock sits under): the start screen reads Help's rows from it.
export const inject = [
  'slots',
  'locale',
  'betterSidebar',
  'sessions',
  'conversation',
  'uiConversation',
  'chatLocal'
]

/** The site this page is the workspace of, from `<base href="/<siteKey>/">`; null on `/new/`. */
function pageSiteKey(): string | null {
  try {
    return siteKeyFromPath(new URL(document.baseURI).pathname)
  } catch {
    return null
  }
}

/** The tabs the three cards open. Named by the plugins that register them (`@tracy/dsh-add-site`, `@tracy/dsh-design-inspiration`). */
const ADD_SITE_TAB = 'tracy:add-site'
const DESIGN_TAB = 'tracy:design-inspiration'
/** The tabs a site's start cards open: the side card's Browser tab, and `@tracy/dsh-site-tabs`' two. */
const BROWSER_TAB = 'tracy:browser'
const CHANGES_TAB = 'tracy:changes'
const TEAM_TAB = 'tracy:team'

/** An `/api/sites` row, as far as the Edit card reads it. */
interface SiteRow {
  siteKey: string
  aliases?: string[]
  copyUrl?: string | null
}

/**
 * Press the tab to go back to whenever the selected conversation view is one an operator hid.
 * @returns the disposer.
 */
function followHiddenViews(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const ui = uiSwitches()
  const check = () => {
    const tabs = [
      ...document.querySelectorAll<HTMLElement>('[data-conversation-tabs] [role="tab"][data-view]')
    ]
    const target = viewToLeaveFor(
      tabs.map((tab) => ({
        view: tab.dataset.view ?? '',
        selected: tab.getAttribute('aria-selected') === 'true'
      })),
      (id) => ui.isShown(id)
    )
    if (target !== null) tabs.find((tab) => tab.dataset.view === target)?.click()
  }
  const observer = new MutationObserver(check)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected']
  })
  const offUi = ui.subscribe(check)
  check()
  return () => {
    observer.disconnect()
    offUi()
  }
}

export function apply(ctx: ClientContext): void {
  let startNativeWidgetVoice: ((sessionId: string) => void) | undefined
  if (
    document.querySelector('meta[name="tracy-widget-native"]') ||
    /\/s\/session-widget-/.test(globalThis.location?.pathname ?? '')
  )
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register(
        { name: 'conversation.input.dock', id: 'tracy-widget-import', order: 5, locale: NS },
        (props: Omit<Parameters<typeof NativeWidgetContext>[0], 't'>) => (
          <NativeWidgetContext
            {...props}
            t={ctx.locale.bind(NS)}
            startVoice={(id) => startNativeWidgetVoice?.(id)}
          />
        )
      )
    )
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-view="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyView = '1'
    el.textContent = CSS + COMPOSER_CSS + MODEL_MENU_CSS + COLUMN_CSS + VOICE_CSS + VOICE_MODE_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-view: styles')
  ctx.effect(() => watchShell(), 'tracy-view: shell trim')
  ctx.effect(() => keepModelMenuFocus(), 'tracy-view: model menu keeps focus')
  // A view tab an operator hid (/ops › User Interface › DSH) must not keep a customer on it: dsh
  // remembers the last view per session. Watch the tab strip and press the view to go back to.
  ctx.effect(() => followHiddenViews(), 'tracy-view: leave a hidden conversation view')
  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-view: dictionaries')
  const onboarding = isOnboarding()
  // The scope on <html> keeps creation-home layout separate from real-site layout. The
  // assistant owns its Help-only bar here; styles.ts keeps a native no-site fallback hidden.
  ctx.effect(() => {
    if (!onboarding) return
    document.documentElement.setAttribute(SCOPE_ATTR, 'onboarding')
    return () => document.documentElement.removeAttribute(SCOPE_ATTR)
  }, 'tracy-view: scope')
  const sidebar = ctx.betterSidebar
  const right = () => sidebarRightOf(ctx)
  ctx.effect(() => {
    if (!onboarding) return
    const onStart = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          action?: unknown
          question?: unknown
          platform?: unknown
          chatDraft?: unknown
        }>
      ).detail
      const action = detail?.action
      // Build from my business only while its switch is on, as its card on the start screen.
      const business = action === 'business' && uiSwitches().isShown('site-from-business')
      if (action !== 'create' && action !== 'templates' && action !== 'import' && !business) return
      const type = action === 'templates' ? DESIGN_TAB : ADD_SITE_TAB
      if (
        !uiSwitches().tabPolicy().isAllowed(type) ||
        !sidebar.getTab(type) ||
        sidebar.getTab(type)?.hidden === true
      )
        return
      openOnboardingStart(
        sidebar,
        right(),
        action,
        typeof detail.question === 'string' ? detail.question : '',
        startPlatformOf(detail.platform),
        detail.chatDraft
      )
    }
    window.addEventListener(ONBOARDING_START_EVENT, onStart)
    return () => window.removeEventListener(ONBOARDING_START_EVENT, onStart)
  }, 'tracy-view: Help start actions')
  const siteKey = onboarding ? null : pageSiteKey()
  // The seat's role on this site (ADR 0028), read from `/api/sites` like the site tabs' picker: a
  // Viewer gets the read-only start screen, and no Undo on the turn card or the preview toolbar.
  // `asked` is filled from the same read: a request already waiting starts the Viewer bar as sent.
  // Read again live (#1036) when the page's "book changed" event arrives (the Inbox's poll sees the
  // approval or role change the server wrote for this person) or the page comes back into sight
  // (`watchRoleSignals`); every reader below subscribes, so the whole screen follows, no reload.
  const asked = createAskedSites()
  const seatRole =
    siteKey !== null && /^https?:$/.test(globalThis.location?.protocol ?? '')
      ? createSeatRole({ siteKey, read: readSites, asked })
      : NO_ROLE
  ctx.effect(() => () => seatRole.stop(), 'tracy-view: seat role')
  ctx.effect(() => {
    if (seatRole === NO_ROLE) return
    return watchRoleSignals({
      refresh: () => seatRole.refresh(),
      event: TEAM_CHANGED_EVENT,
      target: window,
      doc: document
    })
  }, 'tracy-view: seat role follows role changes')
  // "You can now edit this site.": once, above the chat box, when this Viewer is made an Editor.
  const promoted = createPromotedNotice({
    seatRole,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number)
  })
  ctx.effect(() => () => promoted.stop(), 'tracy-view: promoted notice')
  // A Viewer's chat box asks about the site: the hint after dsh's own ("/help to ask Tracy · ") is
  // ours on their start screen and through the whole session. composer-styles.ts reads it under
  // [data-tracy-viewer] on the start block and under VIEWER_SEAT_ATTR on <html> everywhere else (the
  // docked chat box after the first message has no start block to carry the mark).
  ctx.effect(() => {
    const root = document.documentElement
    const tHint = ctx.locale.bind(NS)
    const sync = () =>
      root.style.setProperty(
        '--tc-viewer-hint',
        JSON.stringify(fallback(tHint, 'start.site.placeholderViewer'))
      )
    sync()
    const off = ctx.locale.subscribe?.(sync)
    const offSeat = mirrorViewerAttr(root, seatRole, VIEWER_SEAT_ATTR)
    return () => {
      off?.()
      offSeat()
      root.style.removeProperty('--tc-viewer-hint')
    }
  }, 'tracy-view: viewer composer hint')
  // The site's unseen-changes count, one store for the page: the start card draws it, and the right
  // column's Site changes tab is told it (`tracy:changes-unseen`) — one number, one meaning.
  ctx.effect(() => {
    if (siteKey === null) return
    const store = createChangesCount({ siteKey, read: () => readUnseenChanges(siteKey) })
    pageChanges = { siteKey, store }
    const stopTelling = tellChangesCount({ store, siteKey, target: window })
    return () => {
      stopTelling()
      store.stop()
      if (pageChanges?.store === store) pageChanges = null
    }
  }, 'tracy-view: unseen changes count to the right column')
  // The Comments view's state, shared by the view, its composer, the badge and the Comments start card.
  // On a site's workspace it reads the site's comments from the server too, so the tab and its count are
  // right while no Browser tab lists them (`comment-server.mjs`). Only a served page has the door.
  const served = /^https?:$/.test(globalThis.location?.protocol ?? '')
  // Layout B (Akemi 01/10/2026): the tab takes the site's preview to a page ("Open page") and into Edit
  // mode ("Start commenting") the way the start card's Edit does — `openTab` on the Browser tab type
  // navigates the one already open (`browserTargetOf`, `?mode=edit`).
  const openBrowser = (page: string, mode: 'edit' | null, address?: string) => {
    if (!sidebar || siteKey === null) return
    const go = (site: string | null | undefined) => {
      const url = browserTargetOf(site, { page, mode })
      if (url !== null) sidebar.openTab({ type: BROWSER_TAB, url })
    }
    if (address !== undefined) return go(address)
    void readSites().then(({ status, body }) => {
      if (status < 200 || status >= 300) return
      const rows = (body as { sites?: SiteRow[] } | null)?.sites ?? []
      go(rows.find((r) => r.siteKey === siteKey || (r.aliases ?? []).includes(siteKey))?.copyUrl)
    })
  }
  const pathOf = (url: string): string => {
    try {
      return new URL(url).pathname || '/'
    } catch {
      return '/'
    }
  }
  const comments = createCommentsState({
    ...(siteKey !== null && served
      ? { server: { siteKey, fetch: (input, init) => globalThis.fetch(input, init) } }
      : {}),
    openPage: (url) => openBrowser(pathOf(url), null, url),
    startCommenting: () => {
      // The page the preview shows, in Edit mode; with no preview open, the site's home page.
      const shown = shownTab(comments.lists.getSnapshot())
      if (shown !== null && shown.url !== '') openBrowser(pathOf(shown.url), 'edit', shown.url)
      else openBrowser('/', 'edit')
    }
  })
  const sessionOnScreen = () => mainSessionOf(ctx.sessions.list.getSnapshot())
  const chatLocal = ctx.chatLocal
  type Own =
    | 'onboarding'
    | 'sidebar'
    | 'right'
    | 'siteKey'
    | 'comments'
    | 'sessionOnScreen'
    | 'chatLocal'
    | 'seatRole'
    | 'asked'
  const Occupant = (props: Omit<DockProps, Own>): JSX.Element | null =>
    Dock({
      ...props,
      onboarding,
      sidebar,
      right,
      siteKey,
      comments,
      sessionOnScreen,
      chatLocal,
      seatRole,
      asked
    })
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-start', order: 10, locale: NS },
      Occupant
    )
  )
  // What a running turn waits on, when it waits long enough to look stuck (#1403 item 10): another
  // conversation's write, the previous request's changes being saved, the page being looked at.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-chat-wait', order: 15, locale: NS },
      ChatWaitLine
    )
  )
  // While a Tracy update holds this conversation's message, and after it if the message did not run
  // (#517): one line in the same dock as the queue. On every workspace, a site's and `/new/` alike —
  // a deploy holds messages wherever they are sent.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-held', order: 20, locale: NS },
      DeployHoldNotice
    )
  )
  // A Viewer's bar right above the chat box through the whole session (ADR 0028): last in the dock,
  // so nearest the input. On the start screen the start block draws its own bar in the hero layout,
  // and styles.ts hides this one while that block is on screen, so one bar shows at a time. The same
  // occupant draws the short "You can now edit this site." line once an Owner made the seat an
  // Editor (`SeatBar.tsx`, #1036).
  const SessionViewerBar = ({
    t,
    input
  }: {
    t?: Translate
    input?: { sent?: number }
  }): JSX.Element | null => (
    <SeatBar siteKey={siteKey} t={t} asked={asked} seatRole={seatRole} notice={promoted} input={input} />
  )
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-viewer', order: 30, locale: NS },
      SessionViewerBar
    )
  )
  // A voice conversation (VoiceMode.tsx, voice-mode.mjs): one per page, for the conversation on screen.
  // The words go to the chat by dsh's session verb (`sendToChat`), steered into the work while Tracy
  // works, or answer the question card waiting (`pendingQuestion`); the turns are read from the
  // session's own event window; Tracy's replies are read out by tracy-web (`POST /api/speech/say`),
  // which holds the key and every limit.
  let speech: SpeechFacts | null = null
  const speechListeners = new Set<(facts: SpeechFacts | null) => void>()
  const publishSpeech = (answer: SpeechFacts | null) => {
    speech = answer
    for (const listener of speechListeners) listener(answer)
  }
  void speechFacts().then((answer) => {
    publishSpeech(answer)
  })
  const tVoiceMode = ctx.locale.bind(NS)
  const uiLanguage = () => (interfaceLocale() ?? 'en').split('-')[0].toLowerCase()
  // The microphone dictation and Voice listen on, picked in the Chat/Voice menu (`voice-mic.mjs`,
  // council 19/10/2026); its list is read again when devices change, and after the microphone opens.
  const micPicker = createMicPicker({
    mediaDevices: globalThis.navigator?.mediaDevices,
    storage: pageStorage()
  })
  // The visitor widget's page has no door for the trace (`/widget/backend` takes only the reading).
  const inWidget = () => {
    const path = globalThis.location?.pathname ?? ''
    return path === '/widget/native' || path.startsWith('/widget/native/')
  }
  const voiceMode = createVoiceMode({
    openMic: async (onFrame, onLevel, onLost) => {
      const mic = await openMicrophone(onFrame, onLevel, onLost, { deviceId: micPicker.current() })
      // Allowed now: the browser names its microphones, and the menu can list them.
      void micPicker.refresh()
      return mic
    },
    // How long each voice turn took, as the page heard it: spans only (`voice-trace.mjs`).
    trace: (record) => {
      if (!inWidget()) sendTrace(record)
    },
    openLink: (handlers, options) =>
      openSpeechLink(
        {
          ...handlers,
          onReady: (facts) => {
            if (speech && facts?.voices)
              publishSpeech({
                ...speech,
                voices: facts.voices,
                revision: facts.revision ?? speech.revision,
                sessionToken: facts.sessionToken,
                capabilities: facts.capabilities,
                actualProvider: facts.actualProvider ?? facts.provider,
                provider: facts.primaryProvider ?? speech.provider,
                transcriptWaitMs: facts.transcriptWaitMs ?? speech.transcriptWaitMs,
                speak: facts.speak
              })
            handlers.onReady?.(facts)
          }
        },
        options
      ),
    socketUrl: (sessionId) =>
      speechSocketUrl(globalThis.location, voiceHint(ctx.sessions, sessionId), true, pageSite()),
    // The host is told the words first and answers (`tellSpoken`): the step that takes this message
    // replies to be heard; a message typed anywhere else never does.
    send: async (sessionId, text, mode) => {
      await tellSpoken(
        (body, signal) =>
          fetch(dshUrl('/api/tracy-site-tools/view'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal
          }),
        sessionId,
        text
      )
      return sendToChat(sessionId, (sid) => ctx.sessions.binding(sid)?.session, ctx.conversation, text, mode)
    },
    question: (sessionId) => pendingQuestion(ctx, sessionId),
    planReview: (sessionId) => pendingPlanReview(ctx, sessionId),
    // A plan read out for an approval by voice, only while the operator has it on (off by default).
    plan: (sessionId) => pendingPlan(ctx, sessionId),
    planApproval: () => uiSwitches().isShown(PLAN_BY_VOICE_SWITCH),
    // A plan to review: the chat, where its card is (`modeActions.chat` ends the voice).
    showChat: (sessionId) => modeActions.chat(sessionId),
    // Voice's footer replaces the chat box and its Stop: the same verb stops the work from there.
    cancel: async (sessionId) => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (typeof session?.cancel !== 'function') return false
      return (await session.cancel())?.ok === true
    },
    warm: () => speech?.capabilities?.tts?.prewarm ?? true,
    onRestartRequired: () => {
      void speechFacts(true).then(publishSpeech)
    },
    events: (sessionId) => ctx.sessions.binding(sessionId)?.eventSource,
    speak: (text, { voice, language, signal }) =>
      fetch(speechHttpPath('/api/speech/say'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          voice,
          language,
          revision: speech?.revision,
          sessionToken: speech?.sessionToken
        }),
        signal
      }),
    openPlayer,
    languageOf: (text, sessionId) =>
      messageLanguage(text) || chatMainLanguage(ctx.sessions, sessionId) || uiLanguage(),
    uiLanguage,
    phrase: (key, params) => tVoiceMode(key as Parameters<Translate>[0], params),
    claim: claimVoice,
    limits: () => ({
      maxChars: speech?.speak?.maxChars ?? 600,
      sampleRate: speech?.speak?.sampleRate ?? 24_000,
      silenceSeconds: speech?.silenceSeconds ?? 30,
      transcriptWaitMs: speech?.transcriptWaitMs ?? 6000,
      cacheKey: `${speech?.revision ?? ''}:${speech?.actualProvider ?? speech?.provider ?? ''}`,
      voices: speech?.voices ?? []
    }),
    readVoice: () => {
      try {
        return globalThis.localStorage?.getItem(VOICE_PICK_KEY) ?? null
      } catch {
        return null
      }
    },
    writeVoice: (id) => {
      try {
        globalThis.localStorage?.setItem(VOICE_PICK_KEY, id)
      } catch {
        // A browser that keeps nothing: the default voice next time.
      }
    }
  })
  ctx.effect(() => () => voiceMode.end(), 'tracy-view: voice conversation ends with the page')
  // A microphone picked while Voice listens: its capture restarts once, on that one.
  ctx.effect(() => {
    let picked = micPicker.current()
    return micPicker.subscribe(() => {
      if (micPicker.current() === picked) return
      picked = micPicker.current()
      voiceMode.switchMic()
    })
  }, 'tracy-view: a microphone picked restarts Voice on it')
  // A hidden page pauses it: no microphone listening in a tab nobody looks at.
  ctx.effect(() => {
    const onHidden = () => {
      if (document.hidden) voiceMode.hidden()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, 'tracy-view: voice conversation pauses when hidden')
  // Another conversation on screen, or the operator turning voice off, ends it.
  ctx.effect(() => {
    const ui = uiSwitches()
    const check = () => {
      const now = voiceMode.getSnapshot()
      if (now.phase === 'off') return
      if (!ui.isShown(VOICE_SWITCH) || mainSessionOf(ctx.sessions.list.getSnapshot()) !== now.sessionId)
        voiceMode.end()
    }
    const offList = ctx.sessions.list.subscribe(check)
    const offUi = ui.subscribe(check)
    return () => {
      offList()
      offUi()
    }
  }, 'tracy-view: voice conversation follows the conversation on screen')
  /** Whether this page offers a voice conversation, and the voices it may speak in. */
  const useVoiceMode = (): { usable: boolean; voices: readonly { id: string; name: string }[] } => {
    const ui = uiSwitches()
    // The voice switch of /ops › Agents › Voice, the one the microphone follows (David 16/10/2026).
    const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown(VOICE_SWITCH))
    const [facts, setFacts] = useState<SpeechFacts | null>(speech)
    useEffect(() => {
      let live = true
      const update = (answer: SpeechFacts | null) => {
        if (live) setFacts(answer)
      }
      speechListeners.add(update)
      void speechFacts().then(publishSpeech)
      const timer = setInterval(() => {
        if (voiceMode.getSnapshot().phase === 'off') void speechFacts(true).then(publishSpeech)
      }, 10_000)
      return () => {
        live = false
        speechListeners.delete(update)
        clearInterval(timer)
      }
    }, [])
    const usable =
      shown && facts?.available === true && facts.speak !== undefined && globalThis.isSecureContext !== false
    return { usable, voices: facts?.voices ?? [] }
  }
  // CHAT OR VOICE, per conversation (David 16/10/2026, ChatGPT's app; VoiceMode.tsx): the voice view is a
  // dsh view of its own whose tab is never drawn, chosen by pressing that tab (`voice-mode-view.mjs`).
  // Into Voice from the header's mode menu or the audio wave in the chat box, inside the press; back to
  // Chat from the menu, the footer's X, or any other tab — leaving the view ends the voice.
  const voiceShown = shownSessions()
  const voiceWanted = flag(false)
  const nextFrame = (fn: () => void) => {
    requestAnimationFrame(fn)
  }
  const modeActions: ModeActions = {
    voice(sessionId) {
      if (speech) publishSpeech({ ...speech, sessionToken: undefined })
      voiceMode.start(sessionId)
      voiceWanted.set(true)
      ctx.uiConversation.binding?.(sessionId).activate(VOICE_VIEW)
      pressViewTab(() => viewTab(document, VOICE_VIEW), nextFrame)
    },
    chat() {
      voiceMode.end()
      pressViewTab(() => viewTab(document, CHAT_VIEW), nextFrame)
      // A new chat left as it was gets its start screen back.
      voiceWanted.set(false)
    }
  }
  startNativeWidgetVoice = (id) => {
    if (
      uiSwitches().isShown(VOICE_SWITCH) &&
      speech?.available &&
      speech.speak &&
      globalThis.isSecureContext !== false
    )
      modeActions.voice(id)
  }
  const markVoiceShown = (sessionId: string, on: boolean) => voiceShown.mark(sessionId, on)
  const tMode = ctx.locale.bind(NS)
  const SessionVoiceView = (props: { sessionId?: string; t?: Translate }): JSX.Element => (
    <VoiceModeView
      sessionId={props.sessionId}
      t={props.t}
      mode={voiceMode}
      actions={modeActions}
      shown={markVoiceShown}
    />
  )
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: VOICE_VIEW,
        // Right after Chat; its tab is never drawn (voice-styles.ts): the mode menu chooses it.
        order: 1,
        locale: NS,
        label: () => tMode('voiceMode.mode.voice')
      },
      SessionVoiceView
    )
  )
  // A new chat shows no view and no tab strip until a view definition says it is active (as the
  // Comments view does, `commentsViewDefinition`): Voice says so while a person asked for it.
  ctx.effect(() => {
    const define = () =>
      ctx.uiConversation.views?.register(commentsViewDefinition(VOICE_VIEW, () => voiceWanted.get()))
    let dispose = define()
    const stop = voiceWanted.subscribe(() => {
      dispose?.()
      dispose = define()
    })
    return () => {
      stop()
      dispose?.()
    }
  }, 'tracy-view: Voice opens a new chat on request')
  // While the voice view is on screen, its footer takes the chat box's place (mute, back to Chat): no
  // typing in Voice. The same chain the Comments view's row uses, registered again whenever the set of
  // sessions showing the view changes; a pending question card or approval still wins.
  const SessionVoiceFooter = (props: { sessionId?: string; t?: Translate }): JSX.Element | null => (
    <VoiceModeFooter sessionId={props.sessionId} t={props.t} mode={voiceMode} actions={modeActions} />
  )
  ctx.slots.inject('conversation.composer', () => {
    let dispose: (() => void) | null = null
    const sync = () => {
      dispose?.()
      dispose = null
      const open = voiceShown.get()
      if (open.size === 0) return
      dispose = ctx.slots.register(
        {
          name: 'conversation.composer',
          priority: 9,
          locale: NS,
          select: ({
            sessionId,
            pendingInteraction
          }: {
            sessionId?: string
            pendingInteraction?: unknown
          }) =>
            sessionId !== undefined && open.has(sessionId) && pendingInteraction === undefined ? {} : null
        },
        SessionVoiceFooter
      )
    }
    sync()
    const stop = voiceShown.subscribe(sync)
    return () => {
      stop()
      dispose?.()
    }
  })
  const SessionModeMenu = (props: { sessionId?: string; t?: Translate }): JSX.Element | null => {
    const { usable, voices } = useVoiceMode()
    const inVoice = useSyncExternalStore(voiceShown.subscribe, () =>
      props.sessionId === undefined ? false : voiceShown.has(props.sessionId)
    )
    const viewer = useSyncExternalStore(seatRole.subscribe, () => isViewerRole(seatRole.getSnapshot()))
    return (
      <ModeMenu
        sessionId={props.sessionId}
        t={props.t}
        mode={voiceMode}
        usable={usable}
        inVoice={inVoice}
        voices={voices}
        actions={modeActions}
        micPicker={micPicker}
        // The note introducing Voice, under this button once the chat has a header (a new chat's is
        // over the chat box, `SessionVoiceTip`); the same seats, and one note per browser for both.
        tip={!onboarding && siteKey !== null && !viewer}
      />
    )
  }
  // The note introducing Voice (VoiceMode.tsx `VoiceTip`): over the chat box of a site's start screen
  // — a site just made, or a new chat in it, which has no header yet — for a seat that may talk to
  // Tracy; under the header's Chat/Voice button in a chat that has one (`SessionModeMenu`). It shows
  // once per account, in whichever place comes first (`VoiceTip`).
  const SessionVoiceTip = (props: { session?: { blank?: boolean }; t?: Translate }): JSX.Element | null => {
    const { usable } = useVoiceMode()
    const viewer = useSyncExternalStore(seatRole.subscribe, () => isViewerRole(seatRole.getSnapshot()))
    const shown = usable && !onboarding && siteKey !== null && props.session?.blank === true && !viewer
    return <VoiceTip t={props.t} shown={shown} />
  }
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-voice-tip', order: 35, locale: NS },
      SessionVoiceTip
    )
  )
  // Left of the session's "…" menu: the utilities slot lays its cells out in ascending order.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'tracy-voice-mode', order: -20, locale: NS },
      SessionModeMenu
    )
  )
  // Voice input (VoiceInput.tsx): the microphone between the model chip and Send, live words into the
  // draft. A single slot: dsh's own voice plugin (recognition after the recording, not live) is in no
  // Tracy bundle; -1 keeps this one first should it ever be. The operator's switch is read here, the
  // deployment's speech key by the component (`GET /api/speech`).
  // The slot renders only this registration, even while the microphone draws nothing, so the other
  // Tracy pieces of the seat (Help's stop, #1379) come through `@tracy/core/input-activity` and are
  // drawn here, after the microphone and next to Send. One flex row holds both: while recording, dsh
  // lays the seat out as a plain block (`.activityExpanded`), which would stack them.
  // The audio wave beside the microphone goes into Voice (VoiceMode.tsx), as in ChatGPT's chat box.
  const SessionVoice = (props: Omit<VoiceInputProps, 'shown'>): JSX.Element | null => {
    const ui = uiSwitches()
    const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown(VOICE_SWITCH))
    const { usable } = useVoiceMode()
    // While dictating, the dictation row has the seat: the audio wave steps aside.
    const [dictating, setDictating] = useState(false)
    const { onActiveChange } = props
    const onDictation = useMemo(
      () => (active: boolean) => {
        setDictating(active)
        onActiveChange?.(active)
      },
      [onActiveChange]
    )
    return (
      <div className="tv-voice-seat">
        <VoiceInput
          {...props}
          onActiveChange={onDictation}
          shown={shown}
          mainLanguage={() => voiceHint(ctx.sessions, props.sessionId)}
        />
        {!dictating && (
          <VoiceModeStart
            sessionId={props.sessionId}
            t={props.t}
            usable={usable}
            locked={props.locked}
            actions={modeActions}
          />
        )}
        <ActivityPieces sessionId={props.sessionId} />
      </div>
    )
  }
  ctx.slots.inject('conversation.input.activity', () =>
    ctx.slots.register({ name: 'conversation.input.activity', priority: -1, locale: NS }, SessionVoice)
  )
  // The same microphone in the Browser tab's comment popover and thread card (David 15/10/2026, "flow
  // y chang"): published for the fork, which draws it with its text area adapted to the slot's props
  // (`voice-bridge.mjs`). A comment belongs to no conversation, so the hint is the interface's
  // language (council 15/10/2026), never the chat's; the words follow the interface language.
  const tVoice = ctx.locale.bind(NS)
  const subscribeLocale = (listener: () => void) => ctx.locale.subscribe?.(listener) ?? (() => undefined)
  const BoxVoice = (
    props: Omit<VoiceInputProps, 'shown' | 't' | 'mainLanguage' | 'sessionId'>
  ): JSX.Element | null => {
    const ui = uiSwitches()
    const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown(VOICE_SWITCH))
    useSyncExternalStore(subscribeLocale, () => document.documentElement.lang)
    return (
      <VoiceInput {...props} shown={shown} t={tVoice} mainLanguage={() => voiceHint(undefined, undefined)} />
    )
  }
  ctx.effect(() => publishVoiceInput(BoxVoice), 'tracy-view: voice for comment boxes')
  // The draft's attachments as compact chips (ComposerChips.tsx), in place of dsh's thumbnail rail.
  // A single slot: dsh's ui-attachment occupies it at priority 0, and the lowest priority renders,
  // so -1 shadows it whichever plugin registers first. The locale is dsh's `conversation`
  // namespace, so the chips reuse dsh's own labels (remove, retry, drop invitation).
  ctx.slots.inject('conversation.input.attachments', () =>
    ctx.slots.register(
      { name: 'conversation.input.attachments', priority: -1, locale: 'conversation' },
      ComposerChips
    )
  )
  // A comment from the Browser tab becomes one chat turn (`comment-send.mjs`). Registered here,
  // once per page, and not in the Dock: the Dock is per session and draws nothing on a site's
  // workspace, and two listeners would send one comment twice.
  // Since stage 6 every send (v3) brings its own thread and author, so the lists are not asked.
  // The conversation on screen, followed live (SEND-v4-new-1, e2e v4): a conversation left in this page
  // keeps its Browser view mounted and listing, so the Comments tab and every act it dispatches name a
  // Browser tab of the conversation dsh's main view shows now — never a background one.
  ctx.effect(() => {
    // null: nothing read yet, so the first sync reads whatever is on screen (undefined included).
    let shown: string | undefined | null = null
    const sync = () => {
      const next = mainSessionOf(ctx.sessions.list.getSnapshot())
      comments.lists.focus(next)
      // Another conversation on screen may have no Browser tab: read the server's list afresh for it.
      if (next !== shown) {
        shown = next
        void comments.reload()
      }
    }
    sync()
    return ctx.sessions.list.subscribe(sync)
  }, 'tracy-view: comments follow the conversation on screen')
  // Back on this page after a while away: others may have commented meanwhile.
  ctx.effect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') void comments.reload()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, 'tracy-view: comments read again when the page is shown')
  // Who is signed in (round 3): words typed in a thread card go to Tracy under the sender's name.
  // `/auth/me` is the host's own root door (root-absolute on purpose, `dsh-url.ts`), asked once; where
  // it does not answer, `senderOf` falls back to the author of a comment the viewer may edit.
  let viewerEmail: string | null = null
  // Only a served page has the door (a file:// render harness has none, and would log a failed fetch).
  if (/^https?:$/.test(globalThis.location?.protocol ?? ''))
    void fetch('/auth/me', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const email = (body as { email?: unknown } | null)?.email
        if (typeof email === 'string' && email.trim() !== '') {
          viewerEmail = email
          // UI fine-tune 30/09 (U12): the Comments tab's filter this person last chose on this browser.
          comments.setViewer(email)
        }
      })
      .catch(() => {
        // No answer: the fallback stands.
      })
  ctx.effect(
    () =>
      listenForComments({
        target: window,
        sessions: ctx.sessions,
        conversation: ctx.conversation,
        siteKey: pageSiteKey,
        sender: () => senderOf(comments.lists.getSnapshot(), viewerEmail),
        storedText: (id) => storedTextOf(comments.lists.getSnapshot(), id),
        // Stage 6, rule 5: after any Send to Tracy the column shows the chat it went to.
        showChat: () =>
          openChatView({
            findTab: (view) =>
              document.querySelector<HTMLElement>(
                `[data-conversation-tabs] [role="tab"][data-view="${view}"]`
              ),
            frame: (fn) => {
              requestAnimationFrame(fn)
            }
          })
      }),
    'tracy-view: comment turns'
  )
  // How a turn is going, for the Browser tab's Refresh button (stage 6, contract H2): working when it
  // starts, site-changed on each write that went through, turn-end — read from the conversation on
  // screen's own event stream (`comment-status.mjs`). Every turn of a conversation standing in this
  // page's site counts, a turn typed in the chat as much as a Send to Tracy (fix/refresh-chat-turns).
  ctx.effect(
    () =>
      watchTurnProgress({
        sessions: ctx.sessions,
        target: window,
        siteKey: pageSiteKey,
        // S12 (e2e v4): a conversation dsh just created has no `cwd` on its row yet; its Browser tab
        // says which site it shows.
        tabSite: (id) =>
          [...comments.lists.getSnapshot().tabs.values()].find((tab) => tab.sessionId === id)?.siteKey ?? null
      }),
    'tracy-view: comment turn progress'
  )
  // "Tracy working…" on the Comments list (redesign A): the comments a turn sent from this page works
  // on now, from the same progress events (`comment-working.mjs`; only what this page sees).
  ctx.effect(() => {
    const watch = watchWorkingComments({
      target: window,
      sentTurns,
      onChange: (ids) => comments.lists.setWorking(ids)
    })
    return () => watch.stop()
  }, 'tracy-view: comments Tracy works on')
  // Such a turn is drawn with its element chip wherever dsh draws user text — the durable row,
  // steering, the echo between Send and the durable message, the queue strip — through dsh's
  // fenced-block fold registry (`uiConversation.userTextFolds`, dsh 0.1.7-rc.2-tracy.6). ONE
  // drawing for every surface, on purpose: until 28/09 the durable row had its own chip, drawn
  // ABOVE the bubble by a `conversation.chat.node` entry wrapping ui-chat's view, while the echo
  // folded the block INSIDE the bubble under the sentence — 64px echo, 70px durable, and the chip
  // jumped when the durable message replaced the echo (tasks/evidence/comment-row-identical/).
  // Now both rows are ui-chat's same bubble with the same projected text, so nothing moves. Do not
  // bring a chat.node wrapper back for this. The registration is owned by this plugin's context
  // (a Cordis effect inside the registry).
  // Stage 6 (story ChatMessageFromPage): a chip names its AUTHOR — their bubble, in their colour
  // (`chipColor`: the colour the turn carries for their account, `author-color`; on an older turn the
  // Comments tab's colour for that name, round 2 e2e L3), then the element's icon and quote; no number and no status,
  // since the number is the request's and means nothing to people. A turn sent before stage 6 names
  // nobody: its chips draw the pointer (or the page's globe) and no number badge.
  // A chip whose block carries a thread (a send from a thread card, acceptance F6) draws its words and
  // the thread under them itself (`ChatThread.tsx`; registerCommentFold hands it an empty label).
  const tChat = ctx.locale.bind(NS)
  registerCommentFold(
    ctx.uiConversation.userTextFolds,
    (
      _n?: number,
      _hasWords?: boolean,
      kind?: string,
      author?: { name: string; color?: string },
      threaded?: { thread: { who: string; text: string }[]; label: string }
    ) => {
      const Icon = kind === 'page' ? Globe : MousePointerClick
      const glyph = <Icon className="tv-comment-chip-icon" aria-hidden="true" />
      const face =
        author === undefined ? (
          glyph
        ) : (
          <>
            <span
              className="tv-comment-chip-author"
              style={{ background: chipColor(comments.lists.getSnapshot(), author.name, author.color) }}
            >
              {addressFace(author.name).initial}
            </span>
            {glyph}
          </>
        )
      if (threaded === undefined) return face
      return <ChatThread face={face} label={threaded.label} thread={threaded.thread} t={tChat} />
    },
    // An image chip names its kind first, as the Comments tab row does: `Image · "<alt>"`.
    { image: () => tChat('comments.image') }
  )
  // The Comments view (plan "comment review", H5): a tab beside Chat, the way dsh shows Trajectory,
  // listing the Browser tab's comments from its `tracy:comment-list` events. The label is a thunk,
  // so it follows the language; the count rides the tab as an attribute (`watchCommentsBadge`),
  // because dsh re-reads a view's label only when a view registers or the language changes.
  const tComments = ctx.locale.bind(NS)
  ctx.effect(() => listenForCommentLists(comments.lists), 'tracy-view: comment lists')
  // Clear all · Undo: a clear still in its window goes out as the page hides or unloads.
  ctx.effect(() => commitClearOnLeave(comments.clearing), 'tracy-view: clear on leave')
  // A Resolve waiting out its "Resolved. Undo" line is sent as the page hides or unloads (U33).
  ctx.effect(() => commitClearOnLeave(comments.resolving), 'tracy-view: resolve on leave')
  ctx.effect(
    () => watchCommentsBadge(comments, () => tComments('comments.tab'), tComments),
    'tracy-view: comments badge'
  )
  // The Browser toolbar's "Comments N" shows the same badge (open count, unread dot); only this page
  // holds the read marks, so it says both numbers (`comment-unread.mjs`) and the fork draws them.
  ctx.effect(
    () => tellUnreadCount({ lists: comments.lists, target: window }),
    'tracy-view: unread count to the Browser tab'
  )
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: COMMENTS_VIEW,
        // After Chat (0), before Trajectory (10, developer tools only).
        order: 5,
        locale: NS,
        label: () => tComments('comments.tab')
      },
      makeCommentsView(comments)
    )
  )
  // The Comments view in a session with no message yet (start screen Case 2, `comments-wanted.mjs`):
  // dsh shows no view and no tab strip while a session is blank, and a session stops being blank once
  // an activated target with a view definition says it is active (`commentsViewDefinition`,
  // comment-view.mjs). The definition says so only while the person asked for the view (the Comments
  // start card, the Browser toolbar's Comments button: `comments.wanted`), and the target is activated
  // only in the session they asked from (`openCommentsView` below). Until 01/10 any comment the
  // Browser tab listed activated it in that tab's session, so a blank session on a site with comments
  // lost its start screen to an empty chat column. The definition is registered again whenever the
  // answer flips, because dsh re-reads it only when it publishes (a registry change rebuilds every
  // binding). Delete all asks for the view too (`deleteAll`, e2e v8 V8-2): it sets `wanted` before
  // its rows leave the lists, so the view stays open through the Undo window.
  ctx.effect(() => {
    const isActive = () => commentsViewActive(comments)
    let has = isActive()
    const define = () => ctx.uiConversation.views?.register(commentsViewDefinition(COMMENTS_VIEW, isActive))
    let dispose = define()
    const sync = () => {
      const now = isActive()
      if (now === has) return
      has = now
      dispose?.()
      dispose = define()
    }
    const stopWanted = comments.wanted.subscribe(sync)
    // Leaving the view gives a session that still has no message its start screen back.
    const stopLeft = forgetWhenLeft(comments.open, comments.wanted)
    return () => {
      stopWanted()
      stopLeft()
      dispose?.()
    }
  }, 'tracy-view: comments open a blank conversation on request')
  // The Browser toolbar's "Comments N" button (`tracy:comments-open`): the Comments view is
  // selected through dsh's own tab button (`comments-open.mjs` says why that is the one public road).
  // The Browser tab has already brought the chat column on screen (it left fullscreen).
  ctx.effect(() => {
    const onOpen = (event: Event) => {
      const request = readOpenDetail((event as CustomEvent).detail)
      if (request === null) return
      openCommentsView(request, {
        want: () => comments.wanted.set(true),
        activate: (sessionId) => ctx.uiConversation.binding?.(sessionId).activate(COMMENTS_VIEW),
        findTab: () =>
          document.querySelector<HTMLElement>(
            `[data-conversation-tabs] [role="tab"][data-view="${COMMENTS_VIEW}"]`
          ),
        frame: (fn) => {
          requestAnimationFrame(fn)
        }
      })
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, 'tracy-view: open the Comments view from the Browser toolbar')
  // While the Comments view is on screen, its own row replaces dsh's composer: how to comment, and Start
  // commenting (layout B, Akemi 01/10/2026; the "Add a comment…" box it replaces is gone). `conversation.composer` is a chain whose selectors must be pure functions of the
  // owner props (sessionId, session, pendingInteraction) and runs only when the composer outlet
  // renders — and a view switch does not re-render it. So the entry is registered while some session
  // shows the view and registered again whenever that set changes: a registration is what makes the
  // outlet elect again. Priority 10 is after dsh's approval panel (1) and the read-only subagent
  // notice (-10), and a pending interaction (an approval, a question card) always wins.
  const Composer = makeCommentsFooter(comments)
  ctx.slots.inject('conversation.composer', () => {
    let dispose: (() => void) | null = null
    const sync = () => {
      dispose?.()
      dispose = null
      const open = comments.open.get()
      if (open.size === 0) return
      dispose = ctx.slots.register(
        {
          name: 'conversation.composer',
          priority: 10,
          locale: NS,
          select: ({
            sessionId,
            pendingInteraction
          }: {
            sessionId?: string
            pendingInteraction?: unknown
          }) =>
            sessionId !== undefined && open.has(sessionId) && pendingInteraction === undefined ? {} : null
        },
        Composer
      )
    }
    sync()
    const stop = comments.open.subscribe(sync)
    return () => {
      stop()
      dispose?.()
    }
  })
  // Under every turn that changed the site: what it changed, View, Undo / Go back to here (plan
  // `tasks/undo-change/plan.md` 1.3). It replaces the "Undo all" card of an interrupted turn (#295),
  // keeping its interrupted line and Continue, so a turn never shows two cards. `turnTail` is
  // ui-chat's list slot at the end of every completed turn; `inject` hands the card its session and
  // the page's helpers. One book for the page: every card of a chat shares one read of the door.
  const turnsBook = createTurnsBook()
  // An undo pressed at another door (Site changes, the preview's Undo): that chat's cards read again.
  ctx.effect(
    () => followTurnUndone({ book: turnsBook, siteKey }),
    'tracy-view: an undo at another door reads the chat again'
  )
  /** Every open preview of this site, asked once to reload as a fresh change (an undo is never the turn's own reload). */
  const reloadPreviews = async (sessionId: string): Promise<void> => {
    if (siteKey === null || !sidebar?.getSnapshot || !sidebar.openTabsOf || !sidebar.reloadTab) return
    const reloadOn = siteTabReloader(
      {
        getSnapshot: () => sidebar.getSnapshot!(),
        openTabsOf: (type) => sidebar.openTabsOf!(type),
        reloadTab: (tabId, mode) => sidebar.reloadTab!(tabId, mode)
      },
      sessionId,
      // `undo` (dsh-better-sidebar 0.24.1-tracy.77+, TCH #957): a NEW change, so the tab never takes
      // it for the turn's own reload it already absorbed — inside that minute the undo reloaded nothing.
      'undo'
    )
    reloadOn(hostsOfSite(siteKey, []))
    const { status, body } = await readSites()
    if (status >= 200 && status < 300)
      reloadOn(hostsOfSite(siteKey, (body as { sites?: SiteRow[] } | null)?.sites ?? []))
  }
  // A Sync from live that brought the live site's changes (the Sync from live dialog, even closed):
  // the open previews of this site show them, as after a turn (David 23/10/2026).
  ctx.effect(
    () =>
      onSiteSynced((detail) => {
        if (siteKey === null || !sameSiteKey(detail.siteKey, siteKey)) return
        const sessionId = sidebar?.getSnapshot?.().sessionId
        if (sessionId) void reloadPreviews(sessionId)
      }),
    'tracy-view: a sync from live reloads the previews'
  )
  /** View: the preview of this site already open comes into sight as it is; with none, the home page opens. */
  const viewSite = async (): Promise<void> => {
    if (siteKey === null) return
    const open = sidebar?.openTabsOf?.(BROWSER_TAB) ?? []
    const { status, body } = await readSites()
    const rows = status >= 200 && status < 300 ? ((body as { sites?: SiteRow[] } | null)?.sites ?? []) : []
    const [tabId] = browserTabsOn(open, hostsOfSite(siteKey, rows))
    const column = right()
    if (tabId !== undefined && column !== undefined) {
      try {
        return revealTab(column, tabId)
      } catch {
        // No seat mounted in the column yet: open the page instead.
      }
    }
    openBrowser('/', null)
  }
  // The preview toolbar's Undo (toolbar contract §1, §2): the fork draws it from the state said here
  // and says a press back; the press runs this book's engine, as the card does, and reloads the
  // previews the same way.
  const tUndo = ctx.locale.bind(NS)
  ctx.effect(
    () =>
      watchUndoToolbar({
        book: turnsBook,
        siteKey,
        sessionOnScreen,
        subscribeSessions: (listener) => ctx.sessions.list.subscribe(listener),
        target: window,
        say: (key, params) => fallback(tUndo, key, params),
        timeOf,
        reloadPreviews: (id) => void reloadPreviews(id),
        openChanges: () => sidebar?.openTab({ type: CHANGES_TAB }),
        subscribeRegistry: sidebar ? (listener) => sidebar.subscribe(listener) : undefined,
        // A Viewer (ADR 0028) gets no Undo on the preview toolbar either.
        readOnly: () => isViewerRole(seatRole.getSnapshot()),
        subscribeReadOnly: (listener) => seatRole.subscribe(listener)
      }),
    'tracy-view: the preview toolbar Undo'
  )
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'tracy-turn-undo',
        locale: NS,
        inject: (
          sessionId: string
        ): Pick<
          TurnUndoCardProps,
          'sessionId' | 'book' | 'view' | 'openChanges' | 'reloadPreviews' | 'askRevert' | 'seatRole'
        > => ({
          sessionId,
          book: turnsBook,
          seatRole,
          view: () => void viewSite(),
          openChanges: () => sidebar?.openTab({ type: CHANGES_TAB }),
          reloadPreviews: (id) => void reloadPreviews(id),
          askRevert: (id, text) =>
            sendToChat(id, (sid) => ctx.sessions.binding(sid)?.session, ctx.conversation, text)
        })
      },
      TurnUndoCard
    )
  )
  // Under a turn sent from comments: which of them Tracy provably did and which it could not confirm
  // (ADR 0025). Each line opens its comment through the Browser tab that lists it (`revealDetail`).
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'tracy-comment-report',
        locale: NS,
        inject: (sessionId: string): Pick<CommentReportCardProps, 'sessionId' | 'reveal'> => ({
          sessionId,
          reveal: (id: string) => {
            const detail = revealDetail(comments.lists.getSnapshot(), id)
            return detail === null ? null : () => window.dispatchEvent(new CustomEvent(ACT_EVENT, { detail }))
          }
        })
      },
      CommentReportCard
    )
  )
}
