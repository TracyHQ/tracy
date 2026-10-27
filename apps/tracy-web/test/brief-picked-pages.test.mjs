/**
 * The pages a customer picked in the questionnaire's `pages` question (feed `seed.pages`), and what "Apply" does with the
 * template's other ones: a page whose own address says, unambiguously, that it is a kind the customer did not pick goes;
 * home and contact always stay; a kind they picked that the template has no page for is said, never made.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  pageKind,
  slugsForIds,
  unpickedById,
  unpickedMenuItems,
  unpickedPages
} from '../src/sites/brief-engines/picked-pages.js'

/** The answer a served questionnaire's `pages` question carries (`briefFromAnswers`). */
const picked = (...value) => [
  { id: 'name', kind: 'text', feeds: ['site.name'], label: 'Name', value: 'Spoke & Chain' },
  { id: 'pages', kind: 'multi', feeds: ['seed.pages'], label: 'Pages', value }
]

test('a page is a kind only when every word of its address names that one kind', () => {
  for (const [name, kind] of [
    ['services', 'service'],
    ['our-services', 'service'],
    ['about-us', 'about'],
    ['contact-us', 'contact'],
    ['news', 'blog'],
    ['blog', 'blog'],
    ['pricing', 'pricing'],
    ['shop', 'product'],
    ['products-2', 'product'],
    ['home', 'home']
  ])
    assert.equal(pageKind(name), kind, name)
  for (const name of [
    'projects',
    'careers',
    'company-news',
    'service-infrastructure',
    'products-and-services',
    'investor-relations',
    'sitemap',
    'dich-vu',
    // A restaurant's menu, an architect's floor plans: not a product or a pricing page.
    'menu',
    'our-menu',
    'plans',
    'floor-plans',
    'pricing-plans',
    '',
    undefined
  ])
    assert.equal(pageKind(name), null, String(name))
})

test('the pages of kinds the customer did not pick go; home, contact and the pages no kind names stay', () => {
  const pages = ['home', 'about', 'services', 'projects', 'news', 'contact', 'careers'].map((slug) => ({
    slug
  }))
  const out = unpickedPages(picked('home', 'service', 'about', 'contact', 'pricing'), pages)
  assert.deepEqual(
    out.hide.map((p) => p.slug),
    ['news']
  )
  assert.deepEqual(out.missing, ['pricing'])
  assert.equal(
    out.note,
    null,
    'projects and careers name no kind: the site may have a pricing page under another name'
  )

  const known = unpickedPages(
    picked('home', 'about', 'contact', 'pricing'),
    ['home', 'about', 'services', 'news', 'contact'].map((slug) => ({ slug }))
  )
  assert.deepEqual(
    known.hide.map((p) => p.slug),
    ['services', 'news']
  )
  assert.match(
    known.note,
    /this template has no pricing page/,
    'every page was read, so the absence is known'
  )

  const none = unpickedPages(picked('about'), [{ slug: 'home' }, { slug: 'contact' }, { slug: 'about' }])
  assert.deepEqual(none.hide, [], 'home and contact stay though nobody picked them')
})

test('products picked and none on the template: its services page stands in for them, and nothing is said', () => {
  const pages = ['home', 'about', 'services', 'contact'].map((slug) => ({ slug }))
  const out = unpickedPages(picked('home', 'product', 'about', 'contact'), pages)
  assert.deepEqual(out.hide, [], 'Services stays')
  assert.deepEqual(out.missing, [])
  assert.equal(out.note, null)
  // And the other way round.
  const shop = unpickedPages(
    picked('home', 'service', 'contact'),
    ['home', 'shop', 'contact'].map((slug) => ({ slug }))
  )
  assert.deepEqual(shop.hide, [])
  // A sibling the customer did not pick goes when the picked kind has a page of its own.
  const both = unpickedPages(
    picked('home', 'product', 'contact'),
    ['home', 'products', 'services', 'contact'].map((slug) => ({ slug }))
  )
  assert.deepEqual(
    both.hide.map((p) => p.slug),
    ['services']
  )
})

test('a note says a picked kind is missing only when every page could be read; a page no kind names is never taken off', () => {
  const out = unpickedPages(
    picked('home', 'about', 'contact'),
    ['home', 'our-story', 'get-in-touch', 'services'].map((slug) => ({ slug }))
  )
  assert.deepEqual(
    out.hide.map((p) => p.slug),
    ['services']
  )
  assert.equal(out.note, null, 'our-story may be the about page and get-in-touch the contact page')
})

test('no `pages` answer, an old brief, or an answer with no known page changes nothing', () => {
  const pages = [{ slug: 'services' }, { slug: 'news' }]
  for (const answers of [undefined, [], [{ id: 'about', feeds: ['copy.about'], value: 'x' }], picked()]) {
    const { hide, missing, note } = unpickedPages(answers, pages)
    assert.deepEqual({ hide, missing, note }, { hide: [], missing: [], note: null })
  }
})

/** A Joomla menu as `content.list` lists it, for a workshop's site in two languages. */
const menu = () => [
  { id: 1, menutype: '', alias: 'root', path: '', type: 'component', published: 1, language: '*' },
  {
    id: 101,
    menutype: 'main-en',
    alias: 'home',
    path: 'home',
    link: 'index.php?option=com_content&view=featured',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 102,
    menutype: 'main-en',
    alias: 'services',
    path: 'services',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 103,
    menutype: 'main-en',
    alias: 'wheel-truing',
    path: 'services/wheel-truing',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 104,
    menutype: 'main-en',
    alias: 'news',
    path: 'news',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 105,
    menutype: 'main-en',
    alias: 'blog',
    path: 'blog',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 106,
    menutype: 'main-en',
    alias: 'about',
    path: 'blog/about',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 107,
    menutype: 'footer-en',
    alias: 'company-news',
    path: 'company-news',
    type: 'alias',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 108,
    menutype: 'main-en',
    alias: 'contact',
    path: 'contact',
    type: 'component',
    published: 1,
    language: 'en-GB'
  },
  {
    id: 201,
    menutype: 'main-fr',
    alias: 'services',
    path: 'services',
    type: 'component',
    published: 1,
    language: 'fr-FR'
  },
  {
    id: 301,
    menutype: 'main-de',
    alias: 'services',
    path: 'services',
    type: 'component',
    published: 1,
    language: 'de-DE'
  },
  {
    id: 109,
    menutype: 'main-en',
    alias: 'pricing',
    path: 'pricing',
    type: 'component',
    published: 0,
    language: 'en-GB'
  }
]

/** The door's full read of a menu entry (`content.get`): the listing's row, with `home`. */
const reader =
  (rows, { fail = [], home = [] } = {}) =>
  async (id) => {
    if (fail.includes(id)) throw new Error('the site did not answer')
    const row = rows.find((r) => r.id === id)
    return row ? { ...row, home: home.includes(id) ? 1 : 0 } : null
  }

// 🔒 THE SHOWCASE IS NEVER UNPUBLISHED (product owner): an entry the contract's showcase-navigation map put away stays
// published when its page is unticked, so its URL keeps answering; an unticked business entry goes as before.
test('Joomla: an unticked entry the showcase map put away stays published; the unticked business entries go as before', async () => {
  const rows = menu()
  const args = [
    picked('home', 'about', 'contact', 'pricing'),
    rows,
    new Set(['en-GB', 'fr-FR']),
    reader(rows),
    null
  ]
  const before = await unpickedMenuItems(...args)
  assert.ok(before.ids.includes(104), 'without the map, the unticked News goes')
  const out = await unpickedMenuItems(...args, new Set([104]))
  assert.deepEqual(
    out.ids.sort((a, b) => a - b),
    before.ids.filter((id) => id !== 104).sort((a, b) => a - b)
  )
})

test('Joomla: the menu entries of unpicked pages go with their own entries under them, in every language a visitor reaches', async () => {
  const rows = menu()
  const out = await unpickedMenuItems(
    picked('home', 'about', 'contact', 'pricing'),
    rows,
    new Set(['en-GB', 'fr-FR']),
    reader(rows)
  )
  assert.deepEqual(
    out.ids.sort((a, b) => a - b),
    [102, 103, 104, 201],
    'services with what is under it, news, and the French services; German nobody reaches; an alias is the stranded check’s'
  )
  assert.match(out.note, /1 menu entry\(ies\) .* hold pages you picked/)
  assert.doesNotMatch(
    out.note,
    /pricing/,
    'wheel-truing names no kind, so a pricing page may be there under another name'
  )
})

test('Joomla: an entry of a menu no visitor navigates by, the home entry, and one the site cannot read are never unpublished', async () => {
  const rows = [
    ...menu(),
    {
      id: 401,
      menutype: 'mainmenu',
      alias: 'news',
      path: 'news',
      type: 'component',
      published: 1,
      language: '*'
    },
    {
      id: 402,
      menutype: 'tb-system',
      alias: 'blog',
      path: 'blog-system',
      type: 'component',
      published: 1,
      language: '*'
    }
  ]
  const out = await unpickedMenuItems(
    picked('home', 'service', 'about', 'contact'),
    rows,
    new Set(['en-GB']),
    // The listing has no `home` column: the full row says the news entry is the site's home.
    reader(rows, { home: [104] })
  )
  for (const id of [401, 402]) assert.equal(out.ids.includes(id), false, `${id}: a skipped menu`)
  assert.equal(out.ids.includes(104), false, 'the full row says it is the home entry')
  const failed = await unpickedMenuItems(
    picked('home', 'service', 'about', 'contact'),
    rows,
    new Set(['en-GB']),
    reader(rows, { fail: [104] })
  )
  assert.equal(failed.ids.includes(104), false, 'an entry that cannot be read is left')
})

test('Joomla: nothing to hide when the customer did not answer `pages`', async () => {
  assert.deepEqual(await unpickedMenuItems(undefined, menu(), new Set(['en-GB']), reader(menu())), {
    ids: [],
    note: null
  })
})

/** The site pages the server hands the brief (`brief.pages`): JA Nova's own list, as its release ships it. */
const novaPages = (picked) => ({
  all: [
    { id: 'home', label: 'Home', home: true },
    { id: 'about-us-2', label: 'About Us' },
    { id: 'project', label: 'Project' },
    { id: 'services', label: 'Services' }
  ],
  picked
})

test('by id: the pages of the template the customer untick are exactly the ones taken off, never the home page', () => {
  assert.deepEqual(unpickedById(novaPages(['home', 'about-us-2', 'services'])), ['project'])
  assert.deepEqual(
    unpickedById(novaPages(['about-us-2'])),
    ['project', 'services'],
    'home is kept even when the answer leaves it out'
  )
  assert.deepEqual(unpickedById(novaPages(['home', 'about-us-2', 'project', 'services'])), [])
})

test('by id: no pages file, no answer, or a malformed one keeps every page', () => {
  for (const pages of [null, undefined, {}, { all: 'x', picked: [] }, { all: [], picked: null }])
    assert.deepEqual(unpickedById(pages), [], JSON.stringify(pages))
  assert.deepEqual(
    unpickedById({ all: novaPages([]).all, picked: 'project' }),
    [],
    'a picked list that is not a list says nothing'
  )
})

test('by id: a WordPress id is a page path; the slug the site lists is its last part', () => {
  const pages = [
    { slug: 'home' },
    { slug: 'project' },
    { slug: 'category-blog', url: 'https://x.test/category-blog/' },
    { slug: 'category-blog', url: 'https://x.test/pages/j-content/category-blog/' }
  ]
  assert.deepEqual([...slugsForIds(['project'], pages)], ['project'])
  assert.deepEqual([...slugsForIds(['pages/j-content/category-blog'], pages)], ['category-blog'])
  assert.deepEqual([...slugsForIds(['gone'], pages)], [], 'a page the site does not list is nothing to hide')
})

/** A JA template's menu: the pages live in `mainmenu`, one level deep, and a footer repeats one of them. */
const jaMenu = () => [
  { id: 1, menutype: '', alias: 'root', path: '', type: 'component', published: 1, language: '*' },
  {
    id: 101,
    menutype: 'mainmenu',
    alias: 'home',
    path: 'home',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 102,
    menutype: 'mainmenu',
    alias: 'about-us-2',
    path: 'about-us-2',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 103,
    menutype: 'mainmenu',
    alias: 'project',
    path: 'project',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 104,
    menutype: 'mainmenu',
    alias: 'project-detail',
    path: 'project/project-detail',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 105,
    menutype: 'mainmenu',
    alias: 'services',
    path: 'services',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 201,
    menutype: 'footer',
    alias: 'project',
    path: 'project',
    type: 'component',
    published: 1,
    language: '*'
  },
  {
    id: 301,
    menutype: 'tb-system',
    alias: 'project',
    path: 'project',
    type: 'component',
    published: 1,
    language: '*'
  }
]

test('Joomla by id: exactly the unticked page’s mainmenu entry goes, with the entries under it', async () => {
  const rows = jaMenu()
  const out = await unpickedMenuItems(
    undefined,
    rows,
    new Set(['en-GB']),
    reader(rows),
    novaPages(['home', 'about-us-2', 'services'])
  )
  assert.deepEqual(
    out.ids.sort((a, b) => a - b),
    [103, 104]
  )
  assert.equal(out.note, null)
})

test('Joomla by id: a release with no mainmenu takes the entry from the menu that holds the home page', async () => {
  const rows = jaMenu().map((r) =>
    r.menutype === 'mainmenu' ? { ...r, menutype: 'tb-main-en', language: 'en-GB' } : r
  )
  const out = await unpickedMenuItems(
    undefined,
    rows,
    new Set(['en-GB']),
    reader(rows),
    novaPages(['home', 'about-us-2', 'services'])
  )
  assert.deepEqual(
    out.ids.sort((a, b) => a - b),
    [103, 104],
    'the footer repeats the page, and is not the page list'
  )
})

test('Joomla by id: the home entry stays, even when the answer leaves it out or the full row says home', async () => {
  const rows = jaMenu()
  const out = await unpickedMenuItems(
    undefined,
    rows,
    new Set(['en-GB']),
    reader(rows, { home: [105] }),
    novaPages(['project'])
  )
  assert.equal(out.ids.includes(101), false)
  assert.equal(out.ids.includes(105), false, 'the full row says services is the home entry')
  assert.equal(out.ids.includes(102), true)
})
