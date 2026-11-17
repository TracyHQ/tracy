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
//   a block these removals leave under its minimum leaves too, or is a `too_few_items` problem when it is the main
//   block (`plan-below-min-blocks.mjs`), so a plan the gate passes passes it again on a change request;
// - a block the model sends with no data is left out, as the messages that take an id out of a block ask
//   (`plan-gate-pages.mjs`); a model assumption naming what the owner keeps off the site is dropped;
// - the rows of every child list are set by rules from the business's rows (`plan-rows.mjs`), held to what the block
//   store declares (`plan-rows-check.mjs`), and every row not shown is reported in the left out list;
// - the page rules (`plan-gate-page-rules.mjs`) hold for the composition and again after placement;
// - a block's reason never counts a number of items it does not show, and its label is not the name of its one datum
//   (`plan-gate-wording.mjs`);
// - the plan it returns passes the Contract B check (`build-contract.mjs`);
// - a mechanical fault whose single right answer code knows, and whose fix changes nothing the site shows, is fixed
//   and recorded instead of failing the plan (`plan-gate-fixes.mjs`, #614): a left out entry of a shown item, an
//   assumption naming a block by its store id, a label repeating its one datum, a count a reason no longer holds;
// - every left out entry reads in the customer's words with a reason code (`plan-left-out-wording.mjs`), and every
//   block of a known section carries its `labelCode` (`plan-wording-codes.mjs`);
// - the model's left out entries are kept only when keyed by data (`plan-left-out-keyed.mjs`): the pages the plan does
//   not keep are listed by code from the template (`plan-left-out-pages.mjs`), and the opening hours are shown only by
//   a block with a field for them (`plan-field-only-facts.mjs`), so the plan card does not change with the model's
//   words.
// Composition in, `{ok, problems, fixes, composition, plan, placed, accounting}` out. `composition` is the reply as the
// gate read it after its fixes: the place of every problem is a place in it.
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
import { spreadGalleries } from './plan-gallery-spread.mjs'
import { placeExtraData } from './plan-placement.mjs'
import { placeExtraFacts } from './plan-placement-facts.mjs'
import {
  answerOverLimitProblems,
  clearOverLimitValues,
  dropOverLimitData,
  overLimitLeftOut
} from './plan-data-limits.mjs'
import { dropBelowMinBlocks } from './plan-below-min-blocks.mjs'
import { dropEmptiedBlocks } from './plan-emptied-blocks.mjs'
import { withoutShownLeftOut } from './plan-gate-fixes.mjs'
import { withCountedReasons } from './plan-left-out-plain.mjs'
import { withLabelCodes } from './plan-wording-codes.mjs'
import { wordingProblems } from './plan-gate-wording.mjs'
import { planRows } from './plan-rows.mjs'
import { modelLeftOutOf, withNamedIds, withReasonCodes } from './plan-left-out-wording.mjs'
import { withoutProtectedLeftOut } from './plan-left-out-protected.mjs'
import { withKeyedLeftOut } from './plan-left-out-keyed.mjs'
import { kitPagesLeftOut } from './plan-left-out-pages.mjs'
import { withoutFactsWithoutPlace } from './plan-field-only-facts.mjs'
import { listsBelowMinLeftOut, rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'
import { systemPagesOf } from './plan-system-pages.mjs'
import { planIntentOf } from './plan-intent.mjs'
import { withEndActions } from './plan-intent-end-action.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** A left out entry named by the plan's own label of its id, when a revision gives one (`context.labels`); the id it
 * reports rides as `item` (`withReasonCodes` keeps it when the plan lists that id). */
const namedBy =
  (labels) =>
  ({ id, ...entry }) => ({
    ...entry,
    ...(labels?.has(id) ? { what: labels.get(id) } : {}),
    ...(id !== undefined ? { item: id } : {})
  })

/**
 * Gate a composed plan.
 * @param {object} composition the model's reply (`plan-composer-prompt.md`)
 * @param {{planId: string, language: string, data: object, blocks: Map<string, object>, recipes: Map<string, object>,
 *   look: object, assumptions: object[], leftOut?: object[], givenIds?: object[], idTag?: string,
 *   labels?: Map<string, string>, askedOff?: Set<string>}} context `assumptions` and `leftOut`: those the profile,
 *   the answers and the look bring; `givenIds`, `idTag`, `labels` and `askedOff` only on a revision
 *   (`plan-request.mjs`): the ids the plan keeps (`pagesOf`), the tag of new ids, the plan's own item labels that name
 *   its left out entries, and the left out reasons of what the customer asked to take off (`plan-gate-people.mjs`)
 * @returns {{ok: boolean, problems: Array<{code: string, at: string, message: string}>, fixes: Array<{code: string,
 *   at: string, rule: string, was: unknown, now: unknown}>, composition: object, plan?: object,
 *   placed?: object[], accounting?: ReturnType<typeof dataAccountingOf>, rows?: object[]}} `rows`: the rows and row
 *   fields the rules dropped, the lists below their minimum and the data too long for its field, each with its `code`
 *   and `reason` (`CHILD_LIST_REASONS`, `plan-rows-fit.mjs`; `data_over_limit`, `plan-data-limits.mjs`)
 */
export function gatePlan(reply, context) {
  const problems = []
  const fixes = []
  const problem = (code, at, message) => {
    problems.push({ code, at, message })
  }
  const fix = (entry) => fixes.push(entry)
  if (!replyShapeProblems(reply, problem)) return { ok: false, problems, fixes, composition: reply }
  // An item a block shows and the model also leaves out keeps showing: its left out entry goes (`plan-gate-fixes.mjs`).
  // A left out entry that names a fact or item by its id reports that id (`withNamedIds`); one of a fact the model may
  // never leave out (the owner's answer, the name, phone, address, main button) is dropped (`plan-left-out-protected`).
  // Only entries keyed by data stay (`plan-left-out-keyed.mjs`); hours in a block with no field for them leave it.
  const named = withKeyedLeftOut(withNamedIds(reply, context.data, fix), fix)
  const guarded = withoutProtectedLeftOut(named, context.data, fix, context.askedOff)
  const composition = withoutFactsWithoutPlace(withoutShownLeftOut(guarded, context.data, fix), context, fix)
  const failed = () => ({ ok: false, problems, fixes, composition })
  compositionProblems(composition, context, problem)
  if (problems.length > 0) return failed()
  const dropped = pagesOf(composition, context)
  if (dropped.pages.length === 0) {
    problem(
      'no_pages',
      'pages',
      'every page lost its main block: the plan keeps at least one page with its main block'
    )
    return failed()
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
  // A gallery photo an earlier gallery shows gives its place to one shown nowhere (`plan-gallery-spread.mjs`).
  const spread = spreadGalleries(trimChannelOverflow(dropped.pages, context), placement)
  const items = placeExtraData(spread.pages, placement)
  const facts = placeExtraFacts(items.pages, placement)
  // Every page ends with a block that leads to the main action when its template has one (`plan-intent-end-action`).
  facts.pages = withEndActions(facts.pages, context, fix, dropped.index)
  // The page rules hold for the plan after placement too: a problem here is the gate's own placement.
  pageRuleProblems({ pages: facts.pages, leftOut: modelLeftOut }, context, problem)
  if (problems.length > 0) return failed()
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
  // A block these removals leave under its minimum leaves too, or is reported (`plan-below-min-blocks.mjs`).
  const below = dropBelowMinBlocks(
    emptied.pages,
    { ...context, dropped: overLimit.dropped },
    dropped.index,
    problem
  )
  for (const entry of below.leftOut) if (entry.id !== undefined) leftOutIds.add(entry.id)
  const limited = { pages: below.pages, dropped: overLimit.dropped }
  // A value left off a shown item is taken off the item the page writer reads (the composer's settled profile).
  clearOverLimitValues(limited.dropped, context.data)
  const rows = planRows(limited.pages, context.blocks, context.data)
  rowListProblems(rows.pages, context.blocks, context.data, problem)
  // A reason that counts what its block no longer shows, a label that repeats its one datum (`plan-gate-wording.mjs`).
  wordingProblems(
    rows.pages,
    {
      data: context.data,
      dropped: limited.dropped,
      index: dropped.index,
      givenIds: context.givenIds,
      blocks: context.blocks,
      language: context.language,
      fix
    },
    problem
  )
  const shown = new Set(rows.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const rowsOut = [
    ...overLimitLeftOut(limited.dropped, rows.pages, context.data),
    ...rowsLeftOut(context.data, rows.planned, rows.dropped, leftOutIds, shown)
  ]
  for (const entry of rowsOut) leftOutIds.add(entry.id)
  const placed = [...spread.placed, ...items.placed, ...facts.placed]
  const accounting = dataAccountingOf({ data: context.data, pages: rows.pages, placed, leftOutIds })
  for (const id of accounting.unexplained)
    problem('data_unaccounted', `data[${id}]`, `${JSON.stringify(id)} is shown nowhere and not left out`)
  // The model's entries and the withheld ones, in the customer's words with a reason code (`plan-left-out-wording.mjs`).
  const fromModel = modelLeftOutOf(modelLeftOut, withheld, { ...context, pages: rows.pages, fix, problem })
  const kept = ({ id }) =>
    !context.data.withheld?.has(id) && !context.data.withheld?.has(context.data.rowsById?.get(id)?.owner)
  // The template's pages the plan does not keep, by code (a page dropped for its empty main block among them), except
  // a page the owner asked to remove, which a revision reports itself (`context.removedPageTypes`).
  const kitPages = kitPagesLeftOut({ ...context, pages: rows.pages, except: context.removedPageTypes })
  // The Privacy Policy page and the not-found page, on the final pages (`plan-system-pages.mjs`, step chain R09).
  const before = problems.length
  const systemPages = systemPagesOf(composition, { pages: rows.pages, data: context.data }, problem)
  const systemProblems = problems.length > before
  // The step chain's intent for the writer (`plan-intent.mjs`): notes, key messages placed, search terms, main action.
  const intent = planIntentOf(composition, rows.pages, context, { fix, problem, index: dropped.index, kept })
  const plan = {
    schema: BUILD_PLAN_SCHEMA,
    id: context.planId,
    revision: 1,
    language: context.language,
    facts: context.data.facts.filter(kept),
    items: context.data.items.filter(kept),
    ...(list(context.data.rows).filter(kept).length ? { rows: context.data.rows.filter(kept) } : {}),
    pages: withLabelCodes(intent.pages, context.blocks),
    look: context.look,
    // Counted on the final pages: a frame of an item the gate took off later is no picture to create.
    pictures: picturesOf(rows.pages, context.blocks, context.data).pictures,
    assumptions: [...context.assumptions, ...keptAssumptionsOf(composition, pictures.pages, context, fix)],
    leftOut: [
      ...kitPages,
      ...fromModel,
      ...list(context.leftOut),
      ...items.leftOut.map(namedBy(context.labels)),
      ...facts.leftOut.map(namedBy(context.labels)),
      ...pictures.leftOut,
      ...emptied.leftOut,
      ...below.leftOut.map(namedBy(context.labels)),
      ...rowsOut.map(namedBy(context.labels)),
      ...listsBelowMinLeftOut(rows.dropped, rows.pages)
    ],
    ...systemPages,
    ...intent.fields
  }
  plan.leftOut = withCountedReasons(withReasonCodes(plan.leftOut, plan))
  // A plan whose legal or not-found page the model got wrong goes back with those problems, never with their echo.
  if (systemProblems) return failed()
  for (const p of checkBuildDocument(plan).problems) problem('contract_b', p.at, p.message)
  // The plan never shows the template's look for approval (#616): its accent, its logo, or a line naming them, written
  // by the model or not. Off only for the template fallback of the tests (`allowTemplateLook`).
  if (!context.allowTemplateLook)
    for (const p of lookProblemsOf({ plan, template: context.template, lookSources: context.lookSources }))
      problem(p.code, p.at, p.message)
  if (problems.length > 0) return failed()
  const rowsDropped = [...limited.dropped, ...rows.dropped]
  return { ok: true, problems, fixes, composition, plan, placed, accounting, rows: rowsDropped }
}
