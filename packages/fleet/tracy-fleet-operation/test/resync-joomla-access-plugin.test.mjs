/**
 * tools/resync-joomla-access-plugin.sh — the strict Joomla access plugin reaches a site only when it
 * is ready (key + proven readiness) and listed for the rollout; a symlink in the webroot is refused.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/resync-joomla-access-plugin.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/tools/resync-joomla-access-plugin.sh', import.meta.url))
const SOURCE = fileURLToPath(
  new URL(
    '../scripts/provision/access/joomla/plg_system_tracyaccess/src/Extension/TracyAccess.php',
    import.meta.url
  )
)

function host(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'resync-joomla-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const sites = path.join(dir, 'sites')
  const priv = path.join(dir, 'private')
  mkdirSync(path.join(priv, '.site-access'), { recursive: true })
  const site = (label, { ready = true, plugin = true, platform = 'joomla' } = {}) => {
    mkdirSync(path.join(sites, label, '.tracy'), { recursive: true })
    writeFileSync(path.join(sites, label, '.tracy/site.json'), JSON.stringify({ platform }))
    const ext = path.join(sites, label, '.webroot/plugins/system/tracyaccess/src/Extension')
    if (plugin) {
      mkdirSync(ext, { recursive: true })
      writeFileSync(path.join(ext, 'TracyAccess.php'), '<?php // old, believes bare headers')
    } else mkdirSync(path.join(sites, label, '.webroot/plugins/system'), { recursive: true })
    if (ready) {
      mkdirSync(path.join(priv, '.site-access', label))
      writeFileSync(path.join(priv, '.site-access', label, 'key.json'), JSON.stringify({ v: 1, kid: 'k1' }))
      writeFileSync(path.join(priv, '.site-access', label, 'ready.json'), JSON.stringify({ v: 1, kid: 'k1' }))
    }
    return path.join(ext, 'TracyAccess.php')
  }
  const list = (body) => writeFileSync(path.join(priv, '.site-access', 'rollout.list'), body)
  const run = () => {
    const r = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_SITES_ROOT: sites, TRACY_PRIVATE_ROOT: priv }
    })
    return { status: r.status, out: r.stderr + r.stdout }
  }
  return { sites, privRoot: priv, site, list, run }
}

test('a ready, listed site gets the strict plugin; a second run writes nothing', (t) => {
  const h = host(t)
  const dest = h.site('jsite')
  h.list('jsite\n')
  const r = h.run()
  assert.equal(r.status, 0, r.out)
  assert.equal(readFileSync(dest, 'utf8'), readFileSync(SOURCE, 'utf8'))
  assert.match(h.run().out, /done: 0 updated, 1 up to date/)
})

test('unlisted, unready, uninstalled and non-Joomla sites are left as they are', (t) => {
  const h = host(t)
  const unlisted = h.site('unlisted')
  const unready = h.site('unready', { ready: false })
  h.site('noplugin', { plugin: false })
  h.site('wpsite', { platform: 'wordpress' })
  h.list('unready\nnoplugin\nwpsite\n')
  const r = h.run()
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /unlisted: held — not on the rollout list/)
  assert.match(r.out, /unready: held — no access key/)
  assert.match(r.out, /noplugin: no plugins\/system\/tracyaccess — skipped/)
  assert.match(r.out, /done: 0 updated, 0 up to date, 2 skipped, 2 held, 0 failed/)
  assert.match(readFileSync(unlisted, 'utf8'), /old/)
  assert.match(readFileSync(unready, 'utf8'), /old/)
})

test('a plugin directory swapped for a symlink is refused, nothing written through it', (t) => {
  const h = host(t)
  h.site('jsite', { plugin: false })
  const elsewhere = path.join(h.sites, '..', 'elsewhere')
  mkdirSync(elsewhere)
  symlinkSync(elsewhere, path.join(h.sites, 'jsite/.webroot/plugins/system/tracyaccess'))
  h.list('*\n')
  const r = h.run()
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /jsite: tracyaccess is a symlink or not a directory — refused/)
  assert.equal(spawnSync('ls', ['-A', elsewhere], { encoding: 'utf8' }).stdout, '')
})

// A site provision created strict (`.site-access/<label>/strict.json`) keeps the strict plugin with no
// rollout.list line: the Claude Cowork package still carries the old plugin and puts it back on update.
test('a site born strict is resynced without a rollout.list line; its unmarked neighbour is held', (t) => {
  const h = host(t)
  const born = h.site('born')
  const neighbour = h.site('neighbour')
  writeFileSync(path.join(h.privRoot, '.site-access', 'born', 'strict.json'), '{"v":1}\n')
  h.list('# nobody listed\n')
  const r = h.run()
  assert.equal(r.status, 0, r.out)
  assert.equal(readFileSync(born, 'utf8'), readFileSync(SOURCE, 'utf8'))
  assert.match(readFileSync(neighbour, 'utf8'), /old/)
  assert.match(r.out, /done: 1 updated, 0 up to date, 0 skipped, 1 held, 0 failed/)
})

test('born strict but not proven ready: still held', (t) => {
  const h = host(t)
  const born = h.site('born', { ready: false })
  mkdirSync(path.join(h.privRoot, '.site-access', 'born'))
  writeFileSync(path.join(h.privRoot, '.site-access', 'born', 'strict.json'), '{"v":1}\n')
  const r = h.run()
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /born: held — no access key/)
  assert.match(readFileSync(born, 'utf8'), /old/)
})

test('--platform joomla <label>: a site whose site.json names no platform is resynced; without it, skipped', (t) => {
  const h = host(t)
  const dest = h.site('noplat', { platform: null })
  h.list('*\n')
  assert.match(h.run().out, /done: 0 updated, 0 up to date, 1 skipped/)
  const r = spawnSync('bash', [SCRIPT, '--platform', 'joomla', 'noplat'], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_SITES_ROOT: h.sites, TRACY_PRIVATE_ROOT: h.privRoot }
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(dest, 'utf8'), readFileSync(SOURCE, 'utf8'))
})
