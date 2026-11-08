// A quickstart database must not ship a template author's backup copy of a table (JA Voyara 1.0.12 carried one): a
// customer site restored from it holds a second copy of the demo modules nobody reads. Invented demo tables only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strayTablesOf } from '../src/release-stray-tables.mjs'

const table = (name) =>
  `DROP TABLE IF EXISTS \`${name}\`;\nCREATE TABLE \`${name}\` (\n  \`id\` int\n) ENGINE=InnoDB;\n`

test('a backup copy of a table is named, with the code release-stray-table', () => {
  const dump = [
    table('xx_modules'),
    table('xx_modules_bak_rev'),
    table('xx_content_backup'),
    table('xx_menu_old'),
    table('xx_users_copy2'),
    table('xx_session')
  ].join('')
  assert.deepEqual(strayTablesOf(dump, 'xx_'), [
    'xx_modules_bak_rev',
    'xx_content_backup',
    'xx_menu_old',
    'xx_users_copy2'
  ])
})

test('a clean dump names none, and a word that only contains a marker is not one', () => {
  const dump = [
    table('xx_modules'),
    table('xx_jabook_oldest_tours'),
    table('xx_backups_log_x'),
    table('other_menu_old')
  ].join('')
  assert.deepEqual(strayTablesOf(dump, 'xx_'), [])
})
