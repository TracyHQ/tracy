// tracy-updater.sh --dry-run: the decision it takes from desired.json (the master's whole answer,
// docs/sre/hop-dong-cua-shard.md section 7), the two env files and its own last result, and the
// order of what it would do. Nothing here needs docker; the doing half is accepted on d1 (plan G3
// steps 3.1-3.2).
//   node --test scripts/test/tracy-updater.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { R, bash, has, script, tempDir, writeFiles } from './_shard.mjs'

const skip = has('jq') ? false : 'jq is not installed'
const RUNNING = { app: 'app-111111111111', dsh: '2026-10-01-aaaaaaaa' }
const NEW = { app: 'app-222222222222', dsh: '2026-10-02-bbbbbbbb' }
const SECRETS = [
  'ghp_UPDATERTESTSECRET',
  'updater-test-host-secret',
  'AKIAUPDATERTESTSECRET',
  'updater-test-aws-secret'
]
const ECR = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
const ECR_PREFIX = `${ECR}/lab3-image/tracy-ai`
// A registry.env as install-shard.sh writes it for REGISTRY_AUTH=ecr.
const ECR_REGISTRY_ENV = [
  'REGISTRY_AUTH=ecr',
  `TRACY_IMAGE_PREFIX=${ECR_PREFIX}`,
  `ECR_REGISTRY=${ECR}`,
  'AWS_REGION=us-east-1',
  'AWS_ACCESS_KEY_ID=AKIAUPDATERTESTSECRET',
  'AWS_SECRET_ACCESS_KEY=updater-test-aws-secret',
  ''
].join('\n')
const now = () => Math.floor(Date.now() / 1000)
// As the master writes it (Date.prototype.toISOString, milliseconds and Z).
const iso = (secs) => new Date(secs * 1000).toISOString()
const desired = (over = {}) => ({
  app_tag: RUNNING.app,
  dsh_tag: RUNNING.dsh,
  source_commit: null,
  hold: false,
  reason: null,
  granted_until: iso(now() + 900),
  received_at: now(),
  ...over
})

function update({
  want,
  last,
  env = {},
  registry = 'GHCR_USER=tracy-s9\nGHCR_TOKEN=ghp_UPDATERTESTSECRET\n'
} = {}) {
  const dir = tempDir('updater-')
  const files = {
    'tracy-web.env': `HOST_NAME=s9\nAPP_IMAGE_TAG=${RUNNING.app}\nHOST_s9_SECRET=updater-test-host-secret\n`,
    'host-dsh.env': `DSH_IMAGE_TAG=${RUNNING.dsh}\n`,
    'registry.env': registry,
    'state/.keep': ''
  }
  if (want) files['state/desired.json'] = JSON.stringify(want)
  if (last) files['state/updater.json'] = JSON.stringify(last)
  writeFiles(dir, files)
  const run = bash([script('tracy-updater.sh'), '--dry-run'], {
    env: {
      TRACY_WEB_ENV: path.join(dir, 'tracy-web.env'),
      TRACY_DSH_ENV: path.join(dir, 'host-dsh.env'),
      TRACY_REGISTRY_ENV: path.join(dir, 'registry.env'),
      TRACY_STATE_DIR: path.join(dir, 'state'),
      TRACY_LOG_DIR: path.join(dir, 'log'),
      TRACY_FLEET_DIR: path.join(dir, 'fleet'),
      ...env
    }
  })
  assert.equal(run.status, 0, run.stderr)
  for (const secret of SECRETS)
    assert.ok(!run.stdout.includes(secret) && !run.stderr.includes(secret), secret)
  return run.stdout
}

test('no answer from the master yet: nothing to do', { skip }, () => {
  assert.match(update(), /no desired state yet/)
})

test('both tags already run: up to date', { skip }, () => {
  assert.match(update({ want: desired() }), /up to date: app app-111111111111, dsh 2026-10-01-aaaaaaaa/)
})

test("hold is obeyed, with the master's reason", { skip }, () => {
  const out = update({ want: desired({ app_tag: NEW.app, hold: true, reason: 'BUSY' }) })
  assert.match(out, /hold: BUSY/)
  assert.doesNotMatch(out, /would/)
})

test('a hold that is not a boolean still holds', { skip }, () => {
  assert.match(update({ want: desired({ app_tag: NEW.app, hold: 'yes' }) }), /hold:/)
})

test('TAG_UNKNOWN: a hold with null tags is an answer, not a refusal, and nothing is done', { skip }, () => {
  const out = update({
    want: desired({ app_tag: null, dsh_tag: null, hold: true, reason: 'TAG_UNKNOWN', granted_until: null })
  })
  assert.match(out, /hold: TAG_UNKNOWN/)
  assert.doesNotMatch(out, /refusing|would/)
})

test("the master's update slot: none, or one that has ended, means wait", { skip }, () => {
  assert.match(
    update({ want: desired({ app_tag: NEW.app, granted_until: null }) }),
    /not granted: the master has given this shard no update slot/
  )
  const ended = update({ want: desired({ app_tag: NEW.app, granted_until: iso(now() - 60) }) })
  assert.match(ended, /not granted: the master's slot ended \d+ s ago/)
  assert.doesNotMatch(ended, /would/)
})

test('stale: an answer older than 15 min is never carried out', { skip }, () => {
  const out = update({ want: desired({ app_tag: NEW.app, received_at: now() - 1200 }) })
  assert.match(out, /stale: the master's last answer is \d+ s old/)
  assert.doesNotMatch(out, /would/)
})

test('refusing: a desired tag that is not an image tag never reaches a command', { skip }, () => {
  const out = update({ want: desired({ app_tag: 'app-1; reboot' }) })
  assert.match(out, /refusing: desired tags are not image tags/)
  assert.doesNotMatch(out, /would/)
})

test('backing off: the same target failed 10 min ago', { skip }, () => {
  const out = update({
    want: desired({ app_tag: NEW.app }),
    last: { app_tag: NEW.app, dsh_tag: RUNNING.dsh, ok: false, finished_epoch: now() - 600 }
  })
  assert.match(out, /backing off: app-222222222222 \/ 2026-10-01-aaaaaaaa failed \d+ s ago/)
  assert.doesNotMatch(out, /would/)
})

test('backing off: any failure of the last hour, whatever its target, even with a slot granted', {
  skip
}, () => {
  const out = update({
    want: desired({ app_tag: NEW.app }),
    last: { app_tag: 'app-333333333333', dsh_tag: RUNNING.dsh, ok: false, finished_epoch: now() - 600 }
  })
  assert.match(out, /backing off: app-333333333333 \/ 2026-10-01-aaaaaaaa failed \d+ s ago/)
  assert.doesNotMatch(out, /would/)
})

test('a failure older than the backoff is tried again', { skip }, () => {
  const out = update({
    want: desired({ app_tag: NEW.app }),
    last: { app_tag: NEW.app, dsh_tag: RUNNING.dsh, ok: false, finished_epoch: now() - 4000 }
  })
  assert.match(
    out,
    /would: deploy-tracy-stack\.sh --tag app-222222222222 --services postgres,tracy-web,tracy-host/
  )
})

test('an app-only change deploys the stack and leaves dsh alone', { skip }, () => {
  const out = update({ want: desired({ app_tag: NEW.app }) })
  assert.match(out, /would: deploy-tracy-stack\.sh --tag app-222222222222/)
  assert.doesNotMatch(out, /deploy-host-dsh\.sh --tag/)
})

test('a dsh-only change deploys dsh and leaves the stack alone', { skip }, () => {
  const out = update({ want: desired({ dsh_tag: NEW.dsh }) })
  assert.match(out, /would: deploy-host-dsh\.sh --tag 2026-10-02-bbbbbbbb/)
  assert.doesNotMatch(out, /deploy-tracy-stack\.sh --tag/)
})

test('the plan runs in the order the spec and amendment 4 require', { skip }, () => {
  const out = update({ want: desired({ app_tag: NEW.app, dsh_tag: NEW.dsh }) })
  const order = [
    'docker login ghcr.io',
    `docker pull ghcr.io/tracyhq/tracy-host:${NEW.app}`,
    'sync-fleet-files.sh --from-image',
    'shard-env-check.sh',
    'web/build.sh, only if web/IMAGE_TAGS changed',
    `deploy-tracy-stack.sh --tag ${NEW.app}`,
    `deploy-host-dsh.sh --tag ${NEW.dsh}`,
    'nginx -t and recreate',
    'prune old images, docker logout'
  ].map((needle) => out.indexOf(needle))
  assert.ok(
    order.every((i) => i >= 0),
    `every step is planned: ${order}`
  )
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'and in this order'
  )
})

test('a second stack on the host: no units, no prune, no site images, and its own compose project', {
  skip
}, () => {
  const out = update({
    want: desired({ app_tag: NEW.app, dsh_tag: NEW.dsh }),
    env: {
      TRACY_SKIP_UNITS: '1',
      TRACY_PRUNE: '0',
      TRACY_SKIP_WEB_IMAGES: '1',
      TRACY_COMPOSE_PROJECT: 'tracy-d1'
    }
  })
  assert.match(
    out,
    /would: deploy-tracy-stack\.sh --tag app-222222222222 --services postgres,tracy-web,tracy-host --project tracy-d1/
  )
  assert.match(out, /would not: build site images/)
  assert.match(out, /install no systemd unit/)
  assert.match(out, /no image is pruned/)
  assert.doesNotMatch(out, /would: web\/build\.sh/)
  assert.doesNotMatch(out, /would: prune old images/)
  assert.doesNotMatch(
    out,
    /deploy-host-dsh\.sh --tag .* --project/,
    'the app stack project never reaches the dsh deploy'
  )
})

test('the units: a oneshot every 5 min, long enough for a dsh drain and site image builds', () => {
  const service = readFileSync(path.join(R, 'deploy/systemd/tracy-updater.service'), 'utf8')
  const timer = readFileSync(path.join(R, 'deploy/systemd/tracy-updater.timer'), 'utf8')
  assert.match(service, /^Type=oneshot$/m)
  assert.match(service, /^ExecStart=\/opt\/tracy-fleet\/stack\/tracy-updater\.sh$/m)
  assert.match(service, /^TimeoutStartSec=3h$/m)
  assert.match(timer, /^OnUnitActiveSec=5min$/m)
  assert.match(timer, /^WantedBy=timers\.target$/m)
})

test('REGISTRY_AUTH=ecr: the plan logs in to ECR through the aws-cli image and pulls under TRACY_IMAGE_PREFIX', {
  skip
}, () => {
  const out = update({ want: desired({ app_tag: NEW.app }), registry: ECR_REGISTRY_ENV })
  assert.match(
    out,
    new RegExp(
      `would: docker run --rm --env-file <0600 temp file: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION of .*> public\\.ecr\\.aws/aws-cli/aws-cli:[0-9.]+ ecr get-login-password \\| docker login --username AWS --password-stdin ${ECR.replaceAll('.', '\\.')}`
    )
  )
  assert.ok(out.includes(`would: docker pull ${ECR_PREFIX}/tracy-host:${NEW.app}`), out)
  assert.doesNotMatch(out, /ghcr\.io/)
})

test('REGISTRY_AUTH=ecr with a prefix outside ECR_REGISTRY is refused before anything is planned', {
  skip
}, () => {
  const dir = tempDir('updater-ecr-bad-')
  writeFiles(dir, {
    'tracy-web.env': `HOST_NAME=s9\nAPP_IMAGE_TAG=${RUNNING.app}\n`,
    'registry.env': ECR_REGISTRY_ENV.replace(
      `TRACY_IMAGE_PREFIX=${ECR_PREFIX}`,
      'TRACY_IMAGE_PREFIX=ghcr.io/tracyhq'
    )
  })
  const run = bash([script('tracy-updater.sh'), '--dry-run'], {
    env: {
      TRACY_WEB_ENV: path.join(dir, 'tracy-web.env'),
      TRACY_REGISTRY_ENV: path.join(dir, 'registry.env'),
      TRACY_STATE_DIR: path.join(dir, 'state')
    }
  })
  assert.equal(run.status, 1)
  assert.match(run.stdout, /refusing: REGISTRY_AUTH=ecr needs TRACY_IMAGE_PREFIX=/)
})

test('ECR login (fake docker): the pull key reaches the aws-cli container through a 0600 file, never an argv, and the file is removed', {
  skip
}, () => {
  const dir = tempDir('updater-ecr-login-')
  const log = path.join(dir, 'docker.log')
  writeFiles(dir, {
    'registry.env': ECR_REGISTRY_ENV,
    'bin/docker': [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
      'case "$1" in',
      '  run)',
      '    while [ $# -gt 0 ]; do [ "$1" = --env-file ] && { f="$2"; break; }; shift; done',
      '    printf "%s\\n" "$f" > "$FAKE_DOCKER_LOG.path"',
      '    ls -l "$f" | cut -c1-10 > "$FAKE_DOCKER_LOG.mode"',
      '    cut -d= -f1 "$f" > "$FAKE_DOCKER_LOG.keys"',
      '    printf fake-ecr-token ;;',
      '  login) cat > "$FAKE_DOCKER_LOG.stdin" ;;',
      'esac',
      ''
    ].join('\n')
  })
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  const run = bash(['-c', 'source "$0"; load_registry && registry_login', script('tracy-updater.sh')], {
    env: {
      TRACY_UPDATER_NO_MAIN: '1',
      TRACY_REGISTRY_ENV: path.join(dir, 'registry.env'),
      FAKE_DOCKER_LOG: log,
      TMPDIR: dir,
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`
    }
  })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, new RegExp(`logged in to ${ECR.replaceAll('.', '\\.')} \\(ecr, us-east-1\\)`))
  const argv = readFileSync(log, 'utf8')
  assert.match(
    argv,
    /^run --rm --env-file \S+ public\.ecr\.aws\/aws-cli\/aws-cli:[0-9.]+ ecr get-login-password --region us-east-1$/m
  )
  assert.ok(argv.includes(`login --username AWS --password-stdin ${ECR}`), argv)
  for (const secret of SECRETS) {
    assert.ok(!argv.includes(secret), `${secret} is in no argv`)
    assert.ok(!run.stdout.includes(secret) && !run.stderr.includes(secret), `${secret} is not printed`)
  }
  assert.equal(readFileSync(`${log}.mode`, 'utf8').trim(), '-rw-------')
  assert.deepEqual(readFileSync(`${log}.keys`, 'utf8').trim().split('\n'), [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION'
  ])
  assert.equal(readFileSync(`${log}.stdin`, 'utf8'), 'fake-ecr-token')
  assert.ok(!existsSync(readFileSync(`${log}.path`, 'utf8').trim()), 'the key file is gone')
})
