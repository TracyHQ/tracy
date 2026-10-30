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
import { blockBytes, HEAD_BLOCK_LIMIT, LEFTOVERS_NOTE, TRACY_HEAD_NOTE } from './joomla-head-blocks.js'

/** The note that marks the module as Tracy's leftover block. */
export const HEAD_MODULE_NOTE = LEFTOVERS_NOTE
/** Where Tracy's head block modules sort in their position, after the modules a visitor sees. */
const ORDERING = 9000

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
    (m) =>
      m.module === 'mod_custom' &&
      Number(m.published) === 1 &&
      m.position &&
      !TRACY_HEAD_NOTE.test(String(m.note ?? ''))
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
 * Put the block on every page as a custom module (the leftover rules alone, `writeHeadModules` for several blocks).
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
  const wrote = await writeHeadModules({
    apply,
    siteKey,
    blocks: [{ note: HEAD_MODULE_NOTE, title: 'Tracy leftovers', content: block, part: 'leftovers' }],
    applyId,
    note,
    pages,
    retire: false
  })
  return wrote.written
}

/** What a refused block costs the page, for the note. */
const LOSS = {
  leftovers:
    'the demo-leftover styles could not be put on the pages, so the demo backgrounds and videos stay',
  colours: 'the brand colours could not be put on the pages, so the template keeps its own colours',
  schema: 'the business record for search engines could not be put on the pages'
}

/**
 * Put each block on every page as a custom module of its own, found again by its note and updated in place. One block
 * refused never stops another: each is written and reported apart. A Tracy block module an earlier build left that this
 * build no longer has (a part the CSS no longer needs) is unpublished, so its stale rules leave the pages.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{note: string, title: string, content: string, part: 'leftovers' | 'colours'}>} input.blocks
 * @param {string} input.applyId
 * @param {(line: string) => void} input.note
 * @param {string[]} [input.pages] - the served pages read for the head block: each block must show on each
 * @param {boolean} [input.retire] - unpublish the Tracy block modules not among `blocks`
 * @returns {Promise<{written: number, refused: Array<{note: string, part: string, bytes: number, why: string}>}>}
 */
export async function writeHeadModules({ apply, siteKey, blocks, applyId, note, pages = [], retire = true }) {
  const out = {
    written: 0,
    refused: /** @type {Array<{note: string, part: string, bytes: number, why: string}>} */ ([])
  }
  const refuse = (/** @type {any} */ block, /** @type {unknown} */ error) => {
    const size = blockBytes(block.content)
    const why = error instanceof Error ? error.message : String(error)
    out.refused.push({ note: block.note, part: block.part, bytes: size, why })
    note(
      `${LOSS[block.part] ?? LOSS.leftovers} (block ${block.note}, ${size} bytes, limit ${HEAD_BLOCK_LIMIT}): ${why}`
    )
  }
  let modules
  try {
    modules = await readModules(apply, siteKey)
  } catch (error) {
    for (const block of blocks) refuse(block, error)
    return out
  }
  let position = /** @type {string | null | undefined} */ (undefined)
  const placed = async () => {
    if (position === undefined) position = await positionFor(apply, siteKey, modules, pages)
    return position
  }
  for (const [at, block] of blocks.entries()) {
    try {
      out.written += await writeOne({
        apply,
        siteKey,
        block,
        applyId,
        modules,
        pages,
        placed,
        ordering: ORDERING + at
      })
    } catch (error) {
      refuse(block, error)
    }
  }
  if (retire)
    for (const m of modules) {
      if (m.module !== 'mod_custom' || Number(m.published) !== 1) continue
      if (!TRACY_HEAD_NOTE.test(String(m.note ?? '')) || blocks.some((b) => b.note === m.note)) continue
      const answer = await apply({
        siteKey,
        action: 'content.update',
        params: { kind: 'module', id: Number(m.id), apply_id: applyId, fields: { published: 0 } }
      }).catch((/** @type {unknown} */ error) => ({ ok: false, message: String(error) }))
      if (answer?.ok === false)
        note(`the old Tracy block ${m.note} could not be taken off: ${answer.message ?? answer.error}`)
    }
  return out
}

/** Write one block: its own module updated (and moved where a page lacks it), or a new one made. 1 when written. */
async function writeOne({ apply, siteKey, block, applyId, modules, pages, placed, ordering }) {
  const fail = (/** @type {any} */ a) => a?.ok === false
  const own = modules.find((m) => m.note === block.note && m.module === 'mod_custom')
  if (own) {
    // A block some served page lacks sits in a position that page does not print: it moves to one the pages print.
    const lacking = pages.some((html) => !String(html ?? '').includes(HEAD_BLOCK_START))
    const moved = lacking ? await placed() : null
    const move = moved && moved !== String(own.position ?? '') ? { position: moved } : {}
    if (String(own.content ?? '') === block.content && Number(own.published) === 1 && !move.position) return 0
    const answer = await apply({
      siteKey,
      action: 'content.update',
      params: {
        kind: 'module',
        id: Number(own.id),
        apply_id: applyId,
        fields: { content: block.content, published: 1, ...move }
      }
    })
    if (fail(answer)) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
    return 1
  }
  const position = await placed()
  if (!position) throw new Error('the site has no custom module position the pages print')
  const made = await apply({
    siteKey,
    action: 'content.update',
    params: {
      kind: 'module',
      apply_id: applyId,
      fields: {
        title: block.title,
        note: block.note,
        module: 'mod_custom',
        content: block.content,
        position,
        published: 1,
        showtitle: 0,
        access: 1,
        language: '*',
        ordering,
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
}
