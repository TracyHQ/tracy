/**
 * `joomla_installer_error` (`provision/platform/joomla.sh`): the line a failed Joomla CLI install is
 * reported by. Symfony Console prints a thrown error as an indented block and then the command's
 * usage synopsis, unindented, so the job's last line was the synopsis and /ops showed a usage dump
 * instead of the error (ja-restaurant 1.0.0). The platform file now prints `!! installer: <message>`
 * from the block, which tracy-web's `failureReason` reads as the reason.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/joomla-installer-error.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('../scripts/provision', import.meta.url))

/** Source the platform file on the import road and feed `output` to the function. */
function errorOf(output) {
  const script = String.raw`
tracy_web_image() { printf '%s\n' "$2"; }
tracy_webroot_dir() { printf '%s\n' "/nonexistent"; }
FRESH=0 QUICKSTART=''
. "$HERE/platform/joomla.sh"
joomla_installer_error`
  return spawnSync('bash', ['-c', script], { encoding: 'utf8', input: output, env: { ...process.env, HERE } })
}

const SYNOPSIS =
  'install [--site-name SITE-NAME] [--admin-user ADMIN-USER] [--db-pass [DB-PASS]] [--db-prefix DB-PREFIX]'

test('the message of the error block, trimmed and on one line, never the synopsis', () => {
  const r = errorOf(
    [
      'In InstallCommand.php line 123:',
      '',
      '  Table jos_users  ',
      '  already exists  ',
      '',
      '',
      SYNOPSIS,
      ''
    ].join('\n')
  )
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'Table jos_users already exists\n')
})

test('with no error block, the last line that is not the synopsis', () => {
  const r = errorOf(['Could not connect to MySQL server.', SYNOPSIS, ''].join('\n'))
  assert.equal(r.stdout, 'Could not connect to MySQL server.\n')
})

test('the installer call prints that message as its own !! installer: line on failure', () => {
  const sh = spawnSync(
    'sed',
    ['-n', '/^    joomla_installer_install() {/,/^    }/p', `${HERE}/platform/joomla.sh`],
    {
      encoding: 'utf8'
    }
  ).stdout
  assert.match(sh, /!! installer: \$\(printf '%s\\n' "\$out" \| joomla_installer_error\)/)
})
