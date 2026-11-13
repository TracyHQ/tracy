// A customer's plan edit, held to the rules gate (ticket #593; called by the partial re-run, #599). `checkPlanEdit`
// (Contract B) knows the plan only, not the block store, so it cannot know how many items a block holds. This applies
// the edit with `applyPlanEdit` (inside `checkPlanEdit`), then runs the gate's count, kind, main block, fact field and
// library checks on the edited plan, and counts the pictures summary again (`picturesOf`, #595). Problems are worded
// for the customer. A changed fact value is written back to the needs profile, item fields included, so the page
// writer reads the customer's value. The child list rows follow the edited data: they are planned again by the same
// rules (`plan-rows.mjs`, an item taken off a block takes its rows with it) and held to the block store; the rows the
// plan left out before are reported again from the new rows, and every row is accounted for (`data_unaccounted`).
import { checkPlanEdit } from './build-contract-plan-edit.mjs'
import { checkBuildDocument } from './build-contract.mjs'
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { dataAccountingOf } from './plan-accounting.mjs'
import { blockMapOf } from './plan-composer.mjs'
import { addItemFieldFacts } from './plan-conflicts.mjs'
import { ITEM_NOUNS, planDataOf } from './plan-data.mjs'
import { blockItemProblems } from './plan-gate-items.mjs'
import { factFieldProblems } from './plan-gate-rules.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { ROW_REASONS } from './plan-rows-fit.mjs'
import { planRows } from './plan-rows.mjs'
import { rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const FACT_VALUE = /^facts\[([^\]]+)\]\.value$/

/** The customer's words for one gate problem of a block. */
function customerMessage(code, block, description, data, id) {
  const noun = ITEM_NOUNS[BLOCK_TYPES[description.type]?.itemKind] ?? 'items'
  const items = block.data.filter((x) => data.byId.get(x)?.what === 'item').length
  const name = data.byId.get(id)?.entry?.label ?? id
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

/** A copy of the profile with every fact value the edit changed, an item field's included. */
function profileAfterEdit(profile, edit) {
  const next = structuredClone(profile)
  const data = addItemFieldFacts(next, planDataOf(next))
  let changed = false
  for (const { field, value } of edit.changes) {
    const id = FACT_VALUE.exec(field)?.[1]
    const record = id && data.byId.get(id)
    if (record?.what !== 'fact') continue
    record.source.value = value
    record.source.sources = [ANSWER_SOURCE]
    const conflict = list(next.conflicts).find((c) => c.id === record.source.conflict)
    if (conflict) Object.assign(conflict, { chosen: value, chosenBy: 'plan-edit' })
    changed = true
  }
  if (changed && !list(next.sources).some((s) => s.id === ANSWER_SOURCE))
    next.sources = [...list(next.sources), { id: ANSWER_SOURCE, origin: 'answer' }]
  return next
}

const withoutId = ({ id: _id, ...entry }) => entry

/**
 * The plan's rows after the edit: `rows` lists the rows of the profile (as `items` lists every item), the left out
 * entries of rows are reported again from the new rows, and every row is shown, left out, or goes with its item.
 */
function refreshRows(next, rows, data, problems) {
  const labels = new Set(list(data.rows).map((r) => r.label))
  const isRow = (e) => e?.kind === 'item' && ROW_REASONS.has(e.reason) && labels.has(e.what)
  const shown = new Set(next.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const out = rowsLeftOut(data, rows.planned, rows.dropped, new Set(), shown)
  next.leftOut = [...list(next.leftOut).filter((e) => !isRow(e)), ...out.map(withoutId)]
  if (list(data.rows).length) next.rows = data.rows
  else delete next.rows
  const accounting = dataAccountingOf({
    data,
    pages: next.pages,
    placed: [],
    leftOutIds: new Set(out.map((e) => e.id))
  })
  for (const id of accounting.unexplained.filter((x) => data.rowsById.has(x)))
    problems.push({
      code: 'data_unaccounted',
      at: `rows[${id}]`,
      message: 'A row of your business details is shown nowhere.'
    })
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
  const checked = checkPlanEdit(edit, Array.isArray(plan?.pages) ? bare : plan)
  if (!checked.ok)
    return failed(
      checked.problems.map((p) => ({
        code: 'edit_invalid',
        at: p.at,
        message: `This change cannot be saved: ${p.message}.`
      }))
    )
  const next = checked.plan
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
        problems.push({ code, at: where, message: customerMessage(code, block, description, data, id) })
      }
      blockItemProblems(block, description, at, data, report)
      factFieldProblems(block, description, at, data, report)
    }
  }
  if (problems.length > 0) return failed(problems)
  const rows = planRows(next.pages, blocks, data)
  next.pages = rows.pages
  const label = (at) => next.pages.flatMap((p) => p.blocks).find((b) => at.includes(`blocks[${b.id}]`))?.label
  rowListProblems(next.pages, blocks, data, (code, at) =>
    problems.push({ code, at, message: `The ${label(at) ?? 'changed'} section cannot show these rows.` })
  )
  refreshRows(next, rows, data, problems)
  if (problems.length > 0) return failed(problems)
  // The pictures summary follows the edited pages; a generated count the customer lowered is kept.
  const counted = picturesOf(next.pages, blocks, data).pictures
  const asked = edit.changes.find((c) => c.field === 'pictures.generated.frames')?.value
  if (Number.isInteger(asked) && asked < counted.generated.frames) {
    counted.generated = asked > 0 ? { ...counted.generated, frames: asked } : { frames: 0 }
  }
  next.pictures = counted
  const contract = checkBuildDocument(next).problems
  if (contract.length > 0)
    return failed(
      contract.map((p) => ({
        code: 'edit_invalid',
        at: p.at,
        message: `This change cannot be saved: ${p.message}.`
      }))
    )
  return { ok: true, plan: next, profile: profileAfterEdit(profile, edit), problems: [] }
}
