/**
 * The drawing behind `site-changes-turns.mock.stories.tsx`: the Site changes tab with one row per
 * CHAT TURN (plan `tasks/todo-site-changes.md` v4, §1, §5, P1), instead of one row per Git moment.
 *
 * PORTED, NOT REDRAWN. The layout is option A as it runs today (`@tracy/core/site-tabs`
 * `ChangesView.tsx` + `MomentRow.tsx` + `RowMenu.tsx` + `RestoreDialog.tsx` + `DiffView.tsx`): the
 * same header (`TabHeader`, real), the same summary line and filter (`Popover`, real), day groups,
 * a one-line row that opens in place with nothing on its first line moving, and the same "…" menu.
 *
 * What differs from the running code, and why it is drawn here rather than imported:
 *   - The row's unit is a chat turn; three kinds of row carry no typed words: outside Tracy in
 *     files (including a Tracy deploy), outside Tracy in a CMS admin, and the unknown turn. No component in `tracy-core` takes that shape yet, so this file draws it.
 *   - Mode A: the product's `tv-moment-*` rules (`tracy-site-tabs/src/client/site-tabs.css`) are
 *     re-expressed as Tailwind utilities, one to one, because that stylesheet carries its own
 *     Tailwind entry and cannot be loaded a second time into the bench. The port back to mode B
 *     goes the other way: utilities here become `tv-*` rules there.
 *   - A file opens the side card's Diff tab (`openDiff` in `tracy-site-tabs/src/client/index.tsx`),
 *     with THAT MOMENT's diff. The bench has no side card, so the tab strip is drawn here: the Site
 *     changes tab goes inactive and a "<file> · <site>" tab opens beside it (Brian, 01/10).
 *   - Undo exists only on a chat turn's moment. An outside row (files, a deploy, a CMS admin) has no
 *     Undo at all: Tracy did not make that change and cannot tell a plugin update from a hand edit,
 *     so putting its files back could break the site (Brian, 01/10). The server refuses it too.
 *   - Times read "4 min ago" like the running tab (`shortAgo`, `moment-list.ts`); the absolute date
 *     and time sit in the title, read on hover (Brian, 01/10).
 *   - Strings are inline English, gathered in `S` so the port can move them to `strings.ts` + `vi`.
 */
import { createContext, type JSX, type ReactNode, useContext, useState } from 'react'
import {
  Archive,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  History,
  Info,
  PanelsTopLeft,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
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
// The shape this drawing assumes: the plan's proposed `GET /api/sites/:key/activity` (§5) —
// `items` of four kinds, `counts` from the server, `coverage`. P0 settles the real names; this is
// the proposal made visible, not a contract.
// ---------------------------------------------------------------------------------------------

export interface Person {
  name: string
  email: string
}

export interface FileChange {
  path: string
  status: 'added' | 'modified' | 'deleted'
  /** `null` for a binary: there are no lines to count. */
  additions: number | null
  deletions: number | null
  zone: string
}

/**
 * One content write recorded in the turn.
 *   apply   a write through the Apply door (WordPress, Joomla): readable action, source outcome.
 *           `ok: false` is "outcome unknown" — the reply may have been lost after the CMS wrote.
 *   emdash  a change EmDash reported on `/changed`: only the tool's name, no outcome.
 */
export type ContentWrite =
  | { via: 'apply'; label: string; target?: string; ok: boolean }
  | { via: 'emdash'; tool: string }

export type TurnSource = { kind: 'panel' } | { kind: 'comment'; where: string; href: string | null }

/** One edit a CMS admin reported: verb, resource type, its name, and the CMS's own time. */
export interface CmsEdit {
  verb: 'Edited' | 'Created' | 'Deleted' | 'Changed'
  type: string
  name: string
  /** Unix seconds, as the CMS reported it. */
  at: number
}

export type UndoRefusal = { code: 'CONFLICT'; files: string[] } | { code: 'FORBIDDEN' }

interface Base {
  id: string
  /** Unix seconds. */
  at: number
  /** The Git moment behind the row; `null` when the turn changed no file. */
  sha: string | null
  files: FileChange[]
  /** What the host answers to an undo of this row (plan Q1): 409 with files, or 403. */
  undoRefusal?: UndoRefusal
}

export type Turn =
  | (Base & {
      kind: 'chat'
      by: Person
      /** The words the person typed, as they typed them. */
      title: string
      source: TurnSource
      writes: ContentWrite[]
      /** `stale`: the turn opened and never closed (dsh died mid-turn). */
      state?: 'closed' | 'stale'
      /** Sealing the site at the start of the turn failed (plan §6): files may predate the turn. */
      unsealedStart?: boolean
      /** Another conversation had a turn open on this site at the same time. */
      concurrent?: boolean
    })
  | (Base & {
      /** Content writes carrying an actor and a turn id, with no turn record behind them. */
      kind: 'unknown'
      by: Person
      writes: ContentWrite[]
    })
  | (Base & {
      /** A moment recorded before turns existed (no trailer): drawn as today, old author kept. */
      kind: 'legacy'
      by: { kind: 'agent' } | { kind: 'person'; name: string; email: string }
      title: string
    })
  | (Base & {
      /** Files changed outside Tracy, found when the site was sealed. */
      kind: 'outside'
      /** Tracy's own deploy copied these files (the Cowork plugin): said in the title, still outside. */
      byDeploy?: boolean
    })
  | (Base & {
      /** Edits a CMS admin reported through Tracy's hook: no files, no before/after. */
      kind: 'outside-cms'
      cms: string
      /** The CMS's own user name — not a Tracy seat, so never drawn as one. */
      user: string
      edits: CmsEdit[]
    })

export interface Activity {
  since: { version: number | null }
  /** Counted on the server across the whole history, not from the rows on this page. */
  counts: { chat: number; outside: number; files: number }
  items: Turn[]
  coverage: {
    /** The Git history hit its cap (200 moments / 500 files): older rows exist but are not here. */
    gitTruncated: boolean
    /** Whether this site's CMS admin edits reach the tab, and since when (the hook's install). */
    cmsAdmin: { cms: string; since: string; hook: string } | { cms: string; since: null }
  }
}

// ---------------------------------------------------------------------------------------------
// Words. English, per `docs/references/vocabulary.md`; existing keys reused where they exist.
// ---------------------------------------------------------------------------------------------

const S = {
  // Create release until ADR 0024 amendment 2 (03/10/2026); the real button reads `backup.create`.
  createBackup: 'Create a backup',
  nothingNew: (v: string) => `Nothing new since ${v}`,
  empty: (v: string) => `Nothing has changed since ${v}.`,
  summary: (v: string, chat: number, outside: number, files: number) =>
    `Since ${v}: ${chat === 1 ? '1 chat turn' : `${chat} chat turns`}, ${outside} outside Tracy, ${
      files === 1 ? '1 file changed' : `${files} files changed`
    }`,
  filter: { all: 'All', chat: 'Chat', outside: 'Outside' } as const,
  outsideTitle: 'Changes made outside Tracy',
  detected: (time: string) => `detected ${time}`,
  deployTitle: (what: string) => `Tracy deploy updated ${what}`,
  cmsTitle: (user: string, cms: string) => `${user} · in ${cms} admin`,
  viaPanel: 'in the chat panel',
  viaComment: (where: string) => `in a comment on ${where}`,
  openComment: 'Open comment',
  sourcePanel: 'Chat panel',
  sourceComment: 'Comment',
  unsealed: 'May include files changed before this turn.',
  concurrent: 'Another conversation was open on this site during this turn, so some files may be from it.',
  stale: 'This turn did not finish recording. The files and content below may be incomplete.',
  unknownNote: (name: string) =>
    `${name}’s conversation wrote this content, but Tracy has no record of what was typed.`,
  outsideNote:
    'Files changed over SSH or FTP, by an update, or by a plugin installed in the CMS admin. Tracy can’t tell who.',
  deployNote: 'Tracy’s own deploy replaced this file.',
  noUndoOutside: 'Undo isn’t offered for changes Tracy didn’t make. Ask Tracy in the chat to put one back.',
  diffTabNote: (what: string) => `Opens as a Diff tab beside this one: ${what}`,
  cmsNote: (user: string, cms: string) =>
    `Reported by ${cms}. ${user} is a ${cms} user, not a member of this site on Tracy. No before/after is kept.`,
  cmsEdits: (cms: string) => `Edits in ${cms} admin`,
  legacyNote: 'Recorded before Tracy linked changes to chat turns, so content writes aren’t listed.',
  noFilesContent: 'No files changed. Content writes can’t be undone from here yet.',
  filesTracy: 'Files Tracy changed',
  filesChanged: 'Files changed',
  contentTracy: 'Content Tracy wrote',
  succeeded: 'Done',
  outcomeUnknown: 'Outcome unknown',
  emdashReported: 'EmDash reported a change',
  more: (n: number) => `+ ${n} more`,
  undo: 'Undo this moment…',
  undoNoFiles: 'no files',
  copyId: 'Copy the moment id',
  moreActions: 'More actions',
  older: 'Older history not shown',
  olderHint: 'This list stops at the newest 200 moments.',
  adminTracked: (cms: string, since: string, hook: string) =>
    `${cms} admin edits tracked since ${since} (hook ${hook})`,
  adminNotTracked: (cms: string) => `${cms} admin edits not tracked yet on this site`,
  adminNotTrackedHint: 'Pages, menus or settings changed there don’t appear in this list.',
  undoTitle: (name: string) => `Undo “${name}”?`,
  undoBody: 'Only the files that moment touched go back. Everything done since stays.',
  undoBodyContent: 'Content Tracy wrote in this turn stays as it is.',
  keeps: 'Nothing is erased from the history — you can come forward again the same way.',
  cancel: 'Cancel',
  confirm: 'Undo the moment',
  working: 'Undoing…',
  conflictTitle: (name: string) => `Can’t undo “${name}”`,
  conflictBody:
    'These files changed after this moment. Undoing it now would overwrite that newer work, so nothing was changed.',
  forbiddenTitle: 'You can’t undo changes on this site',
  forbiddenBody:
    'Your role here can see changes but not change files. Nothing was changed. An owner or admin can undo it.',
  filesSince: 'Files changed since',
  close: 'Close',
  backToList: 'Site changes',
  thisMoment: 'This moment'
}

const STATUS_STYLE: Record<string, string> = {
  added: 'text-green-600 dark:text-green-400',
  modified: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-red-600 dark:text-red-400'
}
const STATUS_LETTER: Record<string, string> = { added: 'A', modified: 'M', deleted: 'D' }

/** Files shown before "+ N more" — the same 4 as `MomentRow`. */
const FIRST_FILES = 4

type Filter = 'all' | 'chat' | 'outside'
const FILTERS: readonly Filter[] = ['all', 'chat', 'outside']

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const t = lookup(siteTabsEn as Record<string, string>)

/** The clock the rows measure "ago" against — a story pins it so a fixture never ages. */
const NowContext = createContext<number>(Date.now())
const useNow = (): number => useContext(NowContext)

/** The absolute moment, for the title a hover reads: "Oct 1, 2026, 14:02". */
const absolute = (at: number): string =>
  new Date(at * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

/** `shortAgo` of `moment-list.ts`, with the tab's own `ago.*` words: "4 min ago", "1h ago", "3d ago". */
const ago = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - at * 1000) / 60000))
  if (minutes < 1) return t('ago.justNow')
  if (minutes < 60) return t('ago.short.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('ago.short.hours', { count: hours })
  return t('ago.short.days', { count: Math.floor(hours / 24) })
}

/** The time at the right of a row or a line: relative, with the absolute time on hover. */
function Ago({ at, prefix }: { at: number; prefix?: (ago: string) => string }): JSX.Element {
  const now = useNow()
  const words = ago(at, now)
  return <span title={absolute(at)}>{prefix ? prefix(words) : words}</span>
}

const writeName = (w: ContentWrite): string => (w.via === 'apply' ? w.label : S.emdashReported)

const titleOf = (turn: Turn): string => {
  switch (turn.kind) {
    case 'outside':
      return turn.byDeploy
        ? S.deployTitle(
            turn.files.length === 1
              ? (turn.files[0]?.path.split('/').pop() ?? '')
              : `${turn.files.length} files`
          )
        : S.outsideTitle
    case 'outside-cms':
      return S.cmsTitle(turn.user, turn.cms)
    // No prompt to show: the first write's action names the row.
    case 'unknown':
      return turn.writes[0] ? writeName(turn.writes[0]) : S.contentTracy
    default:
      return turn.title
  }
}

const matches = (turn: Turn, filter: Filter): boolean =>
  filter === 'all' ||
  (filter === 'chat' && (turn.kind === 'chat' || turn.kind === 'legacy' || turn.kind === 'unknown')) ||
  (filter === 'outside' && (turn.kind === 'outside' || turn.kind === 'outside-cms'))

function groupByDay(items: readonly Turn[]): { key: string; label: string; items: Turn[] }[] {
  const groups: { key: string; label: string; items: Turn[] }[] = []
  for (const item of items) {
    const at = new Date(item.at * 1000)
    const key = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(item)
    else
      groups.push({
        key,
        label: at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: [item]
      })
  }
  return groups
}

// ---------------------------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------------------------

export function SiteChangesTurns({
  siteKey,
  sites,
  activity,
  diffOf,
  now = Date.now()
}: {
  siteKey: string
  sites: PickableSite[]
  activity: Activity
  /** The fake host's answer to "this file's diff in this moment". */
  diffOf: (sha: string, path: string) => string
  /** Milliseconds, what "ago" is measured against; a story pins it. */
  now?: number
}): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [undoing, setUndoing] = useState<Turn | null>(null)
  const [viewing, setViewing] = useState<{ turn: Turn; path: string } | null>(null)

  if (viewing !== null && viewing.turn.sha !== null) {
    return (
      <NowContext.Provider value={now}>
        <MomentDiff
          siteKey={siteKey}
          turn={viewing.turn}
          path={viewing.path}
          diff={diffOf(viewing.turn.sha, viewing.path)}
          onBack={() => setViewing(null)}
        />
      </NowContext.Provider>
    )
  }

  const since = activity.since.version
  const sinceLabel = since === null ? t('changes.sinceStart') : `v${since}`
  // Newest first, as the server sends them; sorted here too so a fixture cannot split a day.
  const visible = [...activity.items].sort((a, b) => b.at - a.at)
  const nothing = visible.length === 0
  const counts: Record<Filter, number> = {
    all: activity.counts.chat + activity.counts.outside,
    chat: activity.counts.chat,
    outside: activity.counts.outside
  }
  const days = groupByDay(visible.filter((i) => matches(i, filter)))

  return (
    <NowContext.Provider value={now}>
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
            title={nothing ? S.nothingNew(sinceLabel) : undefined}
          >
            <Archive aria-hidden="true" />
            {S.createBackup}
          </Button>
        }
        t={t}
      />
      {nothing ? (
        <Note>{S.empty(sinceLabel)}</Note>
      ) : (
        <>
          {/* `.tv-changes-summary` */}
          <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-0.5 text-muted-foreground text-xs">
            <span className="min-w-0">
              {S.summary(sinceLabel, activity.counts.chat, activity.counts.outside, activity.counts.files)}
            </span>
            <FilterMenu filter={filter} counts={counts} onPick={setFilter} />
          </div>
          {/* `.tv-moment-list` */}
          <div className="px-1.5 pb-1.5">
            {days.map((day) => (
              <section key={day.key}>
                <h3 className="m-0 px-2 pt-3.5 pb-1 font-semibold text-muted-foreground text-xs">
                  {day.label}
                </h3>
                <ol className="m-0 list-none p-0">
                  {day.items.map((item) => (
                    <TurnRow
                      key={item.id}
                      turn={item}
                      open={opened.has(item.id)}
                      onToggle={() =>
                        setOpened((prev) => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }
                      onUndo={() => setUndoing(item)}
                      onOpenFile={(path) => setViewing({ turn: item, path })}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
      <Coverage coverage={activity.coverage} />
      {undoing !== null && <UndoDialog turn={undoing} onClose={() => setUndoing(null)} />}
    </NowContext.Provider>
  )
}

/**
 * The foot of the list: what this tab can and cannot see on THIS site's CMS. Shown under every
 * filter and on an empty tab, because "nothing has changed" is only true for what Tracy can detect.
 */
function Coverage({ coverage }: { coverage: Activity['coverage'] }): JSX.Element {
  const admin = coverage.cmsAdmin
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
      {admin.since !== null ? (
        <div className="flex items-start gap-2">
          <Info className="mt-px size-3.5 flex-none" aria-hidden="true" />
          <p className="m-0">{S.adminTracked(admin.cms, admin.since, admin.hook)}</p>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-px size-3.5 flex-none text-amber-500" aria-hidden="true" />
          <div>
            <p className="m-0 font-medium text-foreground">{S.adminNotTracked(admin.cms)}</p>
            <p className="m-0 mt-0.5">{S.adminNotTrackedHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/** All / Chat / Outside — the shape of `MomentFilterMenu`, counts from the server. */
function FilterMenu({
  filter,
  counts,
  onPick
}: {
  filter: Filter
  counts: Record<Filter, number>
  onPick: (f: Filter) => void
}): JSX.Element {
  return (
    <Popover
      align="end"
      className="min-w-44"
      trigger={(props) => (
        // `.tv-changes-filter`
        <button
          type="button"
          className="ml-auto inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-[3px] text-muted-foreground text-xs hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5 aria-expanded:text-foreground"
          {...props}
        >
          {S.filter[filter]}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {FILTERS.map((f) => (
        <PopoverItem key={f} selected={f === filter} disabled={counts[f] === 0} onClick={() => onPick(f)}>
          <span className="flex-1">{S.filter[f]}</span>
          {/* `.tv-count-pill` */}
          <span className="inline-grid h-[18px] min-w-[22px] place-items-center rounded-full bg-foreground/8 px-1.5 font-normal text-[11px] text-muted-foreground tabular-nums">
            {counts[f]}
          </span>
        </PopoverItem>
      ))}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------------------------

/** The face at the left: a Tracy seat for turns; a CMS admin tile or the site for outside rows. */
function TurnFace({ turn }: { turn: Turn }): JSX.Element {
  if (turn.kind === 'chat' || turn.kind === 'unknown')
    return <ActorFace by={{ kind: 'person', ...turn.by }} />
  if (turn.kind === 'legacy') return <ActorFace by={turn.by} />
  if (turn.kind === 'outside') return <ActorFace by={{ kind: 'outside' }} />
  // A CMS user is not a Tracy seat: a square admin tile, never the round face of a person.
  return (
    <span
      className="flex size-6 flex-none items-center justify-center rounded-md border bg-muted text-muted-foreground"
      title={`${turn.cms} user`}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden="true" />
    </span>
  )
}

function SourceIcon({ source }: { source: TurnSource }): JSX.Element {
  const Icon = source.kind === 'comment' ? MessageSquareText : MessageSquare
  const label = source.kind === 'comment' ? S.sourceComment : S.sourcePanel
  return (
    <span className="mt-[3px] flex-none text-muted-foreground" title={label}>
      <Icon className="size-3.5" aria-label={label} />
    </span>
  )
}

/** A turn whose record may be off: an amber mark beside the time, explained once the row opens. */
const flagged = (turn: Turn): boolean =>
  turn.kind === 'chat' && (turn.state === 'stale' || turn.unsealedStart === true || turn.concurrent === true)

function TurnRow({
  turn,
  open,
  onToggle,
  onUndo,
  onOpenFile
}: {
  turn: Turn
  open: boolean
  onToggle: () => void
  onUndo: () => void
  onOpenFile: (path: string) => void
}): JSX.Element {
  // Only a chat turn's moment can be undone: Tracy made it and knows what it did. An outside row
  // never can — the server refuses it as well (plan Q1, NOT_UNDOABLE).
  const canUndo =
    (turn.kind === 'chat' || turn.kind === 'unknown' || turn.kind === 'legacy') && turn.files.length > 0
  // Nothing to copy (no moment) and nothing to undo (no files): the menu has no item to offer.
  const noMenu = turn.kind === 'outside-cms'
  const muted = turn.kind === 'outside' || turn.kind === 'outside-cms' || turn.kind === 'unknown'
  return (
    // `.tv-moment`, `[data-open]`
    <li
      className={cn('rounded-[9px]', open && 'bg-foreground/[0.03] shadow-[inset_0_0_0_1px_var(--border)]')}
      data-open={open || undefined}
      data-kind={turn.kind}
    >
      {/* `.tv-moment-top` */}
      <div className={cn('group/m flex items-start rounded-[9px]', !open && 'hover:bg-foreground/5')}>
        {/* `.tv-moment-main` */}
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-[9px] py-[7px] pr-1 pl-2 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
          aria-expanded={open}
          onClick={onToggle}
        >
          <TurnFace turn={turn} />
          {/* `.tv-moment-title` */}
          <span
            className={cn(
              'mt-0.5 min-w-0 flex-1 text-sm leading-5',
              open ? 'whitespace-normal [overflow-wrap:anywhere]' : 'truncate',
              muted && 'text-muted-foreground',
              turn.kind === 'unknown' && 'italic'
            )}
          >
            {titleOf(turn)}
          </span>
          {flagged(turn) && (
            <TriangleAlert
              className="mt-[3px] size-3.5 flex-none text-amber-500"
              aria-label="Check this turn"
            />
          )}
          {turn.kind === 'chat' && <SourceIcon source={turn.source} />}
          {/* `.tv-moment-time` */}
          <span className="mt-1 flex-none text-muted-foreground text-xs leading-4">
            <Ago at={turn.at} prefix={turn.kind === 'outside' ? S.detected : undefined} />
          </span>
        </button>
        {/* `.tv-moment-menu`. With nothing to offer the slot stays, empty, so the time lines up
            with every other row's. */}
        <div className="mt-[5px] mr-1 flex-none">
          {noMenu ? (
            <span className="block size-7" aria-hidden="true" />
          ) : (
            <TurnMenu turn={turn} canUndo={canUndo} shown={open} onUndo={onUndo} />
          )}
        </div>
      </div>
      {open && (
        // `.tv-moment-body`
        <div className="pt-0.5 pr-3 pb-3 pl-[42px]">
          <TurnBody turn={turn} canUndo={canUndo} onUndo={onUndo} onOpenFile={onOpenFile} />
        </div>
      )}
    </li>
  )
}

/** The port of `RowMenu`: copy the id, then undo. A comment turn also offers its comment. */
function TurnMenu({
  turn,
  canUndo,
  shown,
  onUndo
}: {
  turn: Turn
  canUndo: boolean
  shown: boolean
  onUndo: () => void
}): JSX.Element {
  const href = turn.kind === 'chat' && turn.source.kind === 'comment' ? turn.source.href : null
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
      {turn.sha !== null && (
        <PopoverItem
          onClick={() => void navigator.clipboard?.writeText(turn.sha ?? '').catch(() => undefined)}
        >
          <Copy className="size-4 flex-none" aria-hidden="true" />
          {S.copyId}
        </PopoverItem>
      )}
      {href !== null && (
        <PopoverItem onClick={() => window.open(href, '_blank', 'noopener')}>
          <ExternalLink className="size-4 flex-none" aria-hidden="true" />
          {S.openComment}
        </PopoverItem>
      )}
      {canUndo || turn.kind === 'chat' || turn.kind === 'unknown' ? (
        <>
          {(turn.sha !== null || href !== null) && <PopoverSeparator />}
          <PopoverItem onClick={onUndo} disabled={!canUndo} hint={canUndo ? undefined : S.undoNoFiles}>
            <RotateCcw className="size-4 flex-none" aria-hidden="true" />
            {S.undo}
          </PopoverItem>
        </>
      ) : null}
    </Popover>
  )
}

function Flag({ icon: Icon, children }: { icon: typeof TriangleAlert; children: ReactNode }): JSX.Element {
  return (
    <p className="m-0 mt-1.5 flex items-start gap-1.5 text-amber-700 text-xs dark:text-amber-400">
      <Icon className="mt-px size-3.5 flex-none" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function TurnBody({
  turn,
  canUndo,
  onUndo,
  onOpenFile
}: {
  turn: Turn
  canUndo: boolean
  onUndo: () => void
  onOpenFile: (path: string) => void
}): JSX.Element {
  if (turn.kind === 'outside-cms') {
    return (
      <>
        <BodyLead turn={turn} />
        <Section icon={PanelsTopLeft} title={S.cmsEdits(turn.cms)} count={turn.edits.length}>
          <ul className="m-0 list-none p-0">
            {turn.edits.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-start gap-2 py-0.5 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="text-foreground">
                    {e.verb} {e.type}:
                  </span>{' '}
                  <span className="text-foreground">{e.name}</span>
                </span>
                <span className="flex-none text-muted-foreground">
                  <Ago at={e.at} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </>
    )
  }
  const writes = turn.kind === 'chat' || turn.kind === 'unknown' ? turn.writes : []
  return (
    <>
      <BodyLead turn={turn} />
      {turn.kind === 'chat' && turn.state === 'stale' && <Flag icon={TriangleAlert}>{S.stale}</Flag>}
      {turn.kind === 'chat' && turn.unsealedStart && <Flag icon={TriangleAlert}>{S.unsealed}</Flag>}
      {turn.kind === 'chat' && turn.concurrent && <Flag icon={Users}>{S.concurrent}</Flag>}
      {canUndo && (
        <Button type="button" variant="outline" size="sm" className="mt-2.5" onClick={onUndo}>
          <RotateCcw aria-hidden="true" />
          {S.undo}
        </Button>
      )}
      {(turn.kind === 'chat' || turn.kind === 'unknown') && turn.files.length === 0 && (
        <p className="m-0 mt-2 text-muted-foreground text-xs">{S.noFilesContent}</p>
      )}
      {turn.files.length > 0 && (
        <Section
          icon={FileCode2}
          title={turn.kind === 'chat' ? S.filesTracy : S.filesChanged}
          count={turn.files.length}
        >
          <Files files={turn.files} onOpenFile={onOpenFile} />
        </Section>
      )}
      {writes.length > 0 && (
        <Section icon={Database} title={S.contentTracy} count={writes.length}>
          <ul className="m-0 list-none p-0">
            {writes.map((w, i) => (
              <Write key={`${writeName(w)}-${i}`} write={w} />
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

/** The line under the opened title: who and where for a turn, what it is for the other kinds. */
function BodyLead({ turn }: { turn: Turn }): JSX.Element {
  const lead = 'm-0 text-muted-foreground text-xs'
  if (turn.kind === 'outside')
    return (
      <p className={lead}>
        {turn.byDeploy ? S.deployNote : S.outsideNote} {S.noUndoOutside}
      </p>
    )
  if (turn.kind === 'outside-cms') return <p className={lead}>{S.cmsNote(turn.user, turn.cms)}</p>
  if (turn.kind === 'legacy') return <p className={lead}>{S.legacyNote}</p>
  if (turn.kind === 'unknown') return <p className={lead}>{S.unknownNote(turn.by.name)}</p>
  const { source } = turn
  return (
    <p className={lead}>
      <span className="font-medium text-foreground">{turn.by.name}</span>{' '}
      {source.kind === 'panel' ? S.viaPanel : S.viaComment(source.where)}
      {source.kind === 'comment' && source.href !== null && (
        <>
          {' · '}
          <a
            href={source.href}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2"
          >
            {S.openComment}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </>
      )}
    </p>
  )
}

function Section({
  icon: Icon,
  title,
  count,
  children
}: {
  icon: typeof FileCode2
  title: string
  count: number
  children: ReactNode
}): JSX.Element {
  return (
    // `.tv-moment-files`: the hairline above each block.
    <div className="mt-2.5 border-border border-t pt-2">
      <h4 className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-foreground text-xs">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {title}
        <span className="font-normal text-muted-foreground">{count}</span>
      </h4>
      {children}
    </div>
  )
}

/** The port of `MomentFiles`: zones in `ZONE_ORDER`, cut after 4, then "+ N more". */
function Files({
  files,
  onOpenFile
}: {
  files: FileChange[]
  onOpenFile: (path: string) => void
}): JSX.Element {
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
          {/* `.tv-moment-zone` */}
          <div className="mt-1.5 mb-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
            {zone === 'core' && <TriangleAlert className="size-3 text-amber-500" aria-hidden="true" />}
            {t(`zone.${zone}`)}
          </div>
          {inZone.map((f) => (
            // `.tv-moment-file`
            <button
              type="button"
              key={f.path}
              disabled={f.status === 'deleted'}
              onClick={() => onOpenFile(f.path)}
              title={f.status === 'deleted' ? t('changes.deletedNoDiff') : f.path}
              className={cn(
                '-ml-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left font-mono text-xs',
                f.status === 'deleted' ? 'cursor-default' : 'cursor-pointer hover:bg-foreground/5'
              )}
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
            </button>
          ))}
        </div>
      ))}
      {hidden > 0 && (
        // `.tv-moment-more`
        <button
          type="button"
          className="-ml-1 mt-0.5 cursor-pointer rounded-md px-1 py-0.5 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setAll(true)}
        >
          {S.more(hidden)}
        </button>
      )}
    </div>
  )
}

/**
 * One content write: what it did, where (when the record has it), and the source's outcome.
 * `ok: false` reads "Outcome unknown", never "failed": a lost reply after the CMS wrote looks the
 * same (plan §3.7). An EmDash write has only its tool's name and no outcome at all.
 */
function Write({ write }: { write: ContentWrite }): JSX.Element {
  if (write.via === 'emdash') {
    return (
      <li className="flex items-start gap-2 py-0.5 text-xs" data-via="emdash">
        <span
          className="mt-[5px] ml-[3px] mr-[3px] size-2 flex-none rounded-full bg-muted-foreground/50"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="text-foreground">{S.emdashReported}</span>
          <span className="text-muted-foreground"> · </span>
          <code className="font-mono text-muted-foreground">{write.tool}</code>
        </span>
      </li>
    )
  }
  return (
    <li className="flex items-start gap-2 py-0.5 text-xs" data-ok={write.ok}>
      {write.ok ? (
        <Check
          className="mt-px size-3.5 flex-none text-green-600 dark:text-green-400"
          aria-label={S.succeeded}
        />
      ) : (
        <CircleHelp
          className="mt-px size-3.5 flex-none text-amber-600 dark:text-amber-400"
          aria-label={S.outcomeUnknown}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-foreground">{write.label}</span>
        {write.target !== undefined && <span className="text-muted-foreground"> · {write.target}</span>}
      </span>
      {!write.ok && <span className="flex-none text-amber-700 dark:text-amber-400">{S.outcomeUnknown}</span>}
    </li>
  )
}

// ---------------------------------------------------------------------------------------------
// One file's diff IN THAT MOMENT (`SHA^ → SHA`), not against the latest backup
// ---------------------------------------------------------------------------------------------

/** The `PlainDiff` floor from `DiffView.tsx`, ported as is. */
function PlainDiff({ diff }: { diff: string }): JSX.Element {
  return (
    <pre className="m-0 overflow-x-auto px-3 py-2 font-mono text-[12px] leading-5">
      {diff.split('\n').map((line, i) => (
        <div
          key={`${i}-${line}`}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'text-green-600 dark:text-green-400'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'text-red-600 dark:text-red-400'
                : line.startsWith('@@')
                  ? 'text-muted-foreground'
                  : undefined
          }
        >
          {line === '' ? ' ' : line}
        </div>
      ))}
    </pre>
  )
}

function MomentDiff({
  siteKey,
  turn,
  path,
  diff,
  onBack
}: {
  siteKey: string
  turn: Turn
  path: string
  diff: string
  onBack: () => void
}): JSX.Element {
  const name = path.split('/').pop() ?? path
  const tabTitle = `${name} · ${siteKey}`
  return (
    <>
      {/* The side card's tab strip, drawn: `openDiff` opens "<file> · <site>" beside Site changes
          and the card shows it. Pressing Site changes goes back to the list. */}
      <div
        role="tablist"
        aria-label="Side card tabs"
        className="flex items-end gap-1 border-border border-b bg-foreground/[0.03] px-2 pt-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={false}
          onClick={onBack}
          className="-mb-px cursor-pointer rounded-t-md border border-transparent px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground"
        >
          {S.backToList}
        </button>
        <span
          role="tab"
          aria-selected={true}
          className="-mb-px max-w-[60%] truncate rounded-t-md border border-border border-b-background bg-background px-2.5 py-1 font-medium text-xs"
          title={tabTitle}
        >
          {tabTitle}
        </span>
      </div>
      <p className="m-0 border-border border-b px-3 py-1 text-[11px] text-muted-foreground">
        {S.diffTabNote(t('tab.diff'))}
      </p>
      <div className="border-border border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex-none rounded-md bg-foreground/8 px-1.5 py-0.5 font-medium text-[11px]"
            data-diff-scope
          >
            {S.thisMoment}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
            {path}
          </span>
        </div>
        <p className="m-0 mt-1 truncate text-muted-foreground text-xs">
          {titleOf(turn)} · <Ago at={turn.at} />
        </p>
      </div>
      {diff.trim() === '' ? <Note>{t('diff.empty')}</Note> : <PlainDiff diff={diff} />}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Undo, with the two refusals the plan's Q1 adds (409 CONFLICT, 403 no write right)
// ---------------------------------------------------------------------------------------------

/**
 * The port of `RestoreDialog` in its `undo` mode, plus the refusals. Cancel keeps the focus, as in
 * the original.
 */
function UndoDialog({ turn, onClose }: { turn: Turn; onClose: () => void }): JSX.Element {
  const [state, setState] = useState<'ask' | 'busy' | 'refused'>('ask')
  const name = titleOf(turn)
  const refusal = turn.undoRefusal
  const submit = (): void => {
    setState('busy')
    // The drawing has no host: a row with `undoRefusal` answers as the refused undo would.
    setTimeout(() => (refusal !== undefined ? setState('refused') : onClose()), 400)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel="Close" className="max-w-md">
        {state === 'refused' && refusal !== undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {refusal.code === 'CONFLICT' ? S.conflictTitle(name) : S.forbiddenTitle}
              </DialogTitle>
              <DialogDescription>
                {refusal.code === 'CONFLICT' ? S.conflictBody : S.forbiddenBody}
              </DialogDescription>
            </DialogHeader>
            {refusal.code === 'CONFLICT' && (
              <ul
                className="m-0 max-h-48 list-none overflow-y-auto rounded-md border border-border p-2"
                aria-label={S.filesSince}
              >
                {refusal.files.map((path) => (
                  <li key={path} className="truncate py-0.5 font-mono text-xs" title={path}>
                    {path}
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" autoFocus onClick={onClose}>
                {S.close}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{S.undoTitle(name)}</DialogTitle>
              <DialogDescription>
                {S.undoBody}
                {turn.kind === 'chat' && turn.writes.length > 0 && <> {S.undoBodyContent}</>}
              </DialogDescription>
            </DialogHeader>
            <p className="m-0 text-muted-foreground text-sm">{S.keeps}</p>
            <DialogFooter>
              <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={state === 'busy'}>
                {S.cancel}
              </Button>
              <Button size="sm" onClick={submit} disabled={state === 'busy'}>
                <RotateCcw aria-hidden="true" />
                {state === 'busy' ? S.working : S.confirm}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
