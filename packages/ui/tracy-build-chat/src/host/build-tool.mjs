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
  RESEARCH_READ_SAY,
  SAY_STRINGS,
  TEAM_SEES_SAY,
  UNCHANGED_SAY,
  answerOf,
  approvalOf,
  askRequestOf,
  isBuildChatSession,
  localizedAskOf,
  PLAN_REVIEW_ID,
  planOfReviewId,
  planReviewRequestOf,
  RETRY_MESSAGE,
  revisedOf,
  sentChoiceIdOf,
  templateChoiceOf,
  textTooLongOf
} from '@tracy/core/build-chat'
import { chatLanguageTagOf } from '../chat-words.mjs'
import { chatLanguageOf, chatWordsIn } from './chat-tables.mjs'
import { askWordsFor } from './ask-words.mjs'
import { startOverAnswerOf, startOverQuestion } from './start-over.mjs'

/**
 * The header in which tracy-web names the interface language of the person the tool acts for, on every build draft
 * door answer (`apps/tracy-web/src/build-draft/caller.js`).
 */
export const INTERFACE_LANGUAGE_HEADER = 'x-tracy-interface-language'

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
/**
 * The code the build door gives a build refused before any step ran, when the chosen design has no site to build from
 * (`SITE_SOURCE_MISSING`); any other refusal before a step is `site-not-started` (`build-route.js` `notStartedOf`).
 */
export const DESIGN_NOT_BUILDABLE = 'design-not-buildable'
/**
 * Owner facing: the site could not be created, so no step ran; the plan is kept. The task list card says the same in
 * the interface language (`stopped.notStarted`). Plain English, no dashes.
 */
export const SITE_NOT_STARTED_SAY =
  'Your site could not be started, but your plan is kept and you can approve it again later.'
/** Owner facing: as above, when the chosen design cannot be built yet (`stopped.notStarted.design`). */
export const DESIGN_NOT_BUILDABLE_SAY =
  'This design cannot be built yet, so your site was not started, but your plan is kept and you can approve it again later.'
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
  'I am still working on your plan, so it cannot change right now. Make your change again when I am done.'

/**
 * Private guidance: what the plan card really lets the owner change by hand (`PlanCard.tsx`: the business facts, the
 * service names and the main colour). The site language, the design, the logo, the pictures and what a section holds
 * are shown there, not offered, so the agent never points the owner at a control the card does not have.
 */
export const PLAN_CARD_CONTROLS_GUIDANCE =
  'When an entry asks to change a business fact, a service name or the main colour, tell the owner they can change that value on the plan card. Never say that the language, the design, the logo, the pictures or anything else can be changed on the plan card.'

/**
 * Private guidance: the build chat speaks the language the owner writes in (decided rule, owner, over the earlier
 * interface language rule: `scripts/test/build-agent-preset.test.mjs`). The agent names it on every call
 * (`language`), and the code draws the question card and the cards in it when the build chat has words for it, else
 * in the account's interface language (`chatLanguageOf`); every answer names what the cards use (`chatLanguage`).
 * A fixed message the chat sends for the owner ("Please try again.", run 6: the agent followed such a message into
 * English) never moves it.
 */
export const OWNER_LANGUAGE_GUIDANCE =
  'Write in the language the owner writes in, and name it in language on every tracy_build call, as a two letter code such as en or fr. Keep to it until the owner writes in another language or asks you to change. A fixed message the chat sends for them, such as "Please try again.", never changes it. Say every sentence a result gives you in that language, keeping names and values as they are.'

/** How a line the engine wrote is said: in the language the owner writes in, its names and values unchanged. */
const IN_OWNER_LANGUAGE = 'in the language the owner writes in, keeping every name and value word for word'

/**
 * Private guidance after a change request with entries not done: nothing is promised that the card and the plan do
 * not offer (run 6: "send me the video link and I will add it", which the plan cannot do).
 */
export const NOT_DONE_GUIDANCE =
  'Promise nothing beyond what the plan card and the plan offer: never offer to add it later, and never ask the owner to send you anything for it.'
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

/** Every action of `tracy_build`. */
const ACTIONS = ['research', 'templates', 'plan', 'edit', 'build', 'status', 'start-over']

export const BUILD_DESCRIPTION =
  'tracy_build: the build chat engine. action research {links?, description?, name?, city?} first (an owner with no link: ask the business name and the city it is in, then pass name and city, with their words in description); templates; plan after the owner chose a template; plan {request} once a plan exists, with what the owner wants changed in their own words; plan {restart: true} ONLY when the owner clearly asks to start the plan over; edit {changes:[{field,value}]} for one simple change; build ONLY after the owner pressed Approve on the plan review, to create the site and build it from that plan (call it again only when the owner asks how a build that said building is going); status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. Each next in a result is private guidance: never repeat it to the owner. A colour change is edit with changes:[{field:"look.accent", value:"#RRGGBB"}], the field name exact and the value a hex colour you choose. stopped: say its sentence and stop; when it says rerun, ask no question about it, and call the tool once more with exactly the arguments in its again, never with action status, only after the owner sends "Please try again.". unchanged: say its sentence; the plan did not change. Every call names in language the language the owner writes in, as a two letter code; say every sentence a result gives in that language. Never say the site is built until a build result says built. start-over ONLY when the owner clearly asks to start the whole build over with a new conversation (not only the plan): first without confirm, then with confirm true once the owner agreed.'

export const BUILD_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    language: {
      type: 'string',
      description:
        'The language the owner writes in, as a two letter code such as en, vi or fr. The cards and questions of the build chat use it.'
    },
    links: {
      type: 'array',
      items: { type: 'string' },
      description: "The business's own links: website, social profiles, map listing."
    },
    description: { type: 'string', description: "The owner's own words about the business." },
    name: {
      type: 'string',
      description: 'For research with no link: the business name exactly as the owner gave it.'
    },
    city: {
      type: 'string',
      description: 'For research with no link: the city or town the business is in, as the owner gave it.'
    },
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
    confirm: {
      type: 'boolean',
      description:
        'For start-over: true ONLY after the owner clearly agreed to discard everything gathered so far.'
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
  required: ['action', 'language']
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

/** What the agent calls once the owner pressed a design on the template card. */
const TEMPLATE_CHOSEN_NEXT = 'When the owner has chosen on the card, call tracy_build with action plan.'

/**
 * What to say about the template card: with one design the owner confirms it, with several the owner picks one.
 * @param {Array<{ name?: string }>} options
 */
export function templatesNext(options) {
  if (options.length === 0)
    return 'No ready design fits. Tell the owner plainly that no ready design fits their business yet, and that they can add a site with Add site.'
  // The button's words are the card's, in the owner's interface language: the agent never quotes them (run 6: it named
  // an English label on a Vietnamese card).
  if (options.length === 1)
    return `One design fits. In one short line, ask the owner to confirm it with the button on the card. Never quote the words on the button. Do not ask which one, there is only one. ${TEMPLATE_CHOSEN_NEXT}`
  return `Several designs fit. In one short line, ask the owner which one they like, using the buttons on the card. ${TEMPLATE_CHOSEN_NEXT}`
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
 * the Try again button sends. The call to make names the step that stopped (`again`), never `status`: reading the
 * stop again shows the owner the same failure (run 6, turn 3.1). The persona says the same.
 */
export const RERUN_GUIDANCE = `Say the sentence in say and stop. Do not ask a question about it. If the owner then sends "${RETRY_MESSAGE}", call tracy_build once more with exactly the arguments in again, never with action status; a result of that call says stopped again only if it failed again.`

/** Guidance when a link the owner gave could not be read or gave nothing (#609): the owner hears it, plainly. */
const LINK_GAP_NEXT =
  'links says what was read from each link the owner gave. In one short sentence, in the language the owner writes in, tell the owner which link could not be read or gave nothing, by its name. Never say a code.'

/**
 * Whether a research answer's link lines hold a link that could not be read, that gave nothing, or whose pictures
 * were all lost.
 * @param {unknown} links
 */
const linkGapOf = (links) =>
  Array.isArray(links) &&
  links.some(
    (/** @type {any} */ l) =>
      l?.state === 'failed' ||
      (l?.state === 'read' && ((!l.facts && !l.pictures) || (!l.pictures && l.picturesLost > 0)))
  )

/**
 * Private guidance on every answer that hands the owner a question: the answer travels by itself (the tool reads the
 * owner's replies from the session and stores them, `storeReplies`), so the agent never carries it in a call
 * (17/11/2026: the agent called research again to pass a typed answer, and research asked the place again).
 */
export const ANSWERS_ARRIVE_GUIDANCE =
  "The owner's answers reach tracy_build by themselves. Never call research again to pass an answer, and never put an answer into description."

/** Private guidance after a start refused for its limit: said once, with when, and nothing called until then. */
export const PAUSED_NEXT = `Say the sentence in say once and stop here. It says when the owner can continue; the chat shows the owner a Try again button for then. Ask no question, and do not call tracy_build again before retryAt. When the owner sends "${RETRY_MESSAGE}" after retryAt, call tracy_build once more with exactly the arguments in again.`
/**
 * Private guidance when the owner writes again while a start is still paused (#575, 17/11/2026 walk: the agent said
 * the same pause sentence after every message): the tool does not ask tracy-web again, and the agent answers what the
 * owner wrote instead of repeating itself.
 */
export const PAUSED_AGAIN_NEXT =
  'Nothing was started: the pause is not over yet. Do not repeat the earlier sentence about the pause. Answer what the owner just wrote in one short sentence, and say once that you can continue after minutesLeft minutes. Do not call tracy_build again before retryAt.'

/**
 * Private guidance when research was called with no link and no business name (#575 walk: the owner read "this step
 * could not complete" before being asked the name).
 */
export const NEEDS_NAME_NEXT =
  "Research needs the business name first. In one short message in the owner's language, ask for the name of their business and the city or town it is in. Then call tracy_build with action research, no links, name and city as the owner gave them, and their words as description. Do not say anything failed."

/** Private guidance after a research that hands the owner questions. */
export const RESEARCH_QUESTIONS_NEXT = `Pass ask to ask_user_question exactly as given. ${ANSWERS_ARRIVE_GUIDANCE} When the owner has answered, call tracy_build with action templates.`
/** Private guidance after a research with nothing left to ask. */
export const RESEARCH_DONE_NEXT = 'Research is done. Call tracy_build with action templates now.'

/** The words of a list, joined plainly: `a, b and c`. */
const joined = (/** @type {string[]} */ items) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/**
 * What one link gave, in plain English for the agent to say in the owner's language: its counts, or why it could not
 * be read. Never a code: the reason is the plain clause tracy-web wrote.
 * @param {any} line
 */
const foundLineOf = (line) => {
  if (line?.state === 'failed')
    return `${line.name}: could not be read${line.reason ? ` (${line.reason})` : ''}`
  const facts = Number(line?.facts) || 0
  const pictures = Number(line?.pictures) || 0
  return `${line?.name}: ${facts} ${facts === 1 ? 'fact' : 'facts'}, ${pictures} ${pictures === 1 ? 'picture' : 'pictures'}`
}

/**
 * Private guidance after a finished research (#575, 17/11/2026 walk: the owner read one empty sentence, then a
 * question card): a short account of what each link gave and what is still missing, built by code from the result
 * (`links`, `missing`), said in the owner's language before the first question.
 * @param {any} result the research step's result
 */
export function foundNextOf(result) {
  const links = (Array.isArray(result?.links) ? result.links : []).map(foundLineOf)
  const missing = Array.isArray(result?.missing) ? result.missing : []
  const held = missing.filter((/** @type {any} */ m) => m?.held).map((/** @type {any} */ m) => m.what)
  const absent = missing.filter((/** @type {any} */ m) => !m?.held).map((/** @type {any} */ m) => m.what)
  const parts = [
    links.length ? `what each link gave: ${links.join('; ')}` : null,
    held.length ? `found but kept off the site until the owner confirms it: ${joined(held)}` : null,
    absent.length ? `not found: ${joined(absent)}` : null
  ].filter(Boolean)
  if (!parts.length) return null
  return `In two or three short sentences, tell the owner what research found, in plain words with the counts, the link names as they are and no code: ${parts.join('. ')}. Only then go on.`
}

/**
 * What the agent does after a finished research: the account of what was found (`foundNextOf`), the link it must name
 * (`LINK_GAP_NEXT`), then the questions or the templates.
 * @param {any} result the research step's result
 */
const researchNextOf = (result) => {
  const found = foundNextOf(result)
  return [
    found,
    linkGapOf(result.links) ? LINK_GAP_NEXT : null,
    result.ask ? RESEARCH_QUESTIONS_NEXT : RESEARCH_DONE_NEXT
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The action that runs each engine step again: the plan steps are all started by action plan.
 * @type {Readonly<Record<string, string>>}
 */
const ACTION_OF_STEP = Object.freeze({ research: 'research', brand: 'plan', compose: 'plan', revise: 'plan' })

/**
 * The arguments of a `tracy_build` call that starts engine work, kept as they would be sent again: research with its
 * links and words, plan with its request. `restart` is never kept: a stopped start over already discarded the plan, so
 * plan alone composes the first plan again.
 * @param {any} args
 * @returns {{ action: string, links?: string[], description?: string, name?: string, city?: string,
 *   request?: string } | null}
 */
function startArgsOf(args) {
  if (args?.action === 'research') {
    const links = (Array.isArray(args.links) ? args.links : [])
      .map(text)
      .filter((/** @type {string} */ l) => l !== '')
    const description = text(args.description)
    const name = text(args.name)
    const city = text(args.city)
    return {
      action: 'research',
      ...(links.length ? { links: links.slice(0, LINKS_MAX) } : {}),
      ...(description !== '' ? { description } : {}),
      ...(name !== '' ? { name } : {}),
      ...(city !== '' ? { city } : {})
    }
  }
  if (args?.action === 'plan') {
    const request = text(args.request)
    return { action: 'plan', ...(request !== '' ? { request } : {}) }
  }
  return null
}

/**
 * The call that runs the stopped step again: the session's latest `tracy_build` call that started that step's action,
 * with its own arguments. A step with no such call in the log is run by its action alone.
 * @param {readonly any[]} events
 * @param {string | undefined} step
 */
export function rerunArgsOf(events, step) {
  const action = typeof step === 'string' ? ACTION_OF_STEP[step] : undefined
  if (!action) return null
  let found = null
  for (const event of Array.isArray(events) ? events : [])
    if (event?.type === 'tool/call' && event.data?.name === 'tracy_build') {
      const started = startArgsOf(argsOf(event.data.arguments))
      if (started?.action === action) found = started
    }
  return found ?? { action }
}

/**
 * The owner pressed Try again after the session's last `tracy_build` answer, and that answer was a stop that may be
 * rerun: the arguments it named to run the step again (`again`), else null. Read from the log only, so a restart of
 * this process changes nothing.
 * @param {readonly any[]} events
 */
export function pendingRetryOf(events) {
  const calls = new Set()
  let lastResult = null
  let lastResultSeq = -1
  let retrySeq = -1
  for (const [i, event] of (Array.isArray(events) ? events : []).entries()) {
    const seq = Number.isFinite(Number(event?.seq)) ? Number(event.seq) : i
    if (event?.type === 'tool/call' && event.data?.name === 'tracy_build') calls.add(event.data.callId)
    else if (event?.type === 'tool/result' && calls.has(event.data?.message?.source?.callId)) {
      lastResult = resultTexts(event.data.message.content)[0] ?? null
      lastResultSeq = seq
    } else if (event?.type === 'user/message' && event.data?.source?.kind === 'user') {
      const said = resultTexts(event.data.content).join('').trim()
      if (said === RETRY_MESSAGE) retrySeq = seq
    }
  }
  if (lastResult === null || retrySeq < lastResultSeq) return null
  try {
    const answer = JSON.parse(lastResult)
    return (answer?.stopped === true || answer?.paused === true) &&
      answer.rerun === true &&
      startArgsOf(answer.again)
      ? answer.again
      : null
  } catch {
    return null
  }
}

/**
 * A stopped engine step as the door answers it. One the owner may have run again (`rerun`) also names its step, the
 * exact call that runs it again (`again`) and the guidance, so the card can offer Try again and count the retries from
 * the session's own results.
 * @param {any} state
 * @param {readonly any[]} [events] - the session's log, which names the call that started the step
 */
const stoppedStateOf = (state, events = []) => {
  // Why it stopped, when the engine names it (`try-later`, `cancelled`...): the stop card reads it (#575).
  const reason = typeof state?.reason === 'string' ? { reason: state.reason } : {}
  if (state?.rerun !== true) return { ...stopped(state?.say), ...reason }
  const again = rerunArgsOf(events, state.step)
  // A stop on a limit (`try-later`) says when the step may run again: its sentence carries the time already.
  const retryAt = typeof state.retryAt === 'string' ? state.retryAt : null
  return {
    ...stopped(state.say),
    ...(typeof state.step === 'string' ? { step: state.step } : {}),
    rerun: true,
    ...(again ? { again } : {}),
    ...(retryAt ? { retryAt } : {}),
    ...reason,
    next: RERUN_GUIDANCE
  }
}

/**
 * A start refused for its limit (`paused`) names the call that starts it again once `retryAt` came (#575): the stop
 * card's Try again sends "Please try again." then, and a status call made for it runs that call (`pendingRetryOf`).
 * Any other answer is returned as it is.
 * @param {any} answer
 * @param {any} args - the call that was refused
 */
const pausedWithAgain = (answer, args) => {
  const again = answer?.paused === true ? startArgsOf(args) : null
  return again ? { ...answer, rerun: true, again } : answer
}

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
 * The plan review requests the agent asked in this session that have no answer yet: their bar is open now.
 * @param {readonly any[]} events
 * @returns {Set<string>}
 */
export function openReviewsOf(events) {
  /** @type {Map<string, string[]>} */
  const asked = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'tool/call' && event.data?.name === 'ask_user_question') {
      const questions = argsOf(event.data.arguments).questions
      const ids = (Array.isArray(questions) ? questions : [])
        .map((/** @type {any} */ q) => q?.id)
        .filter((/** @type {unknown} */ id) => typeof id === 'string' && planOfReviewId(id) !== null)
      if (ids.length) asked.set(event.data.callId, ids)
    } else if (event?.type === 'tool/result') asked.delete(event.data?.message?.source?.callId)
  }
  return new Set([...asked.values()].flat())
}

/**
 * Private guidance: hand the living plan's review to the owner. Every answer that hands out a plan nobody approved yet
 * carries it, so the owner always has the Approve button (run 6: a plan read through `status` came without it and the
 * agent asked for an Approve the owner could not see). When that review is already open, the agent asks nothing more.
 * @param {string} lead - what to say about the plan first
 * @param {boolean} open - the review of this revision is open now
 */
export const reviewNextOf = (lead, open) =>
  open
    ? `${lead} The owner already has the review of this plan open with its Approve button: do not ask it again.`
    : `${lead} Then call ask_user_question with review, unchanged. Call build only after the owner pressed Approve.`

/**
 * @param {{
 *   http: typeof fetch,
 *   origin: () => string | null,
 *   actorFor: (sessionId: string) => string | null,
 *   eventsOf: (sessionId: string) => readonly unknown[],
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   waitMs?: number,
 *   pollMs?: number,
 *   wordsFor?: (language: unknown) => import('@tracy/core/build-chat').AskWords | null
 * }} deps `wordsFor`: the question words of an interface language (`ask-words.mjs`), null when there are none
 */
export function createBuildTool({
  http,
  origin,
  actorFor,
  eventsOf,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  waitMs = BUILD_WAIT_MS,
  pollMs = BUILD_POLL_MS,
  wordsFor = askWordsFor
}) {
  /** @type {Map<string, Map<string, any>>} Per build session: the Contract B questions the engine issued, by id. */
  const issued = new Map()
  /** @type {Map<string, string>} Per build session: the owner's interface language, as tracy-web last named it. */
  const languages = new Map()
  /** @type {Map<string, string>} Per build session: the language the owner writes in, as the agent last named it. */
  const spoken = new Map()
  /**
   * The language the code says the build chat in: the owner's own when the build chat has words for it, else the
   * interface language (`chatLanguageOf`); null when neither is known.
   * @param {unknown} sessionId
   */
  const chatLanguageFor = (sessionId) =>
    chatLanguageOf(
      spoken.get(/** @type {string} */ (sessionId)),
      languages.get(/** @type {string} */ (sessionId))
    )
  /**
   * @type {Map<string, Map<string, string[]>>} Per build session: the option labels handed out for each engine question,
   * in order, so a reply's label is read back as the choice at its place (`sentChoiceIdOf`).
   */
  const sentLabels = new Map()

  /**
   * An engine request in the build chat's language (`chatLanguageFor`, `localizedAskOf`), its labels kept per question
   * for the reply. With no known language, or none this host has words for, the request stays as the engine gave it.
   * @param {string} sessionId
   * @param {any} ask
   * @param {any[]} questions - the Contract B questions it was made from
   */
  function localAsk(sessionId, ask, questions) {
    const language = chatLanguageFor(sessionId)
    const words = wordsFor(language)
    const said = words && language ? localizedAskOf(ask, questions, words, language) : ask
    let sent = sentLabels.get(sessionId)
    if (!sent) sentLabels.set(sessionId, (sent = new Map()))
    for (const q of Array.isArray(said?.questions) ? said.questions : [])
      if (typeof q?.id === 'string')
        sent.set(
          q.id,
          (Array.isArray(q.options) ? q.options : []).map((/** @type {any} */ o) => o?.label)
        )
    return said
  }

  /**
   * A reply with the choice it picked named by id, read from the labels handed out for its question; after a restart
   * of this process, from the same request worded again in the same language. A reply that typed its answer, or whose
   * label is not one handed out, is left as it is (`answerOf` then reads it as before).
   * @param {string} sessionId
   * @param {any} question - the Contract B question
   * @param {any} reply
   */
  function withChoiceId(sessionId, question, reply) {
    if ((reply?.custom?.trim() ?? '') !== '' || reply?.choice !== undefined) return reply
    let sent = sentLabels.get(sessionId)?.get(question.id)
    if (!sent) {
      const again = localAsk(sessionId, askRequestOf([question], []), [question])
      sent = again?.questions?.[0]?.options?.map((/** @type {any} */ o) => o.label) ?? []
    }
    const choice = sentChoiceIdOf(question, /** @type {string[]} */ (sent), reply?.selected?.[0])
    return choice === null ? reply : { ...reply, choice }
  }
  /**
   * @type {Map<string, Map<string, string[]>>} Per build session: the plan review requests handed out with a plan, by
   * id (which names the plan revision), with their option labels.
   */
  const reviews = new Map()
  /** @type {Map<string, Set<string>>} Per build session: the answers already stored, as `id + answer JSON`. */
  const stored = new Map()
  /** @type {Map<string, number>} Per build session: until when a start refused for its limit stays paused (ms). */
  const pausedUntil = new Map()
  /** @type {Set<string>} The build sessions whose first research answer already carried the opening sentence. */
  const opened = new Set()
  /**
   * The opening sentence of the build chat, in its language, on the first finished research of a session; null after.
   * @param {string} sessionId
   */
  function openingSay(sessionId) {
    if (opened.has(sessionId)) return null
    opened.add(sessionId)
    return chatWordsIn(chatLanguageFor(sessionId), SAY_STRINGS)?.('say.researchRead') ?? RESEARCH_READ_SAY
  }

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
   * Learn the Contract B questions an engine answer issued. A question the engine asks again (it is on the card, `ask`,
   * so the draft holds no answer to it now: a new research replaced the one it was answered for) forgets the answers
   * stored for it: the owner's answer to it is sent again, never dropped as one already sent.
   * @param {string} sessionId
   * @param {any} result
   */
  function learn(sessionId, result) {
    const known = questionsOf(sessionId)
    for (const q of Array.isArray(result?.questions) ? result.questions : [])
      if (typeof q?.id === 'string') known.set(q.id, q)
    const asked = new Set(
      (Array.isArray(result?.ask?.questions) ? result.ask.questions : []).map((/** @type {any} */ q) => q?.id)
    )
    if (asked.size === 0) return
    const done = setOf(stored, sessionId)
    for (const key of done) if (asked.has(key.slice(0, key.indexOf('\n')))) done.delete(key)
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
      // The owner's interface language, which tracy-web names on every answer to the tool (`caller.js`).
      const language = res.headers?.get?.(INTERFACE_LANGUAGE_HEADER)
      if (typeof language === 'string' && /^[a-z]{2}$/.test(language)) languages.set(sessionId, language)
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
      let answer = answerOf(question, withChoiceId(sessionId, question, reply))
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
   * The link lines research answers (#609, tracy-web `link-reads.js`): one per owner link, its state and plain counts.
   * The chat draws them under the research row; the agent reads them to name a link that gave nothing.
   * @param {unknown} links
   */
  const linksOf = (links) => (Array.isArray(links) && links.length ? { links } : {})

  /**
   * One question for the owner, as the model reads it: the card to pass on, and the sentence to say first if any.
   * @param {any} ask
   * @param {string} [say]
   */
  const askAgain = (ask, say) => ({
    ask,
    ...(say ? { say } : {}),
    next: `${say ? 'Say the sentence in say, then pass' : 'Pass'} ask to ask_user_question exactly as given. ${ANSWERS_ARRIVE_GUIDANCE} When the owner has answered, call tracy_build with action plan again: it reads the answer and goes on from there.`
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
    // Started too often for now (`TRY_LATER`): no fault, nothing to retry, nothing to ask. The sentence says when.
    if (res.status === 429)
      return {
        paused: true,
        say: ownerSay(res.body?.say, TRY_LATER_FALLBACK_SAY),
        ...(typeof res.body?.retryAt === 'string' ? { retryAt: res.body.retryAt } : {}),
        next: PAUSED_NEXT
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
        next: `If the change was a colour and you did not use the exact field, try once more. ${COLOUR_EDIT_GUIDANCE} Otherwise tell the owner plainly, in their language, what could not be changed and why. ${PLAN_CARD_CONTROLS_GUIDANCE} Do not ask a question about it.`
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
    // Research needs the business name and city first (no link and no name): no fault, the agent asks for them.
    if (state?.state === 'needs') return { needs: ['name', 'city'], next: NEEDS_NAME_NEXT }
    if (state?.state === 'stopped') return stoppedStateOf(state, eventsOf(sessionId))
    /** Whether the review this plan answer hands out is open on the owner's screen already. */
    const isOpen = (/** @type {any} */ review) =>
      openReviewsOf(eventsOf(sessionId)).has(review.questions[0]?.id)
    const result = state?.result ?? {}
    // The plan needs one more answer from the owner first (the site name): the question goes on the card.
    if (state?.state === 'asking') {
      learn(sessionId, result)
      if (!result.ask) return stopped()
      return {
        ...askAgain(
          localAsk(sessionId, result.ask, result.questions),
          typeof state.say === 'string' ? ownerSay(state.say) : undefined
        ),
        ...linksOf(result.links)
      }
    }
    if (state?.step === 'research') {
      learn(sessionId, result)
      if (!result.profile) return stopped()
      const say = openingSay(sessionId)
      return {
        profile: result.profile,
        ...(say ? { say } : {}),
        ...(result.ask ? { ask: localAsk(sessionId, result.ask, result.questions) } : {}),
        ...linksOf(result.links),
        next: `${say ? 'Begin with the sentence in say, as it is. ' : ''}${researchNextOf(result)}`
      }
    }
    // A written change request (#617): what changed and what was not done, in the words the engine wrote.
    if (state?.step === 'revise') {
      if (result.brand !== 'own' || !result.plan) return stopped(state.say)
      const review = handOutReview(sessionId, result.plan)
      // The lines with their stable codes side by side (`revision.codes`, only when the step sent codes): the plan card
      // reads the codes back from this answer to say a coded line in the owner's language. Never a reason code.
      const revision = revisedOf(result.revision) ?? { changed: [], notDone: [] }
      const unchanged = result.unchanged === true
      return {
        plan: { id: result.plan.id, revision: result.plan.revision },
        unchanged,
        revision,
        review,
        next: reviewNextOf(
          `${unchanged ? 'Nothing on the plan changed: say so plainly.' : `Say what changed using the sentences in revision.changed, ${IN_OWNER_LANGUAGE}.`} Then say each entry of revision.notDone with its why. ${NOT_DONE_GUIDANCE} Do not say anything else changed. ${revision.codes ? 'revision.codes is for the plan card only: never say a code. ' : ''}${PLAN_CARD_CONTROLS_GUIDANCE}`,
          isOpen(review)
        )
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
          next: `${reviewNextOf('The plan did not change. Say the sentence in say. Never say the plan changed or that the request was applied.', isOpen(review))} Call plan with restart true only if the owner clearly asks to start the plan over.`
        }
      return {
        plan,
        review,
        next: reviewNextOf(
          state.step === 'edit'
            ? 'The plan card shows the change. In one short line, say what you changed.'
            : 'The plan card shows the plan. In one short line, tell the owner their plan is ready for them to review.',
          isOpen(review)
        )
      }
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
          ...linksOf(state.links),
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
    const current = await currentPlanReview(sessionId, assertion)
    if (!current)
      return {
        stale: true,
        next: 'The plan changed since the owner approved it. Call tracy_build with action status, then call ask_user_question with the new review.'
      }
    return {
      stale: true,
      plan: current.plan,
      review: current.review,
      next: reviewNextOf(
        'The plan changed since the owner approved it, so nothing was built. Say in one short line that the plan changed and needs their approval again.',
        current.open
      )
    }
  }

  /**
   * The living plan of the draft, read now, with its review handed out: what an answer that leaves the owner a plan to
   * approve carries. Null when the draft holds no plan or could not be read.
   * @param {string} sessionId
   * @param {string} assertion
   */
  async function currentPlanReview(sessionId, assertion) {
    const res = await door(sessionId, assertion, 'GET', '')
    const current = res?.status === 200 ? res.body?.draft?.plan : null
    if (typeof current?.id !== 'string' || !Number.isInteger(current?.revision)) return null
    const review = handOutReview(sessionId, current)
    return {
      plan: { id: current.id, revision: current.revision },
      review,
      open: openReviewsOf(eventsOf(sessionId)).has(review.questions[0]?.id)
    }
  }

  /**
   * A build answer of the build door, shaped for the model: still building, built, or stopped with one plain sentence.
   * @param {string} sessionId
   * @param {any} assertion
   * @param {any} body
   */
  async function buildResult(sessionId, assertion, body) {
    const build = body?.build
    if (!build) return stopped(BUILD_FAILED_SAY)
    // Refused before any step ran (the site could not be created): no step failed, the plan is kept, and its review is
    // handed out again, since a build that ended without a site gives way to a new approval.
    if (typeof build.notStarted === 'string') {
      const say = build.notStarted === DESIGN_NOT_BUILDABLE ? DESIGN_NOT_BUILDABLE_SAY : SITE_NOT_STARTED_SAY
      // A fresh assertion: the build may have been read for longer than one assertion lives.
      const current = await currentPlanReview(sessionId, actorFor(sessionId) ?? assertion)
      if (!current) return { stopped: true, say }
      return {
        stopped: true,
        say,
        plan: current.plan,
        review: current.review,
        next: reviewNextOf('Say the sentence in say. Never say a step of the build failed.', current.open)
      }
    }
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
    return buildResult(sessionId, assertion, body)
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
    const marked = typeof result?.next === 'string' ? { ...result, next: privately(result.next) } : result
    // The language the cards of this build chat use (`chatLanguageFor`), once known: the cards read it from here.
    const language = chatLanguageFor(/** @type {any} */ (exec)?.agent?.session?.id)
    return language && marked && typeof marked === 'object' ? { ...marked, chatLanguage: language } : marked
  }

  /** @param {unknown} rawArgs @param {any} exec */
  async function run(rawArgs, exec) {
    let args = argsOf(rawArgs)
    const sessionId = exec?.agent?.session?.id
    if (!isBuildChatSession(sessionId))
      return { refused: true, next: 'tracy_build works only in the build chat. Do not call it here.' }
    // The language the owner writes in, as the agent names it on the call; a call that names none keeps the last one.
    const said = chatLanguageTagOf(args.language)
    if (said !== null) spoken.set(sessionId, said)
    // "Please try again." reruns the step that stopped, never reads the stop again: a status call made for it runs the
    // call the stop named (`again`) instead.
    if (args.action === 'status') args = pendingRetryOf(eventsOf(sessionId)) ?? args
    const action = args.action
    if (!ACTIONS.includes(action))
      return {
        refused: true,
        next: 'Call tracy_build with action research, templates, plan, edit, build, status or start-over.'
      }
    // The whole build over (`start-over.mjs`): the owner is asked first, the door is reached only once they agreed.
    if (action === 'start-over' && args.confirm !== true) return startOverQuestion()

    /** @type {[string, string, unknown?]} */
    let request
    if (action === 'research') {
      const links = (Array.isArray(args.links) ? args.links : [])
        .map(text)
        .filter((/** @type {string} */ l) => l !== '')
        .slice(0, LINKS_MAX)
      const description = text(args.description)
      const name = text(args.name)
      const city = text(args.city)
      if (links.length === 0 && description === '' && name === '')
        return {
          refused: true,
          next: "Call tracy_build with action research and the owner's links, or with no link the business name and city the owner gave."
        }
      request = [
        'POST',
        '/research',
        {
          links,
          ...(description !== '' ? { description } : {}),
          ...(name !== '' ? { name } : {}),
          ...(city !== '' ? { city } : {})
        }
      ]
    } else if (action === 'plan') {
      // A request longer than a change request holds is never sent: the owner writes a shorter one.
      if (typeof args.request === 'string' && [...args.request.trim()].length > REQUEST_MAX_LENGTH)
        return {
          refused: true,
          say: REQUEST_TOO_LONG_SAY,
          next: 'Say the sentence in say, then wait for the owner to write a shorter request.'
        }
      const asked = text(args.request)
      // The language the owner writes in, else the cards' (#575): the plan's sentences for the owner are written in it.
      const language = spoken.get(sessionId) ?? chatLanguageFor(sessionId)
      // Starting over is its own intent: sent only when the model set restart to true.
      request = [
        'POST',
        '/compose',
        {
          ...(asked !== '' ? { request: asked } : {}),
          ...(args.restart === true ? { restart: true } : {}),
          ...(language ? { language } : {})
        }
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
    else if (action === 'start-over') request = ['POST', '/start-over', { confirm: true }]
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
      return askAgain(
        localAsk(sessionId, askRequestOf([question], []), [question]),
        tooLongSay(question, limit)
      )
    }
    if (action === 'build') return build(sessionId, assertion)

    // A start still paused for its limit is not asked again: the owner hears an answer, not the same sentence.
    const until = pausedUntil.get(sessionId) ?? 0
    if ((action === 'research' || action === 'plan') && until > now())
      return pausedWithAgain(
        {
          paused: true,
          retryAt: new Date(until).toISOString(),
          minutesLeft: Math.max(1, Math.ceil((until - now()) / 60_000)),
          next: PAUSED_AGAIN_NEXT
        },
        args
      )
    const res = await door(sessionId, assertion, request[0], request[1], request[2])
    if (res === null) return stopped()
    if (res.status === 429) {
      const at = Date.parse(res.body?.retryAt ?? '')
      if (Number.isFinite(at)) pausedUntil.set(sessionId, at)
    }
    if (action === 'start-over') return startOverAnswerOf(res, ownerSay)
    if (res.status < 200 || res.status >= 300) return pausedWithAgain(refusal(res), args)
    if (action === 'templates') {
      const { options, none } = templateChoiceOf(res.body?.templates)
      return { options, none, next: templatesNext(options) }
    }
    const settled = await settle(sessionId, res.body)
    // A plan read back while its approved build runs is not up for review: the build is.
    if (
      action === 'status' &&
      settled &&
      'review' in settled &&
      settled.review &&
      (await buildRunning(sessionId))
    )
      return {
        building: true,
        say: BUILD_LOCKED_SAY,
        next: 'Say the sentence in say. Call tracy_build with action build only when the owner asks how it is going.'
      }
    return settled
  }

  /** Whether the draft's approved build is being created or built now; a read that fails says no. */
  async function buildRunning(/** @type {string} */ sessionId) {
    const assertion = actorFor(sessionId)
    const res = assertion === null ? null : await door(sessionId, assertion, 'GET', '/build')
    return res?.status === 200 && BUILDING.has(res.body?.build?.state)
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
