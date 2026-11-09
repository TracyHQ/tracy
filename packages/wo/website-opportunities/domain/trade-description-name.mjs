// Whether a name a listing gives a business is only a description of its trade (#189, name rule 1): category words
// plus a place, no proper noun ("Padel & Squash Coach", "Dental Clinic Riverton", "Best Bakery in Old Town"). Such a name
// does not count as the business's name: the business's own marks win over it and it causes no conflict. Pure.
//
// 🔒 A CLOSED VOCABULARY, SAFE BY DEFAULT. A word this module does not know makes the name a proper name, and a proper
// name that the own marks contradict keeps the old hold (neutral text until the owner confirms). So a missing word can
// only keep today's careful behaviour, never put a wrong name on a site.

import { normalName } from './google-link.mjs'

/** Joining words: they carry no name on their own. */
const JOINING = new Set([
  'and',
  'the',
  'of',
  'in',
  'at',
  'for',
  'by',
  'on',
  'a',
  'an',
  'to',
  'with',
  'near',
  'me'
])

/** Praise and size words listings add to a description ("Best", "Top", "Professional"). */
const QUALIFIERS = new Set([
  'best',
  'top',
  'professional',
  'expert',
  'certified',
  'local',
  'premium',
  'affordable',
  'private',
  'personal',
  'family',
  'kids',
  'children',
  'adult',
  'adults',
  'mobile',
  'online',
  'new',
  'general',
  'international',
  'european',
  'indoor',
  'outdoor',
  'group',
  'luxury',
  '24',
  'hours',
  'hour',
  'open',
  'llc',
  'fze',
  'ltd',
  'inc',
  'co'
])

/**
 * Category nouns: the Google Places type words of every trade (`trades.mjs`), the sports and services a listing names a
 * business by, and their plurals. A word is checked with and without a trailing "s".
 */
const CATEGORY = new Set(
  `accounting agency alley amusement art arts auto bank banquet bed breakfast bicycle bike boarding book bowling butcher
  campground car care cell center centre charging child church cleaning clothing club coaching coach coaches community
  company concert consultant consultancy contractor convenience convention corporate cottage courier coworking dealer
  department design designer discount driving electric electrician electronics employment estate event extended
  farmstay finance fitness florist furniture gallery garden gas gift goods graphic grocery guest gym hall hardware
  home hostel hotel house hvac improvement information inn insurance jewelry jewellery landscaper language laundry
  lawyer library liquor locksmith lodging mall market marketing mosque motel movie moving museum music night office
  organization painter park parlor parlour parts performing pet phone photography photographer pilates place plumber
  plumbing pool preschool primary profit provider real rental repair resort roofing room school secondary service
  shoe shop shopping space sporting sport sports station stay storage store studio supermarket swimming swim synagogue
  tailor tattoo telecommunications temple theater theatre tire tyre tour tourist toy travel tutoring tutor university
  vehicle venue wash wedding wholesaler worship yoga
  tennis padel squash badminton football soccer basketball volleyball cricket golf boxing kickboxing karate judo
  taekwondo jiujitsu jitsu martial arts mma muay thai dance dancing ballet zumba crossfit training trainer trainers
  lesson lessons class classes academy institute court courts racket racquet aquatics diving surf surfing sailing
  riding equestrian climbing running athletics gymnastics wellness health fitness bootcamp
  dental dentist dentistry clinic clinics medical medicine doctor doctors hospital pharmacy physio physiotherapy
  physiotherapist chiropractor chiropractic optician optical vet veterinary laboratory lab therapy therapist massage
  spa salon salons beauty hair hairdresser barber barbers barbershop nail nails skin skincare makeup aesthetics lash
  brow waxing
  restaurant restaurants cafe cafes coffee bakery bakeries bakehouse pastry patisserie cake cakes bistro grill kitchen
  catering caterer pizza pizzeria burger burgers sushi shawarma bar bars pub lounge juice tea food foods deli
  diner eatery buffet seafood steakhouse
  law legal attorney attorneys solicitor notary accountant accountants audit tax consulting agency agencies
  realty property properties construction builder builders renovation interior interiors cleaner cleaners maintenance
  electrical carpentry carpenter pest control mover movers logistics printing print signage
  garage mechanic mechanics detailing tyres towing
  boutique fashion tailoring florist flowers gifts pets grooming kennel daycare nursery tuition education training
  events planner planners photo video studios rentals tours travel`
    .split(/\s+/)
    .filter(Boolean)
)

const known = (word) =>
  CATEGORY.has(word) ||
  QUALIFIERS.has(word) ||
  (word.endsWith('s') && (CATEGORY.has(word.slice(0, -1)) || QUALIFIERS.has(word.slice(0, -1)))) ||
  (word.endsWith('es') && CATEGORY.has(word.slice(0, -2)))

/** The words of a text, lowercased letters and digits (`normalName`), ampersands and dashes dropped. */
const wordsOf = (text) =>
  normalName(typeof text === 'string' ? text : '')
    .split(/\s+/)
    .filter(Boolean)

/**
 * Whether `name` is only a trade description: every word is a category noun, a praise or size word, a joining word,
 * or a word of the business's own place (`places`: its city, district, country as the address gives them).
 * @param {string | null | undefined} name
 * @param {{ places?: (string | null | undefined)[] }} [context]
 */
export function isTradeDescriptionName(name, { places = [] } = {}) {
  const words = wordsOf(name)
  if (!words.length) return false
  const placeWords = new Set(places.flatMap(wordsOf))
  let category = 0
  for (const word of words) {
    if (JOINING.has(word) || placeWords.has(word)) continue
    if (!known(word)) return false
    if (!QUALIFIERS.has(word)) category += 1
  }
  // At least one category noun: "Riverton" alone or "Best in Town" is no description of a trade.
  return category > 0
}

/**
 * The place words of a business, from what its research records: the address line split at its separators and every
 * address component Google gives (long and short text). Pure.
 * @param {{ address?: string | null, addressComponents?: { longText?: string, shortText?: string }[] | null }} input
 */
export function placeWordsOf({ address = null, addressComponents = null } = {}) {
  const out = []
  if (typeof address === 'string') out.push(...address.split(/[-,|/]+/))
  for (const c of Array.isArray(addressComponents) ? addressComponents : [])
    out.push(c?.longText, c?.shortText)
  return out.filter((v) => typeof v === 'string' && v.trim())
}
