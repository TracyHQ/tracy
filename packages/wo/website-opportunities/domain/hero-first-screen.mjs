// The first screen of a brief build answers three questions (spec TracyHQ/tracy#189, COO rule 29/10/2026):
//   WHAT     the hero subline (the headline when there is no subline) names the offerings or the trade, from the brief
//   WHERE    the city or the area served appears in the headline or the subline
//   CONTACT  the hero's main button uses the owner's real way in, in order: a phone call, WhatsApp, a verified booking
//            link, a channel the business names itself ("DM us"), the Contact page; its label names the action ("Call ...", "WhatsApp us"), never a bare "Contact"
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
import { contactChannelsOf, serviceAreasOf } from './contact-reading.mjs'
import { findUsp } from './hero-usp.mjs'
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
  // A line of its own for the opening hours: WHEN is said only there, never forced into another line.
  if (/^(?:hours?|opening(?:[-_ ]hours)?|open|times?|schedule)$/.test(field)) return 'when'
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
function heroEntityOf(contentMap, page = homeOf(contentMap)) {
  const entities = new Map(list(contentMap?.entities).map((e) => [e.key, e]))
  const withWords = new Set(
    list(contentMap?.slots)
      .filter((s) => s.type === 'text' && kindOf(s))
      .map((s) => s.entity)
  )
  const home = page
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
 * @returns {{entity: string, headline: any, subline: any, when: any, cta: {label: any, href: any} | null} | null}
 */
export function heroSlotsOf(contentMap, page = undefined) {
  const entity = heroEntityOf(contentMap, page)
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
  return { entity, headline, subline, when: first('when'), cta: label ? { label, href } : null }
}

/** How many characters a text slot holds: its measured box, else its contract maximum. */
export function limitOf(slot) {
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
export function listed(names) {
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

/**
 * The district of an address as Google writes it (pure): the part just before its city, when it holds no number and is
 * no longer than four words ("Al Hebiah Fourth - Tilal Al Ghaf - Dubai - United Arab Emirates" gives "Tilal Al Ghaf").
 * Null when the address names none. Never invented: only a part of the address itself.
 */
export function districtOf(address) {
  const city = cityOf(address)
  if (!city) return null
  const parts = String(address)
    .replace(/\s+/g, ' ')
    .split(/ - |,/)
    .map((p) => p.trim())
    .filter(Boolean)
  const at = parts.lastIndexOf(city)
  const part = at > 0 ? parts[at - 1] : null
  return part && !/\d/.test(part) && part.split(' ').length <= 4 && part !== city ? part : null
}

/**
 * Where the business is, in three tiers (COO rule 29/10/2026, by facts of the brief only):
 *   wide    it serves wider than its pin (the owner states an area served): the hero names the city; the district is said
 *           on the About and Contact pages and in the search result (`page-intros.mjs`, `placeSeoOf`)
 *   venue   a place customers visit, no wider area: the hero names "<district>, <city>" when it fits, else the city
 *   city    no district in the address: the city (no country is added: nothing in the brief tells an ambiguous city apart)
 * Without a city, the areas it serves as the owner says them.
 * @returns {{kind: 'city' | 'area', value: string, city: string | null, district: string | null,
 *   tier: 'wide' | 'venue' | 'city' | 'area', fallback?: {kind: 'city', value: string}, source: string} | null}
 */
export function heroWhereOf(brief) {
  const address = nonEmpty(brief?.business?.address) ? brief.business.address : null
  const city = address ? cityOf(address) : null
  const areas = serviceAreasOf(brief)
  const district = address ? districtOf(address) : null
  const source = 'business.address'
  if (city && areas.length) return { kind: 'city', value: city, city, district, tier: 'wide', source }
  if (city && district) {
    const fallback = { kind: 'city', value: city }
    return { kind: 'city', value: `${district}, ${city}`, city, district, tier: 'venue', fallback, source }
  }
  if (city) return { kind: 'city', value: city, city, district: null, tier: 'city', source }
  if (areas.length) {
    const value = stripEnd(areas[0])
    return { kind: 'area', value, city: null, district: null, tier: 'area', source: 'business.serviceAreas' }
  }
  return null
}

/** The forms of a place to try in a box, longest first: "<district>, <city>", then the city. */
const placesOf = (where) => (where ? [where, ...(where.fallback ? [where.fallback] : [])] : [null])

/** What the business offers, as names in a sentence: the services the site shows, most mentioned first. */
export function offeringNames(brief) {
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
 * The subline: the offerings, who they serve and where, fitted to the slot (`offeringLine`); without offerings, the
 * brief's own planned hero sentence. Null when the brief names nothing the business offers.
 * @returns {{value: string, short: string, source: string, where: boolean, who: string | null} | null}
 */
function sublineOf(brief, max, where = heroWhereOf(brief), who = null) {
  const line = offeringLine(offeringNames(brief), where, max, who)
  if (line) return { ...line, source: 'reading.services' }
  const planned = plannedHeroCopy(brief)
  if (planned && [...planned].length <= max && offeringNames(brief).length === 0)
    return { value: planned, short: planned, source: 'sitemap.hero', where: false, who: null }
  return null
}

/**
 * Who the business serves, for the subline: the USP's people ("for kids and adults") with the owner's levels as detail,
 * else the owner's first audience ("for all ages and levels"). Null when the brief names nobody.
 * @returns {{core: string, detail: string | null, source: string} | null}
 */
export function heroWhoOf(brief, usp = null) {
  const audience = list(brief?.reading?.audience)
    .map((a) => (nonEmpty(a?.label) ? stripEnd(a.label) : null))
    .filter(Boolean)
  if (nonEmpty(usp?.who))
    return {
      core: `for ${usp.who}`,
      detail: audience.some((a) => /\blevels?\b/i.test(a)) ? 'at every level' : null,
      source: 'usp'
    }
  if (audience.length)
    return { core: `for ${audience[0].replace(/^for\s+/i, '')}`, detail: null, source: 'reading.audience' }
  return null
}

/**
 * The headline: the USP and the place (the place after a comma, else without one, else left to the subline), the first
 * of the USP's headlines that fits. Without a USP: what the business offers in its city. Null when nothing fits.
 * @returns {{value: string, where: boolean, source: string} | null}
 */
function headlineOf(brief, usp, where, max) {
  const cities = placesOf(where)
    .filter((w) => w?.kind === 'city')
    .map((w) => w.value)
  const city = cities[0] ?? null
  const fits = (t) => [...t].length <= max
  // The USP's key words carry the template's accent (`[[...]]` marks, `joomla-inline-styles.js`).
  const at = (value) => {
    const i = usp?.accent ? value.toLowerCase().indexOf(usp.accent.toLowerCase()) : -1
    if (i < 0) return {}
    const end = i + usp.accent.length
    return { marked: `${value.slice(0, i)}[[${value.slice(i, end)}]]${value.slice(end)}` }
  }
  if (usp) {
    for (const h of usp.headlines) {
      for (const value of cities.flatMap((c) => [`${h}, in ${c}`, `${h} in ${c}`]))
        if (fits(value)) return { value, ...at(value), where: true, source: `usp:${usp.kind}`, usp }
    }
    for (const h of usp.headlines)
      if (fits(h)) return { value: h, ...at(h), where: false, source: `usp:${usp.kind}`, usp }
    return null
  }
  const line = offeringLine(offeringNames(brief), city ? where : null, max + 1)
  return line
    ? {
        value: line.value.replace(/\.$/, ''),
        where: line.where,
        names: line.names,
        source: 'reading.services'
      }
    : null
}

/** The opening hours in one short line, only when the brief trusts them and every day reads the same. */
function whenLineOf(brief) {
  const fact = list(brief?.facts).find((f) => f?.field === 'hours' && f.onSite === true)
  const days = list(fact?.value).filter(nonEmpty)
  if (days.length !== 7) return null
  const times = new Set(days.map((d) => d.replace(/^[^:]+:\s*/, '').trim()))
  if (times.size !== 1) return null
  const [time] = times
  return /closed/i.test(time) ? null : { value: `Open daily, ${time}`, source: fact.id }
}

/**
 * Offerings in one sentence with who they serve and the place, and the same sentence without the place (`short`, for a
 * heading that already names the place: decided at write time, `hero-lines.js`). When the box is short (COO rule
 * 29/10/2026) the detail of WHO goes first, then WHO itself, the place stays (the caller passes no place when the
 * headline holds it), and the offerings drop from the end last. Null when none fits.
 * @param {string[]} names - offering names in sentence case
 * @param {{kind: 'city' | 'area', value: string} | null} where
 * @param {number} max
 * @param {{core: string, detail?: string | null} | null} [who] - "for kids and adults", "at every level"
 * @returns {{value: string, short: string, where: boolean, who: string | null, names: number} | null}
 */
export function offeringLine(names, where, max, who = null) {
  const place = (text, at) =>
    at?.kind === 'city' ? `${text} in ${at.value}.` : at ? `${text}. ${capitalFirst(at.value)}.` : `${text}.`
  const tails = [
    who?.core && who.detail ? { text: ` ${who.core}, ${who.detail}`, who: who.core } : null,
    who?.core ? { text: ` ${who.core}`, who: who.core } : null,
    { text: '', who: null }
  ].filter(Boolean)
  for (let n = names.length; n >= 1; n -= 1) {
    const what = capitalFirst(listed(names.slice(0, n)))
    for (const tail of tails) {
      // A place after a WHO detail reads as a list: "..., at every level, in Dubai".
      const text = `${what}${tail.text}`
      // The district goes first: "<district>, <city>" is tried, then the city alone, before any WHO is dropped.
      for (const at of placesOf(where)) {
        const line =
          tail.text.includes(',') && at?.kind === 'city' ? `${text}, in ${at.value}.` : place(text, at)
        if ([...line].length <= max)
          return { value: line, short: `${text}.`, where: Boolean(at), who: tail.who, names: n }
      }
    }
  }
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
 * @returns {{kind: 'phone' | 'whatsapp' | 'booking' | 'message' | 'form', label: string, href: string | null, source: string} | null}
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
  // A channel the business names itself ("DM us"), as the brief's own hero button holds it.
  const home = list(brief?.sitemap).find((p) => p?.slug === 'home')
  const dm = list(home?.sections).find((s) => s?.kind === 'hero')?.cta
  if (dm?.kind === 'link' && nonEmpty(dm.label) && String(dm.href ?? '').startsWith('https://'))
    return { kind: 'message', label: dm.label.trim(), href: dm.href, source: 'sitemap.hero.cta' }
  // Else the direct message of a social network the brief really has (`contactChannelsOf`).
  const message = contactChannelsOf(brief).find((c) => c.kind === 'message')
  if (message) return { kind: 'message', label: message.label, href: message.href, source: message.source }
  const page = contactPageLink(contentMap)
  return page ? { kind: 'form', label: 'Send us a message', href: page, source: 'contact-page' } : null
}

/** Whether a site link leads to the same page as another (`index.php?Itemid=30` and `/index.php?Itemid=30`). */
const samePage = (a, b) => String(a ?? '').replace(/^\//, '') === String(b ?? '').replace(/^\//, '')

/**
 * The hero's second button (COO rule 29/10/2026): when the template gives the first slide a second button (its label and
 * link in a group of their own) and the brief holds a channel after the main button's, that channel: WhatsApp after a call,
 * then a direct message. Never in the contract slots: the template ships it empty and the contract cannot activate an empty
 * slot, so the records step writes it (`joomla-hero-second-button.js`). Null when there is no such slot or channel.
 */
function secondButtonOf(brief, contentMap, hero, way) {
  if (!hero?.cta?.label || !way) return null
  const mainGroup = hero.cta.label.group?.id ?? null
  const slots = list(contentMap?.slots).filter((s) => s.entity === hero.entity && itemOf(s) === 0)
  const label = slots.find(
    (s) => s.key !== hero.cta.label.key && kindOf(s) === 'label' && s.group?.id && s.group.id !== mainGroup
  )
  const href = label ? slots.find((s) => kindOf(s) === 'href' && s.group?.id === label.group.id) : null
  if (!label || !href) return null
  const after = contactChannelsOf(brief).filter((c) => c.kind !== 'phone' && c.href !== way.href)
  const channel = after.find((c) => [...c.label].length <= limitOf(label))
  if (!channel) return null
  return {
    label: { key: label.key, value: channel.label },
    href: { key: href.key, value: channel.href },
    kind: channel.kind,
    source: channel.source,
    ...(channel.inferred ? { inferred: true } : {})
  }
}

/**
 * The hero lines a brief build writes, as site plan slot decisions, and the three answers.
 * @param {any} brief
 * @param {any} contentMap
 * @param {Record<string, {value: string, href?: string, source: string}>} contact - the site plan's contact facts
 * @returns {{slots: Array<{key: string, role: string | null, decision: 'value', value: string, reason: string,
 *   source: string}>, hero: {entity: string | null, keys: Record<string, string | null>, what: any, where: any,
 *   contact: any, missing: Array<{kind: 'what' | 'where' | 'contact', why: string}>}}}
 */
export function planHero(brief, contentMap, contact = {}, { themes = [] } = {}) {
  const hero = heroSlotsOf(contentMap)
  const slots = []
  const decide = (slot, value, reason, source) =>
    slots.push({ key: slot.key, role: slot.role ?? null, decision: 'value', value, reason, source })
  const where = heroWhereOf(brief)
  const found = findUsp(brief, {
    themes,
    places: [where?.city, where?.district, where?.value].filter(nonEmpty),
    offerings: offeringNames(brief)
  })
  // Two lines: the headline says WHY and WHERE, the subline WHAT and WHO. One line only: it says WHAT and WHERE.
  const twoLines = Boolean(hero?.headline && hero?.subline)
  // The best USP whose headline fits the box; none fits, or none passed: what and where.
  const fitted = twoLines
    ? found.passing.map((u) => headlineOf(brief, u, where, limitOf(hero.headline))).find(Boolean)
    : null
  const usp = fitted?.usp ?? null
  const head = twoLines ? (fitted ?? headlineOf(brief, null, where, limitOf(hero.headline))) : null
  const who = heroWhoOf(brief, usp)
  if (head) {
    decide(hero.headline, head.value, head.usp ? 'hero-why' : 'hero-what', head.source)
    if (head.marked) slots.at(-1).marked = head.marked
  }
  const lineSlot = hero?.subline ?? hero?.headline ?? null
  // The place is said once: not in the subline when the headline, as planned, holds it.
  // Without a USP the headline says what and where; the subline says nothing twice: the whole list when the headline had
  // to drop offerings, else who the business serves, else it is left alone.
  const headHasAll = head && !head.usp && head.names === offeringNames(brief).length
  const whoOnly =
    headHasAll && who && [`${capitalFirst(who.core)}.`].find((t) => [...t].length <= limitOf(lineSlot))
  const what = whoOnly
    ? { value: whoOnly, short: whoOnly, source: who.source, where: false, who: who.core }
    : headHasAll
      ? null
      : lineSlot
        ? sublineOf(brief, limitOf(lineSlot), head?.where ? null : where, twoLines ? who : null)
        : null
  // A headline left to the copy writer may still name the place: the short line is chosen at write time (`hero-lines.js`).
  if (what && lineSlot)
    slots.push({
      key: lineSlot.key,
      role: lineSlot.role ?? null,
      decision: 'value',
      value: what.value,
      reason: 'hero-what',
      source: what.source,
      ...(where && !head && what.short !== what.value && hero?.headline && hero.headline !== lineSlot
        ? { short: what.short, place: where.city ?? where.value, heading: hero.headline.key }
        : {})
    })
  const when = hero?.when ? whenLineOf(brief) : null
  if (when && [...when.value].length <= limitOf(hero.when))
    decide(hero.when, when.value, 'hero-when', when.source)
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
  // The second button, when the template has one: the next channel after the main button's (`secondButtonOf`).
  const second = secondButtonOf(brief, contentMap, hero, way)
  const missing = []
  if (!offeringNames(brief).length && !plannedHeroCopy(brief))
    missing.push({ kind: 'what', why: 'the brief names nothing the business offers' })
  else if (!what && !headHasAll)
    missing.push({ kind: 'what', why: 'the template has no hero line for what the business offers' })
  if (!found.usp)
    missing.push({
      kind: 'why',
      why: 'nothing in the brief is a specific, provable difference: the headline says what and where',
      question: found.question
    })
  else if (!usp)
    missing.push({
      kind: 'why',
      why: 'the template has no hero headline the difference fits',
      value: found.usp.label
    })
  if (!who) missing.push({ kind: 'who', why: 'the brief names nobody the business serves' })
  else if (twoLines && !what?.who && !/\bfamily\b/i.test(head?.value ?? ''))
    missing.push({ kind: 'who', why: 'the subline box has no room for who the business serves' })
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
        when: hero?.when?.key ?? null,
        ctaLabel: hero?.cta?.label?.key ?? null,
        ctaHref: hero?.cta?.href?.key ?? null
      },
      usp: usp ?? found.usp,
      weighed: found.weighed,
      headline: head,
      what,
      who,
      where,
      contact: way,
      ...(second ? { second } : {}),
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
 * @returns {Array<{kind: 'what' | 'why' | 'who' | 'where' | 'contact', why: string, value?: string, question?: string}>}
 */
export function checkHeroAnswers({ pages, brief }) {
  const home = list(pages).find((p) => p?.path === '/') ?? list(pages)[0]
  if (!home) return []
  const region = firstScreenOf(home.html)
  if (!region) return [{ kind: 'what', why: 'the home page has no first screen to read' }]
  const text = textOf(region)
  // The subline answers WHAT: the first screen without its headline, unless the headline is all it holds.
  const lines = textOf(region.replace(/<h1\b[\s\S]*?<\/h1\s*>/i, ' '))
  const where = heroWhereOf(brief)
  const found = findUsp(brief, {
    places: [where?.city, where?.district, where?.value].filter(nonEmpty),
    offerings: offeringNames(brief)
  })
  // Without a USP the headline itself says what the business offers (COO rule 29/10/2026): the whole first screen counts.
  const beside = lines.length > 0 && found.usp ? lines : text
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
  // WHY: what sets the business apart, when the brief proves something (`hero-usp.mjs`); else the owner is asked.
  if (!found.usp)
    out.push({
      kind: 'why',
      why: 'nothing in the brief is a specific, provable difference',
      question: found.question
    })
  else if (!found.passing.some((u) => saysUsp(text, u)))
    out.push({
      kind: 'why',
      why: 'the first screen does not say what sets the business apart',
      value: found.usp.label
    })
  // WHO: the people the business serves, as the USP or the owner's audience names them.
  const who = heroWhoOf(brief, found.usp)
  const whoWords = [
    ...(found.usp?.words ?? []),
    ...String(found.usp?.who ?? '')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
    ...list(brief?.reading?.audience).flatMap((a) =>
      String(a?.label ?? '')
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= 4 && !['every', 'with', 'from'].includes(w))
    )
  ]
  if (!who) out.push({ kind: 'who', why: 'the brief names nobody the business serves' })
  else if (!whoWords.some((w) => new RegExp(`\\b${escape(w.toLowerCase())}`).test(text)))
    out.push({ kind: 'who', why: 'the first screen names nobody the business serves' })
  // WHERE: the city, or a place word of an area served.
  const places = [
    where?.city ?? null,
    ...serviceAreasOf(brief).flatMap(
      (a) => a.match(/\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)*/gu) ?? []
    )
  ].filter(nonEmpty)
  if (!places.length) out.push({ kind: 'where', why: 'the brief holds no city or area served' })
  else if (!places.some((p) => text.includes(p.toLowerCase())))
    out.push({ kind: 'where', why: 'the first screen names neither the city nor the area served' })
  // CONTACT: a button that calls, opens WhatsApp or a booking, or leads to the Contact page under a label that acts.
  const button = mainButtonOf(region)
  const heroCta = list(list(brief?.sitemap).find((p) => p?.slug === 'home')?.sections).find(
    (s) => s?.kind === 'hero'
  )?.cta
  const dmHref = heroCta?.kind === 'link' ? heroCta.href : null
  const bookings = list(brief?.integrations)
    .filter((x) => x?.kind === 'booking' && x.verified === true)
    .map((x) => x.url)
  const real =
    button &&
    (/^tel:/i.test(button.href) ||
      /wa\.me|whatsapp/i.test(button.href) ||
      bookings.includes(button.href) ||
      (nonEmpty(dmHref) && button.href === dmHref) ||
      (/contact/i.test(button.href) && !BARE_CONTACT.test(button.label) && !PROMISES_CALL.test(button.label)))
  if (!button) out.push({ kind: 'contact', why: 'the first screen has no button' })
  else if (!real)
    out.push({
      kind: 'contact',
      why: BARE_CONTACT.test(button.label)
        ? 'the main button is a bare "Contact" that names no action'
        : PROMISES_CALL.test(button.label)
          ? 'the main button promises a call or a chat but leads to a page'
          : 'the main button leads to no call, WhatsApp, booking, message or Contact page',
      value: `${button.label} -> ${button.href}`
    })
  return out
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether a text says a USP: its theme words, else most of its own words. */
function saysUsp(text, usp) {
  if (usp.words?.length) return usp.words.some((w) => new RegExp(`\\b${escape(w)}`).test(text))
  const words = String(usp.headlines?.[0] ?? usp.label)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
  return words.length > 0 && words.filter((w) => text.includes(w)).length * 2 >= words.length
}
