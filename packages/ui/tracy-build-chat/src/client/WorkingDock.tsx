/**
 * The line above the chat input that says work is going on (#609), while a `tracy_build` call waits: the brand step
 * and the plan can take minutes, and dsh folds the call's own row ("Working on your site plan") into the turn's
 * collapsed process, so without this line the owner sees nothing move. It is the same row, drawn in
 * `conversation.input.dock` (shown while the composer is), for as long as the session's open turn carries the
 * `tracy_build:working` value (`definitions.ts`): the call is not answered yet, or answered `running`. A turn that
 * ended (stopped, failed) shows nothing.
 */
import { isBuildChatSession } from '@tracy/core/build-chat'
import { useSyncExternalStore } from 'react'
import { BuildToolRow } from './BuildToolRow'
import { WORKING_KEY, type WorkingValue } from './definitions'
import type { Translate } from './strings'

/** The slice of dsh's turn location the line reads (ui-conversation `TurnLocation`). */
interface TurnLike {
  status?: 'open' | 'closed' | 'unknown'
  data?: {
    get?: (key: string) => unknown
    source?: (key: string) => { getSnapshot(): unknown; subscribe(listener: () => void): () => void }
  }
}

/** The slice of dsh's chat snapshot the line reads. */
interface ChatLike {
  timeline: { turnOrder: readonly number[]; turns?: ReadonlyMap<number, TurnLike> }
}

export interface WorkingDockProps {
  sessionId?: string
  useChat?: <T>(select: (snapshot: ChatLike) => T) => T
}

const NONE = { getSnapshot: () => undefined, subscribe: () => () => {} }
const noChat: NonNullable<WorkingDockProps['useChat']> = (select) => select({ timeline: { turnOrder: [] } })

const lastTurnOf = (snapshot: ChatLike): TurnLike | null => {
  const last = snapshot.timeline.turnOrder.at(-1)
  return last === undefined ? null : (snapshot.timeline.turns?.get(last) ?? null)
}

export function WorkingDock({ sessionId, useChat = noChat, t }: WorkingDockProps & { t: Translate }) {
  const turn = useChat(lastTurnOf)
  const closed = turn?.status === 'closed'
  const source = turn?.data?.source?.(WORKING_KEY) ?? NONE
  const read = () => source.getSnapshot() ?? turn?.data?.get?.(WORKING_KEY)
  const working = useSyncExternalStore(source.subscribe, read, read) as WorkingValue | undefined
  if (!isBuildChatSession(sessionId) || closed || !working) return null
  return (
    <div className="tv-bc-dock" data-build-working={working.step}>
      <BuildToolRow view={{ phase: 'start', block: {} }} t={t} />
    </div>
  )
}
