/**
 * An unticked Joomla page takes its articles along (PAGE-7, product owner 08/10/2026, TCH #1013), except those a kept page still
 * lists or links (D11, 11/10/2026): unpublishing a blog's menu entry takes the list off its address, but each article it listed
 * still answered at its own. Nothing else lists these releases' Blog and News, so their articles still go. Held against the menus, categories
 * and articles two releases really ship (their presentation locks): JA Phio 1.0.3 (a Blog page whose category a page that
 * stays lists again, and a front page of featured articles) and Tracy Business j6 1.2.1 (News, in two languages).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { articlesGoing, articleSteps, unpickedArticles } from '../src/sites/brief-engines/joomla-articles.js'
import { unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'
import { release } from './_joomla-release.mjs'

test('JA Phio, Blog unticked: the articles only the Blog section showed go; those a page that stays shows stay', async () => {
  const { rows, articles, categories, modules, assignments } = release('ja-phio/j6/1.0.3')
  const visible = new Set(['en-GB'])
  const pageIds = rows
    .filter((r) => r.menutype === 'mainmenu' && String(r.level) === '1' && Number(r.published) === 1)
    .map((r) => r.alias)
  const sitePages = {
    all: pageIds.map((id) => ({ id, label: id, ...(id === 'home' ? { home: true } : {}) })),
    picked: pageIds.filter((id) => id !== 'blog')
  }
  const read = async (/** @type {number} */ id) => rows.find((r) => r.id === id) ?? null
  const unpicked = await unpickedMenuItems(undefined, rows, visible, read, sitePages)
  assert.ok(
    unpicked.ids.includes(106) && unpicked.ids.includes(146),
    'Blog and its Full width page (category 22) go'
  )
  const out = articlesGoing({
    rows,
    causes: unpicked.ids,
    gone: unpicked.ids,
    visible,
    articles,
    categories,
    modules,
    assignments
  })
  assert.deepEqual(out.ids, [6], 'the one article of category 22 the front page does not feature')
  assert.deepEqual(out.by.get(6), [146])
  // Category 21 is the Blog's own, and "Category blog" under Pages (120) still lists it.
  for (const id of [1, 55, 59])
    assert.equal(out.ids.includes(id), false, `article ${id} stays: 120 still lists it`)
  // Featured articles of category 22 are still shown by the front page (101, view=featured).
  for (const id of [5, 7, 8, 52, 56, 60])
    assert.equal(out.ids.includes(id), false, `article ${id} stays: featured`)
  assert.deepEqual(articleSteps(out.ids), [{ kind: 'article', id: 6, fields: { state: 0 } }])
})

test('Tracy Business j6, News unticked: every English news article goes, its subcategories included; Russian News stays', () => {
  const { rows, articles, categories, modules, assignments } = release('tracy-business/j6/1.2.1')
  const news = rows.find((r) => r.id === 603)
  assert.match(news.link, /view=category&layout=tb-news&id=259/)
  const out = articlesGoing({
    rows,
    causes: [603],
    gone: [603],
    visible: new Set(['en-GB', 'ru-RU']),
    articles,
    categories,
    modules,
    assignments
  })
  // News (259) and the four categories under it, Projects news (305) among them.
  const newsCats = new Set([
    '259',
    ...categories.filter((c) => String(c.parent_id) === '259').map((c) => String(c.id))
  ])
  assert.deepEqual([...newsCats].sort(), ['259', '260', '261', '262', '305'])
  const expected = articles
    .filter((a) => newsCats.has(String(a.catid)) && Number(a.state) === 1)
    .map((a) => a.id)
  assert.ok(expected.length > 0)
  assert.deepEqual(
    [...out.ids].sort((a, b) => a - b),
    expected.sort((a, b) => a - b)
  )
  for (const a of articles.filter((x) => ['271', '272', '273', '274'].includes(String(x.catid))))
    assert.equal(out.ids.includes(a.id), false, `the Russian News (636) still lists ${a.id}`)
  for (const a of articles.filter((x) => String(x.catid) === '253'))
    assert.equal(out.ids.includes(a.id), false, 'Projects stays')
})

test('an article already off, or no unticked page, writes nothing; a site that will not list its articles is said', async () => {
  const { rows, articles, categories } = release('tracy-business/j6/1.2.1')
  const off = articles.map((a) => ({ ...a, state: 0 }))
  assert.deepEqual(
    articlesGoing({
      rows,
      causes: [603],
      gone: [603],
      visible: new Set(['en-GB']),
      articles: off,
      categories
    }).ids,
    []
  )
  const quiet = async () => assert.fail('nothing to read')
  assert.deepEqual(
    await unpickedArticles({ apply: quiet, siteKey: 's', rows, causes: [], gone: [], visible: new Set() }),
    { ids: [], by: new Map(), routes: [], note: null }
  )
  const refusing = async () => ({ ok: false, message: 'no such kind' })
  const said = await unpickedArticles({
    apply: refusing,
    siteKey: 's',
    rows,
    causes: [603],
    gone: [603],
    visible: new Set(['en-GB'])
  })
  assert.deepEqual(said.ids, [])
  assert.match(String(said.note), /could not be read, so they stay: no such kind/)
})

test('the articles and categories are read whole, a page at a time, until a short page', async () => {
  const { rows, articles, categories } = release('tracy-business/j6/1.2.1')
  /** @type {any[]} */
  const asked = []
  const apply = async (/** @type {any} */ call) => {
    asked.push(call.params)
    const all = call.params.kind === 'article' ? articles : categories
    return { ok: true, items: all.slice(call.params.offset, call.params.offset + call.params.limit) }
  }
  const out = await unpickedArticles({
    apply,
    siteKey: 's',
    rows,
    causes: [603],
    gone: [603],
    visible: new Set(['en-GB'])
  })
  assert.ok(out.ids.length > 0)
  assert.ok(asked.every((p) => p.include_body === true && p.limit === 25))
})

test('an unticked entry of one article still takes that article off, unless a page that stays shows it', () => {
  const rows = [
    {
      id: 2,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=article&id=10',
      language: '*'
    },
    {
      id: 3,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=article&id=11',
      language: '*'
    },
    {
      id: 4,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=featured',
      language: '*'
    }
  ]
  const articles = [
    { id: 10, catid: 5, state: 1, featured: 0 },
    { id: 11, catid: 5, state: 1, featured: 1 }
  ]
  const out = articlesGoing({
    rows,
    causes: [2, 3],
    gone: [2, 3],
    visible: new Set(['en-GB']),
    articles,
    categories: [{ id: 5, parent_id: 1 }]
  })
  assert.deepEqual(out.ids, [10])
  assert.deepEqual(
    out.routes.map((a) => a.id),
    [11],
    'the featured one stays, with an address'
  )
})

// D11 (11/10/2026): what a kept page still lists stays. A list's only page unticked takes its articles; the same list also
// shown by an articles module on a page that stays keeps them; one on a page that goes does not.
test('an articles module on a kept page keeps the articles of the category it lists; on a page that goes it does not', () => {
  const rows = [
    {
      id: 2,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=category&id=5',
      language: '*'
    },
    {
      id: 3,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=featured',
      language: '*'
    }
  ]
  const articles = [
    { id: 10, catid: 5, state: 1, featured: 0, ordering: 1 },
    { id: 11, catid: 5, state: 1, featured: 0, ordering: 2 }
  ]
  const modules = [
    {
      id: 70,
      module: 'mod_articles_category',
      published: 1,
      params: JSON.stringify({ catid: [5], show_front: 'show' })
    }
  ]
  const go = (/** @type {number[]} */ menus) =>
    articlesGoing({
      rows,
      causes: [2],
      gone: [2],
      visible: new Set(['en-GB']),
      articles,
      categories: [{ id: 5, parent_id: 1 }],
      modules,
      assignments: new Map([[70, menus]])
    }).ids
  assert.deepEqual(go([2]), [10, 11], 'the module shows only on the page that goes')
  assert.deepEqual(go([3]), [], 'the module on the front page still lists them')
  assert.deepEqual(go([0]), [], 'on every page')
  assert.deepEqual(go([-2]), [], 'on every page but the one that goes')
  assert.deepEqual(go([]), [10, 11], 'on no page')
})
