/**
 * "Sync from live", end to end on a throwaway Joomla stack (`webroot/webroot-sync.sh`, plan
 * tasks/ke-hoach-dong-bo-tu-live.md §3.4): the copy is built (baseline, Initial backup), the agent
 * edits the copy while the customer edits the live site (files and database), `merge` answers a
 * backup point or the conflicts, and `apply` puts the result in place through Restore everything.
 *
 * Needs a real MariaDB (the swap is one `RENAME TABLE`; the merge is SQL): `mariadb:11` in a
 * container of its own, removed at the end; SKIPPED where no docker daemon answers. The docker
 * stand-in forwards `docker compose exec -T [-e K=V] db <cmd>` to that container, so the scripts'
 * own command lines run unchanged.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-flow.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const SYNC = join(scripts, 'webroot', 'webroot-sync.sh')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'shop-com'

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-sync-flow-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the sync needs a real MariaDB' }

// ── the docker stand-in (as test/site-backup.test.mjs) ─────────────────────────────────────────
const shimDir = mkdtempSync(join(tmpdir(), 'live-sync-docker-'))
writeFileSync(
  join(shimDir, 'docker'),
  `#!/usr/bin/env bash
# A docker CLI that cannot read its config warns on every call, on stderr (a sandboxed run does): no
# script may read that line as an answer (a backup once counted it as a table, and every restore failed).
echo 'WARNING: Error loading config file: permission denied (test stand-in)' >&2
if [ "$1" = compose ]; then
  shift
  case "$1" in
    exec)
      shift; envs=()
      while [ "$1" = -T ] || [ "$1" = -e ]; do
        if [ "$1" = -e ]; then envs+=(-e "$2"); shift 2; else shift; fi
      done
      service="$1"; shift
      if [ "$service" = web ]; then
        # The site's web container: no Joomla here. Say what the PHP would, and log what it was given.
        cat > /dev/null
        echo "web \${envs[*]}" >> "$FAKE_DOCKER_LOG"
        echo "TRACY_RESULT rebuild=none cache=cleared"
        echo "TRACY_RESULT content_reader=none"
        exit 0
      fi
      exec "$REAL_DOCKER" exec -i "\${envs[@]}" "$TEST_DB_CONTAINER" "$@" ;;
    *) exit 0 ;;
  esac
fi
exit 0
`
)
chmodSync(join(shimDir, 'docker'), 0o755)
// `chown` logged, then done for real: what a write gave the webroot's owner (#1562). A test run as
// a person owns the webroot already, so the real call changes nothing and cannot fail.
const REAL_CHOWN = spawnSync('sh', ['-c', 'command -v chown'], { encoding: 'utf8' }).stdout.trim()
writeFileSync(
  join(shimDir, 'chown'),
  `#!/usr/bin/env bash\nprintf 'chown %s\\n' "$*" >> "$FAKE_DOCKER_LOG"\nexec "${REAL_CHOWN}" "$@"\n`
)
chmodSync(join(shimDir, 'chown'), 0o755)
after(() => rmSync(shimDir, { recursive: true, force: true }))

const sql = (query, db = '') =>
  execFileSync(
    REAL_DOCKER,
    ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-N', '-B', ...(db ? [db] : [])],
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
    ['run', '-d', '--name', DB_CONTAINER, '-e', 'MARIADB_ROOT_PASSWORD=t', 'mariadb:11'],
    { stdio: 'ignore' }
  )
  for (let i = 0; i < 240; i++) {
    const ok = spawnSync(
      REAL_DOCKER,
      ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-h127.0.0.1', '-e', 'SELECT 1'],
      {
        stdio: 'ignore'
      }
    )
    if (ok.status === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test MariaDB never answered')
})
after(() => {
  if (DOCKER_UP) spawnSync(REAL_DOCKER, ['rm', '-f', '-v', DB_CONTAINER], { stdio: 'ignore' })
})

// ── a Joomla site ────────────────────────────────────────────────────────────────────────────
const config = (settings) =>
  `<?php\nclass JConfig {\n${Object.entries(settings)
    .map(([k, v]) => `\tpublic $${k} = ${v};`)
    .join('\n')}\n}\n`
const LIVE_CONFIG = {
  host: "'localhost'",
  user: "'shop'",
  password: "'live-password'",
  db: "'shop_live'",
  dbprefix: "'jos_'",
  live_site: "''",
  secret: "'live-secret'",
  sef_rewrite: 'true',
  sitename: "'Shop'"
}
const COPY_CONFIG = {
  ...LIVE_CONFIG,
  host: "'db'",
  user: "'root'",
  password: "'copy-password'",
  db: "'joomla'",
  live_site: "'https://shop-com.tracy.ai'",
  secret: "'fresh'"
}
const css = (edit = {}) => Array.from({ length: 20 }, (_, i) => edit[i] ?? `.rule-${i} {}`).join('\n') + '\n'
const SITE_FILES = {
  'index.php': '<?php // Joomla\n',
  'htaccess.txt': 'RewriteEngine On\n',
  '.htaccess': 'RewriteEngine On\n',
  'templates/t4/css/custom.css': css()
}
/** A SQL string literal (backslashes and quotes doubled). */
const sqlText = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
/** A T4 module's params, as Joomla writes them: the module's content a JSON string inside the JSON. */
const heroParams = (fields) =>
  JSON.stringify({ 'jatools-config': JSON.stringify({ ':type': 'tb-hero', 'tb-hero': fields }), cache: '0' })
const HERO = {
  'tb-hero[eyebrow]': ['Cam kết lâu dài'],
  'tb-hero[title]': ['Sản phẩm bền chắc'],
  'tb-hero[lead]': ['Chọn lọc từng sản phẩm'],
  'tb-hero[button]': ['Xem thêm']
}
/** The hero module's content as a database holds it now. */
/** The hero module's params as a database holds them (through HEX: batch output escapes backslashes). */
const paramsIn = (db = 'joomla') =>
  JSON.parse(
    Buffer.from(rows('SELECT HEX(params) FROM jos_modules WHERE id=441', db)[0][0], 'hex').toString('utf8')
  )
const heroIn = (db) => JSON.parse(paramsIn(db)['jatools-config'])['tb-hero']
const setHero = (db, change) => {
  const now = heroIn(db)
  sql(`UPDATE jos_modules SET params=${sqlText(heroParams({ ...now, ...change }))} WHERE id=441`, db)
}
const TABLES = `
CREATE TABLE jos_modules (id INT PRIMARY KEY, title VARCHAR(255), params MEDIUMTEXT);
CREATE TABLE jos_finder_links_terms (link_id INT, term_id INT, weight FLOAT, PRIMARY KEY (link_id, term_id));
INSERT INTO jos_modules VALUES (441, 'Home - Hero', ${sqlText(heroParams(HERO))});
CREATE TABLE jos_content (id INT PRIMARY KEY, title VARCHAR(255), introtext MEDIUMTEXT, hits INT, modified DATETIME NULL,
  checked_out INT UNSIGNED NULL, checked_out_time DATETIME NULL);
CREATE TABLE jos_extensions (extension_id INT PRIMARY KEY, type VARCHAR(20), folder VARCHAR(20), element VARCHAR(100), params TEXT);
INSERT INTO jos_content (id, title, introtext, hits, modified) VALUES (1,'Hello','first',0,'2026-01-01'),(2,'About','second',0,'2026-01-01');
INSERT INTO jos_extensions VALUES (10,'plugin','system','sef','{"domain":"https://shop.com"}'),
  (20,'component','','com_claudecowork','{"token":"live-token"}');
`

function write(root, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
}

function stack(extraTables = '') {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-live-sync-'))
  const priv = join(srv, LABEL)
  const webroot = join(priv, '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(join(priv, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(priv, '.env'), 'PLATFORM=joomla\nDB_PASSWORD=t\n')
  const env = {
    ...process.env,
    PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
    REAL_DOCKER,
    TEST_DB_CONTAINER: DB_CONTAINER,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    FAKE_DOCKER_LOG: join(srv, 'docker.log'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const run = (script, args, extra = () => ({})) => {
    const r = spawnSync('bash', [script, '--label', LABEL, ...args], {
      env: { ...env, ...extra(env) },
      encoding: 'utf8'
    })
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`)
    return JSON.parse(r.stdout.trim().split('\n').at(-1))
  }
  const git = (...args) =>
    execFileSync('git', ['--git-dir', join(priv, 'webroot-baseline.git'), '--work-tree', webroot, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' }
    }).trim()

  // The copy as provision hands it over: its webroot (configuration rendered, the root .htaccess
  // hardened), its database (the SEF plugin's live domain cleared), the baseline and v1.
  for (const db of sql(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'joomla%' OR schema_name LIKE 'live%'"
  )
    .split('\n')
    .filter(Boolean)) {
    sql(`DROP DATABASE \`${db}\``)
  }
  sql('CREATE DATABASE joomla CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(TABLES + extraTables, 'joomla')
  sql(`UPDATE jos_extensions SET params='{"domain": ""}' WHERE element='sef'`, 'joomla')
  write(webroot, { ...SITE_FILES, 'configuration.php': config(COPY_CONFIG) })
  execFileSync(
    'bash',
    ['-c', `. "${scripts}/lib/webroot-htaccess.sh"; tracy_ensure_webroot_htaccess "$1"`, 'x', webroot],
    { env }
  )
  run(GIT, ['--op', 'ensure'])
  run(BACKUP, ['--op', 'initial-backup'])

  // The live site, as the customer keeps it: a tree and a database of its own.
  const live = join(srv, 'live-site')
  write(live, { ...SITE_FILES, 'configuration.php': config(LIVE_CONFIG) })
  sql('CREATE DATABASE livesrc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  sql(TABLES + extraTables, 'livesrc')

  let reads = 0
  return {
    priv,
    webroot,
    live,
    git,
    run,
    /** A read of the live site, the way the puller leaves it for the host: a webroot tar and a dump. */
    read(inRuns = false) {
      // `inRuns`: where tracy-host puts a run (`<private>/sync/runs/<id>`), which the start sweeps.
      const dir = inRuns ? join(priv, 'sync', 'runs', `run-${++reads}`) : join(srv, `sync-${++reads}`)
      mkdirSync(join(dir, 'live'), { recursive: true })
      execFileSync('tar', ['-cf', join(dir, 'live', 'webroot.tar'), '-C', live, '.'])
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        {
          maxBuffer: 1 << 28
        }
      )
      execFileSync('sh', ['-c', `gzip -c > "${join(dir, 'live', 'db.sql.gz')}"`], { input: dump })
      return dir
    },
    merge: (dir, decisions) => {
      const args = ['--op', 'merge', '--dir', dir, '--by-name', 'Lee', '--by-email', 'lee@example.com']
      if (decisions) {
        writeFileSync(join(dir, 'decisions.json'), JSON.stringify(decisions))
        args.push('--decisions', join(dir, 'decisions.json'))
      }
      return run(SYNC, args)
    },
    apply: (dir) =>
      run(SYNC, ['--op', 'apply', '--dir', dir, '--by-name', 'Lee', '--by-email', 'lee@example.com']),
    sync: (dir, extra) => run(SYNC, ['--op', 'sync', '--dir', dir], extra),
    /** `sync` as tracy-host starts it: the live site read through `live-pull.mjs`, here a stand-in. */
    syncReading: (dir, pull) => {
      const lib = join(srv, 'lib-fake-pull')
      if (!existsSync(lib)) {
        mkdirSync(lib)
        for (const name of readdirSync(join(scripts, 'lib')))
          if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
        writeFileSync(join(lib, 'live-pull.mjs'), 'console.log(process.env.FAKE_PULL)\n')
      }
      const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'sync', '--dir', dir], {
        encoding: 'utf8',
        env: {
          ...env,
          TRACY_LIB_DIR: lib,
          TRACY_SYNC_ENDPOINT: 'https://shop.example/claudecowork',
          TRACY_SYNC_TOKEN: 'token-of-test',
          FAKE_PULL: JSON.stringify(pull)
        }
      })
      assert.equal(r.status, 0, r.stderr)
      return JSON.parse(r.stdout.trim().split('\n').at(-1))
    },
    /**
     * `sync` as tracy-host starts it, with a live read that succeeds: a `live-pull.mjs` stand-in
     * that lays the read in `from` (a `read()`'s `live/`) into the run and answers `pull`. The
     * script's own stderr comes back with the answer: the progress tracy-host keeps from it.
     */
    syncPulled: (dir, pull, from) => {
      const lib = join(srv, 'lib-copy-pull')
      if (!existsSync(lib)) {
        mkdirSync(lib)
        for (const name of readdirSync(join(scripts, 'lib')))
          if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
        writeFileSync(
          join(lib, 'live-pull.mjs'),
          `import { cpSync } from 'node:fs'
cpSync(process.env.FAKE_LIVE, process.argv[2] + '/live', { recursive: true })
console.log(process.env.FAKE_PULL)
`
        )
      }
      const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'sync', '--dir', dir], {
        encoding: 'utf8',
        env: {
          ...env,
          TRACY_LIB_DIR: lib,
          TRACY_SYNC_ENDPOINT: 'https://shop.example/claudecowork',
          TRACY_SYNC_TOKEN: 'token-of-test',
          FAKE_LIVE: from,
          FAKE_PULL: JSON.stringify(pull)
        }
      })
      assert.equal(r.status, 0, r.stderr)
      return { answer: JSON.parse(r.stdout.trim().split('\n').at(-1)), stderr: r.stderr }
    },
    /**
     * `sync` as tracy-host starts a Sync anyway (#1649): the held sync's run named, people's word
     * to go on, and a live read that answers its check (`TRACY_SYNC_CHECK_ONLY`) with `check` and a
     * whole read with `pull`, logging which it was asked for.
     */
    syncAnyway: (dir, held, { check, pull = { ok: false, code: 'PULL_FAILED' } }) => {
      const lib = join(srv, 'lib-anyway-pull')
      if (!existsSync(lib)) {
        mkdirSync(lib)
        for (const name of readdirSync(join(scripts, 'lib')))
          if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
        writeFileSync(
          join(lib, 'live-pull.mjs'),
          `import { appendFileSync } from 'node:fs'
const check = process.env.TRACY_SYNC_CHECK_ONLY === '1'
appendFileSync(process.env.PULL_LOG, (check ? 'check ' + process.env.TRACY_SYNC_FINGERPRINT_IN : 'read') + '\\n')
console.log(check ? process.env.FAKE_CHECK : process.env.FAKE_PULL)
`
        )
      }
      const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'sync', '--dir', dir], {
        encoding: 'utf8',
        env: {
          ...env,
          TRACY_LIB_DIR: lib,
          TRACY_SYNC_ENDPOINT: 'https://shop.example/claudecowork',
          TRACY_SYNC_TOKEN: 'token-of-test',
          TRACY_SYNC_ALLOW_HELD: '1',
          TRACY_SYNC_RESUME_DIR: held,
          PULL_LOG: join(srv, 'pull.log'),
          FAKE_CHECK: JSON.stringify(check),
          FAKE_PULL: JSON.stringify(pull)
        }
      })
      assert.equal(r.status, 0, r.stderr)
      const log = existsSync(join(srv, 'pull.log')) ? readFileSync(join(srv, 'pull.log'), 'utf8') : ''
      rmSync(join(srv, 'pull.log'), { force: true })
      return { answer: JSON.parse(r.stdout.trim().split('\n').at(-1)), log, stderr: r.stderr }
    },
    /** `apply`, killed where a restart could cut it (`TRACY_TEST_KILL_AT`): no answer, no cleanup. */
    applyKilledAt: (dir, point) => {
      // A process group of its own: the kill takes the whole tree, as a container stop does.
      const r = spawnSync(
        'python3',
        [
          '-c',
          'import os,sys; os.setpgrp(); os.execvp(sys.argv[1], sys.argv[1:])',
          'bash',
          SYNC,
          '--label',
          LABEL,
          '--op',
          'apply',
          '--dir',
          dir
        ],
        { env: { ...env, TRACY_TEST_KILL_AT: point }, encoding: 'utf8' }
      )
      assert.equal(r.signal, 'SIGKILL', `${point}: ${r.status}\n${r.stderr}\n${r.stdout}`)
    },
    dockerLog: () =>
      existsSync(join(srv, 'docker.log')) ? readFileSync(join(srv, 'docker.log'), 'utf8') : '',
    list: () => run(BACKUP, ['--op', 'list']).backups,
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

const rows = (query, db = 'joomla') =>
  sql(query, db)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))

test(
  'the customer’s live changes and the agent’s copy changes both end up in the copy; a second sync starts from the first',
  opts,
  () => {
    const s = stack()
    try {
      // The agent, on the copy.
      write(s.webroot, { 'templates/t4/css/custom.css': css({ 2: '.btn { color: #bf5b3d } /* Tracy */' }) })
      sql("UPDATE jos_content SET introtext='first, rewritten by Tracy' WHERE id=1", 'joomla')
      // The customer, on the live site.
      write(s.live, {
        'templates/t4/css/custom.css': css({ 17: '.nav { gap: 4px } /* customer */' }),
        'images/banner.jpg': 'jpeg bytes',
        'media/videos/tour.mp4': Buffer.alloc(51 * 1024 * 1024, 7),
        'configuration.php': config({ ...LIVE_CONFIG, sitename: "'Shop & Co'" })
      })
      sql(
        "UPDATE jos_content SET title='Hello from live', modified='2026-03-01' WHERE id=1; INSERT INTO jos_content (id, title, introtext, hits, modified) VALUES (3,'Spring sale','new',0,NULL)",
        'livesrc'
      )

      const dir = s.read()
      const merged = s.merge(dir)
      assert.equal(merged.state, 'ready', JSON.stringify(merged.conflicts))
      assert.equal(merged.baseKind, 'built')
      assert.deepEqual(merged.conflicts, [])
      assert.equal(merged.version, 2)
      // Nothing on the copy moved yet.
      assert.doesNotMatch(readFileSync(join(s.webroot, 'templates/t4/css/custom.css'), 'utf8'), /customer/)

      assert.deepEqual(merged.largeFiles, { copy: ['media/videos/tour.mp4'], differ: [] })
      const applied = s.apply(dir)
      assert.equal(applied.ok, true, JSON.stringify(applied))
      assert.deepEqual(applied.after, {
        largeFilesCopied: 1,
        rebuild: 'none',
        cache: 'cleared',
        contentIdentity: 'none'
      })
      assert.equal(readFileSync(join(s.webroot, 'media/videos/tour.mp4')).length, 51 * 1024 * 1024)
      assert.match(s.dockerLog(), /^web -e TRACY_SYNC_REBUILD=$/m)

      const cssNow = readFileSync(join(s.webroot, 'templates/t4/css/custom.css'), 'utf8')
      assert.match(cssNow, /Tracy/)
      assert.match(cssNow, /customer/)
      assert.equal(readFileSync(join(s.webroot, 'images/banner.jpg'), 'utf8'), 'jpeg bytes')
      // Every path the sync wrote, and every folder it made, went to the webroot's owner (#1562).
      const { uid, gid } = statSync(s.webroot)
      const given = s
        .dockerLog()
        .split('\n')
        .filter((l) => l.startsWith(`chown -h ${uid}:${gid} `))
        .flatMap((l) => l.split(' ').slice(3))
      for (const path of [
        './images/banner.jpg',
        './images',
        './templates/t4/css/custom.css',
        './configuration.php',
        './media/videos/tour.mp4',
        './media/videos',
        './media'
      ])
        assert.ok(given.includes(path), `${path} given to the webroot's owner: ${given.join(' ')}`)
      const cfg = readFileSync(join(s.webroot, 'configuration.php'), 'utf8')
      assert.match(cfg, /\$sitename = 'Shop & Co';/)
      assert.match(cfg, /\$password = 'copy-password';/)
      assert.match(cfg, /\$live_site = 'https:\/\/shop-com\.tracy\.ai';/)
      assert.match(readFileSync(join(s.webroot, '.htaccess'), 'utf8'), /Tracy clone hardening/)
      assert.deepEqual(rows('SELECT id, title, introtext FROM jos_content ORDER BY id'), [
        ['1', 'Hello from live', 'first, rewritten by Tracy'],
        ['2', 'About', 'second'],
        ['3', 'Spring sale', 'new']
      ])
      assert.deepEqual(rows('SELECT element, params FROM jos_extensions ORDER BY extension_id'), [
        ['sef', '{"domain": ""}'],
        ['com_claudecowork', '{"token":"live-token"}']
      ])
      assert.equal(s.git('rev-parse', 'refs/tracy/live'), merged.theirsCommit)
      assert.ok(existsSync(join(s.priv, 'sync', 'live-base.sql.gz')))
      const titles = s.list().map((p) => p.title)
      assert.ok(
        titles.some((t) => t.startsWith('Synced from live (')),
        titles.join(' | ')
      )
      assert.ok(titles.includes('Before restore to Backup 2'), titles.join(' | '))
      assert.equal(
        rows("SHOW DATABASES LIKE 'joomla\\_tracy\\_sync%'", '').length,
        0,
        'no scratch schema left'
      )

      // A second sync compares with the first read, not with the site as built.
      sql("UPDATE jos_content SET title='Spring sale — last days' WHERE id=3", 'livesrc')
      const dir2 = s.read()
      const second = s.merge(dir2)
      assert.equal(second.state, 'ready', JSON.stringify(second.conflicts))
      assert.equal(second.baseKind, 'last-sync')
      assert.equal(
        second.database.rowsMerged + second.database.rowsFromTheirs,
        1,
        JSON.stringify(second.database)
      )
      assert.equal(s.apply(dir2).ok, true)
      assert.deepEqual(rows('SELECT title, introtext FROM jos_content WHERE id IN (1, 3) ORDER BY id'), [
        ['Hello from live', 'first, rewritten by Tracy'],
        ['Spring sale — last days', 'new']
      ])
    } finally {
      s.dispose()
    }
  }
)

test(
  'a clash keeps Tracy’s side and says what the live site changed there; a decision may still take the live side',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_content SET title='Hello (Tracy)' WHERE id=1", 'joomla')
      sql(
        "UPDATE jos_content SET title='Hello (customer)', introtext='first, by the customer' WHERE id=1",
        'livesrc'
      )
      write(s.webroot, {
        'templates/t4/css/custom.css': css({ 5: '.a { color: red } /* Tracy */', 15: '.b {} /* Tracy */' })
      })
      write(s.live, {
        'templates/t4/css/custom.css': css({
          5: '.a { color: blue } /* customer */',
          17: '.c {} /* customer */'
        })
      })
      const dir = s.read()
      const merged = s.merge(dir)
      assert.equal(merged.state, 'ready', JSON.stringify(merged.conflicts))
      assert.deepEqual(merged.conflicts, [])
      assert.deepEqual(merged.kept.map((c) => c.id).sort(), [
        'db:jos_content:["1"]:title',
        'file:templates/t4/css/custom.css'
      ])
      assert.deepEqual(merged.kept.find((c) => c.kind === 'column').values.theirs, {
        title: { text: 'Hello (customer)' }
      })
      assert.equal(s.apply(dir).ok, true)
      assert.deepEqual(rows('SELECT title, introtext FROM jos_content WHERE id=1'), [
        ['Hello (Tracy)', 'first, by the customer']
      ])
      const cssNow = readFileSync(join(s.webroot, 'templates/t4/css/custom.css'), 'utf8')
      assert.match(cssNow, /color: red \} \/\* Tracy/, 'the clashing line is Tracy’s')
      assert.doesNotMatch(cssNow, /color: blue/)
      assert.match(cssNow, /\.b \{\} \/\* Tracy/)
      assert.match(cssNow, /\.c \{\} \/\* customer/, 'the customer’s other lines come over')

      sql("UPDATE jos_content SET title='Hello (Tracy, again)' WHERE id=1", 'joomla')
      sql("UPDATE jos_content SET title='Hello (customer, again)' WHERE id=1", 'livesrc')
      const dir2 = s.read()
      const decided = s.merge(dir2, { 'db:jos_content:["1"]:title': 'theirs' })
      assert.deepEqual(decided.kept, [])
      assert.equal(s.apply(dir2).ok, true)
      assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=1'), [['Hello (customer, again)']])
    } finally {
      s.dispose()
    }
  }
)

test('an edit lock taken on the live site never reaches the copy; the copy’s own lock stays', opts, () => {
  const s = stack()
  try {
    // Tracy's administrator has article 2 open on the copy.
    sql("UPDATE jos_content SET checked_out=7, checked_out_time='2026-10-23 09:00:00' WHERE id=2", 'joomla')
    // On the live site an administrator opened articles 1 and 2 and left them, and is writing a
    // new article 3 (dev, 23/10/2026: the copy's article showed as checked out by the live admin).
    sql(
      "UPDATE jos_content SET checked_out=42, checked_out_time='2026-10-23 10:00:00' WHERE id IN (1,2);" +
        ' INSERT INTO jos_content (id, title, introtext, hits, modified, checked_out, checked_out_time)' +
        " VALUES (3,'Draft','d',0,NULL,42,'2026-10-23 10:00:00')",
      'livesrc'
    )
    const done = s.sync(s.read())
    assert.equal(done.state, 'applied', JSON.stringify(done))
    assert.deepEqual(rows('SELECT id, checked_out, checked_out_time FROM jos_content ORDER BY id'), [
      ['1', 'NULL', 'NULL'],
      ['2', '7', '2026-10-23 09:00:00'],
      ['3', 'NULL', 'NULL']
    ])
    assert.deepEqual(done.kept, [], 'a lock is no clash')
    assert.equal(done.database.rowsFromTheirs, 1, 'only the new article came over: a lock is no change')
  } finally {
    s.dispose()
  }
})

test('a read the database refuses half way stops the merge; nothing is taken as dropped', opts, () => {
  const s = stack()
  try {
    // A statement the server refuses after the first table: the load stops there. The merge runs
    // inside a command substitution, where `set -e` does not hold, and the read once went on
    // without its other tables — merged as if the live site had dropped them (24/10/2026).
    const dir = s.read()
    const dump = gunzipSync(readFileSync(join(dir, 'live', 'db.sql.gz'))).toString('utf8')
    const at = dump.indexOf('-- Table structure for table', dump.indexOf('-- Table structure for table') + 1)
    writeFileSync(
      join(dir, 'live', 'db.sql.gz'),
      gzipSync(dump.slice(0, at) + 'THIS IS NOT SQL;\n' + dump.slice(at))
    )
    const merged = s.merge(dir)
    assert.equal(merged.ok, false)
    assert.equal(merged.code, 'MERGE_FAILED')
    assert.equal(s.list().length, 1, 'no point was made')
    assert.equal(rows('SELECT COUNT(*) FROM jos_content')[0][0], '2', 'the copy is as it was')
  } finally {
    s.dispose()
  }
})

test('a copy whose database cannot be read stops the merge, and the answer says why', opts, (t) => {
  const s = stack()
  try {
    // A view over a table that is gone: every dump of the copy fails on it (1356). The answer's
    // detail is what tracy-web keeps as the sync's errorDetail: the server's own error, no name or
    // value of the site (it once said only "is the database server's disk full or read-only?").
    sql(
      'CREATE TABLE jos_gone (id INT); CREATE VIEW jos_private_view AS SELECT id FROM jos_gone; DROP TABLE jos_gone',
      'joomla'
    )
    const merged = s.merge(s.read())
    assert.equal(merged.code, 'MERGE_FAILED')
    t.diagnostic(`detail: ${merged.detail}`)
    assert.match(merged.detail, /^the copy's database could not be read into its scratch schema: .*1356/)
    assert.doesNotMatch(merged.detail, /jos_private_view|jos_gone|disk full/)
    assert.equal(s.list().length, 1, 'no point was made')
  } finally {
    sql('DROP VIEW IF EXISTS jos_private_view', 'joomla')
    s.dispose()
  }
})

test('a copy that changed between merge and apply is refused, files or database', opts, () => {
  const s = stack()
  try {
    sql("UPDATE jos_content SET title='Hello again' WHERE id=2", 'livesrc')
    // Someone reads the copy while it syncs: a hit counter moves. Not the copy changing (22/10/2026:
    // a CHECKSUM TABLE called every visit COPY_CHANGED, and the sync failed).
    const visited = s.read()
    assert.equal(s.merge(visited).state, 'ready')
    sql('UPDATE jos_content SET hits = hits + 1 WHERE id=2', 'joomla')
    assert.equal(s.apply(visited).ok, true, 'a page view between merge and apply is not a change')

    // Each merge below brings a live change, so it has something to put in place (a merge that leaves
    // the copy as it is answers `nothing` and has no apply).
    sql("UPDATE jos_content SET title='Hello, first again' WHERE id=1", 'livesrc')
    const dir = s.read()
    assert.equal(s.merge(dir).state, 'ready')
    sql("UPDATE jos_content SET introtext='edited after the merge' WHERE id=2", 'joomla')
    assert.deepEqual(s.apply(dir), { ok: false, code: 'COPY_CHANGED', detail: 'database' })

    sql("UPDATE jos_content SET title='Hello, first once more' WHERE id=1", 'livesrc')
    const dir2 = s.read()
    assert.equal(s.merge(dir2).state, 'ready')
    write(s.webroot, { 'index.php': '<?php // edited after the merge\n' })
    assert.deepEqual(s.apply(dir2), { ok: false, code: 'COPY_CHANGED', detail: 'files' })
    // The visited sync was applied (the live title), and the refused ones changed nothing more.
    assert.deepEqual(rows('SELECT title, introtext FROM jos_content WHERE id=2'), [
      ['Hello again', 'edited after the merge']
    ])
  } finally {
    s.dispose()
  }
})

test(
  'a live site that did not move is answered applied at once: no merge, no backup point, the copy as it was',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_content SET title='About us' WHERE id=2", 'livesrc')
      assert.equal(s.sync(s.read()).state, 'applied')
      sql("UPDATE jos_content SET title='About (Tracy)' WHERE id=2", 'joomla')
      const points = s.list().length
      // What live-pull leaves when the fingerprint matched (claude-cowork 0.24.51): no read at all.
      const dir = join(dirname(s.live), 'sync-unchanged')
      mkdirSync(join(dir, 'live'), { recursive: true })
      const fingerprint = {
        version: 1,
        pageSize: 20000,
        files: { count: 3, bytes: 9, pages: ['abc'] },
        tables: { jos_content: '1' }
      }
      writeFileSync(join(dir, 'live', 'fingerprint.json'), JSON.stringify(fingerprint))
      writeFileSync(
        join(dir, 'live-read.json'),
        JSON.stringify({ ok: true, unchanged: 'fingerprint', liveReadAt: '2026-10-21T15:00:00.000Z' })
      )
      const done = s.sync(dir)
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.equal(done.unchanged, 'fingerprint')
      assert.equal(done.liveReadAt, '2026-10-21T15:00:00.000Z')
      assert.deepEqual(done.files, { fromTheirs: 0, merged: 0, tracyOwned: 0 })
      assert.equal(done.database.rowsFromTheirs, 0)
      assert.equal(s.list().length, points, 'no backup point, no restore')
      assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About (Tracy)']])
      assert.equal(
        existsSync(join(s.priv, 'sync', 'live-fingerprint.json')),
        false,
        "an unchanged answer keeps the last applied read's fingerprint (here none), never its own"
      )
      assert.equal(existsSync(join(dir, 'live')), false, 'the run folder is tidied')
    } finally {
      s.dispose()
    }
  }
)

test(
  'a first sync whose live files did not move since the import reads the database only, and takes the import as their tree',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_content SET title='About (live, after the import)' WHERE id=2", 'livesrc')
      write(s.webroot, { 'images/tracy-made.txt': 'made on the copy' })
      // What live-pull leaves when the files' fingerprint matched the import's: a database and a marker.
      const dir = join(dirname(s.live), 'sync-files-unchanged')
      mkdirSync(join(dir, 'live'), { recursive: true })
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        { maxBuffer: 1 << 28 }
      )
      execFileSync('sh', ['-c', `gzip -c > "${join(dir, 'live', 'db.sql.gz')}"`], { input: dump })
      writeFileSync(join(dir, 'live', 'files-unchanged.json'), JSON.stringify({ files: 3 }))
      writeFileSync(
        join(dir, 'live', 'fingerprint.json'),
        JSON.stringify({ version: 1, files: { count: 3 } })
      )
      writeFileSync(
        join(dir, 'live-read.json'),
        JSON.stringify({ ok: true, mode: 'files-unchanged', liveReadAt: '2026-10-22T14:00:00.000Z' })
      )
      const done = s.sync(dir)
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.deepEqual(done.conflicts, [])
      assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About (live, after the import)']])
      assert.equal(readFileSync(join(s.webroot, 'images/tracy-made.txt'), 'utf8'), 'made on the copy')
      assert.equal(done.files.fromTheirs, 0, 'no file came from the live site')
      // The live read's tree is the import's: the next sync starts from it.
      assert.equal(s.git('rev-parse', 'refs/tracy/live^{tree}'), s.git('rev-parse', 'tracy-baseline^{tree}'))

      // The next read: no manifest was kept (no file was read), but the fingerprint and the database
      // of this read were. A puller that records what it was handed, and finds nothing moved.
      const shim = join(dirname(s.live), 'node-shim')
      mkdirSync(shim, { recursive: true })
      const handed = join(shim, 'handed.json')
      writeFileSync(
        join(shim, 'node'),
        `#!/bin/sh\nprintf '{"manifest":"%s","fingerprint":"%s","db":"%s"}' "$TRACY_SYNC_MANIFEST_IN" "$TRACY_SYNC_FINGERPRINT_IN" "$TRACY_SYNC_DB_BASE" > "${handed}"\necho '{"ok":true,"unchanged":"fingerprint","liveReadAt":"2026-10-22T15:00:00.000Z"}'\n`
      )
      chmodSync(join(shim, 'node'), 0o755)
      const next = join(dirname(s.live), 'sync-after-files-unchanged')
      mkdirSync(next, { recursive: true })
      const again = s.sync(next, (env) => ({
        PATH: `${shim}:${env.PATH}`,
        TRACY_SYNC_ENDPOINT: 'http://live.invalid/'
      }))
      assert.equal(again.unchanged, 'fingerprint', JSON.stringify(again))
      assert.deepEqual(JSON.parse(readFileSync(handed, 'utf8')), {
        manifest: '',
        fingerprint: join(s.priv, 'sync', 'live-fingerprint.json'),
        db: join(s.priv, 'sync', 'live-base.sql.gz')
      })
    } finally {
      s.dispose()
    }
  }
)

test(
  'a sync that read no file but listed the live files keeps a manifest naming them by the tree it merged',
  opts,
  () => {
    const s = stack()
    try {
      const dir = join(dirname(s.live), 'sync-stat')
      mkdirSync(join(dir, 'live'), { recursive: true })
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        { maxBuffer: 1 << 28 }
      )
      execFileSync('sh', ['-c', `gzip -c > "${join(dir, 'live', 'db.sql.gz')}"`], { input: dump })
      writeFileSync(join(dir, 'live', 'files-unchanged.json'), JSON.stringify({ files: 3 }))
      // live-pull's listing by size and mtime: one file as the tree holds it, one at another size
      // (the live configuration.php is not the copy's), one the tree lacks.
      const index = Buffer.byteLength(SITE_FILES['index.php'])
      writeFileSync(
        join(dir, 'live', 'stat.json'),
        JSON.stringify({
          'index.php': { size: index, mtime: 100 },
          'configuration.php': { size: 3, mtime: 101 },
          'images/only-live.jpg': { size: 5, mtime: 102 }
        })
      )
      writeFileSync(
        join(dir, 'live-read.json'),
        JSON.stringify({ ok: true, mode: 'files-unchanged', liveReadAt: '2026-10-23T09:00:00.000Z' })
      )
      assert.equal(s.sync(dir).state, 'applied')
      const manifest = JSON.parse(readFileSync(join(s.priv, 'sync', 'live-manifest.json'), 'utf8'))
      assert.deepEqual(manifest['index.php'], {
        size: index,
        mtime: 100,
        sha1: `git:${s.git('rev-parse', 'refs/tracy/live:index.php')}`
      })
      assert.deepEqual(manifest['configuration.php'], { size: 3, mtime: 101 }, 'no sha1: read next')
      assert.deepEqual(manifest['images/only-live.jpg'], { size: 5, mtime: 102 })
    } finally {
      s.dispose()
    }
  }
)

test(
  'a sync swaps only the tables that differ from its point: the others stay as they were, triggers and all',
  opts,
  () => {
    const s = stack()
    try {
      // A trigger on a table the sync will not touch, and when each table was made.
      sql('CREATE TRIGGER keep_me AFTER UPDATE ON jos_extensions FOR EACH ROW SET @t = 1', 'joomla')
      const made = () =>
        Object.fromEntries(
          rows(
            "SELECT table_name, create_time FROM information_schema.tables WHERE table_schema='joomla' AND table_name IN ('jos_content','jos_extensions')",
            'joomla'
          )
        )
      const before = made()
      execFileSync('sleep', ['1.2'])
      sql("UPDATE jos_content SET title='About (live, swapped alone)' WHERE id=2", 'livesrc')
      const done = s.sync(s.read())
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About (live, swapped alone)']])
      const after = made()
      assert.notEqual(after.jos_content, before.jos_content, 'the changed table was put in place')
      assert.equal(after.jos_extensions, before.jos_extensions, 'the unchanged table never moved')
      assert.deepEqual(
        rows("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema='joomla'", 'joomla'),
        [['keep_me']]
      )
      // The way back is there as before: a Before-restore point for the sync's own point.
      assert.ok(s.list().some((b) => /^Before restore to Backup \d+$/.test(b.title ?? '')))
    } finally {
      s.dispose()
    }
  }
)

test(
  'a module’s content both sites edited, three syncs running: each side’s keys stay, a key both changed is Tracy’s and named',
  opts,
  () => {
    const s = stack()
    try {
      // 1. The live site rewrites the hero's title and lead; Tracy, its eyebrow (a reported case, 23/10/2026).
      setHero('livesrc', { 'tb-hero[title]': ['Đồng hành cùng bạn'], 'tb-hero[lead]': ['Bền bỉ, tận tâm'] })
      setHero('joomla', { 'tb-hero[eyebrow]': ['UY TÍN 100%'] })
      const one = s.sync(s.read())
      assert.equal(one.state, 'applied', JSON.stringify(one))
      assert.deepEqual(heroIn('joomla'), {
        'tb-hero[eyebrow]': ['UY TÍN 100%'],
        'tb-hero[title]': ['Đồng hành cùng bạn'],
        'tb-hero[lead]': ['Bền bỉ, tận tâm'],
        'tb-hero[button]': ['Xem thêm']
      })
      assert.deepEqual(one.kept ?? [], [], 'nothing both changed: nothing kept')

      // 2. Both rewrite the title; the live site also its button; Tracy also its lead.
      setHero('livesrc', { 'tb-hero[title]': ['Live: Mùa mới'], 'tb-hero[button]': ['Mua ngay'] })
      setHero('joomla', { 'tb-hero[title]': ['Tracy: Mùa mới'], 'tb-hero[lead]': ['Lead của Tracy'] })
      const two = s.sync(s.read())
      assert.equal(two.state, 'applied', JSON.stringify(two))
      assert.deepEqual(heroIn('joomla'), {
        'tb-hero[eyebrow]': ['UY TÍN 100%'],
        'tb-hero[title]': ['Tracy: Mùa mới'],
        'tb-hero[lead]': ['Lead của Tracy'],
        'tb-hero[button]': ['Mua ngay']
      })
      const kept = (two.kept ?? []).find((k) => k.table === 'jos_modules')
      assert.ok(kept, JSON.stringify(two.kept))
      assert.equal(kept.column, 'params')
      assert.deepEqual(kept.fields, ['jatools-config › tb-hero › tb-hero[title]'])

      // 3. Nothing new on the copy; the live site removes the button and changes a module setting
      //    outside the content: both come over, and Tracy's title of the last sync stands.
      sql(
        `UPDATE jos_modules SET params=${sqlText(
          JSON.stringify({
            ...paramsIn('livesrc'),
            'jatools-config': JSON.stringify({
              ':type': 'tb-hero',
              'tb-hero': Object.fromEntries(
                Object.entries(heroIn('livesrc')).filter(([k]) => k !== 'tb-hero[button]')
              )
            }),
            cache: '1'
          })
        )} WHERE id=441`,
        'livesrc'
      )
      const three = s.sync(s.read())
      assert.equal(three.state, 'applied', JSON.stringify(three))
      assert.deepEqual(heroIn('joomla'), {
        'tb-hero[eyebrow]': ['UY TÍN 100%'],
        'tb-hero[title]': ['Tracy: Mùa mới'],
        'tb-hero[lead]': ['Lead của Tracy']
      })
      assert.equal(paramsIn().cache, '1')
    } finally {
      s.dispose()
    }
  }
)

test(
  'a module’s content that is not JSON on one side stays one value: the copy’s, named as the column',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_modules SET params='broken {' WHERE id=441", 'livesrc')
      setHero('joomla', { 'tb-hero[eyebrow]': ['Tracy'] })
      const done = s.sync(s.read())
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.equal(heroIn('joomla')['tb-hero[eyebrow]'][0], 'Tracy')
      const kept = (done.kept ?? []).find((k) => k.table === 'jos_modules')
      assert.equal(kept?.column, 'params')
      assert.equal(kept.fields, undefined)
    } finally {
      s.dispose()
    }
  }
)

test(
  'both sites indexing one saved article for Smart Search never holds a sync: the copy keeps its index',
  opts,
  () => {
    const s = stack()
    try {
      // Each site's Joomla indexes the article as it is saved: the same row, each with its own weight.
      sql("UPDATE jos_content SET title='About (live, saved)' WHERE id=2", 'livesrc')
      sql('INSERT INTO jos_finder_links_terms VALUES (2, 7, 0.5)', 'livesrc')
      sql("UPDATE jos_content SET introtext='second (Tracy)' WHERE id=2", 'joomla')
      sql('INSERT INTO jos_finder_links_terms VALUES (2, 7, 0.9)', 'joomla')
      const done = s.sync(s.read())
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.deepEqual(done.held ?? [], [])
      assert.deepEqual(rows('SELECT title, introtext FROM jos_content WHERE id=2'), [
        ['About (live, saved)', 'second (Tracy)']
      ])
      assert.deepEqual(rows('SELECT weight FROM jos_finder_links_terms WHERE link_id=2'), [['0.9']])
    } finally {
      s.dispose()
    }
  }
)

test(
  'a sync whose merge leaves the copy as it is makes no backup point and restores nothing; its read is the next base',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_content SET title='About us' WHERE id=2", 'livesrc')
      const first = s.sync(s.read())
      assert.equal(first.state, 'applied', JSON.stringify(first))
      const points = s.list().length
      const base = s.git('rev-parse', 'refs/tracy/live')

      // Nothing moved on either side: the read is merged, and the merge is the copy itself.
      const again = s.sync(s.read())
      assert.equal(again.state, 'applied', JSON.stringify(again))
      assert.equal(again.unchanged, 'merge')
      assert.equal(again.apply, undefined, 'no Restore everything')
      assert.equal(again.version, null)
      assert.equal(s.list().length, points, 'no "Synced from live" point for nothing')
      assert.notEqual(s.git('rev-parse', 'refs/tracy/live'), base, 'the read became the next base')
      assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About us']])

      // Both changed one title: Tracy's stays and is named, and the copy is still left as it is.
      sql("UPDATE jos_content SET title='About (Tracy)' WHERE id=2", 'joomla')
      sql("UPDATE jos_content SET title='About (live)' WHERE id=2", 'livesrc')
      const kept = s.sync(s.read())
      assert.equal(kept.state, 'applied')
      assert.equal(kept.unchanged, 'merge')
      assert.deepEqual(
        kept.kept.map((c) => c.id),
        ['db:jos_content:["2"]:title']
      )
      assert.equal(s.list().length, points)
    } finally {
      s.dispose()
    }
  }
)

test('`sync` merges and applies in one go, a clash included: Tracy’s side stays', opts, () => {
  const s = stack()
  try {
    sql("UPDATE jos_content SET title='About us' WHERE id=2", 'livesrc')
    const done = s.sync(s.read())
    assert.equal(done.state, 'applied', JSON.stringify(done))
    assert.equal(done.apply.ok, true)
    assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About us']])

    sql("UPDATE jos_content SET title='About (Tracy)' WHERE id=2", 'joomla')
    sql("UPDATE jos_content SET title='About (live)' WHERE id=2", 'livesrc')
    const kept = s.sync(s.read())
    assert.equal(kept.state, 'applied')
    assert.deepEqual(
      kept.kept.map((c) => c.id),
      ['db:jos_content:["2"]:title']
    )
    assert.deepEqual(rows('SELECT title FROM jos_content WHERE id=2'), [['About (Tracy)']])
  } finally {
    s.dispose()
  }
})

test(
  'a read that carries only what changed is laid over the last read; its manifest is kept for the next',
  opts,
  () => {
    const s = stack()
    try {
      // First sync: a whole read.
      write(s.live, {
        'images/old.jpg': 'old',
        'templates/t4/css/custom.css': css({ 1: '.x {} /* customer */' })
      })
      assert.equal(s.sync(s.read()).state, 'applied')
      // Second sync: the customer edits a file and deletes another; only those travel.
      const dir = join(s.priv, '..', 'incremental')
      mkdirSync(join(dir, 'live', 'changes', 'templates/t4/css'), { recursive: true })
      writeFileSync(
        join(dir, 'live', 'changes', 'templates/t4/css/custom.css'),
        css({ 1: '.x {} /* customer */', 9: '.y {} /* customer, later */' })
      )
      writeFileSync(join(dir, 'live', 'deleted.json'), JSON.stringify(['images/old.jpg']))
      writeFileSync(join(dir, 'live', 'manifest.json'), JSON.stringify({ 'index.php': 'sha-of-index' }))
      // The Global Configuration changed on the live site: its configuration.php came alone, in a pack
      // cut to it (claude-cowork 0.24.54), not with the whole tree.
      writeFileSync(
        join(dir, 'live', 'changes', 'configuration.php'),
        config({ ...LIVE_CONFIG, MetaDesc: "'Set on the live site'" })
      )
      // What a whole read would have normalised away: the same on the index road (tree_of_changes).
      mkdirSync(join(dir, 'live', 'changes', 'cache'), { recursive: true })
      writeFileSync(join(dir, 'live', 'changes', 'cache', 'page.php'), '<?php // cache')
      mkdirSync(join(dir, 'live', 'changes', 'installation'), { recursive: true })
      writeFileSync(join(dir, 'live', 'changes', 'installation', 'index.php'), '<?php // installer')
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        { maxBuffer: 1 << 28 }
      )
      execFileSync('sh', ['-c', `gzip -c > "${join(dir, 'live', 'db.sql.gz')}"`], { input: dump })
      const done = s.sync(dir)
      assert.equal(done.state, 'applied', JSON.stringify(done))
      assert.match(readFileSync(join(s.webroot, 'templates/t4/css/custom.css'), 'utf8'), /customer, later/)
      assert.equal(existsSync(join(s.webroot, 'images/old.jpg')), false, 'the deletion came over')
      const conf = readFileSync(join(s.webroot, 'configuration.php'), 'utf8')
      assert.match(conf, /\$MetaDesc = 'Set on the live site'/, "the live site's setting came over")
      assert.match(conf, /\$password = 'copy-password'/, "the copy's own database stays")
      assert.match(conf, /\$db = 'joomla'/)
      assert.equal(
        readFileSync(join(s.webroot, 'index.php'), 'utf8'),
        '<?php // Joomla\n',
        'what did not travel is as it was'
      )
      assert.deepEqual(JSON.parse(readFileSync(join(s.priv, 'sync', 'live-manifest.json'), 'utf8')), {
        'index.php': 'sha-of-index'
      })
      const liveTree = s.git('ls-tree', '-r', '--name-only', 'refs/tracy/live').split('\n')
      assert.ok(
        liveTree.includes('index.php') && liveTree.includes('templates/t4/css/custom.css'),
        liveTree.join(' ')
      )
      for (const gone of ['images/old.jpg', 'cache/page.php', 'installation/index.php'])
        assert.equal(liveTree.includes(gone), false, `${gone} is not in the live read's tree`)
      assert.equal(existsSync(join(dir, 'live')), false, 'the applied read is not kept')

      // Thirty days without a sync: the host forgets the live read; the next sync starts from the build.
      const forgetDir = join(s.priv, 'sync', 'runs', 'forget')
      mkdirSync(forgetDir, { recursive: true })
      assert.deepEqual(s.run(SYNC, ['--op', 'forget', '--dir', forgetDir]), { ok: true, forgotten: true })
      assert.equal(existsSync(join(s.priv, 'sync', 'live-base.sql.gz')), false)
      assert.equal(existsSync(join(s.priv, 'sync', 'live-manifest.json')), false)
      assert.throws(() => s.git('rev-parse', '--verify', 'refs/tracy/live'))
      write(s.live, { 'images/after.jpg': 'after' })
      const after = s.merge(s.read())
      assert.equal(after.baseKind, 'built', JSON.stringify(after))
    } finally {
      s.dispose()
    }
  }
)

// #1649: "Sync anyway" after a held sync read the live site and merged everything again (29 min on
// a 290 MB site). It takes the held sync's read and merge when the live site and the copy did not
// move since, the read alone when only the copy did, and neither when the live site did.
test(
  'Sync anyway reuses the held sync’s read and merge; the read alone when the copy moved; neither when the live site did',
  opts,
  () => {
    const s = stack()
    try {
      // Both sites add an extension under one number (a table no adapter numbers again): held.
      const holdOne = () => {
        sql("INSERT INTO jos_extensions VALUES (30,'plugin','system','tracyone','{}')", 'joomla')
        sql("INSERT INTO jos_extensions VALUES (30,'plugin','system','customerone','{}')", 'livesrc')
        sql("UPDATE jos_content SET title='Hello (live)' WHERE id=1", 'livesrc')
      }
      const heldRun = () => {
        const dir = s.read(true)
        // What live-pull leaves beside a read: the fingerprint it took first.
        writeFileSync(join(dir, 'live', 'fingerprint.json'), JSON.stringify({ version: 1, pageSize: 50000 }))
        const held = s.sync(dir)
        assert.equal(held.state, 'needs_attention', JSON.stringify(held))
        assert.equal(held.held.length, 1)
        return dir
      }
      const runDir = (name) => {
        const dir = join(s.priv, 'sync', 'runs', name)
        mkdirSync(dir, { recursive: true })
        return dir
      }
      holdOne()
      const points = s.list().length
      const held = heldRun()
      // What the held sync keeps for a Sync anyway: its read and its merge, and no point yet.
      for (const kept of ['held.json', 'merged.sql.gz', 'live/db.sql.gz', 'live/fingerprint.json', 'db.json'])
        assert.ok(existsSync(join(held, kept)), kept)
      assert.equal(s.list().length, points, 'no backup point for a held sync')
      assert.equal(
        rows("SHOW DATABASES LIKE 'joomla\\_tracy\\_sync%'", '').length,
        0,
        'no scratch schema left'
      )

      // Nothing moved: no read, no merge — the point straight from the held merge, then applied.
      const unchanged = { ok: true, unchanged: 'fingerprint', liveReadAt: '2026-10-23T09:00:00Z' }
      const anyway = s.syncAnyway(runDir('anyway-1'), held, { check: unchanged })
      assert.equal(anyway.answer.state, 'applied', JSON.stringify(anyway.answer))
      assert.equal(anyway.answer.reused, 'read-and-merge')
      // (the held run's own fingerprint, by its real path: /private/var on a Mac)
      assert.match(
        anyway.log,
        new RegExp(`^check \\S*/${basename(held)}/live/fingerprint\\.json\n$`),
        'asked, never read'
      )
      assert.doesNotMatch(anyway.stderr, /merging the databases/)
      assert.deepEqual(rows('SELECT element FROM jos_extensions WHERE extension_id=30'), [['tracyone']])
      assert.equal(titleOf(1), 'Hello (live)')
      assert.equal(existsSync(held), false, 'the held run is taken, not left behind')
      assert.ok(existsSync(join(s.priv, 'sync', 'live-base.sql.gz')), 'its read is the next base')

      // The copy moved since the hold: its read is taken, the merge made again with the copy as it is.
      sql("INSERT INTO jos_extensions VALUES (31,'plugin','system','tracytwo','{}')", 'joomla')
      sql("INSERT INTO jos_extensions VALUES (31,'plugin','system','customertwo','{}')", 'livesrc')
      sql("UPDATE jos_content SET title='About (live)' WHERE id=2", 'livesrc')
      const held2 = heldRun()
      sql("UPDATE jos_content SET introtext='first, by Tracy after the hold' WHERE id=1", 'joomla')
      const again = s.syncAnyway(runDir('anyway-2'), held2, { check: unchanged })
      assert.equal(again.answer.state, 'applied', JSON.stringify(again.answer))
      assert.equal(again.answer.reused, 'read')
      assert.match(again.stderr, /merging the databases/)
      assert.equal(again.log.split('\n').filter(Boolean).length, 1, 'asked once, never read')
      assert.deepEqual(rows('SELECT title, introtext FROM jos_content WHERE id IN (1, 2) ORDER BY id'), [
        ['Hello (live)', 'first, by Tracy after the hold'],
        ['About (live)', 'second']
      ])

      // The live site moved since the hold: nothing of it is taken; the live site is read again.
      sql("INSERT INTO jos_extensions VALUES (32,'plugin','system','tracythree','{}')", 'joomla')
      sql("INSERT INTO jos_extensions VALUES (32,'plugin','system','customerthree','{}')", 'livesrc')
      const held3 = heldRun()
      const moved = s.syncAnyway(runDir('anyway-3'), held3, {
        check: { ok: true, liveReadAt: '2026-10-23T10:00:00Z' },
        pull: { ok: false, code: 'PULL_FAILED' }
      })
      assert.equal(moved.log.split('\n').filter(Boolean).at(-1), 'read', 'read again')
      assert.equal(moved.answer.code, 'LIVE_READ_FAILED', JSON.stringify(moved.answer))
      assert.equal(existsSync(held3), false, 'a held read that no longer stands is not kept')
    } finally {
      s.dispose()
    }
  }
)

// #1563: a deploy replaces tracy-host, and the sync it ran dies wherever it was. The next press
// settles it first, on evidence: untouched, put back to "Before restore" when only the sync wrote
// there, finished when it was in place — and never over what was done on the copy since.
const applying = (s) => join(s.priv, 'sync', 'applying.json')
const titleOf = (id) => rows(`SELECT title FROM jos_content WHERE id=${id}`)[0][0]

test(
  'a cut-off apply: nothing written stays as it is, edits since included; only the sync’s writes are put back',
  opts,
  () => {
    const s = stack()
    try {
      sql("UPDATE jos_content SET title='About us (live)' WHERE id=2", 'livesrc')
      write(s.live, { 'images/team.jpg': 'team' })

      // Cut off inside Restore everything, after its "Before restore" point and before its files; the
      // agent then edits the copy. Nothing of the sync reached the copy: the edit stays.
      const dir1 = s.read()
      assert.equal(s.merge(dir1).state, 'ready')
      s.applyKilledAt(dir1, 'restore-files')
      assert.equal(existsSync(applying(s)), true)
      write(s.webroot, { 'index.php': '<?php // edited by the agent after the cut\n' })
      const second = s.merge(s.read())
      assert.equal(second.recovered, 'untouched', JSON.stringify(second))
      assert.equal(
        readFileSync(join(s.webroot, 'index.php'), 'utf8'),
        '<?php // edited by the agent after the cut\n'
      )
      assert.equal(existsSync(applying(s)), false)

      // Cut off after the files and before the database swap, nothing else on the copy: put back.
      const dir3 = s.read()
      assert.equal(s.merge(dir3).state, 'ready')
      s.applyKilledAt(dir3, 'restore-foreign-keys')
      assert.equal(
        readFileSync(join(s.webroot, 'images/team.jpg'), 'utf8'),
        'team',
        'the files were in place'
      )
      assert.equal(titleOf(2), 'About', 'the database was not')
      // The next press reads a live site that keeps changing: the copy is settled all the same.
      const busy = { ok: false, code: 'LIVE_BUSY', detail: 'the database kept changing (content)' }
      const busyRun = join(s.priv, 'sync', 'runs', 'busy')
      mkdirSync(busyRun, { recursive: true })
      const stopped = s.syncReading(busyRun, busy)
      assert.equal(stopped.code, 'LIVE_BUSY', JSON.stringify(stopped))
      assert.equal(existsSync(applying(s)), false, 'settled before the live site was read')
      assert.equal(existsSync(join(s.webroot, 'images/team.jpg')), false, 'the sync’s files are gone again')
      assert.equal(titleOf(2), 'About')
      assert.equal(
        readFileSync(join(s.webroot, 'index.php'), 'utf8'),
        '<?php // edited by the agent after the cut\n'
      )
      assert.throws(() => s.git('rev-parse', '--verify', 'refs/tracy/live'), 'the base is still the build')

      // And a whole sync afterwards brings everything.
      assert.equal(s.sync(s.read()).state, 'applied')
      assert.equal(titleOf(2), 'About us (live)')
      assert.equal(readFileSync(join(s.webroot, 'images/team.jpg'), 'utf8'), 'team')
    } finally {
      s.dispose()
    }
  }
)

test('a cut-off apply whose copy was edited since is not written over: the owner is told, once', opts, () => {
  const s = stack()
  try {
    sql("UPDATE jos_content SET title='About us (live)' WHERE id=2", 'livesrc')
    write(s.live, { 'images/team.jpg': 'team' })
    const dir = s.read()
    assert.equal(s.merge(dir).state, 'ready')
    s.applyKilledAt(dir, 'restore-swap')
    write(s.webroot, { 'images/team.jpg': 'the agent’s own picture' })
    const told = s.merge(s.read())
    assert.equal(told.ok, false)
    assert.equal(told.code, 'APPLY_INTERRUPTED_KEPT', JSON.stringify(told))
    assert.equal(readFileSync(join(s.webroot, 'images/team.jpg'), 'utf8'), 'the agent’s own picture')
    assert.equal(existsSync(applying(s)), false, 'said once: the next press goes on')
    assert.equal(s.merge(s.read()).state, 'ready')
  } finally {
    s.dispose()
  }
})

test(
  'a cut-off apply that was in place is finished, after a day too, never over a large file edited or deleted since',
  opts,
  () => {
    const s = stack()
    try {
      // Cut off once in place, before the base was kept; the next press comes two days later.
      sql("UPDATE jos_content SET title='Hello (live)' WHERE id=1", 'livesrc')
      const dir1 = s.read(true)
      const first = s.merge(dir1)
      assert.equal(first.state, 'ready')
      s.applyKilledAt(dir1, 'finishing')
      const old = new Date(Date.now() - 2 * 86_400_000)
      utimesSync(dir1, old, old)
      const second = s.merge(s.read(true))
      assert.equal(second.recovered, 'finished', JSON.stringify(second))
      assert.equal(s.git('rev-parse', 'refs/tracy/live'), first.theirsCommit)
      assert.equal(second.baseKind, 'last-sync')
      assert.equal(second.database.rowsFromTheirs + second.database.rowsMerged, 0, 'nothing comes over twice')
      assert.equal(titleOf(1), 'Hello (live)')

      // Cut off after everything but the marker; the agent then replaces the large file it brought.
      write(s.live, { 'media/videos/tour.mp4': Buffer.alloc(51 * 1024 * 1024, 7) })
      const dir3 = s.read(true)
      assert.equal(s.merge(dir3).state, 'ready')
      s.applyKilledAt(dir3, 'after')
      assert.equal(readFileSync(join(s.webroot, 'media/videos/tour.mp4')).length, 51 * 1024 * 1024)
      write(s.webroot, { 'media/videos/tour.mp4': 'the agent’s cut' })
      // The copy moved since (its replacement is a file the history sees): nothing written, told.
      const third = s.merge(s.read(true))
      assert.equal(third.code, 'APPLY_INTERRUPTED_KEPT', JSON.stringify(third))
      assert.equal(readFileSync(join(s.webroot, 'media/videos/tour.mp4'), 'utf8'), 'the agent’s cut')
      rmSync(join(s.webroot, 'media/videos/tour.mp4'))

      // The same, and the agent deletes the large file: it stays deleted.
      write(s.live, { 'media/videos/intro.mp4': Buffer.alloc(51 * 1024 * 1024, 8) })
      const dir5 = s.read(true)
      assert.equal(s.merge(dir5).state, 'ready')
      s.applyKilledAt(dir5, 'after')
      rmSync(join(s.webroot, 'media/videos/intro.mp4'))
      const fifth = s.merge(s.read(true))
      assert.equal(fifth.recovered, 'finished', JSON.stringify(fifth))
      assert.equal(existsSync(join(s.webroot, 'media/videos/intro.mp4')), false, 'a deletion since stays')

      // Cut off between two large files, nothing else: the next press copies the one left.
      write(s.live, {
        'media/a.mp4': Buffer.alloc(51 * 1024 * 1024, 1),
        'media/b.mp4': Buffer.alloc(51 * 1024 * 1024, 2)
      })
      const dir7 = s.read(true)
      assert.equal(s.merge(dir7).state, 'ready')
      s.applyKilledAt(dir7, 'large-copied')
      assert.equal(
        ['a', 'b'].filter((n) => existsSync(join(s.webroot, `media/${n}.mp4`))).length,
        1,
        'one copied before the cut'
      )
      const seventh = s.merge(s.read(true))
      assert.equal(seventh.recovered, 'finished', JSON.stringify(seventh))
      for (const n of ['a', 'b'])
        assert.equal(readFileSync(join(s.webroot, `media/${n}.mp4`)).length, 51 * 1024 * 1024, n)

      // Cut off once in place, then the agent edits the copy: nothing more is written there; told.
      sql("UPDATE jos_content SET title='About (live, later)' WHERE id=2", 'livesrc')
      const dir9 = s.read(true)
      assert.equal(s.merge(dir9).state, 'ready')
      s.applyKilledAt(dir9, 'finishing')
      write(s.webroot, { 'index.php': '<?php // edited by the agent after the cut\n' })
      const told = s.merge(s.read(true))
      assert.equal(told.code, 'APPLY_INTERRUPTED_KEPT', JSON.stringify(told))
      assert.equal(
        readFileSync(join(s.webroot, 'index.php'), 'utf8'),
        '<?php // edited by the agent after the cut\n'
      )
    } finally {
      s.dispose()
    }
  }
)

// #1564: the read's own reason reaches the answer — the owner is told the site kept changing, not
// that it could not be read. No database: the read ends before any lock or merge.
test('failed live reads retain busy and access codes; unknown failures use LIVE_READ_FAILED', () => {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-live-sync-read-'))
  try {
    const priv = join(srv, LABEL)
    mkdirSync(join(priv, '.webroot'), { recursive: true })
    writeFileSync(join(priv, '.env'), 'PLATFORM=joomla\nDB_PASSWORD=t\n')
    // The real libraries, with a puller that answers what the env says.
    const lib = join(srv, 'lib')
    mkdirSync(lib)
    for (const name of readdirSync(join(scripts, 'lib')))
      if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
    writeFileSync(join(lib, 'live-pull.mjs'), 'console.log(process.env.FAKE_PULL)\n')
    const said = (pull) => {
      const dir = join(priv, 'sync', 'runs', `run-${pull.code}`)
      mkdirSync(dir, { recursive: true })
      const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'sync', '--dir', dir], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
          TRACY_SRV: srv,
          TRACY_SITES_ROOT: srv,
          TRACY_LIB_DIR: lib,
          TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
          TRACY_SYNC_ENDPOINT: 'https://shop.example/claudecowork',
          TRACY_SYNC_TOKEN: 'token-of-test',
          FAKE_PULL: JSON.stringify(pull)
        }
      })
      assert.equal(r.status, 0, r.stderr)
      return JSON.parse(r.stdout.trim().split('\n').at(-1))
    }
    const busy = { ok: false, code: 'LIVE_BUSY', detail: 'the database kept changing (content, weblinks)' }
    assert.deepEqual(said(busy), { ok: false, code: 'LIVE_BUSY', read: busy })
    const refused = { ok: false, code: 'TOKEN_REFUSED' }
    assert.deepEqual(said(refused), { ok: false, code: 'TOKEN_REFUSED', read: refused })
    for (const code of ['LIVE_PASSWORD_PROTECTED', 'LIVE_BLOCKED', 'LIVE_RATE_LIMITED']) {
      const read = { ok: false, code }
      assert.deepEqual(said(read), { ok: false, code, read })
    }
    const php = { ok: false, code: 'LIVE_PHP_TOO_OLD', php: '7.3.33', min: '7.4.0' }
    assert.deepEqual(said(php), { ok: false, code: 'LIVE_PHP_TOO_OLD', read: php })
    const unknown = { ok: false, code: 'UNKNOWN_READ_FAILURE' }
    assert.deepEqual(said(unknown), { ok: false, code: 'LIVE_READ_FAILED', read: unknown })
  } finally {
    rmSync(srv, { recursive: true, force: true })
  }
})

test('the live read is normalised the way provision normalised the copy (one statement, two places)', () => {
  const engine = readFileSync(join(scripts, 'lib', 'live_sync.py'), 'utf8')
  const provision = readFileSync(join(scripts, 'provision', 'platform', 'joomla.sh'), 'utf8')
  const clause = "SET params = JSON_SET(params, '$.domain', '')"
  assert.ok(engine.includes(clause))
  assert.ok(provision.replaceAll('\\$', '$').includes(clause))
  assert.ok(provision.includes("WHERE type = 'plugin' AND folder = 'system' AND element = 'sef'"))
  assert.ok(engine.includes("WHERE type = 'plugin' AND folder = 'system' AND element = 'sef'"))
})

// Phoca Cart's product tables (Phoca Cart 6.1.9's install SQL, the columns the merge reads): a table
// the adapter cannot number again, and two tables of rows that belong to a product.
const PHOCA_TABLES = `
CREATE TABLE jos_phocacart_products (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), alias VARCHAR(255));
CREATE TABLE jos_phocacart_product_categories (product_id INT NOT NULL DEFAULT 0, category_id INT NOT NULL DEFAULT 0,
  ordering INT NOT NULL DEFAULT 0, UNIQUE KEY idx_category (product_id, category_id));
CREATE TABLE jos_phocacart_product_images (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL DEFAULT 0,
  image VARCHAR(255) NOT NULL DEFAULT '');
INSERT INTO jos_phocacart_products VALUES (5,'Mug','mug');
INSERT INTO jos_phocacart_product_categories VALUES (5,1,1);
`

test(
  'a product both sites added under one number is held with the rows the live site made for it; Sync anyway leaves them out, and the read’s timing line reaches the row',
  opts,
  async () => {
    const { syncProgressLine } = await import('../../../../apps/tracy-host/src/webroot.js')
    const { timingOf } = await import('../../../../apps/tracy-web/src/sites/live-sync.js')
    const s = stack(PHOCA_TABLES)
    try {
      sql(
        "INSERT INTO jos_phocacart_products VALUES (6,'Tracy hat','tracy-hat'); INSERT INTO jos_phocacart_product_categories VALUES (6,1,2);",
        'joomla'
      )
      sql(
        "INSERT INTO jos_phocacart_products VALUES (6,'Live scarf','live-scarf'); INSERT INTO jos_phocacart_product_categories VALUES (6,2,1);" +
          " INSERT INTO jos_phocacart_product_images VALUES (2,6,'scarf.jpg');",
        'livesrc'
      )
      const staged = s.read()
      const dir = join(s.priv, 'sync', 'runs', 'phoca')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(staged, 'live', 'fingerprint.json'), JSON.stringify({ version: 1, pageSize: 50000 }))
      const pull = {
        ok: true,
        liveReadAt: '2026-10-28T09:00:00.000Z',
        mode: 'incremental',
        seconds: 3.2,
        timing: { fingerprint: 0.4, database: 2.1, files: 0.7 }
      }
      const { answer, stderr } = s.syncPulled(dir, pull, join(staged, 'live'))
      assert.equal(answer.state, 'needs_attention', JSON.stringify(answer))
      assert.deepEqual(
        answer.held.map((h) => [h.id, h.reason, h.belonging]),
        [
          [
            'db:jos_phocacart_products:["6"]',
            'added-both',
            [
              { table: 'jos_phocacart_product_categories', key: { product_id: '6', category_id: '2' } },
              { table: 'jos_phocacart_product_images', key: { id: '2' } }
            ]
          ]
        ]
      )
      // F1: the read's timing line as the real script printed it, kept by tracy-host and read by tracy-web.
      const kept = stderr.split('\n').map(syncProgressLine).filter(Boolean)
      assert.ok(
        kept.some((l) => l.startsWith('{')),
        `no read line kept from:\n${stderr}`
      )
      assert.deepEqual(timingOf(kept.join('\n')).read, {
        mode: 'incremental',
        seconds: 3.2,
        parts: { fingerprint: 0.4, database: 2.1, files: 0.7 }
      })

      // Sync anyway: Tracy's product stays as Tracy made it, in its own category, with no live image.
      const anywayDir = join(s.priv, 'sync', 'runs', 'phoca-anyway')
      mkdirSync(anywayDir, { recursive: true })
      const anyway = s.syncAnyway(anywayDir, dir, {
        check: { ok: true, unchanged: 'fingerprint', liveReadAt: '2026-10-28T09:00:00.000Z' }
      })
      assert.equal(anyway.answer.state, 'applied', JSON.stringify(anyway.answer))
      assert.deepEqual(rows('SELECT title FROM jos_phocacart_products WHERE id = 6'), [['Tracy hat']])
      assert.deepEqual(
        rows('SELECT product_id, category_id FROM jos_phocacart_product_categories ORDER BY 1, 2'),
        [
          ['5', '1'],
          ['6', '1']
        ]
      )
      assert.deepEqual(rows('SELECT id FROM jos_phocacart_product_images'), [])
    } finally {
      s.dispose()
    }
  }
)

test('a pre-swap trigger failure retires its foreign-key plan before cleaning the stage', opts, () => {
  const s = stack(`CREATE TABLE jos_parent (id INT PRIMARY KEY); INSERT INTO jos_parent VALUES (1);
CREATE TABLE jos_child (id INT PRIMARY KEY, parent_id INT, title VARCHAR(40), CONSTRAINT child_parent FOREIGN KEY (parent_id) REFERENCES jos_parent(id) ON DELETE RESTRICT);
INSERT INTO jos_child VALUES (1,1,'base');`)
  try {
    sql(
      "ALTER TABLE jos_child DROP FOREIGN KEY child_parent; ALTER TABLE jos_child ADD CONSTRAINT child_parent FOREIGN KEY (parent_id) REFERENCES jos_parent(id) ON DELETE CASCADE; UPDATE jos_child SET title='live';",
      'livesrc'
    )
    const dir = s.read()
    assert.equal(s.merge(dir).state, 'ready')
    const answer = s.run(SYNC, ['--op', 'apply', '--dir', dir], () => ({
      TRACY_TEST_FAIL_STAGE_TRIGGERS: '1'
    }))
    assert.equal(answer.ok, false)
    assert.equal(existsSync(join(s.priv, '.restore-foreign-keys.json')), false)
    const graph = () =>
      rows(
        "SELECT delete_rule FROM information_schema.referential_constraints WHERE constraint_schema='joomla' AND constraint_name='child_parent'"
      )
    assert.deepEqual(graph(), [['RESTRICT']], 'the live graph was never replaced by the staged CASCADE graph')
    assert.deepEqual(rows('SELECT title FROM jos_child'), [['base']])
    // Recovery on the next sync must leave the old graph alone after stage cleanup.
    s.merge(s.read())
    assert.deepEqual(graph(), [['RESTRICT']])
  } finally {
    s.dispose()
  }
})
