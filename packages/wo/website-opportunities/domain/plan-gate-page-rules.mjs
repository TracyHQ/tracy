// Page rules of the plan gate restored from the locked planner prompt (2026-11-03; audit rows P2, P13, P14, P16,
// P21), read once the reply has its shape. Each problem has a code and a message the model reads on its second
// attempt (`plan-composer.mjs`: one more composition, then stop and report).
// - `item_repeated_on_page` (P21): an item (a service, a person, a review) is shown by one block of a page, never two;
//   except the subject of a detail page, which its page describes in several blocks (a class and its schedule). A page
//   is a detail page when (a) its type is one the template repeats per item (`itemPageTypesOf`, the write order's
//   reading of `pages` and `variants`), (b) its recipe's main block declares one item at most, or (c) its recipe's
//   main block shows people and shows exactly one person in the plan (a trainer page). Its subject is the one item its
//   main block shows. Any other item shown twice on it is still a problem;
// - `contact_channel_missing` (P13): every contact channel goes on the contact page while a block of it has a free
//   place for it (`plan-gate-contact.mjs`);
// - `form_without_destination` (P16): a `newsletter` block (a form) is kept only when the business has an email its
//   answers can go to;
// - `map_without_address` (P14): a `map` block is kept only when it shows the business's address fact;
// - `withheld_shown` (P2): nothing the owner keeps off the site is shown (`plan-withheld.mjs`);
// - `person_dropped_block_fits` (D43, was P6): the people are not left out while a block can show them
//   (`plan-gate-people.mjs`).
import { BLOCK_TYPES, GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { contactChannelProblems } from './plan-gate-contact.mjs'
import { droppedPeopleProblems } from './plan-gate-people.mjs'
import { itemPageTypesOf } from './write-order-targets.mjs'

export { CONTACT_CHANNEL_KINDS } from './plan-gate-contact.mjs'

/** Whether a block may show an item of `kind`: an item of the wrong kind is `wrong_item_kind`, reported once. */
function shows(description, kind) {
  const itemKind = BLOCK_TYPES[description?.type]?.itemKind
  return Boolean(itemKind && GROUP_KINDS_V3[itemKind].allowedKinds.includes(kind))
}

/** The one item a detail page describes, or null (see the header: cases a, b and c). */
export function detailSubjectOf(page, { data, blocks, recipes }) {
  const main = blocks.get(recipes.get(page.pageType)?.mainBlock)
  if (!main) return null
  const shown = page.blocks
    .filter((b) => b.block === main.id)
    .flatMap((b) => b.data)
    .filter((id) => data.byId.get(id)?.what === 'item' && shows(main, data.byId.get(id).kind))
  if (shown.length !== 1) return null
  const perItem = itemPageTypesOf([...recipes.values()]).has(page.pageType)
  const person = shows(main, 'person') && data.byId.get(shown[0]).kind === 'person'
  return perItem || main.items?.max === 1 || person ? shown[0] : null
}

function repeatedItems(page, at, context, problem) {
  const { data, blocks } = context
  const subject = detailSubjectOf(page, context)
  const seen = new Map()
  page.blocks.forEach((block, j) =>
    block.data.forEach((id, k) => {
      const record = data.byId.get(id)
      if (record?.what !== 'item' || !shows(blocks.get(block.block), record.kind)) return
      if (id === subject) return
      if (seen.has(id) && seen.get(id) !== j)
        problem(
          'item_repeated_on_page',
          `${at}.blocks[${j}].data[${k}]`,
          `${JSON.stringify(id)} is shown by block ${page.blocks[seen.get(id)].block} of this page already: an item appears in one block of a page`
        )
      else seen.set(id, j)
    })
  )
}

function blockRules(block, at, context, problem) {
  const { data, blocks } = context
  const type = blocks.get(block.block)?.type
  const kindOf = (id) => data.byId.get(id)?.kind
  if (type === 'newsletter') {
    const email = data.facts.some((f) => f.kind === 'contact.email' && !data.withheld?.has(f.id))
    if (!email)
      problem(
        'form_without_destination',
        `${at}.block`,
        `block ${block.block} is a form and the business has no email its answers can go to: leave the block out`
      )
  }
  if (type === 'map' && !block.data.some((id) => kindOf(id) === 'contact.address'))
    problem(
      'map_without_address',
      `${at}.data`,
      `block ${block.block} is a map: it shows the business's address fact, or it is left out when there is none`
    )
  block.data.forEach((id, k) => {
    const record = data.byId.get(id)
    if (data.withheld?.has(id) || data.withheld?.has(record?.itemField?.item))
      problem(
        'withheld_shown',
        `${at}.data[${k}]`,
        `${JSON.stringify(id)} is kept off the site at the owner's request: never show it`
      )
  })
}

/** Report the page rules of a composition whose shape is valid and whose blocks are known. */
export function pageRuleProblems(composition, context, problem) {
  composition.pages.forEach((page, i) => {
    repeatedItems(page, `pages[${i}]`, context, problem)
    page.blocks.forEach((block, j) => {
      if (context.blocks.has(block.block)) blockRules(block, `pages[${i}].blocks[${j}]`, context, problem)
    })
  })
  contactChannelProblems(composition, context, problem)
  droppedPeopleProblems(composition, context, problem)
}
