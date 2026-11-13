// The copy check of the AI quickstart writer (ticket #594, ADR 0046). Pure: the copy fields a page was asked for and the
// values the model wrote in, every failing field out with its problems.
//
// It measures what the block store DECLARES for each field (Contract A, `ai-quickstart-contract.mjs`): its type and its
// limit. It never measures against demo copy, and it has no floor: a short value that says what it must is never sent
// back to be made longer, so nothing is padded to reach a length.
//
// Length unit: a limit counts CODE POINTS (`charCount`), the unit Contract A states for `limit` ("the most characters
// it holds"), so an accented letter or an emoji counts once, whatever its UTF-16 length. Data values are measured with
// the same count (`page-writer-request.mjs`).
//
// Plain text, the only form a text field holds: one line of characters a reader sees. No HTML tag, no markdown marker
// (a heading `#`, a list `-`, `*`, `+` or `1.` or a quote `>` at the start, `**strong**`, `__strong__`, `*soft*`,
// a `code` span, a `[link](target)`), no line break (LF, CR, U+2028, U+2029) and no other control character. A value
// made only of spaces and invisible characters (zero width, format characters, fillers) is empty.
import { tokensIn } from './needs-profile-grounding.mjs'
import { inventedDataOf } from './page-writer-data-guard.mjs'

// Figure dash, en dash, em dash, horizontal bar, minus sign, two and three em dashes, small em dash.
const DASHES = /[\u2012\u2013\u2014\u2015\u2212\u2E3A\u2E3B\uFE58]/u
const MARKUP = /<\/?[a-z!][^>]*>/i
const LINE_BREAK = /[\n\r\u2028\u2029\u0085]/u
const CONTROL = /\p{Cc}/u
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/gu
const MARKDOWN = [
  /^\s*#{1,6}\s/,
  /^\s*(?:[-*+]|\d+[.)])\s/,
  /^\s*>\s/,
  /\*\*[^*\s][^*]*\*\*/,
  /__[^_\s][^_]*__/,
  /(?:^|\s)\*[^*\s][^*]*[^*\s]\*(?=$|[\s.,;:!?])/,
  /`[^`]+`/,
  /\[[^\]]+\]\([^)]*\)/
]

/** The field types the writer writes: text only. Links, numbers, images and icons come from data or the picture step. */
export const WRITER_FIELD_TYPES = Object.freeze(['text'])

/** How many characters a value holds: one per code point, not per UTF-16 unit (the unit of every limit). */
export const charCount = (value) => [...String(value)].length

/**
 * The problems of one written value against its declared field. An empty list means the value fits.
 * @param {{name: string, type: string, limit?: number}} field the field as the block store declares it
 * @param {unknown} value what the model wrote
 * @param {{known?: string[], foreign?: string[]}} [context] `known`: every value of the plan data, so copy never carries
 *   an invented phone number, email address, URL or price (`page-writer-data-guard.mjs`); `foreign`: for a child list
 *   row's copy field, the values of the other rows, none of which it may carry (whole words, `tokensIn`)
 * @returns {Array<{code: string, message: string}>}
 */
export function fieldValueProblems(field, value, { known, foreign } = {}) {
  if (!WRITER_FIELD_TYPES.includes(field?.type))
    return [{ code: 'not_a_copy_field', message: `a ${field?.type} field is not written by the writer` }]
  if (value === undefined || value === null)
    return [{ code: 'missing', message: 'no value was written for this field' }]
  if (typeof value !== 'string')
    return [{ code: 'wrong_type', message: `a text field holds a string, not a ${typeof value}` }]
  if (value.replace(INVISIBLE, '').trim() === '') return [{ code: 'empty', message: 'the value is empty' }]
  const problems = []
  const length = charCount(value)
  if (length > field.limit)
    problems.push({
      code: 'over_limit',
      message: `${length} characters, the field holds at most ${field.limit}: shorten it, keep the meaning`
    })
  if (value !== value.trim())
    problems.push({ code: 'edge_space', message: 'the value starts or ends with a space' })
  if (MARKUP.test(value)) problems.push({ code: 'markup', message: 'plain text only, no HTML tags' })
  if (LINE_BREAK.test(value)) problems.push({ code: 'line_break', message: 'one line only: no line break' })
  else if (CONTROL.test(value))
    problems.push({ code: 'control_character', message: 'no tab or other control character' })
  if (MARKDOWN.some((pattern) => pattern.test(value)))
    problems.push({ code: 'markdown', message: 'plain text only, no markdown markers' })
  if (DASHES.test(value))
    problems.push({
      code: 'dash',
      message:
        'no dash of any kind (en, em, figure, bar or minus): use a comma, a full stop or a new sentence'
    })
  if (known)
    for (const { what, text } of inventedDataOf(value, known))
      problems.push({
        code: 'invented_data',
        message: `the ${what} ${JSON.stringify(text)} is not in the business data: remove it, the data fields show it`
      })
  for (const other of foreign ?? [])
    if (tokensIn(other, value))
      problems.push({
        code: 'other_row_data',
        message: `${JSON.stringify(other)} belongs to another row: write this field from its own row's data only`
      })
  return problems
}

/**
 * Check every slot of a page against what was written.
 * @param {Array<{key: string, field: object}>} slots the fields the page was asked for
 * @param {Record<string, unknown>} values the written values by slot key
 * @param {{known?: string[]}} [context] the plan data's values (`fieldValueProblems`)
 * @returns {{ok: boolean, failing: Array<{key: string, value: unknown, problems: object[]}>}}
 */
export function checkPageCopy(slots, values, context) {
  const failing = []
  for (const { key, field, foreign } of slots) {
    const value = values?.[key]
    const problems = fieldValueProblems(field, value, foreign ? { ...context, foreign } : context)
    if (problems.length > 0) failing.push({ key, value, problems })
  }
  return { ok: failing.length === 0, failing }
}
