// The shape a brief needs before a bench queues it (the site planner, ADR 0041, #301; the site writer, #329). It
// checks only what the planner prompt reads: facts with an id, a field, a value and where the fact came from (a
// `source`, as in the lean shape, or an `evidence` list, as in the WO "brief-1" shape), and an optional `missing`
// list. It is not validateBrief: a bench must run the lean reference brief as well as a WO revision.

const MAX_PROBLEMS = 20

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Every problem that keeps the brief off the bench, in order; an empty list when it may run. */
export function briefShapeProblems(brief) {
  if (!isObject(brief)) return ['the brief is not a JSON object']
  if (!Array.isArray(brief.facts) || brief.facts.length === 0) return ['facts must be a non-empty list']
  const problems = []
  const seen = new Set()
  brief.facts.forEach((fact, i) => {
    const at = `facts[${i}]`
    if (!isObject(fact)) return problems.push(`${at}: is not an object`)
    if (!isText(fact.id)) problems.push(`${at}: id must be a non-empty string`)
    else if (seen.has(fact.id)) problems.push(`${at}: id "${fact.id}" is used twice`)
    else seen.add(fact.id)
    if (!isText(fact.field)) problems.push(`${at}: field must be a non-empty string`)
    if (fact.value === undefined || fact.value === null) problems.push(`${at}: value is missing`)
    const evidence =
      Array.isArray(fact.evidence) && fact.evidence.some((e) => isObject(e) && isText(e.source))
    if (!isText(fact.source) && !evidence) problems.push(`${at}: needs a source or a non-empty evidence list`)
  })
  if (brief.missing !== undefined) {
    if (!Array.isArray(brief.missing)) problems.push('missing must be a list')
    else
      brief.missing.forEach((entry, i) => {
        if (!isObject(entry) || !isText(entry.field))
          problems.push(`missing[${i}]: field must be a non-empty string`)
      })
  }
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), '... and more'] : problems
}
