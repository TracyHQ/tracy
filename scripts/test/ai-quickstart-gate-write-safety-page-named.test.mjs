// What a finding judged on a page names when its place is stored at many locations (ticket #586, review 7 N1), on the
// stored locations of an invented yoga studio. The studio name is stored in a menu item's page title (printed only in
// the browser title, never in the body a judge reads) and in a module of the home page. A page that is neither judges
// the name run as code: the gate cannot tell which of the two locations printed it, so it names none of them, and
// records the judging page and how many locations the place has. A place stored at one location keeps that location,
// and a location of the judging page is still named.
import assert from 'node:assert/strict'
import test from 'node:test'
import { nameOf, storedFor } from '../ai-quickstart/gate/write-safety-places.mjs'

const order = { pages: [{ id: 'home', blocks: [{ id: 'home-b2', block: 'block-9' }] }] }
const STUDIO = [
  {
    op: 'menuItem:mainmenu:home',
    entry: 'seo:home.title',
    loc: { entity: 'menuItem:mainmenu:home', column: 'params', jsonPath: ['page_title'] },
    value: 'QxAAB'
  },
  {
    op: 'contract:store:module-9',
    entry: 'home.home-b2.heading',
    loc: { entity: 'module-9', column: 'content', slot: 'module-9.0' },
    value: 'QxAAB'
  }
]

test('N1: a page finding whose locations are none of the judging page names no location', () => {
  const stored = storedFor(STUDIO, { judgedOn: 'schedule' })
  const named = nameOf(stored, order)
  assert.equal(named.page, 'schedule', 'the judging page')
  assert.equal(named.block, null)
  assert.equal(named.field, null, 'no field is guessed')
  assert.equal(named.location, null, 'no stored location is asserted')
  assert.equal(named.storedAt, 2, 'the number of locations the place has')
})

test('N1: a location of the judging page is named, and the only location of a place is kept', () => {
  const onHome = nameOf(storedFor(STUDIO, { judgedOn: 'home' }), order)
  assert.equal(onHome.block, 'home-b2')
  assert.equal(onHome.field, 'heading')
  assert.equal(onHome.location.slot, 'module-9.0')
  assert.equal(onHome.storedAt, undefined)
  const only = nameOf(storedFor(STUDIO.slice(1), { judgedOn: 'schedule' }), order)
  assert.equal(only.location.slot, 'module-9.0', 'one location: the page printed it from there')
})

test('N1: a site stop is still named at the operation it reports', () => {
  const stop = nameOf(storedFor(STUDIO, { op: 'menuItem:mainmenu:home' }), order)
  assert.equal(stop.location.op, 'menuItem:mainmenu:home')
  assert.equal(stop.page, 'seo:home')
})
