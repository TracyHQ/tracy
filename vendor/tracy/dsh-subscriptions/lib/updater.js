import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTrustedSettingsRequest, writeJson } from './http.js'

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 10 * 60_000
const VERSION_CACHE_MS = 5 * 60_000
let latestCache

function header(request, name) {
  const value = request.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isLoopback(value) {
  const address = value?.toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address?.startsWith('127.') === true
    || address?.startsWith('::ffff:127.') === true
}

export function isTrustedUpdateRequest(request, targetCtx) {
  const customHeader = header(request, UPDATE_HEADER)
  if (customHeader === '1') {
    const remote = request.socket?.remoteAddress
    if (remote && isLoopback(remote)) return true
  }
  return isTrustedSettingsRequest(request, targetCtx)
}

function validProfileName(value) {
  return typeof value === 'string' && value !== '' && value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\') && !/[\0-\x1f\x7f]/.test(value)
}

function profileNameFromArgv(argv) {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--profile') return argv[index + 1]
    if (argv[index]?.startsWith('--profile=')) return argv[index].slice('--profile='.length)
  }
  return argv[2] === 'web' ? 'web' : undefined
}

function findDshCliEntry() {
  const value = process.argv[1]
  if (value === undefined || value === '') return undefined
  const entry = value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value)
  if (!existsSync(entry)) return undefined
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const bin = typeof manifest.bin === 'string'
          ? manifest.bin
          : typeof manifest.bin === 'object' && manifest.bin !== null
            ? manifest.bin.dsh
            : undefined
        if (manifest.name === '@deepseek-ai/dsh' && typeof bin === 'string'
          && !isAbsolute(bin) && resolve(directory, bin) === resolve(entry)) return entry
      } catch {
        // Continue searching parent package directories.
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

function getRuntime() {
  const profileDir = resolve(process.env.DSH_PROFILE_DIR
    ?? resolve(homedir(), '.dsh', 'profiles', 'web'))
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir)) ? basename(profileDir) : 'web'
  const cliEntry = findDshCliEntry()
  return cliEntry === undefined ? { profileName, profileDir } : { profileName, profileDir, cliEntry }
}

export function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 0 : left.length === 0 ? 1 : -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a)
      const bNumber = BigInt(b)
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a > b ? 1 : -1
  }
  return 0
}

export function isNewerVersion(currentValue, candidateValue) {
  const current = parseSemver(currentValue)
  const candidate = parseSemver(candidateValue)
  if (current === undefined || candidate === undefined) return false
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index]) return candidate.core[index] > current.core[index]
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}

export async function fetchLatestVersion(packageName, registry = 'https://registry.npmjs.org') {
  if (latestCache?.packageName === packageName && latestCache.registry === registry && Date.now() < latestCache.expiresAt) {
    return latestCache.version
  }
  try {
    const response = await fetch(`${registry.replace(/\/$/, '')}/${encodeURIComponent(packageName)}/latest`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return undefined
    const value = await response.json()
    if (typeof value?.version !== 'string' || value.version === '') return undefined
    latestCache = { packageName, registry, version: value.version, expiresAt: Date.now() + VERSION_CACHE_MS }
    return value.version
  } catch {
    return undefined
  }
}

export async function readCurrentVersion(manifestUrl) {
  const value = JSON.parse(await readFile(manifestUrl, 'utf8'))
  if (typeof value?.version !== 'string' || value.version === '') throw new Error('Cannot read current plugin version.')
  return value.version
}

export async function getUpdaterStatus(options, target = getRuntime()) {
  const current = await readCurrentVersion(options.manifestUrl)
  const latest = await fetchLatestVersion(options.packageName, options.registry ?? 'https://registry.npmjs.org')
  return {
    ok: true,
    packageName: options.packageName,
    currentVersion: current,
    ...(latest === undefined ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.cliEntry !== undefined,
  }
}

export function readLockPid(lockPath) {
  try {
    if (!existsSync(lockPath)) return undefined
    const stat = statSync(lockPath)
    if (stat.isDirectory()) return undefined
    const content = readFileSync(lockPath, "utf8").trim()
    if (!content) return undefined
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed.pid === "number") return parsed.pid
    } catch {
      // Ignore invalid JSON lockfile format; fall through to numeric/regex parsing
    }
    const num = parseInt(content, 10)
    if (!isNaN(num) && num > 0) return num
    const match = /\b(\d{1,8})\b/.exec(content)
    if (match) return Number(match[1])
    return undefined
  } catch {
    return undefined
  }
}

export function isPidAlive(pid) {
  if (typeof pid !== "number" || isNaN(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === "EPERM"
  }
}

export function checkAndCleanLock(profileDir, childPid) {
  const lockPath = resolve(profileDir, "package.json.lock")
  if (!existsSync(lockPath)) return { locked: false }
  const pid = readLockPid(lockPath)
  if (pid !== undefined) {
    if (isPidAlive(pid)) {
      if (childPid !== undefined && pid === childPid) {
        try {
          rmSync(lockPath, { recursive: true, force: true })
          return { locked: false, cleaned: true }
        } catch {
          return { locked: true, pid }
        }
      }
      return { locked: true, pid }
    }
    try {
      rmSync(lockPath, { recursive: true, force: true })
      return { locked: false, cleaned: true }
    } catch {
      return { locked: true, pid }
    }
  }
  if (childPid !== undefined) {
    try {
      rmSync(lockPath, { recursive: true, force: true })
      return { locked: false, cleaned: true }
    } catch {
      // Ignore lockfile removal failure on fallback cleanup
    }
  }
  return { locked: true }
}

export async function installExactPackage(target, packageSpec, options = {}) {
  if (target.cliEntry === undefined) throw new Error('Automatic update is unavailable in this runtime.')
  const lockStatus = checkAndCleanLock(target.profileDir)
  if (lockStatus.locked) {
    const error = new Error('Another plugin installation is currently in progress.')
    error.status = 409
    error.code = 'ELOCKED'
    throw error
  }
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      target.cliEntry, 'plugin', '--profile', target.profileName, 'add',
      packageSpec,
      `--registry=${options.registry ?? 'https://registry.npmjs.org/'}`,
    ], {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    })
    let detail = ''
    child.stdout?.on('data', chunk => { detail = (detail + String(chunk)).slice(-4_000) })
    child.stderr?.on('data', chunk => { detail = (detail + String(chunk)).slice(-4_000) })
    let timedOut = false
    const timeoutMs = options.timeoutMs ?? UPDATE_TIMEOUT_MS
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGTERM') } catch { /* ignore if process is already terminated */ }
      setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* ignore if process is already terminated */ }
        checkAndCleanLock(target.profileDir, child.pid)
      }, 500).unref?.()
      reject(new Error('Update timed out; use the normal Tracy update flow.'))
    }, timeoutMs)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        checkAndCleanLock(target.profileDir, child.pid)
        return
      }
      if (code === 0) resolvePromise()
      else reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
    })
  })
}

export function registerPluginUpdater(ctx, options) {
  let installing = false
  const endpoints = Array.isArray(options.endpoint)
    ? options.endpoint
    : [options.endpoint, ...(Array.isArray(options.aliases) ? options.aliases : [])]

  const handler = async (request, response) => {
      try {
        const target = getRuntime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          const payload = await getUpdaterStatus(options, target)
          writeJson(response, 200, payload)
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }
        if (!isTrustedUpdateRequest(request, ctx)) {
          writeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'Rejected non-local or cross-origin update request.' } })
          return
        }
        if (installing) {
          writeJson(response, 409, { ok: false, error: { code: 'busy', message: 'This plugin is already updating.' } })
          return
        }
        const profileLock = checkAndCleanLock(target.profileDir)
        if (profileLock.locked) {
          writeJson(response, 409, { ok: false, error: { code: 'busy', message: 'Another plugin installation is currently in progress in this profile.' } })
          return
        }
        installing = true
        try {
          const before = await getUpdaterStatus(options, target)
          if (before.latestVersion === undefined) {
            writeJson(response, 503, { ok: false, error: { code: 'unavailable', message: 'The latest version is temporarily unavailable.' } })
            return
          }
          if (!before.updateAvailable) {
            writeJson(response, 200, { ok: true, ...before })
            return
          }
          await installExactPackage(target, `${options.packageName}@${before.latestVersion}`, options)
          writeJson(response, 200, {
            ok: true,
            ...before,
            updatedVersion: before.latestVersion,
            restartRequired: true,
          })
        } finally {
          installing = false
        }
      } catch (error) {
        if (error?.status === 409 || error?.code === 'ELOCKED') {
          writeJson(response, 409, { ok: false, error: { code: 'busy', message: error.message || 'Another plugin installation is currently in progress.' } })
          return
        }
        ctx.logger?.warn?.(`plugin updater failed: ${String(error)}`)
        writeJson(response, 503, { ok: false, error: { code: 'update_failed', message: String(error?.message || error) } })
      }
  }

  const unregisters = endpoints.map((ep) => ctx.webServer.register({
    kind: 'exact',
    path: ep,
    handler,
  }))

  return () => {
    for (const un of unregisters) {
      if (typeof un === 'function') un()
    }
  }
}
