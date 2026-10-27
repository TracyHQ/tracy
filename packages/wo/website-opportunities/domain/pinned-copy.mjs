import { dishWordsIn } from './content-pool.mjs'

// The words a demo site can carry with a source behind each one, keyed by the slot role they fill
// (`hero.title`, `about.story`, `cards`…). A role with no sourced value is absent: the template's own
// words, or the model, fill it. Nothing here is written by a model.

const LEAD_MAX = 160
const CARD_TEXT_MAX = 140
const CARDS = 6
const DISHES = 6
const DISH_TEXT_MAX = 200
// A lead stays on the site for months; a price, a discount or a "until Sunday" goes stale first.
const PROMO_RE =
  /%|\boff\b|\bdiscount|\bpromo|\buntil\b|\btoday\b|\btonight\b|\bthis (week|weekend)\b|[$€£₫]\s?\d|\d\s?(k|đ|vnd|usd)\b/i
const VI_MARKS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
/** A price as a caption writes it: never read as the dish's price, and never shown in its description either. */
const PRICE_RE = /[$€£₫]\s?\d|\d\s?(k|đ|vnd|usd|dong)\b|\d[.,]\d{3}\b/i
const DISH_NAME_WORDS = 8

/**
 * Whether an item's title names a dish: a heading the restaurant set on its post (never the caption's first sentence,
 * which reads "A good morning starts here"), short, with a food word in it, not a question or a call.
 */
function namesDish(item) {
  const title = String(item.title ?? '').trim()
  const body = String(item.body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!title || fromCaption(title, body)) return false
  return shortName(title) && dishWordsIn(title) > 0
}

/** A title short enough to be a name: not a question or a call, no price in it. */
function shortName(title) {
  return title.split(/\s+/).length <= DISH_NAME_WORDS && !/[?!…]/.test(title) && !PRICE_RE.test(title)
}

/** The items the brief's own dishes sections name (`sitemap[].sections[kind=dishes].itemIds`), in their order. */
function briefDishIds(brief) {
  const ids = []
  for (const page of brief.sitemap ?? [])
    for (const s of page.sections ?? [])
      if (s?.kind === 'dishes') for (const id of s.itemIds ?? []) if (!ids.includes(id)) ids.push(id)
  return ids
}

/**
 * Whether a title is the caption's own first sentence (`content-pool.mjs` `firstSentence`: the sentence whole, cut with an
 * ellipsis, or cut at a clause), not a name set above it. "Duck Salad" over "Duck Salad with herbs from our garden." is a
 * name the body repeats; "Good coffee makes a difference" over "Good coffee makes a difference. Come by." is the caption.
 */
function fromCaption(title, body) {
  if (title.endsWith('…')) return true
  // Whatever its case: a caption shouted in capitals is read as a title-cased heading by the pool.
  if (!body.toLowerCase().startsWith(title.toLowerCase())) return false
  return /^($|[.!?:,;—–]|\s*$)/.test(body.slice(title.length))
}

/** The first sentence of a dish's text that says no price, or ''. */
function dishText(body, max) {
  const sentences =
    String(body ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?]+[.!?]*/g) ?? []
  const plain = sentences.map((x) => x.trim()).find((x) => x && !PRICE_RE.test(x))
  return plain ? firstSentence(plain, max) : ''
}

function firstSentence(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  const end = clean.search(/[.!?](\s|$)/)
  const one = end > 0 ? clean.slice(0, end + 1) : clean
  if (one.length <= max) return one
  return `${one.slice(0, max).replace(/\s+\S*$/, '')}…`
}

function bioOf(brief) {
  for (const page of brief.sitemap ?? []) {
    for (const s of page.sections ?? []) {
      const quote = (s.evidence ?? []).find((e) => e.source === 'profile.bio' && nonEmpty(e.quote))?.quote
      if (quote) return quote
    }
  }
  return null
}

function heroCtaOf(brief) {
  const cta = (brief.sitemap ?? [])
    .find((p) => p.slug === 'home')
    ?.sections?.find((s) => s.kind === 'hero')?.cta
  if (!cta || !nonEmpty(cta.href)) return undefined
  if (cta.kind === 'booking')
    return { value: { label: cta.label, href: cta.href }, source: 'business.booking' }
  if (cta.kind === 'phone') return { value: { label: cta.label, href: cta.href }, source: 'business.phone' }
  return undefined
}

/**
 * The brief's collected menu items as dishes, verified ones first, one per name and section: its price as collected, or
 * each size's price (`Small 8.50 · Large 12.00`), a shortened price as its full amount (`shownPrice`), empty when none was
 * collected. A dish with no price is still a dish.
 */
function menuDishes(brief, lang) {
  const byName = new Map()
  const items = (brief.sitemap ?? []).flatMap((page) =>
    (page.sections ?? []).flatMap((s) => s?.menuItems ?? [])
  )
  for (const i of [
    ...items.filter((x) => x?.verified === true),
    ...items.filter((x) => x?.verified !== true)
  ]) {
    if (!nonEmpty(i?.name) || !nonEmpty(i.source?.url)) continue
    const key = `${i.section ?? ''}\n${i.name.trim().toLowerCase()}`
    if (!byName.has(key)) byName.set(key, { name: i.name.trim(), prices: [], source: `menu:${i.source.url}` })
    const price = nonEmpty(i.price) ? shownPrice(i.price.trim(), i.priceScale, lang) : null
    if (price) byName.get(key).prices.push(nonEmpty(i.size) ? `${i.size.trim()} ${price}` : price)
  }
  return [...byName.values()].map((d) => ({
    value: { name: d.name, description: '', price: d.prices.join(' · ') },
    source: d.source
  }))
}

/**
 * A price as the site shows it: one the menu prints shortened (`priceScale` above 1: "110" for 110,000) as the full amount
 * in the site's language; any other exactly as printed.
 */
export function shownPrice(price, scale, lang) {
  const printed = price.replace(/\s/g, '')
  const amount = Number(
    /^\d{1,3}(?:[.,]\d{3})+$/.test(printed) ? printed.replace(/[.,]/g, '') : printed.replace(',', '.')
  )
  if (!(scale > 1) || !Number.isFinite(amount)) return price
  try {
    return new Intl.NumberFormat(lang || 'en').format(amount * scale)
  } catch {
    return new Intl.NumberFormat('en').format(amount * scale)
  }
}

/** Only the restaurant's own words, in the site's language. */
const ownIn = (lang) => (item) => item.authorship === 'page' && (!lang || !item.lang || item.lang === lang)

/**
 * @param {object} brief a validated brief
 * @param {{lang?: string, cards?: number, dishes?: number}} [opts] - the site's language; how many cards and menu dishes
 *   the template has
 * @returns {Record<string, any>} role → `{value, source}`; `cards` and `dishes` are lists; `contact` holds the facts
 */
export function pinnedCopy(brief, { lang = 'en', cards = CARDS, dishes = DISHES } = {}) {
  const out = {}
  const b = brief.business ?? {}
  if (nonEmpty(b.name)) out['hero.title'] = { value: b.name.trim(), source: 'business.name' }

  const cuisine = Array.isArray(b.cuisine) ? b.cuisine.filter(nonEmpty).map((c) => c.trim()) : []
  if (cuisine.length) out['hero.accent'] = { value: cuisine.join(', '), source: 'business.cuisine' }

  const bio = bioOf(brief)
  if (bio && !PROMO_RE.test(bio) && !(lang === 'en' && VI_MARKS.test(bio))) {
    out['hero.lead'] = { value: firstSentence(bio, LEAD_MAX), source: 'profile.bio' }
  }

  const cta = heroCtaOf(brief)
  if (cta) out['hero.cta'] = cta

  const items = (brief.content?.items ?? []).filter(ownIn(lang))
  const story = items.find((i) => i.kinds?.[0] === 'story' || i.kinds?.includes('story'))
  if (story) out['about.story'] = { value: { title: story.title, text: story.body }, source: story.id }

  out.cards = items
    .filter((i) => i.kinds?.[0] === 'dish')
    .slice(0, cards)
    .map((i) => ({ value: { title: i.title, text: firstSentence(i.body, CARD_TEXT_MAX) }, source: i.id }))

  // 🔒 A DISH OF THE MENU IS AN ITEM THE RESEARCH CALLED A DISH, UNDER A NAME THE RESTAURANT GAVE IT (manager, 22/10/2026):
  // never a past night or an event, and never a price read off a caption (a price comes only with a collected menu item,
  // `menuDishes`). The dishes the
  // brief's own dishes sections name come first, under their title when it is short enough to be a name (the strict rule
  // alone left Fern Station with one dish, 22/10/2026); any other dish item needs a heading with a food word, never a
  // caption's first sentence ("Good coffee makes a difference" is a post, not a dish). A dish item of the template's menu
  // with no dish of the restaurant keeps a neutral name, its description and price empty
  // (`section-fills.mjs`; plan §7: no filler).
  const current = items.filter(
    (i) => i.kinds?.[0] === 'dish' && !i.kinds.includes('event') && i.temporal?.status !== 'past'
  )
  const named = briefDishIds(brief)
  const held = named
    .map((id) => current.find((i) => i.id === id))
    .filter((i) => i && shortName(String(i.title ?? '').trim()) && String(i.title ?? '').trim())
  // Dishes collected off the menus, links and photos (`menuItems`) come before any post.
  const fromMenu = menuDishes(brief, lang)
  out.dishes = [
    ...fromMenu,
    ...[...held, ...current.filter((i) => !held.includes(i) && namesDish(i))].map((i) => ({
      value: { name: i.title.trim(), description: dishText(i.body, DISH_TEXT_MAX) },
      source: i.id
    }))
  ].slice(0, dishes)

  out.contact = contactOf(brief)
  if (out.contact.address) out['contact.address'] = out.contact.address
  return out
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `Monday,Tuesday,…,Sunday 07:00-22:00` as a person writes it: `Mon–Sun 07:00–22:00`; any other shape as collected. */
export function hoursLine(line) {
  const m = line.match(/^((?:[a-z]+day\s*,\s*)*[a-z]+day)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/i)
  if (!m) return line
  const idx = m[1].split(',').map((d) => DAYS.indexOf(d.trim().toLowerCase()))
  if (idx.some((i) => i < 0)) return line
  const runs = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && i === last[1] + 1) last[1] = i
    else runs.push([i, i])
  }
  const days = runs
    .flatMap(([a, z]) => (z > a ? [`${DAY_SHORT[a]}–${DAY_SHORT[z]}`] : [DAY_SHORT[a]]))
    .join(', ')
  return `${days} ${m[2]}–${m[3]}`
}

/**
 * The restaurant's contact facts, each with the brief field it came from; hours joined in their order.
 * @param {object} brief
 * @returns {Record<'phone'|'email'|'address'|'hours'|'whatsapp'|'serviceArea', {value: string, source: string}>} only the
 *   ones the brief holds
 */
export function contactOf(brief) {
  const b = brief?.business ?? {}
  const contact = {}
  if (nonEmpty(b.phone)) contact.phone = { value: b.phone.trim(), source: 'business.phone' }
  if (nonEmpty(b.email)) contact.email = { value: b.email.trim(), source: 'business.email' }
  if (nonEmpty(b.address)) contact.address = { value: b.address.trim(), source: 'business.address' }
  const hours = Array.isArray(b.hours) ? b.hours.filter(nonEmpty).map((h) => hoursLine(h.trim())) : []
  if (hours.length) contact.hours = { value: hours.join('; '), source: 'business.hours' }
  // A WhatsApp number the brief names (said, or inferred from a UAE mobile, ADR 0037 26/10/2026): a button beside Call.
  const whatsapp = brief?.contact?.whatsapp?.number
  if (nonEmpty(whatsapp) && /^\+?\d{8,15}$/.test(whatsapp.replace(/[\s().-]/g, '')))
    contact.whatsapp = { value: whatsapp.trim(), source: 'contact.whatsapp' }
  // The areas the business serves, one line beside the address, never in its place.
  const areas = (Array.isArray(b.serviceAreas) ? b.serviceAreas : [])
    .map((a) => (typeof a?.text === 'string' ? a.text.trim() : ''))
    .filter(Boolean)
  if (areas.length)
    contact.serviceArea = { value: [...new Set(areas)].join('; '), source: 'business.serviceAreas' }
  return contact
}
