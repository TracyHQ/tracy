/**
 * The three site rules the provider applies in `tools/pre-execute`, pinned without a filesystem:
 * platform core refuses writes, a new PHP file in the public webroot is refused, and so are secrets
 * files.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/site-guards.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PLATFORM_CORE,
  commandApprovalReason,
  newWebrootPhpReason,
  platformCoreReason,
  readTargetArg,
  secretsFileReason,
  writeTargetArg
} from '../src/site-guards.mjs'

const SITE = '/site/wpdemo'
const SECRETS_REASON = 'holds the database password; read CMS data through tracy_site instead.'
/**
 * Joomla keeps `sitename`/`MetaDesc` in `configuration.php` itself, so for that file the refusal must
 * NOT point to `tracy_site` — that door cannot read them. See the last test in this file.
 */
const JOOMLA_SECRETS_TAIL = /config:get/

test('writeTargetArg: write, edit, and every str_replace_editor command except view', () => {
  assert.equal(writeTargetArg('write', { file_path: 'x', content: 'y' }), 'file_path')
  assert.equal(writeTargetArg('edit', { file_path: 'x' }), 'file_path')
  for (const command of ['create', 'str_replace', 'insert']) {
    assert.equal(writeTargetArg('str_replace_editor', { command, path: 'x' }), 'path', command)
  }
  assert.equal(writeTargetArg('str_replace_editor', { command: 'view', path: 'x' }), null)
  for (const tool of ['read', 'grep', 'glob', 'bash']) assert.equal(writeTargetArg(tool, {}), null, tool)
  assert.equal(writeTargetArg('str_replace_editor', undefined), 'path')
})

test('platformCoreReason: the core directories under .webroot, at any depth below them', () => {
  for (const dir of PLATFORM_CORE) {
    assert.ok(platformCoreReason(`${SITE}/.webroot/${dir}`, SITE), dir)
    assert.ok(platformCoreReason(`${SITE}/.webroot/${dir}/deep/file.php`, SITE), dir)
  }
  assert.equal(
    platformCoreReason(`${SITE}/.webroot/administrator/includes/app.php`, SITE),
    ".webroot/administrator/includes/app.php is platform core: an edit there is lost at the next update. Use a child theme, a template override (templates/<template>/html/) or the template's user.css."
  )
})

test("platformCoreReason: the site's own code, and names that only resemble core, are not core", () => {
  for (const path of [
    `${SITE}/.webroot`,
    `${SITE}/.webroot/index.php`,
    `${SITE}/.webroot/wp-content/themes/child/style.css`,
    `${SITE}/.webroot/wp-content/plugins/shop/includes/cart.php`,
    `${SITE}/.webroot/wp-includes-old/version.php`,
    `${SITE}/.webroot/administrator/components/com_content/config.xml`,
    `${SITE}/.webroot/layouts/custom/card.php`,
    `${SITE}/.webroot/templates/cassiopeia/html/layouts/joomla/content/icons.php`,
    `${SITE}/wp-includes/version.php`,
    '/site/fijitrips/.webroot/wp-includes/version.php'
  ]) {
    assert.equal(platformCoreReason(path, SITE), null, path)
  }
})

test('readTargetArg: the path argument of read and grep, nothing else', () => {
  assert.equal(readTargetArg('read'), 'file_path')
  assert.equal(readTargetArg('grep'), 'path')
  for (const tool of ['glob', 'write', 'bash', 'read_image']) assert.equal(readTargetArg(tool), null, tool)
})

test('secretsFileReason: the CMS config at the webroot, and .env anywhere in the site', () => {
  assert.equal(
    secretsFileReason(`${SITE}/.webroot/wp-config.php`, SITE),
    `.webroot/wp-config.php ${SECRETS_REASON}`
  )
  assert.equal(
    secretsFileReason(`${SITE}/.webroot/configuration.php`, SITE),
    // ⚠ NOT `SECRETS_REASON`: Joomla is pointed to `config:get` (the last test in this file says why).
    secretsFileReason(`${SITE}/.webroot/configuration.php`, SITE)
  )
  assert.equal(secretsFileReason(`${SITE}/.env`, SITE), `.env ${SECRETS_REASON}`)
  assert.equal(secretsFileReason(`${SITE}/.webroot/app/.env`, SITE), `.webroot/app/.env ${SECRETS_REASON}`)
  for (const path of [
    `${SITE}/.webroot/blog/wp-config.php`,
    `${SITE}/.webroot/wp-config-sample.php`,
    `${SITE}/.webroot/administrator/components/com_config/configuration.php`,
    `${SITE}/.webroot/.env.example`,
    `${SITE}/my.env`,
    `${SITE}/.webroot`,
    '/site/fijitrips/.env'
  ]) {
    assert.equal(secretsFileReason(path, SITE), null, path)
  }
})

test('commandApprovalReason: a secrets file named as a whole word of the command', () => {
  assert.equal(commandApprovalReason('cat .webroot/wp-config.php'), `wp-config.php ${SECRETS_REASON}`)
  for (const command of [
    'cat wp-config.php',
    'source .env',
    'cat "$ROOT/.env"',
    'sed -n 20,30p wp-config.php;'
  ]) {
    assert.ok(commandApprovalReason(command)?.endsWith(SECRETS_REASON), command)
  }
  // Same rule, but `configuration.php` carries Joomla's tail — still blocked, only the next step differs.
  for (const command of ['grep DB_PASSWORD "configuration.php"', `php -r 'include "configuration.php";'`]) {
    assert.match(commandApprovalReason(command) ?? '', JOOMLA_SECRETS_TAIL, command)
  }
  for (const command of [
    'cp wp-config-sample.php x',
    'cat .env.example',
    'cat my.env',
    'echo $ENV',
    'ls .envrc'
  ]) {
    assert.equal(commandApprovalReason(command), null, command)
  }
})

test('commandApprovalReason: the database itself is not refused — the written trace is asked for instead', () => {
  // A text match refused the honest call and saw nothing else: a PHP script bootstrapping the CMS's
  // own database API reached the same tables through none of these words. The rule the customer is
  // owed — a note under `docs/agents/db-changes/` — is in the site context, not here.
  for (const command of [
    'mysql -u root wordpress',
    'mysqldump wordpress > dump.sql',
    'wp db query "UPDATE wp_options SET option_value = 1"',
    `php -r 'new mysqli("db");'`,
    'php cli/joomla.php cache:clean'
  ]) {
    assert.equal(commandApprovalReason(command), null, command)
  }
  // The secrets rule is untouched, including inside a command that also reaches the database.
  assert.equal(
    commandApprovalReason('mysql -p"$(grep DB_PASSWORD wp-config.php)"'),
    `wp-config.php ${SECRETS_REASON}`
  )
})

test('newWebrootPhpReason: a new PHP file under .webroot/ outside the platform places', () => {
  const refused = newWebrootPhpReason(`${SITE}/.webroot/cli/zz_tmp_title.php`, SITE, false)
  assert.match(refused ?? '', /^\.webroot\/cli\/zz_tmp_title\.php would be a new PHP file/)
  // The way out is named, with the folder that is mounted in the same container.
  assert.match(refused ?? '', /\/site\/wpdemo\/TracyWork\/agents\/<name>\.php/)
  assert.match(refused ?? '', /php \/site\/wpdemo\/TracyWork\/agents\/<name>\.php/)
  for (const path of [
    `${SITE}/.webroot/tmp.php`,
    `${SITE}/.webroot/tools/fix.phtml`,
    `${SITE}/.webroot/uploads/x.phar`,
    `${SITE}/.webroot/wp-includes/probe.php`,
    `${SITE}/.webroot/images/Update.PHP`
  ]) {
    assert.ok(newWebrootPhpReason(path, SITE, false), path)
  }
})

test('newWebrootPhpReason: ordinary work — the platform places, an existing file, and outside the webroot', () => {
  for (const path of [
    // WordPress: a child theme, a plugin, a mu-plugin.
    `${SITE}/.webroot/wp-content/themes/tracy-child/functions.php`,
    `${SITE}/.webroot/wp-content/plugins/tracy-bits/tracy-bits.php`,
    `${SITE}/.webroot/wp-content/mu-plugins/loader.php`,
    // Joomla: an override on the site side and on the administrator side, and template media.
    `${SITE}/.webroot/templates/cassiopeia/html/com_content/article/default.php`,
    `${SITE}/.webroot/administrator/templates/atum/html/layouts/joomla/card.php`,
    `${SITE}/.webroot/media/templates/site/cassiopeia/build.php`,
    // Anything that is not PHP, and anything outside `.webroot/`.
    `${SITE}/.webroot/cli/notes.md`,
    `${SITE}/.webroot/assets/app.php.js`,
    `${SITE}/TracyWork/agents/zz_tmp_title.php`,
    `${SITE}/docs/agents/db-changes/note.php`,
    '/site/fijitrips/.webroot/cli/zz.php'
  ]) {
    assert.equal(newWebrootPhpReason(path, SITE, false), null, path)
  }
  // Editing PHP that is already there is unchanged, wherever it is.
  for (const path of [`${SITE}/.webroot/cli/joomla.php`, `${SITE}/.webroot/index.php`]) {
    assert.equal(newWebrootPhpReason(path, SITE, true), null, path)
  }
})

/**
 * 🔒 TWO PATHS TO THE SAME SECRET, and until 19/09 the fence stood only on the harder one.
 * Rebuilt from `--site-demojjjj--` (Joomla 6, local stand, 19/09): the agent ran
 * `grep "sitename|MetaDesc|MetaTitle" .webroot/configuration.php` — looking for the SITE NAME, not the
 * password — and was blocked by a sentence telling it to use `tracy_site`, a door that CANNOT read it:
 * `sitename` lives in that file itself, not in the database, and `SiteWriter::KINDS` has no kind for it.
 * Meanwhile `php cli/joomla.php config:get password` ran straight through and printed the password.
 */
test('commandApprovalReason: a CMS config reader is the same question asked sideways', () => {
  // Credentials through the CLI — blocked, both CMSes, both ways of writing the name.
  for (const cmd of [
    'php cli/joomla.php config:get password',
    'php .webroot/cli/joomla.php config:get secret',
    'php cli/joomla.php config:get user',
    'wp config get DB_PASSWORD',
    'wp --allow-root config get DB_USER',
    'wp config get AUTH_KEY',
    'wp config get SECURE_AUTH_SALT'
  ]) {
    assert.match(commandApprovalReason(cmd) ?? '', /credential/, cmd)
  }
  // Asking for the WHOLE TABLE always includes credentials, so it is blocked without guessing option names.
  assert.match(commandApprovalReason('php cli/joomla.php config:get') ?? '', /every setting/)
  // And exactly the options that are the REASON this path is named must get through.
  for (const cmd of [
    'php cli/joomla.php config:get sitename',
    'php cli/joomla.php config:get MetaDesc',
    'wp config get table_prefix',
    'wp config get WP_DEBUG'
  ]) {
    assert.equal(commandApprovalReason(cmd), null, cmd)
  }
})

test('secretsFileReason: the refusal names a next step that exists for THIS platform', () => {
  const reason = secretsFileReason(`${SITE}/.webroot/configuration.php`, SITE)
  assert.match(reason ?? '', /config:get/, 'Joomla must be pointed to a read door that exists')
  assert.match(reason ?? '', /sitename/, 'and name the option it is looking for')
  // ⚠ The next-step sentence must NOT invite a detour around the fence itself: the step it names must be
  // a command `commandApprovalReason` lets through, and that command's credential variant must be blocked.
  assert.equal(commandApprovalReason('php .webroot/cli/joomla.php config:get sitename'), null)
  assert.match(commandApprovalReason('php .webroot/cli/joomla.php config:get password') ?? '', /credential/)
})

test('secretsFileReason: .env variants and .dev.vars are secrets files too', () => {
  for (const name of ['.env.local', '.env.production', '.dev.vars'])
    assert.ok(secretsFileReason(`${SITE}/${name}`, SITE), name)
  assert.equal(secretsFileReason(`${SITE}/notes.env.md`, SITE), null)
})

test('readTargetArg covers the editor tool, whose view command opens files like read does', () => {
  assert.equal(readTargetArg('str_replace_editor'), 'path')
  assert.equal(readTargetArg('read'), 'file_path')
  assert.equal(readTargetArg('bash'), null)
})

test('a symbolic link that leaves the site folder is refused; one inside it is not', () => {
  for (const cmd of [
    'ln -s /etc/passwd leak',
    'ln -sf ../../other-site/.env x',
    'cd a && ln -sfn ~/.ssh keys',
    'ln --symbolic /desk-home/cordis.patch.yml c.yml',
    'echo hi; sudo ln -s /var/www x'
  ])
    assert.ok(commandApprovalReason(cmd), cmd)
  for (const cmd of [
    'ln -s assets/img.png hero.png',
    'ln file.txt copy.txt',
    'ln -s ./media/a b',
    'echo ln -s'
  ])
    assert.equal(commandApprovalReason(cmd), null, cmd)
})

test('a symbolic link is refused however ln is spelled — any path, busybox, flags anywhere, a variable target', () => {
  // REGRESSION (09/10/2026): each of these passed the old literal `ln -s` match.
  for (const cmd of [
    '/bin/ln -s /site/victim f',
    '/usr/bin/ln -sfn /site/victim f',
    'ln -s -- /site/victim f',
    'ln -- /site/victim f -s',
    'ln -fs /desk-home x',
    'ln /site/victim f -s',
    'ln -n -s -f /desk-home x',
    'ln --sym /desk-home x',
    'ln -st . /site/victim',
    'T=/abs; ln -s "$T" f',
    'ln -s "$(pwd)/../other" f',
    'busybox ln -s /site/victim f',
    'toybox ln -s /site/victim f',
    "sh -c 'while :; do ln -sfn /site/victim x; ln -sfn inside x; done' &",
    'find . -name a -exec ln -s /etc/passwd {} \\;',
    'cp -s /site/victim/.env f',
    'cp -rs /site/victim copy',
    'cp --symbolic-link /desk-home/cordis.patch.yml c.yml'
  ]) {
    const reason = commandApprovalReason(cmd)
    assert.ok(reason, cmd)
    // The refusal names a next step that exists, like every refusal in this file.
    assert.match(reason, /relative to it .*or copy the file instead\.$/, cmd)
  }
})

test('a language-level symlink call is refused when its target leaves the site or cannot be read', () => {
  for (const cmd of [
    `php -r 'symlink("/site/victim", "f");'`,
    `php -r 'symlink($t, "f");'`,
    `python3 -c 'import os; os.symlink("/site/victim", "f")'`,
    `python3 -c "import os; os.symlink(t, 'f')"`,
    `python3 -c "from pathlib import Path; Path('f').symlink_to('/site/victim')"`,
    `python3 -c "import os; os.symlink(f'/site/{x}', 'f')"`,
    `perl -e 'symlink "/site/victim", "f"'`,
    `perl -e 'symlink("../../x", "f")'`,
    `node -e 'require("fs").symlinkSync("/site/victim", "f")'`,
    `node -e "require('fs').symlink('/desk-home', 'f', () => {})"`
  ])
    assert.ok(commandApprovalReason(cmd), cmd)
})

test('reading a link, an inside-site link and a hard link are not refused', () => {
  for (const cmd of [
    'readlink -f .webroot/current',
    'ls -l .webroot',
    'stat -c %N x',
    'find . -type l',
    'ln -sfn assets/img.png hero.png',
    'ln -s -- assets/img.png hero.png',
    '/bin/ln -s ./media/a b',
    'busybox ln -s media/a b',
    'ln /site/wpdemo/a b',
    'cp -r /site/wpdemo/a b',
    'cp --suffix=.s a b',
    `php -r 'symlink("assets/a", "b");'`,
    `python3 -c "import os; print(os.path.islink('x'), os.readlink('x'))"`,
    `python3 -c "from pathlib import Path; print(Path('x').is_symlink())"`,
    `node -e "require('fs').readlinkSync('x')"`,
    'git config core.symlinks false',
    'echo "make a symlink to it"'
  ])
    assert.equal(commandApprovalReason(cmd), null, cmd)
})
