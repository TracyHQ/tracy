//   node --test scripts/test/shard-nginx.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { R } from './_shard.mjs'

const conf = readFileSync(path.join(R, 'deploy/nginx/shard.conf'), 'utf8')
const live = conf
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n')

test('proxies to tracy-web on its container port 8080, through a variable and the docker resolver', () => {
  assert.match(live, /set \$tracy_web http:\/\/tracy-web:8080;/)
  assert.match(live, /proxy_pass \$tracy_web;/)
  assert.match(live, /resolver 127\.0\.0\.11 /)
  assert.doesNotMatch(live, /51710/)
})

test('passes Host and the X-Forwarded-Proto Cloudflare sent (bar/route.js reads both)', () => {
  assert.match(live, /proxy_set_header Host \$host;/)
  assert.match(live, /map \$http_x_forwarded_proto \$tracy_forwarded_proto \{/)
  assert.match(live, /proxy_set_header X-Forwarded-Proto \$tracy_forwarded_proto;/)
})

test('strips exactly the four vouching headers and keeps actor, session and probe headers', () => {
  for (const h of ['x-tracy-email', 'x-tracy-tier', 'x-tracy-role', 'x-tracy-edge'])
    assert.match(live, new RegExp(`proxy_set_header ${h} "";`), h)
  for (const h of ['x-tracy-actor', 'x-tracy-session', 'probe'])
    assert.doesNotMatch(live, new RegExp(`proxy_set_header [^;]*${h}`), h)
})

test('client address from CF-Connecting-IP, trusted only from loopback and the tracy gateway', () => {
  assert.match(live, /set_real_ip_from 127\.0\.0\.1;/)
  assert.match(live, /set_real_ip_from \$\{TRACY_NETWORK_PREFIX\}\.1;/)
  assert.match(live, /real_ip_header CF-Connecting-IP;/)
  assert.equal((live.match(/set_real_ip_from/g) ?? []).length, 2)
})

test('websockets, hour-long reads, no buffering, 100m bodies, a per-address rate limit', () => {
  for (const re of [
    /proxy_http_version 1\.1;/,
    /proxy_set_header Upgrade \$http_upgrade;/,
    /proxy_set_header Connection \$tracy_connection;/,
    /proxy_read_timeout 3600s;/,
    /proxy_buffering off;/,
    /client_max_body_size 100m;/,
    /limit_req_zone \$binary_remote_addr zone=tracy_per_ip:10m rate=\d+r\/s;/,
    /limit_req zone=tracy_per_ip burst=\d+ nodelay;/
  ])
    assert.match(live, re)
})

test('only loopback and port 80 are live; the A-record 443 block is written and commented out', () => {
  assert.match(live, /listen 80 default_server;/)
  assert.doesNotMatch(live, /listen 443/)
  assert.match(conf, /^#\s+listen 443 ssl/m)
  assert.match(conf, /^#\s+ssl_verify_client on;/m)
})

test('/_shard/status is never served through the front door', () => {
  assert.match(live, /location = \/_shard\/status \{ return 404; \}/)
})
