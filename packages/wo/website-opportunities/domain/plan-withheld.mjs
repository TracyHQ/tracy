// What the owner asked to keep off the site (locked planner rule P2, 2026-11-03; brief decision 21c): a held business
// name and held people. The old chain's shape is carried as it is: the brief holds its name off with a `name` fact
// decided `onSite: false` (`held-name.mjs`) and its people in `missing[]` team values (`held-reviews.mjs`). The
// research (`researchOf`) and the needs profile carry it as an optional `withheld: {name?: true, people?: string[]}`;
// the plan never shows what it names: the gate reports it (`withheld_shown`), the model never reads it, and the plan
// lists it as left out with `WITHHELD_REASON`. Pure.
import { nameHeldOf } from './held-name.mjs'
import { heldNamesIn, heldPeopleOf } from './held-reviews.mjs'

/** The reason a left out entry gives for data the owner keeps off the site. */
export const WITHHELD_REASON = 'You asked to keep this off the site.'

/** The `withheld` part of a research or a needs profile, from a stored brief; `{}` when nothing is held. */
export function withheldOfBrief(brief) {
  const name = nameHeldOf(brief)
  const people = heldPeopleOf(brief?.missing)
  if (!name && people.length === 0) return {}
  return { withheld: { ...(name ? { name: true } : {}), ...(people.length ? { people } : {}) } }
}

/** A needs profile with the `withheld` part of its research, when the research has one. */
export const withWithheld = (profile, research) =>
  research?.withheld && profile && typeof profile === 'object'
    ? { ...profile, withheld: research.withheld }
    : profile

/** Whether an item of `kind` with these profile `fields` names a held person (`held-reviews.mjs`, whole words). */
function namesHeld(kind, fields, people) {
  if (people.length === 0) return false
  const names = (role) => heldNamesIn(fields?.[role]?.value, people).length > 0
  if (kind === 'person') return names('person.name')
  return kind === 'quote' && (names('quote.text') || names('quote.author_name'))
}
const peopleOf = (withheld) => (Array.isArray(withheld?.people) ? withheld.people : [])

/**
 * The plan ids the owner keeps off the site: the business name facts while the name is held, every person a held name
 * names and every review that names a held person or was written under a held name.
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @param {{name?: boolean, people?: string[]} | undefined} withheld the needs profile's `withheld`
 * @returns {Set<string>}
 */
export function withheldIdsOf(data, withheld) {
  const out = new Set()
  if (!withheld || typeof withheld !== 'object') return out
  const people = peopleOf(withheld)
  for (const [id, record] of data.byId) {
    if (withheld.name === true && record.what === 'fact' && record.kind === 'business.name') out.add(id)
    if (record.what === 'item' && namesHeld(record.kind, record.source?.fields, people)) out.add(id)
  }
  return out
}

/**
 * The needs profile without what the owner keeps off the site: no business name while it is held, no held person and
 * no review naming one. `composePlan` hands this profile on, so the page writer (which reads every fact and item of the
 * profile it is given) never holds them. Other fact ids stay as they are: a held name drops its whole kind.
 */
export function withoutWithheld(profile) {
  const withheld = profile?.withheld
  if (!withheld || typeof withheld !== 'object') return profile
  const people = peopleOf(withheld)
  const facts = { ...profile.facts }
  if (withheld.name === true) delete facts['business.name']
  const items = Object.fromEntries(
    Object.entries(profile.items ?? {}).map(([kind, values]) => [
      kind,
      (Array.isArray(values) ? values : []).filter((item) => !namesHeld(kind, item?.fields, people))
    ])
  )
  return { ...profile, facts, items }
}
