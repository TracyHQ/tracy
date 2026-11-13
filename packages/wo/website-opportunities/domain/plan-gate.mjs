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
// - a fact or item too long for the field of its block it would fill leaves that block, reported
//   (`plan-data-limits.mjs`, code `data_over_limit`), so the page writer never stops on it; a block left with nothing
//   leaves the plan, and a main block left with nothing is a `data_over_limit` problem (`plan-emptied-blocks.mjs`);
// - a block the model sends with no data is left out, as the messages that take an id out of a block ask
//   (`plan-gate-pages.mjs`); a model assumption naming what the owner keeps off the site is dropped;
// - the rows of every child list are set by rules from the business's rows (`plan-rows.mjs`), held to what the block
//   store declares (`plan-rows-check.mjs`), and every row not shown is reported in the left out list;
// - the page rules (`plan-gate-page-rules.mjs`) hold for the composition and again after placement;
// - the plan it returns passes the Contract B check (`build-contract.mjs`).
// Composition in, `{ok, problems, plan, placed, accounting}` out.
import { lookProblemsOf } from './brand-look-problems.mjs'
import { BUILD_PLAN_SCHEMA } from './build-contract-plan.mjs'
import { checkBuildDocument } from './build-contract.mjs'
import { dataAccountingOf } from './plan-accounting.mjs'
import { replyShapeProblems } from './plan-gate-reply.mjs'
import { compositionProblems } from './plan-gate-rules.mjs'
import { trimChannelOverflow } from './plan-gate-contact.mjs'
import { pageRuleProblems } from './plan-gate-page-rules.mjs'
import { keptAssumptionsOf, pagesOf } from './plan-gate-pages.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { placeExtraData } from './plan-placement.mjs'
import { placeExtraFacts } from './plan-placement-facts.mjs'
import {
  answerOverLimitProblems,
  clearOverLimitValues,
  dropOverLimitData,
  overLimitLeftOut
} from './plan-data-limits.mjs'
import { dropEmptiedBlocks } from './plan-emptied-blocks.mjs'
import { planRows } from './plan-rows.mjs'
import { WITHHELD_REASON, withheldWhatOf } from './plan-withheld.mjs'
import { listsBelowMinLeftOut, rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

const withoutId = ({ id: _id, ...entry }) => entry
/** A left out entry named by the plan's own label of its id, when a revision gives one (`context.labels`). */
const namedBy = (labels) => (entry) =>
  labels?.has(entry.id) ? withoutId({ ...entry, what: labels.get(entry.id) }) : withoutId(entry)

/**
 * Gate a composed plan.
 * @param {object} composition the model's reply (`plan-composer-prompt.md`)
 * @param {{planId: string, language: string, data: object, blocks: Map<string, object>, recipes: Map<string, object>,
 *   look: object, assumptions: object[], leftOut?: object[], givenIds?: object[], idTag?: string,
 *   labels?: Map<string, string>, askedOff?: Set<string>}} context `assumptions` and `leftOut`: those the profile,
 *   the answers and the look bring; `givenIds`, `idTag`, `labels` and `askedOff` only on a revision
 *   (`plan-request.mjs`): the ids the plan keeps (`pagesOf`), the tag of new ids, the plan's own item labels that name
 *   its left out entries, and the left out reasons of what the customer asked to take off (`plan-gate-people.mjs`)
 * @returns {{ok: boolean, problems: Array<{code: string, at: string, message: string}>, plan?: object,
 *   placed?: object[], accounting?: ReturnType<typeof dataAccountingOf>, rows?: object[]}} `rows`: the rows and row
 *   fields the rules dropped, the lists below their minimum and the data too long for its field, each with its `code`
 *   and `reason` (`CHILD_LIST_REASONS`, `plan-rows-fit.mjs`; `data_over_limit`, `plan-data-limits.mjs`)
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
  // What the owner keeps off the site is never placed, and the plan reports it as left out (`plan-withheld.mjs`).
  const withheld = [...(context.data.withheld ?? [])].filter((id) => !leftOutIds.has(id))
  for (const id of withheld) leftOutIds.add(id)
  const placement = {
    data: context.data,
    blocks: context.blocks,
    recipes: context.recipes,
    leftOutIds,
    idTag: context.idTag
  }
  // A channel a block holds beyond its places is placed again or left out with the reason (`plan-gate-contact.mjs`).
  const items = placeExtraData(trimChannelOverflow(dropped.pages, context), placement)
  const facts = placeExtraFacts(items.pages, placement)
  // The page rules hold for the plan after placement too: a problem here is the gate's own placement.
  pageRuleProblems({ pages: facts.pages, leftOut: modelLeftOut }, context, problem)
  if (problems.length > 0) return { ok: false, problems }
  const pictures = picturesOf(facts.pages, context.blocks, context.data)
  // Items the pictures summary takes off a page (no own photo) are reported in its left out list.
  const after = new Set(pictures.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const reduced = facts.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)).filter((id) => !after.has(id))
  for (const id of [...items.leftOut, ...facts.leftOut].map((e) => e.id).concat(reduced)) leftOutIds.add(id)
  // A fact or item too long for the field it would fill leaves that block before any row is planned.
  const overLimit = dropOverLimitData(pictures.pages, context.blocks, context.data)
  for (const p of answerOverLimitProblems(overLimit.dropped)) problem(p.code, p.at, p.message)
  // A block it empties leaves the plan, or is reported when it is the page's main block (`plan-emptied-blocks.mjs`).
  const emptied = dropEmptiedBlocks(pictures.pages, overLimit, context, dropped.index, problem)
  const limited = { pages: emptied.pages, dropped: overLimit.dropped }
  // A value left off a shown item is taken off the item the page writer reads (the composer's settled profile).
  clearOverLimitValues(limited.dropped, context.data)
  const rows = planRows(limited.pages, context.blocks, context.data)
  rowListProblems(rows.pages, context.blocks, context.data, problem)
  const shown = new Set(rows.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const rowsOut = [
    ...overLimitLeftOut(limited.dropped, rows.pages, context.data),
    ...rowsLeftOut(context.data, rows.planned, rows.dropped, leftOutIds, shown)
  ]
  for (const entry of rowsOut) leftOutIds.add(entry.id)
  const placed = [...items.placed, ...facts.placed]
  const accounting = dataAccountingOf({ data: context.data, pages: rows.pages, placed, leftOutIds })
  for (const id of accounting.unexplained)
    problem('data_unaccounted', `data[${id}]`, `${JSON.stringify(id)} is shown nowhere and not left out`)
  const withheldOut = withheld.map((item) => ({ item, reason: WITHHELD_REASON }))
  const fromModel = [...modelLeftOut, ...withheldOut].map(({ item, what, kind, reason }) => {
    if (item === undefined) return { what, kind, reason }
    const record = context.data.byId.get(item)
    const label = context.data.withheld?.has(item)
      ? withheldWhatOf(record, context.profile?.withheld)
      : (context.labels?.get(item) ?? record.entry.label)
    return { what: label, kind: record.what === 'fact' ? 'feature' : 'item', reason }
  })
  const kept = ({ id }) =>
    !context.data.withheld?.has(id) && !context.data.withheld?.has(context.data.rowsById?.get(id)?.owner)
  const plan = {
    schema: BUILD_PLAN_SCHEMA,
    id: context.planId,
    revision: 1,
    language: context.language,
    facts: context.data.facts.filter(kept),
    items: context.data.items.filter(kept),
    ...(list(context.data.rows).filter(kept).length ? { rows: context.data.rows.filter(kept) } : {}),
    pages: rows.pages,
    look: context.look,
    pictures: pictures.pictures,
    assumptions: [...context.assumptions, ...keptAssumptionsOf(composition, pictures.pages, context)],
    leftOut: [
      ...fromModel,
      ...list(context.leftOut),
      ...dropped.leftOut,
      ...items.leftOut.map(namedBy(context.labels)),
      ...facts.leftOut.map(namedBy(context.labels)),
      ...pictures.leftOut,
      ...emptied.leftOut,
      ...rowsOut.map(namedBy(context.labels)),
      ...listsBelowMinLeftOut(rows.dropped, rows.pages)
    ]
  }
  for (const p of checkBuildDocument(plan).problems) problem('contract_b', p.at, p.message)
  // The plan never shows the template's look for approval (#616): its accent, its logo, or a line naming them, written
  // by the model or not. Off only for the template fallback of the tests (`allowTemplateLook`).
  if (!context.allowTemplateLook)
    for (const p of lookProblemsOf({ plan, template: context.template, lookSources: context.lookSources }))
      problem(p.code, p.at, p.message)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, problems, plan, placed, accounting, rows: [...limited.dropped, ...rows.dropped] }
}
