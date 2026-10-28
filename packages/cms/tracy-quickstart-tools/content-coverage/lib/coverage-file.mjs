// The committed result of one audit: `content-coverage.json` beside the contract it measured.
// Compact on purpose: counts per class and one line per distinct hole, never screenshots or pages.
// /ops reads it (apps/tracy-web/src/lib/content-coverage/) and holds Publish on unexplained holes
// and on page hygiene findings (raw language constants, PHP errors, unfilled placeholders).
import { labelRulesOf } from './label-rules.mjs'
import { normText } from './normalize.mjs'
import { rootCause } from './root-cause.mjs'

export const SCHEMA = 'tracy-content-coverage/v1'
/** Bump when a change makes the audit see more (or less): /ops can then ask for a new measurement. */
// 1.1.0 (24/10/2026): page hygiene (`hygiene` list); a 1.0.0 file never looked, so /ops asks again.
// 1.2.0 (28/10/2026): mechanical label rules R2 to R9 and R1 (`labelRules`, ADR 0040); a 1.1.0 file has none.
// 1.3.0 (28/10/2026): the LLM label judge's verdicts (`labelJudge`, `label-judge.mjs`); a 1.2.0 file has none.
export const TOOL_VERSION = '1.3.0'
export const COVERAGE_FILE = 'content-coverage.json'

/** The prototype's letters, in the words the policy and /ops use. */
export const CLASS_NAME = Object.freeze({ a: 'capture', b: 'template', c: 'core', d: 'unknown' })

const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 3)}...` : String(s ?? ''))
const bucketOf = (kind) => (kind === 'image' ? 'images' : kind === 'link' ? 'links' : 'text')
const pathOf = (url) => {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return String(url)
  }
}

/** The value a hole is known by: the unexplained part of a block, the image path, or the text. */
const shownValue = (it) => String(it.remainder ?? it.path ?? it.value ?? '')
/** Stable across runs, so an accepted reason written by hand survives the next measurement. */
export const holeKey = (h) =>
  `${h.kind}|${h.kind === 'image' || h.kind === 'link' ? String(h.value).toLowerCase() : normText(h.value)}`

/** Stable across runs, like `holeKey`: an accepted reason on a page problem survives the next measurement. */
export const hygieneKey = (h) => `${h.kind}|${String(h.value ?? '').trim()}`

/** Page hygiene findings, one per distinct problem, with the pages it was seen on; reasons carried over. */
function hygieneOf(result, previous) {
  const accepted = new Map()
  for (const h of Array.isArray(previous?.hygiene) ? previous.hygiene : []) {
    if (typeof h?.accepted === 'string' && h.accepted.trim()) accepted.set(hygieneKey(h), h.accepted.trim())
  }
  const byKey = new Map()
  for (const p of result.pages) {
    const onPage = new Set()
    for (const f of Array.isArray(p.hygiene) ? p.hygiene : []) {
      const key = hygieneKey(f)
      const seen = byKey.get(key)
      if (!seen) {
        byKey.set(key, {
          kind: f.kind,
          value: cut(f.value, 300),
          where: f.where,
          visible: f.visible === true,
          ...(f.token ? { token: f.token } : {}),
          evidence: cut(f.evidence ?? '', 160),
          pages: 1,
          firstPage: pathOf(p.url)
        })
      } else if (!onPage.has(key)) {
        seen.pages += 1
        seen.visible ||= f.visible === true
      }
      onPage.add(key)
    }
  }
  const order = { 'php-error': 0, 'language-constant': 1, placeholder: 2 }
  return [...byKey.values()]
    .map((h) => {
      const reason = accepted.get(hygieneKey(h))
      return reason ? { ...h, accepted: reason } : h
    })
    .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.value.localeCompare(b.value))
}

const emptyBucket = () => ({
  total: 0,
  matched: 0,
  locked: 0,
  capture: 0,
  captureLocked: 0,
  template: 0,
  core: 0,
  unknown: 0,
  ignored: 0
})

/**
 * @param {{ result: any, contract: any, previous?: any, measuredAt?: string, labelJudge?: any }} input
 *   `result` = what `runAudit` returned; `previous` = the file this run replaces (accepted reasons carry over);
 *   `labelJudge` = the LLM label judge's block (`judgeLabels`), written beside `labelRules` when given
 */
export function buildCoverageFile({
  result,
  contract,
  previous = null,
  measuredAt = new Date().toISOString(),
  labelJudge = null
}) {
  const accepted = new Map()
  for (const h of Array.isArray(previous?.holes) ? previous.holes : []) {
    if (typeof h?.accepted === 'string' && h.accepted.trim()) accepted.set(holeKey(h), h.accepted.trim())
  }
  const unique = new Map()
  const pagesOf = new Map()
  for (const p of result.pages) {
    for (const it of p.items) {
      if (!unique.has(it.key)) unique.set(it.key, it)
      if (it.status !== 'hole') continue
      const seen = pagesOf.get(it.key) ?? { n: 0, first: pathOf(p.url) }
      seen.n += 1
      pagesOf.set(it.key, seen)
    }
  }
  const counts = { text: emptyBucket(), images: emptyBucket(), links: emptyBucket() }
  const holes = []
  for (const it of unique.values()) {
    const c = counts[bucketOf(it.kind)]
    if (it.status === 'ignored') {
      c.ignored += 1
      continue
    }
    c.total += 1
    if (it.status === 'matched' || it.status === 'locked') {
      c[it.status] += 1
      continue
    }
    const cls = CLASS_NAME[it.class] ?? 'unknown'
    c[cls] += 1
    if (cls === 'capture' && it.lockState === 'locked') c.captureLocked += 1
    if (cls === 'core') continue
    const hole = {
      kind: it.kind === 'attr' || it.kind === 'meta' ? `${it.kind}:${it.attr}` : it.kind,
      value: cut(shownValue(it), 200),
      class: cls,
      ...(cls === 'capture' ? { lock: it.lockState === 'locked' ? 'locked' : 'undeclared' } : {}),
      cause: rootCause(it),
      evidence: cut(it.evidence?.[0] ?? '', 160),
      pages: pagesOf.get(it.key)?.n ?? 0,
      firstPage: pagesOf.get(it.key)?.first ?? null
    }
    const reason = accepted.get(holeKey(hole))
    if (reason) hole.accepted = reason
    holes.push(hole)
  }
  const order = { capture: 0, template: 1, unknown: 2 }
  holes.sort(
    (a, b) =>
      order[a.class] - order[b.class] || a.cause.localeCompare(b.cause) || a.value.localeCompare(b.value)
  )
  const s = result.summary
  return {
    schemaVersion: SCHEMA,
    tool: { name: '@tracy/quickstart-tools content-coverage', version: TOOL_VERSION },
    contract: {
      id: contract.manifest.id,
      contentMapSha256: contract.sha256.contentMap,
      presentationLockSha256: contract.sha256.presentationLock
    },
    measuredAt,
    viewports: result.viewports ?? ['desktop', 'phone'],
    pages: {
      audited: s.pages,
      inMap: s.mappedPages,
      notInMap: s.unmappedPages,
      failed: result.failures.length,
      capReached: result.capReached === true
    },
    counts,
    coverage: Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, percent(c)])),
    holes,
    hygiene: hygieneOf(result, previous),
    // Rules R2 to R9 over the map, the page snapshots and every hole found (core strings are skipped by R9 itself).
    labelRules: labelRulesOf({
      map: contract.map,
      pages: result.pages,
      holes: [...unique.values()]
        .filter((it) => it.status === 'hole')
        .map((it) => ({
          kind: it.kind === 'attr' || it.kind === 'meta' ? `${it.kind}:${it.attr}` : it.kind,
          value: shownValue(it),
          class: CLASS_NAME[it.class] ?? 'unknown'
        }))
    }),
    // The LLM label judge (spec #37): per slot right or wrong with a suggested role; also the cache of the next run.
    ...(labelJudge ? { labelJudge } : {})
  }
}

/** matched / (matched + every hole that needs a slot); locked design and core strings are not asked of a slot. */
export function percent(c) {
  const need = c.matched + c.capture + c.template + c.unknown
  return need ? Math.round((c.matched / need) * 1000) / 10 : 100
}
