/**
 * The Site changes tab (plan `tasks/todo-site-changes-v2.md` §3–§4.1, drawn in `@tracy/design` ›
 * `Mockups/Site changes V2`, approved by Brian 02/10; laid out as a vertical timeline since Akemi's
 * review of 24/10/2026): one row is one RECORDED EVENT, a dot on the line with its title and one
 * meta line, filtered by Source (`ActivityEventRow`), and the site's backups are its milestones on
 * the same line (ADR 0024, `BackupRow`): created, listed and restored here.
 *
 * Read from `GET …/activity?version=2`, one page at a time; "Show more" reads the next. A cursor goes
 * back only to the filter that cut it. Counts beside the filter are the server's, over the whole
 * list. The foot says what the list can and cannot see on this site — always, even when empty,
 * because "nothing changed" is only true for what Tracy can detect.
 */
import {
  type JSX,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Archive, ChevronDown, History, Info, Timer, TriangleAlert } from 'lucide-react'
import { Button, cn, useTabLoading } from '@tracy/ui'

import type { Translate } from '../team/translate'
import {
  type ActivityCoverage,
  type ActivityFilterV2,
  type ActivityItemV2,
  type ActivityV2,
  type BackupMay,
  type Backups,
  type Changes,
  markChangesSeen,
  readActivityV2,
  readBackups,
  readChanges,
  SiteApiError
} from './api'
import {
  ActivityEventRow,
  type AskRevertResult,
  cmsOf,
  MenuKeys,
  type OpenInTracy,
  SourceGlyph,
  sourceLabel
} from './ActivityEventRow'
import {
  CHANGES_SEEN_EVENT,
  changesSince,
  draftBackupNotes,
  isActivityV2,
  litKeys,
  rowKey,
  SOURCES,
  unreadCount
} from './activity-v2'
import { retryOnNetworkError } from './network-retry'
import {
  type BackupPoint,
  backupsOf,
  mergeTimeline,
  newestBackupVersion,
  restorePressable,
  nothingRecordedSince,
  restoreScopes,
  type TimelineEntry
} from './backup-list'
import { BackupDivider, BackupRow, backupName, backupShort, JumpMenu } from './BackupRow'
import { CreateBackupDialog } from './BackupDialogs'
import { shortAgo, type TimeWords } from './moment-list'
import { Note, type PickableSite, TabHeader } from './pieces'
import { Popover, PopoverItem, PopoverSeparator } from './Popover'
import { DownloadBackupDialog } from './DownloadBackupDialog'
import { RestoreBackupDialog } from './RestoreBackupDialog'
import { holdScroll } from './scroll-hold'
import { UndoFilesDialog } from './UndoFilesDialog'
import {
  createTurnsBook,
  onDesignSystemChanged,
  onTurnUndone,
  sameSiteKey,
  type TurnsBook
} from '../turn-undo/index.mjs'
import { interfaceLocale } from '../interface-languages/index.mjs'
import { siteNameFor } from '../site-key/index.mjs'

const PENDING_ASKS = 8
const PENDING_WAIT_MS = 4000
/**
 * A backup still being made when its press was answered: the backups are asked again this often,
 * for at most this long, until a newer one shows (#1403 item 9). The longest backup measured (a
 * 42,650-file Joomla site with its database) is well inside it.
 */
const PENDING_BACKUP_EVERY_MS = 15_000
const PENDING_BACKUP_WATCH_MS = 10 * 60_000
// Signals this close together are one change of the site, read once.
const REFRESH_SETTLE_MS = 150

/**
 * The newest page merged ahead of the pages already read: its rows first, then every row read
 * before that it does not hold, and the cursor where the older reading stopped (the door's cursor is
 * a position in time, so it still names the next page). Counts and coverage are the newest answer's.
 */
function withPagesRead(fresh: ActivityV2, shown: ActivityV2): ActivityV2 {
  const seen = new Set(fresh.items.map((i) => `${i.kind}:${i.id}`))
  return {
    ...fresh,
    items: [...fresh.items, ...shown.items.filter((i) => !seen.has(`${i.kind}:${i.id}`))],
    nextCursor: shown.nextCursor
  }
}

/** A next page under the rows on screen, without the rows a refresh already put there. */
function appendPage(shown: readonly ActivityItemV2[], page: readonly ActivityItemV2[]): ActivityItemV2[] {
  const seen = new Set(shown.map((i) => `${i.kind}:${i.id}`))
  return [...shown, ...page.filter((i) => !seen.has(`${i.kind}:${i.id}`))]
}

type Load =
  | { state: 'loading' }
  | { state: 'building' }
  | { state: 'failed'; code: string }
  | { state: 'ready'; activity: ActivityV2; filter: ActivityFilterV2 }

export function ChangesView({
  siteKey,
  role,
  sites,
  onPick,
  reloadKey = 0,
  onOpenFile,
  onAskRevert,
  onOpen,
  onUndone,
  isShown,
  now: pinnedNow,
  t
}: {
  siteKey: string
  role: string | null
  sites: PickableSite[]
  onPick: (siteKey: string) => void
  reloadKey?: number
  /** Open one file's diff in one moment. Absent means the files are not clickable. */
  onOpenFile?: (path: string, sha: string) => void
  /**
   * Send a revert request to the conversation on screen. Absent: no "Ask Tracy to revert" (a
   * surface with no chat).
   */
  onAskRevert?: (message: string) => Promise<AskRevertResult>
  /** Open a row's chat or comment inside Tracy; false or absent: a new window (W-F3). */
  onOpen?: (target: OpenInTracy) => boolean
  /**
   * A Chat row's "Undo this request" changed the site: reload the site's open previews (the plugin
   * asks each Browser tab on the site, mode `undo`). Absent: the list still reads itself again.
   */
  onUndone?: (siteKey: string) => void
  /**
   * Whether the list is on screen now. The side card keeps every tab mounted, an unpicked one hidden
   * (better-sidebar `paneTabHidden`), so a Site changes tab behind another reads its list when the
   * workspace opens — and a read is not a look (E2E dev 04/10 E9.2b: the badge went 1 → 0 unseen).
   * The watermark moves only while this says true; shown again, the pane reads again (`reloadKey`)
   * and that read moves it. Absent: always on screen (a story, a page of its own).
   */
  isShown?: () => boolean
  /** What "ago" is measured against, in milliseconds; a story pins it. */
  now?: number
  t: Translate
}): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  // A Viewer seat (ADR 0028): the `role` of this site's row in `/api/sites`. Any other value, or none
  // yet, is the list every seat sees; the server still refuses what a seat may not do.
  const readOnly = role === 'viewer'
  // The Source picked; the rows on screen may still be another Source's while its read is out. The
  // list opens on People and Tracy (Akemi 06/10/2026, door d3): automatic updates wait behind one
  // line ("N automatic updates hidden · Show"), and Show is today's full list.
  const [filter, setFilter] = useState<ActivityFilterV2>('people')
  // The undo engine's answers for the Chat rows, one read per chat (`@tracy/core/turn-undo`).
  const turnsBook = useMemo(() => createTurnsBook(), [siteKey])
  const [undoing, setUndoing] = useState<{ item: ActivityItemV2; sha: string } | null>(null)
  // Relative times follow the clock while the tab stays open (plan §2.4).
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (pinnedNow !== undefined) return
    const timer = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [pinnedNow])
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  // The rows "new since you last looked" in THIS open of the tab: every row the server flagged
  // `unseen` in any answer of this mount (`litKeys`) — the badge's own rule, so the card's number and
  // the divider's agree. They stay lit while the tab is open: the watermark moves as soon as the list
  // is drawn, and a refresh must not put out what the person has not finished reading. The next open
  // starts from the watermark this one moved. An older server flags nothing: nothing is lit.
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set())
  const seenWarned = useRef(false)
  // Read at answer time, not a dependency of `read`: a new function each render must not read again.
  const shownRef = useRef(isShown)
  shownRef.current = isShown
  /**
   * The list was looked at: move the watermark to the clock the page was read under (plan §2.4 —
   * never the browser's, a row recorded while the page loaded would be swallowed), then tell the
   * start screen's card (`tracy:changes-seen`), which drops to 0 at once. Only the full list counts
   * as looked at — All, or People and Tracy with its line naming how many automatic updates it
   * holds back — a Source filter shows part of it (plan §3).
   */
  const markSeen = useCallback(
    (readAt: string) => {
      markChangesSeen(siteKey, readAt).then(
        ({ seenAt }) =>
          window.dispatchEvent(new CustomEvent(CHANGES_SEEN_EVENT, { detail: { siteKey, seenAt } })),
        (e: unknown) => {
          // The badge just stays; said once, not on every refresh.
          if (seenWarned.current) return
          seenWarned.current = true
          console.warn('[tracy-site-tabs] Site changes: could not mark the list seen', e)
        }
      )
    },
    [siteKey]
  )
  // The site's backups (ADR 0024): `/backups` rows, read beside the list, null until answered.
  const [backupRows, setBackupRows] = useState<Backups['rows'] | null>(null)
  // The last read of the backups failed: the list says so instead of drawing none (#1403 item 9).
  const [backupsFailed, setBackupsFailed] = useState(false)
  // What this seat may restore (`/backups` `may`); null = the server did not say, the door decides.
  const [backupMay, setBackupMay] = useState<BackupMay | null>(null)
  const [restoring, setRestoring] = useState<{ backup: BackupPoint } | null>(null)
  const [downloading, setDownloading] = useState<BackupPoint | null>(null)
  // `items`: every Source's events, newest first — what the drafted notes are written from.
  const [creating, setCreating] = useState<{
    key: number
    changes: Changes | null
    items: ActivityItemV2[] | null
  } | null>(null)
  const backupsAsked = useRef(0)
  /**
   * Read the backups. A host still preparing answers 202 and is asked again a few times; a read that
   * fails leaves the list without milestones — the events still show, nothing is invented — and
   * says it could not read them, so no backup reads as never made. A 404 is a site or server with
   * no backups to list: nothing to say.
   */
  const loadBackups = useCallback(async () => {
    const mine = ++backupsAsked.current
    let failed = true
    for (let ask = 0; ask < PENDING_ASKS; ask++) {
      try {
        const answer = await retryOnNetworkError(() => readBackups(siteKey))
        if (mine === backupsAsked.current) {
          setBackupRows(answer.rows)
          setBackupMay(answer.may ?? null)
          setBackupsFailed(false)
        }
        return
      } catch (e) {
        if (e instanceof SiteApiError && e.status === 404) failed = false
        if (!(e instanceof SiteApiError && e.code === 'FLEET_JOB_PENDING')) break
        await new Promise((r) => setTimeout(r, PENDING_WAIT_MS))
      }
    }
    if (mine !== backupsAsked.current) return
    setBackupRows((prev) => prev ?? [])
    setBackupsFailed(failed)
  }, [siteKey])
  const backupsFailedNow = useRef(false)
  backupsFailedNow.current = backupsFailed
  // The newest backup on screen, read by the watch below from inside its timer.
  const newestShown = useRef(0)
  newestShown.current = newestBackupVersion(backupRows)
  const backupWatch = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(
    () => () => {
      if (backupWatch.current) clearInterval(backupWatch.current)
    },
    []
  )

  // How many times a "still working" answer is followed up before it is called a failure: each ask
  // already waits up to 45 s on the door, so this is minutes — the first snapshot of a big webroot.
  const pending = useRef(0)
  // Re-reading (another filter, a refresh after an undo) keeps the rows on screen until the answer
  // is in, so the summary and its filter do not vanish under the pointer; the tab's bar says it reads.
  const [rereading, setRereading] = useState(false)
  // Only the newest read may land: two filters picked in a row must not end on the first's rows.
  const latest = useRef(0)
  // The backups are read beside the list's first read, not after it: both doors are answered by one
  // `webroot-history` job on the host (tracy-web `history-share.js`), so asking them together costs
  // one read of the webroot, where asking them in turn cost two (7.1 s + 4.3 s on a 42,650-file
  // Joomla site, 12/10/2026). A site still being built answers both with 202, and each asks again.
  const listRead = useRef(false)
  // Pages "Show more" added under the list on screen. A refresh keeps them (and their cursor).
  const extraPages = useRef(0)
  // A read is out; a refresh asked meanwhile waits for it and runs once after (`refresh` below).
  const inFlight = useRef(false)
  const refreshQueued = useRef(false)
  const refreshRef = useRef<() => void>(() => undefined)
  // The list on screen, and the row a refresh holds in place while rows land above it.
  const listRef = useRef<HTMLDivElement>(null)
  const held = useRef<(() => void) | null>(null)
  /**
   * Read the list. `refresh`: the same list asked again because the site may have moved on (a turn
   * ended, the pane came back into view) — the newest page is merged ahead of the pages already read,
   * so nothing the person scrolled to, opened or paged in goes away.
   */
  const read = useCallback(
    async (refresh = false) => {
      const mine = ++latest.current
      inFlight.current = true
      // The list stays on screen while a read is out (BUG-L4-1: it used to fall to `loading`, so a
      // re-read blanked the pane — for minutes when Git hung). A read under ANOTHER Source keeps the
      // frame and says it reads (`ChangesList` `reading`), never the old rows.
      setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'loading' }))
      setRereading(true)
      if (!refresh) setMore('idle')
      if (!listRead.current || backupsFailedNow.current) {
        listRead.current = true
        void loadBackups()
      }
      try {
        // A network blip is asked again once before the tab says it could not reach the site.
        const answer = await retryOnNetworkError(() => readActivityV2(siteKey, { filter }))
        if (mine !== latest.current) return
        // A body of another shape is no list: said as a failed read, never drawn.
        if (!isActivityV2(answer)) throw new SiteApiError(502, 'FAILED')
        setLit((prev) => litKeys(answer.items, prev))
        if (
          (filter === 'all' || filter === 'people') &&
          typeof answer.readAt === 'string' &&
          (shownRef.current === undefined || shownRef.current())
        )
          markSeen(answer.readAt)
        const keep = refresh && extraPages.current > 0
        if (!keep) extraPages.current = 0
        if (refresh) held.current = holdScroll(listRef.current)
        setLoad((prev) =>
          keep && prev.state === 'ready' && prev.filter === filter
            ? { state: 'ready', activity: withPagesRead(answer, prev.activity), filter }
            : { state: 'ready', activity: answer, filter }
        )
        pending.current = 0
      } catch (e) {
        if (mine !== latest.current) return
        const code = e instanceof SiteApiError ? e.code : 'FAILED'
        if (code === 'FLEET_JOB_PENDING' && pending.current < PENDING_ASKS) {
          pending.current += 1
          setLoad({ state: 'building' })
          return
        }
        pending.current = 0
        setLoad({ state: 'failed', code })
      } finally {
        if (mine === latest.current) {
          setRereading(false)
          inFlight.current = false
          // A refresh asked while this read was out: the site may have moved on since it left.
          if (refreshQueued.current) {
            refreshQueued.current = false
            refreshRef.current()
          }
        }
      }
    },
    [siteKey, filter, loadBackups, markSeen]
  )
  // Another site: its own rows, lit from its first page (declared before the read effect).
  useEffect(() => {
    setLit(new Set())
    seenWarned.current = false
  }, [siteKey])
  // The follow-up lives in an effect so that leaving the tab, or switching site, cancels it.
  useEffect(() => {
    if (load.state !== 'building') return
    const timer = setTimeout(() => void read(), PENDING_WAIT_MS)
    return () => clearTimeout(timer)
  }, [load.state, read])
  useEffect(() => {
    void read()
  }, [read])
  useLayoutEffect(() => {
    held.current?.()
    held.current = null
  }, [load])

  /**
   * `reloadKey` moved: the site may have changed (a turn ended, the pane is shown again). Signals that
   * arrive together — a turn's end as the tab comes back into view — make ONE read, and never a second
   * one beside a read already out: that one runs again once it lands.
   */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  refreshRef.current = () => {
    if (refreshTimer.current !== null) return
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      if (inFlight.current) refreshQueued.current = true
      else void read(true)
    }, REFRESH_SETTLE_MS)
  }
  const seenReloadKey = useRef(reloadKey)
  useEffect(() => {
    if (reloadKey === seenReloadKey.current) return
    seenReloadKey.current = reloadKey
    refreshRef.current()
  }, [reloadKey])
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
    },
    []
  )
  // An undo pressed at another door of this site (the chat card, the preview's Undo; toolbar contract
  // §3): the list and that chat's engine answer read again, so the row says Undone without a reload.
  // An undo this list's own dialog is running is left to it (it reads again when it answers); and a
  // read never says the event again, so two doors cannot echo each other.
  useEffect(
    () =>
      onTurnUndone((detail) => {
        if (!sameSiteKey(detail.siteKey, siteKey)) return
        const entry = turnsBook.get(siteKey, detail.sessionId)
        if (entry?.undoing === true) return
        if (entry !== undefined) void turnsBook.refresh(siteKey, detail.sessionId)
        refreshRef.current()
      }),
    [siteKey, turnsBook]
  )

  // A design system put on or taken off at any door (the panel, the site browser's Undo, a row of
  // this list): the list reads again, so the row says Undone and the next apply is the one offered.
  useEffect(
    () =>
      onDesignSystemChanged((detail) => {
        if (sameSiteKey(detail.siteKey, siteKey)) refreshRef.current()
      }),
    [siteKey]
  )

  /** The next page, appended; counts and coverage follow the newest answer. */
  const readMore = async (): Promise<void> => {
    if (load.state !== 'ready' || !load.activity.nextCursor || more === 'loading') return
    setMore('loading')
    try {
      // The cursor goes back verbatim, to the filter that cut it.
      const next = await readActivityV2(siteKey, { filter: load.filter, cursor: load.activity.nextCursor })
      if (!isActivityV2(next)) throw new Error('not a list')
      setLoad((prev) =>
        prev.state === 'ready' && prev.filter === load.filter
          ? { ...prev, activity: { ...next, items: appendPage(prev.activity.items, next.items) } }
          : prev
      )
      setLit((prev) => litKeys(next.items, prev))
      extraPages.current += 1
      setMore('idle')
    } catch {
      setMore('failed')
    }
  }

  useTabLoading(load.state === 'loading' || load.state === 'building' || more === 'loading' || rereading)

  const header = (action?: JSX.Element): JSX.Element => (
    <TabHeader siteKey={siteKey} role={role} sites={sites} onPick={onPick} action={action} t={t} />
  )

  // The card's body height once the list is in, kept per site for the next open (see below).
  useLayoutEffect(() => {
    if (load.state === 'ready' && listRef.current !== null)
      // The exact height: offsetHeight rounds, and half a pixel moved the centred card by one.
      cardHeights.set(siteKey, Math.min(listRef.current.getBoundingClientRect().height, CARD_HEIGHT_CAP))
  })

  // While the first read is out, the header must never show anywhere but where the loaded card puts
  // it (14/10/2026: a bare header was centred mid-panel, then jumped when the list landed). A site
  // whose list was shown before in this page: the card at its last height, placeholder rows in the
  // body, so the centred card keeps that place. A first open, height unknown: no card at all, only
  // a quiet spinner in the middle of the panel; the card is drawn once, at its place, with the data.
  if (load.state === 'loading') {
    const height = cardHeights.get(siteKey)
    if (height === undefined) return <ChangesWaiting />
    return (
      <>
        {header(readOnly ? undefined : <CreateBackupStandIn t={t} />)}
        <ChangesSkeleton height={height} />
      </>
    )
  }
  if (load.state === 'building')
    return (
      <>
        {header()}
        <ChangesPage t={t}>
          <Note>{t('state.building')}</Note>
        </ChangesPage>
      </>
    )
  if (load.state === 'failed')
    return (
      <>
        {header()}
        <ChangesPage t={t}>
          <div className="text-muted-foreground text-sm">
            <p className="m-0">{load.code === 'NOT_SIGNED_IN' ? t('state.signedOut') : t('state.failed')}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void read()}>
              {t('action.retry')}
            </Button>
          </div>
        </ChangesPage>
      </>
    )

  const now = pinnedNow ?? tick
  const time: TimeWords = {
    ago: (iso) =>
      shortAgo(Date.parse(iso) / 1000, now, {
        justNow: t('ago.justNow'),
        minutes: (count: number) => t('ago.short.minutes', { count }),
        hours: (count: number) => t('ago.short.hours', { count }),
        days: (count: number) => t('ago.short.days', { count })
      }),
    absolute: (iso) =>
      new Date(iso).toLocaleString(interfaceLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        // The zone is part of the moment (plan §2.4): a hover read across offices names whose clock.
        timeZoneName: 'short'
      })
  }
  /** Create a backup opens first and drafts its notes after (reading changes walks the webroot). */
  const openBackupDialog = (): void => {
    if (creating !== null) return
    const key = Date.now()
    // The notes are drafted from the list's own words (Brian 02/10): the events on screen when they
    // are every Source's, else one read of the whole list. `/changes` only gives the next number.
    const onScreen = load.filter === 'all' ? load.activity.items : null
    setCreating({ key, changes: null, items: onScreen })
    void readChanges(siteKey)
      .then((changes) => setCreating((c) => (c !== null && c.key === key ? { ...c, changes } : c)))
      .catch(() => undefined)
    if (onScreen === null)
      void readActivityV2(siteKey, { filter: 'all' })
        .then((answer) =>
          setCreating((c) =>
            c !== null && c.key === key ? { ...c, items: isActivityV2(answer) ? answer.items : [] } : c
          )
        )
        .catch(() => setCreating((c) => (c !== null && c.key === key ? { ...c, items: [] } : c)))
  }

  const fileHistory = load.activity.coverage.fileHistory !== false
  const backups = backupRows === null ? [] : backupsOf(backupRows, { fileHistory })
  const latestBackup = backups[0] ?? null
  // What a new backup would keep: the events since the newest backup. It takes BOTH answers — the
  // events and the backups. Pressed while `/backups` is still out (~2.5 s on a stand), the newest
  // backup read as none: the notes were drafted "since the start", counted and numbered from there,
  // and kept once the backups landed (REG-018, 03/10). Null until both are in.
  const sinceLatest =
    creating !== null && creating.items !== null && backupRows !== null
      ? changesSince(creating.items, latestBackup)
      : null
  // Nothing RECORDED since the newest backup: read on the whole list only (a Source filter hides
  // events). It only words the hover — the button stays live (QA-I04/I07, 02/10): the database
  // changes without a row (orders, comments, a CLI write), so "nothing new" cannot be known here.
  const nothingRecorded =
    filter === 'all' &&
    backupRows !== null &&
    latestBackup !== null &&
    nothingRecordedSince(mergeTimeline(load.activity.items, backups, { filter: 'all', complete: true }))
  const createBackup = (
    <Button
      type="button"
      size="sm"
      title={
        nothingRecorded && latestBackup
          ? t('backup.nothingRecorded', { name: backupShort(latestBackup, t) })
          : undefined
      }
      onClick={openBackupDialog}
      data-create-backup
    >
      <Archive aria-hidden="true" />
      {t('backup.create')}
    </Button>
  )
  const afterRestore = (): void => {
    void read()
    void loadBackups()
  }
  /** Ask for the backups again until one newer than those on screen shows, or the watch runs out. */
  const watchPendingBackup = (): void => {
    const before = newestShown.current
    const until = Date.now() + PENDING_BACKUP_WATCH_MS
    if (backupWatch.current) clearInterval(backupWatch.current)
    backupWatch.current = setInterval(() => {
      if (newestShown.current > before || Date.now() > until) {
        if (backupWatch.current) clearInterval(backupWatch.current)
        backupWatch.current = null
        if (newestShown.current > before) void read(true)
        return
      }
      void loadBackups()
    }, PENDING_BACKUP_EVERY_MS)
  }
  return (
    <>
      {/* A Viewer seat (ADR 0028) changes nothing: no Create a backup, and no Undo, Restore or Ask
          Tracy to revert on any row. Hidden, never a button the door then refuses. */}
      {header(readOnly ? undefined : createBackup)}
      <ChangesPage t={t}>
        <ChangesList
          listRef={listRef}
          readOnly={readOnly}
          backups={backups}
          backupsFailed={backupsFailed}
          backupMay={backupMay}
          onRestoreBackup={(backup) => setRestoring({ backup })}
          onDownloadBackup={setDownloading}
          siteKey={siteKey}
          activity={load.activity}
          filter={filter}
          lit={lit}
          // The Source just picked is not what these rows were read under: they are not shown.
          reading={filter !== load.filter}
          onFilter={setFilter}
          opened={opened}
          setOpened={setOpened}
          time={time}
          more={more}
          onMore={() => void readMore()}
          onUndo={(item, sha) => setUndoing({ item, sha })}
          onOpenFile={onOpenFile}
          onAskRevert={readOnly ? undefined : onAskRevert}
          onOpen={onOpen}
          turnsBook={turnsBook}
          onUndone={(changed) => {
            void read()
            if (changed) onUndone?.(siteKey)
          }}
          t={t}
        />
      </ChangesPage>
      {undoing !== null && (
        <UndoFilesDialog
          siteKey={siteKey}
          item={undoing.item}
          sha={undoing.sha}
          onClose={() => setUndoing(null)}
          onSettled={() => void read()}
          t={t}
        />
      )}
      {creating !== null && (
        <CreateBackupDialog
          key={creating.key}
          siteKey={siteKey}
          siteName={siteNameFor(sites, siteKey)}
          nextNumber={
            // The number comes from the backups: none before they answer.
            backupRows === null
              ? null
              : latestBackup !== null
                ? latestBackup.version + 1
                : creating.changes
                  ? (creating.changes.since?.version ?? 0) + 1
                  : null
          }
          since={latestBackup ? backupShort(latestBackup, t) : t('changes.sinceStart')}
          changes={sinceLatest?.length ?? 0}
          draftPending={sinceLatest === null}
          draft={sinceLatest === null ? '' : draftBackupNotes(sinceLatest, t)}
          onClose={() => setCreating(null)}
          onMade={() => {
            void read()
            void loadBackups()
          }}
          onPending={watchPendingBackup}
          t={t}
        />
      )}
      {downloading !== null && (
        <DownloadBackupDialog
          siteKey={siteKey}
          backup={downloading}
          time={time}
          onClose={() => setDownloading(null)}
          t={t}
        />
      )}
      {restoring !== null && (
        <RestoreBackupDialog
          siteKey={siteKey}
          siteName={siteNameFor(sites, siteKey)}
          backup={restoring.backup}
          name={backupName(restoring.backup, t)}
          scopes={restoreScopes(restoring.backup, { fileHistory, may: backupMay })}
          time={time}
          onClose={() => setRestoring(null)}
          onDone={afterRestore}
          t={t}
        />
      )}
    </>
  )
}

/**
 * The page under the tab header: the Publish and Team page shell (24/10/2026), full panel width,
 * left-aligned, with a 20px title and a muted lead line (`tas-wizard-*`; gutters in
 * `.tv-changes-page` of site-tabs-rules.css).
 */
function ChangesPage({ t, children }: { t: Translate; children: ReactNode }): JSX.Element {
  return (
    <div className="tv-changes-page" data-changes-page="">
      <div className="tas-wizard-head">
        <h2 className="tas-wizard-title">{t('tab.changes')}</h2>
        <p className="tas-wizard-desc">{t('changes.lead')}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

/**
 * The foot of the list: what the tab can and cannot see on THIS site — the Git cap, a file history
 * that could not be read, since when turns carry the words typed, and the CMS admin log.
 */
function Coverage({
  coverage,
  time,
  t
}: {
  coverage: ActivityCoverage
  time: TimeWords
  t: Translate
}): JSX.Element {
  const log = coverage.cmsLog
  const cms = log ? cmsOf(null, coverage) : null
  // A site with no file history (EmDash) names what the list cannot see in one block (mockup).
  const limitsBlock = coverage.fileHistory === false
  // A CMS whose own log leaves things out (EmDash 1.0.1: menus, settings, media) says so in the same
  // line that says what it tracks, instead of promising every admin edit (dev round 02/10) — unless
  // the block above already said it.
  const partial = (log?.limits?.length ?? 0) > 0 && !limitsBlock
  return (
    <div className="tv-activity-coverage" data-coverage>
      {limitsBlock && (
        <CoverageLine
          icon={TriangleAlert}
          warn
          title={t('event.limitsTitle', { cms: cms ?? 'CMS' })}
          hint={
            (log?.limits?.length ?? 0) > 0
              ? t('event.limitsBody', { cms: cms ?? 'CMS' })
              : t('event.limitsBodyFiles', { cms: cms ?? 'CMS' })
          }
        />
      )}
      {coverage.gitTruncated === true && (
        <CoverageLine icon={History} title={t('activity.older')} hint={t('activity.olderHint')} />
      )}
      {coverage.git === 'failed' && (
        <CoverageLine icon={TriangleAlert} warn title={t('activity.gitFailed')} />
      )}
      {coverage.since !== null && (
        <CoverageLine
          icon={Info}
          plain={t('activity.since', {
            date: new Date(coverage.since).toLocaleDateString(interfaceLocale(), {
              month: 'short',
              day: 'numeric'
            })
          })}
        />
      )}
      {log !== null &&
        cms !== null &&
        (log.enabled === false ? (
          <CoverageLine
            icon={TriangleAlert}
            warn
            title={t('activity.cmsNotTracked', { cms })}
            hint={t('activity.cmsNotTrackedHint')}
          />
        ) : log.lastError !== null ? (
          <CoverageLine icon={TriangleAlert} warn plain={t('activity.cmsFailed', { cms })} />
        ) : log.enabled === true ? (
          <CoverageLine
            icon={Info}
            plain={
              log.lastPulledAt
                ? t(partial ? 'activity.cmsCheckedPartial' : 'activity.cmsChecked', {
                    cms,
                    ago: time.ago(log.lastPulledAt)
                  })
                : t(partial ? 'activity.cmsTrackedPartial' : 'activity.cmsTracked', { cms })
            }
          />
        ) : (
          <CoverageLine
            icon={Info}
            plain={t(partial ? 'activity.cmsPendingPartial' : 'activity.cmsPending', { cms })}
          />
        ))}
    </div>
  )
}

function CoverageLine({
  icon: Icon,
  title,
  hint,
  plain,
  warn = false
}: {
  icon: typeof Info
  title?: string
  hint?: string
  plain?: string
  warn?: boolean
}): JSX.Element {
  return (
    <div className="tv-activity-coverage-line">
      <Icon className={cn('tv-activity-coverage-icon', warn && 'text-amber-500')} aria-hidden="true" />
      <div>
        {title !== undefined && <p className="tv-activity-coverage-title">{title}</p>}
        {hint !== undefined && <p className="tv-activity-coverage-hint">{hint}</p>}
        {plain !== undefined && <p className="tv-activity-coverage-hint">{plain}</p>}
      </div>
    </div>
  )
}

const FLASH_MS = 1200

/** Timeline entries split into calendar days of the viewer's clock; an undated entry joins the day above. */
function timelineDays(
  entries: readonly TimelineEntry[],
  label: (day: Date) => string
): { key: string; label: string; entries: TimelineEntry[]; onlyDividers: boolean }[] {
  const days: { key: string; label: string; entries: TimelineEntry[]; onlyDividers: boolean }[] = []
  for (const e of entries) {
    const at = e.at === null ? null : new Date(e.at * 1000)
    const key = at ? `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}` : null
    const last = days[days.length - 1]
    if (last && (key === null || last.key === key)) last.entries.push(e)
    else
      days.push({
        key: key ?? `none-${days.length}`,
        label: at ? label(at) : '',
        entries: [e],
        onlyDividers: true
      })
  }
  for (const d of days) d.onlyDividers = d.entries.every((e) => e.kind === 'backup' && e.as === 'divider')
  return days
}

/**
 * The list: the server's total for the Source picked, the Source filter, events and backups by day
 * on one vertical timeline, and the coverage foot. A size container: the pane's width, not the
 * window's, decides where a row's actions sit (beside it, or under its meta line).
 */
function ChangesList({
  listRef,
  siteKey,
  activity,
  filter,
  reading,
  onFilter,
  opened,
  setOpened,
  time,
  more,
  onMore,
  onUndo,
  onOpenFile,
  backups,
  backupsFailed = false,
  backupMay,
  onRestoreBackup,
  onDownloadBackup,
  onAskRevert,
  onOpen,
  lit,
  turnsBook,
  onUndone,
  readOnly = false,
  t
}: {
  /** The list's root, read by a refresh to hold the scroll (`holdScroll`). */
  listRef?: RefObject<HTMLDivElement | null>
  /** A Viewer seat (ADR 0028): rows show what happened, nothing that changes the site again. */
  readOnly?: boolean
  siteKey: string
  activity: ActivityV2
  filter: ActivityFilterV2
  /** The rows lit as "new since you last looked" (`litKeys`), by `rowKey`; empty → nothing is lit. */
  lit: ReadonlySet<string>
  /** A read under `filter` is out and `activity` was read under another: show that, not its rows. */
  reading: boolean
  onFilter: (f: ActivityFilterV2) => void
  opened: ReadonlySet<string>
  setOpened: (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void
  time: TimeWords
  more: 'idle' | 'loading' | 'failed'
  onMore: () => void
  onUndo: (item: ActivityItemV2, sha: string) => void
  onOpenFile?: (path: string, sha: string) => void
  /** The site's backups (ADR 0024), the milestones of this list; empty where none were read. */
  backups: readonly BackupPoint[]
  /** The last read of the backups failed: `backups` is empty for that, not for want of any. */
  backupsFailed?: boolean
  /** What this seat may restore; null when the server did not say (every verb offered). */
  backupMay: BackupMay | null
  onRestoreBackup: (backup: BackupPoint) => void
  /** Download… on a backup (Owner only; the row decides whether to offer it). */
  onDownloadBackup?: (backup: BackupPoint) => void
  onAskRevert?: (message: string) => Promise<AskRevertResult>
  onOpen?: (target: OpenInTracy) => boolean
  turnsBook?: TurnsBook
  onUndone?: (changed: boolean) => void
  t: Translate
}): JSX.Element {
  const { counts, items, coverage } = activity
  const fileHistory = coverage.fileHistory !== false
  const nothing =
    counts.all === 0 && backups.length === 0 && (filter === 'all' || filter === 'people') && !reading
  const hiddenAutomatic = filter === 'people' ? (counts.automatic ?? 0) : 0
  const shown =
    filter === 'all' ? counts.all : filter === 'people' ? counts.all - hiddenAutomatic : (counts[filter] ?? 0)
  // Events and backups in one line; a backup has no Source and is not counted (ADR 0024).
  const timeline = mergeTimeline(items, backups, {
    filter,
    complete: activity.nextCursor === null,
    hidden: hiddenAutomatic
  })
  // Changes once per read of the list: an opened Chat row asks the undo engine again with it.
  const turnsSignal = activity.readAt ?? ''
  const days = timelineDays(timeline, (day) =>
    day.toLocaleDateString(interfaceLocale(), { weekday: 'short', month: 'short', day: 'numeric' })
  )
  // Jump to backup lists every backup the list holds: its own rows and dividers, and the
  // Before-restore points folded into their restore rows (still a backup to go back to).
  const shownBackups = timeline
    .flatMap((e) => (e.kind === 'backup' ? [e.backup] : e.returnPoint ? [e.returnPoint] : []))
    .sort((a, b) => b.version - a.version)
  const [flash, setFlash] = useState<number | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), [])
  /** Jump to backup: bring it (row or divider) into view and light it for a moment. */
  const jumpTo = (version: number): void => {
    requestAnimationFrame(() =>
      document
        .querySelector(
          `[data-backup="${version}"], [data-backup-divider="${version}"], [data-return-point-of="${version}"]`
        )
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    )
    setFlash(version)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
  }
  const key = (item: ActivityItemV2): string => `${item.kind}:${item.id}`
  const toggle = (k: string): void =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  /** Open an event this list holds and bring it into view (an undo's target, an event's undo). */
  const show = (id: string): void => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setOpened((prev) => new Set(prev).add(key(item)))
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-event="${CSS.escape(id)}"]`)
      row?.scrollIntoView({ block: 'center' })
      row?.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true })
    })
  }
  const cms = cmsOf(null, coverage)
  // "N new since you last looked": ONE divider, drawn before the first entry after the new rows (rows
  // are newest first; a backup made after them ends them too), or after the last row when every row
  // is new. N is the badge's own number when the server says it (`unseenCount`: one upgrade run of three rows is
  // one thing, as on the card); the lit rows of this page otherwise (an older server).
  const unread = typeof activity.unseenCount === 'number' ? activity.unseenCount : unreadCount(items, lit)
  let dividerDrawn = false
  const newDivider = (
    <li key="new-divider" className="tv-activity-new-divider" data-new-divider aria-hidden="true">
      <span className="tv-activity-new-divider-rule" />
      <span className="tv-activity-new-divider-text">{t('changes.newSince', { count: unread })}</span>
      <span className="tv-activity-new-divider-rule" />
    </li>
  )
  /** One timeline entry as its row: a backup (row or divider) or an event. */
  const renderEntry = (entry: (typeof timeline)[number]): JSX.Element =>
    entry.kind === 'backup' ? (
      entry.as === 'divider' ? (
        <BackupDivider
          key={`backup:${entry.backup.version}`}
          backup={entry.backup}
          flash={flash === entry.backup.version}
          t={t}
        />
      ) : (
        <BackupRow
          key={`backup:${entry.backup.version}`}
          backup={entry.backup}
          changes={entry.changes}
          open={opened.has(`backup:${entry.backup.version}`)}
          flash={flash === entry.backup.version}
          fileHistory={fileHistory}
          may={backupMay}
          time={time}
          onToggle={() => toggle(`backup:${entry.backup.version}`)}
          onRestore={onRestoreBackup}
          onDownload={onDownloadBackup}
          readOnly={readOnly}
          t={t}
        />
      )
    ) : (
      <ActivityEventRow
        key={key(entry.item)}
        siteKey={siteKey}
        item={entry.item}
        items={items}
        coverage={coverage}
        open={opened.has(key(entry.item))}
        time={time}
        onToggle={() => toggle(key(entry.item))}
        onUndo={onUndo}
        onShow={show}
        onOpenFile={onOpenFile}
        onAskRevert={onAskRevert}
        onOpen={onOpen}
        returnPoint={
          entry.returnPoint
            ? {
                backup: entry.returnPoint,
                pressable: restorePressable(entry.returnPoint, {
                  fileHistory,
                  may: backupMay
                })
              }
            : null
        }
        onRestoreBackup={onRestoreBackup}
        turnsBook={turnsBook}
        turnsSignal={turnsSignal}
        onUndone={onUndone}
        readOnly={readOnly}
        unread={lit.has(rowKey(entry.item))}
        flash={entry.returnPoint !== undefined && flash === entry.returnPoint.version}
        t={t}
      />
    )
  const hint = counts.complete
    ? null
    : counts.reasons.map((r) => t(`event.reason.${r}`, { cms })).join(' ') || t('event.reason.unknown')
  return (
    <div ref={listRef} className="tv-activity-v2" data-site-changes-v2>
      {/* Above everything, the empty list included: without it a failed read looked like a site
          that never had a backup — the Initial backup included. */}
      {backupsFailed && (
        <div className="tv-backups-failed" role="status" data-backups-failed>
          <CoverageLine icon={TriangleAlert} warn plain={t('backup.readFailed')} />
        </div>
      )}
      {nothing ? (
        <Note>{t('event.empty')}</Note>
      ) : (
        <>
          <div className="tv-changes-summary">
            <span className="tv-activity-total" data-total>
              {t(
                `event.${filter === 'people' ? 'totalPeople' : 'total'}${counts.complete ? '' : 'AtLeast'}.${shown === 1 ? 'one' : 'many'}`,
                { count: shown }
              )}
              {hint !== null && (
                <button type="button" className="tv-activity-hint" aria-label={hint} data-hint={hint}>
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
            <span className="tv-changes-tools">
              {shownBackups.length > 0 && <JumpMenu backups={shownBackups} onPick={jumpTo} t={t} />}
              <SourceFilter filter={filter} counts={counts} onPick={onFilter} t={t} />
            </span>
          </div>
          {reading ? (
            // Counts are over the whole list, so the total above is already right for this Source;
            // the rows are not, and an empty pane would read as "nothing here".
            <div className="tv-activity-reading" role="status" aria-busy="true" data-reading>
              {t('event.reading', { source: filterLabel(filter, t) })}
            </div>
          ) : timeline.length === 0 ? (
            <>
              <Note>{t('activity.emptyFilter')}</Note>
              {hiddenAutomatic > 0 && (
                <HiddenAutomatic count={hiddenAutomatic} onShow={() => onFilter('all')} t={t} />
              )}
            </>
          ) : (
            <div className="tv-moment-list">
              {/* Nothing under this Source, but its backups still frame the time (ADR 0024). */}
              {items.length === 0 && <Note>{t('activity.emptyFilter')}</Note>}
              {/* What People and Tracy holds back, above the rows it was taken from. */}
              {hiddenAutomatic > 0 && (
                <HiddenAutomatic count={hiddenAutomatic} onShow={() => onFilter('all')} t={t} />
              )}
              {days.map((day, dayIndex) => (
                <section key={day.key} aria-label={day.label || undefined}>
                  {/* A day of folded backups only needs no heading: the divider names its day. */}
                  {day.label && !day.onlyDividers && <h3 className="tv-moment-day">{day.label}</h3>}
                  <ol className="m-0 list-none p-0">
                    {day.entries.flatMap((entry) => {
                      const row = renderEntry(entry)
                      // The new rows end at the next entry of any kind, so a backup made after them is
                      // never drawn above the line that closes them.
                      if (
                        unread === 0 ||
                        dividerDrawn ||
                        (entry.kind === 'event' && lit.has(rowKey(entry.item)))
                      )
                        return [row]
                      dividerDrawn = true
                      return [newDivider, row]
                    })}
                    {unread > 0 && !dividerDrawn && dayIndex === days.length - 1 && newDivider}
                  </ol>
                </section>
              ))}
              {activity.nextCursor !== null && (
                <div className="tv-activity-more">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={more === 'loading'}
                    onClick={onMore}
                  >
                    {more === 'loading' ? t('activity.moreLoading') : t('activity.more')}
                  </Button>
                  {more === 'failed' && (
                    <span className="tv-activity-more-failed">{t('activity.moreFailed')}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Coverage coverage={coverage} time={time} t={t} />
    </div>
  )
}

/** A filter's name: People and Tracy, All, or one Source. */
const filterLabel = (filter: ActivityFilterV2, t: Translate): string =>
  filter === 'all'
    ? t('event.filterAll')
    : filter === 'people'
      ? t('event.filterPeople')
      : sourceLabel(filter, t)

/** Body heights of Site changes cards already shown in this page, by site key. */
const cardHeights = new Map<string, number>()
/** A list taller than any panel starts at the top anyway: no need to remember more. */
const CARD_HEIGHT_CAP = 4000

/**
 * The first read of a Site changes list never shown in this page: no card yet, only a small spinner
 * in the middle of the panel (the bar under the tab strip stays the tab's one named loading signal,
 * so the spinner itself is hidden from screen readers). It fades in after the bar's 250 ms wait. A
 * CSS ring, not @tracy/ui's Spinner: importing it here changed the bundle of every plugin that
 * reads @tracy/core/site-tabs.
 */
function ChangesWaiting(): JSX.Element {
  return (
    <div className="tv-changes-waiting" data-changes-loading="none" aria-busy="true">
      <span className="tv-changes-waiting-spinner" aria-hidden="true" />
    </div>
  )
}

/**
 * The card body while a Site changes list shown before in this page is read again: grey bars in
 * the shape of the summary line and a few rows, no words, at `height` (the border-box height the
 * list's body had last time). Hidden from screen readers, which hear the tab's loading bar instead.
 */
function ChangesSkeleton({ height }: { height: number }): JSX.Element {
  return (
    <div
      className="tv-changes-skeleton"
      data-changes-loading="sized"
      aria-hidden="true"
      style={{ height, boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <span className="tv-skeleton-bar tv-skeleton-summary" />
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="tv-skeleton-row">
          <span className="tv-skeleton-bar tv-skeleton-line" />
          <span className="tv-skeleton-bar tv-skeleton-meta" />
        </div>
      ))}
    </div>
  )
}

/**
 * Create a backup's footprint in the header while the list loads: the same button, invisible and
 * inert, so the header is as tall as it will be and the centred card does not shift by its height.
 */
function CreateBackupStandIn({ t }: { t: Translate }): JSX.Element {
  return (
    <Button type="button" size="sm" disabled tabIndex={-1} aria-hidden="true" className="invisible">
      <Archive aria-hidden="true" />
      {t('backup.create')}
    </Button>
  )
}

/**
 * "4 automatic updates hidden · Show" (door d3; the approved "(plugin and theme updates)" is left out:
 * `counts.automatic` also counts cron content changes, so it could be false): what People and Tracy
 * holds back, counted by the server over the whole list; Show is the full list (Type: All).
 */
function HiddenAutomatic({
  count,
  onShow,
  t
}: {
  count: number
  onShow: () => void
  t: Translate
}): JSX.Element {
  return (
    <p className="tv-activity-hidden" data-hidden-automatic={count}>
      <Timer className="tv-activity-glyph" aria-hidden="true" />
      <span>{t(`event.hiddenAutomatic.${count === 1 ? 'one' : 'many'}`, { count })}</span>
      <span aria-hidden="true">·</span>
      <button type="button" className="tv-moment-link" onClick={onShow} data-show-automatic>
        {t('event.hiddenAutomaticShow')}
      </button>
    </p>
  )
}

/** `Type: People and Tracy ▾` — People and Tracy, All, then ten Sources with their icon and the server's count; a floor reads "N+". */
function SourceFilter({
  filter,
  counts,
  onPick,
  t
}: {
  filter: ActivityFilterV2
  counts: ActivityV2['counts']
  onPick: (f: ActivityFilterV2) => void
  t: Translate
}): JSX.Element {
  const pill = (n: number): string => (counts.complete ? String(n) : `${n}+`)
  return (
    <Popover
      align="end"
      className="min-w-52"
      anchorClassName="tv-changes-filter-anchor"
      trigger={(props) => (
        <button type="button" className="tv-changes-filter tv-activity-filter" {...props}>
          {filter !== 'all' && filter !== 'people' && <SourceGlyph source={filter} />}
          {t('event.filter', { source: filterLabel(filter, t) })}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      <MenuKeys>
        <PopoverItem selected={filter === 'people'} onClick={() => onPick('people')}>
          <span className="flex-1" data-label>
            {t('event.filterPeople')}
          </span>
          <span className="tv-count-pill">{pill(counts.all - (counts.automatic ?? 0))}</span>
        </PopoverItem>
        <PopoverItem selected={filter === 'all'} onClick={() => onPick('all')}>
          <span className="flex-1" data-label>
            {t('event.filterAll')}
          </span>
          <span className="tv-count-pill">{pill(counts.all)}</span>
        </PopoverItem>
        <PopoverSeparator />
        {SOURCES.map((s) => (
          <PopoverItem
            key={s}
            selected={s === filter}
            disabled={(counts[s] ?? 0) === 0 && s !== filter}
            onClick={() => onPick(s)}
          >
            <SourceGlyph source={s} />
            <span className="flex-1" data-label>
              {sourceLabel(s, t)}
            </span>
            <span className="tv-count-pill">{pill(counts[s] ?? 0)}</span>
          </PopoverItem>
        ))}
      </MenuKeys>
    </Popover>
  )
}
