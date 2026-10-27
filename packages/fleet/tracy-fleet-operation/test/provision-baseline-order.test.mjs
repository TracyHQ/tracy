#!/usr/bin/env node
/**
 * Dev e2e 04/10/2026 (E1.2): a new WordPress or Joomla site started with "Files changed; source
 * unknown" rows in Site changes — 79 files on WordPress (Tracy's Cowork plugin, `mu-plugins/
 * tracy-access.php`, `.htaccess`, `wp-config.php`), 50 + 109 on Joomla (`com_claudecowork`,
 * `.htaccess`). A site built from an archive (a quickstart, an import) took its webroot baseline —
 * the commit v1 "Initial backup" is tagged on — right after the archive was unpacked, BEFORE
 * provision wrote its own files into the webroot (the site's configuration, the sign-in plugin, the
 * Cowork plugin, the root `.htaccess`). So v1 did not hold the site as built (its database did), and
 * the first look sealed provision's own writes as somebody else's.
 *
 * The baseline is now built once, for every platform with a webroot, after every step that writes
 * into the webroot and before the Initial backup puts the database on v1.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/provision-baseline-order.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = readFileSync(fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url)), 'utf8')
/** The script's commands, comments left out, with each line's offset in the file. */
const commands = SRC.split('\n')
  .map((line, i, all) => ({ line, at: all.slice(0, i).join('\n').length }))
  .filter(({ line }) => line.trim() !== '' && !line.trim().startsWith('#'))
const callsOf = (pattern) => commands.filter(({ line }) => pattern.test(line) && !/\(\)\s*\{/.test(line))
const firstCall = (pattern) => {
  const found = callsOf(pattern)
  assert.ok(found.length > 0, `provision.sh no longer calls ${pattern}`)
  return found[0].at
}

test('E1.2: the webroot baseline is built in exactly one place, for every platform with a webroot', () => {
  const calls = callsOf(/\bbuild_webroot_baseline\b/)
  assert.equal(calls.length, 1, calls.map((c) => c.line.trim()).join('\n'))
  assert.doesNotMatch(calls[0].line, /PLATFORM_NEEDS_WEBROOT/, 'an archive-built site is no exception')
})

test('E1.2: the baseline comes after every provision write into the webroot, and before the Initial backup', () => {
  const baseline = firstCall(/\bbuild_webroot_baseline\b/)
  for (const writer of [
    /^\s*platform_configure\b/, // wp-config.php / configuration.php for this environment
    /tracy_ensure_webroot_htaccess /, // the root .htaccess
    /^\s*platform_install_access\b/, // the sign-in plugin (mu-plugins/tracy-access.php, plg_system_tracyaccess)
    /^\s*platform_post_up\b/ // the Cowork plugin, the content contract
  ])
    assert.ok(firstCall(writer) < baseline, `${writer} must run before the baseline`)
  assert.ok(
    baseline < firstCall(/--op initial-backup/),
    'the Initial backup tags the baseline: it comes after'
  )
})

test('the webroot goes back to the web user after the post-up hook, which runs PHP as root, and before the baseline', () => {
  const owns = callsOf(/^\s*own_webroot\s*$/).map((c) => c.at)
  const postUp = firstCall(/^\s*platform_post_up\b/)
  assert.ok(
    owns.some((at) => at > postUp && at < firstCall(/\bbuild_webroot_baseline\b/)),
    'own_webroot must run between platform_post_up and the baseline'
  )
  assert.ok(
    owns.some((at) => at < postUp),
    'and once before the doors are installed, as before'
  )
})
