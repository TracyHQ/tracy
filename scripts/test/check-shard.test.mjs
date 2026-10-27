// check-shard.sh away from a shard: every check runs, the reachable ones go red by name, and the
// exit code says so. On d1 the same script must be all green (plan G1 step 1.8).
//   node --test scripts/test/check-shard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { bash, script, tempDir, writeFiles } from './_shard.mjs'

function check(webEnv, args = [], env = {}) {
  const dir = writeFiles(tempDir('check-shard-'), {
    'tracy-web.env': webEnv,
    'shard-install.env': 'SHARD_NAME=s9\nFIREWALL_MODE=iptables\n',
    'state/heartbeat.json': JSON.stringify({ code: '404', at: 'x', epoch: 1 })
  })
  return bash([script('check-shard.sh'), ...args], {
    env: {
      TRACY_WEB_ENV: path.join(dir, 'tracy-web.env'),
      TRACY_INSTALL_ENV: path.join(dir, 'shard-install.env'),
      TRACY_STATE_DIR: path.join(dir, 'state'),
      ...env
    }
  })
}
const SHARD_ENV = 'TRACY_ORIGIN=https://s9.tracy.invalid\nTRACY_DEPLOYMENT_ROLE=shard\n'

test('off a shard every check still runs, and the run is red', () => {
  const run = check(SHARD_ENV)
  assert.equal(run.status, 1)
  assert.match(run.stdout, /ok +TRACY_DEPLOYMENT_ROLE=shard/)
  assert.match(run.stdout, /ok +no forbidden variable/)
  assert.match(run.stderr, /FAIL +nginx on 127\.0\.0\.1:80/)
  assert.match(run.stderr, /FAIL +https:\/\/s9\.tracy\.invalid\/api\/config does not come from this shard/)
  assert.match(run.stderr, /FAIL +the master has not accepted a heartbeat/)
  assert.match(run.stderr, /FAIL +.*cloudflared\.service/)
})

test('--before-registration turns the heartbeat check into a note', () => {
  const run = check(SHARD_ENV, ['--before-registration'])
  assert.match(run.stdout, /note +heartbeat: the master answered 404/)
  assert.doesNotMatch(run.stderr, /the master has not accepted a heartbeat/)
})

test('a forbidden variable and a missing role are both red', () => {
  const run = check('TRACY_ORIGIN=https://s9.tracy.invalid\nDEMO_HOSTS=dev\n')
  assert.match(run.stderr, /FAIL +TRACY_DEPLOYMENT_ROLE is not shard/)
  assert.match(run.stderr, /FAIL +.* holds a forbidden variable/)
})

test('a co-hosted shard names its own nginx port and prefixed timer units', () => {
  const run = check(SHARD_ENV, [], { TRACY_NGINX_PORT: '8081', TRACY_UNIT_PREFIX: 'tracy-d1-' })
  assert.match(run.stderr, /FAIL +nginx on 127\.0\.0\.1:8081/)
  assert.match(run.stderr, /FAIL +tracy-d1-heartbeat\.timer is not active/)
  assert.match(run.stderr, /FAIL +tracy-d1-updater\.timer is not active/)
  assert.match(run.stderr, /FAIL +tracy-d1-backup-postgres\.timer is not active/)
  const bad = check(SHARD_ENV, [], { TRACY_NGINX_PORT: '80; reboot' })
  assert.equal(bad.status, 2)
})
