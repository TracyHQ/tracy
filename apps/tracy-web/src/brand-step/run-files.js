// The run folder of a brand run: every file a tool makes or reads. Two stores with the same shape:
//   memoryRunFiles(initial)  an in-memory folder (tests)
//   diskRunFiles(dir)        a folder on the server's disk (the bench)
// Shape (compatible with the gate's `files`, which reads with has and read):
//   has(path) -> boolean            the file exists
//   read(path) -> Buffer            its bytes (throws when missing)
//   write(nameHint, buffer) -> path writes a NEW file and returns its relative path. Tools never overwrite: when the
//                                   hint is taken the path gets ".vN" before its extension (logo.png -> logo.v2.png)
//   list(prefix?) -> string[]       every relative path that starts with the prefix, sorted
// Paths are relative, use "/" and stay inside the folder (an absolute path or ".." is refused).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** A clean relative path, or a thrown error for one that is absolute or leaves the folder. */
export function cleanPath(p) {
  const raw = String(p ?? '').replace(/\\/g, '/')
  const n = path.posix.normalize(raw)
  if (!raw || n === '.' || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n === '..' || n.startsWith('../'))
    throw new Error(`not a path inside the run folder: ${raw}`)
  return n
}

/** The hint with ".vN" before its extension. */
export function versioned(hint, n) {
  const ext = path.posix.extname(hint)
  return `${hint.slice(0, hint.length - ext.length)}.v${n}${ext}`
}

function store(backend) {
  const free = (hint) => {
    const clean = cleanPath(hint)
    if (!backend.has(clean)) return clean
    for (let n = 2; ; n++) if (!backend.has(versioned(clean, n))) return versioned(clean, n)
  }
  return {
    has: (p) => {
      try {
        return backend.has(cleanPath(p))
      } catch {
        return false
      }
    },
    read: (p) => {
      const clean = cleanPath(p)
      if (!backend.has(clean)) throw new Error(`file not found: ${clean}`)
      return backend.read(clean)
    },
    write: (nameHint, buffer) => {
      const target = free(nameHint)
      backend.write(target, Buffer.from(buffer))
      return target
    },
    list: (prefix = '') =>
      backend
        .list()
        .filter((f) => f.startsWith(prefix))
        .sort()
  }
}

/** An in-memory run folder; `initial` is an object or Map of relative path -> Buffer. */
export function memoryRunFiles(initial = {}) {
  const map = new Map()
  for (const [k, v] of initial instanceof Map ? initial : Object.entries(initial))
    map.set(cleanPath(k), Buffer.from(v))
  return store({
    has: (p) => map.has(p),
    read: (p) => map.get(p),
    write: (p, b) => void map.set(p, b),
    list: () => [...map.keys()]
  })
}

const walk = (root, rel = '') =>
  readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name
    return e.isDirectory() ? walk(root, r) : [r]
  })

/** A run folder on disk (created when missing). */
export function diskRunFiles(dir) {
  const root = path.resolve(dir)
  mkdirSync(root, { recursive: true })
  return store({
    has: (p) => existsSync(path.join(root, p)),
    read: (p) => readFileSync(path.join(root, p)),
    write: (p, b) => {
      mkdirSync(path.dirname(path.join(root, p)), { recursive: true })
      writeFileSync(path.join(root, p), b, { flag: 'wx' })
    },
    list: () => walk(root)
  })
}
