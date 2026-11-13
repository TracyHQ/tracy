// The research the needs profile step reads (`buildNeedsProfile`, #592), made from the research brief a build stores
// (`wo_revision.brief`, made by `makeSiteBrief` / `buildBrief`, `brief.mjs`) and, for the pictures' addresses, the asset
// manifest stored beside it (`wo_revision.asset_manifest`). Pure; ticket #597, gap G7.
//
// One research source per platform the brief's evidence names, its origin from the needs profile's trust order:
//   - facts with a fact kind of the needs profile (name, phone, email, address, hours, booking link, social links) are
//     structured `fields` of every source their evidence names (taken as they are, like listing fields);
//   - every other fact (services, team, story, audience, posts, service areas) gives its evidence quotes to the `text`
//     of the source that said them, so the model reads them in that source's own words and must cite them;
//   - Google's reviews the brief keeps are the google source's `reviews`;
//   - the business's own photos (`assets`, never a guest's) are `pictures` of the source they came from, with the
//     manifest's address as `ref` and the vision caption as `label`.
// A fact the brief keeps off the site (`onSite: false`) is not research for the site. Whatever is left out is listed in
// `setAside` with a reason, never dropped silently.
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The brief's source names (`brief-facts.mjs` evidence, `asset-origin.mjs` source) -> needs profile origin. */
const ORIGINS = Object.freeze({
  website: 'website',
  google: 'google',
  'google-places': 'google',
  'google-maps': 'google',
  instagram: 'social',
  facebook: 'social',
  tiktok: 'social',
  x: 'social',
  youtube: 'social',
  linkedin: 'social',
  threads: 'social',
  pinterest: 'social'
})
/** One source per platform: Google's two collectors are one Google, as the brief names them. */
const sourceIdOf = (name) => (ORIGINS[name] === 'google' ? 'google' : name)

/** Brief fact field -> the needs profile's fact kind, and how its value reads as text. */
const FIELD_KINDS = Object.freeze({
  name: 'business.name',
  phone: 'contact.phone',
  email: 'contact.email',
  address: 'contact.address',
  hours: 'contact.hours',
  booking: 'contact.cta_url',
  socials: 'contact.social_url'
})

/** A fact value as text: a string, a list of strings joined, or a link's address. */
function valueText(value) {
  if (isText(value)) return value.trim()
  if (Array.isArray(value) && value.length && value.every(isText))
    return value.map((v) => v.trim()).join('; ')
  if (isText(value?.url)) return value.url.trim()
  return null
}

/**
 * The needs profile research of a stored research brief.
 * @param {object} brief the brief a build is made from (`wo_revision.brief`)
 * @param {{manifest?: Array<{id: string, sourceUrl?: string}>}} [stored] `manifest`: the asset manifest stored with
 *   the brief (`wo_revision.asset_manifest`), the only place a picture's address is kept
 * @returns {{sources: Array<{id: string, origin: string, text?: string, fields?: object, reviews?: object[],
 *   pictures?: object[]}>, setAside: Array<{what: string, id?: string, reason: string}>}} the `{sources}` input of
 *   `buildNeedsProfile`, plus what was set aside
 */
export function researchOf(brief, { manifest = [] } = {}) {
  const sources = new Map()
  const setAside = []
  const sourceOf = (name) => {
    const origin = ORIGINS[name]
    if (!origin) return null
    const id = sourceIdOf(name)
    if (!sources.has(id)) sources.set(id, { id, origin, quotes: [], fields: {}, reviews: [], pictures: [] })
    return sources.get(id)
  }
  for (const fact of list(brief?.facts)) {
    if (fact?.sourceKind === 'observed') {
      setAside.push({ what: 'fact', id: fact.id, reason: 'seen in a photo, not said by a source' })
      continue
    }
    if (fact?.onSite === false) {
      setAside.push({ what: 'fact', id: fact?.id, reason: 'kept off the site' })
      continue
    }
    const kind = FIELD_KINDS[fact?.field]
    const value = kind ? valueText(fact.value) : null
    let used = false
    for (const evidence of list(fact?.evidence)) {
      const source = sourceOf(evidence?.source)
      if (!source) continue
      if (kind && value) {
        const held = list(source.fields[kind])
        if (!held.includes(value)) source.fields[kind] = [...held, value]
        used = true
      } else if (!kind && isText(evidence.quote)) {
        if (!source.quotes.includes(evidence.quote.trim())) source.quotes.push(evidence.quote.trim())
        used = true
      }
    }
    if (!used)
      setAside.push({
        what: 'fact',
        id: fact?.id,
        reason: kind ? 'no readable value from a known source' : 'no quote from a known source'
      })
  }
  for (const review of list(brief?.googlePlace?.reviews)) {
    if (!isText(review?.text)) continue
    sourceOf('google').reviews.push({
      ...(isText(review.author) ? { author: review.author } : {}),
      text: review.text,
      ...(review.rating !== undefined && review.rating !== null ? { rating: review.rating } : {})
    })
  }
  const addresses = new Map(list(manifest).map((m) => [m?.id, m?.sourceUrl]))
  for (const asset of list(brief?.assets)) {
    if (asset?.kind !== 'image') continue
    const reason =
      asset.uploaderRole === 'customer'
        ? 'a guest photo, not the business own'
        : !isText(addresses.get(asset.id))
          ? 'no address in the asset manifest'
          : !ORIGINS[asset.source]
            ? 'from a source outside the trust order'
            : null
    if (reason) {
      setAside.push({ what: 'picture', id: asset?.id, reason })
      continue
    }
    sourceOf(asset.source).pictures.push({
      id: asset.id,
      ref: addresses.get(asset.id),
      ...(isText(asset.caption) ? { label: asset.caption } : {})
    })
  }
  return {
    sources: [...sources.values()].map(({ quotes, fields, reviews, pictures, ...source }) => ({
      ...source,
      ...(quotes.length ? { text: quotes.join('\n') } : {}),
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
    setAside
  }
}
