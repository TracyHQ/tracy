// Every reference a surviving record makes to another record is accounted for (ticket #583). Pure. A block keeps its
// settings in the blank site, so a value that points at another record (a menu item id, a category id, a link with
// `Itemid=`, a demo picture's path) still points there after the blank site step deleted that record: the block
// lists nothing, links nowhere, or shows a demo picture. Each such value must be one of:
//   - a declared keyed field: a field derived as "the page of the row" whose `keyAt` is that place;
//   - a field place, a design field or a report entry of the draft, at the content map slot that stores the value;
//   - a value of a record outside the store with a class (`decisions.outsideStore` by entity);
//   - a reference the decisions class (`decisions.references`, by `<entity>:<column>:<path>`):
//     `build-sets` (the build writes the new record's id; `owner` names the ticket), `kept` (valid on every site),
//     `not-drawn` (no page shows it);
//   - a reference to a record the blank site keeps (a menu type, a kept category, a module).
// A reference that is none of these is unaccounted, and draft.mjs refuses to write the declarations.
import { childPlacesOf } from './draft-child-lists.mjs'

export const REFERENCE_CLASSES = Object.freeze(['build-sets', 'kept', 'not-drawn'])
const KEYED = 'the page of the row'
const KEY_TARGETS = [
  [/^(item_?id|itemid)$/i, 'menuItem'],
  [/^(catid|category_?id)$/i, 'category'],
  [/^(article_?id)$/i, 'article'],
  [/^(created_by|user_?id|author_?id)$/i, 'user'],
  [/^(tag_?id|tags?)$/i, 'tag'],
  [/^menutype$/i, 'menuType']
]

const parse = (value) => {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
const keyOf = (path) => {
  const named = [...path].reverse().find((k) => !/^\d+$/.test(String(k))) ?? ''
  return String(named).match(/\[([^\]]+)\]$/)?.[1] ?? String(named)
}

/** The records a stored value refers to: `{kind, id}` per reference it carries. */
export function targetsOf(path, value) {
  const s = String(value)
  const out = []
  const key = keyOf(path)
  for (const [re, kind] of KEY_TARGETS)
    if (re.test(key) && s !== '' && (kind === 'menuType' || /^\d+$/.test(s))) out.push({ kind, id: s })
  for (const m of s.matchAll(/Itemid=(\d+)/g)) out.push({ kind: 'menuItem', id: m[1] })
  for (const m of s.matchAll(/view=article&(?:amp;)?id=(\d+)/g)) out.push({ kind: 'article', id: m[1] })
  for (const m of s.matchAll(/view=category&(?:amp;)?id=(\d+)/g)) out.push({ kind: 'category', id: m[1] })
  for (const m of s.matchAll(/(?:^|["'(\s/])(images\/[\w/.-]+\.(?:png|jpe?g|svg|gif|webp|mp4))/gi))
    out.push({ kind: 'media', id: m[1] })
  return out
}

/**
 * Every reference in the stored settings of the records the blank site keeps.
 * @param {object} lock the contract's presentation-lock.json (`entities`: key -> columns)
 * @param {(entity: string) => boolean} survives
 * @returns {Array<{entity: string, column: string, path: string[], kind: string, id: string, html: boolean}>}
 */
export function referencesOf(lock, survives) {
  const refs = []
  const walk = (entity, column, node, path) => {
    const value = parse(node)
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(entity, column, v, [...path, k])
      return
    }
    if (value === null || value === undefined || value === '') return
    const html = /<[a-z]/i.test(String(value))
    for (const t of targetsOf(path, value)) refs.push({ entity, column, path, ...t, html })
  }
  for (const [entity, record] of Object.entries(lock?.entities ?? {})) {
    if (!survives(entity)) continue
    for (const column of ['params', 'content'])
      if (record[column] !== undefined) walk(entity, column, record[column], [])
  }
  return refs
}

const same = (a, b) => JSON.stringify((a ?? []).map(String)) === JSON.stringify((b ?? []).map(String))

/** The content map slot that stores a reference: at its place, and for a piece of HTML, the attribute holding it. */
function slotOf(ref, slotsByEntity) {
  const at = (slotsByEntity.get(ref.entity) ?? []).filter(
    (s) =>
      s.column === ref.column &&
      same(s.nestedJson ? [s.nestedJson, ...(s.jsonPath ?? [])] : s.jsonPath, ref.path)
  )
  if (!ref.html) return at.find((s) => !s.xpath) ?? at[0] ?? null
  const attribute = ref.kind === 'media' ? /@src$/ : /@href$/
  return at.find((s) => attribute.test(String(s.xpath ?? ''))) ?? null
}

/**
 * Classes every reference of the surviving records.
 * @returns {{total: number, byClass: Record<string, number>, classed: object[], unaccounted: object[]}}
 */
export function accountForReferences({ lock, contentMap, blocks, report, decisions = {} }) {
  const removed = decisions.removedWithPage ?? {}
  const kindOf = (entity) => String(entity).split('-')[0]
  const deleted = (entity) => {
    const rule = removed[kindOf(entity)]
    return Boolean(rule?.why) && !(rule.except ?? []).includes(entity)
  }
  const slotsByEntity = new Map()
  for (const s of contentMap.slots ?? [])
    slotsByEntity.set(s.entity, [...(slotsByEntity.get(s.entity) ?? []), s])
  const keyed = new Set()
  const placeClass = new Map()
  const put = (place, cls) => place && !placeClass.has(place) && placeClass.set(place, cls)
  const fieldsOf = (lists) => (lists ?? []).flatMap((l) => [...(l.fields ?? []), ...fieldsOf(l.lists)])
  for (const b of blocks) {
    for (const f of [...b.fields, ...(b.itemFields ?? []), ...fieldsOf(b.lists), ...fieldsOf(b.itemLists)]) {
      if (f.derived === KEYED)
        for (const loc of [f.keyAt].flat(2).filter(Boolean))
          keyed.add(JSON.stringify([loc.entity, loc.column, (loc.jsonPath ?? []).map(String)]))
      put(f.slot, f.type === 'design' ? 'design' : 'field')
      for (const s of (f.slots ?? []).flat()) put(String(s).split('@')[0], 'field')
    }
    for (const s of [...childPlacesOf(b.lists), ...childPlacesOf(b.itemLists)]) put(s.split('@')[0], 'field')
  }
  for (const key of ['derived', 'unlisted', 'omitted']) for (const e of report[key] ?? []) put(e.slot, key)
  for (const e of report.sparse ?? []) for (const s of e.slots ?? []) put(s, 'sparse')
  const refs = referencesOf(lock, (entity) => !deleted(entity))
  const result = { total: refs.length, byClass: {}, classed: [], unaccounted: [] }
  const count = (cls) => {
    result.byClass[cls] = (result.byClass[cls] ?? 0) + 1
  }
  for (const ref of refs) {
    const where = `${ref.entity}:${ref.column}:${ref.path.join('.')}`
    const target = ref.kind === 'media' ? ref.id : `${ref.kind}-${ref.id}`
    if (keyed.has(JSON.stringify([ref.entity, ref.column, ref.path.map(String)]))) {
      count('keyed')
      continue
    }
    const slot = slotOf(ref, slotsByEntity)
    const cls = slot && placeClass.get(slot.key)
    if (cls) {
      count(cls)
      continue
    }
    const outside = decisions.outsideStore?.[ref.entity]
    if (outside?.as && outside.why) {
      count(`outsideStore ${outside.as}`)
      continue
    }
    const decided = decisions.references?.[where]
    if (
      REFERENCE_CLASSES.includes(decided?.as) &&
      decided.why &&
      (decided.as !== 'build-sets' || /^#\d+$/.test(decided.owner ?? ''))
    ) {
      count(decided.as)
      result.classed.push({
        at: where,
        to: target,
        as: decided.as,
        why: decided.why,
        ...(decided.owner ? { owner: decided.owner } : {})
      })
      continue
    }
    const gone = ref.kind === 'media' || (ref.kind !== 'menuType' && deleted(target))
    if (!gone && ref.kind !== 'media') {
      count('target kept')
      continue
    }
    result.unaccounted.push({ at: where, to: target })
  }
  return result
}
