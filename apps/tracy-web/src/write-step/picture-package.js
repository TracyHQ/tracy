// The frozen output of the picture step, as the write step reads it (ADR 0043, `exportPictureMapping`): what is wrong
// with it as a file, and its files read from beside it and held to their hashes. It reads no picture code, only the file.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const PICTURE_OWNER = 'picture'

/** The plugin's `MAX_MEDIA_BYTES`: the most `media.upload` takes in one call. Nothing on the Apply door is smaller. */
export const MAX_UPLOAD_BYTES = 8_388_608
/** The plugin's rule for a picture of a contract slot: named by the sha256 of its bytes, under this folder. */
const SITE_PATH = /^images\/tracy-content\/([a-f0-9]{64})\.(?:png|jpg|webp)$/

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const filled = (x) => Array.isArray(x) && x.length > 0

const isExport = (pictures) => {
  const { mapping, uploads, hidden, painted, siteSettings, problems } = pictures ?? {}
  return (
    isObject(mapping) &&
    isObject(mapping.changes) &&
    [uploads, hidden, painted, siteSettings, problems].every(Array.isArray)
  )
}

/**
 * What keeps the whole package off this contract, each as a sentence; empty when it can be used. These stop the run (ADR 0044,
 * decision 26): a file that is not the export, or one made for another contract, holds nothing the step can trust.
 */
export function packageStops(pictures, contract) {
  if (!isExport(pictures)) return ['it is not the output of the picture export']
  const { mapping } = pictures
  const out = []
  if (mapping.contract !== contract)
    out.push(`it was made for the contract ${mapping.contract}, not ${contract}`)
  if (filled(mapping.pending)) out.push(`it has pending items: ${mapping.pending.join(', ')}`)
  if (filled(mapping.emptyLinks)) out.push('it has emptyLinks, which the picture stage does not send')
  return out
}

/**
 * The items of the package that have nothing to write to or nothing to write: a frame the export could not place (its own
 * `problems`, such as a frame the kit has no image slot for) and a slot holding a file the uploads do not list. Each is left
 * out and said once, and the rest of the package is written (ADR 0044, decision 26). Empty for a file that is not the export.
 * @returns {{ frame: string, key: string | null, reason: string }[]}
 */
export function packageItems(pictures) {
  if (!isExport(pictures)) return []
  const { mapping, uploads, problems } = pictures
  const out = problems.map((p) => ({ frame: String(p?.where), key: null, reason: String(p?.detail) }))
  const sent = new Set(uploads.map((u) => u?.sitePath))
  for (const [key, value] of Object.entries(mapping.changes))
    if (!sent.has(value))
      out.push({
        frame: key.replace(/^module-/, 'block-'),
        key,
        reason: 'it holds a file the uploads do not list'
      })
  return out
}

/** Whatever keeps this package or one of its items off this contract, each as a sentence; empty when all of it can be used. */
export function packageProblems(pictures, contract) {
  if (!isExport(pictures)) return packageStops(pictures, contract)
  const items = packageItems(pictures)
  const said = (i) => (i.key ? `${i.key} holds a file the uploads do not list` : `${i.frame}: ${i.reason}`)
  return [
    ...items.filter((i) => !i.key).map(said),
    ...packageStops(pictures, contract),
    ...items.filter((i) => i.key).map(said)
  ]
}

/** One file, read and held to its record; a stop names what is wrong. */
async function readEntry(entry, folder) {
  const { file, sitePath, sha256 } = entry
  const name = SITE_PATH.exec(String(sitePath))
  if (!name || name[1] !== sha256)
    return {
      stop: {
        code: 'BAD_FILE',
        reason: `pictures: ${sitePath} is not images/tracy-content/<its sha256>.<png|jpg|webp>`
      }
    }
  const where = path.resolve(folder, String(file))
  if (path.relative(folder, where).startsWith('..'))
    return {
      stop: { code: 'BAD_FILE', reason: `pictures: the file ${file} is outside the package's folder` }
    }
  let bytes
  try {
    bytes = await readFile(where)
  } catch (error) {
    const reason = `The picture package names ${file}, which cannot be read (${error.code ?? 'error'}).`
    return { stop: { code: 'MISSING_FILE', reason } }
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    return { stop: { code: 'BAD_FILE', reason: `pictures: the bytes of ${file} are not its sha256` } }
  if (bytes.length > MAX_UPLOAD_BYTES)
    return {
      stop: {
        code: 'BAD_FILE',
        reason: `pictures: ${file} is ${bytes.length} bytes; media.upload takes ${MAX_UPLOAD_BYTES}`
      }
    }
  return { bytes }
}

/**
 * @param {{ file: string, sitePath: string, sha256: string }[]} entries each file once or more
 * @param {string} folder where the package's paths start
 * @param {{ assets?: Record<string, string> }} inputs the report's record of this package; takes each file's hash
 * @returns {Promise<{ files?: Map<string, Buffer>, stop?: object }>} `files`: site path to bytes
 */
export async function readPackageFiles(entries, folder, inputs) {
  const files = new Map()
  const assets = {}
  for (const entry of entries) {
    if (files.has(entry.sitePath)) continue
    const read = await readEntry(entry, folder)
    if (read.stop) return { stop: read.stop }
    files.set(entry.sitePath, read.bytes)
    assets[entry.file] = entry.sha256
  }
  inputs.assets = assets
  return { files }
}
