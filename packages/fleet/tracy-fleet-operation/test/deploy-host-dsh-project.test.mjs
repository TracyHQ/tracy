#!/usr/bin/env node
/**
 * `deploy-host-dsh.sh`, usable for a SECOND dsh on the same host (trial shard d1 next to the master)
 * while the master's own commands stay what they are. Companions: `deploy-stack-project.test.mjs` (the
 * app stack) and `check-server-project.test.mjs`.
 *
 *   - `--project <name>` / `HOST_DSH_PROJECT` -> `docker compose -p <name>` on every compose call
 *     (flag beats env; unset means NO `-p`). NOT `TRACY_COMPOSE_PROJECT`: that name belongs to the app
 *     stack, and an updater that sets it for the app project would otherwise make this script run
 *     `-p <app project>`, override host-dsh.yml's own `name:` and collide with the container already there;
 *   - `HOST_DSH_ENV_FILE` handed to the compose process, equal to the env file the run was given
 *     (absolute): host-dsh.yml interpolates its `env_file` from that variable and not from `--env-file`;
 *   - `HOST_DSH_CONTAINER` is the container the health wait, the smoke test and the rollback ask about;
 *   - a project or a container name with the master's default env file is refused (exit 2);
 *   - the last line of a deploy is a rollback command that repeats every non-default value.
 *
 * 🔒 THE HARD REQUIREMENT IS THE DEFAULT. With no flag and no variable, every compose argv must be what
 * it was before this change (no `-p`), because the config hash of the master's dsh is derived from it
 * and a moved hash recreates it. The `golden` cases pin the argv the script at origin/develop produced
 * against this same stub (recorded when this change was made, by running both versions side by side).
 * They are new, so they never failed against the old script: they stop the default from moving LATER.
 * That it did not move NOW is the side-by-side run and the `docker compose config` proofs in the PR.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-host-dsh-project.test.mjs
 *
 * `docker` is a stub on PATH that logs every call with the HOST_DSH_ENV_FILE the compose process
 * would have seen. Nothing here starts a container.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
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

const DSH_DEPLOY = fileURLToPath(new URL('../dsh/deploy-host-dsh.sh', import.meta.url))
const HOST_DSH_YML = fileURLToPath(new URL('../dsh/host-dsh.yml', import.meta.url))
const MASTER_ENV = '/etc/tracy/host-dsh.env'
const IMAGE_REPO = 'ghcr.io/tracyhq/tracy-dsh'

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\t%s\\n' "$*" "\${HOST_DSH_ENV_FILE-<unset>}" >> "$FAKE_LOG"
args="$*"
C="\${FAKE_CONTAINER:-tracy-dsh}"
case "$args" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  "image inspect "*) echo "$FAKE_WANT_ID" ;;
  "inspect $C --format {{.Image}}") echo "$FAKE_HAVE_ID" ;;
  "inspect $C --format {{.State.Status}}"*) echo "\${FAKE_STATE:-running/healthy}" ;;
  "inspect $C --format {{.Config.Image}}") echo "$FAKE_CONFIG_IMAGE" ;;
  "run "*resync-access-plugin.sh) exit 0 ;;
  compose*"config --hash"*) printf 'dsh dshhash\\ndocker-proxy proxyhash\\n' ;;
  compose*"ps -q dsh") echo cid-dsh ;;
  compose*"ps -q docker-proxy") echo cid-proxy ;;
  "inspect cid-dsh --format"*) echo dshhash ;;
  "inspect cid-proxy --format"*) echo proxyhash ;;
  *) : ;;
esac
`
const DOCKER_STUB = warmStub('docker-dsh', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })
const SEED_OK = warmStub('seed-ok.sh', '#!/bin/sh\nexit 0\n')
const RESYNC_OK = warmStub('resync-ok.sh', '#!/bin/sh\nexit 0\n')
// Prints what a pasted rollback command would run: the env var it sets, then each argument on a line.
const ARGV_STUB = warmStub(
  'argv-stub',
  '#!/bin/sh\nprintf "container=%s\\n" "$HOST_DSH_CONTAINER"\nfor a in "$@"; do printf "[%s]\\n" "$a"; done\n'
)

function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-dsh-project-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  mkdirSync(path.join(dir, 'fleet'))
  copyFileSync(DSH_DEPLOY, path.join(dir, 'fleet/deploy-host-dsh.sh'))
  linkStub(SEED_OK, path.join(dir, 'fleet/seed-profile.sh'))
  writeFileSync(path.join(dir, 'fleet/host-dsh.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'fleet/docker-proxy.haproxy.cfg'), '# rules\n')
  mkdirSync(path.join(dir, 'tools'))
  linkStub(RESYNC_OK, path.join(dir, 'tools/resync-access-plugin.sh'))
  linkStub(RESYNC_OK, path.join(dir, 'tools/resync-joomla-access-plugin.sh'))
  mkdirSync(path.join(dir, 'home'))
  writeFileSync(
    path.join(dir, 'host-dsh.env'),
    `HOST_DSH_HOME=${dir}/home\nDSH_IMAGE_TAG=ctx-aaa\nDSH_IMAGE_TAG_PREVIOUS=ctx-old\nTRACY_SITE_DOMAIN=tracy.site\n`
  )
  return dir
}

/**
 * Run a deploy of `tag` (drain off). `env.HOST_DSH_ENV_FILE` is the env file the case selects; the
 * default is the host's own file. `envFile: null` means "name no env file at all": the script's default.
 */
async function deploy(dir, tag, args = [], env = {}, { envFile, cwd } = {}) {
  const log = path.join(dir, 'docker.log')
  const container = env.HOST_DSH_CONTAINER ?? 'tracy-dsh'
  const own = envFile === null ? {} : { HOST_DSH_ENV_FILE: envFile ?? path.join(dir, 'host-dsh.env') }
  const res = await sh(
    'bash',
    [path.join(dir, 'fleet/deploy-host-dsh.sh'), '--tag', tag, '--drain-timeout', '0', ...args],
    {
      encoding: 'utf8',
      cwd,
      env: baseEnv(dir, {
        DSH_IMAGE: IMAGE_REPO,
        HOST_DSH_COMPOSE: path.join(dir, 'fleet/host-dsh.yml'),
        ...own,
        FAKE_LOG: log,
        FAKE_CONTAINER: container,
        FAKE_WANT_ID: 'sha256:same',
        FAKE_HAVE_ID: 'sha256:same',
        FAKE_CONFIG_IMAGE: `${IMAGE_REPO}:${tag}`,
        ...env
      })
    }
  )
  const calls = existsSync(log) ? readCalls(readFileSync(log, 'utf8')) : []
  return { ...res, calls }
}

const prefix = (dir) => `compose --env-file ${dir}/host-dsh.env -f ${dir}/fleet/host-dsh.yml `
// A new tag, so the same-tag shortcut is skipped and the whole deploy runs.
const FULL = { FAKE_WANT_ID: 'sha256:new' }

describe('deploy-host-dsh.sh — a second dsh, the master untouched', { concurrency: 8 }, () => {
  test('golden: the same-tag path asks compose exactly what it asked before', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, 'ctx-aaa')
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /nothing to deploy/)
    assert.deepEqual(
      composeCalls(r.calls).map((c) => c.argv),
      [`${prefix(dir)}config --hash *`, `${prefix(dir)}ps -q dsh`, `${prefix(dir)}ps -q docker-proxy`]
    )
    assert.match(r.stdout, /^project {3}: <from compose file>$/m)
  })

  test('golden: a full deploy runs the one `up -d` it always ran, on the container it always asked about', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, 'ctx-bbb', [], FULL)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.deepEqual(
      composeCalls(r.calls).map((c) => c.argv),
      [`${prefix(dir)}up -d`]
    )
    assert.ok(r.calls.some((c) => c.argv === 'inspect tracy-dsh --format {{.Config.Image}}'))
  })

  test('--project tracy-d1: every compose call carries -p (the same-tag checks and the full `up`)', async (t) => {
    const same = await deploy(makeHost(t), 'ctx-aaa', ['--project', 'tracy-d1'], {}, { envFile: undefined })
    assert.equal(same.status, 0, same.stderr + same.stdout)
    const sameCalls = composeCalls(same.calls)
    assert.equal(sameCalls.length, 3)
    for (const c of sameCalls) assert.match(c.argv, /^compose -p tracy-d1 --env-file .* -f .*host-dsh\.yml /)
    assert.match(same.stdout, /^project {3}: tracy-d1$/m)

    const dir = makeHost(t)
    const full = await deploy(dir, 'ctx-bbb', ['--project', 'tracy-d1'], FULL)
    assert.equal(full.status, 0, full.stderr + full.stdout)
    assert.deepEqual(
      composeCalls(full.calls).map((c) => c.argv),
      [`compose -p tracy-d1 ${prefix(dir).slice(8)}up -d`]
    )
  })

  test('HOST_DSH_PROJECT works and the flag beats it', async (t) => {
    const fromEnv = await deploy(makeHost(t), 'ctx-aaa', [], { HOST_DSH_PROJECT: 'tracy-d1' })
    assert.equal(fromEnv.status, 0, fromEnv.stderr + fromEnv.stdout)
    for (const c of composeCalls(fromEnv.calls)) assert.match(c.argv, /^compose -p tracy-d1 --env-file /)
    const both = await deploy(makeHost(t), 'ctx-aaa', ['--project', 'tracy-flag'], {
      HOST_DSH_PROJECT: 'tracy-env'
    })
    assert.equal(both.status, 0, both.stderr + both.stdout)
    for (const c of composeCalls(both.calls)) assert.match(c.argv, /^compose -p tracy-flag --env-file /)
  })

  test('R1: TRACY_COMPOSE_PROJECT is the app stack’s and is NOT read — no -p, no refusal', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, 'ctx-aaa', [], { TRACY_COMPOSE_PROJECT: 'tracy-d1' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.equal(calls.length, 3)
    for (const c of calls) {
      assert.ok(c.argv.startsWith(prefix(dir)), c.argv)
      assert.doesNotMatch(c.argv, / -p /)
    }
    assert.match(r.stdout, /^project {3}: <from compose file>$/m)
    // …and an invalid value of it is not this script’s business either.
    const bad = await deploy(makeHost(t), 'ctx-aaa', [], { TRACY_COMPOSE_PROJECT: 'Not A Name' })
    assert.equal(bad.status, 0, bad.stderr + bad.stdout)
  })

  for (const name of ['Tracy', '-x', 'a b', '']) {
    test(`an invalid project ${JSON.stringify(name)} is a usage error before any docker call`, async (t) => {
      const dir = makeHost(t)
      const r = await deploy(dir, 'ctx-bbb', ['--project', name])
      assert.equal(r.status, 2, r.stderr + r.stdout)
      assert.match(r.stderr, /project/i)
      assert.deepEqual(r.calls, [], 'docker was called')
      if (name === '') return
      const viaEnv = await deploy(dir, 'ctx-bbb', [], { HOST_DSH_PROJECT: name })
      assert.equal(viaEnv.status, 2, viaEnv.stderr + viaEnv.stdout)
      assert.deepEqual(viaEnv.calls, [])
    })
  }

  for (const name of ['bad name', '-x', '.x', 'a/b', 'a;b', '$(id)']) {
    test(`an invalid HOST_DSH_CONTAINER ${JSON.stringify(name)} is a usage error before any docker call`, async (t) => {
      const r = await deploy(makeHost(t), 'ctx-bbb', [], { HOST_DSH_CONTAINER: name })
      assert.equal(r.status, 2, r.stderr + r.stdout)
      assert.match(r.stderr, /HOST_DSH_CONTAINER/)
      assert.deepEqual(r.calls, [], 'docker was called')
    })
  }

  test('valid container names pass, the default included', async (t) => {
    for (const name of ['tracy-dsh', 'tracy-d1-dsh', 'Tracy_D1.dsh2']) {
      const r = await deploy(makeHost(t), 'ctx-aaa', ['--project', 'tracy-d1'], { HOST_DSH_CONTAINER: name })
      assert.equal(r.status, 0, `${name}: ${r.stderr}${r.stdout}`)
    }
  })

  test('TD.9: HOST_DSH_CONTAINER is the container the health wait, smoke test and image check ask about', async (t) => {
    const r = await deploy(makeHost(t), 'ctx-bbb', ['--project', 'tracy-d1'], {
      ...FULL,
      HOST_DSH_CONTAINER: 'tracy-d1-dsh'
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const argvs = r.calls.map((c) => c.argv)
    assert.ok(
      argvs.includes(
        'inspect tracy-d1-dsh --format {{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
      ),
      argvs.join('\n')
    )
    assert.ok(
      argvs.some((a) => a.startsWith('exec tracy-d1-dsh node -e ')),
      'the smoke test did not exec into the d1 container'
    )
    assert.ok(argvs.includes('inspect tracy-d1-dsh --format {{.Config.Image}}'))
    assert.ok(argvs.includes('exec tracy-d1-dsh printenv TRACY_SOURCE_COMMIT'))
    assert.deepEqual(
      argvs.filter((a) => /^(inspect|exec|logs)( --tail \d+)? tracy-dsh( |$)/.test(a)),
      [],
      'a check reached the master container'
    )
  })

  test('TD.9: a failed health wait reads the logs of that container and rolls back with the same flags', async (t) => {
    const r = await deploy(makeHost(t), 'ctx-bbb', ['--project', 'tracy-d1'], {
      ...FULL,
      HOST_DSH_CONTAINER: 'tracy-d1-dsh',
      FAKE_STATE: 'exited/none'
    })
    assert.notEqual(r.status, 0, r.stdout)
    const argvs = r.calls.map((c) => c.argv)
    assert.ok(argvs.includes('logs --tail 40 tracy-d1-dsh'), argvs.join('\n'))
    assert.match(r.stderr, /putting ctx-aaa back/)
    const ups = composeCalls(r.calls).filter((c) => c.argv.endsWith(' up -d'))
    assert.equal(ups.length, 2, 'the deploy `up` and the rollback `up`')
    for (const c of ups) assert.match(c.argv, /^compose -p tracy-d1 --env-file /)
  })

  test('--help names the flag and the variables, and not the app stack’s project variable as a default', async (t) => {
    const dir = makeHost(t)
    const r = await sh('bash', [path.join(dir, 'fleet/deploy-host-dsh.sh'), '--help'], {
      encoding: 'utf8',
      env: baseEnv(dir)
    })
    assert.equal(r.status, 0)
    for (const word of ['--project <name>', 'HOST_DSH_PROJECT', 'HOST_DSH_CONTAINER', 'HOST_DSH_ENV_FILE'])
      assert.ok(r.stdout.includes(word), word)
    assert.doesNotMatch(r.stdout, /default\s+\$TRACY_COMPOSE_PROJECT/)
    // The line that used to say HOST_DSH_ENV_FILE only supplies the default of --env-file; it also does more.
    assert.doesNotMatch(r.stdout, /defaults for --compose and --env-file/)
    assert.match(r.stdout, /refused \(exit 2\)/)
  })
})

describe('deploy-host-dsh.sh — the env file compose interpolates env_file from (R2)', {
  concurrency: 8
}, () => {
  test('golden: on the master’s own file the compose process is handed that same literal', async (t) => {
    const dir = makeHost(t)
    const file = path.join(dir, 'host-dsh.env')
    const r = await deploy(dir, 'ctx-bbb', [], FULL)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    for (const c of composeCalls(r.calls)) assert.equal(c.env, file, c.argv)
  })

  test('a second dsh started with --env-file gets its own file in what compose sees', async (t) => {
    const dir = makeHost(t)
    const own = path.join(dir, 'host-dsh-d1.env')
    writeFileSync(own, readFileSync(path.join(dir, 'host-dsh.env'), 'utf8'))
    const r = await deploy(
      dir,
      'ctx-aaa',
      ['--project', 'tracy-d1', '--env-file', own],
      {},
      { envFile: null }
    )
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.equal(calls.length, 3)
    for (const c of calls) {
      assert.match(c.argv, new RegExp(`^compose -p tracy-d1 --env-file ${own} `))
      assert.equal(c.env, own, c.argv)
    }
  })

  test('a relative --env-file is made absolute in what compose sees', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, 'ctx-aaa', ['--env-file', 'host-dsh.env'], {}, { envFile: null, cwd: dir })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const calls = composeCalls(r.calls)
    assert.equal(calls.length, 3)
    for (const c of calls) assert.equal(c.env, path.join(realpathSync(dir), 'host-dsh.env'), c.argv)
  })

  test('HOST_DSH_ENV_FILE instead of --env-file selects the file, for the script and for compose', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(
      dir,
      'ctx-aaa',
      [],
      { HOST_DSH_ENV_FILE: path.join(dir, 'host-dsh.env') },
      { envFile: null }
    )
    assert.equal(r.status, 0, r.stderr + r.stdout)
    for (const c of composeCalls(r.calls)) assert.equal(c.env, path.join(dir, 'host-dsh.env'))
  })
})

describe('deploy-host-dsh.sh — a second dsh needs its own env file', { concurrency: 8 }, () => {
  test('--project with the default env file is refused (exit 2) before any docker call', async (t) => {
    const r = await deploy(makeHost(t), 'ctx-aaa', ['--project', 'tracy-d1'], {}, { envFile: null })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.ok(r.stderr.includes(MASTER_ENV), r.stderr)
    assert.match(r.stderr, /--env-file/)
    assert.deepEqual(r.calls, [], 'docker was called')
  })

  test('HOST_DSH_PROJECT with the default env file is refused the same way', async (t) => {
    const r = await deploy(makeHost(t), 'ctx-aaa', [], { HOST_DSH_PROJECT: 'tracy-d1' }, { envFile: null })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.deepEqual(r.calls, [])
  })

  test('HOST_DSH_CONTAINER with the default env file is refused the same way', async (t) => {
    const r = await deploy(
      makeHost(t),
      'ctx-aaa',
      [],
      { HOST_DSH_CONTAINER: 'tracy-d1-dsh' },
      { envFile: null }
    )
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.match(r.stderr, /HOST_DSH_CONTAINER/)
    assert.deepEqual(r.calls, [])
  })

  test('naming the master file by hand is no way round it', async (t) => {
    const r = await deploy(makeHost(t), 'ctx-aaa', ['--project', 'tracy-d1'], {}, { envFile: MASTER_ENV })
    assert.equal(r.status, 2, r.stderr + r.stdout)
    assert.deepEqual(r.calls, [])
  })

  // On a machine that really has the master's file this case would read it, so it is not run there.
  test('the master itself (no project, the literal container) is not a usage error', {
    skip: existsSync(MASTER_ENV) && `${MASTER_ENV} exists on this machine`
  }, async (t) => {
    const r = await deploy(makeHost(t), 'ctx-aaa', ['--dry-run'], {}, { envFile: null })
    assert.equal(r.status, 1, r.stderr + r.stdout)
    assert.ok(r.stderr.includes(`no ${MASTER_ENV}`), r.stderr)
    assert.deepEqual(
      r.calls.filter((c) => c.argv !== 'compose version'),
      [],
      'docker was asked to act'
    )
  })
})

describe('deploy-host-dsh.sh — the rollback command on the last line', { concurrency: 8 }, () => {
  /** Run `rollback_command` alone, after `setup` has set the variables it reads. */
  function rollbackCommand(setup, zero = DSH_DEPLOY) {
    const code = [
      'set -u',
      defaultAssignments(DSH_DEPLOY, [
        'DEFAULT_COMPOSE_FILE',
        'DEFAULT_ENV_FILE',
        'DEFAULT_IMAGE_REPO',
        'DEFAULT_CONTAINER'
      ]),
      'COMPOSE_FILE="$DEFAULT_COMPOSE_FILE"',
      'ENV_FILE_ABS="$DEFAULT_ENV_FILE"',
      'IMAGE_REPO="$DEFAULT_IMAGE_REPO"',
      'CONTAINER="$DEFAULT_CONTAINER"',
      'PROJECT=',
      shellFunction(DSH_DEPLOY, 'shquote'),
      shellFunction(DSH_DEPLOY, 'rollback_command'),
      setup,
      'rollback_command'
    ].join('\n')
    const r = spawnSync('bash', ['-c', code, zero], { encoding: 'utf8', env: baseEnv(tmpdir()) })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout
  }

  test('every value at its default: the text is `<script> --rollback`, as it always was', () => {
    assert.equal(rollbackCommand(''), `${DSH_DEPLOY} --rollback`)
  })

  test('a test host (env file and compose path are not the defaults) repeats those two, and only those', async (t) => {
    const dir = makeHost(t)
    // A new tag: the same-tag path exits before the last line.
    const r = await deploy(dir, 'ctx-bbb', [], FULL)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const line = r.stdout.split('\n').find((l) => l.startsWith('roll back with: '))
    assert.equal(
      line,
      `roll back with: ${path.join(dir, 'fleet/deploy-host-dsh.sh')} --rollback ` +
        `--env-file ${dir}/host-dsh.env --compose ${dir}/fleet/host-dsh.yml`
    )
  })

  test('a non-default deploy prints the whole command: container, project, env file, compose file, image', async (t) => {
    const dir = makeHost(t)
    const own = path.join(dir, 'host-dsh-d1.env')
    writeFileSync(own, readFileSync(path.join(dir, 'host-dsh.env'), 'utf8'))
    const r = await deploy(
      dir,
      'ctx-bbb',
      ['--project', 'tracy-d1', '--env-file', own, '--image', 'registry.example/dsh'],
      { ...FULL, HOST_DSH_CONTAINER: 'tracy-d1-dsh', FAKE_CONFIG_IMAGE: 'registry.example/dsh:ctx-bbb' },
      { envFile: null }
    )
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const line = r.stdout.split('\n').find((l) => l.startsWith('roll back with: '))
    assert.equal(
      line,
      `roll back with: HOST_DSH_CONTAINER=tracy-d1-dsh ${path.join(dir, 'fleet/deploy-host-dsh.sh')} --rollback ` +
        `--project tracy-d1 --env-file ${own} --compose ${dir}/fleet/host-dsh.yml --image registry.example/dsh`
    )
  })

  test('the printed line pastes back as the same words, quoting included', () => {
    const out = rollbackCommand(
      [
        'CONTAINER=tracy-d1-dsh',
        'PROJECT=tracy-d1',
        `ENV_FILE_ABS="/etc/tracy/d 1/it's.env"`,
        'COMPOSE_FILE=/opt/tracy-d1/dsh/host-dsh.cohost.yml',
        'IMAGE_REPO=ghcr.io/tracyhq/tracy-dsh'
      ].join('\n'),
      ARGV_STUB
    )
    const run = spawnSync('bash', ['-c', `eval "$1"`, 'x', out], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(
      run.stdout,
      [
        'container=tracy-d1-dsh',
        '[--rollback]',
        '[--project]',
        '[tracy-d1]',
        '[--env-file]',
        `[/etc/tracy/d 1/it's.env]`,
        '[--compose]',
        '[/opt/tracy-d1/dsh/host-dsh.cohost.yml]',
        ''
      ].join('\n')
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// host-dsh.yml — the master's render does not move when the script starts exporting the variable
// ═════════════════════════════════════════════════════════════════════════════════════════════════

function renderDsh(t, vars = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'host-dsh-render-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const envFile = path.join(dir, 'dummy.env')
  writeFileSync(
    envFile,
    [
      'DSH_IMAGE_TAG=ctx-x',
      'HOST_AGENT_HOSTNAME=agent.tracy.test',
      'TRACY_SITE_DOMAIN=tracy.site',
      'HOST_SITES_ROOT=/srv/tracy-sites',
      'HOST_PRIVATE_ROOT=/srv/tracy',
      ''
    ].join('\n')
  )
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, DSH_IMAGE: IMAGE_REPO, ...vars }
  const run = (extra) =>
    spawnSync('docker', ['compose', '--env-file', envFile, '-f', HOST_DSH_YML, ...extra], {
      encoding: 'utf8',
      env: base
    })
  const config = run(['config', '--no-env-resolution'])
  assert.equal(config.status, 0, config.stderr)
  // `--no-env-resolution` on the hash too: without it compose opens the `env_file` it names, and
  // `/etc/tracy/host-dsh.env` exists only on a real host (a Linux runner fails: "env file not found").
  const hash = run(['config', '--hash', '*', '--no-env-resolution'])
  assert.equal(hash.status, 0, hash.stderr)
  return { config: config.stdout, hash: hash.stdout }
}
const dshEnvFile = (yaml) => yaml.match(/^ {2}dsh:[\s\S]*?^ {4}env_file:\n {6}- path: (\S+)/m)?.[1]

describe('host-dsh.yml — env_file follows HOST_DSH_ENV_FILE, whose default is the old literal', {
  skip: !canRenderConfig && 'docker compose config --no-env-resolution is not available'
}, () => {
  test('no variable: the master’s literal', (t) => {
    assert.equal(dshEnvFile(renderDsh(t).config), MASTER_ENV)
  })

  test('what a master deploy now exports changes nothing: render and config hashes are identical', (t) => {
    const without = renderDsh(t)
    const exported = renderDsh(t, { HOST_DSH_ENV_FILE: MASTER_ENV })
    assert.equal(exported.config, without.config)
    assert.equal(exported.hash, without.hash)
  })

  test('with the variable: the env_file follows it and the hash of dsh moves', (t) => {
    const without = renderDsh(t)
    const own = renderDsh(t, { HOST_DSH_ENV_FILE: '/tmp/e' })
    assert.equal(dshEnvFile(own.config), '/tmp/e')
    assert.notEqual(own.hash, without.hash)
  })
})
