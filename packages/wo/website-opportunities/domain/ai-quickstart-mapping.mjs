// The mapping file half of the AI quickstart contract check (ADR 0046 decision 2, ticket #581): where each field and
// each business fact is written, which config lines are design, the SEO fields and the overrides. Called by
// `checkAiQuickstartContract` (`ai-quickstart-contract.mjs`) with the blocks of the block store.
//
// An entry is a location (the shape of a content map slot), a business fact or a derived source:
// `ai-quickstart-mapping-entry.mjs`. `entity: "page"` names the page the build creates (the SEO fields). The rules
// on stored places across the whole file (one writer per place, every entity declared, the SEO of every page type,
// the build-sets references) are in `ai-quickstart-mapping-places.mjs`.
import { CHILD_LIST_KEYS, rowCountProblems, sameRows } from './ai-quickstart-child-lists.mjs'
import {
  entryProblem,
  isDerivedEntry,
  isFactEntry,
  locationKey,
  locationProblem
} from './ai-quickstart-mapping-entry.mjs'
import { mappingPlaceProblems } from './ai-quickstart-mapping-places.mjs'
import { LIST_FACT_KINDS, SINGLE_FACT_KINDS } from './needs-profile-merge.mjs'

/** The business facts of the site form, each declared once and fanned out to every place the template shows it. */
export const BUSINESS_FACTS = Object.freeze({
  name: 'business.name',
  phone: 'contact.phone',
  address: 'contact.address',
  email: 'contact.email',
  social: 'contact.social_url',
  logoLight: 'business.logo',
  logoDark: 'business.logo'
})
/** The SEO fields every page type carries; the share image is always this frame. */
export const SEO_FIELDS = Object.freeze(['title', 'description', 'shareImage'])
export const SHARE_IMAGE_FRAME = Object.freeze({ width: 1200, height: 630 })
export const MAPPING_SCHEMA = 'tracy-ai-quickstart-mapping/v1'

const FACT_KINDS = new Set(Object.values(BUSINESS_FACTS))

/** Whether a field place (`blocks[<id>]...fields[<name>]...`) is one a factExceptions entry {block, list?, field} names. */
function isFactException(exceptions, fieldAt) {
  return (Array.isArray(exceptions) ? exceptions : []).some((e) => {
    if (!fieldAt.startsWith(`blocks[${e?.block}].`)) return false
    if (e.list) return fieldAt.includes(`[${e.list}].fields[${e.field}]`)
    return fieldAt.includes(`.fields[${e.field}]`) || fieldAt.includes(`.itemFields[${e.field}]`)
  })
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''

function checkLocation(loc, at, report) {
  const problem = locationProblem(loc)
  if (problem) report(at, problem)
  return !problem
}

function blockMappingProblems(block, entry, ctx) {
  const at = `blocks[${block.id}]`
  if (!isObject(entry)) return ctx.report(at, `no mapping for block "${block.id}"`)
  const designLines = new Set()
  if (entry.designLines !== undefined) {
    if (!Array.isArray(entry.designLines))
      ctx.report(`${at}.designLines`, 'designLines must be a list of locations')
    else
      entry.designLines.forEach((loc, i) => {
        if (checkLocation(loc, `${at}.designLines[${i}]`, ctx.report)) designLines.add(locationKey(loc))
      })
  }
  const storeFields = Array.isArray(block.fields) ? block.fields.filter((f) => isName(f?.name)) : []
  const storeItemFields = Array.isArray(block.itemFields)
    ? block.itemFields.filter((f) => isName(f?.name))
    : []
  const maxItems = Number.isInteger(block.items?.max) ? block.items.max : 1

  const judge = (field, loc, fieldAt, storeAt) => {
    if (isFactEntry(loc) || isDerivedEntry(loc)) {
      const problem = entryProblem(loc, field, ctx)
      if (problem) ctx.report(fieldAt, problem)
      else if (field.keyAt !== undefined && JSON.stringify(loc.keyAt) !== JSON.stringify(field.keyAt))
        ctx.report(`${fieldAt}.keyAt`, "keyAt must repeat the store field's keyAt")
      return
    }
    const problem = entryProblem(loc, field, ctx)
    if (problem) return ctx.report(fieldAt, problem)
    if (FACT_KINDS.has(field.kind) && !isFactException(ctx.factExceptions, fieldAt))
      ctx.report(
        fieldAt,
        `field kind ${field.kind} is a business fact: write it as {fact}, or declare the field in factExceptions`
      )
    const isDesignLine = designLines.has(locationKey(loc))
    if (field.type === 'design' && !isDesignLine)
      ctx.report(fieldAt, `design field "${field.name}" is not one of the block's designLines`)
    if (field.type !== 'design' && typeof field.type === 'string' && isDesignLine)
      ctx.reportStore(
        `${storeAt}.type`,
        `design value typed as ${field.type}: its location is a design line, type it design`
      )
  }

  const mapped = isObject(entry.fields) ? entry.fields : {}
  if (entry.fields !== undefined && !isObject(entry.fields))
    ctx.report(`${at}.fields`, 'fields must map a field name to a location')
  for (const field of storeFields) {
    const fieldAt = `${at}.fields[${field.name}]`
    if (!Object.hasOwn(mapped, field.name)) ctx.report(fieldAt, `no location for field "${field.name}"`)
    else judge(field, mapped[field.name], fieldAt, `blocks[${block.id}].fields[${field.name}]`)
  }
  for (const name of Object.keys(mapped))
    if (!storeFields.some((f) => f.name === name))
      ctx.report(`${at}.fields[${name}]`, `"${name}" is not a field of the block`)

  const mappedItems = isObject(entry.itemFields) ? entry.itemFields : {}
  for (const field of storeItemFields) {
    const fieldAt = `${at}.itemFields[${field.name}]`
    const locs = mappedItems[field.name]
    if (isDerivedEntry(locs)) {
      judge(field, locs, fieldAt, `blocks[${block.id}].itemFields[${field.name}]`)
      continue
    }
    if (!Array.isArray(locs)) {
      ctx.report(fieldAt, `no locations for item field "${field.name}": one per item, up to max`)
      continue
    }
    if (locs.length < maxItems) ctx.report(fieldAt, `${locs.length} locations for max ${maxItems} items`)
    locs.forEach((loc, i) =>
      judge(field, loc, `${fieldAt}[${i}]`, `blocks[${block.id}].itemFields[${field.name}]`)
    )
  }
  for (const name of Object.keys(mappedItems))
    if (!storeItemFields.some((f) => f.name === name))
      ctx.report(`${at}.itemFields[${name}]`, `"${name}" is not an item field of the block`)
  childMappingProblems(block, entry, at, CHILD_LIST_KEYS, (key) => (key === 'lists' ? 1 : maxItems), {
    ...ctx,
    judge,
    storeAt: `blocks[${block.id}]`
  })
}

/**
 * The locations of the child lists of `owner` (a block, or a child list for its nested lists), the way item fields
 * are placed: every child field gives, per parent place, one location per row; at least `places(key)` parent
 * places, rows within the list's counts, and the fields of one list agree row for row.
 */
function childMappingProblems(owner, entry, at, keys, places, ctx) {
  for (const key of keys) {
    const lists = Array.isArray(owner[key]) ? owner[key].filter((l) => isName(l?.name)) : []
    const mapped = isObject(entry?.[key]) ? entry[key] : {}
    if (entry?.[key] !== undefined && !isObject(entry[key]))
      ctx.report(`${at}.${key}`, `${key} must map a child list name to its fields`)
    for (const list of lists) {
      const listAt = `${at}.${key}[${list.name}]`
      const storeAt = `${ctx.storeAt}.${key}[${list.name}]`
      const listEntry = mapped[list.name]
      if (!isObject(listEntry)) {
        ctx.report(listAt, `no mapping for child list "${list.name}"`)
        continue
      }
      const fields = Array.isArray(list.fields) ? list.fields.filter((f) => isName(f?.name)) : []
      const mappedFields = isObject(listEntry.fields) ? listEntry.fields : {}
      let agreed = null
      for (const field of fields) {
        const fieldAt = `${listAt}.fields[${field.name}]`
        const perPlace = mappedFields[field.name]
        if (isDerivedEntry(perPlace)) {
          ctx.judge(field, perPlace, fieldAt, `${storeAt}.fields[${field.name}]`)
          continue
        }
        const rows =
          Array.isArray(perPlace) && perPlace.every(Array.isArray) ? perPlace.map((r) => r.length) : null
        if (!rows) {
          ctx.report(fieldAt, `no locations for child field "${field.name}": per parent place, one per row`)
          continue
        }
        const want = places(key)
        if (Number.isInteger(want) && rows.length < want)
          ctx.report(fieldAt, `${rows.length} parent places for ${want}: every parent place lists its rows`)
        if (agreed && !sameRows(agreed, rows))
          ctx.report(fieldAt, `rows per parent place ${rows.join(', ')} differ from ${agreed.join(', ')}`)
        if (!agreed) {
          agreed = rows
          rowCountProblems(rows, list.items, fieldAt, ctx.report)
        }
        perPlace.forEach((locs, p) =>
          locs.forEach((loc, r) =>
            ctx.judge(field, loc, `${fieldAt}[${p}][${r}]`, `${storeAt}.fields[${field.name}]`)
          )
        )
      }
      for (const name of Object.keys(mappedFields))
        if (!fields.some((f) => f.name === name))
          ctx.report(`${listAt}.fields[${name}]`, `"${name}" is not a field of the child list`)
      const rowsTotal = agreed ? agreed.reduce((a, b) => a + b, 0) : null
      childMappingProblems(list, listEntry, listAt, ['lists'], () => rowsTotal, { ...ctx, storeAt })
    }
    for (const name of Object.keys(mapped))
      if (!lists.some((l) => l.name === name))
        ctx.report(`${at}.${key}[${name}]`, `"${name}" is not a child list declared in the block store`)
  }
}

function factsProblems(facts, report) {
  if (facts === undefined) return
  if (!isObject(facts)) return report('facts', 'facts must map a business fact to its locations')
  for (const [fact, locs] of Object.entries(facts)) {
    const at = `facts.${fact}`
    if (!Object.hasOwn(BUSINESS_FACTS, fact)) {
      report(
        at,
        `${JSON.stringify(fact)} is not a business fact: one of ${Object.keys(BUSINESS_FACTS).join(', ')}`
      )
      continue
    }
    if (!Array.isArray(locs) || locs.length === 0) {
      report(at, 'a business fact lists every place the template shows it')
      continue
    }
    locs.forEach((loc, i) => checkLocation(loc, `${at}[${i}]`, report))
  }
}

/** Every business fact kind the business profile holds: each is written as a fact, or classed in notFacts by kind. */
export const PROFILE_FACT_KINDS = Object.freeze([
  ...new Set([...SINGLE_FACT_KINDS, ...LIST_FACT_KINDS, ...Object.values(BUSINESS_FACTS)])
])

/**
 * `notFacts`: `[{fact, kind?, why}]`, required beside `facts`. A business profile fact kind no key of `facts` writes is
 * classed by an entry with that `kind`, so a dropped entry (or the whole list) is a problem.
 */
function notFactsProblems(mapping, report) {
  if (mapping.facts === undefined) return
  const notFacts = mapping.notFacts
  if (!Array.isArray(notFacts))
    return report(
      'notFacts',
      'notFacts lists each business fact or demo value no fact writes: [{fact, kind?, why}]'
    )
  const names = new Set()
  notFacts.forEach((n, i) => {
    const at = `notFacts[${i}]`
    if (!isObject(n) || !isName(n.fact) || !isName(n.why))
      return report(at, 'a notFacts entry is {fact, kind?, why}')
    if (names.has(n.fact)) report(at, `"${n.fact}" is classed twice`)
    names.add(n.fact)
    if (n.kind !== undefined && !PROFILE_FACT_KINDS.includes(n.kind))
      report(`${at}.kind`, `a business profile fact kind: one of ${PROFILE_FACT_KINDS.join(', ')}`)
  })
  const written = new Set(
    Object.keys(isObject(mapping.facts) ? mapping.facts : {}).map((f) => BUSINESS_FACTS[f])
  )
  for (const kind of PROFILE_FACT_KINDS)
    if (!written.has(kind) && !notFacts.some((n) => n?.kind === kind))
      report('notFacts', `${kind} is written by no fact: class it in notFacts with kind "${kind}" and why`)
  // An entry elsewhere that a notFacts entry classes names it (`notFact`), so dropping the entry is a problem; an
  // emptiedNotWritten place always does (why no build writes it is that no fact holds it).
  const refs = [
    ['notEmptied', mapping.notEmptied],
    ['emptiedNotWritten', mapping.emptiedNotWritten],
    ['overrides.language', mapping.overrides?.language],
    ...Object.entries(isObject(mapping.facts) ? mapping.facts : {}).map(([f, l]) => [`facts.${f}`, l])
  ]
  const named = new Set()
  for (const [key, entries] of refs)
    (Array.isArray(entries) ? entries : []).forEach((e, i) => {
      if (isName(e?.notFact)) named.add(e.notFact)
      if (e?.notFact !== undefined && !names.has(e.notFact))
        report(`${key}[${i}].notFact`, `names no notFacts entry: "${e.notFact}"`)
      if (key === 'emptiedNotWritten' && e?.notFact === undefined)
        report(`${key}[${i}].notFact`, 'name the notFacts entry that says why no fact holds this place')
    })
  notFacts.forEach((n, i) => {
    if (isName(n?.fact) && n.kind === undefined && !named.has(n.fact))
      report(
        `notFacts[${i}]`,
        `"${n.fact}" classes nothing: give its business fact kind, or name it (notFact) where it classes a place`
      )
  })
}

function overridesProblems(overrides, report) {
  if (overrides === undefined) return
  if (!isObject(overrides)) return report('overrides', 'overrides must be {settings, language}')
  const list = (key, check) => {
    const entries = overrides[key]
    if (entries === undefined) return
    if (!Array.isArray(entries)) return report(`overrides.${key}`, `overrides.${key} must be a list`)
    entries.forEach((entry, i) => check(entry, `overrides.${key}[${i}]`))
  }
  list('settings', (entry, at) => {
    if (!isObject(entry)) return report(at, 'a setting override is {location, value}')
    checkLocation(entry.location, `${at}.location`, report)
    if (typeof entry.value !== 'string') report(`${at}.value`, 'a setting override needs a string value')
  })
  list('language', (entry, at) => {
    if (!isObject(entry) || !isName(entry.key))
      return report(at, 'a language override is {key, value | filledBy | keep}')
    const filled = Array.isArray(entry.filledBy) && entry.filledBy.length > 0
    if (typeof entry.value !== 'string' && !filled && !isName(entry.keep))
      report(
        at,
        'a language override needs its value source: a string value, the fields it is filledBy, or keep with the reason'
      )
  })
}

/**
 * Every problem of a mapping file against the blocks of its block store.
 * @param {any} mapping the parsed mapping file
 * @param {any[]} blocks the store's blocks that have an id
 * @param {{report: Function, reportStore: Function}} ctx report into the mapping file, or into the block store
 */
export function mappingProblems(mapping, blocks, ctx) {
  const { report } = ctx
  ctx = {
    ...ctx,
    facts: isObject(mapping?.facts) ? mapping.facts : {},
    factKinds: BUSINESS_FACTS,
    factExceptions: mapping?.factExceptions
  }
  if (!isObject(mapping)) return report('', 'the mapping file must be a JSON object')
  if (mapping.schema !== MAPPING_SCHEMA) report('schema', `schema must be "${MAPPING_SCHEMA}"`)
  const entries = isObject(mapping.blocks) ? mapping.blocks : {}
  if (!isObject(mapping.blocks)) report('blocks', 'blocks must map a block id to its fields')
  for (const block of blocks) blockMappingProblems(block, entries[block.id], ctx)
  for (const id of Object.keys(entries))
    if (!blocks.some((b) => b.id === id)) report(`blocks[${id}]`, `"${id}" is not a block of the store`)
  factsProblems(mapping.facts, report)
  notFactsProblems(mapping, report)
  if (!isObject(mapping.seo)) report('seo', `seo must give a location for ${SEO_FIELDS.join(', ')}`)
  else if (mapping.seo.pageTypes === undefined)
    for (const name of SEO_FIELDS) {
      if (mapping.seo[name] === undefined) report(`seo.${name}`, 'missing location')
      else checkLocation(mapping.seo[name], `seo.${name}`, report)
    }
  overridesProblems(mapping.overrides, report)
  mappingPlaceProblems(mapping, ctx)
}
