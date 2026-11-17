// The business facts fanned out to every place the template shows them (ticket #597, `mapping.facts`), and the look:
// the logo pictures and the accent. Pure; part of `writePlanOf`. A fact is declared once and written at every one of its
// places that sits on a record of the site (a copy or store record placed on some page, the contact the build creates,
// the site identity); a place on a record the site does not have is not written. The first order entry of a fact is
// the one written; every other entry of that fact is listed as fanned out, never written twice.
import { put, recordOf, skip } from './draft-write-sink.mjs'
import { textAt } from './draft-write-values.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * Every record of the site a fact place lands on. A logo fact (`pictured`) also lands on a template site setting the
 * blank site keeps with a slot (`site_logo`, `site_logo_dark`: no block places that record, so it is never in the sink
 * otherwise), written in place through the blank site contract as every kept record is (#575, P1 of the brand audit).
 */
function recordsAt(state, loc, { pictured = false, fact = null } = {}) {
  if (loc.entity === 'settings')
    return [recordOf(state.sink, 'identity', { kind: 'identity', recordKind: 'identity' })]
  const declared = state.kit.mapping.entities?.[loc.entity]
  const found = [...state.sink.records.values()].filter((r) =>
    declared?.created ? r.kind === 'created' && r.recordKind === declared.kind : r.entity === loc.entity
  )
  if (found.length || !pictured || declared?.kind !== 'siteSetting' || !loc.slot) return found
  if (!state.kit.kept?.has(loc.entity)) return found
  const init = {
    kind: 'store',
    recordKind: 'siteSetting',
    entity: loc.entity,
    block: state.kit.ownerOf?.get(loc.entity) ?? null,
    // No block places a site setting: the block that shows the fact (the header, whose own fallback keeps the
    // template's logo when none is given) answers whether a picture that cannot fit may leave it
    // (`draft-write-picture-fits.mjs`). Not its `block`: the setting holds none of that block's other fields.
    shownBy: blockOfFact(state, fact),
    sourceId: declared.sourceId ?? null
  }
  return [recordOf(state.sink, `store:${loc.entity}`, init)]
}

/** The first block of the kit mapping that shows a fact in one of its fields, or null. */
function blockOfFact(state, fact) {
  if (!fact) return null
  for (const [block, b] of Object.entries(state.kit.mapping.blocks ?? {}))
    if (Object.values(b?.fields ?? {}).some((f) => f?.fact === fact)) return block
  return null
}

function writeFact(state, loc, value, entry, rule, records = recordsAt(state, loc)) {
  // A place the kit leaves unwritten by decision (`notWritten`): never sent, and said so in the plan.
  if (loc.notWritten) {
    const fact = rule.replace(/^fact:/, '')
    if (!state.notWritten.some((n) => n.fact === fact && n.entity === loc.entity && n.column === loc.column))
      state.notWritten.push({ fact, entity: loc.entity, column: loc.column, by: loc.notWritten.by, entry })
    return
  }
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
        writeFact(
          state,
          loc,
          { ref: `picture:${entry.place}` },
          entry.place,
          `fact:${name}`,
          recordsAt(state, loc, { pictured: true, fact: name })
        )
    } else
      for (const loc of list(state.kit.mapping.facts?.[name]))
        writeFact(state, loc, entry.value, entry.place, `fact:${name}`)
    if (!state.sink.consumed.has(entry.place)) {
      const places = list(state.kit.mapping.facts?.[name])
      const reason =
        places.length && places.every((l) => l.notWritten)
          ? 'fact_not_written_by_decision'
          : 'fact_place_not_on_site'
      skip(state.sink, entry.place, reason, { fact: name })
    }
  }
}
