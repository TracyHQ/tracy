// The picture reading page (ADR 0043, #341): a run folder written by "site-pictures-bench get", plus optionally the
// owner photos and the kit's demo pictures, in; one HTML file out. Built outside the server, like the copy reading
// page. Pictures are linked by a path relative to the output file, never embedded: nothing of an owner is copied into
// the page.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readCopy } from '../../site-writer/copy-check/copy-view.js'
import { copyAround } from './copy-around.js'
import { loadRunFolder, pictureFinders } from './load-run.js'
import { buildModel } from './model.js'
import { renderPage } from './render.js'
import { framePlaces } from './where.js'
import { drawWhere } from './where-images.js'

const FIT_CONTAIN = new Set(['icon', 'logo'])

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
  copyFile = null,
  surfaceFile = null,
  outFile
}) {
  const files = await loadRunFolder(runDir)
  // A frame-surface/1 file (scripts/site-pictures-frame-surface.mjs): the template's overlay over each picture, text
  // over it, and an article picture also painted behind the title. A manifest entry's own record wins.
  let surface = null
  if (surfaceFile) {
    try {
      surface = JSON.parse(await readFile(surfaceFile, 'utf8'))
    } catch (error) {
      throw new Error(`cannot read the frame surface file ${surfaceFile}: ${error.message}`)
    }
  }
  const surfaceOf = (f) => {
    const s = surface?.frames?.[f.frame] ?? null
    const own = f.entry && 'templateOverlay' in f.entry ? f.entry.templateOverlay : undefined
    const overlay = own !== undefined && own !== 'unknown' ? own : (s?.overlay ?? own ?? 'unknown')
    return {
      overlay,
      textOver: f.entry?.textOver === true || s?.textOver === true,
      textOverFrom: s?.textOverFrom ?? null,
      behindTitle: s?.behindTitle ?? null
    }
  }
  const model = buildModel(files)
  // With a site-copy/1 file, each frame gets the "copy around this picture" panel; without it the page is as before.
  if (copyFile) {
    let copy
    try {
      copy = JSON.parse(await readFile(copyFile, 'utf8'))
    } catch (error) {
      throw new Error(`cannot read the copy file ${copyFile}: ${error.message}`)
    }
    const { view } = readCopy(copy)
    for (const g of model.groups) for (const f of g.frames) f.around = copyAround(f, view)
  }
  const find = await pictureFinders({ runDir, photosDir, kitImagesDir, kitFile, webrootDir })
  const base = path.dirname(path.resolve(outFile))
  const link = (found) =>
    found && {
      src: path.relative(base, found.file).split(path.sep).map(encodeURIComponent).join('/'),
      width: found.width,
      height: found.height
    }
  const media = new Map()
  // "Where on the template": with a kit and its shots, each frame's box on a page (or block) shot, drawn into small
  // JPEGs in "<page name>-where/" beside the page.
  const places = find.kit ? framePlaces(find.kit, (id) => find.shot(id)) : null
  const whereDir = path.join(base, `${path.parse(outFile).name}-where`)
  const whereOf = async (f, out) => {
    const place = places?.(f.frame) ?? null
    if (!place) return null
    if (place.how === 'none') return { place }
    const shot = find.shot(place.shot)
    const kind = find.kitFrame(f.frame)?.kind
    const fit = FIT_CONTAIN.has(kind) || f.entry?.source === 'icon' ? 'contain' : 'cover'
    const overlay = f.surface.overlay && typeof f.surface.overlay === 'object' ? f.surface.overlay : null
    const drawn = await drawWhere({
      shotFile: shot.file,
      shotSize: place.shotSize,
      box: place.box,
      pictureFile: f.entry?.source !== 'hide' ? (out?.file ?? null) : null,
      fit,
      overlay,
      outDir: whereDir,
      name: f.frame.replace(/[^a-zA-Z0-9._-]+/g, '-')
    })
    return {
      place,
      fit,
      shot: link(shot),
      before: link(drawn.before),
      after: link(drawn.after),
      overlay: drawn.overlayDrawn ? overlay : null
    }
  }
  let missing = 0
  for (const g of model.groups)
    for (const f of g.frames) {
      f.surface = surfaceOf(f)
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
        original: link(original),
        where: await whereOf(f, out)
      })
    }
  const html = renderPage(model, (frame) => media.get(frame))
  await writeFile(outFile, html)
  return { frames: model.total, missing, bytes: Buffer.byteLength(html) }
}
