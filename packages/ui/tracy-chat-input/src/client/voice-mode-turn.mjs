/**
 * The turns of the conversation on screen, as a voice conversation (`voice-mode.mjs`) follows them:
 * what Tracy says while it works, what it is doing, the question it is waiting on, and the reply it
 * ends with. Read from the session's own event window (`ctx.sessions.binding(id).eventSource`, the
 * feed `comment-status.mjs` and `voice-language.mjs` read), so every line it says comes from the
 * conversation itself — nothing is made up to fill a silence (TCH CLAUDE.md rule #3).
 *
 * A TURN is what dsh logs between `turn/start` and `turn/end`, both carrying `data.turn` (a number
 * that only grows in a session). Inside it:
 *   - `assistant/message`: a step of the model; its `text` blocks are what it wrote (its `reasoning`
 *     is never said). Words followed by a tool call are said WHILE it works ("I'll look at the home
 *     page first"); the words of the last step, with no call after them, are its REPLY;
 *   - `tool/call`: what it does now, as one of a few plain kinds ({@link workOf}) — never a tool's
 *     name, an action or an id (the plain-words rule, `tracy-site-tools` `plainReplyRule`);
 *   - dsh's question card (`ask_user_question`): the turn waits on the person until its
 *     `tool/result`; its question is said, when the call carries one.
 *
 * Kept free of the page so `test/voice-mode-turn.test.mjs` can hold it.
 */
import { choicesOf } from './voice-answer.mjs'

/** dsh's question card: the turn waits on the person until its `tool/result` (`comment-status.mjs`). */
export const QUESTION_TOOL = 'ask_user_question'
/** dsh's plan review (`@deepseek-ai/dsh-plan-mode` `EXIT_PLAN_MODE`): the turn waits on the person. */
export const PLAN_TOOL = 'exit_plan_mode'

/** The two doors that read and write a site (`comment-status.mjs` `DOORS`). */
const DOORS = new Set(['tracy_site', 'tracy_emdash'])
/** dsh's tools that write the site's files, or run a command in its folder. */
const FILE_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'multi_edit', 'bash', 'pwsh', 'shell'])
/** dsh's tools that only read. */
const READ_TOOLS = new Set(['read', 'grep', 'glob', 'ls', 'find', 'view', 'web_fetch', 'web_search'])

/**
 * @typedef {'look' | 'words' | 'design' | 'pictures' | 'files' | 'undo' | 'site' | 'other'} Work
 * @typedef {{ kind: 'said', text: string } | { kind: 'work', work: Work }} Step
 * @typedef {{
 *   turn: number,
 *   ended: boolean,
 *   reason: string | null,
 *   steps: Step[],
 *   asking: string | null,
 *   askingId: string | null,
 *   choices: string[],
 *   reviewing: boolean,
 *   planIds: string[],
 *   reply: string
 * }} Turn
 *   `asking`: the question the turn waits on ('' when the card carries none readable), null when it
 *   waits on nothing, `askingId` the call that asked it (one turn can ask card after card), `choices`
 *   its options' labels; `reviewing`: a plan it presented waits on the person's review (as the event
 *   window says — `voice-mode.mjs` asks dsh to be sure), `planIds` the plan calls still waiting, oldest
 *   first (exactly one is what Voice may take an approval for); `reply`: the words of its last step, '' while it
 *   runs or when it ended on a call; `reason`: why it ended (dsh's `TurnEndReason` kind), null while it
 *   runs.
 */

/** @param {unknown} value @returns {Record<string, any> | null} */
function objectOf(value) {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return /** @type {Record<string, any>} */ (value)
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The written words of a step's content: its `text` blocks, its `reasoning` never.
 * @param {unknown} content
 * @returns {string}
 */
export function textOf(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((block) =>
      block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : []
    )
    .join('\n')
    .trim()
}

/**
 * What a call does, in the few kinds the voice says.
 * @param {unknown} name
 * @param {unknown} rawArgs - the call's `arguments`, an object or its JSON
 * @returns {Work}
 */
export function workOf(name, rawArgs) {
  const tool = typeof name === 'string' ? name : ''
  const args = objectOf(rawArgs) ?? {}
  if (DOORS.has(tool)) {
    const action = typeof args.action === 'string' ? args.action.trim() : ''
    if (action === 'apply.revert' || action === 'look.revert') return 'undo'
    if (/^content\.(replace|update|delete|batch|create)\b/.test(action) || /contract/.test(action))
      return 'words'
    if (/^(look|design|theme|style)\./.test(action)) return 'design'
    if (action.startsWith('media.')) return 'pictures'
    if (
      /^(content|site|page|menu)\.(locate|read|list|find|inspect|search|get)\b/.test(action) ||
      action === ''
    )
      return 'look'
    return 'site'
  }
  if (FILE_TOOLS.has(tool)) return 'files'
  if (READ_TOOLS.has(tool)) return 'look'
  return 'other'
}

/**
 * The question a question card asks, as far as its arguments say it.
 * @param {unknown} rawArgs
 * @returns {string}
 */
export function questionOf(rawArgs) {
  return askedOf(rawArgs).question
}

/**
 * The first question a question card asks and its choices' labels, as far as its arguments say.
 * @param {unknown} rawArgs
 * @returns {{ question: string, choices: string[] }}
 */
export function askedOf(rawArgs) {
  const args = objectOf(rawArgs) ?? {}
  const first = Array.isArray(args.questions) ? objectOf(args.questions[0]) : null
  const options = Array.isArray(first?.options)
    ? first.options
    : Array.isArray(args.options)
      ? args.options
      : []
  return { question: firstQuestion(args, first), choices: choicesOf({ id: '', options }) }
}

/** @param {Record<string, any>} args @param {Record<string, any> | null} first */
function firstQuestion(args, first) {
  for (const candidate of [args.question, first?.question, args.prompt, args.title]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  return ''
}

/**
 * The turns in an event window, oldest first. Events before the window's first `turn/start` belong to
 * a turn whose start is not in the window, and are left out.
 * @param {readonly unknown[] | undefined} entries - dsh `SessionEventWindow.entries`
 * @returns {Turn[]}
 */
export function turnsOf(entries) {
  /** @type {Turn[]} */
  const turns = []
  if (!Array.isArray(entries)) return turns
  /** @type {(Turn & { said: string | null, asks: Map<string, { question: string, choices: string[] }>, plans: Set<string> }) | null} */
  let open = null
  /** @param {string | null} reason */
  const close = (reason) => {
    if (open === null) return
    open.ended = true
    open.reason = reason
    open.reply = open.said ?? ''
    open.asking = null
    open.askingId = null
    open.choices = []
    open.reviewing = false
    open.planIds = []
    open = null
  }
  for (const entry of entries) {
    const wrapped = /** @type {{ type?: unknown, event?: { type?: unknown, data?: any } }} */ (entry)
    if (wrapped?.type !== 'event' || !wrapped.event || typeof wrapped.event.type !== 'string') continue
    const { type } = wrapped.event
    const data = wrapped.event.data ?? {}
    if (type === 'turn/start') {
      close(null)
      if (typeof data.turn !== 'number') continue
      open = {
        turn: data.turn,
        ended: false,
        reason: null,
        steps: [],
        asking: null,
        askingId: null,
        choices: [],
        reviewing: false,
        planIds: [],
        reply: '',
        said: null,
        asks: new Map(),
        plans: new Set()
      }
      turns.push(open)
      continue
    }
    if (open === null) continue
    switch (type) {
      case 'turn/end':
        if (typeof data.turn === 'number' && data.turn !== open.turn) continue
        // dsh writes `{ kind }` (`TurnEndReason`, `dsh-session` types.ts): 'completed', 'aborted' (the
        // person stopped it), 'error', 'blocked', 'max-tokens'…; a bare string is read the same.
        close(
          typeof data.reason === 'string'
            ? data.reason
            : typeof data.reason?.kind === 'string'
              ? data.reason.kind
              : null
        )
        continue
      case 'assistant/message': {
        if (data.interrupted === true) continue
        const text = textOf(data.message?.content ?? data.content)
        if (text !== '') open.said = text
        continue
      }
      case 'tool/call': {
        if (open.said !== null) open.steps.push({ kind: 'said', text: open.said })
        open.said = null
        const callId = typeof data.callId === 'string' ? data.callId : null
        if (data.name === QUESTION_TOOL) {
          if (callId !== null) open.asks.set(callId, askedOf(data.arguments))
        } else if (data.name === PLAN_TOOL) {
          if (callId !== null) open.plans.add(callId)
        } else open.steps.push({ kind: 'work', work: workOf(data.name, data.arguments) })
        continue
      }
      case 'tool/result': {
        const callId = data.message?.toolCallId ?? data.message?.source?.callId ?? data.callId
        if (typeof callId === 'string') {
          open.asks.delete(callId)
          open.plans.delete(callId)
        }
        continue
      }
      default:
    }
  }
  for (const turn of turns) {
    const live =
      /** @type {Turn & { said?: string | null, asks?: Map<string, { question: string, choices: string[] }>, plans?: Set<string> }} */ (
        turn
      )
    turn.reviewing = !turn.ended && (live.plans?.size ?? 0) > 0
    turn.planIds = turn.ended ? [] : [...(live.plans ?? [])]
    if (!turn.ended && live.asks && live.asks.size > 0) {
      const [[id, asked]] = live.asks.entries()
      turn.asking = asked.question
      turn.askingId = id
      turn.choices = asked.choices
    }
    delete live.said
    delete live.asks
    delete live.plans
  }
  return turns
}

/**
 * The turns a voice conversation pressed on now speaks for, as far as the window says at the press:
 * the one running now (its end is still to come), and every turn after the newest one the window
 * knows. A window that knows no turn at all says `after: null`: then only a turn whose start arrives
 * in an appended change is new ({@link startedIn}) — history the window loads later never is, so an
 * old reply is never read out.
 * @param {readonly unknown[] | undefined} entries
 * @returns {{ running: number | null, after: number | null }}
 */
export function followFrom(entries) {
  const turns = turnsOf(entries)
  const last = turns.at(-1)
  let newest = null
  if (Array.isArray(entries))
    for (const entry of entries) {
      const event = /** @type {{ type?: unknown, event?: { type?: unknown, data?: any } }} */ (entry)
      const turn = event?.type === 'event' ? event.event?.data?.turn : undefined
      if (typeof turn === 'number' && (newest === null || turn > newest)) newest = turn
    }
  return { running: last !== undefined && !last.ended ? last.turn : null, after: newest }
}

/**
 * The turns an appended change starts.
 * @param {{ kind?: unknown, entries?: readonly unknown[] } | undefined} change - dsh `SessionEventChange`
 * @returns {number[]}
 */
export function startedIn(change) {
  if (change?.kind !== 'append' || !Array.isArray(change.entries)) return []
  return change.entries.flatMap((entry) => {
    const event = /** @type {{ type?: unknown, event?: { type?: unknown, data?: any } }} */ (entry)
    return event?.type === 'event' &&
      event.event?.type === 'turn/start' &&
      typeof event.event.data?.turn === 'number'
      ? [event.event.data.turn]
      : []
  })
}
