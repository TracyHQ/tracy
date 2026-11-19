// The guards the draft write owns (ticket #597): the plugin guards no copy and no created record, so the plan is held
// to the kit's rules before any door is called. Pure. A failed guard throws `DraftWriteError` (noRerun) with every
// problem found (entity, slot, entry and lengths; never the customer's text).
//
//   text_over_limit              a text longer than its field's limit (what a visitor reads, `visibleLength`), or than
//                                its blank contract slot's `maxCharacters` as the plugin counts it (`doorLength`)
//   straight_quote_in_open_slot  a straight double quote sent to a contract slot that opens empty (SLOT_NOT_CONTENT)
//   slot_missing                 a contract value with no slot, or a slot the blank site contract does not have
//   empty_text_node              an empty value at a text node (the node would be gone: one space keeps it)
//   markup_forbidden             markup in a value whose field declares no such inline part, a tag sent through the
//                                contract, a `((` or `))` anywhere but in the declared markers of a codes field, a tag
//                                at an ACM data place, or a tag, comment or other `<!`, `<?`, `</` form in a plain
//                                text column (a title, an alias)
//   icon_not_in_list             a network class the template's icon font lacks, an icon not in the icon library
//   picture_without_alt          a shown picture with no alt text
//   picture_web_address_only     a picture known only by its web address: pictures come from stored bytes
//   picture_not_stored           a picture with no stored bytes (an initials picture is drawn, not stored)
//   held_text_in_value           a held name or person in any value written, alt text or record title
//   block_not_approved           a block of the order the approved plan does not place
//   pair_incomplete              one half of a button (label, address) or of an icon pair written without the other
//   library_html_stale           a library block's HTML that does not show a shown field of the order
//   library_html_unsafe          a library block's HTML with anything `runsCodeIn` refuses
//   value_not_escaped            words not safe at their kind of place, the kind read from the kit's escapes
//                                declaration (`draft-write-escape-place.mjs`, `draft-write-escape.mjs`)
//   place_not_written            a value at a place the kit declares the build never writes (`not-written`)
//   record_name_empty            a contact created with an empty name, which the site would take (measured)
//   removal_element_gone         a copy's removal naming an element an earlier removal took out (`removalProblems`)
//   markup_runs_code             any other value written as HTML (an HTML piece, a value with a tag or a marker start,
//                                a created record's HTML) with anything `runsCodeIn` refuses, or a value written where
//                                an address is written (a link field, a link or picture slot, an address attribute
//                                piece, a record's link) that is an address running code. Words are never an address.
import { DraftWriteError, lengthOf } from './draft-write-error.mjs'
import { declaredMarkersOf } from './draft-write-escape.mjs'
import { heldInLeaf } from './draft-write-held.mjs'
import { doorLength, visibleLength, visibleTextOf } from './draft-write-length.mjs'
import { libraryHtmlProblems } from './draft-write-library-check.mjs'
import { addressRunsCode, runsCodeIn } from './draft-write-markup.mjs'
import { nameProblems, placeProblems } from './draft-write-place-guard.mjs'
import { removalProblems } from './draft-write-removal-check.mjs'
import { skipItems } from './draft-write-skip.mjs'
import { addressAt, linkOf, PLAIN_COLUMNS, plainAt, TAG_START } from './draft-write-place-kinds.mjs'
import { DOUBLE_PARENTHESIS } from './draft-write-tags.mjs'
import { heldTextsOf } from './plan-withheld.mjs'
import { placesOfOrder } from './write-order-check.mjs'
import { markupNotDeclared } from './write-order-check-entries.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** The words a value shows (`visibleTextOf`): kept for the built site check, which reads it. */
export const visibleOf = visibleTextOf
/** Whether a value is written as HTML: an HTML piece, or a value carrying a tag or a marker. */
const asHtml = (loc, text) => Boolean(loc?.xpath) || /[<>]/.test(text) || DOUBLE_PARENTHESIS.test(text)

/**
 * Markup that runs code in a value written as HTML; an address that runs code where an address is written (`address`:
 * a link field, a link or picture slot, an address attribute piece, a record's link). Words are never read as an
 * address: `Data: we keep only what you send` is prose.
 */
function codeProblems(at, text, { html, address }, report) {
  const rules = html ? runsCodeIn(text) : []
  if (address && addressRunsCode(text)) rules.push('code_address')
  if (rules.length) report('markup_runs_code', { ...at, rules, length: lengthOf(text) })
}

function valueProblems(op, value, ctx, report) {
  const { loc, entry } = value
  if (op.kind === 'contract.apply' && (typeof loc?.slot !== 'string' || !ctx.kit.slots.has(loc.slot)))
    report('slot_missing', { op: op.key, entity: loc?.entity ?? null, slot: loc?.slot ?? null, entry })
  if (typeof value.value !== 'string') return
  const at = { op: op.key, entity: loc.entity, slot: loc.slot ?? null, entry }
  const text = value.value
  const e = entry ? ctx.entries.get(entry) : null
  const slot = loc.slot ? ctx.kit.slots.get(loc.slot) : null
  // The field's limit counts what a visitor reads; the slot's, what the plugin's door counts (a raw column counts raw).
  if (e?.type === 'text' && Number.isInteger(e.limit) && e.limit > 0 && visibleLength(text) > e.limit)
    report('text_over_limit', { ...at, limit: e.limit, length: visibleLength(text), unit: 'visible' })
  const max = op.kind === 'contract.apply' ? slot?.maxCharacters : null
  if (Number.isInteger(max) && max > 0 && doorLength(slot, text) > max)
    report('text_over_limit', { ...at, limit: max, length: doorLength(slot, text), unit: 'door' })
  if (op.kind === 'contract.apply' && slot?.opensEmpty && text.includes('"'))
    report('straight_quote_in_open_slot', at)
  if (text === '' && /text\(\)(\[\d+\])?$/.test(loc.xpath ?? '')) report('empty_text_node', at)
  if (op.kind === 'contract.apply' && /[<>]/.test(text))
    report('markup_forbidden', { ...at, via: 'contract' })
  const markers = loc.nestedJson && !loc.xpath ? declaredMarkersOf(e) : new Set()
  placeProblems(op, at, text, { markers, loc, slot, mapping: ctx.kit.mapping }, report)
  if (loc.nestedJson && !loc.xpath && /<\/?[a-z]/i.test(text))
    report('markup_forbidden', { ...at, via: 'tag_at_codes_place' })
  if (value.rule?.startsWith('icon_class') && !ctx.classes.has(text)) report('icon_not_in_list', at)
  if (plainAt(loc) && TAG_START.test(text)) report('markup_forbidden', { ...at, via: 'tag_in_plain_column' })
  codeProblems(at, text, { html: asHtml(loc, text), address: addressAt(loc, e, slot) }, report)
}

/**
 * The columns and HTML an operation sends besides its values: a created record's title and alias hold no tag at all
 * (they are plain text), its link no code address, its HTML no markup that runs code.
 */
function columnProblems(op, report, mapping) {
  for (const [column, text] of Object.entries(op.fields ?? {})) {
    if (typeof text !== 'string') continue
    if (PLAIN_COLUMNS.has(column) && TAG_START.test(text))
      report('markup_forbidden', { op: op.key, column, via: 'tag_in_plain_column' })
    if (column !== 'link')
      placeProblems(
        op,
        { op: op.key, column },
        text,
        { markers: new Set(), loc: { column, entity: op.recordKind }, mapping },
        report
      )
    codeProblems(
      { op: op.key, column },
      text,
      { html: asHtml(null, text), address: column === 'link' },
      report
    )
  }
  nameProblems(op, report)
  const link = linkOf(op)
  if (link !== null) codeProblems({ op: op.key, column: 'link' }, link, { address: true }, report)
  if (typeof op.html === 'string' && op.kind !== 'library.create')
    codeProblems({ op: op.key, column: 'html' }, op.html, { html: true }, report)
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
    for (const e of list(place.fields))
      if (markupNotDeclared(e))
        report('markup_forbidden', { entry: e.place, via: 'field_inline', length: lengthOf(e.value) })
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

/**
 * The texts of the plan a held name may not reach: every string value, alt text, record column (title, alias, link)
 * and library HTML with the words it shows. Each is matched in every plain form by `heldInLeaf`.
 */
function textsOf(plan) {
  const texts = []
  for (const op of plan.ops) {
    for (const v of list(op.values)) if (typeof v.value === 'string') texts.push(v.value)
    if (op.alt) texts.push(op.alt)
    if (linkOf(op) !== null) texts.push(linkOf(op))
    for (const column of Object.values(op.fields ?? {})) if (typeof column === 'string') texts.push(column)
    if (typeof op.html === 'string') texts.push(op.html, visibleTextOf(op.html))
  }
  return texts
}

/**
 * Hold a plan to the guards; throws on the first failed check with every problem. With `skipItems` (the build's
 * policy, #575) a problem of one item (a value, a removal, an operation) takes that item out of the plan and is listed
 * in `plan.skippedItems` (`draft-write-skip.mjs`); only a problem of the whole plan, or no page left, still throws.
 * @param {object} plan the write plan
 * @param {{order: object, kit: object, withheld?: object, approved?: object, iconKeys?: string[], skipItems?: boolean}} ctx
 */
export function guardPlan(plan, ctx) {
  const problems = []
  const items = []
  const report = (code, details) => problems.push({ code, ...details })
  // A problem of one item: reported, and remembered with the item it takes out.
  const of = (target) => (code, details) => {
    report(code, details)
    items.push({ code, details, ...target })
  }
  const entries = new Map(
    placesOfOrder(ctx.order).flatMap(({ place }) => list(place.fields).map((e) => [e.place, e]))
  )
  const classes = new Set(Object.values(ctx.kit.mapping.networkIconClasses?.classes ?? {}))
  const guard = { kit: ctx.kit, entries, classes }
  const heldTexts = heldTextsOf(ctx.withheld)
  const held = (texts) => heldTexts.length > 0 && texts.some((t) => heldInLeaf(t, heldTexts))
  orderProblems(ctx.order, ctx, report)
  for (const op of plan.ops) {
    const opReport = of({ op })
    if (op.kind === 'picture.upload') pictureProblems(op, opReport)
    if (op.kind === 'library.create') libraryHtmlProblems(op, opReport)
    columnProblems(op, opReport, ctx.kit.mapping)
    removalProblems(op, (code, details, remove) => of({ op, remove })(code, details))
    for (const v of list(op.values)) {
      valueProblems(op, v, guard, of({ op, value: v }))
      if (typeof v.value === 'string' && held([v.value]))
        of({ op, value: v })('held_text_in_value', { op: op.key, slot: v.loc?.slot ?? null, entry: v.entry })
    }
    if (held(textsOf({ ops: [{ ...op, values: [] }] }))) opReport('held_text_in_value', { op: op.key })
  }
  // A half written pair: with the build's policy its written half is left out, so neither half shows (#575).
  for (const c of list(plan.controls))
    if (c.written.some(Boolean) && !c.written.every(Boolean)) {
      const op = plan.ops.find((o) => o.key === c.record)
      const halves = list(op?.values).filter((v) =>
        list(c.fields).some((f) => String(v.entry ?? '').endsWith(`.${f}`))
      )
      if (ctx.skipItems && halves.length)
        for (const v of halves) of({ op, value: v })('pair_incomplete', { op: op.key, entry: v.entry })
      else report('pair_incomplete', { record: c.record, fields: c.fields })
    }
  for (const pair of list(plan.pairs)) {
    const halves = plan.ops.flatMap((op) =>
      op.key === `picture:${pair.written}`
        ? [{ op }]
        : list(op.values)
            .filter((v) => pair.written && v.entry === pair.written)
            .map((value) => ({ op, value }))
    )
    if (ctx.skipItems && halves.length)
      for (const h of halves) of(h)('pair_incomplete', { op: h.op.key, entry: pair.written })
    else report('pair_incomplete', { entry: pair.entry, fields: pair.fields })
  }
  if (!problems.length) return
  if (ctx.skipItems && problems.length === items.length) return skipItems(plan, items)
  throw new DraftWriteError(problems[0].code, `${problems.length} problem(s) before any door call`, {
    problems: problems.slice(0, 20),
    problemsCount: problems.length
  })
}
