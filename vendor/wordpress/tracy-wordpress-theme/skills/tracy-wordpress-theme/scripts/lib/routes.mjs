// Command-line inputs shared by the review tools (http-parity.mjs, review/functional.mjs,
// review/scan.mjs, review/editability.mjs): the --routes argument and the files a flag names.
//
// An input named on the command line that cannot be read is a usage error, not something to skip:
// a mistyped --accept path once dropped every written-down exception in silence and the run still
// looked judged (issue #7). `InputError` carries the message; `exitOnInputError` prints it and exits
// 2 — before the tool fetches anything.
//
// --routes is a page-map / routes JSON file or a comma-separated list of paths. A value that is an
// existing file is read as the file; a value ending in `.json`, or whose entries do not all start
// with `/`, is a file that is not there. `/` alone is the root route, never the file-system root.
import fs from 'node:fs'

export class InputError extends Error {}

export function exitOnInputError(fn) {
  try {
    return fn()
  } catch (e) {
    if (!(e instanceof InputError)) throw e
    console.error(e.message)
    process.exit(2)
  }
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** The value after `name`, undefined when the flag is absent; a flag with no value is an InputError. */
export function flagValue(args, name) {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) throw new InputError(`${name} needs a value`)
  return v
}

/** A file the flag names: undefined when absent, an InputError when named and not a file. */
export function inputFile(args, name) {
  const v = flagValue(args, name)
  if (v !== undefined && !isFile(v)) throw new InputError(`${name} ${v}: no such file`)
  return v
}

/** A directory the flag names: undefined when absent, an InputError when named and not a directory. */
export function inputDir(args, name) {
  const v = flagValue(args, name)
  if (v !== undefined && !isDir(v)) throw new InputError(`${name} ${v}: no such directory`)
  return v
}

/** { raw, json } of a JSON file a flag named; unreadable or invalid JSON is an InputError. */
export function readJsonInput(file, name) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (e) {
    throw new InputError(`${name} ${file}: ${e.message}`)
  }
  try {
    return { raw, json: JSON.parse(raw) }
  } catch (e) {
    throw new InputError(`${name} ${file}: not valid JSON (${e.message})`)
  }
}

/**
 * The status a page-map entry says its route answers: an explicit `status`, else 404 for the
 * `view: "404"` page (the port's error page answers 404 on purpose), else null — the tool's default.
 */
export function declaredStatus(entry) {
  if (entry.status != null) return Number(entry.status)
  return entry.view === '404' ? 404 : null
}

/**
 * The routes of a --routes value, in order, without duplicates: [{ path, status, view, synthetic }].
 * A page-map entry keeps its declared status (declaredStatus); a listed path has status null.
 */
export function readRoutes(spec, name = '--routes') {
  let list
  if (isFile(spec)) {
    const { json } = readJsonInput(spec, name)
    list = Array.isArray(json) ? json : (json.pages ?? json.routes)
    if (!Array.isArray(list)) throw new InputError(`${name} ${spec}: no pages[] or routes[] list`)
  } else {
    const parts = spec.split(',').filter(Boolean)
    if (/\.json$/i.test(spec) || !parts.length || parts.some((p) => !p.startsWith('/')))
      throw new InputError(`${name} ${spec}: no such file, and not a list of /paths`)
    list = parts
  }
  const seen = new Set()
  const out = []
  for (const r of list) {
    const entry = typeof r === 'string' ? { path: r } : { ...r, path: r.path ?? r.route }
    if (!entry.path || seen.has(entry.path)) continue
    seen.add(entry.path)
    out.push({ path: entry.path, status: declaredStatus(entry), view: entry.view ?? null, synthetic: !!entry.synthetic })
  }
  return out
}
