// The copy check of the AI quickstart writer (ticket #594, ADR 0046). Pure: the fields a page was asked for and the
// values the model wrote in, every failing field out with its problems.
//
// It measures what the block store DECLARES for each field (Contract A, `ai-quickstart-contract.mjs`): its type and its
// limit in characters. It never measures against demo copy, and it has no floor: a short value that says what it must
// is never sent back to be made longer, so nothing is padded to reach a length.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const MARKUP = /<\/?[a-z!][^>]*>/i

/** The field types the writer writes: text only. Links, numbers, images and icons come from data or the picture step. */
export const WRITER_FIELD_TYPES = Object.freeze(['text'])

/** How many characters a value holds, counted as the customer reads them (one per code point, not per UTF-16 unit). */
export const charCount = (value) => [...String(value)].length

/**
 * The problems of one written value against its declared field. An empty list means the value fits.
 * @param {{name: string, type: string, limit?: number}} field the field as the block store declares it
 * @param {unknown} value what the model wrote
 * @returns {Array<{code: string, message: string}>}
 */
export function fieldValueProblems(field, value) {
  if (!WRITER_FIELD_TYPES.includes(field?.type))
    return [{ code: 'not_a_copy_field', message: `a ${field?.type} field is not written by the writer` }]
  if (value === undefined || value === null)
    return [{ code: 'missing', message: 'no value was written for this field' }]
  if (typeof value !== 'string')
    return [{ code: 'wrong_type', message: `a text field holds a string, not a ${typeof value}` }]
  if (value.trim() === '') return [{ code: 'empty', message: 'the value is empty' }]
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
  if (DASHES.test(value))
    problems.push({
      code: 'dash',
      message: 'no en dash or em dash: use a comma, a full stop or a new sentence'
    })
  return problems
}

/**
 * Check every slot of a page against what was written.
 * @param {Array<{key: string, field: object}>} slots the fields the page was asked for
 * @param {Record<string, unknown>} values the written values by slot key
 * @returns {{ok: boolean, failing: Array<{key: string, value: unknown, problems: object[]}>}}
 */
export function checkPageCopy(slots, values) {
  const failing = []
  for (const { key, field } of slots) {
    const value = values?.[key]
    const problems = fieldValueProblems(field, value)
    if (problems.length > 0) failing.push({ key, value, problems })
  }
  return { ok: failing.length === 0, failing }
}
