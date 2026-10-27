#!/usr/bin/env node
/**
 * `deploy-tracy-stack.sh --services tracy-host` — the shape a demo-only host takes.
 *
 * The demo-only fleet host runs tracy-host and nothing else: the tracy-web that dials it is on the dev
 * host. Until 23/09 it was updated by hand, and on that day it ran `app-ae39d1b2ecb1` while the dev host ran
 * `app-47b1fd4eaf1c` — a tracy-host older than the tracy-web calling it, which
 * `docs/references/adding-a-demo-machine.md` names as a break (`/_host/address` `remove`).
 *
 * What must hold: only tracy-host is pulled, started, waited on and checked; the env keys that only
 * tracy-web needs are not demanded; and the default (no flag) still means all three, so the dev host
 * and prod1 deploy exactly as before.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-stack-services.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const STACK_DEPLOY = fileURLToPath(
  new URL('../../../../deploy/scripts/deploy-tracy-stack.sh', import.meta.url)
)

// Answers like a healthy host: every service has a container, every container is healthy, the
// health door says docker:true, and each container runs the image the deploy asked for.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
args="$*"
case "$args" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  compose*" ps -q "*) echo "cid-\${args##* }" ;;
  "inspect cid-"*"{{.State.Status}}"*) echo "running/healthy" ;;
  "inspect cid-"*"{{.Config.Image}}"*) svc="\${args#inspect cid-}"; svc="\${svc%% *}"
    case "$svc" in tracy-web) echo "$FAKE_WEB_IMAGE" ;; *) echo "$FAKE_HOST_IMAGE" ;; esac ;;
  compose*"exec -T tracy-host curl"*"/health"*) echo '{"ok":true,"docker":true}' ;;
  compose*"exec -T tracy-host curl"*"/api/config"*) echo "{\\"origin\\":\\"$FAKE_ORIGIN\\"}" ;;
  *) : ;;
esac
`

function makeHost(t, env) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-stack-services-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(path.join(dir, 'bin/docker'), FAKE_DOCKER)
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  writeFileSync(path.join(dir, 'compose.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'compose.server.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'tracy-web.env'), env)
  return dir
}

function deploy(dir, args) {
  const log = path.join(dir, 'docker.log')
  const res = spawnSync(
    'bash',
    [STACK_DEPLOY, '--stack-dir', dir, '--env-file', path.join(dir, 'tracy-web.env'), ...args],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}/bin:${process.env.PATH}`,
        FAKE_LOG: log,
        FAKE_WEB_IMAGE: 'ghcr.io/tracyhq/tracy-web:new',
        FAKE_HOST_IMAGE: 'ghcr.io/tracyhq/tracy-host:new',
        FAKE_ORIGIN: 'https://cowork.tracy.test'
      }
    }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { ...res, calls, env: readFileSync(path.join(dir, 'tracy-web.env'), 'utf8') }
}

/** A demo-only host's env file: no TRACY_ORIGIN-dependent checks apply, no HOST_<name>_ORIGIN. */
const DEMO_ENV = 'HOST_NAME=demo\nHOST_demo_SECRET=s\nAPP_IMAGE_TAG=old\nAPP_IMAGE_TAG_PREVIOUS=older\n'
const FULL_ENV =
  'HOST_NAME=dev\nHOST_dev_SECRET=s\nHOST_dev_ORIGIN=https://dev-host.tracy.test/_host\n' +
  'TRACY_ORIGIN=https://cowork.tracy.test\nAPP_IMAGE_TAG=old\n'

describe('deploy-tracy-stack.sh --services', () => {
  test('tracy-host alone: pulls, starts, checks tracy-host and touches nothing else', (t) => {
    const dir = makeHost(t, DEMO_ENV)
    const r = deploy(dir, ['--tag', 'new', '--services', 'tracy-host'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /deployed new/)
    const acting = r.calls.filter((c) => /\b(pull|up -d)\b/.test(c))
    assert.ok(
      acting.some((c) => c.endsWith('pull tracy-host')),
      'tracy-host is pulled'
    )
    assert.ok(
      acting.some((c) => c.endsWith('up -d tracy-host')),
      'tracy-host is started'
    )
    assert.deepEqual(
      // Service names as arguments, not the env file's own name (`tracy-web.env`).
      r.calls.filter((c) => / (tracy-web|postgres)( |$)|network connect|api\/config/.test(c)),
      [],
      'nothing about tracy-web or postgres is asked on a demo-only host'
    )
    assert.match(r.env, /^APP_IMAGE_TAG=new$/m)
    assert.match(r.env, /^APP_IMAGE_TAG_PREVIOUS=old$/m, 'the rollback target is the tag it replaced')
  })

  test('no flag still means all three (the dev host and prod1 unchanged)', (t) => {
    const dir = makeHost(t, FULL_ENV)
    const r = deploy(dir, ['--tag', 'new'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.ok(r.calls.some((c) => c.endsWith('pull postgres tracy-web tracy-host')))
    assert.ok(r.calls.some((c) => c.endsWith('up -d postgres tracy-web tracy-host')))
    assert.ok(
      r.calls.some((c) => /api\/config/.test(c)),
      'tracy-web is still smoke-tested'
    )
  })

  test('the full stack still refuses an env file with no TRACY_ORIGIN', (t) => {
    const dir = makeHost(t, DEMO_ENV)
    const r = deploy(dir, ['--tag', 'new'])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no TRACY_ORIGIN/)
  })

  for (const [flag, reason] of [
    ['tracy-host,redis', /unknown service 'redis'/],
    ['postgres', /must include tracy-host/],
    ['tracy-web,tracy-host', /tracy-web needs postgres/]
  ]) {
    test(`--services ${flag} is refused before anything is pulled`, (t) => {
      const dir = makeHost(t, FULL_ENV)
      const r = deploy(dir, ['--tag', 'new', '--services', flag])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, reason)
      assert.deepEqual(r.calls, [], 'docker was never called')
      assert.match(r.env, /^APP_IMAGE_TAG=old$/m)
    })
  }
})
