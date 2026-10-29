/**
 * `tracy_neutralize_auto_prepend` (lib/webroot-htaccess.sh): a firewall's `auto_prepend_file` line
 * in a clone's server files names the live server's files, so it is commented out — and only it
 * (#106).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-auto-prepend.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib', 'webroot-htaccess.sh')
const root = mkdtempSync(join(tmpdir(), 'auto-prepend-'))
after(() => rmSync(root, { recursive: true, force: true }))

const neutralize = (dir) => {
  const done = spawnSync('bash', ['-c', `. "${LIB}"; tracy_neutralize_auto_prepend "$1"`, 'x', dir], {
    encoding: 'utf8'
  })
  assert.equal(done.status, 0, done.stderr)
}

test('the Wordfence loader lines are commented out; every other rule stays as it was', () => {
  const htaccess = [
    '# Wordfence WAF',
    '<IfModule mod_php7.c>',
    "\tphp_value auto_prepend_file '/home/live/public_html/wordfence-waf.php'",
    '</IfModule>',
    'PHP_ADMIN_VALUE auto_prepend_file /home/live/public_html/wordfence-waf.php',
    'php_value upload_max_filesize 64M',
    '# BEGIN WordPress',
    'RewriteRule . /index.php [L]',
    ''
  ].join('\n')
  writeFileSync(join(root, '.htaccess'), htaccess)
  writeFileSync(
    join(root, '.user.ini'),
    "; Wordfence WAF\nauto_prepend_file = '/home/live/public_html/wordfence-waf.php'\nmemory_limit = 256M\n"
  )
  neutralize(root)
  const ht = readFileSync(join(root, '.htaccess'), 'utf8').split('\n')
  assert.equal(
    ht[2],
    "# tracy-clone (names the live server's files): \tphp_value auto_prepend_file '/home/live/public_html/wordfence-waf.php'"
  )
  assert.match(ht[4], /^# tracy-clone .*PHP_ADMIN_VALUE auto_prepend_file/)
  assert.deepEqual(
    [ht[0], ht[1], ht[3], ht[5], ht[6], ht[7]],
    [
      '# Wordfence WAF',
      '<IfModule mod_php7.c>',
      '</IfModule>',
      'php_value upload_max_filesize 64M',
      '# BEGIN WordPress',
      'RewriteRule . /index.php [L]'
    ]
  )
  const ini = readFileSync(join(root, '.user.ini'), 'utf8').split('\n')
  assert.match(ini[1], /^; tracy-clone .*auto_prepend_file = /)
  assert.equal(ini[2], 'memory_limit = 256M')
  // Run again (every sync reads the live site anew): the commented lines stay as they are.
  const once = readFileSync(join(root, '.htaccess'), 'utf8')
  neutralize(root)
  assert.equal(readFileSync(join(root, '.htaccess'), 'utf8'), once)
})

test('a webroot with none of these files is left alone', () => {
  const empty = mkdtempSync(join(root, 'empty-'))
  neutralize(empty)
})
