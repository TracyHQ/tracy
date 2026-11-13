// How the build writes each block of an AI quickstart, and what a copy of a store block inherits (ticket #584). Pure.
// Called by `mappingProblems` (`ai-quickstart-mapping.mjs`) once the mapping file is written.
//
// Every block of the store declares its `placement` (`PLACEMENTS`):
//   - `copy`: an in-page block. The build copies the store record into a new record for every placed block, writes
//     the copy with the plugin's open write (`content.update`), and assigns the copy to its page. The plugin guards
//     no copy: the build keeps the limits, hides and icons of the kit and reads the copy back.
//   - `in-place`: single-instance site chrome. The store record itself is written through `content.contract` on the
//     bound blank site contract, and assigned to the pages that place it.
//   - `created`: a page body. The build creates the records it shows (articles, a contact, menu items).
// The mapping file says, per copy and in-place block, in `placements: {"<block id>": entry}`:
//   - `entity`: the store record copied or written (a copy: a module), and `assign` (`ASSIGN`), the module assignment:
//       `page`         a copy only: one copy for every page whose recipe places the block, assigned `"[<page id>]"`;
//       `every-page`   one record (one copy, or the in-place store record) assigned `"[0]"`: every page of the site,
//                      including a detail page with no menu item of its own; only a block every recipe places;
//       `recipe-pages` one record assigned `"[<id>, <id>...]"`, the pages whose recipe places it; a detail page with
//                      no menu item of its own prints it only when the menu item Joomla gives that page is listed;
//     an in-place entry with no `entity` is drawn by the template layout itself (the T4 header): `layout: {why}`,
//     and has no record to assign;
//   - `title`: `{drawn, field?, why}` whether a page draws the module title, and as what (`TITLE_DRAWN`); a title
//     drawn as `content` or `tab-label` names the store field written there;
//   - `resets`: `[{location, from, why}]` the inherited settings each copy must change (`RESET_SOURCES`): a
//     `buildSets` place or a `hides` setting of the block on the copy's record, the `position` the copy takes from
//     its container, an `ordering` from the recipe, a `demo` value;
//   - `inside` and `holds`: the container rules (`ai-quickstart-placement-container.mjs`);
//   - `menu`: `{menutype, why}` the menu a menu block draws, a menutype of a menu item entity of the mapping file;
//     the build creates its items there.
import { locationKey, locationProblem } from './ai-quickstart-mapping-entry.mjs'
import { containerProblems } from './ai-quickstart-placement-container.mjs'

export const PLACEMENTS = Object.freeze(['copy', 'in-place', 'created'])
export const TITLE_DRAWN = Object.freeze(['content', 'tab-label', 'aria-label', 'no'])
export const RESET_SOURCES = Object.freeze(['buildSets', 'hides', 'container', 'recipe', 'demo'])
export const ASSIGN = Object.freeze(['page', 'every-page', 'recipe-pages'])
const IN_PLACE_ASSIGN = ['every-page', 'recipe-pages']
/** The columns of a module record a copy carries (the plugin's open write accepts them on a new module). */
export const MODULE_COLUMNS = Object.freeze([
  'title',
  'note',
  'content',
  'position',
  'module',
  'access',
  'showtitle',
  'params',
  'published',
  'language',
  'ordering'
])
/** The kept records a created block may write besides the records the build creates: written once, in place. */
const CREATED_BLOCK_KEPT_KINDS = ['languageString', 'field']

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])
const locationsIn = (value, out = []) => {
  if (Array.isArray(value)) for (const v of value) locationsIn(v, out)
  else if (isObject(value) && isName(value.entity) && isName(value.column)) out.push(value)
  else if (isObject(value) && !Object.hasOwn(value, 'fact'))
    for (const [k, v] of Object.entries(value)) if (k !== 'keyAt') locationsIn(v, out)
  return out
}
const blockLocations = (entry) =>
  locationsIn(['fields', 'itemFields', 'lists', 'itemLists'].map((k) => entry?.[k]))

function titleProblems(entry, at, { mapping, report }) {
  const title = entry.title
  if (!isObject(title) || !TITLE_DRAWN.includes(title.drawn) || !isName(title.why))
    return report(`${at}.title`, `title is {drawn: ${TITLE_DRAWN.join(' | ')}, field?, why}`)
  const drawsField = title.drawn === 'content' || title.drawn === 'tab-label'
  if (!drawsField) {
    if (title.field !== undefined)
      report(`${at}.title.field`, `a title drawn as ${title.drawn} names no field`)
    return
  }
  const named = title.field
  const locs = each([mapping.blocks?.[named?.block]?.fields?.[named?.name]].flat()).filter(isObject)
  if (!isName(named?.block) || !isName(named?.name) || locs.length === 0)
    return report(`${at}.title.field`, 'a drawn title names {block, name}, a store field of the mapping file')
  if (!locs.every((l) => l.entity === entry.entity && l.column === 'title'))
    report(`${at}.title.field`, `the field is not stored at the title of ${entry.entity}`)
}

function resetProblems(entry, at, { id, mapping, report }) {
  const resets = entry.resets ?? []
  if (!Array.isArray(resets)) return report(`${at}.resets`, 'resets is a list of {location, from, why}')
  resets.forEach((r, i) => {
    const rAt = `${at}.resets[${i}]`
    const problem = locationProblem(r?.location)
    if (problem) return report(`${rAt}.location`, problem)
    if (r.location.entity !== entry.entity)
      report(`${rAt}.location`, `a reset is a setting of the copied record ${entry.entity}`)
    else if (!MODULE_COLUMNS.includes(r.location.column))
      report(
        `${rAt}.location`,
        `a module record has no column ${r.location.column}: a reset names one of ${MODULE_COLUMNS.join(', ')}`
      )
    if (!RESET_SOURCES.includes(r.from))
      report(`${rAt}.from`, `from must be one of ${RESET_SOURCES.join(', ')}`)
    if (!isName(r.why)) report(`${rAt}.why`, 'a reset says why the copy changes it')
  })
  const declared = (from) =>
    new Set(
      resets.filter((r) => r?.from === from && isObject(r.location)).map((r) => locationKey(r.location))
    )
  const sets = Object.values(isObject(mapping.buildSets) ? mapping.buildSets : {}).filter(
    (b) => isObject(b) && b.entity === entry.entity
  )
  const settings = each(mapping.hides?.[id]).filter((h) => h?.by === 'setting' && isObject(h.location))
  for (const [from, places] of [
    ['buildSets', sets],
    ['hides', settings.map((h) => h.location)]
  ]) {
    const want = new Set(places.map((p) => locationKey({ ...p, slot: undefined })))
    const have = declared(from)
    for (const key of want)
      if (!have.has(key))
        report(`${at}.resets`, `a copy inherits ${key} (${from}): declare it as a reset from ${from}`)
    for (const key of have)
      if (!want.has(key)) report(`${at}.resets`, `no ${from} entry of the mapping file names ${key}`)
  }
}

/** Every placement problem of a written mapping file. */
export function placementProblems(mapping, blocks, ctx) {
  const { report, reportStore } = ctx
  const entries = isObject(mapping.placements) ? mapping.placements : {}
  if (mapping.placements !== undefined && !isObject(mapping.placements))
    report('placements', 'placements maps a block id to how it is placed')
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const entityOf = new Map()
  const recipes = each(ctx.pageRecipes?.recipes).filter((r) => isObject(r) && Array.isArray(r.blocks))
  const menutypes = new Set(
    Object.values(isObject(mapping.entities) ? mapping.entities : {})
      .filter((e) => e?.kind === 'menuItem' && isName(e.identity?.menutype))
      .map((e) => e.identity.menutype)
  )
  for (const block of blocks) {
    if (!PLACEMENTS.includes(block.placement)) {
      reportStore(`blocks[${block.id}].placement`, `placement must be one of ${PLACEMENTS.join(', ')}`)
      continue
    }
    const at = `placements[${block.id}]`
    const entry = entries[block.id]
    if (block.placement === 'created') {
      if (entry !== undefined) report(at, 'a created block places no store record')
      createdRecordProblems(block, mapping, report)
      continue
    }
    if (!isObject(entry)) {
      report(at, `a ${block.placement} block says how it is placed`)
      continue
    }
    const record = mapping.entities?.[entry.entity]
    if (entry.entity === undefined) layoutProblems(block, entry, at, report)
    else if (!isObject(record) || record.created)
      report(`${at}.entity`, `${JSON.stringify(entry.entity)} is no record the blank site keeps`)
    else {
      entityOf.set(block.id, entry.entity)
      if (entry.layout !== undefined)
        report(`${at}.layout`, 'a block that names its store record is not drawn by the layout')
      if (block.placement === 'copy' && record.kind !== 'module')
        report(`${at}.entity`, 'a copy is a copy of a module')
      assignProblems(block, entry, at, { recipes, report })
      if (record.kind === 'module') titleProblems(entry, at, { mapping, report })
      if (record.identity?.module === 'mod_menu' && entry.menu === undefined)
        report(`${at}.menu`, 'a menu block names the menu it draws')
    }
    if (entry.menu !== undefined && (!isName(entry.menu?.menutype) || !isName(entry.menu?.why)))
      report(`${at}.menu`, 'menu is {menutype, why}')
    else if (entry.menu !== undefined && !menutypes.has(entry.menu.menutype))
      report(
        `${at}.menu.menutype`,
        `"${entry.menu.menutype}" is no menu the kit knows (the menutype of a menu item entity: ${[...menutypes].join(', ') || 'none'})`
      )
    if (block.placement !== 'copy') {
      if (entry.resets !== undefined) report(`${at}.resets`, 'only a copy resets what it inherits')
      for (const h of each(mapping.hides?.[block.id]))
        if (h?.by === 'row')
          report(
            `hides[${block.id}]`,
            'a row removal runs on a copy: the plugin refuses it on the blank site contract'
          )
    } else resetProblems(entry, at, { id: block.id, mapping, report })
    containerProblems(block, entry, at, { entries, byId, report })
  }
  for (const id of Object.keys(entries))
    if (!byId.has(id)) report(`placements[${id}]`, `"${id}" is not a block of the store`)
  copyRecordProblems(mapping, blocks, entityOf, report)
}

/**
 * An in-place entry with no `entity` is drawn by the template layout on every page (the T4 header): it says so with
 * `layout: {why}`, and has no record to assign, no title and nothing to reset. A copy always names its record.
 */
function layoutProblems(block, entry, at, report) {
  if (block.placement === 'copy') return report(`${at}.entity`, 'a copy names the store record it copies')
  if (!isName(entry.layout?.why))
    return report(
      `${at}.layout`,
      'an in-place block names its store record (entity, assign), or the layout draws it: layout is {why}'
    )
  for (const key of ['assign', 'title', 'resets', 'holds', 'inside'])
    if (entry[key] !== undefined)
      report(`${at}.${key}`, `a block the layout draws has no record, so no ${key}`)
}

/**
 * `assign` (`ASSIGN`): a copy takes any of the three, an in-place store record `every-page` or `recipe-pages`. A block
 * assigned to every page must be one every recipe places: `"[0]"` prints it on every page of the site.
 */
function assignProblems(block, entry, at, { recipes, report }) {
  const allowed = block.placement === 'in-place' ? IN_PLACE_ASSIGN : ASSIGN
  if (!allowed.includes(entry.assign))
    return report(
      `${at}.assign`,
      `assign is ${ASSIGN.join(', ')}; a block written in place is one record, assigned to every-page or recipe-pages`
    )
  if (entry.assign !== 'every-page') return
  const without = recipes.filter((r) => !r.blocks.includes(block.id)).map((r) => r.pageType)
  if (without.length)
    report(
      `${at}.assign`,
      `every-page ("[0]") prints the block on every page, but the recipes of ${without.join(', ')} do not place it: assign it to recipe-pages`
    )
}

/**
 * A created block writes the records the build creates, and the kept records written once in place beside them (a
 * site language string, a custom field): never a store module, which is a copy or an in-place block of its own.
 */
function createdRecordProblems(block, mapping, report) {
  for (const loc of blockLocations(mapping.blocks?.[block.id])) {
    const record = mapping.entities?.[loc.entity]
    if (record?.created || CREATED_BLOCK_KEPT_KINDS.includes(record?.kind)) continue
    report(
      `blocks[${block.id}]`,
      `a created block writes ${loc.entity}, a record the build does not create (only ${CREATED_BLOCK_KEPT_KINDS.join(' or ')} records are kept beside them)`
    )
    break
  }
}

/**
 * A copy writes its own record: every location of a copy block names the copied record, the record of a block it
 * holds, a record the build creates, or a site language string (written once, in place).
 */
function copyRecordProblems(mapping, blocks, entityOf, report) {
  for (const block of blocks) {
    if (block.placement !== 'copy' || !entityOf.has(block.id)) continue
    const own = new Set([
      entityOf.get(block.id),
      ...each(mapping.placements[block.id].holds?.blocks).map((h) => entityOf.get(h))
    ])
    for (const loc of blockLocations(mapping.blocks?.[block.id])) {
      const record = mapping.entities?.[loc.entity]
      if (own.has(loc.entity) || record?.created || record?.kind === 'languageString') continue
      report(`blocks[${block.id}]`, `a copy writes ${loc.entity}, a record it does not copy`)
      break
    }
  }
}
