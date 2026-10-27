/**
 * Chat or Voice, per conversation (`VoiceMode.tsx`): the voice view is a dsh `conversation.view`
 * (`VOICE_VIEW`) whose tab is never drawn (`voice-styles.ts`); the mode menu and the audio wave choose it.
 *
 * dsh gives a plugin no call that SELECTS a view (`comments-open.mjs` says why): the one public road
 * is dsh's own tab button, which `selectView`s — so Voice and Chat are chosen by pressing it, hidden or
 * not, once the strip has rendered. A new chat has no strip until a view definition says it is active
 * (`commentsViewDefinition`): `wanted` says so while a person asked for Voice there.
 *
 * Kept free of React so `test/voice-mode-view.test.mjs` can hold it.
 */

/** The voice view's id (a dsh `conversation.view`); dsh's own chat view is the one Comments goes back to. */
export const VOICE_VIEW = 'tracy-voice'
export { CHAT_VIEW } from './comments-open.mjs'

/** How many animation frames to wait for the tab strip to render before giving up (~0.5 s). */
const MAX_FRAMES = 30

/**
 * dsh's tab button of a view, or null while the strip is not there.
 * @param {{ querySelector(selector: string): any }} doc
 * @param {string} viewId
 */
export function viewTab(doc, viewId) {
  return doc.querySelector(`[data-conversation-tabs] [role="tab"][data-view="${viewId}"]`)
}

/**
 * Press a view's tab button once the strip has rendered, unless it is the one shown; give up quietly
 * after {@link MAX_FRAMES}.
 * @param {() => { getAttribute(name: string): string | null, click(): void } | null} findTab
 * @param {(fn: () => void) => void} frame
 */
export function pressViewTab(findTab, frame) {
  let tries = 0
  const select = () => {
    const tab = findTab()
    if (tab !== null) {
      if (tab.getAttribute('aria-selected') !== 'true') tab.click()
      return
    }
    tries += 1
    if (tries < MAX_FRAMES) frame(select)
  }
  select()
}

/**
 * The sessions that show the voice view now: the footer takes their chat box, the menu checks Voice.
 * @returns {{ get(): ReadonlySet<string>, has(id: string): boolean, mark(id: string, on: boolean): void, subscribe(fn: () => void): () => void }}
 */
export function shownSessions() {
  /** @type {ReadonlySet<string>} */
  let value = new Set()
  const listeners = new Set()
  return {
    get: () => value,
    has: (id) => value.has(id),
    mark(id, on) {
      if (value.has(id) === on) return
      const next = new Set(value)
      if (on) next.add(id)
      else next.delete(id)
      value = next
      for (const fn of Array.from(listeners)) fn()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

/**
 * A flag others follow (`wanted`: a person asked for Voice in a new chat).
 * @param {boolean} initial
 */
export function flag(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    /** @param {boolean} next */
    set(next) {
      if (next === value) return
      value = next
      for (const fn of Array.from(listeners)) fn()
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

/** The most characters of the words told to the host (`voice-reply.mjs` `SPOKEN_CHARS`). */
export const SPOKEN_CHARS = 1000

/** How long sending waits for the host to take the words; past it the message goes without the rule. */
export const SPOKEN_WAIT_MS = 1500

/**
 * Tell the host the words about to be sent in Voice (`tracy-site-tools` `voice-reply.mjs`, through its
 * `/view` door), and wait for its answer, so the step that takes that message replies to be heard.
 * Bound to the words, not the conversation (council 18/10/2026): a message typed in another tab never
 * gets the rule, and another tab leaving Voice never takes it away. A host that does not answer in
 * {@link SPOKEN_WAIT_MS}, or refuses, costs only the rule: the words are sent all the same.
 * @param {(body: { sessionId: string, spoken: string }, signal: AbortSignal) => Promise<unknown>} post
 * @param {string} sessionId
 * @param {string} words
 * @param {number} [waitMs]
 */
export async function tellSpoken(post, sessionId, words, waitMs = SPOKEN_WAIT_MS) {
  const spoken = words.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, SPOKEN_CHARS)
  if (spoken === '') return
  const abort = new AbortController()
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const late = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      abort.abort()
      reject(new Error('the host did not answer'))
    }, waitMs)
  })
  try {
    await Promise.race([post({ sessionId, spoken }, abort.signal), late])
  } catch {
    // Sent without the rule: the reply is longer to hear, nothing more.
  } finally {
    clearTimeout(timer)
  }
}
