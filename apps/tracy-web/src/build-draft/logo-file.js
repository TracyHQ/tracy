/**
 * The business logo of the build chat's research (#609) as a file the brand step reads (`brand-before-site.js`
 * `logoFile`), written from the logo's stored copy (`pictures.js` `open`: the bytes the research downloaded and kept
 * by the Website Opportunities media rules), never downloaded a second time. The file is named by its sha256 in `dir`,
 * so the same logo is one file and a rerun reads the same path. Only an image type the executor stores (`EXT`) is
 * written; anything else is no file.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {{dir: string, ext: Record<string, string>}} deps
 * @returns {(picture: {sha256: string, mime: string, bytes: Uint8Array} | null) => Promise<string | null>} the
 *   absolute file path, or null when there is nothing to write
 */
export function createLogoWriter({ dir, ext }) {
  const root = path.resolve(dir)
  return async (picture) => {
    const mime = picture?.mime
    if (!picture?.bytes?.length || !mime?.startsWith('image/') || !ext[mime]) return null
    if (!/^[0-9a-f]{64}$/.test(picture.sha256 ?? '')) return null
    const file = path.join(root, `${picture.sha256}.${ext[mime]}`)
    await mkdir(root, { recursive: true })
    await writeFile(file, picture.bytes)
    return file
  }
}
