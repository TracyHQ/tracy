// Builds the review page (#357) from a run's output on the operator's machine. It reads files, takes captures of the
// written site with a headless browser and writes one HTML file. It never writes to the site and never into the repo.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { captureSite, loadChromium } from './capture.js'
import { dataUri, shrinkAll } from './images.js'
import { withLabels } from './labels.js'
import { buildReviewModel } from './model.js'
import { renderReviewPage } from './render.js'

/** JSON from text that may start with a line of something else, such as the file name a copy-paste kept. */
export function parseJsonLoose(text, what) {
  try {
    return JSON.parse(text)
  } catch (error) {
    const start = text.indexOf('{')
    if (start > 0)
      try {
        return JSON.parse(text.slice(start))
      } catch {
        // fall through to the first error
      }
    throw new Error(`${what} is not JSON (${error.message})`)
  }
}

const readJson = async (file, what) => parseJsonLoose(await readFile(file, 'utf8'), what)
const readJsonIf = async (file, what) => (file ? readJson(file, what) : undefined)

async function pictureFile(dir, relative) {
  if (!relative) return null
  const where = path.resolve(dir, relative)
  if (path.relative(dir, where).startsWith('..')) return null
  try {
    return dataUri(await readFile(where))
  } catch {
    return null
  }
}

/** The pictures the page shows, as data URIs: what was made, what it came from, and what each written file looks like. */
async function packageImages(dir, model, pictures) {
  const made = new Map()
  const source = new Map()
  const byHash = new Map()
  for (const f of model.frames) {
    const entry = (pictures.frames ?? []).find((p) => p.frame === f.id)
    const uri = await pictureFile(dir, entry?.file)
    if (uri) {
      made.set(f.id, uri)
      if (f.sha) byHash.set(f.sha, uri)
    }
    const photo = await pictureFile(dir, f.photoSha ? `photos/${f.photoSha}` : null)
    if (photo) source.set(f.id, photo)
  }
  return { made, source, byHash }
}

/**
 * @param {{ reportFile: string, packageDir: string, outFile: string, checkFile?: string, routesFile?: string,
 *   labelsFile?: string, siteUrl?: string, playwrightDir?: string, chromium?: object | null,
 *   onProgress?: (line: string) => void }} input `chromium: null` builds without captures.
 */
export async function buildReviewPage(input) {
  const { reportFile, packageDir, outFile, onProgress = () => {} } = input
  const dir = path.resolve(packageDir)
  const [report, check, routes, labelFile, plan, copy, pictures, brief] = await Promise.all([
    readJson(reportFile, 'the write report'),
    readJsonIf(input.checkFile, 'the site check'),
    readJsonIf(input.routesFile, 'the routes file'),
    readJsonIf(input.labelsFile, 'the labels file'),
    readJson(path.join(dir, 'plan.json'), 'plan.json'),
    readJson(path.join(dir, 'site-copy.json'), 'site-copy.json'),
    readJson(path.join(dir, 'site-pictures.json'), 'site-pictures.json'),
    readJson(path.join(dir, 'brief.json'), 'brief.json').catch(() => ({}))
  ])
  const model = buildReviewModel({
    report,
    check,
    plan,
    copy,
    pictures,
    brief,
    routes: routes ?? {},
    siteUrl: input.siteUrl
  })
  const images = { pageShots: {}, crops: {}, made: {}, source: {}, byHash: {} }
  const chromium = input.chromium === undefined ? await loadChromium(input.playwrightDir) : input.chromium
  const uris = await packageImages(dir, model, pictures)
  const all = new Map()
  for (const [k, v] of uris.made) all.set(`made:${k}`, v)
  for (const [k, v] of uris.source) all.set(`source:${k}`, v)
  for (const [k, v] of uris.byHash) all.set(`hash:${k}`, v)
  const small = chromium ? await shrinkAll(chromium, all) : all
  for (const [key, uri] of small) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    if (kind === 'hash') images.byHash[id] = uri
    else images[kind][id] = uri
  }
  if (chromium && model.siteUrl) {
    const captured = await captureSite({
      chromium,
      baseUrl: model.siteUrl,
      pages: model.pages.map((p) => ({ id: p.id, path: p.path })),
      frames: model.frames.map((f) => ({ id: f.id, sha: f.sha, pageId: f.pageId })),
      onProgress
    })
    const jpeg = (b) => `data:image/jpeg;base64,${b.toString('base64')}`
    for (const [id, widths] of Object.entries(captured.pages))
      for (const [width, c] of Object.entries(widths))
        if (c.ok) (images.pageShots[id] ??= {})[width] = jpeg(c.image)
    for (const [id, widths] of Object.entries(captured.crops))
      for (const [width, buf] of Object.entries(widths)) (images.crops[id] ??= {})[width] = jpeg(buf)
  }
  const html = renderReviewPage(model, withLabels(labelFile), images)
  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true })
  await writeFile(outFile, html)
  return {
    bytes: Buffer.byteLength(html),
    pages: model.pages.length,
    frames: model.frames.length,
    crops: Object.keys(images.crops).length
  }
}
