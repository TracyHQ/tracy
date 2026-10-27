#!/usr/bin/env node
/**
 * `provision/teardown.sh` step 1c — the directory holding `.env` (DB_PASSWORD) is deleted only once
 * the site's named volumes are really gone (#666).
 *
 * Measured on tracy-fleet-01 (ja-vega-joomla): `compose down` failed, teardown only warned, deleted
 * the private directory, and an orphan `<label>-db-1` container still held `<label>_db`. The next
 * provision refused the label ("volume <label>_db outlived its stack"), and the teardown log that
 * said why was deleted too.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/teardown-volumes.test.mjs
 *
 * `docker` is a stateful fake on PATH: a volume table and a container table (each row tagged with
 * its compose project), answering the calls teardown makes the way the real CLI does. Nothing on
 * this machine is touched.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const TEARDOWN = fileURLToPath(new URL('../scripts/provision/teardown.sh', import.meta.url))
const LABEL = 'ja-vega-joomla'
const NEIGHBOUR = 'ja-vega-joomla2'
const ENV_BYTES = 'DB_PASSWORD=s3cret-only-copy\nHOST_PORT=52011\n'
// Full ids, as `docker ps -q --no-trunc` prints them; the fake truncates to 12 without the flag.
const ORPHAN = `aaaa${'0'.repeat(59)}1`
const NEIGHBOUR_ID = `beefcafe${'0'.repeat(55)}2`
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

// Switches (files in the state dir): `down-fails`, `down-keeps` (down exits 0 but drops nothing),
// `volume-ls-fails`, `ps-fails`, `rm-fails`, `volume-ls-extra` (extra lines volume ls prints),
// `stuck` (volumes `volume rm` refuses), `ghost` (volumes `volume rm` claims to drop but keeps),
// `vanish` (volumes that disappear while `volume rm` still exits 1), `ps-extra` (extra lines
// the compose-project `docker ps` prints), `sort-fails` (a `sort` on PATH that fails).
const FAKE_DOCKER = `#!/usr/bin/env bash
S="$FAKE_DOCKER_STATE"
printf '%s\\n' "$*" >> "$S/calls"
on() { [ -e "$S/$1" ]; }
listed() { [ -e "$S/$1" ] && grep -qxF "$2" "$S/$1"; }
filter=""
prev=""
for a in "$@"; do [ "$prev" = "--filter" ] && filter="$a"; prev="$a"; done
drop_project() { # file project
  awk -v p="$2" '$NF != p' "$S/$1" > "$S/$1.tmp"; mv "$S/$1.tmp" "$S/$1"
}
case "$1" in
  network)
    # No \`networks\` table: a host whose docker knows no such network (the other tests).
    if [ "$2" = ls ]; then
      [ -e "$S/networks" ] || exit 0
      n="\${filter#name=^}"; n="\${n%\\$}"
      awk -v n="$n" '$1 == n { print "0123456789ab" }' "$S/networks"; exit 0
    fi
    [ -e "$S/networks" ] || exit 1
    case "$2" in
      inspect) awk -v n="$3" '$1 == n { f = 1; print $2 } END { exit !f }' "$S/networks" ;;
      rm)
        listed net-busy "$3" && { echo "Error response from daemon: network $3 has active endpoints" >&2; exit 1; }
        awk -v n="$3" '$1 != n' "$S/networks" > "$S/networks.tmp"; mv "$S/networks.tmp" "$S/networks"; echo "$3" ;;
      *) echo "unexpected docker network $2" >&2; exit 2 ;;
    esac ;;
  compose)
    on down-fails && { echo "Error response from daemon: simulated down failure" >&2; exit 1; }
    on down-keeps && exit 0
    proj="$(basename "$PWD")"
    drop_project containers "$proj"; drop_project volumes "$proj"; exit 0 ;;
  ps)
    on ps-fails && { echo "permission denied while trying to connect to the Docker daemon" >&2; exit 1; }
    case "$filter" in
      name=^*) awk -v p="\${filter#name=^}" 'index($2, p) == 1 { print $2 }' "$S/containers" ;;
      label=com.docker.compose.project=*)
        n=12; case " $* " in *" --no-trunc "*) n=64 ;; esac
        awk -v p="\${filter#label=com.docker.compose.project=}" -v n="$n" '$NF == p { print substr($1, 1, n) }' "$S/containers"
        on ps-extra && cat "$S/ps-extra" ;;
      *) echo "unexpected docker ps filter $filter" >&2; exit 2 ;;
    esac
    exit 0 ;;
  rm)
    on rm-fails && { echo "Error response from daemon: cannot remove container" >&2; exit 1; }
    awk -v id="$3" '$1 != id' "$S/containers" > "$S/containers.tmp"; mv "$S/containers.tmp" "$S/containers" ;;
  volume)
    case "$2" in
      ls)
        on volume-ls-fails && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
        case "$filter" in
          label=com.docker.compose.project=*) awk -v p="\${filter#label=com.docker.compose.project=}" '$NF == p { print $1 }' "$S/volumes" ;;
          name=^*\\$) n="\${filter#name=^}"; n="\${n%\\$}"; awk -v n="$n" '$1 == n { print $1 }' "$S/volumes" ;;
          *) echo "unexpected docker volume ls filter $filter" >&2; exit 2 ;;
        esac
        on volume-ls-extra && cat "$S/volume-ls-extra"
        exit 0 ;;
      rm)
        v="$3"
        if listed vanish "$v"; then
          awk -v v="$v" '$1 != v' "$S/volumes" > "$S/volumes.tmp"; mv "$S/volumes.tmp" "$S/volumes"
          echo "Error response from daemon: get $v: no such volume" >&2; exit 1
        fi
        listed ghost "$v" && { echo "$v"; exit 0; }
        proj="$(awk -v v="$v" '$1 == v { print $NF }' "$S/volumes")"
        if listed stuck "$v" || { [ -n "$proj" ] && awk -v p="$proj" '$NF == p { f = 1 } END { exit !f }' "$S/containers"; }; then
          echo "Error response from daemon: remove $v: volume is in use" >&2; exit 1
        fi
        awk -v v="$v" '$1 != v' "$S/volumes" > "$S/volumes.tmp"; mv "$S/volumes.tmp" "$S/volumes"
        echo "$v" ;;
      *) echo "unexpected docker volume $2" >&2; exit 2 ;;
    esac ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
`

/**
 * A host with this site (and a neighbour whose label starts with this one) on it.
 * `volumes`/`containers` are rows `name project` / `id name project`.
 */
function stand({ volumes, containers = [], compose = true, switches = {}, env = 'file' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'teardown-volumes-'))
  temps.push(root)
  const state = path.join(root, 'state')
  const bin = path.join(root, 'bin')
  for (const dir of [state, bin, 'private', 'sites', 'jobs', 'hooks'].map((d) => path.resolve(root, d)))
    mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 })
  const rows = (list) => list.map((r) => `${r}\n`).join('')
  writeFileSync(
    path.join(state, 'volumes'),
    rows(volumes ?? [`${LABEL}_db ${LABEL}`, `${NEIGHBOUR}_db ${NEIGHBOUR}`])
  )
  writeFileSync(
    path.join(state, 'containers'),
    rows([...containers, `${NEIGHBOUR_ID} ${NEIGHBOUR}-db-1 ${NEIGHBOUR}`])
  )
  writeFileSync(path.join(state, 'calls'), '')
  for (const [name, value] of Object.entries(switches)) writeFileSync(path.join(state, name), value)
  if ('sort-fails' in switches)
    writeFileSync(path.join(bin, 'sort'), '#!/bin/sh\necho "sort: write error" >&2\nexit 2\n', {
      mode: 0o755
    })

  const siteDir = path.join(root, 'private', LABEL)
  mkdirSync(siteDir)
  if (compose) writeFileSync(path.join(siteDir, 'docker-compose.yml'), 'services: {}\n')
  const envPath = path.join(siteDir, '.env')
  if (env === 'file') writeFileSync(envPath, ENV_BYTES)
  if (env === 'symlink') {
    writeFileSync(path.join(root, 'env-target'), ENV_BYTES)
    symlinkSync(path.join(root, 'env-target'), envPath)
  }
  if (env === 'fifo') assert.equal(spawnSync('mkfifo', [envPath]).status, 0)
  mkdirSync(path.join(root, 'sites', LABEL))
  for (const log of [`provision-${LABEL}.log`, `teardown-${LABEL}.log`])
    writeFileSync(path.join(root, 'hooks', log), 'earlier run\n')
  return { root, state, bin, siteDir, envPath }
}

function teardown(s, args = ['--label', LABEL]) {
  const run = spawnSync('bash', [TEARDOWN, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      PATH: `${s.bin}:${process.env.PATH}`,
      HOME: s.root,
      FAKE_DOCKER_STATE: s.state,
      TRACY_PRIVATE_ROOT: path.join(s.root, 'private'),
      TRACY_SITES_ROOT: path.join(s.root, 'sites'),
      JOBS_DIR: path.join(s.root, 'jobs'),
      HOOK_LOG_DIR: path.join(s.root, 'hooks'),
      CF_CONFIG: path.join(s.root, 'no-cloudflared', 'config.yml'),
      // What tracy-host says for a host with no tunnel configured (teardown.sh refuses a host it
      // cannot look at the tunnel of unless it is told there is none).
      TRACY_TUNNEL: 'none'
    }
  })
  assert.equal(run.error, undefined, `teardown did not finish: ${run.error}`)
  return run
}

const calls = (s) => readFileSync(path.join(s.state, 'calls'), 'utf8').split('\n').filter(Boolean)
const table = (s, name) => readFileSync(path.join(s.state, name), 'utf8')
const teardownLog = (s) => path.join(s.root, 'hooks', `teardown-${LABEL}.log`)
const SUCCESS = `TRACY_RESULT torn_down=1 label=${LABEL}`

/** Everything a reinstall needs to open the surviving volume is still there. */
function assertKept(s, run) {
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.ok(!run.stdout.includes(SUCCESS), 'no success marker')
  assert.match(run.stderr, new RegExp(`teardown of ${LABEL} stopped: `))
  assert.ok(existsSync(s.siteDir), 'the private directory is kept')
  assert.ok(existsSync(path.join(s.root, 'sites', LABEL)), 'the site folder is kept')
  if (lstatSync(s.envPath).isFile()) assert.equal(readFileSync(s.envPath, 'utf8'), ENV_BYTES)
  assert.ok(existsSync(teardownLog(s)), 'the teardown log is kept')
}

function assertGone(s, run) {
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.ok(run.stdout.includes(SUCCESS), run.stdout)
  assert.equal(existsSync(s.siteDir), false, 'the private directory is removed')
  assert.equal(existsSync(path.join(s.root, 'sites', LABEL)), false, 'the site folder is removed')
  assert.equal(existsSync(path.join(s.root, 'hooks', `provision-${LABEL}.log`)), false)
}

/** The neighbour whose label begins with this one keeps its volume and its container. */
function assertNeighbourUntouched(s) {
  assert.match(table(s, 'volumes'), new RegExp(`^${NEIGHBOUR}_db ${NEIGHBOUR}$`, 'm'))
  assert.match(table(s, 'containers'), new RegExp(`^${NEIGHBOUR_ID} `, 'm'))
  assert.ok(
    !calls(s).some((c) => c.includes(NEIGHBOUR_ID.slice(0, 12)) || c.includes(`volume rm ${NEIGHBOUR}`))
  )
}

test('happy path: down drops the volumes, and the directories and both logs go', () => {
  const s = stand({
    volumes: [`${LABEL}_db ${LABEL}`, `${LABEL}_app ${LABEL}`, `${NEIGHBOUR}_db ${NEIGHBOUR}`],
    containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`]
  })
  const run = teardown(s)
  assertGone(s, run)
  assert.equal(existsSync(teardownLog(s)), false, 'the teardown log goes on the happy path')
  assert.ok(!calls(s).some((c) => c.startsWith('volume rm') || c.startsWith('rm ')), 'no recovery')
  assertNeighbourUntouched(s)
})

test('#666: down fails and <label>_db cannot be removed — .env, the directory and the log stay', () => {
  const s = stand({
    containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`],
    switches: { 'down-fails': '', stuck: `${LABEL}_db\n` }
  })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, new RegExp(`volume\\(s\\) ${LABEL}_db still exist`))
  const log = calls(s)
  const rmAt = log.indexOf(`rm -f ${ORPHAN}`)
  const volAt = log.indexOf(`volume rm ${LABEL}_db`)
  assert.ok(rmAt >= 0 && volAt > rmAt, `the orphan container is removed before the volume: ${log}`)
  assertNeighbourUntouched(s)
})

test('down fails but the orphan container and volume can be removed — cleanup finishes, the log stays', () => {
  const s = stand({
    volumes: [`${LABEL}_db ${LABEL}`, `${LABEL}_app ${LABEL}`, `${NEIGHBOUR}_db ${NEIGHBOUR}`],
    containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`],
    switches: { 'down-fails': '' }
  })
  const run = teardown(s)
  assertGone(s, run)
  assert.ok(existsSync(teardownLog(s)), 'the failed-down log is kept for the reader')
  assert.ok(calls(s).includes(`volume rm ${LABEL}_db`) && calls(s).includes(`volume rm ${LABEL}_app`))
  assert.doesNotMatch(table(s, 'volumes'), new RegExp(`^${LABEL}_`, 'm'))
  assertNeighbourUntouched(s)
})

test('down succeeds yet leaves a volume: recovery runs, and refuses when it cannot finish', () => {
  const s = stand({ switches: { 'down-keeps': '', stuck: `${LABEL}_db\n` } })
  const run = teardown(s)
  assertKept(s, run)
  assert.ok(calls(s).includes(`volume rm ${LABEL}_db`))
})

test('down succeeds yet leaves a volume: recovery removes it, and the log goes as usual', () => {
  const s = stand({ switches: { 'down-keeps': '' } })
  const run = teardown(s)
  assertGone(s, run)
  assert.equal(existsSync(teardownLog(s)), false)
  assertNeighbourUntouched(s)
})

test('no compose file but an orphan volume: it is still found and removed before the directory goes', () => {
  const s = stand({ compose: false, containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`] })
  const run = teardown(s)
  assertGone(s, run)
  assert.ok(!calls(s).some((c) => c.startsWith('compose')))
  assert.ok(calls(s).includes(`rm -f ${ORPHAN}`))
  assertNeighbourUntouched(s)
})

test('a docker that cannot list volumes is a refusal, not an empty host', () => {
  const s = stand({ switches: { 'volume-ls-fails': '', 'down-fails': '' } })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, /cannot ask docker which volumes of ja-vega-joomla remain.*Cannot connect/)
})

test('a docker that cannot list the leftover containers is a refusal', () => {
  const s = stand({ switches: { 'ps-fails': '', 'down-fails': '' } })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, /cannot ask docker which containers of compose project ja-vega-joomla remain/)
  assert.ok(!calls(s).some((c) => c.startsWith('volume rm')))
})

test('a leftover container that cannot be removed is a refusal naming it', () => {
  const s = stand({
    containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`],
    switches: { 'rm-fails': '', 'down-fails': '' }
  })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(
    run.stderr,
    new RegExp(`could not remove container ${ORPHAN} of compose project ja-vega-joomla`)
  )
  assert.ok(!calls(s).some((c) => c.startsWith('volume rm')))
})

test('partial removal: one volume goes, the other stays — refused, naming the survivor only', () => {
  const s = stand({
    volumes: [`${LABEL}_db ${LABEL}`, `${LABEL}_app ${LABEL}`],
    switches: { 'down-fails': '', stuck: `${LABEL}_app\n` }
  })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, new RegExp(`volume\\(s\\) ${LABEL}_app still exist`))
  assert.doesNotMatch(table(s, 'volumes'), new RegExp(`^${LABEL}_db `, 'm'))
})

test('volume rm that reports success while the volume remains is caught by the second look', () => {
  const s = stand({ switches: { 'down-fails': '', ghost: `${LABEL}_db\n` } })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, new RegExp(`volume\\(s\\) ${LABEL}_db still exist`))
})

test('a volume that vanishes while volume rm fails counts once the second look finds it gone', () => {
  const s = stand({ switches: { 'down-fails': '', vanish: `${LABEL}_db\n` } })
  const run = teardown(s)
  assertGone(s, run)
  assert.ok(existsSync(teardownLog(s)))
})

test('unexpected docker output never becomes a removal argument or a clean verdict', () => {
  for (const extra of [`${NEIGHBOUR}_db`, 'x; rm -rf /', `${LABEL}_db extra`, '*']) {
    const s = stand({ switches: { 'volume-ls-extra': `${extra}\n` } })
    const run = teardown(s)
    assertKept(s, run)
    assert.match(run.stderr, /not a name this site owns/)
    assert.ok(!calls(s).some((c) => c.startsWith('volume rm')), `${extra}: nothing was removed`)
    assertNeighbourUntouched(s)
  }
})

test('.env as a symlink or a FIFO is left alone on refusal and never opened', () => {
  for (const env of ['symlink', 'fifo']) {
    const s = stand({ env, switches: { 'down-fails': '', stuck: `${LABEL}_db\n` } })
    const run = teardown(s)
    assertKept(s, run)
    const st = lstatSync(s.envPath)
    assert.ok(env === 'symlink' ? st.isSymbolicLink() : st.isFIFO(), `${env} .env is kept as it was`)
    if (env === 'symlink') assert.equal(readFileSync(path.join(s.root, 'env-target'), 'utf8'), ENV_BYTES)
  }
})

test('a refused teardown can be run again once the volume is free, and a repeat is a no-op success', () => {
  const s = stand({ switches: { 'down-fails': '', stuck: `${LABEL}_db\n` } })
  assertKept(s, teardown(s))
  rmSync(path.join(s.state, 'stuck'))
  rmSync(path.join(s.state, 'down-fails'))
  // `down` would run against a project whose volume it is told to drop; the fake drops it.
  assertGone(s, teardown(s))
  assertGone(s, teardown(s))
  assertNeighbourUntouched(s)
})

test('a bad command line exits 2 before docker is asked anything', () => {
  for (const args of [
    [],
    ['--label'],
    ['--label', ''],
    ['--label', '--root'],
    ['--label', '--root', '/tmp'],
    ['--label', LABEL, '--root'],
    ['--label', LABEL, '--root', ''],
    ['--label', LABEL, '--root', '--site'],
    ['--label', LABEL, '--site', ''],
    ['--label', LABEL, '--site', '-x'],
    ['--bogus', 'x']
  ]) {
    const s = stand()
    const run = teardown(s, args)
    assert.equal(run.status, 2, `${JSON.stringify(args)}: ${run.stderr}`)
    assert.deepEqual(calls(s), [], `${JSON.stringify(args)} touched docker`)
    assert.ok(existsSync(s.envPath))
  }
})

test('a volume listing that cannot be sorted is a refusal, not an empty host', () => {
  const s = stand({ switches: { 'sort-fails': '', 'down-fails': '' } })
  const run = teardown(s)
  assertKept(s, run)
  assert.match(run.stderr, /cannot sort the volume listing of ja-vega-joomla/)
  assert.ok(!calls(s).some((c) => c.startsWith('volume rm') || c.startsWith('rm ')))
})

test('docker ps output that is not a full container id is never handed to docker rm', () => {
  for (const extra of ['a', NEIGHBOUR_ID.slice(0, 12), `${ORPHAN}0`, 'x; rm -rf /', 'ABCDEF']) {
    const s = stand({
      containers: [`${ORPHAN} ${LABEL}-db-1 ${LABEL}`],
      switches: { 'down-fails': '', 'ps-extra': `${extra}\n` }
    })
    const run = teardown(s)
    assertKept(s, run)
    assert.match(run.stderr, /not a (full )?container id/, extra)
    assert.ok(
      !calls(s).some((c) => c.startsWith('rm ') || c.startsWith('volume rm')),
      `${extra}: nothing removed`
    )
    assertNeighbourUntouched(s)
  }
})

/**
 * Steps 4 and 4b touch the host's firewall and take the allocator's lock: iptables and
 * netfilter-persistent are stubs that log, never the host's own, and flock is a stub (the Mac has none).
 * @param {{ bin: string }} at
 */
function hostStubs(at) {
  // The chain can be read and holds no rule of the site: `-S` lists nothing, `-C` finds nothing.
  writeFileSync(
    path.join(at.bin, 'iptables'),
    '#!/bin/sh\necho "iptables $*" >> "$FAKE_DOCKER_STATE/calls"\n[ "$1" = "-S" ] && exit 0\nexit 1\n',
    { mode: 0o755 }
  )
  writeFileSync(
    path.join(at.bin, 'netfilter-persistent'),
    '#!/bin/sh\necho "netfilter-persistent $*" >> "$FAKE_DOCKER_STATE/calls"\nexit 0\n',
    { mode: 0o755 }
  )
  writeFileSync(path.join(at.bin, 'flock'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
}

test("the site's own network goes with it, and only that one; a network still in use is a teardown that did not finish", () => {
  // provision.sh creates `<label>_default` itself on an explicit /24 under 10.240.0.0/16 (256 of them) and the
  // compose file names it `external: true`, so `compose down` never removed it. Measured 05/10/2026 on a dev Mac:
  // 183 `_default` networks, 182 of the 256 subnets taken, most with no container left.
  // The SMTP rule of the site's subnet goes first (step 4).
  const s = stand()
  hostStubs(s)
  writeFileSync(
    path.join(s.state, 'networks'),
    `${LABEL}_default 10.240.7.0/24\n${NEIGHBOUR}_default 10.240.8.0/24\n`
  )
  const run = teardown(s)
  assertGone(s, run)
  assert.equal(
    table(s, 'networks'),
    `${NEIGHBOUR}_default 10.240.8.0/24\n`,
    "only this site's network is removed"
  )
  const log = calls(s)
  assert.ok(log.includes(`network rm ${LABEL}_default`), log.join('\n'))
  assert.ok(
    log.findIndex((c) => c.startsWith('iptables -C DOCKER-USER -s 10.240.7.0/24')) <
      log.indexOf(`network rm ${LABEL}_default`),
    'the subnet is freed only once its SMTP rule is gone'
  )

  // 🔒 A network docker will not remove has something of the site still attached to it: the teardown
  // did not finish, and says so instead of printing its closing line (it used to say it and succeed).
  const busy = stand({ switches: { 'net-busy': `${LABEL}_default\n` } })
  hostStubs(busy)
  writeFileSync(path.join(busy.state, 'networks'), `${LABEL}_default 10.240.7.0/24\n`)
  const held = teardown(busy)
  assert.equal(held.status, 1, held.stdout + held.stderr)
  assert.ok(!held.stdout.includes(SUCCESS), 'no success marker')
  assert.equal(table(busy, 'networks'), `${LABEL}_default 10.240.7.0/24\n`)
  assert.match(
    held.stderr,
    new RegExp(`could not remove the site network ${LABEL}_default: .*active endpoints`)
  )
  assert.match(
    held.stderr,
    new RegExp(`did not finish: the site network ${LABEL}_default is still on this host`)
  )
  assert.ok(existsSync(teardownLog(busy)), 'the teardown log is kept: it says which step')
  // Once free, the same teardown again finishes.
  rmSync(path.join(busy.state, 'net-busy'))
  const again = teardown(busy)
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.ok(again.stdout.includes(SUCCESS))
  assert.equal(table(busy, 'networks'), '')
})

/**
 * An `rm` on PATH that cannot remove the site's private directory: once (`rm-first`) or every time
 * (`rm-always`). It does what a tree something still writes into leaves behind — every entry gone but
 * `webroot-baseline.git` — says what GNU rm says, and, like `rm -rf`, still removes its other operands.
 * Every other rm is the real one.
 */
const FAKE_RM = `#!/bin/sh
S="$FAKE_DOCKER_STATE"
T="$(cat "$S/rm-target")"
hit=""
for a in "$@"; do [ "$a" = "$T" ] && hit=1; done
[ -n "$hit" ] || exec /bin/rm "$@"
echo "host-rm $*" >> "$S/calls"
if [ -e "$S/rm-always" ] || [ ! -e "$S/rm-failed" ]; then
  : > "$S/rm-failed"
  for a in "$@"; do
    case "$a" in -*) ;; "$T") ;; *) /bin/rm -rf "$a" ;; esac
  done
  find "$T" -mindepth 1 -maxdepth 1 ! -name webroot-baseline.git -exec /bin/rm -rf {} +
  echo "rm: cannot remove '$T/webroot-baseline.git': Directory not empty" >&2
  exit 1
fi
exec /bin/rm "$@"
`

/** A failed install's site: a baseline repository in its private directory, a network, a job record. */
function stuckStand(mode) {
  const s = stand()
  hostStubs(s)
  writeFileSync(path.join(s.bin, 'rm'), FAKE_RM, { mode: 0o755 })
  writeFileSync(path.join(s.bin, 'sleep'), '#!/bin/sh\necho "sleep $*" >> "$FAKE_DOCKER_STATE/calls"\n', {
    mode: 0o755
  })
  writeFileSync(path.join(s.state, 'rm-target'), s.siteDir)
  writeFileSync(path.join(s.state, mode), '')
  mkdirSync(path.join(s.siteDir, 'webroot-baseline.git', 'objects'), { recursive: true })
  writeFileSync(path.join(s.siteDir, 'webroot-baseline.git', 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(path.join(s.state, 'networks'), `${LABEL}_default 10.240.7.0/24\n`)
  writeFileSync(
    path.join(s.root, 'jobs', 'job-1.json'),
    JSON.stringify({ label: LABEL, output: 'site text' })
  )
  return s
}

/** Steps 4, 4b and 5 ran: the subnet's SMTP rule was looked for, the network and the records are gone. */
function assertLaterStepsRan(s) {
  const log = calls(s)
  assert.ok(
    log.some((c) => c.startsWith('iptables -C DOCKER-USER -s 10.240.7.0/24')),
    `step 4 ran: ${log.join('\n')}`
  )
  assert.ok(log.includes(`network rm ${LABEL}_default`), 'step 4b ran')
  assert.equal(table(s, 'networks'), '', "the site's network is gone")
  assert.equal(existsSync(path.join(s.root, 'jobs', 'job-1.json')), false, 'step 5 dropped the job record')
  assert.equal(existsSync(path.join(s.root, 'hooks', `provision-${LABEL}.log`)), false)
}

test('a private directory that will not go at first is tried once more after a short wait, and the teardown finishes', () => {
  // Measured 05/10/2026, twice, on sites whose install had failed: `rm: cannot remove '…/webroot-baseline.git':
  // Directory not empty`, and the teardown ended at step 3.
  const s = stuckStand('rm-first')
  const run = teardown(s)
  assertGone(s, run)
  assertLaterStepsRan(s)
  const log = calls(s)
  const tries = log.flatMap((c, i) => (c.startsWith('host-rm ') ? [i] : []))
  assert.equal(tries.length, 2, log.join('\n'))
  const wait = log.findIndex((c) => c.startsWith('sleep '))
  assert.ok(wait > tries[0] && wait < tries[1], `the second try comes after a wait: ${log.join('\n')}`)
})

test('a private directory that never goes: the steps after it still run, and the teardown fails naming it', () => {
  const s = stuckStand('rm-always')
  const run = teardown(s)
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.ok(!run.stdout.includes(SUCCESS), 'not reported as torn down')
  assertLaterStepsRan(s)
  assert.match(run.stderr, /Directory not empty/, 'rm says why')
  const last = run.stderr.trim().split('\n').at(-1)
  assert.ok(last.includes(s.siteDir), `the last word names the directory left: ${last}`)
  assert.ok(
    existsSync(path.join(s.siteDir, 'webroot-baseline.git')),
    'what could not be removed is still there'
  )
  assert.equal(existsSync(path.join(s.root, 'sites', LABEL)), false, 'the site folder still went')
  assert.ok(existsSync(teardownLog(s)), 'the teardown log is kept: it says why')
})

test('a git gc still running in the baseline repo is waited for, a bounded while, before the directory goes', () => {
  // The leftover of 05/10/2026 was a detached gc from the baseline commit, still repacking when step 3
  // ran (test/webroot-repo-gc.test.mjs). Commits no longer start one; a site made before that can
  // still have one running, and git names it in `gc.pid` ("<pid> <host>").
  const waitStubs = (/** @type {{ bin: string }} */ at) => {
    hostStubs(at)
    writeFileSync(path.join(at.bin, 'sleep'), '#!/bin/sh\necho "sleep $*" >> "$FAKE_DOCKER_STATE/calls"\n', {
      mode: 0o755
    })
  }
  const pidFile = (/** @type {{ siteDir: string }} */ at, body) => {
    mkdirSync(path.join(at.siteDir, 'webroot-baseline.git'), { recursive: true })
    writeFileSync(path.join(at.siteDir, 'webroot-baseline.git', 'gc.pid'), body)
  }
  const waits = (s) => calls(s).filter((c) => c.startsWith('sleep '))

  // This test's own process: alive for the whole run, on this machine — a gc that never finishes.
  const s = stand()
  waitStubs(s)
  pidFile(s, `${process.pid} ${hostname()}`)
  const run = teardown(s)
  assertGone(s, run)
  const waited = waits(s)
  assert.ok(waited.length > 0, 'it waited')
  const seconds = waited.reduce((sum, c) => sum + Number(c.split(' ')[1]), 0)
  assert.ok(seconds <= 10, `bounded: ${seconds} s`)
  assert.match(run.stderr, new RegExp(`git gc \\(pid ${process.pid}\\) still runs`))

  // A process that has ended, or one on another machine, is not waited for.
  const ended = spawnSync('true').pid
  for (const body of [`${ended} ${hostname()}`, `${process.pid} another-host.example`, 'garbage']) {
    const quiet = stand()
    waitStubs(quiet)
    pidFile(quiet, body)
    assertGone(quiet, teardown(quiet))
    assert.deepEqual(waits(quiet), [], body)
  }
})

test("step 5 drops this site's finished job records and keeps the ones still queued or running", () => {
  // Once tracy-host hands teardown.sh its real jobs directory, the teardown's OWN record is in it, labelled with
  // this site and still `running`. Dropped, a deploy's drain (deploy-tracy-stack.sh §3b waits until no job is
  // queued or running) would read the host as idle and replace tracy-host in the middle of the teardown.
  const s = stand()
  const jobs = path.join(s.root, 'jobs')
  const record = (/** @type {string} */ id, /** @type {object} */ body) =>
    writeFileSync(path.join(jobs, `${id}.json`), JSON.stringify(body))
  record('provision-old', { label: LABEL, state: 'failed', output: 'site text' })
  record('webroot-old', { label: LABEL, state: 'done', output: 'site text' })
  record('legacy', { label: LABEL, output: 'site text' })
  record('this-teardown', { label: LABEL, state: 'running', step: 'teardown' })
  record('queued-look', { label: LABEL, state: 'queued' })
  record('neighbour', { label: NEIGHBOUR, state: 'done' })
  assertGone(s, teardown(s))
  assert.deepEqual(readdirSync(jobs).sort(), ['neighbour.json', 'queued-look.json', 'this-teardown.json'])
})
