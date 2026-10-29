/** A card's excerpt belongs to the same offering as its title, whatever CMS or framework paints the list. */
export function declareOfferingSummaries(contentMap) {
  const slots = contentMap?.slots ?? []
  const names = slots.filter((s) => s.role === 'offering.name' && s.group?.id)
  for (const slot of slots) {
    if (slot.type !== 'text') continue
    const excerpt = ['introtext', 'post_excerpt', 'excerpt', 'summary'].includes(slot.column)
    const title = excerpt
      ? names.find((s) => s.entity === slot.entity && (!slot.group || s.group.id === slot.group.id))
      : names.find((s) => s.group.id === slot.group?.id)
    if (!title) continue
    // The body of a full offering page remains a description. A repeated card's short copy is a summary.
    const card =
      slot.role === 'offering.description' &&
      (Array.isArray(slot.jsonPath) || /\.\d+$/.test(slot.group?.id ?? ''))
    if (!excerpt && !card) continue
    slot.role = 'offering.summary'
    slot.group = { ...title.group }
  }
  return contentMap
}
