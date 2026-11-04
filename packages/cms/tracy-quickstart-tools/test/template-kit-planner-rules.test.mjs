// Three rules a planner relies on, each with the self-check that keeps a kit from breaking it: one character limit
// per slot kind of a list (measured from the frame, the smallest across rows), template showcase pages left out of
// the kit, and page groups that follow the real structure (a listing page with its own items).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { detailPageChecks, groupPages, mixedGroupChecks } from '../template-kit/lib/page-groups.mjs'
import { representativeChecks } from '../template-kit/lib/pack.mjs'
import { readTextFit } from '../template-kit/lib/read-text-fit.js'
import { judgeShowcase, showcaseChecks } from '../template-kit/lib/showcase-pages.mjs'
import { assignSlotOwners, slotOwnerChecks } from '../template-kit/lib/slot-owners.mjs'
import { showcaseViewOf } from '../template-kit/lib/site/adapters/joomla.mjs'
import { harmonizeLimits, limitChecks } from '../template-kit/lib/text-limits.mjs'

const page = (id, path, kind, extra = {}) => ({ id, path, kind, from: [], inMainMenu: false, ...extra })

test('a listing page under another listing is its own group, with its own items and further pages', () => {
  const pages = [
    page('page-home', '/', 'featured articles', { inMainMenu: true }),
    page('page-about', '/about', 'featured articles', { inMainMenu: true }),
    page('page-about_contact', '/about/contact', 'contact page', { inMainMenu: true }),
    page('page-about_news', '/about/news', 'category listing', { inMainMenu: true }),
    page('page-about_news_first', '/about/news/first', 'article'),
    page('page-about_news--start-6', '/about/news?start=6', 'category listing (list position 6)'),
    page('page-styles', '/demo/styles', 'article', { inMainMenu: true, from: ['/'] })
  ]
  const groups = groupPages(pages, new Map())
  const of = (root) => groups.find((g) => g.root === root)?.children
  assert.deepEqual(of('page-about_news'), ['page-about_news_first', 'page-about_news--start-6'])
  assert.deepEqual(of('page-about'), [])
  assert.deepEqual(
    of('page-about_contact'),
    [],
    'a contact page under a listing path is not one of its items'
  )
  assert.deepEqual(
    of('page-home'),
    [],
    'an article with its own menu item is not an item of the page linking to it'
  )
  assert.deepEqual(of('page-styles'), [])
})

test('self-check: a group mixing a listing with unrelated pages is an error', () => {
  const pages = [
    page('page-about', '/about', 'featured articles', { inMainMenu: true }),
    page('page-about_contact', '/about/contact', 'contact page', { inMainMenu: true }),
    page('page-about_news', '/about/news', 'category listing', { inMainMenu: true }),
    page('page-about_news_first', '/about/news/first', 'article')
  ]
  const groups = [
    { id: 'group-about', root: 'page-about', children: ['page-about_contact', 'page-about_news'] },
    { id: 'group-about_news', root: 'page-about_news', children: ['page-about_news_first'] }
  ]
  const errors = []
  assert.equal(mixedGroupChecks({ pages, pageGroups: groups, itemParent: new Map(), errors }), 1)
  assert.match(errors[0].reason, /about\/contact.*about\/news|about\/news.*about\/contact/)
  const fine = groupPages(pages, new Map())
  assert.equal(mixedGroupChecks({ pages, pageGroups: fine, itemParent: new Map(), errors: [] }), 0)
})

test('showcase pages are judged from structure: demo-only content, a CMS search view, and articles in their section', () => {
  const map = { entities: [{ key: 'article-17', kind: 'article', demoOnly: true }] }
  const pages = [
    page('page-styles', '/pages/demo/styles', 'article', { owner: 'article-17', inMainMenu: true }),
    page('page-search', '/pages/demo/search', 'finder search', { inMainMenu: true }),
    page('page-offline', '/pages/demo/offline', 'article', { owner: 'article-28', inMainMenu: true }),
    page('page-blog', '/pages/blog', 'category listing', { inMainMenu: true }),
    page('page-about', '/about', 'article', { owner: 'article-3', inMainMenu: true }),
    page('page-help', '/help/search', 'finder search', { inMainMenu: true })
  ]
  const links = { '/pages/demo/offline': [], '/about': [] }
  const judged = judgeShowcase({ pages, map, linksOf: (p) => links[p] ?? null, viewOf: showcaseViewOf })
  assert.deepEqual([...judged.keys()].sort(), [
    '/help/search',
    '/pages/demo/offline',
    '/pages/demo/search',
    '/pages/demo/styles'
  ])
  assert.match(judged.get('/pages/demo/offline'), /section/)
  assert.equal(showcaseViewOf('category listing'), null)
})

test('self-check: a showcase page still in the kit, or not named in excludedPages, is an error', () => {
  const judged = new Map([['/demo/styles', 'its content is marked demo-only in the content map']])
  const errors = []
  const kept = [{ id: 'page-demo_styles', path: '/demo/styles' }]
  assert.equal(showcaseChecks({ judged, pages: kept, excludedPages: [], errors }), 1)
  const listed = [{ reason: 'showcase page', count: 1, paths: ['/demo/styles'] }]
  assert.equal(showcaseChecks({ judged, pages: [], excludedPages: listed, errors: [] }), 0)
})

const row = (index, title, text) => ({
  index,
  slots: [
    { id: `block-1.${index}`, role: 'step.title', type: 'text', maxCharacters: title },
    { id: `block-1.${index + 10}`, role: 'step.description', type: 'text', maxCharacters: text }
  ]
})

test('one limit per slot kind of a list: the smallest frame measurement across rows', () => {
  const list = {
    id: 'block-1.step',
    rowSlots: [
      { id: 'block-1.0', role: 'step.title', type: 'text', maxCharacters: 48 },
      { id: 'block-1.10', role: 'step.description', type: 'text', maxCharacters: 656 }
    ],
    rows: [row(0, 48, 656), row(1, 40, 384)]
  }
  const fit = { 'block-1.0': { limit: 22 }, 'block-1.1': { limit: 18 }, 'block-1.10': { limit: 300 } }
  harmonizeLimits(list, fit)
  assert.deepEqual(
    list.rows.map((r) => r.slots.map((s) => s.maxCharacters)),
    [
      [18, 300],
      [18, 300]
    ]
  )
  assert.deepEqual(
    list.rowSlots.map((s) => [s.maxCharacters, s.maxCharactersFrom]),
    [
      [18, 'frame'],
      [300, 'frame and content map']
    ]
  )
})

test('self-check: differing limits across rows, or a list limit that is not their smallest, is an error', () => {
  const list = {
    id: 'block-1.step',
    rowSlots: [
      { id: 'block-1.0', role: 'step.title', type: 'text', maxCharacters: 48 },
      { id: 'block-1.10', role: 'step.description', type: 'text', maxCharacters: 384 }
    ],
    rows: [row(0, 48, 384), row(1, 40, 384)]
  }
  const errors = []
  assert.equal(limitChecks({ blocks: [{ id: 'block-1', lists: [list] }], errors }), 1)
  assert.match(errors[0].reason, /40.*48|48.*40/)
  harmonizeLimits(list, {})
  assert.equal(limitChecks({ blocks: [{ id: 'block-1', lists: [list] }], errors: [] }), 0)
})

test('the frame limit is measured by filling the box, whatever the demo text length', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  // Fabricated: two steps, one frame width each, demo titles of very different lengths.
  const html = `<style>body{margin:0;font:16px/20px monospace}.step{width:200px;display:inline-block;vertical-align:top}
    h3{font:16px/20px monospace;margin:0}</style>
    <div data-kit-block="steps"><div class="step"><h3>Warm up</h3><p>Short.</p></div><div class="step"><h3>Long cool down phase</h3><p>Another.</p></div></div>`
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(html)
    const fit = await page.evaluate(readTextFit, {
      block: 'steps',
      texts: [
        { id: 'a', text: 'Warm up' },
        { id: 'b', text: 'Long cool down phase' }
      ]
    })
    // 200px of a monospace face at 16px holds about 20 characters on one line, for both rows.
    assert.ok(Math.abs(fit.a.limit - fit.b.limit) <= 1, JSON.stringify(fit))
    assert.ok(fit.a.limit >= 18 && fit.a.limit <= 26, JSON.stringify(fit))
    assert.equal(fit.a.lines, 1)
    // The page is left as it was.
    assert.equal(await page.locator('h3').first().innerText(), 'Warm up')
  } finally {
    await browser.close()
  }
})

test('a slot belongs to one block: the block that renders it, its own entity first; others are named on it', () => {
  // Fabricated: the header listed the shop name of a masthead module and the footer logo; the footer draws the logo.
  const blocks = [
    {
      id: 'header',
      source: { entity: null },
      demoOwned: [{ id: 'block-62.0', role: 'business.name' }],
      frames: [
        { id: 'block-70.1', picture: 'images/logo.png' },
        { id: 'site-1.0', picture: 'images/logo.png' }
      ],
      lists: []
    },
    {
      id: 'block-62',
      source: { entity: 'module-62' },
      demoOwned: [{ id: 'block-62.0', role: 'business.name' }],
      frames: [],
      lists: []
    },
    {
      id: 'block-70',
      source: { entity: 'module-70' },
      demoOwned: [],
      frames: [{ id: 'block-70.1', picture: 'images/logo.png' }],
      lists: []
    }
  ]
  const slots = {
    'block-62.0': { entity: 'module-62', sample: 'Example Gym' },
    'block-70.1': { entity: 'module-70', sample: 'images/logo.png#joomlaImage://x' }
  }
  const errors = []
  assert.equal(slotOwnerChecks({ blocks, errors }), 2)
  assignSlotOwners({ blocks, slotOf: (id) => slots[id] ?? null, textsOf: () => '' })
  assert.equal(slotOwnerChecks({ blocks, errors: [] }), 0)
  assert.deepEqual(blocks[0].demoOwned, [])
  assert.deepEqual(
    blocks[0].frames.map((f) => f.id),
    ['site-1.0']
  )
  assert.deepEqual(blocks[2].frames[0].alsoShownIn, ['header'])
  assert.equal(blocks[1].demoOwned.length, 1)
})

test('a detail page joins the page one level up whose list links to it, even with a menu item of its own', () => {
  const pages = [
    page('page-about', '/about', 'featured articles', { inMainMenu: true }),
    page('page-about_contact', '/about/contact', 'contact page', { inMainMenu: true }),
    page('page-about_team', '/about/team', 'featured articles', { inMainMenu: true }),
    page('page-about_team_sam', '/about/team/sam', 'featured articles', { inMainMenu: true })
  ]
  // The team page's list of people links to Sam; the about page's list links to Sam too, but it is not one level up.
  const listedBy = new Map([['/about/team/sam', new Set(['/about/team', '/about'])]])
  const groups = groupPages(pages, new Map(), { listedBy })
  const of = (root) => groups.find((g) => g.root === root)?.children
  assert.deepEqual(of('page-about_team'), ['page-about_team_sam'])
  assert.deepEqual(of('page-about'), [])
  assert.deepEqual(of('page-about_contact'), [])
  assert.equal(mixedGroupChecks({ pages, pageGroups: groups, listedBy, errors: [] }), 0)
})

test('self-check: a detail page outside the group of the page that lists it is an error', () => {
  const pages = [
    page('page-team', '/team', 'featured articles', { inMainMenu: true }),
    page('page-team_sam', '/team/sam', 'featured articles', { inMainMenu: true })
  ]
  const listedBy = new Map([['/team/sam', new Set(['/team'])]])
  const apart = [
    { id: 'group-team', root: 'page-team', children: [] },
    { id: 'group-team_sam', root: 'page-team_sam', children: [] }
  ]
  const errors = []
  assert.equal(detailPageChecks({ pages, pageGroups: apart, listedBy, errors }), 1)
  assert.equal(errors[0].kind, 'detail-page-outside-listing')
  assert.equal(
    detailPageChecks({ pages, pageGroups: groupPages(pages, new Map(), { listedBy }), listedBy, errors: [] }),
    0
  )
})

test('self-check: a group with items whose representative is not its listing page is an error', () => {
  const p = (id, path, blocks) => ({ id, path, inMainMenu: true, blocks: { 1440: blocks } })
  const pages = [
    p('page-blog', '/blog', ['header', 'body-blog']),
    p('page-blog_jab', '/blog/jab', ['header', 'body-jab', 'block-7'])
  ]
  const groups = [{ id: 'group-blog', root: 'page-blog', children: ['page-blog_jab'] }]
  assert.equal(representativeChecks({ pages, pageGroups: groups, errors: [] }), 0)
  const errors = []
  const stale = [{ ...groups[0], representative: 'page-blog_jab' }]
  assert.equal(representativeChecks({ pages, pageGroups: stale, errors }), 1)
  assert.equal(errors[0].kind, 'representative-not-listing')
})

test('a listing listed by the page above it stays its own group: a shop of categories, each with its products', () => {
  // A made-up kite shop: the shop page lists its categories, each category lists its products one level down; one
  // product is shown on no list (the demo's list is cut at six) and still joins its category.
  const pages = [
    page('page-shop', '/shop', 'shop home', { inMainMenu: true }),
    page('page-shop_kites', '/shop/kites', 'shop category', { inMainMenu: true }),
    page('page-shop_kites_delta', '/shop/kites/delta-detail', 'unknown'),
    page('page-shop_kites_box', '/shop/kites/box-detail', 'unknown'),
    page('page-shop_kites_sled', '/shop/kites/sled-detail', 'unknown'),
    page('page-shop_reels', '/shop/reels', 'shop category', { inMainMenu: true }),
    page('page-shop_reels_hand', '/shop/reels/hand-detail', 'unknown'),
    page('page-help', '/help', 'category listing', { inMainMenu: true }),
    page('page-help_faq', '/help/faq', 'category listing', { inMainMenu: true }),
    page('page-help_faq_one', '/help/faq/one', 'article')
  ]
  const listedBy = new Map([
    ['/shop/kites', new Set(['/shop'])],
    ['/shop/reels', new Set(['/shop'])],
    ['/shop/kites/delta-detail', new Set(['/shop/kites', '/'])],
    ['/shop/kites/box-detail', new Set(['/shop/kites'])],
    ['/shop/reels/hand-detail', new Set(['/shop/reels'])],
    ['/help/faq', new Set(['/help'])],
    ['/help/faq/one', new Set(['/help/faq'])]
  ])
  const groups = groupPages(pages, new Map(), { listedBy })
  const of = (root) => groups.find((g) => g.root === root)?.children
  assert.deepEqual(of('page-shop'), [])
  assert.deepEqual(of('page-shop_kites'), [
    'page-shop_kites_delta',
    'page-shop_kites_box',
    'page-shop_kites_sled'
  ])
  assert.deepEqual(of('page-shop_reels'), ['page-shop_reels_hand'])
  assert.deepEqual(of('page-help_faq'), ['page-help_faq_one'])
  assert.equal(mixedGroupChecks({ pages, pageGroups: groups, listedBy, errors: [] }), 0)
  assert.equal(detailPageChecks({ pages, pageGroups: groups, listedBy, errors: [] }), 0)
})

test('a further result page of a listed listing stays with it, and the group does not mix', () => {
  const pages = [
    page('page-guide', '/guide', 'article', { inMainMenu: true }),
    page('page-guide_tips', '/guide/tips', 'category listing', { inMainMenu: true }),
    page('page-guide_tips--start-5', '/guide/tips?start=5', 'category listing (list position 5)', {
      from: ['/guide/tips']
    })
  ]
  const listedBy = new Map([['/guide/tips', new Set(['/guide'])]])
  const groups = groupPages(pages, new Map(), { listedBy })
  assert.deepEqual(groups.find((g) => g.root === 'page-guide')?.children, [
    'page-guide_tips',
    'page-guide_tips--start-5'
  ])
  assert.equal(mixedGroupChecks({ pages, pageGroups: groups, listedBy, errors: [] }), 0)
})
