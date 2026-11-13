// No held text reaches the business reading's model (#609, decision D46): what the owner keeps off the site is kept out
// of every passage the reading sends, not only out of the owner's chat statement. Pure.
//   - a held PERSON (or another held name): every sentence of a passage that writes it is taken out, as for the
//     statement (`held-text-match.mjs withoutHeldSentences`, every form it finds); a review written by one goes whole;
//   - the business NAME while it is held: masked with a neutral stand-in (`HELD_NAME_STAND_IN`) wherever it is written,
//     so a bio or a post that names the business still says what it sells. The message's header names the business by
//     the same stand-in. The stand-in is a template placeholder (`content-pool.mjs PLACEHOLDER_RE`), so no quote that
//     holds it stands, and copy that writes it is dropped (`withoutStandIn`): it never reaches the site as a name.
// Without a held text, the passages are returned as they are, the same array: a reading's request is the one it was.
import { heldSpansIn, maskHeld, withoutHeldSentences } from './held-text-match.mjs'
import { COPY_GROUPS, OWNER_STATEMENT_KIND, copyTextsOf } from './owner-statement.mjs'

/** What the reading's message writes for the business name while it is held. */
export const HELD_NAME_STAND_IN = '[business name]'
/** Why an item was dropped for writing the stand-in (`standInDropped`). */
export const STAND_IN_WHY = 'writes_held_name_stand_in'

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The passages (or facts) a reading sends, less what is held (pure, the rules above). The owner's statement is left as
 * `ownerPassageOf` made it (it drops the business name's sentences too). A post whose ref was made of its address and
 * writes a held text there is renamed `post:<network>:held-<n>`, so its ref says nothing held either.
 * @param {{ref: string, kind: string, text: string, author?: string}[]} sources
 * @param {{people?: string[], name?: string | null}} held
 */
export function heldPassagesOf(sources, { people = [], name = null } = {}) {
  const names = list(people).filter(isText)
  const business = isText(name) ? [name] : []
  if (!names.length && !business.length) return sources
  const all = [...names, ...business]
  let renamed = 0
  return list(sources).flatMap((s) => {
    if (s?.kind === OWNER_STATEMENT_KIND) return [s]
    if (isText(s?.author) && heldSpansIn(s.author, names).length) return []
    let text = names.length ? withoutHeldSentences(s.text, names).text : s.text
    if (business.length) text = maskHeld(text, business, HELD_NAME_STAND_IN)
    if (!isText(text)) return []
    const out = { ...s, text }
    if (isText(s.author) && business.length) out.author = maskHeld(s.author, business, HELD_NAME_STAND_IN)
    if (heldSpansIn(s.ref, all).length) {
      renamed += 1
      out.ref = `${String(s.ref).split(':').slice(0, 2).join(':')}:held-${renamed}`
    }
    return [out]
  })
}

const STAND_IN_RE = /business\s+name/iu

/**
 * A reading less every item whose copy writes the stand-in (pure): an item, key message or USP theme whose label,
 * role, line, who or accent says "business name" is dropped and recorded in `standInDropped` (`{group, label, why}`).
 * Read only when the business name was held; nothing to drop, the same object.
 */
export function withoutStandIn(read) {
  if (!read || typeof read !== 'object') return read
  const out = { ...read }
  const dropped = []
  for (const group of [...COPY_GROUPS, 'keyMessages', 'uspThemes']) {
    if (!Array.isArray(read[group])) continue
    out[group] = read[group].filter((item) => {
      const writes = copyTextsOf(group, item).some((t) => STAND_IN_RE.test(t))
      if (writes) dropped.push({ group, label: String(item?.label ?? ''), why: STAND_IN_WHY })
      return !writes
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
