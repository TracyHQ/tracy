#!/usr/bin/env node
/**
 * The #165 IN-HOST invocation wrapper: the piece that runs the migration WHERE THE SITES LIVE —
 * inside the one running `tracy-host` container — because the CI runner does not necessarily mount
 * the configured site private root (Plan 5's two-root split).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/invoke-dns-alias-in-host.test.mjs
 *
 * What is pinned here is the wrapper's contract, NOT the migration's (covered by
 * migrate-web-dns-alias.test.mjs): exactly one running tracy-host container is selected by exact
 * compose labels and a FULL 64-hex id; inspect must return exactly one object whose `.Id` matches;
 * its labels, running state, a SINGLE normalized non-root control-char-free TRACY_PRIVATE_ROOT and an
 * exact same-source/destination bind are validated; the installed scripts are digest-proven; a fixed
 * Node preflight run INSIDE that exact container confirms the runtime root equals the inspected root
 * and lstat shows a plain, non-symlink, readable/traversable directory; the opaque selector is passed
 * as one `--from-alias` datum with the container's own root; dry-run is default and `--apply` explicit;
 * and every refusal is sanitized — no selector, no path, no docker payload.
 *
 * No daemon: a tiny docker stub answers `ps`, `inspect`, `exec sha256sum` (hashing REAL copied-in
 * bytes) and `exec node` — the last by ACTUALLY running the wrapper's preflight code against a real
 * directory, so the preflight logic itself (missing/file/symlink/env-mismatch) is exercised, not faked.
 */
import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { sh } from './sh-async.mjs'
import { scriptStub } from './warm-stub.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROVISION = path.join(HERE, '../scripts/provision')
const CLI = path.join(PROVISION, 'invoke-dns-alias-in-host.sh')
const SCRIPTS = ['migrate-web-dns-alias.sh', 'dns-alias.mjs', 'render-compose.sh']

const SELECTOR = 'tracy-web-0a1b2c3d4e5f60718293a4b5c6d7e8f9'
const DEFAULT_ID = 'deadbeefcafe0001'.repeat(4) // 64 hex
const SAFE_ROOT = '/srv/tracy-private' // a string-valid root for inspect-only refusal cases

const TEMP = []
const mkTemp = (prefix) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix))
  TEMP.push(d)
  return d
}
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})

// The docker stub. `ps`/`inspect` are served from state; `exec … sha256sum PATH` hashes the REAL file
// at PATH (the copied-in installed scripts); `exec … node -e CODE ROOT` ACTUALLY runs the wrapper's
// preflight against the real fs, with TRACY_PRIVATE_ROOT set to the container's runtime root (so the
// env-match branch is real); `exec … bash …` records the migration invocation and returns success (or
// failure, if armed). Every call is appended to FAKE_LOG as argv joined by the unit separator.
const STUB = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const argv = process.argv.slice(2)
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'))
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, argv.join('\\u001f') + '\\n')
if (argv[0] === 'ps') {
  process.stdout.write((state.ids || []).join('\\n'))
  process.exit(0)
}
if (argv[0] === 'inspect') {
  process.stdout.write(JSON.stringify(state.container == null ? [] : [state.container]))
  process.exit(0)
}
if (argv[0] === 'exec') {
  const cmd = argv[2]
  if (cmd === 'sha256sum') {
    try {
      const h = createHash('sha256').update(readFileSync(argv[3])).digest('hex')
      process.stdout.write(h + '  ' + argv[3] + '\\n')
      process.exit(0)
    } catch { process.exit(1) }
  }
  if (cmd === 'node') {
    const ei = argv.indexOf('-e')
    const res = spawnSync(process.execPath, ['-e', argv[ei + 1], argv[ei + 2]], {
      env: { ...process.env, TRACY_PRIVATE_ROOT: state.containerEnvRoot }
    })
    process.exit(res.status == null ? 1 : res.status)
  }
  if (cmd === 'timeout') {
    // The availability preflight: \`timeout --version\` (no wrapped command).
    if (argv.includes('--version') && !argv.includes('bash')) process.exit(state.noTimeout ? 127 : 0)
    // The wrapped migration: pass its own exit through, unless a deadline is simulated (124/137).
    if (state.timeoutExpires) process.exit(state.timeoutExpires === 'kill' ? 137 : 124)
    process.exit(state.execFails ? 1 : 0)
  }
  process.exit(0)
}
process.stderr.write('stub: unhandled ' + argv[0] + '\\n')
process.exit(2)
`

/** A well-formed tracy-host inspect object — the shape the wrapper's validator expects. */
const goodContainer = (over = {}) => ({
  Id: over.id,
  Config: {
    Labels: {
      'com.docker.compose.project': 'tracy',
      'com.docker.compose.service': 'tracy-host',
      ...over.labels
    },
    Env: over.env || ['HOST_NAME=dev', `TRACY_PRIVATE_ROOT=${over.root ?? SAFE_ROOT}`, 'PORT=51720']
  },
  State: { Running: over.running ?? true },
  Mounts: over.mounts || [
    { Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' },
    { Type: 'bind', Source: over.root ?? SAFE_ROOT, Destination: over.root ?? SAFE_ROOT }
  ]
})

/** A stub, an installed script tree (real bytes), a REAL private root dir, and a state file. */
function makeHost({
  ids = [DEFAULT_ID],
  container,
  tamperInstalled,
  execFails = false,
  containerEnvRoot,
  noTimeout = false,
  timeoutExpires = false
} = {}) {
  const base = mkTemp('invoke-dns-')
  const shim = path.join(base, 'docker')
  const stub = path.join(base, 'stub.mjs')
  writeFileSync(stub, STUB)
  scriptStub(shim, `#!/usr/bin/env bash\nexec node ${JSON.stringify(stub)} "$@"\n`)
  // A REAL private root, so the in-container preflight lstat runs against actual bytes.
  const rr = path.join(base, 'private')
  mkdirSync(rr, { recursive: true })
  const privateRoot = realpathSync(rr)
  // The "installed" scripts live at $TRACY_FLEET_DIR/provision, holding real copies of the checkout.
  const fleet = path.join(base, 'opt-tracy-fleet')
  const installed = path.join(fleet, 'provision')
  mkdirSync(installed, { recursive: true })
  for (const name of SCRIPTS) copyFileSync(path.join(PROVISION, name), path.join(installed, name))
  if (tamperInstalled)
    writeFileSync(path.join(installed, tamperInstalled), '# stale installed copy\n', { flag: 'a' })
  const cont = container === undefined ? goodContainer({ root: privateRoot }) : container
  if (cont && cont.Id === undefined) cont.Id = ids[0]
  const statePath = path.join(base, 'state.json')
  const logPath = path.join(base, 'docker.log')
  writeFileSync(
    statePath,
    JSON.stringify({
      ids,
      container: cont,
      execFails,
      containerEnvRoot: containerEnvRoot ?? privateRoot,
      noTimeout,
      timeoutExpires
    })
  )
  writeFileSync(logPath, '')
  return { base, shim, fleet, statePath, logPath, privateRoot }
}

// Async, so independent cases run side by side (a blocking spawn would make `concurrency` a no-op).
function run(args, host, { env = {} } = {}) {
  return sh('bash', [CLI, ...args], {
    env: {
      ...process.env,
      TRACY_DOCKER: host.shim,
      TRACY_FLEET_DIR: host.fleet,
      FAKE_STATE: host.statePath,
      FAKE_LOG: host.logPath,
      ...env
    }
  })
}

const calls = (host) =>
  readFileSync(host.logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\x1f'))

// The wrapped migration is `docker exec <cid> timeout … bash <migrate> …` — keyed on the presence of
// `bash`, so the `timeout --version` availability probe (no wrapped command) is not mistaken for it.
const migrateCall = (host) =>
  calls(host).find((c) => c[0] === 'exec' && c[2] === 'timeout' && c.includes('bash'))
// The migration's own argv, from `bash` onward: ['bash', <migrate path>, '--from-alias', …].
const migrateArgs = (host) => {
  const c = migrateCall(host)
  return c ? c.slice(c.indexOf('bash')) : undefined
}

// ── happy path ──────────────────────────────────────────────────────────────────────────────────

describe('invoke-dns-alias-in-host.sh', { concurrency: 8 }, () => {
  test('dry-run: full selection/validation/digest/preflight, then runs the migration in-container with the container root — no --apply', async () => {
    const host = makeHost()
    const r = await run(['--selector', SELECTOR], host)
    assert.equal(r.status, 0, r.stderr)
    const mc = migrateCall(host)
    assert.ok(mc, 'the migration was invoked inside the container')
    // Bounded from the inside: GNU timeout, TERM first, a bounded SIGKILL grace after the deadline.
    assert.ok(mc.includes('--signal=TERM'), 'timeout signals TERM first')
    assert.ok(
      mc.some((a) => /^--kill-after=\d+[smh]?$/.test(a)),
      'timeout has a bounded SIGKILL grace'
    )
    // The duration bound is the argument immediately before the wrapped command.
    assert.match(
      mc[mc.indexOf('bash') - 1],
      /^\d+[smh]$/,
      'a fixed timeout bound precedes the wrapped command'
    )
    const args = migrateArgs(host)
    assert.ok(args[1].endsWith('/provision/migrate-web-dns-alias.sh'), 'runs the INSTALLED migration')
    assert.deepEqual(
      args.slice(2),
      ['--from-alias', SELECTOR, '--root', host.privateRoot],
      'selector and root passed as data, one argv each'
    )
    assert.ok(!args.includes('--apply'), 'dry-run does not pass --apply')
    const shaPaths = calls(host)
      .filter((c) => c[0] === 'exec' && c[2] === 'sha256sum')
      .map((c) => path.basename(c[3]))
    assert.deepEqual(shaPaths.sort(), [...SCRIPTS].sort(), 'all three scripts are digest-checked')
  })

  test('apply: passes --apply through to the in-container migration', async () => {
    const host = makeHost()
    const r = await run(['--selector', SELECTOR, '--apply'], host)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(migrateArgs(host).slice(2), [
      '--from-alias',
      SELECTOR,
      '--root',
      host.privateRoot,
      '--apply'
    ])
  })

  test('the selector and the private root never appear in the wrapper output (sanitized)', async () => {
    const host = makeHost()
    const r = await run(['--selector', SELECTOR], host)
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(SELECTOR))
    assert.doesNotMatch(
      r.stdout + r.stderr,
      new RegExp(host.privateRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  })

  // ── container selection / id ──────────────────────────────────────────────────────────────────────

  test('no running tracy-host container is refused (stopped/absent), migration never invoked', async () => {
    const host = makeHost({ ids: [] })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no running tracy-host container/)
    assert.equal(migrateCall(host), undefined)
  })

  test('more than one tracy-host container is refused as ambiguous, never picked', async () => {
    const host = makeHost({ ids: ['a'.repeat(64), 'b'.repeat(64)] })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ambiguous/)
    assert.equal(migrateCall(host), undefined)
  })

  test('a ps result that is not a full 64-hex container id is refused', async () => {
    const host = makeHost({ ids: ['abc123'] })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /full container id|valid container id/)
    assert.equal(migrateCall(host), undefined)
  })

  test('an inspect object whose .Id does not match the selected id is refused', async () => {
    const host = makeHost({ container: goodContainer({ id: 'f'.repeat(64) }) })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /id does not match/)
    assert.equal(migrateCall(host), undefined)
  })

  test('an inspect payload that is not exactly one object is refused', async () => {
    const host = makeHost({ container: null })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /exactly one object/)
  })

  // ── inspect validation ────────────────────────────────────────────────────────────────────────────

  test('a container whose compose labels are not project=tracy/service=tracy-host is refused', async () => {
    const host = makeHost({
      container: goodContainer({ labels: { 'com.docker.compose.service': 'tracy-web' } })
    })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /labels are not project=tracy/)
  })

  test('a container reporting itself not running is refused', async () => {
    const host = makeHost({ container: goodContainer({ running: false }) })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not running/)
  })

  test('a duplicate TRACY_PRIVATE_ROOT env entry is refused, not last-wins', async () => {
    const host = makeHost({
      container: goodContainer({
        env: ['TRACY_PRIVATE_ROOT=/srv/a', 'HOST_NAME=dev', 'TRACY_PRIVATE_ROOT=/srv/b']
      })
    })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /more than once|ambiguous root/)
    assert.equal(migrateCall(host), undefined)
  })

  test('a control character in the private root is refused', async () => {
    const host = makeHost({ container: goodContainer({ root: '/srv/tra\x01cy' }) })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /unsafe root|no safe, normalized/)
  })

  for (const [name, badRoot] of [
    ['the filesystem root', '/'],
    ['a trailing-slash (unnormalized) root', '/srv/tracy-private/'],
    ['a .. traversal in the root', '/srv/../etc'],
    ['a relative root', 'srv/tracy-private'],
    ['an empty root', '']
  ]) {
    test(`an unsafe TRACY_PRIVATE_ROOT is refused: ${name}`, async () => {
      const host = makeHost({ container: goodContainer({ root: badRoot }) })
      const r = await run(['--selector', SELECTOR], host)
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /unsafe root|no safe, normalized/)
      assert.equal(migrateCall(host), undefined)
    })
  }

  test('a missing TRACY_PRIVATE_ROOT env is refused', async () => {
    const host = makeHost({ container: goodContainer({ env: ['HOST_NAME=dev', 'PORT=51720'] }) })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no safe, normalized non-root private root/)
  })

  test('a one-sided bind (source != destination) for the private root is refused as unsafe', async () => {
    const host = makeHost({
      container: goodContainer({
        mounts: [{ Type: 'bind', Source: '/some/other/host/path', Destination: SAFE_ROOT }]
      })
    })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /same-source\/destination bind|unsafe mount/)
    assert.equal(migrateCall(host), undefined)
  })

  test('no bind at all for the private root is refused', async () => {
    const host = makeHost({
      container: goodContainer({
        mounts: [{ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }]
      })
    })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /same-source\/destination bind|unsafe mount/)
  })

  // ── in-container preflight (real node against a real root) ──────────────────────────────────────────

  test('preflight: a private root missing inside the container is refused', async () => {
    const host = makeHost()
    rmSync(host.privateRoot, { recursive: true, force: true })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not present inside the container/)
    assert.equal(migrateCall(host), undefined)
  })

  test('preflight: a private root that is a plain file (not a directory) is refused', async () => {
    const host = makeHost()
    rmSync(host.privateRoot, { recursive: true, force: true })
    writeFileSync(host.privateRoot, 'not a dir\n')
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not a directory inside the container/)
    assert.equal(migrateCall(host), undefined)
  })

  test('preflight: a private root that is a symlink is refused', async () => {
    const host = makeHost()
    const target = path.join(host.base, 'real-target')
    mkdirSync(target)
    rmSync(host.privateRoot, { recursive: true, force: true })
    symlinkSync(target, host.privateRoot)
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /symlink inside the container/)
    assert.equal(migrateCall(host), undefined)
  })

  test('preflight: a runtime root that disagrees with the inspected root is refused', async () => {
    const host = makeHost({ containerEnvRoot: '/srv/some-other-root' })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /disagrees with its inspected root/)
    assert.equal(migrateCall(host), undefined)
  })

  // ── digest / stale source ──────────────────────────────────────────────────────────────────────────

  for (const name of SCRIPTS) {
    test(`a stale installed ${name} (digest != checkout) is refused, migration never invoked`, async () => {
      const host = makeHost({ tamperInstalled: name })
      const r = await run(['--selector', SELECTOR], host)
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /do not match this checkout|stale source/)
      assert.equal(migrateCall(host), undefined)
    })
  }

  // ── arguments ───────────────────────────────────────────────────────────────────────────────────

  test('a missing --selector is refused before any docker call', async () => {
    const host = makeHost()
    const r = await run([], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /--selector/)
    assert.equal(readFileSync(host.logPath, 'utf8'), '', 'no docker call is made without a selector')
  })

  test('an unsupported option is refused without echoing its value', async () => {
    const host = makeHost()
    const r = await run(['--selector', SELECTOR, '--secret=oops'], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /unsupported option/)
    assert.doesNotMatch(r.stderr, /oops/)
  })

  // ── failure propagation ──────────────────────────────────────────────────────────────────────────

  test('a non-zero from the in-container migration fails the wrapper (job fails), exit passed through', async () => {
    const host = makeHost({ execFails: true })
    const r = await run(['--selector', SELECTOR, '--apply'], host)
    assert.notEqual(r.status, 0)
    assert.ok(migrateCall(host), 'the migration was still invoked under timeout')
  })

  // ── bounded execution (GNU timeout) ────────────────────────────────────────────────────────────────

  test('the migration is wrapped in GNU timeout: TERM first, a bounded SIGKILL grace, a fixed bound', async () => {
    const host = makeHost({ execFails: false })
    const r = await run(['--selector', SELECTOR], host)
    assert.equal(r.status, 0, r.stderr)
    const mc = migrateCall(host)
    assert.equal(mc[2], 'timeout', 'the wrapped command runs under timeout')
    const grace = mc.find((a) => a.startsWith('--kill-after='))
    assert.match(grace, /^--kill-after=\d+[smh]?$/, 'a bounded SIGKILL grace after TERM')
    assert.ok(mc.includes('--signal=TERM'), 'TERM is sent first, before the KILL grace')
  })

  test('GNU timeout missing inside the container is refused, never run unbounded', async () => {
    const host = makeHost({ noTimeout: true })
    const r = await run(['--selector', SELECTOR], host)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /GNU timeout is not available/)
    assert.equal(migrateCall(host), undefined, 'the migration is not invoked without a deadline')
  })

  test('a timeout deadline (124) inside the container fails the wrapper', async () => {
    const host = makeHost({ timeoutExpires: true })
    const r = await run(['--selector', SELECTOR, '--apply'], host)
    assert.notEqual(r.status, 0)
    assert.ok(migrateCall(host), 'the migration was invoked and hit its deadline')
  })

  test('a hard SIGKILL after the grace (137) inside the container fails the wrapper', async () => {
    const host = makeHost({ timeoutExpires: 'kill' })
    const r = await run(['--selector', SELECTOR, '--apply'], host)
    assert.notEqual(r.status, 0)
  })
})
