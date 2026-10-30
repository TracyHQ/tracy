// Which icon each item icon shows (spec TracyHQ/tracy#189). The icons are Phosphor Icons (`@phosphor-icons/core`, MIT),
// rendered by the engine (`apps/tracy-web/src/lib/icon-glyphs.js`); this module only names icons, shortlists them for an
// item, ranks them and assigns them. The catalog (name, tags, categories of every icon) is handed in by the engine, so the
// domain stays free of the icon package.
//
// 🔒 NO TWO ITEMS OF ONE SECTION SHOW THE SAME ICON. Every item gets a ranked list of candidate icons (a model's reading
// of its words first, then the curated lexicon, then catalog names its words say); items are assigned in order, each
// taking its best candidate the section has not used yet, else the first neutral mark the section has not used. A section
// is the entity the icons sit in (one module, one article): its repeated items are read side by side.
// 🔒 A MODEL NEVER DRAWS AND NEVER INVENTS A NAME. Each item's menu is a shortlist of catalog names (`iconShortlist`, at
// most {@link MENU_MAX}); the model ranks names from it, and a name outside the item's menu is dropped (`validRanking`).
// Without a model the lexicon and catalog names rank alone. Pure and deterministic.
import { foldWords } from './pictures/slot-map.mjs'

/**
 * The curated lexicon: words a small business site uses, each group with the catalog icons that show it, best first.
 * Every name is a Phosphor icon (a test checks each against the catalog). A `broad` group says something about any
 * business (lessons, a group, the hours): its icons rank after those of the item's own subject.
 * @type {ReadonlyArray<{words: readonly string[], icons: readonly string[], broad?: boolean}>}
 */
export const ICON_SET = Object.freeze(
  [
    { words: ['tennis', 'racquet', 'racket', 'racquets', 'rackets'], icons: ['racquet', 'tennis-ball'] },
    // A padel or pickleball racket is a racket: the table-tennis paddle is another sport (#189).
    { words: ['padel', 'paddle', 'pickleball'], icons: ['racquet', 'tennis-ball'] },
    { words: ['squash'], icons: ['tennis-ball', 'racquet'] },
    { words: ['badminton', 'shuttlecock'], icons: ['racquet', 'person-simple-throw'] },
    { words: ['ping', 'pong'], icons: ['ping-pong'] },
    { words: ['football', 'soccer', 'futsal'], icons: ['soccer-ball'] },
    { words: ['basketball'], icons: ['basketball', 'court-basketball'] },
    { words: ['volleyball'], icons: ['volleyball'] },
    { words: ['golf'], icons: ['golf'] },
    { words: ['bowling'], icons: ['bowling-ball'] },
    { words: ['hockey'], icons: ['hockey'] },
    { words: ['boxing', 'kickboxing', 'sparring'], icons: ['boxing-glove', 'hand-fist'] },
    { words: ['ball', 'balls', 'rugby', 'cricket', 'baseball'], icons: ['football', 'tennis-ball'] },
    {
      words: ['swim', 'swimming', 'swimmers', 'aquatic', 'aqua', 'diving'],
      icons: ['person-simple-swim', 'swimming-pool', 'waves']
    },
    { words: ['pool', 'pools'], icons: ['swimming-pool', 'waves'] },
    { words: ['water', 'surf', 'surfing', 'beach', 'sea'], icons: ['drop', 'waves'] },
    { words: ['sailing', 'boat', 'boats', 'yacht'], icons: ['sailboat', 'boat', 'anchor'] },
    {
      words: ['fitness', 'gym', 'strength', 'workout', 'workouts', 'weights', 'crossfit', 'bootcamp'],
      icons: ['barbell', 'heartbeat']
    },
    {
      broad: true,
      words: ['training', 'trainer', 'coaching', 'coach', 'coaches'],
      icons: ['chalkboard-teacher', 'target', 'barbell']
    },
    { words: ['hiit', 'circuit', 'functional', 'cardio'], icons: ['heartbeat', 'timer', 'barbell'] },
    {
      words: ['yoga', 'pilates', 'meditation', 'mindfulness', 'breathwork'],
      icons: ['flower-lotus', 'person-simple-tai-chi']
    },
    {
      words: ['stretch', 'stretching', 'mobility', 'flexibility'],
      icons: ['person-arms-spread', 'person-simple-tai-chi']
    },
    {
      words: ['running', 'run', 'runners', 'marathon', 'jogging', 'athletics'],
      icons: ['person-simple-run', 'sneaker']
    },
    {
      words: ['cycling', 'bike', 'bikes', 'bicycle', 'spin', 'spinning'],
      icons: ['person-simple-bike', 'bicycle']
    },
    { words: ['hiking', 'hike', 'trekking'], icons: ['person-simple-hike', 'mountains'] },
    {
      words: [
        'tournament',
        'tournaments',
        'competition',
        'competitions',
        'league',
        'leagues',
        'championship',
        'trophy'
      ],
      icons: ['trophy', 'medal']
    },
    {
      words: ['spa', 'wellness', 'relax', 'relaxation', 'sauna', 'hammam'],
      icons: ['flower-lotus', 'leaf', 'drop']
    },
    { words: ['massage', 'massages', 'reflexology'], icons: ['hand-heart', 'hand-palm', 'flower-lotus'] },
    { words: ['facial', 'facials', 'skincare', 'skin', 'face'], icons: ['smiley', 'drop', 'sparkle'] },
    {
      words: ['dental', 'dentist', 'dentistry', 'teeth', 'tooth', 'hygiene', 'hygienist', 'gums'],
      icons: ['tooth']
    },
    { words: ['braces', 'orthodontic', 'orthodontics', 'aligner', 'aligners'], icons: ['tooth', 'smiley'] },
    { words: ['whitening', 'bleaching', 'smile', 'smiles'], icons: ['sparkle', 'smiley', 'tooth'] },
    { words: ['implant', 'implants', 'crown', 'crowns'], icons: ['tooth', 'shield-plus', 'crown-simple'] },
    {
      words: [
        'doctor',
        'doctors',
        'gp',
        'medical',
        'clinic',
        'checkup',
        'checkups',
        'physician',
        'diagnosis',
        'exam'
      ],
      icons: ['stethoscope', 'first-aid', 'heartbeat']
    },
    {
      broad: true,
      words: ['care', 'health', 'therapy', 'nursing', 'cardiology'],
      icons: ['heartbeat', 'hand-heart', 'heart']
    },
    {
      words: ['physio', 'physiotherapy', 'rehab', 'rehabilitation', 'injury'],
      icons: ['bone', 'hand-heart', 'heartbeat']
    },
    {
      words: ['pharmacy', 'medicine', 'medicines', 'pharmacist', 'vitamins', 'supplements'],
      icons: ['pill', 'first-aid-kit']
    },
    { words: ['vaccine', 'vaccination', 'injection', 'injections'], icons: ['syringe'] },
    { words: ['eye', 'eyes', 'optician', 'optical', 'glasses', 'vision'], icons: ['eyeglasses', 'eye'] },
    {
      words: ['hair', 'haircut', 'haircuts', 'barber', 'barbers', 'salon', 'styling', 'trim', 'hairdresser'],
      icons: ['scissors', 'hair-dryer']
    },
    { words: ['blowdry', 'blow', 'dryer'], icons: ['hair-dryer'] },
    { words: ['makeup', 'cosmetics', 'beauty', 'lipstick'], icons: ['sparkle', 'palette', 'eyedropper'] },
    { words: ['nail', 'nails', 'manicure', 'pedicure', 'polish'], icons: ['hand', 'paint-brush', 'sparkle'] },
    { words: ['cake', 'cakes', 'birthday', 'patisserie', 'cupcake', 'cupcakes'], icons: ['cake'] },
    { words: ['dessert', 'desserts', 'sweets', 'ice', 'gelato'], icons: ['ice-cream', 'cookie', 'cake'] },
    { words: ['cookie', 'cookies', 'biscuits'], icons: ['cookie'] },
    {
      words: ['bread', 'breads', 'loaf', 'loaves', 'sourdough', 'bakery', 'baking', 'baguette'],
      icons: ['bread', 'grains']
    },
    {
      words: ['croissant', 'croissants', 'pastry', 'pastries', 'viennoiserie'],
      icons: ['cookie', 'bread', 'cake']
    },
    { words: ['coffee', 'espresso', 'cafe', 'latte', 'cappuccino'], icons: ['coffee', 'coffee-bean'] },
    {
      words: ['bean', 'beans', 'roast', 'roastery', 'roasting', 'barista'],
      icons: ['coffee-bean', 'coffee']
    },
    { words: ['tea', 'teas'], icons: ['tea-bag', 'coffee'] },
    { words: ['pizza', 'pizzas', 'pizzeria'], icons: ['pizza'] },
    { words: ['burger', 'burgers'], icons: ['hamburger'] },
    { words: ['seafood', 'fish', 'sushi'], icons: ['fish', 'shrimp'] },
    { words: ['wine', 'wines', 'winery'], icons: ['wine'] },
    { words: ['bar', 'cocktail', 'cocktails', 'drinks'], icons: ['martini', 'wine', 'beer-stein'] },
    { words: ['beer', 'pub', 'brewery'], icons: ['beer-stein', 'beer-bottle'] },
    {
      words: ['food', 'meal', 'meals', 'restaurant', 'dinner', 'lunch', 'menu', 'dining'],
      icons: ['fork-knife', 'bowl-food']
    },
    { words: ['breakfast', 'brunch', 'eggs'], icons: ['egg', 'coffee'] },
    { words: ['kitchen', 'chef', 'cooking', 'catering'], icons: ['chef-hat', 'cooking-pot'] },
    {
      words: [
        'booking',
        'bookings',
        'schedule',
        'appointment',
        'appointments',
        'reservation',
        'reservations',
        'timetable'
      ],
      icons: ['calendar-check', 'calendar']
    },
    {
      broad: true,
      words: ['event', 'events', 'party', 'parties', 'celebration', 'celebrations'],
      icons: ['confetti', 'calendar-star']
    },
    {
      broad: true,
      words: ['hours', 'opening', 'time', 'express', 'quick', 'minutes'],
      icons: ['clock', 'timer']
    },
    {
      broad: true,
      words: ['lesson', 'lessons', 'class', 'classes', 'tutoring', 'workshop', 'workshops'],
      icons: ['chalkboard-teacher', 'book-open']
    },
    {
      broad: true,
      words: ['course', 'courses', 'learn', 'learning', 'library', 'reading'],
      icons: ['book-open', 'books']
    },
    {
      words: [
        'school',
        'academy',
        'education',
        'university',
        'graduation',
        'diploma',
        'certification',
        'certified',
        'qualified'
      ],
      icons: ['graduation-cap', 'student', 'certificate']
    },
    {
      words: [
        'kids',
        'kid',
        'children',
        'child',
        'junior',
        'juniors',
        'baby',
        'babies',
        'toddler',
        'toddlers',
        'youth',
        'little'
      ],
      icons: ['baby', 'baby-carriage', 'smiley']
    },
    {
      broad: true,
      words: [
        'family',
        'families',
        'group',
        'groups',
        'team',
        'teams',
        'community',
        'adults',
        'adult',
        'friends'
      ],
      icons: ['users-three', 'users']
    },
    { broad: true, words: ['private', 'personal', 'individual', 'one'], icons: ['user', 'user-focus'] },
    {
      words: ['home', 'house', 'property', 'properties', 'realty', 'rental', 'rentals'],
      icons: ['house', 'key']
    },
    {
      words: ['apartment', 'apartments', 'building', 'office', 'offices'],
      icons: ['building-apartment', 'building-office']
    },
    { words: ['cleaning', 'clean', 'housekeeping'], icons: ['broom', 'sparkle'] },
    { words: ['laundry', 'washing', 'ironing'], icons: ['washing-machine', 't-shirt'] },
    {
      words: ['repair', 'repairs', 'fix', 'maintenance', 'mechanic', 'garage', 'servicing'],
      icons: ['wrench', 'toolbox']
    },
    {
      words: ['installation', 'install', 'fitting', 'carpentry', 'handyman'],
      icons: ['hammer', 'screwdriver', 'toolbox']
    },
    {
      words: ['plumbing', 'plumber', 'leak', 'leaks', 'drain', 'drains', 'pipes'],
      icons: ['pipe-wrench', 'drop', 'pipe']
    },
    {
      words: ['electrical', 'electrician', 'electric', 'wiring', 'power', 'sockets'],
      icons: ['plug', 'lightning']
    },
    { words: ['lighting', 'lights', 'lamps'], icons: ['lightbulb', 'lamp-pendant'] },
    {
      words: ['painting', 'painter', 'paint', 'decorating', 'decorator'],
      icons: ['paint-roller', 'paint-brush']
    },
    {
      words: ['renovation', 'renovations', 'construction', 'builder', 'builders'],
      icons: ['hammer', 'house-line']
    },
    {
      broad: true,
      words: ['design', 'interior', 'interiors', 'art', 'artist'],
      icons: ['palette', 'pencil-ruler']
    },
    {
      words: ['delivery', 'deliveries', 'moving', 'removals', 'shipping', 'logistics', 'freight', 'courier'],
      icons: ['truck', 'package']
    },
    {
      words: ['car', 'cars', 'auto', 'driving', 'taxi', 'vehicle', 'vehicles', 'chauffeur'],
      icons: ['car', 'steering-wheel']
    },
    { words: ['parking'], icons: ['car-profile', 'map-pin'] },
    { words: ['tyres', 'tires', 'tyre', 'tire'], icons: ['tire'] },
    { words: ['key', 'keys'], icons: ['key'] },
    { words: ['lock', 'locks', 'locksmith', 'lockout', 'locked'], icons: ['lock', 'lock-key', 'keyhole'] },
    { words: ['door', 'doors', 'entry'], icons: ['door', 'door-open'] },
    { words: ['safe', 'safes', 'security', 'alarm', 'alarms'], icons: ['shield-check', 'lock-key', 'bell'] },
    {
      words: ['insurance', 'safety', 'protection', 'guarantee', 'warranty'],
      icons: ['shield-check', 'umbrella']
    },
    { words: ['legal', 'law', 'lawyer', 'lawyers', 'contract', 'contracts'], icons: ['scales', 'gavel'] },
    {
      words: ['accounting', 'accountant', 'tax', 'taxes', 'bookkeeping', 'finance'],
      icons: ['calculator', 'coins']
    },
    { words: ['pet', 'pets', 'grooming', 'puppy', 'puppies'], icons: ['paw-print', 'dog'] },
    { words: ['dog', 'dogs'], icons: ['dog', 'paw-print'] },
    { words: ['cat', 'cats'], icons: ['cat', 'paw-print'] },
    { words: ['vet', 'veterinary', 'animal', 'animals'], icons: ['paw-print', 'first-aid'] },
    { words: ['horse', 'horses', 'riding', 'equestrian'], icons: ['horse'] },
    { words: ['garden', 'gardening', 'landscaping', 'lawn'], icons: ['plant', 'tree', 'leaf'] },
    { words: ['organic', 'nature', 'eco', 'vegan', 'natural', 'green'], icons: ['leaf', 'plant'] },
    {
      words: ['plant', 'plants', 'florist', 'flowers', 'flower', 'bouquet', 'bouquets'],
      icons: ['flower-tulip', 'flower', 'potted-plant']
    },
    {
      words: ['jewellery', 'jewelry', 'ring', 'rings', 'diamond', 'diamonds', 'gold', 'luxury'],
      icons: ['diamond', 'crown-simple']
    },
    {
      words: ['gift', 'gifts', 'voucher', 'vouchers', 'present', 'presents', 'hamper', 'hampers'],
      icons: ['gift']
    },
    { words: ['shop', 'store', 'boutique', 'retail', 'shopping'], icons: ['storefront', 'shopping-bag'] },
    {
      words: ['clothing', 'clothes', 'fashion', 'apparel', 'tailoring', 'tailor'],
      icons: ['t-shirt', 'coat-hanger', 'dress']
    },
    {
      words: ['sportswear', 'swimwear', 'swimsuit', 'activewear', 'outfit', 'outfits'],
      icons: ['t-shirt', 'shirt-folded']
    },
    {
      words: ['shoes', 'shoe', 'sneakers', 'sneaker', 'trainers', 'footwear'],
      icons: ['sneaker', 'sneaker-move']
    },
    { words: ['bottle', 'bottles', 'hydration', 'drink'], icons: ['drop', 'pint-glass'] },
    { words: ['towel', 'towels'], icons: ['towel'] },
    { words: ['goggles'], icons: ['goggles'] },
    { words: ['cap', 'caps', 'hat', 'hats'], icons: ['baseball-cap'] },
    { words: ['sunscreen', 'sunglasses'], icons: ['sunglasses', 'sun'] },
    {
      words: ['hotel', 'room', 'rooms', 'stay', 'stays', 'accommodation', 'bed', 'beds', 'guesthouse'],
      icons: ['bed', 'call-bell']
    },
    {
      words: ['travel', 'tour', 'tours', 'trip', 'trips', 'holiday', 'holidays'],
      icons: ['airplane-tilt', 'suitcase-rolling', 'map-trifold']
    },
    {
      broad: true,
      words: [
        'location',
        'locations',
        'visit',
        'directions',
        'address',
        'area',
        'areas',
        'branch',
        'branches'
      ],
      icons: ['map-pin', 'map-trifold']
    },
    { words: ['call', 'calls', 'phone', 'hotline'], icons: ['phone-call', 'phone'] },
    {
      broad: true,
      words: ['consultation', 'consultations', 'advice', 'chat', 'support'],
      icons: ['chats', 'chat-circle-text']
    },
    { broad: true, words: ['email', 'newsletter', 'contact'], icons: ['envelope-simple'] },
    { words: ['music', 'singing', 'band', 'concert'], icons: ['music-notes', 'microphone-stage'] },
    { words: ['piano', 'keyboard'], icons: ['piano-keys'] },
    { words: ['guitar'], icons: ['guitar'] },
    { words: ['dance', 'dancing', 'ballet'], icons: ['music-notes', 'person-arms-spread'] },
    { words: ['photo', 'photos', 'photography', 'photographer', 'studio'], icons: ['camera', 'aperture'] },
    { words: ['video', 'film', 'films', 'filming'], icons: ['video-camera', 'film-slate'] },
    {
      words: ['web', 'website', 'websites', 'online', 'digital', 'software', 'app', 'apps'],
      icons: ['globe', 'laptop', 'code']
    },
    { words: ['computer', 'computers', 'it', 'tech', 'technology'], icons: ['desktop', 'laptop'] },
    {
      broad: true,
      words: ['marketing', 'growth', 'sales', 'results'],
      icons: ['chart-line-up', 'megaphone']
    },
    {
      broad: true,
      words: ['premium', 'award', 'awards', 'quality', 'vip', 'best', 'rated'],
      icons: ['star', 'medal', 'crown-simple']
    },
    {
      broad: true,
      words: ['membership', 'members', 'member', 'loyalty'],
      icons: ['identification-card', 'star']
    },
    {
      broad: true,
      words: ['price', 'prices', 'pricing', 'affordable', 'offer', 'offers', 'discount', 'deals'],
      icons: ['tag', 'percent']
    },
    { broad: true, words: ['payment', 'payments', 'pay', 'card'], icons: ['credit-card', 'wallet'] },
    { broad: true, words: ['equipment', 'gear', 'kit'], icons: ['backpack', 'toolbox'] },
    {
      broad: true,
      words: ['outdoor', 'outdoors', 'camp', 'camping', 'camps'],
      icons: ['tent', 'campfire', 'sun']
    },
    { broad: true, words: ['summer', 'sun', 'sunny'], icons: ['sun', 'sun-horizon'] },
    {
      broad: true,
      words: ['indoor', 'courts', 'court', 'facility', 'facilities', 'venue'],
      icons: ['buildings', 'court-basketball']
    },
    { words: ['wedding', 'weddings', 'love'], icons: ['heart', 'champagne'] },
    { words: ['religious', 'church', 'faith', 'prayer'], icons: ['church', 'hands-praying'] },
    { broad: true, words: ['friendly', 'fun', 'social', 'enjoy'], icons: ['smiley', 'hand-waving'] },
    {
      broad: true,
      words: ['progress', 'improve', 'improvement', 'level', 'levels', 'goals', 'goal'],
      icons: ['target', 'chart-line-up']
    }
  ].map((g) =>
    Object.freeze({ words: Object.freeze(g.words), icons: Object.freeze(g.icons), broad: g.broad === true })
  )
)

/**
 * The marks an item takes when no meaning fits, in the order a section uses them: distinct shapes without a subject, so
 * items nothing matches still differ from each other. The first is the mark the decor plan has always used.
 */
export const NEUTRAL_GLYPHS = Object.freeze([
  'check-circle',
  'star',
  'sparkle',
  'circle',
  'diamond',
  'hexagon'
])

/** Every name the curated lexicon and the neutral marks hold. */
export const ICON_NAMES = Object.freeze([
  ...new Set([...ICON_SET.flatMap((g) => g.icons), ...NEUTRAL_GLYPHS])
])

/** The most icons one item's ranking keeps, and the most names one item's menu offers a model. */
export const RANKING_MAX = 5
export const MENU_MAX = 60

const byWord = new Map()
for (const g of ICON_SET) for (const w of g.words) if (!byWord.has(w)) byWord.set(w, g)

/** The lexicon group a single folded word calls, a plural read as its singular; null for none. */
function groupOfWord(word) {
  return byWord.get(word) ?? (word.endsWith('s') ? (byWord.get(word.slice(0, -1)) ?? null) : null)
}

/** A word's forms that a catalog name or tag may hold: the word and its singular. */
const formsOf = (word) => (word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word])

/**
 * Every icon a text's words call through the curated lexicon, in the text's own order (each word's icons best first),
 * the icons of its subject words before those of broad words.
 * @param {unknown} text
 * @returns {string[]}
 */
export function keywordRanking(text) {
  const groups = foldWords(text).map(groupOfWord).filter(Boolean)
  const out = []
  for (const g of [...groups.filter((x) => !x.broad), ...groups.filter((x) => x.broad)])
    for (const icon of g.icons) if (!out.includes(icon)) out.push(icon)
  return out
}

/**
 * The catalog an engine hands in, cut to the icons an item may show: brand logos are never an item's subject.
 * @param {Array<{name: string, tags?: string[], categories?: string[]}> | null | undefined} catalog
 */
export function usableCatalog(catalog) {
  return (catalog ?? []).filter(
    (i) =>
      typeof i?.name === 'string' && !i.name.endsWith('-logo') && !(i.categories ?? []).includes('brands')
  )
}

/**
 * The catalog icons whose own name says one of a text's words (a whole part of the name, `tennis` in `tennis-ball`), best
 * matches first: the name's first part, then fewer parts. The fallback a missing model leaves.
 * @param {unknown} text
 * @param {Array<{name: string}>} catalog - `usableCatalog`'s answer
 * @returns {string[]}
 */
export function catalogNameRanking(text, catalog) {
  const words = foldWords(text)
  const scored = []
  for (const icon of catalog ?? []) {
    const parts = icon.name.split('-')
    let best = -1
    words.forEach((word, at) => {
      for (const form of formsOf(word))
        if (form.length > 2 && parts.includes(form)) {
          const score = 1000 - at * 10 - parts.length - (parts[0] === form ? 0 : 3)
          best = Math.max(best, score)
        }
    })
    if (best >= 0) scored.push({ name: icon.name, score: best })
  }
  return scored.sort((a, z) => z.score - a.score || a.name.localeCompare(z.name)).map((s) => s.name)
}

/**
 * An item's menu for a model: the curated lexicon's icons for its words, then catalog icons whose names, then tags, say
 * its words, then those the trade's words call; at most {@link MENU_MAX}, deterministic.
 * @param {{words: string[] | string, trade?: string | null, catalog: Array<{name: string, tags?: string[]}>}} input
 * @returns {string[]}
 */
export function iconShortlist({ words, trade = null, catalog }) {
  const text = Array.isArray(words) ? words.join(' ') : String(words ?? '')
  const out = []
  const add = (name) => {
    if (out.length < MENU_MAX && !out.includes(name) && catalog.some((i) => i.name === name)) out.push(name)
  }
  for (const name of keywordRanking(text)) add(name)
  for (const name of catalogNameRanking(text, catalog)) add(name)
  const tagged = (source, weight) => {
    const folded = foldWords(source).flatMap(formsOf)
    if (!folded.length) return []
    return catalog
      .map((i) => ({
        name: i.name,
        score: (i.tags ?? []).filter((t) => folded.includes(String(t).toLowerCase())).length * weight
      }))
      .filter((s) => s.score > 0)
      .sort((a, z) => z.score - a.score || a.name.localeCompare(z.name))
      .map((s) => s.name)
  }
  for (const name of tagged(text, 2)) add(name)
  if (trade) {
    for (const name of keywordRanking(trade)) add(name)
    for (const name of tagged(trade, 1)) add(name)
  }
  return out
}

/**
 * A ranking as given (by a model), cut to the names allowed: unknown names and repeats dropped, at most
 * {@link RANKING_MAX} kept. Never throws.
 * @param {unknown} list
 * @param {Iterable<string>} [allowed] - the item's menu; the curated names and neutral marks when not given
 * @returns {string[]}
 */
export function validRanking(list, allowed = ICON_NAMES) {
  if (!Array.isArray(list)) return []
  const known = allowed instanceof Set ? allowed : new Set(allowed)
  const out = []
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (known.has(name) && !out.includes(name)) out.push(name)
    if (out.length >= RANKING_MAX) break
  }
  return out
}

/**
 * One icon per item, never one icon twice in a section. Items are taken in the order given (the page's order); each takes
 * its best candidate the section has not used, else the first unused neutral mark (after the last, the neutral marks
 * repeat, as a section can only show so many).
 * @param {Array<{id: string, section: string, candidates: Array<{glyph: string, source?: string}>}>} items
 * @returns {Map<string, {glyph: string, source: string | null}>} by item id; `source` null for a neutral mark
 */
export function assignGlyphs(items) {
  /** @type {Map<string, Set<string>>} */
  const used = new Map()
  const out = new Map()
  for (const item of items) {
    if (out.has(item.id)) continue
    const taken = used.get(item.section) ?? new Set()
    used.set(item.section, taken)
    const pick = (item.candidates ?? []).find(
      (c) => typeof c.glyph === 'string' && c.glyph && !taken.has(c.glyph)
    )
    const neutral =
      NEUTRAL_GLYPHS.find((g) => !taken.has(g)) ?? NEUTRAL_GLYPHS[taken.size % NEUTRAL_GLYPHS.length]
    const glyph = pick?.glyph ?? neutral
    taken.add(glyph)
    out.set(item.id, { glyph, source: pick ? (pick.source ?? null) : null })
  }
  return out
}

/** The instruction of the icon question: the model names icons of each item's menu, never draws, never explains. */
export const ICON_QUESTION_SYSTEM = [
  'You choose icons for the items of a small business website. Each item has an id, its words (a title, maybe a',
  'description) and a menu of icon names to choose from.',
  'For each item, rank up to 5 icon names from ITS OWN menu that best show what THIS item is about, best first. Prefer',
  "the most specific icon; use the business's trade only to read ambiguous words. Items of one section should not need",
  'the same icon: when two items mean different things, rank different icons first. Use only names from the menu of',
  'that item. Answer with one JSON object and nothing else: {"items": {"<item id>": ["<icon name>", ...]}}'
].join(' ')

/**
 * The icon question for a model, as `{system, input}`.
 * @param {{items: Array<{id: string, section: string, words: string[], menu: string[]}>, trade?: string | null,
 *   business?: string | null}} q
 */
export function iconQuestion({ items, trade = null, business = null }) {
  return {
    system: ICON_QUESTION_SYSTEM,
    input: {
      ...(business ? { business } : {}),
      ...(trade ? { trade } : {}),
      items: items.map((i) => ({ id: i.id, section: i.section, words: i.words, menu: i.menu }))
    }
  }
}

/**
 * The model's answer as rankings by item id: only the ids asked, only names of each item's own menu. Null when the
 * answer holds no usable ranking at all.
 * @param {Record<string, unknown> | null} answer - the JSON object of the answer
 * @param {Array<{id: string, menu: string[]}>} items
 * @returns {Record<string, string[]> | null}
 */
export function iconAnswerOf(answer, items) {
  const got = answer && typeof answer === 'object' ? /** @type {any} */ (answer).items : null
  if (!got || typeof got !== 'object' || Array.isArray(got)) return null
  /** @type {Record<string, string[]>} */
  const out = {}
  for (const item of items) {
    const ranked = validRanking(got[item.id], item.menu)
    if (ranked.length) out[item.id] = ranked
  }
  return Object.keys(out).length ? out : null
}
