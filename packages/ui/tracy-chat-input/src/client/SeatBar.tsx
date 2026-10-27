/**
 * The session occupant above the chat box that follows the seat's role live (#1036): a Viewer's bar
 * (`ViewerBar.tsx`) while the seat is a Viewer, and for a few seconds after an Owner made them an
 * Editor, one quiet line in the same card saying so ("You can now edit this site."). Nothing for
 * any other seat, unless the seat was taken back while the page was open: then the bar says so and
 * offers My Sites (`RemovedBar`, J7.8).
 *
 * The line is a status, not a dialog: nothing to press, nothing in the way of the chat box, and the
 * draft stays as it was (the page is not reloaded). `createPromotedNotice` decides when it shows.
 */
import { Check, Lock } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { type createAskedSites, isViewerRole } from './seat-role.mjs'
import { fallback, type Translate } from './strings'
import { ViewerBar } from './ViewerBar'

/** The slice of the page's role store this reads (`createSeatRole`). */
export interface SeatRoleLike {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => string | null
  /** The seat was taken back while the page was open (`createSeatRole`, J7.8). */
  isRemoved: () => boolean
  refresh: () => unknown
}

/** The slice of the notice store this reads (`createPromotedNotice`). */
export interface PromotedNoticeLike {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => boolean
}

export interface SeatBarProps {
  siteKey: string | null
  t?: Translate
  asked: ReturnType<typeof createAskedSites>
  seatRole: SeatRoleLike
  notice: PromotedNoticeLike
  /** The dock's live input state: `sent` counts what the chat box sent (fork tracy.25). */
  input?: { sent?: number }
}

/** Where a seat with no access left goes: the account's own list of sites, on the account's own workspace (`/new/`; the bare root drops the query). */
export const MY_SITES_HREF = '/new/?tab=tracy:my-sites'

/** The composer cards of the page, made inert while the seat has no access (J7.8). */
const COMPOSER_CARD = '[data-slot="conversation.composer.bar"] [data-composer-card]'

/**
 * The bar a seat taken back while its page was open reads instead of a chat box that sends into
 * silence (J7.8, 04/10/2026): why, and the way out to My Sites. The chat box stays where it is, inert,
 * with the draft in it.
 */
export function RemovedBar({ t }: { t?: Translate }): JSX.Element {
  useEffect(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(COMPOSER_CARD)]
    for (const card of cards) card.inert = true
    return () => {
      for (const card of cards) card.inert = false
    }
  }, [])
  return (
    <div className="tv-viewer-bar" data-viewer-bar="removed" data-viewer-bar-place="removed" role="alert">
      <div className="tv-viewer-bar-body">
        <Lock className="tv-viewer-bar-icon" aria-hidden="true" />
        <div className="tv-viewer-bar-text">
          <p className="tv-viewer-bar-line">{fallback(t, 'seat.removed')}</p>
        </div>
        <a className="tv-viewer-bar-button" href={MY_SITES_HREF}>
          {fallback(t, 'seat.removed.mySites')}
        </a>
      </div>
    </div>
  )
}

/** The line a Viewer made Editor reads, in the Viewer bar's card. */
export function PromotedNotice({ t }: { t?: Translate }): JSX.Element {
  return (
    <div className="tv-viewer-bar" data-viewer-bar="promoted" data-viewer-bar-place="notice" role="status">
      <div className="tv-viewer-bar-body">
        <Check className="tv-viewer-bar-icon" aria-hidden="true" />
        <div className="tv-viewer-bar-text">
          <p className="tv-viewer-bar-line">{fallback(t, 'viewer.promoted')}</p>
        </div>
      </div>
    </div>
  )
}

export function SeatBar({ siteKey, t, asked, seatRole, notice, input }: SeatBarProps): JSX.Element | null {
  const viewer = useSyncExternalStore(seatRole.subscribe, () => isViewerRole(seatRole.getSnapshot()))
  const removed = useSyncExternalStore(seatRole.subscribe, seatRole.isRemoved, seatRole.isRemoved)
  const promoted = useSyncExternalStore(notice.subscribe, notice.getSnapshot, notice.getSnapshot)
  // Every send reads the seat again: a seat taken back while the page was open learns it the moment
  // it tries to chat, not at the next Inbox poll (J7.8). One small read per message.
  const sent = input?.sent ?? 0
  const seen = useRef(sent)
  useEffect(() => {
    if (sent === seen.current) return
    seen.current = sent
    if (siteKey !== null) void seatRole.refresh()
  }, [sent, siteKey, seatRole])
  if (siteKey === null) return null
  if (removed) return <RemovedBar t={t} />
  if (viewer)
    return (
      <ViewerBar
        siteKey={siteKey}
        t={t}
        asked={asked}
        place="session"
        onAlreadyEditor={() => seatRole.refresh()}
      />
    )
  if (promoted) return <PromotedNotice t={t} />
  return null
}
