// Which collected photo shows which dish of a menu, and the evidence for it — or no photo at all.
//
// 🔒 WORDS ONLY MAKE A CANDIDATE. A caption or a post naming a dish says what the text is about, not what the photo shows
// (a post about a dish may picture the chef). A candidate becomes `accepted` only through a structural link from the
// source (`menu-card`) or Tracy's vision calling the photo a dish or a drink. A wrong photo beside a dish is worse than
// none: anything ambiguous (two dishes named, a negation, a comparison, a combo, two dishes on one copy of a picture)
// is dropped, never resolved by an order of preference.
// 🔒 ONLY THE TEXT THAT CAME WITH THE PHOTO. Its own caption or alt, and the text of the post it belongs to. Never a file
// name, a category, an AI-written alt or a vision line. A guest photo of a review site comes with its review: the
// review's words are its post text, never a caption beside it.
// Pure and deterministic: ties break on size, then on ids.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const DISH_PHOTOS_MATCHER = 'dish-photos/1'
export const DISH_PHOTO_HOWS = Object.freeze(['menu-card', 'post-text', 'caption', 'sender'])
export const DISH_PHOTO_STATUSES = Object.freeze(['candidate', 'accepted'])

const DISH_SUBJECTS = new Set(['food', 'drink', 'dessert'])
/** Guest photos: their `postId` names a review of the same site, whose words are the only text that came with them. */
const REVIEW_SOURCES = new Set(['tripadvisor', 'google-maps'])
const HOW_RANK = { 'menu-card': 0, caption: 1, 'post-text': 2, sender: 3 }
const QUOTE_MAX = 300
/** Characters before and after a mention read for a negation. */
const NEGATION_WINDOW = 20
const MIN_CHARS = 6

const WORD = '[\\p{L}\\p{M}\\p{N}]'
/** Scripts written without spaces between words: a name there has no word boundary to keep. */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/** Names too generic to be one dish, in a few languages (`dish-photos-generic.json`); matched on the whole name. */
const GENERIC = new Set(
  JSON.parse(readFileSync(new URL('./dish-photos-generic.json', import.meta.url), 'utf8')).map((s) =>
    s.normalize('NFC')
  )
)
/** A numbered or lettered set, or a side added to a dish (`combo 1`, `set A`, `extra rice`, `thêm trứng`). */
const GENERIC_PATTERNS = [
  /^(combo|set|menu|suất|phần|lunch set|dinner set|meal|bữa|セット|كومبو)\s*[\p{N}\p{L}]{0,2}$/u,
  /^(extra|add|add-on|thêm|topping|side)\s/u
]
/** A comparison or a combo anywhere in a text: which dish a photo shows is not settled by it. */
const AMBIGUOUS = [
  /(?<![\p{L}\p{M}\p{N}])(vs|versus|compared to|instead of|rather than|combo|set menu|so với|thay vì|hay là|en lugar de|au lieu de|statt|anstatt|بدلا من|مقارنة|كومبو)(?![\p{L}\p{M}\p{N}])/u,
  /セット|と比べ|より/u
]
/** Words that deny a dish near its mention (`hết`, `sold out`, `not`). */
const NEGATION = [
  /(?<![\p{L}\p{M}\p{N}])(không|chưa|hết|ngưng|ngừng|no|not|without|never|sold out|out of stock|isn't|don't|sin|agotado|kein|keine|ohne|ausverkauft|pas|sans|لا|بدون|نفد)(?![\p{L}\p{M}\p{N}])/u,
  /売り切れ|品切れ|なし/u
]

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const visionOf = (m) => m?.labels?.vision?.labels ?? m?.vision ?? null

/** What the text says, compared as written: NFC, lower case, single spaces. */
function norm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Latin letters without their marks (`Bún` → `Bun`, `đ` → `d`); other scripts untouched. */
function foldLatin(s) {
  return s
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC')
}

/** A menu name as it is compared: without notes in brackets and a size or volume at its end. */
function nameKey(name) {
  return norm(name)
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|（[^）]*）/g, ' ')
    .replace(/\s*[-–—/|,]\s*(size\s*)?(xs|s|m|l|xl|xxl|nhỏ|vừa|lớn|small|medium|large)$/u, '')
    .replace(/\s+(size|cỡ)\s+\S+$/u, '')
    .replace(/\s+\d+([.,]\d+)?\s*(ml|cl|l|g|kg|oz)$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A name specific enough to stand for one dish: two words or six characters, and not a generic one. */
function specific(key) {
  if (!key || GENERIC.has(key) || GENERIC_PATTERNS.some((re) => re.test(key))) return false
  return key.split(' ').length >= 2 || [...key].length >= MIN_CHARS
}

/** A whole-word pattern of `key`; a side in an unspaced script needs no boundary. */
function patternOf(key) {
  const chars = [...key]
  const before = UNSPACED.test(chars[0]) ? '' : `(?<!${WORD})`
  const after = UNSPACED.test(chars.at(-1)) ? '' : `(?!${WORD})`
  return new RegExp(`${before}${escape(key)}${after}`, 'gu')
}

/**
 * The dishes a menu can be matched on: one entry per distinct name, the first item of a repeated name (two sizes are one
 * dish), longest first so a long name masks the short one inside it.
 */
function namesOf(menuItems) {
  const byKey = new Map()
  menuItems.forEach((item, index) => {
    const key = nameKey(item?.name)
    if (specific(key) && !byKey.has(key)) byKey.set(key, index)
  })
  const folds = new Map()
  for (const key of byKey.keys()) folds.set(foldLatin(key), (folds.get(foldLatin(key)) ?? 0) + 1)
  return [...byKey.entries()]
    .map(([key, index]) => {
      const folded = foldLatin(key)
      return {
        index,
        exact: patternOf(key),
        // Only a name no other dish shares once its accents are gone may be found in a text written without accents.
        folded: folded !== key && folds.get(folded) === 1 ? patternOf(folded) : null,
        length: [...key].length
      }
    })
    .sort((a, b) => b.length - a.length || a.index - b.index)
}

/** The dishes a text names, or `conflict` when it denies, compares or bundles them. */
function readText(text, names) {
  const t = norm(text)
  if (!t) return null
  if (AMBIGUOUS.some((re) => re.test(t))) return { conflict: true }
  const unaccented = foldLatin(t) === t
  let masked = t
  const items = new Set()
  let first = null
  for (const n of names) {
    for (const re of [n.exact, unaccented ? n.folded : null]) {
      if (!re) continue
      re.lastIndex = 0
      const hits = [...masked.matchAll(re)]
      if (!hits.length) continue
      for (const hit of hits) {
        const start = hit.index
        const end = start + hit[0].length
        const near = `${t.slice(Math.max(0, start - NEGATION_WINDOW), start)} ${t.slice(end, end + NEGATION_WINDOW)}`
        if (NEGATION.some((neg) => neg.test(near))) return { conflict: true }
        masked = masked.slice(0, start) + '\u0001'.repeat(end - start) + masked.slice(end)
        first ??= start
      }
      items.add(n.index)
      break
    }
  }
  return { items, at: first ?? 0 }
}

/** The text as quoted: whole when short, else the part around the mention. */
function quoteOf(text, at) {
  const t = String(text).normalize('NFC').replace(/\s+/g, ' ').trim()
  if (t.length <= QUOTE_MAX) return t
  const start = Math.max(0, Math.min(at - 60, t.length - QUOTE_MAX))
  return t.slice(start, start + QUOTE_MAX).trim()
}

/** Tracy's vision calls the photo a dish or a drink: not a collage, a flyer, a menu, a person or a room. */
export function isDishVision(v) {
  return Boolean(v) && DISH_SUBJECTS.has(v.subject) && v.isCollage !== true && v.hasTextOverlay !== true
}

/**
 * Whether vision accepts `picture` for its dish. A photo of a post with several photos is accepted only when every photo
 * of that post was looked at and it is the only dish among them: the post's words name a dish, not which photo shows it.
 */
function acceptedBy(picture, how, siblings) {
  if (!isDishVision(picture.vision)) return false
  if (how !== 'post-text' || siblings.length <= 1) return true
  return siblings.every((s) => s.vision) && siblings.filter((s) => isDishVision(s.vision)).length === 1
}

/**
 * The status of a dish photo the brief holds, read again with what vision says now (a build labels pictures after the
 * brief was made). `pictures`: `[{id, postId?, vision}]`, `vision` = the label of Tracy's current vision key or null.
 * @returns {'accepted' | 'candidate'}
 */
export function confirmDishPhoto(photo, pictures) {
  if (photo?.status === 'accepted' || photo?.how === 'menu-card') return 'accepted'
  const picture = (pictures ?? []).find((p) => p.id === photo?.assetId)
  if (!picture) return 'candidate'
  const named = photo.evidence?.siblings
  // A sibling missing from `pictures` was never looked at: it may be the dish.
  if (Array.isArray(named) && !named.every((id) => pictures.some((p) => p.id === id))) return 'candidate'
  const postId = photo.evidence?.postId ?? picture.postId
  const siblings = Array.isArray(named)
    ? pictures.filter((p) => named.includes(p.id))
    : postId
      ? pictures.filter((p) => p.postId === postId)
      : [picture]
  return acceptedBy(picture, photo.how, siblings) ? 'accepted' : 'candidate'
}

const area = (m) => (Number(m.width) || 0) * (Number(m.height) || 0)

/**
 * @param {{menuItems: Array<{name: string, photo?: {mediaId: string, how: string, status?: string, evidence?: object}}>,
 *   media: Array<{id: string, kind: string, source?: string, postId?: string, caption?: string|null, alt?: string|null,
 *   sourceUrl?: string, width?: number, height?: number, sha256?: string, labels?: {vision?: {labels: object}}}>,
 *   posts?: Array<{id?: string, source?: string, url?: string, caption?: string}>,
 *   reviews?: Array<{id: string, source: string, text: string, url?: string}>}} input
 * @returns {Array<{itemIndex: number, mediaId: string, how: string, evidence: {quote?: string, sourceUrl?: string,
 *   postId?: string}, status: 'candidate' | 'accepted'}>} one photo per dish at most, a photo for one dish at most
 */
export function matchDishPhotos({ menuItems = [], media = [], posts = [], reviews = [] } = {}) {
  const items = Array.isArray(menuItems) ? menuItems : []
  const images = (Array.isArray(media) ? media : []).filter((m) => m?.kind === 'image' && nonEmpty(m.id))
  const byId = new Map(images.map((m) => [m.id, m]))
  const pictures = images.map((m) => ({ id: m.id, postId: m.postId ?? null, vision: visionOf(m) }))
  const out = new Map()

  // A link research recorded (a photo inside the dish's own card, a photo the sender attached) comes first.
  const fixed = new Set()
  items.forEach((item, index) => {
    const p = item?.photo
    if (!p || !byId.has(p.mediaId) || !DISH_PHOTO_HOWS.includes(p.how) || fixed.has(p.mediaId)) return
    fixed.add(p.mediaId)
    const photo = { assetId: p.mediaId, how: p.how, status: p.status, evidence: p.evidence ?? {} }
    out.set(index, {
      itemIndex: index,
      mediaId: p.mediaId,
      how: p.how,
      evidence: photo.evidence,
      status: confirmDishPhoto(photo, pictures)
    })
  })

  const names = namesOf(items)
  const postOf = (m) =>
    REVIEW_SOURCES.has(m.source)
      ? ((Array.isArray(reviews) ? reviews : []).find(
          (r) => m.postId && r?.id === m.postId && r.source === m.source && nonEmpty(r.text)
        ) ?? null)
      : m.postId
        ? ((Array.isArray(posts) ? posts : []).find(
            (p) => p?.id === m.postId && (!p.source || !m.source || p.source === m.source)
          ) ?? null)
        : null
  // Photos sharing one caption word for word were posted together: that text is a post's, never each photo's own.
  const sharing = new Map()
  for (const m of images)
    if (nonEmpty(m.caption)) sharing.set(norm(m.caption), [...(sharing.get(norm(m.caption)) ?? []), m.id])
  const candidates = []
  for (const m of images) {
    if (fixed.has(m.id)) continue
    const guest = REVIEW_SOURCES.has(m.source)
    const vision = visionOf(m)
    // Vision may rule a photo out (a menu, a room); it never names the dish.
    if (vision && !isDishVision(vision)) continue
    const post = postOf(m)
    if (guest && !post) continue
    // A social photo carries its post's text as its caption: that is the post's word, not the photo's.
    const group = nonEmpty(m.caption) ? sharing.get(norm(m.caption)) : null
    const shared = !m.postId && group?.length > 1
    const postText = post?.caption ?? post?.text ?? (m.postId || shared ? m.caption : null)
    // A caption the post's text starts with is that text cut short (a sender's length limit), not the photo's word.
    const isPostText = nonEmpty(m.caption) && nonEmpty(postText) && norm(postText).startsWith(norm(m.caption))
    const own = guest ? [] : [m.alt, isPostText ? null : m.caption].filter(nonEmpty)
    const ownReads = own.map((t) => ({ text: t, read: readText(t, names) })).filter((r) => r.read)
    if (ownReads.some((r) => r.read.conflict)) continue
    const ownItems = new Set(ownReads.flatMap((r) => [...r.read.items]))
    if (ownItems.size > 1) continue
    const postRead = nonEmpty(postText) ? readText(postText, names) : null
    if (postRead?.conflict) continue
    const postItem = postRead?.items.size === 1 ? [...postRead.items][0] : null
    const ownItem = ownItems.size === 1 ? [...ownItems][0] : null
    if (ownItem !== null && postItem !== null && ownItem !== postItem) continue
    if (ownItem === null && postItem === null) continue
    const how = ownItem !== null ? 'caption' : 'post-text'
    const said = ownItem !== null ? ownReads.find((r) => r.read.items.has(ownItem)) : null
    const evidence = {
      quote: said ? quoteOf(said.text, said.read.at) : quoteOf(postText, postRead.at),
      ...(nonEmpty(post?.url)
        ? { sourceUrl: post.url }
        : nonEmpty(m.sourceUrl)
          ? { sourceUrl: m.sourceUrl }
          : {}),
      ...(m.postId ? { postId: m.postId } : {}),
      ...(shared ? { siblings: group } : {})
    }
    const picture = pictures.find((p) => p.id === m.id)
    const siblings = m.postId
      ? pictures.filter((p) => p.postId === m.postId)
      : shared
        ? pictures.filter((p) => group.includes(p.id))
        : [picture]
    candidates.push({
      itemIndex: ownItem ?? postItem,
      mediaId: m.id,
      how,
      evidence,
      status: acceptedBy(picture, how, siblings) ? 'accepted' : 'candidate',
      dish: isDishVision(vision),
      area: area(m),
      sha256: m.sha256 ?? null
    })
  }

  // Two copies of one picture named for two dishes: neither is settled.
  const dishesOfSha = new Map()
  for (const c of candidates)
    if (c.sha256) dishesOfSha.set(c.sha256, new Set([...(dishesOfSha.get(c.sha256) ?? []), c.itemIndex]))
  const kept = candidates
    .filter((c) => !c.sha256 || dishesOfSha.get(c.sha256).size === 1)
    .sort(
      (a, b) =>
        (a.status === 'accepted' ? 0 : 1) - (b.status === 'accepted' ? 0 : 1) ||
        (a.dish ? 0 : 1) - (b.dish ? 0 : 1) ||
        HOW_RANK[a.how] - HOW_RANK[b.how] ||
        b.area - a.area ||
        String(a.mediaId).localeCompare(String(b.mediaId))
    )
  for (const c of kept) {
    const held = out.get(c.itemIndex)
    // Only a link research or vision settled keeps its place; an unconfirmed one yields to an accepted match.
    if (held && !(held.status === 'candidate' && c.status === 'accepted')) continue
    out.set(c.itemIndex, {
      itemIndex: c.itemIndex,
      mediaId: c.mediaId,
      how: c.how,
      evidence: c.evidence,
      status: c.status
    })
  }
  return [...out.values()].sort((a, b) => a.itemIndex - b.itemIndex)
}

/** Each photo a brief accepts now, with its dish and the photo as the brief holds it; one two dishes claim is nobody's. */
function acceptedEntries(brief, pictures) {
  const out = new Map()
  const claimed = new Set()
  for (const page of brief?.sitemap ?? [])
    for (const section of page?.sections ?? [])
      for (const item of section?.menuItems ?? []) {
        const photo = item?.photo
        if (!nonEmpty(photo?.assetId) || !nonEmpty(item.name)) continue
        if (confirmDishPhoto(photo, pictures) !== 'accepted') continue
        if (out.has(photo.assetId) && out.get(photo.assetId).name !== item.name) claimed.add(photo.assetId)
        out.set(photo.assetId, { name: item.name, photo })
      }
  for (const id of claimed) out.delete(id)
  return out
}

/**
 * The dish of each photo a brief accepts now — its own status, or vision reading it again at build time
 * (`confirmDishPhoto`): `Map<assetId, dish name>`. A photo two dishes claim is nobody's.
 * @param {any} brief @param {Array<{id: string, postId?: string | null, vision: object | null}>} pictures
 */
export function acceptedDishPhotos(brief, pictures = []) {
  return new Map([...acceptedEntries(brief, pictures)].map(([id, e]) => [id, e.name]))
}

/**
 * A copy of a place profile in which each dish photo the brief accepts now (`acceptedDishPhotos`) `depicts` its dish: what
 * a build fills slots from when the profile was frozen before vision looked at its pictures. The profile itself is left
 * as it is (its hash names it). A photo is added only when the profile holds it (matched by sha256, or by the media row
 * id its locator names) and holds the dish (its first offering of that name, as the brief's matcher keeps the first); a
 * photo that already depicts something, or that two dishes would share, is left alone.
 * @param {any} profile - a place profile 1.0.0
 * @param {{brief: any, pictures?: Array<{id: string, postId?: string | null, vision: object | null, sha256?: string}>}} input
 * @returns {any} the profile, or a copy with the relations and their evidence added
 */
export function withAcceptedDishPhotos(profile, { brief, pictures = [] } = {}) {
  const accepted = acceptedEntries(brief, pictures)
  if (!accepted.size || !Array.isArray(profile?.media) || !Array.isArray(profile?.offerings)) return profile
  const shaOf = new Map()
  for (const a of [...(brief?.assets ?? []), ...(pictures ?? [])])
    if (nonEmpty(a?.id) && nonEmpty(a?.sha256)) shaOf.set(a.id, a.sha256)
  const evidenceById = new Map((profile.evidence ?? []).map((e) => [e.id, e]))
  const mediaOf = (assetId) =>
    profile.media.find((m) => shaOf.has(assetId) && m.value?.sha256 === shaOf.get(assetId)) ??
    profile.media.find((m) =>
      (m.evidenceRefs ?? []).some(
        (ref) => evidenceById.get(ref)?.locator?.value === `$.media[id=${JSON.stringify(assetId)}]`
      )
    )
  const offeringOf = new Map()
  for (const o of profile.offerings)
    if (!offeringOf.has(norm(o.value?.name))) offeringOf.set(norm(o.value?.name), o)
  const links = new Map()
  const shared = new Set()
  for (const [assetId, { name, photo }] of accepted) {
    const media = mediaOf(assetId)
    const offering = offeringOf.get(norm(name))
    if (!media || !offering) continue
    if ((media.value?.relations ?? []).some((r) => r.relation === 'depicts')) continue
    if (links.has(media.id) && links.get(media.id).offering.id !== offering.id) shared.add(media.id)
    links.set(media.id, { offering, photo })
  }
  for (const id of shared) links.delete(id)
  if (!links.size) return profile
  const out = structuredClone(profile)
  out.evidence = Array.isArray(out.evidence) ? out.evidence : []
  for (const [mediaId, { offering, photo }] of links) {
    const version = nonEmpty(photo.matcher) ? photo.matcher : DISH_PHOTOS_MATCHER
    const locator = {
      kind: 'jsonPath',
      value: `$.brief.menuItems[name=${JSON.stringify(offering.value.name)}].photo`
    }
    const quote = nonEmpty(photo.evidence?.quote) ? photo.evidence.quote : undefined
    const sourceId = evidenceById.get(offering.evidenceRefs?.[0])?.sourceId
    if (!sourceId) continue
    const id = `evidence_${createHash('sha256')
      .update(JSON.stringify([sourceId, locator, quote ?? null, mediaId, photo.how ?? null, version]))
      .digest('hex')
      .slice(0, 24)}`
    if (!out.evidence.some((e) => e.id === id))
      out.evidence.push({
        id,
        sourceId,
        locator,
        ...(quote ? { excerpt: quote } : {}),
        extraction: { method: 'dish-photos', version }
      })
    const media = out.media.find((m) => m.id === mediaId)
    media.value.relations = [
      ...(media.value.relations ?? []),
      { entityId: offering.id, relation: 'depicts', evidenceRefs: [id] }
    ]
  }
  return out
}
