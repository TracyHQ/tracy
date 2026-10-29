// The text a brief build's writer left in the demo's words, and what stands in for it (spec TracyHQ/tracy#189: leftover
// kinds C03 and C09). After the writer, the guard and the rename of the demo company, a text slot the site plan gives the copy
// writer (`text-by-copy`) can still hold the template's words: the writer pended it, never answered it, wrote a line the site
// would refuse or a guard dropped, or the demo company's name was only swapped inside the demo's sentence ("We opened <the
// owner's name> in 2008"). Measured 29/10/2026 on the local stand (a Joomla T4 template, a coaching club brief): class card
// intros in lorem ipsum, four step descriptions of the demo's sport, and offering pages whose every paragraph was the demo's.
//
// 🔒 NEVER THE DEMO'S WORDS, NEVER AN INVENTION. Each such slot takes, in this order: the site plan's own fallback (a quote of
// the brief for that card), the neutral words of its role in the site's language (`neutralFor`: "Service", "Step",
// "Contact"), the business's own description for a free paragraph (once per record), else nothing: the slot is emptied.
// Rules by slot role and by the words of the demo's sample, never by template, trade or business. Pure and deterministic.
import { neutralFor } from './neutral-copy.mjs'
import { demoWordsOf, wordsOf } from './honest-written.mjs'
import { offeringOfSlot, offeringWords, otherOfferingsIn } from './offering-cross-talk.mjs'
import { hidePlaceOf } from './site-plan-honesty.mjs'
import { isProcessPlaceholder } from './process-placeholders.mjs'

/** Free paragraphs: a business's own description reads right in any of them. */
const PARAGRAPH_ROLES = new Set(['editorial.paragraph', 'business.summary', 'business.long_description'])
/** A line the writer echoed is trusted when it is this short (a label, "Basic"): the model judged it fits. */
const ECHO_TRUSTED_WORDS = 3
/** A changed line that holds only the demo's words and the owner's is the demo's once it has this many of the demo's words. */
const RENAMED_MIN_WORDS = 3
const LOREM = /\blorem ipsum\b|\bdolor sit amet\b/i
/**
 * Titles of a repeated card, tab or step: an echo of the demo's ("Maintenance" as a coaching club's fourth tab) is never
 * trusted as a fitting label, however short (measured 29/10/2026 on a local brief build). A step title is one wherever it
 * sits; the others only inside a repeated card (a slot with a group), never a free heading of a section.
 */
const STEP_TITLE_ROLES = new Set(['step.title'])
const CARD_TITLE_ROLES = new Set([
  'step.title',
  'faq.question',
  'event.title',
  'offering.name',
  'package.name',
  'claim.heading',
  'editorial.heading'
])
/** Cards that carry the business's own facts or its call to action: their titles are the plan's, not the demo's. */
const OWN_CARD_KINDS = new Set(['business', 'contact', 'cta'])
/**
 * Whether a slot is the title of a repeated card whose echo of the demo's words is never trusted (`CARD_TITLE_ROLES`). An
 * offering's name the site plan gives (`honesty.cardNames`) is the plan's, not the writer's.
 * @param {{role?: string, entity?: string, group?: {id?: string, kind?: string}}} slot
 * @param {Record<string, string>} [cardNames]
 */
export function isCardTitle(slot, cardNames = {}) {
  if (STEP_TITLE_ROLES.has(slot?.role)) return true
  if (!CARD_TITLE_ROLES.has(slot?.role) || !slot.group?.id || OWN_CARD_KINDS.has(slot.group.kind))
    return false
  return !(slot.role === 'offering.name' && offeringOfSlot(slot, cardNames))
}

/** A site token the page fills in itself (`{site.name}`): such a line is never the demo's words. */
const TOKEN = /\{[a-z][\w.-]*\}/i

const sameWords = (a, b) => wordsOf(a).join(' ') === wordsOf(b).join(' ')

/** Whether a line fits its slot. */
const fits = (slot, text) =>
  typeof text === 'string' &&
  text.trim() !== '' &&
  (!Number.isInteger(slot.maxCharacters) || [...text].length <= slot.maxCharacters)

/**
 * The records a visitor reads on the template's pages: each page's own record, the modules it carries, the article a menu
 * entry opens (`view=article&id=N`), and the offering articles (ADR 0040 `offering.*` lines) of a category a page lists
 * (`view=category&id=N`), as the Joomla planner's page surface reads them. Null when the map has no pages (every record is
 * then read).
 * @param {Array<{entity?: string, link?: string, assignedModules?: Array<{entity?: string}>}>} pages
 * @param {{entities?: any[], slots?: any[]}} [map] - the map's entities (an article's `identityReferences.catid`) and slots
 */
export function pageRecords(pages, { entities = [], slots = [] } = {}) {
  if (!Array.isArray(pages) || pages.length === 0) return null
  const out = new Set()
  const listed = new Set()
  for (const page of pages) {
    if (page?.entity) out.add(page.entity)
    for (const module of page?.assignedModules ?? []) if (module?.entity) out.add(module.entity)
    const link = String(page?.link ?? '')
    const id = /[?&]view=article(?:&|$)/.test(link) ? /[?&]id=(\d+)/.exec(link)?.[1] : null
    if (id) out.add(`article-${id}`)
    // A Contact page shows its contact record (`option=com_contact&view=contact&id=N`).
    const contact = /[?&]view=contact(?:&|$)/.test(link) ? /[?&]id=(\d+)/.exec(link)?.[1] : null
    if (contact) out.add(`contact-${contact}`)
    const category = /[?&]view=category(?:&|$)/.test(link) ? /[?&]id=(\d+)/.exec(link)?.[1] : null
    if (category) listed.add(`category-${category}`)
  }
  const offerings = new Set(
    slots.filter((s) => String(s?.role ?? '').startsWith('offering.')).map((s) => s.entity)
  )
  for (const entity of entities)
    if (
      entity?.kind === 'article' &&
      offerings.has(entity.key) &&
      listed.has(entity.identityReferences?.catid)
    )
      out.add(entity.key)
  // A template language string belongs to no page and shows on every page that prints it ("Book your trial class now").
  for (const entity of entities) if (entity?.kind === 'languageString') out.add(entity.key)
  return out
}

/**
 * Whether a slot still shows the demo's words once `value` is written (undefined: nothing is written, the sample stays).
 * @param {{key: string, sample?: string}} slot
 * @param {string | undefined} value
 * @param {Set<string>} ownWords - every word the owner gave
 * @param {Set<string>} held - the keys the writer did not answer (pended, refused, unreadable, dropped by a guard)
 * @param {{cardNames?: Record<string, string>}} [options] - the site plan's offering names (`isCardTitle`)
 */
export function isDemoLeft(slot, value, ownWords, held, { cardNames = {} } = {}) {
  const sample = String(slot.sample ?? '')
  if (TOKEN.test(sample)) return false
  const demo = demoWordsOf(sample, ownWords)
  if (demo.length === 0) return false
  if (typeof value === 'string' && LOREM.test(value)) return true
  if (typeof value === 'string' && !sameWords(value, sample)) {
    // A new line, unless it is the demo's sentence with only the owner's words put in (a renamed company).
    const fresh = wordsOf(value).filter((w) => !ownWords.has(w))
    const sampleWords = new Set(wordsOf(sample))
    return fresh.length >= RENAMED_MIN_WORDS && fresh.every((w) => sampleWords.has(w))
  }
  if (LOREM.test(sample) || held.has(slot.key)) return true
  if (isCardTitle(slot, cardNames)) return true
  // Echoed by the writer: a short label it judged fitting stays, a sentence of the demo's does not.
  return demo.length > ECHO_TRUSTED_WORDS
}

/**
 * @param {object} input
 * @param {any[]} input.slots - the content map's slots a visitor reads, with their box limits (`maxCharacters`)
 * @param {Record<string, string>} input.written - the words about to be written, by slot key
 * @param {Iterable<string>} input.asked - the keys the site plan gives the copy writer (`text-by-copy`)
 * @param {Iterable<string>} [input.held] - the keys the writer did not answer
 * @param {string} input.ownText - every word the owner gave
 * @param {{values?: Record<string, any>, blanks?: Array<{key: string}>, fallbacks?: Record<string, {value: string}>,
 *   records?: any[]} | null} [input.honesty] - the site plan's
 * @param {string} [input.locale]
 * @param {{phone?: string, email?: string, contactPage?: string}} [input.business]
 * @param {string} [input.description] - the business's own description (the site plan's brand), or empty
 * @param {any[]} [input.pages] - the map's pages: only the records they show are judged
 * @param {any[]} [input.entities] - the map's entities: the offering articles a category page lists
 * @returns {{values: Record<string, string>, blanks: string[], hides: any[], counts: {fallbacks: number, neutral: number,
 *   described: number, blanked: number, hidden: number}}}
 *   `hides`: the cards taken off whole because their title is the demo's (`{group, ...place}` as the site plan's `hide`)
 */
export function leftDemoText({
  slots,
  written,
  asked,
  held = [],
  ownText,
  honesty = null,
  locale = 'en',
  business = {},
  description = '',
  pages = [],
  entities = []
}) {
  const wanted = new Set(asked)
  const unanswered = new Set(held)
  const ownWords = new Set(wordsOf(ownText))
  const shown = pageRecords(pages, { entities, slots })
  const blanked = new Set((honesty?.blanks ?? []).map((b) => b.key))
  const hiddenGroups = new Set(
    (honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  )
  const values = {}
  const blanks = []
  const counts = { fallbacks: 0, neutral: 0, described: 0, blanked: 0, hidden: 0 }
  /** @type {Map<string, any>} the cards whose title is the demo's, taken off whole: by group id, where it goes */
  const gone = new Map()
  const map = { slots, entities }
  const describedIn = new Set()
  const about = String(description ?? '').trim()
  // 🔒 A CARD IS ABOUT ITS OWN OFFERING (spec #189, `offering-cross-talk.mjs`): a line of an offering's card or page that names
  // another of the business's offerings is not kept, and nothing that names one stands in for it (the business's description
  // names them all).
  const cardNames = honesty?.cardNames ?? {}
  const offerings = offeringWords(Object.values(cardNames))
  const crosses = (slot, text) => {
    const offering = offeringOfSlot(slot, cardNames)
    return (
      offerings.size > 1 &&
      Boolean(offering) &&
      typeof text === 'string' &&
      otherOfferingsIn(text, offering, offerings).length > 0
    )
  }
  // Title and body form one editorial step. A missing, neutral or still-demo half removes the entire item.
  const steps = new Map()
  for (const slot of slots) {
    if (!/^step\.(title|description)$/.test(slot.role ?? '') || !slot.group?.id) continue
    if (!wanted.has(slot.key) || (shown && !shown.has(slot.entity))) continue
    if (!steps.has(slot.group.id)) steps.set(slot.group.id, [])
    steps.get(slot.group.id).push(slot)
  }
  for (const [id, fields] of steps) {
    const useful = (role) =>
      fields.some((slot) => {
        if (slot.role !== role) return false
        const value = written[slot.key] ?? honesty?.values?.[slot.key]?.value
        return (
          fits(slot, value) &&
          !isProcessPlaceholder(value) &&
          !isDemoLeft(slot, value, ownWords, unanswered, { cardNames })
        )
      })
    if (useful('step.title') && useful('step.description')) continue
    gone.set(id, hidePlaceOf(map, id))
  }
  for (const slot of slots) {
    const key = slot.key
    if (!wanted.has(key) || slot.type !== 'text') continue
    if (shown && !shown.has(slot.entity)) continue
    if (gone.has(slot.group?.id)) continue
    // What the site plan decides is the plan's: a value, an emptied fact, a hidden card.
    if (honesty?.values?.[key] || blanked.has(key) || hiddenGroups.has(slot.group?.id)) continue
    if (!crosses(slot, written[key]) && !isDemoLeft(slot, written[key], ownWords, unanswered, { cardNames }))
      continue
    const fallback = honesty?.fallbacks?.[key]?.value
    if (fits(slot, fallback) && !crosses(slot, fallback)) {
      values[key] = fallback
      counts.fallbacks += 1
      continue
    }
    // 🔒 A CARD WHOSE TITLE IS THE DEMO'S IS TAKEN OFF WHOLE when it is a card of a section (an item of a module's JSON list,
    // a module of its own): a coaching club's fourth tab never reads "Maintenance", nor a numbered "Step 4" over the demo's
    // text. A card that is a page of its own (an article, a menu entry) keeps its neutral title: taking it off would break
    // the links that open it, and a module is taken off only when the card is all it holds.
    if (isCardTitle(slot, cardNames) && slot.group?.id) {
      const place = gone.get(slot.group.id) ?? hidePlaceOf(map, slot.group.id)
      const onlyCard = slots.every((s) => s.entity !== place.entity || s.group?.id === slot.group.id)
      if (place.how === 'item' || (place.how === 'entity' && place.kind === 'module' && onlyCard)) {
        gone.set(slot.group.id, place)
        continue
      }
    }
    const neutral = neutralFor({
      role: slot.role,
      kind: slot.group?.kind,
      index: slot.group?.item,
      locale,
      business
    })
    if (!STEP_TITLE_ROLES.has(slot.role) && neutral.state === 'neutral' && fits(slot, neutral.text)) {
      values[key] = neutral.text
      counts.neutral += 1
      continue
    }
    if (
      PARAGRAPH_ROLES.has(slot.role) &&
      about &&
      !describedIn.has(slot.entity) &&
      fits(slot, about) &&
      !crosses(slot, about)
    ) {
      values[key] = about
      describedIn.add(slot.entity)
      counts.described += 1
      continue
    }
    blanks.push(key)
    counts.blanked += 1
  }
  const hides = hidesOfGone(gone, slots, entities)
  // A card taken off whole keeps none of the words chosen for its other lines.
  const off = new Set(slots.filter((s) => gone.has(s.group?.id)).map((s) => s.key))
  for (const key of off) delete values[key]
  // Slots without a native item-removal door still lose both halves; the served-frame check hides their empty frame.
  for (const slot of slots)
    if (off.has(slot.key) && gone.get(slot.group.id)?.how === 'none') blanks.push(slot.key)
  counts.hidden = gone.size
  return {
    values,
    blanks: blanks.filter(
      (key) => !off.has(key) || gone.get(slots.find((s) => s.key === key)?.group?.id)?.how === 'none'
    ),
    hides,
    counts
  }
}

/**
 * The site plan's `hide` entries for the cards taken off whole: an item of a list, or the list's whole entity once every card
 * of it goes (as `hidesOf` of the site plan: a section none of whose cards stays is unpublished).
 * @param {Map<string, any>} gone - by group id, where the card goes (`hidePlaceOf`)
 * @param {any[]} slots
 * @param {any[]} entities
 */
function hidesOfGone(gone, slots, entities) {
  const cardsOf = new Map()
  for (const s of slots) {
    if (!s.group?.id) continue
    if (!cardsOf.has(s.entity)) cardsOf.set(s.entity, new Set())
    cardsOf.get(s.entity).add(s.group.id)
  }
  const out = []
  const whole = new Set()
  for (const [group, place] of gone) {
    // 🔒 A CARD NO DOOR TAKES OFF IS EMPTIED, NEVER HANDED ON AS A HIDE (#189, round 10): its lines are blanked by the caller
    // and the served-frame check hides the empty frame. Measured 30/10/2026: an outline part in an article's parameters
    // (keyed by name, not a JSON list) went on as a `none` hide, the records write could not make it, and the build stopped.
    if (place.how === 'none') continue
    // A journey's business picture is decoration, not a useful step that keeps an otherwise empty section alive.
    const entitySlots = slots.filter((s) => s.entity === place.entity && s.group?.id)
    const onlyJourney =
      entitySlots.some((s) => s.group.id === group && s.group.kind === 'step') &&
      entitySlots.every((s) => ['step', 'business'].includes(s.group.kind))
    const all =
      place.how === 'item' &&
      [...(cardsOf.get(place.entity) ?? [])].every(
        (id) =>
          gone.has(id) ||
          (onlyJourney && entitySlots.some((s) => s.group.id === id && s.group.kind === 'business'))
      )
    if (!all) {
      out.push({ ...place, group, reason: 'demo-title-left' })
      continue
    }
    if (whole.has(place.entity)) continue
    whole.add(place.entity)
    const kind = entities.find((e) => e?.key === place.entity)?.kind ?? String(place.entity).split('-')[0]
    out.push({ how: 'entity', entity: place.entity, kind, group, reason: 'demo-title-left' })
  }
  return out
}
