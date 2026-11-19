// The page of every page type as the kit declares it, read by the draft write plan (ticket #597, `mapping.pages`): the
// menu item's link, template style, params and parent, an item page reached under its list page or on an item of its
// own, the record and category a page creates, and the typed stops for a page the kit cannot make or a link it cannot
// fill. The invented florist on the real JA Boxing kit; each test changes one declaration of a copy of the kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-pages.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const planWith = (kit = () => {}, order = () => {}) => {
  const aiq = structuredClone(site.aiq)
  const o = structuredClone(site.order)
  kit(aiq.mapping)
  order(o)
  return writePlanOf(o, aiq, { stored: site.stored })
}
const stopOf = (run) => {
  try {
    run()
  } catch (error) {
    return { code: error.code, noRerun: error.noRerun, details: error.details }
  }
  return { code: 'passed' }
}
const item = (p, page) => p.ops.find((op) => op.key === `menuItem:${p.mainMenu}:${page}`)

test('a page item takes the link, template style and params the kit declares', () => {
  const home = item(plan, 'home')
  assert.equal(home.link.template, 'index.php?option=com_content&view=featured')
  assert.equal(home.item.templateStyle, 13, 'templateStyle-13 is the kept Landing style')
  assert.equal(home.item.params.num_leading_articles, 1)
  const classes = item(plan, 'classes')
  assert.equal(classes.item.templateStyle, 0)
  assert.deepEqual(classes.link.refs, { 'category:class': { ref: 'category:class', form: 'id' } })
  const contact = item(plan, 'contact')
  assert.deepEqual(contact.link.refs.record, { ref: 'contact:page.contact', form: 'id' })
})

test('a kept record of the blank site is written as its id in the link', () => {
  assert.equal(
    item(plan, 'plans').link.template,
    'index.php?option=com_content&view=category&layout=blog&id=2'
  )
})

test('a parent page type makes the item a child of that page item, created after it', () => {
  const p = planWith((m) => {
    m.pages.contact.menuItem.parent = 'plans'
  })
  assert.deepEqual(item(p, 'contact').item.parent, { ref: 'page:plans', form: 'id' })
  const keys = p.ops.map((op) => op.key)
  assert.ok(keys.indexOf(`menuItem:${p.mainMenu}:plans`) < keys.indexOf(`menuItem:${p.mainMenu}:contact`))
})

test('a parent page type the plan has not leaves the item at the top of the main menu, written', () => {
  const p = planWith((m) => {
    m.pages.contact.menuItem.parent = 'news'
  })
  const contact = item(p, 'contact')
  assert.equal(contact.item.parent, undefined)
  assert.ok(p.ops.some((op) => op.key === `menuItem:${p.mainMenu}:contact`))
})

test('an item page whose list page is not in the plan takes its own item (ownItem)', () => {
  const p = planWith((m) => {
    m.pages.class.under.page = 'news'
  })
  assert.equal(p.under.class, undefined)
  const own = item(p, 'class')
  assert.equal(own.link.template, 'index.php?option=com_content&view=article&id={record}')
  assert.equal(own.link.own, true)
  assert.deepEqual(own.link.refs.record, { ref: 'article:service-wild-meadow-bouquet', form: 'id' })
})

test('a page type the kit cannot make is left out and listed, never reported written, and the build goes on', () => {
  const p = planWith((m) => {
    m.pages.plans = { unbuilt: { code: 'record_kind_unsupported', why: 'invented: no such record' } }
  })
  assert.deepEqual(
    p.skippedItems.find((s) => s.op === 'page:plans'),
    { code: 'page_unbuilt', op: 'page:plans', place: 'plans', reason: 'record_kind_unsupported', at: 'plan' }
  )
  assert.ok(!p.ops.some((op) => op.key === `menuItem:${p.mainMenu}:plans`))
  assert.ok(p.ops.some((op) => op.key === `menuItem:${p.mainMenu}:home`))
})

test('a page type the kit does not declare is left out and listed; a kit with no pages keeps the featured view', () => {
  const p = planWith((m) => {
    delete m.pages.plans
  })
  assert.equal(p.skippedItems.find((s) => s.op === 'page:plans')?.code, 'page_type_not_declared')
  const older = planWith((m) => {
    delete m.pages
  })
  assert.deepEqual(item(older, 'plans').link, { fixed: 'index.php?option=com_content&view=featured' })
  assert.ok(older.unproven.some((u) => u.code === 'menu_item_link_not_declared'))
})

test('a link naming a kept record the blank site has not stops the plan', () => {
  const stop = stopOf(() =>
    planWith((m) => {
      m.pages.plans.menuItem.link = 'index.php?option=com_content&view=category&id={entity:category-404}'
    })
  )
  assert.deepEqual([stop.code, stop.details.placeholder], ['page_link_unresolved', 'entity:category-404'])
})

test('a created record starts from the declared base columns, filed in the declared category', () => {
  const article = plan.ops.find((op) => op.key === 'article:service-wild-meadow-bouquet')
  assert.equal(article.base.attribs.article_layout, 'ja_boxing:classes')
  assert.deepEqual(article.base.attribs['classes-info'], {})
  assert.equal(article.base.images.image_intro, '')
  assert.deepEqual(article.fields.catid, { ref: 'category:class', form: 'id' })
  const category = plan.ops.find((op) => op.key === 'category:class')
  assert.deepEqual([category.extension, category.params.t4_extrafields], ['com_content', 'classes'])
  const contact = plan.ops.find((op) => op.key === 'contact:page.contact')
  assert.deepEqual(contact.fields.catid, { ref: 'category:contact', form: 'id' })
  assert.equal(plan.ops.find((op) => op.key === 'category:contact').extension, 'com_contact')
})

test('a menu item of another menu linking to a page reached under its list page: its address, else left out', () => {
  const toClass = (o) => {
    const foot = o.pages.find((p) => p.id === 'home').blocks.find((b) => b.block === 'block-174')
    const link = foot.items.find((i) => i.data === 'plans').fields.find((f) => f.field === 'link')
    link.target = { page: 'class' }
  }
  // link: "page-address": a url item to the address the class page is reached at.
  const p = planWith(() => {}, toClass)
  const op = p.ops.find((o) => o.key === 'menuItem:site-map:class')
  assert.deepEqual(op.link, { ref: 'page:class', form: 'address' })
  assert.ok(p.under.class, 'the class page is reached under its list page')
  // A kit with no menu.items declaration makes an alias item, which has nothing to name.
  const alias = planWith((m) => {
    delete m.placements['block-174'].menu.items
  }, toClass)
  assert.ok(!alias.ops.some((o) => o.key === 'menuItem:site-map:class'))
  assert.deepEqual(
    alias.skippedItems.find((s) => s.code === 'menu_item_to_under_page'),
    {
      code: 'menu_item_to_under_page',
      op: 'menuItem:site-map:class',
      place: 'block-174',
      reason: null,
      at: 'plan'
    }
  )
})

test('a block assigned to a page reached under its list page prints there only at a declared detail position', () => {
  const perPage = (m) => {
    m.placements['block-176'].assign = 'page'
  }
  const at = (position) => (o) => {
    for (const page of o.pages.filter((p) => p.pageType === 'class'))
      page.blocks.find((b) => b.block === 'block-176').position.request = position
  }
  // The class recipe places block-176: outside a detail position its copy would print on the list page too, so it is
  // not written on the class pages, with its reason, and the plan goes on (`draft-write-under-blocks.mjs`).
  const outside = planWith(perPage)
  assert.deepEqual(
    outside.underNotWritten.map((r) => [r.page, r.storeBlock]),
    [
      ['class', 'block-176'],
      ['class-2', 'block-176']
    ]
  )
  // A block no class recipe places still stops the plan: domain-draft-write-under-blocks.test.mjs.
  assert.equal(stopOf(() => planWith(perPage, at('detail-bottom-1'))).code, 'passed')
  const assignTo = (m) => {
    perPage(m)
    m.pages.class.under.detailPositions.assignTo = 'item-page'
  }
  assert.equal(stopOf(() => planWith(assignTo, at('detail-bottom-1'))).code, 'under_page_position_not_detail')
})

test('every parent page type the kit declares: a planned page is written whether or not its parent is planned', () => {
  const declared = Object.entries(site.aiq.mapping.pages)
    .map(([type, d]) => [type, (d.menuItem ?? d.ownItem)?.parent])
    .filter(([, parent]) => parent !== undefined)
  assert.ok(declared.length > 0, 'the kit declares at least one parent page type')
  const planned = new Set(site.order.pages.map((p) => p.pageType))
  for (const [type, parent] of declared) {
    // The invented contact page takes the parent the kit declares for this page type.
    const p = planWith((m) => {
      m.pages.contact.menuItem.parent = parent
    })
    const contact = item(p, 'contact')
    assert.ok(contact, `${type}: the page under ${parent} is written`)
    const at = site.order.pages.find((q) => q.pageType === parent)
    if (planned.has(parent)) assert.deepEqual(contact.item.parent, { ref: `page:${at.id}`, form: 'id' })
    else
      assert.equal(contact.item.parent, undefined, `${type}: no ${parent} page, so the item sits at the top`)
  }
})
