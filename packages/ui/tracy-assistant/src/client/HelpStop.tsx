/**
 * The chat box's stop button for Help (David, 11/10/2026): ONE orange button. While a Help answer is being
 * written, the composer's own round button shows the stop square, and pressing it stops everything Help is
 * doing (the answer, and the questions still waiting). If the agent runs too, dsh's own stop comes back in the
 * same place once Help has stopped, so a second press stops the agent.
 *
 * dsh's composer has a single seat right before its Stop/Send buttons, `conversation.input.activity`
 * (ui-conversation InputBar). `@tracy/dsh-chat-input`'s microphone occupies it and draws this button after
 * itself, handed over through `@tracy/core/input-activity` (#1379); without chat-input, Help's own
 * registration of the seat draws the same list. It draws nothing while no
 * Help answer is being written. While one is, the stylesheet (`styles.ts`) hides dsh's primary while that is
 * disabled and every stop dsh draws, so this button stands in the orange primary's place. With a draft typed,
 * dsh's Send stays the orange primary and this is the one quiet stop beside it.
 *
 * It never calls the seat's `onActiveChange`: that hands the whole tool row to the occupant and hides the
 * composer's other controls, which a stop button must not do.
 */
import { useSyncExternalStore } from 'react'
import { controllerOf, streamingRowOf } from './help'
import type { Translate } from './strings'

/** The slice of `chatLocal.for(sessionId)` this button reads. */
export interface StopRows {
  readonly nodes: {
    subscribe(listener: () => void): () => void
    getSnapshot(): readonly { key: string; kind: string; data: unknown }[]
  }
}

export function HelpStop({
  sessionId,
  local,
  t
}: {
  sessionId: string | undefined
  local: StopRows | undefined
  t: Translate
}) {
  const nodes = useSyncExternalStore(
    (listener) => local?.nodes.subscribe(listener) ?? (() => {}),
    () => local?.nodes.getSnapshot() ?? NONE
  )
  const rowId = streamingRowOf(nodes)
  if (!sessionId || rowId === undefined) return null
  const label = t('action.stopAnswer')
  return (
    <button
      type="button"
      className="tv-help-stop"
      aria-label={label}
      title={label}
      // The draft keeps the keyboard: pressing stop is not a reason to leave what the person was typing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => controllerOf(sessionId)?.stopAll()}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
      </svg>
    </button>
  )
}

const NONE: readonly never[] = []
