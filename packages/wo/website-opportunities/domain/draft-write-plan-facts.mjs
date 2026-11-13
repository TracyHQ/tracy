// The business facts fanned out to every place the template shows them (ticket #597, `mapping.facts`), and the look:
// the logo pictures and the accent. Pure; part of `writePlanOf`. A fact is declared once and written at every one of its
// places that sits on a record of the site (a copy or store record placed on some page, the contact the build creates,
// the site identity); a place on a record the site does not have is not written. The first order entry of a fact is
// the one written; every other entry of that fact is listed as fanned out, never written twice.
import { consume, put, recordOf, skip, unproven } from './draft-write-sink.mjs'
import { textAt } from './draft-write-values.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every record of the site a fact place lands on. */
function recordsAt(state, loc) {
  if (loc.entity === 'settings')
    return [recordOf(state.sink, 'identity', { kind: 'identity', recordKind: 'identity' })]
  const declared = state.kit.mapping.entities?.[loc.entity]
  return [...state.sink.records.values()].filter((r) =>
    declared?.created ? r.kind === 'created' && r.recordKind === declared.kind : r.entity === loc.entity
  )
}

function writeFact(state, loc, value, entry, rule, records = recordsAt(state, loc)) {
  for (const record of records) {
    const via = record.kind === 'store' ? 'contract' : 'open'
    const slot = loc.slot ? state.kit.slots.get(loc.slot) : undefined
    const written = typeof value === 'string' ? textAt(value, { loc, via, slot }) : { value, rules: [] }
    put(state.sink, record.key, loc, written.value, {
      entry,
      rule: [rule, ...written.rules].join('+'),
      init: record
    })
  }
}

/** A fact written per item (a social link row): the item's own row of the fact's places on its record. */
function itemFact(state, { name, entry, at, scope }) {
  const own = state.site.recordOfBlock(at.page, at.block)
  const places = list(state.kit.mapping.facts?.[name]).filter((l) => l.entity === own?.entity)
  const loc = places[scope.index]
  if (!own || !loc) return skip(state.sink, entry.place, 'fact_place_missing', { fact: name })
  writeFact(state, loc, entry.value, entry.place, `fact:${name}`, [own])
}

/**
 * Fan every collected fact out to its places.
 * @param {object} state the planner's state (`facts` collected by `planBlocks`)
 */
export function planFacts(state) {
  const first = new Map()
  for (const fact of state.facts) {
    const { name, entry } = fact
    if (fact.scope.level !== 'block') {
      itemFact(state, fact)
      continue
    }
    if (first.has(name)) {
      skip(state.sink, entry.place, 'fact_fanned_out', { by: first.get(name), fact: name })
      continue
    }
    first.set(name, entry.place)
    if (entry.picture) {
      const logo = state.order.look?.logo
      if (!logo || logo.kind === 'text') {
        skip(state.sink, entry.place, 'text_logo_prints_site_name', { fact: name })
        continue
      }
      state.pictures.set(entry.place, { id: entry.place, kind: 'logo', picture: entry.picture })
      for (const loc of list(state.kit.mapping.facts?.[name]))
        writeFact(state, loc, { ref: `picture:${entry.place}` }, entry.place, `fact:${name}`)
    } else
      for (const loc of list(state.kit.mapping.facts?.[name]))
        writeFact(state, loc, entry.value, entry.place, `fact:${name}`)
    if (!state.sink.consumed.has(entry.place))
      skip(state.sink, entry.place, 'fact_place_not_on_site', { fact: name })
  }
}

/**
 * The look: the accent and its dark theme value. The mapping file declares no colour variable for the accent (no
 * `look` key, #584), so the operation carries the accent and is reported `unproven`; the logo is a fact (above).
 */
export function planLook(state) {
  const look = state.order.look ?? {}
  const entries = ['look.accent', ...(look.accentDark ? ['look.accentDark'] : [])]
  const variables = state.kit.mapping.look?.accent?.variables ?? null
  const record = recordOf(state.sink, 'look', {
    kind: 'look',
    recordKind: 'look',
    accent: look.accent ?? null,
    accentDark: look.accentDark ?? null,
    variables
  })
  for (const id of entries) consume(state.sink, id, record.key)
  if (!variables)
    unproven(state.sink, 'accent_variables_not_declared', {
      op: 'look',
      why: 'the mapping file names no colour variable the accent is written into'
    })
  return entries
}
