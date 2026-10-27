import { openSpeechLink } from './voice.js'

/** Ready facts replace provider-specific fields instead of retaining a previous provider's voice. */
export function readySpeechFacts(previous, ready) {
  if (!ready?.provider) return previous
  const actualProvider = ready.actualProvider || ready.provider
  const changed = actualProvider !== (previous.actualProvider || previous.provider)
  return {
    ...previous,
    provider: ready.primaryProvider ?? previous.provider,
    actualProvider,
    fallbackUsed: ready.fallbackUsed === true,
    revision: ready.revision ?? previous.revision,
    sessionToken:
      typeof ready.sessionToken === 'string' && ready.sessionToken ? ready.sessionToken : undefined,
    voices: Array.isArray(ready.voices) ? ready.voices : changed ? [] : previous.voices,
    transcriptWaitMs: ready.transcriptWaitMs ?? previous.transcriptWaitMs,
    capabilities: ready.capabilities ?? (changed ? undefined : previous.capabilities),
    speak: ready.speak ?? (changed ? undefined : previous.speak)
  }
}

/** Preserve ready metadata even with the older shared link that only signals readiness. */
export function openWidgetSpeechLink(handlers, options = {}) {
  const Base = options.WebSocketImpl || globalThis.WebSocket
  class WidgetSocket extends Base {
    constructor(url) {
      super(url)
      this.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        let facts
        try {
          facts = JSON.parse(event.data)
        } catch {
          return
        }
        if (facts?.type === 'ready') handlers.onReady?.(facts)
      })
    }
  }
  return openSpeechLink({ ...handlers, onReady: () => {} }, { ...options, WebSocketImpl: WidgetSocket })
}
