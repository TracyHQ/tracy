/**
 * `tracy_build`, the build chat's engine tool (TracyHQ/tracy#609), and the guard on the build session's questions.
 *
 * THE TOOL ONLY FORWARDS. Every engine step (research, the needs profile, the template fit, the plan composer and its
 * rules gate, plan edits) runs in tracy-web behind the build draft doors (`doors.ts`), called as the person who typed.
 * This file holds no secret and no engine logic: it picks the door, carries the session id, waits a bounded time for
 * long work, and shapes the answer small for the model (ids, not whole documents; the cards read the plan from
 * `GET /api/build-draft`).
 *
 * THE MODEL NEVER RETYPES THE OWNER'S ANSWERS. Before each call the tool reads the `ask_user_question` replies from the
 * session's own log, turns each into a Contract B answer (`answerOf`) and stores it through the answers door.
 *
 * A FAULT NEVER BECOMES A QUESTION. Anything that is not a clean answer from a door (a stopped step, a refused or
 * missing door, tracy-web unreachable, nobody to act as, a plan without the business's own brand) comes back as
 * `{ stopped: true, say }`: one plain sentence for the owner, no `ask`, no error text, no codes. And the guard refuses
 * any `ask_user_question` of a build session whose question ids the engine did not issue for that session.
 */
import { answerOf, isBuildChatSession, planReviewRequestOf, templateChoiceOf } from '@tracy/core/build-chat'

/** How long one call waits for long engine work before it hands back `running`. */
export const BUILD_WAIT_MS = 90_000
/** How often a waiting call asks the engine door again. */
export const BUILD_POLL_MS = 2_000
/** How long one door call may take on its own (the engine work itself runs behind it, not inside it). */
export const BUILD_DOOR_TIMEOUT_MS = 30_000

/** Owner facing: said when a step could not finish and the door gave no sentence of its own. */
export const BUILD_STOPPED_SAY =
  'Your site plan could not be prepared. The Tracy team has the details and will look into it.'
/** Owner facing: said while long work is still running. */
export const BUILD_RUNNING_SAY = 'Still working on it. This can take a minute or two.'

/** The longest owner sentence passed through from a door; a longer one is replaced by ours. */
const SAY_MAX = 300

export const BUILD_DESCRIPTION =
  'tracy_build: the build chat engine. action research {links?, description?} first; templates; plan {request?} after the owner chose a template; edit {changes:[{field,value}]} for one simple change; status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. stopped: say its sentence and stop.'

export const BUILD_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['research', 'templates', 'plan', 'edit', 'status'] },
    links: {
      type: 'array',
      items: { type: 'string' },
      description: "The business's own links: website, social profiles, map listing."
    },
    description: { type: 'string', description: "The owner's own words about the business." },
    request: {
      type: 'string',
      description: "For plan: the owner's request for a larger change, in their words."
    },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, value: {} }
      },
      description: 'For edit: the plan fields to change and their new values.'
    }
  },
  required: ['action']
})

const DOOR = '/api/build-draft'

/**
 * The 409 codes of the engine doors that name a step the build has not taken yet (`engine-route.js` of tracy-web):
 * what is missing and the one action that takes it. Never a stale plan, so never "retry".
 * @type {Readonly<Record<string, {missing: string, next: string}>>}
 */
const MISSING_STEPS = Object.freeze({
  NO_DRAFT: {
    missing: 'research',
    next: "Nothing is researched yet. Call tracy_build with action research and the owner's links or words."
  },
  NO_RESEARCH: {
    missing: 'research',
    next: "Nothing is researched yet. Call tracy_build with action research and the owner's links or words."
  },
  NO_TEMPLATE: {
    missing: 'template',
    next: 'No template is chosen yet. Call tracy_build with action templates, let the owner pick one on the card, then call plan.'
  },
  NO_KIT: {
    missing: 'template',
    next: 'The chosen template cannot be built here. Call tracy_build with action templates and let the owner pick another one.'
  },
  NO_PLAN: {
    missing: 'plan',
    next: 'There is no plan yet. Call tracy_build with action plan after the owner chose a template.'
  }
})
const LINKS_MAX = 10
const TEXT_MAX = 2_000

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim().slice(0, TEXT_MAX) : '')

/**
 * The owner sentence of a stopped answer: the door's own when it is a plain sentence, else ours.
 * @param {unknown} said
 * @returns {string}
 */
function ownerSay(said) {
  return typeof said === 'string' && said.trim() !== '' && said.length <= SAY_MAX && !/[–—]/.test(said)
    ? said.trim()
    : BUILD_STOPPED_SAY
}

const stopped = (/** @type {unknown} */ said = undefined) => ({ stopped: true, say: ownerSay(said) })

/**
 * Arguments arrive parsed, or as a JSON string from an older dispatcher.
 * @param {unknown} value
 * @returns {any}
 */
function argsOf(value) {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The model facing texts of one `tool/result` content list.
 * @param {any} parts
 * @returns {string[]}
 */
function resultTexts(parts, depth = 0) {
  if (!Array.isArray(parts) || depth > 3) return []
  return parts.flatMap(
    /** @returns {string[]} */ (/** @type {any} */ part) =>
      typeof part?.text === 'string' ? [part.text] : resultTexts(part?.content, depth + 1)
  )
}

/**
 * The answers JSON of an `ask_user_question` result; the line dsh adds after it (`follow_up`, `decide`) is cut.
 * @param {any} content
 * @returns {any[]}
 */
function answersOfResult(content) {
  for (const t of resultTexts(content)) {
    const head = t.split('\n')[0]
    try {
      const parsed = JSON.parse(head)
      if (Array.isArray(parsed?.answers)) return parsed.answers
    } catch {
      // not the answer JSON
    }
  }
  return []
}

/**
 * Every reply the owner gave on an `ask_user_question` card in this session, oldest first.
 * @param {readonly any[]} events - the session's log
 * @returns {{ id: string, selected: string[], custom?: string }[]}
 */
export function repliesOf(events) {
  const asked = new Set()
  const out = []
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'tool/call' && event.data?.name === 'ask_user_question') asked.add(event.data.callId)
    else if (event?.type === 'tool/result' && asked.has(event.data?.message?.source?.callId))
      for (const item of answersOfResult(event.data.message.content))
        if (typeof item?.id === 'string') out.push({ selected: [], ...item })
  }
  return out
}

/**
 * @param {{
 *   http: typeof fetch,
 *   origin: () => string | null,
 *   actorFor: (sessionId: string) => string | null,
 *   eventsOf: (sessionId: string) => readonly unknown[],
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   waitMs?: number,
 *   pollMs?: number
 * }} deps
 */
export function createBuildTool({
  http,
  origin,
  actorFor,
  eventsOf,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  waitMs = BUILD_WAIT_MS,
  pollMs = BUILD_POLL_MS
}) {
  /** @type {Map<string, Map<string, any>>} Per build session: the Contract B questions the engine issued, by id. */
  const issued = new Map()
  /** @type {Map<string, Set<string>>} Per build session: the plan review request ids handed out with a plan. */
  const reviews = new Map()
  /** @type {Map<string, Set<string>>} Per build session: the answers already stored, as `id + answer JSON`. */
  const stored = new Map()

  /** @param {string} sessionId */
  const questionsOf = (sessionId) => {
    let known = issued.get(sessionId)
    if (!known) issued.set(sessionId, (known = new Map()))
    return known
  }
  /** @param {Map<string, Set<string>>} map @param {string} sessionId */
  const setOf = (map, sessionId) => {
    let set = map.get(sessionId)
    if (!set) map.set(sessionId, (set = new Set()))
    return set
  }

  /**
   * Learn the Contract B questions an engine answer issued.
   * @param {string} sessionId
   * @param {any} result
   */
  function learn(sessionId, result) {
    const known = questionsOf(sessionId)
    for (const q of Array.isArray(result?.questions) ? result.questions : [])
      if (typeof q?.id === 'string') known.set(q.id, q)
  }

  /**
   * One door call. Answers `{ status, body }`, or null when tracy-web could not be reached or did not answer JSON.
   * @param {string} sessionId
   * @param {string} assertion
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   */
  async function door(sessionId, assertion, method, path, body) {
    const base = origin()
    if (base === null) return null
    /** @type {Record<string, string>} */
    const headers = { 'x-tracy-actor': assertion, 'x-tracy-session': sessionId, accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    try {
      const res = await http(`${base}${DOOR}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(BUILD_DOOR_TIMEOUT_MS)
      })
      const parsed = await res.json().catch(() => null)
      return { status: res.status, body: parsed }
    } catch {
      return null
    }
  }

  /**
   * Store every reply of the session not stored yet. A reply the answers door refuses (422, 409) is left out; a door
   * that is not there or a tracy-web that does not answer is a fault, and stops the call.
   * @param {string} sessionId
   * @param {string} assertion
   * @returns {Promise<boolean>} false on a fault
   */
  async function storeReplies(sessionId, assertion) {
    const replies = repliesOf(eventsOf(sessionId))
    if (replies.length === 0) return true
    const known = questionsOf(sessionId)
    // After a restart this process knows no issued question: the engine door says them again.
    if (known.size === 0) {
      const state = await door(sessionId, assertion, 'GET', '/engine')
      if (state?.status === 200) learn(sessionId, state.body?.result)
    }
    const done = setOf(stored, sessionId)
    for (const reply of replies) {
      const question = known.get(reply.id)
      if (!question) continue
      let answer = answerOf(question, reply)
      if (answer === null && question.skippable === true)
        answer = { schema: 'tracy-build-answer/v1', question: question.id, skipped: true }
      if (answer === null) continue
      const key = `${reply.id}\n${JSON.stringify(answer)}`
      if (done.has(key)) continue
      const res = await door(sessionId, assertion, 'PUT', '/answers', { question, answer })
      if (res === null || res.status >= 500 || res.status === 403 || res.status === 404) return false
      if (res.status >= 200 && res.status < 300) done.add(key)
    }
    return true
  }

  /**
   * A door answer that is not a 2xx, as the model reads it.
   * @param {{ status: number, body: any }} res
   */
  function refusal(res) {
    // A 409 that names a step not taken yet is not a stale plan: the agent takes that step, it does not retry.
    const missing = res.status === 409 ? MISSING_STEPS[res.body?.code] : undefined
    if (missing) return { missing: missing.missing, next: missing.next }
    if (res.status === 409)
      return {
        stale: true,
        next: 'The plan changed meanwhile. Call tracy_build with action status, then make the change again.'
      }
    if (res.status === 422) {
      const problems = (Array.isArray(res.body?.problems) ? res.body.problems : [])
        .filter((/** @type {unknown} */ p) => typeof p === 'string')
        .slice(0, 5)
      return {
        refused: true,
        problems,
        next: 'Tell the owner plainly, in their language, what could not be changed and why. Do not ask a question about it.'
      }
    }
    return stopped(res.body?.say)
  }

  /**
   * A finished engine step, shaped for the model.
   * @param {string} sessionId
   * @param {any} state
   */
  function finished(sessionId, state) {
    if (state?.state === 'stopped') return stopped(state.say)
    const result = state?.result ?? {}
    if (state?.step === 'research') {
      learn(sessionId, result)
      if (!result.profile) return stopped()
      return { profile: result.profile, ...(result.ask ? { ask: result.ask } : {}) }
    }
    // The brand step (#616) prepares the business's own look the plan is composed from; the plan is asked for again.
    if (state?.step === 'brand')
      return {
        look: 'ready',
        next: 'The business look is ready. Call tracy_build with action plan again now, with the same request.'
      }
    if (state?.step === 'compose' || state?.step === 'edit') {
      // 13/11/2026: a plan is never composed with the template's colour or logo standing in for the business's own.
      if (result.brand !== 'own' || !result.plan) return stopped(state.say)
      const review = planReviewRequestOf(result.plan)
      const ids = setOf(reviews, sessionId)
      for (const q of review.questions) ids.add(q.id)
      return { plan: { id: result.plan.id, revision: result.plan.revision }, review }
    }
    return stopped()
  }

  /**
   * Wait on engine work that is still running, up to the bounded time, then shape what is there.
   * @param {string} sessionId
   * @param {string} assertion
   * @param {any} first
   */
  async function settle(sessionId, assertion, first) {
    let state = first
    const start = now()
    while (state?.state === 'running') {
      if (now() - start >= waitMs)
        return {
          running: true,
          say: BUILD_RUNNING_SAY,
          next: 'Say the sentence in say, then call tracy_build with action status to keep waiting.'
        }
      await sleep(pollMs)
      const res = await door(sessionId, assertion, 'GET', '/engine')
      if (res === null) return stopped()
      if (res.status !== 200) return refusal(res)
      state = res.body
    }
    if (state?.step === null || state?.state === 'idle')
      return { idle: true, next: 'Nothing is running. Call tracy_build with action research first.' }
    return finished(sessionId, state)
  }

  /** @param {unknown} rawArgs @param {any} exec */
  async function execute(rawArgs, exec) {
    const args = argsOf(rawArgs)
    const sessionId = exec?.agent?.session?.id
    if (!isBuildChatSession(sessionId))
      return { refused: true, next: 'tracy_build works only in the build chat. Do not call it here.' }
    const action = args.action
    if (!['research', 'templates', 'plan', 'edit', 'status'].includes(action))
      return {
        refused: true,
        next: 'Call tracy_build with action research, templates, plan, edit or status.'
      }

    /** @type {[string, string, unknown?]} */
    let request
    if (action === 'research') {
      const links = (Array.isArray(args.links) ? args.links : [])
        .map(text)
        .filter((/** @type {string} */ l) => l !== '')
        .slice(0, LINKS_MAX)
      const description = text(args.description)
      if (links.length === 0 && description === '')
        return {
          refused: true,
          next: "Call tracy_build with action research and the owner's links or their own words about the business."
        }
      request = ['POST', '/research', { links, ...(description !== '' ? { description } : {}) }]
    } else if (action === 'plan') {
      const asked = text(args.request)
      request = ['POST', '/compose', asked !== '' ? { request: asked } : {}]
    } else if (action === 'edit') {
      const changes = (Array.isArray(args.changes) ? args.changes : []).filter(
        (/** @type {any} */ c) => c && typeof c === 'object' && typeof c.field === 'string' && 'value' in c
      )
      if (changes.length === 0)
        return { refused: true, next: 'Call tracy_build with action edit and changes:[{field, value}].' }
      request = [
        'POST',
        '/edit',
        { changes: changes.map((/** @type {any} */ c) => ({ field: c.field, value: c.value })) }
      ]
    } else if (action === 'templates') request = ['GET', '/templates']
    else request = ['GET', '/engine']

    if (origin() === null) return stopped()
    const assertion = actorFor(sessionId)
    if (assertion === null) return stopped()
    if (!(await storeReplies(sessionId, assertion))) return stopped()

    const res = await door(sessionId, assertion, request[0], request[1], request[2])
    if (res === null) return stopped()
    if (res.status < 200 || res.status >= 300) return refusal(res)
    if (action === 'templates') {
      const { options, none } = templateChoiceOf(res.body?.templates)
      return { options, none }
    }
    return settle(sessionId, assertion, res.body)
  }

  /**
   * The tools guard: in a build chat session, `ask_user_question` passes only with question ids the engine issued for
   * that session, or the plan review request it handed out with a plan.
   * @param {{ name: string, agent?: any, arguments?: unknown }} execution
   * @returns {string | undefined}
   */
  function guard(execution) {
    if (execution?.name !== 'ask_user_question') return undefined
    const sessionId = execution.agent?.session?.id
    if (!isBuildChatSession(sessionId)) return undefined
    const questions = argsOf(execution.arguments).questions
    const ids = Array.isArray(questions) ? questions.map((q) => q?.id) : []
    const known = issued.get(sessionId)
    const review = reviews.get(sessionId)
    const allowed = (/** @type {unknown} */ id) =>
      typeof id === 'string' && (known?.has(id) === true || review?.has(id) === true)
    if (ids.length > 0 && ids.every(allowed)) return undefined
    return 'In the build chat, ask only the questions a tracy_build result gives, exactly as given. Ask nothing else; if a result said stopped, say its sentence instead.'
  }

  return { execute, guard }
}
