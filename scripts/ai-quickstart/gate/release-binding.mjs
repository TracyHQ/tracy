// The binding between a check record and the AI quickstart it releases (ticket #586). A kit ships its verdict as a
// small file, `check-record/verdict.json`, beside the record itself (`check-record/record.json`, required): the gate
// version, the kit and the sha256 over its files, the sha256 of the blank site archive and of the human quickstart
// installer, the plugin version at the start and the end of the run, the provenance of the two controls, the sha256 of
// the secret allow file, the sha256 of the record, and the verdict. `releaseProblems` says why a kit may not be
// released: no verdict or no record; a verdict file that is not the one the record gives; a record whose verdict its
// own contents do not give (`record-verdict.mjs`); a verdict that did not pass; a kit or allow file changed since the
// record; controls the gate did not make for that installer; a plugin or a human quickstart other than the pinned
// ones; a record of another gate version. A passing record goes stale only then. Pure but for reading the kit folder.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { controlProblems } from './control-file.mjs'
import { CHECK_RECORD_DIR, GATE_VERSION, kitFilesSha256, kitHashesOf } from './record.mjs'
import { measurementProblems, sameVerdict, verdictFromRecord } from './record-verdict.mjs'

export const VERDICT_SCHEMA = 'tracy-ai-quickstart-check-verdict/v1'
export const VERDICT_FILE = CHECK_RECORD_DIR + '/verdict.json'
export const RECORD_FILE = CHECK_RECORD_DIR + '/record.json'
export const ALLOW_FILE = CHECK_RECORD_DIR + '/secret-allow.json'

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** The record as the gate writes it to `record.json`: the bytes `recordSha256` is taken over. */
export const recordText = (record) => JSON.stringify(record, null, 1)

/** The binding of a record, with the sha256 of the record's own text. */
export function bindingOf(record) {
  return { ...record.binding, recordSha256: sha256(recordText(record)) }
}

/** The verdict file of a record: its binding and the verdict, nothing a reviewer needs the record for. */
export function verdictFileOf(record) {
  const v = record.verdict ?? {}
  return {
    schema: VERDICT_SCHEMA,
    ...bindingOf(record),
    verdict: { pass: v.pass === true, failing: v.failing ?? [], measurements: v.measurements ?? {} }
  }
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** The sha256 of the kit's secret allow file, or null when it has none. */
export const allowShaOf = (folder) => {
  const file = path.join(folder, ALLOW_FILE)
  return existsSync(file) ? sha256(readFileSync(file)) : null
}

/** The kit files whose hash differs from the record's, added or removed. */
function changedFiles(record, now) {
  const then = record?.kitFiles ?? {}
  const names = [...new Set([...Object.keys(then), ...Object.keys(now)])].sort()
  return names.filter((n) => then[n] !== now[n])
}

/**
 * Why the kit in `folder` may not be released, as `[{code, message}]`; empty when it may.
 * @param {string} folder the AI quickstart kit folder
 * @param {{pins: {plugin?: string, humanQuickstartSha256?: string}, blankSiteSha?: string}} options `pins`: what
 *   Tracy pins for this template (the Claude Cowork plugin version and the human quickstart installer's sha256);
 *   `blankSiteSha`: the sha256 of the blank site archive about to be published, when the caller has it
 */
export function releaseProblems(folder, { pins = {}, blankSiteSha } = {}) {
  const file = path.join(folder, VERDICT_FILE)
  const recordFile = path.join(folder, RECORD_FILE)
  const problem = (code, message) => ({ code, message })
  if (!existsSync(file)) return [problem('no_verdict', VERDICT_FILE + ' is missing: run the release gate')]
  if (!existsSync(recordFile))
    return [
      problem(
        'no_record',
        RECORD_FILE + ' is missing: a verdict alone is no proof, ship the record beside it'
      )
    ]
  let v
  let record
  let recordBytes
  try {
    v = readJson(file)
  } catch (error) {
    return [problem('verdict_unreadable', VERDICT_FILE + ' is not JSON: ' + error.message)]
  }
  try {
    recordBytes = readFileSync(recordFile, 'utf8')
    record = JSON.parse(recordBytes)
  } catch (error) {
    return [problem('record_unreadable', RECORD_FILE + ' is not JSON: ' + error.message)]
  }
  const out = []
  if (sha256(recordBytes) !== v.recordSha256)
    out.push(problem('record_changed', RECORD_FILE + ' is not the record the verdict was written from'))
  if (JSON.stringify(verdictFileOf(record)) !== JSON.stringify(v))
    out.push(problem('verdict_not_from_record', VERDICT_FILE + ' is not the verdict file the record gives'))
  const again = verdictFromRecord(record)
  if (!sameVerdict(again, record.verdict))
    out.push(
      problem(
        'record_verdict_wrong',
        'the record says pass ' +
          record.verdict?.pass +
          ', its own contents give pass ' +
          again.pass +
          (again.failing.length ? ' (failing: ' + again.failing.join(', ') + ')' : '')
      )
    )
  out.push(...measurementProblems(record))
  out.push(...controlProblems(record.binding))
  if ((record.binding?.allowFileSha256 ?? null) !== allowShaOf(folder))
    out.push(problem('allow_changed', ALLOW_FILE + ' is not the allow file the record was scanned with'))
  if (v.schema !== VERDICT_SCHEMA)
    out.push(problem('verdict_unreadable', 'schema ' + v.schema + ' is not ' + VERDICT_SCHEMA))
  if (v.gateVersion !== GATE_VERSION)
    out.push(
      problem(
        'gate_outdated',
        'the record is of gate version ' + v.gateVersion + ', the gate is ' + GATE_VERSION
      )
    )
  if (v.verdict?.pass !== true)
    out.push(problem('not_passed', 'the gate did not pass: ' + (v.verdict?.failing ?? []).join(', ')))
  const hashes = kitHashesOf(folder)
  if (kitFilesSha256(hashes) !== v.kitFilesSha256) {
    const names = changedFiles(record, hashes)
    out.push(
      problem(
        'kit_changed',
        'kit files changed since the record' + (names.length ? ': ' + names.join(', ') : '')
      )
    )
  }
  const plugin = v.plugin ?? {}
  if (!plugin.start || plugin.start !== plugin.end)
    out.push(
      problem(
        'plugin_moved',
        'the plugin was ' + plugin.start + ' at the start and ' + plugin.end + ' at the end'
      )
    )
  if (pins.plugin && plugin.start !== pins.plugin)
    out.push(
      problem('plugin_not_pinned', 'the record ran plugin ' + plugin.start + ', Tracy pins ' + pins.plugin)
    )
  if (pins.humanQuickstartSha256 && v.humanQuickstartSha256 !== pins.humanQuickstartSha256)
    out.push(
      problem(
        'human_quickstart_not_pinned',
        'the record ran another human quickstart installer than the pinned one'
      )
    )
  if (blankSiteSha && v.blankSiteSha256 !== blankSiteSha)
    out.push(problem('blank_site_changed', 'the blank site archive is not the one the record ran on'))
  return out
}
