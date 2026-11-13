// The neutral substitute of a person picture (ADR 0040, spec TracyHQ/tracy#132, ticket #134): when the brief holds no
// portrait of the person a card names, the card shows that person's initials, never a stranger's face and never the
// demo's. The picture itself is drawn by the build (`initialsAvatar` of tracy-web's `picture-cut.js`) in the frame of the
// slot; this module only decides which letters it carries.

/** At most this many letters: a first and a last name. */
const MAX_LETTERS = 2

/**
 * Latin letters with a stroke or a ligature that have no base letter under Unicode decomposition, folded to the base
 * letter so the drawer (A to Z only, tracy-web's `initials-avatar.js`) draws them.
 */
const LATIN_FOLDS = Object.freeze({
  Ø: 'O',
  Ł: 'L',
  Æ: 'A',
  Œ: 'O',
  '\u0110': 'D',
  Ð: 'D',
  Ħ: 'H',
  Ŧ: 'T',
  Ŀ: 'L',
  Ƶ: 'Z',
  Ɨ: 'I',
  Ꝋ: 'O'
})
/** A leading vowel written before its consonant (Thai, Lao and kin): never the first letter of an initial. */
const LEADING_VOWEL = /^\p{Logical_Order_Exception}$/u

/** The first letter of a word, upper case, in the word's own script; a Latin letter folds to its base letter. */
function firstLetterOf(word) {
  const first = [...word].find((c) => /^\p{L}$/u.test(c) && !LEADING_VOWEL.test(c)) ?? [...word][0]
  // One letter even when its upper case is two (a sharp s is SS).
  const letter = [...first.toUpperCase()][0]
  const base = LATIN_FOLDS[letter] ?? letter.normalize('NFD').replace(/\p{M}/gu, '')
  return /^\p{Script=Latin}$/u.test(base) ? base : letter.normalize('NFC')
}

/** The name in a label: without what it says in parentheses, nor what follows a comma (a title, a role). */
const nameOfLabel = (label) =>
  String(label ?? '')
    .normalize('NFC')
    .replace(/\([^)]*\)?/gu, ' ')
    .split(/[,\uFF0C\u060C]/u)[0]

/**
 * The initials of a person's name: the first letter of the first and of the last word, in the name's own script (a
 * Chinese, Cyrillic or Greek letter stays itself), a Latin letter with an accent, a stroke or a ligature folded to its
 * base letter (E acute is E, O with stroke is O, AE is A). What the label says in parentheses or after a comma (a role,
 * a title) is left out. A word whose first letter is a leading vowel (Thai, Lao) starts at its first consonant. Words
 * that start with no letter are skipped; a name with none gives "".
 * @param {unknown} name
 * @returns {string}
 */
export function initialsOf(name) {
  const words = nameOfLabel(name)
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => /^\p{L}/u.test(w))
  if (!words.length) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return picked.slice(0, MAX_LETTERS).map(firstLetterOf).join('')
}

/**
 * The substitute a person picture takes: an initials avatar for the named person, or with no letters when the card names
 * nobody the brief lists. It keeps the frame of the slot (`frame`, the demo picture's size) when that is known.
 * @param {{personId: string, label: string} | null} person
 * @param {{width: number, height: number} | null | undefined} frame
 */
export function avatarSubstitute(person, frame) {
  return {
    kind: 'initials-avatar',
    initials: person ? initialsOf(person.label) : '',
    ...(person ? { personId: person.personId } : {}),
    ...(frame?.width && frame?.height ? { frame: { width: frame.width, height: frame.height } } : {})
  }
}
