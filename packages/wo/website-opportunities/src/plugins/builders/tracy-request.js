/**
 * The body the `tracy` builder sends to `POST /v1/demos`: the public contract `website-opportunities/demo-request/v1`.
 * Facts about the business and links to its public photos, nothing else: no internal ids, no storage keys, no
 * "verified" labels. Tracy treats every string in it as untrusted data.
 *
 * `toDemoRequest(place, research)`: `place` is the saved opportunity (`opportunityOf` in `../../brief-research.js`),
 * `research` the site brief made from its research (`makeSiteBrief`). A value research did not find is left out.
 * `accepts` is what the host announced at `GET /v1/demos/options`: an optional part of the contract goes only to a host
 * that takes it, and a fact a host would misread without its part (a shortened price without its scale) is left out.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from '../../canonical-json.js'
import {
  DEMO_REQUEST_LIMITS,
  DEMO_REQUEST_SCHEMA,
  DEMO_REQUEST_V2_SCHEMA
} from '../../../domain/demo-request.mjs'
import { placeProfileForHost } from '../../../domain/place-profile-for-host.mjs'
import { placeProfileFromResearch } from '../../../domain/place-profile-from-research.mjs'

export { DEMO_REQUEST_SCHEMA }
const MAX_PHOTOS = DEMO_REQUEST_LIMITS.photos
const MAX_ITEMS = DEMO_REQUEST_LIMITS.items
const TEXT_MAX = 2000
const CMS = new Set(['wordpress', 'joomla', 'emdash'])
// The networks demo-request/v1 names; any other is left out rather than refused.
const SOCIAL = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x'])

const PRICE_SCALES = new Set([1000, 10000, 1000000])
const POST_SOURCES = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'website'])
const HEX = /^#[0-9a-f]{6}$/i
const POST_TEXT_MAX = DEMO_REQUEST_LIMITS.postText
// A dish photo the brief accepted, or one its menu card itself shows: never a candidate read from a post or caption.
const sendablePhoto = (p) =>
  p && (p.status === 'accepted' || p.how === 'menu-card') && typeof p.assetId === 'string'

const text = (v, max = TEXT_MAX) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/** An https (or, with `http`, also http) address on a public name: no credentials, no IP literal, no local name. */
export function publicHttpsUrl(value, { http = false } = {}) {
  if (typeof value !== 'string' || value.length > 2000) return undefined
  let u
  try {
    u = new URL(value)
  } catch {
    return undefined
  }
  const host = u.hostname.toLowerCase()
  if (!(u.protocol === 'https:' || (http && u.protocol === 'http:')) || u.username || u.password || u.port)
    return undefined
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return undefined
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return undefined
  return u.href
}

function locationOf(candidate) {
  const lat = Number(candidate?.lat)
  const lon = Number(candidate?.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon }
    : undefined
}

function socialsOf(...sources) {
  const out = {}
  for (const source of sources)
    for (const [network, url] of Object.entries(source ?? {}))
      if (SOCIAL.has(network) && !out[network] && publicHttpsUrl(url)) out[network] = publicHttpsUrl(url)
  return Object.keys(out).length ? out : undefined
}

function descriptionOf(googlePlace) {
  const s = googlePlace?.summaries
  if (typeof s === 'string') return text(s)
  for (const key of ['editorial', 'overview', 'generative', 'description'])
    if (text(s?.[key]) ?? text(s?.[key]?.text)) return text(s[key]) ?? text(s[key].text)
  return undefined
}

/** Every dish of the brief's menu (`sitemap[].sections[].menuItems[]`), in its order. */
const menuItemsOf = (sitemap) =>
  (Array.isArray(sitemap) ? sitemap : []).flatMap((page) =>
    (page?.sections ?? []).flatMap((section) => section?.menuItems ?? [])
  )

/**
 * The dishes of the brief's menu, each once by name, size and section. The price goes as printed; a shortened one
 * (`priceScale`) only to a host that takes its scale. A post (`content.items`) is never a dish.
 */
function itemsOf(sitemap, accepts, photoUrlOf) {
  const seen = new Set()
  const items = []
  for (const i of menuItemsOf(sitemap)) {
    const name = text(i?.name, 200)
    if (!name) continue
    const size = text(i.size, DEMO_REQUEST_LIMITS.size)
    const key = JSON.stringify([name, size ?? null, text(i.section) ?? null])
    if (seen.has(key)) continue
    seen.add(key)
    const price = text(i.price, 40)
    const scale = price && PRICE_SCALES.has(i.priceScale) ? i.priceScale : undefined
    const priced = scale === undefined || accepts.has('items.priceScale')
    const sized = accepts.has('items.size')
    items.push(
      prune({
        // A host without sizes still tells two sizes of one dish apart: the printed size goes with the name.
        name: sized || !size ? name : `${name} (${size})`.slice(0, 200),
        size: sized ? size : undefined,
        price: priced ? price : undefined,
        priceScale: priced ? scale : undefined,
        currency: priced ? text(i.currency, 8) : undefined,
        section: text(i.section, 100),
        photo: accepts.has('items.photo') && sendablePhoto(i.photo) ? photoUrlOf(i.photo.assetId) : undefined
      })
    )
    if (items.length === MAX_ITEMS) break
  }
  return items.length ? items : undefined
}

/**
 * The brief's images, in its order, at the public address their research row was read from; the dish photos `first`
 * goes before them, so a dish keeps its photo within the limit.
 */
function photosOf(assets, rowOf, first = []) {
  const seen = new Set()
  const photos = []
  const images = (assets ?? []).filter((a) => a?.kind === 'image')
  for (const id of [...first, ...images.map((a) => a.id)]) {
    const row = rowOf.get(id)
    const url = !row?.kind || row.kind === 'image' ? publicHttpsUrl(row?.sourceUrl) : undefined
    if (!url || seen.has(url)) continue
    seen.add(url)
    const asset = images.find((a) => a.id === id)
    photos.push(prune({ url, caption: text(row?.caption, 500), alt: text(asset?.alt ?? row?.alt, 500) }))
    if (photos.length === MAX_PHOTOS) break
  }
  return photos
}

/** The brand's logo (an asset id) at its public address, and its colours. */
function brandOf(brand, rowOf) {
  const logo = typeof brand?.logo === 'string' ? publicHttpsUrl(rowOf.get(brand.logo)?.sourceUrl) : undefined
  const colors = (Array.isArray(brand?.colors) ? brand.colors : [])
    .filter((c) => typeof c?.hex === 'string' && HEX.test(c.hex))
    .slice(0, DEMO_REQUEST_LIMITS.colors)
    .map((c) => prune({ hex: c.hex, role: text(c.role, DEMO_REQUEST_LIMITS.colorRole) }))
  const out = prune({ logo, colors: colors.length ? colors : undefined })
  return Object.keys(out).length ? out : undefined
}

/** The menu and booking links the brief holds: the business's posts first, then its menu sources and booking links. */
function linksOf(research) {
  const links = research?.content?.links ?? []
  const first = (urls) => urls.map((u) => publicHttpsUrl(u)).find(Boolean)
  const evidence = (Array.isArray(research?.sitemap) ? research.sitemap : [])
    .flatMap((p) => p?.sections ?? [])
    .filter((s) => s?.kind === 'menu')
    .flatMap((s) => s.evidence ?? [])
    .filter((e) => e?.source !== 'menu photo')
  const bookings = (research?.integrations ?? []).filter((x) => x?.kind === 'booking')
  const out = prune({
    menu: first([
      ...links.filter((l) => l?.kind === 'menu').map((l) => l.url),
      ...evidence.map((e) => e.url)
    ]),
    booking: first([
      ...bookings.filter((x) => x.verified === true).map((x) => x.url),
      ...bookings.map((x) => x.url),
      ...links.filter((l) => l?.kind === 'booking').map((l) => l.url)
    ])
  })
  return Object.keys(out).length ? out : undefined
}

/** The business's posts the brief made content of; a post's photos only those already among the request's. */
function postsOf(content, media, sent) {
  const posts = (content?.items ?? [])
    .filter((i) => text(i?.body))
    .slice(0, DEMO_REQUEST_LIMITS.posts)
    .map((i) => {
      const from = i.posts?.[0] ?? {}
      const time = typeof from.publishedAt === 'string' ? Date.parse(from.publishedAt) : Number.NaN
      const photos = from.id
        ? [
            ...new Set(
              (media ?? [])
                .filter((m) => m?.postId === from.id)
                .map((m) => publicHttpsUrl(m.sourceUrl))
                .filter((u) => u && sent.has(u))
            )
          ]
        : []
      return prune({
        text: text(i.body, POST_TEXT_MAX),
        url: publicHttpsUrl(from.url),
        publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : undefined,
        source: from.source ? (POST_SOURCES.has(from.source) ? from.source : 'other') : undefined,
        photos: photos.length ? photos : undefined
      })
    })
  return posts.length ? posts : undefined
}

/** The object without its undefined fields. */
const prune = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/**
 * @param {{ name?: string, candidate?: object }} place
 * @param {object | null} research  the site brief, or null when none could be made
 * @param {{ cms?: string, template?: { quickstart?: string, design?: string } }} [choice]
 * @param {{ id: string, sourceUrl?: string }[]} [media]  the research rows behind the brief's assets (the brief keeps no address)
 * @param {string[]} [accepts]  the optional parts the host announced (`DEMO_REQUEST_CAPABILITIES`)
 */
export function toDemoRequest(place, research, choice = {}, media = [], accepts = []) {
  const takes = new Set(accepts)
  const b = research?.business ?? {}
  const c = place?.candidate ?? {}
  const name = text(b.name) ?? text(place?.name) ?? text(c.name)
  if (!name) return null
  const hours = Array.isArray(b.hours) ? b.hours.map((h) => text(h, 200)).filter(Boolean) : []
  const template = prune({
    quickstart: text(choice.template?.quickstart, 200),
    design: text(choice.template?.design, 200)
  })
  const rowOf = new Map((media ?? []).map((m) => [m?.id, m]))
  const dishPhotos = takes.has('items.photo')
    ? menuItemsOf(research?.sitemap)
        .map((i) => (sendablePhoto(i?.photo) ? i.photo.assetId : null))
        .filter(Boolean)
    : []
  const photos = photosOf(research?.assets, rowOf, dishPhotos)
  const sent = new Set(photos.map((p) => p.url))
  const photoUrlOf = (assetId) => {
    const url = publicHttpsUrl(rowOf.get(assetId)?.sourceUrl)
    return url && sent.has(url) ? url : undefined
  }
  return prune({
    schema: DEMO_REQUEST_SCHEMA,
    business: prune({
      name: name.slice(0, 200),
      address: text(b.address, 500) ?? text(c.address, 500),
      location: locationOf(c),
      phone: text(b.phone, 64) ?? text(c.phone, 64),
      // The business's own site may still be plain http: it is a fact here, not something fetched.
      website: publicHttpsUrl(b.website, { http: true }) ?? publicHttpsUrl(c.website, { http: true }),
      category: text(b.trade, 64) ?? text(b.cuisine?.[0], 64),
      hours: hours.length ? hours : undefined,
      socials: socialsOf(b.socials, c.socials),
      description: descriptionOf(research?.googlePlace),
      items: itemsOf(research?.sitemap, takes, photoUrlOf)
    }),
    photos,
    brand: takes.has('brand') ? brandOf(research?.brand, rowOf) : undefined,
    links: takes.has('links') ? linksOf(research) : undefined,
    posts: takes.has('posts') ? postsOf(research?.content, media, sent) : undefined,
    cms: CMS.has(choice.cms) ? choice.cms : undefined,
    template: Object.keys(template).length ? template : undefined
  })
}

/**
 * The full stored research, before the brief's copy, sent to a host announcing `profile/1`: without reviews and cut to
 * v2's limits (`placeProfileForHost`). Validate it; a profile still invalid goes as v1 (`toDemoRequest`) instead.
 */
export function toDemoRequestV2(place, research, choice = {}, media = [], rows = {}) {
  const base = toDemoRequest(place, research, choice)
  if (!base) return null
  const available = media
    .filter(
      (m) =>
        !m.revoked_at &&
        !m.revokedAt &&
        (!m.status || m.status === 'stored') &&
        !['google-maps', 'tripadvisor'].includes(m.source)
    )
    .map((m) => ({ ...m, sourceUrl: publicHttpsUrl(m.sourceUrl ?? m.source_url) }))
  const rowOf = new Map(available.map((m) => [m.id, m]))
  const logo = rows.brand?.logoResearch?.chosen
  const first = [
    logo?.mediaId ??
      available.find((m) => m.sourceUrl === logo?.url)?.id ??
      rows.brand?.website?.logo ??
      rows.brand?.social?.logo ??
      rows.brand?.logo,
    ...(rows.profile?.menuItems ?? [])
      .filter((i) => i.photo?.status === 'accepted')
      .map(
        (i) => i.photo.mediaId ?? i.photo.assetId ?? available.find((m) => m.sourceUrl === i.photo.url)?.id
      )
  ].filter(Boolean)
  const photos = photosOf(available, rowOf, first)
  const sent = new Set(photos.map((p) => p.url))
  const stored = placeProfileFromResearch({
    identity: place,
    profile: rows.profile ?? {},
    brand: rows.brand ?? {},
    sources: rows.rawSources ?? rows.sources ?? [],
    posts: rows.posts ?? [],
    media: available.filter((m) => sent.has(m.sourceUrl)).map((m) => ({ ...m, source_url: m.sourceUrl }))
  })
  return prune({
    schema: DEMO_REQUEST_V2_SCHEMA,
    profile: placeProfileForHost(stored),
    photos,
    cms: base.cms,
    template: base.template
  })
}

/** A schema refusal retries the frozen facts as base v1; no new research or price-scale assumptions enter it. */
export function toLegacyDemoRequest(request) {
  const p = request.profile
  const business = Object.fromEntries(
    Object.entries(p.business)
      .filter(([, f]) => f?.value !== undefined)
      .map(([k, f]) => [k, f.value])
  )
  business.trade = p.classification.derivedCategories.find(
    (c) => c.value.taxonomy === 'tracy-trade'
  )?.value.code
  business.website = p.links.find((l) => l.value.kind === 'website')?.value.url
  business.socials = Object.fromEntries(
    p.links.filter((l) => SOCIAL.has(l.value.kind)).map((l) => [l.value.kind, l.value.url])
  )
  const media = request.photos.map((photo, i) => ({
    id: String(i),
    kind: 'image',
    sourceUrl: photo.url,
    ...photo
  }))
  const menuItems = p.offerings.flatMap((f) =>
    f.value.variants.map((v) => ({
      name: f.value.name,
      section: f.value.section,
      size: v.size,
      price: v.price?.raw,
      priceScale: v.price?.priceScale,
      currency: v.price?.currency
    }))
  )
  const result = toDemoRequest(
    { candidate: { lat: business.location?.latitude, lon: business.location?.longitude } },
    {
      business,
      assets: media,
      sitemap: [{ sections: [{ menuItems }] }],
      googlePlace: {
        summaries: {
          editorial: p.quotes.find(
            (q) => q.value.kind === 'story' && !q.value.restrictions.includes('not-on-demo')
          )?.value.text
        }
      }
    },
    request,
    media
  )
  return result
}

/** The request's fingerprint: the same facts always give the same one, whatever the key order. */
export function demoRequestFingerprint(request) {
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}
