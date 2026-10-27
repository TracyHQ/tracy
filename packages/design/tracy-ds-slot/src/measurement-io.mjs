/**
 * Where a measurement file (`measurement.mjs`) is written: beside the contract of its version
 * (`design-system-measurement.json`, a contract-only fix) or into the `designSystem` block of a
 * release's `VERIFICATION.json` (a re-release). Node-only; the pure parts stay in `measurement.mjs`
 * so /ops can import them without this file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { measurementPath, validateMeasurement } from './measurement.mjs'

/**
 * Write one measurement file. Refuses (throws, every reason listed) a document that is not a valid
 * `tdsr-measurement/v1`, so nothing half-shaped ever reaches a contract folder or a release.
 * @param {import('./measurement.mjs').Measurement} doc
 * @param {{ root: string, releaseDir?: string | null }} where  the tch root; a release folder when the
 *   file travels with a re-release (its `VERIFICATION.json` gains the block, other blocks kept)
 * @returns {string} the file written
 */
export function writeMeasurement(doc, { root, releaseDir = null }) {
  const why = validateMeasurement(doc)
  if (why.length) throw new Error(`not a tdsr-measurement/v1 file:\n- ${why.join('\n- ')}`)
  if (releaseDir) {
    const file = join(resolve(releaseDir), 'VERIFICATION.json')
    const v = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    writeFileSync(
      file,
      `${JSON.stringify({ ...v, designSystem: withPreviewOf(v.designSystem, doc) }, null, 2)}\n`
    )
    return file
  }
  const file = join(resolve(root), measurementPath(doc))
  mkdirSync(dirname(file), { recursive: true })
  const was = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  writeFileSync(file, `${JSON.stringify(withPreviewOf(was, doc), null, 2)}\n`)
  return file
}

/**
 * The preview block (`preview`, `previewMeasuredAt`) is another measure's (preview-check.mjs --write) and
 * shares the file: a built-site run that replaces the file keeps the block it found (15/10/2026: the final
 * measure of #1298 rewrote eleven files and their preview rules fell back to not measured).
 * @param {Record<string, any> | null | undefined} was  the document the write replaces
 * @param {Record<string, any>} doc
 */
function withPreviewOf(was, doc) {
  if (!was || doc.preview !== undefined || was.preview === undefined) return doc
  if (was.version !== doc.version || was.tag !== doc.tag) return doc
  return { ...doc, preview: was.preview, previewMeasuredAt: was.previewMeasuredAt }
}

/**
 * The measurement of a version as /ops and the measuring machine read it: the contract folder's
 * file, or the release's `VERIFICATION.json` block, whichever is newer; `null` when neither exists.
 * @param {{ cms: string, template: string, tag: string, version: string }} key
 * @param {{ root: string, releaseDir?: string | null }} where
 */
export function readMeasurement(key, { root, releaseDir = null }) {
  const candidates = []
  const contractFile = join(resolve(root), measurementPath(key))
  if (existsSync(contractFile)) candidates.push(JSON.parse(readFileSync(contractFile, 'utf8')))
  const verification = releaseDir ? join(resolve(releaseDir), 'VERIFICATION.json') : null
  if (verification && existsSync(verification)) {
    const block = JSON.parse(readFileSync(verification, 'utf8')).designSystem
    if (block) candidates.push(block)
  }
  const valid = candidates.filter((d) => validateMeasurement(d).length === 0)
  if (!valid.length) return null
  return valid.sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0]
}
