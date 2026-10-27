// The lessons store: every past skill defect as one short record (references/lessons.jsonl), and
// the detectors that decide which of them apply to the port at hand. An agent runs
// `lessons.mjs scan` and reads only the lessons its inputs trip, instead of re-reading 63 gotchas
// and every issue before each step. Format and rules: references/lessons.md.
//
// A detector reads static inputs only — the spec-pack, the built theme, the pack, saved source
// pages on disk; never a running site (a live-page check belongs to its tool: visual-qa,
// functional, http-parity, contrast-audit, named in the record's `tool`) — and
// answers one of three states: `na` (the trap is not in these inputs), `resolved` (the trap is
// there and the fix holds on this data) or `unresolved` (the trap is there and nothing handles
// it). A detector that cannot read what it needs throws; the scan reports it unknown and exits 2,
// never clean. The scanner only reads: it writes nothing, runs no fix and follows no symlink.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { archivePy, auditArchiveMembers, isArtifactName, manifestProblems, parseSums } from '../quickstart/lib.mjs'

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LESSONS_FILE = path.join(SKILL_ROOT, 'references', 'lessons.jsonl')
export const SOURCES_FILE = path.join(SKILL_ROOT, 'references', 'lessons-sources.json')
export const GOTCHAS_FILE = path.join(SKILL_ROOT, 'references', 'gotchas.md')
const REPO_URL = 'https://github.com/JoomlArt-Products/tracy-wordpress-theme'

const AREAS = Object.freeze(['process', 'stand', 'theme', 'ingest', 'seed', 'parity', 'visual', 'review', 'form', 'package', 'quickstart'])
const STATUSES = Object.freeze(['fixed-in-code', 'open'])
const RECORD_KEYS = Object.freeze(['id', 'area', 'when', 'status', 'tool', 'sym', 'fix', 'test', 'ref'])
/** A record is aimed at 200 bytes; one may run over only through its fix/test pointers (lessons.md). */
export const RECORD_TARGET_BYTES = 200
export const RECORD_MAX_BYTES = 240

/**
 * Bounds on everything the scanner reads. An input past a bound is unknown (exit 2), never
 * skipped: a scan that silently read part of a theme would call it clean.
 */
const LIMITS = Object.freeze({
  fileBytes: 8 << 20,
  catalogBytes: 1 << 20,
  walkEntries: 20000,
  walkDepth: 16,
  sourcePages: 200,
  packBytes: 16 * 1024 ** 3,
  packTimeoutMs: 600000,
  archiveListBytes: 64 << 20,
  archiveTimeoutMs: 60000,
  archiveMembers: 500000,
  diskFreeBytes: 5 * 1024 ** 3
})

export class InputError extends Error {}
export class CatalogError extends Error {}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/** One line of a diagnostic: control characters shown as `?`, bounded. */
export const clean = (s, max = 300) => {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ---------------------------------------------------------------- catalog

const ID_RE = /^L-\d{3}$/
const POINTER_RE = /^[a-z0-9][a-z0-9/_-]*(\.[a-z]+)?#[^#\s].*$/
const TEST_RE = /^[a-z0-9][a-z0-9-]*~\S.*$/
const REF_RE = /^(g\d+|#\d+|pr\d+)$/
const TOOL_RE = /^[a-z0-9][a-z0-9/_-]*$/

/**
 * The kind a record is: `fixed` (no detector), `tool` (a trap only a running page shows: its check
 * is the script `tool` names, not the scan), `guidance` (always), `open` or `detect`.
 */
export const kindOf = (r) => (r.status === 'fixed-in-code' ? 'fixed' : r.tool ? 'tool' : r.when === 'always' ? 'guidance' : r.status === 'open' ? 'open' : 'detect')

/** Problems of one parsed record (schema only; pointers are checked by pointerProblems). */
function recordProblems(r) {
  const p = []
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['not a JSON object']
  for (const k of Object.keys(r)) if (!RECORD_KEYS.includes(k)) p.push(`unknown key ${JSON.stringify(k)}`)
  for (const k of Object.keys(r)) if (typeof r[k] !== 'string') p.push(`${k} is not a string`)
  if (p.length) return p
  if (!ID_RE.test(r.id ?? '')) p.push(`id ${JSON.stringify(r.id)} is not L-NNN`)
  if (!AREAS.includes(r.area)) p.push(`area ${JSON.stringify(r.area)} is not one of ${AREAS.join(', ')}`)
  if (r.status !== undefined && !STATUSES.includes(r.status)) p.push(`status ${JSON.stringify(r.status)} is not one of ${STATUSES.join(', ')}`)
  if (r.status === 'fixed-in-code') {
    if (r.when !== undefined) p.push('a fixed-in-code record has no detector (when)')
    if (!r.test) p.push('a fixed-in-code record names its regression test')
    if (r.fix?.startsWith('$ ')) p.push('a fixed-in-code record points at the code, not a command')
    if (r.tool !== undefined) p.push('a fixed-in-code record names no tool')
  } else if (r.tool !== undefined) {
    if (r.when !== undefined || r.status !== undefined) p.push('a tool record has neither a detector (when) nor a status: its tool is the check')
    if (!TOOL_RE.test(r.tool)) p.push(`tool ${JSON.stringify(r.tool)} is not a script path under scripts/ without .mjs`)
    if (!r.test) p.push("a tool record names the tool's regression test")
  } else if (r.when === undefined) p.push('when is missing: a detector id or "always"')
  else if (r.when !== 'always' && !DETECTORS[r.when]) p.push(`when ${JSON.stringify(r.when)} is no detector`)
  if (r.status === 'open' && r.when === 'always') p.push('an open defect needs a detector, not "always"')
  for (const k of ['sym', 'fix']) if (!r[k]) p.push(`${k} is missing`)
  // Every value reaches the terminal through show or scan: none may carry a control character.
  for (const k of RECORD_KEYS) if (typeof r[k] === 'string' && CONTROL.test(r[k])) p.push(`${k} holds a control character`)
  if (r.sym && r.sym.length > 100) p.push(`sym is ${r.sym.length} characters (at most 100)`)
  if (r.fix && r.fix.length > 100) p.push(`fix is ${r.fix.length} characters (at most 100)`)
  if (r.fix && !r.fix.startsWith('$ ') && !POINTER_RE.test(r.fix)) p.push(`fix ${JSON.stringify(r.fix)} is neither "$ <command>" nor "<path>#<symbol>"`)
  if (r.test !== undefined && !TEST_RE.test(r.test)) p.push(`test ${JSON.stringify(r.test)} is not "<name>~<text>"`)
  const refs = (r.ref ?? '').split(' ')
  if (!r.ref || refs.some((t) => !REF_RE.test(t))) p.push(`ref ${JSON.stringify(r.ref)} is not gN / #N / prN tokens`)
  return p
}

/** Records of the JSONL text, in file order; any problem is a CatalogError naming the line. */
export function parseCatalog(text) {
  if (!text.trim()) throw new CatalogError('the lessons catalog is empty')
  if (!text.endsWith('\n')) throw new CatalogError('the lessons catalog does not end with a newline (truncated?)')
  const records = []
  const seen = new Set()
  const problems = []
  text
    .slice(0, -1)
    .split('\n')
    .forEach((line, i) => {
      const at = `line ${i + 1}`
      if (Buffer.byteLength(line) > RECORD_MAX_BYTES) problems.push(`${at}: ${Buffer.byteLength(line)} bytes (at most ${RECORD_MAX_BYTES})`)
      let r
      try {
        r = JSON.parse(line)
      } catch (e) {
        problems.push(`${at}: not JSON (${e.message})`)
        return
      }
      for (const q of recordProblems(r)) problems.push(`${at} ${r?.id ?? ''}: ${q}`)
      if (r?.id && seen.has(r.id)) problems.push(`${at}: duplicate id ${r.id}`)
      if (records.length && r?.id && r.id <= records[records.length - 1].id) problems.push(`${at}: ${r.id} is out of order`)
      seen.add(r?.id)
      records.push(r)
    })
  if (problems.length) throw new CatalogError(`the lessons catalog is invalid:\n  ${problems.map((q) => clean(q)).join('\n  ')}`)
  return records
}

/** The catalog as the CLI reads it: parsed, and every fix/test pointer resolving (pointerProblems). */
export function loadCatalog(file = LESSONS_FILE, root = SKILL_ROOT) {
  let text
  try {
    text = readRegular(file, LIMITS.catalogBytes)
  } catch (e) {
    throw new CatalogError(`the lessons catalog ${file} cannot be read: ${e.message}`)
  }
  const records = parseCatalog(text)
  const broken = pointerProblems(records, root)
  if (broken.length) throw new CatalogError(`the lessons catalog has pointers that do not resolve:\n  ${broken.slice(0, 20).map((q) => clean(q)).join('\n  ')}`)
  return records
}

/** The file a `fix`/`test`/`tool` pointer names, relative to the skill root. */
function pointerFile(kind, pointer) {
  if (kind === 'tool') return `scripts/${pointer}.mjs`
  if (kind === 'test') return `scripts/test/${pointer.split('~')[0]}.test.mjs`
  const p = pointer.split('#')[0]
  return `scripts/${/\.[a-z]+$/.test(p) ? p : `${p}.mjs`}`
}
const pointerText = (kind, pointer) => (kind === 'test' ? pointer.slice(pointer.indexOf('~') + 1) : pointer.slice(pointer.indexOf('#') + 1))

/** Pointers that do not resolve: the file is missing, or the symbol / test text is not in it. */
export function pointerProblems(records, root = SKILL_ROOT) {
  const out = []
  const texts = new Map()
  for (const r of records)
    for (const kind of ['fix', 'test', 'tool']) {
      const v = r[kind]
      if (!v || v.startsWith('$ ')) continue
      const file = pointerFile(kind, v)
      if (!texts.has(file))
        try {
          texts.set(file, readRegular(path.join(root, file)))
        } catch {
          texts.set(file, null)
        }
      const text = texts.get(file)
      if (text === null) {
        out.push(`${r.id} ${kind}: ${file} does not exist`)
        continue
      }
      if (kind !== 'tool' && !text.includes(pointerText(kind, v))) out.push(`${r.id} ${kind}: ${JSON.stringify(pointerText(kind, v))} is not in ${file}`)
    }
  return out
}

/**
 * Problems of the source inventory (references/lessons-sources.json) against the catalog: every
 * gotcha 1..gotchaCount, every issue and every PR of the snapshot mapped, every mapping pointing at
 * a lesson whose ref names that source, and every lesson reached from some source. An inventory
 * that says it is incomplete is a problem too — coverage is not claimed from a partial read.
 */
export function sourceProblems(sources, records, gotchaCount) {
  const p = []
  if (!sources || typeof sources !== 'object') return ['the source inventory is not an object']
  if (sources.complete !== true) p.push('the source inventory is not complete (complete !== true)')
  else p.push(...evidenceProblems(sources))
  if (sources.gotchas !== gotchaCount) p.push(`the inventory counts ${sources.gotchas} gotchas, gotchas.md has ${gotchaCount}`)
  const items = sources.items ?? {}
  const byId = new Map(records.map((r) => [r.id, r]))
  const issues = new Set(sources.issues ?? [])
  const prs = new Set(sources.prs ?? [])
  for (const n of issues) if (prs.has(n)) p.push(`#${n} is listed as both an issue and a PR`)
  for (let n = 1; n <= gotchaCount; n++) if (!items[`g${n}`]) p.push(`gotcha ${n} has no lesson`)
  for (const n of issues) if (!Object.keys(items).some((k) => k === `#${n}` || k.startsWith(`#${n}.`))) p.push(`issue #${n} has no item`)
  for (const n of prs) if (!items[`pr${n}`]) p.push(`PR #${n} has no item`)
  const reached = new Set()
  for (const [key, v] of Object.entries(items)) {
    const src = /^g(\d+)$/.exec(key) ? key : /^#(\d+)(\.\d+)?$/.exec(key) ? key.split('.')[0] : /^pr(\d+)$/.exec(key) ? key : null
    if (!src) {
      p.push(`item ${key} is not gN, #N, #N.k or prN`)
      continue
    }
    if (src.startsWith('g') && Number(src.slice(1)) > gotchaCount) p.push(`item ${key}: there is no gotcha ${src.slice(1)}`)
    if (src.startsWith('#') && !issues.has(Number(src.slice(1)))) p.push(`item ${key}: #${src.slice(1)} is not in the issue list`)
    if (src.startsWith('pr') && !prs.has(Number(src.slice(2)))) p.push(`item ${key}: PR ${src.slice(2)} is not in the PR list`)
    if (Array.isArray(v)) {
      if (!v.length) p.push(`item ${key} maps to no lesson`)
      for (const id of v) {
        const r = byId.get(id)
        if (!r) p.push(`item ${key} → ${id}: no such lesson`)
        else if (!r.ref.split(' ').includes(src)) p.push(`item ${key} → ${id}: the lesson's ref does not name ${src}`)
        reached.add(id)
      }
    } else if (v?.closes) {
      for (const n of v.closes) if (!issues.has(n)) p.push(`item ${key} closes #${n}, not in the issue list`)
    } else if (!(typeof v?.none === 'string' && v.none)) p.push(`item ${key} is neither lessons, {closes} nor {none: reason}`)
  }
  for (const r of records) if (!reached.has(r.id)) p.push(`${r.id} is reached from no source item`)
  p.push(...citeProblems(sources, byId))
  return p
}

/** The issue and PR item → lesson pairs of an inventory, as `"<item> <lesson>"` keys of `cites`. */
const citedPairs = (sources) =>
  Object.entries(sources?.items ?? {})
    .filter(([k, v]) => !k.startsWith('g') && Array.isArray(v))
    .flatMap(([k, v]) => v.map((id) => `${k} ${id}`))

/** The record text a cite must occur in: the symptom and the pointers. */
const recordText = (r) => [r.sym, r.fix, r.test, r.tool].filter(Boolean).join(' ').toLowerCase()

/**
 * Every issue/PR item → lesson pair carries a cite: words that occur in that lesson's record (checked
 * here) and in the item's own text in the snapshot (snapshotProblems). The cite is what ties the
 * item's defect to the lesson; a number alone does not.
 */
function citeProblems(sources, byId) {
  const p = []
  const cites = sources.cites ?? {}
  if (typeof cites !== 'object' || Array.isArray(cites)) return ['cites is not an object']
  const pairs = new Set(citedPairs(sources))
  for (const pair of pairs) {
    const c = cites[pair]
    if (typeof c !== 'string' || c.trim().length < 3 || CONTROL.test(c)) {
      p.push(`${pair}: no cite (words of the item that the lesson also holds)`)
      continue
    }
    const r = byId.get(pair.split(' ')[1])
    if (r && !recordText(r).includes(c.toLowerCase())) p.push(`${pair}: the cite ${JSON.stringify(c)} is not in the lesson`)
  }
  for (const k of Object.keys(cites)) if (!pairs.has(k)) p.push(`cite ${JSON.stringify(k)} is no item → lesson pair`)
  return p
}

// An item of an issue body: a numbered line whose title is bold, `N. **…**` or `N. (note) **…**`.
const ITEM_RE = /^[ \t]*(\d+)\.[ \t]+(?:\([^)\n]*\)[ \t]+)?\*\*/gm

/**
 * The items of an issue as the inventory keys them: `#N.k` → the text of item k (to the next item),
 * or, for an issue without numbered items, `#N` → its title and body.
 */
function issueItems(issue) {
  const body = String(issue?.body ?? '')
  const starts = [...body.matchAll(ITEM_RE)]
  if (!starts.length) return new Map([[`#${issue.number}`, `${issue.title ?? ''}\n${body}`]])
  return new Map(starts.map((m, i) => [`#${issue.number}.${m[1]}`, body.slice(m.index, starts[i + 1]?.index ?? body.length)]))
}

const SHA256_RE = /^[0-9a-f]{64}$/

/** The snapshot files an inventory cites (`evidence`), each a path under the home directory and its SHA-256. */
function evidenceProblems(sources) {
  const p = []
  for (const k of ['issues', 'prs']) {
    const e = sources?.evidence?.[k]
    if (typeof e?.file !== 'string' || !e.file.startsWith('~/')) p.push(`evidence.${k}.file is not a path under ~/`)
    if (!SHA256_RE.test(e?.sha256 ?? '')) p.push(`evidence.${k}.sha256 is not a SHA-256`)
  }
  return p
}

/**
 * Problems of the inventory against the snapshots it cites — `issues` and `prs`, each a list of
 * { number, title, body } as `gh issue list/pr list --json` writes them: the issue and PR numbers
 * are exactly the snapshot's, and every issue a PR item says it closes is named (`#N`) in that PR's
 * title or body.
 */
export function snapshotProblems(sources, { issues, prs }) {
  const p = []
  const nums = (l) => [...new Set(l.map((x) => x.number))].sort((a, b) => a - b)
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  for (const [k, list] of [['issues', issues], ['prs', prs]]) {
    if (!Array.isArray(list) || list.some((x) => !Number.isInteger(x?.number))) {
      p.push(`the ${k} snapshot is not a list of { number }`)
      continue
    }
    const want = [...(sources[k] ?? [])].sort((a, b) => a - b)
    if (!same(nums(list), want)) p.push(`the inventory lists ${k} ${want.join(', ')}; the snapshot has ${nums(list).join(', ')}`)
  }
  if (p.length) return p
  for (const [key, v] of Object.entries(sources.items ?? {})) {
    if (!key.startsWith('pr') || !v?.closes) continue
    const pr = prs.find((x) => x.number === Number(key.slice(2)))
    const text = `${pr?.title ?? ''}\n${pr?.body ?? ''}`
    for (const n of v.closes) if (!new RegExp(`#${n}(?!\\d)`).test(text)) p.push(`item ${key} closes #${n}; the PR does not name it`)
  }
  // Every item the issues hold is keyed, and every issue key is an item they hold.
  const texts = new Map()
  for (const issue of issues) for (const [k, t] of issueItems(issue)) texts.set(k, t)
  for (const pr of prs) texts.set(`pr${pr.number}`, `${pr.title ?? ''}\n${pr.body ?? ''}`)
  const keys = Object.keys(sources.items ?? {}).filter((k) => k.startsWith('#'))
  for (const k of texts.keys()) if (k.startsWith('#') && !keys.includes(k)) p.push(`issue item ${k} of the snapshot has no entry`)
  for (const k of keys) if (!texts.has(k)) p.push(`item ${k} is not an item of the snapshot`)
  // Each cite occurs in the item's own text.
  for (const pair of citedPairs(sources)) {
    const [k] = pair.split(' ')
    const c = sources.cites?.[pair]
    if (typeof c === 'string' && texts.has(k) && !texts.get(k).toLowerCase().includes(c.toLowerCase())) p.push(`${pair}: the cite ${JSON.stringify(c)} is not in the text of ${k}`)
  }
  return p
}

/** `id · sym · fix` — the one line a matched lesson prints. */
const formatLine = (r) => `${r.id} · ${r.sym} · ${r.fix}`

/** Where to read more for a record: the gotcha heading, the issue and PR pages. */
function refPointers(r, { gotchas = null } = {}) {
  return (r.ref ?? '').split(' ').map((t) => {
    if (t.startsWith('g')) {
      const n = t.slice(1)
      const head = gotchas?.match(new RegExp(`^## ${n}\\. (.*)$`, 'm'))?.[1]
      return `references/gotchas.md §${n}${head ? ` — ${head}` : ''}`
    }
    if (t.startsWith('#')) return `${REPO_URL}/issues/${t.slice(1)}`
    return `${REPO_URL}/pull/${t.slice(2)}`
  })
}

export function showLines(r, opts = {}) {
  const lines = [JSON.stringify(r), `kind: ${kindOf(r)}${r.when && r.when !== 'always' ? ` (detector ${r.when})` : ''}`]
  if (r.tool) lines.push(`tool: ${pointerFile('tool', r.tool)} — the live-page check; the scan does not run it`)
  for (const kind of ['fix', 'test']) {
    const v = r[kind]
    if (!v) continue
    lines.push(v.startsWith('$ ') ? `${kind}: ${v.slice(2)}` : `${kind}: ${pointerFile(kind, v)} — ${pointerText(kind, v)}`)
  }
  for (const p of refPointers(r, opts)) lines.push(`read: ${p}`)
  // The other defects of the same gotcha: one gotcha may hold several, each its own lesson.
  const gs = r.ref.split(' ').filter((x) => x.startsWith('g'))
  for (const o of opts.catalog ?? []) if (o.id !== r.id && o.ref.split(' ').some((x) => gs.includes(x))) lines.push(`also: ${o.id} · ${o.sym}`)
  return lines
}

// ---------------------------------------------------------------- bounded, read-only file access

const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0
const NONBLOCK = fs.constants.O_NONBLOCK ?? 0

/**
 * A regular file's text, opened without following a link, bounded, and unchanged while read.
 * `hooks` (tests only) run between the steps, to replace or grow the file mid-read.
 */
export function readRegular(file, maxBytes = LIMITS.fileBytes, hooks = {}) {
  const before = fs.lstatSync(file)
  if (!before.isFile()) throw new InputError(`${file} is ${kindName(before)}, not a regular file`)
  if (before.size > maxBytes) throw new InputError(`${file} is ${before.size} bytes (limit ${maxBytes})`)
  hooks.afterLstat?.(file)
  return withOpenFile(file, before, (fd, st) => readFd(fd, st, file, maxBytes, hooks))
}

/**
 * Open `file` (a regular file whose lstat was `before`) without following a final link and without
 * blocking on a FIFO swapped in after the lstat; `fn(fd, st)` runs only when the open file is the
 * one the lstat saw.
 */
function withOpenFile(file, before, fn) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW | NONBLOCK)
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile() || st.ino !== before.ino || st.dev !== before.dev) throw new InputError(`${file} was replaced while it was read`)
    return fn(fd, st)
  } finally {
    fs.closeSync(fd)
  }
}

/** The whole text of an open regular file, at most maxBytes, unchanged while read. */
function readFd(fd, st, file, maxBytes, hooks = {}) {
  if (st.size > maxBytes) throw new InputError(`${file} is ${st.size} bytes (limit ${maxBytes})`)
  const buf = Buffer.alloc(st.size)
  let got = 0
  while (got < st.size) {
    const n = fs.readSync(fd, buf, got, st.size - got, got)
    if (n === 0) break
    got += n
  }
  hooks.afterRead?.(file)
  const after = fs.fstatSync(fd)
  if (got !== st.size || after.size !== st.size || after.mtimeMs !== st.mtimeMs) throw new InputError(`${file} changed while it was read`)
  return buf.toString('utf8')
}

/**
 * SHA-256 of an open regular file, read in 1 MiB chunks (never whole). `budget` ({ left, total,
 * deadline }) is shared by the files of one job: each file draws its size from `left`, and the
 * read stops at `deadline` (ms since the epoch).
 */
function hashFd(fd, st, file, budget) {
  if (st.size > budget.left)
    throw new InputError(`${file} is ${st.size} bytes (limit ${budget.left}${budget.left < budget.total ? ` left of ${budget.total} for the pack` : ''})`)
  budget.left -= st.size
  const hash = createHash('sha256')
  const buf = Buffer.alloc(Math.min(1 << 20, Math.max(st.size, 1)))
  let got = 0
  for (;;) {
    if (Date.now() > budget.deadline) throw new InputError(`${file} was not hashed within the pack's time limit`)
    const n = fs.readSync(fd, buf, 0, buf.length, got)
    if (n === 0) break
    got += n
    if (got > st.size) throw new InputError(`${file} grew while it was read`)
    hash.update(buf.subarray(0, n))
  }
  const after = fs.fstatSync(fd)
  if (got !== st.size || after.size !== st.size || after.mtimeMs !== st.mtimeMs) throw new InputError(`${file} changed while it was read`)
  return hash.digest('hex')
}

function kindName(st) {
  if (st.isSymbolicLink()) return 'a symlink'
  if (st.isDirectory()) return 'a directory'
  if (st.isFIFO()) return 'a FIFO'
  if (st.isSocket()) return 'a socket'
  if (st.isCharacterDevice() || st.isBlockDevice()) return 'a device'
  return 'not a regular file'
}

/** An input directory named by a flag: it exists, is a directory, and is not a symlink. */
export function inputRoot(dir, flag) {
  let st
  try {
    st = fs.lstatSync(dir)
  } catch (e) {
    throw new InputError(`${flag} ${dir}: ${e.code === 'ENOENT' ? 'does not exist' : e.message}`)
  }
  if (!st.isDirectory()) throw new InputError(`${flag} ${dir}: is ${kindName(st)}, not a directory`)
  return path.resolve(dir)
}

/**
 * A tree read without following links: `file(rel)`, `json(rel)`, `hash(rel)`, `list()`.
 *
 * Node has no openat(), so a path is walked component by component with lstat (a link anywhere is
 * refused), the file is opened, and the walk is repeated: every component must be the same
 * directory (device and inode) both times, and the last one the file that was opened. A directory
 * swapped for a link between the walk and the open — even swapped back before the second walk —
 * leaves the opened file a different inode, and the read is refused. `list()` reads each
 * directory from inside it (see there); a name it returns is still only read through `file()`.
 * `hooks` (tests only): afterWalk(rel), afterOpen(rel) and beforeEnter(rel) run between the steps.
 */
export function tree(root, flag, limits = LIMITS, hooks = {}) {
  const cache = new Map()
  let listing = null
  const rootId = (() => {
    const st = fs.lstatSync(root)
    if (!st.isDirectory()) throw new InputError(`${flag} ${root}: is ${kindName(st)}, not a directory`)
    return `${st.dev}:${st.ino}`
  })()
  const idOf = (st) => `${st.dev}:${st.ino}`
  const checkRoot = () => {
    const st = fs.lstatSync(root)
    if (!st.isDirectory() || idOf(st) !== rootId) throw new InputError(`${flag}: ${root} was replaced during the scan`)
  }
  const partsOf = (rel) => {
    const parts = rel.split('/')
    if (path.isAbsolute(rel) || parts.some((s) => s === '' || s === '.' || s === '..')) throw new InputError(`${flag}: ${rel} is not a path inside it`)
    return parts
  }
  /** → { abs, ids, st } of the last component, or null when the path is not there. */
  const walk = (parts, rel) => {
    checkRoot()
    let at = root
    const ids = []
    let st = null
    for (const [i, part] of parts.entries()) {
      at = path.join(at, part)
      try {
        st = fs.lstatSync(at)
      } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null
        throw new InputError(`${flag}: ${rel}: ${e.message}`)
      }
      if (st.isSymbolicLink()) throw new InputError(`${flag}: ${parts.slice(0, i + 1).join('/')} is a symlink; the scan does not follow links`)
      if (i < parts.length - 1 && !st.isDirectory()) return null
      ids.push(idOf(st))
    }
    return { abs: at, ids, st }
  }
  /** fn(fd, st, abs) on the verified open file; null when absent. */
  const open = (rel, fn) => {
    const parts = partsOf(rel)
    const first = walk(parts, rel)
    if (!first) return null
    if (!first.st.isFile()) throw new InputError(`${flag}: ${rel} is ${kindName(first.st)}, not a regular file`)
    try {
      hooks.afterWalk?.(rel)
      return withOpenFile(first.abs, first.st, (fd, st) => {
        hooks.afterOpen?.(rel)
        const again = walk(parts, rel)
        if (!again || again.ids.join('/') !== first.ids.join('/')) throw new InputError(`${rel} moved while it was read`)
        return fn(fd, st, first.abs)
      })
    } catch (e) {
      throw e instanceof InputError && e.message.startsWith(`${flag}:`) ? e : new InputError(`${flag}: ${rel}: ${e.message}`)
    }
  }
  const file = (rel) => {
    if (cache.has(rel)) return cache.get(rel)
    const text = open(rel, (fd, st, abs) => readFd(fd, st, abs, limits.fileBytes))
    cache.set(rel, text)
    return text
  }
  /** → { sha256, st, abs } of a regular file hashed in chunks, or null when absent. */
  const hash = (rel, budget) => open(rel, (fd, st, abs) => ({ sha256: hashFd(fd, st, abs, budget), st, abs }))
  const json = (rel) => {
    const text = file(rel)
    if (text === null) return null
    if (!text.trim()) throw new InputError(`${flag}: ${rel} is empty`)
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new InputError(`${flag}: ${rel} is not JSON (${clean(e.message, 120)})`)
    }
  }
  /**
   * Every regular file under the root. Node has no openat()/fdopendir(), so the listing walks the
   * way fts does: it chdirs into each directory and confirms `.` is the directory lstat saw
   * (device and inode), reads `.` and lstats each name relative to it, and confirms `..` on the
   * way back. The directory read is always the one standing in, so a directory swapped for a link
   * — at any moment — is either refused by the identity check or never read. Synchronous, so no
   * other code of the process runs while the working directory is moved; it is restored after.
   */
  const list = () => {
    if (listing) return listing
    const out = []
    let entries = 0
    const home = process.cwd()
    const enter = (to, id, rel) => {
      hooks.beforeEnter?.(rel)
      try {
        process.chdir(to)
      } catch (e) {
        throw new InputError(`${flag}: ${rel || '.'} cannot be entered (${e.code ?? clean(e.message, 80)})`)
      }
      if (idOf(fs.statSync('.')) !== id) throw new InputError(`${flag}: ${rel || '.'} was replaced while it was listed`)
    }
    const descend = (rel, depth, id, parentId, parentRel) => {
      if (depth > limits.walkDepth) throw new InputError(`${flag}: ${rel} is nested deeper than ${limits.walkDepth} levels`)
      for (const name of fs.readdirSync('.').sort()) {
        if (++entries > limits.walkEntries) throw new InputError(`${flag}: more than ${limits.walkEntries} entries`)
        const r = rel ? `${rel}/${name}` : name
        const st = fs.lstatSync(name)
        if (st.isDirectory()) {
          enter(name, idOf(st), r)
          descend(r, depth + 1, idOf(st), id, rel)
        } else if (st.isFile()) out.push(r)
        else throw new InputError(`${flag}: ${r} is ${kindName(st)}; the scan reads regular files and directories only`)
      }
      if (parentId) enter('..', parentId, parentRel)
    }
    try {
      checkRoot()
      enter(root, rootId, '')
      descend('', 0, rootId, null, null)
    } finally {
      process.chdir(home)
    }
    listing = out
    return out
  }
  return { root, flag, file, json, hash, list }
}

// ---------------------------------------------------------------- shared readers

const parse = (html) => new JSDOM(String(html ?? '')).window.document
const arr = (v, what) => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new InputError(`${what} is not a list`)
  return v
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const listOf = (j, k, what) => (!Array.isArray(j[k]) ? `has no ${k} list` : j[k].some((e) => !isObj(e)) ? `has a ${k} entry that is not an object${what ? ` (${what})` : ''}` : null)
/**
 * The shape each spec file must have before a detector reads it — the lists the ingest adapters
 * write (from-joomla, from-html). A file of another shape is refused (exit 2): `{}` or a list with
 * holes is no spec-pack a detector can call clean.
 */
const SPEC_SHAPES = {
  'page-map.json': (j) => listOf(j, 'pages') ?? (!j.pages.length ? 'has no pages' : j.pages.some((p) => typeof p.path !== 'string' || !p.path.startsWith('/')) ? 'has a page whose path does not start with /' : null),
  'content.json': (j) => listOf(j, 'pages') ?? listOf(j, 'posts') ?? listOf(j, 'categories'),
  'sections.json': (j) => listOf(j, 'custom'),
  'site-model.json': (j) => listOf(j, 'records')
}
function specJson(ctx, rel) {
  // Absent is the file not being there — never a file that holds the JSON literal `null`.
  if (ctx.spec.file(rel) === null) return null
  const j = ctx.spec.json(rel)
  const problem = isObj(j) ? SPEC_SHAPES[rel]?.(j) : 'is not a JSON object'
  if (problem) throw new InputError(`--spec: ${rel} ${problem}`)
  return j
}

/** Normalised visible words of an element: the key a source list is matched to its block by. */
const words = (el) => el.textContent.replace(/[\s ]+/g, ' ').trim()

/** The body markup of a content.json page or post: a string, or the markup a composed page carries. */
const markupOf = (p) => (typeof p?.contentMarkup === 'string' ? p.contentMarkup : typeof p?.content === 'string' ? p.content : null)

/** The article body of a rendered Joomla page (com_content article view). */
const ARTICLE_BODY = '[itemprop="articleBody"], .com-content-article__body'

/**
 * Source HTML beside the blocks it became:
 * - custom modules: sections.json `html` ↔ `blocks`;
 * - posts: site-model.json `posts` body ↔ the content.json post of that slug (else of that title,
 *   when only one post has it);
 * - pages with a body of their own in site-model.json, by slug;
 * - pages from Joomla articles (content.json `joomla.articleId`): site-model.json leaves their body
 *   empty, so with --source (a saved copy of the source site on disk) the article body
 *   (ARTICLE_BODY) of the page saved for its `joomlaPath` is read (sourcePage); without --source
 *   they are `notGiven`.
 * Source HTML holding a list that cannot be paired — no blocks, no content.json entry, no saved
 * page, no article body in it — throws: the spec-pack or the source was given and cannot be
 * compared, so the detector is unknown, never resolved on the pairs that did work.
 * → { pairs: [{ where, src, out }], notGiven: [what], sources: bool (any source HTML file present) }
 */
async function sourcePairs(ctx) {
  const key = 'source-pairs'
  if (!ctx.cache.has(key))
    ctx.cache.set(
      key,
      (async () => {
        const pairs = []
        const notGiven = []
        const hasList = (html) => parse(html).querySelector('ul, ol') !== null
        const cannot = (what) => {
          throw new InputError(`source lists cannot be compared: ${what}`)
        }
        const sections = specJson(ctx, 'sections.json')
        const model = specJson(ctx, 'site-model.json')
        const content = specJson(ctx, 'content.json')
        for (const m of arr(sections?.custom, 'sections.json custom')) {
          if (typeof m?.html !== 'string') continue
          if (typeof m?.blocks === 'string') pairs.push({ where: `module ${m.id}`, src: m.html, out: m.blocks })
          else if (hasList(m.html)) cannot(`sections.json module ${clean(m?.id, 40)} has html with a list and no blocks`)
        }
        const pages = arr(content?.pages, 'content.json pages')
        const posts = arr(content?.posts, 'content.json posts')
        const find = (list, slug, title) => {
          const bySlug = list.filter((p) => p?.slug === slug)
          if (bySlug.length === 1) return bySlug[0]
          const byTitle = list.filter((p) => title && p?.title === title)
          return byTitle.length === 1 ? byTitle[0] : null
        }
        // Page and post bodies come from site-model.json (from-joomla); a spec-pack without it
        // (from-html) has none to compare: named, never read as "no list".
        if (!model) notGiven.push('no site-model.json in --spec: page and post bodies not compared')
        const bodied = new Set()
        for (const r of arr(model?.records, 'site-model.json records')) {
          if (r?.type !== 'pages' && r?.type !== 'posts') continue
          const body = r?.values?.body
          if (typeof body !== 'string' || !body.trim()) continue
          const kind = r.type.slice(0, -1)
          const target = find(r.type === 'pages' ? pages : posts, r.slug, r.values?.title)
          const out = markupOf(target)
          if (out === null) {
            if (hasList(body)) cannot(`site-model.json ${kind} ${clean(r.slug, 60)} has no content.json ${kind} of that slug or title`)
            continue
          }
          bodied.add(target)
          pairs.push({ where: `${kind} ${r.slug}`, src: body, out })
        }
        // A page whose article body the source never prints (`droppedContent`: skip_component_content, a layout
        // with no component row — from-joomla records it) has no source list to lose: it is not compared.
        const articlePages = pages.filter((p) => p?.joomla?.articleId != null && !p.synthetic && !bodied.has(p) && typeof p.droppedContent !== 'string')
        if (articlePages.length && !ctx.source) notGiven.push(`no --source: ${articlePages.length} page(s) from Joomla articles, whose body only the source holds`)
        if (articlePages.length && ctx.source) {
          if (articlePages.length > ctx.limits.sourcePages) throw new Error(`${articlePages.length} article pages to read from --source (limit ${ctx.limits.sourcePages})`)
          // Every saved page without an article body is named in one refusal, not the first one alone: one
          // pass over the spec-pack then settles them all (ja-restaurant S-36 stopped at about-us.html).
          const bodiless = []
          for (const p of articlePages) {
            const { rel, text } = sourcePage(ctx, p.joomlaPath ?? p.path, p.slug)
            const body = parse(text).querySelector(ARTICLE_BODY)
            if (!body) {
              bodiless.push(rel)
              continue
            }
            const out = markupOf(p)
            if (out === null) {
              if (hasList(body.innerHTML)) cannot(`content.json page ${clean(p.slug, 60)} has no markup`)
              continue
            }
            pairs.push({ where: `page ${p.path}`, src: body.innerHTML, out })
          }
          if (bodiless.length)
            cannot(
              `--source ${bodiless.join(', ')} ${bodiless.length > 1 ? 'have' : 'has'} no article body (${ARTICLE_BODY}) — a page whose article the source does not print carries it as \`droppedContent\` in content.json (what from-joomla writes for skip_component_content), and is then not compared`
            )
        }
        return { pairs, notGiven }
      })()
    )
  return ctx.cache.get(key)
}

/** A site path as saved pages name it: `/`, or `/` then segments of URL-path characters. */
const SAVED_PATH = /^\/(?:[A-Za-z0-9._~%!$&'()*+,;=:@-]+\/)*(?:[A-Za-z0-9._~%!$&'()*+,;=:@-]+\/?)?$/

/**
 * The saved source page for a site path, read from the --source tree: `index.html` for `/`, else
 * `<path>.html` or `<path>/index.html` (what `wget --mirror --adjust-extension` writes) — exactly
 * one of them. A path with a query, a fragment, `.` or `..` segments names no saved file; none
 * saved, or both, cannot be compared. → { rel, text }
 */
function sourcePage(ctx, at, slug) {
  const where = `content.json page ${clean(slug, 60)} joomlaPath ${clean(JSON.stringify(at ?? null), 80)}`
  if (typeof at !== 'string' || !SAVED_PATH.test(at) || at.split('/').some((s) => s === '.' || s === '..')) throw new InputError(`--spec: ${where} is no site path a saved page can have`)
  const base = at.replace(/^\/+|\/+$/g, '')
  const names = base ? [`${base}.html`, `${base}/index.html`] : ['index.html']
  const found = names.map((rel) => ({ rel, text: ctx.source.file(rel) })).filter((f) => f.text !== null)
  if (found.length !== 1) throw new InputError(`--source: ${where}: ${found.length ? `both ${names.join(' and ')} are saved` : `no ${names.join(' or ')} saved`}`)
  return found[0]
}

/**
 * Each source list (`ul`/`ol` matching `pick`) of every pair beside the block list it became: the
 * first not yet taken output list with the same words. A source list with no such block is named,
 * never guessed: it is reported as lost. → null when the spec holds no source HTML at all, else
 * { matched: [{ where, src, out }], lost: [where], notGiven: [what] }
 */
async function pairedLists(ctx, pick) {
  const { pairs, notGiven } = await sourcePairs(ctx)
  const matched = []
  const lost = []
  for (const p of pairs) {
    // Every source list takes its block in order — a list not picked still takes its own, so it
    // cannot be handed to a picked list of the same words — and `list N` counts all of them.
    const all = [...parse(p.src).querySelectorAll('ul, ol')]
    if (!all.some(pick)) continue
    const have = [...parse(p.out).querySelectorAll('ul, ol')]
    const taken = new Set()
    all.forEach((l, i) => {
      const w = words(l)
      const hit = have.find((h) => !taken.has(h) && words(h) === w)
      if (hit) taken.add(hit)
      if (!pick(l)) return
      if (!hit) lost.push(`${p.where} list ${i + 1} "${clean(w, 40)}"`)
      else matched.push({ where: `${p.where} list ${i + 1}`, src: l, out: hit })
    })
  }
  return { matched, lost, notGiven }
}

/**
 * The verdict of a list detector: what was lost is unresolved; else, with a part of the source not
 * given, not checked (a clean part is no clean whole); else resolved or na. A part not given is
 * named on stderr whatever the verdict: a finding in one page says nothing of a page not compared.
 */
function listVerdict(r, bad, what) {
  const notChecked = r.notGiven.length ? r.notGiven.join('; ') : null
  if (bad.length) return { ...unresolved(`${what} — ${bad.slice(0, 5).join('; ')}`), notChecked }
  if (notChecked) return { state: 'skipped', detail: notChecked }
  return r.matched.length ? resolved(`${r.matched.length} list(s) compared`) : na
}

/** Images whose nearest list is `list` (a nested list's images are its own). */
const ownImages = (list) => [...list.querySelectorAll('li img')].filter((im) => im.closest('ul, ol') === list).length

/**
 * Every image table the seeder imports from (seed.mjs collectImages): the spec-wide
 * content.json `images`, each page's and post's `images`, and each custom and ACM module's.
 */
function specImages(ctx) {
  const out = []
  const add = (list, what, where) => {
    for (const im of arr(list, what)) {
      if (!im || typeof im !== 'object' || Array.isArray(im)) throw new InputError(`--spec: ${what} holds an entry that is not an object`)
      out.push({ where, ...im })
    }
  }
  const content = specJson(ctx, 'content.json')
  add(content?.images, 'content.json images', 'content.json images')
  for (const kind of ['pages', 'posts']) for (const p of arr(content?.[kind], `content.json ${kind}`)) add(p?.images, `content.json ${kind} images`, `${kind} ${p?.slug ?? p?.path}`)
  const sections = specJson(ctx, 'sections.json')
  for (const kind of ['custom', 'acm']) for (const m of arr(sections?.[kind], `sections.json ${kind}`)) add(m?.images, `sections.json ${kind} images`, `module ${m?.id}`)
  return out
}

function themeJson(ctx) {
  if (ctx.theme.file('theme.json') === null) throw new InputError('--theme: theme.json is missing (is this the built theme?)')
  const j = ctx.theme.json('theme.json')
  if (!isObj(j)) throw new InputError('--theme: theme.json is not a JSON object')
  return j
}
const themeTemplates = (ctx) => new Set(ctx.theme.list().filter((f) => /^templates\/[^/]+\.html$/.test(f)).map((f) => f.slice(10, -5)))
/** A file a listing named: gone since the listing is an input changing under the scan. */
function needFile(t, rel) {
  const text = t.file(rel)
  if (text === null) throw new InputError(`${t.flag}: ${rel} disappeared during the scan`)
  return text
}

/**
 * PHP code with comments, string contents and inline HTML blanked to spaces (same offsets), so
 * braces and parentheses left are code. Quotes stay, so a string's place is still visible.
 * Heredoc/nowdoc bodies are blanked to their closing label; an unterminated one throws.
 */
function phpCode(php) {
  const t = String(php)
  const out = t.split('')
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  let html = true
  while (i < t.length) {
    if (html) {
      const open = t.indexOf('<?', i)
      const end = open < 0 ? t.length : open + (t.startsWith('<?php', open) ? 5 : t.startsWith('<?=', open) ? 3 : 2)
      blank(i, end)
      i = end
      html = false
      continue
    }
    const c = t[i]
    if (c === '?' && t[i + 1] === '>') {
      html = true
      continue
    }
    if (c === '#' || (c === '/' && t[i + 1] === '/')) {
      let e = i
      while (e < t.length && t[e] !== '\n' && !(t[e] === '?' && t[e + 1] === '>')) e++
      blank(i, e)
      i = e
    } else if (c === '/' && t[i + 1] === '*') {
      const e = t.indexOf('*/', i + 2)
      if (e < 0) throw new Error('an unterminated comment')
      blank(i, e + 2)
      i = e + 2
    } else if (c === '"' || c === "'" || c === '`') {
      let e = i + 1
      for (; e < t.length && t[e] !== c; e++) if (t[e] === '\\') e++
      if (e >= t.length) throw new Error('an unterminated string')
      blank(i + 1, e)
      i = e + 1
    } else if (t.startsWith('<<<', i)) {
      const m = /^<<<[ \t]*(["']?)([A-Za-z_]\w*)\1\r?\n/.exec(t.slice(i, i + 200))
      if (!m) throw new Error('a heredoc without a label')
      const close = new RegExp(`\\n[ \\t]*${m[2]}\\b`, 'g')
      close.lastIndex = i + m[0].length - 1
      const e = close.exec(t)
      if (!e) throw new Error(`an unterminated heredoc ${m[2]}`)
      blank(i + m[0].length, e.index)
      i = e.index + e[0].length
    } else i++
  }
  return out.join('')
}

/** The index of the bracket closing the one at `at` in blanked code, or -1. */
function closing(code, at) {
  const pair = { '(': ')', '{': '}', '[': ']' }
  const stack = []
  for (let k = at; k < code.length; k++) {
    const c = code[k]
    if (pair[c]) stack.push(pair[c])
    else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) return -1
      if (!stack.length) return k
    }
  }
  return -1
}

const PHP_STR = `(?:'([^'\\\\]*)'|"([^"\\\\$]*)")`
const PATH_FORMS = [
  // get_theme_file_path( 'blocks/x' ): relative to the theme root.
  [new RegExp(`^get_theme_file_path\\s*\\(\\s*${PHP_STR}\\s*\\)$`, 'i'), () => '.', false],
  // The rest concatenate a directory and a literal starting with '/'.
  [new RegExp(`^get_(?:template|stylesheet)_directory\\s*\\(\\s*\\)\\s*\\.\\s*${PHP_STR}$`, 'i'), () => '.', true],
  [new RegExp(`^(?:__DIR__|dirname\\s*\\(\\s*__FILE__\\s*\\))\\s*\\.\\s*${PHP_STR}$`, 'i'), (f) => path.posix.dirname(f), true],
  [new RegExp(`^dirname\\s*\\(\\s*__DIR__\\s*\\)\\s*\\.\\s*${PHP_STR}$`, 'i'), (f) => path.posix.join(path.posix.dirname(f), '..'), true]
]
/**
 * The theme-relative path a PHP path expression names, read only in the exact forms of PATH_FORMS
 * (a base function or __DIR__, then one literal string) — `file` is the PHP file it sits in, for
 * __DIR__. Any other expression is null: the scan does not evaluate PHP. A path leaving the theme
 * throws.
 */
function phpThemePath(expr, file) {
  const t = expr.trim()
  for (const [re, base, slash] of PATH_FORMS) {
    const m = re.exec(t)
    if (!m) continue
    const lit = m[1] ?? m[2]
    if (slash && !lit.startsWith('/')) return null // __DIR__ . 'x' names a sibling of the directory, not a path in it
    const rel = path.posix.normalize(path.posix.join(base(file), lit)).replace(/^\/+|\/+$/g, '')
    if (rel === '..' || rel.startsWith('../')) throw new Error(`${clean(t, 80)} leaves the theme`)
    return rel === '.' ? '' : rel
  }
  return null
}

/** The first top-level argument of the call whose `(` is at `open` in blanked code (original text). */
function firstArg(php, code, open, end) {
  let depth = 0
  for (let k = open + 1; k < end; k++) {
    const c = code[k]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && !depth) return php.slice(open + 1, k)
  }
  return php.slice(open + 1, end)
}

const BLOCK_NAME = /^[a-z0-9-]+\/[a-z0-9-]+$/

/**
 * Every register_block_type() / register_block_type_from_metadata() with the block.json it
 * registers and whether the call is guarded. The first argument is either a block type name —
 * one literal `namespace/name`, what WordPress registers without reading a file (never for
 * _from_metadata) — or a path in the exact forms phpThemePath accepts; any other expression
 * (a variable, a call, an object) throws: the scan cannot tell which file is registered.
 * Guarded: the call sits in the body of an `if (...)` (braced, or the single statement of a
 * brace-less one) whose condition has, as one `&&`/`and` term, the whole
 * file_exists() or is_readable() call on that block's block.json, in one of the same exact forms.
 * A check on the block directory is none (the directory can exist without its block.json), nor is
 * a check elsewhere — after the call, in another branch, negated, on another path, or on an
 * expression the scan does not read.
 * → [{ name, json, guarded }]
 */
export function blockCalls(php, file = 'functions.php') {
  const code = phpCode(php)
  const out = []
  // The `if (` … `)` whose `)` ends right before `pos` (whitespace between), as { cond } or null.
  const ifBefore = (pos) => {
    let k = pos - 1
    while (k >= 0 && /\s/.test(code[k])) k--
    if (code[k] !== ')') return null
    let depth = 0
    let o = k
    for (; o >= 0; o--) {
      if (code[o] === ')') depth++
      else if (code[o] === '(' && --depth === 0) break
    }
    if (o < 0) return null
    const head = code.slice(Math.max(0, o - 12), o)
    if (!/(^|[^\w$])(else)?if\s*$/i.test(head)) return null
    return { cond: [o + 1, k] }
  }
  const guards = (cond, dir) => {
    // Split the condition on top-level && / and; one term must be the whole positive call.
    const [a, b] = cond
    const terms = []
    let depth = 0
    let start = a
    for (let k = a; k < b; k++) {
      const c = code[k]
      if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      else if (!depth && (code.startsWith('&&', k) || /^\band\b/i.test(code.slice(k, k + 4)))) {
        terms.push([start, k])
        k += code[k] === '&' ? 1 : 2
        start = k + 1
      }
    }
    terms.push([start, b])
    return terms.some(([x, y]) => {
      const lead = /^\s*(?:file_exists|is_readable)\s*\(/i.exec(code.slice(x, y))
      if (!lead) return false
      const open = x + lead[0].length - 1
      const end = closing(code, open)
      if (end < 0 || code.slice(end + 1, y).trim()) return false
      let at
      try {
        at = phpThemePath(php.slice(open + 1, end), file)
      } catch {
        return false
      }
      // The directory can be there without its block.json: only a check on the file itself guards.
      return at === `${dir}/block.json`
    })
  }
  for (const m of code.matchAll(/(?<![\w$>:])register_block_type(_from_metadata)?\s*\(/gi)) {
    const fn = m[0].replace(/\s*\($/, '')
    const open = m.index + m[0].length - 1
    const end = closing(code, open)
    if (end < 0) throw new Error(`a ${fn}( call is not closed`)
    const arg = firstArg(php, code, open, end).trim()
    const lit = new RegExp(`^${PHP_STR}$`).exec(arg)
    if (!m[1] && lit && BLOCK_NAME.test(lit[1] ?? lit[2])) continue
    const at = phpThemePath(arg, file)
    if (at === null) throw new Error(`${fn}( ${clean(arg, 80)} ): neither a block name nor a path form the scan reads`)
    const dir = at.endsWith('/block.json') ? at.slice(0, -'/block.json'.length) : at
    // Enclosing braces: the unclosed `{` before the call, innermost last.
    const stack = []
    for (let k = 0; k < m.index; k++) {
      if (code[k] === '{') stack.push(k)
      else if (code[k] === '}') stack.pop()
    }
    const conds = [...stack.map((b) => ifBefore(b)), ifBefore(m.index)].filter(Boolean)
    out.push({ name: path.posix.basename(dir), json: `${dir}/block.json`, guarded: conds.some((c) => guards(c.cond, dir)) })
  }
  return out
}

/** `_wp_page_template: "default"` (or empty) selects the template hierarchy — no file of that name. */
const DEFAULT_TEMPLATE = (t) => t === 'default' || t === ''

// ---------------------------------------------------------------- detectors
// needs: the inputs a detector reads. A detector whose optional input was not given is out of
// scope (named on stderr); one whose input was given and cannot be read is unknown (exit 2).

const na = { state: 'na' }
const resolved = (detail) => ({ state: 'resolved', detail })
const unresolved = (detail) => ({ state: 'unresolved', detail })

export const DETECTORS = Object.freeze({
  'host-disk': {
    needs: ['spec'],
    what: 'free space on the file system of --spec',
    run(ctx) {
      const s = ctx.statfs(ctx.spec.root)
      const free = Number(s.bavail) * Number(s.bsize)
      if (!Number.isFinite(free)) throw new Error('statfs gave no free-space figure')
      const gb = (free / 1024 ** 3).toFixed(1)
      return free < ctx.limits.diskFreeBytes ? unresolved(`${gb} GB free under ${ctx.spec.root}`) : resolved(`${gb} GB free`)
    }
  },

  'spec-cat-slug': {
    needs: ['spec'],
    files: ['content.json'],
    what: 'content.json categories: one wpSlug per category',
    run(ctx) {
      const cats = arr(specJson(ctx, 'content.json')?.categories, 'content.json categories')
      const bySlug = new Map()
      const byAlias = new Map()
      for (const c of cats) {
        bySlug.set(c?.wpSlug, [...(bySlug.get(c?.wpSlug) ?? []), c?.id])
        if (c?.joomlaAlias) byAlias.set(c.joomlaAlias, (byAlias.get(c.joomlaAlias) ?? 0) + 1)
      }
      const dup = [...bySlug].filter(([, ids]) => ids.length > 1)
      if (dup.length) return unresolved(dup.map(([s, ids]) => `slug ${JSON.stringify(s)} held by categories ${ids.join(', ')}`).join('; '))
      return [...byAlias.values()].some((n) => n > 1) ? resolved('a shared alias kept distinct slugs') : na
    }
  },

  'spec-list-class': {
    needs: ['spec'],
    files: ['content.json', 'sections.json'],
    what: 'the class of each source <ul>/<ol> on the list block of the same words',
    async run(ctx) {
      const r = await pairedLists(ctx, (l) => l.classList.length > 0)
      const lost = r.matched.flatMap((m) => [...m.src.classList].filter((c) => !m.out.classList.contains(c)).map((c) => `${m.where}: ${c}`))
      const gone = r.lost.map((l) => `${l}: no block list of these words`)
      return listVerdict(r, [...lost, ...gone], 'list class lost')
    }
  },

  'spec-li-img': {
    needs: ['spec'],
    files: ['content.json', 'sections.json'],
    what: 'the images of each source list in the list block of the same words',
    async run(ctx) {
      const r = await pairedLists(ctx, (l) => ownImages(l) > 0)
      const lost = r.matched.filter((m) => ownImages(m.out) < ownImages(m.src)).map((m) => `${m.where}: ${ownImages(m.src)} → ${ownImages(m.out)}`)
      const gone = r.lost.map((l) => `${l}: no block list of these words`)
      return listVerdict(r, [...lost, ...gone], '<li> images dropped')
    }
  },

  'spec-img-pct': {
    needs: ['spec'],
    files: ['content.json', 'sections.json'],
    what: 'image file names decoded (no %XX) in the spec image tables',
    run(ctx) {
      const PCT = /%[0-9a-f]{2}/i
      const bad = []
      let decoded = 0
      for (const im of specImages(ctx)) {
        if (PCT.test(im.file ?? '') || PCT.test(im.original ?? '')) bad.push(`${im.where}: ${im.file ?? im.original}`)
        else if (PCT.test(im.src ?? '')) decoded++
      }
      return bad.length ? unresolved(`percent-encoded image names — ${bad.slice(0, 5).join('; ')}`) : decoded ? resolved() : na
    }
  },

  'spec-post-template': {
    needs: ['spec', 'theme'],
    files: ['content.json'],
    what: 'a template a post names is declared for posts by the theme',
    run(ctx) {
      const wanted = new Map()
      for (const p of arr(specJson(ctx, 'content.json')?.posts, 'content.json posts')) {
        const t = p?.meta?._wp_page_template
        if (t && !DEFAULT_TEMPLATE(t)) wanted.set(t, [...(wanted.get(t) ?? []), p.slug])
      }
      if (!wanted.size) return na
      const declared = new Map(arr(themeJson(ctx).customTemplates, 'theme.json customTemplates').map((t) => [t?.name, t?.postTypes ?? ['page']]))
      const bad = [...wanted].filter(([t]) => !declared.get(t)?.includes('post')).map(([t, slugs]) => `${t} (${declared.has(t) ? `postTypes ${JSON.stringify(declared.get(t))}` : 'not declared'}; posts ${slugs.slice(0, 3).join(', ')})`)
      return bad.length ? unresolved(bad.join('; ')) : resolved()
    }
  },

  'spec-template-file': {
    needs: ['spec', 'theme'],
    files: ['content.json'],
    what: 'every template a page or post declares, and every customTemplates row, has templates/<name>.html',
    run(ctx) {
      // Declared names only: a page-map view such as page-login is no template file of its own —
      // WordPress serves it with page.html (gotcha 63); what it serves is read by contract.mjs init.
      const names = new Map()
      const add = (n, where) => typeof n === 'string' && n && !DEFAULT_TEMPLATE(n) && !names.has(n) && names.set(n, where)
      const content = specJson(ctx, 'content.json')
      for (const k of ['pages', 'posts']) for (const p of arr(content?.[k], `content.json ${k}`)) add(p?.meta?._wp_page_template, `${k} ${p.slug}`)
      for (const t of arr(themeJson(ctx).customTemplates, 'theme.json customTemplates')) add(t?.name, 'theme.json customTemplates')
      if (!names.size) return na
      const have = themeTemplates(ctx)
      const missing = [...names].filter(([n]) => !have.has(n)).map(([n, w]) => `templates/${n}.html (${w})`)
      return missing.length ? unresolved(missing.slice(0, 5).join('; ')) : resolved()
    }
  },

  'spec-orphan-modules': {
    needs: ['spec'],
    files: ['content.json', 'sections.json'],
    what: 'modules at positions the layout does not draw are drawn by none of the seeder\'s paths',
    async run(ctx) {
      // The two paths by which seed.mjs buildPageContent draws a module, read as it reads them: an
      // entry of a section stack (`contentKind: "sections"`, kind section/html) naming the module,
      // and an ACM instance sections.json assigns to the page (instancesForPage). A slot, in an
      // entry or in the markup, draws only such instances, so the markup is not read.
      // Only what the seeder draws whatever the theme holds is a finding: a `section` entry with
      // its `html` (its last fallback is that HTML) or an `html` entry with its `blocks`. Anything
      // else — an ACM instance, an entry without that text — is drawn only through a pattern that
      // patterns.map.json maps and the site registers, which no scan input holds: unknown.
      const pages = arr(specJson(ctx, 'content.json')?.pages, 'content.json pages').filter((p) => arr(p?.orphaned, `content.json page ${clean(p?.slug, 60)} orphaned`).length)
      if (!pages.length) return na
      const sections = specJson(ctx, 'sections.json')
      arr(sections?.acm, 'sections.json acm')
      const { instancesForPage } = await import('../seed.mjs')
      const text = (v) => typeof v === 'string' && v.trim() !== ''
      const drawn = []
      const maybe = []
      for (const p of pages) {
        const ids = new Set(p.orphaned.map((o) => String(o?.module)))
        // The adapters write a section stack as `contentKind: "sections"` with a list, a body as
        // "blocks" with text; a page with one and not the other is no shape the seeder reads.
        if ((p.contentKind === 'sections') !== Array.isArray(p.content)) throw new InputError(`content.json page ${clean(p.slug, 60)}: contentKind ${clean(JSON.stringify(p.contentKind ?? null), 20)} with ${Array.isArray(p.content) ? 'a list' : typeof p.content} content`)
        const where = clean(p.path ?? p.slug, 60)
        const hit = []
        const pattern = []
        for (const e of Array.isArray(p.content) ? p.content : []) {
          if (!['section', 'html'].includes(e?.kind) || !ids.has(String(e.moduleId))) continue
          ;(text(e.kind === 'section' ? e.html : e.blocks) ? hit : pattern).push(`entry ${clean(e.moduleId, 20)}`)
        }
        let groups
        try {
          groups = instancesForPage({ sections }, p)
        } catch (e) {
          throw new InputError(`sections.json acm: ${clean(e.message, 160)} (page ${clean(p.slug, 60)})`)
        }
        for (const list of groups.values()) for (const inst of list) if (ids.has(String(inst?.id))) pattern.push(`acm ${clean(inst.id, 20)}`)
        if (hit.length) drawn.push(`${where} (${hit.slice(0, 3).join(', ')})`)
        if (pattern.length) maybe.push(`${where} (${pattern.slice(0, 3).join(', ')})`)
      }
      const open = maybe.length ? `orphaned modules drawn only if patterns.map.json maps them to a pattern the site registers, on ${maybe.slice(0, 5).join('; ')} — read the seed report's sections` : null
      // A finding on one module and no verdict on another is both: the finding printed, the other
      // unknown — the scan exits 2, since a clean second module is not shown.
      if (drawn.length) return { ...unresolved(`orphaned modules drawn by the seeder on ${drawn.slice(0, 5).join('; ')}`), ...(open ? { undecided: `spec-orphan-modules: ${open}` } : {}) }
      return open ? { state: 'unknown', detail: `spec-orphan-modules: ${open}` } : resolved()
    }
  },

  'theme-overlay-meta': {
    needs: ['theme'],
    what: 'overlay metadata files absent from the built theme',
    run(ctx) {
      const found = ['theme.config.json', 'theme.overlay.json', 'patterns.map.json'].filter((f) => ctx.theme.file(f) !== null)
      return found.length ? unresolved(`in the theme: ${found.join(', ')}`) : na
    }
  },

  'theme-block-path': {
    needs: ['theme'],
    what: 'each register_block_type(_from_metadata)() is a block name, or a path in its exact supported forms whose block.json is there or guarded by an if (file_exists/is_readable of that block.json)',
    run(ctx) {
      const bad = []
      let calls = 0
      for (const f of ctx.theme.list().filter((f) => f.endsWith('.php'))) {
        let found
        try {
          found = blockCalls(needFile(ctx.theme, f), f)
        } catch (e) {
          throw new InputError(`--theme ${f}: ${e.message}`)
        }
        for (const { json, guarded } of found) {
          calls++
          if (!guarded && ctx.theme.file(json) === null) bad.push(`${f}: ${json}`)
        }
      }
      return bad.length ? unresolved(`unguarded missing block path — ${bad.join('; ')}`) : calls ? resolved() : na
    }
  },

  'theme-docs-marker': {
    needs: ['theme'],
    what: 'no DOCS_REQUIRED: marker left in the theme docs',
    run(ctx) {
      const docs = ctx.theme.list().filter((f) => f === 'AGENTS.md' || (f.startsWith('docs/') && f.endsWith('.md')))
      if (!docs.length) return na
      const left = docs.filter((f) => needFile(ctx.theme, f).includes('DOCS_REQUIRED:'))
      return left.length ? unresolved(`markers in ${left.slice(0, 5).join(', ')}`) : resolved()
    }
  },

  'pack-modes': {
    needs: ['pack'],
    what: 'webroot archive members owned 0:0, files 0644/0755, directories 0755',
    run(ctx) {
      const { manifest, hashed } = readPackBounded(ctx.pack, ctx.limits)
      const webroot = hashed.get(manifest.webroot.file)
      // archive.py list, as listArchive runs it, read here before anything touches a row: the rows
      // are checked whole (archiveRowsCheck) before the audit reads them. No member is read (--read).
      const rows = archivePy(['list', webroot.abs], { spawn: ctx.archiveSpawn })
      // The lister opens the archive by path: it must still be the file whose sum was checked.
      const after = fs.lstatSync(webroot.abs)
      if (!after.isFile() || after.ino !== webroot.st.ino || after.dev !== webroot.st.dev || after.size !== webroot.st.size || after.mtimeMs !== webroot.st.mtimeMs)
        throw new InputError(`--pack: ${manifest.webroot.file} changed while it was listed`)
      archiveRowsCheck(rows, ctx.limits.archiveMembers)
      const { problems, unreadable } = auditArchiveMembers(rows)
      if (!problems.length && !unreadable.length) return resolved(`${rows.length} members on the policy`)
      return unresolved(`${unreadable.length} member(s) others cannot read; ${problems.length} off the policy — first: ${clean(problems[0] ?? unreadable[0]?.name, 120)}`)
    }
  }
})

const MEMBER_TYPES = new Set(['file', 'dir', 'symlink', 'hardlink', 'character device', 'block device', 'fifo', 'contiguous file', 'unknown type'])
const uint = (v) => Number.isSafeInteger(v) && v >= 0

/**
 * The member rows of `archive.py list` as auditArchiveMembers reads them — a non-empty list of at
 * most `max` objects, each with a non-empty string `name`, a known `type`, an integer `mode` (the
 * permission bits, with or without the file type bits: 0…0o177777), integer `uid`/`gid` ≥ 0, a
 * string `linkname` and a string list `pax`. Anything else throws: a listing the audit cannot read
 * is no verdict on the pack, clean or not.
 */
function archiveRowsCheck(rows, max = LIMITS.archiveMembers) {
  if (!Array.isArray(rows)) throw new Error('archive.py list gave no member list')
  if (!rows.length) throw new Error('archive.py list gave no member: a webroot archive holds WordPress')
  if (rows.length > max) throw new Error(`archive.py list gave ${rows.length} members (limit ${max})`)
  rows.forEach((r, i) => {
    const bad =
      !r || typeof r !== 'object' || Array.isArray(r)
        ? 'is not an object'
        : typeof r.name !== 'string' || !r.name
          ? 'has no name'
          : !MEMBER_TYPES.has(r.type)
            ? `has type ${clean(JSON.stringify(r.type), 40)}`
            : !uint(r.mode) || r.mode > 0o177777
              ? `has mode ${clean(JSON.stringify(r.mode), 40)}`
              : !uint(r.uid) || !uint(r.gid)
                ? 'has no integer uid/gid'
                : typeof r.linkname !== 'string'
                  ? 'has no linkname string'
                  : !Array.isArray(r.pax) || r.pax.some((k) => typeof k !== 'string')
                    ? 'has no pax key list'
                    : null
    if (bad) throw new Error(`archive.py list row ${i} ${bad}`)
  })
}

/**
 * A quickstart pack checked as restore checks it (quickstart/lib.mjs readPack: SHA256SUMS well
 * formed, every sum holding, the manifest whole and naming both archives), but read through the
 * scan's own tree — no link followed — and stricter on what it will read: SHA256SUMS must name
 * exactly manifest.json and the two archives the manifest names (what pack.mjs writes), so no list
 * of names can make the scan hash more; manifest.json is read under LIMITS.fileBytes; the two
 * archives are hashed in chunks within LIMITS.packBytes in all and LIMITS.packTimeoutMs.
 * → { manifest, hashed: Map(file → { abs, st }) }.
 */
function readPackBounded(pack, limits = LIMITS) {
  const t = tree(pack, '--pack', limits)
  const fail = (msg) => {
    throw new InputError(`--pack ${pack}: ${clean(msg, 200)}`)
  }
  const text = t.file('SHA256SUMS')
  if (text === null) fail('the pack has no SHA256SUMS')
  const bad = text.split('\n').filter((l) => l.trim() && !/^[0-9a-f]{64} {2}\S.*$/.test(l))
  if (bad.length) fail(`SHA256SUMS has lines that are not "<sha256>  <file>": ${bad.slice(0, 3).join(' | ')}`)
  const byFile = new Map()
  for (const { file, sha256 } of parseSums(text)) {
    if (!isArtifactName(file)) fail(`SHA256SUMS names ${JSON.stringify(file)} — not a plain file name in the pack`)
    if (byFile.has(file)) fail(`SHA256SUMS lists ${file} twice`)
    byFile.set(file, sha256)
  }
  if (!byFile.has('manifest.json')) fail('SHA256SUMS does not cover manifest.json')
  const manifestText = t.file('manifest.json')
  if (manifestText === null) fail('SHA256SUMS mismatch: manifest.json (missing)')
  if (sha256Of(manifestText) !== byFile.get('manifest.json')) fail('SHA256SUMS mismatch: manifest.json')
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (e) {
    fail(`manifest.json cannot be read: ${e.message}`)
  }
  const problems = manifestProblems(manifest)
  if (problems.length) fail(`manifest.json does not hold what restore and verify need: ${problems.join('; ')}`)
  const archives = [manifest.webroot.file, manifest.database.file]
  for (const [key, a] of [['webroot', manifest.webroot], ['database', manifest.database]]) {
    if (!byFile.has(a.file)) fail(`SHA256SUMS does not cover ${a.file} (the ${key} archive)`)
    if (byFile.get(a.file) !== a.sha256) fail(`manifest.json says ${a.file} is ${a.sha256}, SHA256SUMS says ${byFile.get(a.file)}`)
  }
  const extra = [...byFile.keys()].filter((f) => f !== 'manifest.json' && !archives.includes(f))
  if (extra.length) fail(`SHA256SUMS names files the manifest does not: ${extra.slice(0, 5).join(', ')}`)
  const budget = { left: limits.packBytes, total: limits.packBytes, deadline: Date.now() + limits.packTimeoutMs }
  const hashed = new Map()
  const mismatch = []
  for (const file of archives) {
    const h = t.hash(file, budget)
    if (!h || h.sha256 !== byFile.get(file)) mismatch.push(`${file}${h ? '' : ' (missing)'}`)
    else hashed.set(file, h)
  }
  if (mismatch.length) fail(`SHA256SUMS mismatch: ${mismatch.join(', ')}`)
  return { manifest, hashed }
}
const sha256Of = (text) => createHash('sha256').update(text).digest('hex')

/** The archive lister's spawn with the scan's own deadline and output bound. */
const boundedSpawn = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { ...opts, maxBuffer: LIMITS.archiveListBytes, timeout: LIMITS.archiveTimeoutMs, killSignal: 'SIGKILL' })

// ---------------------------------------------------------------- scan

/**
 * Run every detector a record names against the given inputs. → { unresolved, resolved,
 * guidance, unknown, skipped, notes } — each list of records sorted by id, each id once.
 */
export async function scan({ spec, theme, source = null, pack = null, catalog, statfs = fs.statfsSync, archiveSpawn = boundedSpawn, limits = {} } = {}) {
  const lim = { ...LIMITS, ...limits }
  const ctx = {
    spec: tree(spec, '--spec', lim),
    theme: tree(theme, '--theme', lim),
    source: source ? tree(source, '--source', lim) : null,
    pack,
    limits: lim,
    statfs,
    archiveSpawn,
    cache: new Map(),
    notes: []
  }
  if (!specJson(ctx, 'page-map.json')) throw new InputError(`--spec ${spec}: page-map.json is missing (not a spec-pack)`)
  const style = ctx.theme.file('style.css')
  if (style === null) throw new InputError(`--theme ${theme}: style.css is missing (not a built theme)`)
  if (!/^[ \t/*#@]*Theme Name\s*:\s*\S/im.test(style)) throw new InputError(`--theme ${theme}: style.css has no Theme Name header (not a built theme)`)
  // Every spec JSON file there and theme.json are read and shape-checked before any detector runs:
  // a bad file is exit 2 whichever detectors happen to run or skip today.
  for (const rel of Object.keys(SPEC_SHAPES)) specJson(ctx, rel)
  themeJson(ctx)
  // A --source given must hold saved pages whether or not a detector reads it today: an empty or
  // wrong directory is no source the scan checked.
  if (ctx.source && !ctx.source.list().some((f) => f.endsWith('.html'))) throw new InputError(`--source ${source}: holds no saved .html page`)
  const given = { spec: true, theme: true, source: !!source, pack: !!pack }
  const out = { unresolved: [], resolved: [], guidance: [], unknown: [], skipped: [], tool: [], notes: ctx.notes }
  const byDetector = new Map()
  for (const r of catalog) {
    if (kindOf(r) === 'fixed') continue
    if (kindOf(r) === 'tool') {
      out.tool.push(r)
      continue
    }
    if (r.when === 'always') {
      out.guidance.push(r)
      continue
    }
    byDetector.set(r.when, [...(byDetector.get(r.when) ?? []), r])
  }
  const runs = [...byDetector].map(async ([id, records]) => {
    const d = DETECTORS[id]
    const missing = d.needs.filter((n) => !given[n])
    if (missing.length) return records.map((r) => ({ r, state: 'skipped', detail: `no --${missing.join(', --')}` }))
    try {
      // Every spec file the detector reads must be there (a from-url skeleton has no content.json):
      // one missing is not checked, named on stderr — never read as "no trap" on the rest.
      const absent = (d.files ?? []).filter((f) => ctx.spec.file(f) === null)
      if (absent.length) return records.map((r) => ({ r, state: 'skipped', detail: `no ${absent.join(', ')} in --spec` }))
      const res = await d.run(ctx)
      return records.map((r) => ({ r, ...res }))
    } catch (e) {
      return records.map((r) => ({ r, state: 'unknown', detail: `${id}: ${clean(e.message)}` }))
    }
  })
  const settled = await Promise.all(runs)
  for (const results of settled)
    for (const { r, state, detail, notChecked, undecided } of results) {
      // A verdict on part of the input still names the part it did not read: an input not given
      // is not checked (no exit weight); an input given that the detector cannot decide is
      // unknown beside the verdict, so it takes exit 2 as any unknown does.
      if (notChecked && state !== 'skipped') out.skipped.push({ ...r, detail: clean(notChecked) })
      if (undecided && state !== 'unknown') out.unknown.push({ ...r, detail: clean(undecided) })
      if (state === 'na') continue
      out[state].push(detail ? { ...r, detail: clean(detail) } : r)
    }
  for (const k of ['unresolved', 'resolved', 'guidance', 'unknown', 'skipped', 'tool']) out[k].sort((a, b) => (a.id < b.id ? -1 : 1))
  return out
}

/** stdout lines, stderr lines and the exit code of a scan: 2 unknown > 1 unresolved > 0. */
export function report(res) {
  const stdout = [...res.unresolved, ...res.guidance].map(formatLine)
  const stderr = []
  const ids = (l) => l.map((r) => r.id).join(', ')
  stderr.push(`lessons: ${res.unresolved.length} unresolved · ${res.guidance.length} guidance (always) · ${res.resolved.length} resolved · ${res.unknown.length} unknown`)
  for (const r of res.unresolved) if (r.detail) stderr.push(`  unresolved ${r.id}: ${r.detail}`)
  if (res.resolved.length) stderr.push(`  resolved (trap present, fix holds): ${ids(res.resolved)}`)
  for (const r of res.unknown) stderr.push(`  unknown ${r.id}: ${r.detail}`)
  const skipped = new Map()
  for (const r of res.skipped) skipped.set(r.detail, [...(skipped.get(r.detail) ?? []), r.id])
  for (const [why, list] of skipped) stderr.push(`  not checked (${why}): ${list.join(', ')}`)
  if (res.tool.length) stderr.push(`  left to live-page tools, not scanned: ${res.tool.map((r) => `${r.id} (${r.tool})`).join(', ')}`)
  for (const n of res.notes) stderr.push(`  ${clean(n)}`)
  stderr.push('  guidance lines are reminders, not checks; the scan does not replace parity, visual or package gates')
  return { stdout, stderr, code: res.unknown.length ? 2 : res.unresolved.length ? 1 : 0 }
}
