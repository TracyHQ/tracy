import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseSemver,
  isNewerVersion,
  isLoopback,
  isTrustedUpdateRequest,
  readCurrentVersion,
  getUpdaterStatus,
  registerPluginUpdater,
  readLockPid,
  isPidAlive,
  checkAndCleanLock,
  installExactPackage,
} from '../lib/updater.js'

test('updater: parseSemver parses valid and invalid semver', () => {
  assert.deepEqual(parseSemver('0.6.8'), { core: [0, 6, 8], prerelease: [] })
  assert.deepEqual(parseSemver('v1.2.3'), { core: [1, 2, 3], prerelease: [] })
  assert.deepEqual(parseSemver('1.0.0-beta.2'), { core: [1, 0, 0], prerelease: ['beta', '2'] })
  assert.equal(parseSemver('invalid'), undefined)
  assert.equal(parseSemver('1.2'), undefined)
  assert.equal(parseSemver(''), undefined)
})

test('updater: isNewerVersion compares versions correctly', () => {
  assert.equal(isNewerVersion('0.6.8', '0.6.9'), true)
  assert.equal(isNewerVersion('0.6.8', '0.7.0'), true)
  assert.equal(isNewerVersion('0.6.8', '1.0.0'), true)
  assert.equal(isNewerVersion('0.6.8', '0.6.8'), false)
  assert.equal(isNewerVersion('0.6.8', '0.6.7'), false)
  assert.equal(isNewerVersion('0.6.8-beta.1', '0.6.8'), true)
  assert.equal(isNewerVersion('0.6.8-beta.1', '0.6.8-beta.2'), true)
  assert.equal(isNewerVersion('0.6.8', 'invalid'), false)
})

test('updater: isLoopback recognizes IPv4, IPv6 and hostnames', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('127.0.1.1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('[::1]'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('192.168.1.111'), false)
  assert.equal(isLoopback('8.8.8.8'), false)
  assert.equal(isLoopback('example.com'), false)
  assert.equal(isLoopback(null), false)
  assert.equal(isLoopback(undefined), false)
})

test('updater: isTrustedUpdateRequest validates headers and remote addresses', () => {
  // Trusted loopback with custom header
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  }), true)

  // Non-loopback remote is rejected
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: '127.0.0.1:3000' },
    socket: { remoteAddress: '192.168.1.100' },
  }), false)

  // Cross-site request without update header is rejected
  assert.equal(isTrustedUpdateRequest({
    headers: { 'sec-fetch-site': 'cross-site', host: 'localhost:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  }), false)

  // Same-origin browser request on loopback is trusted
  assert.equal(isTrustedUpdateRequest({
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }), true)
})

test('updater: readCurrentVersion reads package.json version', async () => {
  const version = await readCurrentVersion(new URL('../package.json', import.meta.url))
  assert.match(version, /^\d+\.\d+\.\d+/)
})

test('updater: getUpdaterStatus returns status structure', async () => {
  const status = await getUpdaterStatus({
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
    registry: 'https://registry.npmjs.org',
  }, {
    profileName: 'web',
    profileDir: '/tmp',
  })
  assert.equal(status.ok, true)
  assert.equal(status.packageName, '@goodandready/dsh-subscriptions')
  assert.ok(typeof status.currentVersion === 'string')
  assert.equal(status.profileName, 'web')
  assert.equal(status.canAutoUpdate, false) // no cliEntry in mock target
})

test('updater: registerPluginUpdater route handles GET, 405 on unsupported methods, and 403 on untrusted POST', async () => {
  let registeredRoute = null
  const mockCtx = {
    webServer: {
      register(spec) {
        registeredRoute = spec
        return () => {}
      },
    },
    logger: { warn() {} },
  }

  registerPluginUpdater(mockCtx, {
    endpoint: '/dsh-subscriptions/update',
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  assert.ok(registeredRoute)
  assert.equal(registeredRoute.path, '/dsh-subscriptions/update')

  const createMockRes = () => {
    let statusCode = 200
    const headers = {}
    let body = ''
    return {
      writeHead(code, h) { statusCode = code; Object.assign(headers, h) },
      setHeader(k, v) { headers[k] = v },
      end(chunk) { if (chunk) body += chunk },
      get statusCode() { return statusCode },
      get body() { return body },
      get headers() { return headers },
    }
  }

  // GET returns 200 with updater status
  const getRes = createMockRes()
  await registeredRoute.handler({
    method: 'GET',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }, getRes)
  assert.equal(getRes.statusCode, 200)
  const getPayload = JSON.parse(getRes.body)
  assert.equal(getPayload.ok, true)
  assert.equal(getPayload.packageName, '@goodandready/dsh-subscriptions')

  // PUT returns 405
  const putRes = createMockRes()
  await registeredRoute.handler({
    method: 'PUT',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }, putRes)
  assert.equal(putRes.statusCode, 405)

  // Untrusted POST returns 403
  const postUntrustedRes = createMockRes()
  await registeredRoute.handler({
    method: 'POST',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '192.168.1.200' },
  }, postUntrustedRes)
  assert.equal(postUntrustedRes.statusCode, 403)
  const untrustedPayload = JSON.parse(postUntrustedRes.body)
  assert.equal(untrustedPayload.ok, false)
  assert.equal(untrustedPayload.error.code, 'forbidden')
})

test('#409: isTrustedUpdateRequest fails closed when remoteAddress is non-loopback or absent on non-local host', () => {
  assert.equal(isTrustedUpdateRequest({
    headers: { host: '192.168.1.111:3000' },
  }), false)

  assert.equal(isTrustedUpdateRequest({
    headers: { host: '192.168.1.111:3000' },
    socket: {},
  }), false)

  assert.equal(isTrustedUpdateRequest({
    headers: { host: 'localhost:3000' },
    socket: { remoteAddress: undefined },
  }), false)
})

test('#409: registerPluginUpdater registers canonical aliases and unregisters them on dispose', async () => {
  const registered = []
  const unregisterCalls = []
  const mockCtx = {
    webServer: {
      register(spec) {
        registered.push(spec)
        return () => { unregisterCalls.push(spec.path) }
      },
    },
    logger: { warn() {} },
  }

  const dispose = registerPluginUpdater(mockCtx, {
    endpoint: '/dsh-subscriptions/update',
    aliases: [
      '/api/@goodandready/dsh-subscriptions/update',
      '/api/dsh-subscriptions/update',
    ],
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  assert.equal(registered.length, 3)
  assert.equal(registered[0].path, '/dsh-subscriptions/update')
  assert.equal(registered[1].path, '/api/@goodandready/dsh-subscriptions/update')
  assert.equal(registered[2].path, '/api/dsh-subscriptions/update')

  // Verify all handlers are the same function
  assert.equal(registered[0].handler, registered[1].handler)
  assert.equal(registered[1].handler, registered[2].handler)

  // Dispose unregisters all routes
  dispose()
  assert.equal(unregisterCalls.length, 3)
  assert.deepEqual(unregisterCalls, [
    '/dsh-subscriptions/update',
    '/api/@goodandready/dsh-subscriptions/update',
    '/api/dsh-subscriptions/update',
  ])
})

test('updater: readLockPid extracts PID from json, numeric string, or regex', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  try {
    const lockPath = join(tmp, 'package.json.lock')
    assert.equal(readLockPid(lockPath), undefined)

    writeFileSync(lockPath, JSON.stringify({ pid: 12345 }), 'utf8')
    assert.equal(readLockPid(lockPath), 12345)

    writeFileSync(lockPath, '54321\n', 'utf8')
    assert.equal(readLockPid(lockPath), 54321)

    writeFileSync(lockPath, 'invalid', 'utf8')
    assert.equal(readLockPid(lockPath), undefined)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('updater: isPidAlive returns true for self and false for non-existent pid', () => {
  assert.equal(isPidAlive(process.pid), true)
  assert.equal(isPidAlive(9999999), false)
  assert.equal(isPidAlive(-1), false)
  assert.equal(isPidAlive(undefined), false)
})

test('updater: checkAndCleanLock cleans dead PID lock and retains live PID lock', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  try {
    const lockPath = join(tmp, 'package.json.lock')

    // No lock
    assert.deepEqual(checkAndCleanLock(tmp), { locked: false })

    // Dead PID lock is cleaned
    writeFileSync(lockPath, JSON.stringify({ pid: 9999999 }), 'utf8')
    assert.equal(existsSync(lockPath), true)
    const deadCheck = checkAndCleanLock(tmp)
    assert.equal(deadCheck.locked, false)
    assert.equal(deadCheck.cleaned, true)
    assert.equal(existsSync(lockPath), false)

    // Live PID lock is retained
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), 'utf8')
    assert.equal(existsSync(lockPath), true)
    const liveCheck = checkAndCleanLock(tmp)
    assert.equal(liveCheck.locked, true)
    assert.equal(liveCheck.pid, process.pid)
    assert.equal(existsSync(lockPath), true)

    // Matching childPid cleans lock even if alive
    const childCheck = checkAndCleanLock(tmp, process.pid)
    assert.equal(childCheck.locked, false)
    assert.equal(childCheck.cleaned, true)
    assert.equal(existsSync(lockPath), false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('updater: installExactPackage throws 409 ELOCKED if profile is locked', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  try {
    const lockPath = join(tmp, 'package.json.lock')
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), 'utf8')

    await assert.rejects(
      installExactPackage(
        { cliEntry: '/fake/dsh', profileName: 'test', profileDir: tmp },
        '@goodandready/dsh-subscriptions@0.6.30'
      ),
      (err) => {
        assert.equal(err.status, 409)
        assert.equal(err.code, 'ELOCKED')
        return true
      }
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('updater: installExactPackage timeout cleans up lockfile and kills child', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  const scriptPath = join(tmp, 'mock-cli.mjs')
  writeFileSync(scriptPath, `
import { writeFileSync } from 'node:fs'
writeFileSync('package.json.lock', JSON.stringify({ pid: process.pid }))
setTimeout(() => {}, 60000)
`, 'utf8')

  try {
    await assert.rejects(
      installExactPackage(
        { cliEntry: scriptPath, profileName: 'test', profileDir: tmp },
        '@goodandready/dsh-subscriptions@0.6.30',
        { timeoutMs: 150 }
      ),
      (err) => err.message.includes('timed out')
    )

    await new Promise(r => setTimeout(r, 600))
    assert.equal(existsSync(join(tmp, 'package.json.lock')), false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('updater: installExactPackage arguments do not contain minimumReleaseAge', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  const scriptPath = join(tmp, 'mock-cli.mjs')
  writeFileSync(scriptPath, `
const args = process.argv.slice(2)
if (args.some(a => a.includes('minimumReleaseAge'))) {
  process.exit(1)
}
process.exit(0)
`, 'utf8')

  try {
    await installExactPackage(
      { cliEntry: scriptPath, profileName: 'test', profileDir: tmp },
      '@goodandready/dsh-subscriptions@0.6.30'
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('updater: registerPluginUpdater returns 409 when profile has live lock', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lock-test-'))
  try {
    writeFileSync(join(tmp, 'package.json.lock'), JSON.stringify({ pid: process.pid }))
    let registeredHandler
    const mockCtx = {
      webServer: {
        register: ({ handler }) => { registeredHandler = handler }
      },
      logger: { warn() {} },
    }

    registerPluginUpdater(mockCtx, {
      endpoint: '/update',
      packageName: '@goodandready/dsh-subscriptions',
      manifestUrl: new URL('../package.json', import.meta.url),
    })

    const req = {
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-dsh-plugin-update': '1',
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
      }
    }
    let responseStatus
    let responseBody = ''
    const res = {
      writeHead: (status) => { responseStatus = status },
      end: (chunk) => { if (chunk) responseBody += chunk }
    }

    const origEnv = process.env.DSH_PROFILE_DIR
    process.env.DSH_PROFILE_DIR = tmp
    try {
      await registeredHandler(req, res)
      assert.equal(responseStatus, 409)
      const data = JSON.parse(responseBody)
      assert.equal(data.ok, false)
      assert.equal(data.error.code, 'busy')
    } finally {
      process.env.DSH_PROFILE_DIR = origEnv
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
