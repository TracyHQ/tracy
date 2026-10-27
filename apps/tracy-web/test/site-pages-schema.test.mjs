/**
 * `tracy_site_pages.json` (`src/lib/site-pages-schema.mjs`): the list of pages a template ships,
 * which the Pages question offers and the engines hide by id. One validator, read by the release
 * reader, the local pack reader and the `design-templates` gate.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SITE_PAGES_FILE, validateSitePages } from '../src/lib/site-pages-schema.mjs'

const good = () => ({
  pages: [
    { id: 'home-3', label: 'Home', home: true },
    { id: 'about', label: 'About us' },
    { id: 'contact', label: 'Contact' }
  ]
})

test('the asset name is the one the release tools attach', () => {
  assert.equal(SITE_PAGES_FILE, 'tracy_site_pages.json')
})

test('a list with exactly one home, unique ids and labels is clean', () => {
  assert.deepEqual(validateSitePages(good()), [])
})

test('no home, or two, is refused', () => {
  const none = good()
  delete none.pages[0].home
  assert.match(validateSitePages(none).join('\n'), /home/)
  const two = good()
  two.pages[1].home = true
  assert.match(validateSitePages(two).join('\n'), /home/)
})

test('a repeated id is refused, naming it', () => {
  const doc = good()
  doc.pages[2].id = 'about'
  assert.match(validateSitePages(doc).join('\n'), /about/)
})

test('an empty label or id is refused', () => {
  const doc = good()
  doc.pages[1].label = '  '
  doc.pages[2].id = ''
  assert.equal(validateSitePages(doc).length, 2)
})

test('home may only be true, and a page carries no other field', () => {
  const doc = good()
  doc.pages[1].home = false
  doc.pages[2].slug = 'contact'
  assert.equal(validateSitePages(doc).length, 2)
})

test('anything but { pages: [ … ] } is refused, not thrown on', () => {
  for (const doc of [
    null,
    [],
    'pages',
    {},
    { pages: [] },
    { pages: [null] },
    { pages: good().pages, extra: 1 }
  ])
    assert.ok(validateSitePages(doc).length > 0, JSON.stringify(doc))
})
