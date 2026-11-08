// Check accepts: a person's reason for a failure of a reach or row pair self-check that the template will not fix (a demo
// placeholder button such as a pricing "select plan", a row of technique chips), read from `reach-accepts.json` in the kit
// work folder, as `gap-accepts.json` holds the reasons for template gaps. The file is a list:
//   [{"check": "deadControls", "where": "links[block-20.link-1]", "reason": "...", "by": "<login>"}]
// `check` names one counter (ACCEPTABLE_CHECKS), `where` is the `where` the counter writes for the failure; one `*` or more
// matches any run of characters (`links[block-31.link-*]` for a row of chips). `by` is optional.
// The counter still counts every failure (`checks.<check>`); an explained one goes to `checkAccepts.<check>`
// (`[{where, reason, by}]`) instead of `coverage.failures`. An entry that matches no failure is itself a failure: counted
// in `checks.checkAcceptsUnmatched` and named in `coverage.failures` (part `checkAcceptsUnmatched`, with its `check`), so a
// stale reason cannot hide a counter that changed.
import { existsSync, readFileSync } from 'node:fs'

import { pathPattern } from './exclude.mjs'

export const ACCEPTABLE_CHECKS = [
  'deadControls',
  'mapLocationUnmapped',
  'phoneNotCallable',
  'rowPartsUnpaired',
  // A page without a title slot (page-titles.mjs), counted in the coverage gate: explained in checkAccepts.slotCoverage.
  'pageTitleSlots'
]
export const UNMATCHED_PART = 'checkAcceptsUnmatched'

const each = (value) => (Array.isArray(value) ? value : [])

/**
 * The accept entries of `file` (none when it does not exist); throws on an entry that is not
 * `{check, where, reason}` with a known check and non-empty strings.
 * @param {string} file
 * @returns {{check: string, where: string, reason: string, by: string|null}[]}
 */
export function readCheckAccepts(file) {
  if (!existsSync(file)) return []
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(doc)) throw new Error(`${file}: must be a list of {check, where, reason}`)
  return doc.map((e, i) => {
    const at = `${file} entry ${i}`
    if (!ACCEPTABLE_CHECKS.includes(e?.check))
      throw new Error(
        `${at}: check ${String(e?.check)} cannot be explained (one of ${ACCEPTABLE_CHECKS.join(', ')})`
      )
    for (const key of ['where', 'reason'])
      if (typeof e[key] !== 'string' || !e[key].trim())
        throw new Error(`${at}: ${key} must be a non-empty string`)
    return {
      check: e.check,
      where: e.where,
      reason: e.reason.trim(),
      by: typeof e.by === 'string' ? e.by : null
    }
  })
}

/**
 * Split each part's failures into explained and unexplained by `accepts`, and write the parts on `kit` (changed in place):
 * `checks.<part>` the whole count, `checkAccepts.<part>` the explained ones, `coverage.failures` the first `named`
 * unexplained ones of each part, and the entries for these parts that match nothing.
 * @param {object} kit
 * @param {Record<string, {where: string, reason: string}[]>} found every failure of each part
 * @param {{accepts?: object[], named: number}} o
 */
export function settleCheckParts(kit, found, { accepts = [], named }) {
  const parts = Object.keys(found)
  const mine = each(accepts).filter((a) => parts.includes(a?.check))
  const used = new Set()
  const open = []
  const explainedOf = {}
  for (const [part, list] of Object.entries(found)) {
    const rules = mine.filter((a) => a.check === part).map((a) => ({ a, test: pathPattern(a.where) }))
    const explained = []
    for (const f of list) {
      const hit = rules.find((r) => r.a.where === f.where) ?? rules.find((r) => r.test(f.where))
      if (!hit) {
        open.push({ part, ...f })
        continue
      }
      used.add(hit.a)
      explained.push({ where: f.where, reason: hit.a.reason, by: hit.a.by ?? null })
    }
    explainedOf[part] = explained
  }
  const unmatched = mine
    .filter((a) => !used.has(a))
    .map((a) => ({
      part: UNMATCHED_PART,
      check: a.check,
      where: a.where,
      reason: `an explanation of ${a.check} at ${a.where} matches no failure the counter found: remove it from reach-accepts.json or fix its where`
    }))
  const coverage = kit.coverage ?? { parts: {}, failures: [] }
  const kept = each(coverage.failures).filter(
    (f) => !parts.includes(f.part) && !(f.part === UNMATCHED_PART && parts.includes(f.check))
  )
  const failures = [
    ...kept,
    ...parts.flatMap((p) => open.filter((f) => f.part === p).slice(0, named)),
    ...unmatched
  ]
  kit.coverage = { ...coverage, failures }
  const counts = Object.fromEntries(Object.entries(found).map(([part, list]) => [part, list.length]))
  kit.checks = {
    ...kit.checks,
    ...counts,
    [UNMATCHED_PART]: failures.filter((f) => f.part === UNMATCHED_PART).length
  }
  kit.checkAccepts = { ...kit.checkAccepts, ...explainedOf }
  return counts
}
