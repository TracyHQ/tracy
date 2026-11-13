/**
 * The build chat's real tool results as data (TracyHQ/tracy#609).
 *
 * `tracy_build` (the host half of `@tracy/dsh-build-chat`) answers the model with one JSON text block per call. The
 * cards read the same answers back out of the session log: which templates were offered, which plan revision is the
 * living one, and what one tool row may say in plain words. Pure on purpose: no React, no DOM, no dsh import; the
 * events are duck-typed as dsh's session log writes them (`tool/call` with `name`, `callId`, `arguments`;
 * `tool/result` with `message.source.callId`, `message.content`, `message.isError`).
 */
import { PLAN_REVIEW_ID } from './plan.mjs'

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
 * What one `tracy_build` answer is, told apart by its shape (a `status` call can answer any of them).
 * @param {unknown} text - the result's JSON text
 * @returns {null | { kind: 'research', business: string }
 *   | { kind: 'templates', options: any[], none: boolean }
 *   | { kind: 'plan', id: string, revision: number }
 *   | { kind: 'running' | 'stopped' | 'quiet' }}
 */
export function buildToolResultOf(text) {
  let value
  try {
    value = typeof text === 'string' ? JSON.parse(text) : null
  } catch {
    return null
  }
  if (!isObject(value)) return null
  if (value.stopped === true) return { kind: 'stopped' }
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
    return typeof id === 'string' && Number.isInteger(revision) ? { kind: 'plan', id, revision } : null
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
 * @typedef {{ turn: number, seq: number, id: string, revision: number }} PlanSeen
 * @typedef {{ calls: Readonly<Record<string, string>>, templates: TemplatesSeen | null, plan: PlanSeen | null }}
 *   BuildToolFold
 */

/** @type {BuildToolFold} */
const EMPTY = Object.freeze({ calls: Object.freeze({}), templates: null, plan: null })

/** @param {any} content */
const textOf = (content) =>
  (Array.isArray(content) ? content : []).find((b) => b?.type === 'text' && typeof b.text === 'string')
    ?.text ?? null

/**
 * Fold one session event into what the session's `tracy_build` calls showed so far: the latest templates offered
 * and the latest plan revision, each with the turn it arrived in. An error, a replaced result (history rewritten)
 * and a stop leave both as they were. Used as the State of a conversation node definition.
 * @param {BuildToolFold | undefined} state
 * @param {any} event
 * @returns {BuildToolFold}
 */
export function buildToolFoldOf(state = EMPTY, event) {
  const data = event?.data
  if (event?.type === 'tool/call' && data?.name === BUILD_TOOL && typeof data.callId === 'string')
    return { ...state, calls: { ...state.calls, [data.callId]: data.callId } }
  if (event?.type !== 'tool/result' || event.surfaceOp !== 'append') return state
  const message = data?.message
  const callId = message?.source?.callId
  if (typeof callId !== 'string' || !Object.hasOwn(state.calls, callId) || message?.isError === true)
    return state
  const result = buildToolResultOf(textOf(message.content))
  const turn = Number(data.turn)
  const seq = Number(event.seq)
  if (!Number.isSafeInteger(turn) || turn < 0) return state
  if (result?.kind === 'templates')
    return { ...state, templates: { turn, seq, options: result.options, none: result.none } }
  if (result?.kind === 'plan')
    return { ...state, plan: { turn, seq, id: result.id, revision: result.revision } }
  return state
}

/**
 * Whether one pending `ask_user_question` request is the plan review. dsh's question tool passes on only id,
 * question, header, options, multi-select and recommended, so `detail` and `intent` of `planReviewRequestOf` never
 * reach the browser; the id, which the tool's guard admits only as the plan review handed out with a plan, does.
 * @param {unknown} questions
 */
export function isPlanReviewRequest(questions) {
  return Array.isArray(questions) && questions.length === 1 && questions[0]?.id === PLAN_REVIEW_ID
}

export { PLAN_REVIEW_ID }
