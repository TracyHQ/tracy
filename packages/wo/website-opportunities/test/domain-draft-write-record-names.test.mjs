// The records the draft write creates for its pages carry what the real site refuses them without (ticket #597,
// measured on JA Boxing 1.0.11 with plugin 0.24.85): a name for the contact even when no block shows the business
// name (`record_name_empty` took the contact page out of the marker test), the category the kit declares for every
// created article and contact (`Category is required`; a contact with catid 0 answers 403), and the template style the
// kit declares for every page item. The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-record-names.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const contactOf = (p) => p.ops.find((op) => op.kind === 'contact.create')
const nameOf = (op) =>
  op.values.find((v) => v.loc.column === 'name' && !v.loc.xpath)?.value ?? op.fields.title

/** The order with every block that shows the business name hidden: no block brings the name fact into the plan. */
function withoutNameBlocks() {
  const order = structuredClone(site.order)
  for (const page of order.pages)
    for (const block of page.blocks)
      if (block.fields.some((f) => f.kind === 'business.name' || f.data === 'business-name')) {
        block.state = 'hidden'
        order.hidden = [...(order.hidden ?? []), { at: block.at, reason: 'Left out for the test.' }]
      }
  return order
}

test('the contact takes the business name when a block brings it in', () => {
  assert.equal(nameOf(contactOf(plan)), 'Larkspur Blooms')
})

test('with no block that shows the business name, the contact is named after its own page, never left empty', () => {
  const order = withoutNameBlocks()
  const p = writePlanOf(order, site.aiq, { stored: site.stored })
  const contact = contactOf(p)
  const page = order.pages.find((x) => x.pageType === 'contact')
  assert.equal(
    contact.values.find((v) => v.loc.column === 'name' && !v.loc.xpath),
    undefined
  )
  assert.equal(contact.fields.title, page.name)
})

test('with no page name either, the contact is refused before any door (record_name_empty), not invented', () => {
  const order = withoutNameBlocks()
  order.pages.find((x) => x.pageType === 'contact').name = ' '
  assert.throws(
    () => writePlanOf(order, site.aiq, { stored: site.stored }),
    (e) => e.code === 'record_name_empty' || e.details?.problems?.some((x) => x.code === 'record_name_empty')
  )
})

test('every created article and contact carries the category its page type declares', () => {
  const pages = site.aiq.mapping.pages
  const filed = plan.ops.filter((op) => op.kind === 'article.create' || op.kind === 'contact.create')
  assert.ok(
    filed.some((op) => op.kind === 'article.create') && filed.some((op) => op.kind === 'contact.create')
  )
  for (const op of filed) {
    assert.ok(pages[op.pageType]?.record?.category, `${op.key}: ${op.pageType} declares a category`)
    assert.deepEqual(op.fields.catid, { ref: `category:${op.pageType}`, form: 'id' }, op.key)
    const category = plan.ops.find((c) => c.key === op.fields.catid.ref)
    assert.equal(category.extension, pages[op.pageType].record.category.extension, op.key)
  }
})

test('every page item carries the template style its page type declares, a kept style as its id', () => {
  const kept = new Map(site.aiq.blankContract.entities.map((e) => [e.key, e.sourceId]))
  const items = plan.ops.filter((op) => op.kind === 'menuItem.create' && op.fields.menutype === plan.mainMenu)
  assert.ok(items.length > 0)
  for (const op of items) {
    const declared = site.aiq.mapping.pages[op.pageType].menuItem.templateStyle
    const want = declared === 0 ? 0 : Number(kept.get(declared))
    assert.equal(op.item.templateStyle, want, op.key)
  }
})
