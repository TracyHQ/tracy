// Shared helpers for the inventory extractors: guarded source reads, hashing, provenance, AST
// access and the wrapper that turns an empty or crashing extractor into an `incomplete` record.
// Nothing here imports or executes product code: sources are read as text and parsed.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { BoundedReadError, readBoundedSync } from '../../lib/bounded-reader.mjs'

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
export const MAX_BUFFER = 64 * 1024 * 1024
const MAX_FILE_BYTES = 64 * 1024 * 1024

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** Thrown for an input the extractor must refuse (symlink, escape, not a regular file). */
export class SourceError extends Error {}

/** Resolve `rel` under `root`, refusing absolute paths and anything that leaves the root. */
export function safePath(root, rel) {
  if (typeof rel !== 'string' || rel === '' || isAbsolute(rel))
    throw new SourceError(`path must be repo-relative: ${rel}`)
  const full = resolve(root, rel)
  const back = relative(root, full)
  if (back === '' || back.startsWith('..') || isAbsolute(back))
    throw new SourceError(`path escapes the root: ${rel}`)
  return full
}

/**
 * Check every directory component of `rel` under `root`, one at a time, from the root outward: each must be a
 * real directory (no symlink). A component missing under a verified parent is an ENOENT error, or created
 * (one level, never recursive through an unchecked path) when `create` is set. Returns the checked target path.
 */
export function guardParents(root, rel, create) {
  const full = safePath(root, rel)
  let cur = realpathSync(root)
  for (const part of relative(root, dirname(full)).split(sep).filter(Boolean)) {
    cur = join(cur, part)
    let st
    try {
      st = lstatSync(cur)
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error
      mkdirSync(cur)
      st = lstatSync(cur)
    }
    if (st.isSymbolicLink()) throw new SourceError(`symlink in path: ${rel}`)
    if (!st.isDirectory()) throw new SourceError(`not a directory in path: ${rel}`)
  }
  return join(cur, basename(full))
}

/** Read a regular file through the shared bounded reader; a source that changes mid-read is reported, not hashed. */
function readStable(full, label) {
  try {
    return readBoundedSync(full, { maxBytes: MAX_FILE_BYTES }).toString('utf8')
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    // Callers tell an absent source (ENOENT) from a broken one: only the reader's MISSING is absent.
    if (error.code === 'MISSING') throw Object.assign(new Error(error.message), { code: 'ENOENT' })
    const why = {
      SYMLINK: `symlink refused: ${label}`,
      NOT_REGULAR: `not a regular file: ${label}`,
      REPLACED: `not a regular file: ${label}`,
      TOO_LARGE: `file too large: ${label}`,
      UNSTABLE: `source changed while reading: ${label}`
    }[error.code]
    throw new SourceError(why ?? `cannot read ${label}: ${error.message}`)
  }
}

/**
 * Read one source file as text. Every parent directory is checked in turn, then the file itself: symlinks,
 * FIFOs and directories are refused BEFORE reading, and the file is re-stat'ed afterwards so a source changing
 * mid-read is reported, not hashed.
 */
export function readSource(root, rel) {
  const text = readStable(guardParents(root, rel, false), rel)
  return { rel, text, hash: sha256(text) }
}

/**
 * Read a file that lives OUTSIDE the repository (an importer's input). Same refusals as `readSource`: the
 * file and every parent directory must be real (no symlink), the target a regular file (a FIFO would hang
 * the read), size-bounded, and stable while read.
 */
export function readExternal(path) {
  if (typeof path !== 'string' || path.trim() === '' || !isAbsolute(path))
    throw new SourceError(`external path must be absolute: ${path}`)
  const full = resolve(path)
  if (realpathSync(dirname(full)) !== dirname(full)) throw new SourceError(`symlink in path: ${full}`)
  const text = readStable(full, full)
  return { text, hash: sha256(text) }
}

/**
 * Check every directory component above an absolute output/input path, from `/` outward: each must be a real
 * directory, never a symlink (a typed path through one is refused, with the real path in the message). With
 * `create`, a missing component is made one level at a time after its parent was checked, never recursively
 * through an unchecked path; without it a missing component is tolerated and nothing is created.
 */
export function guardExternalParents(path, create = false) {
  if (typeof path !== 'string' || path.trim() === '' || !isAbsolute(path))
    throw new SourceError(`path must be absolute: ${path}`)
  const full = resolve(path)
  let cur = sep
  for (const part of dirname(full).split(sep).filter(Boolean)) {
    cur = join(cur, part)
    let st
    try {
      st = lstatSync(cur)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (!create) continue
      mkdirSync(cur)
      st = lstatSync(cur)
    }
    if (st.isSymbolicLink()) {
      let real = ''
      try {
        real = ` (real path: ${realpathSync(cur)})`
      } catch {
        // dangling
      }
      throw new SourceError(`symlink in path: ${cur}${real}`)
    }
    if (!st.isDirectory()) throw new SourceError(`not a directory in path: ${cur}`)
  }
  return full
}

/** Text of an absolute file path read the guarded way; null only when the file is missing under valid parents. */
export function readGuardedText(path) {
  const full = guardExternalParents(path, false)
  try {
    return readStable(full, full)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * The committed copy an importer is about to replace: null when it does not exist yet (ENOENT, the first
 * import), parsed JSON otherwise. A symlink, FIFO, directory, oversize or malformed copy throws.
 */
export function readPrevious(root, rel) {
  let src
  try {
    src = readSource(root, rel)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(src.text)
  } catch (error) {
    throw new SourceError(`${rel} is not valid JSON: ${error.message}`)
  }
}

/**
 * Write `text` to `rel` under `root` atomically (temp file in the same directory, fsync, rename). Refuses an
 * escaping path, a symlinked parent directory and a target that is not a regular file.
 */
export function writeRepoFile(root, rel, text) {
  const full = guardParents(root, rel, true)
  try {
    const st = lstatSync(full)
    if (!st.isFile()) throw new SourceError(`output is not a regular file: ${rel}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const tmp = `${full}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  let fd
  try {
    fd = openSync(tmp, 'wx', 0o644)
    writeSync(fd, text)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(tmp, full)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    try {
      unlinkSync(tmp)
    } catch {
      // never created
    }
    throw error
  }
}

/** List files under `dirRel` (recursive, sorted, regular files only, symlinks skipped and counted). */
export function listFiles(root, dirRel, filter = () => true) {
  const result = listFilesOnce(root, dirRel, filter)
  listingSink?.push({ dir: dirRel, filter, files: [...result.files], skipped: [...result.skipped] })
  return result
}

/** Listings an extractor made, by the record `runExtractor` returned: the build re-lists them before publishing. */
export const LISTINGS = new WeakMap()
let listingSink = null

/** Do the directory listings behind `rec` still give the same member files? */
export function listingsStable(root, rec) {
  for (const l of LISTINGS.get(rec) ?? []) {
    try {
      const again = listFilesOnce(root, l.dir, l.filter)
      if (
        JSON.stringify(again.files) !== JSON.stringify(l.files) ||
        JSON.stringify(again.skipped) !== JSON.stringify(l.skipped)
      )
        return false
    } catch {
      return false
    }
  }
  return true
}

function listFilesOnce(root, dirRel, filter) {
  const out = []
  const skipped = []
  const walk = (relDir) => {
    for (const entry of readdirSync(join(root, relDir), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    )) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const rel = `${relDir}/${entry.name}`
      if (entry.isSymbolicLink()) skipped.push(rel)
      else if (entry.isDirectory()) walk(rel)
      else if (entry.isFile() && filter(rel)) out.push(rel)
    }
  }
  walk(dirRel.replace(/\/$/, ''))
  return { files: out, skipped }
}

/** Roots git reported as "not a repository": later calls skip the spawn (a build asks once per source). */
const NOT_A_REPO = new Set()

/** Last commit that touched `paths`, `+dirty` when the working tree differs; null when git cannot say. */
export function revisionOf(root, paths) {
  if (NOT_A_REPO.has(root)) return null
  try {
    const run = (args) =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        maxBuffer: MAX_BUFFER,
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    const head = run(['log', '-1', '--format=%H', '--', ...paths])
    if (!head) return null
    const dirty = run(['status', '--porcelain', '--', ...paths])
    return dirty ? `${head}+dirty` : head
  } catch (error) {
    // Exit 128 is "not a git repository" (or a path git rejects); a missing git binary or a timeout is not.
    if (error?.status === 128) NOT_A_REPO.add(root)
    return null
  }
}

/** Combined hash of several inputs: sha256 over sorted `path:hash` lines. */
export const combineHashes = (inputs) =>
  sha256(
    [...inputs]
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map((i) => `${i.path}:${i.hash}`)
      .join('\n')
  )

/**
 * Build one extractor record. `read` is the list of `readSource` results the extractor consumed.
 * `unresolved` entries are `{ kind, detail, loc? }`; they never disappear silently.
 */
export function record({ sourcePath, read, extractionKind, items, unresolved = [], root, notes }) {
  const inputs = read.map((r) => ({ path: r.rel, hash: r.hash }))
  const seen = new Set()
  const dups = new Set()
  for (const it of items) (seen.has(it.id) ? dups : seen).add(it.id)
  const extra = [...dups].map((id) => ({ kind: 'duplicate-id', detail: id }))
  return {
    sourcePath,
    sourceHash: combineHashes(inputs),
    revision: revisionOf(
      root,
      inputs.map((i) => i.path)
    ),
    extractionKind,
    inputs,
    items: items.filter((it, i) => items.findIndex((o) => o.id === it.id) === i),
    unresolved: [...unresolved, ...extra],
    status: 'complete',
    ...(notes ? { notes } : {})
  }
}

/**
 * Run an extractor safely. A throw, a zero-item result or a duplicate id turns the record
 * `incomplete` with the reason; an extractor is never reported complete by silence.
 */
export function runExtractor(def, root = DEFAULT_ROOT) {
  const base = {
    sourcePath: def.sourcePath,
    sourceHash: null,
    revision: null,
    extractionKind: def.extractionKind,
    inputs: [],
    items: [],
    unresolved: []
  }
  let rec
  const outer = listingSink
  const listings = []
  listingSink = listings
  try {
    rec = def.extract(root)
  } catch (error) {
    const failed = {
      ...base,
      status: 'incomplete',
      incompleteReason: `extractor failed: ${error instanceof Error ? error.message : String(error)}`
    }
    LISTINGS.set(failed, listings)
    return failed
  } finally {
    listingSink = outer
  }
  const reasons = []
  if (rec.items.length === 0) reasons.push('zero items extracted')
  if (rec.unresolved.some((u) => u.kind === 'duplicate-id')) reasons.push('duplicate ids')
  if (rec.unresolved.some((u) => u.blocksComplete)) reasons.push('unresolved structure that hides items')
  const result = reasons.length
    ? { ...rec, status: 'incomplete', incompleteReason: reasons.join('; ') }
    : { ...rec, status: 'complete' }
  LISTINGS.set(result, listings)
  return result
}

/**
 * Strict flag parser shared by every CLI of the inventory (builder, extractors, importers): `valued` lists the
 * accepted `--name value` flags and `switches` the accepted bare `--name` flags. An unknown flag, a missing,
 * empty, whitespace-only or flag-like value, or a repeated flag throws a SourceError (usage, exit 2), before
 * anything is read or written.
 */
export function parseFlags(argv, valued, switches = []) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (switches.includes(a)) {
      if (a in out) throw new SourceError(`${a} given twice`)
      out[a] = true
      continue
    }
    if (!valued.includes(a)) throw new SourceError(`unknown argument: ${a}`)
    const v = argv[++i]
    if (v === undefined || v.startsWith('--') || v.trim() === '') throw new SourceError(`${a} needs a value`)
    if (a in out) throw new SourceError(`${a} given twice`)
    out[a] = v
  }
  return out
}

/** Run `fn(flags)` for a CLI; a usage error prints the message and exits 2 without writing anything. */
export function usageGuard(argv, flags, usage, fn, switches = []) {
  let parsed
  try {
    parsed = parseFlags(argv, flags, switches)
  } catch (error) {
    process.stderr.write(`${error.message}\nusage: ${usage}\n`)
    process.exitCode = 2
    return
  }
  fn(parsed)
}

/** Entry point shared by every extractor CLI: prints the JSON record. */
export function cli(def, argv = process.argv.slice(2)) {
  usageGuard(argv, ['--root'], 'node <extractor>.mjs [--root DIR]', (f) => {
    const rec = runExtractor(def, f['--root'] ? resolve(f['--root']) : DEFAULT_ROOT)
    process.stdout.write(`${JSON.stringify(rec, null, 2)}\n`)
    process.exitCode = rec.status === 'complete' ? 0 : 1
  })
}

export const isMain = (metaUrl) => process.argv[1] && resolve(process.argv[1]) === fileURLToPath(metaUrl)

/* ---------------------------------- AST helpers ---------------------------------- */

export function parse(text, name) {
  const kind = name.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : name.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind)
  const diag = sf.parseDiagnostics?.[0]
  if (diag) {
    const { line } = sf.getLineAndCharacterOfPosition(diag.start ?? 0)
    throw new SourceError(
      `${name} has syntax errors (line ${line + 1}: ${ts.flattenDiagnosticMessageText(diag.messageText, ' ')})`
    )
  }
  return sf
}
export const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
export const loc = (sf, node) => `${sf.fileName}:${lineOf(sf, node)}`

export const strip = (node) => {
  let n = node
  while (
    n &&
    (ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isSatisfiesExpression?.(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression(n))
  )
    n = n.expression
  return n
}

export const propName = (name) =>
  ts.isIdentifier(name) ||
  ts.isStringLiteral(name) ||
  ts.isNumericLiteral(name) ||
  ts.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : null

/** Top-level `const NAME = <expr>` initializers of a file. */
export function topLevelConsts(sf) {
  const map = new Map()
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer) map.set(d.name.text, d.initializer)
  }
  return map
}

/**
 * Evaluate a static literal: strings, numbers, booleans, null, arrays, objects, `Object.freeze(x)`,
 * spreads of same-file consts and identifiers bound to one. Anything else yields `{ unresolved }`
 * markers collected into `ctx.unresolved`, never a guessed value. With `ctx.blocking` every marker carries
 * `blocksComplete`: the extractor's denominator is the literal itself, so a lost element means a lost item.
 */
export function staticValue(node, ctx) {
  const n = strip(node)
  if (!n) return undefined
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
  if (ts.isNumericLiteral(n)) return Number(n.text)
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false
  if (n.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = staticValue(n.left, ctx)
    const b = staticValue(n.right, ctx)
    return typeof a === 'string' && typeof b === 'string'
      ? a + b
      : unresolvedMark(ctx, n, 'non-static string concatenation')
  }
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.getText() === 'Object.freeze' &&
    n.arguments.length === 1
  )
    return staticValue(n.arguments[0], ctx)
  // `[...].map((x) => Object.freeze(x))` is the identity on the data: evaluate the receiver.
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'map' &&
    n.arguments.length === 1
  ) {
    const fn = strip(n.arguments[0])
    if (
      fn &&
      ts.isArrowFunction(fn) &&
      fn.parameters.length === 1 &&
      ts.isIdentifier(fn.parameters[0].name)
    ) {
      const param = fn.parameters[0].name.text
      let body = strip(fn.body)
      if (
        body &&
        ts.isCallExpression(body) &&
        body.expression.getText() === 'Object.freeze' &&
        body.arguments.length === 1
      )
        body = strip(body.arguments[0])
      if (body && ts.isIdentifier(body) && body.text === param)
        return staticValue(n.expression.expression, ctx)
    }
  }
  if (ts.isArrayLiteralExpression(n)) {
    const out = []
    for (const el of n.elements) {
      if (ts.isSpreadElement(el)) {
        const v = staticValue(el.expression, ctx)
        if (Array.isArray(v)) out.push(...v)
        else unresolvedMark(ctx, el, 'array spread not resolvable')
      } else out.push(staticValue(el, ctx))
    }
    return out
  }
  if (ts.isObjectLiteralExpression(n)) {
    const out = {}
    for (const p of n.properties) {
      if (ts.isSpreadAssignment(p)) {
        const v = staticValue(p.expression, ctx)
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, v)
        else unresolvedMark(ctx, p, 'object spread not resolvable')
      } else if (ts.isPropertyAssignment(p)) {
        const key = propName(p.name)
        if (key === null) unresolvedMark(ctx, p, 'computed property name')
        else out[key] = staticValue(p.initializer, ctx)
      } else if (ts.isShorthandPropertyAssignment(p)) {
        out[p.name.text] = staticValue(p.name, ctx)
      } else unresolvedMark(ctx, p, 'method or accessor in literal')
    }
    return out
  }
  if (ts.isIdentifier(n) && ctx.consts?.has(n.text) && !(ctx.stack ??= new Set()).has(n.text)) {
    ctx.stack.add(n.text)
    try {
      return staticValue(ctx.consts.get(n.text), ctx)
    } finally {
      ctx.stack.delete(n.text)
    }
  }
  return unresolvedMark(ctx, n, `non-static expression (${ts.SyntaxKind[n.kind]})`)
}

const UNRESOLVED = Symbol('unresolved')
export const isUnresolved = (v) => v === UNRESOLVED
function unresolvedMark(ctx, node, detail) {
  ctx.unresolved?.push({
    kind: 'non-static',
    detail,
    loc: ctx.sf ? loc(ctx.sf, node) : undefined,
    ...(ctx.blocking ? { blocksComplete: true } : {})
  })
  return UNRESOLVED
}

/** Find the initializer of a top-level exported/non-exported `const NAME`. */
export function findConst(sf, name) {
  return topLevelConsts(sf).get(name)
}

/** Parse JSON text, throwing a SourceError with the file name on failure. */
export function parseJson(src) {
  try {
    return JSON.parse(src.text)
  } catch (error) {
    throw new SourceError(`invalid JSON in ${src.rel}: ${error.message}`)
  }
}

export const sorted = (items) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/**
 * JSON text laid out the way the repository formatter (biome, line width 110) lays it out, so a
 * regenerated file is byte-identical to the committed, formatted one: objects always expanded, arrays of
 * primitives on one line when they fit, everything else one element per line.
 */
export function formatJson(value, width = 110) {
  const out = []
  const primitive = (v) => v === null || typeof v !== 'object'
  const emit = (v, indent, prefix, suffix) => {
    const pad = ' '.repeat(indent)
    if (Array.isArray(v)) {
      if (v.length === 0) return void out.push(`${pad}${prefix}[]${suffix}`)
      if (v.every(primitive)) {
        const inline = `${pad}${prefix}[${v.map((x) => JSON.stringify(x)).join(', ')}]${suffix}`
        if (inline.length <= width) return void out.push(inline)
      }
      out.push(`${pad}${prefix}[`)
      v.forEach((x, i) => emit(x, indent + 2, '', i < v.length - 1 ? ',' : ''))
      out.push(`${pad}]${suffix}`)
    } else if (v !== null && typeof v === 'object') {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined)
      if (keys.length === 0) return void out.push(`${pad}${prefix}{}${suffix}`)
      out.push(`${pad}${prefix}{`)
      keys.forEach((k, i) => emit(v[k], indent + 2, `${JSON.stringify(k)}: `, i < keys.length - 1 ? ',' : ''))
      out.push(`${pad}}${suffix}`)
    } else out.push(`${pad}${prefix}${JSON.stringify(v)}${suffix}`)
  }
  emit(value, 0, '', '')
  return `${out.join('\n')}\n`
}
