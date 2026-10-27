/**
 * Intake (plan §4.10): take what a lane wrote for one PR out of its staging folder, AFTER the lane's
 * whole process group has exited. The accepted files are copied into a read-only snapshot, and every
 * later step (scan, copy into `qa-tests`, commit) works on that snapshot; a write to staging after
 * the snapshot never reaches a commit.
 *
 * Refused (each file gets one reason; nothing refused is in the snapshot):
 *   not-regular (symlink, folder link, fifo, socket...) · hardlink (nlink > 1) · outside (real path
 *   leaves the staging tree) · dotfile (any path segment starting with '.') · extension (not one of
 *   .test.mjs .mjs .json .md .sh .txt) · forbidden-name (package.json, .npmrc, *.config.*, tsconfig*)
 *   · too-large (> 200 KB) · too-many-files (more than 40 candidates: the whole PR is refused) ·
 *   secret (a known value in raw, base64, base64url or hex form) · session-token (`v1.<b64u>.<b64u>`)
 *   · jwt · api-key (`sk-…`) · vietnamese (diacritics in a code file: .mjs, .sh) · changed (the file
 *   grew while it was read).
 * The scan is the last net, not a guarantee (Q24). Reasons never include the matched value.
 *
 * Exports:
 *   ALLOWED_EXTENSIONS, CODE_EXTENSIONS, LIMITS: { maxFileBytes, maxFiles, minNeedle }
 *   cookieValues(cookieFiles: string[]): string[]           // `value` of every line of cookies.jsonl files
 *   cliTokens({ codexHome?, claudeTokenFile? }): string[]   // read AFTER the CLI exited (refreshed tokens)
 *   needleForms(needle: string): string[]                   // raw, base64 (3 alignments), base64url, hex
 *   scanText(text: string, { needles?: string[], code?: boolean }): string | null   // reason or null
 *   nameRefusal(relPath: string): string | null
 *   intake({ staging, snapshotDir, needles?, limits? })
 *     -> { snapshotDir, accepted: [{ path, size, sha256 }], rejected: [{ path, reason }] }
 */
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

export const ALLOWED_EXTENSIONS = ['.test.mjs', '.mjs', '.json', '.md', '.sh', '.txt']
export const CODE_EXTENSIONS = ['.mjs', '.sh']
export const LIMITS = { maxFileBytes: 200 * 1024, maxFiles: 40, minNeedle: 12 }

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

export function cookieValues(cookieFiles = []) {
  const out = new Set()
  for (const f of cookieFiles) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const v = JSON.parse(line).value
        if (typeof v === 'string' && v) out.add(v)
      } catch {}
    }
  }
  return [...out]
}

function stringLeaves(value, out) {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringLeaves(v, out)
  return out
}

export function cliTokens({ codexHome, claudeTokenFile } = {}) {
  const out = []
  if (codexHome && existsSync(join(codexHome, 'auth.json'))) {
    try {
      const leaves = stringLeaves(JSON.parse(readFileSync(join(codexHome, 'auth.json'), 'utf8')), [])
      out.push(...leaves.filter((s) => s.length >= LIMITS.minNeedle))
    } catch {}
  }
  if (claudeTokenFile && existsSync(claudeTokenFile)) {
    const t = readFileSync(claudeTokenFile, 'utf8').trim()
    if (t) out.push(t)
  }
  return out
}

/**
 * Every spelling of `needle` worth looking for. A value base64-encoded inside a longer string sits at
 * one of three byte alignments; for each, the characters that depend only on the needle are kept.
 */
export function needleForms(needle) {
  const buf = Buffer.from(needle, 'utf8')
  const forms = new Set([needle, buf.toString('hex'), buf.toString('hex').toUpperCase()])
  for (let k = 0; k < 3; k++) {
    const padded = Buffer.concat([Buffer.alloc(k), buf])
    for (const enc of ['base64', 'base64url']) {
      const s = padded.toString(enc).replace(/=+$/, '')
      const core = s.slice(Math.ceil((k * 4) / 3), s.length - 3)
      if (core.length >= LIMITS.minNeedle) forms.add(core)
    }
  }
  return [...forms]
}

const SESSION_TOKEN = /\bv1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/
const API_KEY = /\bsk-[A-Za-z0-9_-]{16,}/
function stripStringLiterals(text) {
  return text.replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\\n])*\1/g, '""')
}

// Letters only Vietnamese spells with: the breve/circumflex/horn vowels, `đ`, and tone-marked vowels.
const VIETNAMESE = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu

export function scanText(text, { needles = [], code = false } = {}) {
  for (const n of needles) {
    if (typeof n !== 'string' || n.length < LIMITS.minNeedle) continue
    for (const form of needleForms(n)) if (text.includes(form)) return 'secret'
  }
  if (SESSION_TOKEN.test(text)) return 'session-token'
  if (JWT.test(text)) return 'jwt'
  if (API_KEY.test(text)) return 'api-key'
  // Vietnamese in a string literal is data (a locale PR's expected translation); in a comment or
  // an identifier it breaks the repo's language rule. Blank the literals out, then look.
  if (code && VIETNAMESE.test(stripStringLiterals(text.normalize('NFC')))) return 'vietnamese'
  return null
}

const extensionOf = (name) => ALLOWED_EXTENSIONS.find((e) => name.endsWith(e)) ?? null

export function nameRefusal(relPath) {
  const parts = relPath.split(sep)
  if (parts.some((p) => p.startsWith('.'))) return 'dotfile'
  const name = basename(relPath)
  if (name === 'package.json' || name === '.npmrc' || /\.config\./.test(name) || name.startsWith('tsconfig'))
    return 'forbidden-name'
  if (!extensionOf(name)) return 'extension'
  return null
}

/** Read a regular file through a descriptor that refuses symlinks, and check it is the one lstat saw. */
function readExact(path, seen, max) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const st = fstatSync(fd)
    if (!st.isFile() || st.ino !== seen.ino || st.dev !== seen.dev) return { reason: 'not-regular' }
    if (st.nlink > 1) return { reason: 'hardlink' }
    if (st.size > max) return { reason: 'too-large' }
    const buf = Buffer.alloc(st.size + 1)
    let got = 0
    for (;;) {
      const n = readSync(fd, buf, got, buf.length - got, null)
      if (n === 0) break
      got += n
      // Still growing after the lane exited: something else writes it.
      if (got > max || got >= buf.length) return { reason: got > max ? 'too-large' : 'changed' }
    }
    return { content: buf.subarray(0, got) }
  } finally {
    closeSync(fd)
  }
}

export function intake({ staging, snapshotDir, needles = [], limits = {} }) {
  const lim = { ...LIMITS, ...limits }
  const root = realpathSync(staging)
  if (existsSync(snapshotDir)) throw new Error(`intake: snapshot folder already exists: ${snapshotDir}`)
  const rejected = []
  const candidates = []

  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const abs = join(dir, ent.name)
      const rel = relative(root, abs)
      const st = lstatSync(abs)
      if (ent.name.startsWith('.')) {
        rejected.push({ path: rel, reason: 'dotfile' })
        continue
      }
      if (st.isSymbolicLink()) {
        rejected.push({ path: rel, reason: 'not-regular' })
        continue
      }
      if (st.isDirectory()) {
        const real = realpathSync(abs)
        if (real !== join(root, rel)) rejected.push({ path: rel, reason: 'outside' })
        else walk(abs)
        continue
      }
      if (!st.isFile()) {
        rejected.push({ path: rel, reason: 'not-regular' })
        continue
      }
      if (st.nlink > 1) {
        rejected.push({ path: rel, reason: 'hardlink' })
        continue
      }
      const byName = nameRefusal(rel)
      if (byName) {
        rejected.push({ path: rel, reason: byName })
        continue
      }
      if (st.size > lim.maxFileBytes) {
        rejected.push({ path: rel, reason: 'too-large' })
        continue
      }
      candidates.push({ abs, rel, st })
    }
  }
  walk(root)

  if (candidates.length > lim.maxFiles) {
    for (const c of candidates) rejected.push({ path: c.rel, reason: 'too-many-files' })
    candidates.length = 0
  }

  const accepted = []
  mkdirSync(snapshotDir, { recursive: true })
  const dirs = new Set([snapshotDir])
  for (const c of candidates) {
    const read = readExact(c.abs, c.st, lim.maxFileBytes)
    if (read.reason) {
      rejected.push({ path: c.rel, reason: read.reason })
      continue
    }
    const code = CODE_EXTENSIONS.some((e) => c.rel.endsWith(e))
    const why = scanText(read.content.toString('utf8'), { needles, code })
    if (why) {
      rejected.push({ path: c.rel, reason: why })
      continue
    }
    const dest = join(snapshotDir, c.rel)
    mkdirSync(dirname(dest), { recursive: true })
    for (let d = dirname(dest); d.startsWith(snapshotDir) && d !== snapshotDir; d = dirname(d)) dirs.add(d)
    writeFileSync(dest, read.content, { flag: 'wx', mode: 0o444 })
    chmodSync(dest, 0o444)
    accepted.push({ path: c.rel, size: read.content.length, sha256: sha256(read.content) })
  }
  // Deepest folders first, so a parent turns read-only only after its children.
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) chmodSync(d, 0o555)
  rejected.sort((a, b) => a.path.localeCompare(b.path))
  return { snapshotDir, accepted, rejected }
}
