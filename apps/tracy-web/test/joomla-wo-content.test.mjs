/**
 * The restaurant's own posts written into the demo articles a Joomla page lists (`joomla-wo-content.js`): edited in place in
 * the order the page shows them, the rest unpublished only once the written ones read back right, a retry never writing twice.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeWoContent } from '../src/sites/brief-engines/joomla-wo-content.js'
import { applyIdOf } from '../src/sites/brief-engines/wo-content.js'

const ITEMS = [
  { id: 'p1', title: 'Fish & Chips <Friday>', body: 'Fresh cod.\nEvery Friday.\n\nBook a table.' },
  { id: 'p2', title: 'Summer terrace', body: 'Open from June.' }
]
const plan = (pageId, items = ['p1', 'p2']) => ({
  pages: [{ id: pageId, role: 'blog', keep: true, fill: 'sourced', items }]
})

const article = (id, catid, publish_up, extra = {}) => ({
  id,
  catid,
  title: `Demo ${id}`,
  alias: `demo-${id}`,
  introtext: `<p>Demo ${id}</p>`,
  fulltext: '<p>more</p>',
  state: 1,
  featured: 0,
  ordering: 0,
  publish_up,
  ...extra
})

/** A Joomla site behind the Apply door: its menu, categories and articles; every article write, in order. */
function fakeSite({ menu, articles, categories = [{ id: 8, parent_id: 1 }], mismatch = new Set() }) {
  const site = {
    menu,
    articles,
    categories,
    writes: /** @type {any[]} */ ([]),
    apply: async ({ action, params }) => {
      if (action === 'content.list') {
        const rows =
          params.kind === 'menuItem'
            ? site.menu
            : params.kind === 'article'
              ? site.articles
              : params.kind === 'category'
                ? site.categories
                : []
        return { ok: true, items: rows.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit) }
      }
      if (action === 'content.get' && params.kind === 'article') {
        const row = site.articles.find((a) => a.id === params.id)
        if (!row) return { ok: false, error: 'not_found' }
        return { ok: true, item: mismatch.has(row.id) ? { ...row, title: 'someone else' } : { ...row } }
      }
      if (action === 'content.update' && params.kind === 'article') {
        const row = site.articles.find((a) => a.id === params.id)
        if (!row) return { ok: false, message: 'no such record' }
        Object.assign(row, params.fields)
        site.writes.push(params)
        return { ok: true }
      }
      return { ok: false, error: `unknown action: ${action}` }
    }
  }
  return site
}

/** The build's store double: what was kept before, and every receipt. */
function fakeStore(writes = {}) {
  const store = {
    before: /** @type {Record<string, any>} */ ({}),
    receipts: /** @type {Record<string, any>} */ ({ ...writes }),
    recordBefore: async (_build, key, fields) => {
      store.before[key] ??= fields
      return store.before[key]
    },
    recordWrite: async (_build, key, receipt) => {
      store.receipts[key] = receipt
    }
  }
  return store
}

const blogEntry = (path, link, extra = {}) => ({
  id: 700,
  menutype: 'mainmenu',
  alias: path.split('/').pop(),
  path,
  link,
  type: 'component',
  published: 1,
  title: 'Blog',
  language: '*',
  params: {},
  ...extra
})
const MENU = (entry, more = []) => [
  { id: 1, menutype: '', published: 1, title: 'Menu_Item_Root', language: '*' },
  {
    id: 101,
    menutype: 'mainmenu',
    alias: 'home',
    path: 'home',
    link: 'index.php?option=com_content&view=featured',
    type: 'component',
    published: 1,
    home: 1,
    title: 'Home',
    language: '*'
  },
  entry,
  ...more
]

const run = async ({ site, store = fakeStore(), pageId = 'blog', items = ['p1', 'p2'] }) => {
  const notes = []
  const times = {}
  const done = await writeWoContent({
    apply: site.apply,
    siteKey: 'jm-wo',
    read: { buildId: 'b1', items: ITEMS, pagePlan: plan(pageId, items), before: {}, writes: store.receipts },
    woContent: store,
    visible: new Set(['en-GB']),
    note: (n) => notes.push(n),
    time: (k, v) => {
      times[k] = v
    }
  })
  return { done, notes, times, store }
}

test('a category page: its first articles in the order the page shows them carry the posts, the rest are unpublished', async () => {
  // Newest first (Joomla's default): 12, 11, 13 then 10.
  const site = fakeSite({
    menu: MENU(blogEntry('blog', 'index.php?option=com_content&view=category&layout=blog&id=8')),
    articles: [
      article(10, 8, '2024-01-01 00:00:00'),
      article(11, 8, '2024-03-01 00:00:00'),
      article(12, 8, '2024-04-01 00:00:00'),
      article(13, 8, '2024-02-01 00:00:00', { state: 0 }),
      article(20, 9, '2024-05-01 00:00:00')
    ]
  })
  const { done, store, times } = await run({ site })
  const byId = (id) => site.articles.find((a) => a.id === id)
  assert.equal(byId(12).title, 'Fish & Chips <Friday>')
  assert.equal(byId(12).introtext, '<p>Fresh cod.<br>Every Friday.</p>\n<p>Book a table.</p>')
  assert.equal(byId(12).fulltext, '')
  assert.equal(byId(12).alias, 'demo-12', 'the alias stays')
  assert.equal(byId(11).title, 'Summer terrace')
  assert.equal(byId(10).state, 0, 'the demo article beyond the posts is unpublished')
  assert.equal(byId(13).state, 0, 'one already off is not written again')
  assert.equal(byId(20).title, 'Demo 20', 'another category is not touched')
  assert.deepEqual(
    site.writes.map((w) => [w.id, w.apply_id]),
    [
      [12, applyIdOf('b1', 'article:12')],
      [11, applyIdOf('b1', 'article:11')],
      [10, applyIdOf('b1', 'article:10')]
    ]
  )
  assert.deepEqual(store.before['article:12'], {
    title: 'Demo 12',
    introtext: '<p>Demo 12</p>',
    fulltext: '<p>more</p>',
    state: 1
  })
  assert.equal(store.receipts['article:12'].state, 'written')
  assert.equal(store.receipts['article:12'].itemId, 'p1')
  assert.equal(store.receipts['article:10'].state, 'hidden')
  assert.deepEqual([done.written, done.hidden, done.failed], [2, 1, 0])
  assert.equal(times.woContentWritten, 2)
})

test('an article another menu entry opens on its own is not written; a page showing subcategories lists them too', async () => {
  const site = fakeSite({
    menu: MENU(
      blogEntry('blog', 'index.php?option=com_content&view=category&layout=blog&id=8', {
        params: { show_subcategory_content: '-1' }
      }),
      [
        {
          id: 701,
          menutype: 'mainmenu',
          alias: 'story',
          path: 'story',
          link: 'index.php?option=com_content&view=article&id=12',
          type: 'component',
          published: 1,
          title: 'Story',
          language: '*'
        }
      ]
    ),
    categories: [
      { id: 8, parent_id: 1 },
      { id: 9, parent_id: 8 }
    ],
    articles: [
      article(12, 8, '2024-04-01 00:00:00'),
      article(11, 8, '2024-03-01 00:00:00'),
      article(20, 9, '2024-05-01 00:00:00')
    ]
  })
  await run({ site })
  const byId = (id) => site.articles.find((a) => a.id === id)
  assert.equal(byId(12).title, 'Demo 12', 'the page of its own keeps it')
  assert.equal(byId(20).title, 'Fish & Chips <Friday>', 'the subcategory article, newest, goes first')
  assert.equal(byId(11).title, 'Summer terrace')
})

test('a written article that does not read back right leaves the rest of the page published', async () => {
  const site = fakeSite({
    menu: MENU(blogEntry('blog', 'index.php?option=com_content&view=category&id=8')),
    articles: [
      article(12, 8, '2024-04-01 00:00:00'),
      article(11, 8, '2024-03-01 00:00:00'),
      article(10, 8, '2024-01-01 00:00:00')
    ],
    mismatch: new Set([11])
  })
  const { done, store, notes } = await run({ site })
  assert.equal(site.articles.find((a) => a.id === 10).state, 1, 'nothing is unpublished')
  assert.equal(store.receipts['article:11'].state, 'failed')
  assert.ok(store.receipts['article:11'].reason)
  assert.equal(done.failed, 1)
  assert.ok(
    notes.some((n) => /blog/.test(n)),
    notes.join(' | ')
  )
})

test('a retry skips the articles a run before wrote with the same post', async () => {
  const site = fakeSite({
    menu: MENU(blogEntry('blog', 'index.php?option=com_content&view=category&id=8')),
    articles: [article(12, 8, '2024-04-01 00:00:00'), article(11, 8, '2024-03-01 00:00:00')]
  })
  const store = fakeStore({ 'article:12': { itemId: 'p1', state: 'written' } })
  const { done } = await run({ site, store })
  assert.deepEqual(
    site.writes.map((w) => w.id),
    [11]
  )
  assert.equal(done.written, 1)
  assert.equal(done.skipped, 1)
})

test('a page that opens one article is not a list: skipped, said', async () => {
  const site = fakeSite({
    menu: MENU(blogEntry('resources/blog', 'index.php?option=com_content&view=article&id=12')),
    articles: [article(12, 8, '2024-04-01 00:00:00')]
  })
  const { notes, done } = await run({ site, pageId: 'resources/blog' })
  assert.equal(site.writes.length, 0)
  assert.equal(done.written, 0)
  assert.ok(
    notes.some((n) => /resources\/blog/.test(n) && /one article/.test(n)),
    notes.join(' | ')
  )
})

test('a featured page writes the featured articles', async () => {
  const site = fakeSite({
    menu: MENU(blogEntry('blog', 'index.php?option=com_content&view=featured')),
    articles: [
      article(12, 8, '2024-04-01 00:00:00', { featured: 1 }),
      article(11, 8, '2024-03-01 00:00:00'),
      article(10, 9, '2024-01-01 00:00:00', { featured: 1 })
    ]
  })
  await run({ site })
  assert.deepEqual(
    site.writes.map((w) => [w.id, w.fields.title]),
    [
      [12, 'Fish & Chips <Friday>'],
      [10, 'Summer terrace']
    ]
  )
})

test('nothing to write when the plan fills no list page', async () => {
  const site = fakeSite({ menu: MENU(blogEntry('blog', 'x')), articles: [] })
  const { done } = await run({ site, items: [] })
  assert.equal(site.writes.length, 0)
  assert.equal(done.written, 0)
})

test('an article two pages list goes to the blog first: the offers page never writes what the blog hid (stand wobrief, ja-restaurant)', async () => {
  // Offers is the featured view; the blog lists category 8, which holds the featured articles too.
  const offers = {
    ...blogEntry('offers', 'index.php?option=com_content&view=featured'),
    id: 701,
    alias: 'offers',
    title: 'Offers'
  }
  const site = fakeSite({
    menu: MENU(blogEntry('blog', 'index.php?option=com_content&view=category&id=8'), [offers]),
    articles: [
      article(12, 8, '2024-04-01 00:00:00'),
      article(11, 8, '2024-03-01 00:00:00', { featured: 1 }),
      article(10, 8, '2024-01-01 00:00:00', { featured: 1 })
    ]
  })
  const store = fakeStore()
  const notes = []
  await writeWoContent({
    apply: site.apply,
    siteKey: 'jm-wo',
    read: {
      buildId: 'b1',
      items: [...ITEMS, { id: 'o1', title: 'Happy hour', body: 'Two for one.' }],
      pagePlan: {
        pages: [
          { id: 'offers', role: 'offers', keep: true, fill: 'sourced', items: ['o1'] },
          { id: 'blog', role: 'blog', keep: true, fill: 'sourced', items: ['p1', 'p2'] }
        ]
      },
      before: {},
      writes: store.receipts
    },
    woContent: store,
    visible: new Set(['en-GB']),
    note: (n) => notes.push(n)
  })
  assert.deepEqual(
    site.writes.filter((w) => w.fields.title).map((w) => [w.id, w.fields.title]),
    [
      [12, 'Fish & Chips <Friday>'],
      [11, 'Summer terrace']
    ]
  )
  assert.equal(site.articles.find((a) => a.id === 10).state, 0)
  assert.ok(!site.writes.some((w) => w.fields.title === 'Happy hour'))
  assert.ok(
    notes.some((n) => /offers page.*blog page/.test(n)),
    notes.join('\n')
  )
})
