// The owner table (ADR 0044, decision 3): for each content slot, the one file with the right to fill it. Each file says
// what it claims as a flat list of claims, and the table only compares claims, so a new owner (the picture manifest, the
// brand file) joins by adding a function that lists its claims, with nothing here changed.
//
// A claim is { slot, owner, file, kind, content }. Different content on one slot is a dispute, whichever files it came
// from; identical repeats are one owner reaching the slot twice and are not. A dispute is settled on its slot, never by
// stopping the run (ADR 0044, decision 3 as amended 2026-11-08).

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

// Who wins a disputed slot (ADR 0044 decisions 3 and 26, amended 2026-11-08): the plan first, then the brand, the pictures, and
// every other file in the order it claimed. A claim wins only when it fits the slot's kind in the kit.
const RANK = { plan: 0, brand: 1, picture: 2 }
const rankOf = (claim) => RANK[claim.owner] ?? 3
const TEXT_TYPES = new Set(['text', 'url'])
const IMAGE_KINDS = new Set(['image', 'painted'])

/** The kit's slot types and link ids, so a claim can be held to the slot it lands on. */
function slotKinds(kit) {
  const types = new Map()
  const links = new Set()
  for (const block of arr(kit?.blocks)) {
    for (const l of arr(block?.links)) if (typeof l?.id === 'string') links.add(l.id)
    const lists = arr(block?.lists)
    for (const s of [
      ...arr(block?.slots),
      ...lists.flatMap((l) => [...arr(l?.rowSlots), ...arr(l?.rows).flatMap((r) => arr(r?.slots))])
    ])
      if (typeof s?.id === 'string' && typeof s.type === 'string' && !types.has(s.id)) types.set(s.id, s.type)
  }
  return { types, links, known: Boolean(kit) }
}

/** Whether a claim fits its slot: a link needs a kit link, words a text or url slot, a picture an image slot. */
function fits(claim, kinds) {
  if (!kinds.known || claim.kind === 'hide') return true
  if (claim.kind === 'link') return kinds.links.has(claim.slot) || kinds.types.get(claim.slot) === 'url'
  const type = kinds.types.get(claim.slot)
  if (!type) return true
  if (claim.kind === 'text') return TEXT_TYPES.has(type)
  if (IMAGE_KINDS.has(claim.kind)) return type === 'image'
  return true
}

const said = ({ owner, file, kind, content }) => ({ owner, file, kind, content })

/**
 * The owner of every slot. A dispute (two claims with different content on one slot) never stops the run: it is settled on
 * that slot alone. The winner is the first claim, by RANK, that fits the slot's kind in the kit; every other claim loses and
 * is not written. When no claim fits, the slot has no owner, so the closing ladder empties it or reports its demo remains.
 * @param {object[]} claims
 * @param {{ kit?: object | null }} [options] the kit, to hold each claim to its slot's kind (without it every claim fits)
 * @returns {{ owners: Map<string, object>, disputes: { slot: string, claims: object[], settled: object | null, reason: string }[],
 *   losers: object[] }} `owners`: each slot's winning claim; `disputes`: each slot with different content, with one claim per
 *   content and how it was settled; `losers`: the claims that lost, as given, so their values are taken out of the write
 */
export function ownerTable(claims, { kit = null } = {}) {
  const bySlot = new Map()
  for (const claim of claims) {
    const list = bySlot.get(claim.slot) ?? []
    if (!list.some((c) => c.content === claim.content)) list.push(claim)
    bySlot.set(claim.slot, list)
  }
  const kinds = slotKinds(kit)
  const owners = new Map()
  const disputes = []
  const losers = []
  for (const [slot, list] of bySlot) {
    if (list.length === 1) {
      owners.set(slot, list[0])
      continue
    }
    const ranked = list
      .map((claim, at) => ({ claim, at }))
      .sort((a, b) => rankOf(a.claim) - rankOf(b.claim) || a.at - b.at)
    const winner = ranked.find(({ claim }) => fits(claim, kinds))?.claim ?? null
    if (winner) owners.set(slot, winner)
    const lost = claims.filter((c) => c.slot === slot && c.content !== winner?.content)
    losers.push(...lost)
    disputes.push({
      slot,
      claims: list.map(said),
      settled: winner ? said(winner) : null,
      reason: winner
        ? `${winner.file} (${winner.owner}) wins: ${winner.owner === 'plan' ? 'the plan comes first' : 'the first claim that fits the slot'}; ${list
            .filter((c) => c !== winner)
            .map((c) => `${c.file} (${c.owner})`)
            .join(', ')} not written`
        : 'no claim fits the slot, so it has no owner and the closing ladder takes it'
    })
  }
  return { owners, disputes, losers }
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
