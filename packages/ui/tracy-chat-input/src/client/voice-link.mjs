/**
 * The chat box's side of the voice socket. Its other side, and the shape of every message, are in
 * `apps/tracy-web/src/speech/relay.js`: frames of 16 kHz PCM out, `{type:"stop"}` when the person is
 * done; `ready`, `partial`, `committed`, `language` and one last `end` back.
 *
 * Speech is a Tracy door outside dsh's base mount. The verified widget's native document uses its
 * explicit visitor-authenticated bridge instead; ordinary workspace paths keep the root door.
 *
 * THE CHAT'S MAIN LANGUAGE rides the address (`?language=vi`): the relay may tell the service, which
 * then keeps a Vietnamese phrase with an English word in it (`relay.js`, measured 15/10/2026).
 *
 * THE SITE THE PAGE STANDS IN rides it too (`?site=<site key>`, from `<base href>`): for a site in the
 * keyterms pilot the relay looks up the site's own names for the service, for this account only
 * (council 19/10/2026, A1; `apps/tracy-web/src/lib/speech-keyterms.js`). The page sends no name itself.
 *
 * Frames sent before the socket opens wait here, up to five seconds of audio — the relay's own bound —
 * so the first words spoken right after the press are not lost. A socket that closes without an `end`
 * is reported as `network`, unsettled.
 */

import { siteKeyFromPath } from './interrupted.mjs'

export const SPEECH_PATH = '/api/speech/stream'
const WAITING_FRAMES = 50

/**
 * The site this page is the workspace of (`<base href="/<siteKey>/">`), '' on `/new/`, in the widget,
 * or anywhere the page stands in no site.
 * @param {{ baseURI?: string } | undefined} [doc]
 * @returns {string}
 */
export function pageSite(doc = globalThis.document) {
  try {
    return doc?.baseURI ? (siteKeyFromPath(new URL(doc.baseURI).pathname) ?? '') : ''
  } catch {
    return ''
  }
}

/** @param {string} path @param {{pathname?: string}} [where] */
export function speechHttpPath(path, where = globalThis.location) {
  if (!['/api/speech', '/api/speech/say', SPEECH_PATH].includes(path)) throw new Error('SPEECH_PATH_INVALID')
  return where?.pathname?.startsWith('/widget/native/') || where?.pathname === '/widget/native'
    ? (path === SPEECH_PATH ? '/widget' : '/widget/backend') + path
    : path
}

/**
 * @param {{ protocol: string, host: string, pathname?: string }} [where]
 * @param {string} [language] - the chat's main language (`voice-language.mjs`), '' when none: sent
 *   as `?language=`, and the relay alone decides whether the service is told it.
 * @param {boolean} [turns] - a voice conversation (`voice-mode.mjs`), sent as `?turns=voice`; dictation leaves it off.
 * @param {string} [site] - the site the page stands in ({@link pageSite}), sent as `?site=`; '' sends none.
 * @returns {string}
 */
export function speechSocketUrl(where = globalThis.location, language = '', turns = false, site = '') {
  const params = new URLSearchParams()
  if (/^[a-z]{2,3}$/.test(language)) params.set('language', language)
  // A voice conversation: the service ends a phrase sooner (`speech/relay.js` `TURN_SILENCE_SECONDS`).
  if (turns) params.set('turns', 'voice')
  // The relay reads the site's names itself, and only for a site this account holds a seat on.
  if (siteKeyFromPath(`/${site}`) === site && site !== '') params.set('site', site)
  // Read as text, never `params.size`: Safari before 17 has no `size`, and both hints were lost there.
  const query = params.toString() === '' ? '' : `?${params}`
  return `${where.protocol === 'https:' ? 'wss:' : 'ws:'}//${where.host}${speechHttpPath(SPEECH_PATH, where)}${query}`
}

/**
 * @typedef {{
 *   onReady?: (facts?: { capabilities?: {tts?: {prewarm?: boolean}}, sessionToken?: string, actualProvider?: string, primaryProvider?: string, provider?: string, fallbackUsed?: boolean, revision?: string, voices?: {id: string, name: string}[], transcriptWaitMs?: number, speak?: {maxChars: number, sampleRate: number, answerMs: number} }) => void,
 *   onWords: (committed: readonly string[], partial: string) => void,
 *   onLanguage?: (code: string) => void,
 *   onEnd: (reason: string, settled: boolean) => void
 * }} SpeechHandlers
 */

/**
 * Open one voice session.
 * @param {SpeechHandlers} handlers - `onEnd` is called exactly once, unless `close()` came first.
 * @param {{ url?: string, WebSocketImpl?: typeof WebSocket }} [options]
 */
export function openSpeechLink(handlers, { url = speechSocketUrl(), WebSocketImpl = WebSocket } = {}) {
  const socket = new WebSocketImpl(url)
  socket.binaryType = 'arraybuffer'
  /** @type {ArrayBuffer[]} */
  let waiting = []
  /** @type {string[]} */
  const committed = []
  let partial = ''
  let done = false

  /** @param {string} reason @param {boolean} settled */
  const finish = (reason, settled) => {
    if (done) return
    done = true
    handlers.onEnd(reason, settled)
  }

  socket.addEventListener('open', () => {
    for (const frame of waiting) socket.send(frame)
    waiting = []
  })
  socket.addEventListener('message', (event) => {
    if (done || typeof event.data !== 'string') return
    let message = null
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    switch (message?.type) {
      case 'ready':
        handlers.onReady?.(message)
        return
      case 'partial':
        partial = String(message.text ?? '')
        handlers.onWords(committed, partial)
        return
      case 'committed':
        committed.push(String(message.text ?? ''))
        partial = ''
        handlers.onWords(committed, partial)
        return
      case 'language':
        if (typeof message.code === 'string' && message.code !== '') handlers.onLanguage?.(message.code)
        return
      case 'end':
        finish(String(message.reason ?? 'network'), message.settled !== false)
        return
    }
  })
  socket.addEventListener('close', () => finish('network', false))
  socket.addEventListener('error', () => finish('network', false))

  return {
    /** @param {ArrayBuffer} frame */
    sendAudio(frame) {
      if (done) return
      if (socket.readyState === WebSocketImpl.OPEN) socket.send(frame)
      else if (socket.readyState === WebSocketImpl.CONNECTING && waiting.length < WAITING_FRAMES)
        waiting.push(frame)
    },
    /** The person is done: the relay confirms what is still being spoken, then ends. */
    stop() {
      if (done) return
      if (socket.readyState === WebSocketImpl.OPEN) socket.send(JSON.stringify({ type: 'stop' }))
      else {
        // Never opened: there is nothing the service heard to wait for.
        done = true
        socket.close()
        handlers.onEnd('stopped', true)
      }
    },
    /** Drop the session without a word to anyone (Cancel, the page going away). */
    close() {
      done = true
      waiting = []
      if (socket.readyState === WebSocketImpl.OPEN || socket.readyState === WebSocketImpl.CONNECTING)
        socket.close()
    }
  }
}
