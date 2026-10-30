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
 * @param {any} run - the site plan run (`writeSitePlan`)
 * @returns {{order: Array<{id: string, entity: string, page: any}>, hidden: Set<string>, glossary: any[]} | null}
 */
export function pageAuthorPlan(run) {
  const plan = run?.status === 'accepted' ? run.plan : null
  if (!plan) return null
  const pages = new Map(
    list(plan.pages)
      .filter((p) => p?.decision === 'keep' && String(p.id).startsWith('page:'))
      .map((p) => [String(p.id), p])
  )
  const ordered = [...list(plan.writingOrder).map(String), ...pages.keys()].filter(
    (id, i, all) => pages.has(id) && all.indexOf(id) === i
  )
  const order = ordered.map((id) => {
    const { decision: _, by: __, dependsOn: ___, seo: ____, ...page } = pages.get(id)
    return { id, entity: entityOf(id), page }
  })
  // A plan that keeps no page has nothing to write page by page: the current writers write the site.
  if (order.length === 0) return null
  const hidden = new Set(
    list(plan.decisions)
      .filter((d) => d?.decision === 'hide' && String(d.element).startsWith('section:'))
      .map((d) => entityOf(d.element))
  )
  return { order, hidden, glossary: list(plan.glossary) }
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
 *   pages: any[], hiddenKeys: string[], pageOfKey: Map<string, string>}>}
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
  /** @type {Map<string, any[]>} */
  const byPage = new Map()
  const hiddenKeys = []
  /** @type {Map<string, string>} the page entity each slot was written with */
  const pageOfKey = new Map()
  for (const slot of slots) {
    if (plan.hidden.has(String(slot.entity))) {
      hiddenKeys.push(slot.key)
      continue
    }
    const first = pageOf(String(slot.entity))
      .filter((p) => position.has(p))
      .sort((a, b) => /** @type {number} */ (position.get(a)) - /** @type {number} */ (position.get(b)))[0]
    const page = first ?? SHARED_PAGE
    if (first) pageOfKey.set(slot.key, first)
    byPage.set(page, [...(byPage.get(page) ?? []), slot])
  }
  const steps = [
    ...plan.order.map((p) => ({ id: p.id, entity: p.entity, page: p.page })),
    {
      id: SHARED_PAGE,
      entity: SHARED_PAGE,
      page: {
        id: SHARED_PAGE,
        purpose:
          'the parts of the site shown on several pages or on every page (header, footer, shared bands)'
      }
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
    joined = joinPlans(joined, result)
    answered.calls += got.calls ?? 0
    answered.failed += got.failed ?? 0
    answered.cut += got.cut ?? 0
    answered.rounds = Math.max(answered.rounds, got.rounds ?? 1)
    answered.callMs.push(...list(got.callMs))
    const values = own
      .filter((s) => typeof result.changes?.[s.key] === 'string')
      .map((s) => ({ key: s.key, entity: String(s.entity), value: String(result.changes[s.key]) }))
    written.push(...values)
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
  return { plan: joined, answered, pages, hiddenKeys, pageOfKey }
}
