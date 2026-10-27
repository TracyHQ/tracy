import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateSourcePage, normalizeAmemberFixture } from '../src/invitations/source-contract.js'
import { getSourceFixture } from '../src/invitations/source-fixtures.js'

const anchor = '2026-10-10T12:00:00.000Z'
const document = () => ({
  user_id: 1,
  customer_id: 'amember:1',
  record_version: 1,
  email: 'friend@fixture.test',
  name: { first: 'Synthetic', last: 'Friend', display: 'Synthetic Friend' },
  profile: { company: 'Synthetic Company' },
  membership: { has_active_membership: true, furthest_expires_on: '2026-10-10' },
  consent: { scope: 'amember_only', sendy_included: false, globally_unsubscribed: false }
})
const meta = { schema_version: '1.0', generated_at: anchor, source_timezone: 'UTC' }
const page = async () =>
  getSourceFixture('foundation-ready-v1', { anchor, versionBase: 1 }).snapshotPage({ pageToken: null })

test('source fixture is synthetic and covers five sources without network access', async () => {
  const fixture = getSourceFixture('foundation-ready-v1', { anchor, versionBase: 1 })
  const first = await page()
  assert.equal(validateSourcePage(first).observations.length, 5)
  assert.equal(first.namespace, 'synthetic:invitations:v1')
  assert.equal(first.observations[0].subjectKey, 'sandbox-amember-1')
  assert.deepEqual((await fixture.status()).coverage, [
    'membership',
    'marketingBasis',
    'amember',
    'sendy',
    'tracy'
  ])
  const changes = await fixture.changesPage({ cursor: first.fenceCursor })
  assert.equal(changes.phase, 'changes')
  assert.equal(changes.complete, true)
  assert.throws(() => getSourceFixture('https://not-a-fixture.test', { anchor, versionBase: 1 }), {
    code: 'source_fixture_unknown'
  })
})

for (const [name, mutate, code] of [
  [
    'schema',
    (p) => {
      p.schemaVersion = '2.0'
    },
    'source_schema_invalid'
  ],
  [
    'unsafe version',
    (p) => {
      p.observations[0].sourceVersion = Number.MAX_SAFE_INTEGER + 1
    },
    'source_version_invalid'
  ],
  [
    'real destination',
    (p) => {
      p.observations[0].destination = 'real@example.com'
    },
    'source_identity_invalid'
  ],
  [
    'real alias',
    (p) => {
      p.observations[0].identities.push('member:real-user')
    },
    'source_identity_invalid'
  ],
  [
    'null fact',
    (p) => {
      p.observations[0].fact = null
    },
    'source_fact_invalid'
  ],
  [
    'unknown fact field',
    (p) => {
      p.observations[0].fact.password = 'secret-sentinel'
    },
    'source_fact_invalid'
  ],
  [
    'too many observations',
    (p) => {
      p.observations = Array.from({ length: 201 }, () => p.observations[0])
    },
    'source_page_limit'
  ],
  [
    'too many identities',
    (p) => {
      p.observations[0].identities = Array(33).fill('member:sandbox-1')
    },
    'source_page_limit'
  ],
  [
    'oversize string',
    (p) => {
      p.observations[0].personalization.company = 'x'.repeat(16385)
    },
    'source_page_limit'
  ],
  [
    'unknown page property',
    (p) => {
      p.url = 'https://never-request.test'
    },
    'source_schema_invalid'
  ],
  [
    'malformed timestamp',
    (p) => {
      p.observations[0].fact.checkedAt = '2026-02-31T00:00:00.000Z'
    },
    'source_fact_invalid'
  ]
])
  test(`source page rejects ${name} with a sanitized code`, async () => {
    const value = await page()
    mutate(value)
    assert.throws(
      () => validateSourcePage(value),
      (error) => error.code === code && error.message === code
    )
  })

test('source page bounds total bytes before constructing a serialized copy', async () => {
  const value = await page()
  value.observations = Array.from({ length: 100 }, () => ({
    ...structuredClone(value.observations[0]),
    personalization: { company: 'x'.repeat(16000) }
  }))
  assert.throws(() => validateSourcePage(value), { code: 'source_page_limit' })
})

test('source page rejects accessors without executing them', async () => {
  const value = await page()
  Object.defineProperty(value, 'url', {
    enumerable: true,
    get() {
      throw new Error('getter executed')
    }
  })
  assert.throws(() => validateSourcePage(value), { code: 'source_schema_invalid' })
})

test('explicit tombstone preserves a version marker and has no positive fact', async () => {
  const value = await page()
  value.observations[0].operation = 'delete'
  value.observations[0].fact = null
  assert.equal(validateSourcePage(value).observations[0].sourceVersion, 1)
})

test('source page retains optional CMS personalization for hidden template dependencies', async () => {
  const value = await page()
  value.observations[2].personalization.cms = 'Synthetic CMS'
  assert.equal(validateSourcePage(value).observations[2].personalization.cms, 'Synthetic CMS')
})

test('aMember-only consent never invents marketing permission or Sendy coverage', () => {
  const observations = normalizeAmemberFixture({ document: document(), meta })
  assert.equal(observations.find((o) => o.source === 'membership').fact.status, 'unknown')
  assert.equal(
    observations.some((o) => o.source === 'sendy'),
    false
  )
  assert.equal(
    observations.some((o) => o.source === 'marketingBasis' && o.fact?.value === 'allowed'),
    false
  )
})

test('aMember date-only expiry requires the verified explicit UTC fixture policy', () => {
  const observations = normalizeAmemberFixture({
    document: document(),
    meta,
    datePolicy: { timeZone: 'UTC', expiry: 'exclusive-next-day' }
  })
  const membership = observations.find((o) => o.source === 'membership')
  assert.equal(membership.fact.status, 'known')
  assert.equal(membership.fact.value.expiresAt, '2026-10-11T00:00:00.000Z')
  assert.deepEqual(membership.fact.memberIds, ['sandbox-amember-1'])
  assert.equal(membership.fact.sourceVersion, '1')
})

for (const [name, change, code] of [
  [
    'identity mismatch',
    (d) => {
      d.customer_id = 'amember:2'
    },
    'source_identity_invalid'
  ],
  [
    'unsafe user ID',
    (d) => {
      d.user_id = Number.MAX_SAFE_INTEGER + 1
    },
    'source_identity_invalid'
  ],
  [
    'null membership',
    (d) => {
      d.membership = null
    },
    'source_fact_invalid'
  ],
  [
    'null consent',
    (d) => {
      d.consent = null
    },
    'source_fact_invalid'
  ],
  [
    'unsafe record version',
    (d) => {
      d.record_version = Number.MAX_SAFE_INTEGER + 1
    },
    'source_version_invalid'
  ],
  [
    'real email',
    (d) => {
      d.email = 'person@example.org'
    },
    'source_identity_invalid'
  ]
])
  test(`aMember fixture rejects ${name}`, () => {
    const value = document()
    change(value)
    assert.throws(() => normalizeAmemberFixture({ document: value, meta }), { code })
  })

test('aMember global opt-out survives absent date policy', () => {
  const value = document()
  value.consent.globally_unsubscribed = true
  const observations = normalizeAmemberFixture({ document: value, meta })
  assert.equal(observations.find((o) => o.source === 'amember').fact.value.globalUnsubscribed, true)
  assert.equal(observations.find((o) => o.source === 'membership').fact.status, 'unknown')
})
