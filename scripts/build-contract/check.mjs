#!/usr/bin/env node
/**
 * The Contract B check (gate `build-contract`, ADRs 0046 and 0047, ticket #590).
 *
 * Contract B is what the build engine and the chat exchange: the build plan, progress events, the final outcome,
 * questions to the customer with their answers, and plan edits (format: `docs/references/build-contract.md`). This
 * reads every build scenario file (`*.build-scenario.json`) under `packages/` and `apps/`, the sample data the chat
 * renders from, and runs `checkBuildDocument` (WO domain, `build-contract.mjs`), which reports every mistake, not just
 * the first, each with its place.
 *
 *   node scripts/build-contract/check.mjs                 every build scenario file in the tree
 *   node scripts/build-contract/check.mjs <path>...       only those files, or the scenario files under those folders;
 *                                                         a given file may be any Contract B document
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUILD_SCENARIO_SUFFIX,
  checkBuildDocument,
  formatProblem
} from '../../packages/wo/website-opportunities/domain/build-contract.mjs'

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SEARCHED = ['packages', 'apps']

function findScenarios(dir, found) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findScenarios(full, found)
    else if (entry.isFile() && entry.name.endsWith(BUILD_SCENARIO_SUFFIX)) found.push(full)
  }
  return found
}

/** Every build scenario file under `packages/` and `apps/`. */
export function discoverBuildScenarios(rootDir = DEFAULT_ROOT) {
  return SEARCHED.flatMap((dir) => findScenarios(path.join(rootDir, dir), [])).sort()
}

/** The problems of one Contract B file: unreadable first, then the contract check. */
export function checkBuildContractFile(file) {
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return {
      ok: false,
      problems: [{ at: '', message: `not JSON: ${error instanceof Error ? error.message : error}` }]
    }
  }
  return checkBuildDocument(doc)
}

function main(argv) {
  const files =
    argv.length > 0
      ? argv.flatMap((p) => {
          const full = path.resolve(p)
          return existsSync(full) && statSync(full).isDirectory() ? findScenarios(full, []).sort() : [full]
        })
      : discoverBuildScenarios(DEFAULT_ROOT)
  let problemCount = 0
  for (const file of files) {
    const rel = path.relative(DEFAULT_ROOT, file) || file
    const res = existsSync(file)
      ? checkBuildContractFile(file)
      : { problems: [{ at: '', message: 'file is missing' }] }
    for (const problem of res.problems) process.stderr.write(`${formatProblem(rel, problem)}\n`)
    problemCount += res.problems.length
    process.stdout.write(`build-contract: ${rel}: ${res.problems.length} problem(s)\n`)
  }
  process.stdout.write(`build-contract: ${files.length} file(s) checked, ${problemCount} problem(s)\n`)
  if (files.length === 0 && argv.length === 0) {
    process.stderr.write('build-contract: no build scenario file found; the chat sample data is missing\n')
    process.exit(1)
  }
  if (problemCount > 0) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
