/**
 * Voice input: the microphone beside Send, as in Claude Code and Claude Design. Press it and speak;
 * the words appear in the message as they are recognised, in the language spoken (the service
 * recognises it — nothing is chosen), and nothing is sent until the person sends. The agent then
 * answers in the language of that message (`tracy-site-tools` `replyLanguageRule`).
 *
 * dsh's slot `conversation.input.activity` (between the model chip and Send) holds it: idle, one
 * round button; pressed, the row dsh widens for it (`onActiveChange`) — Cancel, the bars of the
 * voice, the language heard, the time, Done. The socket and every limit are the server's
 * (`apps/tracy-web/src/speech/relay.js`); the words' place in the draft is `voice-draft.mjs`.
 *
 * SHOWN ONLY WHERE IT CAN WORK: the operator's switch `composer-voice-input` (/ops › User Interface),
 * this deployment's speech key (`GET /api/speech`, `available`), and a page the browser lets record —
 * a secure context (https, or localhost): over plain http (a laptop's `http://tracy.test:51710`) a
 * browser offers neither the microphone nor an AudioWorklet (measured 15/10/2026). Without any of
 * them, no microphone — never one that opens onto an error.
 *
 * 🔒 THE PERSON KEEPS THE KEYBOARD (council 15/10/2026). While the voice runs:
 *   - typing, pasting or composing in the chat box stops the dictation where it stands; the words
 *     already in stay, and nothing is written over what the person typed;
 *   - Enter finishes the dictation first — the last phrase confirmed — then sends once. The Send
 *     button is dsh's and is left alone (while the agent runs it is Stop): it sends the words as
 *     they stand, and the dictation then ends because the draft is no longer its own;
 *   - Escape and Cancel take the dictated words back out, leaving the draft as it was;
 *   - leaving the page (hidden tab) finishes it, so a forgotten microphone does not keep listening.
 *
 * OTHER BOXES (David 15/10/2026): the Browser tab's comment popover and thread card draw this same
 * component through `voice-bridge.mjs`, their text area adapted to the slot's props. Such a box marks
 * its root `data-voice-composer` (the chat box is dsh's `conversation.composer.bar`), and its text area
 * is a `<textarea>` where dsh's draft is a contenteditable; the keyboard rules above are the same.
 * One box listens at a time: pressing a microphone finishes the one already listening, its words kept.
 */
import { Check, Mic, X } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { fallback, type StringKey, type Translate } from './strings'
import { draftWriter, spokenText } from './voice-draft.mjs'
import { openSpeechLink, pageSite, speechHttpPath, speechSocketUrl } from './voice-link.mjs'
import { MicrophoneError, openMicrophone, type Microphone } from './voice-capture'
import { claimVoice } from './voice-claim.mjs'
import { pageStorage, readMicPick } from './voice-mic.mjs'

/** What `GET /api/speech` answers. */
export interface SpeechFacts {
  available: boolean
  provider?: string
  actualProvider?: string
  transcriptWaitMs?: number
  capabilities?: { tts?: { prewarm?: boolean } }
  sessionToken?: string
  revision?: string
  sessionSeconds: number
  silenceSeconds: number
  /** The voices a customer may pick, the first the default. */
  voices?: readonly { id: string; name: string }[]
  /**
   * The longest reading `POST /api/speech/say` takes, and the rate its sound comes at; absent from a
   * server that cannot read out loud, where the chat's header offers no voice conversation.
   */
  speak?: { maxChars: number; sampleRate: number; answerMs?: number }
}

let facts: Promise<SpeechFacts | null> | null = null

/** One read of `GET /api/speech` per page, shared by every conversation's chat box; a failed read is asked again. */
export function speechFacts(refresh = false): Promise<SpeechFacts | null> {
  if (refresh) facts = null
  facts ??= fetch(speechHttpPath('/api/speech'), {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
    .then((res) => (res.ok ? (res.json() as Promise<SpeechFacts>) : null))
    .then((body) => (body && typeof body.available === 'boolean' ? body : null))
    .catch(() => null)
    .then((body) => {
      if (body === null) facts = null
      return body
    })
  return facts
}

interface TokenSpan {
  start: number
  end: number
  draftRev: number
}

/** The slot's own props (dsh `conversation.input.activity`, session scope), as far as this reads them. */
export interface VoiceInputProps {
  sessionId?: string
  inputActions?: {
    captureInsertion(): TokenSpan
    insertText(text: string, span: TokenSpan): boolean
    submit(): void
  }
  useInput?: <T>(selector: (state: { draft: string }) => T) => T
  locked?: boolean
  onActiveChange?: (active: boolean) => void
  t?: Translate
  /** The operator's switch, read by the caller (`index.tsx`). */
  shown: boolean
  /** The language hint at the press (`voice-language.mjs` `voiceHint`), '' when there is none. */
  mainLanguage?: () => string
}

type Phase = 'idle' | 'starting' | 'listening' | 'finishing' | 'notice'

interface Run {
  /** Gives up this page's one listening place (`claimVoice`). */
  release: () => void
  /** Another box took the microphone: this one ends without a word about how. */
  handedOver: boolean
  writer: ReturnType<typeof draftWriter>
  link: ReturnType<typeof openSpeechLink> | null
  mic: Microphone | null
  started: number
  /** Send once the last phrase is confirmed (Enter pressed while speaking). */
  sendAfter: boolean
  /** Done was asked: the socket's `end` is awaited. */
  finishing: boolean
}

interface Notice {
  key: StringKey
  params?: Record<string, string | number>
}

const BARS = 28
/** The box a microphone belongs to: dsh's chat box, or another box that draws it (`voice-bridge.mjs`). */
const COMPOSER = '[data-slot="conversation.composer.bar"], [data-voice-composer]'
/** The box's text area: dsh's draft is a contenteditable, a comment box's a `<textarea>`. */
const TEXT_AREA = '[contenteditable="true"], textarea'

/** The end reasons of the voice socket, as the row words them; `stopped` says nothing. */
function noticeFor(reason: string, limits: SpeechFacts): Notice | null {
  switch (reason) {
    case 'stopped':
      return null
    case 'time-limit':
      return { key: 'voice.end.timeLimit', params: { minutes: Math.round(limits.sessionSeconds / 60) } }
    case 'silence':
      return { key: 'voice.end.silence', params: { seconds: limits.silenceSeconds } }
    case 'quota':
      return { key: 'voice.end.quota' }
    case 'elsewhere':
      return { key: 'voice.end.elsewhere' }
    case 'provider-busy':
      return { key: 'voice.end.providerBusy' }
    case 'provider':
    // Tracy could not count today's minutes: not available now, never "used up" (`speech/relay.js`).
    case 'unavailable':
      return { key: 'voice.end.provider' }
    default:
      return { key: 'voice.end.network' }
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The badge's code: the service may name a language by its three letters (`vie`, `cmn`); the badge
 * shows the short form a person knows (`VI`, `ZH`), as the browser's own locale data maps it.
 */
function shortCode(code: string): string {
  try {
    return (Intl.getCanonicalLocales(code)[0] ?? code).split('-')[0].toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** "Vietnamese" for `vi` (or `vie`), in the interface's language; the code itself when unknown. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([interfaceLocale() ?? 'en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export function VoiceInput({
  sessionId,
  inputActions,
  useInput,
  locked = false,
  onActiveChange,
  t,
  shown,
  mainLanguage
}: VoiceInputProps): JSX.Element | null {
  const say = (key: StringKey, params?: Record<string, string | number>) => fallback(t, key, params)
  const draft = useInput?.((state) => state.draft) ?? ''
  const draftNow = useRef(draft)
  draftNow.current = draft
  const [limits, setLimits] = useState<SpeechFacts | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [language, setLanguage] = useState<string | null>(null)
  /** The microphone picked in the Chat/Voice menu was not there: the default one listens. */
  const [micFellBack, setMicFellBack] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [bars, setBars] = useState<number[]>([])
  const run = useRef<Run | null>(null)
  const loudest = useRef(0)
  const root = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let live = true
    void speechFacts().then((answer) => {
      if (live) setLimits(answer)
    })
    return () => {
      live = false
    }
  }, [])

  const usable = shown && limits?.available === true && globalThis.isSecureContext !== false
  const expanded = usable && phase !== 'idle'
  useLayoutEffect(() => {
    onActiveChange?.(expanded)
    return () => onActiveChange?.(false)
  }, [expanded, onActiveChange])

  const showNotice = (next: Notice | null) => {
    setNotice(next)
    setPhase(next ? 'notice' : 'idle')
  }

  /** The socket said it is over. */
  const ended = (r: Run, reason: string, settled: boolean) => {
    if (run.current !== r) return
    run.current = null
    r.release()
    void r.mic?.close()
    // Handed over: the relay may end this session as `elsewhere` once the other box's opens.
    if (r.handedOver) return showNotice(null)
    if (reason === 'stopped') {
      // Enter sends only what the service finished: with the last phrase unconfirmed it would send a
      // request cut short, so the words stay in the box to check (council 18/10/2026).
      if (r.sendAfter && settled) inputActions?.submit()
      // Finished, or the person took the keyboard: nothing to say about the last phrase.
      return showNotice(settled || r.writer.detached ? null : { key: 'voice.end.unsettled' })
    }
    showNotice(limits ? noticeFor(reason, limits) : { key: 'voice.end.network' })
  }

  /** Done: hand the last samples over, ask for the last phrase, and end on the socket's word. */
  const finish = (r: Run, { send = false } = {}) => {
    if (run.current !== r) return
    if (send) r.sendAfter = true
    if (r.finishing) return
    r.finishing = true
    setPhase('finishing')
    void r.mic?.close()
    r.mic = null
    if (r.link) r.link.stop()
    else ended(r, 'stopped', true)
  }

  /** Cancel: drop the session and take the dictated words back out. */
  const cancel = () => {
    const r = run.current
    run.current = null
    if (r) {
      r.release()
      r.link?.close()
      void r.mic?.close()
      r.writer.show('')
      r.writer.detach()
    }
    showNotice(null)
  }

  const start = async () => {
    if (!inputActions || locked || run.current || !limits?.available) return
    const r: Run = {
      release: () => {},
      handedOver: false,
      writer: draftWriter(inputActions, draftNow.current),
      link: null,
      mic: null,
      started: Date.now(),
      sendAfter: false,
      finishing: false
    }
    run.current = r
    r.release = claimVoice(() => {
      if (run.current !== r) return
      r.handedOver = true
      r.writer.detach()
      finish(r)
    })
    setNotice(null)
    setLanguage(null)
    setMicFellBack(false)
    setBars([])
    setElapsed(0)
    setPhase('starting')
    try {
      // The microphone picked in the Chat/Voice menu, the one Voice listens on too (`voice-mic.mjs`).
      r.mic = await openMicrophone(
        (frame) => r.link?.sendAudio(frame),
        (level) => {
          loudest.current = Math.max(loudest.current, level)
        },
        () => finish(r),
        { deviceId: readMicPick(pageStorage()) }
      )
    } catch (error) {
      if (run.current !== r) return
      run.current = null
      r.release()
      const problem = error instanceof MicrophoneError ? error.problem : 'unsupported'
      return showNotice({ key: `voice.error.${problem}` as StringKey })
    }
    if (run.current !== r) {
      await r.mic.close()
      return
    }
    setMicFellBack(r.mic.fellBack)
    // The socket opens once the microphone is granted: a refused permission never starts a session.
    // The chat's main language, read at the press: the relay may tell the service (`relay.js`).
    r.link = openSpeechLink(
      {
        onWords: (committed, partial) => {
          if (run.current !== r) return
          if (!r.writer.show(spokenText(committed, partial))) finish(r)
        },
        onLanguage: (code) => {
          if (run.current === r) setLanguage(code)
        },
        onEnd: (reason, settled) => ended(r, reason, settled)
      },
      { url: speechSocketUrl(globalThis.location, mainLanguage?.() ?? '', false, pageSite()) }
    )
    r.started = Date.now()
    setPhase('listening')
  }

  // The bars and the time, a few times a second — not once per audio block.
  useEffect(() => {
    if (phase !== 'listening') return
    const timer = setInterval(() => {
      const r = run.current
      if (!r) return
      setElapsed((Date.now() - r.started) / 1000)
      const level = loudest.current
      loudest.current = 0
      setBars((now) => [...now.slice(-(BARS - 1)), level])
    }, 90)
    return () => clearInterval(timer)
  }, [phase])

  // The keyboard and the page, while the voice runs (see the file comment).
  useEffect(() => {
    if (phase !== 'starting' && phase !== 'listening' && phase !== 'finishing') return
    const composer = () => root.current?.closest(COMPOSER) ?? null
    const inDraft = (target: EventTarget | null) =>
      target instanceof Element && composer()?.contains(target) === true && target.closest(TEXT_AREA) !== null
    const onKey = (event: KeyboardEvent) => {
      const r = run.current
      if (!r) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel()
        return
      }
      if (!inDraft(event.target) || event.isComposing) return
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        event.stopPropagation()
        finish(r, { send: true })
        return
      }
      const edits =
        event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter'
      if (edits && !event.metaKey && !event.ctrlKey) {
        r.writer.detach()
        finish(r)
      }
    }
    const onTakeOver = (event: Event) => {
      const r = run.current
      if (r && inDraft(event.target)) {
        r.writer.detach()
        finish(r)
      }
    }
    const onHidden = () => {
      const r = run.current
      if (document.hidden && r) finish(r)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('compositionstart', onTakeOver, true)
    document.addEventListener('paste', onTakeOver, true)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('compositionstart', onTakeOver, true)
      document.removeEventListener('paste', onTakeOver, true)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [phase])

  // Another conversation, or the chat box going away: the session ends; the words stay where they are.
  useEffect(
    () => () => {
      const r = run.current
      run.current = null
      if (!r) return
      r.release()
      r.writer.detach()
      r.link?.close()
      void r.mic?.close()
    },
    [sessionId]
  )
  useEffect(() => {
    setPhase('idle')
    setNotice(null)
  }, [sessionId])
  // The operator turned the switch off while the voice ran: it stops, the words stay.
  useEffect(() => {
    if (usable) return
    const r = run.current
    run.current = null
    if (!r) return
    r.release()
    r.writer.detach()
    r.link?.close()
    void r.mic?.close()
    setPhase('idle')
  }, [usable])

  if (!usable) return null

  if (phase === 'idle')
    return (
      <div ref={root} className="tv-voice">
        <button
          type="button"
          className="tv-voice-mic"
          aria-label={say('voice.start')}
          title={say('voice.startHint')}
          disabled={locked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void start()}
        >
          <Mic aria-hidden="true" />
        </button>
      </div>
    )

  const r = run.current
  return (
    <div ref={root} className="tv-voice tv-voice-row" data-voice={phase}>
      {phase === 'notice' ? (
        <>
          <span
            className="tv-voice-note"
            role="status"
            title={notice ? say(notice.key, notice.params) : undefined}
          >
            {notice ? say(notice.key, notice.params) : ''}
          </span>
          <button
            type="button"
            className="tv-voice-round"
            aria-label={say('voice.dismiss')}
            title={say('voice.dismiss')}
            onClick={() => showNotice(null)}
          >
            <X aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tv-voice-round"
            aria-label={say('voice.retry')}
            title={say('voice.retry')}
            disabled={locked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void start()}
          >
            <Mic aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="tv-voice-round"
            aria-label={say('voice.cancel')}
            title={say('voice.cancel')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={cancel}
          >
            <X aria-hidden="true" />
          </button>
          {phase === 'listening' ? (
            <span className="tv-voice-bars" role="img" aria-label={say('voice.listening')}>
              {bars.map((level, i) => (
                <span key={i} style={{ height: `${Math.max(2, Math.round(level * 20))}px` }} />
              ))}
            </span>
          ) : (
            <span className="tv-voice-note" role="status">
              <span className="tv-voice-dot" aria-hidden="true" />
              {say(phase === 'starting' ? 'voice.starting' : 'voice.finishing')}
            </span>
          )}
          {micFellBack && (
            <span className="tv-voice-note tv-voice-mic-note" role="status" title={say('voice.micFallback')}>
              {say('voice.micFallback')}
            </span>
          )}
          {language !== null && (
            <span className="tv-voice-lang" title={say('voice.language', { name: languageName(language) })}>
              {shortCode(language)}
            </span>
          )}
          {phase === 'listening' && <span className="tv-voice-time">{clock(elapsed)}</span>}
          {phase === 'listening' && r && (
            <button
              type="button"
              className="tv-voice-done"
              aria-label={say('voice.done')}
              title={say('voice.done')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => finish(r)}
            >
              <Check aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  )
}
