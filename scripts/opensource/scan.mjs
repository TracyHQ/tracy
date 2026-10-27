#!/usr/bin/env node
// Defines "clean enough to publish": scans the tracked files of one git tree, minus what
// public-tree.json excludes, and fails on any hit its allow list does not explain.
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { GITLEAKS_PATH, GITLEAKS_VERSION } from './install-gitleaks.mjs'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

// RFC 2606 / RFC 6761 names that can never reach a real mailbox.
const RESERVED_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i

// "logo@2x.png" is an asset name, not an address.
const FILE_TLD = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|html?|php|md|txt|woff2?)$/i

// "git@github.com" (or "url.git@github.com" in a git -c key) is an SSH remote, not a mailbox.
const GIT_SSH_REMOTE = /(^|\.)git@(github\.com|gitlab\.com|bitbucket\.org)$/i

function emailIsReserved(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1)
  return RESERVED_EMAIL_DOMAIN.test(domain) || FILE_TLD.test(domain) || GIT_SSH_REMOTE.test(email)
}

// A dotted quad not glued to a word, a longer dotted number (versions) or a CIDR suffix.
const IPV4_RE = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\.?\d|\w|\/\d)/g

// Public or RFC 1918 addresses name a real machine; these ranges never do.
function ipIsHarmless([a, b, c]) {
  if (a === 0 || a === 127 || a >= 224) return true // this-host, loopback, multicast, masks
  if (a === 169 && b === 254) return true // link-local
  if (a === 192 && b === 0 && c === 2) return true // RFC 5737 TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  return false
}

// Public resolvers, example.com's address and the classic fake quads: they name no machine of ours.
const WELL_KNOWN_IPS = new Set([
  '1.1.1.1',
  '1.0.0.1',
  '8.8.8.8',
  '8.8.4.4',
  '9.9.9.9',
  '93.184.216.34',
  '1.2.3.4',
  '5.6.7.8'
])

// A dotted quad right after one of these is a version, section number or OID.
const NOT_AN_ADDRESS_BEFORE =
  /(version|ver|Chrome|Firefox|Safari|Edg|OPR|Version|section-|oid|OID)["'`:=\s/(-]*$/i

// Also the dash-escaped form agent tools use for per-project folders (`/tmp/x/-Users-name-repo/`).
const MACHINE_PATH_RE = /\/(?:Users|Volumes)\/[A-Za-z0-9._-]+|(?<![\w-])-(?:Users|Volumes)-[A-Za-z0-9_]+/g
const PLACEHOLDER_USER = /^\/Users\/(you|me|user|username|name|runner|someone|example|xxx|USER)$/i
const asSlashPath = (m) => (m.startsWith('-') ? m.replace(/^-(\w+)-/, '/$1/') : m)

// A 12-digit AWS account id in an ECR host or an ARN names a real account; AWS's documented examples do not.
const AWS_ACCOUNT_RE = /\b(\d{12})(?=\.dkr\.ecr\.)|\barn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:(\d{12}):/g
const EXAMPLE_AWS_ACCOUNTS = new Set(['123456789012', '111122223333', '444455556666', '777788889999'])

// Test data must not carry a number that could ring a real phone. Only test paths are scanned: product
// copy and template samples are reviewed as content, and their placeholders are already zero-filled.
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|fixtures?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/
// An international number (`+` or `wa.me/`): calling code, then groups that may be spaced, dotted or bracketed.
const PHONE_RE =
  /(?<![\w+/.-])\+[1-9]\d{0,2}(?:[ .-]?\(?\d{1,4}\)?)(?:[ .-]?\d{1,5}){1,5}(?![\w-])|\bwa\.me\/\d{8,15}\b/g
// Ranges and shapes no operator hands out, or that any reader sees as made up: NANP/most test suites' 555,
// Ofcom's drama range 020 7946 0xxx, ARCEP's 06 39 98 xx xx, a run of four equal digits, two runs of three, or a
// six-digit straight.
const FICTIONAL_PHONE =
  /555|79460|3363998|(\d)\1{3}|(\d)\2\2(\d)\3\3|012345|123456|234567|345678|456789|987654|876543|765432|654321|543210/
function phoneIsFictional(match) {
  const digits = match.replace(/\D/g, '')
  return digits.length < 9 || digits.length > 15 || FICTIONAL_PHONE.test(digits)
}

// Letters only Vietnamese uses; French/German accents stay out.
const VIETNAMESE_RE = /[ăắằẳẵặâấầẩẫậđêếềểễệôốồổỗộơớờởỡợưứừửữựạảẹẻẽịỉọỏụủỳỵỷỹ]/i

// Reported, never failing: translation is a later wave.
export const NON_BLOCKING = new Set(['vietnamese'])

const ARCHIVE_RE = /\.(zip|gz|tgz|tar|bz2|xz|7z|rar|jar|sql|dump|sqlite3?|db)$/i
const SOURCE_MAP_FILE_RE = /\.map$/i
// Split so this file does not report itself.
const INLINE_SOURCE_MAP = ['sourceMappingURL', 'data:'].join('=')
// A schema migration is source; any other committed .sql is a dump to review.
const MIGRATION_RE = /(^|\/)migrations\/[^/]+\.sql$/
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1'

function fileKindHits(entry, data) {
  const { path } = entry
  const hits = []
  if (ARCHIVE_RE.test(path) && !MIGRATION_RE.test(path)) hits.push({ category: 'archive', path })
  if (SOURCE_MAP_FILE_RE.test(path) || data.includes(INLINE_SOURCE_MAP)) {
    hits.push({ category: 'source-map', path })
  }
  if (data.length < 200 && data.subarray(0, LFS_POINTER.length).toString() === LFS_POINTER) {
    hits.push({ category: 'lfs-pointer', path })
  }
  return hits
}

const isBinary = (data) => data.subarray(0, 8000).includes(0)

// Kinds an allow entry may claim. Operational info (people's inboxes, machines, hosts) has no kind
// on purpose: it is removed, never allowed.
export const ALLOW_KINDS = {
  attribution: 'copyright, licence or authorship notice the licence requires us to keep',
  placeholder: 'obviously fake value in an example, test or doc',
  'third-party-content': 'fictional data shipped inside a third-party template or library',
  'public-endpoint': 'a public service address code must talk to',
  'false-positive': 'the rule matched something that is not its category (a digest, a data key, prose)',
  'pending-translation': 'Vietnamese text waiting for the translation wave',
  'i18n-translation':
    'product translation into one of the interface languages; translations are data, never cleaned',
  'language-data': 'deliberate non-English data: test inputs, place or menu data, template sample content',
  'sealed-artifact':
    'a byte-pinned released artifact; content cannot change without a new release; must hold no secret'
}

const ATTRIBUTION_FILE =
  /(^|\/)(LICEN[CS]E|COPYING|NOTICE|AUTHORS|CONTRIBUTORS|THIRD[_-]PARTY[_-]NOTICES)[^/]*$/i
const ATTRIBUTION_LINE =
  /copyright|\(c\)|©|@author|\bauthors?\b\s*[:=]|"(author|contributors|maintainers)"\s*:|maintainer|licen[cs]ed? (to|by)/i

const ATTRIBUTION = { kind: 'attribution', reason: 'licence or authorship notice' }

function scanText(path, text) {
  const hits = []
  const lines = text.split('\n')
  const attributionFile = ATTRIBUTION_FILE.test(path)
  const testPath = TEST_PATH_RE.test(path)
  let vietnameseLines = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const m of line.matchAll(EMAIL_RE)) {
      if (emailIsReserved(m[0])) continue
      const hit = { category: 'email', path, line: i + 1, match: m[0] }
      if (attributionFile || ATTRIBUTION_LINE.test(line)) hit.allowed = ATTRIBUTION
      hits.push(hit)
    }
    for (const m of line.matchAll(IPV4_RE)) {
      const raw = m.slice(1, 5)
      const octets = raw.map(Number)
      if (octets.some((o) => o > 255) || raw.some((o) => o.length > 1 && o[0] === '0')) continue
      if (ipIsHarmless(octets) || WELL_KNOWN_IPS.has(m[0])) continue
      if (NOT_AN_ADDRESS_BEFORE.test(line.slice(Math.max(0, m.index - 24), m.index))) continue
      hits.push({ category: 'ip', path, line: i + 1, match: m[0] })
    }
    for (const m of line.matchAll(MACHINE_PATH_RE)) {
      if (PLACEHOLDER_USER.test(asSlashPath(m[0]))) continue
      hits.push({ category: 'machine-path', path, line: i + 1, match: m[0] })
    }
    for (const m of line.matchAll(AWS_ACCOUNT_RE)) {
      const account = m[1] ?? m[2]
      if (EXAMPLE_AWS_ACCOUNTS.has(account)) continue
      hits.push({ category: 'cloud-account', path, line: i + 1, match: account })
    }
    if (testPath) {
      for (const m of line.matchAll(PHONE_RE)) {
        if (!phoneIsFictional(m[0])) hits.push({ category: 'phone', path, line: i + 1, match: m[0] })
      }
    }
    if (VIETNAMESE_RE.test(line)) vietnameseLines++
  }
  if (vietnameseLines) hits.push({ category: 'vietnamese', path, count: vietnameseLines })
  return hits
}

function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

// "dir/" is a prefix; anything else is a glob over the whole path.
function pathMatcher(pattern) {
  if (pattern.endsWith('/')) return (p) => p.startsWith(pattern)
  const re = globToRegExp(pattern)
  return (p) => re.test(p)
}

// A secret allow names the exact values it clears, so a new secret in the same file still blocks.
const pinsSecret = (a, hit) =>
  a.category !== 'secret' || (hit.secretSha256 !== undefined && a.secretSha256?.includes(hit.secretSha256))

export function compilePolicy(policy) {
  const excluded = (policy.exclude ?? []).map(pathMatcher)
  const allow = (policy.allow ?? []).map((a) => ({
    ...a,
    test: pathMatcher(a.path),
    matchRe: a.match ? new RegExp(a.match) : null
  }))
  return {
    isExcluded: (p) => excluded.some((m) => m(p)),
    allowFor: (hit) =>
      allow.find(
        (a) =>
          a.category === hit.category &&
          a.test(hit.path) &&
          (!a.matchRe || a.matchRe.test(hit.match ?? '')) &&
          pinsSecret(a, hit)
      )
  }
}

function listTree(repo, ref) {
  const out = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '-z', '--full-tree', ref], {
    maxBuffer: 1 << 30
  }).toString('utf8')
  return out
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf('\t')
      const [mode, type, oid] = row.slice(0, tab).split(' ')
      return { mode, type, oid, path: row.slice(tab + 1) }
    })
}

// Streams blob contents through one `git cat-file --batch`, in the order given.
async function* readBlobs(repo, entries) {
  const child = spawn('git', ['-C', repo, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'inherit'] })
  child.stdin.on('error', () => {})
  ;(async () => {
    for (const e of entries) {
      if (!child.stdin.write(`${e.oid}\n`)) await new Promise((r) => child.stdin.once('drain', r))
    }
    child.stdin.end()
  })()
  let buf = Buffer.alloc(0)
  let idx = 0
  for await (const chunk of child.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    while (idx < entries.length) {
      const nl = buf.indexOf(10)
      if (nl < 0) break
      const size = Number(buf.subarray(0, nl).toString().split(' ')[2])
      if (buf.length < nl + 1 + size + 1) break
      yield { entry: entries[idx++], data: buf.subarray(nl + 1, nl + 1 + size) }
      buf = buf.subarray(nl + 1 + size + 1)
    }
  }
}

// Binary media gitleaks cannot read; archives stay in, gitleaks opens them.
const MEDIA_GLOBS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'pdf',
  'psd'
].flatMap((e) => [`*.${e}`, `*.${e.toUpperCase()}`])

function pipe(cmd, args, into) {
  return new Promise((resolve, reject) => {
    const a = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const b = spawn(into[0], into.slice(1), { stdio: ['pipe', 'ignore', 'pipe'] })
    let err = ''
    a.stderr.on('data', (d) => (err += d))
    b.stderr.on('data', (d) => (err += d))
    a.stdout.pipe(b.stdin)
    let left = 2
    const done = (code) => {
      if (code !== 0) reject(new Error(`${cmd} | ${into[0]} failed: ${err.trim()}`))
      else if (--left === 0) resolve()
    }
    a.on('error', reject).on('close', done)
    b.on('error', reject).on('close', done)
  })
}

export const secretDigest = (value) => createHash('sha256').update(value).digest('hex')

const GITLEAKS_CONFIG = fileURLToPath(new URL('./gitleaks.toml', import.meta.url))

// gitleaks picks a decompressor when the file NAME merely contains an extension ("x.browser.ts" reads
// as brotli), then skips the file, sometimes without logging it. Those files are scanned again as text.
const LOOKS_COMPRESSED = /\.(br|gz|bz2|xz|zst|lz4|lz|sz|zz|zip|tar|rar|7z)/i
const IS_ARCHIVE = /\.(br|gz|tgz|bz2|xz|zst|lz4|lz|sz|zz|zip|tar|rar|7z|jar)$/i
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const UNREADABLE = /could not read file.*\bpath=(.+)$/

const gitleaksArgs = (reportPath) => [
  '--config',
  GITLEAKS_CONFIG,
  '--no-banner',
  // Unredacted only inside the temp dir, deleted below: each value is reduced to its sha256 so an
  // allow can pin it, and never leaves runGitleaks.
  '--report-format',
  'json',
  '--report-path',
  reportPath,
  '--exit-code',
  '0',
  '--log-level',
  'error'
]

// stderr is read, not ignored: an error line means a file went unscanned, and that fails the scan.
function gitleaksRun(bin, args, input) {
  const r = spawnSync(bin, args, { input, stdio: ['pipe', 'ignore', 'pipe'], maxBuffer: 1 << 28 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`gitleaks exited ${r.status}: ${r.stderr.toString().slice(-2000)}`)
  return r.stderr
    .toString()
    .replace(ANSI, '')
    .split('\n')
    .filter((l) => /\bERR\b/.test(l))
}

function walk(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))
}

// Materializes the tree (no submodule content, no media) and runs the pinned gitleaks over it.
async function runGitleaks({ bin, repo, ref, workRoot, isExcluded }) {
  let version
  try {
    version = execFileSync(bin, ['version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim()
  } catch (e) {
    throw new Error(
      `gitleaks not runnable at ${bin} (node scripts/opensource/install-gitleaks.mjs): ${e.message}`
    )
  }
  if (version !== GITLEAKS_VERSION) throw new Error(`gitleaks ${version} found, ${GITLEAKS_VERSION} pinned`)
  mkdirSync(workRoot, { recursive: true })
  const work = mkdtempSync(join(workRoot, 'scan-'))
  try {
    const tree = join(work, 'tree')
    mkdirSync(tree)
    const excludes = MEDIA_GLOBS.flatMap((g) => ['--exclude', g])
    await pipe('git', ['-C', repo, 'archive', '--format=tar', ref], ['tar', '-x', '-C', tree, ...excludes])
    const reportPath = join(work, 'gitleaks.json')
    const toPath = (file) => relative(tree, file).split(sep).join('/')
    const findings = []
    const errors = gitleaksRun(bin, ['dir', tree, ...gitleaksArgs(reportPath), '--max-archive-depth', '3'])
    for (const f of JSON.parse(readFileSync(reportPath, 'utf8'))) {
      const file = f.File.startsWith(tree) ? f.File.slice(tree.length + 1) : f.File
      // Inside an archive gitleaks writes "outer.zip!inner/path".
      findings.push({
        f,
        path: file.split('!')[0].split('\\').join('/'),
        inner: file.includes('!') ? file : undefined
      })
    }
    const rescan = (path, input, inner) => {
      const errs = gitleaksRun(bin, ['stdin', ...gitleaksArgs(reportPath)], input)
      if (errs.length) throw new Error(`gitleaks could not scan ${inner ?? path}: ${errs.join('; ')}`)
      for (const f of JSON.parse(readFileSync(reportPath, 'utf8'))) findings.push({ f, path, inner })
    }
    for (const file of walk(tree)) {
      const name = basename(file)
      if (LOOKS_COMPRESSED.test(name) && !IS_ARCHIVE.test(name) && !isExcluded(toPath(file))) {
        rescan(toPath(file), readFileSync(file))
      }
    }
    for (const line of errors) {
      const m = UNREADABLE.exec(line)
      const [outer, inner, deeper] = (m?.[1] ?? '').trim().split('!')
      if (!m || deeper !== undefined) throw new Error(`gitleaks left a file unscanned: ${line.trim()}`)
      const path = toPath(outer)
      if (isExcluded(path)) continue
      // Its own name made gitleaks guess wrong; already rescanned as text above.
      if (inner === undefined && LOOKS_COMPRESSED.test(basename(outer)) && !IS_ARCHIVE.test(basename(outer)))
        continue
      if (inner === undefined) throw new Error(`gitleaks left a file unscanned: ${line.trim()}`)
      rescan(path, execFileSync('tar', ['-xOf', outer, inner], { maxBuffer: 1 << 28 }), `${path}!${inner}`)
    }
    const seen = new Set()
    const hits = []
    for (const { f, path, inner } of findings) {
      if (isExcluded(path)) continue
      const hit = {
        category: 'secret',
        path,
        line: f.StartLine,
        match: f.RuleID,
        secretSha256: secretDigest(f.Secret),
        inner
      }
      const key = `${path}\0${inner}\0${hit.line}\0${hit.match}\0${hit.secretSha256}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(hit)
    }
    return { version, hits }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// gitleaks: path to the pinned binary, or false to skip it (the report then says so, and the CLI
// refuses to call such a scan clean).
export async function scanRef({ repo, ref = 'HEAD', policy, gitleaks, workRoot }) {
  const rules = compilePolicy(policy)
  let gitleaksResult = { skipped: true }
  let secretHits = []
  if (gitleaks) {
    const r = await runGitleaks({
      bin: gitleaks,
      repo,
      ref,
      // Not under node_modules: gitleaks' default config skips any path that contains it.
      workRoot: workRoot ?? tmpdir(),
      isExcluded: rules.isExcluded
    })
    gitleaksResult = { version: r.version, findings: r.hits.length }
    secretHits = r.hits
  }
  const entries = listTree(repo, ref).filter((e) => !rules.isExcluded(e.path))
  const hits = []
  for (const e of entries) {
    if (e.type === 'commit') hits.push({ category: 'submodule', path: e.path, match: e.oid })
  }
  const blobs = entries.filter((e) => e.type === 'blob')
  for await (const { entry, data } of readBlobs(repo, blobs)) {
    if (entry.mode === '120000') {
      hits.push({ category: 'symlink', path: entry.path, match: data.toString('utf8') })
      continue
    }
    hits.push(...fileKindHits(entry, data))
    if (!isBinary(data)) hits.push(...scanText(entry.path, data.toString('utf8')))
  }
  hits.push(...secretHits)
  for (const hit of hits) {
    if (hit.allowed) continue
    const a = rules.allowFor(hit)
    if (a) hit.allowed = { kind: a.kind, reason: a.reason }
  }
  hits.sort((x, y) => byteOrder(x.path, y.path) || (x.line ?? 0) - (y.line ?? 0))
  return {
    ref,
    gitleaks: gitleaksResult,
    hits,
    blocking: hits.filter((h) => !h.allowed && !NON_BLOCKING.has(h.category)).length
  }
}

export function loadPolicy(path) {
  const policy = JSON.parse(readFileSync(path, 'utf8'))
  for (const [i, a] of (policy.allow ?? []).entries()) {
    const where = `allow[${i}] (${a.path ?? '?'})`
    if (!a.path || !a.category) throw new Error(`${where}: needs path and category`)
    if (!a.reason?.trim()) throw new Error(`${where}: needs a reason`)
    if (!Object.hasOwn(ALLOW_KINDS, a.kind)) {
      throw new Error(`${where}: kind must be one of ${Object.keys(ALLOW_KINDS).join(', ')}`)
    }
    if (a.category === 'secret') {
      const pins = a.secretSha256
      if (!Array.isArray(pins) || !pins.length || !pins.every((h) => /^[0-9a-f]{64}$/.test(h))) {
        throw new Error(`${where}: a secret allow needs secretSha256, the sha256 of each value it clears`)
      }
      if (/[*?]/.test(a.path) || a.path.endsWith('/')) {
        throw new Error(`${where}: a secret allow names one exact path, not a glob or folder`)
      }
    }
  }
  return policy
}

export const CATEGORIES = [
  'secret',
  'email',
  'ip',
  'machine-path',
  'cloud-account',
  'phone',
  'archive',
  'source-map',
  'symlink',
  'lfs-pointer',
  'submodule',
  'vietnamese'
]

export function summarize(report, failOn = new Set()) {
  const rows = CATEGORIES.map((c) => {
    const of = report.hits.filter((h) => h.category === c)
    const allowed = of.filter((h) => h.allowed).length
    const counts =
      c === 'vietnamese' ? ` (${of.reduce((n, h) => n + (h.allowed ? 0 : h.count), 0)} lines)` : ''
    const blocks = !NON_BLOCKING.has(c) || failOn.has(c)
    return `${c.padEnd(14)}${String(of.length - allowed).padStart(7)}${String(allowed).padStart(9)}  ${blocks ? 'blocking' : 'report only'}${counts}`
  })
  return [`${'category'.padEnd(14)}${'hits'.padStart(7)}${'allowed'.padStart(9)}`, ...rows].join('\n')
}

const USAGE = `usage: node scripts/opensource/scan.mjs [--repo DIR] [--ref REF] [--policy FILE] [--json FILE]
       [--fail-on vietnamese] [--work-dir DIR] [--gitleaks BIN] [--no-gitleaks] [--list CATEGORY]
exit: 0 clean, 1 blocking hits, 2 scan incomplete or failed`

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: '.' },
      ref: { type: 'string', default: 'HEAD' },
      policy: { type: 'string', default: join(here, 'public-tree.json') },
      json: { type: 'string' },
      'fail-on': { type: 'string', multiple: true, default: [] },
      'work-dir': { type: 'string' },
      gitleaks: { type: 'string', default: process.env.GITLEAKS_BIN ?? GITLEAKS_PATH },
      'no-gitleaks': { type: 'boolean', default: false },
      list: { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', default: false }
    }
  })
  if (values.help) return console.log(USAGE), 0
  if (!values['no-gitleaks'] && !existsSync(values.gitleaks)) {
    console.error(
      `gitleaks ${GITLEAKS_VERSION} missing at ${values.gitleaks}: run node scripts/opensource/install-gitleaks.mjs`
    )
    return 2
  }
  const failOn = new Set(values['fail-on'])
  const report = await scanRef({
    repo: values.repo,
    ref: execFileSync('git', ['-C', values.repo, 'rev-parse', values.ref]).toString().trim(),
    policy: loadPolicy(values.policy),
    gitleaks: values['no-gitleaks'] ? false : values.gitleaks,
    workRoot: values['work-dir']
  })
  report.blocking += report.hits.filter((h) => !h.allowed && failOn.has(h.category)).length
  if (values.json) writeFileSync(values.json, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`ref ${report.ref}  gitleaks ${report.gitleaks.skipped ? 'SKIPPED' : report.gitleaks.version}`)
  console.log(summarize(report, failOn))
  for (const c of values.list) {
    for (const h of report.hits.filter((x) => x.category === c && !x.allowed)) {
      console.log(`${c}\t${h.path}${h.line ? `:${h.line}` : ''}\t${h.match ?? h.count ?? ''}`)
    }
  }
  if (report.blocking) return console.log(`\n${report.blocking} blocking hit(s)`), 1
  if (report.gitleaks.skipped) return console.log('\nINCOMPLETE: gitleaks did not run'), 2
  console.log('\nclean')
  return 0
}

// realpath both sides: on macOS the temp dir is reached through a symlink (/var -> /private/var).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message)
      process.exit(2)
    }
  )
}
