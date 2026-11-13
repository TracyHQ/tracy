// A name or value field is exempt from the echo guard only while it has a name's shape (`owner-name-shape.mjs`,
// decision D46, #609): both sides for every exempt field of every group, each signal, a value cut at the reading's cap
// kept as whole words, and the fact of a field that fails going to `ownerFacts`. Invented massage studio; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-name-shape.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { ownerEchoOf } from '../domain/owner-echo.mjs'
import { NAME_SHAPE_LIMITS, nameShapeProblem, wholeWordsOf } from '../domain/owner-name-shape.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { MASSAGE_ANSWER, MASSAGE_BIO, MASSAGE_STATEMENT } from './fixtures/owner-statement/massage-studio.mjs'

const PROSE = 'We treat each visitor like family and never rush anyone out the door'
const echo = ownerEchoOf([`${MASSAGE_STATEMENT} ${PROSE}.`])
const owner = (group, field, value) => nameShapeProblem(value, { group, field, echo, owner: true })

// Every exempt field: names of the fixtures (and a five and a six word service) pass; a twelve word sentence fails.
const PASSES = {
  services: {
    label: [
      'Deep tissue sports massage',
      'Free local delivery over 30 dollars',
      'Hot stone massage for couples'
    ],
    price: ['$69 monthly', '30 dollars per hour']
  },
  audience: { label: ['office workers and weekend runners', 'tired parents'] },
  team: {
    label: ['Mira Solent', 'Mira de la Solent'],
    role: ['head therapist and founder since 2011', 'founder']
  },
  serviceAreas: { label: ['North Velmora and South Velmora', '12 Harbour Rd. Velmora'] }
}

test('every exempt field: a name passes, a twelve word owner sentence does not', () => {
  for (const [group, fields] of Object.entries(NAME_SHAPE_LIMITS))
    for (const field of Object.keys(fields)) {
      for (const value of PASSES[group][field])
        assert.equal(owner(group, field, value), false, `${group}.${field}`)
      assert.equal(owner(group, field, PROSE).rule, 'words', `${group}.${field}`)
    }
})

test('the thresholds per field are the doc table: the limit passes, one word more fails', () => {
  const words = (n) => Array.from({ length: n }, (_, k) => `word${k}`).join(' ')
  for (const [group, fields] of Object.entries(NAME_SHAPE_LIMITS))
    for (const [field, limit] of Object.entries(fields)) {
      assert.equal(owner(group, field, words(limit)), false, `${group}.${field}`)
      assert.deepEqual(owner(group, field, words(limit + 1)), { rule: 'words', weight: limit + 1 })
    }
  assert.deepEqual(NAME_SHAPE_LIMITS, {
    services: { label: 8, price: 6 },
    audience: { label: 6 },
    team: { label: 5, role: 6 },
    serviceAreas: { label: 6 }
  })
})

test('each signal: an owner run of seven, two sentences, a clause; a public item is held to the echo only', () => {
  assert.deepEqual(owner('services', 'label', 'each visitor like family and never rush'), {
    rule: 'run',
    weight: 7
  })
  assert.equal(owner('services', 'label', 'each visitor like family and never'), false)
  assert.equal(owner('team', 'role', 'Head therapist. Runs the studio').rule, 'two-sentences')
  assert.equal(owner('team', 'label', 'Mira Solent is our founder').rule, 'clause')
  assert.equal(owner('audience', 'label', 'We serve office workers').rule, 'clause')
  assert.equal(owner('audience', 'label', 'people who are new runners'), false)
  const pub = (value) => nameShapeProblem(value, { group: 'services', field: 'label', echo, owner: false })
  assert.equal(pub('Personalised one to one massage lessons for complete beginners'), false)
  assert.equal(pub('each visitor like family and never rush').rule, 'run')
})

test('a value cut at the cap inside a word is cut back to whole words, never sent mid word', () => {
  const quote =
    'Every client gets a calm room, warm oil and a therapist who really listens to them every single time'
  const cut = quote.slice(0, 80)
  assert.ok(cut.endsWith(' th'))
  assert.equal(wholeWordsOf(cut, [quote]), quote.slice(0, 77).trim())
  assert.equal(wholeWordsOf(quote.slice(0, 79), [quote]), quote.slice(0, 79))
  assert.equal(wholeWordsOf('Deep tissue sports massage', [quote]), 'Deep tissue sports massage')
  assert.equal(owner('services', 'label', `${'x'.repeat(77)} ab`).rule, 'cut')
})

test('owner sentences typed into name fields leave every field, and their facts arrive as owner facts', () => {
  const statement = `${MASSAGE_STATEMENT} ${PROSE}. Mira Solent is the gentle woman who runs this place with all her heart.`
  const answer = {
    ...MASSAGE_ANSWER,
    services: [...MASSAGE_ANSWER.services, { name: PROSE, quote: PROSE, ref: 'owner' }],
    audience: [
      ...MASSAGE_ANSWER.audience,
      { label: 'We treat each visitor like family', quote: 'We treat each visitor like family', ref: 'owner' }
    ],
    team: [
      {
        name: 'Mira Solent',
        role: 'gentle woman who runs this place with all her heart',
        quote: 'Mira Solent is the gentle woman who runs this place with all her heart',
        ref: 'owner'
      }
    ]
  }
  const sources = readingSourcesOf({ bio: MASSAGE_BIO, ownerStatement: statement })
  const read = checkBusinessReading(answer, sources, { trade: 'other' })
  const view = readingWithoutOwnerQuotes({ method: 'model', ...read })
  for (const r of [read, view]) {
    assert.ok(!r.services.some((s) => s.label === PROSE))
    assert.ok(!r.audience.some((s) => s.label.startsWith('We ')))
    assert.deepEqual(
      r.team.map((t) => [t.label, t.role]),
      [['Mira Solent', undefined]]
    )
    const facts = r.ownerFacts.map((f) => [f.group, f.field ?? null, f.text])
    assert.ok(facts.some(([g, , t]) => g === 'services' && t === PROSE))
    assert.ok(facts.some(([g, , t]) => g === 'audience' && t === 'We treat each visitor like family'))
    assert.ok(facts.some(([g, f]) => g === 'team' && f === 'role'))
  }
  const rules = read.ownerEchoDropped.filter((d) => d.why === 'owner_prose_in_name_field')
  assert.deepEqual(
    rules.map((d) => [d.group, d.field, d.rule, d.kept]),
    [
      ['services', 'label', 'words', 'owner-fact'],
      ['audience', 'label', 'clause', 'owner-fact'],
      ['team', 'role', 'words', 'item']
    ]
  )
  assert.ok(rules.every((d) => !('text' in d)))
})
