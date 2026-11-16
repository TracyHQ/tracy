// No image printed with an empty address (ticket #597, gate run 7): a site with a text logo printed the footer logo
// module with `<img src="">`, which a browser reads as the site root. The module's only field is the logo
// (block-170, an in-place module on every page) and the plan writes no picture there, so its blank site slot keeps the
// empty address. A place with no picture follows its block's own rule for no data (`noData.rule`, the block store):
//
//   hide       the module is not assigned to any page (the blank site leaves it unassigned), listed in
//              `plan.emptyPictures` with `picture_place_empty_hidden`
//   fallback   the template's own picture shows; a blank slot that holds no picture cannot, so it is flagged
//              `picture_place_empty` for the kit's team, and the module prints as the blank site left it
//
// An image slot is empty when the plan writes it nothing and its blank value is "" or "/", or the plan would write
// such a value (never sent: the value is dropped). Pure; part of `opsOf`.

const list = (value) => (Array.isArray(value) ? value : [])
const isEmptyAddress = (value) => typeof value === 'string' && /^\s*\/?\s*$/.test(value)

/** The image fields of a block that land in a blank site contract slot. */
const imageFieldsOf = (store) => list(store?.fields).filter((f) => f.type === 'image' && f.slot)

/**
 * The store records whose block shows an image slot with an empty address, by record key.
 * @returns {Map<string, {record: string, block: string, slots: string[], rule: string | null}>}
 */
export function emptyPicturesOf(state) {
  const out = new Map()
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'store') continue
    const block = record.block ?? state.kit.ownerOf.get(record.entity)
    const store = state.kit.store.get(block)
    const slots = []
    for (const field of imageFieldsOf(store)) {
      const written = [...record.values.entries()].find(([, v]) => v.loc.slot === field.slot)
      if (written && isEmptyAddress(written[1].value)) record.values.delete(written[0])
      else if (written) continue
      if (isEmptyAddress(String(state.kit.slots.get(field.slot)?.sample ?? ''))) slots.push(field.slot)
    }
    if (!slots.length) continue
    const rule = store?.noData?.rule ?? null
    const code = rule === 'hide' ? 'picture_place_empty_hidden' : 'picture_place_empty'
    out.set(record.key, { record: record.key, block, slots, rule })
    state.sink.unproven.push({ code, record: record.key, block, slots })
  }
  return out
}
