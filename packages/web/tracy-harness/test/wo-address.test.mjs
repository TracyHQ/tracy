// /ops/wo keeps every view in the address (`src/wo-address.ts`): a pasted link reopens the same screen.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseWoAddress, WO_PLACES_DEFAULT, WO_QUEUE_DEFAULT, woSearchFor } from '../src/wo-address.ts'

test('a bare /ops/wo is the Live Queue with every default, and writes nothing back', () => {
  const a = parseWoAddress('')
  assert.deepEqual(a, { view: 'queue', queue: WO_QUEUE_DEFAULT, places: WO_PLACES_DEFAULT })
  assert.equal(woSearchFor(a), '')
})

test('a full queue address round-trips', () => {
  const search =
    '?search=pho+ba&user=lee&city=Hanoi&cms=wordpress&range=7d&date=built&stage=3&sort=name&dir=asc&open=6a1f0000-0000-4000-8000-000000000001'
  const a = parseWoAddress(search)
  assert.deepEqual(a.queue, {
    search: 'pho ba',
    user: 'lee',
    city: 'Hanoi',
    cms: 'wordpress',
    range: '7d',
    date: 'built',
    stage: '3-researching',
    sort: 'name',
    dir: 'asc',
    open: '6a1f0000-0000-4000-8000-000000000001'
  })
  assert.equal(woSearchFor(a), search)
})

test('Research is a separate view and old Dubai anchors still open it', () => {
  const research = parseWoAddress('?view=research&user=lee&stage=3')
  assert.equal(research.view, 'research')
  assert.deepEqual(research.queue, WO_QUEUE_DEFAULT)
  assert.equal(woSearchFor(research), '?view=research')
  assert.equal(parseWoAddress('', '#dubai-pilot').view, 'research')
  assert.equal(parseWoAddress('?view=places', '#dubai-pilot').view, 'places')
})

test('customer journey filters round-trip without truncating their names', () => {
  for (const stage of ['research', 'demo', 'outreach', 'cancelled', 'attention']) {
    assert.equal(woSearchFor(parseWoAddress(`?stage=${stage}`)), `?stage=${stage}`)
  }
})

test('stage reads a digit, a full stage id or attention, and writes the short form', () => {
  assert.equal(parseWoAddress('?stage=7').queue.stage, '7-live')
  assert.equal(parseWoAddress('?stage=4-brief-ready').queue.stage, '4-brief-ready')
  assert.equal(parseWoAddress('?stage=attention').queue.stage, 'attention')
  assert.equal(woSearchFor(parseWoAddress('?stage=4-brief-ready')), '?stage=4')
})

test('a Places address round-trips: tab, search, opened place and the caps dialog', () => {
  const search = '?view=places&tab=merge&search=pho&place=6a1f0000-0000-4000-8000-000000000002&dialog=caps'
  const a = parseWoAddress(search)
  assert.equal(a.view, 'places')
  assert.deepEqual(a.places, {
    tab: 'merge',
    search: 'pho',
    place: '6a1f0000-0000-4000-8000-000000000002',
    dialog: 'caps'
  })
  assert.equal(woSearchFor(a), search)
})

test('each view reads and writes only its own section; Settings writes only view=settings', () => {
  const queue = parseWoAddress('?user=lee&stage=attention&open=abc&tab=stale&place=p1')
  assert.deepEqual(queue.places, WO_PLACES_DEFAULT)
  assert.equal(woSearchFor(queue), '?user=lee&stage=attention&open=abc')
  assert.equal(woSearchFor({ ...queue, view: 'settings' }), '?view=settings')
  // `search` on a Places address is the place search, never the queue's.
  const places = parseWoAddress('?view=places&search=pho&user=lee')
  assert.deepEqual(places.queue, WO_QUEUE_DEFAULT)
  assert.equal(places.places.search, 'pho')
  assert.equal(woSearchFor({ ...places, view: 'queue' }), '')
  assert.deepEqual(parseWoAddress('?view=settings&search=x&tab=merge').queue, WO_QUEUE_DEFAULT)
})

test('defaults are not written', () => {
  const a = parseWoAddress('?range=30d&date=updated&sort=time&dir=desc&cms=all&user=all')
  assert.equal(woSearchFor(a), '')
  assert.equal(woSearchFor(parseWoAddress('?view=places&tab=all')), '?view=places')
})

test('an invalid value drops only its own field', () => {
  const a = parseWoAddress(
    '?view=nope&range=1y&cms=drupal&stage=9&sort=evil&dir=up&user=lee&open=a%20b&date=x'
  )
  assert.equal(a.view, 'queue')
  assert.deepEqual(a.queue, { ...WO_QUEUE_DEFAULT, user: 'lee' })
  assert.equal(woSearchFor(a), '?user=lee')
  const p = parseWoAddress('?view=places&tab=gone&dialog=merge&place=../x')
  assert.deepEqual(p.places, WO_PLACES_DEFAULT)
})

test('blank or over-long text is dropped, surrounding spaces are trimmed', () => {
  assert.equal(parseWoAddress('?search=%20%20').queue.search, '')
  assert.equal(parseWoAddress(`?search=${'x'.repeat(201)}`).queue.search, '')
  assert.equal(parseWoAddress('?city=%20Da%20Nang%20').queue.city, 'Da Nang')
})

test('parameters this module does not own are kept', () => {
  const a = parseWoAddress('?utm=mail&user=lee')
  assert.equal(woSearchFor(a, '?utm=mail&user=lee'), '?utm=mail&user=lee')
  assert.equal(woSearchFor({ ...a, view: 'settings' }, '?utm=mail&user=lee'), '?utm=mail&view=settings')
})
