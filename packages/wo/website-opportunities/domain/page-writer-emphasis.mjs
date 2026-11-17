// Accent words (#575, page writer audit item 2), copied from the step chain: the writer names the words of its own
// text that the template draws in the accent colour (`emphasis`), and the build wraps them the way the template does
// (`apps/tracy-web/src/lib/site-copy/inline-emphasis.js`, check W16 `site-writer/copy-check/rules-emphasis.js`).
//
// What the new model changes: the step chain read the kit's demo mark (`inline: [{tag, attrs, text, at}]`, its words
// included) and allowed an emphasis up to twice as long as the demo's words. The block store declares the mark without
// the demo words (`inline.emphasis`: `{tag: 'span', attrs, at}`, `ai-quickstart-inline.mjs`), so the room is the step
// chain's own floor stretched as it stretches a demo mark: twice `EMPHASIS_MIN_ROOM`. Under half of the text, as before.
// Pure.

/** The step chain's numbers (`inline-emphasis.js`). */
export const EMPHASIS_STRETCH = 2
export const EMPHASIS_MIN_ROOM = 12
export const EMPHASIS_MAX_SHARE = 0.5
/** The longest emphasis without a demo mark to measure: the floor, stretched as a demo mark is. */
export const EMPHASIS_ROOM = EMPHASIS_MIN_ROOM * EMPHASIS_STRETCH

const list = (value) => (Array.isArray(value) ? value : [])

/** The accent span a field declares (`inline.emphasis`), or null. */
export function spanPartOf(field) {
  return list(field?.inline?.emphasis).find((p) => p?.tag === 'span') ?? null
}

/** What the writer reads of a field's accent span: where the template draws it. */
export const emphasisViewOf = (field) => {
  const span = spanPartOf(field)
  return span ? { emphasis: { at: span.at } } : {}
}

/**
 * The problems of a field's emphasis (W16): only on a field that declares a span, exact words of its value, a short
 * run, under half of the value. The step chain also failed a missing one; Contract A says plain words are always valid,
 * so here the prompt asks for it and the check holds only what is given.
 * @param {{emphasis?: {at: string}}} field the field as the writer read it
 * @param {unknown} value the written value
 * @param {unknown} emphasis the written emphasis
 */
export function emphasisProblems(field, value, emphasis) {
  if (!field?.emphasis)
    return emphasis === undefined
      ? []
      : [
          {
            code: 'emphasis_not_declared',
            message: 'this field draws no words in the accent colour: give it no emphasis'
          }
        ]
  if (typeof value !== 'string') return []
  // Plain words are always valid (Contract A, `inline`): an emphasis left out is no failure, a given one is checked.
  if (emphasis === undefined) return []
  if (typeof emphasis !== 'string' || emphasis.trim() === '')
    return [
      { code: 'emphasis_empty', message: 'an emphasis names words of the text: leave it out or name them' }
    ]
  if (!value.includes(emphasis))
    return [
      {
        code: 'emphasis_not_in_text',
        message: `emphasis "${emphasis}" is not words of the text, exactly as written`
      }
    ]
  if (emphasis.length > EMPHASIS_ROOM)
    return [
      {
        code: 'emphasis_long',
        message: `emphasis is ${emphasis.length} characters, at most ${EMPHASIS_ROOM}`
      }
    ]
  if (emphasis.length >= value.length * EMPHASIS_MAX_SHARE)
    return [
      {
        code: 'emphasis_whole',
        message: `emphasis is ${emphasis.length} of the text's ${value.length} characters: draw a few words, never the whole text`
      }
    ]
  return []
}

/**
 * The value with its emphasis wrapped in the declared span, in content map markers (`((span))words((/span))`), for a
 * field written as `codes`; with the line break the template draws right before an accent run that ends the text
 * (`inline.emphasis` `[{tag: 'br'}, {tag: 'span', at: 'end'}]`) put before the run, as `withEmphasis` of the step chain does. Unchanged
 * for any other field, without an emphasis, or when the value does not hold it.
 */
export function withEmphasisMarkers(value, emphasis, inline) {
  const parts = list(inline?.emphasis)
  const k = parts.findIndex((p) => p?.tag === 'span')
  if (inline?.write !== 'codes' || k === -1 || typeof emphasis !== 'string' || !emphasis) return value
  const i = typeof value === 'string' ? value.indexOf(emphasis) : -1
  if (i === -1) return value
  const span = parts[k]
  const open = span.attrs ? `((span ${span.attrs}))` : '((span))'
  const before = value.slice(0, i)
  const breaks = span.at === 'end' && k > 0 && parts[k - 1]?.tag === 'br'
  const lead = breaks && before.trim() ? `${before.trimEnd()} ((br/))` : before
  return `${lead}${open}${emphasis}((/span))${value.slice(i + emphasis.length)}`
}
