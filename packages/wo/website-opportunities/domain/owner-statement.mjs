// What the business owner typed about the business in the build chat (decision D46, #609): a SOURCE, never copy. Its
// facts are true statements from the owner and the reading may use them, but its sentences are never quoted on the
// site. Pure, no imports beyond the held name matchers, so the reading, the place profile and the brief may all read it.
//
// The exact keys (one name per layer, none shared with an older meaning of "owner"):
//   - the reading's passage: `{ref: 'owner', kind: 'owner-statement', text}` (`OWNER_REF`, `OWNER_STATEMENT_KIND`);
//     an item read from it carries `source: {kind: 'owner-statement', ref: 'owner'}`. Not `kind: 'owner'`: a team
//     member the owner added on the Profile card already carries `source.kind: 'owner'` (`saved-profile-reading.mjs`).
//   - the place profile's source: kind `owner-statement`, ref `chat`. Not `owner`: a fact citing a source of kind
//     `owner` first reads as edited by the owner (`saved-profile.mjs` `OWNER_SOURCE_KINDS`).
//   - the brief's evidence names that source `owner-statement`; the needs profile files it as source id
//     `owner-statement` of origin `answer` ("Your answer", `needs-research.mjs`), distinct from `owner` (the Profile
//     card's typed value, origin `website`).
import { withoutHeldSentences } from './held-text-match.mjs'
import { ownerEchoOf } from './owner-echo.mjs'
import { ownerFactOf, withOwnerFacts, withoutEchoOf } from './owner-echo-fields.mjs'

export { OWNER_ECHO_WHY, withoutEchoOf } from './owner-echo-fields.mjs'

/** The ref an owner statement passage is named by, in the reading's message and in each item's source. */
export const OWNER_REF = 'owner'
/** The kind of the passage, of every item read from it, of its place profile source and of its brief evidence. */
export const OWNER_STATEMENT_KIND = 'owner-statement'
/** The ref of the place profile source the chat statement is filed under. */
export const OWNER_STATEMENT_SOURCE_REF = 'chat'
/** The longest passage the reading sends, in characters: the cap of every other passage (`business-reading.mjs`). */
export const OWNER_STATEMENT_MAX = 1500

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a reading item, quote or passage comes from the owner's statement. */
export const isOwnerStatement = (x) =>
  x?.kind === OWNER_STATEMENT_KIND || x?.source?.kind === OWNER_STATEMENT_KIND

/** The sentences of a text, as written (split after `.`, `!`, `?` or at a line break). */
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * The owner's statement as the reading's passage (pure), or null when it is absent or blank. Every sentence a held
 * text overlaps (a held person or the held business name, in any form `held-text-match.mjs` finds: accents, width,
 * zero width characters, split across a line break or a sentence end, in slug form) is taken out before anything is
 * sent, both halves of a name split over two sentences; so a held name never reaches the model. Cut at
 * `OWNER_STATEMENT_MAX`.
 * @param {string | null | undefined} statement what the owner typed
 * @param {string[]} [held] the held texts (`plan-withheld.mjs` `heldTextsOf`, plus the business name while it is held)
 * @param {{people?: string[]}} [opts] the held people among them: a first name alone is held too
 * @returns {{passage: {ref: string, kind: string, text: string} | null, heldOut: number, cut: boolean}}
 */
export function ownerPassageOf(statement, held = [], { people = [] } = {}) {
  if (!isText(statement)) return { passage: null, heldOut: 0, cut: false }
  const names = list(held).filter(isText)
  const kept = names.length
    ? withoutHeldSentences(statement, names, { people, casedCommon: true })
    : { text: statement, heldOut: 0 }
  const whole = sentencesOf(kept.text).join(' ')
  const text = whole.slice(0, OWNER_STATEMENT_MAX).trim()
  const heldOut = kept.heldOut
  if (!text) return { passage: null, heldOut, cut: false }
  return {
    passage: { ref: OWNER_REF, kind: OWNER_STATEMENT_KIND, text },
    heldOut,
    cut: text.length < whole.length
  }
}

/** What the echo guard compares copy with, from the passage the reading read (`owner-echo.mjs ownerEchoOf`). */
export function ownerEchoOfSources(sources) {
  const passage = list(sources).find((s) => s?.kind === OWNER_STATEMENT_KIND)
  return ownerEchoOf(passage ? [passage.text] : [])
}

/** The groups of a reading whose items carry copy or names: each one's label, and a team member's role. */
export const COPY_GROUPS = Object.freeze(['services', 'audience', 'team', 'story', 'serviceAreas', 'facts'])

/** A reading of texts less what echoes the owner's statement among them (`withoutEchoOf`); none, the same object. */
export const withoutOwnerEcho = (read, sources) => withoutEchoOf(read, ownerEchoOfSources(sources))

/** Every quote of the owner's statement a reading holds: its items', mentions', key messages' and themes' quotes. */
export function ownerQuotesOf(reading, depth = 0) {
  if (!reading || typeof reading !== 'object' || depth > 5) return []
  if (Array.isArray(reading)) return reading.flatMap((x) => ownerQuotesOf(x, depth + 1))
  const own = isOwnerStatement(reading) && isText(reading.quote) ? [reading.quote] : []
  return [
    ...own,
    ...Object.values(reading).flatMap((v) => (v && typeof v === 'object' ? ownerQuotesOf(v, depth + 1) : []))
  ]
}

/**
 * A reading as the brief's copy reads it (pure): the owner's facts arrive, the owner's words do not. A story line or a
 * fact the reading read from the statement goes to `ownerFacts` (the brief says a story line in the source's own words,
 * so the writer gets it as a fact to say in other words); a service, an audience and a service area keep their name
 * with that name as their quote (a name is a fact value, `owner-echo-fields.mjs`); a team member keeps their name
 * without a quote; no mention, key message quote or USP theme
 * quote of the statement is kept, and a message or theme left without a quote goes to `ownerFacts` as well (no USP
 * theme left: `uspThemes: null`, reason `rejected`). Then whatever copy is left is held to the echo guard field by field
 * (`owner-echo-fields.mjs withoutEchoOf`) against every quote of the statement the reading held.
 */
export function readingWithoutOwnerQuotes(reading) {
  if (!reading || typeof reading !== 'object' || !holdsOwner(reading)) return reading
  const echo = ownerEchoOf(ownerQuotesOf(reading))
  const own = (i) => isOwnerStatement(i)
  const facts = []
  const noMentions = (i) =>
    Array.isArray(i?.mentions) ? { ...i, mentions: i.mentions.filter((m) => !own(m)) } : i
  const unquoted = (i) => {
    const { quote: _quote, mentions: _mentions, ...rest } = i
    return rest
  }
  const out = { ...reading }
  for (const key of ['story', 'facts'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key].flatMap((i, n) => {
        if (!own(i)) return [noMentions(i)]
        facts.push(ownerFactOf(key, i, n))
        return []
      })
  for (const key of ['services', 'audience', 'serviceAreas'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key].map((i) => (own(i) ? { ...unquoted(i), quote: i.label } : noMentions(i)))
  for (const key of ['team'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key].map((i) => (own(i) ? unquoted(i) : noMentions(i)))
  for (const key of ['keyMessages', 'uspThemes'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key].flatMap((m, n) => {
        if (!Array.isArray(m?.quotes)) return [m]
        const quotes = m.quotes.filter((q) => !own(q))
        if (quotes.length) return [{ ...m, quotes }]
        facts.push(ownerFactOf(key, m, n))
        return []
      })
  if (Array.isArray(reading.uspThemes) && reading.uspThemes.length && !out.uspThemes.length) {
    out.uspThemes = null
    out.uspThemesReason = 'rejected'
  }
  return withoutEchoOf(withOwnerFacts(out, facts), echo)
}

/** Whether anything in a reading (an item, a mention, a quote) comes from the owner's statement. */
function holdsOwner(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return false
  if (isOwnerStatement(value)) return true
  return Object.values(value).some((v) => holdsOwner(v, depth + 1))
}
