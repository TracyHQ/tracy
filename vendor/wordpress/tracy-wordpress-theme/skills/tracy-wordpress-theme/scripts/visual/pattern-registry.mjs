// Which pattern file a slug names: the file whose header REGISTERS it (`Slug: tracy/section-hero`), never
// the file name — a theme names files `acm-hero.php` and registers `section-hero`. One reader for the
// contract (parity pairs) and the page hash (theme files), so both look at the same file.
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const HEADER_BYTES = 4096
const MAX_FILE_BYTES = 4 * 1024 * 1024

/**
 * A regular file's whole content (at most `max` bytes), opened once without following a link or blocking on a
 * FIFO. The read is complete or it is an Error: a file that ends before its recorded size, grows past it, or
 * changes size or time while it is read was not read as one file. Throws naming `what`.
 */
export function readRegularFile(file, what = file, max = MAX_FILE_BYTES) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ELOOP') throw new Error(`${what}: ${file} is a link — read a regular file`)
    if (e.code === 'ENOENT') throw new Error(`${what}: ${file}: no such file`)
    if (e.code === 'ENXIO') throw new Error(`${what}: ${file} is not a regular file`)
    throw e
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error(`${what}: ${file} is not a regular file`)
    if (st.size > max) throw new Error(`${what}: ${file} is larger than ${max} bytes`)
    const buf = Buffer.alloc(st.size)
    let n = 0
    while (n < buf.length) {
      const r = readSync(fd, buf, n, buf.length - n, n)
      if (!r) break
      n += r
    }
    const after = fstatSync(fd)
    if (n !== st.size || after.size !== st.size || after.mtimeMs !== st.mtimeMs || readSync(fd, Buffer.alloc(1), 0, 1, n) !== 0) throw new Error(`${what}: ${file} changed while it was read`)
    return buf
  } finally {
    closeSync(fd)
  }
}

/**
 * A JSON evidence/input file through readRegularFile, parsed, and of the expected top-level shape (`kind`: 'object' — a plain
 * object, never null or an array — or 'array'). Every refusal is an Error naming `what`; `null`, a scalar or a wrong shape
 * is refused here, before any caller dereferences it.
 */
export function readJsonFile(file, what = file, { kind = 'object', max = MAX_FILE_BYTES } = {}) {
  const buf = readRegularFile(file, what, max)
  let json
  try {
    json = JSON.parse(buf.toString('utf8'))
  } catch (e) {
    throw new Error(`${what}: ${file} is not readable JSON (${e.message})`)
  }
  const ok = kind === 'array' ? Array.isArray(json) : json !== null && typeof json === 'object' && !Array.isArray(json)
  if (!ok) throw new Error(`${what}: ${file} must hold a JSON ${kind}`)
  return json
}

/** The `--patterns-map` of a run: `{ file, sha256, map }`, or null when the flag is absent. A valueless flag, a missing, linked, non-regular, oversized or malformed file is an Error. */
export function loadPatternsMap(value, flagPresent = value != null) {
  if (!flagPresent) return null
  if (!value || value.startsWith('--')) throw new Error('--patterns-map needs a file')
  const file = path.resolve(value)
  const buf = readRegularFile(file, '--patterns-map')
  let map
  try {
    map = JSON.parse(buf.toString('utf8'))
  } catch (e) {
    throw new Error(`--patterns-map ${file}: not readable JSON (${e.message})`)
  }
  if (!map || typeof map !== 'object' || Array.isArray(map) || !map.types || typeof map.types !== 'object') throw new Error(`--patterns-map ${file}: not a patterns map (no "types")`)
  return { file, sha256: createHash('sha256').update(buf).digest('hex'), map }
}

/** The content of a registered pattern file, read through a verified descriptor. */
export function readPatternFile(themeDir, name) {
  return readRegularFile(path.join(themeDir, 'patterns', name), `pattern ${name}`)
}

/** The first bytes of a regular file, opened once without following a link or blocking on a FIFO; null when it is not one. */
function readHeader(file) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ELOOP' || e.code === 'ENXIO') return null
    throw e
  }
  try {
    if (!fstatSync(fd).isFile()) return null
    const buf = Buffer.alloc(HEADER_BYTES)
    return buf.subarray(0, readSync(fd, buf, 0, HEADER_BYTES, 0)).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

const SLUG = /^[ \t/*#]*Slug:[ \t]*(\S+)[ \t]*$/m

/**
 * `Map<slug, [{ name, bytes }]>` of the `patterns/*.php` under `themeDir`: the slug is read from the header of
 * the very bytes returned, so the file that registered a slug is the content that is measured or hashed. A link
 * or non-file is not a pattern; a linked `patterns/` is refused; a file too large to read whole registers from
 * its header alone (`bytes` null — a caller that needs its content refuses it).
 */
export function patternSnapshot(themeDir) {
  const dir = path.join(themeDir, 'patterns')
  const snap = new Map()
  let names = []
  try {
    if (lstatSync(dir).isSymbolicLink()) throw new Error(`${dir} is a link — the patterns of a theme are read from a real directory`)
    names = readdirSync(dir).filter((n) => n.endsWith('.php')).sort()
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  for (const name of names) {
    const file = path.join(dir, name)
    let bytes = null
    let head
    try {
      bytes = readRegularFile(file, `pattern ${name}`)
      head = bytes.subarray(0, HEADER_BYTES).toString('utf8')
    } catch (e) {
      if (/is a link|not a regular file|no such file/.test(e.message)) continue
      if (!/larger than/.test(e.message)) throw e
      head = readHeader(file)
      if (head === null) continue
    }
    const m = SLUG.exec(head)
    if (m) snap.set(m[1], [...(snap.get(m[1]) ?? []), { name, bytes }])
  }
  return snap
}

/** `Map<slug, file names[]>` — the registrations of `patternSnapshot`. */
export function registeredPatterns(themeDir) {
  return new Map([...patternSnapshot(themeDir)].map(([slug, entries]) => [slug, entries.map((e) => e.name)]))
}

/** The entries registering `want` in a snapshot: exactly, or by last segment when `want` has no namespace. */
export function patternEntries(snapshot, want) {
  return snapshot.get(want) ?? (want.includes('/') ? [] : [...snapshot].filter(([k]) => k.split('/').pop() === want).flatMap(([, v]) => v))
}

/** The file names registering `want`: exactly, or by last segment when `want` has no namespace. */
export function patternHits(registered, want) {
  return registered.get(want) ?? (want.includes('/') ? [] : [...registered].filter(([k]) => k.split('/').pop() === want).flatMap(([, v]) => v))
}

/**
 * The pattern slugs a page's section types use, from `patterns.map.json`. A type the map does not declare, or
 * declares without a `pattern`, is returned in `unmapped` — never dropped: the page hash and the contract both
 * refuse it, so one section cannot leave its pattern out of the evidence.
 */
export function patternSlugsOf(sectionTypes, patternsMap) {
  const slugs = new Set()
  const unmapped = []
  for (const t of new Set(sectionTypes ?? [])) {
    const slug = patternsMap?.types?.[t]?.pattern
    if (slug) slugs.add(slug)
    else unmapped.push(String(t))
  }
  return { slugs: [...slugs], unmapped }
}
