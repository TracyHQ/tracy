/**
 * A Joomla site the CLI installer builds keeps every table in utf8mb4 (`provision/platform/joomla.sh`
 * `joomla_tables_utf8mb4`): JA Diner j6 1.0.8's demo `custom.sql` re-creates 75 of its 139 tables in utf8mb3, and the
 * first emoji the chain build wrote ended its write step with "Incorrect string value ... for column
 * `joomla`.`tr_content`.`fulltext`" (dev, 16/11/2026).
 *
 * Real MariaDB (`mariadb:11`, a container of its own, removed at the end; SKIPPED where no docker
 * daemon answers). The function is taken from the script as it is and run with a `docker compose
 * exec -T db …` that reaches that container.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/provision-joomla-utf8mb4.test.mjs
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
const DB_CONTAINER = `tracy-provision-utf8mb4-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the conversion needs a real MariaDB' }

const root = mkdtempSync(join(tmpdir(), 'provision-utf8mb4-'))
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

/** `joomla_tables_utf8mb4` as provision runs it, on a webroot whose configuration names `prefix`. */
function convert(prefix) {
  const webroot = mkdtempSync(join(root, 'webroot-'))
  writeFileSync(
    join(webroot, 'configuration.php'),
    `<?php\nclass JConfig {\n\tpublic $dbprefix = '${prefix}';\n}\n`
  )
  const start = JOOMLA.indexOf('joomla_tables_utf8mb4() {')
  const fn = JOOMLA.slice(start, JOOMLA.indexOf('\n}\n', start) + 3)
  const script = `set -euo pipefail
tracy_webroot_dir() { printf '%s' ${JSON.stringify(webroot)}; }
SITE_DIR=${JSON.stringify(root)} LABEL=shop DB_PASSWORD=t DB_NAME=joomla
${fn}
joomla_tables_utf8mb4
echo "rc=$?"
`
  const r = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, REAL_DOCKER, TEST_DB_CONTAINER: DB_CONTAINER }
  })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /rc=0\n$/)
  return r
}

const collations = (like) =>
  sql(
    `SELECT table_name, table_collation FROM information_schema.tables WHERE table_schema = 'joomla' AND table_name LIKE '${like}' ORDER BY table_name`
  )

test(
  "the site's utf8mb3 tables move to utf8mb4 with their rows, then hold an emoji; other tables stay",
  opts,
  () => {
    sql(`DROP TABLE IF EXISTS tr_content, tr_menu, tr_users, other_content;
    -- What JA Diner's custom.sql creates.
    CREATE TABLE tr_content (id INT PRIMARY KEY, title VARCHAR(255) NOT NULL, alias VARCHAR(400) NOT NULL,
      \`fulltext\` MEDIUMTEXT NOT NULL, KEY idx_alias (alias(191))) DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
    INSERT INTO tr_content VALUES (1, 'Mint tea — ½ price', 'mint-tea', '<p>“Fresh” mint · 3 €</p>');
    CREATE TABLE tr_menu (id INT PRIMARY KEY, title VARCHAR(255) NOT NULL) DEFAULT CHARSET=utf8mb3;
    INSERT INTO tr_menu VALUES (1, 'Menu → Tea');
    -- What Joomla's own base.sql creates: already utf8mb4, left as it is.
    CREATE TABLE tr_users (id INT PRIMARY KEY, name VARCHAR(400) NOT NULL) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    -- Another site's table in the same database: not this site's to touch.
    CREATE TABLE other_content (id INT PRIMARY KEY, t VARCHAR(10)) DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;`)
    assert.throws(
      () => sql(`UPDATE tr_content SET \`fulltext\` = '<p>🤎 #tea</p>' WHERE id = 1`),
      /Incorrect string value/,
      'the failure seen on dev'
    )
    const r = convert('tr_')
    assert.match(r.stdout, /converted 2 table\(s\) to utf8mb4/)
    assert.equal(r.stderr, '')
    assert.equal(
      collations('tr\\_%'),
      'tr_content\tutf8mb4_unicode_ci\ntr_menu\tutf8mb4_unicode_ci\ntr_users\tutf8mb4_bin'
    )
    assert.equal(collations('other\\_%'), 'other_content\tutf8mb3_general_ci', 'another prefix is left alone')
    assert.equal(
      sql('SELECT title, alias, `fulltext` FROM tr_content'),
      'Mint tea — ½ price\tmint-tea\t<p>“Fresh” mint · 3 €</p>'
    )
    assert.equal(sql('SELECT title FROM tr_menu'), 'Menu → Tea')
    sql(`UPDATE tr_content SET \`fulltext\` = '<p>🤎 #tea</p>' WHERE id = 1`)
    assert.equal(sql('SELECT `fulltext` FROM tr_content'), '<p>🤎 #tea</p>')
  }
)

test(
  'a table the server will not convert is named and left; the others are converted; the provision goes on',
  opts,
  () => {
    sql(`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS tq_content, tq_parent, tq_child; SET FOREIGN_KEY_CHECKS = 1;
    CREATE TABLE tq_content (id INT PRIMARY KEY, title VARCHAR(255)) DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
    -- An extension's tables joined by a foreign key on a text column: neither side may change its character set alone.
    CREATE TABLE tq_parent (code VARCHAR(20) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
    CREATE TABLE tq_child (id INT PRIMARY KEY, code VARCHAR(20),
      CONSTRAINT tq_fk FOREIGN KEY (code) REFERENCES tq_parent (code)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;`)
    const r = convert('tq_')
    assert.match(r.stdout, /converted 1 table\(s\) to utf8mb4/)
    assert.match(r.stderr, /!! 2 table\(s\) stay outside utf8mb4 and refuse characters above U\+FFFF: /)
    assert.match(r.stderr, /tq_child/)
    assert.match(r.stderr, /tq_parent/)
    assert.equal(
      collations('tq\\_%'),
      'tq_child\tutf8mb3_general_ci\ntq_content\tutf8mb4_unicode_ci\ntq_parent\tutf8mb3_general_ci'
    )
  }
)

test('a site already in utf8mb4 is left as it is, and says nothing', opts, () => {
  sql(
    `DROP TABLE IF EXISTS tz_content; CREATE TABLE tz_content (id INT PRIMARY KEY) DEFAULT CHARSET=utf8mb4;`
  )
  const r = convert('tz_')
  assert.equal(r.stdout, 'rc=0\n')
  assert.equal(r.stderr, '')
})

test('the CLI installer road converts the tables right after the install, before anything reads the site', () => {
  const install = JOOMLA.slice(JOOMLA.indexOf('joomla_installer_install() {'))
  const body = install.slice(0, install.indexOf('\n    }\n'))
  const cli = body.indexOf('php installation/joomla.php install')
  const convertAt = body.indexOf('\n      joomla_tables_utf8mb4\n')
  assert.ok(cli > 0 && convertAt > cli, 'joomla_tables_utf8mb4 runs after the CLI installer')
  assert.ok(convertAt < body.indexOf('chown -R www-data'), 'and before the site is handed to www-data')
})
