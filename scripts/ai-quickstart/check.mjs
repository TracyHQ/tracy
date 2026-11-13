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
 * A folder whose mapping file is written by a later ticket declares so with `mapping.pending.json`
 * (`{"ticket": "#<n>"}`) in place of `mapping.json`: the block store and the page recipes are checked alone, and the
 * line printed for the folder says the mapping is pending. Both files at once is a problem.
 *
 * Run without folders, it also checks the Tracy library (`domain/library/tracy-library.json` of the WO package, ticket
 * #596): blocks Tracy owns, declared in the block store format, by `checkLibraryDeclaration`; and every stylesheet of
 * the library folder for colour literals (`colourLiterals`, the check the block's own tests run), since a library block
 * takes its colours from template design variables only.
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
import { checkLibraryDeclaration } from '../../packages/wo/website-opportunities/domain/ai-quickstart-library.mjs'
import { colourLiterals } from '../../packages/wo/website-opportunities/domain/library-style-check.mjs'

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIBRARY_PATH = 'packages/wo/website-opportunities/domain/library/tracy-library.json'

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

/** The marker of a folder whose mapping file a later ticket writes. */
export const MAPPING_PENDING_FILE = 'mapping.pending.json'

/** The pending marker's problems and ticket, or null when the folder declares none. */
function readPending(dir) {
  if (!existsSync(path.join(dir, MAPPING_PENDING_FILE))) return null
  if (existsSync(path.join(dir, MAPPING_FILE)))
    return {
      problems: [
        { file: MAPPING_PENDING_FILE, at: '', message: `remove the marker, ${MAPPING_FILE} is written` }
      ]
    }
  const { doc, problem } = readDeclaration(dir, MAPPING_PENDING_FILE)
  if (problem) return { problems: [problem] }
  if (typeof doc?.ticket !== 'string' || !/^#\d+$/.test(doc.ticket))
    return {
      problems: [
        {
          file: MAPPING_PENDING_FILE,
          at: 'ticket',
          message: `name the ticket that writes ${MAPPING_FILE}, as "#<number>"`
        }
      ]
    }
  return { ticket: doc.ticket, problems: [] }
}

/** The problems of one AI quickstart folder: unreadable files first, then the contract check. */
export function checkAiQuickstartFolder(dir) {
  const pending = readPending(dir)
  const files = pending?.ticket
    ? [BLOCK_STORE_FILE, PAGE_RECIPES_FILE]
    : [BLOCK_STORE_FILE, PAGE_RECIPES_FILE, MAPPING_FILE]
  const read = files.map((file) => readDeclaration(dir, file))
  const unreadable = [...(pending?.problems ?? []), ...read.filter((r) => r.problem).map((r) => r.problem)]
  if (unreadable.length > 0) return { ok: false, blocks: 0, problems: unreadable }
  const [blockStore, pageRecipes, mapping] = read.map((r) => r.doc)
  const res = checkAiQuickstartContract({
    blockStore,
    pageRecipes,
    mapping,
    mappingPending: Boolean(pending)
  })
  return pending ? { ...res, mappingPending: pending.ticket } : res
}

/** Check the Tracy library declaration, print its line, and return how many problems it has. */
function checkLibrary() {
  const dir = path.dirname(path.join(DEFAULT_ROOT, LIBRARY_PATH))
  const { doc, problem } = readDeclaration(dir, path.basename(LIBRARY_PATH))
  const res = problem ? { blocks: 0, problems: [problem] } : checkLibraryDeclaration(doc)
  for (const p of res.problems) process.stderr.write(`${path.dirname(LIBRARY_PATH)}/${formatProblem(p)}\n`)
  process.stdout.write(
    `ai-quickstart-contract: ${LIBRARY_PATH}: ${res.blocks} library block(s), ${res.problems.length} problem(s)\n`
  )
  return res.problems.length
}

/** The colour literals of one library stylesheet, as problems of the gate. */
export function libraryStyleProblems(css, file) {
  return colourLiterals(css).map((literal) => ({
    file,
    at: '',
    message: `colour literal ${JSON.stringify(literal)}: a library block takes its colours from template design variables only`
  }))
}

/** Check every stylesheet of the library folder, print one line each, and return how many problems they have. */
function checkLibraryStyles() {
  const rel = path.dirname(LIBRARY_PATH)
  const dir = path.join(DEFAULT_ROOT, rel)
  let count = 0
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .sort()) {
    const problems = libraryStyleProblems(readFileSync(path.join(dir, file), 'utf8'), file)
    for (const p of problems) process.stderr.write(`${rel}/${formatProblem(p)}\n`)
    process.stdout.write(`ai-quickstart-contract: ${rel}/${file}: ${problems.length} colour literal(s)\n`)
    count += problems.length
  }
  return count
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
      `ai-quickstart-contract: ${rel}: ${res.blocks} block(s), ${res.problems.length} problem(s)${res.sharedPlaces ? `, ${res.sharedPlaces} stored place(s) shared by several fields (a build writes the smallest limit)` : ''}${res.mappingPending ? `, ${MAPPING_FILE} pending (${res.mappingPending})` : ''}\n`
    )
  }
  if (argv.length === 0) problemCount += checkLibrary() + checkLibraryStyles()
  process.stdout.write(
    `ai-quickstart-contract: ${folders.length} AI quickstart(s) checked, ${problemCount} problem(s)\n`
  )
  if (problemCount > 0) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
