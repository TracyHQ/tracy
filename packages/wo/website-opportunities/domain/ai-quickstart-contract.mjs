// The AI quickstart contract check (ADR 0046, ticket #581): the block store description and the page recipes of an AI
// quickstart, checked together with its mapping file (`ai-quickstart-mapping.mjs`). Pure: declarations in, every
// problem out, each with the file and the place it sits in. Nothing throws on a malformed declaration.
//
// The format is documented in `docs/references/ai-quickstart-contract.md`. Data kinds are roles of the vocabulary
// `place-content-roles/3`; block types are `BLOCK_TYPES`, both in `place-content-roles.mjs`.
import { CHILD_LIST_KEYS, childListProblems } from './ai-quickstart-child-lists.mjs'
import {
  KEYED,
  fieldKeyProblems,
  scopesOf,
  sharedPlaceProblems,
  sharedPlacesOf
} from './ai-quickstart-field-keys.mjs'
import { inlineCoverageProblems, inlineShapeProblems } from './ai-quickstart-inline.mjs'
import { mappingProblems } from './ai-quickstart-mapping.mjs'
import { ROLE_VOCABULARY_V3, isBlockType, isRole } from './place-content-roles.mjs'

export { sharedPlacesOf }
export const BLOCK_STORE_FILE = 'block-store.json'
export const PAGE_RECIPES_FILE = 'page-recipes.json'
export const MAPPING_FILE = 'mapping.json'
export const BLOCK_STORE_SCHEMA = 'tracy-ai-quickstart-block-store/v1'
export const PAGE_RECIPES_SCHEMA = 'tracy-ai-quickstart-page-recipes/v1'

/** Field types. A `design` field is a design value of the template: a build never writes it. */
export const AI_QUICKSTART_FIELD_TYPES = Object.freeze(['text', 'link', 'image', 'icon', 'number', 'design'])
const FIELD_TYPE_SET = new Set(AI_QUICKSTART_FIELD_TYPES)
const NO_DATA_RULES = new Set(['hide', 'fallback'])
const BLOCK_SOURCES = new Set(['template', 'library'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isWhole = (value, from) => Number.isInteger(value) && value >= from
const label = (value, index) => (isName(value) ? value : String(index))

/** The problems of one field of a block; `at` is where the field sits, e.g. `blocks[hero].fields[heading]`. */
function fieldProblems(field, at, report) {
  if (!isObject(field)) return report(at, 'a field must be an object {name, kind, type, ...}')
  if (!isName(field.name)) report(`${at}.name`, 'a field needs a non-empty name')
  const { type } = field
  if (type === undefined)
    return report(`${at}.type`, `missing field type: one of ${AI_QUICKSTART_FIELD_TYPES.join(', ')}`)
  if (!FIELD_TYPE_SET.has(type))
    return report(
      `${at}.type`,
      `${JSON.stringify(type)} is not a field type: one of ${AI_QUICKSTART_FIELD_TYPES.join(', ')}`
    )
  if (type === 'design') {
    if (field.kind !== undefined)
      report(`${at}.kind`, 'a design field carries no data kind: a build never writes it')
    return
  }
  if (field.kind === 'editorial.design_element')
    report(`${at}.type`, `design value typed as ${type}: a design element of the template, type it design`)
  else if (field.kind === undefined)
    report(`${at}.kind`, 'missing data kind: a role of place-content-roles/3')
  else if (!isRole(field.kind, ROLE_VOCABULARY_V3))
    report(`${at}.kind`, `${JSON.stringify(field.kind)} is not a data kind of place-content-roles/3`)
  if (type === 'text' && !isWhole(field.limit, 1))
    report(`${at}.limit`, 'a text field needs a limit: the most characters it holds at the narrowest width')
  const framed = isObject(field.frame) && isWhole(field.frame.width, 1) && isWhole(field.frame.height, 1)
  if (type === 'image' && !framed)
    report(`${at}.frame`, 'an image field needs a frame {width, height} in pixels')
  if (type === 'icon' && !framed)
    report(
      `${at}.frame`,
      'an icon field needs a frame {width, height}: the box the icon is drawn in, in pixels'
    )
}

function fieldListProblems(block, key, at, report, names) {
  const list = block[key]
  if (list === undefined && key === 'itemFields') return
  if (!Array.isArray(list)) return report(`${at}.${key}`, `${key} must be a list of fields`)
  list.forEach((field, i) => {
    const fieldAt = `${at}.${key}[${label(field?.name, i)}]`
    if (isName(field?.name) && names.has(field.name))
      report(fieldAt, `field name ${JSON.stringify(field.name)} appears twice in the block`)
    if (isName(field?.name)) names.add(field.name)
    fieldProblems(field, fieldAt, report)
  })
}

function itemsProblems(items, at, report) {
  if (items === undefined) return report(at, 'missing item counts: {min, max}')
  if (!isObject(items) || !isWhole(items.min, 0) || !isWhole(items.max, 1))
    return report(at, 'item counts must be {min, max}: min a whole number from 0, max from 1')
  if (items.min > items.max) report(at, `min ${items.min} is above max ${items.max}`)
}

function noDataProblems(noData, at, report) {
  if (noData === undefined)
    return report(
      at,
      'missing no data rule: {"rule": "hide"} or {"rule": "fallback", "fallback": "<what shows>"}'
    )
  if (!isObject(noData) || !NO_DATA_RULES.has(noData.rule))
    return report(at, 'the no data rule must be "hide" or "fallback"')
  if (noData.rule === 'fallback' && !isName(noData.fallback))
    report(`${at}.fallback`, 'a fallback rule names what the block shows instead')
}

/**
 * The problems of one block declaration; `at` is where it sits. Shared with the Tracy library check, which passes
 * `library`: a library block stores nothing in the template, so its fields have no stored places.
 */
export function blockProblems(block, at, report, { library = false } = {}) {
  if (!isObject(block)) return report(at, 'a block must be an object')
  if (!isName(block.id)) report(`${at}.id`, 'a block needs a non-empty id')
  if (!isBlockType(block.type))
    report(
      `${at}.type`,
      `${JSON.stringify(block.type)} is not a block type (BLOCK_TYPES, place-content-roles.mjs)`
    )
  if (block.source !== undefined && !BLOCK_SOURCES.has(block.source))
    report(`${at}.source`, 'source must be "template" or "library"')
  if (!Array.isArray(block.positions) || block.positions.length === 0 || !block.positions.every(isName))
    report(`${at}.positions`, 'positions must list at least one layout position')
  itemsProblems(block.items, `${at}.items`, report)
  noDataProblems(block.noData, `${at}.noData`, report)
  const names = new Set()
  fieldListProblems(block, 'fields', at, report, names)
  fieldListProblems(block, 'itemFields', at, report, names)
  storedPlaceProblems(block, at, report, library)
  childListProblems(
    block,
    at,
    { keys: CHILD_LIST_KEYS, places: (key) => (key === 'lists' ? 1 : itemPlacesOf(block)), names },
    { report, fieldProblems, itemsProblems }
  )
  fieldKeyProblems(block, at, report, { library })
}

/**
 * The stored item places of a repeating block: as many as its item fields store, else its maximum. The child lists
 * of each item (`itemLists`) store their rows per item place, in the same order.
 */
export function itemPlacesOf(block) {
  const stored = (Array.isArray(block?.itemFields) ? block.itemFields : [])
    .map((f) => (Array.isArray(f?.slots) ? f.slots.length : 0))
    .filter((n) => n > 0)
  if (stored.length) return Math.max(...stored)
  return Number.isInteger(block?.items?.max) ? block.items.max : null
}

/**
 * The rules a block store answers alone from the stored places a draft records (`slot` on a field, `slots` on an
 * item field: one per item). They hold whether the mapping file is written or pending: an item field with no stored
 * places that is not derived (a template block), an item field stored for fewer items than the block takes, and a design line typed as
 * content.
 */
function storedPlaceProblems(block, at, report, library) {
  const fields = Array.isArray(block.fields) ? block.fields.filter(isObject) : []
  const itemFields = Array.isArray(block.itemFields) ? block.itemFields.filter(isObject) : []
  const max = Number.isInteger(block.items?.max) ? block.items.max : null
  for (const field of itemFields) {
    const fieldAt = `${at}.itemFields[${label(field.name, '?')}].slots`
    if (field.slots === undefined) {
      if (!library && !isName(field.derived))
        report(
          fieldAt,
          'an item field lists its stored place per item (slots), or says what it is derived from (derived)'
        )
      continue
    }
    if (max === null) continue
    if (!Array.isArray(field.slots) || !field.slots.every(isName))
      report(fieldAt, 'slots must list the stored place of the field, one per item')
    else if (field.slots.length < max)
      report(
        fieldAt,
        `${field.slots.length} stored places for max ${max} items: every item needs the field, lower max or restructure`
      )
  }
  const designSlots = new Set(fields.filter((f) => f.type === 'design' && isName(f.slot)).map((f) => f.slot))
  for (const [key, list] of [
    ['fields', fields],
    ['itemFields', itemFields]
  ])
    for (const field of list) {
      if (field.type === 'design' || typeof field.type !== 'string' || !FIELD_TYPE_SET.has(field.type))
        continue
      const places = [field.slot, ...(Array.isArray(field.slots) ? field.slots : [])]
      if (field.designFrom !== undefined || places.some((p) => designSlots.has(p)))
        report(
          `${at}.${key}[${label(field.name, '?')}].type`,
          `design value typed as ${field.type}: its stored place is a design line, type it design`
        )
    }
}

/** A position `inside:<id>` places a block inside another block of the store. */
function insideProblems(store, ids, report) {
  store.blocks.forEach((block, i) => {
    if (!Array.isArray(block?.positions)) return
    for (const position of block.positions) {
      if (typeof position !== 'string' || !position.startsWith('inside:')) continue
      const container = position.slice('inside:'.length)
      const at = `blocks[${label(block.id, i)}].positions`
      if (!ids.has(container)) report(at, `${JSON.stringify(position)} names no block of the store`)
      else if (container === block.id) report(at, 'a block cannot be placed inside itself')
    }
  })
}

function blockStoreProblems(store, report) {
  if (!isObject(store)) return report('', 'the block store description must be a JSON object')
  if (store.schema !== BLOCK_STORE_SCHEMA) report('schema', `schema must be "${BLOCK_STORE_SCHEMA}"`)
  if (store.roleVocabularyVersion !== ROLE_VOCABULARY_V3)
    report('roleVocabularyVersion', `roleVocabularyVersion must be "${ROLE_VOCABULARY_V3}"`)
  if (!Array.isArray(store.blocks) || store.blocks.length === 0)
    return report('blocks', 'blocks must list at least one block')
  const ids = new Set()
  store.blocks.forEach((block, i) => {
    const at = `blocks[${label(block?.id, i)}]`
    if (isName(block?.id) && ids.has(block.id))
      report(`${at}.id`, `block id ${JSON.stringify(block.id)} appears twice`)
    if (isName(block?.id)) ids.add(block.id)
    blockProblems(block, at, report)
  })
  insideProblems(store, ids, report)
  sharedPlaceProblems(store, report)
  inlineShapeProblems(store, report)
}

/** A field keyed to a page type (`pageType`) names a page type whose recipe places its block. */
function keyedPageTypeProblems(store, recipes, report) {
  const placedOn = new Map(
    (Array.isArray(recipes?.recipes) ? recipes.recipes : [])
      .filter((r) => isName(r?.pageType))
      .map((r) => [r.pageType, Array.isArray(r.blocks) ? r.blocks : []])
  )
  store.blocks.forEach((block, b) => {
    if (!isObject(block)) return
    for (const scope of scopesOf(block, `blocks[${label(block.id, b)}]`))
      scope.fields.forEach((field, i) => {
        if (!isObject(field) || field.derived !== KEYED || field.pageType === undefined) return
        if (!placedOn.get(field.pageType)?.includes(block.id))
          report(
            `${scope.at(field, i)}.pageType`,
            `no recipe of page type ${JSON.stringify(field.pageType)} places block ${block.id}`
          )
      })
  })
}

function pageRecipesProblems(doc, blockIds, report) {
  if (!isObject(doc)) return report('', 'the page recipes must be a JSON object')
  if (doc.schema !== PAGE_RECIPES_SCHEMA) report('schema', `schema must be "${PAGE_RECIPES_SCHEMA}"`)
  if (!Array.isArray(doc.recipes) || doc.recipes.length === 0)
    return report('recipes', 'recipes must list at least one page type')
  const types = new Set()
  doc.recipes.forEach((recipe, i) => {
    const at = `recipes[${label(recipe?.pageType, i)}]`
    if (!isObject(recipe)) return report(at, 'a recipe must be an object {pageType, mainBlock, blocks}')
    if (!isName(recipe.pageType)) report(`${at}.pageType`, 'a recipe needs a page type')
    else if (types.has(recipe.pageType)) report(`${at}.pageType`, 'page type appears twice')
    else types.add(recipe.pageType)
    if (!Array.isArray(recipe.blocks) || recipe.blocks.length === 0)
      return report(`${at}.blocks`, 'blocks must list the block order of the page')
    recipe.blocks.forEach((id, j) => {
      if (!blockIds.has(id)) report(`${at}.blocks[${j}]`, `${JSON.stringify(id)} is not a block of the store`)
    })
    if (!recipe.blocks.includes(recipe.mainBlock))
      report(`${at}.mainBlock`, 'mainBlock must be one of the blocks of the recipe')
    if (recipe.variants === undefined) return
    if (!Array.isArray(recipe.variants))
      return report(`${at}.variants`, 'variants must be a list of {blocks, pages}')
    recipe.variants.forEach((variant, v) => {
      if (!Array.isArray(variant?.blocks) || variant.blocks.length === 0)
        return report(`${at}.variants[${v}].blocks`, 'a variant lists its block order')
      variant.blocks.forEach((id, j) => {
        if (!blockIds.has(id))
          report(`${at}.variants[${v}].blocks[${j}]`, `${JSON.stringify(id)} is not a block of the store`)
      })
    })
  })
}

/**
 * Check the three declarations of an AI quickstart together.
 * `mappingPending` (a folder whose mapping file another ticket writes, declared by `mapping.pending.json`) skips
 * only the rules that read the mapping file; every rule the block store and the page recipes answer alone still
 * holds, including the stored place rules (`storedPlaceProblems`).
 * `draftReport` (the folder's draft-report.json, when it has one) makes the mapping file set every build-sets
 * reference and every place the draft report classes as a fact.
 * @param {{blockStore: any, pageRecipes: any, mapping: any, mappingPending?: boolean, draftReport?: any}} declarations the parsed JSON files
 * @returns {{ok: boolean, blocks: number, sharedPlaces: number, problems: Array<{file: string, at: string, message: string}>}}
 *   `sharedPlaces`: stored places more than one field uses; a build writes them within the smallest limit
 */
export function checkAiQuickstartContract({
  blockStore,
  pageRecipes,
  mapping,
  mappingPending = false,
  draftReport
}) {
  const problems = []
  const reporter = (file) => (at, message) => {
    problems.push({ file, at, message })
  }
  blockStoreProblems(blockStore, reporter(BLOCK_STORE_FILE))
  const blocks = Array.isArray(blockStore?.blocks) ? blockStore.blocks.filter((b) => isName(b?.id)) : []
  pageRecipesProblems(pageRecipes, new Set(blocks.map((b) => b.id)), reporter(PAGE_RECIPES_FILE))
  if (isObject(blockStore) && Array.isArray(blockStore.blocks))
    keyedPageTypeProblems(blockStore, pageRecipes, reporter(BLOCK_STORE_FILE))
  if (!mappingPending)
    mappingProblems(mapping, blocks, {
      report: reporter(MAPPING_FILE),
      reportStore: reporter(BLOCK_STORE_FILE),
      blockStore,
      pageRecipes,
      draftReport
    })
  // A text field the draft report finds carrying inline markup declares it (`inline`).
  if (isObject(blockStore)) inlineCoverageProblems(blockStore, draftReport, reporter(BLOCK_STORE_FILE))
  const sharedPlaces = isObject(blockStore) ? sharedPlacesOf(blockStore).length : 0
  return { ok: problems.length === 0, blocks: blocks.length, problems, sharedPlaces }
}

/** One line per problem, the way the gate prints them: `<file> <at>: <message>`. */
export const formatProblem = ({ file, at, message }) => `${file}${at ? ` ${at}` : ''}: ${message}`
