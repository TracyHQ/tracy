// What the content brief holds back from the site, on the plan card's left out list (#575, plan stage inputs). The
// needs profile carries it by field, code and count (`profile.heldBack`, `brief-held-back.mjs`), never a value. Each
// entry becomes one left out line with its code and count (`params.count`), so the card says it in the owner's
// language. Fields another line already reports are skipped: opening hours (`held-hours-left-out.mjs`), WhatsApp,
// other phones and the Google rating (`plan-composer-brief.mjs`). A fact the owner left off reads as the owner's
// choice (`owner_withheld`, the card's existing words). Pure.
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Fields reported by another left out line of the plan. */
const REPORTED_ELSEWHERE = new Set(['hours', 'whatsapp', 'otherPhones', 'googleRating'])
/** How a brief field is named on the plan. */
const FIELD_NAMES = Object.freeze({
  prices: 'Prices',
  offerings: 'Services',
  menu: 'Menu',
  'menu-link': 'Menu link',
  name: 'Business name',
  team: 'Team',
  socials: 'Social profiles',
  photos: 'Photos',
  posts: 'Posts',
  email: 'Email address',
  phone: 'Phone number',
  address: 'Address',
  about: 'About the business',
  reviews: 'Reviews'
})
/** The sentence of each code; one the card does not know is shown as this sentence. */
export const HELD_BACK_REASONS = Object.freeze({
  not_collected: 'None of the sources we read gives this, so your site does not show it yet.',
  sources_disagree: 'Your sources disagree on this, so it stays off your site until you confirm it.',
  kept_off_site: 'This stays off your site until you confirm it.',
  owner_withheld: 'You asked to keep this off the site.'
})
const FALLBACK_REASON = HELD_BACK_REASONS.kept_off_site

/**
 * The left out lines of what the brief holds back.
 * @param {object} profile the needs profile (`heldBack`: `{field, code, count}[]`)
 * @returns {Array<{what: string, kind: 'feature', reason: string, code: string, params: {count: number}}>}
 */
export function heldBackLeftOutOf(profile) {
  return list(profile?.heldBack)
    .filter((e) => isText(e?.field) && isText(e?.code) && !REPORTED_ELSEWHERE.has(e.field))
    .map((e) => {
      const code = e.code === 'owner_left_off' ? 'owner_withheld' : e.code
      const count = Number.isInteger(e.count) && e.count > 0 ? e.count : 1
      return {
        what:
          FIELD_NAMES[e.field] ?? e.field.charAt(0).toUpperCase() + e.field.slice(1).replace(/[-_]/g, ' '),
        kind: 'feature',
        reason: HELD_BACK_REASONS[code] ?? FALLBACK_REASON,
        code,
        params: { count }
      }
    })
}
