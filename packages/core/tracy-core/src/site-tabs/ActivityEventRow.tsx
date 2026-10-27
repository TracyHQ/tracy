/**
 * One row of Site changes V2, one RECORDED EVENT, on the list's vertical timeline (layout C, chosen
 * by Akemi 24/10/2026 over the four-column table of `@tracy/design` › `Mockups/Site changes V2`):
 * a dot on the line, a chevron, the title, and one muted line under it (who · type · when · what),
 * so the eye reads one column instead of crossing to columns at the far right. The row's actions sit
 * in one right-hand column shared by every row of the list (`tv-row-actions`), always on screen.
 *
 * Opened, the row and its detail share one box; the detail follows plan §3.2: result and status →
 * identity and source → request → Content / Settings / Files / Other → technical (folded) → the
 * actions the server allows.
 */
import {
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import {
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Cog,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  History,
  Info,
  KeyRound,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  Palette,
  PanelsTopLeft,
  Rocket,
  RotateCcw,
  SlidersHorizontal,
  MessageSquarePlus,
  Timer,
  TriangleAlert,
  Users
} from 'lucide-react'
import { Button, cn } from '@tracy/ui'

import type { Translate } from '../team/translate'
import type { ActivityCoverage, ActivityEffectGroup, ActivityItemV2, ActivitySource } from './api'
import type { BackupPoint } from './backup-list'
import {
  type ByModel,
  byName,
  byOf,
  byTitle,
  CMS_LABEL,
  cmsAccount,
  type CommentRef,
  commentLink,
  type ConversationRef,
  conversationLink,
  conversationOf,
  describe,
  endsInEllipsis,
  readableRequest,
  isFlaggedV2,
  noUndoReason,
  opWord,
  quickOpenOf,
  replyNeedsEllipsis,
  replyOf,
  requestTitleOf,
  resourceText,
  scopeLine,
  targetEventOf,
  timeOf,
  undoEventOf,
  undoStatus,
  undoTarget,
  unit
} from './activity-v2'
import { MomentFiles } from './MomentFiles'
import type { TimeWords } from './moment-list'
import { canAskRevert, revertMessageOf } from './revert-prompt'
import { outcomeKey, reasonWords, type TurnsBook, undoDesignSystemApply } from '../turn-undo/index.mjs'
import { interfaceLocale } from '../interface-languages/index.mjs'
import { engineTurnOf, requestUndoOf } from './request-undo'
import { UndoRequestDialog } from './UndoRequestDialog'
import { ActorFace } from './pieces'
import { Popover, PopoverItem } from './Popover'

const AMBER_TEXT = 'text-amber-700 dark:text-amber-400'

const SOURCE_ICON: Record<ActivitySource, typeof MessageSquare> = {
  chat: MessageSquare,
  comment: MessageSquareText,
  'design-system': Palette,
  setup: Rocket,
  api: KeyRound,
  'cms-admin': PanelsTopLeft,
  automatic: Timer,
  deployment: CloudUpload,
  'site-changes': History,
  unknown: CircleHelp
}

/** The Source glyph: always beside its word, never colour alone. */
export function SourceGlyph({ source }: { source: ActivitySource }): JSX.Element {
  const Icon = SOURCE_ICON[source] ?? CircleHelp
  return <Icon className="tv-activity-glyph" aria-hidden="true" />
}

export const sourceLabel = (source: ActivitySource, t: Translate): string => t(`event.source.${source}`)

/**
 * Inside a {@link Popover}: arrow keys walk the items, Home/End jump, the first item (or the chosen
 * one) takes focus when the menu opens, and Escape gives focus back to the button that opened it.
 * The Popover itself is shared with other plugins' bundles, so the keys live here, around its rows.
 */
export function MenuKeys({ children }: { children: ReactNode }): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null)
  const items = (): HTMLElement[] =>
    box.current ? [...box.current.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')] : []
  useEffect(() => {
    const list = items()
    const start = list.find((i) => i.getAttribute('aria-checked') === 'true') ?? list[0]
    start?.focus({ preventScroll: true })
  }, [])
  const triggerOf = (): HTMLElement | null => {
    const menu = box.current?.closest('[role="menu"]')
    return menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) : null
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (i: number): void => {
      event.preventDefault()
      list[(i + list.length) % list.length]?.focus({ preventScroll: true })
    }
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at <= 0 ? list.length - 1 : at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(list.length - 1)
    else if (event.key === 'Escape' || event.key === 'Tab') triggerOf()?.focus({ preventScroll: true })
  }
  return (
    <div ref={box} className="contents" onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

/** The By face: round for a Tracy seat, square for a CMS account or a service, dashed for Unknown. */
export function ByFace({ by, small = false }: { by: ByModel; small?: boolean }): JSX.Element {
  if (by.kind === 'seat')
    return (
      <ActorFace
        by={{ kind: 'person', name: by.name, email: by.email, face: by.face ?? null }}
        className={small ? 'size-4' : 'size-5'}
      />
    )
  if (by.kind === 'unknown')
    return (
      <span
        className="tv-activity-face"
        data-face="unknown"
        data-small={small || undefined}
        aria-hidden="true"
      >
        <CircleHelp className="size-3" />
      </span>
    )
  return (
    <span className="tv-activity-face" data-face={by.kind} data-small={small || undefined} aria-hidden="true">
      {by.kind === 'cms' ? by.cms.charAt(0) : <Cog className="size-3" />}
    </span>
  )
}

/** The CMS of this site, by name: the event's own, else the coverage's log. */
export function cmsOf(item: ActivityItemV2 | null, coverage: ActivityCoverage): string {
  const own = item?.origin.cms
  if (own) return CMS_LABEL[own] ?? own
  const log = coverage.cmsLog?.source.split('-')[0] ?? ''
  return CMS_LABEL[log] ?? 'CMS'
}

export interface EventRowProps {
  siteKey: string
  item: ActivityItemV2
  /** Every event loaded so far: an undo links to its target, an undone event to its undo. */
  items: readonly ActivityItemV2[]
  coverage: ActivityCoverage
  open: boolean
  time: TimeWords
  onToggle: () => void
  onUndo: (item: ActivityItemV2, sha: string) => void
  onShow: (id: string) => void
  onOpenFile?: (path: string, sha: string) => void
  /** Send a revert request to the conversation on screen (sentence + `tracy-revert` block). */
  onAskRevert?: (message: string) => Promise<AskRevertResult>
  /**
   * Open a row's chat or comment inside Tracy (W-F3): true when it did; false (or absent) and the
   * row opens a new window instead, as before.
   */
  onOpen?: (target: OpenInTracy) => boolean
  /**
   * A Restore everything's own Before-restore backup (`mergeTimeline`), folded into this row: named
   * on it, and its Restore… is here — undoing the restore is one press away (Brian 03/10/2026).
   * `pressable`: this seat has a scope to press on it (`restorePressable`).
   */
  returnPoint?: { backup: BackupPoint; pressable: boolean } | null
  /** Open the restore dialog of a backup (the return point's Restore…). */
  onRestoreBackup?: (backup: BackupPoint) => void
  /** Jump to backup landed here (the return point's row): lit for a moment. */
  flash?: boolean
  /** Recorded after the watermark the tab opened with (`isUnread`): lit as new, never dimmed when read. */
  unread?: boolean
  /**
   * The undo engine's answers, one read per chat (`createTurnsBook`), shared by every row of the list.
   * Absent: a Chat row keeps the actions it had before the engine (Undo file changes, Ask Tracy).
   */
  turnsBook?: TurnsBook
  /** Changes whenever the list was read again, so an opened Chat row asks the engine again too. */
  turnsSignal?: string
  /** An undo of a request answered with a change: re-read the list, reload the site's previews. */
  onUndone?: (changed: boolean) => void
  /**
   * The seat may not change the site (a Viewer, ADR 0028): no Undo, Go back, Restore or Ask Tracy
   * to revert on the row, and no line about why one is off. Opening its chat stays.
   */
  readOnly?: boolean
  t: Translate
}

/** "Backup 5" (or the initial backup's short name), as `BackupRow` `backupShort` says it. */
const pointShort = (b: Pick<BackupPoint, 'initial' | 'version'>, t: Translate): string =>
  b.initial ? t('backup.initialShort') : t('backup.short', { n: b.version })

/** What one press of "Ask Tracy to revert" came to. */
export type AskRevertResult = 'sent' | 'no-chat' | 'failed'

/** What a row opens inside Tracy: its conversation (at its message) or its comment's thread. */
export type OpenInTracy =
  | { kind: 'chat'; conversation: ConversationRef }
  | { kind: 'comment'; comment: CommentRef }

/** A press that opens in place: the main button, no key that asks for a new tab or window. */
const plainPress = (e: MouseEvent<HTMLElement>): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

/** Open in Tracy when the page can; else the same address in a new window. */
function openTarget(onOpen: EventRowProps['onOpen'], target: OpenInTracy, href: string): void {
  if (onOpen?.(target) === true) return
  window.open(href, '_blank', 'noopener')
}

export function ActivityEventRow(props: EventRowProps): JSX.Element {
  const { item, open, time, onToggle, t } = props
  const described = describe(item, t)
  // A Chat row is titled by the person's own words, unquoted; what it changed joins the meta line.
  const requestTitle = requestTitleOf(item)
  const title = requestTitle ?? described.text
  const isRequest = requestTitle === null && described.isRequest
  const scope = requestTitle === null || described.isRequest ? scopeLine(item, t) : described.text
  const status = undoStatus(item, t)
  const by = byOf(item)
  const when = timeOf(item)
  const ago = when.iso ? time.ago(when.iso) : t('event.unknown')
  const absolute = when.iso ? time.absolute(when.iso) : null
  const source = item.origin.source
  // The undo engine is asked as the pointer or the keyboard reaches the row (as the … menu did before
  // it): a chat it cannot speak for then shows Undo file changes… beside the others, with no read per
  // row of the list when it opens.
  const { ask } = useRequestUndo(props)
  return (
    <li
      className="tv-activity-event"
      data-event={item.id}
      data-kind={item.kind}
      data-source={source}
      data-open={open || undefined}
      data-return-point-of={props.returnPoint?.backup.version}
      data-flash={props.flash || undefined}
      data-unread={props.unread || undefined}
    >
      {/* One box holds the row and its detail, so an opened row reads as one block. */}
      <div className="tv-row-box">
        <div className="tv-row-head" onPointerEnter={ask} onFocusCapture={ask}>
          {/* The row opens from anywhere on its lines; the title's button is the keyboard control.
              The quick-open arrow and the actions are controls of their own beside it. */}
          <div
            className="tv-activity-event-main"
            onClick={(e) => {
              if ((e.target as Element).closest('a, button') === null) onToggle()
            }}
          >
            <ChevronRight className="tv-row-chevron" aria-hidden="true" />
            <span className="tv-row-body">
              <button
                type="button"
                className="tv-activity-toggle"
                aria-expanded={open}
                onClick={onToggle}
                data-cell="description"
              >
                <span
                  className="tv-activity-desc-line"
                  data-muted={source === 'unknown' || undefined}
                  data-request-title={requestTitle !== null || undefined}
                >
                  {isRequest && <span className="tv-activity-chip">{t('event.requestChip')}</span>}
                  <span className="tv-activity-desc-text">
                    {title}
                    {props.returnPoint && (
                      <span data-return-point={props.returnPoint.backup.version}>
                        {' · '}
                        {t('event.returnPoint', { name: pointShort(props.returnPoint.backup, t) })}
                      </span>
                    )}
                  </span>
                  {isFlaggedV2(item) && (
                    <TriangleAlert
                      className="tv-activity-flag-mark text-amber-500"
                      role="img"
                      aria-label={t('event.flagged')}
                    />
                  )}
                </span>
              </button>
              {/* Who · type · when · what: each part wraps whole, its dot drawn before it. */}
              <span className="tv-row-meta" data-meta>
                <span className="tv-row-part" data-cell="by" title={byTitle(by, t)}>
                  <ByFace by={by} small />
                  <span className="tv-activity-cell-text" data-muted={by.kind === 'unknown' || undefined}>
                    {byName(by, t)}
                  </span>
                </span>
                <span className="tv-row-part" data-cell="source">
                  <SourceGlyph source={source} />
                  <span className="tv-activity-cell-text">{sourceLabel(source, t)}</span>
                  <QuickOpen siteKey={props.siteKey} item={item} onOpen={props.onOpen} t={t} />
                </span>
                <span className="tv-row-part" data-cell="time">
                  <time
                    className="tv-activity-time"
                    dateTime={when.iso ?? undefined}
                    title={absolute ?? undefined}
                  >
                    {when.basis === 'detected' ? t('event.detected', { ago }) : ago}
                  </time>
                  {absolute !== null && <span className="tv-sr-only">({absolute})</span>}
                </span>
                {scope !== null && (
                  <span className="tv-row-part tv-row-scope" data-scope={status === null || undefined}>
                    {scope}
                  </span>
                )}
              </span>
              {status !== null && (
                // The undo status wraps: cutting "…not undone by this action" would drop the half that matters.
                <span className={cn('tv-row-status', AMBER_TEXT)} data-scope data-status>
                  {status}
                </span>
              )}
            </span>
          </div>
          <div className="tv-row-actions">
            <RowActions {...props} />
          </div>
        </div>
        {open && (
          <div className="tv-activity-detail" data-detail>
            <Detail {...props} />
          </div>
        )}
      </div>
    </li>
  )
}

/** Nothing to listen to: a list mounted without the engine's book. */
const noSubscribe = (): (() => void) => () => undefined

/**
 * The engine's undo for this row (`requestUndoOf`), read from the list's shared book; `ask` reads
 * the door for the row's chat. Rows that are not chat turns, and lists without a book: `legacy`.
 */
function useRequestUndo({ siteKey, item, turnsBook, turnsSignal = '' }: EventRowProps) {
  const at = turnsBook === undefined ? null : engineTurnOf(item)
  const session = at?.sessionId ?? null
  const entry = useSyncExternalStore(turnsBook?.subscribe ?? noSubscribe, () =>
    turnsBook !== undefined && session !== null ? turnsBook.get(siteKey, session) : undefined
  )
  const ask = (): void => {
    if (turnsBook !== undefined && session !== null) turnsBook.want(siteKey, session, turnsSignal)
  }
  const undo = at === null ? ({ kind: 'legacy' } as const) : requestUndoOf(item, entry)
  return { at, session, undo, ask }
}

/**
 * The row's actions, always on screen in the list's right-hand column: Undo file changes… where the
 * row offers it (a Viewer seat never sees it), and a … menu only when it holds something (Copy the
 * commit id). The comment link lives on the row itself (the Source's arrow), not here. A row with no
 * menu keeps its empty place, so every row's buttons line up down the list.
 */
function RowActions(props: EventRowProps): JSX.Element {
  const { item, onUndo, t } = props
  const sha = item.evidence.commitSha ?? item.effects.files.sha ?? null
  // One undo path per row: a Chat row the engine speaks for has its "Undo this request" in the
  // detail, so the row offers no Undo file changes; until the engine has answered, none either.
  const { undo } = useRequestUndo(props)
  const target = undo.kind === 'legacy' && props.readOnly !== true ? undoTarget(item) : null
  return (
    <>
      {target !== null && (
        <button type="button" className="tv-row-action" data-row-undo onClick={() => onUndo(item, target)}>
          <RotateCcw aria-hidden="true" />
          {t('event.undoFiles')}
        </button>
      )}
      {sha === null ? (
        <span className="tv-row-more-slot" aria-hidden="true" />
      ) : (
        <Popover
          align="end"
          trigger={(p) => (
            <button type="button" className="tv-row-action tv-row-more" aria-label={t('action.more')} {...p}>
              <MoreHorizontal aria-hidden="true" />
            </button>
          )}
        >
          <MenuKeys>
            <PopoverItem onClick={() => void navigator.clipboard?.writeText(sha).catch(() => undefined)}>
              <Copy className="size-4 flex-none" aria-hidden="true" />
              {t('event.copySha')}
            </PopoverItem>
          </MenuKeys>
        </Popover>
      )}
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

function Line({
  icon: Icon,
  tone,
  children
}: {
  icon: typeof Info
  tone?: 'warn'
  children: ReactNode
}): JSX.Element {
  return (
    <p className={cn('tv-activity-note', tone === 'warn' && AMBER_TEXT)}>
      <Icon className="tv-activity-note-icon" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

function Detail(props: EventRowProps): JSX.Element {
  const { item, items, time, onShow, t } = props
  const status = undoStatus(item, t)
  const when = timeOf(item)
  const reply = replyOf(item)
  const undoEvent =
    item.reversal.state === 'undone' || item.reversal.state === 'partially-undone'
      ? undoEventOf(item, items)
      : null
  const undoneBy = item.reversal.undoneBy ? byOf({ ...item, actor: item.reversal.undoneBy }) : null
  return (
    <div className="tv-activity-detail-body">
      {/* 1. Result and status. */}
      <Block block="result">
        {status !== null && (
          <Line icon={RotateCcw} tone="warn">
            {status}
            {undoneBy !== null && <> · {t('event.undoneBy', { name: byName(undoneBy, t) })}</>}
            {undoEvent !== null && (
              <>
                {' '}
                <button type="button" className="tv-moment-link" onClick={() => onShow(undoEvent.id)}>
                  {t('event.showUndo')}
                </button>
              </>
            )}
          </Line>
        )}
        {item.state === 'stale' && (
          <Line icon={TriangleAlert} tone="warn">
            {t('activity.stale')}
          </Line>
        )}
        {item.flags?.unsealedStart === true && (
          <Line icon={TriangleAlert} tone="warn">
            {t('activity.unsealed')}
          </Line>
        )}
        {item.flags?.concurrent === true && (
          <Line icon={Users} tone="warn">
            {item.effects.files.state === 'not-tracked' ||
            item.capabilities.reasons.includes('no-file-history')
              ? t('event.concurrentNoFiles')
              : t('activity.concurrent')}
          </Line>
        )}
        {when.basis === 'detected' ? (
          <Line icon={Info}>
            {t('event.timeDetected', { at: when.iso ? time.absolute(when.iso) : t('event.unknown') })}
          </Line>
        ) : when.iso ? (
          <Line icon={Info}>
            {t('event.timeOccurred', { at: time.absolute(when.iso) })}
            {item.endedAt ? <> · {t('event.timeFinished', { at: time.absolute(item.endedAt) })}</> : null}
          </Line>
        ) : null}
      </Block>

      {/* 2. Identity and source. */}
      <Block block="identity">
        <Identity {...props} />
      </Block>

      {/* 3. The request, when the event came from one. */}
      {item.request.state !== 'none' && (
        <Block block="request">
          <h4 className="tv-activity-block-title">{t('event.request')}</h4>
          {item.request.text ? (
            <blockquote className="tv-activity-request">
              {readableRequest(item.request.text)}
              {item.request.state === 'truncated' && !endsInEllipsis(item.request.text) && (
                <span className="text-muted-foreground"> …</span>
              )}
            </blockquote>
          ) : null}
          {item.request.state === 'truncated' && (
            <Line icon={TriangleAlert} tone="warn">
              <span className="font-medium">{t('event.requestIncomplete')}</span> —{' '}
              {t('event.requestIncompleteHint')}
            </Line>
          )}
          {item.request.state === 'unknown' && (
            <Line icon={CircleHelp}>
              <span className="tv-activity-strong">{t('event.requestUnavailable')}</span> —{' '}
              {t('event.requestUnavailableHint')}
            </Line>
          )}
        </Block>
      )}

      {/* 3b. What Tracy said at the end of the turn: every seat reads it; turns from before it was
          kept have none, and say nothing about it. Its words, not proof of a result (§2.3). */}
      {reply !== null && (
        <Block block="reply">
          <h4 className="tv-activity-block-title">{t('event.replied')}</h4>
          {/* Text, never markup: React escapes it, and no HTML is built from it. */}
          <p className="tv-activity-reply" data-reply>
            {reply.text}
            {replyNeedsEllipsis(reply) && <span className="text-muted-foreground"> …</span>}
          </p>
          {reply.state === 'truncated' && (
            <Line icon={TriangleAlert} tone="warn">
              {t('event.replyTruncated')}
            </Line>
          )}
          {reply.state === 'interrupted' && (
            <Line icon={TriangleAlert} tone="warn">
              {t('event.replyInterrupted')}
            </Line>
          )}
          <Line icon={Info}>{t('event.replyHint')}</Line>
        </Block>
      )}

      {/* 4. Content, Settings, Files, Other — each action in one group only. */}
      <Effects {...props} />

      {/* 5. Technical, folded. */}
      <Technical siteKey={props.siteKey} item={item} t={t} />

      {/* 6. What the server allows, and why not when it does not. */}
      {(conversationOf(item) !== null ||
        (props.readOnly !== true &&
          ((props.returnPoint && props.onRestoreBackup) ||
            undoTarget(item) !== null ||
            Boolean(item.designSystem) ||
            noUndoReason(item, cmsOf(item, props.coverage), t) !== null ||
            (props.onAskRevert !== undefined && canAskRevert(item))))) && (
        <Block block="actions">
          <Actions {...props} />
        </Block>
      )}
    </div>
  )
}

function Identity({ siteKey, item, items, coverage, onShow, onOpen, t }: EventRowProps): JSX.Element {
  const by = byOf(item)
  const strong = 'tv-activity-strong'
  const cms = cmsOf(item, coverage)
  let who: ReactNode
  const evidence = item.origin.evidence
  switch (item.origin.source) {
    case 'chat':
    case 'comment':
    // Tracy setup: the person sent the brief (requested), Tracy wrote it (applied) — as a chat turn reads.
    case 'setup': {
      const executor = item.executor?.name ?? null
      who = (
        <>
          {t('event.requestedBy')} <span className={strong}>{byName(by, t)}</span>
          {executor && (
            <>
              {' '}
              · {t('event.appliedBy')} <span className={strong}>{executor}</span>
            </>
          )}
        </>
      )
      break
    }
    case 'design-system':
    // A seat key's write: the key's person made it through the API, no Tracy agent in between.
    case 'api':
      // The person pressed the Design system button themselves: they applied it, Tracy did not.
      who = (
        <>
          {t('event.appliedBy')} <span className={strong}>{byName(by, t)}</span>
        </>
      )
      break
    case 'cms-admin':
      who =
        by.kind === 'cms' ? (
          <>
            <span className={strong}>{cmsAccount(by, t)}</span>. {t('event.cmsNotSeat')}{' '}
            {t('event.cmsChannel')}
          </>
        ) : (
          <span className={strong}>{t('event.unknown')}</span>
        )
      break
    case 'automatic':
      who = (
        <>
          <span className={strong}>{byName(by, t)}</span>.{' '}
          {item.origin.service === 'wordpress-cron'
            ? t('event.automaticProof')
            : item.origin.service === 'tracy-housekeeping'
              ? t('activity.housekeepingNote')
              : t('event.automaticNote')}
        </>
      )
      break
    case 'deployment':
      // A Tracy update: what the customer needs first is that their content was not touched. The
      // tag, the files and who started it are kept for Technical details.
      who = (
        <>
          <span className={strong}>{byName(by, t)}</span>. {t('event.deployReassure')}
        </>
      )
      break
    case 'site-changes': {
      // Sync to live wrote the customer's live site, not this copy: said as that, nothing to show.
      const pushKey = item.description.key
      if (pushKey === 'site-changes.sync-to-live' || pushKey === 'site-changes.sync-to-live-undo') {
        who = (
          <>
            {t(
              pushKey === 'site-changes.sync-to-live' ? 'event.syncToLiveNote' : 'event.syncToLiveUndoNote',
              {
                name: byName(by, t)
              }
            )}
          </>
        )
        break
      }
      // A reset or a restore of everything puts the site back to a point; neither undoes the event
      // made at that point (plan §3.3, ADR 0024).
      const everything = item.description.key === 'site-changes.restore-everything'
      const reset = item.description.key === 'site-changes.reset' || everything
      const target = targetEventOf(item, items)
      const sha = item.evidence.targetSha ?? null
      who = (
        <>
          {by.kind === 'unknown'
            ? t('event.siteChangesNoteUnknown')
            : t(
                everything
                  ? 'event.restoreEverythingNote'
                  : reset
                    ? 'event.resetNote'
                    : 'event.siteChangesNote',
                {
                  name: byName(by, t)
                }
              )}
          {sha && reset && (
            // A reset puts the site's FILES back to a point; it does not undo the event made at that
            // point (plan §3.3), so it never says "Undid" and names the commit, not that event.
            <span className="tv-activity-target">
              {' '}
              {t(everything ? 'event.restoreEverythingTo' : 'event.resetTo')}{' '}
              <span className={strong}>{t('event.commit', { sha: sha.slice(0, 7) })}</span>
              {target && (
                <>
                  {' '}
                  <button type="button" className="tv-moment-link" onClick={() => onShow(target.id)}>
                    {t('event.showPoint')}
                  </button>
                </>
              )}
            </span>
          )}
          {sha && !reset && (
            <span className="tv-activity-target">
              {' '}
              {t('event.undid')}:{' '}
              <span className={strong}>
                {target ? describe(target, t).text : t('event.commit', { sha: sha.slice(0, 7) })}
              </span>
              {target && <> · {t('event.commit', { sha: sha.slice(0, 7) })}</>}
              {target && (
                <>
                  {' '}
                  <button type="button" className="tv-moment-link" onClick={() => onShow(target.id)}>
                    {t('event.showTarget')}
                  </button>
                </>
              )}
            </span>
          )}
        </>
      )
      break
    }
    default:
      who = (
        <>
          {by.kind === 'unknown' ? t('event.unknownSource') : t('event.unknownSourceKnownBy')}
          {by.kind !== 'unknown' && (
            <>
              {' '}
              {t('event.col.by')}: <span className={strong}>{byTitle(by, t)}</span>
            </>
          )}
        </>
      )
  }
  const comment = item.comment
  const author = comment?.author ?? null
  // Null when the comment was deleted: who and where stay, the link does not.
  const link = comment ? commentLink(siteKey, comment) : null
  return (
    <div className="tv-activity-identity">
      <span className="tv-activity-source-chip">
        <SourceGlyph source={item.origin.source} />
        {sourceLabel(item.origin.source, t)}
      </span>
      <span className="tv-activity-identity-who">
        <ByFace by={by} small />
        <span className="min-w-0">{who}</span>
      </span>
      {evidence === 'conflicting' && (
        <p className="tv-activity-identity-row">
          <TriangleAlert className={cn('tv-activity-note-icon inline', AMBER_TEXT)} aria-hidden="true" />{' '}
          {t('event.conflicting')}
        </p>
      )}
      {item.origin.log && (
        <p className="tv-activity-identity-row">{t('event.cmsLog', { cms, log: item.origin.log })}</p>
      )}
      {comment && (
        <p className="tv-activity-identity-row">
          {author && (
            <>
              {t('event.commentBy')} <span className={strong}>{author.name}</span>{' '}
            </>
          )}
          {t('event.onPage', { where: pathOf(comment.url) })} ·{' '}
          {link !== null ? (
            <a
              href={link}
              target="_blank"
              rel="noopener"
              className="tv-moment-link tv-activity-link"
              data-open-comment
              onClick={(e) => {
                if (plainPress(e) && onOpen?.({ kind: 'comment', comment: comment as CommentRef }) === true)
                  e.preventDefault()
              }}
            >
              {t('activity.openComment')}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <span data-comment-deleted>{t('event.commentDeleted')}</span>
          )}
        </p>
      )}
    </div>
  )
}

/** "/menu/" of a comment's page address; the address itself when it does not parse. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname || url
  } catch {
    return url
  }
}

function Group({
  icon: Icon,
  title,
  count,
  name,
  children
}: {
  icon: typeof FileCode2
  title: string
  count: ReactNode
  name: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="tv-activity-group" data-group={name}>
      <h4 className="tv-activity-section-title">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {title}
        <span className="tv-activity-section-count">{count}</span>
      </h4>
      {children}
    </div>
  )
}

function ResourceList({ group, t }: { group: ActivityEffectGroup; t: Translate }): JSX.Element {
  return (
    <ul className="tv-activity-list">
      {group.resources.map((r) => (
        <li key={`${r.type ?? ''}:${r.id}`} className="tv-activity-line">
          <span className="tv-activity-line-text">
            <span className="tv-activity-strong">
              {resourceText({ ...r, op: r.ops[r.ops.length - 1] ?? null }, t)}
            </span>
            {r.ops.length > 1 && (
              <span className="text-muted-foreground"> · {r.ops.map((op) => opWord(op, t)).join(', ')}</span>
            )}
          </span>
        </li>
      ))}
      {group.operations > 0 && (
        <li className="tv-activity-line">
          <span className="tv-activity-line-text">
            {t(`event.unnamedActions.${group.operations === 1 ? 'one' : 'many'}`, {
              count: group.operations
            })}
          </span>
        </li>
      )}
    </ul>
  )
}

function Effects({ siteKey, item, coverage, onOpenFile, t }: EventRowProps): JSX.Element | null {
  const e = item.effects
  const cms = cmsOf(item, coverage)
  const content = e.content.resources.length + e.content.operations
  const settings = e.settings.resources.length + e.settings.operations
  // The admin log of this CMS does not report settings (EmDash: menus, settings, media): a CMS row
  // says so instead of an empty Settings — not tracked is not unchanged (plan §3.2).
  const settingsUntracked =
    item.kind === 'cms-change' && (coverage.cmsLog?.limits ?? []).includes('settings') && settings === 0
  const files = e.files
  // A Tracy update lists its files under Technical details, not here (Brian, option a).
  const showFiles =
    item.origin.source !== 'deployment' &&
    (files.state === 'not-tracked' ||
      files.state === 'unread' ||
      (files.state === 'recorded' && (files.count ?? 0) > 0))
  if (content + settings + e.other.operations === 0 && !showFiles && !settingsUntracked) return null
  return (
    <Block block="effects">
      {content > 0 && (
        <Group icon={Database} title={t('event.group.content')} count={content} name="content">
          <ResourceList group={e.content} t={t} />
        </Group>
      )}
      {(settings > 0 || settingsUntracked) && (
        <Group
          icon={SlidersHorizontal}
          title={t('event.group.settings')}
          count={settings > 0 ? settings : ''}
          name="settings"
        >
          {settings > 0 && <ResourceList group={e.settings} t={t} />}
          {settingsUntracked && (
            <p className="tv-moment-lead" data-untracked>
              <span className="tv-activity-strong">{t('event.notTracked', { cms })}</span> —{' '}
              {t('event.settingsUntrackedHint', { cms })}
            </p>
          )}
        </Group>
      )}
      {files.state === 'not-tracked' ? (
        // No number at all: "0 files" would claim a check that never happened.
        <Group icon={FileCode2} title={t('event.group.files')} count="" name="files">
          <p className="tv-moment-lead" data-untracked>
            <span className="tv-activity-strong">{t('event.notTracked', { cms })}</span> —{' '}
            {t('event.filesUntrackedHint', { cms })}
          </p>
        </Group>
      ) : files.state === 'unread' ? (
        <Group icon={FileCode2} title={t('event.group.files')} count="" name="files">
          <p className="tv-moment-lead">{t('event.filesUnread')}</p>
        </Group>
      ) : showFiles && files.sha ? (
        <Group icon={FileCode2} title={t('event.group.files')} count={files.count ?? ''} name="files">
          <MomentFiles
            siteKey={siteKey}
            sha={files.sha}
            count={files.count ?? 0}
            onOpenFile={item.capabilities.canDiff ? onOpenFile : undefined}
            t={t}
          />
        </Group>
      ) : null}
      {e.other.operations > 0 && (
        <Group icon={ListChecks} title={t('event.group.other')} count={e.other.operations} name="other">
          <ul className="tv-activity-list">
            {e.other.actions.map((a) => (
              <li key={a} className="tv-activity-line">
                <code className="tv-activity-code">{a}</code>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </Block>
  )
}

/** Filtered references only — ids, never a raw record (plan §3.2). */
function Technical({
  siteKey,
  item,
  t
}: {
  siteKey: string
  item: ActivityItemV2
  t: Translate
}): JSX.Element | null {
  const ev = item.evidence
  const rows: { label: string; value: string }[] = []
  const deploy = item.origin.source === 'deployment'
  if (deploy) {
    const tag = item.description.params.tag
    if (typeof tag === 'string' && tag) rows.push({ label: t('event.tech.tag'), value: tag })
    rows.push({ label: t('event.startedBy'), value: t('event.unknown') })
  }
  if (ev.turnId) rows.push({ label: t('event.tech.turn'), value: ev.turnId })
  if (ev.commitSha) rows.push({ label: t('event.tech.commit'), value: ev.commitSha })
  if (ev.targetSha) rows.push({ label: t('event.tech.target'), value: ev.targetSha })
  if (ev.operationId) rows.push({ label: t('event.tech.operation'), value: ev.operationId })
  if (ev.jobRef) rows.push({ label: t('event.tech.job'), value: ev.jobRef })
  if (ev.cmsRecordRef) rows.push({ label: t('event.tech.record'), value: ev.cmsRecordRef })
  if (item.origin.service) rows.push({ label: t('event.tech.service'), value: item.origin.service })
  for (const w of item.technical ?? [])
    rows.push({ label: t('event.tech.write'), value: `${w.action} · ${w.via} · ${w.outcome}` })
  if (rows.length === 0 && !deploy) return null
  return (
    <Block block="technical">
      <details>
        <summary className="tv-activity-summary">{t('event.technical')}</summary>
        <dl className="tv-activity-tech">
          {rows.map((row, i) => (
            <div key={`${row.label}-${i}`} className="contents">
              <dt>{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {deploy && item.effects.files.sha && (item.effects.files.count ?? 0) > 0 && (
          // The files a Tracy update replaced: technical detail, not the headline.
          <div className="tv-activity-tech-files" data-deploy-files>
            <MomentFiles
              siteKey={siteKey}
              sha={item.effects.files.sha}
              count={item.effects.files.count ?? 0}
              t={t}
            />
          </div>
        )}
      </details>
    </Block>
  )
}

/** A time from the record, in the reader's language: hours and minutes today, with the date before. */
function shortTime(iso: string): string {
  const when = new Date(iso)
  const today = new Date().toDateString() === when.toDateString()
  return when.toLocaleString(interfaceLocale(), {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit'
  })
}

function Actions(props: EventRowProps): JSX.Element {
  const {
    siteKey,
    item,
    coverage,
    time,
    onAskRevert,
    onOpen,
    returnPoint,
    onRestoreBackup,
    turnsBook,
    turnsSignal = '',
    onUndone,
    readOnly = false,
    t
  } = props
  // A design system row says its own undo (below), never "settings changes can't be undone".
  const reason = item.designSystem ? null : noUndoReason(item, cmsOf(item, coverage), t)
  const conversation = conversationOf(item)
  // The engine's answer for this row's chat (one read per chat, shared by the list's rows).
  const { at, session, undo } = useRequestUndo(props)
  useEffect(() => {
    if (turnsBook !== undefined && session !== null) turnsBook.want(siteKey, session, turnsSignal)
  }, [turnsBook, siteKey, session, turnsSignal])
  const card = undo.kind === 'engine' ? undo.card : null
  const [confirming, setConfirming] = useState(false)
  // What the last "Ask Tracy to revert" press came to: on its way, sent, no chat to take it, refused.
  const [asked, setAsked] = useState<AskRevertResult | 'sending' | null>(null)
  const ask = (): void => {
    if (onAskRevert === undefined || asked === 'sending') return
    const message = revertMessageOf(
      item,
      { siteKey, cms: item.origin.cms ?? coverage.cmsLog?.source.split('-')[0] ?? null },
      // The words the row's title shows: a Chat row's request (as the chat card asks), else its Description.
      t('event.askRevertMessage', { what: requestTitleOf(item) ?? describe(item, t).text })
    )
    if (message === null) return
    setAsked('sending')
    onAskRevert(message).then(setAsked, () => setAsked('failed'))
  }
  const legacy = undo.kind === 'legacy'
  // Ask Tracy to revert: as before on a row the engine does not speak for; on a Chat row only when
  // the engine cannot undo it (blocked, EmDash) — beside a working Undo it would be a second undo.
  const showAsk =
    onAskRevert !== undefined &&
    canAskRevert(item) &&
    (legacy || card?.kind === 'blocked' || card?.kind === 'emdash')
  const when = timeOf(item)
  return (
    <div className="tv-activity-actions">
      {conversation !== null && (
        <OpenConversation
          siteKey={siteKey}
          conversation={conversation}
          by={byOf(item)}
          onOpen={onOpen}
          t={t}
        />
      )}
      {/* A Viewer (readOnly) gets the chat link above and nothing below: each is a change to the site. */}
      {!readOnly && returnPoint && onRestoreBackup && (
        // The way back from this restore: the normal restore dialog of its Before-restore backup.
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!returnPoint.pressable}
          onClick={() => onRestoreBackup(returnPoint.backup)}
          data-restore-return={returnPoint.backup.version}
        >
          <RotateCcw aria-hidden="true" />
          {t('event.restoreReturnPoint', { name: pointShort(returnPoint.backup, t) })}
        </Button>
      )}
      {/* Undo file changes… is the row's own button in the actions column, not repeated here. Opening
          the row asks the engine (above), so a chat it does not speak for shows that button at once. */}
      {!readOnly && (card?.kind === 'ready' || card?.kind === 'disabled') && (
        // The ONE undo of a Chat row: the engine's, the same as the card under the chat turn.
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={card.kind === 'disabled'}
          onClick={() => setConfirming(true)}
          data-undo-request-button={card.action}
        >
          <RotateCcw aria-hidden="true" />
          {t(card.action === 'undo' ? 'event.undoRequest' : 'event.goBackRequest')}
        </Button>
      )}
      {!readOnly && showAsk && (
        // Best-effort work by the agent, not Undo: one press sends the request to the chat on screen
        // (Brian 02/10 ~22:5x) — a sentence the person reads and a chip carrying the record.
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ask-revert
          disabled={asked === 'sending'}
          onClick={ask}
        >
          <MessageSquarePlus aria-hidden="true" />
          {t('event.askRevert')}
        </Button>
      )}
      {!readOnly && card?.kind === 'disabled' && (
        <p className="tv-moment-lead" data-undo-note>
          {t(card.note.key, card.note.params)}
        </p>
      )}
      {!readOnly && card?.kind === 'blocked' && undo.kind === 'engine' && (
        // One sentence with who, what and when, in the chat card's own words (`reasonWords`).
        <p className={cn('tv-moment-lead', AMBER_TEXT)} data-undo-blocked={card.turn.undo.reasons[0]?.code}>
          {(() => {
            const words = reasonWords(card.turn.undo.reasons[0], undo.entry.answer.cms, t, shortTime)
            return t(words.key, words.params)
          })()}
        </p>
      )}
      {!readOnly && legacy && reason !== null && (
        <p className="tv-moment-lead" data-no-undo>
          {reason}
        </p>
      )}
      {asked !== null && (
        <p className="tv-moment-lead tv-activity-asked" role="status" data-ask-revert-result={asked}>
          {asked === 'sending'
            ? t('event.askRevertSending')
            : asked === 'sent'
              ? t('event.askRevertSent')
              : asked === 'no-chat'
                ? t('event.askRevertNoChat')
                : t('event.askRevertFailed')}
        </p>
      )}
      {!readOnly && item.designSystem && (
        <DesignSystemUndo siteKey={siteKey} ds={item.designSystem} onUndone={onUndone} t={t} />
      )}
      {confirming && card?.kind === 'ready' && undo.kind === 'engine' && turnsBook && at && (
        <UndoRequestDialog
          siteKey={siteKey}
          sessionId={at.sessionId}
          card={card}
          answer={undo.entry.answer}
          book={turnsBook}
          request={requestTitleOf(item)}
          who={byName(byOf(item), t)}
          when={when.iso ? time.absolute(when.iso) : null}
          onClose={() => setConfirming(false)}
          onSettled={(changed) => {
            void turnsBook.refresh(siteKey, at.sessionId)
            onUndone?.(changed)
          }}
          t={t}
        />
      )}
    </div>
  )
}

/**
 * The Undo of a design system row: the same door as the Design system panel and the site browser's
 * Undo (`POST …/design-system/undo`), with its rules — only the site's newest apply, only while the
 * site still holds what it wrote. One press asks to confirm, the second undoes.
 */
function DesignSystemUndo({
  siteKey,
  ds,
  onUndone,
  t
}: {
  siteKey: string
  ds: NonNullable<ActivityItemV2['designSystem']>
  onUndone?: (changed: boolean) => void
  t: Translate
}): JSX.Element | null {
  const [step, setStep] = useState<'idle' | 'confirm' | 'working'>('idle')
  const [said, setSaid] = useState<string | null>(null)
  if (ds.state === 'undone') return null
  if (ds.state === 'not-latest')
    return (
      <p className="tv-moment-lead" data-ds-undo="not-latest">
        {t('event.ds.notLatest')}
      </p>
    )
  if (!ds.canUndo) return null
  const press = async (): Promise<void> => {
    setStep('working')
    const outcome = await undoDesignSystemApply({ siteKey, applyId: ds.applyId })
    setStep('idle')
    if (outcome.kind === 'done') {
      setSaid(null)
      onUndone?.(true)
      return
    }
    if (outcome.kind === 'refused' && outcome.code === 'DS_CHANGED_SINCE') setSaid(t('event.ds.changedSince'))
    else if (
      outcome.kind === 'refused' &&
      (outcome.code === 'DS_NOT_LATEST' || outcome.code === 'DS_UNDO_USED')
    ) {
      setSaid(null)
      onUndone?.(false)
    } else {
      const key = outcomeKey(outcome)
      setSaid(key === null ? null : t(key, { code: outcome.code }))
    }
  }
  return (
    <>
      {step !== 'confirm' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={step === 'working'}
          onClick={() => setStep('confirm')}
          data-ds-undo={ds.applyId}
        >
          <RotateCcw aria-hidden="true" />
          {step === 'working' ? t('undo.undoing') : t('event.ds.undo')}
        </Button>
      )}
      {step === 'confirm' && (
        <div className="tv-moment-lead" role="group" data-ds-undo-confirm>
          <p className="m-0">
            {t('event.ds.confirm', { name: ds.name })}{' '}
            {ds.previous === null
              ? t('event.ds.backTemplate')
              : t('event.ds.back', { name: ds.previous.name ?? ds.previous.id })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={() => void press()}>
              {t('undo.undo')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setStep('idle')}>
              {t('action.cancel')}
            </Button>
          </div>
        </div>
      )}
      {said !== null && (
        <p className={cn('tv-moment-lead', AMBER_TEXT)} role="status" data-ds-undo-said>
          {said}
        </p>
      )}
    </>
  )
}

/**
 * "Open conversation": the conversation, scrolled to the message (A) — inside Tracy, switching the
 * main view to it (W-F3, `onOpen`); a new window only where the page cannot. dsh opens a
 * session only for the person who created it, so for anyone else the button stays, dimmed, and
 * says whose it is — on hover and on keyboard focus (`aria-disabled`, not `disabled`, so it can
 * take focus and say why).
 */
function OpenConversation({
  siteKey,
  conversation,
  by,
  onOpen,
  t
}: {
  siteKey: string
  conversation: ConversationRef
  by: ByModel
  onOpen?: EventRowProps['onOpen']
  t: Translate
}): JSX.Element {
  if (conversation.mine)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-open-conversation
        onClick={() =>
          openTarget(onOpen, { kind: 'chat', conversation }, conversationLink(siteKey, conversation))
        }
      >
        <MessageSquare aria-hidden="true" />
        {t('event.openChat')}
      </Button>
    )
  const why = t('event.openChatOnly', {
    name: by.kind === 'unknown' ? t('event.openChatSomeone') : byName(by, t)
  })
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="tv-activity-off"
      aria-disabled="true"
      aria-label={`${t('event.openChat')}. ${why}`}
      data-hint={why}
      data-open-conversation="off"
      onClick={(e) => e.preventDefault()}
    >
      <MessageSquare aria-hidden="true" />
      {t('event.openChat')}
    </Button>
  )
}

/**
 * The arrow beside a row's Source (Brian 02/10): opens what the row came from without opening the
 * row — the reader's own chat (`conversation.mine`, scrolled to the message) or the comment while
 * it still exists. Nothing at all where there is nothing to open: the detail already explains a
 * chat that is someone else's. A real link (keyboard, middle click, a new tab with a modifier),
 * above the row's stretched toggle, and its click never reaches the row; a plain press opens inside
 * Tracy when the page can (W-F3).
 */
function QuickOpen({
  siteKey,
  item,
  onOpen,
  t
}: {
  siteKey: string
  item: ActivityItemV2
  onOpen?: EventRowProps['onOpen']
  t: Translate
}): JSX.Element | null {
  const quick = quickOpenOf(siteKey, item)
  if (quick === null) return null
  const href = quick.href
  const label = quick.kind === 'chat' ? t('event.openChat') : t('activity.openComment')
  const conversation = conversationOf(item)
  const target: OpenInTracy | null =
    quick.kind === 'chat'
      ? conversation && { kind: 'chat', conversation }
      : item.comment
        ? { kind: 'comment', comment: item.comment as CommentRef }
        : null
  return (
    <a
      className="tv-activity-quick"
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={label}
      title={label}
      data-quick-open={quick.kind}
      onClick={(e) => {
        e.stopPropagation()
        if (target !== null && plainPress(e) && onOpen?.(target) === true) e.preventDefault()
      }}
    >
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  )
}

/** "1 file", "3 files" — exported for the undo dialog. */
export const filesWord = (count: number, t: Translate): string => unit('file', count, t)
