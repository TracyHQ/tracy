// What became of each link the owner gave the build chat's research (#609, `link-reads.js`): one line per link, its
// state and plain counts. Invented business, invented links.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { engineStateOf } from '../src/build-draft/engine-state.js'
import { linkChoiceOf, linkOf, linkReadsFrom, linkStatesOf } from '../src/build-draft/link-reads.js'
import { SET_ASIDE } from '../src/build-draft/gather-links.js'

const INSTAGRAM = 'https://www.instagram.com/hollowmere.bakery.example/'
const LISTING = 'https://www.yelp.com/biz/hollowmere-bakery-example'
const MAPS = 'https://www.google.com/maps/place/Hollowmere+Bakery+Example'

const pictures = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))

const research = {
  links: [INSTAGRAM, LISTING, MAPS],
  rows: [
    { source: 'instagram', status: 'complete', coverage: { fetched: 20 } },
    { source: 'listing', status: 'complete', coverage: { fetched: 1 } }
  ],
  sources: [
    {
      id: 'instagram',
      origin: 'social',
      fields: { 'business.name': 'Hollowmere Bakery', 'contact.phone': '+1 555 0142 318' },
      text: Array.from({ length: 16 }, (_, i) => `Line ${i}`).join('\n'),
      pictures: pictures(12)
    },
    {
      id: 'listing',
      origin: 'listing',
      fields: {
        'business.name': 'Hollowmere Bakery',
        'contact.address': '12 Example Lane',
        'contact.phone': '+1 555 0142 318'
      }
    }
  ],
  setAside: [{ link: MAPS, reason: 'Google did not answer for this place' }]
}

test('each link is named by what it is', () => {
  assert.equal(linkOf(INSTAGRAM).name, 'Instagram')
  assert.equal(linkOf(MAPS).name, 'Google Maps')
  assert.equal(linkOf(LISTING).name, 'yelp.com')
  assert.equal(linkOf('https://www.hollowmere.example/menu').name, 'hollowmere.example')
})

test('three links give three lines with the right states and counts', () => {
  const lines = linkReadsFrom(research)
  assert.deepEqual(
    lines.map(({ link: _link, ...rest }) => rest),
    [
      { name: 'Instagram', state: 'read', facts: 18, pictures: 12 },
      { name: 'yelp.com', state: 'read', facts: 3, pictures: 0 },
      { name: 'Google Maps', state: 'failed', reason: 'Google did not answer for this place' }
    ]
  )
})

test('a source row that read nothing is a link that could not be read', () => {
  const [line] = linkReadsFrom({
    links: [INSTAGRAM],
    rows: [{ source: 'instagram', status: 'failed', reason: 'HTTP_429', coverage: { fetched: 0 } }]
  })
  assert.equal(line.state, 'failed')
  // Said in plain words for its reason, never the row's reason code (#575).
  assert.equal(line.reason, SET_ASIDE.HTTP_429)
  assert.ok(!line.reason.includes('HTTP'), 'never the row reason code')
})

test('pictures all set aside are counted on their link, a missing store is said as not kept', () => {
  const lost = [1, 2, 3].map((i) => ({
    url: `https://cdn.social.example/hollowmere/${i}.jpg`,
    source: 'instagram',
    reason: 'the picture could not be downloaded'
  }))
  const [line] = linkReadsFrom({
    ...research,
    links: [INSTAGRAM],
    sources: [{ id: 'instagram', fields: {} }],
    picturesSetAside: lost
  })
  assert.equal(line.pictures, 0)
  assert.equal(line.picturesLost, 3)
  assert.equal(line.picturesNotKept, undefined)
  const [kept] = linkReadsFrom({
    links: [INSTAGRAM],
    picturesSetAside: lost.map((p) => ({ ...p, reason: 'this server has no store to keep pictures in' }))
  })
  assert.equal(kept.picturesNotKept, true)
})

test('a link read with nothing found says zero facts and zero pictures', () => {
  const [line] = linkReadsFrom({ links: [INSTAGRAM], rows: [], sources: [] })
  assert.deepEqual([line.state, line.facts, line.pictures], ['read', 0, 0])
})

test('while research runs each link reads, the place question marks the Google link', () => {
  assert.deepEqual(
    linkStatesOf([INSTAGRAM, MAPS]).map((l) => l.state),
    ['reading', 'reading']
  )
  assert.deepEqual(
    linkChoiceOf([INSTAGRAM, MAPS]).map((l) => l.state),
    ['reading', 'choice']
  )
})

test('the engine state door carries the reading lines while research runs', () => {
  const state = engineStateOf({
    engine: { step: 'research', state: 'running', inputs: { links: [INSTAGRAM, MAPS] } }
  })
  assert.deepEqual(
    state.links.map((l) => [l.name, l.state]),
    [
      ['Instagram', 'reading'],
      ['Google Maps', 'reading']
    ]
  )
  const compose = engineStateOf({ engine: { step: 'compose', state: 'running', inputs: {} } })
  assert.deepEqual(compose, { step: 'compose', state: 'running' }, 'only research names links')
})

test('no reason a line can carry names a provider or shows a code', async () => {
  const { SET_ASIDE } = await import('../src/build-draft/gather-links.js')
  const { UNREAD_REASON } = await import('../src/build-draft/link-reads.js')
  for (const reason of [...Object.values(SET_ASIDE), UNREAD_REASON])
    assert.doesNotMatch(
      reason,
      /apify|scrapecreators|serpapi|outscraper|HTTP_|\b[45]\d\d\b|[A-Z]{3,}_[A-Z]{2,}/i
    )
})

test('pictures research set aside still count as found on their link, apart from the usable ones', () => {
  const google = { id: 'google', origin: 'google', fields: { 'contact.phone': '+1 555 0142 318' } }
  const aside = (n, source, notOwn) =>
    Array.from({ length: n }, (_, i) => ({
      what: 'picture',
      id: `${source}-${i}`,
      source,
      kind: 'image',
      notOwn
    }))
  const lines = linkReadsFrom({
    links: [INSTAGRAM, MAPS],
    rows: [
      { source: 'instagram', status: 'complete' },
      { source: 'google-places', status: 'complete' }
    ],
    sources: [{ ...research.sources[0], pictures: pictures(10) }, google],
    picturesNotUsed: [...aside(9, 'google-places', true), ...aside(11, 'instagram', false)]
  })
  assert.deepEqual(
    lines.map(({ name, pictures: usable, picturesFound, picturesNotOwn }) => [
      name,
      usable,
      picturesFound,
      picturesNotOwn
    ]),
    [
      ['Instagram', 10, 21, undefined],
      ['Google Maps', 0, 9, true]
    ]
  )
})
