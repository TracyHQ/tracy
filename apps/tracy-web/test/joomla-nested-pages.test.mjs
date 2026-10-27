/**
 * The Pages question names every content page of the main menu, at any depth (TCH #1013: JA Kinetic offered 2 of its 13
 * pages because the list stopped at level 1). A Joomla page id is its menu entry's PATH (`product/features`; a level-1
 * entry's path is its alias), so an unticked page under a heading goes alone, a heading goes once every entry under it
 * went, and a ticked one the demo trim took off comes back with the heading it routes through.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tickedMenuItems, unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'

const row = (id, path, extra = {}) => ({
  id,
  menutype: 'mainmenu',
  alias: path.split('/').at(-1),
  path,
  parent_id: extra.parent ?? 1,
  type: 'component',
  published: 1,
  language: '*',
  ...extra
})

/** JA Kinetic j6 as it ships: a Home heading holding the front page, Product and Pages headings, Pricing at level 1. */
const kinetic = () => [
  { id: 1, menutype: '', alias: 'root', path: '', type: 'component', published: 1, language: '*' },
  row(100, 'home-menu', { type: 'heading' }),
  row(101, 'home-menu/home', { parent: 100 }),
  row(102, 'home-menu/home-blueprint', { parent: 100 }),
  row(110, 'product', { type: 'heading' }),
  row(111, 'product/features', { parent: 110 }),
  row(112, 'product/blog', { parent: 110 }),
  row(120, 'pricing'),
  row(130, 'pages', { type: 'heading' }),
  row(131, 'pages/login', { parent: 130 }),
  row(132, 'pages/landing', { parent: 130 })
]

/** The page list the release ships (`tracy_site_pages.json`), with the ids the customer kept ticked. */
const pages = (picked) => ({
  all: [
    { id: 'home', label: 'Home', home: true },
    { id: 'product/features', label: 'Features' },
    { id: 'product/blog', label: 'Blog' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'pages/landing', label: 'Landing' }
  ],
  picked
})

const reader = (rows) => async (id) => {
  const r = rows.find((x) => x.id === id)
  return r ? { ...r, home: id === 101 ? 1 : 0 } : null
}
const sorted = (ids) => [...ids].sort((a, b) => a - b)

test('an unticked page under a heading goes by its path, alone; the heading stays while an entry under it stays', async () => {
  const rows = kinetic()
  const out = await unpickedMenuItems(
    undefined,
    rows,
    new Set(['en-GB']),
    reader(rows),
    pages(['product/blog', 'pricing', 'pages/landing'])
  )
  assert.deepEqual(sorted(out.ids), [111])
})

test('a heading goes once every entry under it went; one that still holds a page the list does not name stays', async () => {
  const rows = kinetic()
  const out = await unpickedMenuItems(undefined, rows, new Set(['en-GB']), reader(rows), pages(['pricing']))
  assert.deepEqual(
    sorted(out.ids),
    [110, 111, 112, 132],
    'Product is emptied; Pages still holds Login, so it stays'
  )
  assert.ok(!out.ids.includes(100) && !out.ids.includes(101), 'the heading holding the home entry never goes')
})

test('a level-1 id still names its entry (old lists, Tracy Business)', async () => {
  const rows = kinetic()
  const out = await unpickedMenuItems(
    undefined,
    rows,
    new Set(['en-GB']),
    reader(rows),
    pages(['product/features', 'product/blog', 'pages/landing'])
  )
  assert.deepEqual(sorted(out.ids), [120])
})

test('a ticked nested page the trim took off comes back, and so does the heading it routes through', () => {
  const rows = kinetic().map((r) => (r.id === 110 || r.id === 112 ? { ...r, published: 0 } : r))
  const ticked = tickedMenuItems(rows, new Set(['en-GB']), pages(['product/blog']))
  assert.deepEqual(sorted(ticked.off), [110, 112])
  assert.ok(ticked.ids.includes(112))
})
