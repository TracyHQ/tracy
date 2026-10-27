/**
 * Reading a commit's tree, without checking it out and without ever running what is in it.
 *
 * 🔒 THE EXTRACTOR NEVER TOUCHES GIT. It is handed one of these readers, so the same extractor runs
 * over a real commit in the generator and over a hand-written fixture in a test, and the test can
 * therefore prove what the generator would do. It also means the extractor cannot be tricked into
 * reading outside the tree — there is no path into the filesystem from inside it.
 *
 * 🔒 AND IT NEVER IMPORTS FROM THE TREE. A snapshot is built by PARSING bytes, never by importing
 * a module out of the ref being read. Importing would execute code from a branch — including
 * branches nobody has reviewed — inside the process that builds what staff will read as fact.
 * Where a value is only knowable by running the real module (the stage arrays), the answer is a
 * narrow parser plus a parity test that runs the real module IN THIS repo and asserts the parser
 * agrees. That test is what makes the parser trustworthy; without it the parser is a guess.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Big enough for the largest file we read on purpose (a 1.1 MB presentation lock), and a ceiling. */
const MAX_BYTES = 8 * 1024 * 1024

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * A reader over one commit of one repository.
 *
 * @param {object} opts
 * @param {string} opts.repo - path to a checkout whose `.git` can answer for the ref.
 * @param {string} opts.sha - a resolved 40-character commit id. Resolved ONCE by the caller, so
 *   every section of a snapshot reads the same commit even if a branch moves mid-run.
 * @returns {{read: (path: string) => Promise<Buffer|null>, list: (dir: string) => Promise<string[]>,
 *   text: (path: string) => Promise<string|null>, json: (path: string) => Promise<unknown>}}
 */
export function gitTree({ repo, sha }) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`ops-cms: sha must be a full commit id, got ${sha}`)

  /** @type {Map<string, Buffer|null>} */
  const cache = new Map()

  async function read(path) {
    if (cache.has(path)) return cache.get(path) ?? null
    const out = await readOne(repo, sha, path)
    cache.set(path, out)
    return out
  }

  async function text(path) {
    const buf = await read(path)
    return buf === null ? null : buf.toString('utf8')
  }

  async function json(path) {
    const raw = await text(path)
    if (raw === null) return null
    return JSON.parse(raw)
  }

  /**
   * Names directly under `dir` (one level), as `git ls-tree` reports them.
   * @param {string} dir - repo-relative, no trailing slash needed.
   */
  async function list(dir) {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`
    try {
      const { stdout } = await run('git', ['-C', repo, 'ls-tree', '--name-only', sha, prefix], {
        maxBuffer: 4 * 1024 * 1024
      })
      return stdout.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  /** Every path under `dir`, recursively. Used to find contract profiles without guessing depth. */
  async function listAll(dir) {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`
    try {
      const { stdout } = await run('git', ['-C', repo, 'ls-tree', '-r', '--name-only', sha, prefix], {
        maxBuffer: 8 * 1024 * 1024
      })
      return stdout.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  return { read, text, json, list, listAll }
}

async function readOne(repo, sha, path) {
  try {
    const { stdout } = await run('git', ['-C', repo, 'cat-file', '-p', `${sha}:${path}`], {
      encoding: 'buffer',
      maxBuffer: MAX_BYTES
    })
    return stdout
  } catch {
    return null
  }
}

/**
 * A reader over a plain object — `{ 'path/to/file': 'contents' }`.
 *
 * This is what makes the extractor testable: a fixture tree is a literal, so a test can state
 * exactly what a ref contains and assert exactly what comes out, including the cases a real
 * repository will not conveniently have (a truncated JSON, a missing capability catalogue, a
 * stage array somebody reformatted).
 * @param {Record<string, string>} files
 */
export function objectTree(files) {
  const has = (p) => Object.hasOwn(files, p)
  return {
    async read(path) {
      return has(path) ? Buffer.from(files[path], 'utf8') : null
    },
    async text(path) {
      return has(path) ? files[path] : null
    },
    async json(path) {
      return has(path) ? JSON.parse(files[path]) : null
    },
    async list(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`
      const names = new Set()
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue
        const rest = p.slice(prefix.length)
        const head = rest.split('/')[0]
        names.add(rest.includes('/') ? `${prefix}${head}` : p)
      }
      return [...names].sort()
    },
    async listAll(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix))
        .sort()
    }
  }
}

/**
 * Resolve a ref to a full commit id, once.
 * @returns {Promise<string|null>} null when the ref does not exist here.
 */
export async function resolveRef(repo, ref) {
  try {
    const { stdout } = await run('git', ['-C', repo, 'rev-parse', '--verify', `${ref}^{commit}`])
    const sha = stdout.trim()
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null
  } catch {
    return null
  }
}

/** The commit's own timestamp, so a snapshot can say how old the configuration is. */
export async function commitDate(repo, sha) {
  try {
    const { stdout } = await run('git', ['-C', repo, 'show', '-s', '--format=%cI', sha])
    return stdout.trim() || null
  } catch {
    return null
  }
}
