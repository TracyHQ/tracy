// The intro of an offering page names what it offers, who it serves, and where (spec TracyHQ/tracy#189, COO rule 29/10/2026, the first
// screen rule of `hero-first-screen.mjs` carried to the pages that list or show the business's offerings).
//
// An offering page is a page of the content map that shows offering records: a category page whose articles carry
// offering roles (ADR 0040), or one such article's own page. Its intro is the page's line in a per-page masthead (a module
// whose `menuitem_config` names the menu items each line belongs to, `contentMap.intros`), else the subline of a module
// in a hero position assigned to that page. The value names the page's offerings (the site plan's card names, else the
// brief's services) and the place, unless the page heading already names it.
//
// 🔒 A LINE THAT ALREADY DOES ITS JOB STAYS: the decision is `when: 'missing'`, and the write keeps the copy writer's line
// when it names an offering and the place is said by it or by the heading (`hero-lines.js`). 🔒 NOTHING IS INVENTED.
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

/**
 * The intro decisions of every kept offering page.
 * @param {object} input
 * @param {any} input.brief
 * @param {any} input.contentMap - with `intros` when the release has per-page mastheads (`contentMapOfTemplate`)
 * @param {Array<{id: string, path?: string, decision: string}>} input.pages - the site plan's page decisions
 * @param {Record<string, string>} [input.cardNames] - the honesty plan's offering of each card (`article-14.offering`)
 * @returns {Array<{key: string, role: string | null, decision: 'value', value: string, reason: 'intro-what', when: 'missing',
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
    findUsp(brief, { places: [where?.value].filter(nonEmpty), offerings: offeringNames(brief) }).usp
  )
  const services = list(brief?.reading?.services)
  const quoteOf = (label) => services.find((s) => s?.label === label)?.quote ?? null
  const out = []
  for (const page of list(contentMap?.pages)) {
    if (page?.route === 'home' || !kept.has(String(page?.route ?? ''))) continue
    const articles = offeringArticlesOf(page, contentMap, offering)
    if (!articles) continue
    const labels = articles.map((a) => cardNames[`${a}.offering`]).filter(nonEmpty)
    const names = labels.length ? labels.map((l) => inSentence(l, quoteOf(l))) : offeringNames(brief)
    if (!names.length) continue
    const masthead = mastheadIntroOf(page, contentMap)
    const hero = masthead ? null : heroSlotsOf(contentMap, page)
    const slot = masthead?.line ?? hero?.subline ?? null
    if (!slot) continue
    const heading = masthead?.heading ?? hero?.headline ?? null
    const line = offeringLine(names, where, limitOf(slot), who)
    if (!line) continue
    out.push({
      key: slot.key,
      role: slot.role ?? null,
      decision: 'value',
      value: line.value,
      reason: 'intro-what',
      when: 'missing',
      source: labels.length ? 'honesty.cardNames' : 'reading.services',
      offerings: names.map((n) => n.toLowerCase()),
      ...(line.who ? { who: line.who.replace(/^for\s+/i, '') } : {}),
      ...(where && heading ? { short: line.short, place: where.value, heading: heading.key } : {}),
      ...(where && !heading ? { place: where.value } : {}),
      page: String(page.route)
    })
  }
  return out
}
