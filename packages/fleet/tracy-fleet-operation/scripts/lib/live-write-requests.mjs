/** Durable request receipts: an unanswered mutation is never sent a second time. */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

export function durablePrivate(path, value) {
  const tmp = `${path}.tmp`
  const fd = openSync(tmp, 'w', 0o600)
  try {
    fchmodSync(fd, 0o600)
    writeFileSync(fd, JSON.stringify(value))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  const dir = openSync(dirname(path), 'r')
  try {
    fsyncSync(dir)
  } finally {
    closeSync(dir)
  }
}

export function mutation(action, params = {}) {
  return (
    !['core.manifest', 'info', 'content.get', 'file.read', 'template.files.status', 'apply.list'].includes(action) &&
    !(['site.identity', 'template.siteSettings'].includes(action) && params.operation !== 'set')
  )
}

export function writeRequests(pushDir, endpoint, name = 'requests.json') {
  const path = join(pushDir, name)
  const entries = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  return {
    entries,
    /** Writes the receipts as they now stand (`settleLost` changes them after asking the live site). */
    save() {
      durablePrivate(path, entries)
    },
    /**
     * `resendable`: the caller has just read the live site and found what this request would change
     * still as it was, and the request sets values rather than making a record (an Undo's own write):
     * sent again rather than refused, so an Undo cut by a proxy's 503 can finish once the site is back
     * (#227). A create is never resendable: sent twice, it makes two records.
     */
    async send(action, params, send, recovery = [], acknowledged = () => {}, { resendable = false } = {}) {
      const key = createHash('sha256')
        .update(JSON.stringify([endpoint, recovery.map((r) => r.item.id), action, params]))
        .digest('hex')
      const previous = entries[key]
      if (previous?.state === 'acknowledged') {
        acknowledged(previous)
        return previous.reply
      }
      if (previous?.state === 'sending' && !resendable) {
        const error = new Error('The previous request may have reached the live site; it was not sent again.')
        error.code = 'WRITE_OUTCOME_UNKNOWN'
        throw error
      }
      entries[key] = { state: 'sending', action, params, recovery }
      durablePrivate(path, entries)
      try {
        const reply = await send()
        entries[key] = { ...entries[key], state: 'acknowledged', reply }
        durablePrivate(path, entries)
        acknowledged(entries[key])
        return reply
      } catch (error) {
        // Only a structured refusal proves this request has an answer. A lost response, a
        // proxy's 5xx and a killed worker all retain the durable sending record.
        if (error.definitelyRefused) {
          entries[key] = { ...entries[key], state: 'refused' }
          durablePrivate(path, entries)
          // Turned away on its way to the engine: this write, not the site (live-write.mjs, #220).
          error.onWrite = true
        }
        if (!error.definitelyRefused) {
          const unknown = new Error('The request may have reached the live site; it was not sent again.')
          unknown.code = 'WRITE_OUTCOME_UNKNOWN'
          throw unknown
        }
        throw error
      }
    }
  }
}

/** An OS lock also covers two CLI processes and is released when a worker is killed. */
export async function lockWriter(pushDir) {
  const child = spawn(
    'python3',
    [
      '-c',
      'import fcntl,sys\nf=open(sys.argv[1],"a")\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(75)\nprint("locked",flush=True)\nsys.stdin.read()',
      join(pushDir, '.writer.lock')
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.stdout.once('data', () => resolve())
    child.once('close', (status) => {
      const error = new Error(
        status === 75 ? 'Another writer is using this push.' : 'The writer lock could not be acquired.'
      )
      error.code = status === 75 ? 'PUSH_BUSY' : 'WRITE_LOCK_FAILED'
      reject(error)
    })
  })
  return () =>
    new Promise((resolve) => {
      child.once('close', resolve)
      child.stdin.end()
    })
}
