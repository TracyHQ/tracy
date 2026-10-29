// The last look at the words a build is about to write (spec TracyHQ/tracy#189, ticket #192), after the writer and before
// the site: nothing invented in a fact slot, no demo words left on a button or a menu label, no demo filler in an offering
// the business named. Pure and deterministic: rule-built from the slot's role, its demo sample and the customer's own text.
//
// 🔒 A NAME, A PRICE OR A NUMBER THE CUSTOMER NEVER GAVE IS NOT WRITTEN (any build, with a brief or without one): a person's
// or a quote author's name must stand in the customer's own text, and a price, a schedule or a statistic may carry no
// figure the customer's text does not hold. Measured 29/10/2026: the writer named four coaches nobody had given.
// 🔒 A LABEL KEEPS NO DEMO WORD (brief builds): a button, a call to action or a menu label that still holds a word of its
// demo sample the business never used ("Try a class" for a swimming school) takes a neutral label: a button "Contact" when
// the business can be reached, else "Learn more"; a menu label the title of the page it opens, else "Learn more".
// 🔒 THE SITE PLAN WINS: what the plan decided (`site-plan-honesty.mjs`: a brief value, an emptied fact, a hidden card) is
// never left to the writer.
import { neutralFor, neutralText } from './neutral-copy.mjs'

/** Interface words a label of any business may hold: never a demo word. English, the templates' source language. */
export const GENERIC_LABEL_WORDS = new Set(
  (
    'a an the and or of to for with in on at by from up out our your you we us me my it its this that here now today ' +
    'home about contact contacts view more read learn see details detail info information submit send close open next ' +
    'previous prev back menu search login log sign register visit play go start get started book booking call email mail ' +
    'message write all news blog page pages faq help services service team gallery shop store cart account profile ' +
    'explore discover join subscribe follow find directions map location locations hours video videos photos watch ' +
    'download apply request quote enquire enquiry inquiry ask question questions reserve reservation order buy price ' +
    'prices pricing terms privacy policy cookies legal'
  ).split(' ')
)

const LABEL_ROLES = new Set([
  'editorial.button_label',
  'editorial.menu_label',
  'contact.cta_label',
  'package.cta_label',
  'offering.cta_label'
])
/** Roles whose whole value is a person's name. */
const NAME_ROLES = new Set(['person.name', 'quote.author_name'])
/** Roles whose figures are facts: a price, a schedule, a statistic, a plan. */
const FIGURE_ROLES = new Set([
  'offering.price',
  'offering.price_note',
  'offering.schedule',
  'offering.duration_or_unit',
  'package.price',
  'package.period',
  'package.features_list',
  'stat.value',
  'stat.label',
  'stat.context',
  'claim.year_or_issuer',
  'business.founded_year'
])

/** Lower-case words of a text, markup and the template's `((tag))` markers taken out. */
export const wordsOf = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]*>/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** The words of a demo sample that are its own: no interface word, no word the customer used, at least three letters. */
export function demoWordsOf(sample, ownWords) {
  return wordsOf(sample).filter(
    (w) => /^\p{L}{3,}$/u.test(w) && !GENERIC_LABEL_WORDS.has(w) && !ownWords.has(w)
  )
}

/** Whether a written name stands in the customer's text, as whole words. */
function named(value, ownText) {
  const words = wordsOf(value)
  if (!words.length) return true
  const own = ` ${wordsOf(ownText).join(' ')} `
  return own.includes(` ${words.join(' ')} `)
}

/** The figures of a text that the customer's text does not hold. */
function newFigures(value, ownDigits) {
  return (String(value ?? '').match(/\d[\d.,]*/g) ?? [])
    .map((n) => n.replace(/\D+/g, ''))
    .filter((d) => d !== '' && !ownDigits.includes(d))
}

/** Whether a label fits its slot. */
const fitsSlot = (slot, text) =>
  typeof text === 'string' &&
  text.trim() !== '' &&
  (!Number.isInteger(slot.maxCharacters) || [...text].length <= slot.maxCharacters)

/**
 * The neutral label of a button or a call to action, in the site's language: "Contact" when the business can be reached,
 * else "Learn more"; null when none fits.
 */
function neutralLabel(slot, locale, business) {
  const contact = neutralFor({ role: 'contact.cta_label', locale, business })
  const text = contact.state === 'neutral' ? contact.text : neutralText('neutral.cta.learnMore', locale)
  return fitsSlot(slot, text) ? text : null
}

/**
 * The slot that holds the title of the page a menu entry opens, read from the map's page of that entry: an article's title
 * (`view=article&id=15`), a category's (`view=category&id=8`, a blog or list of it), the home page's own page title
 * (`view=featured`), or, for an alias entry (`index.php?Itemid=N`), whatever the entry it points to opens, else that entry's
 * own label. Null when the map does not say (a component view, an alias whose target lives in its parameters).
 * @param {string} entity - the menu entry
 * @param {Array<{entity?: string, link?: string}>} pages
 * @param {any[]} slots
 * @param {Set<string>} [seen] - the entries already followed (an alias loop ends)
 */
export function openedTitleSlot(entity, pages, slots, seen = new Set()) {
  if (seen.has(entity)) return null
  seen.add(entity)
  const link = String(pages.find((p) => p?.entity === entity)?.link ?? '')
  const idOf = (view) =>
    new RegExp(`[?&]view=${view}(?:&|$)`).test(link) ? (/[?&]id=(\d+)/.exec(link)?.[1] ?? null) : null
  const titleOf = (owner) =>
    slots.find((s) => s.entity === owner && (s.column === 'title' || s.role === 'offering.name')) ?? null
  const article = idOf('article')
  if (article) return titleOf(`article-${article}`)
  const category = idOf('category')
  if (category) return titleOf(`category-${category}`)
  if (/[?&]view=featured(?:&|$)/.test(link))
    return (
      slots.find(
        (s) => s.entity === entity && Array.isArray(s.jsonPath) && s.jsonPath.join('.') === 'page_title'
      ) ?? null
    )
  const alias = /^index\.php\?Itemid=(\d+)/.exec(link)?.[1]
  if (alias) {
    const target = `menuItem-${alias}`
    if (seen.has(target)) return null
    return openedTitleSlot(target, pages, slots, seen) ?? titleOf(target)
  }
  return null
}

/**
 * @param {object} input
 * @param {any[]} input.slots - the content map's slots a visitor reads (the caller leaves out sample kits and derived copies)
 * @param {Record<string, string>} input.written - what the writer wrote, by slot key
 * @param {string} input.ownText - every word the customer gave (the brief, the answers)
 * @param {{values?: Record<string, {value: string, evidence?: string}>, blanks?: Array<{key: string}>,
 *   fallbacks?: Record<string, {value: string}>, records?: any[]} | null} [input.honesty] - the site plan's (a brief build)
 * @param {string} [input.locale]
 * @param {{phone?: string, email?: string}} [input.business] - the contact facts a neutral call to action needs
 * @param {Array<{entity: string, link?: string}>} [input.pages] - the map's pages: the page a menu entry opens
 * @returns {{drop: string[], values: Record<string, string>, evidence: Record<string, string>,
 *   counts: {invented: number, labels: number, fallbacks: number, planned: number}}}
 */
export function honestWritten({
  slots,
  written,
  ownText,
  honesty = null,
  locale = 'en',
  business = {},
  pages = []
}) {
  const drop = new Set()
  const values = {}
  const evidence = {}
  const counts = { invented: 0, labels: 0, fallbacks: 0, planned: 0 }
  const ownWords = new Set(wordsOf(ownText))
  const ownDigits = String(ownText ?? '').replace(/\D+/g, '')
  const hiddenGroups = new Set(
    (honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  )
  const blanked = new Set((honesty?.blanks ?? []).map((b) => b.key))
  /** The menu labels in the demo's words, named once every page title is known. */
  const menus = []
  for (const slot of slots) {
    const key = slot.key
    const planned = honesty?.values?.[key]
    if (planned) {
      values[key] = planned.value
      if (planned.evidence) evidence[key] = planned.evidence
      counts.planned += 1
      continue
    }
    // A card the plan hides, or a fact it empties after the write: nothing is written into it.
    if (hiddenGroups.has(slot.group?.id) || blanked.has(key)) {
      if (key in written) drop.add(key)
      continue
    }
    const value = written[key]
    if (typeof value === 'string') {
      const invented =
        (NAME_ROLES.has(slot.role) && !named(value, ownText)) ||
        (FIGURE_ROLES.has(slot.role) && newFigures(value, ownDigits).length > 0)
      if (invented) {
        drop.add(key)
        counts.invented += 1
        continue
      }
    }
    if (!honesty) continue
    const echoed = typeof value !== 'string' || wordsOf(value).join(' ') === wordsOf(slot.sample).join(' ')
    const fallback = honesty.fallbacks?.[key]
    if (fallback && (echoed || wordsOf(value).length === 0 || /lorem ipsum/i.test(value))) {
      values[key] = fallback.value
      counts.fallbacks += 1
      continue
    }
    if (LABEL_ROLES.has(slot.role) && slot.type === 'text') {
      const demo = new Set(demoWordsOf(slot.sample, ownWords))
      const now = typeof value === 'string' && !drop.has(key) ? value : String(slot.sample ?? '')
      if (demo.size === 0 || !wordsOf(now).some((w) => demo.has(w))) continue
      if (slot.role === 'editorial.menu_label') menus.push(slot)
      else {
        const label = neutralLabel(slot, locale, business)
        if (label) {
          values[key] = label
          counts.labels += 1
        }
      }
    }
  }
  // A menu label in the demo's words takes the title of the page it opens, as that page's title will read; else "Learn more".
  for (const slot of menus) {
    const title = openedTitleSlot(slot.entity, pages, slots)
    const titled = title ? (values[title.key] ?? (drop.has(title.key) ? null : written[title.key])) : null
    const own =
      typeof titled === 'string' &&
      demoWordsOf(title.sample, ownWords).every((w) => !wordsOf(titled).includes(w))
    const label = own && fitsSlot(slot, titled) ? titled : neutralText('neutral.cta.learnMore', locale)
    if (fitsSlot(slot, label)) {
      values[slot.key] = label
      counts.labels += 1
    }
  }
  for (const key of Object.keys(values)) drop.delete(key)
  return { drop: [...drop], values, evidence, counts }
}
