/**
 * `provision/go-live.sh` rewrites the site's `apache/tracy-noindex.conf` on every Publish and Back
 * to draft, and that file carries `frame-ancestors 'self' https://*.<zone>`. The zone must come
 * from the same chain provision.sh and teardown.sh read: `FLEET_ZONE`, then `SITE_DOMAIN`, then
 * `tracy.ai`.
 *
 * Measured 22/10/2026 on the dev host (zone `tracy.site`): a fresh draft site sent
 * `https://*.tracy.site`, every published demo sent `https://*.tracy.ai` — go-live never read
 * `SITE_DOMAIN`, so a shard origin (`https://s1.tracy.site`) could not frame the published demos.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/go-live-fleet-zone.test.mjs
 *
 * The script runs from a scratch copy of `provision/` + `lib/`, with `ingress_api.py`, `docker`,
 * `iptables` and `netfilter-persistent` replaced by stubs, so nothing on this machine is touched.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const LABEL = 'ja-diner-wordpress'

function stage() {
  const root = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'go-live-zone-'))
  mkdirSync(path.join(root, 'fleet', 'provision'), { recursive: true })
  mkdirSync(path.join(root, 'fleet', 'lib'), { recursive: true })
  copyFileSync(
    path.join(SCRIPTS, 'provision', 'go-live.sh'),
    path.join(root, 'fleet', 'provision', 'go-live.sh')
  )
  for (const lib of readdirSync(path.join(SCRIPTS, 'lib')))
    if (lib.endsWith('.sh'))
      copyFileSync(path.join(SCRIPTS, 'lib', lib), path.join(root, 'fleet', 'lib', lib))
  writeFileSync(path.join(root, 'fleet', 'provision', 'ingress_api.py'), 'import sys\n')
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const stub = (name, body) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(path.join(bin, name), 0o755)
  }
  stub('docker', 'case "$1 $2" in "network inspect") echo 10.9.0.0/24; exit 0 ;; esac\nexit 0')
  // Stateful enough for both directions: `draft` inserts the mail rule and reads it back from the
  // listing, `live` finds none and asks `-C`, which answers "no such rule".
  const rule = path.join(root, 'iptables-rule')
  stub(
    'iptables',
    [
      `RULE=${JSON.stringify(rule)}`,
      'case "$1" in',
      '  -S) echo "-N DOCKER-USER"; [ -f "$RULE" ] && cat "$RULE"; exit 0 ;;',
      '  -I) echo "-A DOCKER-USER $3 $4 $5 $6" > "$RULE"; exit 0 ;;',
      '  -D) rm -f "$RULE"; exit 0 ;;',
      '  -C) [ -f "$RULE" ] && exit 0; exit 1 ;;',
      'esac',
      'exit 0'
    ].join('\n')
  )
  stub('netfilter-persistent', 'exit 0')
  const site = path.join(root, 'private', LABEL)
  mkdirSync(path.join(site, 'apache'), { recursive: true })
  writeFileSync(path.join(site, '.env'), 'HOST_PORT=52001\n')
  // The step that rewrites the conf only runs for a site that already has one (provision wrote it).
  writeFileSync(path.join(site, 'apache', 'tracy-noindex.conf'), '# written by provision\n')
  return { root, bin, site }
}

function goLive({ root, bin }, op, extraEnv) {
  return spawnSync(
    'bash',
    [
      path.join(root, 'fleet', 'provision', 'go-live.sh'),
      '--label',
      LABEL,
      '--root',
      path.join(root, 'private'),
      '--platform',
      'emdash',
      '--op',
      op
    ],
    {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: root,
        TRACY_PRIVATE_ROOT: path.join(root, 'private'),
        TRACY_SITES_ROOT: path.join(root, 'sites'),
        TRACY_TUNNEL: 'catch-all',
        TRACY_ORIGIN: 'https://cowork.tracy.site',
        ...extraEnv
      },
      encoding: 'utf8',
      timeout: 60_000
    }
  )
}

function framePolicy(site) {
  return readFileSync(path.join(site, 'apache', 'tracy-noindex.conf'), 'utf8')
    .split('\n')
    .find((line) => line.startsWith('Header always set Content-Security-Policy'))
}

for (const op of ['live', 'draft']) {
  test(`${op}: SITE_DOMAIN alone names the zone in frame-ancestors, as provision.sh does`, () => {
    const s = stage()
    try {
      const run = goLive(s, op, { SITE_DOMAIN: 'tracy.site' })
      assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
      const policy = framePolicy(s.site)
      assert.ok(policy, 'the conf carries a frame-ancestors policy')
      assert.ok(policy.includes("frame-ancestors 'self' https://*.tracy.site "), policy)
      assert.ok(!policy.includes('tracy.ai'), policy)
      assert.ok(policy.includes(' https://cowork.tracy.site"'), policy)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  })
}

test('FLEET_ZONE still wins over SITE_DOMAIN, the same order provision.sh reads them in', () => {
  const s = stage()
  try {
    const run = goLive(s, 'live', { FLEET_ZONE: 'tracy.ai', SITE_DOMAIN: 'tracy.site' })
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.ok(framePolicy(s.site).includes("frame-ancestors 'self' https://*.tracy.ai "))
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('neither set: the zone falls back to tracy.ai, as before', () => {
  const s = stage()
  try {
    const run = goLive(s, 'draft', {})
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.ok(framePolicy(s.site).includes("frame-ancestors 'self' https://*.tracy.ai "))
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('go-live.sh derives FLEET_ZONE from SITE_DOMAIN before it first writes the conf', () => {
  const text = readFileSync(path.join(SCRIPTS, 'provision', 'go-live.sh'), 'utf8')
  const derive = text.indexOf('FLEET_ZONE="${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}"')
  assert.ok(derive >= 0, 'go-live.sh reads the same FLEET_ZONE → SITE_DOMAIN → tracy.ai chain')
  assert.ok(derive < text.indexOf('tracy_write_apache_conf "$SITE_DIR"'))
})
