import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hasContentContract, directDbWriteReason } from '../src/content-contract.mjs'

test('the contract marker is read from outside the site, per label', () => {
  const root = mkdtempSync(join(tmpdir(), 'contract-policy-'))
  try {
    mkdirSync(join(root, '.content-contracts'))
    writeFileSync(join(root, '.content-contracts', 'customer.json'), '{}')
    assert.equal(hasContentContract(join(root, 'customer/docs/agents'), root), true)
    assert.equal(hasContentContract(join(root, 'another'), root), false)
    assert.equal(hasContentContract(join(tmpdir(), 'elsewhere'), root), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// Lee, 26/09/2026: a quickstart site locks nothing but a direct write to its database. Everything else
// goes through the CMS (wp-cli, Joomla's CLI, the content doors), which keeps the site's own rules.
test('a SQL write straight into the database is refused', () => {
  for (const command of [
    'mysql -e "UPDATE wp_options SET option_value = 1 WHERE option_name = \'blogname\'"',
    'mariadb joomla -e "delete from j_content where id = 3"',
    'wp db query "INSERT INTO wp_posts (post_title) VALUES (\'x\')"',
    'wp db query < patch.sql',
    'wp db import dump.sql',
    'wp db reset --yes',
    'mysql wordpress < patch.sql',
    'cat patch.sql | mysql wordpress',
    'sqlite3 data/data.db "update ec_pages set title = \'x\'"',
    'php -r \'$db = new PDO("mysql:host=db"); $db->exec("DROP TABLE j_menu");\'',
    'wp eval \'global $wpdb; $wpdb->query("TRUNCATE wp_postmeta");\''
  ])
    assert.match(directDbWriteReason(command) ?? '', /database directly/, command)
})

test('reading the database and working through the CMS stay open', () => {
  for (const command of [
    'mysql -e "SELECT option_value FROM wp_options WHERE option_name = \'blogname\'"',
    'wp db query "SHOW TABLES"',
    'wp db export backup.sql',
    'mysqldump wordpress > dump.sql',
    'sqlite3 data/data.db ".tables"',
    'wp option update blogname "Acme"',
    'wp post update 12 --post_title="Hello"',
    'php cli/joomla.php cache:clean',
    'wp search-replace old.test new.test --dry-run',
    'grep -rn "update" .webroot/wp-content/themes',
    'echo "delete me" > docs/agents/note.md'
  ])
    assert.equal(directDbWriteReason(command), null, command)
})
