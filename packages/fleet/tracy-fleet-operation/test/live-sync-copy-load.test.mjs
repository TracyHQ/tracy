/**
 * "Sync from live" reads the copy's database into its scratch schema (`webroot-sync.sh` `load_ours`)
 * seconds after the copy's agent wrote it — while the copy may still be busy: `db.snapshot` and
 * `db.cleanup` park and drop Tracy's own copies of tables (`_tracy_snap_*`, `_tracy_trash_*`), an
 * extension creates or empties a table of its own (Smart Search's TRUNCATE of `#__finder_tokens`).
 * On dev (24/10/2026, Joomla 5) one such sync stopped with `MERGE_FAILED: the copy's database could
 * not be read into its scratch schema (is the database server's disk full or read-only?)` and the
 * next one, two minutes later, passed: the table list was read once before the tries, so a table
 * that went between the list and its dump failed the dump, and that failure stopped the sync at
 * once, with no retry and no word of what the server said.
 *
 * Real MariaDB (`mariadb:11`, a container of its own, removed at the end; SKIPPED where no docker
 * daemon answers). `load_ours` and its helpers are taken from the script as it is and run against a
 * stack whose `docker compose exec -T … db` reaches that container; the stand-in can run one
 * statement on the copy right when the first dump starts (FAKE_DUMP_HOOK, FAKE_DUMP_HOOK_LATER), the
 * moment the race needs.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-copy-load.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LIB = join(here, '..', 'scripts', 'lib')
const SYNC = readFileSync(join(here, '..', 'scripts', 'webroot', 'webroot-sync.sh'), 'utf8')

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-sync-copy-load-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the load needs a real MariaDB' }

const root = mkdtempSync(join(tmpdir(), 'live-sync-copy-load-'))
after(() => rmSync(root, { recursive: true, force: true }))

// ── the docker stand-in ──────────────────────────────────────────────────────────────────────
// `docker compose exec -T [-e K=V] db <cmd>` → the test's container. The first `mariadb-dump` it
// forwards runs FAKE_DUMP_HOOK on the copy first (the table list was read, the dump has not begun),
// or FAKE_DUMP_HOOK_LATER beside it after FAKE_DUMP_HOOK_DELAY seconds (the dump's transaction has
// begun and it is reading its first, largest table).
const shim = join(root, 'bin')
mkdirSync(shim)
writeFileSync(
  join(shim, 'docker'),
  `#!/usr/bin/env bash
echo 'WARNING: Error loading config file: permission denied (test stand-in)' >&2
[ "$1" = compose ] || exit 0
shift
[ "$1" = exec ] || exit 0
shift; envs=()
while [ "$1" = -T ] || [ "$1" = -e ]; do
  if [ "$1" = -e ]; then envs+=(-e "$2"); shift 2; else shift; fi
done
shift
if [ "$1" = mariadb-dump ] && mkdir "$FAKE_STATE/dumped" 2>/dev/null; then
  if [ -n "\${FAKE_DUMP_HOOK:-}" ]; then
    "$REAL_DOCKER" exec -i -e MYSQL_PWD=t "$TEST_DB_CONTAINER" mariadb -uroot joomla -e "$FAKE_DUMP_HOOK" >&2
  fi
  if [ -n "\${FAKE_DUMP_HOOK_LATER:-}" ]; then
    ( sleep "\${FAKE_DUMP_HOOK_DELAY:-0.3}"
      "$REAL_DOCKER" exec -i -e MYSQL_PWD=t "$TEST_DB_CONTAINER" mariadb -uroot joomla -e "$FAKE_DUMP_HOOK_LATER" >&2 ) &
  fi
fi
# The order two streams meet in (FAKE_LATE_TABLE, FAKE_SLOW_TABLE): the stream that dumps the late
# table starts half a second after the others; the one that dumps the slow table waits two seconds
# right before that table's rows go in.
if [ "$1" = mariadb-dump ]; then
  for a in "$@"; do [ -n "\${FAKE_LATE_TABLE:-}" ] && [ "$a" = "$FAKE_LATE_TABLE" ] && sleep 0.5; done
  for a in "$@"; do
    if [ -n "\${FAKE_SLOW_TABLE:-}" ] && [ "$a" = "$FAKE_SLOW_TABLE" ]; then
      "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@" \\
        | awk -v t="ALTER TABLE \\\`$FAKE_SLOW_TABLE\\\` DISABLE KEYS" '{ print } index($0, t) { print "SELECT SLEEP(2);"; fflush() }'
      exit "\${PIPESTATUS[0]}"
    fi
  done
fi
exec "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@"
`
)
chmodSync(join(shim, 'docker'), 0o755)

const sql = (query, db = '') =>
  execFileSync(
    REAL_DOCKER,
    ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-N', '-B', ...(db ? [db] : [])],
    { input: query, encoding: 'utf8', maxBuffer: 1 << 26 }
  ).trim()
const tables = (db) =>
  sql(`SELECT table_name FROM information_schema.tables WHERE table_schema='${db}' ORDER BY table_name`)
    .split('\n')
    .filter(Boolean)

before(async () => {
  if (!DOCKER_UP) return
  spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
  execFileSync(
    REAL_DOCKER,
    ['run', '-d', '--name', DB_CONTAINER, '-e', 'MARIADB_ROOT_PASSWORD=t', 'mariadb:11'],
    {
      stdio: 'ignore'
    }
  )
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
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

// ── the copy ─────────────────────────────────────────────────────────────────────────────────
// A Joomla copy as the agent leaves it: its tables, the largest first (`jos_assets`, big enough that
// a dump of it takes a moment), a table of Smart Search's, and Tracy's own copies of tables.
const SNAP = '_tracy_snap_20261024120000__jos_content'
const TRASH = '_tracy_trash_20261024120000__jos_old'
function copy() {
  sql('DROP DATABASE IF EXISTS joomla; DROP DATABASE IF EXISTS joomla_tracy_sync_merged')
  sql('CREATE DATABASE joomla CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(
    `CREATE TABLE jos_assets (id INT PRIMARY KEY, name VARCHAR(50), rules VARCHAR(200));
     INSERT INTO jos_assets SELECT seq, CONCAT('com_content.article.', seq), REPEAT('{}', 60) FROM seq_1_to_400000;
     CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(255), introtext MEDIUMTEXT, hits INT);
     INSERT INTO jos_content VALUES (1, 'Hello', 'first', 0), (2, 'About', 'second', 0);
     CREATE TABLE jos_finder_tokens (term VARCHAR(75), weight FLOAT);
     INSERT INTO jos_finder_tokens VALUES ('hello', 1), ('about', 1);
     CREATE TABLE jos_extra (id INT PRIMARY KEY);
     INSERT INTO jos_extra VALUES (1);
     CREATE TABLE \`${SNAP}\` LIKE jos_content; INSERT INTO \`${SNAP}\` SELECT * FROM jos_content;
     CREATE TABLE \`${TRASH}\` (id INT PRIMARY KEY); INSERT INTO \`${TRASH}\` VALUES (1);`,
    'joomla'
  )
}

/** The site's tables as the scratch must hold them: all but the snapshots. */
const siteTables = () => tables('joomla').filter((t) => !t.startsWith('_tracy_snap_'))

/**
 * `load_ours` as the merge runs it, on the copy as it is now: `{rc, why}` — 0 loaded, 1 the copy
 * kept changing, 2 not read (`why`: what the database said, LOAD_OURS_WHY).
 */
function loadOurs(env = {}) {
  const stack = mkdtempSync(join(root, 'stack-'))
  writeFileSync(join(stack, '.env'), 'PLATFORM=joomla\nDB_PASSWORD=t\n')
  writeFileSync(join(stack, 'docker-compose.yml'), 'services: {}\n')
  mkdirSync(join(stack, 'state'))
  const section = SYNC.slice(SYNC.indexOf('# ── the database'), SYNC.indexOf('# ── the files'))
  const script = `set -euo pipefail
LIB_DIR=${JSON.stringify(LIB)} STACK=${JSON.stringify(stack)} DIR=${JSON.stringify(stack)}
. "$LIB_DIR/site-backup.sh"
${section}
DB=joomla SCHEMA_OURS=joomla_tracy_sync_merged PREFIX=jos_
rc=0
load_ours || rc=$?
python3 -c 'import json,sys; print(json.dumps({"rc": int(sys.argv[1]), "why": sys.argv[2]}))' "$rc" "\${LOAD_OURS_WHY:-}"
`
  writeFileSync(join(stack, 'run.sh'), script)
  const r = spawnSync('bash', [join(stack, 'run.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${shim}:${process.env.PATH}`,
      REAL_DOCKER,
      TEST_DB_CONTAINER: DB_CONTAINER,
      FAKE_STATE: join(stack, 'state'),
      TRACY_SYNC_OURS_PAUSE: '0',
      ...env
    }
  })
  assert.equal(r.status, 0, r.stderr)
  const answer = JSON.parse(r.stdout.trim().split('\n').at(-1))
  return { ...answer, stderr: r.stderr }
}

test('the copy at rest loads whole: every table of the site, no snapshot', opts, () => {
  copy()
  const { rc, stderr } = loadOurs()
  assert.equal(rc, 0, stderr)
  assert.deepEqual(tables('joomla_tracy_sync_merged'), siteTables())
})

test(
  'a table that goes between the list and its dump is the copy changing: read again, not a stop',
  opts,
  () => {
    // A site table dropped, and Tracy's trash emptied (`db.purge`), right after the list was read.
    for (const hook of ['DROP TABLE jos_extra', `DROP TABLE \`${TRASH}\``]) {
      copy()
      const { rc, why, stderr } = loadOurs({ FAKE_DUMP_HOOK: hook })
      assert.equal(rc, 0, `${hook}: ${why}\n${stderr}`)
      assert.deepEqual(tables('joomla_tracy_sync_merged'), siteTables(), hook)
    }
  }
)

test(
  'tables tied by a foreign key, loaded by two streams side by side, load whole: no stream takes a table lock',
  opts,
  () => {
    copy()
    // AcyMailing's shape (dev, 26/10/2026): a mail table, and a table that names its rows by a key.
    // Both large enough to go to streams of their own.
    sql(
      `CREATE TABLE jos_acym_mail (id INT PRIMARY KEY, name VARCHAR(255), body TEXT) ENGINE=InnoDB;
       INSERT INTO jos_acym_mail SELECT seq, CONCAT('mail ', seq), REPEAT('x', 400) FROM seq_1_to_3000;
       CREATE TABLE jos_acym_mail_has_list (mail_id INT, list_id INT, note VARCHAR(255), PRIMARY KEY (mail_id, list_id),
         CONSTRAINT jos_fk_acym_mail_has_list1 FOREIGN KEY (mail_id) REFERENCES jos_acym_mail (id)) ENGINE=InnoDB;
       INSERT INTO jos_acym_mail_has_list SELECT seq, 1, REPEAT('y', 200) FROM seq_1_to_3000;
       ANALYZE TABLE jos_acym_mail, jos_acym_mail_has_list;`,
      'joomla'
    )
    // The child is created by its stream while the parent's stream sits between its CREATE and its
    // rows: a parent under LOCK TABLES then fails on the child ("ERROR 1100 … was not locked").
    const { rc, why, stderr } = loadOurs({
      FAKE_LATE_TABLE: 'jos_acym_mail_has_list',
      FAKE_SLOW_TABLE: 'jos_acym_mail'
    })
    assert.equal(rc, 0, `${why}\n${stderr}`)
    assert.ok(!/ERROR 1100/.test(stderr), stderr)
    assert.equal(sql('SELECT COUNT(*) FROM jos_acym_mail', 'joomla_tracy_sync_merged'), '3000')
    assert.equal(sql('SELECT COUNT(*) FROM jos_acym_mail_has_list', 'joomla_tracy_sync_merged'), '3000')
  }
)

test('a table that comes after the list is in the scratch copy too: never merged as dropped', opts, () => {
  copy()
  const { rc, stderr } = loadOurs({
    FAKE_DUMP_HOOK: 'CREATE TABLE jos_newcomer (id INT PRIMARY KEY); INSERT INTO jos_newcomer VALUES (7)'
  })
  assert.equal(rc, 0, stderr)
  assert.ok(siteTables().includes('jos_newcomer'))
  assert.deepEqual(tables('joomla_tracy_sync_merged'), siteTables())
  assert.equal(sql('SELECT id FROM jos_newcomer', 'joomla_tracy_sync_merged'), '7')
})

test('a table emptied by TRUNCATE while the dump reads (Error 1412) is read again', opts, () => {
  // Smart Search empties its token tables with TRUNCATE: a table whose definition changed after the
  // dump's transaction began answers 1412 "Table definition has changed, please retry transaction".
  // One stream, `jos_assets` first: the TRUNCATE lands while it is being read.
  copy()
  const { rc, why, stderr } = loadOurs({
    OURS_STREAMS: '1',
    FAKE_DUMP_HOOK_LATER: 'TRUNCATE jos_finder_tokens',
    FAKE_DUMP_HOOK_DELAY: '0.25'
  })
  assert.match(stderr, /1412/, 'the race happened (the TRUNCATE landed inside the dump)')
  assert.equal(rc, 0, `${why}\n${stderr}`)
  assert.deepEqual(tables('joomla_tracy_sync_merged'), siteTables())
})

test(
  'a copy the server cannot read still stops, and says why with no name or value of the site',
  opts,
  (t) => {
    // A view over a table that is gone: the dump fails the same way on every try (1356).
    copy()
    sql(
      'CREATE TABLE jos_gone (id INT); CREATE VIEW jos_secret_view AS SELECT id FROM jos_gone; DROP TABLE jos_gone',
      'joomla'
    )
    const { rc, why, stderr } = loadOurs()
    assert.equal(rc, 2, stderr)
    t.diagnostic(`why: ${why}`)
    assert.match(why, /1356/)
    assert.doesNotMatch(why, /jos_secret_view|jos_gone|joomla\./)
    assert.doesNotMatch(why, /WARNING/, 'the docker client’s own warning is not the reason')
  }
)

test(
  'a copy busy for a few seconds after a chat turn loads once it settles; never a stop',
  opts,
  async () => {
    // The agent's turn ending: for ~3 s Tracy's snapshots come and go, tables of the site are made,
    // dropped and made again (one the list names among them) and rows are written — then nothing.
    // The tries are paused as on a host.
    copy()
    const writer = spawn(
      'bash',
      [
        '-c',
        `end=$((SECONDS + 3)); i=0
       while (( SECONDS < end )); do i=$((i + 1))
         "$REAL_DOCKER" exec -i -e MYSQL_PWD=t "$C" mariadb -uroot joomla -e "
           CREATE TABLE _tracy_snap_2026102412000\${i:0:1}__jos_content_$i LIKE jos_content;
           INSERT INTO _tracy_snap_2026102412000\${i:0:1}__jos_content_$i SELECT * FROM jos_content;
           CREATE TABLE jos_churn_$i (id INT); INSERT INTO jos_churn_$i VALUES ($i);
           UPDATE jos_content SET introtext = CONCAT('turn ', $i) WHERE id = 2;
           DROP TABLE jos_extra; CREATE TABLE jos_extra (id INT PRIMARY KEY); INSERT INTO jos_extra VALUES ($i);
           DROP TABLE jos_churn_$i; DROP TABLE _tracy_snap_2026102412000\${i:0:1}__jos_content_$i;"
       done`
      ],
      { env: { ...process.env, REAL_DOCKER, C: DB_CONTAINER }, stdio: 'ignore' }
    )
    const done = new Promise((r) => writer.on('exit', r))
    await new Promise((r) => setTimeout(r, 300))
    const { rc, why, stderr } = loadOurs({ TRACY_SYNC_OURS_PAUSE: '2' })
    await done
    assert.equal(rc, 0, `${why}\n${stderr}`)
    assert.deepEqual(tables('joomla_tracy_sync_merged'), siteTables())
  }
)

test('the reason is the first error line, its code kept, cut at its first quote', () => {
  const said = (text) => {
    const file = join(root, `said-${Math.random()}`)
    writeFileSync(file, text)
    const at = SYNC.indexOf('\ndb_error_line() {')
    assert.ok(at >= 0, 'db_error_line is in the script')
    const fn = SYNC.slice(at + 1, SYNC.indexOf('\n}\n', at) + 3)
    return execFileSync('bash', ['-c', `${fn}\ndb_error_line "$1"`, 'x', file], { encoding: 'utf8' }).trim()
  }
  assert.equal(
    said(
      "WARNING: Error loading config file: permission denied\nmariadb-dump: Couldn't execute 'show create table `jos_x`': Table 'joomla.jos_x' doesn't exist (1146)\n"
    ),
    "mariadb-dump: Couldn't execute '…' (1146)"
  )
  assert.equal(
    said(
      'mariadb-dump: Error 1412: Table definition has changed, please retry transaction when dumping table `jos_finder_tokens` at row: 0\n'
    ),
    "mariadb-dump: Error 1412: Table definition has changed, please retry transaction when dumping table '…'"
  )
  assert.equal(
    said("ERROR 1062 (23000) at line 41: Duplicate entry 'lee@example.com' for key 'email'\n"),
    "ERROR 1062 (23000) at line 41: Duplicate entry '…'"
  )
  assert.equal(
    said('ERROR 1006 (HY000): Can\'t create database (errno: 28 "No space left on device")\n'),
    "ERROR 1006 (HY000): Can't create database (errno: 28 '…'"
  )
  assert.equal(
    said(
      "==> [12s] checksums stopped: SqlError: ERROR 1146 (42S02) at line 3: Table '…' (in substance_checksums › run)\n"
    ),
    "checksums stopped: SqlError: ERROR 1146 (42S02) at line 3: Table '…'"
  )
  assert.equal(said('WARNING: Error loading config file\n\n'), '')
})
