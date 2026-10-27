// Words the agent prompt uses for each trade (`trades.mjs` TRADES): the noun that names the place,
// its booking call to action, and what its offerings and pictures are called. A place with no trade
// (or `food`) keeps the restaurant wording word for word.
import { defaultOfferingKind } from './trades.mjs'

const entry = (fields) =>
  Object.freeze({
    bookingCta: fields.bookingAction[0].toUpperCase() + fields.bookingAction.slice(1),
    bookingNoun: fields.trade === 'food' ? 'reservation' : 'booking',
    widgetExample: fields.trade === 'food' ? 'a reservation widget such as OpenTable' : 'a booking widget',
    // The kind of an item with no source (`neutral-copy.mjs` `offering.name`): its neutral name.
    itemKind: defaultOfferingKind(fields.trade),
    // #1780: the list block's title, Google's "reservable", whose logo, and what the builder reads first.
    listBlock: fields.trade === 'food' ? 'Menu' : fields.trade === 'unknown' ? 'What it offers' : 'Services',
    reservable: fields.trade === 'food' ? 'Book a table' : 'Takes bookings',
    owner: fields.trade === 'food' ? "the restaurant's" : "the business's",
    readsFirst:
      fields.trade === 'food' ? 'the menu' : fields.trade === 'unknown' ? 'what it offers' : 'the services',
    ...fields
  })

export const TRADE_WORDS = Object.freeze({
  food: entry({
    trade: 'food',
    noun: 'restaurant',
    bookingAction: 'book a table',
    item: 'dish',
    items: 'menu items',
    itemPhoto: 'food',
    list: 'menu',
    ownPictures: 'its kitchen, interior or food',
    blogTopics: 'its cuisine, place, story, dishes'
  }),
  beauty: entry({
    trade: 'beauty',
    noun: 'salon',
    bookingAction: 'book an appointment',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its room, equipment or work',
    blogTopics: 'its services, place, story'
  }),
  health: entry({
    trade: 'health',
    noun: 'clinic',
    bookingAction: 'book an appointment',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its room, equipment or work',
    blogTopics: 'its services, place, story'
  }),
  fitness: entry({
    trade: 'fitness',
    noun: 'gym',
    bookingAction: 'book a class',
    item: 'class',
    items: 'classes',
    itemPhoto: 'training',
    list: 'schedule',
    ownPictures: 'its gym floor, equipment or classes',
    blogTopics: 'its classes, place, story'
  }),
  hospitality: entry({
    trade: 'hospitality',
    noun: 'hotel',
    bookingAction: 'book a room',
    item: 'room',
    items: 'rooms',
    itemPhoto: 'room',
    list: 'rooms',
    ownPictures: 'its rooms, interior or exterior',
    blogTopics: 'its rooms, place, story'
  }),
  travel: entry({
    trade: 'travel',
    noun: 'agency',
    bookingAction: 'request a quote',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its office, interior or work',
    blogTopics: 'its services, place, story'
  }),
  professional: entry({
    trade: 'professional',
    noun: 'office',
    bookingAction: 'book an appointment',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its office, interior or work',
    blogTopics: 'its services, place, story'
  }),
  creative: entry({
    trade: 'creative',
    noun: 'studio',
    bookingAction: 'book an appointment',
    item: 'service',
    items: 'services',
    itemPhoto: 'work',
    list: 'services',
    ownPictures: 'its studio, equipment or work',
    blogTopics: 'its work, place, story'
  }),
  education: entry({
    trade: 'education',
    noun: 'school',
    bookingAction: 'book a class',
    item: 'course',
    items: 'courses',
    itemPhoto: 'classroom',
    list: 'courses',
    ownPictures: 'its rooms, equipment or classes',
    blogTopics: 'its courses, place, story'
  }),
  retail: entry({
    trade: 'retail',
    noun: 'shop',
    bookingAction: 'contact',
    item: 'product',
    items: 'products',
    itemPhoto: 'product',
    list: 'products',
    ownPictures: 'its shop, interior or products',
    blogTopics: 'its products, place, story'
  }),
  auto: entry({
    trade: 'auto',
    noun: 'shop',
    bookingAction: 'request a quote',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its workshop, equipment or work',
    blogTopics: 'its services, place, story'
  }),
  home: entry({
    trade: 'home',
    noun: 'business',
    bookingAction: 'request a quote',
    item: 'service',
    items: 'services',
    itemPhoto: 'work',
    list: 'services',
    ownPictures: 'its equipment, interior or work',
    blogTopics: 'its services, place, story'
  }),
  events: entry({
    trade: 'events',
    noun: 'venue',
    bookingAction: 'request a quote',
    item: 'service',
    items: 'services',
    itemPhoto: 'venue',
    list: 'services',
    ownPictures: 'its venue, interior or events',
    blogTopics: 'its events, place, story'
  }),
  nonprofit: entry({
    trade: 'nonprofit',
    noun: 'business',
    bookingAction: 'contact',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its interior, equipment or work',
    blogTopics: 'its services, place, story'
  }),
  // A business whose trade nothing says (one saved by an Instagram link only): neutral words, never a restaurant's.
  unknown: entry({
    trade: 'unknown',
    noun: 'business',
    bookingAction: 'book',
    item: 'offering',
    items: 'offerings',
    itemPhoto: 'work',
    list: 'offerings',
    ownPictures: 'its place, equipment or work',
    blogTopics: 'what it offers, its place, its story'
  }),
  other: entry({
    trade: 'other',
    noun: 'business',
    bookingAction: 'contact',
    item: 'service',
    items: 'services',
    itemPhoto: 'service',
    list: 'services',
    ownPictures: 'its interior, equipment or work',
    blogTopics: 'its services, place, story'
  })
})

// The words of each sub-trade (`sub-trades.mjs` SUB_TRADES): a closed list per trade, each one a fixed, hand-written set
// of the same shape. A trade's own words above stay the words of a business whose sub-trade nothing settled.
const sub = (trade, subTrade, fields) => entry({ trade, subTrade, ...fields })

export const SUB_TRADE_WORDS = Object.freeze({
  fitness: Object.freeze({
    gym: sub('fitness', 'gym', {
      noun: 'gym',
      bookingAction: 'book a class',
      item: 'class',
      items: 'classes',
      itemPhoto: 'training',
      list: 'schedule',
      ownPictures: 'its gym floor, equipment or classes',
      blogTopics: 'its classes, place, story'
    }),
    studio: sub('fitness', 'studio', {
      noun: 'studio',
      bookingAction: 'book a class',
      item: 'class',
      items: 'classes',
      itemPhoto: 'training',
      list: 'classes',
      ownPictures: 'its studio, its classes or its teachers at work',
      blogTopics: 'its classes, studio, story'
    }),
    coaching: sub('fitness', 'coaching', {
      noun: 'coaching team',
      bookingAction: 'book a lesson',
      item: 'lesson',
      items: 'lessons',
      itemPhoto: 'training',
      list: 'lessons',
      ownPictures: 'its coaches, lessons and players in action',
      blogTopics: 'its lessons, coaches, story'
    }),
    club: sub('fitness', 'club', {
      noun: 'club',
      bookingAction: 'book a session',
      item: 'activity',
      items: 'activities',
      itemPhoto: 'facility',
      list: 'activities',
      ownPictures: 'its courts, pool or facilities',
      blogTopics: 'its activities, facilities, story'
    })
  }),
  beauty: Object.freeze({
    salon: sub('beauty', 'salon', { ...TRADE_WORDS.beauty, subTrade: 'salon' }),
    spa: sub('beauty', 'spa', {
      noun: 'spa',
      bookingAction: 'book a treatment',
      item: 'treatment',
      items: 'treatments',
      itemPhoto: 'treatment',
      list: 'treatments',
      ownPictures: 'its treatment rooms, interior or care',
      blogTopics: 'its treatments, place, story'
    }),
    barber: sub('beauty', 'barber', {
      noun: 'barbershop',
      bookingAction: 'book an appointment',
      item: 'service',
      items: 'services',
      itemPhoto: 'haircut',
      list: 'services',
      ownPictures: 'its chairs, interior or haircuts',
      blogTopics: 'its services, place, story'
    })
  }),
  health: Object.freeze({
    clinic: sub('health', 'clinic', { ...TRADE_WORDS.health, subTrade: 'clinic' }),
    dentist: sub('health', 'dentist', {
      noun: 'dental clinic',
      bookingAction: 'book an appointment',
      item: 'treatment',
      items: 'treatments',
      itemPhoto: 'treatment',
      list: 'treatments',
      ownPictures: 'its treatment rooms, equipment or team',
      blogTopics: 'its treatments, place, story'
    }),
    vet: sub('health', 'vet', {
      noun: 'veterinary clinic',
      bookingAction: 'book an appointment',
      item: 'service',
      items: 'services',
      itemPhoto: 'service',
      list: 'services',
      ownPictures: 'its rooms, team or the animals it cares for',
      blogTopics: 'its services, place, story'
    }),
    pharmacy: sub('health', 'pharmacy', {
      noun: 'pharmacy',
      bookingAction: 'contact',
      item: 'service',
      items: 'services',
      itemPhoto: 'service',
      list: 'services',
      ownPictures: 'its shop, shelves or team',
      blogTopics: 'its services, place, story'
    })
  })
})

/**
 * Vocabulary for `trade` (`trades.mjs` TRADES, or `unknown`); absent or `'food'` answers the restaurant words: a brief
 * stored before trades were written names none, and every one of those was a restaurant. A `subTrade` of that trade's
 * closed list (`SUB_TRADE_WORDS`) answers its own words; any other sub-trade is ignored.
 * @param {string | null | undefined} [trade]
 * @param {string | null | undefined} [subTrade]
 */
export function tradeWords(trade, subTrade = null) {
  if (typeof trade !== 'string' || !trade.trim() || trade === 'food') return TRADE_WORDS.food
  const own = typeof subTrade === 'string' ? SUB_TRADE_WORDS[trade]?.[subTrade] : null
  return own ?? TRADE_WORDS[trade] ?? TRADE_WORDS.other
}

/** The words a brief's business speaks in: its trade's, or its sub-trade's when the brief decided one. */
export const businessWords = (business) => tradeWords(business?.trade, business?.subTrade?.id ?? null)

// Words for what any business offers: never a sign of another kind of business.
const GENERIC_ITEM_WORDS = new Set(['service', 'services', 'activity', 'activities', 'offering', 'offerings'])

/**
 * The template's words for what a business of its trade offers, when this business, of a decided sub-trade, does not
 * use them: a template is chosen by trade and speaks the trade's own words on its buttons, menu entries and footer
 * headings ("Try a class", "Classes" on a coaching team that gives lessons, dev 27/10/2026). Empty without a decided
 * sub-trade, and when the trade's words are generic or this business's own.
 * @param {string | null | undefined} trade @param {string | null | undefined} subTrade
 * @returns {string[]}
 */
export function otherKindWords(trade, subTrade) {
  const own =
    typeof trade === 'string' && typeof subTrade === 'string' ? SUB_TRADE_WORDS[trade]?.[subTrade] : null
  const template = own ? TRADE_WORDS[trade] : null
  if (!template) return []
  return [template.item, template.items].filter(
    (word, i, all) =>
      all.indexOf(word) === i && word !== own.item && word !== own.items && !GENERIC_ITEM_WORDS.has(word)
  )
}
