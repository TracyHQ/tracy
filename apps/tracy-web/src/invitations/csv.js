import { createHash } from 'node:crypto'
import Papa from 'papaparse'
import { previewRows } from './import.js'

const PARSER_VERSION = 'papaparse-5.5.3-csv-v1'
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
export const BASELINE_MAPPING = Object.freeze({
  user_id: 'source_member_id',
  email: 'email',
  nhom_gui: 'group_key',
  goi: 'plan',
  template_tai_gan_nhat: 'last_template',
  cong_ty: 'company',
  website: 'website',
  unsubscribed_toan_bo: 'global_unsubscribed',
  noi_bo: 'internal'
})

function refuse(code) {
  throw new TypeError(code)
}

// Validate syntax and count decoded field bytes/boundaries before PapaParse can
// allocate a record. This scanner never extracts fields or materializes rows.
function preflight(source) {
  if (source.startsWith('\uFEFF')) refuse('invalid_csv_syntax')
  let state = 'start'
  let fieldBytes = 0
  let columns = 1
  let meaningful = false
  let recordCount = 0
  let width
  let newline
  const endRecord = () => {
    if (meaningful) {
      if (width === undefined) width = columns
      else if (columns !== width) refuse('invalid_csv_width')
      recordCount++
      if (recordCount > 10001) refuse('csv_row_limit')
    }
    state = 'start'
    fieldBytes = 0
    columns = 1
    meaningful = false
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (state === 'quoted' && character === '"') {
      if (source[index + 1] === '"') {
        fieldBytes++
        index++
      } else state = 'closed'
    } else if (state !== 'quoted' && character === '"') {
      if (state !== 'start') refuse('invalid_csv_syntax')
      state = 'quoted'
      meaningful = true
    } else if (state !== 'quoted' && character === ',') {
      columns++
      if (columns > 100) refuse('csv_column_limit')
      meaningful = true
      fieldBytes = 0
      state = 'start'
    } else if (state !== 'quoted' && (character === '\r' || character === '\n')) {
      const separator = character === '\r' && source[index + 1] === '\n' ? '\r\n' : character
      // PapaParse parses one explicit record separator. Reject mixed physical
      // separators rather than reinterpret or silently lose source records.
      if (newline && newline !== separator) refuse('invalid_csv_syntax')
      newline = separator
      if (separator.length === 2) index++
      endRecord()
    } else {
      if (state === 'closed') refuse('invalid_csv_syntax')
      if (state === 'start') state = 'unquoted'
      meaningful = true
      const point = source.codePointAt(index)
      fieldBytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
      if (point > 0xffff) index++
    }
    if (fieldBytes > 16384) refuse('csv_field_limit')
  }
  if (state === 'quoted') refuse('invalid_csv_syntax')
  endRecord()
  return newline || '\n'
}

/** Bounded pure parsing only: no upload, persistence, database, or send. */
export function parseCsv({ csvBytes } = {}) {
  if (!(csvBytes instanceof Uint8Array)) refuse('invalid_csv_bytes')
  if (csvBytes.byteLength > 10 * 1024 * 1024) refuse('csv_byte_limit')
  let source
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(csvBytes)
  } catch {
    refuse('invalid_csv_utf8')
  }
  const newline = preflight(source)
  const sourceChecksum = createHash('sha256').update(csvBytes).digest('hex')
  let headers
  const rows = []
  let cursor = 0
  let failure
  Papa.parse(source, {
    delimiter: ',',
    newline,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    step(result, parser) {
      const physicalRecord = source.slice(cursor, result.meta.cursor)
      cursor = result.meta.cursor
      const fail = (code) => {
        failure = code
        parser.abort()
      }
      if (result.errors.length) return fail('invalid_csv_syntax')
      // Only zero-character physical records are blank. Quoted empty fields,
      // delimiter-only rows, and whitespace retain their meaning.
      if (/^(?:\r\n|\r|\n)?$/.test(physicalRecord)) return
      const record = result.data
      if (record.length > 100) return fail('csv_column_limit')
      if (record.some((value) => Buffer.byteLength(value, 'utf8') > 16384)) return fail('csv_field_limit')
      if (!headers) {
        if (
          record.some((value) => !value.trim() || PROTOTYPE_KEYS.has(value)) ||
          new Set(record).size !== record.length
        )
          return fail('invalid_csv_headers')
        headers = record
      } else {
        if (record.length !== headers.length) return fail('invalid_csv_width')
        if (rows.length >= 10000) return fail('csv_row_limit')
        rows.push(record)
      }
    }
  })
  if (failure) refuse(failure)
  if (!headers) refuse('invalid_csv_headers')
  return { headers, rows, sourceChecksum, parserVersion: PARSER_VERSION }
}

/** Explicit baseline flag adaptation; unknown and blank assertions require review. */
export function normalizeBaselineRows({ headers, rows, mapping }) {
  const columns = headers.map(
    (header) =>
      Object.hasOwn(mapping, header) && ['global_unsubscribed', 'internal'].includes(mapping[header])
  )
  return rows.map((row) =>
    row.map((value, index) => {
      if (!columns[index]) return value
      const flag = value.trim().toLowerCase()
      return flag === 'co' ? '1' : flag === 'khong' ? '0' : '__baseline_unknown__'
    })
  )
}

/** The outer digest binds raw parser and adapter policy; rowsDigest is the helper's rows-v1 digest. */
export function previewCsv({
  csvBytes,
  mapping,
  schemaVersion,
  groupCatalogue,
  normalizeBaselineFlags = false
} = {}) {
  const parsed = parseCsv({ csvBytes })
  // Validate mapping in the helper before allowing adapter property access.
  previewRows({ ...parsed, rows: [], mapping, schemaVersion, groupCatalogue })
  const preview = normalizeBaselineFlags
    ? previewRows({
        ...parsed,
        rows: normalizeBaselineRows({ ...parsed, mapping }),
        mapping,
        schemaVersion,
        groupCatalogue
      })
    : previewRows({ ...parsed, mapping, schemaVersion, groupCatalogue })
  const rowsDigest = preview.previewDigest
  const previewDigest = createHash('sha256')
    .update(
      JSON.stringify({
        parserVersion: parsed.parserVersion,
        adapterVersion: normalizeBaselineFlags ? 'baseline-flags-v1' : 'none',
        rowsDigest
      })
    )
    .digest('hex')
  return { ...preview, parserVersion: parsed.parserVersion, rowsDigest, previewDigest }
}
