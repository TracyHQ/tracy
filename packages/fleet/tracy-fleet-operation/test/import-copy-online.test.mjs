/**
 * An imported copy is online (beta week 16–23/10/2026): a customer rebuilding their site often keeps it
 * offline, the import reads it through the administrator door for that reason, and the copy kept the
 * offline flag — so the customer's preview and the agent's page pictures showed only the offline page
 * ("I cannot check it on screen: the copy shows a maintenance page", every turn of one site).
 *
 * Joomla: `render_configuration.py --online` (passed by `platform/joomla.sh` for an imported copy)
 * sets `offline` to 0, and `offline` is an environment setting, so Sync from live never brings it back.
 * WordPress: the import's `platform_post_up` removes a `.maintenance` file.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/import-copy-online.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const LIB = fileURLToPath(new URL('../scripts/lib/', import.meta.url))

const SOURCE = "<?php\nclass JConfig {\n\tpublic $offline = true;\n\tpublic $secret = 'source';\n}\n"

/** @param {string[]} extra */
function render(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'online-'))
  const source = join(dir, 'configuration.source.php')
  const out = join(dir, 'configuration.php')
  writeFileSync(source, SOURCE)
  const run = spawnSync(
    'python3',
    [
      join(PROVISION, 'render_configuration.py'),
      '--source',
      source,
      '--out',
      out,
      '--db-host',
      'db',
      '--db-user',
      'u',
      '--db-password',
      'p',
      '--db-name',
      'joomla',
      '--live-site',
      'https://copy.tracy.ai',
      ...extra
    ],
    { encoding: 'utf8' }
  )
  assert.equal(run.status, 0, run.stderr)
  return readFileSync(out, 'utf8')
}

test('Joomla: an imported copy is rendered online; without --online the site keeps what it said', () => {
  const online = render(['--online'])
  assert.match(online, /\tpublic \$offline = 0;\n/)
  assert.doesNotMatch(online, /\$offline = true/)
  assert.match(render([]), /\$offline = true/)
})

test('Joomla: Sync from live treats offline as the environment’s, so a sync never takes the copy offline', () => {
  const run = spawnSync(
    'python3',
    [
      '-c',
      `import sys; sys.path.insert(0, ${JSON.stringify(LIB)}); import live_sync; print('offline' in live_sync.JOOMLA_ENVIRONMENT_SETTINGS)`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), 'True')
})

test('Joomla: platform/joomla.sh passes --online only for an imported copy', () => {
  const script = readFileSync(join(PROVISION, 'platform/joomla.sh'), 'utf8')
  assert.match(script, /\[ "\$\{SITE_ORIGIN:-\}" = imported \] && online="--online"/)
  assert.match(script, /--live-site "\$SITE_URL" \$ALLOW_MAIL \$online/)
})

test('WordPress: the import removes a .maintenance file the archive carried', () => {
  const script = readFileSync(join(PROVISION, 'platform/wordpress.sh'), 'utf8')
  const postUp = script.slice(script.lastIndexOf('platform_post_up() {'))
  assert.match(postUp, /rm -f "\$\(tracy_webroot_dir "\$LABEL"\)\/\.maintenance"/)
})
