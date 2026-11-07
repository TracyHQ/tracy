// The WordPress page sections of a kit run (adapters/wordpress-sections.mjs), kept in the work folder as
// `wordpress-sections.json`: read from the site's database when the run has one (SELECT only), else from the file an
// earlier run wrote, so a later `assemble` without a database splits the pages the same way.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { useWordPressSections } from '../contract-read.mjs'
import { adapterFor } from './adapters/index.mjs'
import { siteSource } from './adapters/source.mjs'
import { postSections } from './adapters/wordpress-sections.mjs'

export const SECTIONS_FILE = 'wordpress-sections.json'

/**
 * Settle the sections every read of the contract map splits WordPress pages by, for this run; a Joomla run is left
 * as it is. Returns how many pages were split and where the sections came from.
 * @param {{platform: string|undefined, out: string, db?: string, dbCommand?: string}} a
 */
export function settleWordPressSections({ platform, out, db, dbCommand }) {
  if (String(platform ?? '').toLowerCase() !== 'wordpress') return null
  const file = join(out, SECTIONS_FILE)
  let sections = null
  let from = 'none'
  if (db || dbCommand) {
    const contents = adapterFor('wordpress', siteSource({ db, dbCommand })).pageContents()
    if (contents) {
      sections = Object.fromEntries(Object.entries(contents).map(([id, c]) => [id, postSections(c)]))
      writeFileSync(file, `${JSON.stringify(sections, null, 1)}\n`)
      from = 'database'
    }
  }
  if (!sections && existsSync(file)) {
    sections = JSON.parse(readFileSync(file, 'utf8'))
    from = SECTIONS_FILE
  }
  useWordPressSections(sections)
  return { pages: Object.keys(sections ?? {}).length, from }
}
