// Which trade a business is in, from its Google Places types: what picks a template and the words a brief uses
// for any business, where `place-kinds.mjs` (the six Find tabs) knows only food and drink. A type this table does
// not name is `other`, never a guess.
import { CUISINES, kindOfPrimaryType } from './place-kinds.mjs'

export const TRADES = Object.freeze([
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
  'events',
  'nonprofit',
  'other'
])

// Exact Google Places (New) types (Table A) for each trade; `food` is every type `place-kinds.mjs` folds.
const BY_TRADE = {
  beauty: [
    'beauty_salon',
    'hair_salon',
    'hair_care',
    'nail_salon',
    'barber_shop',
    'spa',
    'massage',
    'tanning_studio',
    'skin_care_clinic',
    'makeup_artist',
    'beautician',
    'body_art_service',
    'sauna',
    'wellness_center',
    'massage_spa',
    'foot_care'
  ],
  health: [
    'dentist',
    'dental_clinic',
    'doctor',
    'hospital',
    'medical_clinic',
    'medical_lab',
    'pharmacy',
    'drugstore',
    'physiotherapist',
    'chiropractor',
    'veterinary_care',
    'general_hospital',
    'optician',
    'medical_center',
    'pet_care',
    'pet_boarding_service'
  ],
  fitness: [
    'gym',
    'fitness_center',
    'yoga_studio',
    'sports_club',
    'sports_coaching',
    'swimming_pool',
    'pilates_studio',
    'sports_school'
  ],
  hospitality: [
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
  travel: ['travel_agency', 'tour_agency', 'tourist_information_center', 'car_rental'],
  professional: [
    'lawyer',
    'accounting',
    'insurance_agency',
    'real_estate_agency',
    'consultant',
    'finance',
    'bank',
    'corporate_office',
    'employment_agency',
    'marketing_agency',
    'courier_service',
    'telecommunications_service_provider',
    'marketing_consultant',
    'coworking_space'
  ],
  creative: [
    'art_studio',
    'photography_studio',
    'graphic_designer',
    'design_studio',
    'tattoo_parlor',
    'florist'
  ],
  education: [
    'school',
    'primary_school',
    'secondary_school',
    'university',
    'preschool',
    'library',
    'driving_school',
    'language_school',
    'music_school',
    'tutoring_service',
    'child_care_agency'
  ],
  retail: [
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
    'grocery_store',
    'supermarket',
    'convenience_store',
    'liquor_store',
    'pet_store',
    'sporting_goods_store',
    'shopping_mall',
    'department_store',
    'market',
    'cell_phone_store',
    'bicycle_store',
    'garden_center',
    'home_improvement_store',
    'discount_store',
    'wholesaler',
    'toy_store',
    'butcher_shop',
    'tailor'
  ],
  auto: [
    'car_repair',
    'car_dealer',
    'car_wash',
    'gas_station',
    'electric_vehicle_charging_station',
    'auto_parts_store',
    'tire_shop'
  ],
  home: [
    'plumber',
    'electrician',
    'roofing_contractor',
    'painter',
    'locksmith',
    'moving_company',
    'general_contractor',
    'laundry',
    'cleaning_service',
    'hvac_contractor',
    'landscaper',
    'storage'
  ],
  events: [
    'event_venue',
    'wedding_venue',
    'banquet_hall',
    'convention_center',
    'night_club',
    'concert_hall',
    'performing_arts_theater',
    'movie_theater',
    'museum',
    'art_gallery',
    'amusement_park',
    'bowling_alley'
  ],
  nonprofit: [
    'church',
    'mosque',
    'synagogue',
    'hindu_temple',
    'place_of_worship',
    'non_profit_organization',
    'community_center'
  ]
}
const TRADE_OF = new Map(Object.entries(BY_TRADE).flatMap(([trade, types]) => types.map((t) => [t, trade])))

/**
 * The trade of one place: its primary type first, then its other types in order; a food or drink type is `food`.
 * @param {{ primaryType?: string | null, types?: string[] | null, kind?: string | null }} place
 * @returns {(typeof TRADES)[number]}
 */
export function tradeOfPlace({ primaryType = null, types = null, kind = null } = {}) {
  if (kind) return 'food'
  for (const type of [primaryType, ...(Array.isArray(types) ? types : [])]) {
    if (typeof type !== 'string' || !type) continue
    if (kindOfPrimaryType(type)) return 'food'
    const trade = TRADE_OF.get(type)
    if (trade) return trade
  }
  return 'other'
}

// schema.org LocalBusiness subtypes for each trade; the website crawler reads a business only of these types.
const BY_SCHEMA = {
  food: [
    'Restaurant',
    'FoodEstablishment',
    'CafeOrCoffeeShop',
    'BarOrPub',
    'FastFoodRestaurant',
    'Bakery',
    'Brewery',
    'Winery',
    'IceCreamShop',
    'Distillery'
  ],
  health: [
    'Dentist',
    'MedicalBusiness',
    'MedicalClinic',
    'MedicalOrganization',
    'Physician',
    'Pharmacy',
    'Optician',
    'VeterinaryCare',
    'Hospital',
    'Physiotherapy',
    'Optometric',
    'Dermatology',
    'Pediatric',
    'PrimaryCare',
    'Psychiatric',
    'Podiatric',
    'PlasticSurgery',
    'DietNutrition'
  ],
  beauty: ['HealthAndBeautyBusiness', 'BeautySalon', 'DaySpa', 'HairSalon', 'NailSalon'],
  fitness: [
    'HealthClub',
    'ExerciseGym',
    'SportsActivityLocation',
    'SportsClub',
    'PublicSwimmingPool',
    'TennisComplex',
    'GolfCourse'
  ],
  hospitality: [
    'LodgingBusiness',
    'Hotel',
    'Motel',
    'Resort',
    'BedAndBreakfast',
    'Hostel',
    'Campground',
    'VacationRental'
  ],
  travel: ['TravelAgency', 'AutoRental', 'TouristInformationCenter'],
  professional: [
    'ProfessionalService',
    'LegalService',
    'Attorney',
    'Notary',
    'AccountingService',
    'FinancialService',
    'InsuranceAgency',
    'RealEstateAgent',
    'EmploymentAgency',
    'BankOrCreditUnion'
  ],
  creative: ['TattooParlor', 'Florist', 'ArtGallery'],
  retail: [
    'Store',
    'ClothingStore',
    'JewelryStore',
    'BookStore',
    'FurnitureStore',
    'HomeGoodsStore',
    'ShoeStore',
    'GroceryStore',
    'ConvenienceStore',
    'DepartmentStore',
    'ElectronicsStore',
    'GardenStore',
    'HardwareStore',
    'PetStore',
    'SportingGoodsStore',
    'ToyStore',
    'LiquorStore',
    'BikeStore',
    'MobilePhoneStore',
    'ShoppingCenter'
  ],
  auto: [
    'AutomotiveBusiness',
    'AutoRepair',
    'AutoDealer',
    'AutoBodyShop',
    'AutoWash',
    'AutoPartsStore',
    'TireShop',
    'GasStation',
    'MotorcycleDealer',
    'MotorcycleRepair'
  ],
  home: [
    'HomeAndConstructionBusiness',
    'Plumber',
    'Electrician',
    'GeneralContractor',
    'RoofingContractor',
    'HousePainter',
    'Locksmith',
    'MovingCompany',
    'DryCleaningOrLaundry',
    'HVACBusiness',
    'SelfStorage'
  ],
  education: ['EducationalOrganization', 'School', 'ChildCare', 'Preschool', 'CollegeOrUniversity'],
  events: [
    'EntertainmentBusiness',
    'EventVenue',
    'NightClub',
    'Museum',
    'AmusementPark',
    'MovieTheater',
    'ComedyClub',
    'BowlingAlley'
  ],
  nonprofit: ['NGO', 'PlaceOfWorship']
}
const SCHEMA_TRADE = new Map(
  Object.entries(BY_SCHEMA).flatMap(([trade, types]) => types.map((t) => [t, trade]))
)
/** Every schema.org business type a trade is known for, plus the bare `LocalBusiness`. */
export const SCHEMA_BUSINESS_TYPES = Object.freeze(['LocalBusiness', ...SCHEMA_TRADE.keys()])

/**
 * The trade a business's own website states (its schema.org `@type`), or `other` for `LocalBusiness` and anything
 * this table does not name.
 * @param {string | null | undefined} type
 */
export function tradeOfSchemaType(type) {
  return SCHEMA_TRADE.get(type) ?? 'other'
}
const SCHEMA_TRADE_LOOSE = new Map([...SCHEMA_TRADE].map(([type, trade]) => [type.toLowerCase(), trade]))

/**
 * The trade a stated category names, whoever stated it: a trade code, a Google Places type, a schema.org type or a
 * cuisine, in any case and with spaces or hyphens for underscores. A category this cannot place is `other`; no
 * category at all is null.
 * @param {unknown} category
 * @returns {(typeof TRADES)[number] | null}
 */
export function tradeOfCategory(category) {
  const raw = typeof category === 'string' ? category.trim() : ''
  if (!raw) return null
  const id = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (TRADES.includes(id)) return id
  if (CUISINES.includes(id) || kindOfPrimaryType(id)) return 'food'
  return TRADE_OF.get(id) ?? SCHEMA_TRADE_LOOSE.get(id.replace(/_/g, '')) ?? 'other'
}

/**
 * The trade a place profile's classification derived from a stated category, or null when it rests on no category
 * (Tracy's default for a place stored before categories were).
 * @param {any} profile
 */
export function statedTradeOf(profile) {
  const derived = (profile?.classification?.derivedCategories ?? []).find(
    (f) => f?.value?.taxonomy === 'tracy-trade'
  )
  const code = derived?.value?.code
  if (typeof code !== 'string' || !code) return null
  return code !== 'other' || derived.derivation?.inputRefs?.length ? code : null
}

/**
 * What a place offers when its source does not say. Rule: never guess food once a category says otherwise, so a
 * stated but unplaced category (`other`) offers services, and only a place with no trade at all (null: stored before
 * categories, every one a restaurant) keeps dishes.
 * @param {string | null | undefined} trade
 * @returns {'dish' | 'product' | 'service'}
 */
export function defaultOfferingKind(trade) {
  if (!trade || trade === 'food') return 'dish'
  return trade === 'retail' ? 'product' : 'service'
}

/**
 * The trade a brief speaks in (#1780): the candidate's own trade; else food when the record predates trades and its
 * place types are food types (a restaurant or cafe saved before trades existed); else the trade its Google types name;
 * else food when it holds collected menu items; else `unknown`, which uses neutral words. A missing trade never means
 * food by itself.
 * @param {{candidate?: any, googlePlace?: any, menuItems?: any[]}} input
 * @returns {(typeof TRADES)[number] | 'unknown'}
 */
export function briefTradeOf({ candidate = {}, googlePlace = null, menuItems = [] } = {}) {
  const cand = candidate ?? {}
  if (typeof cand.trade === 'string' && cand.trade.trim()) return cand.trade.trim()
  const types = [
    cand.primaryType,
    ...(Array.isArray(cand.types) ? cand.types : []),
    googlePlace?.primaryType,
    ...(Array.isArray(googlePlace?.types) ? googlePlace.types : [])
  ].filter((t) => typeof t === 'string' && t)
  if (cand.kind || types.some((t) => kindOfPrimaryType(t))) return 'food'
  const trade = tradeOfPlace({ types })
  if (trade !== 'other') return trade
  // A record that says nothing of its trade but holds collected menu items (a hand-off of dishes) stays food.
  return Array.isArray(menuItems) && menuItems.length ? 'food' : 'unknown'
}
