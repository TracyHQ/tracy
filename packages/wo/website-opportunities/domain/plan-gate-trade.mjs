// Trade knowledge in the rules gate (#575), copied from the step chain's site planner and its plan check
// (`apps/tracy-web/src/site-planner/planner-prompt.md` "Trade knowledge", `plan-check/rules-trade.js` R10f,
// `plan-check/rules-trade-hidden.js` R21). Only what the new plan shape forces is changed: the step chain marks a copy
// LINE `basis: "trade"`; the composer writes no copy, so it marks the BLOCK whose written copy will come from general
// knowledge of the owner's trade, and the block cites the facts that show the business does that activity.
// - `trade_fact_missing`: a trade block cites at least one fact or item of the business, each one the plan has
//   (R10f: a trade line that is trade content cites the activity's fact);
// - `trade_fact_field`: a trade block leaves no field for a fact of the business unfilled. Only written copy
//   (`editorial.*` kinds, `place-content-roles.mjs`) is planned from the trade; a field for a fact of the business with
//   no data follows the block's no data rule, so such a block is not kept on trade basis;
// - `trade_terms`: its label and reason state no terms: a number, "free" meaning no charge, a discount, a certificate,
//   a schedule word, a price or a guarantee (R10f's own tests, as it runs them on a line that cites a fact);
// - `trade_block_type`: a block of a type that shows data of the business or asks for it (`NOT_TRADE_TYPES`: a form,
//   a price list, articles, reviews and so on) is never kept on trade basis, nor sent back when left out;
// - `trade_block_unnamed`: a block the kit gives no name (`ai-quickstart-block-names.mjs`) cannot be recognised as one
//   that shows how the trade works, so it is never kept on trade basis;
// - `trade_block_left_out` (R21 adapted): a named block of written copy only, which a page the plan keeps may show, left out
//   by the model with a reason code that is not one code derives from the form (a sign up form with no email, a button
//   with no booking link) and no `factIds` naming the fact that shows the business does not do that activity. The step
//   chain counts slots hidden "for want of facts"; the composer leaves whole blocks out, and the plan card never shows
//   the reason of a left out block, so the absence is named by fact id, never by words.

import { TRADE_BASIS } from './plan-gate-reply.mjs'
import { derivedReasonOf } from './plan-left-out-wording.mjs'
import { fitsRecipe } from './plan-placement-pages.mjs'

export { TRADE_BASIS }

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a field is written copy: a role of the editorial group. */
export const isWrittenCopy = (field) => typeof field?.kind === 'string' && field.kind.startsWith('editorial.')
/** Whether a block was kept from general knowledge of the trade. */
export const isTradeBlock = (block) => block?.basis === TRADE_BASIS

const contentFields = (description) => ({
  block: list(description?.fields).filter((f) => f?.type !== 'design'),
  rows: [
    ...list(description?.itemFields),
    ...list(description?.lists).flatMap((l) => list(l?.fields))
  ].filter((f) => f?.type !== 'design')
})

/**
 * The fields for a fact of the business a block leaves unfilled with `ids` as its data: a block field no fact of its
 * kind fills, and an item or row field when the block shows no item. Written copy is never in the list.
 */
export function unfilledFactFields(description, ids, data) {
  const entries = list(ids)
    .map((id) => data.byId.get(id))
    .filter(Boolean)
  const factKinds = new Set(entries.filter((e) => e.what === 'fact').map((e) => e.kind))
  const hasItems = entries.some((e) => e.what === 'item')
  const { block, rows } = contentFields(description)
  return [
    ...block.filter((f) => !isWrittenCopy(f) && !factKinds.has(f.kind)),
    ...(hasItems ? [] : rows.filter((f) => !isWrittenCopy(f)))
  ]
}

/**
 * The block types that never carry trade content: a form, a price list (an offer's terms), articles, reviews, photos,
 * people, contact details, a map, a menu, events, figures, a video, a timetable, the header and the footer. Each shows
 * data of the business or asks for it; the step chain excuses article slots from R21 the same way.
 */
export const NOT_TRADE_TYPES = Object.freeze(
  new Set([
    'header',
    'footer',
    'newsletter',
    'pricing',
    'posts',
    'reviews',
    'gallery',
    'team',
    'contact',
    'map',
    'menu',
    'events',
    'stats',
    'video',
    'schedule'
  ])
)
const hasName = (description) => typeof description?.name === 'string' && description.name.trim() !== ''
const citable = (id, data) => data.byId.has(id) && !data.withheld?.has(id)

/** R10f, as the step chain runs it on a trade line that cites a fact, with its own word lists. */
const FREE_NAME =
  /^(?:[\s-]+(?:weights?|standing|kicks?|style|throws?|flow|play|form|hand|range)\b|-standing\b)/i
const hasFreeOfCharge = (text) => {
  const re = /\bfree\b/gi
  let m
  while ((m = re.exec(text))) if (!FREE_NAME.test(text.slice(m.index + 4))) return true
  return false
}
const TERMS = /discount|complimentary|\d|%|\bcertificat/i
const SCHEDULE =
  /\b(daily|weekly|monthly|weekends?|weekdays?|mornings?|evenings?|afternoons?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|every (day|week|month)|hours?|minutes?|o'clock|[ap]\.?m\.?)\b/i
/** The price and promise words of R10f's PROMISE list: an offer's terms and a concrete promise. */
const PRICE_OR_PROMISE = /\b(guarantee\w*|promise\w*|refunds?|prices?|cost)\b/i

/** What a text states that a trade block may not, or null. */
export function tradeTermsOf(text) {
  const value = String(text ?? '')
  if (hasFreeOfCharge(value) || TERMS.test(value)) return 'a number, "free", a discount or a certificate'
  if (SCHEDULE.test(value)) return 'a schedule'
  if (PRICE_OR_PROMISE.test(value)) return 'a price or a promise'
  return null
}

/** Report the trade problems of one composed block kept on trade basis. */
export function tradeBlockProblems(block, description, at, data, problem) {
  const ids = list(block.factIds)
  if (ids.length === 0)
    problem(
      'trade_fact_missing',
      `${at}.factIds`,
      'a block kept on trade basis cites the fact or item that shows the business does that activity'
    )
  ids.forEach((id, i) => {
    if (!citable(id, data))
      problem(
        'trade_fact_missing',
        `${at}.factIds[${i}]`,
        `${JSON.stringify(id)} is not a fact or item of the business: cite the one that shows it does this activity`
      )
  })
  if (NOT_TRADE_TYPES.has(description.type))
    problem(
      'trade_block_type',
      `${at}.basis`,
      `a ${description.type} block shows data of the business, never trade knowledge: keep it with data, or leave it out`
    )
  // A block is recognised as trade content by its original name (`ai-quickstart-block-names.mjs`): no name, no guess.
  else if (!hasName(description))
    problem(
      'trade_block_unnamed',
      `${at}.basis`,
      `block ${description.id} has no name, so it cannot be recognised as a block that shows how the trade works: keep it with data of the business, or leave it out`
    )
  const unfilled = unfilledFactFields(description, block.data, data)
  if (unfilled.length > 0)
    problem(
      'trade_fact_field',
      `${at}.basis`,
      `block ${description.id} has fields for facts of the business (${[...new Set(unfilled.map((f) => f.kind))].join(', ')}) that its data does not fill: only written copy is planned from the trade, so leave the block out unless its data fills them`
    )
  for (const key of ['label', 'reason']) {
    const terms = tradeTermsOf(block[key])
    if (terms)
      problem(
        'trade_terms',
        `${at}.${key}`,
        `a block planned from the trade states no terms; this ${key} states ${terms}: say what the block explains, without any number, price, duration, schedule or promise`
      )
  }
}

/** The codes of a left out block that code derives from the form: the block cannot be kept, trade or not. */
const FORM_REASONS = new Set(['no_email_for_form', 'no_booking_link'])

/** R21 adapted: report a block of written copy only left out for want of facts while a kept page may show it. */
export function tradeLeftOutProblems(composition, context, problem) {
  const { blocks, recipes, data } = context
  const pages = list(composition.pages).filter((p) => recipes.has(p.pageType))
  list(composition.leftOut).forEach((entry, i) => {
    if (entry.block === undefined) return
    const at = `leftOut[${i}]`
    const description = blocks.get(entry.block)
    if (!description)
      return problem(
        'unknown_block',
        `${at}.block`,
        `${JSON.stringify(entry.block)} is not a block of the list`
      )
    const ids = list(entry.factIds)
    ids.forEach((id, j) => {
      if (!citable(id, data))
        problem(
          'trade_fact_missing',
          `${at}.factIds[${j}]`,
          `${JSON.stringify(id)} is not a fact or item of the business`
        )
    })
    // A Tracy library block is no section of the template: the model adds it or not, as it judges.
    if (ids.length > 0 || description.source === 'library' || !hasName(description)) return
    if (NOT_TRADE_TYPES.has(description.type)) return
    if (unfilledFactFields(description, [], data).length > 0) return
    if (!contentFields(description).block.length && !contentFields(description).rows.length) return
    const onPage = pages.filter((p) => fitsRecipe(description, recipes.get(p.pageType)))
    // No kept page may show it, or every page that may already keeps it.
    if (onPage.every((p) => p.blocks.some((b) => b.block === description.id))) return
    if (FORM_REASONS.has(derivedReasonOf(description, { data, pages: [] }))) return
    problem(
      'trade_block_left_out',
      at,
      `block ${description.id} has only written copy and a page you keep may show it: a block that shows how the trade works (how a session, a visit or an order runs, what to bring) is kept on basis "trade", citing the fact that shows the business does that activity; leave it out only with factIds naming the fact that shows the business does not do it`
    )
  })
}
