/**
 * "Sync from live" on a WordPress copy, end to end on a throwaway stack (`webroot/webroot-sync.sh`,
 * WordPress's rules in `lib/live_sync_wordpress.py`): the copy as provision hands it over (its address
 * written into the database and wp-config.php, its .htaccess's force-HTTPS pair commented out and
 * hardened), the agent edits the copy while the customer edits the live site, and `sync` merges and
 * puts the result in place through Restore everything.
 *
 * The live site keeps its own address (`https://shop.example`) in its options, post content and
 * serialized settings; the copy holds `https://shop-com.tracy.ai` in the same places. Rows that differ
 * only by that address are no change; a row the customer changed comes over holding the copy's address.
 *
 * Needs a real MariaDB: `mariadb:11` in a container of its own, removed at the end; SKIPPED where no
 * docker daemon answers (test/live-sync-flow.test.mjs is the Joomla half, and the stand-in is its).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-wordpress-flow.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const SYNC = join(scripts, 'webroot', 'webroot-sync.sh')
const PUSH = join(scripts, 'lib', 'live_push.py')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'shop-com'
const LIVE_URL = 'https://shop.example'
const COPY_URL = 'https://shop-com.tracy.ai'

const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0
const DB_CONTAINER = `tracy-live-sync-wp-db-${process.pid}`
const opts = { skip: DOCKER_UP ? false : 'no docker daemon here: the sync needs a real MariaDB' }

// ── the docker stand-in (as test/live-sync-flow.test.mjs) ──────────────────────────────────────
const shimDir = mkdtempSync(join(tmpdir(), 'live-sync-wp-docker-'))
writeFileSync(
  join(shimDir, 'docker'),
  `#!/usr/bin/env bash
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
        # The site's web container: no WordPress here. Log which CMS the script was for and with what.
        script="$(cat)"; kind=other
        case "$script" in *wp-load.php*) kind=wordpress ;; *_JEXEC*) kind=joomla ;; esac
        echo "web $kind \${envs[*]}" >> "$FAKE_DOCKER_LOG"
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
after(() => rmSync(shimDir, { recursive: true, force: true }))

const sql = (query, db = '') =>
  execFileSync(
    REAL_DOCKER,
    ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', '-N', '-B', ...(db ? [db] : [])],
    { input: query, encoding: 'utf8' }
  ).trim()
const rows = (query, db = 'wordpress') =>
  sql(query, db)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
/** One value as the database holds it, through HEX (batch output escapes backslashes). */
const value = (query, db = 'wordpress') => Buffer.from(sql(query, db), 'hex').toString('utf8')

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

// ── a WordPress site ─────────────────────────────────────────────────────────────────────────
/** PHP's serialize() of a flat {key: string} object. */
const ser = (o) =>
  `a:${Object.keys(o).length}:{${Object.entries(o)
    .map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`)
    .join('')}}`
const sqlText = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
const themeMods = (url, color = '#1e3a8a') =>
  ser({ primary_color: color, header_image: `${url}/wp-content/uploads/2026/09/header.jpg` })
const widget = (url) => ser({ title: 'Visit us', text: `<a href="${url}/contact">Contact</a>` })

/**
 * The tables, as a site at `url` holds them. `guid` keeps the live address on the copy too:
 * provision's search-replace skips it (`--skip-columns=guid`).
 */
const TABLES = (url, token) => `
CREATE TABLE wp_options (option_id bigint unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '',
  option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id),
  UNIQUE KEY option_name (option_name)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_posts (ID bigint unsigned NOT NULL AUTO_INCREMENT, post_author bigint unsigned NOT NULL DEFAULT 0,
  post_content longtext NOT NULL, post_title text NOT NULL, post_status varchar(20) NOT NULL DEFAULT 'publish',
  post_name varchar(200) NOT NULL DEFAULT '', post_modified datetime NOT NULL DEFAULT '2026-01-01 00:00:00',
  post_modified_gmt datetime NOT NULL DEFAULT '2026-01-01 00:00:00', post_parent bigint unsigned NOT NULL DEFAULT 0,
  guid varchar(255) NOT NULL DEFAULT '', post_type varchar(20) NOT NULL DEFAULT 'post', comment_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (ID), KEY post_parent (post_parent)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_postmeta (meta_id bigint unsigned NOT NULL AUTO_INCREMENT, post_id bigint unsigned NOT NULL DEFAULT 0,
  meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY post_id (post_id))
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_users (ID bigint unsigned NOT NULL AUTO_INCREMENT, user_login varchar(60) NOT NULL DEFAULT '',
  user_email varchar(100) NOT NULL DEFAULT '', PRIMARY KEY (ID)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_usermeta (umeta_id bigint unsigned NOT NULL AUTO_INCREMENT, user_id bigint unsigned NOT NULL DEFAULT 0,
  meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_terms (term_id bigint unsigned NOT NULL AUTO_INCREMENT, name varchar(200) NOT NULL DEFAULT '',
  slug varchar(200) NOT NULL DEFAULT '', PRIMARY KEY (term_id)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint unsigned NOT NULL AUTO_INCREMENT, term_id bigint unsigned NOT NULL DEFAULT 0,
  taxonomy varchar(32) NOT NULL DEFAULT '', description longtext NOT NULL, parent bigint unsigned NOT NULL DEFAULT 0,
  count bigint NOT NULL DEFAULT 0, PRIMARY KEY (term_taxonomy_id), UNIQUE KEY term_id_taxonomy (term_id, taxonomy))
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_term_relationships (object_id bigint unsigned NOT NULL DEFAULT 0, term_taxonomy_id bigint unsigned NOT NULL DEFAULT 0,
  term_order int NOT NULL DEFAULT 0, PRIMARY KEY (object_id, term_taxonomy_id)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
CREATE TABLE wp_claude_cowork_apply_log (id bigint unsigned NOT NULL AUTO_INCREMENT, entry text, PRIMARY KEY (id));
CREATE TABLE wp_actionscheduler_logs (log_id bigint unsigned NOT NULL AUTO_INCREMENT, message text, PRIMARY KEY (log_id));
INSERT INTO wp_options VALUES
  (1, 'siteurl', ${sqlText(url)}, 'yes'), (2, 'home', ${sqlText(url)}, 'yes'), (3, 'blogname', 'Shop', 'yes'),
  (4, 'theme_mods_shop', ${sqlText(themeMods(url))}, 'yes'), (5, 'widget_text', ${sqlText(widget(url))}, 'yes'),
  (6, 'cron', 'a:0:{}', 'yes'), (7, 'claude_cowork_token', ${sqlText(token)}, 'yes'),
  (8, '_transient_feed', 'old feed', 'no');
INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_name, guid, post_type) VALUES
  (1, 1, ${sqlText(`<p>Read <a href="${url}/about">about us</a>.</p>`)}, 'Hello world', 'hello-world', '${LIVE_URL}/?p=1', 'post'),
  (2, 1, 'About us.', 'About', 'about', '${LIVE_URL}/?page_id=2', 'page'),
  (3, 1, 'Write to us.', 'Contact', 'contact', '${LIVE_URL}/?page_id=3', 'page');
INSERT INTO wp_postmeta VALUES (1, 1, '_edit_lock', '1700000000:1'), (2, 2, '_wp_page_template', 'default');
INSERT INTO wp_users VALUES (1, 'owner', 'owner@shop.example');
INSERT INTO wp_usermeta VALUES (1, 1, 'nickname', 'owner'), (2, 1, 'session_tokens', 'a:0:{}');
INSERT INTO wp_terms VALUES (1, 'Uncategorized', 'uncategorized');
INSERT INTO wp_term_taxonomy VALUES (1, 1, 'category', '', 0, 1);
INSERT INTO wp_term_relationships VALUES (1, 1, 0);
INSERT INTO wp_claude_cowork_apply_log VALUES (1, 'imported');
`

const wpConfig = (db) => `<?php
define( 'DB_NAME', '${db.name}' );
define( 'DB_USER', '${db.user}' );
define( 'DB_PASSWORD', '${db.password}' );
define( 'DB_HOST', '${db.host}' );
define( 'AUTH_KEY', 'live-auth-key' );
define( 'WP_DEBUG', false );
$table_prefix = 'wp_';
${db.extra ?? ''}
/* That's all, stop editing! Happy publishing. */
if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`
const LIVE_DB = { name: 'shop_live', user: 'shop', password: 'live-password', host: 'localhost' }
const COPY_DB = {
  name: 'wordpress',
  user: 'root',
  password: 'copy-password',
  host: 'db',
  extra: `define('WP_HOME', '${COPY_URL}');\ndefine('WP_SITEURL', '${COPY_URL}');`
}
const css = (edit = {}) => Array.from({ length: 20 }, (_, i) => edit[i] ?? `.rule-${i} {}`).join('\n') + '\n'
const HTACCESS = `RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
# BEGIN WordPress
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule . /index.php [L]
# END WordPress
`
const SITE_FILES = {
  'index.php': '<?php // WordPress\n',
  'wp-includes/version.php': "<?php $wp_version = '6.8';\n",
  'wp-content/themes/shop/style.css': css(),
  'wp-content/plugins/claude-cowork/claude-cowork.php': '<?php // Claude Cowork 0.18.24\n',
  '.htaccess': HTACCESS
}

/**
 * live-pull.mjs's stand-in for a read through the engine: what it would leave for a site whose
 * engine lists every file with its sha1 and reads files one by one (WordPress's today). With a
 * manifest (`TRACY_SYNC_MANIFEST_IN`) only the files whose sha1 differs come, in `changes/`, and
 * `deleted.json` names what the manifest has and the site does not; Tracy's own files are never
 * listed. The manifest it was handed is kept beside the run for the test to read.
 */
const FAKE_PULL = `
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const dir = process.argv[2]
const out = join(dir, 'live')
mkdirSync(out, { recursive: true })
const tracy = (p) => p.startsWith('wp-content/plugins/claude-cowork/') || p === 'wp-content/mu-plugins/tracy-access.php'
const files = new Map()
const walk = (root, rel = '') => {
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const p = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) walk(root, p)
    else if (!tracy(p)) files.set(p, createHash('sha1').update(readFileSync(join(root, p))).digest('hex'))
  }
}
walk(process.env.FAKE_LIVE_TREE)
const manifestIn = process.env.TRACY_SYNC_MANIFEST_IN || ''
const base = manifestIn ? JSON.parse(readFileSync(manifestIn, 'utf8')) : null
writeFileSync(join(dir, 'seen-manifest.json'), JSON.stringify(base))
let read = 0
const into = base ? join(out, 'changes') : join(out, 'tree')
for (const [p, sha] of files) {
  if (base && base[p] === sha) continue
  mkdirSync(dirname(join(into, p)), { recursive: true })
  copyFileSync(join(process.env.FAKE_LIVE_TREE, p), join(into, p))
  read++
}
if (base) writeFileSync(join(out, 'deleted.json'), JSON.stringify(Object.keys(base).filter((p) => !files.has(p) && !tracy(p))))
writeFileSync(join(out, 'manifest.json'), JSON.stringify(Object.fromEntries(files)))
copyFileSync(process.env.FAKE_LIVE_DUMP, join(out, 'db.sql.gz'))
console.log(JSON.stringify({ ok: true, mode: base ? 'incremental' : 'full', read, files: files.size }))
`

function write(root, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
}

function stack(extraSql = '') {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-live-sync-wp-'))
  const priv = join(srv, LABEL)
  const webroot = join(priv, '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(join(priv, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(priv, '.env'), 'PLATFORM=wordpress\nDB_PASSWORD=t\n')
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
  const run = (script, args) => {
    const r = spawnSync('bash', [script, '--label', LABEL, ...args], { env, encoding: 'utf8' })
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}\n${r.stdout}`)
    return { ...JSON.parse(r.stdout.trim().split('\n').at(-1)), _log: r.stderr }
  }

  for (const db of sql(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'wordpress%' OR schema_name LIKE 'livesrc%'"
  )
    .split('\n')
    .filter(Boolean))
    sql(`DROP DATABASE \`${db}\``)

  // The copy as provision hands it over: the live site's files and database, its own address in
  // both (search-replace, guid skipped), wp-config.php rendered, a token of its own, the sign-in
  // plugin, the force-HTTPS pair commented out and the hardening block added; then the baseline and v1.
  sql('CREATE DATABASE wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci')
  sql(TABLES(COPY_URL, 'copy-token'), 'wordpress')
  if (extraSql) sql(extraSql, 'wordpress')
  sql("INSERT INTO wp_options VALUES (9, 'tracy_access_aud', 'aud-of-the-copy', 'yes')", 'wordpress')
  write(webroot, {
    ...SITE_FILES,
    'wp-config.php': wpConfig(COPY_DB),
    'wp-content/mu-plugins/tracy-access.php': '<?php // Tracy sign-in\n'
  })
  execFileSync(
    'bash',
    [
      '-c',
      `. "${scripts}/lib/webroot-htaccess.sh"; tracy_neutralize_https_redirect "$1/.htaccess" >/dev/null; tracy_ensure_webroot_htaccess "$1" >/dev/null`,
      'x',
      webroot
    ],
    { env }
  )
  run(GIT, ['--op', 'ensure'])
  run(BACKUP, ['--op', 'initial-backup'])

  // The live site, as the customer keeps it.
  const live = join(srv, 'live-site')
  write(live, { ...SITE_FILES, 'wp-config.php': wpConfig(LIVE_DB) })
  sql('CREATE DATABASE livesrc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci')
  sql(TABLES(LIVE_URL, 'live-token'), 'livesrc')
  if (extraSql) sql(extraSql, 'livesrc')

  let reads = 0
  return {
    priv,
    webroot,
    live,
    run,
    read() {
      const dir = join(srv, `sync-${++reads}`)
      mkdirSync(join(dir, 'live'), { recursive: true })
      execFileSync('tar', ['-cf', join(dir, 'live', 'webroot.tar'), '-C', live, '.'])
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        { maxBuffer: 1 << 28 }
      )
      execFileSync('sh', ['-c', `gzip -c > "${join(dir, 'live', 'db.sql.gz')}"`], { input: dump })
      return dir
    },
    sync: (dir) =>
      run(SYNC, ['--op', 'sync', '--dir', dir, '--by-name', 'Lee', '--by-email', 'lee@example.com']),
    /** `sync` as tracy-host starts it, the live site read by `FAKE_PULL` in live-pull.mjs's place. */
    syncReading() {
      const lib = join(srv, 'lib-fake-pull')
      if (!existsSync(lib)) {
        mkdirSync(lib)
        for (const name of readdirSync(join(scripts, 'lib')))
          if (name !== 'live-pull.mjs') symlinkSync(join(scripts, 'lib', name), join(lib, name))
        writeFileSync(join(lib, 'live-pull.mjs'), FAKE_PULL)
      }
      const dump = execFileSync(
        REAL_DOCKER,
        ['exec', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb-dump', '-uroot', '--skip-triggers', 'livesrc'],
        { maxBuffer: 1 << 28 }
      )
      const gz = join(srv, `live-${++reads}.sql.gz`)
      execFileSync('sh', ['-c', `gzip -c > "${gz}"`], { input: dump })
      const dir = join(priv, 'sync', 'runs', `run-${reads}`)
      mkdirSync(dir, { recursive: true })
      const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'sync', '--dir', dir], {
        encoding: 'utf8',
        env: {
          ...env,
          TRACY_LIB_DIR: lib,
          TRACY_SYNC_ENDPOINT: 'https://shop.example/wp-admin/admin-ajax.php?action=claude_cowork',
          TRACY_SYNC_TOKEN: 'token-of-test',
          FAKE_LIVE_TREE: live,
          FAKE_LIVE_DUMP: gz
        }
      })
      assert.equal(r.status, 0, r.stderr)
      const seen = existsSync(join(dir, 'seen-manifest.json'))
        ? JSON.parse(readFileSync(join(dir, 'seen-manifest.json'), 'utf8'))
        : undefined
      return { ...JSON.parse(r.stdout.trim().split('\n').at(-1)), _log: r.stderr, _manifest: seen }
    },
    dockerLog: () =>
      existsSync(join(srv, 'docker.log')) ? readFileSync(join(srv, 'docker.log'), 'utf8') : '',
    /**
     * What Sync to live would offer now (`live_push.py changeset`, as webroot-live-push.sh runs it
     * after its sync): the last read of the live site loaded raw as the base, the copy, the id map.
     * Each into a scratch schema, given the `menu_order` these tables leave out (a menu item has one).
     */
    pushChangeset() {
      const load = (schema, dump) => {
        sql(
          `DROP DATABASE IF EXISTS ${schema}; CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci`
        )
        execFileSync(
          REAL_DOCKER,
          ['exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot', schema],
          {
            input: dump,
            maxBuffer: 1 << 28
          }
        )
        sql('ALTER TABLE wp_posts ADD COLUMN menu_order INT NOT NULL DEFAULT 0', schema)
      }
      load('wordpress_pushbase', gunzipSync(readFileSync(join(priv, 'sync', 'live-base.sql.gz'))))
      load(
        'wordpress_pushcopy',
        execFileSync(
          REAL_DOCKER,
          [
            'exec',
            '-e',
            'MYSQL_PWD=t',
            DB_CONTAINER,
            'mariadb-dump',
            '-uroot',
            '--skip-triggers',
            'wordpress'
          ],
          { maxBuffer: 1 << 28 }
        )
      )
      const client = [REAL_DOCKER, 'exec', '-i', '-e', 'MYSQL_PWD=t', DB_CONTAINER, 'mariadb', '-uroot']
      const r = spawnSync(
        'python3',
        [
          PUSH,
          'changeset',
          '--platform',
          'wordpress',
          '--prefix',
          'wp_',
          '--base-schema',
          'wordpress_pushbase',
          '--copy-schema',
          'wordpress_pushcopy',
          '--id-map',
          join(priv, 'sync', 'id-map.json')
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, TRACY_SYNC_SQL: JSON.stringify(client) },
          maxBuffer: 1 << 28
        }
      )
      assert.equal(r.status, 0, r.stderr + r.stdout)
      return JSON.parse(r.stdout.trim().split('\n').at(-1))
    },
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

test(
  'WordPress: the customer’s live changes and the agent’s copy changes both end up in the copy, at the copy’s address',
  opts,
  () => {
    const s = stack()
    try {
      // The agent, on the copy.
      sql(
        `UPDATE wp_posts SET post_content=${sqlText(`<p>About us, by Tracy: see <a href="${COPY_URL}/menu">the menu</a>.</p>`)},
           post_modified='2026-10-20 10:00:00' WHERE ID=2;
         UPDATE wp_posts SET post_title='Get in touch', post_modified='2026-10-20 10:00:00' WHERE ID=3;
         INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_name, guid, post_type)
           VALUES (4, 1, 'Made by Tracy.', 'Tracy landing', 'tracy-landing', '${COPY_URL}/?page_id=4', 'page');
         INSERT INTO wp_postmeta VALUES (3, 4, '_wp_page_template', 'landing.php');
         INSERT INTO wp_term_relationships VALUES (4, 1, 0);
         UPDATE wp_options SET option_value=${sqlText(themeMods(COPY_URL, '#bf5b3d'))} WHERE option_name='theme_mods_shop';
         INSERT INTO wp_options VALUES (10, 'blogdescription', 'Fresh coffee', 'yes');
         UPDATE wp_options SET option_value='a:1:{i:1;s:4:"copy";}' WHERE option_name='cron';
         UPDATE wp_usermeta SET meta_value='a:1:{s:4:"copy";i:1;}' WHERE umeta_id=2;
         INSERT INTO wp_claude_cowork_apply_log VALUES (2, 'agent edit');`,
        'wordpress'
      )
      write(s.webroot, {
        'wp-content/themes/shop/style.css': css({ 2: '.btn { color: #bf5b3d } /* Tracy */' })
      })
      // The customer, on the live site.
      sql(
        `UPDATE wp_posts SET post_title='Hello from live', post_modified='2026-10-21 09:00:00' WHERE ID=1;
         UPDATE wp_posts SET post_title='Contact us', post_modified='2026-10-21 09:00:00' WHERE ID=3;
         INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_name, guid, post_type)
           VALUES (4, 1, ${sqlText(`<p>Our <a href="${LIVE_URL}/spring">spring sale</a>. <img class="wp-image-4"/></p>`)},
                   'Spring sale', 'spring-sale', '${LIVE_URL}/?p=4', 'post');
         INSERT INTO wp_postmeta VALUES (3, 4, '_thumbnail_id', '4'), (4, 4, '_spring', 'yes');
         INSERT INTO wp_term_relationships VALUES (4, 1, 0);
         UPDATE wp_options SET option_value='Shop & Co' WHERE option_name='blogname';
         INSERT INTO wp_options VALUES (10, 'shop_hours', '8-18', 'yes');
         UPDATE wp_options SET option_value='a:1:{i:2;s:4:"live";}' WHERE option_name='cron';
         UPDATE wp_options SET option_value='new feed' WHERE option_name='_transient_feed';
         UPDATE wp_usermeta SET meta_value='a:1:{s:4:"live";i:1;}' WHERE umeta_id=2;
         INSERT INTO wp_actionscheduler_logs VALUES (1, 'ran');`,
        'livesrc'
      )
      write(s.live, {
        'wp-content/themes/shop/style.css': css({ 17: '.nav { gap: 4px } /* customer */' }),
        'wp-content/uploads/2026/10/spring.jpg': 'jpeg bytes',
        'wp-config.php': wpConfig({ ...LIVE_DB, extra: "define( 'WP_POST_REVISIONS', 3 );" })
      })

      const first = s.sync(s.read())
      assert.equal(first.state, 'applied', JSON.stringify({ ...first, _log: undefined }))
      assert.equal(first.baseKind, 'built')
      assert.deepEqual(first.conflicts, [])
      assert.deepEqual(first.held, [])
      // The one place both changed: the copy's title stays, and the live one is named.
      assert.deepEqual(
        first.kept.map((c) => c.id),
        ['db:wp_posts:["3"]:post_title']
      )
      assert.deepEqual(first.kept[0].values.theirs, { post_title: { text: 'Contact us' } })
      assert.deepEqual(
        first.renumbered.map((r) => [r.table, r.live, r.copy]),
        [
          ['posts', 4, 5],
          ['postmeta', 3, 5]
        ]
      )
      assert.match(first._log, /theirs: https:\/\/shop\.example → https:\/\/shop-com\.tracy\.ai/)

      // Posts: each side's edit, both new posts, the live one renumbered with what points at it.
      assert.deepEqual(rows('SELECT ID, post_title, post_name FROM wp_posts ORDER BY ID'), [
        ['1', 'Hello from live', 'hello-world'],
        ['2', 'About', 'about'],
        ['3', 'Get in touch', 'contact'],
        ['4', 'Tracy landing', 'tracy-landing'],
        ['5', 'Spring sale', 'spring-sale']
      ])
      assert.equal(
        value('SELECT HEX(post_content) FROM wp_posts WHERE ID=1'),
        `<p>Read <a href="${COPY_URL}/about">about us</a>.</p>`
      )
      assert.match(value('SELECT HEX(post_content) FROM wp_posts WHERE ID=2'), /by Tracy/)
      assert.equal(
        value('SELECT HEX(post_content) FROM wp_posts WHERE ID=5'),
        `<p>Our <a href="${COPY_URL}/spring">spring sale</a>. <img class="wp-image-5"/></p>`
      )
      assert.equal(value('SELECT HEX(guid) FROM wp_posts WHERE ID=5'), `${LIVE_URL}/?p=5`)
      assert.deepEqual(
        rows('SELECT post_id, meta_key, meta_value FROM wp_postmeta ORDER BY post_id, meta_key'),
        [
          ['1', '_edit_lock', '1700000000:1'],
          ['2', '_wp_page_template', 'default'],
          ['4', '_wp_page_template', 'landing.php'],
          ['5', '_spring', 'yes'],
          ['5', '_thumbnail_id', '5']
        ]
      )
      assert.deepEqual(
        rows('SELECT object_id, term_taxonomy_id FROM wp_term_relationships ORDER BY object_id'),
        [
          ['1', '1'],
          ['4', '1'],
          ['5', '1']
        ]
      )

      // Options: the live site's setting and new option, the copy's theme mod, address, token and
      // its own options; the running site's cron, transients and sessions stay the copy's, unnamed.
      const option = (name) => value(`SELECT HEX(option_value) FROM wp_options WHERE option_name='${name}'`)
      assert.equal(option('blogname'), 'Shop & Co')
      assert.equal(option('shop_hours'), '8-18')
      assert.equal(option('blogdescription'), 'Fresh coffee')
      assert.equal(option('home'), COPY_URL)
      assert.equal(option('siteurl'), COPY_URL)
      assert.equal(option('theme_mods_shop'), themeMods(COPY_URL, '#bf5b3d'))
      assert.equal(option('widget_text'), widget(COPY_URL))
      assert.equal(option('claude_cowork_token'), 'copy-token')
      assert.equal(option('tracy_access_aud'), 'aud-of-the-copy')
      assert.equal(option('cron'), 'a:1:{i:1;s:4:"copy";}')
      assert.equal(option('_transient_feed'), 'old feed')
      assert.equal(value('SELECT HEX(meta_value) FROM wp_usermeta WHERE umeta_id=2'), 'a:1:{s:4:"copy";i:1;}')
      assert.deepEqual(rows('SELECT COUNT(*) FROM wp_options'), [['11']])
      assert.deepEqual(rows('SELECT COUNT(*) FROM wp_actionscheduler_logs'), [['0']])
      assert.deepEqual(rows('SELECT entry FROM wp_claude_cowork_apply_log ORDER BY id'), [
        ['imported'],
        ['agent edit']
      ])

      // Files: both sides' lines, the live upload, wp-config.php setting by setting, Tracy's own files.
      const style = readFileSync(join(s.webroot, 'wp-content/themes/shop/style.css'), 'utf8')
      assert.match(style, /Tracy/)
      assert.match(style, /customer/)
      assert.equal(
        readFileSync(join(s.webroot, 'wp-content/uploads/2026/10/spring.jpg'), 'utf8'),
        'jpeg bytes'
      )
      const cfg = readFileSync(join(s.webroot, 'wp-config.php'), 'utf8')
      assert.match(cfg, /define\( 'WP_POST_REVISIONS', 3 \);/)
      assert.match(cfg, /define\( 'DB_PASSWORD', 'copy-password' \);/)
      assert.match(cfg, /define\( 'DB_HOST', 'db' \);/)
      assert.match(cfg, /define\('WP_HOME', 'https:\/\/shop-com\.tracy\.ai'\);/)
      assert.ok(existsSync(join(s.webroot, 'wp-content/mu-plugins/tracy-access.php')))
      // The live .htaccess read the way provision left the copy's: no change to take.
      const ht = readFileSync(join(s.webroot, '.htaccess'), 'utf8')
      assert.match(ht, /# tracy-clone \(behind a TLS proxy, this would loop\): RewriteCond %\{HTTPS\} off/)
      assert.match(ht, /Tracy clone hardening/)
      assert.equal(ht.match(/Tracy clone hardening \(provisioned/g).length, 1)

      // What WordPress must redo: the comment counts of the posts that came over.
      assert.match(s.dockerLog(), /^web wordpress -e TRACY_SYNC_REBUILD=posts$/m)
      assert.doesNotMatch(s.dockerLog(), /^web joomla/m)
      assert.deepEqual(first.apply.after, {
        largeFilesCopied: 0,
        rebuild: 'none',
        cache: 'cleared',
        contentIdentity: 'none'
      })
      assert.equal(
        rows("SHOW DATABASES LIKE 'wordpress\\_tracy\\_sync%'", '').length,
        0,
        'no scratch schema left'
      )

      // A second sync starts from the first read, the live address in it rewritten again: only the
      // customer's new edit of their renumbered post comes over, to the copy's number.
      sql("UPDATE wp_posts SET post_title='Spring sale ends Sunday' WHERE ID=4", 'livesrc')
      const second = s.sync(s.read())
      assert.equal(second.state, 'applied', JSON.stringify({ ...second, _log: undefined }))
      assert.equal(second.baseKind, 'last-sync')
      assert.deepEqual(second.kept, [])
      assert.deepEqual(second.renumbered, [])
      assert.equal(
        second.database.rowsMerged + second.database.rowsFromTheirs,
        1,
        JSON.stringify(second.database)
      )
      assert.deepEqual(rows('SELECT ID, post_title FROM wp_posts WHERE ID IN (4, 5) ORDER BY ID'), [
        ['4', 'Tracy landing'],
        ['5', 'Spring sale ends Sunday']
      ])
      assert.equal(option('theme_mods_shop'), themeMods(COPY_URL, '#bf5b3d'))
    } finally {
      s.dispose()
    }
  }
)

test(
  'WordPress: a first sync reads only the files that differ from the copy as built, and lays them over it',
  opts,
  () => {
    const s = stack()
    try {
      write(s.live, {
        'wp-content/themes/shop/style.css': css({ 17: '.nav { gap: 4px } /* customer */' }),
        'wp-content/uploads/2026/10/spring.jpg': 'jpeg bytes'
      })
      rmSync(join(s.live, 'wp-includes/version.php'))
      sql("UPDATE wp_options SET option_value='Shop & Co' WHERE option_name='blogname'", 'livesrc')
      write(s.webroot, {
        'wp-content/themes/shop/style.css': css({ 2: '.btn { color: #bf5b3d } /* Tracy */' })
      })

      const done = s.syncReading()
      assert.equal(done.state, 'applied', JSON.stringify({ ...done, _log: undefined }))
      // The manifest handed to the read: the copy as built, each file by its bytes' sha1.
      const sha1 = (text) => createHash('sha1').update(text).digest('hex')
      assert.equal(done._manifest['index.php'], sha1(SITE_FILES['index.php']))
      assert.equal(done._manifest['wp-config.php'], sha1(wpConfig(COPY_DB)))
      assert.ok(done._manifest['wp-content/mu-plugins/tracy-access.php'])
      // Read: the live wp-config.php and .htaccess (provision rewrote the copy's), the theme's
      // stylesheet and the upload — not the files the import already brought.
      assert.match(done._log, /reading the live site/)
      assert.deepEqual(done.kept, [])
      assert.deepEqual(done.files.fromTheirs + done.files.merged >= 2, true, JSON.stringify(done.files))

      const style = readFileSync(join(s.webroot, 'wp-content/themes/shop/style.css'), 'utf8')
      assert.match(style, /Tracy/)
      assert.match(style, /customer/)
      assert.equal(
        readFileSync(join(s.webroot, 'wp-content/uploads/2026/10/spring.jpg'), 'utf8'),
        'jpeg bytes'
      )
      assert.ok(!existsSync(join(s.webroot, 'wp-includes/version.php')), 'a file the live site deleted goes')
      assert.ok(
        existsSync(join(s.webroot, 'wp-content/mu-plugins/tracy-access.php')),
        'Tracy’s own file stays'
      )
      assert.match(readFileSync(join(s.webroot, 'wp-config.php'), 'utf8'), /'DB_PASSWORD', 'copy-password'/)
      assert.match(readFileSync(join(s.webroot, '.htaccess'), 'utf8'), /# tracy-clone \(behind a TLS proxy/)
      assert.equal(
        value("SELECT HEX(option_value) FROM wp_options WHERE option_name='blogname'"),
        'Shop & Co'
      )
      // The next read starts from this one's manifest.
      assert.ok(existsSync(join(s.priv, 'sync', 'live-manifest.json')))
      assert.equal(
        JSON.parse(readFileSync(join(s.priv, 'sync', 'live-manifest.json'), 'utf8'))[
          'wp-content/uploads/2026/10/spring.jpg'
        ],
        sha1('jpeg bytes')
      )
    } finally {
      s.dispose()
    }
  }
)

test(
  'WordPress: a chain of syncs that renumber many posts, a live upload, a trashed and a deleted page, then a sync with nothing new',
  opts,
  () => {
    // What a site met on dev (23/10/2026, 14 syncs in a row): the remembered numbers grow with every
    // sync that renumbers, and each sync renumbers both reads by all of them. The links written
    // into text (`?p=N` in a guid, `wp-image-N` in content) were rewritten by one REGEXP_REPLACE per
    // remembered number and link, nested in one expression: past ~160 deep MariaDB died of its own
    // stack (signal 11) and the sync stopped as MERGE_FAILED — on a sync that had nothing to merge.
    const s = stack()
    const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    const post = (id, title, content, guid, type = 'post', parent = 0) =>
      `(${id}, 1, ${sqlText(content)}, ${sqlText(title)}, 'publish', 'p-${id}', '2026-01-01 00:00:00',
        '2026-01-01 00:00:00', ${parent}, ${sqlText(guid)}, ${sqlText(type)}, 0)`
    const insertPosts = (list) => `INSERT INTO wp_posts VALUES ${list.join(',\n')};`
    const insertMeta = (list) =>
      `INSERT INTO wp_postmeta VALUES ${list.map(([id, postId, key, v]) => `(${id}, ${postId}, '${key}', ${sqlText(v)})`).join(', ')};`
    /** The customer's posts: live number `raw`, its own guid and a note in postmeta `meta`. */
    const livePosts = (raws, metaFrom) =>
      `${insertPosts(raws.map((raw) => post(raw, `Live ${raw}`, `<p>Live post ${raw}</p>`, `${LIVE_URL}/?p=${raw}`)))}
       ${insertMeta(raws.map((raw, i) => [metaFrom + i, raw, '_live_note', `note ${raw}`]))}`
    /** The agent's posts on the copy, with a template each. */
    const tracyPosts = (list, metaFrom) =>
      `${insertPosts(list.map((id) => post(id, `Tracy ${id}`, `<p>By Tracy ${id}</p>`, `${COPY_URL}/?p=${id}`)))}
       ${insertMeta(list.map((id, i) => [metaFrom + i, id, '_wp_page_template', 'tracy.php']))}`
    const syncOnce = (what) => {
      const done = s.sync(s.read())
      assert.equal(
        done.state,
        'applied',
        `${what}: ${JSON.stringify({ ...done, _log: undefined })}\n${done._log.split('\n').slice(-12).join('\n')}`
      )
      assert.deepEqual(done.conflicts, [], what)
      assert.deepEqual(done.held, [], what)
      return done
    }
    try {
      // 1. Both sides make 15 posts under the same numbers: the live ones come over as 19..33.
      sql(tracyPosts(ids(4, 18), 3), 'wordpress')
      sql(livePosts(ids(4, 18), 3), 'livesrc')
      const first = syncOnce('both create')
      assert.deepEqual(
        first.renumbered.filter((r) => r.table === 'posts').map((r) => [r.live, r.copy]),
        ids(4, 18).map((raw) => [raw, raw + 15])
      )

      // 2. The live site goes on numbering from 19 — the numbers its first posts were given on the
      // copy — and trashes one of them; the agent deletes one of its own pages.
      sql(`${livePosts(ids(19, 33), 18)} UPDATE wp_posts SET post_status='trash' WHERE ID=5;`, 'livesrc')
      sql('DELETE FROM wp_postmeta WHERE post_id=6; DELETE FROM wp_posts WHERE ID=6;', 'wordpress')
      const second = syncOnce('live squats the given numbers')
      assert.deepEqual(
        second.renumbered.filter((r) => r.table === 'posts').map((r) => [r.live, r.copy, r.why]),
        ids(19, 33).map((raw) => [raw, raw + 15, 'occupied'])
      )

      // 3. Again (a chain three deep: live 4 → 19, live 19 → 34, live 34 → a new number), both make
      // 31 more posts under one set of numbers, and the customer uploads an image (its attachment
      // the 31st of those numbers), puts it into page 3 and makes it page 2's featured image.
      const photo = `${LIVE_URL}/wp-content/uploads/2026/10/photo.jpg`
      sql(tracyPosts(ids(49, 79), 48), 'wordpress')
      sql(
        `${livePosts(ids(34, 48), 33)}
         ${livePosts(ids(49, 78), 48)}
         ${insertPosts([post(79, 'photo', '', photo, 'attachment', 3)])}
         ${insertMeta([
           [78, 79, '_wp_attached_file', '2026/10/photo.jpg'],
           [79, 79, '_wp_attachment_metadata', 'a:1:{s:4:"file";s:17:"2026/10/photo.jpg";}'],
           [80, 2, '_thumbnail_id', '79']
         ])}
         UPDATE wp_posts SET post_content=${sqlText(
           `Write to us.<!-- wp:image {"id":79} --><img src="${photo}" class="wp-image-79"/><!-- /wp:image -->`
         )} WHERE ID=3;`,
        'livesrc'
      )
      write(s.live, { 'wp-content/uploads/2026/10/photo.jpg': 'photo bytes' })
      const third = syncOnce('a chain, both create, an upload')
      const given = Object.fromEntries(
        third.renumbered.filter((r) => r.table === 'posts').map((r) => [r.live, r.copy])
      )
      assert.deepEqual(
        Object.keys(given).map(Number),
        [...ids(34, 48), ...ids(49, 79)],
        JSON.stringify(third.renumbered)
      )
      const attachment = given[79]

      // 4. Nothing new on either side: the sync merges nothing, renumbers nothing new, and stops nowhere.
      const fourth = syncOnce('nothing new')
      assert.deepEqual(fourth.renumbered, [])
      assert.deepEqual(fourth.kept, [])
      assert.equal(
        fourth.database.rowsFromTheirs + fourth.database.rowsMerged + fourth.database.rowsDeleted,
        0
      )

      // 5. The customer edits posts at each depth of the chain: each edit lands on its copy number.
      sql(
        "UPDATE wp_posts SET post_title='Live 4 edited' WHERE ID=4; UPDATE wp_posts SET post_title='Live 19 edited' WHERE ID=19;" +
          " UPDATE wp_posts SET post_title='Live 34 edited' WHERE ID=34;",
        'livesrc'
      )
      syncOnce('edits along the chain')

      // Every live post at the number it was given, its guid and its note with it.
      const copyOf = (raw) => (raw <= 18 ? raw + 15 : raw <= 33 ? raw + 15 : given[raw])
      const byId = Object.fromEntries(
        rows("SELECT ID, post_title, post_status, guid FROM wp_posts WHERE post_title LIKE 'Live %'").map(
          ([id, ...rest]) => [id, rest]
        )
      )
      for (const raw of ids(4, 78)) {
        const edited = [4, 19, 34].includes(raw) ? ' edited' : ''
        assert.deepEqual(
          byId[copyOf(raw)],
          [`Live ${raw}${edited}`, raw === 5 ? 'trash' : 'publish', `${LIVE_URL}/?p=${copyOf(raw)}`],
          `live ${raw}`
        )
      }
      assert.equal(Object.keys(byId).length, 75)
      const notes = rows("SELECT post_id, meta_value FROM wp_postmeta WHERE meta_key='_live_note'")
      assert.equal(notes.length, 75)
      for (const [postId, note] of notes) assert.equal(postId, String(copyOf(Number(note.slice(5)))), note)
      // The agent's posts kept their numbers (its deleted page stays deleted).
      assert.deepEqual(
        rows("SELECT ID FROM wp_posts WHERE post_title LIKE 'Tracy %' ORDER BY ID").map(([id]) => Number(id)),
        [4, 5, ...ids(7, 18), ...ids(49, 79)]
      )
      // The upload: its attachment, its files' meta, the image in page 3 and page 2's featured image.
      assert.deepEqual(rows(`SELECT post_type, post_parent, guid FROM wp_posts WHERE ID=${attachment}`), [
        ['attachment', '3', photo]
      ])
      assert.deepEqual(
        rows(`SELECT meta_key FROM wp_postmeta WHERE post_id=${attachment} ORDER BY meta_key`),
        [['_wp_attached_file'], ['_wp_attachment_metadata']]
      )
      assert.equal(
        value('SELECT HEX(post_content) FROM wp_posts WHERE ID=3'),
        `Write to us.<!-- wp:image {"id":${attachment}} --><img src="${COPY_URL}/wp-content/uploads/2026/10/photo.jpg" class="wp-image-${attachment}"/><!-- /wp:image -->`
      )
      assert.deepEqual(
        rows("SELECT meta_value FROM wp_postmeta WHERE post_id=2 AND meta_key='_thumbnail_id'"),
        [[String(attachment)]]
      )
      assert.equal(
        readFileSync(join(s.webroot, 'wp-content/uploads/2026/10/photo.jpg'), 'utf8'),
        'photo bytes'
      )

      // Sync to live after the chain (both renumber reasons, three deep): every live post pairs with
      // the copy's record it is. The agent edits one at each depth; those go to the live posts as
      // updates under the live site's own numbers; Tracy's own posts are the only ones made, and no
      // live post is offered for removal.
      sql(
        `UPDATE wp_posts SET post_title = CONCAT(post_title, ' by Tracy') WHERE ID IN (${[7, 22, 40].map(copyOf).join(', ')});`,
        'wordpress'
      )
      const push = s.pushChangeset()
      const records = push.items.filter((i) => ['create', 'update', 'delete'].includes(i.op))
      assert.deepEqual(
        records.filter((i) => i.op !== 'create').map((i) => [i.op, i.title, i.liveId]),
        [7, 22, 40].map((raw) => ['update', `Live ${raw} by Tracy`, raw])
      )
      const tracy = [4, 5, ...ids(7, 18), ...ids(49, 79)]
      assert.deepEqual(
        records
          .filter((i) => i.op === 'create' && i.kind === 'post')
          .map((i) => i.title)
          .sort(),
        tracy.map((id) => `Tracy ${id}`).sort()
      )
      assert.ok(
        records.every((i) => i.op !== 'create' || /^Tracy \d+( · _wp_page_template)?$/.test(i.title)),
        JSON.stringify(records.filter((i) => i.op === 'create').map((i) => i.title))
      )
      assert.deepEqual(
        push.unsupported.filter((u) => u.what === 'record'),
        []
      )
      assert.equal(push.repairs, undefined)

      // A merge that stops says why — in the answer's detail and among the job's steps — with no
      // value of the site: here a remembered number that is not one.
      const mapFile = join(s.priv, 'sync', 'id-map.json')
      const map = JSON.parse(readFileSync(mapFile, 'utf8'))
      writeFileSync(mapFile, JSON.stringify({ ...map, posts: { ...map.posts, 'not-a-number': 7 } }))
      const stopped = s.sync(s.read())
      assert.equal(stopped.code, 'MERGE_FAILED')
      assert.match(
        stopped.detail,
        /^the database merge stopped: ValueError: invalid literal for int\(\) with base 10: '…' \(in .*IdMap\.__init__/
      )
      assert.doesNotMatch(stopped.detail, /not-a-number/)
      assert.match(stopped._log, /^==> \[\d+s\] db merge stopped: ValueError: /m)
    } finally {
      s.dispose()
    }
  }
)

test(
  'WordPress: what wp-admin leaves on the live site by itself never comes over — an auto-draft, its meta, a user’s admin settings, dashboard options — and an auto-draft the customer then publishes does (#1664)',
  opts,
  () => {
    const s = stack()
    try {
      // The copy: its own auto-draft (someone opened "Add New" on it) under the number the live
      // site's auto-draft has too.
      sql(
        `INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_status, post_name, guid, post_type)
           VALUES (6, 1, '', 'Auto Draft', 'auto-draft', '', '${COPY_URL}/?p=6', 'post');`,
        'wordpress'
      )
      // The live site after a sign-in, "Add New" and the dashboard: an auto-draft with its edit lock
      // and a template, the user's wp-admin settings, the dashboard's widget options, a ping to-do.
      sql(
        `INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_status, post_name, guid, post_type)
           VALUES (6, 1, '', 'Auto Draft', 'auto-draft', '', '${LIVE_URL}/?p=6', 'post');
         INSERT INTO wp_postmeta VALUES (10, 6, '_edit_lock', '1761270000:1'), (11, 6, '_wp_page_template', 'live.php'),
           (12, 1, '_trackbackme', '1');
         INSERT INTO wp_usermeta VALUES (3, 1, 'wp_user-settings', 'libraryContent=browse'),
           (4, 1, 'wp_user-settings-time', '1761270000'), (5, 1, 'wp_dashboard_quick_press_last_post_id', '6');
         INSERT INTO wp_options VALUES (20, 'dashboard_widget_options', 'a:0:{}', 'yes');
         UPDATE wp_options SET option_value='Shop & Co' WHERE option_name='blogname';`,
        'livesrc'
      )
      const first = s.sync(s.read())
      assert.equal(first.state, 'applied', JSON.stringify({ ...first, _log: undefined }))
      assert.deepEqual(first.conflicts, [])
      assert.deepEqual(first.held, [])
      assert.deepEqual(first.renumbered, [], 'the live auto-draft is no new post to number')
      assert.match(first._log, /auto-drafts left out: 0 of the base, 1 of the live read/)
      assert.deepEqual(rows("SELECT ID, post_status, guid FROM wp_posts WHERE post_status = 'auto-draft'"), [
        ['6', 'auto-draft', `${COPY_URL}/?p=6`]
      ])
      assert.deepEqual(
        rows("SELECT meta_id FROM wp_postmeta WHERE post_id = 6 OR meta_key = '_trackbackme'"),
        []
      )
      assert.deepEqual(rows('SELECT umeta_id FROM wp_usermeta WHERE umeta_id > 2'), [])
      assert.deepEqual(
        rows("SELECT option_id FROM wp_options WHERE option_name = 'dashboard_widget_options'"),
        []
      )
      // The customer's real edit still came over.
      assert.equal(
        value("SELECT HEX(option_value) FROM wp_options WHERE option_name='blogname'"),
        'Shop & Co'
      )

      // The customer writes that draft and publishes it: a post the last read never had, which comes
      // over under its own number — the copy's auto-draft there gives it up, being nobody's writing.
      sql(
        `UPDATE wp_posts SET post_status='publish', post_title='Autumn news', post_content='Leaves.',
           post_name='autumn-news' WHERE ID=6;`,
        'livesrc'
      )
      const second = s.sync(s.read())
      assert.equal(second.state, 'applied', JSON.stringify({ ...second, _log: undefined }))
      assert.deepEqual(second.held, [])
      assert.deepEqual(
        second.renumbered.filter((r) => r.table === 'posts'),
        []
      )
      assert.match(second._log, /the copy's auto-drafts under a number the live site's post has: 6 given up/)
      assert.deepEqual(rows('SELECT ID, post_status, post_title FROM wp_posts WHERE ID >= 6 ORDER BY ID'), [
        ['6', 'publish', 'Autumn news']
      ])
      assert.deepEqual(
        rows("SELECT meta_value FROM wp_postmeta WHERE post_id = 6 AND meta_key = '_wp_page_template'"),
        [['live.php']]
      )
    } finally {
      s.dispose()
    }
  }
)

test(
  'WordPress: a post the customer publishes under the number the copy holds only as an auto-draft comes over under it; the agent’s posts stay (dev S5, 24/10/2026)',
  opts,
  () => {
    const s = stack()
    try {
      // Both make post 6: the live one comes over as 7, and 6 → 7 is remembered.
      const post = (id, title, url, status = 'publish') =>
        `INSERT INTO wp_posts (ID, post_author, post_content, post_title, post_status, post_name, guid, post_type)
           VALUES (${id}, 1, '${status === 'auto-draft' ? '' : `${title} text.`}', '${title}', '${status}',
             '${status === 'auto-draft' ? '' : title.toLowerCase().replace(/ /g, '-')}', '${url}/?p=${id}', 'post');`
      sql(post(6, 'Tracy news', COPY_URL), 'wordpress')
      sql(post(6, 'Spring sale', LIVE_URL), 'livesrc')
      const first = s.sync(s.read())
      assert.equal(first.state, 'applied', JSON.stringify({ ...first, _log: undefined }))
      assert.deepEqual(
        first.renumbered.filter((r) => r.table === 'posts').map((r) => [r.live, r.copy]),
        [[6, 7]]
      )
      // The customer deletes it (gone from the copy too): 6 → 7 now names no post of either read.
      sql('DELETE FROM wp_posts WHERE ID = 6;', 'livesrc')
      const gone = s.sync(s.read())
      assert.equal(gone.state, 'applied', JSON.stringify({ ...gone, _log: undefined }))
      assert.deepEqual(rows('SELECT ID FROM wp_posts WHERE ID >= 6 ORDER BY ID'), [['6']])
      // On the copy: "Add New" opened (an auto-draft under 7, its edit lock and a term), and the agent
      // makes post 8. On the live site the customer publishes a post the site numbers 7.
      sql(
        `${post(7, 'Auto Draft', COPY_URL, 'auto-draft')}
         INSERT INTO wp_postmeta VALUES (30, 7, '_edit_lock', '1761270000:1'), (31, 7, '_wp_old_slug', 'x');
         INSERT INTO wp_term_relationships VALUES (7, 1, 0);
         ${post(8, 'Tracy recipes', COPY_URL)}
         INSERT INTO wp_postmeta VALUES (32, 8, '_wp_page_template', 'tracy.php');`,
        'wordpress'
      )
      sql(
        `${post(7, 'Live S5', LIVE_URL)}
         INSERT INTO wp_postmeta VALUES (30, 7, '_wp_page_template', 'live.php');`,
        'livesrc'
      )
      const both = s.sync(s.read())
      assert.equal(both.state, 'applied', JSON.stringify({ ...both, _log: undefined }))
      assert.deepEqual(both.conflicts, [])
      assert.deepEqual(both.held, [])
      assert.deepEqual(
        both.renumbered.filter((r) => r.table === 'posts'),
        [],
        'the live post keeps its 7'
      )
      assert.deepEqual(rows('SELECT ID, post_status, post_title FROM wp_posts WHERE ID >= 6 ORDER BY ID'), [
        ['6', 'publish', 'Tracy news'],
        ['7', 'publish', 'Live S5'],
        ['8', 'publish', 'Tracy recipes']
      ])
      assert.deepEqual(
        rows('SELECT post_id, meta_key, meta_value FROM wp_postmeta WHERE post_id >= 6 ORDER BY post_id'),
        [
          ['7', '_wp_page_template', 'live.php'],
          ['8', '_wp_page_template', 'tracy.php']
        ]
      )
      assert.deepEqual(rows('SELECT object_id FROM wp_term_relationships WHERE object_id >= 6'), [])
      // The customer's later edit of it lands on it.
      sql("UPDATE wp_posts SET post_title = 'Live S5 edited' WHERE ID = 7;", 'livesrc')
      const edit = s.sync(s.read())
      assert.equal(edit.state, 'applied', JSON.stringify({ ...edit, _log: undefined }))
      assert.deepEqual(edit.conflicts, [])
      assert.deepEqual(rows('SELECT ID, post_title FROM wp_posts WHERE ID >= 6 ORDER BY ID'), [
        ['6', 'Tracy news'],
        ['7', 'Live S5 edited'],
        ['8', 'Tracy recipes']
      ])
    } finally {
      s.dispose()
    }
  }
)

test('WordPress: copy-token writes the copy’s own Claude Cowork token into its options', opts, () => {
  const s = stack()
  try {
    const r = spawnSync('bash', [SYNC, '--label', LABEL, '--op', 'copy-token', '--dir', s.priv], {
      env: {
        ...process.env,
        PATH: pathWithFlock(`${shimDir}:${process.env.PATH}`),
        REAL_DOCKER,
        TEST_DB_CONTAINER: DB_CONTAINER,
        TRACY_SRV: dirname(s.priv),
        TRACY_SITES_ROOT: dirname(s.priv),
        TRACY_COPY_COWORK_TOKEN: 'a-fresh-token-of-the-copy-0123456789'
      },
      encoding: 'utf8'
    })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), { ok: true })
    assert.equal(
      value("SELECT HEX(option_value) FROM wp_options WHERE option_name='claude_cowork_token'"),
      'a-fresh-token-of-the-copy-0123456789'
    )
  } finally {
    s.dispose()
  }
})

const WC_DERIVED = [
  'wc_admin_notes',
  'wc_admin_note_actions',
  'wc_order_stats',
  'wc_order_product_lookup',
  'wc_customer_lookup'
]
const WC_CHILDREN = [
  'wc_orders_meta',
  'wc_order_addresses',
  'wc_order_operational_data',
  'woocommerce_order_items',
  'woocommerce_order_itemmeta'
]
const WC_TABLES = [
  ...WC_DERIVED.map(
    (name) => `CREATE TABLE wp_${name} (id bigint NOT NULL PRIMARY KEY, value varchar(100));
    INSERT INTO wp_${name} VALUES (1, 'baseline');`
  ),
  'CREATE TABLE wp_wc_orders (id bigint NOT NULL PRIMARY KEY, status varchar(30), total_amount decimal(12,2));',
  ...WC_CHILDREN.map(
    (name) => `CREATE TABLE wp_${name} (id bigint NOT NULL PRIMARY KEY, order_id bigint, value varchar(100));`
  )
].join('\n')

test('WooCommerce derived background rows do not create a backup or count as customer changes', opts, () => {
  const s = stack(WC_TABLES)
  try {
    const before = s.run(BACKUP, ['--op', 'list']).backups
    sql(
      WC_DERIVED.map((name) => `UPDATE wp_${name} SET value='background job' WHERE id=1;`).join('\n'),
      'livesrc'
    )
    const answer = s.sync(s.read())
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    assert.equal(answer.unchanged, 'merge', JSON.stringify(answer))
    assert.equal(answer.database.records, 0)
    assert.deepEqual(s.run(BACKUP, ['--op', 'list']).backups, before)
    for (const name of WC_DERIVED)
      assert.equal(sql(`SELECT value FROM wp_${name} WHERE id=1`, 'wordpress'), 'baseline')
  } finally {
    s.dispose()
  }
})

test(
  'WooCommerce HPOS order with a placeholder and child rows is one record with all business data retained',
  opts,
  () => {
    const s = stack(WC_TABLES)
    try {
      sql(
        `INSERT INTO wp_posts (ID, post_content, post_title, post_status, post_type)
      VALUES (40, '', 'Order placeholder', 'draft', 'shop_order_placehold');
      INSERT INTO wp_wc_orders VALUES (40, 'wc-processing', 123.45);
      ${WC_CHILDREN.map((name) => `INSERT INTO wp_${name} VALUES (1, 40, 'order child'), (2, 40, 'another child');`).join('\n')}`,
        'livesrc'
      )
      const answer = s.sync(s.read())
      assert.equal(answer.state, 'applied', JSON.stringify(answer))
      assert.deepEqual(answer.kept, [])
      assert.equal(sql('SELECT post_type FROM wp_posts WHERE ID=40', 'wordpress'), 'shop_order_placehold')
      assert.equal(sql('SELECT total_amount FROM wp_wc_orders WHERE id=40', 'wordpress'), '123.45')
      for (const name of WC_CHILDREN)
        assert.equal(sql(`SELECT COUNT(*) FROM wp_${name} WHERE order_id=40`, 'wordpress'), '2')
      assert.equal(answer.database.records, 1, JSON.stringify(answer.database))
    } finally {
      s.dispose()
    }
  }
)

test('WooCommerce child-only edits still sync without becoming independent records', opts, () => {
  const initial =
    WC_TABLES +
    `
    INSERT INTO wp_wc_orders VALUES (40, 'wc-processing', 123.45);
    ${WC_CHILDREN.map((name) => `INSERT INTO wp_${name} VALUES (1, 40, 'baseline child');`).join('\n')}`
  const s = stack(initial)
  try {
    sql(
      WC_CHILDREN.map((name) => `UPDATE wp_${name} SET value='customer edit' WHERE id=1;`).join('\n'),
      'livesrc'
    )
    const answer = s.sync(s.read())
    assert.equal(answer.state, 'applied', JSON.stringify(answer))
    assert.equal(answer.database.records, 0, JSON.stringify(answer.database))
    for (const name of WC_CHILDREN)
      assert.equal(sql(`SELECT value FROM wp_${name} WHERE id=1`, 'wordpress'), 'customer edit')
    sql(
      `UPDATE wp_wc_orders SET status='wc-completed' WHERE id=40;
      UPDATE wp_wc_order_addresses SET value='another edit' WHERE id=1;`,
      'livesrc'
    )
    const updated = s.sync(s.read())
    assert.equal(updated.state, 'applied', JSON.stringify(updated))
    assert.equal(updated.database.records, 1)
    assert.equal(sql('SELECT status FROM wp_wc_orders WHERE id=40', 'wordpress'), 'wc-completed')
    assert.equal(sql('SELECT value FROM wp_wc_order_addresses WHERE id=1', 'wordpress'), 'another edit')
  } finally {
    s.dispose()
  }
})
