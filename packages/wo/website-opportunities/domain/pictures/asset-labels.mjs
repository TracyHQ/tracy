// What each asset of a brief is (F08), for whoever builds the site from it: size, orientation and resolution grade read
// from the file itself (no network, no model), and what the photo shows with a short alt-text caption when a vision model
// has looked at it (the build step's batched labelling, `lib/picture-vision.js` in tracy-web, cached by sha256).
//
// 🔒 UNLABELLED IS NOT OTHER. "other" is a vision model's answer (it looked and the photo fits no kind); a photo no model
// has looked at is "unlabelled", so nobody reads a guess as a fact.
import { aspectClass } from './picture-labels.mjs'

/** What a photo shows, for any trade. */
export const ASSET_CONTENT_KINDS = Object.freeze([
  'people-in-action',
  'team',
  'venue-interior',
  'venue-exterior',
  'product',
  'food',
  'equipment',
  'logo',
  'text-graphic',
  'other'
])
export const ASSET_CONTENT = Object.freeze([...ASSET_CONTENT_KINDS, 'unlabelled'])
export const ASSET_ORIENTATIONS = Object.freeze(['landscape', 'portrait', 'square', 'unknown'])
/** high = sharp enough for a full-width hero; medium = a gallery or card picture; low = a thumbnail at most. */
export const ASSET_QUALITIES = Object.freeze(['high', 'medium', 'low', 'unknown'])
export const ASSET_CAPTION_MAX = 124

/** Long and short edge (px) a hero needs, and the long edge a gallery picture needs. */
const HERO_LONG = 1600
const HERO_SHORT = 900
const GALLERY_LONG = 800

/**
 * The content kind a label made before the content field implies, by its subject; null when the subject spans two kinds
 * ("people" is staff or guests, "work-result" is a product or a finished job).
 */
const CONTENT_OF_SUBJECT = {
  food: 'food',
  drink: 'food',
  dessert: 'food',
  interior: 'venue-interior',
  room: 'venue-interior',
  exterior: 'venue-exterior',
  'service-in-action': 'people-in-action',
  event: 'people-in-action',
  equipment: 'equipment',
  product: 'product',
  'menu-board': 'text-graphic',
  poster: 'text-graphic',
  logo: 'logo',
  other: 'other'
}

const size = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : 0)

/** landscape, portrait or square by width / height (the thresholds of `aspectClass`); unknown without a size. */
export function orientationOf(width, height) {
  const w = size(width)
  const h = size(height)
  if (!w || !h) return 'unknown'
  const shape = aspectClass(w / h)
  return shape === 'wide' ? 'landscape' : shape
}

/** The resolution grade: high fits a hero, medium a gallery, low a thumbnail; unknown without a size. */
export function resolutionGradeOf(width, height) {
  const w = size(width)
  const h = size(height)
  if (!w || !h) return 'unknown'
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  if (long >= HERO_LONG && short >= HERO_SHORT) return 'high'
  return long >= GALLERY_LONG ? 'medium' : 'low'
}

/** The vision label a picture carries: on its row (`labels.vision.labels`) or handed in as `vision`. */
const visionOf = (m) => {
  const v = m?.vision ?? m?.labels?.vision?.labels ?? null
  return v && typeof v === 'object' ? v : null
}

/** A caption cut under 125 characters at a word, or null. */
function captionOf(text) {
  const one = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  if (!one) return null
  if (one.length <= ASSET_CAPTION_MAX) return one
  const cut = one.slice(0, ASSET_CAPTION_MAX + 1)
  const at = cut.lastIndexOf(' ')
  return (at > 40 ? cut.slice(0, at) : cut.slice(0, ASSET_CAPTION_MAX)).replace(/[\s,;:.-]+$/, '')
}

/**
 * The labels of one asset (pure): `{width, height, orientation, quality, content, caption?}`; width and height are null
 * when the size is unknown (a video whose size was never read).
 * @param {{width?: number|null, height?: number|null, vision?: any, labels?: any}} m a brief's media entry
 */
export function assetLabelsOf(m) {
  // 🔒 An unknown size is null, never 0: a reader dividing width by height must see that it cannot.
  const width = size(m?.width) || null
  const height = size(m?.height) || null
  const vision = visionOf(m)
  const content = ASSET_CONTENT_KINDS.includes(vision?.content)
    ? vision.content
    : (CONTENT_OF_SUBJECT[vision?.subject] ?? 'unlabelled')
  const caption = captionOf(vision?.caption) ?? captionOf(vision?.oneLine)
  return {
    width,
    height,
    orientation: orientationOf(width, height),
    quality: resolutionGradeOf(width, height),
    content,
    ...(caption ? { caption } : {})
  }
}

/** Content that never opens a site: words and marks, not a photograph of the business. */
export const NOT_A_HERO = new Set(['logo', 'text-graphic'])
const HERO_CONTENT = new Set(['people-in-action', 'venue-interior', 'venue-exterior'])

/** How well a picture fits the hero: one point each for landscape, a high grade and people at work or the venue. */
export function heroScore(labels) {
  return (
    (labels.orientation === 'landscape' ? 1 : 0) +
    (labels.quality === 'high' ? 1 : 0) +
    (HERO_CONTENT.has(labels.content) ? 1 : 0)
  )
}
