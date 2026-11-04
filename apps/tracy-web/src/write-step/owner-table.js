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
 * The frames that follow a hidden one: a frame with `twinOf` is the light or dark copy of the frame it names, never described or
 * hidden on its own (the planner prompt), so it leaves with that frame. Followed through chains, though no kit has one today.
 * @returns {Map<string, string>} twin frame id to the hidden frame it follows
 */
export function hiddenTwins(kit, hides) {
  const twinsOf = new Map()
  for (const f of arr(kit?.blocks).flatMap((b) => arr(b?.frames)))
    if (typeof f?.id === 'string' && typeof f.twinOf === 'string')
      twinsOf.set(f.twinOf, [...(twinsOf.get(f.twinOf) ?? []), f.id])
  const out = new Map()
  const queue = [...hides].filter((slot) => typeof slot === 'string')
  while (queue.length) {
    const slot = queue.shift()
    for (const twin of twinsOf.get(slot) ?? [])
      if (!hides.has(twin) && !out.has(twin)) {
        out.set(twin, slot)
        queue.push(twin)
      }
  }
  return out
}

/**
 * The plan's claims: link targets and hide decisions. `hidden` is the copy check's reading of the plan (a slot the plan
 * also fills elsewhere is not hidden), and the main menu items to hide are hide decisions as well. A target the plan gives
 * a link wins over a hide the plan gives it elsewhere, as a filled slot does. Within one block it does not: a plan lists every
 * link a block has, so a link the same block hides, or one on a row of `rowsGone` (hide-rows.js), is that row's to lose.
 * A frame whose `twinOf` names a hidden frame is hidden with it, as the plan's claim `via: 'twin'` (`hiddenTwins`).
 */
export function planClaims(
  { plan, kit = null, hidden, menuHide, filled = new Set(), rowsGone = new Set() },
  file
) {
  const claims = []
  const linked = new Set()
  const leaving = new Set()
  for (const d of keptBlocks(plan)) {
    const hiddenHere = new Set(arr(d.hiddenSlots).map((h) => h?.slot))
    for (const l of arr(d.links))
      if (isObject(l) && typeof l.link === 'string') {
        if (hiddenHere.has(l.link) || rowsGone.has(l.link)) {
          leaving.add(l.link)
          continue
        }
        linked.add(l.link)
        claims.push({
          slot: l.link,
          owner: 'plan',
          file,
          kind: 'link',
          content: String(l.leadsTo ?? ''),
          ...(typeof l.labelSlot === 'string' ? { label: l.labelSlot } : {})
        })
      }
  }
  // A main menu item the plan takes out of the dropdown can share its label slot with a link a kept page shows. The
  // plan fills that slot, so the words stay; leaving the dropdown is a page frame order, not a claim on the slot.
  const menuHides = arr(menuHide)
    .map((m) => m?.slot)
    .filter((slot) => !filled.has(slot))
  const hides = new Set([...hidden, ...menuHides, ...leaving])
  for (const slot of hides)
    if (typeof slot === 'string' && !linked.has(slot))
      claims.push({ slot, owner: 'plan', file, kind: 'hide', content: '(hide)' })
  // Only a twin on a kept block: one on a block the plan drops leaves with its block.
  const kept = new Set(keptBlocks(plan).map((d) => d.block))
  const blockOf = new Map(arr(kit?.blocks).flatMap((b) => arr(b?.frames).map((f) => [f?.id, b?.id])))
  for (const [slot, follows] of hiddenTwins(kit, hides))
    if (kept.has(blockOf.get(slot)) && !linked.has(slot) && !filled.has(slot))
      claims.push({
        slot,
        owner: 'plan',
        file,
        kind: 'hide',
        content: '(hide)',
        via: 'twin',
        twinOf: follows,
        why: `the plan hides ${follows}, and this frame is its twin in the other theme`
      })
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
