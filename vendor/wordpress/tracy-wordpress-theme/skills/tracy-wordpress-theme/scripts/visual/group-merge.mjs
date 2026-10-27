#!/usr/bin/env node
// group-merge.mjs — bring page groups' changes back into the main dossier and theme, once, before the
// coordinator builds and seeds the main stand (build-subagents.md §Parallel page groups, Integration).
//
//   node scripts/visual/group-merge.mjs --manifest ownership.json --base <baseline tree> --main <main tree>
//        --group g1=<g1 tree> --group g2=<g2 tree> --report merge-report.json [--dry-run]
//   node scripts/visual/group-merge.mjs --recover --main <main tree>     # undo a merge a crash left half-done
//
// A "tree" is a checkout root (the post-pilot commit's worktree, a group's worktree, the main worktree);
// every path below is relative to it. `--base` is the IMMUTABLE baseline every group was cut from; `--main` is
// where the result lands. The tool changes nothing until every group has been read and every rule has passed.
//
// ownership.json (the coordinator's split, one owner per file):
//   { "schemaVersion": 1,
//     "roots":  ["tasks/site", "packages/cms/tracy-wordpress-theme/overlays/tracy-base"],   // what is compared
//     "records": [{ "file": "tasks/site/spec/content.json", "adapter": "content" },          // merged by record id
//                 { "file": "tasks/site/review.config.json", "collections": { "visual.exceptions": ["kind", "match"] } }],
//     "frozen": ["packages/.../overlays/tracy-base/theme.json"],                            // coordinator-only
//     "groups": { "g1": { "owns": ["packages/.../templates/page-a.html", "packages/.../patterns/a/"] } } }
//
// Rules (each refusal names the rule, the group(s), the file and the record):
//   record-conflict      two groups touched one record (added, changed or removed it) — even to the same value
//   record-key           a record has no key, or two records share one (the key is the collection's identity, never a position)
//   record-order         a group reordered records it did not otherwise change (unsupported: say it by editing records)
//   shared-changed       a record file changed outside its declared collections (site-wide fields are the coordinator's)
//   unowned-file         a group changed a file it does not own; `frozen-file` when it is a frozen shared file
//   duplicate-owner      two groups own one file (or a directory holding the other's file)
//   baseline-drift       main no longer equals the baseline for a file a group changed (a second merge, or a hand edit)
//   unsafe-path          absolute / `..` / backslash path, a symlink, or anything that is not a regular file or directory
// A group that changed nothing is a successful, explicit no-op. A refusal changes no byte of main; the writes run under a
// lock, from backups, and roll back on any failure. ONE owner holds the lock from planning to the end of report publication
// (merge, dry run, refusal — and recovery, which claims it exclusively and never takes over another recovery's claim); base,
// every group, the manifest and main are rechecked by hash before applying and before the COMMIT, which is the atomic
// publication of the successful report: a merge is merged only once that report is on disk.
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants as FS,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export const MANIFEST_SCHEMA = 1
const GROUP_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i
export const LOCK_DIR = '.group-merge'
/**
 * Default record identities of the spec-pack files the seeder reads (seed.mjs). A collection's key is a list of
 * ALTERNATIVES, tried in order: the first whose required fields are all present names the record. A field is a dotted
 * path; a trailing `?` makes it optional (part of the key when present — `locale?` keeps one slug of two locales two
 * records). A page the adapter gave no `path` is still a record: it is found by its slug, its id or its file.
 * An alternative is also a UNIQUENESS CONSTRAINT of the collection — no two records answer to one value of it (two pages of
 * one locale and slug compete for one WordPress identity, whatever their paths) — unless it is declared `{ fields, unique: false }`
 * (an image file name shared by two folders). The constraints hold over the baseline, every group's list and the merged result.
 */
export const ADAPTERS = Object.freeze({
  content: {
    pages: [['locale?', 'path'], ['locale?', 'slug'], ['locale?', 'id'], ['file']],
    posts: [['joomla.articleId'], ['locale?', 'path'], ['locale?', 'slug']],
    categories: [['locale?', 'wpSlug'], ['locale?', 'id']],
    archives: [['locale?', 'path'], ['file']],
    // spec-pack.md §3 image table: the source path (`original`) is the identity; two files of one name from two folders are two records
    // …and `file` only finds a record that has no `original`: a file name is NOT unique across folders (`unique: false`)
    images: [['original'], { fields: ['file'], unique: false }],
    assets: [['original'], { fields: ['file'], unique: false }],
    authors: [['id']]
  },
  sections: { custom: [['locale?', 'id']], acm: [['locale?', 'id']], other: [['locale?', 'id']] },
  'page-map': { pages: [['file']] },
  'content-contract': { surfaces: [['id']] },
  'design-contract': { pages: [['id']] },
  'parity-accepted': { accept: [['match', 'routes?']] },
  'review-config': { 'visual.exceptions': [['kind', 'match']] }
})

export class MergeError extends Error {
  constructor(message, conflicts = []) {
    super(message)
    this.conflicts = conflicts
  }
}
const usageError = (m) => Object.assign(new MergeError(m), { usage: true })
const conflict = (rule, message, extra = {}) => ({ rule, message, ...extra })

// ───────────────────────────────────────────────────────────── safe file access
const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`

/** A relative, normalised, forward-slash path with no `..`; anything else is unsafe-path. */
export function cleanRel(p, what = 'path') {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.includes('\\') || path.isAbsolute(p) || /^[a-z]:/i.test(p)) throw new MergeError(`${what} ${JSON.stringify(p)}: not a relative path`, [conflict('unsafe-path', `${what} ${JSON.stringify(p)} is not a relative, forward-slash path`)])
  const dir = p.endsWith('/')
  const parts = p.split('/').filter(Boolean)
  if (!parts.length || parts.some((x) => x === '.' || x === '..')) throw new MergeError(`${what} ${JSON.stringify(p)}: escapes its tree`, [conflict('unsafe-path', `${what} ${JSON.stringify(p)} contains . or .. segments`)])
  return parts.join('/') + (dir ? '/' : '')
}

/** lstat without following; null when absent. */
const lstatOrNull = (p) => {
  try {
    return lstatSync(p)
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null
    throw e
  }
}

/** `tree/rel` with every EXISTING component a real directory (not a symlink); returns the path. */
function inTree(tree, rel, what) {
  const parts = cleanRel(rel, what).replace(/\/$/, '').split('/')
  let cur = tree
  for (const [i, part] of parts.entries()) {
    cur = path.join(cur, part)
    const st = lstatOrNull(cur)
    if (!st) break
    if (st.isSymbolicLink()) throw new MergeError(`${what} ${rel}: ${parts.slice(0, i + 1).join('/')} is a symlink`, [conflict('unsafe-path', `${what} ${rel}: ${parts.slice(0, i + 1).join('/')} is a symlink`)])
    if (i < parts.length - 1 && !st.isDirectory()) throw new MergeError(`${what} ${rel}: ${parts.slice(0, i + 1).join('/')} is not a directory`, [conflict('unsafe-path', `${what} ${rel}: ${parts.slice(0, i + 1).join('/')} is not a directory`)])
  }
  return path.join(tree, ...parts)
}

/** Bytes of a regular file, never following a symlink and never blocking on a FIFO; null when absent. */
export function readRegular(file, what = file) {
  const st = lstatOrNull(file)
  if (!st) return null
  if (!st.isFile()) throw new MergeError(`${what}: not a regular file`, [conflict('unsafe-path', `${what} is a ${st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'directory' : 'special file'}, not a regular file`)])
  const fd = openSync(file, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0) | (FS.O_NONBLOCK ?? 0))
  try {
    if (!fstatSync(fd).isFile()) throw new MergeError(`${what}: not a regular file`, [conflict('unsafe-path', `${what} is not a regular file`)])
    return readFileSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** Every regular file under `tree/root`, as { rel: absolute path }. A symlink or special file anywhere is unsafe-path. */
function walk(tree, root, out = new Map(), rel = root.replace(/\/$/, '')) {
  const abs = inTree(tree, rel, 'root')
  const st = lstatOrNull(abs)
  if (!st) return out
  if (!st.isDirectory()) throw new MergeError(`root ${rel}: not a directory`, [conflict('unsafe-path', `root ${rel} is not a directory`)])
  for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) walk(tree, r, out, r)
    else if (e.isFile()) out.set(r, path.join(abs, e.name))
    else throw new MergeError(`${r}: ${e.isSymbolicLink() ? 'a symlink' : 'a special file'}`, [conflict('unsafe-path', `${r} is ${e.isSymbolicLink() ? 'a symlink' : 'a special file'} — refused, never followed`)])
  }
  return out
}

// ───────────────────────────────────────────────────────────── manifest
/** Validate the ownership manifest and return it normalised. Throws MergeError naming what is wrong. */
export function loadManifest(raw) {
  const fail = (m) => {
    throw new MergeError(`manifest: ${m}`, [conflict('manifest', m)])
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('not an object')
  if (raw.schemaVersion !== MANIFEST_SCHEMA) fail(`schemaVersion must be ${MANIFEST_SCHEMA}`)
  const known = new Set(['schemaVersion', 'roots', 'records', 'frozen', 'groups'])
  for (const k of Object.keys(raw)) if (!known.has(k)) fail(`unknown key ${JSON.stringify(k)}`)
  const list = (v, what) => {
    if (!Array.isArray(v) || !v.length) fail(`${what} must be a non-empty list`)
    return v
  }
  const roots = list(raw.roots, 'roots').map((r) => cleanRel(r, 'roots[]').replace(/\/$/, ''))
  if (new Set(roots).size !== roots.length) fail('roots lists a root twice')
  const inRoot = (f) => roots.some((r) => f === r || f.startsWith(`${r}/`))
  const records = new Map()
  for (const [i, rec] of (raw.records === undefined ? [] : list(raw.records, 'records')).entries()) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) fail(`records[${i}] is not an object`)
    const file = cleanRel(rec.file, `records[${i}].file`)
    if (file.endsWith('/')) fail(`records[${i}].file ${file} is a directory`)
    if (!inRoot(file)) fail(`records[${i}].file ${file} is under none of the roots — a record outside the compared roots would never be merged`)
    if (records.has(file)) fail(`records lists ${file} twice`)
    if ((rec.adapter === undefined) === (rec.collections === undefined)) fail(`records[${i}] (${file}): give an "adapter" (${Object.keys(ADAPTERS).join('|')}) or its own "collections", not both or neither`)
    const collections = rec.adapter !== undefined ? ADAPTERS[rec.adapter] : rec.collections
    if (!collections) fail(`records[${i}] (${file}): unknown adapter ${JSON.stringify(rec.adapter)}`)
    const norm = {}
    for (const [name, key] of Object.entries(collections)) {
      // "id" · ["kind", "match"] (composite) · [["locale?", "path"], ["slug"]] (alternatives, first fully present wins)
      const sets = keySets(key)
      if (!/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/.test(name) || !sets.length || sets.some((set) => !Array.isArray(set.fields) || !set.fields.length || set.fields.some((f) => typeof f !== 'string' || !FIELD.test(f)) || set.fields.every((f) => f.endsWith('?')) || typeof set.unique !== 'boolean')) fail(`records[${i}] (${file}): collection ${JSON.stringify(name)} needs a dotted name and a key field (or fields), at least one required in each alternative`)
      norm[name] = sets
    }
    if (!Object.keys(norm).length) fail(`records[${i}] (${file}): no collections`)
    records.set(file, norm)
  }
  const frozen = (raw.frozen === undefined ? [] : list(raw.frozen, 'frozen')).map((f) => cleanRel(f, 'frozen[]'))
  for (const f of frozen) if (!inRoot(f.replace(/\/$/, ''))) fail(`frozen ${f} is under none of the roots — a change there would never be seen`)
  const groups = new Map()
  if (!raw.groups || typeof raw.groups !== 'object' || Array.isArray(raw.groups) || !Object.keys(raw.groups).length) fail('groups must name at least one group')
  for (const [id, g] of Object.entries(raw.groups)) {
    if (!GROUP_ID.test(id)) fail(`group id ${JSON.stringify(id)} must be letters, digits, - and _`)
    const owns = g?.owns === undefined ? [] : list(g.owns, `groups.${id}.owns`)
    groups.set(id, owns.map((o) => cleanRel(o, `groups.${id}.owns[]`)))
  }
  const problems = []
  for (const f of records.keys()) if (frozen.includes(f)) problems.push(conflict('manifest', `${f} is both a record file and frozen`))
  const owners = []
  for (const [id, owns] of groups)
    for (const o of owns) {
      const bare = o.replace(/\/$/, '')
      if (!inRoot(bare)) problems.push(conflict('manifest', `groups.${id} owns ${o}, which is under none of the roots`))
      if (records.has(bare) || [...records.keys()].some((f) => o.endsWith('/') && f.startsWith(o))) problems.push(conflict('manifest', `groups.${id} owns ${o}, a record file: records are merged by id, never owned`))
      if (frozen.some((f) => f === bare || (o.endsWith('/') && f.startsWith(o)) || (f.endsWith('/') && bare.startsWith(f)))) problems.push(conflict('frozen-file', `groups.${id} owns ${o}, which is frozen (coordinator-only)`))
      owners.push({ id, rel: bare, dir: o.endsWith('/') })
    }
  for (let i = 0; i < owners.length; i++)
    for (let j = i + 1; j < owners.length; j++) {
      const a = owners[i]
      const b = owners[j]
      const overlap = a.rel === b.rel || (a.dir && b.rel.startsWith(`${a.rel}/`)) || (b.dir && a.rel.startsWith(`${b.rel}/`))
      if (overlap) problems.push(conflict('duplicate-owner', `${a.id} and ${b.id} both own ${a.rel === b.rel ? a.rel : `${a.rel}${a.dir ? '/' : ''} ⊇ ${b.rel}${b.dir ? '/' : ''}`}`, { groups: [a.id, b.id] }))
    }
  if (problems.length) throw new MergeError(`manifest: ${problems.map((p) => p.message).join('; ')}`, problems)
  return { roots, records, frozen, groups }
}

const ownerOf = (manifest, rel) => {
  for (const [id, owns] of manifest.groups) if (owns.some((o) => (o.endsWith('/') ? rel.startsWith(o) : rel === o))) return id
  return null
}
const isFrozen = (manifest, rel) => manifest.frozen.some((f) => (f.endsWith('/') ? rel.startsWith(f) : rel === f))

// ───────────────────────────────────────────────────────────── record merge
const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' && !Array.isArray(o) && Object.hasOwn(o, k) ? o[k] : undefined), obj)
function setPath(obj, dotted, value) {
  const parts = dotted.split('.')
  let o = obj
  for (const k of parts.slice(0, -1)) o = o[k]
  o[parts.at(-1)] = value
}
const withoutPath = (obj, dotted) => {
  const copy = structuredClone(obj)
  const parts = dotted.split('.')
  let o = copy
  for (const k of parts.slice(0, -1)) o = o?.[k]
  if (o && typeof o === 'object') delete o[parts.at(-1)]
  return copy
}
const FIELD = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*\??$/
/** A collection's key as alternatives: "id" · ["kind", "match"] (composite) · [["locale?", "path"], ["slug"]] (first fully present). */
const altOf = (a) => (a && typeof a === 'object' && !Array.isArray(a) ? { fields: a.fields, unique: a.unique ?? true } : { fields: a, unique: true })
const keySets = (key) => (typeof key === 'string' ? [[key]] : Array.isArray(key) && key.length && key.every((a) => Array.isArray(a) || (a && typeof a === 'object')) ? key : Array.isArray(key) ? [key] : []).map(altOf)
const fieldValue = (rec, f) => f.replace(/\?$/, '').split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), rec)
const present = (v) => v !== undefined && v !== null && v !== ''
/** The record's key under the first alternative whose required fields are all there; null when none is. */
const keyOf = (rec, sets) => {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null
  for (const [i, set] of sets.entries()) if (set.fields.every((f) => f.endsWith('?') || present(fieldValue(rec, f)))) return JSON.stringify([i, ...set.fields.map((f) => fieldValue(rec, f) ?? null)])
  return null
}
/** EVERY identity a record answers to: one key per alternative whose required fields are all present. */
const aliasKeys = (rec, sets) => {
  const out = new Set()
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return out
  for (const [i, set] of sets.entries()) if (set.fields.every((f) => f.endsWith('?') || present(fieldValue(rec, f)))) out.add(JSON.stringify([i, ...set.fields.map((f) => fieldValue(rec, f) ?? null)]))
  return out
}
const label = (sets, key) => {
  const [i, ...vals] = JSON.parse(key)
  return sets[i].fields.flatMap((f, j) => (vals[j] === null ? [] : [`${f.replace(/\?$/, '')}=${String(vals[j])}`])).join(' ')
}
const describe = (sets) => sets.map((s) => s.fields.join('+')).join(' | ')

/** Index a collection by key; a record without its key field or a repeated key is record-key. */
function indexRecords(list, fields, where) {
  const byKey = new Map()
  for (const [i, rec] of list.entries()) {
    const k = keyOf(rec, fields)
    if (k === null) throw new MergeError(`${where}[${i}] has no ${describe(fields)}`, [conflict('record-key', `${where}[${i}] has none of the identities ${describe(fields)}: a record is matched by its id, never by position`)])
    if (byKey.has(k)) throw new MergeError(`${where}: ${label(fields, k)} appears twice`, [conflict('record-key', `${where}: ${label(fields, k)} appears twice — the key must identify one record`)])
    byKey.set(k, rec)
  }
  // every UNIQUE identity of the collection, not only the one that named the record: two records of one locale and slug
  // compete for one WordPress identity whatever their paths
  const owner = new Map()
  for (const [i, rec] of list.entries())
    for (const a of aliasKeys(rec, fields)) {
      if (!fields[JSON.parse(a)[0]].unique) continue
      if (owner.has(a)) throw new MergeError(`${where}: ${label(fields, a)} is the identity of records ${owner.get(a)} and ${i}`, [conflict('record-key', `${where}: records [${owner.get(a)}] and [${i}] share the ${describe([fields[JSON.parse(a)[0]]])} identity ${label(fields, a)} — one identity, one record`)])
      owner.set(a, i)
    }
  return byKey
}

/** What a group did to one collection, against the baseline: { added, changed, removed } keyed by record key. */
function collectionChanges(baseList, groupList, fields, where) {
  const b = indexRecords(baseList, fields, `${where} (baseline)`)
  const g = indexRecords(groupList, fields, where)
  const changes = new Map()
  for (const [k, rec] of g) {
    if (!b.has(k)) changes.set(k, { change: 'added', record: rec })
    else if (!isDeepStrictEqual(b.get(k), rec)) changes.set(k, { change: 'changed', record: rec })
  }
  for (const [k, rec] of b) if (!g.has(k)) changes.set(k, { change: 'removed', record: rec })
  // reordering the survivors is a change nobody named
  const common = [...g.keys()].filter((k) => b.has(k))
  if (!isDeepStrictEqual(common, [...b.keys()].filter((k) => g.has(k)))) throw new MergeError(`${where}: records reordered`, [conflict('record-order', `${where}: a group reordered records of the baseline — order is not a merged change`)])
  return changes
}

function indentOf(text) {
  const m = /^[ \t]+(?=")/m.exec(text)
  return { indent: m ? (m[0].startsWith('\t') ? '\t' : m[0].length) : text.trim().includes('\n') ? 2 : 0, newline: text.endsWith('\n') }
}

/**
 * Merge one record file. `groups` is [{ id, text }] — the groups that changed the file's bytes.
 * Returns { text, perGroup: { id: [{ collection, key, change }] } } or throws MergeError with every conflict.
 */
export function mergeRecordFile({ file, collections, baseText, groups }) {
  let base
  try {
    base = JSON.parse(baseText)
  } catch (e) {
    throw new MergeError(`${file} (baseline): not JSON (${e.message})`, [conflict('manifest', `${file} (baseline) is not JSON`)])
  }
  const problems = []
  const parsed = new Map()
  for (const g of groups) {
    try {
      parsed.set(g.id, JSON.parse(g.text))
    } catch (e) {
      problems.push(conflict('shared-changed', `${file}: group ${g.id}'s copy is not JSON (${e.message})`, { groups: [g.id], file }))
    }
  }
  if (problems.length) throw new MergeError(problems.map((p) => p.message).join('; '), problems)
  collections = Object.fromEntries(Object.entries(collections).map(([n, k]) => [n, keySets(k)]))
  const touched = new Map() // collection → key → [{ group, change, record }]
  const perGroup = Object.fromEntries(groups.map((g) => [g.id, []]))
  for (const g of groups) {
    const doc = parsed.get(g.id)
    // everything outside the collections is site-wide: the coordinator's
    let rest = doc
    let baseRest = base
    for (const name of Object.keys(collections)) {
      rest = withoutPath(rest, name)
      baseRest = withoutPath(baseRest, name)
    }
    if (!isDeepStrictEqual(rest, baseRest)) {
      const keys = [...new Set([...Object.keys(rest ?? {}), ...Object.keys(baseRest ?? {})])].filter((k) => !isDeepStrictEqual(rest?.[k], baseRest?.[k]))
      problems.push(conflict('shared-changed', `${file}: group ${g.id} changed ${keys.join(', ') || 'the document'}, outside the merged collections (${Object.keys(collections).join(', ')}) — shared, the coordinator's`, { groups: [g.id], file }))
      continue
    }
    for (const [name, fields] of Object.entries(collections)) {
      const bl = getPath(base, name)
      const gl = getPath(doc, name)
      if (bl === undefined && gl === undefined) continue
      if (gl === undefined || !Array.isArray(gl) || (bl !== undefined && !Array.isArray(bl))) {
        problems.push(conflict('shared-changed', `${file}: group ${g.id}'s ${name} is ${gl === undefined ? 'gone' : 'not a list'}`, { groups: [g.id], file }))
        continue
      }
      let ch
      try {
        ch = collectionChanges(bl ?? [], gl, fields, `${file} ${name}`)
      } catch (e) {
        if (e instanceof MergeError) {
          problems.push(...e.conflicts.map((c) => ({ ...c, groups: [g.id], file })))
          continue
        }
        throw e
      }
      for (const [k, c] of ch) {
        if (!touched.has(name)) touched.set(name, new Map())
        const m = touched.get(name)
        if (!m.has(k)) m.set(k, [])
        m.get(k).push({ group: g.id, ...c })
        perGroup[g.id].push({ file, collection: name, key: label(fields, k), change: c.change })
      }
    }
  }
  // Two ADDED records keyed by different alternatives (a page by `path`, another by `slug`) cannot be proved distinct, so they
  // are refused rather than guessed (give both the same identity field). Same-alternative and cross-record identity collisions
  // are caught on the merged collection below, against every unique identity.
  for (const [name, m] of touched) {
    const fields = collections[name]
    const entries = [...m].filter(([, list]) => list.length === 1).map(([k, list]) => ({ k, group: list[0].group, change: list[0].change, alt: JSON.parse(k)[0] }))
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]
        const b = entries[j]
        if (a.group !== b.group && a.change === 'added' && b.change === 'added' && a.alt !== b.alt)
          problems.push(conflict('record-conflict', `${file} ${name}: ${label(fields, a.k)} (group ${a.group}, ${a.change}) and ${label(fields, b.k)} (group ${b.group}, ${b.change}) are keyed by different identities (${describe([fields[a.alt]])} vs ${describe([fields[b.alt]])}): they cannot be proved distinct — give both the same identity field`, { groups: [a.group, b.group], file, collection: name, record: label(fields, a.k) }))
      }
  }
  for (const [name, m] of touched)
    for (const [k, list] of m)
      if (list.length > 1) problems.push(conflict('record-conflict', `${file} ${name} ${label(collections[name], k)}: touched by groups ${list.map((x) => `${x.group} (${x.change})`).join(' and ')}`, { groups: list.map((x) => x.group), file, collection: name, record: label(collections[name], k) }))
  if (problems.length) throw new MergeError(`${file}: ${problems.map((p) => p.message).join('; ')}`, problems)
  const out = structuredClone(base)
  for (const [name, m] of touched) {
    const fields = collections[name]
    const baseList = getPath(base, name) ?? []
    const next = []
    for (const rec of baseList) {
      const t = m.get(keyOf(rec, fields))?.[0]
      if (!t) next.push(structuredClone(rec))
      else if (t.change === 'changed') next.push(structuredClone(t.record))
    }
    for (const g of [...groups].sort((a, b) => (a.id < b.id ? -1 : 1)))
      for (const [k, list] of m) if (list[0].group === g.id && list[0].change === 'added') next.push(structuredClone(list[0].record))
    if (getPath(out, name) === undefined) {
      const parts = name.split('.')
      let o = out
      for (const p of parts.slice(0, -1)) o = o[p] ??= {}
    }
    // the complete result under every unique identity: an added record against another group's, against an unchanged one
    try {
      indexRecords(next, fields, `${file} ${name} (merged)`)
    } catch (e) {
      if (!(e instanceof MergeError)) throw e
      const gs = [...new Set([...m.values()].flatMap((l) => l.map((x) => x.group)))].sort()
      problems.push(...e.conflicts.map((c) => conflict('record-conflict', `${c.message} (changed by group${gs.length > 1 ? 's' : ''} ${gs.join(', ')})`, { groups: gs, file, collection: name })))
    }
    setPath(out, name, next)
  }
  if (problems.length) throw new MergeError(`${file}: ${problems.map((p) => p.message).join('; ')}`, problems)
  const { indent, newline } = indentOf(baseText)
  return { text: JSON.stringify(out, null, indent) + (newline ? '\n' : ''), perGroup }
}

// ───────────────────────────────────────────────────────────── plan
/**
 * Everything the merge would do, or a MergeError listing every refusal. No write happens here.
 * @param {{manifest: object, base: string, main: string, groups: Record<string,string>}} o  trees are directories
 * @returns {{ writes: Map<string, Buffer|null>, report: object }}   `writes`: main-relative path → new bytes (null = delete)
 */
export function planMerge({ manifest: rawManifest, base, main, groups }) {
  const manifest = loadManifest(rawManifest)
  const ids = Object.keys(groups)
  if (!ids.length) throw usageError('no --group: name every group to merge (a merge of nothing is not a merge)')
  for (const id of ids) if (!manifest.groups.has(id)) throw new MergeError(`group ${id}: not in the manifest's groups (${[...manifest.groups.keys()].join(', ')})`, [conflict('manifest', `group ${id} is not declared in the manifest`)])
  for (const [what, dir] of [['--base', base], ['--main', main], ...ids.map((id) => [`group ${id}`, groups[id]])]) {
    const st = lstatOrNull(dir)
    if (!st || !st.isDirectory()) throw usageError(`${what} ${dir}: not a directory`)
  }
  const problems = []
  const fileSet = (tree) => {
    const all = new Map()
    for (const r of manifest.roots) walk(tree, r, all)
    return all
  }
  const baseFiles = fileSet(base)
  const inputs = { base: inventory(baseFiles, 'baseline'), groups: {}, main: null }
  const records = [...manifest.records.keys()]
  const bytes = (map, rel, what) => (map.has(rel) ? readRegular(map.get(rel), `${what} ${rel}`) : null)
  const reportGroups = []
  const writes = new Map()
  const touchedRel = new Set()
  const changesByGroup = {}
  const recordGroups = new Map() // record file → [{ id, text }]
  for (const id of ids) {
    const files = fileSet(groups[id])
    inputs.groups[id] = inventory(files, `group ${id}`)
    const changed = []
    const names = new Set([...baseFiles.keys(), ...files.keys()])
    for (const rel of [...names].sort()) {
      const a = bytes(baseFiles, rel, 'baseline')
      const b = bytes(files, rel, `group ${id}`)
      if (a === null && b === null) continue
      if (a !== null && b !== null && a.equals(b)) continue
      changed.push({ rel, change: a === null ? 'added' : b === null ? 'deleted' : 'modified', content: b })
    }
    // a record file a group does not have at all is not a deletion: it is refused below with the rest of its rules
    changesByGroup[id] = changed
    const rg = { id, root: groups[id], changed: changed.length > 0, noop: changed.length === 0, files: [], records: [] }
    reportGroups.push(rg)
    for (const c of changed) {
      touchedRel.add(c.rel)
      if (manifest.records.has(c.rel)) {
        if (c.change !== 'modified') {
          problems.push(conflict('shared-changed', `${c.rel}: group ${id} ${c.change === 'added' ? 'added' : 'deleted'} a record file — records change inside it`, { groups: [id], file: c.rel }))
          continue
        }
        if (!recordGroups.has(c.rel)) recordGroups.set(c.rel, [])
        recordGroups.get(c.rel).push({ id, text: c.content.toString('utf8') })
        continue
      }
      const owner = ownerOf(manifest, c.rel)
      if (owner === id) rg.files.push({ path: c.rel, change: c.change })
      else if (isFrozen(manifest, c.rel)) problems.push(conflict('frozen-file', `${c.rel}: group ${id} changed a frozen shared file — ask the coordinator`, { groups: [id], file: c.rel }))
      else problems.push(conflict('unowned-file', `${c.rel}: group ${id} changed a file it does not own${owner ? ` (owned by ${owner})` : ' (no owner)'}`, { groups: [id], file: c.rel, owner }))
    }
  }
  // two groups changing one owned path is already an ownership problem (duplicate-owner at load); a file both changed unowned is reported per group above
  // baseline drift: for every file any group changed, main must still be the baseline
  const mainFiles = fileSet(main)
  inputs.main = inventory(mainFiles, 'main')
  for (const rel of [...touchedRel].sort()) {
    const a = bytes(baseFiles, rel, 'baseline')
    const m = bytes(mainFiles, rel, 'main')
    if ((a === null) !== (m === null) || (a !== null && !a.equals(m))) problems.push(conflict('baseline-drift', `${rel}: main is not the baseline any more (a merge already ran, or the file was edited) — rebase the groups on main`, { file: rel }))
  }
  // record files: main must equal the baseline too (checked above if touched); merge by id
  const recordReports = {}
  for (const [file, gs] of recordGroups) {
    try {
      const baseText = bytes(baseFiles, file, 'baseline')?.toString('utf8')
      if (baseText === undefined) throw new MergeError(`${file}: not in the baseline`, [conflict('manifest', `${file} is not in the baseline (roots: ${manifest.roots.join(', ')})`)])
      const r = mergeRecordFile({ file, collections: manifest.records.get(file), baseText, groups: gs })
      if (r.text !== baseText) writes.set(file, Buffer.from(r.text))
      for (const [id, list] of Object.entries(r.perGroup)) (recordReports[id] ??= []).push(...list)
    } catch (e) {
      if (!(e instanceof MergeError)) throw e
      problems.push(...e.conflicts)
    }
  }
  for (const rg of reportGroups) {
    rg.records = recordReports[rg.id] ?? []
    rg.changed = rg.files.length + rg.records.length > 0
    rg.noop = !rg.changed && !changesByGroup[rg.id].length
  }
  for (const rg of reportGroups) for (const f of rg.files) writes.set(f.path, f.change === 'deleted' ? null : changesByGroup[rg.id].find((c) => c.rel === f.path).content)
  const report = {
    schemaVersion: 1,
    tool: 'group-merge',
    status: problems.length ? 'refused' : 'merged',
    groups: reportGroups.map(({ id, changed, noop, files, records: recs }) => ({ id, changed, noop, files, records: recs })),
    noopGroups: reportGroups.filter((g) => g.noop).map((g) => g.id),
    conflicts: problems,
    files: [...writes.keys()].sort(),
    baseline: Object.fromEntries([...touchedRel].sort().map((rel) => [rel, bytes(baseFiles, rel, 'baseline') ? sha(bytes(baseFiles, rel, 'baseline')) : null]))
  }
  if (problems.length) throw Object.assign(new MergeError(`refused: ${problems.map((p) => `[${p.rule}] ${p.message}`).join('\n  ')}`, problems), { report })
  return { writes, report, manifest, inputs }
}

/** rel → sha of every regular file of a fileSet (a snapshot of what the plan was made from). */
function inventory(files, what) {
  return Object.fromEntries([...files].map(([rel, abs]) => [rel, sha(readRegular(abs, `${what} ${rel}`) ?? Buffer.alloc(0))]))
}
/** Compare two inventories; names every file that moved. */
function inventoryDrift(was, now, what) {
  return [...new Set([...Object.keys(was), ...Object.keys(now)])].sort().filter((rel) => was[rel] !== now[rel]).map((rel) => conflict('inputs-changed', `${what} ${rel} changed after the plan was read`, { file: rel }))
}

// ───────────────────────────────────────────────────────────── apply
/** The directory a file is written into: a real directory (never a symlink, never a file), created when absent. */
function safeParent(file, what) {
  const dir = path.dirname(file)
  const st = lstatOrNull(dir)
  if (!st) mkdirSync(dir, { recursive: true })
  else if (st.isSymbolicLink() || !st.isDirectory()) throw new MergeError(`${what}: ${dir} is ${st.isSymbolicLink() ? 'a symlink' : 'not a directory'}`, [conflict('unsafe-path', `${what}: the directory ${dir} is ${st.isSymbolicLink() ? 'a symlink' : 'not a directory'} — refused, never followed`)])
}
const writeAtomic = (file, data) => {
  safeParent(file, 'write')
  const at = lstatOrNull(file)
  if (at && !at.isFile()) throw new MergeError(`write ${file}: not a regular file`, [conflict('unsafe-path', `${file} is ${at.isSymbolicLink() ? 'a symlink' : 'not a regular file'} — never replaced`)])
  const tmp = `${file}.${process.pid}.tmp`
  rmSync(tmp, { force: true })
  writeFileSync(tmp, data, { flag: 'wx' })
  renameSync(tmp, file)
}

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const writeJournal = (dir, journal) => writeAtomic(path.join(dir, 'journal.json'), JSON.stringify(journal))

/** Undo this merge's report: the previous complete report comes back when there was one, else ours is removed. Never another merge's. */
function withdrawReport(journal, dir) {
  if (!journal.report) return
  const have = readRegular(journal.report, 'report')
  if (have === null) {
    if (journal.reportBackup) writeAtomic(journal.report, readRegular(path.join(dir, 'report.prev'), 'report.prev') ?? Buffer.alloc(0))
    return
  }
  let current
  try {
    current = JSON.parse(have.toString('utf8'))
  } catch {
    return
  }
  if (current?.mergeId !== journal.mergeId) return
  if (journal.reportBackup) writeAtomic(journal.report, readRegular(path.join(dir, 'report.prev'), 'report.prev') ?? Buffer.alloc(0))
  else rmSync(journal.report, { force: true })
}

/** The commit decision, read back from disk: this merge's own report is published (applied) at the path its journal names. */
function reportCommitted(journal) {
  if (!journal.report || typeof journal.mergeId !== 'string') return false
  try {
    const r = JSON.parse(readRegular(journal.report, 'report')?.toString('utf8') ?? 'null')
    return r?.applied === true && r.mergeId === journal.mergeId
  } catch {
    return false
  }
}

/** A complete (applied) merge report already sits at `file`: a refusal or a dry run must not replace it. */
function completeReportAt(file) {
  const have = readRegular(file, 'report')
  if (have === null) return false
  try {
    const r = JSON.parse(have.toString('utf8'))
    return r?.applied === true && typeof r.mergeId === 'string'
  } catch {
    return false
  }
}
/** Where a report that did not commit goes: the report path itself, or beside it when that holds an earlier complete merge. */
const uncommittedPath = (file) => (completeReportAt(file) ? `${file}.not-applied.json` : file)

/**
 * Take the exclusive right to recover `dir`: an atomic mkdir of `<dir>/recovering`. An existing claim is NEVER renamed or
 * taken over — not while its owner lives, and not when it is gone: a recovery that died half-way left main in a state only a
 * person can judge, so its journal and backups stay and the refusal says how to repair offline.
 */
function claimRecovery(dir) {
  const claim = path.join(dir, 'recovering')
  try {
    mkdirSync(claim)
    writeFileSync(path.join(claim, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
    return claim
  } catch (e) {
    if (e.code === 'ENOENT') throw usageError(`${dir}: the merge lock is gone — another recovery finished first, nothing to recover`)
    if (e.code !== 'EEXIST') throw e
  }
  let owner = null
  try {
    owner = JSON.parse(readRegular(path.join(claim, 'owner.json'), 'recovery claim')?.toString('utf8') ?? 'null')
  } catch {}
  const live = owner && alive(owner.pid)
  throw new MergeError(
    live
      ? `recovery of ${dir} is already running (pid ${owner.pid})`
      : `an earlier recovery of ${dir} was interrupted (claim ${claim}${owner ? `, pid ${owner.pid}` : ''}): the journal and backups are kept, and the claim is not taken over automatically — compare main with the backups in ${dir}, restore by hand, then remove ${dir}`,
    [conflict('locked', live ? `${dir} is being recovered by pid ${owner.pid}` : `${dir} holds the claim of an interrupted recovery: offline repair required`)]
  )
}

/**
 * Restore main from the backups a crashed merge left under `<main>/.group-merge`; returns the paths restored.
 * A merge that is still running owns the lock: its journal names its pid, and a live owner is never recovered (it would
 * revert files the merge then reports as merged). A journal of a finished merge only has its lock released. The report
 * of the half-done merge, if it was already published, is removed with it.
 */
export function recover(main) {
  const dir = path.join(main, LOCK_DIR)
  const journalFile = path.join(dir, 'journal.json')
  const dst = lstatOrNull(dir)
  if (!dst) throw usageError(`${main}: no ${LOCK_DIR} — there is nothing to recover`)
  if (!dst.isDirectory()) throw new MergeError(`${dir}: not a directory`, [conflict('unsafe-path', `${dir} is ${dst.isSymbolicLink() ? 'a symlink' : 'not a directory'} — recovery reads nothing through it`)])
  if (lstatOrNull(journalFile) === null) throw usageError(`${main}: no ${LOCK_DIR}/journal.json — there is nothing to recover (a lock with no journal is a merge that has just started or died before its first write: look at ${dir})`)
  const readJournal = () => {
    const j = JSON.parse(readRegular(journalFile, 'journal')?.toString('utf8') ?? 'null')
    // a journal is data a crash left behind: only the exact shape this tool writes is replayed (backup names are b<n>, in the lock)
    if (!j || typeof j !== 'object' || !Array.isArray(j.files) || j.files.some((e) => !e || typeof e.path !== 'string' || !(e.backup === null || (typeof e.backup === 'string' && /^b\d+$/.test(e.backup))))) throw new Error('not the journal this tool writes')
    return j
  }
  let journal
  try {
    journal = readJournal()
  } catch (e) {
    throw usageError(`${journalFile}: not readable (${e.message}) — the backups beside it are kept; restore by hand`)
  }
  if (journal.pid !== process.pid && alive(journal.pid)) throw new MergeError(`merge pid ${journal.pid} (started ${journal.at}) is still running and owns ${dir}: wait for it, or stop it and run --recover again`, [conflict('locked', `${dir} is owned by the running merge ${journal.pid}`)])
  // from here ONE recovery owns the journal; the claim lives inside the lock, so it goes with it when recovery is done
  const claim = claimRecovery(dir)
  try {
    // the journal as the claimant sees it: a recovery that finished between the read above and the claim removed it
    journal = readJournal()
  } catch (e) {
    rmSync(claim, { recursive: true, force: true })
    throw usageError(`${journalFile}: gone or unreadable after the claim (${e.message}) — another recovery finished first`)
  }
  const restored = []
  // the published report IS the commit: a journal that still says `writing` beside it only lost its lock release — the files stay
  if (journal.state !== 'complete' && !reportCommitted(journal)) {
    for (const e of journal.files) {
      const dest = inTree(main, e.path, 'journal')
      if (e.backup === null) rmSync(dest, { force: true })
      else writeAtomic(dest, readRegular(path.join(dir, e.backup), `backup ${e.backup}`) ?? (() => { throw new MergeError(`backup ${e.backup} of ${e.path} is missing — kept for a manual repair`) })())
      restored.push(e.path)
    }
    withdrawReport(journal, dir)
  }
  rmSync(dir, { recursive: true, force: true })
  return restored
}

/**
 * Write the plan into `main`, under a lock, from backups: any failure (or SIGINT/SIGTERM) restores every file. The lock
 * is held until `publish()` — the report — has been written, so recovery can never run beside a merge that goes on to
 * say "merged". When a rollback itself fails the lock, the journal and the backups STAY: `--recover` finishes the job.
 * `hooks.afterWrite(n, path)` lets a test fail the n-th write.
 */
export function acquireLock(main, { mergeId = null, report = null } = {}) {
  const dir = path.join(main, LOCK_DIR)
  try {
    mkdirSync(dir)
  } catch (e) {
    if (e.code === 'EEXIST') throw new MergeError(`${dir} exists: another merge is running, or one was interrupted — run --recover --main ${main} (a running merge is refused)`, [conflict('locked', `${dir} exists`)])
    throw e
  }
  const journal = { pid: process.pid, at: new Date().toISOString(), mergeId, report: report ? path.resolve(report) : null, state: 'planning', files: [] }
  try {
    writeJournal(dir, journal)
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
  return { dir, journal }
}

export function applyMerge({ writes, main, expect, publish = null, report = null, mergeId = null, hooks = {}, lock = null, verify = null }) {
  const { dir, journal } = lock ?? acquireLock(main, { mergeId, report })
  const done = []
  let finished = false
  let committed = false
  let kept = false
  const rollback = () => {
    for (const e of [...done].reverse()) {
      const dest = inTree(main, e.path, 'rollback')
      if (e.backup === null) rmSync(dest, { force: true })
      else writeAtomic(dest, readRegular(path.join(dir, e.backup), `backup ${e.backup}`) ?? (() => { throw new MergeError(`backup ${e.backup} of ${e.path} is missing`) })())
    }
    withdrawReport(journal, dir)
  }
  // roll back and release the lock; when the rollback fails, keep everything for --recover and say so
  const abandon = (cause) => {
    try {
      rollback()
    } catch (e) {
      kept = true
      try {
        writeJournal(dir, { ...journal, state: 'rollback-failed' })
      } catch {}
      throw new MergeError(`${cause ? `${cause.message}; ` : ''}rollback failed (${e.message}) — main may be half-merged: the lock, journal and backups are kept in ${dir}; run --recover --main ${main}`, [conflict('rollback-failed', `rollback failed: ${e.message}`)])
    } finally {
      finished = true
      if (!kept) rmSync(dir, { recursive: true, force: true })
    }
  }
  const onSignal = (sig) => {
    if (!finished && !committed) {
      try {
        abandon(null)
      } catch {}
    }
    process.exit(sig === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    journal.state = 'writing'
    writeJournal(dir, journal)
    // recheck under the lock: nothing moved since the plan was read
    verify?.('before-apply')
    for (const [rel, want] of Object.entries(expect ?? {})) {
      const have = readRegular(inTree(main, rel, 'main'), `main ${rel}`)
      if ((have === null ? null : sha(have)) !== want) throw new MergeError(`${rel}: main changed while the merge was planned`, [conflict('baseline-drift', `${rel}: main changed after the plan was read`, { file: rel })])
    }
    let n = 0
    for (const rel of [...writes.keys()].sort()) {
      const dest = inTree(main, rel, 'main')
      const before = readRegular(dest, `main ${rel}`)
      const entry = { path: rel, backup: before === null ? null : `b${journal.files.length}` }
      if (before !== null) writeFileSync(path.join(dir, entry.backup), before)
      journal.files.push(entry)
      writeJournal(dir, journal)
      done.push(entry)
      const bytesNew = writes.get(rel)
      if (bytesNew === null) rmSync(dest, { force: true })
      else writeAtomic(dest, bytesNew)
      hooks.afterWrite?.(++n, rel)
    }
    // COMMIT DECISION: the atomic rename that publishes the report. Before it every input and the written tree are rechecked,
    // and a failure undoes the files; after it the merge is merged. An earlier complete report at the path is kept in the
    // lock until then.
    verify?.('before-commit')
    if (journal.report) {
      const prev = readRegular(journal.report, 'report')
      if (prev !== null) {
        writeFileSync(path.join(dir, 'report.prev'), prev)
        journal.reportBackup = true
        writeJournal(dir, journal)
      }
    }
    hooks.beforePublish?.()
    publish?.()
    // the report is on disk: the merge IS merged, whatever happens to the lock now. Nothing below may undo the files.
    committed = true
    try {
      hooks.afterPublish?.()
      journal.state = 'complete'
      writeJournal(dir, journal)
      finished = true
      rmSync(dir, { recursive: true, force: true })
    } catch (e) {
      finished = true
      throw new MergeError(`the merge is committed (its report is published) but its lock could not be released (${e.message}): ${dir} is kept — run --recover --main ${main}, which only releases it`, [conflict('committed-lock-kept', `merge ${journal.mergeId} committed; lock ${dir} kept`)])
    }
  } catch (e) {
    if (committed || (e instanceof MergeError && e.conflicts?.some((c) => c.rule === 'rollback-failed'))) throw e
    if (!finished) abandon(e instanceof MergeError ? null : e)
    throw e
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

/**
 * The whole run: plan, apply (unless dry), report. Returns the report; throws MergeError (with `.report` when planned).
 * ONE owner from planning through report publication: the lock is taken before the plan is read and released only after the
 * report (applied, refused or dry) is on disk, or the files are rolled back — so no other merge, dry run, refusal or
 * recovery can interleave. `manifestFile` (optional) is rechecked by hash with the trees.
 */
export function runMerge({ manifest, manifestFile = null, base, main, groups, report: reportFile, dryRun = false, hooks = {} }) {
  if (!reportFile) throw usageError('--report <file> is required: the merge writes exactly one report')
  const reportAbs = path.resolve(reportFile)
  for (const tree of [base, main, ...Object.values(groups)]) if (reportAbs.startsWith(path.resolve(tree) + path.sep) && manifest.roots?.some?.((r) => reportAbs.startsWith(path.join(path.resolve(tree), r) + path.sep))) throw usageError(`--report ${reportFile} is inside a compared root: write it beside the dossier`)
  const mergeId = randomUUID()
  const stamp = { mergeId, startedAt: new Date().toISOString() }
  // the manifest the plan is made from is the very bytes hashed: a file edited since it was parsed is refused, never planned
  let manifestHash = null
  if (manifestFile) {
    const bytes = readRegular(manifestFile, '--manifest')
    if (bytes === null) throw usageError(`--manifest ${manifestFile}: no such file`)
    let parsed
    try {
      parsed = JSON.parse(bytes.toString('utf8'))
    } catch (e) {
      throw usageError(`--manifest ${manifestFile}: not JSON (${e.message})`)
    }
    if (!isDeepStrictEqual(parsed, manifest)) throw usageError(`--manifest ${manifestFile} changed after it was read — run the merge again`)
    manifestHash = sha(bytes)
  }
  readRegular(reportAbs, '--report')
  const reportDir = lstatOrNull(path.dirname(reportAbs))
  if (reportDir && (reportDir.isSymbolicLink() || !reportDir.isDirectory())) throw new MergeError(`--report ${reportFile}: its directory is ${reportDir.isSymbolicLink() ? 'a symlink' : 'not a directory'}`, [conflict('unsafe-path', `--report directory ${path.dirname(reportAbs)} is ${reportDir.isSymbolicLink() ? 'a symlink' : 'not a directory'} — nothing is written through it`)])
  const lock = acquireLock(main, { mergeId, report: reportAbs })
  let handedOver = false
  try {
    let plan
    try {
      plan = planMerge({ manifest, base, main, groups })
    } catch (e) {
      if (e instanceof MergeError && e.report) {
        const at = uncommittedPath(reportAbs)
        writeAtomic(at, JSON.stringify({ ...e.report, ...stamp, finishedAt: new Date().toISOString(), main: path.resolve(main), applied: false }, null, 2) + '\n')
        if (at !== reportAbs) e.message += ` (the refusal report is ${at}: ${reportAbs} still holds the earlier merge)`
      }
      throw e
    }
    const build = () => ({ ...plan.report, ...stamp, finishedAt: new Date().toISOString(), main: path.resolve(main), applied: !dryRun, dryRun })
    if (dryRun) {
      const report = build()
      writeAtomic(uncommittedPath(reportAbs), JSON.stringify(report, null, 2) + '\n')
      return report
    }
    // what the plan was made from, as the files are now: base, every group, the manifest and main (before the writes: as
    // planned; before the commit: as planned plus exactly the planned writes)
    const written = (map) => {
      const out = { ...map }
      for (const [rel, bytesNew] of plan.writes) if (bytesNew === null) delete out[rel]
        else out[rel] = sha(bytesNew)
      return out
    }
    const verify = (phase) => {
      const fileSet = (tree) => {
        const all = new Map()
        for (const r of plan.manifest.roots) walk(tree, r, all)
        return all
      }
      const drift = [
        ...(manifestHash !== null && sha(readRegular(manifestFile, '--manifest') ?? Buffer.alloc(0)) !== manifestHash ? [conflict('inputs-changed', `--manifest ${manifestFile} changed after the plan was read`)] : []),
        ...inventoryDrift(plan.inputs.base, inventory(fileSet(base), 'baseline'), 'baseline'),
        ...Object.entries(groups).flatMap(([id, tree]) => inventoryDrift(plan.inputs.groups[id], inventory(fileSet(tree), `group ${id}`), `group ${id}`)),
        ...inventoryDrift(phase === 'before-commit' ? written(plan.inputs.main) : plan.inputs.main, inventory(fileSet(main), 'main'), 'main')
      ]
      if (drift.length) throw new MergeError(`an input changed while the merge ran (${phase}): ${drift.map((d) => d.message).join('; ')}`, drift)
    }
    let report
    handedOver = true
    applyMerge({
      writes: plan.writes,
      main,
      expect: plan.report.baseline,
      mergeId,
      report: reportAbs,
      lock,
      verify,
      publish: () => {
        report = build()
        writeAtomic(reportAbs, JSON.stringify(report, null, 2) + '\n')
      },
      hooks
    })
    return report
  } finally {
    if (!handedOver) rmSync(lock.dir, { recursive: true, force: true })
  }
}

// ───────────────────────────────────────────────────────────── CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const USAGE = 'usage: group-merge.mjs --manifest ownership.json --base <baseline tree> --main <main tree> --group <id>=<tree> [--group …] --report <merge-report.json> [--dry-run]\n       group-merge.mjs --recover --main <main tree>'
  try {
    const argv = process.argv.slice(2)
    const flags = new Map()
    const groups = {}
    const VALUE = new Set(['--manifest', '--base', '--main', '--group', '--report'])
    const BOOL = new Set(['--dry-run', '--recover'])
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]
      if (BOOL.has(a)) {
        if (flags.has(a)) throw usageError(`${a} given twice\n${USAGE}`)
        flags.set(a, true)
      } else if (VALUE.has(a)) {
        const v = argv[++i]
        if (v === undefined || v.startsWith('--')) throw usageError(`${a} needs a value\n${USAGE}`)
        if (a === '--group') {
          const m = /^([^=]+)=(.+)$/.exec(v)
          if (!m || !GROUP_ID.test(m[1])) throw usageError(`--group ${v}: expected <id>=<tree> with an id of letters, digits, - and _\n${USAGE}`)
          if (Object.hasOwn(groups, m[1])) throw usageError(`--group ${m[1]} given twice`)
          groups[m[1]] = path.resolve(m[2])
        } else {
          if (flags.has(a)) throw usageError(`${a} given twice\n${USAGE}`)
          flags.set(a, v)
        }
      } else throw usageError(`unknown argument ${a}\n${USAGE}`)
    }
    if (flags.has('--recover')) {
      if (!flags.has('--main') || argv.length !== 3) throw usageError(USAGE)
      const restored = recover(path.resolve(flags.get('--main')))
      console.log(`group-merge: restored ${restored.length} file(s): ${restored.join(', ')}`)
      process.exit(0)
    }
    for (const r of ['--manifest', '--base', '--main', '--report']) if (!flags.has(r)) throw usageError(`${r} is required\n${USAGE}`)
    let manifest
    try {
      manifest = JSON.parse(readRegular(path.resolve(flags.get('--manifest')), '--manifest')?.toString('utf8') ?? (() => { throw usageError(`--manifest ${flags.get('--manifest')}: no such file`) })())
    } catch (e) {
      if (e instanceof MergeError) throw e
      throw usageError(`--manifest ${flags.get('--manifest')}: not JSON (${e.message})`)
    }
    const r = runMerge({ manifest, manifestFile: path.resolve(flags.get('--manifest')), base: path.resolve(flags.get('--base')), main: path.resolve(flags.get('--main')), groups, report: flags.get('--report'), dryRun: flags.has('--dry-run') })
    const n = (f) => r.groups.reduce((s, g) => s + g[f].length, 0)
    console.log(`group-merge: ${r.dryRun ? 'dry run — would merge' : 'merged'} ${r.groups.length} group(s): ${n('records')} record(s), ${n('files')} file(s)${r.noopGroups.length ? `; no-op: ${r.noopGroups.join(', ')}` : ''} → ${path.resolve(flags.get('--report'))}`)
    process.exit(0)
  } catch (e) {
    if (!(e instanceof MergeError)) {
      console.error(`group-merge: ${e.stack ?? e.message}`)
      process.exit(2)
    }
    console.error(`group-merge: ${e.message}`)
    process.exit(e.usage ? 2 : 1)
  }
}
