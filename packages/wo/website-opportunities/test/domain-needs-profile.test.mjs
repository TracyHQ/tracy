// The needs profile step (ticket #592): research of an invented business and a scripted fake model in, a needs profile
// out. No test calls a real model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CONFIDENCE_LEVELS } from '../domain/fact-confidence.mjs'
import {
  NEEDS_PROFILE_SCHEMA,
  NeedsProfileError,
  buildNeedsProfile,
  needsProfileOf
} from '../domain/needs-profile.mjs'
import { QUESTION_TOPICS, questionProblems } from '../domain/build-contract-questions.mjs'
import { reporterFor } from '../domain/build-contract-shared.mjs'
import { ASKED_TOPICS, MAX_QUESTIONS } from '../domain/needs-profile-questions.mjs'
import { GROUP_KINDS_V3, ROLE_VOCABULARY_V3, isGroupKind, isRole } from '../domain/place-content-roles.mjs'

const CLUB = JSON.parse(
  readFileSync(new URL('./fixtures/needs-profile/tennis-club.json', import.meta.url), 'utf8')
)
const club = () => structuredClone(CLUB)
/** The en dash and the em dash, never allowed in customer facing words. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** A scripted fake build model: answers each call with the next scripted reply, and records every request. */
function scriptedModel(...replies) {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    if (calls.length > replies.length) throw new Error('the fake model was called more times than scripted')
    return replies[calls.length - 1]
  }
  return Object.assign(model, { calls })
}

async function clubProfile(edit = (c) => c) {
  const { research, reading } = edit(club())
  const model = scriptedModel(JSON.stringify(reading))
  const profile = await buildNeedsProfile({ research, model })
  return { profile, model }
}
const names = (profile, kind) =>
  profile.items[kind].map((i) => i.fields[GROUP_KINDS_V3[kind].requiredRoles[0]].value)

test('one call to the build model; the request carries the sources and never a template or demo', async () => {
  const { profile, model } = await clubProfile()
  assert.equal(model.calls.length, 1)
  const sent = JSON.parse(model.calls[0].user)
  assert.deepEqual(
    sent.sources.map((s) => s.id),
    ['site', 'gmaps', 'insta']
  )
  assert.match(model.calls[0].system, /DRAFT, not approved/)
  assert.equal(profile.schema, NEEDS_PROFILE_SCHEMA)
  assert.equal(profile.roleVocabularyVersion, ROLE_VOCABULARY_V3)
  assert.match(profile.prompt.sha256, /^[0-9a-f]{64}$/)
})

test('facts per data kind, each with its sources and a confidence of the shared levels', async () => {
  const { profile } = await clubProfile()
  for (const kind of ['business.name', 'contact.phone', 'contact.email', 'contact.address', 'contact.hours'])
    assert.ok(profile.facts[kind]?.length, `missing ${kind}`)
  const known = new Set(profile.sources.map((s) => s.id))
  const every = [
    ...Object.values(profile.facts).flat(),
    ...Object.values(profile.items)
      .flat()
      .flatMap((i) => [i, ...Object.values(i.fields)])
  ]
  for (const fact of every) {
    assert.ok(fact.sources.length > 0 && fact.sources.every((s) => known.has(s)))
    assert.ok(CONFIDENCE_LEVELS.includes(fact.confidence))
  }
  // Stated alike by the website and the listing: corroborated. Only the website: single source.
  assert.deepEqual(profile.facts['contact.address'][0].sources, ['site', 'gmaps'])
  assert.equal(profile.facts['contact.address'][0].confidence, 'corroborated')
  assert.equal(profile.facts['contact.email'][0].confidence, 'single-source')
  assert.deepEqual(names(profile, 'person'), ['Ilse Varrow'])
  assert.deepEqual(
    profile.items.quote.map((q) => q.fields['quote.author_name'].value),
    ['Mara Telling', 'Osric Vale']
  )
})

test('every item kind is a group kind and every field a role of place-content-roles/3 (the Contract A catalogue)', async () => {
  const { profile } = await clubProfile()
  for (const [kind, items] of Object.entries(profile.items)) {
    assert.ok(isGroupKind(kind, ROLE_VOCABULARY_V3), kind)
    for (const item of items)
      for (const role of Object.keys(item.fields)) assert.ok(isRole(role, ROLE_VOCABULARY_V3), role)
  }
  for (const kind of Object.keys(profile.facts)) assert.ok(isRole(kind, ROLE_VOCABULARY_V3), kind)
})

test('a service mentioned only in a social caption is in the profile, from that source', async () => {
  const { profile } = await clubProfile()
  assert.deepEqual(names(profile, 'service'), [
    'Junior coaching',
    'Adult group lessons',
    'Court hire',
    'Cardio tennis'
  ])
  const cardio = profile.items.service.find((s) => s.fields['offering.name'].value === 'Cardio tennis')
  assert.deepEqual(cardio.sources, ['insta'])
  // Named on the website and in a caption: one service, two sources.
  assert.deepEqual(profile.items.service[0].sources, ['site', 'insta'])
  assert.equal(profile.items.service[0].confidence, 'corroborated')
})

test('photos carry labels: the research label, else the label the model read, else the alt text', async () => {
  const { profile } = await clubProfile()
  assert.deepEqual(
    profile.items.gallery.map((p) => p.label),
    ['Three clay courts at dusk', 'Clubhouse terrace', 'Players at a cardio tennis evening']
  )
})

test('a phone that differs between sources is kept as a conflict, the website first by default', async () => {
  const { profile } = await clubProfile()
  const phone = profile.facts['contact.phone'][0]
  assert.equal(phone.value, '+1 555 0142 778')
  assert.equal(phone.confidence, 'single-source')
  const conflict = profile.conflicts.find((c) => c.id === phone.conflict)
  assert.equal(conflict.kind, 'contact.phone')
  assert.equal(conflict.defaultBy, 'trust-order')
  assert.equal(conflict.chosen, null)
  assert.deepEqual(
    conflict.values.map((v) => [v.value, v.origins]),
    [
      ['+1 555 0142 778', ['website']],
      ['+1 555 0142 779', ['google']]
    ]
  )
  assert.equal(profile.conflicts.length, 1, JSON.stringify(profile.conflicts))
})

test('the trust order is website, then Google, then social, whatever order the sources come in', async () => {
  const { profile } = await clubProfile((c) => {
    c.research.sources.reverse()
    c.research.sources.find((s) => s.id === 'site').text = 'Brindlewick Tennis Club. Court hire.'
    c.reading.facts = c.reading.facts.filter((f) => f.kind === 'business.name')
    c.reading.items = []
    c.research.sources.find((s) => s.id === 'insta').captions.push('Call +1 555 0142 700 to join.')
    c.reading.facts.push({
      source: 'insta',
      kind: 'contact.phone',
      value: '+1 555 0142 700',
      evidence: 'Call +1 555 0142 700'
    })
    return c
  })
  const phone = profile.facts['contact.phone'][0]
  assert.equal(phone.value, '+1 555 0142 779')
  const conflict = profile.conflicts.find((c) => c.id === phone.conflict)
  assert.deepEqual(
    conflict.values.map((v) => v.origins[0]),
    ['google', 'social']
  )
})

test('the same phone written with and without the country code is one fact, not a conflict', async () => {
  const { profile } = await clubProfile((c) => {
    c.research.sources.find((s) => s.id === 'gmaps').fields['contact.phone'] = '555 0142 778'
    return c
  })
  assert.equal(profile.facts['contact.phone'][0].confidence, 'corroborated')
  assert.equal(profile.conflicts.length, 0)
})

test('questions: only the main button when contact and language are known', async () => {
  const { profile } = await clubProfile()
  assert.deepEqual(
    profile.questions.map((q) => q.topic),
    ['main-button']
  )
  assert.deepEqual(
    profile.questions[0].choices.filter((c) => c.recommended).map((c) => c.id),
    ['book']
  )
})

test('questions: a contact question only when no phone, email or booking link was found', async () => {
  const { profile } = await clubProfile((c) => {
    delete c.research.sources.find((s) => s.id === 'gmaps').fields['contact.phone']
    c.reading.facts = c.reading.facts.filter(
      (f) => !['contact.phone', 'contact.email', 'contact.cta_url'].includes(f.kind)
    )
    return c
  })
  assert.deepEqual(
    profile.questions.map((q) => q.topic),
    ['main-button', 'contact-method']
  )
})

test('questions: at most three, only on the agreed topics, conflicts never asked, no dash in any customer text', async () => {
  const { profile } = await clubProfile((c) => {
    delete c.research.sources.find((s) => s.id === 'gmaps').fields['contact.phone']
    c.reading.facts = c.reading.facts.filter(
      (f) => !['contact.phone', 'contact.email', 'contact.cta_url'].includes(f.kind)
    )
    c.research.sources.find((s) => s.id === 'insta').language = 'es'
    // A conflict stays a conflict on the plan; it is not a question.
    c.research.sources.find((s) => s.id === 'gmaps').fields['contact.address'] =
      '16 Quillmoor Lane, Fernhollow'
    return c
  })
  assert.ok(profile.conflicts.length >= 1)
  assert.deepEqual(
    profile.questions.map((q) => q.topic),
    ['main-button', 'contact-method', 'site-language']
  )
  assert.ok(profile.questions.length <= MAX_QUESTIONS)
  for (const q of profile.questions) {
    assert.ok(ASKED_TOPICS.includes(q.topic))
    for (const words of [q.prompt, ...q.choices.map((o) => o.label)]) assert.doesNotMatch(words, DASHES)
  }
})

test('the site language follows the public sources; mixed sources default to the most trusted and are asked', async () => {
  const same = await clubProfile()
  assert.deepEqual([same.profile.language.value, same.profile.language.mixed], ['en', false])

  const french = await clubProfile((c) => {
    for (const s of c.research.sources) delete s.language
    c.reading.languages = c.reading.languages.map((l) => ({ ...l, language: 'fr' }))
    return c
  })
  assert.deepEqual([french.profile.language.value, french.profile.language.mixed], ['fr', false])

  const mixed = await clubProfile((c) => {
    c.research.sources.find((s) => s.id === 'insta').language = 'es-ES'
    return c
  })
  assert.equal(mixed.profile.language.value, 'en')
  // The region is kept: the option is the tag the source gave.
  assert.deepEqual(mixed.profile.language.options, ['en', 'es-ES'])
  const asked = mixed.profile.questions.find((q) => q.topic === 'site-language')
  assert.deepEqual(
    asked.choices.map((o) => o.label),
    ['English', 'European Spanish']
  )
  assert.deepEqual(
    asked.choices.filter((c) => c.recommended).map((c) => c.id),
    ['en']
  )
})

test('every question the needs profile asks passes the Contract B question check', async () => {
  const { profile } = await clubProfile((c) => {
    delete c.research.sources.find((s) => s.id === 'gmaps').fields['contact.phone']
    c.reading.facts = c.reading.facts.filter(
      (f) => !['contact.phone', 'contact.email', 'contact.cta_url'].includes(f.kind)
    )
    c.research.sources.find((s) => s.id === 'insta').language = 'es'
    return c
  })
  assert.equal(profile.questions.length, 3)
  for (const q of profile.questions) {
    const problems = []
    questionProblems(q, reporterFor(problems))
    assert.deepEqual(problems, [], `${q.id}: ${JSON.stringify(problems)}`)
    assert.ok(QUESTION_TOPICS.includes(q.topic))
  }
})

test('a model fact with no evidence in its source, an unknown source or an unknown kind is dropped, never kept', () => {
  const { research, reading } = club()
  reading.facts.push(
    {
      source: 'site',
      kind: 'contact.email',
      value: 'owner@invented.example',
      evidence: 'owner@invented.example'
    },
    { source: 'nowhere', kind: 'contact.phone', value: '1', evidence: 'x' },
    { source: 'site', kind: 'business.tagline', value: 'Best club', evidence: 'Brindlewick Tennis Club.' }
  )
  reading.items.push({
    source: 'insta',
    kind: 'service',
    fields: { 'offering.name': 'Padel' },
    evidence: 'Padel nights'
  })
  const profile = needsProfileOf(research, reading)
  assert.deepEqual(
    profile.dropped.map((d) => d.code),
    ['evidence_not_in_source', 'unknown_source', 'unknown_kind', 'evidence_not_in_source']
  )
  assert.equal(profile.facts['contact.email'].length, 1)
  assert.ok(!names(profile, 'service').includes('Padel'))
})

test('an unreadable model reply or research with no source stops the step with a code', async () => {
  const { research } = club()
  await assert.rejects(
    buildNeedsProfile({ research, model: scriptedModel('not json') }),
    (e) => e instanceof NeedsProfileError && e.code === 'model_reply_unreadable'
  )
  await assert.rejects(
    buildNeedsProfile({ research: { sources: [] }, model: scriptedModel('{}') }),
    (e) => e instanceof NeedsProfileError && e.code === 'research_unusable'
  )
  const fenced = scriptedModel(`\`\`\`json\n${JSON.stringify(club().reading)}\n\`\`\``)
  const profile = await buildNeedsProfile({ research, model: fenced })
  assert.equal(profile.items.service.length, 4)
})
