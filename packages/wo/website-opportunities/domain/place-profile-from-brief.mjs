import { webAddress } from './place-profile.mjs'
import { offeringKindOf } from './offering-kind.mjs'
import { statedTradeOf } from './trades.mjs'
import { pick, present, profileAdapter } from './place-profile-adapter.mjs'

/** Read structured facts and quoted evidence only: section copy also contains generated text and instructions. */
export function placeProfileFromBrief(briefV1) {
  const b = briefV1.business
  const { profile, fact, link, classify, offering, finish } = profileAdapter(b, 'place-profile-from-brief/1')
  if (briefV1.madeAt) profile.madeAt = briefV1.madeAt
  for (const key of ['name', 'branch', 'address', 'phone', 'email', 'hours'])
    if (present(b[key])) profile.business[key] = fact(b[key], `$.business.${key}`)
  // Brief v1 omitted the food trade; all other trades were explicit.
  classify(b.trade ?? 'food', '$.business')
  if (b.cuisine?.length) profile.extensions['brief:cuisine'] = fact(b.cuisine, '$.business.cuisine')
  link('website', b.website, '$.business.website')
  for (const [kind, url] of Object.entries(b.socials ?? {})) link(kind, url, `$.business.socials.${kind}`)
  for (const [i, entry] of (briefV1.integrations ?? []).entries())
    link(entry.kind, entry.url, `$.integrations[${i}].url`)
  for (const [i, entry] of (briefV1.content?.links ?? []).entries())
    link(entry.kind, entry.url, `$.content.links[${i}].url`)

  const mediaById = new Map()
  for (const [i, asset] of (briefV1.assets ?? []).entries()) {
    const entry = fact(
      {
        ...pick(asset, ['kind', 'category', 'sha256', 'mime', 'width', 'height', 'caption', 'alt']),
        relations: [],
        restrictions: []
      },
      `$.assets[${i}]`
    )
    mediaById.set(asset.id, entry)
    profile.media.push(entry)
  }
  const seen = new Set()
  for (const [pi, page] of (briefV1.sitemap ?? []).entries()) {
    for (const [si, section] of (page.sections ?? []).entries()) {
      const path = `$.sitemap[${pi}].sections[${si}]`
      for (const key of ['menuItems', 'menuSuggestions']) {
        for (const [i, item] of (section[key] ?? []).entries()) {
          const signature = JSON.stringify([item.name, item.size, item.section, item.price, item.source])
          if (seen.has(signature)) continue
          seen.add(signature)
          const source = item.source ?? {}
          const provenance = source.url
            ? {
                kind: source.kind === 'photo' ? 'menu-photos' : 'menu-file',
                ref: source.url,
                ...(source.page ? { locator: { kind: 'pdfPage', value: source.page } } : {}),
                excerpt: [item.name, item.price].filter(present).join(' — ')
              }
            : undefined
          const result = offering(
            item,
            `${path}.${key}[${i}]`,
            provenance,
            offeringKindOf(item, statedTradeOf(profile))
          )
          const media = mediaById.get(item.photo?.assetId)
          if (media && item.photo.status === 'accepted') {
            const relation = fact(
              item.photo.evidence?.quote ?? item.name,
              `${path}.${key}[${i}].photo`,
              item.photo.evidence?.sourceUrl
                ? { kind: 'website', ref: item.photo.evidence.sourceUrl }
                : undefined
            )
            // The relation has provenance; the legacy approval itself is not a host assessment.
            media.value.relations.push({
              entityId: result.id,
              relation: 'depicts',
              evidenceRefs: relation.evidenceRefs
            })
          }
        }
      }
      for (const [i, evidence] of (section.evidence ?? []).entries()) {
        if (!evidence.quote) continue
        profile.quotes.push(
          fact(
            { kind: 'story', text: evidence.quote, restrictions: [] },
            `${path}.evidence[${i}]`,
            evidence.url ? { kind: evidence.source, ref: evidence.url, excerpt: evidence.quote } : undefined
          )
        )
      }
    }
  }
  for (const [i, item] of (briefV1.content?.items ?? []).entries()) {
    const post = item.posts?.[0] ?? {}
    profile.quotes.push(
      fact(
        {
          kind: 'post',
          text: item.body,
          ...pick(post, ['publishedAt']),
          ...(webAddress(post.url) ? { attribution: post.url } : {}),
          restrictions: []
        },
        `$.content.items[${i}]`,
        post.url ? { kind: post.source, ref: post.url, excerpt: item.body } : undefined
      )
    )
  }
  const colors = (briefV1.brand?.colors ?? [])
    .filter((c) => present(c.hex))
    .map((c) => pick(c, ['hex', 'role']))
  if (colors.length) profile.brand.colors = fact(colors, '$.brand.colors')
  const fonts = (briefV1.brand?.fonts ?? []).filter((f) => typeof f === 'string' && f)
  if (fonts.length) profile.brand.fonts = fact(fonts, '$.brand.fonts')
  if (typeof briefV1.brand?.tagline === 'string' && briefV1.brand.tagline)
    profile.brand.tagline = fact(briefV1.brand.tagline, '$.brand.tagline')
  const logo = mediaById.get(briefV1.brand?.logo)
  if (logo) {
    profile.brand.logo = fact({ mediaId: logo.id }, '$.brand.logo')
    logo.value.relations.push({
      entityId: profile.business.id,
      relation: 'logo-of',
      evidenceRefs: profile.brand.logo.evidenceRefs
    })
  }
  const google = briefV1.googlePlace
  if (google) {
    const provenance = google.placeId ? { kind: 'google-places', ref: google.placeId } : undefined
    for (const key of ['amenities', 'reservable'])
      if (present(google[key])) profile.business[key] = fact(google[key], `$.googlePlace.${key}`, provenance)
    // Hours the brief withholds (sources that disagree, or one source's unconfirmed 24/7) never come back from Google.
    const hoursWithheld = (briefV1.missing ?? []).some(
      (m) => m?.field === 'hours' && (m.conflicting?.length || m.withheld?.length)
    )
    if (!profile.business.hours && !hoursWithheld && google.openingHours?.length)
      profile.business.hours = fact(google.openingHours, '$.googlePlace.openingHours', provenance)
    for (const [kind, text] of Object.entries(google.summaries ?? {})) {
      if (!text) continue
      const quote = fact(
        {
          kind: 'story',
          text,
          attribution: 'Google',
          restrictions: []
        },
        `$.googlePlace.summaries.${kind}`,
        provenance
      )
      if (kind !== 'editorial')
        quote.derivation = { method: 'provider-generated-summary', version: 'unrecorded' }
      profile.quotes.push(quote)
    }
    for (const [i, review] of (google.reviews ?? []).entries())
      profile.quotes.push(
        fact(
          {
            kind: 'review',
            ...pick(review, ['text', 'author', 'language']),
            ...(review.publishTime ? { publishedAt: review.publishTime } : {}),
            attribution: pick(review, ['authorUri', 'authorAvatarUrl', 'googleMapsUri', 'rating']),
            restrictions: []
          },
          `$.googlePlace.reviews[${i}]`,
          provenance
        )
      )
    if (google.priceLevel)
      profile.extensions['brief:priceLevel'] = fact(google.priceLevel, '$.googlePlace.priceLevel', provenance)
  }
  for (const [i, missing] of (briefV1.missing ?? []).entries()) {
    if (!missing.conflicting?.length) continue
    const values = missing.conflicting.map((entry, j) =>
      fact(entry.hours, `$.missing[${i}].conflicting[${j}]`, { kind: entry.source })
    )
    profile.conflicts.push({ id: `conflict_${values[0].id}`, target: `business.${missing.field}`, values })
  }
  return finish()
}
