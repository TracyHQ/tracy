// What an area search asks each map provider for, per trade (`trades.mjs`): the business kinds a Find can be narrowed to.
// Data, kept here so a contributor can add a kind of business without touching the search code (docs/plugins.md).
//
// Each row: `google` — Google Places (New) Table A types sent as Nearby `includedTypes` (at most 50 per call);
// `osm` — OpenStreetMap tags, `[key, values]` (one of the values) or `[key, null, except]` (any value but those);
// `phrase` — the words a Google Maps (Apify) search uses. `trades.mjs` must file every `google` type under the
// same trade, so a place found under a kind is told apart the same way everywhere.
//
// Only businesses that sell to the public are asked for: no government office, school, hospital, place of worship,
// ATM, parking, mall or department store. Food and drink keeps its own search (`place-kinds.mjs`, Text Search).

export const SEARCH_TRADES = Object.freeze([
  'food',
  'beauty',
  'health',
  'fitness',
  'hospitality',
  'travel',
  'professional',
  'creative',
  'education',
  'retail',
  'auto',
  'home',
  'events'
])

const OSM_FOOD = [['amenity', ['restaurant', 'cafe', 'fast_food', 'bar', 'pub']]]
const OSM_NOT_RETAIL = [
  'vacant',
  'no',
  'yes',
  'mall',
  'department_store',
  'supermarket',
  'hairdresser',
  'beauty',
  'massage',
  'cosmetics',
  'tattoo',
  'florist',
  'photo',
  'art',
  'travel_agency',
  'car',
  'car_repair',
  'car_parts',
  'tyres',
  'motorcycle',
  'estate_agent',
  'optician',
  'laundry',
  'dry_cleaning',
  'locksmith',
  'bakery',
  'pastry',
  'confectionery'
]

export const TRADE_SEARCH = Object.freeze({
  food: {
    google: [
      'restaurant',
      'cafe',
      'coffee_shop',
      'bar',
      'pub',
      'bakery',
      'fast_food_restaurant',
      'meal_takeaway',
      'ice_cream_shop',
      'night_club'
    ],
    osm: OSM_FOOD,
    phrase: 'restaurant'
  },
  beauty: {
    google: [
      'beauty_salon',
      'hair_salon',
      'hair_care',
      'nail_salon',
      'barber_shop',
      'spa',
      'massage',
      'massage_spa',
      'tanning_studio',
      'skin_care_clinic',
      'makeup_artist',
      'beautician',
      'body_art_service',
      'sauna',
      'wellness_center',
      'foot_care'
    ],
    osm: [
      ['shop', ['hairdresser', 'beauty', 'massage', 'cosmetics']],
      ['leisure', ['spa']],
      ['amenity', ['spa']]
    ],
    phrase: 'beauty salon'
  },
  health: {
    google: [
      'dentist',
      'dental_clinic',
      'doctor',
      'medical_clinic',
      'medical_center',
      'physiotherapist',
      'chiropractor',
      'veterinary_care',
      'pharmacy',
      'drugstore',
      'pet_care',
      'pet_boarding_service'
    ],
    osm: [
      ['amenity', ['dentist', 'doctors', 'clinic', 'pharmacy', 'veterinary']],
      [
        'healthcare',
        [
          'physiotherapist',
          'chiropractor',
          'dentist',
          'doctor',
          'optometrist',
          'psychotherapist',
          'alternative'
        ]
      ],
      ['shop', ['optician']]
    ],
    phrase: 'clinic'
  },
  fitness: {
    google: ['gym', 'fitness_center', 'yoga_studio', 'sports_club', 'sports_coaching', 'sports_school'],
    osm: [
      ['leisure', ['fitness_centre']],
      ['amenity', ['dojo']]
    ],
    phrase: 'gym'
  },
  hospitality: {
    google: [
      'lodging',
      'hotel',
      'motel',
      'resort_hotel',
      'inn',
      'bed_and_breakfast',
      'guest_house',
      'hostel',
      'extended_stay_hotel',
      'farmstay',
      'campground',
      'cottage',
      'private_guest_room'
    ],
    osm: [['tourism', ['hotel', 'motel', 'guest_house', 'hostel', 'apartment', 'chalet', 'camp_site']]],
    phrase: 'hotel'
  },
  travel: {
    google: ['travel_agency', 'tour_agency', 'car_rental'],
    osm: [
      ['shop', ['travel_agency']],
      ['office', ['travel_agent']],
      ['amenity', ['car_rental']]
    ],
    phrase: 'travel agency'
  },
  professional: {
    google: [
      'lawyer',
      'accounting',
      'insurance_agency',
      'real_estate_agency',
      'consultant',
      'employment_agency',
      'marketing_consultant',
      'courier_service',
      'coworking_space'
    ],
    osm: [
      [
        'office',
        [
          'lawyer',
          'accountant',
          'insurance',
          'estate_agent',
          'tax_advisor',
          'consulting',
          'notary',
          'architect',
          'employment_agency',
          'advertising_agency'
        ]
      ],
      ['shop', ['estate_agent']]
    ],
    phrase: 'lawyer'
  },
  creative: {
    google: ['art_studio', 'florist'],
    osm: [
      ['shop', ['florist', 'photo', 'art', 'tattoo']],
      ['craft', ['photographer']],
      ['office', ['graphic_design']]
    ],
    phrase: 'florist'
  },
  education: {
    google: ['preschool', 'child_care_agency'],
    osm: [
      [
        'amenity',
        ['driving_school', 'language_school', 'music_school', 'dancing_school', 'prep_school', 'childcare']
      ]
    ],
    phrase: 'language school'
  },
  retail: {
    google: [
      'store',
      'clothing_store',
      'shoe_store',
      'jewelry_store',
      'book_store',
      'gift_shop',
      'furniture_store',
      'electronics_store',
      'home_goods_store',
      'hardware_store',
      'pet_store',
      'sporting_goods_store',
      'cell_phone_store',
      'bicycle_store',
      'garden_center',
      'toy_store',
      'butcher_shop',
      'liquor_store',
      'tailor'
    ],
    osm: [['shop', null, OSM_NOT_RETAIL]],
    phrase: 'shop'
  },
  auto: {
    google: ['car_repair', 'car_dealer', 'car_wash', 'auto_parts_store', 'tire_shop'],
    osm: [
      ['shop', ['car', 'car_repair', 'car_parts', 'tyres', 'motorcycle']],
      ['amenity', ['car_wash']]
    ],
    phrase: 'car repair'
  },
  home: {
    google: [
      'plumber',
      'electrician',
      'roofing_contractor',
      'painter',
      'locksmith',
      'moving_company',
      'laundry',
      'storage'
    ],
    osm: [
      [
        'craft',
        [
          'plumber',
          'electrician',
          'roofer',
          'painter',
          'carpenter',
          'hvac',
          'gardener',
          'locksmith',
          'builder',
          'tiler',
          'glaziery'
        ]
      ],
      ['shop', ['locksmith', 'laundry', 'dry_cleaning']]
    ],
    phrase: 'plumber'
  },
  events: {
    google: ['event_venue', 'wedding_venue', 'banquet_hall', 'bowling_alley'],
    osm: [
      ['amenity', ['events_venue', 'nightclub']],
      ['leisure', ['bowling_alley']]
    ],
    phrase: 'event venue'
  }
})

// "Any local business" on Google: one Nearby call (at most 50 types), so the broadest type of each trade.
export const ANY_GOOGLE_TYPES = Object.freeze([
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'meal_takeaway',
  'beauty_salon',
  'hair_salon',
  'nail_salon',
  'barber_shop',
  'spa',
  'massage',
  'dentist',
  'doctor',
  'medical_clinic',
  'physiotherapist',
  'veterinary_care',
  'pharmacy',
  'pet_care',
  'gym',
  'fitness_center',
  'yoga_studio',
  'lodging',
  'travel_agency',
  'tour_agency',
  'car_rental',
  'lawyer',
  'accounting',
  'insurance_agency',
  'real_estate_agency',
  'consultant',
  'art_studio',
  'florist',
  'preschool',
  'child_care_agency',
  'store',
  'clothing_store',
  'furniture_store',
  'hardware_store',
  'pet_store',
  'car_repair',
  'car_dealer',
  'car_wash',
  'plumber',
  'electrician',
  'roofing_contractor',
  'painter',
  'locksmith',
  'moving_company',
  'laundry',
  'event_venue'
])

/** `any`, `null` or a kind name → the kind to search, or null for every kind; undefined for a name that is not one. */
export function searchTradeOf(value) {
  if (value === undefined || value === null || value === 'any') return null
  return SEARCH_TRADES.includes(value) ? value : undefined
}

/** The Nearby `includedTypes` for one kind, or for every kind. */
export function googleTypesOf(trade) {
  return [...(trade ? TRADE_SEARCH[trade].google : ANY_GOOGLE_TYPES)]
}

/** The Google Maps search phrases: one for a kind, one per kind for every kind. */
export function searchPhrasesOf(trade) {
  return trade ? [TRADE_SEARCH[trade].phrase] : SEARCH_TRADES.map((t) => TRADE_SEARCH[t].phrase)
}

const osmRowsOf = (trade) =>
  trade ? TRADE_SEARCH[trade].osm : SEARCH_TRADES.flatMap((t) => TRADE_SEARCH[t].osm)
const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alternation = (values) => `^(${values.map(escapeRe).join('|')})$`

/** Overpass statements (`nwr[…](around:…);` each) for one kind, or for every kind. */
export function osmStatementsOf(trade, around) {
  return osmRowsOf(trade)
    .map(([key, values, except]) =>
      values
        ? `nwr[${key}~"${alternation(values)}"]${around};`
        : `nwr[${key}][${key}!~"${alternation(except)}"]${around};`
    )
    .join('')
}

/** The kind a place's OSM tags fall under (retail last: a shop no other kind names), or null. */
export function tradeOfOsmTags(tags = {}) {
  const ordered = [...SEARCH_TRADES.filter((t) => t !== 'retail'), 'retail']
  for (const trade of ordered) {
    for (const [key, values, except] of TRADE_SEARCH[trade].osm) {
      const v = tags[key]
      if (typeof v !== 'string' || !v) continue
      if (values ? values.includes(v) : !except.includes(v)) return trade
    }
  }
  return null
}
