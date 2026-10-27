import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyJoomlaT4 } from '../src/apply-joomla-t4.mjs'

function fixture() {
  const store = {
    templateStyle: [{ id: 110, template: 'tracy', home: 1, params: '{"typelist-layout":"home"}' }],
    module: [
      {
        id: 10,
        title: '[Tracy Apple] Home - Hero',
        module: 'mod_ja_acm',
        position: 'masthead',
        published: 1,
        params: JSON.stringify({ 'jatools-config': JSON.stringify({ ':type': 'tracy:hero', hero: {} }) })
      }
    ],
    menuItem: [
      { id: 239, menutype: 'tracy', alias: 'home', title: 'Home', home: 1, language: '*', published: 1 }
    ],
    category: [{ id: 2, extension: 'com_content', published: 1 }],
    article: [],
    menutype: [],
    language: [],
    languageFilter: [{ id: 80, enabled: 0, params: '{}' }],
    moduleAssignment: [],
    articleAssociation: [],
    menuAssociation: []
  }
  const calls = []
  const receipts = new Map()
  let next = 300
  const apply = async ({ action, params: p = {} }) => {
    calls.push({ action, params: p })
    if (action === 'core.manifest')
      return {
        ok: true,
        manifest: {
          platform: 'joomla',
          platformVersion: '6.1.1',
          extensions: [{ type: 'language', element: 'fr-FR', enabled: 1 }]
        }
      }
    if (action === 'content.list')
      return { ok: true, items: structuredClone(store[p.kind].slice(p.offset, p.offset + p.limit)) }
    if (action === 'content.get')
      return {
        ok: true,
        item: structuredClone(store[p.kind].find((row) => row.id === p.id) ?? { menuids: '[]' })
      }
    assert.equal(action, 'content.batch')
    const key = `${p.apply_id}:${p.request_id}`
    if (receipts.has(key)) return receipts.get(key)
    const ids = {}
    for (const [index, op] of p.operations.entries()) {
      const rows = store[op.kind]
      let row = rows.find((row) => row.id === op.id)
      if (!row && op.kind === 'moduleAssignment') {
        row = { id: op.id, menuids: '[]' }
        rows.push(row)
      }
      if (op.expected)
        for (const [field, expected] of Object.entries(op.expected))
          assert.equal(String(row?.[field]), String(expected), `expected ${op.kind}.${field}`)
      if (!row) {
        row = { id: op.id || next++ }
        rows.push(row)
      }
      Object.assign(row, op.fields)
      if (op.kind === 'menuItem' && Number(op.fields.home) === 1) {
        for (const other of rows) if (other !== row && other.language === row.language) other.home = 0
      }
      ids[op.key ?? String(index)] = row.id
    }
    const result = { ok: true, ids, revision: p.request_id }
    receipts.set(key, result)
    return result
  }
  return { store, calls, apply }
}
const plan = {
  pages: [
    { slug: 'home', title: 'Coffee', body: '<h1>Coffee</h1><p>Fresh coffee</p>' },
    { slug: 'contact', title: 'Visit', body: '<p>Visit the shop</p>' }
  ],
  menu: [{ slug: 'home', label: 'Home' }]
}
const french = {
  ...plan,
  pages: [
    { slug: 'home', title: 'Café', body: '<h1>Café</h1><p>Du café frais</p>' },
    { slug: 'contact', title: 'Visite', body: '<p>Visitez la boutique</p>' }
  ]
}
const input = (f) => ({
  plan,
  site: { name: 'Coffee' },
  apply: f.apply,
  siteKey: 'coffee.test',
  applyId: 'english',
  languages: ['en']
})

test('adding French after an English build retains a neutral home, associates pages, and retry creates no duplicates', async () => {
  const f = fixture()
  await applyJoomlaT4(input(f))
  const bilingual = {
    ...input(f),
    applyId: 'french',
    languages: ['en', 'fr'],
    translations: [{ lang: 'fr', plan: french }]
  }
  const first = await applyJoomlaT4(bilingual)
  const count = Object.fromEntries(Object.entries(f.store).map(([kind, rows]) => [kind, rows.length]))
  const again = await applyJoomlaT4(bilingual)
  assert.deepEqual(again.pages, first.pages)
  assert.deepEqual(
    Object.fromEntries(Object.entries(f.store).map(([kind, rows]) => [kind, rows.length])),
    count
  )
  assert.deepEqual(
    f.store.menuItem
      .filter((row) => row.home === 1)
      .map((row) => row.language)
      .sort(),
    ['*', 'en-GB', 'fr-FR']
  )
  assert.equal(f.store.menuAssociation.length, 2)
  assert.equal(f.store.languageFilter[0].enabled, 1)
  assert(
    f.calls.some((call) =>
      call.params.operations?.some((op) => op.kind === 'menuItem' && op.id === 239 && op.fields.home === 0)
    ),
    'the displaced neutral home is in the undo journal'
  )
})

test('a Contact-only revision leaves Home and unrelated modules unchanged', async () => {
  const f = fixture()
  await applyJoomlaT4(input(f))
  const homeBefore = structuredClone(f.store.article.find((row) => row.alias === 'tracy-build-home-en'))
  const modulesBefore = structuredClone(f.store.module)
  const revised = structuredClone(plan)
  revised.pages[0].title = 'Must not land'
  revised.pages[1].body = '<p>New opening hours</p>'
  await applyJoomlaT4({ ...input(f), applyId: 'contact', plan: revised, pages: ['contact'] })
  assert.deepEqual(
    f.store.article.find((row) => row.alias === 'tracy-build-home-en'),
    homeBefore
  )
  assert.deepEqual(f.store.module, modulesBefore)
  assert.equal(
    f.store.article.find((row) => row.alias === 'tracy-build-contact-en').fulltext,
    '<p>New opening hours</p>'
  )
})

test('a requested language without translated content fails before changing the site', async () => {
  const f = fixture()
  await assert.rejects(() => applyJoomlaT4({ ...input(f), languages: ['en', 'fr'] }), /Missing translated/)
  assert(f.calls.every((call) => call.action === 'content.list'))
})

test('home sections reconcile without duplicates; removed sections retire and page links use the real menu', async () => {
  const f = fixture()
  const expanded = structuredClone(plan)
  expanded.pages[0].body +=
    '<section id="menu"><h2>Our menu</h2><p>Coffee and pastries</p><a href="/contact/">Visit us</a></section><section id="hours"><h2>Opening hours</h2><p>Every day</p></section>'
  expanded.pages[1].body += '<a href="/">Home</a>'
  const seeded = await applyJoomlaT4({ ...input(f), plan: expanded })
  const modules = f.store.module.filter((row) => row.note?.startsWith('tracy-build:section:'))
  assert.equal(modules.length, 2)
  assert(modules[0].content.includes(`index.php?Itemid=${seeded.menu['contact:en']}`))
  assert(
    f.store.article
      .find((row) => row.alias === 'tracy-build-contact-en')
      .fulltext.includes(`index.php?Itemid=${seeded.menu['home:en']}`)
  )
  await applyJoomlaT4({ ...input(f), plan: expanded })
  assert.equal(f.store.module.filter((row) => row.note?.startsWith('tracy-build:section:')).length, 2)
  expanded.pages[0].body = expanded.pages[0].body.replace(/<section id="hours">.*?<\/section>/, '')
  await applyJoomlaT4({ ...input(f), plan: expanded, applyId: 'remove-hours' })
  assert.equal(f.store.module.find((row) => row.note === 'tracy-build:section:en:hours').published, 0)
})
