#!/usr/bin/env node
/**
 * `deploy-tracy-stack.sh` and `compose.server.yml`, usable by a SECOND, prefixed compose stack on the
 * same host (trial shard d1 next to the master) while the master's own commands stay what they are.
 * The companions are `deploy-host-dsh-project.test.mjs` and `check-server-project.test.mjs`.
 *
 * The knobs of this script:
 *
 *   - `--project <name>` / `TRACY_COMPOSE_PROJECT` -> `docker compose -p <name>` on EVERY compose call
 *     (flag beats env; unset means NO `-p` at all, so compose keeps reading `name:` from the file);
 *   - `TRACY_STACK_EXTRA_FILES` -> one more `-f` per entry, after the two base files, on every call;
 *   - `TRACY_STACK_ENV_FILE` handed to the compose process, equal to the env file the run was given
 *     (absolute), so `env_file: ${TRACY_STACK_ENV_FILE:-…}` in compose.server.yml follows it;
 *   - a project with the master's default env file is refused (exit 2): it would run the new
 *     containers on the master's secrets;
 *   - the last line of a deploy is a rollback command that repeats every non-default value.
 *
 * 🔒 THE HARD REQUIREMENT IS THE DEFAULT. With no flag and no variable, every compose argv must be what
 * it was before this change (same files, no `-p`), because the compose config hash of every master
 * service is derived from it and a moved hash recreates the master's containers at the next deploy.
 * The `golden` cases pin the argv sequence the scripts at origin/develop produced against this same
 * stub (recorded when this change was made, by running both versions side by side). They are new, so
 * they never failed against the old scripts: they stop the default from moving LATER. That the default
 * did not move NOW is the side-by-side run and the `docker compose config` proofs in the PR.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-stack-project.test.mjs
 *
 * `docker` is a stub on PATH that logs every call with the TRACY_STACK_ENV_FILE the compose process
 * would have seen. Nothing here starts a container.
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
import {
  baseEnv,
  canRenderConfig,
  composeCalls,
  defaultAssignments,
  readCalls,
  shellFunction
} from './stack-project-support.mjs'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const STACK_DEPLOY = fileURLToPath(
  new URL('../../../../deploy/scripts/deploy-tracy-stack.sh', import.meta.url)
)
const SERVER_YML = fileURLToPath(new URL('../../../../deploy/compose.server.yml', import.meta.url))
const BASE_YML = fileURLToPath(new URL('../../../../deploy/compose.yml', import.meta.url))
const MASTER_ENV = '/etc/tracy/tracy-web.env'

// A healthy host: every service has a container, every container is healthy and runs the image the
// deploy asked for. `FAKE_STATE` turns the health wait red.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\t%s\\n' "$*" "\${TRACY_STACK_ENV_FILE-<unset>}" >> "$FAKE_LOG"
args="$*"
case "$args" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  compose*" ps -q "*) echo "cid-\${args##* }" ;;
  "inspect cid-"*"{{.State.Status}}"*) echo "\${FAKE_STATE:-running/healthy}" ;;
  "inspect cid-"*"{{.Config.Image}}"*) svc="\${args#inspect cid-}"; svc="\${svc%% *}"
    case "$svc" in tracy-web) echo "ghcr.io/tracyhq/tracy-web:new" ;; *) echo "ghcr.io/tracyhq/tracy-host:new" ;; esac ;;
  compose*"exec -T tracy-host curl"*"/health"*) echo '{"ok":true,"docker":true}' ;;
  compose*"exec -T tracy-host curl"*"/api/config"*) echo '{"origin":"https://cowork.tracy.test"}' ;;
  *) : ;;
esac
`
const DOCKER_STUB = warmStub('docker-stack', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })
const NOOP_STUB = warmStub('noop', '#!/bin/sh\nexit 0\n')
// Prints what a pasted rollback command would run: the env var it sets, then each argument on a line.
const ARGV_STUB = warmStub(
  'argv-stub',
  '#!/bin/sh\nprintf "extra=%s\\n" "$TRACY_STACK_EXTRA_FILES"\nfor a in "$@"; do printf "[%s]\\n" "$a"; done\n'
)

const FULL_ENV =
  'HOST_NAME=dev\nHOST_dev_SECRET=s\nHOST_dev_ORIGIN=https://dev-host.tracy.test/_host\n' +
  'TRACY_ORIGIN=https://cowork.tracy.test\nAPP_IMAGE_TAG=old\n'

function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-stack-project-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  linkStub(NOOP_STUB, path.join(dir, 'bin/sleep'))
  for (const f of ['compose.yml', 'compose.server.yml', 'extra-a.yml', 'extra-b.yml'])
    writeFileSync(path.join(dir, f), 'services: {}\n')
  writeFileSync(path.join(dir, 'tracy-web.env'), FULL_ENV)
  return dir
}

/**
 * Run a deploy of tag `new`. `envFile` is the `--env-file` value: a string, `undefined` for the host's
 * own file, or `null` for no flag at all (the default, or TRACY_STACK_ENV_FILE if the case sets it).
 */
async function deploy(dir, args, env = {}, { envFile, cwd } = {}) {
  const log = path.join(dir, 'docker.log')
  const flag = envFile === null ? [] : ['--env-file', envFile ?? path.join(dir, 'tracy-web.env')]
  const res = await sh('bash', [STACK_DEPLOY, '--stack-dir', dir, ...flag, '--tag', 'new', ...args], {
    encoding: 'utf8',
    cwd,
    env: baseEnv(dir, { FAKE_LOG: log, ...env })
  })
  const calls = existsSync(log) ? readCalls(readFileSync(log, 'utf8')) : []
  return { ...res, calls, envFile: readFileSync(path.join(dir, 'tracy-web.env'), 'utf8') }
}

/** What every compose argv starts with when nothing is set. */
const prefix = (dir) =>
  `compose --env-file ${dir}/tracy-web.env -f ${dir}/compose.yml -f ${dir}/compose.server.yml `

describe('deploy-tracy-stack.sh — a second stack, the master untouched', { concurrency: 8 }, () => {
  test('golden: with no flag and no variable the compose argv are the origin/develop ones', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    for (const c of calls) {
      assert.ok(c.argv.startsWith(prefix(dir)), c.argv)
      assert.doesNotMatch(c.argv, / -p /)
      assert.equal(c.argv.match(/ -f /g).length, 2, c.argv)
      // …and the compose process sees the env file the run was given, which is what compose.server.yml
      // falls back to anyway on a master that was never given another.
      assert.equal(c.env, path.join(dir, 'tracy-web.env'), c.argv)
    }
    assert.deepEqual(
      calls.map((c) => c.argv.slice(prefix(dir).length)),
      [
        'pull postgres tracy-web tracy-host',
        'ps -q tracy-host', // host_replaced
        'up -d postgres tracy-web tracy-host',
        'ps -q postgres',
        'ps -q tracy-web',
        'ps -q tracy-host',
        'ps -q tracy-web', // 6b: WEB_CID
        'ps -q postgres', // 6b: PG_CID
        'exec -T tracy-host curl -fsS --max-time 10 http://127.0.0.1:51710/api/config',
        'exec -T tracy-host curl -fsS --max-time 10 http://127.0.0.1:51720/health',
        'ps -q tracy-web', // check_image
        'ps -q tracy-host',
        'ps -q tracy-host' // EXIT trap: clear_host_draining
      ]
    )
    assert.match(r.stdout, /^project {4}: <from compose file>$/m)
    assert.doesNotMatch(r.stdout, /extra files/)
  })

  test('--project tracy-d1: every compose call carries -p, the env file is unchanged', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, ['--project', 'tracy-d1'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 10, 'the deploy ran too few compose calls to prove anything')
    for (const c of calls) assert.ok(c.argv.startsWith(`compose -p tracy-d1 ${prefix(dir).slice(8)}`), c.argv)
    assert.match(r.stdout, /^project {4}: tracy-d1$/m)
    assert.match(r.envFile, /^APP_IMAGE_TAG=new$/m)
    // 🔒 The project name travels in argv only. COMPOSE_PROJECT_NAME in any env file would reach
    // tracy-host through env_file and rename the project of every site's own `docker compose up`.
    assert.doesNotMatch(r.envFile, /COMPOSE_PROJECT_NAME/)
    assert.doesNotMatch(r.calls.map((c) => c.argv).join('\n'), /COMPOSE_PROJECT_NAME/)
  })

  test('TRACY_COMPOSE_PROJECT works, the flag beats it, and an empty variable means unset', async (t) => {
    const fromEnv = await deploy(makeHost(t), [], { TRACY_COMPOSE_PROJECT: 'tracy-d1' })
    assert.equal(fromEnv.status, 0, fromEnv.stderr + fromEnv.stdout)
    for (const c of composeCalls(fromEnv.calls)) assert.match(c.argv, /^compose -p tracy-d1 --env-file /)

    const both = await deploy(makeHost(t), ['--project', 'tracy-flag'], {
      TRACY_COMPOSE_PROJECT: 'tracy-env'
    })
    assert.equal(both.status, 0, both.stderr + both.stdout)
    for (const c of composeCalls(both.calls)) assert.match(c.argv, /^compose -p tracy-flag --env-file /)
    assert.doesNotMatch(both.calls.map((c) => c.argv).join('\n'), /tracy-env/)

    const empty = await deploy(makeHost(t), [], { TRACY_COMPOSE_PROJECT: '' })
    assert.equal(empty.status, 0, empty.stderr + empty.stdout)
    for (const c of composeCalls(empty.calls)) assert.doesNotMatch(c.argv, / -p /)
  })

  for (const name of ['Tracy', 'tracy-D1', '-x', '_x', 'a b', 'tracy.d1', 'tracy/d1', '']) {
    test(`an invalid project ${JSON.stringify(name)} is a usage error before any docker call`, async (t) => {
      const dir = makeHost(t)
      const viaFlag = await deploy(dir, ['--project', name])
      assert.equal(viaFlag.status, 2, viaFlag.stderr + viaFlag.stdout)
      assert.match(viaFlag.stderr, /project/i)
      assert.deepEqual(viaFlag.calls, [], 'docker was called')
      assert.match(viaFlag.envFile, /^APP_IMAGE_TAG=old$/m)
      if (name === '') return // an empty VARIABLE means unset (checked above); only the flag is an error
      const viaEnv = await deploy(dir, [], { TRACY_COMPOSE_PROJECT: name })
      assert.equal(viaEnv.status, 2, viaEnv.stderr + viaEnv.stdout)
      assert.deepEqual(viaEnv.calls, [], 'docker was called')
    })
  }

  test('--project with no value is a usage error', async (t) => {
    const dir = makeHost(t)
    const log = path.join(dir, 'docker.log')
    const r = await sh('bash', [STACK_DEPLOY, '--stack-dir', dir, '--tag', 'new', '--project'], {
      encoding: 'utf8',
      env: baseEnv(dir, { FAKE_LOG: log })
    })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.equal(existsSync(log), false, 'docker was called')
  })

  test('TRACY_STACK_EXTRA_FILES adds one -f per entry, after the two base files, on every call', async (t) => {
    const dir = makeHost(t)
    const a = path.join(dir, 'extra-a.yml')
    const b = path.join(dir, 'extra-b.yml')
    // Separators are any whitespace: spaces, a tab, a newline.
    const r = await deploy(dir, [], { TRACY_STACK_EXTRA_FILES: `${a}  \t${b}\n` })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 10)
    for (const c of calls) {
      assert.ok(c.argv.startsWith(`${prefix(dir)}-f ${a} -f ${b} `), c.argv)
      assert.doesNotMatch(c.argv, / -p /)
      assert.equal(c.argv.match(/ -f /g).length, 4, c.argv)
    }
    assert.match(r.stdout, new RegExp(`^extra files: ${a} ${b}$`, 'm'))
  })

  test('a missing extra file stops the deploy by name before anything is pulled or written', async (t) => {
    const dir = makeHost(t)
    const missing = path.join(dir, 'no-such-overlay.yml')
    const r = await deploy(dir, [], {
      TRACY_STACK_EXTRA_FILES: `${path.join(dir, 'extra-a.yml')} ${missing}`
    })
    assert.notEqual(r.status, 0, r.stdout)
    assert.ok(r.stderr.includes(missing), r.stderr)
    assert.deepEqual(composeCalls(r.calls), [], 'a compose command ran for a file that does not exist')
    assert.match(r.envFile, /^APP_IMAGE_TAG=old$/m)
    assert.doesNotMatch(r.envFile, /APP_IMAGE_TAG_PREVIOUS/)
  })

  test('project and extra files together reach the rollback `up` as well as the first one', async (t) => {
    const dir = makeHost(t)
    const a = path.join(dir, 'extra-a.yml')
    const r = await deploy(dir, ['--project', 'tracy-d1', '--timeout', '1'], {
      TRACY_STACK_EXTRA_FILES: a,
      FAKE_STATE: 'exited/none'
    })
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /putting old back/)
    const ups = composeCalls(r.calls).filter((c) => / up -d /.test(c.argv))
    assert.equal(ups.length, 2, 'the deploy `up` and the rollback `up`')
    for (const c of ups)
      assert.ok(c.argv.startsWith(`compose -p tracy-d1 ${prefix(dir).slice(8)}-f ${a} up -d`), c.argv)
  })

  test('--help names the new flag and variables', async (t) => {
    const dir = makeHost(t)
    const r = await sh('bash', [STACK_DEPLOY, '--help'], { encoding: 'utf8', env: baseEnv(dir) })
    assert.equal(r.status, 0)
    for (const word of [
      '--project <name>',
      'TRACY_COMPOSE_PROJECT',
      'TRACY_STACK_EXTRA_FILES',
      'TRACY_STACK_ENV_FILE'
    ])
      assert.ok(r.stdout.includes(word), word)
    assert.match(r.stdout, /refused \(exit 2\)/)
  })
})

describe('deploy-tracy-stack.sh — the env file compose is handed', { concurrency: 8 }, () => {
  test('a relative --env-file is made absolute in what compose sees', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], {}, { envFile: 'tracy-web.env', cwd: dir })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 10)
    // The shell's own working directory, which on macOS is the /private/var form of the temp dir.
    const abs = path.join(realpathSync(dir), 'tracy-web.env')
    for (const c of calls) assert.equal(c.env, abs, c.argv)
    assert.match(r.envFile, /^APP_IMAGE_TAG=new$/m)
  })

  test('TRACY_STACK_ENV_FILE instead of --env-file selects the file, for the script and for compose', async (t) => {
    const dir = makeHost(t)
    const file = path.join(dir, 'tracy-web.env')
    const r = await deploy(dir, [], { TRACY_STACK_ENV_FILE: file }, { envFile: null })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.ok(calls.length >= 10)
    for (const c of calls) {
      assert.ok(c.argv.startsWith(prefix(dir)), c.argv)
      assert.equal(c.env, file, c.argv)
    }
    assert.match(r.envFile, /^APP_IMAGE_TAG=new$/m)
  })

  test('--env-file wins over TRACY_STACK_ENV_FILE', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { TRACY_STACK_ENV_FILE: path.join(dir, 'no-such.env') })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    for (const c of composeCalls(r.calls)) assert.equal(c.env, path.join(dir, 'tracy-web.env'))
  })
})

describe('deploy-tracy-stack.sh — a project needs its own env file', { concurrency: 8 }, () => {
  test('--project with the default env file is refused (exit 2) before any docker call', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, ['--project', 'tracy-d1'], {}, { envFile: null })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.ok(r.stderr.includes(MASTER_ENV), r.stderr)
    assert.match(r.stderr, /--env-file/)
    assert.deepEqual(r.calls, [], 'docker was called')
    assert.match(r.envFile, /^APP_IMAGE_TAG=old$/m)
  })

  test('TRACY_COMPOSE_PROJECT with the default env file is refused the same way', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { TRACY_COMPOSE_PROJECT: 'tracy-d1' }, { envFile: null })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.deepEqual(r.calls, [], 'docker was called')
  })

  test('naming the master file by hand is no way round it', async (t) => {
    const r = await deploy(makeHost(t), ['--project', 'tracy-d1'], {}, { envFile: MASTER_ENV })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.deepEqual(r.calls, [], 'docker was called')
  })

  // On a machine that really has the master's file (a host, a runner) this case would read it, so it
  // is not run there; `--dry-run` keeps it from changing anything where it does run.
  test('no project and the default env file is not a usage error: the guard is for a second stack only', {
    skip: existsSync(MASTER_ENV) && `${MASTER_ENV} exists on this machine`
  }, async (t) => {
    const r = await deploy(makeHost(t), ['--dry-run'], {}, { envFile: null })
    assert.equal(r.status, 1, r.stderr + r.stdout)
    assert.ok(r.stderr.includes(`no ${MASTER_ENV}`), r.stderr)
    assert.deepEqual(
      r.calls.filter((c) => c.argv !== 'compose version'),
      [],
      'docker was asked to act'
    )
  })
})

describe('deploy-tracy-stack.sh — the rollback command on the last line', { concurrency: 8 }, () => {
  const defaults = () =>
    defaultAssignments(STACK_DEPLOY, [
      'DEFAULT_ENV_FILE',
      'WEB_IMAGE_REPO',
      'HOST_IMAGE_REPO',
      'SERVICES',
      'PROJECT'
    ])

  /** Run `rollback_command` alone, after `setup` has set the variables it reads. */
  function rollbackCommand(setup, zero = STACK_DEPLOY) {
    const code = [
      'set -u',
      defaults(),
      'EXTRA_FILES=()',
      'ENV_FILE_ABS="$DEFAULT_ENV_FILE"',
      'STACK_DIR_EXPLICIT=0',
      'STACK_DIR=',
      shellFunction(STACK_DEPLOY, 'shquote'),
      shellFunction(STACK_DEPLOY, 'rollback_command'),
      setup,
      'rollback_command'
    ].join('\n')
    const r = spawnSync('bash', ['-c', code, zero], { encoding: 'utf8', env: baseEnv(tmpdir()) })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout
  }

  test('every value at its default: the text is `<script> --rollback`, as it always was', () => {
    assert.equal(rollbackCommand(''), `${STACK_DEPLOY} --rollback`)
  })

  test('a value that is the default but was named is not repeated, except the stack directory', () => {
    assert.equal(
      rollbackCommand('ENV_FILE_ABS=/etc/tracy/tracy-web.env\nWEB_IMAGE_REPO=ghcr.io/tracyhq/tracy-web'),
      `${STACK_DEPLOY} --rollback`
    )
  })

  test('a non-default deploy prints the whole command: project, env file, directory, overlays, services', async (t) => {
    const dir = makeHost(t)
    const a = path.join(dir, 'extra-a.yml')
    const b = path.join(dir, 'extra-b.yml')
    const r = await deploy(dir, ['--project', 'tracy-d1', '--services', 'postgres,tracy-web,tracy-host'], {
      TRACY_STACK_EXTRA_FILES: `${a} ${b}`
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const line = r.stdout.split('\n').find((l) => l.startsWith('roll back with: '))
    assert.equal(
      line,
      `roll back with: TRACY_STACK_EXTRA_FILES='${a} ${b}' ${STACK_DEPLOY} --rollback --project tracy-d1 ` +
        `--env-file ${dir}/tracy-web.env --stack-dir ${dir}`
    )
  })

  test('a demo-only host repeats its service list', async (t) => {
    const dir = makeHost(t)
    writeFileSync(path.join(dir, 'tracy-web.env'), 'HOST_NAME=demo\nHOST_demo_SECRET=s\nAPP_IMAGE_TAG=old\n')
    const r = await deploy(dir, ['--services', 'tracy-host'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.ok(r.stdout.includes('--services tracy-host\n'), r.stdout)
  })

  test('the printed line pastes back as the same words, quoting included', () => {
    const out = rollbackCommand(
      [
        'PROJECT=tracy-d1',
        `ENV_FILE_ABS="/etc/tracy/d 1/it's.env"`,
        'EXTRA_FILES=("/o/a.yml" "/o/b.yml")',
        'STACK_DIR_EXPLICIT=1',
        'STACK_DIR=/opt/tracy-d1/stack'
      ].join('\n'),
      ARGV_STUB
    )
    const run = spawnSync('bash', ['-c', `eval "$1"`, 'x', out], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(
      run.stdout,
      [
        'extra=/o/a.yml /o/b.yml',
        '[--rollback]',
        '[--project]',
        '[tracy-d1]',
        '[--env-file]',
        `[/etc/tracy/d 1/it's.env]`,
        '[--stack-dir]',
        '[/opt/tracy-d1/stack]',
        ''
      ].join('\n')
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// compose.server.yml — TD.17a / TD.17b, rendered by the real `docker compose config`
// ═════════════════════════════════════════════════════════════════════════════════════════════════

function renderConfig(t, vars = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'compose-server-render-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const envFile = path.join(dir, 'dummy.env')
  writeFileSync(
    envFile,
    [
      'HOST_NAME=dev',
      'TRACY_ORIGIN=https://x',
      'TRACY_SITES_ROOT=/srv/tracy-sites',
      'TRACY_PRIVATE_ROOT=/srv/tracy-private',
      'TRACY_DSH_HOME=/srv/tracy/host-dsh/home',
      'HOST_local_SECRET=x',
      'SEAT_local_SECRET=y',
      'MCP_TRACY_ACTOR_SECRET=z',
      ''
    ].join('\n')
  )
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    HOST_SECRET: 'x',
    // compose.yml requires these with no default; placeholders let the render proceed.
    POSTGRES_PASSWORD: 'placeholder',
    MINIO_PASSWORD: 'placeholder',
    WEB_IMAGE: 'ghcr.io/tracyhq/tracy-web',
    HOST_IMAGE: 'ghcr.io/tracyhq/tracy-host',
    APP_IMAGE_TAG: 't',
    ...vars
  }
  const r = spawnSync(
    'docker',
    ['compose', '--env-file', envFile, '-f', BASE_YML, '-f', SERVER_YML, 'config', '--no-env-resolution'],
    { encoding: 'utf8', env }
  )
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}
const envFileOf = (yaml, service) =>
  yaml.match(new RegExp(`^  ${service}:[\\s\\S]*?^    env_file:\\n      - path: (\\S+)`, 'm'))?.[1]
const dshNetworkName = (yaml) => yaml.match(/^  dsh:\n    name: (\S+)/m)?.[1]

describe('compose.server.yml — env_file and the dsh network are variables whose default is the old literal', {
  skip: !canRenderConfig && 'docker compose config --no-env-resolution is not available'
}, () => {
  test('no variables: the old literals, for both services', (t) => {
    const out = renderConfig(t)
    assert.equal(envFileOf(out, 'tracy-web'), MASTER_ENV)
    assert.equal(envFileOf(out, 'tracy-host'), MASTER_ENV)
    assert.equal(dshNetworkName(out), 'tracy-host-dsh_egress')
  })

  test('what a master deploy now exports changes nothing: the render is identical byte for byte', (t) => {
    const without = renderConfig(t)
    const exported = renderConfig(t, { TRACY_STACK_ENV_FILE: MASTER_ENV })
    assert.equal(exported, without)
    const defaulted = renderConfig(t, {
      TRACY_STACK_ENV_FILE: MASTER_ENV,
      TRACY_DSH_NETWORK: 'tracy-host-dsh_egress'
    })
    assert.equal(defaulted, without)
  })

  test('with the variables: both services follow TRACY_STACK_ENV_FILE and the network follows TRACY_DSH_NETWORK', (t) => {
    const out = renderConfig(t, { TRACY_STACK_ENV_FILE: '/tmp/e', TRACY_DSH_NETWORK: 'zz' })
    assert.equal(envFileOf(out, 'tracy-web'), '/tmp/e')
    assert.equal(envFileOf(out, 'tracy-host'), '/tmp/e')
    assert.equal(dshNetworkName(out), 'zz')
    assert.doesNotMatch(out, /\/etc\/tracy\/tracy-web\.env/)
  })
})
