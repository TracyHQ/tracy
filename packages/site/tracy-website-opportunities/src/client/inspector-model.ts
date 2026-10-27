/**
 * What the Inspector reads out of an opportunity's detail answer (`GET /opportunities/:id`), beside
 * the parsers it shares with the Details page (`detail-model.ts`).
 */
import { type MediaTile, mediaTile } from './detail-model.ts'
import type { DemoFacts } from '@tracy/wo-views'

import type { OpportunityListRow, RowJob } from './opportunity-row.ts'
import { type BuildView, PLACE_SETTLED_REASONS, buildView } from './status.ts'

export type RollupTone = 'ok' | 'run' | 'paused' | 'bad' | 'idle'

const ROLLUP: Readonly<Record<string, { key: string; tone: RollupTone }>> = {
  queued: { key: 'job.state.queued', tone: 'idle' },
  running: { key: 'job.state.running', tone: 'run' },
  paused: { key: 'job.state.paused', tone: 'paused' },
  blocked: { key: 'job.state.blocked', tone: 'bad' },
  failed: { key: 'job.state.failed', tone: 'bad' },
  cancelled: { key: 'job.state.cancelled', tone: 'idle' },
  completed: { key: 'source.status.complete', tone: 'ok' }
}

/** The word beside the Research heading. */
export function researchRollup(job: { state?: string | null } | null | undefined): {
  key: string
  tone: RollupTone
} {
  if (!job) return { key: 'job.none', tone: 'idle' }
  return ROLLUP[job.state ?? ''] ?? ROLLUP.queued
}

interface BuildRow {
  id?: string
  qa?: { state?: string | null } | null
  demo?: {
    siteKey?: string | null
    expiresAt?: string | null
    frozenAt?: string | null
    deletedAt?: string | null
  } | null
  revisionId?: string
  siteKey?: string | null
  state?: string | null
  receipt?: { body?: { code?: unknown } | null } | null
  createdAt?: string | null
}

export interface DemoSiteView extends BuildView {
  cms: string | null
}

const newestFirst = (a: BuildRow, b: BuildRow): number =>
  String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))

/** The demo site to show: the newest ready one, else the newest build's progress; null when none was asked. */
export function demoSite(
  body: { builds?: unknown; revisions?: unknown } | null | undefined
): DemoSiteView | null {
  const builds = (Array.isArray(body?.builds) ? (body.builds as BuildRow[]) : []).filter(
    (b) => b && typeof b === 'object'
  )
  if (builds.length === 0) return null
  const sorted = [...builds].sort(newestFirst)
  const view = (b: BuildRow): BuildView =>
    buildView({ build: { state: b.state, receipt: b.receipt }, site: b.siteKey ? { key: b.siteKey } : null })
  const ready = sorted.find((b) => b.siteKey && view(b).phase === 'done')
  const pick = ready ?? sorted[0]
  const revisions = Array.isArray(body?.revisions) ? (body.revisions as { id?: string; cms?: string }[]) : []
  const cms = ready ? (revisions.find((r) => r?.id === pick.revisionId)?.cms ?? null) : null
  return { ...view(pick), cms }
}

/**
 * The demo the Demo column and section count down (tasks/todo-wo-demo-retention.md): the list row's
 * `demo` when the row came from the list, else the newest build with a site in the detail answer.
 */
export function demoFacts(
  row: OpportunityListRow,
  body: { builds?: unknown } | null | undefined
): DemoFacts | null {
  if (row.demo) return row.demo
  const builds = (Array.isArray(body?.builds) ? (body.builds as BuildRow[]) : []).filter(
    (b) => b && typeof b === 'object'
  )
  const b = [...builds].sort(newestFirst).find((x) => x.demo && x.siteKey)
  if (!b?.demo) return null
  const phase = buildView({
    build: { state: b.state, receipt: b.receipt },
    site: { key: b.siteKey ?? '' }
  }).phase
  return {
    siteKey: b.demo.siteKey ?? null,
    url: null,
    expiresAt: b.demo.expiresAt ?? null,
    frozenAt: b.demo.frozenAt ?? null,
    deletedAt: b.demo.deletedAt ?? null,
    deletesAt: null,
    qa: b.qa?.state ?? null,
    build: {
      status: phase === 'running' ? 'building' : phase === 'deleted' ? 'done' : phase,
      startedAt: b.createdAt ?? null
    }
  }
}

const PREVIEW = 5

/** The first five stored photos (videos and link-only items are left to the Details page), and the full count. */
export function mediaPreview(raw: unknown): { total: number; tiles: MediaTile[] } {
  const tiles = (Array.isArray(raw) ? raw : []).flatMap((m: unknown) => {
    const tile = mediaTile(m as Record<string, unknown>)
    return tile === null ? [] : [tile]
  })
  return { total: tiles.length, tiles: tiles.filter((t) => t.stored && t.kind === 'image').slice(0, PREVIEW) }
}

interface DetailJob {
  id?: string
  state?: string | null
  stage?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  lastError?: RowJob['lastError']
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const listOf = <T extends object>(
  v: unknown,
  keep: (item: Record<string, unknown>) => item is Record<string, unknown> & T
): T[] => (Array.isArray(v) ? v.filter(isObject).filter(keep) : [])
const withId = <T extends object>(item: Record<string, unknown>): item is Record<string, unknown> & T =>
  typeof item.id === 'string' && item.id !== ''
const later = (a: { createdAt?: string | null }, b: { createdAt?: string | null }): number =>
  String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))

const NOT_FOUND_REASONS = new Set<string>(PLACE_SETTLED_REASONS)

/** Done: something collected (complete or partial). Not found: settled at the place, never done. */
function sourceCountsOf(sources: unknown[]): { done: number; notFound: number; total: number } {
  const rows = sources.filter(isObject)
  const collected = (s: Record<string, unknown>) => ['complete', 'partial'].includes(String(s.status))
  return {
    done: rows.filter(collected).length,
    notFound: rows.filter((s) => !collected(s) && NOT_FOUND_REASONS.has(String(s.reason))).length,
    total: sources.length
  }
}

/**
 * The list row of the opportunity a detail answer describes, so the Details page shows the same
 * Status and next action as the list: its newest job, newest brief and newest build, and the sites of
 * the builds that finished. Null when the answer names no opportunity.
 */
export function rowFromDetail(body: unknown): OpportunityListRow | null {
  if (!isObject(body) || !isObject(body.opportunity)) return null
  const o = body.opportunity
  if (typeof o.id !== 'string' || o.id === '') return null
  const jobs = listOf<DetailJob & { id: string }>(body.jobs, withId).sort(later)
  const revisions = listOf<{ id: string; n?: number; cms?: string; createdAt?: string | null }>(
    body.revisions,
    withId
  ).sort((a, b) => (b.n ?? 0) - (a.n ?? 0))
  const builds = listOf<BuildRow & { id: string }>(body.builds, withId).sort(later)
  const done = (b: BuildRow): boolean =>
    buildView({ build: { state: b.state, receipt: b.receipt }, site: b.siteKey ? { key: b.siteKey } : null })
      .phase === 'done'
  const sites = [...new Set(builds.filter((b) => b.siteKey && done(b)).map((b) => String(b.siteKey)))]
  const newestBuild = builds[0]
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : undefined,
    branch: typeof o.branch === 'string' ? o.branch : null,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : null,
    candidate: isObject(o.candidate) ? o.candidate : null,
    job: jobs[0] ?? null,
    demo: isObject(body.demo) ? (body.demo as unknown as DemoFacts) : null,
    sourceCounts: Array.isArray(body.sources) ? sourceCountsOf(body.sources) : null,
    demoAction: isObject(body.demoAction)
      ? (body.demoAction as unknown as OpportunityListRow['demoAction'])
      : null,
    latestRevision: revisions[0] ?? null,
    sites,
    latestBuild: newestBuild
      ? {
          id: newestBuild.id,
          state: newestBuild.state ?? null,
          siteKey: newestBuild.siteKey ?? null,
          done: done(newestBuild),
          qa: newestBuild.qa?.state ?? null
        }
      : null
  }
}
