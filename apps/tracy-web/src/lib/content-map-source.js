// Shared: the site writer and the write step bench read it, so it lives in lib/ (module-graph.test.mjs).
// The content map of a kit's contract, for the main menu dropdowns (main-menu.js). It is read the way the kit is
// (lib/template-kit-source.js openKit): from the contract folder the contract index names, where content-map.json
// sits beside template-kit.json (the image ships both through the same Dockerfile COPY). A run stores the sha256 of
// the bytes it read at start, and refuses to go on when the file changed, so a run stays reproducible.
//
// A WordPress menu is a wp_navigation post, which the content map does not hold: for a WordPress contract the theme's
// navigation (navigation-source.json, captured from the release) rides on the doc as `navigationSource`, and the sha256
// covers both files. The main menu reads it (main-menu-wordpress.js); a Joomla content map is returned as it is.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defaultContracts } from './contracts.js'

export const CONTENT_MAP_FILE = 'content-map.json'
export const NAVIGATION_SOURCE_FILE = 'navigation-source.json'

/** The bytes of the contract's navigation source, or null when it has none. */
function navigationBytes(contract) {
  if (contract.platform !== 'wordpress') return null
  try {
    return readFileSync(path.join(contract.dir, NAVIGATION_SOURCE_FILE))
  } catch {
    return null
  }
}

/**
 * The content map of the contract `ref`: { doc, sha256 }, or null when the contract has no content map (or the kit is
 * unknown). A content map that is not valid JSON is null too, with `invalid` set, so a start can refuse it.
 * @param {string} ref the contract id, e.g. "ja-boxing/j6/1.0.10"
 * @param {{ index?: Map<string, { id: string, dir?: string, platform?: string }> }} [options]
 * @returns {{ doc: object, sha256: string } | { doc: null, sha256: null, invalid?: string } | null}
 */
export function openContentMap(ref, { index = defaultContracts() } = {}) {
  for (const contract of index.values()) {
    if (contract.id !== ref) continue
    if (!contract.dir) return { doc: null, sha256: null }
    let bytes
    try {
      bytes = readFileSync(path.join(contract.dir, CONTENT_MAP_FILE))
    } catch {
      return { doc: null, sha256: null }
    }
    const nav = navigationBytes(contract)
    const hash = createHash('sha256').update(bytes)
    if (nav) hash.update(nav)
    const sha256 = hash.digest('hex')
    let doc
    try {
      doc = JSON.parse(bytes.toString('utf8'))
    } catch {
      return { doc: null, sha256: null, invalid: `${CONTENT_MAP_FILE} of ${ref} is not valid JSON` }
    }
    if (!nav) return { doc, sha256 }
    try {
      return { doc: { ...doc, navigationSource: JSON.parse(nav.toString('utf8')) }, sha256 }
    } catch {
      return { doc: null, sha256: null, invalid: `${NAVIGATION_SOURCE_FILE} of ${ref} is not valid JSON` }
    }
  }
  return null
}
