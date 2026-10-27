import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { refreshZeroMtimes, ZERO_MTIME_BEFORE_MS } from '../src/mtimes.js'
import { start } from '../src/server.js'

// 🔒 27/09/2026: the Joomla quickstart webroots came out of their archive at mtime 0, and OPcache caches
// no script at 0 — every request compiled Joomla again (boot 1.2–1.7 s → 0.3–0.4 s once touched).
test('a site file at mtime 0 gets the time now; content, real times, symlinks and non-sites are left alone', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mtimes-'))
  try {
    const web = path.join(root, 'j-abc123', '.webroot')
    await mkdir(path.join(web, 'libraries', 'src'), { recursive: true })
    const zero = path.join(web, 'libraries', 'src', 'Factory.php')
    const real = path.join(web, 'index.php')
    await writeFile(zero, '<?php // core')
    await writeFile(real, '<?php // edited')
    await utimes(zero, 0, 0)
    const realTime = new Date('2026-09-20T10:00:00Z')
    await utimes(real, realTime, realTime)
    await symlink(zero, path.join(web, 'link.php'))
    // Not a site folder: a name the fleet never gives one.
    await mkdir(path.join(root, '_brands', '.webroot'), { recursive: true })
    const other = path.join(root, '_brands', '.webroot', 'x.php')
    await writeFile(other, 'x')
    await utimes(other, 0, 0)
    const when = new Date('2026-09-27T06:00:00Z')
    const lines = []
    const r = await refreshZeroMtimes({
      sitesRoot: root,
      now: () => when,
      log: { log: (m) => lines.push(m), warn() {} }
    })
    assert.deepEqual(r, { sites: 1, files: 1 })
    assert.equal((await stat(zero)).mtimeMs, when.getTime())
    assert.equal((await stat(real)).mtimeMs, realTime.getTime())
    assert.ok((await stat(other)).mtimeMs < ZERO_MTIME_BEFORE_MS, 'not a site folder: untouched')
    assert.match(lines[0], /j-abc123: 1 file\(s\) at mtime 0 given the time now/)
    // A second run finds nothing.
    assert.deepEqual(await refreshZeroMtimes({ sitesRoot: root, log: { log() {}, warn() {} } }), {
      sites: 0,
      files: 0
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing sites root is nothing to do, never a failure', async () => {
  assert.deepEqual(
    await refreshZeroMtimes({ sitesRoot: '/nonexistent/sites', log: { log() {}, warn() {} } }),
    {
      sites: 0,
      files: 0
    }
  )
})

test('start: runs the refresh in the background, and TRACY_HOST_REFRESH_MTIMES=0 turns it off', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mtimes-start-'))
  try {
    const file = path.join(root, 'site-1', '.webroot', 'a.php')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'a')
    await utimes(file, 0, 0)
    const env = {
      HOST_NAME: 'local',
      HOST_SECRET: 's',
      TRACY_SITES_ROOT: root,
      TRACY_PRIVATE_ROOT: root,
      TRACY_FLEET_DIR: root,
      PORT: '0'
    }
    const quiet = { log() {}, warn() {} }
    const off = await start({
      env: { ...env, TRACY_HOST_REFRESH_MTIMES: '0' },
      log: quiet,
      run: async () => ({ code: 0, tail: [] })
    })
    assert.deepEqual(await off.refreshed, { sites: 0, files: 0 })
    await off.close()
    assert.ok((await stat(file)).mtimeMs < ZERO_MTIME_BEFORE_MS)
    const on = await start({ env, log: quiet, run: async () => ({ code: 0, tail: [] }) })
    assert.deepEqual(await on.refreshed, { sites: 1, files: 1 })
    await on.close()
    assert.ok((await stat(file)).mtimeMs >= ZERO_MTIME_BEFORE_MS)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
