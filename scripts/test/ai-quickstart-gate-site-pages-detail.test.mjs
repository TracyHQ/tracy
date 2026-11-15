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
