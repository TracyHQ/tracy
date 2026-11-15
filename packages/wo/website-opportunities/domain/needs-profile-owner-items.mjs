// The needs profile's services that stand on the owner's chat statement alone (source `owner-statement`, D46), held to
// the rules of `owner-offer-shape.mjs` after the merge: a phrase about the business or its audience is no service, and
// a near duplicate of another owner service joins it. Each drop is a `dropped` entry with its code and reason. A
// service any other source states is never touched. A kept owner service is named the way a name is written
// (`logoNameSpelling`: a lower-case fragment such as "after school classes" gives "After School Classes"; a mixed-case
// spelling is the owner's own and kept), so only its case changes, never a letter. Pure.
import { logoNameSpelling } from './business-name.mjs'
import { primaryRoleOf } from './needs-profile-merge.mjs'
import { OWNER_SHAPE_REASONS, settleOwnerOffers } from './owner-offer-shape.mjs'

const OWNER_SOURCE = 'owner-statement'
const OFFERS = new Set(['service', 'package'])
const list = (value) => (Array.isArray(value) ? value : [])

const isOwners = (item) =>
  list(item?.sources).length > 0 && list(item.sources).every((s) => s === OWNER_SOURCE)

/** The kept item takes the rows of the near duplicate it absorbs. */
function merge(kept, gone) {
  const rows = [...list(kept.rows), ...list(gone.rows)]
  if (rows.length) kept.rows = rows
}

/** The owner's item with its name in name casing (letters unchanged). */
function named(item, role) {
  const field = item.fields?.[role]
  if (typeof field?.value !== 'string') return item
  const value = logoNameSpelling(field.value)
  return value && value !== field.value
    ? { ...item, fields: { ...item.fields, [role]: { ...field, value } } }
    : item
}

/**
 * The profile's items (by kind) with the owner's own services and packages settled, and the drop records.
 * @param {Record<string, object[]>} items merged items of the needs profile, by kind
 * @param {object[]} sources the research sources: the owner's words are the `text` of source `owner-statement`
 */
export function settleOwnerItems(items, sources) {
  const text = list(sources).find((s) => s?.id === OWNER_SOURCE)?.text ?? ''
  const out = { ...items }
  const dropped = []
  for (const kind of OFFERS) {
    if (!list(items?.[kind]).some(isOwners)) continue
    const labelOf = (item) => String(item.fields?.[primaryRoleOf(kind)]?.value ?? '')
    const settled = settleOwnerOffers(items[kind], { isOwners, labelOf, kindOf: () => kind, text, merge })
    out[kind] = settled.items.map((item) => (isOwners(item) ? named(item, primaryRoleOf(kind)) : item))
    for (const { item, code, keptAs } of settled.dropped)
      dropped.push({
        from: 'research',
        source: OWNER_SOURCE,
        kind,
        value: labelOf(item),
        code,
        reason: OWNER_SHAPE_REASONS[code],
        scope: 'observation',
        ...(keptAs ? { keptAs } : {})
      })
  }
  return { items: out, dropped }
}
