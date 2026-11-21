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
//
// Writing turns (ADR 0045 stage 1, off by default): a run started with harness.planTurns writes round 0 in turns of
// one conversation (plan-turns.js): turn 1 plans the whole site, then each page group of the kit has a turn of its own,
// in kit order. The turns' plans are merged into one plan, read and checked once as before; after each group's turn
// the page-local rules run on that group alone and the round records what they found (reading.turnChecks). Such a
// run's write step asks for the turn's answer instead of the complete plan (WRITE_TURN_STEP_MESSAGE).
import { BENCH_QUEUE, createBenchQueue } from '../lib/bench-run-loop.js'
import { withStockScreensDropped } from '../lib/stock-screens.js'
import { SITE_PLANNER_STORE } from './bench-store.js'
import { sitePlannerDoor } from './door.js'
import { PLANNER_BRIEF_VIEW, plannerBriefView } from './brief-view.js'
import { kitImagesFor } from './kit-images.js'
import {
  FIRST_MESSAGE_PARTS,
  firstUserMessage,
  kitIndexFirstMessage,
  wholeKitFirstMessage,
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
import { withHiddenLinkLabels, withHiddenListLinks } from './plan-hidden-links.js'
import { withDemoVideosHidden } from './plan-demo-videos.js'
import { withWrittenRowFieldsShown } from './plan-row-fields.js'
import { withKitCharacterLimits } from './plan-kit-limits.js'
import { withSlotsInTheirBlocks } from './plan-slot-owners.js'
import { framedPartMessage, frameInstruction, framesPlan, mergeFramedPlan } from './plan-frame.js'
import { mergePlanParts, partFirstMessages, planningParts, plansInParts } from './plan-parts.js'
import { openContentMap } from '../lib/content-map-source.js'
import { receiverHideReview } from '../lib/receiver-hide-review.js'
import {
  firstTurnMessage,
  groupTurnCheck,
  groupTurnMessage,
  mergePlanTurns,
  plansInTurns,
  turnGroups
} from './plan-turns.js'
import { VISUAL_REVIEW_POLICY, visualReviewInstruction, withVisualReview } from './visual-review.js'

export { BENCH_QUEUE }

/** Fix rounds after round 0: round 2 is the last plan scored. */
export const MAX_FIX_ROUNDS = 2

/** What a round whose answer is not a plan sends back, as its failure list. */
export const NOT_A_PLAN_MESSAGE =
  'Your answer is not a plan. Answer with the whole plan as one JSON object, with nothing before or after it.\n'

/** What a run that reads with tools is told once it has read enough (the write step). */
export const WRITE_STEP_MESSAGE = `You have read enough of the kit: everything you need is in this conversation, and no more tool calls are possible. ${WRITE_PLAN_INSTRUCTION}`

/** The write step of a run that plans in turns (plan-turns.js): the answer the turn asks for, not the complete plan. */
export const WRITE_TURN_STEP_MESSAGE =
  'You have read enough of the kit: everything you need is in this conversation, and no more tool calls are possible. Write the answer this turn asks for now, as one JSON object in a single ```json fenced block; no tool calls.'

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
        briefRef: briefRefOf(row.brief_source),
        receiver: ready.receiver ?? null
      })
      return row.harness?.visualReview === VISUAL_REVIEW_POLICY
        ? withVisualReview(result, { plan: doc, kit: ready.kit.doc, kitRef: row.kit.ref, history })
        : result
    },
    failureListText
  }),
  // After the model, before the checker, on a whole plan and on the plan a fix round's change list leaves (normalizedPlan).
  readAnswer: (value, { ready }) =>
    value && typeof value === 'object' && !isChangeList(value)
      ? normalizedPlan(value, ready?.kit?.doc)
      : value,
  changes: Object.freeze({
    applyValidChanges: (previous, list, { ready } = {}) => {
      const applied = PLAN_CHANGE_RULES.applyValidChanges(previous, list)
      return applied.ok ? { ...applied, doc: normalizedPlan(applied.doc, ready?.kit?.doc) } : applied
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
  // Parallel parts (plan-parts.js): each part's first message, or null when the run plans round 0 as before; then the
  // merge of the parts' plans into one, normalized like any answer.
  parts: ({ row, ready }) => {
    // A framed run (plan-frame.js): the page parts, each made from the frame's answer, then the frame, asked first.
    if (framesPlan(row.harness)) {
      const n = row.harness.framedParts
      const { firstUser } = agentRequest({ row, ready, history: [] })
      const withFrame = (text) =>
        typeof firstUser === 'string'
          ? `${firstUser}\n\n${text}`
          : Array.isArray(firstUser)
            ? [...firstUser, { type: 'text', text }]
            : text
      return [
        ...Array.from({ length: n }, (_, part) => ({
          about: [`page part ${part + 1}`],
          firstUserFor: (frame) => framedPartMessage(firstUser, frame, ready.kit.doc, part, n)
        })),
        { about: ['frame'], leads: true, firstUser: withFrame(frameInstruction(n)) }
      ]
    }
    if (!plansInParts(row.harness)) return null
    const groups = planningParts(ready.kit.doc, row.harness.parallelPages)
    if (groups.length < 2) return null
    const { firstUser } = agentRequest({ row, ready, history: [] })
    return partFirstMessages(firstUser, groups, ready.kit.doc).map((message, part) => ({
      about: groups[part],
      firstUser: message
    }))
  },
  mergeParts: (values, { row, ready }) =>
    framesPlan(row.harness)
      ? normalizedPlan(mergeFramedPlan(values, ready.kit.doc, row.harness.framedParts).plan, ready.kit.doc)
      : normalizedPlan(
          mergePlanParts(values, planningParts(ready.kit.doc, row.harness.parallelPages), ready.kit.doc),
          ready.kit.doc
        ),
  // Writing turns of one conversation (plan-turns.js), only for a run started with harness.planTurns: turn 1's message
  // (the run's own first message, then what the turn decides), each page group's, then the merge of the turns' plans
  // (read like any answer by readAnswer), and the page-local check of each group's turn.
  writesInTurns,
  turnsInOneConversation: true,
  nextTurn: ({ row, ready, answers }) =>
    answers.length === 0
      ? firstTurnMessage(agentRequest({ row, ready, history: [] }).firstUser, ready.kit.doc)
      : groupTurnMessage(answers.length, ready.kit.doc),
  mergeTurns: (answers, { ready }) => mergePlanTurns(answers, ready.kit.doc),
  checkTurn: ({ row, ready, answers }) =>
    groupTurnCheck({
      answers,
      kit: ready.kit.doc,
      read: (plan) => normalizedPlan(plan, ready.kit.doc),
      check: (plan) =>
        checkPlan({
          plan,
          kit: ready.kit.doc,
          brief: row.brief,
          briefRef: briefRefOf(row.brief_source),
          receiver: ready.receiver ?? null
        })
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
  const visualReviewText = strict ? visualReviewInstruction(ready.kit.doc) : undefined
  // With images, a run frozen with kitInFirstMessage gets the whole kit in its first message and keeps the image tool.
  const whole =
    !preloaded && imageTool && row.harness?.kitInFirstMessage === true
      ? wholeKitFirstMessage({ kit: ready.kit, brief, visualReviewText })
      : !preloaded && imageTool && row.harness?.kitIndexInFirstMessage === true
        ? kitIndexFirstMessage({ kit: ready.kit, brief, visualReviewText })
        : null
  return {
    firstUser: preloaded
      ? preloadedFirstMessage({ kit: ready.kit, brief })
      : (whole?.text ?? firstUserMessage({ kit: ready.kit, brief, imageTool, visualReviewText })),
    tools: preloaded
      ? []
      : kitTools(ready.kit.doc, {
          images: ready.images,
          imageTool,
          history,
          inFirstMessage: whole?.inFirstMessage ?? FIRST_MESSAGE_PARTS
        }),
    ...(!preloaded && writeAfter
      ? {
          writeStep: {
            afterToolTurns: writeAfter,
            message: writesInTurns({ row, ready }) ? WRITE_TURN_STEP_MESSAGE : WRITE_STEP_MESSAGE
          }
        }
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
  // What the site's receiver can take off (lib/receiver-hide-review.js), for the check's R27: read once a claim. Only
  // the Joomla receiver keeps a hide review; another platform's plan skips R27.
  const receiver =
    kit.platform === 'joomla'
      ? receiverHideReview(kit.doc, openContentMap(kit.ref, index ? { index } : {})?.doc ?? null)
      : null
  // A model given no images (door.js) plans from the looks: no image zip, no image tool.
  if (!door.snapshot.images) return { ok: true, kit, door: door.door, images: null, receiver }
  const images = await kitImages.ensure(kit)
  if (!images.ok) return images
  return { ok: true, kit, door: door.door, images: images.images, receiver }
}

const briefRefOf = (source) => String(source?.revisionId ?? source?.name ?? '')

// Whether this run writes round 0 in turns: it was started with harness.planTurns, and its kit has a page group.
function writesInTurns({ row, ready }) {
  return plansInTurns(row.harness) && turnGroups(ready.kit.doc).length > 0
}

// What code settles in a plan without the model, after each answer and before the checker:
// - every stock screen of the kit (site.stockScreens) is dropped, so no answer keeps one (lib/stock-screens.js); a kit
//   without the field changes nothing;
// - a link left undecided under a list or row the plan hides is hidden with it (plan-hidden-links.js);
// - a copy entry without maxCharacters, or with one above the kit's limit, gets the kit's limit (plan-kit-limits.js);
// - a template demo video a kept block still shows, left undecided, is hidden (plan-demo-videos.js);
// - the label of a link the decision hides, written by the same decision, is hidden with it, unless several kit blocks
//   print it, and a page control (a tab, a form's submit) whose words the decision writes is kept, whether the decision
//   hid it or left it undecided (plan-hidden-links.js);
// - a field of a kept list row that the decision both writes and hides is written (plan-row-fields.js).
function normalizedPlan(plan, kit) {
  return withWrittenRowFieldsShown(
    withHiddenLinkLabels(
      withDemoVideosHidden(
        withKitCharacterLimits(
          withHiddenListLinks(withSlotsInTheirBlocks(withStockScreensDropped(plan, kit), kit), kit),
          kit
        ),
        kit
      ),
      kit
    ),
    kit
  )
}
