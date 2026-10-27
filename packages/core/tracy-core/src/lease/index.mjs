/**
 * Long work tells the deploy it is running; the deploy tells long work to wait.
 *
 * WHY IT EXISTS (issue #83). One dsh serves every site on a host (ADR 0014), and every dsh-touching
 * push recreates it. An import runs for tens of minutes and its run state lives in this process, so
 * a deploy in the middle of one kills it — measured 14/09 on cowork.tracy.site, three dsh deploys in
 * fifty minutes. `deploy-host-dsh.sh` cannot ask a process that is about to be replaced, so the two
 * talk through files on `$DSH_HOME` (the host's `/desk-home` mount), which both sides can see:
 *
 *   - `leases/<id>.json` — one per piece of long work, rewritten every HEARTBEAT_MS while it runs and
 *     removed when it ends. The deploy waits until none is fresh. A lease whose heartbeat stopped is a
 *     process that already died, so the deploy ignores it rather than waiting on a corpse.
 *   - `draining` — written by the deploy while it waits. New long work is refused while it is fresh,
 *     otherwise a busy host never drains. A deploy killed before it removes the file must not block
 *     imports forever, so a file older than DRAIN_STALE_MS counts as absent.
 *
 * Generic on purpose: nothing here is about imports. Since 24/09 (#295) it lives in `@tracy/core`
 * so every kind of long work — an import (`tracy-add-site`), a build (`tracy-site-build-core`), a
 * chat turn — holds the same kind of lease, and the deploy waits for all of them with one loop.
 * `kind` and `sessionId` in the file are what the deploy log names. Never throws — a lease that
 * could not be written costs one wait, not the work itself.
 *
 * Host-side only: Node, no DOM. Each plugin bundles this into its own `lib/`.
 */

import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const HEARTBEAT_MS = 30_000
/** Must stay in step with `deploy-host-dsh.sh`, which reads the same files. */
export const DRAIN_STALE_MS = 60 * 60_000

function home() {
  return process.env.DSH_HOME ?? process.cwd()
}

/** Whether a deploy has asked long work to hold off. @param {number} [now] */
export function draining(now = Date.now()) {
  try {
    return now - statSync(path.join(home(), 'draining')).mtimeMs < DRAIN_STALE_MS
  } catch {
    return false
  }
}

/**
 * @param {string} id - unique per piece of work; it names the file.
 * @param {import('./index.d.mts').LeaseInfo} info
 * @returns {import('./index.d.mts').Lease}
 */
export function holdLease(id, info) {
  const dir = path.join(home(), 'leases')
  const file = path.join(dir, `${id}.json`)
  let current = { ...info }
  let released = false

  const write = () => {
    if (released) return
    try {
      mkdirSync(dir, { recursive: true })
      // Temp file + rename: the deploy reads these while they are being written.
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ id, ...current, heartbeatAt: new Date().toISOString() }))
      renameSync(tmp, file)
    } catch (error) {
      console.warn(
        `[lease] could not write ${file}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  write()
  const timer = setInterval(write, HEARTBEAT_MS)
  // A lease must never be the reason the process stays alive.
  timer.unref()

  return {
    update(patch) {
      current = { ...current, ...patch }
    },
    release() {
      if (released) return
      released = true
      clearInterval(timer)
      rmSync(file, { force: true })
    }
  }
}
