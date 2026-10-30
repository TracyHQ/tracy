/**
 * The copy-plan stage of a brief build (`prepare`, spec TracyHQ/tracy#189): its budget, its receipt, and what the tidy step
 * may do with a line the plan did not write. CMS-neutral: the Joomla engine calls it today; a WordPress or EmDash engine that
 * runs its planner through `planConcurrently` takes the same three calls.
 *
 * Invariants the stage keeps (each has a stage test in `apps/tracy-web/test/page-one-pass.test.mjs` and `copy-plan-stage.test.mjs`):
 *   1. a line a readable model answer wrote is never lost by a later step of the plan (`mergeAnswer` of the planner);
 *   2. send-backs go out as one concurrent, budgeted round (`planConcurrently`);
 *   3. the budget is sized by the work (`copy-plan-budget.js`), and a call the budget cut is recorded as "deadline";
 *   4. a lost batch is retried split, per page then per section (`answerBatch` of the planner);
 *   5. the receipt lists the keys still pending by reason, and a visible demo line whose only problem is that its call was
 *      lost is never blanked silently: it is "unwritten", with its rule text, for the repair loop;
 *   6. the final check reads those lines as findings (`copy-lines-check.js`), never as clean.
 */
import { COPY_BUDGET, copyBudgetMs, p95Of } from './copy-plan-budget.js'

/** The reasons a planner gives a pending key, by the receipt's four kinds. */
export const PENDING_KINDS = Object.freeze({
  'model-failed': ['model-failed', 'model-unreadable', 'no-answer'],
  deadline: ['deadline'],
  refused: [
    'model-pended',
    'wrong-language',
    'duplicate-copy',
    'ungrounded-count',
    'emptiness-mismatch',
    'too-long',
    'evidence-missing',
    'invented-route'
  ]
})

/** The kinds whose lines were never written because a call was lost, not because the model or a guard refused them. */
export const UNWRITTEN_KINDS = new Set(['model-failed', 'deadline'])

/** The receipt kind of one planner reason; a reason no kind lists (a door's own refusal) is "refused". */
export function pendingKindOf(/** @type {string | undefined} */ reason) {
  for (const [kind, reasons] of Object.entries(PENDING_KINDS))
    if (reasons.includes(String(reason))) return kind
  return 'refused'
}

/**
 * The options the copy plan's `planConcurrently` runs with: the calls in flight, the run's own deadline and stop signal, and
 * the work-sized budget, told to the build (`ctx.wordsDueAt`) so its grace after the site is up waits for the words.
 * @param {any} ctx - the brief build's context
 */
export function copyPlanBudget(ctx) {
  return {
    deadlineAt: Number.isFinite(ctx?.deadlineAt) ? ctx.deadlineAt : Number.POSITIVE_INFINITY,
    stop: ctx?.signal,
    inFlight: COPY_BUDGET.inFlight,
    // The p95 the last build of this process measured, when the build knows one.
    p95Ms: Number.isFinite(ctx?.copyCallP95Ms) ? ctx.copyCallP95Ms : null,
    budgetOf: (/** @type {{calls: number, p95Ms: number | null}} */ work) => copyBudgetMs(work),
    onDue: (/** @type {number} */ at) => ctx?.wordsDueAt?.(at)
  }
}

/**
 * The keys of a plan still pending, by kind; and the keys a page rule still holds against (handed to the rule's writer).
 * @param {{pending?: string[], reasons?: Record<string, string>, owners?: Record<string, string>}} plan
 * @returns {Record<'model-failed' | 'deadline' | 'refused' | 'complaint-unmet', string[]>}
 */
export function pendingByKind(plan) {
  /** @type {Record<'model-failed' | 'deadline' | 'refused' | 'complaint-unmet', string[]>} */
  const out = { 'model-failed': [], deadline: [], refused: [], 'complaint-unmet': [] }
  for (const key of new Set(plan?.pending ?? [])) {
    const kind = /** @type {'model-failed' | 'deadline' | 'refused'} */ (pendingKindOf(plan?.reasons?.[key]))
    out[kind].push(key)
  }
  for (const [key, owner] of Object.entries(plan?.owners ?? {}))
    if (owner !== 'page-copy') out['complaint-unmet'].push(key)
  return out
}

/**
 * Keep what the copy plan cost and left on the build's row: calls, failures, the calls the budget cut, rounds, the per-call
 * p95 (what sizes the next build's budget), and the pending keys by kind.
 * @param {any} ctx
 * @param {{calls: number, failed: number, cut?: number, rounds?: number, callMs?: number[]}} answered
 * @param {any} plan
 */
export function recordCopyPlan(ctx, answered, plan) {
  const time = (/** @type {string} */ name, /** @type {number} */ v) => ctx?.time?.(name, v)
  time('copyCalls', answered.calls)
  time('copyCallsFailed', answered.failed)
  time('copyCallsCut', answered.cut ?? 0)
  time('copyRounds', answered.rounds ?? 1)
  const p95 = p95Of(answered.callMs ?? [])
  if (p95 !== null) {
    time('copyCallP95Ms', p95)
    time('copyCallMaxMs', Math.max(...(answered.callMs ?? [0])))
  }
  const byKind = pendingByKind(plan)
  ctx?.record?.('copyPending', byKind)
  const lost = byKind['model-failed'].length + byKind.deadline.length
  if (byKind.deadline.length > 0)
    ctx?.note?.(
      `${byKind.deadline.length} line(s) of text were cut by the words budget and are sent to the repair turn`
    )
  return { byKind, lost }
}

/**
 * What a page hint asks of a line, as the repair turn is told it.
 * @param {any} hint - the page pass hint of the slot (`page-pass.js`)
 */
export function ruleTextOf(hint) {
  if (hint?.shape)
    return `one sibling of a list: ${hint.shape.sentences.join('-')} sentence(s), ${hint.shape.characters.join('-')} characters, about its own title`
  if (hint?.describe)
    return `the line under "${hint.describe.label ?? hint.describe}": say what it is and what a visitor does in it`
  if (hint?.siblings || hint?.fill)
    return "written for this page's own record, in the shape of its sibling pages"
  if (hint?.action) return `the message of a call-to-action band: invite the visitor to "${hint.action}"`
  return "written for this business in the demo line's length and shape"
}

/**
 * 🔒 THE TIDY STEP NEVER BLANKS A LINE WHOSE ONLY PROBLEM IS THAT ITS CALL WAS LOST (copy-plan stage, invariant 5). The
 * left-demo sweep (`leftDemoWords`) empties a demo line nobody wrote; for a line the model refused that is right, but a
 * line whose call failed or was cut by the budget was never refused: emptying it hid a whole record page's words (R12: 138
 * lines emptied). Such a line is kept out of the blanks and handed to the repair loop as "unwritten", with its rule.
 * @param {{blanks: any[], plan: any, hints?: Record<string, any> | null}} input
 * @returns {{blanks: any[], unwritten: Array<{key: string, reason: string, rule: string}>}}
 */
export function keepUnwritten({ blanks, plan, hints = null }) {
  const lost = new Map()
  for (const key of plan?.pending ?? []) {
    const kind = pendingKindOf(plan?.reasons?.[key])
    if (UNWRITTEN_KINDS.has(kind)) lost.set(key, kind)
  }
  /** @type {Array<{key: string, reason: string, rule: string}>} */
  const unwritten = []
  const kept = []
  for (const slot of blanks ?? []) {
    const kind = lost.get(slot?.key)
    if (kind) unwritten.push({ key: slot.key, reason: kind, rule: ruleTextOf(hints?.[slot.key]) })
    else kept.push(slot)
  }
  return { blanks: kept, unwritten }
}
