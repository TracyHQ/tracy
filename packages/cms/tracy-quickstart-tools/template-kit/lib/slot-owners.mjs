// One block per slot. A content map slot written under two blocks gets written twice, or under the wrong one (the
// header listed every business name and logo of the map). Each slot belongs to the block that renders it, read from
// the DOM of the read pass: its words among the block's shown words, or its picture among the block's measured
// frames. Among the blocks that render it, the block of the slot's own entity wins; a slot nothing visibly renders
// stays with its own entity's block. Other blocks that also show it are named on the owner (`alsoShownIn`), never
// listed as theirs. Items lists only point at their items' slots (`rowSlots[].slots[]`): references, not ownership.

const norm = (s) =>
  String(s ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const pictureOf = (sample) =>
  String(sample ?? '')
    .split('#')[0]
    .split('?')[0]

/** Ownership also sees whole visible inline sentences, without changing atomic text counts or formatting. */
export function ownerTextsOf(details) {
  return [...(details?.texts ?? []), ...(details?.inlineTexts ?? [])]
    .map((t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase())
    .join(' | ')
}

/** The slot ids a block lists as its own, and where. */
function ownLists(b) {
  const out = []
  // A slot owned by another block (a link label listed by reference, `ownedBy`) is not the block's own.
  for (const d of b.slots ?? []) if (!d.ownedBy) out.push({ id: d.id, where: 'slots', entry: d })
  for (const d of b.demoOwned ?? []) out.push({ id: d.id, where: 'demoOwned', entry: d })
  for (const f of b.frames ?? []) out.push({ id: f.id, where: 'frames', entry: f })
  for (const l of b.lists ?? []) {
    if (l.rowKind === 'items') continue
    for (const s of l.rowSlots ?? []) out.push({ id: s.id, where: 'lists', entry: s })
    for (const r of l.rows ?? []) for (const s of r.slots) out.push({ id: s.id, where: 'lists', entry: s })
  }
  return out
}

/**
 * @param {{blocks: object[], slotOf: (id: string) => object|null, textsOf: (blockId: string) => string}} o
 *   `slotOf`: the content map slot behind a kit slot id; `textsOf`: a block's shown words, normalized and joined
 */
export function assignSlotOwners({ blocks, slotOf, textsOf }) {
  const listers = new Map()
  for (const b of blocks)
    for (const x of ownLists(b)) {
      if (!listers.has(x.id)) listers.set(x.id, new Set())
      listers.get(x.id).add(b)
    }
  for (const [id, set] of listers) {
    if (set.size < 2) continue
    const slot = slotOf(id)
    const renders = (b) => {
      if (
        (b.frames ?? []).some(
          (f) => f.id === id || (slot && f.picture && f.picture === pictureOf(slot.sample))
        )
      )
        return true
      const words = norm(slot?.sample)
      return words.length >= 2 && textsOf(b.id).includes(words)
    }
    const ownsEntity = (b) =>
      !!slot?.entity && (b.source?.entity === slot.entity || (b.source?.contains ?? []).includes(slot.entity))
    const all = [...set]
    const shown = all.filter(renders)
    const owner = shown.find(ownsEntity) ?? shown[0] ?? all.find(ownsEntity) ?? all[0]
    const also = shown.filter((b) => b !== owner).map((b) => b.id)
    for (const b of all) {
      if (b === owner) continue
      b.slots = (b.slots ?? []).filter((d) => d.id !== id)
      b.demoOwned = (b.demoOwned ?? []).filter((d) => d.id !== id)
      b.frames = (b.frames ?? []).filter((f) => f.id !== id)
      for (const l of b.lists ?? []) {
        if (l.rowKind === 'items') continue
        l.rowSlots = (l.rowSlots ?? []).filter((s) => s.id !== id)
        for (const r of l.rows ?? []) r.slots = r.slots.filter((s) => s.id !== id)
      }
    }
    if (also.length) for (const x of ownLists(owner)) if (x.id === id) x.entry.alsoShownIn = also
  }
  return blocks
}

/** Self-check: no slot id is listed by two blocks. Returns how many are. */
export function slotOwnerChecks({ blocks, errors }) {
  const seen = new Map()
  for (const b of blocks)
    for (const x of ownLists(b)) {
      if (!seen.has(x.id)) seen.set(x.id, new Set())
      seen.get(x.id).add(b.id)
    }
  let wrong = 0
  for (const [id, set] of seen) {
    if (set.size < 2) continue
    wrong++
    errors.push({
      kind: 'slot-in-two-blocks',
      field: `slots[${id}]`,
      reason: `the slot is listed by ${set.size} blocks (${[...set].join(', ')}); a slot belongs to the one block that renders it`
    })
  }
  return wrong
}
