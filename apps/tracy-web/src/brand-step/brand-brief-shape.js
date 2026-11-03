// What a brief needs to run the brand step (brand step trial bench, #320): a usable brand part. The check is cheap and
// runs before a run is queued, so a broken input never spends model time. The gate (save-brand-file.js) reads only
// brief.brand and brief.missing, so those are the only parts looked at here.
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const isText = (x) => typeof x === 'string' && x.trim() !== ''
/** The brief fields that hold the business name back (name-slots.js HELD_BACK_FIELDS). */
const NAME_FIELDS = ['brand.name', 'name', 'business.name']

/** Every problem that keeps the brief off the brand bench, in order; an empty list when it may run. */
export function brandBriefProblems(brief) {
  if (!isObject(brief)) return ['the brief is not a JSON object']
  if (!isObject(brief.brand)) return ['the brief has no brand part (brief.brand)']
  const problems = []
  const b = brief.brand
  const held = Array.isArray(brief.missing) && brief.missing.some((m) => NAME_FIELDS.includes(m?.field))
  if (!isText(b.name) && !held)
    problems.push('brand.name is missing and the brief does not list it as missing')
  if (!isText(b.voice)) problems.push('brand.voice must start with the site language')
  if (b.logo !== null && b.logo !== undefined && !isText(b.logo))
    problems.push('brand.logo must be a media id or null')
  if (b.colors !== undefined && !Array.isArray(b.colors)) problems.push('brand.colors must be a list')
  return problems
}
