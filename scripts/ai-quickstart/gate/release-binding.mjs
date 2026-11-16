// The binding between a check record and the AI quickstart it releases (ticket #586). A kit ships its verdict as a
// small file, `check-record/verdict.json`, beside the record itself (`check-record/record.json`, required): the gate
// version, the kit and the sha256 over its files, the sha256 of the blank site archive and of the human quickstart
// installer, the plugin version at the start and the end of the run, the provenance of the two controls, the sha256 of
// the secret allow file, the sha256 of the record, and the verdict. `releaseProblems` says why a kit may not be
// released: no verdict or no record; a verdict file that is not the one the record gives; a record whose verdict its
// own contents do not give (`record-verdict.mjs`); a verdict that did not pass; a kit or allow file changed since the
// record; controls the gate did not make for that installer; a plugin or a human quickstart other than the pinned
// ones; a record of another gate version or of another kit; a record whose counts its own lists do not give, or whose
// passing measurements hold less than a real run (`record-consistency.mjs`, `record-detail.mjs`); a write safety that
// resumed a saved state; a check record folder
// that holds any other file, or is a link. This defends against a stale record, a changed kit, plugin, installer,
// control or allow file, and a hand-edited verdict or status. It does not defend against a record invented field by
// field, or a passing record of another kit relabelled: the release step itself runs the gate, checks that the record
// is the one that run wrote and holds the plan the kit's own build gives (`release-publish.mjs`, `release-plan.mjs`).
// Pure but for reading the kit folder.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { controlProblems } from './control-file.mjs'
import { GATE_PROBES, probeCatalogueSha256 } from './gate-probes.mjs'
import { consistencyProblems } from './record-consistency.mjs'
import { detailProblems } from './record-detail.mjs'
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

/**
 * The template kit of an AI quickstart kit folder (`<package>/ai-quickstarts/<slug>/<cms>/<version>`): the file
 * `<package>/contracts/<slug>/<cms>/<version>/template-kit.json` the marker build reads for its dark accent (review 5
 * Z8), or null for a folder outside an `ai-quickstarts` tree.
 */
export function templateKitFileOf(folder) {
  const parts = path.resolve(folder).split(path.sep)
  if (parts.length < 5 || parts[parts.length - 4] !== 'ai-quickstarts') return null
  const [slug, cms, version] = parts.slice(-3)
  return path.join(
    parts.slice(0, -4).join(path.sep) || path.sep,
    'contracts',
    slug,
    cms,
    version,
    'template-kit.json'
  )
}

/** The sha256 of a kit folder's template kit, or null when it has none. */
export const templateKitShaOf = (folder) => {
  const file = templateKitFileOf(folder)
  return file && existsSync(file) ? sha256(readFileSync(file)) : null
}

/** The files the gate writes into a kit's check record folder; nothing else may be there. */
const CHECK_RECORD_FILES = new Set(['record.json', 'verdict.json', 'secret-allow.json'])

/** Why the check record folder is not the gate's own: a link, or a file the gate never writes. */
function checkRecordProblems(folder) {
  const dir = path.join(folder, CHECK_RECORD_DIR)
  if (!existsSync(dir)) return []
  if (lstatSync(dir).isSymbolicLink())
    return [{ code: 'check_record_link', message: CHECK_RECORD_DIR + ' is a link to another folder' }]
  const other = readdirSync(dir, { recursive: true })
    .map((n) => String(n).split(path.sep).join('/'))
    .filter((n) => !CHECK_RECORD_FILES.has(n) || lstatSync(path.join(dir, n)).isSymbolicLink())
  return other.length
    ? [
        {
          code: 'check_record_unknown_file',
          message: CHECK_RECORD_DIR + ' holds files the gate does not write: ' + other.sort().join(', ')
        }
      ]
    : []
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
  const links = checkRecordProblems(folder)
  if (links.some((p) => p.code === 'check_record_link')) return links
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
  const out = [...links]
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
  out.push(...detailProblems(record))
  out.push(...consistencyProblems(record, folder))
  out.push(...controlProblems(record.binding))
  if ((record.binding?.allowFileSha256 ?? null) !== allowShaOf(folder))
    out.push(problem('allow_changed', ALLOW_FILE + ' is not the allow file the record was scanned with'))
  if ((record.binding?.templateKitSha256 ?? null) !== templateKitShaOf(folder))
    out.push(
      problem('template_kit_changed', 'the template kit is not the one the marker build read for the record')
    )
  if ((record.binding?.probeCatalogueSha256 ?? null) !== probeCatalogueSha256(GATE_PROBES))
    out.push(
      problem(
        'probe_catalogue_changed',
        "write safety ran another probe catalogue than the gate has: run the repository's own gate"
      )
    )
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
  // A resumed write safety took the passes of a saved state on trust (review round 3, U5): a release record runs them all.
  // Told by three things, not one field (review 4 X5): `resumedFrom`, a pass marked as carried from a state, and passes
  // that took longer than this run measured for.
  const resumedWhy = resumedOf(record.measurements?.writeSafety)
  if (resumedWhy)
    out.push(
      problem(
        'write_safety_resumed',
        'write safety ' + resumedWhy + ': run the gate into an empty run folder'
      )
    )
  if (blankSiteSha && v.blankSiteSha256 !== blankSiteSha)
    out.push(problem('blank_site_changed', 'the blank site archive is not the one the record ran on'))
  return out
}

/** Why a write safety measurement was resumed from a saved state, or null. */
export function resumedOf(ws) {
  if (!ws) return null
  if (ws.resumedFrom != null) return 'resumed ' + ws.resumedFrom + ' pass(es) from a saved state'
  const passes = Array.isArray(ws.passes) ? ws.passes : []
  if (passes.some((p) => p?.resumed)) return 'holds passes carried from a saved state'
  const seconds = passes.reduce((a, p) => a + (Number(p?.seconds) || 0), 0)
  // Each pass rounds its seconds: one second of slack per pass.
  if (ws.ranFor != null && seconds > Number(ws.ranFor) + passes.length)
    return 'holds ' + seconds + ' s of passes in a run of ' + ws.ranFor + ' s'
  if (passes.length && ws.ranFor == null) return 'does not say how long it ran'
  return null
}
