// The build plan of Contract B (ticket #590, ADR 0046 decision 3): what the customer approves before anything is
// written. It carries business facts with their sources, pages and their blocks, the data items each block shows, the
// look section, the pictures summary, the assumptions and what was left out. It carries no written copy: headings and
// body text are written after approval, so every object is a closed shape (`build-contract-shapes.mjs`) and its
// short texts have a length limit. Pure: a plan in, every problem out.
import {
  assumptionsProblems,
  leftOutProblems,
  lookProblems,
  picturesProblems,
  sourcesProblems
} from './build-contract-plan-parts.mjs'
import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import { idListProblems, isName, isObject, isWhole, label } from './build-contract-shared.mjs'
import {
  BLOCK_TYPES,
  GROUP_KINDS_V3,
  isBlockType,
  isRole,
  ROLE_VOCABULARY_V3
} from './place-content-roles.mjs'

export const BUILD_PLAN_SCHEMA = 'tracy-build-plan/v1'
export {
  EDITABLE_FIELDS,
  editableFieldProblem,
  LEFT_OUT_KINDS,
  LOGO_KINDS,
  MAX_GENERATED_FRAMES,
  SOURCE_KINDS
} from './build-contract-plan-parts.mjs'

const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/

/** Facts and items share one id space: a block's data names either. Returns the map id -> {what, kind}. */
function dataProblems(plan, report) {
  const known = new Map()
  const claim = (id, at, entry) => {
    if (!isName(id)) return report(`${at}.id`, 'needs a non-empty id')
    if (known.has(id)) return report(`${at}.id`, `id ${JSON.stringify(id)} is used twice by facts and items`)
    known.set(id, entry)
  }
  if (!Array.isArray(plan.facts) || plan.facts.length === 0)
    report('facts', 'facts must list the business facts, at least one')
  else
    plan.facts.forEach((fact, i) => {
      const at = `facts[${label(fact?.id, i)}]`
      if (!isObject(fact)) return report(at, 'a fact must be an object {id, kind, label, value, sources}')
      closedShapeProblems(fact, 'fact', at, report)
      claim(fact.id, at, { what: 'fact', kind: fact.kind })
      if (!isRole(fact.kind, ROLE_VOCABULARY_V3))
        report(`${at}.kind`, `${JSON.stringify(fact.kind)} is not a data kind of place-content-roles/3`)
      textProblems(fact.label, `${at}.label`, report, 'label', 'a fact needs a label the customer can read')
      textProblems(fact.value, `${at}.value`, report, 'facts[].value', 'a fact needs a value')
      sourcesProblems(fact.sources, `${at}.sources`, report)
    })
  if (!Array.isArray(plan.items)) report('items', 'items must list the data items blocks show (may be empty)')
  else
    plan.items.forEach((item, i) => {
      const at = `items[${label(item?.id, i)}]`
      if (!isObject(item)) return report(at, 'an item must be an object {id, kind, label, sources}')
      closedShapeProblems(item, 'item', at, report)
      claim(item.id, at, { what: 'item', kind: item.kind })
      if (!Object.hasOwn(GROUP_KINDS_V3, item.kind ?? ''))
        report(`${at}.kind`, `${JSON.stringify(item.kind)} is not a group kind of place-content-roles/3`)
      textProblems(item.label, `${at}.label`, report, 'label', 'an item needs a label the customer can read')
      if (item.count !== undefined && !isWhole(item.count, 1))
        report(`${at}.count`, 'count is a whole number from 1: how many like things the item stands for')
      sourcesProblems(item.sources, `${at}.sources`, report)
    })
  return known
}

function blockDataProblems(block, at, known, report) {
  if (block.data === undefined)
    return report(`${at}.data`, 'missing data: the facts and data items this block shows')
  idListProblems(block.data, `${at}.data`, report, { allowEmpty: false })
  if (!Array.isArray(block.data)) return
  const itemKind = BLOCK_TYPES[block.type]?.itemKind ?? null
  const allowed = itemKind ? GROUP_KINDS_V3[itemKind].allowedKinds : []
  block.data.forEach((id, i) => {
    const entry = known.get(id)
    if (!isName(id)) return
    if (!entry) return report(`${at}.data[${i}]`, `${JSON.stringify(id)} is not a fact or item of the plan`)
    if (entry.what === 'item' && isBlockType(block.type) && !allowed.includes(entry.kind))
      report(
        `${at}.data[${i}]`,
        itemKind
          ? `item ${JSON.stringify(id)} is a ${entry.kind}; a ${block.type} block shows ${allowed.join(', ')} items`
          : `a ${block.type} block shows facts only, not item ${JSON.stringify(id)}`
      )
  })
}

function blockProblems(block, at, known, report) {
  if (!isObject(block))
    return report(at, 'a block must be an object {id, type, block, source, label, data, reason}')
  closedShapeProblems(block, 'block', at, report)
  if (!isBlockType(block.type))
    report(
      `${at}.type`,
      `${JSON.stringify(block.type)} is not a block type (BLOCK_TYPES, place-content-roles.mjs)`
    )
  if (!isName(block.block)) report(`${at}.block`, 'block names the block of the store it places')
  if (block.source !== 'template' && block.source !== 'library')
    report(`${at}.source`, 'source must be "template" or "library"')
  textProblems(block.label, `${at}.label`, report, 'label', 'a block needs a label the customer can read')
  textProblems(
    block.reason,
    `${at}.reason`,
    report,
    'reason',
    'a block needs the reason it fits, in words the customer can read'
  )
  blockDataProblems(block, at, known, report)
}

function pagesProblems(plan, known, report) {
  if (!Array.isArray(plan.pages) || plan.pages.length === 0)
    return report('pages', 'pages must list at least one page')
  const pageIds = new Set()
  plan.pages.forEach((page, i) => {
    const at = `pages[${label(page?.id, i)}]`
    if (!isObject(page)) return report(at, 'a page must be an object {id, name, pageType, blocks}')
    closedShapeProblems(page, 'page', at, report)
    if (!isName(page.id)) report(`${at}.id`, 'a page needs a non-empty id')
    else if (pageIds.has(page.id)) report(`${at}.id`, 'page id appears twice')
    else pageIds.add(page.id)
    textProblems(page.name, `${at}.name`, report, 'pages[].name', 'a page needs the name its menu item shows')
    if (!isName(page.pageType)) report(`${at}.pageType`, 'a page needs the page type of its recipe')
    if (!Array.isArray(page.blocks) || page.blocks.length === 0)
      return report(`${at}.blocks`, 'blocks must list at least one block')
    const blockIds = new Set()
    page.blocks.forEach((block, j) => {
      const blockAt = `${at}.blocks[${label(block?.id, j)}]`
      if (!isName(block?.id)) report(`${blockAt}.id`, 'a block needs a non-empty id')
      else if (blockIds.has(block.id)) report(`${blockAt}.id`, 'block id appears twice on the page')
      else blockIds.add(block.id)
      blockProblems(block, blockAt, known, report)
    })
  })
}

/** Report every problem of a build plan through `report(at, message)`. */
export function buildPlanProblems(plan, report) {
  if (!isObject(plan)) return report('', 'a build plan must be a JSON object')
  closedShapeProblems(plan, 'plan', '', report)
  if (plan.schema !== BUILD_PLAN_SCHEMA) report('schema', `schema must be "${BUILD_PLAN_SCHEMA}"`)
  if (!isName(plan.id)) report('id', 'a plan needs a non-empty id')
  if (!isWhole(plan.revision, 1))
    report('revision', 'revision is a whole number from 1; each plan edit adds one')
  if (typeof plan.language !== 'string' || !LANGUAGE_TAG.test(plan.language))
    report('language', 'language is the site language as a tag like "en" or "pt-BR"')
  const known = dataProblems(plan, report)
  pagesProblems(plan, known, report)
  lookProblems(plan.look, report)
  picturesProblems(plan.pictures, report)
  assumptionsProblems(plan, report)
  leftOutProblems(plan.leftOut, report)
}
