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
    // A default Joomla menu item serves the root even when its stored path is "home".
    // Path-based hide planning cannot recognize that dependency. Never take the active default offline.
    if (action === 'content.update' && params.kind === 'menuItem' && Number(params.fields?.published) === 0) {
      const current = await door.apply({
        siteKey,
        action: 'content.get',
        params: { kind: 'menuItem', id: params.id }
      })
      if (current?.ok === false) throw new Error(answerWords(current))
      if (Number(current?.item?.home) === 1)
        throw new Error(
          'The default Home menu item must stay published; hiding it would break the home page and other CMS pages.'
        )
    }
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
