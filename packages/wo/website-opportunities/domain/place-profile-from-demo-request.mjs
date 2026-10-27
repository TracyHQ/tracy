import { webAddress } from './place-profile.mjs'
import { offeringKindOf } from './offering-kind.mjs'
import { statedTradeOf } from './trades.mjs'
import { pick, present, profileAdapter } from './place-profile-adapter.mjs'

/** v1 states facts but carries no provenance; URLs in it are values, never evidence of verification. */
export function placeProfileFromDemoRequest(requestV1) {
  const b = requestV1.business
  const { profile, fact, link, classify, offering, finish } = profileAdapter(
    b,
    'place-profile-from-demo-request/1'
  )
  for (const key of ['name', 'address', 'phone', 'hours'])
    if (present(b[key])) profile.business[key] = fact(b[key], `$.business.${key}`)
  if (b.location)
    profile.business.location = fact(
      { latitude: b.location.lat, longitude: b.location.lon },
      '$.business.location'
    )
  classify(b.category, '$.business.category')
  link('website', b.website, '$.business.website')
  for (const [kind, url] of Object.entries(b.socials ?? {})) link(kind, url, `$.business.socials.${kind}`)
  for (const [kind, url] of Object.entries(requestV1.links ?? {})) link(kind, url, `$.links.${kind}`)
  if (b.description)
    profile.quotes.push(
      fact({ kind: 'story', text: b.description, restrictions: [] }, '$.business.description')
    )
  const mediaByUrl = new Map()
  function photo(value, path) {
    if (!webAddress(value.url)) return undefined
    if (mediaByUrl.has(value.url)) return mediaByUrl.get(value.url)
    const result = fact(
      { kind: 'image', ...pick(value, ['url', 'caption', 'alt']), restrictions: [], relations: [] },
      path
    )
    profile.media.push(result)
    mediaByUrl.set(value.url, result)
    return result
  }
  for (const [i, p] of (requestV1.photos ?? []).entries()) photo(p, `$.photos[${i}]`)
  for (const [i, item] of (b.items ?? []).entries()) {
    const kind = offeringKindOf(item, statedTradeOf(profile))
    const result = offering(item, `$.business.items[${i}]`, undefined, kind)
    const media = mediaByUrl.get(item.photo)
    if (media)
      media.value.relations.push({
        entityId: result.id,
        relation: 'depicts',
        evidenceRefs: [...result.evidenceRefs]
      })
  }
  if (requestV1.brand?.colors?.length)
    profile.brand.colors = fact(
      requestV1.brand.colors.map((c) => pick(c, ['hex', 'role'])),
      '$.brand.colors'
    )
  const logo = requestV1.brand?.logo && photo({ url: requestV1.brand.logo }, '$.brand.logo.media')
  if (logo) {
    profile.brand.logo = fact({ mediaId: logo.id, url: logo.value.url }, '$.brand.logo')
    logo.value.relations.push({
      entityId: profile.business.id,
      relation: 'logo-of',
      evidenceRefs: [...profile.brand.logo.evidenceRefs]
    })
  }
  for (const [i, post] of (requestV1.posts ?? []).entries()) {
    const result = fact(
      {
        kind: 'post',
        text: post.text,
        ...pick(post, ['publishedAt']),
        attribution: pick({ ...post, url: webAddress(post.url) }, ['url', 'source']),
        restrictions: []
      },
      `$.posts[${i}]`
    )
    profile.quotes.push(result)
    for (const url of post.photos ?? []) {
      const media = mediaByUrl.get(url)
      if (media && !media.value.relations.some((r) => r.entityId === result.id))
        media.value.relations.push({
          entityId: result.id,
          relation: 'illustrates',
          evidenceRefs: [...result.evidenceRefs]
        })
    }
  }
  return finish()
}
