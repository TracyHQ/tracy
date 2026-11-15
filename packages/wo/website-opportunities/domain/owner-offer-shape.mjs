// What the owner typed about the business is not always something it offers (#609 defects of a real run): "I run Ottermere
// Club, a rowing club. We also run junior lessons, junior lessons for kids" gave three services labelled "Your answer":
// the club itself, one lesson and the same lesson again. Code, not the model, holds an owner service to two rules, each
// drop recorded with its reason, never silent:
//   - `owner_item_describes_business`: a phrase that says what the business is, not what it sells: the owner set it
//     beside the business as "a ..." or "an ..." ("Ottermere Club, a rowing club", "we are a rowing club", "I run a
//     rowing club") and it ends on a word for a place of business (club, gym, studio, shop). "We run a rowing class"
//     and "we also run a junior club" stay services;
//   - `owner_item_describes_audience`: a phrase of audience words alone ("kids", "teens and adults"): who it serves;
//   - `owner_item_near_duplicate`: one owner service whose words begin another owner service of the same kind ("junior
//     lessons" in "junior lessons for kids") is that service: the longer, more precise one stays, with both rows.
// A service the website names is never touched here: these rules read the owner's own services only, so a real service
// the owner typed that the website lacks still arrives. Pure.

/** Words for a place of business: a phrase that ends on one, set beside the business as "a ...", names the business. */
export const BUSINESS_PLACE_NOUNS = Object.freeze(
  (
    'gym gyms studio studios club clubs salon salons clinic clinics shop shops store stores boutique restaurant cafe ' +
    'bar bakery agency firm practice company business centre center spa hotel academy dojo garage pharmacy venue ' +
    'pub bistro brewery winery farm nursery workshop school'
  ).split(' ')
)
/** Words of an audience: a phrase of these alone says who the business serves. */
export const AUDIENCE_WORDS = Object.freeze(
  (
    'kids kid children child adults adult teens teen teenagers women men families family seniors beginners students ' +
    'juniors toddlers parents couples professionals everyone all ages and for of every age level levels'
  ).split(' ')
)
export const OWNER_SHAPE_REASONS = Object.freeze({
  owner_item_describes_business: 'the owner says what the business is here, not something it offers',
  owner_item_describes_audience: 'the owner says who the business serves here, not something it offers',
  owner_item_near_duplicate:
    'the owner names the same offer again in other words; the more precise name is kept'
})

const wordsOf = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Why an owner service is not one, or null: it describes the business (in `text`, the owner's words) or its audience. */
export function ownerShapeDropOf(label, text) {
  const words = wordsOf(label)
  if (words.length === 0) return null
  if (words.every((w) => AUDIENCE_WORDS.includes(w))) return 'owner_item_describes_audience'
  if (!BUSINESS_PLACE_NOUNS.includes(words.at(-1))) return null
  const phrase = words.map(escaped).join('[^\\p{L}\\p{N}]+')
  const beside = new RegExp(
    `(?:[,;:(]|\\b(?:is|are|am|we're|i'm)|\\b(?:i|we)\\s+(?:run|own|manage))\\s*(?:a|an)\\s+${phrase}(?![\\p{L}\\p{N}])`,
    'iu'
  )
  return beside.test(wordsText(text)) ? 'owner_item_describes_business' : null
}
const wordsText = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/’/g, "'")

/** Whether the words of `shorter` begin the words of `longer`, and `longer` says more. */
export function beginsWith(longer, shorter) {
  const a = wordsOf(longer)
  const b = wordsOf(shorter)
  return b.length > 0 && a.length > b.length && b.every((w, i) => a[i] === w)
}

/**
 * The owner's services held to the rules above.
 * @template T
 * @param {T[]} items every item, the owner's and the others, in order
 * @param {{isOwners: (item: T) => boolean, labelOf: (item: T) => string, kindOf: (item: T) => string,
 *   text: string, merge?: (kept: T, gone: T) => void}} how `isOwners`: the item stands on the owner's words alone;
 *   `text`: the owner's words; `merge`: what the kept item takes of the near duplicate it absorbs
 * @returns {{items: T[], dropped: Array<{item: T, code: string, keptAs?: string}>}}
 */
export function settleOwnerOffers(items, { isOwners, labelOf, kindOf, text, merge = () => {} }) {
  const dropped = []
  const shaped = items.filter((item) => {
    if (!isOwners(item)) return true
    const code = ownerShapeDropOf(labelOf(item), text)
    if (code) dropped.push({ item, code })
    return !code
  })
  const kept = shaped.filter((item) => {
    if (!isOwners(item)) return true
    const into = shaped.find(
      (o) => o !== item && isOwners(o) && kindOf(o) === kindOf(item) && beginsWith(labelOf(o), labelOf(item))
    )
    if (!into) return true
    merge(into, item)
    dropped.push({ item, code: 'owner_item_near_duplicate', keptAs: labelOf(into) })
    return false
  })
  return { items: kept, dropped }
}
