// Key messages (#1791): the two or three points a site leads with, proposed by the business-reading call and kept only
// where every quote stands in its text and every word of the label is a word of its quotes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkBusinessReading,
  checkKeyMessages,
  readingCardOf,
  readingSourcesOf,
  withKeyMessagePicks
} from '../domain/business-reading.mjs'

const sources = readingSourcesOf({
  bio: 'European Coaching in Dubai\n🎾 Tennis & Padel\n🏊 Swimming Lessons\nLocations across Dubai',
  posts: [
    {
      source: 'instagram',
      id: '1',
      caption: 'Lessons for all ages and levels, kids welcome. DM for lessons!'
    },
    { source: 'instagram', id: '2', caption: 'Summer camp for kids starts Monday.' }
  ],
  reviews: [
    { author: 'Ana', text: 'Very patient coaches, my kids love it.' },
    { author: 'Bo', text: 'Patient coaches and great courts.' }
  ]
})
const byRef = new Map(sources.map((s) => [s.ref, s]))
const q = (quote, ref) => ({ quote, ref })

test('a key message stands on its quotes: every quote in its text, every label word in a quote', () => {
  const { kept, dropped } = checkKeyMessages(
    [
      { label: 'European coaching', quotes: [q('European Coaching in Dubai', 'bio')] },
      {
        label: 'All ages and levels',
        quotes: [q('for all ages and levels', 'post:instagram:1'), q('kids welcome', 'post:instagram:1')]
      },
      { label: 'Locations across Dubai', quotes: [q('Locations across Dubai', 'bio')] }
    ],
    byRef
  )
  assert.equal(dropped, 0)
  assert.deepEqual(
    kept.map((m) => [m.label, m.quotes.map((x) => x.source.ref)]),
    [
      ['European coaching', ['bio']],
      ['All ages and levels', ['post:instagram:1', 'post:instagram:1']],
      ['Locations across Dubai', ['bio']]
    ]
  )
  assert.match(kept[0].id, /^ke_/)
  // The id is stable: the same pick read again names the same message.
  assert.equal(
    checkKeyMessages(
      [{ label: 'European coaching', quotes: [q('European Coaching in Dubai', 'bio')] }],
      byRef
    ).kept[0].id,
    kept[0].id
  )
})

test('a quote not in its text, a label word no quote holds, a number, or one review alone drops the message', () => {
  const { kept, dropped } = checkKeyMessages(
    [
      { label: 'Private tennis lessons', quotes: [q('private tennis lessons', 'bio')] },
      { label: 'Best coaches in Dubai', quotes: [q('European Coaching in Dubai', 'bio')] },
      { label: '5 star coaching', quotes: [q('European Coaching in Dubai', 'bio')] },
      { label: 'Patient coaches', quotes: [q('Very patient coaches', 'review:1')] },
      { label: 'No quotes', quotes: [] }
    ],
    byRef
  )
  assert.deepEqual(kept, [])
  assert.equal(dropped, 5)
  // Counter-case: two different reviews saying it make a point.
  const two = checkKeyMessages(
    [
      {
        label: 'Patient coaches',
        quotes: [q('Very patient coaches', 'review:1'), q('Patient coaches', 'review:2')]
      }
    ],
    byRef
  )
  assert.deepEqual(
    two.kept.map((m) => m.label),
    ['Patient coaches']
  )
})

test('at most three messages are kept, and the reading carries them; rules alone propose none', () => {
  const answer = {
    keyMessages: [
      { label: 'European coaching', quotes: [q('European Coaching in Dubai', 'bio')] },
      { label: 'Tennis & Padel', quotes: [q('Tennis & Padel', 'bio')] },
      { label: 'Swimming lessons', quotes: [q('Swimming Lessons', 'bio')] },
      { label: 'Summer camp', quotes: [q('Summer camp for kids', 'post:instagram:2')] }
    ]
  }
  const reading = checkBusinessReading(JSON.stringify(answer), sources, { trade: 'fitness' })
  assert.equal(reading.keyMessages.length, 3)
  assert.equal(reading.dropped, 1)
})

test('the owner removes, reorders and relabels a message; a pick naming no message is inert', () => {
  const { kept } = checkKeyMessages(
    [
      { label: 'European coaching', quotes: [q('European Coaching in Dubai', 'bio')] },
      { label: 'Swimming lessons', quotes: [q('Swimming Lessons', 'bio')] },
      { label: 'Locations across Dubai', quotes: [q('Locations across Dubai', 'bio')] }
    ],
    byRef
  )
  const [a, b, c] = kept.map((m) => m.id)
  const picks = { removed: [b], order: [c, 'gone'], labels: { [a]: 'Coaches from Europe' } }
  assert.deepEqual(
    withKeyMessagePicks(kept, picks).map((m) => [m.label, m.edited === true]),
    [
      ['Locations across Dubai', false],
      ['Coaches from Europe', true]
    ]
  )
  const card = readingCardOf({ method: 'model', services: [], team: [], keyMessages: kept }, null, picks)
  assert.deepEqual(
    card.keyMessages.map((m) => [m.id, m.removed]),
    [
      [c, false],
      [a, false],
      [b, true]
    ]
  )
})
