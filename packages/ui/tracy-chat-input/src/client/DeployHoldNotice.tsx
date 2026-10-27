/**
 * The line under the queue while a Tracy update holds this conversation's message, and after it
 * when the message could not run (#517). The rules live in `held-notice.mjs`; this file only asks
 * the door and draws.
 *
 * Mounted in `conversation.input.dock` (the list slot dsh renders above the input bar, where the
 * queue also sits). A session-scoped occupant gets `sessionId`, `useSession` and `useProjection`
 * from ui-session's standard props; every shape below is structural on purpose, as elsewhere in
 * this package: importing dsh's types would bundle its client into this one.
 *
 * 🔒 THE MESSAGE ITSELF IS dsh's TO DRAW. A message sent to an idle conversation stays in the
 * transcript as its sending echo, and after a reload it is a queue row (editable, removable); this
 * line adds only what neither says — that Tracy is updating, or that the message did not run. It
 * never repeats the message text, so nothing the author typed is drawn twice or as HTML.
 */

import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { dshUrl } from './dsh-url'
import {
  ackHeld,
  noticeAcker,
  drawnNotices,
  type EarlierNotice,
  earlierNoticeKey,
  type HeldNoticeKey,
  type HeldState,
  heldNoticeKey,
  readHeld,
  shouldPoll,
  watchHeld
} from './held-notice.mjs'
import { fallback, type Translate } from './strings'

/** The slice of dsh's session snapshot the line reads. */
interface SessionLike {
  running?: boolean
  pendingSubmissions?: readonly unknown[]
}

/** The slice of the inbox projection the line reads: how many messages wait for a turn. */
interface InboxLike {
  'next-turn'?: readonly unknown[]
}

export interface DeployHoldNoticeProps {
  sessionId?: string
  useSession?: <T>(selector: (snapshot: SessionLike) => T) => T
  useProjection?: (key: 'inbox') => unknown
  t?: Translate
}

/** What the door last said, tagged with the conversation it was about. */
interface Shown {
  sessionId: string
  state: HeldState
  count: number
  recorded: boolean
  settled: boolean
  id: string | null
  earlier: EarlierNotice[]
}

export function DeployHoldNotice({
  sessionId,
  useSession,
  useProjection,
  t
}: DeployHoldNoticeProps): JSX.Element | null {
  // Hooks run on every render, whatever this conversation shows.
  const running = useSession ? useSession((s) => s.running === true) : false
  const echoes = useSession ? useSession((s) => s.pendingSubmissions?.length ?? 0) : 0
  const inbox = (useProjection ? useProjection('inbox') : undefined) as InboxLike | undefined
  const queued = (Array.isArray(inbox?.['next-turn']) ? inbox['next-turn'].length : 0) + echoes
  const [shown, setShown] = useState<Shown | null>(null)
  const current = shown !== null && shown.sessionId === sessionId ? shown : null
  const poll = shouldPoll({ state: current?.state ?? null, settled: current?.settled, queued, running })
  const noticeKey =
    current === null
      ? null
      : heldNoticeKey({
          state: current.state,
          count: current.count,
          recorded: current.recorded,
          queued,
          running
        })
  /** Confirms drawn notices until the host took them (bounded tries); retries and requests die with the page. */
  const acker = useRef<ReturnType<typeof noticeAcker> | null>(null)
  useEffect(() => {
    const own = noticeAcker((id, ids, signal) => ackHeld(id, ids, { dshUrl, signal }))
    acker.current = own
    return () => {
      own.stop()
      if (acker.current === own) acker.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof sessionId !== 'string') return
    return watchHeld(sessionId, {
      poll,
      read: (id, signal) => readHeld(id, { dshUrl, signal }),
      onAnswer: (answer) =>
        setShown({
          sessionId,
          state: answer.state,
          count: answer.count,
          recorded: answer.recorded,
          settled: answer.settled,
          id: answer.id,
          earlier: answer.earlier
        })
    })
    // `running` asks again when a turn starts or ends: a notice about a message that did not run
    // ends once its author sends again.
  }, [sessionId, poll, running])

  // Runs after the notices were drawn: only then does the host count them as seen by their author,
  // and only the ones drawn, by id — a newer notice the host holds meanwhile is not confirmed.
  useEffect(() => {
    if (current === null) return
    void acker.current?.ack(current.sessionId, drawnNotices(current, noticeKey))
  }, [current, noticeKey])

  if (current === null) return null
  return <HeldLines noticeKey={noticeKey} earlierKeys={current.earlier.map(earlierNoticeKey)} t={t} />
}

/**
 * The lines for one answer: earlier updates' notices not yet answered (`earlierKeys`, one line
 * each), above the line about this conversation's own record. Rendered by `test/deploy-hold.test.mjs`.
 */
export function HeldLines({
  noticeKey,
  earlierKeys = [],
  t
}: {
  noticeKey: HeldNoticeKey | null
  earlierKeys?: readonly (HeldNoticeKey | null)[]
  t?: Translate
}): JSX.Element | null {
  if (earlierKeys.length === 0) return <HeldLine noticeKey={noticeKey} t={t} />
  return (
    <>
      {earlierKeys.map((key, i) => (
        <HeldLine key={i} noticeKey={key} t={t} />
      ))}
      <HeldLine noticeKey={noticeKey} t={t} />
    </>
  )
}

/** The line itself, a pure function of which notice it is (rendered by `test/deploy-hold.test.mjs`). */
export function HeldLine({
  noticeKey,
  t
}: {
  noticeKey: HeldNoticeKey | null
  t?: Translate
}): JSX.Element | null {
  if (noticeKey === null) return null
  return (
    <div
      className={
        noticeKey === 'held.waiting' || noticeKey === 'held.delayed' || noticeKey === 'held.unsaved'
          ? 'tv-held'
          : 'tv-held tv-held-error'
      }
      role="status"
    >
      {fallback(t, noticeKey)}
    </div>
  )
}
