/**
 * The drawing behind `site-changes-backup.mock.stories.tsx`: Site changes with BACKUPS as the
 * milestones of its timeline (ADR 0024, `tasks/todo-backup.md`). Grown from `./site-changes-v2.tsx`:
 * its types, words (`S`), By faces and four-column grid are imported; that file is not changed.
 *
 * What this drawing makes visible:
 *   1. "Create a backup" replaces "Create a release". Since Brian 03/10/2026 its dialog has no
 *      description and no "what is kept" line, and the title is not asked for: it is suggested as
 *      a field from the start holding `Oct 1, 2026, 16:44`, with `Backup 4 ·` before it as a fixed
 *      prefix (no placeholder, no hint). The drafted notes label the `content` zone
 *      "Media & language files" (ADR §4): "Content" means the database on every customer screen.
 *   2. A backup is a MILESTONE row in the timeline: `Backup 3 · <title>` plus a capability badge
 *      read from that point (ADR §1): `Full backup`, `File backup (no database)` (points made before
 *      the database was kept), `Content backup` (EmDash), `DB ✗` (the database copy is missing or
 *      does not match its hash — said plainly, and Everything is not offered).
 *   3. The column is `Type` (was `Source`, Brian 03/10). A backup's Type cell reads the archive mark
 *      and the word `Backup`; it is still counted neither per Type nor in the total, and under any
 *      Type filter it folds to a thin divider; under All it shows in full (decided 02/10).
 *   4. ONE restore verb, `Restore…` (Brian 03/10; before that two buttons, Restore files… and
 *      Restore everything…). Its one dialog chooses the scope, by risk (ADR §2): `Everything`
 *      (selected first: the heavy content — what is deleted, type the site name, a "Before restore"
 *      backup first) or `Files only` (the files content, with the warning that images uploaded
 *      since are removed). Switching scope swaps the content inside the same window. When only one
 *      scope can be pressed there are no radios: `Restore: Files only`, the warning and the reason.
 *      EmDash: `Restore content…` only, with no scope step.
 *   5. The first point is the `Initial backup — site as built` (ADR §5): Full on a new site, a
 *      factory reset; `File backup (no database)` on a site built before the ADR.
 *   6. `Jump to backup` beside the filter. The machine tag `tracy-release/vN` shows only in
 *      Technical details.
 *   7. After Restore everything (Brian 03/10) its Before-restore backup is not a row of its own:
 *      the restore row reads `Restored everything to Backup 3 · Return point: Backup 4` and its
 *      detail holds `Restore Backup 4…`. A backup row counts every recorded change since the
 *      previous backup (`6 changes since Backup 2`), not only files.
 *
 * Ordinary events keep V2's row line (copied: V2 does not export its row) and open to a short
 * stand-in detail; the full detail is V2's — see `Mockups/Site changes V2`.
 *
 * Mode A: utilities become `tv-*` rules in `tracy-site-tabs` when ported (DESIGN.md §0).
 */
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Archive,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  Database,
  FileCode2,
  Info,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  PanelsTopLeft,
  RotateCcw,
  Timer,
  TriangleAlert
} from 'lucide-react'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Label,
  Textarea
} from '@tracy/ui'
import { Popover, PopoverItem, PopoverSeparator, TabHeader, type PickableSite } from '@tracy/core/site-tabs'

import { en as siteTabsEn } from '../../../../site/tracy-site-tabs/src/client/strings'
import {
  absolute,
  type ActivityV2,
  type By,
  ByFace,
  type ChangeEvent,
  type CmsName,
  type Person,
  S,
  scopeLine,
  SOURCE_LABEL,
  SOURCES,
  type SourceKind,
  undoStatus
} from './site-changes-v2'

// ---------------------------------------------------------------------------------------------
// Shape: a backup milestone beside V2's events. A proposal made visible, not a contract.
// ---------------------------------------------------------------------------------------------

/**
 * What THIS point can put back, read from the point itself (ADR §1), never from the software
 * version: `full` files + database; `files-only` a point made before the database was kept;
 * `content` EmDash database + media; `db-missing` the point says it has a database copy but the
 * file is gone or its hash does not match.
 */
export type Capability = 'full' | 'files-only' | 'content' | 'db-missing'

export interface BackupMark {
  kind: 'backup'
  id: string
  /** The number people say ("back to 4"); the machine still tags it `tracy-release/v<number>`. */
  number: number
  /** `null` on the initial backup; a backup made without a changed title is named by its date and time. */
  title: string | null
  notes: string | null
  sha: string
  at: number
  by: By
  cms: CmsName
  capability: Capability
  /** The first point, made when the site was built. */
  initial?: boolean
  /** Taken by Tracy just before a Restore everything; names the point that restore went to. */
  beforeRestoreTo?: number
  /** Files changed BETWEEN the previous backup and this one; `null` when not tracked (EmDash). */
  since: { number: number | null; files: number | null }
  /** Database copy facts, for Technical details only. */
  database?: { engine: string; size: string; sha256: string }
}

export type TimelineItem = ChangeEvent | BackupMark

export const isBackup = (i: TimelineItem): i is BackupMark => 'kind' in i && i.kind === 'backup'
const atOf = (i: TimelineItem): number => (isBackup(i) ? i.at : i.time.at)

export interface ActivityMerged extends Omit<ActivityV2, 'items' | 'since'> {
  /** Any order: the view sorts. `counts.bySource` counts events only — a backup is counted under no Type. */
  items: TimelineItem[]
}

// ---------------------------------------------------------------------------------------------
// Words. English; V2's `S`, the shipped `restore.*` keys where they still fit, new ones here.
// ---------------------------------------------------------------------------------------------

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const tShipped = lookup(siteTabsEn as Record<string, string>)
/** ADR §4: the `content` ZONE is files (uploads, images, language), so its LABEL changes; id stays. */
const ZONE_LABEL_OVERRIDE: Record<string, string> = { 'zone.content': 'Media & language files' }
const t = (key: string, params?: Record<string, string | number>): string =>
  ZONE_LABEL_OVERRIDE[key] ?? tShipped(key, params)

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** The shipped `stampTitle`: date (with year) and time, the title a backup gets unless one is written. */
const stamp = (at: number): string =>
  new Date(at * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
const shortDay = (at: number): string =>
  new Date(at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const B = {
  create: 'Create a backup',
  total: (n: number, complete: boolean) =>
    `${complete ? '' : 'At least '}${n} recorded ${n === 1 ? 'event' : 'events'}`,
  initialName: 'Initial backup — site as built',
  name: (b: BackupMark) => (b.initial ? B.initialName : `Backup ${b.number} · ${b.title ?? stamp(b.at)}`),
  short: (b: BackupMark) => (b.initial ? 'Initial backup' : `Backup ${b.number}`),
  badge: {
    full: 'Full backup',
    'files-only': 'File backup (no database)',
    content: 'Content backup',
    'db-missing': 'DB ✗'
  } satisfies Record<Capability, string>,
  badgeTitle: {
    full: 'Files and database',
    'files-only': 'Files only: made before Tracy kept the database',
    content: 'Database and media; template code not included',
    'db-missing': 'Database copy missing or damaged: files only'
  } satisfies Record<Capability, string>,
  // Row second line.
  filesSince: (n: number, since: number | null) =>
    since === null ? 'The site as it was handed over' : `${plural(n, 'file')} changed since Backup ${since}`,
  /** Every change recorded since the previous backup, not only files (Brian 03/10). */
  changesSince: (n: number, since: number | null) =>
    since === null ? 'The site as it was handed over' : `${plural(n, 'change')} since Backup ${since}`,
  emdashSince: (since: number | null) =>
    since === null ? 'The site as it was handed over' : `Since Backup ${since} · database and media`,
  dbMissingLine: 'Database copy missing · only the files can go back',
  // Detail.
  backedUpBy: 'Backed up by',
  beforeRestore: (n: number) =>
    `Taken by Tracy just before everything was restored to Backup ${n}, so that restore can be undone the same way.`,
  notesTitle: 'Backup notes',
  noNotes: 'No notes were written.',
  keepsTitle: 'What this backup keeps',
  keeps: {
    full: 'Files and the site’s database: posts, pages, menus, settings, users, comments and orders.',
    'files-only':
      'Files only. This backup was made before Tracy kept the database, so posts, pages and settings cannot be put back from it.',
    content: 'The site’s database and media. The template code is not part of it and stays as it is.',
    'db-missing':
      'Its database copy is missing or does not match what was saved, so only its files can be put back. Restore everything is not offered.'
  } satisfies Record<Capability, string>,
  initialFull:
    'Everything as it was the moment the site was handed over. Restore everything here is a factory reset: the site goes back to day one.',
  initialFiles:
    'The files as they were when the site was handed over. This site was built before Tracy kept the database, so its database at that moment was not saved.',
  filesSinceHint:
    'Counted from the previous backup to this one. A backup changes nothing on the site: it keeps the site as it was at this point.',
  // One verb since Brian 03/10 (was Restore files… + Restore everything…); EmDash keeps its own.
  restore: tShipped('backup.restore'),
  restoreContent: 'Restore content…',
  noEverything: {
    'files-only': 'Restore everything isn’t offered: this backup has no copy of the database.',
    'db-missing': 'Restore everything isn’t offered: the database copy of this backup can’t be trusted.'
  },
  noFilesEmdash: 'Restore files isn’t offered on EmDash: its files are not tracked.',
  // The scope step inside Restore… (the shipped `restore.scope*` words).
  scopeLabel: tShipped('restore.scopeLabel'),
  scopeEverything: tShipped('restore.scopeEverything'),
  scopeFiles: tShipped('restore.scopeFiles'),
  scopeFilesWarning: tShipped('restore.scopeFilesWarning'),
  // Create dialog: no description, no scope line, no placeholder or hint since Brian 03/10.
  createTitle: (n: number, site: string) => `Create backup ${n} of ${site}`,
  nameLabel: 'Backup title',
  notesHint: (n: number, since: string) => `Drafted from the ${n} changes since ${since}. Edit freely.`,
  createConfirm: 'Create backup',
  creating: 'Creating…',
  // Files only content: the shipped words, with "release" now "backup".
  filesTitle: (site: string, name: string) => `Put the files of ${site} back to ${name}?`,
  filesBody:
    'The site’s files go back to how they were at that backup. Content and settings kept in the database are not changed. Visitors see the file changes at once.',
  filesKeeps: tShipped('restore.keeps'),
  filesConfirm: tShipped('restore.confirmBackup'),
  // Everything content (EmDash: Restore content…).
  everythingTitle: (site: string, name: string) => `Restore everything on ${site} to ${name}?`,
  contentTitle: (site: string, name: string) => `Restore the content of ${site} to ${name}?`,
  everythingBody: (when: string) => `Files and the database go back to how they were on ${when}.`,
  contentBody: (when: string) => `The database and media go back to how they were on ${when}.`,
  lostTitle: (when: string) => `Everything saved on the site after ${when} is deleted:`,
  lost: ['Posts and pages', 'Orders', 'Form entries', 'Users', 'Comments', 'Settings'],
  beforeFirst: 'Tracy will take a “Before restore” backup first, so you can come back to now.',
  emdashOffline: 'The site is offline for a few seconds while it restarts.',
  templateKept: 'The template code is not part of this backup and stays as it is.',
  typeRestore: tShipped('backup.typeRestore'),
  everythingConfirm: 'Restore everything',
  contentConfirm: 'Restore content',
  restoring: tShipped('restore.working'),
  // Toolbar.
  jump: 'Jump to backup',
  backupMark: 'Backup',
  divider: (b: BackupMark) => `${B.short(b)} · ${shortDay(b.at)}`,
  // Restore events written to the list.
  restoredFiles: (b: BackupMark) => `Restored files to ${B.short(b)}`,
  restoredEverything: (b: BackupMark) => `Restored everything to ${B.short(b)}`,
  // A Restore everything row carries its own Before-restore backup (Brian 03/10).
  returnPoint: (n: number) => `Return point: Backup ${n}`,
  restoreReturnPoint: (n: number) => `Restore Backup ${n}…`,
  restoredContent: (b: BackupMark) => `Restored content to ${B.short(b)}`
}

/** V2's labels, with `site-changes` labelled `Restore` (shipped in #729). */
const LABEL: Record<SourceKind, string> = { ...SOURCE_LABEL, 'site-changes': 'Restore' }

const SOURCE_ICON: Record<SourceKind, typeof MessageSquare> = {
  chat: MessageSquare,
  comment: MessageSquareText,
  'cms-admin': PanelsTopLeft,
  automatic: Timer,
  deployment: CloudUpload,
  'site-changes': RotateCcw,
  unknown: CircleHelp
}

function SourceGlyph({ source }: { source: SourceKind }): JSX.Element {
  const Icon = SOURCE_ICON[source]
  return <Icon className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
}

const ago = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - at * 1000) / 60000))
  if (minutes < 1) return t('ago.justNow')
  if (minutes < 60) return t('ago.short.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('ago.short.hours', { count: hours })
  return t('ago.short.days', { count: Math.floor(hours / 24) })
}

const byName = (by: By): string =>
  by.kind === 'seat' || by.kind === 'cms' || by.kind === 'service' ? by.name : S.unknown

const byTitle = (by: By): string =>
  by.kind === 'seat'
    ? `${by.name} · Tracy seat · ${by.email}`
    : by.kind === 'cms'
      ? S.cmsAccount(by.cms, by.name, by.id)
      : by.kind === 'service'
        ? S.automaticBy(by.name, by.detail)
        : S.unknown

/** One grid for the header, every event and every milestone: a column's left edge is one number. */
const COLS =
  '@min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_9.5rem] @min-[640px]:gap-x-3'

type Shown = { item: TimelineItem; as: 'row' | 'divider' }

function groupByDay(shown: readonly Shown[]): { key: string; label: string; items: Shown[] }[] {
  const groups: { key: string; label: string; items: Shown[] }[] = []
  for (const s of shown) {
    const at = new Date(atOf(s.item) * 1000)
    const key = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(s)
    else
      groups.push({
        key,
        label: at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        items: [s]
      })
  }
  return groups
}

const FLASH_MS = 1200

type Scope = 'files' | 'everything'
type Restoring = { backup: BackupMark; scope: Scope }

/** The scopes a point offers, from its capability alone (ADR §1, §2); the seat may press both here. */
const verbs = (b: BackupMark): { files: boolean; everything: boolean; content: boolean } => ({
  files: b.capability !== 'content',
  everything: b.capability === 'full',
  content: b.capability === 'content'
})

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

export function SiteChangesBackup({
  siteKey,
  sites,
  activity,
  viewer,
  now = Date.now(),
  initialOpen = [],
  initialFilter = 'all',
  draft = ''
}: {
  siteKey: string
  sites: PickableSite[]
  activity: ActivityMerged
  /** The seat looking at the tab: the By of any backup or restore it makes. */
  viewer: Person
  /** Milliseconds; a story pins it so a fixture never ages. */
  now?: number
  initialOpen?: string[]
  initialFilter?: SourceKind | 'all'
  /** The notes the create dialog starts with (drafted by the tab in the real one). */
  draft?: string
}): JSX.Element {
  const [items, setItems] = useState<TimelineItem[]>(activity.items)
  const [filter, setFilter] = useState<SourceKind | 'all'>(initialFilter)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set(initialOpen))
  const [restoring, setRestoring] = useState<BackupMark | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<number | null>(null)
  const [extra, setExtra] = useState(0)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), [])

  const sorted = [...items].sort((a, b) => atOf(b) - atOf(a))
  const backups = sorted.filter(isBackup)
  const latest = backups[0]
  const nothing = sorted.length === 0
  // Nothing RECORDED since the newest backup never turns Create off: the database changes without a
  // row (orders, comments, a CLI write — QA-I04/I07, 02/10); the hover only says what the list knows.
  const nothingRecorded = latest !== undefined && sorted[0] === latest
  const nextNumber = (latest?.number ?? 0) + 1
  const cms = activity.coverage.cms
  const counts = { ...activity.counts.bySource }
  if (extra > 0) counts['site-changes'] += extra
  const total = SOURCES.reduce((n, s) => n + counts[s], 0)
  const shownTotal = filter === 'all' ? total : counts[filter]

  // A Before-restore backup is folded into its restore row while that row is shown (Brian 03/10):
  // drawn by time it sat above the restore and read as "backed up after restoring".
  const visible = sorted.filter((i) => filter === 'all' || isBackup(i) || i.source === filter)
  const folded = new Map(
    visible.flatMap((i) => {
      const n = returnPointOf(i)
      const b = n === undefined ? undefined : backups.find((x) => x.number === n)
      return b ? [[b.number, b] as const] : []
    })
  )
  // Every change recorded between a backup and the one before it.
  const changes = new Map<number, number>()
  backups.forEach((b, i) => {
    const prev = backups[i + 1]
    if (!prev) return
    changes.set(
      b.number,
      sorted.filter((x) => !isBackup(x) && atOf(x) > atOf(prev) && atOf(x) <= atOf(b)).length
    )
  })
  // A milestone survives every filter: in full under All, as a thin divider under any Type.
  const shown: Shown[] = visible.flatMap((i): Shown[] => {
    if (isBackup(i))
      return folded.has(i.number) ? [] : [{ item: i, as: filter === 'all' ? 'row' : 'divider' }]
    return [{ item: i, as: 'row' }]
  })
  const days = groupByDay(shown)

  const toggle = (id: string): void =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const jumpTo = (n: number): void => {
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-backup="${n}"], [data-backup-divider="${n}"], [data-return-point-of="${n}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    setFlash(n)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
  }

  const seatBy: By = { kind: 'seat', ...viewer }
  const nowSec = Math.floor(now / 1000)
  const newBackup = (over: Partial<BackupMark>, at: number, number: number): BackupMark => ({
    kind: 'backup',
    id: `b-${number}`,
    number,
    title: null,
    notes: null,
    sha: `f00d${number}c0ffee00`,
    at,
    by: seatBy,
    cms,
    capability: cms === 'EmDash' ? 'content' : 'full',
    since: { number: latest?.number ?? null, files: cms === 'EmDash' ? null : 0 },
    ...over
  })

  /** The fake host: a restore succeeds; Restore everything first takes a "Before restore" backup. */
  const restored = ({ backup: b, scope }: Restoring): void => {
    const text =
      scope === 'files'
        ? B.restoredFiles(b)
        : b.capability === 'content'
          ? B.restoredContent(b)
          : B.restoredEverything(b)
    const record: ChangeEvent = {
      id: `restore-${scope}-${b.number}-${extra}`,
      source: 'site-changes',
      by: seatBy,
      description: { kind: 'result', text },
      time: { basis: 'occurred', at: nowSec },
      content: [],
      settings: [],
      other: [],
      moments: [],
      technical: [{ label: 'Target tag', value: `tracy-release/v${b.number}` }],
      undo: { allowed: false, reason: 'not-tracy' }
    }
    if (scope === 'everything') (record as RestoreRecord).returnPoint = nextNumber
    const before =
      scope === 'everything'
        ? [
            newBackup(
              { beforeRestoreTo: b.number, title: `Before restore to Backup ${b.number}` },
              nowSec - 1,
              nextNumber
            )
          ]
        : []
    setItems((prev) => [record, ...before, ...prev])
    setExtra((n) => n + 1)
  }

  return (
    <div className="@container" data-site-changes-backup>
      <TabHeader
        siteKey={siteKey}
        role="owner"
        sites={sites}
        onPick={() => {}}
        action={
          <Button
            type="button"
            size="sm"
            title={
              nothingRecorded && latest
                ? `Nothing recorded in Site changes since ${B.short(latest)}. The database can still have changed (orders, comments, form entries), so a backup can still keep something new.`
                : undefined
            }
            onClick={() => setCreating(true)}
          >
            <Archive aria-hidden="true" />
            {B.create}
          </Button>
        }
        t={t}
      />
      {nothing ? (
        <p className="m-0 px-3.5 py-3 text-muted-foreground text-sm">{S.empty(t('changes.sinceStart'))}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pt-2.5 pb-1 text-muted-foreground text-xs">
            <span className="inline-flex min-w-0 items-center gap-1" data-total>
              {B.total(shownTotal, activity.counts.complete)}
            </span>
            <span className="ml-auto flex flex-none items-center gap-1.5">
              {backups.length > 0 && <JumpMenu backups={backups} onPick={jumpTo} />}
              <SourceFilter
                filter={filter}
                counts={counts}
                complete={activity.counts.complete}
                onPick={setFilter}
              />
            </span>
          </div>
          <div className="px-1.5 pb-1.5">
            <div className="@min-[640px]:flex hidden items-center pr-1" data-colheader aria-hidden="true">
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
            {days.map((day) => {
              // A day that holds only folded milestones needs no heading: the divider names its day.
              const onlyDividers = day.items.every((s) => s.as === 'divider')
              return (
                <section key={day.key} aria-label={day.label}>
                  {!onlyDividers && (
                    <h3 className="m-0 border-border border-b px-2 pt-3.5 pb-1 font-semibold text-muted-foreground text-xs">
                      {day.label}
                    </h3>
                  )}
                  <ol className="m-0 list-none p-0">
                    {day.items.map(({ item, as }) =>
                      isBackup(item) ? (
                        as === 'divider' ? (
                          <BackupDivider key={item.id} backup={item} flash={flash === item.number} />
                        ) : (
                          <BackupRow
                            key={item.id}
                            backup={item}
                            changes={changes.get(item.number) ?? null}
                            now={now}
                            open={opened.has(item.id)}
                            flash={flash === item.number}
                            onToggle={() => toggle(item.id)}
                            onRestore={() => setRestoring(item)}
                          />
                        )
                      ) : (
                        <EventRow
                          key={item.id}
                          event={item}
                          now={now}
                          open={opened.has(item.id)}
                          onToggle={() => toggle(item.id)}
                          returnPoint={folded.get(returnPointOf(item) ?? -1)}
                          flash={flash !== null && flash === returnPointOf(item)}
                          onRestore={(b) => setRestoring(b)}
                        />
                      )
                    )}
                  </ol>
                </section>
              )
            })}
          </div>
        </>
      )}
      <Coverage coverage={activity.coverage} />
      {creating && (
        <CreateBackupDialog
          siteKey={siteKey}
          number={nextNumber}
          at={nowSec}
          since={latest ? B.short(latest) : t('changes.sinceStart')}
          changes={latest ? sorted.indexOf(latest) : sorted.length}
          draft={draft}
          onClose={() => setCreating(false)}
          onDone={(title, notes) => {
            setItems((prev) => [
              newBackup(
                {
                  title: title || null,
                  notes: notes || null,
                  since: { number: latest?.number ?? null, files: cms === 'EmDash' ? null : 4 }
                },
                nowSec,
                nextNumber
              ),
              ...prev
            ])
            setCreating(false)
          }}
        />
      )}
      {restoring !== null && (
        <RestoreBackupDialog
          siteKey={siteKey}
          backup={restoring}
          onClose={() => setRestoring(null)}
          onDone={(scope) => {
            restored({ backup: restoring, scope })
            setRestoring(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Toolbar: Jump to backup, and V2's Type filter (redrawn here: V2 does not export it)
// ---------------------------------------------------------------------------------------------

const toolbarButton =
  'inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-[3px] text-foreground text-xs hover:bg-foreground/5 aria-expanded:bg-foreground/5'

function JumpMenu({ backups, onPick }: { backups: BackupMark[]; onPick: (n: number) => void }): JSX.Element {
  return (
    <Popover
      align="end"
      className="min-w-64"
      trigger={(props) => (
        <button type="button" className={toolbarButton} data-jump {...props}>
          <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {B.jump}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {backups.map((b) => (
        <PopoverItem key={b.id} onClick={() => onPick(b.number)}>
          <span className="w-5 flex-none font-semibold tabular-nums">{b.number}</span>
          <span className="min-w-0 flex-1 truncate">
            {b.initial ? B.initialName : (b.title ?? stamp(b.at))}
          </span>
          <span className="flex-none text-muted-foreground text-xs">{shortDay(b.at)}</span>
        </PopoverItem>
      ))}
    </Popover>
  )
}

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
      trigger={(props) => (
        <button type="button" className={toolbarButton} {...props}>
          {filter !== 'all' && <SourceGlyph source={filter} />}
          {S.sourceFilter(filter === 'all' ? S.all : LABEL[filter])}
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
          <span className="flex-1">{LABEL[s]}</span>
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

function Coverage({ coverage }: { coverage: ActivityMerged['coverage'] }): JSX.Element {
  return (
    <div
      className="mx-3.5 mt-1 mb-4 space-y-2.5 border-border border-t pt-3 text-muted-foreground text-xs"
      data-coverage
    >
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
// Shared cells: Time · Type · By, the same on an event and on a milestone
// ---------------------------------------------------------------------------------------------

function MetaCells({
  at,
  basis,
  source,
  by,
  now
}: {
  at: number
  basis: 'occurred' | 'detected'
  /** `null` for a backup: not one of the filter's Types, so the cell reads the archive mark and `Backup`. */
  source: SourceKind | null
  by: By
  now: number
}): JSX.Element {
  const narrowLabel = 'text-muted-foreground @min-[640px]:sr-only'
  const words = ago(at, now)
  return (
    <span
      className="mt-1.5 flex @min-[640px]:contents flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      data-meta
    >
      <span className="@min-[640px]:mt-0.5 inline-flex min-w-0 items-center gap-1" data-cell="time">
        <span className={narrowLabel}>{S.narrowLabel.time}</span>
        <time
          dateTime={new Date(at * 1000).toISOString()}
          title={absolute(at)}
          className="whitespace-nowrap text-muted-foreground"
        >
          {basis === 'detected' ? S.detected(words) : words}
        </time>
      </span>
      <span className="@min-[640px]:mt-0.5 inline-flex min-w-0 items-center gap-1" data-cell="source">
        <span className={narrowLabel}>{S.narrowLabel.source}</span>
        {source === null ? (
          <>
            <Archive className="size-3.5 flex-none text-primary" aria-hidden="true" />
            <span className="truncate text-foreground">{B.backupMark}</span>
          </>
        ) : (
          <>
            <SourceGlyph source={source} />
            <span className="truncate text-foreground">{LABEL[source]}</span>
          </>
        )}
      </span>
      <span
        className="@min-[640px]:mt-0.5 inline-flex min-w-0 items-center gap-1.5"
        data-cell="by"
        title={byTitle(by)}
      >
        <span className={narrowLabel}>{S.narrowLabel.by}</span>
        <ByFace by={by} />
        <span className={cn('truncate', by.kind === 'unknown' ? 'text-muted-foreground' : 'text-foreground')}>
          {byName(by)}
        </span>
      </span>
    </span>
  )
}

const rowButton =
  'min-w-0 flex-1 cursor-pointer rounded-[9px] py-2 pr-1 pl-2 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2'

// ---------------------------------------------------------------------------------------------
// The milestone
// ---------------------------------------------------------------------------------------------

/** The capability badge: words, never colour alone; `DB ✗` reads as a warning. */
function CapabilityBadge({ capability }: { capability: Capability }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center whitespace-nowrap rounded-full border px-1.5 py-px font-medium text-[10px] leading-4',
        capability === 'full' && 'border-primary/30 bg-primary/10 text-primary',
        capability === 'content' && 'border-primary/30 bg-primary/10 text-primary',
        capability === 'files-only' && 'border-border bg-muted text-muted-foreground',
        capability === 'db-missing' &&
          'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300'
      )}
      title={B.badgeTitle[capability]}
      data-capability={capability}
    >
      {B.badge[capability]}
    </span>
  )
}

const secondLine = (b: BackupMark, changes: number | null): string =>
  b.capability === 'db-missing'
    ? B.dbMissingLine
    : changes !== null && b.since.number !== null
      ? B.changesSince(changes, b.since.number)
      : b.since.files === null
        ? B.emdashSince(b.since.number)
        : B.filesSince(b.since.files, b.since.number)

/** A Restore everything row with the Before-restore backup its host made first (its return point). */
type RestoreRecord = ChangeEvent & { returnPoint?: number }
const returnPointOf = (i: TimelineItem): number | undefined =>
  isBackup(i) ? undefined : (i as RestoreRecord).returnPoint

/**
 * The full milestone. Its tint and accent edge are a background and an inset shadow — never a
 * border or a padding change — so its cells start exactly where every other row's do.
 */
function BackupRow({
  backup: b,
  changes = null,
  now,
  open,
  flash,
  onToggle,
  onRestore
}: {
  backup: BackupMark
  /** Changes recorded since the previous backup; null where the list cannot tell. */
  changes?: number | null
  now: number
  open: boolean
  flash: boolean
  onToggle: () => void
  onRestore: () => void
}): JSX.Element {
  return (
    <li
      className={cn(
        'my-1 rounded-[9px] bg-primary/[0.06] shadow-[inset_3px_0_0_0_var(--primary),inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)] transition-[background-color] duration-500',
        flash && 'bg-primary/20'
      )}
      data-event={b.id}
      data-backup={b.number}
      data-open={open || undefined}
      data-flash={flash || undefined}
    >
      <div className={cn('group/m flex items-start rounded-[9px]', !open && 'hover:bg-primary/[0.05]')}>
        <button type="button" className={cn(rowButton, COLS)} aria-expanded={open} onClick={onToggle}>
          <span className="block min-w-0" data-cell="description">
            <span className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
              <Archive className="size-3.5 flex-none text-primary" aria-hidden="true" />
              {/* One line even when open: the detail heads with the full name, and a wrapping
                  line would move the Time and By text down the row. */}
              <span className="min-w-0 truncate font-semibold" title={B.name(b)} data-name>
                {B.name(b)}
              </span>
            </span>
            {/* The badge opens the second line, so a long badge never squeezes the name. */}
            <span
              className={cn(
                'mt-0.5 flex min-w-0 items-center gap-1.5 pl-5 text-xs',
                b.capability === 'db-missing' ? 'text-destructive dark:text-red-300' : 'text-muted-foreground'
              )}
              data-scope
            >
              <CapabilityBadge capability={b.capability} />
              <span className="min-w-0 truncate">{secondLine(b, changes)}</span>
            </span>
          </span>
          <MetaCells at={b.at} basis="occurred" source={null} by={b.by} now={now} />
        </button>
        <div className="mt-[5px] mr-1 flex-none">
          <BackupMenu backup={b} shown={open} onRestore={onRestore} />
        </div>
      </div>
      {open && (
        <div className="pt-0.5 pr-3 pb-3 pl-2" data-detail>
          <BackupDetail backup={b} now={now} onRestore={onRestore} />
        </div>
      )}
    </li>
  )
}

/** Under any Type filter: the milestone folds to one thin line that keeps the time frame. */
function BackupDivider({ backup: b, flash }: { backup: BackupMark; flash: boolean }): JSX.Element {
  return (
    <li
      className={cn(
        'my-1 flex items-center gap-2 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-[background-color] duration-500',
        flash && 'bg-primary/20'
      )}
      data-backup-divider={b.number}
      data-flash={flash || undefined}
      aria-label={`${B.name(b)}, ${shortDay(b.at)}`}
      title={B.name(b)}
    >
      <span className="h-px flex-1 bg-primary/30" aria-hidden="true" />
      <Archive className="size-3 flex-none text-primary" aria-hidden="true" />
      <span className="flex-none font-medium tabular-nums" aria-hidden="true">
        {B.divider(b)}
      </span>
      <span className="h-px flex-1 bg-primary/30" aria-hidden="true" />
    </li>
  )
}

function BackupMenu({
  backup: b,
  shown,
  onRestore
}: {
  backup: BackupMark
  shown: boolean
  onRestore: () => void
}): JSX.Element {
  const v = verbs(b)
  return (
    <Popover
      align="end"
      trigger={(props) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            'flex-none focus-visible:opacity-100 group-hover/m:opacity-100 aria-expanded:opacity-100',
            shown ? 'opacity-100' : 'opacity-0'
          )}
          aria-label={S.moreActions}
          {...props}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      )}
    >
      {/* One item since Brian 03/10: the dialog chooses the scope. */}
      <PopoverItem onClick={onRestore}>
        <RotateCcw className="size-4 flex-none" aria-hidden="true" />
        {v.content ? B.restoreContent : B.restore}
      </PopoverItem>
    </Popover>
  )
}

function Block({ children, label }: { children: ReactNode; label: string }): JSX.Element {
  return (
    <div
      className="mt-2.5 border-border border-t pt-2 first:mt-0 first:border-t-0 first:pt-0"
      data-block={label}
    >
      {children}
    </div>
  )
}

/** Order: name + notes → who and when → what it keeps → files since → technical → actions. */
function BackupDetail({
  backup: b,
  now,
  onRestore
}: {
  backup: BackupMark
  now: number
  onRestore: () => void
}): JSX.Element {
  const strong = 'font-medium text-foreground'
  const v = verbs(b)
  const keeps = b.initial
    ? b.capability === 'full' || b.capability === 'content'
      ? B.initialFull
      : B.initialFiles
    : B.keeps[b.capability]
  return (
    <div className="pl-5 text-xs">
      <Block label="notes">
        <h4 className="m-0 font-semibold text-foreground text-sm [overflow-wrap:anywhere]">{B.name(b)}</h4>
        {b.notes !== null ? (
          <p
            className="m-0 mt-1 whitespace-pre-line text-foreground text-sm leading-5 [overflow-wrap:anywhere]"
            aria-label={B.notesTitle}
          >
            {b.notes}
          </p>
        ) : (
          <p className="m-0 mt-1 text-muted-foreground">{B.noNotes}</p>
        )}
      </Block>
      <Block label="identity">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <ByFace by={b.by} size="size-4" />
          <span>
            {B.backedUpBy} <span className={strong}>{byName(b.by)}</span>
          </span>
        </span>
        <p className="m-0 mt-1 flex items-start gap-1.5 text-muted-foreground">
          <Info className="mt-px size-3.5 flex-none" aria-hidden="true" />
          <span>
            {S.timeOccurred(absolute(b.at))} ({ago(b.at, now)})
          </span>
        </p>
        {b.beforeRestoreTo !== undefined && (
          <p className="m-0 mt-1 text-muted-foreground">{B.beforeRestore(b.beforeRestoreTo)}</p>
        )}
      </Block>
      <Block label="keeps">
        <h4 className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-foreground text-xs">
          <Database className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {B.keepsTitle}
          <CapabilityBadge capability={b.capability} />
        </h4>
        <p
          className={cn(
            'm-0',
            b.capability === 'db-missing' ? 'text-destructive dark:text-red-300' : 'text-foreground'
          )}
          data-keeps
        >
          {keeps}
        </p>
      </Block>
      {!b.initial && b.since.files !== null && b.capability !== 'db-missing' && (
        <Block label="files">
          <h4 className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-foreground text-xs">
            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {S.filesTitle}
          </h4>
          <p className="m-0 text-foreground" data-files-since>
            {B.filesSince(b.since.files, b.since.number)}
          </p>
          <p className="m-0 mt-0.5 text-muted-foreground">{B.filesSinceHint}</p>
        </Block>
      )}
      <Block label="technical">
        <details>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {S.technical}
          </summary>
          <dl className="m-0 mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Tag</dt>
            <dd className="m-0 font-mono">{`tracy-release/v${b.number}`}</dd>
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="m-0 truncate font-mono">{b.sha}</dd>
            {b.database && (
              <>
                <dt className="text-muted-foreground">Database</dt>
                <dd className="m-0 truncate font-mono" title={b.database.sha256}>
                  {`${b.database.engine} · ${b.database.size} · sha256:${b.database.sha256.slice(0, 12)}`}
                </dd>
              </>
            )}
          </dl>
        </details>
      </Block>
      <Block label="actions">
        <div className="flex flex-wrap items-center gap-2">
          {/* One button since Brian 03/10 (was Restore files… beside Restore everything…). */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-restore={v.content ? 'content' : 'backup'}
            onClick={onRestore}
          >
            <RotateCcw aria-hidden="true" />
            {v.content ? B.restoreContent : B.restore}
          </Button>
          {(b.capability === 'files-only' || b.capability === 'db-missing') && (
            <p className="m-0 basis-full text-muted-foreground" data-no-everything>
              {B.noEverything[b.capability]}
            </p>
          )}
          {b.capability === 'content' && (
            <p className="m-0 basis-full text-muted-foreground" data-no-files>
              {B.noFilesEmdash}
            </p>
          )}
        </div>
      </Block>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------------------------

function useBusy(onDone: () => void): [boolean, () => void] {
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return [
    busy,
    () => {
      setBusy(true)
      timer.current = setTimeout(onDone, 300)
    }
  ]
}

/**
 * Create a backup (Brian 03/10/2026, second take): the title is a field from the start, holding the
 * date and time, with `Backup {n} ·` before it as a fixed prefix — the number cannot be edited, so
 * the list never reads it twice. No Edit link, no Save or Cancel of its own. Left as it is, the
 * stored title is the date and time; a typed one is stored without a leading `Backup {n} · `; an
 * emptied one is the date and time. The description, the "files and database are both kept" line,
 * the placeholder and the hint are gone.
 */
function CreateBackupDialog({
  siteKey,
  number,
  at,
  since,
  changes,
  draft,
  onClose,
  onDone
}: {
  siteKey: string
  number: number
  /** Seconds: the time at the press; a story pins it. */
  at: number
  since: string
  changes: number
  draft: string
  onClose: () => void
  onDone: (title: string, notes: string) => void
}): JSX.Element {
  const prefix = `Backup ${number} · `
  /** What the person typed in the title; `null` until they type. */
  const [typed, setTyped] = useState<string | null>(null)
  const [notes, setNotes] = useState(draft)
  const stored = (): string => {
    if (typed === null) return stamp(at)
    let text = typed.trim()
    const head = prefix.trim()
    while (text.startsWith(head)) text = text.slice(head.length).trim()
    return text || stamp(at)
  }
  const [busy, go] = useBusy(() => onDone(stored(), notes.trim()))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        closeLabel="Close"
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{B.createTitle(number, siteKey)}</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 grid min-h-0 content-start gap-3 overflow-y-auto px-1">
          <div className="grid gap-1.5">
            <Label htmlFor="mock-backup-title">{B.nameLabel}</Label>
            <InputGroup className="bg-transparent dark:bg-transparent">
              <InputGroupAddon align="inline-start">
                <InputGroupText data-title-prefix="number">{prefix.trim()}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="mock-backup-title"
                value={typed ?? stamp(at)}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={120}
                autoComplete="off"
                data-title-input
              />
            </InputGroup>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mock-backup-notes">{B.notesTitle}</Label>
            <Textarea
              id="mock-backup-notes"
              rows={7}
              className="max-h-[min(13.625rem,40vh)] overflow-y-auto"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-draft
            />
            <p className="m-0 text-muted-foreground text-xs">{B.notesHint(changes, since)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {S.cancel}
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={go}>
            <Archive aria-hidden="true" />
            {busy ? B.creating : B.createConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The scope inside Restore…: two radios when both scopes can be pressed (Everything first), else
 * the one scope stated — `Restore: Files only` — with why the other is not offered. Files only
 * always says what it breaks: the webroot tracks uploads, so images uploaded since are removed
 * while the posts that use them stay in the database.
 */
function ScopeChoice({
  backup: b,
  scope,
  onScope
}: {
  backup: BackupMark
  scope: Scope
  onScope: (scope: Scope) => void
}): JSX.Element {
  const v = verbs(b)
  const label = (s: Scope): string => (s === 'files' ? B.scopeFiles : B.scopeEverything)
  const warning = (
    <span className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs" data-scope-warning>
      <TriangleAlert className="mt-0.5 size-3.5 flex-none text-amber-600" aria-hidden="true" />
      {B.scopeFilesWarning}
    </span>
  )
  if (!(v.everything && v.files))
    return (
      <div className="grid gap-1 rounded-md border border-border p-2.5 text-sm" data-scope-only={scope}>
        <span>
          <span className="text-muted-foreground">{B.scopeLabel}: </span>
          <span className="font-medium">{label(scope)}</span>
        </span>
        {scope === 'files' && warning}
        {(b.capability === 'files-only' || b.capability === 'db-missing') && (
          <span className="text-muted-foreground text-xs" data-scope-why>
            {B.noEverything[b.capability]}
          </span>
        )}
      </div>
    )
  return (
    <div role="radiogroup" aria-label={B.scopeLabel} className="grid gap-2" data-scope-choice>
      {(['everything', 'files'] as const).map((s) => (
        <label
          key={s}
          className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary"
          data-scope-option={s}
        >
          <input
            type="radio"
            name="mock-restore-scope"
            value={s}
            checked={scope === s}
            onChange={() => onScope(s)}
            className="mt-0.5"
          />
          <span className="grid">
            <span className="font-medium">{label(s)}</span>
            {s === 'files' && warning}
          </span>
        </label>
      ))}
    </div>
  )
}

/**
 * Restore… (Brian 03/10/2026): ONE dialog, the scope chosen in it. Everything (selected first)
 * draws the heavy content, Files only the files content; switching scope swaps the content inside
 * the same window. EmDash's Restore content… has no scope step.
 */
function RestoreBackupDialog({
  siteKey,
  backup: b,
  onClose,
  onDone
}: {
  siteKey: string
  backup: BackupMark
  onClose: () => void
  onDone: (scope: Scope) => void
}): JSX.Element {
  const v = verbs(b)
  const [scope, setScope] = useState<Scope>(v.everything || v.content ? 'everything' : 'files')
  const choice = v.content ? null : <ScopeChoice backup={b} scope={scope} onScope={setScope} />
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {scope === 'files' ? (
        <RestoreFilesContent
          siteKey={siteKey}
          backup={b}
          choice={choice}
          onClose={onClose}
          onDone={() => onDone('files')}
        />
      ) : (
        <RestoreEverythingContent
          siteKey={siteKey}
          backup={b}
          choice={choice}
          onClose={onClose}
          onDone={() => onDone('everything')}
        />
      )}
    </Dialog>
  )
}

/** Files only: the shipped files-only words, "release" now "backup". Cancel holds the focus. */
function RestoreFilesContent({
  siteKey,
  backup: b,
  choice,
  onClose,
  onDone
}: {
  siteKey: string
  backup: BackupMark
  choice: ReactNode
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [busy, go] = useBusy(onDone)
  return (
    <DialogContent closeLabel="Close" className="sm:max-w-md" data-restore-scope="files">
      <DialogHeader>
        <DialogTitle>{B.filesTitle(siteKey, B.name(b))}</DialogTitle>
        <DialogDescription data-restore-body>{B.filesBody}</DialogDescription>
      </DialogHeader>
      {choice}
      <p className="m-0 text-muted-foreground text-sm">{B.filesKeeps}</p>
      <DialogFooter>
        <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
          {S.cancel}
        </Button>
        <Button size="sm" disabled={busy} onClick={go}>
          <RotateCcw aria-hidden="true" />
          {busy ? B.restoring : B.filesConfirm}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * Everything (EmDash: Restore content): names what is deleted, takes a "Before restore" backup
 * first, and stays shut until the site name is typed exactly — like deleting a site.
 */
function RestoreEverythingContent({
  siteKey,
  backup: b,
  choice,
  onClose,
  onDone
}: {
  siteKey: string
  backup: BackupMark
  choice: ReactNode
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, go] = useBusy(onDone)
  const emdash = b.capability === 'content'
  const when = absolute(b.at)
  // As My Sites' delete (Brian 03/10): the fixed word, any case — not the site address.
  const matches = typed.trim().toLowerCase() === 'restore'
  return (
    <DialogContent closeLabel="Close" className="sm:max-w-md" data-restore-scope="everything">
      <DialogHeader>
        <DialogTitle>
          {emdash ? B.contentTitle(siteKey, B.name(b)) : B.everythingTitle(siteKey, B.name(b))}
        </DialogTitle>
        <DialogDescription>{emdash ? B.contentBody(when) : B.everythingBody(when)}</DialogDescription>
      </DialogHeader>
      {choice}
      <div
        className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs"
        data-lost
        role="alert"
      >
        <p className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-destructive dark:text-red-300">
          <TriangleAlert className="size-3.5 flex-none" aria-hidden="true" />
          {B.lostTitle(when)}
        </p>
        <ul className="m-0 list-disc pl-5 text-foreground">
          {B.lost.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <p className="m-0 flex items-start gap-1.5 text-foreground text-sm" data-before-first>
        <Archive className="mt-0.5 size-3.5 flex-none text-primary" aria-hidden="true" />
        {B.beforeFirst}
      </p>
      {emdash && (
        <p className="m-0 text-muted-foreground text-sm">
          {B.emdashOffline} {B.templateKept}
        </p>
      )}
      <div className="grid gap-2 pt-1">
        <Label htmlFor="mock-restore-confirm" className="font-normal text-muted-foreground">
          {B.typeRestore}
        </Label>
        <Input
          id="mock-restore-confirm"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          placeholder="Restore"
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
          {S.cancel}
        </Button>
        <Button
          size="sm"
          className="bg-destructive text-white hover:bg-destructive/90 disabled:bg-destructive/40"
          disabled={busy || !matches}
          onClick={go}
        >
          <Database aria-hidden="true" />
          {busy ? B.restoring : emdash ? B.contentConfirm : B.everythingConfirm}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------------------------
// An ordinary event: V2's row line, with a short stand-in detail (the full one is V2's)
// ---------------------------------------------------------------------------------------------

function EventRow({
  event: e,
  now,
  open,
  onToggle,
  returnPoint,
  flash = false,
  onRestore
}: {
  event: ChangeEvent
  now: number
  open: boolean
  onToggle: () => void
  /** A Restore everything's own Before-restore backup: named on the row, its Restore… in the detail. */
  returnPoint?: BackupMark
  flash?: boolean
  onRestore?: (b: BackupMark) => void
}): JSX.Element {
  const scope = scopeLine(e)
  const status = undoStatus(e)
  return (
    <li
      className={cn(
        'rounded-[9px] border-border border-b last:border-b-0',
        open && 'bg-foreground/[0.03] shadow-[inset_0_0_0_1px_var(--border)]'
      )}
      data-event={e.id}
      data-source={e.source}
      data-open={open || undefined}
      data-return-point-of={returnPoint?.number}
      data-flash={flash || undefined}
    >
      <div
        className={cn(
          'flex items-start rounded-[9px]',
          !open && 'hover:bg-foreground/5',
          flash && 'bg-primary/20'
        )}
      >
        <button type="button" className={cn(rowButton, COLS)} aria-expanded={open} onClick={onToggle}>
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
                {returnPoint && (
                  <span data-return-point={returnPoint.number}> · {B.returnPoint(returnPoint.number)}</span>
                )}
              </span>
            </span>
            {(scope !== null || status !== null) && (
              <span
                className={cn('mt-0.5 block text-muted-foreground text-xs', status === null && 'truncate')}
                data-scope
              >
                {status === 'partly' ? (
                  <span className="text-amber-700 dark:text-amber-400">{S.partlyUndone}</span>
                ) : status === 'files' ? (
                  <span className="text-amber-700 dark:text-amber-400">{S.filesUndone}</span>
                ) : (
                  scope
                )}
              </span>
            )}
          </span>
          <MetaCells at={e.time.at} basis={e.time.basis} source={e.source} by={e.by} now={now} />
        </button>
        <span className="mt-[5px] mr-1 block size-7 flex-none" aria-hidden="true" />
      </div>
      {open && (
        <div className="space-y-1 pt-0.5 pr-3 pb-3 pl-2 text-muted-foreground text-xs" data-detail>
          <p className="m-0">
            {e.time.basis === 'detected'
              ? S.timeDetected(absolute(e.time.at))
              : S.timeOccurred(absolute(e.time.at))}
          </p>
          {e.request !== undefined && (
            <blockquote className="m-0 border-border border-l-2 pl-2.5 text-foreground text-sm leading-5">
              {e.request.text}
            </blockquote>
          )}
          {returnPoint && onRestore && (
            <div className="pt-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRestore(returnPoint)}
                data-restore-return={returnPoint.number}
              >
                <RotateCcw aria-hidden="true" />
                {B.restoreReturnPoint(returnPoint.number)}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
