import { neutralFor } from './neutral-copy.mjs'

// What a demo puts where the research holds nothing true, and what the hand-off asks of each section of a template's page.
//
// 🔒 A DEMO REPLACES, NEVER REMOVES (product owner, 22/10/2026). Hiding what had no source emptied the template: the menu
// tabs, the dish items, the testimonials and the specials went, and the page looked broken. Every section and every item
// of the template stays; a field with no sourced value is empty or holds an approved neutral word, never an invented fact.

/**
 * 🔒 NO FILLER STANDS IN FOR A FACT (plan §7, 26/10/2026): "Coming soon", "Chef's selection", "Seasonal special", "House
 * favourite" and "Market price" (`neutral-copy/forbidden.json`) are never written where nothing was collected. An item's
 * name takes the approved neutral word of its kind in the site's language (`neutral-copy.mjs`); every other field with no
 * source is left empty.
 * @param {{kind?: string, locale?: string}} [input] `kind`: `dish`, `service` or `product` (`place-content-roles.mjs`)
 */
export function neutralItemName({ kind = 'dish', locale = 'en' } = {}) {
  return neutralFor({ role: 'offering.name', kind, locale }).text
}

/**
 * What a template slot takes when the research holds nothing for it, read from its key's field
 * (`homepage.menu.dish-price.3`): a dish's name is its neutral item name; a price, a description, a badge, a body and an
 * item's own title (`title.3`: a testimonial's name, a weekly special) are empty. A section's heading, a picture or a link
 * answers null: the brief's words or the place's pictures go there instead.
 * @param {string} key
 * @param {{kind?: string, locale?: string}} [input]
 * @returns {string | null}
 */
export function placeholderFor(key, { kind = 'dish', locale = 'en' } = {}) {
  const field = String(key).split('.').slice(2).join('.') || String(key)
  if (/dish-name/.test(field)) return neutralItemName({ kind, locale })
  if (/dish-desc|extra-class|badge|price/.test(field)) return ''
  // An item's own title (a weekly special, a testimonial's name) is a fact of the demo; a section's heading is not.
  if (/(title|heading|name)\.\d+$/.test(field)) return ''
  if (/title|heading|image|img|bg|url|href|link|icon/.test(field)) return null
  if (/description|desc|text|intro|quote|review|testimonial|body/.test(field)) return ''
  return null
}

// 🔒 The `sections` actions come from a hand-written map (`slot-roles/<cms>.json`). Like the role maps next to it
// (`contract-copy-pins.mjs`, `handMapApplies`), a template's entry goes when its current contract gains content-map
// roles (ADR 0038, #1805); until then `readSlotRoles` returns it and nothing else reads the file.

/**
 * What the hand-off asks of a section, by the action a template's map gives it (`slot-roles/<cms>.json` `sections`). No
 * action takes a section off.
 */
export const SECTION_ACTIONS = Object.freeze({
  fill: "the brief's words and the restaurant's own pictures in its blocks",
  dishes: `the brief's dishes first, then every other dish item kept with a food picture of the restaurant, "${neutralItemName()}" as its name and its picture's alt text, and its description, badge and price left empty; a collected price as it is, never the demo's`,
  posts:
    "the restaurant's posts the build wrote; with none, keep the heading and leave its body empty — never a demo post",
  pictures: "the restaurant's own pictures in every picture of it",
  reviews:
    'real collected Google reviews per the reviews rule; with none, its text left empty, with a link to the place on Google Maps when the brief has it',
  booking: 'the third-party widget becomes a "Book a table" button to this site\'s Contact page',
  invite:
    "the newsletter form becomes an invitation to book or get in touch, with a button to this site's Contact page",
  facts:
    'real numbers only (Google rating, review count, year opened when the brief holds them); a number with no source becomes another true fact of the brief or "N/A", its label left empty',
  team: "the restaurant's own kitchen or interior pictures (never the demo's people), the heading kept, names and roles left empty",
  offers:
    "real offers of the brief, each one once on a page; with none, the restaurant's pictures and its text left empty",
  keep: "keep it; replace the demo's words with the brief's, or leave them empty where nothing is known, the demo's pictures with the restaurant's"
})

/**
 * The action of one section of a template's page, by its name (`<page>/<section>` first, for a section one page uses its
 * own way): a section the map does not list is kept and replaced.
 */
export function sectionAction(sections, name, page = null) {
  const action = (page && sections?.[`${page}/${name}`]) || sections?.[name]
  return action && SECTION_ACTIONS[action] ? action : 'keep'
}
