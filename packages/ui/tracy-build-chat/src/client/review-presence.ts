/**
 * Which build sessions show the plan review bar right now (#609). The bar draws the living plan card above its
 * question, because dsh draws a turn's tail only once the turn ends, and the turn that asks the review does not end
 * while the question waits. While the bar shows, the plan's turn tail draws nothing, so the conversation keeps one
 * living plan card: in the bar while the owner reviews it, at the turn's tail once the turn is over.
 */
export interface ReviewPresence {
  /** Marks the bar of `sessionId` as shown; the returned function marks it gone. */
  show(sessionId: string): () => void
  has(sessionId: string): boolean
  subscribe(listener: () => void): () => void
}

export function createReviewPresence(): ReviewPresence {
  const shown = new Map<string, number>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    show(sessionId) {
      shown.set(sessionId, (shown.get(sessionId) ?? 0) + 1)
      notify()
      let done = false
      return () => {
        if (done) return
        done = true
        const left = (shown.get(sessionId) ?? 1) - 1
        if (left > 0) shown.set(sessionId, left)
        else shown.delete(sessionId)
        notify()
      }
    },
    has: (sessionId) => shown.has(sessionId),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
