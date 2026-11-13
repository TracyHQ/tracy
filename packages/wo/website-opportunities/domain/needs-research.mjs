// The research the needs profile step reads (`buildNeedsProfile`, #592), made from the research brief a build stores
// (`wo_revision.brief`, made by `makeSiteBrief` / `buildBrief`, `brief.mjs`) and the asset manifest stored beside it
// (`wo_revision.asset_manifest`). Pure; ticket #597, gap G7.
//
// One research source per platform the brief names, its origin from the needs profile's trust order; what the owner
// typed on the Profile card (`owner`) is a source of origin `website`, the most trusted.
//   - a fact with a fact kind of the needs profile (`FIELD_KINDS`) is a structured field of every source its evidence
//     names, as it is (contact.hours held to the 200 characters of a fact value);
//   - a fact of a kind the needs profile reads from words (services, team, story, audience, posts, contact channels,
//     service areas) gives its evidence quotes to the `text` of the source that said them; a source with no quote (a
//     caption over 300 characters loses its quote in the brief) gives the fact's own text or name;
//   - a fact of a kind the needs profile has no place for (`NO_KIND`) is set aside with that reason;
//   - the opening hours Google lists (`googlePlace.openingHours`) when the brief holds no hours fact at all;
//   - the posts the brief keeps (`content.items`) are `captions` of their source, never one credited to someone else;
//   - Google's reviews the brief keeps; the own photos and videos it keeps for the site (`needs-research-media.mjs`).
// A fact the brief keeps off the site is not research for the site. Everything lands in exactly one place, counted in
// `taken`, or in `setAside` with a reason.
import { mediaOf } from './needs-research-media.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The longest fact value of Contract B (`facts[].value`): the plan shows the hours as one. */
export const HOURS_LIMIT = 200

/** The brief's source names (`brief-facts.mjs` evidence, `asset-origin.mjs` source) -> needs profile origin. */
const ORIGINS = Object.freeze({
  owner: 'website',
  website: 'website',
  google: 'google',
  'google-places': 'google',
  'google-maps': 'google',
  instagram: 'social',
  facebook: 'social',
  tiktok: 'social',
  x: 'social',
  twitter: 'social',
  youtube: 'social',
  linkedin: 'social',
  threads: 'social',
  pinterest: 'social'
})
const sourceIdOf = (name) => (ORIGINS[name] === 'google' ? 'google' : name === 'twitter' ? 'x' : name)

/** Brief fact field -> the needs profile's fact kind. */
export const FIELD_KINDS = Object.freeze({
  name: 'business.name',
  phone: 'contact.phone',
  email: 'contact.email',
  address: 'contact.address',
  hours: 'contact.hours',
  booking: 'contact.cta_url',
  socials: 'contact.social_url'
})
/** Brief fact fields the needs profile has no kind for, each with why. */
export const NO_KIND = Object.freeze({
  otherPhones: 'a second phone: the needs profile holds one phone, a second would read as a conflict',
  whatsapp: 'the needs profile has no WhatsApp kind',
  website: 'the address of the business own website: the needs profile has no kind for it',
  menu: 'a menu link: the needs profile has no menu kind (contact.cta_url is the booking link)',
  branch: 'the needs profile has no branch kind',
  googleRating: 'a rating: the needs profile reads ratings per review only',
  rating: 'a rating: the needs profile reads ratings per review only',
  socialFigures: 'follower counts: the needs profile has no kind for them'
})

const DAYS = [
  ['Monday', 'Mon'],
  ['Tuesday', 'Tue'],
  ['Wednesday', 'Wed'],
  ['Thursday', 'Thu'],
  ['Friday', 'Fri'],
  ['Saturday', 'Sat'],
  ['Sunday', 'Sun']
]
/** Hours lines as one value within `HOURS_LIMIT`: joined, then shortened (day names, "to", whole hours); else null. */
function hoursText(lines) {
  const joined = lines.map((l) => l.trim()).join('; ')
  if ([...joined].length <= HOURS_LIMIT) return joined
  let short = joined
    .replace(/\s+to\s+/g, '-')
    .replace(/:00\s?(AM|PM)/g, '$1')
    .replace(/\s(AM|PM)/g, '$1')
  for (const [day, abbr] of DAYS) short = short.replaceAll(day, abbr)
  return [...short].length <= HOURS_LIMIT ? short : null
}

/** A fact value as field text: a string, hours lines, a link's address; null when none fits. */
function fieldText(field, value) {
  if (field === 'hours') {
    const lines = isText(value) ? [value] : Array.isArray(value) ? value : list(value?.weekdays)
    return lines.length && lines.every(isText)
      ? hoursText(lines)
      : isText(value?.text)
        ? hoursText([value.text])
        : null
  }
  if (isText(value)) return value.trim()
  if (isText(value?.url)) return value.url.trim()
  return null
}

/** The words a fact gives a source that names it without a quote: its own text, name or label. */
const ownWords = (value) => [value, value?.text, value?.name, value?.label].find(isText)?.trim() ?? null

/**
 * The needs profile research of a stored research brief.
 * @param {object} brief the brief a build is made from (`wo_revision.brief`)
 * @param {{manifest?: Array<{id: string, sourceUrl?: string}>}} [stored] `manifest`: the asset manifest stored with
 *   the brief (`wo_revision.asset_manifest`), the only place a picture's address is kept
 * @returns {{sources: object[], videos: object[], setAside: Array<{what: string, id?: string, reason: string}>,
 *   taken: {fields: string[], text: string[], captions: number}}} `sources`: the `{sources}` input of
 *   `buildNeedsProfile`; `videos`: own video records for the pictures step; `taken`: the fact ids that became fields
 *   or text and the posts read as captions
 */
export function researchOf(brief, { manifest = [] } = {}) {
  const sources = new Map()
  const setAside = []
  const taken = { fields: [], text: [], captions: 0 }
  const sourceOf = (name) => {
    if (!ORIGINS[name]) return null
    const id = sourceIdOf(name)
    if (!sources.has(id))
      sources.set(id, {
        id,
        origin: ORIGINS[name],
        text: [],
        captions: [],
        fields: {},
        reviews: [],
        pictures: []
      })
    return sources.get(id)
  }
  const addField = (source, kind, value) => {
    const held = list(source.fields[kind])
    if (!held.includes(value)) source.fields[kind] = [...held, value]
  }
  const addText = (source, words) => {
    if (!source.text.includes(words)) source.text.push(words)
  }
  const facts = list(brief?.facts)
  for (const fact of facts) {
    const aside = (reason) => setAside.push({ what: 'fact', id: fact?.id, reason })
    if (fact?.sourceKind === 'observed') aside('seen in a photo, not said by a source')
    else if (fact?.onSite === false) aside('kept off the site')
    else if (NO_KIND[fact?.field]) aside(NO_KIND[fact.field])
    else if (FIELD_KINDS[fact?.field]) {
      const value = fieldText(fact.field, fact.value)
      const named = list(fact.evidence)
        .map((e) => sourceOf(e?.source))
        .filter(Boolean)
      if (value === null)
        aside(
          fact.field === 'hours'
            ? `hours longer than ${HOURS_LIMIT} characters, or unreadable`
            : 'no readable value'
        )
      else if (named.length === 0) aside('no known source names it')
      else {
        for (const source of named) addField(source, FIELD_KINDS[fact.field], value)
        taken.fields.push(fact.id)
      }
    } else {
      let used = false
      for (const evidence of list(fact?.evidence)) {
        const source = sourceOf(evidence?.source)
        const words = isText(evidence?.quote) ? evidence.quote.trim() : ownWords(fact.value)
        if (!source || !words) continue
        addText(source, words)
        used = true
      }
      if (used) taken.text.push(fact.id)
      else aside('no words from a known source')
    }
  }
  const hoursFact = facts.some((f) => f?.field === 'hours')
  const opening = list(brief?.googlePlace?.openingHours).filter(isText)
  if (!hoursFact && opening.length) {
    const value = hoursText(opening)
    if (value) addField(sourceOf('google'), 'contact.hours', value)
    else
      setAside.push({
        what: 'opening hours',
        reason: `Google's hours are longer than ${HOURS_LIMIT} characters`
      })
  }
  for (const item of list(brief?.content?.items)) {
    const source = sourceOf(item?.posts?.[0]?.source)
    const body = [item?.heading, item?.body].filter(isText).join('\n')
    if (item?.credited) setAside.push({ what: 'post', reason: 'credited to someone else' })
    else if (!source || !body) setAside.push({ what: 'post', reason: 'no words from a known source' })
    else {
      source.captions.push(body)
      taken.captions += 1
    }
  }
  for (const review of list(brief?.googlePlace?.reviews)) {
    if (!isText(review?.text)) continue
    sourceOf('google').reviews.push({
      ...(isText(review.author) ? { author: review.author } : {}),
      text: review.text,
      ...(review.rating !== undefined && review.rating !== null ? { rating: review.rating } : {})
    })
  }
  const media = mediaOf(brief, manifest, sourceOf)
  setAside.push(...media.setAside)
  return {
    sources: [...sources.values()].map(({ text, captions, fields, reviews, pictures, ...source }) => ({
      ...source,
      ...(text.length ? { text: text.join('\n') } : {}),
      ...(captions.length ? { captions } : {}),
      ...(Object.keys(fields).length
        ? {
            fields: Object.fromEntries(
              Object.entries(fields).map(([kind, values]) => [kind, values.length === 1 ? values[0] : values])
            )
          }
        : {}),
      ...(reviews.length ? { reviews } : {}),
      ...(pictures.length ? { pictures } : {})
    })),
    videos: media.videos,
    setAside,
    taken
  }
}
