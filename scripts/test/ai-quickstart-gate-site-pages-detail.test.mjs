// The pages the marker test reads on a built Joomla site (#587 triage of run 4). An invented gym: a detail page type
// with no menu item of its own ("class") is the article the plan writes its main block into, read under that page's
// name, so its fields are judged on it (run 4 read it only as `article:<item>` and judged its fields on no page). A
// contact that a menu item opens is read at that item only: read again at its raw address it takes the active
// page's title and doubles the contact page.
import assert from 'node:assert/strict'
import test from 'node:test'
import { sitePages } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'

const base = 'http://gym.example'
const menu = {
  3: { id: 3, home: 1, link: 'index.php?option=com_content&view=featured' },
  4: { id: 4, link: 'index.php?option=com_content&view=category&layout=blog&id=9' },
  5: { id: 5, link: 'index.php?option=com_contact&view=contact&id=2' }
}
const doors = {
  get: async ({ kind, id }) => (kind === 'menuItem' ? menu[id] : kind === 'article' ? { id, catid: 9 } : null)
}
const record = {
  ids: {
    'menuItem:mainmenu:home': 3,
    'menuItem:mainmenu:classes': 4,
    'menuItem:mainmenu:contact': 5,
    'article:session-1': 21,
    'article:session-2': 22,
    'contact:main': 2
  }
}
const order = {
  pages: [
    { id: 'home', blocks: [] },
    { id: 'classes', blocks: [{ id: 'classes-b2', items: [{ id: 'session-1' }, { id: 'session-2' }] }] },
    { id: 'class', blocks: [{ id: 'class-b4', items: [] }] },
    { id: 'contact', blocks: [] }
  ]
}
const writePlan = {
  ops: [
    {
      key: 'article:session-1',
      kind: 'article.create',
      values: [{ entry: 'class.class-b4.heading', value: 'x' }]
    },
    {
      key: 'article:session-2',
      kind: 'article.create',
      values: [{ entry: 'classes.classes-b2.session-2.name', value: 'y' }]
    }
  ]
}

test('detail page: the article a detail page type is written into is read under that page', async () => {
  const pages = await sitePages({ base, record, doors, order, writePlan })
  const cls = pages.find((p) => p.pageType === 'class')
  assert.ok(cls, 'the class page is read')
  assert.match(cls.path, /view=article&id=21&catid=9&Itemid=4$/)
  assert.ok(!pages.some((p) => p.pageType === 'article:session-1'), 'read once')
  assert.ok(pages.some((p) => p.pageType === 'article:session-2'))
})

test('contact record: a contact a menu item opens is read at that item only', async () => {
  const pages = await sitePages({ base, record, doors, order, writePlan })
  assert.ok(!pages.some((p) => p.pageType === 'contact-record'))
  assert.equal(pages.filter((p) => p.pageType === 'contact').length, 1)
  // A contact no menu item opens is still read at its own address.
  const alone = await sitePages({
    base,
    record: { ids: { ...record.ids, 'contact:branch': 7 } },
    doors,
    order,
    writePlan
  })
  assert.deepEqual(
    alone.filter((p) => p.pageType === 'contact-record').map((p) => p.path),
    ['index.php?option=com_contact&view=contact&id=7']
  )
})

// Triage of run 5: the kit names the page a detail page type is read under (`pages.<type>.under.page`); run 5 read the
// class article under the first list page holding it (an about page listing the classes too), where the class layout
// does not print. The kit's page wins over the order of the list pages.
test('detail page: a detail page type is read under the page the kit names, not the first list holding it', async () => {
  const withAbout = {
    pages: [
      { id: 'home', blocks: [] },
      { id: 'about', blocks: [{ id: 'about-b3', items: [{ id: 'session-1' }] }] },
      { id: 'classes', blocks: [{ id: 'classes-b2', items: [{ id: 'session-1' }, { id: 'session-2' }] }] },
      { id: 'class', blocks: [{ id: 'class-b4', items: [] }] },
      { id: 'contact', blocks: [] }
    ]
  }
  const about = { id: 6, link: 'index.php?option=com_content&view=featured' }
  const doorsWith = {
    get: async (q) => (q.kind === 'menuItem' && q.id === 6 ? about : doors.get(q))
  }
  const ids = { ...record.ids, 'menuItem:mainmenu:about': 6 }
  const mapping = { pages: { class: { under: { page: 'classes' } } } }
  const pages = await sitePages({
    base,
    record: { ids },
    doors: doorsWith,
    order: withAbout,
    writePlan,
    mapping
  })
  assert.match(pages.find((p) => p.pageType === 'class').path, /&Itemid=4$/)
  // Without the kit's word the first list page holding it is taken, as before.
  const before = await sitePages({ base, record: { ids }, doors: doorsWith, order: withAbout, writePlan })
  assert.match(before.find((p) => p.pageType === 'class').path, /&Itemid=6$/)
})

// Triage of run 5: a list card picture (an article's intro picture) prints on the list page only, and the seventh post
// of a list showing six a page is on its second page. A paged blog list is read on each of its further pages, as many
// as its items fill at the size its menu item gives (leading and intro articles); a list whose size is unknown is not.
test('list pages: a paged blog list is read on each further page its items fill', async () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: 'post-' + i }))
  const news = {
    id: 8,
    link: 'index.php?option=com_content&view=category&layout=blog&id=9',
    params: { num_leading_articles: '0', num_intro_articles: '3' }
  }
  const doorsWith = { get: async (q) => (q.kind === 'menuItem' && q.id === 8 ? news : doors.get(q)) }
  const paged = {
    pages: [...order.pages, { id: 'news', blocks: [{ id: 'news-b2', items }] }]
  }
  const ids = { ...record.ids, 'menuItem:mainmenu:news': 8 }
  const pages = await sitePages({ base, record: { ids }, doors: doorsWith, order: paged, writePlan })
  assert.deepEqual(
    pages.filter((p) => p.pageOf === 'news').map((p) => [p.pageType, p.path]),
    [
      ['news:page-2', 'index.php?Itemid=8&start=3'],
      ['news:page-3', 'index.php?Itemid=8&start=6']
    ]
  )
  // A page size the menu item does not give: no further page is guessed.
  const unsized = { ...news, params: {} }
  const doorsUnsized = { get: async (q) => (q.kind === 'menuItem' && q.id === 8 ? unsized : doors.get(q)) }
  const none = await sitePages({ base, record: { ids }, doors: doorsUnsized, order: paged, writePlan })
  assert.equal(none.filter((p) => p.pageOf).length, 0)
})
