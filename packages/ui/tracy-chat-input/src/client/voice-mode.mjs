/**
 * A VOICE CONVERSATION with Tracy, as in ChatGPT's voice mode: the person talks, the words are sent
 * once they stop, Tracy says in a few words what it is doing while it works, and reads the start of
 * its reply out loud. Pressed on from the Voice menu in the chat's header (`VoiceMode.tsx`); the words
 * go into the chat as the person's message, the reply stays in the chat as written. One conversation
 * on the page at a time, for the conversation on screen. It follows the voice switch the microphone
 * follows (`composer-voice-input`, /ops › Agents › Voice); while it runs the chat box takes no typing
 * (`voice-mode-lock.ts`).
 *
 * THE EAR. The microphone stays open while the conversation is on, but nothing leaves the page until
 * speech is heard on it ({@link SPEECH_RMS} for {@link SPEECH_FRAMES} frames): only then is a voice
 * session opened (`voice-link.mjs`, the dictation relay), and the second before it — kept here — is
 * sent first, so the first word is not lost. A session that hears no word goes again; words keep it
 * open, phrase after phrase, until {@link QUIET_MS} without a new one. So the person talks whenever
 * they like, Tracy working or not, and the service's minutes are spent on speech, not on silence.
 *
 * SENT LIKE A TYPED MESSAGE (16/10/2026: "handle it as if the user keeps chatting"). A
 * phrase the service confirmed and {@link SEND_AFTER_MS} with no new word after it is sent as the
 * person's message through dsh's own session verb (`conversation.sendSession`); the draft is never
 * touched. Before it goes, the row shows it with Send now and Say it again.
 *
 * TAKING TURNS AS A PERSON WOULD (16/10/2026: "like the behaviour of a real consultant
 * person"; the words, `voice-turn-taking.mjs`):
 * - a phrase that stops on "and…", "và…" waits {@link UNFINISHED_SEND_MS}: the person is thinking;
 *   the service's own silence (`vad_silence_threshold_secs`, `speech/relay.js`) plus {@link SEND_AFTER_MS}
 *   ends any other one (council 17/10/2026: one wait, not two stacked ones);
 * - "um" alone is never sent; "mm-hmm", "ừ", "okay" over Tracy, or when Tracy waits on no answer, is
 *   the person listening: Tracy goes on, and nothing is sent — nor before a request ("dạ vâng, đổi…");
 *   to what Tracy just asked, "okay" is the answer;
 * - Tracy never starts a line, and never sends a phrase, while the person is speaking
 *   ({@link SPEAKING_MS}, {@link SPEAKING_HOLD_MS});
 * - one "got it" for what was just said, before any line of the work;
 * - said while Tracy works, the words are steered into the work (`'steer'`), as a person takes in a
 *   correction at once (dsh queues them when the turn can no longer take them);
 * - a question card open in the conversation is answered by what the person says next, through the
 *   card's own verb (`voice-answer.mjs`): it was asked out loud with its choices; Tracy's own
 *   confirmation card (`confirm-…`) takes a choice or a clear yes or no ("đồng ý", "ja", "不"), and
 *   any other words ask it again, then ask for a yes or a no — never sent as its answer (council
 *   20/10/2026, D5.1); a cancel word to it ("huỷ", "cancel", "取消") keeps things as they are, and
 *   never stops the turn; a yes or a no to it goes at once, never waits as a sentence not over ("是的");
 * - a long stretch of work with nothing said ({@link STILL_MS}): Tracy says it is still on it;
 * - "dừng lại", "khoan đã", "stop" said alone while Tracy works stop the work itself, as dsh's Stop
 *   does (`isStopCommand`); said over Tracy's reply they only stop its talking; never a message.
 *   "Khoan đã, để màu đỏ" is a correction: steered into the work;
 * - a question Tracy asked and the person left unanswered is asked once more after
 *   {@link REPROMPT_MS} of quiet (council 17/10/2026); silence is never taken as a yes;
 * - the connection to the speech service dropping once goes on listening; twice within
 *   {@link NETWORK_RETRY_MS} pauses (council 17/10/2026: one quiet retry for a shaky Wi-Fi);
 * - Tracy's own voice coming back is looked for only in speech that began while Tracy talked or
 *   just after ({@link ECHO_TAIL_MS}): "Xanh lá" said after Tracy read "Đỏ, Xanh lá hoặc Vàng" is the
 *   person choosing (council 17/10/2026).
 *
 * NOT SILENT WHILE TRACY WORKS (16/10/2026). Every turn of the conversation that starts while
 * the voice is on is followed (`voice-mode-turn.mjs`, typed messages too): what Tracy wrote while
 * working, a plain line for what it does ("Changing the words."), and the question it waits on are
 * said — one line at a time, {@link PROGRESS_GAP_MS} apart, at most {@link PROGRESS_MAX} a turn,
 * never a tool's name; then its reply. Every line comes from the conversation: nothing is made up.
 *
 * THE PERSON MAY TALK OVER TRACY (16/10/2026: "when I keep talking the agent breaks until
 * I finish, then the agent answers"). The ear stays open while Tracy talks. Speech louder than Tracy's
 * own voice coming back ({@link TALK_OVER_RMS}, for {@link TALK_OVER_FRAMES} frames; the browser's echo
 * cancelling takes most of it) opens a session and turns Tracy down at once; the first words that
 * are not Tracy's own line, nor the person only listening, stop it, and the person is heard to the
 * end of the phrase, which goes like any other — Tracy answers that. Nothing but its own words for {@link DUCK_MS}: Tracy is turned up
 * again. Tracy's words coming back are never taken for the person's: a phrase that is mostly a line
 * just said is dropped (`isEcho`), and a run of three words or more of it at a phrase's start is
 * cut off (`withoutEcho`).
 *
 * Paused (not ended) when the page is hidden, after {@link IDLE_MS} with nothing heard and nothing
 * going on, or when the service ends the session for a reason the person must know (time used up,
 * another tab). Ended by End, by another conversation on screen, or by the operator's switch — and by
 * voice (council 19/10/2026): a whole finished phrase asking to leave Voice ("tắt Voice",
 * "turn off voice mode") or saying goodbye ("tạm biệt", "bye"; not while a question card waits, where it may be
 * the answer) stops the microphone at once, says one short line and goes back to the chat; the work
 * goes on, and a waiting card stays as it is (`voice-turn-taking.mjs` `isVoiceOff`, `isGoodbye`).
 *
 * A PLAN APPROVED BY VOICE (council 19/10/2026, A6), only behind the operator's switch
 * `voice-plan-approval` (off by default; `planApproval`) AND in an interface locale whose phrases a
 * native speaker verified (council 20/10/2026, D4; `PLAN_VOICE_LOCALES`, empty until one is: only
 * those locales' phrases are read). Off — or any condition below not met — a plan
 * waiting on review sends the person to the chat, where its card is, as before (`reviewPlan`). On, with
 * exactly one plan waiting in the turn and no question card beside it (the window's `planIds`, and
 * dsh's own pending `plan-review` for that very call, `voice-answer.mjs` `pendingPlan`): Tracy reads
 * the plan's title and a short summary of its scope, then how to answer (`voice-plan.mjs`). Only after
 * that reading was heard to its end does a WHOLE finished phrase approving it ("duyệt kế hoạch này",
 * "approve this plan"; `isPlanApproval`) answer the card with its approve option — bound to the call
 * and a fingerprint of the text read: a plan that changed is read again, never approved. Not "ừ", "ok"
 * or "yes"; never words held, pressed or not finished by the service; never a phrase that began over
 * Tracy's voice or just after it (its own reading says the phrase). "Sửa kế hoạch …" / "change the plan
 * …" (`planChange`) answers Keep planning with the person's words as their feedback — said with
 * nothing to change, Tracy asks what to change first, and the next phrase is the change; anything else
 * goes to the chat. Approving a plan answers that plan only: a later change that must be confirmed
 * still asks on its own card (`pendingPlan`).
 *
 * HOW LONG EACH TURN TOOK (council 19/10/2026): every phrase sent is traced on the page's own clock —
 * end of speech, phrase confirmed, message sent, "got it" heard, reply heard — and the spans go to
 * `/api/speech/trace` once the turn is done with (`voice-trace.mjs`); /ops › Agents › Voice reads them.
 *
 * Kept free of React: `VoiceMode.tsx` draws it, `test/voice-mode.test.mjs` drives it with stand-ins.
 */
import { askedLine, choicesOf, exactChoice, isConfirm, spokenAnswer, takesYesOrNo } from './voice-answer.mjs'
import { followFrom, startedIn, turnsOf } from './voice-mode-turn.mjs'
import { planHash, planSpoken } from './voice-plan.mjs'
import { frameRms, SPEECH_RMS } from './voice-pcm-out.mjs'
import {
  closingQuestion,
  endsLine,
  firstSentence,
  isEcho,
  spokenReply,
  withoutEcho
} from './voice-speak-text.mjs'
import { spokenText } from './voice-draft.mjs'
import { traceId, traceRecord } from './voice-trace.mjs'
import {
  confirmReply,
  isBackchannel,
  isFillerOnly,
  isGoodbye,
  isPlanApproval,
  isStopCommand,
  isVoiceOff,
  PLAN_VOICE_LOCALES,
  planChange,
  soundsUnfinished,
  withoutSoundTags,
  stopsTracy
} from './voice-turn-taking.mjs'

export { SPEECH_RMS }
/** Frames (100 ms each) above `SPEECH_RMS` in a row that open a voice session. */
export const SPEECH_FRAMES = 2
/** Frames kept before speech is heard, and sent first: one second. */
export const PREROLL_FRAMES = 10
/**
 * After a confirmed phrase, how long without a new word before it is sent. The service confirms a
 * phrase after its own silence, so this only lets a word that was on its way arrive (council
 * 17/10/2026; LiveKit waits 0.5 s, Vapi 0.4 s). Measured on the stand before, 1.6 s here on top of the
 * service's 1.2 s made 3.5–4.2 s from the end of a request to Tracy's first sound.
 */
export const SEND_AFTER_MS = 300
/** A phrase that stops where the sentence goes on ("…và", "…and"): the person is thinking; it waits this long. */
export const UNFINISHED_SEND_MS = 2000
/** Speech on the microphone this recently: the person is talking, and Tracy does not start a line. */
export const SPEAKING_MS = 800
/**
 * How much longer a phrase due to go waits while the person is still speaking and the service has
 * no word of it yet (measured on the stand 16/10/2026: the next phrase's first word came 2.5 s
 * after the person began it).
 */
export const SPEAKING_HOLD_MS = 4000
/** Tracy still working and nothing said for this long: it says it is still on it. */
export const STILL_MS = 15_000
/** A session that heard no word at all in this long is let go (a cough, a door). */
export const NO_WORDS_MS = 6000
/** A session that heard words is kept this long after the last one, for the next phrase. */
export const QUIET_MS = 12_000
/**
 * Words the service shows and never confirms go as heard once the person has been quiet this long
 * after them (measured on the stand 17/10/2026: a phrase shown and never confirmed was held 30 s, until
 * the session closed for silence; the service confirms a finished phrase within about 1.5 s).
 */
export const STUCK_WORDS_MS = 3000
/** The least time between two lines said while Tracy works. */
export const PROGRESS_GAP_MS = 6000
/**
 * The most lines said while one turn works (council 17/10/2026: eight a gap apart kept Tracy talking
 * through most of the work, so the person hesitated to speak up).
 */
export const PROGRESS_MAX = 3
/** A plan the window shows presented for review: dsh is asked this often, this many times, whether it waits. */
export const PLAN_RETRY_MS = 300
export const PLAN_TRIES = 20
/** A question left unanswered this long after Tracy finished asking it is asked once more. */
export const REPROMPT_MS = 12_000
/** A second dropped connection to the speech service within this long pauses the conversation. */
export const NETWORK_RETRY_MS = 30_000
/** Speech that began this soon after Tracy stopped talking may still be its voice in the room. */
export const ECHO_TAIL_MS = 500
/**
 * THE ROOM'S OWN SOUND. A fan, air conditioning or traffic louder than `SPEECH_RMS` would open a
 * session on every frame and hold every phrase as "still speaking": speech counts only when it is
 * {@link NOISE_MARGIN} times the room's level — the quietest tenth of the last {@link NOISE_WINDOW}
 * frames heard while Tracy was not talking — and never below the fixed thresholds. Trusted after
 * {@link NOISE_SETTLE} frames, so a person who speaks the moment they press is heard.
 */
export const NOISE_WINDOW = 50
export const NOISE_SETTLE = 10
export const NOISE_MARGIN = 2.5
/**
 * The highest the room can raise the threshold: a request at a normal distance reads 3000–6000 RMS
 * (measured 16/10/2026 on the stand), so a person who talks on with few pauses — whose quietest tenth
 * is their own voice — is still heard.
 */
export const NOISE_CEILING = 2500
/**
 * Speech over Tracy's voice: louder than its echo, for longer (three 100 ms frames). Measured
 * 16/10/2026 on the stand, a person's request at a normal distance reads 3000–6000 RMS; Chrome's echo
 * cancelling leaves Tracy's own voice well under that.
 */
export const TALK_OVER_RMS = 1200
export const TALK_OVER_FRAMES = 3
/** Turned down for speech over it, Tracy waits this long for the person's words before it comes back up. */
export const DUCK_MS = 2000
/**
 * The most of a reply read out: about twenty seconds. Measured on the stand 16/10/2026, a reply of
 * 470 characters took half a minute to hear; the rest is in the chat, and the voice says so.
 */
export const REPLY_CHARS = 320
/** Words heard this soon after a line played are checked against it (`isEcho`). */
export const ECHO_MS = 4000
/** Nothing heard, nothing running, nothing said for this long: the conversation pauses. */
export const IDLE_MS = 120_000

/**
 * @typedef {'off' | 'starting' | 'on' | 'paused'} Phase
 * @typedef {'idle' | 'working' | 'asking'} Tracy
 * @typedef {{ key: string, params?: Record<string, string | number> }} Notice
 * @typedef {{
 *   sessionId: string | null,
 *   phase: Phase,
 *   hearing: boolean,
 *   words: string,
 *   heldWords: string,
 *   sendAt: number | null,
 *   tracy: Tracy,
 *   talking: null | 'progress' | 'reply',
 *   saying: string,
 *   notice: Notice | null,
 *   voice: string,
 *   plan: boolean
 * }} VoiceModeState
 *   `hearing`: a voice session is open (the person is speaking); `words`: what it heard of the phrase
 *   not sent yet; `sendAt`: when it goes, while it waits; `talking`: what kind of line is being said
 *   now, `saying` its words (the view shows them, as captions); `plan`: a plan was read out for review
 *   and waits on the person's spoken approval or change (the view says how to answer).
 * @typedef {{ close(): Promise<void>, fellBack?: boolean }} Microphone
 *   `fellBack`: the microphone picked in the menu was not there; the browser's default was opened.
 * @typedef {{ sendAudio(frame: ArrayBuffer): void, stop(): void, close(): void }} Link
 * @typedef {{
 *   play(sound: ReadableStream<Uint8Array>, sampleRate: number, onStart?: (at: number) => void): Promise<void>,
 *   stop(): void,
 *   duck?(on: boolean): void,
 *   level(): number,
 *   close(): Promise<void>
 * }} Player
 * @typedef {{ getSnapshot(): { entries?: readonly unknown[], change?: any }, subscribe(listener: () => void): () => void }} Events
 * @typedef {{
 *   openMic(onFrame: (frame: ArrayBuffer) => void, onLevel: (level: number) => void, onLost: () => void): Promise<Microphone>,
 *   openLink(handlers: { onReady?(facts?: { sessionToken?: string, provider?: string, fallbackUsed?: boolean, revision?: string, voices?: {id: string, name: string}[], transcriptWaitMs?: number, speak?: {maxChars: number, sampleRate: number, answerMs: number} }): void, onWords(committed: readonly string[], partial: string): void, onLanguage?(code: string): void, onEnd(reason: string, settled: boolean): void }, options: { url: string }): Link,
 *   socketUrl(sessionId: string): string,
 *   send(sessionId: string, text: string, mode: 'queue' | 'steer'): Promise<string>,
 *   cancel?(sessionId: string): Promise<boolean>,
 *   warm?: boolean | (() => boolean),
 *   onRestartRequired?(): void,
 *   question?(sessionId: string): { questions: readonly import('./voice-answer.mjs').AskedItem[], answer(answer: import('./voice-answer.mjs').SpokenAnswer): Promise<void> } | null,
 *   planReview?(sessionId: string): boolean,
 *   plan?(sessionId: string): { callId: string, questionId: string, plan: string, approve: string, decline: string | null, answer(answer: import('./voice-answer.mjs').SpokenAnswer): Promise<void> } | null,
 *   planApproval?(): boolean,
 *   planLocales?(): readonly string[],
 *   showChat?(sessionId: string): void,
 *   events(sessionId: string): Events | undefined,
 *   speak(text: string, options: { voice: string, language: string, signal: AbortSignal }): Promise<Response>,
 *   openPlayer(): Player,
 *   languageOf(text: string, sessionId: string): string,
 *   uiLanguage(): string,
 *   phrase(key: string, params?: Record<string, string | number>): string,
 *   claim(stop: () => void): () => void,
 *   limits(): { maxChars: number, sampleRate: number, silenceSeconds: number, transcriptWaitMs?: number, cacheKey?: string, voices: readonly { id: string }[] },
 *   readVoice?(): string | null,
 *   writeVoice?(id: string): void,
 *   trace?(record: Record<string, string | number>): void,
 *   monotonic?(): number,
 *   now?(): number,
 *   setTimeout?(fn: () => void, ms: number): unknown,
 *   clearTimeout?(handle: unknown): void
 * }} VoiceModeDeps
 */

/** The service's end reasons that pause the conversation, and what the row says (`voiceMode.end.*`). */
const PAUSING = /** @type {Record<string, string>} */ ({
  quota: 'voiceMode.end.quota',
  elsewhere: 'voiceMode.end.elsewhere',
  provider: 'voiceMode.end.provider',
  // Tracy could not count today's minutes (`speech/relay.js`): not available now, never "used up".
  unavailable: 'voiceMode.end.provider',
  'provider-busy': 'voiceMode.end.providerBusy',
  network: 'voiceMode.end.network'
})

/**
 * The lines said again and again, with another wording each, taken in turn: the same words every
 * time make Tracy sound like a recording (each wording its own string, translated like any other).
 */
const WORDINGS = /** @type {Record<string, readonly string[]>} */ ({
  'voiceMode.say.start': ['voiceMode.say.start', 'voiceMode.say.start2'],
  'voiceMode.say.steered': ['voiceMode.say.steered', 'voiceMode.say.steered2'],
  'voiceMode.say.other': ['voiceMode.say.other', 'voiceMode.say.other2']
})

/** Turn ends (dsh `TurnEndReason` kinds) that are a failure the person must hear about. */
const FAILED_ENDS = new Set(['error', 'blocked', 'max-tokens'])

/** The line said on leaving Voice by voice, before the chat comes back. */
const BYE = 'voiceMode.say.bye'

/** The plain line said for each kind of work (`voice-mode-turn.mjs` `workOf`). */
const WORK_LINE = /** @type {Record<string, string>} */ ({
  look: 'voiceMode.say.look',
  words: 'voiceMode.say.words',
  design: 'voiceMode.say.design',
  pictures: 'voiceMode.say.pictures',
  files: 'voiceMode.say.files',
  undo: 'voiceMode.say.undo',
  site: 'voiceMode.say.site',
  other: 'voiceMode.say.other'
})

/** @type {VoiceModeState} */
const OFF = Object.freeze({
  sessionId: null,
  phase: 'off',
  hearing: false,
  words: '',
  heldWords: '',
  sendAt: null,
  tracy: 'idle',
  talking: null,
  saying: '',
  notice: null,
  voice: '',
  plan: false
})

/**
 * @param {VoiceModeDeps} deps
 */
export function createVoiceMode(deps) {
  const now = deps.now ?? (() => Date.now())
  /** The page's own clock for the per-turn trace: never set against the server's (`voice-trace.mjs`). */
  const mono = deps.monotonic ?? (() => globalThis.performance?.now?.() ?? Date.now())
  const later = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = deps.clearTimeout ?? ((handle) => clearTimeout(/** @type {any} */ (handle)))
  const voices = () => deps.limits().voices
  const storedVoice = () => {
    const id = deps.readVoice?.() ?? null
    return id !== null && voices().some((v) => v.id === id) ? id : (voices()[0]?.id ?? '')
  }

  /** @type {VoiceModeState} */
  let state = { ...OFF, voice: storedVoice() }
  /** The phase as it is now, read after an await (a narrowed `state.phase` would be the one before it). */
  const phaseNow = () => state.phase
  /** How often each line with several wordings was said on this page (`WORDINGS`). @type {Map<string, number>} */
  const wordingsSaid = new Map()
  /** A line of the interface, in the next of its wordings. @param {string} key */
  const wording = (key) => {
    const keys = WORDINGS[key]
    if (!keys) return deps.phrase(key)
    const n = wordingsSaid.get(key) ?? 0
    wordingsSaid.set(key, n + 1)
    return deps.phrase(/** @type {string} */ (keys[n % keys.length]))
  }
  /** Fixed phrases read once and kept for the page, by voice and words. @type {Map<string, ArrayBuffer>} */
  const sounds = new Map()
  /** @type {Set<string>} */
  const warming = new Set()
  const listeners = new Set()
  /** @param {Partial<VoiceModeState>} patch */
  const set = (patch) => {
    state = { ...state, ...patch }
    for (const listener of Array.from(listeners)) listener()
  }

  /**
   * One conversation, from Start to End.
   * @typedef {{
   *   id: string,
   *   player: Player,
   *   mic: Microphone | null,
   *   release: () => void,
   *   ring: ArrayBuffer[],
   *   loud: number,
   *   link: Link | null,
   *   linkOpened: number,
   *   lastWords: number,
   *   committed: readonly string[],
   *   partial: string,
   *   sentPhrases: number,
   *   sendTimer: unknown,
   *   quietTimer: unknown,
   *   stuckTimer: unknown,
   *   idleTimer: unknown,
   *   heardAt: number,
   *   micLevel: number,
   *   duckTimer: unknown,
   *   spokeAt: number,
   *   voiceStartedAt: number,
   *   stoppedAt: number,
   *   levels: number[],
   *   voiceOver: null | 'progress' | 'reply',
   *   phrase: { over: null | 'progress' | 'reply' } | null,
   *   held: string | null,
   *   sendPressed: boolean,
   *   leaveAfter: string | null,
   *   planTimer: unknown,
   *   stillTimer: unknown,
   *   workingTurn: number | null,
   *   replyAsked: boolean,
   *   question: { text: string, again: boolean, card?: boolean, heard?: boolean, screen?: boolean } | null,
   *   plan: { callId: string, hash: string, line: string, read: boolean, rereads: number, what: boolean } | null,
   *   repromptTimer: unknown,
   *   networkDropAt: number,
   *   spokeMono: number,
   *   commitsSeen: number,
   *   commitMono: number | null,
   *   commitSpeechEnd: number | null,
   *   trace: import('./voice-trace.mjs').TraceMarks | null,
   *   leaving: boolean,
   *   switching: boolean,
   *   switchAgain: boolean,
   *   follow: { stop: () => void, after: number | null, followed: Set<number>, records: Map<number, { seen: number, said: number, asked: string | null, card: string | null, planned: string | null, done: boolean, muted: boolean }> } | null,
   *   out: { abort: AbortController | null, kind: null | 'progress' | 'reply', ack: string | null, ackTraced: boolean, progress: { text: string, turn: number | null, fixed: boolean, now: boolean, card: string | null } | null, replies: string[], lastEnd: number, flushTimer: unknown, recent: { text: string, at: number }[], off: boolean },
   *   cache: Map<string, ArrayBuffer>
   * }} Run
   */
  /** @type {Run | null} */
  let run = null

  // ---- the ear ------------------------------------------------------------------------------

  /** @param {Run} r */
  const openEar = async (r) => {
    set({ phase: 'starting', notice: null })
    let mic
    try {
      mic = await deps.openMic(
        (frame) => onFrame(r, frame),
        (level) => {
          r.micLevel = Math.max(r.micLevel, level)
        },
        () => pause({ key: 'voiceMode.end.lost' })
      )
    } catch (error) {
      if (run !== r) return
      const problem = /** @type {{ problem?: string }} */ (error)?.problem ?? 'unsupported'
      pause({ key: `voice.error.${problem}` })
      return
    }
    if (run !== r || state.phase !== 'starting') {
      await mic.close()
      return
    }
    r.mic = mic
    r.ring = []
    r.loud = 0
    r.levels = []
    r.heardAt = now()
    // Words held by the Stop are still the person's to send or drop, after a pause too.
    set({
      phase: 'on',
      ...(r.held === null ? {} : { words: r.held }),
      // The microphone picked in the menu was not there: the browser's default listens, and the person
      // is told so, briefly (council 19/10/2026).
      ...(mic.fellBack ? { notice: { key: 'voice.micFallback' } } : {})
    })
    armIdle(r)
    warm()
  }

  /**
   * The microphone picked in the menu changed while Voice listens: capture restarts once, on it. The
   * old stream is closed before the new one is asked for — never two at once — and a pick changed again
   * meanwhile restarts once more when this one is open. Starting or paused, nothing restarts: the next
   * opening reads the pick itself.
   * @param {Run} r
   */
  const switchMic = async (r) => {
    if (run !== r || r.leaving) return
    if (r.switching) {
      r.switchAgain = true
      return
    }
    if (state.phase !== 'on' || !r.mic) return
    r.switching = true
    try {
      do {
        r.switchAgain = false
        const old = r.mic
        r.mic = null
        // Not listening before the old microphone closes: closing hands over its last frame.
        set({ phase: 'starting' })
        await old?.close()
        // Paused or ended while it closed: nothing to open again.
        if (run !== r || r.leaving || phaseNow() !== 'starting') return
        await openEar(r)
      } while (r.switchAgain && run === r && phaseNow() === 'on' && r.mic)
    } finally {
      r.switching = false
    }
  }

  /** @param {Run} r @param {ArrayBuffer} frame */
  const onFrame = (r, frame) => {
    if (run !== r || state.phase !== 'on' || r.leaving) return
    const talking = state.talking !== null
    const loudness = frameRms(frame)
    // The room's level, from frames Tracy's own voice is not in.
    if (!talking) {
      r.levels.push(loudness)
      if (r.levels.length > NOISE_WINDOW) r.levels.shift()
    }
    const speech = loudness > threshold(r, talking)
    if (speech && r.repromptTimer !== null) {
      cancel(r.repromptTimer)
      r.repromptTimer = null
    }
    if (speech) {
      // Speech after a quiet: whether it began over Tracy's voice is kept, for its words may come
      // back after Tracy is done (on the stand, 1.4 s after an "ừ" said over a short line).
      if (now() - r.spokeAt >= SPEAKING_MS) {
        r.voiceOver = state.talking
        r.voiceStartedAt = now()
      }
      r.spokeAt = now()
      r.spokeMono = mono()
    }
    if (r.link) {
      r.link.sendAudio(frame)
      return
    }
    r.ring.push(frame)
    if (r.ring.length > PREROLL_FRAMES) r.ring.shift()
    // Over Tracy's voice, only speech louder and longer than its echo is the person.
    r.loud = speech ? r.loud + 1 : 0
    if (r.loud < (talking ? TALK_OVER_FRAMES : SPEECH_FRAMES)) return
    openHearing(r)
    if (talking) duck(r)
  }

  /**
   * How loud a frame must be to be the person: the fixed threshold (louder over Tracy's voice), or
   * {@link NOISE_MARGIN} times the room's own level when that is higher.
   * @param {Run} r @param {boolean} talking
   */
  const threshold = (r, talking) => {
    const fixed = talking ? TALK_OVER_RMS : SPEECH_RMS
    if (r.levels.length < NOISE_SETTLE) return fixed
    const quietest = [...r.levels].sort((a, b) => a - b)[Math.floor(r.levels.length / 10)]
    return Math.max(fixed, Math.min(quietest * NOISE_MARGIN, NOISE_CEILING))
  }

  /** Speech over Tracy: Tracy is turned down until the words say who it was. @param {Run} r */
  const duck = (r) => {
    r.player.duck?.(true)
    cancel(r.duckTimer)
    r.duckTimer = later(() => {
      r.duckTimer = null
      if (run === r) r.player.duck?.(false)
    }, DUCK_MS)
  }

  /** The lines Tracy is saying or just said: what its voice coming back would read. @param {Run} r */
  const ownLines = (r) => [
    ...(state.saying === '' ? [] : [state.saying]),
    ...r.out.recent.filter((line) => now() - line.at < ECHO_MS).map((line) => line.text)
  ]

  /** Speech on the microphone: open a voice session and send it the second before. @param {Run} r */
  const openHearing = (r) => {
    r.loud = 0
    r.committed = []
    r.partial = ''
    r.sentPhrases = 0
    r.linkOpened = now()
    r.lastWords = 0
    // A new session is a new phrase: whether the last one began over Tracy says nothing of this one.
    r.phrase = null
    r.sendPressed = false
    r.commitsSeen = 0
    const link = deps.openLink(
      {
        onReady: () => {
          if (run !== r || r.link !== link) return
          const list = deps.limits().voices
          if (!list.some((voice) => voice.id === state.voice)) set({ voice: list[0]?.id ?? '' })
          quietCheck(r, deps.limits().transcriptWaitMs ?? NO_WORDS_MS)
        },
        onWords: (committed, partial) => {
          if (run !== r || r.link !== link) return
          // A phrase confirmed: when, and the person's last loud frame before it (the trace's first two
          // marks, `voice-trace.mjs`).
          if (committed.length !== r.commitsSeen) {
            r.commitsSeen = committed.length
            r.commitMono = mono()
            r.commitSpeechEnd = r.spokeMono > 0 ? r.spokeMono : null
          }
          r.committed = committed
          r.partial = partial
          heard(r)
        },
        onEnd: (reason, settled) => {
          if (run !== r || r.link !== link) return
          r.link = null
          closedHearing(r, reason, settled)
        }
      },
      { url: deps.socketUrl(r.id) }
    )
    r.link = link
    for (const frame of r.ring) link.sendAudio(frame)
    r.ring = []
    set({ hearing: true, words: r.held ?? '', sendAt: null })
    quietCheck(r, deps.limits().transcriptWaitMs ?? NO_WORDS_MS)
  }

  /**
   * The speech being heard began before the footer's Stop: it is shown with Send now and Say it again,
   * never sent by itself — sent after the Stop, it would start the work again. Speech begun after the
   * Stop goes as usual. (On the real page, 17/10/2026, Stop pressed while the person was still saying
   * a request: the words stayed on screen, unsent.)
   * @param {Run} r
   */
  const heldByStop = (r) => r.stoppedAt > 0 && r.voiceStartedAt <= r.stoppedAt

  /** The speech being heard began while Tracy talked, or just after: it may be Tracy's own voice. @param {Run} r */
  const mayBeEcho = (r) => r.voiceOver !== null || r.voiceStartedAt - r.out.lastEnd < ECHO_TAIL_MS

  /**
   * The phrase began over Tracy's voice (`over`, the phrase's own mark) or right after it: maybe its own
   * line coming back. Never taken where a word may open a change: a plan's approval or change, an
   * answer to Tracy's confirmation card.
   * @param {Run} r @param {boolean} over
   */
  const begunOverTracy = (r, over) => over || mayBeEcho(r)

  /** The person's words of the phrase not sent yet: Tracy's own words coming back are cut off. @param {Run} r */
  const unsent = (r) => {
    const words = withoutSoundTags(spokenText(r.committed.slice(r.sentPhrases), r.partial))
    return mayBeEcho(r) ? withoutEcho(words, ownLines(r)) : words
  }

  /**
   * Tracy is waiting on an answer: a question card, or a reply that asked something.
   * @param {Run} r
   */
  const waitsOnAnswer = (r) => state.tracy === 'asking' || (state.tracy === 'idle' && r.replyAsked)

  /**
   * Words that are no request: hesitation alone; or the person only listening ("mm-hmm", "ừ"), over
   * Tracy's voice or when Tracy waits on nothing. "Okay" to what Tracy just asked is the answer: it goes.
   * @param {Run} r
   * @param {string} text
   * @param {{ over: null | 'progress' | 'reply' } | null} phrase
   */
  const notARequest = (r, text, phrase) => {
    if (isFillerOnly(text)) return true
    // A question card open: whatever is said answers it — "ừ" and a single word too (council 17/10/2026).
    if (state.tracy === 'asking') return false
    // Begun over Tracy's voice, a sound it could not make out was no request either (`stopsTracy`).
    if (phrase?.over != null && !stopsTracy(text)) return true
    return isBackchannel(text) && (phrase?.over != null || state.talking !== null || !waitsOnAnswer(r))
  }

  /** A phrase is done with without being sent. @param {Run} r */
  const letPhraseGo = (r) => {
    r.sentPhrases = r.committed.length
    r.phrase = null
    set({ words: r.held ?? '', sendAt: null })
    quietCheck(r, QUIET_MS)
    flush(r)
  }

  /** New words from the service. @param {Run} r */
  const heard = (r) => {
    if (state.notice?.key === 'voiceMode.end.reconnecting') set({ notice: null })
    // "Dạ vâng." before the request is no part of it (on the stand the service even heard one in the
    // silence before a request), unless it answers what Tracy asked.
    if (!waitsOnAnswer(r))
      while (
        r.sentPhrases < r.committed.length &&
        (r.sentPhrases + 1 < r.committed.length || r.partial !== '') &&
        isBackchannel(r.committed[r.sentPhrases])
      )
        r.sentPhrases += 1
    const words = unsent(r)
    r.lastWords = now()
    r.heardAt = now()
    armIdle(r)
    cancel(r.sendTimer)
    r.sendTimer = null
    if (words === '') {
      r.phrase = null
      // Confirmed phrases that were all Tracy's own voice are done with: never the start of the next one.
      if (r.partial === '') return letPhraseGo(r)
      set({ words: r.held ?? words, sendAt: null })
      quietCheck(r, QUIET_MS)
      return
    }
    // What Tracy was saying when the phrase began: "ừ" over it is listening, not asking.
    r.phrase ??= { over: r.voiceOver ?? state.talking }
    // Over Tracy's voice, words that did not stop it are not put on screen: its line stays there.
    let shown = words
    // Words said before the Stop are not the person talking over Tracy's "stopped".
    if (state.talking !== null && !heldByStop(r)) {
      // The person's words: Tracy stops, and hears them out. Only listening: it goes on at its own
      // volume. A sound it cannot make out yet: it goes on turned down, for the next word to say.
      // Answering the question being read, one word is enough ("Đỏ.").
      if (stopsTracy(words) || state.tracy === 'asking') {
        cancel(r.duckTimer)
        r.duckTimer = null
        stopTalking(r, false)
      } else {
        shown = ''
        if (isBackchannel(words)) {
          cancel(r.duckTimer)
          r.duckTimer = null
          r.player.duck?.(false)
        } else duck(r)
      }
    }
    // Words held by the Stop stay on screen until a new phrase is finished and is one: not replaced
    // by a cough or by the first word of what comes next (council 18/10/2026).
    const replacing = r.held !== null && !heldByStop(r)
    if (r.partial !== '') {
      set({ words: (replacing ? r.held : null) ?? shown, sendAt: null })
      quietCheck(r, QUIET_MS)
      stuckCheck(r)
      return
    }
    // The whole finished phrase asks to leave Voice, or says goodbye: back to the chat (council 19/10/2026).
    if (leavesVoice(r, words)) return leaveByVoice(r)
    if (notARequest(r, words, r.phrase)) return letPhraseGo(r)
    if (heldByStop(r)) {
      set({ words, sendAt: null })
      quietCheck(r, QUIET_MS)
      return flush(r)
    }
    // A finished new phrase takes the place of the words held by the Stop, and goes as usual.
    r.held = null
    // A confirmed phrase and no word after it: it goes, unless a new word comes first — later when
    // the sentence is not over. (A question mark is the service's guess, not the person's: no hurry.)
    // A yes or a no to the confirmation card waiting is a whole answer, even ending as a sentence that
    // goes on would ("是的", "对的"): it goes after the usual wait.
    const answers = confirmReply(words) !== null && yesOrNoWaits(r)
    const wait = soundsUnfinished(words) && !answers ? UNFINISHED_SEND_MS : SEND_AFTER_MS
    set({ words, sendAt: now() + wait })
    armSend(r, wait, now() + wait + SPEAKING_HOLD_MS)
    quietCheck(r, QUIET_MS)
  }

  /**
   * The phrase goes in `ms` — but not while the person is still speaking and no word of it is read
   * yet: it waits for those words, up to `latest`.
   * @param {Run} r
   * @param {number} ms
   * @param {number} latest
   */
  const armSend = (r, ms, latest) => {
    r.sendTimer = later(() => {
      if (run !== r || r.sendTimer === null) return
      if (now() - r.spokeAt < SPEAKING_MS && now() < latest) return armSend(r, SPEAKING_MS / 2, latest)
      // Confirmed by the service, no word since: a finished phrase (a plan may take it as approval).
      void sendWords(r, undefined, { final: r.partial === '' })
    }, ms)
  }

  /**
   * Let a session go once it has heard nothing for `ms` — never while the person is still speaking:
   * a service slow to read a hard name must not cost them their words (council 17/10/2026).
   * @param {Run} r @param {number} ms @param {number} [wait]
   */
  const quietCheck = (r, ms, wait = ms) => {
    cancel(r.quietTimer)
    r.quietTimer = later(() => {
      if (run !== r || !r.link || r.sendTimer !== null || r.partial !== '') return
      if (now() - r.spokeAt < SPEAKING_MS) return quietCheck(r, ms, SPEAKING_MS)
      const since = r.lastWords === 0 ? r.linkOpened : r.lastWords
      if (now() - since < ms) return quietCheck(r, ms)
      // Words held by the Stop outlive the session: it closes (its seconds are counted), they stay.
      if (heldByStop(r) && unsent(r) !== '') return keepHeld(r)
      dropHearing(r)
    }, wait)
  }

  /**
   * Words shown and never confirmed: once the person has been quiet {@link STUCK_WORDS_MS} after them,
   * the service is asked to finish the phrase, and what it finishes goes (`closedHearing`). Shown words
   * are never taken for finished ones (council 18/10/2026): if the service does not finish them, they
   * stay on screen for Send now or Say it again.
   * @param {Run} r @param {number} [wait]
   */
  const stuckCheck = (r, wait = STUCK_WORDS_MS) => {
    cancel(r.stuckTimer)
    r.stuckTimer = later(() => {
      if (run !== r || !r.link || r.partial === '' || r.sendTimer !== null || heldByStop(r)) return
      const quiet = now() - Math.max(r.lastWords, r.spokeAt)
      if (quiet < STUCK_WORDS_MS) return stuckCheck(r, STUCK_WORDS_MS - quiet)
      r.link.stop()
    }, wait)
  }

  /**
   * The session closes and the words not sent stay on screen, held, for Send now or Say it again:
   * words begun before the Stop, or words the service never finished. Not lost to a timer.
   * @param {Run} r
   */
  const keepHeld = (r) => {
    const words = unsent(r)
    cancel(r.sendTimer)
    cancel(r.quietTimer)
    cancel(r.stuckTimer)
    r.sendTimer = null
    const link = r.link
    r.link = null
    link?.close()
    r.held = words === '' ? r.held : words
    r.committed = []
    r.partial = ''
    r.sentPhrases = 0
    r.phrase = null
    if (run !== r) return
    set({ hearing: false, words: r.held ?? '', sendAt: null })
    flush(r)
  }

  /** Close the voice session without a word; what was not sent is dropped. @param {Run} r */
  const dropHearing = (r) => {
    cancel(r.sendTimer)
    cancel(r.quietTimer)
    r.sendTimer = null
    const link = r.link
    r.link = null
    link?.close()
    r.partial = ''
    // The dropped phrase's start (over Tracy or not) must not judge the next one: a one-word answer
    // after Say it again was taken for words over Tracy and dropped.
    r.phrase = null
    if (run !== r) return
    set({ hearing: false, words: r.held ?? '', sendAt: null })
    flush(r)
  }

  /**
   * The service ended: only a confirmed normal ending or an explicit send admits words.
   * @param {Run} r @param {string} reason @param {boolean} [settled]
   */
  const closedHearing = (r, reason, settled = false) => {
    cancel(r.quietTimer)
    cancel(r.stuckTimer)
    cancel(r.sendTimer)
    r.sendTimer = null
    const words = unsent(r)
    const normal = ['silence', 'stopped'].includes(reason)
    set({ hearing: false, sendAt: null })
    if (words !== '' && !heldByStop(r) && ((normal && settled) || r.sendPressed)) {
      void sendWords(r, words, { final: normal && settled && r.partial === '' })
      return
    }
    if (words !== '' && (normal || heldByStop(r))) keepHeld(r)
    else if (words !== '') {
      set({ heldWords: [state.heldWords, words].filter(Boolean).join('\n').slice(0, 4000) })
      r.sentPhrases = r.committed.length
      r.partial = ''
    }
    r.phrase = null
    set({ words: r.held ?? '', sendAt: null })
    // A dropped connection once is a shaky network: the ear goes on, and the next speech opens a new
    // session; twice in a row is a network that is down.
    if (reason === 'network' && now() - r.networkDropAt > NETWORK_RETRY_MS) {
      r.networkDropAt = now()
      set({ notice: { key: 'voiceMode.end.reconnecting' } })
      return flush(r)
    }
    const notice = PAUSING[reason]
    if (notice) pause({ key: notice })
    else flush(r)
  }

  /**
   * Send the phrase as the person's message.
   * @param {Run} r
   * @param {string} [text]
   * @param {{ pressed?: boolean, final?: boolean }} [how] - `pressed`: sent by Send now, not by the person
   *   stopping; `final`: every word of it was confirmed by the service in a listening turn (never held,
   *   never a partial) — the only words a plan may take as its approval
   */
  const sendWords = async (r, text = unsent(r), { pressed = r.sendPressed, final = false } = {}) => {
    if (run !== r || state.phase !== 'on' || r.leaving) return
    cancel(r.sendTimer)
    r.sendTimer = null
    cancel(r.repromptTimer)
    r.repromptTimer = null
    r.sentPhrases = r.committed.length
    r.partial = ''
    const phrase = r.phrase
    r.phrase = null
    set({ words: '', sendAt: null })
    if (text === '') {
      flush(r)
      return true
    }
    if ((mayBeEcho(r) && isEcho(text, ownLines(r))) || notARequest(r, text, phrase)) {
      flush(r)
      return true
    }
    // Finished by a stop or Send now, the phrase may still be the way out of Voice.
    if (leavesVoice(r, text)) {
      leaveByVoice(r)
      return true
    }
    // A plan waits on the person's review: nothing is steered into a turn blocked on it; the words
    // stay, and the conversation goes to the chat, where the review is (`planReview`).
    if (deps.planReview?.(r.id)) {
      // Read out for review by voice: the words approve it, change it, or take the person to the chat.
      if (r.plan !== null)
        return answerPlan(r, text, { final: final && !pressed, over: phrase?.over != null })
      r.held = text
      set({ words: text, sendAt: null })
      return flush(r)
    }
    const question = deps.question?.(r.id) ?? null
    // From here the words go: this turn is traced, from the person's last loud frame before the phrase
    // was confirmed (a turn still waiting for its reply is let go as cut off: the person spoke again).
    closeTrace(r, true)
    /** @type {import('./voice-trace.mjs').TraceMarks} */
    const traced = {
      id: traceId(),
      speechEnd: r.commitSpeechEnd,
      commit: r.commitMono,
      sent: null,
      ack: null,
      ackCached: false,
      reply: null,
      replyLine: null,
      error: false,
      interrupted: false,
      pressed
    }
    // A card offering "Huỷ" / "Cancel": that word alone picks the choice, never stops the whole turn;
    // nor does it said to Tracy's confirmation card, where it is a no — "keep it" (`confirmReply`).
    const picks =
      question !== null &&
      (question.questions.some((item) => exactChoice(choicesOf(item), text) !== null) ||
        (takesYesOrNo(question.questions) && confirmReply(text) !== null))
    const spoken = question === null ? null : spokenAnswer(question.questions, text)
    // 🔒 A "YES" FROM TRACY'S OWN SPEAKERS NEVER OPENS A DELETE. An answer to Tracy's confirmation card
    // that goes ahead (its FIRST option: a yes, or that label) counts only from a phrase begun after the
    // card's reading (and its "say yes or no") played to its end — not over it nor in its tail, as a
    // plan's approval — and never one that is the last words of what Tracy just said. Such a phrase is
    // dropped without a word (`dropAnswer`). A no, a cancel or the keep label can only keep things as
    // they are: it answers at once, even said over the reading. Words that answer nothing are held to
    // the same guard as a yes — asked again aloud, Tracy's own line coming back ("…yes or no") would ask
    // it again and again — all but a stop of the work, which goes as before.
    const confirming = question !== null && question.questions.some(isConfirm)
    const goesAhead =
      confirming &&
      spoken !== null &&
      spoken.answers.some(
        (answer) =>
          answer.selected[0] !== undefined &&
          answer.selected[0] === choicesOf(question.questions.find((item) => item.id === answer.id))[0]
      )
    if (
      confirming &&
      (goesAhead || (spoken === null && !isStopCommand(text))) &&
      (r.question?.card !== true ||
        r.question.heard !== true ||
        begunOverTracy(r, phrase?.over != null) ||
        endsLine(text, ownLines(r)))
    )
      return dropAnswer(r, question)
    // "Dừng lại", "khoan đã" while Tracy works: the work stops, as dsh's Stop does. Said to an idle
    // Tracy it stopped its talking already (`heard`): never a message, and what waited to be read too.
    if (!picks && isStopCommand(text)) {
      if (state.tracy !== 'idle' && deps.cancel) return stopWork(r)
      r.out.replies = []
      return flush(r)
    }
    // A question card waits: the words answer it, as a press on the card would — Tracy's own
    // confirmation card only by a choice or a clear yes or no; anything else asks it again, and is
    // never sent as its answer (council 20/10/2026, D5.1; `voice-answer.mjs` `spokenAnswer`).
    if (question !== null && spoken === null) return askAgain(r, question)
    r.trace = traced
    if (question !== null && spoken !== null) {
      const answered = await question.answer(spoken).then(
        () => true,
        () => false
      )
      if (run !== r) return
      if (answered) {
        if (r.trace === traced) traced.sent = mono()
        r.replyAsked = false
        set({ notice: null })
        offerAck(r, wording('voiceMode.say.start'), true)
        return true
      }
    }
    const working = state.tracy !== 'idle'
    const result = await deps.send(r.id, text, working ? 'steer' : 'queue').catch(() => 'failed')
    if (run !== r) return
    if (result !== 'sent') {
      if (r.trace === traced) {
        traced.error = true
        closeTrace(r)
      }
      set({ notice: { key: 'voiceMode.end.notSent' } })
      flush(r)
      return false
    }
    if (r.trace === traced) traced.sent = mono()
    r.replyAsked = false
    set({ notice: null })
    // Said at once, from a reading kept for the page: the message went, and what Tracy does with it.
    offerAck(r, wording(working ? 'voiceMode.say.steered' : 'voiceMode.say.start'), true)
    return true
  }

  /**
   * An answer to Tracy's confirmation card that may be Tracy's own voice: dropped without a word. The
   * card is asked once more after a silence (`armReprompt`; the speech itself let the earlier wait go);
   * a card never read out yet is read now, so a phrase after it can answer. Dropped again after that
   * one re-ask (the person talks over Tracy, or its voice comes back): Tracy says once that it could not
   * hear the answer and asks for it on screen, then asks no more — never a loop on its own voice, never
   * silent for good.
   * @param {Run} r
   * @param {NonNullable<ReturnType<NonNullable<VoiceModeDeps['question']>>>} question
   */
  const dropAnswer = (r, question) => {
    if (r.question?.card !== true) return askAgain(r, question)
    if (!r.question.again) armReprompt(r)
    else if (r.question.screen !== true) {
      r.question.screen = true
      offerAck(r, deps.phrase('voiceMode.say.answerOnScreen'))
      return true
    }
    flush(r)
    return true
  }

  /**
   * Tracy's confirmation card waits, the one a spoken yes or no answers (`voice-answer.mjs` `takesYesOrNo`).
   * @param {Run} r
   */
  const yesOrNoWaits = (r) => {
    const question = deps.question?.(r.id) ?? null
    return question !== null && takesYesOrNo(question.questions)
  }

  /**
   * The words said to a card answered nothing on it: the card is asked again, as it was asked first —
   * its question, then its choices — then, for a card a yes or a no answers, a line asking for one
   * (`voiceMode.say.yesOrNo`); it waits on the next phrase.
   * @param {Run} r
   * @param {NonNullable<ReturnType<NonNullable<VoiceModeDeps['question']>>>} question
   */
  const askAgain = (r, question) => {
    const [item] = question.questions
    const asked = firstSentence(item?.question ?? '', 200)
    const choices = choicesOf(item)
    const language = deps.languageOf(asked === '' ? choices.join(' ') : asked, r.id)
    const card = askedLine(deps.phrase('voiceMode.say.asking'), asked, choices, language)
    // The one card a yes or a no answers: after it, how to answer it.
    const how = takesYesOrNo(question.questions) ? deps.phrase('voiceMode.say.yesOrNo') : ''
    const line = how === '' ? card : `${card} ${how}`
    r.question = { text: line, again: false, card: true, heard: false }
    offerProgress(r, line, { now: true })
    flush(r)
    return true
  }

  /**
   * The traced turn is done with: its spans are reported (`voice-trace.mjs`), once. `cut`: it ends
   * before its reply was heard — the person spoke again, stopped, paused or left.
   * @param {Run} r @param {boolean} [cut]
   */
  const closeTrace = (r, cut = false) => {
    const t = r.trace
    if (!t) return
    r.trace = null
    if (cut && t.reply === null) t.interrupted = true
    try {
      deps.trace?.(traceRecord(t))
    } catch {
      // A trace is never in the person's way.
    }
  }

  /**
   * The whole finished phrase is the way out of Voice: asking to leave it in any of the eight
   * languages, or a goodbye — not while a question card waits, where "bye" may be the answer — and
   * never Tracy's own voice coming back (council 19/10/2026).
   * @param {Run} r @param {string} words
   */
  const leavesVoice = (r, words) => {
    if (words === '' || (mayBeEcho(r) && isEcho(words, ownLines(r)))) return false
    if (isVoiceOff(words)) return true
    const cardWaits = state.tracy === 'asking' || (deps.question?.(r.id) ?? null) !== null
    return !cardWaits && isGoodbye(words)
  }

  /**
   * Leaving Voice by voice: the microphone stops at once, nothing more of the work is said, Tracy says
   * one short line and the conversation goes back to the chat — the same way as a plan to review
   * (`showChat`); a line that cannot be read goes there anyway. The work goes on, and a waiting
   * question card stays as it is.
   * @param {Run} r
   */
  const leaveByVoice = (r) => {
    if (run !== r || r.leaving) return
    r.leaving = true
    closeTrace(r, true)
    cancel(r.sendTimer)
    r.sendTimer = null
    cancel(r.repromptTimer)
    r.repromptTimer = null
    cancel(r.stillTimer)
    r.stillTimer = null
    cancel(r.planTimer)
    r.planTimer = null
    cancel(r.idleTimer)
    r.held = null
    dropHearing(r)
    stopTalking(r)
    const mic = r.mic
    r.mic = null
    void mic?.close()
    const line = deps.phrase(BYE)
    if (r.out.off || line === '' || state.phase !== 'on') {
      deps.showChat?.(r.id)
      return
    }
    r.leaveAfter = line
    r.out.ack = line
    r.out.ackTraced = false
    flush(r)
  }

  /**
   * A question Tracy finished asking: if nothing is said for {@link REPROMPT_MS} and it still waits on
   * the answer, it is asked once more — then Tracy waits; silence is never an answer.
   * @param {Run} r
   */
  const armReprompt = (r) => {
    cancel(r.repromptTimer)
    r.repromptTimer = later(() => {
      r.repromptTimer = null
      const asked = r.question
      if (run !== r || state.phase !== 'on' || asked === null || asked.again) return
      const waits = state.tracy === 'asking' || (state.tracy === 'idle' && r.replyAsked)
      if (!waits || r.link || state.talking !== null || now() - r.spokeAt < REPROMPT_MS) return
      asked.again = true
      offerProgress(r, asked.text, { now: true })
    }, REPROMPT_MS)
  }

  /**
   * Stop Tracy's work, as dsh's Stop does (the footer's button, or "dừng lại" said while it works):
   * what Tracy was saying stops, and it says the work stopped — what was already saved stays (no
   * undo). The turn then ends as stopped, and nothing more of it is read.
   * @param {Run} r
   */
  const stopWork = async (r) => {
    // Words said before the Stop are not sent by themselves (`heldByStop`): they stay on screen for
    // Send now or Say it again.
    r.stoppedAt = now()
    cancel(r.sendTimer)
    r.sendTimer = null
    if (state.sendAt !== null) set({ sendAt: null })
    stopTalking(r)
    const stopped = (await deps.cancel?.(r.id).catch(() => false)) ?? false
    if (run !== r) return
    if (!stopped) {
      set({ notice: { key: 'voiceMode.end.notStopped' } })
      return flush(r)
    }
    set({ notice: null })
    offerAck(r, deps.phrase('voiceMode.say.stopped'))
  }

  /**
   * The phrases said the moment words go, read once when the voice starts and kept for the page, so
   * the first "got it" plays at once instead of after a reading.
   */
  const warm = () => {
    if (!(typeof deps.warm === 'function' ? deps.warm() : deps.warm)) return
    for (const key of [...WORDINGS['voiceMode.say.start'], ...WORDINGS['voiceMode.say.steered']]) {
      const text = deps.phrase(key)
      const id = `${deps.limits().cacheKey ?? ''}\n${state.voice}\n${text}`
      if (text === '' || sounds.has(id) || warming.has(id)) continue
      warming.add(id)
      void deps
        .speak(text, {
          voice: state.voice,
          language: deps.uiLanguage(),
          signal: new AbortController().signal
        })
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((sound) => {
          if (sound) sounds.set(id, sound)
        })
        .catch(() => {})
        .finally(() => warming.delete(id))
    }
  }

  /**
   * What Tracy says the moment words went: before any line of the work and past the gap; a newer
   * one takes the place of one not said yet (the person said two things in a row: one "got it").
   * @param {Run} r
   * @param {string} text
   * @param {boolean} [traced] - the "got it" of the traced turn: when it is heard is marked
   */
  const offerAck = (r, text, traced = false) => {
    if (r.out.off || text === '' || state.phase !== 'on' || r.leaving) return flush(r)
    r.out.ack = text
    r.out.ackTraced = traced
    flush(r)
  }

  /** Send now (the row's button): the phrase being spoken is confirmed first. @param {Run} r */
  const sendNow = (r) => {
    // Pressed: the person wants these words sent, even those said before the Stop.
    r.stoppedAt = 0
    r.sendPressed = true
    const held = r.held
    if (held !== null && (!r.link || (unsent(r) === '' && r.partial === ''))) {
      r.held = null
      if (r.link) dropHearing(r)
      void sendWords(r, held)
      return
    }
    if (!r.link) return
    r.held = null
    if (r.partial === '') {
      void sendWords(r)
      return
    }
    // The service confirms what is still being said, then ends the session (`closedHearing`).
    cancel(r.sendTimer)
    r.sendTimer = null
    r.link.stop()
  }

  /**
   * A plan waits on the person's review, which Voice's view hides: Tracy says so, stops listening and
   * telling its work, and the conversation goes back to the chat, where the review card is. Nothing
   * said is steered into the blocked turn (`sendWords`); "ừ" is never taken for approval.
   * @param {Run} r
   */
  const reviewPlan = (r) => {
    if (run !== r || r.leaving) return
    // Voice still opening (pressed with the plan already waiting): the press that started it shows the
    // voice view after this, so going to the chat now would be undone. Said once the voice is on.
    if (state.phase === 'starting') {
      cancel(r.planTimer)
      r.planTimer = later(() => {
        r.planTimer = null
        reviewPlan(r)
      }, PLAN_RETRY_MS)
      return
    }
    cancel(r.stillTimer)
    r.stillTimer = null
    cancel(r.repromptTimer)
    r.repromptTimer = null
    stopTalking(r)
    const line = deps.phrase('voiceMode.say.planReview')
    if (r.out.off || line === '' || state.phase !== 'on') {
      deps.showChat?.(r.id)
      return
    }
    r.leaveAfter = line
    r.out.ack = line
    flush(r)
  }

  /** The one turn of the window waiting on a plan's review, or null (none, or more than one). @param {Run} r */
  const windowPlan = (r) => {
    const reviewing = turnsOf(deps.events(r.id)?.getSnapshot()?.entries).filter((turn) => turn.reviewing)
    return reviewing.length === 1 ? /** @type {import('./voice-mode-turn.mjs').Turn} */ (reviewing[0]) : null
  }

  /**
   * The locales whose plan phrases a native speaker checked and a real speech run passed
   * (`voice-turn-taking.mjs` `PLAN_VOICE_LOCALES`, council 20/10/2026, D4): only theirs are read.
   */
  const planLocales = () => deps.planLocales?.() ?? PLAN_VOICE_LOCALES

  /**
   * The plan Voice may read for an approval, or null — then the chat, as before. Every condition of the
   * council's (A6) that the page can check: the operator's switch on, and the interface's locale one
   * whose phrases were verified (D4: it is read in that language, and answered in it); exactly one plan
   * waiting in the turn, and no question card beside it; dsh holding that very call for review, in the
   * shape its own card answers; a plan that names itself (a title to read).
   * @param {Run} r
   * @param {import('./voice-mode-turn.mjs').Turn | null} turn
   */
  const planByVoice = (r, turn) => {
    if (turn === null || deps.planApproval?.() !== true) return null
    if (!planLocales().includes(deps.uiLanguage())) return null
    if (turn.planIds.length !== 1 || turn.asking !== null) return null
    const pending = deps.plan?.(r.id) ?? null
    if (pending === null || pending.callId !== turn.planIds[0]) return null
    const spoken = planSpoken(pending.plan)
    return spoken.title === '' ? null : { pending, spoken }
  }

  /**
   * A plan waits on review: read for an approval by voice where every condition holds, else the chat.
   * @param {Run} r
   * @param {import('./voice-mode-turn.mjs').Turn} turn
   */
  const offerPlan = (r, turn) => {
    const found = planByVoice(r, turn)
    if (found === null) return reviewPlan(r)
    readPlan(r, found)
  }

  /**
   * Read the plan: its title and scope as a reply, then how to answer, as a fixed phrase. The reading
   * counts as heard only once it played to its end (`play`); what it read is bound by call and text.
   * @param {Run} r
   * @param {{ pending: NonNullable<ReturnType<NonNullable<VoiceModeDeps['plan']>>>, spoken: { title: string, scope: string } }} found
   * @param {boolean} [changed] - the plan changed since it was read: said so first
   */
  const readPlan = (r, found, changed = false) => {
    if (run !== r || r.leaving) return
    // Voice still opening (pressed with the plan already waiting): read once it is on.
    if (state.phase === 'starting') {
      cancel(r.planTimer)
      r.planTimer = later(() => {
        r.planTimer = null
        const turn = windowPlan(r)
        if (turn !== null) offerPlan(r, turn)
      }, PLAN_RETRY_MS)
      return
    }
    cancel(r.stillTimer)
    r.stillTimer = null
    cancel(r.repromptTimer)
    r.repromptTimer = null
    // What was being said of the work stops; the work is not muted (approved, it goes on, and is told).
    stopTalking(r, false)
    r.out.replies = []
    const read = [deps.phrase('voiceMode.say.planRead', { title: found.spoken.title }), found.spoken.scope]
      .filter((part) => part !== '')
      .join(' ')
    const ask = deps.phrase('voiceMode.say.planAsk')
    if (r.out.off || state.phase !== 'on' || read === '' || ask === '') return planToChat(r)
    const line = changed ? `${deps.phrase('voiceMode.say.planChanged')} ${read}` : read
    const again = r.plan !== null && r.plan.callId === found.pending.callId ? r.plan.rereads + 1 : 0
    r.plan = {
      callId: found.pending.callId,
      hash: planHash(found.pending.plan),
      line,
      read: false,
      rereads: again,
      what: false
    }
    // Asked once more after a silence (`armReprompt`); silence is never an approval.
    r.question = { text: ask, again: false }
    set({ plan: true })
    r.out.replies.push(line)
    r.out.ack = ask
    r.out.ackTraced = false
    flush(r)
  }

  /**
   * The plan read for review is no longer Voice's to take: the person goes to the chat, where its card
   * is — today's way. Words said are held there, as for any plan waiting.
   * @param {Run} r
   * @param {string} [text]
   */
  const planToChat = (r, text = '') => {
    r.plan = null
    r.question = null
    set({ plan: false })
    if (text !== '') {
      r.held = text
      set({ words: text, sendAt: null })
    }
    reviewPlan(r)
    return true
  }

  /**
   * The person's finished phrase while a plan read out waits on them (council 19/10/2026, A6): the whole
   * phrase approving it, a change to it, or anything else — the chat. The pending review is read again
   * first: the same call, the same text that was read, still the only plan waiting. A change with
   * nothing to change ("sửa kế hoạch", "change the plan to"; D4) keeps the plan waiting and asks what to
   * change; the phrase that follows is that change, in the person's own words.
   * @param {Run} r
   * @param {string} text
   * @param {{ final: boolean, over: boolean }} how - `final`: confirmed words of a listening turn;
   *   `over`: the phrase began over Tracy's voice
   */
  const answerPlan = async (r, text, { final, over }) => {
    const plan = /** @type {NonNullable<Run['plan']>} */ (r.plan)
    const found = planByVoice(r, windowPlan(r))
    if (found === null || found.pending.callId !== plan.callId) return planToChat(r, text)
    // The plan is not the one read: read again, and nothing is approved on the older reading.
    if (planHash(found.pending.plan) !== plan.hash) {
      readPlan(r, found, true)
      return true
    }
    const locales = planLocales()
    const approving = isPlanApproval(text, locales)
    const change = approving ? null : planChange(text, locales)
    // Asked what to change: the words that come next are the change — never a stop, or only listening.
    const told = plan.what && change === null && !approving && !isStopCommand(text) && !isBackchannel(text)
    const feedback = change === 'feedback' || told
    if (!approving && !feedback && change !== 'what') return planToChat(r, text)
    // Begun over Tracy's voice or right after it, a change heard may be its own line coming back.
    if (!approving && (told || change === 'what') && begunOverTracy(r, over)) {
      flush(r)
      return true
    }
    if (approving) {
      if (!final) return planToChat(r, text)
      // Not heard to its end yet (talked over, paused): read once more, then the chat.
      if (!plan.read) {
        if (plan.rereads < 1) readPlan(r, found)
        else planToChat(r, text)
        return true
      }
      // Begun over Tracy's voice or right after it: maybe its own reading coming back (it says the
      // phrase). Not taken; it asks once more after a silence (`armReprompt`).
      if (begunOverTracy(r, over)) {
        flush(r)
        return true
      }
    }
    const { pending } = found
    if (!approving && pending.decline === null) return planToChat(r, text)
    if (change === 'what') return askPlanChange(r, plan)
    const answer = approving
      ? { answers: [{ id: pending.questionId, selected: [pending.approve] }] }
      : {
          answers: [
            { id: pending.questionId, selected: [/** @type {string} */ (pending.decline)], custom: text }
          ]
        }
    // Let go before the answer is awaited: a phrase heard meanwhile can never answer the card twice.
    r.plan = null
    r.question = null
    set({ plan: false })
    const answered = await pending.answer(answer).then(
      () => true,
      () => false
    )
    if (run !== r) return
    if (!answered) return planToChat(r, text)
    r.replyAsked = false
    set({ notice: null })
    offerAck(r, deps.phrase(approving ? 'voiceMode.say.planApproved' : 'voiceMode.say.planFeedback'))
    return true
  }

  /**
   * "Sửa kế hoạch" with nothing after it: an empty change is no change, so the plan keeps waiting and
   * Tracy asks what to change (council 20/10/2026, D4); asked once more after a silence (`armReprompt`).
   * @param {Run} r
   * @param {NonNullable<Run['plan']>} plan
   */
  const askPlanChange = (r, plan) => {
    const line = deps.phrase('voiceMode.say.planWhat')
    if (r.out.off || state.phase !== 'on' || line === '') return planToChat(r)
    plan.what = true
    r.question = { text: line, again: false }
    r.out.ack = line
    r.out.ackTraced = false
    flush(r)
    return true
  }

  // ---- following the conversation -----------------------------------------------------------

  /** @param {Run} r */
  const followTurns = (r) => {
    const source = deps.events(r.id)
    const from = followFrom(source?.getSnapshot()?.entries)
    /** @type {NonNullable<Run['follow']>} */
    const follow = {
      stop: () => {},
      after: from.after,
      followed: new Set(from.running === null ? [] : [from.running]),
      records: new Map()
    }
    r.follow = follow
    if (!source) return
    /** Times the page asked dsh whether a plan the window shows is waiting on the person. */
    let planTries = 0
    const check = () => {
      if (run !== r) return
      const snapshot = source.getSnapshot()
      for (const turn of startedIn(snapshot?.change)) follow.followed.add(turn)
      let tracy = /** @type {Tracy} */ ('idle')
      /** @type {number | null} */
      let working = null
      /** Whether any turn followed waits on a plan's review now. */
      let reviewingNow = false
      for (const turn of turnsOf(snapshot?.entries)) {
        const ours = follow.followed.has(turn.turn) || (follow.after !== null && turn.turn > follow.after)
        if (!ours) continue
        follow.followed.add(turn.turn)
        let rec = follow.records.get(turn.turn)
        if (!rec) {
          rec = { seen: 0, said: 0, asked: null, card: null, planned: null, done: false, muted: false }
          follow.records.set(turn.turn, rec)
        }
        if (rec.done) continue
        // A plan presented for review: dsh is asked to be sure it waits on the person (the window's
        // call alone is not proof — council 18/10/2026), a few times while the window runs ahead. Each
        // presentation once, by its calls: a plan revised after feedback is a new call, read anew.
        const planKey = turn.planIds.join('\n')
        if (turn.reviewing) reviewingNow = true
        if (turn.reviewing && rec.planned !== planKey) {
          if (deps.planReview?.(r.id)) {
            rec.planned = planKey
            offerPlan(r, turn)
          } else if (planTries < PLAN_TRIES) {
            planTries += 1
            cancel(r.planTimer)
            r.planTimer = later(() => {
              r.planTimer = null
              check()
            }, PLAN_RETRY_MS)
          }
        }
        if (!turn.ended) {
          tracy = turn.asking !== null || (rec.planned !== null && turn.reviewing) ? 'asking' : 'working'
          working = turn.turn
        }
        const fresh = turn.steps.slice(Math.min(rec.seen, turn.steps.length))
        rec.seen = turn.steps.length
        // Each card once, by the call that asked it: a turn can ask a second card after the first is
        // answered, and that one is read too (it was left silent, behind the Voice view).
        const card = turn.asking === null ? null : (turn.askingId ?? turn.asking)
        // The card waiting now: a question line of a card answered before it was said is not said.
        rec.card = card
        if (card !== null && rec.asked !== card) {
          rec.asked = card
          // Asked out loud, with its choices, as a person would ask it.
          const question = firstSentence(turn.asking, 200)
          const language = deps.languageOf(question === '' ? turn.choices.join(' ') : question, r.id)
          const line = askedLine(deps.phrase('voiceMode.say.asking'), question, turn.choices, language)
          r.question = { text: line, again: false, card: true, heard: false }
          offerProgress(r, line, { now: true, turn: turn.turn, card })
        } else if (fresh.length > 0 && !rec.muted && rec.said < PROGRESS_MAX && !turn.ended) {
          const said = [...fresh].reverse().find((step) => step.kind === 'said')
          const line =
            said?.kind === 'said'
              ? firstSentence(said.text)
              : wording(WORK_LINE[/** @type {any} */ (fresh.at(-1)).work] ?? WORK_LINE.other)
          if (line !== '') offerProgress(r, line, { turn: turn.turn, fixed: said === undefined })
        }
        if (turn.ended) {
          rec.done = true
          // A turn that failed with nothing written is said, never left silent; one the person stopped
          // ('aborted') stays quiet.
          // Cut off by a dsh restart (`interrupted`: a crash-orphaned turn closed afterwards): its last
          // words are a step, not an answer — the failure is said, never that step.
          const failed =
            turn.reason === 'interrupted' || (turn.reply.trim() === '' && FAILED_ENDS.has(turn.reason ?? ''))
          // The traced turn's reply is a failure; or the work was stopped, and nothing will be heard.
          const traced = r.trace !== null && r.trace.sent !== null ? r.trace : null
          if (traced !== null && failed) traced.error = true
          if (traced !== null && turn.reason === 'aborted') closeTrace(r, true)
          // Stopped by the person: what it last wrote may be a step, not an answer — nothing is read.
          if (turn.reason !== 'aborted')
            offerReply(r, failed ? deps.phrase('voiceMode.say.failed') : turn.reply)
        }
      }
      r.workingTurn = working
      // The plan read for review was answered or let go elsewhere (the turn ended, a card on screen):
      // nothing waits on a spoken approval any more.
      if (!reviewingNow && r.plan !== null) {
        r.plan = null
        if (r.question?.text === deps.phrase('voiceMode.say.planAsk')) r.question = null
        set({ plan: false })
      }
      const was = state.tracy
      if (was !== tracy) set({ tracy })
      if (tracy === 'idle') armIdle(r)
      if (tracy !== 'working') {
        cancel(r.stillTimer)
        r.stillTimer = null
      } else if (was !== 'working' || r.stillTimer === null) armStill(r)
    }
    follow.stop = source.subscribe(check)
    check()
  }

  /**
   * Tracy working and nothing said for {@link STILL_MS}: it says it is still on it, as a person on a
   * call would — not when the person stopped its talking, nor past the turn's lines.
   * @param {Run} r
   * @param {number} [ms]
   */
  const armStill = (r, ms = STILL_MS) => {
    cancel(r.stillTimer)
    r.stillTimer = later(() => {
      r.stillTimer = null
      if (run !== r || state.phase !== 'on' || state.tracy !== 'working') return
      const busy = state.talking !== null || state.words !== '' || r.partial !== '' || r.out.progress !== null
      const quietFor = now() - r.out.lastEnd
      if (busy || quietFor < STILL_MS) return armStill(r, busy ? STILL_MS : STILL_MS - quietFor)
      const turn = r.workingTurn
      const rec = turn === null ? undefined : r.follow?.records.get(turn)
      if (turn === null || !rec || rec.muted || rec.done || rec.said >= PROGRESS_MAX) return
      offerProgress(r, wording(WORK_LINE.other), { now: true, turn, fixed: true })
    }, ms)
  }

  // ---- saying -------------------------------------------------------------------------------

  /**
   * A line while Tracy works: said now, after the line playing, or not at all when a newer one comes
   * first. A line of a turn already over is never said.
   * @param {Run} r
   * @param {string} text
   * @param {{ now?: boolean, turn?: number, fixed?: boolean, again?: boolean, card?: string | null }} [how] -
   *   `now`: past the gap; `fixed`: a phrase of the interface, whose sound is kept for the page once
   *   read; `again`: the line that waited behind another, offered once more (counted when it was first
   *   offered); `card`: the question card the line asks, said only while that card still waits
   */
  const offerProgress = (r, text, how = {}) => {
    if (r.out.off || text === '' || state.phase !== 'on' || r.leaving) return
    if (r.out.kind === 'reply' || r.out.replies.length > 0) return
    const rec = how.turn === undefined ? undefined : r.follow?.records.get(how.turn)
    if (rec && how.again !== true) rec.said += 1
    // `now` is kept with the line: a question that waited behind another line is asked as soon as that
    // one ends, not a gap later (it waited six seconds).
    r.out.progress = {
      text,
      turn: how.turn ?? null,
      fixed: how.fixed === true,
      now: how.now === true,
      card: how.card ?? null
    }
    cancel(r.out.flushTimer)
    r.out.flushTimer = null
    if (r.out.kind !== null) return
    const wait = how.now ? 0 : r.out.lastEnd + PROGRESS_GAP_MS - now()
    if (wait <= 0) return flush(r)
    r.out.flushTimer = later(() => flush(r), wait)
  }

  /** @param {Run} r @param {string} reply */
  const offerReply = (r, reply) => {
    if (r.leaving) return
    // A reply that asks something: the "okay" said next is the answer.
    r.replyAsked = /[?？]/u.test(reply)
    const asked = closingQuestion(reply)
    r.question = asked === '' ? null : { text: asked, again: false }
    r.out.progress = null
    cancel(r.out.flushTimer)
    r.out.flushTimer = null
    // The traced turn's reply, once it was sent: none to read (no reading left today) ends its trace.
    const traced = r.trace !== null && r.trace.sent !== null && r.trace.replyLine === null ? r.trace : null
    if (r.out.off || state.phase !== 'on') {
      if (traced !== null) {
        traced.error = r.out.off
        closeTrace(r, true)
      }
      return
    }
    const line = spokenReply(
      reply,
      Math.min(REPLY_CHARS, deps.limits().maxChars),
      deps.phrase('voiceMode.say.rest')
    )
    if (line === '') {
      if (traced !== null) closeTrace(r)
      return
    }
    if (traced !== null) traced.replyLine = line
    r.out.replies.push(line)
    // A line of this turn's work still playing ends first; the reply follows it.
    flush(r)
  }

  /**
   * Say what waits: a reply first, else the newest line. Never over the person: words heard and not
   * sent yet go first (`sendWords` calls this again).
   * @param {Run} r
   */
  const flush = (r) => {
    if (run !== r || r.out.kind !== null || state.phase !== 'on') return
    // Words on screen are the person's turn — unless held by the Stop: those wait for a press, and
    // Tracy says the work stopped meanwhile.
    // Held words wait for a press, not for Tracy: they never hold its lines back.
    const shownHeld = r.held !== null && state.words === r.held
    if ((state.words !== '' && !heldByStop(r) && !shownHeld) || r.partial !== '') return
    // The person is speaking and the service has no word of it yet: Tracy waits for them.
    if (r.link && now() - r.spokeAt < SPEAKING_MS) {
      cancel(r.out.flushTimer)
      r.out.flushTimer = later(() => {
        r.out.flushTimer = null
        flush(r)
      }, SPEAKING_MS)
      return
    }
    const reply = r.out.replies.shift()
    if (reply !== undefined) return void play(r, reply, 'reply', false)
    const ack = r.out.ack
    const ackTraced = r.out.ackTraced
    r.out.ack = null
    r.out.ackTraced = false
    if (ack !== null) return void play(r, ack, 'progress', true, ackTraced)
    const line = r.out.progress
    r.out.progress = null
    if (line === null) return
    const rec = line.turn === null ? undefined : r.follow?.records.get(line.turn)
    if (rec?.done) return
    if (line.card !== null && rec?.card !== line.card) return
    void play(r, line.text, 'progress', line.fixed)
  }

  /**
   * @param {Run} r
   * @param {string} text
   * @param {'progress' | 'reply'} kind
   * @param {boolean} keep - a fixed phrase: its sound is kept for the page and played again from here
   * @param {boolean} [ackTraced] - the "got it" of the traced turn
   */
  const play = async (r, text, kind, keep, ackTraced = false) => {
    const abort = new AbortController()
    r.out.abort = abort
    r.out.kind = kind
    // The traced turn's marks: when its "got it" and its reply start to be heard (the player's own
    // estimate of the first sound, on the page's clock). A reply waiting before the words went is
    // never taken for theirs (`replyLine`, set in `offerReply`).
    const traced = r.trace
    const tracedReply = kind === 'reply' && traced !== null && traced.replyLine === text ? traced : null
    let cached = false
    /** Played to its end, not stopped: a plan's reading counts as heard only then. */
    let heard = false
    /** @param {number} at */
    const started = (at) => {
      if (ackTraced && traced !== null && r.trace === traced && traced.ack === null) {
        traced.ack = at
        traced.ackCached = cached
      }
      if (tracedReply !== null && r.trace === tracedReply && tracedReply.reply === null) {
        tracedReply.reply = at
        closeTrace(r)
      }
    }
    // An open voice session with nothing in it is let go while Tracy talks (its minutes are counted);
    // speech over Tracy opens another (`onFrame`).
    if (r.link && unsent(r) === '') dropHearing(r)
    set({ talking: kind, saying: text })
    const key = `${deps.limits().cacheKey ?? ''}\n${state.voice}\n${text}`
    try {
      let sound = keep ? r.cache.get(key) : undefined
      cached = sound !== undefined
      if (sound === undefined) {
        const language = keep ? deps.uiLanguage() : deps.languageOf(text, r.id)
        const res = await deps.speak(text, { voice: state.voice, language, signal: abort.signal })
        if (!res.ok || !res.body) {
          const code = await res
            .json()
            .then((b) => (typeof b?.code === 'string' ? b.code : ''))
            .catch(() => '')
          if (code === 'VOICE_RESTART_REQUIRED') {
            // Leaving by voice: the chat comes back all the same.
            const leaving = r.leaveAfter !== null && text === r.leaveAfter
            if (tracedReply !== null) tracedReply.error = true
            end()
            set({ notice: { key: 'voiceMode.end.configChanged' } })
            deps.onRestartRequired?.()
            if (leaving) deps.showChat?.(r.id)
            return
          }
          if (tracedReply !== null) tracedReply.error = true
          // Out of characters for today, or voice turned off: no more reading this time.
          if (code === 'SPEAK_QUOTA' || code === 'VOICE_OFF') r.out.off = true
          if (kind === 'reply' || r.out.off)
            set({
              notice: { key: code === 'SPEAK_QUOTA' ? 'voiceMode.reading.quota' : 'voiceMode.reading.failed' }
            })
          return
        }
        if (abort.signal.aborted || run !== r || r.out.abort !== abort) {
          await res.body.cancel().catch(() => {})
          return
        }
        if (!keep) {
          await r.player.play(res.body, deps.limits().sampleRate, started)
          heard = !abort.signal.aborted
          return
        }
        sound = await res.arrayBuffer()
        r.cache.set(key, sound)
      }
      if (abort.signal.aborted) return
      await r.player.play(new Blob([sound]).stream(), deps.limits().sampleRate, started)
      heard = !abort.signal.aborted
    } catch {
      // Let go (Stop speaking, End) or the connection broke: the chat holds the words either way.
    } finally {
      // The traced reply never started to be heard (failed, talked over, let go): the turn is done with.
      if (run === r && tracedReply !== null && r.trace === tracedReply && tracedReply.reply === null)
        closeTrace(r, true)
      if (run === r && r.out.abort === abort) {
        r.out.abort = null
        r.out.kind = null
        r.out.lastEnd = now()
        r.out.recent = [
          ...r.out.recent.filter((line) => now() - line.at < ECHO_MS).slice(-2),
          { text, at: now() }
        ]
        r.heardAt = now()
        cancel(r.duckTimer)
        r.duckTimer = null
        r.player.duck?.(false)
        set({ talking: null, saying: '' })
        armIdle(r)
        // The plan's reading: heard to its end, an approval may follow; not read out at all (the
        // reading failed, not the person stopping it), the chat, where the card is.
        const planLine = r.plan !== null && text === r.plan.line ? r.plan : null
        if (planLine !== null && heard) planLine.read = true
        // (What follows then finds the chat's line waiting, and leaves it to play.)
        if (planLine !== null && !heard && !abort.signal.aborted) planToChat(r)
        if (state.tracy === 'working') armStill(r)
        // A card's reading heard to its end: only a phrase begun after it may answer a confirmation card.
        if (r.question !== null && heard && text.includes(r.question.text)) r.question.heard = true
        if (r.question !== null && !r.question.again && text.includes(r.question.text)) armReprompt(r)
        // The plan line said: the conversation goes to the chat, where the review is.
        if (r.leaveAfter !== null && text === r.leaveAfter) {
          r.leaveAfter = null
          deps.showChat?.(r.id)
        } else if (r.out.replies.length > 0 || r.out.ack !== null) flush(r)
        else if (r.out.progress !== null) {
          const waiting = r.out.progress
          r.out.progress = null
          offerProgress(r, waiting.text, {
            fixed: waiting.fixed,
            now: waiting.now,
            again: true,
            card: waiting.card,
            ...(waiting.turn === null ? {} : { turn: waiting.turn })
          })
        }
      }
    }
  }

  /**
   * Stop speaking: what plays stops. Pressed (`mute`), nothing more of this turn's work is said; talked
   * over, Tracy goes on telling its work once it has heard the person. A reply waiting behind a line of
   * the work that was talked over is kept: read once the person's words are dealt with (council
   * 18/10/2026; it was lost, with the question it asked) — dropped only when pressed, when the reply
   * itself is talked over (heard in part, the rest is in the chat), or by a spoken stop.
   * @param {Run} r
   * @param {boolean} [mute]
   */
  const stopTalking = (r, mute = true) => {
    r.out.progress = null
    r.out.ack = null
    if (mute || r.out.kind === 'reply') r.out.replies = []
    cancel(r.out.flushTimer)
    r.out.flushTimer = null
    // Every turn still running stays quiet until its reply.
    if (mute && r.out.kind === 'progress')
      for (const rec of r.follow?.records.values() ?? []) if (!rec.done) rec.muted = true
    r.out.abort?.abort()
    r.player.stop()
  }

  // ---- pausing and ending -------------------------------------------------------------------

  /** @param {Run} r */
  const armIdle = (r) => {
    cancel(r.idleTimer)
    r.idleTimer = later(() => {
      if (run !== r || state.phase !== 'on') return
      if (r.link || state.talking !== null || state.tracy !== 'idle') return armIdle(r)
      if (now() - r.heardAt < IDLE_MS) return armIdle(r)
      pause({ key: 'voiceMode.end.idle', params: { minutes: Math.round(IDLE_MS / 60_000) } })
    }, IDLE_MS)
  }

  /** Close the ear and the voice; the turns are still followed, but nothing is said. @param {Notice | null} notice */
  const pause = (notice) => {
    const r = run
    if (!r || state.phase === 'paused' || state.phase === 'off') return
    // Paused, the reply of a traced turn is not heard: it is let go as cut off.
    closeTrace(r, true)
    dropHearing(r)
    stopTalking(r)
    cancel(r.idleTimer)
    cancel(r.stillTimer)
    r.stillTimer = null
    cancel(r.repromptTimer)
    r.repromptTimer = null
    // Paused before the microphone closes: closing hands over its last frame, which must not open a
    // voice session (and send its words) while the conversation shows paused.
    set({ phase: 'paused', notice, hearing: false, words: '', sendAt: null, talking: null, saying: '' })
    const mic = r.mic
    r.mic = null
    void mic?.close()
  }

  const end = () => {
    const r = run
    if (!r) return
    closeTrace(r, true)
    run = null
    cancel(r.sendTimer)
    cancel(r.quietTimer)
    cancel(r.stuckTimer)
    cancel(r.duckTimer)
    cancel(r.idleTimer)
    cancel(r.stillTimer)
    cancel(r.repromptTimer)
    cancel(r.planTimer)
    cancel(r.out.flushTimer)
    r.link?.close()
    r.out.abort?.abort()
    r.follow?.stop()
    r.release()
    void r.mic?.close()
    void r.player.close()
    set({ ...OFF, voice: state.voice })
  }

  return {
    getSnapshot: () => state,
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /**
     * Start a voice conversation in `sessionId`, inside the person's press (the player's audio is
     * made here: a browser plays sound only from a press).
     * @param {string} sessionId
     */
    start(sessionId) {
      if (run?.id === sessionId && state.phase !== 'off') return
      end()
      /** @type {Run} */
      const r = {
        id: sessionId,
        player: deps.openPlayer(),
        mic: null,
        release: () => {},
        ring: [],
        loud: 0,
        link: null,
        linkOpened: 0,
        lastWords: 0,
        committed: [],
        partial: '',
        sentPhrases: 0,
        sendTimer: null,
        quietTimer: null,
        stuckTimer: null,
        idleTimer: null,
        heardAt: now(),
        micLevel: 0,
        duckTimer: null,
        spokeAt: 0,
        voiceStartedAt: 0,
        stoppedAt: 0,
        levels: [],
        voiceOver: null,
        phrase: null,
        held: null,
        sendPressed: false,
        leaveAfter: null,
        planTimer: null,
        stillTimer: null,
        workingTurn: null,
        replyAsked: false,
        question: null,
        plan: null,
        repromptTimer: null,
        networkDropAt: 0,
        spokeMono: 0,
        commitsSeen: 0,
        commitMono: null,
        commitSpeechEnd: null,
        trace: null,
        leaving: false,
        switching: false,
        switchAgain: false,
        follow: null,
        out: {
          abort: null,
          kind: null,
          ack: null,
          ackTraced: false,
          progress: null,
          replies: [],
          lastEnd: 0,
          flushTimer: null,
          recent: [],
          off: false
        },
        cache: sounds
      }
      run = r
      // One voice on the page: dictation pressed elsewhere pauses this, and this ends a dictation.
      r.release = deps.claim(() => {
        if (run === r) pause(null)
      })
      set({ sessionId, phase: 'starting', notice: null, tracy: 'idle', voice: storedVoice() })
      followTurns(r)
      void openEar(r)
    },
    end,
    /** Talk again after a pause. */
    resume() {
      const r = run
      if (!r || state.phase !== 'paused') return
      r.out.off = false
      r.release()
      r.release = deps.claim(() => {
        if (run === r) pause(null)
      })
      void openEar(r)
    },
    pause: () => pause(null),
    /** Hidden page: the microphone and the voice stop until the person comes back and presses Talk. */
    hidden() {
      if (run && state.phase === 'on') pause({ key: 'voiceMode.end.hidden' })
    },
    sendNow() {
      if (run) sendNow(run)
    },
    /** Only this explicit press may submit uncertain words retained after a failed stream. */
    sendHeldWords() {
      if (!run || run.link || state.words !== '' || state.heldWords === '') return
      const r = run
      const words = state.heldWords
      set({ heldWords: '' })
      void sendWords(r, words, { pressed: true }).then((sent) => {
        if (sent !== true && run === r)
          set({ heldWords: [words, state.heldWords].filter(Boolean).join('\n') })
      })
    },
    dropHeldWords() {
      set({ heldWords: '' })
    },
    /** Say it again: the words heard, and any held by the Stop, are dropped; the ear listens anew. */
    dropWords() {
      if (!run) return
      run.held = null
      dropHearing(run)
    },
    stopTalking() {
      if (run) stopTalking(run)
    },
    /** Stop Tracy's work (the footer's Stop): as dsh's Stop button, which Voice's footer replaces. */
    stopWork() {
      if (run) void stopWork(run)
    },
    /** The microphone picked in the menu changed (`voice-mic.mjs`): while listening, capture restarts once on it. */
    switchMic() {
      if (run) void switchMic(run)
    },
    /** @param {string} id */
    setVoice(id) {
      if (!voices().some((v) => v.id === id)) return
      deps.writeVoice?.(id)
      set({ voice: id })
    },
    /** How loud it is now, 0…1: the person while hearing, Tracy while talking. Read on a timer. */
    level() {
      const r = run
      if (!r) return 0
      if (state.talking !== null) return r.player.level()
      const level = r.micLevel
      r.micLevel = 0
      return level
    }
  }
}

/** @typedef {ReturnType<typeof createVoiceMode>} VoiceMode */
