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
import { addItemFieldFacts } from './plan-conflicts.mjs'
import { ITEM_NOUNS, planDataOf } from './plan-data.mjs'
import { blockItemProblems } from './plan-gate-items.mjs'
import { factFieldProblems } from './plan-gate-rules.mjs'
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
import { operationRefusal, removeFromPlan, restoreToPlan } from './plan-operations.mjs'
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
    fact_without_field: `The ${block.label} section has no place for ${name}.`
  }
  return words[code] ?? `The ${block.label} section cannot take this change.`
}

/**
 * A copy of the profile with every fact value the edit changed, an item field's included, and every item renamed on
 * the card under its new name (`plan-edit-item-names.mjs`).
 */
function profileAfterEdit(profile, edit) {
  const next = structuredClone(profile)
  const data = addItemFieldFacts(next, planDataOf(next))
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

/**
 * Gate a customer's plan edit.
 * @param {{plan: object, edit: object, profile: object, blockStore: object, pageRecipes: object, library?: object[]}}
 *   input `plan` and `profile` as `composePlan` returned them (or a later revision)
 * @returns {{ok: true, plan: object, profile: object, problems: []} |
 *   {ok: false, plan: null, profile: null, problems: Array<{code: string, at: string, message: string}>}}
 */
export function gateEditedPlan({ plan, edit, profile, blockStore, pageRecipes, library = [] }) {
  const failed = (problems) => ({ ok: false, plan: null, profile: null, problems })
  // The rows are planned again after the edit, so the edit is checked on the plan without them.
  const bare = {
    ...plan,
    pages: list(plan?.pages).map((p) => ({
      ...p,
      blocks: list(p?.blocks).map(({ lists: _lists, ...block }) => block)
    }))
  }
  const edited = Array.isArray(edit?.changes) && edit.changes.every((c) => c && typeof c === 'object')
  // The edited name is checked first: a name that names a held person would otherwise read as a held item.
  const nameProblems = edited ? editedNameProblems({ plan, edit, profile, blockStore, library }) : []
  if (nameProblems.length > 0) return failed(nameProblems)
  const termProblems = edited ? searchTermProblems(edit) : []
  if (termProblems.length > 0) return failed(termProblems)
  const early = edited ? editedIdProblems({ plan, edit, profile: profileAfterEdit(profile, edit) }) : []
  if (early.length > 0) return failed(early)
  const checked = checkPlanEdit(edit, Array.isArray(plan?.pages) ? bare : plan)
  if (!checked.ok) return failed(editRefusals(checked.problems, plan))
  const after = profileAfterEdit(profile, edit)
  const changed = new Set(edit.changes.map((c) => FACT_VALUE.exec(c.field)?.[1]).filter(Boolean))
  const asked = edit.changes.find((c) => c.field === 'pictures.generated.frames')?.value
  const terms = new Map(
    edit.changes.flatMap((c) => {
      const page = SEARCH_TERMS.exec(c.field)?.[1]
      return page ? [[page, c.value.map((t) => t.trim())]] : []
    })
  )
  return gatedPlan(checked.plan, {
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
  const data = addItemFieldFacts(profile, planDataOf(profile))
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
        problems.push({
          code,
          at: where,
          message: customerMessage(code, block, description, data, id, profile?.withheld)
        })
      }
      blockItemProblems(block, description, at, data, report)
      factFieldProblems(block, description, at, data, report)
    }
  }
  if (problems.length > 0) return failed(problems)
  replanRows(next, blocks, data, addItemFieldFacts(after, planDataOf(after)), changed, problems)
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
  const edited = planDataOf(after)
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
export function gateOperatedPlan({
  plan,
  edit,
  profile,
  blockStore,
  pageRecipes,
  library = [],
  review,
  removal
}) {
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
  const bare = {
    ...done.plan,
    pages: done.plan.pages.map((p) => ({
      ...p,
      blocks: p.blocks.map(({ lists: _lists, ...block }) => block)
    }))
  }
  const gated = gatedPlan(revised(bare), {
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
  if (!gated.ok) return gated
  return record ? { ...gated, restored: record.id } : { ...gated, removal: done.removal }
}
