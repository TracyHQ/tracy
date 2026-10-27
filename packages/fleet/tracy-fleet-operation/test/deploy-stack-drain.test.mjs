#!/usr/bin/env node
/**
 * `deploy-tracy-stack.sh` step 3b — a deploy that replaces tracy-host waits for the jobs it runs.
 *
 * `provision.sh` is a child of the tracy-host container, so `up -d` with a new image kills every
 * site being made at that moment; the next boot marks each job failed and the customer reads "Your
 * site could not be finished". Measured 24/09/2026 on dev: an EmDash Business site died at "site
 * network …" while deploy-dev replaced tracy-host for an unrelated merge.
 *
 * What must hold: the wait happens BEFORE `up -d` and before the env file is rewritten; it ends as
 * soon as no job is queued or running; a job that never ends is cut off after --drain-timeout with
 * its id named, and the deploy still goes on (a drain never fails a deploy); and an unchanged
 * tracy-host (same image ID, same compose config hash) or no running tracy-host is not waited on.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-stack-drain.test.mjs
 *
 * `docker` and `sleep` are stubs on PATH: docker answers from environment variables and logs every
 * call, and sleep returns at once, so a wait of several polls takes milliseconds.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const STACK_DEPLOY = fileURLToPath(
  new URL('../../../../deploy/scripts/deploy-tracy-stack.sh', import.meta.url)
)

// A healthy demo host (tracy-host only). The job listing reports one running job for the first
// $FAKE_JOB_POLLS looks, then none; `ps -q` answers nothing before `up -d` when FAKE_NO_HOST is set.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
args="$*"
case "$args" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  compose*" up -d "*) touch "$FAKE_DIR/UP" ;;
  compose*" ps -q "*)
    if [ -n "$FAKE_NO_HOST" ] && [ ! -e "$FAKE_DIR/UP" ]; then :; else echo "cid-\${args##* }"; fi ;;
  compose*"config --hash tracy-host"*) echo "tracy-host $FAKE_WANT_HASH" ;;
  "image inspect "*"{{.Id}}"*) echo "$FAKE_WANT_ID" ;;
  "inspect cid-"*"{{.Image}}"*) echo "$FAKE_HAVE_ID" ;;
  "inspect cid-"*"config-hash"*) echo "$FAKE_HAVE_HASH" ;;
  "inspect cid-"*"{{.State.Status}}"*) echo "running/healthy" ;;
  "inspect cid-"*"{{.Config.Image}}"*) echo "$FAKE_HOST_IMAGE" ;;
  "exec cid-tracy-host node -e "*)
    n=$(( $(cat "$FAKE_DIR/POLLS" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/POLLS"
    [ -e "$FAKE_DIR/jobs/draining" ] && echo "$n" >> "$FAKE_DIR/LOOKS_WHILE_DRAINING"
    [ "$n" -gt "\${FAKE_JOB_POLLS:-0}" ] || echo "kjob1 running" ;;
  # The draining marker's write and removal, run for real against a local stand-in for the volume.
  "exec cid-tracy-host sh -c "*)
    [ -n "$FAKE_MARKER_FAILS" ] && exit 1
    mkdir -p "$FAKE_DIR/jobs"; sh -c "$5" sh "$FAKE_DIR/jobs" "\${@:8}" ;;
  compose*"exec -T tracy-host curl"*"/health"*) echo '{"ok":true,"docker":true}' ;;
  *) : ;;
esac
`

// One stub each for the whole file (see warm-stub.mjs); a case links them and passes its values in env.
const DOCKER_STUB = warmStub('docker', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })
const NOOP_STUB = warmStub('noop', '#!/bin/sh\nexit 0\n') // stands in for sleep, and for rm where a case needs the marker kept

function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-stack-drain-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  linkStub(NOOP_STUB, path.join(dir, 'bin/sleep'))
  writeFileSync(path.join(dir, 'compose.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'compose.server.yml'), 'services: {}\n')
  writeFileSync(
    path.join(dir, 'tracy-web.env'),
    'HOST_NAME=demo\nHOST_demo_SECRET=s\nAPP_IMAGE_TAG=old\nAPP_IMAGE_TAG_PREVIOUS=older\n'
  )
  return dir
}

async function deploy(dir, args, fake) {
  const log = path.join(dir, 'docker.log')
  const res = await sh(
    'bash',
    [
      STACK_DEPLOY,
      '--stack-dir',
      dir,
      '--env-file',
      path.join(dir, 'tracy-web.env'),
      '--tag',
      'new',
      '--services',
      'tracy-host',
      ...args
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}/bin:${process.env.PATH}`,
        GITHUB_ACTIONS: '',
        FAKE_DIR: dir,
        FAKE_LOG: log,
        FAKE_HOST_IMAGE: 'ghcr.io/tracyhq/tracy-host:new',
        FAKE_WANT_ID: 'sha256:new',
        FAKE_HAVE_ID: 'sha256:old',
        FAKE_WANT_HASH: 'hash-now',
        FAKE_HAVE_HASH: 'hash-now',
        ...fake
      }
    }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { ...res, calls, env: readFileSync(path.join(dir, 'tracy-web.env'), 'utf8') }
}

const jobLooks = (calls) => calls.filter((c) => c.startsWith('exec cid-tracy-host node -e '))
const markerCalls = (calls) => calls.filter((c) => c.startsWith('exec cid-tracy-host sh -c '))
const upAt = (calls) => calls.findIndex((c) => c.endsWith('up -d tracy-host'))

describe('deploy-tracy-stack.sh — waiting for tracy-host jobs before replacing it', {
  concurrency: 8
}, () => {
  test('a running job is waited for, then tracy-host is replaced', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '2' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /draining tracy-host: waiting up to 600s/)
    assert.match(r.stdout, /still running \(\d+s left\): kjob1 running/)
    assert.match(r.stdout, /nothing running/)
    assert.equal(jobLooks(r.calls).length, 3, 'two looks see the job, the third sees none')
    const lastLook = r.calls.lastIndexOf(jobLooks(r.calls).at(-1))
    assert.ok(upAt(r.calls) > lastLook, 'up -d ran only after the job had ended')
    assert.doesNotMatch(r.stderr, /CUTS OFF/)
    assert.match(r.env, /^APP_IMAGE_TAG=new$/m)
  })

  test('a job that never ends is cut off after --drain-timeout, named, and the deploy goes on', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, ['--drain-timeout', '0'], { FAKE_JOB_POLLS: '99' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stderr, /drain timed out after 0s — replacing tracy-host anyway, which CUTS OFF:/)
    assert.match(r.stderr, /^ {4}kjob1 running$/m, 'the job it cuts off is named by its id')
    assert.ok(upAt(r.calls) >= 0, 'tracy-host was still replaced')
    assert.match(r.stdout, /deployed new/)
  })

  test('the Actions log gets a warning naming the jobs it cut off', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, ['--drain-timeout', '0'], { FAKE_JOB_POLLS: '99', GITHUB_ACTIONS: 'true' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /^::warning::deploy cut off tracy-host jobs after 0s: kjob1 running/m)
  })

  test('the same image and compose config: nothing is replaced, nothing is waited for', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '99', FAKE_HAVE_ID: 'sha256:new' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.doesNotMatch(r.stdout, /draining tracy-host/)
    assert.deepEqual(jobLooks(r.calls), [])
  })

  test('a changed compose config on the same image is a replacement, so it waits', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], {
      FAKE_JOB_POLLS: '1',
      FAKE_HAVE_ID: 'sha256:new',
      FAKE_HAVE_HASH: 'hash-before'
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /draining tracy-host/)
    assert.equal(jobLooks(r.calls).length, 2)
  })

  test('no tracy-host running yet: nothing can be cut off, so nothing is waited for', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '99', FAKE_NO_HOST: '1' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.doesNotMatch(r.stdout, /draining tracy-host/)
    assert.deepEqual(jobLooks(r.calls), [])
  })

  test('--drain-timeout takes seconds and nothing else', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, ['--drain-timeout', 'ten'], {})
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /--drain-timeout takes a number of seconds, not 'ten'/)
    assert.deepEqual(r.calls, [], 'docker was never called')
    assert.match(r.env, /^APP_IMAGE_TAG=old$/m)
  })
  // #295: without the marker, a site pressed between the last look and `up -d` was killed by it.
  test('a draining marker is up for every look, carries its own end, and is gone when the deploy ends', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '2' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const looks = readFileSync(path.join(dir, 'LOOKS_WHILE_DRAINING'), 'utf8').trim().split('\n')
    assert.deepEqual(looks, ['1', '2', '3'], 'a job look ran without the marker in place')
    const [write, clear] = markerCalls(r.calls)
    assert.ok(
      r.calls.indexOf(write) < r.calls.indexOf(jobLooks(r.calls)[0]),
      'marker written after the first look'
    )
    assert.match(write, /draining\.tmp/)
    assert.ok(r.calls.lastIndexOf(clear) > upAt(r.calls), 'marker removed before tracy-host was replaced')
    assert.ok(!existsSync(path.join(dir, 'jobs/draining')), 'the marker outlived the deploy')
  })

  test('the marker ends by itself: drain timeout plus fifteen minutes', async (t) => {
    const dir = makeHost(t)
    // A stub rm that does nothing, so the marker the deploy wrote can be read afterwards.
    linkStub(NOOP_STUB, path.join(dir, 'bin/rm'))
    const before = Date.now()
    const r = await deploy(dir, ['--drain-timeout', '120'], { FAKE_JOB_POLLS: '0' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const { until } = JSON.parse(readFileSync(path.join(dir, 'jobs/draining'), 'utf8'))
    const expected = before + (120 + 900) * 1000
    assert.ok(Math.abs(until - expected) < 5000, `until ${until} is not drain timeout + 900 s (${expected})`)
  })

  test('a marker that cannot be written is a warning, never a failed deploy', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '1', FAKE_MARKER_FAILS: '1' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stderr, /could not write the draining marker/)
    assert.ok(upAt(r.calls) >= 0)
  })

  test('nothing replaced: no marker is written', async (t) => {
    const dir = makeHost(t)
    const r = await deploy(dir, [], { FAKE_JOB_POLLS: '99', FAKE_HAVE_ID: 'sha256:new' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.deepEqual(markerCalls(r.calls), [])
  })
})
