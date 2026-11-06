// Template kit layouts and the shoot plan, on a made-up boxing gym: pages share a layout by what their DOM renders
// (kind and body skeleton), never by menu group; close skeletons stay apart; a further result page uses
// page 1; the shoot plan shoots each group's representative in full and each block id once per width.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyLayouts, inheritListMins, skeletonSimilarity } from '../template-kit/lib/layouts.mjs'
import { packPlan } from '../template-kit/lib/pack.mjs'
import { keepSkeleton, shootPlan } from '../template-kit/lib/shoot-pass.mjs'

const W = (id) => ({ 1440: `${id}-1440`, 390: `${id}-390` })
const page = (id, path, blocks, kind, inMainMenu = false) => ({
  id,
  path,
  kind,
  inMainMenu,
  blocks: { 1440: blocks, 390: blocks },
  images: W(id)
})
const ARTICLE = 'DIV.item-page>DIV.page-header(~),DIV.article-body(~,DIV.row(DIV.col-6(~)),~)'
const LISTING = 'DIV.blog>DIV.items(DIV.row>DIV.col-6(~)),DIV.items-more(~),DIV.pagination(~)'
const LISTING_P2 = 'DIV.blog>DIV.items(DIV.row>DIV.col-6(~)),DIV.pagination(~)'
const NOTICE = 'DIV.item-page>DIV.article-body>DIV.well(CENTER>~)'
const CLASS = 'DIV.class-detail>DIV.page-header(~),DIV.lead(~),DIV.signup(~),DIV.media(~)'
const CLASS_NO_SIGNUP = 'DIV.class-detail>DIV.page-header(~),DIV.lead(~),DIV.media(~)'

function gym() {
  const pages = [
    page('page-blog', '/blog', ['header', 'body-blog'], 'category blog', true),
    page(
      'page-blog--start-6',
      '/blog?start=6',
      ['header', 'body-blog--start-6'],
      'category blog (list position 6)'
    ),
    page('page-blog_jab', '/blog/jab', ['header', 'body-blog_jab', 'block-7'], 'article'),
    page('page-blog_hook', '/blog/hook', ['header', 'body-blog_hook'], 'article'),
    // In the blog's menu group, an article too, but a notice in a box: not the posts' layout.
    page('page-blog_offline', '/blog/offline', ['header', 'body-blog_offline'], 'article'),
    // Another menu group, the posts' layout: a representative (the about page) stands for the posts.
    page('page-about', '/about', ['header', 'body-about'], 'article', true),
    page('page-classes_kids', '/classes/kids', ['header', 'body-classes_kids'], 'article', true),
    page('page-classes_pro', '/classes/pro', ['header', 'body-classes_pro'], 'article')
  ]
  const skeletons = new Map([
    ['body-blog', LISTING],
    ['body-blog--start-6', LISTING_P2],
    ['body-blog_jab', ARTICLE],
    ['body-blog_hook', ARTICLE],
    ['body-blog_offline', NOTICE],
    ['body-about', ARTICLE],
    ['body-classes_kids', CLASS],
    ['body-classes_pro', CLASS_NO_SIGNUP]
  ])
  const blocks = ['header', 'block-7', ...pages.map((p) => `body-${p.id.slice(5)}`)].map((id) => ({
    id,
    images: W(id),
    frames: [],
    lists: [],
    links: []
  }))
  const pageGroups = [
    {
      id: 'group-blog',
      root: 'page-blog',
      children: ['page-blog--start-6', 'page-blog_jab', 'page-blog_hook', 'page-blog_offline']
    },
    { id: 'group-about', root: 'page-about', children: [] },
    { id: 'group-classes', root: 'page-classes_kids', children: ['page-classes_pro'] }
  ]
  return { kit: { widths: [1440, 390], pages, pageGroups, blocks, errors: [] }, skeletons }
}

const shotOfMap = (kit) => Object.fromEntries(kit.blocks.filter((b) => b.shotOf).map((b) => [b.id, b.shotOf]))

test('skeleton similarity: shared pieces over all pieces', () => {
  assert.equal(skeletonSimilarity(ARTICLE, ARTICLE), 1)
  assert.ok(skeletonSimilarity(LISTING, LISTING_P2) >= 0.8, 'page 2 lacks only the more-articles list')
  assert.ok(skeletonSimilarity(ARTICLE, NOTICE) < 0.8)
})

test('a layout is what the DOM renders, not the menu group; a further result page uses page 1', () => {
  const { kit, skeletons } = gym()
  const { layouts, checks } = applyLayouts(kit, { skeletons })
  assert.deepEqual(shotOfMap(kit), {
    'body-blog--start-6': 'body-blog',
    'body-blog_jab': 'body-about',
    'body-blog_hook': 'body-about'
  })
  assert.equal(layouts.get('body-blog_offline').exemplar, 'body-blog_offline', 'a notice is its own layout')
  assert.equal(kit.pages.find((p) => p.id === 'page-blog--start-6').paginationOf, 'page-blog')
  assert.deepEqual(
    checks.map((c) => [c.a, c.b, c.same]),
    [['body-classes_kids', 'body-classes_pro', false]],
    'two class pages one block apart are listed and kept apart (one more body shot, the safe side)'
  )
  const plan = packPlan(kit)
  assert.ok(!plan.imageIds.has('body-blog--start-6-1440'), 'no body shot of its own for the further page')
  assert.deepEqual(plan.missing, [])
})

test('an author listing with no map entity: a further result page still uses page 1', () => {
  const pages = [
    page('page-author', '/author/ann', ['header', 'body-author'], 'author listing (no map entity)', true),
    page(
      'page-author--start-4',
      '/author/ann?start=4',
      ['header', 'body-author--start-4'],
      'author listing (list position 4) (no map entity)'
    )
  ]
  const skeletons = new Map([
    ['body-author', LISTING],
    ['body-author--start-4', LISTING_P2]
  ])
  const blocks = ['header', 'body-author', 'body-author--start-4'].map((id) => ({
    id,
    images: W(id),
    frames: [],
    lists: [],
    links: []
  }))
  const pageGroups = [{ id: 'group-author', root: 'page-author', children: ['page-author--start-4'] }]
  const kit = { widths: [1440, 390], pages, pageGroups, blocks, errors: [] }
  applyLayouts(kit, { skeletons })
  assert.equal(kit.pages.find((p) => p.id === 'page-author--start-4').paginationOf, 'page-author')
})

test('a further result page with only some of page 1 parts (no second row of items) still uses page 1', () => {
  const ONE =
    'DIV.blog>DIV.items-leading(~),DIV.items-row.row(DIV.col-4(~),DIV.item(~)),SECTION.items-more(DIV.blog-items(~)),DIV.pagination(~)'
  const TWO = 'DIV.blog>DIV.items-leading(~),DIV.pagination(~)'
  assert.ok(skeletonSimilarity(ONE, TWO) < 0.8, 'not close by shared pieces over all pieces')
  const pages = [
    page('page-work', '/work', ['header', 'body-work'], 'category listing', true),
    page(
      'page-work--start-7',
      '/work?start=7',
      ['header', 'body-work--start-7'],
      'category listing (list position 7)'
    )
  ]
  const skeletons = new Map([
    ['body-work', ONE],
    ['body-work--start-7', TWO]
  ])
  const blocks = ['header', 'body-work', 'body-work--start-7'].map((id) => ({
    id,
    images: W(id),
    frames: [],
    lists: [],
    links: []
  }))
  const kit = {
    widths: [1440, 390],
    pages,
    pageGroups: [{ id: 'g', root: 'page-work', children: ['page-work--start-7'] }],
    blocks,
    errors: []
  }
  applyLayouts(kit, { skeletons })
  assert.equal(kit.pages.find((p) => p.id === 'page-work--start-7').paginationOf, 'page-work')
})

test('the shoot plan: representatives in full, each block id once per width, nothing for stand-ins', () => {
  const { kit, skeletons } = gym()
  applyLayouts(kit, { skeletons })
  const slugs = kit.pages.map((p) => p.id.slice(5))
  const blocks = {}
  for (const p of kit.pages)
    for (const id of p.blocks[1440]) {
      const rec = (blocks[id] ??= { id, widths: { 1440: { pages: [] }, 390: { pages: [] } } })
      for (const w of ['1440', '390']) rec.widths[w].pages.push(p.id.slice(5))
    }
  const capture = {
    widths: [1440, 390],
    pages: slugs.map((slug) => ({ slug, widths: { 1440: {}, 390: {} } })),
    blocks
  }
  const plan = shootPlan(kit, capture)
  for (const w of ['1440', '390']) {
    const at = plan[w]
    assert.deepEqual(
      Object.keys(at)
        .filter((s) => at[s].full)
        .sort(),
      ['about', 'blog', 'classes_kids'],
      'one full-page shot per page group'
    )
    const cut = Object.values(at).flatMap((j) => j.blocks)
    assert.equal(new Set(cut).size, cut.length, 'every block id is cut once')
    assert.deepEqual(
      [...cut].sort(),
      kit.blocks
        .filter((b) => !b.shotOf)
        .map((b) => b.id)
        .sort()
    )
    const reps = ['about', 'blog', 'classes_kids']
    assert.ok(
      reps.some((s) => at[s].blocks.includes('header')),
      'a shared block is cut from a representative'
    )
    assert.equal(at['blog--start-6'], undefined, 'a further result page is not opened')
  }
})

test('a shot block keeps the read pass skeleton, so pictures loaded for the shot cannot split its layout', () => {
  const read = { links: [], texts: ['old'], skeleton: 'DIV.media(),~' }
  const fresh = { links: [{ label: 'a' }], texts: ['new'], skeleton: 'DIV.media(~),~' }
  assert.deepEqual(keepSkeleton(fresh, read), {
    links: [{ label: 'a' }],
    texts: ['new'],
    skeleton: 'DIV.media(),~'
  })
  assert.equal(keepSkeleton(undefined, read), read)
  assert.equal(keepSkeleton(fresh, undefined), fresh)
})

test('a reused capture: shoot only what the plan lacks, drop what it no longer wants', async () => {
  const { planDiff } = await import('../template-kit/lib/capture-site.mjs')
  const capture = {
    pages: [
      { slug: 'news', widths: { 1440: { full: 'images/page-news-1440.jpg' } } },
      { slug: 'news_post', widths: { 1440: {} } }
    ],
    blocks: {
      'block-2': { id: 'block-2', widths: { 1440: { image: 'images/block-2-1440.jpg' } } },
      'body-news_post': { id: 'body-news_post', widths: { 1440: {} } }
    }
  }
  const plan = { 1440: { news_post: { full: true, blocks: ['block-2', 'body-news_post'] } } }
  const { missing, unwanted } = planDiff(plan, capture)
  assert.deepEqual(missing, { 1440: { news_post: { full: true, blocks: ['body-news_post'] } } })
  assert.deepEqual(unwanted, [{ kind: 'page', id: 'news', width: '1440', file: 'images/page-news-1440.jpg' }])
})

test('an items list too short to measure takes the minimum measured on the busiest page of its layout', () => {
  const list = (id, extra) => ({ id, rowKind: 'items', min: null, ...extra })
  const blocks = [
    {
      id: 'body-tag_a',
      lists: [list('tag-1.items', { min: 1, minSource: 'measured', maxEvidence: { rowsShown: 2 } })]
    },
    {
      id: 'body-tag_b',
      lists: [list('tag-2.items', { min: 2, minSource: 'measured', maxEvidence: { rowsShown: 4 } })]
    },
    { id: 'body-tag_c', lists: [list('tag-3.items')] },
    { id: 'body-about', lists: [list('about.items')] }
  ]
  const layouts = new Map([
    ['body-tag_a', { exemplar: 'body-tag_b' }],
    ['body-tag_b', { exemplar: 'body-tag_b' }],
    ['body-tag_c', { exemplar: 'body-tag_b' }],
    ['body-about', { exemplar: 'body-about' }]
  ])
  const answered = inheritListMins(layouts, new Map(blocks.map((b) => [b.id, b])))
  const c = blocks[2].lists[0]
  assert.deepEqual([c.min, c.minSource, c.minFrom], [2, 'layout', 'tag-2.items'])
  assert.equal(blocks[0].lists[0].min, 1, 'a measured list keeps its own minimum')
  assert.equal(blocks[3].lists[0].min, null, 'a layout with nothing measured gives nothing')
  assert.deepEqual([...answered], ['blocks[body-tag_c].lists[tag-3.items].min'])
})
