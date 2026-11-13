// The business's own voice in the needs profile (ticket #594, the old planner's `site.voice {summary, ownWords,
// avoid}`): how the business sounds, the phrases it uses about itself and the words it would not use. The writer reads
// it (`page-writer-request.mjs`). Pure.
//
// The model reads it with the facts, in the same call. Code keeps what can be held:
//   summary   a short description of the tone, at most VOICE_SUMMARY_LIMIT characters;
//   ownWords  phrases the business itself writes: each is kept only when a source's text or captions hold it word for
//             word (case and spacing aside), so the writer never quotes a phrase the business never said;
//   avoid     short words or phrases that would clash with the business.
// The whole key is optional: a profile without a voice is valid and the writer then writes in a plain tone.

export const VOICE_SUMMARY_LIMIT = 200
export const VOICE_PHRASE_LIMIT = 80
export const VOICE_PHRASES_MAX = 8

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const plain = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const phrases = (value) =>
  [
    ...new Set(
      list(value)
        .filter(isText)
        .map((p) => p.trim())
    )
  ].filter((p) => [...p].length <= VOICE_PHRASE_LIMIT)

/** Every text a source publishes: its words and its captions. */
const wordsOfSources = (sources) =>
  sources
    .flatMap((s) => [s.text, ...list(s.captions)])
    .filter(isText)
    .map(plain)

/**
 * The voice of the profile and what was dropped from the model's reading of it.
 * @param {unknown} said the model's `voice` (`{summary?, ownWords?, avoid?}`)
 * @param {object[]} sources the research sources the profile was read from
 * @returns {{voice: {summary?: string, ownWords?: string[], avoid?: string[]} | null, dropped: object[]}}
 */
export function voiceOf(said, sources) {
  const dropped = []
  if (!said || typeof said !== 'object') return { voice: null, dropped }
  const texts = wordsOfSources(sources)
  const ownWords = []
  for (const phrase of phrases(said.ownWords)) {
    if (texts.some((t) => t.includes(plain(phrase)))) ownWords.push(phrase)
    else
      dropped.push({
        from: 'model',
        source: null,
        value: phrase,
        code: 'voice_words_not_found',
        reason: 'no source writes this phrase word for word',
        scope: 'field'
      })
  }
  const summary =
    isText(said.summary) && [...said.summary.trim()].length <= VOICE_SUMMARY_LIMIT
      ? said.summary.trim()
      : null
  const avoid = phrases(said.avoid).slice(0, VOICE_PHRASES_MAX)
  const voice = {
    ...(summary ? { summary } : {}),
    ...(ownWords.length ? { ownWords: ownWords.slice(0, VOICE_PHRASES_MAX) } : {}),
    ...(avoid.length ? { avoid } : {})
  }
  return { voice: Object.keys(voice).length ? voice : null, dropped }
}
