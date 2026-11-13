// The owner's chat statement from the reading to the plan (decision D46): its facts reach the needs profile as the
// source `owner-statement` of origin `answer` ("Your answer"), never as a story, a quote or a phrase the writer copies.
// An invented pottery studio and a scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-profile.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { briefFactsOf, decisionsOf } from '../domain/brief-facts.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { TRUST_ORDER } from '../domain/needs-profile-merge.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { ANSWER_READING_OWNER, OWNER_STATEMENT, RESEARCH } from './fixtures/owner-statement/research.mjs'

const sources = readingSourcesOf({ ...RESEARCH, ownerStatement: OWNER_STATEMENT })
const reading = {
  method: 'model',
  version: 'business-reading-test',
  ...checkBusinessReading(ANSWER_READING_OWNER, sources, { trade: 'other' })
}
const placeProfile = () =>
  placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: 'corvane-test', name: RESEARCH.name },
    profile: { name: RESEARCH.name, bio: RESEARCH.bio, businessReading: reading },
    sources: [{ source: 'instagram', ref: 'https://www.instagram.com/corvane.example', status: 'complete' }],
    madeAt: '2026-11-13T10:00:00.000Z'
  })
const briefFacts = (doc) => briefFactsOf(doc, { decisions: decisionsOf(doc) })

test('the place profile files the statement under its own source, never as a story or post quote', () => {
  const doc = placeProfile()
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  const owner = doc.sources.filter((s) => s.kind === 'owner-statement')
  assert.equal(owner.length, 1)
  assert.equal(owner[0].ref, 'chat')
  assert.equal(
    doc.sources.some((s) => s.kind === 'owner'),
    false,
    'never the Profile card owner kind'
  )
  const ownerEvidence = new Set(doc.evidence.filter((e) => e.sourceId === owner[0].id).map((e) => e.id))
  const ownerQuotes = doc.quotes.filter((q) => q.evidenceRefs.some((r) => ownerEvidence.has(r)))
  assert.ok(ownerQuotes.length > 0)
  assert.ok(ownerQuotes.every((q) => q.value.kind === 'owner-statement'))
  const facts = briefFacts(doc)
  const fromOwner = facts.filter((f) => f.evidence.some((e) => e.source === 'owner-statement'))
  assert.deepEqual([...new Set(fromOwner.map((f) => f.field))].sort(), ['ownerStatement', 'services'])
  assert.ok(fromOwner.every((f) => f.onSite === true && !f.editedByOwner))
})

test("the statement's facts reach the needs profile with origin answer, read on the plan as Your answer", () => {
  const research = researchOf({ facts: briefFacts(placeProfile()) })
  const owner = research.sources.find((s) => s.id === 'owner-statement')
  assert.equal(owner.origin, 'answer')
  assert.match(owner.text, /rent kiln space to local makers/)
  const profile = needsProfileOf(research, {
    items: [
      {
        source: 'owner-statement',
        kind: 'service',
        fields: { 'offering.name': 'kiln space' },
        evidence: 'We also rent kiln space to local makers.'
      }
    ]
  })
  const data = planDataOf(profile)
  const kiln = data.items.find((i) => i.label === 'kiln space')
  assert.deepEqual(kiln.sources, [{ kind: 'answer', name: 'Your answer' }])
})

test('answer sits under the website and over Google and social in the trust order', () => {
  assert.deepEqual(TRUST_ORDER, ['website', 'answer', 'google', 'social'])
  const research = {
    sources: [
      { id: 'google', origin: 'google', fields: { 'contact.phone': '+000 10 000 1111' } },
      { id: 'owner-statement', origin: 'answer', text: 'Call us on +000 10 000 2222 any day.' }
    ]
  }
  const reading = {
    facts: [
      {
        source: 'owner-statement',
        kind: 'contact.phone',
        value: '+000 10 000 2222',
        evidence: 'Call us on +000 10 000 2222 any day.'
      }
    ]
  }
  const profile = needsProfileOf(research, reading)
  assert.equal(profile.facts['contact.phone'][0].value, '+000 10 000 2222')
  const withSite = needsProfileOf(
    {
      sources: [
        ...research.sources,
        { id: 'website', origin: 'website', fields: { 'contact.phone': '+000 10 000 3333' } }
      ]
    },
    reading
  )
  assert.equal(withSite.facts['contact.phone'][0].value, '+000 10 000 3333')
})

test('the needs profile never keeps a quote, a copied summary or an own phrase from the statement', () => {
  const text = 'Our second teacher leads the evening raku firings for the whole studio.'
  const profile = needsProfileOf(
    { sources: [{ id: 'owner-statement', origin: 'answer', text }] },
    {
      items: [
        { source: 'owner-statement', kind: 'quote', fields: { 'quote.text': text }, evidence: text },
        {
          source: 'owner-statement',
          kind: 'service',
          fields: { 'offering.name': 'raku firings', 'offering.description': text },
          evidence: text
        }
      ],
      voice: { ownWords: ['evening raku firings'] }
    }
  )
  assert.equal(profile.items.quote, undefined)
  assert.equal(profile.items.service[0].fields['offering.description'], undefined)
  assert.equal(profile.voice?.ownWords, undefined)
})

test("the brief's copy reads the statement's facts, never its words", () => {
  const copy = readingWithoutOwnerQuotes(reading)
  const owner = (list) => (list ?? []).filter((i) => i.source?.kind === 'owner-statement')
  assert.deepEqual(owner(copy.story), [])
  assert.deepEqual(owner(copy.facts), [])
  // An audience is a name (a fact value): it stays, its name its only quote.
  assert.ok(owner(copy.audience).every((a) => a.quote === a.label))
  // The story line and the fact the statement gave arrive as facts to say in other words.
  const read = [...owner(reading.story), ...owner(reading.facts)].map((i) => i.label)
  assert.deepEqual(
    (copy.ownerFacts ?? []).filter((f) => f.group !== 'keyMessages').map((f) => f.text),
    read
  )
  const kiln = owner(copy.services)[0]
  assert.equal(kiln.quote, kiln.label, 'a service from the statement is described by its name only')
  assert.ok((copy.keyMessages ?? []).every((m) => m.quotes.every((q) => q.source.kind !== 'owner-statement')))
  // What the other texts said stays as it was.
  assert.deepEqual(
    copy.story.map((i) => i.label),
    reading.story.filter((i) => i.source.kind !== 'owner-statement').map((i) => i.label)
  )
  const plain = { ...reading, story: [], audience: [], facts: [], services: [], keyMessages: [], team: [] }
  assert.equal(
    readingWithoutOwnerQuotes(plain),
    plain,
    'a reading with nothing of the statement is left alone'
  )
})
