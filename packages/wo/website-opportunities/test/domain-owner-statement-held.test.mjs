// No held text reaches the business reading's model, in any form or any passage (decision D46, #609): a held person
// written across a line break, a sentence end, with or without accents, in full width letters or with a zero width
// character inside; the held business name in the header and in the bio, posts, reviews and website pages of both
// calls; and the stand-in never reaches copy. Invented pottery studio and people; a scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-held.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldNamesIn } from '../domain/held-reviews.mjs'
import { ownerPassageOf } from '../domain/owner-statement.mjs'
import { HELD_NAME_STAND_IN } from '../domain/reading-held-passages.mjs'
import { ownerStatementRecordOf, readBusiness, readingInputOf } from '../src/business-reading.js'

const PERSON = 'Brannoch Vey'
const passage = (statement, held = [PERSON]) => ownerPassageOf(statement, held).passage?.text ?? null

test('a held person split across a line or a sentence end takes out every sentence it touches', () => {
  assert.equal(
    passage('We fire on Fridays. Our teacher is Brannoch\nVey and she leads raku. Book online.'),
    'We fire on Fridays. Book online.'
  )
  assert.equal(passage('Ask for Brannoch. Vey runs raku. We fire on Fridays.'), 'We fire on Fridays.')
  assert.equal(passage('Our teacher Brannoch  Vey leads raku. We fire on Fridays.'), 'We fire on Fridays.')
})

test('accents either way, decomposed letters, full width letters and zero width characters are all found', () => {
  const forms = [
    ['Zoë Marlow', 'Zoe Marlow teaches on Fridays. We fire twice a week.'],
    ['Zoe Marlow', 'Zoë Marlow teaches on Fridays. We fire twice a week.'],
    ['Zoë Marlow', 'Zoë Marlow teaches on Fridays. We fire twice a week.'],
    [PERSON, 'Our teacher Ｂｒａｎｎｏｃｈ Ｖｅｙ leads raku. We fire twice a week.'],
    [PERSON, 'Our teacher Bran‍noch Vey leads raku. We fire twice a week.'],
    [PERSON, 'Our teacher Bran​noch Vey leads raku. We fire twice a week.']
  ]
  for (const [held, statement] of forms)
    assert.equal(passage(statement, [held]), 'We fire twice a week.', statement)
  // Near misses: another name, or a one word name inside a longer word, stays.
  assert.equal(passage('Brannock Veyle leads raku.'), 'Brannock Veyle leads raku.')
  assert.equal(passage('We sell banana mugs.', ['Ana']), 'We sell banana mugs.')
  // The shared matcher of the brief's held reviews finds the same forms.
  assert.deepEqual(heldNamesIn('Thanks to Zoë\nMarlow!', ['Zoë Marlow']), ['Zoë Marlow'])
  assert.deepEqual(heldNamesIn('Thanks to Zoe Marlow!', ['Zoë Marlow']), ['Zoë Marlow'])
  assert.deepEqual(heldNamesIn('Thanks to Zoey Marlowe!', ['Zoë Marlow']), [])
})

const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/x', key: 'k', model: 'fake', effort: 'off' }
}
const STUDIO = 'Corvane Clay Studio'

/** Read with a scripted model answering `answer` to every call; returns the reading and every request body. */
async function readWith(input, answer = {}) {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
  }
  const reading = await readBusiness({
    ...input,
    door: DOOR,
    charge: (_s, call) => call(),
    fetchImpl,
    log: { warn() {} }
  })
  return { reading, bodies }
}

const held = () =>
  readingInputOf({
    profile: {
      name: STUDIO,
      bio: 'Corvane Clay Studio: pottery classes in Velmora.\nBrannoch Vey teaches raku.'
    },
    google: {
      name: STUDIO,
      reviews: [
        {
          author: 'Reviewer Q',
          text: 'Corvane Clay Studio is calm. The same teacher stays for the whole course.'
        },
        { author: 'Brannoch Vey', text: 'Proud of my students.' },
        { author: 'Reviewer R', text: 'Lovely class. Brannoch\nVey explained every step.' }
      ]
    },
    collected: [
      {
        source: 'instagram',
        collected: {
          posts: [{ id: 'c1', caption: 'Kiln day at corvane-clay-studio! Join our glazing workshops.' }]
        }
      },
      {
        source: 'website',
        collected: {
          pages: [
            {
              url: 'https://studio.example.test/about',
              text: 'About Corvane Clay Studio. Zoë Marlow founded it.'
            }
          ]
        }
      }
    ],
    ownerStatement: 'Corvane Clay Studio opened in 2009. We fire twice a week.',
    withheld: { name: true, people: [PERSON, 'Zoe Marlow'] }
  })

test('with the name and people held, neither call sends a held text, and the header names the stand-in', async () => {
  const { bodies, reading } = await readWith(held())
  assert.equal(bodies.length, 2)
  for (const body of bodies) {
    const user = body.messages[1].content
    assert.match(user, /^Business: "\[business-name-held\]"/)
    assert.doesNotMatch(JSON.stringify(body), /corvane|brannoch|marlow/i)
  }
  const main = bodies[0].messages[1].content
  assert.match(main, /\[business-name-held\]: pottery classes in Velmora/)
  assert.match(main, /Kiln day at \[business-name-held\]! Join our glazing workshops/)
  assert.match(main, /The same teacher stays for the whole course/)
  assert.doesNotMatch(main, /Proud of my students|explained every step/)
  assert.match(main, /We fire twice a week/)
  assert.equal(reading.ownerStatement.heldOut, 1)
})

test('copy that writes the stand-in never stands, so it never reaches the site as a name', async () => {
  const answer = {
    services: [{ name: 'Glazing workshops', quote: 'Join our glazing workshops', ref: 'post:instagram:c1' }],
    uspThemes: [
      {
        label: 'same teacher all course',
        line: 'the same teacher at [business-name-held] all course',
        accent: '',
        who: '',
        quotes: [{ quote: 'The same teacher stays for the whole course', ref: 'review:1' }]
      }
    ],
    story: [
      {
        text: '[business-name-held] pottery classes',
        quote: '[business-name-held]: pottery classes',
        ref: 'bio'
      }
    ]
  }
  const { reading } = await readWith(held(), answer)
  assert.deepEqual(
    reading.services.map((s) => s.label),
    ['Glazing workshops']
  )
  assert.deepEqual(reading.story, [])
  assert.equal(reading.uspThemes, null)
  assert.ok(reading.standInDropped.some((d) => d.group === 'uspThemes'))
  assert.doesNotMatch(JSON.stringify(reading), /business-name-held\] all course|corvane/i)
  assert.equal(HELD_NAME_STAND_IN, '[business-name-held]')
})

test('nothing held: no held keys in the input, the passages as they were', () => {
  const input = readingInputOf({
    profile: { name: STUDIO, bio: 'Corvane Clay Studio: pottery' },
    google: null,
    collected: []
  })
  assert.equal('heldTexts' in input, false)
  assert.equal('nameHeld' in input, false)
})

test('a statement that is the only text and wholly held: no reading, and the record says it was held', async () => {
  const input = { ownerStatement: 'Brannoch Vey leads raku nights.', heldTexts: [PERSON] }
  const { reading, bodies } = await readWith(input)
  assert.equal(reading, null)
  assert.equal(bodies.length, 0)
  assert.deepEqual(ownerStatementRecordOf(input.ownerStatement, input.heldTexts), {
    ownerStatement: { read: false, reason: 'held' }
  })
  assert.deepEqual(ownerStatementRecordOf('   ', [PERSON]), {})
})
