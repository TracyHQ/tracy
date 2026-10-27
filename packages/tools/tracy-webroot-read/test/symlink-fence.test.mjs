#!/usr/bin/env node
/**
 * Every folder and file the two tools read stays inside the session's webroot.
 *
 *   node --test packages/tools/tracy-webroot-read/test/symlink-fence.test.mjs
 *
 * Survey of 08/10/2026, reproduced on a scratch copy: `sessionWebroot` fenced the webroot itself,
 * but the walk opened its named areas (`components`, `wp-content/…`, `templates`) and named files
 * (`wp-config.php`, `style.css`) by path. A `.webroot/components` symlinked into another site's
 * folder made `tracy_find_definition` answer with that site's file and line, and the profile list
 * its extensions: another customer's paths, plugin names and table prefix.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { apply } from '../index.js'
import { insideWebroot, openInsideWebroot, WEBROOT_DIR } from '../src/webroot.mjs'

/** Two sites side by side under one sites root, as on a host; returns both site folders. */
async function twoSites() {
  const sites = await realpath(await mkdtemp(path.join(tmpdir(), 'sites-')))
  const mine = path.join(sites, 'mine')
  const victim = path.join(sites, 'victim')
  await mkdir(path.join(mine, WEBROOT_DIR, 'libraries/src'), { recursive: true })
  await writeFile(path.join(mine, WEBROOT_DIR, 'configuration.php'), '<?php', 'utf8')
  await writeFile(
    path.join(mine, WEBROOT_DIR, 'libraries/src/Version.php'),
    '<?php const MAJOR_VERSION = 5;',
    'utf8'
  )
  await mkdir(path.join(victim, WEBROOT_DIR, 'components/com_secret'), { recursive: true })
  await writeFile(
    path.join(victim, WEBROOT_DIR, 'components/com_secret/secret.php'),
    "<?php add_option('victim_only', 1);",
    'utf8'
  )
  await writeFile(path.join(victim, WEBROOT_DIR, 'wp-config.php'), "<?php $table_prefix = 'vic_';", 'utf8')
  return { mine, victim }
}

/** The two tools as dsh registers them, run for a session standing in `cwd`. */
function tools() {
  const registered = new Map()
  apply(
    {
      effect: (setup) => setup(),
      tools: { register: (tool) => (registered.set(tool.name, tool), () => {}) }
    },
    {}
  )
  return (name, args, cwd) => registered.get(name).execute(args, { agent: { session: { header: { cwd } } } })
}

test('insideWebroot: a path whose real place is outside the webroot is null', async () => {
  const { mine, victim } = await twoSites()
  const root = path.join(mine, WEBROOT_DIR)
  await symlink(path.join(victim, WEBROOT_DIR, 'components'), path.join(root, 'components'))
  assert.equal(
    await insideWebroot(root, path.join(root, 'configuration.php')),
    path.join(root, 'configuration.php')
  )
  assert.equal(await insideWebroot(root, path.join(root, 'components')), null)
  assert.equal(await insideWebroot(root, path.join(root, 'components/com_secret/secret.php')), null)
  assert.equal(await insideWebroot(root, path.join(root, 'missing.php')), null)
})

test("a planted symlink area never brings another site's file into tracy_find_definition", async () => {
  const { mine, victim } = await twoSites()
  await symlink(path.join(victim, WEBROOT_DIR, 'components'), path.join(mine, WEBROOT_DIR, 'components'))
  const run = tools()
  const found = await run('tracy_find_definition', { symbol: 'victim_only' }, mine)
  assert.deepEqual(found.matches ?? [], [], JSON.stringify(found))
  assert.doesNotMatch(JSON.stringify(found.matches), /secret\.php/)
  assert.equal(found.filesScanned, 2)
})

test("a planted symlink never lists another site's extensions or reads its config in the profile", async () => {
  const { mine, victim } = await twoSites()
  const root = path.join(mine, WEBROOT_DIR)
  await symlink(path.join(victim, WEBROOT_DIR, 'components'), path.join(root, 'components'))
  const run = tools()
  const profile = await run('tracy_site_profile', {}, mine)
  assert.equal(profile.platform, 'joomla')
  assert.deepEqual(profile.extensions, [])
  // A WordPress-shaped webroot whose wp-config.php is a link to the neighbour's: no prefix leaks.
  await mkdir(path.join(root, 'wp-includes'), { recursive: true })
  await writeFile(path.join(root, 'wp-includes/version.php'), "<?php $wp_version = '6.8';", 'utf8')
  await symlink(path.join(victim, WEBROOT_DIR, 'wp-config.php'), path.join(root, 'wp-config.php'))
  const wordpress = await run('tracy_site_profile', {}, mine)
  assert.equal(wordpress.platform, 'wordpress')
  assert.doesNotMatch(JSON.stringify(wordpress), /vic_/)
})

test('openInsideWebroot: a file inside opens; a link leaving the webroot does not', async () => {
  const { mine, victim } = await twoSites()
  const root = path.join(mine, WEBROOT_DIR)
  const inside = await openInsideWebroot(root, path.join(root, 'configuration.php'))
  assert.ok(inside)
  assert.equal(await inside.readFile('utf8'), '<?php')
  await inside.close()
  await symlink(path.join(victim, WEBROOT_DIR, 'wp-config.php'), path.join(root, 'leak.php'))
  assert.equal(await openInsideWebroot(root, path.join(root, 'leak.php')), null)
})

// The race itself: a folder flipped between a real one and a link into the neighbour, as fast as the
// event loop lets it, while reads run. The descriptor check is what closes it, and it needs /proc.
test("a folder flipped to the neighbour's during reads never yields the neighbour's file", {
  skip: !existsSync('/proc/self/fd') && 'no /proc on this machine: the descriptor check cannot run'
}, async () => {
  const { mine, victim } = await twoSites()
  const root = path.join(mine, WEBROOT_DIR)
  await mkdir(path.join(root, 'area'), { recursive: true })
  await writeFile(path.join(root, 'area', 'file.php'), 'mine')
  await mkdir(path.join(victim, WEBROOT_DIR, 'area'), { recursive: true })
  await writeFile(path.join(victim, WEBROOT_DIR, 'area', 'file.php'), 'victim')
  // The real folder steps aside and a link to the neighbour's takes its name, then back: a path
  // that was real when `realpath` read it can be a link when `open` walks it.
  const area = path.join(root, 'area')
  const hold = path.join(root, 'area-hold')
  let flipping = true
  const flip = (async () => {
    while (flipping) {
      await rename(area, hold)
      await symlink(path.join(victim, WEBROOT_DIR, 'area'), area)
      await new Promise((r) => setImmediate(r))
      await unlink(area)
      await rename(hold, area)
      await new Promise((r) => setImmediate(r))
    }
  })()
  const seen = new Set()
  for (let i = 0; i < 2000; i += 1) {
    const handle = await openInsideWebroot(root, path.join(root, 'area', 'file.php')).catch(() => null)
    if (handle === null) continue
    seen.add(await handle.readFile('utf8'))
    await handle.close()
  }
  flipping = false
  await flip
  assert.equal(seen.has('victim'), false)
})
