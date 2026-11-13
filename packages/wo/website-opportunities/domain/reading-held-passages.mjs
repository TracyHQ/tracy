// No held text reaches the business reading's model (#609, decision D46): what the owner keeps off the site is kept out
// of every passage the reading sends, not only out of the owner's chat statement. Pure.
//   - a held PERSON (or another held name): every sentence of a passage that writes it is taken out, as for the
//     statement (`held-text-match.mjs withoutHeldSentences`, every form it finds, a person's first name alone too, and
//     a common word name only where it reads as a name); a review written by one (its author field) goes whole;
//   - the business NAME while it is held: masked with a neutral stand-in (`HELD_NAME_STAND_IN`) wherever it is written,
//     so a bio or a post that names the business still says what it sells. The message's header names the business by
//     the same stand-in. The stand-in is a template placeholder (`content-pool.mjs PLACEHOLDER_RE`), so no quote that
//     holds it stands, and copy that writes it is dropped (`withoutStandIn`): it never reaches the site as a name.
// Without a held text, the passages are returned as they are, the same array: a reading's request is the one it was.
import { heldEntriesOf, heldSpansIn, maskHeld, withoutHeldSentences } from './held-text-match.mjs'
import { COPY_GROUPS, OWNER_STATEMENT_KIND } from './owner-statement.mjs'

/**
 * What the reading's message writes for the business name while it is held: a token no real copy writes ("Business
 * name registration" is a service), so the drop rule below finds it and nothing else.
 */
export const HELD_NAME_STAND_IN = '[business-name-held]'
/** Why an item was dropped for writing the stand-in (`standInDropped`). */
export const STAND_IN_WHY = 'writes_held_name_stand_in'

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The passages (or facts) a reading sends, less what is held (pure, the rules above). The owner's statement is left as
 * `ownerPassageOf` made it (it drops the business name's sentences too). A post whose ref was made of its address and
 * writes a held text there is renamed `post:<network>:held-<n>`, so its ref says nothing held either.
 * @param {{ref: string, kind: string, text: string, author?: string}[]} sources
 * @param {{people?: string[], heldPeople?: string[], name?: string | null}} held `people`: every held text but the
 *   business name; `heldPeople`: those of them that are people, whose first name alone is held too
 */
export function heldPassagesOf(sources, { people = [], heldPeople = [], name = null } = {}) {
  const names = list(people).filter(isText)
  const business = isText(name) ? [name] : []
  if (!names.length && !business.length) return sources
  const persons = heldEntriesOf(names, { people: heldPeople, casedCommon: true })
  const firm = heldEntriesOf(business, { casedCommon: true })
  const all = [...persons, ...firm]
  let renamed = 0
  return list(sources).flatMap((s) => {
    if (s?.kind === OWNER_STATEMENT_KIND) return [s]
    if (isText(s?.author) && heldSpansIn(s.author, null, { entries: persons, asName: true }).length) return []
    let text = persons.length ? withoutHeldSentences(s.text, null, { entries: persons }).text : s.text
    if (firm.length) text = maskHeld(text, null, HELD_NAME_STAND_IN, { entries: firm })
    if (!isText(text)) return []
    const out = { ...s, text }
    if (isText(s.author) && firm.length)
      out.author = maskHeld(s.author, null, HELD_NAME_STAND_IN, { entries: firm, asName: true })
    if (heldSpansIn(s.ref, null, { entries: all, asName: true }).length) {
      renamed += 1
      out.ref = `${String(s.ref).split(':').slice(0, 2).join(':')}:held-${renamed}`
    }
    return [out]
  })
}

// The stand-in, with its brackets or without them (a model may drop them), and nothing a real service is called.
const STAND_IN_RE = /\[?\s*business-name-held\s*\]?/iu

/** Every field of an item the model writes in words: a stand-in in any of them is the held name's place. */
const STAND_IN_FIELDS = Object.freeze(['label', 'role', 'line', 'who', 'accent'])

/**
 * A reading less every item whose copy writes the stand-in (pure): an item, key message or USP theme whose label,
 * role, line, who or accent writes the stand-in is dropped and recorded in `standInDropped` (`{group, field, why}`, never
 * the text).
 * Read only when the business name was held; nothing to drop, the same object.
 */
export function withoutStandIn(read) {
  if (!read || typeof read !== 'object') return read
  const out = { ...read }
  const dropped = []
  for (const group of [...COPY_GROUPS, 'keyMessages', 'uspThemes']) {
    if (!Array.isArray(read[group])) continue
    out[group] = read[group].filter((item) => {
      const field = STAND_IN_FIELDS.find((f) => typeof item?.[f] === 'string' && STAND_IN_RE.test(item[f]))
      if (field) dropped.push({ group, field, why: STAND_IN_WHY })
      return !field
    })
  }
  if (!dropped.length) return read
  if (Array.isArray(read.uspThemes) && read.uspThemes.length && !out.uspThemes.length) {
    out.uspThemes = null
    out.uspThemesReason = 'rejected'
  }
  out.dropped = (read.dropped ?? 0) + dropped.length
  out.standInDropped = dropped
  return out
}
