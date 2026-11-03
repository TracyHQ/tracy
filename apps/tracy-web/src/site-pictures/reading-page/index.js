// The picture reading page (ADR 0043, #341): a run folder written by "site-pictures-bench get", plus optionally the
// owner photos and the kit's demo pictures, in; one HTML file out. Built outside the server, like the copy reading
// page. Pictures are linked by a path relative to the output file, never embedded: nothing of an owner is copied into
// the page.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadRunFolder, pictureFinders } from './load-run.js'
import { buildModel } from './model.js'
import { renderPage } from './render.js'

/**
 * @param {{ runDir: string, photosDir?: string | null, kitImagesDir?: string | null, outFile: string }} options
 * @returns {Promise<{ frames: number, missing: number, bytes: number }>} `missing` counts files the page expected
 */
export async function buildPicturesPage({
  runDir,
  photosDir = null,
  kitImagesDir = null,
  kitFile = null,
  webrootDir = null,
  outFile
}) {
  const files = await loadRunFolder(runDir)
  const model = buildModel(files)
  const find = await pictureFinders({ runDir, photosDir, kitImagesDir, kitFile, webrootDir })
  const base = path.dirname(path.resolve(outFile))
  const link = (found) =>
    found && {
      src: path.relative(base, found.file).split(path.sep).map(encodeURIComponent).join('/'),
      width: found.width,
      height: found.height
    }
  const media = new Map()
  let missing = 0
  for (const g of model.groups)
    for (const f of g.frames) {
      const e = f.entry
      const [demo, out, dark, original] = await Promise.all([
        find.demo(f.frame),
        e?.file ? find.output(e.file) : null,
        e?.dark?.file ? find.output(e.dark.file) : null,
        f.sha256 ? find.original(f.sha256) : null
      ])
      if ((e?.file && !out) || (e?.dark?.file && !dark) || (f.sha256 && !original)) missing += 1
      media.set(f.frame, {
        displayWidth: Number(find.kitFrame(f.frame)?.width) || null,
        demo: link(demo),
        out: link(out),
        dark: link(dark),
        original: link(original)
      })
    }
  const html = renderPage(model, (frame) => media.get(frame))
  await writeFile(outFile, html)
  return { frames: model.total, missing, bytes: Buffer.byteLength(html) }
}
