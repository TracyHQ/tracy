/**
 * Idempotency keys for the presses that start work (research, build).
 *
 * A key lives from the press until the server confirms it: a double press while it is in flight, or a
 * retry after a failed answer, sends the same id, so the server's `(account, request_id)` unique key
 * hands back the job it already made instead of a second one. Only a confirmed press frees the key.
 */
export interface RequestIds {
  /** The id for this action: the held one when a press is unconfirmed, else a fresh one. */
  begin(action: string): { id: string; repeat: boolean }
  /** The server took it: the next press is a new request. */
  succeed(action: string): void
  /** The answer failed: keep the id so a retry is recognised as the same request. */
  fail(action: string): void
  /** Whether a press of this action is in flight now. */
  pending(action: string): boolean
}

export function createRequestIds(newId: () => string): RequestIds {
  const held = new Map<string, { id: string; inFlight: boolean }>()
  return {
    begin(action) {
      const entry = held.get(action)
      if (entry !== undefined) {
        const repeat = entry.inFlight
        entry.inFlight = true
        return { id: entry.id, repeat }
      }
      const id = newId()
      held.set(action, { id, inFlight: true })
      return { id, repeat: false }
    },
    succeed(action) {
      held.delete(action)
    },
    fail(action) {
      const entry = held.get(action)
      if (entry !== undefined) entry.inFlight = false
    },
    pending(action) {
      return held.get(action)?.inFlight === true
    }
  }
}
