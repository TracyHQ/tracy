// The coverage rules of an AI quickstart mapping file (ticket #584): no place the build must write, or the blank site
// must empty, may fall out of the file unnoticed. Pure. Called by `mappingPlaceProblems`
// (`ai-quickstart-mapping-places.mjs`) with the writers of the file, the block store and the draft report.
//   - a language string a store field fills has its override (`overrides.language[]` with the string's slot), filled
//     by exactly the fields that fill it (`filledBy`), within the smallest limit of those fields (`limit`);
//   - a store field written as a business fact (`{fact}`) has every place it stands for among the fact's places;
//   - Joomla's global configuration carries the site name and the mail sender name: both are places of the name fact;
//   - a template string the draft report says the build hides (`hiddenStrings`) has its override with the kit's value,
//     and a language override that hides a string (an empty value) is one of them;
//   - every declared entity is named by a location of the file, by `emptiedNotWritten`, or by `notEmptied`, and every
//     record `notEmptied` names is declared;
//   - `emptiedNotWritten` is `[{entity, column, jsonPath?, why}]`: a place the blank site empties though no build
//     writes it (a sender identity the site owner sets with the sending mailbox), so no location of the file writes it;
//   - `notEmptied` is `[{entity, slot? | column?, why}]`, and a place the draft report lists outside the store or
//     unlisted (other than `kept`, which the draft report itself gives a reason for), on a record the blank site
//     keeps, that the file does not write, is one `notEmptied` names.
import { locationKey, locationProblem } from './ai-quickstart-mapping-entry.mjs'
import { scopesOf } from './ai-quickstart-field-keys.mjs'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])
/** The record a place (`<entity>.<n>`, or `<entity>.<n>@<xpath>`) belongs to. */
export const entityOfPlace = (place) => place.split('@')[0].replace(/\.[^.]*$/, '')

/** Joomla's global configuration columns that hold a business fact: the site name and the mail sender name. */
export const GLOBAL_CONFIGURATION_FACTS = Object.freeze({ sitename: 'name', fromname: 'name' })

/** Every store field that writes a place: `Map(place -> [{block, field, limit?, fieldEntry}])`. */
function storeUses(blockStore, mapping) {
  const uses = new Map()
  for (const block of list(blockStore?.blocks)) {
    if (!isObject(block) || !isName(block.id)) continue
    const entry = mapping.blocks?.[block.id]
    for (const scope of scopesOf(block, `blocks[${block.id}]`)) {
      const mapped =
        scope.kind === 'block' ? entry?.fields : scope.kind === 'item' ? entry?.itemFields : undefined
      for (const field of list(scope.fields)) {
        if (!isObject(field) || !isName(field.name) || field.type === 'design') continue
        // A field's own slot, or one slot per item (a list row's slots nest one level per parent place).
        const places = isName(field.slot)
          ? [[field.slot, 0]]
          : list(field.slots).flatMap((p, i) => (Array.isArray(p) ? p.flat(2) : [p]).map((x) => [x, i]))
        for (const [place, i] of places) {
          if (!isName(place)) continue
          const m = mapped?.[field.name]
          const fieldEntry = Array.isArray(m) ? m[i] : m
          const use = { block: block.id, field: field.name, fieldEntry }
          if (Number.isInteger(field.limit)) use.limit = field.limit
          uses.set(place, [...(uses.get(place) ?? []), use])
        }
      }
    }
  }
  return uses
}

function languageProblems(mapping, uses, report) {
  const overrides = list(mapping.overrides?.language)
  for (const [place, users] of uses) {
    if (mapping.entities?.[entityOfPlace(place)]?.kind !== 'languageString') continue
    const at = overrides.findIndex((o) => o?.slot === place)
    const named = users.map((u) => `${u.block}.${u.field}`).sort()
    if (at < 0) {
      report(
        'overrides.language',
        `${place} is filled by ${named.join(', ')}: give its override, filledBy them`
      )
      continue
    }
    const o = overrides[at]
    const filled = list(o.filledBy)
      .map((f) => `${f?.block}.${f?.field}`)
      .sort()
    if (JSON.stringify(filled) !== JSON.stringify(named))
      report(
        `overrides.language[${at}].filledBy`,
        `${o.key} is filled by ${named.join(', ')}, not ${filled.join(', ')}`
      )
    const limits = users.map((u) => u.limit).filter(Number.isInteger)
    const smallest = limits.length ? Math.min(...limits) : null
    if (!Number.isInteger(o.limit) || (smallest !== null && o.limit > smallest))
      report(
        `overrides.language[${at}].limit`,
        `${o.key}: the limit is at most ${smallest}, the smallest limit of the fields that fill it`
      )
  }
}

function factProblems(mapping, writers, uses, report) {
  const factPlaces = new Map()
  for (const w of writers.filter((x) => x.writer === 'fact')) {
    const fact = /^facts\.([^[]+)/.exec(w.at)?.[1]
    const key = isName(w.loc.slot) ? w.loc.slot : `${w.loc.entity}:${w.loc.column}`
    factPlaces.set(fact, new Set([...(factPlaces.get(fact) ?? []), key]))
  }
  for (const [place, users] of uses)
    for (const u of users) {
      const fact = u.fieldEntry?.fact
      if (isName(fact) && !factPlaces.get(fact)?.has(place))
        report(
          `facts.${fact}`,
          `${place} (${u.block}.${u.field}, written as the ${fact} fact) is no place of the fact`
        )
    }
  for (const [key, e] of Object.entries(mapping.entities ?? {}))
    if (e?.kind === 'globalConfiguration')
      for (const [column, fact] of Object.entries(GLOBAL_CONFIGURATION_FACTS))
        if (!factPlaces.get(fact)?.has(`${key}:${column}`))
          report(
            `facts.${fact}`,
            `${key} ${column} holds the business ${fact}: list it among the fact's places`
          )
}

/** Whether a notEmptied entry names a place of `entity` (the whole record, the slot, or the column). */
const covers = (n, entity, slot, column) =>
  n?.entity === entity &&
  ((n.slot === undefined && n.column === undefined) || n.slot === slot || (column && n.column === column))

function notEmptiedProblems(mapping, writers, draftReport, report) {
  const notEmptied = mapping.notEmptied
  if (notEmptied !== undefined && !Array.isArray(notEmptied))
    return report('notEmptied', 'notEmptied is a list of {entity, slot? | column?, why}')
  list(notEmptied).forEach((n, i) => {
    const ok =
      isObject(n) &&
      isName(n.entity) &&
      isName(n.why) &&
      !(n.slot !== undefined && n.column !== undefined) &&
      (n.slot === undefined || (isName(n.slot) && entityOfPlace(n.slot) === n.entity)) &&
      (n.column === undefined || isName(n.column))
    if (!ok)
      report(
        `notEmptied[${i}]`,
        'a notEmptied entry is {entity, slot? | column?, why}, a slot of that entity'
      )
  })
  const named = new Set(
    [...writers.map((w) => w.loc), ...list(mapping.emptiedNotWritten)].map((l) => l?.entity)
  )
  for (const key of Object.keys(mapping.entities ?? {}))
    if (!named.has(key) && !list(notEmptied).some((n) => n?.entity === key))
      report(
        `entities[${key}]`,
        `no location names ${key}: write it, or say in notEmptied why the blank site keeps it`
      )
  list(notEmptied).forEach((n, i) => {
    if (isName(n?.entity) && !Object.hasOwn(mapping.entities ?? {}, n.entity))
      report(`notEmptied[${i}]`, `entity "${n.entity}" is not declared in entities`)
  })
  // A module's title is stored outside its params, often outside the content map, and can hold a demo word (a
  // trainer's name): a kept module has its title written, or classed in notEmptied (the whole record, its title
  // column, or the content map slot of its title).
  for (const [key, e] of Object.entries(mapping.entities ?? {})) {
    if (e?.kind !== 'module' || e.created || !named.has(key)) continue
    const written = writers.some((w) => w.loc.entity === key && w.loc.column === 'title' && !w.loc.jsonPath)
    const classed = list(notEmptied).some(
      (n) =>
        n?.entity === key &&
        (n.column === 'title' || n.slot !== undefined || (n.column ?? n.slot) === undefined)
    )
    if (!written && !classed)
      report(
        `entities[${key}]`,
        `the title of ${key} is written by no field: write it, or say in notEmptied (column "title") why the blank site keeps it`
      )
  }
  if (!isObject(draftReport)) return
  const written = new Set(writers.map((w) => w.loc.slot).filter(isName))
  const strings = new Set(list(mapping.overrides?.language).map((o) => o?.slot))
  for (const u of [...list(draftReport.outsideStore), ...list(draftReport.unlisted)]) {
    if (!isName(u?.slot) || u.as === 'fact' || u.as === 'kept' || written.has(u.slot)) continue
    const entity = entityOfPlace(u.slot)
    if (mapping.entities?.[entity]?.created) continue
    // A language string is kept or set by its override; a module or custom field row stays on the blank site (the
    // step deletes the pages, articles, categories, contacts and accounts the build creates again).
    if (entity.startsWith('languageString-')) {
      if (!strings.has(u.slot))
        report(
          'overrides.language',
          `${u.slot} (${u.as}) is written by no field: give its override, or keep it`
        )
    } else if (
      /^(module|field)-/.test(entity) &&
      !list(notEmptied).some((n) => covers(n, entity, u.slot, u.at))
    )
      report(
        'notEmptied',
        `${u.slot} (${u.as}) is kept on the blank site and written by no field: say why in notEmptied`
      )
  }
}

/** The hidden template strings of the draft report, and the language overrides that carry a value. */
function hiddenStringProblems(mapping, draftReport, report) {
  if (!isObject(draftReport)) return
  const hidden = list(draftReport.hiddenStrings)
  const overrides = list(mapping.overrides?.language)
  for (const h of hidden)
    if (!overrides.some((o) => o?.key === h?.constant && o.value === h.value))
      report(
        'overrides.language',
        `${h?.constant} is hidden by the build (the draft report's hiddenStrings): give its override with value ${JSON.stringify(h?.value)}`
      )
  overrides.forEach((o, i) => {
    if (o?.value === '' && !hidden.some((h) => h?.constant === o.key))
      report(
        `overrides.language[${i}].value`,
        `${o.key} is hidden by an empty value no hidden string of the draft report accounts for: decide it in hiddenStrings`
      )
  })
}

/** The places the blank site empties though no build writes them: declared, said why, and written by nothing. */
function emptiedNotWrittenProblems(mapping, writers, report) {
  const value = mapping.emptiedNotWritten
  if (value === undefined) return
  if (!Array.isArray(value))
    return report('emptiedNotWritten', 'emptiedNotWritten is a list of {entity, column, jsonPath?, why}')
  const written = new Set(writers.map((w) => locationKey(w.loc)))
  value.forEach((e, i) => {
    const at = `emptiedNotWritten[${i}]`
    const { why, ...loc } = isObject(e) ? e : {}
    if (!isObject(e) || locationProblem(loc) !== null || !isName(why))
      return report(
        at,
        'an entry is {entity, column, jsonPath?, why}: a stored place and why no build writes it'
      )
    if (!Object.hasOwn(mapping.entities ?? {}, loc.entity))
      report(at, `entity "${loc.entity}" is not declared in entities`)
    if (written.has(locationKey(loc)))
      report(
        at,
        `${loc.entity} ${loc.column} is written by the file too: a place is written, or emptied only`
      )
  })
}

/** Every coverage problem of a mapping file (see the head of this file). */
export function mappingCoverageProblems(mapping, writers, { report, blockStore, draftReport }) {
  const uses = storeUses(blockStore, mapping)
  languageProblems(mapping, uses, report)
  factProblems(mapping, writers, uses, report)
  hiddenStringProblems(mapping, draftReport, report)
  emptiedNotWrittenProblems(mapping, writers, report)
  notEmptiedProblems(mapping, writers, draftReport, report)
}
