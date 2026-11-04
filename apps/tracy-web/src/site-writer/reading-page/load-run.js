// Reads a folder written by "site-writer-bench get" (and, optionally, a folder of the kit's block images) for the
// copy reading page. The only file system part of the page; everything after it is pure (model.js, render.js).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { blockImageFinder, imageDataUri } from '../../lib/kit-block-images.js'

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

export { blockImageFinder, imageDataUri }
