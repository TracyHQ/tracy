// Record roles (spec TracyHQ/tracy#189, item 18): the slots whose words are a record of the brief, never page copy. A
// guest review's words, its author and its source, a video link, a contact line, a statistic's value and a person's
// name are copied from the brief's records as they are; no writer composes them, and a cleanup turn never fills one
// with the business's own name. A record slot with no record is taken off by the door that owns its kind (the honesty
// plan for quotes and people, the statistics plan, the contact and video steps).

/** The roles whose value is a record of the brief. The one list every planner, writer and check reads. */
export const RECORD_ROLES = Object.freeze([
  'quote.text',
  'quote.author_name',
  'quote.author_context',
  'quote.rating_or_source',
  'business.video',
  'contact.phone',
  'contact.email',
  'contact.social_url',
  'stat.value',
  'person.name'
])

const RECORD_ROLE_SET = new Set(RECORD_ROLES)

/** @param {unknown} role */
export function isRecordRole(role) {
  return typeof role === 'string' && RECORD_ROLE_SET.has(role)
}

const nonempty = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The record each record-role slot of a site plan carries, by slot key: the honesty plan's value (a review, its author,
 * a person's name) or the slot's own value decision (a contact fact).
 * @param {{slots?: any[], honesty?: {values?: Record<string, {value?: string}>}} | null | undefined} sitePlan
 * @returns {Record<string, string>}
 */
export function recordValuesOf(sitePlan) {
  /** @type {Record<string, string>} */
  const out = {}
  const values = sitePlan?.honesty?.values ?? {}
  for (const slot of sitePlan?.slots ?? []) {
    if (!isRecordRole(slot?.role)) continue
    const planned = values[slot.key]?.value
    if (nonempty(planned)) out[slot.key] = planned
    else if (slot.decision === 'value' && nonempty(slot.value)) out[slot.key] = slot.value
  }
  return out
}
