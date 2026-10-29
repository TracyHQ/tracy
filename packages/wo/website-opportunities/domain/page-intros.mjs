// A kept page's introduction follows its declared page role, never its parent route (spec TracyHQ/tracy#189).
// Mastheads, hero sublines and native page leads share this rule. Offering intros name sourced offerings;
// other roles keep suitable writer copy or receive a factual-claim-free editorial line. Location facts belong
// on About, Contact and place pages. The writer validates the final words again in `hero-lines.js`.
import {
  heroSlotsOf,
  heroWhereOf,
  heroWhoOf,
  limitOf,
  offeringLine,
  offeringNames
} from './hero-first-screen.mjs'
import { findUsp } from './hero-usp.mjs'
import { inSentence } from './plain-prose.mjs'
import { pageRole } from './page-plan.mjs'
import { placeIntroRole, roleIntro } from './page-intro-role.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''

/** The menu item id of a page (`menuItem-167` is 167). */
const menuIdOf = (page) => /menuItem-(\d+)/.exec(String(page?.entity ?? ''))?.[1] ?? null

/** The entities that carry offering roles, by key. */
function offeringEntities(contentMap) {
  return new Set(
    list(contentMap?.slots)
      .filter((s) => String(s.role ?? '').startsWith('offering.'))
      .map((s) => s.entity)
  )
}

/** The articles a page shows: a category's offering articles, or the one article it opens. Null when not an offering page. */
function offeringArticlesOf(page, contentMap, offering) {
  const link = String(page?.link ?? '')
  if (!/option=com_content/.test(link)) return null
  const id = /[?&]id=(\d+)/.exec(link)?.[1]
  if (!id) return null
  if (/view=article/.test(link)) return offering.has(`article-${id}`) ? [`article-${id}`] : null
  if (!/view=category/.test(link)) return null
  const articles = list(contentMap?.entities)
    .filter((e) => e.kind === 'article' && e.identityReferences?.catid === `category-${id}`)
    .map((e) => e.key)
    .filter((key) => offering.has(key))
  return articles.length ? articles : null
}

/** The intro and heading slots of a page in a per-page masthead (`contentMap.intros`), or null. */
function mastheadIntroOf(page, contentMap) {
  const id = menuIdOf(page)
  if (!id) return null
  for (const intro of list(contentMap?.intros)) {
    const n = list(intro.items).findIndex((ids) => list(ids).map(String).includes(id))
    if (n < 0) continue
    const at = (field) =>
      list(contentMap?.slots).find(
        (s) =>
          s.entity === intro.entity &&
          s.type === 'text' &&
          list(s.jsonPath)[0] === intro.field &&
          list(s.jsonPath)[1] === field &&
          list(s.jsonPath)[2] === n
      ) ?? null
    const line = at('description')
    if (line && nonEmpty(line.sample)) return { line, heading: at('title') }
  }
  return null
}

/** A declared masthead, hero subline or native page lead, never an arbitrary body paragraph. */
function pageIntroOf(page, contentMap) {
  const masthead = mastheadIntroOf(page, contentMap)
  if (masthead) return masthead
  const hero = heroSlotsOf(contentMap, page)
  if (hero?.subline) return { line: hero.subline, heading: hero.headline }
  const slots = list(contentMap?.slots).filter((s) => s.entity === page.entity && s.type === 'text')
  const line = slots.find((s) => s.role === 'article.lead')
  return line ? { line, heading: slots.find((s) => s.role === 'editorial.heading') } : null
}

/** The declared role of a content-map page: the site plan's row, else the map's, else its own route words. */
function declaredRoleOf(page, pages) {
  return (
    list(pages).find((p) => String(p.id) === String(page.route))?.role ??
    page.role ??
    pageRole({ id: String(page.route), label: page.label })
  )
}

/**
 * The roles of the kept pages each intro slot introduces, by slot key. A masthead's default line shows on every page
 * without a line of its own, so one slot can introduce pages of several roles: a role intro or a place line goes only
 * to a slot whose pages share one role, else the slot keeps the business's own copy (`ownedBy`).
 */
function introOwners(contentMap, pages, kept) {
  const owners = new Map()
  for (const page of list(contentMap?.pages)) {
    if (page?.route === 'home' || !kept.has(String(page?.route ?? ''))) continue
    const key = pageIntroOf(page, contentMap)?.line?.key
    if (key) owners.set(key, new Set([...(owners.get(key) ?? []), declaredRoleOf(page, pages)]))
  }
  return owners
}
const ownedBy = (owners, key, role) => [...(owners.get(key) ?? [role])].every((r) => r === role)

/**
 * The intro decisions of every kept page with a declared introduction.
 * @param {object} input
 * @param {any} input.brief
 * @param {any} input.contentMap - with `intros` when the release has per-page mastheads (`contentMapOfTemplate`)
 * @param {Array<{id: string, path?: string, decision: string}>} input.pages - the site plan's page decisions
 * @param {Record<string, string>} [input.cardNames] - the honesty plan's offering of each card (`article-14.offering`)
 * @returns {Array<{key: string, role: string | null, decision: 'value', value: string, reason: 'intro-what' | 'intro-role', when: 'missing' | 'role-mismatch',
 *   source: string, offerings: string[], who?: string, short?: string, place?: string, heading?: string, page: string}>}
 */
export function planPageIntros({ brief, contentMap, pages = [], cardNames = {} }) {
  const kept = new Set(
    list(pages)
      .filter((p) => p.decision === 'keep')
      .map((p) => String(p.id))
  )
  const offering = offeringEntities(contentMap)
  const where = heroWhereOf(brief)
  // Who the offerings serve: the people the business's USP names, else the owner's audience (`heroWhoOf`).
  const who = heroWhoOf(
    brief,
    findUsp(brief, {
      places: [where?.city, where?.district, where?.value].filter(nonEmpty),
      offerings: offeringNames(brief)
    }).usp
  )
  const services = list(brief?.reading?.services)
  const quoteOf = (label) => services.find((s) => s?.label === label)?.quote ?? null
  const owners = introOwners(contentMap, pages, kept)
  const done = new Set()
  const out = []
  for (const page of list(contentMap?.pages)) {
    if (page?.route === 'home' || !kept.has(String(page?.route ?? ''))) continue
    const articles = offeringArticlesOf(page, contentMap, offering)
    const declared = declaredRoleOf(page, pages)
    const own = pageIntroOf(page, contentMap)?.line
    // One decision per slot, and none on a line other pages of another role show too.
    if (!own || done.has(own.key) || !ownedBy(owners, own.key, declared)) continue
    done.add(own.key)
    if (!articles || !['services', 'offerings', 'menu', 'other'].includes(declared)) {
      const slot = own
      const names = offeringNames(brief)
      const value =
        ['services', 'offerings'].includes(declared) && names.length
          ? offeringLine(names, null, limitOf(slot))?.value
          : roleIntro(declared)
      if (value && slot && [...value].length <= limitOf(slot))
        out.push({
          key: slot.key,
          role: slot.role ?? null,
          decision: 'value',
          value,
          reason: 'intro-role',
          when: 'role-mismatch',
          pageRole: declared,
          offerings: offeringNames(brief),
          source: 'page.role',
          page: String(page.route)
        })
      continue
    }
    const labels = articles.map((a) => cardNames[`${a}.offering`]).filter(nonEmpty)
    const names = labels.length ? labels.map((l) => inSentence(l, quoteOf(l))) : offeringNames(brief)
    if (!names.length) continue
    const intro = pageIntroOf(page, contentMap)
    const slot = intro?.line ?? null
    if (!slot) continue
    const heading = intro?.heading ?? null
    const line = offeringLine(names, where, limitOf(slot), who)
    if (!line) continue
    out.push({
      key: slot.key,
      role: slot.role ?? null,
      decision: 'value',
      value: line.value,
      reason: 'intro-what',
      pageRole: declared === 'other' ? 'services' : declared,
      when: 'missing',
      source: labels.length ? 'honesty.cardNames' : 'reading.services',
      offerings: names.map((n) => n.toLowerCase()),
      ...(line.who ? { who: line.who.replace(/^for\s+/i, '') } : {}),
      ...(where && heading
        ? { short: line.short, place: where.city ?? where.value, heading: heading.key }
        : {}),
      ...(where && !heading ? { place: where.city ?? where.value } : {}),
      page: String(page.route)
    })
  }
  return out
}

/**
 * Where a business that serves wider than its pin is based (COO rule 29/10/2026, tier `wide` of `heroWhereOf`): the hero
 * names the city, and the intro of the About and Contact pages says the district and the area served, in the owner's own
 * words ("Based in Tilal Al Ghaf. Locations across Dubai."). Facts only: the district is a part of the address, the area
 * is the owner's. Written only when the copy writer's line does not name the district (`when: 'missing'`), after its
 * line when both fit (`hero-lines.js`).
 * @returns {Array<{key: string, role: string | null, decision: 'value', value: string, reason: 'intro-where',
 *   when: 'missing', source: string, district: string, max: number, page: string}>}
 */
export function planPlaceIntros({ brief, contentMap, pages = [] }) {
  const where = heroWhereOf(brief)
  const area = list(brief?.business?.serviceAreas)
    .map((a) => (typeof a === 'string' ? a : a?.text))
    .find(nonEmpty)
  if (where?.tier !== 'wide' || !where.district || !area) return []
  const kept = new Set(
    list(pages)
      .filter((p) => p.decision === 'keep')
      .map((p) => String(p.id))
  )
  const value = `Based in ${where.district}. ${area.trim().replace(/[.!]*$/, '.')}`
  const owners = introOwners(contentMap, pages, kept)
  const done = new Set()
  const out = []
  for (const page of list(contentMap?.pages)) {
    if (page?.route === 'home') continue
    const declared = declaredRoleOf(page, pages)
    if (!placeIntroRole(declared) || !kept.has(String(page?.route ?? ''))) continue
    const slot = pageIntroOf(page, contentMap)?.line ?? null
    if (!slot || [...value].length > limitOf(slot)) continue
    // A place line never reaches a team or offering page through a default line it shares with a place page.
    if (done.has(slot.key) || !ownedBy(owners, slot.key, declared)) continue
    done.add(slot.key)
    out.push({
      key: slot.key,
      role: slot.role ?? null,
      decision: 'value',
      value,
      reason: 'intro-where',
      pageRole: declared,
      when: 'missing',
      source: 'business.address',
      district: where.district,
      max: limitOf(slot),
      page: String(page.route)
    })
  }
  return out
}
