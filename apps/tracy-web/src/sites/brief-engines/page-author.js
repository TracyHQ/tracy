/**
 * 🔒 ONE AUTHOR WRITES THE SITE PAGE BY PAGE, IN THE PLAN'S WRITING ORDER (spec TracyHQ/tracy#231, ticket #235). When the site
 * plan author's plan was accepted (`site-plan-author.js`), the copy of the pages is written by that author, one page at a
 * time in the plan's writing order (a page that others summarise first), each call carrying the rulebook, this page's
 * plan (purpose, lead, facts, items, the sections the plan hid on it), the glossary, the page's own slots with their
 * limits and the compact text of the pages already written (`page-author.mjs` of the seeder). The engine hands in its
 * page writer (`write`); each page runs it alone, so its send-backs stay one concurrent round inside the budget, and the
 * next page reads what this one wrote.
 *   - a slot is written with the first page of the writing order it shows on; slots on no page of the plan (a band shown
 *     on every page, a page the plan dropped) are written last, as the site's shared parts;
 *   - a section the plan hid gets no call: its slots are listed apart, for the engine to take the section off;
 *   - a slot shown only on pages the plan dropped gets no call either (`droppedKeys`): the page is not on the site;
 *   - every page's time, calls and tokens are recorded (`pages`).
 * Without an accepted plan nothing here runs and the current writers write the site. CMS-neutral: the engine passes its
 * slots, the pages each entity shows on, and its writer.
 */
import { seeder } from '../../lib/seeder.js'
import { RULEBOOK } from './site-plan-author.js'

/** The pseudo page of the parts shown on several pages, or on a page the plan does not write. */
export const SHARED_PAGE = 'shared'

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const entityOf = (/** @type {string} */ id) => String(id).replace(/^[a-z-]+:/, '')

/**
 * What the page writer needs of an accepted site plan run, or null when there is none.
 * 🔒 RECORD PAGES ARE WRITTEN BEFORE THE PAGES THAT SUMMARISE THEM (ticket #237): a record page the plan keeps
 * (`record-page:<id>`, its entities from the content map's `recordPages`) is a page of the writing order, and one the
 * order does not place comes before every other page, since lists and the home page summarise it. Its records are bound
 * to the plan's items in order (`recordItems`): record N is item N, so each offering's own page is written from its
 * glossary entry.
 * 🔒 AN ADDED PAGE IS WRITTEN LIKE ANY OTHER PAGE (ticket #238): a page the plan adds copies a template layout, so its
 * slots are those of the entity it copies (`source`: the first record of a record page family, or the article a page opens,
 * `bodyOf`), written for its one item; one the order does not place comes right after the record pages, before the pages
 * that list it. Its words are kept apart (`added` of `writePagesInOrder`): the template's own record keeps its own.
 * @param {any} run - the site plan run (`writeSitePlan`)
 * @param {{recordPages?: Array<{id: string, entities?: string[]}>, bodyOf?: (pageId: string) => string | null}} [template]
 *   - the content map's record pages, and the entity a template page opens as its body (`article-<id>`), or null
 * @returns {{order: Array<{id: string, entity: string, page: any, entities?: string[],
 *   added?: {copies: string, source: string, item: string}}>, hidden: Set<string>,
 *   dropped: Set<string>, cardItems: Record<string, string[]>, recordItems: Record<string, string>, glossary: any[]} | null}
 */
export function pageAuthorPlan(run, { recordPages = [], bodyOf = () => null } = {}) {
  const plan = run?.status === 'accepted' ? run.plan : null
  if (!plan) return null
  const records = new Map(
    list(recordPages).map((r) => [`record-page:${r?.id}`, list(r?.entities).map(String)])
  )
  const decisionOf = new Map(list(plan.decisions).map((d) => [String(d?.element), d]))
  const pages = new Map(
    list(plan.pages)
      .filter(
        (p) =>
          p?.decision === 'keep' &&
          (String(p.id).startsWith('page:') ||
            (records.has(String(p.id)) && decisionOf.get(String(p.id))?.decision !== 'hide'))
      )
      .map((p) => [String(p.id), p])
  )
  // A record page the plan keeps only by a decision (no page entry) is written too.
  for (const [id] of records)
    if (!pages.has(id) && decisionOf.get(id)?.decision === 'keep') pages.set(id, { id, decision: 'keep' })
  /** @type {Map<string, {copies: string, source: string, item: string}>} the pages the plan adds, by id */
  const added = new Map()
  for (const p of list(plan.pages).filter((x) => x?.decision === 'add')) {
    const copies = String(p.copies ?? '')
    const source = records.has(copies) ? records.get(copies)?.[0] : bodyOf(copies)
    const item = String(list(p.items)[0] ?? '')
    if (!source || !item) continue
    added.set(String(p.id), { copies, source, item })
    pages.set(String(p.id), p)
  }
  const isRecord = (/** @type {string} */ id) => records.has(id)
  const named = list(plan.writingOrder).map(String)
  const ordered = [
    ...[...pages.keys()].filter((id) => isRecord(id) && !named.includes(id)),
    ...[...added.keys()].filter((id) => !named.includes(id)),
    ...named,
    ...pages.keys()
  ].filter((id, i, all) => pages.has(id) && all.indexOf(id) === i)
  const order = ordered.map((id) => {
    const { decision: _, by: __, dependsOn: ___, seo: ____, ...page } = pages.get(id)
    if (added.has(id)) return { id, entity: id, page, added: added.get(id) }
    return isRecord(id)
      ? {
          id,
          entity: id,
          page: { purpose: 'the own page of each record (offering) the site lists', ...page },
          entities: records.get(id)
        }
      : { id, entity: entityOf(id), page }
  })
  /** @type {Record<string, string>} the item each record page shows, by its entity */
  const recordItems = {}
  for (const step of order.filter((s) => s.entities)) {
    const items = [...list(decisionOf.get(step.id)?.items), ...list(pages.get(step.id)?.items)].map(String)
    const names = items.filter((n, i) => items.indexOf(n) === i)
    step.entities?.forEach((entity, i) => {
      if (names[i]) recordItems[entity] = names[i]
    })
  }
  // A plan that keeps no page has nothing to write page by page: the current writers write the site.
  if (order.length === 0) return null
  const hidden = new Set(
    list(plan.decisions)
      .filter((d) => d?.decision === 'hide' && String(d.element).startsWith('section:'))
      .map((d) => entityOf(d.element))
  )
  // The entities of the pages the plan drops: a slot shown only on them is written by nobody (a later stage takes it off).
  const dropped = new Set(
    list(plan.pages)
      .filter((p) => p?.decision === 'drop' && String(p.id).startsWith('page:'))
      .map((p) => entityOf(p.id))
  )
  // The names the plan gives the cards of a collection, in order, by the collection's id (`module-1.item`): card N is item N.
  const cardItems = Object.fromEntries(
    list(plan.decisions)
      .filter(
        (d) =>
          d?.decision === 'keep' && /^cards:[^.]+\.[^.]+$/.test(String(d.element)) && list(d.items).length
      )
      .map((d) => [String(d.element).replace(/^cards:/, ''), list(d.items).map(String)])
  )
  return { order, hidden, dropped, cardItems, recordItems, glossary: list(plan.glossary) }
}

/** Two plans of the page writer as one. */
function joinPlans(/** @type {any} */ a, /** @type {any} */ b) {
  return {
    ...a,
    ...b,
    changes: { ...a.changes, ...b.changes },
    evidence: { ...a.evidence, ...b.evidence },
    pending: [...new Set([...list(a.pending), ...list(b.pending)])],
    reasons: { ...a.reasons, ...b.reasons },
    invented: [...new Set([...list(a.invented), ...list(b.invented)])],
    ...(a.conformance || b.conformance ? { conformance: { ...a.conformance, ...b.conformance } } : {}),
    ...(a.owners || b.owners ? { owners: { ...a.owners, ...b.owners } } : {}),
    ...(a.sources || b.sources ? { sources: { ...a.sources, ...b.sources } } : {}),
    ...(a.tried || b.tried ? { tried: { ...a.tried, ...b.tried } } : {}),
    ...(a.emptyLinks || b.emptyLinks
      ? { emptyLinks: [...new Set([...list(a.emptyLinks), ...list(b.emptyLinks)])] }
      : {})
  }
}

/**
 * Write the pages of the plan in order.
 * @param {{plan: NonNullable<ReturnType<typeof pageAuthorPlan>>, slots: any[], pageOf: (entity: string) => string[],
 *   write: (call: {only: string[], author: any, written: Array<{key: string, entity: string, value: string}>}) =>
 *     Promise<{result: any, calls: number, failed: number, cut?: number, rounds?: number, callMs?: number[]}>,
 *   usage?: () => any, rulebook?: string, now?: () => number}} input
 * @returns {Promise<{plan: any, answered: {calls: number, failed: number, cut: number, rounds: number, callMs: number[]},
 *   pages: any[], hiddenKeys: string[], droppedKeys: string[], pageOfKey: Map<string, string>,
 *   added: Array<{id: string, copies: string, source: string, item: string, values: Record<string, string>,
 *     pending: string[]}>}>}
 */
export async function writePagesInOrder({
  plan,
  slots,
  pageOf,
  write,
  usage = () => null,
  rulebook = RULEBOOK,
  now = Date.now
}) {
  const { compactPage } = await seeder('page-author')
  const position = new Map(plan.order.map((p, i) => [p.entity, i]))
  /** @type {Map<string, string>} the record page step each record entity is written with */
  const recordStep = new Map(plan.order.flatMap((p) => (p.entities ?? []).map((e) => [e, p.entity])))
  /** @type {Map<string, any[]>} */
  const byPage = new Map()
  const hiddenKeys = []
  const droppedKeys = []
  /** @type {Map<string, string>} the page entity each slot was written with */
  const pageOfKey = new Map()
  for (const slot of slots) {
    if (plan.hidden.has(String(slot.entity))) {
      hiddenKeys.push(slot.key)
      continue
    }
    const record = recordStep.get(String(slot.entity))
    if (record) {
      pageOfKey.set(slot.key, record)
      byPage.set(record, [...(byPage.get(record) ?? []), slot])
      continue
    }
    const shows = pageOf(String(slot.entity))
    if (shows.length > 0 && shows.every((p) => plan.dropped?.has(p) && !position.has(p))) {
      droppedKeys.push(slot.key)
      continue
    }
    const first = shows
      .filter((p) => position.has(p))
      .sort((a, b) => /** @type {number} */ (position.get(a)) - /** @type {number} */ (position.get(b)))[0]
    const page = first ?? SHARED_PAGE
    if (first) pageOfKey.set(slot.key, first)
    byPage.set(page, [...(byPage.get(page) ?? []), slot])
  }
  // An added page writes the slots of the entity it copies, for its own item (ticket #238).
  for (const step of plan.order.filter((p) => p.added)) {
    const source = String(step.added?.source)
    if (plan.hidden.has(source)) continue
    byPage.set(
      step.entity,
      slots.filter((s) => String(s.entity) === source)
    )
  }
  /** @type {Array<{id: string, copies: string, source: string, item: string, values: Record<string, string>, pending: string[]}>} */
  const added = []
  const steps = [
    ...plan.order.map((p) => ({ id: p.id, entity: p.entity, page: p.page, added: p.added ?? null })),
    {
      id: SHARED_PAGE,
      entity: SHARED_PAGE,
      page: {
        id: SHARED_PAGE,
        purpose:
          'the parts of the site shown on several pages or on every page (header, footer, shared bands)'
      },
      added: null
    }
  ]
  const hiddenSections = [...plan.hidden].map((entity) => `section:${entity}`)
  /** @type {any} */
  let joined = { changes: {}, evidence: {}, pending: [], reasons: {}, invented: [] }
  const answered = { calls: 0, failed: 0, cut: 0, rounds: 0, callMs: /** @type {number[]} */ ([]) }
  const pages = []
  const writtenPages = []
  /** @type {Array<{key: string, entity: string, value: string}>} */
  const written = []
  for (const step of steps) {
    const own = byPage.get(step.entity) ?? []
    if (own.length === 0) continue
    const before = usage() ?? {}
    const started = now()
    const only = own.map((s) => s.key)
    let got
    try {
      got = await write({
        only,
        author: {
          rulebook,
          page: step.page,
          hiddenSections,
          cardItems: plan.cardItems,
          // An added page binds the record it copies to its own item.
          recordItems: step.added
            ? { ...plan.recordItems, [step.added.source]: step.added.item }
            : plan.recordItems,
          glossary: plan.glossary,
          writtenPages: [...writtenPages]
        },
        written: [...written]
      })
    } catch (error) {
      // A page with no readable answer keeps its slots pending, never the end of the others.
      const reason = 'model-unreadable'
      got = {
        result: {
          changes: {},
          pending: only,
          reasons: Object.fromEntries(only.map((k) => [k, reason])),
          error: error instanceof Error ? error.message : String(error)
        },
        calls: 1,
        failed: 1
      }
    }
    const after = usage() ?? {}
    const result = got.result ?? {}
    if (!step.added) joined = joinPlans(joined, result)
    answered.calls += got.calls ?? 0
    answered.failed += got.failed ?? 0
    answered.cut += got.cut ?? 0
    answered.rounds = Math.max(answered.rounds, got.rounds ?? 1)
    answered.callMs.push(...list(got.callMs))
    const values = own
      .filter((s) => typeof result.changes?.[s.key] === 'string')
      .map((s) => ({ key: s.key, entity: String(s.entity), value: String(result.changes[s.key]) }))
    // An added page's words are its own: kept apart, never over the template record it copies.
    if (step.added)
      added.push({
        id: step.id,
        ...step.added,
        values: Object.fromEntries(values.map((v) => [v.key, v.value])),
        pending: list(result.pending).filter((k) => only.includes(k))
      })
    else written.push(...values)
    writtenPages.push(
      compactPage(
        step.id,
        values.map((v) => v.value)
      )
    )
    const delta = (/** @type {string} */ k) => (Number(after?.[k]) || 0) - (Number(before?.[k]) || 0)
    pages.push({
      page: step.id,
      ms: now() - started,
      calls: got.calls ?? 0,
      failed: got.failed ?? 0,
      promptTokens: delta('promptTokens'),
      completionTokens: delta('completionTokens'),
      slots: own.length,
      written: values.length,
      pending: list(result.pending).filter((k) => only.includes(k)).length
    })
  }
  return { plan: joined, answered, pages, hiddenKeys, droppedKeys, pageOfKey, added }
}
