// After the model, before the checker: a link of a kept block that the decision neither keeps nor hides (R10b) is decided by
// code where only one answer stands, as the planner would give it:
// - a control that acts inside its block with no words and no address (a gallery photo that opens itself in a lightbox:
//   `page-control`, an `image-file` icon, no label, no target) is hidden; the write step keeps it as the control it is, and
//   its picture is its frame's;
// - a link whose kit target is a page the plan keeps, and whose label slot is none or one the plan writes, is kept
//   leading to that page, with the kit's label slot (R10b holds `labelSlot` to the kit's).
// Any other undecided link (its page dropped, its label undecided, an outside address) stays with the planner.
//
// Dev lat29 and lat30 (23/11/2026): JA Boxing's plan round 0 left 17 to 80 links undecided (R10b), the header's menu links and
// the gallery controls among them, and its fix round took one to six minutes. Navigation blocks are the menus' (their items are
// decided through mainMenu and footerMenu), as R10b reads them. Returns the same plan when nothing changed.
import { indexKit } from './plan-check/kit-index.js'
import { decisionParts } from './plan-check/plan-index.js'

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')

/** The kit link's control kind that carries nothing of its own: a picture opening itself in place. */
const isOwnPicture = (link) =>
  link?.action === 'page-control' &&
  link.icon?.mechanism === 'image-file' &&
  !link.label &&
  !link.target &&
  !link.opens

/**
 * @param {any} plan
 * @param {any} kit
 */
export function withUndecidedLinksSettled(plan, kit) {
  if (!plan || typeof plan !== 'object' || !kit || typeof kit !== 'object') return plan
  const { blockIx, navGroups, linkLabelSlot } = indexKit(kit)
  const navBlocks = new Set([...navGroups.values()].map((g) => g?.block))
  const kept = new Set(
    each(plan.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const pageByPath = new Map(each(kit.pages).map((p) => [slashless(p?.path), p?.id]))
  // Every slot a decision writes: a label the plan gives words (a hidden label would leave a button with no words).
  const decided = new Set()
  const decisions = [
    ...each(plan.sharedBlocks),
    ...each(plan.pages)
      .filter((p) => p?.decision === 'keep')
      .flatMap((p) => each(p.blocks))
  ].filter((d) => d && typeof d === 'object')
  for (const d of decisions) {
    const parts = decisionParts(d)
    const hidden = new Set(parts.hidden.map((h) => h.slot))
    for (const c of parts.copy) if (!hidden.has(c.slot)) decided.add(c.slot)
  }
  let changed = false
  const fix = (decision) => {
    if (!decision || typeof decision !== 'object' || decision.decision !== 'keep') return decision
    if (navBlocks.has(decision.block)) return decision
    const block = blockIx.get(decision.block)
    if (!block) return decision
    const parts = decisionParts(decision)
    const done = new Set([...parts.links.map((l) => l.link), ...parts.hidden.map((h) => h.slot)])
    const links = []
    const hidden = []
    for (const [id, link] of block.links) {
      if (done.has(id)) continue
      if (isOwnPicture(link)) {
        hidden.push({ slot: id, why: 'an in-page control with no words: its picture opens itself in place' })
        continue
      }
      const page = link?.target ? pageByPath.get(slashless(link.target)) : null
      const label = linkLabelSlot.get(id) ?? null
      if (!page || !kept.has(page) || (label && !decided.has(label))) continue
      links.push({ link: id, leadsTo: page, labelSlot: label })
    }
    if (!links.length && !hidden.length) return decision
    changed = true
    return {
      ...decision,
      ...(links.length ? { links: [...each(decision.links), ...links] } : {}),
      ...(hidden.length ? { hiddenSlots: [...each(decision.hiddenSlots), ...hidden] } : {})
    }
  }
  const sharedBlocks = each(plan.sharedBlocks).map(fix)
  const pages = each(plan.pages).map((p) =>
    p?.decision === 'keep' && Array.isArray(p.blocks) ? { ...p, blocks: p.blocks.map(fix) } : p
  )
  if (!changed) return plan
  return { ...plan, ...(Array.isArray(plan.sharedBlocks) ? { sharedBlocks } : {}), pages }
}

/**
 * A card's link that opens its own item (`go-to-item`: a listing card's title or button, whose kit target is the item's own
 * page) leads there: the template prints the item's address in the card, and the write step has no door to move it. A plan
 * that sends it elsewhere is corrected to the item's page when the plan keeps that page; a dropped item's card stays with
 * the planner. Dev lat29 and lat30 (23/11/2026): JA Boxing's plan sent the advanced class card to the beginner page, and the
 * write step refused the link ("it keeps opening /classes/advanced-boxing"), eleven refused lines at lat30.
 * @param {any} plan
 * @param {any} kit
 */
export function withItemLinksToTheirItems(plan, kit) {
  if (!plan || typeof plan !== 'object' || !kit || typeof kit !== 'object') return plan
  const { linkIx } = indexKit(kit)
  const kept = new Set(
    each(plan.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const pageByPath = new Map(each(kit.pages).map((p) => [slashless(p?.path), p?.id]))
  let changed = false
  const fix = (decision) => {
    if (!decision || typeof decision !== 'object' || !Array.isArray(decision.links)) return decision
    let moved = false
    const links = decision.links.map((l) => {
      const kitLink = linkIx.get(l?.link)
      if (kitLink?.action !== 'go-to-item' || !kitLink.target) return l
      const own = pageByPath.get(slashless(kitLink.target))
      if (!own || !kept.has(own) || l.leadsTo === own || !kept.has(l.leadsTo)) return l
      moved = true
      return { ...l, leadsTo: own }
    })
    if (!moved) return decision
    changed = true
    return { ...decision, links }
  }
  const sharedBlocks = each(plan.sharedBlocks).map(fix)
  const pages = each(plan.pages).map((p) =>
    p?.decision === 'keep' && Array.isArray(p.blocks) ? { ...p, blocks: p.blocks.map(fix) } : p
  )
  if (!changed) return plan
  return { ...plan, ...(Array.isArray(plan.sharedBlocks) ? { sharedBlocks } : {}), pages }
}

/**
 * A kept link's `labelSlot` is the kit's (R10b holds it to the kit's label slot of that link): a link entry that names none, or
 * another slot, takes the kit's. There is one answer, and the planner's slip costs a fix round. Dev lat31b (23/11/2026):
 * JA Boxing's header links named no label slot though the kit ties them to the masthead's titles.
 * @param {any} plan
 * @param {any} kit
 */
export function withKitLabelSlots(plan, kit) {
  if (!plan || typeof plan !== 'object' || !kit || typeof kit !== 'object') return plan
  const { linkLabelSlot, linkIx } = indexKit(kit)
  let changed = false
  const fix = (decision) => {
    if (!decision || typeof decision !== 'object' || !Array.isArray(decision.links)) return decision
    let moved = false
    const links = decision.links.map((l) => {
      if (!l || typeof l !== 'object' || !linkIx.has(l.link)) return l
      const want = linkLabelSlot.get(l.link) ?? null
      if ((l.labelSlot ?? null) === want && 'labelSlot' in l) return l
      moved = true
      return { ...l, labelSlot: want }
    })
    if (!moved) return decision
    changed = true
    return { ...decision, links }
  }
  const sharedBlocks = each(plan.sharedBlocks).map(fix)
  const pages = each(plan.pages).map((p) =>
    p?.decision === 'keep' && Array.isArray(p.blocks) ? { ...p, blocks: p.blocks.map(fix) } : p
  )
  if (!changed) return plan
  return { ...plan, ...(Array.isArray(plan.sharedBlocks) ? { sharedBlocks } : {}), pages }
}
