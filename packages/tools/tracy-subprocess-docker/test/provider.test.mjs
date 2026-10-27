/**
 * The provider is a thin rewrite over LocalSubprocessRuntime: this pins WHAT it rewrites — argv,
 * cwd, env — by capturing the spec it hands to the local runtime. No Docker, no dsh boot.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/provider.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn as spawnProcess } from 'node:child_process'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { DockerSandbox } from '@tracy/dsh-sandbox-docker'
import { MARKER } from '@tracy/dsh-sandbox-docker/stamp'

import {
  DockerSubprocessRuntime,
  REAPER_GRACE_SECONDS,
  REAPER_RETRY_DELAY_MS,
  assertSandboxPairing
} from '../index.js'
import {
  APP_NEXT_ANY_CMS,
  EMDASH_APP_NEXT,
  EXEC_ID,
  EXEC_ID_VAR,
  FS_TOOL_ARGS,
  REAPER_NOTHING_FOUND,
  URL_PATH_ARGS,
  resolveDockerHost,
  resolveSitesRoot,
  workdirDecision,
  blankedSecretFlags,
  READ_ONLY_SHELL_REFUSAL
} from '../src/route.mjs'

function provider(cfg) {
  // Skip the cordis constructor: the seam registration needs a live Context; the rewrite does not.
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = {
    docker: 'docker',
    sitesRoot: '/site',
    containerRoot: '/site',
    containerName: '{label}-web-1',
    ...cfg
  }
  return p
}

/**
 * Replace one method of the local runtime for the length of one test. A stub left behind would
 * decide the next test's result, so the original is put back when the test ends.
 * @param {import('node:test').TestContext} t - the running test.
 * @param {'spawn' | 'spawnTerminal'} method - the method to stub.
 * @param {Function} stub - what to call instead.
 */
function stubLocal(t, method, stub) {
  const original = LocalSubprocessRuntime.prototype[method]
  LocalSubprocessRuntime.prototype[method] = stub
  t.after(() => {
    LocalSubprocessRuntime.prototype[method] = original
  })
}

/**
 * Take the reaper marker off an argv so the rest can be compared literally. The id is a fresh
 * uuid per spawn, so an exact deepEqual on the whole argv would pin randomness; what is pinned
 * instead is that the pair is there, is `-e`-shaped, is a legal id, and is the LAST `-e` — the
 * position that makes a caller's own entry of the same name unable to displace it.
 * @param {readonly string[]} argv
 * @returns {{ argv: string[], execId: string }}
 */
function takeMarker(argv) {
  const index = argv.findIndex((token) => token.startsWith(`${EXEC_ID_VAR}=`))
  assert.ok(index > 0, `no ${EXEC_ID_VAR} in ${JSON.stringify(argv)}`)
  assert.equal(argv[index - 1], '-e')
  const execId = argv[index].slice(EXEC_ID_VAR.length + 1)
  assert.match(execId, EXEC_ID)
  assert.notEqual(argv[index + 1], '-e', 'the marker must be the last -e flag')
  return { argv: [...argv.slice(0, index - 1), ...argv.slice(index + 1)], execId }
}

/**
 * A stand-in for the local runtime's handle: enough of one to be patched and called. Its `done`
 * never settles — the command is still running — because a settled `done` is itself a sweep.
 */
function fakeHandle(order) {
  return {
    done: new Promise(() => {}),
    terminate() {
      order.push('terminate')
    }
  }
}

test('spawn: stamped argv → docker exec as the mode user, cwd moved off the site tree, env passed as -e', (t) => {
  const p = provider({})
  let seen
  stubLocal(t, 'spawn', function capture(spec) {
    seen = spec
    return fakeHandle([])
  })
  p.spawn({
    argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'bash', '-c', 'ls'],
    cwd: '/site/wpdemo/.webroot',
    env: { DSH_SESSION_ID: 's1' },
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 1000
  })
  assert.deepEqual(takeMarker(seen.argv).argv, [
    'docker',
    'exec',
    '-i',
    '-u',
    'www-data',
    '-w',
    '/site/wpdemo/.webroot',
    '-e',
    'DSH_SESSION_ID=s1',
    ...blankedSecretFlags('workspace-write'),
    'wpdemo-web-1',
    'bash',
    '-c',
    'ls'
  ])
  assert.equal(seen.cwd, tmpdir())
  assert.equal(seen.env.DSH_SESSION_ID, undefined, 'the docker CLI must not receive the command env')
  assert.equal(seen.graceMs, 1000)
})

test('spawn: dockerHost reaches the docker CLI as DOCKER_HOST', (t) => {
  const p = provider({ dockerHost: 'ssh://root@203.0.113.10' })
  let seen
  stubLocal(t, 'spawn', function capture(spec) {
    seen = spec
    return fakeHandle([])
  })
  p.spawn({
    argv: ['true'],
    cwd: '/site/wpdemo',
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 1
  })
  assert.equal(seen.env.DOCKER_HOST, 'ssh://root@203.0.113.10')
})

test('spawn: a cwd outside the sites root throws before anything is spawned', (t) => {
  const p = provider({})
  let called = false
  stubLocal(t, 'spawn', function capture() {
    called = true
  })
  assert.throws(
    () =>
      p.spawn({
        argv: ['id'],
        cwd: '/desk-home',
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 1
      }),
    /outside \/site/
  )
  assert.equal(called, false)
})

test('spawnTerminal: -it, same routing', async (t) => {
  const p = provider({})
  let seen
  stubLocal(t, 'spawnTerminal', async function capture(spec) {
    seen = spec
    return fakeHandle([])
  })
  await p.spawnTerminal({ argv: ['bash', '-l'], cwd: '/site/wpdemo', rows: 24, cols: 80, graceMs: 1 })
  assert.deepEqual(takeMarker(seen.argv).argv, [
    'docker',
    'exec',
    '-it',
    '-u',
    'www-data',
    '-w',
    '/site/wpdemo',
    ...blankedSecretFlags(null),
    'wpdemo-web-1',
    'bash',
    '-l'
  ])
  assert.equal(seen.rows, 24)
})

/** dsh's packaged ripgrep, at the path measured in the fleet image. */
const HARNESS_RG =
  '/opt/dsh/node_modules/.pnpm/@vscode+ripgrep-linux-arm64@1.18.0/node_modules/@vscode/ripgrep-linux-arm64/bin/rg'

const PIPED = { stdin: 'ignore', stdout: { maxBytes: 1000 }, stderr: { maxBytes: 1000 } }

test('spawn: dsh grep ripgrep runs in the dsh process — same cwd, no docker, nothing to reap', async (t) => {
  // No web container has this binary: through docker exec every grep and glob came back `exit 127`.
  const p = provider({})
  const reaped = []
  p.reap = (target) => reaped.push(target)
  const handle = fakeHandle([])
  let seen
  stubLocal(t, 'spawn', (spec) => {
    seen = spec
    return handle
  })
  const argv = [HARNESS_RG, '--no-config', '--json', '--regexp=DB_NAME', '--glob=*.php', '--', '.webroot']
  const signal = new AbortController().signal
  const returned = p.spawn({ argv, cwd: '/site/wpdemo', stdio: PIPED, graceMs: 3000, signal })
  assert.equal(returned, handle, "the local runtime's own handle, unwrapped")
  assert.deepEqual(seen.argv, argv)
  assert.equal(seen.cwd, '/site/wpdemo', '/site/<label> is the same path inside tracy-dsh')
  assert.equal(seen.graceMs, 3000)
  assert.equal(seen.signal, signal, 'the tool timeout still terminates the search')
  assert.deepEqual(seen.stdio, PIPED)
  // A tombstone, so a harness RIPGREP_CONFIG_PATH cannot add flags behind the checked argv.
  assert.ok('RIPGREP_CONFIG_PATH' in seen.env)
  assert.equal(seen.env.RIPGREP_CONFIG_PATH, undefined)
  returned.terminate()
  await tick()
  assert.deepEqual(reaped, [], 'nothing ran in a container, so no sweep goes in')
})

test('spawn: a ripgrep argv that breaks a harness rule is refused before anything runs', (t) => {
  const p = provider({})
  let called = false
  stubLocal(t, 'spawn', () => {
    called = true
  })
  const run =
    (argv, cwd = '/site/wpdemo') =>
    () =>
      p.spawn({ argv, cwd, stdio: PIPED, graceMs: 1 })
  assert.throws(run([HARNESS_RG, '--pre=/bin/sh', '--regexp=x']), /is not one Tracy's grep or glob builds/)
  assert.throws(
    run([HARNESS_RG, '--json', '--regexp=x', '--', '/desk-home']),
    /is outside the session's site/
  )
  assert.throws(run([HARNESS_RG, '--json', '--regexp=x'], '/desk-home'), /outside \/site/)
  // A stamp's root is checked on this path as on the container one.
  assert.throws(
    run(
      [MARKER, '--mode', 'read-only', '--root', '/site/wpdemo', '--', HARNESS_RG, '--json', '--regexp=x'],
      '/site/fijitrips'
    ),
    /belongs to another site than the session's workspace/
  )
  assert.equal(called, false)
})

test("spawn: a ripgrep inside the site tree is the customer's, and still runs in the container", (t) => {
  const p = provider({})
  let seen
  stubLocal(t, 'spawn', (spec) => {
    seen = spec
    return fakeHandle([])
  })
  const vendored = '/site/wpdemo/node_modules/@vscode/ripgrep/bin/rg'
  p.spawn({ argv: [vendored, '--pre=sh'], cwd: '/site/wpdemo', stdio: PIPED, graceMs: 1 })
  const { argv } = takeMarker(seen.argv)
  assert.equal(argv[0], 'docker')
  assert.deepEqual(argv.slice(-3), ['wpdemo-web-1', vendored, '--pre=sh'])
})

test('resolveExecutable: answered by the container at spawn, so it passes the name through', async () => {
  assert.equal(await provider({}).resolveExecutable('php'), 'php')
})

test('resolveSitesRoot: config, else TRACY_SITES_ROOT, else the fleet root — the constructor calls this', () => {
  assert.equal(resolveSitesRoot({ sitesRoot: '/site' }, { TRACY_SITES_ROOT: '/elsewhere/sites' }), '/site')
  assert.equal(resolveSitesRoot({}, { TRACY_SITES_ROOT: '/elsewhere/sites' }), '/elsewhere/sites')
  assert.equal(resolveSitesRoot(undefined, {}), '/site')
  assert.throws(() => resolveSitesRoot({ sitesRoot: 'sites' }, {}), /must be an absolute path/)
})

test('resolveDockerHost: config, else TRACY_DOCKER_HOST, else undefined so the tombstone stands', () => {
  // undefined, not '': `cliEnv()` reads an undefined value as "remove DOCKER_HOST from the child",
  // which is what keeps a stray variable on the harness host from choosing the daemon. An empty
  // string would instead be handed to the CLI as a host, and every command would fail on it —
  // which is exactly what an unset variable in a compose file expands to.
  assert.equal(
    resolveDockerHost({ dockerHost: 'ssh://root@fleet' }, { TRACY_DOCKER_HOST: 'tcp://proxy:2375' }),
    'ssh://root@fleet'
  )
  assert.equal(
    resolveDockerHost({}, { TRACY_DOCKER_HOST: 'tcp://docker-proxy:2375' }),
    'tcp://docker-proxy:2375'
  )
  assert.equal(resolveDockerHost(undefined, {}), undefined)
  assert.equal(resolveDockerHost({}, { TRACY_DOCKER_HOST: '  ' }), undefined)
  // And the value the constructor resolves is the one the CLI env carries.
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = { dockerHost: resolveDockerHost({}, { TRACY_DOCKER_HOST: 'tcp://docker-proxy:2375' }) }
  assert.equal(DockerSubprocessRuntime.prototype.cliEnv.call(p).DOCKER_HOST, 'tcp://docker-proxy:2375')
  p.cfg = { dockerHost: resolveDockerHost({}, {}) }
  assert.equal(DockerSubprocessRuntime.prototype.cliEnv.call(p).DOCKER_HOST, undefined)
})

test('spawn: a stamped call whose cwd names another site is refused before anything is spawned', (t) => {
  const p = provider({})
  let called = false
  stubLocal(t, 'spawn', function capture() {
    called = true
  })
  assert.throws(
    () =>
      p.spawn({
        // tool-bash hands the seam the model's `workdir` as the cwd; the stamp carries the root
        // the seat door actually granted.
        argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'bash', '-c', 'id'],
        cwd: '/site/fijitrips',
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 1
      }),
    /belongs to another site than the session's workspace/
  )
  assert.equal(called, false)
})

test('spawnTerminal: the stamped root is checked there too', async (t) => {
  const p = provider({})
  let called = false
  stubLocal(t, 'spawnTerminal', async function capture() {
    called = true
    return {}
  })
  await assert.rejects(
    () =>
      p.spawnTerminal({
        argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'bash', '-l'],
        cwd: '/site/fijitrips',
        rows: 24,
        cols: 80,
        graceMs: 1
      }),
    /belongs to another site than the session's workspace/
  )
  assert.equal(called, false)
})

/**
 * The pre-execute guard. `danger-full-access` never reaches confine(), so no stamp reaches
 * execArgv and the root check has nothing to compare — this listener is that mode's only fence.
 * A fake Context records what the constructor registers; no cordis, no dsh boot.
 */
function fakeContext() {
  const listeners = []
  return {
    listeners,
    // A live cordis Context is not needed to hold the seam's identity; the prototype is.
    sandbox: Object.create(DockerSandbox.prototype),
    on(event, listener) {
      listeners.push({ event, listener })
      return () => {}
    }
  }
}

/** Build a provider on the fake Context, skipping the Service base's own registration. */
function guarded() {
  const ctx = fakeContext()
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = { docker: 'docker', sitesRoot: '/site', containerRoot: '/site', containerName: '{label}-web-1' }
  DockerSubprocessRuntime.prototype.registerWorkdirGuard.call(p, ctx)
  const entry = ctx.listeners.find((l) => l.event === 'tools/pre-execute')
  assert.ok(entry, 'the provider must register a tools/pre-execute listener')
  return entry.listener
}

test('pre-execute: a bash call whose workdir names another site is denied before dispatch', async () => {
  const listener = guarded()
  let delegated = false
  const decision = await listener(
    {
      name: 'bash',
      arguments: { command: 'id', workdir: '/site/fijitrips' },
      agent: { session: { header: { cwd: '/site/wpdemo' } } }
    },
    async () => {
      delegated = true
      return { kind: 'allow' }
    }
  )
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /belongs to another site than the session's workspace/)
  assert.equal(delegated, false, 'a denied call must not reach the rest of the waterfall')
})

test('pre-execute: an in-site call delegates to next()', async () => {
  const listener = guarded()
  let delegated = false
  const decision = await listener(
    {
      name: 'bash',
      arguments: { command: 'id', workdir: '/site/wpdemo/.webroot' },
      agent: { session: { header: { cwd: '/site/wpdemo' } } }
    },
    async () => {
      delegated = true
      return { kind: 'allow' }
    }
  )
  assert.equal(delegated, true)
  assert.equal(decision.kind, 'allow')
})

test('pre-execute: an agentless call with an absolute workdir is denied, never crashed on', async () => {
  const listener = guarded()
  const decision = await listener(
    { name: 'bash', arguments: { command: 'id', workdir: '/site/wpdemo' } },
    async () => ({ kind: 'allow' })
  )
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /no session workspace/)
})

test('pre-execute: a siteOf throw becomes a deny, not an exception out of the waterfall', async () => {
  const listener = guarded()
  const decision = await listener(
    {
      name: 'terminal_open',
      arguments: { type: 'shell', cwd: '/etc' },
      agent: { session: { header: { cwd: '/site/wpdemo' } } }
    },
    async () => ({ kind: 'allow' })
  )
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /outside \/site/)
})

test('pre-execute: a tool without a working-directory argument passes straight through', async () => {
  const listener = guarded()
  let delegated = false
  await listener({ name: 'read', arguments: { path: '/site/fijitrips/x' } }, async () => {
    delegated = true
    return { kind: 'allow' }
  })
  assert.equal(delegated, true)
})

test('assertSandboxPairing: the docker sandbox passes, anything else is a boot error', () => {
  assert.equal(assertSandboxPairing(Object.create(DockerSandbox.prototype)), undefined)
  class LocalSandbox {}
  assert.throws(() => assertSandboxPairing(new LocalSandbox()), /must be @tracy\/dsh-sandbox-docker/)
  assert.throws(() => assertSandboxPairing(new LocalSandbox()), /found LocalSandbox/)
  assert.throws(() => assertSandboxPairing(undefined), /found undefined/)
})

test('neither path lets an ambient DOCKER_* reach the CLI', () => {
  // The seam merges a spec's env OVER `scrubbedParentEnv()`, and that scrub is
  // /KEY|PASSWORD|SECRET|TOKEN/i — it matches no DOCKER_* name. So "leave the key out" is not a
  // tombstone here, it is inheritance. Both paths are checked against a parent that HAS all four.
  const ambient = {
    DOCKER_HOST: 'tcp://attacker:2375',
    DOCKER_CONTEXT: 'somewhere-else',
    DOCKER_TLS_VERIFY: '1',
    DOCKER_CERT_PATH: '/tmp/certs',
    PATH: '/usr/bin'
  }
  const p = provider({ dockerHost: 'tcp://docker-proxy:2375' })

  // Pipe path: `child_process` drops a key whose value is undefined, so the tombstones must be
  // PRESENT and undefined — and the merge must leave nothing of the parent's behind.
  const piped = { ...ambient, ...p.cliEnv() }
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
    assert.equal(piped[key], undefined, `${key} must not survive into the pipe path`)
  }
  assert.equal(piped.DOCKER_HOST, 'tcp://docker-proxy:2375')

  // Terminal path: node-pty writes `KEY=value` strings, so every value must be a string, and an
  // empty one is what the docker CLI reads as "unset" (measured: docker 29.4.1).
  const terminal = { ...ambient, ...p.terminalCliEnv() }
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
    assert.equal(terminal[key], '', `${key} must be erased, not inherited, on the terminal path`)
  }
  assert.equal(terminal.DOCKER_HOST, 'tcp://docker-proxy:2375')
  for (const value of Object.values(p.terminalCliEnv())) assert.equal(typeof value, 'string')
  assert.equal(terminal.PATH, '/usr/bin', 'the rest of the parent environment is untouched')
})

test('terminalCliEnv: with no configured daemon the host is empty, never the word "undefined"', () => {
  // `DOCKER_HOST=undefined` is what killed the terminal on 06/09: node-pty sent the four letters
  // and the CLI looked for `undefined/ca.pem`.
  const plain = provider({}).terminalCliEnv()
  assert.deepEqual(plain, {
    DOCKER_HOST: '',
    DOCKER_CONTEXT: '',
    DOCKER_TLS_VERIFY: '',
    DOCKER_CERT_PATH: ''
  })
  for (const value of Object.values(plain)) assert.notEqual(value, 'undefined')
})

test('cliEnv: the ambient DOCKER_* entries are tombstoned so no shell picks the daemon', () => {
  // The seam treats an `undefined` value as a tombstone that removes an ambient entry, so these
  // keys must be PRESENT with an undefined value, not simply absent.
  const plain = provider({}).cliEnv()
  assert.deepEqual(Object.keys(plain).sort(), [
    'DOCKER_CERT_PATH',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
    'DOCKER_TLS_VERIFY'
  ])
  for (const key of Object.keys(plain)) assert.equal(plain[key], undefined)

  const remote = provider({ dockerHost: 'ssh://root@203.0.113.10' }).cliEnv()
  assert.equal(remote.DOCKER_HOST, 'ssh://root@203.0.113.10')
  assert.equal(remote.DOCKER_CONTEXT, undefined)
  assert.ok('DOCKER_CONTEXT' in remote, 'the tombstone must survive a configured dockerHost')
  assert.equal(remote.DOCKER_TLS_VERIFY, undefined)
  assert.equal(remote.DOCKER_CERT_PATH, undefined)
})

test('resolveExecutable: an already-aborted signal throws instead of answering', async () => {
  const p = provider({})
  await assert.rejects(() => p.resolveExecutable('php', {}, AbortSignal.abort()), /abort/i)
  assert.equal(await p.resolveExecutable('php', {}, new AbortController().signal), 'php')
})

/**
 * The reaper's wiring — what runs, in what order, and how often. The reaping itself (a docker
 * exec) is stubbed out: `reap()` is the seam between this pure wiring and the CLI.
 */
function reaping(t, method, spec) {
  const p = provider({})
  const order = []
  const targets = []
  p.reap = (target) => {
    order.push('reap')
    targets.push(target)
  }
  const handle = fakeHandle(order)
  stubLocal(t, method, method === 'spawn' ? () => handle : async () => handle)
  return { p, handle, order, targets, spec }
}

/** Let the sweep's microtask run: `attachReaper` defers the decision by design. */
const tick = () => new Promise((resolve) => setImmediate(resolve))

const SPAWN_SPEC = {
  argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'sleep', '300'],
  cwd: '/site/wpdemo',
  stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  graceMs: 1000
}

test('spawn: terminate() sweeps the container, as the user and in the container the spawn used', async (t) => {
  const { p, order, targets } = reaping(t, 'spawn')
  const handle = p.spawn(SPAWN_SPEC)
  await tick()
  assert.deepEqual(order, [], 'nothing is reaped while the command is still running')
  handle.terminate()
  // The sweep lands one microtask after the local termination — that slack is what lets a clean
  // exit cancel it. Killing the harness-side CLI first is harmless: it is what orphans the
  // container-side process in the first place, and the marker is still on it.
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'])
  assert.equal(targets[0].container, 'wpdemo-web-1')
  assert.equal(targets[0].user, 'www-data', 'the reaper must be the user that owns the processes')
  assert.match(targets[0].execId, EXEC_ID)
})

test('spawn: the reaper target carries the same exec id the container was tagged with', async (t) => {
  const p = provider({})
  const reaped = []
  p.reap = (target) => reaped.push(target)
  let seen
  stubLocal(t, 'spawn', (spawnSpec) => {
    seen = spawnSpec
    return fakeHandle([])
  })
  p.spawn(SPAWN_SPEC).terminate()
  await tick()
  assert.equal(reaped[0].execId, takeMarker(seen.argv).execId)
})

test('spawn: an aborted spec reaps too — the tool TIMEOUT never calls the handle', async (t) => {
  // The local runtime subscribes to the spec's signal internally and calls its own terminate, not
  // the handle's, so a wrapper on terminate() alone would miss exactly the measured case: a
  // timed-out `sleep 300` left running in the container.
  const { p, order } = reaping(t, 'spawn')
  const abort = new AbortController()
  p.spawn({ ...SPAWN_SPEC, signal: abort.signal })
  abort.abort()
  await tick()
  assert.deepEqual(order, ['reap'])
})

test('spawn: the reaper runs once per spawn, however many times termination is asked for', async (t) => {
  const { p, order } = reaping(t, 'spawn')
  const abort = new AbortController()
  const handle = p.spawn({ ...SPAWN_SPEC, signal: abort.signal })
  abort.abort()
  handle.terminate()
  handle.terminate()
  await tick()
  // One sweep, however many terminations: the abort armed it, the two terminate() calls only
  // reach the local runtime.
  assert.deepEqual(order, ['terminate', 'terminate', 'reap'])
})

test('spawnTerminal: the terminal handle is reaped too — a closed tab must not leave bash -l', async (t) => {
  const { p, order, targets } = reaping(t, 'spawnTerminal')
  const handle = await p.spawnTerminal({
    argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'bash', '-l'],
    cwd: '/site/wpdemo',
    rows: 24,
    cols: 80,
    graceMs: 1000
  })
  handle.terminate()
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'])
  assert.equal(targets[0].container, 'wpdemo-web-1')
})

test('spawnTerminal: the runtime patches the handle IT keeps, so disposal reaps as well', async (t) => {
  // The local runtime holds its own reference in `terminals` and calls terminate() on it at
  // teardown. A wrapper object handed back to the caller would leave that path unreaped.
  const { p, handle, order } = reaping(t, 'spawnTerminal')
  const returned = await p.spawnTerminal({
    argv: ['bash', '-l'],
    cwd: '/site/wpdemo',
    rows: 24,
    cols: 80,
    graceMs: 1000
  })
  assert.equal(returned, handle, 'the same object the runtime kept')
  handle.terminate()
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'])
})

test('reap: a docker CLI that cannot even start is logged, never thrown at the caller', async (t) => {
  const p = provider({ docker: '/nonexistent/docker-binary' })
  const warned = []
  p.ctx = { logger: { warn: (message) => warned.push(message) } }
  const handle = fakeHandle([])
  stubLocal(t, 'spawn', () => handle)
  const spawned = p.spawn(SPAWN_SPEC)
  assert.doesNotThrow(() => spawned.terminate())
  // The failure is asynchronous (ENOENT on the child), so the assertion is that terminate()
  // returned; the log line is awaited as an event.
  await until(() => warned.length > 0, 'the spawn failure to be logged')
  assert.equal(warned.length, 1)
  assert.match(warned[0], /reaping .* in wpdemo-web-1 failed/)
})

test('reaperEnv: the CLI tombstones become deletes, so the reaper cannot land on another daemon', () => {
  const p = provider({ dockerHost: 'tcp://docker-proxy:2375' })
  const before = process.env.DOCKER_CONTEXT
  process.env.DOCKER_CONTEXT = 'colima'
  try {
    const env = p.reaperEnv()
    assert.equal(env.DOCKER_HOST, 'tcp://docker-proxy:2375')
    assert.equal('DOCKER_CONTEXT' in env, false, 'a tombstone must be absent, not undefined')
  } finally {
    if (before === undefined) delete process.env.DOCKER_CONTEXT
    else process.env.DOCKER_CONTEXT = before
  }
})

test('REAPER_GRACE_SECONDS: whole seconds, because the script spells it into `sleep`', () => {
  assert.ok(Number.isInteger(REAPER_GRACE_SECONDS) && REAPER_GRACE_SECONDS > 0)
})

test('reap: a command that exits CLEANLY is swept as it closes — a backgrounded child must not outlive it', async (t) => {
  // REGRESSION (09/10/2026). A clean exit used to cancel the sweep, so
  // `sh -c 'while :; do ln -sfn /site/victim x; ln -sfn inside x; done' &` kept running after the
  // tool call returned and could swap a link between the fence's realpath and dsh's own open. The
  // local runtime never calls terminate() on a settled command, so nothing but `done` can trigger it.
  const p = provider({})
  const order = []
  const asked = []
  p.reap = (target, options) => {
    order.push('reap')
    asked.push(options)
  }
  const handle = fakeHandle(order)
  handle.done = Promise.resolve({ exitCode: 0, signal: null })
  stubLocal(t, 'spawn', () => handle)
  p.spawn(SPAWN_SPEC)
  await tick()
  assert.deepEqual(order, ['reap'], 'a clean exit is swept without anyone calling terminate()')
  assert.equal(asked[0].retry, false, 'a command that reported an exit has certainly started: no retry')
})

test('reap: a command whose done REJECTS is swept too', async (t) => {
  const p = provider({})
  const order = []
  p.reap = () => order.push('reap')
  const handle = fakeHandle(order)
  handle.done = Promise.reject(new Error('spawn failed'))
  handle.done.catch(() => {})
  stubLocal(t, 'spawn', () => handle)
  p.spawn(SPAWN_SPEC)
  await tick()
  assert.deepEqual(order, ['reap'])
})

test('reap: the exit sweep never holds the result — done settles with the same outcome, at once', async (t) => {
  // A real reap() against a docker that hangs for 10s: the caller's `done` must not wait on it.
  const docker = await fakeDocker(t, 'exec sleep 10')
  const p = provider({ docker })
  const outcome = { exitCode: 0, signal: null }
  const handle = fakeHandle([])
  handle.done = Promise.resolve(outcome)
  stubLocal(t, 'spawn', () => handle)
  const started = performance.now()
  const spawned = p.spawn(SPAWN_SPEC)
  assert.equal(await spawned.done, outcome)
  assert.ok(performance.now() - started < 1000, 'the result waited on the sweep')
})

test('reap: a signal-killed exit is NOT clean, so it still sweeps', async (t) => {
  const { p, order } = reaping(t, 'spawn')
  const handle = fakeHandle(order)
  // exitCode null + a signal is the shape of "we terminated it" — exactly when an orphan is likely.
  handle.done = Promise.resolve({ exitCode: null, signal: 'SIGTERM' })
  stubLocal(t, 'spawn', () => handle)
  p.spawn(SPAWN_SPEC).terminate()
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'])
})

test('reap: a termination inside the retry window asks for one retry, a later one does not', async (t) => {
  const { p, order } = reaping(t, 'spawn')
  const asked = []
  p.reap = (target, options) => {
    order.push('reap')
    asked.push(options)
  }
  p.spawn(SPAWN_SPEC).terminate()
  await tick()
  assert.equal(asked[0].retry, true, 'terminated immediately: the exec may not exist yet')

  // The same call a minute later cannot be racing the daemon's exec start.
  mock.timers.enable({ apis: ['Date'] })
  t.after(() => mock.timers.reset())
  const handle = p.spawn(SPAWN_SPEC)
  mock.timers.tick(REAPER_RETRY_DELAY_MS * 60)
  handle.terminate()
  await tick()
  assert.equal(asked[1].retry, false)
})

/**
 * Yield to the event loop until `done()` holds. It uses `setImmediate`, never a timer, so it keeps
 * working while `mock.timers` has replaced `setTimeout` — and it waits on the condition, not on a
 * guess of how long a shell takes to spawn on a loaded machine.
 * @param {() => boolean | Promise<boolean>} done - the condition.
 * @param {string} what - named in the failure.
 * @returns {Promise<void>}
 */
async function until(done, what) {
  const started = performance.now()
  while (performance.now() - started < 10_000) {
    if (await done()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error(`gave up waiting for ${what}`)
}

/**
 * Count the sweeps a provider is asked for. A retry is scheduled on the (mocked) clock and calls
 * `reap` synchronously when that clock ticks, so the count is exact the moment the tick returns.
 * @param {{ reap: Function }} p - the provider.
 * @returns {{ readonly count: number }}
 */
function countReaps(p) {
  const real = p.reap.bind(p)
  const seen = { count: 0 }
  p.reap = (...args) => {
    seen.count += 1
    return real(...args)
  }
  return seen
}

/**
 * A fake docker that logs one line per sweep, then exits with `code`, and leaves its pid behind so
 * a test can tell when a sweep has FULLY ended (the pid is gone and node has seen it exit).
 * @param {import('node:test').TestContext} t - the running test.
 * @param {number} code - the sweep's exit code.
 * @returns {Promise<{ docker: string, sweeps: () => Promise<string[]>, ended: () => Promise<void> }>}
 */
async function sweepingDocker(t, code) {
  const dir = await mkdtemp(join(tmpdir(), 'tracy-reap-'))
  const log = join(dir, 'sweeps')
  const pidFile = join(dir, 'pid')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const docker = await fakeDocker(t, `echo $$ > ${pidFile}\necho swept >> ${log}\nexit ${code}`)
  const sweeps = async () => (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean)
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const ended = async () => {
    await until(async () => (await sweeps()).length > 0, 'the first sweep to run')
    const pid = Number((await readFile(pidFile, 'utf8')).trim())
    await until(() => !alive(pid), 'the sweep process to exit')
    await tick() // node dispatches the child's 'exit' on the turn after the OS reports it
  }
  return { docker, sweeps, ended }
}

/**
 * A fake `docker` on disk, so `reap()` can be exercised for real — argv, spawn, timers — without a
 * daemon. `body` is the shell body; the script ignores the reaper's arguments entirely.
 * @param {import('node:test').TestContext} t - the running test, for cleanup.
 * @param {string} body - shell to run instead of docker.
 * @returns {Promise<string>} the executable's path.
 */
async function fakeDocker(t, body) {
  const dir = await mkdtemp(join(tmpdir(), 'tracy-reap-'))
  const file = join(dir, 'docker')
  await writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  t.after(() => rm(dir, { recursive: true, force: true }))
  return file
}

test('reap: a sweep that never returns must not hold the harness open', async (t) => {
  // REGRESSION. `child_process`'s own `timeout` option keeps an internal REF'D timer, so
  // `detached` + `unref()` did NOT decouple the reaper: measured by review, a hung docker CLI
  // pinned the process for the whole 8s bound. Every timer here must be ours and unref'd.
  const docker = await fakeDocker(t, 'exec sleep 10')
  const runner = `
    const { DockerSubprocessRuntime } = await import(${JSON.stringify(pathToFileURL(new URL('../index.js', import.meta.url).pathname).href)})
    const p = Object.create(DockerSubprocessRuntime.prototype)
    p.cfg = { docker: ${JSON.stringify(docker)}, sitesRoot: '/site', containerRoot: '/site', containerName: '{label}-web-1' }
    p.reap({ execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user: 'www-data', container: 'wpdemo-web-1' })
  `
  const started = Date.now()
  const node = spawnProcess(process.execPath, ['--input-type=module', '-e', runner], { stdio: 'ignore' })
  const code = await new Promise((resolve) => node.on('exit', resolve))
  const elapsed = Date.now() - started
  assert.equal(code, 0)
  // The fake sweep runs for 10s and the bound is 8s; anything above a couple of seconds means a
  // ref'd timer or a live child handle is keeping the loop alive.
  assert.ok(elapsed < 5000, `the harness was held open for ${elapsed}ms after reap()`)
})

test('reap: a sweep that finds nothing right after the spawn is asked once more', async (t) => {
  // The race the retry exists for: `docker exec` is a create-then-start round trip, so a spawn
  // terminated within a millisecond can be swept before its process exists in /proc.
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  const { docker, sweeps, ended } = await sweepingDocker(t, REAPER_NOTHING_FOUND)
  const p = provider({ docker })
  const reaps = countReaps(p)
  p.reap(
    { execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user: 'www-data', container: 'wpdemo-web-1' },
    { retry: true }
  )
  await ended()
  mock.timers.tick(REAPER_RETRY_DELAY_MS - 1)
  assert.equal(reaps.count, 1, 'the retry waits out its delay')
  mock.timers.tick(1)
  assert.equal(reaps.count, 2)
  await until(async () => (await sweeps()).length >= 2, 'the retry sweep')
  await ended()
  mock.timers.tick(REAPER_RETRY_DELAY_MS * 10)
  // Two, and only two: the retry takes the default `retry: false`, so it cannot become a loop.
  assert.equal(reaps.count, 2)
  assert.deepEqual(await sweeps(), ['swept', 'swept'])
})

test('reap: a sweep that finds nothing long after the spawn is left alone', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  const { docker, sweeps, ended } = await sweepingDocker(t, REAPER_NOTHING_FOUND)
  const p = provider({ docker })
  const reaps = countReaps(p)
  p.reap({ execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user: 'www-data', container: 'wpdemo-web-1' })
  await ended()
  assert.deepEqual(await sweeps(), ['swept'])
  // And still one after the retry window has fully passed: a scheduled retry would fire here.
  mock.timers.tick(REAPER_RETRY_DELAY_MS + 500)
  assert.equal(reaps.count, 1)
})

test('reap: a sweep the docker CLI could not run is logged — it means an orphan is still alive', async (t) => {
  // The script exits 0 or REAPER_NOTHING_FOUND and nothing else, so any other code is the CLI
  // failing: a daemon that is down answers 1, a missing container 125/126/127. This was silent
  // until a Docker Desktop stopped mid-session and every sweep vanished without a line.
  const docker = await fakeDocker(t, 'exit 1')
  const p = provider({ docker })
  const warned = []
  p.ctx = { logger: { warn: (message) => warned.push(message) } }
  p.reap({ execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user: 'www-data', container: 'wpdemo-web-1' })
  await until(() => warned.length > 0, 'the failed sweep to be logged')
  assert.equal(warned.length, 1)
  assert.match(
    warned[0],
    /reaping aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee in wpdemo-web-1 failed: the sweep exited 1/
  )
})

test('reap: a sweep that reaped something, or found nothing, says nothing', async (t) => {
  for (const code of [0, REAPER_NOTHING_FOUND]) {
    const { docker, ended } = await sweepingDocker(t, code)
    const p = provider({ docker })
    const warned = []
    p.ctx = { logger: { warn: (message) => warned.push(message) } }
    p.reap({ execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user: 'www-data', container: 'wpdemo-web-1' })
    await ended()
    assert.deepEqual(warned, [], `exit ${code}`)
  }
})

/**
 * THE PATH FENCE. Everything above fences the shell; this fences dsh's OWN filesystem tools, which
 * run in the dsh process where every site is mounted and `/desk-home` holds the seat secret. These
 * tests build a real directory layout — the fence resolves symlinks, so a pure fixture would not
 * exercise the check that matters.
 */
async function fenced(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tracy-sites-')))
  await mkdir(join(root, 'wpdemo', '.webroot'), { recursive: true })
  await mkdir(join(root, 'fijitrips', '.webroot'), { recursive: true })
  await mkdir(join(root, '..', 'desk-home-fake'), { recursive: true }).catch(() => {})
  await writeFile(join(root, 'wpdemo', '.webroot', 'wp-config.php'), '<?php // wpdemo\n')
  await writeFile(join(root, 'fijitrips', '.webroot', 'wp-config.php'), '<?php // fijitrips\n')
  // The escape a label comparison cannot see: a symlink INSIDE the session's own site.
  await symlink(join(root, 'fijitrips'), join(root, 'wpdemo', 'shortcut'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const p = provider({ sitesRoot: root })
  const logged = []
  p.ctx = { logger: { warn: (line) => logged.push(line) } }
  // Every denial also goes to stderr — capture it so the suite stays quiet and the CHANNEL is
  // assertable, not just the logger call.
  const stderr = []
  const realError = console.error
  console.error = (line) => stderr.push(line)
  t.after(() => {
    console.error = realError
  })
  const decide = (name, args, cwd = join(root, 'wpdemo')) =>
    p.pathFenceDecision({ name, arguments: args, agent: { session: { header: { cwd } } } })
  return { root, p, decide, logged, stderr }
}

/**
 * 🔒 A FLEET EMDASH FOLDER IS NAMED BY ITS OWN RECORD (29/09/2026). Its shape is `.tracy/site.json`,
 * `.webroot/{data,uploads}` and `template/` — no `emdash.config.ts`, no `.emdash` — so the file probes
 * answered null and every `/app` refusal of the v6 bench (56 of 56) carried the any-CMS text instead
 * of `EMDASH_APP_NEXT`. The record decides the WORDS only: the call is refused either way.
 */
test('fence: an EmDash site folder as provision writes it gets the EmDash /app road', async (t) => {
  const { root, p } = await fenced(t)
  const site = join(root, 'benchemdash02')
  for (const dir of ['.tracy', '.webroot/data', '.webroot/uploads', 'template'])
    await mkdir(join(site, dir), { recursive: true })
  await writeFile(
    join(site, '.tracy', 'site.json'),
    `${JSON.stringify({ siteKey: 'benchemdash02', platform: 'emdash' }, null, 1)}\n`
  )
  const decide = (/** @type {string} */ name, /** @type {Record<string, unknown>} */ args) =>
    p.pathFenceDecision({ name, arguments: args, agent: { session: { header: { cwd: site } } } })
  for (const [name, args] of [
    ['read', { file_path: '/app/src/views/Home.astro' }],
    ['grep', { pattern: 'hero_cta1', path: '/app/src' }]
  ]) {
    const reason = await decide(name, args)
    assert.ok(reason?.endsWith(EMDASH_APP_NEXT), `${name}: ${reason}`)
  }
  // A record naming no known CMS falls back to the file probes, which find none here: no road claimed.
  const other = join(root, 'unknown-cms')
  await mkdir(join(other, '.tracy'), { recursive: true })
  await writeFile(join(other, '.tracy', 'site.json'), '{"platform":"drupal"}\n')
  const reason = await p.pathFenceDecision({
    name: 'read',
    arguments: { file_path: '/app/x' },
    agent: { session: { header: { cwd: other } } }
  })
  assert.ok(reason?.endsWith(APP_NEXT_ANY_CMS), String(reason))
  // Unchanged where the webroot names the CMS: WordPress keeps its own answer, never the EmDash one.
  assert.doesNotMatch((await decideAt(p, join(root, 'wpdemo'), '/app/x')) ?? '', /site\.rebuild/)
})

/** One fenced read of `file_path` from a session standing in `cwd`. */
const decideAt = (/** @type {any} */ p, /** @type {string} */ cwd, /** @type {string} */ file_path) =>
  p.pathFenceDecision({ name: 'read', arguments: { file_path }, agent: { session: { header: { cwd } } } })

test('fence: read of another site is denied, and of one own file is allowed', async (t) => {
  const { root, decide } = await fenced(t)
  const denied = await decide('read', { file_path: join(root, 'fijitrips', '.webroot', 'wp-config.php') })
  assert.match(denied ?? '', /is outside the session's site/)
  assert.match(denied ?? '', /read file_path/)
  assert.equal(await decide('read', { file_path: join(root, 'wpdemo', '.webroot', 'wp-config.php') }), null)
})

test('fence: a relative path climbing out of the site is denied', async (t) => {
  const { decide } = await fenced(t)
  assert.match(
    (await decide('read', { file_path: '../fijitrips/.webroot/wp-config.php' })) ?? '',
    /is outside the session's site/
  )
  assert.equal(await decide('read', { file_path: '.webroot/wp-config.php' }), null)
})

test('fence: a SYMLINK inside the site pointing at another site is denied', async (t) => {
  // The label check in `workdirDecision` passes this path — every segment says `wpdemo`. Only
  // realpath sees where it goes, which is why the fence resolves before it compares.
  const { root, decide } = await fenced(t)
  const through = join(root, 'wpdemo', 'shortcut', '.webroot', 'wp-config.php')
  const reason = await decide('read', { file_path: through })
  assert.match(reason ?? '', /is outside the session's site/)
  assert.match(reason ?? '', /resolves to/)
  assert.equal(
    workdirDecision({
      name: 'bash',
      args: { workdir: through },
      sessionCwd: join(root, 'wpdemo'),
      sitesRoot: root
    }),
    null
  )
})

test('fence: the mode is irrelevant — a WRITE outside the site is denied with no stamp at all', async (t) => {
  // `danger-full-access` never reaches confine(), and dsh-fs-sandbox lets every read through at
  // every mode. The fence takes no mode argument on purpose: there is none it would trust.
  const { root, decide } = await fenced(t)
  assert.match(
    (await decide('write', { file_path: join(root, 'fijitrips', 'x.txt'), content: 'x' })) ?? '',
    /write file_path .* is outside/
  )
  // A file that does not exist yet is still fenced — creating it is the attack.
  assert.match(
    (await decide('write', { file_path: '/desk-home/cordis.patch.yml', content: 'x' })) ?? '',
    /is outside the session's site/
  )
  assert.equal(await decide('write', { file_path: join(root, 'wpdemo', 'new-file.txt'), content: 'x' }), null)
})

test('fence: file CONTENT is never read as a path', async (t) => {
  // An edit whose text mentions another site must still work inside one's own.
  const { root, decide } = await fenced(t)
  const args = {
    file_path: join(root, 'wpdemo', '.webroot', 'wp-config.php'),
    old_string: '// wpdemo',
    new_string: `// see ${join(root, 'fijitrips')} and /desk-home/dsh-passwords.env`
  }
  assert.equal(await decide('edit', args), null)
})

test('fence: glob and grep path arguments, and their patterns', async (t) => {
  const { root, decide } = await fenced(t)
  assert.match(
    (await decide('grep', { pattern: 'DB_PASSWORD', path: join(root, 'fijitrips') })) ?? '',
    /grep path/
  )
  assert.equal(await decide('grep', { pattern: 'DB_PASSWORD', path: '.webroot' }), null)
  // A grep PATTERN is a regex: `/etc/` is an expression, not a directory, and must not be fenced.
  assert.equal(await decide('grep', { pattern: '/etc/passwd' }), null)
  // A glob PATTERN is a path pattern, and an absolute one escapes.
  assert.match((await decide('glob', { pattern: join(root, 'fijitrips', '**/*.php') })) ?? '', /glob pattern/)
  assert.equal(await decide('glob', { pattern: '**/*.php' }), null)
  assert.match(
    (await decide('glob', { pattern: '**/*.php', path: join(root, 'fijitrips') })) ?? '',
    /glob path/
  )
})

test('fence: str_replace_editor and read_image are in the table too', async (t) => {
  const { root, decide } = await fenced(t)
  assert.match(
    (await decide('str_replace_editor', { command: 'view', path: join(root, 'fijitrips') })) ?? '',
    /str_replace_editor path/
  )
  assert.match(
    (await decide('read_image', { file_path: join(root, 'fijitrips', 'logo.png') })) ?? '',
    /is outside the session's site/
  )
})

// Production 01/10/2026: a design `.html` attached in chat could not be opened — dsh stores it as a
// hard link under `attachments/v1/files/<2>/<sha256>/<name>` and tells the model to `read` it.
test('fence: read of a file attached to this chat passes; listing the store and escaping it do not', async (t) => {
  const { root, p, decide } = await fenced(t)
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tracy-desk-home-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const sha = 'a'.repeat(64)
  const objects = join(home, 'attachments', 'v1', 'file-objects', 'aa')
  const named = join(home, 'attachments', 'v1', 'files', 'aa', sha)
  await mkdir(objects, { recursive: true })
  await mkdir(named, { recursive: true })
  await writeFile(join(objects, sha), '<!doctype html><title>design</title>\n')
  await link(join(objects, sha), join(named, 'page.html'))
  await writeFile(join(home, 'dsh-passwords.env'), 'SECRET=1\n')
  // A symlink planted in the files subtree must resolve to where it points, and be refused there.
  await symlink(join(home, 'dsh-passwords.env'), join(named, 'escape.html'))
  p.attachmentsRoot = join(home, 'attachments')

  assert.equal(await decide('read', { file_path: join(named, 'page.html') }), null)
  assert.equal(await decide('read_image', { file_path: join(named, 'page.html') }), null)
  assert.match(
    (await decide('read', { file_path: join(named, 'escape.html') })) ?? '',
    /outside the session's site/
  )
  assert.match((await decide('read', { file_path: join(objects, sha) })) ?? '', /outside the session's site/)
  assert.match(
    (await decide('read', { file_path: join(home, 'dsh-passwords.env') })) ?? '',
    /outside the session's site/
  )
  assert.match((await decide('glob', { pattern: '**/*', path: named })) ?? '', /outside the session's site/)
  assert.match((await decide('grep', { pattern: 'x', path: named })) ?? '', /outside the session's site/)
  assert.match(
    (await decide('write', { file_path: join(named, 'page.html'), content: 'x' })) ?? '',
    /outside the session's site/
  )

  // Fail closed: no DSH_HOME, no door — and the session's own site is unaffected either way.
  p.attachmentsRoot = null
  assert.match(
    (await decide('read', { file_path: join(named, 'page.html') })) ?? '',
    /outside the session's site/
  )
  assert.equal(await decide('read', { file_path: join(root, 'wpdemo', '.webroot', 'wp-config.php') }), null)
})

test('fence: an unknown tool is fenced only on an argument that really names something', async (t) => {
  const { root, decide } = await fenced(t)
  // A sentence with a slash in it is not a path, and this fence must never be why a todo fails.
  assert.equal(await decide('todo_write', { text: 'read /desk-home/notes and w/e' }), null)
  assert.equal(await decide('todo_write', { text: 'ratio 3/4' }), null)
  // But a real file of another site, named by any argument of any tool, is refused.
  assert.match(
    (await decide('some_future_tool', { target: join(root, 'fijitrips', '.webroot', 'wp-config.php') })) ??
      '',
    /is outside the session's site/
  )
})

/**
 * 🔒 A URL PATH IS NOT A FILE (30/09/2026). `tracy_design_check {"path":"/"}` names the site's home
 * page, but the generous branch saw a string with a slash that EXISTS on the dsh host (`/`) and
 * refused it as a file outside the site; the agent had to retry with `{"paths":["/"]}` (final
 * acceptance on `dsgnm`). The exemption is per tool AND per argument, and never reaches a file tool.
 */
test('fence: a URL-path argument of a site tool is not a file, and file tools stay fenced', async (t) => {
  const { root, decide } = await fenced(t)
  assert.equal(await decide('tracy_design_check', { path: '/' }), null)
  assert.equal(await decide('tracy_design_check', { path: '/etc/passwd' }), null)
  assert.equal(await decide('tracy_design_check', { paths: ['/', '/about'] }), null)
  // Only the named argument is exempt: any other argument of that tool naming a real file is still fenced.
  const other = join(root, 'fijitrips', '.webroot', 'wp-config.php')
  assert.match(
    (await decide('tracy_design_check', { path: '/', siteKey: other })) ?? '',
    /is outside the session's site/
  )
  // Every file tool still refuses the file, whatever its path argument is called.
  assert.match((await decide('read', { file_path: '/etc/passwd' })) ?? '', /read file_path "\/etc\/passwd"/)
  assert.match(
    (await decide('str_replace_editor', { path: '/etc/passwd' })) ?? '',
    /is outside the session's site/
  )
  assert.match(
    (await decide('grep', { pattern: 'x', path: '/etc/passwd' })) ?? '',
    /is outside the session's site/
  )
  assert.match((await decide('glob', { pattern: '*', path: '/' })) ?? '', /is outside the session's site/)
  // The two tables never share a tool, so no exemption can be read as a file tool's.
  for (const tool of Object.keys(URL_PATH_ARGS)) assert.equal(FS_TOOL_ARGS[tool], undefined, tool)
})

test('fence: a known fs tool with no session workspace, or an unusable path, is refused', async (t) => {
  const { p, decide } = await fenced(t)
  const noSession = await p.pathFenceDecision({ name: 'read', arguments: { file_path: '/etc/passwd' } })
  assert.match(noSession ?? '', /cannot be checked against a session workspace/)
  // A session whose cwd is not a site path at all cannot be the base for anything.
  assert.match(
    (await decide('read', { file_path: 'x' }, '/somewhere/else')) ?? '',
    /cannot be checked against a session workspace/
  )
  assert.match((await decide('read', { file_path: 42 })) ?? '', /is not a usable path — refused/)
  // An unknown tool without a session keeps working.
  assert.equal(await p.pathFenceDecision({ name: 'todo_write', arguments: { text: 'x/y' } }), null)
})

test('fence: it is registered on tools/pre-execute and denies before the waterfall', async () => {
  const ctx = fakeContext()
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = { docker: 'docker', sitesRoot: '/site', containerRoot: '/site', containerName: '{label}-web-1' }
  DockerSubprocessRuntime.prototype.registerPathFence.call(p, ctx)
  const entry = ctx.listeners.find((l) => l.event === 'tools/pre-execute')
  assert.ok(entry, 'the fence must register a tools/pre-execute listener')
  let delegated = false
  const decision = await entry.listener(
    { name: 'read', arguments: { file_path: '/desk-home/dsh-passwords.env' } },
    async () => {
      delegated = true
      return { kind: 'allow' }
    }
  )
  assert.equal(decision.kind, 'deny')
  assert.equal(delegated, false, 'a denied call must not reach the rest of the waterfall')
})

/**
 * A stand-in shaped like the REAL `LocalTerminalHandle`: `terminate` on the PROTOTYPE, not an own
 * property, and held by a wrapper the way `dsh-better-sidebar`'s `SubprocessPty` holds it. A plain
 * object literal proves neither.
 */
class FakeTerminalHandle {
  constructor(order, outcome) {
    this.order = order
    this.pid = 4242
    this.done = outcome === undefined ? new Promise(() => {}) : Promise.resolve(outcome)
  }

  async terminate() {
    this.order.push('terminate')
  }
}

/** What the sidebar does with the handle: keeps it, and calls terminate() later. */
class FakeSidebarPty {
  constructor(handle) {
    this.handle = handle
  }

  kill() {
    void this.handle.terminate().catch(() => {})
  }
}

test('spawnTerminal: a class handle held by the sidebar still reaps when the tab is killed', async (t) => {
  // The measured leak (task 1, concern 5) was NOT this — it was the sidebar's 30s reconnect grace
  // before it calls kill() at all. This pins the half that is ours: once kill() lands, the sweep
  // goes in, through a prototype method and through the sidebar's wrapper.
  const p = provider({})
  const order = []
  const targets = []
  p.reap = (target) => {
    order.push('reap')
    targets.push(target)
  }
  const handle = new FakeTerminalHandle(order)
  stubLocal(t, 'spawnTerminal', async () => handle)
  const returned = await p.spawnTerminal({
    argv: ['/bin/bash', '-l'],
    cwd: '/site/wpdemo',
    rows: 24,
    cols: 80,
    graceMs: 2000
  })
  assert.equal(returned, handle, 'the sidebar must receive the patched object itself')
  new FakeSidebarPty(returned).kill()
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'])
  assert.equal(targets[0].container, 'wpdemo-web-1')
  assert.equal(targets[0].user, 'www-data')
})

test('spawnTerminal: a shell that exited CLEANLY is still swept — that is where jobs get backgrounded', async (t) => {
  // The opposite of the `spawn` rule, on purpose. A login shell exiting 0 after `npm run dev &`
  // is the likeliest orphan on this provider, not the least; and a terminal's exit code is
  // synthesized anyway (the sidebar's pty face reports a signal death as 128+n).
  const p = provider({})
  const order = []
  p.reap = () => order.push('reap')
  const handle = new FakeTerminalHandle(order, { exitCode: 0, signal: null })
  stubLocal(t, 'spawnTerminal', async () => handle)
  const returned = await p.spawnTerminal({
    argv: ['/bin/bash', '-l'],
    cwd: '/site/wpdemo',
    rows: 24,
    cols: 80,
    graceMs: 2000
  })
  await tick()
  await tick()
  await returned.terminate()
  await tick()
  assert.deepEqual(order, ['terminate', 'reap'], 'a clean terminal exit must NOT cancel the sweep')
})

test('spawn: a command swept on exit is not swept again when the runtime later terminates it', async (t) => {
  const p = provider({})
  const order = []
  p.reap = () => order.push('reap')
  const handle = fakeHandle(order)
  handle.done = Promise.resolve({ exitCode: 0, signal: null })
  stubLocal(t, 'spawn', () => handle)
  const spawned = p.spawn(SPAWN_SPEC)
  await tick()
  await tick()
  spawned.terminate()
  await tick()
  assert.deepEqual(order, ['reap', 'terminate'], 'one sweep per spawn, the exit one')
})

test('fence: the grep tool payload dsh actually sends is denied, and the model is told why', async (t) => {
  // The exact argument shape of `@deepseek-ai/dsh-tool-fs-search`'s grep: pattern + path + include.
  // Round 2 of the tester's pass saw a bare `exit 127` for this call instead of a reason — that was
  // the ripgrep mapping (see route.test.mjs), but it is worth pinning that the fence's answer for
  // grep is a REASON, in the same shape read and bash produce, and not a silent failure.
  const { root, decide } = await fenced(t)
  const reason = await decide('grep', {
    pattern: 'SECRET',
    path: join(root, 'fijitrips'),
    include: '*.php'
  })
  assert.match(reason ?? '', /^subprocess-docker: grep path .* is outside the session's site/)
  const glob = await decide('glob', { pattern: '**/*.php', path: join(root, 'fijitrips') })
  assert.match(glob ?? '', /^subprocess-docker: glob path .* is outside the session's site/)
  // The same sentence a `read` gets, so a model that learned the rule from one tool applies it.
  const read = await decide('read', { file_path: join(root, 'fijitrips', '.webroot', 'wp-config.php') })
  assert.match(read ?? '', /^subprocess-docker: read file_path .* is outside the session's site/)
})

test('fence: every denial writes ONE structured line an operator can find in docker logs', async (t) => {
  const { root, decide, logged } = await fenced(t)
  await decide('grep', { pattern: 'SECRET', path: join(root, 'fijitrips') })
  assert.equal(logged.length, 1)
  const [line] = logged
  assert.match(line, /^subprocess-docker: DENY /)
  assert.match(line, / guard=path /)
  assert.match(line, / tool=grep /)
  assert.match(line, / arg=path /)
  assert.match(line, / site=wpdemo /)
  assert.match(line, /requested="[^"]*fijitrips"/)
  assert.match(line, /reason="subprocess-docker: grep path/)
  // Never the file's contents, and never the search pattern: a denial is an event, not a copy of
  // what the model was reaching for.
  assert.equal(line.includes('SECRET'), false)
})

test('fence: a symlink denial logs BOTH the requested path and where it really led', async (t) => {
  const { root, decide, logged } = await fenced(t)
  await decide('read', { file_path: join(root, 'wpdemo', 'shortcut', '.webroot', 'wp-config.php') })
  assert.equal(logged.length, 1)
  assert.match(logged[0], /requested="[^"]*wpdemo\/shortcut/)
  assert.match(logged[0], /resolved="[^"]*fijitrips/)
})

test('fence: the workdir guard logs its denials in the same shape', async () => {
  const ctx = fakeContext()
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = { docker: 'docker', sitesRoot: '/site', containerRoot: '/site', containerName: '{label}-web-1' }
  const logged = []
  p.ctx = { logger: { warn: (line) => logged.push(line) } }
  DockerSubprocessRuntime.prototype.registerWorkdirGuard.call(p, ctx)
  const listener = ctx.listeners.find((l) => l.event === 'tools/pre-execute').listener
  await listener(
    {
      name: 'bash',
      arguments: { command: 'id', workdir: '/site/fijitrips' },
      agent: { session: { header: { cwd: '/site/wpdemo' } } }
    },
    async () => ({ kind: 'allow' })
  )
  assert.equal(logged.length, 1)
  assert.match(logged[0], /^subprocess-docker: DENY guard=workdir tool=bash site=wpdemo reason=/)
})

test('fence: the denial reaches STDERR, which is the only stream `docker logs` shows', async (t) => {
  // The operator's check is `docker logs tracy-dsh | grep 'DENY guard='`. Round 3 of the tester's
  // pass had two confirmed denials and a twelve-line container log with neither in it: the line
  // went to dsh's own logger, which has its own level and its own destination. `docker logs` shows
  // the container's stdout/stderr, so the line must be written there — a plugin's console reaches
  // it (`[tracy-site-tabs]` prints the same way).
  const { root, decide, logged, stderr } = await fenced(t)
  await decide('grep', { pattern: 'SECRET', path: join(root, 'fijitrips') })
  assert.equal(stderr.length, 1, 'exactly one line on stderr')
  assert.match(stderr[0], /^subprocess-docker: DENY guard=path tool=grep arg=path site=wpdemo /)
  // Both sinks, and the same text — the logger stays for deployments that collect dsh's stream.
  assert.deepEqual(logged, stderr)
})

test('fence: with no ctx at all the denial still reaches stderr', async (t) => {
  // A provider built before the seam handed it a logger must not lose the event.
  const { root, p, decide, stderr } = await fenced(t)
  p.ctx = undefined
  await decide('read', { file_path: join(root, 'fijitrips', '.webroot', 'wp-config.php') })
  assert.equal(stderr.length, 1)
  assert.match(stderr[0], / tool=read arg=file_path /)
})

// Lee, 26/09/2026: a quickstart site locks nothing but a direct write to its database. Until then the
// contract marker refused the shell, the terminal and every path outside docs/agents.
test('a quickstart site keeps its shell, terminal and webroot; only a direct database write is refused', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'contract-provider-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sitesRoot = await realpath(root)
  const cwd = join(sitesRoot, 'customer')
  await mkdir(join(cwd, 'docs', 'agents'), { recursive: true })
  await mkdir(join(cwd, '.webroot'))
  await mkdir(join(sitesRoot, '.content-contracts'))
  await writeFile(join(sitesRoot, '.content-contracts', 'customer.json'), '{}')
  const p = provider({ sitesRoot })
  const fence = (file_path) =>
    p.pathFenceDecision({
      name: 'write',
      arguments: { file_path, content: 'x' },
      agent: { session: { header: { cwd } } }
    })
  assert.equal(await fence(join(cwd, '.webroot', 'wp-content', 'themes', 'child', 'style.css')), null)
  assert.equal(await fence(join(cwd, 'docs', 'agents', 'mapping.json')), null)
  const ask = (command) =>
    p.approvalReason({ name: 'bash', arguments: { command }, agent: { session: { header: { cwd } } } })
  assert.equal(await ask('wp option update blogname "Acme"'), null)
  assert.equal(await ask('wp db query "SELECT 1"'), null)
  assert.match((await ask('wp db query "UPDATE wp_options SET option_value = 1"')) ?? '', /database directly/)
  // The same command on a site without a contract keeps the older rule: a note, not a refusal.
  const plain = join(sitesRoot, 'plain')
  await mkdir(plain)
  assert.equal(
    await p.approvalReason({
      name: 'bash',
      arguments: { command: 'wp db query "UPDATE wp_options SET option_value = 1"' },
      agent: { session: { header: { cwd: plain } } }
    }),
    null
  )
})

/**
 * PLATFORM CORE. A write the next platform update would silently undo is refused by the fence, on
 * the resolved path, and logged like every other denial.
 */
test('fence: a write into platform core is refused and logged; reading core is not', async (t) => {
  const { root, decide, logged } = await fenced(t)
  const core = join(root, 'wpdemo', '.webroot', 'wp-includes')
  await mkdir(core)
  await writeFile(join(core, 'version.php'), '<?php\n')
  const reason = await decide('edit', {
    file_path: join(core, 'version.php'),
    old_string: 'a',
    new_string: 'b'
  })
  assert.equal(
    reason,
    ".webroot/wp-includes/version.php is platform core: an edit there is lost at the next update. Use a child theme, a template override (templates/<template>/html/) or the template's user.css."
  )
  assert.equal(logged.length, 1)
  assert.match(logged[0], /^subprocess-docker: DENY guard=core tool=edit arg=file_path site=wpdemo /)
  // A file that does not exist yet: resolution stops at the core directory it would be created in.
  assert.match(
    (await decide('write', { file_path: '.webroot/wp-includes/new.css', content: 'x' })) ?? '',
    /^\.webroot\/wp-includes is platform core/
  )
  // A symlink elsewhere in the site that leads into core is judged where it leads.
  await symlink(core, join(root, 'wpdemo', '.webroot', 'shortcut'))
  assert.match(
    (await decide('str_replace_editor', {
      command: 'str_replace',
      path: '.webroot/shortcut/version.php',
      old_str: 'a',
      new_str: 'b'
    })) ?? '',
    /^\.webroot\/wp-includes\/version\.php is platform core/
  )
  // Reading core — `read`, or str_replace_editor's `view` — is how a model learns the platform.
  assert.equal(await decide('read', { file_path: join(core, 'version.php') }), null)
  assert.equal(await decide('str_replace_editor', { command: 'view', path: join(core, 'version.php') }), null)
  // The site's own code is writable.
  assert.equal(
    await decide('write', { file_path: '.webroot/wp-content/themes/child/style.css', content: 'x' }),
    null
  )
})

/**
 * NEW PHP IN THE PUBLIC WEBROOT. Apache serves whatever lands under `.webroot/`, so a scratch script
 * written there is a page with the site's own database credentials for as long as it exists —
 * measured 15/09 as `.webroot/cli/zz_tmp_title.php`, created and removed by hand. The rule is about
 * files that are NOT there yet, and only outside the platform's own places: a child theme's
 * `functions.php` and a Joomla override are new PHP files in the webroot too, and they are the work.
 */
test('fence: a new PHP file in the webroot is refused and names where it belongs; the platform places stay open', async (t) => {
  const { root, decide, logged } = await fenced(t)
  const site = join(root, 'wpdemo')
  const webroot = join(site, '.webroot')
  await mkdir(join(webroot, 'cli'), { recursive: true })
  const reason = await decide('write', { file_path: '.webroot/cli/zz_tmp_title.php', content: '<?php\n' })
  assert.match(
    reason ?? '',
    /^\.webroot\/cli\/zz_tmp_title\.php would be a new PHP file in the public webroot/
  )
  // The way out, in full: the folder mounted in the same container, and the command that runs it.
  assert.ok(reason?.includes(`write ${site}/TracyWork/agents/<name>.php`), reason)
  assert.ok(reason?.includes(`run "php ${site}/TracyWork/agents/<name>.php"`), reason)
  assert.equal(logged.length, 1)
  assert.match(logged[0], /^subprocess-docker: DENY guard=webroot-php tool=write arg=file_path site=wpdemo /)
  // The log names the file the write would have created, not the directory resolution stopped at.
  assert.match(logged[0], /resolved="[^"]+\/\.webroot\/cli\/zz_tmp_title\.php"/)
  // Every write-type tool, and the other two suffixes a PHP-enabled Apache executes.
  assert.ok(await decide('str_replace_editor', { command: 'create', path: '.webroot/probe.phtml' }))
  assert.ok(
    await decide('edit', { file_path: '.webroot/uploads/probe.phar', old_string: '', new_string: 'x' })
  )
  // A symlink inside the site that leads into the webroot is judged where it leads.
  await symlink(join(webroot, 'cli'), join(site, 'scratch'))
  assert.match(
    (await decide('write', { file_path: 'scratch/zz.php', content: '<?php\n' })) ?? '',
    /^\.webroot\/cli\/zz\.php would be a new PHP file/
  )

  // ORDINARY WORK, all of it allowed: the platform's own places for new PHP…
  for (const file of [
    '.webroot/wp-content/themes/tracy-child/functions.php',
    '.webroot/wp-content/plugins/tracy-bits/tracy-bits.php',
    '.webroot/wp-content/mu-plugins/loader.php',
    '.webroot/templates/cassiopeia/html/com_content/article/default.php',
    '.webroot/administrator/templates/atum/html/layouts/joomla/card.php',
    '.webroot/media/templates/site/cassiopeia/helper.php'
  ]) {
    assert.equal(await decide('write', { file_path: file, content: '<?php\n' }), null, file)
  }
  // …the scratch script the refusal asks for, anything outside `.webroot/`, and anything not PHP…
  assert.equal(
    await decide('write', { file_path: 'TracyWork/agents/zz_tmp_title.php', content: '<?php\n' }),
    null
  )
  assert.equal(await decide('write', { file_path: '.webroot/robots.txt', content: 'x' }), null)
  // …and editing a PHP file that is already published.
  await writeFile(join(webroot, 'index.php'), '<?php\n')
  assert.equal(
    await decide('edit', { file_path: '.webroot/index.php', old_string: 'a', new_string: 'b' }),
    null
  )
  // Four refusals above, and not one line more: nothing allowed here was logged as a denial.
  assert.equal(logged.length, 4)
  for (const line of logged) assert.match(line, /DENY guard=webroot-php /)
})

/**
 * THE APPROVAL GUARD, on a real site layout (secrets files are judged on the resolved path), with
 * the rest of the waterfall stubbed as `next`.
 */
async function approvals(t) {
  const { root, p } = await fenced(t)
  const ctx = fakeContext()
  DockerSubprocessRuntime.prototype.registerApprovalGuard.call(p, ctx)
  const entry = ctx.listeners.find((l) => l.event === 'tools/pre-execute')
  assert.ok(entry, 'the approval guard must register a tools/pre-execute listener')
  const cwd = join(root, 'wpdemo')
  const decide = (name, args, rest = { kind: 'allow' }) =>
    entry.listener({ name, arguments: args, agent: { session: { header: { cwd } } } }, async () => rest)
  return { root, decide }
}

const SECRETS_REASON = 'holds the database password; read CMS data through tracy_site instead.'

test('refusal: reading a site secrets file is refused — by path, through a symlink, and for any .env', async (t) => {
  const { root, decide } = await approvals(t)
  assert.deepEqual(await decide('read', { file_path: '.webroot/wp-config.php' }), {
    kind: 'deny',
    reason: `.webroot/wp-config.php ${SECRETS_REASON}`
  })
  await writeFile(join(root, 'wpdemo', '.webroot', 'configuration.php'), '<?php\n')
  const grep = await decide('grep', {
    pattern: 'password',
    path: join(root, 'wpdemo', '.webroot', 'configuration.php')
  })
  // ⚠ Joomla carries a DIFFERENT next step: `sitename`/`MetaDesc` live in this very file, not in the
  // database, so pointing to `tracy_site` points to a door that cannot read them
  // (`src/site-guards.mjs` keeps the measurement). Still `deny`; only the next step differs.
  assert.equal(grep.kind, 'deny')
  assert.match(grep.reason, /^\.webroot\/configuration\.php holds the database password; /)
  assert.match(grep.reason, /config:get/)
  await symlink(join(root, 'wpdemo', '.webroot', 'wp-config.php'), join(root, 'wpdemo', 'notes.txt'))
  assert.equal(
    (await decide('read', { file_path: 'notes.txt' })).reason,
    `.webroot/wp-config.php ${SECRETS_REASON}`
  )
  await mkdir(join(root, 'wpdemo', 'app'))
  await writeFile(join(root, 'wpdemo', 'app', '.env'), 'DB_PASSWORD=x\n')
  assert.equal((await decide('read', { file_path: 'app/.env' })).reason, `app/.env ${SECRETS_REASON}`)
  // Everything else keeps the decision the rest of the chain made.
  assert.deepEqual(await decide('read', { file_path: '.webroot/index.php' }), { kind: 'allow' })
  assert.deepEqual(await decide('grep', { pattern: 'DB_NAME' }), { kind: 'allow' })
  assert.deepEqual(await decide('glob', { pattern: '**/wp-config.php' }), { kind: 'allow' })
})

test('refusal: a bash command naming a secrets file is refused; reaching the database itself is not', async (t) => {
  const { decide } = await approvals(t)
  assert.deepEqual(await decide('bash', { command: 'cat .webroot/wp-config.php' }), {
    kind: 'deny',
    reason: `wp-config.php ${SECRETS_REASON}`
  })
  // The database is reached in ways no text match sees, so refusing the honest call bought nothing:
  // the site context asks for a note under `docs/agents/db-changes/` instead.
  assert.deepEqual(await decide('bash', { command: 'wp db query "SELECT 1"' }), { kind: 'allow' })
  assert.deepEqual(await decide('bash', { command: 'mysql -e "SHOW TABLES"' }), { kind: 'allow' })
  assert.equal(
    (await decide('bash', { command: 'mysql -p"$(grep DB_PASSWORD wp-config.php)"' })).reason,
    `wp-config.php ${SECRETS_REASON}`
  )
  assert.deepEqual(await decide('bash', { command: 'wp plugin list' }), { kind: 'allow' })
})

test('refusal: it delegates FIRST — a deny from the rest of the chain keeps its reason, an ask becomes the refusal', async (t) => {
  const { decide } = await approvals(t)
  const denied = { kind: 'deny', reason: 'refused further down' }
  assert.deepEqual(await decide('bash', { command: 'cat wp-config.php' }, denied), denied)
  assert.deepEqual(
    await decide('bash', { command: 'cat .env' }, { kind: 'ask', reason: 'Needs a sandbox escalation.' }),
    { kind: 'deny', reason: `.env ${SECRETS_REASON}` }
  )
  // A call this guard has no question about passes the chain's ask through untouched.
  const asked = { kind: 'ask', reason: 'Needs a sandbox escalation.' }
  assert.deepEqual(await decide('bash', { command: 'ls' }, asked), asked)
})

test('spawn: a read-only seat runs no command in the container, and says what to use instead; its grep still runs', async (t) => {
  const p = provider({})
  const spawned = []
  stubLocal(t, 'spawn', function capture(spec) {
    spawned.push(spec)
    return fakeHandle([])
  })
  assert.throws(
    () =>
      p.spawn({
        argv: [
          MARKER,
          '--mode',
          'read-only',
          '--root',
          '/site/wpdemo',
          '--',
          'bash',
          '-c',
          'php -r "echo 1;"'
        ],
        cwd: '/site/wpdemo/.webroot',
        env: {},
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 1000
      }),
    (error) => error.message === READ_ONLY_SHELL_REFUSAL
  )
  assert.equal(spawned.length, 0, 'nothing reached docker')
  assert.match(READ_ONLY_SHELL_REFUSAL, /read, grep or glob/)
  await assert.rejects(
    p.spawnTerminal({
      argv: [MARKER, '--mode', 'read-only', '--root', '/site/wpdemo', '--', 'bash', '-l'],
      cwd: '/site/wpdemo',
      env: {}
    }),
    (error) => error.message === READ_ONLY_SHELL_REFUSAL
  )
})
