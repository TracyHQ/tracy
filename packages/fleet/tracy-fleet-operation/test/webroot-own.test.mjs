/**
 * What a write puts in a site's webroot is given to the webroot's owner (`lib/webroot-repo-git.sh`
 * `tracy_webroot_own`, #1562) — and nothing outside the webroot is, whatever links the webroot holds:
 * a folder in it may be a symlink to anywhere on the host.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-own.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LIB = join(here, '..', 'scripts', 'lib', 'webroot-repo-git.sh')

test('a path under a symlinked folder that leaves the webroot is not chowned; a link itself is', () => {
  const root = mkdtempSync(join(tmpdir(), 'webroot-own-'))
  try {
    const webroot = join(root, 'webroot')
    const outside = join(root, 'outside')
    mkdirSync(join(webroot, 'images'), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(webroot, 'images', 'a.jpg'), 'a')
    writeFileSync(join(outside, 'secret'), 's')
    symlinkSync(outside, join(webroot, 'alias'))
    // `chown` logged, never run: what would be given away is the question.
    const bin = join(root, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'chown'), `#!/bin/sh\nprintf '%s\\n' "$@" >> "${join(root, 'chown.log')}"\n`)
    chmodSync(join(bin, 'chown'), 0o755)
    const r = spawnSync(
      'bash',
      [
        '-c',
        '. "$1"; printf "images/a.jpg\\0alias/secret\\0alias\\0images/../../outside/secret\\0" | tracy_webroot_own "$2"',
        'x',
        LIB,
        webroot
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
    )
    assert.equal(r.status, 0, r.stderr)
    const given = readFileSync(join(root, 'chown.log'), 'utf8').trim().split('\n').slice(2)
    assert.deepEqual(given.sort(), ['./alias', './images/a.jpg'])
    assert.match(r.stderr, /outside the webroot: alias\/secret/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
