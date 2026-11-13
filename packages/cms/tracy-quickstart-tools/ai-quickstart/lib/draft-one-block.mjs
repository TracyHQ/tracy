// One store block drafted from one kit block (ticket #583). Pure. `draftBlocks` (draft-blocks.mjs) decides which
// kit blocks become store blocks and passes the template's decision for each; this sorts the block's slots into
// fields, item fields and design fields.
//
// Decision keys read here (all optional except `type`): `type`, `noData`, `items`, `position`, `nav` (the block's
// menu labels are its items), `listsAsFields` (a repeating list whose one row is chosen per placed block, e.g. a
// masthead with a row per page), `listsNumbered` (a second repeating list written as numbered fields), `names`
// (content map key -> field name), `design` (content map keys that are design values), `fields` (unlisted content map
// slots added as fields: `{slot, name, kind, type}`), `retype` (content map key -> `{kind, type, storage}`: a value
// the content map stores under the wrong role, such as a list of social links kept as one HTML paragraph).
import {
  baseNameOf,
  fieldOf,
  isDerivedSlot,
  itemIdsOf,
  nameAllocator,
  rowIdsOf
} from './draft-block-fields.mjs'
import { mapKeyOf } from './draft-fields.mjs'
import { designFieldsOf } from './draft-design-fields.mjs'

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
  const used = new Set()
  const nav = []
  const derived = (slot, why) => {
    if (!out.derived.some((d) => d.block === id && d.slot === slot))
      out.derived.push({ block: id, slot, why })
  }
  const add = (list, entry, ids, name, item = false, extra = {}) => {
    if ((decision.design ?? []).includes(mapKeyOf(ids[0]))) return
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
      if (s.ownedBy && s.ownedBy !== kb.id && ctx.storeKitIds.has(s.ownedBy))
        derived(s.id, `a field of ${s.ownedBy}`)
      else if (isDerivedSlot(s.id) && decision.nav && s.id.startsWith('menuItem-')) nav.push(s)
      else if (isDerivedSlot(s.id))
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
    if (!asFields) items = { min: list.min, max: list.max }
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
  if (nav.length) {
    const read = nav.map((s) => fieldOf(s, [s.id], 'label', ctx)?.field).filter((f) => f?.limit)
    const least = read.sort((a, b) => a.limit - b.limit)[0]
    const label = { name: 'label', kind: 'editorial.menu_label', type: 'text', slots: nav.map((s) => s.id) }
    if (least)
      Object.assign(label, {
        limit: least.limit,
        limitFrom: `the narrowest measured menu label: ${least.limitFrom}`
      })
    else
      out.unmeasured.push({ block: id, field: 'label', slot: nav[0].id, limitFrom: 'no menu label measured' })
    itemFields.push(label, {
      name: 'link',
      kind: 'editorial.navigation_url',
      type: 'link',
      derived: 'the page address'
    })
    items = { min: 1, max: nav.length }
  }
  fields.push(...designFieldsOf({ entity, used, inLists, decision, ctx, alloc, out, id }))
  block.positions = [
    position ?? decision.position ?? kb.source?.position ?? (kb.role === 'page-body' ? 'component' : kb.role)
  ]
  block.items = decision.items ?? items ?? { min: 1, max: 1 }
  block.noData = decision.noData ?? { rule: 'hide' }
  block.fields = fields
  if (itemFields.length) block.itemFields = itemFields
  block.from = { kit: [own ? kb.id : `${kb.id} list ${lists[0].id}`], entity }
  if (!decision.type) out.undecided.push(id)
  if (block.items.min === null)
    out.problems.push({ block: id, problem: 'item minimum not measured by the kit' })
  return block
}
