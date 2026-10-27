import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../src/invitations/csv.js'

test('CSV preserves quoted commas and multiline fields', () => {
  assert.deepEqual(parseCsv({ csvBytes: Buffer.from('id,note\n1,"a,b\nnext"') }).rows, [['1', 'a,b\nnext']])
})

import { createHash } from 'node:crypto'
import { previewCsv, BASELINE_MAPPING } from '../src/invitations/csv.js'
const bytes = (source) => Buffer.from(source)
const catalogue = { version: 'fixture-v1', keys: ['a', 'b', 'c', 'd', 'e'] }
const mapping = { id: 'source_member_id', email: 'email', group: 'group_key', flag: 'global_unsubscribed' }
const preview = (source, extra = {}) =>
  previewCsv({
    csvBytes: bytes(source),
    mapping,
    schemaVersion: 'invitations-v1',
    groupCatalogue: catalogue,
    ...extra
  })

test('raw checksum, parser policy, BOM, escaped quotes, and CRLF are preserved', () => {
  const csvBytes = bytes('\uFEFFid,note\r\n1,"a""b"\r\n')
  const result = parseCsv({ csvBytes: new Uint8Array(csvBytes) })
  assert.deepEqual(result.headers, ['id', 'note'])
  assert.deepEqual(result.rows, [['1', 'a"b']])
  assert.equal(result.sourceChecksum, createHash('sha256').update(csvBytes).digest('hex'))
  assert.equal(result.parserVersion, 'papaparse-5.5.3-csv-v1')
})

test('only physically blank records are skipped', () => {
  assert.deepEqual(parseCsv({ csvBytes: bytes('\nvalue\n\n""\n \n"\n"\n') }).rows, [[''], [' '], ['\n']])
  assert.deepEqual(parseCsv({ csvBytes: bytes('a,b\n,\n\n') }).rows, [['', '']])
})

for (const [name, source, code] of [
  ['empty', '', 'invalid_csv_headers'],
  ['empty header', 'a,\n1,2', 'invalid_csv_headers'],
  ['whitespace header', ' \nx', 'invalid_csv_headers'],
  ['duplicate', 'a,a\n1,2', 'invalid_csv_headers'],
  ['prototype', '__proto__\nx', 'invalid_csv_headers'],
  ['constructor', 'constructor\nx', 'invalid_csv_headers'],
  ['short row', 'a,b\nx', 'invalid_csv_width'],
  ['long row', 'a\nx,y', 'invalid_csv_width'],
  ['unterminated quote', 'a\n"secret@example.test', 'invalid_csv_syntax'],
  ['trailing quote junk', 'a\n"secret@example.test"junk', 'invalid_csv_syntax']
])
  test(`rejects ${name} with safe code`, () => {
    assert.throws(
      () => parseCsv({ csvBytes: bytes(source) }),
      (error) => error instanceof TypeError && error.message === code
    )
  })

test('strict bytes and fatal UTF8 decoding', () => {
  for (const value of ['a', null, [], new Uint16Array([1])])
    assert.throws(() => parseCsv({ csvBytes: value }), /^TypeError: invalid_csv_bytes$/)
  for (const value of [[0xff], [0xc0, 0xaf], [0xe2, 0x82]])
    assert.throws(() => parseCsv({ csvBytes: new Uint8Array(value) }), /^TypeError: invalid_csv_utf8$/)
})

test('bounded column, row, field UTF8, and raw byte limits', () => {
  assert.equal(
    parseCsv({ csvBytes: bytes(Array.from({ length: 100 }, (_, i) => `h${i}`).join(',')) }).headers.length,
    100
  )
  assert.throws(
    () => parseCsv({ csvBytes: bytes(Array.from({ length: 101 }, (_, i) => `h${i}`).join(',')) }),
    /csv_column_limit/
  )
  assert.equal(parseCsv({ csvBytes: bytes('h\n' + Array(10000).fill('x').join('\n')) }).rows.length, 10000)
  assert.throws(
    () => parseCsv({ csvBytes: bytes('h\n' + Array(10001).fill('x').join('\n')) }),
    /csv_row_limit/
  )
  assert.equal(parseCsv({ csvBytes: bytes('h\n' + 'é'.repeat(8192)) }).rows[0][0].length, 8192)
  assert.throws(() => parseCsv({ csvBytes: bytes('h\n' + 'é'.repeat(8193)) }), /csv_field_limit/)
  assert.throws(() => parseCsv({ csvBytes: bytes('x'.repeat(16385)) }), /csv_field_limit/)
  assert.throws(() => parseCsv({ csvBytes: new Uint8Array(10 * 1024 * 1024 + 1) }), /csv_byte_limit/)
})

test('explicit baseline normalization handles mapped flags conservatively', () => {
  assert.equal(Object.hasOwn(BASELINE_MAPPING, 'ten'), false)
  for (const [flag, suppressed, review] of [
    ['co', true, false],
    ['khong', false, false],
    ['', false, true],
    ['unexpected', false, true],
    ['1', false, true]
  ]) {
    const result = preview(`id,email,group,flag\n1,fixture@example.test,a,${flag}`, {
      normalizeBaselineFlags: true
    })
    assert.equal(result.candidates[0].negativeAssertions.globalUnsubscribed, suppressed)
    assert.equal(result.candidates[0].needsReview, review)
  }
  assert.equal(preview('id,email,group,flag\n1,fixture@example.test,a,co').candidates[0].needsReview, true)
  const result = preview('id,email,group,flag\n1,fixture@example.test,a,khong')
  const adapted = preview('id,email,group,flag\n1,fixture@example.test,a,khong', {
    normalizeBaselineFlags: true
  })
  assert.notEqual(result.previewDigest, adapted.previewDigest)
  assert.notEqual(result.previewDigest, result.rowsDigest)
  assert.equal(result.parserVersion, 'papaparse-5.5.3-csv-v1')
  assert.equal(
    result.previewDigest,
    preview('id,email,group,flag\n1,fixture@example.test,a,khong').previewDigest
  )
})

test('catalogue remains caller injected and digest binds raw source and mappings', () => {
  const source = 'id,email,group,flag\n1,fixture@example.test,a,0'
  assert.throws(() => preview(source, { groupCatalogue: undefined }), /invalid_group_catalogue/)
  assert.notEqual(preview(source).previewDigest, preview(source + '\n').previewDigest)
  assert.notEqual(
    preview(source).previewDigest,
    preview(source, { groupCatalogue: { ...catalogue, version: 'fixture-v2' } }).previewDigest
  )
  assert.notEqual(
    preview(source).previewDigest,
    preview(source, { mapping: { ...mapping, flag: 'internal' } }).previewDigest
  )
  assert.equal(preview(source.replace(',a,', ',unknown,')).counts.rejectedRows, 1)
})

const baselineMapping = {
  user_id: BASELINE_MAPPING.user_id,
  email: BASELINE_MAPPING.email,
  nhom_gui: BASELINE_MAPPING.nhom_gui,
  unsubscribed_toan_bo: BASELINE_MAPPING.unsubscribed_toan_bo,
  noi_bo: BASELINE_MAPPING.noi_bo
}
const baselinePreview = (records) =>
  previewCsv({
    csvBytes: bytes(['user_id,email,nhom_gui,unsubscribed_toan_bo,noi_bo', ...records].join('\n')),
    mapping: baselineMapping,
    schemaVersion: 'invitations-v1',
    groupCatalogue: catalogue,
    normalizeBaselineFlags: true
  })

test('synthetic 1340-row baseline preserves five group counts and conservative flags', () => {
  const groupCounts = [318, 276, 103, 351, 292]
  let index = 0
  const records = groupCounts.flatMap((count, groupIndex) =>
    Array.from({ length: count }, () => {
      const id = index++
      // Explicitly disjoint synthetic sets; this does not describe a real-source union.
      const optout = id < 22 ? 'co' : 'khong'
      const internal = id >= 22 && id < 43 ? 'co' : ''
      return `fixture-${id},fixture-${id}@example.test,${catalogue.keys[groupIndex]},${optout},${internal}`
    })
  )
  const result = baselinePreview(records)
  assert.deepEqual(result.counts, {
    inputRows: 1340,
    uniqueCandidates: 1340,
    rejectedRows: 0,
    conflictCandidates: 0,
    suppressedCandidates: 43,
    recheckCandidates: 1297
  })
  assert.deepEqual(
    catalogue.keys.map(
      (key) => result.candidates.filter((candidate) => candidate.sourceGroup === key).length
    ),
    groupCounts
  )
  assert.equal(
    result.candidates.filter((candidate) => candidate.negativeAssertions.globalUnsubscribed).length,
    22
  )
  assert.equal(result.candidates.filter((candidate) => candidate.negativeAssertions.internal).length, 21)
  assert.equal(result.candidates.filter((candidate) => candidate.needsReview).length, 1319)
  for (const candidate of result.candidates) {
    const id = Number(candidate.identities[0].memberId.slice('fixture-'.length))
    assert.equal(candidate.negativeAssertions.globalUnsubscribed, id < 22)
    assert.equal(candidate.negativeAssertions.internal, id >= 22 && id < 43)
    assert.equal(candidate.needsReview, !(id >= 22 && id < 43))
    assert.ok(['suppressed', 'recheck', 'conflict'].includes(candidate.state))
  }
})

for (const [name, duplicate] of [
  ['invalid email linked by duplicate member ID', 'fixture-1,invalid-address,a,co,khong'],
  ['unknown group linked by duplicate member ID', 'fixture-1,other@example.test,unknown,co,khong'],
  ['invalid member ID linked by duplicate email', ',fixture@example.test,a,co,khong']
]) {
  test(`baseline known optout survives rejected ${name}`, () => {
    const result = baselinePreview(['fixture-1,fixture@example.test,a,khong,khong', duplicate])
    assert.equal(result.counts.rejectedRows, 1)
    assert.equal(result.counts.uniqueCandidates, 1)
    assert.equal(result.candidates[0].normalizedEmail, 'fixture@example.test')
    assert.equal(result.candidates[0].negativeAssertions.globalUnsubscribed, true)
    assert.equal(result.candidates[0].state, 'suppressed')
    assert.deepEqual(result.candidates[0].sourceRows, [2, 3])
    assert.deepEqual(result.candidates[0].identities, [{ source: 'amember', memberId: 'fixture-1' }])
  })
}

for (const source of ['\ufeff\ufeffa\nx\n\ny', 'a\nhello"world', 'a\n"hello" ', 'a\n"hello"\t']) {
  test('strict lexical preflight refuses malformed CSV without silent record loss', () => {
    assert.throws(() => parseCsv({ csvBytes: bytes(source) }), /invalid_csv_syntax/)
  })
}

test('lexical preflight rejects delimiter bombs and bounds escaped field bytes', () => {
  assert.throws(() => parseCsv({ csvBytes: bytes('a\n' + ','.repeat(100000)) }), /csv_column_limit/)
  assert.equal(parseCsv({ csvBytes: bytes('a\n"' + '""'.repeat(16384) + '"') }).rows[0][0].length, 16384)
  assert.throws(() => parseCsv({ csvBytes: bytes('a\n"' + '""'.repeat(16385) + '"') }), /csv_field_limit/)
})

test('lexical boundaries preserve CR records and quoted mixed newlines', () => {
  assert.deepEqual(parseCsv({ csvBytes: bytes('a\rx\r\ry\r') }).rows, [['x'], ['y']])
  assert.deepEqual(parseCsv({ csvBytes: bytes('a\n"x\r\ny\rz\nend"\n') }).rows, [['x\r\ny\rz\nend']])
  assert.throws(() => parseCsv({ csvBytes: bytes('a\nx\ry') }), /invalid_csv_syntax/)
})

test('lexical UTF8 cap counts supplementary Unicode and escaped quote boundaries', () => {
  assert.equal(parseCsv({ csvBytes: bytes('a\n"' + '😀'.repeat(4096) + '"') }).rows[0][0].length, 8192)
  assert.throws(() => parseCsv({ csvBytes: bytes('a\n"' + '😀'.repeat(4096) + '"""') }), /csv_field_limit/)
  assert.deepEqual(parseCsv({ csvBytes: bytes('a,b\n"",","\n') }).rows, [['', ',']])
})
