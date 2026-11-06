// The door calls of the page settings stage (ADR 0044, decision 4, item 4): one plugin action at a time, a refusal named
// in the plugin's own words. A refusal either arrives as an answer with `ok: false` or as a throw; both come out as an
// Error whose message is the plugin's `error` and `message`, so a caller reports it as it is.

/** The plugin's own words for a refused answer. */
export const answerWords = (answer) =>
  [answer?.error, answer?.message].filter((part) => typeof part === 'string' && part).join(': ') ||
  'the site refused this write'

/**
 * @param {{ apply: Function }} door
 * @param {string} siteKey
 * @returns {(action: string, params: Record<string, unknown>) => Promise<any>} throws the plugin's words on a refusal
 */
export function doorCall(door, siteKey) {
  return async (action, params) => {
    let answer
    try {
      answer = await door.apply({ siteKey, action, params })
    } catch (error) {
      throw new Error(error?.answer ? answerWords(error.answer) : String(error?.message ?? error))
    }
    if (answer?.ok === false) throw new Error(answerWords(answer))
    return answer
  }
}

/** How a line is read back after a write through `content.update`: the row is read whole, then one field of it. */
export const readRow = (kind, id, field, extraPath = []) => ({
  action: 'content.get',
  params: { kind, id },
  path: ['item', field, ...extraPath]
})
