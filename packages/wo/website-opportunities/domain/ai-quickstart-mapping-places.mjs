// The stored place rules of an AI quickstart mapping file (ticket #584), across the whole file. Pure. Called by
// `mappingProblems` (`ai-quickstart-mapping.mjs`) with the block store, the page recipes and, when the folder has
// one, the draft report.
//   - every entity a location names is declared in `entities` (kind, identity; `created` for a record the build
//     creates because the blank site deletes the demo one);
//   - one writer per stored place: a place written by two entries is a problem, unless every entry is a field of a
//     place the block store declares shared (the build writes it once, within the smallest limit);
//   - every page type of the recipes has its title, description and share image (`seo.pageTypes`), the share image
//     in the 1200x630 frame;
//   - the library position names a template position (`library.position`, with per page type exceptions);
//   - every build-sets reference and every unlisted `fact` place of the draft report is set by the mapping file.
import { locationKey, locationProblem } from './ai-quickstart-mapping-entry.mjs'
import { sharedPlacesOf } from './ai-quickstart-field-keys.mjs'

const SEO_FIELDS = ['title', 'description', 'shareImage']
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isLocation = (value) => isObject(value) && locationProblem(value) === null

/** Every location of the mapping file with where it sits and who writes it: field, fact, setting or build-sets. */
export function writersOf(mapping) {
  const out = []
  const walk = (value, at, writer) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${at}[${i}]`, writer))
    else if (isLocation(value)) out.push({ loc: value, at, writer })
    else if (isObject(value) && !Object.hasOwn(value, 'derived') && !Object.hasOwn(value, 'fact'))
      for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`, writer)
  }
  for (const [id, entry] of Object.entries(isObject(mapping.blocks) ? mapping.blocks : {}))
    for (const key of ['fields', 'itemFields', 'lists', 'itemLists'])
      if (entry?.[key] !== undefined) walk(entry[key], `blocks[${id}].${key}`, 'field')
  walk(mapping.facts ?? {}, 'facts', 'fact')
  ;(Array.isArray(mapping.overrides?.settings) ? mapping.overrides.settings : []).forEach((o, i) =>
    walk(o?.location, `overrides.settings[${i}].location`, 'setting')
  )
  for (const [ref, loc] of Object.entries(isObject(mapping.buildSets) ? mapping.buildSets : {}))
    walk(loc, `buildSets[${ref}]`, 'build-sets')
  return out
}

function entityProblems(mapping, writers, report) {
  if (!isObject(mapping.entities))
    return report('entities', 'entities must declare every entity a location names: {kind, identity}')
  for (const [key, e] of Object.entries(mapping.entities))
    if (!isObject(e) || !isName(e.kind)) report(`entities[${key}]`, 'an entity declares its kind')
  const seen = new Set()
  for (const { loc, at } of writers) {
    if (loc.entity === 'page' || seen.has(loc.entity)) continue
    seen.add(loc.entity)
    if (!Object.hasOwn(mapping.entities, loc.entity))
      report(at, `entity "${loc.entity}" is not declared in entities`)
  }
}

function oneWriterProblems(writers, blockStore, report) {
  const shared = new Set(sharedPlacesOf(blockStore).map((s) => s.place))
  const byPlace = new Map()
  for (const w of writers) byPlace.set(locationKey(w.loc), [...(byPlace.get(locationKey(w.loc)) ?? []), w])
  for (const list of byPlace.values()) {
    if (list.length < 2) continue
    const storeShared = list.every(
      (w) => w.writer === 'field' && isName(w.loc.slot) && shared.has(w.loc.slot)
    )
    if (!storeShared)
      report(
        list[1].at,
        `the stored place of ${list[0].at} has ${list.length} writers (${list.map((w) => w.writer).join(', ')}): one writer per place, unless the block store declares it shared`
      )
  }
}

function seoProblems(seo, pageRecipes, report) {
  if (!isObject(seo) || seo.pageTypes === undefined) return
  const frame = seo.shareImageFrame
  if (!(isObject(frame) && frame.width === 1200 && frame.height === 630))
    report('seo.shareImageFrame', 'the share image frame is {width: 1200, height: 630}')
  const locs = (v) => Array.isArray(v) && v.length > 0 && v.every(isLocation)
  const types = (Array.isArray(pageRecipes?.recipes) ? pageRecipes.recipes : []).map((r) => r?.pageType)
  for (const type of types.filter(isName)) {
    const at = `seo.pageTypes[${type}]`
    const decl = seo.pageTypes?.[type]
    const record = isName(decl) ? seo[decl] : decl
    if (!isObject(record)) {
      report(at, `page type "${type}" has no SEO fields: name a record of seo or declare them`)
      continue
    }
    for (const name of SEO_FIELDS) {
      const v = record[name]
      if (!(locs(v) || (isObject(v) && isName(v.derived))))
        report(
          `${at}.${name}`,
          `${name}: a list of locations, or {derived} with what the template draws it from`
        )
    }
  }
}

function libraryProblems(library, pageRecipes, report) {
  if (!isObject(library) || !isName(library.position))
    return report('library.position', 'name the template position the Tracy library blocks are published in')
  const types = new Set((pageRecipes?.recipes ?? []).map((r) => r?.pageType))
  for (const [type, position] of Object.entries(library.pageTypes ?? {}))
    if (!types.has(type) || !isName(position))
      report(`library.pageTypes[${type}]`, 'a page type of the recipes, with the position it uses instead')
}

function draftReportProblems(mapping, writers, draftReport, report) {
  if (!isObject(draftReport)) return
  const sets = isObject(mapping.buildSets) ? mapping.buildSets : {}
  for (const ref of (draftReport.references?.classed ?? []).filter((r) => r?.as === 'build-sets')) {
    const loc = sets[ref.at]
    const named =
      isLocation(loc) && `${loc.entity}:${loc.column}:${(loc.jsonPath ?? []).join('.')}` === ref.at
    if (!named)
      report(
        `buildSets[${ref.at}]`,
        `build-sets reference ${ref.at} (to ${ref.to}) is not set: give its location`
      )
  }
  const factSlots = new Set(writers.filter((w) => w.writer === 'fact').map((w) => w.loc.slot))
  for (const e of (draftReport.unlisted ?? []).filter((u) => u?.as === 'fact'))
    if (!factSlots.has(e.slot))
      report('facts', `${e.slot} is classed fact by the draft report but is no fact place`)
}

/** Every stored place problem of a mapping file (see the head of this file). */
export function mappingPlaceProblems(mapping, { report, blockStore, pageRecipes, draftReport }) {
  const writers = writersOf(mapping)
  entityProblems(mapping, writers, report)
  oneWriterProblems(writers, blockStore, report)
  seoProblems(mapping.seo, pageRecipes, report)
  libraryProblems(mapping.library, pageRecipes, report)
  draftReportProblems(mapping, writers, draftReport, report)
}
