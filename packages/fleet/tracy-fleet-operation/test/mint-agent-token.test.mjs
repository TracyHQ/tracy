#!/usr/bin/env node
/**
 * `provision/mint-agent-token.sh` — the second writer of `tracy-agent.token`, for a site that was
 * provisioned before anything collected one. What is asserted here is the part a green run cannot
 * show:
 *
 *   1. the four failures stay FOUR failures. "the database is down", "the component is not
 *      installed", "this host has no such site" and "this is not a Joomla site" reach the caller as
 *      distinct codes — the whole reason the door above can say something a person can act on.
 *   2. the table prefix comes out of the site's own configuration.php. The sites this script exists
 *      for are the OLD ones, which is exactly the population that does not use `tr_`; assuming it
 *      would read as "the component is not installed" on a site where it is installed.
 *   3. a site that already has the file is not touched — no SQL at all, so running this on a whole
 *      host is safe.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/mint-agent-token.test.mjs
 *
 * `docker` is a stub on PATH that answers from environment variables and logs every call and every
 * statement, so the test can say exactly what SQL ran and what never ran.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkStub, warmStub } from './warm-stub.mjs'
import {
  CUSTODY_CASES,
  HOST_FILE_CASES,
  emdashCompose,
  phpCompose,
  placeCompose
} from './token-custody-cases.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/mint-agent-token.sh', import.meta.url))
const LABEL = 'oldsite-com-0871462c'
/** The shape `mint-agent-admin.cjs` prints: `ec_pat_` + base64url(32 bytes). */
const PAT = `ec_pat_${'Zm9vYmFy'.repeat(5)}abcd`

// Answers from FAKE_* and records both the argv and the SQL it was fed on stdin. `mariadb` writes
// its "password on the command line" warning to stderr on the read path on purpose: the script
// folds stderr into stdout, so this is what proves it picks its answer out by marker rather than
// by position.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  "compose ps -q db")
    [ -n "$FAKE_DB_CID" ] && echo "$FAKE_DB_CID"
    exit 0 ;;
  "compose exec -T db mariadb"*)
    sql="$(cat)"
    printf '%s\\n' "$sql" >> "$FAKE_SQL_LOG"
    case "$sql" in
      "SELECT 1;")
        [ "$FAKE_SELECT1" = ok ] || { echo "ERROR 2002 (HY000): Can't connect to server" >&2; exit 1; }
        echo 1 ;;
      UPDATE*)
        [ "$FAKE_ROWS" != fail ] || { echo "ERROR 1146 (42S02): Table doesn't exist" >&2; exit 1; }
        echo "ROWS=$FAKE_ROWS" ;;
      *)
        reads=$(( $(cat "$FAKE_READ_COUNT" 2>/dev/null || echo 0) + 1 ))
        echo "$reads" > "$FAKE_READ_COUNT"
        answer="$FAKE_READ"
        if [ "$reads" -gt 1 ] && [ -n "$FAKE_READ_AGAIN" ]; then answer="$FAKE_READ_AGAIN"; fi
        case "$answer" in
          fail) echo "ERROR 1146 (42S02) at line 1: Table 'joomla.x_extensions' doesn't exist" >&2; exit 1 ;;
          none) : ;;
          *) echo "Using a password on the command line interface can be insecure." >&2
             echo "$answer" ;;
        esac ;;
    esac
    exit 0 ;;
  "inspect -f {{.State.Running}}"*)
    echo "\${FAKE_RUNNING:-true}"
    exit 0 ;;
  "cp "*tracy-mint.cjs)
    [ "$FAKE_CP" != fail ] || exit 1
    exit 0 ;;
  "exec -w /app"*"node tracy-mint.cjs")
    # The minter's own contract: one line on stdout, nothing else. FAKE_PAT=none is the shape of a
    # mint that reached the site and came back empty-handed — and its message goes to STDERR,
    # which is what lets the test prove the door's detail can never carry a PAT.
    if [ "$FAKE_PAT" = none ]; then
      echo "SqliteError: attempt to write a readonly database" >&2
      exit 1
    fi
    echo "TRACY_EMDASH_PAT=$FAKE_PAT"
    exit 0 ;;
esac
exit 0
`

// Written and run once for the whole file; every stack links it (see warm-stub.mjs).
const DOCKER_STUB = warmStub('docker', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })

const CONFIGURATION_PHP = (prefix) => `<?php
class JConfig {
	public $dbtype = 'mysqli';
	public $host = 'db';
	public $user = 'root';
	public $db = 'joomla';
	public $dbprefix = '${prefix}';
	public $mailer = 'none';
}
`

/** A private root + a sites root in one throwaway tree, the way the fleet's own suites do it. */
function stack(
  t,
  { prefix = 'jos19_', webroot = true, siteDir = true, env = true, emdash = false, mount = false } = {}
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mint-agent-token-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))

  const privateRoot = path.join(dir, 'private')
  const sitesRoot = path.join(dir, 'sites')
  mkdirSync(sitesRoot, { recursive: true })
  if (siteDir) {
    mkdirSync(path.join(privateRoot, LABEL), { recursive: true })
    // The compose file decides which custody the site is under, and since 23/09/2026 only the
    // exact file render-compose.sh writes counts (`emdashCompose`): `mount: true` is the #155 site,
    // whose container reads THIS host file through a read-only single-file bind and therefore has
    // no `data/` copy at all; without it an EmDash site is the pre-#155 generator's file.
    writeFileSync(
      path.join(privateRoot, LABEL, 'docker-compose.yml'),
      emdash || mount
        ? emdashCompose(path.join(privateRoot, LABEL), { token: mount ? 'generator' : 'none' })
        : // A Joomla site's compose is never read for custody, but it is what proves the platform
          // beside this pre-06/09 `.env` (no PLATFORM line): the generator's own Joomla form.
          phpCompose(path.join(privateRoot, LABEL), { flavor: 'joomla', sitesRoot })
    )
    if (env) writeFileSync(path.join(privateRoot, LABEL, '.env'), 'HOST_PORT=51770\nDB_PASSWORD=sekret1\n')
  } else {
    mkdirSync(privateRoot, { recursive: true })
  }
  if (webroot) {
    mkdirSync(path.join(sitesRoot, LABEL, '.webroot'), { recursive: true })
    writeFileSync(path.join(sitesRoot, LABEL, '.webroot', 'configuration.php'), CONFIGURATION_PHP(prefix))
  }
  // An EmDash site is known by its SQLite sitting where `/app/data` is bound — `$SITE_DIR/data`,
  // under the PRIVATE root, which is also the directory the container copy has to land in.
  if (emdash) {
    mkdirSync(path.join(privateRoot, LABEL, 'data'), { recursive: true })
    writeFileSync(path.join(privateRoot, LABEL, 'data', 'data.db'), 'SQLite format 3\0')
  }
  return {
    dir,
    privateRoot,
    sitesRoot,
    tokenFile: path.join(privateRoot, LABEL, 'tracy-agent.token'),
    containerTokenFile: path.join(privateRoot, LABEL, 'data', 'tracy-agent.token')
  }
}

/** A site of the shape the generic EmDash provision road left behind: no Joomla webroot, its own
 * SQLite in `data/`. */
const emdashStack = (t, opts = {}) => stack(t, { webroot: false, emdash: true, ...opts })

function mint(s, { label = LABEL, ...fake } = {}) {
  const dockerLog = path.join(s.dir, 'docker.log')
  const sqlLog = path.join(s.dir, 'sql.log')
  const res = spawnSync('bash', [SCRIPT, '--label', label], {
    encoding: 'utf8',
    // A read that blocks (a FIFO token) must fail the test, not hang the suite.
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${s.dir}/bin:${process.env.PATH}`,
      TRACY_PRIVATE_ROOT: s.privateRoot,
      TRACY_SITES_ROOT: s.sitesRoot,
      TRACY_SRV: '',
      FAKE_LOG: dockerLog,
      FAKE_SQL_LOG: sqlLog,
      FAKE_READ_COUNT: path.join(s.dir, 'reads'),
      FAKE_DB_CID: 'cid-db',
      FAKE_SELECT1: 'ok',
      FAKE_READ: 'none',
      FAKE_READ_AGAIN: '',
      FAKE_ROWS: '1',
      FAKE_RUNNING: 'true',
      FAKE_CP: 'ok',
      FAKE_PAT: PAT,
      // The protected token must be root's; this suite runs unprivileged, so it names its own uid
      // exactly as tracy-host names 0 (`mintAgentToken`).
      TRACY_TOKEN_OWNER_UID: String(process.getuid()),
      ...fake
    }
  })
  return {
    ...res,
    calls: existsSync(dockerLog) ? readFileSync(dockerLog, 'utf8').trim().split('\n') : [],
    sql: existsSync(sqlLog) ? readFileSync(sqlLog, 'utf8') : ''
  }
}

/** The token as `TRACY_RESULT token=` printed it, or '' when the script printed no result. */
const printed = (r) => (r.stdout.match(/^TRACY_RESULT token=(\S*)$/m) ?? ['', ''])[1]
const errorCode = (r) => (r.stderr.match(/^TRACY_ERROR (\S+)$/m) ?? ['', ''])[1]

test('a site that already has the file: prints it and runs no SQL at all', (t) => {
  const s = stack(t)
  writeFileSync(s.tokenFile, 'aaaabbbbccccdddd1111\n')
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), 'aaaabbbbccccdddd1111')
  assert.deepEqual(r.calls, [], 'docker was called for a site that already had its token')
})

test('an empty token file is a write that did not finish, and is minted over', (t) => {
  const s = stack(t)
  writeFileSync(s.tokenFile, '\n')
  const r = mint(s, { FAKE_READ: 'TOKEN=0011223344556677aabb' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), '0011223344556677aabb')
  assert.equal(readFileSync(s.tokenFile, 'utf8'), '0011223344556677aabb\n')
})

test('the token already in the component params is adopted, not replaced', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_READ: 'TOKEN=1234567890abcdef1234' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), '1234567890abcdef1234')
  assert.equal(readFileSync(s.tokenFile, 'utf8'), '1234567890abcdef1234\n')
  assert.equal(statSync(s.tokenFile).mode & 0o777, 0o600)
  assert.ok(!/UPDATE/.test(r.sql), 'a site that already held a token was written to anyway')
})

test('an empty params token is minted, written 0600, and the UPDATE names the real prefix', (t) => {
  const s = stack(t, { prefix: 'jos19_' })
  const r = mint(s, { FAKE_READ: 'TOKEN=' })
  assert.equal(r.status, 0, r.stderr)
  const token = printed(r)
  assert.match(token, /^[0-9a-f]{40}$/, 'a minted token is 20 random bytes in hex')
  assert.equal(readFileSync(s.tokenFile, 'utf8'), `${token}\n`)
  assert.equal(statSync(s.tokenFile).mode & 0o777, 0o600)
  assert.match(r.sql, /UPDATE `jos19_extensions`/)
  assert.ok(r.sql.includes(token), 'the UPDATE wrote a different value than the file names')
  assert.ok(!r.sql.includes('tr_extensions'), 'the prefix was assumed instead of read')
  // The race guard: only a row whose token is still empty may take this one.
  assert.match(r.sql, /WHERE element='com_claudecowork' AND .+ = '';/)
})

test('another mint won the race: the token the database actually holds is adopted', (t) => {
  const s = stack(t)
  const r = mint(s, {
    FAKE_READ: 'TOKEN=',
    FAKE_ROWS: '0',
    FAKE_READ_AGAIN: 'TOKEN=fedcba9876543210fedc'
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), 'fedcba9876543210fedc')
  assert.equal(readFileSync(s.tokenFile, 'utf8'), 'fedcba9876543210fedc\n')
})

test('the prefix is read from the site’s own configuration.php', (t) => {
  const s = stack(t, { prefix: 'weird_9_' })
  const r = mint(s, { FAKE_READ: 'TOKEN=' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.sql, /FROM `weird_9_extensions`/)
  assert.match(r.sql, /UPDATE `weird_9_extensions`/)
})

test('a label that is not a plain fleet label is refused before any path is built', (t) => {
  const s = stack(t)
  for (const label of ['../../etc/passwd', 'a/b', '-dash', 'has space']) {
    const r = mint(s, { label })
    assert.equal(r.status, 2, `${label} was not refused`)
    assert.equal(errorCode(r), 'BAD_LABEL')
    assert.deepEqual(r.calls, [])
  }
})

test('no site directory on this host: SITE_UNKNOWN, not a database error', (t) => {
  const s = stack(t, { siteDir: false })
  const r = mint(s)
  assert.equal(r.status, 3)
  assert.equal(errorCode(r), 'SITE_UNKNOWN')
  assert.deepEqual(r.calls, [])
})

test('no DB_PASSWORD in the stack’s .env: SITE_UNKNOWN, because nothing here can authenticate', (t) => {
  const s = stack(t, { env: false })
  const r = mint(s)
  assert.equal(r.status, 3)
  assert.equal(errorCode(r), 'SITE_UNKNOWN')
})

test('no configuration.php: NOT_JOOMLA — a WordPress site lands here rather than on a guess', (t) => {
  const s = stack(t, { webroot: false })
  const r = mint(s)
  assert.equal(r.status, 4)
  assert.equal(errorCode(r), 'NOT_JOOMLA')
  assert.deepEqual(r.calls, [])
})

test('the stack is not running: SITE_DOWN', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_DB_CID: '' })
  assert.equal(r.status, 5)
  assert.equal(errorCode(r), 'SITE_DOWN')
  assert.ok(!/mariadb/.test(r.calls.join('\n')), 'the client ran against a stack that is down')
})

test('the database refuses the read and refuses SELECT 1 too: SITE_DOWN', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_READ: 'fail', FAKE_SELECT1: 'down' })
  assert.equal(r.status, 5)
  assert.equal(errorCode(r), 'SITE_DOWN')
})

test('the database answers but the extensions table does not: COMPONENT_NOT_INSTALLED', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_READ: 'fail', FAKE_SELECT1: 'ok' })
  assert.equal(r.status, 6)
  assert.equal(errorCode(r), 'COMPONENT_NOT_INSTALLED')
})

test('no com_claudecowork row: COMPONENT_NOT_INSTALLED, and no file is written', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_READ: 'none' })
  assert.equal(r.status, 6)
  assert.equal(errorCode(r), 'COMPONENT_NOT_INSTALLED')
  assert.equal(existsSync(s.tokenFile), false)
})

test('an UPDATE that matched no row is COMPONENT_NOT_INSTALLED, and writes no token file', (t) => {
  const s = stack(t)
  const r = mint(s, { FAKE_READ: 'TOKEN=', FAKE_ROWS: '0' })
  assert.equal(r.status, 6)
  assert.equal(errorCode(r), 'COMPONENT_NOT_INSTALLED')
  assert.equal(existsSync(s.tokenFile), false, 'a token file names a token nothing holds')
})

// ── EmDash ──────────────────────────────────────────────────────────────────────────────────
// The population this road exists for is every site the generic EmDash provision built before
// 19/09/2026: the host copy present, `/app/data/tracy-agent.token` absent, pairing green and the
// agent blind. The first test below is that exact site.

// 🔒 FAIL CLOSED (Hano, 23/09/2026): a compose file that declares no mount while the protected
// host token file exists is a DISAGREEMENT between host-side evidence, not a legacy site. The most
// likely story is a protected site whose compose lost its mount entry while the web container kept
// running with the bind — and the legacy repair there revokes the credential the container reads,
// replaces the inode it holds and writes the readable data/ copy back. Before this date these
// states were re-minted (`demoemdash1`); now every one of them is TOKEN_CUSTODY_UNKNOWN.
for (const [name, inSite] of [
  ['the host holds a token the container copy lacks', null],
  ['both copies agree', PAT],
  ['the two copies disagree', 'ec_pat_staleFromARestoredDatabase']
]) {
  test(`🔒 EmDash, no mount declared, ${name}: TOKEN_CUSTODY_UNKNOWN — nothing minted or written`, (t) => {
    const s = emdashStack(t)
    writeFileSync(s.tokenFile, 'ec_pat_hostCopy\n')
    if (inSite) writeFileSync(s.containerTokenFile, `${inSite}\n`)
    const before = statSync(s.tokenFile).ino
    const r = mint(s)
    assert.equal(r.status, 8, r.stderr)
    assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
    assert.equal(printed(r), '')
    assert.deepEqual(r.calls, [], 'the legacy repair ran while a protected host token file exists')
    assert.equal(statSync(s.tokenFile).ino, before)
    assert.equal(readFileSync(s.tokenFile, 'utf8'), 'ec_pat_hostCopy\n')
    if (inSite) assert.equal(readFileSync(s.containerTokenFile, 'utf8'), `${inSite}\n`)
    else
      assert.equal(existsSync(s.containerTokenFile), false, 'the agent-readable data/ copy was written back')
    assert.doesNotMatch(r.stderr, /ec_pat_/)
  })
}

// The minter is copied into /app as root; it is removed whatever the mint did (24/10/2026).
const MINT_RM = /^exec -u 0 oldsite-com-0871462c-web-1 rm -f \/app\/tracy-mint\.cjs$/m

test('EmDash: no token anywhere — minted inside the container, written 0600 in both places', (t) => {
  const s = emdashStack(t)
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
  assert.equal(statSync(s.tokenFile).mode & 0o777, 0o600)
  assert.equal(statSync(s.containerTokenFile).mode & 0o777, 0o600)
  const calls = r.calls.join('\n')
  assert.match(calls, /^cp .*mint-agent-admin\.cjs .*-web-1:\/app\/tracy-mint\.cjs$/m)
  assert.match(calls, /^exec -w \/app oldsite-com-0871462c-web-1 node tracy-mint\.cjs$/m)
  assert.match(calls, MINT_RM, 'the minter is left in the site tree')
})

test('EmDash: the web container is not running — SITE_DOWN, and nothing is copied into it', (t) => {
  const s = emdashStack(t)
  const r = mint(s, { FAKE_RUNNING: 'false' })
  assert.equal(r.status, 5)
  assert.equal(errorCode(r), 'SITE_DOWN')
  assert.ok(!/^cp /m.test(r.calls.join('\n')), 'the minter was copied into a container that is down')
  assert.equal(existsSync(s.containerTokenFile), false)
})

test('EmDash: the site came back without a PAT — EMDASH_MINT_REFUSED, and no file is written', (t) => {
  const s = emdashStack(t)
  const r = mint(s, { FAKE_PAT: 'none' })
  assert.equal(r.status, 7)
  assert.equal(errorCode(r), 'EMDASH_MINT_REFUSED')
  assert.equal(existsSync(s.tokenFile), false, 'a token file names a token nothing holds')
  assert.equal(existsSync(s.containerTokenFile), false)
  assert.match(r.calls.join('\n'), MINT_RM, 'a failed mint leaves the minter in the site tree')
})

test('EmDash: a failed mint reports the site’s own stderr, and no PAT can ride out on it', (t) => {
  const s = emdashStack(t)
  const r = mint(s, { FAKE_PAT: 'none' })
  assert.match(r.stderr, /attempt to write a readonly database/)
  // 🔒 The door turns the `!! …` line into `detail` and hands it to a caller that may log it.
  // stdout carries the raw PAT; stderr must never.
  assert.ok(!r.stderr.includes('ec_pat_'), 'a PAT reached the channel that becomes `detail`')
})

// ── the PROTECTED mount (#155): one file, written in place, and no `data/` copy ────────────────
//
// Where the site's compose binds `./tracy-agent.token:/run/tracy-agent.token:ro`, the container
// reads the HOST file itself and provision deletes the `data/` copy on purpose — it lives in an
// agent-writable volume. Both of this script's legacy writes are wrong there: the copy hands the
// agent's own www-data shell a readable PAT back, and `mv` gives the file a NEW INODE the running
// container cannot see (Docker resolved the bind at create time), so the script would report
// success while every `tracy_emdash` call keeps presenting the old value.

test('protected mount: the host file alone is "already minted" — no re-mint, no data/ copy', (t) => {
  const s = emdashStack(t, { mount: true })
  writeFileSync(s.tokenFile, `${PAT}\n`, { mode: 0o600 })
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
  assert.deepEqual(r.calls, [], 'a site under the protected mount was re-minted, revoking a live PAT')
  assert.equal(existsSync(s.containerTokenFile), false, 'the agent-readable copy was written back')
})

test('protected mount: a mint writes THROUGH the existing inode, and never the data/ copy', (t) => {
  const s = emdashStack(t, { mount: true })
  // An empty file is what `platform/emdash.sh` creates before compose up, so this is exactly the
  // state a site is in when its mount exists and the mint has yet to land.
  writeFileSync(s.tokenFile, '\n', { mode: 0o600 })
  const before = statSync(s.tokenFile).ino
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
  assert.equal(readFileSync(s.tokenFile, 'utf8'), `${PAT}\n`)
  assert.equal(
    statSync(s.tokenFile).ino,
    before,
    'the token file was REPLACED — the running container holds the old inode and would never see this'
  )
  assert.equal(statSync(s.tokenFile).mode & 0o777, 0o600)
  assert.equal(existsSync(s.containerTokenFile), false, 'a readable PAT copy was put back under data/')
})

test('protected mount: a leftover data/ copy is not a disagreement to repair', (t) => {
  const s = emdashStack(t, { mount: true })
  // A site migrated onto the mount can still have the old copy lying beside it. The container does
  // not read it any more, so it is not evidence about custody — and treating it as a disagreement
  // is a re-mint that revokes the credential the mounted reader is actually presenting.
  writeFileSync(s.tokenFile, `${PAT}\n`, { mode: 0o600 })
  writeFileSync(s.containerTokenFile, 'ec_pat_leftoverFromBeforeTheMigration\n')
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
  assert.deepEqual(r.calls, [], 'a leftover copy was read as custody and cost the site its live PAT')
  assert.equal(readFileSync(s.containerTokenFile, 'utf8'), 'ec_pat_leftoverFromBeforeTheMigration\n')
})

// ── the LONG-form bind, and a mount nobody can prove (Astra review, 22/09/2026) ───────────────
//
// Compose accepts the protected bind as a mapping too, and a short-form regex once read it as
// legacy, so the script's legacy repair ran on a mounted site. Since 23/09/2026 (exact forms) the
// fleet's own spellings are the only ones proven: a hand-written long form is refused, and the
// migration's spelling (`token: 'first'`) is the other protected form.

const siteDirOf = (s) => path.join(s.privateRoot, LABEL)
const LONG_FORM = (s) =>
  emdashCompose(siteDirOf(s), { token: 'generator' }).replace(
    '      - ./tracy-agent.token:/run/tracy-agent.token:ro\n',
    '      - type: bind\n        source: ./tracy-agent.token\n        target: /run/tracy-agent.token\n        read_only: true\n'
  )
const MIGRATED = (s) => emdashCompose(siteDirOf(s), { token: 'first' })

// ── a protected bind whose host file is GONE (Astra review, 23/09/2026) ─────────────────────
//
// The running container still reads the inode it was created with, deleted or not. A mint here
// creates a NEW file the container never sees and, being revoke-then-insert, revokes the
// credential the mounted reader is still presenting: exit 0 on this side, NO_TOKEN on the agent's.

for (const [name, compose] of [
  ['generator form', null],
  ['migrated form', MIGRATED]
]) {
  test(`🔒 protected mount (${name}), host token DELETED: TOKEN_CUSTODY_UNKNOWN — nothing minted or written`, (t) => {
    const s = emdashStack(t, { mount: true })
    if (compose) writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), compose(s))
    const r = mint(s)
    assert.equal(r.status, 8, r.stderr)
    assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
    assert.equal(printed(r), '', 'a token was reported for a mount the container cannot see')
    assert.deepEqual(r.calls, [], 'the container was asked to mint — that revokes the PAT it still reads')
    assert.equal(existsSync(s.tokenFile), false, 'a new token file (a new inode) was created')
    assert.equal(existsSync(s.containerTokenFile), false, 'the agent-readable data/ copy was put back')
    assert.doesNotMatch(r.stdout + r.stderr, /ec_pat_/)
  })
}

test('legacy EmDash site (no mount), host token absent: still minted — only the protected bind refuses', (t) => {
  const s = emdashStack(t)
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
})

// ── custody that cannot be PROVEN from the host (Hano, 23/09/2026) ─────────────────────────
//
// The helper FAILS CLOSED: whenever the host side cannot prove which custody the site is under it
// exits 8 before any mint, revoke, write or container call. No runtime mount check is made here —
// what the running container actually mounts is `emdash/migrate-token-mount.mjs`'s question.

/** Everything a refused run must leave exactly as it found it. */
function assertUntouched(s, r, { host = null } = {}) {
  assert.equal(r.status, 8, r.stderr)
  assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
  assert.equal(printed(r), '')
  assert.deepEqual(r.calls, [], 'the container was asked to mint on custody nobody could prove')
  if (host === null) assert.equal(existsSync(s.tokenFile), false, 'a host token file was created')
  else {
    assert.equal(statSync(s.tokenFile).ino, host.ino, 'the host token inode was replaced')
    assert.equal(readFileSync(s.tokenFile, 'utf8'), host.bytes)
  }
  assert.equal(existsSync(s.containerTokenFile), false, 'the agent-readable data/ copy was written')
  assert.doesNotMatch(r.stdout + r.stderr, /ec_pat_/)
}

const holdToken = (s) => {
  writeFileSync(s.tokenFile, `${PAT}\n`, { mode: 0o600 })
  return { ino: statSync(s.tokenFile).ino, bytes: `${PAT}\n` }
}

test('🔒 a protected site whose compose LOST the mount entry, host token present: UNKNOWN, no mint', (t) => {
  const s = emdashStack(t, { mount: true })
  const host = holdToken(s)
  // The container created from the old compose still holds the bind; only the file changed.
  writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), emdashCompose(siteDirOf(s)))
  assertUntouched(s, mint(s), { host })
})

test('🔒 a protected site whose compose lost the mount, host token EMPTY: UNKNOWN, not a first mint', (t) => {
  const s = emdashStack(t, { mount: true })
  writeFileSync(s.tokenFile, '\n', { mode: 0o600 })
  const host = { ino: statSync(s.tokenFile).ino, bytes: '\n' }
  writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), emdashCompose(siteDirOf(s)))
  assertUntouched(s, mint(s), { host })
})

test('🔒 no mount declared and the host token path is a dangling symlink: UNKNOWN, no mint', (t) => {
  const s = emdashStack(t)
  symlinkSync(path.join(s.dir, 'nowhere'), s.tokenFile)
  const r = mint(s)
  assert.equal(r.status, 8, r.stderr)
  assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
  assert.deepEqual(r.calls, [])
  assert.equal(existsSync(path.join(s.dir, 'nowhere')), false, 'a write followed the link')
  assert.equal(existsSync(s.containerTokenFile), false)
})

// 🔒 A PROTECTED HOST TOKEN MUST BE ONE REGULAR FILE (Astra review, 23/09/2026). `held_token`
// follows links, so a tracy-agent.token symlinked to data/tracy-agent.token passed as "already
// minted" with the PAT in the directory the site's own shell reads. The door refuses the same shapes.
for (const [name, place] of [
  ['a symlink to the legacy data/ copy', (s) => symlinkSync(s.containerTokenFile, s.tokenFile)],
  ['a relative symlink to the legacy data/ copy', (s) => symlinkSync('data/tracy-agent.token', s.tokenFile)],
  ['a dangling symlink', (s) => symlinkSync(path.join(s.dir, 'nowhere'), s.tokenFile)],
  ['a hard link to the legacy data/ copy', (s) => linkSync(s.containerTokenFile, s.tokenFile)],
  ['a directory', (s) => mkdirSync(s.tokenFile)]
]) {
  test(`🔒 protected mount, host token is ${name}: TOKEN_CUSTODY_UNKNOWN — nothing read, minted or written`, (t) => {
    const s = emdashStack(t, { mount: true })
    writeFileSync(s.containerTokenFile, `${PAT}\n`)
    place(s)
    const before = lstatSync(s.tokenFile)
    const r = mint(s)
    assert.equal(r.status, 8, r.stderr)
    assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
    assert.equal(printed(r), '', 'the PAT behind a link was reported as protected custody')
    assert.deepEqual(r.calls, [])
    const after = lstatSync(s.tokenFile)
    assert.equal(after.ino, before.ino, 'the host token path was replaced')
    assert.equal(after.isSymbolicLink(), before.isSymbolicLink())
    assert.equal(readFileSync(s.containerTokenFile, 'utf8'), `${PAT}\n`)
    assert.equal(existsSync(path.join(s.dir, 'nowhere')), false, 'a write followed the link')
    assert.doesNotMatch(r.stdout + r.stderr, /ec_pat_/)
  })
}

// 🔒 A PROTECTED HOST TOKEN MUST BE ROOT'S, MODE 0600 (Astra review, 23/09/2026). The read-only bind
// hands the container the file's own owner and mode, so a 0644 token — or one owned by anyone but
// root — is readable by the site's www-data shell. The helper used to check only one-regular-file
// and printed it as already minted. The owner case names a uid that is not this process's, which is
// exactly what a non-root owner looks like to the helper running as root.
for (const [name, bytes, mode, owner] of [
  ['mode 0644', `${PAT}\n`, 0o644, null],
  ['mode 0640', `${PAT}\n`, 0o640, null],
  ['mode 0400', `${PAT}\n`, 0o400, null],
  ['EMPTY and mode 0644', '\n', 0o644, null],
  ['owned by someone other than root', `${PAT}\n`, 0o600, String(process.getuid() + 1)]
]) {
  test(`🔒 protected mount, host token ${name}: TOKEN_CUSTODY_UNKNOWN — nothing printed, minted or written`, (t) => {
    const s = emdashStack(t, { mount: true })
    writeFileSync(s.tokenFile, bytes, { mode: 0o600 })
    chmodSync(s.tokenFile, mode)
    const before = statSync(s.tokenFile)
    const r = mint(s, owner === null ? {} : { TRACY_TOKEN_OWNER_UID: owner })
    assert.equal(r.status, 8, r.stderr)
    assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
    assert.equal(printed(r), '', 'a token with unprovable custody was reported as minted')
    assert.deepEqual(r.calls, [], 'the container was asked to mint')
    const after = statSync(s.tokenFile)
    assert.equal(after.ino, before.ino, 'the host token inode was replaced')
    assert.equal(after.mode, before.mode, 'the refused token file had its mode changed')
    assert.equal(readFileSync(s.tokenFile, 'utf8'), bytes)
    assert.equal(existsSync(s.containerTokenFile), false, 'the agent-readable data/ copy was written')
    assert.doesNotMatch(r.stdout + r.stderr, /ec_pat_/)
  })
}

for (const host of [false, true]) {
  const which = host ? 'host token present' : 'no host token'
  test(`🔒 compose file MISSING (${which}): UNKNOWN before anything is written`, (t) => {
    const s = emdashStack(t)
    unlinkSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'))
    const held = host ? holdToken(s) : null
    assertUntouched(s, mint(s), { host: held })
  })

  test(`🔒 compose file UNREADABLE — a directory in its place (${which}): UNKNOWN`, (t) => {
    const s = emdashStack(t)
    const compose = path.join(s.privateRoot, LABEL, 'docker-compose.yml')
    unlinkSync(compose)
    mkdirSync(compose)
    const held = host ? holdToken(s) : null
    assertUntouched(s, mint(s), { host: held })
  })

  test(`🔒 compose file EMPTY (${which}): UNKNOWN`, (t) => {
    const s = emdashStack(t)
    writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), '')
    const held = host ? holdToken(s) : null
    assertUntouched(s, mint(s), { host: held })
  })
}

test('genuine pre-#155 site — readable compose, no mount, no host token: the legacy mint still writes both copies', (t) => {
  const s = emdashStack(t)
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(printed(r), PAT)
  assert.equal(readFileSync(s.tokenFile, 'utf8'), `${PAT}\n`)
  assert.equal(readFileSync(s.containerTokenFile, 'utf8'), `${PAT}\n`)
  assert.match(r.calls.join('\n'), /^exec -w \/app oldsite-com-0871462c-web-1 node tracy-mint\.cjs$/m)
})

test('🔒 a hand-written long-form bind is not a fleet form: TOKEN_CUSTODY_UNKNOWN, same inode, no data/ copy', (t) => {
  const s = emdashStack(t)
  writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), LONG_FORM(s))
  const host = holdToken(s)
  assertUntouched(s, mint(s), { host })
})

test('migrated protected bind: a mint writes THROUGH the existing inode', (t) => {
  const s = emdashStack(t)
  writeFileSync(path.join(s.privateRoot, LABEL, 'docker-compose.yml'), MIGRATED(s))
  writeFileSync(s.tokenFile, '\n', { mode: 0o600 })
  const before = statSync(s.tokenFile).ino
  const r = mint(s)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(s.tokenFile, 'utf8'), `${PAT}\n`)
  assert.equal(statSync(s.tokenFile).ino, before)
  assert.equal(existsSync(s.containerTokenFile), false)
})

// Wiring of the classifier's answer to the helper's action. The helper's `token_mount_custody` is
// held to EVERY row of the shared table (`token-custody-cases.mjs`) by the door's suite
// (apps/tracy-host/test/webroot.test.mjs, "classify every compose shape"), which extracts the real
// awk and asks it; here one representative per answer is enough — the action depends only on the
// answer (unknown -> exit 8 before any write, protected -> no re-mint, none -> legacy mint).
// Unknown and none run with AND without a host token: with one, the host-file rule alone would
// refuse and could hide a classifier that wrongly answered `none`.
const sample = (rows, names) => names.map((n) => rows.find(([name]) => name === n) ?? assert.fail(n))

for (const [name, compose] of sample(CUSTODY_CASES.unknown, [
  'services: invalid, then an indented web block',
  'the token bind quoted',
  'CRLF line endings'
])) {
  for (const host of [true, false]) {
    test(`🔒 ${name} (${host ? 'host token present' : 'no host token'}): TOKEN_CUSTODY_UNKNOWN — refused before any write`, (t) => {
      const s = emdashStack(t)
      const siteDir = path.join(s.privateRoot, LABEL)
      writeFileSync(path.join(siteDir, 'docker-compose.yml'), compose(siteDir))
      const held = host ? holdToken(s) : null
      assertUntouched(s, mint(s), { host: held })
    })
  }
}

for (const [name, compose] of sample(CUSTODY_CASES.protected, [
  'the generator, with its comments (render-compose.sh today)',
  'migrated: first volumes item (the generator comment follows `volumes:`)'
])) {
  test(`protected custody (${name}): already minted — no re-mint, same inode, no data/ copy`, (t) => {
    const s = emdashStack(t)
    const siteDir = path.join(s.privateRoot, LABEL)
    writeFileSync(path.join(siteDir, 'docker-compose.yml'), compose(siteDir))
    writeFileSync(s.tokenFile, `${PAT}\n`, { mode: 0o600 })
    const before = statSync(s.tokenFile).ino
    const r = mint(s)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(printed(r), PAT)
    assert.deepEqual(r.calls, [])
    assert.equal(statSync(s.tokenFile).ino, before)
    assert.equal(existsSync(s.containerTokenFile), false)
  })
}

for (const [name, compose] of sample(CUSTODY_CASES.none, [
  'the pre-#155 generator, with its comments',
  'the pre-#155 generator with a commented-out token bind'
])) {
  test(`pre-#155 form (${name}), no host token: the legacy mint writes both copies`, (t) => {
    const s = emdashStack(t)
    writeFileSync(path.join(siteDirOf(s), 'docker-compose.yml'), compose(siteDirOf(s)))
    const r = mint(s)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(printed(r), PAT)
    assert.equal(readFileSync(s.tokenFile, 'utf8'), `${PAT}\n`)
    assert.equal(readFileSync(s.containerTokenFile, 'utf8'), `${PAT}\n`)
  })
  test(`🔒 pre-#155 form (${name}), host token present: TOKEN_CUSTODY_UNKNOWN`, (t) => {
    const s = emdashStack(t)
    writeFileSync(path.join(siteDirOf(s), 'docker-compose.yml'), compose(siteDirOf(s)))
    const host = holdToken(s)
    assertUntouched(s, mint(s), { host })
  })
}

// The host-file half of the shared table (`HOST_FILE_CASES`), the same rows the door is held to.
const EXIT_OF = { protected: 0, mint: 0, unknown: 8 }
for (const row of HOST_FILE_CASES) {
  test(`🔒 ${row.name} → ${row.expect}`, (t) => {
    const s = emdashStack(t)
    rmSync(path.join(siteDirOf(s), 'docker-compose.yml'), { force: true })
    placeCompose(siteDirOf(s), row)
    if (row.host === 'file') writeFileSync(s.tokenFile, `${PAT}\n`, { mode: 0o600 })
    if (row.host === 'symlink') {
      writeFileSync(s.containerTokenFile, `${PAT}\n`)
      symlinkSync(s.containerTokenFile, s.tokenFile)
    }
    if (row.host === 'dangling') symlinkSync(path.join(s.dir, 'nowhere'), s.tokenFile)
    const before = row.host === 'absent' ? null : lstatSync(s.tokenFile)
    const r = mint(s)
    assert.equal(r.status, EXIT_OF[row.expect], r.stderr)
    if (row.expect === 'mint') {
      assert.equal(printed(r), PAT)
      assert.equal(readFileSync(s.containerTokenFile, 'utf8'), `${PAT}\n`)
      return
    }
    assert.deepEqual(r.calls, [], 'the container was asked to mint where custody said it must not')
    if (row.expect === 'protected') assert.equal(printed(r), PAT)
    else {
      assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
      assert.equal(printed(r), '')
    }
    if (before) {
      const after = lstatSync(s.tokenFile)
      assert.equal(after.ino, before.ino, 'the host token path was replaced')
      assert.equal(after.isSymbolicLink(), before.isSymbolicLink())
    } else assert.equal(existsSync(s.tokenFile), false, 'a host token file was created')
    if (row.host !== 'symlink')
      assert.equal(existsSync(s.containerTokenFile), false, 'the data/ copy was written')
    assert.equal(existsSync(path.join(s.dir, 'nowhere')), false, 'a write followed the link')
  })
}

// 🔒 AN EMDASH SITE WHOSE DATABASE IS MISSING IS STILL EMDASH (Astra review, 23/09/2026). Before,
// `data/data.db` alone decided, so such a site fell to PLATFORM=unknown, skipped the custody block
// and printed the host token as "already minted" — through a wrong compose, or hanging on a FIFO.
for (const [name, arrange] of [
  [
    'data/ without data.db, a hand-edited compose, a regular host token',
    (s, d) => {
      mkdirSync(path.join(d, 'data'))
      writeFileSync(path.join(d, 'docker-compose.yml'), 'services:\n  web:\n    image: x\n')
      return holdToken(s)
    }
  ],
  [
    'data/ without data.db, the pre-#155 compose, a regular host token',
    (s, d) => {
      mkdirSync(path.join(d, 'data'))
      writeFileSync(path.join(d, 'docker-compose.yml'), emdashCompose(d))
      return holdToken(s)
    }
  ],
  [
    'data/ without data.db, a hand-edited compose, the host token a FIFO',
    (s, d) => {
      mkdirSync(path.join(d, 'data'))
      writeFileSync(path.join(d, 'docker-compose.yml'), 'services:\n  web:\n    image: x\n')
      execFileSync('mkfifo', [s.tokenFile])
      return 'fifo'
    }
  ],
  [
    'a Joomla webroot beside a .env that is a FIFO, a regular host token',
    (s, d) => {
      rmSync(path.join(d, '.env'))
      execFileSync('mkfifo', [path.join(d, '.env')])
      return holdToken(s)
    }
  ],
  // 🔒 NO MARK IS NOT PROOF OF JOOMLA (Astra review, 23/09/2026): the `other` road needs `.env`
  // naming PLATFORM=joomla|wordpress or a /var/www/html webroot bind, even beside a Joomla webroot.
  [
    'no EmDash mark and no Joomla proof (compose `services: {}`), a regular host token',
    (s, d) => {
      writeFileSync(path.join(d, 'docker-compose.yml'), 'services: {}\n')
      return holdToken(s)
    }
  ],
  [
    'no EmDash mark and no Joomla proof (compose `services: {}`), the host token a FIFO',
    (s, d) => {
      writeFileSync(path.join(d, 'docker-compose.yml'), 'services: {}\n')
      execFileSync('mkfifo', [s.tokenFile])
      return 'fifo'
    }
  ],
  [
    'a proven Joomla site (webroot bind in compose), the host token a FIFO',
    (s) => {
      execFileSync('mkfifo', [s.tokenFile])
      return 'fifo'
    }
  ]
]) {
  test(`🔒 ${name}: TOKEN_CUSTODY_UNKNOWN, nothing printed, read or written`, (t) => {
    const s = stack(t, { webroot: name.includes('Joomla') })
    const host = arrange(s, siteDirOf(s))
    const r = mint(s)
    assert.equal(r.error, undefined, 'the script did not finish (a blocking read?)')
    if (host === 'fifo') {
      assert.equal(r.status, 8, r.stderr)
      assert.equal(errorCode(r), 'TOKEN_CUSTODY_UNKNOWN')
      assert.equal(printed(r), '')
      assert.deepEqual(r.calls, [])
      assert.equal(lstatSync(s.tokenFile).isFIFO(), true)
      assert.equal(existsSync(s.containerTokenFile), false)
    } else assertUntouched(s, r, { host })
  })
}

test('neither Joomla nor EmDash: still NOT_JOOMLA, and the message names both shapes', (t) => {
  const s = stack(t, { webroot: false })
  const r = mint(s)
  assert.equal(r.status, 4)
  assert.equal(errorCode(r), 'NOT_JOOMLA')
  assert.match(r.stderr, /EmDash/, 'the refusal still reads as if Joomla were the only road')
})
