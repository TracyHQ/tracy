// The light and dark versions of one icon or picture (`variantOf`) of the draft write plan (ticket #597), where one is
// written and the other is not: the guards stop such a plan (`pair_incomplete`). Pure; part of `writePlanOf`.
import { placesWithScope } from './draft-write-targets.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Light and dark versions of one icon or picture (`variantOf`) where one is written and the other is not. */
export function pairsOf(state) {
  const out = []
  for (const at of placesWithScope(state.order)) {
    const decls = [
      ...list(state.kit.store.get(at.block.block)?.fields),
      ...list(state.kit.store.get(at.block.block)?.itemFields),
      ...list(state.kit.store.get(at.block.block)?.lists).flatMap((l) => list(l.fields)),
      ...list(state.kit.store.get(at.block.block)?.itemLists).flatMap((l) => list(l.fields))
    ]
    const ids = new Map(
      [...list(at.place.pictures), ...list(at.place.icons)].map((p) => [
        p.field,
        p.frame && !p.id ? p.frame : (p.id ?? p.frame)
      ])
    )
    for (const d of decls) {
      if (!d.variantOf || !ids.has(d.name) || !ids.has(d.variantOf)) continue
      const a = state.sink.consumed.has(ids.get(d.name))
      const b = state.sink.consumed.has(ids.get(d.variantOf))
      if (a !== b)
        out.push({
          entry: ids.get(a ? d.variantOf : d.name),
          fields: [d.variantOf, d.name],
          // The half that is written: the build's policy leaves it out with its partner (#575).
          written: ids.get(a ? d.name : d.variantOf)
        })
    }
  }
  return out
}
