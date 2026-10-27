/**
 * Chat or voice, per conversation, as in ChatGPT's app (16/10/2026: "each session has 2 options,
 * 1 is voice, 2 is chat"). A voice conversation is held by `voice-mode.mjs`; these are its
 * pieces on screen:
 *
 *   - THE MODE MENU, in the chat's header (dsh's `conversation.session.header.utilities`, beside "…"):
 *     Chat or Voice, with a check on the one shown, the voices Tracy may speak in, and the microphone
 *     dictation and Voice listen on (`voice-mic.mjs`, council 19/10/2026). Its button is an
 *     icon (a site's chat column is narrow): a speech bubble in Chat; in Voice, where the voice stands
 *     — a red dot while it listens or hears, a turning ring while Tracy works, moving bars while Tracy
 *     speaks, a crossed microphone when muted.
 *   - THE VOICE VIEW, the conversation's body in Voice (a dsh `conversation.view` whose tab is never
 *     drawn: the menu is how it is chosen): one orb in the middle that swells with the person's voice
 *     and with Tracy's, what is heard or said under it, and Send now / Say it again while words wait.
 *     The chat itself is not on screen; the words sent are the person's messages there, read back in
 *     Chat. Leaving the view (Chat, another tab, another conversation) ends the voice.
 *   - THE VOICE FOOTER, in the chat box's place while the view is shown (dsh's `conversation.composer`
 *     chain): mute the microphone, and X back to Chat. No typing in Voice (16/10/2026).
 *   - THE AUDIO WAVE beside the dictation microphone, as in ChatGPT's chat box: into Voice from the
 *     chat box, which is also the only way in from a new chat (dsh shows the header once there is a
 *     message).
 *
 *   - THE NOTE THAT INTRODUCES IT (16/10/2026: "a small popup saying use voice with Tracy here…
 *     opens once when creating a site only, closed means closed, reload turns it back on"): over the chat box of a site's
 *     start screen, its arrow on the audio wave. It is shown once per signed-in account and recorded
 *     when it appears, so another browser or device does not introduce it again.
 *
 * SHOWN ONLY WHERE IT CAN WORK, and wherever the microphone is (16/10/2026: it follows the voice
 * switch of /ops › Agents › Voice): the switch `composer-voice-input` on, `GET /api/speech` available
 * and able to read out loud (`speak`), and a page the browser lets record (a secure context). Without
 * any of them, no Voice anywhere — never a choice that opens onto an error.
 */
import {
  AudioLines,
  Check,
  ChevronDown,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  X
} from 'lucide-react'
import type { JSX } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fallback, type StringKey, type Translate } from './strings'
import type { MicPicker } from './voice-mic.mjs'
import type { VoiceMode, VoiceModeState } from './voice-mode.mjs'
import { SEND_AFTER_MS } from './voice-mode.mjs'

/** Where a conversation stands, as the menu button and the view word it. */
type Status = 'starting' | 'listening' | 'hearing' | 'working' | 'speaking' | 'paused'

export function statusOf(state: VoiceModeState): Status | null {
  if (state.phase === 'off') return null
  if (state.phase === 'starting') return 'starting'
  if (state.phase === 'paused') return 'paused'
  if (state.talking !== null) return 'speaking'
  if (state.hearing) return 'hearing'
  if (state.tracy !== 'idle') return 'working'
  return 'listening'
}

/** The most characters of the words heard under the orb; the newest ones (three lines). */
const WORDS_SHOWN = 160

function useVoiceMode(mode: VoiceMode): VoiceModeState {
  return useSyncExternalStore(mode.subscribe, mode.getSnapshot)
}

/** The voice of this conversation, or nothing when another one (or none) is running. */
function useMine(mode: VoiceMode, sessionId: string | undefined): { state: VoiceModeState; mine: boolean } {
  const state = useVoiceMode(mode)
  return { state, mine: sessionId !== undefined && state.sessionId === sessionId && state.phase !== 'off' }
}

function StatusIcon({ status }: { status: Status | null }): JSX.Element {
  switch (status) {
    case null:
      return <AudioLines aria-hidden="true" />
    case 'starting':
    case 'listening':
    case 'hearing':
      return (
        <span className="tv-vm-rec" data-hearing={status === 'hearing' ? '' : undefined} aria-hidden="true" />
      )
    case 'working':
      return <LoaderCircle className="tv-vm-spin" aria-hidden="true" />
    case 'speaking':
      return (
        <span className="tv-vm-wave" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )
    case 'paused':
      return <MicOff aria-hidden="true" />
  }
}

/** What the page does when a person picks a mode (`index.tsx`: the view's tab, the voice). */
export interface ModeActions {
  /** Into Voice, inside the person's press (the speakers and the microphone may only start from it). */
  voice(sessionId: string): void
  /** Back to Chat; the voice ends with the view. */
  chat(sessionId: string): void
}

export interface ModeMenuProps {
  /** The header's session (dsh `conversation.session.header.utilities`, session scope). */
  sessionId?: string
  t?: Translate
  mode: VoiceMode
  /** The voice switch on, the deployment offers it, and the page may record (`index.tsx`). */
  usable: boolean
  /** This conversation shows the voice view. */
  inVoice: boolean
  voices: readonly { id: string; name: string }[]
  actions: ModeActions
  /** Show the note introducing Voice under the button (`VoiceTip` `at: 'header'`). */
  tip?: boolean
  /** The microphones to pick from, and the one picked (`voice-mic.mjs`); absent, no section. */
  micPicker?: MicPicker
}

/** No microphone section: what the menu reads when the page gives no picker. */
const NO_MICS = { choices: [] as readonly { id: string; label: string }[], pick: '' }
const noMics = () => NO_MICS
const noSubscribe = () => () => undefined

export function ModeMenu({
  sessionId,
  t,
  mode,
  usable,
  inVoice,
  voices,
  actions,
  tip = false,
  micPicker
}: ModeMenuProps): JSX.Element | null {
  const say = (key: StringKey, params?: Record<string, string | number>) => fallback(t, key, params)
  const { state, mine } = useMine(mode, sessionId)
  const mics = useSyncExternalStore(micPicker?.subscribe ?? noSubscribe, micPicker?.getSnapshot ?? noMics)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)
  const pill = useRef<HTMLButtonElement | null>(null)
  const pillOf = useCallback(() => pill.current, [])
  const status = inVoice && mine ? statusOf(state) : null

  useEffect(() => {
    if (!open) return
    // The list as it is now: a microphone plugged in, or named since the microphone was allowed.
    void micPicker?.refresh()
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, micPicker])

  if (!usable || sessionId === undefined) return null
  const now = inVoice ? say('voiceMode.mode.voice') : say('voiceMode.mode.chat')
  // The pick not listed now (unplugged, or not named before the microphone was allowed): the browser
  // falls back to its default, so the default carries the check.
  const micChecked = mics.choices.some((mic) => mic.id === mics.pick) ? mics.pick : ''

  return (
    <div
      ref={root}
      className="tv-vm"
      data-conversation-mode={inVoice ? 'voice' : 'chat'}
      data-voice-mode={status ?? 'off'}
    >
      <button
        ref={pill}
        type="button"
        className="tv-vm-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${say('voiceMode.mode.menu')}: ${status ? say(`voiceMode.state.${status}`) : now}`}
        title={status ? `${now} · ${say(`voiceMode.state.${status}`)}` : now}
        onClick={() => {
          // The person found the button the note points at: the note is done.
          closeVoiceTip()
          setOpen((was) => !was)
        }}
      >
        {inVoice ? <StatusIcon status={status} /> : <MessageSquare aria-hidden="true" />}
        <ChevronDown className="tv-vm-chevron" aria-hidden="true" />
      </button>
      {tip && !inVoice && (
        <VoiceTip
          t={t}
          shown={!open}
          at="header"
          anchor={pillOf}
          onGo={() => {
            if (sessionId !== undefined) actions.voice(sessionId)
          }}
        />
      )}
      {open && (
        <div className="tv-vm-menu" role="menu" aria-label={say('voiceMode.mode.menu')}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!inVoice}
            className="tv-vm-item tv-vm-mode"
            data-conversation-mode-pick="chat"
            onClick={() => {
              if (inVoice) actions.chat(sessionId)
              setOpen(false)
            }}
          >
            <MessageSquare aria-hidden="true" />
            <span className="tv-vm-mode-text">
              <span className="tv-vm-mode-name">{say('voiceMode.mode.chat')}</span>
              <span className="tv-vm-mode-hint">{say('voiceMode.mode.chatHint')}</span>
            </span>
            <Check className="tv-vm-check" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={inVoice}
            className="tv-vm-item tv-vm-mode"
            data-conversation-mode-pick="voice"
            onClick={() => {
              // In the press: the speakers and the microphone may only start from it.
              closeVoiceTip()
              if (!inVoice) actions.voice(sessionId)
              setOpen(false)
            }}
          >
            <AudioLines aria-hidden="true" />
            <span className="tv-vm-mode-text">
              <span className="tv-vm-mode-name">{say('voiceMode.mode.voice')}</span>
              <span className="tv-vm-mode-hint">{say('voiceMode.mode.voiceHint')}</span>
            </span>
            <Check className="tv-vm-check" aria-hidden="true" />
          </button>
          {voices.length > 0 && (
            <>
              <div className="tv-vm-sep" role="separator" />
              <div className="tv-vm-label">{say('voiceMode.voice')}</div>
              {voices.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={state.voice === voice.id}
                  className="tv-vm-item"
                  data-voice-id={voice.id}
                  onClick={() => mode.setVoice(voice.id)}
                >
                  <Check className="tv-vm-check tv-vm-check-start" aria-hidden="true" />
                  {voice.name}
                </button>
              ))}
            </>
          )}
          {micPicker && (
            <>
              <div className="tv-vm-sep" role="separator" />
              <div className="tv-vm-label">{say('voiceMode.mic')}</div>
              {[{ id: '', label: say('voiceMode.micDefault') }, ...mics.choices].map((mic) => (
                <button
                  key={mic.id === '' ? 'default' : mic.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={micChecked === mic.id}
                  className="tv-vm-item"
                  data-voice-mic={mic.id === '' ? 'default' : ''}
                  // Picked, Voice listening now restarts its capture on it (`index.tsx`, `switchMic`).
                  onClick={() => micPicker.choose(mic.id)}
                >
                  <Check className="tv-vm-check tv-vm-check-start" aria-hidden="true" />
                  <span className="tv-vm-mic-name">{mic.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The orb follows how loud it is now (the person, or Tracy), smoothed, without a render a frame. */
function useOrbLevel(mode: VoiceMode, running: boolean) {
  const orb = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const el = orb.current
    if (!el) return
    if (!running) {
      el.style.setProperty('--tv-orb-level', '0')
      return
    }
    let level = 0
    let frame = 0
    const tick = () => {
      level += (mode.level() - level) * 0.35
      el.style.setProperty('--tv-orb-level', level.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode, running])
  return orb
}

export interface VoiceModeViewProps {
  /** dsh's `conversation.view` props: the session the view is drawn for. */
  sessionId?: string
  t?: Translate
  mode: VoiceMode
  actions: ModeActions
  /** Tells the page this session shows the view, and when it no longer does (the footer, the menu). */
  shown(sessionId: string, on: boolean): void
}

/** The conversation's body in Voice. */
export function VoiceModeView({ sessionId, t, mode, actions, shown }: VoiceModeViewProps): JSX.Element {
  const say = (key: StringKey, params?: Record<string, string | number>) => fallback(t, key, params)
  const { state, mine } = useMine(mode, sessionId)
  const status = mine ? statusOf(state) : null
  const orb = useOrbLevel(mode, status === 'hearing' || status === 'speaking' || status === 'listening')

  // On screen: the footer replaces the chat box, the menu checks Voice. Off screen: the voice ends —
  // Voice is a place, not a background task.
  useEffect(() => {
    if (sessionId === undefined) return
    shown(sessionId, true)
    return () => {
      shown(sessionId, false)
      if (mode.getSnapshot().sessionId === sessionId) mode.end()
    }
  }, [sessionId, mode, shown])

  const notice = mine && state.notice ? say(state.notice.key as StringKey, state.notice.params) : null
  const words = state.words.length > WORDS_SHOWN ? `…${state.words.slice(-WORDS_SHOWN)}` : state.words
  const line: string =
    status === null
      ? say('voiceMode.start')
      : state.words !== ''
        ? words
        : status === 'paused'
          ? (notice ?? say('voiceMode.state.paused'))
          : status === 'starting'
            ? say('voiceMode.bar.starting')
            : status === 'speaking'
              ? state.saying || say('voiceMode.bar.speaking')
              : status === 'working'
                ? say(
                    state.tracy !== 'asking'
                      ? 'voiceMode.bar.working'
                      : state.plan
                        ? 'voiceMode.bar.plan'
                        : 'voiceMode.bar.asking'
                  )
                : say('voiceMode.bar.listening')
  // A press on the orb does what the moment asks: start, talk again, or stop Tracy talking.
  const press =
    sessionId === undefined
      ? undefined
      : status === null
        ? () => actions.voice(sessionId)
        : status === 'paused'
          ? () => mode.resume()
          : status === 'speaking'
            ? () => mode.stopTalking()
            : undefined
  const pressLabel =
    status === null
      ? say('voiceMode.start')
      : status === 'paused'
        ? say('voiceMode.resume')
        : status === 'speaking'
          ? say('voiceMode.stopSpeaking')
          : say(`voiceMode.state.${status}`)

  return (
    <div className="tv-vo" data-voice-mode={status ?? 'off'} data-tracy={state.tracy}>
      <button
        type="button"
        className="tv-vo-orb"
        aria-label={pressLabel}
        title={pressLabel}
        disabled={press === undefined}
        data-voice-mode-action={
          status === null
            ? 'start'
            : status === 'paused'
              ? 'resume'
              : status === 'speaking'
                ? 'stop'
                : undefined
        }
        onClick={press}
      >
        <span ref={orb} className="tv-vo-core" aria-hidden="true" />
      </button>
      <div
        className="tv-vo-line"
        role="status"
        dir="auto"
        data-voice-words={state.words !== '' ? '' : undefined}
        data-voice-saying={status === 'speaking' && state.saying !== '' ? '' : undefined}
      >
        {line}
      </div>
      {notice && status !== 'paused' && (
        <div className="tv-vo-note" role="alert">
          {notice}
        </div>
      )}
      {mine && state.heldWords !== '' && (
        <div data-voice-held-words="">
          <div className="tv-vo-note" dir="auto" role="status">
            {state.heldWords}
          </div>
          <div className="tv-vo-actions">
            <button type="button" className="tv-vo-button" onClick={() => mode.dropHeldWords()}>
              <RotateCcw aria-hidden="true" />
              {say('voiceMode.dropWords')}
            </button>
            <button
              type="button"
              className="tv-vo-button tv-vo-button-primary"
              disabled={state.hearing || state.words !== ''}
              onClick={() => mode.sendHeldWords()}
            >
              {say('voiceMode.sendNow')}
            </button>
          </div>
        </div>
      )}
      {mine && state.words !== '' && (
        <div className="tv-vo-actions">
          <button
            type="button"
            className="tv-vo-button"
            data-voice-mode-action="drop"
            onClick={() => mode.dropWords()}
          >
            <RotateCcw aria-hidden="true" />
            {say('voiceMode.dropWords')}
          </button>
          <button
            type="button"
            className="tv-vo-button tv-vo-button-primary"
            data-voice-mode-action="send"
            onClick={() => mode.sendNow()}
          >
            {say('voiceMode.sendNow')}
          </button>
        </div>
      )}
      {mine && state.sendAt !== null && (
        <span
          key={state.sendAt}
          className="tv-vm-countdown tv-vo-countdown"
          role="img"
          aria-label={say('voiceMode.bar.sending')}
          style={{ animationDuration: `${SEND_AFTER_MS}ms` }}
        />
      )}
    </div>
  )
}

export interface VoiceModeFooterProps {
  sessionId?: string
  t?: Translate
  mode: VoiceMode
  actions: ModeActions
}

/** In the chat box's place while the voice view is shown: mute, and back to Chat. */
export function VoiceModeFooter({ sessionId, t, mode, actions }: VoiceModeFooterProps): JSX.Element | null {
  const say = (key: StringKey, params?: Record<string, string | number>) => fallback(t, key, params)
  const { state, mine } = useMine(mode, sessionId)
  if (sessionId === undefined) return null
  const muted = mine && state.phase === 'paused'
  return (
    <div className="tv-vo-footer" data-voice-mode-footer="">
      <button
        type="button"
        className="tv-vo-round"
        aria-pressed={muted}
        aria-label={muted ? say('voiceMode.unmute') : say('voiceMode.mute')}
        title={muted ? say('voiceMode.unmute') : say('voiceMode.mute')}
        disabled={!mine || state.phase === 'starting'}
        data-voice-mode-action="mute"
        onClick={() => (muted ? mode.resume() : mode.pause())}
      >
        {/* The state is the icon (17/10/2026): a microphone while it listens, crossed out when
            muted — never the same icon drawn bolder. */}
        {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>
      {mine && state.tracy !== 'idle' && (
        // Voice's footer takes the chat box's place, and with it dsh's Stop: the work stops from here.
        <button
          type="button"
          className="tv-vo-round"
          aria-label={say('voiceMode.stopWork')}
          title={say('voiceMode.stopWork')}
          data-voice-mode-action="stop-work"
          onClick={() => mode.stopWork()}
        >
          <Square aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="tv-vo-round tv-vo-round-close"
        aria-label={say('voiceMode.end')}
        title={say('voiceMode.end')}
        data-voice-mode-action="end"
        onClick={() => actions.chat(sessionId)}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  )
}

/** Beside the dictation microphone: into Voice for this chat. */
export function VoiceModeStart({
  sessionId,
  t,
  usable,
  locked = false,
  actions
}: {
  sessionId?: string
  t?: Translate
  usable: boolean
  locked?: boolean
  actions: ModeActions
}): JSX.Element | null {
  if (!usable || sessionId === undefined) return null
  return (
    <button
      type="button"
      className="tv-voice-mic"
      aria-label={fallback(t, 'voiceMode.mode.voice')}
      disabled={locked}
      data-voice-mode-action="start"
      onMouseDown={(event) => event.preventDefault()}
      // In the press: the speakers and the microphone may only start from it.
      onClick={() => {
        closeVoiceTip()
        actions.voice(sessionId)
      }}
    >
      <AudioLines aria-hidden="true" />
    </button>
  )
}

/**
 * The account decides whether this note has been seen. Start hidden until the read succeeds;
 * old browser state is migrated once, and never written again. Signing out leaves the document,
 * so this page's single-owner state is discarded before a different account signs in.
 */
const TIP_SEEN_KEY = 'tracy.voice-tip.seen'
function readTipSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(TIP_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
function removeTipSeen(): void {
  try {
    globalThis.localStorage?.removeItem(TIP_SEEN_KEY)
  } catch {
    // The server remains authoritative when browser storage cannot be cleared.
  }
}
async function recordTipSeen(): Promise<boolean> {
  try {
    const res = await fetch('/api/seen-hints', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hint: 'voice-tip' })
    })
    return res.ok
  } catch {
    // Recording is best effort: Voice and the note's controls keep working.
    return false
  }
}
let tipClosed = false
let tipReady = false
let tipRead: Promise<void> | null = null
function loadTipSeen(): Promise<void> {
  if (tipRead) return tipRead
  tipRead = (async () => {
    try {
      const res = await fetch('/api/seen-hints', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!res.ok) {
        tipClosed = true
        return
      }
      const body: unknown = await res.json()
      const hints = (body as { hints?: unknown } | null)?.hints
      if (!Array.isArray(hints) || !hints.every((hint) => typeof hint === 'string')) {
        tipClosed = true
        return
      }
      const seen = hints.includes('voice-tip')
      const legacy = readTipSeen()
      tipClosed = tipClosed || seen || legacy
      if (legacy && (seen || (await recordTipSeen()))) removeTipSeen()
    } catch {
      // A failed account read never introduces a hint that may already have been seen.
      tipClosed = true
    } finally {
      tipReady = true
      notifyTip()
    }
  })()
  return tipRead
}
/** The note on screen, if any: only it renders until it is closed. */
let tipOwner: symbol | null = null
/**
 * The place of a note that just left the screen, for TIP_REMOUNT_MS: dsh may remount a slot while the
 * page settles, and a note of the same place mounting again keeps it; a note of the other place does not.
 */
let tipLeftAt: 'wave' | 'header' | null = null
let tipLeftTimer: ReturnType<typeof setTimeout> | undefined
const TIP_REMOUNT_MS = 400
const tipListeners = new Set<() => void>()
const notifyTip = () => {
  for (const fn of Array.from(tipListeners)) fn()
}
export function closeVoiceTip(): void {
  if (tipClosed) return
  tipClosed = true
  tipOwner = null
  tipLeftAt = null
  clearTimeout(tipLeftTimer)
  notifyTip()
}
const subscribeTip = (fn: () => void) => {
  tipListeners.add(fn)
  return () => {
    tipListeners.delete(fn)
  }
}
const WAVE = '[data-slot="conversation.composer.bar"] [data-voice-mode-action="start"]'
/** Frames the note's arrow is placed again after it shows, while the page settles (about 3 s). */
const SETTLE_FRAMES = 180
/** The audio wave in the chat box: what the note over the chat box points at. */
const waveOf = (): Element | null => document.querySelector(WAVE)

/**
 * The note that introduces Voice. Two places, one at a time: over the chat box of a new chat, its
 * arrow on the audio wave (`at: 'wave'`, dsh draws no header there yet); under the header's Chat/Voice
 * button once the chat has one (`at: 'header'`, 17/10/2026: "The tip introduces Voice here").
 * Pressed, it goes into Voice; once it has been on screen it is recorded on the signed-in account.
 */
export function VoiceTip({
  t,
  shown,
  at = 'wave',
  anchor = waveOf,
  onGo
}: {
  t?: Translate
  shown: boolean
  at?: 'wave' | 'header'
  /** The element the arrow points at. */
  anchor?: () => Element | null
  /** What pressing the note does; by default it presses the wave its arrow points at. */
  onGo?: () => void
}): JSX.Element | null {
  const say = (key: StringKey) => fallback(t, key)
  const [me] = useState(() => Symbol('voice-tip'))
  // Closed for this note once the note was closed, or while another note holds the screen.
  const closed = useSyncExternalStore(
    subscribeTip,
    () =>
      !tipReady ||
      tipClosed ||
      (tipOwner !== null && tipOwner !== me) ||
      (tipLeftAt !== null && tipLeftAt !== at)
  )
  useEffect(() => {
    if (shown) void loadTipSeen()
  }, [shown])
  useLayoutEffect(() => {
    if (!shown || closed) return
    if (tipOwner === null) {
      tipOwner = me
      tipLeftAt = null
      clearTimeout(tipLeftTimer)
      void recordTipSeen()
      notifyTip()
    }
    // Leaving the screen (the chat moved on, the menu opened, voice started) closes it for good,
    // unless a note of the same place mounts again at once.
    return () => {
      if (tipOwner !== me) return
      tipOwner = null
      tipLeftAt = at
      clearTimeout(tipLeftTimer)
      tipLeftTimer = setTimeout(() => {
        if (tipOwner === null) closeVoiceTip()
      }, TIP_REMOUNT_MS)
      notifyTip()
    }
  }, [shown, closed, me, at])
  const box = useRef<HTMLDivElement | null>(null)
  const [arrow, setArrow] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!shown || closed) return
    const place = () => {
      const el = box.current
      const target = anchor()
      if (!el || !target) return setArrow(null)
      const a = el.getBoundingClientRect()
      const b = target.getBoundingClientRect()
      const x = Math.round(b.left + b.width / 2 - a.left)
      setArrow(x >= 12 && x <= a.width - 12 ? x : null)
    }
    // The chat box moves after the note first paints (dsh's splash, the column settling; on the stand
    // 16/10/2026 a note placed once pointed 150px left of the wave): placed again whenever the note, the
    // chat box or what it points at changes size, and every frame of the page's first seconds.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    const watched = new Set<Element>()
    const watch = () => {
      const target = anchor()
      const bar = target?.closest('[data-slot="conversation.composer.bar"]')
      for (const el of [document.body, box.current, target, bar]) {
        if (el && !watched.has(el)) {
          watched.add(el)
          observer?.observe(el)
        }
      }
    }
    let frames = SETTLE_FRAMES
    let raf = 0
    const settle = () => {
      place()
      watch()
      frames -= 1
      if (frames > 0) raf = requestAnimationFrame(settle)
    }
    settle()
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [shown, closed, anchor])
  if (!shown || closed) return null
  return (
    <div className={at === 'header' ? 'tv-vm-tip-pop' : 'tv-vm-tip-row'}>
      <div ref={box} className="tv-vm-tip" role="note" data-voice-tip={at}>
        {/* Pressed, the note goes into Voice in the person's press (the speakers and the microphone
            may only start from one): by the wave its arrow points at, or the header's own action. */}
        <button
          type="button"
          className="tv-vm-tip-go"
          data-voice-tip-start=""
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const wave = onGo ? null : document.querySelector<HTMLButtonElement>(WAVE)
            closeVoiceTip()
            if (onGo) onGo()
            else wave?.click()
          }}
        >
          <AudioLines className="tv-vm-tip-icon" aria-hidden="true" />
          <span className="tv-vm-tip-text">
            <span className="tv-vm-tip-title">{say('voiceMode.tip.title')}</span>
            <span className="tv-vm-tip-body">{say('voiceMode.tip.body')}</span>
          </span>
        </button>
        <button
          type="button"
          className="tv-vm-tip-close"
          aria-label={say('voice.dismiss')}
          title={say('voice.dismiss')}
          data-voice-tip-close=""
          onClick={closeVoiceTip}
        >
          <X aria-hidden="true" />
        </button>
        {arrow !== null && (
          <span className="tv-vm-tip-arrow" style={{ left: `${arrow}px` }} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
