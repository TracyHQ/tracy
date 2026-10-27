/**
 * The line under a running chat that says what its turn waits on (#1403 item 10; rules in
 * `chat-wait.mjs`). Mounted in `conversation.input.dock` beside the held-message line, and drawn
 * like it. Asks only while the chat runs, and says nothing for a wait shorter than a few seconds.
 */

import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { readWait, WAIT_POLL_MS, waitLine } from './chat-wait.mjs'
import { dshUrl } from './dsh-url'
import { fallback, type Translate } from './strings'

interface SessionLike {
  running?: boolean
}

export interface ChatWaitLineProps {
  sessionId?: string
  useSession?: <T>(selector: (snapshot: SessionLike) => T) => T
  /** The host half; a test passes its own. */
  read?: (sessionId: string, signal: AbortSignal) => Promise<unknown>
  /** How often to ask (`WAIT_POLL_MS`); a test passes a shorter one. */
  every?: number
  t?: Translate
}

const readOfHost = (sessionId: string, signal: AbortSignal): Promise<unknown> =>
  readWait(sessionId, { dshUrl, signal })

export function ChatWaitLine({
  sessionId,
  useSession,
  read = readOfHost,
  every = WAIT_POLL_MS,
  t
}: ChatWaitLineProps): JSX.Element | null {
  const running = useSession ? useSession((s) => s.running === true) : false
  const [line, setLine] = useState<ReturnType<typeof waitLine>>(null)
  useEffect(() => {
    setLine(null)
    if (!running || typeof sessionId !== 'string') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = async (): Promise<void> => {
      const waiting = await read(sessionId, controller.signal)
      if (controller.signal.aborted) return
      setLine(waitLine(waiting))
      timer = setTimeout(() => void ask(), every)
    }
    timer = setTimeout(() => void ask(), every)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [running, sessionId, read, every])
  if (line === null) return null
  return (
    <div className="tv-held" role="status" data-chat-wait={line.kind}>
      {fallback(t, line.key, { seconds: line.seconds })}
    </div>
  )
}
