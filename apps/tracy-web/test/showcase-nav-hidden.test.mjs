/**
 * The template's showcase is put away from navigation at provisioning (each contract's reviewed `showcase-nav-map.json`): on
 * Joomla its menu entries are set `menu_show` 0, on WordPress its links leave the navigations. The pages stay published and
 * their URLs keep working, so no later Apply step may put an entry back in a menu or draft a page because of it.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { navHiddenMenuIds, showcaseNavMap, showcasePageIds } from '../src/lib/showcase-nav-map.js'
import { tickedMenuItems, unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'

const contract = (/** @type {string} */ rel) =>
  fileURLToPath(new URL(`../../../packages/cms/${rel}/`, import.meta.url))
const JOOMLA = contract('tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.6')
const WORDPRESS = contract('tracy-wordpress-quickstart/contracts/ja-diner/wp7/1.0.1')
const read = (/** @type {string} */ dir, /** @type {string} */ name) =>
  JSON.parse(readFileSync(path.join(dir, name), 'utf8'))

/** Tracy Business j6's menu as a new site lists it: the demo trim's rows moved, the showcase's entries off the menus. */
function provisionedMenu() {
  const { entities } = read(JOOMLA, 'presentation-lock.json')
  const trim = new Map(read(JOOMLA, 'demo-trim-map.json').hide.map((h) => [h.key, h]))
  const navHidden = new Set(
    showcaseNavMap(JOOMLA)
      .operations.filter((op) => op.op === 'menuItem.param' && op.path === 'menu_show')
      .map((op) => op.key)
  )
  const rows = Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => {
      const moved = trim.get(key)
      return {
        id: Number(key.slice('menuItem-'.length)),
        ...row,
        ...(moved ? { [moved.field]: moved.to } : {}),
        ...(navHidden.has(key) ? { params: JSON.stringify({ menu_show: 0 }) } : {})
      }
    })
  return { rows, navHidden: rows.filter((r) => navHidden.has(`menuItem-${r.id}`)) }
}

test('Joomla: a menu entry the showcase map hid stays hidden after Apply; only what the trim took off is published again', () => {
  const { rows, navHidden } = provisionedMenu()
  assert.ok(navHidden.length > 0, 'the release hides showcase entries')
  const all = ['home', 'about', 'services', 'projects', 'news', 'contact'].map((id) => ({
    id,
    label: id,
    ...(id === 'home' ? { home: true } : {})
  }))
  const ticked = tickedMenuItems(rows, new Set(['en-GB']), { all, picked: all.map((p) => p.id) })
  // Apply's tidy-up writes `published: 1` to these ids and nothing else about them; `menu_show` is never written back.
  for (const id of ticked.off) {
    const row = rows.find((r) => r.id === id)
    assert.equal(Number(row.published), 0, `entry ${id} is one the trim unpublished`)
  }
  for (const row of navHidden) {
    assert.equal(ticked.off.includes(row.id), false, `entry ${row.id} (${row.title}) is not touched`)
    assert.equal(Number(row.published), 1, 'a showcase entry stays published, so its URL keeps answering')
  }
})

test('WordPress: the showcase pages are the pages of the removed links, their submenus included', () => {
  const map = showcaseNavMap(WORDPRESS)
  assert.ok(map)
  const removed = map.operations.filter((op) => op.op === 'navigation.removeLink')
  const ids = showcasePageIds(map)
  assert.ok(ids.size > 0)
  for (const op of removed) {
    if (op.link?.pageId) assert.ok(ids.has(op.link.pageId), op.label)
    for (const inner of op.contains ?? []) if (inner.pageId) assert.ok(ids.has(inner.pageId), inner.label)
  }
  // A page the map keeps in navigation is not a showcase page.
  for (const kept of map.kept ?? []) if (kept.pageId) assert.equal(ids.has(kept.pageId), false, kept.label)
})

// JA Kinetic wp7 takes its Blueprint and Signal links out of the header part (`templatePart.removeBlock`), custom links
// with no page id: the pages behind them are found by the address the removed list item carries.
test('WordPress: a link removed from a template part names its page by address, resolved against the site pages', () => {
  const map = showcaseNavMap(contract('tracy-wordpress-quickstart/contracts/ja-kinetic/wp7/1.0.12'))
  assert.ok(map)
  assert.ok(map.operations.every((op) => op.op === 'templatePart.removeBlock' && !op.block?.pageId))
  const pages = [
    { id: 1744, path: '/home-menu' },
    { id: 1748, path: '/home-menu/home-blueprint' },
    { id: 1749, path: '/home-menu/home-signal/' },
    { id: 1741, path: '/pricing' },
    { id: 1750, path: '/features' }
  ]
  assert.deepEqual([...showcasePageIds(map, pages)].sort(), [1748, 1749])
  // A page the map keeps in navigation is not a showcase page.
  for (const kept of map.kept ?? [])
    if (kept.pageId) assert.equal(showcasePageIds(map, pages).has(kept.pageId), false)
  // With no pages to resolve against, only ids the map names: none here.
  assert.deepEqual([...showcasePageIds(map)], [])
})

// A removed link names a page of this site only when it leads into the site: a relative link, or one on the release's
// placeholder host. A link to another site with the same path as a local page protects nothing.
test('WordPress: a removed template-part link to another host names none of the site pages', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'showcase-nav-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ quickstart: { placeholderUrl: 'https://quickstart.invalid' } })
  )
  const removed = (/** @type {string} */ href) => ({
    op: 'templatePart.removeBlock',
    block: { name: 'core/list-item', pageId: null, contains: `<a href="${href}">` }
  })
  writeFileSync(
    path.join(dir, 'showcase-nav-map.json'),
    JSON.stringify({
      status: 'checked',
      operations: [
        removed('https://external.example/pricing'),
        removed('//external.example/features'),
        removed('http://relative.invalid/contact'),
        removed('https://quickstart.invalid/about/'),
        removed('/team')
      ]
    })
  )
  const pages = [
    { id: 1, path: '/pricing' },
    { id: 2, path: '/features' },
    { id: 5, path: '/contact' },
    { id: 3, path: '/about' },
    { id: 4, path: '/team' }
  ]
  assert.deepEqual([...showcasePageIds(showcaseNavMap(dir), pages)].sort(), [3, 4])
})

test('a map that is missing or not checked names no showcase page', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'showcase-nav-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(showcaseNavMap(dir), null)
  assert.deepEqual([...showcasePageIds(showcaseNavMap(dir))], [])
  const other = mkdtempSync(path.join(tmpdir(), 'showcase-nav-'))
  t.after(() => rmSync(other, { recursive: true, force: true }))
  writeFileSync(
    path.join(other, 'showcase-nav-map.json'),
    JSON.stringify({
      status: 'draft',
      operations: [{ op: 'navigation.removeLink', link: { pageId: 9 }, contains: [] }]
    })
  )
  assert.equal(showcaseNavMap(other), null)
})

test('Joomla: the entries the showcase map puts away are named by their release ids, each a menu entry of the release', () => {
  const ids = navHiddenMenuIds(showcaseNavMap(JOOMLA))
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    [615, 616, 617, 648, 649, 650]
  )
  const { entities } = read(JOOMLA, 'presentation-lock.json')
  for (const id of ids) assert.ok(entities[`menuItem-${id}`], `menuItem-${id}`)
  assert.deepEqual([...navHiddenMenuIds(null)], [])
})

// 🔒 A PAGE'S ADDRESS WINS (product owner, after Sol review): Joomla routes an entry through its parents, so a parent that holds
// a showcase entry stays published even when the customer unticked it. JA Directory j6 1.0.3 ships that shape: "Features"
// (126, a heading) holds About Us (127) and the showcase's Shortcodes (174).
test('Joomla: an unticked parent that holds a showcase entry stays published and is said; its business child goes as before', async () => {
  const dir = contract('tracy-joomla-quickstart/contracts/ja-directory/j6/1.0.3')
  const { entities } = read(dir, 'presentation-lock.json')
  const rows = Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))
  const readRow = async (/** @type {number} */ id) => rows.find((r) => r.id === id) ?? null
  const pages = rows
    .filter((r) => r.menutype === 'mainmenu' && r.type === 'component' && Number(r.published) === 1)
    .map((r) => ({ id: String(r.path), label: r.title, ...(Number(r.home) === 1 ? { home: true } : {}) }))
  const unticked = new Set(['features/about-us', 'features/shortcodes'])
  const sitePages = { all: pages, picked: pages.map((p) => p.id).filter((id) => !unticked.has(id)) }
  const visible = new Set(['en-GB'])
  const before = await unpickedMenuItems(undefined, rows, visible, readRow, sitePages)
  for (const id of [126, 127, 174]) assert.ok(before.ids.includes(id), `without the map, ${id} goes`)

  const showcase = navHiddenMenuIds(showcaseNavMap(dir))
  assert.ok(showcase.has(174))
  const out = await unpickedMenuItems(undefined, rows, visible, readRow, sitePages, showcase)
  assert.ok(out.ids.includes(127), 'the unticked About Us goes as before')
  assert.equal(out.ids.includes(174), false, 'the showcase entry stays published')
  assert.equal(out.ids.includes(126), false, 'its parent stays, so /features/shortcodes keeps answering')
  assert.equal(out.ids.includes(160), false)
})

test('Joomla: a page the customer unticked that holds a showcase page below it, at any depth, stays and is named', async () => {
  const row = (id, path, parent) => ({
    id,
    menutype: 'mainmenu',
    title: path,
    alias: path.split('/').pop(),
    path,
    type: 'component',
    link: `index.php?option=com_content&view=article&id=${id}`,
    parent_id: parent,
    published: 1,
    language: '*',
    home: id === 101 ? 1 : 0
  })
  const rows = [
    row(101, 'home', 1),
    row(110, 'company', 1),
    row(111, 'company/team', 110),
    row(112, 'company/kit', 110),
    row(113, 'company/kit/typography', 112),
    row(120, 'news', 1)
  ]
  const readRow = async (/** @type {number} */ id) => rows.find((r) => r.id === id) ?? null
  const all = rows.map((r) => ({ id: r.path, label: r.title, ...(r.home ? { home: true } : {}) }))
  const sitePages = { all, picked: ['home'] }
  const out = await unpickedMenuItems(undefined, rows, new Set(['en-GB']), readRow, sitePages, new Set([113]))
  assert.deepEqual(
    out.ids.sort((a, b) => a - b),
    [111, 120],
    'the business pages go; the showcase page and both parents above it stay'
  )
  assert.match(out.note ?? '', /2 menu entry\(ies\) .*showcase.*company → company\/kit\/typography/)
})
