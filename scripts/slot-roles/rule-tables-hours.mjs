/**
 * An hours or schedule sample is a fact about the business, whatever the block is called: "Mon to Fri, 9 AM to 5 PM",
 * "Mon. Tue. Sun 12 Noon to 11 PM". It takes the role of the card it sits in (same block, same section), or
 * `contact.hours` when it sits in none. A long paragraph that merely mentions a day and a time is prose, not an hours line.
 */

const DAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b\.?/i
const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b|\b(?:\d{1,2}\s)?(?:noon|midnight)\b/i
/** Longest sample (markup and notation stripped) still read as an hours line. */
const MAX_HOURS_CHARS = 80

/** Whether the sample reads as an hours or schedule line. */
export function isHoursSample(sample) {
  if (typeof sample !== 'string') return false
  const plain = sample
    .replace(/\(\(\/?[a-z][^)]*\)\)/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 0 && plain.length <= MAX_HOURS_CHARS && DAY.test(plain) && TIME.test(plain)
}

const ROLE_BY_GROUP_KIND = Object.freeze({
  event: 'event.date_or_year',
  menu_item: 'offering.schedule',
  service: 'offering.schedule',
  package: 'offering.schedule',
  contact: 'contact.hours'
})

/**
 * Place the hours-shaped text slots still without a role. A sibling is a slot of the same page and section (and the same item number of a repeat). Changes the slots in place; returns how many it placed.
 * @param {any[]} open slots with no role yet
 * @param {any[]} slots every slot of the map
 */
export function placeHoursSamples(open, slots) {
  let placed = 0
  for (const slot of open) {
    if (slot.role !== undefined || slot.type !== 'text' || !isHoursSample(slot.sample)) continue
    const cardOf = (key) => {
      const parts = String(key).split('.')
      return `${parts.slice(0, 2).join('.')}#${parts.length === 4 ? parts[3] : ''}`
    }
    const card = cardOf(slot.key)
    const sibling = slots.find((s) => s !== slot && s.group?.id && cardOf(s.key) === card)
    const role = sibling ? ROLE_BY_GROUP_KIND[sibling.group.kind] : undefined
    if (role) {
      slot.role = role
      slot.group = { ...sibling.group }
    } else {
      slot.role = 'contact.hours'
      slot.group = {
        id: `${String(slot.key).split('.').slice(0, 2).join('.')}.hours.0`,
        item: 0,
        kind: 'contact'
      }
    }
    placed++
  }
  return placed
}
