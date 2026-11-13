// The neutral substitute of a person picture (ADR 0040, spec TracyHQ/tracy#132, ticket #134): when the brief holds no
// portrait of the person a card names, the card shows that person's initials, never a stranger's face and never the
// demo's. The picture itself is drawn by the build (`initialsAvatar` of tracy-web's `picture-cut.js`) in the frame of the
// slot; this module only decides which letters it carries.

/** At most this many letters: a first and a last name. */
const MAX_LETTERS = 2

/** The first letter of a word, upper case, in the word's own script; a Latin letter with an accent folds to its base. */
function firstLetterOf(word) {
  // One letter even when its upper case is two (a sharp s is SS).
  const letter = [...[...word][0].toUpperCase()][0]
  const base = letter.normalize('NFD').replace(/\p{M}/gu, '')
  return /^\p{Script=Latin}$/u.test(base) ? base : letter.normalize('NFC')
}

/**
 * The initials of a person's name: the first letter of the first and of the last word, in the name's own script (a
 * Chinese, Cyrillic or Greek letter stays itself, as do Latin letters with no base letter such as O with stroke, AE or
 * L with stroke), a Latin letter with an accent folded to its base letter (E acute is E). Words that start with no
 * letter are skipped; a name with none gives "".
 * @param {unknown} name
 * @returns {string}
 */
export function initialsOf(name) {
  const words = String(name ?? '')
    .normalize('NFC')
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
