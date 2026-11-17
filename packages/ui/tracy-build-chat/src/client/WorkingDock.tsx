/**
 * The polite announcement of the working step (#609, #575). While a `tracy_build` call waits (the session's open turn
 * carries the `tracy_build:working` value, `definitions.ts`), a screen reader hears the step the engine really runs
 * ("Reading your links", `engine-feed.ts`) each time it changes. It draws nothing on screen: the progress block is the
 * call's own row in the conversation (`BuildToolRow.tsx`), and a second copy of it above the chat input was the
 * duplicate block the owner saw (#575). Registered in `conversation.input.dock`, which dsh keeps mounted while the
 * composer shows, so the live region is in place before its words arrive. A turn that ended announces nothing.
 */
import { isBuildChatSession } from '@tracy/core/build-chat'
import { useSyncExternalStore } from 'react'
import { titleOf, toolRowOfView } from './BuildToolRow'
import { WORKING_KEY, type WorkingValue } from './definitions'
import { type EngineFeed, type EngineSeen, rowOfRunning } from './engine-feed'
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
  /** The engine's running step (`engine-feed.ts`): the announcement says the step that really runs. */
  engine?: EngineFeed
}

const NONE = { getSnapshot: () => undefined, subscribe: () => () => {} }
const NO_ENGINE = { read: (): EngineSeen | null => null, subscribe: () => () => {} }
const noChat: NonNullable<WorkingDockProps['useChat']> = (select) => select({ timeline: { turnOrder: [] } })

const lastTurnOf = (snapshot: ChatLike): TurnLike | null => {
  const last = snapshot.timeline.turnOrder.at(-1)
  return last === undefined ? null : (snapshot.timeline.turns?.get(last) ?? null)
}

/** The words announced for a waiting call of this step. */
export function workingWordsOf(step: string, live: EngineSeen | null, t: Translate): string {
  const own = toolRowOfView({ phase: 'start', block: { argsRaw: JSON.stringify({ action: step }) } })
  const row = own === null ? null : rowOfRunning(own, live)
  return row === null ? '' : titleOf(row, t)
}

export function WorkingDock({
  sessionId,
  useChat = noChat,
  engine = NO_ENGINE,
  t
}: WorkingDockProps & { t: Translate }) {
  const turn = useChat(lastTurnOf)
  const closed = turn?.status === 'closed'
  const source = turn?.data?.source?.(WORKING_KEY) ?? NONE
  const read = () => source.getSnapshot() ?? turn?.data?.get?.(WORKING_KEY)
  const working = useSyncExternalStore(source.subscribe, read, read) as WorkingValue | undefined
  if (!isBuildChatSession(sessionId)) return null
  const on = !closed && working
  return (
    <div
      className="tv-bc-dock"
      role="status"
      aria-live="polite"
      data-build-working={on ? working.step : undefined}
    >
      {on ? <StepWords step={working.step} engine={engine} t={t} /> : null}
    </div>
  )
}

/** The words of the waiting step; it reads the engine only while it is mounted, so nobody polls once work ends. */
function StepWords({
  step,
  engine,
  t
}: {
  step: string
  engine: Pick<EngineFeed, 'read' | 'subscribe'>
  t: Translate
}) {
  const live = useSyncExternalStore(engine.subscribe, engine.read, () => null)
  return <>{workingWordsOf(step, live, t)}</>
}
