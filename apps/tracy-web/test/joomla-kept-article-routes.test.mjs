/**
 * An article a page that stays still shows keeps an address that opens (spec "Template Customization Question Readiness",
 * PAGE-4 and PAGE-7). Measured 10/10/2026 on dev (JA Essence j6 1.0.3, Category Style 1 and Video unticked): the front page
 * still featured four Health articles (15, 18, 19, 20), but the only entry that routed Health (142) was off, so Joomla's
 * router built their links from whatever com_content page the visitor stood on (`/pages/j-content/category-blog/<alias>`),
 * and each of those links answered 404. The tidy-up now gives each such article an entry of its own in a menu no module
 * shows, so the router finds it wherever the link is printed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { articlesGoing } from '../src/sites/brief-engines/joomla-articles.js'
import { ROUTES_MENU, routeSteps } from '../src/sites/brief-engines/joomla-article-routes.js'
import { release } from './_joomla-release.mjs'

/**
 * Whether Joomla's router finds an entry for the article among `entries`: one of the article itself, or one listing its
 * category or a category above it (`MenuRules::preprocess`). Without one it falls back to the page the visitor is on.
 */
const routed = (
  /** @type {any[]} */ entries,
  /** @type {any} */ article,
  /** @type {any[]} */ categories
) => {
  const parent = new Map(categories.map((c) => [String(c.id), String(c.parent_id)]))
  return entries.some((row) => {
    const query = new URLSearchParams(String(row.link).split('?')[1] ?? '')
    if (query.get('option') !== 'com_content' || Number(row.published) !== 1) return false
    if (query.get('view') === 'article') return query.get('id') === String(article.id)
    if (query.get('view') !== 'category') return false
    for (let at = String(article.catid); at && at !== '0'; at = String(parent.get(at) ?? ''))
      if (at === query.get('id')) return true
    return false
  })
}

test('JA Essence j6 1.0.3, Category Style 1 and Video unticked: every article that stays still has an entry the router finds', () => {
  const { rows, articles, categories, modules, assignments } = release('ja-essence/j6/1.0.3')
  const causes = [142, 139]
  const out = articlesGoing({
    rows,
    causes,
    gone: causes,
    visible: new Set(['en-GB']),
    articles,
    categories,
    modules,
    assignments
  })
  assert.deepEqual(
    out.ids,
    [21, 26],
    'Health articles go but those a kept page lists (modules 113, 119 on Category Blog and Home 1, the front page) or links (layout-1’s Previous and Next)'
  )
  const steps = routeSteps({ rows, articles: out.routes })
  const after = [
    ...rows.filter((row) => !causes.includes(row.id)),
    ...steps.filter((step) => step.kind === 'menuItem').map((step) => step.fields)
  ]
  const staying = articles.filter((a) => Number(a.state) === 1 && !out.ids.includes(a.id))
  const lost = staying.filter((a) => !routed(after, a, categories)).map((a) => a.id)
  assert.deepEqual(
    lost,
    [],
    'no article that stays is left for the router to build from the page the visitor is on'
  )
  // The Health articles that stay lost their route with Category Style 1; 13, 14 and 23 keep theirs (Layout 2, 3, 1).
  assert.deepEqual(
    out.routes.map((/** @type {any} */ a) => a.id),
    [15, 18, 19, 20, 22, 24, 25]
  )
})

// D11 (11/10/2026), measured 10/10/2026 on dev g59-ess-j-full (JA Essence j6 1.0.4, FULL): Category Style 1 unticked took
// articles 21 and 22 of Health off, so /detail/layout-1 (article 23) showed "Previous" 18 instead of the demo's 22. Joomla's
// page navigation walks the published articles of the article's category in order (`ordering`, then id among ties).
test('JA Essence j6 1.0.4, Category Style 1 unticked: layout-1 keeps the demo’s previous (22) and next (24) article', () => {
  const { rows, articles, categories, modules, assignments } = release('ja-essence/j6/1.0.4')
  const neighbours = (/** @type {any[]} */ published, /** @type {number} */ id) => {
    const of = published.find((a) => a.id === id)
    const order = published
      .filter((a) => String(a.catid) === String(of.catid))
      .sort((a, b) => Number(a.ordering) - Number(b.ordering) || a.id - b.id)
      .map((a) => a.id)
    const at = order.indexOf(id)
    return [order[at - 1] ?? null, order[at + 1] ?? null]
  }
  const demo = articles.filter((a) => Number(a.state) === 1)
  assert.deepEqual(neighbours(demo, 23), [22, 24], 'the demo’s own neighbours of layout-1')
  const out = articlesGoing({
    rows,
    causes: [142],
    gone: [142],
    visible: new Set(['en-GB']),
    articles,
    categories,
    modules,
    assignments
  })
  const after = demo.filter((a) => !out.ids.includes(a.id))
  assert.deepEqual(neighbours(after, 23), [22, 24])
  // Without the modules that list Health, the articles go but the Previous and Next of an article whose own entry stays.
  const bare = articlesGoing({
    rows,
    causes: [142],
    gone: [142],
    visible: new Set(['en-GB']),
    articles,
    categories
  })
  assert.deepEqual(bare.ids, [21, 25, 26], '22 and 24 stay: layout-1 (23) links them')
  for (const id of [22, 24])
    assert.ok(
      out.routes.some((/** @type {any} */ a) => a.id === id),
      `${id} keeps an address`
    )
  assert.ok(out.ids.includes(21), '21 goes: no kept page lists or links it')
})

test('the entries live in a menu of their own that no module shows, one per article, under the article alias', () => {
  const { rows, articles, categories, modules, assignments } = release('ja-essence/j6/1.0.3')
  const out = articlesGoing({
    rows,
    causes: [142],
    gone: [142],
    visible: new Set(['en-GB']),
    articles,
    categories,
    modules,
    assignments
  })
  const steps = routeSteps({ rows, articles: out.routes })
  assert.equal(steps[0].kind, 'menutype')
  assert.equal(steps[0].fields.menutype, ROUTES_MENU)
  const items = steps.slice(1)
  assert.equal(items.length, out.routes.length)
  for (const step of items) {
    assert.equal(step.kind, 'menuItem')
    assert.equal(step.id, 0)
    assert.equal(step.fields.menutype, ROUTES_MENU)
    assert.equal(step.fields.parent_id, 1)
    assert.equal(step.fields.published, 1)
    assert.equal(step.fields.type, 'component', 'the component resolves its component_id from the link')
    assert.match(step.fields.link, /^index\.php\?option=com_content&view=article&id=\d+$/)
    assert.equal(JSON.parse(step.fields.params).menu_show, 0)
  }
  const capturing = items.find((s) => s.fields.link.endsWith('id=20'))
  assert.equal(capturing?.fields.alias, 'capturing-essence-expressive-line-art-techniques')
})

test('an alias a top-level entry already holds gets the article id; a menu already there is not made again', () => {
  const rows = [
    {
      id: 101,
      menutype: 'mainmenu',
      alias: 'news',
      parent_id: '1',
      link: 'index.php?option=com_content&view=featured',
      component_id: '19',
      published: '1',
      language: '*'
    },
    {
      id: 102,
      menutype: ROUTES_MENU,
      alias: 'other',
      parent_id: '1',
      link: 'index.php?option=com_content&view=article&id=9',
      component_id: '19',
      published: '1',
      language: '*'
    }
  ]
  const steps = routeSteps({ rows, articles: [{ id: 7, title: 'News', alias: 'news', language: '*' }] })
  assert.deepEqual(
    steps.map((s) => s.kind),
    ['menuItem']
  )
  assert.equal(steps[0].fields.alias, 'news-7')
  assert.deepEqual(routeSteps({ rows, articles: [] }), [])
})
