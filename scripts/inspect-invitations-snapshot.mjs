import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { BASELINE_MAPPING, parseCsv, previewCsv } from '../apps/tracy-web/src/invitations/csv.js'

const GROUP_KEYS = [
  '1 agency dang hoat dong',
  '2 agency it hoat dong',
  '3 doanh nghiep dang hoat dong',
  '4 doanh nghiep it hoat dong',
  '5 ca nhan'
]
const PARSER_CODES = new Set([
  'invalid_csv_bytes',
  'csv_byte_limit',
  'invalid_csv_utf8',
  'invalid_csv_syntax',
  'invalid_csv_width',
  'csv_row_limit',
  'csv_column_limit',
  'csv_field_limit',
  'invalid_csv_headers',
  'invalid_mapping',
  'preview_byte_limit',
  'preview_expansion_limit'
])
const failure = (code) => Object.assign(new Error(code), { code })

/** Read-only, in-memory inspection. The return value has no rows, identity, or digest. */
export function inspectSnapshot(csvBytes) {
  try {
    const parsed = parseCsv({ csvBytes })
    const mapping = Object.fromEntries(
      Object.entries(BASELINE_MAPPING).filter(([key]) => parsed.headers.includes(key))
    )
    const preview = previewCsv({
      csvBytes,
      mapping,
      schemaVersion: 'invitations-v1',
      groupCatalogue: { version: 'sarah-baseline-2026-10-07', keys: GROUP_KEYS },
      normalizeBaselineFlags: true
    })
    const groups = Object.fromEntries(GROUP_KEYS.map((group) => [group, 0]))
    groups.unknown = 0
    const flags = {
      internal: { yes: 0, no: 0, blank: 0, other: 0 },
      globalUnsubscribed: { yes: 0, no: 0, blank: 0, other: 0 }
    }
    for (const row of parsed.rows) {
      const group = row[parsed.headers.indexOf('nhom_gui')]?.trim()
      groups[GROUP_KEYS.includes(group) ? group : 'unknown']++
      for (const [key, header] of [
        ['internal', 'noi_bo'],
        ['globalUnsubscribed', 'unsubscribed_toan_bo']
      ]) {
        const value = row[parsed.headers.indexOf(header)]?.trim().toLowerCase() ?? ''
        flags[key][value === 'co' ? 'yes' : value === 'khong' ? 'no' : value === '' ? 'blank' : 'other']++
      }
    }
    const issues = {}
    for (const issue of preview.issues) issues[issue.code] = (issues[issue.code] ?? 0) + 1
    return {
      counts: preview.counts,
      columns: parsed.headers.length,
      groups,
      flags,
      issues,
      eligibleNow: null
    }
  } catch (error) {
    throw failure(PARSER_CODES.has(error.message) ? error.message : 'snapshot_inspection_failed')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    process.stderr.write(JSON.stringify({ code: 'snapshot_file_required' }) + '\n')
    process.exitCode = 2
  } else {
    try {
      let bytes
      try {
        bytes = await readFile(process.argv[2])
      } catch {
        throw failure('snapshot_read_failed')
      }
      process.stdout.write(JSON.stringify(inspectSnapshot(bytes)) + '\n')
    } catch (error) {
      process.stderr.write(JSON.stringify({ code: error.code ?? 'snapshot_inspection_failed' }) + '\n')
      process.exitCode = 1
    }
  }
}
