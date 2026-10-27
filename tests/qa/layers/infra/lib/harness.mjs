// Shared helpers for the infra layer: paths, scratch trees, mutation application, contained
// evidence writes. Reads go through the shared bounded reader in tests/qa/lib.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoundedReadError, MAX_LAYER_FILE_BYTES, readBoundedSync } from '../../../lib/bounded-reader.mjs'

export const LAYER = 'infra'
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
export const LAYER_DIR = path.join(REPO, 'tests/qa/layers/infra')

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
export const fileSha = (file) => sha256(readRegular(file, null))

/** One digest over the regular files under the listed repo-relative paths (names + bytes, sorted; links are skipped). */
export function hashPaths(root, rels) {
  const lines = []
  const walk = (rel) => {
    let info
    try {
      info = lstatSync(path.join(root, rel))
    } catch {
      lines.push(`${rel} missing`)
      return
    }
    if (info.isDirectory()) {
      for (const name of readdirSync(path.join(root, rel)).sort()) walk(path.join(rel, name))
    } else if (info.isFile())
      lines.push(
        `${rel} ${sha256(readBoundedSync(path.join(root, rel), { maxBytes: MAX_LAYER_FILE_BYTES }))}`
      )
  }
  for (const rel of [...rels].sort()) walk(rel)
  return sha256(lines.join('\n'))
}

/** Raised when a harness-level assumption breaks; never a product verdict. */
export class HarnessError extends Error {}

/** An assertion tagged with the id of the case assertion it belongs to. */
export function step(assertionId, fn) {
  try {
    const out = fn()
    if (out && typeof out.then === 'function') {
      return out.catch((error) => {
        throw tag(error, assertionId)
      })
    }
    return out
  } catch (error) {
    throw tag(error, assertionId)
  }
}

function tag(error, assertionId) {
  if (error && typeof error === 'object' && !('assertionId' in error)) error.assertionId = assertionId
  return error
}

export const isAssertionFailure = (error) =>
  Boolean(error) && (error.code === 'ERR_ASSERTION' || error.name === 'AssertionError')

/**
 * Resolve a path under `base`, refusing anything that escapes it (evidence containment). Every
 * existing component below `base` is checked with lstat: a symlink anywhere on the way (parent or
 * target) is refused, so a link planted inside the scratch area cannot redirect a read, write or delete.
 */
export function containedPath(base, rel) {
  const root = path.resolve(base)
  assertNoUserSymlinks(root)
  const target = path.resolve(root, rel)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new HarnessError(`path escapes the output directory: ${rel}`)
  }
  let at = root
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    at = path.join(at, part)
    let info
    try {
      info = lstatSync(at)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break
      throw new HarnessError(`cannot inspect ${rel}: ${error.message}`)
    }
    if (info.isSymbolicLink()) throw new HarnessError(`symlink on the path, refused: ${rel}`)
  }
  return target
}

/**
 * Every component of an absolute path, from `/` down, must not be a symlink — except one owned by
 * root (the system's own `/var`, `/tmp`, `/etc` links). A link planted by a user or a test run in any
 * parent therefore cannot redirect a read, write or delete. Missing components end the walk.
 */
export function assertNoUserSymlinks(abs) {
  const full = path.resolve(abs)
  let at = path.parse(full).root
  for (const part of path.relative(at, full).split(path.sep).filter(Boolean)) {
    at = path.join(at, part)
    let info
    try {
      info = lstatSync(at)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return full
      throw new HarnessError(`cannot inspect ${at}: ${error.message}`)
    }
    if (info.isSymbolicLink() && info.uid !== 0) throw new HarnessError(`symlink on the path, refused: ${at}`)
  }
  return full
}

/** A regular file (not a symlink, FIFO, socket or directory); anything else is refused before it is read. */
export function assertRegularFile(file) {
  assertNoUserSymlinks(path.dirname(path.resolve(file)))
  let info
  try {
    info = lstatSync(file)
  } catch (error) {
    throw new HarnessError(`cannot inspect ${file}: ${error.message}`)
  }
  if (!info.isFile())
    throw new HarnessError(`not a regular file (symlink, FIFO or directory), refused: ${file}`)
  return file
}

/** Read a file through the shared bounded reader: regular, within the ceiling and stable while read. */
export function readRegular(file, encoding = 'utf8') {
  assertNoUserSymlinks(path.dirname(path.resolve(file)))
  try {
    const bytes = readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES })
    return encoding ? bytes.toString(encoding) : bytes
  } catch (error) {
    if (error instanceof BoundedReadError) throw new HarnessError(`refused: ${error.message}`)
    throw error
  }
}

export function writeEvidence(outDir, rel, text) {
  const target = containedPath(outDir, rel)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, text)
  return path.relative(outDir, target)
}

/**
 * Copy the listed repo-relative paths into `dest` (same relative layout) and link the listed
 * node_modules directories from the real tree. Symlinks inside copied paths are dereferenced
 * only when they stay inside the repo; others are skipped so a tree never reaches outside it.
 */
export function makeTree(dest, { copy, link = [] }, source = REPO) {
  rmSync(containedPath(path.dirname(dest), path.basename(dest)), { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const rel of copy) {
    const from = path.join(source, rel)
    if (!existsSync(from)) throw new HarnessError(`scratch copy source is missing: ${rel}`)
    const to = path.join(dest, rel)
    mkdirSync(path.dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true, verbatimSymlinks: true })
  }
  for (const rel of link) {
    const to = path.join(dest, rel)
    mkdirSync(path.dirname(to), { recursive: true })
    symlinkSync(path.join(source, rel), to)
  }
}

/**
 * Apply one mutation to a scratch tree: the FIRST match of `find` (string or RegExp) at or after
 * `after` (a string that must itself occur exactly once). A mutation that does not match is a
 * stale mutation (harness problem), never a RED proof. `find` strings must be unique unless
 * `after` scopes them.
 */
export function applyMutation(tree, mutation) {
  if (mutation.edits) {
    const parts = mutation.edits.map((edit, i) =>
      applyMutation(tree, { ...edit, id: `${mutation.id}#${i + 1}` })
    )
    return {
      before: sha256(parts.map((p) => p.before).join()),
      after: sha256(parts.map((p) => p.after).join())
    }
  }
  const file = containedPath(tree, mutation.file)
  if (!existsSync(file)) throw new HarnessError(`mutation target is missing: ${mutation.file}`)
  const before = readRegular(file)
  let from = 0
  if (mutation.after !== undefined) {
    const hits = before.split(mutation.after).length - 1
    if (hits !== 1) {
      throw new HarnessError(`mutation ${mutation.id}: anchor matched ${hits} times in ${mutation.file}`)
    }
    from = before.indexOf(mutation.after)
  }
  let start = -1
  let length = 0
  if (typeof mutation.find === 'string') {
    if (mutation.after === undefined) {
      const count = before.split(mutation.find).length - 1
      if (count !== 1) {
        throw new HarnessError(
          `mutation ${mutation.id} matched ${count} times in ${mutation.file}, expected 1`
        )
      }
    }
    start = before.indexOf(mutation.find, from)
    length = mutation.find.length
  } else {
    const re = new RegExp(mutation.find.source, mutation.find.flags.replace('g', '') + 'g')
    re.lastIndex = from
    const hit = re.exec(before)
    if (hit) {
      start = hit.index
      length = hit[0].length
    }
  }
  if (start < 0) throw new HarnessError(`mutation ${mutation.id} did not match in ${mutation.file}`)
  const after = before.slice(0, start) + mutation.replace + before.slice(start + length)
  assert.notEqual(after, before)
  writeFileSync(file, after)
  return { before: sha256(before), after: sha256(after) }
}
