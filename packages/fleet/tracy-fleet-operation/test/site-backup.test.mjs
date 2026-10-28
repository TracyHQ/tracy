/**
 * Backups that hold the database (ADR 0024): `webroot-backup.sh` create / list / initial-backup /
 * restore-everything, run for real on a throwaway stack.
 *
 * EmDash runs everywhere: its database is SQLite in the site's private dir, and the only container
 * call (`docker compose stop|start web`) goes to a `docker` stand-in on PATH that logs it.
 * WordPress/Joomla need a real MariaDB, because the restore's point is a scratch schema and one
 * `RENAME TABLE` swap that only a real server can prove: those tests start `mariadb:11` in a
 * container of their own (removed at the end) and are SKIPPED, with the reason, where no docker
 * daemon answers (the CI check runners have none). The stand-in forwards
 * `docker compose exec -T [-e K=V] db <cmd>` to that container, so the script's own command lines
 * run unchanged.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/site-backup.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'site-under-test'

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-backup-test-db-${process.pid}`
const mysqlOpts = { skip: DOCKER_UP ? false : 'no docker daemon here: the MariaDB swap needs a real server' }

// ── the docker stand-in ─────────────────────────────────────────────────────────────────────
const shimDir = mkdtempSync(join(tmpdir(), 'backup-docker-'))
const SHIM = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_LOG"
if [ "$1" = compose ]; then
  shift
  case "$1" in
    ps)
      if [ "$2" = -q ] && [ "$3" = web ] && [ -n "\${FAKE_WEB_CONTAINER:-}" ]; then
        echo "$FAKE_WEB_CONTAINER"
      fi
      exit 0 ;;
    exec)
      shift; envs=()
      while [ "$1" = -T ] || [ "$1" = -e ]; do
        if [ "$1" = -e ]; then envs+=(-e "$2"); shift 2; else shift; fi
      done
      shift # the service name
      if [ -n "\${FAKE_DB_FAIL:-}" ] || [ -z "\${TEST_DB_CONTAINER:-}" ]; then echo "db container is down" >&2; exit 1; fi
      exec "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@" ;;
    stop|start) exit "\${FAKE_COMPOSE_FAIL:-0}" ;;
  esac
fi
if [ "$1" = cp ] && [ "\${2:-}" = "\${FAKE_WEB_CONTAINER:-}:/app/." ] && [ -n "\${FAKE_WEB_SOURCE:-}" ]; then
  cp -R "$FAKE_WEB_SOURCE/." "$3/"
  exit $?
fi
exit 0
`
writeFileSync(join(shimDir, 'docker'), SHIM)
chmodSync(join(shimDir, 'docker'), 0o755)
after(() => rmSync(shimDir, { recursive: true, force: true }))

// ── a real MariaDB when docker is here ─────────────────────────────────────────────────────
const sql = (query, db = '') =>
  execFileSync(
    REAL_DOCKER,
    [
      'exec',
      '-i',
      '-e',
      'MYSQL_PWD=t',
      DB_CONTAINER,
      'mariadb',
      '-uroot',
      '-N',
      '-B',
      ...(db ? [db] : []),
      '-e',
      query
    ],
    {
      encoding: 'utf8'
    }
  ).trim()

// `-v` on every removal: mariadb:11 declares VOLUME /var/lib/mysql, so a plain `rm -f` leaves one
// anonymous volume of data files behind per run.
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
  // Over TCP: the image's first-boot server listens on the socket only and then restarts, so a
  // socket answer can come from the server that is about to go away.
  for (let i = 0; i < 240; i++) {
    try {
      execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
        {
          stdio: 'ignore'
        }
      )
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

// ── stacks ──────────────────────────────────────────────────────────────────────────────────
function stack(platform) {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-backup-'))
  const priv = join(srv, LABEL)
  const webroot = join(srv, LABEL, '.webroot')
  const appSource = join(srv, 'app-source')
  mkdirSync(webroot, { recursive: true })
  mkdirSync(appSource, { recursive: true })
  writeFileSync(join(appSource, 'package.json'), '{"name":"fixture-emdash-app"}\n')
  writeFileSync(join(appSource, 'index.js'), 'export const app = true\n')
  writeFileSync(join(priv, 'docker-compose.yml'), 'services: {}\n')
  const log = join(srv, 'docker.log')
  writeFileSync(log, '')
  if (platform === 'emdash') {
    writeFileSync(join(priv, '.env'), 'PLATFORM=emdash\n')
    mkdirSync(join(priv, 'data'))
    mkdirSync(join(priv, 'uploads'))
    sqlite(join(priv, 'data', 'data.db'), [
      'create table posts (id integer primary key, title text)',
      "insert into posts (title) values ('Hello')",
      'create table media (id integer primary key, path text)'
    ])
    writeFileSync(join(priv, 'uploads', 'a.jpg'), 'image a\n')
  } else {
    mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
    mkdirSync(join(webroot, 'wp-content', 'themes', 'tracy'), { recursive: true })
    writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
    writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 0 }\n')
    writeFileSync(join(priv, '.env'), 'PLATFORM=wordpress\nDB_PASSWORD=t\n')
  }
  const env = (extra = {}) => ({
    ...process.env,
    PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
    REAL_DOCKER,
    TEST_DB_CONTAINER: DOCKER_UP ? DB_CONTAINER : '',
    FAKE_DOCKER_LOG: log,
    FAKE_WEB_SOURCE: appSource,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...extra
  })
  const run = (script, args, extra) => {
    const r = spawnSync('bash', [script, '--label', LABEL, ...args], { env: env(extra), encoding: 'utf8' })
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`)
    return { ...JSON.parse(r.stdout.trim().split('\n').at(-1)), stderr: r.stderr }
  }
  const git = (...args) =>
    execFileSync('git', ['--git-dir', join(priv, 'webroot-baseline.git'), '--work-tree', webroot, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' }
    })
  return {
    srv,
    appSource,
    priv,
    webroot,
    backups: join(priv, 'backups'),
    log: () => readFileSync(log, 'utf8'),
    run,
    git,
    backup: (args, extra) => run(BACKUP, args, extra),
    list: () => run(BACKUP, ['--op', 'list']).backups,
    create: (title, extra) =>
      run(
        BACKUP,
        ['--op', 'create', '--title', title, '--by-name', 'Lee', '--by-email', 'lee@example.com'],
        extra
      ),
    restore: (version, extra) =>
      run(
        BACKUP,
        [
          '--op',
          'restore-everything',
          '--version',
          String(version),
          '--by-name',
          'Bo',
          '--by-email',
          'bo@example.com'
        ],
        extra
      ),
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

function sqlite(path, statements) {
  execFileSync('python3', [
    '-c',
    'import sqlite3,sys\nc=sqlite3.connect(sys.argv[1])\nfor s in sys.argv[2:]: c.execute(s)\nc.commit()',
    path,
    ...statements
  ])
}
const sqliteRead = (path, query) =>
  JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import sqlite3,sys,json\nprint(json.dumps(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchall()))',
        path,
        query
      ],
      { encoding: 'utf8' }
    )
  )

const point = (s, version) => s.list().find((r) => r.version === version)

// Step timings of each successful Restore everything, printed at the end (ADR 0024: measure the
// job against its 120 s ceiling).
const timings = []
after(() => {
  for (const [kind, steps] of timings) {
    process.stdout.write(
      `# restore-everything ${kind}: ${steps.map((x) => `${x.step} ${x.ms} ms`).join(' · ')}\n`
    )
  }
})

function freshWordpress() {
  for (const db of sql(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'wordpress%'"
  )
    .split('\n')
    .filter(Boolean)) {
    sql(`DROP DATABASE \`${db}\``)
  }
  sql('CREATE DATABASE wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(
    "CREATE TABLE wp_posts (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(200)); INSERT INTO wp_posts (title) VALUES ('Hello world'); CREATE TABLE wp_options (name VARCHAR(64) PRIMARY KEY, value TEXT); INSERT INTO wp_options VALUES ('blogname', 'Before'); CREATE TABLE _tracy_snap_j6__wp_posts (id INT)",
    'wordpress'
  )
}
const titles = () => sql('SELECT title FROM wp_posts ORDER BY id', 'wordpress').split('\n').filter(Boolean)
const liveTables = () =>
  sql("SELECT table_name FROM information_schema.tables WHERE table_schema='wordpress' ORDER BY table_name")
    .split('\n')
    .filter(Boolean)

// ── EmDash: runs everywhere ─────────────────────────────────────────────────────────────────

test('EmDash: the Initial backup builds the repo and puts the database on v1; a second call and a later point leave v1 alone', () => {
  const s = stack('emdash')
  try {
    const first = s.backup(['--op', 'initial-backup'])
    assert.equal(first.initial, true)
    assert.deepEqual(Object.keys(first.database).sort(), ['bytes', 'engine', 'ok', 'sha256'])
    assert.equal(first.database.engine, 'sqlite')
    assert.equal(first.database.ok, true)
    assert.match(first.database.sha256, /^[0-9a-f]{64}$/)
    const v1 = point(s, 1)
    assert.equal(v1.title, 'Initial backup')
    assert.deepEqual(v1.by, { kind: 'agent' })
    assert.equal(v1.notes, null, 'the trailer is not a note')
    assert.deepEqual(v1.database, first.database)
    assert.equal(v1.applicationAvailable, false, 'no running app container means no app snapshot')
    assert.equal('auto' in v1, false, 'auto only on a Before-restore point')
    assert.match(
      s.git('tag', '-l', '--format=%(contents)', 'tracy-release/v1'),
      /^Tracy-Database: sha256:[0-9a-f]{64} size:\d+ kind:sqlite tables:2$/m
    )
    assert.deepEqual(s.backup(['--op', 'initial-backup']), {
      ok: true,
      initial: true,
      already: true,
      stderr: ''
    })
    // Files 0600 in a 0700 dir, beside the site, never in the webroot.
    assert.equal(statSync(s.backups).mode & 0o777, 0o700)
    for (const f of readdirSync(s.backups)) assert.equal(statSync(join(s.backups, f)).mode & 0o777, 0o600, f)
    assert.deepEqual(readdirSync(s.backups).sort(), ['v1.sqlite.gz', 'v1.uploads.tar.gz'])

    const other = stack('emdash')
    try {
      other.run(GIT, ['--op', 'ensure'])
      other.create('A point made before any Initial backup')
      const late = other.backup(['--op', 'initial-backup'])
      assert.deepEqual([late.initial, late.reason], [false, 'later backups exist'])
      assert.equal(point(other, 1).database, null, 'no dump today pinned to the site-as-built mark')
    } finally {
      other.dispose()
    }
  } finally {
    s.dispose()
  }
})

test('EmDash: an ordinary backup snapshots app code when available, skips it when unavailable, and export requires it', () => {
  const withApp = stack('emdash')
  const withoutApp = stack('emdash')
  try {
    assert.equal(withApp.backup(['--op', 'initial-backup'], { FAKE_WEB_CONTAINER: 'fake-web' }).initial, true)
    assert.equal(point(withApp, 1).applicationAvailable, true)
    const appArchive = join(withApp.backups, 'v1.app.tar')
    assert.equal(existsSync(appArchive), true)
    assert.match(execFileSync('tar', ['-tf', appArchive], { encoding: 'utf8' }), /\.\/package\.json/)
    withApp.create('Ordinary backup with app', { FAKE_WEB_CONTAINER: 'fake-web' })
    assert.equal(point(withApp, 2).applicationAvailable, true)

    assert.equal(withoutApp.backup(['--op', 'initial-backup']).initial, true)
    assert.equal(point(withoutApp, 1).applicationAvailable, false)
    assert.equal(existsSync(join(withoutApp.backups, 'v1.app.tar')), false)
    assert.equal(withoutApp.create('Ordinary backup without app').version, 2)
    assert.equal(point(withoutApp, 2).applicationAvailable, false)
    assert.equal(existsSync(join(withoutApp.backups, 'v2.app.tar')), false)
    assert.throws(
      () => withoutApp.backup(['--op', 'create', '--title', 'Export snapshot', '--include-large']),
      /EmDash app container is not running/
    )
  } finally {
    withApp.dispose()
    withoutApp.dispose()
  }
})

// Regression (CI flake of the test above, 04/10/2026): the "v1 already has its database" check
// piped the tag message into `grep -q` under `pipefail`. bash line-buffers its stdout, so the line
// after `Tracy-Database:` (`Tracy-Uploads:`) could be written after grep had matched and quit:
// SIGPIPE, status 141, and the check said "no database yet" — a second Initial backup re-dumped
// and re-tagged v1. About 1 call in 100 on a loaded Linux runner. More text after the trailer than
// a pipe holds makes that loss certain instead of rare.
test('EmDash: a second Initial backup says "already" even when v1’s message runs on past its database line', () => {
  const s = stack('emdash')
  try {
    assert.equal(s.backup(['--op', 'initial-backup']).database.ok, true)
    const v1 = 'tracy-release/v1'
    const message = join(s.srv, 'v1-message')
    writeFileSync(
      message,
      `${s.git('tag', '-l', '--format=%(contents)', v1).trimEnd()}\n${'Tracy-Note: x\n'.repeat(16384)}`
    )
    const target = s.git('rev-parse', `${v1}^{commit}`).trim()
    execFileSync(
      'git',
      ['--git-dir', join(s.priv, 'webroot-baseline.git'), 'tag', '-f', '-a', v1, '-F', message, target],
      {
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_COMMITTER_NAME: 'Agent',
          GIT_COMMITTER_EMAIL: 'agent@tracy.ai'
        },
        stdio: 'ignore'
      }
    )
    assert.deepEqual(s.backup(['--op', 'initial-backup']), {
      ok: true,
      initial: true,
      already: true,
      stderr: ''
    })
  } finally {
    s.dispose()
  }
})

test('a list read while provision still holds the site builds nothing; after it, v1 is provision’s (QA r2)', async () => {
  const s = stack('emdash')
  // provision.sh holds tracy-provision-<label>.lock for the whole build.
  const lock = join(s.srv, `tracy-provision-${LABEL}.lock`)
  writeFileSync(lock, '')
  const holder = spawn('python3', [
    '-c',
    'import fcntl,sys,time\nf=open(sys.argv[1],"w")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("held",flush=True)\ntime.sleep(60)',
    lock
  ])
  try {
    await new Promise((resolve, reject) => {
      holder.stdout.once('data', resolve)
      holder.once('exit', reject)
    })
    const env = { TRACY_PROVISION_LOCK_DIR: s.srv }
    const early = s.run(GIT, ['--op', 'history'], env)
    assert.equal(early.building, true)
    assert.deepEqual([early.latest, early.rows], [null, []])
    assert.equal(existsSync(join(s.priv, 'webroot-baseline.git')), false, 'no history built by a reader')
    holder.kill()
    await new Promise((resolve) => holder.once('exit', resolve))
    // Provision's own end: the Initial backup builds the repo and v1 with its database.
    const first = s.backup(['--op', 'initial-backup'], env)
    assert.equal(first.database?.ok, true)
    const later = s.run(GIT, ['--op', 'history'], env)
    assert.equal(later.building, undefined)
    assert.equal(later.latest.version, 1)
  } finally {
    holder.kill()
    s.dispose()
  }
})

test('EmDash: Restore everything brings data.db and uploads back, takes a Before-restore backup first, and that one restores back', () => {
  const s = stack('emdash')
  try {
    s.backup(['--op', 'initial-backup'])
    const made = s.create('Good state')
    assert.equal(made.version, 2)
    assert.equal(made.database.ok, true)
    assert.equal(made.databaseError, null)
    assert.equal('auto' in made, false)
    // After the point: a new post, a new upload, a changed upload.
    sqlite(join(s.priv, 'data', 'data.db'), ["insert into posts (title) values ('Written after')"])
    writeFileSync(join(s.priv, 'uploads', 'b.jpg'), 'image b\n')
    writeFileSync(join(s.priv, 'uploads', 'a.jpg'), 'image a, edited\n')

    const done = s.restore(2)
    assert.equal(done.ok, true, JSON.stringify(done))
    assert.equal(done.kind, 'sqlite')
    assert.equal(done.files, 0)
    assert.deepEqual(
      done.database,
      { restored: true, sha256: made.database.sha256 },
      'the LOADED point, not the Before-restore dump'
    )
    assert.deepEqual(
      done.steps.map((x) => `${x.step}:${x.state}`),
      ['verify:done', 'before-restore:done', 'load:done', 'files:skipped', 'swap:done', 'check:done']
    )
    timings.push(['emdash', done.steps])
    assert.deepEqual(sqliteRead(join(s.priv, 'data', 'data.db'), 'select title from posts order by id'), [
      ['Hello']
    ])
    assert.equal(existsSync(join(s.priv, 'uploads', 'b.jpg')), false)
    assert.equal(readFileSync(join(s.priv, 'uploads', 'a.jpg'), 'utf8'), 'image a\n')
    assert.match(s.log(), /compose stop web\ncompose start web/)

    const before = point(s, done.beforeRestore.version)
    assert.equal(before.title, 'Before restore to Backup 2')
    assert.equal(before.auto, 'pre-restore')
    assert.deepEqual(before.by, { kind: 'person', name: 'Bo', email: 'bo@example.com' })
    assert.equal(before.database.ok, true)

    // The way back from the restore is the same verb on the Before-restore point.
    const back = s.restore(before.version)
    assert.equal(back.ok, true)
    assert.deepEqual(sqliteRead(join(s.priv, 'data', 'data.db'), 'select title from posts order by id'), [
      ['Hello'],
      ['Written after']
    ])
    assert.equal(readFileSync(join(s.priv, 'uploads', 'b.jpg'), 'utf8'), 'image b\n')
  } finally {
    s.dispose()
  }
})

test('EmDash: a host python3 whose SQLite cannot read the site schema still backs up and restores (QA-I01)', () => {
  // tracy-host's Debian python3 links SQLite 3.40; EmDash writes with 3.53 and its schema used
  // syntax 3.40 refuses ("malformed database schema … near ORDER"), so every EmDash Initial backup
  // stood without its database. Here python3's sqlite3 answers exactly that.
  const stub = mkdtempSync(join(tmpdir(), 'old-sqlite-'))
  mkdirSync(join(stub, 'sqlite3'))
  writeFileSync(
    join(stub, 'sqlite3', '__init__.py'),
    'class DatabaseError(Exception): pass\n' +
      'def connect(*a, **k):\n' +
      '    raise DatabaseError("malformed database schema (tracy_rowid_x) - near \\"ORDER\\": syntax error")\n'
  )
  const old = { PYTHONPATH: stub }
  const s = stack('emdash')
  try {
    // EmDash keeps its database in WAL mode; the copy must not leave -wal/-shm files behind (r2).
    sqlite(join(s.priv, 'data', 'data.db'), ['pragma journal_mode=wal'])
    const first = s.backup(['--op', 'initial-backup'], old)
    assert.equal(first.database?.ok, true, JSON.stringify(first))
    assert.deepEqual(readdirSync(s.backups).sort(), ['v1.sqlite.gz', 'v1.uploads.tar.gz'])
    assert.equal(first.database.engine, 'sqlite')
    assert.equal(point(s, 1).database.ok, true, 'v1 carries the database: a full Initial backup')
    sqlite(join(s.priv, 'data', 'data.db'), ["insert into posts (title) values ('Written after')"])
    const done = s.restore(1, old)
    assert.equal(done.ok, true, JSON.stringify(done))
    assert.deepEqual(sqliteRead(join(s.priv, 'data', 'data.db'), 'select title from posts order by id'), [
      ['Hello']
    ])
  } finally {
    s.dispose()
    rmSync(stub, { recursive: true, force: true })
  }
})

test('EmDash: a check that fails after the swap puts the old content back and starts the site', () => {
  const s = stack('emdash')
  try {
    s.backup(['--op', 'initial-backup'])
    sqlite(join(s.priv, 'data', 'data.db'), ["insert into posts (title) values ('Newer')"])
    const failed = s.restore(1, { TRACY_TEST_FAIL_AFTER_SWAP: '1' })
    assert.equal(failed.ok, false)
    assert.equal(failed.code, 'RESTORE_FAILED')
    assert.equal(failed.failedStep, 'check')
    assert.equal(failed.rolledBack, true)
    assert.deepEqual(sqliteRead(join(s.priv, 'data', 'data.db'), 'select title from posts order by id'), [
      ['Hello'],
      ['Newer']
    ])
    assert.match(s.log().trim().split('\n').at(-1), /compose start web/)
  } finally {
    s.dispose()
  }
})

test('a point whose dump is gone, damaged or expired is not "full", and Restore everything refuses it', () => {
  const s = stack('emdash')
  try {
    s.backup(['--op', 'initial-backup'])
    s.create('Two')
    s.create('Three')
    writeFileSync(join(s.backups, 'v2.uploads.tar.gz'), 'not the bytes the tag names')
    rmSync(join(s.backups, 'v3.sqlite.gz'))
    assert.deepEqual([point(s, 2).database.ok, point(s, 2).database.reason], [false, 'mismatch'])
    assert.deepEqual([point(s, 3).database.ok, point(s, 3).database.reason], [false, 'missing'])
    for (const v of [2, 3]) {
      const refused = s.restore(v)
      assert.equal(refused.ok, false)
      assert.equal(refused.code, 'BACKUP_NOT_FULL')
      assert.deepEqual(refused.database, point(s, v).database)
    }
    // A point that moved since the caller saw it is refused too.
    const moved = s.run(BACKUP, ['--op', 'restore-everything', '--version', '1', '--sha', 'f'.repeat(40)])
    assert.equal(moved.code, 'BACKUP_SHA_MISMATCH')
    assert.deepEqual(s.restore(9), { ok: false, code: 'NO_SUCH_BACKUP', version: 9, stderr: '' })
    assert.equal(s.list().length, 3, 'a refusal takes no Before-restore backup')
  } finally {
    s.dispose()
  }
})

test('retention: the newest N dumps of points a person made, M of Before-restore points; v1 never expires', () => {
  const s = stack('emdash')
  try {
    const keep = { TRACY_BACKUP_KEEP: '2', TRACY_BACKUP_KEEP_AUTO: '1' }
    s.backup(['--op', 'initial-backup'])
    for (const t of ['two', 'three', 'four', 'five']) s.create(t, keep)
    const states = () =>
      Object.fromEntries(s.list().map((r) => [r.version, r.database.ok || r.database.reason]))
    assert.deepEqual(states(), { 1: true, 2: 'removed', 3: 'removed', 4: true, 5: true })
    assert.equal(point(s, 2).title, 'two', 'the tag and its files stay')
    s.restore(5, keep)
    s.restore(5, keep)
    const autos = s.list().filter((r) => r.auto === 'pre-restore')
    assert.equal(autos.length, 2)
    assert.deepEqual(
      autos.map((r) => r.database.ok || r.database.reason),
      [true, 'removed']
    )
    assert.equal(point(s, 1).database.ok, true)
  } finally {
    s.dispose()
  }
})

test('a site with no database to back up, or one whose dump fails, still gets its backup — as a file backup that says why', () => {
  const s = stack('wordpress')
  try {
    s.run(GIT, ['--op', 'ensure'])
    const failed = s.create('Dump fails', { FAKE_DB_FAIL: '1' })
    assert.equal(failed.ok, true)
    assert.equal(failed.database, null)
    assert.match(failed.databaseError, /database unreachable/)
    assert.equal(point(s, failed.version).database, null)
    assert.equal(existsSync(s.backups) ? readdirSync(s.backups).length : 0, 0, 'nothing half-written left')
    // A backup made before ADR 0024 (no trailer) reads the same.
    assert.equal(point(s, 1).database, null)
    // Notes shaped like our trailers do not become one.
    const notes = join(s.srv, 'notes.md')
    writeFileSync(notes, `Design\nTracy-Database: sha256:${'0'.repeat(64)} size:1 kind:mysql tables:1\n`)
    const spoof = s.backup(['--op', 'create', '--title', 'Spoof', '--notes-file', notes], {
      FAKE_DB_FAIL: '1'
    })
    assert.equal(point(s, spoof.version).database, null)
    assert.equal(point(s, spoof.version).notes, 'Design')
  } finally {
    s.dispose()
  }
})

test('history (webroot-git.sh) shows a backup point without its trailers in the notes', () => {
  const s = stack('emdash')
  try {
    s.backup(['--op', 'initial-backup'])
    const notes = join(s.srv, 'notes.md')
    writeFileSync(notes, 'Design\n· a note\n')
    s.backup(['--op', 'create', '--title', 'With notes', '--notes-file', notes])
    const history = s.run(GIT, ['--op', 'history'])
    const rows = history.rows.filter((r) => r.kind === 'backup')
    assert.deepEqual(
      rows.map((r) => [r.version, r.notes]),
      [
        [2, 'Design\n· a note'],
        [1, null]
      ]
    )
    // The same `database` as the backup list, on the history's backup rows (tracy-web reads both).
    assert.deepEqual(
      rows.map((r) => r.database),
      [point(s, 2).database, point(s, 1).database]
    )
    assert.equal(rows[0].database.ok, true)
  } finally {
    s.dispose()
  }
})

// ── WordPress/Joomla: a real MariaDB ─────────────────────────────────────────────────────────

test(
  'MariaDB: a backup dumps the database (snapshot copies left out) beside the site and names it on the tag',
  mysqlOpts,
  () => {
    freshWordpress()
    const s = stack('wordpress')
    try {
      s.run(GIT, ['--op', 'ensure'])
      const first = s.backup(['--op', 'initial-backup'])
      assert.equal(first.database.ok, true)
      assert.equal(first.database.engine, 'mariadb')
      const dump = execFileSync('gzip', ['-dc', join(s.backups, 'v1.mysql.gz')], { encoding: 'utf8' })
      assert.match(dump, /CREATE TABLE `wp_posts`/)
      assert.doesNotMatch(dump, /_tracy_snap_/)
      assert.match(
        s.git('tag', '-l', '--format=%(contents)', 'tracy-release/v1'),
        /^Tracy-Database: sha256:[0-9a-f]{64} size:\d+ kind:mysql tables:2$/m,
        '_tracy_snap_* is a copy, not a table of the site'
      )
      assert.doesNotMatch(first.stderr, /Hello world/, 'logs carry sizes and hashes, never rows')
    } finally {
      s.dispose()
    }
  }
)

test(
  'MariaDB: Restore everything — data written after the point is gone, files too; the Before-restore point brings it all back',
  mysqlOpts,
  () => {
    freshWordpress()
    const s = stack('wordpress')
    try {
      s.run(GIT, ['--op', 'ensure'])
      s.backup(['--op', 'initial-backup'])
      const good = s.create('Good')
      // After the point: a post, a new table a plugin made, a setting, a file.
      sql(
        "INSERT INTO wp_posts (title) VALUES ('Order 1001'); CREATE TABLE wp_plugin_log (id INT); UPDATE wp_options SET value='After' WHERE name='blogname'",
        'wordpress'
      )
      writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 9px }\n')

      const done = s.restore(good.version)
      assert.equal(done.ok, true, JSON.stringify(done))
      assert.deepEqual(
        done.steps.map((x) => `${x.step}:${x.state}`),
        ['verify:done', 'before-restore:done', 'load:done', 'files:done', 'swap:done', 'check:done']
      )
      timings.push(['mariadb', done.steps])
      assert.deepEqual(done.database, { restored: true, sha256: good.database.sha256 })
      assert.equal(done.files, 1)
      assert.equal(done.head, s.git('rev-parse', 'HEAD').trim())
      assert.deepEqual(titles(), ['Hello world'])
      assert.equal(sql("SELECT value FROM wp_options WHERE name='blogname'", 'wordpress'), 'Before')
      assert.deepEqual(
        liveTables().sort(),
        ['_tracy_snap_j6__wp_posts', 'wp_options', 'wp_posts'],
        'the plugin table left with the rest; the snapshot copy stayed'
      )
      assert.equal(
        readFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'utf8'),
        'body { margin: 0 }\n'
      )
      assert.match(s.git('log', '-1', '--format=%ae %s'), /^fleet@tracy\.ai restore: back to /)
      // What it replaced is kept aside, not dropped; the scratch schema is gone.
      const schemas = sql(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'wordpress\\_%'"
      ).split('\n')
      assert.equal(schemas.length, 1)
      assert.match(schemas[0], /^wordpress_tracy_trash_\d+$/)

      const back = s.restore(done.beforeRestore.version)
      assert.equal(back.ok, true)
      assert.deepEqual(titles(), ['Hello world', 'Order 1001'])
      assert.equal(sql("SELECT value FROM wp_options WHERE name='blogname'", 'wordpress'), 'After')
      assert.ok(liveTables().includes('wp_plugin_log'))
      assert.equal(
        readFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'utf8'),
        'body { margin: 9px }\n'
      )
    } finally {
      s.dispose()
    }
  }
)

test(
  'MariaDB: tables with triggers swap too — the restored triggers end up live (QA-I10, Joomla)',
  mysqlOpts,
  () => {
    // A Joomla extension's triggers made the one RENAME TABLE fail with "ERROR 1435 Trigger in
    // wrong schema" (MariaDB refuses to move a table with triggers to another schema).
    freshWordpress()
    const trigger = (name) =>
      `CREATE TRIGGER ${name} BEFORE INSERT ON wp_posts FOR EACH ROW SET NEW.title = CONCAT(NEW.title, '')`
    sql(trigger('wp_posts_keep'), 'wordpress')
    const triggers = () =>
      sql("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema='wordpress' ORDER BY 1")
        .split('\n')
        .filter(Boolean)
    const s = stack('wordpress')
    try {
      s.run(GIT, ['--op', 'ensure'])
      s.backup(['--op', 'initial-backup'])
      const good = s.create('Good')
      sql("DROP TRIGGER wp_posts_keep; INSERT INTO wp_posts (title) VALUES ('Order 1001')", 'wordpress')
      sql(trigger('wp_posts_later'), 'wordpress')

      const done = s.restore(good.version)
      assert.equal(done.ok, true, JSON.stringify(done))
      assert.deepEqual(titles(), ['Hello world'])
      assert.deepEqual(triggers(), ['wp_posts_keep'], 'the point’s triggers, not the ones made after it')

      // A check that fails after the swap swaps back — triggers included.
      const failed = s.restore(done.beforeRestore.version, { TRACY_TEST_FAIL_AFTER_SWAP: '1' })
      assert.equal(failed.ok, false)
      assert.equal(failed.failedStep, 'check')
      assert.deepEqual(triggers(), ['wp_posts_keep'], 'the swap-back keeps what was live')
      assert.deepEqual(titles(), ['Hello world'])

      const back = s.restore(done.beforeRestore.version)
      assert.equal(back.ok, true, JSON.stringify(back))
      assert.deepEqual(titles(), ['Hello world', 'Order 1001'])
      assert.deepEqual(triggers(), ['wp_posts_later'])
    } finally {
      s.dispose()
    }
  }
)

test('MariaDB: a check that fails after the swap swaps back and puts the files back', mysqlOpts, () => {
  freshWordpress()
  const s = stack('wordpress')
  try {
    s.run(GIT, ['--op', 'ensure'])
    s.backup(['--op', 'initial-backup'])
    sql("INSERT INTO wp_posts (title) VALUES ('Keep me')", 'wordpress')
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 3px }\n')
    const failed = s.restore(1, { TRACY_TEST_FAIL_AFTER_SWAP: '1' })
    assert.equal(failed.ok, false)
    assert.equal(failed.failedStep, 'check')
    assert.equal(failed.rolledBack, true)
    assert.deepEqual(titles(), ['Hello world', 'Keep me'])
    assert.equal(
      readFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'utf8'),
      'body { margin: 3px }\n'
    )
  } finally {
    s.dispose()
  }
})

test('MariaDB: a damaged dump is refused before anything moves', mysqlOpts, () => {
  freshWordpress()
  const s = stack('wordpress')
  try {
    s.run(GIT, ['--op', 'ensure'])
    s.backup(['--op', 'initial-backup'])
    appendFileSync(join(s.backups, 'v1.mysql.gz'), 'x')
    sql("INSERT INTO wp_posts (title) VALUES ('Still here')", 'wordpress')
    const refused = s.restore(1)
    assert.equal(refused.code, 'BACKUP_NOT_FULL')
    assert.deepEqual([refused.database.ok, refused.database.reason], [false, 'mismatch'])
    assert.deepEqual(titles(), ['Hello world', 'Still here'])
  } finally {
    s.dispose()
  }
})
