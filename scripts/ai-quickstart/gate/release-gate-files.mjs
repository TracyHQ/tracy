// The last step of the release gate (ticket #586): the record's own files are published too, so the secret rules read
// them (all three rule sets, gitleaks included, through the injected `scanRecord`) and the files written are exactly
// the texts that were scanned. A finding changes the secret scan measurement and so the record: the record is made and
// scanned again until what is written is what was read (two rounds at most in practice, three allowed). A scan that
// throws or never settles leaves the secret scan `incomplete`, never `passed`. Then `record.json`, `record.html`,
// `check-record/record.json` and `check-record/verdict.json`. Pure but for the scan and the files.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { recordHtml } from './record-html.mjs'
import { recordText, verdictFileOf } from './release-binding.mjs'

const keyOf = (f) => [f.file, f.at, f.rule, f.fingerprint].join('\0')

/** The record's own files as the secret scan reads them. */
export const recordFilesOf = (record) => [
  { name: 'check-record/record.json', text: recordText(record) },
  { name: 'check-record/record.html', text: recordHtml(record) }
]

/** The secret scan measurement with what the scan of the record's files found. */
function withRecordScan(secrets, scan) {
  const found = [
    ...new Map([...(secrets.findings ?? []), ...scan.findings].map((f) => [keyOf(f), f])).values()
  ]
  const gitleaks = scan.gitleaks?.status ?? 'ran'
  const recordScan = { files: 2, findings: scan.findings.length, gitleaks }
  if (found.length) return { ...secrets, status: 'failed', findings: found, recordScan }
  if (gitleaks !== 'ran' && secrets.status === 'passed')
    return { ...secrets, status: 'incomplete', reason: 'record_gitleaks_not_run', recordScan }
  return { ...secrets, recordScan }
}

/**
 * The record that is published: made with the record scan's result until a scan reads exactly what is written.
 * @param {(secrets: object) => object} make the record with a given secret scan measurement
 * @param {object} secrets the secret scan measurement of the files to publish
 * @param {((files: object[]) => Promise<object | object[]> | object | object[]) | null} scanRecord `{findings,
 *   gitleaks}` (an array: the findings of a scan that ran every rule set)
 */
export async function scannedRecord(make, secrets, scanRecord) {
  if (!scanRecord)
    return make({
      ...secrets,
      ...(secrets.status === 'passed' ? { status: 'incomplete', reason: 'record_not_scanned' } : {})
    })
  let current = secrets
  for (let round = 0; round < 3; round++) {
    const record = make(current)
    let scan
    try {
      const answer = await scanRecord(recordFilesOf(record))
      scan = Array.isArray(answer) ? { findings: answer, gitleaks: { status: 'ran' } } : answer
    } catch (error) {
      return make({
        ...current,
        status: current.status === 'failed' ? 'failed' : 'incomplete',
        reason: 'record_scan_failed',
        message: String(error?.message ?? error).slice(0, 200)
      })
    }
    const next = withRecordScan(secrets, scan)
    if (JSON.stringify(next) === JSON.stringify(current)) return record
    current = next
  }
  return make({
    ...current,
    status: current.status === 'failed' ? 'failed' : 'incomplete',
    reason: 'record_scan_unsettled'
  })
}

/** Write the record, its page and the kit's check record folder into `out`. */
export function writeRecordFiles(out, record) {
  const verdictFile = verdictFileOf(record)
  mkdirSync(path.join(out, 'check-record'), { recursive: true })
  const [json, html] = recordFilesOf(record)
  writeFileSync(path.join(out, 'record.json'), json.text)
  writeFileSync(path.join(out, 'record.html'), html.text)
  writeFileSync(path.join(out, 'check-record', 'record.json'), json.text)
  writeFileSync(path.join(out, 'check-record', 'verdict.json'), JSON.stringify(verdictFile, null, 1) + '\n')
  return verdictFile
}
