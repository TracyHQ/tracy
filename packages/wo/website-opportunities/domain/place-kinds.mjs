// The six tabs of Find places, and how Google's Table A types (place-types doc, Food and Drink + nightlife) fold into them.
export const KINDS = Object.freeze(['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife'])

const BY_KIND = {
  restaurants: [
    'afghani_restaurant',
    'african_restaurant',
    'american_restaurant',
    'argentinian_restaurant',
    'asian_fusion_restaurant',
    'asian_restaurant',
    'australian_restaurant',
    'austrian_restaurant',
    'bangladeshi_restaurant',
    'barbecue_restaurant',
    'basque_restaurant',
    'bavarian_restaurant',
    'belgian_restaurant',
    'bistro',
    'brazilian_restaurant',
    'breakfast_restaurant',
    'british_restaurant',
    'brunch_restaurant',
    'buffet_restaurant',
    'burmese_restaurant',
    'cafeteria',
    'cajun_restaurant',
    'californian_restaurant',
    'cambodian_restaurant',
    'cantonese_restaurant',
    'caribbean_restaurant',
    'chilean_restaurant',
    'chinese_noodle_restaurant',
    'chinese_restaurant',
    'colombian_restaurant',
    'croatian_restaurant',
    'cuban_restaurant',
    'czech_restaurant',
    'danish_restaurant',
    'dim_sum_restaurant',
    'diner',
    'dumpling_restaurant',
    'dutch_restaurant',
    'eastern_european_restaurant',
    'ethiopian_restaurant',
    'european_restaurant',
    'family_restaurant',
    'filipino_restaurant',
    'fine_dining_restaurant',
    'fondue_restaurant',
    'french_restaurant',
    'fusion_restaurant',
    'german_restaurant',
    'greek_restaurant',
    'halal_restaurant',
    'hawaiian_restaurant',
    'hot_pot_restaurant',
    'hungarian_restaurant',
    'indian_restaurant',
    'indonesian_restaurant',
    'irish_restaurant',
    'israeli_restaurant',
    'italian_restaurant',
    'japanese_curry_restaurant',
    'japanese_izakaya_restaurant',
    'japanese_restaurant',
    'korean_barbecue_restaurant',
    'korean_restaurant',
    'latin_american_restaurant',
    'lebanese_restaurant',
    'malaysian_restaurant',
    'mediterranean_restaurant',
    'mexican_restaurant',
    'middle_eastern_restaurant',
    'mongolian_barbecue_restaurant',
    'moroccan_restaurant',
    'noodle_shop',
    'north_indian_restaurant',
    'oyster_bar_restaurant',
    'pakistani_restaurant',
    'persian_restaurant',
    'peruvian_restaurant',
    'pizza_restaurant',
    'polish_restaurant',
    'portuguese_restaurant',
    'ramen_restaurant',
    'restaurant',
    'romanian_restaurant',
    'russian_restaurant',
    'scandinavian_restaurant',
    'seafood_restaurant',
    'soul_food_restaurant',
    'soup_restaurant',
    'south_american_restaurant',
    'south_indian_restaurant',
    'southwestern_us_restaurant',
    'spanish_restaurant',
    'sri_lankan_restaurant',
    'steak_house',
    'sushi_restaurant',
    'swiss_restaurant',
    'taiwanese_restaurant',
    'tapas_restaurant',
    'tex_mex_restaurant',
    'thai_restaurant',
    'tibetan_restaurant',
    'tonkatsu_restaurant',
    'turkish_restaurant',
    'ukrainian_restaurant',
    'vegan_restaurant',
    'vegetarian_restaurant',
    'vietnamese_restaurant',
    'western_restaurant',
    'yakiniku_restaurant',
    'yakitori_restaurant'
  ],
  cafes: [
    'acai_shop',
    'cafe',
    'cat_cafe',
    'coffee_roastery',
    'coffee_shop',
    'coffee_stand',
    'dog_cafe',
    'juice_shop',
    'tea_house'
  ],
  'fast-food': [
    'bagel_shop',
    'burrito_restaurant',
    'chicken_restaurant',
    'chicken_wings_restaurant',
    'deli',
    'falafel_restaurant',
    'fast_food_restaurant',
    'fish_and_chips_restaurant',
    'food_court',
    'gyro_restaurant',
    'hamburger_restaurant',
    'hot_dog_restaurant',
    'hot_dog_stand',
    'kebab_shop',
    'meal_delivery',
    'meal_takeaway',
    'pizza_delivery',
    'salad_shop',
    'sandwich_shop',
    'shawarma_restaurant',
    'snack_bar',
    'taco_restaurant'
  ],
  bakeries: [
    'bakery',
    'cake_shop',
    'candy_store',
    'chocolate_factory',
    'chocolate_shop',
    'confectionery',
    'dessert_restaurant',
    'dessert_shop',
    'donut_shop',
    'ice_cream_shop',
    'pastry_shop'
  ],
  bars: [
    'bar',
    'bar_and_grill',
    'beer_garden',
    'brewery',
    'brewpub',
    'cocktail_bar',
    'gastropub',
    'hookah_bar',
    'irish_pub',
    'lounge_bar',
    'pub',
    'sports_bar',
    'wine_bar',
    'winery'
  ],
  nightlife: ['night_club', 'karaoke', 'live_music_venue', 'dance_hall', 'comedy_club']
}

const KIND_OF = new Map()
for (const kind of KINDS) for (const t of BY_KIND[kind]) KIND_OF.set(t, kind)

export const SEARCH_PRIMARY_TYPES = Object.freeze([...KIND_OF.keys()].sort())

/** One of KINDS, or null for a type that is not a place to eat or drink. */
export function kindOfPrimaryType(type) {
  return typeof type === 'string' ? (KIND_OF.get(type) ?? null) : null
}

/** Searchable types of the given kinds (Table A order within a kind); no or unknown-only kinds → every type. */
export function primaryTypesOfKinds(kinds) {
  const wanted = Array.isArray(kinds) ? kinds.filter((k) => KINDS.includes(k)) : []
  if (!wanted.length) return Array.isArray(kinds) && kinds.length ? [] : [...SEARCH_PRIMARY_TYPES]
  return SEARCH_PRIMARY_TYPES.filter((t) => wanted.includes(KIND_OF.get(t)))
}

// `<x>_restaurant` where x is a format, not a cuisine.
const NOT_A_CUISINE = new Set([
  'fast_food',
  'fine_dining',
  'family',
  'buffet',
  'breakfast',
  'brunch',
  'dessert'
])
const CUISINE_OF_OTHER = { pizza_delivery: 'pizza', kebab_shop: 'kebab' }

/** The cuisine id a type implies (`vietnamese_restaurant` → `vietnamese`), or null. */
export function cuisineOfPrimaryType(type) {
  if (typeof type !== 'string' || !KIND_OF.has(type)) return null
  if (CUISINE_OF_OTHER[type]) return CUISINE_OF_OTHER[type]
  const m = /^(.+)_restaurant$/.exec(type)
  return m && !NOT_A_CUISINE.has(m[1]) ? m[1] : null
}

// First Table A type (across kinds in KINDS order) that yields the cuisine; `pizza` → `pizza_restaurant`, not `pizza_delivery`.
const TYPE_OF_CUISINE = new Map()
for (const t of KIND_OF.keys()) {
  const c = cuisineOfPrimaryType(t)
  if (c && !TYPE_OF_CUISINE.has(c)) TYPE_OF_CUISINE.set(c, t)
}

export const CUISINES = Object.freeze([...TYPE_OF_CUISINE.keys()].sort())

/** The one type to send as `includedType` for a cuisine, or null. */
export function primaryTypeOfCuisine(cuisine) {
  return TYPE_OF_CUISINE.get(cuisine) ?? null
}
