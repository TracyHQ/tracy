// The controls of the release gate as files (ticket #586): the untouched human quickstart's demo scan and quality
// groups are measured by the gate itself, in the same run by default. A machine that holds one throwaway site at a
// time measures them first (`gate.mjs --control-only`), and the full run reads them back; such a file is the gate's
// own: it names the gate version and the sha256 of the human quickstart installer it measured, and the run refuses a
// file that names another installer, another gate version, or is any other JSON. The provenance of each control (and
// the sha256 of the file it was read from) goes into the record's binding, which the release guard checks. Pure but
// for the file read.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { GATE_VERSION } from './record.mjs'

export const CONTROL_SCHEMA = 'tracy-ai-quickstart-gate-control/v1'

/** The provenance of a control measured in this run. */
export const measuredInRun = (humanQuickstartSha256) => ({
  schema: CONTROL_SCHEMA,
  from: 'measured_in_run',
  gateVersion: GATE_VERSION,
  humanQuickstartSha256: humanQuickstartSha256 ?? null
})

/** The file the gate writes for one control (`human` or `quality`). */
export function controlFileOf(kind, control, humanQuickstartSha256) {
  return { schema: CONTROL_SCHEMA, kind, gateVersion: GATE_VERSION, humanQuickstartSha256, control }
}

const refuse = (file, why) =>
  Object.assign(new Error('the control file ' + file + ' is not the gate own: ' + why), {
    code: 'control_unbound'
  })

/**
 * A control read from a file the gate wrote, with its provenance; throws (`control_unbound`) on any other file.
 * @param {string} file
 * @param {{kind: 'human' | 'quality', humanQuickstartSha256: string | null}} expected
 * @returns {{control: object, provenance: object}}
 */
export function readControlFile(file, { kind, humanQuickstartSha256 }) {
  const text = readFileSync(file, 'utf8')
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    throw refuse(file, 'not JSON')
  }
  if (doc?.schema !== CONTROL_SCHEMA) throw refuse(file, 'no gate control schema')
  if (doc.kind !== kind) throw refuse(file, 'a ' + doc.kind + ' control, not ' + kind)
  if (doc.gateVersion !== GATE_VERSION)
    throw refuse(file, 'gate version ' + doc.gateVersion + ', the gate is ' + GATE_VERSION)
  if (!humanQuickstartSha256 || doc.humanQuickstartSha256 !== humanQuickstartSha256)
    throw refuse(file, 'it measured another human quickstart installer')
  if (!doc.control || typeof doc.control !== 'object') throw refuse(file, 'no control in it')
  return {
    control: doc.control,
    provenance: {
      schema: CONTROL_SCHEMA,
      from: 'file',
      gateVersion: doc.gateVersion,
      humanQuickstartSha256: doc.humanQuickstartSha256,
      fileSha256: createHash('sha256').update(text).digest('hex')
    }
  }
}

/**
 * Why a record's control provenance does not bind it, as `[{code, message}]`: missing, of another gate version, of
 * another human quickstart installer than the record ran, or read from a file whose hash it does not keep.
 */
export function controlProblems(binding) {
  const out = []
  for (const kind of ['human', 'quality']) {
    const p = binding?.controls?.[kind]
    const say = (message) =>
      out.push({ code: 'control_unbound', message: 'the ' + kind + ' control ' + message })
    if (!p || p.schema !== CONTROL_SCHEMA) say('was not made by the gate')
    else if (p.gateVersion !== binding.gateVersion) say('is of gate version ' + p.gateVersion)
    else if (!p.humanQuickstartSha256 || p.humanQuickstartSha256 !== binding.humanQuickstartSha256)
      say('measured another human quickstart installer than the record')
    else if (p.from === 'file' && !/^[0-9a-f]{64}$/.test(p.fileSha256 ?? ''))
      say('file has no sha256 in the binding')
  }
  return out
}
