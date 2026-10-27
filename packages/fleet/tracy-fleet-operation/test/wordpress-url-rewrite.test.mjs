/**
 * The in-database URL rewrite of a WordPress clone — the one step of `platform_configure` that
 * reaches for wp-cli, and the one that kept losing the site's table prefix (#220).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/wordpress-url-rewrite.test.mjs
 *
 * This RUNS `platform_configure` rather than reading it as text. Reading would prove a string is
 * present; it would not prove the prefix survives quoting, arrives before the image name (after
 * it, docker hands it to wp-cli as an argument instead of setting it), or that the rewrite is
 * reached at all. So the real function is sourced with a stub `docker` on PATH that answers the
 * three reads the step makes — the prefix from information_schema, the old address from
 * `<prefix>options`, the stack's network — and records every argv it is handed.
 *
 * The site under test carries the official image's wp-config, which COMPUTES its prefix:
 *
 *     $table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');
 *
 * so a wp-cli container started without `WORDPRESS_TABLE_PREFIX` falls back to `wp_` and refuses
 * the site outright ("Your table prefix is 'wp_'. Found installation with table prefix: tr_.").
 * Every fleet-born WordPress site is that site, which is why the import of one fails at this step.
 *
 * The same expression broke the copy a second time, after the job went green (#264): the copy's
 * web container runs with NO `WORDPRESS_*` environment (a clone carries its own config), so the
 * site computed `wp_`, found none of its `tr_` tables, and every page redirected to
 * /wp-admin/install.php. So the database here is not an answer typed into the stub: the stub
 * IMPORTS a dump the way provision.sh step 4 pipes one in, answers information_schema from the
 * tables that dump created, and the resulting wp-config.php is then EXECUTED by PHP with no
 * `WORDPRESS_*` in its environment — the web container's view, from dump to prefix.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const HERE_TEST = fileURLToPath(new URL('.', import.meta.url))

const SITE_URL = 'https://copy-of-acme.tracy.site'
const OLD_URL = 'https://acme.example'

// The official WordPress image's wp-config, trimmed to the parts this step reads or rewrites.
const WP_CONFIG = `<?php
if (!function_exists('getenv_docker')) {
	function getenv_docker($env, $default) {
		if (($val = getenv($env)) !== false) { return $val; }
		return $default;
	}
}
define( 'DB_NAME', getenv_docker('WORDPRESS_DB_NAME', 'wordpress') );
define( 'DB_USER', 'customer' );
define( 'DB_PASSWORD', 'customer-secret' );
define( 'DB_HOST', 'db.customer.example' );
define( 'AUTH_KEY', 'k3y;with$odd=chars' );
define( 'WP_CACHE', true ); // a plugin's constant
// $table_prefix = 'old_';
$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');
/* That's all, stop editing! Happy publishing. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`

/** A mysqldump of a site whose tables carry `prefix`, trimmed to what the steps read. */
const dump = (prefix) => `-- MariaDB dump
CREATE TABLE \`${prefix}options\` (option_id bigint, option_name varchar(191), option_value longtext);
INSERT INTO \`${prefix}options\` VALUES (1,'siteurl','${OLD_URL}'),(2,'home','${OLD_URL}');
CREATE TABLE \`${prefix}posts\` (ID bigint, guid varchar(255));
CREATE TABLE \`${prefix}usermeta\` (umeta_id bigint);
`

// Every docker invocation, one per line: `CALL <base64 arg> <base64 arg> …`. Base64 because the
// SQL the step sends carries quotes and spaces, and an argv that is re-split is not evidence.
//
// The database is a file, $DB_STATE: the import appends the dump to it, and every read answers
// from the tables that dump created — so a prefix is only ever what an imported dump holds.
const DOCKER_STUB = `#!/bin/sh
all="$*"
{ printf 'CALL'; for a in "$@"; do printf ' %s' "$(printf '%s' "$a" | base64 | tr -d '\\n')"; done; printf '\\n'; } >> "$DOCKER_LOG"
tables() { grep -oE 'CREATE TABLE .[A-Za-z0-9_]+.' "$DB_STATE" | sed -E 's/^CREATE TABLE .//; s/.$//'; }
case "$all" in
  *--init-command*) cat >> "$DB_STATE" ;;
  *information_schema*)
    tables | grep -E 'options$' | awk '{ print length($0), substr($0, 1, length($0) - 7) }' \\
      | sort -n | head -1 | cut -d' ' -f2 ;;
  *"option_name='home'"*)
    table="$(printf '%s' "$all" | sed -E 's/.*FROM ([A-Za-z0-9_]+) WHERE.*/\\1/')"
    if tables | grep -qx "$table"; then printf '%s\\n' "$TEST_OLD_URL"; else echo "ERROR 1146: Table doesn't exist" >&2; exit 1; fi ;;
  *"compose ps -q db"*) printf '%s\\n' 'db-container-id' ;;
  *inspect*) printf '%s\\n' 'acme_default' ;;
  "run --rm"*) : ;;
  *) printf 'UNEXPECTED %s\\n' "$all" >> "$DOCKER_LOG"; exit 97 ;;
esac
`

/**
 * Imports a dump whose tables carry `prefix`, then runs the real `platform_configure` on a
 * throwaway site. `oldUrl` is what the site's options answer for `home`.
 */
function configure(prefix, { oldUrl = OLD_URL, config = WP_CONFIG, sql = dump(prefix) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wp-rewrite-'))
  const webroot = join(dir, 'webroot')
  const siteDir = join(dir, 'site')
  const bin = join(dir, 'bin')
  mkdirSync(webroot, { recursive: true })
  mkdirSync(join(siteDir, 'work'), { recursive: true })
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(webroot, 'wp-config.php'), config)
  writeFileSync(join(dir, 'dump.sql'), sql)
  const state = join(dir, 'db.state')
  writeFileSync(state, '')
  writeFileSync(join(bin, 'docker'), DOCKER_STUB)
  chmodSync(join(bin, 'docker'), 0o755)

  const log = join(dir, 'docker.log')
  writeFileSync(log, '')

  // FRESH=0 and no QUICKSTART: the clone road, the only one that rewrites an address.
  const harness = `
set -euo pipefail
HERE=${JSON.stringify(PROVISION)}
SITE_DIR=${JSON.stringify(siteDir)}
LABEL=copy-of-acme
SITE_URL=${JSON.stringify(SITE_URL)}
DB_USER=tracy
DB_PASSWORD=stack-secret
DB_NAME=wordpress
FRESH=0
tracy_web_image() { printf '%s\\n' "$2"; }
tracy_webroot_dir() { printf '%s\\n' ${JSON.stringify(webroot)}; }
# provision.sh sources the shared .htaccess helpers before any platform script.
. "$HERE/../lib/webroot-htaccess.sh"
. "$HERE/platform/wordpress.sh"
# provision.sh step 4, the import, verbatim but for gunzip.
cat ${JSON.stringify(join(dir, 'dump.sql'))} \\
  | ( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" \\
      --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$DB_NAME" )
platform_configure
`
  const run = spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: log,
      DB_STATE: state,
      TEST_OLD_URL: oldUrl
    }
  })

  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(' ')
      assert.equal(parts[0], 'CALL', `stub saw an unexpected docker call: ${line}`)
      return parts.slice(1).map((arg) => Buffer.from(arg, 'base64').toString('utf8'))
    })
  return { run, calls, webroot }
}

// One PHP session for the file (local php, else ONE php container): scripts/test-support/php.mjs.
// No PHP fails on CI and skips with a stated reason on a laptop.
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp()
})
after(() => php?.stop())

/**
 * The table prefix WordPress computes from `configText`, run the way the copy's web container
 * runs it: PHP, with no `WORDPRESS_*` anywhere in its environment. The config travels in the
 * environment and `wp-settings.php` is an empty file PHP writes for itself, so the docker fallback
 * needs no mount (the CI socket belongs to the host, not to the runner's container).
 */
function prefixWordPressComputes(configText) {
  const code = [
    "$d = sys_get_temp_dir() . '/wp-config-' . getmypid() . '/';",
    '@mkdir($d);',
    "file_put_contents($d . 'wp-settings.php', '<?php');",
    "define('ABSPATH', $d);",
    "eval('?>' . getenv('TRACY_WP_CONFIG'));",
    'echo json_encode($table_prefix);'
  ].join(' ')
  const [out] = php.run([{ args: ['-r', code], env: { TRACY_WP_CONFIG: configText } }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}`)
  return JSON.parse(out.stdout)
}

/** The one `docker run` the rewrite makes, split at the image name. */
function rewriteCall(calls) {
  const argv = calls.find((c) => c[0] === 'run' && c.includes('wordpress:cli-php8.3'))
  assert.ok(argv, 'the rewrite never started a wp-cli container')
  const image = argv.indexOf('wordpress:cli-php8.3')
  return { argv, options: argv.slice(0, image), command: argv.slice(image + 1) }
}

for (const prefix of ['tr_', 'wpjf_', 'wp_']) {
  test(`the URL rewrite hands wp-cli the site's own table prefix (${prefix})`, () => {
    const { run, calls } = configure(prefix)
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, /rewriting https:\/\/acme\.example to https:\/\/copy-of-acme\.tracy\.site/)

    // The address was read from THIS site's options table, not a guessed `wp_options`.
    const read = calls.find((c) => c.join(' ').includes('option_name='))
    assert.ok(read, 'the old address was never read')
    assert.match(read.join(' '), new RegExp(`FROM ${prefix}options`))

    const { options, command } = rewriteCall(calls)
    // 🔒 BEFORE the image name: after it, docker passes `-e` to wp-cli as an argument and the
    // container starts with no WORDPRESS_TABLE_PREFIX at all — the #220 failure exactly.
    const at = options.indexOf('-e')
    assert.notEqual(at, -1, 'the wp-cli container was started with no environment at all')
    assert.equal(
      options[at + 1],
      `WORDPRESS_TABLE_PREFIX=${prefix}`,
      `the wp-cli container did not receive WORDPRESS_TABLE_PREFIX=${prefix}`
    )
    // The prefix is the one the helper resolved, not a constant: `tr_` is what a fleet-born site
    // uses, and a patch that spells it out would pass that case and fail a customer's own.
    assert.equal(options.filter((o) => o.startsWith('WORDPRESS_TABLE_PREFIX=')).length, 1)

    // And the rewrite itself is still the rewrite.
    assert.deepEqual(command, [
      'wp',
      'search-replace',
      OLD_URL,
      SITE_URL,
      '--all-tables',
      '--skip-columns=guid',
      '--report-changed-only'
    ])
  })
}

test('the prefix is resolved once, by the helper, and never spelled into the rewrite', () => {
  const source = readFileSync(join(PROVISION, 'platform/wordpress.sh'), 'utf8')
  assert.equal(spawnSync('bash', ['-n', join(PROVISION, 'platform/wordpress.sh')]).status, 0)
  const configure = source.slice(
    source.indexOf('platform_configure() {'),
    source.indexOf('platform_install_access() {')
  )
  // One lookup in the function, reused by both the options read and the wp-cli container.
  assert.equal(configure.match(/tracy_wp_table_prefix "/g)?.length, 1)
  assert.match(configure, /-e WORDPRESS_TABLE_PREFIX="\$prefix"/)
  // All four callers (configure, access, quickstart, import) go through the helper; nobody
  // re-derives a prefix from the config file.
  assert.equal(source.match(/tracy_wp_table_prefix "/g)?.length, 4)
})

// #264: every branch of platform_configure — rewrite, "already there", and "could not read" — must
// leave a wp-config that computes the imported database's prefix with no WORDPRESS_* env.
const CASES = [
  ['the rewrite runs', OLD_URL],
  ['the address is already the copy', SITE_URL],
  ['the old address cannot be read', '']
]
for (const prefix of ['tr_', 'wpjf_', 'wp_']) {
  for (const [branch, oldUrl] of CASES) {
    test(`an imported ${prefix} database reaches the copy's wp-config as ${prefix} (${branch})`, {
      skip: PHP_SKIP
    }, () => {
      const { run, webroot } = configure(prefix, { oldUrl })
      assert.equal(run.status, 0, run.stderr)
      const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
      // What the copy's web container actually computes: the imported tables' prefix, not `wp_`.
      assert.equal(prefixWordPressComputes(rendered), prefix)
      // Stated as a literal, and only the live assignment — the commented-out one is untouched.
      assert.match(rendered, new RegExp(`^\\$table_prefix = '${prefix}';$`, 'm'))
      assert.match(rendered, /^\/\/ \$table_prefix = 'old_';$/m)
      // Nothing about the rest of the file was the prefix's business.
      assert.match(rendered, /define\( 'AUTH_KEY', 'k3y;with\$odd=chars' \);/)
      assert.match(rendered, /define\( 'WP_CACHE', true \); \/\/ a plugin's constant/)
      assert.match(rendered, /define\( 'DB_NAME', 'wordpress' \);/)
    })
  }
}

test('a hand-written prefix that already matches the database is left byte-identical', {
  skip: PHP_SKIP
}, () => {
  const config = WP_CONFIG.replace(
    "$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');",
    '$table_prefix  =  "tr_" ;'
  )
  const { run, webroot } = configure('tr_', { config })
  assert.equal(run.status, 0, run.stderr)
  const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
  assert.match(rendered, /^\$table_prefix {2}= {2}"tr_" ;$/m)
  assert.equal(prefixWordPressComputes(rendered), 'tr_')
})

// The official image's own line, split the way a formatter or a host's panel may leave it.
const MULTILINE_CONFIG = WP_CONFIG.replace(
  "$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');",
  "$table_prefix = getenv_docker(\n\t'WORDPRESS_TABLE_PREFIX',\n\t'wp_'\n);"
)

test('a prefix computed over several lines still reaches the copy as tr_', { skip: PHP_SKIP }, () => {
  const { run, webroot } = configure('tr_', { config: MULTILINE_CONFIG })
  assert.equal(run.status, 0, run.stderr)
  const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
  assert.equal(prefixWordPressComputes(rendered), 'tr_')
  assert.doesNotMatch(rendered, /WORDPRESS_TABLE_PREFIX/)
})

test('an assignment inside a block comment is left as it was', { skip: PHP_SKIP }, () => {
  const config = WP_CONFIG.replace("// $table_prefix = 'old_';", "/*\n$table_prefix = 'old_';\n*/")
  const { run, webroot } = configure('tr_', { config })
  assert.equal(run.status, 0, run.stderr)
  const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
  assert.match(rendered, /^\/\*\n\$table_prefix = 'old_';\n\*\/$/m)
  assert.equal(prefixWordPressComputes(rendered), 'tr_')
})

// A database that names no options table is not an answer; `wp_` written into the file in its
// place would make a wrong guess the copy's permanent prefix, behind a green job.
const NO_OPTIONS = 'CREATE TABLE `tr_posts` (ID bigint);\n'

test('no prefix from the database and a computed wp-config: the step FAILS, the file is not guessed', () => {
  const { run, webroot } = configure('tr_', { sql: NO_OPTIONS })
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /cannot state the table prefix/)
  const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
  assert.doesNotMatch(rendered, /^\$table_prefix = 'wp_';$/m)
})

test('no prefix from the database and a hand-written literal: the literal stands, byte for byte', {
  skip: PHP_SKIP
}, () => {
  const config = WP_CONFIG.replace(
    "$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');",
    "$table_prefix = 'tr_';"
  )
  const { run, webroot } = configure('tr_', { config, sql: NO_OPTIONS })
  assert.equal(run.status, 0, run.stderr)
  const rendered = readFileSync(join(webroot, 'wp-config.php'), 'utf8')
  assert.match(rendered, /^\$table_prefix = 'tr_';$/m)
  assert.equal(prefixWordPressComputes(rendered), 'tr_')
})

// The renderer's unit tests live in render-canonical.test.py, and no gate runs a `.test.py`
// (unittest discovery cannot import a dotted, hyphenated file name — it reports "Ran 0 tests").
// Run it from here, and hold it to the number of tests the file declares, so a test that stops
// being collected is red rather than a smaller green.
test('the renderer unit tests (render-canonical.test.py) run, all of them, and pass', () => {
  const file = join(HERE_TEST, 'render-canonical.test.py')
  const declared = readFileSync(file, 'utf8').match(/^ {4}def test_/gm).length
  const out = spawnSync('python3', ['-B', file, '-v'], { encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stderr, new RegExp(`^Ran ${declared} tests? in `, 'm'))
  process.stdout.write(
    out.stderr
      .split('\n')
      .filter((l) => / \.\.\. |^Ran /.test(l))
      .join('\n') + '\n'
  )
})
