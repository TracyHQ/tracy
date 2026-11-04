// The owner table (ADR 0044, decision 3): for each content slot, the one file with the right to fill it. Each file says
// what it claims as a flat list of claims, and the table only compares claims, so a new owner (the picture manifest, the
// brand file) joins by adding a function that lists its claims, with nothing here changed.
//
// A claim is { slot, owner, file, kind, content }. Different content on one slot is a dispute, whichever files it came
// from; identical repeats are one owner reaching the slot twice and are not.

/** The site copy's claims: every slot it fills. `owner` is the entry's own ("writer" or "plan-label"). */
export const copyClaims = (slots, file) =>
  slots.map((s) => ({ slot: s.slot, owner: s.owner, file, kind: 'text', content: JSON.stringify(s.items) }))

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The block decisions a site keeps: shared blocks and the blocks of kept pages, without the hidden ones. */
export function keptBlocks(plan) {
  const decisions = [
    ...arr(plan?.sharedBlocks),
    ...arr(plan?.pages)
      .filter((p) => isObject(p) && p.decision === 'keep')
      .flatMap((p) => arr(p.blocks))
  ]
  return decisions
    .map((d) => (typeof d === 'string' ? { block: d } : d))
    .filter((d) => isObject(d) && typeof d.block === 'string' && d.decision !== 'hide')
}

/**
 * The plan's claims: link targets and hide decisions. `hidden` is the copy check's reading of the plan (a slot the plan
 * also fills elsewhere is not hidden), and the main menu items to hide are hide decisions as well. A target the plan gives
 * a link wins over a hide the plan gives it elsewhere, as a filled slot does.
 */
export function planClaims({ plan, hidden, menuHide }, file) {
  const claims = []
  const linked = new Set()
  for (const d of keptBlocks(plan))
    for (const l of arr(d.links))
      if (isObject(l) && typeof l.link === 'string') {
        linked.add(l.link)
        claims.push({ slot: l.link, owner: 'plan', file, kind: 'link', content: String(l.leadsTo ?? '') })
      }
  const hides = new Set([...hidden, ...arr(menuHide).map((m) => m?.slot)])
  for (const slot of hides)
    if (typeof slot === 'string' && !linked.has(slot))
      claims.push({ slot, owner: 'plan', file, kind: 'hide', content: '(hide)' })
  return claims
}

/**
 * @param {object[]} claims
 * @returns {{ owners: Map<string, object>, disputes: { slot: string, claims: object[] }[] }} `owners`: the first claim of
 *   each slot; `disputes`: each slot with different content, with one claim per content
 */
export function ownerTable(claims) {
  const bySlot = new Map()
  for (const claim of claims) {
    const list = bySlot.get(claim.slot) ?? []
    if (!list.some((c) => c.content === claim.content)) list.push(claim)
    bySlot.set(claim.slot, list)
  }
  const owners = new Map()
  const disputes = []
  for (const [slot, list] of bySlot) {
    owners.set(slot, list[0])
    if (list.length > 1)
      disputes.push({
        slot,
        claims: list.map(({ owner, file, kind, content }) => ({ owner, file, kind, content }))
      })
  }
  return { owners, disputes }
}

/** Every slot of the kit's kept blocks that no file claims: it still holds demo content unless something removes it. */
export function unownedSlots({ plan, kit, owners }) {
  const blocks = new Map(arr(kit?.blocks).map((b) => [b?.id, b]))
  const seen = new Set()
  const out = []
  for (const { block } of keptBlocks(plan)) {
    const b = blocks.get(block)
    const slots = [
      ...arr(b?.slots),
      ...arr(b?.lists).flatMap((l) => [...arr(l?.rowSlots), ...arr(l?.rows).flatMap((r) => arr(r?.slots))])
    ]
    for (const s of slots) {
      if (typeof s?.id !== 'string' || owners.has(s.id) || seen.has(s.id)) continue
      seen.add(s.id)
      out.push({ slot: s.id, block, type: s.type ?? null })
    }
  }
  return out
}
