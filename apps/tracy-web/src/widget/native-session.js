/** Adopt discovery context without submitting historical prompts or performing any site operation. */
import { finishNativeHandoff, prepareNativeHandoff } from './native-handoff.js'

/**
 * A stored turn or create older than this is not running anywhere: a turn is at most four model calls
 * of 60 s each (`model.js`), a create one request to the create door, which takes a dead claim over
 * after 30 s (`sites/route.js` `CLAIM_STALE_MS`).
 */
export const INFLIGHT_STALE_MS = 5 * 60_000

/**
 * Whether discovery work may still be running: in this process (`busy`, `creating`), or stored less
 * than `INFLIGHT_STALE_MS` ago by a process that may since have stopped. A failed turn clears its own
 * record (`route.js`), so what is left is a restart mid-run; one stored with no start time was
 * written before 19/10/2026, by a process that has restarted since.
 */
function stillRunning(visitor, now = Date.now()) {
  if (visitor.busy || visitor.creating) return true
  const at = visitor.inflight?.at
  return Number.isSafeInteger(at) && now - at < INFLIGHT_STALE_MS
}

export function nativeSessions({ save, mintNative }) {
  return {
    async open(visitor, email) {
      if (!email || !visitor.ownerId || visitor.locked) throw Error('WIDGET_NATIVE_SIGN_IN_REQUIRED')
      if (stillRunning(visitor)) throw Error('WIDGET_NATIVE_WAIT_FOR_TURN')
      const identity = () => ({
        visitorId: visitor.id,
        ownerAccountId: visitor.ownerId,
        expectedRevision: visitor.revision
      })
      const mapping = prepareNativeHandoff(visitor, identity())
      if (mapping.state === 'ready') return mapping
      if (!mintNative) throw Error('WIDGET_NATIVE_UNAVAILABLE')
      visitor.busy = true
      try {
        visitor.nativeHandoff = mapping
        // The native chat takes over: the page hands its unsent words to the native composer as a
        // draft, and a turn that never finished cannot run here any more. Neither is offered again.
        if (visitor.inflight?.kind === 'turn') visitor.inflight = null
        visitor.clientPending = { pendingDraft: '', voiceDraft: '' }
        // Every retry confirms a durable CAS before allocation, including an earlier failed save.
        await save(visitor)
        // This server-authenticated door also verifies the native log's cwd/preset on retries.
        const made = await mintNative({
          email,
          sessionId: mapping.sessionId,
          agentPreset: `designer-${visitor.brief.platform}`
        })
        if (
          made?.sessionId !== mapping.sessionId ||
          typeof made?.workspaceId !== 'string' ||
          !made.workspaceId
        )
          throw Error('WIDGET_NATIVE_SESSION_UNAVAILABLE')
        const ready = finishNativeHandoff(visitor, identity(), {
          sessionId: made.sessionId,
          workspaceId: made.workspaceId
        })
        visitor.nativeHandoff = ready
        try {
          await save(visitor)
        } catch (error) {
          visitor.nativeHandoff = mapping
          throw error
        }
        return visitor.nativeHandoff
      } finally {
        visitor.busy = false
      }
    }
  }
}
