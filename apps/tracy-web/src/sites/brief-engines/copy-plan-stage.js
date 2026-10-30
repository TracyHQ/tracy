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
import { hidePlaceOf as contentMapHidePlace } from 'website-opportunities/domain/site-plan-honesty.mjs'

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

/** The item kinds whose items the brief decides (an offering, a person, a contact channel): never taken off for a line. */
const RECORD_KINDS = new Set(['service', 'package', 'person', 'menu_item', 'product', 'event', 'post'])
/** A navigation label is the menu rule's own line (rule 6): it takes the name of its page, never a copy line of a block. */
const NAVIGATION = (/** @type {any} */ slot) =>
  String(slot?.entity ?? '').startsWith('menuItem-') || /menu_label/.test(String(slot?.role ?? ''))
/** Template chrome a block of the page cannot replace: a header or footer position keeps its shape (rule 5). */
const CHROME_POSITION = /header|footer|footnav|navbar|mainnav|topbar|offcanvas/i

/**
 * A line of a block's copy the invariant below holds for: a visible text line of an article or a module with an editorial or
 * step role. A fact (a phone, a video, an address) is its own rule's (`demo-content`, the site plan's honesty), a button
 * label is the button plan's, a menu label the menu's, and a template language string ("Submit") is the template's UI.
 * @param {any} slot
 */
export function isBlockCopyLine(slot) {
  if (!slot || (slot.type !== undefined && slot.type !== 'text')) return false
  if (!/^(article|module)-\d+$/.test(String(slot.entity ?? ''))) return false
  const role = String(slot.role ?? '')
  // A content map older than the role vocabulary names no role: its text lines are read as copy.
  if (role === '') return true
  if (!/^(editorial|step)\./.test(role)) return false
  return !/button|menu_label|navigation|url|video/.test(role)
}

const plainOf = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Where a demo line nobody wrote can go off the page with the template's own hide mechanism, or null when it cannot.
 * `item`: its card is a record of its own (an article of a list); `block`: the module that
 * holds it, unpublished whole (a JSON list emptied in place would leave an empty card, `dropItems`).
 * @param {any} slot
 * @param {{contentMap: any, hidePlaceOf: Function}} input
 */
function removalOf(slot, { contentMap, hidePlaceOf }) {
  const group = slot?.group?.id ? slot.group : null
  const place = group ? hidePlaceOf(contentMap, group.id) : { how: 'none' }
  if (group && (RECORD_KINDS.has(group.kind) || group.kind === 'contact')) return null
  if (group && place.how === 'entity' && place.kind !== 'module') return { ...place, group: group.id }
  const entity = String(slot?.entity ?? '')
  if (!/^module-\d+$/.test(entity)) return null
  const row = (contentMap?.entities ?? []).find((/** @type {any} */ e) => e?.key === entity)
  if (CHROME_POSITION.test(String(row?.identity?.position ?? ''))) return null
  if ((contentMap?.contactBlocks ?? []).some((/** @type {any} */ b) => b?.container === entity)) return null
  // A block that carries the brief's own records (offerings, people) stays: its line goes to the repair loop instead.
  const holds = (contentMap?.slots ?? []).some(
    (/** @type {any} */ s) => s?.entity === entity && RECORD_KINDS.has(String(s?.group?.kind ?? ''))
  )
  if (holds) return null
  return { how: 'entity', entity, kind: 'module' }
}

/**
 * 🔒 EVERY VISIBLE SLOT OF A KEPT BLOCK IS WRITTEN OR REMOVED (spec TracyHQ/tracy#189, R12 group A; COO criteria 1.1, 1.2,
 * 1.5, 4.3). The tidy step settles each demo line the copy plan left unwritten into exactly one of two states:
 *   - its call was lost (`model-failed`, `deadline`): it keeps the demo's words for now and goes to the repair loop as
 *     "unwritten" (invariant 5 above);
 *   - the model refused it, or no writer could word it: its item or block comes off with the template's own hide mechanism
 *     (a record of its own unpublished, the module unpublished whole) when the template allows; else it keeps the demo's
 *     words and goes to the repair loop as "unwritten" too. Never emptied in place: an emptied line in a kept block is the
 *     `&nbsp;` card of R12.
 * The final check reads every unwritten line as a blocker (`copy-lines`, registry rule `copy-lines-kept`), so a site whose
 * repair could not write them stops at "Needs fixes". A navigation label, a line with no demo words and a line of a block
 * already taken off pass through as blanks. CMS-neutral: the content map's groups and entities decide; the engine applies
 * `hides` (`item` and `entity` places) and `modules` (a block unpublished whole).
 * @param {{blanks: any[], plan: any, hints?: Record<string, any> | null, contentMap: any, hidePlaceOf?: Function,
 *   removed?: {entities?: Iterable<string>, groups?: Iterable<string>}, slots?: any[], written?: Record<string, unknown>,
 *   unsafe?: Set<string>}} input
 *   `slots`: the visible slots; `written`: the words about to be written, by key; `unsafe`: the keys whose demo words
 *   must never be served (the demo company's name or facts)
 * @returns {{blanks: any[], unwritten: Array<{key: string, reason: string, rule: string, sample: string}>, hides: any[],
 *   modules: string[], removedKeys: string[]}}
 */
export function settleKeptSlots({
  blanks,
  plan,
  hints = null,
  contentMap,
  hidePlaceOf = contentMapHidePlace,
  removed = {},
  slots = [],
  written = {},
  unsafe = new Set()
}) {
  const lost = new Map()
  for (const key of plan?.pending ?? []) lost.set(key, pendingKindOf(plan?.reasons?.[key]))
  const goneEntities = new Set(removed.entities ?? [])
  const goneGroups = new Set(removed.groups ?? [])
  /** @type {Map<string, any>} */
  const hides = new Map()
  const modules = new Set()
  /** @type {Array<{key: string, reason: string, rule: string, sample: string}>} */
  const unwritten = []
  const kept = []
  const removedKeys = []
  const keep = (/** @type {any} */ slot, /** @type {string} */ reason) =>
    unwritten.push({
      key: slot.key,
      reason,
      rule: ruleTextOf(hints?.[slot.key]),
      sample: plainOf(slot.sample)
    })
  for (const slot of blanks ?? []) {
    const shows = plainOf(slot?.sample) !== '' && (slot?.type === undefined || slot.type === 'text')
    if (!shows || NAVIGATION(slot) || !isBlockCopyLine(slot)) {
      kept.push(slot)
      continue
    }
    if (goneEntities.has(slot.entity) || (slot.group?.id && goneGroups.has(slot.group.id))) {
      kept.push(slot)
      continue
    }
    const kind = lost.get(slot.key) ?? 'refused'
    if (UNWRITTEN_KINDS.has(kind)) {
      keep(slot, kind)
      continue
    }
    const place = removalOf(slot, { contentMap, hidePlaceOf })
    // A line whose demo words name the demo company or state its facts is never served, even for the repair loop: it is
    // emptied and the engine reports it as "blanked", a blocker of its own until it is written.
    if (!place && unsafe.has(slot.key)) {
      kept.push(slot)
      continue
    }
    if (!place) {
      keep(slot, kind)
      continue
    }
    removedKeys.push(slot.key)
    kept.push(slot)
    if (place.how === 'entity' && place.kind === 'module' && !place.group) modules.add(place.entity)
    else
      hides.set(place.group ?? place.entity, {
        ...place,
        group: place.group,
        reason: 'kept-slot-unwritten'
      })
  }
  // A copy line whose call was lost and that no later writer wrote is unwritten too, whether or not the sweep listed it.
  const listed = new Set((blanks ?? []).map((/** @type {any} */ b) => b?.key))
  for (const slot of slots ?? []) {
    if (listed.has(slot?.key) || !isBlockCopyLine(slot) || plainOf(slot.sample) === '') continue
    if (!UNWRITTEN_KINDS.has(lost.get(slot.key) ?? '')) continue
    if (plainOf(written?.[slot.key]) !== '' && plainOf(written?.[slot.key]) !== plainOf(slot.sample)) continue
    if (goneEntities.has(slot.entity) || (slot.group?.id && goneGroups.has(slot.group.id))) continue
    keep(slot, /** @type {string} */ (lost.get(slot.key)))
  }
  // A line kept for the repair loop inside a block taken off for another line goes with the block.
  const settled = unwritten.filter((u) => {
    const slot =
      (blanks ?? []).find((/** @type {any} */ s) => s?.key === u.key) ??
      (slots ?? []).find((/** @type {any} */ s) => s?.key === u.key)
    const off = modules.has(slot?.entity) || (slot?.group?.id && hides.has(slot.group.id))
    if (off) {
      if (listed.has(u.key)) kept.push(slot)
      removedKeys.push(u.key)
    }
    return !off
  })
  return { blanks: kept, unwritten: settled, hides: [...hides.values()], modules: [...modules], removedKeys }
}
