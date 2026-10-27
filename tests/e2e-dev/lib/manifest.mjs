// What a run created on the dev host, written down BEFORE each request that creates it (plan §2
// D8). The file is the only list cleanup works from: a resource the manifest does not name is
// never touched, whatever its name looks like, and an `e2e*` prefix is not an allow-list.
//
// Every mutation reads the file, changes it and writes it back atomically. Journeys run one at a
// time in their own processes (node --test, concurrency 1), so read-modify-write is enough; no
// two writers are ever active at once.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

export const SCHEMA = 'e2e-dev/manifest@1'

/** States after which a resource needs nothing more. */
const SETTLED = new Set(['cleaned', 'kept', 'kept-no-door', 'never-created'])

/**
 * @typedef {{ kind: string, id: string, state: string, at: string, data?: Record<string, any>,
 *   history: { state: string, at: string, detail?: any }[] }} Resource
 * @typedef {{ schema: string, runId: string, pid: number, host: string, startedAt: string,
 *   finishedAt: string | null, resources: Resource[] }} ManifestFile
 */

function write(file, body) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  renameSync(tmp, file)
}

/** @returns {ManifestFile} */
function read(file) {
  const body = JSON.parse(readFileSync(file, 'utf8'))
  if (body?.schema !== SCHEMA) throw new Error(`${file} is not an ${SCHEMA} manifest`)
  return body
}

export class Manifest {
  /** @param {string} file */
  constructor(file) {
    this.file = file
  }

  /**
   * Start a new manifest for a run, in `<dir>/manifest.json`.
   * @param {string} dir
   * @param {string} runId
   * @param {{ pid?: number, now?: () => Date }} [opts]
   */
  static create(dir, runId, { pid = process.pid, now = () => new Date() } = {}) {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'manifest.json')
    if (existsSync(file)) throw new Error(`${file} already exists; pick another run id`)
    write(file, {
      schema: SCHEMA,
      runId,
      pid,
      host: hostname(),
      startedAt: now().toISOString(),
      finishedAt: null,
      resources: []
    })
    return new Manifest(file)
  }

  /** @param {string} dir */
  static open(dir) {
    const file = join(dir, 'manifest.json')
    read(file)
    return new Manifest(file)
  }

  /** @returns {ManifestFile} */
  read() {
    return read(this.file)
  }

  /**
   * Record the intent to create a resource. Call it BEFORE the request that creates it, so a
   * process that dies mid-request still leaves the name for the next run to clean up.
   * @param {string} kind - `site`, `account`, …
   * @param {string} id - what the cleanup door names it by (a site key, an email)
   * @param {Record<string, any>} [data]
   */
  intend(kind, id, data = {}) {
    const body = this.read()
    if (body.resources.some((r) => r.kind === kind && r.id === id))
      throw new Error(`manifest already names ${kind} ${id}`)
    const at = new Date().toISOString()
    body.resources.push({ kind, id, state: 'intended', at, data, history: [{ state: 'intended', at }] })
    write(this.file, body)
  }

  /**
   * Move a resource to a new state (`created`, `cleaned`, `kept`, `left`, `never-created`, …).
   * @param {string} kind
   * @param {string} id
   * @param {string} state
   * @param {any} [detail] - kept in the history; must already be free of secrets
   */
  mark(kind, id, state, detail) {
    const body = this.read()
    const r = body.resources.find((x) => x.kind === kind && x.id === id)
    if (!r) throw new Error(`manifest does not name ${kind} ${id}`)
    const at = new Date().toISOString()
    r.state = state
    r.at = at
    r.history.push({ state, at, ...(detail === undefined ? {} : { detail }) })
    write(this.file, body)
  }

  /** Resources that still need cleanup (not settled). */
  open() {
    return this.read().resources.filter((r) => !SETTLED.has(r.state))
  }

  /**
   * Clean every open resource with the cleaner for its kind. A cleaner returns `{ state, detail }`
   * (`cleaned`, `left`, `never-created`, `kept-no-door`) or throws; a throw leaves it `left`.
   * With `keep`, nothing is cleaned and every open resource is marked `kept`.
   * @param {Record<string, (r: Resource, run: { runId: string }) => Promise<{ state: string, detail?: any }>>} cleaners
   * @param {{ keep?: boolean, kinds?: string[] }} [opts] - `kinds` limits the pass to those kinds
   * @returns {Promise<Resource[]>} the resources as they stand afterwards
   */
  async cleanup(cleaners, { keep = false, kinds } = {}) {
    for (const r of this.open()) {
      if (kinds && !kinds.includes(r.kind)) continue
      if (keep) {
        this.mark(r.kind, r.id, 'kept')
        continue
      }
      const clean = cleaners[r.kind]
      if (!clean) {
        this.mark(r.kind, r.id, 'left', { reason: `no cleaner for kind ${r.kind}` })
        continue
      }
      try {
        const out = await clean(r, { runId: this.read().runId })
        this.mark(r.kind, r.id, out.state, out.detail)
      } catch (error) {
        this.mark(r.kind, r.id, 'left', { reason: error instanceof Error ? error.message : String(error) })
      }
    }
    return this.read().resources
  }

  /** The run is over: later runs no longer treat this manifest as abandoned. */
  finish() {
    const body = this.read()
    body.finishedAt = new Date().toISOString()
    write(this.file, body)
  }
}

/** Whether a process id is alive on this machine. */
export function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM'
  }
}

/**
 * Manifests under `root` whose run died: never finished, written on this machine, process gone,
 * and still naming open resources. Folders without a manifest of this schema are ignored (the
 * results root is shared with other tools).
 * @param {string} root
 * @param {{ isAlive?: (pid: number) => boolean, except?: string }} [opts]
 * @returns {Manifest[]}
 */
export function findAbandoned(root, { isAlive = pidAlive, except } = {}) {
  if (!existsSync(root)) return []
  const found = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === except) continue
    const file = join(root, entry.name, 'manifest.json')
    if (!existsSync(file)) continue
    let body
    try {
      body = read(file)
    } catch {
      continue
    }
    if (body.finishedAt !== null || body.host !== hostname() || isAlive(body.pid)) continue
    const m = new Manifest(file)
    if (m.open().length > 0) found.push(m)
  }
  return found
}
