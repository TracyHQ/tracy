// Generated prose in a brief carries no em or en dash (#1791): on a site a dash reads as machine written. The model is
// told so in its prompt, and code makes sure, because a prompt is a request and this is a rule. Verbatim quotes are never
// passed through here: they stay exactly as their source spells them.

const DASH = '[\\u2013\\u2014]'
const RANGE = new RegExp(`(\\d)\\s*${DASH}\\s*(\\d)`, 'gu')
const EDGE = new RegExp(`^\\s*${DASH}+\\s*|\\s*${DASH}+\\s*$`, 'gu')
const INNER = new RegExp(`\\s*${DASH}+\\s*`, 'gu')

/**
 * The text with every em and en dash replaced (pure): a range of numbers keeps a hyphen ("9-17"), a dash at either end
 * is dropped, and one between words becomes a comma ("tone, emoji"). Anything not a string is returned as it is.
 */
export function withoutDashes(text) {
  if (typeof text !== 'string' || !/[–—]/u.test(text)) return text
  return text
    .replace(RANGE, '$1-$2')
    .replace(EDGE, '')
    .replace(INNER, ', ')
    .replace(/,\s*([,.;:!?)])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

const TITLE_WORD = /^\p{Lu}\p{Ll}+$/u

// Words a service name is made of that are common, never a name of their own: lowered inside a sentence even when the
// business's quote capitalises every word. Any other word keeps its capital unless the quote itself writes it lower case.
const COMMON_WORDS = new Set(
  `a an and at by for from in into of on or the to with our your
  lesson lessons session sessions class classes course courses training trainings coaching coach coaches program
  programs programme programmes workshop workshops camp camps clinic clinics membership memberships package packages
  treatment treatments service services consultation consultations appointment appointments repair repairs
  personal personalized personalised private group kids kid children adult adults junior juniors senior beginner
  beginners advanced intermediate fitness swimming swim tennis padel squash golf yoga pilates boxing dance dancing
  football soccer basketball running cycling strength conditioning workout workouts massage therapy care cleaning
  delivery catering design installation maintenance cut cuts colour color styling nails hair skin beauty`.split(
    /\s+/
  )
)

/** The words a quote writes in lower case: common for the business, whatever a title-cased label says. */
function lowerWordsOf(quote) {
  return new Set(
    (String(quote ?? '').match(/\p{L}[\p{L}\p{N}'’]*/gu) ?? []).filter((w) => w === w.toLowerCase())
  )
}

/**
 * A name inside generated prose, in sentence case where that is safe (pure): a title-case word reads lower case when it
 * is a common word of a service name ("Personalized Fitness Lessons" gives "personalized fitness lessons") or when its
 * own quote writes it lower case ("padel sessions"); any other word keeps its capital, so a place ("Tennis Lessons In
 * Dubai" gives "tennis lessons in Dubai") or a brand stays as written. An acronym keeps its capitals. Never applied to
 * a quote itself.
 */
export function inSentence(label, quote = null) {
  const lower = lowerWordsOf(quote)
  return String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      if (!TITLE_WORD.test(w)) return w
      const l = w.toLowerCase()
      return COMMON_WORDS.has(l) || lower.has(l) ? l : w
    })
    .join(' ')
}
