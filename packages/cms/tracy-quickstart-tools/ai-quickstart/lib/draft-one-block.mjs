// One store block drafted from one kit block (ticket #583). Pure. `draftBlocks` (draft-blocks.mjs) decides which
// kit blocks become store blocks and passes the template's decision for each; this sorts the block's slots into
// fields, item fields and design fields.
//
// Decision keys read here (all optional except `type`): `type`, `noData`, `items` with `itemsFrom` (draft-items.mjs),
// `sparse` (an item field stored for fewer items than the maximum, and what it is instead), `position`, `nav` (the block's
// menu labels are its items), `listsAsFields` (a repeating list whose one row is chosen per placed block, e.g. a
// masthead with a row per page), `listsNumbered` (a second repeating list written as numbered fields), `names`
// (content map key -> field name), `design` (content map keys that are design values), `fields` (unlisted content map
// slots added as fields: `{slot, name, kind, type}`), `retype` (content map key -> `{kind, type, storage}`: a value
// the content map stores under the wrong role), `lists` and `itemLists` (child lists, draft-child-lists.mjs: their
// places are taken out of every other field and report list), `keys` (block fields keyed to a page:
// `{name, column, jsonPath, pageType}`), `fieldKeys` (field name -> keys set on the drafted field: `theme`,
// `variantOf`, `for`).
import { applyItemsOf } from './draft-items-of.mjs'
import {
  baseNameOf,
  fieldOf,
  isDerivedSlot,
  itemIdsOf,
  nameAllocator,
  rowIdsOf
} from './draft-block-fields.mjs'
import { draftChildLists } from './draft-child-lists.mjs'
import { mapKeyOf } from './draft-fields.mjs'
import { designFieldsOf } from './draft-design-fields.mjs'
import { applyItems, maxSourceOf, minSourceOf } from './draft-items.mjs'
import { menuOf, navItems } from './draft-nav.mjs'

const neutral = (key) => String(key).replace(/^module-/, 'block-')
const entityOf = (id) => mapKeyOf(String(id).split('.')[0])

/** Every slot id a kit block's lists name. */
export function listSlotIds(lists) {
  const ids = new Set()
  for (const l of lists ?? []) {
    for (const s of l.rowSlots ?? []) {
      if (s.id) ids.add(s.id)
      for (const x of s.slots ?? []) if (x.id) ids.add(x.id)
    }
    for (const r of l.rows ?? []) for (const s of r.slots ?? []) if (s.id) ids.add(s.id)
  }
  return ids
}

/** A slot of another page's article shown in this block (a listing's or a related block's item): not a field. */
const isOtherArticle = (id, entity) => entityOf(id).startsWith('article-') && entityOf(id) !== entity

/** The draft of one store block from the kit block `kb` and its decision. */
export function draftOne(kb, id, decision, ctx, out, { lists = kb.lists ?? [], own = true, position } = {}) {
  const entity = own ? (kb.source?.entity ?? null) : entityOf(lists[0].id)
  const alloc = nameAllocator()
  const names = decision.names ?? {}
  const nameFor = (ids, wanted) => alloc(names[mapKeyOf(ids[0])] ?? wanted)
  const block = { id, type: decision.type, source: 'template', positions: [] }
  const fields = []
  const itemFields = []
  let items = null
  let itemsFrom = null
  const used = new Set()
  const nav = []
  const claimed = new Set()
  const childReport = {
    unmeasured: (field, slot, limitFrom) => out.unmeasured.push({ block: id, field, slot, limitFrom }),
    problem: (problem) => out.problems.push({ block: id, problem }),
    claim: (key) => {
      claimed.add(key)
      used.add(key)
      used.add(neutral(key))
    }
  }
  const menu = decision.nav ? menuOf(decision, entity, ctx) : null
  const menuLabels = (menu?.items ?? []).map((i) => i.label?.slot).filter(Boolean)
  const repeating = lists.find((l) => l.rowKind === 'items' && Array.isArray(l.shown))
  // The item places of a block whose items are rows of its own record (a team module's people): item i is the
  // block's record with `{0}` = i in the patterns of its child lists.
  const slotRows =
    !repeating && lists.find((l) => l.rowKind === 'slots' && Array.isArray(l.rows) && l.rows.length > 1)
  const itemParents = repeating
    ? repeating.shown.map((e) => ({ entity: e, fixed: {} }))
    : slotRows
      ? slotRows.rows.map((_, i) => ({ entity, fixed: { 0: String(i) } }))
      : []
  const childLists = {
    lists: draftChildLists(decision.lists, [{ entity, fixed: {} }], 1, ctx, childReport),
    itemLists: draftChildLists(decision.itemLists, itemParents, 1, ctx, childReport)
  }
  if (decision.itemLists?.length && !itemParents.length)
    childReport.problem('itemLists need a repeating list (a kit list of rowKind items, or of slot rows)')
  const derived = (slot, why) => {
    if (!out.derived.some((d) => d.block === id && d.slot === slot))
      out.derived.push({ block: id, slot, why })
  }
  const add = (list, entry, ids, name, item = false, extra = {}) => {
    if ((decision.design ?? []).includes(mapKeyOf(ids[0]))) return
    if (ids.some((x) => claimed.has(mapKeyOf(x)))) return
    const omitted = ctx.omit[mapKeyOf(ids[0])]
    if (omitted) {
      for (const x of ids) used.add(x)
      return out.omitted.push({ block: id, slot: mapKeyOf(ids[0]), why: omitted })
    }
    const res = fieldOf(entry, ids, name, ctx, { item })
    if (!res) return out.notInMap.push({ block: id, slot: ids[0] })
    for (const x of ids) used.add(x)
    const retype = decision.retype?.[mapKeyOf(ids[0])]
    const field = { ...res.field, ...extra, ...retype }
    if (retype && field.type !== 'text') {
      delete field.limit
      delete field.limitFrom
      res.unmeasured = false
    }
    list.push(field)
    if (res.unmeasured)
      out.unmeasured.push({ block: id, field: name, slot: mapKeyOf(ids[0]), limitFrom: res.field.limitFrom })
  }
  const inLists = listSlotIds(lists)
  if (own)
    for (const s of [...(kb.slots ?? []), ...(kb.demoOwned ?? [])]) {
      if (!s.id || used.has(s.id) || inLists.has(s.id) || nav.some((n) => n.id === s.id)) continue
      if (claimed.has(mapKeyOf(s.id)) || menuLabels.includes(s.id)) continue
      // A slot the decision declares as a field of this block (a template string the block draws) is that field.
      if ((decision.fields ?? []).some((f) => f.slot === mapKeyOf(s.id))) continue
      if (s.ownedBy && s.ownedBy !== kb.id && ctx.storeKitIds.has(s.ownedBy))
        derived(s.id, `a field of ${ctx.storeIdOfKit?.(s.ownedBy) ?? s.ownedBy}`)
      else if (isDerivedSlot(s.id) && decision.nav && s.id.startsWith('menuItem-')) nav.push(s)
      else if (s.id.startsWith('languageString-') && ctx.unlisted?.[mapKeyOf(s.id)]) {
        // A template string the decisions class (interface text valid on every site): listed with its class.
        const decided = ctx.unlisted[mapKeyOf(s.id)]
        if (!out.unlisted.some((u) => u.block === id && u.slot === mapKeyOf(s.id)))
          out.unlisted.push({
            block: id,
            slot: mapKeyOf(s.id),
            at: 'value',
            as: decided.as,
            why: decided.why
          })
      } else if (isDerivedSlot(s.id))
        derived(
          s.id,
          s.id.startsWith('menuItem-')
            ? 'a menu label: the page title'
            : 'a template string: a language override'
        )
      else if (isOtherArticle(s.id, entity)) derived(s.id, 'a field of another page shown here')
      else if (s.type !== undefined || ctx.mapSlots.has(mapKeyOf(s.id)))
        add(fields, s, [s.id], nameFor([s.id], baseNameOf(s.role ?? ctx.mapSlots.get(mapKeyOf(s.id))?.role)))
    }
  for (const list of lists) {
    if (
      own &&
      entity &&
      entityOf(list.id) !== entity &&
      (kb.source?.contains ?? []).includes(entityOf(list.id))
    ) {
      const nestedId = neutral(entityOf(list.id))
      out.nested.push(() =>
        draftOne(kb, nestedId, ctx.decisionOf(nestedId), ctx, out, {
          lists: [list],
          own: false,
          position: `inside:${id}`
        })
      )
      continue
    }
    const prefix = list.id.split('.').pop()
    const named = (base) => (base === prefix || base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`)
    const numbered = (decision.listsNumbered ?? []).includes(list.id)
    const asFields = list.max === 1 || items || numbered || (decision.listsAsFields ?? []).includes(list.id)
    const rows = numbered ? (list.rows ?? []).map((_, r) => r) : [0]
    ;(list.rowSlots ?? []).forEach((rs, j) => {
      const base = baseNameOf(rs.role ?? rs.field)
      if (!asFields) {
        const ids = list.rowKind === 'items' ? itemIdsOf(rs) : rowIdsOf(list, j)
        if (ids.length === 0 && rs.kind === 'link')
          return itemFields.push({
            name: alloc('link'),
            kind: 'editorial.navigation_url',
            type: 'link',
            derived: 'the item page address'
          })
        if (ids.length === 0 || isDerivedSlot(ids[0]))
          return derived(ids[0] ?? rs.field, 'not stored in the item')
        return add(itemFields, rs, ids, nameFor(ids, base), true)
      }
      for (const r of rows) {
        const slotId = numbered ? rowIdsOf(list, j)[r] : (rs.id ?? rs.slots?.[0]?.id)
        if (!slotId || isDerivedSlot(slotId)) derived(slotId ?? rs.field, 'not stored in the block')
        else {
          const name = numbered ? `${prefix}-${r + 1}-${base}` : named(base)
          add(
            fields,
            rs,
            [slotId],
            nameFor([slotId], name),
            false,
            numbered && r >= (list.min ?? 0) ? { optional: true } : {}
          )
        }
      }
    })
    if (!asFields) {
      items = { min: list.min, max: list.max }
      itemsFrom = { min: minSourceOf(list), max: maxSourceOf(list) }
    }
  }
  for (const f of own ? (kb.frames ?? []) : []) {
    if (used.has(f.id) || inLists.has(f.id) || !ctx.mapSlots.has(mapKeyOf(f.id))) continue
    add(fields, { role: f.role, type: 'image' }, [f.id], nameFor([f.id], baseNameOf(f.role ?? 'image')))
  }
  for (const extra of decision.fields ?? []) {
    const slot = ctx.mapSlots.get(extra.slot)
    if (!slot) {
      out.notInMap.push({ block: id, slot: extra.slot })
      continue
    }
    add(
      fields,
      {
        role: extra.kind,
        type: extra.type === 'link' ? 'url' : slot.type,
        maxCharacters: extra.limit,
        maxCharactersFrom: extra.limitFrom
      },
      [neutral(extra.slot)],
      alloc(extra.name)
    )
  }
  const ownSlot = new Map((kb.slots ?? []).map((s) => [s.id, s]))
  const labels = menu
    ? menuLabels.map((slot) => ownSlot.get(slot) ?? ctx.kitEntries.get(slot) ?? { id: slot })
    : nav
  if (labels.length) {
    const drafted = navItems(labels, menu, ctx, out, id)
    itemFields.push(...drafted.itemFields)
    items = drafted.items
    itemsFrom = drafted.itemsFrom
  }
  // A block field keyed to a page (a masthead row fixed to one page type): where its key is stored on the record.
  for (const key of decision.keys ?? [])
    fields.push({
      name: alloc(key.name),
      kind: 'editorial.navigation_url',
      type: 'link',
      derived: 'the page of the row',
      keyAt: { entity, column: key.column, jsonPath: key.jsonPath },
      ...(key.pageType ? { pageType: key.pageType } : {})
    })
  // Keys a decision sets on a drafted field by name: a light and dark pair, the text fields an icon illustrates.
  for (const field of [...fields, ...itemFields]) Object.assign(field, decision.fieldKeys?.[field.name])
  fields.push(...designFieldsOf({ entity, used, inLists, decision, ctx, alloc, out, id }))
  block.positions = [
    position ?? decision.position ?? kb.source?.position ?? (kb.role === 'page-body' ? 'component' : kb.role)
  ]
  // Keys in reading order: the counts sit before the no data rule, as the format lists them.
  block.items = null
  block.itemsFrom = null
  block.noData = decision.noData ?? { rule: 'hide' }
  block.fields = fields
  if (itemFields.length) block.itemFields = itemFields
  applyItems(block, decision, { items, from: itemsFrom }, out)
  for (const key of ['lists', 'itemLists']) if (childLists[key].length) block[key] = childLists[key]
  // What a person calls the block's items (a short noun phrase), then whose records they are and in which order
  // the block lists them (draft-items-of.mjs).
  if (block.itemFields && decision.itemsLabel) block.itemsLabel = decision.itemsLabel
  applyItemsOf(block, decision)
  const itemPlaces = (block.itemFields ?? []).find((f) => Array.isArray(f.slots))?.slots.map(entityOf)
  if (block.itemLists && repeating && itemPlaces && itemPlaces.join() !== repeating.shown.join())
    childReport.problem(
      'itemLists: the item places of the item fields and of the child lists are not in one order'
    )
  block.from = { kit: [own ? kb.id : `${kb.id} list ${lists[0].id}`], entity }
  if (!decision.type) out.undecided.push(id)
  return block
}
