// The shape problems that keep a plan off a bench, shared by the writer bench and the picture bench.
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Every problem that keeps a plan off the writer bench; empty when it may run. The plan checker is not re-run. */
export function planShapeProblems(plan, kitRef) {
  if (!isObject(plan)) return ['the plan is not a JSON object']
  const problems = []
  if (!isObject(plan.site)) problems.push('site must be an object')
  if (!Array.isArray(plan.pages) || !plan.pages.length) problems.push('pages must be a non-empty list')
  if (plan.sharedBlocks !== undefined && !Array.isArray(plan.sharedBlocks))
    problems.push('sharedBlocks must be a list')
  if (typeof plan.kit === 'string' && kitRef && !plan.kit.split(/\s+/).includes(kitRef))
    problems.push(`the plan was made on the kit "${plan.kit}", not ${kitRef}`)
  return problems
}
