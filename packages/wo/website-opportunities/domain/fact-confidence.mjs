/**
 * How sure Tracy is of one fact of a place profile (#1791, ADR 0037 amendment of 27/10/2026). Three levels, the same
 * for every trade:
 *
 * - `corroborated`: two or more distinct sources state it, and no source states a different value (a fact inside a
 *   `conflicts` entry is never corroborated: conflicting sources are not agreement).
 * - `single-source`: one source states it (or several that disagree).
 * - `inferred`: no source states it; Tracy derived it (`derivation.method: 'inferred'`, its evidence being only the
 *   inputs it was derived from), or none of its evidence resolves to a source.
 *
 * Computed from the fact's evidence only: a sender's declared `verified` or `confidence` is never read.
 */
export const CONFIDENCE_LEVELS = Object.freeze(['corroborated', 'single-source', 'inferred'])

/** The derivation method that marks a fact Tracy derived with no direct source. */
export const INFERRED_METHOD = 'inferred'

/** The code a derivation's reason starts with (`"<code>: <why>"`), or null. */
export function derivationCode(fact) {
  const reason = fact?.derivation?.reason
  if (typeof reason !== 'string') return null
  const code = reason.split(':')[0].trim()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) ? code : null
}

/** The ids of every fact that takes part in a conflict of the profile. */
function conflicted(profile) {
  const ids = new Set()
  for (const c of Array.isArray(profile?.conflicts) ? profile.conflicts : []) {
    if (typeof c?.target === 'string') ids.add(c.target)
    for (const v of Array.isArray(c?.values) ? c.values : []) if (v?.id) ids.add(v.id)
  }
  return ids
}

/**
 * @param {{id: string, evidenceRefs?: string[], derivation?: {method?: string}}} fact
 * @param {{profile: object, path?: string[], conflictIds?: Set<string>}} context `conflictIds` lets a caller assessing
 *   a whole profile compute the conflict set once.
 * @returns {'corroborated' | 'single-source' | 'inferred'}
 */
export function confidenceOf(fact, { profile, path = [], conflictIds } = {}) {
  if (fact?.derivation?.method === INFERRED_METHOD) return 'inferred'
  const evidence = new Map((profile?.evidence ?? []).map((e) => [e.id, e]))
  const sources = new Set((profile?.sources ?? []).map((s) => s.id))
  const distinct = new Set()
  for (const ref of Array.isArray(fact?.evidenceRefs) ? fact.evidenceRefs : []) {
    const sourceId = evidence.get(ref)?.sourceId
    if (sourceId && sources.has(sourceId)) distinct.add(sourceId)
  }
  if (!distinct.size) return 'inferred'
  const inConflict = path[0] === 'conflicts' || (conflictIds ?? conflicted(profile)).has(fact.id)
  return distinct.size >= 2 && !inConflict ? 'corroborated' : 'single-source'
}

export { conflicted as conflictIdsOf }
