// What the business's own photos show about it, as facts of the brief (`sourceKind: 'observed'`). The vision labels of a
// photo stay in `assets[]`; a reader that never sees the photos (a site planner) gets only these facts, each naming the
// photos it rests on (`assetIds`). A text model groups what the photos show (`observed-facts-prompt.mjs`); this module
// decides which photos may be read and holds the answer to the rules.
//
// 🔒 ABOUT THE BUSINESS, NEVER THE PEOPLE. A fact says what the place has, what happens there and how it feels: never a
// person's name, age, looks or clothes.
// 🔒 ONLY SHARP, ON-TOPIC, OWN PHOTOS. A guest's snapshot, a blurry or dark one, a graphic or a photo of another
// business is never read. Sharpness is what the vision model saw, not the file's resolution: a small video frame of the
// pool still shows the pool.
// 🔒 ANGLES, NOT CLAIMS (`OBSERVED_USE_RULE`). No number, no superlative, no price or hour ever passes the hold.
import { createHash } from 'node:crypto'
import { assetLabelsOf } from './asset-labels.mjs'
import { assetRelationsOf, GENERAL } from './picture-links.mjs'

export const OBSERVED_FIELDS = Object.freeze(['facility', 'activity', 'atmosphere'])
export const OBSERVED_DROP_REASONS = Object.freeze(['unlabelled', 'not_own_photo', 'blurry', 'off_topic'])
/** How a reader may use an observed fact: the brief's schema and its markdown state this rule. */
export const OBSERVED_USE_RULE =
  'Facts with sourceKind observed come from what the business\'s photos show. Use them only for angles and for describing the picture a frame needs, never for hard claims: no counts (of courts, rooms, classes), no size, no prices, no hours, no "largest" or "only". The photos may be customer uploads, and counts cannot be read reliably from photos.'

const MAX_FACTS = 12
const VALUE_MAX = 80
const WORDS_MAX = 10
const OFF_TOPIC = new Set(['logo', 'text-graphic', 'other'])
const UNSHARP = new Set(['blurry', 'dark'])
const NUMBER_WORDS =
  'one two three four five six seven eight nine ten eleven twelve dozen dozens hundred hundreds thousand single double triple several'
const CLAIM_WORDS =
  'largest biggest best finest greatest newest oldest most top leading premier only unique first number award awards open opening hours daily price prices priced cheap affordable free cost costs fee fees discount'
const PERSON_WORDS =
  'man men woman women boy boys girl girls lady ladies guy guys gentleman gentlemen blonde brunette hair beard wearing wears dressed dress shirt skirt smiling smile young old elderly teen teenager teenagers aged tall slim pretty beautiful handsome face faces tattoo tattoos'
const BANNED = new Set(`${NUMBER_WORDS} ${CLAIM_WORDS} ${PERSON_WORDS}`.split(' '))

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const visionOf = (m) => {
  const v = m?.vision ?? m?.labels?.vision?.labels ?? null
  return v && typeof v === 'object' ? v : null
}

/**
 * One brief media row as the observation step reads it: what it shows, its caption, whether the business published it,
 * its resolution grade, the sharpness the vision model saw and the offering it is linked to.
 * @param {any} m a brief read's media entry
 * @param {{list?: any, posts?: any[], businessName?: string | null}} [context] as `assetRelationsOf` takes it
 */
export function photoViewOf(m, context = {}) {
  const labels = assetLabelsOf(m)
  const links = assetRelationsOf(m, context)
  const raw = visionOf(m)
  const offering =
    links.depicts.id === GENERAL
      ? null
      : ((context.list?.offerings ?? []).find((o) => o.id === links.depicts.id)?.label ?? null)
  return {
    id: m.id,
    kind: m.kind,
    content: labels.content,
    caption: labels.caption ?? null,
    isOwnPhoto: links.isOwnPhoto,
    quality: labels.quality,
    isGraphic: links.isGraphic,
    sharpness: typeof raw?.quality === 'string' ? raw.quality : null,
    offering
  }
}

/** Why a photo may not be read, or null when it may. */
function dropReasonOf(p) {
  if (p?.kind !== 'image' || !p.content || p.content === 'unlabelled' || !nonEmpty(p.caption))
    return 'unlabelled'
  if (p.isOwnPhoto === false) return 'not_own_photo'
  if (UNSHARP.has(p.sharpness) || p.isBlurry === true) return 'blurry'
  if (p.isGraphic === true || OFF_TOPIC.has(p.content) || p.showsOtherBusiness === true) return 'off_topic'
  return null
}

/**
 * The photos an observation may read (pure), in their order, and every other one with why it is left out.
 * @param {any[]} views photo views (`photoViewOf`)
 * @returns {{photos: any[], dropped: {id: string, reason: string}[]}}
 */
export function observablePhotos(views) {
  const photos = []
  const dropped = []
  for (const p of Array.isArray(views) ? views : []) {
    if (!nonEmpty(p?.id)) continue
    const reason = dropReasonOf(p)
    if (reason) dropped.push({ id: p.id, reason })
    else photos.push(p)
  }
  return { photos, dropped }
}

/** The text without the stops (`.`, `;`, `,`) it ends on, read from its end: `/[.;,]+$/` went over a long run
 * of them once for each place in it. */
function withoutEndStops(text) {
  let end = text.length
  while (end > 0 && '.;,'.includes(text[end - 1])) end--
  return text.slice(0, end)
}

/** A value in its held form (lower case, one space), or null when it breaks a rule. */
function heldValue(value, people) {
  if (typeof value !== 'string') return null
  const v = withoutEndStops(fold(value).replace(/\s+/g, ' ').trim())
  if (v.length < 3 || v.length > VALUE_MAX || /\d/.test(v)) return null
  // "One-to-one" and "one on one" name a lesson format, not a count.
  const words = v.replace(/\bone[\s-]+(?:to|on)[\s-]+one\b/g, 'personal').match(/[a-z]+/g) ?? []
  if (!words.length || words.length > WORDS_MAX || words.some((w) => BANNED.has(w))) return null
  if (people.some((name) => name.length >= 3 && v.includes(name))) return null
  return v
}

function parsed(answer) {
  try {
    const body = typeof answer === 'string' ? JSON.parse(answer) : answer
    return Array.isArray(body?.facts) ? body.facts : []
  } catch {
    return []
  }
}

/**
 * The facts a model's answer holds (pure): each `{field, value, assetIds}` of a known field, a value that says nothing
 * about a person and makes no hard claim, and at least one photo of `photos`; the same field and value merged into one
 * fact naming every photo, in the photos' order.
 * @param {string | object} answer the model's JSON answer, `{facts: [{field, value, assetIds}]}`
 * @param {any[]} photos the observable photos the model was shown
 * @param {{people?: string[]}} [options] names of the business's people, never written into a fact
 * @returns {{field: string, value: string, assetIds: string[]}[]}
 */
export function heldObservedFacts(answer, photos, { people = [] } = {}) {
  const order = new Map((photos ?? []).map((p, i) => [p.id, i]))
  const names = people.filter(nonEmpty).map((n) => fold(n).replace(/\s+/g, ' ').trim())
  const merged = new Map()
  for (const f of parsed(answer)) {
    if (!f || typeof f !== 'object' || !OBSERVED_FIELDS.includes(f.field)) continue
    const value = heldValue(f.value, names)
    const ids = (Array.isArray(f.assetIds) ? f.assetIds : []).filter((id) => order.has(id))
    if (!value || !ids.length) continue
    const key = `${f.field}\n${value}`
    const fact = merged.get(key) ?? { field: f.field, value, assetIds: [] }
    fact.assetIds = [...new Set([...fact.assetIds, ...ids])].sort((a, b) => order.get(a) - order.get(b))
    merged.set(key, fact)
  }
  return [...merged.values()].slice(0, MAX_FACTS)
}

/**
 * The brief's envelopes of held facts (pure): on the site (they back angles and picture descriptions, never a claim),
 * decided by rule, each id stable for the same field and value.
 */
export function observedFactEnvelopes(held) {
  return (Array.isArray(held) ? held : []).map((f) => ({
    id: `fact_${createHash('sha256')
      .update(JSON.stringify(['observed', f.field, f.value]))
      .digest('hex')
      .slice(0, 24)}`,
    field: f.field,
    value: f.value,
    sourceKind: 'observed',
    assetIds: [...f.assetIds],
    evidence: f.assetIds.map((ref) => ({ source: 'photo', ref })),
    confidence: 'single-source',
    onSite: true,
    decidedBy: 'rule',
    reasons: ['observed-in-photos']
  }))
}
