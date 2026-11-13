// No copy of the business reading repeats the owner's chat statement (decision D46, #609): services, key messages, USP
// themes (label, line, who), the brief's view of a stored reading, the rules reading and the About line. Invented
// pottery studio and the fictional Harbour Sport Club fixture; scripted answers, no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-echo.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import {
  RULES_SKIP_OWNER,
  checkBusinessReading,
  readBusinessByRules,
  readingSourcesOf
} from '../domain/business-reading.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { makeSiteBrief } from '../src/brief-research.js'
import { RESEARCH } from './fixtures/owner-statement/research.mjs'

const STATEMENT =
  'Every junior gets a free racket fitting before the first lesson. Since the start the same teacher guides you ' +
  'from your first pot to the kiln firing. We teach Pilates for potters too.'
const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: STATEMENT })
const read = (answer) => checkBusinessReading(answer, sources, { trade: 'other' })
const labels = (list) => (list ?? []).map((i) => i.label)

test('a service name is a fact value while it has a name shape: up to six words taken whole stay, unrecorded', () => {
  const r = read({
    services: [
      {
        name: 'free racket fitting before the first lesson',
        quote: 'free racket fitting before the first lesson',
        ref: 'owner'
      },
      { name: 'Pilates for potters', quote: 'We teach Pilates for potters too.', ref: 'owner' },
      { name: 'Racket fitting for juniors', quote: 'Every junior gets a free racket fitting', ref: 'owner' },
      {
        name: 'free racket fitting first lesson',
        quote: 'free racket fitting before the first lesson',
        ref: 'owner'
      }
    ]
  })
  assert.deepEqual(labels(r.services.filter((s) => s.source.kind === 'owner-statement')), [
    'Pilates for potters',
    'Racket fitting for juniors',
    'free racket fitting first lesson'
  ])
  // Seven of the owner's words in a row are the owner's prose (`owner-name-shape.mjs`): the fact arrives for the
  // writer to say in other words, and the record says why, never the text.
  assert.deepEqual(
    r.ownerFacts.map((f) => [f.group, f.text]),
    [['services', 'free racket fitting before the first lesson']]
  )
  assert.deepEqual(r.ownerEchoDropped, [
    {
      group: 'services',
      field: 'label',
      rule: 'run',
      weight: 7,
      why: 'owner_prose_in_name_field',
      kept: 'owner-fact'
    }
  ])
})

test('a key message echoing the owner leaves the copy and arrives as a fact to say in other words', () => {
  const r = read({
    keyMessages: [
      {
        label: 'junior gets a free racket fitting',
        quotes: [{ quote: 'Every junior gets a free racket fitting', ref: 'owner' }]
      },
      {
        label: 'free fitting for every young player',
        quotes: [{ quote: 'Every junior gets a free racket fitting', ref: 'owner' }]
      },
      {
        label: 'fitting for 12 juniors',
        quotes: [{ quote: 'Every junior gets a free racket fitting', ref: 'owner' }]
      }
    ]
  })
  assert.deepEqual(labels(r.keyMessages), ['free fitting for every young player'])
  assert.deepEqual(
    r.ownerFacts.map((f) => [f.kind, f.group, f.text]),
    [['owner-fact', 'keyMessages', 'junior gets a free racket fitting']]
  )
  // The record says where and by which rule, never the words.
  assert.deepEqual(r.ownerEchoDropped, [
    {
      group: 'keyMessages',
      field: 'label',
      rule: 'run',
      weight: 6,
      why: 'copies_owner_statement',
      kept: 'owner-fact'
    }
  ])
})

const usp = (line, who = '') => ({
  label: 'one teacher from start to finish',
  line,
  accent: '',
  who,
  quotes: [
    { quote: 'Lovely wheel class with Ilsa', ref: 'review:1' },
    { quote: 'Ilsa explains every step', ref: 'review:2' }
  ]
})

test('a USP line copying the owner moves the theme to the facts; a who copying the owner goes alone', () => {
  const kept = read({ uspThemes: [usp('the same teacher stays for the whole course')] })
  assert.deepEqual(labels(kept.uspThemes), ['one teacher from start to finish'])
  const line = read({ uspThemes: [usp('the same teacher guides you from your first pot')] })
  assert.equal(line.uspThemes, null)
  assert.equal(line.uspThemesReason, 'rejected')
  assert.deepEqual(
    line.ownerFacts.map((f) => [f.group, f.text]),
    [['uspThemes', 'the same teacher guides you from your first pot']]
  )
  assert.deepEqual(
    line.ownerEchoDropped.map((d) => [d.group, d.field, d.kept]),
    [['uspThemes', 'line', 'owner-fact']]
  )
  const who = read({
    uspThemes: [usp('the same teacher stays for the whole course', 'you from your first pot')]
  })
  assert.deepEqual(labels(who.uspThemes), ['one teacher from start to finish'])
  assert.equal('who' in who.uspThemes[0], false)
  assert.deepEqual(
    who.ownerEchoDropped.map((d) => [d.group, d.field, d.kept]),
    [['uspThemes', 'who', 'item']]
  )
})

test("the brief's view drops a stored theme whose line repeats an owner quote, and a theme left with none is null", () => {
  const owner = { kind: 'owner-statement', ref: 'owner' }
  const review = { kind: 'review', ref: 'review:1' }
  const stored = {
    services: [],
    uspThemes: [
      {
        label: 'same teacher',
        line: 'the same teacher guides you from your first pot',
        quotes: [
          { quote: 'the same teacher guides you from your first pot', source: owner },
          { quote: 'One teacher guided me', source: review }
        ]
      }
    ]
  }
  const brief = readingWithoutOwnerQuotes(stored)
  assert.equal(brief.uspThemes, null)
  assert.equal(brief.uspThemesReason, 'rejected')
  assert.equal(brief.ownerEchoDropped[0].why, 'copies_owner_statement')
  // A theme only the owner's words carried: no quote left, so no theme, with the same reason as the guard's.
  const ownerOnly = readingWithoutOwnerQuotes({
    uspThemes: [
      { label: 'small kiln', line: 'a small kiln', quotes: [{ quote: 'small kiln', source: owner }] }
    ]
  })
  assert.deepEqual([ownerOnly.uspThemes, ownerOnly.uspThemesReason], [null, 'rejected'])
})

test('what the bio says too is the bio, even when the owner repeats it in the chat', () => {
  const srcs = readingSourcesOf({
    ...RESEARCH,
    ownerStatement: 'We teach pottery classes in Velmora every week.'
  })
  const r = checkBusinessReading(
    { story: [{ text: 'Pottery classes in Velmora', quote: 'Pottery classes in Velmora', ref: 'bio' }] },
    srcs,
    { trade: 'other' }
  )
  assert.deepEqual(labels(r.story), ['Pottery classes in Velmora'])
  assert.equal(r.ownerEchoDropped, undefined)
})

test('the rules never read the statement: no item of it, and the reading says why', () => {
  const statement = 'We teach wheel classes for beginners. Locations across Velmora and Ostrel.'
  const rules = readBusinessByRules(readingSourcesOf({ ...RESEARCH, ownerStatement: statement }))
  const all = ['services', 'audience', 'story', 'serviceAreas'].flatMap((g) => rules[g])
  assert.ok(all.length > 0)
  assert.ok(all.every((i) => i.source.kind !== 'owner-statement'))
  assert.equal(rules.ownerStatementSkipped, RULES_SKIP_OWNER)
  assert.equal('ownerStatementSkipped' in readBusinessByRules(readingSourcesOf(RESEARCH)), false)
})

test('service names the owner stated never join into a run of the owner words in the About line', () => {
  const hsc = JSON.parse(
    readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
  )
  // The owner lists the classes; the model quotes the list for each class it names, so each name stays short.
  const statement = 'Our classes: swimming lessons, beach bootcamps, sunrise yoga.'
  const srcs = readingSourcesOf({ bio: hsc.profile.bio, posts: hsc.posts, ownerStatement: statement })
  const answer = {
    services: [
      { name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' },
      { name: 'Beach bootcamps', quote: 'swimming lessons, beach bootcamps, sunrise yoga', ref: 'owner' },
      { name: 'Sunrise yoga', quote: 'swimming lessons, beach bootcamps, sunrise yoga', ref: 'owner' }
    ]
  }
  const reading = { method: 'model', ...checkBusinessReading(answer, srcs, { trade: 'fitness' }) }
  const { profile, brand, media, posts, opportunity, madeAt } = hsc
  assert.deepEqual(reading.ownerEchoDropped, undefined)
  const made = makeSiteBrief(
    domain,
    { profile: { ...profile, businessReading: reading }, brand, sources: [], media, posts },
    { opportunity, madeAt }
  )
  assert.ok(made.reading.services.some((s) => s.label === 'Sunrise yoga'))
  assert.match(made.reading.about, /swimming lessons/i)
  assert.doesNotMatch(made.reading.about, /swimming lessons, beach bootcamps, sunrise yoga/i)
  assert.doesNotMatch(made.reading.about, /bootcamps|yoga/i)
})
