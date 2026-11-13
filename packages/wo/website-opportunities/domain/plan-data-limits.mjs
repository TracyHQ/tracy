// The rule that keeps data the template cannot hold off the plan (ticket #615): a fact or an item whose value is longer
// than the field of the block it would fill. Each field is written within the smallest limit of the stored places it
// writes (`field-place-limits.mjs`), and a data value is never shortened, so the page writer would stop the build on it
// (`data_over_limit`, kept there as the last guard). The gate takes such a fact or item off that block, with a code and
// the customer's reason, before the rows are planned or anything is written. Pure.
//
// A customer's answer is never dropped this way: the answer settling already holds it to the template's limits
// (`answer-field-limits.mjs`), so an answer too long here is marked (`answer: true`) and the gate reports it as a
// problem (`answer_over_limit`) as the last guard, never a silent drop.
//
// Which value fills which field follows the page writer's own rule (`page-writer-fields.mjs`): a block's DATA text
// field takes the first fact of its kind the block holds, an item's DATA text field that item's own value. A fact taken
// off lets the next fact of the kind fill the field.
import { limitOf, placeLimitsOf } from './field-place-limits.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { roleOrigin } from './page-writer-roles.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const charCount = (value) => [...String(value)].length
const isText = (value) =>
  (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value))
const dataText = (field) => field?.type === 'text' && roleOrigin(field.kind) === 'data'

export const DATA_OVER_LIMIT_REASON = 'This is longer than the section can show, so it is not shown there.'

/** The first field of `fields` whose value is too long, or null. */
function overOf(fields, valueOf, limits) {
  for (const field of fields) {
    const value = valueOf(field)
    if (isText(value) && charCount(value) > limitOf(field, limits))
      return { field: field.name, length: charCount(value), limit: limitOf(field, limits) }
  }
  return null
}

function blockData(page, block, d, data, limits, dropped) {
  const isAnswer = (id) => !!data.byId.get(id)?.source?.sources?.includes?.(ANSWER_SOURCE)
  const drop = (id, over) => {
    const answer = isAnswer(id)
    dropped.push({
      page: page.id,
      block: block.id,
      id,
      ...over,
      code: 'data_over_limit',
      reason: DATA_OVER_LIMIT_REASON,
      ...(answer ? { answer: true } : {})
    })
  }
  let ids = list(block.data)
  for (const field of list(d.fields).filter((f) => f?.type === 'text')) {
    // A copy field (the main button label) is checked only for the customer's answer of its kind it would show.
    const own = dataText(field)
    for (const id of ids) {
      const entry = data.byId.get(id)
      if (entry?.what !== 'fact' || entry.kind !== field.kind || !isText(entry.entry.value)) continue
      if (!own && !isAnswer(id)) continue
      const over = overOf([field], () => entry.entry.value, limits)
      if (!over) break
      drop(id, over)
      ids = ids.filter((x) => x !== id)
    }
  }
  const itemFields = list(d.itemFields).filter(dataText)
  return ids.filter((id) => {
    const entry = data.byId.get(id)
    if (entry?.what !== 'item') return true
    const over = overOf(itemFields, (f) => entry.source?.fields?.[f.kind]?.value, limits)
    if (over) drop(id, over)
    return !over
  })
}

/**
 * Take every fact and item whose value a field of its block cannot hold off that block.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description
 * @param {object} data the plan data (`planDataOf`)
 * @returns {{pages: object[], dropped: Array<{page: string, block: string, id: string, field: string, length: number,
 *   limit: number, code: 'data_over_limit', reason: string, answer?: true}>}} `answer`: the value is a customer's
 *   answer, which the gate reports as a problem instead
 */
export function dropOverLimitData(pages, blocks, data) {
  const limits = placeLimitsOf(blocks.values())
  const dropped = []
  const out = pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      const d = blocks.get(block.block)
      return d ? { ...block, data: blockData(page, block, d, data, limits, dropped) } : block
    })
  }))
  return { pages: out, dropped }
}

/** The gate problems of the customer's answers a block could not hold (`answer_over_limit`). */
export const answerOverLimitProblems = (dropped) =>
  dropped
    .filter((d) => d.answer)
    .map((d) => ({
      code: 'answer_over_limit',
      at: `pages[${d.page}].blocks[${d.block}].data`,
      message: `your answer ${JSON.stringify(d.id)} has ${d.length} characters; the field ${d.field} holds ${d.limit}`
    }))

/** The left out entries of the data a block could not hold and that no other block shows (never an answer). */
export function overLimitLeftOut(dropped, pages, data) {
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => list(b.data))))
  const seen = new Set()
  const out = []
  for (const d of dropped) {
    if (d.answer || shown.has(d.id) || seen.has(d.id)) continue
    seen.add(d.id)
    const record = data.byId.get(d.id)
    out.push({
      id: d.id,
      what: record.entry.label,
      kind: record.what === 'fact' ? 'feature' : 'item',
      reason: d.reason
    })
  }
  return out
}
