// The needs profile against the review findings of ticket #592: a quote must prove the value it carries, the same
// phone written two ways is one fact, no structured input is set aside without a reason, and the site language is
// read deliberately. Invented businesses only; no test calls a real model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { sameValue } from '../domain/needs-profile-merge.mjs'
import { structuredObservations } from '../domain/needs-profile-observations.mjs'
import { NeedsProfileError, needsProfileOf } from '../domain/needs-profile.mjs'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/needs-profile/${name}.json`, import.meta.url), 'utf8'))
const STUDIO = {
  id: 'w',
  origin: 'website',
  language: 'en',
  text: 'Sunfold Pottery. Call us today for a class. Wheel throwing for beginners, $40 a session. Founder Wren Callow.'
}
const profileOf = (reading, sources = [STUDIO]) => needsProfileOf({ sources }, reading)
const codes = (profile) => profile.dropped.map((d) => d.code)

test('a fact whose value is not inside its quote is dropped, even when the quote is in the source', () => {
  const profile = profileOf({
    facts: [{ source: 'w', kind: 'contact.phone', value: '04 999 9999', evidence: 'Call us today' }]
  })
  assert.equal(profile.facts['contact.phone'], undefined)
  assert.deepEqual(codes(profile), ['value_not_in_evidence'])
})

test('a quote shorter than the minimum is dropped, whatever the value', () => {
  const profile = profileOf({
    facts: [
      { source: 'w', kind: 'contact.email', value: 'boss@other.example', evidence: 'a' },
      { source: 'w', kind: 'business.name', value: 'Sun', evidence: 'Sun' }
    ]
  })
  assert.deepEqual(profile.facts, {})
  assert.deepEqual(codes(profile), ['evidence_too_short', 'evidence_too_short'])
})

test('an invented person and an invented price are dropped; a quoted one is kept, case and spacing aside', () => {
  const profile = profileOf({
    items: [
      {
        source: 'w',
        kind: 'person',
        fields: { 'person.name': 'Dr Invented Person' },
        evidence: 'Sunfold Pottery'
      },
      {
        source: 'w',
        kind: 'service',
        fields: { 'offering.name': 'Wheel throwing', 'offering.price': '$500' },
        evidence: 'Wheel throwing for beginners'
      },
      {
        source: 'w',
        kind: 'person',
        fields: { 'person.name': 'WREN  callow' },
        evidence: 'Founder Wren Callow'
      },
      {
        source: 'w',
        kind: 'service',
        fields: { 'offering.name': 'Wheel throwing', 'offering.price': '$40 a session' },
        evidence: 'Wheel throwing for beginners, $40 a session'
      }
    ]
  })
  assert.deepEqual(codes(profile), ['value_not_in_evidence', 'value_not_in_evidence'])
  assert.deepEqual(
    profile.dropped.map((d) => d.field),
    ['person.name', 'offering.price']
  )
  assert.deepEqual(
    profile.items.person.map((p) => p.fields['person.name'].value),
    ['WREN  callow']
  )
  assert.equal(profile.items.service[0].fields['offering.price'].value, '$40 a session')
})

test('a summary field may reword its quote but never carry a name, number or price the quote lacks', () => {
  const profile = profileOf({
    items: [
      {
        source: 'w',
        kind: 'service',
        fields: {
          'offering.name': 'Wheel throwing',
          'offering.description': 'A class for people new to clay'
        },
        evidence: 'Wheel throwing for beginners'
      },
      {
        source: 'w',
        kind: 'service',
        fields: {
          'offering.name': 'Wheel throwing',
          'offering.description': 'Taught by Marla Quent for $90'
        },
        evidence: 'Wheel throwing for beginners'
      }
    ]
  })
  const [service] = profile.items.service
  assert.equal(service.fields['offering.description'].value, 'A class for people new to clay')
  assert.deepEqual(codes(profile), ['summary_not_in_evidence'])
  assert.equal(profile.dropped[0].field, 'offering.description')
})

test('hours may be rewritten as days and times, but every time must be in the quote', () => {
  const sources = [{ ...STUDIO, text: 'Open Monday to Friday 7am to 10pm.' }]
  const kept = profileOf(
    {
      facts: [
        {
          source: 'w',
          kind: 'contact.hours',
          value: 'Mo-Fr 07:00-22:00',
          evidence: 'Monday to Friday 7am to 10pm'
        }
      ]
    },
    sources
  )
  assert.equal(kept.facts['contact.hours'][0].value, 'Mo-Fr 07:00-22:00')
  const invented = profileOf(
    {
      facts: [
        {
          source: 'w',
          kind: 'contact.hours',
          value: 'Mo-Fr 07:00-23:00',
          evidence: 'Monday to Friday 7am to 10pm'
        }
      ]
    },
    sources
  )
  assert.deepEqual(codes(invented), ['value_not_in_evidence'])
})

test('the same phone written two ways is one fact; two different numbers stay a conflict', () => {
  for (const [a, b] of [
    ['+971 4 111 2222', '04 111 2222'],
    ['+44 20 1234 5678', '020 1234 5678'],
    ['04 111 2222 ext 5', '04 111 2222'],
    ['+1 555 0142 778', '555 0142 778'],
    ['(04) 111-2222', '04.111.2222']
  ])
    assert.ok(sameValue('contact.phone', a, b), `${a} | ${b}`)
  for (const [a, b] of [
    ['+971 4 111 2222', '04 111 2223'],
    ['+44 20 1234 5678', '+971 20 1234 5678'],
    ['04 111 2222', '05 111 2222']
  ])
    assert.ok(!sameValue('contact.phone', a, b), `${a} | ${b}`)
  const profile = profileOf({}, [
    { id: 'w', origin: 'website', fields: { 'contact.phone': '+971 4 111 2222' } },
    { id: 'g', origin: 'google', fields: { 'contact.phone': '04 111 2222' } }
  ])
  assert.deepEqual(profile.conflicts, [])
  assert.deepEqual(profile.facts['contact.phone'], [
    { value: '+971 4 111 2222', sources: ['w', 'g'], confidence: 'corroborated' }
  ])
})

/** Every structured input of a usable source: one per field value, review and picture. */
const structuredCount = (sources) =>
  sources.reduce(
    (n, s) =>
      n +
      Object.values(s.fields ?? {}).reduce((m, v) => m + (Array.isArray(v) ? v.length : 1), 0) +
      (s.reviews ?? []).length +
      (s.pictures ?? []).length,
    0
  )

for (const name of ['tennis-club', 'adversarial-inputs']) {
  test(`accounting on ${name}: every structured input is kept or dropped with a reason, none unexplained`, () => {
    const { research, reading } = fixture(name)
    const usable = research.sources.filter((s) => s.origin !== 'tiktok')
    const out = structuredObservations(usable)
    const dropped = out.dropped.filter((d) => d.scope === 'observation')
    assert.equal(out.facts.length + out.items.length + dropped.length, structuredCount(usable))
    for (const d of out.dropped) assert.ok(d.code && d.reason, JSON.stringify(d))
    // Every kept one reaches the profile, under its source.
    const profile = needsProfileOf(research, reading ?? {})
    for (const f of out.facts)
      assert.ok(
        profile.facts[f.kind].some((e) => e.sources.includes(f.source.id) || e.conflict),
        `${f.kind} ${f.value}`
      )
    for (const it of out.items)
      assert.ok(
        profile.items[it.kind].some((e) => e.sources.includes(it.source.id)),
        it.kind
      )
  })
}

test('adversarial research: each set aside input names its reason, a rating object never becomes text', () => {
  const profile = needsProfileOf(fixture('adversarial-inputs').research, {})
  const reasons = profile.dropped.map((d) => `${d.source}:${d.code}:${d.field ?? d.kind ?? ''}`)
  assert.deepEqual(reasons.sort(), [
    'clips:source_unusable:',
    'maps:not_text:contact.hours',
    'maps:picture_without_ref:gallery',
    'maps:rating_not_readable:quote.rating_or_source',
    'maps:rating_not_readable:quote.rating_or_source',
    'maps:review_without_text:quote',
    'maps:unhandled_field_kind:contact.whatsapp',
    'web:not_text:contact.email',
    'web:not_text:contact.email',
    'web:not_text:contact.phone',
    'web:picture_without_ref:gallery',
    'web:unhandled_field_kind:business.tagline'
  ])
  for (const quote of profile.items.quote) {
    const rating = quote.fields['quote.rating_or_source']?.value
    assert.ok(rating === undefined || /^\d$/.test(rating), rating)
  }
  assert.equal(profile.items.quote.length, 3)
})

test('two sources with the same id stop the step with research_unusable', () => {
  assert.throws(
    () =>
      profileOf({}, [
        { id: 'w', origin: 'website' },
        { id: 'w', origin: 'social' }
      ]),
    (e) => e instanceof NeedsProfileError && e.code === 'research_unusable'
  )
})

test('a language name the model writes is mapped to its tag; an unreadable one is unknown, said out loud', () => {
  const named = profileOf({ languages: [{ source: 'w', language: 'English' }] }, [
    { id: 'w', origin: 'website' }
  ])
  assert.equal(named.language.value, 'en')
  const unread = profileOf({ languages: [{ source: 'w', language: 'Elvish-ish' }] }, [
    { id: 'w', origin: 'website' }
  ])
  assert.equal(unread.language.value, null)
  assert.deepEqual(unread.language.unread, [{ source: 'w', said: 'Elvish-ish', from: 'model' }])
  assert.deepEqual(codes(unread), ['language_not_recognised'])
})

test('a region is kept: pt-BR stays pt-BR, and en-US beside en-GB is one language, not a mix', () => {
  const br = profileOf({ languages: [{ source: 'w', language: 'pt_br' }] }, [{ id: 'w', origin: 'website' }])
  assert.equal(br.language.value, 'pt-BR')
  const en = profileOf({}, [
    { id: 'w', origin: 'website', language: 'en-US' },
    { id: 'g', origin: 'google', language: 'en-GB' }
  ])
  assert.deepEqual([en.language.value, en.language.mixed], ['en-US', false])
})
