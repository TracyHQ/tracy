//   node --test scripts/test/shard-compose.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { load } from 'js-yaml'
import { R } from './_shard.mjs'

const shard = load(readFileSync(path.join(R, 'deploy/compose.shard.yml'), 'utf8'))
const nginx = shard.services.nginx

test('adds nginx and changes no other service (deploy-tracy-stack.sh never reads this file)', () => {
  assert.deepEqual(Object.keys(shard.services), ['nginx'])
  assert.equal(shard.networks, undefined)
})

test('nginx is pinned by digest, published on the loopback only, on the tracy network', () => {
  assert.match(nginx.image, /^nginx:1\.30\.3-alpine@sha256:[0-9a-f]{64}$/)
  // The host side is overridable for a second stack on one host; the default is the shard's 127.0.0.1:80.
  assert.deepEqual(nginx.ports, ['${TRACY_NGINX_BIND:-127.0.0.1:80}:80'])
  assert.equal(nginx.container_name, undefined, 'the project names the container')
  assert.deepEqual(nginx.networks, ['tracy'])
  assert.equal(nginx.depends_on, undefined, 'up nginx must never reconcile tracy-web')
  assert.equal(nginx.restart, 'unless-stopped')
})

test('the template mount (the flat name on the machine) and the one variable it needs', () => {
  assert.ok(nginx.volumes.includes('./nginx-shard.conf:/etc/nginx/templates/default.conf.template:ro'))
  assert.equal(nginx.environment.TRACY_NETWORK_PREFIX, '${TRACY_NETWORK_PREFIX:-172.30.0}')
  assert.deepEqual(nginx.healthcheck.test, [
    'CMD',
    'wget',
    '-q',
    '-O',
    '/dev/null',
    'http://127.0.0.1/_nginx/health'
  ])
})

test('tracy-web keeps its loopback publish 127.0.0.1:51710 in the base file (amendment 1)', () => {
  const base = load(readFileSync('deploy/compose.yml', 'utf8'))
  assert.deepEqual(base.services['tracy-web'].ports, ['127.0.0.1:${WEB_PORT:-51710}:8080'])
})
