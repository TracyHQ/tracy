/**
 * Joomla modules that state only another company's facts, taken off the page.
 *
 * 🔒 THE CONTRACT CANNOT EMPTY WHAT IT CANNOT HONESTLY FILL. `tracy-business/j6` has six modules whose every line is a fact
 * the contract asks evidence for: the leadership (names and titles), the accreditations (ISO 9001:2015, NAKS), the clients
 * (five logos and their names), and three strips of counters ("380+ projects delivered", "22 years"). A customer who gave
 * no evidence for any of it, and was asked nothing (CLAUDE.md §0.3), would show a bakery's visitors a Russian
 * contractor's team and certificates; the component refuses to empty an occupied slot ("Content cannot remove an occupied
 * slot"), and a line the model cannot honestly write stays as the template has it. The module that holds only such lines is
 * unpublished instead — through the open surface (`content.update {kind: 'module'}`, ADR 0022), under one apply id, so
 * `apply.revert` brings it back.
 *
 * A language the site speaks beyond the source has its own copy of each module (a derived edition makes one), found by
 * title among the modules the site lists and hidden with it.
 */

/** The text a title search is made of: the title without its `[Template]` prefix. */
const searchOf = (/** @type {string} */ title) => title.replace(/^\[[^\]]*\]\s*/, '').trim()

/**
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{ id: number, title: string }>} input.modules - the source-language modules to hide; `title` is their title without the language
 * @param {boolean} input.copies - the site speaks more than the source, so published copies by title go too
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {string} input.applyId
 * @returns {Promise<{ hidden: number[], notes: string[] }>}
 */
export async function hideFactModules({ apply, siteKey, modules, copies, visible, applyId }) {
  /** @type {number[]} */
  const hidden = []
  /** @type {string[]} */
  const notes = []
  const call = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await apply({ siteKey, action, params })
    if (answer?.ok === false)
      throw new Error(String(answer.message ?? answer.error ?? `${action} was refused`))
    return answer
  }
  for (const module of modules) {
    /** @type {number[]} */
    const ids = [module.id]
    if (copies && module.title !== '') {
      try {
        const listed = await call('content.list', {
          kind: 'module',
          search: searchOf(module.title),
          limit: 100
        })
        const rows = Array.isArray(listed?.items) ? listed.items : []
        for (const row of rows) {
          const id = Number(row.id)
          if (id === module.id || !String(row.title ?? '').startsWith(`${module.title} (`)) continue
          if (Number(row.published) !== 1 || !visible.has(String(row.language ?? ''))) continue
          ids.push(id)
        }
      } catch (error) {
        notes.push(
          `the copies of "${searchOf(module.title)}" could not be listed: ${error instanceof Error ? error.message : error}`
        )
      }
    }
    for (const id of ids) {
      try {
        await call('content.update', { kind: 'module', id, apply_id: applyId, fields: { published: 0 } })
        hidden.push(id)
      } catch (error) {
        notes.push(`module ${id} could not be hidden: ${error instanceof Error ? error.message : error}`)
      }
    }
  }
  return { hidden, notes }
}
