// The neutral substitute of a person picture (ADR 0040, spec TracyHQ/tracy#132, ticket #134): when the brief holds no
// portrait of the person a card names, the card shows that person's initials, never a stranger's face and never the
// demo's. The picture itself is drawn by the build (`initialsAvatar` of tracy-web's `picture-cut.js`) in the frame of the
// slot; this module only decides which letters it carries.

/** At most this many letters: a first and a last name. */
const MAX_LETTERS = 2

/**
 * The initials of a person's name: the first letter of the first and of the last word, folded to A to Z (an accented
 * letter keeps its base letter). Words that start with no such letter are skipped; a name with none gives "".
 * @param {unknown} name
 * @returns {string}
 */
export function initialsOf(name) {
  const words = String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => /^[A-Z]/.test(w))
  if (!words.length) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return picked
    .map((w) => w[0])
    .join('')
    .slice(0, MAX_LETTERS)
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
