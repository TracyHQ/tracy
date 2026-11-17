// One offer named twice under different names (#575, plan stage inputs, P8): "Tennis lessons" on the website and
// "Tennis" on a social page, or two wordings of one fitness class. Equal names are joined by the merge
// (`needs-profile-merge.mjs`) and a leading label or the business's name by `needs-profile-near-duplicates.mjs`; past
// that, whether two names are one offer is free text only a reader can judge, so the needs profile model says it
// (`sameOffers` of its reply, rule 9 of `needs-profile-prompt.md`) and code never matches words. Code only checks the
// reply's structure:
//   - an entry gives at least two distinct names and a short `why`;
//   - every name is the name of one service or package of the profile, all of one kind;
//   - no item it names holds a conflict the owner has to settle first (a question names that item's field).
// An entry that fails merges nothing and is recorded in `dropped` with its code. The fuller entry is kept (more fields,
// then more rows, then more sources, then the longer name); it takes every field it lacks and every source and row of
// the others. Each item merged away is recorded in `merged` with the model's `why` and its whole record (`item`), so a
// wrong merge is seen and can be undone; it is never a left out entry. Pure.
import { primaryRoleOf, textKey } from './needs-profile-merge.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const OFFERS = ['service', 'package']

export const SAME_OFFER_CODE = 'same_offer_merged'
export const SAME_OFFER_REASON =
  'the needs profile model read these names as one offer; the fuller entry is kept and this one joined it'
export const SAME_OFFER_DROPS = Object.freeze({
  same_offer_unreadable: 'a same offer entry without two names and a reason',
  same_offer_unknown_name: 'a same offer entry names an offer the profile does not hold',
  same_offer_kinds_differ: 'a same offer entry names a service and a package',
  same_offer_conflicted: 'a same offer entry names an offer with a conflict the owner settles first'
})
const drop = (code, names) => ({
  from: 'model',
  value: names.join(' | '),
  code,
  reason: SAME_OFFER_DROPS[code],
  scope: 'observation'
})

const nameOf = (item) => String(item.fields?.[primaryRoleOf(item.kind)]?.value ?? '')
const conflicted = (item) => Object.values(item.fields ?? {}).some((f) => isText(f?.conflict))
const score = (item) => [
  Object.keys(item.fields ?? {}).length,
  list(item.rows).length,
  list(item.sources).length,
  [...nameOf(item)].length
]
/** Whether `a` is fuller than `b` (rules above); a tie keeps the first. */
const fuller = (a, b) => {
  const [x, y] = [score(a), score(b)]
  const at = x.findIndex((v, i) => v !== y[i])
  return at !== -1 && x[at] > y[at]
}
const absorb = (kept, gone) => {
  const rows = [...list(kept.rows), ...list(gone.rows)]
  return {
    ...kept,
    fields: { ...gone.fields, ...kept.fields },
    sources: [...new Set([...list(kept.sources), ...list(gone.sources)])],
    ...(rows.length ? { rows } : {})
  }
}

/** The names of one entry of the model's `sameOffers`, or null when the entry is not readable. */
function namesOf(entry) {
  const names = list(entry?.names).filter(isText)
  if (!isText(entry?.why) || names.length !== list(entry?.names).length) return null
  const distinct = [...new Map(names.map((n) => [textKey(n), n.trim()])).values()]
  return distinct.length >= 2 ? distinct : null
}

/**
 * The profile's items with the offers the model read as one merged, the record of each merge, and each entry refused.
 * @param {Record<string, object[]>} items the needs profile's items, by kind
 * @param {unknown} sameOffers the model's `sameOffers`: `[{names: string[], why: string}]`
 * @returns {{items: Record<string, object[]>, merged: object[], dropped: object[]}}
 */
export function mergeSameOffers(items, sameOffers) {
  const out = Object.fromEntries(Object.entries(items ?? {}).map(([k, v]) => [k, [...list(v)]]))
  const merged = []
  const dropped = []
  for (const entry of list(sameOffers)) {
    const names = namesOf(entry)
    if (!names) {
      dropped.push(drop('same_offer_unreadable', list(entry?.names).filter(isText)))
      continue
    }
    const found = names.map((name) =>
      OFFERS.flatMap((kind) => list(out[kind])).find((item) => textKey(nameOf(item)) === textKey(name))
    )
    if (found.some((item) => !item)) {
      dropped.push(drop('same_offer_unknown_name', names))
      continue
    }
    const group = [...new Set(found)]
    if (group.length < 2) continue
    if (new Set(group.map((item) => item.kind)).size > 1) {
      dropped.push(drop('same_offer_kinds_differ', names))
      continue
    }
    if (group.some(conflicted)) {
      dropped.push(drop('same_offer_conflicted', names))
      continue
    }
    const kind = group[0].kind
    const winner = group.reduce((best, item) => (fuller(item, best) ? item : best))
    let kept = winner
    for (const gone of group.filter((item) => item !== winner)) {
      kept = absorb(kept, gone)
      merged.push({
        from: 'model',
        kind,
        id: gone.id,
        value: nameOf(gone),
        into: winner.id,
        code: SAME_OFFER_CODE,
        reason: SAME_OFFER_REASON,
        why: entry.why.trim(),
        item: gone,
        scope: 'observation'
      })
    }
    out[kind] = out[kind].filter((item) => !group.includes(item) || item === winner)
    out[kind][out[kind].indexOf(winner)] = kept
  }
  return { items: out, merged, dropped }
}
