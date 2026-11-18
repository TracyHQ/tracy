// A customer's plan edit, held to the rules gate (ticket #593; called by the partial re-run, #599). `checkPlanEdit`
// (Contract B) knows the plan only, not the block store, so it cannot know how many items a block holds. This applies
// the edit with `applyPlanEdit` (inside `checkPlanEdit`), then runs the gate's count, kind, main block, fact field and
// library checks on the edited plan, and counts the pictures summary again (`recountedPictures`, #595). Problems are
// worded for the customer. A changed fact value is written back to the needs profile, item fields included, so the page
// writer reads the customer's value. The child list rows follow the edited data: they are planned again by the same
// rules in the customer's item order (`plan-edit-rows.mjs`: an item taken off a block takes its rows with it) and held
// to the block store; the left out entries of the rules are written again, and every row is accounted for.
//
// A plan edit that carries one operation (#575 plan card: take a part off, bring it back, go back to the original) is
// held by `gateOperatedPlan` to the same checks after the operation (`plan-operations.mjs`), so a part taken off can
// never leave a plan an edit could not have made.
import { checkPlanEdit, planEditReferenceProblems } from './build-contract-plan-edit.mjs'
import { checkBuildDocument } from './build-contract.mjs'
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { blockMapOf } from './plan-composer.mjs'
import { ITEM_NOUNS } from './plan-data.mjs'
import { planDataOfPlan } from './plan-data-of-plan.mjs'
import { pageValidityProblems } from './plan-gate-page-rules.mjs'
import { keptBlockProblems } from './plan-gate-rules.mjs'
import { withHoursDisplay } from './plan-hours-display.mjs'
import { generatedOf } from './plan-look-pictures.mjs'
import { pictureCountProblems } from './plan-picture-count.mjs'
import { recountedPictures } from './plan-picture-recount.mjs'
import { withheldWhatOf } from './plan-withheld.mjs'
import { replanRows } from './plan-edit-rows.mjs'
import { editedIdProblems } from './plan-edit-withheld.mjs'
import { editRefusals } from './plan-edit-words.mjs'
import { editedNameProblems } from './plan-edit-site-name.mjs'
import { renameItems } from './plan-edit-item-names.mjs'
import { SEARCH_TERMS_MAX, madeTermsOf, ownerTermsOf, withSearchTerms } from './plan-intent-seo.mjs'
import { OPERATION_REFUSALS, operationRefusal, removeFromPlan, restoreToPlan } from './plan-operations.mjs'
import { TEXT_LIMITS, textLength } from './build-contract-shapes.mjs'
import { normalisedSiteName, withheldShowing } from './plan-site-name.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const FACT_VALUE = /^facts\[([^\]]+)\]\.value$/
const SEARCH_TERMS = /^pages\[([^\]]+)\]\.seo\.searchTerms$/

/** The owner's words for a search term list the card cannot save, each with its code. */
const TERM_REFUSALS = Object.freeze({
  search_terms_empty: 'A page keeps at least one search term.',
  search_term_too_long: `A search term has at most ${TEXT_LIMITS['searchTerms[]']} characters.`,
  search_term_twice: 'This search term is already on the page.',
  too_many_search_terms: `A page has at most ${SEARCH_TERMS_MAX} search terms.`
})

/** The codes of a section's problems after a change (`customerMessage`). */
const BLOCK_CODES = Object.freeze([
  'too_few_items',
  'too_many_items',
  'wrong_item_kind',
  'library_rule',
  'invented_item',
  'fact_without_field',
  'main_block_missing',
  'unknown_block'
])
/**
 * A change the door refuses because the plan as it stands already fails a rule the change did not touch: the same
 * check fails on the unchanged plan. The card says so instead of asking the owner to try again (#575 stand: every card
 * edit was refused for a part the composer had made).
 */
export const PLAN_FAULT = 'plan_fault'
export const PLAN_FAULT_MESSAGE =
  'This change was not saved: your plan has a problem of its own that Tracy has to fix first. You can ask for the change in the chat.'

/**
 * Every code the plan edit door can refuse with, each with owner facing words on the plan card (`plan.refused.<code>`,
 * tracy-build-chat). A problem of any other code is answered as `edit_invalid`, its own code kept in `details.code`.
 */
export const EDIT_DOOR_CODES = Object.freeze([
  ...new Set([
    ...Object.keys(OPERATION_REFUSALS),
    ...Object.keys(TERM_REFUSALS),
    ...BLOCK_CODES,
    'withheld_shown',
    'edit_invalid',
    'site_name_too_long',
    'site_name_invalid',
    'value_over_limit',
    'data_unaccounted',
    'picture_count',
    'item_field_fact',
    'trade_terms',
    'trade_fact_missing',
    'item_repeated_on_page',
    'form_without_destination',
    'map_without_address',
    // tracy-web's door refuses an edit that moves the plan to another template before the gate runs.
    'template_change',
    PLAN_FAULT
  ])
])
const KNOWN_CODES = new Set(EDIT_DOOR_CODES)
/** A refusal whose problems all carry a code of `EDIT_DOOR_CODES`. */
function coded(result) {
  if (result.ok) return result
  return {
    ...result,
    problems: result.problems.map((p) =>
      KNOWN_CODES.has(p.code) ? p : { ...p, code: 'edit_invalid', details: { ...p.details, code: p.code } }
    )
  }
}

/** The coded problems of the search term lists an edit sets. */
function searchTermProblems(edit) {
  const problems = []
  for (const { field, value } of list(edit?.changes)) {
    if (!SEARCH_TERMS.test(field ?? '') || !Array.isArray(value)) continue
    const terms = value.map((t) => (typeof t === 'string' ? t.trim() : t))
    const code =
      terms.length === 0
        ? 'search_terms_empty'
        : terms.some((t) => typeof t !== 'string' || t === '')
          ? 'search_terms_empty'
          : terms.some((t) => textLength(t) > TEXT_LIMITS['searchTerms[]'])
            ? 'search_term_too_long'
            : new Set(terms.map((t) => t.toLowerCase())).size < terms.length
              ? 'search_term_twice'
              : terms.length > SEARCH_TERMS_MAX
                ? 'too_many_search_terms'
                : null
    if (code) problems.push({ code, at: `changes[${field}].value`, message: TERM_REFUSALS[code] })
  }
  return problems
}

/** The customer's words for a page rule an edited plan breaks (`pageValidityProblems`). */
const PAGE_RULE_WORDS = Object.freeze({
  item_repeated_on_page: 'This change would show the same thing twice on one page.',
  form_without_destination: 'A form needs an email address its messages can go to.',
  map_without_address: 'A map needs your address.',
  withheld_shown: 'This change would show something you keep off your site.',
  other: 'This change would leave a page your site cannot show.'
})

/** The customer's words for one gate problem of a block. */
function customerMessage(code, block, description, data, id, withheld) {
  const noun = ITEM_NOUNS[BLOCK_TYPES[description.type]?.itemKind] ?? 'items'
  const items = block.data.filter((x) => data.byId.get(x)?.what === 'item').length
  const record = data.byId.get(id)
  // A held item is named by its neutral label: its own label or id can carry a held person's name.
  const name = data.withheld?.has(id) ? withheldWhatOf(record, withheld) : (record?.entry?.label ?? id)
  const words = {
    too_few_items: `The ${block.label} section shows at least ${description.items.min} ${noun}; this change leaves ${items}.`,
    too_many_items: `The ${block.label} section shows at most ${description.items.max} ${noun}; this change gives it ${items}.`,
    wrong_item_kind: `The ${block.label} section cannot show ${name}.`,
    library_rule: `The ${block.label} section does not show ${name}.`,
    invented_item: `${name} is not one of your business details.`,
    fact_without_field: `The ${block.label} section has no place for ${name}.`,
    item_field_fact: `The ${block.label} section shows a whole item, not one of its details.`,
    trade_terms: `The ${block.label} section is written from what your trade usually does, so it cannot state a number, a price, a schedule or a promise.`,
    trade_fact_missing: `The ${block.label} section is written from what your trade usually does and needs the detail that shows you do it.`
  }
  return words[code] ?? `The ${block.label} section cannot take this change.`
}

/**
 * A copy of the profile with every fact value the edit changed, an item field's included, and every item renamed on
 * the card under its new name (`plan-edit-item-names.mjs`).
 */
function profileAfterEdit(profile, edit, plan) {
  const next = structuredClone(profile)
  const data = planDataOfPlan(next, plan)
  let changed = false
  for (const { field, value } of edit.changes) {
    const id = FACT_VALUE.exec(field)?.[1]
    const record = id && data.byId.get(id)
    if (record?.what !== 'fact') continue
    record.source.value = value
    // The business name edited on the card is the customer's own choice of the name the site shows, as answering the
    // site name question is: one rule decides which held name it shows (`withheldShowing`).
    if (record.kind === 'business.name' && typeof value === 'string' && next.withheld?.name === true)
      next.withheld = withheldShowing(next.withheld, normalisedSiteName(value))
    record.source.sources = [ANSWER_SOURCE]
    const conflict = list(next.conflicts).find((c) => c.id === record.source.conflict)
    if (conflict) Object.assign(conflict, { chosen: value, chosenBy: 'plan-edit' })
    changed = true
  }
  if (renameItems(data, edit.changes)) changed = true
  if (changed && !list(next.sources).some((s) => s.id === ANSWER_SOURCE))
    next.sources = [...list(next.sources), { id: ANSWER_SOURCE, origin: 'answer' }]
  return next
}

/** A customer's plan edit held to the gate (`gateEditedPlan`), its problems not yet coded. */
function editedPlanOf({ plan, edit, profile, blockStore, pageRecipes, library = [] }) {
  const failed = (problems) => ({ ok: false, plan: null, profile: null, problems })
  // The rows are planned again after the edit, so the edit is checked on the plan without them.
  const bare = bareOf(plan)
  const edited = Array.isArray(edit?.changes) && edit.changes.every((c) => c && typeof c === 'object')
  // The edited name is checked first: a name that names a held person would otherwise read as a held item.
  const nameProblems = edited ? editedNameProblems({ plan, edit, profile, blockStore, library }) : []
  if (nameProblems.length > 0) return failed(nameProblems)
  const termProblems = edited ? searchTermProblems(edit) : []
  if (termProblems.length > 0) return failed(termProblems)
  const early = edited ? editedIdProblems({ plan, edit, profile: profileAfterEdit(profile, edit, plan) }) : []
  if (early.length > 0) return failed(early)
  const terms = new Map(
    edit.changes.flatMap((c) => {
      const page = SEARCH_TERMS.exec(c.field)?.[1]
      return page ? [[page, c.value.map((t) => t.trim())]] : []
    })
  )
  // A page whose terms the owner sets loses its old marks before the edit is checked: they describe the list before,
  // and `gatedPlan` marks the new list again from that list (`ownerTermsOf`). Kept, an added term the owner takes off
  // again would still be marked as added, and the edit refused.
  const checked = checkPlanEdit(edit, Array.isArray(plan?.pages) ? withoutMarks(bare, terms) : plan)
  if (!checked.ok) return failed(editRefusals(checked.problems, plan))
  const after = profileAfterEdit(profile, edit, plan)
  const changed = new Set(edit.changes.map((c) => FACT_VALUE.exec(c.field)?.[1]).filter(Boolean))
  const asked = edit.changes.find((c) => c.field === 'pictures.generated.frames')?.value
  const gated = gatedPlan(checked.plan, {
    plan,
    profile,
    after,
    changed,
    asked,
    terms,
    blockStore,
    pageRecipes,
    library
  })
  return gated.ok ? gated : faultOrRefusal(gated, { plan, profile, blockStore, pageRecipes, library })
}

/**
 * Gate a customer's plan edit.
 * @param {{plan: object, edit: object, profile: object, blockStore: object, pageRecipes: object, library?: object[]}}
 *   input `plan` and `profile` as `composePlan` returned them (or a later revision)
 * @returns {{ok: true, plan: object, profile: object, problems: []} |
 *   {ok: false, plan: null, profile: null, problems: Array<{code: string, at: string, message: string}>}} every
 *   problem's code is one of `EDIT_DOOR_CODES`
 */
export const gateEditedPlan = (input) => coded(editedPlanOf(input))

/** The plan with no owner marks on the pages whose search terms `terms` sets (by page id). */
function withoutMarks(plan, terms) {
  if (terms.size === 0) return plan
  return {
    ...plan,
    pages: plan.pages.map((page) => {
      if (!terms.has(page.id) || !page.seo) return page
      const { ownerAdded: _added, ownerRemoved: _removed, ...seo } = page.seo
      return { ...page, seo }
    })
  }
}

/** The plan without its child list rows, which every gate plans again. */
const bareOf = (plan) => ({
  ...plan,
  pages: list(plan?.pages).map((p) => ({
    ...p,
    blocks: list(p?.blocks).map(({ lists: _lists, ...block }) => block)
  }))
})

/**
 * The refusal of a change, or `plan_fault` when the unchanged plan fails the same checks: the problem is the plan's
 * own, not the change's, and the owner is told so (the technical problems stay in `details`).
 */
function faultOrRefusal(refusal, { plan, profile, blockStore, pageRecipes, library }) {
  if (!Array.isArray(plan?.pages)) return refusal
  const unchanged = gatedPlan(bareOf(plan), {
    plan,
    profile,
    after: structuredClone(profile),
    changed: new Set(),
    asked: 'kept',
    terms: null,
    blockStore,
    pageRecipes,
    library
  })
  if (unchanged.ok) return refusal
  return {
    ...refusal,
    problems: [
      {
        code: PLAN_FAULT,
        at: 'plan',
        message: PLAN_FAULT_MESSAGE,
        details: { problems: unchanged.problems.map(({ code, at, message }) => ({ code, at, message })) }
      }
    ]
  }
}

/**
 * The checks every changed plan passes, an edit's or an operation's: the main block of each page, the items, fact
 * fields and library rules of each block, the child list rows planned again, the pictures counted again, the hours
 * shown again, the search terms made again (the owner's marks kept), and the whole document.
 */
function gatedPlan(next, { plan, profile, after, changed, asked, terms, blockStore, pageRecipes, library }) {
  const failed = (problems) => ({ ok: false, plan: null, profile: null, problems })
  const blocks = blockMapOf(blockStore, library)
  const recipes = new Map(list(pageRecipes?.recipes).map((r) => [r?.pageType, r]))
  // The same plan data the composer's gate judged the plan by (`plan-data-of-plan.mjs`), with the facts the plan
  // carries from its brief: a part the composer made is never refused here for not being in the profile.
  const data = planDataOfPlan(profile, next)
  const problems = []
  for (const page of next.pages) {
    const recipe = recipes.get(page.pageType)
    if (recipe && !page.blocks.some((b) => b.block === recipe.mainBlock))
      problems.push({
        code: 'main_block_missing',
        at: `pages[${page.id}]`,
        message: `The ${page.name} page lost its main section.`
      })
    for (const block of page.blocks) {
      const description = blocks.get(block.block)
      const at = `pages[${page.id}].blocks[${block.id}]`
      if (!description) {
        problems.push({
          code: 'unknown_block',
          at,
          message: `The ${block.label} section is not part of your template.`
        })
        continue
      }
      const report = (code, where) => {
        const id = block.data[Number(/\.data\[(\d+)\]$/.exec(where)?.[1])]
        const limit =
          code === 'too_few_items'
            ? { min: description.items?.min }
            : code === 'too_many_items'
              ? { max: description.items?.max }
              : null
        problems.push({
          code,
          at: where,
          message: customerMessage(code, block, description, data, id, profile?.withheld),
          ...(limit && Object.values(limit).every(Number.isInteger) ? { params: limit } : {})
        })
      }
      // The composer's own rules for a block it keeps (`keptBlockProblems`): one rule, so a plan it accepted passes.
      keptBlockProblems(block, description, at, data, report)
    }
  }
  // The composer's page validity rules, on the same data (`pageValidityProblems`).
  pageValidityProblems(next.pages, { data, blocks, recipes }, (code, where) =>
    problems.push({ code, at: where, message: PAGE_RULE_WORDS[code] ?? PAGE_RULE_WORDS.other })
  )
  if (problems.length > 0) return failed(problems)
  replanRows(next, blocks, data, planDataOfPlan(after, next), changed, problems)
  if (problems.length > 0) return failed(problems)
  // The pictures summary follows the edited pages; a generated count the customer lowered is kept. An operation keeps
  // the plan's own count only when the customer had lowered it (`asked: 'kept'`: under what the plan's pages count).
  // Counted as the composer's gate counts them (`plan-picture-recount.mjs`): the photos the left out list names are
  // counted under its codes, and the videos line follows the pages.
  if (asked === 'kept') {
    const own = plan.pictures?.generated?.frames
    asked =
      Number.isInteger(own) && own < recountedPictures(plan, blocks, data).pictures.generated.frames
        ? own
        : null
  }
  const recounted = recountedPictures(next, blocks, data)
  const counted = recounted.pictures
  if (Number.isInteger(asked) && asked < counted.generated.frames) {
    counted.generated = generatedOf(asked)
  }
  next.pictures = counted
  next.leftOut = recounted.leftOut
  // The composer's guard holds here too: numbers that still disagree are a fault of the gate, never shown to the owner.
  const miscounted = pictureCountProblems(next).map((p) => ({ code: 'picture_count', ...p }))
  if (miscounted.length > 0) return failed(miscounted)
  // An hours value changed on the card is shown again from its new value (`plan-hours-display.mjs`).
  next.facts = list(next.facts).map(withHoursDisplay)
  // Search terms are made again from the edited data: a renamed service, a changed address (`plan-intent-seo.mjs`).
  // A list the owner set marks the terms the owner added and took off first, so they are kept from now on.
  const edited = planDataOfPlan(after, next)
  if (terms?.size) {
    const made = madeTermsOf(next.pages, edited)
    const before = new Map(list(plan?.pages).map((p) => [p.id, p.seo]))
    next.pages = next.pages.map((page) =>
      terms.has(page.id) && page.seo
        ? {
            ...page,
            seo: {
              ...page.seo,
              ...ownerTermsOf(terms.get(page.id), made.get(page.id) ?? [], before.get(page.id))
            }
          }
        : page
    )
  }
  if (next.pages.some((p) => p.seo)) next.pages = withSearchTerms(next.pages, edited)
  const contract = checkBuildDocument(next).problems
  if (contract.length > 0) return failed(editRefusals(contract, next))
  return { ok: true, plan: next, profile: after, problems: [] }
}

/**
 * Gate a plan edit that carries one operation (#575 plan card): take a part off, bring back what one removal of this
 * review took (`review.removals`), or go back to the plan before the owner's first change (`review.base`). The
 * revision rises by one each time; a refusal names its code (`OPERATION_REFUSALS`).
 * @param {{plan: object, edit: object, profile: object, blockStore: object, pageRecipes: object, library?: object[],
 *   review?: {base?: {plan: object, profile: object} | null, removals?: object[]}, removal?: string}} input
 *   `removal`: the id the new removal record takes
 * @returns {{ok: true, plan: object, profile: object, removal?: object, restored?: string, problems: []} |
 *   {ok: false, plan: null, profile: null, problems: Array<{code: string, at: string, message: string}>}}
 */
export const gateOperatedPlan = (input) => coded(operatedPlanOf(input))

/** A plan edit that carries one operation, held to the gate (`gateOperatedPlan`), its problems not yet coded. */
function operatedPlanOf({ plan, edit, profile, blockStore, pageRecipes, library = [], review, removal }) {
  const failed = (problems) => ({ ok: false, plan: null, profile: null, problems })
  const reference = planEditReferenceProblems(edit, plan)
  if (reference.length > 0) return failed(editRefusals(reference, plan))
  const operation = edit.operation
  if (!operation) return failed(editRefusals([{ at: 'operation', message: 'no operation' }], plan))
  const revised = (next) => ({ ...next, revision: plan.revision + 1 })
  if (operation.op === 'revert') {
    if (!review?.base?.plan) return failed([operationRefusal('removal_unknown', 'operation.op')])
    return {
      ok: true,
      plan: revised(structuredClone(review.base.plan)),
      profile: structuredClone(review.base.profile),
      problems: []
    }
  }
  const kit = { blockStore, pageRecipes, library }
  let done
  let record = null
  if (operation.op === 'restore') {
    record = list(review?.removals).find((r) => r?.id === operation.removal)
    done = restoreToPlan(plan, record, review?.base?.plan ?? null)
  } else {
    done = removeFromPlan(plan, operation, { kit, removal })
  }
  if (done.problems) return failed(done.problems)
  // The rows are planned again: the operation is applied without them, as an edit is checked.
  const gated = gatedPlan(revised(bareOf(done.plan)), {
    plan,
    profile,
    after: structuredClone(profile),
    changed: new Set(),
    asked: 'kept',
    terms: null,
    blockStore,
    pageRecipes,
    library
  })
  if (!gated.ok) return faultOrRefusal(gated, { plan, profile, blockStore, pageRecipes, library })
  return record ? { ...gated, restored: record.id } : { ...gated, removal: done.removal }
}
