// The needs profile questions (ticket #592, product decision of 13/11): no fixed number, only important ones. The
// customer confirms an important fact the sources disagree on; any other conflict stays on the plan, never asked.
// Invented business, scripted reading; no test calls a real model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { questionProblems } from '../domain/build-contract-questions.mjs'
import { reporterFor } from '../domain/build-contract-shared.mjs'
import { IMPORTANT_CONFLICTS } from '../domain/needs-profile-conflict-questions.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'

const CLUB = JSON.parse(
  readFileSync(new URL('./fixtures/needs-profile/tennis-club.json', import.meta.url), 'utf8')
)

/** The club with a price that differs on Instagram and a coach role that differs too (not an important fact). */
function clubWithMoreConflicts() {
  const { research, reading } = structuredClone(CLUB)
  const insta = research.sources.find((s) => s.id === 'insta')
  insta.captions.push('Court hire is $20 an hour this month.', 'Coach Ilse Varrow runs cardio nights.')
  reading.items.push(
    {
      source: 'insta',
      kind: 'service',
      fields: { 'offering.name': 'Court hire', 'offering.price': '$20 an hour' },
      evidence: 'Court hire is $20 an hour this month'
    },
    {
      source: 'insta',
      kind: 'person',
      fields: { 'person.name': 'Ilse Varrow', 'person.role': 'Coach' },
      evidence: 'Coach Ilse Varrow runs cardio nights'
    }
  )
  return { research, reading }
}
const problemsOf = (q) => {
  const problems = []
  questionProblems(q, reporterFor(problems))
  return problems
}

test('a conflict on an important fact is one fact-conflict question, labelled by where each value came from', () => {
  const { research, reading } = structuredClone(CLUB)
  const profile = needsProfileOf(research, reading)
  const [q] = profile.questions
  assert.equal(q.topic, 'fact-conflict')
  assert.equal(q.fact, 'contact.phone')
  assert.equal(q.id, 'fact-conflict.facts.contact.phone')
  assert.deepEqual(
    q.choices.map((c) => [c.label, c.detail, c.recommended ?? false]),
    [
      ['+1 555 0142 778', 'From your website', true],
      ['+1 555 0142 779', 'From your Google listing', false]
    ]
  )
  assert.equal(q.freeText.maxLength, IMPORTANT_CONFLICTS['contact.phone'].maxLength)
  assert.deepEqual(problemsOf(q), [])
})

test('order: contact conflicts, main button, contact method, language, then price conflicts; never a cap', () => {
  const { research, reading } = clubWithMoreConflicts()
  research.sources.find((s) => s.id === 'gmaps').fields['contact.address'] = '16 Quillmoor Lane, Fernhollow'
  research.sources.find((s) => s.id === 'insta').language = 'es'
  const profile = needsProfileOf(research, reading)
  assert.deepEqual(
    profile.questions.map((q) => q.fact ?? q.topic),
    ['contact.phone', 'contact.address', 'main-button', 'site-language', 'offering.price']
  )
  const price = profile.questions.at(-1)
  assert.match(price.prompt, /the price of Court hire/)
  assert.deepEqual(
    price.choices.map((c) => [c.label, c.detail]),
    [
      ['from $18 an hour', 'From your website'],
      ['$20 an hour', 'From your Instagram']
    ]
  )
  for (const q of profile.questions) assert.deepEqual(problemsOf(q), [], q.id)
})

test('accounting: every conflict is asked by one question or not asked with a reason, none unexplained', () => {
  const { research, reading } = clubWithMoreConflicts()
  const profile = needsProfileOf(research, reading)
  const ids = new Set(profile.questions.map((q) => q.id))
  const asked = profile.conflicts.filter((c) => c.question)
  const notAsked = profile.conflicts.filter((c) => c.notAsked)
  assert.equal(asked.length + notAsked.length, profile.conflicts.length)
  for (const c of profile.conflicts) assert.ok(!(c.question && c.notAsked), c.id)
  for (const c of asked) assert.ok(ids.has(c.question) && IMPORTANT_CONFLICTS[c.kind], c.id)
  assert.deepEqual(
    notAsked.map((c) => [c.kind, typeof c.notAsked]),
    [['person.role', 'string']]
  )
  // Not asked, but kept with its trust order default.
  const role = profile.items.person[0].fields['person.role']
  assert.equal(role.value, 'Head coach')
  assert.equal(profile.questions.filter((q) => q.topic === 'fact-conflict').length, asked.length)
})

test('question ids are stable: the same research in another source order gives the same questions', () => {
  const first = needsProfileOf(...Object.values(clubWithMoreConflicts()))
  const shuffled = clubWithMoreConflicts()
  shuffled.research.sources.reverse()
  const second = needsProfileOf(shuffled.research, shuffled.reading)
  assert.deepEqual(
    second.questions.map((q) => q.id),
    first.questions.map((q) => q.id)
  )
})

test('the same phone in two formats is no conflict and no question', () => {
  const profile = needsProfileOf(
    {
      sources: [
        { id: 'w', origin: 'website', language: 'en', fields: { 'contact.phone': '+971 4 111 2222' } },
        { id: 'g', origin: 'google', fields: { 'contact.phone': '04 111 2222 ext 5' } }
      ]
    },
    {}
  )
  assert.deepEqual(profile.conflicts, [])
  assert.deepEqual(
    profile.questions.map((q) => q.topic),
    ['main-button']
  )
})
