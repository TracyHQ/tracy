/**
 * One progress block per working step (#575). A long step answers its `tracy_build` call "still running" (or "waiting
 * for your choice") and the agent carries the wait on with the next call, so without this every call of one step drew
 * its own row and the owner read the same step three times. Here a conversation node definition folds the session's
 * build calls in order and marks every call that a later build call carried on; the row of a marked call that only
 * said work goes on draws nothing, so the newest row is the one block that updates. A finished step (its done line),
 * a stop and an error are never marked away. The fold reads the session log, so a reload draws the same rows.
 *
 * Duck-typed like `definitions.ts`: nothing is imported from dsh at run time.
 */
import { BUILD_TOOL, type BuildToolRow } from '@tracy/core/build-chat'

export const SUPERSEDE_KEY = `${BUILD_TOOL}:superseded`

/** The calls a later build call carried on, shared by every row of the page (call ids are unique). */
export interface SupersededCalls {
  has(callId: string): boolean
  subscribe(listener: () => void): () => void
}

export function createSupersededCalls(): SupersededCalls & { mark(callId: string): void } {
  const marked = new Set<string>()
  const listeners = new Set<() => void>()
  return {
    has: (callId) => marked.has(callId),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    mark(callId) {
      if (marked.has(callId)) return
      marked.add(callId)
      for (const listener of listeners) listener()
    }
  }
}

interface EventLike {
  type: string
  data?: { name?: unknown; callId?: unknown }
}
interface SupersedeState {
  last: string | null
}

const callIdOf = (event: EventLike): string | null =>
  event.type === 'tool/call' && event.data?.name === BUILD_TOOL && typeof event.data.callId === 'string'
    ? event.data.callId
    : null

/** The definition: one context for the session, every build call in order; it publishes nothing. */
export function supersedeDefinitionFor(store: { mark(callId: string): void }) {
  const step = (state: SupersedeState, event: EventLike): SupersedeState => {
    const callId = callIdOf(event)
    if (callId === null || callId === state.last) return state
    if (state.last !== null) store.mark(state.last)
    return { last: callId }
  }
  return {
    kind: SUPERSEDE_KEY,
    // Every match says 'start': dsh starts the context on the first one and reads every later one as an update.
    match: (event: EventLike) =>
      callIdOf(event) === null ? null : { id: 'session', role: 'start' as const },
    start: (_context: unknown, m: { event: EventLike }): SupersedeState => step({ last: null }, m.event),
    update: (context: { state: SupersedeState }, m: { event: EventLike }): SupersedeState =>
      step(context.state, m.event),
    buildLocationData: () => null
  }
}

/** The row to draw once a later call carried this one on: none for a row that only said work goes on. */
export function rowAfterSupersede(row: BuildToolRow | null, superseded: boolean): BuildToolRow | null {
  if (row === null || !superseded) return row
  return row.kind === 'working' || row.kind === 'waiting' ? null : row
}
