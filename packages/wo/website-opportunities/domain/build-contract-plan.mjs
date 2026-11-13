// The build plan of Contract B (ticket #590, ADR 0046 decision 3): what the customer approves before anything is
// written. It carries business facts with their sources, pages and their blocks, the data items each block shows, the
// look section, the pictures summary, the assumptions and what was left out. It carries no written copy: headings and
// body text are written after approval. Pure: a plan in, every problem out.
import {
  BLOCK_TYPES,
  GROUP_KINDS_V3,
  ROLE_VOCABULARY_V3,
  isBlockType,
  isRole
} from './place-content-roles.mjs'
import {
  idListProblems,
  isName,
  isObject,
  isWhole,
  label,
  parseFieldPath,
  resolveFieldPath,
  shapeOfPath
} from './build-contract-shared.mjs'

export const BUILD_PLAN_SCHEMA = 'tracy-build-plan/v1'
/** At most six generated frames per site (spec #577, pictures). */
export const MAX_GENERATED_FRAMES = 6
export const SOURCE_KINDS = Object.freeze(['website', 'google', 'social', 'answer', 'assumption'])
export const LEFT_OUT_KINDS = Object.freeze(['page', 'block', 'item', 'feature'])
export const LOGO_KINDS = Object.freeze(['own', 'text'])
/** The plan fields a customer may change, as path shapes (`build-contract-shared.mjs`, `shapeOfPath`). */
export const EDITABLE_FIELDS = Object.freeze([
  'language',
  'look.template',
  'look.accent',
  'look.logo',
  'facts[].value',
  'items[].label',
  'pages[].name',
  'pages[].blocks[].data',
  'pictures.generated.frames'
])
/** Keys that would carry written copy. Copy is written after approval, never in the plan. */
const COPY_KEYS = Object.freeze([
  'copy',
  'heading',
  'headings',
  'body',
  'text',
  'paragraph',
  'lead',
  'fields',
  'seo'
])
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/

function sourcesProblems(sources, at, report) {
  if (!Array.isArray(sources) || sources.length === 0)
    return report(at, 'sources must list where the fact came from, at least one')
  sources.forEach((source, i) => {
    if (!isObject(source) || !SOURCE_KINDS.includes(source.kind))
      report(`${at}[${i}].kind`, `a source kind is one of ${SOURCE_KINDS.join(', ')}`)
    if (!isName(source?.name)) report(`${at}[${i}].name`, 'a source needs a name the customer can read')
  })
}

function copyProblems(entry, at, report) {
  for (const key of COPY_KEYS)
    if (isObject(entry) && Object.hasOwn(entry, key))
      report(
        `${at}.${key}`,
        'a plan carries no written copy: headings and body text are written after approval'
      )
}

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
      claim(fact.id, at, { what: 'fact', kind: fact.kind })
      if (!isRole(fact.kind, ROLE_VOCABULARY_V3))
        report(`${at}.kind`, `${JSON.stringify(fact.kind)} is not a data kind of place-content-roles/3`)
      if (!isName(fact.label)) report(`${at}.label`, 'a fact needs a label the customer can read')
      if (!isName(fact.value)) report(`${at}.value`, 'a fact needs a value')
      sourcesProblems(fact.sources, `${at}.sources`, report)
    })
  if (!Array.isArray(plan.items)) report('items', 'items must list the data items blocks show (may be empty)')
  else
    plan.items.forEach((item, i) => {
      const at = `items[${label(item?.id, i)}]`
      if (!isObject(item)) return report(at, 'an item must be an object {id, kind, label, sources}')
      claim(item.id, at, { what: 'item', kind: item.kind })
      if (!Object.hasOwn(GROUP_KINDS_V3, item.kind ?? ''))
        report(`${at}.kind`, `${JSON.stringify(item.kind)} is not a group kind of place-content-roles/3`)
      if (!isName(item.label)) report(`${at}.label`, 'an item needs a label the customer can read')
      if (item.count !== undefined && !isWhole(item.count, 1))
        report(`${at}.count`, 'count is a whole number from 1: how many like things the item stands for')
      sourcesProblems(item.sources, `${at}.sources`, report)
    })
  return known
}

function blockProblems(block, at, known, report) {
  if (!isObject(block))
    return report(at, 'a block must be an object {id, type, block, source, label, data, reason}')
  copyProblems(block, at, report)
  if (!isBlockType(block.type))
    report(
      `${at}.type`,
      `${JSON.stringify(block.type)} is not a block type (BLOCK_TYPES, place-content-roles.mjs)`
    )
  if (!isName(block.block)) report(`${at}.block`, 'block names the block of the store it places')
  if (block.source !== 'template' && block.source !== 'library')
    report(`${at}.source`, 'source must be "template" or "library"')
  if (!isName(block.label)) report(`${at}.label`, 'a block needs a label the customer can read')
  if (!isName(block.reason))
    report(`${at}.reason`, 'a block needs the reason it fits, in words the customer can read')
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

function pagesProblems(plan, known, report) {
  if (!Array.isArray(plan.pages) || plan.pages.length === 0)
    return report('pages', 'pages must list at least one page')
  const pageIds = new Set()
  plan.pages.forEach((page, i) => {
    const at = `pages[${label(page?.id, i)}]`
    if (!isObject(page)) return report(at, 'a page must be an object {id, name, pageType, blocks}')
    copyProblems(page, at, report)
    if (!isName(page.id)) report(`${at}.id`, 'a page needs a non-empty id')
    else if (pageIds.has(page.id)) report(`${at}.id`, 'page id appears twice')
    else pageIds.add(page.id)
    if (!isName(page.name)) report(`${at}.name`, 'a page needs the name its menu item shows')
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

function lookProblems(look, report) {
  if (look === undefined) return report('look', 'missing look section: {template, accent, logo}')
  if (!isObject(look)) return report('look', 'the look section must be an object {template, accent, logo}')
  const t = look.template
  if (!isObject(t) || !isName(t.slug) || !isName(t.name) || !isName(t.version))
    report('look.template', 'the chosen template must be {slug, name, version}')
  if (typeof look.accent !== 'string' || !HEX_COLOUR.test(look.accent))
    report('look.accent', 'the brand accent colour must be a #rrggbb colour')
  const logo = look.logo
  if (!isObject(logo) || !LOGO_KINDS.includes(logo.kind))
    report(
      'look.logo',
      'the logo must be {kind: "own", source} or {kind: "text"} (the business name set as text)'
    )
  else if (logo.kind === 'own' && !isName(logo.source))
    report('look.logo.source', 'an own logo names where it came from')
}

function picturesProblems(pictures, report) {
  if (pictures === undefined) return report('pictures', 'missing pictures summary: {own, generated}')
  if (!isObject(pictures))
    return report('pictures', 'the pictures summary must be an object {own, generated}')
  const { own, generated } = pictures
  if (!isObject(own) || !isWhole(own.frames))
    report('pictures.own', 'own must be {frames, from}: frames filled by the business own photos')
  else if (own.frames > 0 && (!Array.isArray(own.from) || own.from.length === 0 || !own.from.every(isName)))
    report('pictures.own.from', 'own photos name the sources they came from')
  if (!isObject(generated) || !isWhole(generated.frames))
    return report('pictures.generated', 'generated must be {frames, reason}: frames to be generated')
  if (generated.frames > MAX_GENERATED_FRAMES)
    report(
      'pictures.generated.frames',
      `at most ${MAX_GENERATED_FRAMES} generated frames, not ${generated.frames}`
    )
  if (generated.frames > 0 && !isName(generated.reason))
    report('pictures.generated.reason', 'generated frames say why no own photo fits')
}

/** Whether `path` names a field of `plan` the customer may change; returns a reason when it does not. */
export function editableFieldProblem(plan, path) {
  const segments = parseFieldPath(path)
  if (!segments) return `${JSON.stringify(path)} is not a field path like facts[phone].value`
  if (!EDITABLE_FIELDS.includes(shapeOfPath(segments)))
    return `${JSON.stringify(path)} is not a field the customer can change (${EDITABLE_FIELDS.join(', ')})`
  const found = resolveFieldPath(plan, segments)
  return found.found ? null : `${JSON.stringify(path)} does not resolve: ${found.reason}`
}

function assumptionsProblems(plan, report) {
  if (!Array.isArray(plan.assumptions))
    return report(
      'assumptions',
      'missing assumptions: the list of what was assumed where sources were silent'
    )
  plan.assumptions.forEach((assumption, i) => {
    const at = `assumptions[${label(assumption?.id, i)}]`
    if (!isObject(assumption)) return report(at, 'an assumption must be an object {id, field, said}')
    if (!isName(assumption.id)) report(`${at}.id`, 'an assumption needs a non-empty id')
    if (!isName(assumption.said))
      report(`${at}.said`, 'an assumption says what was assumed, for the customer')
    const problem = editableFieldProblem(plan, assumption.field)
    if (problem) report(`${at}.field`, `an assumption must be correctable: ${problem}`)
  })
}

function leftOutProblems(leftOut, report) {
  if (!Array.isArray(leftOut))
    return report('leftOut', 'missing left out list: what was dropped, with the reason')
  leftOut.forEach((entry, i) => {
    const at = `leftOut[${i}]`
    if (!isObject(entry)) return report(at, 'a left out entry must be an object {what, kind, reason}')
    if (!isName(entry.what)) report(`${at}.what`, 'say what was left out')
    if (!LEFT_OUT_KINDS.includes(entry.kind))
      report(`${at}.kind`, `kind is one of ${LEFT_OUT_KINDS.join(', ')}`)
    if (!isName(entry.reason)) report(`${at}.reason`, 'a left out entry needs its reason')
  })
}

/** Report every problem of a build plan through `report(at, message)`. */
export function buildPlanProblems(plan, report) {
  if (!isObject(plan)) return report('', 'a build plan must be a JSON object')
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
