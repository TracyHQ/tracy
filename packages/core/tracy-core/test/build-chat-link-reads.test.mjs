// The lines of the build chat that say what became of each link the owner gave (#609). Invented links and counts.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildToolRowOf,
  LINK_FOUND_STRINGS,
  LINK_READ_STRINGS,
  linkLineOf,
  linkNameOf,
  linkReadsOf
} from '../src/build-chat/index.mjs'

/** @type {(key: string, vars?: Record<string, string | number>) => string} */
const english = (key, vars = {}) =>
  ({ ...LINK_READ_STRINGS, ...LINK_FOUND_STRINGS })[key].replace(/\{(\w+)\}/g, (_, name) =>
    String(vars[name] ?? '')
  )

const INSTAGRAM = 'https://www.instagram.com/hollowmere.bakery.example/'
const LISTING = 'https://www.yelp.com/biz/hollowmere-bakery-example'
const MAPS = 'https://www.google.com/maps/place/Hollowmere+Bakery+Example'

/** What tracy-web answers for three links: one read with pictures, a listing with no pictures, a map not read. */
const ANSWER = [
  { link: INSTAGRAM, name: 'Instagram', state: 'read', facts: 18, pictures: 12 },
  { link: LISTING, name: 'yelp.com', state: 'read', facts: 3, pictures: 0 },
  { link: MAPS, name: 'Google Maps', state: 'failed', reason: 'Google did not answer for this place' }
]

/** Words a line must never show: provider names and error codes. */
const NEVER = /apify|scrapecreators|serpapi|outscraper|HTTP_|\b[45]\d\d\b|[A-Z]{3,}_[A-Z]{2,}/i

test('three links give three lines with the right states and counts', () => {
  const lines = linkReadsOf(ANSWER).map((l) => linkLineOf(l, english))
  assert.deepEqual(lines, [
    'Instagram: read. 18 facts, 12 pictures',
    'yelp.com: read. 3 facts. No pictures',
    'Google Maps: could not be read (Google did not answer for this place)'
  ])
  for (const line of lines) {
    assert.doesNotMatch(line, NEVER)
    // No en or em dash either (code points, so this file holds none).
    assert.ok(![0x2013, 0x2014].some((c) => line.includes(String.fromCharCode(c))), line)
  }
})

test('pictures all set aside for a failed download say so, a link with nothing says so', () => {
  const [lost, nothing, notKept, some] = linkReadsOf([
    { name: 'Instagram', state: 'read', facts: 18, pictures: 0, picturesLost: 12 },
    { name: 'hollowmere.example', state: 'read', facts: 0, pictures: 0 },
    { name: 'Facebook', state: 'read', facts: 0, pictures: 0, picturesLost: 4, picturesNotKept: true },
    { name: 'Facebook', state: 'read', facts: 1, pictures: 2, picturesLost: 3 }
  ]).map((l) => linkLineOf(l, english))
  assert.equal(lost, 'Instagram: read, but its pictures could not be downloaded. 18 facts')
  assert.equal(nothing, 'hollowmere.example: read, but nothing about the business was found')
  assert.equal(notKept, 'Facebook: read, but its pictures could not be kept')
  assert.equal(some, 'Facebook: read. 1 fact, 2 pictures. 3 more could not be downloaded')
})

test('while research runs, each link of the call reads; the place question needs a choice', () => {
  const row = buildToolRowOf(JSON.stringify({ action: 'research', links: [INSTAGRAM, MAPS] }), null)
  assert.deepEqual(row?.kind === 'working' && row.links.map((l) => linkLineOf(l, english)), [
    'Instagram: reading',
    'Google Maps: reading'
  ])
  const asking = buildToolRowOf(
    JSON.stringify({ action: 'research', links: [INSTAGRAM, MAPS] }),
    JSON.stringify({
      ask: { questions: [] },
      links: [
        { name: 'Instagram', state: 'reading' },
        { name: 'Google Maps', state: 'choice' }
      ]
    })
  )
  // Nothing is read yet: a waiting row, never "Read 2 sources".
  assert.deepEqual(asking?.kind === 'waiting' && asking.links.map((l) => linkLineOf(l, english)), [
    'Instagram: reading',
    'Google Maps: needs your choice'
  ])
})

test('a link that found pictures says how many it found and how many the site may use', () => {
  const lines = linkReadsOf([
    { name: 'Google Maps', state: 'read', facts: 6, pictures: 0, picturesFound: 9, picturesNotOwn: true },
    { name: 'Instagram', state: 'read', facts: 4, pictures: 10, picturesFound: 21 },
    { name: 'hollowmere.example', state: 'read', facts: 0, pictures: 0, picturesFound: 1 },
    { name: 'Facebook', state: 'read', facts: 2, pictures: 3, picturesFound: 3 }
  ]).map((l) => linkLineOf(l, english))
  assert.deepEqual(lines, [
    'Google Maps: read. 6 facts. 9 pictures found, none posted by the business',
    'Instagram: read. 4 facts, 21 pictures found, 10 usable',
    'hollowmere.example: read. 1 picture found, not usable',
    'Facebook: read. 2 facts, 3 pictures'
  ])
})

test('the done research row carries the lines of the answer', () => {
  const row = buildToolRowOf(
    JSON.stringify({ action: 'research', links: [INSTAGRAM, LISTING, MAPS] }),
    JSON.stringify({ profile: { business: 'Hollowmere Bakery' }, links: ANSWER })
  )
  assert.equal(row?.kind === 'research' && row.links.length, 3)
})

test('a line of unknown shape is dropped, never shown raw', () => {
  assert.deepEqual(linkReadsOf([{ name: 'X', state: 'exploded' }, 'text', null, { state: 'read' }]), [])
  assert.equal(linkNameOf('https://maps.app.goo.gl/InventedPlace1'), 'Google Maps')
  assert.equal(linkNameOf('https://m.facebook.com/hollowmere.example'), 'Facebook')
  assert.equal(linkNameOf('https://www.hollowmere.example/menu'), 'hollowmere.example')
})

test('a link read while research still runs says read, never that it gave nothing (#575)', () => {
  const [line] = linkReadsOf([{ name: 'Instagram', state: 'read' }])
  assert.deepEqual(line, { name: 'Instagram', state: 'read' })
  assert.equal(linkLineOf(line, english), english('links.read', { name: 'Instagram' }))
  assert.notEqual(linkLineOf(line, english), english('links.readNothing', { name: 'Instagram' }))
})
