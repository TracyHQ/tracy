// One character limit per slot kind of a list. Each row's text box is filled in the DOM until its text needs more
// lines than the demo used or moves the block (read-text-fit.js): that is the frame's limit, whatever the demo text
// length. A slot kind of a list (the slots at one place of every row) gets ONE limit, the smallest across rows, so a
// planner that applies the first row's number to every row never overfills one. A row that could not be filled
// falls back to the content map's limit, and the limit says so (`maxCharactersFrom`).

const kindOf = (s) => `${s.role ?? ''}|${s.type ?? ''}`

/** The slots of each row at one place: the n-th slot of each kind (role and type) in the row. */
function places(rows) {
  const out = new Map()
  for (const row of rows) {
    const seen = new Map()
    for (const s of row.slots) {
      if (s.type !== 'text') continue
      const n = seen.get(kindOf(s)) ?? 0
      seen.set(kindOf(s), n + 1)
      const key = `${kindOf(s)}#${n}`
      if (!out.has(key)) out.set(key, [])
      out.get(key).push(s)
    }
  }
  return out
}

/** The limit of one slot: the frame's when measured, else its own (from the content map). */
const limitOf = (s, fit) =>
  Number.isFinite(fit[s.id]?.limit)
    ? { n: fit[s.id].limit, from: 'frame' }
    : Number.isFinite(s.maxCharacters)
      ? { n: s.maxCharacters, from: 'content map' }
      : null

const fromOf = (froms) =>
  froms.every((f) => f === 'frame')
    ? 'frame'
    : froms.some((f) => f === 'frame')
      ? 'frame and content map'
      : 'content map'

/**
 * Give every text slot of a list's rows, and its row template (`rowSlots`), the smallest limit of its place.
 * Items lists (card fields) get the smallest limit of their items' slots the same way.
 * @param {object} list
 * @param {Record<string, {limit: number}>} fit slot id -> frame measurement
 */
export function harmonizeLimits(list, fit = {}) {
  if (Array.isArray(list.rows) && list.rows.length) {
    for (const [key, slots] of places(list.rows)) {
      const limits = slots.map((s) => limitOf(s, fit)).filter(Boolean)
      if (!limits.length) continue
      const n = Math.min(...limits.map((l) => l.n))
      const from = fromOf(limits.map((l) => l.from))
      for (const s of slots) {
        s.maxCharacters = n
        s.maxCharactersFrom = from
      }
      const [kind, at] = key.split('#')
      const template = (list.rowSlots ?? []).filter((s) => s.type === 'text' && kindOf(s) === kind)[
        Number(at)
      ]
      if (template) Object.assign(template, { maxCharacters: n, maxCharactersFrom: from })
    }
    return list
  }
  // An items list: each card field's slots, one per item shown.
  for (const field of list.rowSlots ?? []) {
    if (field.type !== 'text' || !Array.isArray(field.slots) || !field.slots.length) continue
    const limits = field.slots.map((s) => limitOf(s, fit)).filter(Boolean)
    if (!limits.length) continue
    const n = Math.min(...limits.map((l) => l.n))
    const from = fromOf(limits.map((l) => l.from))
    for (const s of field.slots) s.maxCharacters = n
    Object.assign(field, { maxCharacters: n, maxCharactersFrom: from })
  }
  return list
}

/**
 * Self-check: in every list, the slots at one place of every row share one limit, and the row template's limit is
 * that one (the smallest). Returns how many places break it.
 */
export function limitChecks({ blocks, errors }) {
  let wrong = 0
  for (const b of blocks)
    for (const list of b.lists ?? []) {
      const sets = []
      if (Array.isArray(list.rows) && list.rows.length)
        for (const [key, slots] of places(list.rows)) {
          const [kind, at] = key.split('#')
          const template = (list.rowSlots ?? []).filter((s) => s.type === 'text' && kindOf(s) === kind)[
            Number(at)
          ]
          sets.push({ name: kind, values: slots.map((s) => s.maxCharacters), list: template?.maxCharacters })
        }
      else
        for (const field of list.rowSlots ?? [])
          if (field.type === 'text' && Array.isArray(field.slots) && field.slots.length)
            sets.push({
              name: field.field,
              values: field.slots.map((s) => s.maxCharacters),
              list: field.maxCharacters
            })
      for (const set of sets) {
        const values = set.values.filter((v) => Number.isFinite(v))
        if (!values.length) continue
        const min = Math.min(...values)
        if (new Set(values).size === 1 && (set.list == null || set.list === min)) continue
        wrong++
        errors.push({
          kind: 'list-limits-differ',
          field: `blocks[${b.id}].lists[${list.id}].rowSlots[${set.name}].maxCharacters`,
          reason: `the rows hold different limits (${[...new Set(values)].join(', ')}) or the list limit (${set.list ?? 'none'}) is not their smallest (${min})`
        })
      }
    }
  return wrong
}
