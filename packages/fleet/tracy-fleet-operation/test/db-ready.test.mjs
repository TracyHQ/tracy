#!/usr/bin/env node
/**
 * A site's MariaDB is ready only once it is the server that STAYS UP — `provision.sh` step 4 and
 * `restore.sh` step 5 pour a dump into it right after the wait (L13).
 *
 * Measured 05/10/2026 on the local stand: 1 of ~40 WordPress site creations stopped at "importing
 * database" with `ERROR 2002 (HY000): Can't connect to local server through socket
 * '/run/mysqld/mysqld.sock' (2)`, right after "starting database" had passed its `SELECT 1`. The
 * official image's first boot runs a TEMPORARY server (`--skip-networking`, socket only, `port: 0`),
 * creates the database and the root password in it, stops it, then starts the real one:
 * `docker logs <site>-db-1` shows "Creating database wordpress" and "Stopping temporary server" in the
 * same second. A `SELECT 1` that lands on the temporary server answers, and the import after it lands
 * in the gap.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/db-ready.test.mjs
 *
 * `docker` is a fake on PATH whose `db` service plays a first boot: each connection meets the next
 * phase listed in `boot` (refuse · denied · temp-nodb · temp), then the real server (`up`) for good.
 * `sleep` is a stub that only counts. The database blocks of the two scripts are lifted out and run as
 * they are, so the test exercises the scripts' own waits, not a copy of them.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const PROVISION = fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url))
const RESTORE = fileURLToPath(new URL('../scripts/provision/restore.sh', import.meta.url))
const DUMP = 'CREATE TABLE wp_options (option_name varchar(191));\nINSERT INTO wp_options VALUES (1);\n'
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const FAKE_DOCKER = `#!/usr/bin/env bash
S="$FAKE_DOCKER_STATE"
[ "$1" = compose ] || { echo "unexpected docker $*" >&2; exit 2; }
case "$2" in
  up|start|stop) printf 'compose %s\\n' "$*" >> "$S/calls"; exit 0 ;;
  exec) ;;
  *) echo "unexpected docker compose $2" >&2; exit 2 ;;
esac
shift 2
[ "$1" = -T ] && shift
[ "$1" = db ] || { echo "unexpected service $1" >&2; exit 2; }
shift
[ "$1" = mariadb ] || { echo "unexpected client $1" >&2; exit 2; }
shift
query=""; database=""
while [ $# -gt 0 ]; do
  case "$1" in
    -e) query="$2"; shift 2; continue ;;
    -*) ;;
    *) database="$1" ;;
  esac
  shift
done
# The server this connection meets: the head of \`boot\`, then the real one for good.
phase=up
if [ -s "$S/boot" ]; then
  phase="$(sed -n 1p "$S/boot")"
  sed 1d "$S/boot" > "$S/boot.tmp"; mv "$S/boot.tmp" "$S/boot"
fi
printf '%s|%s\\n' "$phase" "\${query:-<import>}" >> "$S/calls"
case "$phase" in
  refuse) echo "ERROR 2002 (HY000): Can't connect to local server through socket '/run/mysqld/mysqld.sock' (2)" >&2; exit 1 ;;
  denied) echo "ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)" >&2; exit 1 ;;
  temp-nodb)
    [ -z "$database" ] || { echo "ERROR 1049 (42000): Unknown database '$database'" >&2; exit 1; }
    skip=1 ;;
  temp) skip=1 ;;
  up) skip=0 ;;
  *) echo "fake-docker: unknown phase $phase" >&2; exit 2 ;;
esac
if [ -z "$query" ]; then cat > "$S/imported"; echo "$phase" > "$S/imported-on"; exit 0; fi
case "$query" in
  *@@skip_networking*)
    # Spelled the way mariadb:11 (11.8) spells it, measured 05/10/2026: 0/1 on its own or in numeric
    # context (\`+ 0\`), but OFF/ON as a bare CONCAT argument.
    value="$skip"
    case "$query" in *"CONCAT("*"@@skip_networking)"*) if [ "$skip" = 1 ]; then value=ON; else value=OFF; fi ;; esac
    marker="$(printf '%s\\n' "$query" | sed -n "s/.*CONCAT('\\\\([^']*\\\\)',.*/\\\\1/p")"
    printf '%s%s\\n' "$marker" "$value" ;;
  "SELECT 1") echo 1 ;;
esac
exit 0
`

/** A scratch host: the fake docker and sleep on PATH, a site directory, the dump. */
function stand(boot) {
  const root = mkdtempSync(path.join(tmpdir(), 'db-ready-'))
  temps.push(root)
  const state = path.join(root, 'state')
  const bin = path.join(root, 'bin')
  const siteDir = path.join(root, 'private', 'site')
  const work = path.join(root, 'work')
  for (const dir of [state, bin, siteDir, work]) mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\necho "$*" >> "$FAKE_DOCKER_STATE/sleeps"\n', {
    mode: 0o755
  })
  writeFileSync(path.join(state, 'boot'), boot.map((p) => `${p}\n`).join(''))
  writeFileSync(path.join(state, 'calls'), '')
  writeFileSync(path.join(work, 'db.sql.gz'), gzipSync(DUMP))
  return { root, state, bin, siteDir, work }
}

/** `from` up to and including `to`, out of the script; asserted small so a drifted anchor goes red. */
function lift(file, from, to) {
  const src = readFileSync(file, 'utf8')
  const start = src.indexOf(from)
  assert.ok(start !== -1, `${path.basename(file)} no longer contains: ${from}`)
  const end = src.indexOf(to, start)
  assert.ok(end !== -1, `${path.basename(file)} has no ${to} after ${from}`)
  const block = src.slice(start, end + to.length)
  assert.ok(block.length < 4000, `the database block is ${block.length} characters — an anchor drifted`)
  return block
}

function runBlock(s, prelude, block) {
  const run = spawnSync('bash', ['-c', `set -euo pipefail\n${prelude}\n${block}\n`], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PATH: `${s.bin}:${process.env.PATH}`, FAKE_DOCKER_STATE: s.state }
  })
  assert.equal(run.error, undefined, `the block did not finish: ${run.error}`)
  return run
}

/** provision.sh from "starting database" to the end of step 4, as a WordPress quickstart runs it. */
function provision(boot) {
  const s = stand(boot)
  const block = lift(
    PROVISION,
    'if [ "$PLATFORM_NEEDS_DB" = 1 ]; then\nstage "starting database"',
    'fi # PLATFORM_NEEDS_DB'
  )
  const prelude = [
    `HERE=${JSON.stringify(path.dirname(PROVISION))}`,
    `SITE_DIR=${JSON.stringify(s.siteDir)}`,
    'DB_PASSWORD=pw0123456789; DB_NAME=wordpress; DB_KEY=quickstart:database; QUICKSTART=""; PLATFORM_NEEDS_DB=1',
    'stage() { echo "==> $*"; }',
    `fetch() { mkdir -p "$(dirname "$2")"; cp ${JSON.stringify(path.join(s.work, 'db.sql.gz'))} "$2"; }`
  ].join('\n')
  return { s, run: runBlock(s, prelude, `${block}\necho "DB_IMPORTED=\${DB_IMPORTED:-}"`) }
}

/** restore.sh step 5, the database replaced whole — with lib/db-ready.sh loaded, as step 1 leaves it. */
function restore(boot) {
  const s = stand(boot)
  const block = lift(
    RESTORE,
    'echo "==> replacing database"',
    '--init-command="SET FOREIGN_KEY_CHECKS=0" "$DB_NAME" )'
  )
  const prelude = [
    `HERE=${JSON.stringify(path.dirname(RESTORE))}`,
    `SITE_DIR=${JSON.stringify(s.siteDir)}`,
    `WORK=${JSON.stringify(s.work)}`,
    'DB_PASSWORD=pw0123456789; DB_NAME=joomla',
    '. "$HERE/../lib/db-ready.sh"'
  ].join('\n')
  return { s, run: runBlock(s, prelude, block) }
}

const calls = (s) => readFileSync(path.join(s.state, 'calls'), 'utf8').split('\n').filter(Boolean)
const imports = (s) => calls(s).filter((c) => c.endsWith('|<import>'))
const left = (s) => readFileSync(path.join(s.state, 'boot'), 'utf8').split('\n').filter(Boolean).length

/** The dump went in once, whole, on the real server. */
function assertImportedOnTheRealServer(s, run) {
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.deepEqual(imports(s), ['up|<import>'], calls(s).join('\n'))
  assert.equal(readFileSync(path.join(s.state, 'imported-on'), 'utf8').trim(), 'up')
  assert.equal(readFileSync(path.join(s.state, 'imported'), 'utf8'), DUMP)
}

/** Stopped with a reason, bounded, and nothing poured into the database. */
function assertStoppedBeforeImport(s, run, reason) {
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stderr, /database never became ready/)
  assert.match(run.stderr, reason)
  assert.deepEqual(imports(s), [], 'no import was attempted')
  assert.equal(existsSync(path.join(s.state, 'imported')), false)
  assert.ok(left(s) > 0, 'the wait is bounded: it gave up before the fake ran out of refusals')
}

test('provision: the import never lands in the gap between the first boot temporary server and the real one', () => {
  // The measured order: no server yet, the temporary one before and after it created the database,
  // the gap while it stops, then the real server.
  const { s, run } = provision(['refuse', 'temp-nodb', 'temp', 'refuse'])
  assertImportedOnTheRealServer(s, run)
  assert.match(run.stdout, /==> starting database\n[^]*==> importing database/)
  assert.match(run.stdout, /DB_IMPORTED=1/)
})

test('provision: a database that refuses its first connections is waited for, then imported into', () => {
  const { s, run } = provision(Array(6).fill('refuse'))
  assertImportedOnTheRealServer(s, run)
  assert.ok(readFileSync(path.join(s.state, 'sleeps'), 'utf8').split('\n').filter(Boolean).length >= 6)
})

test('provision: a database that never answers stops the run with the last refusal, before any import', () => {
  const { s, run } = provision(Array(120).fill('refuse'))
  assertStoppedBeforeImport(s, run, /Can't connect to local server through socket/)
})

test('provision: a server that stays the temporary one is never taken for ready', () => {
  const { s, run } = provision(Array(120).fill('temp'))
  assertStoppedBeforeImport(s, run, /temporary/)
})

test('provision: a password the volume does not know is named as the reason', () => {
  const { s, run } = provision(Array(120).fill('denied'))
  assertStoppedBeforeImport(s, run, /Access denied for user 'root'/)
})

test('restore: the database is dropped and the dump poured in only on the server that stays up', () => {
  // migrate-site-from-host.sh runs `compose up -d db` on a new host, so restore.sh meets a first boot too.
  const { s, run } = restore(['refuse', 'temp-nodb', 'temp', 'refuse'])
  assertImportedOnTheRealServer(s, run)
  const drop = calls(s).find((c) => c.includes('DROP DATABASE'))
  assert.equal(drop?.split('|')[0], 'up', calls(s).join('\n'))
})

test('restore: a database that never answers stops before DROP DATABASE', () => {
  const { s, run } = restore(Array(120).fill('refuse'))
  assertStoppedBeforeImport(s, run, /Can't connect to local server through socket/)
  assert.ok(!calls(s).some((c) => c.includes('DROP DATABASE')), calls(s).join('\n'))
})

/**
 * All of restore.sh, from the top: the snapshot fetched by an `aws` stub, a live webroot that says
 * `live`, a snapshot webroot that says `restored`. The image check is off (no registry here).
 */
function restoreWhole(boot) {
  const s = stand(boot)
  const sites = path.join(s.root, 'sites')
  const webroot = path.join(sites, 'site', '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(path.join(webroot, 'index.php'), 'live\n')
  writeFileSync(path.join(s.siteDir, '.env'), 'DB_PASSWORD=pw0123456789\nHOST_PORT=52001\n')
  const snapshot = path.join(s.root, 'snapshot')
  const packed = path.join(s.root, 'packed')
  mkdirSync(snapshot)
  mkdirSync(packed)
  writeFileSync(path.join(snapshot, 'meta.json'), JSON.stringify({ web_image: 'joomla:5-apache' }))
  writeFileSync(path.join(snapshot, 'db.sql.gz'), gzipSync(DUMP))
  writeFileSync(path.join(packed, 'index.php'), 'restored\n')
  assert.equal(spawnSync('tar', ['-cf', path.join(snapshot, 'webroot.tar'), '-C', packed, '.']).status, 0)
  // `aws s3 cp --endpoint-url E s3://<bucket>/<key> <dest> --only-show-errors`
  writeFileSync(path.join(s.bin, 'aws'), '#!/bin/sh\ncp "$FAKE_SNAPSHOT/$(basename "$5")" "$6"\n', {
    mode: 0o755
  })
  const run = spawnSync(
    'bash',
    [RESTORE, '--label', 'site', '--tag', 'before-upgrade', '--root', path.dirname(s.siteDir)],
    {
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${s.bin}:${process.env.PATH}`,
        FAKE_DOCKER_STATE: s.state,
        FAKE_SNAPSHOT: snapshot,
        TRACY_SITES_ROOT: sites,
        TRACY_PRIVATE_ROOT: path.dirname(s.siteDir),
        TRACY_WEB_IMAGE_CHECK: '0',
        TRACY_MIGRATE_S3_BUCKET: 'b',
        TRACY_MIGRATE_S3_ENDPOINT: 'http://s3.test',
        TRACY_MIGRATE_S3_ACCESS_KEY: 'k',
        TRACY_MIGRATE_S3_SECRET_KEY: 's'
      }
    }
  )
  assert.equal(run.error, undefined, `restore did not finish: ${run.error}`)
  return { s, run, webroot }
}

test('restore: a database that never comes up stops the restore before the site is touched', () => {
  const { s, run, webroot } = restoreWhole(Array(120).fill('refuse'))
  assertStoppedBeforeImport(s, run, /Can't connect to local server through socket/)
  const log = calls(s)
  assert.ok(!log.some((c) => c.startsWith('compose stop')), `the site kept serving: ${log.join('\n')}`)
  assert.equal(readFileSync(path.join(webroot, 'index.php'), 'utf8'), 'live\n', 'the webroot is the live one')
  for (const aside of ['.restoring', '.previous'])
    assert.equal(existsSync(`${webroot}${aside}`), false, `no ${aside} beside the webroot`)
  assert.ok(!log.some((c) => c.includes('DROP DATABASE')))
})
