/**
 * The drawing behind `site-changes-v2.mock.stories.tsx`: Site changes V2 (plan
 * `tasks/todo-site-changes-v2.md` §2, §3, §4.3, P1). Every row answers four things on one line —
 * what changed, when, by which path, by whom — as four columns `Description · Time · Type · By`
 * (the third column and its filter read `Source` until Brian renamed them `Type` on 03/10/2026).
 *
 * GROWN FROM V1, NOT REDRAWN. The header (`TabHeader`, real), the `Popover` filter, day groups, a
 * row that opens in place and the "…" menu are V1's (`./site-changes-turns.tsx`, itself the port of
 * the running `ActivityRow`). What V2 changes, and why it is drawn here:
 *   - The row's unit is ONE RECORDED EVENT. V1 folded back-to-back CMS admin edits of one user into
 *     one row; V2 keeps each edit on its own row unless a correlation id joins them (§4.3), so one
 *     Description and one Time never stand for several actions.
 *   - Type is one of seven values, always text + icon (never colour alone); By is a Tracy seat
 *     (round avatar), a CMS account (square tile with the CMS letter), a service (square tile with
 *     a cog), or Unknown (dashed circle). Two identities from two systems never look alike.
 *   - The Description says the RESULT when it is known; otherwise it says so (`Request`, `Content
 *     change recorded`, `Files changed; source unknown`). The request itself lives in the detail.
 *   - Undo is `Undo file changes…`: the dialog counts the files of the TARGET COMMIT and names what
 *     it does not undo. A partly undone row reads `Files undone · Content changes not undone by this
 *     action` — the Description is never struck through.
 *   - Responsive by CONTAINER, not viewport: the tab is a pane inside dsh, so a 1440px window can
 *     hold a 360px pane. Under 640px of pane the three attributes fold into a labelled metadata line.
 *   - Mode A: utilities here become `tv-*` rules in `tracy-site-tabs` when ported (DESIGN.md §0).
 *   - Strings are inline English in `S` so the port can move them to `strings.ts` + `vi`.
 */
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Archive,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  Cog,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  History,
  Info,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  PanelsTopLeft,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  Users
} from 'lucide-react'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'
import {
  ActorFace,
  Note,
  type PickableSite,
  Popover,
  PopoverItem,
  PopoverSeparator,
  TabHeader,
  ZONE_ORDER
} from '@tracy/core/site-tabs'

import { en as siteTabsEn } from '../../../../site/tracy-site-tabs/src/client/strings'

// ---------------------------------------------------------------------------------------------
// The shape this drawing assumes: the plan's proposed V2 event (§4.1). P2 settles the real names;
// this is the proposal made visible, not a contract.
// ---------------------------------------------------------------------------------------------

/** The path that made the change (§2.1). The UI value, not `site_cms_change.source`. */
export type SourceKind =
  | 'chat'
  | 'comment'
  | 'cms-admin'
  | 'automatic'
  | 'deployment'
  | 'site-changes'
  | 'unknown'

export const SOURCES: readonly SourceKind[] = [
  'chat',
  'comment',
  'cms-admin',
  'automatic',
  'deployment',
  'site-changes',
  'unknown'
]

export type CmsName = 'WordPress' | 'Joomla' | 'EmDash'

/** Who the By column names (§2.2). Each kind is drawn differently, on purpose. */
export type By =
  | { kind: 'seat'; name: string; email: string }
  | { kind: 'cms'; cms: CmsName; name: string; id: string }
  | { kind: 'service'; name: string; detail?: string }
  | { kind: 'unknown' }

export interface Person {
  name: string
  email: string
}

export interface FileChange {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number | null
  deletions: number | null
  zone: string
}

/** One recorded action on a resource. `title` only when the CMS or trusted metadata stored it (§2.3). */
export interface Action {
  op: 'Updated' | 'Created' | 'Published' | 'Deleted' | 'Uploaded' | 'Changed'
  /** Resource type in words: "page", "article", "setting", "plugin". */
  type: string
  id: string | null
  title: string | null
  fields?: string[]
  /** `unknown`: the reply was lost after the CMS may have written (V1 §3.7). */
  outcome: 'ok' | 'unknown'
}

/** One Git moment the event made; Undo targets exactly one of these (§3.3). */
export interface Moment {
  sha: string
  files: FileChange[]
  /** Set once an Undo of this moment succeeded; carries the undo event's id. */
  undoneBy?: string
}

/** What this site's CMS lets the tab see (§3.2): untracked ≠ unchanged. */
export type Tracking = 'tracked' | 'untracked'

export interface ChangeEvent {
  id: string
  source: SourceKind
  by: By
  /** The result, or — when only the request is known — the request, labelled as such. */
  description: { kind: 'result' | 'request'; text: string }
  time: { basis: 'occurred' | 'detected'; at: number; finishedAt?: number }
  /** Who applied it, when not the requester (Chat/Comment: Tracy). */
  appliedBy?: string
  request?: { text: string; completeness: 'complete' | 'incomplete' | 'unknown' }
  comment?: { where: string; href: string; author: Person }
  cms?: CmsName
  content: Action[]
  settings: Action[]
  other: Action[]
  /** `null` when the CMS has no file history (EmDash): never drawn as "0 files". */
  moments: Moment[] | null
  /** Per-area tracking for this site; an untracked area says so instead of counting zero. */
  tracking?: { files?: Tracking; settings?: Tracking; media?: Tracking }
  /** For a Site changes event: the event and moment it undid. */
  target?: { eventId: string; sha: string; files: number }
  /** Deployment: the cause and tag the resync recorded; the person who started it, if proven. */
  deployment?: { cause: string; tag: string; startedBy: string | null }
  technical: { label: string; value: string }[]
  /** Server's answer: can the viewer undo files here, and why not. */
  undo: { allowed: boolean; reason?: 'not-tracy' | 'no-files' | 'forbidden' | 'untracked' }
  flags?: { concurrent?: boolean }
}

export interface ActivityV2 {
  since: { version: number | null }
  counts: {
    /** Events per Source, counted on the server over the same set the list pages through. */
    bySource: Record<SourceKind, number>
    complete: boolean
    /** Why the counts are a floor, in words the foot repeats. */
    incompleteReason?: 'git-truncated' | 'collector-missing'
  }
  items: ChangeEvent[]
  coverage: {
    cms: CmsName
    gitTruncated: boolean
    /** EmDash: no file history, and admin log without menus/settings/media. */
    emdashLimits?: boolean
    cmsAdmin: { since: string } | null
  }
}

// ---------------------------------------------------------------------------------------------
// Words. English, per `docs/references/vocabulary.md`; new ones listed in
// `tasks/evidence/site-changes-v2/P1/vocabulary-proposal.md`.
// ---------------------------------------------------------------------------------------------

export const SOURCE_LABEL: Record<SourceKind, string> = {
  chat: 'Chat',
  comment: 'Comment',
  'cms-admin': 'CMS admin',
  automatic: 'Automatic',
  deployment: 'Tracy update',
  'site-changes': 'Restore',
  unknown: 'Unknown'
}

const SOURCE_ICON: Record<SourceKind, typeof MessageSquare> = {
  chat: MessageSquare,
  comment: MessageSquareText,
  'cms-admin': PanelsTopLeft,
  automatic: Timer,
  deployment: CloudUpload,
  'site-changes': History,
  unknown: CircleHelp
}

export const S = {
  // Create release until ADR 0024 amendment 2 (03/10/2026); the real button reads `backup.create`.
  createBackup: 'Create a backup',
  nothingNew: (v: string) => `Nothing new since ${v}`,
  empty: (v: string) => `Nothing has been recorded since ${v}.`,
  total: (n: number, complete: boolean, v: string) =>
    `${complete ? '' : 'At least '}${n} recorded ${n === 1 ? 'event' : 'events'} since ${v}`,
  totalHint: {
    'git-truncated': 'The file history stops at the newest 200 moments, so older events are not counted.',
    'collector-missing': 'One source could not be read just now, so its events are not counted.'
  },
  // The column and its filter read `Type` since Brian 03/10/2026 (were `Source`).
  sourceFilter: (label: string) => `Type: ${label}`,
  all: 'All',
  col: { description: 'Description', time: 'Time', source: 'Type', by: 'By' },
  detected: (ago: string) => `Detected ${ago}`,
  unknown: 'Unknown',
  requestChip: 'Request',
  // Row status lines (§3.3).
  partlyUndone: 'Files undone · Content changes not undone by this action',
  filesUndone: 'File changes undone',
  // Detail.
  requestedBy: 'Requested by',
  appliedBy: 'Applied by',
  commentBy: 'Comment by',
  openComment: 'Open comment',
  onPage: (where: string) => `on ${where}`,
  cmsAccount: (cms: CmsName, name: string, id: string) => `${cms} account ${name} (ID ${id})`,
  cmsNotSeat: 'A CMS account, not linked to a seat on Tracy.',
  automaticBy: (who: string, detail?: string) => `${who}${detail ? ` · ${detail}` : ''}`,
  automaticProof: 'Recorded by the WordPress hook while WP-Cron was running, so no person started it.',
  deployBy: 'Tracy deploy',
  deployTag: (cause: string, tag: string) => `Cause ${cause} · tag ${tag}`,
  deployStartedBy: 'Started by',
  unknownSource: 'Tracy could not tell how this change was made or by whom.',
  siteChangesNote: (who: string) => `${who} pressed Undo file changes in Site changes.`,
  undidTarget: 'Undid',
  goToTarget: 'Show the event',
  timeOccurred: (abs: string) => `Happened ${abs}`,
  timeFinished: (abs: string) => `Finished ${abs}`,
  timeDetected: (abs: string) => `Detected ${abs}, when the site was checked. When it happened is not known.`,
  requestTitle: 'Request',
  requestIncomplete: 'Original request incomplete',
  requestIncompleteHint:
    'The record of this request was cut when it was saved. Nothing has been added to fill it.',
  requestUnavailable: 'Full original request unavailable',
  requestUnavailableHint:
    'This event was recorded before Tracy marked whether a request was saved in full, so it may be cut.',
  noRequest: 'No request: this change did not come from a conversation.',
  contentTitle: 'Content',
  settingsTitle: 'Settings',
  filesTitle: 'Files',
  otherTitle: 'Other recorded actions',
  notTracked: (cms: CmsName) => `Not tracked on ${cms}`,
  filesUntrackedHint: (cms: CmsName) =>
    `${cms} keeps no file history Tracy can read, so file changes are not listed here.`,
  settingsUntrackedHint: (cms: CmsName) =>
    `${cms} admin does not report menus, settings or media to Tracy yet.`,
  outcomeUnknown: 'Outcome unknown',
  commit: (sha: string) => `Commit ${sha.slice(0, 7)}`,
  momentUndone: 'Undone',
  more: (n: number) => `+ ${n} more`,
  technical: 'Technical details',
  concurrent: 'Another conversation was open on this site during this event, so some files may be from it.',
  // Actions.
  undoFiles: 'Undo file changes…',
  noUndoContentOnly: 'Content changes can’t be undone from here yet.',
  noUndoNotTracy: 'Undo isn’t offered for changes Tracy didn’t make. Ask Tracy in the chat to put one back.',
  noUndoUntracked: (cms: CmsName) => `Undo isn’t offered on ${cms}: there is no file history to go back to.`,
  noUndoForbidden: 'Your role on this site can see changes but not undo them.',
  copySha: 'Copy the commit id',
  moreActions: 'More actions',
  // Undo dialog.
  undoTitle: 'Undo file changes?',
  undoBody: (n: number, sha: string) =>
    `${n === 1 ? '1 file goes' : `${n} files go`} back to how they were before commit ${sha.slice(0, 7)}.`,
  undoNotUndone: 'Not undone by this action',
  undoKeeps: 'Nothing is erased from the history. The undo is recorded as a new event under your name.',
  cancel: 'Cancel',
  confirm: (n: number) => `Undo ${n === 1 ? '1 file' : `${n} files`}`,
  working: 'Undoing…',
  // Coverage foot.
  older: 'Older history not shown',
  olderHint: 'The file history stops at the newest 200 moments.',
  adminTracked: (cms: CmsName, since: string) => `${cms} admin changes recorded since ${since}`,
  adminNotTracked: (cms: CmsName) => `${cms} admin changes are not recorded on this site yet`,
  emdashLimitsTitle: 'What this list cannot see on EmDash',
  emdashLimits:
    'EmDash keeps no file history Tracy can read, and its admin log does not cover menus, settings or media. Changes there do not appear here — that does not mean nothing changed.',
  narrowLabel: { time: 'Time', source: 'Type', by: 'By' }
}

const STATUS_STYLE: Record<string, string> = {
  added: 'text-green-600 dark:text-green-400',
  modified: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-red-600 dark:text-red-400'
}
const STATUS_LETTER: Record<string, string> = { added: 'A', modified: 'M', deleted: 'D' }
const FIRST_FILES = 4

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const t = lookup(siteTabsEn as Record<string, string>)

// ---------------------------------------------------------------------------------------------
// Pure helpers: time, scope line, row status. Each would move to `activity-list.ts` on port.
// ---------------------------------------------------------------------------------------------

/** The full moment with its time zone, read on hover or focus (§2.4). */
export const absolute = (at: number): string =>
  new Date(at * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  })

const ago = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - at * 1000) / 60000))
  if (minutes < 1) return t('ago.justNow')
  if (minutes < 60) return t('ago.short.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('ago.short.hours', { count: hours })
  return t('ago.short.days', { count: Math.floor(hours / 24) })
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/**
 * "1 page · 2 files": resources counted by type + id, files by unique path across the event's
 * moments, settings by key. An action with no id counts as an action, never as a page (§2.5).
 */
export function scopeLine(e: ChangeEvent): string | null {
  const parts: string[] = []
  const byType = new Map<string, Set<string>>()
  let anonymous = 0
  for (const a of e.content) {
    if (a.id === null) anonymous += 1
    else byType.set(a.type, (byType.get(a.type) ?? new Set()).add(a.id))
  }
  for (const [type, ids] of byType) parts.push(plural(ids.size, type))
  if (anonymous > 0) parts.push(plural(anonymous, 'content action'))
  if (e.settings.length > 0)
    parts.push(plural(new Set(e.settings.map((s) => s.id ?? s.title)).size, 'setting'))
  if (e.moments !== null) {
    const paths = new Set(e.moments.flatMap((m) => m.files.map((f) => f.path)))
    if (paths.size > 0) parts.push(plural(paths.size, 'file'))
  }
  if (e.other.length > 0) parts.push(plural(e.other.length, 'other action'))
  return parts.length ? parts.join(' · ') : null
}

/** What undo did to this event's files, said without claiming anything about its content (§3.3). */
export function undoStatus(e: ChangeEvent): 'partly' | 'files' | null {
  if (e.moments === null || e.moments.length === 0) return null
  if (!e.moments.every((m) => m.undoneBy !== undefined)) return null
  return e.content.length > 0 || e.settings.length > 0 ? 'partly' : 'files'
}

function groupByDay(items: readonly ChangeEvent[]): { key: string; label: string; items: ChangeEvent[] }[] {
  const groups: { key: string; label: string; items: ChangeEvent[] }[] = []
  for (const item of items) {
    const at = new Date(item.time.at * 1000)
    const key = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(item)
    else
      groups.push({
        key,
        label: at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        items: [item]
      })
  }
  return groups
}

const actionText = (a: Action): string => {
  const what = a.title !== null ? `${a.type} “${a.title}”` : a.id !== null ? `${a.type} ${a.id}` : a.type
  return `${a.op} ${what}`
}

// ---------------------------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------------------------

/**
 * Grid of the four columns: the same template on the header and on every row's first line, so a
 * column's left edge is one number for the whole list. The "…" slot is outside it, fixed.
 */
const COLS =
  '@min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_9.5rem] @min-[640px]:gap-x-3'

export function SiteChangesV2({
  siteKey,
  sites,
  activity,
  viewer,
  now = Date.now(),
  initialOpen = []
}: {
  siteKey: string
  sites: PickableSite[]
  activity: ActivityV2
  /** The seat looking at the tab: the By of any Undo it presses. */
  viewer: Person
  /** Milliseconds; a story pins it so a fixture never ages. */
  now?: number
  initialOpen?: string[]
}): JSX.Element {
  const [items, setItems] = useState<ChangeEvent[]>(activity.items)
  const [filter, setFilter] = useState<SourceKind | 'all'>('all')
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set(initialOpen))
  const [undoing, setUndoing] = useState<{ event: ChangeEvent; moment: Moment } | null>(null)
  const [extra, setExtra] = useState(0)

  const since = activity.since.version === null ? t('changes.sinceStart') : `v${activity.since.version}`
  const visible = [...items].sort((a, b) => b.time.at - a.time.at)
  const nothing = visible.length === 0
  const counts = { ...activity.counts.bySource }
  if (extra > 0) counts['site-changes'] += extra
  const total = SOURCES.reduce((n, s) => n + counts[s], 0)
  const shownTotal = filter === 'all' ? total : counts[filter]
  const days = groupByDay(visible.filter((e) => filter === 'all' || e.source === filter))

  const toggle = (id: string): void =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** The fake host: an undo of one moment succeeds, and is recorded as a new Site changes event. */
  const undone = (event: ChangeEvent, moment: Moment): void => {
    const id = `undo-${moment.sha}`
    const record: ChangeEvent = {
      id,
      source: 'site-changes',
      by: { kind: 'seat', ...viewer },
      description: { kind: 'result', text: `Undid changes to ${plural(moment.files.length, 'file')}` },
      time: { basis: 'occurred', at: Math.floor(now / 1000) },
      content: [],
      settings: [],
      other: [],
      moments: [{ sha: 'f00d' + moment.sha.slice(4), files: moment.files }],
      target: { eventId: event.id, sha: moment.sha, files: moment.files.length },
      technical: [
        { label: 'Operation', value: `op_${moment.sha.slice(0, 6)}` },
        { label: 'Target commit', value: moment.sha }
      ],
      undo: { allowed: false, reason: 'not-tracy' }
    }
    setItems((prev) => [
      record,
      ...prev.map((e) =>
        e.id === event.id
          ? {
              ...e,
              moments: (e.moments ?? []).map((m) => (m.sha === moment.sha ? { ...m, undoneBy: id } : m))
            }
          : e
      )
    ])
    setExtra((n) => n + 1)
  }

  return (
    // A size container: the pane's width, not the window's, decides table or stacked (§3.1).
    <div className="@container" data-site-changes-v2>
      <TabHeader
        siteKey={siteKey}
        role="owner"
        sites={sites}
        onPick={() => {}}
        action={
          <Button
            type="button"
            size="sm"
            disabled={nothing}
            title={nothing ? S.nothingNew(since) : undefined}
          >
            <Archive aria-hidden="true" />
            {S.createBackup}
          </Button>
        }
        t={t}
      />
      {nothing ? (
        <Note>{S.empty(since)}</Note>
      ) : (
        <>
          {/* Summary: the server's total for this filter, and the Type filter. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pt-2.5 pb-1 text-muted-foreground text-xs">
            <span className="inline-flex min-w-0 items-center gap-1" data-total>
              {S.total(shownTotal, activity.counts.complete, since)}
              {!activity.counts.complete && activity.counts.incompleteReason && (
                <span title={S.totalHint[activity.counts.incompleteReason]} className="inline-flex">
                  <Info
                    className="size-3.5 flex-none"
                    role="img"
                    aria-label={S.totalHint[activity.counts.incompleteReason]}
                  />
                </span>
              )}
            </span>
            <SourceFilter
              filter={filter}
              counts={counts}
              complete={activity.counts.complete}
              onPick={setFilter}
            />
          </div>
          <div className="px-1.5 pb-1.5">
            {/* Column header: wide pane only. In a narrow pane each value carries its own label. */}
            <div className="hidden items-center pr-1 @min-[640px]:flex" data-colheader aria-hidden="true">
              <div
                className={cn(
                  'min-w-0 flex-1 py-1.5 pr-1 pl-2 font-medium text-muted-foreground text-xs',
                  COLS
                )}
              >
                <span data-col="description">{S.col.description}</span>
                <span data-col="time">{S.col.time}</span>
                <span data-col="source">{S.col.source}</span>
                <span data-col="by">{S.col.by}</span>
              </div>
              <span className="block w-7 flex-none" />
            </div>
            {days.map((day) => (
              <section key={day.key} aria-label={day.label}>
                <h3 className="m-0 border-border border-b px-2 pt-3.5 pb-1 font-semibold text-muted-foreground text-xs">
                  {day.label}
                </h3>
                <ol className="m-0 list-none p-0">
                  {day.items.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      now={now}
                      open={opened.has(e.id)}
                      onToggle={() => toggle(e.id)}
                      onUndo={(moment) => setUndoing({ event: e, moment })}
                      onShowTarget={(id) => {
                        setFilter('all')
                        setOpened((prev) => new Set(prev).add(id))
                        requestAnimationFrame(() =>
                          document.querySelector(`[data-event="${id}"]`)?.scrollIntoView({ block: 'center' })
                        )
                      }}
                      targetOf={(id) => items.find((x) => x.id === id) ?? null}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
      <Coverage coverage={activity.coverage} />
      {undoing !== null && (
        <UndoDialog
          event={undoing.event}
          moment={undoing.moment}
          onClose={() => setUndoing(null)}
          onDone={() => {
            undone(undoing.event, undoing.moment)
            setUndoing(null)
          }}
        />
      )}
    </div>
  )
}

/** `Type: All ▾` (was `Source` until 03/10): seven values with their icon, counts from the server. */
function SourceFilter({
  filter,
  counts,
  complete,
  onPick
}: {
  filter: SourceKind | 'all'
  counts: Record<SourceKind, number>
  complete: boolean
  onPick: (f: SourceKind | 'all') => void
}): JSX.Element {
  const total = SOURCES.reduce((n, s) => n + counts[s], 0)
  const pill = (n: number): string => (complete ? String(n) : `${n}+`)
  return (
    <Popover
      align="end"
      className="min-w-52"
      anchorClassName="ml-auto"
      trigger={(props) => (
        <button
          type="button"
          className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-[3px] text-foreground text-xs hover:bg-foreground/5 aria-expanded:bg-foreground/5"
          {...props}
        >
          {filter !== 'all' && <SourceGlyph source={filter} />}
          {S.sourceFilter(filter === 'all' ? S.all : SOURCE_LABEL[filter])}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      <PopoverItem selected={filter === 'all'} onClick={() => onPick('all')}>
        <span className="flex-1">{S.all}</span>
        <CountPill>{pill(total)}</CountPill>
      </PopoverItem>
      <PopoverSeparator />
      {SOURCES.map((s) => (
        <PopoverItem key={s} selected={s === filter} disabled={counts[s] === 0} onClick={() => onPick(s)}>
          <SourceGlyph source={s} />
          <span className="flex-1">{SOURCE_LABEL[s]}</span>
          <CountPill>{pill(counts[s])}</CountPill>
        </PopoverItem>
      ))}
    </Popover>
  )
}

function CountPill({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="inline-grid h-[18px] min-w-[22px] place-items-center rounded-full bg-foreground/8 px-1.5 font-normal text-[11px] text-muted-foreground tabular-nums">
      {children}
    </span>
  )
}

function SourceGlyph({ source }: { source: SourceKind }): JSX.Element {
  const Icon = SOURCE_ICON[source]
  return <Icon className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
}

/**
 * The foot: what this list can and cannot see on THIS site. Always there, because "nothing
 * recorded" is only true for what Tracy can detect (§3.2).
 */
function Coverage({ coverage }: { coverage: ActivityV2['coverage'] }): JSX.Element {
  return (
    <div
      className="mx-3.5 mt-1 mb-4 space-y-2.5 border-border border-t pt-3 text-muted-foreground text-xs"
      data-coverage
    >
      {coverage.gitTruncated && (
        <div className="flex items-start gap-2">
          <History className="mt-px size-3.5 flex-none" aria-hidden="true" />
          <div>
            <p className="m-0 font-medium text-foreground">{S.older}</p>
            <p className="m-0 mt-0.5">{S.olderHint}</p>
          </div>
        </div>
      )}
      {coverage.emdashLimits && (
        <div className="flex items-start gap-2" data-emdash-limits>
          <TriangleAlert className="mt-px size-3.5 flex-none text-amber-500" aria-hidden="true" />
          <div>
            <p className="m-0 font-medium text-foreground">{S.emdashLimitsTitle}</p>
            <p className="m-0 mt-0.5">{S.emdashLimits}</p>
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <Info className="mt-px size-3.5 flex-none" aria-hidden="true" />
        <p className="m-0">
          {coverage.cmsAdmin !== null
            ? S.adminTracked(coverage.cms, coverage.cmsAdmin.since)
            : S.adminNotTracked(coverage.cms)}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------------------------

/** The By face: round for a Tracy seat, square for a CMS account or a service, dashed for Unknown. */
export function ByFace({ by, size = 'size-5' }: { by: By; size?: string }): JSX.Element {
  if (by.kind === 'seat')
    return <ActorFace by={{ kind: 'person', name: by.name, email: by.email }} className={size} />
  if (by.kind === 'unknown')
    return (
      <span
        className={cn(
          'flex flex-none items-center justify-center rounded-full border border-muted-foreground/50 border-dashed text-muted-foreground',
          size
        )}
        aria-hidden="true"
      >
        <CircleHelp className="size-3" />
      </span>
    )
  return (
    <span
      className={cn(
        'flex flex-none items-center justify-center rounded-[5px] border bg-muted font-semibold text-[10px] text-muted-foreground',
        size
      )}
      aria-hidden="true"
    >
      {by.kind === 'cms' ? by.cms.charAt(0) : <Cog className="size-3" />}
    </span>
  )
}

const byName = (by: By): string =>
  by.kind === 'seat' || by.kind === 'cms' || by.kind === 'service' ? by.name : S.unknown

/** The hover words for By: which system the identity belongs to, so two never read as one. */
const byTitle = (by: By): string =>
  by.kind === 'seat'
    ? `${by.name} · Tracy seat · ${by.email}`
    : by.kind === 'cms'
      ? S.cmsAccount(by.cms, by.name, by.id)
      : by.kind === 'service'
        ? S.automaticBy(by.name, by.detail)
        : S.unknown

function EventRow({
  event: e,
  now,
  open,
  onToggle,
  onUndo,
  onShowTarget,
  targetOf
}: {
  event: ChangeEvent
  now: number
  open: boolean
  onToggle: () => void
  onUndo: (moment: Moment) => void
  onShowTarget: (id: string) => void
  targetOf: (id: string) => ChangeEvent | null
}): JSX.Element {
  const scope = scopeLine(e)
  const status = undoStatus(e)
  const words = ago(e.time.at, now)
  const narrowLabel = 'text-muted-foreground @min-[640px]:sr-only'
  return (
    <li
      className={cn(
        'rounded-[9px] border-border border-b last:border-b-0',
        open && 'bg-foreground/[0.03] shadow-[inset_0_0_0_1px_var(--border)]'
      )}
      data-event={e.id}
      data-source={e.source}
      data-open={open || undefined}
    >
      <div className={cn('group/m flex items-start rounded-[9px]', !open && 'hover:bg-foreground/5')}>
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 cursor-pointer rounded-[9px] py-2 pr-1 pl-2 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
            COLS
          )}
          aria-expanded={open}
          onClick={onToggle}
        >
          {/* Description: the widest column; the scope or the undo status under it. */}
          <span className="block min-w-0" data-cell="description">
            <span
              className={cn(
                'flex min-w-0 items-baseline gap-1.5 text-sm leading-5',
                e.source === 'unknown' && 'text-muted-foreground'
              )}
            >
              {e.description.kind === 'request' && (
                <span className="flex-none rounded border border-border px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                  {S.requestChip}
                </span>
              )}
              <span
                className={cn('min-w-0', open ? 'whitespace-normal [overflow-wrap:anywhere]' : 'truncate')}
              >
                {e.description.text}
              </span>
              {e.flags?.concurrent && (
                <TriangleAlert
                  className="size-3.5 flex-none self-center text-amber-500"
                  role="img"
                  aria-label="Check this event"
                />
              )}
            </span>
            {(scope !== null || status !== null) && (
              // The undo status wraps: cutting "…not undone by this action" would drop the half that matters.
              <span
                className={cn('mt-0.5 block text-muted-foreground text-xs', status === null && 'truncate')}
                data-scope
              >
                {status === 'partly' ? (
                  <span className="text-amber-700 dark:text-amber-400" data-status="partly">
                    {S.partlyUndone}
                  </span>
                ) : status === 'files' ? (
                  <span className="text-amber-700 dark:text-amber-400" data-status="files">
                    {S.filesUndone}
                  </span>
                ) : (
                  scope
                )}
              </span>
            )}
          </span>
          {/* Narrow: the three attributes become one labelled metadata line. Wide: three columns. */}
          <span
            className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs @min-[640px]:contents"
            data-meta
          >
            <span className="inline-flex min-w-0 items-center gap-1 @min-[640px]:mt-0.5" data-cell="time">
              <span className={narrowLabel}>{S.narrowLabel.time}</span>
              <time
                dateTime={new Date(e.time.at * 1000).toISOString()}
                title={absolute(e.time.at)}
                className="whitespace-nowrap text-muted-foreground"
              >
                {e.time.basis === 'detected' ? S.detected(words) : words}
              </time>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 @min-[640px]:mt-0.5" data-cell="source">
              <span className={narrowLabel}>{S.narrowLabel.source}</span>
              <SourceGlyph source={e.source} />
              <span className="truncate text-foreground">{SOURCE_LABEL[e.source]}</span>
            </span>
            <span
              className="inline-flex min-w-0 items-center gap-1.5 @min-[640px]:mt-0.5"
              data-cell="by"
              title={byTitle(e.by)}
            >
              <span className={narrowLabel}>{S.narrowLabel.by}</span>
              <ByFace by={e.by} />
              <span
                className={cn(
                  'truncate',
                  e.by.kind === 'unknown' ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                {byName(e.by)}
              </span>
            </span>
          </span>
        </button>
        <div className="mt-[5px] mr-1 flex-none">
          <RowMenu event={e} shown={open} onUndo={onUndo} />
        </div>
      </div>
      {open && (
        <div className="pt-0.5 pr-3 pb-3 pl-2" data-detail>
          <Detail event={e} now={now} onUndo={onUndo} onShowTarget={onShowTarget} targetOf={targetOf} />
        </div>
      )}
    </li>
  )
}

/** The undoable moments of an event: Tracy made them, they are not undone, and the server agrees. */
const undoableMoments = (e: ChangeEvent): Moment[] =>
  e.undo.allowed && e.moments !== null ? e.moments.filter((m) => m.undoneBy === undefined) : []

function RowMenu({
  event: e,
  shown,
  onUndo
}: {
  event: ChangeEvent
  shown: boolean
  onUndo: (m: Moment) => void
}): JSX.Element {
  const sha = e.moments?.[0]?.sha ?? null
  const targets = undoableMoments(e)
  if (sha === null && e.comment === undefined && targets.length === 0)
    return <span className="block size-7" aria-hidden="true" />
  return (
    <Popover
      align="end"
      trigger={(props) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            'flex-none group-hover/m:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
            shown ? 'opacity-100' : 'opacity-0'
          )}
          aria-label={S.moreActions}
          {...props}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      )}
    >
      {sha !== null && (
        <PopoverItem onClick={() => void navigator.clipboard?.writeText(sha).catch(() => undefined)}>
          <Copy className="size-4 flex-none" aria-hidden="true" />
          {S.copySha}
        </PopoverItem>
      )}
      {e.comment !== undefined && (
        <PopoverItem onClick={() => window.open(e.comment?.href, '_blank', 'noopener')}>
          <ExternalLink className="size-4 flex-none" aria-hidden="true" />
          {S.openComment}
        </PopoverItem>
      )}
      {targets.length === 1 && targets[0] !== undefined && (
        <>
          <PopoverSeparator />
          <PopoverItem onClick={() => targets[0] && onUndo(targets[0])}>
            <RotateCcw className="size-4 flex-none" aria-hidden="true" />
            {S.undoFiles}
          </PopoverItem>
        </>
      )}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// The opened row. Order (§3.2): result/status → identity and source → request → Content /
// Settings / Files → technical → actions.
// ---------------------------------------------------------------------------------------------

function Block({ children, label }: { children: ReactNode; label?: string }): JSX.Element {
  return (
    <div
      className="mt-2.5 border-border border-t pt-2 first:mt-0 first:border-t-0 first:pt-0"
      data-block={label}
    >
      {children}
    </div>
  )
}

function Line({
  icon: Icon,
  children,
  tone
}: {
  icon: typeof Info
  children: ReactNode
  tone?: 'warn'
}): JSX.Element {
  return (
    <p
      className={cn(
        'm-0 mt-1 flex items-start gap-1.5 text-xs',
        tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
      )}
    >
      <Icon className="mt-px size-3.5 flex-none" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

function Detail({
  event: e,
  now,
  onUndo,
  onShowTarget,
  targetOf
}: {
  event: ChangeEvent
  now: number
  onUndo: (m: Moment) => void
  onShowTarget: (id: string) => void
  targetOf: (id: string) => ChangeEvent | null
}): JSX.Element {
  const status = undoStatus(e)
  const target = e.target ? targetOf(e.target.eventId) : null
  return (
    <div className="text-xs">
      {/* 1. Result and status. */}
      <Block label="result">
        {status === 'partly' && (
          <Line icon={RotateCcw} tone="warn">
            {S.partlyUndone}
          </Line>
        )}
        {status === 'files' && (
          <Line icon={RotateCcw} tone="warn">
            {S.filesUndone}
          </Line>
        )}
        {e.flags?.concurrent && (
          <Line icon={Users} tone="warn">
            {S.concurrent}
          </Line>
        )}
        <TimeLines event={e} now={now} />
      </Block>

      {/* 2. Identity and source. */}
      <Block label="identity">
        <Identity event={e} />
        {e.target !== undefined && (
          <p className="m-0 mt-1 text-muted-foreground">
            {S.undidTarget}:{' '}
            <span className="text-foreground">
              {target ? target.description.text : S.commit(e.target.sha)}
            </span>{' '}
            · {S.commit(e.target.sha)} · {plural(e.target.files, 'file')}{' '}
            <button
              type="button"
              className="cursor-pointer text-foreground underline underline-offset-2"
              onClick={() => e.target && onShowTarget(e.target.eventId)}
            >
              {S.goToTarget}
            </button>
          </p>
        )}
      </Block>

      {/* 3. The request, when the event came from one. */}
      {e.request !== undefined && (
        <Block label="request">
          <h4 className="m-0 mb-1 font-semibold text-foreground text-xs">{S.requestTitle}</h4>
          <blockquote className="m-0 border-border border-l-2 pl-2.5 text-foreground text-sm leading-5 [overflow-wrap:anywhere]">
            {e.request.text}
            {e.request.completeness !== 'complete' && <span className="text-muted-foreground"> …</span>}
          </blockquote>
          {e.request.completeness === 'incomplete' && (
            <Line icon={TriangleAlert} tone="warn">
              <span className="font-medium">{S.requestIncomplete}</span> — {S.requestIncompleteHint}
            </Line>
          )}
          {e.request.completeness === 'unknown' && (
            <Line icon={CircleHelp}>
              <span className="font-medium text-foreground">{S.requestUnavailable}</span> —{' '}
              {S.requestUnavailableHint}
            </Line>
          )}
        </Block>
      )}

      {/* 4. Content, Settings, Files, Other — each action in one group only. */}
      <Effects event={e} onUndo={onUndo} />

      {/* 5. Technical, folded. */}
      {e.technical.length > 0 && (
        <Block label="technical">
          <details>
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {S.technical}
            </summary>
            <dl className="m-0 mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {e.technical.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="m-0 truncate font-mono" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </Block>
      )}

      {/* 6. Actions the server allows, and why not when it does not. */}
      <Block label="actions">
        <Actions event={e} onUndo={onUndo} />
      </Block>
    </div>
  )
}

function TimeLines({ event: e, now }: { event: ChangeEvent; now: number }): JSX.Element {
  if (e.time.basis === 'detected')
    return (
      <Line icon={Info}>
        {S.timeDetected(absolute(e.time.at))} ({ago(e.time.at, now)})
      </Line>
    )
  return (
    <Line icon={Info}>
      {S.timeOccurred(absolute(e.time.at))}
      {e.time.finishedAt !== undefined && <> · {S.timeFinished(absolute(e.time.finishedAt))}</>}
    </Line>
  )
}

function Identity({ event: e }: { event: ChangeEvent }): JSX.Element {
  const strong = 'font-medium text-foreground'
  const sourceChip = (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-px text-foreground">
      <SourceGlyph source={e.source} />
      {SOURCE_LABEL[e.source]}
    </span>
  )
  let who: ReactNode
  switch (e.source) {
    case 'chat':
    case 'comment':
      who = (
        <>
          {S.requestedBy} <span className={strong}>{byName(e.by)}</span>
          {e.appliedBy && (
            <>
              {' '}
              · {S.appliedBy} <span className={strong}>{e.appliedBy}</span>
            </>
          )}
        </>
      )
      break
    case 'cms-admin':
      who =
        e.by.kind === 'cms' ? (
          <>
            <span className={strong}>{S.cmsAccount(e.by.cms, e.by.name, e.by.id)}</span>. {S.cmsNotSeat}
          </>
        ) : (
          <span className={strong}>{S.unknown}</span>
        )
      break
    case 'automatic':
      who = (
        <>
          <span className={strong}>{byTitle(e.by)}</span>. {S.automaticProof}
        </>
      )
      break
    case 'deployment':
      who = (
        <>
          <span className={strong}>{S.deployBy}</span>
          {e.deployment && (
            <>
              {' '}
              · {S.deployTag(e.deployment.cause, e.deployment.tag)} · {S.deployStartedBy}{' '}
              <span className={strong}>{e.deployment.startedBy ?? S.unknown}</span>
            </>
          )}
        </>
      )
      break
    case 'site-changes':
      who = S.siteChangesNote(byName(e.by))
      break
    default:
      who = (
        <>
          {S.unknownSource}
          {e.by.kind !== 'unknown' && (
            <>
              {' '}
              By: <span className={strong}>{byTitle(e.by)}</span>
            </>
          )}
        </>
      )
  }
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-muted-foreground">
      {sourceChip}
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        <ByFace by={e.by} size="size-4" />
        <span className="min-w-0">{who}</span>
      </span>
      {e.comment !== undefined && (
        <p className="m-0 basis-full">
          {S.commentBy} <span className={strong}>{e.comment.author.name}</span> {S.onPage(e.comment.where)} ·{' '}
          <a
            href={e.comment.href}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2"
          >
            {S.openComment}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
      )}
    </div>
  )
}

function Group({
  icon: Icon,
  title,
  count,
  children,
  name
}: {
  icon: typeof FileCode2
  title: string
  count: ReactNode
  children: ReactNode
  name: string
}): JSX.Element {
  return (
    <div className="mt-2 first:mt-0" data-group={name}>
      <h4 className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-foreground text-xs">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {title}
        <span className="font-normal text-muted-foreground">{count}</span>
      </h4>
      {children}
    </div>
  )
}

function ActionList({ actions }: { actions: Action[] }): JSX.Element {
  return (
    <ul className="m-0 list-none p-0">
      {actions.map((a, i) => (
        <li key={`${a.op}-${a.id}-${i}`} className="flex items-start gap-2 py-0.5">
          <span className="min-w-0 flex-1 text-foreground">
            {actionText(a)}
            {a.fields && a.fields.length > 0 && (
              <span className="text-muted-foreground"> · {a.fields.join(', ')}</span>
            )}
          </span>
          {a.outcome === 'unknown' && (
            <span className="inline-flex flex-none items-center gap-1 text-amber-700 dark:text-amber-400">
              <CircleHelp className="size-3.5" aria-hidden="true" />
              {S.outcomeUnknown}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Untracked({ text, hint }: { text: string; hint: string }): JSX.Element {
  return (
    <p className="m-0 text-muted-foreground" data-untracked>
      <span className="font-medium text-foreground">{text}</span> — {hint}
    </p>
  )
}

function Effects({
  event: e,
  onUndo
}: {
  event: ChangeEvent
  onUndo: (m: Moment) => void
}): JSX.Element | null {
  const cms = e.cms ?? 'EmDash'
  const filesUntracked = e.moments === null && e.tracking?.files === 'untracked'
  const settingsUntracked = e.tracking?.settings === 'untracked'
  const hasAny =
    e.content.length + e.settings.length + e.other.length > 0 ||
    (e.moments !== null && e.moments.length > 0) ||
    filesUntracked ||
    settingsUntracked
  if (!hasAny) return null
  const multi = (e.moments?.length ?? 0) > 1
  return (
    <Block label="effects">
      {e.content.length > 0 && (
        <Group icon={Database} title={S.contentTitle} count={e.content.length} name="content">
          <ActionList actions={e.content} />
        </Group>
      )}
      {(e.settings.length > 0 || settingsUntracked) && (
        <Group
          icon={SlidersHorizontal}
          title={S.settingsTitle}
          count={e.settings.length > 0 ? e.settings.length : ''}
          name="settings"
        >
          {e.settings.length > 0 && <ActionList actions={e.settings} />}
          {settingsUntracked && <Untracked text={S.notTracked(cms)} hint={S.settingsUntrackedHint(cms)} />}
        </Group>
      )}
      {filesUntracked ? (
        // EmDash: no number at all — "0 files" would claim a check that never happened.
        <Group icon={FileCode2} title={S.filesTitle} count="" name="files">
          <Untracked text={S.notTracked(cms)} hint={S.filesUntrackedHint(cms)} />
        </Group>
      ) : e.moments !== null && e.moments.length > 0 ? (
        <Group
          icon={FileCode2}
          title={S.filesTitle}
          count={new Set(e.moments.flatMap((m) => m.files.map((f) => f.path))).size}
          name="files"
        >
          {e.moments.map((m) => (
            <div key={m.sha} className="mt-1 first:mt-0" data-moment={m.sha}>
              {multi && (
                <div className="mb-0.5 flex items-center gap-2 text-muted-foreground">
                  <span className="font-mono">{S.commit(m.sha)}</span>· {plural(m.files.length, 'file')}
                  {m.undoneBy !== undefined && (
                    <span className="text-amber-700 dark:text-amber-400">{S.momentUndone}</span>
                  )}
                  {multi && e.undo.allowed && m.undoneBy === undefined && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto"
                      onClick={() => onUndo(m)}
                    >
                      <RotateCcw aria-hidden="true" />
                      {S.undoFiles}
                    </Button>
                  )}
                </div>
              )}
              <FileList files={m.files} />
            </div>
          ))}
        </Group>
      ) : null}
      {e.other.length > 0 && (
        <Group icon={ListChecks} title={S.otherTitle} count={e.other.length} name="other">
          <ActionList actions={e.other} />
        </Group>
      )}
    </Block>
  )
}

function FileList({ files }: { files: FileChange[] }): JSX.Element {
  const [all, setAll] = useState(false)
  const limit = all ? files.length : FIRST_FILES
  const byZone = new Map<string, FileChange[]>()
  for (const f of files) byZone.set(f.zone, [...(byZone.get(f.zone) ?? []), f])
  const zones = [
    ...ZONE_ORDER.filter((z) => byZone.has(z)),
    ...[...byZone.keys()].filter((z) => !(ZONE_ORDER as readonly string[]).includes(z))
  ]
  let left = limit
  const groups = zones
    .map((zone) => {
      const shown = (byZone.get(zone) ?? []).slice(0, Math.max(0, left))
      left -= shown.length
      return { zone, files: shown }
    })
    .filter((g) => g.files.length > 0)
  const hidden = files.length - Math.min(limit, files.length)
  return (
    <div>
      {groups.map(({ zone, files: inZone }) => (
        <div key={zone}>
          <div className="mt-1 mb-0.5 flex items-center gap-1.5 text-muted-foreground">
            {zone === 'core' && <TriangleAlert className="size-3 text-amber-500" aria-hidden="true" />}
            {t(`zone.${zone}`)}
          </div>
          {inZone.map((f) => (
            <div
              key={f.path}
              title={f.status === 'deleted' ? t('changes.deletedNoDiff') : f.path}
              className="-ml-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 font-mono"
            >
              <span className={cn('w-3 flex-none font-bold', STATUS_STYLE[f.status])}>
                {STATUS_LETTER[f.status] ?? '·'}
              </span>
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              <span className="flex-none">
                {f.additions ? (
                  <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                ) : null}{' '}
                {f.deletions ? <span className="text-red-600 dark:text-red-400">−{f.deletions}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="-ml-1 mt-0.5 cursor-pointer rounded-md px-1 py-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setAll(true)}
        >
          {S.more(hidden)}
        </button>
      )}
    </div>
  )
}

function Actions({ event: e, onUndo }: { event: ChangeEvent; onUndo: (m: Moment) => void }): JSX.Element {
  const targets = undoableMoments(e)
  const multi = (e.moments?.length ?? 0) > 1
  const cms = e.cms ?? 'EmDash'
  let reason: string | null = null
  if (targets.length === 0 && undoStatus(e) === null) {
    if (e.undo.reason === 'forbidden') reason = S.noUndoForbidden
    else if (e.undo.reason === 'untracked') reason = S.noUndoUntracked(cms)
    else if (e.undo.reason === 'not-tracy' && e.source !== 'site-changes') reason = S.noUndoNotTracy
    else if (e.undo.reason === 'no-files' || (e.moments ?? []).length === 0)
      reason = e.content.length > 0 ? S.noUndoContentOnly : null
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!multi && targets[0] !== undefined && (
        <Button type="button" variant="outline" size="sm" onClick={() => targets[0] && onUndo(targets[0])}>
          <RotateCcw aria-hidden="true" />
          {S.undoFiles}
        </Button>
      )}
      {reason !== null && (
        <p className="m-0 text-muted-foreground" data-no-undo>
          {reason}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Undo of ONE moment: the count is that commit's, never the event's total (§3.3).
// ---------------------------------------------------------------------------------------------

function UndoDialog({
  event: e,
  moment,
  onClose,
  onDone
}: {
  event: ChangeEvent
  moment: Moment
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const n = moment.files.length
  const otherMoments = (e.moments ?? []).filter((m) => m.sha !== moment.sha)
  const notUndone: string[] = [
    ...e.content.map(actionText),
    ...e.settings.map(actionText),
    ...otherMoments.map((m) => `${S.commit(m.sha)} · ${plural(m.files.length, 'file')}`)
  ]
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel="Close" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{S.undoTitle}</DialogTitle>
          <DialogDescription data-undo-count>{S.undoBody(n, moment.sha)}</DialogDescription>
        </DialogHeader>
        <ul
          className="m-0 max-h-40 list-none overflow-y-auto rounded-md border border-border p-2"
          aria-label="Files"
        >
          {moment.files.map((f) => (
            <li key={f.path} className="truncate py-0.5 font-mono text-xs" title={f.path}>
              {f.path}
            </li>
          ))}
        </ul>
        {notUndone.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs" data-not-undone>
            <p className="m-0 mb-1 font-semibold text-foreground">{S.undoNotUndone}</p>
            <ul className="m-0 list-disc pl-4 text-muted-foreground">
              {notUndone.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="m-0 text-muted-foreground text-sm">{S.undoKeeps}</p>
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
            {S.cancel}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              timer.current = setTimeout(onDone, 300)
            }}
          >
            <RotateCcw aria-hidden="true" />
            {busy ? S.working : S.confirm(n)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
