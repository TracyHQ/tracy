// Derive describe `blockKinds` from a release's own files. A content map lists concrete slots,
// not a block-kind schema, so a kind is the entity kind and a field is every slot of that kind
// that lands on the same place. One implementation for the fixtures and the relay, so the
// describe document the relay serves and the corpus it is tested against cannot drift.

// A per-field constraint is stated only when every slot of that field agrees; a varying limit is
// per slot (read it from the envelope's field constraints), so the kind-level value is null.
const agreed = (values) => (values.length && values.every((v) => v === values[0]) ? values[0] : null)

/** Joomla: a slot's entity kind, and its column plus value type (one column holds several types). */
export function joomlaSlotField(slot, entity) {
  return { kind: entity.kind, key: `${slot.column}:${slot.type}` }
}

/** WordPress: a page slot's block `metadata.name`; an option slot's option (and nested field). */
export function wordpressSlotField(slot, entity) {
  const t = slot.target
  return { kind: entity.kind, key: t.block ?? (t.field ? `${t.option}.${t.field}` : t.option) }
}

/**
 * Group a content map's slots into block kinds, in first-seen order. `writable` is the seat's
 * answer for slot writes (true for a seat that may apply), stated per field.
 */
export function slotBlockKinds(contentMap, slotField, { writable = true } = {}) {
  const entities = new Map(contentMap.entities.map((e) => [e.key, e]))
  const kinds = new Map()
  for (const slot of contentMap.slots) {
    const entity = entities.get(slot.entity)
    if (!entity) throw new Error(`Slot ${slot.key} names an unknown entity ${slot.entity}`)
    const { kind, key } = slotField(slot, entity)
    if (!kinds.has(kind)) kinds.set(kind, new Map())
    const fields = kinds.get(kind)
    if (!fields.has(key)) fields.set(key, [])
    fields.get(key).push(slot)
  }
  return [...kinds].map(([kind, fields]) => ({
    kind,
    label: null,
    root: null,
    nestable: null,
    fields: [...fields].map(([key, slots]) => {
      const types = new Set(slots.map((s) => s.type))
      if (types.size !== 1) throw new Error(`Field ${kind}.${key} holds types ${[...types].join(', ')}`)
      return {
        key,
        type: slots[0].type,
        translatable: null,
        writable,
        constraints: {
          maxCharacters: agreed(slots.map((s) => s.maxCharacters ?? null)),
          requiresEvidence: agreed(slots.map((s) => s.requiresEvidence ?? null)),
          // `siteIdentity` slots may be emptied or filled from empty; others say nothing.
          emptyAllowed: slots.every((s) => s.siteIdentity === true) ? true : null
        }
      }
    })
  }))
}

// EmDash field types onto v1 field value types. Prose is a string or Portable Text array, a link
// is an object and a group is a list of rows, so all three are `json`; a date and a reference id
// are strings.
export const EMDASH_FIELD_TYPES = {
  text: 'text',
  prose: 'json',
  image: 'image',
  number: 'number',
  boolean: 'boolean',
  date: 'text',
  reference: 'text',
  link: 'json',
  group: 'json'
}

/**
 * EmDash: every site-model type is a root kind; every group field is also a nestable kind
 * `<type>.<field>` of its row subfields. No slot contract exists, so writability is unknown.
 */
export function emdashBlockKinds(siteModel, locale = siteModel.locales.default) {
  const field = (f) => {
    const type = EMDASH_FIELD_TYPES[f.type]
    if (!type) throw new Error(`Unmapped EmDash field type ${f.type}`)
    return { key: f.name, type, translatable: null, writable: null, constraints: null }
  }
  return siteModel.types.flatMap((t) => [
    {
      kind: t.name,
      label: t.label?.[locale] ?? null,
      root: true,
      nestable: false,
      fields: t.fields.map(field)
    },
    ...t.fields
      .filter((f) => f.type === 'group')
      .map((f) => ({
        kind: `${t.name}.${f.name}`,
        label: null,
        root: false,
        nestable: true,
        fields: (f.fields ?? []).map(field)
      }))
  ])
}
