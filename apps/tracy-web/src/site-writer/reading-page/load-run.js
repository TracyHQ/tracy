// Reads a folder written by "site-writer-bench get" (and, optionally, a folder of the kit's block images) for the
// copy reading page. The only file system part of the page; everything after it is pure (model.js, render.js).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}
const MAX_DEPTH = 2

async function readJson(file, required) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (!required && error.code === 'ENOENT') return null
    throw new Error(`cannot read ${path.basename(file)} in the run folder: ${error.message}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON`)
  }
}

const readText = (file) => readFile(file, 'utf8').catch(() => '')

/** The highest N of the files named `<stem>-vN.<ext>` in a listing, or 0 when there is none. */
const latestVersion = (names, stem, ext) => {
  const re = new RegExp(`^${stem}-v(\\d+)\\.${ext}$`)
  return names.reduce((best, n) => Math.max(best, Number(re.exec(n)?.[1] ?? 0)), 0)
}

/**
 * The files of one run folder: plan, brief, the final copy (site-copy.json, else the newest copy-vN.json), the newest
 * check-vN.json, the failures still standing, run.json when present, and the main menu and footer column headings of
 * mapping.json when present.
 * @param {string} dir
 */
export async function loadRunFolder(dir, { kitFile = null } = {}) {
  const names = await readdir(dir).catch((e) => {
    throw new Error(`cannot open the run folder: ${e.message}`)
  })
  const plan = await readJson(path.join(dir, 'plan.json'), true)
  const brief = await readJson(path.join(dir, 'brief.json'), false)
  const run = await readJson(path.join(dir, 'run.json'), false)
  const finalCopy = await readJson(path.join(dir, 'site-copy.json'), false)
  const copyV = latestVersion(names, 'copy', 'json')
  const copy = finalCopy ?? (copyV ? await readJson(path.join(dir, `copy-v${copyV}.json`), true) : null)
  if (!copy) throw new Error('the run folder has no site-copy.json and no copy-vN.json: no copy was written')
  const checkV = latestVersion(names, 'check', 'json')
  const check = checkV ? await readJson(path.join(dir, `check-v${checkV}.json`), true) : null
  const standing = await readText(path.join(dir, 'failures-standing.txt'))
  // The main menu with its dropdowns travels in the mapping export (extras.mainMenu), when the run had a content map.
  const mapping = await readJson(path.join(dir, 'mapping.json'), false)
  const mainMenu = mapping?.extras?.mainMenu ?? null
  const footerHeadings = mapping?.extras?.footerHeadings ?? []
  // The kit (template-kit.json) is not in a run folder; given, the page shows the kit's lists and the slots left alone.
  const kit = kitFile ? await readJson(kitFile, true) : null
  return {
    plan,
    brief,
    run,
    copy,
    check,
    checkVersion: checkV || null,
    standing,
    mainMenu,
    footerHeadings,
    kit
  }
}

async function listImages(dir, depth = 0) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && depth < MAX_DEPTH) out.push(...(await listImages(full, depth + 1)))
    else if (entry.isFile() && IMAGE_TYPES[path.extname(entry.name).toLowerCase()]) out.push(full)
  }
  return out
}

/**
 * Finds the 1440 image of each block id in a folder of kit images. A file belongs to a block when its name holds the
 * block id as a whole token ("block-2" matches "block-2-1440.png" but not "block-20-1440.png"); the 1440 one wins
 * over any other width, and a name that only says another width (390) is not used.
 * @param {string | null} dir
 * @returns {Promise<(blockId: string) => string | null>} the path of the image, or null
 */
export async function blockImageFinder(dir) {
  const files = dir ? await listImages(dir) : []
  return (blockId) => {
    const token = new RegExp(
      `(^|[^a-z0-9])${blockId.toLowerCase().replace(/[^a-z0-9]/g, '\\$&')}([^0-9a-z]|$)`
    )
    const hits = files.filter((f) => token.test(path.basename(f).toLowerCase()))
    const width = (f) =>
      path.basename(f).includes('1440') ? 0 : /390|768|1024/.test(path.basename(f)) ? 2 : 1
    return hits.sort((a, b) => width(a) - width(b) || a.localeCompare(b)).find((f) => width(f) < 2) ?? null
  }
}

/** One image file as a data URI. */
export async function imageDataUri(file) {
  const bytes = await readFile(file)
  return `data:${IMAGE_TYPES[path.extname(file).toLowerCase()]};base64,${bytes.toString('base64')}`
}
