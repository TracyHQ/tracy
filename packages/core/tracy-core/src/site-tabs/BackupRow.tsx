/**
 * A backup as a milestone of Site changes (ADR 0024), on the list's vertical timeline (layout C,
 * chosen by Akemi 24/10/2026 over the tinted, edged box of `@tracy/design` › `Mockups/Site changes
 * backup`, which read like an error): a filled node on the line, the backup's name, and the muted
 * meta line (who · when · what it keeps since the previous one). Restore… and Download… sit in the
 * list's right-hand actions column, always on screen. Under a Source filter it folds to a divider
 * that keeps the time frame.
 *
 * Detail order: name + notes → who and when → what it keeps → files since → technical → actions.
 * One Restore… per point (Brian 03/10): its dialog chooses Everything or Files only (ADR §2, two scopes
 * by risk), each offered only where the point proves it can; EmDash keeps its one Restore content….
 */
import { type JSX, type ReactNode } from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileCode2,
  Info,
  RotateCcw
} from 'lucide-react'
import { Button } from '@tracy/ui'

import { interfaceLocale } from '../interface-languages/index.mjs'
import type { Translate } from '../team/translate'
import type { BackupMay } from './api'
import { downloadable } from './backup-download'
import { type BackupPoint, type Capability, restorePressable, restoreScopes, verbsOf } from './backup-list'
import { MenuKeys } from './ActivityEventRow'
import type { TimeWords } from './moment-list'
import { ActorFace, actorName } from './pieces'
import { Popover, PopoverItem } from './Popover'

export type RestoreScope = 'files' | 'everything'

const isoOf = (at: number | null): string | null => (at === null ? null : new Date(at * 1000).toISOString())

/** "Initial backup — site as built", "Backup 4 · Before restore to Backup 2", "Backup 3 · <title>". */
export function backupName(b: BackupPoint, t: Translate): string {
  if (b.initial) return t('backup.initialName')
  if (b.beforeRestoreTo !== null) return t('backup.beforeRestoreName', { n: b.version, m: b.beforeRestoreTo })
  return t('backup.name', { n: b.version, title: b.title })
}

/** "Initial backup", "Backup 4". */
export const backupShort = (b: Pick<BackupPoint, 'initial' | 'version'>, t: Translate): string =>
  b.initial ? t('backup.initialShort') : t('backup.short', { n: b.version })

/** The capability badge: words, never colour alone; `DB ✗` reads as a warning. */
export function CapabilityBadge({ capability, t }: { capability: Capability; t: Translate }): JSX.Element {
  return (
    <span
      className="tv-backup-badge"
      data-capability={capability}
      title={t(`backup.badgeTitle.${capability}`)}
    >
      {t(`backup.badge.${capability}`)}
    </span>
  )
}

function secondLine(b: BackupPoint, changes: number | null, t: Translate): string {
  if (b.capability === 'db-missing') return t(`backup.dbMissing.${b.reason ?? 'missing'}`)
  if (b.previous === null && b.initial) return t('backup.handedOver')
  // Every change Site changes recorded since the previous backup, not only files (Brian 03/10:
  // "0 files changed" hid three posts updated in between). The file count stays in the detail.
  if (changes !== null && b.previous !== null)
    return t(`backup.changesSince.${changes === 1 ? 'one' : 'many'}`, { count: changes, n: b.previous })
  if (b.files === null)
    return b.previous === null ? t('backup.handedOver') : t('backup.emdashSince', { n: b.previous })
  if (b.previous === null) return t('backup.handedOver')
  return t(`backup.filesSince.${b.files === 1 ? 'one' : 'many'}`, { count: b.files, n: b.previous })
}

export interface BackupRowProps {
  backup: BackupPoint
  /** Changes recorded since the previous backup (`mergeTimeline`); null when the list cannot tell. */
  changes?: number | null
  open: boolean
  flash: boolean
  fileHistory: boolean
  /**
   * What this seat may restore (`/backups` `may`); null = the server did not say, so every verb is
   * offered and the door decides. A verb the seat may not press stays visible, disabled, with why
   * (QA-I14): a dialog the door then refuses is the wrong place to learn it.
   */
  may: BackupMay | null
  time: TimeWords
  onToggle: () => void
  /** Restore… (or EmDash's Restore content…): the dialog chooses the scope. */
  onRestore: (backup: BackupPoint) => void
  /**
   * Download… (plan todo-backup-export): offered only where `may.export` says this seat may (an
   * Owner) and the point is a full backup (`downloadable`). Absent: never offered.
   */
  onDownload?: (backup: BackupPoint) => void
  /**
   * The seat may not change the site (a Viewer, ADR 0028): no Restore at all, neither in the menu
   * nor under the detail. Hidden, not disabled with a why: restoring is nothing this seat does.
   */
  readOnly?: boolean
  t: Translate
}

/** The full milestone, under All: a filled node on the timeline, its name, and the muted meta line. */
export function BackupRow(props: BackupRowProps): JSX.Element {
  const { backup: b, open, flash, time, onToggle, t } = props
  const iso = isoOf(b.at)
  return (
    <li
      className="tv-backup"
      data-event={`backup-${b.version}`}
      data-backup={b.version}
      data-capability={b.capability}
      data-open={open || undefined}
      data-flash={flash || undefined}
    >
      <div className="tv-row-box">
        <div className="tv-row-head">
          <button type="button" className="tv-activity-event-main" aria-expanded={open} onClick={onToggle}>
            <ChevronRight className="tv-row-chevron" aria-hidden="true" />
            <span className="tv-row-body">
              <span className="tv-activity-desc-line" data-cell="description">
                {/* One line even when open: the detail heads with the full name. */}
                <span className="tv-backup-name" title={backupName(b, t)} data-name>
                  {backupName(b, t)}
                </span>
              </span>
              <span className="tv-row-meta" data-meta data-warn={b.capability === 'db-missing' || undefined}>
                <span className="tv-row-part" data-cell="by">
                  <ActorFace by={b.by} className="size-4" />
                  <span className="tv-activity-cell-text">{actorName(b.by, t)}</span>
                </span>
                <span className="tv-row-part" data-cell="time">
                  <time
                    className="tv-activity-time"
                    dateTime={iso ?? undefined}
                    title={iso ? time.absolute(iso) : undefined}
                  >
                    {iso ? time.ago(iso) : t('event.unknown')}
                  </time>
                </span>
                <span className="tv-row-part tv-row-scope" data-scope>
                  {secondLine(b, props.changes ?? null, t)}
                </span>
                {/* Said only when it is something to watch: a full backup is the normal case. */}
                {b.capability !== 'full' && <CapabilityBadge capability={b.capability} t={t} />}
              </span>
            </span>
          </button>
          <div className="tv-row-actions">
            <BackupActions {...props} />
          </div>
        </div>
        {open && (
          <div className="tv-activity-detail tv-backup-detail" data-detail>
            <BackupDetail {...props} />
          </div>
        )}
      </div>
    </li>
  )
}

/** Under a Source filter: one thin line that keeps the time frame. */
export function BackupDivider({
  backup: b,
  flash,
  t
}: {
  backup: BackupPoint
  flash: boolean
  t: Translate
}): JSX.Element {
  const day =
    b.at === null
      ? ''
      : new Date(b.at * 1000).toLocaleDateString(interfaceLocale(), { month: 'short', day: 'numeric' })
  const words = t('backup.divider', { name: backupShort(b, t), day })
  return (
    <li
      className="tv-backup-divider"
      data-backup-divider={b.version}
      data-flash={flash || undefined}
      aria-label={`${backupName(b, t)}, ${day}`}
      title={backupName(b, t)}
    >
      <span className="tv-backup-divider-rule" aria-hidden="true" />
      <span className="tv-backup-divider-text" aria-hidden="true">
        {words}
      </span>
      <span className="tv-backup-divider-rule" aria-hidden="true" />
    </li>
  )
}

/** Whether this seat may press each verb (true when the server did not say: the door decides). */
const allowed = (may: BackupMay | null): { files: boolean; everything: boolean } => ({
  files: may?.restoreFiles ?? true,
  everything: may?.restoreEverything ?? true
})

/** Why a verb is off for this seat, in the words of the door's own refusal. */
const forbiddenWords = (scope: RestoreScope, content: boolean, t: Translate): string =>
  scope === 'files'
    ? t('backup.forbidden.files')
    : content
      ? t('backup.forbidden.content')
      : t('backup.err.forbidden')

/**
 * The milestone's actions, always on screen in the list's right-hand column: one Restore… (or
 * EmDash's Restore content…), disabled with the why in the detail when this seat may not press it,
 * and Download… where this seat may export the point. A Viewer seat sees neither. Nothing else is
 * left for a … menu, so a backup has none; its empty place keeps the buttons in line with the rows'.
 */
function BackupActions({
  backup: b,
  fileHistory,
  may,
  onRestore,
  onDownload,
  readOnly = false,
  t
}: BackupRowProps): JSX.Element {
  const v = verbsOf(b, { fileHistory })
  const content = restoreScopes(b, { fileHistory, may }).content
  const download = !readOnly && onDownload !== undefined && downloadable(b, may)
  return (
    <>
      {!readOnly && (v.files || v.everything || v.content) && (
        <button
          type="button"
          className="tv-row-action"
          data-row-restore={b.version}
          disabled={!restorePressable(b, { fileHistory, may })}
          onClick={() => onRestore(b)}
        >
          <RotateCcw aria-hidden="true" />
          {content ? t('backup.restoreContent') : t('backup.restore')}
        </button>
      )}
      {download && (
        <button
          type="button"
          className="tv-row-action"
          data-row-download={b.version}
          onClick={() => onDownload(b)}
        >
          <Download aria-hidden="true" />
          {t('backup.download')}
        </button>
      )}
      <span className="tv-row-more-slot" aria-hidden="true" />
    </>
  )
}

function Block({ block, children }: { block: string; children: ReactNode }): JSX.Element {
  return (
    <div className="tv-activity-block" data-block={block}>
      {children}
    </div>
  )
}

function BackupDetail({
  backup: b,
  fileHistory,
  may,
  time,
  onRestore,
  readOnly = false,
  t
}: BackupRowProps): JSX.Element {
  const v = verbsOf(b, { fileHistory })
  const scopes = restoreScopes(b, { fileHistory, may })
  const ok = allowed(may)
  // One line per verb this seat may not press, said once even when both are off.
  const forbidden = [
    ...(v.files && !ok.files ? [forbiddenWords('files', false, t)] : []),
    ...((v.everything || v.content) && !ok.everything ? [forbiddenWords('everything', v.content, t)] : [])
  ]
  const iso = isoOf(b.at)
  const keeps = b.initial
    ? b.capability === 'full' || b.capability === 'content'
      ? t('backup.initialFull')
      : t('backup.initialFiles')
    : t(`backup.keeps.${b.capability}`)
  return (
    <div className="tv-activity-detail-body">
      <Block block="notes">
        <h4 className="tv-backup-detail-name">{backupName(b, t)}</h4>
        {b.notes ? (
          <p className="tv-backup-notes" aria-label={t('backup.notesTitle')}>
            {b.notes}
          </p>
        ) : (
          <p className="tv-moment-lead">{t('backup.noNotes')}</p>
        )}
      </Block>
      <Block block="identity">
        <span className="tv-activity-identity-who">
          <ActorFace by={b.by} className="size-4" />
          <span className="min-w-0">
            {t('backup.backedUpBy')} <span className="tv-activity-strong">{actorName(b.by, t)}</span>
          </span>
        </span>
        {iso && (
          <p className="tv-activity-note">
            <Info className="tv-activity-note-icon" aria-hidden="true" />
            <span>
              {t('event.timeOccurred', { at: time.absolute(iso) })} ({time.ago(iso)})
            </span>
          </p>
        )}
        {b.beforeRestoreTo !== null && (
          <p className="tv-moment-lead tv-activity-gap">
            {t('backup.beforeRestore', { n: b.beforeRestoreTo })}
          </p>
        )}
      </Block>
      <Block block="keeps">
        <h4 className="tv-activity-section-title">
          <Database className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t('backup.keepsTitle')}
          <CapabilityBadge capability={b.capability} t={t} />
        </h4>
        <p className="tv-backup-keeps" data-keeps data-warn={b.capability === 'db-missing' || undefined}>
          {keeps}
        </p>
      </Block>
      {!b.initial && b.files !== null && b.previous !== null && b.capability !== 'db-missing' && (
        <Block block="files">
          <h4 className="tv-activity-section-title">
            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {t('event.group.files')}
          </h4>
          <p className="tv-backup-keeps" data-files-since>
            {t(`backup.filesSince.${b.files === 1 ? 'one' : 'many'}`, { count: b.files, n: b.previous })}
          </p>
          <p className="tv-moment-lead">{t('backup.filesSinceHint')}</p>
        </Block>
      )}
      <Block block="technical">
        <details>
          <summary className="tv-activity-summary">{t('event.technical')}</summary>
          <dl className="tv-activity-tech">
            <dt>{t('backup.tech.tag')}</dt>
            {/* The tag's own name on the site: backups keep the `tracy-release/` prefix the points were
                numbered under, data on every site (ADR 0024, amendment 2). */}
            <dd>{`tracy-release/v${b.version}`}</dd>
            <dt>{t('event.tech.commit')}</dt>
            <dd title={b.sha}>{b.sha}</dd>
            {b.database && b.database.state === 'full' && b.database.sha256 && (
              <>
                <dt>{t('backup.tech.database')}</dt>
                <dd title={b.database.sha256}>
                  {`${b.database.engine ?? ''} · ${b.database.size ?? '?'} B · sha256:${b.database.sha256.slice(0, 12)}`}
                </dd>
              </>
            )}
          </dl>
        </details>
      </Block>
      {/* What may be restored, and why not: nothing for a seat that changes nothing (a Viewer). */}
      {!readOnly && (
        <Block block="actions">
          <div className="tv-activity-actions">
            {(v.files || v.everything || v.content) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-restore={v.content ? 'content' : 'backup'}
                disabled={v.content ? !ok.everything : !(scopes.everything || scopes.files)}
                onClick={() => onRestore(b)}
              >
                <RotateCcw aria-hidden="true" />
                {v.content ? t('backup.restoreContent') : t('backup.restore')}
              </Button>
            )}
            {forbidden.map((words) => (
              <p key={words} className="tv-moment-lead tv-backup-why" data-forbidden>
                {words}
              </p>
            ))}
            {(b.capability === 'files-only' || b.capability === 'db-missing') && (
              <p className="tv-moment-lead tv-backup-why" data-no-everything>
                {t(`backup.noEverything.${b.capability}`)}
              </p>
            )}
            {!fileHistory && (
              <p className="tv-moment-lead tv-backup-why" data-no-files>
                {t('backup.noFilesEmdash')}
              </p>
            )}
          </div>
        </Block>
      )}
    </div>
  )
}

/** `Jump to backup ▾`: every backup the list shows, newest first. */
export function JumpMenu({
  backups,
  onPick,
  t
}: {
  backups: readonly BackupPoint[]
  onPick: (version: number) => void
  t: Translate
}): JSX.Element {
  return (
    <Popover
      align="end"
      className="min-w-64"
      trigger={(p) => (
        <button type="button" className="tv-changes-filter tv-backup-jump" data-jump {...p}>
          <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t('backup.jump')}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      <MenuKeys>
        {backups.map((b) => (
          <PopoverItem key={b.version} onClick={() => onPick(b.version)}>
            <span className="tv-backup-jump-n">{b.version}</span>
            <span className="tv-backup-jump-title">
              {b.initial
                ? t('backup.initialName')
                : b.beforeRestoreTo !== null
                  ? t('backup.beforeRestoreTitle', { m: b.beforeRestoreTo })
                  : b.title}
            </span>
            <span className="tv-backup-jump-day">
              {b.at === null
                ? ''
                : new Date(b.at * 1000).toLocaleDateString(interfaceLocale(), {
                    month: 'short',
                    day: 'numeric'
                  })}
            </span>
          </PopoverItem>
        ))}
      </MenuKeys>
    </Popover>
  )
}
