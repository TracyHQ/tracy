// The shape of the legal and not-found pages in a plan composer reply (#575, `plan-system-pages.mjs`): the step chain's
// `site.legalPages[]` (`kind`, `use`, `id`, `says`, `factIds`; no `slug`, the plan carries no address) and
// `site.notFound` (`says`, `leadsTo`), both optional, each a closed shape. Read by `plan-gate-reply.mjs`. Pure.

const LEGAL_SHAPE = { required: ['kind', 'use', 'id'], optional: ['says', 'factIds'] }
const NOT_FOUND_SHAPE = { required: ['says', 'leadsTo'], optional: [] }

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function closed(value, { required, optional }, at, name, problem) {
  if (!isObject(value)) {
    problem('reply_shape', at, `${at} must be an object (${name})`)
    return false
  }
  for (const key of required)
    if (!Object.hasOwn(value, key)) problem('reply_shape', `${at}.${key}`, `missing ${key}`)
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key))
      problem('reply_shape', `${at}.${key}`, `${JSON.stringify(key)} is not a key of a ${name}`)
  return true
}

function textList(value, at, problem) {
  if (!Array.isArray(value)) return problem('reply_shape', at, 'must be a list of ids')
  value.forEach((id, i) => {
    if (typeof id !== 'string') problem('reply_shape', `${at}[${i}]`, 'an id must be a text')
  })
}

/** The shape of the reply's `legalPages` and `notFound`, both optional (`plan-gate-reply.mjs`). */
export function systemPagesShapeProblems(reply, problem) {
  if (reply.legalPages !== undefined) {
    if (!Array.isArray(reply.legalPages)) problem('reply_shape', 'legalPages', 'must be a list')
    else
      reply.legalPages.forEach((entry, i) => {
        const at = `legalPages[${i}]`
        if (!closed(entry, LEGAL_SHAPE, at, 'legal page', problem)) return
        for (const key of ['kind', 'use', 'id', 'says'])
          if (entry[key] !== undefined && typeof entry[key] !== 'string')
            problem('reply_shape', `${at}.${key}`, `${key} must be a text`)
        if (entry.factIds !== undefined) textList(entry.factIds, `${at}.factIds`, problem)
      })
  }
  if (
    reply.notFound !== undefined &&
    closed(reply.notFound, NOT_FOUND_SHAPE, 'notFound', 'not-found page', problem)
  ) {
    if (typeof reply.notFound.says !== 'string')
      problem('reply_shape', 'notFound.says', 'says must be a text')
    textList(reply.notFound.leadsTo, 'notFound.leadsTo', problem)
  }
}
