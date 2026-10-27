/**
 * An IMPORTED site gets `content.identity` the way a quickstart does — decision 3 of the raised items
 * in `tasks/todo-comment-to-edit.md` (27/09/2026). Without it the Content API of an imported copy
 * answers 501 CONTENT_ADAPTER_UNSUPPORTED "Content identity is not set up on this site yet", so the
 * element picker sends `locate: null` and the agent has no native ids.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/import-content-identity.test.mjs
 *
 * The REAL platform files are sourced (`platform/wordpress.sh`, `platform/joomla.sh`) with the clone
 * road's environment (no --fresh, no quickstart); only the commands that leave the process — wp-cli,
 * curl, docker — are shell functions that record what they were asked and answer what the scenario
 * says. What is asserted is the stage's contract:
 *
 *   - it runs on an import (the clone road defined no `platform_post_up` before);
 *   - it never runs where the Claude Cowork plugin is missing, inactive or has no token;
 *   - the WordPress call is the quickstart's own (`newSite` + a request id the label keeps, which the
 *     plugin replays instead of rotating the seed twice), with the token read from the copy;
 *   - Joomla asks for a new seed only on a pass that imported a fresh database;
 *   - a refusal is said, and never fails the import: the copy is usable without the Content API.
 *
 * Since 30/09/2026 the same harness drives the OTHER roads (`runPostUp` with the road's FRESH /
 * QUICKSTART / BUILD_WORKFLOW): every WordPress site and every blank or unsealed Joomla site gets its
 * content identity at provision too, not at tracy-host's next start (bottom half of this file).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))

/**
 * Source one platform file on the import road, replace the outside world, run `platform_post_up`.
 * @param {'wordpress'|'joomla'} platform
 * @param {{env?: Record<string,string>, marker?: boolean}} opts
 */
function runImportPostUp(platform, opts = {}) {
  return runPostUp(platform, opts)
}

/**
 * Source one platform file on the road `road` selects (the variables provision.sh sets before it
 * sources the file: FRESH, QUICKSTART, BUILD_WORKFLOW), replace the outside world, run
 * `platform_post_up`. The default road is the import (no --fresh, no quickstart).
 * @param {'wordpress'|'joomla'} platform
 * @param {{env?: Record<string,string>, marker?: boolean, road?: {FRESH?: string, QUICKSTART?: string,
 *   BUILD_WORKFLOW?: string}, token?: boolean}} opts
 */
function runPostUp(platform, { env = {}, marker = false, road = {}, token = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'import-identity-'))
  const site = path.join(root, 'site')
  mkdirSync(path.join(site, 'webroot'), { recursive: true })
  // What the core copy / restore leaves in the webroot: the roads that wait for it find it at once.
  writeFileSync(path.join(site, 'webroot', 'wp-config.php'), '<?php\n')
  writeFileSync(path.join(site, 'webroot', 'configuration.php'), '<?php\n')
  // A token already collected (a retried pass): Joomla's template road verifies instead of pairing.
  writeFileSync(path.join(site, '.env'), 'DB_PASSWORD=pw\nWP_ADMIN_PASSWORD=pw\n')
  if (token) writeFileSync(path.join(site, 'tracy-agent.token'), `${'b'.repeat(64)}\n`)
  const log = path.join(root, 'calls.log')
  if (marker) spawnSync('touch', [path.join(site, 'content-identity.done')])
  const roadVars = { FRESH: '0', QUICKSTART: '', ...road }
  const stubs = String.raw`
tracy_web_image() { printf '%s\n' "$2"; }
tracy_webroot_dir() { printf '%s\n' "$SITE_DIR/webroot"; }
. "$HERE/platform/${platform}.sh"
# After the source: these replace the file's own definitions of the calls that leave the process.
tracy_web_dns_name() { printf '%s\n' "$1-web-1"; }
tracy_wp_table_prefix() { printf '%s\n' "${'${STUB_PREFIX:-tr_}'}"; }
tracy_wp() {
  printf 'wp prefix=%s %s\n' "${'${WP_TABLE_PREFIX:-}'}" "$1" >> "$CALLS"
  case "$1" in
    *"plugin is-active claude-cowork"*) return "${'${STUB_ACTIVE_RC:-0}'}" ;;
    *"option get claude_cowork_token"*) printf '%s\n' "${'${STUB_TOKEN:-}'}"; return 0 ;;
    *) return 0 ;;
  esac
}
tracy_wp_acym_keys() { return 0; }
tracy_ensure_webroot_htaccess() { return 0; }
tracy_wp_bind_contract() { printf 'bind %s\n' "$1" >> "$CALLS"; return 0; }
# quickstart.py answers from the scenario; every other python3 (the answers' parsers) is the real one.
python3() {
  case "${'${1:-}'}" in
    */quickstart.py) ;;
    *) command python3 "$@"; return ;;
  esac
  shift
  printf 'quickstart %s\n' "$*" >> "$CALLS"
  local field="" part="" out=""
  while [ $# -gt 0 ]; do
    case "$1" in --field) field="$2"; shift ;; --part) part="$2"; shift ;; --out) out="$2"; shift ;; esac
    shift
  done
  # The real exit protocol of --field: a key the entry lacks exits 4 with 'quickstart has no <field>',
  # a key that is present but not a non-empty string exits 1. Callers tell the two apart.
  case "$field" in
    contract)
      if [ "${'${STUB_QS_CONTRACT_INVALID:-0}'}" = 1 ]; then
        echo 'quickstart contract is not a non-empty string' >&2; return 1
      fi
      [ -n "${'${STUB_QS_CONTRACT:-}'}" ] && printf '%s\n' "$STUB_QS_CONTRACT" && return 0
      echo 'quickstart has no contract' >&2; return 4 ;;
    coworkMinVersion) printf '%s\n' "${'${STUB_QS_MIN:-0.14.0}'}"; return 0 ;;
    cowork.version) printf '%s\n' "${'${STUB_QS_COWORK_VERSION:-0.14.0}'}"; return 0 ;;
    cowork.file) echo 'quickstart has no cowork.file' >&2; return 4 ;;
  esac
  if [ "$part" = cowork ]; then
    [ "${'${STUB_QS_PINNED:-0}'}" = 1 ] || return 1
    printf 'zip' > "$out"; return 0
  fi
  return 1
}
curl() {
  local a body="" url=""
  for a in "$@"; do case "$a" in \{*) body="$a" ;; http*) url="$a" ;; esac; done
  # the reachability probe (-sf -o /dev/null) answers; the POST is logged and answered by the scenario
  [ -z "$body" ] && return 0
  printf 'curl %s %s\n' "$url" "$body" >> "$CALLS"
  # The Nth POST of the run answers STUB_ANSWER_<N> when the scenario names one, else STUB_ANSWER.
  # Counted in a file: each call runs in its own command substitution.
  local n answer
  n=$(( $(cat "$CALLS.posts" 2>/dev/null || echo 0) + 1 ))
  printf '%s' "$n" > "$CALLS.posts"
  answer="STUB_ANSWER_$n"
  printf '%s' "${'${!answer-${STUB_ANSWER:-}}'}"
}
docker() {
  local script tag=''
  script="$(cat)"
  # Which provision script went down stdin: several execs share the same argv (\`compose exec -T web php\`).
  [ "$script" = "$(cat "$HERE/joomla-content-identity.php")" ] && tag=' <identity>'
  printf 'docker %s%s\n' "$*" "$tag" >> "$CALLS"
  # joomla-content-derive.php names itself on a marker line; it answers with its own outcome line.
  case "$script" in *'// tracy: content-derive'*)
    printf 'TRACY_RESULT derived=%s\n' "${'${STUB_DERIVE-bound entities=9 slots=41 calibrated=1}'}"
    return "${'${STUB_DOCKER_RC:-0}'}" ;;
  esac
  # What joomla-content-identity.php prints on its last line: the outcome, for a machine. It is the
  # only thing that says whether the registry went in, and since 28/09 the marker is written on it.
  # A bare dash, not a colon-dash: STUB_READER set to NOTHING is a script that named no outcome.
  case "$*" in *mariadb*) printf '%s\n' "${'${STUB_JOOMLA_TOKEN:-}'}"; return 0 ;; esac
  case "$*" in *' php'*) printf 'TRACY_RESULT content_reader=%s\n' "${'${STUB_READER-enabled}'}" ;; esac
  return "${'${STUB_DOCKER_RC:-0}'}"
}
if declare -F platform_post_up > /dev/null; then
  if platform_post_up; then echo "POSTUP_RC=0"; else echo "POSTUP_RC=$?"; fi
else
  echo "POSTUP_UNDEFINED"
fi
`
  const script = `set -uo pipefail
${Object.entries(roadVars)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join('\n')}
LABEL=northwind-import-example-e1b80210
SITE_DIR=${JSON.stringify(site)}
HERE=${JSON.stringify(PROVISION.replace(/\/$/, ''))}
HOST_PORT=18480
DB_PASSWORD=pw
DB_NAME=site
SITE_URL=http://northwind.localhost:8080
CALLS=${JSON.stringify(log)}
${stubs}`
  const res = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_SITES_ROOT: root, ...env }
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
  const out = {
    stdout: String(res.stdout ?? ''),
    stderr: String(res.stderr ?? ''),
    calls,
    tokenFile: existsSync(path.join(site, 'tracy-agent.token')),
    marker: existsSync(path.join(site, 'content-identity.done'))
  }
  rmSync(root, { recursive: true, force: true })
  const m = out.stdout.match(/POSTUP_RC=(\d+)/)
  return { ...out, undefined: out.stdout.includes('POSTUP_UNDEFINED'), rc: m ? Number(m[1]) : null }
}

/** The `docker compose exec` of joomla-content-identity.php — not the derive, install or pairing. */
function identityExecs(run) {
  return run.calls.filter((c) => c.startsWith('docker compose exec') && c.endsWith(' <identity>'))
}

const ENABLED = JSON.stringify({
  ok: true,
  identity: { site: true, rotated: true, replayed: false, minted: 12, repaired: 0, total: 12 },
  alias: { path: '/content.json', available: true, collision: null }
})

// ── WordPress ───────────────────────────────────────────────────────────────────────────────

test('wordpress import: the copy is opted in through its own plugin, with the quickstart call', () => {
  const r = runImportPostUp('wordpress', {
    env: { STUB_TOKEN: 'a'.repeat(48), STUB_ANSWER: ENABLED, STUB_PREFIX: 'nw_' }
  })
  assert.equal(r.undefined, false, 'the import road runs a post-up stage')
  assert.equal(r.rc, 0, r.stderr)
  // wp-cli is told the copy's own table prefix — an import keeps the customer's, never `tr_`.
  assert.ok(
    r.calls.some((c) => c.startsWith('wp prefix=nw_ ') && c.includes('plugin is-active claude-cowork')),
    r.calls.join('\n')
  )
  // Two POSTs on an import since 29/09: identity, then derive (tests below).
  const post = r.calls.filter((c) => c.startsWith('curl '))
  assert.equal(post.length, 2, r.calls.join('\n'))
  assert.match(
    post[0],
    /^curl http:\/\/northwind-import-example-e1b80210-web-1\/wp-admin\/admin-ajax\.php\?action=claude_cowork /
  )
  const body = JSON.parse(post[0].slice(post[0].indexOf('{')))
  assert.deepEqual(body, {
    token: 'a'.repeat(48),
    action: 'content.identity',
    params: { newSite: true, requestId: 'provision-northwind-import-example-e1b80210' }
  })
  // One result line per run, naming the road.
  assert.match(r.stdout, /content reader: enabled \(12 rows, new seed, 12 minted, alias \/content\.json\)/)
  assert.match(r.stdout, /import/)
  // The token stays where the import put it (site_component); provision writes no custody file here.
  assert.equal(r.tokenFile, false)
})

test('wordpress import: a second pass over the same database says the plugin replayed it', () => {
  const replayed = JSON.stringify({
    ok: true,
    identity: { site: false, rotated: false, replayed: true, minted: 0, repaired: 0, total: 12 },
    alias: { path: '/content.json', available: true, collision: null }
  })
  const r = runImportPostUp('wordpress', { env: { STUB_TOKEN: 'a'.repeat(48), STUB_ANSWER: replayed } })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(r.stdout, /content reader: enabled \(12 rows, seed kept \(request replayed\), 0 minted,/)
})

test('wordpress import: no active Claude Cowork plugin — nothing is called, and it says so', () => {
  const r = runImportPostUp('wordpress', { env: { STUB_ACTIVE_RC: '1', STUB_TOKEN: 'a'.repeat(48) } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.calls.filter((c) => c.startsWith('curl ')).length, 0)
  assert.equal(
    r.calls.some((c) => c.includes('option get claude_cowork_token')),
    false
  )
  assert.match(r.stdout + r.stderr, /no active Claude Cowork plugin/)
})

test('wordpress import: a plugin with no token — nothing is called, and it says so', () => {
  const r = runImportPostUp('wordpress', { env: { STUB_TOKEN: '' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.calls.filter((c) => c.startsWith('curl ')).length, 0)
  assert.match(r.stdout + r.stderr, /no token/)
})

test('wordpress import: a refusal is said and never fails the import', () => {
  const r = runImportPostUp('wordpress', {
    env: {
      STUB_TOKEN: 'a'.repeat(48),
      STUB_ANSWER: JSON.stringify({
        ok: false,
        error: 'failed',
        message: 'Content identity could not be set up'
      })
    }
  })
  assert.equal(r.rc, 0, 'the copy is handed over without the Content API rather than not at all')
  assert.match(r.stderr, /content reader could not be enabled: Content identity could not be set up/)
  assert.match(r.stderr, /Content API/)
})

test('wordpress import: a plugin that predates the reader is skipped, not an error', () => {
  const r = runImportPostUp('wordpress', {
    env: { STUB_TOKEN: 'a'.repeat(48), STUB_ANSWER: JSON.stringify({ ok: false, message: 'unknown action' }) }
  })
  assert.equal(r.rc, 0)
  assert.match(r.stdout, /has none — skipped/)
})

/**
 * DERIVE (29/09/2026, tasks/todo-import-site-contract.md): after identity, the import binds the copy to
 * a contract derived from its own rows (`content.contract` operation `derive`), so the Edit picker
 * resolves to a slot. A plugin that cannot derive (older than the operation) is said and skipped: the
 * copy works without it, the picker only resolves by text.
 */
test('wordpress import: derive runs after identity, with the label as request id', () => {
  const r = runImportPostUp('wordpress', {
    env: {
      STUB_TOKEN: 'a'.repeat(48),
      STUB_ANSWER_1: ENABLED,
      STUB_ANSWER_2: JSON.stringify({
        ok: true,
        contract: 'derived/northwind-import-example-e1b80210',
        entities: 9,
        slots: 41,
        calibrated: true,
        byClass: { db: 30, nested: 11, unmatched: 4 },
        unresolved: [],
        replayed: false
      })
    }
  })
  assert.equal(r.rc, 0, r.stderr)
  const posts = r.calls.filter((c) => c.startsWith('curl '))
  assert.equal(posts.length, 2, r.calls.join('\n'))
  assert.equal(JSON.parse(posts[0].slice(posts[0].indexOf('{'))).action, 'content.identity')
  assert.match(
    posts[1],
    /^curl http:\/\/northwind-import-example-e1b80210-web-1\/wp-admin\/admin-ajax\.php\?action=claude_cowork /
  )
  const derive = JSON.parse(posts[1].slice(posts[1].indexOf('{')))
  assert.deepEqual(derive, {
    token: 'a'.repeat(48),
    action: 'content.contract',
    params: {
      operation: 'derive',
      label: 'northwind-import-example-e1b80210',
      requestId: 'provision-northwind-import-example-e1b80210'
    }
  })
  assert.match(r.stdout, /derived contract: 9 entities, 41 slots, calibrated/)
  assert.doesNotMatch(r.stderr, /not bound/)
})

test('wordpress import: a plugin that cannot derive is said and never fails the import', () => {
  const refusals = [
    { ok: false, error: 'bad_action', message: 'unknown action: content.contract' },
    { ok: false, error: 'bad_params', message: 'unknown contract operation: derive' },
    {
      ok: false,
      error: 'conflict',
      message: 'This site is bound to a quickstart contract; derive refuses to replace it'
    }
  ]
  for (const refusal of refusals) {
    const r = runImportPostUp('wordpress', {
      env: { STUB_TOKEN: 'a'.repeat(48), STUB_ANSWER_1: ENABLED, STUB_ANSWER_2: JSON.stringify(refusal) }
    })
    assert.equal(r.rc, 0, refusal.error)
    assert.match(r.stderr, /derived contract: not bound/, refusal.error)
    // identity still went in: derive is a second door, not a condition of the first
    assert.match(r.stdout, /content reader: enabled/, refusal.error)
  }
  // No JSON at all (a PHP fatal page) is the same: said, not fatal.
  const garbled = runImportPostUp('wordpress', {
    env: { STUB_TOKEN: 'a'.repeat(48), STUB_ANSWER_1: ENABLED, STUB_ANSWER_2: '<html>fatal</html>' }
  })
  assert.equal(garbled.rc, 0)
  assert.match(garbled.stderr, /derived contract: not bound/)
})

/**
 * 🔒 EVERY WORDPRESS SITE GETS ITS CONTENT IDENTITY AT PROVISION, WHICHEVER ROAD BUILT IT (30/09/2026).
 * Until then only the sealed quickstart with a pinned plugin and the import called `content.identity`;
 * a blank site, a template card with no contract (`tracy-business/wp7` 1.3.0) and a sealed quickstart
 * pinning no plugin did not, so every `content.locate` on them answered "Content identity is not set
 * up" until tracy-host restarted (`apps/tracy-host/src/content-identity.js`) — measured on `e3sw0330`.
 * The call is `tracy_wp_install_doors`' last step now: said, marked on success, never fatal there.
 */
/** @param {{calls: string[]}} run */
function identityPosts(run) {
  return run.calls.filter((c) => c.startsWith('curl ') && c.includes('"action":"content.identity"'))
}

/** @param {string} post */
function postBody(post) {
  return JSON.parse(post.slice(post.indexOf('{')))
}

const WP_TOKEN = 'c'.repeat(48)

test('🔒 wordpress template with no contract: the site is opted in and marked', () => {
  const r = runPostUp('wordpress', {
    road: { QUICKSTART: 'tracy-business/wp7', BUILD_WORKFLOW: 'template' },
    env: { STUB_TOKEN: WP_TOKEN, STUB_ANSWER: ENABLED }
  })
  assert.equal(r.rc, 0, r.stderr)
  const posts = identityPosts(r)
  assert.equal(posts.length, 1, r.calls.join('\n'))
  assert.deepEqual(postBody(posts[0]), {
    token: WP_TOKEN,
    action: 'content.identity',
    params: { newSite: true, requestId: 'provision-northwind-import-example-e1b80210' }
  })
  assert.match(r.stdout, /content reader: enabled/)
  assert.equal(r.marker, true)
  assert.match(r.stdout, /template, no content contract/)
})

test('🔒 wordpress blank site (--fresh): the site is opted in and marked', () => {
  const r = runPostUp('wordpress', {
    road: { FRESH: '1' },
    env: { STUB_TOKEN: WP_TOKEN, STUB_ANSWER: ENABLED }
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(identityPosts(r).length, 1, r.calls.join('\n'))
  assert.equal(r.marker, true)
})

test('🔒 wordpress sealed quickstart that pins no plugin: the site is opted in too', () => {
  const r = runPostUp('wordpress', {
    road: { QUICKSTART: 'tracy-base/wp7', BUILD_WORKFLOW: 'contract' },
    env: {
      CONTRACT_ID: 'tracy-base/wp7/1.0.0',
      COWORK_MIN_VERSION: '0.14.0',
      STUB_TOKEN: WP_TOKEN,
      STUB_ANSWER: ENABLED
    }
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(identityPosts(r).length, 1, r.calls.join('\n'))
  assert.equal(r.marker, true)
  // Since 04/10/2026 this road binds through the latest plugin, and the reader follows the bind.
  const bind = r.calls.findIndex((c) => c.startsWith('bind '))
  const identity = r.calls.findIndex((c) => c.includes('"action":"content.identity"'))
  assert.ok(bind >= 0 && bind < identity, r.calls.join('\n'))
})

test('wordpress sealed quickstart with a pinned plugin: identity once, AFTER the bind, and a refusal still stops it', () => {
  const road = { QUICKSTART: 'tracy-base/wp7', BUILD_WORKFLOW: 'contract' }
  const env = {
    CONTRACT_ID: 'tracy-base/wp7/1.0.0',
    COWORK_MIN_VERSION: '0.14.0',
    STUB_QS_PINNED: '1',
    STUB_TOKEN: WP_TOKEN,
    STUB_ANSWER: ENABLED
  }
  const r = runPostUp('wordpress', { road, env })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(identityPosts(r).length, 1, r.calls.join('\n'))
  const bind = r.calls.findIndex((c) => c.startsWith('bind '))
  const identity = r.calls.findIndex((c) => c.includes('"action":"content.identity"'))
  assert.ok(bind >= 0 && bind < identity, r.calls.join('\n'))
  // A sealed site's reader is part of its seal: a refusal there fails the provision, as before.
  const refused = runPostUp('wordpress', {
    road,
    env: {
      ...env,
      STUB_ANSWER: JSON.stringify({ ok: false, message: 'Content identity could not be set up' })
    }
  })
  assert.notEqual(refused.rc, 0)
})

test('wordpress template and blank site: a refusal or a missing token is said and never fails the provision', () => {
  const refusal = JSON.stringify({
    ok: false,
    error: 'failed',
    message: 'Content identity could not be set up'
  })
  for (const road of [{ QUICKSTART: 'tracy-business/wp7', BUILD_WORKFLOW: 'template' }, { FRESH: '1' }]) {
    const refused = runPostUp('wordpress', { road, env: { STUB_TOKEN: WP_TOKEN, STUB_ANSWER: refusal } })
    assert.equal(refused.rc, 0, JSON.stringify(road))
    assert.match(refused.stderr, /content reader could not be enabled/)
    assert.match(refused.stderr, /tracy-host tries again at its next start/)
    assert.equal(refused.marker, false, 'a refused site is left for tracy-host to try again')
    const tokenless = runPostUp('wordpress', { road, env: { STUB_TOKEN: '' } })
    assert.equal(tokenless.rc, 0, JSON.stringify(road))
    assert.equal(identityPosts(tokenless).length, 0)
    assert.match(tokenless.stderr, /no plugin token/)
  }
})

// ── Joomla ──────────────────────────────────────────────────────────────────────────────────

test('joomla import: a pass that imported the database asks for a new seed, and marks it', () => {
  const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '1' }, marker: true })
  assert.equal(r.undefined, false, 'the import road runs a post-up stage')
  assert.equal(r.rc, 0, r.stderr)
  const exec = identityExecs(r)
  assert.equal(exec.length, 1, r.calls.join('\n'))
  // A marker left by an earlier pass describes the database that was just replaced: a fresh import
  // is a new site again, or the copy would keep the seed the customer's archive carried.
  assert.match(exec[0], /-e TRACY_NEW_SITE=1 web php/)
  assert.equal(r.marker, true)
})

/**
 * 🔒 THE MARKER MEANS "IDENTITY IS IN", NOT "THE SCRIPT RAN" (28/09/2026). `joomla-content-identity.php`
 * exits 0 when it SKIPS — a Cowork component with no reader (`none`), one older than the reader
 * (`outdated`), a Joomla the reader does not support (`unsupported`) — so `content-identity.done` was
 * written for a site that got no registry at all. `tracy-host` reads that marker as "already done" and
 * returns before it tries (`content-identity.js`), so once the component was upgraded NOTHING ever
 * installed the registry and `content.read`/`content.locate` answered 501 on that site for good.
 */
test('🔒 joomla import: a skip is said and leaves NO marker, so a later start installs the registry', () => {
  for (const said of ['none', 'outdated', 'unsupported']) {
    const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '1', STUB_READER: said } })
    assert.equal(r.rc, 0, `${said}: a copy without the Content API is still a working copy`)
    assert.equal(r.marker, false, `${said}: not marked`)
    assert.match(r.stderr, new RegExp(`not installed \\(${said}\\)`), said)
  }
  // The script naming no outcome at all is a skip too: nothing proved the registry went in.
  const silent = runImportPostUp('joomla', { env: { DB_IMPORTED: '1', STUB_READER: '' } })
  assert.equal(silent.marker, false)
  assert.match(silent.stderr, /no outcome named/)
  // And `enabled` is the one word that marks it.
  assert.equal(runImportPostUp('joomla', { env: { DB_IMPORTED: '1' } }).marker, true)
})

test('joomla import: a pass over the database already there keeps its seed', () => {
  const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '' }, marker: true })
  assert.equal(r.rc, 0, r.stderr)
  const exec = identityExecs(r)
  assert.equal(exec.length, 1, r.calls.join('\n'))
  assert.doesNotMatch(exec[0], /TRACY_NEW_SITE/)
})

test('joomla import: a refusal is said and never fails the import', () => {
  const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '1', STUB_DOCKER_RC: '1' } })
  assert.equal(r.rc, 0)
  assert.match(r.stderr, /Content API/)
  assert.equal(r.marker, false, 'a pass that failed is not remembered as done')
})

test("joomla import: derive runs after identity, over the copy's own component, with the label", () => {
  const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '1' } })
  assert.equal(r.rc, 0, r.stderr)
  const execs = r.calls.filter((c) => c.startsWith('docker compose exec'))
  assert.equal(execs.length, 2, r.calls.join('\n'))
  assert.match(execs[1], /-e TRACY_LABEL=northwind-import-example-e1b80210 web php/)
  assert.match(r.stdout, /derived contract: 9 entities, 41 slots, calibrated/)
  const uncalibrated = runImportPostUp('joomla', {
    env: { DB_IMPORTED: '1', STUB_DERIVE: 'bound entities=3 slots=7 calibrated=0' }
  })
  assert.match(uncalibrated.stdout, /derived contract: 3 entities, 7 slots, not calibrated/)
})

for (const said of ['unsupported', 'failed entities=0 slots=0 calibrated=0', '']) {
  test(`joomla import: a component answering ${JSON.stringify(said)} to derive is said and never fails the import`, () => {
    const r = runImportPostUp('joomla', { env: { DB_IMPORTED: '1', STUB_DERIVE: said } })

    assert.equal(r.rc, 0)
    assert.match(r.stderr, /derived contract: not bound/)
    assert.equal(r.marker, true, 'identity is marked on its own outcome')
  })
}

/**
 * 🔒 THE SAME GAP ON JOOMLA (30/09/2026): the fresh road (a blank site) and a template card no profile
 * seals installed the component and paired its token, but never ran `joomla-content-identity.php`, so
 * those sites waited for tracy-host's next start too. Both run it now, never fatally.
 */
test('🔒 joomla blank site (--fresh): the identity registry is installed and marked', () => {
  const r = runPostUp('joomla', { road: { FRESH: '1' }, env: { STUB_JOOMLA_TOKEN: 'd'.repeat(40) } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.tokenFile, true, r.stdout + r.stderr)
  const exec = identityExecs(r)
  assert.equal(exec.length, 1, r.calls.join('\n'))
  assert.match(exec[0], /-e TRACY_NEW_SITE=1 web php/)
  assert.equal(r.marker, true)
})

test('🔒 joomla template card with no contract: the identity registry is installed and marked', () => {
  const r = runPostUp('joomla', {
    road: { QUICKSTART: 'quickstart/ja-voyara/j6', BUILD_WORKFLOW: 'template' },
    token: true
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(r.stdout, /template Cowork pairing verified \(no content contract\)/)
  const exec = identityExecs(r)
  assert.equal(exec.length, 1, r.calls.join('\n'))
  assert.equal(r.marker, true)
})

test('joomla template card whose contract lookup fails (not absent): the provision stops, unbound is never assumed', () => {
  const r = runPostUp('joomla', {
    road: { QUICKSTART: 'quickstart/ja-voyara/j6', BUILD_WORKFLOW: 'template' },
    token: true,
    env: { STUB_QS_CONTRACT_INVALID: '1' }
  })
  assert.notEqual(r.rc, 0, r.stdout + r.stderr)
  assert.match(
    r.stderr,
    /could not read this card's content contract: quickstart contract is not a non-empty string/
  )
  assert.doesNotMatch(r.stdout, /no content contract/)
  assert.equal(identityExecs(r).length, 0, r.calls.join('\n'))
})

test('joomla blank site and unsealed template: a refused registry is said and never fails the provision', () => {
  const blank = runPostUp('joomla', {
    road: { FRESH: '1' },
    env: { STUB_JOOMLA_TOKEN: 'd'.repeat(40), STUB_READER: 'outdated' }
  })
  assert.equal(blank.rc, 0, blank.stderr)
  assert.equal(blank.marker, false)
  assert.match(blank.stderr, /not installed \(outdated\)/)
  const card = runPostUp('joomla', {
    road: { QUICKSTART: 'quickstart/ja-voyara/j6', BUILD_WORKFLOW: 'template' },
    token: true,
    env: { STUB_READER: 'none' }
  })
  assert.equal(card.rc, 0, card.stderr)
  assert.equal(card.marker, false)
  assert.match(card.stderr, /not installed \(none\)/)
})

test('joomla-content-derive.php names itself, calls derive over loopback, and parses', () => {
  const file = path.join(PROVISION, 'joomla-content-derive.php')
  const source = readFileSync(file, 'utf8')
  assert.match(source.split('\n').slice(0, 3).join('\n'), /\/\/ tracy: content-derive/)
  assert.match(source, /'operation' => 'derive'/)
  assert.match(source, /TRACY_RESULT derived=/)
  assert.match(
    source,
    /http:\/\/127\.0\.0\.1\/index\.php\?option=com_claudecowork&task=api\.exec&format=json/
  )
  const lint = spawnSync('php', ['-l', file], { encoding: 'utf8' })
  if (lint.error) return // no php on this machine: the shape above is what is checked
  assert.equal(lint.status, 0, lint.stdout + lint.stderr)
})
