/**
 * The language a person wrote a message in, as a short code — or '' when not sure — and a code's
 * English name.
 *
 * WHY IN @tracy/core. Two plugins read it: `tracy-chat-input` tags each comment block with it
 * (`lang="en"`, F4, 29/09), and `tracy-site-tools` names the reply's language on every turn a person
 * speaks (30/09: an English conversation on a WordPress stand was answered in Chinese twice, the
 * blocks tagged `lang="en"`, because no line on the turn NAMED the language). The algorithm was the
 * chat input's `comment-language.mjs`, moved here byte for byte; that copy is gone (30/09) and the
 * chat input imports this one (`comment-turn.mjs`), so the tag on a block and the language the turn
 * rule names can never be read two ways.
 *
 * WHAT IT READS, AND WHY SO LITTLE. No dictionary, no dependency — only what a script says for itself:
 * - Vietnamese: words carrying a letter only Vietnamese uses among Latin languages (`ă đ ơ ư ĩ ũ` and the
 *   Latin Extended Additional block U+1EA0–U+1EF9). `à é ê ô` alone are shared with French and
 *   Portuguese, so they count for nothing.
 * - English: common English function and request words, at least two, and no accented Latin letter
 *   that Vietnamese does not explain (`é ö ß ñ …` mean another Latin language).
 * - Dutch: a small set of common Dutch words, so shared English words such as "is" and "in" do not
 *   make a Dutch sentence look English. Dutch only wins while its words OUTNUMBER the signs of another
 *   Latin language (below): "kan", "voor" and "pagina" are Dutch and also Norwegian, Danish, Swedish,
 *   Italian, so a Norwegian request ("Kan du gjøre menyen horisontal?") was read as Dutch and the model
 *   was told "Reply in Dutch" (22/10/2026, measured: 8 of 42 sentences of 12 other languages).
 * - Another Latin language: a letter Dutch does not use (`æ ø å ä ö ß ñ ç …`) or a function word of the
 *   Nordic, German, French, Spanish, Portuguese or Italian. Never named — only counted against Dutch, so
 *   an unknown language reads '' ("reply in the language of the latest message") and is never mis-named.
 * - Chinese / Japanese / Korean: Han characters (a run of n counts as ⌈n/2⌉ words), kana (Japanese as
 *   soon as there is any), Hangul runs.
 * - Russian / Ukrainian: Cyrillic words, named only by a letter one of them has and the other lacks.
 * Words in double or typographic quotes are left out first: a request often quotes the page or the
 * replacement text in another language. The language with the most words wins; a tie, or nothing
 * counted, is ''. A wrong code would be followed as truth; '' leaves the reader to read the words.
 */

const QUOTED = /"[^"\n]*"|“[^”\n]*”|„[^“”\n]*[“”]|«[^»\n]*»|「[^」\n]*」|『[^』\n]*』/g

/** A letter only Vietnamese uses among the Latin languages (NFC). */
const VI_LETTER = /[ăđơưĩũĂĐƠƯĨŨẠ-ỹ]/u
/** Accented Latin letters in general (NFC): any of them without a Vietnamese word means another language. */
const LATIN_ACCENT = /[À-ÿĀ-ɏḀ-ỿ]/u
/** Letters Dutch does not use (it takes `é è ë ï ó ü` only in loanwords); another Latin language owns them. */
const NON_DUTCH_LETTER = /[æøåäößñçãõąęłśżźćńőűğşı]/iu

const HAN = /\p{Script=Han}+/gu
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]+/gu
const HANGUL = /\p{Script=Hangul}+/gu
const CYRILLIC_WORD = /\p{Script=Cyrillic}+/gu

/** English words a short request is made of; two of them make a comment English. */
const EN_WORDS = new Set(
  (
    'the this that these those a an to of in on at for with and or but is are was be it its ' +
    'make change changes please should what which why how can could would do does not no yes keep ' +
    'want still from into here there instead i we you my our your me just only go answer nothing ' +
    'all ask add remove replace use set put move text button title heading label image picture ' +
    'color colour font size bigger smaller larger more less same one two say says read reads show'
  ).split(' ')
)
/** Common Dutch words that distinguish a request from English. */
const NL_WORDS = new Set(
  (
    'wat mijn hoeveel staan hoofdmenu het deze dit geen graag kunt kan voor zijn op ' +
    'hoe waarom welke pagina vandaag heb heeft naar nog ook wel niet'
  ).split(' ')
)

/**
 * Function words of the Latin languages Dutch is most often confused with, each one absent from Dutch
 * and from English (a word shared with either is left out: "per", "come", "no", "die", "wie", "er", and the
 * Dutch "je", "les", "pas", "mes", "los", "las", "ma"). `test/language.test.mjs` holds that no word of this list is
 * a word of NL_WORDS or EN_WORDS, and that real Dutch with those short words still reads as Dutch.
 * They are NOT a dictionary of those languages and name none: they only say "this is not Dutch".
 */
// No accented word here: `check-language` reads an accented letter in a string as Vietnamese, and the accent is
// already counted by NON_DUTCH_LETTER above (an umlaut or tilde makes a word "not Dutch" on its own).
const OTHER_LATIN_WORDS = new Set(
  // Norwegian, Danish, Swedish
  (
    'ikke inte jeg jag og och til till med som att hva vad hvordan hur vil vill gerne du det ' +
    // German
    'ich nicht und kannst mit auf zu das ein eine bitte ' +
    // French
    'tu le la une est pour avec sur peux voudrais du que qui ' +
    // Spanish, Portuguese, Italian
    'el una para con por quiero puedes pode quero uma il di nel puoi vorrei mio'
  ).split(' ')
)

/**
 * How many words of each language a message holds, as the reading below counts them: the scores
 * `messageLanguage` decides on, for a caller that needs the mix and not only the winner (the reply
 * language of a chat, `chatReplyLanguage`). Russian and Ukrainian share one `cyrillic` count.
 * @param {unknown} text
 * @returns {{ en: number, nl: number, vi: number, zh: number, ja: number, ko: number, cyrillic: number, cyrillicWords: string[] }}
 */
export function languageScores(text) {
  const none = { en: 0, nl: 0, vi: 0, zh: 0, ja: 0, ko: 0, cyrillic: 0, cyrillicWords: [] }
  if (typeof text !== 'string') return none
  const words = text.normalize('NFC').replace(QUOTED, ' ')
  const latin = words.match(/[\p{Script=Latin}'’]+/gu) ?? []
  const vi = latin.filter((word) => VI_LETTER.test(word)).length
  const foreignAccent = vi === 0 && latin.some((word) => LATIN_ACCENT.test(word))
  const enHits = latin.filter((word) => EN_WORDS.has(word.toLowerCase())).length
  const en = foreignAccent || enHits < 2 ? 0 : enHits
  const dutchHits = latin.filter((word) => NL_WORDS.has(word.toLowerCase())).length
  // Another Latin language's own letters and function words. A Vietnamese message has none to count:
  // its accents are explained by the `vi` letters above.
  const other =
    vi === 0
      ? latin.filter((word) => NON_DUTCH_LETTER.test(word) || OTHER_LATIN_WORDS.has(word.toLowerCase()))
          .length
      : 0
  const nl = dutchHits > other ? dutchHits : 0
  const hanWords = (words.match(HAN) ?? []).reduce(
    (sum, run) => sum + Math.ceil(Array.from(run).length / 2),
    0
  )
  const kana = (words.match(KANA) ?? []).reduce((sum, run) => sum + Math.ceil(Array.from(run).length / 2), 0)
  const ko = (words.match(HANGUL) ?? []).length
  const cyrillicWords = words.match(CYRILLIC_WORD) ?? []
  // Kana makes the Han characters beside it Japanese.
  return {
    ...none,
    en,
    nl,
    vi,
    [kana > 0 ? 'ja' : 'zh']: hanWords + kana,
    ko,
    cyrillic: cyrillicWords.length,
    cyrillicWords
  }
}

/**
 * @param {unknown} text - one message's (or one comment's) words, as the person wrote them.
 * @returns {'' | 'en' | 'nl' | 'vi' | 'zh' | 'ja' | 'ko' | 'ru' | 'uk'}
 */
export function messageLanguage(text) {
  const counted = languageScores(text)
  /** @type {[string, number][]} */
  const scores = [
    ['en', counted.en],
    ['nl', counted.nl],
    ['vi', counted.vi],
    [counted.ja > 0 ? 'ja' : 'zh', counted.ja + counted.zh],
    ['ko', counted.ko],
    ['cyrillic', counted.cyrillic]
  ]
  scores.sort((a, b) => b[1] - a[1])
  const [[best, top], [, second]] = scores
  if (top === 0 || top === second) return ''
  if (best !== 'cyrillic') return /** @type {'en' | 'nl' | 'vi' | 'zh' | 'ja' | 'ko'} */ (best)
  const all = counted.cyrillicWords.join(' ')
  const ru = /[ыэъёЫЭЪЁ]/u.test(all)
  const uk = /[іїєґІЇЄҐ]/u.test(all)
  return ru === uk ? '' : ru ? 'ru' : 'uk'
}

/**
 * Main languages written in letters or a script that no other language read here uses: one word of
 * theirs (outside quotes) is plainly theirs. Vietnamese is counted only by its own letters, so it is
 * always under-counted beside English (`Làm cho cái hero to hơn` counts one word): a share would
 * read a half-Vietnamese request as English.
 */
const OWN_LETTERS = new Set(['vi', 'zh', 'ja', 'ko', 'ru', 'uk'])

/**
 * How many of a message's counted words are in `main`, a language of {@link OWN_LETTERS}.
 * @param {ReturnType<typeof languageScores>} counted
 * @param {string} main
 * @returns {number}
 */
function ownWords(counted, main) {
  switch (main) {
    case 'vi':
      return counted.vi
    case 'ko':
      return counted.ko
    case 'zh':
      return counted.zh
    // Kanji alone is written in Japanese too.
    case 'ja':
      return counted.ja + counted.zh
    default:
      return counted.cyrillic
  }
}

/**
 * The language to reply in, for a chat whose main language is `main` (the language of its first
 * clear message, David 15/10/2026): the main language unless the latest message is ENTIRELY in
 * another. A message read as unsure, or one that still holds the main language — a word in its own
 * letters for Vietnamese, Chinese, Japanese, Korean, Russian or Ukrainian; a third of the counted
 * words for English or Dutch, which share short words — keeps it: a Vietnamese request with an
 * English clause, an English one with a Vietnamese phrase. A message plainly in another language
 * switches, for that turn. Quoted words never count (`languageScores`): a label or a name in quotes
 * is the page's, not the person's. Russian and Ukrainian are told apart by their letters alone, so
 * between the two the message's own reading decides. No main language yet: the message's reading.
 * @param {unknown} latest - the latest message's words
 * @param {string} main - the chat's main language code, or ''
 * @returns {'' | 'en' | 'nl' | 'vi' | 'zh' | 'ja' | 'ko' | 'ru' | 'uk'}
 */
export function chatReplyLanguage(latest, main) {
  const read = messageLanguage(latest)
  if (!main) return read
  const kept = /** @type {'en' | 'nl' | 'vi' | 'zh' | 'ja' | 'ko' | 'ru' | 'uk'} */ (main)
  if (read === '' || read === main) return kept
  const cyrillic = new Set(['ru', 'uk'])
  if (cyrillic.has(main) && cyrillic.has(read)) return read
  const counted = languageScores(latest)
  if (OWN_LETTERS.has(main)) return ownWords(counted, main) > 0 ? kept : read
  return holdsAThird(counted, main) ? kept : read
}

/**
 * English and Dutch share short words ("is", "in", "op"): the main one keeps a message only while it
 * holds a third of the counted words (a Dutch question with "is" and "items" in it is Dutch).
 * @param {ReturnType<typeof languageScores>} counted
 * @param {string} main
 * @returns {boolean}
 */
function holdsAThird(counted, main) {
  const total = counted.en + counted.nl + counted.vi + counted.zh + counted.ja + counted.ko + counted.cyrillic
  const mine = main === 'en' ? counted.en : main === 'nl' ? counted.nl : 0
  return total > 0 && 3 * mine >= total
}

/** The names the reading above can answer, fixed so no ICU build changes them. */
const NAMES = Object.freeze({
  en: 'English',
  nl: 'Dutch',
  vi: 'Vietnamese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  uk: 'Ukrainian'
})

/**
 * A language code's English name — `en` → English, `pt_BR` → Portuguese (the region is dropped: the
 * reply's language is the point, not its spelling) — or '' for anything that is not a code.
 * @param {unknown} code - a BCP 47 tag or a WordPress-style locale.
 * @returns {string}
 */
export function languageName(code) {
  if (typeof code !== 'string') return ''
  const base = code.trim().split(/[-_]/)[0].toLowerCase()
  if (!/^[a-z]{2,3}$/.test(base)) return ''
  if (Object.hasOwn(NAMES, base)) return NAMES[/** @type {keyof typeof NAMES} */ (base)]
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(base)
    return typeof name === 'string' ? name : ''
  } catch {
    return ''
  }
}
