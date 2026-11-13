// Page rules of the plan gate restored from the locked planner prompt (2026-11-03; audit rows P2, P13, P14, P16,
// P21), read once the reply has its shape. Each problem has a code and a message the model reads on its second
// attempt (`plan-composer.mjs`: one more composition, then stop and report).
// - `item_repeated_on_page` (P21): an item (a service, a person, a review) is shown by one block of a page, never two;
//   except the subject of a detail page, which its page describes in several blocks (a class and its schedule). A
//   detail page is a page whose recipe's main block, in the plan, shows exactly one item, whatever the block's declared
//   maximum (a trainer page with one trainer); a page of a type the template repeats per item (`itemPageTypesOf`) or
//   whose main block holds one item at most is one as soon as that block shows its item. Its subject is that item. Any
//   other item shown twice on it is still a problem;
// - `contact_channel_missing` (P13): every contact channel the business has is on the contact page (the page whose
//   recipe's main block is a `contact` block), in a block with a field of that channel's kind; a block every recipe
//   lists (a header, a footer) is drawn on every page, so kept on any page it counts. A channel no block the contact
//   page may hold has a field for is not asked (Contract A gives it no place there);
// - `form_without_destination` (P16): a `newsletter` block (a form) is kept only when the business has an email its
//   answers can go to;
// - `map_without_address` (P14): a `map` block is kept only when it shows the business's address fact;
// - `withheld_shown` (P2): nothing the owner keeps off the site is shown (`plan-withheld.mjs`);
// - `person_dropped_block_fits` (D43, was P6): the people are not left out while a block can show them
//   (`plan-gate-people.mjs`).
import { BLOCK_TYPES, GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { droppedPeopleProblems } from './plan-gate-people.mjs'

/** The fact kinds of a contact channel: phone, email, address, booking link, social profile. */
export const CONTACT_CHANNEL_KINDS = Object.freeze([
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.cta_url',
  'contact.social_url'
])

const list = (value) => (Array.isArray(value) ? value : [])

/** The data kinds a block has a field for: its fields, item fields and the row fields of its own lists. */
export function fieldKindsOf(description) {
  const fields = [
    ...list(description?.fields),
    ...list(description?.itemFields),
    ...list(description?.lists).flatMap((l) => list(l?.fields))
  ]
  return new Set(fields.filter((f) => f?.type !== 'design' && f?.kind).map((f) => f.kind))
}

/** Whether a block may show an item of `kind`: an item of the wrong kind is `wrong_item_kind`, reported once. */
function shows(description, kind) {
  const itemKind = BLOCK_TYPES[description?.type]?.itemKind
  return Boolean(itemKind && GROUP_KINDS_V3[itemKind].allowedKinds.includes(kind))
}

/**
 * The one item a detail page describes, or null: the one item its recipe's main block shows in the plan. Covers the
 * page types the template repeats per item (`itemPageTypesOf`) and main blocks of one item at most, whose main block
 * shows one item by construction, and any page whose main block happens to show one (a trainer page).
 */
export function detailSubjectOf(page, { data, blocks, recipes }) {
  const main = blocks.get(recipes.get(page.pageType)?.mainBlock)
  if (!main) return null
  const shown = page.blocks
    .filter((b) => b.block === main.id)
    .flatMap((b) => b.data)
    .filter((id) => data.byId.get(id)?.what === 'item' && shows(main, data.byId.get(id).kind))
  return shown.length === 1 ? shown[0] : null
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

function contactChannels(composition, context, problem) {
  const { data, blocks, recipes } = context
  const all = [...recipes.values()]
  const everyPage = new Set(
    list(all[0]?.blocks).filter((id) => all.every((r) => list(r?.blocks).includes(id)))
  )
  const siteWide = composition.pages.flatMap((p) => p.blocks.filter((b) => everyPage.has(b.block)))
  const library = [...blocks.values()].filter((b) => b.source === 'library').map((b) => b.id)
  const channels = data.facts.filter(
    (f) =>
      CONTACT_CHANNEL_KINDS.includes(f.kind) && !data.byId.get(f.id).itemField && !data.withheld?.has(f.id)
  )
  composition.pages.forEach((page, i) => {
    const recipe = recipes.get(page.pageType)
    if (blocks.get(recipe?.mainBlock)?.type !== 'contact') return
    const places = new Set(
      [...list(recipe.blocks), ...library].flatMap((id) => [...fieldKindsOf(blocks.get(id))])
    )
    const shown = new Set(
      [...page.blocks, ...siteWide].flatMap((b) => {
        const kinds = fieldKindsOf(blocks.get(b.block))
        return b.data.filter((id) => kinds.has(data.byId.get(id)?.kind))
      })
    )
    for (const fact of channels)
      if (places.has(fact.kind) && !shown.has(fact.id))
        problem(
          'contact_channel_missing',
          `pages[${i}]`,
          `${JSON.stringify(fact.id)} (${fact.label}) is not on the contact page: every contact channel of the business goes on it, in a block with a field for it`
        )
  })
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
  contactChannels(composition, context, problem)
  droppedPeopleProblems(composition, context, problem)
}
