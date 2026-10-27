import {
  SOURCE_NAMES,
  SOURCE_NAMESPACE,
  SOURCE_COVERAGE_KEY,
  SOURCE_POLICY,
  sourceError,
  sourceTimestamp,
  safeSourceVersion,
  validateSourcePage
} from './source-contract.js'

export const SOURCE_FIXTURE_IDS = Object.freeze([
  'foundation-ready-v1',
  'foundation-company-v2',
  'foundation-unused-v2',
  'foundation-optout-v2',
  'foundation-email-v2',
  'foundation-unknown-v2'
])

/** Server-owned fixtures only. No environment, credentials, network or mailbox access. */
export function getSourceFixture(id, { anchor, versionBase } = {}) {
  if (!SOURCE_FIXTURE_IDS.includes(id)) throw sourceError('source_fixture_unknown')
  if (!sourceTimestamp(anchor) || !safeSourceVersion(versionBase)) throw sourceError('source_fixture_invalid')
  const subjectKey = 'sandbox-amember-1'
  const destination = id === 'foundation-email-v2' ? 'changed@fixture.test' : 'friend@fixture.test'
  const fenceCursor = `synthetic:checkpoint:${versionBase}`
  const values = [
    { eligible: true, lifetime: true, expiresAt: null },
    'allowed',
    { globalUnsubscribed: id === 'foundation-optout-v2' },
    { state: 'clear', coverage: ['synthetic:list-a'] },
    { suppressed: false }
  ]
  const observations = SOURCE_NAMES.map((source, index) => ({
    source,
    subjectKey,
    sourceVersion: versionBase,
    operation: 'upsert',
    identities: [`member:${subjectKey}`, `email:${destination}`],
    destination,
    fact: {
      status: id === 'foundation-unknown-v2' && source === 'marketingBasis' ? 'unknown' : 'known',
      value: id === 'foundation-unknown-v2' && source === 'marketingBasis' ? null : values[index],
      sourceVersion: String(versionBase),
      memberIds: [subjectKey],
      evidenceRefs: [`synthetic:fixture:${id}`],
      asOf: anchor,
      checkedAt: anchor,
      validUntil: new Date(Date.parse(anchor) + SOURCE_POLICY.maxAgeMs).toISOString()
    },
    personalization: {
      first_name: 'Synthetic Friend',
      company: id === 'foundation-company-v2' ? 'Changed Synthetic Company' : 'Synthetic Company',
      website: id === 'foundation-unused-v2' ? 'https://changed.fixture.test' : 'https://fixture.test'
    },
    evidenceRef: `synthetic:fixture:${id}`
  }))
  const page = (phase, inputToken, entries) =>
    validateSourcePage({
      schemaVersion: '1.0',
      namespace: SOURCE_NAMESPACE,
      coverageKey: SOURCE_COVERAGE_KEY,
      phase,
      fenceCursor,
      inputToken,
      nextToken: phase === 'changes' ? fenceCursor : null,
      complete: true,
      coverage: [...SOURCE_NAMES],
      observations: structuredClone(entries)
    })
  return {
    policy: structuredClone(SOURCE_POLICY),
    namespace: SOURCE_NAMESPACE,
    coverageKey: SOURCE_COVERAGE_KEY,
    async snapshotPage({ pageToken }) {
      if (pageToken !== null) throw sourceError('source_cursor_invalid', 409)
      return page('snapshot', pageToken, observations)
    },
    async changesPage({ cursor }) {
      if (typeof cursor !== 'string' || !cursor.startsWith('synthetic:checkpoint:'))
        throw sourceError('source_cursor_expired', 409)
      return page('changes', cursor, cursor === fenceCursor ? [] : observations)
    },
    async status() {
      return { ready: true, coverage: [...SOURCE_NAMES] }
    }
  }
}
