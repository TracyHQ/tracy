// The copy reading page (ADR 0042, #333): a run folder written by "site-writer-bench get" and a folder of the kit's
// block images in, one self-contained HTML file out. Built outside the server, like a plan reading page.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { blockImageFinder, imageDataUri, loadRunFolder } from './load-run.js'
import { buildModel } from './model.js'
import { renderPage } from './render.js'

/**
 * @param {{ runDir: string, imagesDir?: string | null, outFile: string, linkImages?: boolean }} options
 *   linkImages: reference images by a path relative to the output file instead of embedding them as data URIs
 * @returns {Promise<{ blocks: number, images: number, bytes: number }>}
 */
export async function buildReadingPage({ runDir, imagesDir = null, outFile, linkImages = false }) {
  const files = await loadRunFolder(runDir)
  const model = buildModel(files)
  const find = await blockImageFinder(imagesDir)
  const sources = new Map()
  const blockIds = [...model.sharedBlocks, ...model.pages.flatMap((p) => p.blocks)].map((b) => b.id)
  for (const id of new Set(blockIds)) {
    const file = find(id)
    if (file)
      sources.set(
        id,
        linkImages ? path.relative(path.dirname(path.resolve(outFile)), file) : await imageDataUri(file)
      )
  }
  const html = renderPage(model, (id) => sources.get(id) ?? null)
  await writeFile(outFile, html)
  return { blocks: new Set(blockIds).size, images: sources.size, bytes: Buffer.byteLength(html) }
}
