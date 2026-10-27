/** App-owned, additive brief extension: review quotations never supply business facts. */
export function addReviewSources(brief, profile) {
  const tripadvisor = profile?.reviewSources?.tripadvisor
  const googleMaps = profile?.reviewSources?.googleMaps
  if (!tripadvisor && !googleMaps) return brief
  const photos = new Map(
    [tripadvisor, googleMaps]
      .flatMap((source) => source?.media ?? [])
      .filter((photo) => photo.mediaId)
      .map((photo) => [photo.mediaId, photo])
  )
  const currentMenuIds = (googleMaps?.menuPhotos ?? []).flatMap((photo) =>
    photo.mediaId ? [photo.mediaId] : []
  )
  const menuIds = new Set([
    ...(brief.assets ?? []).filter((asset) => asset.category === 'menu').map((asset) => asset.id),
    ...currentMenuIds
  ])
  const sitemap = (brief.sitemap ?? []).map((page) => ({
    ...page,
    sections: (page.sections ?? []).map((section) => {
      if (section.kind === 'menu' || !(section.assetIds ?? []).some((id) => menuIds.has(id))) return section
      const assetIds = (section.assetIds ?? []).filter((id) => !menuIds.has(id))
      if (section.kind !== 'hero') return { ...section, assetIds }
      // A menu photo is no hero: the hero keeps its other candidates, and none is put in their place (#1780).
      const { heroCandidates: _candidates, ...hero } = section
      const heroCandidates = (section.heroCandidates ?? []).filter((h) => !menuIds.has(h.id))
      return { ...hero, assetIds, ...(heroCandidates.length ? { heroCandidates } : {}) }
    })
  }))
  // What a model read off these photos is in the brief's own menu items (`buildBrief`), each with its photo as source.
  const readings = (profile?.menuItems ?? []).filter((item) => item?.source?.kind === 'photo')
  if (currentMenuIds.length) {
    const section = {
      kind: 'menu',
      copy: 'Photographed menu sources from Google Maps; they may be outdated or promotional. A dish or price read off them is collected data, shown as read and never replaced.',
      assetIds: [...new Set(currentMenuIds)],
      evidence: googleMaps.menuPhotos.map((photo) => ({ source: 'Google Maps menu photo', url: photo.url }))
    }
    const menu = sitemap.find((page) => page.slug === 'menu')
    if (menu) menu.sections.push(section)
    else sitemap.push({ slug: 'menu', title: 'Menu', sections: [section] })
  }
  return {
    ...brief,
    ...(brief.sitemap ? { sitemap } : {}),
    ...(currentMenuIds.length && brief.missing
      ? {
          missing: brief.missing.map((item) =>
            // A place with no known trade reports its list as 'offerings'; menu photos make it a menu all the same.
            item.field === 'menu' || item.field === 'offerings'
              ? {
                  field: 'structured-menu',
                  why: readings.length
                    ? 'Only photographed menu sources were found; the items and prices read from photographs are not verified against a text of the restaurant.'
                    : 'Only photographed menu sources were found; current items, prices and availability have not been extracted or verified.'
                }
              : item
          )
        }
      : {}),
    assets: (brief.assets ?? []).map((asset) => {
      const photo = photos.get(asset.id)
      return photo
        ? {
            ...asset,
            source: photo.credit?.provider === 'Google' ? 'google-maps' : 'tripadvisor',
            sourceUrl: photo.url,
            ...(menuIds.has(asset.id) ? { category: 'other', sourceCategory: 'menu' } : {}),
            postId: photo.postId,
            credit: photo.credit
          }
        : menuIds.has(asset.id)
          ? { ...asset, category: 'other', sourceCategory: 'menu' }
          : asset
    }),
    reviewSources: { ...(tripadvisor ? { tripadvisor } : {}), ...(googleMaps ? { googleMaps } : {}) }
  }
}

/** Re-render old and new revisions through the same path at creation and handoff. */
export function renderBriefWithReviews(domain, brief) {
  const markdown = renderMapsSources(domain.renderBriefMarkdown(brief), brief?.reviewSources?.googleMaps)
  const source = brief?.reviewSources?.tripadvisor
  if (!source) return markdown
  const lines = [
    markdown,
    '',
    '## Collected TripAdvisor reviews',
    '',
    'These are guest opinions, not evidence of business facts. Quote them word for word with the real author in testimonial areas; credit TripAdvisor and link the review where the area can show it. Never infer menu, services, amenities or business history from a review.',
    '',
    `Reviews for ${JSON.stringify(source.name)} on TripAdvisor: ${JSON.stringify(source.url)}. Fetched: ${JSON.stringify(source.fetchedAt)}.`
  ]
  if (source.match?.scope === 'brand' || source.scope === 'brand')
    lines.push(
      `This is a restaurant/brand review source for ${JSON.stringify(source.name)}, at ${JSON.stringify(source.address ?? source.market)}. It is not verified as the selected Google branch. Do not present its rating, reviews or photographs as branch-specific evidence; keep the actual TripAdvisor listing name and source visible.`
    )
  if (typeof source.rating === 'number')
    lines.push(
      `TripAdvisor rating: ${source.rating}; review count: ${source.reviewCount ?? 'unknown'}. Keep this separate from Google ratings.`
    )
  for (const r of source.reviews ?? []) {
    lines.push(
      `- ${JSON.stringify(r.text)} — ${JSON.stringify(r.author)} · TripAdvisor · ${JSON.stringify(r.url)}${r.authorUrl ? ` · Author profile: ${JSON.stringify(r.authorUrl)}` : ''}${r.date ? ` · ${JSON.stringify(r.date)}` : ''}`
    )
    if (r.authorAvatarUrl)
      lines.push(
        `  Author avatar (reviewer identity only, not venue photography): ${JSON.stringify(r.authorAvatarUrl)}.`
      )
    for (const photo of r.photos ?? [])
      lines.push(
        `  Attached review photo: ${JSON.stringify(photo.url)}; review: ${JSON.stringify(r.id)}; source: ${JSON.stringify(photo.sourceUrl)}${photo.mediaId ? `; stored mediaId: ${JSON.stringify(photo.mediaId)}` : ''}. Keep this photo associated with this quotation; no photographer is inferred from the review author.`
      )
  }
  for (const photo of source.media ?? []) {
    if (photo.credit?.photoSource !== 'gallery') continue
    lines.push(
      `- TripAdvisor gallery photo: ${JSON.stringify(photo.url)}; listing source: ${JSON.stringify(photo.credit.sourceUrl)}${photo.mediaId ? `; stored mediaId: ${JSON.stringify(photo.mediaId)}` : ''}. Credit: TripAdvisor; photographer not supplied. Do not infer brand colors or business facts from guest photography.`
    )
  }
  return lines.join('\n')
}

/** Menu images are source documents, not an extracted list of dishes or current prices. */
function renderMapsSources(markdown, source) {
  if (!source) return markdown
  const lines = [
    markdown,
    '',
    '## Supplemental Google Maps sources',
    '',
    `Exact Google place: ${JSON.stringify(source.placeId)}; source: ${JSON.stringify(source.url)}. Official Google Place facts remain separate.`
  ]
  for (const review of source.reviews ?? []) {
    lines.push(
      `- ${JSON.stringify(review.text)} — ${JSON.stringify(review.author)} on Google; ${JSON.stringify(review.url)}${review.authorUrl ? `; author profile: ${JSON.stringify(review.authorUrl)}` : ''}${review.authorAvatarUrl ? `; reviewer avatar (identity only): ${JSON.stringify(review.authorAvatarUrl)}` : ''}. Guest opinion, not business-fact evidence.`
    )
    for (const photo of review.photos ?? [])
      lines.push(
        `  Attached review photo: ${JSON.stringify(photo.url)}; reviewId: ${JSON.stringify(review.id)}; source: ${JSON.stringify(photo.sourceUrl)}${photo.mediaId ? `; stored mediaId: ${JSON.stringify(photo.mediaId)}` : ''}. Do not infer photographer from reviewer.`
      )
  }
  if (source.menuPhotos?.length) {
    lines.push(
      '',
      '### Photographed menu sources',
      '',
      `Collected: ${JSON.stringify(source.menuFetchedAt)}. These are images of menus, possibly old or promotional; what is read off them is collected data, shown as read and never replaced. Do not use menu pages as hero photography or brand colors.`
    )
    for (const photo of source.menuPhotos)
      lines.push(
        `- Google Maps menu photo: ${JSON.stringify(photo.url)}; listing: ${JSON.stringify(source.url)}${photo.mediaId ? `; stored mediaId: ${JSON.stringify(photo.mediaId)}` : ''}.`
      )
  }
  return lines.join('\n')
}
