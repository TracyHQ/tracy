// The guards the draft write owns (ticket #597): the plugin guards no copy and no created record, so the plan is held
// to the kit's rules before any door is called. Pure. A failed guard throws `DraftWriteError` (noRerun) with every
// problem found (entity, slot, entry and lengths; never the customer's text).
//
//   text_over_limit              a text longer than its field's limit, or than its blank contract slot's limit
//   straight_quote_in_open_slot  a straight double quote sent to a contract slot that opens empty (SLOT_NOT_CONTENT)
//   empty_text_node              an empty value at a text node (the node would be gone: one space keeps it)
//   markup_forbidden             markup in a value whose field declares no such inline part, a tag sent through the
//                                contract, content map markers at an HTML place, or a tag at an ACM data place
//   icon_not_in_list             a network class the template's icon font lacks, an icon not in the icon library
//   picture_without_alt          a shown picture with no alt text
//   picture_web_address_only     a picture known only by its web address: pictures come from stored bytes
//   picture_not_stored           a picture with no stored bytes (an initials picture is drawn, not stored)
//   held_text_in_value           a held name or person in any value written, alt text or record title
//   block_not_approved           a block of the order the approved plan does not place
//   pair_incomplete              one half of a button (label, address) or of an icon pair written without the other
import { DraftWriteError, lengthOf } from './draft-write-error.mjs'
import { heldTextsOf, namesHeldInAnyForm } from './plan-withheld.mjs'
import { placesOfOrder } from './write-order-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const TAG = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
const MARKER = /\(\(\/?([a-z][a-z0-9]*)\/?\)\)/gi
/** The words a value shows: markers and tags left out, entities read. */
export const visibleOf = (text) =>
  String(text)
    .replace(MARKER, '')
    .replace(TAG, '')
    .replace(/&(amp|lt|gt|quot);/g, 'x')
const tagsIn = (text) =>
  [...String(text).matchAll(TAG), ...String(text).matchAll(MARKER)].map((m) => m[1].toLowerCase())

function valueProblems(op, value, ctx, report) {
  const { loc, entry } = value
  if (typeof value.value !== 'string') return
  const at = { op: op.key, entity: loc.entity, slot: loc.slot ?? null, entry }
  const text = value.value
  const e = entry ? ctx.entries.get(entry) : null
  const slot = loc.slot ? ctx.kit.slots.get(loc.slot) : null
  const limits = [
    e?.type === 'text' ? e.limit : null,
    op.kind === 'contract.apply' ? slot?.maxCharacters : null
  ]
  const limit = Math.min(...limits.filter((n) => Number.isInteger(n) && n > 0))
  if (Number.isFinite(limit) && visibleOf(text).length > limit)
    report('text_over_limit', { ...at, limit, length: visibleOf(text).length })
  if (op.kind === 'contract.apply' && slot?.opensEmpty && text.includes('"'))
    report('straight_quote_in_open_slot', at)
  if (text === '' && /text\(\)(\[\d+\])?$/.test(loc.xpath ?? '')) report('empty_text_node', at)
  if (op.kind === 'contract.apply' && /[<>]/.test(text))
    report('markup_forbidden', { ...at, via: 'contract' })
  if (loc.xpath && /\(\(\/?[a-z]/i.test(text))
    report('markup_forbidden', { ...at, via: 'markers_at_html_place' })
  if (loc.nestedJson && !loc.xpath && /<\/?[a-z]/i.test(text))
    report('markup_forbidden', { ...at, via: 'tag_at_codes_place' })
  if (value.rule?.startsWith('icon_class') && !ctx.classes.has(text)) report('icon_not_in_list', at)
}

function orderProblems(order, { approved, iconKeys }, report) {
  const allowed = approved
    ? new Set(list(approved.pages).flatMap((p) => list(p.blocks).map((b) => `${p.id}/${b.id}/${b.block}`)))
    : null
  for (const page of list(order.pages))
    for (const block of list(page.blocks))
      if (allowed && !allowed.has(`${page.id}/${block.id}/${block.block}`))
        report('block_not_approved', { page: page.id, block: block.id })
  for (const { place } of placesOfOrder(order))
    for (const e of list(place.fields)) {
      if (typeof e.value !== 'string' || !/[<>]|\(\(/.test(e.value)) continue
      const inline = e.declared?.inline
      const allowedTags = new Set([...list(inline?.emphasis).map((p) => p.tag), ...list(inline?.wrapper)])
      if (!inline || tagsIn(e.value).some((t) => !allowedTags.has(t)))
        report('markup_forbidden', { entry: e.place, via: 'field_inline', length: lengthOf(e.value) })
    }
  if (Array.isArray(iconKeys))
    for (const icon of list(order.icons))
      if (icon.source !== 'none' && icon.storage === 'image-file' && !iconKeys.includes(icon.icon?.name))
        report('icon_not_in_list', { entry: icon.id })
}

function pictureProblems(op, report) {
  const at = { op: op.key, entry: op.picture }
  if (op.pictureKind === 'picture' && !String(op.alt ?? '').trim()) report('picture_without_alt', at)
  // An initials picture is drawn by the step, never stored: it needs letters or the figure, nothing else.
  if (op.stored?.id || op.draw) return
  report(/^https?:\/\//i.test(op.ref ?? '') ? 'picture_web_address_only' : 'picture_not_stored', at)
}

/** The texts of the plan a held name may not reach: every string value, alt text and record title. */
function textsOf(plan) {
  const texts = []
  for (const op of plan.ops) {
    for (const v of list(op.values)) if (typeof v.value === 'string') texts.push(v.value)
    if (op.alt) texts.push(op.alt)
    if (op.fields?.title) texts.push(op.fields.title, op.fields.alias)
  }
  return texts
}

/**
 * Hold a plan to the guards; throws on the first failed check with every problem.
 * @param {object} plan the write plan
 * @param {{order: object, kit: object, withheld?: object, approved?: object, iconKeys?: string[]}} ctx
 */
export function guardPlan(plan, ctx) {
  const problems = []
  const report = (code, details) => problems.push({ code, ...details })
  const entries = new Map(
    placesOfOrder(ctx.order).flatMap(({ place }) => list(place.fields).map((e) => [e.place, e]))
  )
  const classes = new Set(Object.values(ctx.kit.mapping.networkIconClasses?.classes ?? {}))
  const guard = { kit: ctx.kit, entries, classes }
  orderProblems(ctx.order, ctx, report)
  for (const op of plan.ops) {
    if (op.kind === 'picture.upload') pictureProblems(op, report)
    for (const v of list(op.values)) valueProblems(op, v, guard, report)
  }
  for (const c of list(plan.controls))
    if (c.written.some(Boolean) && !c.written.every(Boolean))
      report('pair_incomplete', { record: c.record, fields: c.fields })
  for (const pair of list(plan.pairs)) report('pair_incomplete', pair)
  const held = heldTextsOf(ctx.withheld)
  if (held.length && namesHeldInAnyForm(textsOf(plan), held))
    report('held_text_in_value', { count: held.length })
  if (problems.length)
    throw new DraftWriteError(problems[0].code, `${problems.length} problem(s) before any door call`, {
      problems: problems.slice(0, 20),
      problemsCount: problems.length
    })
}
