// Which of the brief's offerings a photo shows and whose portrait it is (brief readiness, #48). The brief's own items are
// a CLOSED LIST: a photo links to one of them or to nothing. Words the business wrote with the photo (its alt text, its
// post) link it first, without any model; a vision model's answer is held to the list; everything else is "general".
//
// 🔒 GENERAL WHEN UNSURE. A padel photo once illustrated a tennis class. A link is made only from words naming exactly one
// item, or from a model naming an id of the list; two items named, an id the list lacks, or a free-text name are general,
// and a general photo never takes an offering or person role.
// 🔒 NOTHING LOOKED IS NULL. Without a model's look the graphic flag, people count and own-photo answer are null.
import { createHash } from 'node:crypto'
import { creditTextOf, uploaderRoleOf } from './asset-origin.mjs'

export const GENERAL = 'general'
/** The roles of place content roles v3 (ADR 0040) a collected photo can fill. */
export const PHOTO_ROLES = Object.freeze([
  'business.hero_image',
  'business.gallery_image',
  'offering.image',
  'person.image',
  'event.image',
  'quote.author_image',
  'editorial.illustration',
  'business.logo'
])
const ROLE_OF_GENERAL = 'business.gallery_image'
const GRAPHIC_CONTENT = new Set(['logo', 'text-graphic'])
const GRAPHIC_SUBJECTS = new Set(['logo', 'poster', 'menu-board'])
const EVIDENCE_MAX = 160
const MAX_FACES = 12
/** A name shorter than this never links: it matches too much. */
const NAME_MIN = 3

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const fold = (text) =>
  ` ${String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
const clip = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_MAX)

/**
 * The closed list of a business reading: its offerings (services and products) and the people it names itself. A person
 * only reviews name is never offered.
 * @param {{services?: any[], team?: any[]} | null | undefined} reading
 * @returns {{offerings: Array<{id: string, label: string}>, people: Array<{id: string, label: string}>}}
 */
export function closedListOf(reading) {
  const item = (i) => ({ id: i.id, label: i.label })
  const usable = (i) => nonEmpty(i?.id) && nonEmpty(i?.label)
  return {
    offerings: (reading?.services ?? []).filter(usable).map(item),
    people: (reading?.team ?? []).filter((p) => usable(p) && p.reviewsOnly !== true).map(item)
  }
}

/** A short hash of a closed list: a label made against another list is asked again. Null for an empty list. */
export function closedListDigest(list) {
  const ids = [...(list?.offerings ?? []), ...(list?.people ?? [])].map((i) => `${i.id}=${i.label}`)
  if (!ids.length) return null
  return createHash('sha256').update(ids.sort().join('\n')).digest('hex').slice(0, 12)
}

/** The one item of `items` the text names in full, the longest name winning over a name inside it; null for none or two. */
export function namedIn(text, items) {
  const folded = fold(text)
  const hits = items.filter((i) => {
    const name = fold(i.label)
    return name.trim().length >= NAME_MIN && folded.includes(name)
  })
  const kept = hits.filter(
    (i) =>
      !hits.some((o) => o !== i && fold(o.label).includes(fold(i.label)) && o.label.length > i.label.length)
  )
  return kept.length === 1 ? kept[0] : null
}

/** The text of the post a picture came with: its post by id, else the caption it was collected with. */
function postTextOf(m, posts) {
  const post = m?.postId
    ? (Array.isArray(posts) ? posts : []).find(
        (p) => p?.id === m.postId && (!p.source || !m.source || p.source === m.source)
      )
    : null
  return post?.caption ?? post?.text ?? m?.caption ?? null
}

/**
 * Links made from the words that came with a photo, without a model: alt text first, then its post's text.
 * @returns {{depicts: {id: string, evidence: object} | null, portraitOf: {id: string, evidence: object} | null}}
 */
export function textLinksOf(m, list, posts = []) {
  const texts = [
    ['alt', m?.alt],
    ['post', postTextOf(m, posts)]
  ].filter(([, t]) => nonEmpty(t))
  const link = (items) => {
    for (const [via, text] of texts) {
      const hit = namedIn(text, items ?? [])
      if (hit) return { id: hit.id, evidence: { via, quote: clip(text) } }
    }
    return null
  }
  return { depicts: link(list?.offerings), portraitOf: link(list?.people) }
}

/** A box `[x, y, width, height]` as fractions of the picture, or null when it is not one. */
function boxOf(v) {
  if (!Array.isArray(v) || v.length !== 4) return null
  const n = v.map(Number)
  if (n.some((x) => !Number.isFinite(x))) return null
  const [x, y, w, h] = n
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) return null
  return n.map((k) => Math.round(k * 1000) / 1000)
}

/** Where a subject box sits, in the old one-word focus readers still take. */
export function focusOfBox(box) {
  const b = boxOf(box)
  if (!b) return null
  const cx = b[0] + b[2] / 2
  const cy = b[1] + b[3] / 2
  const dx = cx - 0.5
  const dy = cy - 0.5
  if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return 'center'
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'top' : 'bottom'
}

/**
 * The labels the vision step answers beside the links (COO, 30/10/2026): sharpness, words or a watermark on the photo, another
 * business shown. A boolean when a model looked; absent (null on the brief's photo record) is unknown, never bad.
 */
export const PHOTO_RISK_LABELS = Object.freeze(['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])

/** The role a photo may fill given its links: offering and person roles need their link, a graphic fills none but the logo. */
function roleFor(role, { depicts, portraitOf, isGraphic, content }) {
  if (content === 'logo') return 'business.logo'
  if (isGraphic) return null
  if (!PHOTO_ROLES.includes(role)) return null
  if (role === 'offering.image' && (!depicts || depicts === GENERAL)) return ROLE_OF_GENERAL
  if (role === 'person.image' && !portraitOf) return ROLE_OF_GENERAL
  return role
}

/**
 * A vision model's link answer held to the closed list and to its shapes: ids outside the list are general, boxes are
 * fractions, a people count is a whole number. Fields the model left out stay out.
 * @param {Record<string, any>} entry
 * @param {{offerings?: any[], people?: any[]} | null} list
 */
export function heldVisionLinks(entry, list) {
  const offerings = new Set((list?.offerings ?? []).map((o) => o.id))
  const people = new Set((list?.people ?? []).map((p) => p.id))
  /** @type {Record<string, any>} */
  const out = { depicts: offerings.has(entry?.depicts) ? entry.depicts : GENERAL }
  if (out.depicts !== GENERAL && nonEmpty(entry.depictsEvidence))
    out.depictsEvidence = clip(entry.depictsEvidence)
  if (people.has(entry?.portraitOf)) {
    out.portraitOf = entry.portraitOf
    if (nonEmpty(entry.portraitEvidence)) out.portraitEvidence = clip(entry.portraitEvidence)
  }
  const subjectBox = boxOf(entry?.subjectBox)
  if (subjectBox) out.subjectBox = subjectBox
  if (Array.isArray(entry?.faceBoxes))
    out.faceBoxes = entry.faceBoxes.map(boxOf).filter(Boolean).slice(0, MAX_FACES)
  const count = Number(entry?.peopleCount)
  if (entry?.peopleCount != null && Number.isFinite(count) && count >= 0)
    out.peopleCount = Math.min(999, Math.floor(count))
  const graphicByKind = GRAPHIC_CONTENT.has(entry?.content) || GRAPHIC_SUBJECTS.has(entry?.subject)
  if (typeof entry?.isGraphic === 'boolean' || graphicByKind)
    out.isGraphic = entry?.isGraphic === true || graphicByKind
  if (typeof entry?.isOwnPhoto === 'boolean') out.isOwnPhoto = entry.isOwnPhoto
  for (const field of PHOTO_RISK_LABELS) if (typeof entry?.[field] === 'boolean') out[field] = entry[field]
  out.role = roleFor(entry?.role, { ...out, content: entry?.content })
  return out
}

/** A credit line without its "(https://...)" links, cut in one pass (a regex here is a ReDoS risk on long credits). */
function withoutLinks(text) {
  let out = ''
  let at = 0
  for (;;) {
    const open = text.indexOf('(http', at)
    const close = open < 0 ? -1 : text.indexOf(')', open)
    if (close < 0) return out + text.slice(at)
    out += text.slice(at, open)
    at = close + 1
  }
}

/**
 * Who published a photo, cheaply: the uploader its source states, else a Google author whose name is the business's own.
 * @returns {'owner' | 'customer' | 'unknown'}
 */
export function ownershipOf(m, businessName) {
  const stated = uploaderRoleOf(m)
  if (stated !== 'unknown') return stated
  const name = fold(businessName).trim()
  if (!name) return 'unknown'
  const authors = creditTextOf(m)
    .split(';')
    .map((a) => fold(withoutLinks(a)).trim())
  return authors.includes(name) ? 'owner' : 'unknown'
}

const visionOf = (m) => {
  const v = m?.vision ?? m?.labels?.vision?.labels ?? null
  return v && typeof v === 'object' ? v : null
}

/**
 * The relations and placing labels of one brief asset: `depicts` (an offering id or general) and `portraitOf` (a person
 * id or null), each with its evidence, the v3 role it can fill, its subject and face boxes, people count, graphic flag and
 * whether it is the business's own photo.
 * @param {any} m a brief read's media entry
 * @param {{list?: any, posts?: any[], businessName?: string | null}} context
 */
export function assetRelationsOf(m, { list = null, posts = [], businessName = null } = {}) {
  const words = textLinksOf(m, list, posts)
  const raw = visionOf(m)
  const seen = raw ? heldVisionLinks(raw, list) : null
  const fromVision = (id, quote) => ({ id, evidence: { via: 'vision', ...(quote ? { quote } : {}) } })
  const depicts =
    words.depicts ??
    (seen && seen.depicts !== GENERAL
      ? fromVision(seen.depicts, seen.depictsEvidence)
      : { id: GENERAL, evidence: { via: seen ? 'vision' : 'none' } })
  const portraitOf =
    words.portraitOf ?? (seen?.portraitOf ? fromVision(seen.portraitOf, seen.portraitEvidence) : null)
  const isGraphic = seen && 'isGraphic' in seen ? seen.isGraphic : null
  const wanted =
    seen?.role ?? (depicts.id !== GENERAL ? 'offering.image' : portraitOf ? 'person.image' : null)
  const role =
    seen || words.depicts || words.portraitOf
      ? roleFor(wanted, {
          depicts: depicts.id,
          portraitOf: portraitOf?.id,
          isGraphic,
          content: raw?.content
        })
      : null
  const owner = ownershipOf(m, businessName)
  return {
    depicts,
    portraitOf,
    role,
    ...(seen?.subjectBox ? { subjectBox: seen.subjectBox } : {}),
    faceBoxes: seen?.faceBoxes ?? [],
    peopleCount: seen && 'peopleCount' in seen ? seen.peopleCount : null,
    isGraphic,
    isOwnPhoto: owner === 'owner' ? true : owner === 'customer' ? false : (seen?.isOwnPhoto ?? null),
    ...Object.fromEntries(PHOTO_RISK_LABELS.map((field) => [field, seen?.[field] ?? null]))
  }
}
