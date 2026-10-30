// The copy written next to a picture frame (spec TracyHQ/tracy#189, site build rule 2: copy first, then pictures). A frame
// is chosen and drawn from what the page says around it: its own card's words, the words that follow it up to the next
// picture of the page, and the heading of the section it sits in. Only the words the build wrote are read, never the
// template's demo text (that would describe the demo business). Pure and deterministic.

/** Text roles that carry what a section is about; links, video ids, prices, schedules and labels say nothing of a picture. */
const COPY_ROLE =
  /^(editorial\.(heading|subheading|paragraph|title|lead|eyebrow)|step\.(title|description)|offering\.(name|summary|description)|item\.(title|description)|feature\.(title|description))$/
/** The most characters of nearby copy one frame carries (a drawing prompt stays short, a ranking stays cheap). */
export const NEARBY_COPY_MAX = 400

const isCopy = (slot) => slot?.type === 'text' && COPY_ROLE.test(String(slot.role ?? ''))
const clean = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The written copy next to each image slot: the copy of its own group, then the copy that follows it in its entity until
 * the next image slot of another group, after the last heading before it. Slots with no written copy nearby are absent.
 * @param {{slots?: any[]}} contentMap
 * @param {Record<string, string> | null | undefined} written - the words the build writes, by slot key
 * @returns {Map<string, string>}
 */
export function nearbyCopyOf(contentMap, written) {
  const out = new Map()
  if (!written || typeof written !== 'object') return out
  const slots = contentMap?.slots ?? []
  const said = (slot) => (isCopy(slot) ? clean(written[slot.key]) : '')
  const byEntity = new Map()
  for (const slot of slots) byEntity.set(slot.entity, [...(byEntity.get(slot.entity) ?? []), slot])
  for (const list of byEntity.values())
    list.forEach((slot, index) => {
      if (slot.type !== 'image') return
      const group = slot.group?.id ?? null
      const own = group ? list.filter((s) => s.group?.id === group).map(said) : []
      const after = []
      for (const next of list.slice(index + 1)) {
        if (next.type === 'image' && (next.group?.id ?? null) !== group) break
        if (!group || next.group?.id !== group) after.push(said(next))
      }
      const heading = list
        .slice(0, index)
        .reverse()
        .find((s) => s.role === 'editorial.heading' && !s.group?.id && said(s))
      const text = [heading ? said(heading) : '', ...own, ...after]
        .filter(Boolean)
        .filter((t, i, all) => all.indexOf(t) === i)
        .join(' ')
      if (text)
        out.set(
          slot.key,
          text.length > NEARBY_COPY_MAX ? `${text.slice(0, NEARBY_COPY_MAX).replace(/\s+\S*$/, '')}` : text
        )
    })
  return out
}

/** Text roles that name what a whole page is about, best first. */
const TOPIC_ROLES = [
  'article.title',
  'offering.name',
  'editorial.title',
  'editorial.heading',
  'claim.heading'
]

/**
 * What each page (entity) is about, from the words the build wrote: its title, else its first written heading. Every
 * frame of the site is chosen and drawn with its page's topic (#189); entities with no written title are absent.
 * @param {{slots?: any[]}} contentMap
 * @param {Record<string, string> | null | undefined} written
 * @returns {Map<string, string>}
 */
export function pageTopicsOf(contentMap, written) {
  const out = new Map()
  if (!written || typeof written !== 'object') return out
  const best = new Map()
  for (const slot of contentMap?.slots ?? []) {
    const rank = TOPIC_ROLES.indexOf(String(slot.role ?? ''))
    const text = slot.type === 'text' && rank >= 0 ? clean(written[slot.key]) : ''
    if (!text || text.length > 120) continue
    if (!best.has(slot.entity) || rank < best.get(slot.entity)) {
      best.set(slot.entity, rank)
      out.set(slot.entity, text)
    }
  }
  return out
}

/** Words too common to tell two pictures apart. */
const STOP = new Set(
  'about after again also and are before being both but can come could each every first for from have here into just like more most much once only other our over such than that the their them then there these they this those through very want were what when where which while will with you your yours'.split(
    ' '
  )
)
/** The content words of a text: lower case, four letters or more, a plural folded to its singular. */
export function contentWords(text) {
  const words = clean(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return new Set(words)
}

/** What a labelled photo is said to show: its caption, subject and content kind, as words. */
const assetWords = (asset) =>
  contentWords(
    [asset?.caption, asset?.subject, asset?.content, asset?.alt]
      .filter((v) => typeof v === 'string')
      .join(' ')
  )

/**
 * How well a photo fits the copy next to its frame: the number of content words its labels share with that copy. Zero
 * when either says nothing; a ranking key, never a reason to refuse a photo.
 * @param {any} asset
 * @param {string | null | undefined} near
 */
export function nearbyFit(asset, near) {
  if (!near) return 0
  const want = contentWords(near)
  let hits = 0
  for (const word of assetWords(asset)) if (want.has(word)) hits += 1
  return hits
}
