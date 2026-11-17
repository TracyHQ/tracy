// What the owner can send after approval to make the site better (#575, plan stage restore of the step chain's
// `ownerTasks`, planner-prompt.md lines 114, 126 to 128, 294 to 296 and 347: "Where a visitor would notice a gap (no
// prices, no team), add an owner task instead of filling it ... plan every part as if no answer comes"). Built by code,
// never by the model: from what the brief says was not found (`missing`), the contact facts the plan lacks, the people
// without a photo and a logo Tracy drew. An entry is listed only when the template has a field the sent thing would
// fill: a gap the template cannot show is no promise. The plan is built as if nothing comes; each entry says what it
// opens. Pure.
import { LOGO_CODES } from './plan-wording-codes.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every later entry, by code: what the owner can send, the data kinds it fills, and what it opens. */
export const LATER = Object.freeze({
  later_prices: {
    what: 'Your prices',
    kinds: ['offering.price', 'package.price', 'menu_item.price'],
    reason: 'Send your prices and they can be shown with what you offer.'
  },
  later_services: {
    what: 'Your list of services',
    kinds: ['offering.name'],
    reason: 'Send the services you offer and each can have its own place on your site.'
  },
  later_menu: {
    what: 'Your menu',
    kinds: ['menu_item.name'],
    reason: 'Send your menu and your dishes can be shown on your site.'
  },
  later_hours: {
    what: 'Your opening hours',
    kinds: ['contact.hours'],
    reason: 'Confirm your opening hours and they can be shown on your site.'
  },
  later_email: {
    what: 'Your email address',
    kinds: ['contact.email'],
    reason: 'Send an email address and visitors can write to you, and a form can send its answers there.'
  },
  later_booking_link: {
    what: 'Your booking link',
    kinds: ['contact.cta_url'],
    reason: 'Send your booking link and your buttons can lead visitors straight to it.'
  },
  later_portraits: {
    what: 'Photos of your team',
    kinds: ['person.image'],
    reason: 'Send a photo of each person and it can be shown beside their name.'
  },
  later_logo: {
    what: 'Your logo file',
    kinds: ['business.logo'],
    reason: 'Send your logo file and it can be shown in place of the one your plan uses for now.'
  }
})
/** The brief's missing fields each later entry answers. */
const FROM_MISSING = Object.freeze({
  prices: 'later_prices',
  offerings: 'later_services',
  menu: 'later_menu',
  'menu-link': 'later_menu',
  hours: 'later_hours'
})

/**
 * The later list of a plan.
 * @param {{brief: object | null, data: object, blocks: Map<string, object>, look?: object}} input
 * @returns {Array<{what: string, reason: string, code: string, params?: object}>}
 */
export function laterOf({ brief, data, blocks, look }) {
  const kinds = new Set(
    [...blocks.values()].flatMap((b) =>
      [...list(b?.fields), ...list(b?.itemFields)].filter((f) => f?.type !== 'design').map((f) => f?.kind)
    )
  )
  const has = (kind) => data.facts.some((f) => f.kind === kind)
  const codes = new Map()
  const add = (code, params) => {
    if (!codes.has(code) && LATER[code].kinds.some((k) => kinds.has(k))) codes.set(code, params)
  }
  for (const entry of list(brief?.missing)) {
    const code = FROM_MISSING[entry?.field]
    // Hours the owner chose to leave off are no gap to fill.
    const leftOffByOwner =
      entry?.field === 'hours' &&
      list(brief?.facts).some((f) => f?.field === 'hours' && list(f.reasons).includes('owner-left-off'))
    if (code && !leftOffByOwner) add(code)
  }
  if (brief && !has('contact.email')) add('later_email')
  if (brief && !has('contact.cta_url')) add('later_booking_link')
  const faceless = data.items.filter(
    (i) => i.kind === 'person' && !data.byId.get(i.id)?.source?.fields?.['person.image']?.value
  ).length
  if (faceless) add('later_portraits', { count: faceless })
  if (look?.logo?.kind === 'text' || look?.logo?.code === LOGO_CODES.drawn) add('later_logo')
  return [...codes].map(([code, params]) => ({
    what: LATER[code].what,
    reason: LATER[code].reason,
    code,
    ...(params ? { params } : {})
  }))
}
