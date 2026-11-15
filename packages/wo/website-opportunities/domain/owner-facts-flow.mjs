// The owner's facts on their way from the brief to the writer (decision D46, #609): what the owner typed in the build
// chat is a source, its facts are true and must reach the site, its wording never. The reading keeps a fact it could
// not keep as a name or a copy field (a service named by a whole sentence of the owner, a story line) as one of
// `reading.ownerFacts` (`owner-facts.mjs`); this module carries those facts on:
//   brief     `brief.reading.ownerFacts`, kind `owner-fact`; and kind `owner-tagline` with its `value`: the tagline
//             the owner marks as theirs, the one wording shown as typed (an older brief's tagline without a value
//             still waits for a product decision and is set aside with that reason); `brief.reading.ownerValues`, the
//             contact values the owner typed (`owner-values.mjs`)
//   research  the facts ride on the source `owner-statement` as `ownerFacts: [{id, group, text}]` (`researchOf`), its
//             tagline as `ownerTagline: {id, value}` and its values as fields; the needs profile request never reads
//             them, so its model call is unchanged
//   profile   `profile.ownerFacts` (`needsProfileOf`), present only when there is one
//   plan data `data.ownerFacts` (`planDataOf`), present only when there is one; never a plan fact or item, so the plan
//             composer's request and the plan's Contract B shape are unchanged
// At every step a fact that names a held text is dropped, in every plain form of a held person's name
// (`heldPersonFormsOf`: the full name, the first name alone, `First L`, `F Last`) and of the held business name: the
// research and the profile record that it was set aside, never its text. Pure.
import { heldPersonFormsOf } from './held-person-forms.mjs'
import { heldPeopleOf } from './held-reviews.mjs'
import { nameHeldOf } from './held-name.mjs'
import { OWNER_FACT_KIND, OWNER_TAGLINE_KIND, OWNER_TAGLINE_REASON } from './owner-facts.mjs'
import { OWNER_VALUE_KINDS } from './owner-values.mjs'
import { heldTextsOf, namesHeldInAnyForm } from './plan-withheld.mjs'

/** The research source the owner's chat statement is filed under (`needs-research.mjs`). */
export const OWNER_SOURCE_ID = 'owner-statement'
/** Why a fact naming a held text is set aside (never its text). */
export const OWNER_FACT_HELD_REASON = 'it names a text the owner keeps off the site'
/** Why a second tagline the owner marks is set aside: a site has one tagline. */
export const OWNER_TAGLINE_SECOND_REASON = 'a second tagline: the site shows one'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Every plain form a held text is matched in: each held person's forms (`heldPersonFormsOf`) and each held name. */
export function heldFormsOfTexts(people = [], names = []) {
  const forms = new Set()
  for (const person of list(people).filter(isText)) {
    const { forms: own, firstCased } = heldPersonFormsOf(person)
    for (const form of own) forms.add(form)
    if (firstCased) forms.add(firstCased)
  }
  for (const name of list(names).filter(isText)) forms.add(name.trim())
  return [...forms]
}

/** The held texts a brief gives: its held people and, while its name is held, the name. */
function briefHeldForms(brief) {
  const names = nameHeldOf(brief)
    ? [
        brief?.business?.name,
        ...list(brief?.facts)
          .filter((f) => f?.field === 'name')
          .map((f) => f?.value)
      ]
    : []
  return heldFormsOfTexts(heldPeopleOf(brief?.missing), names.filter(isText))
}

/** Whether a fact's text names one of `forms`. */
const namesHeld = (fact, forms) => forms.length > 0 && namesHeldInAnyForm([fact.text], forms)

/**
 * The owner's facts of a brief for the research, and what was set aside with why.
 * @returns {{facts: Array<{id: string, group: string, text: string}>, setAside: Array<{what: string, id?: string,
 *   reason: string}>}}
 */
export function ownerFactsOfBrief(brief) {
  const forms = briefHeldForms(brief)
  const facts = []
  const setAside = []
  let tagline = null
  for (const f of list(brief?.reading?.ownerFacts)) {
    if (!isText(f?.text)) continue
    const aside = (reason) =>
      setAside.push({ what: 'owner fact', ...(isText(f.id) ? { id: f.id } : {}), reason })
    const held = namesHeld(f, forms) || (isText(f.value) && namesHeld({ text: f.value }, forms))
    if (f.kind === OWNER_TAGLINE_KIND && isText(f.value)) {
      // The owner's own tagline (`owner-tagline.mjs`): its words as typed, one per build.
      if (held) aside(OWNER_FACT_HELD_REASON)
      else if (tagline) aside(OWNER_TAGLINE_SECOND_REASON)
      else tagline = { id: String(f.id), value: f.value.trim() }
    } else if (f.kind !== OWNER_FACT_KIND) aside(f.reason ?? OWNER_TAGLINE_REASON)
    else if (held) aside(OWNER_FACT_HELD_REASON)
    else if (!facts.some((x) => x.id === f.id))
      facts.push({ id: String(f.id), group: String(f.group ?? ''), text: f.text.trim() })
  }
  return { facts, setAside, ...(tagline ? { tagline } : {}) }
}

/**
 * The contact values the owner typed (`brief.reading.ownerValues`, `owner-values.mjs`) for the research: each `{kind,
 * value}` the research files as a field of the source `owner-statement`; a value naming a held text in any plain form
 * is set aside, and so is every value the reading dropped, each with its reason (never the text).
 */
export function ownerValuesOfBrief(brief) {
  const read = brief?.reading?.ownerValues
  if (!read) return { values: [], setAside: [] }
  const forms = briefHeldForms(brief)
  const values = []
  const setAside = list(read.dropped).map((d) => ({ what: 'owner value', kind: d?.kind, reason: d?.reason }))
  for (const v of list(read.values)) {
    if (!OWNER_VALUE_KINDS.includes(v?.kind) || !isText(v?.value)) continue
    if (namesHeld({ text: v.value }, forms))
      setAside.push({ what: 'owner value', kind: v.kind, reason: OWNER_FACT_HELD_REASON })
    else values.push({ kind: v.kind, value: v.value.trim() })
  }
  return { values, setAside }
}

/** The owner's tagline the research sources carry (on the source `owner-statement`), as the profile keeps it. */
export function ownerTaglineOfSources(sources) {
  const t = list(sources).find((s) => s?.id === OWNER_SOURCE_ID)?.ownerTagline
  return isText(t?.id) && isText(t?.value) ? { id: t.id, value: t.value, source: OWNER_SOURCE_ID } : null
}

/** The owner's tagline of a needs profile the plan data carries: none naming a text the profile holds. */
export function ownerTaglineOfProfile(profile) {
  const t = profile?.ownerTagline
  if (!isText(t?.value)) return null
  const withheld = profile?.withheld
  const forms = withheld ? heldFormsOfTexts(list(withheld.people), list(withheld.names)) : []
  const held =
    namesHeld({ text: t.value }, forms) || (withheld && namesHeldInAnyForm([t.value], heldTextsOf(withheld)))
  return held ? null : t
}

/** The owner's facts the research sources carry (on the source `owner-statement`), as the profile keeps them. */
export function ownerFactsOfSources(sources) {
  const owner = list(sources).find((s) => s?.id === OWNER_SOURCE_ID)
  return list(owner?.ownerFacts)
    .filter((f) => isText(f?.id) && isText(f?.text))
    .map((f) => ({ id: f.id, group: String(f.group ?? ''), text: f.text, source: OWNER_SOURCE_ID }))
}

/**
 * The owner's facts of a needs profile the plan data carries: none naming a text the profile holds (its held people
 * and held names, `withWithheld`), in every plain form.
 */
export function ownerFactsOfProfile(profile) {
  const withheld = profile?.withheld
  const forms = withheld ? heldFormsOfTexts(list(withheld.people), list(withheld.names)) : []
  return list(profile?.ownerFacts)
    .filter((f) => isText(f?.id) && isText(f?.text))
    .filter((f) => !namesHeld(f, forms) && !(withheld && namesHeldInAnyForm([f.text], heldTextsOf(withheld))))
    .map(({ id, group, text }) => ({ id, group, text }))
}
