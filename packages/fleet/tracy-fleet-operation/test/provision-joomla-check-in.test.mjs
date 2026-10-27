/**
 * An imported Joomla copy starts with every record checked in (`provision/platform/joomla.sh`
 * `platform_check_in_all`): the archive carries the check-outs of editors left open on the live site,
 * and on the copy nobody can close them — its administrator met "checked out by another user" on an
 * article a live editor left open two days before the import (dev, 26/10/2026).
 *
 * Real MariaDB (`mariadb:11`, a container of its own, removed at the end; SKIPPED where no docker
 * daemon answers). The function is taken from the script as it is and run with a `docker compose
 * exec -T db …` that reaches that container.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/provision-joomla-check-in.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const JOOMLA = readFileSync(join(here, '..', 'scripts', 'provision', 'platform', 'joomla.sh'), 'utf8')

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-provision-check-in-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the check-in needs a real MariaDB' }

const root = mkdtempSync(join(tmpdir(), 'provision-check-in-'))
after(() => rmSync(root, { recursive: true, force: true }))

// `docker compose exec -T db sh -c <command>` → the same command in the test's container.
const shim = join(root, 'bin')
mkdirSync(shim)
writeFileSync(
  join(shim, 'docker'),
  `#!/usr/bin/env bash
[ "$1" = compose ] && [ "$2" = exec ] || exit 1
shift 2
while [ "$1" = -T ]; do shift; done
shift
exec "$REAL_DOCKER" exec -i "$TEST_DB_CONTAINER" "$@"
`
)
chmodSync(join(shim, 'docker'), 0o755)

const sql = (query) =>
  execFileSync(
    REAL_DOCKER,
    ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-N', '-B', 'joomla'],
    {
      input: query,
      encoding: 'utf8'
    }
  ).trim()

before(async () => {
  if (!DOCKER_UP) return
  spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
  execFileSync(
    REAL_DOCKER,
    [
      'run',
      '-d',
      '--name',
      DB_CONTAINER,
      '-e',
      'MARIADB_ROOT_PASSWORD=t',
      '-e',
      'MARIADB_DATABASE=joomla',
      'mariadb:11'
    ],
    { stdio: 'ignore' }
  )
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      [
        'exec',
        '-e',
        'MYSQL_PWD=t',
        DB_CONTAINER,
        'mariadb',
        '-uroot',
        '-h127.0.0.1',
        'joomla',
        '-e',
        'SELECT 1'
      ],
      { stdio: 'ignore' }
    )
    if (ok.status === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

/** `platform_check_in_all` as provision runs it, on a webroot whose configuration names `prefix`. */
function checkIn(prefix) {
  const webroot = mkdtempSync(join(root, 'webroot-'))
  writeFileSync(
    join(webroot, 'configuration.php'),
    `<?php\nclass JConfig {\n\tpublic $dbprefix = '${prefix}';\n}\n`
  )
  const start = JOOMLA.indexOf('platform_check_in_all() {')
  const fn = JOOMLA.slice(start, JOOMLA.indexOf('\n}\n', start) + 3)
  const script = `set -euo pipefail
tracy_webroot_dir() { printf '%s' ${JSON.stringify(webroot)}; }
SITE_DIR=${JSON.stringify(root)} LABEL=shop DB_PASSWORD=t DB_NAME=joomla
${fn}
platform_check_in_all
`
  const r = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, REAL_DOCKER, TEST_DB_CONTAINER: DB_CONTAINER }
  })
  assert.equal(r.status, 0, r.stderr)
  return r
}

test(
  'every record the live site had open is checked in on the copy, Joomla 4 and Joomla 3 alike',
  opts,
  () => {
    sql(`DROP TABLE IF EXISTS j4_content, j4_menu, j4_users, j3_content, other_content;
    -- Joomla 4+: NULL is checked in.
    CREATE TABLE j4_content (id INT PRIMARY KEY, title VARCHAR(50), checked_out INT UNSIGNED NULL, checked_out_time DATETIME NULL);
    INSERT INTO j4_content VALUES (1,'open',53,'2026-10-24 21:41:34'),(2,'closed',NULL,NULL);
    CREATE TABLE j4_menu (id INT PRIMARY KEY, checked_out INT UNSIGNED NULL, checked_out_time DATETIME NULL);
    INSERT INTO j4_menu VALUES (1,7,'2026-10-20 10:00:00');
    -- A table with a check-out and no time of it.
    CREATE TABLE j4_users (id INT PRIMARY KEY, checked_out INT UNSIGNED NULL);
    INSERT INTO j4_users VALUES (1,9);
    -- Joomla 3: 0 and the zero date are checked in.
    CREATE TABLE j3_content (id INT PRIMARY KEY, checked_out INT NOT NULL DEFAULT 0,
      checked_out_time DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00');
    INSERT INTO j3_content VALUES (1,42,'2026-10-01 00:00:00');
    -- Another site's tables in the same database: not this site's to touch.
    CREATE TABLE other_content (id INT PRIMARY KEY, checked_out INT UNSIGNED NULL);
    INSERT INTO other_content VALUES (1,5);`)
    const r = checkIn('j4_')
    assert.match(r.stdout, /checked in every record/)
    assert.equal(
      sql('SELECT id, IFNULL(checked_out, "-"), IFNULL(checked_out_time, "-") FROM j4_content ORDER BY id'),
      '1\t-\t-\n2\t-\t-'
    )
    assert.equal(sql('SELECT IFNULL(checked_out, "-") FROM j4_menu'), '-')
    assert.equal(sql('SELECT IFNULL(checked_out, "-") FROM j4_users'), '-')
    assert.equal(sql('SELECT checked_out FROM other_content'), '5', 'another prefix is left alone')
    assert.equal(sql('SELECT title FROM j4_content WHERE id = 1'), 'open', 'nothing else of the row moves')

    checkIn('j3_')
    assert.equal(sql('SELECT checked_out, checked_out_time FROM j3_content'), '0\t1000-01-01 00:00:00')
  }
)

test('a site with nothing checked out is left as it is, and says nothing', opts, () => {
  sql(`DROP TABLE IF EXISTS q_content; CREATE TABLE q_content (id INT PRIMARY KEY, title VARCHAR(10));
    INSERT INTO q_content VALUES (1,'a');`)
  const r = checkIn('q_')
  assert.doesNotMatch(r.stdout, /checked in/)
  assert.equal(sql('SELECT title FROM q_content'), 'a')
})
