/**
 * REG-PR-1392-site-backup-test-volume: a run of site-backup.test.mjs leaves no anonymous MariaDB volume behind. mariadb:11
 * declares VOLUME /var/lib/mysql, so removing the throwaway database without `-v` left one
 * dangling volume of data files per run. Counts dangling volumes around the run and opens each
 * new one: another session on the machine may create volumes meanwhile, so only a new volume
 * holding MariaDB data files (`ibdata1`) counts against the test.
 */
import { checks, cannotRun, nodeTest, run } from './lib.mjs'

const dangling = () => {
  const r = run('docker', ['volume', 'ls', '-q', '-f', 'dangling=true'])
  if (r.status !== 0) cannotRun(`docker volume ls failed: ${r.stderr.trim() || r.error?.message}`)
  return new Set(r.stdout.split('\n').filter(Boolean))
}
if (run('docker', ['info']).status !== 0) cannotRun('no docker daemon here: the test needs a real MariaDB')

const c = checks()
const before = dangling()
const r = nodeTest(['packages/fleet/tracy-fleet-operation/test/site-backup.test.mjs'])
const after = dangling()
const fresh = [...after].filter((v) => !before.has(v))
process.stdout.write(`# dangling volumes: before ${String(before.size)}, after ${String(after.size)}\n`)
// S1: the suite ran for real (no MariaDB test skipped for want of docker).
c.tapClean('S1', r)
c.passes('S1', r, 'MariaDB: Restore everything')
// S2: none of the volumes that appeared during the run holds MariaDB data files.
// `test -e` exits 0 (file there) or 1 (not there); any other code (docker's own 125, a missing
// image…) means the probe did not run, and an unopened volume must not count as clean.
const holdsMariadb = (v) => {
  const p = run('docker', [
    'run',
    '--rm',
    '-v',
    `${v}:/v:ro`,
    '--entrypoint',
    'test',
    'mariadb:11',
    '-e',
    '/v/ibdata1'
  ])
  if (p.status === 0) return true
  if (p.status === 1) return false
  return cannotRun(
    `could not open volume ${v} (exit ${String(p.status)}): ${p.stderr.trim() || p.error?.message}`
  )
}
const mariadb = fresh.filter(holdsMariadb)
c.eq('S2: new dangling volumes holding MariaDB data files', mariadb.length, 0)
c.done()
