// The rules gate of the plan composer (ticket #593, ADR 0046 decision 3): a pure check of what the model composed,
// before anyone sees it. It guarantees, where the prompt only asks:
// - the reply has its shape before any rule reads it (`plan-gate-reply.mjs`, code `reply_shape`);
// - every data item of the plan exists in the needs profile, within the counts and kinds of its block, on a page whose
//   recipe lists the block, once per page (`plan-gate-rules.mjs`);
// - no data of the kept plan can reach a design typed field. Enforced in three places: the reply's closed block shape
//   (no key but `block`, `label`, `data`, `reason`, `targets`), the `targets` check, and Contract A, checked on the block
//   store before composing (`plan-preflight.mjs`), which gives a design field no data kind, so no fact or item of
//   `data` (matched to fields by data kind) can ever fill one. The plan keeps no `targets`;
// - a page whose main block is missing is dropped, with the reason;
// - data no block shows is placed in the fixed order of `plan-placement.mjs` and `plan-placement-facts.mjs`, else
//   reported, and every fact and item is accounted for (`plan-accounting.mjs`, code `data_unaccounted`);
// - the rows of every child list are set by rules from the business's rows (`plan-rows.mjs`), held to what the block
//   store declares (`plan-rows-check.mjs`), and every row not shown is reported in the left out list;
// - the plan it returns passes the Contract B check (`build-contract.mjs`).
// Composition in, `{ok, problems, plan, placed, accounting}` out.
import { BUILD_PLAN_SCHEMA } from './build-contract-plan.mjs'
import { checkBuildDocument } from './build-contract.mjs'
import { dataAccountingOf } from './plan-accounting.mjs'
import { replyShapeProblems } from './plan-gate-reply.mjs'
import { compositionProblems } from './plan-gate-rules.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { placeExtraData } from './plan-placement.mjs'
import { placeExtraFacts } from './plan-placement-facts.mjs'
import { planRows } from './plan-rows.mjs'
import { rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The pages as the plan holds them, with ids; a page whose main block is missing is dropped with its reason. */
function pagesOf(composition, { recipes, blocks }) {
  const pages = []
  const leftOut = []
  const ids = new Set()
  for (const page of composition.pages) {
    const recipe = recipes.get(page.pageType)
    if (!page.blocks.some((b) => b.block === recipe.mainBlock)) {
      leftOut.push({
        what: page.name,
        kind: 'page',
        reason: 'There was nothing to show in the main section of this page.'
      })
      continue
    }
    let id = page.pageType
    for (let n = 2; ids.has(id); n++) id = `${page.pageType}-${n}`
    ids.add(id)
    const kept = page.blocks.map((b, j) => {
      const d = blocks.get(b.block)
      const block = { id: `${id}-b${j + 1}`, type: d.type, block: d.id, source: d.source ?? 'template' }
      return { ...block, label: b.label, data: [...b.data], reason: b.reason }
    })
    pages.push({ id, name: page.name, pageType: page.pageType, blocks: kept })
  }
  return { pages, leftOut }
}

/** Whether an assumption's field is on a page the plan keeps: one about a dropped page goes with the page. */
function onKeptPage(field, pages) {
  const page = /^pages\[([^\]]+)\]/.exec(field)?.[1]
  return page === undefined || pages.some((p) => p.id === page)
}

const withoutId = ({ id: _id, ...entry }) => entry

/**
 * Gate a composed plan.
 * @param {object} composition the model's reply (`plan-composer-prompt.md`)
 * @param {{planId: string, language: string, data: object, blocks: Map<string, object>, recipes: Map<string, object>,
 *   look: object, assumptions: object[], leftOut?: object[]}} context `assumptions` and `leftOut`: those the profile,
 *   the answers and the look bring
 * @returns {{ok: boolean, problems: Array<{code: string, at: string, message: string}>, plan?: object,
 *   placed?: object[], accounting?: ReturnType<typeof dataAccountingOf>, rows?: object[]}} `rows`: the rows and row
 *   fields the rules dropped and the lists below their minimum, each with its `code` and `reason` (`CHILD_LIST_REASONS`,
 *   `plan-rows-fit.mjs`)
 */
export function gatePlan(composition, context) {
  const problems = []
  const problem = (code, at, message) => {
    problems.push({ code, at, message })
  }
  if (!replyShapeProblems(composition, problem)) return { ok: false, problems }
  compositionProblems(composition, context, problem)
  if (problems.length > 0) return { ok: false, problems }
  const dropped = pagesOf(composition, context)
  if (dropped.pages.length === 0) {
    problem(
      'no_pages',
      'pages',
      'every page lost its main block: the plan keeps at least one page with its main block'
    )
    return { ok: false, problems }
  }
  const modelLeftOut = list(composition.leftOut)
  const leftOutIds = new Set(modelLeftOut.map((e) => e.item).filter((id) => id !== undefined))
  const placement = { data: context.data, blocks: context.blocks, recipes: context.recipes, leftOutIds }
  const items = placeExtraData(dropped.pages, placement)
  const facts = placeExtraFacts(items.pages, placement)
  const pictures = picturesOf(facts.pages, context.blocks, context.data)
  // Items the pictures summary takes off a page (no own photo) are reported in its left out list.
  const after = new Set(pictures.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const reduced = facts.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)).filter((id) => !after.has(id))
  for (const id of [...items.leftOut, ...facts.leftOut].map((e) => e.id).concat(reduced)) leftOutIds.add(id)
  const rows = planRows(pictures.pages, context.blocks, context.data)
  rowListProblems(rows.pages, context.blocks, context.data, problem)
  const rowsOut = rowsLeftOut(context.data, rows.planned, rows.dropped, leftOutIds)
  for (const entry of rowsOut) leftOutIds.add(entry.id)
  const placed = [...items.placed, ...facts.placed]
  const accounting = dataAccountingOf({ data: context.data, pages: rows.pages, placed, leftOutIds })
  for (const id of accounting.unexplained)
    problem('data_unaccounted', `data[${id}]`, `${JSON.stringify(id)} is shown nowhere and not left out`)
  const fromModel = modelLeftOut.map(({ item, what, kind, reason }) => {
    if (item === undefined) return { what, kind, reason }
    const record = context.data.byId.get(item)
    return { what: record.entry.label, kind: record.what === 'fact' ? 'feature' : 'item', reason }
  })
  const plan = {
    schema: BUILD_PLAN_SCHEMA,
    id: context.planId,
    revision: 1,
    language: context.language,
    facts: context.data.facts,
    items: context.data.items,
    ...(list(context.data.rows).length ? { rows: context.data.rows } : {}),
    pages: rows.pages,
    look: context.look,
    pictures: pictures.pictures,
    assumptions: [
      ...context.assumptions,
      ...list(composition.assumptions)
        .map((a, i) => ({ id: `model-${i + 1}`, field: a.field, said: a.said }))
        .filter((a) => onKeptPage(a.field, pictures.pages))
    ],
    leftOut: [
      ...fromModel,
      ...list(context.leftOut),
      ...dropped.leftOut,
      ...items.leftOut.map(withoutId),
      ...facts.leftOut.map(withoutId),
      ...pictures.leftOut,
      ...rowsOut.map(withoutId)
    ]
  }
  for (const p of checkBuildDocument(plan).problems) problem('contract_b', p.at, p.message)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, problems, plan, placed, accounting, rows: rows.dropped }
}
