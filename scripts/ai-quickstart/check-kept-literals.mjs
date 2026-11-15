/**
 * The parts of the AI quickstart contract check (ticket #587) that read the files the source contract locks
 * (`presentation-lock.json` `files`, under `packages/cms/tracy-joomla-quickstart/contracts/<kit>/`):
 *   - every `keptLiterals[].file` of the mapping file is a file of the template release the contract locks, so the
 *     words it keeps are words a file of that release writes;
 *   - `look.favicon.path` is a file the release ships, the one the build replaces with the site icon it makes.
 * The shape of both is checked by the domain (`ai-quickstart-kit-declarations.mjs`).
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'

/** The release files the source contract `<slug>/<cms>/<version>` locks, or null when it is not in the tree. */
export function lockedFiles(contract, rootDir) {
  const file = path.join(rootDir, CONTRACTS, String(contract), 'presentation-lock.json')
  if (typeof contract !== 'string' || !existsSync(file)) return null
  const files = JSON.parse(readFileSync(file, 'utf8')).files
  return new Set(files && typeof files === 'object' ? Object.keys(files) : [])
}

/** The problems of the kept literals and the site icon of a mapping file against the files of its source contract. */
export function keptLiteralFileProblems(mapping, blockStore, rootDir) {
  const files = lockedFiles(blockStore?.draftedBy?.kit, rootDir)
  if (!files) return []
  const out = []
  const list = Array.isArray(mapping?.keptLiterals) ? mapping.keptLiterals : []
  list.forEach((entry, i) => {
    if (typeof entry?.file === 'string' && !files.has(entry.file))
      out.push({
        file: 'mapping.json',
        at: `keptLiterals[${i}].file`,
        message: `${entry.file} is no file of the template release the source contract locks`
      })
  })
  const icon = mapping?.look?.favicon?.path
  if (typeof icon === 'string' && !files.has(icon))
    out.push({
      file: 'mapping.json',
      at: 'look.favicon.path',
      message: `${icon} is no file of the template release the source contract locks`
    })
  return out
}
