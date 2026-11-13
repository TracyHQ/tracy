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

const valueOf = (record, role) => record?.source?.fields?.[role]?.value

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
  const people = Array.isArray(withheld.people) ? withheld.people : []
  const names = (text) => people.length > 0 && heldNamesIn(text, people).length > 0
  for (const [id, record] of data.byId) {
    if (withheld.name === true && record.what === 'fact' && record.kind === 'business.name') out.add(id)
    if (record.what !== 'item') continue
    if (record.kind === 'person' && names(valueOf(record, 'person.name'))) out.add(id)
    if (
      record.kind === 'quote' &&
      (names(valueOf(record, 'quote.text')) || names(valueOf(record, 'quote.author_name')))
    )
      out.add(id)
  }
  return out
}
