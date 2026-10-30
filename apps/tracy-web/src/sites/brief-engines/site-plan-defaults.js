/**
 * 🔒 THE AUTHOR DECIDES ONLY THE REAL CHOICES (ticket TracyHQ/tracy#234, plan size): code fills every decision that follows
 * from the template and the brief, and the site plan author (`site-plan-author.js`) only overrides. The author is sent
 * (`planView`) and answers: pages (keep, drop, add), the sections it hides, card counts and items, facts, leads and items
 * per page, the glossary, the writing order, the brief photos and the picture slots they fill. Code then completes the
 * answer (`completePlan`) and the plan check (`site-plan-check.js`) reads the merged plan, exhaustively:
 *   - an element on no page of the template is not in the plan at all (the packing check reports it);
 *   - a section is kept; what is inside a section follows it, and a card row of the template's own parts (not brief
 *     records) keeps the cards the template shows; a photo the brief's labels refuse is skipped with their reason (the check takes off what a hidden section holds);
 *   - a picture shows the brief photo the plan places in it, its template picture when the template keeps it, else a
 *     drawing of the record, page and copy beside it; an icon follows its item's meaning;
 *   - a button or link takes its mapped action when the brief has it: the page its demo link opens when that page is
 *     kept, a call, email or map for a contact action, the item of its card, or the page itself for a control;
 *     with no real action it is hidden, with the reason;
 *   - a menu lists its kept pages; a contact block shows when the brief has a phone, email or address; a CTA band shows
 *     when one of its buttons has a real action; a record page family is kept;
 *   - a page the author does not list is dropped; a dependency on a page that is not written is moved; an element named
 *     twice with the same decision is decided once;
 *   - the writing order is put in dependency order, the author's order breaking ties; the template out-of-scope list
 *     names every dropped page and hidden element with its reason.
 *   - a form keeps where it sends when the brief gives it a real destination, else it is hidden; the contact details,
 *     identity and privacy page follow the brief (`site-plan-defaults-site.js`, ticket #240).
 * Every filled decision carries `by: 'default'`. CMS-neutral, except the one demo link form read below.
 */

import { takenOff } from './site-plan-check.js'
import { dedupe, mappedAction, orderedPages, repairIds } from './site-plan-defaults-parts.js'
import { formDecisions, siteParts } from './site-plan-defaults-site.js'

/** The element kinds the author is sent: everything else is filled by code. */
export const AUTHOR_KINDS = new Set(['page', 'section', 'cards', 'picture', 'record-page'])
/**
 * The card rows that show records of the brief (the group kinds of the content-map vocabulary, ADR 0040): their count and
 * items are the author's choice. Any other row (statistic tiles, call-to-action cards, social links, steps, galleries)
 * is the template's own part and keeps the cards the template shows, unless the author decides it.
 */
export const RECORD_CARD_KINDS = new Set([
  'person',
  'quote',
  'service',
  'package',
  'offering',
  'event',
  'product'
])
/** Whether a card row is the author's choice (a row of brief records, or one whose kind the map does not say). */
const recordRow = (/** @type {any} */ e) => !e.groupKind || RECORD_CARD_KINDS.has(e.groupKind)

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')

/**
 * Whether an element is on a page of the template: a section on at least one page, an element in such a section, or a
 * site-wide element with no section (a menu, a record page family).
 * @param {Map<string, any>} elements
 */
export function onTemplatePage(elements) {
  return (/** @type {any} */ e) => {
    if (e.kind === 'section') return list(e.pages).length > 0
    if (!e.section) return true
    return list(elements.get(e.section)?.pages).length > 0
  }
}

/**
 * The author's answer completed by code: every decision that follows from the template and the brief, under the author's
 * own; the writing order in dependency order.
 * @param {any} authored - the author's plan
 * @param {{inventory: {elements: any[]}, site: any, photos?: any[] | null}} input - with the brief photos
 *   (`brief-photos.js`)
 */
export function completePlan(authored, { inventory, site, photos = [] }) {
  const elements = new Map(inventory.elements.map((e) => [e.id, e]))
  // A near-miss id (other case, a missing or other kind prefix) is put right first, and listed on the plan (`repairIds`).
  const { answer, repaired } = repairIds(authored, {
    photoIds: list(photos).map((p) => String(p?.id)),
    pictureIds: inventory.elements.filter((e) => e.kind === 'picture').map((e) => e.id),
    elementIds: [...elements.keys()]
  })
  const onPage = onTemplatePage(elements)
  const templatePages = inventory.elements.filter((e) => e.kind === 'page')
  // An entry of "pages" that is another element (a record page family) is a decision of that element.
  const listed = list(answer?.pages).filter((p) => p && typeof p === 'object')
  const isOther = (/** @type {any} */ p) =>
    elements.has(String(p.id)) && elements.get(String(p.id)).kind !== 'page'
  const moved = listed.filter(isOther).map(({ id, decision, reason }) => ({ element: id, decision, reason }))
  const own = listed.filter((p) => !isOther(p))
  const shownPages = new Set(
    own.filter((p) => ['keep', 'add'].includes(p?.decision)).map((p) => String(p.id))
  )
  // A page the author does not list is dropped. A dependency is order only: one on a page that is not written is moved.
  const named = new Set(own.map((p) => String(p.id)))
  const pages = [
    ...own.map((p) =>
      shownPages.has(String(p.id))
        ? {
            ...p,
            dependsOn: list(p.dependsOn)
              .map(String)
              .filter((d) => shownPages.has(d))
          }
        : p
    ),
    ...templatePages
      .filter((e) => !named.has(e.id))
      .map((e) => ({ id: e.id, decision: 'drop', reason: 'not part of this site', by: 'default' }))
  ]
  const shown = pages.filter((p) => shownPages.has(String(p.id)))
  const contactPage =
    [...shownPages].find((id) => /contact/i.test(String(elements.get(id)?.route ?? ''))) ?? null
  const decisions = dedupe([...list(answer?.decisions), ...moved].filter((d) => d && typeof d === 'object'))
  const decided = new Map(decisions.map((d) => [String(d.element), d]))
  // What the author's own decisions already take off (a hidden section, dropped pages, a hidden card row) gets nothing.
  const off = takenOff(elements, new Map([...pages.map((p) => [String(p.id), p]), ...decided]))
  const photoOf = new Map()
  for (const entry of list(answer?.photos))
    if (entry?.decision === 'use')
      for (const slot of list(entry.slots)) photoOf.set(String(slot), entry.photo)
  const ctx = { site, shownPages, pages: templatePages, contactPage }
  const filled = []
  const fill = (/** @type {any} */ d) => filled.push({ ...d, by: 'default' })
  const hasReach = !!(text(site?.phone) || text(site?.email) || text(site?.address))
  for (const e of inventory.elements) {
    if (!e.decide || e.kind === 'page' || decided.has(e.id) || !onPage(e) || off(e)) continue
    if (e.kind === 'cards') {
      if (!recordRow(e))
        fill({
          element: e.id,
          decision: 'keep',
          count: Math.min(e.limits?.shown ?? e.limits?.capacity ?? 0, e.limits?.capacity ?? 0)
        })
    } else if (e.kind === 'section' || e.kind === 'record-page') fill({ element: e.id, decision: 'keep' })
    else if (e.kind === 'picture') {
      const photo = photoOf.get(e.id)
      fill({
        element: e.id,
        decision: 'keep',
        picture: photo
          ? { photo }
          : e.limits?.keep
            ? { template: true }
            : { draw: 'the record, page and copy beside this frame' }
      })
    } else if (e.kind === 'icon') fill({ element: e.id, decision: 'keep', icon: 'item-meaning' })
    else if (e.kind === 'button' || e.kind === 'link') {
      const action = mappedAction(e, ctx)
      fill(
        action
          ? { element: e.id, decision: 'keep', action }
          : { element: e.id, decision: 'hide', reason: 'no real action for this business' }
      )
    } else if (e.kind === 'menu' || e.kind === 'footer-column')
      fill({
        element: e.id,
        decision: 'keep',
        ...(e.kind === 'menu' ? { items: list(e.items).filter((p) => shownPages.has(p)) } : {})
      })
    else if (e.kind === 'contact-block')
      fill(
        hasReach
          ? { element: e.id, decision: 'keep' }
          : { element: e.id, decision: 'hide', reason: 'the brief gives no phone, email or address' }
      )
  }
  // A CTA band shows when one of its buttons has a real action (the author's or the mapped one).
  const all = new Map([...filled, ...decisions].map((d) => [String(d.element), d]))
  for (const e of inventory.elements) {
    if (e.kind !== 'cta-band' || decided.has(e.id) || !onPage(e) || off(e)) continue
    const live = list(e.buttons).some((b) => all.get(b)?.decision === 'keep' && all.get(b)?.action)
    fill(
      live
        ? { element: e.id, decision: 'keep' }
        : { element: e.id, decision: 'hide', reason: 'its button has no real action for this business' }
    )
  }
  // A form keeps where it sends, else it is hidden with the reason (`site-plan-defaults-site.js`, ticket #240).
  for (const d of formDecisions({ elements: inventory.elements, decided, onPage, off, site })) fill(d)
  // A photo the brief's own labels refuse is skipped by code, with their reason; the author decides the others.
  const photoDecided = new Set(list(answer?.photos).map((p) => String(p?.photo ?? '')))
  const skipped = list(photos)
    .filter((p) => p?.verdict === 'reject' && !photoDecided.has(p.id))
    .map((p) => ({
      photo: p.id,
      decision: 'skip',
      reason: `its labels refuse it: ${list(p.rejectedFor).join(', ')}`,
      by: 'default'
    }))
  // The template out-of-scope list is read from the plan: every dropped page and every hidden element, with its reason.
  const outOfTemplate = list(answer?.outOfScope?.template).filter((o) => o && typeof o === 'object')
  const listedOut = new Set(outOfTemplate.map((o) => String(o.element)))
  for (const d of [
    ...pages.filter((p) => p.decision === 'drop').map((p) => ({ element: p.id, reason: p.reason })),
    ...[...decisions, ...filled].filter((d) => d.decision === 'hide')
  ])
    if (!listedOut.has(String(d.element)))
      outOfTemplate.push({ element: d.element, reason: text(d.reason) || 'not part of this site' })
  return {
    ...answer,
    pages,
    decisions: [...decisions, ...filled],
    photos: [...list(answer?.photos), ...skipped],
    outOfScope: {
      ...(answer?.outOfScope ?? {}),
      template: outOfTemplate,
      brief: list(answer?.outOfScope?.brief)
    },
    writingOrder: orderedPages(shown, list(answer?.writingOrder).map(String)),
    // The contact details, identity and legal pages the later stages read (`site-plan-fill.js`, ticket #240).
    ...siteParts(answer, site),
    ...(repaired.length ? { idRepairs: repaired } : {})
  }
}

/**
 * The template as the author reads it: only the elements it decides, on a page of the template.
 * @param {{elements: any[]}} inventory
 */
export function authorElements(inventory) {
  const elements = new Map((inventory?.elements ?? []).map((e) => [e.id, e]))
  const onPage = onTemplatePage(elements)
  return (inventory?.elements ?? []).filter(
    (e) => e.decide && AUTHOR_KINDS.has(e.kind) && onPage(e) && (e.kind !== 'cards' || recordRow(e))
  )
}
