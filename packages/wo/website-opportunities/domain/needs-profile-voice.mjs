// The business's own voice in the needs profile (ticket #594, the old planner's `site.voice {summary, ownWords,
// avoid}`): how the business sounds, the phrases it uses about itself and the words it would not use. The writer reads
// it (`page-writer-request.mjs`). Pure.
//
// The model reads it with the facts, in the same call. Code keeps what can be held:
//   summary   a short description of the tone, at most VOICE_SUMMARY_LIMIT characters;
//   ownWords  phrases the business itself writes: each is kept only when a source's text or captions hold it word for
//             word, whole words (case and spacing aside), and kept as the source writes it, so the writer never quotes
//             a phrase the business never said;
//   avoid     short words or phrases that would clash with the business; a phrase the business's own data uses (its
//             name, a fact, an item) is dropped, so copy may still say what the business is.
// Whatever is not kept (a phrase no source says, one too long, past the count, a summary too long, a part that is not
// a list) is recorded in `dropped`.
// The whole key is optional: a profile without a voice is valid and the writer then writes in a plain tone.

export const VOICE_SUMMARY_LIMIT = 200
export const VOICE_PHRASE_LIMIT = 80
export const VOICE_PHRASES_MAX = 8

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A phrase found whole words, case and spacing aside: `rackets up` in "music on, Rackets up!" */
const phraseIn = (phrase, text) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(phrase.normalize('NFKC').trim()).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`,
    'iu'
  ).exec(text.normalize('NFKC').replace(/\s+/g, ' '))

/** Every text a source publishes: its words and its captions. */
const wordsOfSources = (sources) =>
  list(sources)
    .flatMap((s) => [s?.text, ...list(s?.captions)])
    .filter(isText)

const drop = (value, code, reason) => ({ from: 'model', source: null, value, code, reason, scope: 'field' })

/** The phrases of a list the model gave: texts only, each once, none over the length limit (those dropped). */
function phrasesOf(value, name, dropped) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    dropped.push(drop(value, 'voice_not_a_list', `voice.${name} is not a list of phrases`))
    return []
  }
  const kept = []
  for (const phrase of new Set(value.filter(isText).map((p) => p.trim()))) {
    if ([...phrase].length > VOICE_PHRASE_LIMIT)
      dropped.push(drop(phrase, 'voice_phrase_too_long', `longer than ${VOICE_PHRASE_LIMIT} characters`))
    else kept.push(phrase)
  }
  for (const phrase of kept.slice(VOICE_PHRASES_MAX))
    dropped.push(drop(phrase, 'voice_phrases_over_max', `voice.${name} keeps ${VOICE_PHRASES_MAX} phrases`))
  return kept.slice(0, VOICE_PHRASES_MAX)
}

/**
 * The voice of the profile and what was dropped from the model's reading of it.
 * @param {unknown} said the model's `voice` (`{summary?, ownWords?, avoid?}`)
 * @param {object[]} sources the research sources the profile was read from
 * @param {{facts?: object, items?: object}} [options] the profile's merged facts and items: a phrase the business's
 *   own data uses (its name included) is never a phrase to avoid, so such an avoid phrase is dropped
 * @returns {{voice: {summary?: string, ownWords?: string[], avoid?: string[]} | null, dropped: object[]}}
 */
export function voiceOf(said, sources, { facts = {}, items = {} } = {}) {
  const dropped = []
  if (!said || typeof said !== 'object') return { voice: null, dropped }
  // 🔒 The owner's chat statement (origin `answer`, D46) is never a phrase the writer quotes: own words come from the
  // business's published texts only.
  const texts = wordsOfSources((Array.isArray(sources) ? sources : []).filter((s) => s?.origin !== 'answer'))
  // Own words keep the casing the source writes them in, found on word boundaries.
  const ownWords = []
  for (const phrase of phrasesOf(said.ownWords, 'ownWords', dropped)) {
    const found = texts.map((t) => phraseIn(phrase, t)).find(Boolean)
    if (found) ownWords.push(found[0])
    else dropped.push(drop(phrase, 'voice_words_not_found', 'no source writes this phrase word for word'))
  }
  let summary = null
  if (isText(said.summary) && [...said.summary.trim()].length <= VOICE_SUMMARY_LIMIT)
    summary = said.summary.trim()
  else if (said.summary !== undefined)
    dropped.push(
      drop(said.summary, 'voice_summary_unusable', `not a text of at most ${VOICE_SUMMARY_LIMIT} characters`)
    )
  const values = [
    ...Object.values(facts)
      .flat()
      .map((f) => f?.value),
    ...Object.values(items)
      .flat()
      .flatMap((i) => Object.values(i?.fields ?? {}).map((f) => f?.value))
  ].filter(isText)
  const avoid = []
  for (const phrase of phrasesOf(said.avoid, 'avoid', dropped)) {
    if (values.some((v) => phraseIn(phrase, v)))
      dropped.push(drop(phrase, 'voice_avoid_in_business', "the business's own data uses this phrase"))
    else avoid.push(phrase)
  }
  const voice = {
    ...(summary ? { summary } : {}),
    ...(ownWords.length ? { ownWords: [...new Set(ownWords)] } : {}),
    ...(avoid.length ? { avoid } : {})
  }
  return { voice: Object.keys(voice).length ? voice : null, dropped }
}
