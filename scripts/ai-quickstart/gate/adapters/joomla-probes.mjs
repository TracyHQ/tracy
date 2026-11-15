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

/** A probe whose danger is its own words missing where the field's marker prints. */
const codeProbe = (id, text, why) => ({
  id,
  types: ['text'],
  text,
  judge: ({ doc, code }) => {
    const words = wordsOf(doc)
    const marker = 'qx' + String(code).toLowerCase()
    if (!words.includes(marker)) return null
    return words.includes(text(code).toLowerCase()) ? null : { kind: 'markup_injected', element: id }
  },
  why
})

export const JOOMLA_PROBES = Object.freeze([
  codeProbe(
    'loadposition',
    (code) => '{loadposition ' + signatureOf(code, 'l') + '}',
    'the content plugin that prints the modules of a position'
  ),
  codeProbe('emailcloak', () => '{emailcloak=off}', 'the content plugin that turns email cloaking off')
])
