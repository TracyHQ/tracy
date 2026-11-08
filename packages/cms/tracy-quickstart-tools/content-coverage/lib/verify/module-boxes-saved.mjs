// The module boxes of a run, saved beside its evidence (<out>/module-boxes.json) so that a later --reclassify after a
// content-map-only change does not open every page in the browser again. findings.json already holds everything the
// classify step reads (items with their per-viewport rects, selectors, looks, the shots); the boxes of the module
// wrappers and article containers that the label judge locates components with are the one thing it lacked.
//
// Reuse is allowed only when the site is provably the same one the boxes were read from: the fingerprint of every
// input the boxes depend on (site address, database dump sha256, webroot tree hash, the audited page list, and the
// source of the code that reads them) must match the saved one. A missing input, a missing fingerprint, a mismatch
// or a saved run with failed pages reads the pages in the browser again, and says why on stderr. `trust` (the cli's
// --trust-saved-boxes) skips the check and is logged as TRUSTED: for a one-off proof only.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openContext as defaultOpenContext } from '../render.mjs'
import { moduleBoxes } from './module-boxes.mjs'

export const MODULE_BOXES_FILE = 'module-boxes.json'
export const MODULE_BOXES_FORMAT = 'module-boxes/1'

const HERE = dirname(fileURLToPath(import.meta.url))
/** The code whose output the saved boxes are: a change to how pages are opened or boxes are read voids them. */
const TOOL_FILES = [
  join(HERE, 'module-boxes.mjs'),
  join(HERE, '..', 'render.mjs'),
  fileURLToPath(import.meta.url)
]
// Written while a site runs, never part of what it renders.
const SKIP_DIRS = new Set(['cache', 'tmp', 'logs', '.git', 'node_modules'])

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** One hash over every file of a tree: relative path and content, in a stable order. */
function treeHash(root) {
  const h = createHash('sha256')
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full)
      } else if (e.isFile()) {
        h.update(`${relative(root, full).split(sep).join('/')}\0`)
        h.update(readFileSync(full))
        h.update('\0')
      }
    }
  }
  walk(root)
  return h.digest('hex')
}

/**
 * @param {{ site: string, dbDump?: string | null, webroot?: string | null, pages: { n: number, url: string }[] }} input
 * @returns {{ format: string, site: string, dbDump: string | null, webroot: string | null, pages: string, tool: string }}
 */
export function inputFingerprint({ site, dbDump = null, webroot = null, pages }) {
  return {
    format: MODULE_BOXES_FORMAT,
    site,
    dbDump: dbDump && existsSync(dbDump) ? sha256(readFileSync(dbDump)) : null,
    webroot: webroot && existsSync(webroot) ? treeHash(webroot) : null,
    pages: sha256(JSON.stringify(pages.map((p) => [p.n, p.url]))),
    tool: sha256(TOOL_FILES.map((f) => readFileSync(f, 'utf8')).join('\0'))
  }
}

/** Why the saved boxes cannot be reused, or null when they can. */
function refusal(saved, fingerprint) {
  if (!saved) return 'no saved module boxes'
  if (!saved.fingerprint) return 'the saved module boxes have no fingerprint (an older run)'
  if (!fingerprint.dbDump) return 'no database dump to prove the site unchanged'
  if (!fingerprint.webroot) return 'no webroot to prove the site unchanged'
  const differ = Object.keys(fingerprint).filter((k) => saved.fingerprint[k] !== fingerprint[k])
  if (differ.length) return `the input fingerprint does not match (${differ.join(', ')})`
  if (saved.failures?.length) return `the saved run had ${saved.failures.length} failed pages`
  return null
}

function readSaved(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * The module boxes for this run: the saved ones when the fingerprint proves the site unchanged, else read in the
 * browser (and saved with the fingerprint for the next run). `reuse` false (a full audit run): always the browser.
 * @returns {Promise<{ boxes: Record<string, any>, failures: any[], source: 'saved' | 'browser' }>}
 */
export async function readModuleBoxes({
  chromium,
  openContext = defaultOpenContext,
  findings,
  outDir,
  fingerprint,
  trust = false,
  reuse = true,
  log = (line) => console.error(line)
}) {
  const file = join(outDir, MODULE_BOXES_FILE)
  const saved = readSaved(file)
  const why = reuse ? refusal(saved, fingerprint) : 'a full run reads the site again'
  if (reuse && saved?.boxes && (!why || trust)) {
    log(
      why
        ? `[modules] TRUSTED: reusing saved module boxes although ${why} (--trust-saved-boxes)`
        : '[modules] reusing saved module boxes: the input fingerprint matches, no page opened'
    )
    return { boxes: saved.boxes, failures: saved.failures ?? [], source: 'saved' }
  }
  log(`[modules] reading module boxes in the browser: ${why}`)
  const read = await moduleBoxes({ chromium, openContext, findings })
  writeFileSync(
    file,
    `${JSON.stringify({ format: MODULE_BOXES_FORMAT, fingerprint, savedAt: new Date().toISOString(), ...read })}\n`
  )
  return { ...read, source: 'browser' }
}
