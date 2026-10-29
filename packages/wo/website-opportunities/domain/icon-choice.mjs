// Which glyph of the icon set each item icon shows (spec TracyHQ/tracy#189). The icon set is drawn by the engine
// (`apps/tracy-web/src/lib/icon-glyphs.js`); this module only names glyphs, ranks them for an item and assigns them.
//
// 🔒 NO TWO ITEMS OF ONE SECTION SHOW THE SAME GLYPH. Every item gets a ranked list of candidate glyphs (a model's reading
// of its words first, then the keyword lexicon below); items are assigned in order, each taking its best candidate the
// section has not used yet, else the first neutral mark the section has not used. A section is the entity the icons sit
// in (one module, one article): its repeated items are read side by side, so a repeated glyph says "the same thing".
// 🔒 A MODEL NEVER DRAWS AND NEVER INVENTS A NAME. It returns glyph names from `ICON_SET` only; an unknown name is dropped
// (`validRanking`), and without a model the keyword lexicon ranks alone. Pure and deterministic.
import { foldWords } from './pictures/slot-map.mjs'

/**
 * Every glyph with a meaning: its name, the words that call it, and the broader glyph it refines (`within`), so an item
 * whose words name both ("tennis and padel lessons", "teeth whitening") ranks the finer meaning first.
 * @type {ReadonlyArray<{name: string, words: string[], within?: string}>}
 */
export const ICON_SET = Object.freeze(
  [
    { name: 'racquet', words: ['tennis', 'racquet', 'racket', 'racquets', 'rackets'] },
    { name: 'padel', words: ['padel'], within: 'racquet' },
    { name: 'squash', words: ['squash'], within: 'racquet' },
    { name: 'shuttlecock', words: ['badminton', 'shuttlecock', 'shuttle'], within: 'racquet' },
    { name: 'pickleball', words: ['pickleball'], within: 'racquet' },
    {
      name: 'ball',
      words: [
        'ball',
        'balls',
        'football',
        'soccer',
        'basketball',
        'volleyball',
        'golf',
        'futsal',
        'rugby',
        'cricket'
      ]
    },
    {
      name: 'waves',
      words: [
        'swim',
        'swimming',
        'swimmers',
        'pool',
        'aqua',
        'aquatic',
        'water',
        'surf',
        'surfing',
        'diving',
        'beach'
      ]
    },
    {
      name: 'dumbbell',
      words: [
        'fitness',
        'gym',
        'strength',
        'workout',
        'workouts',
        'training',
        'weights',
        'crossfit',
        'bootcamp'
      ]
    },
    {
      name: 'kettlebell',
      words: ['kettlebell', 'kettlebells', 'functional', 'hiit', 'circuit'],
      within: 'dumbbell'
    },
    { name: 'yoga-mat', words: ['mat', 'mats', 'stretch', 'stretching', 'mobility', 'flexibility'] },
    { name: 'lotus', words: ['yoga', 'pilates', 'meditation', 'mindfulness', 'breathwork'] },
    {
      name: 'running',
      words: ['running', 'run', 'runners', 'marathon', 'jogging', 'cardio', 'athletics', 'sprint']
    },
    { name: 'bike', words: ['cycling', 'bike', 'bikes', 'bicycle', 'spin', 'spinning'] },
    {
      name: 'trophy',
      words: [
        'tournament',
        'tournaments',
        'competition',
        'competitions',
        'league',
        'leagues',
        'championship',
        'trophy'
      ]
    },
    { name: 'spa', words: ['spa', 'wellness', 'relax', 'relaxation', 'sauna', 'hammam'] },
    { name: 'stones', words: ['massage', 'massages', 'stone', 'stones', 'reflexology'], within: 'spa' },
    { name: 'face', words: ['facial', 'facials', 'skincare', 'skin', 'face'], within: 'spa' },
    {
      name: 'tooth',
      words: ['dental', 'dentist', 'dentistry', 'teeth', 'tooth', 'hygiene', 'hygienist', 'gums']
    },
    {
      name: 'braces',
      words: ['braces', 'orthodontic', 'orthodontics', 'aligner', 'aligners'],
      within: 'tooth'
    },
    { name: 'whitening', words: ['whitening', 'bleaching', 'smile'], within: 'tooth' },
    { name: 'implant', words: ['implant', 'implants', 'crown', 'crowns'], within: 'tooth' },
    {
      name: 'stethoscope',
      words: ['doctor', 'doctors', 'gp', 'medical', 'clinic', 'checkup', 'checkups', 'physician', 'diagnosis']
    },
    {
      name: 'heart',
      words: [
        'care',
        'health',
        'therapy',
        'physio',
        'physiotherapy',
        'nursing',
        'cardiology',
        'wedding',
        'weddings'
      ]
    },
    { name: 'pill', words: ['pharmacy', 'medicine', 'medicines', 'pharmacist', 'vitamins', 'supplements'] },
    {
      name: 'scissors',
      words: [
        'hair',
        'haircut',
        'haircuts',
        'barber',
        'barbers',
        'salon',
        'cut',
        'styling',
        'trim',
        'hairdresser'
      ]
    },
    { name: 'lipstick', words: ['makeup', 'lipstick', 'cosmetics', 'beauty'] },
    { name: 'nail-polish', words: ['nail', 'nails', 'manicure', 'pedicure', 'polish'] },
    {
      name: 'cake',
      words: [
        'cake',
        'cakes',
        'dessert',
        'desserts',
        'cupcake',
        'cupcakes',
        'birthday',
        'patisserie',
        'sweets'
      ]
    },
    {
      name: 'bread',
      words: [
        'bread',
        'breads',
        'loaf',
        'loaves',
        'sourdough',
        'bakery',
        'baking',
        'baguette',
        'sandwich',
        'sandwiches'
      ]
    },
    {
      name: 'croissant',
      words: ['croissant', 'croissants', 'pastry', 'pastries', 'viennoiserie'],
      within: 'bread'
    },
    { name: 'cup', words: ['coffee', 'tea', 'cafe', 'espresso', 'drinks', 'juice', 'latte', 'cappuccino'] },
    {
      name: 'coffee-bean',
      words: ['bean', 'beans', 'roast', 'roastery', 'roasting', 'barista'],
      within: 'cup'
    },
    { name: 'pizza', words: ['pizza', 'pizzas', 'pizzeria'] },
    { name: 'wine', words: ['wine', 'wines', 'bar', 'cocktail', 'cocktails', 'beer', 'pub', 'winery'] },
    {
      name: 'utensils',
      words: [
        'food',
        'meal',
        'meals',
        'restaurant',
        'dinner',
        'lunch',
        'breakfast',
        'menu',
        'kitchen',
        'catering',
        'dining'
      ]
    },
    {
      name: 'calendar',
      words: [
        'booking',
        'bookings',
        'schedule',
        'appointment',
        'appointments',
        'reservation',
        'reservations',
        'event',
        'events',
        'timetable'
      ]
    },
    { name: 'clock', words: ['hours', 'opening', 'time', 'express', 'quick', 'minutes'] },
    {
      name: 'book',
      words: [
        'lesson',
        'lessons',
        'course',
        'courses',
        'class',
        'classes',
        'tutoring',
        'learn',
        'learning',
        'library'
      ]
    },
    {
      name: 'graduation',
      words: [
        'school',
        'academy',
        'education',
        'university',
        'graduation',
        'diploma',
        'certification',
        'qualification'
      ]
    },
    {
      name: 'child',
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
        'youth'
      ]
    },
    {
      name: 'people',
      words: ['family', 'families', 'group', 'groups', 'team', 'teams', 'community', 'adults', 'adult']
    },
    {
      name: 'house',
      words: [
        'home',
        'house',
        'property',
        'properties',
        'apartment',
        'apartments',
        'realty',
        'rental',
        'rentals',
        'cleaning'
      ]
    },
    {
      name: 'wrench',
      words: ['repair', 'repairs', 'fix', 'maintenance', 'installation', 'mechanic', 'garage', 'servicing']
    },
    { name: 'drop', words: ['plumbing', 'plumber', 'leak', 'leaks', 'drain', 'drains', 'pipes'] },
    {
      name: 'plug',
      words: ['electrical', 'electrician', 'electric', 'wiring', 'power', 'lighting', 'sockets']
    },
    {
      name: 'paint-roller',
      words: ['painting', 'painter', 'paint', 'decorating', 'decorator', 'renovation', 'renovations']
    },
    {
      name: 'truck',
      words: ['delivery', 'deliveries', 'moving', 'removals', 'shipping', 'logistics', 'freight', 'courier']
    },
    {
      name: 'car',
      words: ['car', 'cars', 'auto', 'driving', 'taxi', 'transport', 'vehicle', 'vehicles', 'parking']
    },
    { name: 'key', words: ['key', 'keys'] },
    { name: 'lock', words: ['lock', 'locks', 'locksmith', 'lockout', 'safe', 'safes'] },
    {
      name: 'shield',
      words: ['security', 'insurance', 'safety', 'protection', 'legal', 'guarantee', 'warranty']
    },
    {
      name: 'paw',
      words: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'vet', 'veterinary', 'grooming', 'puppy']
    },
    {
      name: 'leaf',
      words: [
        'garden',
        'gardening',
        'organic',
        'plant',
        'plants',
        'nature',
        'landscaping',
        'florist',
        'eco',
        'vegan'
      ]
    },
    {
      name: 'gem',
      words: ['jewellery', 'jewelry', 'ring', 'rings', 'diamond', 'diamonds', 'gold', 'luxury']
    },
    {
      name: 'gift',
      words: ['gift', 'gifts', 'voucher', 'vouchers', 'present', 'presents', 'hamper', 'hampers']
    },
    {
      name: 'bed',
      words: ['hotel', 'room', 'rooms', 'stay', 'stays', 'accommodation', 'bed', 'beds', 'guesthouse']
    },
    {
      name: 'map-pin',
      words: ['location', 'locations', 'visit', 'directions', 'address', 'area', 'areas', 'branch']
    },
    { name: 'phone', words: ['call', 'calls', 'phone', 'consultation', 'consultations', 'hotline'] },
    { name: 'music', words: ['music', 'dance', 'dancing', 'singing', 'piano', 'guitar'] },
    { name: 'camera', words: ['photo', 'photos', 'photography', 'video', 'studio', 'film'] },
    { name: 'star', words: ['premium', 'award', 'awards', 'quality', 'vip', 'membership', 'members'] }
  ].map((g) => Object.freeze({ ...g, words: Object.freeze(g.words) }))
)

/**
 * The marks an item takes when no meaning fits, in the order a section uses them: distinct shapes with no meaning, so items
 * nothing matches still differ from each other. The first is the mark the decor plan has always used.
 */
export const NEUTRAL_GLYPHS = Object.freeze(['check', 'spark', 'circle-dot', 'diamond', 'hexagon'])

/** Every glyph name a ranking may hold: the meanings, then the neutral marks. */
export const ICON_NAMES = Object.freeze([...ICON_SET.map((g) => g.name), ...NEUTRAL_GLYPHS])

/** The most glyphs one item's ranking keeps. */
export const RANKING_MAX = 5

const byWord = new Map()
for (const g of ICON_SET) for (const w of g.words) if (!byWord.has(w)) byWord.set(w, g.name)
const withinOf = new Map(ICON_SET.filter((g) => g.within).map((g) => [g.name, g.within]))
const known = new Set(ICON_NAMES)

/** The glyph a single folded word calls, a plural read as its singular; null for none. */
function glyphOfWord(word) {
  return byWord.get(word) ?? (word.endsWith('s') ? (byWord.get(word.slice(0, -1)) ?? null) : null)
}

/**
 * Every glyph a text's words call, in the text's own order, each finer meaning moved before the broader one it refines.
 * @param {unknown} text
 * @returns {string[]}
 */
export function keywordRanking(text) {
  const out = []
  for (const word of foldWords(text)) {
    const hit = glyphOfWord(word)
    if (hit && !out.includes(hit)) out.push(hit)
  }
  for (const [finer, broader] of withinOf) {
    const f = out.indexOf(finer)
    const b = out.indexOf(broader)
    if (f > b && b >= 0) {
      out.splice(f, 1)
      out.splice(b, 0, finer)
    }
  }
  return out
}

/**
 * A ranking as given (by a model), cut to the glyph names the set draws: unknown names and repeats dropped, at most
 * {@link RANKING_MAX} kept. Never throws.
 * @param {unknown} list
 * @returns {string[]}
 */
export function validRanking(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (known.has(name) && !out.includes(name)) out.push(name)
    if (out.length >= RANKING_MAX) break
  }
  return out
}

/**
 * One glyph per item, never one glyph twice in a section. Items are taken in the order given (the page's order); each takes
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
    const pick = (item.candidates ?? []).find((c) => known.has(c.glyph) && !taken.has(c.glyph))
    const neutral =
      NEUTRAL_GLYPHS.find((g) => !taken.has(g)) ?? NEUTRAL_GLYPHS[taken.size % NEUTRAL_GLYPHS.length]
    const glyph = pick?.glyph ?? neutral
    taken.add(glyph)
    out.set(item.id, { glyph, source: pick ? (pick.source ?? null) : null })
  }
  return out
}

/** The instruction of the icon question: the model names glyphs of the menu, never draws, never explains. */
export const ICON_QUESTION_SYSTEM = [
  'You choose icons for the items of a small business website. Each item has an id and its words (a title, maybe a',
  'description). The icon menu lists every icon by name with the meanings it stands for.',
  'For each item, rank up to 5 icon names from the menu that best show what THIS item is about, best first. Prefer the',
  "most specific icon (a padel paddle for padel, braces for orthodontics); use the business's trade only to read",
  'ambiguous words. Items of one section should not need the same icon: when two items mean different things, rank',
  'different icons first. Use only names from the menu. Answer with one JSON object and nothing else:',
  '{"items": {"<item id>": ["<icon name>", ...]}}'
].join(' ')

/**
 * The icon question for a model, as `{system, input}`.
 * @param {{items: Array<{id: string, section: string, words: string[]}>, trade?: string | null, business?: string | null}} q
 */
export function iconQuestion({ items, trade = null, business = null }) {
  return {
    system: ICON_QUESTION_SYSTEM,
    input: {
      ...(business ? { business } : {}),
      ...(trade ? { trade } : {}),
      menu: ICON_SET.map((g) => ({ name: g.name, means: g.words.slice(0, 8).join(', ') })),
      items: items.map((i) => ({ id: i.id, section: i.section, words: i.words }))
    }
  }
}

/**
 * The model's answer as rankings by item id: only the ids asked, only names of the set. Null when the answer holds no
 * usable ranking at all.
 * @param {Record<string, unknown> | null} answer - the JSON object of the answer
 * @param {string[]} ids
 * @returns {Record<string, string[]> | null}
 */
export function iconAnswerOf(answer, ids) {
  const items = answer && typeof answer === 'object' ? /** @type {any} */ (answer).items : null
  if (!items || typeof items !== 'object' || Array.isArray(items)) return null
  /** @type {Record<string, string[]>} */
  const out = {}
  for (const id of ids) {
    const ranked = validRanking(items[id])
    if (ranked.length) out[id] = ranked
  }
  return Object.keys(out).length ? out : null
}
