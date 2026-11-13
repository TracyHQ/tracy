// The rule that keeps data the template cannot hold off the plan (ticket #615): a fact or an item whose value is longer
// than the field of the block it would fill. Each field is written within the smallest limit of the stored places it
// writes (`field-place-limits.mjs`), and a data value is never shortened, so the page writer would stop the build on it
// (`data_over_limit`, kept there as the last guard). The gate takes such a fact or item off that block, with a code and
// the customer's reason, before the rows are planned or anything is written.
//
// An item loses only the over long VALUE when the field is one it can be shown without: that field then follows its
// no-data rule, as a missing value does (`cleared: true`, and `clearOverLimitValues` takes the value off the item the
// page writer reads). The item itself leaves the block only when the value fills the field that names it: a REQUIRED
// role of its kind in the role vocabulary (`GROUP_KINDS_V3[kind].requiredRoles`, the store declares no required field;
// its `noData` rule is per block), or, for a kind with none, the block's first data text item field (a post's title).
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
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const charCount = (value) => [...String(value)].length
const isText = (value) =>
  (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value))
const dataText = (field) => field?.type === 'text' && roleOrigin(field.kind) === 'data'

export const DATA_OVER_LIMIT_REASON = 'This is longer than the section can show, so it is not shown there.'
const short = (text, max) => ([...text].length > max ? `${[...text].slice(0, max - 1).join('')}\u2026` : text)
/** The customer's reason for one value of an item left off while the item is shown. */
export const valueOverLimitReason = (label, value) =>
  `"${short(String(value), 40)}" is longer than the section can show, so ${label} is shown without it.`

/** The values `clearOverLimitValues` took off an item, so a later attempt of the gate reports them again. */
const CLEARED = new WeakMap()
const valueOfItem = (source, kind) => source?.fields?.[kind]?.value ?? CLEARED.get(source)?.get(kind)
const roleWord = (kind) => String(kind).split('.').at(-1).replace(/_/g, ' ')

/** The kinds an item of `kind` cannot be shown without in a block whose data text item fields are `fields`. */
function requiredKindsOf(kind, fields) {
  const roles = GROUP_KINDS_V3[kind]?.requiredRoles ?? []
  return new Set(roles.length ? roles : fields.slice(0, 1).map((f) => f.kind))
}

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
    const required = requiredKindsOf(entry.kind, itemFields)
    const overs = itemFields
      .map((f) => ({ f, over: overOf([f], () => valueOfItem(entry.source, f.kind), limits) }))
      .filter((o) => o.over)
    const named = overs.find((o) => required.has(o.f.kind))
    if (named) {
      drop(id, named.over)
      return false
    }
    for (const { f, over } of overs)
      dropped.push({
        page: page.id,
        block: block.id,
        id,
        ...over,
        kind: f.kind,
        value: String(valueOfItem(entry.source, f.kind)),
        code: 'data_over_limit',
        reason: valueOverLimitReason(entry.entry.label, valueOfItem(entry.source, f.kind)),
        cleared: true
      })
    return true
  })
}

/**
 * Take the values left off an item (`cleared`) off the item records the page writer reads (the plan data's item
 * sources, the profile's own items), so each such field follows its no-data rule. Returns the data given.
 */
export function clearOverLimitValues(dropped, data) {
  for (const d of dropped.filter((x) => x.cleared)) {
    const source = data.byId.get(d.id)?.source
    if (!source?.fields?.[d.kind]) continue
    if (!CLEARED.has(source)) CLEARED.set(source, new Map())
    CLEARED.get(source).set(d.kind, source.fields[d.kind].value)
    delete source.fields[d.kind]
  }
  return data
}

/**
 * Take every fact and item whose value a field of its block cannot hold off that block.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description
 * @param {object} data the plan data (`planDataOf`)
 * @returns {{pages: object[], dropped: Array<{page: string, block: string, id: string, field: string, length: number,
 *   limit: number, code: 'data_over_limit', reason: string, answer?: true, cleared?: true, kind?: string,
 *   value?: string}>}} `answer`: the value is a customer's answer, which the gate reports as a problem instead;
 *   `cleared`: only this value (`kind`, `value`) is left off and the item stays
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

/**
 * The left out entries of the data a block could not hold and that no other block shows (never an answer), and one
 * per value left off a shown item, naming the field and the item (`Schedule of Invented Boxing`).
 */
export function overLimitLeftOut(dropped, pages, data) {
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => list(b.data))))
  const seen = new Set()
  const out = []
  for (const d of dropped) {
    if (d.cleared) {
      const key = `${d.id}|${d.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      const word = roleWord(d.kind)
      const label = data.byId.get(d.id).entry.label
      out.push({
        what: short(`${word.charAt(0).toUpperCase()}${word.slice(1)} of ${label}`, 80),
        kind: 'feature',
        reason: d.reason
      })
      continue
    }
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
