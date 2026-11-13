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
import { heldNamesIn, heldSlugsIn } from './held-reviews.mjs'

/** The ref an owner statement passage is named by, in the reading's message and in each item's source. */
export const OWNER_REF = 'owner'
/** The kind of the passage, of every item read from it, of its place profile source and of its brief evidence. */
export const OWNER_STATEMENT_KIND = 'owner-statement'
/** The ref of the place profile source the chat statement is filed under. */
export const OWNER_STATEMENT_SOURCE_REF = 'chat'
/** The longest passage the reading sends, in characters: the cap of every other passage (`business-reading.mjs`). */
export const OWNER_STATEMENT_MAX = 1500
/** The shortest sentence the echo guard compares: shorter ones are everyday phrases, not the owner's copy. */
export const MIN_ECHO_WORDS = 5
/** Why an item was dropped for echoing the owner (`ownerEchoDropped`). */
export const OWNER_ECHO_WHY = 'copies_owner_statement'

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

/** A text reduced to its words: lower case, letters and digits only, single spaces. */
const wordsOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The owner's statement as the reading's passage (pure), or null when it is absent or blank. Every sentence naming a
 * held text (a held person or the held business name, as whole words or in slug form, as `plan-withheld.mjs` matches
 * them) is taken out before anything is sent, so a held name never reaches the model. Cut at `OWNER_STATEMENT_MAX`.
 * @param {string | null | undefined} statement what the owner typed
 * @param {string[]} [held] the held texts (`plan-withheld.mjs` `heldTextsOf`, plus the business name while it is held)
 * @returns {{passage: {ref: string, kind: string, text: string} | null, heldOut: number, cut: boolean}}
 */
export function ownerPassageOf(statement, held = []) {
  if (!isText(statement)) return { passage: null, heldOut: 0, cut: false }
  const names = list(held).filter(isText)
  const sentences = sentencesOf(statement)
  const kept = names.length
    ? sentences.filter((s) => heldNamesIn(s, names).length === 0 && heldSlugsIn(s, names).length === 0)
    : sentences
  const whole = kept.join(' ')
  const text = whole.slice(0, OWNER_STATEMENT_MAX).trim()
  const heldOut = sentences.length - kept.length
  if (!text) return { passage: null, heldOut, cut: false }
  return {
    passage: { ref: OWNER_REF, kind: OWNER_STATEMENT_KIND, text },
    heldOut,
    cut: text.length < whole.length
  }
}

/** The sentences of a text of `MIN_ECHO_WORDS` words or more, as words: what the echo guard looks for. */
export const echoSentencesOf = (text) =>
  isText(text)
    ? sentencesOf(text)
        .map(wordsOf)
        .filter((w) => w.split(' ').length >= MIN_ECHO_WORDS)
    : []

/** The owner's sentences the echo guard looks for, from the passage the reading read. */
export function ownerSentencesOf(sources) {
  const passage = list(sources).find((s) => s?.kind === OWNER_STATEMENT_KIND)
  return passage ? echoSentencesOf(passage.text) : []
}

/** Whether a text holds one of the owner's sentences word for word (case, spacing and punctuation aside). */
export function echoesOwner(text, sentences) {
  if (!isText(text) || !sentences.length) return false
  const words = ` ${wordsOf(text)} `
  return sentences.some((s) => words.includes(` ${s} `))
}

// The copy a reading returns: each group's label, a key message's label, a USP theme's label, line and who.
const COPY_GROUPS = ['services', 'audience', 'team', 'story', 'serviceAreas', 'facts']
const copiesOf = (group, item) =>
  group === 'uspThemes' ? [item?.label, item?.line, item?.who] : [item?.label, item?.role]

/**
 * A reading without what echoes the owner (pure): every item, key message or USP theme whose copy holds one of the
 * owner's sentences of five words or more word for word is dropped, counted in `dropped` and recorded in
 * `ownerEchoDropped` (`{group, label, why}`), as `uspThemesDropped` records a dropped theme. A reading of texts with no
 * owner statement is returned as it is, the same object.
 */
export function withoutOwnerEcho(read, sources) {
  const sentences = ownerSentencesOf(sources)
  if (!read || !sentences.length) return read
  const out = { ...read }
  const dropped = []
  for (const group of [...COPY_GROUPS, 'keyMessages', 'uspThemes']) {
    if (!Array.isArray(read[group])) continue
    out[group] = read[group].filter((item) => {
      const echo = copiesOf(group, item).some((t) => echoesOwner(t, sentences))
      if (echo) dropped.push({ group, label: String(item?.label ?? ''), why: OWNER_ECHO_WHY })
      return !echo
    })
  }
  if (!dropped.length) return read
  if (Array.isArray(read.uspThemes) && !out.uspThemes.length) {
    out.uspThemes = null
    out.uspThemesReason = 'rejected'
  }
  out.dropped = (read.dropped ?? 0) + dropped.length
  out.ownerEchoDropped = [...list(read.ownerEchoDropped), ...dropped]
  return out
}

/**
 * A reading as the brief's copy reads it (pure): the owner's facts stay, the owner's words do not. Story, audience and
 * About facts read from the statement go (the brief says them in the source's own words: the About line, the hero's
 * self description, "in its own words"); a service keeps its name with that name as its quote (a service is described
 * only in the words of its quote); a team member, a service area keeps its label without a quote; no mention, key
 * message quote or USP theme quote of the statement is kept, and a message or theme left without a quote goes.
 */
export function readingWithoutOwnerQuotes(reading) {
  if (!reading || typeof reading !== 'object' || !holdsOwner(reading)) return reading
  const own = (i) => isOwnerStatement(i)
  const noMentions = (i) =>
    Array.isArray(i?.mentions) ? { ...i, mentions: i.mentions.filter((m) => !own(m)) } : i
  const unquoted = (i) => {
    const { quote: _quote, mentions: _mentions, ...rest } = i
    return rest
  }
  const out = { ...reading }
  for (const key of ['story', 'audience', 'facts'])
    if (Array.isArray(reading[key])) out[key] = reading[key].filter((i) => !own(i)).map(noMentions)
  if (Array.isArray(reading.services))
    out.services = reading.services.map((i) => (own(i) ? { ...unquoted(i), quote: i.label } : noMentions(i)))
  for (const key of ['team', 'serviceAreas'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key].map((i) => (own(i) ? unquoted(i) : noMentions(i)))
  for (const key of ['keyMessages', 'uspThemes'])
    if (Array.isArray(reading[key]))
      out[key] = reading[key]
        .map((m) => (Array.isArray(m?.quotes) ? { ...m, quotes: m.quotes.filter((q) => !own(q)) } : m))
        .filter((m) => !Array.isArray(m?.quotes) || m.quotes.length > 0)
  return out
}

/** Whether anything in a reading (an item, a mention, a quote) comes from the owner's statement. */
function holdsOwner(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return false
  if (isOwnerStatement(value)) return true
  return Object.values(value).some((v) => holdsOwner(v, depth + 1))
}
