// The brief's own decision about a fact, laid on the needs profile's merged fact (#575): the brief already decided how
// sure Tracy is of each fact and why (`fact-assessment.mjs`, carried by `researchOf` as `assessed`), so a fact the
// needs profile merged to the same value states that decision (`confidence`, and `assessment` with its onSite,
// decidedBy and reasons) instead of a second count of its sources. A fact in a conflict keeps the merge's own
// `single-source`: conflicting sources are never agreement. A value the brief did not decide (one the model read from
// words) keeps the merge's count. Pure.
import { sameValue } from './needs-profile-merge.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The merged facts with the brief's decisions laid on.
 * @param {Record<string, object[]>} facts the merged facts (`mergeFacts`)
 * @param {Array<{kind: string, value: string, fact?: string, confidence: string, onSite: boolean,
 *   decidedBy?: string, reasons: string[]}>} [assessed] the research's `assessed` (`researchOf`)
 */
export function withBriefAssessment(facts, assessed) {
  const decided = list(assessed)
  if (decided.length === 0) return facts
  const out = {}
  for (const [kind, entries] of Object.entries(facts)) {
    out[kind] = entries.map((entry) => {
      if (entry.conflict) return entry
      const found = decided.find((a) => a.kind === kind && sameValue(kind, a.value, entry.value))
      if (!found) return entry
      return {
        ...entry,
        confidence: found.confidence,
        assessment: {
          onSite: found.onSite,
          ...(found.decidedBy ? { decidedBy: found.decidedBy } : {}),
          reasons: found.reasons,
          ...(found.fact ? { fact: found.fact } : {})
        }
      }
    })
  }
  return out
}
