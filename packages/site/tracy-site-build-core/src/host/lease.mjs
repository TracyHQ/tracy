/** A host-local writer lease, with atomic publication and process-identity recovery. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

/** @param {unknown} error */
const code = (error) => (error instanceof Error && 'code' in error ? error.code : '')
/** The start time distinguishes PID 1 before and after a dsh container restart. @param {number} pid */
function identity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return `${readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
  } catch {
    try {
      return (
        execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim() || null
      )
    } catch {
      return null
    }
  }
}
const birth = identity(process.pid)
/** @param {string} root @param {string | undefined} site */
function directory(root, site) {
  const key = createHash('sha256')
    .update(site || path.resolve(root))
    .digest('hex')
  return path.join(process.env.DSH_HOME || root, 'docs/agents/build/leases', key)
}
/** @param {string} dir */
function ownerOf(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8'))
  } catch {
    return null
  }
}
/** @param {{pid: number, birth?: string}} owner */
function alive(owner) {
  try {
    process.kill(owner.pid, 0)
  } catch (error) {
    return code(error) !== 'ESRCH'
  }
  const actual = identity(owner.pid)
  return !owner.birth || !actual || owner.birth === actual
}
/** @param {string} root @param {string | undefined} site */
export function leaseHeld(root, site) {
  const owner = ownerOf(directory(root, site))
  return owner ? alive(owner) : false
}

/** The recovery lock uses the same protocol, so a crash during takeover is recoverable too.
 * @param {string} dir @param {string} root @returns {(() => void) | null} */
function claim(dir, root) {
  const token = randomUUID()
  const prepared = `${dir}.claim-${token}`
  try {
    mkdirSync(prepared, { mode: 0o700 })
    writeFileSync(
      path.join(prepared, 'owner.json'),
      JSON.stringify({ pid: process.pid, birth, token, root }),
      { mode: 0o600 }
    )
    renameSync(prepared, dir)
    return () => {
      if (ownerOf(dir)?.token === token) rmSync(dir, { recursive: true })
    }
  } catch (error) {
    rmSync(prepared, { recursive: true, force: true })
    if (code(error) === 'ENOENT') return null
    if (!['EEXIST', 'ENOTEMPTY'].includes(String(code(error)))) throw error
  }
  const old = ownerOf(dir)
  if (!old || alive(old)) return null
  const unlock = claim(path.join(dir, 'recover'), root)
  if (!unlock) return null
  // Another contender may have retired the old directory before we claimed recovery.
  if (ownerOf(dir)?.token !== old.token) {
    unlock()
    return null
  }
  const retired = `${dir}.retired-${token}`
  renameSync(dir, retired)
  rmSync(retired, { recursive: true })
  return claim(dir, root)
}

/** @param {string} root @param {string | undefined} site @returns {(() => void) | null} */
export function acquireLease(root, site) {
  const dir = directory(root, site)
  mkdirSync(path.dirname(dir), { recursive: true })
  return claim(dir, root)
}
