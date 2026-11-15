// The build declarations the kit measured on a blank site (plugin 0.24.85) and the draft write now reads as data
// (ticket #597): every key of a row a created record writes (fact K1), the accent module on both sides (L1), the pages
// a menu block lists by the kit's rule (`menuItemPagesOf`, K3), the category title (`record.category.title`), when a
// container copy is kept (`holds.copies.keptWhen`) and the link of a listed page (`menu.items.link`). Every unknown word
// stops typed. A post a list shows takes the category of its list's page type. The invented florist on the real JA
// Boxing kit, and an invented mapping for the row rule.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-declared.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteKitOf, writePlanOf } from '../domain/draft-write-plan.mjs'
import { sinkOf } from '../domain/draft-write-sink.mjs'
import { siteOf } from '../domain/draft-write-site.mjs'
import { declaredRowsOf, rowFillsOf } from '../domain/draft-write-row-keys.mjs'
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

const at = (entity, path, extra = {}) => ({ entity, column: 'attribs', jsonPath: path, ...extra })
const ROW_MAPPING = {
  blocks: {
    'steps-a': {
      lists: {
        steps: {
          fields: {
            title: [[at('article-9', ['steps', 'steps0', 'step_title'])]],
            picture: [[at('article-9', ['steps', 'steps0', 'step_img'])]]
          }
        }
      }
    },
    // A list of parallel arrays: the last step is an index, so it is no row of keys.
    'cards-a': { fields: { name: at('module-4', ['cards', 'title', 0]) } }
  },
  createdFrames: [
    {
      entities: ['article-9'],
      column: 'attribs',
      jsonPath: ['steps', 'steps0', 'step_desc'],
      html: '<p> </p>'
    }
  ]
}
const recordWith = (locs, base = {}) => ({
  base,
  values: new Map(locs.map((loc, i) => [`v${i}`, { loc, value: 'x' }]))
})

test('a created row carries every key its frame declares, empty where the plan gives none', () => {
  const rows = declaredRowsOf(ROW_MAPPING)
  const fills = rowFillsOf(rows, recordWith([at('article-9', ['steps', 'steps0', 'step_title'])]))
  assert.deepEqual(fills.map((f) => [f.loc.jsonPath.at(-1), f.value]).sort(), [
    ['step_desc', ''],
    ['step_img', '']
  ])
  // The base's own empty value wins over an empty text; a row the record does not write takes nothing.
  const based = rowFillsOf(
    rows,
    recordWith([at('article-9', ['steps', 'steps0', 'step_img'])], {
      attribs: { steps: { steps0: { step_desc: '<p></p>' } } }
    })
  )
  assert.deepEqual(based.find((f) => f.loc.jsonPath.at(-1) === 'step_desc').value, '<p></p>')
  assert.deepEqual(rowFillsOf(rows, recordWith([at('module-4', ['cards', 'title', 0])])), [])
})

test('the class exercise rows of the real kit declare all four keys, feature_desc among them', () => {
  const rows = declaredRowsOf(site.aiq.mapping)
  const row = [...rows.values()].find((r) => JSON.stringify(r.at.jsonPath).includes('exer-features0'))
  assert.deepEqual([...row.keys].sort(), ['exer_img', 'exer_video_id', 'feature_desc', 'feature_title'])
  const fills = rowFillsOf(
    rows,
    recordWith([at('article-16', ['exer-features', 'exer-features0', 'feature_desc'])])
  )
  assert.deepEqual(fills.map((f) => f.loc.jsonPath.at(-1)).sort(), [
    'exer_img',
    'exer_video_id',
    'feature_title'
  ])
})

test('the accent is one module of the declared columns, on every page, its tones the order values of each side', () => {
  const look = plan.ops.find((op) => op.kind === 'look.accent')
  const w = site.aiq.mapping.look.accent.writtenAs
  assert.deepEqual(look.module, {
    module: w.module,
    title: w.title,
    position: w.position,
    ordering: w.ordering,
    showtitle: w.showtitle,
    style: w.style
  })
  assert.equal(look.sides.darkHook, site.aiq.mapping.look.accent.sides.darkHook)
  const dark = planWith(
    () => {},
    (o) => {
      o.look.accentDark = '#d98aa0'
    }
  ).ops.find((op) => op.kind === 'look.accent')
  assert.deepEqual(dark.tones, { light: site.order.look.accent, dark: '#d98aa0' })
  assert.deepEqual(dark.entries, ['look.accent', 'look.accentDark'])
  for (const [key, set] of [
    ['content', (m) => (m.look.accent.writtenAs.content = 'invented-sheet')],
    ['assign', (m) => (m.look.accent.writtenAs.assign = 'home-only')],
    ['values', (m) => (m.look.accent.sides.values.dark = 'accent')]
  ])
    assert.equal(
      codeOf(() => planWith(set)),
      'accent_written_as_unknown',
      key
    )
})

test('a menu with no items of its own lists the pages of the kit rule, a class page at its address', () => {
  // The footer menu of the florist (block-174) given the rule of the classes menu (block-173): the class pages.
  const p = planWith(
    (m) => {
      m.placements['block-174'].menu.items = structuredClone(m.placements['block-173'].menu.items)
    },
    (o) => {
      for (const page of o.pages) for (const b of page.blocks) if (b.block === 'block-174') b.items = []
    }
  )
  const items = p.ops.filter((op) => op.kind === 'menuItem.create' && op.fields.menutype === 'site-map')
  const classes = site.order.pages.filter((pg) => pg.pageType === 'class')
  assert.ok(classes.length >= 2)
  assert.deepEqual(
    items.map((op) => [op.link.ref, op.link.form, op.fields.title]),
    classes.map((pg) => [`page:${pg.id}`, 'address', pg.menu.label])
  )
  assert.ok(
    classes.every((pg) => p.under[pg.id]),
    'each class page is reached under its list page'
  )
})

test('menu.items.link: a link the write does not know stops the plan', () => {
  const run = () =>
    planWith((m) => {
      m.placements['block-174'].menu.items.link = 'invented-link'
    })
  assert.equal(codeOf(run), 'menu_items_link_unknown')
})

test('record.category.title: the first page of the declared type names it, else the business name, else a stop', () => {
  const titleOf = (p) => p.ops.find((op) => op.key === 'category:contact').fields.title
  assert.equal(titleOf(plan), site.order.pages.find((p) => p.pageType === 'contact').name)
  const fallback = planWith((m) => {
    m.pages.contact.record.category.title.pageType = 'about'
  })
  const name = site.order.facts.find((f) => f.kind === 'business.name').value
  assert.equal(titleOf(fallback), name)
  const unknown = () =>
    planWith((m) => {
      m.pages.contact.record.category.title.from = 'invented-source'
    })
  assert.equal(codeOf(unknown), 'category_title_unknown')
})

test('holds.copies.keptWhen: a value the write does not know stops the plan', () => {
  const run = () =>
    planWith((m) => {
      m.placements['block-184'].holds.copies.keptWhen = 'every-page'
    })
  assert.equal(codeOf(run), 'kept_when_unknown')
})

test('a post a list block shows with no page of its own is of the type reached under that list page', () => {
  const kit = draftWriteKitOf(site.aiq)
  const listed = (pageType, block) => ({
    pages: [{ id: pageType, pageType, blocks: [{ block, items: [{ data: 'post-1' }], fields: [] }] }],
    items: []
  })
  assert.equal(siteOf(listed('news', 'news-list'), kit, sinkOf()).listedTypeOf('post-1'), 'news-post')
  // The featured list shows the records of news-list (`itemsOf.block`).
  assert.equal(
    siteOf(listed('featured-posts', 'featured-list'), kit, sinkOf()).listedTypeOf('post-1'),
    'news-post'
  )
})
