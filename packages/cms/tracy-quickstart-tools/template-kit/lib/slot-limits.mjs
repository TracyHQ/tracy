// One character limit per text slot across the whole kit, from what the contract and the kit read. A slot's
// numbers: the kit's frame reading (text-fit.json: its container filled until it wraps past the lines it may take or
// pushes another text), the content map's measured fit and the content map's declared number (the store's cap).
// The slot takes the smallest; the slots at one place of every list row, and an items list's card field, are one
// slot for this (a planner applies one number to every row). No number below the demo words is a limit: the demo
// shows fine at its own length. A content map fit that is only the box of the demo words (an item that grows with
// its words: a menu label, a tab, a chip, a title box) is no limit and is never lent to the other slots of its group,
// and the source says so. Every place that lists the slot carries the one number and its source
// (`maxCharactersFrom`).
import { neutralKey } from './ids.mjs'
import { places } from './text-limits.mjs'
import { partsOf } from './text-format.mjs'

const SLACK = 3 // a box estimate of the demo words reads a few characters wider than the words

/** How many characters the demo shows: every paragraph and bullet of the slot. */
export const demoLength = (sample) =>
  partsOf(sample)
    .map((p) => p.text)
    .join(' ').length

/**
 * Every place the kit lists a text slot: `{id, entry, mapOnly?}`. `entry` is the object that carries
 * `maxCharacters`; an items list's card field carries its items' number as well (`also`).
 */
export function slotPlaces(kit) {
  const out = []
  const add = (id, entry) => id && out.push({ id, entry })
  for (const b of kit.blocks ?? []) {
    for (const s of b.slots ?? []) if (s.type === 'text') add(s.id, s)
    for (const d of b.demoOwned ?? []) if (d.type === 'text') add(d.id, d)
    for (const l of b.lists ?? []) {
      for (const s of l.rowSlots ?? []) {
        if (s.type !== 'text') continue
        if (Array.isArray(s.slots)) for (const x of s.slots) add(x.id, x)
        else add(s.id, s)
      }
      for (const r of l.rows ?? []) for (const s of r.slots ?? []) if (s.type === 'text') add(s.id, s)
    }
  }
  for (const g of kit.site?.navigationGroups ?? []) for (const it of g.items ?? []) add(it.labelSlot, it)
  for (const c of kit.site?.contactBlocks ?? []) for (const f of c.accepts?.fields ?? []) add(f.id, f)
  return out
}

/** The slot ids that must share one number: the slots at one place of every row, an items list's card field. */
export function groupsOf(kit) {
  const parent = new Map()
  const find = (x) => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)
    return x
  }
  const join = (ids) => {
    const [first, ...rest] = ids.filter(Boolean).map(find)
    for (const x of rest) if (x !== first) parent.set(x, first)
  }
  for (const b of kit.blocks ?? [])
    for (const l of b.lists ?? []) {
      if (Array.isArray(l.rows) && l.rows.length)
        for (const slots of places(l.rows).values()) join(slots.map((s) => s.id))
      for (const s of l.rowSlots ?? []) if (Array.isArray(s.slots)) join(s.slots.map((x) => x.id))
    }
  return find
}

/** A slot's own numbers, each with its source; `notes` say what was set aside and why. */
function claimsOf(id, mapSlot, textFit) {
  const claims = []
  const notes = []
  const demo = demoLength(mapSlot?.sample)
  // The kit's frame reading fills the slot's real container; when it holds the demo words it stands for the frame,
  // and the content map's fit (an estimate from the demo words' box) is not used.
  const kitFit = textFit[id]
  let framed = false
  if (Number.isFinite(kitFit?.limit)) {
    const at = Object.entries(kitFit.byWidth ?? {})
      .map(([w, n]) => `${w}px ${n}`)
      .join(', ')
    if (kitFit.limit >= demo) {
      claims.push({ n: kitFit.limit, from: 'kit frame', at, id })
      framed = true
    } else notes.push(`the kit frame reading (${at}) is below the demo words, which show fine`)
  }
  const fit = mapSlot?.fit
  if (!framed && fit?.measured && Number.isFinite(fit.maxCharacters)) {
    const at = Object.entries(fit.maxChars ?? {})
      .map(([w, n]) => `${w} ${n}`)
      .join(', ')
    if (fit.maxCharacters <= demo + SLACK)
      notes.push(`the content map fit (${at}) is the box of the demo words, not a limit`)
    else claims.push({ n: fit.maxCharacters, from: 'content map fit', at, id })
  }
  if (Number.isFinite(mapSlot?.maxCharacters))
    claims.push({ n: mapSlot.maxCharacters, from: 'content map declared', at: '', id })
  return { claims, notes, demo }
}

/**
 * Give every place of every text slot its one limit and source. `mapSlots`: the content map's slots; `textFit`:
 * slot id -> the kit's frame reading. A slot with no number at all keeps none (the self-check names it).
 * @param {object} kit changed in place
 * @param {{mapSlots: object[], textFit?: Record<string, {limit: number, byWidth?: object}>}} o
 */
export function unifyLimits(kit, { mapSlots, textFit = {} }) {
  const mapOf = new Map(mapSlots.map((s) => [neutralKey(s.key), s]))
  const all = slotPlaces(kit)
  const find = groupsOf(kit)
  const groups = new Map()
  for (const id of new Set(all.map((p) => p.id))) {
    const g = groups.get(find(id)) ?? { claims: [], notes: new Map(), demo: 0 }
    const own = claimsOf(id, mapOf.get(id), textFit)
    g.claims.push(...own.claims)
    if (own.notes.length) g.notes.set(id, own.notes)
    g.demo = Math.max(g.demo, own.demo)
    groups.set(find(id), g)
  }
  // A group's number: the smallest claim that still holds every member's demo words.
  const best = new Map()
  for (const [key, g] of groups) {
    const fits = g.claims.filter((c) => c.n >= g.demo)
    const pool = fits.length ? fits : g.claims
    const c = pool.reduce((a, x) => (!a || x.n < a.n ? x : a), null)
    if (c) best.set(key, { ...c, notes: g.notes.get(c.id) ?? [] })
  }
  for (const { id, entry } of all) {
    const c = best.get(find(id))
    if (!c) continue
    const of = c.id !== id ? ` of ${c.id}` : ''
    entry.maxCharacters = c.n
    const notes = c.notes.length ? `; ${c.notes.join('; ')}` : ''
    entry.maxCharactersFrom = `${c.from}${of}${c.at ? ` (${c.at})` : ''}${notes}`
    delete entry.limitFrom
  }
  // An items list's card field takes its items' number.
  for (const b of kit.blocks ?? [])
    for (const l of b.lists ?? [])
      for (const s of l.rowSlots ?? [])
        if (Array.isArray(s.slots) && s.slots[0]?.maxCharactersFrom)
          Object.assign(s, {
            maxCharacters: s.slots[0].maxCharacters,
            maxCharactersFrom: s.slots[0].maxCharactersFrom
          })
  return kit
}

/**
 * Self-check: every place of a text slot carries a limit and its source, and every place of one slot the same
 * number. Returns how many slots break it; each is an error naming the slot.
 */
export function slotLimitChecks({ kit, errors }) {
  const byId = new Map()
  for (const p of slotPlaces(kit)) byId.set(p.id, [...(byId.get(p.id) ?? []), p.entry])
  let wrong = 0
  for (const [id, entries] of byId) {
    const values = new Set(entries.map((e) => e.maxCharacters))
    const bare = entries.some((e) => !Number.isFinite(e.maxCharacters) || !e.maxCharactersFrom)
    if (!bare && values.size === 1) continue
    wrong++
    errors.push({
      kind: bare ? 'slot-without-limit' : 'slot-limits-differ',
      slot: id,
      reason: bare
        ? `text slot ${id} is listed without a character limit and its source`
        : `text slot ${id} holds different limits (${[...values].join(', ')}) in the places that list it`
    })
  }
  return wrong
}
