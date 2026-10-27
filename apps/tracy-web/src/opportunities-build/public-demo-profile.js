import { statedTradeOf } from 'website-opportunities/domain/trades.mjs'
import { assessProfile } from './fact-assessment.js'

/** The v2 business as the existing importer reads it; the original profile stays in the frozen request. */
export function snapshotRequest(request, { at } = {}) {
  if (request.schema !== 'website-opportunities/demo-request/v2') return request
  const p = request.profile
  const assessments = assessProfile(p, { origin: 'sender', at })
  const byId = new Map(assessments.map((f) => [f.factId, f]))
  const accepted = new Set(assessments.filter((f) => f.status === 'accepted').map((f) => f.factId))
  // Media, brand and booking remain observations in the legacy importer, never verified facts.
  const usable = (f) => {
    const a = byId.get(f?.id)
    return (
      a?.status === 'accepted' ||
      (a?.status === 'unassessed' && a.reasonCodes.includes('sender-unsupported-fact'))
    )
  }
  const excluded = new Map()
  for (const f of [...p.media, ...(p.brand.logo ? [p.brand.logo] : [])])
    if (!usable(f)) excluded.set(f.value.url, `profile_${byId.get(f.id).status}`)
  const tradeAccepted = p.classification.derivedCategories.some(
    (f) => accepted.has(f.id) && f.value.taxonomy === 'tracy-trade'
  )
  const b = Object.fromEntries(Object.entries(p.business).filter(([, f]) => accepted.has(f?.id)))
  const link = (kind) => p.links.find((f) => f.value.kind === kind && usable(f))?.value.url
  const mediaOf = (entityId) =>
    p.media.filter(
      (f) =>
        !excluded.has(f.value.url) &&
        f.value.relations.some((r) => r.entityId === entityId && r.relation === 'depicts')
    )
  const items = p.offerings
    .filter((f) => accepted.has(f.id))
    .flatMap((f) => {
      const item = f.value
      const photos = mediaOf(f.id)
      // Variants keep their own price; a group with no variant still has its name.
      return (item.variants.length ? item.variants : [{}]).map((v) => ({
        name: item.name,
        section: item.section,
        description: item.description,
        size: v.size,
        price: v.price?.raw,
        currency: v.price?.currency,
        priceScale: v.price?.priceScale,
        ...(photos.length === 1 ? { photo: photos[0].value.url } : {})
      }))
    })
  return {
    ...request,
    skippedPhotos: request.photos.flatMap((p, index) =>
      excluded.has(p.url) ? [{ index, reason: excluded.get(p.url) }] : []
    ),
    business: {
      name: b.name?.value,
      address: b.address?.value,
      phone: b.phone?.value ?? b.internationalPhoneNumber?.value ?? b.nationalPhoneNumber?.value,
      email: b.email?.value,
      hours: b.hours?.value,
      ...(b.location
        ? { location: { lat: b.location.value.latitude, lon: b.location.value.longitude } }
        : {}),
      website: link('website'),
      // No accepted stated trade is no category: the importer then keeps its legacy default (`defaultOfferingKind`).
      category: tradeAccepted ? (statedTradeOf(p) ?? undefined) : undefined,
      socials: Object.fromEntries(
        ['facebook', 'instagram', 'tiktok', 'youtube', 'x'].filter((k) => link(k)).map((k) => [k, link(k)])
      ),
      items
    },
    brand: {
      logo:
        usable(p.brand.logo) && !excluded.has(p.brand.logo.value.url) ? p.brand.logo.value.url : undefined,
      colors: (usable(p.brand.colors) ? p.brand.colors.value : [])
        .filter((c) => typeof c?.hex === 'string' && /^#[0-9a-f]{6}$/i.test(c.hex))
        .map((c) => ({ hex: c.hex, ...(typeof c.role === 'string' ? { role: c.role } : {}) }))
    },
    links: { menu: link('menu'), booking: link('booking') }
  }
}
