/**
 * The business logo of the build chat's research (#609) as a file the brand step reads (`brand-before-site.js`
 * `logoFile`). It is the one picture stored before a site exists; every other picture stays a reference by address.
 *
 * Downloaded as the research executor stores a picture (`executor.js` `admittedMediaRecord`): through the admission
 * slots (`withMediaAdmission`), `domain.fetchLimited` with the image byte limit and the guarded fetch, a body read whole
 * (a truncated one is refused), and kept only when its bytes sniff as an image type the executor stores (`EXT`). The
 * file is named by its sha256 in `dir`, so the same logo is one file and a rerun reads the same path.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {{dir: string, admit: (kind: 'image', run: () => Promise<any>) => Promise<any>, maxBytes: number,
 *   ext: Record<string, string>, timeoutMs?: number}} deps
 * @returns {(url: string, ctx: {domain: object, deps: {fetch: typeof fetch, resolve?: Function}}) =>
 *   Promise<string | null>} the absolute file path, or null when the logo is refused
 */
export function createLogoSaver({ dir, admit, maxBytes, ext, timeoutMs = 60_000 }) {
  const root = path.resolve(dir)
  return (url, { domain, deps }) =>
    admit('image', async () => {
      let got
      try {
        got = await domain.fetchLimited(url, { ...deps, maxBytes, timeoutMs })
      } catch {
        return null
      }
      if (!got || got.status >= 400 || got.truncated || !got.bytes?.length) return null
      const mime = domain.sniffMime(got.bytes)
      if (!mime?.startsWith('image/') || !ext[mime]) return null
      const file = path.join(root, `${domain.sha256Hex(got.bytes)}.${ext[mime]}`)
      await mkdir(root, { recursive: true })
      await writeFile(file, got.bytes)
      return file
    })
}
