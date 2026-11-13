// The rules the gate holds a composed plan to (ticket #593), read only once the reply has its shape
// (`plan-gate-reply.mjs`). Each problem has a code, a place and a message the model reads on its second attempt.
// - every id names a fact or item of the needs profile, of a kind the block shows, within its counts
//   (`plan-gate-items.mjs`); a fact inside an item block needs a field of that fact's kind in the block;
// - a template block sits only on a page type whose recipe lists it, and at most once per page (Contract A declares
//   no repetition, so none is allowed);
// - `targets` names fields of the block and never a design typed field;
// - an item the model leaves out is not also shown; customer text carries no dash.
import { blockItemProblems } from './plan-gate-items.mjs'
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { fitsRecipe } from './plan-placement-pages.mjs'

/** En dash, em dash, figure dash, horizontal bar and minus sign: none of them in customer text. */
export const DASHES = new RegExp(
  `[${[0x2012, 0x2013, 0x2014, 0x2015, 0x2212].map((c) => String.fromCharCode(c)).join('')}]`
)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

function dashFree(value, at, problem) {
  if (DASHES.test(value))
    problem('dash_in_text', at, 'no dash (en, em, figure, bar or minus) in customer text')
}

export function factFieldProblems(block, description, at, data, problem) {
  if (!BLOCK_TYPES[description.type]?.itemKind) return
  block.data.forEach((id, i) => {
    const entry = data.byId.get(id)
    if (entry?.what !== 'fact' || entry.itemField) return
    const fits = (description.fields ?? []).some((f) => f?.type !== 'design' && f?.kind === entry.kind)
    if (!fits)
      problem(
        'fact_without_field',
        `${at}.data[${i}]`,
        `block ${description.id} has no field for ${entry.kind}: a fact goes in an item block only where it has a field`
      )
  })
}

function blockProblems(block, at, page, context, problem) {
  const { data, blocks, recipes } = context
  const description = blocks.get(block.block)
  if (!description)
    return problem(
      'unknown_block',
      `${at}.block`,
      `${JSON.stringify(block.block)} is not a block of the list`
    )
  const recipe = recipes.get(page.pageType)
  if (recipe && !fitsRecipe(description, recipe))
    problem(
      'block_not_in_recipe',
      `${at}.block`,
      `the ${page.pageType} recipe does not list block ${description.id}`
    )
  for (const key of ['label', 'reason'])
    if (!isText(block[key]))
      problem(key === 'reason' ? 'no_reason' : 'reply_shape', `${at}.${key}`, `a block needs its ${key}`)
    else dashFree(block[key], `${at}.${key}`, problem)
  if (block.data.length === 0)
    return problem(
      'no_data',
      `${at}.data`,
      'a kept block shows at least one data item; leave the block out otherwise'
    )
  block.data.forEach((id, i) => {
    if (data.byId.get(id)?.itemField)
      problem(
        'item_field_fact',
        `${at}.data[${i}]`,
        `${JSON.stringify(id)} is a field of an item: show the item`
      )
  })
  blockItemProblems(block, description, at, data, problem)
  factFieldProblems(block, description, at, data, problem)
  const fields = [...(description.fields ?? []), ...(description.itemFields ?? [])]
  ;(block.targets ?? []).forEach((name, i) => {
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

/** Report every rule problem of a composition whose shape is valid. */
export function compositionProblems(composition, context, problem) {
  if (composition.pages.length === 0)
    return problem('reply_shape', 'pages', 'the reply lists the pages of the site, at least one')
  const shown = new Set()
  composition.pages.forEach((page, i) => {
    const at = `pages[${i}]`
    if (!context.recipes.has(page.pageType))
      problem(
        'unknown_page_type',
        `${at}.pageType`,
        `${JSON.stringify(page.pageType)} is not a page type of the recipes`
      )
    if (!isText(page.name)) problem('reply_shape', `${at}.name`, 'a page needs the name its menu item shows')
    else dashFree(page.name, `${at}.name`, problem)
    if (page.blocks.length === 0)
      return problem('reply_shape', `${at}.blocks`, 'a page lists its blocks, at least one')
    const onPage = new Set()
    page.blocks.forEach((block, j) => {
      const blockAt = `${at}.blocks[${j}]`
      if (onPage.has(block.block))
        problem(
          'block_repeated',
          `${blockAt}.block`,
          `block ${block.block} is on this page already: a block appears once per page`
        )
      onPage.add(block.block)
      for (const id of block.data) shown.add(id)
      blockProblems(block, blockAt, page, context, problem)
    })
  })
  ;(composition.leftOut ?? []).forEach((entry, i) => {
    if (entry.item !== undefined && !context.data.byId.has(entry.item))
      problem(
        'invented_item',
        `leftOut[${i}].item`,
        `${JSON.stringify(entry.item)} is not an item of the needs profile`
      )
    else if (entry.item !== undefined && shown.has(entry.item))
      problem(
        'left_out_but_shown',
        `leftOut[${i}].item`,
        `${JSON.stringify(entry.item)} is shown by a block: it is not left out`
      )
    for (const key of ['what', 'reason'])
      if (isText(entry[key])) dashFree(entry[key], `leftOut[${i}].${key}`, problem)
  })
  ;(composition.assumptions ?? []).forEach((a, i) => {
    if (isText(a.said)) dashFree(a.said, `assumptions[${i}].said`, problem)
  })
}
