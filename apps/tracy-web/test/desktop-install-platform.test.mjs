/**
 * Migration 086: `desktop_install.platform` (tasks/todo-desktop-windows.md §4, agent S). Every row
 * written before it came from a `<channel>-mac.yml` read, so it must read back as mac; after it, a
 * platform is only ever mac, win or linux.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/desktop-install-platform.test.mjs
 */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { migrate } from '../src/db/index.js'
import { listInstalls, recordCheck } from '../src/lib/desktop-install.js'
import { scratchPool } from './_db.mjs'

const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const MAC = '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab'
const WIN = '11111111-2222-4333-8444-555555555555'

test(
  '086 files every install recorded before it as mac, and takes only mac, win or linux',
  opts,
  async () => {
    // A database that stopped one file short of 086, holding a row the Mac feed wrote.
    const dir = await mkdtemp(join(tmpdir(), 'tracy-086-'))
    const all = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql'))
    for (const name of all.filter((n) => n < '086')) await copyFile(join(MIGRATIONS, name), join(dir, name))
    const { pool, close } = await scratchPool()
    try {
      await migrate(pool, dir, { lockId: 7_243_086 })
      await pool.query(
        "insert into desktop_install (install_id, channel, version, arch, os_version) values ($1, 'stable', '0.3.0', 'arm64', '15.5.0')",
        [MAC]
      )

      const { applied } = await migrate(pool, MIGRATIONS, { lockId: 7_243_086 })
      assert.deepEqual(
        applied,
        all.filter((n) => n >= '086')
      )
      const [old] = await listInstalls(pool)
      assert.equal(old.installId, MAC)
      assert.equal(old.platform, 'mac')
      assert.equal(old.version, '0.3.0')

      await assert.rejects(
        pool.query(
          "insert into desktop_install (install_id, channel, platform) values ($1, 'stable', 'ios')",
          [WIN]
        ),
        /desktop_install_platform_check/
      )
      // The recorder refuses a platform it does not know rather than writing it.
      assert.equal(await recordCheck(pool, { installId: WIN, channel: 'stable', platform: 'ios' }), false)
      assert.equal(
        await recordCheck(pool, { installId: WIN, channel: 'stable', platform: 'win', arch: 'x64' }),
        true
      )
      assert.deepEqual(
        (await listInstalls(pool)).map((i) => [i.installId, i.platform]).sort(),
        [
          [MAC, 'mac'],
          [WIN, 'win']
        ].sort()
      )
    } finally {
      await close()
    }
  }
)
