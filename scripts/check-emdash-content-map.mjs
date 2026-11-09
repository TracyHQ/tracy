#!/usr/bin/env node
/**
 * Gate: the content map of an EmDash theme is GENERATED from the theme's own data (`seed/seed.json`,
 * `seed/field-map.json`, `seed/content-api-map.json`) by
 * `packages/cms/tracy-quickstart-tools/content-coverage/emdash-content-map.mjs`, and committed beside the theme's other
 * contract data as `contracts/<version>/content-map.json`. Road to live reads it for the slot roles, Slot fit and
 * content coverage of the release.
 *
 * WHY A MACHINE. Change a field's role, add an entry or a collection, and the committed map keeps describing the old
 * theme: the roles Road to live shows, the slots a coverage audit binds to and the `contentMapSha256` the coverage
 * file names all come from the stale map, and nothing errors. The Slot fit the audit measured into the map is ignored
 * by the comparison (it is not generated); everything else must be byte-for-byte what the generator writes now.
 * A coverage file that names another map than the committed one is stale too (Road to live would say so, late).
 *
 * A theme in `REQUIRED` with no committed map is RED. Compare, never regenerate.
 *
 *   node scripts/check-emdash-content-map.mjs [--root DIR]   # --root: a fixture tree, for tests
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  emdashContentMapOfTheme,
  serializeMap,
  withoutMeasured
} from '../packages/cms/tracy-quickstart-tools/content-coverage/lib/emdash-content-map.mjs'

export const REQUIRED = ['tracy-emdash-theme-diner', 'tracy-emdash-theme-restaurant']

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/**
 * The problems of one theme folder (empty: it is current).
 * @param {string} themeDir
 * @returns {string[]}
 */
export function problemsOfTheme(themeDir) {
  const name = path.basename(themeDir)
  if (!existsSync(themeDir)) return [`${name}: the theme folder is missing`]
  let built
  try {
    built = emdashContentMapOfTheme(themeDir)
  } catch (error) {
    return [
      `${name}: the map cannot be generated (${error instanceof Error ? error.message : String(error)})`
    ]
  }
  const dir = path.join(themeDir, 'contracts', built.version)
  const file = path.join(dir, 'content-map.json')
  const fix = `node packages/cms/tracy-quickstart-tools/content-coverage/emdash-content-map.mjs --theme packages/cms/${name} --write`
  if (!existsSync(file))
    return [`${name}: contracts/${built.version}/content-map.json is missing; run ${fix}`]
  const committed = withoutMeasured(JSON.parse(readFileSync(file, 'utf8')))
  const problems = []
  if (serializeMap(committed) !== serializeMap(withoutMeasured(built.map)))
    problems.push(
      `${name}: contracts/${built.version}/content-map.json is not what the theme's seed, field map and content API map generate; run ${fix} and measure again`
    )
  const coverage = path.join(dir, 'content-coverage.json')
  if (existsSync(coverage)) {
    const named = JSON.parse(readFileSync(coverage, 'utf8'))?.contract?.contentMapSha256
    if (named !== sha256(file))
      problems.push(
        `${name}: contracts/${built.version}/content-coverage.json measured another content map than the committed one; run emdash-audit.mjs --write again`
      )
  }
  return problems
}

export function problemsOfTree(root) {
  return REQUIRED.flatMap((name) => problemsOfTheme(path.join(root, 'packages', 'cms', name)))
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const i = process.argv.indexOf('--root')
  const root =
    i > 0
      ? path.resolve(process.argv[i + 1])
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const problems = problemsOfTree(root)
  for (const p of problems) console.error(`emdash-content-map: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`emdash-content-map: ${REQUIRED.length} theme content maps are current`)
}
