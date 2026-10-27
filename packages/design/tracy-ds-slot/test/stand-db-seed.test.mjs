// The stand's database draws one random order per page (stand-db.mjs, 18/10/2026): JA Vogue 1.0.7 lists its
// editorial carousel `ORDER BY RAND()`, a new draw on each request, so PREVIEW-PARITY's popup and Try on held
// different articles and the carousel read "laid out apart". With the stand's server options every connection
// of the site's user draws the same order; root (SUPER) is not seeded, as MariaDB skips init_connect for it.
// Starts the stand's own MariaDB image (the Mac mini reaches the iMac's Docker through its context);
// skipped without Docker.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { STAND_DB_ARGS } from '../src/stand-db.mjs'

const docker = (/** @type {string[]} */ ...a) => spawnSync('docker', a, { encoding: 'utf8' })
const up = docker('info', '--format', '{{.ServerVersion}}').status === 0
const opts = { skip: up ? false : 'no Docker here', timeout: 180_000 }

test("every connection of the stand's site user draws the same random order", opts, () => {
  const name = `tracy-ds-seed-test-${process.pid}`
  const run = docker(
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-e',
    'MARIADB_ROOT_PASSWORD=r',
    '-e',
    'MARIADB_DATABASE=site',
    '-e',
    'MARIADB_USER=site',
    '-e',
    'MARIADB_PASSWORD=site',
    'mariadb:11',
    ...STAND_DB_ARGS
  )
  assert.equal(run.status, 0, run.stderr)
  try {
    const sql = (/** @type {string} */ q) =>
      docker('exec', name, 'mariadb', '-usite', '-psite', 'site', '-N', '-e', q)
    let ready = false
    for (let i = 0; i < 60 && !ready; i++) {
      // the entrypoint's first server restarts once: ready when the site user answers twice in a row
      ready = sql('select 1').status === 0 && sql('select 1').status === 0
      if (!ready) spawnSync('sleep', ['2'])
    }
    assert.ok(ready, 'the database came up')
    assert.equal(
      sql(
        `create table t (i int); insert into t values ${Array.from({ length: 30 }, (_, i) => `(${i})`).join(',')}`
      ).status,
      0
    )
    const draw = () =>
      sql('select group_concat(i) from (select i from t order by rand() limit 6) x').stdout.trim()
    const first = draw()
    for (let k = 0; k < 3; k++) assert.equal(draw(), first, 'a new connection draws the same items')
  } finally {
    docker('rm', '-f', name)
  }
})
