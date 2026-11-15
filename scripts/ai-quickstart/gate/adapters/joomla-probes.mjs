// The Joomla probes of write safety (ticket #586): the content plugin codes a Joomla site runs on the words it prints.
// A customer may type `{loadposition news}` or `{emailcloak=off}` in a sentence; a page that runs it prints the
// modules of a position or turns email cloaking off instead of the words. The danger is the code gone from the page
// while the field's own marker is there: the site ran what the customer typed. Pure.
import { signatureOf } from '../write-probes.mjs'

/** The words of a page: its text with spaces folded. */
const wordsOf = (doc) =>
  String(doc?.body?.textContent ?? doc?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .toLowerCase()

/** The ellipsis a cut text ends with: three dots or the one character. */
const ELLIPSIS = /\.\.\.|\u2026/

/**
 * Whether the words after one print of the marker are the probe cut short by a list (review 5 Z2): an ellipsis right
 * after the marker, or the start of the probe and then an ellipsis. A list that cuts its items' text to a length (a
 * category module's intro limit) leaves the marker without the code, as a page that ran the code does, but says so.
 */
function cutAfter(after, probe) {
  const rest = after.trimStart()
  const at = rest.search(ELLIPSIS)
  if (at < 0 || at > probe.length) return false
  return probe.startsWith(rest.slice(0, at).trimEnd())
}

/**
 * A probe whose danger is its own words missing where the field's marker prints. A page that prints the marker only
 * cut short (every print of it followed by a cut) judges nothing; the place is judged on a page that prints it whole.
 */
const codeProbe = (id, text, why, signed = null) => ({
  id,
  types: ['text'],
  text,
  ...(signed ? { signature: (code) => signatureOf(code, signed) } : {}),
  judge: ({ doc, code }) => {
    const words = wordsOf(doc)
    const marker = 'qx' + String(code).toLowerCase()
    const probe = text(code).toLowerCase()
    if (!words.includes(marker) || words.includes(probe)) return null
    for (let i = words.indexOf(marker); i >= 0; i = words.indexOf(marker, i + 1))
      if (!cutAfter(words.slice(i + marker.length), probe)) return { kind: 'markup_injected', element: id }
    return null
  },
  why
})

export const JOOMLA_PROBES = Object.freeze([
  codeProbe(
    'loadposition',
    (code) => '{loadposition ' + signatureOf(code, 'l') + '}',
    'the content plugin that prints the modules of a position',
    'l'
  ),
  codeProbe('emailcloak', () => '{emailcloak=off}', 'the content plugin that turns email cloaking off')
])
