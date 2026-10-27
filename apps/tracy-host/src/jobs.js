/**
 * A job's whole life on disk: one JSON file per job, in a directory the caller owns (`jobsDir`
 * from config.js in production, a throwaway temp dir in tests). Not a database — the only reader
 * is `GET /_host/jobs/:id` asking "how far along", and the only writer is the background task
 * doing the work (`provision.js`) — and a file survives this process being restarted mid-job,
 * which is exactly when someone asks.
 *
 * Ported from `tracy-hooks.contabo.py`'s `write_job`/`read_job` (py:55-79). One thing carried
 * over on purpose: the write is ATOMIC — write to a temp file, then `rename` over the real one.
 * A job is written from a background task while a GET may land at any moment; without the
 * rename, a reader could open the file mid-write and either throw on a truncated JSON parse or,
 * worse, read a document that is half old fields and half new ones. `rename` on the same
 * filesystem is a single directory-entry swap, so a reader only ever sees the file fully-before
 * or fully-after, never in between.
 */
import { lstat, mkdir, open, readdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

/**
 * An id names one file in `dir` and nothing else: never a separator, never `.`/`..`, never empty.
 * The route checks the id's shape first; this is the store's own fence, so no caller can walk a
 * read or a write out of the jobs directory (`GET /_host/jobs/..%2Fsecret`, QA run 20/10/2026).
 * @param {string} id
 */
function ownName(id) {
  const name = String(id)
  if (
    name === '' ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  )
    throw new Error(`not a job id: ${name.slice(0, 40)}`)
  return name
}

function jobPath(dir, id) {
  return path.join(dir, `${ownName(id)}.json`)
}

/**
 * @param {string} dir - the jobs directory.
 * @param {string} id - the job id.
 * @returns {Promise<object|null>} the job record, or null when it doesn't exist yet, or its file
 *   can't be parsed (a partial write somehow reached disk, or the id is simply unknown) — both
 *   read the same way to a poller: "not there (yet)".
 */
export async function readJob(dir, id) {
  try {
    return JSON.parse(await readFile(jobPath(dir, id), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Merge `fields` into a job record, creating it (with `id` and `createdAt`) on the first call for
 * that id, and stamping a fresh `updatedAt` every time.
 *
 * @param {string} dir - the jobs directory (created if it doesn't exist yet).
 * @param {string} id - the job id.
 * @param {object} fields - fields to merge into the record, e.g. `{state: 'running', step: '…'}`.
 * @returns {Promise<object>} the full record after the merge.
 */
export async function putJob(dir, id, fields) {
  await mkdir(dir, { recursive: true })
  const current = (await readJob(dir, id)) ?? { id, createdAt: Date.now() }
  const next = { ...current, ...fields, updatedAt: Date.now() }
  const target = jobPath(dir, id)
  // Unique per call, not a fixed `${target}.tmp`: two `putJob` calls racing the SAME id would
  // otherwise both write into (and rename away from) one shared temp path, and whichever renames
  // second finds the file already gone (ENOENT) — measured in this file's own test. The rename
  // itself is still what makes a single write atomic to a reader; the random suffix only keeps
  // two concurrent writers from stepping on each other's temp file.
  const tmp = `${target}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(next))
  await rename(tmp, target) // atomic on the same filesystem — no reader ever sees a partial file
  return next
}

function acceptedPath(dir, id) {
  return path.join(dir, `${ownName(id)}.accepted`)
}

/** What a directory `fsync` answers on a filesystem that has none: the marker's own sync still held. */
const NO_DIR_SYNC = new Set(['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EBADF'])

/**
 * Leave the durable mark that this host TOOK the job named `id` — `<dir>/<id>.accepted`, beside the
 * job's record and apart from it. The record says how far the job got and is rewritten all through
 * the run; it can be deleted, half-written or unreadable, and `readJob` answers null for all three.
 * The mark is written once, before anything is started, and only ever answers one question: was
 * this id ever taken here. A caller asking again for a job whose record is gone is then told
 * "taken, outcome unknown" — never "nothing ever ran".
 *
 * Synced to disk (the file, then its directory entry) before this returns, so a host that loses
 * power right after answering 202 still has it. Throws when it cannot be written or synced: the
 * caller must then take nothing.
 *
 * @param {string} dir - the jobs directory (created if it doesn't exist yet).
 * @param {string} id - the job id.
 * @returns {Promise<void>}
 */
export async function acceptJob(dir, id) {
  await mkdir(dir, { recursive: true })
  const target = acceptedPath(dir, id)
  const tmp = `${target}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  const file = await open(tmp, 'wx')
  try {
    await file.writeFile(JSON.stringify({ id, acceptedAt: Date.now() }))
    await file.sync()
  } catch (error) {
    await file.close().catch(() => {})
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
  await file.close()
  try {
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
  const folder = await open(dir, 'r')
  try {
    await folder.sync()
  } catch (error) {
    if (!NO_DIR_SYNC.has(error?.code)) throw error
  } finally {
    await folder.close()
  }
}

/**
 * Whether this host ever took the job named `id` (`acceptJob`).
 *
 * 🔒 THREE ANSWERS, AND ONLY ONE OF THEM IS "NO". `false` is returned for exactly one finding: the
 * mark's path does not exist (`ENOENT`). Anything else that keeps the mark from being read — a
 * directory that cannot be searched, an I/O error, something under the mark's name that is not a
 * regular file — THROWS, because "could not look" must never read as "never taken".
 *
 * @param {string} dir - the jobs directory.
 * @param {string} id - the job id.
 * @returns {Promise<boolean>}
 */
export async function jobAccepted(dir, id) {
  let found
  try {
    found = await lstat(acceptedPath(dir, id))
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  if (!found.isFile()) throw new Error(`the acceptance mark of job ${id} is not a regular file`)
  return true
}

/**
 * Every job still `queued` or `running` when this process starts was killed with the previous one:
 * `provision.sh` is a child of tracy-host, and a container restart takes the child with it. Left
 * alone, such a job reads as "running" forever — a screen polling it spins for hours and nothing
 * ever says the truth (measured 16/09 on dev: a demo stuck 2h at "docker build" after a deploy).
 * Mark them failed, with the reason, so the poll answers and a redeploy is allowed to start.
 * @returns {Promise<string[]>} the ids that were marked
 */
export async function orphanJobs(dir, { now = Date.now() } = {}) {
  let files
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const marked = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const id = file.slice(0, -'.json'.length)
    const job = await readJob(dir, id)
    if (!job || !['queued', 'running'].includes(job.state)) continue
    await putJob(dir, id, {
      state: 'failed',
      detail: `tracy-host restarted before this job finished (was ${job.state} at "${job.step ?? '?'}")`,
      orphanedAt: now
    })
    marked.push(id)
  }
  return marked
}

/**
 * The marker a deploy leaves in the jobs directory while it waits to replace this container, named
 * like dsh's own (`$DSH_HOME/draining`, `deploy-host-dsh.sh` §2b).
 *
 * 🔒 WITHOUT IT THE WAIT HAS A HOLE AT THE END. `deploy-tracy-stack.sh` §3b waits until no job is
 * queued or running and then runs `up -d`; a site pressed in the seconds between its last look and
 * the replace starts a `provision.sh` that the replace kills, and the customer reads "Your site could
 * not be finished" for a site nobody touched (#295). With the marker, that press is refused up front
 * (`HOST_UPDATING`, which tracy-web turns into "press again in a few minutes") and nothing is lost.
 *
 * A deploy that dies without removing it must not block every new site for good, so the marker
 * carries its own end (`until`, epoch ms, written by the deploy from its drain timeout) and is never
 * honoured for longer than DRAINING_MAX_MS after it was written, whatever it says.
 */
export const DRAINING_FILE = 'draining'
const DRAINING_MAX_MS = 60 * 60_000

/**
 * @param {string | undefined} dir - the jobs directory.
 * @returns {Promise<boolean>} whether a deploy has asked this host to start no new job.
 */
export async function draining(dir, { now = Date.now() } = {}) {
  if (!dir) return false
  const file = path.join(dir, DRAINING_FILE)
  let written
  try {
    written = (await stat(file)).mtimeMs
  } catch {
    return false
  }
  if (now - written >= DRAINING_MAX_MS) return false
  try {
    const { until } = JSON.parse(await readFile(file, 'utf8'))
    return typeof until !== 'number' || now < until
  } catch {
    // Written by hand or half-read: the age bound above still ends it.
    return true
  }
}

/**
 * Removed at boot: a new process means the deploy that wrote the marker has already replaced the
 * container it was protecting, so from here on it only blocks new sites for nothing.
 * @returns {Promise<boolean>} whether there was one
 */
export async function clearDraining(dir) {
  if (!dir) return false
  const file = path.join(dir, DRAINING_FILE)
  try {
    await stat(file)
  } catch {
    return false
  }
  await rm(file, { force: true })
  return true
}
