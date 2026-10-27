import { tracyWebFetch as fetch } from '@tracy/core/web-path'
/**
 * `tracy-my-sites` — every site the viewer has a seat on, and one press to switch to it.
 *
 * This is the `My Sites` part of the Tracy shell, moved into a sidebar tab when dsh became the shell
 * (decided 01/09). The old shell kept it at `/home`; dsh has no router, so it became a tab.
 *
 * 🔒 THIS PLUGIN DOES NOT KNOW WHO HAS WHICH SEAT, and must not. It asks `/api/sites` — the door of
 * `cowork-web`, which reads the seat book with a signed assertion the browser never sees. Building
 * a permission table here would build a second copy of the seat book, and that copy would say "seat
 * still there" on the very day the seat is taken back.
 */
import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { ExternalLink, Layers2, Plus } from 'lucide-react'
import { Button, TabLoadingScope, useTabLoading } from '@tracy/ui'

import {
  agoOf,
  agoUnitsOf,
  PeopleCluster,
  RoleBadge,
  readDeepLink,
  roleLabelKey,
  stripDeepLink,
  type SeatRole,
  type TeamSite
} from '@tracy/core/team'
import { seatOnlyTab } from '@tracy/core/seat'
import { signOut as signOutOfTracy } from '@tracy/core/seat/viewer'
import {
  CREATION_TAB,
  LIST_PANEL_WIDTH,
  type OpenTab,
  type SidebarRight,
  openTabWithMeta,
  sidebarRightOf
} from '@tracy/core/tab-link'
import { canFrameCopy } from '@tracy/core/preview'
import { SITE_PUBLISH_EVENT } from '@tracy/core/site-tabs'
import { hasPageToShow, readSites, sitesChanged } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

import { TRACY_MARK_COLOR, TRACY_MARK_PATH } from '@tracy/ui/brand'
import { CmsCell } from './cms'
import { currentSiteKey } from './current-site'
import { siteKeyFor, siteNameFor, siteRowFor } from '@tracy/core/site-key'
import { keepsPress } from './keeps-press'
import { newestFirst } from './newest-first'
import { rowClassName } from './row-class'
import { syncsFromLive } from './site-toolbar-state'
import { runSiteDelete } from './delete-flow'
import { runSiteLeave } from './leave-flow'
import { registerSiteRow } from './site-row-menu'
import { showDeleteResult } from './delete-result'
import { browserInColumn, everySeat, openBehind, openFromLink, previewAlreadyOpen } from './preview-open'
import { SiteCell } from './site-cell'
import { SitePicker } from './site-picker'
import { HEADER_CSS, SiteChip } from './site-chip'
import { adminUrlFor, openTeam, PREVIEW_TAB, runMoreAction, TEAM_TAB } from './site-actions'
import { registerSiteToolbar } from './site-toolbar'
import {
  DeclineDialog,
  DeleteDialog,
  LeaveDialog,
  type MoreAction,
  MoreMenu,
  RemoveImportDialog
} from './more'
import { acceptErrorKey } from './row-errors'
import { en, NS, type Translate } from './strings'
import { CSS, TAILWIND } from './styles'

/** The tab's id. Package prefix as better-sidebar recommends; must not clash with a built-in tab. */
const TAB_ID = 'tracy:my-sites'

/**
 * Stop a press on a row cell's OWN control (avatar, Start, "…", a menu item, a dialog) from also
 * opening the row; a press on the empty part of the cell goes on to the row (29/09). Menu items
 * and dialogs render in portals, and React still bubbles their events through this tree, so the
 * cell is the one place that catches them all. The decision is `keepsPress`, tested on its own.
 */
function keepPress(event: SyntheticEvent): void {
  if (keepsPress(event.target, event.currentTarget as Element)) event.stopPropagation()
}

/** How often the list is re-read while an agent is starting. */
const START_POLL_MS = 5000
/** How long a press is allowed to stay on "Starting" before the row says it did not work. */
const START_PATIENCE_MS = 4 * 60 * 1000

/** A copy of `record` without `key` — for the two per-site maps below. */
function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const next = { ...record }
  delete next[key]
  return next
}

/** One site row as `/api/sites` returns it (only the part this plugin uses). */
interface SiteRow {
  siteKey: string
  /** The name the site is shown by (`/api/sites` `displayName`); a rename changes it, never the key. */
  displayName?: string
  /** Every name the site answers to, the key included. */
  aliases?: string[]
  /** `wordpress` | `joomla` | `emdash` | … — decides the way into the admin page. */
  platform?: string | null
  /** The seat book's role vocabulary, or `null` for a row without a role yet. */
  role: SeatRole | null
  status: string
  /** Set when the viewer asked to join rather than being invited — the row waits on an admin. */
  requestedAt?: string | null
  /** Who sent the invitation (display name, else address), for the Decline dialog. */
  inviterName?: string | null
  /** When the site was created (ISO); the list sorts on it, newest first. */
  createdAt?: string | null
  /** `'/'` when the lane answers, `null` when the site has no workspace yet. */
  agent: string | null
  copyUrl: string | null
  /** `draft` | `published` for a seat that sits on the site; absent otherwise. */
  publish?: string | null
  /** `live` | `draft` | `delete`: the operation under way on the site; absent when none is. */
  publishing?: string | null
  /** Brought in with Import existing site (`/api/sites` `imported`). */
  imported?: boolean
  /** The import never reached a build: no workspace yet (`/api/sites` `importPending`). */
  importPending?: boolean
  /** The page that finishes that import (`/api/sites` `importRecovery`). */
  importRecovery?: string
}

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  /**
   * Lands in dsh's native right column and expands it (better-sidebar 0.21.1). The preview
   * (`tracy:browser`) takes its address in `url`; `meta` is what a tab of ours remembers, the Team
   * tab's `siteKey` here.
   */
  openTab: (seed: { type: string; url?: string; title?: string; meta?: unknown }) => void
  /** v0.12+: patch what an open tab remembers — how a press reaches a tab already open. */
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  /** v0.12+: the session the side card follows, and its own bottom panel. */
  getSnapshot?: () => { sessionId?: string; state?: unknown }
  /** v0.12+: close one tab. `seatOnlyTab` sweeps a tab of a refused type with it. */
  closeTab?: (tabId: string) => void
  /** v0.12+: the side card's changes, which the sweep keeps watching. */
  subscribeState?: (listener: () => void) => () => void
  /** 0.21.1-tracy.1+: the open tabs of one type — how an open finds the tab it landed on. */
  openTabsOf?: (type: string) => readonly OpenTab[]
}

/**
 * Which platforms' copy can be framed in the side card's Browser tab, and which must open in a real
 * tab. Second copy of `tracy-add-site/src/client/preview.mjs` and must match — like `ADMIN_PATH`
 * (`site-actions.ts`), these two plugins keep their own platform tables rather than import each other. An EmDash
 * copy serves `X-Frame-Options: SAMEORIGIN` and no `frame-ancestors`, so an iframe of it renders a
 * Chromium error; WordPress and Joomla set `frame-ancestors` to allow framing, unknown stays
 * frameable.
 */

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'signedOut' }
  | { state: 'ready'; sites: SiteRow[] }

/**
 * Opens the sign-in door, carrying the place to come back to.
 *
 * `/login` is the ONLY door (ADR 0003) and tracy-web serves it, not dsh — so this is a real
 * navigation, not a route inside the app.
 */
function goSignIn(): void {
  const next = window.location.pathname + window.location.search
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

/**
 * One short sentence in place of the list: loading, empty, failed, not signed in, no sites.
 *
 * `m-0` on the `<p>` is not redundant: this bundle carries no preflight, so the UA's default margin remains.
 */
function Note({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="tracy-mysites px-3 py-4 text-muted-foreground text-sm">
      <p className="m-0">{children}</p>
    </div>
  )
}

/** The button that opens the sign-in door, shared by the tab and the Settings entry. */
function SignIn({ t, message }: { t: Translate; message: string }): JSX.Element {
  return (
    <div className="tracy-mysites px-3 py-4 text-muted-foreground text-sm">
      <p className="m-0">{message}</p>
      <Button type="button" size="sm" className="mt-2" onClick={goSignIn}>
        {t('action.signIn')}
      </Button>
    </div>
  )
}

/**
 * ⚠ `export` ADDED 03/09 ONLY SO STORYBOOK CAN RENDER THIS TAB; nothing in the shipped build changes.
 * `lib/client.js` still enters the loader tree through `apply()`; an extra export of the source module
 * does not reach that bundle. A drawing that imports the running component has no second copy to drift —
 * `docs/references/ui-workflow.md` §Step 1.
 */
/**
 * The My Sites page: the Publish page shell without its stepper (24/10/2026). A full-width column
 * (title and muted lead on the left, the Add sites button on the header's right) with the Add site
 * and Publish gutters and title (styles.ts, tracy-mysites-page).
 * Only the children marked tracy-mysites-block take the column; dialogs ride along untouched.
 */
function TabPage({
  title,
  lead,
  action,
  children
}: {
  title: string
  lead: string
  action?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div className="tracy-mysites tracy-mysites-page flex h-full min-h-0 flex-col text-foreground text-sm">
      <div className="tracy-mysites-block tracy-mysites-head">
        <div className="tracy-mysites-head-text">
          <h2 className="tracy-mysites-title">{title}</h2>
          <p className="tracy-mysites-lead">{lead}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function MySitesTab({
  t,
  sidebar,
  right = () => undefined
}: {
  t: Translate
  sidebar?: BetterSidebar
  /** dsh's right column, read when a tab is opened (`sidebarRightOf`). */
  right?: () => SidebarRight | undefined
}): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  // The page's address names the site by a NAME, which a rename changes; rows are keyed by the
  // site's immutable key, so the name is turned into the key before any row is compared with it.
  const here = currentSiteKey()
  const current = load.state === 'ready' ? (siteKeyFor(load.sites, here) ?? here) : here
  /** What a site is shown by: its current name (bug 03/10/2026). */
  const nameOf = (siteKey: string): string =>
    load.state === 'ready' ? siteNameFor(load.sites, siteKey) : siteKey

  // `silent` re-reads keep the list on screen. The poll below asks every few seconds while an
  // agent is starting, and a list that blanks to the loading bar on every tick is a list
  // the reader cannot use. A silent re-read follows a write or waits for an agent, so it asks the
  // door again (`refresh`); the first read takes the page's shared answer (`readSites`, #340).
  //
  // 🔒 ONLY THE LATEST READ IS APPLIED. The first read, a publish heard from the Settings tab, a
  // look back at this tab and the agent poll all ask on their own, and their answers can land in
  // any order: an older "Draft" arriving after a newer "Live" would put the old chip back until
  // the next look. Every read takes a number; an answer whose number is no longer the last one
  // asked is dropped.
  const asked = useRef(0)
  const read = useCallback(async (silent = false, refresh = silent) => {
    const turn = ++asked.current
    if (!silent) setLoad({ state: 'loading' })
    const { status, body } = await readSites({ refresh })
    if (turn !== asked.current) return
    // 🔒 401 IS NOT AN ERROR, it is a question not answered yet. Folding it into the failure branch
    // gives "could not read the seat book" — a sentence blaming the system for the user not being
    // signed in, with nothing to press next.
    if (status === 401) {
      setLoad({ state: 'signedOut' })
      return
    }
    if (status < 200 || status >= 300 || body === null) {
      setLoad({ state: 'failed' })
      return
    }
    setLoad({ state: 'ready', sites: (body as { sites?: SiteRow[] }).sites ?? [] })
  }, [])

  useEffect(() => {
    void read()
  }, [read])
  // A site published or taken back to draft in its Settings tab: the row's chip follows, quietly.
  useEffect(() => {
    const changed = (): void => void read(true)
    window.addEventListener(SITE_PUBLISH_EVENT, changed)
    return () => window.removeEventListener(SITE_PUBLISH_EVENT, changed)
  }, [read])
  // That event stays inside one window. A site published in ANOTHER browser tab is heard of only by
  // asking: the list is read again, quietly, whenever this tab is looked at again.
  useEffect(() => {
    const looked = (): void => {
      if (document.visibilityState !== 'hidden') void read(true)
    }
    window.addEventListener('focus', looked)
    document.addEventListener('visibilitychange', looked)
    return () => {
      window.removeEventListener('focus', looked)
      document.removeEventListener('visibilitychange', looked)
    }
  }, [read])
  // The tab's shared loading bar (under the tab strip) runs while the seat book is read; the body
  // stays empty, no sentence (Akemi, 30/09). A silent re-read keeps the list and shows no bar.
  useTabLoading(load.state === 'loading')

  // ── The team beside each site ─────────────────────────────────────────────────────────
  //
  // A second read, after the rows are up, so the list never waits on eight rosters. `/api/team`
  // answers every site's book in one round trip; the cell shows "…" until it does. The viewer's
  // address comes from tracy-web's `/auth/me` — the book marks "(you)" by address, and dsh's
  // own account is not that address.
  const [team, setTeam] = useState<Record<string, TeamSite> | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [viewerEmail, setViewerEmail] = useState<string | null>(null)
  const readTeam = useCallback(async () => {
    setTeamLoading(true)
    try {
      const res = await fetch('/api/team', { headers: { accept: 'application/json' } })
      if (!res.ok) return
      const body = (await res.json()) as { sites?: TeamSite[] }
      const next: Record<string, TeamSite> = {}
      for (const site of body.sites ?? []) next[site.siteKey] = site
      setTeam(next)
    } catch {
      /* the cell stays quiet; the row still works without its team */
    } finally {
      setTeamLoading(false)
    }
  }, [])
  useEffect(() => {
    if (load.state !== 'ready') return
    void readTeam()
  }, [load.state, readTeam])
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/auth/me', { headers: { accept: 'application/json' } })
        const body = (await res.json()) as { email?: string | null }
        setViewerEmail(body.email ?? null)
      } catch {
        setViewerEmail(null)
      }
    })()
  }, [])

  /** The Team tab of a site — from the people cluster on its row. */
  const showTeam = (siteKey: string): void => {
    if (sidebar) openTeam(sidebar, right(), siteKey)
  }

  /** The Add site tab — the one place a new site is made — from the button above the table. */
  const addSite = (): void => {
    if (sidebar) openTabWithMeta(sidebar, right(), { type: CREATION_TAB })
  }

  // ── The `…` menu, and the two dialogs behind its last two rows ─────────────────────────
  const [leaving, setLeaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState(false)
  /** What a row write said, above the list. Never a dialog's: a dialog shows `dialogError` only. */
  const [rowError, setRowError] = useState<string | null>(null)
  // A dialog (Leave, Decline, Delete) asks before its write, and the write's answer can arrive
  // after that dialog was closed and another one opened for another site. So an answer is bound to
  // the OPENING it was pressed in: `dialogTurn` moves on every open and every close, a write keeps
  // the turn it started in, and only an answer whose turn still stands may close the dialog or
  // write into it. A late answer is told above the list instead, and leaves the open dialog alone.
  const dialogTurn = useRef(0)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const openDialog = (open: (siteKey: string) => void, siteKey: string): void => {
    dialogTurn.current += 1
    setRowError(null)
    setDialogError(null)
    open(siteKey)
  }
  const closeDialog = (close: (none: null) => void): void => {
    dialogTurn.current += 1
    setDialogError(null)
    close(null)
  }
  /** A failed answer: into the dialog it was pressed in, or above the list once that one is gone. */
  const tellFailure = (turn: number, sentence: string): void => {
    if (dialogTurn.current === turn) setDialogError(sentence)
    else setRowError(sentence)
  }
  const [copied, setCopied] = useState<string | null>(null)

  /** The same book refusing an accept: there a missing seat means the invitation is gone. */
  const explainAccept = (status: number, code: string | undefined): string => t(acceptErrorKey(status, code))

  // Leave and Delete are the two flows the sidebar's site row runs too (`site-row-menu.tsx`): one
  // copy each, in `leave-flow.ts` / `delete-flow.ts`. This tab keeps its dialog: the busy state,
  // where a failure is written (bound to the opening it was pressed in), and when it closes.
  const dialogHooks = (close: (none: null) => void) => {
    const turn = dialogTurn.current
    return {
      current,
      t,
      setBusy: (busy: boolean) => {
        setRowBusy(busy)
        if (busy) setDialogError(null)
      },
      tellFailure: (sentence: string) => tellFailure(turn, sentence),
      closeDialog: () => {
        if (dialogTurn.current === turn) closeDialog(close)
      },
      // Every reader on the page drops or updates the site (the left column, the Mode chip), not just this list.
      changed: () => {
        sitesChanged()
        void read(true)
      }
    }
  }

  const leave = (siteKey: string): Promise<void> => runSiteLeave({ siteKey, ...dialogHooks(setLeaving) })

  const remove = (siteKey: string): Promise<void> =>
    runSiteDelete({
      siteKey,
      // Read now: once the row is off the book the list no longer knows the site's name.
      siteName: nameOf(siteKey),
      ...dialogHooks(setDeleting),
      showResult: showDeleteResult,
      mark: { path: TRACY_MARK_PATH, color: TRACY_MARK_COLOR }
    })

  const runAction = (site: SiteRow, action: MoreAction): void =>
    runMoreAction(
      { siteKey: site.siteKey, name: nameOf(site.siteKey), liveUrl: site.copyUrl, platform: site.platform },
      action,
      {
        sidebar,
        right,
        copied: (siteKey) => {
          setCopied(siteKey)
          window.setTimeout(() => setCopied(null), 2000)
        },
        leave: (siteKey) => openDialog(setLeaving, siteKey),
        remove: (siteKey) => openDialog(setDeleting, siteKey)
      }
    )

  // ── Starting an agent ──────────────────────────────────────────────────────────────────
  //
  // A site with a seat but no agent shows "Start the agent". The press asks cowork-web to build
  // the lane (`POST /api/sites/<siteKey>/agent`); the answer comes back before the lane answers on
  // its own address, so the row stays on "Starting" and the list is re-read quietly until
  // `/api/sites` reports `agent !== null` — or until START_PATIENCE_MS runs out, which is the only
  // way a lane that never comes up gets reported instead of spinning forever.
  const [starting, setStarting] = useState<Record<string, number>>({})
  const [startFailed, setStartFailed] = useState<Record<string, true>>({})

  const start = async (siteKey: string): Promise<void> => {
    if (starting[siteKey] !== undefined) return
    setStartFailed((f) => without(f, siteKey))
    setStarting((s) => ({ ...s, [siteKey]: Date.now() }))
    let ok = false
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/agent`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      ok = res.ok
    } catch {
      ok = false
    }
    if (!ok) {
      setStarting((s) => without(s, siteKey))
      setStartFailed((f) => ({ ...f, [siteKey]: true }))
    }
  }

  // ── Accepting an invitation ────────────────────────────────────────────────────────────
  //
  // A row that was invited and never answered had a badge and nothing to press, so the only way
  // in was the site's own address — and the single-site invitation mail carries no link there
  // either (Lee, 04/09). The press asks cowork-web's accept door on the viewer's behalf; the
  // seat book decides. Per row, like `starting`: a person can hold several invitations, and one
  // spinning button must not describe the others.
  //
  // A row with `requestedAt` is NOT offered this: that one is the viewer's own request waiting on
  // an admin, and the seat book refuses a self-accept (`JOIN_REQUEST_PENDING`).
  const [accepting, setAccepting] = useState<Record<string, true>>({})

  const accept = async (siteKey: string): Promise<void> => {
    if (accepting[siteKey] !== undefined) return
    setAccepting((a) => ({ ...a, [siteKey]: true }))
    setRowError(null)
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!res.ok) {
        let code: string | undefined
        try {
          code = ((await res.json()) as { code?: string }).code
        } catch {
          code = undefined
        }
        // Every failed answer is told. The accept door answers a seat that is already the
        // viewer's with 200 (`seats/route.js`), so no failure is ever a quiet success here.
        setRowError(explainAccept(res.status, code))
        return
      }
      // The row is a seat now: re-read so it stops being an invitation and starts offering the
      // things a seat offers — here and in every other reader on the page.
      sitesChanged()
      await read(true)
    } catch {
      setRowError(t('error.failed'))
    } finally {
      setAccepting((a) => without(a, siteKey))
    }
  }

  // ── Declining an invitation ────────────────────────────────────────────────────────────
  //
  // Beside Accept (U10 A, spec #809 T6): the seat book marks the invitation declined and tells
  // the person who sent it. Per row, like `accepting`; the same refusals mean the same things.
  const [declining, setDeclining] = useState<Record<string, true>>({})
  /** The invitation whose Decline dialog is open (it asks first, develop #800). */
  const [declineAsk, setDeclineAsk] = useState<string | null>(null)

  const decline = async (siteKey: string): Promise<void> => {
    if (declining[siteKey] !== undefined) return
    const turn = dialogTurn.current
    /** Close the dialog this press came from; one opened since (another site's) is not this answer's. */
    const closeMine = (): void => {
      if (dialogTurn.current === turn) closeDialog(setDeclineAsk)
    }
    setDeclining((d) => ({ ...d, [siteKey]: true }))
    setDialogError(null)
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/decline`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!res.ok) {
        let code: string | undefined
        try {
          code = ((await res.json()) as { code?: string }).code
        } catch {
          code = undefined
        }
        // The seat is already the viewer's (accepted elsewhere): the row was stale. Only the pair
        // the decline door sends (`seats/route.js`: 409 `ALREADY_GRANTED`) says so; the same code
        // on any other status is read by that status, like every other failed answer.
        if (res.status === 409 && code === 'ALREADY_GRANTED') {
          // Nothing is left to decline: the dialog goes, the list shows the seat, and the
          // sentence above it says why and where giving the seat up lives. Above the list, never
          // in a dialog: by the time the list is reread another site's dialog may be open.
          closeMine()
          await read(true)
          setRowError(t('error.declineAccepted'))
          return
        }
        tellFailure(turn, explainAccept(res.status, code))
        return
      }
      // A declined invitation is no longer a row of My Sites, nor a dialog.
      closeMine()
      sitesChanged()
      await read(true)
    } catch {
      tellFailure(turn, t('error.failed'))
    } finally {
      setDeclining((d) => without(d, siteKey))
    }
  }

  // ── Removing an unfinished import ───────────────────────────────────────────────────────
  //
  // The row of an import whose read never reached a build (`importPending`): the one server door
  // (`DELETE /api/sites/:key/import`) deletes it only once the host confirmed no read is going. A
  // read still going, or a host that could not say, is a sentence in the dialog; nothing went.
  const [removeImportAsk, setRemoveImportAsk] = useState<string | null>(null)
  const [removingImport, setRemovingImport] = useState(false)
  const removeImport = async (siteKey: string): Promise<void> => {
    if (removingImport) return
    const turn = dialogTurn.current
    setRemovingImport(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/import`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!res.ok) {
        const code = await res
          .json()
          .then((body: { code?: string }) => body.code)
          .catch(() => undefined)
        tellFailure(
          turn,
          t(res.status === 409 && code === 'IMPORT_RUNNING' ? 'removeImport.running' : 'removeImport.later')
        )
        return
      }
      if (dialogTurn.current === turn) closeDialog(setRemoveImportAsk)
      sitesChanged()
      await read(true)
    } catch {
      tellFailure(turn, t('removeImport.later'))
    } finally {
      setRemovingImport(false)
    }
  }

  const anyStarting = Object.keys(starting).length > 0
  useEffect(() => {
    if (!anyStarting) return
    const timer = setInterval(() => void read(true), START_POLL_MS)
    return () => clearInterval(timer)
  }, [anyStarting, read])

  // Each answer from /api/sites settles the rows that were starting: up → done, too long → failed.
  useEffect(() => {
    if (load.state !== 'ready' || !anyStarting) return
    const now = Date.now()
    const done: string[] = []
    const failed: string[] = []
    for (const [siteKey, since] of Object.entries(starting)) {
      const row = load.sites.find((s) => s.siteKey === siteKey)
      if (row && row.agent !== null) done.push(siteKey)
      else if (now - since > START_PATIENCE_MS) failed.push(siteKey)
    }
    if (done.length === 0 && failed.length === 0) return
    setStarting((s) => {
      const next = { ...s }
      for (const k of [...done, ...failed]) delete next[k]
      return next
    })
    if (failed.length > 0) {
      setStartFailed((f) => {
        const next = { ...f }
        for (const k of failed) next[k] = true
        return next
      })
    }
  }, [load, starting, anyStarting])

  /**
   * Open the site in A SEPARATE WINDOW, without changing the window in use.
   *
   * The old version did `POST /api/site` then reloaded — that is, it **moved where you were working**.
   * Working on two sites at once was impossible, with no way back except switching once more. 02/09:
   * *"when opening, it should open a new window pointing at the right URL"*.
   *
   * 🔒 The reload is still right and still happens — just in the NEW window. Switching sites means moving
   * to another lane: another session, another file tree, another config, and dsh builds all of that state
   * at boot. A new window gets that for free and carries none of the old site's half-state.
   *
   * The seat check did NOT go away, it moved: the `/<siteKey>` path of `cowork-web` checks the seat,
   * checks the lane, and only then sets the cookie — so a copy of that logic here is redundant, and a
   * redundant copy is a copy that will drift.
   *
   * `noreferrer` is not decoration: without it, the newly opened window can reach this one through
   * `window.opener`.
   * @param siteKey - the site to open.
   */
  const open = (siteKey: string): void => {
    window.open(`/${nameOf(siteKey)}`, '_blank', 'noreferrer')
  }

  if (load.state === 'loading') return <></>
  if (load.state === 'signedOut')
    return (
      <TabPage title={t('list.title')} lead={t('list.lead')}>
        <div className="tracy-mysites-block">
          <SignIn t={t} message={t('state.signedOut')} />
        </div>
      </TabPage>
    )
  if (load.state === 'failed') {
    return (
      <TabPage title={t('list.title')} lead={t('list.lead')}>
        <div className="tracy-mysites-block text-muted-foreground text-sm">
          <p className="m-0">{t('state.failed')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void read(false, true)}
          >
            {t('action.retry')}
          </Button>
        </div>
      </TabPage>
    )
  }
  if (load.sites.length === 0)
    return (
      <TabPage title={t('list.title')} lead={t('list.lead')}>
        <p className="tracy-mysites-block m-0 text-muted-foreground text-sm">{t('state.empty')}</p>
      </TabPage>
    )

  /**
   * Sites where this viewer is the ONLY Owner. They may not leave those (ADR 0036): somebody has
   * to be able to let people in. Read from the team book the row cluster already loaded, so the
   * menu needs no request of its own; before it arrives the row is not marked, and the seat book
   * refuses the leave anyway — the menu is a courtesy, the door is the rule.
   */
  const onlyOwner = Object.values(team ?? {})
    .filter((site) => {
      const owners = (site.seats ?? []).filter((s) => s.role === 'owner' && s.status === 'active')
      return owners.length === 1 && owners[0]?.email === viewerEmail
    })
    .map((site) => site.siteKey)

  /*
   * A table styled exactly like the Team tab's roster (Akemi, 29/09): Site · CMS · Role · Team ·
   * Created · "…", newest site first. CMS sits beside Site (Akemi, 30/09) because it describes the
   * site itself, before the columns about the viewer's seat on it. Two decisions kept from the list
   * it replaces:
   *
   * 1. A row shows exactly one state: a badge or the one button that applies, on the Site cell's
   *    line right after the address (Akemi, 01/10; it had a Status column of its own until then).
   *    A row is in one state, never two.
   * 2. The whole row opens its site (below); the cells with their own controls stop the press.
   *
   * The role left the site name for a column of its own, as the badge the Team tab shows, so the
   * two tabs read one way.
   */
  const now = Date.now()
  const ago = agoUnitsOf(t)
  return (
    // The root fills the tab body (a fixed-height box that clips what overflows it), the title and
    // the action under the table keep their place, and the table box is the one that scrolls: with
    // many sites the rows past the tab's bottom edge were cut off and never reachable (09/10).
    <TabPage
      title={t('list.title')}
      lead={t('list.lead')}
      action={
        <Button type="button" size="sm" className="tracy-mysites-add" onClick={addSite}>
          <Plus aria-hidden="true" />
          {t('action.addSites')}
        </Button>
      }
    >
      {rowError !== null && (
        <p className="tracy-mysites-block m-0 mb-3 flex-none text-destructive text-xs" role="alert">
          {rowError}
        </p>
      )}
      {/* The box is a size container: the columns it cannot hold give way in order (Created,
            the CMS logo, Role, then Team) and the site name truncates, so the table never scrolls
            sideways in a panel the frame keeps narrow (styles.ts, tracy-mysites-table). It is also
            the vertical scroller, its column headers sticky at its top. */}
      <div className="tracy-mysites-table tracy-mysites-block min-h-0 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="tracy-mysites-site px-3 py-2 text-left font-medium">{t('column.site')}</th>
              <th className="tracy-mysites-cms-col px-3 py-2 text-left font-medium">{t('column.cms')}</th>
              <th className="tracy-mysites-role px-3 py-2 text-left font-medium">{t('column.role')}</th>
              <th className="tracy-mysites-team px-3 py-2 text-left font-medium">{t('column.team')}</th>
              <th className="tracy-mysites-created px-3 py-2 text-left font-medium">{t('column.created')}</th>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">{t('column.more')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {newestFirst(load.sites).map((site) => {
              const isCurrent = site.siteKey === current
              // A site without a lane is still LISTED, just not pressable. Hiding it would leave a person
              // with a real seat unable to find their site anywhere, with nothing saying why.
              const openable =
                site.agent !== null && !site.importPending && !isCurrent && site.status === 'accepted'
              const book = team?.[site.siteKey] ?? {
                siteKey: site.siteKey,
                platform: site.platform ?? null,
                myRole: site.role,
                status: site.status,
                seats: null
              }
              return (
                /*
                 * The whole row opens the site (Akemi, 29/09): the small "Chat" button was the only
                 * target, and a press anywhere else on the row did nothing. Still a new browser tab,
                 * as Lee decided on 02/09 (`open` below). The row is a link in role, not an <a>,
                 * because it holds its own buttons (team, the menu), which an <a> may not contain;
                 * those stop the press at their own cell (`keepPress`).
                 */
                <tr
                  key={site.siteKey}
                  className={rowClassName(openable, isCurrent)}
                  {...(openable
                    ? {
                        role: 'link',
                        tabIndex: 0,
                        'aria-label': t('row.open', { site: nameOf(site.siteKey) }),
                        onClick: () => open(site.siteKey),
                        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          open(site.siteKey)
                        }
                      }
                    : {})}
                >
                  {/* The site and, after it on the same line, the row's one state (site-cell.tsx). Its
                        buttons stop the press here; the rest of the cell opens the row. */}
                  <td
                    className="tracy-mysites-site px-3 py-2 align-middle"
                    onClick={keepPress}
                    onKeyDown={keepPress}
                  >
                    <SiteCell
                      site={site}
                      isCurrent={isCurrent}
                      openable={openable}
                      accepting={accepting[site.siteKey] !== undefined}
                      starting={starting[site.siteKey] !== undefined}
                      startFailed={startFailed[site.siteKey] === true}
                      declining={declining[site.siteKey] !== undefined}
                      onAccept={() => void accept(site.siteKey)}
                      onDecline={() => {
                        openDialog(setDeclineAsk, site.siteKey)
                      }}
                      onStart={() => void start(site.siteKey)}
                      onRemoveImport={() => openDialog(setRemoveImportAsk, site.siteKey)}
                      t={t}
                    />
                  </td>
                  <td className="tracy-mysites-cms-col px-3 py-2 align-middle">
                    <CmsCell platform={site.platform} />
                  </td>
                  <td className="tracy-mysites-role px-3 py-2 align-middle">
                    {site.role !== null && <RoleBadge role={site.role} t={t} />}
                  </td>
                  <td
                    className="tracy-mysites-team px-3 py-2 align-middle"
                    onClick={keepPress}
                    onKeyDown={keepPress}
                  >
                    {site.status === 'accepted' && (
                      <PeopleCluster
                        site={book}
                        viewerEmail={viewerEmail}
                        open={false}
                        loading={teamLoading && team === null}
                        onClick={() => showTeam(site.siteKey)}
                        t={t}
                      />
                    )}
                  </td>
                  <td className="tracy-mysites-created whitespace-nowrap px-3 py-2 align-middle text-muted-foreground text-xs">
                    {site.createdAt ? agoOf(site.createdAt, now, ago) : null}
                  </td>
                  <td className="px-3 py-2 text-right align-middle" onClick={keepPress} onKeyDown={keepPress}>
                    {copied === site.siteKey ? (
                      <span className="text-muted-foreground text-xs">{t('more.copied')}</span>
                    ) : (
                      <MoreMenu
                        site={{
                          siteKey: site.siteKey,
                          role: site.role,
                          status: site.status,
                          liveUrl: site.copyUrl,
                          adminUrl: adminUrlFor(site.copyUrl, site.platform),
                          lastOwner: site.role === 'owner' && onlyOwner.includes(site.siteKey),
                          publish: site.publish ?? null,
                          publishing: site.publishing ?? null,
                          syncsFromLive: syncsFromLive(site)
                        }}
                        onAction={(action) => runAction(site, action)}
                        t={t}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {leaving !== null && (
        <LeaveDialog
          siteKey={leaving}
          siteName={nameOf(leaving)}
          busy={rowBusy}
          error={dialogError}
          onOpenChange={(o) => {
            if (!o) closeDialog(setLeaving)
          }}
          onConfirm={() => void leave(leaving)}
          t={t}
        />
      )}
      {declineAsk !== null && (
        <DeclineDialog
          siteName={nameOf(declineAsk)}
          inviter={
            (load.state === 'ready'
              ? load.sites.find((r) => r.siteKey === declineAsk)?.inviterName?.trim()
              : null) || null
          }
          busy={declining[declineAsk] !== undefined}
          error={dialogError}
          onOpenChange={(o) => {
            if (!o) closeDialog(setDeclineAsk)
          }}
          onConfirm={() => void decline(declineAsk)}
          t={t}
        />
      )}
      {removeImportAsk !== null && (
        <RemoveImportDialog
          siteName={nameOf(removeImportAsk)}
          busy={removingImport}
          error={dialogError}
          onOpenChange={(o) => {
            if (!o) closeDialog(setRemoveImportAsk)
          }}
          onConfirm={() => void removeImport(removeImportAsk)}
          t={t}
        />
      )}
      {deleting !== null && (
        <DeleteDialog
          siteKey={deleting}
          siteName={nameOf(deleting)}
          busy={rowBusy}
          error={dialogError}
          onOpenChange={(o) => {
            if (!o) closeDialog(setDeleting)
          }}
          onConfirm={() => void remove(deleting)}
          t={t}
        />
      )}
    </TabPage>
  )
}
/**
 * The body of a Settings section: Fact rows separated by hairlines, with no heading of its own.
 * The settings dialog (@tracy/dsh-settings) names every open section in one page title, so a
 * heading here would title the page twice (Akemi, 02/10/2026). No card either, so these sections
 * read like General: rows on the dialog surface, hairlines between them.
 */
function Section({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="tracy-mysites text-[13px] text-foreground">
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

/**
 * One label / value row. The value is an email or an address — long, and must not push the label out
 * of the pane, so it can break anywhere. The note (if any) sits BELOW the row, across the full width,
 * rather than squeezing into the label column.
 */
function Fact({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-6">
        <div className="min-w-0 text-muted-foreground">{label}</div>
        {children !== undefined && (
          <div className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</div>
        )}
      </div>
      {hint !== undefined && <p className="m-0 mt-1.5 text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

/**
 * One row of Settings › Account (Akemi 04/10/2026, option A of review/settings-account-options.html):
 * the label on top, the value under it in the normal text colour, the help line under that, all
 * left-aligned; an action (Sign out) sits on the right of its row. Only the Account section uses it:
 * `Fact` keeps its label-left / value-right shape everywhere else.
 */
function AccountRow({
  label,
  value,
  hint,
  action
}: {
  label: string
  value?: ReactNode
  hint?: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="tracy-mysites-account-row">
      <div className="tracy-mysites-account-text">
        <div className="tracy-mysites-account-label">{label}</div>
        {value !== undefined && <div className="tracy-mysites-account-value">{value}</div>}
        {hint !== undefined && <p className="tracy-mysites-account-hint">{hint}</p>}
      </div>
      {action !== undefined && <div className="tracy-mysites-account-action">{action}</div>}
    </div>
  )
}

/**
 * The signed-in identity, read from tracy-web's `/auth/me`.
 *
 * dsh has an account of its OWN (the dsh-passwords subuser), and that is not what a person means
 * when they ask "which email am I signed in with". A seat is granted to an address in the seat
 * book; the subuser is only a consequence. So this section asks the book, not dsh.
 */
export function AccountSection({ t }: { t: Translate }): JSX.Element {
  // `undefined` while the door is being read, `false` when the read failed, `null` for the door's
  // own signed-out answer, else the address.
  const [email, setEmail] = useState<string | null | false | undefined>(undefined)
  // A failed read is NOT "signed out" (F-S2-021, #811): an outage, a proxy's error page or a body
  // that is not the door's JSON used to print "not signed in" over a live session. The door says
  // signed out in exactly one way, 200 with `email: null`; anything else without a usable address
  // is a read that failed, said as one and retried from here.
  const read = useCallback(async () => {
    setEmail(undefined)
    try {
      const res = await fetch('/auth/me', { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`/auth/me answered ${res.status}`)
      const body = (await res.json()) as { email?: unknown } | null
      const address = body !== null && typeof body === 'object' ? body.email : undefined
      if (address === null) setEmail(null)
      else setEmail(typeof address === 'string' && address !== '' ? address : false)
    } catch {
      setEmail(false)
    }
  }, [])
  useEffect(() => {
    void read()
  }, [read])
  const [leaving, setLeaving] = useState(false)
  // Sign out is TRACY-WEB's door, not dsh's. dsh-passwords has its own "Sign out" on the
  // Password Gate card, and it only drops the lane cookie: the tracy-web session survives, the next
  // navigation mints a fresh lane session, and the person is back where they started — measured
  // 03/09 with two accounts in one browser. `/auth/signout` clears all three cookies (session,
  // site, lane); the shared `signOut` (`@tracy/core/seat/viewer`) posts there, clears the page's
  // viewer and leaves for the sign-in door.
  const signOut = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await signOutOfTracy()
    } catch {
      setLeaving(false)
      setEmail(false)
    }
  }
  if (email === undefined) return <Note>{t('loading.label')}</Note>
  if (email === false) {
    return (
      <div className="tracy-mysites px-3 py-4 text-muted-foreground text-sm">
        <p className="m-0">{t('state.failed')}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void read()}>
          {t('action.retry')}
        </Button>
      </div>
    )
  }
  if (email === null) return <SignIn t={t} message={t('account.anonymous')} />
  return (
    <Section>
      <AccountRow label={t('account.email')} value={email} hint={t('account.emailNote')} />
      <AccountRow
        label={t('account.session')}
        hint={t('account.sessionNote')}
        action={
          <Button variant="outline" size="sm" disabled={leaving} onClick={() => void signOut()}>
            {t('account.signOut')}
          </Button>
        }
      />
    </Section>
  )
}

/** The open site: role and public address. Same source as the tab; no second source. */
function SiteSection({ t }: { t: Translate }): JSX.Element {
  const [row, setRow] = useState<SiteRow | null | undefined>(undefined)
  const current = currentSiteKey()
  useEffect(() => {
    void (async () => {
      const { body } = await readSites()
      const sites = (body as { sites?: SiteRow[] } | null)?.sites ?? []
      setRow(siteRowFor(sites, current) ?? sites[0] ?? null)
    })()
  }, [current])
  if (row === undefined) return <Note>{t('loading.label')}</Note>
  if (row === null) return <Note>{t('site.none')}</Note>
  const adminUrl = adminUrlFor(row.copyUrl, row.platform)
  return (
    <Section>
      <Fact label={<span className="font-medium text-foreground">{siteNameFor([row], row.siteKey)}</span>} />
      {row.role !== null && (
        <Fact label={t('site.role')} hint={t('site.roleNote')}>
          {/* The translated name, never the raw code (ADR 0028). */}
          {roleLabelKey(row.role) === null ? '' : t(roleLabelKey(row.role) as string)}
        </Fact>
      )}
      {row.copyUrl !== null && <Fact label={t('site.live')}>{row.copyUrl}</Fact>}
      {adminUrl !== null && (
        <Fact label={t('site.admin')}>
          {/*
           * A REAL window, not the Browser tab beside it: the admin page needs a sign-in, and
           * an iframe cannot keep the session cookie. `noreferrer` also cuts `window.opener`.
           *
           * `no-underline` because there is no preflight: the UA still underlines and colours every `<a>` blue.
           */}
          <a
            className="inline-flex items-center gap-1 text-primary no-underline hover:underline"
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t('site.adminOpen')}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Fact>
      )}
    </Section>
  )
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ — there is no optional injection. Declaring it here means the plugin activates only
 * once better-sidebar is ready; on a profile without it, cordis leaves the plugin PENDING — silently, and
 * that is the right failure: a tab with no sidebar to dock into has nothing to do.
 */
export const inject = ['betterSidebar', 'locale', 'slots']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /** dsh's right column is probed through it, not injected (`sidebarRightOf`). */
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-my-sites="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyMySites = '1'
    // Tailwind first, the hand-written rules after: source order decides when both match.
    el.textContent = `${TAILWIND}\n${CSS}\n${HEADER_CSS}`
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-my-sites: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-my-sites: dictionaries')
  const t = ctx.locale.bind(NS)

  // On a site page, dsh's sidebar row for the site's own folder says Site and offers Leave site /
  // Delete site… with this tab's dialogs and flows, instead of Rename / Delete workspace.
  registerSiteRow(ctx.slots, t)

  // The Browser toolbar's Publish and More buttons, drawn by the dsh-better-sidebar fork from what
  // this plugin says (`site-toolbar.tsx`): the Publish tab, and this list's own `…` menu.
  ctx.effect(
    () => registerSiteToolbar({ t, sidebar: ctx.betterSidebar, right: () => sidebarRightOf(ctx) }),
    'tracy-my-sites: browser toolbar'
  )

  /**
   * A link may ask for this tab: `?open=my-sites&team=<siteKey>&member=<email>` (Lee, 04/09).
   * The team mails carry one. The request is read once and opened by `openFromLink` below once a
   * seat is bound. It leaves the address bar only AFTER the tab opened (mail audit 04/10/2026):
   * stripped at boot, a load that never opened the tab left a bare site address behind, and the
   * link could not even be retried with a reload.
   */
  const asked = readDeepLink(window.location.search)
  const forgetLink = (): void => {
    try {
      const rest = stripDeepLink(window.location.search)
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${rest}${window.location.hash}`
      )
    } catch {
      /* a URL we cannot rewrite is still a page we can open */
    }
  }

  /**
   * Pre-open the open site's Browser tab, in the right column of EVERY conversation.
   *
   * 02/09: *"if it could auto-open 2 URLs, the website itself + the admin page URL, that would be great"* —
   * and open them in the sidebar's Browser tab, not a new browser window.
   *
   * 🔒 THE BROWSER TAB IS THE SITE WORKSPACE'S PAGE (since 03/10/2026). Edit and Comments live in it, so
   * in a site's workspace it is always there: the last tab cannot be closed (`keepLast` of
   * better-sidebar, dsh tracy.16), and each conversation has its own column (dsh keeps one column per session),
   * so every session docked into a column gets a tab pre-opened (`everySeat`). The old rule "once per
   * site, per browser session" (`sessionStorage`) existed to avoid reopening what someone just closed — the last
   * tab now cannot be closed, and closing a second tab still leaves the other in the column, so nothing more opens.
   *
   * Failing is silent: no `openTab` (an old better-sidebar), a site without an address, or a site not finished
   * building — none of these is a reason to break a session opening.
   */
  ctx.effect(() => {
    const siteKey = currentSiteKey()
    if (siteKey === null || typeof ctx.betterSidebar.openTab !== 'function') return
    let alive = true
    let stop = (): void => {}
    void (async () => {
      try {
        const { status, body } = await readSites()
        if (!alive || status < 200 || status >= 300) return
        // Any name of the site finds its row: the address may carry the name a rename gave it.
        const row = siteRowFor((body as { sites?: SiteRow[] } | null)?.sites ?? [], siteKey)
        // A claimed site that is not built yet has no page, only "Site unavailable" — and the
        // Build tab the claim opened is what the customer must see (`hasPageToShow`).
        if (!row?.copyUrl || !hasPageToShow(row)) return
        // `canFrameCopy` is true for every platform since 19/09 (tracy-web's site proxy lets Tracy
        // frame EmDash too); the question stays for a platform that may refuse again.
        if (!canFrameCopy(row.platform)) return
        // ONLY the page customers see. The admin page is NOT opened here, and that is not an
        // omission — it cannot run in this tab. The Browser tab is an iframe, so requests to the site
        // carry THIRD-PARTY cookies, which the browser blocks; the `fleet-bar` gate sees "not signed
        // in" and bounces to the login page, and the login page cannot set a cookie in an iframe either.
        // That tab already shows the warning line "third-party cookies may not work".
        //
        // Measured 02/09 on a WordPress test site: opening `/wp-admin` here gave "refused to connect", and no
        // header blocked it — the sandbox already allowed `allow-same-origin`, `allow-forms`,
        // `allow-top-navigation`. Opening a tab just for it to show an error is worse than not opening it.
        //
        // The way into the admin page is in the site card below, which opens a REAL window.
        // Open it BEHIND whatever the person is on. An open lands in sight — it activates its tab
        // and expands dsh's right column — and this one arrives seconds after boot, right on top of
        // the tab somebody just picked, closing any menu they had open (measured 05/09 on the old
        // side card). So: remember the tab in sight and whether the column was open, open, then
        // hand both back.
        // A Browser tab already in this conversation's column — a `?open=browser&page=` link's page,
        // or one the person opened — keeps its page (`browserInColumn`, `previewAlreadyOpen`).
        const copyUrl = row.copyUrl
        const siteKeyOfRow = row.siteKey
        const right = sidebarRightOf(ctx)
        // The column drops an open before this page has bound its session.
        stop = everySeat(ctx.betterSidebar, right, (sessionId) => {
          const held =
            browserInColumn(right?.openTabs, sessionId) ??
            previewAlreadyOpen(ctx.betterSidebar.openTabsOf?.(PREVIEW_TAB), copyUrl)
          if (held) return
          openBehind(right, () =>
            ctx.betterSidebar.openTab({
              type: PREVIEW_TAB,
              url: copyUrl,
              title: siteNameFor([row], siteKeyOfRow),
              meta: { siteKey: siteKeyOfRow, url: copyUrl }
            })
          )
        })
        if (!alive) stop()
      } catch {
        /* a convenience, not a feature */
      }
    })()
    return () => {
      alive = false
      stop()
    }
  }, "tracy-my-sites: the live site in every conversation's column")

  // 🔒 WRAPPED IN `ctx.effect`. `registerTab` returns a disposer cordis calls on teardown; unwrapped,
  // HMR or a plugin off/on leaves the old registration behind, and the next one throws "tab type already
  // registered".
  //
  // 🔒 `seatOnlyTab`, NOT `registerTab` DIRECTLY. This tab lists the sites the viewer HAS A SEAT on, so
  // for a stranger not signed in it is a permanently empty list — and since ADR 0014 the customer is a
  // ROLE in the same dsh, same `native` profile, so the profile's `seedTabs` seeds it for them too. The helper
  // asks `/auth/me` once, registers when the viewer is signed in, and sweeps the seeded tab when
  // not. The full rule: `@tracy/core/seat`.
  ctx.effect(
    () =>
      seatOnlyTab(
        ctx.betterSidebar,
        TAB_ID,
        () => ({
          id: TAB_ID,
          title: () => t('tab.title'),
          // The add-tab menu lays icon + text out as one column, so an entry without an icon shifts left and
          // looks like a rendering bug rather than a normal entry (measured 02/09).
          //
          // lucide's `Layers2`: a stack of cards — many sites, not one. lucide goes into the bundle
          // through esbuild (not external), so no import path can break at runtime.
          // `strokeWidth` fixed at 1.8 rather than following `size`: the tab bar draws icons at 16–20px, and a
          // stroke that scales with size in that range gets so thin it vanishes on non-HiDPI screens.
          icon: (size: number) => <Layers2 size={size} strokeWidth={1.8} aria-hidden="true" />,
          // Right after `Add site` (1) and before every built-in tab. See the `order` note in
          // `tracy-add-site`: Tracy's two tabs lead the menu, the rest keep their old order.
          order: 2,
          single: true,
          // A table, not a site preview: the right panel opens at the width the table needs
          // (720px) and leaves the rest to the conversation, until the customer drags the divider.
          preferredWidth: LIST_PANEL_WIDTH,
          component: () => (
            <TabLoadingScope label={t('loading.label')}>
              <MySitesTab t={t} sidebar={ctx.betterSidebar} right={() => sidebarRightOf(ctx)} />
            </TabLoadingScope>
          )
        }),
        { nativeSidebar: () => sidebarRightOf(ctx) }
      ),
    'tracy-my-sites: tab'
  )
  // The link's own tab, once a seat is bound: the Team tab it names, else the table (`preview-open.ts` openFromLink).
  ctx.effect(() => {
    if (asked === null) return
    return openFromLink(
      asked,
      ctx.betterSidebar,
      () => sidebarRightOf(ctx),
      { team: TEAM_TAB, list: TAB_ID },
      {
        onOpened: forgetLink
      }
    )
  }, 'tracy-my-sites: open from the link')

  // The chat's site picker lists every site the viewer can open, not only this page's own
  // (`site-picker.tsx`). Priority -1: a single slot renders its lowest priority, so this wins over
  // dsh's picker (priority 0) whichever plugin registers first. `slots.inject`, because the slot
  // is declared by dsh's conversation package and activation order between the two is not bound.
  ctx.slots.inject('conversation.hero.workspace', () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.workspace',
        id: 'tracy-site-picker',
        priority: -1,
        inject: () => ({
          t,
          openMySites: () => {
            if (typeof ctx.betterSidebar.openTab === 'function') ctx.betterSidebar.openTab({ type: TAB_ID })
          }
        })
      },
      SitePicker
    )
  )

  // The site chip at the top left of the chat column (`site-chip.tsx`): dsh's header leading slot,
  // which nothing else occupies and which dsh draws in a blank session too.
  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register(
      {
        name: 'conversation.header.leading',
        id: 'tracy-site-chip',
        inject: () => ({
          t,
          openMySites: () => {
            if (typeof ctx.betterSidebar.openTab === 'function') ctx.betterSidebar.openTab({ type: TAB_ID })
          }
        })
      },
      SiteChip
    )
  )

  // ── The two Settings entries the Tracy shell used to keep ──────────────────────────────────────
  //
  // ⚠ `Appearance` is NOT here, and that is a decision, not an omission. That shell page was
  // theme + language, and dsh already has both — `language.title` is in its own dictionary,
  // and the theme is `@deepseek-ai/dsh-client-ui-theme`'s job. Rebuilding it would put two switches for
  // one thing on the same screen, exactly the failure measured 30/08 with two Settings places.
  //
  // dsh does NOT know the other two: a dsh account is a dsh-passwords subuser, not the address
  // the seat book grants seats to; and dsh knows nothing about sites, roles or public addresses.
  //
  // `slots.inject`, not `register` directly: the `settings.section` slot is declared by the settings package,
  // and the activation order between it and this plugin is NOT guaranteed. Registering into an undeclared
  // slot is registering into nothing — silently.
  //
  // `label` is a FUNCTION: the shell rereads labels when the ledger changes, so a precomputed string freezes
  // the label in the boot-time language.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'tracy-account',
        group: 'user',
        order: 20,
        label: () => t('account.nav'),
        inject: () => ({ t })
      },
      AccountSection
    )
  )
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'tracy-site',
        order: 25,
        label: () => t('site.nav'),
        inject: () => ({ t })
      },
      SiteSection
    )
  )
}
