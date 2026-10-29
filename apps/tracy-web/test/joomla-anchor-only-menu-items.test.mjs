/**
 * Footer menu entries that are links to nothing (`type: 'url'`, link `#`) are relinked to the page of the same name or
 * unpublished (`anchorOnlyMenuItems`, `joomla-tidy.js`). Fixture modelled on the rows measured on accept-boxing-104.tracy.site
 * (JA Boxing).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { anchorOnlyMenuItems, anchorSteps } from '../src/sites/brief-engines/joomla-tidy.js'

const visible = new Set(['en-GB'])
let next = 100
const row = (fields) => ({
  id: next++,
  published: 1,
  type: 'component',
  link: 'index.php?option=com_content&view=article&id=1',
  parent_id: 1,
  level: 1,
  language: '*',
  home: 0,
  ...fields
})

/** The JA Boxing menus: a main menu with real pages and two footer menus of `#` entries. */
function boxing() {
  next = 100
  const main = [
    row({ id: 101, menutype: 'mainmenu', title: 'Home', alias: 'home', home: 1 }),
    row({ id: 102, menutype: 'mainmenu', title: 'About', alias: 'about-us' }),
    row({
      id: 103,
      menutype: 'mainmenu',
      title: 'About Us',
      alias: 'about-us-2',
      type: 'alias',
      link: 'index.php?Itemid='
    }),
    row({ id: 104, menutype: 'mainmenu', title: 'Our trainers', alias: 'our-trainers' }),
    row({ id: 105, menutype: 'mainmenu', title: 'Contact', alias: 'contact' }),
    row({ id: 106, menutype: 'mainmenu', title: 'Classes', alias: 'classes' }),
    row({ id: 107, menutype: 'mainmenu', title: 'Plans', alias: 'plans' })
  ]
  const hash = (id, menutype, title) =>
    row({ id, menutype, title, alias: title.toLowerCase().replace(/\W+/g, '-'), type: 'url', link: '#' })
  const footer = [
    hash(201, 'classes', 'Pound it'),
    hash(202, 'classes', 'Boxing Circuit'),
    hash(203, 'classes', 'Boxing Drills N Skills'),
    hash(204, 'classes', 'Beginners'),
    hash(205, 'classes', 'Try Free Intro'),
    hash(211, 'site-map', 'About'),
    hash(212, 'site-map', 'Class'),
    hash(213, 'site-map', 'Schedule'),
    hash(214, 'site-map', 'Price')
  ]
  return [...main, ...footer]
}

test('JA Boxing: About and Class are relinked, the rest of the dead footer entries are unpublished', () => {
  const answer = anchorOnlyMenuItems({ rows: boxing(), going: [], visible })
  assert.deepEqual(answer.relink, [
    { id: 211, link: 'index.php?Itemid=102', title: 'About' },
    { id: 212, link: 'index.php?Itemid=106', title: 'Classes' }
  ])
  assert.deepEqual([...answer.hide].sort(), [201, 202, 203, 204, 205, 213, 214])
})

test('anchorSteps writes the link of each relinked entry and names it after its page', () => {
  assert.deepEqual(anchorSteps([{ id: 212, link: 'index.php?Itemid=106', title: 'Classes' }]), [
    { kind: 'menuItem', id: 212, fields: { link: 'index.php?Itemid=106', title: 'Classes' } }
  ])
  assert.deepEqual(anchorSteps([{ id: 211, link: 'index.php?Itemid=102' }]), [
    { kind: 'menuItem', id: 211, fields: { link: 'index.php?Itemid=102' } }
  ])
})

test('a generic label ("Learn more", given to a demo label nobody named) names no page: the entry goes', () => {
  // A dental clinic's footer, where the writer left two demo class links as "Learn more" and a page of the main menu is
  // called "Learn more" too (measured 29/10/2026 on a local brief build: both footer links led to a page taken off).
  const rows = boxing().filter((r) => r.menutype === 'mainmenu')
  rows.push(row({ id: 120, menutype: 'mainmenu', title: 'Learn more', alias: 'featured-articles' }))
  rows.push(
    row({
      id: 221,
      menutype: 'classes',
      title: 'Learn more',
      alias: 'boxing-circuit',
      type: 'url',
      link: '#'
    })
  )
  rows.push(
    row({ id: 222, menutype: 'classes', title: 'Read more', alias: 'read-more', type: 'url', link: '' })
  )
  const answer = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.deepEqual(answer.relink, [])
  assert.deepEqual(answer.hide.sort(), [221, 222])
})

test('an entry going is never a target', () => {
  const answer = anchorOnlyMenuItems({ rows: boxing(), going: [106], visible })
  assert.ok(answer.hide.includes(212))
  assert.deepEqual(
    answer.relink.map((r) => r.id),
    [211]
  )
})

test('a target under an unpublished parent is not a target', () => {
  const rows = boxing().map((r) => (r.id === 106 ? { ...r, parent_id: 300 } : r))
  rows.push(row({ id: 300, menutype: 'mainmenu', title: 'Hidden branch', alias: 'hidden', published: 0 }))
  const answer = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.ok(answer.hide.includes(212))
})

test('a # heading that holds a live child is a dropdown and stays', () => {
  const rows = boxing()
  rows.push(row({ id: 301, menutype: 'classes', title: 'Child', alias: 'child', parent_id: 201 }))
  const answer = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.ok(!answer.hide.includes(201))
  assert.ok(!answer.relink.some((r) => r.id === 201))
})

test('a heading whose only child is going is a dead end like any other', () => {
  const rows = boxing()
  rows.push(row({ id: 301, menutype: 'classes', title: 'Child', alias: 'child', parent_id: 201 }))
  const answer = anchorOnlyMenuItems({ rows, going: [301], visible })
  assert.ok(answer.hide.includes(201))
})

test('only a bare # or an empty link counts; other links, other types and the main menu are left', () => {
  const rows = [
    ...boxing().slice(0, 7),
    row({ id: 401, menutype: 'site-map', title: 'Anchor', alias: 'anchor', type: 'url', link: '#contact' }),
    row({ id: 402, menutype: 'site-map', title: 'Empty', alias: 'empty', type: 'url', link: '' }),
    row({ id: 403, menutype: 'site-map', title: 'Blank', alias: 'blank', type: 'url', link: ' # ' }),
    row({
      id: 404,
      menutype: 'site-map',
      title: 'Web',
      alias: 'web',
      type: 'url',
      link: 'https://example.com'
    }),
    row({ id: 405, menutype: 'mainmenu', title: 'Top', alias: 'top', type: 'url', link: '#' }),
    row({ id: 406, menutype: 'site-map', title: 'Off', alias: 'off', type: 'url', link: '#', published: 0 }),
    row({ id: 407, menutype: 'site-map', title: 'Heading', alias: 'heading', type: 'heading', link: '' })
  ]
  const answer = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.deepEqual([...answer.hide].sort(), [402, 403])
  assert.deepEqual(answer.relink, [])
})

test('matching ignores case, stopwords and plurals, and uses alias or title of both sides', () => {
  const rows = [
    row({ id: 1001, menutype: 'mainmenu', title: 'Our Trainers', alias: 'team' }),
    row({ id: 1002, menutype: 'mainmenu', title: 'Get in touch', alias: 'contact-us' }),
    row({ id: 1003, menutype: 'mainmenu', title: 'Courses', alias: 'courses' }),
    row({ id: 1010, menutype: 'foot', title: 'Trainer', alias: 'trainer', type: 'url', link: '#' }),
    row({ id: 1011, menutype: 'foot', title: 'Contact', alias: 'contact', type: 'url', link: '#' }),
    row({ id: 1012, menutype: 'foot', title: 'Course', alias: 'course', type: 'url', link: '#' }),
    row({ id: 1013, menutype: 'foot', title: 'Team', alias: 'x', type: 'url', link: '#' })
  ]
  const answer = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.deepEqual(answer.relink, [
    { id: 1010, link: 'index.php?Itemid=1001', title: 'Our Trainers' },
    { id: 1011, link: 'index.php?Itemid=1002', title: 'Get in touch' },
    { id: 1012, link: 'index.php?Itemid=1003', title: 'Courses' },
    { id: 1013, link: 'index.php?Itemid=1001', title: 'Our Trainers' }
  ])
  assert.deepEqual(answer.hide, [])
})

test('several matches: main menu first, then a page over an alias, then the shallowest, then the lowest id', () => {
  const rows = [
    row({ id: 501, menutype: 'other', title: 'Shop', alias: 'shop' }),
    row({ id: 502, menutype: 'mainmenu', title: 'Shop', alias: 'shop-2', level: 2, parent_id: 503 }),
    row({ id: 503, menutype: 'mainmenu', title: 'Pages', alias: 'pages' }),
    row({ id: 504, menutype: 'mainmenu', title: 'Shop', alias: 'shop-3', type: 'alias' }),
    row({ id: 510, menutype: 'foot', title: 'Shop', alias: 'shop', type: 'url', link: '#' })
  ]
  assert.deepEqual(anchorOnlyMenuItems({ rows, going: [], visible }).relink, [
    { id: 510, link: 'index.php?Itemid=502', title: 'Shop' }
  ])
  // The same without the nested page: the page in the main menu over its alias.
  const flat = rows.filter((r) => r.id !== 502)
  assert.deepEqual(anchorOnlyMenuItems({ rows: flat, going: [], visible }).relink, [
    { id: 510, link: 'index.php?Itemid=504', title: 'Shop' }
  ])
})

test('multilingual: a copy matches only a page of its own language or *', () => {
  const rows = [
    row({ id: 601, menutype: 'mainmenu', title: 'Classes', alias: 'classes', language: 'en-GB' }),
    row({ id: 602, menutype: 'mainmenu-vi', title: 'Classes', alias: 'classes', language: 'vi-VN' }),
    row({
      id: 610,
      menutype: 'foot-vi',
      title: 'Classes',
      alias: 'classes',
      language: 'vi-VN',
      type: 'url',
      link: '#'
    }),
    row({
      id: 611,
      menutype: 'foot',
      title: 'Classes',
      alias: 'classes',
      language: 'en-GB',
      type: 'url',
      link: '#'
    })
  ]
  const both = anchorOnlyMenuItems({ rows, going: [], visible: new Set(['en-GB', 'vi-VN']) })
  assert.deepEqual(both.relink, [
    { id: 610, link: 'index.php?Itemid=602', title: 'Classes' },
    { id: 611, link: 'index.php?Itemid=601', title: 'Classes' }
  ])
  const onlyEnglish = anchorOnlyMenuItems({ rows, going: [], visible })
  assert.deepEqual(
    onlyEnglish.relink.map((r) => r.id),
    [611]
  )
})

test('rows that are not a list never throw', () => {
  assert.deepEqual(anchorOnlyMenuItems({ rows: null, going: [], visible }), { relink: [], hide: [] })
})
