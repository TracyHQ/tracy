/**
 * `website-opportunities/demo-request/v1`: what a builder sends to ask a host (Tracy's `POST /v1/demos`) for a
 * demo site of one business. Plain facts and picture URLs only, nothing a host should trust: no account, no
 * site, no credential, no `verified` or provenance claim, no stored-object key. A field the contract does not
 * name is refused by its path, so a sender that adds one learns it at once instead of having it ignored.
 * v2 carries a place profile with declared provenance; only the receiving host may assess its facts.
 */
import { CMS } from './cms.mjs'
import { validatePlaceProfile } from './place-profile.mjs'

export const DEMO_REQUEST_SCHEMA = 'website-opportunities/demo-request/v1'
export const DEMO_REQUEST_V2_SCHEMA = 'website-opportunities/demo-request/v2'
export const DEMO_REQUEST_LIMITS = Object.freeze({
  name: 200,
  text: 500,
  description: 2000,
  url: 2048,
  hours: 14,
  items: 100,
  photos: 24,
  size: 100,
  colors: 8,
  colorRole: 40,
  posts: 12,
  postText: 1000
})
/** What one v2 request may hold: its collections and its whole UTF-8 JSON body. */
export const DEMO_REQUEST_V2_LIMITS = Object.freeze({
  offerings: 200,
  people: 50,
  quotes: 100,
  bytes: 512 * 1024
})
/**
 * What a host may announce at `GET /v1/demos/options` (`accepts`): the optional parts of this contract it takes all the
 * way to the demo. A sender sends only the parts its host announced.
 */
export const DEMO_REQUEST_CAPABILITIES = Object.freeze([
  'items.size',
  'items.priceScale',
  'items.photo',
  'brand',
  'links',
  'posts',
  'profile/1'
])
/** Thousands, ten-thousands, millions: the menu printed `55` for 55,000. The price stays the printed number. */
const PRICE_SCALES = [1000, 10000, 1000000]
const POST_SOURCES = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'website', 'other']
const SOCIALS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x']
const TOP = ['schema', 'business', 'photos', 'cms', 'template', 'brand', 'links', 'posts']
const BUSINESS = [
  'name',
  'address',
  'location',
  'phone',
  'website',
  'category',
  'hours',
  'socials',
  'description',
  'items'
]
const ITEM = ['name', 'price', 'currency', 'section', 'description', 'size', 'priceScale', 'photo']
const PHOTO = ['url', 'caption', 'alt']
const POST = ['text', 'url', 'publishedAt', 'source', 'photos']
const HEX = /^#[0-9a-f]{6}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const MAX_ERRORS = 20

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isHttpUrl = (v) => {
  if (typeof v !== 'string' || v.length > DEMO_REQUEST_LIMITS.url) return false
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * @returns {{ ok: true, request: object } | { ok: false, errors: { path: string, code: string }[] }}
 *   `request` holds only the fields sent, `photos` always a list.
 */
export function validateDemoRequest(raw) {
  if (raw?.schema === DEMO_REQUEST_V2_SCHEMA) return validateDemoRequestV2(raw)
  const errors = []
  const fail = (path, code) => errors.length < MAX_ERRORS && errors.push({ path, code })
  const only = (value, keys, path) => {
    for (const k of Object.keys(value))
      if (!keys.includes(k)) fail(path ? `${path}.${k}` : k, 'UNKNOWN_FIELD')
  }
  const text = (v, path, max, required = false) => {
    if (v === undefined || v === null) {
      if (required) fail(path, 'REQUIRED')
      return undefined
    }
    if (typeof v !== 'string') return void fail(path, 'NOT_TEXT')
    if (required && !v.trim()) return void fail(path, 'REQUIRED')
    if (v.length > max) return void fail(path, 'TOO_LONG')
    return v
  }
  const url = (v, path) => {
    if (v === undefined || v === null) return undefined
    if (!isHttpUrl(v)) return void fail(path, 'INVALID_URL')
    return v
  }
  const list = (v, max, path) => {
    if (v === undefined || v === null) return []
    if (!Array.isArray(v)) {
      fail(path, 'NOT_A_LIST')
      return []
    }
    if (v.length > max) {
      fail(path, 'TOO_MANY')
      return []
    }
    return v
  }
  const set = (out, key, value) => {
    if (value !== undefined) out[key] = value
  }

  if (!isObject(raw)) return { ok: false, errors: [{ path: '', code: 'NOT_AN_OBJECT' }] }
  only(raw, TOP, '')
  if (raw.schema !== DEMO_REQUEST_SCHEMA) fail('schema', 'SCHEMA_UNSUPPORTED')
  const request = { schema: DEMO_REQUEST_SCHEMA }

  const b = raw.business
  if (!isObject(b)) fail('business', 'REQUIRED')
  else {
    only(b, BUSINESS, 'business')
    const business = {}
    set(business, 'name', text(b.name, 'business.name', DEMO_REQUEST_LIMITS.name, true))
    set(business, 'address', text(b.address, 'business.address', DEMO_REQUEST_LIMITS.text))
    set(business, 'phone', text(b.phone, 'business.phone', 64))
    set(business, 'website', url(b.website, 'business.website'))
    set(business, 'category', text(b.category, 'business.category', 64))
    set(business, 'description', text(b.description, 'business.description', DEMO_REQUEST_LIMITS.description))
    if (b.location !== undefined && b.location !== null) {
      if (!isObject(b.location)) fail('business.location', 'NOT_AN_OBJECT')
      else {
        only(b.location, ['lat', 'lon'], 'business.location')
        const { lat, lon } = b.location
        const inRange = (v, max) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max
        if (!inRange(lat, 90)) fail('business.location.lat', 'OUT_OF_RANGE')
        if (!inRange(lon, 180)) fail('business.location.lon', 'OUT_OF_RANGE')
        business.location = { lat, lon }
      }
    }
    const hours = list(b.hours, DEMO_REQUEST_LIMITS.hours, 'business.hours')
    hours.forEach((h, i) => text(h, `business.hours.${i}`, 200, true))
    if (b.hours !== undefined) business.hours = hours
    if (b.socials !== undefined && b.socials !== null) {
      if (!isObject(b.socials)) fail('business.socials', 'NOT_AN_OBJECT')
      else {
        only(b.socials, SOCIALS, 'business.socials')
        business.socials = {}
        for (const k of SOCIALS) set(business.socials, k, url(b.socials[k], `business.socials.${k}`))
      }
    }
    const items = list(b.items, DEMO_REQUEST_LIMITS.items, 'business.items')
    business.items = items.map((item, i) => {
      const at = `business.items.${i}`
      if (!isObject(item)) return void fail(at, 'NOT_AN_OBJECT')
      only(item, ITEM, at)
      const out = {}
      set(out, 'name', text(item.name, `${at}.name`, DEMO_REQUEST_LIMITS.name, true))
      set(out, 'price', text(item.price, `${at}.price`, 40))
      set(out, 'currency', text(item.currency, `${at}.currency`, 8))
      set(out, 'section', text(item.section, `${at}.section`, 100))
      set(out, 'description', text(item.description, `${at}.description`, DEMO_REQUEST_LIMITS.text))
      set(out, 'size', text(item.size, `${at}.size`, DEMO_REQUEST_LIMITS.size))
      if (item.priceScale !== undefined && item.priceScale !== null) {
        if (!PRICE_SCALES.includes(item.priceScale)) fail(`${at}.priceScale`, 'INVALID_PRICE_SCALE')
        else if (out.price === undefined || !out.price.trim()) fail(`${at}.priceScale`, 'PRICE_REQUIRED')
        else out.priceScale = item.priceScale
      }
      set(out, 'photo', url(item.photo, `${at}.photo`))
      return out
    })
    if (b.items === undefined) delete business.items
    request.business = business
  }

  const photos = list(raw.photos, DEMO_REQUEST_LIMITS.photos, 'photos')
  request.photos = photos.map((p, i) => {
    const at = `photos.${i}`
    if (!isObject(p)) return void fail(at, 'NOT_AN_OBJECT')
    only(p, PHOTO, at)
    const out = {}
    if (p.url === undefined || p.url === null) fail(`${at}.url`, 'REQUIRED')
    set(out, 'url', url(p.url, `${at}.url`))
    set(out, 'caption', text(p.caption, `${at}.caption`, DEMO_REQUEST_LIMITS.text))
    set(out, 'alt', text(p.alt, `${at}.alt`, DEMO_REQUEST_LIMITS.text))
    return out
  })

  // A picture named by an item or a post is one of the request's photos, matched as the same string.
  const sent = new Set(request.photos.map((p) => p?.url).filter(Boolean))
  const inPhotos = (v, path) => {
    if (v !== undefined && !sent.has(v)) fail(path, 'PHOTO_NOT_IN_PHOTOS')
  }
  ;(request.business?.items ?? []).forEach((item, i) => inPhotos(item?.photo, `business.items.${i}.photo`))

  if (raw.brand !== undefined && raw.brand !== null) {
    if (!isObject(raw.brand)) fail('brand', 'NOT_AN_OBJECT')
    else {
      only(raw.brand, ['logo', 'colors'], 'brand')
      const brand = {}
      set(brand, 'logo', url(raw.brand.logo, 'brand.logo'))
      const colors = list(raw.brand.colors, DEMO_REQUEST_LIMITS.colors, 'brand.colors')
      if (raw.brand.colors !== undefined && raw.brand.colors !== null)
        brand.colors = colors.map((c, i) => {
          const at = `brand.colors.${i}`
          if (!isObject(c)) return void fail(at, 'NOT_AN_OBJECT')
          only(c, ['hex', 'role'], at)
          const out = {}
          if (typeof c.hex !== 'string' || !HEX.test(c.hex)) fail(`${at}.hex`, 'INVALID_COLOR')
          else out.hex = c.hex
          set(out, 'role', text(c.role, `${at}.role`, DEMO_REQUEST_LIMITS.colorRole))
          return out
        })
      request.brand = brand
    }
  }
  if (raw.links !== undefined && raw.links !== null) {
    if (!isObject(raw.links)) fail('links', 'NOT_AN_OBJECT')
    else {
      only(raw.links, ['menu', 'booking'], 'links')
      const links = {}
      set(links, 'menu', url(raw.links.menu, 'links.menu'))
      set(links, 'booking', url(raw.links.booking, 'links.booking'))
      request.links = links
    }
  }
  const posts = list(raw.posts, DEMO_REQUEST_LIMITS.posts, 'posts')
  if (raw.posts !== undefined && raw.posts !== null)
    request.posts = posts.map((p, i) => {
      const at = `posts.${i}`
      if (!isObject(p)) return void fail(at, 'NOT_AN_OBJECT')
      only(p, POST, at)
      const out = {}
      set(out, 'text', text(p.text, `${at}.text`, DEMO_REQUEST_LIMITS.postText, true))
      set(out, 'url', url(p.url, `${at}.url`))
      if (p.publishedAt !== undefined && p.publishedAt !== null) {
        if (
          typeof p.publishedAt !== 'string' ||
          !ISO_DATE.test(p.publishedAt) ||
          !Number.isFinite(Date.parse(p.publishedAt))
        )
          fail(`${at}.publishedAt`, 'INVALID_DATE')
        else out.publishedAt = p.publishedAt
      }
      if (p.source !== undefined && p.source !== null) {
        if (!POST_SOURCES.includes(p.source)) fail(`${at}.source`, 'INVALID_SOURCE')
        else out.source = p.source
      }
      const pictures = list(p.photos, DEMO_REQUEST_LIMITS.photos, `${at}.photos`)
      if (p.photos !== undefined && p.photos !== null)
        out.photos = pictures.map((u, j) => {
          const v = url(u, `${at}.photos.${j}`)
          if (v !== undefined) inPhotos(v, `${at}.photos.${j}`)
          else if (u === undefined || u === null) fail(`${at}.photos.${j}`, 'REQUIRED')
          return v
        })
      return out
    })

  if (raw.cms !== undefined && raw.cms !== null) {
    if (!CMS.includes(raw.cms)) fail('cms', 'INVALID_CMS')
    else request.cms = raw.cms
  }
  if (raw.template !== undefined && raw.template !== null) {
    if (!isObject(raw.template)) fail('template', 'NOT_AN_OBJECT')
    else {
      only(raw.template, ['quickstart', 'design'], 'template')
      const template = {}
      set(template, 'quickstart', text(raw.template.quickstart, 'template.quickstart', 200, true))
      set(template, 'design', text(raw.template.design, 'template.design', 200))
      if (request.cms === undefined && raw.cms === undefined) fail('cms', 'REQUIRED')
      request.template = template
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, request }
}

function validateDemoRequestV2(raw) {
  const errors = []
  const fail = (path, code) => errors.length < MAX_ERRORS && errors.push({ path, code })
  try {
    if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > DEMO_REQUEST_V2_LIMITS.bytes)
      return { ok: false, errors: [{ path: '', code: 'TOO_LARGE' }] }
  } catch {
    return { ok: false, errors: [{ path: '', code: 'NOT_JSON' }] }
  }
  for (const key of Object.keys(raw))
    if (!['schema', 'profile', 'photos', 'cms', 'template'].includes(key)) fail(key, 'UNKNOWN_FIELD')
  if (!Array.isArray(raw.photos)) fail('photos', raw.photos === undefined ? 'REQUIRED' : 'NOT_A_LIST')
  // Check even open-ended source values: an assessment always belongs to the receiving host.
  const pending = [[raw.profile, 'profile']]
  while (pending.length) {
    const [value, path] = pending.pop()
    if (!value || typeof value !== 'object') continue
    for (const [key, child] of Object.entries(value)) {
      const at = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`
      if (key === 'assessment' || key === 'verified') fail(at, 'SENDER_CANNOT_ASSESS')
      else pending.push([child, at])
    }
  }
  for (const key of ['offerings', 'people', 'quotes']) {
    const max = DEMO_REQUEST_V2_LIMITS[key]
    if (Array.isArray(raw.profile?.[key]) && raw.profile[key].length > max) fail(`profile.${key}`, 'TOO_MANY')
  }
  if (errors.length) return { ok: false, errors }
  const checked = validatePlaceProfile(raw.profile)
  for (const e of checked.errors) fail(e.path ? `profile.${e.path}` : 'profile', e.code)
  // The transport envelope has the same photo, CMS and template rules as v1.
  const envelope = validateDemoRequest({
    schema: DEMO_REQUEST_SCHEMA,
    business: { name: 'Profile' },
    photos: raw.photos,
    ...(raw.cms !== undefined ? { cms: raw.cms } : {}),
    ...(raw.template !== undefined ? { template: raw.template } : {})
  })
  if (!envelope.ok) for (const e of envelope.errors) fail(e.path, e.code)
  if (errors.length) return { ok: false, errors }
  const sent = new Set(envelope.request.photos.map((p) => p.url))
  const inPhotos = (url, path) => {
    if (url !== undefined && !sent.has(url)) fail(path, 'PHOTO_NOT_IN_PHOTOS')
  }
  raw.profile.media.forEach((m, i) => inPhotos(m.value.url, `profile.media[${i}].value.url`))
  inPhotos(raw.profile.brand.logo?.value.url, 'profile.brand.logo.value.url')
  if (errors.length) return { ok: false, errors }
  const { business: _business, ...request } = envelope.request
  return { ok: true, request: { ...request, schema: DEMO_REQUEST_V2_SCHEMA, profile: raw.profile } }
}

/**
 * A demo request from loose facts of one place: text trimmed, empty values and lists dropped, photos given as
 * URLs or `{url, caption, alt}`, at most `DEMO_REQUEST_LIMITS.photos` of them. Validate before sending.
 */
export function buildDemoRequest({ business = {}, photos = [], cms, template, brand, links, posts } = {}) {
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const out = { schema: DEMO_REQUEST_SCHEMA, business: {} }
  const put = (target, key, value) => {
    if (value !== undefined) target[key] = value
  }
  for (const key of ['name', 'address', 'phone', 'website', 'category', 'description'])
    put(out.business, key, clean(business[key]))
  if (Number.isFinite(business.location?.lat) && Number.isFinite(business.location?.lon))
    out.business.location = { lat: business.location.lat, lon: business.location.lon }
  const hours = (Array.isArray(business.hours) ? business.hours : [])
    .map(clean)
    .filter(Boolean)
    .slice(0, DEMO_REQUEST_LIMITS.hours)
  if (hours.length) out.business.hours = hours
  const socials = {}
  for (const k of SOCIALS) put(socials, k, clean(business.socials?.[k]))
  if (Object.keys(socials).length) out.business.socials = socials
  const items = (Array.isArray(business.items) ? business.items : [])
    .filter((i) => clean(i?.name))
    .slice(0, DEMO_REQUEST_LIMITS.items)
    .map((i) => {
      const item = {}
      for (const key of ITEM) if (key !== 'priceScale') put(item, key, clean(i[key]))
      if (PRICE_SCALES.includes(i.priceScale) && item.price) item.priceScale = i.priceScale
      return item
    })
  if (items.length) out.business.items = items
  out.photos = (Array.isArray(photos) ? photos : [])
    .map((p) => (typeof p === 'string' ? { url: p } : p))
    .filter((p) => clean(p?.url))
    .slice(0, DEMO_REQUEST_LIMITS.photos)
    .map((p) => {
      const photo = { url: p.url.trim() }
      put(photo, 'caption', clean(p.caption))
      put(photo, 'alt', clean(p.alt))
      return photo
    })
  const logo = clean(brand?.logo)
  const colors = (Array.isArray(brand?.colors) ? brand.colors : [])
    .filter((c) => HEX.test(clean(c?.hex) ?? ''))
    .slice(0, DEMO_REQUEST_LIMITS.colors)
    .map((c) => {
      const color = { hex: c.hex.trim() }
      put(color, 'role', clean(c.role))
      return color
    })
  if (logo || colors.length) {
    out.brand = {}
    put(out.brand, 'logo', logo)
    if (colors.length) out.brand.colors = colors
  }
  const kept = {}
  for (const k of ['menu', 'booking']) put(kept, k, clean(links?.[k]))
  if (Object.keys(kept).length) out.links = kept
  const sentPosts = (Array.isArray(posts) ? posts : [])
    .filter((p) => clean(p?.text))
    .slice(0, DEMO_REQUEST_LIMITS.posts)
    .map((p) => {
      const post = { text: p.text.trim() }
      for (const key of ['url', 'publishedAt', 'source']) put(post, key, clean(p[key]))
      const pictures = (Array.isArray(p.photos) ? p.photos : []).map(clean).filter(Boolean)
      if (pictures.length) post.photos = pictures
      return post
    })
  if (sentPosts.length) out.posts = sentPosts
  put(out, 'cms', clean(cms))
  if (template && clean(template.quickstart)) {
    out.template = { quickstart: template.quickstart.trim() }
    put(out.template, 'design', clean(template.design))
  }
  return out
}
