/**
 * Research again (tasks/todo-wo-research-again.md): the server's plan of what a press would look at again,
 * read safely and turned into translation keys and prices. The place card (`GET …/:id/research-again`, the
 * account pays) and the public Find (`GET /find/api/research-again`, Tracy pays) draw the same view.
 * Nothing here decides what is due: the server's plan does.
 */
export type AgainRunReason = 'never' | 'failed' | 'outdated' | 'rule-changed'
export type AgainKeptReason = 'up-to-date' | 'none' | 'unavailable' | 'over-cap'

export interface AgainPlan {
  run: { part: string; reason: AgainRunReason; ceilingCents: number }[]
  kept: { part: string; reason: AgainKeptReason; detail?: string }[]
  ceilingCents: number
}

export interface AgainPreview {
  /** Null: the place was never researched, so there is nothing to look at again. */
  plan: AgainPlan | null
  payer: 'account' | 'tracy'
  /** False: today's limit is used up (account) or the public door is closed. */
  open: boolean
  /** Research again runs left today for the account; null on the public Find. */
  left: number | null
}

const RUN_REASONS = new Set<string>(['never', 'failed', 'outdated', 'rule-changed'])
const KEPT_REASONS = new Set<string>(['up-to-date', 'none', 'unavailable', 'over-cap'])

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const cents = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const isRunReason = (v: unknown): v is AgainRunReason => typeof v === 'string' && RUN_REASONS.has(v)
const isKeptReason = (v: unknown): v is AgainKeptReason => typeof v === 'string' && KEPT_REASONS.has(v)

function readPlan(raw: unknown): AgainPlan | null {
  if (!record(raw)) return null
  const run = (Array.isArray(raw.run) ? raw.run : []).flatMap((r) => {
    const part = record(r) ? text(r.part) : null
    return part && record(r) && isRunReason(r.reason)
      ? [{ part, reason: r.reason, ceilingCents: cents(r.ceilingCents) }]
      : []
  })
  const kept = (Array.isArray(raw.kept) ? raw.kept : []).flatMap((k) => {
    const part = record(k) ? text(k.part) : null
    if (!part || !record(k) || !isKeptReason(k.reason)) return []
    const detail = text(k.detail)
    return [{ part, reason: k.reason, ...(detail ? { detail } : {}) }]
  })
  const total = cents(raw.ceilingCents)
  return { run, kept, ceilingCents: total > 0 ? total : run.reduce((sum, r) => sum + r.ceilingCents, 0) }
}

/** Either door's answer; null when it is not one. */
export function readAgainPreview(body: unknown): AgainPreview | null {
  if (!record(body)) return null
  const payer = body.payer === 'tracy' ? 'tracy' : 'account'
  const plan = readPlan(body.plan)
  if (payer === 'tracy') return { plan, payer, open: body.open !== false, left: null }
  const limit = record(body.limit) ? body.limit : null
  const perDay = limit && typeof limit.perDay === 'number' ? limit.perDay : null
  const used = limit && typeof limit.usedToday === 'number' ? limit.usedToday : 0
  const left = perDay === null ? null : Math.max(0, perDay - used)
  return { plan, payer, open: left === null || left > 0, left }
}

/** Cents as US dollars, the currency Tracy's prices are kept in. */
export function formatCents(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value / 100)
}

export interface AgainView {
  run: { part: string; reasonKey: string; price: string }[]
  /** Kept parts grouped by reason, in the plan's order. */
  kept: { parts: string[]; reasonKey: string }[]
  total: string
  /** How many parts would run; 0 = everything is up to date. */
  due: number
}

export function againView(plan: AgainPlan, locale?: string): AgainView {
  const kept: AgainView['kept'] = []
  for (const k of plan.kept) {
    const reasonKey = `again.kept.${k.reason}`
    const group = kept.find((g) => g.reasonKey === reasonKey)
    if (group) group.parts.push(k.part)
    else kept.push({ parts: [k.part], reasonKey })
  }
  return {
    run: plan.run.map((r) => ({
      part: r.part,
      reasonKey: `again.run.${r.reason}`,
      price: formatCents(r.ceilingCents, locale)
    })),
    kept,
    total: formatCents(plan.ceilingCents, locale),
    due: plan.run.length
  }
}

const REFUSALS: Readonly<Record<string, string>> = {
  NOTHING_DUE: 'again.error.nothingDue',
  RESEARCH_AGAIN_LIMIT: 'again.error.limit',
  JOB_ACTIVE: 'again.error.running',
  AGAIN_UNSUPPORTED: 'again.error.unsupported',
  PUBLIC_AGAIN_LIMIT: 'again.error.publicPlace',
  PUBLIC_RESEARCH_SPENT: 'again.error.publicSpent',
  FEATURE_OFF: 'again.error.publicSpent',
  PUBLIC_RESEARCH_LIMIT: 'again.error.publicLimit',
  RATE_LIMITED: 'again.error.publicLimit',
  NOT_RESEARCHED: 'again.error.notResearched',
  NETWORK: 'again.error.network'
}

/** A refused press or preview, as its translation key. */
export const againRefusalKey = (code: string): string => REFUSALS[code] ?? 'again.error.failed'

/** The two research card rows that hold a web search for the place's Facebook and Instagram pages. */
export const SEARCH_PARTS = ['facebook-search', 'instagram-search'] as const
const isSearchPart = (source: string): boolean => (SEARCH_PARTS as readonly string[]).includes(source)

export type PageVerdict = 'confirmed' | 'pending' | 'rejected'
const VERDICT_ORDER: readonly PageVerdict[] = ['confirmed', 'pending', 'rejected']
const PROOFS = new Set(['address', 'phone', 'link'])
const WHY = new Set([
  'name_near',
  'name_mismatch',
  'page_closed',
  'no_branch_proof',
  'locality_mismatch',
  'locality_unknown',
  'ambiguous',
  'phone_differs',
  'shared_phone',
  'website_differs',
  'no_page_facts'
])

export interface SearchPage {
  url: string
  /** The address without scheme or `www.`, for the row. */
  label: string
  verdict: PageVerdict
  verdictKey: string
  title: string | null
  proofKeys: string[]
  reasonKeys: string[]
}

function readPage(raw: unknown): SearchPage | null {
  if (!record(raw)) return null
  const url = text(raw.url)
  if (!url || !/^https?:\/\//i.test(url)) return null
  const verdict = VERDICT_ORDER.find((v) => v === raw.verdict)
  if (!verdict) return null
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const reasons = [
    ...new Set(list(raw.reasons).map((r) => (WHY.has(r) ? `again.why.${r}` : 'again.why.other')))
  ]
  return {
    url,
    label: url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''),
    verdict,
    verdictKey: `again.page.${verdict}`,
    title: text(raw.title),
    proofKeys: list(raw.proofs)
      .filter((p) => PROOFS.has(p))
      .map((p) => `again.proof.${p}`),
    reasonKeys: reasons
  }
}

/** The pages a search row found (`pages`, or `coverage.pages` of a failed or empty search), added first. */
export function searchPagesOf(row: { source: string; pages?: unknown; coverage?: unknown }): SearchPage[] {
  if (!isSearchPart(row.source)) return []
  const raw = Array.isArray(row.pages)
    ? row.pages
    : record(row.coverage) && Array.isArray(row.coverage.pages)
      ? row.coverage.pages
      : []
  const pages = raw.flatMap((p) => {
    const read = readPage(p)
    return read ? [read] : []
  })
  return VERDICT_ORDER.flatMap((v) => pages.filter((p) => p.verdict === v))
}
