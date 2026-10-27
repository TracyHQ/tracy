/**
 * The undo a Site changes row offers for a chat turn (plan `tasks/undo-change/plan.md` PR 2, door
 * d3 of `plan-verified.html`): ONE button, "Undo this request" (or "Go back to before this request"
 * for an older turn), that runs the same engine as the card under the chat turn — `GET …/turns`
 * decides, `POST …/turns/undo` undoes — through `@tracy/core/turn-undo`, so both doors say the same
 * thing about the same turn.
 *
 * 🔒 THE ENGINE ANSWERS ONLY WHAT THIS SEAT MAY SEE. The turns door lists another person's turns to
 * an Owner or Admin only; a turn it does not list — and a read that failed, and every event that is
 * not a chat turn — keeps the row's actions of before (`legacy`): Undo file changes where the server
 * allows it, Ask Tracy to revert, and the sentence why not.
 */
import { type BookEntry, type Card, cardOf } from '../turn-undo/index.mjs'
import type { ActivityItemV2 } from './api'
import { conversationOf } from './activity-v2'

export type RequestUndo =
  /** Today's actions: not a chat turn, a turn the engine does not list, or a read that failed. */
  | { kind: 'legacy' }
  /** The engine is being asked; no undo or ask button yet, so none appears and then vanishes. */
  | { kind: 'loading' }
  /** The engine's answer for this turn, as the chat card reads it (`cardOf`). */
  | { kind: 'engine'; card: Card; entry: BookEntry & { answer: NonNullable<BookEntry['answer']> } }

/** The session and turn the engine is asked about, or null when the row is not a chat turn. */
export function engineTurnOf(
  item: Pick<ActivityItemV2, 'kind' | 'origin'> & { conversation?: ActivityItemV2['conversation'] }
): { sessionId: string; turn: number } | null {
  if (item.kind !== 'turn') return null
  const c = conversationOf(item)
  if (c === null || !Number.isInteger(c.turn)) return null
  return { sessionId: c.sessionId, turn: c.turn }
}

/** Which undo the row shows, from the engine's book entry for its chat (undefined: never asked). */
export function requestUndoOf(
  item: Pick<ActivityItemV2, 'kind' | 'origin'> & { conversation?: ActivityItemV2['conversation'] },
  entry: BookEntry | undefined
): RequestUndo {
  const at = engineTurnOf(item)
  if (at === null) return { kind: 'legacy' }
  if (entry === undefined || entry.answer === null)
    return entry?.status === 'failed' ? { kind: 'legacy' } : { kind: 'loading' }
  const card = cardOf(entry.answer, at.turn)
  if (card === null) return { kind: 'legacy' }
  return { kind: 'engine', card, entry: { ...entry, answer: entry.answer } }
}
