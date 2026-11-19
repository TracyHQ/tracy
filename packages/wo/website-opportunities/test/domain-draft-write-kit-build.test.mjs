// What the kit declares about the build besides the pages, read by the draft write plan (ticket #597): the masthead
// row keyed to a page type (`keyedRow`), the container copies (`holds.copies`), the items of a menu block
// (`menu.items`), the frames of created records (`createdFrames`), the featured article (`seo.featuredView.article`),
// a fact place left unwritten by decision (`notWritten`) and the accent module (`look.accent.writtenAs`). The invented
// florist on the real JA Boxing kit; each test changes one declaration or one order block of a copy.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-build.test.mjs
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
const codeOf = (run) => {
  try {
    run()
  } catch (error) {
    return error.code
  }
  return 'passed'
}
const blockOf = (o, page, id) =>
  o.pages.find((p) => p.id === page).blocks.find((b) => b.id === id || b.block === id)
/** A block of the order hidden, as a write order lists it. */
const hide = (o, page, id) => {
  const block = blockOf(o, page, id)
  block.state = 'hidden'
  o.hidden.push({ at: block.at, reason: 'invented' })
}

test('keyedRow: the classes page takes masthead row 14 only, never a row of the pages list', () => {
  const keyedTo = (p, page) =>
    p.ops
      .find((op) => op.key === 'copy:site.block-162')
      .values.filter((v) => v.rule === 'key_at' && v.value?.ref === `page:${page}`)
      .map((v) => v.loc.jsonPath[2])
  assert.deepEqual(keyedTo(plan, 'classes'), [14])
  assert.ok(plan.skipped.some((s) => s.reason === 'row_keyed_to_page_type'))
  const without = planWith((m) => {
    delete m.placements['block-162'].keyedRow
  })
  assert.ok(
    keyedTo(without, 'classes').some((row) => row < 14),
    'without it a list row keys the page first'
  )
})

test('holds.copies: a container none of whose held blocks the page keeps is dropped, its words skipped', () => {
  const p = planWith(
    () => {},
    (o) => {
      for (const id of ['plans-b4', 'plans-b5']) hide(o, 'plans', id)
    }
  )
  assert.ok(!p.ops.some((op) => op.key === 'copy:plans.plans-b3'))
  assert.ok(p.skipped.some((s) => s.reason === 'container_without_held'))
  assert.ok(
    plan.ops.some((op) => op.key === 'copy:plans.plans-b3'),
    'kept while it holds a block'
  )
})

test('holds.copies: a held block with no container is left out; two containers on one page stop the plan', () => {
  const alone = () =>
    planWith(
      () => {},
      (o) => {
        hide(o, 'plans', 'plans-b3')
      }
    )
  assert.equal(codeOf(alone), 'passed', 'a held block with no container is left out (#575)')
  assert.ok(alone().skipped.some((x) => x.reason === 'held_block_without_container'))
  const twice = () =>
    planWith(
      (m) => {
        m.placements['block-184'].holds.copies.perPage = 0
      },
      () => {}
    )
  assert.equal(codeOf(twice), 'container_copies_per_page')
})

test('menu.items from pages: a placed block with no items of its own lists the pages of the kit rule', () => {
  const p = planWith(
    () => {},
    (o) => {
      for (const page of o.pages) for (const b of page.blocks) if (b.block === 'block-174') b.items = []
    }
  )
  const items = p.ops.filter((op) => op.kind === 'menuItem.create' && op.fields.menutype === 'site-map')
  assert.ok(items.length > 0 && items.length <= 4, `${items.length} items`)
  assert.ok(items.every((op) => op.link.form === 'address'))
  assert.ok(!items.some((op) => op.link.ref === 'page:home'), 'except: [home]')
  const over = () =>
    planWith((m) => {
      m.placements['block-174'].menu.items.max = 2
    })
  assert.equal(codeOf(over), 'menu_items_over_max')
})

test('menu.items from the main menu: the phone menu shows the page items, whatever menu it names', () => {
  const p = planWith((m) => {
    m.placements['block-187'].menu.menutype = 'invented-phone-menu'
  })
  assert.ok(!p.ops.some((op) => op.fields?.menutype === 'invented-phone-menu'))
  assert.ok(p.skipped.some((s) => s.reason === 'menu_item_is_page_item'))
})

test('createdFrames: a created article is written into the frame the kit declares, measured, so not flagged', () => {
  const article = plan.ops.find((op) => op.key === 'article:service-wild-meadow-bouquet')
  const fulltext = article.frames.find((f) => f.loc.column === 'fulltext')
  const declared = site.aiq.mapping.createdFrames.find(
    (f) => f.entities.includes('article-16') && f.column === 'fulltext'
  )
  assert.equal(fulltext.html, declared.html)
  assert.equal(article.unproven, undefined)
  const missing = () =>
    planWith((m) => {
      m.createdFrames = m.createdFrames.filter(
        (f) => !(f.entities.includes('article-16') && f.column === 'fulltext')
      )
    })
  assert.equal(codeOf(missing), 'created_frame_not_declared')
})

test('seo.featuredView.article: every created article of its page type is written featured', () => {
  const p = planWith((m) => {
    m.seo.featuredView.article.pageType = 'class'
  })
  const articles = p.ops.filter((op) => op.kind === 'article.create')
  assert.ok(articles.length >= 2 && articles.every((op) => op.base.featured === 1))
  assert.ok(!p.unproven.some((u) => u.code === 'featured_article_none'))
  assert.ok(
    plan.unproven.some((u) => u.code === 'featured_article_none'),
    'the florist has no post'
  )
})

test('notWritten: a fact whose every place is left unwritten by decision is skipped with that reason', () => {
  const p = planWith((m) => {
    for (const place of m.facts.phone) place.notWritten = { by: 'decision', why: 'invented' }
  })
  assert.ok(p.skipped.some((s) => s.reason === 'fact_not_written_by_decision'))
  assert.ok(p.notWritten.some((n) => n.fact === 'phone'))
  for (const op of p.ops)
    for (const v of op.values ?? []) assert.notEqual(v.rule?.startsWith('fact:phone'), true, op.key)
})

test('look.accent.writtenAs: declared, the accent is written by its module; without it the door is missing', () => {
  assert.ok(plan.ops.find((op) => op.kind === 'look.accent').entries.includes('look.accent'))
  const p = planWith((m) => {
    delete m.look.accent.writtenAs
  })
  assert.ok(p.skipped.some((s) => s.entry === 'look.accent' && s.reason === 'accent_door_missing'))
})
