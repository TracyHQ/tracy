// The review page's data (#357): one row per kept page with its slots, failed ones first, and one card per picture frame.
// It reads a run's `site-write-report/1` (with `site-check/1` read back, merged in or given apart), the frozen plan, the
// writer's copy and the picture step's `site-pictures/1`. Pure: no file, no network, no browser.
import { indexPlan, keptPages, prefixOf } from './plan-index.js'

const SHA_FILE = /([a-f0-9]{64})\.(?:png|jpe?g|webp)$/
const PICTURE_PARTS = new Set(['picture', 'picture-hidden', 'picture-painted', 'body-background'])
const STATE_ORDER = { failed: 0, unchecked: 1, ok: 2, skipped: 3 }
const NEARBY = 4

/** What a report line came to, for the owner: failed, ok, unchecked (written, not read back) or skipped. */
export function stateOf(line) {
  if (line.status === 'failed' || (line.status === 'written' && line.readBack === 'failed')) return 'failed'
  if (line.status === 'written') return line.readBack === 'match' ? 'ok' : 'unchecked'
  return 'skipped'
}

export const shaOfPath = (value) => SHA_FILE.exec(String(value ?? ''))?.[1] ?? null

const suffix = (slot) => Number(String(slot).split('.')[1]) || 0

function nearbyCopy(frameId, copySlots) {
  const prefix = prefixOf(frameId)
  const here = suffix(frameId)
  return copySlots
    .filter(
      (s) => s.slot !== frameId && prefixOf(s.slot) === prefix && typeof s.text === 'string' && s.text.trim()
    )
    .sort((a, b) => Math.abs(suffix(a.slot) - here) - Math.abs(suffix(b.slot) - here))
    .slice(0, NEARBY)
    .map((s) => ({ slot: s.slot, text: s.text }))
}

const byState = (a, b) =>
  STATE_ORDER[a.state] - STATE_ORDER[b.state] || String(a.slot).localeCompare(String(b.slot))

function pageTitle(page, lines) {
  const title = lines.find((l) => l.slot === `${page.id}:title` && l.status === 'written')
  return title?.ordered ?? page.id
}

/**
 * @param {{ report: object, check?: object, plan: object, copy?: object, pictures?: object, brief?: object,
 *   routes?: Record<string, string>, siteUrl?: string }} input
 */
export function buildReviewModel({
  report,
  check,
  plan,
  copy = {},
  pictures = {},
  brief = {},
  routes = {},
  siteUrl
}) {
  const lines = (report.slots ?? []).map((l) => ({ ...l, state: stateOf(l) }))
  const { pageOfSlot, framePlans } = indexPlan(plan)
  const pages = keptPages(plan).map((p) => ({
    id: p.id,
    title: pageTitle(p, lines),
    path: routes[p.id] ?? `/${p.slug}`,
    slots: [],
    skipped: []
  }))
  const shared = { id: null, title: null, path: null, slots: [], skipped: [] }
  const rowOf = (id) => pages.find((p) => p.id === id) ?? shared
  for (const l of lines) {
    if (l.owner === null || String(l.part ?? '').startsWith('brand-')) continue
    const row = rowOf(pageOfSlot(l.slot))
    const entry = {
      slot: l.slot,
      state: l.state,
      part: l.part ?? null,
      ordered: l.ordered ?? null,
      sha: PICTURE_PARTS.has(l.part) || shaOfPath(l.ordered) ? shaOfPath(l.ordered) : null,
      reason: l.reason ?? null
    }
    ;(l.state === 'skipped' ? row.skipped : row.slots).push(entry)
  }
  for (const row of [...pages, shared]) row.slots.sort(byState)
  const pictureLine = new Map(
    lines.filter((l) => PICTURE_PARTS.has(l.part) && l.slot).map((l) => [l.slot, l])
  )
  const photoSha = new Map((brief.assets ?? []).map((a) => [a.id, a.sha256]))
  const copySlots = copy.slots ?? []
  const frames = (pictures.frames ?? []).map((f) => {
    const line = pictureLine.get(f.frame)
    const planned = framePlans.get(f.frame)
    return {
      id: f.frame,
      pageId: planned?.pageId ?? pageOfSlot(f.frame),
      state: line ? line.state : 'skipped',
      reason: line?.reason ?? null,
      orderedPath: line?.ordered ?? null,
      sha: shaOfPath(line?.ordered) ?? f.sha256 ?? null,
      madeSha: f.sha256 ?? null,
      madeFile: f.file ?? null,
      source: f.source ?? null,
      seen: f.seen ?? null,
      width: f.width ?? null,
      height: f.height ?? null,
      photoSha: f.asset ? (photoSha.get(f.asset) ?? null) : null,
      planned: planned
        ? {
            shows: planned.shows ?? null,
            kind: planned.kind ?? null,
            mood: planned.mood ?? null,
            size: planned.size ?? null,
            avoid: planned.avoid ?? [],
            mustInclude: planned.mustInclude ?? []
          }
        : null,
      nearby: nearbyCopy(f.frame, copySlots)
    }
  })
  frames.sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.id.localeCompare(b.id, 'en', { numeric: true })
  )
  const all = lines.filter((l) => l.owner !== null)
  const count = (state) => all.filter((l) => l.state === state).length
  return {
    run: {
      kit: report.kit ?? null,
      site: report.site ?? null,
      status: report.status ?? null,
      check: (check ?? report.siteCheck)?.status ?? null
    },
    siteUrl: siteUrl ?? (report.site ? `https://${report.site}` : null),
    stats: {
      failed: count('failed'),
      written: count('ok') + count('unchecked'),
      skipped: count('skipped'),
      frames: frames.length
    },
    pages: [...pages].sort(
      (a, b) =>
        b.slots.filter((s) => s.state === 'failed').length -
        a.slots.filter((s) => s.state === 'failed').length
    ),
    shared,
    frames
  }
}
