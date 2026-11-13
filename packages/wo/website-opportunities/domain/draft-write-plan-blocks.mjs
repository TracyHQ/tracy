// The values of every order field, picture and icon, set at the record each mapping location lands on (ticket #597).
// Pure; part of `writePlanOf` (`draft-write-plan.mjs`). A fact field is collected for the fan out
// (`draft-write-plan-facts.mjs`); a derived link is written where the mapping stores it (a page address, the key of a
// row keyed to a page) or left to the template that draws it; every entry not written is skipped with its reason.
import { put, skip } from './draft-write-sink.mjs'
import { mappingEntryOf, placesWithScope, targetOf } from './draft-write-targets.mjs'
import { textAt } from './draft-write-values.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== ''
const isLocation = (me) => typeof me?.entity === 'string' && typeof me?.column === 'string'

/** The inline declaration of a field of a block store block, by scope. */
function declarationOf(kit, block, scope, field) {
  const store = kit.store.get(block.block)
  const lists = scope.owner === 'item' ? store?.itemLists : store?.lists
  const fields =
    scope.level === 'block'
      ? store?.fields
      : scope.level === 'item'
        ? store?.itemFields
        : list(lists).find((l) => l.name === scope.list)?.fields
  return list(fields).find((f) => f.name === field)
}

/** Write one value at a location, through the target record of that location. */
function writeAt(state, at, loc, value, { entry, rule, inline }) {
  const target = targetOf(loc, { kit: state.kit, site: state.site, ...at })
  if (target.skip) return skip(state.sink, entry, target.skip, { entity: loc.entity })
  const via = target.init.kind === 'store' ? 'contract' : 'open'
  const slot = loc.slot ? state.kit.slots.get(loc.slot) : undefined
  const written = typeof value === 'string' ? textAt(value, { loc, inline, via, slot }) : { value, rules: [] }
  const record = put(state.sink, target.key, loc, written.value, {
    entry,
    rule: [rule, ...written.rules].filter(Boolean).join('+'),
    init: target.init
  })
  record.pages.add(at.page.id)
}

/** A row of a site copy whose rows are cut: the k-th row written on the copy takes the k-th stored row. */
function rankOf(state, at, scope) {
  if (scope.level !== 'row') return scope
  const placement = state.kit.mapping.placements?.[at.block.block]
  if (placement?.assign === 'page' || !state.kit.rowHides.get(at.block.block)) return scope
  const key = `${at.block.block}.${scope.list}`
  const seen = state.rows.get(key) ?? new Map()
  state.rows.set(key, seen)
  // A row keyed to a page is the same row on every page that places the block: one stored row per keyed page.
  const keyed = list(at.place.fields).find((e) => e.from === 'derived' && e.target?.page)?.target.page
  const id = keyed ? `page:${keyed}` : `${at.page.id}.${at.place.at}`
  if (!seen.has(id)) seen.set(id, seen.size + 1)
  return { ...scope, rank: seen.get(id) }
}

function writeEntry(state, at, scope, e) {
  const me = mappingEntryOf(state.kit.mapping.blocks?.[at.block.block], scope, e.field)
  // A menu block's item is a menu item the build creates in the block's menu: its label and its page together.
  if (scope.level === 'item' && state.kit.mapping.placements?.[at.block.block]?.menu)
    return state.menuLinks.push({ at, entry: e })
  if (!hasValue(e) && e.from !== 'derived')
    return skip(state.sink, e.place, e.action === 'fallback' ? 'template_fallback' : 'left_empty')
  if (me === undefined) return skip(state.sink, e.place, 'no_mapping_entry')
  if (me.fact) {
    state.facts.push({ name: me.fact, entry: e, at, scope })
    return undefined
  }
  if (me.derived) {
    const page = e.target?.page
    const keyAt = Array.isArray(me.keyAt) ? list(me.keyAt[scope.parent])[scope.rank - 1] : me.keyAt
    if (keyAt && page)
      return writeAt(
        state,
        at,
        keyAt,
        { ref: `page:${page}`, form: 'id' },
        { entry: e.place, rule: 'key_at' }
      )
    if (isLocation(me) && page)
      return writeAt(
        state,
        at,
        me,
        { ref: `page:${page}`, form: 'address' },
        { entry: e.place, rule: 'derived' }
      )
    return skip(state.sink, e.place, 'derived_drawn_by_template', { derived: me.derived })
  }
  if (!isLocation(me)) return skip(state.sink, e.place, 'location_unresolved')
  const inline = e.declared?.inline ?? declarationOf(state.kit, at.block, scope, e.field)?.inline
  writeAt(state, at, me, e.value, { entry: e.place, rule: `field:${e.from}`, inline })
}

function writePicture(state, at, scope, p, kind) {
  const id = kind === 'icon' ? p.id : p.frame
  const logo = p.reason === 'logo_from_brand_step'
  if ((p.state === 'hidden' || p.source === 'none') && !logo)
    return skip(state.sink, id, p.reason ?? `${kind}_none`)
  const me = mappingEntryOf(state.kit.mapping.blocks?.[at.block.block], scope, p.field)
  if (me?.fact) return state.facts.push({ name: me.fact, entry: { place: id, picture: p }, at, scope })
  if (!isLocation(me)) return skip(state.sink, id, 'no_mapping_entry')
  if (kind === 'icon' && p.storage === 'class-name')
    return writeAt(state, at, me, p.className ?? '', { entry: id, rule: 'icon_class' })
  state.pictures.set(id, { id, kind, picture: p })
  writeAt(state, at, me, { ref: `picture:${id}` }, { entry: id, rule: `${kind}_file` })
}

/**
 * Walk every place of the order and set its values.
 * @param {object} state the planner's state: `{order, kit, site, sink, facts, menuLinks, pictures, rows}`
 */
export function planBlocks(state) {
  for (const at of placesWithScope(state.order)) {
    const { block, place } = at
    const shown = place.state === 'show' && block.state !== 'hidden'
    const ids = [
      ...list(place.fields).map((e) => e.place),
      ...list(place.pictures).map((p) => p.frame),
      ...list(place.icons).map((i) => i.id)
    ]
    if (!shown) {
      for (const id of ids)
        skip(state.sink, id, block.state === 'hidden' ? 'block_hidden' : `place_${place.state}`)
      continue
    }
    if (block.source === 'library') {
      state.library.push(at)
      continue
    }
    const scope = rankOf(state, at, at.scope)
    for (const e of list(place.fields)) writeEntry(state, at, scope, e)
    for (const p of list(place.pictures)) writePicture(state, at, scope, p, 'picture')
    for (const i of list(place.icons)) writePicture(state, at, scope, i, 'icon')
  }
}
