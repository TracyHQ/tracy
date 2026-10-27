/**
 * Which port a new site is handed — and the machine the allocator is allowed to be blind to.
 *
 * The three cheap sources (`/proc/net/tcp`, docker's published ports, the `.env` files) all answer
 * for the namespace the allocator RUNS in. On a fleet host that is the machine, because tracy-host
 * runs with host networking. On a laptop (`deploy/compose.macos.yml`) tracy-host sits on the
 * compose bridge, and a plain process on macOS — an EmDash build server, another agent's site — is
 * invisible to every one of them. Measured 15/09: two such servers held 52013 and 52014, the
 * allocator handed both out, and `docker compose up` died with "address already in use" AFTER the
 * database had been imported — the site half-built and its creation record stuck on `provisioning`.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkStub, warmStub } from './warm-stub.mjs'

const LIB = fileURLToPath(new URL('../scripts/lib/site-port.sh', import.meta.url))
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

// Stubs written and run once for the whole file (see warm-stub.mjs); a case links the ones it needs and
// passes its values in env, so no case pays for a freshly written executable.
const OK_STUB = warmStub('ok', '#!/bin/sh\nexit 0\n')
const FAIL_STUB = warmStub('fail', '#!/bin/sh\nexit 1\n')
const SS_ERROR_STUB = warmStub('ss-error', '#!/bin/sh\necho "Cannot open netlink socket" >&2\nexit 1\n')
// `ss` listing the ports in $SS_PORTS as LISTEN rows.
const SS_LIST_STUB = warmStub(
  'ss-list',
  `#!/bin/sh
printf '%s\\n' 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port'
for p in $SS_PORTS; do printf 'LISTEN 0      511        127.0.0.1:%s        0.0.0.0:*\\n' "$p"; done
`
)
// `docker compose up` that records $HOST_PORT in $COMPOSE_CALLS and refuses like the daemon in #361:
// a port in $COMPOSE_BUSY as already bound, or every start when $COMPOSE_OTHER is set.
const COMPOSE_STUB = warmStub(
  'docker-compose',
  `#!/bin/sh
[ "$1" = compose ] || exit 0
echo "up $HOST_PORT" >> "$COMPOSE_CALLS"
for p in $COMPOSE_BUSY; do
  if [ "$HOST_PORT" = "$p" ]; then
    echo "Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint lantern-web-1 (0123abcd): failed to bind host port 127.0.0.1:$p/tcp: address already in use" >&2
    exit 1
  fi
done
if [ -n "$COMPOSE_OTHER" ]; then echo "Error response from daemon: manifest for tracy/web:nope not found" >&2; exit 1; fi
exit 0
`
)
/** Point `name` in a stand's bin at a warmed stub (replacing what `stand()` put there). */
function use(bin, name, stub) {
  rmSync(path.join(bin, name), { force: true })
  linkStub(stub, path.join(bin, name))
}

/** A root with no sites in it, plus a `docker` on PATH that publishes nothing. */
function stand() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-site-port-'))
  temps.push(dir)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  // A docker that answers, and answers "nothing published": the allocator must count it as a
  // source it could read, exactly as the real one does on a host with no containers.
  linkStub(OK_STUB, path.join(bin, 'docker'))
  return { dir, root: dir, bin }
}

/** Run one function of the lib in the shell provision.sh really uses. */
function sh(script, { root, bin, env = {}, ssPorts = '' }) {
  return execFileSync('bash', ['-euo', 'pipefail', '-c', `. "$1"; ${script}`, '_', LIB], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ROOT: root, SS_PORTS: ssPorts, ...env }
  }).trim()
}

/** A listener on the loopback of the machine running the test — what the probe must notice. */
function listen() {
  const server = net.createServer(() => {})
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ port: server.address().port, close: (callback) => server.close(callback) })
    )
  })
}

test('a port a process on the machine holds is skipped, even when no cheap source can see it', async () => {
  const { root, bin } = stand()
  const held = await listen()
  try {
    // The window is a RANGE, not the held port plus one: this machine runs other tests (and other
    // sessions) that hold ephemeral ports, so pinning the answer to `held.port + 1` failed about
    // half the runs of the full suite while passing alone — the picker was right and the test was
    // wrong (measured 16/09). What the test is about is that the HELD port is skipped.
    const picked = Number(
      sh('tracy_pick_site_port "$ROOT"', {
        root,
        bin,
        env: {
          SITE_PORT_MIN: String(held.port),
          SITE_PORT_MAX: String(held.port + 40),
          TRACY_PORT_PROBE_HOST: '127.0.0.1'
        }
      })
    )
    assert.notEqual(picked, held.port, 'the held port is skipped')
    assert.ok(picked > held.port && picked <= held.port + 40, `picked ${picked} is inside the window`)
  } finally {
    held.close()
  }
})

test('the probe answers for a live port, and not for a dead one', async () => {
  const { root, bin } = stand()
  const held = await listen()
  const unused = await listen()
  const dead = unused.port
  await new Promise((resolve) => unused.close(resolve))
  try {
    const answers = sh(
      `tracy_port_answers_on_host ${held.port} && echo live; tracy_port_answers_on_host ${dead} || echo dead`,
      { root, bin, env: { TRACY_PORT_PROBE_HOST: '127.0.0.1' } }
    )
    assert.equal(answers, 'live\ndead')
  } finally {
    held.close()
  }
})

test('a probe host that does not resolve stands the probe down — a fleet host keeps its old answer', async () => {
  const { root, bin } = stand()
  const held = await listen()
  try {
    const out = sh(`tracy_port_answers_on_host ${held.port} || echo stood-down`, {
      root,
      bin,
      env: { TRACY_PORT_PROBE_HOST: 'no-such-host.invalid' }
    })
    assert.equal(out, 'stood-down')
  } finally {
    held.close()
  }
})

test('a port another site already names in its .env is still skipped', async () => {
  const { root, bin } = stand()
  const held = await listen()
  const taken = held.port + 1
  mkdirSync(path.join(root, 'someone-else'))
  writeFileSync(path.join(root, 'someone-else', '.env'), `HOST_PORT=${taken}\n`)
  try {
    const picked = sh('tracy_pick_site_port "$ROOT"', {
      root,
      bin,
      env: {
        SITE_PORT_MIN: String(held.port),
        SITE_PORT_MAX: String(Math.min(65535, held.port + 40)),
        TRACY_PORT_PROBE_HOST: '127.0.0.1'
      }
    })
    assert.notEqual(Number(picked), held.port, 'the live listener is skipped')
    assert.notEqual(Number(picked), taken, 'the port named by another site is skipped')
    assert.ok(Number(picked) > held.port && Number(picked) <= Math.min(65535, held.port + 40))
  } finally {
    held.close()
  }
})

test("Tracy's own block is never handed to a site", async () => {
  const { root, bin } = stand()
  const picked = sh('tracy_pick_site_port "$ROOT"', {
    root,
    bin,
    env: {
      SITE_PORT_MIN: '51710',
      SITE_PORT_MAX: '51711',
      TRACY_PORT_PROBE_HOST: 'no-such-host.invalid'
    }
  })
  assert.equal(picked, '51711')
})

test('no source at all refuses to allocate rather than guessing', () => {
  const { root, bin } = stand()
  // A docker that is installed and REFUSES to answer — the shape a broken socket has — plus both
  // /proc files named at a place that does not exist, so the refusal is asserted on Linux (where
  // /proc/net/tcp6 is real) as well as on macOS.
  use(bin, 'docker', FAIL_STUB)
  // And an `ss` that fails: on a Linux runner the real one would otherwise answer, and this test
  // is about a machine where nothing can.
  use(bin, 'ss', FAIL_STUB)
  assert.throws(
    () =>
      sh('tracy_pick_site_port "$ROOT"', {
        root,
        bin,
        env: {
          TRACY_PROC_NET: path.join(root, 'nothing'),
          TRACY_PROC_NET6: path.join(root, 'nothing6')
        }
      }),
    /cannot see which ports are in use/
  )
})

// ── TracyHQ/tch#361 ───────────────────────────────────────────────────────────────────────────
//
// A site was handed 52060; 112 s later `docker compose up` died with `failed to bind host port
// 127.0.0.1:52060/tcp: address already in use`. Two answers, both pinned here: `ss` is asked again
// where it exists, and the start retries ONCE on a new port — for a port this run picked, and for
// that failure only.

/** A stand whose `ss` lists `listening` ports, and whose other cheap sources see nothing. */
function ssStand(listening) {
  const s = stand()
  linkStub(SS_LIST_STUB, path.join(s.bin, 'ss'))
  return { ...s, ssPorts: listening.join(' ') }
}

const QUIET = {
  TRACY_PORT_PROBE_HOST: 'no-such-host.invalid',
  TRACY_PROC_NET: '/nonexistent/tcp',
  TRACY_PROC_NET6: '/nonexistent/tcp6'
}

test('a port ss reports LISTENING is skipped, even when every other source misses it', () => {
  const { root, bin, ssPorts } = ssStand([52060])
  const picked = sh('tracy_pick_site_port "$ROOT"', {
    root,
    bin,
    ssPorts,
    env: { ...QUIET, SITE_PORT_MIN: '52060', SITE_PORT_MAX: '52061' }
  })
  assert.equal(picked, '52061')
})

test('an ss that fails is a source not read, never an empty answer — the other sources still decide', () => {
  const { root, bin } = stand()
  linkStub(SS_ERROR_STUB, path.join(bin, 'ss'))
  const picked = sh('tracy_pick_site_port "$ROOT"', {
    root,
    bin,
    env: { ...QUIET, SITE_PORT_MIN: '52060', SITE_PORT_MAX: '52061' }
  })
  assert.equal(picked, '52060')
  const listed = sh('tracy_ss_listening_ports || echo unread', { root, bin })
  assert.equal(listed, 'unread')
})

/**
 * A site directory with the `.env` provision.sh writes, and a `docker` whose `compose up` refuses
 * any HOST_PORT listed in `busy` the way the daemon did in #361 — or fails some other way when
 * `other` is set. Every `compose up` is recorded with the port it was asked to publish.
 */
function composeStand({ busy = [], other = false } = {}) {
  const s = ssStand([])
  const site = path.join(s.root, 'lantern')
  mkdirSync(site)
  writeFileSync(
    path.join(site, '.env'),
    'HOST_PORT=52060\nPLATFORM=wordpress\nDB_PASSWORD=s3cret\nTRACY_MAIL_TOKEN=tok\n',
    { mode: 0o600 }
  )
  const calls = path.join(s.dir, 'calls')
  use(s.bin, 'docker', COMPOSE_STUB)
  // `flock` is not on macOS, and the real one on Linux would want /var/lock: the lock's CALL is
  // what provision.sh relies on, not the kernel's, and the path is redirected below.
  linkStub(OK_STUB, path.join(s.bin, 'flock'))
  return {
    ...s,
    site,
    calls,
    composeEnv: { COMPOSE_CALLS: calls, COMPOSE_BUSY: busy.join(' '), COMPOSE_OTHER: other ? '1' : '' }
  }
}

/** Start the stack as provision.sh does; returns the exit code, the port it ended on, and output. */
function composeUp(st, pickedHere) {
  const r = spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `. "$1"; HOST_PORT=52060; export HOST_PORT; rc=0; tracy_compose_up_site "$SITE" "$ROOT" ${pickedHere} || rc=$?; echo "rc=$rc port=$HOST_PORT"`,
      '_',
      LIB
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...QUIET,
        PATH: `${st.bin}:${process.env.PATH}`,
        ROOT: st.root,
        SITE: st.site,
        ...st.composeEnv,
        SS_PORTS: st.ssPorts,
        SITE_PORT_MIN: '52060',
        SITE_PORT_MAX: '52070',
        TRACY_PORT_LOCK: path.join(st.dir, 'ports.lock')
      }
    }
  )
  const [, rc, port] = /rc=(\d+) port=(\d+)/.exec(r.stdout) ?? []
  const calls = (() => {
    try {
      return readFileSync(st.calls, 'utf8').trim().split('\n')
    } catch {
      return []
    }
  })()
  return { rc: Number(rc), port, calls, output: r.stdout + r.stderr }
}

test('a start that succeeds runs compose once and keeps its port', () => {
  const st = composeStand()
  const { rc, port, calls } = composeUp(st, 1)
  assert.equal(rc, 0)
  assert.equal(port, '52060')
  assert.deepEqual(calls, ['up 52060'])
})

test('a picked port taken before the start is re-picked ONCE, and .env keeps every other line', () => {
  const st = composeStand({ busy: [52060] })
  const { rc, port, calls, output } = composeUp(st, 1)
  assert.equal(rc, 0)
  // 52060 is skipped by the re-pick because the site's own .env still names it, and docker had
  // refused it — the new port is the next free one, and the shell and .env agree on it.
  assert.equal(port, '52061')
  assert.deepEqual(calls, ['up 52060', 'up 52061'])
  assert.equal(
    readFileSync(path.join(st.site, '.env'), 'utf8'),
    'HOST_PORT=52061\nPLATFORM=wordpress\nDB_PASSWORD=s3cret\nTRACY_MAIL_TOKEN=tok\n'
  )
  assert.equal(statSync(path.join(st.site, '.env')).mode & 0o777, 0o600, '.env still holds a password')
  assert.match(output, /address already in use/, "the daemon's first refusal stays in the log")
  assert.match(output, /retrying once on port 52061/)
})

test('a second refusal is not retried again — it fails with the last error in the log', () => {
  const st = composeStand({ busy: [52060, 52061] })
  const { rc, calls, output } = composeUp(st, 1)
  assert.notEqual(rc, 0)
  assert.deepEqual(calls, ['up 52060', 'up 52061'])
  assert.match(output, /127\.0\.0\.1:52061\/tcp: address already in use/)
})

test('any other failure is not retried, and keeps compose exit code', () => {
  const st = composeStand({ other: true })
  const { rc, port, calls, output } = composeUp(st, 1)
  assert.equal(rc, 1)
  assert.equal(port, '52060')
  assert.deepEqual(calls, ['up 52060'])
  assert.match(output, /manifest for tracy\/web:nope not found/)
})

test('a port this run did not pick is never moved — a tunnel rule may already name it', () => {
  const st = composeStand({ busy: [52060] })
  const { rc, port, calls } = composeUp(st, 0)
  assert.notEqual(rc, 0)
  assert.equal(port, '52060')
  assert.deepEqual(calls, ['up 52060'])
  assert.match(readFileSync(path.join(st.site, '.env'), 'utf8'), /^HOST_PORT=52060$/m)
})

test('a bind refusal naming ANOTHER port is not this port — no re-pick', () => {
  const st = composeStand({ busy: [52060] })
  const out = path.join(st.dir, 'out')
  writeFileSync(
    out,
    'Bind for 127.0.0.1:520601 failed: port is already allocated\nBind for 127.0.0.1:8081 failed: port is already allocated\n'
  )
  const verdict = sh(`tracy_port_bind_conflict 52060 '${out}' && echo ours || echo not-ours`, st)
  assert.equal(verdict, 'not-ours')
  writeFileSync(out, 'Bind for 127.0.0.1:52060 failed: port is already allocated\n')
  assert.equal(sh(`tracy_port_bind_conflict 52060 '${out}' && echo ours || echo not-ours`, st), 'ours')
})

test('provision.sh starts the site through the retry, before the front-page check, the ingress rule and TRACY_RESULT', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url)),
    'utf8'
  )
  const start = src.indexOf('tracy_compose_up_site "$SITE_DIR" "$ROOT" "$PORT_PICKED_HERE"')
  assert.ok(start !== -1, 'provision.sh no longer starts the site through tracy_compose_up_site')
  assert.equal(
    /^\( cd "\$SITE_DIR" && docker compose up -d \)$/m.test(src),
    false,
    'a bare compose up bypasses the retry'
  )
  for (const later of [
    'tracy_front_page_refusal "$LABEL" "$HOST_PORT"',
    'ingress_api.py" --hostname',
    'echo "TRACY_RESULT port=$HOST_PORT'
  ]) {
    const at = src.indexOf(later)
    assert.ok(at > start, `${later} must come after the start, so it reads the port the site started on`)
  }
  // A step boundary right after the start: without it a bind error the retry fixed shares a step
  // with the next failure, and tracy-host's failed-job output leads with the fixed conflict.
  const boundary = src.indexOf('\nmark ', start)
  assert.ok(boundary !== -1, 'no mark after the site starts')
  assert.equal(
    src
      .slice(start, boundary)
      .split('\n')
      .filter((line) => line && !line.startsWith('#')).length,
    1,
    'the mark must be the first command after the start'
  )
  // Only the allocator's own branch marks the port as this run's.
  const picked = src.indexOf('PORT_PICKED_HERE=1')
  assert.ok(picked > src.indexOf('if [ -z "${HOST_PORT:-}" ]; then', src.indexOf('PORT_PICKED_HERE=0')))
})
