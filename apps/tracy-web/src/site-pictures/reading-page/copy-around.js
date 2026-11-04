// "Copy around this picture" (#341): for one frame, the text the site writer decided for the block the picture sits in
// (the plan's block copy, then the copy of its list items, then the labels of its links, in plan order), the text of
// the same card or row when the picture sits in a list item (then the other cards' text is not shown), the
// picture's own alt, and the block's role as the plan states it. Pure: a model frame and a copy view (readCopy) in, a
// plain object out. Nothing is judged and nothing is invented: a slot the writer left empty says so.
const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

// "the hero heading, the club claim" -> "the hero heading": the label is what comes before the first dash or comma.
const labelOf = (says) =>
  String(says ?? '')
    .split(/\s[—–-]\s|,/)[0]
    .trim()

// The label slot of each link not already listed: "link label (leads to page-x)".
function linkLabels(links, skip, text) {
  const out = []
  for (const l of arr(links)) {
    if (!isObject(l) || typeof l.labelSlot !== 'string' || skip.has(l.labelSlot)) continue
    if (out.some((e) => e.slot === l.labelSlot)) continue
    const to = typeof l.leadsTo === 'string' ? ` (leads to ${l.leadsTo})` : ''
    out.push({ slot: l.labelSlot, label: `link label${to}`, items: text.get(l.labelSlot) ?? null })
  }
  return out
}

/**
 * @param {{ frame: string, block: string | null, blockPlan?: object | null, item?: object | null }} f a model frame
 * @param {{ slots: { slot: string, items: string[] }[], alts: { frame: string, text: string }[] }} view
 * @returns {null | { block: string | null, role: string | null, message: string | null, blockText: object[], card: null | { about: string | null, text: object[] }, alt: string | null }}
 */
export function copyAround(f, view) {
  const text = new Map(view.slots.map((s) => [s.slot, s.items]))
  const entries = (list, skip = new Set()) =>
    arr(list)
      .filter((c) => isObject(c) && typeof c.slot === 'string' && !skip.has(c.slot))
      .map((c) => ({ slot: c.slot, label: labelOf(c.says) || c.slot, items: text.get(c.slot) ?? null }))
  const plan = f.blockPlan
  const blockText = entries(plan?.copy)
  const own = new Set(blockText.map((e) => e.slot))
  const card = f.item
    ? {
        about: typeof f.item.about === 'string' ? f.item.about : null,
        text: [...entries(f.item.copy, own), ...linkLabels(f.item.links, own, text)]
      }
    : null
  for (const e of card?.text ?? []) own.add(e.slot)
  // A picture of the block itself sits with every list item's copy (a band's heading and notice live in a one-row
  // list); a card's picture sits with its own card, not with the other cards. Then the link labels.
  const items = f.item ? [] : arr(plan?.lists).flatMap((l) => arr(l?.items))
  for (const pick of [(i) => entries(i?.copy, own), (i) => linkLabels(i?.links, own, text)])
    for (const item of items) {
      const more = pick(item)
      for (const e of more) own.add(e.slot)
      blockText.push(...more)
    }
  blockText.push(...linkLabels(plan?.links, own, text))
  const alt = view.alts.find((a) => a.frame === f.frame)?.text ?? null
  if (!plan && !alt) return null
  return {
    block: f.block,
    role: typeof plan?.why === 'string' ? plan.why : null,
    message: typeof plan?.message === 'string' ? plan.message : null,
    blockText,
    card,
    alt
  }
}
