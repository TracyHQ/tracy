// Whether an alt text describes a picture, by code (ADR 0043 section 3b): shared by the picture step's alt notes
// (site-pictures/alt-notes.js) and the site check's `alt-matches-picture` (site-check/alt-matches-picture.js).
//
// A plain word overlap, so its verdict is easy to explain: both texts are cut into content words (lower case, letters and
// digits, three letters or more, common little words dropped, a plural or -ing ending trimmed), and the alt "agrees" when
// at least one of its content words is in the seen sentence and at least a third of them are.

const STOP = new Set(
  (
    'the and with for from into onto over under this that these those their there here its his her our your they them ' +
    'are was were been being has have had who whom which what when where while also very just some any each every ' +
    'one two three photo picture image shows showing shown'
  ).split(' ')
)

/** The content words of a text, as the comparison reads them. */
export function contentWords(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  const out = new Set()
  for (const w of words ?? []) {
    if (w.length < 3 || STOP.has(w)) continue
    out.add(w.replace(/(ing|es|s)$/, '') || w)
  }
  return out
}

/** One alt against one seen sentence: { agrees, shared }. */
export function compareAlt(alt, seen) {
  const a = contentWords(alt)
  const s = contentWords(seen)
  const shared = [...a].filter((w) => s.has(w))
  return { agrees: shared.length >= 1 && shared.length * 3 >= a.size, shared }
}
