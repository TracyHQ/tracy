// Text fields whose stored value carries inline markup (ticket #583). Pure. An accent span or a line break in a
// heading, a styled unit in a price, a paragraph wrapper around a body: the stored value is more than words, and this
// version of the block store format does not describe that markup. The draft lists every such field under one class
// the template's decisions name, with the tickets that own it (how the mapping file writes such a value, the gate that
// catches a broken look), so none of them is unowned; draft.mjs writes nothing while the class or its owners are
// missing.
//
// Decision shape (`inlineMarkup` in draft-decisions.json):
//   { "class": "<name>", "why": "<what the class is>", "owners": {"#584": "<what it owns>", "#585": "<...>"},
//     "notes": {"<block id>.<field name>": "<why this field is a rich body, not a list>"} }

/** The element names a content map sample carries as inline markers (`((span class="x"))`, `((br/))`). */
export function markupOf(sample) {
  const tags = new Set()
  for (const m of String(sample ?? '').matchAll(/\(\(\/?([a-z][\w-]*)/gi)) tags.add(m[1].toLowerCase())
  return [...tags].sort()
}

/** Every text field (child fields included) one of whose stored places holds inline markup, in store order. */
export function inlineMarkupFieldsOf(blocks, contentMap) {
  const samples = new Map((contentMap.slots ?? []).map((s) => [s.key, s.sample]))
  const found = []
  const visit = (b, fields, list) => {
    for (const f of fields ?? []) {
      if (f.type !== 'text') continue
      // A piece of a stored value (`<key>@<xpath>`) is one element's words, written inside that element.
      const places = [f.slot, ...(f.slots ?? []).flat()].filter((p) => p && !String(p).includes('@'))
      const tags = new Set(places.flatMap((p) => markupOf(samples.get(p))))
      if (tags.size)
        found.push({ block: b.id, ...(list ? { list } : {}), field: f.name, markup: [...tags].sort() })
    }
  }
  const visitLists = (b, lists, above) => {
    for (const l of lists ?? []) {
      const name = above ? `${above}/${l.name}` : l.name
      visit(b, l.fields, name)
      visitLists(b, l.lists, name)
    }
  }
  for (const b of blocks) {
    visit(b, [...(b.fields ?? []), ...(b.itemFields ?? [])])
    visitLists(b, b.lists)
    visitLists(b, b.itemLists)
  }
  return found
}

/**
 * The report entry of the inline markup class: the decided class with its owners and every field it holds.
 * `owned` is false when fields hold inline markup and the decisions name no class or no owner ticket.
 */
export function inlineMarkupReport({ blocks, contentMap, decisions = {} }) {
  const fields = inlineMarkupFieldsOf(blocks, contentMap)
  const decided = decisions.inlineMarkup ?? {}
  const owners = Object.keys(decided.owners ?? {}).filter((t) => /^#\d+$/.test(t))
  const notes = decided.notes ?? {}
  const owned = fields.length === 0 || Boolean(decided.class && decided.why && owners.length)
  return {
    owned,
    entry: {
      class: decided.class ?? null,
      why: decided.why ?? null,
      owners: decided.owners ?? {},
      count: fields.length,
      fields: fields.map((f) => {
        const note = notes[`${f.block}.${f.field}`]
        return note ? { ...f, note } : f
      })
    }
  }
}
