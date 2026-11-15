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
 *
 * APPROVING BUILDS (#610). Action `build` reads the owner's latest answer on the plan review bar (`approvalOf`): only
 * Approve posts, and it posts the plan revision that review was handed out for (its id names it), never the revision
 * current now, to `POST /build`, which creates the site and builds it only while that revision is current. A plan
 * changed after the Approve is not built: the current plan is handed out for review again. The door makes one site
 * per draft, so a second call reads the same build. A read that fails while waiting is not an outcome. The tool never
 * says built before the build's own outcome does, nor failed before the build door says stopped.
 *
 * AN OPEN QUESTION IS NOT A FAULT. A plan that needs one more answer from the owner first (the site name, a free text
 * question with no choice: dsh's card shows its text box alone) comes back as `{ ask, say?, next }`, and a typed reply
 * longer than its question holds is never stored: the owner is asked again with the limit in plain words.
 */
import {
  answerTooLongSay,
  BUILD_DONE_SAY as DONE_SAY,
  BUILD_LOCKED_SAY as LOCKED_SAY,
  FAULT_SAY,
  nameTooLongSay,
  requestTooLongSay,
  TEAM_SEES_SAY,
  UNCHANGED_SAY,
  answerOf,
  approvalOf,
  askRequestOf,
  isBuildChatSession,
  PLAN_REVIEW_ID,
  planOfReviewId,
  planReviewRequestOf,
  RETRY_MESSAGE,
  templateChoiceOf,
  textTooLongOf
} from '@tracy/core/build-chat'

/** How long one call waits for long engine work before it hands back `running`. */
export const BUILD_WAIT_MS = 90_000
/** How often a waiting call asks the engine door again. */
export const BUILD_POLL_MS = 2_000
/** How long one door call may take on its own (the engine work itself runs behind it, not inside it). */
export const BUILD_DOOR_TIMEOUT_MS = 30_000
/** The longest pause between two waiting reads while reads keep failing: each failed read doubles the pause. */
export const BUILD_POLL_BACKOFF_MAX_MS = 16_000

/** Owner facing: said when a step could not finish and the door gave no sentence of its own. */
export const BUILD_STOPPED_SAY = FAULT_SAY
/** Owner facing: said while long work is still running. */
export const BUILD_RUNNING_SAY = 'Still working on it. This can take a minute or two.'

/**
 * Owner facing: said when the plan was kept as it is (compose on a draft that holds a plan) and the door gave no plain
 * sentence of its own. Plain English, no dashes.
 */
export const UNCHANGED_FALLBACK_SAY = UNCHANGED_SAY

/** Owner facing: said while the site is created and built from the approved plan (#610). Plain English, no dashes. */
export const BUILD_BUILDING_SAY =
  'Your site is being built from the plan you approved. This takes a few minutes.'
/** Owner facing: said when the build ended with the site ready. */
export const BUILD_DONE_SAY = DONE_SAY
/** Owner facing: said when the build stopped. The task list card shows which step; the team has the reason. */
export const BUILD_FAILED_SAY = `Your site could not be built this time. ${TEAM_SEES_SAY}`
/** Owner facing: said when the owner asks for a change while the build runs. */
export const BUILD_LOCKED_SAY = LOCKED_SAY
/**
 * Owner facing: said when the build was asked for but tracy-web could not be read while waiting (a timeout, a network
 * fault). The build itself may well be running: this never says it failed. Plain English, no dashes.
 */
export const BUILD_UNCHECKED_SAY =
  'I asked for your site to be built, but I could not check on it just now. Ask me again in a minute to see how it is going.'
/** Owner facing: said when building a site in the chat is switched off. Plain English, no dashes. */
export const BUILD_CHAT_OFF_SAY =
  'Building a site in the chat is not available right now. You can still create your site from the Add site page.'
/**
 * Owner facing: said when a build chat step still works on the plan (`ENGINE_BUSY`) and the door gave no plain
 * sentence of its own. Plain English, no dashes.
 */
export const BUILD_BUSY_SAY =
  'I am still working on your plan, so it cannot change right now. Please make your change again when I am done.'
/**
 * Owner facing: said when a step was started too often for now (`TRY_LATER`) and the door gave no plain sentence of
 * its own. Plain English, no dashes.
 */
export const TRY_LATER_FALLBACK_SAY =
  'I have done this many times in a short while, so I paused here. Please try again later.'
/** Owner facing: said when a request is larger than the door reads (`BODY_TOO_LARGE`). Plain English, no dashes. */
export const BODY_TOO_LARGE_SAY = 'That was too long for me to send. Please say it in fewer words.'
/**
 * Owner facing: said when the draft already holds as many questions as it keeps (`TOO_MANY_QUESTIONS`), so an answer
 * could not be kept. Plain English, no dashes.
 */
export const ANSWERS_FULL_SAY =
  'I could not keep your last answer, because this plan already holds as many answers as it can. Please continue with the plan as it is.'

/** The longest change request the owner may write, in characters (Contract B `request.text`, #617). */
export const REQUEST_MAX_LENGTH = 1_000
/** Owner facing: said when a written change request is longer than that. Plain English, no dashes. */
export const REQUEST_TOO_LONG_SAY = requestTooLongSay(REQUEST_MAX_LENGTH)

/**
 * Owner facing: said when a typed reply is longer than its question holds. Plain English, no dashes.
 * @param {any} question - Contract B question
 * @param {number} limit
 */
export const tooLongSay = (question, limit) =>
  question?.topic === 'site-name' ? nameTooLongSay(limit) : answerTooLongSay(limit)

/** The longest owner sentence passed through from a door; a longer one is replaced by ours. */
const SAY_MAX = 300

export const BUILD_DESCRIPTION =
  'tracy_build: the build chat engine. action research {links?, description?} first; templates; plan after the owner chose a template; plan {request} once a plan exists, with what the owner wants changed in their own words; plan {restart: true} ONLY when the owner clearly asks to start the plan over; edit {changes:[{field,value}]} for one simple change; build ONLY after the owner pressed Approve on the plan review, to create the site and build it from that plan (call it again only when the owner asks how a build that said building is going); status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. Each next in a result is private guidance: never repeat it to the owner. A colour change is edit with changes:[{field:"look.accent", value:"#RRGGBB"}], the field name exact and the value a hex colour you choose. stopped: say its sentence and stop; when it says rerun, ask no question about it, and call the tool once more with the same action only after the owner sends "Please try again.". unchanged: say its sentence; the plan did not change. Never say the site is built until a build result says built.'

export const BUILD_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['research', 'templates', 'plan', 'edit', 'build', 'status'] },
    links: {
      type: 'array',
      items: { type: 'string' },
      description: "The business's own links: website, social profiles, map listing."
    },
    description: { type: 'string', description: "The owner's own words about the business." },
    request: {
      type: 'string',
      description:
        "For plan, once a plan exists: the owner's request to change it, in their own words, at most 1000 characters. Only what it names changes."
    },
    restart: {
      type: 'boolean',
      description:
        'For plan: true ONLY when the owner clearly asks to start the plan over. It throws away the current plan and every change made to it. Never set it for a change request.'
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
/** The build states that are not an outcome yet. */
const BUILDING = new Set(['creating', 'building'])

/**
 * The mark every `next` carries. A `next` is guidance for the model, never something to tell the owner: a model that
 * read "then pass review to ask_user_question" aloud once wrote half of it into its reply.
 */
export const PRIVATE_GUIDANCE_MARK =
  'Private guidance for you only. Never quote it or put any part of it in your reply to the owner.'
const privately = (/** @type {string} */ next) => `${PRIVATE_GUIDANCE_MARK} ${next}`

/**
 * What to say about the template card: with one design the owner confirms it, with several the owner picks one.
 * @param {Array<{ name?: string }>} options
 */
export function templatesNext(options) {
  if (options.length === 0)
    return 'No ready design fits. Tell the owner plainly that no ready design fits their business yet, and that they can add a site with Add site.'
  if (options.length === 1) {
    const name = typeof options[0]?.name === 'string' ? options[0].name : 'it'
    return `One design fits. The card shows it with the button "Use ${name}". In one short line, ask the owner to confirm it with that button. Do not ask which one, there is only one.`
  }
  return 'Several designs fit. In one short line, ask the owner which one they like, using the buttons on the card.'
}

/** The exact shape of a colour change, which the agent used to guess (it sent the field "main colour"). */
export const COLOUR_EDIT_GUIDANCE =
  'For a colour change call tracy_build with action edit and changes:[{field:"look.accent", value:"#RRGGBB"}], where the value is a six digit hex colour you choose for the colour the owner named (for example blue is #1F4E9C). The field name look.accent is exact.'

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
function ownerSay(said, fallback = BUILD_STOPPED_SAY) {
  return typeof said === 'string' && said.trim() !== '' && said.length <= SAY_MAX && !/[–—]/.test(said)
    ? said.trim()
    : fallback
}

const stopped = (/** @type {unknown} */ said = undefined) => ({ stopped: true, say: ownerSay(said) })

/** The operator switched the build chat off (`BUILD_CHAT_OFF`): no fault, and nobody is looking into one. */
const switchedOff = () => ({ stopped: true, say: BUILD_CHAT_OFF_SAY })
/**
 * A request or an answer the door would not take (a body past its bound, a draft that keeps no more questions): one
 * plain sentence, no fault, nothing retried.
 * @param {string} [say]
 */
const tooLargeOf = (say = BODY_TOO_LARGE_SAY) => ({
  refused: true,
  say,
  next: 'Say the sentence in say, then wait for the owner.'
})
/** @param {{ status: number, body: any } | null} res */
const isSwitchedOff = (res) => res?.status === 403 && res.body?.code === 'BUILD_CHAT_OFF'
/**
 * A waiting read that did not answer (a timeout, a network fault, nobody to act as) or answered a server fault: not
 * an outcome, the work behind it goes on. The loop reads again after a longer pause.
 * @param {{ status: number } | null} res
 */
const isPollFault = (res) => res === null || res.status >= 500

/**
 * Private guidance after a stop the owner may have run again: the sentence, no question, and the one fixed message
 * the Try again button sends. The persona says the same.
 */
export const RERUN_GUIDANCE = `Say the sentence in say and stop. Do not ask a question about it. If the owner then sends "${RETRY_MESSAGE}", call tracy_build once more with the same action; a result of that call says stopped again only if it failed again.`

/**
 * A stopped engine step as the door answers it. One the owner may have run again (`rerun`) also names its step and
 * carries the guidance, so the card can offer Try again and count the retries from the session's own results.
 * @param {any} state
 */
const stoppedStateOf = (state) =>
  state?.rerun === true
    ? {
        ...stopped(state.say),
        ...(typeof state.step === 'string' ? { step: state.step } : {}),
        rerun: true,
        next: RERUN_GUIDANCE
      }
    : stopped(state?.say)

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
  /**
   * @type {Map<string, Map<string, string[]>>} Per build session: the plan review requests handed out with a plan, by
   * id (which names the plan revision), with their option labels.
   */
  const reviews = new Map()
  /** @type {Map<string, Set<string>>} Per build session: the answers already stored, as `id + answer JSON`. */
  const stored = new Map()

  /** @param {string} sessionId */
  const questionsOf = (sessionId) => {
    let known = issued.get(sessionId)
    if (!known) issued.set(sessionId, (known = new Map()))
    return known
  }

  /**
   * The plan review of one plan, handed out: the guard admits exactly this request from now on.
   * @param {string} sessionId
   * @param {any} plan - a Contract B plan
   */
  function handOutReview(sessionId, plan) {
    const review = planReviewRequestOf(plan)
    let handed = reviews.get(sessionId)
    if (!handed) reviews.set(sessionId, (handed = new Map()))
    for (const q of review.questions)
      handed.set(
        q.id,
        q.options.map((o) => o.label)
      )
    return review
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
   * that is not there or a tracy-web that does not answer is a fault, and stops the call. A reply the door will never
   * take as it is (413 `BODY_TOO_LARGE`, 422 `TOO_MANY_QUESTIONS`) stops the call with a plain sentence for the owner.
   * A typed reply longer than its question holds is never sent; when it is the owner's latest reply to that question,
   * the call answers the question again with the limit instead of going on.
   * @param {string} sessionId
   * @param {string} assertion
   * @returns {Promise<false | 'off' | { refusal: { refused: boolean, say: string, next: string } }
   *   | { again: { question: any, limit: number } | null }>} false on a fault, `off` when the build chat is switched off
   */
  async function storeReplies(sessionId, assertion) {
    const replies = repliesOf(eventsOf(sessionId))
    if (replies.length === 0) return { again: null }
    const known = questionsOf(sessionId)
    // After a restart this process knows no issued question: the engine door says them again.
    if (known.size === 0) {
      const state = await door(sessionId, assertion, 'GET', '/engine')
      if (state?.status === 200) learn(sessionId, state.body?.result)
    }
    const done = setOf(stored, sessionId)
    /** @type {Map<string, { question: any, limit: number } | null>} per question: its latest reply did not fit */
    const latest = new Map()
    for (const reply of replies) {
      const question = known.get(reply.id)
      if (!question) continue
      const tooLong = textTooLongOf(question, reply)
      latest.set(reply.id, tooLong ? { question, limit: tooLong.limit } : null)
      if (tooLong) continue
      let answer = answerOf(question, reply)
      if (answer === null && question.skippable === true)
        answer = { schema: 'tracy-build-answer/v1', question: question.id, skipped: true }
      if (answer === null) continue
      const key = `${reply.id}\n${JSON.stringify(answer)}`
      if (done.has(key)) continue
      const res = await door(sessionId, assertion, 'PUT', '/answers', { question, answer })
      if (isSwitchedOff(res)) return 'off'
      if (res === null || res.status >= 500 || res.status === 403 || res.status === 404) return false
      // The door will never take this answer as it is: the owner is told, never left with an answer dropped silently.
      if (res.status === 413) return { refusal: tooLargeOf() }
      if (res.status === 422 && res.body?.code === 'TOO_MANY_QUESTIONS')
        return { refusal: tooLargeOf(ANSWERS_FULL_SAY) }
      if (res.status >= 200 && res.status < 300) done.add(key)
    }
    return { again: [...latest.values()].find(Boolean) ?? null }
  }

  /**
   * One question for the owner, as the model reads it: the card to pass on, and the sentence to say first if any.
   * @param {any} ask
   * @param {string} [say]
   */
  const askAgain = (ask, say) => ({
    ask,
    ...(say ? { say } : {}),
    next: `${say ? 'Say the sentence in say, then pass' : 'Pass'} ask to ask_user_question exactly as given. When the owner has answered, call tracy_build with action plan again.`
  })

  /**
   * A door answer that is not a 2xx, as the model reads it.
   * @param {{ status: number, body: any }} res
   */
  function refusal(res) {
    if (isSwitchedOff(res)) return switchedOff()
    // A 409 that names a step not taken yet is not a stale plan: the agent takes that step, it does not retry.
    const missing = res.status === 409 ? MISSING_STEPS[res.body?.code] : undefined
    if (missing) return { missing: missing.missing, next: missing.next }
    // The plan is frozen while its site is built (#610): a statement for the owner, never a retry.
    if (res.status === 409 && res.body?.code === 'BUILD_RUNNING')
      return {
        building: true,
        say: BUILD_LOCKED_SAY,
        next: 'Say the sentence in say. Call tracy_build with action build to read how the build is going.'
      }
    // Another step still works on the plan: the plan did not move, and this step is never retried on its own.
    if (res.status === 409 && res.body?.code === 'ENGINE_BUSY')
      return {
        busy: true,
        say: ownerSay(res.body?.say, BUILD_BUSY_SAY),
        next: 'Say the sentence in say. Do not call tracy_build again now; make the change again when the owner asks for it.'
      }
    // Started too often for now (`TRY_LATER`): no fault, nothing to retry, nothing to ask.
    if (res.status === 429)
      return {
        paused: true,
        say: ownerSay(res.body?.say, TRY_LATER_FALLBACK_SAY),
        next: 'Say the sentence in say and stop here. Ask no question, and do not call tracy_build again until the owner asks.'
      }
    if (res.status === 413) return tooLargeOf()
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
        next: `If the change was a colour and you did not use the exact field, try once more. ${COLOUR_EDIT_GUIDANCE} Otherwise tell the owner plainly, in their language, what could not be changed and why, and that the plan card is where they can change it by hand. Do not ask a question about it.`
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
    if (state?.state === 'stopped') return stoppedStateOf(state)
    const result = state?.result ?? {}
    // The plan needs one more answer from the owner first (the site name): the question goes on the card.
    if (state?.state === 'asking') {
      learn(sessionId, result)
      if (!result.ask) return stopped()
      return askAgain(result.ask, typeof state.say === 'string' ? ownerSay(state.say) : undefined)
    }
    if (state?.step === 'research') {
      learn(sessionId, result)
      if (!result.profile) return stopped()
      return { profile: result.profile, ...(result.ask ? { ask: result.ask } : {}) }
    }
    // A written change request (#617): what changed and what was not done, in the words the engine wrote.
    if (state?.step === 'revise') {
      if (result.brand !== 'own' || !result.plan) return stopped(state.say)
      const review = handOutReview(sessionId, result.plan)
      const lines = (/** @type {unknown} */ v) =>
        Array.isArray(v) ? v.filter((/** @type {unknown} */ x) => typeof x === 'string') : []
      const notDone = (Array.isArray(result.revision?.notDone) ? result.revision.notDone : [])
        .filter((/** @type {any} */ e) => typeof e?.what === 'string' && typeof e?.why === 'string')
        .map((/** @type {any} */ e) => ({ what: e.what, why: e.why }))
      const unchanged = result.unchanged === true
      return {
        plan: { id: result.plan.id, revision: result.plan.revision },
        unchanged,
        revision: { changed: lines(result.revision?.changed), notDone },
        review,
        next: `${unchanged ? 'Nothing on the plan changed: say so plainly.' : 'Say what changed using the sentences in revision.changed, word for word.'} Then say each entry of revision.notDone with its why. Do not say anything else changed. When an entry asks for the language, a value, the look or the number of pictures, tell the owner they can change it on the plan card. Then call ask_user_question with review, unchanged.`
      }
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
      const review = handOutReview(sessionId, result.plan)
      const plan = { id: result.plan.id, revision: result.plan.revision }
      // The draft already held a plan: it was kept as it is, with the owner's edits (#609). Nothing was composed.
      if (result.unchanged === true)
        return {
          unchanged: true,
          say: ownerSay(state.say, UNCHANGED_FALLBACK_SAY),
          plan,
          review,
          next: 'The plan did not change. Say the sentence in say. Never say the plan changed or that the request was applied. Then call ask_user_question with review, unchanged. Call plan with restart true only if the owner clearly asks to start the plan over.'
        }
      return { plan, review }
    }
    return stopped()
  }

  /**
   * Wait on engine work that is still running, up to the bounded time, then shape what is there. Each poll calls as the
   * person who typed with an assertion minted for it: one assertion lives a minute (dsh-passwords
   * `ASSERTION_TTL_SECONDS`), shorter than the wait, and tracy-web refuses an expired one. A read that fails is not
   * the step's outcome (the step runs on in tracy-web): the loop reads again after a longer pause.
   * @param {string} sessionId
   * @param {any} first
   */
  async function settle(sessionId, first) {
    let state = first
    const start = now()
    let pause = pollMs
    while (state?.state === 'running') {
      if (now() - start >= waitMs)
        return {
          running: true,
          say: BUILD_RUNNING_SAY,
          next: 'Say the sentence in say, then call tracy_build with action status to keep waiting.'
        }
      await sleep(pause)
      const assertion = actorFor(sessionId)
      const res = assertion === null ? null : await door(sessionId, assertion, 'GET', '/engine')
      if (res === null || isPollFault(res)) {
        pause = Math.min(pause * 2, BUILD_POLL_BACKOFF_MAX_MS)
        continue
      }
      if (res.status !== 200) return refusal(res)
      state = res.body
      pause = pollMs
    }
    if (state?.step === null || state?.state === 'idle')
      return { idle: true, next: 'Nothing is running. Call tracy_build with action research first.' }
    return finished(sessionId, state)
  }

  /**
   * The plan revision the owner approved: their latest answer on the plan review bar must be Approve, and it names
   * the revision that review was handed out for (`planReviewIdOf`). Never the revision the draft or this process holds
   * now: a plan changed after the Approve (by the model, or inline on the card) is built only after a new Approve,
   * because tracy-web builds a revision only while it is the current one (`STALE_PLAN`).
   * @param {string} sessionId
   * @returns {{plan: {id: string, revision: number}} | {refused: true, next: string}}
   */
  function approvedPlan(sessionId) {
    const latest = repliesOf(eventsOf(sessionId))
      .filter((r) => r.id === PLAN_REVIEW_ID || planOfReviewId(r.id) !== null)
      .at(-1)
    const approved = latest ? approvalOf({ answers: [latest] }) : null
    if (approved) return approved
    return {
      refused: true,
      next: 'The owner has not approved the plan. Call ask_user_question with the review of the last plan result, and call build only after the owner pressed Approve.'
    }
  }

  /**
   * The plan moved on since the owner approved: nothing is built, and the current plan is handed out for review again.
   * @param {string} sessionId
   * @param {string} assertion
   */
  async function reviewAgain(sessionId, assertion) {
    const res = await door(sessionId, assertion, 'GET', '')
    const current = res?.status === 200 ? res.body?.draft?.plan : null
    if (typeof current?.id !== 'string' || !Number.isInteger(current?.revision))
      return {
        stale: true,
        next: 'The plan changed since the owner approved it. Call tracy_build with action status, then call ask_user_question with the new review.'
      }
    return {
      stale: true,
      plan: { id: current.id, revision: current.revision },
      review: handOutReview(sessionId, current),
      next: 'The plan changed since the owner approved it, so nothing was built. Say in one short line that the plan changed and needs their approval again. Then call ask_user_question with review, unchanged, and call build only after the owner pressed Approve again.'
    }
  }

  /**
   * A build answer of the build door, shaped for the model: still building, built, or stopped with one plain sentence.
   * @param {any} body
   */
  function buildResult(body) {
    const build = body?.build
    if (!build) return stopped(BUILD_FAILED_SAY)
    if (BUILDING.has(build.state))
      return {
        building: true,
        say: BUILD_BUILDING_SAY,
        next: 'Say the sentence in say. The task list card shows each step and keeps up by itself. Call tracy_build with action build again only when the owner asks how it is going. Never say the site is built yet.'
      }
    if (build.state === 'done')
      return {
        built: true,
        say: BUILD_DONE_SAY,
        ...(typeof build.workspacePath === 'string' ? { workspacePath: build.workspacePath } : {}),
        next: 'Say the sentence in say. Do not add anything about how it was built.'
      }
    return stopped(BUILD_FAILED_SAY)
  }

  /**
   * Approve and build: one POST (the door makes one site per draft, so pressing twice is safe), then reading the build
   * for the bounded time. A read that fails (a timeout, a network fault, a server fault) is not the build's outcome:
   * the build runs on in tracy-web, so the loop reads again after a longer pause, and a wait that ends without a
   * clean read says so plainly. Only the build door's own state says stopped.
   * @param {string} sessionId
   * @param {string} assertion
   */
  async function build(sessionId, assertion) {
    const approved = approvedPlan(sessionId)
    if ('refused' in approved) return approved
    const res = await door(sessionId, assertion, 'POST', '/build', { plan: approved.plan })
    if (res !== null && res.status === 409 && res.body?.code === 'STALE_PLAN')
      return reviewAgain(sessionId, assertion)
    if (res !== null && res.status === 409 && res.body?.code === 'ENGINE_BUSY')
      return {
        running: true,
        say: BUILD_RUNNING_SAY,
        next: 'Say the sentence in say. Call tracy_build with action status, then action build again once it ended.'
      }
    if (res !== null && res.status === 409 && res.body?.code === 'BUILT_FROM_OTHER_PLAN')
      return {
        building: true,
        say: BUILD_LOCKED_SAY,
        next: 'Say the sentence in say. Call tracy_build with action build only to read the build of the plan already approved.'
      }
    // A POST that did not answer may still have created the build: it is read back, never reported as failed.
    const posted = res === null || isPollFault(res) ? null : res
    if (posted !== null && (posted.status < 200 || posted.status >= 300)) return refusal(posted)
    let body = posted?.body
    let known = posted !== null
    let lastFailed = !known
    let pause = pollMs
    const start = now()
    while ((!known || BUILDING.has(body?.build?.state)) && now() - start < waitMs) {
      await sleep(pause)
      const polled = actorFor(sessionId)
      const read = polled === null ? null : await door(sessionId, polled, 'GET', '/build')
      if (read === null || isPollFault(read)) {
        lastFailed = true
        pause = Math.min(pause * 2, BUILD_POLL_BACKOFF_MAX_MS)
        continue
      }
      if (read.status !== 200) return refusal(read)
      body = read.body
      known = true
      lastFailed = false
      pause = pollMs
    }
    if (!known || (lastFailed && BUILDING.has(body?.build?.state)))
      return {
        building: true,
        say: BUILD_UNCHECKED_SAY,
        next: 'Say the sentence in say. Never say the build failed or that the site is built. Call tracy_build with action build again only when the owner asks how it is going.'
      }
    return buildResult(body)
  }

  /**
   * Every `next` the model reads is private guidance: it is marked so, once, here, so no step can forget it.
   * @param {unknown} rawArgs @param {any} exec
   */
  async function execute(rawArgs, exec) {
    /** @type {any} */
    let result
    try {
      result = await run(rawArgs, exec)
    } catch {
      // A fault never becomes a raw tool error (a plan of an older shape, an answer this file cannot read).
      result = stopped()
    }
    return typeof result?.next === 'string' ? { ...result, next: privately(result.next) } : result
  }

  /** @param {unknown} rawArgs @param {any} exec */
  async function run(rawArgs, exec) {
    const args = argsOf(rawArgs)
    const sessionId = exec?.agent?.session?.id
    if (!isBuildChatSession(sessionId))
      return { refused: true, next: 'tracy_build works only in the build chat. Do not call it here.' }
    const action = args.action
    if (!['research', 'templates', 'plan', 'edit', 'build', 'status'].includes(action))
      return {
        refused: true,
        next: 'Call tracy_build with action research, templates, plan, edit, build or status.'
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
      // A request longer than a change request holds is never sent: the owner writes a shorter one.
      if (typeof args.request === 'string' && [...args.request.trim()].length > REQUEST_MAX_LENGTH)
        return {
          refused: true,
          say: REQUEST_TOO_LONG_SAY,
          next: 'Say the sentence in say, then wait for the owner to write a shorter request.'
        }
      const asked = text(args.request)
      // Starting over is its own intent: sent only when the model set restart to true.
      request = [
        'POST',
        '/compose',
        { ...(asked !== '' ? { request: asked } : {}), ...(args.restart === true ? { restart: true } : {}) }
      ]
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
    else if (action === 'build') request = ['POST', '/build']
    else request = ['GET', '/engine']

    if (origin() === null) return stopped()
    const assertion = actorFor(sessionId)
    if (assertion === null) return stopped()
    const replies = await storeReplies(sessionId, assertion)
    if (replies === 'off') return switchedOff()
    if (replies === false) return stopped()
    if ('refusal' in replies) return replies.refusal
    if (replies.again) {
      const { question, limit } = replies.again
      return askAgain(askRequestOf([question], []), tooLongSay(question, limit))
    }
    if (action === 'build') return build(sessionId, assertion)

    const res = await door(sessionId, assertion, request[0], request[1], request[2])
    if (res === null) return stopped()
    if (res.status < 200 || res.status >= 300) return refusal(res)
    if (action === 'templates') {
      const { options, none } = templateChoiceOf(res.body?.templates)
      return { options, none, next: templatesNext(options) }
    }
    return settle(sessionId, res.body)
  }

  /**
   * The tools guard: in a build chat session, `ask_user_question` passes only with question ids the engine issued for
   * that session, or the plan review request it handed out with a plan, with exactly the options handed out: the
   * review's options are the answer values the approval is read by, so a relabelled or translated one never passes.
   * @param {{ name: string, agent?: any, arguments?: unknown }} execution
   * @returns {string | undefined}
   */
  function guard(execution) {
    if (execution?.name !== 'ask_user_question') return undefined
    const sessionId = execution.agent?.session?.id
    if (!isBuildChatSession(sessionId)) return undefined
    const questions = argsOf(execution.arguments).questions
    const asked = Array.isArray(questions) ? questions : []
    const known = issued.get(sessionId)
    const review = reviews.get(sessionId)
    const allowed = (/** @type {any} */ q) => {
      const id = q?.id
      if (typeof id !== 'string') return false
      if (known?.has(id) === true) return true
      const labels = review?.get(id)
      if (!labels) return false
      /** @type {unknown[]} */
      const given = Array.isArray(q.options) ? q.options.map((/** @type {any} */ o) => o?.label) : []
      return given.length === labels.length && given.every((label, i) => label === labels[i])
    }
    if (asked.length > 0 && asked.every(allowed)) return undefined
    return 'In the build chat, ask only the questions a tracy_build result gives, exactly as given. Ask nothing else; if a result said stopped, say its sentence instead.'
  }

  return { execute, guard }
}
