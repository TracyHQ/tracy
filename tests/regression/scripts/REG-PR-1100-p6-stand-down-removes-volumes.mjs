/**
 * REG-PR-1100-p6-stand-down-removes-volumes: `stand.mjs down` removes each container WITH its
 * anonymous volumes. The database container's MariaDB data lives in one; without `-v` every stand a
 * slot pass raised left ~180 MB behind (twelve of them on 10/10/2026, on a Docker disk with 8 GB free).
 *
 * No Docker needed: a stand-in `docker` first on PATH records every call `down` makes.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks, ROOT, run } from './lib.mjs'

const c = checks()
const bin = mkdtempSync(join(tmpdir(), 'reg-stand-down-'))
const calls = join(bin, 'calls.txt')
writeFileSync(join(bin, 'docker'), `#!/bin/sh\necho "$*" >> "${calls}"\n`)
chmodSync(join(bin, 'docker'), 0o755)
writeFileSync(calls, '')
try {
  const r = run(
    process.execPath,
    [
      join(ROOT, 'packages/design/tracy-ds-slot/scripts/stand.mjs'),
      'down',
      '--name',
      'reg-down-probe',
      '--dir',
      bin
    ],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  )
  c.eq('down exits 0', r.status, 0)
  c.check('down reports the stand taken down', /"down":true/.test(r.stdout), r.stdout)
  const lines = readFileSync(calls, 'utf8').trim().split('\n')
  c.check(
    'the web container is removed with its volumes',
    lines.includes('rm -f -v reg-down-probe-web'),
    lines
  )
  c.check(
    'the database container is removed with its volumes',
    lines.includes('rm -f -v reg-down-probe-db'),
    lines
  )
  c.check('the stand network is removed', lines.includes('network rm reg-down-probe'), lines)
} finally {
  rmSync(bin, { recursive: true, force: true })
}
c.done()
