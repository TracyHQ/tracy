// Shared stdout handling for the gate CLIs. By default a CLI prints ONE bounded summary line and the
// path of the complete JSON result, which is written to a file; `--json` prints the complete result
// instead. What a CLI decides (exit code, result content) is never touched here — only where it is shown.
import { createHash, randomBytes } from 'node:crypto'
import { lstatSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const SUMMARY_MAX = 200

/** One physical line: control characters (newlines, escapes) become spaces, length bounded with an ellipsis. */
export function oneLine(value, max = 120) {
  const s = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Remove `--json` (and, unless `out: false`, `--out <file>`) from an argument list.
 * @returns {{argv: string[], json: boolean, out: string|null}}
 */
export function takeOutputFlags(argv, { out = true } = {}) {
  const rest = []
  let json = false
  let outFile = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true
    else if (out && argv[i] === '--out') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error('--out needs a file')
      outFile = argv[++i]
    } else rest.push(argv[i])
  }
  return { argv: rest, json, out: outFile }
}

/** `k=v` tokens for the scalar fields of a result (arrays by length), `ok` first, bounded to one line. */
export function summarizeResult(result, max = SUMMARY_MAX) {
  const tokens = []
  const entries = Object.entries(result ?? {}).sort(([a], [b]) => (a === 'ok' ? -1 : b === 'ok' ? 1 : 0))
  for (const [key, value] of entries) {
    if (Array.isArray(value)) tokens.push(`${key}=${value.length}`)
    else if (typeof value === 'boolean' || typeof value === 'number') tokens.push(`${key}=${value}`)
    else if (typeof value === 'string' && value.length <= 60) tokens.push(`${key}=${oneLine(value, 60)}`)
  }
  return oneLine(tokens.join(' ') || 'done', max)
}

/** Deterministic location of a result when `--out` is not given: outside every input directory. */
export function defaultOutPath(script, label, key) {
  const id = createHash('sha256').update(`${process.cwd()}\0${key}`).digest('hex').slice(0, 10)
  return path.join(tmpdir(), 'tracy-cli', `${script}-${label}-${id}.json`)
}

// The real location of a path, left entirely to the operating system: the longest existing prefix of the path AS
// WRITTEN is resolved by realpath (symlinks, ".." after a symlink and the platform's own separators are the
// kernel's business, not re-implemented here), and what does not exist yet is appended. Used for the protected
// inputs, whose paths may carry "..", and for the destination.
export function realOf(p) {
  let head = String(p)
  const tail = []
  for (;;) {
    try {
      // .native is realpath(3): the JS realpathSync collapses `link/..` lexically before it looks at the link
      const real = realpathSync.native(head)
      return tail.length ? path.join(real, ...tail) : real
    } catch {}
    const i = head.lastIndexOf(path.sep)
    if (i < 0) {
      tail.unshift(head)
      head = '.'
    } else {
      tail.unshift(head.slice(i + 1))
      head = i === 0 ? path.sep : head.slice(0, i)
    }
  }
}

/**
 * The one accepted form of a result destination: a path without ".." segments (a lexical `link/..` would
 * name another place than the filesystem walks to), that is not a symlink, directory or hard-linked file,
 * and that is not — by real location or by inode — a file the command reads or owns, nor inside a directory
 * it reads or owns. A `protect` entry is a file path or a directory; empty entries are skipped.
 */
export function assertNotProtected(file, protect = []) {
  const shown = encodeField(file)
  if (String(file).split(/[\\/]+/).includes('..')) throw new Error(`--out ${shown}: a path with ".." is not accepted; give it without`)
  let own = null
  try {
    own = lstatSync(file)
  } catch {}
  if (own && own.isSymbolicLink()) throw new Error(`--out ${shown} is a symbolic link; the result is written to a plain file`)
  if (own && !own.isFile()) throw new Error(`--out ${shown} exists and is not a regular file`)
  if (own && own.nlink > 1) throw new Error(`--out ${shown} is hard-linked to another name; the result must not replace shared content`)
  const target = realOf(file)
  for (const p of protect.filter(Boolean)) {
    const prot = realOf(p)
    let st = null
    try {
      st = statSync(prot)
    } catch {}
    const sameFile = own && st && st.isFile() && st.dev === own.dev && st.ino === own.ino
    if (target === prot || sameFile || (st?.isDirectory() && target.startsWith(prot + path.sep)))
      throw new Error(`--out ${shown} is an input or evidence of this command (${encodeField(p)}); the result must not replace it`)
  }
}

/**
 * Write a result: destination checked, then a new uniquely named file (`wx`: it can never be an existing
 * file) beside it, then renamed over the destination.
 */
export function writeResultFile(file, result, protect = []) {
  assertNotProtected(file, protect)
  const dir = path.dirname(path.resolve(file))
  mkdirSync(dir, { recursive: true })
  assertNotProtected(file, protect)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  renameSync(tmp, file)
  return file
}

/**
 * A value as one printable field: control characters, `%` and any `extra` character become `%XX`, so a path or
 * id with a newline, tab or separator keeps the row shape and decodes back exactly (decodeURIComponent).
 */
export function encodeField(value, extra = '') {
  const bad = new RegExp(`[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029%${extra.replace(/[\\\]^-]/g, '\\$&')}]`, 'g')
  return String(value).replace(bad, (c) => encodeURIComponent(c).replace(/^[^%]$/, (x) => `%${x.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`))
}

/**
 * Print a result. `json`: the complete JSON on stdout (and to `out` when given). Otherwise the complete
 * JSON goes to `out` (or the deterministic default) and stdout gets one summary line with its path.
 * @param {{result: object, json: boolean, out?: string|null, script: string, label: string, key?: string, summary?: string, protect?: string[]}} o
 * @returns {string|null} the file written
 */
export function emitResult({ result, json, out = null, script, label, key = label, summary, protect = [] }) {
  if (json) {
    const file = out ? writeResultFile(out, result, protect) : null
    console.log(JSON.stringify(result, null, 2))
    return file
  }
  const file = writeResultFile(out ?? defaultOutPath(script, label, key), result, protect)
  console.log(`${script} ${label}: ${oneLine(summary ?? summarizeResult(result), SUMMARY_MAX)} -> ${encodeField(file)}`)
  return file
}
