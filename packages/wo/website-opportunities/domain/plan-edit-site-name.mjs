// A card edit of the business name is held to the same checks as the answer to the site name question (ticket #593,
// review defects 12 and 14): plain text, no invisible or direction character, no held person, and the template's
// business name limit. A refusal is `site_name_too_long` (worded with the limit) or `site_name_invalid`, in the
// customer's words, before the edit is applied. Pure.
import { limitsOf } from './plan-site-name-question.mjs'
import { HELD_PERSON_MESSAGE, normalisedSiteName, siteNameProblems } from './plan-site-name.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const FACT_VALUE = /^facts\[([^\]]+)\]\.value$/

/**
 * The problems of the business name an edit sets.
 * @param {{plan: object, edit: object, profile: object, blockStore: object, library?: object[]}} input
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function editedNameProblems({ plan, edit, profile, blockStore, library }) {
  const limits = limitsOf({ blockStore, library })
  const problems = []
  list(edit?.changes).forEach((change, i) => {
    const id = FACT_VALUE.exec(typeof change?.field === 'string' ? change.field : '')?.[1]
    const fact = id && list(plan?.facts).find((f) => f?.id === id)
    if (fact?.kind !== 'business.name' || typeof change.value !== 'string') return
    const at = `changes[${i}]`
    const named = siteNameProblems(change.value, limits, at, list(profile?.withheld?.people))
    if (named.tooLong)
      return problems.push({
        code: 'site_name_too_long',
        at,
        message: `The business name holds at most ${named.tooLong.limit} characters; this one has ${named.tooLong.length}.`
      })
    for (const p of named.problems)
      problems.push({
        code: 'site_name_invalid',
        at,
        message:
          p.message === HELD_PERSON_MESSAGE ? p.message : `This business name cannot be used: ${p.message}.`
      })
    if (normalisedSiteName(change.value) === '' && named.problems.length === 0)
      problems.push({ code: 'site_name_invalid', at, message: 'The business name cannot be empty.' })
  })
  return problems
}
