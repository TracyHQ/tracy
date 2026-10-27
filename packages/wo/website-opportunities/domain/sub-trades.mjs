// What kind of business a trade's business is (its sub-trade): the words a brief speaks in, where the trade itself
// (`trades.mjs`) only picks the template. A gym, a yoga studio, a coaching team that teaches at several venues and a
// club with its own courts are all `fitness`, and each needs its own words ("book a class" is wrong for a coach).
//
// 🔒 A CLOSED LIST PER TRADE, EACH WITH FIXED WORDS (`trade-words.mjs SUB_TRADE_WORDS`). The model picks one id from
// this list inside the business reading (`business-reading.mjs`) and quotes the texts that show it; code keeps the pick
// only when the id is on the list and every quote is found word for word in the text it names. Otherwise the Google
// type table below decides, and when it says nothing either the trade's own words stay.
// 🔒 THE NAME IS NOT EVIDENCE. A name says "club" or "gym" for many businesses that are neither, so the name is never a
// quotable text and the table reads only Google's types.
import { SUB_TRADE_WORDS } from './trade-words.mjs'

/** Each trade's sub-trades: the id the model answers with, and what it means, as the reading prompt states it. */
export const SUB_TRADES = Object.freeze({
  fitness: Object.freeze([
    {
      id: 'gym',
      means: 'a gym or fitness centre: members train on its own floor with its equipment and classes'
    },
    {
      id: 'studio',
      means: 'a studio that teaches group classes in its own room: yoga, pilates, dance, boxing, martial arts'
    },
    {
      id: 'coaching',
      means:
        'private or small-group coaching or lessons (tennis, padel, swimming, personal training) given by coaches, often at venues the business does not own'
    },
    {
      id: 'club',
      means: 'a sports club or venue with its own grounds or facilities: courts, pitches, a swimming pool'
    }
  ]),
  beauty: Object.freeze([
    { id: 'salon', means: 'a beauty, hair or nail salon' },
    { id: 'spa', means: 'a spa, massage or wellness centre that sells treatments' },
    { id: 'barber', means: "a barbershop: men's haircuts and shaves" }
  ]),
  health: Object.freeze([
    { id: 'clinic', means: 'a medical clinic, doctor, physiotherapist or other practice that sees patients' },
    { id: 'dentist', means: 'a dentist or dental clinic' },
    { id: 'vet', means: 'a veterinary clinic: care for animals' },
    { id: 'pharmacy', means: 'a pharmacy or drugstore' }
  ])
})

// The Google Places types that settle a sub-trade on their own. A type that can mean more than one (`sports_club`:
// a club with grounds, or a coach registered as one) is not here, so the table says nothing for it.
const BY_GOOGLE_TYPE = Object.freeze({
  fitness: {
    gym: 'gym',
    fitness_center: 'gym',
    yoga_studio: 'studio',
    pilates_studio: 'studio',
    sports_coaching: 'coaching',
    sports_school: 'coaching',
    swimming_pool: 'club'
  },
  beauty: {
    beauty_salon: 'salon',
    hair_salon: 'salon',
    hair_care: 'salon',
    nail_salon: 'salon',
    makeup_artist: 'salon',
    beautician: 'salon',
    spa: 'spa',
    massage: 'spa',
    massage_spa: 'spa',
    sauna: 'spa',
    wellness_center: 'spa',
    barber_shop: 'barber'
  },
  health: {
    dentist: 'dentist',
    dental_clinic: 'dentist',
    veterinary_care: 'vet',
    pharmacy: 'pharmacy',
    drugstore: 'pharmacy',
    doctor: 'clinic',
    medical_clinic: 'clinic',
    medical_center: 'clinic',
    physiotherapist: 'clinic',
    chiropractor: 'clinic'
  }
})

/** The sub-trades a trade's business may be: `[{id, means}]`, empty for a trade without a list. */
export const subTradeChoicesOf = (trade) => (typeof trade === 'string' ? (SUB_TRADES[trade] ?? []) : [])

/** Whether `id` is one of `trade`'s sub-trades (and has its words). */
export const isSubTradeOf = (trade, id) =>
  typeof id === 'string' &&
  subTradeChoicesOf(trade).some((c) => c.id === id) &&
  Boolean(SUB_TRADE_WORDS[trade]?.[id])

/**
 * The sub-trade Google's types settle (pure): the primary type first, then the others in order; null when none of them
 * is in the table.
 * @param {string} trade
 * @param {{primaryType?: string | null, types?: string[] | null} | null} [place]
 */
export function subTradeOfGoogleTypes(trade, place) {
  const table = BY_GOOGLE_TYPE[trade]
  if (!table || !place) return null
  const types = [place.primaryType, ...(Array.isArray(place.types) ? place.types : [])]
  for (const t of types) if (typeof t === 'string' && table[t]) return table[t]
  return null
}

/**
 * The sub-trade a brief speaks in (pure), with how it was decided:
 * - `model`: the business reading's pick (`reading.subTrade`, already checked against its quotes), when it is one of
 *   this trade's sub-trades;
 * - `table`: else the one Google's types settle;
 * - `trade`: else none, and the trade's own words stay.
 * Null for a trade without sub-trades (food, other, unknown…).
 * @returns {{id: string | null, method: 'model' | 'table' | 'trade', quotes: {quote: string, source: object}[]} | null}
 */
export function decideSubTrade({ trade, reading = null, googlePlace = null, candidate = null } = {}) {
  if (!subTradeChoicesOf(trade).length) return null
  const picked = reading?.subTrade
  if (picked && isSubTradeOf(trade, picked.id) && Array.isArray(picked.quotes) && picked.quotes.length)
    return { id: picked.id, method: 'model', quotes: picked.quotes }
  const fromTable =
    subTradeOfGoogleTypes(trade, googlePlace) ??
    subTradeOfGoogleTypes(trade, { primaryType: candidate?.primaryType, types: candidate?.types })
  if (fromTable) return { id: fromTable, method: 'table', quotes: [] }
  return { id: null, method: 'trade', quotes: [] }
}
