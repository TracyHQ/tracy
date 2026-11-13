// What tells a held name written in prose from the same letters used as a word (#609, decision D46): the scripts that
// are written without spaces, the given names that are also common English words, and the words around a name that
// mark it as a name (a title, a role, a possessive, another capitalised name part). Pure, no imports: the held text
// matcher (`held-text-match.mjs`) reads it.

/** The scripts written without spaces between words: a name there touches the words around it. By script extensions. */
export const UNSPACED_CLASS =
  '\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Thai}\\p{scx=Lao}\\p{scx=Khmer}\\p{scx=Myanmar}'
export const UNSPACED = new RegExp(`[${UNSPACED_CLASS}]`, 'v')
export const HANGUL = /\p{scx=Hangul}/v
/** A letter or digit of a script written with spaces: what a whole word may not touch. */
export const SPACED_WORD = `[[\\p{L}\\p{N}]--[${UNSPACED_CLASS}]]`
/** The same, less Hangul: a Korean particle written onto a Korean name (`김민지가`) does not hide it. */
export const SPACED_WORD_NOT_HANGUL = `[[\\p{L}\\p{N}]--[${UNSPACED_CLASS}\\p{scx=Hangul}]]`

// Given names that are also common English words: in prose they are a name only by the context rule below.
const COMMON = `will may rose mark bill grace hope joy faith june april august art dawn iris jack ivy lily pat rich sue
ray sky summer autumn amber ruby pearl violet daisy holly robin frank earl gene guy max sandy rusty chase chance drew
grant hunter cliff dale glen lane wade penny candy crystal harmony honey melody storm star river brook heather jasmine
olive poppy sage basil ginger cherry angel king major miles nick norm page rob carol jay jean kit hazel fern reed rocky
dusty duke sunny cash bob dot don gale gay hall hill lad mae marsh noble pip rex roman royal rue saint sol stone tad`
export const COMMON_NAME_WORDS = new Set(COMMON.split(/\s+/u).filter(Boolean))

/** Whether a folded word is a common word as well as a given name. */
export const isCommonNameWord = (folded) => COMMON_NAME_WORDS.has(folded)

const TITLES =
  'mr|mrs|ms|miss|mx|dr|prof|sir|madam|dame|lady|lord|chef|coach|teacher|master|auntie|aunt|uncle|captain|nurse'
const ROLES =
  'owner|co-?owner|founder|co-?founder|teacher|coach|trainer|instructor|chef|baker|cook|florist|therapist|stylist|' +
  'barber|manager|director|host|hostess|guide|tutor|nurse|doctor|dentist|partner|mentor|artist|designer|' +
  'photographer|assistant|receptionist|waiter|waitress|barista|bartender|sommelier|potter|maker|teacher|lead|head|' +
  'colleague|boss|staff member|team member|technician|consultant|advisor|adviser|agent|driver|planner'
const BEFORE_TITLE = new RegExp(`(?:^|[^\\p{L}])(?:${TITLES})\\.?\\s+$`, 'iu')
const BEFORE_ROLE = new RegExp(`(?:^|[^\\p{L}])(?:${ROLES})\\s*[,:]?\\s+$`, 'iu')
const BEFORE_NAME_PART = /\p{Lu}\p{Ll}+\s+$/u
const AFTER_POSSESSIVE = /^(?:['’]s(?![\p{L}])|s['’])/u
const AFTER_NAME_PART = /^\s+\p{Lu}\p{Ll}+/u
const DETERMINER = '(?:our|the|a|an|my|your|their|his|her)\\s+'
const AFTER_ROLE = new RegExp(
  `^(?:\\s*[,(]\\s*|\\s+)(?:(?:is|was|,)\\s+)?(?:${DETERMINER})?(?:\\p{L}+\\s+)?(?:${ROLES})(?![\\p{L}])`,
  'iu'
)

/** Whether the text before `start` begins a sentence: nothing, or a sentence end, a line break or a bullet. */
export function atSentenceStart(text, start) {
  let i = start - 1
  while (i >= 0 && /[ \t"'“‘([«¿¡]/u.test(text[i])) i -= 1
  return i < 0 || /[.!?…。！？\n•*·]/u.test(text[i])
}

/** Whether the words around `[start, end)` mark it as a name: a title, a role, a possessive, another name part. */
export function nameContextAt(text, start, end) {
  const before = text.slice(Math.max(0, start - 40), start)
  const after = text.slice(end, end + 60)
  return (
    BEFORE_TITLE.test(before) ||
    BEFORE_ROLE.test(before) ||
    BEFORE_NAME_PART.test(before) ||
    AFTER_POSSESSIVE.test(after) ||
    AFTER_NAME_PART.test(after) ||
    AFTER_ROLE.test(after)
  )
}

/** Whether a text as written starts with a capital letter at `start`. */
export const capitalisedAt = (text, start) => /^[\p{Lu}\p{Lt}]/u.test(text.slice(start, start + 2))
