// One character limit per text slot across the whole kit, copied faithfully from what the contract and the kit
// already read, never measured again. A slot's numbers: the content map's measured fit (the narrowest of its
// widths), the kit's own frame reading (text-fit.json, card and row fields) and the content map's declared number
// (the store's cap). The slot takes the smallest; the slots at one place of every list row, and an items list's
// card field, are one slot for this (a planner applies one number to every row). A fit that is only the box of the
// demo word on an auto-sizing item (a menu label, a button: its box grows with its words) is no limit, and the
// source says so. Every place that lists the slot carries the one number and its source (`maxCharactersFrom`).
import { neutralKey } from './ids.mjs'
import { places } from './text-limits.mjs'

const AUTO_SIZING = /(menu_label|button_label|chip|tag)$/
const SLACK = 3 // a box estimate of the demo word reads a few characters wider than the word

const plain = (s) =>
  String(s ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

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
function groupsOf(kit) {
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

/** A slot's own numbers, each with its source. */
function claimsOf(id, mapSlot, textFit) {
  const claims = []
  let note = ''
  const fit = mapSlot?.fit
  if (fit?.measured && Number.isFinite(fit.maxCharacters)) {
    const at = Object.entries(fit.maxChars ?? {})
      .map(([w, n]) => `${w} ${n}`)
      .join(', ')
    const demo = plain(mapSlot.sample).length
    if (AUTO_SIZING.test(mapSlot.role ?? '') && fit.maxCharacters <= demo + SLACK)
      note = `; the content map fit (${at}) is the box of the demo word on an auto-sizing item, not a limit`
    else claims.push({ n: fit.maxCharacters, from: 'content map fit', at, id })
  }
  const kitFit = textFit[id]
  if (Number.isFinite(kitFit?.limit)) {
    const at = Object.entries(kitFit.byWidth ?? {})
      .map(([w, n]) => `${w}px ${n}`)
      .join(', ')
    claims.push({ n: kitFit.limit, from: 'kit frame', at, id })
  }
  if (Number.isFinite(mapSlot?.maxCharacters))
    claims.push({ n: mapSlot.maxCharacters, from: 'content map declared', at: '', id, note })
  return claims
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
  const best = new Map()
  for (const id of new Set(all.map((p) => p.id)))
    for (const c of claimsOf(id, mapOf.get(id), textFit)) {
      const g = find(id)
      const had = best.get(g)
      if (!had || c.n < had.n) best.set(g, c)
    }
  for (const { id, entry } of all) {
    const c = best.get(find(id))
    if (!c) continue
    const of = c.id !== id ? ` of ${c.id}` : ''
    entry.maxCharacters = c.n
    entry.maxCharactersFrom = `${c.from}${of}${c.at ? ` (${c.at})` : ''}${c.note ?? ''}`
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
