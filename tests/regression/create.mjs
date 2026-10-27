#!/usr/bin/env node
/**
 * Create a new regression case under a PR-owned id:
 *
 *   node tests/regression/create.mjs --pr 912 --slug backup-button-enabled --input /tmp/case.json
 *
 * writes `tests/regression/cases/REG-PR-912-backup-button-enabled.json` and prints its id.
 *
 * WHY A MACHINE AND NOT "PICK THE NEXT NUMBER". Until 04/10/2026 a new case took the number after
 * the highest one in the folder. Two branches cut the same hour read the same highest number, took
 * the same next one with different slugs, and git merged both without a conflict because the file
 * names differed; the duplicate id then turned the catalogue red in every pull request cut after
 * the second merge (10 of 28 red CI runs reviewed on 04/10/2026). Nothing a person reads in their
 * own checkout can see the other branch, so no amount of care picks a free number. The pull
 * request number is the one value GitHub already hands out exactly once: this script only ever
 * forms `REG-PR-<that number>-<slug>`, never looks for a "next" id, and never renumbers a case.
 *
 * WHAT IT REFUSES, WRITING NOTHING:
 *   - a PR number that is not a positive whole number, a slug that is not lowercase-kebab;
 *   - an input that is not a regular file holding one valid case (`validateCase`), or that
 *     already names a different `id` or `pr`;
 *   - a destination that already exists. The file is opened with `wx` (create, fail if anything
 *     is there — a file, a symlink, a pipe), so the same PR reusing a slug, or two runs racing,
 *     gets one winner and one refusal, and an existing case is never overwritten.
 * If the write itself fails, the incomplete file this run created is removed; if even that fails,
 * the error names the file left behind.
 *
 * `--input` holds the case fields (`kind`, `title`, `area`, `cms`, `needs`, `flaky_model`,
 * `steps`, `expect`, `selectors`, optional extras); `id` and `pr` come from the arguments. The PR
 * number exists before the case does: open the pull request as a draft first.
 *
 * Bare `node`, nothing installed — like the gate and the runner that share `catalogue.mjs`.
 */
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CASES_DIR, casePath, prCaseId, validateCase } from './catalogue.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Largest input read. A case is a few kilobytes; this only stops a wrong path from being slurped. */
export const MAX_INPUT_BYTES = 1024 * 1024

const FLAGS = ['--pr', '--slug', '--input']

/**
 * Parse argv. Every flag is required, takes one value, and may repeat only with the same value.
 * @param {string[]} argv - arguments after the script path.
 * @returns {{pr: string, slug: string, input: string}} raw values, not yet validated.
 */
export function parseCreateArgs(argv) {
  /** @type {Record<string, string>} */
  const seen = {}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!FLAGS.includes(flag)) throw new Error(`unknown argument ${flag}`)
    const value = argv[++i]
    if (value === undefined || value === '' || FLAGS.includes(value)) throw new Error(`${flag} needs a value`)
    if (seen[flag] !== undefined && seen[flag] !== value)
      throw new Error(`${flag} given twice with different values (${seen[flag]}, ${value})`)
    seen[flag] = value
  }
  const missing = FLAGS.filter((flag) => seen[flag] === undefined)
  if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`)
  return { pr: seen['--pr'], slug: seen['--slug'], input: seen['--input'] }
}

/**
 * Build the case file's text from the arguments and the input text, pure.
 * @param {{pr: string | number, slug: string, inputText: string}} input - the arguments and the input file's contents.
 * @returns {{ok: true, id: string, path: string, text: string} | {ok: false, problems: string[]}} the file to write, or why not.
 */
export function buildCase({ pr, slug, inputText }) {
  const formed = prCaseId(pr, slug)
  if (!formed.ok) return formed
  let fields
  try {
    fields = JSON.parse(inputText)
  } catch (error) {
    return { ok: false, problems: [`--input is not valid JSON: ${/** @type {Error} */ (error).message}`] }
  }
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields))
    return { ok: false, problems: ['--input must hold one JSON object'] }
  const problems = []
  if (fields.id !== undefined && fields.id !== formed.id)
    problems.push(`--input says id ${JSON.stringify(fields.id)}, the arguments make ${formed.id}`)
  if (fields.pr !== undefined && fields.pr !== formed.pr)
    problems.push(`--input says pr ${JSON.stringify(fields.pr)}, --pr says ${String(formed.pr)}`)
  if (problems.length > 0) return { ok: false, problems }
  // `id`, `kind`, `title`, `pr` lead the file, as in every existing case; the rest keeps its order.
  const rest = { ...fields }
  for (const key of ['id', 'kind', 'title', 'pr']) delete rest[key]
  const value = { id: formed.id, kind: fields.kind, title: fields.title, pr: formed.pr, ...rest }
  const path = casePath(formed.id)
  const invalid = validateCase(value, path)
  if (invalid.length > 0) return { ok: false, problems: invalid }
  return { ok: true, id: formed.id, path, text: `${JSON.stringify(value, null, 2)}\n` }
}

/**
 * Read a regular file without following a symlink or blocking on a pipe.
 * @param {string} path - file to read.
 * @param {typeof fs} [io] - file system (replaced in tests to inject failures).
 * @returns {string} its text.
 */
export function readRegularFile(path, io = fs) {
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants
  let fd
  try {
    // O_NOFOLLOW: a symlink is refused (ELOOP), not followed. O_NONBLOCK: opening a FIFO nobody
    // writes to returns at once instead of hanging; the type check below then refuses it.
    fd = io.openSync(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
  } catch (error) {
    const e = /** @type {NodeJS.ErrnoException} */ (error)
    throw new Error(
      `cannot read --input ${path}: ${e.code === 'ELOOP' ? 'it is a symbolic link' : e.message}`
    )
  }
  try {
    const stat = io.fstatSync(fd)
    if (!stat.isFile()) throw new Error(`cannot read --input ${path}: not a regular file`)
    if (stat.size > MAX_INPUT_BYTES)
      throw new Error(`cannot read --input ${path}: larger than ${String(MAX_INPUT_BYTES)} bytes`)
    return io.readFileSync(fd, 'utf8')
  } finally {
    io.closeSync(fd)
  }
}

/**
 * Create a file that must not exist yet, and write all of `text` to it. On any failure after the
 * file was created, the file is removed again: a half-written case must not stay in the catalogue.
 * When the removal fails too, the error says the file is still there instead of claiming it is gone.
 * @param {string} dest - absolute path.
 * @param {string} text - contents.
 * @param {typeof fs} [io] - file system (replaced in tests to inject failures).
 */
export function writeExclusive(dest, text, io = fs) {
  let fd
  try {
    // `wx` = O_CREAT | O_EXCL: fails with EEXIST if anything is at the path, a dangling symlink
    // or a pipe included, and never opens what is there.
    fd = io.openSync(dest, 'wx', 0o644)
  } catch (error) {
    const e = /** @type {NodeJS.ErrnoException} */ (error)
    if (e.code === 'EEXIST')
      throw new Error(
        `${dest} already exists — nothing was written. A slug is used once per pull request: ` +
          'pick another slug for a new case, or edit the existing file to change that case.'
      )
    throw new Error(`cannot create ${dest}: ${e.message}`)
  }
  let open = true
  try {
    io.writeFileSync(fd, text)
    open = false
    io.closeSync(fd)
  } catch (error) {
    if (open) {
      try {
        io.closeSync(fd)
      } catch {
        // The descriptor is gone either way; the removal below is what matters.
      }
    }
    const why = /** @type {Error} */ (error).message
    try {
      io.unlinkSync(dest)
    } catch (cleanup) {
      // Say so: the half-written file is still in the cases folder and would break the catalogue.
      throw new Error(
        `could not write ${dest}: ${why} — and the incomplete file could NOT be removed ` +
          `(${/** @type {Error} */ (cleanup).message}): delete it by hand before anything reads the catalogue`
      )
    }
    throw new Error(`could not write ${dest}: ${why} — the incomplete file was removed`)
  }
}

/**
 * Create one case file.
 * @param {{root: string, pr: string | number, slug: string, input: string}} options - repository root and the arguments.
 * @param {typeof fs} [io] - file system (replaced in tests to inject failures).
 * @returns {{id: string, path: string}} the new case's id and repo-relative path.
 */
export function createCase({ root, pr, slug, input }, io = fs) {
  // Arguments first: a bad number or slug is refused before any file is opened.
  const formed = prCaseId(pr, slug)
  if (!formed.ok) throw new Error(formed.problems.join('; '))
  const built = buildCase({ pr, slug, inputText: readRegularFile(input, io) })
  if (!built.ok) throw new Error(built.problems.join('; '))
  // `resolve` drops the trailing slash: `lstat` of `link/` would follow the link it is asked about.
  const dir = resolve(root, CASES_DIR)
  let stat
  try {
    stat = io.lstatSync(dir)
  } catch (error) {
    throw new Error(`cannot find the cases folder ${dir}: ${/** @type {Error} */ (error).message}`)
  }
  if (!stat.isDirectory()) throw new Error(`${dir} is not a folder (a symlink is not accepted)`)
  writeExclusive(join(root, built.path), built.text, io)
  return { id: built.id, path: built.path }
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const created = createCase({ root: ROOT, ...parseCreateArgs(process.argv.slice(2)) })
    process.stdout.write(
      `${created.id}\ncreated ${created.path}\n` +
        `next: pnpm exec biome format --write ${created.path}\n` +
        `      node tests/regression/run.mjs --stand <url> --id ${created.id}\n`
    )
  } catch (error) {
    process.stderr.write(
      `create.mjs: ${/** @type {Error} */ (error).message}\n` +
        'usage: node tests/regression/create.mjs --pr <PR number> --slug <lowercase-kebab> --input <case.json>\n'
    )
    process.exit(2)
  }
}
