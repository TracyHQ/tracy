// The stored place rules of an AI quickstart mapping file (ticket #584), across the whole file. Pure. Called by
// `mappingProblems` (`ai-quickstart-mapping.mjs`) with the block store, the page recipes and, when the folder has
// one, the draft report.
//   - every entity a location names is declared in `entities` (kind, identity; `created` for a record the build
//     creates because the blank site deletes the demo one);
//   - one writer per stored place: a place written by two entries is a problem, unless every entry is a field of a
//     place the block store declares shared (the build writes it once, within the smallest limit);
//   - the SEO limits, the SEO fields of every page type and the library: `ai-quickstart-mapping-seo.mjs`;
//   - no place falls out of the file unnoticed (language strings, fact places, notEmptied):
//     `ai-quickstart-mapping-coverage.mjs`;
//   - every build-sets reference and every unlisted `fact` place of the draft report is set by the mapping file;
//   - every button and every list whose rows can be fewer, on a record the blank site keeps, says how an empty one
//     leaves the page (`hides`): `ai-quickstart-mapping-hides.mjs`;
//   - a store with a network icon kept as a class name (`iconOf: "network"`, `storage: "class-name"`) has the
//     template's table from network to icon class (`networkIconClasses`), its networks those the build recognises.
import { locationKey, locationProblem } from './ai-quickstart-mapping-entry.mjs'
import { scopesOf, sharedPlacesOf } from './ai-quickstart-field-keys.mjs'
import { SOCIAL_NETWORKS } from './icon-social.mjs'
import { mappingCoverageProblems } from './ai-quickstart-mapping-coverage.mjs'
import { hideProblems } from './ai-quickstart-mapping-hides.mjs'
import { libraryProblems, seoProblems } from './ai-quickstart-mapping-seo.mjs'

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

/** Whether a block store has a network icon the template keeps as a class of its own icon font. */
function hasClassNameNetworkIcon(blockStore) {
  return (Array.isArray(blockStore?.blocks) ? blockStore.blocks : []).some(
    (b, i) =>
      isObject(b) &&
      scopesOf(b, `blocks[${i}]`).some((scope) =>
        scope.fields.some((f) => f?.iconOf === 'network' && f?.storage === 'class-name')
      )
  )
}

function networkIconProblems(table, blockStore, report) {
  if (table === undefined) {
    if (hasClassNameNetworkIcon(blockStore))
      report(
        'networkIconClasses',
        'the store keeps a network icon as a class name: give the template icon class of each network'
      )
    return
  }
  const at = 'networkIconClasses'
  if (!isObject(table) || !isObject(table.classes) || !isName(table.why))
    return report(at, 'networkIconClasses is {classes: {<network>: <class>}, why}')
  const known = SOCIAL_NETWORKS.map((n) => n.network)
  for (const [network, cls] of Object.entries(table.classes)) {
    if (!known.includes(network))
      report(
        `${at}.classes[${network}]`,
        `"${network}" is not a network the build recognises: ${known.join(', ')}`
      )
    else if (!isName(cls))
      report(`${at}.classes[${network}]`, 'the class names a glyph of the template icon font')
  }
}

/** Every stored place problem of a mapping file (see the head of this file). */
export function mappingPlaceProblems(mapping, { report, blockStore, pageRecipes, draftReport }) {
  const writers = writersOf(mapping)
  entityProblems(mapping, writers, report)
  oneWriterProblems(writers, blockStore, report)
  seoProblems(mapping.seo, pageRecipes, report)
  libraryProblems(mapping.library, pageRecipes, report)
  draftReportProblems(mapping, writers, draftReport, report)
  networkIconProblems(mapping.networkIconClasses, blockStore, report)
  mappingCoverageProblems(mapping, writers, { report, blockStore, draftReport })
  hideProblems(mapping, blockStore, report)
}
