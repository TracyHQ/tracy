/**
 * The marked leftover block (`leftoverHeadBlock`) on a site whose framework does not read head code from the style's
 * parameters (spec TracyHQ/tracy#189). A T4 template takes every `system_*` parameter from a file of its own
 * (`etc/global.json`) and drops the style's: measured on a real build, the head block written into the style row was
 * stored and never printed. A `<style>` in a custom module's body applies to the whole document, so the block travels
 * as one custom module shown on every page (the same road the design-system slot takes), found again by its note and
 * updated in place, so a second build never adds a second one. No template file is touched.
 *
 * 🔒 A POSITION THE PAGES PRINT. A module assigned to every page shows only where the layout prints its position: measured
 * on a real T4 build, the block sat in the position of a map module that the layout prints only inside the contact page's
 * map dialog, so not one rule of it reached the home page. When the served pages are known, the block goes to the position
 * whose custom module shows on the most of them (all, when one does), read from what each page serves; a block already
 * written that a page lacks is moved there.
 */
import { HEAD_BLOCK_START } from 'website-opportunities/domain/outside-map.mjs'
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
 * The marks a module leaves on a page it is shown on: its wrapper id (T4 `Mod<id>`, Joomla `mod-custom<id>`,
 * `module-<id>`), a run of its own words, and the pictures it shows.
 * @param {any} module
 * @returns {string[]}
 */
export function marksOf(module) {
  const id = Number(module?.id)
  const content = String(module?.content ?? '')
  const words = content
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map((w) => w.trim())
    .filter((w) => w.length >= 12 && !/[&<>"]/.test(w))
    .slice(0, 2)
  const pictures = [...content.matchAll(/\bsrc=["']([^"'#?]{8,})/gi)]
    .map((m) => m[1].replace(/^\/+/, ''))
    .slice(0, 2)
  const own = content.includes(HEAD_BLOCK_START) ? [HEAD_BLOCK_START] : []
  return [
    ...(Number.isInteger(id) && id > 0 ? [`id="Mod${id}"`, `id="mod-custom${id}"`, `id="module-${id}"`] : []),
    ...own,
    ...(own.length ? [] : [...words, ...pictures])
  ]
}

/** On how many of `pages` a module shows. */
const shownOn = (module, pages) => {
  const marks = marksOf(module)
  return pages.filter((html) => marks.some((m) => String(html ?? '').includes(m))).length
}

/**
 * Where the block goes: the position whose published custom module the served pages show the most (when they are known),
 * else the position of a published custom module that shows on every page, else of any published custom module.
 * @param {(call: any) => Promise<any>} apply
 * @param {string} siteKey
 * @param {any[]} modules
 * @param {string[]} [pages] - the served pages read for the head block
 * @returns {Promise<string | null>}
 */
async function positionFor(apply, siteKey, modules, pages = []) {
  const custom = modules.filter(
    (m) => m.module === 'mod_custom' && Number(m.published) === 1 && m.position && m.note !== HEAD_MODULE_NOTE
  )
  if (pages.length) {
    let best = null
    let most = 0
    for (const m of custom) {
      const n = shownOn(m, pages)
      if (n > most) {
        most = n
        best = String(m.position)
      }
    }
    if (best) return best
  }
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
 * @param {string[]} [input.pages] - the served pages read for the head block: the block must show on each
 * @returns {Promise<number>} 1 when the module was written
 */
export async function writeHeadModule({ apply, siteKey, block, applyId, note, pages = [] }) {
  try {
    const modules = await readModules(apply, siteKey)
    const own = modules.find((m) => m.note === HEAD_MODULE_NOTE && m.module === 'mod_custom')
    const fail = (/** @type {any} */ a) => a?.ok === false
    if (own) {
      // A block some served page lacks sits in a position that page does not print: it moves to one the pages print.
      const lacking = pages.some((html) => !String(html ?? '').includes(HEAD_BLOCK_START))
      const moved = lacking ? await positionFor(apply, siteKey, modules, pages) : null
      const move = moved && moved !== String(own.position ?? '') ? { position: moved } : {}
      if (String(own.content ?? '') === block && Number(own.published) === 1 && !move.position) return 0
      const answer = await apply({
        siteKey,
        action: 'content.update',
        params: {
          kind: 'module',
          id: Number(own.id),
          apply_id: applyId,
          fields: { content: block, published: 1, ...move }
        }
      })
      if (fail(answer)) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
      return 1
    }
    const position = await positionFor(apply, siteKey, modules, pages)
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
