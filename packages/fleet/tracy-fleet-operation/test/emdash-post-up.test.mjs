#!/usr/bin/env node
/**
 * Both COMPLETE branches of `platform_post_up` in `provision/platform/emdash.sh` (#155), driven end
 * to end with the REAL function body extracted from the script and a stubbed Docker/curl whose
 * stdout and exit codes each scenario controls. What is asserted is the ORCHESTRATION contract, not
 * a source string: a failed/creative mint, a malformed token, a write/permission failure, a symlink
 * destination, a failed or unverified in-container cleanup — every one must return nonzero and NOT
 * leave the site marked ready, and the two success paths must store the PAT into the site's private
 * file.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-post-up.test.mjs
 *
 * 🔒 The body runs under `set -uo pipefail` with NO `-e`, and `platform_post_up` is invoked in an
 * `if …; then` — the exact errexit-disabled context that let the confirmed custody bug return
 * success. So a nonzero result here proves the EXPLICIT `return 1`s fire, not that `set -e` happened
 * to be on. Root-owned custody on a real Linux bind is a separate proof (exec-fixture below).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/platform/emdash.sh', import.meta.url))
const PROVISION = fileURLToPath(new URL('../scripts/provision', import.meta.url))
const GOOD = 'ec_pat_ABCdef0123456789ghijkl'
const OWNER = 'owner@example.test'

/** Everything from the first custody helper to EOF: helpers + platform_compose/configure/post_up. */
function tailSource() {
  const src = readFileSync(SCRIPT, 'utf8')
  const start = src.indexOf('_emdash_agent_token_file()')
  assert.ok(start !== -1, 'could not locate the token helpers in emdash.sh')
  return src.slice(start)
}

// A Docker/curl/sleep stub as shell FUNCTIONS (they shadow the real commands the script calls),
// kept in a fixture file so its many `${STUB_*:-}` reads are not eaten by JS template interpolation.
const STUBS = readFileSync(fileURLToPath(new URL('./emdash-post-up-stub.sh', import.meta.url)), 'utf8')

/**
 * Drive platform_post_up once; return {rc, stdout, stderr, token, docker} where token is the private
 * file and docker is every docker call the run made, one per line (STUB_DOCKER_LOG).
 */
function runPostUp({ env = {}, dest, here = PROVISION, isolated = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-postup-'))
  const site = path.join(root, 'site')
  const sitesRoot = path.join(root, 'sites')
  mkdirSync(path.join(site, 'data'), { recursive: true })
  mkdirSync(sitesRoot, { recursive: true })
  if (isolated) writeFileSync(path.join(site, 'network-isolated'), '')
  const tokenFile = path.join(site, 'tracy-agent.token')

  // The destination shape under test: a fresh regular file (prepared), a directory, or a symlink.
  if (dest === 'dir') mkdirSync(tokenFile)
  else if (dest === 'symlink') symlinkSync(path.join(root, 'elsewhere'), tokenFile)

  const dockerLog = path.join(root, 'docker.log')
  // platform_compose prepares the relay token file for a labelled image; post_up then reads it.
  const prepare =
    (dest ? '' : '_emdash_prepare_token_file || { echo "PREP_FAILED"; exit 7; }\n') +
    (env.STUB_CONTENT_API === '1' ? '_emdash_prepare_content_token || { echo "PREP_FAILED"; exit 7; }\n' : '')
  const body = `${STUBS}\n${tailSource()}\n${prepare}if platform_post_up; then echo "POSTUP_RC=0"; else echo "POSTUP_RC=$?"; fi\n`
  const script = `set -uo pipefail\nSITE_DIR=${JSON.stringify(site)}\nLABEL=demo\nWEB_IMAGE=tracy/x:1\nHERE=${JSON.stringify(here)}\nTRACY_FLEET_DIR=/nonexistent\nHOST_PORT=4321\n${body}`

  const res = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_SITES_ROOT: sitesRoot,
      STUB_DOCKER_LOG: dockerLog,
      TRACY_OWNER_EMAIL: OWNER,
      ...env
    }
  })
  const stdout = String(res.stdout ?? '')
  const stderr = String(res.stderr ?? '')
  const m = stdout.match(/POSTUP_RC=(\d+)/)
  const rc = m ? Number(m[1]) : null
  const token = existsSync(tokenFile) && !dest ? readFileSync(tokenFile, 'utf8') : ''
  const docker = existsSync(dockerLog) ? readFileSync(dockerLog, 'utf8') : ''
  rmSync(root, { recursive: true, force: true })
  return { rc, stdout, stderr, token, docker, site }
}

// ── generic (non-business) branch: setup + mint ──────────────────────────────────────────────

test('generic: a clean mint stores the PAT and reports ready', () => {
  const r = runPostUp({ env: { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '0' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.token, `${GOOD}\n`)
  assert.match(r.docker, /curl .* -X POST http:\/\/127\.0\.0\.1:4321\/_emdash\/api\/setup /)
})

test('generic: first-run setup reaches the site on a bridged host', () => {
  const r = runPostUp({ env: { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_LOOPBACK_DOWN: '1' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(r.stdout, /setup complete/)
  assert.match(r.docker, /curl .* -X POST http:\/\/172\.30\.0\.7:4321\/_emdash\/api\/setup /)
  assert.doesNotMatch(r.docker, /curl .* -X POST http:\/\/127\.0\.0\.1:/)
})

test('generic: an unknown site address fails before setup or mint', () => {
  const r = runPostUp({ env: { STUB_LOOPBACK_DOWN: '1', STUB_SITE_IP: '' } })
  assert.notEqual(r.rc, 0)
  assert.doesNotMatch(r.docker, / -X POST |tracy-mint\.cjs/)
  assert.equal(r.token, '')
})

test('generic: a NONZERO mint with valid-looking stdout FAILS (status is not `|| true`d away)', () => {
  const r = runPostUp({ env: { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '1' } })
  assert.notEqual(r.rc, 0)
  assert.equal(r.token, '', 'a crashed mint must not leave a stored token')
})

test('generic: a malformed / missing PAT on stdout FAILS', () => {
  for (const out of ['', 'boom: internal error', 'TRACY_EMDASH_PAT=ec_pat_short']) {
    const r = runPostUp({ env: { STUB_MINT_STDOUT: out, STUB_MINT_RC: '0' } })
    assert.notEqual(r.rc, 0, `stdout ${JSON.stringify(out)} should have failed`)
    assert.equal(r.token, '')
  }
})

test('generic: raw mint output never reaches the log', () => {
  const secret = 'INTERNAL_STACK_ec_pat_leakleakleakleak'
  const r = runPostUp({ env: { STUB_MINT_STDOUT: secret, STUB_MINT_RC: '1' } })
  assert.notEqual(r.rc, 0)
  assert.doesNotMatch(r.stdout + r.stderr, /INTERNAL_STACK|leakleak/, 'raw mint output was logged')
})

test('generic: a directory at the destination FAILS the write (the confirmed bug, via post_up)', () => {
  const r = runPostUp({
    dest: 'dir',
    env: { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '0' }
  })
  assert.notEqual(r.rc, 0)
})

test('generic: a symlink at the destination is REFUSED', () => {
  const r = runPostUp({
    dest: 'symlink',
    env: { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '0' }
  })
  assert.notEqual(r.rc, 0)
  assert.match(r.stderr, /symlink/)
})

test('generic: a failed root chown FAILS the store (permission step not swallowed, no non-root skip)', () => {
  // The store always chowns 0:0 — there is no "skip when not root" branch — so a chown that fails
  // must fail post_up rather than leave the token under an agent-writable owner.
  const r = runPostUp({
    env: { STUB_CHOWN_RC: '1', STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '0' }
  })
  assert.notEqual(r.rc, 0, 'a failed root chown must fail post_up')
  assert.equal(r.token, '', 'a failed chown must not leave a stored token')
})

test('generic: a chown that "succeeds" but leaves a non-root owner FAILS (owner is verified)', () => {
  // chown reports success but stat sees uid 33 (www-data): the read-back verification must catch it.
  const r = runPostUp({
    env: {
      STUB_CHOWN_RC: '0',
      STUB_STAT_UID: '33',
      STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`,
      STUB_MINT_RC: '0'
    }
  })
  assert.notEqual(r.rc, 0)
})

test('generic: a failed mint-helper copy FAILS before minting', () => {
  const r = runPostUp({ env: { STUB_CP_RC: '1', STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}` } })
  assert.notEqual(r.rc, 0)
})

// ── Content API relay: keyed on the image label, not on the template id ─────────────────────────
//
// Base and SaaS images carry `io.tracy.content-api.scalars=1` but no `tracy-business` template id,
// so they take the generic first-run path. Until 29/09/2026 only the business branch registered the
// relay token, so every labelled non-business site answered the relay 401 CONTENT_UNAUTHENTICATED
// (quickstart smoke H1). The relay step now follows the label on both paths.

const MINT_OK = { STUB_MINT_STDOUT: `TRACY_EMDASH_PAT=${GOOD}`, STUB_MINT_RC: '0' }
const RELAY_REGISTER = /exec .*node tracy-content-token\.cjs/
const RELAY_DIGEST = /exec .*tracy-content-relay\.sha256/
const RELAY_IDENTITY = /exec .*identity-sqlite\.mjs init/

test('relay: a labelled image on the generic path registers the relay token, digest and identity', () => {
  const r = runPostUp({ env: { ...MINT_OK, STUB_TEMPLATE_ID: 'tracy-saas', STUB_CONTENT_API: '1' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.token, `${GOOD}\n`)
  assert.match(r.docker, RELAY_REGISTER)
  assert.match(r.docker, RELAY_DIGEST)
  assert.match(r.docker, RELAY_IDENTITY)
  assert.match(r.stdout, /Content API: read-only relay token registered/)
})

test('relay: an image without the label keeps the old first-run path (no relay step)', () => {
  const r = runPostUp({ env: { ...MINT_OK, STUB_TEMPLATE_ID: 'tracy-base' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.doesNotMatch(r.docker, RELAY_REGISTER)
  assert.doesNotMatch(r.docker, RELAY_IDENTITY)
})

test('relay: a failed relay registration on the generic path FAILS the provision', () => {
  const r = runPostUp({
    env: { ...MINT_OK, STUB_TEMPLATE_ID: 'tracy-base', STUB_CONTENT_API: '1', STUB_CONTENT_REGISTER_RC: '1' }
  })
  assert.notEqual(r.rc, 0)
  assert.match(r.stderr, /could not register the Content API token/)
})

// The mint helper is copied into /app as root; left there, it is one more file in the site's tree
// that www-data cannot replace (24/10/2026). It goes whatever the mint did.
const MINT_RM = /^exec -u 0 demo-web-1 rm -f \/app\/tracy-mint\.cjs$/m

test('mint helper: removed from /app after a clean mint', () => {
  const r = runPostUp({ env: MINT_OK })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(r.docker, MINT_RM)
})

test('mint helper: removed from /app after a failed mint, and the failure still fails', () => {
  const r = runPostUp({ env: { STUB_MINT_STDOUT: '', STUB_MINT_RC: '1' } })
  assert.equal(r.rc, 1)
  assert.match(r.stderr, /mint exited nonzero/)
  assert.match(r.docker, MINT_RM)
})

// Owner guard: after the relay digest, files under /app that www-data does not own are reported,
// the root-owned digest excepted. A warning only: the fix is in the image.
test('owner guard: foreign files under /app are reported, the digest is excluded, the site still passes', () => {
  const r = runPostUp({
    env: {
      ...MINT_OK,
      STUB_TEMPLATE_ID: 'tracy-saas',
      STUB_CONTENT_API: '1',
      STUB_FOREIGN: '/app/.astro /app/dist'
    }
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(
    r.docker,
    /^exec -u 0 demo-web-1 find \/app -xdev ! -user www-data ! -path \/app\/tracy-content-relay\.sha256$/m
  )
  assert.match(r.stderr, /warning: 2 files under \/app are not owned by www-data/)
})

test('owner guard: a clean /app prints no warning', () => {
  const r = runPostUp({ env: { ...MINT_OK, STUB_TEMPLATE_ID: 'tracy-saas', STUB_CONTENT_API: '1' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.doesNotMatch(r.stderr, /not owned by www-data/)
})

test('relay: a labelled business image still registers the relay (once)', () => {
  const r = runPostUp({
    env: {
      STUB_TEMPLATE_ID: 'tracy-business',
      STUB_CONTENT_API: '1',
      STUB_LEGACY_TOKEN: GOOD,
      STUB_RM_RC: '0',
      STUB_CP_RC: '0'
    }
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.docker.split('\n').filter((l) => RELAY_REGISTER.test(l)).length, 1)
})

// ── tracy-business branch: bootstrap + legacy-token collection ────────────────────────────────

const BIZ = { STUB_TEMPLATE_ID: 'tracy-business' }

test('business: a clean bootstrap collects the PAT, cleans up, and reports ready', () => {
  const r = runPostUp({ env: { ...BIZ, STUB_LEGACY_TOKEN: GOOD, STUB_RM_RC: '0', STUB_CP_RC: '0' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.token, `${GOOD}\n`)
})

test('business: a failed bootstrap FAILS (full bootstrap failure prevents ready)', () => {
  const r = runPostUp({ env: { ...BIZ, STUB_BOOTSTRAP_RC: '1' } })
  assert.notEqual(r.rc, 0)
  assert.equal(r.token, '')
})

test('business: raw bootstrap output (even a fake PAT) never reaches the provision log', () => {
  // bootstrap-site.sh line 51 echoes raw mint output; the wrapper suppresses stdout+stderr and the
  // injected fake PAT must appear in neither the job stdout nor stderr.
  const fake = 'ec_pat_FAKELEAK0123456789abcd'
  const r = runPostUp({
    env: {
      ...BIZ,
      STUB_BOOTSTRAP_RC: '1',
      STUB_BOOTSTRAP_STDOUT: `mint failed: ${fake}`,
      STUB_BOOTSTRAP_STDERR: `stack ${fake}`
    }
  })
  assert.notEqual(r.rc, 0)
  assert.doesNotMatch(r.stdout + r.stderr, /FAKELEAK/, 'raw bootstrap output leaked into the log')
})

test('business: an invalid legacy token FAILS the store', () => {
  const r = runPostUp({ env: { ...BIZ, STUB_LEGACY_TOKEN: 'not-a-pat' } })
  assert.notEqual(r.rc, 0)
  assert.equal(r.token, '')
})

test('business: a symlinked / non-regular legacy token in the container is REFUSED', () => {
  for (const mode of ['symlink', 'missing']) {
    const r = runPostUp({ env: { ...BIZ, STUB_LEGACY_MODE: mode } })
    assert.notEqual(r.rc, 0, `legacy mode ${mode} should have failed`)
    assert.equal(r.token, '')
  }
})

test('business: a failed legacy cleanup FAILS — no readable copy may be left behind', () => {
  const r = runPostUp({ env: { ...BIZ, STUB_LEGACY_TOKEN: GOOD, STUB_RM_RC: '1' } })
  assert.notEqual(r.rc, 0)
})

test('business: cleanup that leaves the copy present (verify fails) FAILS', () => {
  // rm "succeeds" but the copy is still there: the explicit present/absent check must catch it.
  const r = runPostUp({
    env: { ...BIZ, STUB_LEGACY_TOKEN: GOOD, STUB_RM_RC: '0', STUB_CLEANUP_PRESENT: '1' }
  })
  assert.notEqual(r.rc, 0)
})

test('business: an exec error during the absence check is NOT read as "gone"', () => {
  // A docker/exec failure (missing container, proxy error) must not be mistaken for the copy being
  // absent — that is exactly the `test -e returns nonzero` trap the single explicit check avoids.
  const r = runPostUp({
    env: { ...BIZ, STUB_LEGACY_TOKEN: GOOD, STUB_RM_RC: '0', STUB_CLEANUP_EXEC_RC: '2' }
  })
  assert.notEqual(r.rc, 0)
})

// ── site mail (#803): the relay path is configured, and proven, before the site is ready ────────
//
// Until #803 nothing in a provision selected a mail provider, so an EmDash site stored its form
// submissions and mailed nobody. post_up now proves the sendmail shim and the relay variables in the
// running container, then runs the fleet's own configure-mail.mjs on the host against the site.

// The probe's script spans several lines of the docker log; its first line is on the `exec` line.
const MAIL_PROBE = /^exec -u www-data demo-web-1 sh -c\s+p=\$\(command -v sendmail\)/m
const MAIL_HELPER = /^node .*configure-mail\.mjs .*$/m
const BIZ_OK = { ...BIZ, STUB_LEGACY_TOKEN: GOOD, STUB_RM_RC: '0', STUB_CP_RC: '0' }
const BRANCHES = [
  ['generic', MINT_OK],
  ['business', BIZ_OK]
]

for (const [name, ok] of BRANCHES) {
  test(`mail (${name}): configured after the token is stored and before ready, PAT off argv`, () => {
    const r = runPostUp({ env: ok })
    assert.equal(r.rc, 0, r.stderr)
    assert.match(r.docker, MAIL_PROBE, 'the shim and relay variables were not probed')
    const call = r.docker.match(MAIL_HELPER)?.[0]
    assert.ok(call, 'configure-mail.mjs was not run')
    assert.ok(r.docker.search(MAIL_PROBE) < r.docker.search(MAIL_HELPER), 'probe must precede the helper')
    assert.ok(call.includes(path.join(PROVISION, 'emdash', 'configure-mail.mjs')), call)
    assert.match(call, /--origin http:\/\/127\.0\.0\.1:4321 /)
    assert.ok(call.includes(`--token-file ${path.join(r.site, 'tracy-agent.token')}`), call)
    assert.ok(call.includes(`--sender ${OWNER}`), call)
    assert.match(call, /token=present$/, 'the helper ran before the PAT was stored')
    assert.ok(!r.docker.includes(GOOD) && !(r.stdout + r.stderr).includes(GOOD), 'the PAT leaked')
  })

  // 25/10/2026 ("Don't send email"): a template's forms ship the template's recipients.
  test(`forms (${name}): quieted after the mail path, on the site's own address, the PAT off argv`, () => {
    const r = runPostUp({ env: { ...ok, STUB_FORMS_OUT: 'forms: 80 mail nobody (80 quieted)' } })
    assert.equal(r.rc, 0, r.stderr)
    const call = r.docker.match(/^node .*quiet-forms\.mjs .*$/m)?.[0]
    assert.ok(call, 'quiet-forms.mjs was not run')
    assert.ok(r.docker.search(MAIL_HELPER) < r.docker.search(/quiet-forms\.mjs/), 'mail first, then forms')
    assert.ok(call.includes(path.join(PROVISION, 'emdash', 'quiet-forms.mjs')), call)
    assert.match(call, /--origin http:\/\/127\.0\.0\.1:4321 /)
    assert.ok(call.includes(`--token-file ${path.join(r.site, 'tracy-agent.token')}`), call)
    assert.match(r.stdout, /forms: 80 mail nobody/)
    assert.ok(!r.docker.includes(GOOD), 'the PAT leaked')
  })

  test(`forms (${name}): forms that could not be quieted FAIL the provision`, () => {
    const r = runPostUp({ env: { ...ok, STUB_FORMS_RC: '1' } })
    assert.notEqual(r.rc, 0)
    assert.match(r.stderr, /forms from mailing the template's recipients — refusing to mark this site ready/)
  })

  test(`mail (${name}): a failed mail configuration FAILS the provision`, () => {
    const r = runPostUp({ env: { ...ok, STUB_MAIL_RC: '1', STUB_MAIL_STDERR: 'configure-mail: refused' } })
    assert.notEqual(r.rc, 0)
    assert.match(r.stderr, /mail .*refusing to mark this site ready/)
  })

  test(`mail (${name}): no shim, no relay variables, another label or a failed exec FAILS before the helper`, () => {
    const probes = [
      { STUB_MAIL_PROBE: 'no-sendmail' },
      { STUB_MAIL_PROBE: 'no-shim' },
      { STUB_MAIL_PROBE: 'foreign-sendmail' },
      { STUB_MAIL_PROBE: 'no-relay' },
      { STUB_MAIL_PROBE: 'ok other-site' },
      { STUB_MAIL_PROBE: '' },
      { STUB_MAIL_PROBE_RC: '1' },
      { STUB_MAIL_PROBE_RC: '126' }
    ]
    for (const probe of probes) {
      const r = runPostUp({ env: { ...ok, ...probe } })
      assert.notEqual(r.rc, 0, `probe ${JSON.stringify(probe)} should have failed`)
      assert.doesNotMatch(r.docker, MAIL_HELPER, `probe ${JSON.stringify(probe)} still ran the helper`)
      assert.match(r.stderr, /refusing to mark this site ready/)
    }
  })

  test(`mail (${name}): a missing fleet helper FAILS (never a copy inside the container)`, () => {
    const r = runPostUp({ env: ok, here: '/nonexistent' })
    assert.notEqual(r.rc, 0)
    assert.doesNotMatch(r.docker, MAIL_HELPER)
    assert.doesNotMatch(r.docker, /^(cp|exec) .*configure-mail/m, 'the helper must not enter the container')
  })

  test(`mail (${name}): no owner email passes no sender — the helper decides, nothing is invented`, () => {
    const r = runPostUp({ env: { ...ok, TRACY_OWNER_EMAIL: '', TRACY_MAIL_SENDER: '' } })
    const call = r.docker.match(MAIL_HELPER)?.[0]
    assert.ok(call, 'configure-mail.mjs was not run')
    assert.doesNotMatch(call, /--sender/)
  })
}

// #827 regression: a site nobody owns (a demo the sweep redeploys, a stock instance) has no owner
// email, and the helper refuses an EmDash site with no fromEmail and no sender. tracy-web names the
// site's own relay address (`--mail-sender`), and post_up passes it only when there is no owner.
for (const [name, ok] of BRANCHES) {
  test(`mail (${name}): no owner email sends the site's relay address`, () => {
    const r = runPostUp({ env: { ...ok, TRACY_OWNER_EMAIL: '', TRACY_MAIL_SENDER: 'demo@sites.tracy.test' } })
    assert.equal(r.rc, 0, r.stderr)
    const call = r.docker.match(MAIL_HELPER)?.[0]
    assert.ok(call, 'configure-mail.mjs was not run')
    assert.ok(call.includes('--sender demo@sites.tracy.test'), call)
  })

  test(`mail (${name}): an owner email still wins over the relay address`, () => {
    const r = runPostUp({ env: { ...ok, TRACY_MAIL_SENDER: 'demo@sites.tracy.test' } })
    const call = r.docker.match(MAIL_HELPER)?.[0]
    assert.ok(call, 'configure-mail.mjs was not run')
    assert.ok(call.includes(`--sender ${OWNER}`), call)
    assert.doesNotMatch(call, /demo@sites\.tracy\.test/)
  })
}

test('provision.sh takes --mail-sender (tracy-host sends it for a demo or a stock instance)', () => {
  const run = spawnSync(
    'bash',
    [path.join(PROVISION, 'provision.sh'), '--mail-sender', 'demo@sites.tracy.test'],
    {
      encoding: 'utf8'
    }
  )
  assert.equal(run.status, 2)
  assert.doesNotMatch(run.stderr, /unknown argument/)
  assert.match(run.stderr, /need --site and --label/)
})

// The macOS stack (deploy/compose.macos.yml) runs tracy-host on a bridge: its 127.0.0.1 is its own,
// so the site's published loopback port is not there. Only the business branch gets this far on
// that stack — its bootstrap runs inside the container.
const MACOS = { ...BIZ_OK, STUB_LOOPBACK_DOWN: '1' }
const SITE_INSPECT = /^inspect --format .*NetworkSettings\.Networks "([^"]+)".*IPAddress.* demo-web-1$/m

test('isolated bridge: setup, mail and forms borrow only this host connection and release it', () => {
  const r = runPostUp({ isolated: true, env: { ...MACOS, HOSTNAME: '123456abcdef' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.docker.match(SITE_INSPECT)?.[1], 'demo_default', r.docker)
  assert.match(r.docker, /^network connect demo_default 123456abcdef/m)
  assert.match(r.docker, /^network disconnect demo_default 123456abcdef/m)
  assert.ok(r.docker.indexOf('network connect') < r.docker.indexOf('configure-mail.mjs'))
  assert.ok(r.docker.indexOf('quiet-forms.mjs') < r.docker.indexOf('network disconnect'))
  assert.doesNotMatch(r.docker, /network connect tracy_tracy/)
})

test('isolated bridge: a failed helper still releases its connection', () => {
  const r = runPostUp({ isolated: true, env: { ...MACOS, HOSTNAME: '123456abcdef', STUB_MAIL_RC: '1' } })
  assert.notEqual(r.rc, 0)
  assert.match(r.docker, /^network disconnect demo_default 123456abcdef/m)
})

test('isolated bridge: a later loopback listener cannot replace the selected private origin', () => {
  const r = runPostUp({
    isolated: true,
    env: { ...MACOS, HOSTNAME: '123456abcdef', STUB_LOOPBACK_RECOVERS: '1' }
  })
  assert.equal(r.rc, 0, r.stderr)
  assert.match(r.docker.match(MAIL_HELPER)?.[0] ?? '', /--origin http:\/\/172\.30\.0\.7:4321 /)
})

test('isolated bridge: interrupting connect releases the lease without running a helper', () => {
  for (const [signal, rc] of [
    ['INT', 130],
    ['TERM', 143]
  ]) {
    const r = runPostUp({
      isolated: true,
      env: { ...MACOS, HOSTNAME: '123456abcdef', STUB_CONNECT_SIGNAL: signal }
    })
    assert.equal(r.rc, rc, r.stderr)
    assert.match(r.docker, /^network disconnect demo_default 123456abcdef/m)
    assert.doesNotMatch(r.docker, /configure-mail\.mjs|quiet-forms\.mjs/)
  }
})

test('isolated fleet: reachable loopback needs no bridged host identity or membership', () => {
  const r = runPostUp({ isolated: true, env: { ...BIZ_OK, HOSTNAME: 'fleet-native' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.doesNotMatch(r.docker, /^inspect |^network (connect|disconnect) /m)
})

test('isolated bridge: a preexisting host connection is preserved', () => {
  const r = runPostUp({ isolated: true, env: { ...MACOS, HOSTNAME: '123456abcdef', STUB_HOST_JOINED: '1' } })
  assert.equal(r.rc, 0, r.stderr)
  assert.doesNotMatch(r.docker, /^network (connect|disconnect) /m)
})

test('isolated bridge: an unverified host never joins or runs a credentialed helper', () => {
  for (const invalid of [
    { HOSTNAME: 'other-host' },
    { STUB_HOST_IDENTITY: 'other|tracy-host|true|tracy_tracy' },
    { STUB_HOST_IDENTITY: '123456abcdef00|tracy-web|true|tracy_tracy' },
    { STUB_HOST_IDENTITY: '123456abcdef00|tracy-host|false|tracy_tracy' },
    { STUB_HOST_IDENTITY: '123456abcdef00|tracy-host|true|other_tracy' }
  ]) {
    const r = runPostUp({ isolated: true, env: { ...MACOS, HOSTNAME: '123456abcdef', ...invalid } })
    assert.notEqual(r.rc, 0, JSON.stringify(invalid))
    assert.doesNotMatch(r.docker, /^network connect |configure-mail\.mjs/m)
  }
})

test('isolated bridge: connect, reachability and cleanup failures cannot report ready', () => {
  for (const failure of [{ STUB_CONNECT_RC: '1' }, { STUB_PRIVATE_DOWN: '1' }, { STUB_DISCONNECT_RC: '1' }]) {
    const r = runPostUp({ isolated: true, env: { ...MACOS, HOSTNAME: '123456abcdef', ...failure } })
    assert.notEqual(r.rc, 0, JSON.stringify(failure))
  }
})

test('mail (macOS stack): no loopback answer — the helper dials the web container address docker reports', () => {
  const r = runPostUp({ env: MACOS })
  assert.equal(r.rc, 0, r.stderr)
  assert.equal(r.docker.match(SITE_INSPECT)?.[1], 'tracy_tracy', r.docker)
  const call = r.docker.match(MAIL_HELPER)?.[0]
  assert.ok(call, 'configure-mail.mjs was not run')
  assert.match(call, /--origin http:\/\/172\.30\.0\.7:4321 /)
  assert.doesNotMatch(call, /127\.0\.0\.1|demo-web-1/, 'the PAT must go to the inspected address, not a name')
  assert.match(call, /token=present$/)

  const named = runPostUp({ env: { ...MACOS, TRACY_SITE_NETWORK: 'stand_tracy', STUB_SITE_IP: '10.9.8.7' } })
  assert.equal(named.rc, 0, named.stderr)
  assert.equal(named.docker.match(SITE_INSPECT)?.[1], 'stand_tracy')
  assert.match(named.docker.match(MAIL_HELPER)?.[0] ?? '', /--origin http:\/\/10\.9\.8\.7:4321 /)
})

test('mail (macOS stack): an address docker cannot report, or one that is not an IPv4, FAILS before the helper', () => {
  const cases = [
    { STUB_INSPECT_RC: '1' },
    { STUB_SITE_IP: '' },
    { STUB_SITE_IP: '<no value>' },
    { STUB_SITE_IP: 'demo-web-1' },
    { STUB_SITE_IP: '172.30.0.7 172.30.0.8' },
    { STUB_SITE_IP: 'fd00::7' },
    { STUB_SITE_IP: '172.30.0.7:80/x' }
  ]
  for (const c of cases) {
    const r = runPostUp({ env: { ...MACOS, ...c } })
    assert.notEqual(r.rc, 0, `${JSON.stringify(c)} should have failed`)
    assert.doesNotMatch(r.docker, MAIL_HELPER, `${JSON.stringify(c)} still ran the helper`)
    assert.match(r.stderr, /mail not configured; refusing to mark this site ready/)
  }
})

test('mail: a site that answers on loopback is never asked for its docker address', () => {
  for (const [, ok] of BRANCHES) {
    const r = runPostUp({ env: ok })
    assert.equal(r.rc, 0, r.stderr)
    assert.doesNotMatch(r.docker, /^inspect /m)
  }
})

test('mail: a failed mint never reaches the mail step', () => {
  const r = runPostUp({ env: { STUB_MINT_STDOUT: '', STUB_MINT_RC: '0' } })
  assert.notEqual(r.rc, 0)
  assert.doesNotMatch(r.docker, MAIL_PROBE)
  assert.doesNotMatch(r.docker, MAIL_HELPER)
})

test('mail: a failed image inspect FAILS before the mail step', () => {
  const r = runPostUp({ env: { ...MINT_OK, STUB_IMAGE_RC: '1' } })
  assert.notEqual(r.rc, 0)
  assert.doesNotMatch(r.docker, MAIL_PROBE)
  assert.doesNotMatch(r.docker, MAIL_HELPER)
})

// ── demos: two roads, and only one of them reaches the mail step ────────────────────────────────
//
// A demo pressed in /ops goes through provision.sh like a customer site (tracy-web's provisionDemo;
// the one difference is --frame-ancestors), so it gets the tools layer and the relay variables and
// is held to the same proof. A demo put up by hand with emdash/deploy-quickstart.sh writes its own
// compose around the image as built — no shim, no TRACY_MAIL_* — and never calls platform_post_up:
// that road has no mail path on purpose, and says so instead of stopping.

test('mail (demo through provision.sh): a framed demo is configured, and one without the shim still FAILS', () => {
  const framed = { FRAME_ANCESTORS: 'https://cowork.tracy.test' }
  for (const [name, ok] of BRANCHES) {
    const good = runPostUp({ env: { ...ok, ...framed } })
    assert.equal(good.rc, 0, `${name}: ${good.stderr}`)
    assert.match(good.docker, MAIL_HELPER, `${name}: configure-mail.mjs was not run`)
    for (const probe of ['no-sendmail', 'no-shim', 'no-relay']) {
      const r = runPostUp({ env: { ...ok, ...framed, STUB_MAIL_PROBE: probe } })
      assert.notEqual(r.rc, 0, `${name}: a framed demo with ${probe} was marked ready`)
      assert.doesNotMatch(r.docker, MAIL_HELPER)
      assert.match(r.stderr, /refusing to mark this site ready/)
    }
  }
})

test('mail (demo through deploy-quickstart.sh): no mail step on that road, and it says the demo mails nobody', () => {
  const src = readFileSync(path.join(PROVISION, 'emdash', 'deploy-quickstart.sh'), 'utf8')
  const code = src
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  // Nothing on this road can stop for mail: it neither sources the platform file nor runs the helper.
  assert.doesNotMatch(
    code,
    /platform\/emdash\.sh|platform_post_up|_emdash_configure_mail|configure-mail\.mjs/
  )
  // Its compose carries the image as built and none of the relay variables — the state measured on
  // the two dev demos (03/10/2026).
  assert.match(code, /^ {4}image: \$IMAGE$/m)
  assert.doesNotMatch(code, /^\s+TRACY_MAIL_(URL|LABEL|TOKEN):/m)
  assert.doesNotMatch(code, /emdash_tools_image/)
  // One plain line, on stdout, after the site is up — not a refusal.
  const line = code.match(/^echo "==> no mail path: .*"$/m)?.[0]
  assert.ok(line, 'deploy-quickstart.sh does not say that the demo has no mail path')
  assert.match(line, /tracy-sendmail/)
  assert.match(line, /TRACY_MAIL_/)
  assert.ok(
    code.indexOf(line) > code.indexOf('docker compose up -d'),
    'the line belongs after the site is up'
  )
})
