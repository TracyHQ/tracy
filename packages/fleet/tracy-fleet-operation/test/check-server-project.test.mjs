#!/usr/bin/env node
/**
 * `check-server.sh`, usable for a SECOND, prefixed compose stack on the same host (trial shard d1 next
 * to the master) while the master's own check stays what it is. Companions: `deploy-stack-project.test.mjs`
 * and `deploy-host-dsh-project.test.mjs`.
 *
 *   - `--project <name>` / `TRACY_COMPOSE_PROJECT` -> `docker compose -p <name>` on every compose call;
 *   - `TRACY_STACK_EXTRA_FILES` -> one more `-f` per entry, after the two base files;
 *   - `TRACY_STACK_ENV_FILE` handed to the compose process, and the default of `--env-file`;
 *   - `TRACY_POSTGRES_CONTAINER` / `HOST_DSH_CONTAINER` replace the two container-name literals, and are
 *     validated (exit 2) because they are spliced into `docker ps -f`, `docker exec` and `grep -Fx`.
 *
 * 🔒 THE HARD REQUIREMENT IS THE DEFAULT: with none of them set, every docker argv is what it was before
 * this change. The `golden` case pins the argv sequence the script at origin/develop produced against
 * this same stub (recorded when this change was made, by running both versions side by side). It is new,
 * so it never failed against the old script: it stops the default from moving LATER. That it did not
 * move NOW is the side-by-side run in the PR.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/check-server-project.test.mjs
 *
 * The script is driven end to end on any OS with shims for the few things it needs from Linux (`uname`,
 * `curl`, `getent`, `systemctl`, a fake `docker`). Nothing here starts a container.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { baseEnv, composeCalls, readCalls } from './stack-project-support.mjs'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const CHECK_SERVER = fileURLToPath(new URL('../../../../deploy/scripts/check-server.sh', import.meta.url))

const hasJq = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status === 0

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\t%s\\n' "$*" "\${TRACY_STACK_ENV_FILE-<unset>}" >> "$FAKE_LOG"
args="$*"
PG="\${FAKE_PG:-tracy-postgres-1}"
DSH="\${FAKE_DSH:-tracy-dsh}"
case "$args" in
  compose*" ps -q tracy-web") echo cid-web ;;
  compose*" ps --format json "*) echo '{"Health":"healthy"}' ;;
  "exec cid-web cat /opt/tracy-web/static/ops/index.html") echo '<script src="/ops/a.js"></script>' ;;
  "exec cid-web cat /opt/tracy-web/static/design-inspiration/index.html") echo '<script src="/design-inspiration/a.js"></script>' ;;
  "exec cid-web cat /opt/tracy-web/static/find/index.html") echo '<script src="/find/a.js"></script>' ;;
  "exec cid-web cat /opt/tracy-web/static/docs/index.html") echo '<script src="/_astro/a.js"></script>' ;;
  "exec cid-web ls "*) : ;;
  "exec cid-web node -e "*) echo ok ;;
  "ps -qf name=$PG") echo cid-pg ;;
  "ps --format {{.Names}}") printf '%s\\n' "$FAKE_PS_NAMES" ;;
  "exec $DSH sh -c "*MCP_SEAT_SECRET*) echo "seat-secret" ;;
  "exec $DSH sh -c "*) exit 0 ;;
  *) : ;;
esac
`
const DOCKER_STUB = warmStub('docker-check', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })
const FAKE_UNAME = warmStub('uname', '#!/bin/sh\necho Linux\n')
const FAKE_CURL = warmStub(
  'curl',
  `#!/usr/bin/env bash
url="\${@: -1}"
case "$*" in
  *"%{http_code}"*) case "$url" in */login) printf 404 ;; *) printf 200 ;; esac ;;
  *) printf '{"ok":true,"docker":true}' ;;
esac
`
)
const FAIL_STUB = warmStub('fail', '#!/bin/sh\nexit 1\n')

function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-server-project-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  linkStub(FAKE_UNAME, path.join(dir, 'bin/uname'))
  linkStub(FAKE_CURL, path.join(dir, 'bin/curl'))
  linkStub(FAIL_STUB, path.join(dir, 'bin/getent'))
  linkStub(FAIL_STUB, path.join(dir, 'bin/systemctl'))
  for (const f of ['compose.yml', 'compose.server.yml', 'extra-a.yml', 'extra-b.yml'])
    writeFileSync(path.join(dir, f), 'services: {}\n')
  for (const d of ['sites', 'private']) mkdirSync(path.join(dir, d))
  const dshHome = path.join(dir, 'dshhome')
  mkdirSync(path.join(dshHome, 'profiles/native/node_modules/@tracy/dsh-native-bundle'), { recursive: true })
  writeFileSync(
    path.join(dshHome, 'profiles/native/node_modules/@tracy/dsh-native-bundle/package.json'),
    '{}\n'
  )
  writeFileSync(
    path.join(dir, 'tracy-web.env'),
    [
      'HOST_NAME=dev',
      'HOST_dev_ORIGIN=http://host.docker.internal:51720',
      'HOST_dev_DSH_ORIGIN=http://tracy-dsh:8080',
      'SEAT_dev_SECRET=seat-secret',
      'TRACY_EGRESS_FENCE=off',
      `TRACY_SITES_ROOT=${dir}/sites`,
      `TRACY_PRIVATE_ROOT=${dir}/private`,
      `TRACY_DSH_HOME=${dshHome}`,
      'MODEL_API_KEY=k',
      'SITE_DOMAIN=tracy.test',
      'SITE_ADDRESS_PREFIX=',
      'DOCS_ORIGIN=https://docs.tracy.test',
      ''
    ].join('\n')
  )
  return dir
}

/** `envFile`: a string, `undefined` for the host's own file, or `null` for no `--env-file` flag at all. */
async function check(dir, args = [], env = {}, { envFile, cwd } = {}) {
  const log = path.join(dir, 'docker.log')
  const flag = envFile === null ? [] : ['--env-file', envFile ?? path.join(dir, 'tracy-web.env')]
  const res = await sh('bash', [CHECK_SERVER, '--stack-dir', dir, ...flag, ...args], {
    encoding: 'utf8',
    cwd,
    env: baseEnv(dir, { FAKE_LOG: log, FAKE_PS_NAMES: 'tracy-dsh\ntracy-d1-dsh', ...env })
  })
  const calls = existsSync(log) ? readCalls(readFileSync(log, 'utf8')) : []
  return { ...res, calls, argvs: calls.map((c) => c.argv) }
}

const prefix = (dir) =>
  `compose --env-file ${dir}/tracy-web.env -f ${dir}/compose.yml -f ${dir}/compose.server.yml `

describe('check-server.sh — a second stack, the master untouched', {
  concurrency: 8,
  skip: !hasJq && 'jq is not installed'
}, () => {
  test('the shimmed run really gets to the end (so the cases below prove something)', async (t) => {
    const r = await check(makeHost(t))
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /All green/)
  })

  test('golden: with no flag and no variable the compose argv and the container names are the literals', async (t) => {
    const dir = makeHost(t)
    const r = await check(dir)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 4)
    for (const c of calls) {
      assert.ok(c.argv.startsWith(prefix(dir)), c.argv)
      assert.doesNotMatch(c.argv, / -p /)
      assert.equal(c.argv.match(/ -f /g).length, 2, c.argv)
      assert.equal(c.env, path.join(dir, 'tracy-web.env'), c.argv)
    }
    assert.deepEqual(
      calls.map((c) => c.argv.slice(prefix(dir).length)),
      [
        'ps -q tracy-web',
        'ps --format json postgres',
        'ps --format json tracy-web',
        'ps --format json tracy-host'
      ]
    )
    assert.ok(r.argvs.includes('ps -qf name=tracy-postgres-1'), r.argvs.join('\n'))
    assert.ok(
      r.argvs.some((a) => a.startsWith('exec tracy-dsh sh -c ')),
      r.argvs.join('\n')
    )
    assert.match(r.stdout, /^• proj : <from compose file>$/m)
  })

  test('--project tracy-d1: every compose call carries -p; the container names follow the variables (TD.11)', async (t) => {
    const dir = makeHost(t)
    const r = await check(dir, ['--project', 'tracy-d1'], {
      TRACY_POSTGRES_CONTAINER: 'tracy-d1-postgres-1',
      HOST_DSH_CONTAINER: 'tracy-d1-dsh',
      FAKE_PG: 'tracy-d1-postgres-1',
      FAKE_DSH: 'tracy-d1-dsh'
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 4)
    for (const c of calls) assert.ok(c.argv.startsWith(`compose -p tracy-d1 ${prefix(dir).slice(8)}`), c.argv)
    assert.ok(r.argvs.includes('ps -qf name=tracy-d1-postgres-1'), r.argvs.join('\n'))
    assert.ok(r.argvs.some((a) => a.startsWith('exec tracy-d1-dsh sh -c ')))
    assert.deepEqual(
      r.argvs.filter((a) => a.startsWith('exec tracy-dsh ') || a === 'ps -qf name=tracy-postgres-1'),
      [],
      'a check reached the master containers'
    )
    assert.match(r.stdout, /^• proj : tracy-d1$/m)
    // The `docker restart` hint must name the container this run looked at, not the master's.
    assert.doesNotMatch(r.stdout + r.stderr, /docker restart tracy-dsh\b/)
  })

  test('TRACY_COMPOSE_PROJECT works and the flag beats it', async (t) => {
    const fromEnv = await check(makeHost(t), [], { TRACY_COMPOSE_PROJECT: 'tracy-d1' })
    for (const c of composeCalls(fromEnv.calls)) assert.match(c.argv, /^compose -p tracy-d1 --env-file /)
    const both = await check(makeHost(t), ['--project', 'tracy-flag'], { TRACY_COMPOSE_PROJECT: 'tracy-env' })
    for (const c of composeCalls(both.calls)) assert.match(c.argv, /^compose -p tracy-flag --env-file /)
  })

  for (const name of ['Tracy', '-x', 'a b', '']) {
    test(`an invalid project ${JSON.stringify(name)} is a usage error before any docker call`, async (t) => {
      const dir = makeHost(t)
      const r = await check(dir, ['--project', name])
      assert.equal(r.status, 2, r.stderr + r.stdout)
      assert.match(r.stderr, /project/i)
      assert.deepEqual(r.calls, [], 'docker was called')
      if (name === '') return
      const viaEnv = await check(dir, [], { TRACY_COMPOSE_PROJECT: name })
      assert.equal(viaEnv.status, 2, viaEnv.stderr + viaEnv.stdout)
      assert.deepEqual(viaEnv.calls, [])
    })
  }

  for (const variable of ['HOST_DSH_CONTAINER', 'TRACY_POSTGRES_CONTAINER']) {
    for (const name of ['bad name', '-x', '.x', 'a/b', 'a;b', '$(id)']) {
      test(`an invalid ${variable} ${JSON.stringify(name)} is a usage error before any docker call`, async (t) => {
        const r = await check(makeHost(t), [], { [variable]: name })
        assert.equal(r.status, 2, r.stderr + r.stdout)
        assert.ok(r.stderr.includes(variable), r.stderr)
        assert.deepEqual(r.calls, [], 'docker was called')
      })
    }
  }

  test('valid container names pass, the defaults included', async (t) => {
    const r = await check(makeHost(t), [], {
      TRACY_POSTGRES_CONTAINER: 'Tracy_D1.postgres-1',
      HOST_DSH_CONTAINER: 'tracy-dsh',
      FAKE_PG: 'Tracy_D1.postgres-1'
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
  })

  test('TRACY_STACK_EXTRA_FILES adds one -f per entry after the two base files on every call', async (t) => {
    const dir = makeHost(t)
    const a = path.join(dir, 'extra-a.yml')
    const b = path.join(dir, 'extra-b.yml')
    const r = await check(dir, [], { TRACY_STACK_EXTRA_FILES: `${a} ${b}` })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    for (const c of composeCalls(r.calls)) {
      assert.ok(c.argv.startsWith(`${prefix(dir)}-f ${a} -f ${b} `), c.argv)
      assert.equal(c.argv.match(/ -f /g).length, 4, c.argv)
    }
  })

  test('a missing extra file fails by name before any docker call', async (t) => {
    const dir = makeHost(t)
    const missing = path.join(dir, 'no-such-overlay.yml')
    const r = await check(dir, [], { TRACY_STACK_EXTRA_FILES: `${path.join(dir, 'extra-a.yml')} ${missing}` })
    assert.notEqual(r.status, 0, r.stdout)
    assert.ok((r.stderr + r.stdout).includes(missing), r.stderr + r.stdout)
    assert.deepEqual(r.calls, [], 'docker was called')
  })

  test('a relative --env-file is made absolute in what compose sees', async (t) => {
    const dir = makeHost(t)
    const r = await check(dir, [], {}, { envFile: 'tracy-web.env', cwd: dir })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 4)
    for (const c of calls) assert.equal(c.env, path.join(realpathSync(dir), 'tracy-web.env'), c.argv)
  })

  test('TRACY_STACK_ENV_FILE instead of --env-file selects the file, for the script and for compose', async (t) => {
    const dir = makeHost(t)
    const file = path.join(dir, 'tracy-web.env')
    const r = await check(dir, [], { TRACY_STACK_ENV_FILE: file }, { envFile: null })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, new RegExp(`^• env {2}: ${file}$`, 'm'))
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 4)
    for (const c of calls) assert.equal(c.env, file, c.argv)
  })

  test('--env-file wins over TRACY_STACK_ENV_FILE', async (t) => {
    const dir = makeHost(t)
    const r = await check(dir, [], { TRACY_STACK_ENV_FILE: path.join(dir, 'no-such.env') })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    for (const c of composeCalls(r.calls)) assert.equal(c.env, path.join(dir, 'tracy-web.env'))
  })

  test('--help is in English, names the flag and the variables, and says where --env-file defaults to', async (t) => {
    const dir = makeHost(t)
    const r = await sh('bash', [CHECK_SERVER, '--help'], { encoding: 'utf8', env: baseEnv(dir) })
    assert.equal(r.status, 0)
    for (const word of [
      '--project <name>',
      'TRACY_COMPOSE_PROJECT',
      'TRACY_STACK_EXTRA_FILES',
      'TRACY_POSTGRES_CONTAINER',
      'HOST_DSH_CONTAINER',
      'TRACY_STACK_ENV_FILE'
    ])
      assert.ok(r.stdout.includes(word), word)
    assert.doesNotMatch(r.stdout, /mặc định|thư mục|tự tìm/)
  })
})
