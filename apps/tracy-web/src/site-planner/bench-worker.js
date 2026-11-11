// The site planner bench worker (ADR 0041, #301, #303): the planner as a step of the shared bench run loop
// (lib/bench-run-loop.js, #327), which claims the queued run, plays its rounds, applies fix round change lists and
// stores every call. This file says what is the planner's own: the approved planner prompt, the plan checker, the
// plan's change rules and messages, and how a run calls its model.
//
// Before any model call of a claim, the kit's images are made ready (kit-images.js): a kit whose zip is missing or
// whose images do not match the kit fails the run with that code and reason. A model the door gives no images (a
// text-only model on a kit with every look, door.js) skips this and is offered no image tool. The saved turns keep a
// reference for each opened image, and the images are read back from the cache when the run resumes or a fix round
// replays them.
//
// A model given no images reads no part either: its first message carries the whole kit (kit-source.js
// preloadedFirstMessage) and the run sends no tools, so its first answer is the plan. A run that reads with tools gets
// the write step: after the harness's writeAfterToolTurns answers that called a tool, or an answer that only re-read
// parts already sent, WRITE_STEP_MESSAGE goes out and every later request carries tool_choice "none". A run whose
// answered calls cost at least the harness's budgetUsd stops before its next call with SITE_PLANNER_BUDGET.
import { BENCH_QUEUE, createBenchQueue } from '../lib/bench-run-loop.js'
import { withStockScreensDropped } from '../lib/stock-screens.js'
import { SITE_PLANNER_STORE } from './bench-store.js'
import { sitePlannerDoor } from './door.js'
import { PLANNER_BRIEF_VIEW, plannerBriefView } from './brief-view.js'
import { kitImagesFor } from './kit-images.js'
import {
  FIRST_MESSAGE_PARTS,
  firstUserMessage,
  kitTools,
  openKit,
  preloadedFirstMessage,
  WRITE_PLAN_INSTRUCTION
} from './kit-source.js'
import { oversizedReplacements, smallEditsMessage } from './plan-change-size.js'
import {
  CHANGES_INSTRUCTION,
  invalidChangesMessage,
  isChangeList,
  PLAN_CHANGE_RULES,
  WHOLE_PLAN_MESSAGE
} from './plan-changes.js'
import { CHECKER_VERSION, checkPlan, failureListText } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'
import { VISUAL_REVIEW_POLICY, visualReviewInstruction, withVisualReview } from './visual-review.js'

export { BENCH_QUEUE }

/** Fix rounds after round 0: round 2 is the last plan scored. */
export const MAX_FIX_ROUNDS = 2

/** What a round whose answer is not a plan sends back, as its failure list. */
export const NOT_A_PLAN_MESSAGE =
  'Your answer is not a plan. Answer with the whole plan as one JSON object, with nothing before or after it.\n'

/** What a run that reads with tools is told once it has read enough (the write step). */
export const WRITE_STEP_MESSAGE = `You have read enough of the kit: everything you need is in this conversation, and no more tool calls are possible. ${WRITE_PLAN_INSTRUCTION}`

/** The site planner as a bench step (lib/bench-run-loop.js). */
export const SITE_PLANNER_STEP = Object.freeze({
  name: 'site-planner',
  codePrefix: 'SITE_PLANNER',
  store: SITE_PLANNER_STORE,
  maxFixRounds: MAX_FIX_ROUNDS,
  prompt: plannerPrompt,
  checker: Object.freeze({
    version: CHECKER_VERSION,
    check: ({ doc, row, ready, history }) => {
      const result = checkPlan({
        plan: doc,
        kit: ready.kit.doc,
        brief: row.brief,
        briefRef: briefRefOf(row.brief_source)
      })
      return row.harness?.visualReview === VISUAL_REVIEW_POLICY
        ? withVisualReview(result, { plan: doc, kit: ready.kit.doc, kitRef: row.kit.ref, history })
        : result
    },
    failureListText
  }),
  // After the model, before the checker: every stock screen of the kit (site.stockScreens) is dropped, on a whole plan and on the
  // plan a fix round's change list leaves, so no answer keeps one (lib/stock-screens.js). A kit without the field changes nothing.
  readAnswer: (value, { ready }) =>
    value && typeof value === 'object' && !isChangeList(value)
      ? withStockScreensDropped(value, ready?.kit?.doc)
      : value,
  changes: Object.freeze({
    applyValidChanges: (previous, list, { ready } = {}) => {
      const applied = PLAN_CHANGE_RULES.applyValidChanges(previous, list)
      return applied.ok ? { ...applied, doc: withStockScreensDropped(applied.doc, ready?.kit?.doc) } : applied
    },
    oversized: oversizedReplacements,
    smallEditsMessage,
    invalidChangesMessage
  }),
  messages: Object.freeze({
    changesInstruction: CHANGES_INSTRUCTION,
    wholeDoc: WHOLE_PLAN_MESSAGE,
    notADoc: NOT_A_PLAN_MESSAGE
  }),
  prepare,
  agentRequest
})

/**
 * @param {{ pool: import('pg').Pool, secret: string, config: any, fetchImpl?: typeof fetch,
 *   balanceFetch?: typeof fetch, index?: Map<string, object>, kitImages?: { ensure: Function }, log?: Console,
 *   now?: () => number, retry?: object }} deps `balanceFetch` reads the provider balance (fetchImpl unless given)
 *   `config` locates the image cache and the releases credential; `kitImages` replaces the release zips (tests);
 *   `retry` replaces the run's retry policy (tests that kill the process mid call, which no retry may outlive).
 */
export function createSitePlannerQueue({
  pool,
  secret,
  config,
  fetchImpl = fetch,
  balanceFetch = fetchImpl,
  index,
  kitImages = kitImagesFor({ pool, config, fetchImpl }),
  log = console,
  now,
  retry
}) {
  return createBenchQueue(SITE_PLANNER_STEP, {
    pool,
    secret,
    fetchImpl,
    balanceFetch,
    index,
    kitImages,
    retry,
    log,
    now
  })
}

// What the planner's runAgent call carries besides the conversation. A model given no images gets the whole kit and
// no tools; a run that already went out with tools (saved before the kit was preloaded) keeps them, since its
// conversation holds tool calls.
function agentRequest({ row, ready, history }) {
  const brief = plannerBriefView(row.brief, row.harness?.briefView)
  const preloaded = !ready.images && (history.length === 0 || !history[0].request?.tools?.length)
  const imageTool = Boolean(ready.images)
  const strict = row.harness?.visualReview === VISUAL_REVIEW_POLICY
  const writeAfter = strict ? null : row.harness?.writeAfterToolTurns
  return {
    firstUser: preloaded
      ? preloadedFirstMessage({ kit: ready.kit, brief })
      : firstUserMessage({
          kit: ready.kit,
          brief,
          imageTool,
          visualReviewText: strict ? visualReviewInstruction(ready.kit.doc) : undefined
        }),
    tools: preloaded
      ? []
      : kitTools(ready.kit.doc, {
          images: ready.images,
          imageTool,
          history,
          inFirstMessage: FIRST_MESSAGE_PARTS
        }),
    ...(!preloaded && writeAfter
      ? { writeStep: { afterToolTurns: writeAfter, message: WRITE_STEP_MESSAGE } }
      : {}),
    resolveImage: ready.images?.resolve
  }
}

// Everything the run was started with must still hold (the loop checks the prompt and the checker first): a run that
// silently ran on another model, or a kit the server no longer reads, would not measure what it records.
async function prepare({ pool, secret, index, kitImages }, row) {
  if (row.harness?.briefView !== PLANNER_BRIEF_VIEW)
    return {
      ok: false,
      code: 'SITE_PLANNER_BRIEF_VIEW_CHANGED',
      reason: 'The planner brief view changed since the run started; start a new run instead of replaying it.'
    }
  const kit = openKit(row.kit?.ref, index ? { index } : {})
  if (!kit)
    return { ok: false, code: 'SITE_PLANNER_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const door = await sitePlannerDoor({
    pool,
    secret,
    kit,
    sendsImages: () => row.harness?.images !== false
  })
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === row.door?.[k])
  if (!same)
    return {
      ok: false,
      code: 'SITE_PLANNER_DOOR_CHANGED',
      reason: `the door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${row.door?.providerId} ${row.door?.model}`
    }
  // A model given no images (door.js) plans from the looks: no image zip, no image tool.
  if (!door.snapshot.images) return { ok: true, kit, door: door.door, images: null }
  const images = await kitImages.ensure(kit)
  if (!images.ok) return images
  return { ok: true, kit, door: door.door, images: images.images }
}

const briefRefOf = (source) => String(source?.revisionId ?? source?.name ?? '')
