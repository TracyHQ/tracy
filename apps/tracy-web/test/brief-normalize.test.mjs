/**
 * The brief is the record of what the customer SAID. These tests hold the three ways that record
 * can be quietly falsified: a gap filled with plausible content, a disagreement resolved by
 * picking a winner, and the demo's own business becoming the customer's.
 *
 * FIXTURE, NOT INTEGRATION. Session A's typed-answer export and capability snapshot are not on this
 * branch (checked 22/09), so the snapshot below is a hand-written stand-in shaped like the rows
 * `readCapabilities` produces — `{ key: 'core:name', kind: 'core' }` and friends. It is enough to
 * develop against and is NOT evidence that the integration works; the acceptance run has to use a
 * real snapshot from A.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromTypedAnswers, NEVER_INFERRED, normalizeBrief, requiredFactKeys } from '../src/brief/normalize.js'
import { validateSiteBrief } from '../src/brief/schema.mjs'

/** A capability snapshot shaped like session A's reader output. MOCK — see the file header. */
const CAPABILITIES = {
  schemaVersion: 'tracy-capabilities/v1',
  capabilities: [
    { key: 'core:name', kind: 'core', label: 'The business name' },
    { key: 'core:about', kind: 'core', label: 'What the business does' },
    { key: 'page:home', kind: 'page', label: 'Home', meaning: { role: 'home', by: 'rule' } },
    {
      key: 'block:hero',
      kind: 'block',
      page: 'page:home',
      label: 'Hero',
      meaning: { role: 'hero', by: 'rule' }
    }
  ]
}

const BUILD = { buildId: 'b-1', siteKey: 'site-abc', tenantId: 'tenant-1', workspaceId: 'ws-1' }
const RELEASE = {
  tag: 'tracy-business-j6',
  platform: 'joomla',
  version: '1.1.0',
  capabilitiesHash: 'cap-hash-1'
}
const LOCALES = { primary: 'vi-VN', secondary: [] }

const base = (over = {}) =>
  normalizeBrief({
    build: BUILD,
    release: RELEASE,
    capabilities: CAPABILITIES,
    locales: LOCALES,
    createdAt: '2026-09-22T00:00:00.000Z',
    ...over
  })

test('a typed answer becomes a fact that still names the question it came from', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery in District 7' }
    ])
  })
  assert.equal(validateSiteBrief(brief).ok, true)
  assert.equal(brief.status, 'ready')
  const name = brief.facts.find((f) => f.key === 'name')
  assert.equal(name.value, 'Tiệm bánh Bảy')
  assert.equal(name.factRefs.length, 1)
  const source = brief.sources.find((s) => s.id === name.factRefs[0])
  assert.deepEqual({ kind: source.kind, ref: source.ref }, { kind: 'answer', ref: 'q-name' })
})

test('a fact nobody supplied is missing, and the brief says needs_input rather than inventing one', () => {
  const brief = base({
    answers: fromTypedAnswers([{ questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' }])
  })
  assert.equal(brief.status, 'needs_input')
  assert.deepEqual(brief.missing, [{ key: 'about', why: 'never-supplied' }])
  // The gap stays a gap: nothing was written for `about`, not even an empty or neutral string.
  assert.equal(
    brief.facts.some((f) => f.key === 'about'),
    false
  )
})

test('an empty answer is a gap, not a fact', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: '   ' }
    ])
  })
  assert.deepEqual(brief.missing, [{ key: 'about', why: 'never-supplied' }])
})

test("THE DEMO'S FACTS ARE NEVER THE CUSTOMER'S FACTS", () => {
  // The archive answers `address` and `about` with its own business. Neither may cross over.
  const brief = base({
    answers: fromTypedAnswers([{ questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' }]),
    demoFacts: ['about', 'address', 'testimonials']
  })
  assert.equal(
    brief.facts.some((f) => f.key === 'about' || f.key === 'address' || f.key === 'testimonials'),
    false,
    'no archive value became a customer fact'
  )
  assert.deepEqual(
    brief.missing.map((m) => m.key).sort(),
    ['about', 'address', 'testimonials'],
    'every one of them is visible as a gap instead'
  )
  for (const gap of brief.missing) assert.equal(gap.why, 'demo-only')
  assert.equal(brief.status, 'needs_input')
  // And the archive is still recorded as a source, so the gap can be explained rather than guessed.
  assert.equal(
    brief.sources.some((s) => s.kind === 'release-demo'),
    true
  )
})

test('a claim on the never-inferred list surfaces even when no question asked for it', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' }
    ]),
    demoFacts: ['prices']
  })
  assert.equal(NEVER_INFERRED.includes('prices'), true)
  assert.deepEqual(brief.missing, [{ key: 'prices', why: 'demo-only' }])
})

test('two sources that disagree keep BOTH values and block, rather than one winning', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' },
      { questionId: 'q-phone', key: 'phone', value: '0900 555 012' }
    ]),
    chat: [{ messageId: 'm-9', facts: [{ key: 'phone', value: '0900 555 034' }] }]
  })
  assert.equal(brief.status, 'needs_input')
  const conflict = brief.conflicts.find((c) => c.key === 'phone')
  assert.deepEqual(conflict.values.map((v) => v.value).sort(), ['0900 555 012', '0900 555 034'])
  // Both sides keep their provenance, so the follow-up question can quote them.
  for (const side of conflict.values) assert.equal(side.factRefs.length, 1)
  assert.equal(
    brief.facts.some((f) => f.key === 'phone'),
    false
  )
})

test('two sources that agree are one fact citing both', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' }
    ]),
    chat: [{ messageId: 'm-9', facts: [{ key: 'about', value: 'Bakery' }] }]
  })
  const about = brief.facts.find((f) => f.key === 'about')
  assert.equal(about.factRefs.length, 2)
  assert.equal(brief.status, 'ready')
})

test('raw chat prose is a source, never a fact — extracting facts is not this step', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' }
    ]),
    chat: [{ messageId: 'm-1', at: '2026-09-22T01:00:00.000Z' }]
  })
  assert.equal(
    brief.sources.some((s) => s.kind === 'chat' && s.ref === 'm-1'),
    true
  )
  assert.equal(brief.facts.length, 2)
})

test('the brief hash is the identity of its content, not of the moment it was built', () => {
  const answers = fromTypedAnswers([
    { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
    { questionId: 'q-about', key: 'about', value: 'Bakery' }
  ])
  const a = base({ answers, createdAt: '2026-09-22T00:00:00.000Z' })
  const b = base({ answers, createdAt: '2027-01-01T00:00:00.000Z' })
  assert.equal(a.hash, b.hash)
  const changed = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Tám' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' }
    ])
  })
  assert.notEqual(a.hash, changed.hash)
})

test('a brief is normalized against server-held identity, never against its own content', () => {
  assert.throws(() => normalizeBrief({ build: {}, release: RELEASE, locales: LOCALES }), /build context/)
  assert.throws(
    () => normalizeBrief({ build: BUILD, release: { tag: 'x' }, locales: LOCALES }),
    /capability snapshot/
  )
})

test('the required fact keys come from the capability snapshot, not from a list in this code', () => {
  assert.deepEqual(requiredFactKeys(CAPABILITIES), ['name', 'about'])
  assert.deepEqual(requiredFactKeys(null), [])
})

test('pages and their blocks are carried from the snapshot', () => {
  const brief = base({
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery' }
    ])
  })
  assert.deepEqual(brief.pages, [
    { key: 'page:home', label: 'Home', role: 'home', blocks: [{ key: 'block:hero', role: 'hero', can: [] }] }
  ])
})

test('a brief with gaps can never be marked ready', () => {
  const brief = base({ answers: fromTypedAnswers([{ questionId: 'q-name', key: 'name', value: 'X' }]) })
  const forged = { ...brief, status: 'ready' }
  const check = validateSiteBrief(forged)
  assert.equal(check.ok, false)
  assert.equal(
    check.errors.some((e) => e.code === 'ready-with-gaps'),
    true
  )
})

/**
 * WHAT A TYPED ANSWER IS FILED UNDER. Measured 22/09/2026 on session A's generated questionnaire
 * (`tracy-apple/j6#gen-mucwqooe-fv9l`, `tracy-questions/v2`, commit 17743927c): a question carries
 * BOTH `feeds: ['site.name','agent']` and `capabilityRefs: ['core:name']`. Filing under `feeds`
 * produced four facts AND `missing: [about, contact, name, tone]` at the same time — the customer
 * had answered every one. The vocabulary of a fact is the snapshot's `core:` row with its prefix
 * stripped, so these tests pin the whole priority chain, each rung on its own.
 */

test('a `core:` capability ref wins over `feeds` — the fact is `name`, never `site.name`', () => {
  const [answer] = fromTypedAnswers([
    {
      questionId: 'q-name',
      value: 'Xưởng Mộc An Hòa',
      feeds: ['site.name', 'agent'],
      capabilityRefs: ['core:name']
    }
  ])
  assert.equal(answer.key, 'name')
  // Reverse the priority and this is what you get instead — the spelling `requiredFactKeys` can
  // never match, which is exactly how the measured brief reported `name` as missing.
  assert.notEqual(answer.key, 'site.name')
})

test('an explicit `key` wins over both the capability ref and `feeds`', () => {
  const [answer] = fromTypedAnswers([
    {
      questionId: 'q-name',
      key: 'x',
      value: 'Xưởng Mộc An Hòa',
      feeds: ['site.name', 'agent'],
      capabilityRefs: ['core:name']
    }
  ])
  assert.equal(answer.key, 'x')
})

test('with no `core:` ref the key falls back to the `feeds` entry that is not `agent`', () => {
  const [answer] = fromTypedAnswers([
    { questionId: 'q-about', value: 'Bakery', feeds: ['agent', 'copy.about'] }
  ])
  assert.equal(answer.key, 'copy.about')
})

test('`agent` is routing, not a name — a question feeding only the chat falls back to its id', () => {
  const [answer] = fromTypedAnswers([{ questionId: 'q-sector', value: 'craft', feeds: ['agent'] }])
  assert.equal(answer.key, 'q-sector')
  assert.notEqual(answer.key, 'agent')
})

test('a capability ref that is not `core:` is not a fact vocabulary and is never stripped', () => {
  // `block:module-178` names a place on the page, not a thing the customer said.
  const [viaFeeds] = fromTypedAnswers([
    {
      questionId: 'q-sector',
      value: 'craft',
      feeds: ['agent', 'sector'],
      capabilityRefs: ['block:module-178']
    }
  ])
  assert.equal(viaFeeds.key, 'sector')
  const [viaQuestionId] = fromTypedAnswers([
    { questionId: 'q-hero', value: 'craft', feeds: ['agent'], capabilityRefs: ['block:module-178'] }
  ])
  assert.equal(viaQuestionId.key, 'q-hero')
  assert.equal(viaQuestionId.key.startsWith('module-178'), false)
})

test('`capabilityRefs` and `feeds` ride along on the answer but are not the fact it becomes', () => {
  const answers = fromTypedAnswers([
    {
      questionId: 'q-name',
      key: 'name',
      value: 'Xưởng Mộc An Hòa',
      feeds: ['site.name', 'agent'],
      capabilityRefs: ['core:name']
    },
    { questionId: 'q-about', key: 'about', value: 'Đồ gỗ đặt riêng' }
  ])
  // Kept, so a later step can route the answer without re-reading the questionnaire.
  assert.deepEqual(answers[0].capabilityRefs, ['core:name'])
  assert.deepEqual(answers[0].feeds, ['site.name', 'agent'])
  const brief = base({ answers })
  assert.deepEqual(
    brief.facts.map((f) => f.key).sort(),
    ['about', 'name'],
    'neither array leaked into the fact keys'
  )
  assert.equal(brief.status, 'ready')
})

test("REGRESSION — session A's four answers leave only `tone` missing, not all four of them", () => {
  // The snapshot of the measured run: four `core:` rows, so four required fact keys.
  const capabilities = {
    schemaVersion: 'tracy-capabilities/v1',
    capabilities: [
      { key: 'core:name', kind: 'core', label: 'The business name' },
      { key: 'core:about', kind: 'core', label: 'What the business does' },
      { key: 'core:contact', kind: 'core', label: 'How to reach the business' },
      { key: 'core:tone', kind: 'core', label: 'How the site should sound' }
    ]
  }
  // The four questions A generated, each carrying BOTH fields exactly as measured.
  const answers = fromTypedAnswers([
    {
      questionId: 'q-name',
      value: 'Xưởng Mộc An Hòa',
      feeds: ['site.name', 'agent'],
      capabilityRefs: ['core:name']
    },
    {
      questionId: 'q-sector',
      value: 'craft',
      feeds: ['agent', 'sector'],
      capabilityRefs: ['block:module-178']
    },
    {
      questionId: 'q-about',
      value: 'Xưởng mộc gia đình ở Hội An, làm đồ gỗ đặt riêng',
      feeds: ['site.about', 'agent'],
      capabilityRefs: ['core:about']
    },
    {
      questionId: 'q-contact',
      value: 'an-hoa@example.test · 0905 123 456',
      feeds: ['site.contact', 'agent'],
      capabilityRefs: ['core:contact']
    }
  ])
  const brief = normalizeBrief({
    build: BUILD,
    release: RELEASE,
    capabilities,
    locales: LOCALES,
    createdAt: '2026-09-22T00:00:00.000Z',
    answers
  })
  assert.equal(validateSiteBrief(brief).ok, true)
  assert.equal(brief.facts.length, 4)
  assert.deepEqual(
    brief.facts.map((f) => f.key),
    ['about', 'contact', 'name', 'sector']
  )
  // A's questionnaire never asked for tone, and that is the ONLY gap. Before the fix this read
  // `[about, contact, name, tone]` while those same four facts sat in the brief.
  assert.deepEqual(brief.missing, [{ key: 'tone', why: 'never-supplied' }])
  assert.equal(brief.status, 'needs_input')
})
