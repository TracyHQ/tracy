#!/usr/bin/env node
/**
 * The AI quickstart contract check (gate `ai-quickstart-contract`, ADR 0046, ticket #581).
 *
 * An AI quickstart folder holds three declarations: `block-store.json`, `page-recipes.json` and `mapping.json`
 * (format: `docs/references/ai-quickstart-contract.md`). This reads each folder and runs `checkAiQuickstartContract`
 * (WO domain, `ai-quickstart-contract.mjs`), which reports every mistake, not just the first, each with its file and
 * place. A folder is any folder under `packages/cms/` that holds a `block-store.json`; the other two files must sit
 * beside it.
 *
 *   node scripts/ai-quickstart/check.mjs                  every AI quickstart folder in the tree
 *   node scripts/ai-quickstart/check.mjs <folder>...      only those (a template packager's own draft)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BLOCK_STORE_FILE,
  MAPPING_FILE,
  PAGE_RECIPES_FILE,
  checkAiQuickstartContract,
  formatProblem
} from '../../packages/wo/website-opportunities/domain/ai-quickstart-contract.mjs'

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function findFolders(dir, found) {
  if (!existsSync(dir)) return found
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.some((e) => e.isFile() && e.name === BLOCK_STORE_FILE)) found.push(dir)
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      findFolders(path.join(dir, entry.name), found)
    }
  }
  return found
}

/** Every AI quickstart folder under `packages/cms/`. */
export function discoverAiQuickstartFolders(rootDir = DEFAULT_ROOT) {
  return findFolders(path.join(rootDir, 'packages/cms'), []).sort()
}

/** A declaration file parsed, or a problem saying why it could not be read. */
function readDeclaration(dir, file) {
  const full = path.join(dir, file)
  if (!existsSync(full)) return { problem: { file, at: '', message: 'file is missing' } }
  try {
    return { doc: JSON.parse(readFileSync(full, 'utf8')) }
  } catch (error) {
    return {
      problem: { file, at: '', message: `not JSON: ${error instanceof Error ? error.message : error}` }
    }
  }
}

/** The problems of one AI quickstart folder: unreadable files first, then the contract check. */
export function checkAiQuickstartFolder(dir) {
  const read = [BLOCK_STORE_FILE, PAGE_RECIPES_FILE, MAPPING_FILE].map((file) => readDeclaration(dir, file))
  const unreadable = read.filter((r) => r.problem).map((r) => r.problem)
  if (unreadable.length > 0) return { ok: false, blocks: 0, problems: unreadable }
  const [blockStore, pageRecipes, mapping] = read.map((r) => r.doc)
  return checkAiQuickstartContract({ blockStore, pageRecipes, mapping })
}

function main(argv) {
  const folders =
    argv.length > 0 ? argv.map((d) => path.resolve(d)) : discoverAiQuickstartFolders(DEFAULT_ROOT)
  let problemCount = 0
  for (const dir of folders) {
    const rel = path.relative(DEFAULT_ROOT, dir) || dir
    const res = checkAiQuickstartFolder(dir)
    for (const problem of res.problems) process.stderr.write(`${rel}/${formatProblem(problem)}\n`)
    problemCount += res.problems.length
    process.stdout.write(
      `ai-quickstart-contract: ${rel}: ${res.blocks} block(s), ${res.problems.length} problem(s)\n`
    )
  }
  process.stdout.write(
    `ai-quickstart-contract: ${folders.length} AI quickstart(s) checked, ${problemCount} problem(s)\n`
  )
  if (problemCount > 0) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
