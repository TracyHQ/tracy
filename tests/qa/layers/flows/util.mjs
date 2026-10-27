// Small shared helpers of the flows layer: hashing, atomic and path-safe file writes, secret
// redaction, bounded process execution. File reads go through the shared bounded reader in tests/qa/lib.

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoundedReadError, MAX_LAYER_FILE_BYTES, readBoundedSync } from '../../lib/bounded-reader.mjs'

export const LAYER_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(LAYER_DIR, '..', '..', '..', '..')
export const VERDICTS = Object.freeze(['PASS', 'FAIL', 'ENV', 'PENDING'])

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
export const sha256File = (file) => sha256(readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES }))
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const nowIso = () => new Date().toISOString()
export const stamp = () => nowIso().replace(/[-:]/g, '').replace(/\..*/, 'Z')

/** An error that carries a usage problem: the CLI maps it to exit 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

/**
 * Resolve `rel` under `root` and refuse anything that escapes it, through `..`, an absolute path,
 * or a symlink anywhere along the existing part of the path.
 * @param {string} root
 * @param {string} rel
 */
export function safeJoin(root, rel) {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new UsageError(`bad path "${rel}"`)
  if (path.isAbsolute(rel)) throw new UsageError(`path "${rel}" is absolute`)
  const rootReal = realpathSync(root)
  const target = path.resolve(rootReal, rel)
  if (target !== rootReal && !target.startsWith(rootReal + path.sep))
    throw new UsageError(`path "${rel}" escapes ${root}`)
  // Walk the segments that exist: a symlink or FIFO in the way is refused.
  let cur = rootReal
  for (const seg of path.relative(rootReal, target).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, seg)
    let st
    try {
      st = lstatSync(cur)
    } catch {
      break
    }
    if (st.isSymbolicLink()) throw new UsageError(`path "${rel}" crosses a symlink at ${seg}`)
  }
  return target
}

/** Read a regular file only (no symlink, FIFO, device); bounded size, stable while read. */
export function readRegular(file, { maxBytes = MAX_LAYER_FILE_BYTES } = {}) {
  try {
    return readBoundedSync(file, { maxBytes }).toString('utf8')
  } catch (error) {
    if (error instanceof BoundedReadError) throw new Error(error.message)
    throw error
  }
}

/** Read and parse JSON; any problem throws an Error whose message names the file. */
export function readJson(file, opts) {
  let text
  try {
    text = readRegular(file, opts)
  } catch (error) {
    throw new Error(`unreadable: ${error.message}`)
  }
  if (text.trim() === '') throw new Error(`empty: ${file}`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`malformed JSON in ${file}: ${error.message}`)
  }
}

/** Write a file atomically (temp + rename) with the given mode. */
export function writeAtomic(file, data, { mode = 0o644 } = {}) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmp, data, { mode })
    renameSync(tmp, file)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

export const writeJsonAtomic = (file, value, opts) =>
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`, opts)

/** Stable JSON: object keys sorted, so a regenerated file is byte-identical. */
export function stableStringify(value) {
  const norm = (v) =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, norm(v[k])])
          )
        : v
  return `${JSON.stringify(norm(value), null, 2)}\n`
}

const SECRET_PATTERNS = [
  [/tracy_sess=[^;\s"']+/g, 'tracy_sess=<redacted>'],
  [/\bv1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, 'v1.<redacted>'],
  [/(authorization:\s*)(bearer\s+)?[^\s"']+/gi, '$1<redacted>'],
  [
    /(secret|token|password|api[_-]?key|pepper)(["']?\s*[:=]\s*["']?)[A-Za-z0-9+/_=.-]{8,}/gi,
    '$1$2<redacted>'
  ],
  [/(subject=")\d{6}( )/g, '$1<otp>$2'],
  [/("code"\s*:\s*")\d{6}(")/g, '$1<otp>$2']
]
/** Remove sign-in codes, session tokens and secrets from text before it is written anywhere. */
export function redactText(text) {
  let out = String(text)
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to)
  return out
}
/** A leak detector over the same patterns: returns the names of pattern groups still present. */
export function findSecrets(text) {
  const hits = []
  const t = String(text)
  if (/tracy_sess=(?!<redacted>)[A-Za-z0-9._-]{12,}/.test(t)) hits.push('session-cookie')
  if (/\bv1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(t)) hits.push('session-token')
  if (/subject="\d{6} /.test(t)) hits.push('otp')
  return hits
}

/**
 * A child process must not believe it is a worker of the test runner that happens to run this
 * code: NODE_TEST_CONTEXT makes a nested `node --test` print nothing a parent can read.
 */
export function cleanEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'))
}

/**
 * Run a command, bounded in time, output captured (capped). Never throws on a non-zero exit.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string,string>, input?: string, timeoutMs?: number, signal?: AbortSignal, maxBytes?: number }} [opts]
 * @returns {Promise<{ code: number|null, signal: string|null, stdout: string, stderr: string, timedOut: boolean, error?: string, ms: number }>}
 */
export function exec(cmd, args, opts = {}) {
  const { cwd, env, input, timeoutMs = 120_000, signal, maxBytes = 16 * 1024 * 1024 } = opts
  const started = Date.now()
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { cwd, env: cleanEnv(env ?? process.env), stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({
        code: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: error.message,
        ms: 0
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    const cap = (s, d) => (s.length > maxBytes ? s : s + d)
    child.stdout.on('data', (d) => {
      stdout = cap(stdout, d)
    })
    child.stderr.on('data', (d) => {
      stderr = cap(stderr, d)
    })
    const finish = (r) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({ stdout, stderr, timedOut, ms: Date.now() - started, ...r })
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    const onAbort = () => child.kill('SIGTERM')
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', (error) => finish({ code: null, signal: null, error: error.message }))
    child.on('close', (code, sig) => finish({ code, signal: sig }))
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
  })
}

export const exists = existsSync
