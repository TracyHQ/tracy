// What the owner asked to keep off the site (locked planner rule P2, 2026-11-03; brief decision 21c): a held business
// name and held people. The old chain's shape is carried as it is: the brief holds its name off with a `name` fact
// decided `onSite: false` and goes by a neutral identity (`held-name.mjs`: `nameHeldOf`, `siteNameOf`), and holds its
// people in `missing[]` team values (`held-reviews.mjs`: `heldPeopleOf`; a text names a person when it holds a held
// value as whole words, `heldNamesIn`). The research and the needs profile carry `withheld: {name?: true, siteName?,
// people?: string[]}`. While the name is held the profile's name is the neutral identity, so the header, the text logo
// and the page titles show it, and the held name itself (`withheld.names`, read from the profile before it is replaced)
// is matched as whole words in every value like a held person; without a neutral identity the plan step stops with
// `site_name_missing` (`plan-preflight.mjs`). A fact, an item of any kind or a row
// whose text names a held person is withheld: the model never reads it, the gate refuses it (`withheld_shown`) and the
// plan lists it as left out with a neutral `what` and `WITHHELD_REASON`. Pure.
import { nameHeldOf, siteNameOf } from './held-name.mjs'
import { heldNamesIn, heldPeopleOf } from './held-reviews.mjs'

/** Whether nothing names the site: the business name is held and no neutral identity stands in for it (#593 G4). */
export const siteNameMissing = (withheld) => withheld?.name === true && !withheld.siteName

/** The `site_name_missing` message: the customer is asked for a name the site may show. */
export const SITE_NAME_MISSING_MESSAGE =
  'the business name is kept off the site and nothing else names the site: ask the customer for a name the site may show, then build again'

/** The reason a left out entry gives for data the owner keeps off the site. */
export const WITHHELD_REASON = 'You asked to keep this off the site.'

const list = (value) => (Array.isArray(value) ? value : [])
const peopleOf = (withheld) => list(withheld?.people)
/** The held texts no shown value may name as whole words: the held people and the held business name (#593 G3). */
export const heldTextsOf = (withheld) => [...peopleOf(withheld), ...list(withheld?.names)]

/** The `withheld` part of a research or a needs profile, from a stored brief; `{}` when nothing is held. */
export function withheldOfBrief(brief) {
  const name = nameHeldOf(brief)
  const people = heldPeopleOf(brief?.missing)
  if (!name && people.length === 0) return {}
  const siteName = name ? siteNameOf(brief) : null
  return {
    withheld: {
      ...(name ? { name: true } : {}),
      ...(siteName ? { siteName } : {}),
      ...(people.length ? { people } : {})
    }
  }
}

/** Whether any value (a text, or a list of texts) names a held person. */
export function namesHeld(values, people) {
  if (people.length === 0) return false
  return values.flat(2).some((v) => typeof v === 'string' && heldNamesIn(v, people).length > 0)
}
const fieldValues = (fields) => Object.values(fields ?? {}).map((f) => f?.value)
const recordValues = (record) =>
  record?.what === 'fact' ? [record.entry?.value] : fieldValues(record?.source?.fields)

/** Rows without those whose text names a held person, nested rows included. */
function keptRows(rows, people) {
  return list(rows)
    .filter((row) => !namesHeld(fieldValues(row?.fields), people))
    .map((row) => (row?.rows ? { ...row, rows: keptRows(row.rows, people) } : row))
}

/**
 * A needs profile as the plan step reads it while its research holds something off the site: `withheld` attached, the
 * neutral identity as the business name, no conflict or question about the held name or naming a held person, and no
 * row naming one. A profile with nothing held stays as it is.
 */
export function withWithheld(profile, research) {
  if (!research?.withheld || !profile || typeof profile !== 'object') return profile
  const name = research.withheld.name === true
  // The held business name as the profile read it: a value naming it is withheld like one naming a held person.
  const names = name
    ? list(profile.facts?.['business.name'])
        .map((f) => f?.value)
        .filter((v) => typeof v === 'string' && v.trim() !== '')
    : []
  const withheld = { ...research.withheld, ...(names.length ? { names } : {}) }
  const people = heldTextsOf(withheld)
  const facts = { ...profile.facts }
  if (name && withheld.siteName) {
    const sources = list(facts['business.name']?.[0]?.sources)
    const own = sources.length
      ? sources
      : list(profile.sources)
          .slice(0, 1)
          .map((s) => s.id)
    facts['business.name'] = [{ value: withheld.siteName, sources: own, confidence: 'single-source' }]
  }
  const aboutHeld = (kind, values) => (name && kind === 'business.name') || namesHeld(values, people)
  const conflicts = list(profile.conflicts).filter(
    (c) =>
      !aboutHeld(
        c?.kind,
        list(c?.values).map((v) => v?.value)
      )
  )
  const questions = list(profile.questions).filter(
    (q) => !aboutHeld(q?.fact, [q?.prompt, ...list(q?.choices).map((c) => c?.label)])
  )
  const items = Object.fromEntries(
    Object.entries(profile.items ?? {}).map(([kind, values]) => [
      kind,
      list(values).map((item) => (item?.rows ? { ...item, rows: keptRows(item.rows, people) } : item))
    ])
  )
  const rows = profile.rows ? { rows: keptRows(profile.rows, people) } : {}
  return { ...profile, facts, items, ...rows, conflicts, questions, withheld }
}

/**
 * The plan ids the owner keeps off the site: the business name facts while the name is held with no neutral identity,
 * and every fact and every item (of any kind, by any of its fields) whose text names a held person.
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @param {{name?: boolean, siteName?: string, people?: string[]} | undefined} withheld the needs profile's `withheld`
 * @returns {Set<string>}
 */
export function withheldIdsOf(data, withheld) {
  const out = new Set()
  if (!withheld || typeof withheld !== 'object') return out
  const people = heldTextsOf(withheld)
  for (const [id, record] of data.byId) {
    const nameHeld = withheld.name === true && !withheld.siteName && record.kind === 'business.name'
    const values = recordValues(record)
    if (nameHeld || namesHeld(values, people)) out.add(id)
  }
  return out
}

/** The neutral `what` of a left out entry for withheld data: it never prints the held name. */
export const withheldWhatOf = (record, withheld) =>
  record?.kind === 'business.name'
    ? 'Your business name'
    : record?.kind === 'person'
      ? 'A team member you keep private'
      : namesHeld(recordValues(record), list(withheld?.names))
        ? 'Something that shows the business name you keep private'
        : 'Something that names a person you keep private'

/**
 * The needs profile without what the owner keeps off the site (`withheldIdsOf` over its own facts and items).
 * `composePlan` hands this profile on, so the page writer, which reads every fact and item of the profile it is given,
 * never holds them. A withheld fact drops its whole kind, so the ids of the other facts stay as they are.
 */
export function withoutWithheld(profile) {
  const withheld = profile?.withheld
  if (!withheld || typeof withheld !== 'object') return profile
  const people = heldTextsOf(withheld)
  const facts = Object.fromEntries(
    Object.entries(profile.facts ?? {}).filter(
      ([kind, values]) =>
        !(withheld.name === true && !withheld.siteName && kind === 'business.name') &&
        !namesHeld(
          list(values).map((f) => f?.value),
          people
        )
    )
  )
  const items = Object.fromEntries(
    Object.entries(profile.items ?? {}).map(([kind, values]) => [
      kind,
      list(values).filter((item) => !namesHeld(fieldValues(item?.fields), people))
    ])
  )
  return { ...profile, facts, items }
}
