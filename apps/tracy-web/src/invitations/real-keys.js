import { randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_RETENTION_MS = 365 * 86400000
const FILE_FLAGS = constants.O_NOFOLLOW | constants.O_NONBLOCK

function refuse(code = 'REAL_KEY_UNAVAILABLE') {
  return Object.assign(new Error('Campaign encryption is unavailable'), { code })
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw refuse('REAL_INVALID_TIME')
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw refuse('REAL_INVALID_TIME')
  return ms
}

function identifier(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw refuse('REAL_INVALID_ID')
  return value
}

function privateStat(stat, directory = false) {
  if (
    (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
    (stat.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (typeof process.getuid === 'function' && stat.uid !== process.getuid())
  )
    throw refuse()
}

async function directory(path) {
  privateStat(await lstat(path), true)
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** No path component may redirect key IO, including ancestors of the configured root. */
async function prepareRoot(root) {
  const parts = root.slice(parse(root).root.length).split('/')
  let path = parse(root).root
  for (const part of parts) {
    path = join(path, part)
    if (path === root) {
      try {
        await mkdir(path, { mode: 0o700 })
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
    }
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw refuse()
  }
  await directory(root)
}

async function readJson(path) {
  const before = await lstat(path)
  privateStat(before)
  const handle = await open(path, constants.O_RDONLY | FILE_FLAGS)
  try {
    const stat = await handle.stat()
    privateStat(stat)
    if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size > 4096) throw refuse()
    const bytes = Buffer.alloc(4097)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 4096) throw refuse()
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
  } finally {
    await handle.close()
  }
}

async function atomicJson(dir, name, value) {
  const temp = join(dir, `${name}.${randomUUID()}.tmp`)
  const handle = await open(
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | FILE_FLAGS,
    0o600
  )
  try {
    await handle.writeFile(JSON.stringify(value))
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    // Never follow/overwrite a symlink or an unexpected destination file.
    try {
      privateStat(await lstat(join(dir, name)))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await rename(temp, join(dir, name))
    await syncDirectory(dir)
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

function ledgerData(value, campaignId) {
  if (
    !value ||
    value.v !== 1 ||
    value.campaignId !== campaignId ||
    !['active', 'revoked'].includes(value.state)
  )
    throw refuse()
  if (value.state === 'revoked') {
    timestamp(value.revokedAt)
    return value
  }
  const first = timestamp(value.initialImportedAt)
  const expiry = timestamp(value.expiresAt)
  if (expiry <= first || expiry > first + MAX_RETENTION_MS) throw refuse()
  return value
}

function keyBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw refuse()
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) throw refuse()
  return bytes
}

function temporaryFile(name) {
  const prefix = name.startsWith('key.json.')
    ? 'key.json.'
    : name.startsWith('ledger.json.')
      ? 'ledger.json.'
      : null
  return prefix && name.endsWith('.tmp') && UUID.test(name.slice(prefix.length, -4))
}

// One id per process run. A lock names the run that took it, so a later run of the same process
// (same pid after a container restart) can tell that lock is not its own.
const BOOT = randomUUID()

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** A lock is provably abandoned only when it was taken on this host by a run that is gone: a
 * different run of this pid, or a pid that no longer exists. Anything else (another host, an
 * unreadable or empty owner, a live process) stays held: an operator decides, by the runbook in
 * SYSTEM.md. There is no removal by age. */
export function abandonedLock(
  owner,
  { host = hostname(), pid = process.pid, boot = BOOT, alive = processAlive } = {}
) {
  return Boolean(
    owner &&
      owner.v === 1 &&
      owner.host === host &&
      typeof owner.boot === 'string' &&
      owner.boot !== boot &&
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      (owner.pid === pid || !alive(owner.pid))
  )
}

/** This vault is deliberately outside the database and its backups. No recovery of missing files
 * and no lock removal by age: a crash can deny access, but cannot create a new key for old
 * ciphertext. A lock is cleared only when abandonedLock proves its owner is gone. */
export function createCampaignKeyStore({ root, onAbandonedLock = () => {} }) {
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || root === parse(root).root)
    throw refuse('REAL_INVALID_ROOT')
  // Same-process callers queue per campaign, so only other processes ever contend for the file.
  const queues = new Map()
  let active = 0
  const idle = new Set()

  async function readOwner(lockPath) {
    try {
      return JSON.parse(await readFile(lockPath, { encoding: 'utf8', flag: constants.O_RDONLY | FILE_FLAGS }))
    } catch {
      return null
    }
  }

  async function acquire(campaignId) {
    const lockPath = join(root, `${campaignId}.lock`)
    for (let attempt = 0; ; attempt++) {
      try {
        const lock = await open(
          lockPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | FILE_FLAGS,
          0o600
        )
        await lock.writeFile(
          JSON.stringify({
            v: 1,
            host: hostname(),
            pid: process.pid,
            boot: BOOT,
            at: new Date().toISOString()
          })
        )
        await lock.datasync()
        return { lock, lockPath }
      } catch (error) {
        if (error.code !== 'EEXIST') throw refuse()
        privateStat(await lstat(lockPath))
        const owner = await readOwner(lockPath)
        if (abandonedLock(owner)) {
          // Rename, not unlink: the evidence stays beside the vault for the operator.
          try {
            await rename(lockPath, join(root, `${campaignId}.lock.abandoned-${randomUUID()}`))
            await syncDirectory(root)
            onAbandonedLock({ campaignId, owner })
          } catch (renameError) {
            if (renameError.code !== 'ENOENT') throw refuse()
          }
          continue
        }
        if (attempt >= 100) throw refuse('REAL_KEY_BUSY')
        await delay(10)
      }
    }
  }

  async function locked(campaignId, fn) {
    identifier(campaignId)
    await prepareRoot(root)
    const previous = queues.get(campaignId) ?? Promise.resolve()
    let release
    const mine = new Promise((r) => {
      release = r
    })
    const tail = previous.then(() => mine)
    queues.set(campaignId, tail)
    await previous
    active++
    try {
      const { lock, lockPath } = await acquire(campaignId)
      try {
        return await fn(join(root, campaignId))
      } catch (error) {
        if (typeof error.code === 'string' && error.code.startsWith('REAL_')) throw error
        throw refuse()
      } finally {
        await lock.close()
        await unlink(lockPath)
        await syncDirectory(root)
      }
    } finally {
      active--
      release()
      if (queues.get(campaignId) === tail) queues.delete(campaignId)
      if (!active) for (const done of idle) done()
    }
  }

  /** Wait until no vault operation holds a lock, at most `ms`; true when idle. Shutdown calls it
   * so a deploy does not kill the process between taking and releasing a lock. */
  function drain(ms = 8000) {
    if (!active) return Promise.resolve(true)
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        idle.delete(done)
        resolve(true)
      }
      const timer = setTimeout(() => {
        idle.delete(done)
        resolve(false)
      }, ms)
      idle.add(done)
    })
  }

  async function getLedger(dir, campaignId) {
    await directory(dir)
    return ledgerData(await readJson(join(dir, 'ledger.json')), campaignId)
  }

  async function revokeFiles(dir, campaignId, now) {
    await atomicJson(dir, 'ledger.json', { v: 1, campaignId, state: 'revoked', revokedAt: now })
    // A durable tombstone precedes erasure; interruption at either point stays closed.
    try {
      await unlink(join(dir, 'key.json'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    for (const name of await readdir(dir)) {
      if (temporaryFile(name)) {
        privateStat(await lstat(join(dir, name)))
        await unlink(join(dir, name))
      }
    }
    await syncDirectory(dir)
  }

  async function activeLedger(dir, campaignId, now) {
    const ledger = await getLedger(dir, campaignId)
    if (ledger.state !== 'active') throw refuse('REAL_EXPIRED')
    if (timestamp(now) >= timestamp(ledger.expiresAt)) {
      await revokeFiles(dir, campaignId, now)
      throw refuse('REAL_EXPIRED')
    }
    return ledger
  }

  return {
    drain,
    async create({ campaignId, expiresAt, initialImportedAt, now }) {
      const clock = timestamp(now)
      const first = timestamp(initialImportedAt)
      const expiry = timestamp(expiresAt)
      if (first > clock || expiry <= clock || expiry > first + MAX_RETENTION_MS)
        throw refuse('REAL_INVALID_TIME')
      return locked(campaignId, async (dir) => {
        await mkdir(dir, { mode: 0o700 })
        await syncDirectory(root)
        // An incomplete create keeps its UUID reserved permanently (fail closed).
        await atomicJson(dir, 'ledger.json', {
          v: 1,
          campaignId,
          state: 'active',
          initialImportedAt,
          expiresAt
        })
        await atomicJson(dir, 'key.json', {
          v: 1,
          campaignId,
          key: randomBytes(32).toString('base64url'),
          indexKey: randomBytes(32).toString('base64url')
        })
      })
    },
    async read({ campaignId, now }) {
      timestamp(now)
      return locked(campaignId, async (dir) => {
        const ledger = await activeLedger(dir, campaignId, now)
        const stored = await readJson(join(dir, 'key.json'))
        if (stored.v !== 1 || stored.campaignId !== campaignId) throw refuse()
        const key = keyBytes(stored.key)
        const indexKey = keyBytes(stored.indexKey)
        if (key.equals(indexKey)) throw refuse()
        return { key, indexKey, expiresAt: ledger.expiresAt }
      })
    },
    async extend({ campaignId, expiresAt, now }) {
      timestamp(now)
      const expiry = timestamp(expiresAt)
      return locked(campaignId, async (dir) => {
        const ledger = await activeLedger(dir, campaignId, now)
        if (
          expiry <= timestamp(ledger.expiresAt) ||
          expiry > timestamp(ledger.initialImportedAt) + MAX_RETENTION_MS
        )
          throw refuse('REAL_INVALID_TIME')
        await atomicJson(dir, 'ledger.json', { ...ledger, expiresAt })
      })
    },
    async revoke({ campaignId, now }) {
      timestamp(now)
      return locked(campaignId, async (dir) => {
        try {
          await mkdir(dir, { mode: 0o700 })
          await syncDirectory(root)
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
        }
        await directory(dir)
        await revokeFiles(dir, campaignId, now)
      })
    },
    async sweep({ now, limit = 20 }) {
      const clock = timestamp(now)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw refuse('REAL_INVALID_LIMIT')
      await prepareRoot(root)
      let revoked = 0,
        unavailable = 0
      for (const id of await readdir(root)) {
        if (!UUID.test(id)) continue
        try {
          await locked(id, async (dir) => {
            const ledger = await getLedger(dir, id)
            const unfinishedErasure =
              ledger.state === 'revoked' &&
              (await readdir(dir)).some((name) => name === 'key.json' || temporaryFile(name))
            if (unfinishedErasure || (ledger.state === 'active' && clock >= timestamp(ledger.expiresAt))) {
              await revokeFiles(dir, id, ledger.revokedAt ?? now)
              revoked++
            }
          })
        } catch (error) {
          if (!['REAL_KEY_UNAVAILABLE', 'REAL_KEY_BUSY'].includes(error.code)) throw error
          unavailable++
        }
        if (revoked >= limit) break
      }
      return { revoked, unavailable }
    }
  }
}
