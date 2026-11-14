/**
 * The build chat's move to the new site once the build is done (TracyHQ/tracy#611).
 *
 * - `MoveToSite`, in the build session's last turn when the outcome is done: asks tracy-web to hand the conversation
 *   to the site (`POST /api/build-draft/build/handoff`, with the conversation as it was said) and moves the screen to
 *   the address it answers, with no click: the site's own workspace, on the chat made ahead, with the Browser tab on
 *   the live site. A stopped or cancelled outcome never gets here. A refused ask is asked again a few times, then the
 *   task list stays as it is.
 * - `EarlierConversation`, in the site session's turn whose first message carries the hand off block: every earlier
 *   message as it was said, then the one living plan card. The raw block itself is folded into a chip by dsh
 *   (`HANDOFF_FENCE`, registered in `index.tsx`).
 */
import type { HandoffMessage } from '@tracy/core/build-chat'
import { type ReactNode, useEffect, useRef } from 'react'
import type { Translate } from './strings'

/** The hand off door (#611). */
export const BUILD_HANDOFF_PATH = '/api/build-draft/build/handoff'
/** How many times a refused hand off is asked, and how long apart. */
export const HANDOFF_TRIES = 4
export const HANDOFF_RETRY_MS = 3_000

/**
 * Ask for the hand off; resolves to the address to move to, or null when the door refused it.
 * @param messages - the build session's conversation
 * @param fetchImpl - the page's `fetch`; a test passes its own
 */
export async function requestHandoff(
  messages: readonly HandoffMessage[],
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<string | null> {
  try {
    const response = await fetchImpl(BUILD_HANDOFF_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ conversation: messages })
    })
    if (!response.ok) return null
    const body = await response.json().catch(() => null)
    const next = body?.next
    // Only an address on this origin: a site workspace path.
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null
  } catch {
    return null
  }
}

/** Moves the screen once, for the session it is drawn in. Draws nothing. */
export function MoveToSite({
  sessionId,
  messages,
  fetch: fetchImpl,
  navigate,
  retryMs = HANDOFF_RETRY_MS
}: {
  sessionId: string
  messages: readonly HandoffMessage[]
  fetch?: typeof fetch
  navigate: (href: string) => void
  retryMs?: number
}) {
  // The latest conversation, read when the ask goes out; the ask itself starts once per session.
  const said = useRef(messages)
  said.current = messages
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const ask = async (left: number) => {
      const next = await requestHandoff(said.current, fetchImpl)
      if (stopped) return
      if (next !== null) navigate(next)
      else if (left > 1) timer = setTimeout(() => void ask(left - 1), retryMs)
    }
    void ask(HANDOFF_TRIES)
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [sessionId, fetchImpl, navigate, retryMs])
  return null
}

/** Message text as read: the bold marks the agent writes in its answers are not shown as stars. */
const plainOf = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1')

/** The earlier conversation of the build chat, in the site chat. */
export function EarlierConversation({
  messages,
  plan,
  t
}: {
  messages: readonly HandoffMessage[]
  plan: ReactNode
  t: Translate
}) {
  const title = t('handoff.earlier')
  return (
    <section className="tv-bc-past" aria-label={title}>
      <h3 className="tv-bc-past-h tv-bc-muted tv-bc-small">{title}</h3>
      {messages.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the conversation is fixed once carried; order is its identity
        <div key={i} className="tv-bc-past-m" data-role={m.role}>
          <p>{plainOf(m.text)}</p>
        </div>
      ))}
      {plan}
    </section>
  )
}
