// A button whose words name booking or contact leads to the Contact page (spec TracyHQ/tracy#189, COO rule 30/10/2026).
//
// 🔒 THE WORDS SAY WHERE THE BUTTON GOES. Measured 30/10/2026 on a brief build: a section button the template links to its
// offerings list was worded "Book an appointment" by the copy writer, and led to the offerings list. A navigation button's
// words are free (`declared-button-plan.mjs` words it only from its destination page's title, when the map holds one), so the
// destination follows the words once they are written: a label that names booking or contact leads to the Contact page the
// site keeps, or, with none kept, to the brief's own channel (a call, WhatsApp). A label already leading to the Contact page
// or a channel keeps its link; a form's send button, a map button and a profile link are never moved.
// CMS-neutral: content-map slots (ADR 0040 roles and declared actions) and the site plan; each CMS writes the URL slot.
import { isButtonSlot } from './button-actions.mjs'
import { buttonUrlOf, contactDestination } from './declared-button-plan.mjs'

/** Words of a button that promise booking or reaching the business, in English (the brief's language). */
export const BOOKING_WORDS =
  /\b(?:book(?:ing|ings)?|appointments?|reserve|reservations?|schedule (?:a|an|your)|enquire|enquiry|inquire|inquiry|contact|get in touch|reach us|call us|message us|whatsapp)\b/i

/** Actions whose destination is not a page the label chooses. */
const FIXED_ACTIONS = new Set(['submit-form', 'open-map', 'external-profile'])

/** A link that already reaches the business: a channel, or a contact page. */
const CHANNEL = /^(?:tel:|mailto:|sms:|https?:\/\/(?:wa\.me|api\.whatsapp\.com|ig\.me|m\.me)\/)/i

const plain = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]*>|\[\[|\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const bare = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^index\.php\/?/i, '')
    .toLowerCase()

/** The Contact page the site plan keeps, as the content map links it; null when the plan drops it or the map has none. */
function keptContactOf(contentMap, sitePlan) {
  const kept = (sitePlan?.pages ?? []).find((p) => p?.role === 'contact' && p?.decision !== 'drop')
  if (!kept) return null
  const href = contactDestination(contentMap)
  if (!href) return null
  // The map's contact page must be the one the plan keeps (by route), when the plan names a path.
  const route = (contentMap?.pages ?? []).find((p) => {
    const id = /^menuItem-(\d+)$/.exec(String(p?.entity ?? ''))?.[1]
    return id ? href === `index.php?Itemid=${id}` : bare(p?.route ?? p?.path ?? p?.slug) === bare(href)
  })
  if (kept.path && route && bare(route.route ?? route.path ?? route.slug) !== bare(kept.path)) return null
  return href
}

/** The brief's own channel a booking button can lead to when the site keeps no Contact page: a call or a chat. */
function channelOf(sitePlan) {
  const primary = String(sitePlan?.primaryAction?.href ?? '').trim()
  if (CHANNEL.test(primary)) return primary
  const channels = Array.isArray(sitePlan?.channels) ? sitePlan.channels : []
  for (const kind of ['whatsapp', 'phone']) {
    const href = String(
      channels.find((c) => c?.kind === kind && CHANNEL.test(String(c?.href ?? '')))?.href ?? ''
    )
    if (href) return href
  }
  return null
}

/**
 * The URL a booking-worded button must take, by URL slot key: every button label of the content map whose written words name
 * booking or contact and whose link leads elsewhere. Empty when the site plan is missing (a demo build) or no destination
 * exists.
 * @param {{ words: Record<string, string>, contentMap: { slots?: any[], pages?: any[] } | null, sitePlan: any }} input
 *   `words`: the words each slot will hold once written (the writer's and the plan's)
 * @returns {Record<string, string>} URL slot key -> destination
 */
export function bookingButtonTargets({ words = {}, contentMap = null, sitePlan = null }) {
  if (!sitePlan || !contentMap) return {}
  const contact = keptContactOf(contentMap, sitePlan)
  const target = contact ?? channelOf(sitePlan)
  if (!target) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const slot of contentMap.slots ?? []) {
    if (slot?.type !== 'text' || !isButtonSlot(slot) || FIXED_ACTIONS.has(slot.action?.kind)) continue
    const label = plain(words[slot.key] ?? slot.sample)
    if (!label || !BOOKING_WORDS.test(label)) continue
    const url = buttonUrlOf(slot, contentMap)
    if (!url || url.key in out) continue
    const now = String(words[url.key] ?? url.sample ?? '').trim()
    if (CHANNEL.test(now) || (contact && bare(now) === bare(contact)) || /com_contact/i.test(now)) continue
    out[url.key] = target
  }
  return out
}
