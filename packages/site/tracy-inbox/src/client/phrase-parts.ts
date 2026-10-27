/**
 * Every action phrase names its site as `{site}` (Akemi 04/10, option F), and the row draws the
 * site as a link. So the phrase is translated with a marker in place of the site, then cut around
 * that marker: the text before it, the link, the text after it. The team verb (`verb.team.*`), when
 * given, is cut out of whichever side holds it so it can be coloured.
 *
 * Pure, so `test/phrase-parts.test.mjs` pins every rule.
 */

/** Stands in for the site while the phrase is translated: invisible separators, never in copy. */
export const SITE_MARK = '⁣site⁣'

export interface Segment {
  text: string
  verb: boolean
}

export interface PhraseParts {
  before: Segment[]
  /** False when the language's phrase has no `{site}`: the row then shows no link. */
  hasSite: boolean
  after: Segment[]
}

/** Cuts `verb` out of `text` once; one plain segment when it is not there. */
function withVerb(text: string, verb: string): { segments: Segment[]; found: boolean } {
  const at = verb === '' ? -1 : text.indexOf(verb)
  if (at < 0) return { segments: text === '' ? [] : [{ text, verb: false }], found: false }
  const segments: Segment[] = []
  if (at > 0) segments.push({ text: text.slice(0, at), verb: false })
  segments.push({ text: verb, verb: true })
  if (at + verb.length < text.length) segments.push({ text: text.slice(at + verb.length), verb: false })
  return { segments, found: true }
}

/**
 * @param phrase - the translated phrase, with `SITE_MARK` where the site goes.
 * @param verb - the words to colour, or '' for none.
 */
export function phraseParts(phrase: string, verb = ''): PhraseParts {
  const at = phrase.indexOf(SITE_MARK)
  const head = at < 0 ? phrase : phrase.slice(0, at)
  const tail = at < 0 ? '' : phrase.slice(at + SITE_MARK.length)
  const first = withVerb(head, verb)
  const second = first.found ? withVerb(tail, '') : withVerb(tail, verb)
  return { before: first.segments, hasSite: at >= 0, after: second.segments }
}
