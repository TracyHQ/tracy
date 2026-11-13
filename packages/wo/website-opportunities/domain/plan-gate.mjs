// The rules gate of the plan composer (ticket #593, ADR 0046 decision 3): a pure check of what the model composed,
// before anyone sees it. It guarantees, where the prompt only asks:
// - every data item of the plan exists in the needs profile (nothing invented);
// - a kept block shows at least its minimum and at most its maximum items, of a kind its type shows;
// - no design typed field is targeted;
// - a Tracy library block shows only items its content rules accept (`plan-gate-items.mjs`, `library.mjs`);
// - each block says why it fits, in words the customer can read;
// - a page whose main block is missing is dropped, with the reason;
// - data no block shows is placed in the fixed order of `plan-placement.mjs`, else reported;
// - the plan it returns passes the Contract B check (`build-contract.mjs`).
// Composition in, `{ok, problems, plan}` out. Every problem has a code, a place and a message the model reads on its
// second attempt.
import { BUILD_PLAN_SCHEMA } from './build-contract-plan.mjs'
import { checkBuildDocument } from './build-contract.mjs'
import { blockItemProblems } from './plan-gate-items.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { placeExtraData } from './plan-placement.mjs'

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

function blockProblems(block, at, { data, blocks }, problem) {
  if (!isObject(block))
    return problem('reply_shape', at, 'a block must be an object {block, label, data, reason}')
  const description = blocks.get(block.block)
  if (!description)
    return problem(
      'unknown_block',
      `${at}.block`,
      `${JSON.stringify(block.block)} is not a block of the list`
    )
  for (const key of ['label', 'reason']) {
    if (!isText(block[key]))
      problem(key === 'reason' ? 'no_reason' : 'reply_shape', `${at}.${key}`, `a block needs its ${key}`)
    else if (DASHES.test(block[key]))
      problem('dash_in_text', `${at}.${key}`, 'no en dash or em dash in customer text')
  }
  if (!Array.isArray(block.data) || block.data.length === 0)
    return problem(
      'no_data',
      `${at}.data`,
      'a kept block shows at least one data item; leave the block out otherwise'
    )
  blockItemProblems(block, description, at, data, problem)
  const fields = [...list(description.fields), ...list(description.itemFields)]
  list(block.targets).forEach((name, i) => {
    const field = fields.find((f) => f?.name === name)
    if (!field)
      problem(
        'unknown_field',
        `${at}.targets[${i}]`,
        `${JSON.stringify(name)} is not a field of block ${description.id}`
      )
    else if (field.type === 'design')
      problem(
        'design_field',
        `${at}.targets[${i}]`,
        `${JSON.stringify(name)} is a design field of the template: a build never writes it`
      )
  })
}

function compositionProblems(composition, context, problem) {
  if (!isObject(composition) || !Array.isArray(composition.pages) || composition.pages.length === 0)
    return problem('reply_shape', 'pages', 'the reply lists the pages of the site, at least one')
  composition.pages.forEach((page, i) => {
    const at = `pages[${i}]`
    if (!isObject(page))
      return problem('reply_shape', at, 'a page must be an object {pageType, name, blocks}')
    if (!context.recipes.has(page.pageType))
      problem(
        'unknown_page_type',
        `${at}.pageType`,
        `${JSON.stringify(page.pageType)} is not a page type of the recipes`
      )
    if (!isText(page.name)) problem('reply_shape', `${at}.name`, 'a page needs the name its menu item shows')
    else if (DASHES.test(page.name))
      problem('dash_in_text', `${at}.name`, 'no en dash or em dash in customer text')
    if (!Array.isArray(page.blocks) || page.blocks.length === 0)
      return problem('reply_shape', `${at}.blocks`, 'a page lists its blocks, at least one')
    page.blocks.forEach((block, j) => blockProblems(block, `${at}.blocks[${j}]`, context, problem))
  })
  list(composition.leftOut).forEach((entry, i) => {
    if (entry?.item !== undefined && !context.data.byId.has(entry.item))
      problem(
        'invented_item',
        `leftOut[${i}].item`,
        `${JSON.stringify(entry.item)} is not an item of the needs profile`
      )
    for (const key of ['what', 'reason'])
      if (isText(entry?.[key]) && DASHES.test(entry[key]))
        problem('dash_in_text', `leftOut[${i}].${key}`, 'no en dash or em dash in customer text')
  })
  list(composition.assumptions).forEach((a, i) => {
    if (isText(a?.said) && DASHES.test(a.said))
      problem('dash_in_text', `assumptions[${i}].said`, 'no en dash or em dash in customer text')
  })
}

/** The pages as the plan holds them, with ids; a page whose main block is missing is dropped with its reason. */
function pagesOf(composition, { recipes, blocks }) {
  const pages = []
  const leftOut = []
  const ids = new Set()
  for (const page of composition.pages) {
    const recipe = recipes.get(page.pageType)
    if (!page.blocks.some((b) => b.block === recipe.mainBlock)) {
      leftOut.push({
        what: page.name,
        kind: 'page',
        reason: 'There was nothing to show in the main section of this page.'
      })
      continue
    }
    let id = page.pageType
    for (let n = 2; ids.has(id); n++) id = `${page.pageType}-${n}`
    ids.add(id)
    const kept = page.blocks.map((b, j) => {
      const d = blocks.get(b.block)
      return {
        id: `${id}-b${j + 1}`,
        type: d.type,
        block: d.id,
        source: d.source ?? 'template',
        label: b.label,
        data: [...b.data],
        reason: b.reason
      }
    })
    pages.push({ id, name: page.name, pageType: page.pageType, blocks: kept })
  }
  return { pages, leftOut }
}

/** Whether an assumption's field is on a page the plan keeps: one about a dropped page goes with the page. */
function onKeptPage(field, pages) {
  const page = /^pages\[([^\]]+)\]/.exec(typeof field === 'string' ? field : '')?.[1]
  return page === undefined || pages.some((p) => p.id === page)
}

/**
 * Gate a composed plan.
 * @param {object} composition the model's reply (`plan-composer-prompt.md`)
 * @param {{planId: string, language: string, data: object, blocks: Map<string, object>, recipes: Map<string, object>,
 *   look: object, assumptions: object[]}} context `assumptions`: those the profile and the look bring
 * @returns {{ok: boolean, problems: Array<{code: string, at: string, message: string}>, plan?: object,
 *   placed?: object[]}}
 */
export function gatePlan(composition, context) {
  const problems = []
  const problem = (code, at, message) => {
    problems.push({ code, at, message })
  }
  compositionProblems(composition, context, problem)
  if (problems.length > 0) return { ok: false, problems }
  const dropped = pagesOf(composition, context)
  if (dropped.pages.length === 0) {
    problem(
      'no_pages',
      'pages',
      'every page lost its main block: the plan keeps at least one page with its main block'
    )
    return { ok: false, problems }
  }
  const leftOutIds = new Set(
    list(composition.leftOut)
      .map((e) => e?.item)
      .filter(isText)
  )
  const extra = placeExtraData(dropped.pages, { data: context.data, blocks: context.blocks, leftOutIds })
  const pictures = picturesOf(extra.pages, context.blocks, context.data)
  const modelLeftOut = list(composition.leftOut).map(({ item, what, kind, reason }) =>
    item !== undefined
      ? { what: context.data.byId.get(item).entry.label, kind: 'item', reason }
      : { what, kind, reason }
  )
  const plan = {
    schema: BUILD_PLAN_SCHEMA,
    id: context.planId,
    revision: 1,
    language: context.language,
    facts: context.data.facts,
    items: context.data.items,
    pages: pictures.pages,
    look: context.look,
    pictures: pictures.pictures,
    assumptions: [
      ...context.assumptions,
      ...list(composition.assumptions)
        .map((a, i) => ({ id: `model-${i + 1}`, field: a?.field, said: a?.said }))
        .filter((a) => onKeptPage(a.field, pictures.pages))
    ],
    leftOut: [...modelLeftOut, ...dropped.leftOut, ...extra.leftOut, ...pictures.leftOut]
  }
  for (const p of checkBuildDocument(plan).problems) problem('contract_b', p.at, p.message)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, problems, plan, placed: extra.placed }
}
