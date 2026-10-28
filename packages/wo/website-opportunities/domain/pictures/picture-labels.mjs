// What a collected picture is of and what shape it is, from what is known without looking at it: its size, a few
// measured numbers (tracy-web measures them with sharp: `top2Share`, `edgeDensity`, `centreLuminance`) and the words that
// came with it (caption, alt, address). A vision model's labels, when a deployment has one, override the words' guess.
//
// 🔒 A GUESS FROM WORDS IS WEAK AND SAYS SO. A social post's caption is shared by every picture of the post and talks
// about the restaurant, not the photo, so `subjectFrom` says `words` and the planner weighs it below a vision label. A
// picture nothing speaks for is `unknown`, never `other` dressed up as a fact.
import { foldWords } from './slot-map.mjs'

export const LABELS_VERSION = 1

export const SUBJECTS = Object.freeze([
  'food',
  'drink',
  'dessert',
  'interior',
  'exterior',
  'people',
  'event',
  'service-in-action',
  'work-result',
  'equipment',
  'room',
  'product',
  'menu-board',
  'poster',
  'logo',
  'other'
])

const WORDS = {
  food: [
    'food',
    'dish',
    'dishes',
    'seafood',
    'fish',
    'shrimp',
    'prawn',
    'prawns',
    'crab',
    'lobster',
    'squid',
    'octopus',
    'clam',
    'clams',
    'oyster',
    'oysters',
    'scallop',
    'pho',
    'bun',
    'banh',
    'noodle',
    'noodles',
    'rice',
    'soup',
    'salad',
    'steak',
    'burger',
    'burgers',
    'pizza',
    'pasta',
    'sushi',
    'grill',
    'grilled',
    'bbq',
    'chicken',
    'beef',
    'pork',
    'lamb',
    'curry',
    'taco',
    'tacos',
    'breakfast',
    'brunch',
    'lunch',
    'dinner',
    'meal',
    'cuisine',
    'platter',
    'mon',
    'hotpot',
    'roll',
    'rolls',
    'tapas',
    'bread',
    'sandwich'
  ],
  drink: [
    'cocktail',
    'cocktails',
    'drink',
    'drinks',
    'beer',
    'beers',
    'wine',
    'wines',
    'coffee',
    'tea',
    'juice',
    'juices',
    'smoothie',
    'mocktail',
    'mojito',
    'margarita',
    'latte',
    'espresso',
    'phe',
    'tra'
  ],
  dessert: [
    'dessert',
    'desserts',
    'cake',
    'cakes',
    'icecream',
    'gelato',
    'sweet',
    'sweets',
    'pastry',
    'chocolate',
    'kem',
    'flan',
    'tiramisu',
    'pudding'
  ],
  interior: [
    'interior',
    'inside',
    'decor',
    'seating',
    'cozy',
    'cosy',
    'atmosphere',
    'ambience',
    'ambiance',
    'lounge',
    'gian',
    'indoor'
  ],
  exterior: [
    'terrace',
    'rooftop',
    'garden',
    'beach',
    'sunset',
    'facade',
    'storefront',
    'patio',
    'outdoor',
    'outside',
    'entrance',
    'bien',
    'seaside',
    'river',
    'view'
  ],
  people: [
    'chef',
    'chefs',
    'team',
    'staff',
    'owner',
    'guests',
    'customers',
    'family',
    'friends',
    'waiter',
    'waitress',
    'bartender',
    'barista',
    'vien',
    'bep'
  ],
  event: [
    'event',
    'events',
    'party',
    'festival',
    'concert',
    'celebration',
    'christmas',
    'halloween',
    'valentine',
    'birthday',
    'wedding',
    'tet',
    'workshop',
    'dj',
    'live'
  ],
  'menu-board': ['promotion', 'promo', 'discount', 'voucher', 'deal', 'deals', 'combo', 'off']
}
const WORD_SUBJECT = new Map(Object.entries(WORDS).flatMap(([s, ws]) => ws.map((w) => [w, s])))
const PHRASES = [
  ['dessert', /ice cream/],
  ['interior', /dining room|khong gian/],
  ['exterior', /san vuon|ocean view|sea view/],
  ['event', /live music|new year|nhac song|happy hour/],
  ['menu-board', /price list|\d+\s?% off|opening hours|menu board/]
]
/** How much of a caption is read: its opening, where a post says what it shows. */
const CAPTION_CHARS = 280

/** Shape classes by width / height. */
export function aspectClass(aspect) {
  if (aspect >= 1.6) return 'wide'
  if (aspect >= 1.2) return 'landscape'
  if (aspect >= 0.85) return 'square'
  return 'portrait'
}

/** Whether the measured numbers say graphic (poster, menu board, text on a flat ground) rather than photograph (C10). */
export function looksGraphic(features) {
  const top2 = Number(features?.top2Share)
  const edges = Number(features?.edgeDensity)
  if (!Number.isFinite(top2)) return false
  return top2 > 0.68 || (top2 > 0.45 && Number.isFinite(edges) && edges > 0.18)
}

function fold(text) {
  return ` ${String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')} `
}

/** Each subject's share of the words that came with a picture: alt counts twice, the opening of a caption once, its address once. */
export function subjectsFromWords({ caption, alt, sourceUrl } = {}) {
  let path = ''
  try {
    path = sourceUrl ? decodeURIComponent(new URL(sourceUrl).pathname) : ''
  } catch {
    path = ''
  }
  const parts = [
    [String(alt ?? ''), 2],
    [String(caption ?? '').slice(0, CAPTION_CHARS), 1],
    [path.replace(/[-_/.]+/g, ' '), 1]
  ]
  /** @type {Record<string, number>} */
  const hits = {}
  for (const [text, weight] of parts) {
    const folded = fold(text)
    for (const [subject, re] of PHRASES) if (re.test(folded)) hits[subject] = (hits[subject] ?? 0) + weight
    for (const word of foldWords(text)) {
      const subject = WORD_SUBJECT.get(word)
      if (subject) hits[subject] = (hits[subject] ?? 0) + weight
    }
  }
  const total = Object.values(hits).reduce((a, b) => a + b, 0)
  if (total === 0) return {}
  return Object.fromEntries(Object.entries(hits).map(([s, n]) => [s, Number((n / total).toFixed(3))]))
}

/**
 * @param {{id: string, width: number, height: number, caption?: string|null, alt?: string|null, sourceUrl?: string|null,
 *   source?: string, postedAt?: string|null, dhash?: string|null, features?: {top2Share?: number, edgeDensity?: number,
 *   centreLuminance?: number} | null, vision?: any}} picture
 */
export function labelPicture(picture) {
  const width = Number(picture.width) || 0
  const height = Number(picture.height) || 0
  const aspect = width && height ? width / height : 0
  const vision = picture.vision && typeof picture.vision === 'object' ? picture.vision : null
  const fromWords = subjectsFromWords(picture)
  let subjects = fromWords
  let subjectFrom = Object.keys(fromWords).length ? 'words' : 'none'
  if (vision?.subject && SUBJECTS.includes(vision.subject)) {
    subjects = { [vision.subject]: 1 }
    subjectFrom = 'vision'
  }
  const ranked = Object.entries(subjects).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  // A vision model's own graphic flag (#48) is a look, not a guess from numbers: such a picture takes no photo place.
  const isGraphic = vision?.isGraphic === true
  const graphic =
    isGraphic ||
    looksGraphic(picture.features) ||
    vision?.subject === 'poster' ||
    vision?.subject === 'menu-board'
  const textPresence = vision
    ? vision.textPresence === 'present' || vision.hasTextOverlay
      ? 'present'
      : 'absent'
    : graphic
      ? 'present'
      : 'unknown'
  return {
    id: picture.id,
    width,
    height,
    aspect,
    aspectClass: aspect ? aspectClass(aspect) : 'unknown',
    subject: ranked[0]?.[0] ?? 'unknown',
    subjects,
    subjectFrom,
    graphic,
    isGraphic,
    collage: vision?.isCollage === true,
    textPresence,
    quality: typeof vision?.quality === 'string' ? vision.quality : 'unknown',
    focus: typeof vision?.focus === 'string' ? vision.focus : null,
    heroWorthy: typeof vision?.heroWorthy === 'boolean' ? vision.heroWorthy : null,
    centreLuminance: Number.isFinite(Number(picture.features?.centreLuminance))
      ? Number(picture.features.centreLuminance)
      : null,
    words: [
      ...new Set(
        foldWords(
          [picture.alt, String(picture.caption ?? '').slice(0, CAPTION_CHARS), vision?.oneLine]
            .filter(Boolean)
            .join(' ')
        )
      )
    ],
    oneLine: typeof vision?.oneLine === 'string' ? vision.oneLine.slice(0, 120) : null,
    postedAt: picture.postedAt ?? null,
    dhash: typeof picture.dhash === 'string' ? picture.dhash : null,
    source: picture.source ?? null,
    // The menu dish this photo is accepted as (`dish-photos.mjs`), or null.
    dish: typeof picture.dish === 'string' && picture.dish.trim() ? picture.dish : null
  }
}

/** Bits that differ between two 64-bit hashes written as 16 hex digits; null when either is missing. */
export function hammingDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return null
  let bits = 0
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      bits += x & 1
      x >>= 1
    }
  }
  return bits
}

/** Pictures that are near-copies of each other (≤ `bits` apart): clusters by id, the largest first in each. Nothing is dropped. */
export function nearCopies(labels, bits = 6) {
  const sorted = [...labels].sort(
    (a, b) => b.width * b.height - a.width * a.height || String(a.id).localeCompare(String(b.id))
  )
  const clusterOf = new Map()
  const clusters = []
  for (const label of sorted) {
    const home = clusters.find((c) =>
      c.some((other) => (hammingDistance(label.dhash, other.dhash) ?? 99) <= bits)
    )
    if (home) home.push(label)
    else clusters.push([label])
  }
  clusters.forEach((cluster, i) => cluster.forEach((l) => clusterOf.set(l.id, i)))
  return { clusters: clusters.map((c) => c.map((l) => l.id)), clusterOf }
}
