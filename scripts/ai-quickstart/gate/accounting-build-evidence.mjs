// What the write plan shows the write step did with a build declaration of the kit (ticket #585 on #597, review round
// 2): the build team's write step reads these keys (`DRAFT_WRITE_KIT_KEYS` of `draft-write-kit-keys.mjs`), and each
// one leaves a mark in the plan it makes. A menu item op of the page type, a page reached under its list page
// (`plan.under`), a record and its category created for the page type, a created record's frame (`op.frames`), the
// escape entry a written value takes (`escapeEntryAt`, the write step's own reader), the rule a hide leaves on the
// copy of its block. Pure.
import { escapeEntryAt } from '../../../packages/wo/website-opportunities/domain/draft-write-escape-place.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The plan's facts the accounting asks about, read once per plan. */
export function evidenceOf({ writePlan, order, mapping }) {
  const ops = list(writePlan?.ops)
  const typeOf = new Map(list(order?.pages).map((p) => [p.id, p.pageType]))
  const underTypes = new Set(Object.keys(writePlan?.under ?? {}).map((id) => typeOf.get(id)))
  // The store block of each copy op: `copy:<page>.<block>` through the order, `copy:site.<store block>` as it is.
  const storeOf = new Map()
  for (const p of list(order?.pages))
    for (const b of list(p.blocks)) storeOf.set('copy:' + p.id + '.' + b.id, b.block ?? b.storeBlock)
  const blockOf = (op) =>
    storeOf.get(op.key) ?? (String(op.key).startsWith('copy:site.') ? op.key.slice(10) : null)
  const orderBlocks = (block) =>
    list(order?.pages).flatMap((p) => list(p.blocks).filter((b) => b.block === block))
  return { ops, writePlan, mapping, underTypes, blockOf, orderBlocks }
}

/** A menu block's items, by what the plan makes of them: written, the order's fallback reason, or null. */
export function menuItemsUse(ev, block) {
  const menu = ev.mapping?.placements?.[block]?.menu ?? {}
  const menutype = menu.items?.from === 'main-menu' ? ev.writePlan?.mainMenu : menu.menutype
  if (ev.ops.some((o) => o.kind === 'menuItem.create' && o.fields?.menutype === menutype))
    return { written: true }
  const shown = ev.orderBlocks(block)
  if (shown.length && shown.every((b) => b.state === 'fallback'))
    return { reason: shown[0].reason ?? 'fallback' }
  return null
}

/** The menu item op of a page type, its own (an item page with no list page) or the declared one. */
export const menuItemOp = (ev, pageType, own) =>
  ev.ops.find((o) => o.kind === 'menuItem.create' && o.pageType === pageType && Boolean(o.link?.own) === own)

/** The create op of a record kind for a page type. */
export const createOp = (ev, kind, pageType) =>
  ev.ops.find((o) => o.kind === kind + '.create' && o.pageType === pageType)

/** Whether the records of a page type are filed in the category the plan creates for it. */
export function categoryFiled(ev, pageType) {
  const ref = 'category:' + pageType
  const made = ev.ops.some((o) => o.kind === 'category.create' && o.key === ref)
  return made && ev.ops.some((o) => o.pageType === pageType && o.fields?.catid?.ref === ref)
}

const sameLoc = (frame, loc) =>
  frame.column === loc.column &&
  (frame.nestedJson ?? null) === (loc.nestedJson ?? null) &&
  JSON.stringify(list(frame.jsonPath)) === JSON.stringify(list(loc.jsonPath))

/** What the plan does with a declared frame at one entity: `framed`, `no_piece_in_frame` or `no_record_created`. */
export function frameUse(ev, frame, entity) {
  const created = ev.ops.filter((o) => String(o.kind).endsWith('.create'))
  if (created.some((o) => list(o.frames).some((f) => f.loc?.entity === entity && sameLoc(frame, f.loc))))
    return 'framed'
  return created.some((o) => list(o.values).some((v) => v.loc?.entity === entity))
    ? 'no_piece_in_frame'
    : 'no_record_created'
}

/** Whether a value the plan writes takes this escape entry, by the write step's own reader. */
export const escapeUsed = (ev, entry) =>
  ev.ops.some((o) => list(o.values).some((v) => escapeEntryAt(ev.mapping, o, v.loc) === entry))

/** The copy ops of a store block. */
export const blockOps = (ev, block) => ev.ops.filter((o) => ev.blockOf(o) === block)

/** Whether every control field of a block's copies is written (`plan.controls`), so nothing is taken out. */
export function controlWritten(ev, ops, control) {
  const rows = list(ev.writePlan?.controls).filter(
    (c) =>
      ops.some((o) => o.record === c.record) &&
      JSON.stringify(list(c.fields)) === JSON.stringify(list(control))
  )
  return rows.length > 0 && rows.every((c) => list(c.written).every(Boolean))
}

/** Whether a copy op holds a rule, on the op, a value or an element it takes out. */
export const hasRule = (op, rule) =>
  list(op.rules).includes(rule) ||
  list(op.values).some((v) => v.rule === rule) ||
  list(op.removes).some((r) => r?.rule === rule)
