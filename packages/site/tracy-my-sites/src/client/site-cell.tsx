/**
 * The Site cell of the My Sites table: the site's address and, on the same line right after it,
 * the row's one state (Akemi, 01/10). The table had a Status column for that state until then; it
 * took a column's width for one short thing per row, and most rows left it empty at rest.
 *
 * The states, at most one per row (a row is in one state, never two):
 * - "Managing" (dot + label): the site this window works on.
 * - "Waiting for approval": a request to join the viewer sent; an admin answers it.
 * - "Accept" and "Decline" (two buttons, side by side, Akemi U10 A, 03/10): an invitation nobody
 *   has answered yet. Decline sits in the open, not in a menu, so a person who does not want the
 *   seat sees at once how to say so; it asks first (`DeclineDialog` in more.tsx, develop #800,
 *   Akemi 04/10), since only the inviter can undo it by inviting again.
 * - "Import not finished" + "Finish import" (a link styled as a button): an imported site whose read never reached a
 *   build (`importPending`). It has no folder on its host, so Start the agent would only make an
 *   empty one; the link opens the import recovery page instead (Retry or Continue). An owner also
 *   gets "Remove", which asks first and goes through `DELETE /api/sites/:key/import`.
 * - "Starting" (stepping dots): between the Start press and the agent's first answer.
 * - "Start the agent" (button): an accepted seat on a site with no agent yet; when the last press
 *   failed, "The agent could not start. Try again." sits under the address, the button stays.
 * - "Open Chat" + arrow: revealed on hover or focus of a row that opens its site's chat.
 *
 * Badges and buttons are all 20px high, the height of the Role badge beside them, so a row with a
 * button is no taller than one with a badge. The address truncates first; the state keeps its
 * width (styles.ts, tracy-mysites-site-line).
 */
import type { JSX } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge, Button, buttonVariants } from '@tracy/ui'

import { rowStatus } from './more-actions'
import type { Translate } from './strings'

export interface SiteCellRow {
  siteKey: string
  /** The name the site is shown by (`/api/sites` `displayName`); a rename changes it, never the key. */
  displayName?: string
  status: string
  requestedAt?: string | null
  agent: string | null
  /** `draft` | `published` as `/api/sites` says it; absent when it does not. */
  publish?: string | null
  /** `live` | `draft` while that operation runs on the site; absent when none does. */
  publishing?: string | null
  /** The import never reached a build (`/api/sites` `importPending`): no workspace yet. */
  importPending?: boolean
  /** The page that finishes that import (`/api/sites` `importRecovery`). */
  importRecovery?: string
  /** The seat's role; only an owner may remove an unfinished import. */
  role?: string | null
}

export interface SiteCellProps {
  site: SiteCellRow
  /** The site this window works on. */
  isCurrent: boolean
  /** A press on the row opens this site's chat. */
  openable: boolean
  /** The accept request is in flight. */
  accepting: boolean
  /** The decline request is in flight. */
  declining: boolean
  /** The start request is in flight, or the agent has not answered yet. */
  starting: boolean
  /** The last start press was refused, or the agent did not answer in time. */
  startFailed: boolean
  onAccept: () => void
  onDecline: () => void
  onStart: () => void
  /** Asks to remove an unfinished import (`RemoveImportDialog`). */
  onRemoveImport: () => void
  t: Translate
}

/** Class of every button in the cell: the 20px height of the badges, the xs type of the row. */
const COMPACT = 'h-5 px-2 text-xs'

/** The row's one state, or null when it has none to show. */
function State(props: SiteCellProps): JSX.Element | null {
  const { site, isCurrent, openable, accepting, declining, starting, t } = props
  // The current site's label gives way like every state label (styles.ts, tracy-mysites-state-text):
  // a long translation ("Wird verwaltet", 24/10/2026) ran over the row's menu button at 390px.
  if (isCurrent)
    return (
      <Badge variant="secondary" className="tracy-mysites-state-text gap-1.5" title={t('badge.current')}>
        <span className="tracy-mysites-dot" aria-hidden="true" />
        <span className="truncate">{t('badge.current')}</span>
      </Badge>
    )
  // An invitation is answered here, not only at the site's own address: this is the row that says
  // one is waiting, so it carries the button. A request the viewer sent keeps its badge; an admin
  // answers that one.
  if (site.status !== 'accepted') {
    if (site.requestedAt)
      return (
        <Badge variant="outline" className="tracy-mysites-state-text" title={t('badge.asked')}>
          <span className="truncate">{t('badge.asked')}</span>
        </Badge>
      )
    // One answer at a time: while either press is in flight, both buttons wait for it.
    const answering = accepting || declining
    return (
      <span className="tracy-mysites-answer">
        <Button type="button" size="xs" className={COMPACT} disabled={answering} onClick={props.onAccept}>
          {t(accepting ? 'action.accepting' : 'action.accept')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={COMPACT}
          disabled={answering}
          onClick={props.onDecline}
        >
          {t(declining ? 'action.declining' : 'action.decline')}
        </Button>
      </span>
    )
  }
  if (site.importPending)
    return (
      <span className="tracy-mysites-answer" data-import-pending="">
        <Badge variant="outline" className="tracy-mysites-state-text" title={t('badge.importPending')}>
          <span className="truncate">{t('badge.importPending')}</span>
        </Badge>
        {/* A link, not a button: the recovery page is another dsh page (the creation workspace). */}
        {site.importRecovery ? (
          <a
            href={site.importRecovery}
            className={buttonVariants({ variant: 'outline', size: 'xs', className: COMPACT })}
          >
            {t('action.finishImport')}
          </a>
        ) : null}
        {site.role === 'owner' ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={COMPACT}
            onClick={props.onRemoveImport}
          >
            {t('action.removeImport')}
          </Button>
        ) : null}
      </span>
    )
  if (site.agent === null) {
    if (starting)
      return (
        <Badge variant="secondary" className="tracy-mysites-live">
          {t('badge.starting')}
        </Badge>
      )
    return (
      <Button type="button" variant="outline" size="xs" className={COMPACT} onClick={props.onStart}>
        {t('action.start')}
      </Button>
    )
  }
  if (openable)
    return (
      <span className="tracy-mysites-open-hint" aria-hidden="true">
        {t('action.open')}
        <ExternalLink className="size-3.5" />
      </span>
    )
  return null
}

/**
 * Draft or Live, after the site's name: dot and word, the same chip the site's Settings tab writes
 * beside its name. Nothing for a row whose state the list did not give (an invitation, an older
 * server).
 */
function PublishChip({ site, t }: { site: SiteCellRow; t: Translate }): JSX.Element | null {
  const status = rowStatus(site)
  if (status === null) return null
  return (
    <Badge variant="outline" className="tv-status-chip" data-status={status}>
      <span className="tv-status-dot" aria-hidden="true" />
      {t(`publish.status.${status}`)}
    </Badge>
  )
}

export function SiteCell(props: SiteCellProps): JSX.Element {
  const { site, isCurrent, startFailed, starting, t } = props
  const failed = startFailed && !starting && !isCurrent && site.status === 'accepted' && site.agent === null
  return (
    <>
      <span className="tracy-mysites-site-line">
        {/* The address may be longer than the pane: it truncates, its full text in the tooltip,
            rather than push the state or the menu out of reach. */}
        <span
          className="tracy-mysites-site-name truncate font-normal"
          title={site.displayName || site.siteKey}
        >
          {site.displayName || site.siteKey}
        </span>
        <PublishChip site={site} t={t} />
        <State {...props} />
      </span>
      {failed && (
        <span className="block truncate text-destructive text-xs" title={t('state.startFailed')}>
          {t('state.startFailed')}
        </span>
      )}
    </>
  )
}
