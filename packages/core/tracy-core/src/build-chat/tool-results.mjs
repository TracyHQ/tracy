/**
 * The build chat's real tool results as data (TracyHQ/tracy#609).
 *
 * `tracy_build` (the host half of `@tracy/dsh-build-chat`) answers the model with one JSON text block per call. The
 * cards read the same answers back out of the session log: which templates were offered, which plan revision is the
 * living one, and what one tool row may say in plain words. Pure on purpose: no React, no DOM, no dsh import; the
 * events are duck-typed as dsh's session log writes them (`tool/call` with `name`, `callId`, `arguments`;
 * `tool/result` with `message.source.callId`, `message.content`, `message.isError`).
 */
import { PLAN_REVIEW_ID, planOfReviewId } from './plan.mjs'

/** The wire name of the engine tool. */
export const BUILD_TOOL = 'tracy_build'

/** @param {unknown} value */
const isObject = (value) => value !== null && typeof value === 'object'

/** @param {unknown} raw - parsed arguments, or the JSON string dsh records */
function argsOf(raw) {
  if (isObject(raw)) return raw
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The note of a change request answer (`revision: {changed, notDone}`): the lines the plan step wrote, strings only.
 * Null when the answer has none (a compose or an edit) or the shape is not this one.
 * @param {unknown} value
 * @returns {null | { changed: string[], notDone: { what: string, why: string }[] }}
 */
function revisedOf(value) {
  if (!isObject(value)) return null
  const changed = (Array.isArray(value.changed) ? value.changed : []).filter((x) => typeof x === 'string')
  const notDone = (Array.isArray(value.notDone) ? value.notDone : [])
    .filter((e) => typeof e?.what === 'string' && typeof e?.why === 'string')
    .map((e) => ({ what: e.what, why: e.why }))
  return { changed, notDone }
}

/**
 * What one `tracy_build` answer is, told apart by its shape (a `status` call can answer any of them).
 * @param {unknown} text - the result's JSON text
 * @returns {null | { kind: 'research', business: string }
 *   | { kind: 'templates', options: any[], none: boolean }
 *   | { kind: 'plan', id: string, revision: number, revised?: { changed: string[], notDone: { what: string, why: string }[] } }
 *   | { kind: 'stopped', step?: string, rerun: boolean }
 *   | { kind: 'running' | 'quiet' }}
 */
export function buildToolResultOf(text) {
  let value
  try {
    value = typeof text === 'string' ? JSON.parse(text) : null
  } catch {
    return null
  }
  if (!isObject(value)) return null
  if (value.stopped === true)
    return {
      kind: 'stopped',
      ...(typeof value.step === 'string' ? { step: value.step } : {}),
      rerun: value.rerun === true
    }
  if (value.running === true) return { kind: 'running' }
  // Answers meant only for the model: a refusal, a stale plan, nothing started, a step not taken yet, the brand step
  // done and the plan to be asked for again.
  if (
    value.refused === true ||
    value.stale === true ||
    value.idle === true ||
    typeof value.missing === 'string' ||
    value.look === 'ready'
  )
    return { kind: 'quiet' }
  if (isObject(value.plan)) {
    const { id, revision } = value.plan
    if (typeof id !== 'string' || !Number.isInteger(revision)) return null
    const revised = revisedOf(value.revision)
    return revised ? { kind: 'plan', id, revision, revised } : { kind: 'plan', id, revision }
  }
  if (Array.isArray(value.options))
    return { kind: 'templates', options: value.options, none: value.none === true }
  if (isObject(value.profile))
    return {
      kind: 'research',
      business: typeof value.profile.business === 'string' ? value.profile.business : ''
    }
  return null
}

/**
 * The quiet row that stands for one `tracy_build` call in the conversation: what happened, never the JSON. Null for
 * an answer meant only for the model (refused, stale, idle) or one this module cannot read.
 * @param {unknown} rawArgs - the call's arguments
 * @param {string | null} text - the result's JSON text; null while the call runs
 * @returns {null | { kind: 'research', sources: number, business: string } | { kind: 'working', step: string }
 *   | { kind: 'templates' | 'plan' | 'edit' | 'stopped' }}
 */
export function buildToolRowOf(rawArgs, text) {
  const args = argsOf(rawArgs)
  const step = typeof args.action === 'string' ? args.action : 'status'
  if (text === null) return { kind: 'working', step }
  const result = buildToolResultOf(text)
  if (result === null || result.kind === 'quiet') return null
  if (result.kind === 'running') return { kind: 'working', step }
  if (result.kind === 'stopped') return { kind: 'stopped' }
  if (result.kind === 'templates') return { kind: 'templates' }
  if (result.kind === 'plan') return { kind: step === 'edit' ? 'edit' : 'plan' }
  const links = step === 'research' && Array.isArray(args.links) ? args.links : []
  return { kind: 'research', sources: links.length, business: result.business }
}

/**
 * @typedef {{ turn: number, seq: number, options: any[], none: boolean }} TemplatesSeen
 * @typedef {{ turn: number, seq: number, id: string, revision: number,
 *   revised?: { changed: string[], notDone: { what: string, why: string }[] } }} PlanSeen
 * @typedef {{ turn: number, seq: number, step: string }} WorkingSeen
 * @typedef {{ turn: number, seq: number, step: string, rerun: boolean, retries: number }} StopSeen
 * @typedef {{ turn: number, seq: number, callId: string }} BuildAskSeen
 * @typedef {{ calls: Readonly<Record<string, string>>, templates: TemplatesSeen | null, plan: PlanSeen | null,
 *   working: WorkingSeen | null, stop: StopSeen | null, streak: { step: string, count: number } | null,
 *   build: BuildAskSeen | null,
 *   edits?: Readonly<Record<string, { field: string, value: string | number }[]>> }} BuildToolFold
 */

/** @type {BuildToolFold} */
const EMPTY = Object.freeze({
  calls: Object.freeze({}),
  templates: null,
  plan: null,
  working: null,
  stop: null,
  streak: null,
  build: null
})

/**
 * The one fixed message the Try again button sends as the owner. The persona and the tool's private guidance name it,
 * so the agent calls the tool again once when it arrives. Plain English whatever the owner's language: it is read by
 * the agent, never shown as a UI string.
 */
export const RETRY_MESSAGE = 'Please try again.'

/** How many times the owner may press Try again for the same step in a row before only the sentence stays. */
export const MAX_STEP_RETRIES = 2

/**
 * Whether the owner is offered Try again for this stop: the engine said the step may be rerun, and fewer than
 * `MAX_STEP_RETRIES` retries of the same step in a row have stopped again.
 * @param {StopSeen | null | undefined} stop
 */
export const canRetryStop = (stop) => stop?.rerun === true && stop.retries < MAX_STEP_RETRIES

/** @param {any} content */
const textOf = (content) =>
  (Array.isArray(content) ? content : []).find((b) => b?.type === 'text' && typeof b.text === 'string')
    ?.text ?? null

/**
 * Fold one session event into what the session's `tracy_build` calls showed so far: the latest templates offered
 * and the latest plan revision, each with the turn it arrived in. An error, a replaced result (history rewritten)
 * and a stop leave both as they were. `working` is the latest call while it waits: not answered yet, or answered
 * `running` (a long step the agent keeps waiting on with `status`); any other answer, an error included, ends it.
 * `build` is the latest call that asked for the build.
 * Used as the State of a conversation node definition.
 * @param {BuildToolFold | undefined} state
 * @param {any} event
 * @returns {BuildToolFold}
 */
export function buildToolFoldOf(state = EMPTY, event) {
  const data = event?.data
  if (event?.type === 'tool/call' && data?.name === BUILD_TOOL && typeof data.callId === 'string') {
    const turn = Number(data.turn)
    const step = argsOf(data.arguments).action
    const working =
      Number.isSafeInteger(turn) && turn >= 0
        ? { turn, seq: Number(event.seq), step: typeof step === 'string' ? step : 'status' }
        : (state.working ?? null)
    // The call is remembered with its action, so a stopped answer without a step names the step that was asked.
    const action = typeof step === 'string' ? step : 'status'
    // The latest build call: the build run feed reads again from it, also after a stopped outcome.
    const build =
      action === 'build'
        ? { turn: Number.isSafeInteger(turn) ? turn : -1, seq: Number(event.seq), callId: data.callId }
        : (state.build ?? null)
    // What an `edit` call asked to change: its answer names only the plan revision, so the note comes from here.
    const asked = action === 'edit' ? editsOf(argsOf(data.arguments).changes) : []
    const edits = asked.length > 0 ? { ...state.edits, [data.callId]: asked } : state.edits
    return {
      ...state,
      calls: { ...state.calls, [data.callId]: action },
      ...(edits ? { edits } : {}),
      working,
      stop: null,
      build
    }
  }
  if (event?.type !== 'tool/result' || event.surfaceOp !== 'append') return state
  const message = data?.message
  const callId = message?.source?.callId
  if (typeof callId !== 'string' || !Object.hasOwn(state.calls, callId)) return state
  if (message?.isError === true) return state.working ? { ...state, working: null } : state
  const result = buildToolResultOf(textOf(message.content))
  if (result?.kind !== 'running' && (state.working ?? null) !== null) state = { ...state, working: null }
  const turn = Number(data.turn)
  const seq = Number(event.seq)
  if (!Number.isSafeInteger(turn) || turn < 0) return state
  if (result?.kind === 'stopped') {
    const step = result.step ?? state.calls[callId]
    const count = state.streak?.step === step ? state.streak.count + 1 : 1
    return {
      ...state,
      streak: { step, count },
      stop: { turn, seq, step, rerun: result.rerun, retries: count - 1 }
    }
  }
  // Any answer that moves the build on ends the run of stops; guidance for the model and unreadable answers do not.
  if (result !== null && result.kind !== 'running' && result.kind !== 'quiet' && state.streak !== null)
    state = { ...state, streak: null, stop: null }
  if (result?.kind === 'templates')
    return { ...state, templates: { turn, seq, options: result.options, none: result.none } }
  if (result?.kind === 'plan') {
    // An edit the agent made answers with a new revision only: its note says which values it changed.
    const edits = state.calls[callId] === 'edit' ? (state.edits?.[callId] ?? []) : []
    const revised = result.revised ?? (edits.length > 0 ? { changed: [], notDone: [], edits } : undefined)
    return {
      ...state,
      plan: {
        turn,
        seq,
        id: result.id,
        revision: result.revision,
        ...(revised ? { revised } : {})
      }
    }
  }
  return state
}

/**
 * The changes of an `edit` call as the note keeps them: a field path and a text or number value each, at most ten.
 * @param {unknown} changes
 * @returns {{ field: string, value: string | number }[]}
 */
function editsOf(changes) {
  return (Array.isArray(changes) ? changes : [])
    .filter(
      (c) =>
        typeof c?.field === 'string' &&
        (typeof c.value === 'string' || (typeof c.value === 'number' && Number.isFinite(c.value)))
    )
    .slice(0, 10)
    .map((c) => ({ field: c.field, value: c.value }))
}

/**
 * Whether one pending `ask_user_question` request is the plan review. dsh's question tool passes on only id,
 * question, header, options, multi-select and recommended, so `detail` and `intent` of `planReviewRequestOf` never
 * reach the browser; the id, which the tool's guard admits only as the plan review handed out with a plan, does. It
 * names the plan revision under review (`planReviewIdOf`); an id that names none is not a plan review.
 * @param {unknown} questions
 */
export function isPlanReviewRequest(questions) {
  return Array.isArray(questions) && questions.length === 1 && planOfReviewId(questions[0]?.id) !== null
}

export { PLAN_REVIEW_ID }
