// Safe file IO for the api layer: regular files only, contained output paths, atomic writes.
// Nothing here follows a symlink out of its directory or opens a FIFO (a read of a FIFO would hang).
import { createHash } from 'node:crypto'
import { lstatSync, writeFileSync, renameSync, mkdirSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { BoundedReadError, readBoundedSync } from '../../lib/bounded-reader.mjs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Ceiling for an input the api layer reads (denominator, case files, oracles). */
const MAX_INPUT_BYTES = 32 * 1024 * 1024

export class ContractError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ContractError'
  }
}

/** Read a regular, non-symlink, non-empty file through the shared bounded reader; anything else is a contract error. */
export function readRegular(path, { allowEmpty = false, maxBytes = MAX_INPUT_BYTES } = {}) {
  let buf
  try {
    buf = readBoundedSync(path, { maxBytes })
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    if (error.code === 'SYMLINK') throw new ContractError(`input ${path} is a symlink`)
    if (error.code === 'NOT_REGULAR' || error.code === 'REPLACED')
      throw new ContractError(`input ${path} is not a regular file`)
    if (error.code === 'MISSING' || error.code === 'UNREADABLE')
      throw new ContractError(`unreadable input ${path}: ${error.message}`)
    throw new ContractError(`input ${path}: ${error.message}`)
  }
  if (!allowEmpty && buf.length === 0) throw new ContractError(`input ${path} is empty`)
  return buf
}

export function readJson(path) {
  const buf = readRegular(path)
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch (error) {
    throw new ContractError(`input ${path} is not valid JSON: ${error.message}`)
  }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** `child` must resolve inside `root`, with no symlink on the way (checked on the existing prefix). */
export function contained(root, child) {
  const base = resolve(root)
  const target = isAbsolute(child) ? resolve(child) : resolve(base, child)
  const rel = relative(base, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel))
    throw new ContractError(`path ${child} escapes ${root}`)
  let probe = base
  for (const part of rel.split(sep)) {
    probe = join(probe, part)
    if (!existsSync(probe)) break
    if (lstatSync(probe).isSymbolicLink())
      throw new ContractError(`path ${child} crosses a symlink at ${probe}`)
  }
  return target
}

/** Create the output directory; refuse a symlink or a non-directory in its place. */
export function ensureOutDir(outDir) {
  const abs = resolve(outDir)
  if (existsSync(abs)) {
    const st = lstatSync(abs)
    if (st.isSymbolicLink() || !st.isDirectory())
      throw new ContractError(`output ${outDir} is not a plain directory`)
  } else mkdirSync(abs, { recursive: true })
  return realpathSync(abs)
}

/** Write a file atomically (temp + rename) inside outDir; the caller learns of a failure, not a half file. */
export function writeAtomic(outDir, rel, data) {
  const target = contained(outDir, rel)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, target)
  } catch (error) {
    try {
      rmSync(tmp, { force: true })
    } catch {}
    throw new ContractError(`cannot write ${rel}: ${error.code ?? error.message}`)
  }
  return rel
}

/** Stable JSON (sorted keys) so a regenerated file is byte-identical. */
export function stableStringify(value, space = 1) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])])
          )
        : v
  return `${JSON.stringify(sort(value), null, space)}\n`
}
