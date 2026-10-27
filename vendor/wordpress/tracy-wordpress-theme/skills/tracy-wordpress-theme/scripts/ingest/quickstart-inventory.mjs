#!/usr/bin/env node
// What a quickstart is made of, read from its files: per quickstart the tag, every asset with its
// SHA-256, the archive format (installer ZIP, runtime webroot + database, bundle), the Joomla version
// and minimum PHP the source declares, each site template with the framework its own files show
// (T4, T3, Gavick, Helix, other, unknown — never guessed from the product name), the extension
// manifests present and what the database says of them, the template styles and the languages.
// Writes inventory.json + inventory.md, and with --baseline a baseline.json that freezes the inputs
// of two measured ports (source hashes, release bindings, runtime image digests, tool identity).
// `--verify-baseline` re-measures one and exits 1 on any gap. Packet: references/inputs/quickstart-inventory.md.
//
// Archives are read by quickstart-inventory-archive.py (Python standard library): streamed, never
// extracted, nothing inside executed or imported; the source is only read.
//
// Usage: node quickstart-inventory.mjs --input <dir> --out <dir> [--tag <id>=<tag>]… [--verify-tags]
//        node quickstart-inventory.mjs --release <tag>… --out <dir> [--repo owner/name] [--download-dir <dir>]
//        … [--baseline <idA>,<idB> --image <ref>…] [--limit <key>=<n>]… [--timeout <s>]
//        node quickstart-inventory.mjs --verify-baseline <baseline.json> --input <dir> [--timeout <s>]
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, UsageError, usageText } from '../quickstart/lib.mjs'
import { GOOGLE_LIST, analyzeStatic, archiveReader } from './source-font.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(HERE, '..', '..')
const HELPER = path.join(HERE, 'quickstart-inventory-archive.py')
const SCHEMA = 'tracy.quickstart-inventory/1'
const BASELINE_SCHEMA = 'tracy.quickstart-baseline/1'
const DEFAULT_REPO = 'JoomlArt-Products/ja-products'
const IMPLEMENTATION_FILES = ['scripts/ingest/quickstart-inventory.mjs', 'scripts/ingest/quickstart-inventory-archive.py', 'scripts/ingest/source-font.mjs']
const LIMIT_KEYS = ['maxMembers', 'maxExpandedBytes', 'maxRatio', 'ratioFloor', 'maxDepth', 'maxNestedBytes', 'maxMetadataBytes', 'maxDirectoryBytes', 'maxSqlBytes', 'maxSqlRows', 'maxTextBytes', 'maxTextTotal']
const FRAMEWORKS = ['T4', 'T3', 'Gavick', 'Helix']
const ARCHIVE_EXT = /\.(zip|tar|tgz|tar\.gz|tar\.bz2|tar\.xz|sql|sql\.gz)$/i
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const IMAGE_PIN_RE = /^([a-z0-9][a-z0-9._\/:-]*?)(?::[A-Za-z0-9_.-]+)?@sha256:[0-9a-f]{64}$/
const IMAGE_DIGEST_RE = /^sha256:[0-9a-f]{64}$/

const SPEC = {
  '--input': { placeholder: 'dir', help: 'downloaded quickstarts: each archive file, or each sub-directory of archives, is one quickstart' },
  '--release': { placeholder: 'tag', repeat: true, help: 'release tag to download and inventory; repeatable' },
  '--repo': { placeholder: 'owner/name', default: DEFAULT_REPO, help: 'release repository' },
  '--download-dir': { placeholder: 'dir', help: 'keep --release downloads here (one sub-directory per quickstart) instead of a temporary directory' },
  '--out': { placeholder: 'dir', help: 'where inventory.json, inventory.md (and baseline.json) are written' },
  '--tag': { placeholder: 'id=tag', repeat: true, help: 'declare the release tag of a local quickstart; repeatable' },
  '--verify-tags': { value: false, help: 'check each declared tag with `gh release view`: an asset of that release must carry the local SHA-256' },
  '--baseline': { placeholder: 'idA,idB', help: 'write baseline.json for this pair of quickstarts' },
  '--image': { placeholder: 'ref', repeat: true, help: 'runtime image of the measured ports (name:tag resolved with docker, or name@sha256:…); repeatable' },
  '--limit': { placeholder: 'key=n', repeat: true, help: `archive limit override (${LIMIT_KEYS.join(', ')}); repeatable` },
  '--timeout': { placeholder: 's', default: '1800', help: 'seconds for the whole run; past it the run fails and writes nothing' },
  '--verify-baseline': { placeholder: 'file', help: 'strictly re-measure a baseline.json against --input; exit 1 on any gap' }
}
const USAGE =
  'usage: quickstart-inventory.mjs (--input <dir> | --release <tag>…) --out <dir> [--tag id=tag]… [--verify-tags] [--baseline a,b --image ref…]\n' +
  '       quickstart-inventory.mjs --verify-baseline <baseline.json> --input <dir>'

// ---------------------------------------------------------------- arguments
/** Strict parse: unknown, repeated single-value, empty and positional arguments are usage errors. */
export function parseCli(argv) {
  const out = {}
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--help' || a === '-h') return { help: true }
    if (!a.startsWith('--')) throw new UsageError(`unexpected argument ${JSON.stringify(a)}`)
    const eq = a.indexOf('=')
    const name = eq === -1 ? a : a.slice(0, eq)
    const def = SPEC[name]
    if (!def) throw new UsageError(`unknown option ${name}`)
    const k = camel(name)
    if (def.value === false) {
      if (eq !== -1) throw new UsageError(`${name} takes no value`)
      if (out[k]) throw new UsageError(`${name} given twice`)
      out[k] = true
      continue
    }
    const value = eq === -1 ? args.shift() : a.slice(eq + 1)
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) throw new UsageError(`${name} needs a value`)
    if (def.repeat) (out[k] ||= []).push(value)
    else if (out[k] !== undefined) throw new UsageError(`${name} given twice`)
    else out[k] = value
  }
  for (const [name, def] of Object.entries(SPEC)) {
    const k = camel(name)
    if (out[k] === undefined) out[k] = def.value === false ? false : def.repeat ? [] : def.default
  }
  const timeout = Number(out.timeout)
  if (!Number.isFinite(timeout) || timeout <= 0) throw new UsageError(`--timeout must be a positive number of seconds, not ${out.timeout}`)
  out.timeout = timeout
  if (!REPO_RE.test(out.repo)) throw new UsageError(`--repo must be owner/name, not ${out.repo}`)
  out.limits = parseLimits(out.limit)
  if (out.verifyBaseline) {
    const extra = ['release', 'out', 'tag', 'verifyTags', 'baseline', 'image', 'downloadDir', 'limit'].filter((k) => (Array.isArray(out[k]) ? out[k].length : out[k]))
    if (extra.length) throw new UsageError(`--verify-baseline takes only --input and --timeout (also given: ${extra.map(flag).join(', ')})`)
    if (!out.input) throw new UsageError('--verify-baseline needs --input <dir> holding the baseline sources')
    return out
  }
  if (out.input && out.release.length) throw new UsageError('--input and --release are exclusive: one run reads local archives or release tags')
  if (!out.input && !out.release.length) throw new UsageError('give --input <dir> or at least one --release <tag>')
  if (!out.out) throw new UsageError('--out is required')
  if (out.release.length && (out.tag.length || out.verifyTags)) throw new UsageError('--tag and --verify-tags are for --input; a --release quickstart is bound to its tag already')
  if (out.downloadDir && !out.release.length) throw new UsageError('--download-dir is only for --release')
  if (out.verifyTags && !out.tag.length) throw new UsageError('--verify-tags needs at least one --tag id=tag')
  for (const t of out.release) if (!TAG_RE.test(t) || t.includes('..')) throw new UsageError(`--release ${JSON.stringify(t)} is not a tag name`)
  if (new Set(out.release).size !== out.release.length) throw new UsageError('the same --release tag is given twice')
  out.tags = parseTags(out.tag)
  if (out.baseline) {
    const pair = out.baseline.split(',').map((s) => s.trim())
    if (pair.length !== 2 || pair.some((p) => !ID_RE.test(p)) || pair[0] === pair[1]) throw new UsageError(`--baseline needs two different quickstart ids, a,b — not ${JSON.stringify(out.baseline)}`)
    out.pair = pair
  } else if (out.image.length) throw new UsageError('--image is recorded only in a baseline: give --baseline')
  if (new Set(out.image).size !== out.image.length) throw new UsageError('the same --image is given twice')
  for (const ref of out.image) if (!/^[a-z0-9][A-Za-z0-9._\/:@-]*$/.test(ref)) throw new UsageError(`--image ${JSON.stringify(ref)} is not an image reference`)
  return out
}
const camel = (name) => name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
const flag = (k) => '--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

function parseLimits(values) {
  const limits = {}
  for (const v of values) {
    const m = /^([A-Za-z]+)=(\d+)$/.exec(v)
    if (!m || !LIMIT_KEYS.includes(m[1]) || Number(m[2]) <= 0 || !Number.isSafeInteger(Number(m[2]))) throw new UsageError(`--limit ${JSON.stringify(v)}: expected key=n with key one of ${LIMIT_KEYS.join(', ')} and n > 0`)
    if (m[1] in limits) throw new UsageError(`--limit ${m[1]} given twice`)
    limits[m[1]] = Number(m[2])
  }
  return limits
}

function parseTags(values) {
  const tags = new Map()
  for (const v of values) {
    const i = v.indexOf('=')
    const id = v.slice(0, i)
    const tag = v.slice(i + 1)
    if (i <= 0 || !ID_RE.test(id) || !TAG_RE.test(tag) || tag.includes('..')) throw new UsageError(`--tag ${JSON.stringify(v)}: expected <id>=<tag>`)
    if (tags.has(id)) throw new UsageError(`--tag names ${id} twice`)
    if ([...tags.values()].includes(tag)) throw new UsageError(`--tag binds ${tag} to two quickstarts`)
    tags.set(id, tag)
  }
  return tags
}

// ---------------------------------------------------------------- deadline + processes
function makeDeadline(seconds, now = Date.now) {
  const until = now() + seconds * 1000
  return {
    until,
    remainingMs: () => until - now(),
    check(what) {
      if (now() > until) throw new Error(`timed out after ${seconds}s (${what})`)
    }
  }
}

/** One external command, bounded by the deadline; a missing command, a signal or a timeout is an error. */
function runCommand(cmd, args, { deadline, what, input, maxBuffer = 512 << 20, spawn = spawnSync, env = process.env } = {}) {
  deadline?.check(what)
  const timeout = deadline ? Math.max(1, deadline.remainingMs()) : undefined
  const r = spawn(cmd, args, { encoding: 'utf8', timeout, maxBuffer, input, env, killSignal: 'SIGKILL' })
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Error(`${what}: ${cmd} is not installed or not on PATH`)
    if (r.error.code === 'ETIMEDOUT') throw new Error(`${what}: timed out (the run's --timeout)`)
    throw new Error(`${what}: ${cmd} failed (${r.error.message})`)
  }
  if (r.signal) throw new Error(`${what}: ${cmd} ended by ${r.signal}`)
  return r
}
const lastLine = (s) => String(s ?? '').trim().split('\n').filter(Boolean).slice(-1)[0] ?? ''

// ---------------------------------------------------------------- hashing
const sha256Text = (t) => createHash('sha256').update(t).digest('hex')
const SHA_RE = /^[0-9a-f]{64}$/

// ---------------------------------------------------------------- local discovery
const stripArchiveExt = (name) => name.replace(ARCHIVE_EXT, '')

/**
 * An archive's own name, as a directory entry: not hidden, no separator, no control character, an
 * archive extension. Spaces and non-ASCII letters are names like any other.
 */
// eslint-disable-next-line no-control-regex
const assetNameOk = (n) => typeof n === 'string' && n.length > 0 && !n.startsWith('.') && !/[/\u0000-\u001f\u007f]/.test(n) && ARCHIVE_EXT.test(n)

/**
 * The one form of an asset path, relative to --input: `<archive>` whose name gives a quickstart id, or
 * `<quickstart id>/<archive>`. Discovery and release download produce only this form, and a baseline
 * accepts exactly it — an asset that was inventoried is one a baseline can freeze and re-hash.
 */
export function assetPathOk(p) {
  if (typeof p !== 'string') return false
  const parts = p.split('/')
  if (parts.length === 1) return assetNameOk(parts[0]) && ID_RE.test(stripArchiveExt(parts[0]))
  return parts.length === 2 && ID_RE.test(parts[0]) && assetNameOk(parts[1])
}

/**
 * --input as given (made absolute, lexically) and as resolved once (realpath). A link on the way to the
 * directory the operator named is theirs to use (on macOS /tmp is one); what counts is that everything
 * read afterwards is below the one resolved directory, reached from it without following a link.
 */
function resolveInput(given) {
  const abs = path.resolve(given)
  let resolved
  try {
    resolved = realpathSync.native(abs)
  } catch (e) {
    throw new Error(`--input ${given}: ${e.code === 'ENOENT' ? 'does not exist' : `cannot be resolved (${e.code ?? e.message})`}`)
  }
  let st
  try {
    st = statSync(resolved)
  } catch (e) {
    throw new Error(`--input ${given}: cannot be read (${e.code ?? e.message})`)
  }
  if (!st.isDirectory()) throw new Error(`--input ${given}: not a directory`)
  return { given: abs, resolved }
}

/**
 * One path operation of the archive helper below a resolved root: `list`, `hash` or `stat`. The helper
 * opens the root from `/` without following a link and every path below it through directory
 * descriptors (openat, O_NOFOLLOW), so no link below the root is followed. `{ got }`, or `{ refused }`
 * with the helper's {problem, at, detail}, or `{ failed }` with a message.
 */
function pathOp(op, root, rel, { deadline, spawn } = {}) {
  const args = [HELPER, op, root, ...(rel === null ? [] : [rel])]
  if (deadline) args.push('--deadline', String(deadline.until / 1000))
  let r
  try {
    r = runCommand('python3', args, { deadline, what: rel === null ? `listing of ${root}` : `source ${rel}`, spawn })
  } catch (e) {
    return { failed: e.message }
  }
  if (r.status === 3) {
    let e = null
    try {
      e = JSON.parse(lastLine(r.stderr))
    } catch {}
    return isRecord(e) && typeof e.problem === 'string' ? { refused: e } : { failed: `refused by the archive helper: ${lastLine(r.stderr) || 'no message'}` }
  }
  if (r.status !== 0) return { failed: `archive helper exited ${r.status}: ${lastLine(r.stderr) || 'no message'}` }
  let got = null
  try {
    got = JSON.parse(r.stdout)
  } catch {}
  return isRecord(got) ? { got } : { failed: 'archive helper answered something that is not JSON' }
}

/** What a refusal of the helper says of a path below `root`, as the end of a sentence about it. */
function refusal(e, root) {
  const detail = e.detail ? ` (${e.detail})` : ''
  return (
    {
      missing: `is missing from ${root}`,
      'not-directory': `is missing from ${root} (${e.at} is not a directory)`,
      symlink: `is not a regular file inside --input (${e.at} is a symlink, not followed)`,
      'not-file': 'is not a regular file',
      'not-relative': 'is not a relative path of plain names',
      root: `cannot be reached: the resolved --input ${root} cannot be opened (${e.at}${e.detail ? `: ${e.detail}` : ''})`,
      'root-link': `cannot be reached: ${e.at}, on the resolved --input ${root}, is a symlink now (changed after it was resolved; not followed)`,
      'root-not-canonical': `cannot be reached: ${root} is not a resolved path`,
      changed: `changed while it was opened (${e.at})`,
      open: `cannot be read${detail}`,
      read: `cannot be read${detail}`,
      deadline: 'was not read before the deadline'
    }[e.problem] ?? `refused by the archive helper (${e.problem})`
  )
}

const stampKey = (s) => (isRecord(s) ? `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}` : null)

/**
 * The quickstarts of a directory: each archive file at the top is one quickstart named after it
 * (ja-nova.zip → ja-nova); each sub-directory is one quickstart made of the archives in it (a runtime
 * pair, webroot + database). Other files are listed as ignored. The directory is resolved once and
 * listed by the archive helper below that root; links and special files below it are refused, not
 * followed: what is hashed must be what was named.
 */
export function discoverLocal(dir, { spawn } = {}) {
  const input = resolveInput(dir)
  const root = input.resolved
  const listed = pathOp('list', root, null, { spawn })
  if (!listed.got) throw new Error(`--input ${dir}: cannot be listed (${listed.failed ?? refusal(listed.refused, root)})`)
  if (!Array.isArray(listed.got.entries)) throw new Error(`--input ${dir}: the archive helper answered no listing`)
  const groups = new Map()
  const ignored = []
  const add = (id, asset) => {
    if (!ID_RE.test(id)) throw new Error(`--input ${dir}: ${asset.rel} gives the quickstart id ${JSON.stringify(id)}, which is not a plain name`)
    if (groups.has(id) && !asset.fromDir) throw new Error(`--input ${dir}: two sources for quickstart ${id} (${groups.get(id).assets[0].rel}, ${asset.rel}) — put one away or group them in a sub-directory`)
    if (!groups.has(id)) groups.set(id, { id, assets: [] })
    groups.get(id).assets.push(asset)
  }
  const refuseKind = (e, shown) => {
    if (e.kind === 'bad-name') throw new Error(`--input ${dir}: ${shown} has a name that is not UTF-8 — rename it`)
    if (e.kind === 'link' || e.kind === 'other') throw new Error(`--input ${dir}: ${shown} is ${e.kind === 'link' ? 'a symlink' : 'not a file or directory'} — refused, not followed`)
  }
  const asset = (rel, name, fromDir) => ({ name, rel, root, path: path.join(root, rel), ...(fromDir ? { fromDir } : {}) })
  for (const e of [...listed.got.entries].sort((a, b) => cmp(a.name, b.name))) {
    const name = e.name
    if (name.startsWith('.')) {
      ignored.push(name)
      continue
    }
    refuseKind(e, name)
    if (e.kind === 'file') {
      if (!ARCHIVE_EXT.test(name)) {
        ignored.push(name)
        continue
      }
      add(stripArchiveExt(name), asset(name, name, false))
      continue
    }
    const archives = []
    for (const t of [...(e.entries ?? [])].sort((a, b) => cmp(a.name, b.name))) {
      const n = t.name
      if (n.startsWith('.')) continue
      refuseKind(t, `${name}/${n}`)
      if (t.kind === 'file' && ARCHIVE_EXT.test(n)) {
        if (!assetNameOk(n)) throw new Error(`--input ${dir}: ${name}/${JSON.stringify(n).slice(1, -1)} is an archive whose name holds a control character — rename it`)
        archives.push(n)
      } else ignored.push(`${name}/${n}`)
    }
    if (!archives.length) throw new Error(`--input ${dir}: sub-directory ${name} holds no archive`)
    if (groups.has(name)) throw new Error(`--input ${dir}: two sources for quickstart ${name} (${groups.get(name).assets[0].rel}, ${name}/)`)
    for (const n of archives) add(name, asset(`${name}/${n}`, n, true))
  }
  if (!groups.size) throw new Error(`--input ${dir}: no quickstart archive (.zip, .tar[.gz|.bz2|.xz], .tgz, .sql[.gz]) in it`)
  return { input, root, groups: [...groups.values()].map((g) => ({ ...g, assets: g.assets.map(({ fromDir, ...a }) => a) })), ignored }
}

// ---------------------------------------------------------------- releases (gh, read-only)
/** `gh release view` for one tag; the answer must be about that tag. */
function releaseView(tag, repo, { deadline, spawn } = {}) {
  const what = `release ${tag} on ${repo}`
  const r = runCommand('gh', ['release', 'view', tag, '-R', repo, '--json', 'tagName,assets'], { deadline, what, spawn })
  if (r.status !== 0) throw new Error(`${what}: gh exited ${r.status}: ${lastLine(r.stderr) || 'no message'}`)
  let data
  try {
    data = JSON.parse(r.stdout)
  } catch {
    throw new Error(`${what}: gh answered something that is not JSON`)
  }
  if (!data || data.tagName !== tag) throw new Error(`${what}: gh answered for ${JSON.stringify(data?.tagName)}, not the tag asked`)
  if (!Array.isArray(data.assets)) throw new Error(`${what}: the answer has no asset list`)
  const assets = []
  for (const a of data.assets) {
    if (!a || typeof a.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(a.name)) throw new Error(`${what}: an asset without a plain name (${JSON.stringify(a?.name)})`)
    const digest = typeof a.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(a.digest) ? a.digest.slice(7) : null
    assets.push({ name: a.name, size: Number.isSafeInteger(a.size) ? a.size : null, sha256: digest })
  }
  if (new Set(assets.map((a) => a.name)).size !== assets.length) throw new Error(`${what}: two assets share a name`)
  return { tag, repo, assets: assets.sort((a, b) => cmp(a.name, b.name)) }
}

const idForTag = (tag) => tag.replace(/^quickstart\//, '').replace(/\//g, '-')

/** Download the archive assets of a release into `dir` and check each against the release digest. */
async function downloadRelease(view, dir, { deadline, spawn } = {}) {
  const archives = view.assets.filter((a) => ARCHIVE_EXT.test(a.name))
  if (!archives.length) throw new Error(`release ${view.tag}: no archive asset (${view.assets.map((a) => a.name).join(', ') || 'no assets'})`)
  mkdirSync(dir, { recursive: true })
  for (const a of archives) {
    if (existsSync(path.join(dir, a.name))) throw new Error(`release ${view.tag}: ${path.join(dir, a.name)} already exists — give an empty --download-dir`)
  }
  // resolved before gh runs: the directory hashed below is the one created here, whatever gh leaves
  const real = realpathSync.native(dir)
  const what = `download of release ${view.tag}`
  const r = runCommand('gh', ['release', 'download', view.tag, '-R', view.repo, '-D', dir, ...archives.flatMap((a) => ['-p', a.name])], { deadline, what, spawn })
  if (r.status !== 0) throw new Error(`${what}: gh exited ${r.status}: ${lastLine(r.stderr) || 'no message'}`)
  // hashed through the helper's descriptor walk below that directory: a file or the directory itself
  // swapped for a link after the download is refused, never followed
  const assets = []
  for (const a of archives) {
    const p = path.join(dir, a.name)
    const got = hashInside(real, a.name, { deadline, spawn })
    if (got.problem) throw new Error(`${what}: ${a.name} ${got.problem}`)
    if (a.size !== null && got.size !== a.size) throw new Error(`${what}: ${a.name} is ${got.size} bytes, the release says ${a.size} (truncated or changed)`)
    if (a.sha256 && got.sha256 !== a.sha256) throw new Error(`${what}: ${a.name} has SHA-256 ${got.sha256}, the release says ${a.sha256}`)
    assets.push({ name: a.name, path: p, releaseSha256: a.sha256 })
  }
  return assets
}

/** A local quickstart's declared tag holds when an asset of that release carries the local bytes' digest. */
function bindTag({ id, tag, repo, assets, view }) {
  const bindings = []
  for (const a of assets) {
    const match = view.assets.find((r) => r.sha256 && r.sha256 === a.sha256)
    if (!match) throw new Error(`--tag ${id}=${tag}: no asset of release ${tag} on ${repo} has the SHA-256 of ${a.rel} (${a.sha256}) — the mapping is wrong or the release changed`)
    bindings.push({ asset: a.rel, releaseAsset: match.name, sha256: match.sha256 })
  }
  return { source: 'release-digest', repo, bindings }
}

// ---------------------------------------------------------------- scanning
/**
 * Run the archive helper on one asset, below its resolved root: hashed once, then scanned from the
 * descriptor its own walk opened; the two reads must agree on the bytes and on the file (its stamp).
 */
async function scanAsset(asset, { limits = {}, deadline, spawn } = {}) {
  const measured = pathOp('hash', asset.root, asset.rel, { deadline, spawn })
  if (!measured.got) throw new Error(`asset ${asset.rel}: ${measured.failed ? `cannot be read (${measured.failed})` : refusal(measured.refused, asset.root)}`)
  if (!SHA_RE.test(measured.got.sha256 ?? '') || !Number.isSafeInteger(measured.got.size)) throw new Error(`asset ${asset.rel}: archive helper answered something that is not a digest`)
  if (!measured.got.size) throw new Error(`asset ${asset.rel}: empty file`)
  const args = [HELPER, 'scan', asset.root, asset.rel, '--limits', JSON.stringify(limits)]
  if (deadline) args.push('--deadline', String(deadline.until / 1000))
  const r = runCommand('python3', args, { deadline, what: `asset ${asset.rel}`, spawn })
  if (r.status === 3) {
    let e = {}
    try {
      e = JSON.parse(lastLine(r.stderr))
    } catch {}
    const member = e.member && e.member !== asset.name ? ` member ${e.member}` : ''
    throw new Error(`asset ${asset.rel}${member}: ${e.error ?? (lastLine(r.stderr) || 'refused')}`)
  }
  if (r.status !== 0) throw new Error(`asset ${asset.rel}: archive helper exited ${r.status}: ${lastLine(r.stderr) || 'no message'}`)
  let scan
  try {
    scan = JSON.parse(r.stdout)
  } catch {
    throw new Error(`asset ${asset.rel}: archive helper answered something that is not JSON`)
  }
  const stamp = stampKey(measured.got)
  if (scan.sha256 !== measured.got.sha256 || scan.size !== measured.got.size || stampKey(scan.stamp) !== stamp)
    throw new Error(`asset ${asset.rel}: changed while it was read (two reads disagree) — nothing is recorded for a moving source`)
  return { ...asset, sha256: measured.got.sha256, size: measured.got.size, stamp, scan }
}

// ---------------------------------------------------------------- analysis
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const byKeys = (...keys) => (a, b) => {
  for (const k of keys) {
    const c = cmp(String(a[k] ?? ''), String(b[k] ?? ''))
    if (c) return c
  }
  return 0
}
const numericId = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? Infinity : Number(v))

/** Joomla roots of a container: prefixes P with P + administrator/manifests/files/joomla.xml. */
function joomlaRoots(container) {
  const roots = []
  for (const [p, kind] of container.members) {
    const m = /^(.*?)administrator\/manifests\/files\/joomla\.xml$/.exec(p)
    if (m && kind === 'f' && (m[1] === '' || m[1].endsWith('/'))) roots.push(m[1])
  }
  return roots.sort()
}

/** Framework markers a template's own files carry. The site-wide plugins are corroboration, not evidence. */
function templateEvidence(dir, xml, members) {
  const ev = []
  const base = `templates/${dir}/`
  const has = (re) => members.filter((p) => re.test(p)).sort()
  const push = (framework, where, detail) => ev.push({ framework, path: where, detail })
  if (xml && !xml.error) {
    for (const f of [['t4', 'T4'], ['t3', 'T3']]) {
      if (xml.children?.includes(f[0])) push(f[1], `${base}templateDetails.xml`, `manifest declares <${f[0]}>`)
      if (xml.pluginRefs?.includes(f[0])) push(f[1], `${base}templateDetails.xml`, `manifest refers to plugins/system/${f[0]}`)
    }
    for (const h of ['helix3', 'helixultimate']) if (xml.pluginRefs?.includes(h)) push('Helix', `${base}templateDetails.xml`, `manifest refers to plugins/system/${h}`)
  }
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const t4Layouts = has(new RegExp(`^${esc}etc/layout/[^/]+\\.json$`))
  if (t4Layouts.length) push('T4', t4Layouts[0], `JSON layout under etc/layout (${t4Layouts.length} file${t4Layouts.length > 1 ? 's' : ''})`)
  const t3Layouts = has(new RegExp(`^${esc}etc/layout/[^/]+\\.ini$`))
  if (t3Layouts.length) push('T3', t3Layouts[0], `INI layout under etc/layout (${t3Layouts.length} file${t3Layouts.length > 1 ? 's' : ''})`)
  if (members.includes(`${base}tpls`)) push('T3', `${base}tpls/`, 'tpls/ block directory')
  if (members.includes(`${base}lib/gavern`)) push('Gavick', `${base}lib/gavern/`, 'Gavern framework directory')
  return ev
}

const FRAMEWORK_PLUGINS = { T4: ['t4'], T3: ['t3'], Helix: ['helix3', 'helixultimate'], Gavick: [] }

export function classifyTemplate(dir, xml, members, plugins) {
  const evidence = templateEvidence(dir, xml, members)
  const found = [...new Set(evidence.map((e) => e.framework))].sort()
  const notes = []
  let framework
  if (!xml || xml.error) framework = found.length === 1 ? found[0] : found.length > 1 ? 'conflict' : 'unknown'
  else framework = found.length === 1 ? found[0] : found.length > 1 ? 'conflict' : 'other'
  if (!xml) notes.push('no templateDetails.xml')
  else if (xml.error) notes.push(`templateDetails.xml unreadable: ${xml.error}`)
  let plugin = null
  if (FRAMEWORK_PLUGINS[framework]?.length) {
    plugin = plugins.find((p) => FRAMEWORK_PLUGINS[framework].includes(p.element)) ?? null
    if (!plugin) notes.push(`no plugins/system/${FRAMEWORK_PLUGINS[framework].join(' or plugins/system/')} in the archive: the template's framework plugin is not shipped`)
  }
  if (framework === 'other' && plugins.length)
    notes.push(`the site ships ${plugins.map((p) => `plugins/system/${p.element}`).join(', ')}, but this template's files carry no framework marker`)
  if (framework === 'conflict') notes.push(`markers of ${found.join(' and ')} in one template`)
  return { framework, evidence, plugin: plugin && { element: plugin.element, version: plugin.version, manifest: plugin.manifest }, notes }
}

/**
 * Replay the SQL effects on the modelled tables, in order. A table is known only when nothing unmodelled
 * touched it. A DROP or CREATE ends an uncertainty about the rows; a persistent one (a trigger, routine,
 * view or other object over the table) stays for the rest of the dump, since dropping the table leaves it.
 */
export function replayTables(sources) {
  const state = {}
  for (const t of ['template_styles', 'languages', 'extensions', 'menu']) state[t] = { present: null, rows: [], uncertain: [], persistent: [], prefixes: new Set() }
  for (const src of sources) {
    for (const op of src.parsed.ops ?? []) {
      const s = state[op.table]
      if (op.prefix !== null) s.prefixes.add(op.prefix)
      const where = `${src.label}: ${op.table}`
      if (op.op === 'drop') Object.assign(s, { present: false, rows: [], uncertain: [] })
      else if (op.op === 'create') {
        if (!(op.ifNotExists && s.present)) Object.assign(s, { present: true, rows: [], uncertain: [] })
      } else if (op.op === 'truncate') s.rows = []
      else if (op.op === 'insert') {
        if (s.present === false) s.uncertain.push(`${where}: INSERT into a dropped table`)
        if (s.present === null) s.present = true
        const key = { template_styles: 'id', languages: 'lang_id', extensions: 'extension_id', menu: 'id' }[op.table]
        let repeated = 0
        for (const row of op.rows) {
          const i = row[key] == null ? -1 : s.rows.findIndex((r) => r[key] === row[key])
          if (i === -1) s.rows.push(row)
          else if (op.replace) s.rows[i] = row
          else repeated++
        }
        // which key repeats is a value of the dump: only the column and the count leave the replay
        if (repeated) s.uncertain.push(`${where}: INSERT of ${repeated} row(s) whose ${key} is already present (which row the server keeps is not decided)`)
      } else (op.persistent ? s.persistent : s.uncertain).push(`${where}: ${op.why}`)
    }
  }
  const out = {}
  for (const [t, s] of Object.entries(state)) {
    const gaps = [...s.persistent, ...s.uncertain]
    if (s.prefixes.size > 1) gaps.push(`${t}: rows under several table prefixes (${[...s.prefixes].sort().join(', ')}) — which site is meant is not decided here`)
    if (s.present !== true) gaps.push(`${t}: not created by the database source`)
    out[t] = gaps.length ? { known: false, gaps } : { known: true, rows: s.rows }
  }
  return out
}

const INSTALLER_ORDER = ['base.sql', 'extensions.sql', 'supports.sql']
const installerRank = (name) => {
  const i = INSTALLER_ORDER.indexOf(name)
  return i === -1 ? INSTALLER_ORDER.length : i
}

function clientName(v) {
  return v === '0' ? 'site' : v === '1' ? 'administrator' : v === '3' ? 'api' : v == null ? null : `client ${v}`
}

/** Extension manifests under one Joomla root: what files are present, not what is enabled. */
function extensionManifests(files) {
  const found = []
  const unreadable = []
  const primary = (kind, rel, element, fileBase) => {
    const x = files.get(rel)
    if (x.error) {
      if (fileBase === element || fileBase === element.replace(/^(com|mod)_/, '')) unreadable.push({ manifest: rel, error: x.error })
      return
    }
    if (!['extension', 'install'].includes(x.root) || x.attrs?.type !== kind) return
    return x
  }
  for (const rel of [...files.keys()].sort()) {
    let m
    let x
    let rec
    if ((m = /^administrator\/components\/(com_[^/]+)\/([^/]+)\.xml$/.exec(rel)) && (x = primary('component', rel, m[1], m[2])))
      rec = { type: 'component', element: m[1], folder: null, client: 'administrator' }
    else if ((m = /^(administrator\/)?modules\/(mod_[^/]+)\/([^/]+)\.xml$/.exec(rel)) && (x = primary('module', rel, m[2], m[3])))
      rec = { type: 'module', element: m[2], folder: null, client: m[1] ? 'administrator' : 'site' }
    else if ((m = /^plugins\/([^/]+)\/([^/]+)\/([^/]+)\.xml$/.exec(rel)) && (x = primary('plugin', rel, m[2], m[3])))
      rec = { type: 'plugin', element: m[2], folder: m[1], client: 'site' }
    else if ((m = /^administrator\/manifests\/(files|libraries|packages)\/([^/]+)\.xml$/.exec(rel))) {
      const type = { files: 'file', libraries: 'library', packages: 'package' }[m[1]]
      if ((x = primary(type, rel, m[2], m[2]))) rec = { type, element: m[2], folder: null, client: 'site' }
    } else if ((m = /^(administrator\/)?templates\/([^/]+)\/templateDetails\.xml$/.exec(rel)) && (x = primary('template', rel, m[2], m[2])))
      rec = { type: 'template', element: m[2], folder: null, client: m[1] ? 'administrator' : 'site' }
    if (!rec) continue
    found.push({
      ...rec,
      name: x.fields?.name ?? null,
      version: x.fields?.version ?? null,
      author: x.fields?.author ?? null,
      joomlaProject: x.fields?.author === 'Joomla! Project',
      manifest: rel
    })
  }
  return { found: found.sort(byKeys('type', 'folder', 'element', 'client', 'manifest')), unreadable }
}

function languagePacks(files) {
  const packs = new Map()
  for (const rel of [...files.keys()].sort()) {
    const m = /^(administrator\/|api\/)?language\/([^/]+)\/(langmetadata|install)\.xml$/.exec(rel)
    if (!m) continue
    const client = m[1] === 'administrator/' ? 'administrator' : m[1] === 'api/' ? 'api' : 'site'
    const key = `${client}|${m[2]}`
    const x = files.get(rel)
    const prior = packs.get(key)
    const rec = { client, tag: m[2], name: x.error ? null : (x.fields?.name ?? null), version: x.error ? null : (x.fields?.version ?? null), manifest: rel }
    if (x.error) rec.error = x.error
    // langmetadata.xml is the language's own metadata; install.xml the package manifest — the first wins
    if (!prior || (prior.error && !rec.error) || (m[3] === 'langmetadata' && !rec.error)) packs.set(key, rec)
  }
  return [...packs.values()].sort(byKeys('client', 'tag'))
}

/** Everything about one Joomla root. `db` is the chosen database source, or {missing|ambiguous}. */
function analyseSite({ container, root, db, embedded, identity }) {
  const files = new Map()
  const members = []
  const fileMembers = []
  for (const [p, kind] of container.members)
    if (p.startsWith(root)) {
      members.push(p.slice(root.length))
      if (kind === 'f') fileMembers.push(p.slice(root.length))
    }
  for (const [p, v] of Object.entries(container.files)) if (p.startsWith(root)) files.set(p.slice(root.length), v)
  const gaps = []
  const memberSet = new Set(members)

  // Joomla version: the files manifest, cross-checked with Version.php's constants
  const jx = files.get('administrator/manifests/files/joomla.xml')
  const vphp = files.get('libraries/src/Version.php')
  const fromManifest = jx && !jx.error ? (jx.fields?.version ?? null) : null
  let fromPhp = null
  if (vphp?.consts?.MAJOR_VERSION?.length === 1 && vphp.consts.MINOR_VERSION?.length === 1 && vphp.consts.PATCH_VERSION?.length === 1) {
    const extra = vphp.consts.EXTRA_VERSION?.[0]
    fromPhp = `${vphp.consts.MAJOR_VERSION[0]}.${vphp.consts.MINOR_VERSION[0]}.${vphp.consts.PATCH_VERSION[0]}${extra ? '-' + extra : ''}`
  }
  const joomla = {
    version: fromManifest ?? null,
    sources: [
      fromManifest !== null && { path: 'administrator/manifests/files/joomla.xml', value: fromManifest },
      fromPhp !== null && { path: 'libraries/src/Version.php', value: fromPhp }
    ].filter(Boolean)
  }
  if (jx?.error) gaps.push(`Joomla version: administrator/manifests/files/joomla.xml unreadable (${jx.error})`)
  else if (fromManifest === null) gaps.push('Joomla version: administrator/manifests/files/joomla.xml has no <version>')
  if (fromManifest !== null && fromPhp !== null && fromManifest !== fromPhp) {
    gaps.push(`Joomla version: joomla.xml says ${fromManifest}, Version.php says ${fromPhp}`)
    joomla.version = null
  }

  // PHP: the JOOMLA_MINIMUM_PHP each entry point defines
  const phpSources = []
  for (const rel of ['index.php', 'administrator/index.php', 'api/index.php', 'installation/index.php']) {
    const vals = files.get(rel)?.defines?.JOOMLA_MINIMUM_PHP ?? []
    for (const value of vals) phpSources.push({ path: rel, value })
  }
  const phpValues = [...new Set(phpSources.map((s) => s.value))]
  const php = { minimum: phpValues.length === 1 ? phpValues[0] : null, sources: phpSources }
  if (!phpValues.length) gaps.push('PHP: no JOOMLA_MINIMUM_PHP declaration in index.php, administrator/index.php, api/index.php or installation/index.php')
  if (phpValues.length > 1) gaps.push(`PHP: entry points declare different minimums (${phpValues.join(', ')})`)

  // system plugins of the known frameworks
  const plugins = []
  for (const el of ['t4', 't3', 'helix3', 'helixultimate']) {
    const rel = `plugins/system/${el}/${el}.xml`
    if (!memberSet.has(`plugins/system/${el}`)) continue
    const x = files.get(rel)
    plugins.push({ element: el, version: x && !x.error ? (x.fields?.version ?? null) : null, manifest: x ? rel : null })
    if (!x) gaps.push(`framework plugin plugins/system/${el}: no ${el}.xml — version unknown`)
  }

  // templates
  const templates = []
  for (const rel of [...files.keys()].sort()) {
    const m = /^(administrator\/)?templates\/([^/]+)\/templateDetails\.xml$/.exec(rel)
    if (!m) continue
    const x = files.get(rel)
    const client = x.attrs?.client ?? (m[1] ? 'administrator' : 'site')
    const rec = { dir: m[2], client: m[1] ? 'administrator' : client === 'administrator' ? 'administrator' : 'site', name: x.error ? null : (x.fields?.name ?? null), version: x.error ? null : (x.fields?.version ?? null), manifest: rel }
    if (rec.client === 'site' && !m[1]) Object.assign(rec, classifyTemplate(m[2], x, members, plugins))
    if (x.error) gaps.push(`template ${m[2]}: ${rel} unreadable (${x.error})`)
    templates.push(rec)
  }
  // a site template directory without a manifest is still a template the files show
  for (const p of members) {
    const m = /^templates\/([^/]+)$/.exec(p)
    if (m && !files.has(`templates/${m[1]}/templateDetails.xml`) && m[1] !== 'system' && !/\./.test(m[1]) && members.some((q) => q.startsWith(`templates/${m[1]}/`) && q.endsWith('/index.php')))
      templates.push({ dir: m[1], client: 'site', name: null, version: null, manifest: null, ...classifyTemplate(m[1], null, members, plugins) })
  }
  templates.sort(byKeys('client', 'dir'))
  for (const t of templates) {
    if (t.framework === 'conflict') gaps.push(`template ${t.dir}: framework markers of ${[...new Set(t.evidence.map((e) => e.framework))].sort().join(' and ')} — framework not decided`)
    else if (t.framework === 'unknown') gaps.push(`template ${t.dir}: framework unknown (${t.notes.join('; ') || 'no readable manifest'})`)
  }

  // database: the installer SQL set replayed in the installer's order, or one dump
  let tables = null
  const database = { kind: db.kind, sources: db.sources?.map((s) => s.label) ?? [] }
  // per source: how many statements were modelled, and which were not (kind, verb, reason — no values)
  if (db.sources) database.statements = db.sources.map((s) => ({ source: s.label, ...(s.parsed.statements ?? {}) }))
  if (db.kind === 'none') gaps.push('database: no installer SQL and no dump in the quickstart — styles, content languages and enabled state unknown')
  else if (db.kind === 'ambiguous') gaps.push(`database: several candidates (${db.candidates.join(', ')}) — none chosen; styles, content languages and enabled state unknown`)
  else tables = replayTables(db.sources)

  const styles = tables?.template_styles.known
    ? tables.template_styles.rows
        .map((r) => ({ id: r.id ?? null, template: r.template ?? null, client: clientName(r.client_id), home: r.home ?? null, title: r.title ?? null, inheritable: r.inheritable ?? null, parent: r.parent ?? null, ...(Object.keys(r.typelist ?? {}).length ? { typelist: r.typelist } : {}) }))
        .sort((a, b) => numericId(a.id) - numericId(b.id) || cmp(String(a.id), String(b.id)))
    : null
  if (tables && !tables.template_styles.known) gaps.push(...tables.template_styles.gaps.map((g) => `template styles: ${g}`))
  // menu rows: only for the source-font check (which template style each page renders with); its gaps stay in that report
  const menu = tables?.menu.known ? tables.menu.rows : null
  const menuGaps = tables && !tables.menu.known ? tables.menu.gaps.map((g) => `menu items: ${g}`) : []
  const contentLanguages = tables?.languages.known
    ? tables.languages.rows
        .map((r) => ({ langCode: r.lang_code ?? null, title: r.title ?? null, titleNative: r.title_native ?? null, sef: r.sef ?? null, published: r.published ?? null }))
        .sort(byKeys('langCode', 'sef'))
    : null
  if (tables && !tables.languages.known) gaps.push(...tables.languages.gaps.map((g) => `content languages: ${g}`))
  const dbExt = tables?.extensions.known ? tables.extensions.rows : null
  if (tables && !tables.extensions.known) gaps.push(...tables.extensions.gaps.map((g) => `extension state: ${g}`))

  // extensions: manifests present, joined with the database rows when those are known
  const { found, unreadable } = extensionManifests(files)
  for (const u of unreadable) gaps.push(`extension manifest ${u.manifest} unreadable (${u.error})`)
  const clientId = { site: '0', administrator: '1' }
  const matched = new Set()
  const present = found.map((e) => {
    if (!dbExt) return { ...e, registered: null, enabled: null, registeredVersion: null }
    const i = dbExt.findIndex(
      (r, j) =>
        !matched.has(j) &&
        r.type === e.type &&
        r.element === e.element &&
        (e.type !== 'plugin' || r.folder === e.folder) &&
        (!['module', 'template'].includes(e.type) || r.client_id === clientId[e.client])
    )
    if (i === -1) return { ...e, registered: false, enabled: null, registeredVersion: null }
    matched.add(i)
    return { ...e, registered: true, enabled: dbExt[i].enabled === '1', registeredVersion: dbExt[i].manifestVersion ?? null }
  })
  for (const e of present) if (e.version === null) gaps.push(`extension ${e.type} ${e.folder ? e.folder + '/' : ''}${e.element}: manifest has no <version>`)
  const registeredWithoutManifest = dbExt
    ? dbExt
        .filter((r, j) => !matched.has(j) && r.type !== 'language')
        .map((r) => ({ type: r.type ?? null, element: r.element ?? null, folder: r.folder || null, client: clientName(r.client_id), enabled: r.enabled === '1' }))
        .sort(byKeys('type', 'folder', 'element', 'client'))
    : null
  for (const r of registeredWithoutManifest ?? [])
    gaps.push(`extension ${r.type} ${r.folder ? r.folder + '/' : ''}${r.element}: registered (${r.enabled ? 'enabled' : 'disabled'}) with no manifest in the files — version unknown`)

  // the site's framework is that of the default site style's template
  const siteTemplates = templates.filter((t) => t.client === 'site' && t.framework)
  let siteFramework
  const homes = styles?.filter((s) => s.client === 'site' && s.home === '1') ?? []
  if (homes.length === 1) {
    const t = siteTemplates.find((x) => x.dir === homes[0].template)
    siteFramework = t
      ? { framework: t.framework, template: t.dir, basis: `default site style #${homes[0].id} (${homes[0].title}) uses templates/${t.dir}` }
      : { framework: 'unknown', template: homes[0].template, basis: `default site style #${homes[0].id} names template ${homes[0].template}, which is not in the files` }
    if (!t || !(FRAMEWORKS.includes(t.framework) || t.framework === 'other')) gaps.push(`site framework: ${siteFramework.basis}${t ? ` — ${t.framework}` : ''}`)
  } else {
    const framed = siteTemplates.filter((t) => FRAMEWORKS.includes(t.framework) || t.framework === 'conflict')
    const kinds = [...new Set(framed.map((t) => t.framework))]
    const why = styles ? `${homes.length} default site styles` : 'template styles unknown'
    siteFramework =
      kinds.length === 1 && framed.length === 1
        ? { framework: kinds[0], template: framed[0].dir, basis: `${why}; templates/${framed[0].dir} is the only site template with framework markers` }
        : { framework: 'unknown', template: null, basis: `${why}; ${framed.length} site templates with framework markers` }
    gaps.push(`site framework: ${siteFramework.basis}`)
  }

  // the framework plugin of the site's template: its version is part of what the site runs on
  const ft = templates.find((t) => t.client === 'site' && t.dir === siteFramework.template)
  if (ft && FRAMEWORK_PLUGINS[ft.framework]?.length && !ft.plugin)
    gaps.push(`framework plugin: templates/${ft.dir} is ${ft.framework}, but no plugins/system/${FRAMEWORK_PLUGINS[ft.framework].join(' or plugins/system/')} is shipped — plugin version unknown`)

  const installedLanguages = languagePacks(files)
  for (const l of installedLanguages) {
    if (l.error) gaps.push(`language ${l.client} ${l.tag}: ${l.manifest} unreadable (${l.error})`)
    else if (l.version === null) gaps.push(`language ${l.client} ${l.tag}: ${l.manifest} has no <version>`)
  }

  // the source's own typography, judged from its files (source-font.mjs); not an unknown of the inventory
  const googleText = files.get(GOOGLE_LIST)
  const sourceFonts = analyzeStatic({
    templates: templates.filter((t) => t.client === 'site').map((t) => ({ dir: t.dir, framework: t.framework })),
    styles,
    menu,
    reader: archiveReader(files, fileMembers),
    googleListText: googleText?.kind === 'text' && googleText.text !== undefined ? googleText.text : null,
    gaps: menuGaps,
    identity
  })

  const installer = memberSet.has('installation') && [...files.keys()].some((k) => /^installation\/sql\/mysql\/[^/]+\.sql$/.test(k))
  return {
    root: root || '.',
    installer,
    joomla,
    php,
    database,
    frameworkPlugins: plugins,
    siteFramework,
    templates,
    extensions: { present, registeredWithoutManifest },
    templateStyles: styles,
    sourceFonts,
    languages: { installed: installedLanguages, content: contentLanguages },
    embeddedArchives: embedded,
    gaps
  }
}

/** One quickstart from its scanned assets. */
export function analyseQuickstart(group, scanned) {
  const gaps = []
  const containers = []
  for (const a of scanned) {
    for (const c of a.scan.containers) {
      const members = c.members.map(([p, kind, size]) => [p, kind, size])
      containers.push({ asset: a, id: c.id, parent: c.parent, path: c.path, format: c.format, members, files: c.files })
    }
  }
  const keyOf = (c) => `${c.asset.rel}#${c.id}`
  const byKey = new Map(containers.map((c) => [keyOf(c), c]))
  const parentOf = (c) => (c.parent === null ? null : byKey.get(`${c.asset.rel}#${c.parent}`))
  const label = (c, p) => (c.path ? `${c.asset.rel}!${c.path}!${p}` : `${c.asset.rel}!${p}`)
  const rootsOf = new Map(containers.map((c) => [keyOf(c), joomlaRoots(c)]))
  // the member path of a nested container inside its parent (a container's path is its whole chain)
  const memberIn = (c) => {
    const p = parentOf(c)
    return p.path === null ? c.path : c.path.slice(p.path.length + 1)
  }
  // the sites whose Joomla tree holds a nested archive: an ancestor with a root counts only when the
  // archive's member path lies below that root — an extension ZIP left in a webroot is embedded, a
  // quickstart ZIP beside a site directory is a second site
  const hostsOf = (c) => {
    const hosts = []
    for (let q = c, p = parentOf(c); p; q = p, p = parentOf(p)) {
      const m = memberIn(q)
      for (const root of rootsOf.get(keyOf(p))) if (m.startsWith(root)) hosts.push({ container: p, root })
    }
    return hosts
  }
  const underSite = (c) => hostsOf(c).length > 0
  const siteContainers = containers.filter((c) => rootsOf.get(keyOf(c)).length && !underSite(c))

  // database candidates: dumps outside the Joomla tree anywhere in the quickstart (not under a site's own nested archives)
  const dumps = []
  for (const c of containers) {
    if (underSite(c) && !rootsOf.get(keyOf(c)).length) continue
    for (const [p, v] of Object.entries(c.files)) {
      if (v.kind !== 'sql' || /(^|\/)installation\/sql\/mysql\/[^/]+\.sql$/i.test(p)) continue
      dumps.push({ label: label(c, p), parsed: v, container: c })
    }
  }
  dumps.sort(byKeys('label'))

  const sites = []
  for (const c of siteContainers) {
    for (const root of rootsOf.get(keyOf(c))) {
      const installerSql = Object.entries(c.files)
        .filter(([p, v]) => v.kind === 'sql' && p.startsWith(root) && /^installation\/sql\/mysql\/[^/]+\.sql$/i.test(p.slice(root.length)))
        .map(([p, v]) => ({ label: label(c, p), parsed: v, name: path.posix.basename(p) }))
        .sort((a, b) => installerRank(a.name) - installerRank(b.name) || cmp(a.name, b.name))
      let db
      if (installerSql.length && dumps.length) db = { kind: 'ambiguous', candidates: ['installation/sql/mysql/*', ...dumps.map((d) => d.label)] }
      else if (installerSql.length) db = { kind: 'installer-sql', sources: installerSql }
      else if (dumps.length === 1) db = { kind: 'dump', sources: dumps }
      else if (dumps.length > 1) db = { kind: 'ambiguous', candidates: dumps.map((d) => d.label) }
      else db = { kind: 'none' }
      const embedded = containers
        .filter((x) => x.asset === c.asset && hostsOf(x).some((h) => h.container === c && h.root === root))
        .map((x) => ({ path: x.path, format: x.format }))
        .sort(byKeys('path'))
      const site = analyseSite({ container: c, root, db, embedded, identity: `${scanned.map((a) => a.sha256).sort().join(',')}#${root}` })
      site.asset = c.asset.rel
      site.nested = c.parent !== null ? c.path : null
      site.format = c.parent !== null ? 'bundle' : site.installer ? 'installer' : db.kind === 'dump' ? 'runtime-webroot-db' : 'runtime-webroot'
      sites.push(site)
    }
  }
  sites.sort(byKeys('asset', 'nested', 'root'))

  let format
  if (!sites.length) {
    format = 'unknown'
    gaps.push('no Joomla root (administrator/manifests/files/joomla.xml) in any asset or nested archive')
  } else if (sites.length > 1) {
    format = 'ambiguous'
    gaps.push(`${sites.length} Joomla roots (${sites.map((s) => `${s.asset}${s.nested ? '!' + s.nested : ''}:${s.root}`).join(', ')}) — which one is the quickstart is not decided here`)
  } else format = sites[0].format
  const inner = sites.length === 1 && sites[0].nested ? (sites[0].installer ? 'installer' : sites[0].database.kind === 'dump' ? 'runtime-webroot-db' : 'runtime-webroot') : null

  const roleOf = (a) => {
    const top = containers.find((c) => c.asset === a && c.parent === null)
    if (sites.some((s) => s.asset === a.rel && !s.nested)) return sites.find((s) => s.asset === a.rel).installer ? 'installer' : 'webroot'
    if (sites.some((s) => s.asset === a.rel)) return 'bundle'
    if (top && ['sql', 'sql.gz'].includes(top.format)) return 'database'
    if (dumps.some((d) => d.container.asset === a)) return 'database'
    return 'other'
  }
  const assets = scanned
    .map((a) => ({ name: a.name, path: a.rel, size: a.size, sha256: a.sha256, container: a.scan.format, role: roleOf(a), members: a.scan.stats.members }))
    .sort(byKeys('path'))
  const site = sites.length === 1 ? sites[0] : null
  const framework = site ? site.siteFramework.framework : 'unknown'
  for (const s of sites) gaps.push(...s.gaps.map((g) => (sites.length > 1 ? `${s.asset}:${s.root}: ${g}` : g)))
  return {
    id: group.id,
    tag: group.tag ?? null,
    assets,
    otherReleaseAssets: group.otherReleaseAssets ?? [],
    format,
    innerFormat: inner,
    joomla: site?.joomla.version ?? null,
    phpMinimum: site?.php.minimum ?? null,
    framework,
    frameworkTemplate: site?.siteFramework.template ?? null,
    sites: sites.map(({ gaps: _g, ...s }) => s),
    unknowns: [...new Set(gaps)].sort()
  }
}

// ---------------------------------------------------------------- reports
/** Text for a Markdown table cell or line: HTML-escaped, Markdown punctuation escaped, one line. */
export function md(value) {
  if (value === null || value === undefined) return '—'
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]|#!])/g, '\\$1')
    .replace(/[\r\n\t]+/g, ' ')
}

export function renderMarkdown(inv) {
  const L = []
  L.push('# Quickstart inventory', '')
  L.push(`Schema \`${inv.schema}\` · ${inv.quickstarts.length} quickstart(s) · source: ${md(inv.source.kind)}${inv.source.repo ? ` (${md(inv.source.repo)})` : ''}${inv.source.input ? ` ${md(inv.source.input)}${inv.source.inputResolved && inv.source.inputResolved !== inv.source.input ? ` (resolved: ${md(inv.source.inputResolved)})` : ''}` : ''}`, '')
  L.push('| quickstart | tag | format | Joomla | PHP min | framework (default template) | assets |')
  L.push('|---|---|---|---|---|---|---|')
  for (const q of inv.quickstarts) {
    const tag = q.tag ? `${md(q.tag.value)} (${md(q.tag.source)})` : '—'
    const fmt = q.innerFormat ? `${q.format} → ${q.innerFormat}` : q.format
    L.push(`| ${md(q.id)} | ${tag} | ${md(fmt)} | ${md(q.joomla)} | ${md(q.phpMinimum)} | ${md(q.framework)}${q.frameworkTemplate ? ` (${md(q.frameworkTemplate)})` : ''} | ${q.assets.map((a) => `${md(a.path)} \`${a.sha256.slice(0, 12)}\``).join('<br>')} |`)
  }
  for (const q of inv.quickstarts) {
    L.push('', `## ${md(q.id)}`, '')
    for (const s of q.sites) {
      L.push(`- Framework: **${md(s.siteFramework.framework)}** — ${md(s.siteFramework.basis)}`)
      for (const t of s.templates.filter((x) => x.client === 'site')) {
        const ev = t.evidence?.length ? t.evidence.map((e) => `${md(e.path)} (${md(e.detail)})`).join('; ') : 'no framework marker'
        const plugin = t.plugin ? `; plugin ${md(t.plugin.element)} ${md(t.plugin.version)}` : ''
        L.push(`  - templates/${md(t.dir)} ${md(t.version)}: ${md(t.framework)} — ${ev}${plugin}`)
      }
      const third = s.extensions.present.filter((e) => !e.joomlaProject && e.type !== 'template')
      L.push(`- Extensions: ${s.extensions.present.length} manifests (${third.length} not by the Joomla! Project)`)
      for (const e of third) {
        const state = e.enabled === null ? 'state unknown' : e.registered ? (e.enabled ? 'enabled' : 'disabled') : 'not registered'
        L.push(`  - ${md(e.type)} ${e.folder ? md(e.folder) + '/' : ''}${md(e.element)} ${md(e.version)} (${state})`)
      }
      const unregistered = s.extensions.present.filter((e) => e.registered === false)
      if (unregistered.length) L.push(`- Manifests with no database row (files present, not installed): ${unregistered.map((e) => `${md(e.type)} ${e.folder ? md(e.folder) + '/' : ''}${md(e.element)}`).join(', ')}`)
      if (s.embeddedArchives.length) L.push(`- Embedded archives inside the site (not read as sites): ${s.embeddedArchives.map((e) => md(e.path)).join(', ')}`)
      const styles = s.templateStyles
      L.push(`- Template styles: ${styles ? styles.filter((x) => x.client === 'site').map((x) => `#${md(x.id)} ${md(x.title)} [${md(x.template)}]${x.home === '1' ? ' (default)' : ''}`).join('; ') || 'none' : 'unknown'}`)
      const sf = s.sourceFonts
      if (sf) {
        L.push(`- Source fonts: ${sf.findings.length ? `**${sf.findings.length} source-font finding(s)**` : 'no finding'}${sf.complete ? '' : ` — evidence incomplete (${md(sf.gaps.slice(0, 3).join('; '))})`}`)
        for (const st of sf.styles.filter((x) => x.used && x.roles)) {
          const prof = st.profiles ? ` site \`${md(st.profiles.site.resolved)}\` theme \`${md(st.profiles.theme.resolved)}\`` : ''
          L.push(`  - style #${md(st.id)} ${md(st.title)} [${md(st.template)} ${md(st.framework)}]${prof}: ${st.roles.map((r) => `${md(r.role)} ${r.family ? `"${md(r.family)}"` : '∅'} → ${md(r.verdict)}`).join('; ')}`)
        }
        for (const f of sf.findings) L.push(`  - FINDING ${md(f.key)}: ${md(f.message)}`)
      }
      for (const st of s.database.statements ?? [])
        L.push(`- Database ${md(st.source)}: ${st.statements} statement(s) — ${st.modelled} modelled, ${st.noEffect} change no modelled table, ${st.unsupported} unsupported, ${st.unrecognised} of a kind not modelled${st.reasons?.length ? ` (${st.reasons.map((x) => `${md(x.why)} ×${x.count}`).join('; ')}${st.reasonsOmitted ? `; ${st.reasonsOmitted} more` : ''})` : ''}`)
      const langs = s.languages.content
      L.push(`- Languages: installed ${s.languages.installed.map((l) => `${md(l.tag)} (${l.client})`).join(', ') || 'none'}; content ${langs ? langs.map((l) => md(l.langCode)).join(', ') || 'none' : 'unknown'}`)
    }
    if (q.unknowns.length) {
      L.push('- Unknowns:')
      for (const u of q.unknowns) L.push(`  - ${md(u)}`)
    } else L.push('- Unknowns: none')
  }
  return L.join('\n') + '\n'
}

// ---------------------------------------------------------------- tool identity + images
/**
 * Which version of the tool produced a baseline. `identity` is a commit when every implementation file
 * is byte-identical to its blob at HEAD; before the tool is committed it is the staged tree (`git
 * write-tree`) when every file is byte-identical to its staged blob — a reviewable, reproducible
 * version that is not a published commit, with HEAD kept as context. A file that differs from the
 * index (unstaged drift) leaves no identity: the baseline would name a working tree.
 */
function toolIdentity({ root = SKILL_ROOT, spawn } = {}) {
  const files = IMPLEMENTATION_FILES.map((rel) => ({ path: rel, sha256: sha256Text(readFileSync(path.join(root, rel))) }))
  const git = (args) => {
    try {
      const r = (spawn ?? spawnSync)('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30000 })
      return r.status === 0 ? r.stdout.trim() : null
    } catch {
      return null
    }
  }
  const head = git(['rev-parse', '--verify', '-q', 'HEAD^{commit}'])
  const prefix = git(['rev-parse', '--show-prefix'])
  const status = git(['status', '--porcelain'])
  for (const f of files) {
    const now = git(['hash-object', path.join(root, f.path)])
    const atHead = head && prefix !== null ? git(['rev-parse', '-q', '--verify', `${head}:${prefix}${f.path}`]) : null
    const staged = prefix !== null ? git(['rev-parse', '-q', '--verify', `:${prefix}${f.path}`]) : null
    f.blob = now
    f.state = now === null ? 'unknown' : now === atHead ? 'committed' : now === staged ? 'staged' : 'unstaged'
  }
  let identity
  if (files.every((f) => f.state === 'committed')) identity = { kind: 'commit', commit: head }
  else if (files.every((f) => f.state === 'committed' || f.state === 'staged')) {
    const tree = git(['write-tree'])
    identity = tree ? { kind: 'staged-tree', tree, baseCommit: head } : { kind: 'none', why: 'git write-tree failed (unresolved index entries?)' }
  } else {
    const bad = files.filter((f) => !['committed', 'staged'].includes(f.state)).map((f) => `${f.path} (${f.state})`)
    identity = { kind: 'none', why: `${bad.join(', ')} not in the index as written` }
  }
  return { identity, gitHead: head, dirty: status === null ? null : status.length > 0, implementationFiles: files, node: process.version }
}

/** SHA-256 of `rel` as held by `treeish` (a commit or a tree) in the local repository; null when it is not there. */
function committedSha256(treeish, rel, { root = SKILL_ROOT, spawn = spawnSync } = {}) {
  try {
    const prefix = spawn('git', ['-C', root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', timeout: 30000 })
    if (prefix.status !== 0) return null
    const r = spawn('git', ['-C', root, 'cat-file', 'blob', `${treeish}:${prefix.stdout.trim()}${rel}`], { timeout: 30000, maxBuffer: 64 << 20 })
    return r.status === 0 ? sha256Text(r.stdout) : null
  } catch {
    return null
  }
}

/** The object type git gives `oid` here ('commit', 'tree' …), or null. */
function objectType(oid, { root = SKILL_ROOT, spawn = spawnSync } = {}) {
  try {
    const r = spawn('git', ['-C', root, 'cat-file', '-t', oid], { encoding: 'utf8', timeout: 30000 })
    return r.status === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
}

/** An image's immutable identity: given as name@sha256:…, or read from the local docker image's RepoDigests. */
function resolveImage(ref, { deadline, spawn } = {}) {
  if (IMAGE_PIN_RE.test(ref)) return { ref, digest: ref.slice(ref.indexOf('@') + 1), repoDigest: ref.replace(/:[^:@/]+@/, '@'), source: 'declared' }
  let r
  try {
    r = runCommand('docker', ['image', 'inspect', ref], { deadline, what: `image ${ref}`, spawn })
  } catch (e) {
    return { ref, digest: null, source: 'unresolved', why: e.message }
  }
  if (r.status !== 0) return { ref, digest: null, source: 'unresolved', why: `docker image inspect exited ${r.status}: ${lastLine(r.stderr)}` }
  let info
  try {
    info = JSON.parse(r.stdout)?.[0]
  } catch {
    return { ref, digest: null, source: 'unresolved', why: 'docker image inspect answered something that is not JSON' }
  }
  const repo = ref.replace(/@.*$/, '').replace(/:[^/:]+$/, '')
  const names = [repo, `docker.io/${repo}`, `docker.io/library/${repo}`]
  const rd = (info?.RepoDigests ?? []).filter((d) => typeof d === 'string' && names.includes(d.slice(0, d.indexOf('@')))).sort()
  const bad = rd.filter((d) => !IMAGE_DIGEST_RE.test(d.slice(d.indexOf('@') + 1)))
  if (bad.length) return { ref, digest: null, imageId: info?.Id ?? null, source: 'unresolved', why: `docker gave a repository digest that is not sha256:<64 hex> (${bad.join(', ')})` }
  if (rd.length !== 1) return { ref, digest: null, imageId: info?.Id ?? null, source: 'unresolved', why: rd.length ? `several repository digests (${rd.join(', ')})` : 'the local image has no repository digest (built locally, or never pulled)' }
  return { ref, digest: rd[0].slice(rd[0].indexOf('@') + 1), repoDigest: rd[0], imageId: info.Id ?? null, source: 'docker image inspect' }
}

/** What a baseline freezes of one inventory entry: generation writes it, verification recomputes it from the inventory. */
function baselineQuickstart(q) {
  return {
    id: q.id,
    tag: q.tag,
    assets: q.assets.map((a) => ({ name: a.name, path: a.path, size: a.size, sha256: a.sha256 })),
    format: q.format,
    joomla: q.joomla,
    phpMinimum: q.phpMinimum,
    framework: q.framework,
    frameworkTemplate: q.frameworkTemplate
  }
}

export function buildBaseline({ inventory, pair, images, tool, inventorySha256, createdAt }) {
  const quickstarts = pair.map((id) => baselineQuickstart(inventory.quickstarts.find((x) => x.id === id)))
  const doc = { schema: BASELINE_SCHEMA, createdAt, pair, quickstarts, runtimeImages: images, tool, inventorySha256 }
  const gaps = baselineGaps(doc)
  return { ...doc, complete: gaps.length === 0, gaps }
}

const OID_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/
const BASELINE_FORMATS = ['installer', 'runtime-webroot-db', 'runtime-webroot', 'bundle']
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isRecords = (v) => Array.isArray(v) && v.every(isRecord)

/**
 * The containers the baseline rules walk, each of the type they expect. A document that fails this is
 * not read further: its gaps are these, named, never a TypeError halfway through the rules.
 */
function baselineShapeGaps(b) {
  if (!isRecord(b)) return ['baseline: not a JSON object']
  const gaps = []
  if (!Array.isArray(b.pair) || !b.pair.every((x) => typeof x === 'string')) gaps.push('pair: not a list of quickstart ids')
  if (!isRecords(b.quickstarts)) gaps.push('quickstarts: not a list of objects')
  else
    b.quickstarts.forEach((q, i) => {
      const at = typeof q.id === 'string' && ID_RE.test(q.id) ? q.id : `quickstarts[${i}]`
      if (at !== q.id) gaps.push(`${at}: id is not a plain name`)
      if (q.tag !== undefined && !isRecord(q.tag)) gaps.push(`${at}: tag is not an object`)
      else if (q.tag?.bindings !== undefined && !isRecords(q.tag.bindings)) gaps.push(`${at}: tag bindings are not a list of objects`)
      if (!isRecords(q.assets)) gaps.push(`${at}: assets are not a list of objects`)
    })
  if (!isRecords(b.runtimeImages)) gaps.push('runtimeImages: not a list of objects')
  if (!isRecord(b.tool)) gaps.push('tool: not an object')
  else {
    if (b.tool.implementationFiles !== undefined && !isRecords(b.tool.implementationFiles)) gaps.push('tool: implementation files are not a list of objects')
    if (b.tool.identity !== undefined && !isRecord(b.tool.identity)) gaps.push('tool: identity is not an object')
  }
  if (b.gaps !== undefined && !(Array.isArray(b.gaps) && b.gaps.every((g) => typeof g === 'string'))) gaps.push('gaps: not a list of strings')
  return gaps
}

/**
 * What keeps a baseline document from freezing its inputs: the one rule generation and strict
 * verification share, read from the document alone. Verification then re-measures what the document
 * names (source bytes, git objects, tool files).
 */
export function baselineGaps(b) {
  const shape = baselineShapeGaps(b)
  if (shape.length) return shape
  const gaps = []
  const pair = b.pair
  if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) gaps.push('pair: must be two different quickstart ids')
  const qs = Array.isArray(b.quickstarts) ? b.quickstarts : []
  if (qs.length !== 2 || !Array.isArray(pair) || qs.map((q) => q?.id).join(',') !== pair.join(',')) gaps.push('quickstarts: must be exactly the pair, in order')
  const tags = new Set()
  for (const q of qs) {
    const t = q?.tag
    if (t && typeof t.value === 'string') {
      if (tags.has(t.value)) gaps.push(`${q.id}: tag ${t.value} is bound to both quickstarts`)
      tags.add(t.value)
    }
    gaps.push(...bindingGaps(q))
    if (!FRAMEWORKS.includes(q.framework)) gaps.push(`${q.id}: framework ${q.framework}`)
    if (!BASELINE_FORMATS.includes(q.format)) gaps.push(`${q.id}: format ${q.format}`)
    if (!Array.isArray(q.assets) || !q.assets.length) gaps.push(`${q.id}: no source asset`)
    for (const a of q.assets ?? []) {
      if (!assetPathOk(a.path)) gaps.push(`${q.id}: asset path ${JSON.stringify(a.path)} is not relative to --input (<archive> or <sub-directory>/<archive>, plain names)`)
      else if (!SHA_RE.test(a.sha256 ?? '') || !Number.isInteger(a.size)) gaps.push(`${q.id}: asset ${a.path} carries no SHA-256 and size`)
    }
  }
  const images = Array.isArray(b.runtimeImages) ? b.runtimeImages : []
  if (typeof b.inventorySha256 !== 'string' || !SHA_RE.test(b.inventorySha256)) gaps.push('inventorySha256: the inventory the baseline was made from is not hashed')
  if (!images.length) gaps.push('no runtime image: give --image <ref> for each image the measured ports run on')
  for (const img of images) gaps.push(...imageGaps(img))
  const tool = b.tool ?? {}
  const files = tool.implementationFiles
  if (!Array.isArray(files) || files.length !== IMPLEMENTATION_FILES.length) gaps.push('tool: implementation files not recorded')
  else
    for (const rel of IMPLEMENTATION_FILES) {
      const f = files.find((x) => x?.path === rel)
      if (!f) gaps.push(`tool: ${rel} not recorded`)
      else if (!SHA_RE.test(f.sha256 ?? '')) gaps.push(`tool file ${rel}: not hashed`)
    }
  const id = tool.identity
  const head = typeof tool.gitHead === 'string' && OID_RE.test(tool.gitHead) ? tool.gitHead : null
  if (!head) gaps.push('tool commit: git HEAD could not be read')
  if (!id) gaps.push('tool version: not recorded')
  else if (id.kind === 'commit') {
    if (typeof id.commit !== 'string' || !OID_RE.test(id.commit)) gaps.push('tool: commit identity carries no object id')
    else if (head && id.commit !== head) gaps.push(`tool: commit ${id.commit} is not the recorded HEAD ${head}`)
  } else if (id.kind === 'staged-tree') {
    if (typeof id.tree !== 'string' || !OID_RE.test(id.tree)) gaps.push('tool: staged-tree identity carries no object id')
    if (typeof id.baseCommit !== 'string' || !OID_RE.test(id.baseCommit)) gaps.push('tool: staged-tree identity carries no base commit')
    else if (head && id.baseCommit !== head) gaps.push(`tool: staged tree base ${id.baseCommit} is not the recorded HEAD ${head}`)
  } else gaps.push(`tool version: ${id.why ?? `identity of kind ${JSON.stringify(id.kind)}`} — commit or stage the tool files and regenerate`)
  return gaps
}

/** The repository an image reference or repository digest names, without tag, digest or the default registry. */
function imageRepo(ref) {
  return ref.replace(/@.*$/, '').replace(/:[^/:]+$/, '').replace(/^docker\.io\//, '').replace(/^library\//, '')
}

/** What keeps a runtime image from being an immutable identity: part of the rule generation and strict verification share. */
function imageGaps(img) {
  if (!img || typeof img.ref !== 'string' || !img.ref) return ['runtime image: no reference recorded']
  if (typeof img.digest !== 'string' || !IMAGE_DIGEST_RE.test(img.digest)) return [`runtime image ${img.ref}: no immutable sha256 digest${img.why ? ` (${img.why})` : ''}`]
  if (typeof img.repoDigest !== 'string' || !img.repoDigest.endsWith('@' + img.digest)) return [`runtime image ${img.ref}: repository digest does not carry the digest`]
  if (imageRepo(img.repoDigest) !== imageRepo(img.ref)) return [`runtime image ${img.ref}: repository digest ${img.repoDigest} names another repository`]
  if (img.ref.includes('@') && img.ref.slice(img.ref.indexOf('@') + 1) !== img.digest) return [`runtime image ${img.ref}: pinned digest differs from the recorded ${img.digest}`]
  return []
}

/**
 * What keeps a quickstart's tag from binding its assets: the one rule generation and strict
 * verification share. A binding counts only with the release's own SHA-256, equal to the asset's
 * measured one; every asset needs one.
 */
function bindingGaps(q) {
  const t = q.tag
  if (!t || typeof t.value !== 'string' || !TAG_RE.test(t.value)) return [`${q.id}: no tag — give --tag ${q.id}=<tag> --verify-tags, or inventory it with --release`]
  if (!['release-digest', 'release'].includes(t.source)) return [`${q.id}: tag ${t.value} is ${t.source}, not checked against the release digests (--verify-tags)`]
  const gaps = []
  const bindings = Array.isArray(t.bindings) ? t.bindings : []
  if (!bindings.length) gaps.push(`${q.id}: tag ${t.value} has no asset binding`)
  for (const b of bindings) {
    const a = (q.assets ?? []).find((x) => x.path === b?.asset)
    if (!SHA_RE.test(b?.sha256 ?? '')) gaps.push(`${q.id}: release ${t.value} gives no SHA-256 for ${b?.releaseAsset} — ${b?.asset} is bound by name and size only`)
    else if (!a) gaps.push(`${q.id}: binding names ${b.asset}, which is not a baseline asset`)
    else if (a.sha256 !== b.sha256) gaps.push(`${q.id}: binding of ${b.asset} carries ${b.sha256}, the asset ${a.sha256}`)
  }
  for (const a of q.assets ?? []) if (!bindings.some((b) => b?.asset === a.path)) gaps.push(`${q.id}: asset ${a.path} is not bound to release ${t.value}`)
  return gaps
}

/**
 * Hash a source named by a baseline, only as a regular file below the resolved input `root`, through
 * the archive helper's descriptor walk: a link at any level below the root is refused, never followed,
 * and a component swapped while it is walked is either refused or not reached.
 */
function hashInside(root, rel, { deadline, spawn } = {}) {
  const r = pathOp('hash', root, rel, { deadline, spawn })
  if (r.failed) return { problem: `cannot be hashed (${r.failed})` }
  if (r.refused) return { problem: refusal(r.refused, root) }
  if (!SHA_RE.test(r.got.sha256 ?? '') || !Number.isSafeInteger(r.got.size)) return { problem: 'cannot be hashed: archive helper answered something that is not a digest' }
  return { sha256: r.got.sha256, size: r.got.size }
}

// keys sorted at every level: two documents with the same content compare equal whatever their key order
const canon = (v) => (Array.isArray(v) ? v.map(canon) : isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v)

/**
 * Strict: every recorded input re-measured; any difference or gap is a problem. `inventory` is the text
 * of the inventory.json published in the baseline's own generation: its SHA-256 must be the recorded
 * inventorySha256, and each quickstart of the baseline must be what that inventory says of it.
 */
export async function verifyBaseline(baseline, inputDir, { root = SKILL_ROOT, inventory, deadline, spawn } = {}) {
  if (!isRecord(baseline) || baseline.schema !== BASELINE_SCHEMA) return [`not a ${BASELINE_SCHEMA} document`]
  const problems = []
  if (baseline.complete !== true) problems.push('baseline says it is incomplete')
  const shape = baselineShapeGaps(baseline)
  if (shape.length) return [...problems, ...shape]
  for (const g of baseline.gaps ?? []) problems.push(`recorded gap: ${g}`)
  // the rule generation applied, applied again to the document as it is now
  const rule = baselineGaps(baseline)
  problems.push(...rule)
  // the inventory it was made from, unchanged, and saying the same of the pair
  if (typeof inventory !== 'string') problems.push('inventory: no inventory.json of the baseline\'s generation to check inventorySha256 against')
  else if (SHA_RE.test(baseline.inventorySha256 ?? '')) {
    const got = sha256Text(inventory)
    if (got !== baseline.inventorySha256) problems.push(`inventory: inventory.json is ${got}, the baseline was made from ${baseline.inventorySha256}`)
    else {
      let inv = null
      try {
        inv = JSON.parse(inventory)
      } catch {}
      const listed = isRecord(inv) && isRecords(inv.quickstarts) ? inv.quickstarts : null
      if (!listed) problems.push('inventory: inventory.json is not an inventory document')
      else
        for (const q of baseline.quickstarts) {
          const from = listed.find((x) => x.id === q.id)
          if (!from || !isRecords(from.assets)) {
            problems.push(`${q.id}: not in the inventory the baseline was made from`)
            continue
          }
          const want = canon(baselineQuickstart(from))
          const have = canon(q)
          const keys = [...new Set([...Object.keys(want), ...Object.keys(have)])].sort().filter((k) => JSON.stringify(want[k]) !== JSON.stringify(have[k]))
          if (keys.length) problems.push(`${q.id}: ${keys.join(', ')} differ from the inventory the baseline was made from`)
        }
    }
  }
  // --input resolved once; every source is hashed below that one directory
  let input = null
  try {
    input = resolveInput(inputDir)
  } catch (e) {
    problems.push(`sources: ${e.message}`)
  }
  for (const q of input ? baseline.quickstarts : []) {
    for (const a of q.assets) {
      if (!assetPathOk(a.path)) continue
      const got = hashInside(input.resolved, a.path, { deadline, spawn })
      if (got.problem) problems.push(`${q.id}: source ${a.path} ${got.problem}`)
      else if (got.sha256 !== a.sha256 || got.size !== a.size) problems.push(`${q.id}: source ${a.path} is ${got.sha256} (${got.size} bytes), the baseline froze ${a.sha256} (${a.size} bytes)`)
    }
  }
  const files = baseline.tool.implementationFiles
  if (Array.isArray(files))
    for (const rel of IMPLEMENTATION_FILES) {
      const f = files.find((x) => x.path === rel)
      if (!f) continue
      let now = null
      try {
        now = sha256Text(readFileSync(path.join(root, rel)))
      } catch {}
      if (now !== f.sha256) problems.push(`tool: ${rel} is ${now ?? 'missing'}, the baseline was made with ${f.sha256}`)
    }
  // the producing version: a commit that holds the recorded bytes, or the staged tree it was made from
  const id = baseline.tool?.identity
  const oid = id?.kind === 'commit' ? id.commit : id?.kind === 'staged-tree' ? id.tree : null
  const want = id?.kind === 'commit' ? 'commit' : 'tree'
  if (typeof oid === 'string' && OID_RE.test(oid)) {
    if (objectType(oid, { root }) !== want) problems.push(`tool: ${want} ${oid} is not in this repository`)
    else if (Array.isArray(files))
      for (const f of files.filter((x) => IMPLEMENTATION_FILES.includes(x.path))) {
        const held = committedSha256(oid, f.path, { root })
        if (held === null) problems.push(`tool: ${want} ${oid} does not hold ${f.path}`)
        else if (held !== f.sha256) problems.push(`tool: ${f.path} in ${want} ${oid} is ${held}, the baseline recorded ${f.sha256}`)
      }
  }
  if (id?.kind === 'staged-tree' && typeof id.baseCommit === 'string' && OID_RE.test(id.baseCommit) && objectType(id.baseCommit, { root }) !== 'commit')
    problems.push(`tool: base commit ${id.baseCommit} is not in this repository`)
  const head = baseline.tool?.gitHead
  if (typeof head === 'string' && OID_RE.test(head) && head !== id?.commit && head !== id?.baseCommit && objectType(head, { root }) !== 'commit')
    problems.push(`tool: HEAD ${head} is not in this repository`)
  return problems
}

/** Write every byte of `text`, flush and close; a write that makes no progress is an error, never a truncated report. */
function writeDurable(file, text) {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8')
  const fd = openSync(file, 'wx')
  try {
    for (let off = 0; off < buf.length; ) {
      const n = writeSync(fd, buf, off, buf.length - off)
      if (!(n > 0)) throw Object.assign(new Error(`short write to ${path.basename(file)} (${off} of ${buf.length} bytes)`), { code: 'EIO' })
      off += n
    }
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
// what a file system answers when it cannot flush a directory at all; any other error is a failed flush
const DIR_SYNC_UNSUPPORTED = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR'])
/** Flush a directory's entries (renames, new names). Only "not supported here" is tolerated. */
function syncDir(dir) {
  let fd
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch (e) {
    if (!DIR_SYNC_UNSUPPORTED.has(e.code)) throw e
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
const lstatOrNull = (p) => {
  try {
    return lstatSync(p)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}
/** Point `link` at `target` in one rename, whatever `link` was (absent, a symlink, a legacy regular file). */
function swapLink(outDir, link, target, tag) {
  const tmp = path.join(outDir, `.${path.basename(link)}.${process.pid}.${tag}.tmp`)
  quietRm(tmp)
  symlinkSync(target, tmp)
  renameSync(tmp, link)
}
const pause = (ms) => ms > 0 && Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// ---- process identity: a pid alone can be reused, so an owner is its pid and its start time
/** The start time `ps` gives a process, or null when it is not running or ps cannot tell. */
function processStart(pid) {
  try {
    const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 10000 })
    const s = r.status === 0 ? r.stdout.trim() : ''
    return s || null
  } catch {
    return null
  }
}
let ownStart
/** This process as an owner record: pid and start time (null when ps cannot tell). */
export function ownerRecord() {
  if (ownStart === undefined) ownStart = processStart(process.pid)
  return { pid: process.pid, started: ownStart }
}
/** Whether the process an owner record names still runs: the pid answers and, when a start time is recorded, with that start time. */
function ownerAlive(owner) {
  const pid = Number(owner?.pid)
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch (e) {
    if (e.code !== 'EPERM') return false
  }
  if (!owner.started) return true
  const now = processStart(pid)
  return now === null ? true : now === owner.started // ps unreadable: counted alive, never taken over
}
/** An owner file's record; undefined when the file is gone, null when it cannot be read as one. */
function readOwner(file) {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'))
    return o && typeof o === 'object' ? o : null
  } catch (e) {
    return e.code === 'ENOENT' ? undefined : null
  }
}

// ---------------------------------------------------------------- publication
/** The reports one run owns in --out: a run that writes fewer leaves the others out of its generation. */
const REPORT_NAMES = ['inventory.json', 'inventory.md', 'baseline.json']
const POINTER = 'current'
const GENERATIONS = '.generations'
const LOCK = '.quickstart-inventory.lock'
const MANIFEST = '.reports.json'
const HOLDS = '.holds'

/**
 * Take the out directory's lock, or fail naming the writer that holds it. The lock is a directory
 * holding one owner file (pid, start time). It is taken by renaming a complete claim directory onto
 * the lock name, which succeeds only while no lock (or an emptied one) is there. A lock whose owner
 * is dead — the pid is gone, or now runs with another start time — is broken by removing exactly that
 * owner's file, then the directory if it is empty. Owner files have unique names, so two writers
 * breaking the same stale lock can never remove the lock one of them has just taken: the second
 * finds the first one's owner alive and is refused.
 */
function takeLock(outDir, { beforeBreak } = {}) {
  const lock = path.join(outDir, LOCK)
  const nonce = randomBytes(6).toString('hex')
  const own = `owner-${process.pid}-${nonce}`
  for (let attempt = 0; attempt < 20; attempt++) {
    const claim = path.join(outDir, `.lock-claim-${process.pid}-${nonce}`)
    try {
      quietRmDir(claim)
      mkdirSync(claim)
      writeDurable(path.join(claim, own), JSON.stringify(ownerRecord()) + '\n')
    } catch (e) {
      quietRmDir(claim)
      throw new Error(`--out ${outDir}: cannot write (${e.code ?? e.message})`)
    }
    try {
      renameSync(claim, lock)
      return { lock, owner: path.join(lock, own) }
    } catch (e) {
      quietRmDir(claim)
      if (e.code === 'ENOTDIR') throw new Error(`--out ${outDir}: ${LOCK} exists and is not a lock directory — refused`)
      if (!['ENOTEMPTY', 'EEXIST'].includes(e.code)) throw new Error(`--out ${outDir}: cannot write (${e.code ?? e.message})`)
    }
    let names
    try {
      names = readdirSync(lock).filter((n) => n.startsWith('owner-'))
    } catch (e) {
      if (e.code === 'ENOENT') continue // released meanwhile
      throw new Error(`--out ${outDir}: cannot read the lock (${e.code ?? e.message})`)
    }
    const owners = names.map((n) => ({ n, o: readOwner(path.join(lock, n)) })).filter((x) => x.o !== undefined)
    // an owner file that is not a record proves nobody dead: the lock is left to whoever made it
    const live = owners.find((x) => x.o === null || ownerAlive(x.o))
    if (live) throw new Error(`--out ${outDir}: another inventory (pid ${live.o?.pid ?? 'unknown'}) is writing here (${lock})`)
    beforeBreak?.()
    for (const { n } of owners) quietRm(path.join(lock, n))
    try {
      rmdirSync(lock)
    } catch {}
    pause(attempt * 5)
  }
  throw new Error(`--out ${outDir}: another inventory is writing here (${lock}); the lock kept changing hands`)
}
function releaseLock(held) {
  quietRm(held.owner)
  try {
    rmdirSync(held.lock)
  } catch {}
}

/** The generations readers hold now (.generations/.holds/<generation>~…); holds of readers that are gone are removed. */
function liveHolds(gens) {
  const dir = path.join(gens, HOLDS)
  const held = new Set()
  let names = []
  try {
    names = readdirSync(dir)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  for (const n of names) {
    const o = readOwner(path.join(dir, n))
    if (o === undefined) continue
    if (o !== null && !ownerAlive(o)) quietRm(path.join(dir, n))
    else held.add(n.slice(0, n.indexOf('~')))
  }
  return held
}
/** Remove a generation no reader holds: renamed away first, so a read finds it whole or not at all, then the holds are checked again. */
function retire(gens, n) {
  if (liveHolds(gens).has(n)) return
  const gone = path.join(gens, `.gone-${n}`)
  renameSync(path.join(gens, n), gone)
  if (liveHolds(gens).has(n)) return renameSync(gone, path.join(gens, n)) // a reader took it meanwhile: it stays
  rmSync(gone, { recursive: true, force: true })
}

/** One generation's reports by its manifest, or null when it is not all there (being retired). */
function readGeneration(dir) {
  let names
  let legacy = false
  try {
    names = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    if (!lstatOrNull(dir)) return null
    // a generation written before manifests: the reports it has, checked again after the read
    legacy = true
    names = REPORT_NAMES.filter((n) => lstatOrNull(path.join(dir, n)))
  }
  const files = Object.fromEntries(REPORT_NAMES.map((n) => [n, null]))
  for (const n of names) {
    if (!REPORT_NAMES.includes(n)) continue
    try {
      files[n] = readFileSync(path.join(dir, n), 'utf8')
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }
  if (legacy && !lstatOrNull(dir)) return null
  return files
}

/**
 * The report set a reader should use. Opening inventory.json, inventory.md and baseline.json one by
 * one follows `current` each time, so a publication between two opens can mix two sets. This
 * resolves `current` once, registers a hold on that generation (a file under .generations/.holds with
 * the reader's pid and start time), reads every report the generation's manifest lists, and drops the
 * hold. A writer never retires a held generation and retires the others by renaming them away before
 * it removes them, so a read is either whole or finds a file gone and starts again from `current`.
 * files[name] is null only for a report the generation does not have. Where no hold can be written
 * (a read-only directory) the read is unheld, and still retried until it is whole.
 */
export function readReports(outDir) {
  const gens = path.join(outDir, GENERATIONS)
  for (let attempt = 0; attempt < 500; attempt++) {
    const dir = path.resolve(outDir, readlinkSync(path.join(outDir, POINTER)))
    const generation = path.basename(dir)
    let hold = null
    try {
      const holds = path.join(gens, HOLDS)
      mkdirSync(holds, { recursive: true })
      hold = path.join(holds, `${generation}~${process.pid}-${randomBytes(6).toString('hex')}`)
      writeDurable(hold, JSON.stringify(ownerRecord()) + '\n')
    } catch (e) {
      if (!['EACCES', 'EPERM', 'EROFS'].includes(e.code)) throw e
      hold = null
    }
    try {
      const files = readGeneration(dir)
      if (files) return { generation, dir, files }
    } finally {
      if (hold) quietRm(hold)
    }
    pause(2)
  }
  throw new Error(`${outDir}: the reports kept changing while they were read`)
}

/**
 * A baseline and the inventory.json of the same generation, as text (inventory null when there is none).
 * The conventional out/baseline.json is read through readReports — one pinned generation, so a
 * publication between the two reads cannot pair a baseline with another run's inventory. Any other
 * path is resolved once and its sibling inventory.json read from that real directory.
 */
function readBaselineSet(file) {
  const abs = path.resolve(file)
  const dir = path.dirname(abs)
  const fail = (e) => new Error(`--verify-baseline ${file}: ${e.code === 'ENOENT' ? 'does not exist' : `cannot be read (${e.code ?? e.message})`}`)
  if (path.basename(abs) === 'baseline.json' && lstatOrNull(abs)?.isSymbolicLink() && lstatOrNull(path.join(dir, POINTER))?.isSymbolicLink()) {
    let set
    try {
      set = readReports(dir)
    } catch (e) {
      throw fail(e)
    }
    if (set.files['baseline.json'] === null) throw new Error(`--verify-baseline ${file}: the published generation ${set.generation} has no baseline.json`)
    return { baseline: set.files['baseline.json'], inventory: set.files['inventory.json'] }
  }
  let real
  let baseline
  try {
    real = realpathSync(abs)
    baseline = readFileSync(real, 'utf8')
  } catch (e) {
    throw fail(e)
  }
  let inventory = null
  try {
    inventory = readFileSync(path.join(path.dirname(real), 'inventory.json'), 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') throw fail(e)
  }
  return { baseline, inventory }
}

/**
 * Publish the reports as one generation. Each run writes its reports and a manifest of them into a
 * new directory under .generations/ (flushed, then renamed into place: a generation is never seen
 * half-written), and one rename of the `current` symlink makes it the published set — the only
 * commit boundary. The conventional names inventory.json, inventory.md and baseline.json are
 * symlinks through `current`, so they all move with that one rename, and a baseline.json of an
 * earlier set cannot stay beside a set that has none. A lock makes a second writer fail instead of
 * interleaving.
 *
 * Before the switch nothing a reader sees changes: a failure or a kill there leaves the previous set.
 * Reports of an earlier version of the tool (regular files, no `current`) are first moved into a
 * generation of their own with the same bytes, then replaced by the symlinks, so they too stay
 * readable until the switch. The next run removes what an interrupted one left (a lock of a dead
 * writer, unfinished or half-retired generations). After the switch the generations other than the
 * new one, the one it replaced and those a reader holds are retired. Files that are not reports are
 * never touched.
 */
export function publish(outDir, files, { afterWrite, beforeCommit, afterCommit, beforeBreak } = {}) {
  for (const name of Object.keys(files)) if (!REPORT_NAMES.includes(name)) throw new Error(`publish: ${name} is not a report name`)
  const st = lstatOrNull(outDir)
  if (st && !st.isDirectory()) throw new Error(`--out ${outDir}: exists and is not a directory`)
  try {
    mkdirSync(outDir, { recursive: true })
  } catch (e) {
    throw new Error(`--out ${outDir}: cannot write (${e.code ?? e.message})`)
  }
  const held = takeLock(outDir, { beforeBreak })
  const gens = path.join(outDir, GENERATIONS)
  const pointer = path.join(outDir, POINTER)
  const tag = randomBytes(4).toString('hex')
  const made = [] // generation directories this run created, removed again if it does not commit
  let committed = false
  let createdLinks = false
  try {
    // what is there must be ours to replace: a report is a symlink, or a legacy regular file
    const ptr = lstatOrNull(pointer)
    if (ptr && !ptr.isSymbolicLink()) throw new Error(`--out ${outDir}: ${POINTER} exists and is not the report pointer — refused`)
    const legacy = []
    for (const name of REPORT_NAMES) {
      const x = lstatOrNull(path.join(outDir, name))
      if (x && !x.isSymbolicLink() && !x.isFile()) throw new Error(`--out ${outDir}: ${name} exists and is not a report — refused`)
      if (x?.isFile()) legacy.push(name)
    }
    const g = lstatOrNull(gens)
    if (g && !g.isDirectory()) throw new Error(`--out ${outDir}: ${GENERATIONS} exists and is not a directory — refused`)
    mkdirSync(gens, { recursive: true })
    // recovery, under the lock: what a dead writer left — an unfinished generation, a pointer left
    // mid-swap, a claim, a generation it was retiring (put back when a reader holds it, else removed)
    const heldNow = liveHolds(gens)
    for (const n of readdirSync(gens)) {
      if (n.startsWith('.tmp-')) rmSync(path.join(gens, n), { recursive: true, force: true })
      else if (n.startsWith('.gone-')) {
        const orig = n.slice('.gone-'.length)
        if (heldNow.has(orig) && !lstatOrNull(path.join(gens, orig))) renameSync(path.join(gens, n), path.join(gens, orig))
        else rmSync(path.join(gens, n), { recursive: true, force: true })
      }
    }
    for (const n of readdirSync(outDir)) {
      if (/^\.(current|inventory\.json|inventory\.md|baseline\.json)\.\d+\.[0-9a-f]+\.tmp$/.test(n)) quietRm(path.join(outDir, n))
      const claim = /^\.lock-claim-(\d+)-[0-9a-f]+$/.exec(n)
      if (claim && !ownerAlive({ pid: Number(claim[1]) })) quietRmDir(path.join(outDir, n))
    }

    const writeGeneration = (name, contents, hook) => {
      const tmp = path.join(gens, `.tmp-${process.pid}-${tag}-${name}`)
      mkdirSync(tmp)
      made.push(tmp)
      for (const [file, text] of Object.entries(contents)) {
        writeDurable(path.join(tmp, file), text)
        hook?.(file)
      }
      writeDurable(path.join(tmp, MANIFEST), JSON.stringify(Object.keys(contents)) + '\n')
      syncDir(tmp)
      const final = path.join(gens, name)
      renameSync(tmp, final)
      made[made.length - 1] = final
      syncDir(gens)
      return name
    }
    const stamp = `${Date.now().toString(36).padStart(9, '0')}-${process.pid}-${tag}`
    const generation = writeGeneration(`g-${stamp}`, files, afterWrite)

    // reports of an earlier tool version: the same bytes become the current generation first
    let previous = ptr ? path.basename(readlinkSync(pointer)) : null
    if (!ptr && legacy.length) {
      previous = writeGeneration(`g-${stamp}-legacy`, Object.fromEntries(legacy.map((n) => [n, readFileSync(path.join(outDir, n))])))
      swapLink(outDir, pointer, path.join(GENERATIONS, previous), tag)
      made.pop() // published now (same bytes as before): kept whatever happens next
    }
    // the conventional names become links through the pointer: what they show does not change yet
    for (const name of REPORT_NAMES) {
      const link = path.join(outDir, name)
      const want = path.join(POINTER, name)
      const x = lstatOrNull(link)
      if (x?.isSymbolicLink() && readlinkSync(link) === want) continue
      swapLink(outDir, link, want, tag)
      createdLinks = true
    }
    syncDir(outDir)
    beforeCommit?.()
    // the commit: one rename
    swapLink(outDir, pointer, path.join(GENERATIONS, generation), tag)
    committed = true
    syncDir(outDir)
    afterCommit?.()
    // keep the new generation, the one it replaced and those a reader holds; retire the rest
    for (const n of readdirSync(gens)) if (n.startsWith('g-') && n !== generation && n !== previous) retire(gens, n)
    return { generation, dir: path.join(gens, generation) }
  } catch (e) {
    if (committed) throw e
    for (const d of made) rmSync(d, { recursive: true, force: true })
    // links made where no pointer existed would point at nothing: take them back out
    if (createdLinks && !lstatOrNull(pointer)) for (const name of REPORT_NAMES) if (lstatOrNull(path.join(outDir, name))?.isSymbolicLink()) quietRm(path.join(outDir, name))
    if (/^--out /.test(e.message)) throw e
    throw new Error(`--out ${outDir}: reports not written (${e.code ?? e.message}); earlier reports left as they were`)
  } finally {
    releaseLock(held)
  }
}
function quietRmDir(p) {
  try {
    rmSync(p, { recursive: true, force: true })
  } catch {}
}
/** Best-effort removal while cleaning up: a failure here must not hide the error being reported. */
function quietRm(p) {
  try {
    rmSync(p, { force: true })
  } catch {}
}

// ---------------------------------------------------------------- run
// What an interrupted run (signal, --timeout) must still remove: the temporary download directory.
// The reports need nothing: they are published synchronously, so a signal lands before or after.
const cleanups = new Set()
const runCleanups = () => {
  for (const fn of cleanups) {
    try {
      fn()
    } catch {}
  }
  cleanups.clear()
}

/** The inventory run. `hooks` lets tests inject failures at fixed points. */
export async function runInventory(o, { hooks = {}, spawn, now = () => new Date() } = {}) {
  const deadline = makeDeadline(o.timeout)
  // everything that can be checked before any output is created is checked here
  let outSt = null
  try {
    outSt = lstatSync(o.out)
  } catch {}
  if (outSt && !outSt.isDirectory()) throw new Error(`--out ${o.out}: exists and is not a directory`)
  let groups
  let tempDir = null
  const source = o.input ? { kind: 'local', input: path.resolve(o.input) } : { kind: 'release', repo: o.repo, tags: [...o.release].sort() }
  try {
    if (o.input) {
      const found = discoverLocal(o.input, { spawn })
      groups = found.groups
      source.inputResolved = found.root
      source.ignored = found.ignored
      for (const id of o.tags.keys()) if (!groups.some((g) => g.id === id)) throw new UsageError(`--tag ${id}=…: no quickstart ${id} in ${o.input} (have ${groups.map((g) => g.id).join(', ')})`)
      for (const g of groups) if (o.tags.has(g.id)) g.tag = { value: o.tags.get(g.id), source: 'declared' }
    } else {
      const views = o.release.map((t) => releaseView(t, o.repo, { deadline, spawn }))
      const ids = views.map((v) => idForTag(v.tag))
      if (new Set(ids).size !== ids.length) throw new UsageError(`two --release tags give the same quickstart id (${ids.join(', ')})`)
      if (o.downloadDir) {
        let dst = null
        try {
          dst = lstatSync(o.downloadDir)
        } catch {}
        if (dst && !dst.isDirectory()) throw new Error(`--download-dir ${o.downloadDir}: not a directory`)
      }
      if (!o.downloadDir) {
        tempDir = mkdtempSync(path.join(tmpdir(), 'qs-inventory-'))
        const dir = tempDir
        cleanups.add(() => rmSync(dir, { recursive: true, force: true }))
      }
      const base = o.downloadDir ?? tempDir
      mkdirSync(base, { recursive: true })
      const root = realpathSync.native(base)
      groups = []
      for (const [i, view] of views.entries()) {
        const dir = path.join(base, ids[i])
        const downloaded = await downloadRelease(view, dir, { deadline, spawn })
        groups.push({
          id: ids[i],
          tag: { value: view.tag, source: 'release', repo: view.repo, bindings: downloaded.map((d) => ({ asset: `${ids[i]}/${d.name}`, releaseAsset: d.name, sha256: d.releaseSha256 })) },
          assets: downloaded.map((d) => ({ name: d.name, rel: `${ids[i]}/${d.name}`, root, path: d.path })),
          otherReleaseAssets: view.assets.filter((a) => !ARCHIVE_EXT.test(a.name)).map((a) => ({ name: a.name, size: a.size, sha256: a.sha256, sha256Source: 'release-metadata' }))
        })
      }
    }
    if (o.pair) for (const id of o.pair) if (!groups.some((g) => g.id === id)) throw new UsageError(`--baseline ${o.pair.join(',')}: no quickstart ${id} (have ${groups.map((g) => g.id).join(', ')})`)

    // what is inventoried is what a baseline can name: one path form for both
    for (const g of groups) for (const a of g.assets) if (!assetPathOk(a.rel)) throw new Error(`asset ${JSON.stringify(a.rel)}: not of the form <archive> or <quickstart id>/<archive>`)
    const scannedByGroup = new Map()
    for (const g of groups) {
      const scanned = []
      for (const a of g.assets) scanned.push(await scanAsset(a, { limits: o.limits, deadline, spawn }))
      scannedByGroup.set(g.id, scanned)
      if (g.tag?.source === 'release') {
        // a binding carries the release's own digest; a release that gives none leaves it null — the
        // measured hash is never copied in, so it cannot pass for a release binding
        for (const b of g.tag.bindings) {
          const s = scanned.find((x) => x.rel === b.asset)
          if (b.sha256 && s.sha256 !== b.sha256) throw new Error(`asset ${b.asset}: SHA-256 ${s.sha256}, release ${g.tag.value} says ${b.sha256}`)
        }
      }
    }
    hooks.afterScan?.()
    if (o.verifyTags) {
      for (const g of groups) {
        if (!g.tag) continue
        const view = releaseView(g.tag.value, o.repo, { deadline, spawn })
        const scanned = scannedByGroup.get(g.id)
        g.tag = { value: g.tag.value, ...bindTag({ id: g.id, tag: g.tag.value, repo: o.repo, assets: scanned, view }) }
      }
    }
    const quickstarts = groups.map((g) => analyseQuickstart(g, scannedByGroup.get(g.id))).sort(byKeys('id'))
    const inventory = { schema: SCHEMA, source, limits: o.limits, quickstarts }
    const json = JSON.stringify(inventory, null, 2) + '\n'
    const files = { 'inventory.json': json, 'inventory.md': renderMarkdown(inventory) }
    let baseline = null
    if (o.pair) {
      const images = o.image.map((ref) => resolveImage(ref, { deadline, spawn })).sort(byKeys('ref'))
      baseline = buildBaseline({ inventory, pair: o.pair, images, tool: toolIdentity({ spawn }), inventorySha256: sha256Text(json), createdAt: now().toISOString() })
      files['baseline.json'] = JSON.stringify(baseline, null, 2) + '\n'
    }
    // the sources must be the bytes that were read
    for (const [, scanned] of scannedByGroup)
      for (const a of scanned) {
        const st = pathOp('stat', a.root, a.rel, { deadline, spawn })
        if (stampKey(st.got) !== a.stamp) throw new Error(`asset ${a.rel}: changed or removed after it was read — nothing written`)
      }
    deadline.check('publication')
    publish(o.out, files, { afterWrite: hooks.afterWrite, beforeCommit: hooks.beforeCommit, afterCommit: hooks.afterCommit, beforeBreak: hooks.beforeBreak })
    return { inventory, baseline }
  } finally {
    runCleanups()
  }
}

async function main() {
  process.on('exit', runCleanups)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.once(sig, () => {
      console.error(`error: interrupted by ${sig} — nothing written`)
      process.exit(130)
    })
  const o = parseCli(process.argv.slice(2))
  if (o.help) {
    console.log(usageText(SPEC, USAGE))
    return 0
  }
  if (o.verifyBaseline) {
    const deadline = makeDeadline(o.timeout)
    const set = readBaselineSet(o.verifyBaseline)
    let doc
    try {
      doc = JSON.parse(set.baseline)
    } catch {
      throw new Error(`--verify-baseline ${o.verifyBaseline}: not readable JSON`)
    }
    const input = resolveInput(o.input)
    const where = `--input ${input.given}${input.resolved !== input.given ? ` (resolved: ${input.resolved})` : ''}`
    const timer = setTimeout(() => {
      console.error(`error: timed out after ${o.timeout}s`)
      process.exit(1)
    }, Math.max(1, deadline.remainingMs()))
    timer.unref()
    const problems = await verifyBaseline(doc, input.resolved, { inventory: set.inventory, deadline })
    clearTimeout(timer)
    if (problems.length) {
      console.error(`baseline ${o.verifyBaseline}: ${problems.length} problem(s), sources from ${where}`)
      for (const p of problems) console.error(`  - ${p}`)
      return 1
    }
    console.log(`baseline ${o.verifyBaseline}: verified — ${doc.pair.join(' + ')}, ${doc.quickstarts.flatMap((q) => q.assets).length} source asset(s) re-hashed from ${where}, ${doc.runtimeImages.length} image digest(s), tool files unchanged`)
    return 0
  }
  const timer = setTimeout(() => {
    console.error(`error: timed out after ${o.timeout}s — nothing written`)
    process.exit(1)
  }, o.timeout * 1000)
  timer.unref()
  const { inventory, baseline } = await runInventory(o)
  clearTimeout(timer)
  for (const q of inventory.quickstarts)
    console.log(`${q.id}: ${q.format}${q.innerFormat ? ' → ' + q.innerFormat : ''}, Joomla ${q.joomla ?? '?'}, PHP ≥ ${q.phpMinimum ?? '?'}, ${q.framework}${q.frameworkTemplate ? ` (${q.frameworkTemplate})` : ''}, ${q.unknowns.length} unknown(s)`)
  console.log(`wrote ${path.join(o.out, 'inventory.json')} and inventory.md${baseline ? ' and baseline.json' : ''}`)
  if (baseline && !baseline.complete) {
    console.error(`baseline incomplete — ${baseline.gaps.length} gap(s):`)
    for (const g of baseline.gaps) console.error(`  - ${g}`)
  }
  return 0
}

// compared as real paths: run through a symlinked directory (/tmp on macOS), argv[1] is not resolved
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) cli(main)
