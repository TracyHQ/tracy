import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { previewRows } from '../src/invitations/import.js'

const catalogue = { version: 'fixture-v1', keys: ['one', 'two', 'three', 'four', 'five'] }
const headers = ['Email', 'Member', 'Group', 'Name', 'Plan', 'Evidence', 'Unsub', 'Internal']
const mapping = {
  Email: 'email',
  Member: 'source_member_id',
  Group: 'group_key',
  Name: 'first_name',
  Plan: 'plan',
  Evidence: 'basis_evidence_ref',
  Unsub: 'global_unsubscribed',
  Internal: 'internal'
}
const row = (changes = {}) => {
  const values = {
    Email: 'person@example.test',
    Member: 'm-1',
    Group: 'one',
    Name: 'Fixture',
    Plan: 'annual',
    Evidence: 'basis-fixture',
    Unsub: '',
    Internal: '',
    ...changes
  }
  return headers.map((header) => values[header])
}
const preview = (overrides = {}) =>
  previewRows({
    headers,
    mapping,
    rows: [row()],
    sourceChecksum: 'a'.repeat(64),
    schemaVersion: 'invitations-v1',
    groupCatalogue: catalogue,
    ...overrides
  })

test('retains the five caller supplied groups as recheck candidates with provenance', () => {
  const result = preview({
    rows: catalogue.keys.map((Group, index) =>
      row({ Group, Email: `fixture${index}@example.test`, Member: `member-${index}` })
    )
  })
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.sourceGroup),
    catalogue.keys
  )
  assert.deepEqual(result.counts, {
    inputRows: 5,
    uniqueCandidates: 5,
    rejectedRows: 0,
    conflictCandidates: 0,
    suppressedCandidates: 0,
    recheckCandidates: 5
  })
  assert.equal(result.parserVersion, 'rows-v1')
  assert.equal(result.schemaVersion, 'invitations-v1')
  assert.equal(result.sourceChecksum, 'a'.repeat(64))
  const first = result.candidates[0]
  assert.deepEqual(first.identities, [{ source: 'amember', memberId: 'member-0' }])
  assert.deepEqual(first.sourceRows, [2])
  assert.deepEqual(first.originalEmails, ['fixture0@example.test'])
  assert.equal(first.suggestedGroup, null)
  assert.equal(first.state, 'recheck')
  assert.equal('previewId' in result || 'jobId' in result || 'committed' in result, false)
})

test('strips unmapped fields and retains only allowlisted personalization', () => {
  const result = preview({ headers: [...headers, 'Ignored'], rows: [[...row(), 'secret-fixture']] })
  assert.deepEqual(result.candidates[0].personalization, {
    first_name: 'Fixture',
    plan: 'annual',
    last_template: '',
    company: '',
    website: '',
    basis_evidence_ref: 'basis-fixture'
  })
  assert.equal(JSON.stringify(result).includes('secret-fixture'), false)
})

test('normalizes ASCII email case and margins while preserving dots and plus tags', () => {
  const candidate = preview({ rows: [row({ Email: '  Fi.X+tag@Example.TEST  ', Member: ' opaque:001 ' })] })
    .candidates[0]
  assert.equal(candidate.normalizedEmail, 'fi.x+tag@example.test')
  assert.deepEqual(candidate.originalEmails, ['  Fi.X+tag@Example.TEST  '])
  assert.deepEqual(candidate.identities, [{ source: 'amember', memberId: 'opaque:001' }])
})

for (const email of [
  'a b@example.test',
  'Name <a@example.test>',
  'a@example.test,b@example.test',
  'a\n@example.test',
  'a@-example.test',
  'a@example..test',
  '.a@example.test',
  'a..b@example.test',
  'é@example.test',
  'a@localhost',
  'a@exa_mple.test',
  `${'a'.repeat(65)}@example.test`,
  `a@${'a'.repeat(64)}.test`,
  `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}.test`
]) {
  test(`rejects unsafe or unsupported email fixture ${JSON.stringify(email)}`, () => {
    const result = preview({ rows: [row({ Email: email })] })
    assert.equal(result.candidates.length, 0)
    assert.equal(result.counts.rejectedRows, 1)
    assert.deepEqual(result.issues, [{ row: 2, code: 'invalid_email' }])
  })
}

test('merges identical duplicate emails without collapsing distinct opaque identities', () => {
  const result = preview({ rows: [row(), row({ Email: ' PERSON@example.test ', Member: 'm-2' })] })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].state, 'recheck')
  assert.deepEqual(result.candidates[0].sourceRows, [2, 3])
  assert.deepEqual(result.candidates[0].identities, [
    { source: 'amember', memberId: 'm-1' },
    { source: 'amember', memberId: 'm-2' }
  ])
})

for (const change of [{ Name: 'Other' }, { Plan: 'monthly' }, { Group: 'two' }, { Evidence: 'other-ref' }]) {
  test(`marks content disagreement as conflict for ${Object.keys(change)[0]}`, () => {
    const result = preview({ rows: [row(), row(change)] })
    assert.equal(result.candidates[0].state, 'conflict')
    assert.equal(result.candidates[0].variants.length, 2)
    assert.equal(result.counts.conflictCandidates, 1)
    assert.ok(result.candidates[0].conflicts.includes('content_conflict'))
    if (change.Group) assert.equal(result.candidates[0].sourceGroup, null)
    if (change.Name) assert.equal(result.candidates[0].personalization.first_name, null)
  })
}

for (const target of ['company', 'website', 'last_template']) {
  test(`marks ${target} disagreement as conflict without choosing its first value`, () => {
    const result = preview({
      headers: [...headers, 'Extra'],
      mapping: { ...mapping, Extra: target },
      rows: [
        [...row(), 'first-fixture'],
        [...row(), 'second-fixture']
      ]
    })
    assert.equal(result.candidates[0].state, 'conflict')
    assert.equal(result.candidates[0].personalization[target], null)
  })
}

test('marks every candidate when one member ID has multiple valid emails', () => {
  const result = preview({ rows: [row(), row({ Email: 'other@example.test' })] })
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.state),
    ['conflict', 'conflict']
  )
  assert.ok(result.candidates.every((candidate) => candidate.conflicts.includes('identity_conflict')))
})

test('preserves identity conflicts introduced by a rejected duplicate row', () => {
  const result = preview({
    rows: [
      row(),
      row({ Member: 'm-2', Group: 'unknown' }),
      row({ Member: 'm-2', Email: 'other@example.test' })
    ]
  })
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.state),
    ['conflict', 'conflict']
  )
  assert.ok(result.candidates.every((candidate) => candidate.conflicts.includes('identity_conflict')))
})

for (const rejectedFirst of [false, true]) {
  test(`keeps rejected duplicate identities and provenance when rejected row is ${rejectedFirst ? 'first' : 'last'}`, () => {
    const accepted = row()
    const rejected = row({
      Email: ' PERSON@example.test ',
      Member: 'm-2',
      Group: 'unknown',
      Name: 'rejected-name',
      Plan: 'rejected-plan'
    })
    const result = preview({ rows: rejectedFirst ? [rejected, accepted] : [accepted, rejected] })
    const candidate = result.candidates[0]
    assert.deepEqual(
      candidate.identities.map((identity) => identity.memberId),
      rejectedFirst ? ['m-2', 'm-1'] : ['m-1', 'm-2']
    )
    assert.deepEqual(candidate.sourceRows, [2, 3])
    assert.deepEqual(
      candidate.originalEmails,
      rejectedFirst
        ? [' PERSON@example.test ', 'person@example.test']
        : ['person@example.test', ' PERSON@example.test ']
    )
    assert.equal(candidate.sourceGroup, 'one')
    assert.equal(candidate.personalization.first_name, 'Fixture')
    assert.equal(candidate.personalization.plan, 'annual')
    assert.equal(candidate.variants.length, 1)
    assert.deepEqual(candidate.variants[0].sourceRows, [rejectedFirst ? 3 : 2])
    assert.equal(JSON.stringify(candidate).includes('rejected-name'), false)
    assert.equal(JSON.stringify(candidate).includes('rejected-plan'), false)
    assert.equal(candidate.state, 'recheck')
  })
}

test('keeps every known identity and source row through rejected email and member links', () => {
  const result = preview({
    rows: [
      row(),
      row({ Member: 'm-2', Group: 'unknown' }),
      row({ Email: 'other@example.test', Member: 'm-2', Group: 'unknown' }),
      row({ Email: 'other@example.test', Member: 'm-3' }),
      row({ Email: 'invalid email', Member: 'm-3', Group: 'unknown', Internal: 'true' })
    ]
  })
  assert.equal(result.candidates.length, 2)
  for (const candidate of result.candidates) {
    assert.deepEqual(candidate.identities, [
      { source: 'amember', memberId: 'm-1' },
      { source: 'amember', memberId: 'm-2' },
      { source: 'amember', memberId: 'm-3' }
    ])
    assert.deepEqual(candidate.sourceRows, [2, 3, 4, 5, 6])
    assert.equal(candidate.variants.length, 1)
    assert.deepEqual(candidate.negativeAssertions, { globalUnsubscribed: false, internal: true })
    assert.equal(candidate.state, 'suppressed')
  }
})

test('rejects non-enumerable mapping targets before they can overwrite a validated email', () => {
  const hiddenMapping = { ...mapping }
  Object.defineProperty(hiddenMapping, 'Hidden', { value: 'email', enumerable: false })
  assert.throws(
    () =>
      preview({
        headers: [...headers, 'Hidden'],
        mapping: hiddenMapping,
        rows: [[...row(), 'overwrite@example.test']]
      }),
    (error) => error instanceof TypeError && error.message === 'invalid_mapping'
  )
})

test('rejects sparse headers instead of treating missing columns as unmapped', () => {
  const sparse = [...headers, 'Ignored']
  delete sparse[8]
  assert.throws(() => preview({ headers: sparse, rows: [[...row(), '']] }), TypeError)
})

test('rejects a sparse catalogue instead of treating its hole as a fifth group', () => {
  const keys = [...catalogue.keys]
  delete keys[4]
  assert.throws(() => preview({ groupCatalogue: { version: 'v1', keys } }), TypeError)
})

test('preserves negatives from rejected duplicates by either email or member ID', () => {
  const result = preview({
    rows: [row(), row({ Member: '', Unsub: 'YES' }), row({ Email: 'invalid email', Internal: '1' })]
  })
  assert.deepEqual(result.candidates[0].negativeAssertions, { globalUnsubscribed: true, internal: true })
  assert.equal(result.candidates[0].state, 'suppressed')
  assert.equal(result.counts.rejectedRows, 2)
  assert.equal(result.counts.suppressedCandidates, 1)
})

test('suppresses all emails sharing a negative member identity while preserving conflicts', () => {
  const result = preview({ rows: [row(), row({ Email: 'other@example.test', Unsub: 'true' })] })
  assert.ok(result.candidates.every((candidate) => candidate.state === 'suppressed'))
  assert.ok(result.candidates.every((candidate) => candidate.conflicts.includes('identity_conflict')))
})

for (const value of ['1', 'true', 'yes', '0', 'false', 'no', '']) {
  test(`interprets the explicit negative assertion fixture ${JSON.stringify(value)}`, () => {
    const result = preview({ rows: [row({ Unsub: value, Internal: value })] })
    const expected = ['1', 'true', 'yes'].includes(value)
    assert.deepEqual(result.candidates[0].negativeAssertions, {
      globalUnsubscribed: expected,
      internal: expected
    })
    assert.equal(result.candidates[0].state, expected ? 'suppressed' : 'recheck')
    assert.deepEqual(result.issues, [])
  })
}

test('retains invalid flag uncertainty for downstream review without treating it as verified false', () => {
  const result = preview({ rows: [row({ Unsub: 'perhaps' }), row({ Unsub: 'false' })] })
  assert.equal(result.candidates[0].state, 'recheck')
  assert.equal(result.candidates[0].needsReview, true)
  assert.deepEqual(result.issues, [{ row: 2, code: 'invalid_global_unsubscribed' }])
})

test('retains invalid flag uncertainty from rejected rows matching a known identity', () => {
  const result = preview({ rows: [row(), row({ Group: 'missing', Internal: 'perhaps' })] })
  assert.equal(result.candidates[0].needsReview, true)
  assert.equal(result.counts.rejectedRows, 1)
})

test('rejects empty member and unknown groups with issues containing only row and code', () => {
  const result = preview({ rows: [row({ Member: ' ' }), row({ Group: 'unknown-fixture' })] })
  assert.deepEqual(result.issues, [
    { row: 2, code: 'invalid_member_id' },
    { row: 3, code: 'unknown_group' }
  ])
  assert.equal(result.counts.rejectedRows, 2)
  assert.ok(result.issues.every((issue) => Object.keys(issue).join(',') === 'row,code'))
  assert.equal(JSON.stringify(result.issues).includes('unknown-fixture'), false)
})

const malformed = [
  { headers: 'Email' },
  { headers: [] },
  { headers: ['Email', 'Email'] },
  { headers: ['__proto__'] },
  { headers: [42] },
  { rows: 'raw,csv' },
  { rows: [null] },
  { rows: [row().slice(1)] },
  { rows: [[...row().slice(0, -1), 1]] },
  { mapping: null },
  { mapping: { ...mapping, Missing: 'company' } },
  { mapping: { ...mapping, Name: 'email' } },
  { mapping: { ...mapping, Name: 'unknown' } },
  { mapping: { ...mapping, Name: 'constructor' } },
  { mapping: Object.fromEntries([['__proto__', 'email']]) },
  { mapping: Object.create({ inherited: 'email' }) },
  { mapping: { Email: 'email' } },
  { schemaVersion: 'invitations-v2' },
  { sourceChecksum: 'not-a-checksum' },
  { groupCatalogue: { version: '', keys: catalogue.keys } },
  { groupCatalogue: { version: 'v', keys: ['one', 'one', 'two', 'three', 'four'] } },
  { groupCatalogue: { version: 'v', keys: catalogue.keys.slice(1) } },
  { groupCatalogue: { version: 'v', keys: ['one', 'two', 'three', 'four', 5] } },
  { headers: Array.from({ length: 101 }, (_, index) => `header-${index}`) },
  { rows: Array.from({ length: 10001 }, () => row()) },
  { rows: [row({ Name: 'é'.repeat(8193) })] }
]
malformed.forEach((input, index) =>
  test(`rejects malformed input fixture ${index} before producing a preview`, () => {
    assert.throws(
      () => preview(input),
      (error) => error instanceof TypeError && /^[a-z_]+$/.test(error.message)
    )
  })
)

test('accepts limits at exactly 100 columns and 16384 UTF-8 bytes per field', () => {
  const extraHeaders = Array.from({ length: 92 }, (_, index) => `ignored-${index}`)
  const result = preview({
    headers: [...headers, ...extraHeaders],
    rows: [[...row({ Name: 'é'.repeat(8192) }), ...extraHeaders.map(() => '')]]
  })
  assert.equal(result.candidates.length, 1)
})

test('accepts exactly 10000 input records', () => {
  const result = preview({ rows: Array.from({ length: 10000 }, () => row()) })
  assert.equal(result.counts.inputRows, 10000)
  assert.equal(result.counts.uniqueCandidates, 1)
})

test('preserves complete provenance and negative assertions at 100000 expanded references', () => {
  // 250 candidates each retain one member identity and all 399 source rows.
  const uniqueRows = Array.from({ length: 250 }, (_, index) =>
    row({ Email: `fixture${index}@example.test`, Unsub: 'true', Internal: 'true' })
  )
  const rows = [...uniqueRows, ...Array.from({ length: 149 }, () => [...uniqueRows[0]])]
  const result = preview({ rows })
  const sourceRows = Array.from({ length: 399 }, (_, index) => index + 2)
  assert.equal(result.counts.inputRows, 399)
  assert.equal(result.counts.uniqueCandidates, 250)
  assert.equal(result.counts.suppressedCandidates, 250)
  for (const candidate of result.candidates) {
    assert.deepEqual(candidate.identities, [{ source: 'amember', memberId: 'm-1' }])
    assert.deepEqual(candidate.sourceRows, sourceRows)
    assert.deepEqual(candidate.negativeAssertions, { globalUnsubscribed: true, internal: true })
    assert.equal(candidate.state, 'suppressed')
    assert.deepEqual(candidate.conflicts, ['identity_conflict'])
  }
  assert.deepEqual(result.candidates[0].variants[0].sourceRows, [
    2,
    ...Array.from({ length: 149 }, (_, index) => index + 252)
  ])
  assert.deepEqual(
    result.issues,
    sourceRows.map((row) => ({ row, code: 'identity_conflict' }))
  )
  assert.match(result.previewDigest, /^[a-f0-9]{64}$/)
})

test('rejects 100250 expanded references instead of returning a partial preview', () => {
  // One more duplicate raises the boundary fixture to 250 * (400 + 1).
  const uniqueRows = Array.from({ length: 250 }, (_, index) => row({ Email: `fixture${index}@example.test` }))
  const rows = [...uniqueRows, ...Array.from({ length: 150 }, () => [...uniqueRows[0]])]
  assert.throws(
    () => preview({ rows }),
    (error) => error instanceof TypeError && error.message === 'preview_expansion_limit'
  )
})

test('counts every member identity toward the expanded reference limit', () => {
  // 250 candidates retain 399 source rows and two member identities: 100250 references.
  const uniqueRows = Array.from({ length: 250 }, (_, index) => row({ Email: `fixture${index}@example.test` }))
  const rows = [
    ...uniqueRows,
    ...Array.from({ length: 148 }, () => [...uniqueRows[0]]),
    row({ Email: 'fixture0@example.test', Member: 'm-2' })
  ]
  assert.throws(
    () => preview({ rows }),
    (error) => error instanceof TypeError && error.message === 'preview_expansion_limit'
  )
})

test('applies the expanded reference budget across disconnected components', () => {
  // Each component uses 200 * (250 + 1) = 50200 references; together they use 100400.
  const rows = ['m-1', 'm-2'].flatMap((Member, component) => {
    const uniqueRows = Array.from({ length: 200 }, (_, index) =>
      row({ Email: `fixture${component}-${index}@example.test`, Member })
    )
    return [...uniqueRows, ...Array.from({ length: 50 }, () => [...uniqueRows[0]])]
  })
  assert.throws(
    () => preview({ rows }),
    (error) => error instanceof TypeError && error.message === 'preview_expansion_limit'
  )
})

test('binds the digest to mapping, catalogue version, keys, source checksum, and normalized content', () => {
  const baseline = preview()
  assert.match(baseline.previewDigest, /^[a-f0-9]{64}$/)
  assert.equal(preview().previewDigest, baseline.previewDigest)
  assert.equal(
    preview({ mapping: Object.fromEntries(Object.entries(mapping).reverse()) }).previewDigest,
    baseline.previewDigest
  )
  for (const changes of [
    { mapping: { ...mapping, Name: 'company' } },
    { groupCatalogue: { ...catalogue, version: 'fixture-v2' } },
    { groupCatalogue: { ...catalogue, keys: ['one', 'two', 'three', 'four', 'different'] } },
    { sourceChecksum: 'b'.repeat(64) },
    { rows: [row({ Plan: 'monthly' })] }
  ]) {
    assert.notEqual(preview(changes).previewDigest, baseline.previewDigest)
  }
})

test('does not mutate caller owned rows, mapping, or catalogue', () => {
  const input = {
    headers: [...headers],
    rows: [row()],
    mapping: { ...mapping },
    sourceChecksum: 'a'.repeat(64),
    schemaVersion: 'invitations-v1',
    groupCatalogue: { version: catalogue.version, keys: [...catalogue.keys] }
  }
  const before = structuredClone(input)
  previewRows(input)
  assert.deepEqual(input, before)
})

test('rejects bounded long-identity amplification before returning any preview', () => {
  // Only 59 rows and 1830 references, but repeated 16 KiB IDs exceed the byte budget.
  const shared = 's'.repeat(16384)
  const rows = [
    ...Array.from({ length: 30 }, (_, index) => row({ Email: `byte${index}@example.test`, Member: shared })),
    ...Array.from({ length: 29 }, (_, index) =>
      row({ Email: 'byte0@example.test', Member: `${index}:` + 'x'.repeat(16380), Unsub: 'true' })
    )
  ]
  assert.throws(
    () => preview({ rows }),
    (error) => error instanceof TypeError && error.message === 'preview_byte_limit'
  )
})

function byteRows(memberText, component = 0) {
  return [
    ...Array.from({ length: 30 }, (_, index) =>
      row({ Email: `budget${component}-${index}@example.test`, Member: memberText })
    ),
    ...Array.from({ length: 29 }, (_, index) =>
      row({ Email: `budget${component}-0@example.test`, Member: `${index}:${memberText}`, Internal: 'true' })
    )
  ]
}

for (const text of ['x'.repeat(9000), 'é'.repeat(4500)]) {
  test(`preserves long ${text[0] === 'x' ? 'ASCII' : 'multibyte'} identities below the projected byte boundary`, () => {
    const rows = byteRows(text)
    const result = preview({ rows })
    assert.equal(result.candidates.length, 30)
    for (const candidate of result.candidates) {
      assert.equal(candidate.identities.length, 30)
      assert.equal(candidate.identities[0].memberId, text)
      assert.equal(candidate.sourceRows.length, 59)
      assert.equal(candidate.negativeAssertions.internal, true)
    }
    assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 8 * 1024 * 1024)
  })
}

for (const text of ['x'.repeat(10000), 'é'.repeat(5000), '\u0000'.repeat(2000)]) {
  test(`rejects projected ${text[0] === 'x' ? 'ASCII' : text[0] === 'é' ? 'UTF-8' : 'JSON escaping'} byte amplification`, () => {
    assert.throws(
      () => preview({ rows: byteRows(text) }),
      (error) => error.message === 'preview_byte_limit'
    )
  })
}

test('charges bytes across disconnected components rather than per component', () => {
  const first = byteRows('x'.repeat(5000))
  const second = byteRows('y'.repeat(5000), 1)
  assert.equal(preview({ rows: first }).candidates.length, 30)
  assert.equal(preview({ rows: second }).candidates.length, 30)
  assert.throws(
    () => preview({ rows: [...first, ...second] }),
    (error) => error.message === 'preview_byte_limit'
  )
})

test('charges personalization twice in candidates and variants in both payloads', () => {
  const fullHeaders = [...headers, 'Company', 'Website', 'Template']
  const fullMapping = { ...mapping, Company: 'company', Website: 'website', Template: 'last_template' }
  const text = 'x'.repeat(16384)
  const rows = Array.from({ length: 50 }, (_, index) => [
    ...row({
      Email: `content${index}@example.test`,
      Member: `m-${index}`,
      Name: text,
      Plan: text,
      Evidence: text
    }),
    text,
    text,
    text
  ])
  assert.throws(
    () => preview({ headers: fullHeaders, mapping: fullMapping, rows }),
    (error) => error.message === 'preview_byte_limit'
  )
})

test('budgets digest metadata even when every row is absent', () => {
  assert.throws(
    () => preview({ rows: [], groupCatalogue: { ...catalogue, version: '\u0000'.repeat(3 * 1024 * 1024) } }),
    (error) => error.message === 'preview_byte_limit'
  )
})

test('rejects escaped metadata before constructing JSON text', () => {
  const version = '\u0000'.repeat(3 * 1024 * 1024)
  const stringify = JSON.stringify
  JSON.stringify = (value, ...args) => {
    assert.notEqual(value, version, 'over-budget metadata must not be escaped into a temporary string')
    return stringify(value, ...args)
  }
  try {
    assert.throws(
      () => preview({ rows: [], groupCatalogue: { ...catalogue, version } }),
      (error) => error.message === 'preview_byte_limit'
    )
  } finally {
    JSON.stringify = stringify
  }
})

for (const [name, token, bytes] of [
  ['surrogate pair', '😀', 4],
  ['lone high surrogate', '\ud800', 6],
  ['lone low surrogate', '\udc00', 6],
  ['quote', '"', 2],
  ['backslash', '\\', 2],
  ['short control escape', '\n', 2]
]) {
  test(`counts ${name} JSON bytes at the projected boundary`, () => {
    // Keep whitespace controls inside opaque IDs so trimming preserves them.
    const accepted = `x${token.repeat(Math.floor(9000 / bytes))}x`
    const rejected = `x${token.repeat(Math.ceil(10000 / bytes))}x`
    const result = preview({ rows: byteRows(accepted) })
    assert.equal(result.candidates[0].identities[0].memberId, accepted)
    assert.throws(
      () => preview({ rows: byteRows(rejected) }),
      (error) => error.message === 'preview_byte_limit'
    )
  })
}

test('accepts the last whole identity byte below the budget and rejects the next byte', () => {
  // A one-byte increase is repeated across all 30 x 30 identities in both payloads.
  const smallHeaders = ['Email', 'Member', 'Group']
  const smallMapping = { Email: 'email', Member: 'source_member_id', Group: 'group_key' }
  const input = (length) => {
    const text = 'x'.repeat(length)
    return {
      headers: smallHeaders,
      mapping: smallMapping,
      groupCatalogue: { ...catalogue, version: 'v' },
      rows: [
        ...Array.from({ length: 30 }, (_, index) => [`b${index}@example.test`, text, 'one']),
        ...Array.from({ length: 29 }, (_, index) => ['b0@example.test', `${index}:${text}`, 'one'])
      ]
    }
  }
  assert.equal(preview(input(9242)).candidates[0].identities[0].memberId.length, 9242)
  assert.throws(
    () => preview(input(9243)),
    (error) => error.message === 'preview_byte_limit'
  )
})

test('checks combined metadata and issues budget when all rows are rejected', () => {
  const rows = Array.from({ length: 10000 }, () =>
    row({ Email: 'invalid', Member: '', Group: 'unknown', Unsub: 'invalid', Internal: 'invalid' })
  )
  // A 2.5 MiB synthetic string projects to 15 MiB after JSON escaping.
  const groupCatalogue = { ...catalogue, version: '\u0000'.repeat(2.5 * 1024 * 1024), note: undefined }
  assert.throws(
    () => preview({ rows, groupCatalogue }),
    (error) => error.message === 'preview_byte_limit'
  )
})

for (const [name, note] of [
  ['undefined', undefined],
  ['function', () => {}],
  ['symbol', Symbol('note')]
]) {
  test(`preserves legacy digest for ${name} catalogue metadata`, () => {
    const groupCatalogue = { ...catalogue, note }
    const result = preview({ rows: [], groupCatalogue })
    // Preserve the original canonical contract, including its literal undefined
    // object value; these extras were accepted before byte projection existed.
    function legacyCanonical(value) {
      if (Array.isArray(value)) return `[${value.map(legacyCanonical).join(',')}]`
      if (value && typeof value === 'object') {
        return `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${legacyCanonical(value[key])}`)
          .join(',')}}`
      }
      return JSON.stringify(value)
    }
    const payload = {
      sourceChecksum: 'a'.repeat(64),
      headers,
      mapping,
      schemaVersion: 'invitations-v1',
      groupCatalogue,
      parserVersion: 'rows-v1',
      coreVersion: 'preview-v1',
      candidates: result.candidates,
      issues: result.issues
    }
    assert.equal(result.previewDigest, createHash('sha256').update(legacyCanonical(payload)).digest('hex'))
  })
}
