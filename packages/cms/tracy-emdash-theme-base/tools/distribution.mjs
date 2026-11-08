#!/usr/bin/env node
// Freeze an allowlisted source directory. The output is the actual installable artifact.
// node tools/distribution.mjs pack <contract> <new-directory>
// node tools/distribution.mjs verify <artifact-directory>
import {
  readFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  lstatSync,
  statSync
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash, filesUnder, relativeFile, contractHash, validateContract } from './qa-contract.mjs'

export function forbidden(file) {
  return file
    .split('/')
    .some(
      (part) =>
        /^(?:node_modules|data|uploads|backups|evidence|\.git|\.astro|dist)$/.test(part) ||
        /before-restore|\.(?:token|db|sqlite|sqlite3|log|pem|key)$/.test(part) ||
        (/^\.env(?:\.|$)/.test(part) && part !== '.env.example')
    )
}
export function distributionFiles(root, contract) {
  const files = new Set()
  for (const entry of contract.distribution.include) {
    if (!relativeFile(entry) || forbidden(entry)) throw new Error(`Unsafe include: ${entry}`)
    const full = path.join(root, entry)
    if (!existsSync(full)) throw new Error(`Include path missing: ${entry}`)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) throw new Error(`Symlink include: ${entry}`)
    for (const file of stat.isDirectory() ? filesUnder(root, entry) : [entry]) {
      if (forbidden(file)) throw new Error(`Runtime or secret file in distribution: ${file}`)
      if (file === 'distribution.json') throw new Error('distribution.json is generated')
      files.add(file)
    }
  }
  for (const required of contract.distribution.required)
    if (!files.has(required)) throw new Error(`Required asset omitted: ${required}`)
  return [...files].sort()
}
// One definition of "the artifact hash": qa.mjs reports it from the source tree, pack() writes it
// into distribution.json, and a clean-install receipt must quote the same value.
export function manifestFor(root, contract) {
  const files = distributionFiles(root, contract)
  const checksums = Object.fromEntries(files.map((f) => [f, hash(readFileSync(path.join(root, f)))]))
  // The artifact hash identifies the shipped BYTES only; the contract hash is recorded next to it
  // for the record. Revising acceptance criteria must not turn a verified artifact into a new one.
  const manifest = { schemaVersion: 1, contractHash: contractHash(contract), checksums }
  return { manifest, files, artifactHash: hash(JSON.stringify(checksums)) }
}
export function pack(root, contract, destination) {
  const errors = validateContract(contract)
  if (errors.length) throw new Error(errors.join('\n'))
  const dest = path.resolve(destination),
    source = path.resolve(root)
  if (existsSync(dest) || dest === source || dest.startsWith(`${source}/`) || source.startsWith(`${dest}/`))
    throw new Error('Artifact destination must be new and outside the source')
  const { manifest, files, artifactHash } = manifestFor(root, contract)
  mkdirSync(dest, { recursive: true })
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dest, file)), { recursive: true })
    copyFileSync(path.join(root, file), path.join(dest, file))
  }
  writeFileSync(
    path.join(dest, 'distribution.json'),
    JSON.stringify({ ...manifest, artifactHash }, null, 2) + '\n'
  )
  return { artifactHash, files: files.length, destination: dest }
}
export function verifyDistribution(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'distribution.json'), 'utf8'))
  const { artifactHash } = manifest
  const errors = []
  if (hash(JSON.stringify(manifest.checksums ?? {})) !== artifactHash) errors.push('manifest hash mismatch')
  const expected = Object.keys(manifest.checksums ?? {}).sort()
  if (!expected.length) errors.push('empty artifact')
  // filesUnder walks directory by directory; the manifest keys are sorted globally (`b.ts` < `b/x.ts`).
  const actual = filesUnder(root)
    .filter((f) => f !== 'distribution.json')
    .sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push('artifact file set changed')
  for (const file of expected) {
    if (!relativeFile(file) || forbidden(file)) {
      errors.push(`unsafe artifact file: ${file}`)
      continue
    }
    try {
      if (hash(readFileSync(path.join(root, file))) !== manifest.checksums[file])
        errors.push(`artifact bytes changed: ${file}`)
    } catch {
      errors.push(`artifact file missing: ${file}`)
    }
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    artifactHash,
    contractHash: manifest.contractHash,
    files: expected.length,
    errors
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, input, dest] = process.argv.slice(2)
    if (!['pack', 'verify'].includes(command))
      throw new Error('usage: distribution.mjs pack <contract> <new-directory> | verify <directory>')
    const result =
      command === 'pack'
        ? pack(process.cwd(), JSON.parse(readFileSync(input, 'utf8')), dest)
        : verifyDistribution(input)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status === 'fail' ? 1 : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

/**
 * A path as a PUBLISHED file may show it: relative to `base` (the template) when it lies inside, else its last segment. A
 * release is read by other people's machines; the builder's user home or temp folder is not theirs to see.
 * @param {string} p @param {string} [base]
 */
export function shownPath(p, base = process.cwd()) {
  const abs = path.resolve(p)
  const rel = path.relative(base, abs)
  return rel === ''
    ? '.'
    : rel.startsWith('..') || path.isAbsolute(rel)
      ? path.basename(abs)
      : rel.split(path.sep).join('/')
}

const SYSTEM_DIRS = new Set([
  'etc',
  'var',
  'mnt',
  'root',
  'bin',
  'sbin',
  'proc',
  'sys',
  'dev',
  'Volumes',
  'Applications',
  'System'
])

/**
 * Whether a string names a path of THE BUILDER'S machine. Decided by evidence, not by a prefix alone, so a site route such as
 * `/home/contact` stays a route:
 *  - a Windows drive path (`X:\` or `X:/`) or a home path (`~/`);
 *  - a path inside one of `roots`, the builder's own directories (checkout, artifact, site, report folder, home, temp);
 *  - a user or temp area with something below it: a macOS or Linux user home with a user and a folder, the macOS private
 *    and per-user temp folders, or a folder under the system temp root,
 *    `/tmp/<x>` (a lone `/home/contact` has only one segment under `/home`);
 *  - a path below a system directory no site route starts with (`/etc/passwd`, `/usr/local/bin`, `/Volumes/x`; not `/opt/x` or `/usr/x`, which a route may be), which
 *    names a file of the builder's machine whether or not it exists there;
 *  - any other absolute path whose longest ancestor that exists on the builder is at least two segments deep
 *    (`/opt/builds/worker/pack`: `/opt/builds/worker` exists while building). One existing segment (`/home`, `/opt`) is not
 *    evidence: every machine has those, and a route can start with one.
 * URLs (`https://host/home/x`) and plain words are left alone. `exists` tells whether a directory exists (the builder's disk).
 * @param {string} text @param {string[]} roots @param {(dir: string) => boolean} exists
 * @returns {boolean}
 */
export function holdsLocalPath(text, roots = [], exists = isDirectory) {
  const dirs = roots.filter((r) => typeof r === 'string' && r.length > 3).map((r) => r.replace(/[\\/]+$/, ''))
  const token = /(?:^|[^A-Za-z0-9_.:/\\~-])((?:[A-Za-z]:[\\/]|~\/|\/(?!\/))[^\s"'`<>|)\]},;]*)/g
  for (const m of text.matchAll(token)) {
    const raw = m[1].replace(/[?#].*$/, '').replace(/[.:]+$/, '')
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('~/')) return true
    if (dirs.some((r) => raw === r || raw.startsWith(`${r}/`))) return true
    if (
      /^\/(?:Users|home)\/[^/]+\/[^/]+/.test(raw) ||
      /^\/(?:private|tmp)\/[^/]+/.test(raw) ||
      raw.startsWith('/var/folders/')
    )
      return true
    const segs = raw.split('/').filter(Boolean)
    if (
      segs.length >= 2 &&
      (SYSTEM_DIRS.has(segs[0]) ||
        (segs[0] === 'usr' && /^(local|bin|sbin|lib|lib64|share|src|include)$/.test(segs[1])))
    )
      return true
    for (let k = segs.length; k >= 2; k--) if (exists(`/${segs.slice(0, k).join('/')}`)) return true
  }
  return false
}

/** @param {string} dir */
function isDirectory(dir) {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * The fields of the release's own files that a SCHEMA defines as a site route, by file and JSON pointer. A route is a value of
 * the customer's site (`/home/contact/form`), never a path of the builder's machine, so a declared route field is exempt from
 * the classifier BY FIELD, not by the shape of the string. Every other field is strict: a path is never a valid value in a
 * gate, a receipt, an evidence name or a README, and a field this table does not name fails closed.
 *
 * 🔒 THE TABLE IS EMPTY ON PURPOSE. No schema of a file this tool writes defines a site route today:
 * `tracy_site_pages.json` holds `id`, `label` and `home` only (`apps/tracy-web/src/lib/site-pages-schema.mjs`; an `id` is a
 * slug or a page path without a leading slash), and the questionnaire (`questions-schema.mjs`) and `manifest.json` define
 * none. An entry may be added only together with the schema field that defines it, with a pointer as exact as the schema
 * (`/pages/<n>/path`, never a wildcard over names such as `url` or `href`), and a test that the same string elsewhere is refused.
 * @type {Record<string, RegExp>}
 */
export const ROUTE_FIELDS = {}

/** Whether `pointer` of the release file `file` is declared a route field (`ROUTE_FIELDS`). */
export const isRouteField = (/** @type {string} */ file, /** @type {string} */ pointer) =>
  ROUTE_FIELDS[file]?.test(pointer) ?? false

/**
 * The JSON pointers (`/gates/distribution/artifact`) of every string in `value` that holds a local path (`holdsLocalPath`),
 * except the strings `isRoute(pointer)` declares site routes (see `ROUTE_FIELDS`). For a plain text file pass the text and a
 * pointer such as `README.md`; the pointer then names the line.
 * @param {unknown} value @param {string[]} [roots] @param {string} [pointer] @param {(dir: string) => boolean} [exists]
 * @param {(pointer: string) => boolean} [isRoute]
 * @returns {string[]}
 */
export function localPathProblems(
  value,
  roots = [],
  pointer = '',
  exists = isDirectory,
  isRoute = () => false
) {
  if (typeof value === 'string') {
    if (isRoute(pointer)) return []
    if (!pointer.includes('.') || pointer.includes('/'))
      return holdsLocalPath(value, roots, exists) ? [pointer] : []
    return value
      .split('\n')
      .flatMap((line, i) => (holdsLocalPath(line, roots, exists) ? [`${pointer}:${i + 1}`] : []))
  }
  if (Array.isArray(value))
    return value.flatMap((v, i) => localPathProblems(v, roots, `${pointer}/${i}`, exists, isRoute))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      localPathProblems(v, roots, `${pointer}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, exists, isRoute)
    )
  return []
}
