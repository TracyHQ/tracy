/**
 * The site plan check of a brief build (spec TracyHQ/tracy#231, ticket #233): pure code, no model. It reads a site plan
 * against the template inventory (`template-inventory.js`) and the brief, and lists EVERY reason it refuses the plan, so
 * the author gets them all in one revision round.
 *
 * The site plan (`version: 'site-plan/1'`):
 *   pages:        [{id, decision: 'keep' | 'drop' | 'add', copies?, route?, purpose, lead, facts: string[],
 *                   items: string[], dependsOn: string[], seo?, reason?}] - an added page `copies` a template page
 *                   (`page:<entity>`) or record page (`record-page:<id>`) of the inventory;
 *   decisions:    [{element, decision: 'keep' | 'hide', reason?, count?, items?, picture?, icon?, action?}] - one per
 *                   inventory element that is not a page; `count` for card collections, `action: {kind, target}` for
 *                   buttons and links (kind: page, call, whatsapp, email, booking, map);
 *   glossary:     [{name, kind, description}] - every item named on more than one page, written once;
 *   writingOrder: page ids, a page after the pages it depends on;
 *   photos:       [{photo, decision: 'use' | 'skip', slots?: string[], reason?}] - one per brief photo
 *                   (`brief-photos.js`): used in named picture slots, or not used with a reason;
 *   outOfScope:   {template: [{element, reason}], brief: [{sourceId, reason}]};
 *   identity, contact, legal, forms, seo: read by the later stages, not by this check.
 *
 * An element needs no decision of its own when the plan already takes it off: its section is hidden, its section's
 * pages are all dropped, its card collection is hidden, or its card is past the collection's count. A section no page of
 * the template shows is not in the plan at all, nor is anything in it (the packing check reports it,
 * `content-map-lint-pages.js`).
 */
import { seeder } from '../../lib/seeder.js'

import { addedItemReasons, uncopiable } from './site-plan-check-added.js'
import { identityReasons } from './site-plan-check-identity.js'
import { photoReasons } from './site-plan-check-photos.js'
import { closestIds } from './site-plan-defaults-parts.js'
import { buttonReasons, factReasons, glossaryReasons, orderReasons } from './site-plan-check-rules.js'

/**
 * @typedef {{rule: 'undecided' | 'decided-twice' | 'unknown-element' | 'added-page-layout' | 'added-page-item' | 'over-capacity' |
 *   'unsourced-fact' | 'no-page-kept' | 'missing-glossary' | 'writing-order-cycle' | 'writing-order-missing' | 'writing-order-late' | 'button-no-action' |
 *   'photo-undecided' | 'photo-decided-twice' | 'unknown-photo' | 'photo-unusable-used' | 'logo-slot' | 'demo-post-kept',
 *   element?: string, message: string}} PlanReason
 */

/**
 * Check a site plan.
 * @param {any} plan - the site plan
 * @param {{inventory: {elements: any[]}, site: any, photos?: any[] | null}} input - the template inventory, the brief as
 *   the writers get it (the business fields, `statistics` and `factSheet`), and the brief photos (`brief-photos.js`); with
 *   no photos given, the plan's photo list is not checked
 * @returns {Promise<{ok: boolean, reasons: PlanReason[]}>}
 */
export async function checkSitePlan(plan, { inventory, site, photos = null }) {
  const facts = await seeder('fact-sources')
  /** @type {PlanReason[]} */
  const reasons = []
  const elements = new Map(inventory.elements.map((e) => [e.id, e]))
  const pages = Array.isArray(plan?.pages) ? plan.pages : []
  const decisions = Array.isArray(plan?.decisions) ? plan.decisions : []

  /** @type {Map<string, any>} */
  const decided = new Map()
  for (const entry of [...pages.map((p) => ({ ...p, element: p.id })), ...decisions]) {
    const id = String(entry?.element ?? '')
    const known = elements.get(id)
    if (!known && entry?.decision !== 'add')
      reasons.push({
        rule: 'unknown-element',
        element: id,
        message: `${id} is not an element of the template; the closest ids: ${closestIds(id, elements.keys()).join(', ')}`
      })
    else if (decided.has(id))
      reasons.push({ rule: 'decided-twice', element: id, message: `${id} has more than one decision` })
    else decided.set(id, entry)
  }

  for (const page of pages.filter((p) => p?.decision === 'add')) {
    const why = uncopiable(elements.get(String(page.copies ?? '')))
    if (why)
      reasons.push({
        rule: 'added-page-layout',
        element: page.id,
        message: `added page ${page.id} must copy an existing template page layout (a page or record page id); it names "${page.copies ?? ''}": ${why}`
      })
  }
  // An added page shows one brief item no other page of its layout shows: never more pages than the brief has items for.
  reasons.push(...addedItemReasons(plan, elements, site))

  const shownPages = new Set(pages.filter((p) => ['keep', 'add'].includes(p?.decision)).map((p) => p.id))
  // A site with no page has nothing to write: the plan is refused, never completed into an empty site.
  if (shownPages.size === 0)
    reasons.push({
      rule: 'no-page-kept',
      message: 'the plan keeps no page; keep or add at least one page (the home page at least)'
    })
  const off = takenOff(elements, decided)
  for (const element of inventory.elements)
    if (element.decide && !decided.has(element.id) && !off(element))
      reasons.push({
        rule: 'undecided',
        element: element.id,
        message: `${element.id} (${element.kind}) has no decision`
      })

  for (const [id, entry] of decided) {
    const element = elements.get(id)
    if (element?.kind !== 'cards' || entry.decision === 'hide' || off(element)) continue
    const capacity = element.limits?.capacity ?? 0
    if (Number(entry.count) > capacity)
      reasons.push({
        rule: 'over-capacity',
        element: id,
        message: `${id} holds at most ${capacity} cards; the plan places ${entry.count}`
      })
  }

  reasons.push(...factReasons(plan, site, facts))
  reasons.push(...glossaryReasons(plan, elements, shownPages))
  reasons.push(...orderReasons(plan, shownPages))
  reasons.push(...buttonReasons({ elements, decided, off, shownPages, site, facts }))
  // A logo slot takes the logo; a demo post the build never writes is never kept (`site-plan-check-identity.js`).
  reasons.push(...identityReasons({ plan, elements, decided, off }))
  if (Array.isArray(photos)) reasons.push(...photoReasons(plan, photos, elements))
  return { ok: reasons.length === 0, reasons }
}

/**
 * Whether the plan already takes an element off without a decision of its own.
 * @param {Map<string, any>} elements @param {Map<string, any>} decided
 */
export function takenOff(elements, decided) {
  const dropped = (/** @type {string} */ page) => decided.get(page)?.decision === 'drop'
  // A section on no page is not in the plan at all; one whose pages are all dropped, or that is hidden, is taken off.
  const sectionOff = (/** @type {any} */ section) =>
    !!section &&
    (decided.get(section.id)?.decision === 'hide' || !section.pages?.length || section.pages.every(dropped))
  return (/** @type {any} */ element) => {
    if (element.kind === 'section') return sectionOff(element)
    if (element.section && sectionOff(elements.get(element.section))) return true
    if (element.card) {
      const cards = decided.get(element.card.collection)
      if (cards?.decision === 'hide') return true
      if (cards && Number.isInteger(cards.count) && element.card.index >= cards.count) return true
    }
    return false
  }
}
