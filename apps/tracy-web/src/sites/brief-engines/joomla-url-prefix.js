/**
 * A Joomla site a visitor reads in ONE language answers without a language prefix (TCH #1013, D8, option A): `/about`, not
 * `/en/about`. The language filter's own setting does it, "Remove URL Language Code" (`remove_default_prefix` = 1), through
 * the plugin's narrowly scoped `languageFilter` kind (`content.list` then `content.update`, the whole params object back).
 *
 * Nothing is renamed: the source edition keeps its content language and its `sef` (Tracy Business keys its T4 navigation by
 * it, `joomla-languages.js`), so every menu and module stays where it is. Joomla builds every link without the prefix, and an
 * old `/en/…` link a visitor or a search engine still holds is answered with a redirect to the same page without it (the
 * filter marks the route tainted, `LanguageFilter::parseRule`).
 *
 * ⚠ A Claude Cowork plugin older than 0.24.5 writes its profile's filter params back whole when a language is added later
 * (`multilingual.apply`), so the prefix returns then; 0.24.5 keeps it dropped. Either way every page answers.
 */

/** A row's `params` as an object, whichever way the door hands it; null when it is neither. */
function paramsOf(/** @type {unknown} */ params) {
  try {
    const read = typeof params === 'string' ? JSON.parse(params === '' ? '{}' : params) : params
    return read && typeof read === 'object' && !Array.isArray(read) ? read : null
  } catch {
    return null
  }
}

/**
 * Take the default language's prefix off the site's addresses. Never throws: what did not happen is a note.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string} input.applyId
 * @param {(note: string) => void} input.note
 * @returns {Promise<'dropped' | 'unchanged' | 'off' | 'failed'>} `off`: the site has no language filter switched on, so no prefix
 */
export async function dropDefaultPrefix({ apply, siteKey, applyId, note }) {
  const kept = 'the addresses keep their language prefix'
  try {
    const listed = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'languageFilter', limit: 10, offset: 0 }
    })
    if (listed?.ok === false) throw new Error(String(listed.message ?? listed.error ?? 'the site refused'))
    const row = Array.isArray(listed?.items) ? listed.items[0] : undefined
    if (!row || Number(row.enabled) !== 1) return 'off'
    const params = paramsOf(row.params)
    if (!params) throw new Error('its language filter settings could not be read')
    if (String(params.remove_default_prefix ?? '0') === '1') return 'unchanged'
    const answer = await apply({
      siteKey,
      action: 'content.update',
      params: {
        kind: 'languageFilter',
        id: Number(row.id),
        apply_id: applyId,
        fields: { params: JSON.stringify({ ...params, remove_default_prefix: 1 }) }
      }
    })
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'the site refused'))
    return 'dropped'
  } catch (error) {
    note(`${kept}: ${error instanceof Error ? error.message : error}`)
    return 'failed'
  }
}
