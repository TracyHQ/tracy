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
//   - `entity`: the store record copied or written (a copy: a module); `assign`: `page` (the page it is placed on)
//     or `pages` (every page whose recipe places it); an in-place block is assigned to `pages`;
//   - `title`: `{drawn, field?, why}` whether a page draws the module title, and as what (`TITLE_DRAWN`); a title
//     drawn as `content` or `tab-label` names the store field written there;
//   - `resets`: `[{location, from, why}]` the inherited settings each copy must change (`RESET_SOURCES`): a
//     `buildSets` place or a `hides` setting of the block on the copy's record, the `position` the copy takes from
//     its container, an `ordering` from the recipe, a `demo` value;
//   - `inside` (a block placed `inside:<id>`) and `holds` (that container): the container copy draws the copies of
//     its position assigned to the page, so a held copy takes the position written at `holds.position`;
//   - `menu`: `{menutype, why}` the menu a menu block draws, where the build creates its items.
import { locationKey, locationProblem } from './ai-quickstart-mapping-entry.mjs'

export const PLACEMENTS = Object.freeze(['copy', 'in-place', 'created'])
export const TITLE_DRAWN = Object.freeze(['content', 'tab-label', 'aria-label', 'no'])
export const RESET_SOURCES = Object.freeze(['buildSets', 'hides', 'container', 'recipe', 'demo'])
const ASSIGN = ['page', 'pages']

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
const insideOf = (block) =>
  each(block.positions)
    .find((p) => typeof p === 'string' && p.startsWith('inside:'))
    ?.slice('inside:'.length)

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

function containerProblems(block, entry, at, { entries, report }) {
  const container = insideOf(block)
  if (container !== undefined) {
    if (entry.inside?.block !== container || !isName(entry.inside?.why))
      report(
        `${at}.inside`,
        `the block is placed inside ${container}: inside is {block: "${container}", why}`
      )
    if (!each(entries[container]?.holds?.blocks).includes(block.id))
      report(`${at}.inside`, `the placement of ${container} does not hold ${block.id}`)
    if (!each(entry.resets).some((r) => r?.from === 'container' && r.location?.column === 'position'))
      report(`${at}.resets`, 'a held copy takes the position of its container copy: a reset from container')
  } else if (entry.inside !== undefined) report(`${at}.inside`, 'the block is placed inside no other block')
  if (entry.holds === undefined) return
  const holds = entry.holds
  if (!Array.isArray(holds?.blocks) || !isName(holds.why) || locationProblem(holds.position))
    return report(`${at}.holds`, 'holds is {blocks, position: <location>, why}')
  if (holds.position.entity !== entry.entity)
    report(`${at}.holds.position`, `the position the container draws is a setting of ${entry.entity}`)
}

/** Every placement problem of a written mapping file. */
export function placementProblems(mapping, blocks, { report, reportStore }) {
  const entries = isObject(mapping.placements) ? mapping.placements : {}
  if (mapping.placements !== undefined && !isObject(mapping.placements))
    report('placements', 'placements maps a block id to how it is placed')
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const entityOf = new Map()
  for (const block of blocks) {
    if (!PLACEMENTS.includes(block.placement)) {
      reportStore(`blocks[${block.id}].placement`, `placement must be one of ${PLACEMENTS.join(', ')}`)
      continue
    }
    const at = `placements[${block.id}]`
    const entry = entries[block.id]
    if (block.placement === 'created') {
      if (entry !== undefined) report(at, 'a created block places no store record')
      continue
    }
    if (!isObject(entry)) {
      report(at, `a ${block.placement} block says how it is placed`)
      continue
    }
    const record = mapping.entities?.[entry.entity]
    if (entry.entity === undefined) {
      if (block.placement === 'copy') report(`${at}.entity`, 'a copy names the store record it copies')
    } else if (!isObject(record) || record.created)
      report(`${at}.entity`, `${JSON.stringify(entry.entity)} is no record the blank site keeps`)
    else {
      entityOf.set(block.id, entry.entity)
      if (block.placement === 'copy' && record.kind !== 'module')
        report(`${at}.entity`, 'a copy is a copy of a module')
      if (!ASSIGN.includes(entry.assign) || (block.placement === 'in-place' && entry.assign !== 'pages'))
        report(`${at}.assign`, `assign is page or pages; a block written in place is assigned to pages`)
      if (record.kind === 'module') titleProblems(entry, at, { mapping, report })
      if (record.identity?.module === 'mod_menu' && entry.menu === undefined)
        report(`${at}.menu`, 'a menu block names the menu it draws')
    }
    if (entry.menu !== undefined && (!isName(entry.menu?.menutype) || !isName(entry.menu?.why)))
      report(`${at}.menu`, 'menu is {menutype, why}')
    if (block.placement !== 'copy') {
      if (entry.resets !== undefined) report(`${at}.resets`, 'only a copy resets what it inherits')
      for (const h of each(mapping.hides?.[block.id]))
        if (h?.by === 'row')
          report(
            `hides[${block.id}]`,
            'a row removal runs on a copy: the plugin refuses it on the blank site contract'
          )
    } else resetProblems(entry, at, { id: block.id, mapping, report })
    containerProblems(block, entry, at, { entries, report })
  }
  for (const id of Object.keys(entries))
    if (!byId.has(id)) report(`placements[${id}]`, `"${id}" is not a block of the store`)
  copyRecordProblems(mapping, blocks, entityOf, report)
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
