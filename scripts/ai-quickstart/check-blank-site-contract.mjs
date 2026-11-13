/**
 * The blank site contract part of the AI quickstart contract check (gate `ai-quickstart-contract`, ticket #584).
 *
 * A Joomla AI quickstart folder whose mapping file is written (`packages/cms/tracy-joomla-quickstart/ai-quickstarts/
 * <slug>/<cms>/<version>/`) carries the contract its blank site is bound to, `blank-site-contract/` (made by
 * `blank-site.mjs --contract`). This reads it and the released contract it names (`blankSiteOf.contract`, under
 * `packages/cms/tracy-joomla-quickstart/contracts/`) and runs `checkBlankSiteContract`. Needs php on PATH: the samples
 * of the places the blank site empties are made by the function the blank site step uses.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BLANK_CONTRACT_DIR,
  BLANK_CONTRACT_FILES
} from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract.mjs'
import { checkBlankSiteContract } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract-check.mjs'

const JOOMLA = 'packages/cms/tracy-joomla-quickstart'

/** Whether a folder is a Joomla AI quickstart folder of the tree, the kind that carries a blank site contract. */
export function needsBlankSiteContract(dir, rootDir) {
  const rel = path.relative(rootDir, dir).split(path.sep).join('/')
  return rel.startsWith(`${JOOMLA}/ai-quickstarts/`)
}

/** The problems of a folder's blank site contract. `mapping` is its parsed mapping file. */
export function blankSiteContractProblems(dir, mapping, rootDir) {
  const problem = (file, at, message) => [{ file: `${BLANK_CONTRACT_DIR}/${file}`, at, message }]
  const blank = {}
  for (const [name, file] of [
    ['manifest', 'manifest.json'],
    ['contentMap', 'content-map.json'],
    ['lock', 'presentation-lock.json']
  ]) {
    const full = path.join(dir, BLANK_CONTRACT_DIR, file)
    if (!existsSync(full))
      return problem(
        file,
        '',
        'file is missing: make it with blank-site.mjs --mapping --contract --contract-out'
      )
    try {
      blank[name] = JSON.parse(readFileSync(full, 'utf8'))
    } catch (error) {
      return problem(file, '', `not JSON: ${error instanceof Error ? error.message : error}`)
    }
  }
  const of = blank.manifest.blankSiteOf?.contract
  const releasedDir = typeof of === 'string' ? path.join(rootDir, JOOMLA, 'contracts', of) : null
  if (!releasedDir || !existsSync(path.join(releasedDir, 'manifest.json')))
    return problem(
      'manifest.json',
      'blankSiteOf.contract',
      `names no released contract under ${JOOMLA}/contracts/`
    )
  const raw = Object.fromEntries(
    BLANK_CONTRACT_FILES.map((f) => [f, readFileSync(path.join(releasedDir, f))])
  )
  const json = (f) => JSON.parse(raw[f].toString('utf8'))
  return checkBlankSiteContract({
    mapping,
    released: {
      manifest: json('manifest.json'),
      contentMap: json('content-map.json'),
      lock: json('presentation-lock.json'),
      sha256: Object.fromEntries(
        BLANK_CONTRACT_FILES.map((f) => [f, createHash('sha256').update(raw[f]).digest('hex')])
      )
    },
    blank
  })
}
