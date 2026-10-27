// stand.mjs --version <x.y.z> restores that version or nothing (16/10/2026): Tracy Apple 1.3.1, built
// but not published, was measured three times as "1.3.1" from 1.3.0's files, because the checkout the
// stand ran from had contracts up to 1.3.0 and the stand quietly took the newest one it had.
// The stand runs from a copy of the script inside a throwaway tree (its ROOT is its own folder) with no
// gh on PATH, so nothing is downloaded and no container is started.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = 'packages/cms/tracy-joomla-quickstart/contracts/tracy-apple/j6'

/** A tree holding stand.mjs and one contract version; returns the stand's result. */
function standAsking(version) {
  const root = mkdtempSync(join(tmpdir(), 'stand-version-'))
  try {
    const slot = join(root, 'packages/design/tracy-ds-slot')
    mkdirSync(join(slot, 'scripts'), { recursive: true })
    mkdirSync(join(slot, 'src'), { recursive: true })
    cpSync(join(PKG, 'scripts/stand.mjs'), join(slot, 'scripts/stand.mjs'))
    cpSync(join(PKG, 'src/release-manifest.mjs'), join(slot, 'src/release-manifest.mjs'))
    cpSync(join(PKG, 'src/stand-db.mjs'), join(slot, 'src/stand-db.mjs'))
    cpSync(join(PKG, 'src/stand-address.mjs'), join(slot, 'src/stand-address.mjs'))
    mkdirSync(join(root, CONTRACT, '1.3.0'), { recursive: true })
    writeFileSync(
      join(root, CONTRACT, '1.3.0/manifest.json'),
      JSON.stringify({
        quickstart: {
          version: '1.3.0',
          platform: 'joomla',
          parts: {
            webroot: { file: 'tracy-apple-j6-webroot-1.3.0.tar.gz', sha256: '0'.repeat(64) },
            database: { file: 'tracy-apple-j6-database-1.3.0.sql.gz', sha256: '1'.repeat(64) }
          }
        }
      })
    )
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    return spawnSync(
      process.execPath,
      [
        join(slot, 'scripts/stand.mjs'),
        'up',
        'tracy-apple/j6',
        '--version',
        version,
        '--port',
        '59999',
        '--name',
        'stand-version-test',
        '--dir',
        join(root, 'w'),
        '--fetch-only'
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: dirname(process.execPath), DS_STAND_CACHE: '' } }
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a version the checkout has no contract for is refused, not stood in for by the newest one', () => {
  const r = standAsking('1.3.1')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /know 1\.3\.1/)
  assert.doesNotMatch(r.stdout, /1\.3\.0\.tar\.gz/)
})
