// Shared state of one gate run: the inputs, the list of rejected fields and the file helpers every section uses.
// The gate never touches a disk: `files` is whatever the caller reads the run's file folder with.
//   files.has(relativePath) -> boolean          the file exists in the run's file folder
//   files.read(relativePath) -> Promise<Buffer> its bytes
// Every path inside a brand file is relative to that folder (an absolute path or one that leaves the folder is
// rejected).
import { posix } from 'node:path'
import { computeNameSlots } from './name-slots.js'
import { kitId, sideText, templateGrounds } from './kit-grounds.js'

export const HEX = /^#[0-9a-f]{6}$/i

/** An in-memory file folder: entries is a Map or an object of relative path -> Buffer. */
export function memoryFiles(entries) {
  const map = entries instanceof Map ? entries : new Map(Object.entries(entries))
  const norm = (p) => posix.normalize(String(p))
  const byNorm = new Map([...map].map(([k, v]) => [norm(k), v]))
  return {
    has: (p) => byNorm.has(norm(p)),
    read: async (p) => {
      const v = byNorm.get(norm(p))
      if (v === undefined) throw new Error(`file not found: ${p}`)
      return v
    }
  }
}

const isAbsolutePath = (f) => /^([a-zA-Z]:)?[\\/]/.test(f)
export const normPath = (f) => posix.normalize(String(f).replace(/\\/g, '/'))
const leavesFolder = (n) => n === '..' || n.startsWith('../')

export function createContext({ brandFile, brief, kit, files }) {
  const errors = []
  const ctx = {
    b: brandFile,
    brief,
    K: kit,
    files,
    errors,
    spots: kit.site.logoSpots,
    opens: sideText(kit).opens,
    G: templateGrounds(kit),
    NS: computeNameSlots(kit, brief),
    kitId: kitId(kit),
    exact: brief?.brand?.name,
    pngs: [], // [field, file, mustBeTransparent]
    bad: (field, why) => errors.push({ field, why }),
    norm: normPath
  }
  /** A file field: a relative path inside the folder that exists. Returns true when usable. */
  ctx.fileOk = (field, f) => {
    if (typeof f !== 'string' || !f) return ctx.bad(field, 'missing file path'), false
    if (isAbsolutePath(f)) return ctx.bad(field, "must be relative to the brand file's folder"), false
    if (leavesFolder(normPath(f))) return ctx.bad(field, "must stay inside the brand file's folder"), false
    if (!files.has(normPath(f)))
      return ctx.bad(field, `file does not exist (resolved from the brand file's folder: ${f})`), false
    return true
  }
  ctx.png = (field, f, transparent = true) => {
    if (ctx.fileOk(field, f)) ctx.pngs.push([field, f, transparent])
  }
  ctx.same = (x, y) => typeof x === 'string' && typeof y === 'string' && normPath(x) === normPath(y)
  return ctx
}
