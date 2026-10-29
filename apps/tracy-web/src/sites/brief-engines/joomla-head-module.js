/**
 * The marked leftover block (`leftoverHeadBlock`) on a site whose framework does not read head code from the style's
 * parameters (spec TracyHQ/tracy#189). A T4 template takes every `system_*` parameter from a file of its own
 * (`etc/global.json`) and drops the style's: measured on a real build, the head block written into the style row was
 * stored and never printed. A `<style>` in a custom module's body applies to the whole document, so the block travels
 * as one custom module shown on every page (the same road the design-system slot takes), found again by its note and
 * updated in place, so a second build never adds a second one. No template file is touched.
 */
import { readModules } from './joomla-tidy.js'

/** The note that marks the module as Tracy's leftover block. */
export const HEAD_MODULE_NOTE = 'tracy-leftovers'

/** Whether a module's page assignment is "every page" (`menuids` `[0]`). */
async function onEveryPage(apply, siteKey, id) {
  const got = await apply({ siteKey, action: 'content.get', params: { kind: 'moduleAssignment', id } })
  if (got?.ok === false) return false
  try {
    const ids = JSON.parse(String(got?.item?.menuids ?? 'null'))
    return Array.isArray(ids) && ids.map(Number).includes(0)
  } catch {
    return false
  }
}

/**
 * Where the block goes: the position of a published custom module that already shows on every page (the template
 * prints it on every page), else the position of any published custom module.
 * @returns {Promise<string | null>}
 */
async function positionFor(apply, siteKey, modules) {
  const custom = modules.filter(
    (m) => m.module === 'mod_custom' && Number(m.published) === 1 && m.position && m.note !== HEAD_MODULE_NOTE
  )
  for (const m of custom) if (await onEveryPage(apply, siteKey, Number(m.id))) return String(m.position)
  return custom[0] ? String(custom[0].position) : null
}

/**
 * Put the block on every page as a custom module.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string} input.block - the marked `<style>` block
 * @param {string} input.applyId
 * @param {(line: string) => void} input.note
 * @returns {Promise<number>} 1 when the module was written
 */
export async function writeHeadModule({ apply, siteKey, block, applyId, note }) {
  try {
    const modules = await readModules(apply, siteKey)
    const own = modules.find((m) => m.note === HEAD_MODULE_NOTE && m.module === 'mod_custom')
    const fail = (/** @type {any} */ a) => a?.ok === false
    if (own) {
      if (String(own.content ?? '') === block && Number(own.published) === 1) return 0
      const answer = await apply({
        siteKey,
        action: 'content.update',
        params: {
          kind: 'module',
          id: Number(own.id),
          apply_id: applyId,
          fields: { content: block, published: 1 }
        }
      })
      if (fail(answer)) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
      return 1
    }
    const position = await positionFor(apply, siteKey, modules)
    if (!position) {
      note(
        'the site has no custom module to show the demo-leftover styles with, so the demo backgrounds and videos stay'
      )
      return 0
    }
    const made = await apply({
      siteKey,
      action: 'content.update',
      params: {
        kind: 'module',
        apply_id: applyId,
        fields: {
          title: 'Tracy leftovers',
          note: HEAD_MODULE_NOTE,
          module: 'mod_custom',
          content: block,
          position,
          published: 1,
          showtitle: 0,
          access: 1,
          language: '*',
          params: JSON.stringify({ prepare_content: 0, cache: 0, moduleclass_sfx: '' })
        }
      }
    })
    if (fail(made) || !made?.id) throw new Error(String(made?.message ?? made?.error ?? 'refused'))
    const shown = await apply({
      siteKey,
      action: 'content.update',
      params: {
        kind: 'moduleAssignment',
        id: Number(made.id),
        apply_id: applyId,
        fields: { menuids: '[0]' }
      }
    })
    if (fail(shown)) throw new Error(String(shown.message ?? shown.error ?? 'refused'))
    return 1
  } catch (error) {
    note(
      `the demo-leftover styles could not be put on the pages, so the demo backgrounds and videos stay: ${error instanceof Error ? error.message : error}`
    )
    return 0
  }
}
