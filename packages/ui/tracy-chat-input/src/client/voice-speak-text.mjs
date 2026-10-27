/**
 * What a voice conversation says of Tracy's words (`voice-mode.mjs`): the chat shows the reply as
 * written, the voice reads its start as speech. Markdown marks, code, links' addresses, pictures and
 * tables are not words anyone wants read out; list items become sentences; a long reply is cut at a
 * sentence, and the cut is said ("The rest is in the chat.") rather than hidden.
 *
 * WHY THE START OF THE REPLY. Tracy's replies open with what was done (the plain-words rule of
 * `tracy-site-tools`); the details that follow are for reading. The door caps one reading
 * (`apps/tracy-web/src/lib/speech.js` `SPEAK_LIMITS.maxChars`), and the chat box asks for no more.
 *
 * Also here: whether words the microphone heard are Tracy's own voice coming back through the
 * speakers ({@link isEcho}) — the browser's echo cancelling is not counted on.
 *
 * Kept free of the page so `test/voice-speak-text.test.mjs` can hold it.
 */

const SENTENCE_END = /[.!?…。！？]$/u

/**
 * Markdown as plain speech.
 * @param {unknown} markdown
 * @returns {string}
 */
export function plainSpoken(markdown) {
  let text = typeof markdown === 'string' ? markdown : ''
  text = text
    .replace(/```[\s\S]*?(?:```|$)/g, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
  const lines = text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*\|.*\|\s*$/, '')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
        .replace(/(\*\*|__|\*|~~)(?=\S)(.*?\S)\1/g, '$2')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line !== '' && /[\p{L}\p{N}]/u.test(line))
  // A line with no end mark (a list item, a heading) is a sentence of its own when read out.
  return lines
    .map((line, i) => (i < lines.length - 1 && !SENTENCE_END.test(line) ? `${line}.` : line))
    .join(' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}

/**
 * The sentences of a text, in order.
 * @param {string} text
 * @returns {string[]}
 */
export function sentencesOf(text) {
  const Segmenter = /** @type {any} */ (Intl).Segmenter
  if (typeof Segmenter === 'function') {
    const parts = [...new Segmenter(undefined, { granularity: 'sentence' }).segment(text)]
      .map((part) => String(part.segment).trim())
      .filter(Boolean)
    if (parts.length > 0) return parts
  }
  return text.split(/(?<=[.!?…。！？])\s+/u).filter(Boolean)
}

/**
 * At most `max` characters of `text`: whole sentences while they fit, else the first one cut at a word.
 * @param {string} text
 * @param {number} max
 * @returns {{ said: string, cut: boolean }}
 */
function fit(text, max) {
  if ([...text].length <= max) return { said: text, cut: false }
  let said = ''
  for (const sentence of sentencesOf(text)) {
    const next = said === '' ? sentence : `${said} ${sentence}`
    if ([...next].length > max) break
    said = next
  }
  if (said === '') {
    const chars = [...text].slice(0, Math.max(1, max - 1)).join('')
    const atWord = chars.replace(/\s+\S*$/u, '')
    said = `${atWord === '' ? chars : atWord}…`
  }
  return { said, cut: true }
}

/** The longest closing question of a reply read after its cut start. */
export const QUESTION_CHARS = 200

/** An opening paragraph shorter than this (a heading, "Done.") is read with the next one. */
export const OPENING_CHARS = 60

/**
 * The most words of an opening read out (council 17/10/2026: a turn in Voice is asked to open in at
 * most 40, and on the stand one opened in 60; a cap in code, not only in the prompt). Whole sentences
 * only — never cut inside one; past it, the next sentence stays in the chat.
 */
export const SPOKEN_WORDS = 45

/**
 * The sentences of `opening` while they fit {@link SPOKEN_WORDS}: the first always, and the next one
 * too while what is kept is shorter than {@link OPENING_CHARS} ("Xong rồi." says nothing alone).
 * @param {string} opening
 * @returns {{ said: string, cut: boolean }}
 */
function withinWords(opening) {
  const words = (/** @type {string} */ text) => text.split(/\s+/u).filter(Boolean).length
  const sentences = sentencesOf(opening)
  let said = ''
  let kept = 0
  for (const sentence of sentences) {
    const next = said === '' ? sentence : `${said} ${sentence}`
    if (said !== '' && [...said].length >= OPENING_CHARS && words(next) > SPOKEN_WORDS) break
    said = next
    kept += 1
  }
  return kept < sentences.length ? { said, cut: true } : { said: opening, cut: false }
}

/**
 * What the voice says of a reply: its OPENING — the first paragraph, which a turn in Voice is asked to
 * write for the ear (`tracy-site-tools` `voice-reply.mjs`), with the next one too while it is only a
 * heading — at most {@link SPOKEN_WORDS} words in whole sentences and `max` characters, then `rest`
 * when more is left in the chat. A reply that ends by
 * asking the person something has that question read last, unless the opening already asks.
 * @param {unknown} markdown - the reply as written
 * @param {number} max - the longest reading the door takes
 * @param {string} [rest] - said when more is left ("The rest is in the chat.")
 * @returns {string} '' when the reply has no words to say
 */
export function spokenReply(markdown, max, rest = '') {
  const text = typeof markdown === 'string' ? markdown : ''
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => plainSpoken(part))
    .filter((part) => part !== '')
  if (paragraphs.length === 0) return ''
  let opening = ''
  let used = 0
  for (const part of paragraphs) {
    // A heading has no full stop: given one, so it is not read run into the next sentence.
    opening = opening === '' ? part : `${/[.!?…。！？:;]$/u.test(opening) ? opening : `${opening}.`} ${part}`
    used += 1
    if ([...opening].length >= OPENING_CHARS) break
  }
  const brief = withinWords(opening)
  const more = used < paragraphs.length || brief.cut
  const room = rest === '' ? max : max - [...rest].length - 1
  const { said, cut } = fit(brief.said, Math.max(1, more ? room : rest === '' ? max : room))
  if (!cut && !more) return said
  // A reply that ends by asking the person something: the question is read too, last, so the person
  // knows Tracy waits on them — cut off with "the rest", it was never heard.
  const last = sentencesOf(/** @type {string} */ (paragraphs.at(-1))).at(-1) ?? ''
  const asks =
    /[?？]$/u.test(last) && [...last].length <= QUESTION_CHARS && !said.includes(last) && !/[?？]/u.test(said)
  if (asks) {
    const before = fit(brief.said, Math.max(1, room - [...last].length - 1)).said
    return [before, rest, last].filter((part) => part !== '').join(' ')
  }
  return rest !== '' ? `${said} ${rest}` : said
}

/**
 * The question a reply ends on ("Bạn muốn màu nào?"), as it is read; '' when it ends on none.
 * @param {unknown} markdown
 * @returns {string}
 */
export function closingQuestion(markdown) {
  const text = typeof markdown === 'string' ? markdown : ''
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => plainSpoken(part))
    .filter((part) => part !== '')
  const last = sentencesOf(paragraphs.at(-1) ?? '').at(-1) ?? ''
  return /[?？]$/u.test(last) && [...last].length <= QUESTION_CHARS ? last : ''
}

/**
 * The first sentence of what Tracy wrote while working ("I'll look at the home page first."), at
 * most `max` characters.
 * @param {unknown} markdown
 * @param {number} [max]
 * @returns {string}
 */
export function firstSentence(markdown, max = 160) {
  const plain = plainSpoken(markdown)
  if (plain === '') return ''
  const first = sentencesOf(plain)[0] ?? plain
  return fit(first, max).said
}

/** A word as compared across what was said and what was heard: lower case, no marks, no punctuation. @param {string} word */
const plainWord = (word) =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
/**
 * What is compared: a word, or one Chinese character — Chinese writes no spaces, so a whole sentence
 * was one "word" and Tracy's own Chinese line coming back was never taken for an echo.
 */
const UNIT = /\p{Script=Han}|[^\s\p{Script=Han}]+/gu
/**
 * The units of a text, where each starts in it, and how much of a word each is (a Chinese character
 * about half of one).
 * @param {unknown} text
 * @returns {{ plain: string, at: number, weight: number }[]}
 */
const unitsOf = (text) => {
  const units = []
  for (const match of String(text ?? '').matchAll(UNIT)) {
    const plain = plainWord(match[0])
    if (plain !== '')
      units.push({ plain, at: match.index ?? 0, weight: /\p{Script=Han}/u.test(match[0]) ? 0.5 : 1 })
  }
  return units
}
/** @param {unknown} text */
const wordsOf = (text) => unitsOf(text).map((unit) => unit.plain)
/** How many words the first `count` units make. @param {{ weight: number }[]} units @param {number} count */
const weightOf = (units, count) => units.slice(0, count).reduce((sum, unit) => sum + unit.weight, 0)

/**
 * The longest run of `words`, from its start or anywhere in it, that is a run of `line` in order.
 * @param {string[]} words @param {string[]} line @param {boolean} fromStart
 */
function longestRun(words, line, fromStart) {
  let best = 0
  const firsts = fromStart ? [0] : words.map((_word, i) => i)
  for (const i of firsts)
    for (let start = 0; start < line.length; start += 1) {
      let k = 0
      while (i + k < words.length && start + k < line.length && words[i + k] === line[start + k]) k += 1
      if (k > best) best = k
    }
  return best
}

/**
 * Whether words the microphone heard are Tracy's voice coming back through the speakers: two words or
 * more, four in five of them one run of a line just said, in its order. Words merely shared with the
 * line ("đã", "the") are not an echo: measured 16/10/2026, a Vietnamese request spoken over Tracy
 * shared most of its small words with Tracy's line. In Chinese, four characters make the two words: a
 * choice said back ("红色") is the person choosing.
 * @param {string} heard
 * @param {readonly string[]} said - the lines read out lately
 * @returns {boolean}
 */
export function isEcho(heard, said) {
  const units = unitsOf(heard)
  if (weightOf(units, units.length) < 2) return false
  const words = units.map((unit) => unit.plain)
  return said.some((line) => longestRun(words, wordsOf(line), false) / words.length >= 0.8)
}

/**
 * Whether the words heard are the last word, or the last words, of a line just said, case and marks
 * aside: Tracy's "…yes or no." coming back as "no" or "yes or no". Too short for {@link isEcho}, and
 * enough to answer a confirmation card: such words are never taken as its answer (`voice-mode.mjs`).
 * @param {string} heard
 * @param {readonly string[]} said - the lines read out lately
 * @returns {boolean}
 */
export function endsLine(heard, said) {
  const words = wordsOf(heard)
  if (words.length === 0) return false
  return said.some((line) => {
    const last = wordsOf(line).slice(-words.length)
    return last.length === words.length && last.every((word, i) => word === words[i])
  })
}

/**
 * The person's words of a phrase heard while Tracy talked: a run of three words or more at its start
 * that is a run of a line just said is Tracy's voice coming back, and is cut off; a phrase that is
 * mostly a line just said is nothing (`isEcho`). A word or two the person shares with Tracy's line is
 * kept — only a run that long, in the line's own order, is taken for an echo.
 * @param {string} heard
 * @param {readonly string[]} said - the lines Tracy is saying or just said
 * @returns {string}
 */
export function withoutEcho(heard, said) {
  const text = String(heard ?? '').trim()
  if (text === '' || said.length === 0) return text
  if (isEcho(text, said)) return ''
  const units = unitsOf(text)
  const words = units.map((unit) => unit.plain)
  const cut = Math.max(0, ...said.map((line) => longestRun(words, wordsOf(line), true)))
  if (cut === 0 || weightOf(units, cut) < 3) return text
  return cut >= units.length ? '' : text.slice(/** @type {{ at: number }} */ (units[cut]).at).trim()
}
