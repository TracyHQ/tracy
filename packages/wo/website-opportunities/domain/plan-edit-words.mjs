// The customer's words for a Contract B refusal of a plan edit (ticket #593, review defect 19). Contract B words its
// problems for the team and names things by their internal ids (`pages has no entry with id "nope"`, `"business-name"
// appears twice`); a customer never reads those. Each problem becomes one neutral sentence that names the thing by its
// plan label (the page name, the section label, the fact's label, the item's label), or generically when the plan
// holds no such thing; the technical problem stays in `details.problems` for the team, never shown. Pure.
//
// Message kinds worded here: an id that does not resolve; a field the customer cannot change; a value of another
// kind; the same field changed twice; an edit made on another version of the plan or with the wrong shape; an edit
// that changes nothing; an id listed twice; an id that is no fact or item of the plan; any other problem the edited
// plan would have (`after the edit`).

const list = (value) => (Array.isArray(value) ? value : [])
const PREFIX = 'This change cannot be saved: '
const ID = (key) => new RegExp(`${key}\\[([^\\]]+)\\]`, 'g')

/** The last id a path names under `key` (`pages`, `blocks`, `facts`, `items`), or null. */
const lastId = (path, key) => [...path.matchAll(ID(key))].at(-1)?.[1] ?? null

/** What a path names, by its plan label ("the Services section"); null when the plan holds no such thing. */
function subjectOf(path, plan) {
  const blocks = list(plan?.pages).flatMap((p) => list(p?.blocks))
  const block = blocks.find((b) => b?.id === lastId(path, 'blocks'))
  if (block?.label) return `the ${block.label} section`
  const fact = list(plan?.facts).find((f) => f?.id === lastId(path, 'facts'))
  if (fact?.label) return `the ${fact.label.toLowerCase()} detail`
  const item = list(plan?.items).find((i) => i?.id === lastId(path, 'items'))
  if (item?.label) return item.label
  const page = list(plan?.pages).find((p) => p?.id === lastId(path, 'pages'))
  return page?.name ? `the ${page.name} page` : null
}
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/** One refusal in the customer's words; `plan` is the plan the edit applies to. */
function wordsOf({ at, message }, plan) {
  const path = String(at ?? '').replace(/^plan /, '')
  const field = /^changes\[(.*)\](\.field|\.value)?$/s.exec(path)
  const subject = subjectOf(field ? field[1] : path, plan)
  const the = subject ?? 'that part of your plan'
  let words
  if (/does not resolve|is not a fact or item of the plan/.test(message))
    words = 'it names something that is not part of your plan'
  else if (field?.[2] === '.field') words = `${capital(the)} cannot be changed that way`
  else if (field?.[2] === '.value') words = `${capital(the)} cannot take that kind of value`
  else if (field) words = `${capital(the)} is changed twice in one edit`
  else if (/appears twice/.test(message)) words = `it lists the same thing twice in ${the}`
  else if (path === 'changes') words = 'it changes nothing'
  else if (/^(plan|schema|id)\b/.test(path))
    words = 'it was made on another version of your plan, so reload the plan and try again'
  else words = `it leaves ${the} in a state your site cannot be built from`
  return `${PREFIX}${words}.`
}

/**
 * Contract B problems as the gate's problems: code `edit_invalid`, a message in the customer's words, and the
 * technical problem in `details.problems` (for the team, not shown).
 * @param {Array<{at: string, message: string}>} problems
 * @param {object} plan the plan the edit applies to
 */
export const editRefusals = (problems, plan) =>
  problems.map((p) => ({
    code: 'edit_invalid',
    at: p.at,
    message: wordsOf(p, plan),
    details: { problems: [{ at: p.at, message: p.message }] }
  }))
