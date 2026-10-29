// Icons and cut-outs follow the business's subject (spec TracyHQ/tracy#189, ticket #195). Template readiness labels each
// decorative picture slot as pure design or as carrying the demo's subject (`decorOf`); the plan then gives every
// subject-carrying icon an icon of the business's own offering, and every cut-out figure a cut-out drawn from the owner's
// photos, or clears it. Pure design (lines, colour blocks, patterns) stays as the template drew it. Pure and
// deterministic: no model, no site; the engine renders the icons and draws the cut-outs.
//
// 🔒 THE LABEL COMES FROM THE SLOT, NEVER FROM A NAME OF ONE TEMPLATE: a declared `decor` on the slot ("subject" or
// "design") wins; else an item icon (role `editorial.item_icon`) stands beside an item's words and so carries its
// subject, and a cut-out (Slot fit kind `cutout`) is a figure of the demo's activity. Released content maps are never
// edited (their hash is bound on every site), so the label is derived for them.
// 🔒 AN ICON IS CHOSEN BY MEANING: the words the build writes for its item (the copy pins), else the offering of the page
// it sits on, else the brief's offerings in item order. A word of the demo is never read, so the demo's subject cannot
// choose the new icon. Nothing matches: a neutral mark (a check), never the demo's icon.
// 🔒 A CUT-OUT NEVER SHOWS A DRAWN FACE: it is an object of the activity drawn from the owner's photos on a clear ground,
// checked like every drawing; with no photo to draw from, or no picture model, the figure is cleared (a transparent
// picture of its size), so the hero shows the design without the demo's figure.
import { closedListOf, namedIn } from './pictures/picture-links.mjs'
import { fileOf, foldWords } from './pictures/slot-map.mjs'

export const DECOR_PLAN_VERSION = 'decor-plan/1'

/** Every reason code a decor decision carries, with the sentence a report shows for it. */
export const DECOR_REASONS = Object.freeze({
  'icon-of-item': 'an icon matching the words written for this item',
  'icon-of-page-offering': 'an icon of the offering this page is about',
  'icon-of-offering': "an icon of one of the business's offerings",
  'icon-neutral': 'no icon matches the business, so a neutral mark stands in its place',
  'cut-out-drawn': "an object of the business's activity, drawn from the owner's photos on a clear ground",
  'cut-out-cleared': 'no photo to draw a cut-out from, so the figure is cleared and the design stays',
  'design-kept': 'a pure design piece of the template, kept as drawn'
})

/** The longest piece of the brief's words an `asked` sentence quotes. */
const ASKED_QUOTE = 160

/**
 * The words a decor decision hands the site with its write (`replace_kept`, Claude Cowork for Joomla): a template marks
 * its icons and figures as pictures it keeps (Slot fit `replace: "keep"`), and the site takes a new one only with the
 * words that ask for it. A brief build asks for the business's own site, and these words say which part of the brief
 * chose the new picture (`quote`), or that none did and the demo's picture is only taken off.
 * @param {'icon' | 'cut-out'} action
 * @param {string | null} quote - the brief's words that chose the picture
 */
export function decorAsked(action, quote) {
  const thing = action === 'icon' ? 'icon' : 'figure'
  const words = typeof quote === 'string' ? quote.replace(/\s+/g, ' ').trim().slice(0, ASKED_QUOTE) : ''
  return words
    ? `The owner's brief asks for a site of its own: this ${thing} shows "${words}" in place of the template demo's ${thing}.`
    : `The owner's brief asks for a site of its own: the template demo's ${thing} shows another business, so it is replaced.`
}

/** The neutral mark an icon takes when nothing matches. */
export const NEUTRAL_GLYPH = 'check'

/** Meaning → glyph: the words that call each glyph of the icon set (`apps/tracy-web/src/lib/icon-glyphs.js`). */
export const ICON_LEXICON = Object.freeze([
  ['racquet', ['tennis', 'padel', 'squash', 'badminton', 'racquet', 'racket', 'pickleball']],
  ['ball', ['ball', 'football', 'soccer', 'basketball', 'volleyball', 'golf']],
  ['waves', ['swim', 'swimming', 'pool', 'aqua', 'water', 'surf', 'diving', 'beach']],
  ['dumbbell', ['fitness', 'gym', 'strength', 'workout', 'training', 'weights', 'crossfit', 'bootcamp']],
  ['lotus', ['yoga', 'pilates', 'meditation', 'stretch', 'stretching', 'mindfulness']],
  ['spa', ['spa', 'massage', 'wellness', 'relax', 'sauna', 'facial']],
  ['tooth', ['dental', 'dentist', 'teeth', 'tooth', 'orthodontic', 'whitening', 'implant']],
  ['scissors', ['hair', 'haircut', 'barber', 'salon', 'cut', 'styling', 'trim']],
  ['cake', ['cake', 'cakes', 'bakery', 'pastry', 'pastries', 'dessert', 'bread', 'baking']],
  ['cup', ['coffee', 'tea', 'cafe', 'espresso', 'drinks', 'juice']],
  [
    'utensils',
    ['food', 'meal', 'meals', 'restaurant', 'dinner', 'lunch', 'breakfast', 'menu', 'kitchen', 'catering']
  ],
  ['heart', ['care', 'health', 'medical', 'clinic', 'therapy', 'physio', 'physiotherapy', 'nursing']],
  ['calendar', ['booking', 'schedule', 'appointment', 'appointments', 'reservation', 'events', 'event']],
  [
    'book',
    ['lesson', 'lessons', 'course', 'courses', 'class', 'classes', 'school', 'tutoring', 'learn', 'academy']
  ],
  ['house', ['home', 'house', 'property', 'apartment', 'realty', 'rental', 'cleaning']],
  ['wrench', ['repair', 'repairs', 'fix', 'plumbing', 'maintenance', 'installation', 'mechanic', 'garage']],
  ['car', ['car', 'cars', 'auto', 'driving', 'taxi', 'transport', 'delivery']],
  ['paw', ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'vet', 'veterinary', 'grooming']],
  ['leaf', ['garden', 'gardening', 'organic', 'plant', 'plants', 'nature', 'landscaping', 'florist']],
  ['music', ['music', 'dance', 'dancing', 'singing', 'piano', 'guitar']],
  ['camera', ['photo', 'photography', 'video', 'studio', 'film']],
  ['shield', ['security', 'insurance', 'safety', 'protection', 'legal']],
  ['star', ['premium', 'award', 'quality', 'vip', 'membership', 'members']],
  ['people', ['kids', 'children', 'family', 'group', 'team', 'community', 'junior', 'juniors']]
])

/** The glyph whose words a text holds first (in the text's own order), or null. */
export function glyphOf(text) {
  for (const word of foldWords(text)) {
    const hit = ICON_LEXICON.find(([, words]) => words.includes(word))
    if (hit) return hit[0]
  }
  return null
}

/**
 * The template readiness label of a picture slot: `icon` and `cut-out` carry the demo's subject and are replaced,
 * `design` is pure design and stays, null for every other picture (a photo the fill plan decides).
 * @param {{type?: string, role?: string, decor?: string, fit?: {kind?: string}}} slot
 * @returns {'icon' | 'cut-out' | 'design' | null}
 */
export function decorOf(slot) {
  if (slot?.type !== 'image') return null
  const kind = slot.fit?.kind
  const shape = kind === 'cutout' ? 'cut-out' : 'icon'
  if (slot.decor === 'design') return 'design'
  if (slot.decor === 'subject') return shape
  if (slot.role === 'editorial.item_icon') return 'icon'
  if (
    kind === 'cutout' &&
    !String(slot.role).startsWith('person.') &&
    !String(slot.role).startsWith('quote.')
  )
    return 'cut-out'
  if (['editorial.design_element', 'editorial.decorative_image'].includes(slot.role) || kind === 'decoration')
    return 'design'
  return null
}

/** The text slots that speak for an icon: its group's, else those after it in its entity up to the next picture. */
function wordsOfItem(slot, slots, at) {
  if (slot.group?.id) return slots.filter((s) => s.type === 'text' && s.group?.id === slot.group.id)
  const out = []
  for (let i = at + 1; i < slots.length && slots[i].entity === slot.entity; i += 1) {
    if (slots[i].type === 'image') {
      if (out.length) break
      continue
    }
    if (slots[i].type === 'text') out.push(slots[i])
  }
  return out
}

/**
 * @param {object} input
 * @param {{slots: any[]}} input.contentMap - the whole map, the slots a profile only declares included
 * @param {{reading?: any, assets?: any[]}} input.brief
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} [input.copy] - the words the build
 *   writes, by slot key (`copyPinsOf`)
 * @param {Array<{groupId: string, offeringId: string, label: string}>} [input.offerings] - the fill plan's card offerings
 * @param {boolean} [input.canDraw] - whether the build can draw (a picture model is set)
 * @returns {{version: string, slots: Array<{key: string, file: string, decor: string, action: 'icon' | 'cut-out' |
 *   'keep', reason: string, glyph?: string, mode?: 'object' | 'clear', subject?: any, referenceIds?: string[],
 *   asked?: string}>}}
 */
export function planDecor({ contentMap, brief, copy = null, offerings = [], canDraw = false }) {
  const slots = contentMap?.slots ?? []
  const list = closedListOf(brief?.reading).offerings
  const pageOffering = new Map()
  for (const o of offerings) {
    const entity = slots.find((s) => s.group?.id === o.groupId)?.entity
    if (entity && !pageOffering.has(entity)) pageOffering.set(entity, o)
  }
  // An entity whose own words name one offering (an offering's page) speaks for that offering.
  for (const s of slots) {
    const words = copy?.pins?.[s.key]
    if (pageOffering.has(s.entity) || typeof words !== 'string' || copy?.sources?.[s.key] === 'placeholder')
      continue
    if (!['offering.name', 'article.title', 'claim.heading'].includes(s.role)) continue
    const hit = namedIn(words, list)
    if (hit) pageOffering.set(s.entity, { offeringId: hit.id, label: hit.label })
  }
  const references = (brief?.assets ?? [])
    .filter((a) => a?.kind === 'image' && a.id && a.isGraphic !== true && a.isLogo !== true)
    .filter((a) => !(a.portraitOf?.id ?? a.portraitOf))
    .map((a) => a.id)
    .sort()
  const out = []
  slots.forEach((slot, at) => {
    const decor = decorOf(slot)
    if (!decor) return
    const file = fileOf(slot.sample)
    if (decor === 'design') {
      out.push({ key: slot.key, file, decor, action: 'keep', reason: 'design-kept' })
      return
    }
    if (decor === 'icon') {
      const written = wordsOfItem(slot, slots, at)
        .filter((s) => copy?.sources?.[s.key] !== 'placeholder')
        .map((s) => copy?.pins?.[s.key])
        .filter((w) => typeof w === 'string' && w.trim())
        .join(' ')
      const item = written ? (glyphOf(written) ?? glyphOf(namedIn(written, list)?.label ?? '')) : null
      const page = pageOffering.get(slot.entity)
      const ofPage = !item && page ? glyphOf(page.label) : null
      const n = Number.isInteger(slot.group?.item) ? slot.group.item : null
      const ofList =
        !item && !ofPage && n !== null && list.length ? glyphOf(list[n % list.length].label) : null
      const glyph = item ?? ofPage ?? ofList ?? NEUTRAL_GLYPH
      const quote = item ? written : ofPage ? page.label : ofList ? list[n % list.length].label : null
      const reason = item
        ? 'icon-of-item'
        : ofPage
          ? 'icon-of-page-offering'
          : ofList
            ? 'icon-of-offering'
            : 'icon-neutral'
      out.push({
        key: slot.key,
        file,
        decor,
        action: 'icon',
        reason,
        glyph,
        asked: decorAsked('icon', quote)
      })
      return
    }
    const main = pageOffering.get(slot.entity) ?? list[0] ?? null
    const subject = main
      ? { kind: 'offering', id: main.offeringId ?? main.id, label: main.label }
      : { kind: 'venue' }
    if (canDraw && references.length)
      out.push({
        key: slot.key,
        file,
        decor,
        action: 'cut-out',
        reason: 'cut-out-drawn',
        mode: 'object',
        subject,
        referenceIds: references.slice(0, 4),
        asked: decorAsked('cut-out', main?.label ?? null)
      })
    else
      out.push({
        key: slot.key,
        file,
        decor,
        action: 'cut-out',
        reason: 'cut-out-cleared',
        mode: 'clear',
        asked: decorAsked('cut-out', null)
      })
  })
  return { version: DECOR_PLAN_VERSION, slots: out }
}
