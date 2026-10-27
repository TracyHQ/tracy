/**
 * provision/strict-site-access.sh — a NEW site is born on the signed access verifier, whatever
 * `rollout.list` says. The Claude Cowork package (pkg_claudecowork) still carries
 * plg_system_tracyaccess 0.1.4, which signs in whoever sends bare `x-tracy-email/tier/role`
 * headers; provision installs that package in its post-up hook, so this step runs after it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/strict-site-access.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/strict-site-access.sh', import.meta.url))
const ACCESS = fileURLToPath(new URL('../scripts/provision/access/', import.meta.url))
const J_SOURCE = path.join(ACCESS, 'joomla/plg_system_tracyaccess')
const WP_SOURCE = path.join(ACCESS, 'wordpress/tracy-access.php')
const OLD_XML = '<extension type="plugin" group="system"><version>0.1.4</version></extension>'

/** A host the way provision leaves a new site after its post-up hook: key + ready, no site.json yet. */
function host(t, { ready = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'strict-access-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const sites = path.join(dir, 'sites')
  const priv = path.join(dir, 'private')
  const access = path.join(priv, '.site-access', 'new1')
  mkdirSync(access, { recursive: true })
  writeFileSync(path.join(priv, '.site-access', 'rollout.list'), '# nobody listed\n')
  writeFileSync(path.join(access, 'key.json'), JSON.stringify({ v: 1, kid: 'k1', site: 'new1' }))
  if (ready) writeFileSync(path.join(access, 'ready.json'), JSON.stringify({ v: 1, kid: 'k1' }))
  const webroot = path.join(sites, 'new1', '.webroot')
  const run = (platform) => {
    const r = spawnSync('bash', [SCRIPT, 'new1', platform], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_SITES_ROOT: sites, TRACY_PRIVATE_ROOT: priv }
    })
    return { status: r.status, out: r.stderr + r.stdout }
  }
  return { webroot, access, run }
}

/** What the Cowork package's installer leaves: the old, header-trusting plugin. */
function cowork014(webroot) {
  const plugin = path.join(webroot, 'plugins/system/tracyaccess')
  mkdirSync(path.join(plugin, 'src/Extension'), { recursive: true })
  writeFileSync(path.join(plugin, 'tracyaccess.xml'), OLD_XML)
  writeFileSync(path.join(plugin, 'src/Extension/TracyAccess.php'), '<?php // trusts HTTP_X_TRACY_EMAIL')
  return plugin
}

test('Joomla: the plugin the Cowork package installed is replaced by the signed verifier, rollout.list or not', (t) => {
  const h = host(t)
  const plugin = cowork014(h.webroot)
  const r = h.run('joomla')
  assert.equal(r.status, 0, r.out)
  for (const rel of ['tracyaccess.xml', 'src/Extension/TracyAccess.php', 'lib/AccessAssertion.php'])
    assert.equal(
      readFileSync(path.join(plugin, rel), 'utf8'),
      readFileSync(path.join(J_SOURCE, rel), 'utf8'),
      rel
    )
  assert.match(readFileSync(path.join(plugin, 'tracyaccess.xml'), 'utf8'), /<version>0\.2\.0<\/version>/)
})

test('the site is marked born strict, so every later resync keeps it strict', (t) => {
  const h = host(t)
  cowork014(h.webroot)
  assert.equal(h.run('joomla').status, 0)
  assert.equal(JSON.parse(readFileSync(path.join(h.access, 'strict.json'), 'utf8')).v, 1)
})

test('Joomla with no Cowork package (no tracyaccess): nothing to replace, still marked', (t) => {
  const h = host(t)
  mkdirSync(path.join(h.webroot, 'plugins/system'), { recursive: true })
  const r = h.run('joomla')
  assert.equal(r.status, 0, r.out)
  assert.ok(!existsSync(path.join(h.webroot, 'plugins/system/tracyaccess')))
  assert.ok(existsSync(path.join(h.access, 'strict.json')))
})

test('a site whose readiness was never proven fails the step: it would keep the header-trusting plugin', (t) => {
  const h = host(t, { ready: false })
  cowork014(h.webroot)
  const r = h.run('joomla')
  assert.notEqual(r.status, 0, r.out)
  assert.match(r.out, /0\.1\.4|not the signed verifier/)
})

test('WordPress: the mu-plugin stage 6b copied is checked to be the signed one', (t) => {
  const h = host(t)
  const mu = path.join(h.webroot, 'wp-content/mu-plugins')
  mkdirSync(mu, { recursive: true })
  writeFileSync(path.join(mu, 'tracy-access.php'), readFileSync(WP_SOURCE))
  assert.equal(h.run('wordpress').status, 0)
  writeFileSync(path.join(mu, 'tracy-access.php'), '<?php // 0.3.0, trusts x-tracy-email')
  const r = h.run('wordpress')
  assert.notEqual(r.status, 0, r.out)
  assert.match(r.out, /not the signed verifier/)
})

const PROVISION = readFileSync(
  fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url)),
  'utf8'
)
/** Offset of the first command line (comments left out) matching `pattern`. */
function firstCall(src, pattern) {
  let at = 0
  for (const line of src.split('\n')) {
    if (line.trim() && !line.trim().startsWith('#') && !/\(\)\s*\{/.test(line) && pattern.test(line))
      return at
    at += line.length + 1
  }
  assert.fail(`no command matching ${pattern}`)
}

test('provision runs the step after the post-up hook (which installs the Cowork package) and before the baseline', () => {
  const step = firstCall(PROVISION, /strict-site-access\.sh"? "\$LABEL" "\$PLATFORM"/)
  assert.ok(firstCall(PROVISION, /\.site-access\/\$LABEL\/ready\.json/) < step, 'after the readiness record')
  assert.ok(firstCall(PROVISION, /^\s*platform_post_up\b/) < step, 'after platform_post_up')
  assert.ok(step < firstCall(PROVISION, /\bbuild_webroot_baseline\b/), 'before the webroot baseline')
})

test('restore resyncs both access plugins for the label after rotating its key: a snapshot may carry an old one', () => {
  const RESTORE = readFileSync(
    fileURLToPath(new URL('../scripts/provision/restore.sh', import.meta.url)),
    'utf8'
  )
  const rotate = firstCall(RESTORE, /issue-site-access-key\.sh" --rotate/)
  const resync = firstCall(RESTORE, /tools\/\$resync" "\$LABEL"/)
  assert.ok(rotate < resync)
  assert.match(RESTORE, /for resync in resync-joomla-access-plugin\.sh resync-access-plugin\.sh; do/)
})
