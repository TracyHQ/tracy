// The first screen of a brief build answers three questions (spec TracyHQ/tracy#189, COO rule 29/10/2026):
//   WHAT     the hero subline (the headline when there is no subline) names the offerings or the trade, from the brief
//   WHERE    the city or the area served appears in the headline or the subline
//   CONTACT  the hero's main button uses the owner's real way in, in order: a phone call, WhatsApp, a verified booking
//            link, the Contact page; its label names the action ("Call ...", "WhatsApp us"), never a bare "Contact"
// The headline is the owner's own words (a key message), left to the copy writer; the subline supplies what it lacks.
//
// 🔒 BY SLOT ROLE, NEVER BY TEMPLATE: the hero is the home page's module in a hero position (hero, slideshow, masthead,
// banner), and its slots are told apart by role (ADR 0040) when the content map declares roles, else by the field or the
// element they sit in (a T3 HTML module). 🔒 NOTHING IS INVENTED: a question the brief holds no answer for is reported
// (`missing`), and its slot is left to the copy writer.
//
// Measured 29/10/2026 (local stand, a coaching club brief on a Joomla T4 template): every hero slot went to the copy
// writer, which saw "Hero / desc" with a mood sample and no role, and wrote "Find your stride and enjoy every session, at
// any age." under a button labelled "Contact", although the brief planned "...: tennis, padel, swimming lessons."
import { cityOf, heroServicesOf } from './brief.mjs'
import { serviceAreasOf } from './contact-reading.mjs'
import { inSentence } from './plain-prose.mjs'

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const list = (v) => (Array.isArray(v) ? v : [])

/** Module positions that hold a page's first screen, best first. */
const HERO_POSITIONS = [/^hero$/i, /hero/i, /slide/i, /mast/i, /banner|jumbotron|showcase/i]
/** Modules that never are a hero, whatever position they sit in. */
const NOT_HERO = /^mod_(?:login|menu|acym|breadcrumbs|search|finder|articles|tags|footer|related)/i

const HEADLINE_ROLES = new Set(['claim.heading', 'editorial.heading', 'business.tagline'])
const SUBLINE_ROLES = new Set(['editorial.paragraph', 'article.lead', 'business.tagline'])
const LABEL_ROLES = new Set(['contact.cta_label', 'editorial.button_label', 'offering.cta_label'])
const URL_ROLES = new Set(['contact.cta_url', 'offering.cta_url'])

/** The field a slot holds, from its JSON path or its label (`hero[desc]` and `Hero / desc` both read `desc`). */
function fieldOf(slot) {
  const path = list(slot.jsonPath).filter((p) => typeof p === 'string')
  const last =
    path.at(-1) ??
    String(slot.label ?? '')
      .split('/')
      .at(-1) ??
    ''
  return String(/\[([^\]]+)\]\s*$/.exec(last)?.[1] ?? last)
    .trim()
    .toLowerCase()
}

/** The element a markup slot sits in (`h2`, `p`, `a`), and whether it is the link's address. */
function elementOf(slot) {
  const m = /\/([a-z][a-z0-9]*)(?:\[\d+\])?\/(text\(\)|@[\w-]+)$/i.exec(String(slot.xpath ?? ''))
  return m ? { tag: m[1].toLowerCase(), attr: m[2] } : null
}

/** The item a repeated hero field belongs to (a slideshow's slide): the first slide only is the first screen. */
const itemOf = (slot) => {
  const n = list(slot.jsonPath).at(-1)
  return Number.isInteger(n) ? n : 0
}

/** What a hero slot is: `headline`, `subline`, `label`, `href`, or null. Role first, then field, then element. */
function kindOf(slot) {
  if (slot.column === 'title' && !slot.jsonPath && !slot.xpath) return null
  const field = fieldOf(slot)
  const el = elementOf(slot)
  if (slot.type === 'url') {
    if (URL_ROLES.has(slot.role)) return 'href'
    if (!slot.role && (/link|url|href/.test(field) || el?.attr === '@href')) return 'href'
    return null
  }
  if (slot.type !== 'text') return null
  if (LABEL_ROLES.has(slot.role)) return 'label'
  if (!slot.role && (/button|btn|cta/.test(field) || el?.tag === 'a' || el?.tag === 'button')) return 'label'
  if (/button|btn|cta|link/.test(field)) return null
  if (HEADLINE_ROLES.has(slot.role) && (/title|heading|head/.test(field) || /^h[1-3]$/.test(el?.tag ?? '')))
    return 'headline'
  if (SUBLINE_ROLES.has(slot.role)) return 'subline'
  if (slot.role) return null
  if (/^h[1-3]$/.test(el?.tag ?? '') || /^(?:title|heading|headline)$/.test(field)) return 'headline'
  if (/^(?:p|div|span)$/.test(el?.tag ?? '') || /desc|intro|lead|subtitle|text/.test(field)) return 'subline'
  return null
}

/** The home page of a content map: its `home` route, else the featured view, else the first page. */
function homeOf(contentMap) {
  const pages = list(contentMap?.pages)
  return (
    pages.find((p) => p?.route === 'home' || p?.route === '') ??
    pages.find((p) => /view=featured/.test(String(p?.link ?? ''))) ??
    pages[0] ??
    null
  )
}

/** The hero module of the home page: the best hero position among its modules that carry words. */
function heroEntityOf(contentMap) {
  const entities = new Map(list(contentMap?.entities).map((e) => [e.key, e]))
  const withWords = new Set(
    list(contentMap?.slots)
      .filter((s) => s.type === 'text' && kindOf(s))
      .map((s) => s.entity)
  )
  const home = homeOf(contentMap)
  const placed = home
    ? list(home.assignedModules)
        .filter((m) => m?.published !== '0')
        .map((m) => ({ entity: m.entity, position: String(m.position ?? '') }))
    : [...entities.values()].map((e) => ({ entity: e.key, position: String(e.identity?.position ?? '') }))
  const candidates = placed.filter(
    (m) => withWords.has(m.entity) && !NOT_HERO.test(String(entities.get(m.entity)?.identity?.module ?? ''))
  )
  for (const pattern of HERO_POSITIONS) {
    const hit = candidates.find((m) => pattern.test(m.position))
    if (hit) return hit.entity
  }
  return null
}

/** The order of a slot inside its module (`module-40.12` is 12). */
const indexOf = (key) => Number(/\.(\d+)$/.exec(key)?.[1] ?? 0)

/**
 * The hero slots of a content map: its headline, its subline and its main button (label and link), the first of each
 * on the first slide. Null when the home page has no hero module.
 * @param {{slots?: any[], pages?: any[], entities?: any[]} | null} contentMap
 * @returns {{entity: string, headline: any, subline: any, cta: {label: any, href: any} | null} | null}
 */
export function heroSlotsOf(contentMap) {
  const entity = heroEntityOf(contentMap)
  if (!entity) return null
  const slots = list(contentMap?.slots)
    .filter((s) => s.entity === entity && itemOf(s) === 0)
    .sort((a, b) => indexOf(a.key) - indexOf(b.key))
  const first = (kind, after = -1) =>
    slots.find(
      (s) => kindOf(s) === kind && indexOf(s.key) > after && (kind === 'href' || nonEmpty(s.sample))
    ) ?? null
  const headline = first('headline')
  const subline = first('subline', headline ? indexOf(headline.key) : -1)
  const label = first('label')
  // The button's link: the url of its own group, else the next url after it, else the first one of the module.
  const href = label
    ? (slots.find((s) => kindOf(s) === 'href' && label.group?.id && s.group?.id === label.group.id) ??
      first('href', indexOf(label.key)) ??
      first('href'))
    : null
  return { entity, headline, subline, cta: label ? { label, href } : null }
}

/** How many characters a text slot holds: its measured box, else its contract maximum. */
function limitOf(slot) {
  const fit = slot?.fit
  if (Number.isInteger(fit?.maxCharacters) && fit.maxCharacters > 0) return fit.maxCharacters
  const boxes = Object.values(fit?.maxChars ?? {}).filter((n) => Number.isInteger(n) && n > 0)
  if (boxes.length) return Math.min(...boxes)
  return Number.isInteger(slot?.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : 120
}

const capitalFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const stripEnd = (t) =>
  String(t)
    .replace(/[\s.!:;,]+$/u, '')
    .trim()

/**
 * Names in one list ("tennis, padel, swimming and fitness lessons"): a trailing run of names that end in the same word
 * shares it once.
 */
function listed(names) {
  if (names.length <= 1) return names[0] ?? ''
  const lastWord = (n) => (n.includes(' ') ? n.split(' ').at(-1) : null)
  const shared = lastWord(names.at(-1))
  let run = 0
  for (let i = names.length - 1; i >= 0 && shared && lastWord(names[i]) === shared; i -= 1) run += 1
  if (run >= 2) {
    const head = names.slice(0, names.length - run)
    const tail = names.slice(-run).map((n) => n.slice(0, -shared.length - 1))
    const joined = `${tail.slice(0, -1).join(', ')} and ${tail.at(-1)} ${shared}`
    return head.length ? `${head.join(', ')}, ${joined}` : joined
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Where the business is, from the brief: its city, else the areas it serves as the owner says them. */
export function heroWhereOf(brief) {
  const address = nonEmpty(brief?.business?.address) ? brief.business.address : null
  const city = address ? cityOf(address) : null
  if (city) return { kind: 'city', value: city, source: 'business.address' }
  const areas = serviceAreasOf(brief)
  if (areas.length) return { kind: 'area', value: stripEnd(areas[0]), source: 'business.serviceAreas' }
  return null
}

/** What the business offers, as names in a sentence: the services the site shows, most mentioned first. */
function offeringNames(brief) {
  return heroServicesOf(brief?.reading, null)
    .concat(list(brief?.reading?.services).slice(3))
    .filter((s, i, all) => all.indexOf(s) === i && nonEmpty(s?.label))
    .map((s) => inSentence(stripEnd(String(s.label)), s.quote))
}

/** The brief's own planned hero sentence (`sitemap` home hero `copy`), or null. */
function plannedHeroCopy(brief) {
  const home = list(brief?.sitemap).find((p) => p?.slug === 'home') ?? list(brief?.sitemap)[0]
  const copy = list(home?.sections).find((s) => s?.kind === 'hero')?.copy
  return nonEmpty(copy) ? copy.trim() : null
}

/**
 * The subline: the offerings and where, fitted to the slot by dropping offerings from the end (never a cut word); without
 * offerings, the brief's own planned hero sentence. Null when the brief names nothing the business offers.
 * @returns {{value: string, source: string, where: boolean} | null}
 */
function sublineOf(brief, max) {
  const where = heroWhereOf(brief)
  const names = offeringNames(brief)
  const place = (text) =>
    where?.kind === 'city'
      ? `${text} in ${where.value}.`
      : where
        ? `${text}. ${capitalFirst(where.value)}.`
        : `${text}.`
  for (let n = names.length; n >= 1; n -= 1) {
    const line = place(capitalFirst(listed(names.slice(0, n))))
    if ([...line].length <= max) return { value: line, source: 'reading.services', where: Boolean(where) }
  }
  const planned = plannedHeroCopy(brief)
  if (planned && [...planned].length <= max && names.length === 0)
    return { value: planned, source: 'sitemap.hero', where: false }
  return null
}

/** The digits of a phone link, a leading `+` kept. */
const telOf = (value) => `tel:${String(value).replace(/[^\d+]/g, '')}`

/** The Contact page's own link in the content map (`index.php?Itemid=<n>`), or null. */
function contactPageLink(contentMap) {
  const page = list(contentMap?.pages).find(
    (p) => /contact/i.test(String(p?.route ?? '')) || /com_contact/.test(String(p?.link ?? ''))
  )
  const id = /menuItem-(\d+)/.exec(String(page?.entity ?? ''))?.[1]
  return id ? `index.php?Itemid=${id}` : null
}

/**
 * The hero's main button: the owner's real way in, best first (COO rule 29/10/2026), from the site plan's contact facts
 * (`readContact` through the site plan) and the brief's verified booking link.
 * @returns {{kind: 'phone' | 'whatsapp' | 'booking' | 'form', label: string, href: string | null, source: string} | null}
 */
export function heroContactOf(brief, contact = {}, contentMap = null) {
  if (nonEmpty(contact?.phone?.value))
    return {
      kind: 'phone',
      label: `Call ${contact.phone.value.trim()}`,
      href: contact.phone.href ?? telOf(contact.phone.value),
      source: contact.phone.source ?? 'business.phone'
    }
  if (nonEmpty(contact?.whatsapp?.value))
    return {
      kind: 'whatsapp',
      label: 'WhatsApp us',
      href: contact.whatsapp.href ?? `https://wa.me/${contact.whatsapp.value.replace(/\D+/g, '')}`,
      source: contact.whatsapp.source ?? 'contact.whatsapp'
    }
  const booking = list(brief?.integrations).find(
    (x) => x?.kind === 'booking' && x.verified === true && String(x.url ?? '').startsWith('https://')
  )
  if (booking) {
    const home = list(brief?.sitemap).find((p) => p?.slug === 'home')
    const cta = list(home?.sections).find((s) => s?.kind === 'hero')?.cta
    return {
      kind: 'booking',
      label: cta?.kind === 'booking' && nonEmpty(cta.label) ? cta.label.trim() : 'Book now',
      href: booking.url,
      source: 'integrations.booking'
    }
  }
  const page = contactPageLink(contentMap)
  return page ? { kind: 'form', label: 'Send us a message', href: page, source: 'contact-page' } : null
}

/** Whether a site link leads to the same page as another (`index.php?Itemid=30` and `/index.php?Itemid=30`). */
const samePage = (a, b) => String(a ?? '').replace(/^\//, '') === String(b ?? '').replace(/^\//, '')

/**
 * The hero lines a brief build writes, as site plan slot decisions, and the three answers.
 * @param {any} brief
 * @param {any} contentMap
 * @param {Record<string, {value: string, href?: string, source: string}>} contact - the site plan's contact facts
 * @returns {{slots: Array<{key: string, role: string | null, decision: 'value', value: string, reason: string,
 *   source: string}>, hero: {entity: string | null, keys: Record<string, string | null>, what: any, where: any,
 *   contact: any, missing: Array<{kind: 'what' | 'where' | 'contact', why: string}>}}}
 */
export function planHero(brief, contentMap, contact = {}) {
  const hero = heroSlotsOf(contentMap)
  const slots = []
  const decide = (slot, value, reason, source) =>
    slots.push({ key: slot.key, role: slot.role ?? null, decision: 'value', value, reason, source })
  const where = heroWhereOf(brief)
  const lineSlot = hero?.subline ?? hero?.headline ?? null
  const what = lineSlot ? sublineOf(brief, limitOf(lineSlot)) : null
  if (what && lineSlot) decide(lineSlot, what.value, 'hero-what', what.source)
  const way = heroContactOf(brief, contact, contentMap)
  if (way && hero?.cta?.label) {
    const label = way.label
    if ([...label].length <= limitOf(hero.cta.label)) {
      decide(hero.cta.label, label, 'hero-contact', way.source)
      const href = hero.cta.href
      if (href && way.href && !samePage(href.sample, way.href))
        decide(href, way.href, 'hero-contact', way.source)
    }
  }
  const missing = []
  if (!offeringNames(brief).length && !plannedHeroCopy(brief))
    missing.push({ kind: 'what', why: 'the brief names nothing the business offers' })
  else if (!what)
    missing.push({ kind: 'what', why: 'the template has no hero line for what the business offers' })
  if (!where) missing.push({ kind: 'where', why: 'the brief holds no city or area served' })
  if (!way)
    missing.push({
      kind: 'contact',
      why: 'the brief holds no phone, WhatsApp or booking link, and the site has no Contact page'
    })
  else if (!slots.some((s) => s.reason === 'hero-contact'))
    missing.push({ kind: 'contact', why: 'the template has no hero button for the way in' })
  return {
    slots,
    hero: {
      entity: hero?.entity ?? null,
      keys: {
        headline: hero?.headline?.key ?? null,
        subline: hero?.subline?.key ?? null,
        ctaLabel: hero?.cta?.label?.key ?? null,
        ctaHref: hero?.cta?.href?.key ?? null
      },
      what,
      where,
      contact: way,
      missing
    }
  }
}

// --- The check on the served page ------------------------------------------------------------------------------------

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
const textOf = (html) =>
  String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const HERO_BLOCK =
  /<(?:div|section|header)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:hero|slide|masthead|banner|jumbotron)[^"']*["'][^>]*>/gi
const NEXT_BLOCK = /<\/section>|<section\b|<footer\b|<main\b|\bid\s*=\s*["'][^"']*section[^"']*["']/i

/** The HTML of a home page's first screen: from its hero block (else its first `h1`) to the next section. */
export function firstScreenOf(html) {
  const body = String(html).replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
  const h1 = body.search(/<h1\b/i)
  let start = -1
  for (const m of body.matchAll(HERO_BLOCK)) {
    if (h1 >= 0 && m.index > h1) break
    if (h1 < 0 || h1 - m.index < 6000) start = m.index
    if (h1 < 0) break
  }
  if (start < 0) start = h1
  if (start < 0) return null
  const from = h1 >= 0 ? h1 : start
  const rest = body.slice(from + 3)
  const end = rest.search(NEXT_BLOCK)
  return body.slice(start, from + 3 + (end >= 0 ? end : Math.min(rest.length, 4000)))
}

/** The main button of a first screen: its first link styled as a button, else its first link. */
function mainButtonOf(region) {
  const links = [...region.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map((m) => ({
    attrs: m[1],
    href: /\bhref\s*=\s*["']([^"']*)["']/i.exec(m[1])?.[1] ?? '',
    label: textOf(m[2])
  }))
  return (
    links.find((l) => /\bclass\s*=\s*["'][^"']*\b(?:btn|button)/i.test(l.attrs) && l.label) ??
    links.find((l) => l.label) ??
    null
  )
}

/** A label that promises a call or a chat: it must lead to one, not to a page. */
const PROMISES_CALL = /^(?:call|phone|ring|whatsapp|text)\b/i
/** Words of an offering's name that say nothing of what is offered on their own. */
const GENERIC_WORDS = new Set(
  'lesson lessons session sessions class classes course courses service services training personal personalized private group program programs'.split(
    ' '
  )
)
const BARE_CONTACT = /^(?:contact|contact us|get in touch|reach us|enquire|inquire)$/i

/**
 * Which of the three questions the served home page's first screen does not answer (beside the leftover check; it never
 * changes `pass`).
 * @param {{pages: Array<{path: string, html: string}>, brief: any}} input
 * @returns {Array<{kind: 'what' | 'where' | 'contact', why: string, value?: string}>}
 */
export function checkHeroAnswers({ pages, brief }) {
  const home = list(pages).find((p) => p?.path === '/') ?? list(pages)[0]
  if (!home) return []
  const region = firstScreenOf(home.html)
  if (!region) return [{ kind: 'what', why: 'the home page has no first screen to read' }]
  const text = textOf(region)
  // The subline answers WHAT: the first screen without its headline, unless the headline is all it holds (COO rule 1).
  const lines = textOf(region.replace(/<h1\b[\s\S]*?<\/h1\s*>/i, ' '))
  const beside = lines.length > 0 ? lines : text
  const out = []
  // WHAT: an offering the brief names (its name, or a word of it that is not a generic one), or the trade it states.
  const services = list(brief?.reading?.services)
  const offers = [
    ...services.flatMap((s) => [s?.label, s?.quote]),
    ...list(brief?.business?.subTrade?.quotes).map((q) => q?.quote)
  ]
    .filter(nonEmpty)
    .map((t) => stripEnd(t).toLowerCase())
  const offerWords = services
    .flatMap((s) =>
      String(s?.label ?? '')
        .toLowerCase()
        .split(/[\s&,/]+/)
    )
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w))
  if (!offers.length) out.push({ kind: 'what', why: 'the brief names nothing the business offers' })
  else if (
    !offers.some((o) => beside.includes(o)) &&
    !offerWords.some((w) => new RegExp(`\\b${escape(w)}`).test(beside))
  )
    out.push({
      kind: 'what',
      why: 'the subline names nothing the business offers',
      value: beside.slice(0, 160)
    })
  // WHERE: the city, or a place word of an area served.
  const where = heroWhereOf(brief)
  const places = [
    where?.kind === 'city' ? where.value : null,
    ...serviceAreasOf(brief).flatMap(
      (a) => a.match(/\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)*/gu) ?? []
    )
  ].filter(nonEmpty)
  if (!places.length) out.push({ kind: 'where', why: 'the brief holds no city or area served' })
  else if (!places.some((p) => text.includes(p.toLowerCase())))
    out.push({ kind: 'where', why: 'the first screen names neither the city nor the area served' })
  // CONTACT: a button that calls, opens WhatsApp or a booking, or leads to the Contact page under a label that acts.
  const button = mainButtonOf(region)
  const bookings = list(brief?.integrations)
    .filter((x) => x?.kind === 'booking' && x.verified === true)
    .map((x) => x.url)
  const real =
    button &&
    (/^tel:/i.test(button.href) ||
      /wa\.me|whatsapp/i.test(button.href) ||
      bookings.includes(button.href) ||
      (/contact/i.test(button.href) && !BARE_CONTACT.test(button.label) && !PROMISES_CALL.test(button.label)))
  if (!button) out.push({ kind: 'contact', why: 'the first screen has no button' })
  else if (!real)
    out.push({
      kind: 'contact',
      why: BARE_CONTACT.test(button.label)
        ? 'the main button is a bare "Contact" that names no action'
        : PROMISES_CALL.test(button.label)
          ? 'the main button promises a call or a chat but leads to a page'
          : 'the main button leads to no call, WhatsApp, booking or Contact page',
      value: `${button.label} -> ${button.href}`
    })
  return out
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
