// The picture manifest `site-pictures/1` (ADR 0043): the one place its shape is defined. The picture step writes it,
// the picture check grades it, and the mapping export and the write step read it. readPictures never throws: it returns
// the valid entries as a "view" and every problem it found, so one bad entry cannot hide or crash the rules.
import { paintKindOf, paintProblem } from './paint.js'
export const PICTURES_VERSION = 'site-pictures/1'

/** Where a frame's picture came from. */
export const SOURCES = Object.freeze([
  'owner-photo',
  'owner-photo-extended',
  'drawn',
  'icon',
  'initials',
  'hide',
  'twin'
])
/** The sources that place a brief photo of the owner (and name it in `asset`). */
export const OWNER_SOURCES = new Set(['owner-photo', 'owner-photo-extended'])
/** The roles whose prompt hashes the fingerprint records. */
export const PROMPT_ROLES = Object.freeze(['picker', 'drawing', 'looker'])
/** The folder of the site every placed picture is uploaded to, named by its sha256. */
export const SITE_FOLDER = 'images/tracy-content'

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isNonEmpty = (x) => typeof x === 'string' && x.trim() !== ''
const isSize = (x) => Number.isInteger(x) && x > 0
const isNumber = (x) => typeof x === 'number' && Number.isFinite(x)
const HEX64 = /^[0-9a-f]{64}$/

/** The site path a picture file must have: `images/tracy-content/<sha256>.<extension of the file>`. */
export function sitePathOf(file, sha256) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(file ?? ''))?.[1]?.toLowerCase() ?? ''
  return `${SITE_FOLDER}/${sha256}.${ext}`
}

// A placed file: path, pixel size, hash and the path it gets on the site. Returns the problem text, or null.
function fileProblem(f) {
  if (!isNonEmpty(f.file)) return 'file must be a non-empty path'
  if (!isSize(f.width) || !isSize(f.height)) return 'width and height must be positive integers'
  if (!HEX64.test(String(f.sha256 ?? ''))) return 'sha256 must be a 64 character hex string'
  if (!isNonEmpty(f.sitePath)) return 'sitePath must be a non-empty string'
  return null
}

const fileOf = (f) => ({
  file: f.file,
  width: f.width,
  height: f.height,
  sha256: f.sha256,
  sitePath: f.sitePath
})

// One entry of `frames` or `siteSettings`. Returns { entry } or { problem }.
function readEntry(e, list) {
  if (!isObject(e)) return { problem: 'entry is not an object' }
  if (!isNonEmpty(e.frame)) return { problem: 'frame must be a non-empty string' }
  const source = e.source
  if (!SOURCES.includes(source))
    return { problem: `source must be one of ${SOURCES.join(', ')}, found ${JSON.stringify(source)}` }
  if (list === 'siteSettings' && e.writeDoor !== 'none')
    return { problem: 'a siteSettings entry must say writeDoor "none"' }
  if (OWNER_SOURCES.has(source) && !isNonEmpty(e.asset))
    return { problem: `${source} needs the brief asset id in "asset"` }
  if (source === 'icon' && !(isObject(e.icon) && isNonEmpty(e.icon.light) && isNonEmpty(e.icon.dark)))
    return { problem: 'icon needs "icon": { light, dark } icon names' }
  if (source === 'icon' && !(isNonEmpty(e.icon.set) && isNonEmpty(e.icon.weight)))
    return {
      problem: 'icon needs "icon.set" (the icon set and its version) and "icon.weight" to be drawn again'
    }
  if (source === 'initials' && !isNonEmpty(e.letters)) return { problem: 'initials needs "letters"' }
  if (source === 'twin' && !isNonEmpty(e.twinOf)) return { problem: 'twin needs "twinOf", its source frame' }
  if (source === 'hide') {
    if (e.file != null) return { problem: 'a hidden frame has no file' }
  } else {
    const p = fileProblem(e)
    if (p) return { problem: p }
  }
  if (e.dark != null && (!isObject(e.dark) || fileProblem(e.dark)))
    return { problem: `dark: ${isObject(e.dark) ? fileProblem(e.dark) : 'must be an object or null'}` }
  if (
    e.crop != null &&
    !(isObject(e.crop) && ['x', 'y', 'width', 'height'].every((k) => isNumber(e.crop[k])))
  )
    return { problem: 'crop must be null or { x, y, width, height } on the original' }
  if (e.enlarge != null && !(isNumber(e.enlarge) && e.enlarge > 0))
    return { problem: 'enlarge must be null or a positive number' }
  if (e.sharpness != null && !(isObject(e.sharpness) && typeof e.sharpness.passed === 'boolean'))
    return { problem: 'sharpness must be null or { passed: boolean, ... }' }
  if (typeof e.darkened !== 'boolean') return { problem: 'darkened must be true or false' }
  // Initials and icons carry colour roles, never a colour, and their file is only a preview (paint.js); a twin of one
  // carries its source's recipe. No other picture is painted.
  const painted = source === 'initials' || source === 'icon' || (source === 'twin' && e.paint != null)
  if (painted) {
    const kind = source === 'twin' ? paintKindOf(e.paint) : source
    const p = paintProblem(e.paint, kind, { twin: source === 'twin' })
    if (p) return { problem: p }
    if (e.preview !== true)
      return { problem: 'a painted picture file is only a preview: "preview" must be true' }
  } else if (e.paint != null || e.preview != null)
    return { problem: `a ${source} picture has no paint recipe and no preview mark` }
  if (e.seen != null && typeof e.seen !== 'string') return { problem: 'seen must be a string or null' }
  if (typeof e.reason !== 'string') return { problem: 'reason must be a string' }
  return {
    entry: {
      list,
      frame: e.frame,
      source,
      asset: isNonEmpty(e.asset) ? e.asset : null,
      icon:
        source === 'icon'
          ? { light: e.icon.light, dark: e.icon.dark, set: e.icon.set, weight: e.icon.weight }
          : null,
      letters: source === 'initials' ? e.letters : null,
      twinOf: source === 'twin' ? e.twinOf : null,
      ...(source === 'hide'
        ? { file: null, width: null, height: null, sha256: null, sitePath: null }
        : fileOf(e)),
      dark: e.dark ? fileOf(e.dark) : null,
      crop: e.crop ?? null,
      enlarge: e.enlarge ?? null,
      sharpness: e.sharpness ?? null,
      darkened: e.darkened,
      paint: painted ? e.paint : null,
      preview: painted,
      seen: e.seen ?? null,
      reason: e.reason
    }
  }
}

/**
 * Reads a site-pictures/1 manifest. The view holds the valid entries of `frames` and `siteSettings` (in that order in
 * `entries`), `returns`, `altNotes` and `usage`; `problems` lists `{ where, detail }` for everything left out.
 */
export function readPictures(pictures) {
  const problems = []
  const view = { entries: [], returns: [], altNotes: [], usage: [] }
  const bad = (where, detail) => problems.push({ where, detail })
  if (!isObject(pictures)) {
    bad('file', 'the picture manifest is not a JSON object')
    return { view, problems }
  }
  if (pictures.version !== PICTURES_VERSION)
    bad('version', `version must be "${PICTURES_VERSION}", found ${JSON.stringify(pictures.version)}`)
  const fp = pictures.fingerprint
  if (!isObject(fp)) bad('fingerprint', 'fingerprint must be an object')
  else {
    if (!isNonEmpty(fp.kit)) bad('fingerprint.kit', 'kit must be a non-empty string')
    for (const key of ['planSha256', 'briefSha256'])
      if (!HEX64.test(String(fp[key] ?? '')))
        bad(`fingerprint.${key}`, `${key} must be a 64 character hex string`)
    for (const role of PROMPT_ROLES)
      if (!HEX64.test(String(fp.prompts?.[role] ?? '')))
        bad(`fingerprint.prompts.${role}`, `the ${role} prompt hash must be a 64 character hex string`)
  }
  const list = (key) => {
    if (Array.isArray(pictures[key])) return pictures[key]
    bad(key, `${key} must be a list`)
    return []
  }
  for (const key of ['frames', 'siteSettings'])
    list(key).forEach((e, i) => {
      const { entry, problem } = readEntry(e, key)
      if (entry) view.entries.push(entry)
      else bad(isNonEmpty(e?.frame) ? `${key} ${e.frame}` : `${key}[${i}]`, problem)
    })
  list('returns').forEach((r, i) => {
    if (isObject(r) && isNonEmpty(r.frame) && isNonEmpty(r.reason))
      view.returns.push({ frame: r.frame, reason: r.reason })
    else bad(`returns[${i}]`, 'returns entry needs a frame and a reason')
  })
  list('altNotes').forEach((n, i) => {
    const ok = isObject(n) && isNonEmpty(n.frame) && typeof n.alt === 'string' && typeof n.seen === 'string'
    if (ok) view.altNotes.push({ frame: n.frame, alt: n.alt, seen: n.seen })
    else bad(`altNotes[${i}]`, 'altNotes entry needs a frame, the writer alt and the seen sentence')
  })
  list('usage').forEach((u, i) => {
    if (isObject(u) && isNonEmpty(u.asset) && Number.isInteger(u.frames) && u.frames >= 0)
      view.usage.push({ asset: u.asset, frames: u.frames })
    else bad(`usage[${i}]`, 'usage entry needs an asset id and a frame count')
  })
  for (const key of ['cost', 'timing'])
    if (!isObject(pictures[key])) bad(key, `${key} must be an object keyed by role`)
  return { view, problems }
}
