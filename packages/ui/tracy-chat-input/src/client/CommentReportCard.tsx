/**
 * The report dsh draws under a chat turn sent from comments (ADR 0025, Brian 03–04/10/2026): "Done: 3
 * comments (reply to a comment if you want more changes)" · "Couldn't confirm: 1 comment", one line per
 * comment that opens its thread on the page. The rules live in `comment-report.mjs`; this file asks the
 * door once the turn has ended and draws.
 *
 * Mounted in `conversation.chat.turnTail`, like `TurnUndoCard.tsx`: its owner props carry the
 * `TurnLocation` (`turn.turn`, `turn.end`), the registration's `inject` adds the session id and how a
 * comment is revealed. The turn number is dsh's, the one the host's site-tabs plugin records the turn
 * under (`<session id>:<turn>`, `site_turn`), so the door finds the sends the turn carried. A turn the
 * server knows nothing of — typed in the chat, or in a workspace with no site — draws nothing.
 */

import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { lineWords, type Report, reportDoor, reportOf } from './comment-report.mjs'
import { siteKeyFromPath } from './interrupted.mjs'
import { fallback, type Translate } from './strings'

/** The slice of dsh's `TurnLocation` the card reads. */
interface TurnLike {
  turn: number
  end?: { time: number }
}

export interface CommentReportCardProps {
  turn?: TurnLike
  /** From the registration's `inject`. */
  sessionId?: string
  /** From the registration's `inject`: a way to open comment `id`'s thread on the page, or null. */
  reveal?: (id: string) => (() => void) | null
  t?: Translate
}

/** The report as drawn: each group only when it has a comment; each line a button when it can open. */
export function CommentReport(props: {
  report: Report
  reveal?: (id: string) => (() => void) | null
  t?: Translate
}): JSX.Element {
  const { report, reveal, t } = props
  const group = (
    lines: Report['done'],
    head: 'report.done' | 'report.unconfirmed',
    hint: boolean
  ): JSX.Element | null => {
    if (lines.length === 0) return null
    const count = lines.length
    return (
      <>
        <p className="tv-report-head" data-report-group={head === 'report.done' ? 'done' : 'unconfirmed'}>
          {fallback(t, count === 1 ? `${head}.one` : `${head}.other`, { count })}
          {hint && <span className="tv-report-hint"> {fallback(t, 'report.doneHint')}</span>}
        </p>
        <ul className="tv-report-list">
          {lines.map((line) => {
            const words = line.text === '' ? fallback(t, 'comments.deletedComment') : lineWords(line.text)
            const open = reveal?.(line.id) ?? null
            return (
              <li key={line.id}>
                {open === null ? (
                  <span className="tv-report-line" data-report-comment={line.id}>
                    {words}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="tv-report-line"
                    data-report-comment={line.id}
                    title={fallback(t, 'report.open')}
                    onClick={open}
                  >
                    {words}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </>
    )
  }
  return (
    <div className="tv-report" role="status" data-tracy-comment-report="">
      {group(report.done, 'report.done', true)}
      {group(report.unconfirmed, 'report.unconfirmed', false)}
    </div>
  )
}

export function CommentReportCard(props: CommentReportCardProps): JSX.Element | null {
  const { turn, sessionId, reveal, t } = props
  const siteKey = typeof location === 'undefined' ? null : siteKeyFromPath(location.pathname)
  const [report, setReport] = useState<Report | null>(null)
  /** Only an ENDED turn of a site workspace is asked about: by then every write of it is stamped. */
  const door =
    turn?.end !== undefined && siteKey !== null && typeof sessionId === 'string' && sessionId !== ''
      ? reportDoor(siteKey, sessionId, turn.turn)
      : null

  useEffect(() => {
    if (door === null) return
    let live = true
    fetch(door, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(async (res) => {
        const body = res.ok ? await res.json().catch(() => null) : null
        if (live) setReport(reportOf(body))
      })
      .catch(() => {
        // No report rather than a wrong one: the chat above still says what Tracy did.
      })
    return () => {
      live = false
    }
  }, [door])

  if (door === null || report === null) return null
  return <CommentReport report={report} reveal={reveal} t={t} />
}
