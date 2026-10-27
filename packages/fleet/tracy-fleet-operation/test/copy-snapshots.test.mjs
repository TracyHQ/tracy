/**
 * The sweep of the table snapshots `db.snapshot` leaves in a copy's own database (#1649):
 * `lib/copy_snapshots.py` (the rule and the stamp), `tracy_snap_sweep` (lib/site-backup.sh, run by
 * every backup's retention) and `tools/sweep-copy-snapshots.sh` (tracy-host's daily clock).
 *
 * The rule runs everywhere. The drops need a real MariaDB: those tests start `mariadb:11` in a
 * container of their own (removed at the end) and are SKIPPED where no docker daemon answers. A
 * `docker` stand-in on PATH forwards `docker compose exec -T [-e K=V] db <cmd>` to that container,
 * so the scripts' own command lines run unchanged; a stack holding a `db-down` file answers as a
 * stopped database.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/copy-snapshots.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const PLANNER = join(scripts, 'lib', 'copy_snapshots.py')
const SWEEP = join(scripts, 'tools', 'sweep-copy-snapshots.sh')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')

const DAY = 86400
const NOW = Math.floor(Date.UTC(2026, 9, 24, 12, 0, 0) / 1000)
/** The tag `db.snapshot` writes (`gmdate('YmdHis')`) for a moment `days` before `now`. */
const tagAt = (days, now = NOW) =>
  new Date((now - days * DAY) * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14)

const planOf = (names, args = []) => {
  const r = spawnSync('python3', [PLANNER, 'plan', '--schema', 'joomla', '--now', String(NOW), ...args], {
    input: names.join('\n') + '\n',
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  const lines = r.stdout.trim().split('\n')
  return { answer: JSON.parse(lines.at(-1)), statements: lines.slice(0, -1) }
}

// ── the stamp and the rule: run everywhere ──────────────────────────────────────────────────

test('the tag is read as the UTC time gmdate("YmdHis") wrote; anything else is no time at all', () => {
  const epoch = (tag) =>
    execFileSync(
      'python3',
      [
        // -B: no __pycache__ beside the script (an ignored file in the tree is a CI input fault).
        '-B',
        '-c',
        'import sys; sys.path.insert(0, sys.argv[1]); from copy_snapshots import stamp_epoch; print(stamp_epoch(sys.argv[2]))',
        join(scripts, 'lib'),
        tag
      ],
      { encoding: 'utf8' }
    ).trim()
  assert.equal(epoch('20261023000000'), String(Date.UTC(2026, 9, 23) / 1000), 'UTC, not the host’s zone')
  assert.equal(epoch('20240229235959'), String(Date.UTC(2024, 1, 29, 23, 59, 59) / 1000))
  for (const bad of [
    '20261340000000',
    '20230229000000',
    '20261023250000',
    '2026102300000',
    '202610230000000',
    'j6',
    ''
  ])
    assert.equal(epoch(bad), 'None', bad)
  assert.equal(tagAt(1), '20261023120000', 'the test’s own stamps are the engine’s shape')
})

test('the rule: a tag goes whole once older than seven days, unless it is the newest; undated names, the trash and the site’s tables are never named', () => {
  const old = tagAt(30)
  const older = tagAt(10)
  const young = tagAt(2)
  const { answer, statements } = planOf([
    `_tracy_snap_${old}__jos_content`,
    `_tracy_snap_${old}__jos_menu`,
    `_tracy_snap_${older}__jos_extensions`,
    `_tracy_snap_${young}__jos_extensions`,
    '_tracy_snap_j6__jos_content',
    '_tracy_snap_20261340000000__jos_menu',
    `_tracy_trash_${old}__jos_old`,
    'jos_content'
  ])
  assert.deepEqual(answer.kept, [young])
  assert.deepEqual(answer.dropped, [older, old], 'newest first')
  assert.equal(answer.tags, 3)
  assert.equal(answer.tables, 3)
  assert.deepEqual(answer.undated, ['_tracy_snap_20261340000000__jos_menu', '_tracy_snap_j6__jos_content'])
  assert.deepEqual(statements, [
    `DROP TABLE IF EXISTS \`joomla\`.\`_tracy_snap_${older}__jos_extensions\`;`,
    `DROP TABLE IF EXISTS \`joomla\`.\`_tracy_snap_${old}__jos_content\`, \`joomla\`.\`_tracy_snap_${old}__jos_menu\`;`
  ])
  assert.match(
    answer.said,
    /^2 of 3 tag\(s\) dropped \(3 tables\), kept \d{14}; 2 undated name\(s\) left alone$/
  )
})

test('the rule: the newest tag stays whatever its age, and only the newest; --keep-newest 0 lets it go too', () => {
  const names = [`_tracy_snap_${tagAt(40)}__jos_content`, `_tracy_snap_${tagAt(20)}__jos_content`]
  assert.deepEqual(planOf(names).answer.kept, [tagAt(20)])
  assert.deepEqual(planOf(names).answer.dropped, [tagAt(40)])
  assert.deepEqual(planOf(names, ['--keep-newest', '0']).answer.dropped, [tagAt(20), tagAt(40)])
  assert.deepEqual(planOf(names, ['--keep-newest', '2']).answer.dropped, [])
  // The window is the operator's: three days instead of seven.
  assert.deepEqual(
    planOf([`_tracy_snap_${tagAt(5)}__a`, `_tracy_snap_${tagAt(1)}__a`], ['--keep-days', '3']).answer.dropped,
    [tagAt(5)]
  )
})

test('the rule: a stamp in the future is young; nothing to sweep says nothing', () => {
  const { answer, statements } = planOf([`_tracy_snap_${tagAt(-3)}__jos_content`], ['--keep-newest', '0'])
  assert.deepEqual(answer.kept, [tagAt(-3)])
  assert.deepEqual(statements, [])
  assert.equal(answer.said, '')
  assert.deepEqual(planOf(['jos_content']).answer, {
    tags: 0,
    kept: [],
    dropped: [],
    tables: 0,
    undated: [],
    said: ''
  })
})

test('the rule: a large tag is dropped in batches, every batch of that one tag; a name is quoted, never spliced', () => {
  const tag = tagAt(9)
  const names = ['a', 'b', 'c', 'd', 'e'].map((t) => `_tracy_snap_${tag}__jos_${t}`)
  const { statements } = planOf([...names, `_tracy_snap_${tagAt(1)}__x`], ['--batch', '2'])
  assert.equal(statements.length, 3)
  for (const s of statements)
    assert.match(
      s,
      new RegExp(`^DROP TABLE IF EXISTS (\`joomla\`\\.\`_tracy_snap_${tag}__jos_[a-e]\`(, )?)+;$`)
    )
  const odd = planOf([`_tracy_snap_${tag}__jos\`; DROP DATABASE joomla; --`, `_tracy_snap_${tagAt(1)}__x`])
  assert.deepEqual(odd.statements, [
    `DROP TABLE IF EXISTS \`joomla\`.\`_tracy_snap_${tag}__jos\`\`; DROP DATABASE joomla; --\`;`
  ])
})

// ── the drops: a real MariaDB ───────────────────────────────────────────────────────────────

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-copy-snapshots-test-db-${process.pid}`
const mysqlOpts = { skip: DOCKER_UP ? false : 'no docker daemon here: the drops need a real MariaDB' }

const shimDir = mkdtempSync(join(tmpdir(), 'snap-docker-'))
writeFileSync(
  join(shimDir, 'docker'),
  `#!/usr/bin/env bash
echo "$PWD $*" >> "$FAKE_DOCKER_LOG"
if [ "$1" = compose ] && [ "$2" = exec ]; then
  shift 2; envs=()
  while [ "$1" = -T ] || [ "$1" = -e ]; do
    if [ "$1" = -e ]; then envs+=(-e "$2"); shift 2; else shift; fi
  done
  shift # the service name
  if [ -f "$PWD/db-down" ]; then echo "service db is not running" >&2; exit 1; fi
  exec "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@"
fi
exit 0
`
)
chmodSync(join(shimDir, 'docker'), 0o755)
after(() => rmSync(shimDir, { recursive: true, force: true }))

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
    { encoding: 'utf8' }
  ).trim()
const tablesOf = (db) =>
  sql(`SELECT table_name FROM information_schema.tables WHERE table_schema='${db}'`)
    .split('\n')
    .filter(Boolean)
    .sort()

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
  // Over TCP: the image's first-boot server listens on the socket only and then restarts.
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

/** A host root with sites in it: `{label: platform}`; each MariaDB site gets a fresh schema. */
function host(sites) {
  const srv = mkdtempSync(join(tmpdir(), 'snap-sweep-'))
  for (const [label, platform] of Object.entries(sites)) {
    const priv = join(srv, label)
    mkdirSync(join(priv, '.webroot'), { recursive: true })
    writeFileSync(join(priv, 'docker-compose.yml'), 'services: {}\n')
    writeFileSync(
      join(priv, '.env'),
      platform === 'emdash' ? 'PLATFORM=emdash\n' : `PLATFORM=${platform}\nDB_PASSWORD=t\n`
    )
    if (platform !== 'emdash') sql(`DROP DATABASE IF EXISTS ${platform}; CREATE DATABASE ${platform}`)
  }
  mkdirSync(join(srv, '_brands'))
  const log = join(srv, 'docker.log')
  writeFileSync(log, '')
  const env = (extra = {}) => ({
    ...process.env,
    PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
    REAL_DOCKER,
    TEST_DB_CONTAINER: DB_CONTAINER,
    FAKE_DOCKER_LOG: log,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    TRACY_SNAP_SWEEP_LOCK: join(srv, 'sweep.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...extra
  })
  return {
    srv,
    env,
    sweep: (args = [], extra) => spawnSync('bash', [SWEEP, ...args], { env: env(extra), encoding: 'utf8' }),
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

/** A snapshot of `table` under `tag`, the way the engine's copyTable leaves it. */
const snap = (db, tag, table) =>
  sql(
    `CREATE TABLE \`_tracy_snap_${tag}__${table}\` LIKE \`${table}\`; INSERT INTO \`_tracy_snap_${tag}__${table}\` SELECT * FROM \`${table}\``,
    db
  )

const now = () => Math.floor(Date.now() / 1000)

test(
  'the daily sweep: every MariaDB copy on the host loses its expired tags whole, keeps the young, the newest, the undated and the trash; EmDash and non-sites are passed over',
  mysqlOpts,
  () => {
    const h = host({ 'joomla-site': 'joomla', 'wp-site': 'wordpress', 'emdash-site': 'emdash' })
    try {
      const t = now()
      const old = tagAt(30, t)
      const older = tagAt(10, t)
      const young = tagAt(1, t)
      sql(
        "CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(50)); INSERT INTO jos_content VALUES (1, 'Hello'); CREATE TABLE jos_menu (id INT PRIMARY KEY)",
        'joomla'
      )
      snap('joomla', old, 'jos_content')
      snap('joomla', old, 'jos_menu')
      snap('joomla', older, 'jos_content')
      snap('joomla', young, 'jos_menu')
      sql(
        `CREATE TABLE _tracy_snap_j6__jos_content (id INT); CREATE TABLE _tracy_trash_${old}__jos_old (id INT)`,
        'joomla'
      )
      // A site whose only snapshots are old: the newest one stays.
      sql('CREATE TABLE wp_posts (id INT PRIMARY KEY)', 'wordpress')
      snap('wordpress', tagAt(40, t), 'wp_posts')
      snap('wordpress', tagAt(20, t), 'wp_posts')

      const r = h.sweep()
      assert.equal(r.status, 0, r.stderr)
      assert.deepEqual(tablesOf('joomla'), [
        `_tracy_snap_${young}__jos_menu`,
        '_tracy_snap_j6__jos_content',
        `_tracy_trash_${old}__jos_old`,
        'jos_content',
        'jos_menu'
      ])
      assert.equal(sql('SELECT title FROM jos_content', 'joomla'), 'Hello', 'the site’s own rows untouched')
      assert.deepEqual(tablesOf('wordpress'), [`_tracy_snap_${tagAt(20, t)}__wp_posts`, 'wp_posts'])
      assert.match(r.stderr, /joomla-site: table snapshots: 2 of 3 tag\(s\) dropped \(3 tables\)/)
      assert.match(r.stderr, /wp-site: table snapshots: 1 of 2 tag\(s\) dropped \(1 tables\)/)
      assert.doesNotMatch(r.stderr, /emdash-site|_brands/)
      assert.match(r.stderr, /done: 2 swept, 0 busy, 0 unreachable, 0 failed\n$/)

      // Run again: nothing left to drop, nothing said beyond the undated names.
      const again = h.sweep()
      assert.equal(again.status, 0)
      assert.doesNotMatch(again.stderr, /dropped/)
      assert.match(again.stderr, /done: 2 swept/)
      // One site by name.
      const one = h.sweep(['wp-site'])
      assert.match(one.stderr, /done: 1 swept, 0 busy, 0 unreachable, 0 failed/)
      assert.equal(h.sweep(['../etc']).status, 2, 'a label is fenced like every webroot script’s')
    } finally {
      h.dispose()
    }
  }
)

test(
  'the daily sweep: a site a webroot job holds is skipped without waiting, a stopped database is unreachable, and neither fails the run',
  mysqlOpts,
  async () => {
    const h = host({ 'busy-site': 'joomla', 'down-site': 'wordpress' })
    try {
      const t = now()
      sql('CREATE TABLE jos_content (id INT PRIMARY KEY)', 'joomla')
      snap('joomla', tagAt(30, t), 'jos_content')
      snap('joomla', tagAt(1, t), 'jos_content')
      writeFileSync(join(h.srv, 'down-site', 'db-down'), '')
      const repo = join(h.srv, 'busy-site', 'webroot-baseline.git')
      mkdirSync(repo)
      // flock(2) on the site's webroot lock, as a restore holding it would.
      const holder = spawn(
        'python3',
        [
          '-c',
          'import fcntl,sys,time; f=open(sys.argv[1],"w"); fcntl.flock(f, fcntl.LOCK_EX); print("held", flush=True); time.sleep(60)',
          join(repo, 'tracy-webroot.lock')
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] }
      )
      await new Promise((resolve) => holder.stdout.once('data', resolve))
      try {
        const started = Date.now()
        const r = h.sweep()
        assert.equal(r.status, 0, r.stderr)
        assert.ok(Date.now() - started < 20000, 'no wait on a held site')
        assert.match(r.stderr, /busy-site: a webroot job holds the site — skipped/)
        assert.match(r.stderr, /down-site: the database does not answer — skipped/)
        assert.match(r.stderr, /done: 0 swept, 1 busy, 1 unreachable, 0 failed/)
        assert.equal(tablesOf('joomla').length, 3, 'nothing dropped under somebody else’s lock')
      } finally {
        holder.kill()
      }
      await new Promise((resolve) => holder.once('exit', resolve))
      const r = h.sweep()
      assert.match(r.stderr, /done: 1 swept, 0 busy, 1 unreachable, 0 failed/)
      assert.deepEqual(tablesOf('joomla'), [`_tracy_snap_${tagAt(1, t)}__jos_content`, 'jos_content'])
    } finally {
      h.dispose()
    }
  }
)

test(
  'every backup sweeps too (the retention step), under the backup’s own locks; TRACY_SNAP_KEEP_DAYS moves the window',
  mysqlOpts,
  () => {
    const label = 'backup-site'
    const h = host({ [label]: 'wordpress' })
    try {
      const webroot = join(h.srv, label, '.webroot')
      mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
      writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
      sql(
        "CREATE TABLE wp_posts (id INT PRIMARY KEY, title VARCHAR(50)); INSERT INTO wp_posts VALUES (1, 'Hello')",
        'wordpress'
      )
      const t = now()
      snap('wordpress', tagAt(12, t), 'wp_posts')
      snap('wordpress', tagAt(4, t), 'wp_posts')
      snap('wordpress', tagAt(1, t), 'wp_posts')
      const run = (script, args, extra) => {
        const r = spawnSync('bash', [script, '--label', label, ...args], {
          env: h.env(extra),
          encoding: 'utf8'
        })
        assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`)
        return { ...JSON.parse(r.stdout.trim().split('\n').at(-1)), stderr: r.stderr }
      }
      run(GIT, ['--op', 'ensure'])
      const first = run(BACKUP, ['--op', 'create', '--title', 'One'])
      assert.equal(first.database.ok, true)
      assert.match(first.stderr, /table snapshots: 1 of 3 tag\(s\) dropped \(1 tables\)/)
      assert.deepEqual(tablesOf('wordpress'), [
        `_tracy_snap_${tagAt(4, t)}__wp_posts`,
        `_tracy_snap_${tagAt(1, t)}__wp_posts`,
        'wp_posts'
      ])
      const second = run(BACKUP, ['--op', 'create', '--title', 'Two'], { TRACY_SNAP_KEEP_DAYS: '3' })
      assert.match(second.stderr, /table snapshots: 1 of 2 tag\(s\) dropped/)
      assert.deepEqual(tablesOf('wordpress'), [`_tracy_snap_${tagAt(1, t)}__wp_posts`, 'wp_posts'])
      assert.equal(sql('SELECT title FROM wp_posts', 'wordpress'), 'Hello')
    } finally {
      h.dispose()
    }
  }
)

test(
  'a drop the database refuses fails the daily run (named, the other sites still swept) and never the backup it rides on',
  mysqlOpts,
  () => {
    const h = host({ 'stuck-site': 'joomla', 'fine-site': 'wordpress' })
    try {
      const t = now()
      sql('CREATE TABLE jos_content (id INT PRIMARY KEY)', 'joomla')
      snap('joomla', tagAt(30, t), 'jos_content')
      snap('joomla', tagAt(1, t), 'jos_content')
      // A table that points at the old copy: InnoDB refuses to drop what a foreign key references.
      sql(
        `CREATE TABLE jos_pin (id INT PRIMARY KEY, FOREIGN KEY (id) REFERENCES \`_tracy_snap_${tagAt(30, t)}__jos_content\` (id))`,
        'joomla'
      )
      sql('CREATE TABLE wp_posts (id INT PRIMARY KEY)', 'wordpress')
      snap('wordpress', tagAt(30, t), 'wp_posts')
      snap('wordpress', tagAt(1, t), 'wp_posts')

      const r = h.sweep()
      assert.equal(r.status, 1, r.stderr)
      assert.match(r.stderr, /stuck-site: the sweep failed — .*1 drop\(s\) failed/)
      assert.match(r.stderr, /done: 1 swept, 0 busy, 0 unreachable, 1 failed/)
      assert.deepEqual(tablesOf('wordpress'), [`_tracy_snap_${tagAt(1, t)}__wp_posts`, 'wp_posts'])

      mkdirSync(join(h.srv, 'stuck-site', '.webroot', 'administrator', 'manifests', 'files'), {
        recursive: true
      })
      writeFileSync(
        join(h.srv, 'stuck-site', '.webroot', 'administrator', 'manifests', 'files', 'joomla.xml'),
        '<extension/>\n'
      )
      const env = h.env()
      const ensure = spawnSync('bash', [GIT, '--label', 'stuck-site', '--op', 'ensure'], {
        env,
        encoding: 'utf8'
      })
      assert.equal(ensure.status, 0, ensure.stderr)
      const made = spawnSync(
        'bash',
        [BACKUP, '--label', 'stuck-site', '--op', 'create', '--title', 'Still'],
        {
          env,
          encoding: 'utf8'
        }
      )
      assert.equal(made.status, 0, made.stderr)
      assert.equal(JSON.parse(made.stdout.trim().split('\n').at(-1)).ok, true)
      assert.match(made.stderr, /table snapshots: .*1 drop\(s\) failed/)
    } finally {
      h.dispose()
    }
  }
)
