// The AI quickstart contract check (ADR 0046, ticket #581): the block store description and the page recipes of an AI
// quickstart, checked together with its mapping file (`ai-quickstart-mapping.mjs`). Pure: declarations in, every
// problem out, each with the file and the place it sits in. Nothing throws on a malformed declaration.
//
// The format is documented in `docs/references/ai-quickstart-contract.md`. Data kinds are roles of the vocabulary
// `place-content-roles/3`; block types are `BLOCK_TYPES`, both in `place-content-roles.mjs`.
import { mappingProblems } from './ai-quickstart-mapping.mjs'
import { ROLE_VOCABULARY_V3, isBlockType, isRole } from './place-content-roles.mjs'

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
  if (
    type === 'image' &&
    !(isObject(field.frame) && isWhole(field.frame.width, 1) && isWhole(field.frame.height, 1))
  )
    report(`${at}.frame`, 'an image field needs a frame {width, height} in pixels')
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

function blockProblems(block, at, report) {
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
  })
}

/**
 * Check the three declarations of an AI quickstart together.
 * @param {{blockStore: any, pageRecipes: any, mapping: any}} declarations the parsed JSON files
 * @returns {{ok: boolean, blocks: number, problems: Array<{file: string, at: string, message: string}>}}
 */
export function checkAiQuickstartContract({ blockStore, pageRecipes, mapping }) {
  const problems = []
  const reporter = (file) => (at, message) => {
    problems.push({ file, at, message })
  }
  blockStoreProblems(blockStore, reporter(BLOCK_STORE_FILE))
  const blocks = Array.isArray(blockStore?.blocks) ? blockStore.blocks.filter((b) => isName(b?.id)) : []
  pageRecipesProblems(pageRecipes, new Set(blocks.map((b) => b.id)), reporter(PAGE_RECIPES_FILE))
  mappingProblems(mapping, blocks, {
    report: reporter(MAPPING_FILE),
    reportStore: reporter(BLOCK_STORE_FILE)
  })
  return { ok: problems.length === 0, blocks: blocks.length, problems }
}

/** One line per problem, the way the gate prints them: `<file> <at>: <message>`. */
export const formatProblem = ({ file, at, message }) => `${file}${at ? ` ${at}` : ''}: ${message}`
