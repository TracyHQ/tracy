/**
 * `joomla-sql-dump` reads the demo data of a Joomla quickstart installer (`installation/sql/mysql/custom.sql`, a
 * mysqldump with the `#__` prefix) into tables and rows, and writes it back. A row nobody changed is written back
 * byte for byte, so a production step that removes demo rows leaves every other row exactly as the template shipped it.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  parseDump,
  records,
  removeRows,
  serializeDump,
  setValue,
  sqlQuote,
  updates
} from '../scripts/joomla-sql-dump.mjs'

const FIXTURE = readFileSync(new URL('./fixtures/blank-site/custom.sql.txt', import.meta.url), 'utf8')

test('a dump nobody changed is written back byte for byte', () => {
  assert.equal(serializeDump(parseDump(FIXTURE)), FIXTURE)
})

test('rows come back as records keyed by column, with the escapes of mysqldump undone', () => {
  const dump = parseDump(FIXTURE)
  const [rye] = records(dump, 'content')
  assert.equal(rye.title, 'Fresh Rye Every Morning')
  assert.equal(
    rye.introtext,
    "<p>Our ovens start at four, and the rye is ready by six.</p>\r\n<p>It's worth the walk.</p>"
  )
  assert.equal(rye.attribs, '{"show_title":""}')
  assert.equal(rye.id, '1')
  const [session] = records(dump, 'session')
  assert.equal(session.session_id, 'inventedsession01', 'a _binary string is read as its text')
  assert.equal(session.data, 'joomla|s:4:"a;b,";', 'a comma or semicolon inside a string ends nothing')
  assert.deepEqual(records(dump, 'no_such_table'), [])
})

test('removing rows keeps every other row as it was, and an INSERT left with no rows disappears', () => {
  const dump = parseDump(FIXTURE)
  const removed = removeRows(dump, 'menu', (r) => r.client_id === '0' && r.id !== '1')
  assert.deepEqual(
    removed.map((r) => r.id),
    ['101', '102', '103', '104']
  )
  removeRows(dump, 'users', () => true)
  const out = serializeDump(dump)
  assert.ok(
    out.includes(
      "INSERT INTO `#__menu` (`id`, `menutype`, `title`, `link`, `parent_id`, `lft`, `rgt`, `home`, `client_id`) VALUES \n(1,'','Menu_Item_Root','',0,0,15,0,0)\n,(2,'main','com_banners','index.php?option=com_banners',1,1,2,0,1);\n"
    )
  )
  assert.ok(!out.includes('INSERT INTO `#__users`'))
  assert.ok(out.includes('CREATE TABLE IF NOT EXISTS `#__users`'), 'the table itself stays')
  assert.equal(serializeDump(parseDump(out)), out, 'the result reads back to itself')
})

test('when the first row goes, the next row takes its place without a stray comma', () => {
  const dump = parseDump(FIXTURE)
  removeRows(dump, 'tags', (r) => r.id === '1')
  assert.ok(serializeDump(dump).includes("INSERT INTO `#__tags` (`id`, `title`) VALUES \n(2,'sourdough');\n"))
})

test('setting one value rewrites that cell only, quoted the way mysqldump quotes', () => {
  const dump = parseDump(FIXTURE)
  const changed = setValue(dump, 'acym_configuration', (r) => r.name === 'security_key', 'value', '')
  assert.equal(changed, 1)
  const out = serializeDump(dump)
  assert.ok(out.includes("\n,('security_key','')\n"))
  assert.ok(out.includes("\n,('uploadfolder','media/com_acym/upload/');"))
  assert.equal(records(parseDump(out), 'acym_configuration')[1].value, '')
})

test('sqlQuote escapes what mysqldump escapes, and reads back to the same text', () => {
  const text = 'a\\b \'c\' "d"\n\r\0\x1a'
  assert.equal(sqlQuote(text), "'a\\\\b \\'c\\' \\\"d\\\"\\n\\r\\0\\Z'")
  const sql = 'INSERT INTO `#__t` (`v`) VALUES \n(' + sqlQuote(text) + ');\n'
  assert.equal(records(parseDump(sql), 't')[0].v, text)
  assert.equal(sqlQuote(null), 'NULL')
})

test('UPDATE statements are read with their table and the id they target, and can be dropped', () => {
  const dump = parseDump(FIXTURE)
  assert.deepEqual(
    updates(dump).map((u) => [u.table, u.id]),
    [
      ['content', '2'],
      ['modules', '91']
    ]
  )
  dump.parts = dump.parts.filter((p) => !(p.kind === 'update' && p.table === 'content'))
  const out = serializeDump(dump)
  assert.ok(!out.includes('UPDATE `#__content`'))
  assert.ok(
    out.includes(
      'UPDATE `#__modules` SET `params` = \'{\\"bg-color\\":\\"light\\",\\"note\\":\\"it\\\'s; fine\\"}\' WHERE `id` = 91 AND `module` = \'mod_footer\';\n'
    )
  )
})

test('an INSERT without a column list takes the columns of its CREATE TABLE', () => {
  const sql =
    "CREATE TABLE `#__t` (\n  `id` int(11) NOT NULL,\n  `name` varchar(9) NOT NULL\n) ENGINE=InnoDB;\nINSERT INTO `#__t` VALUES (1,'one'),(2,NULL);\n"
  const dump = parseDump(sql)
  assert.deepEqual(records(dump, 't'), [
    { id: '1', name: 'one' },
    { id: '2', name: null }
  ])
  removeRows(dump, 't', (r) => r.id === '1')
  assert.ok(serializeDump(dump).includes('INSERT INTO `#__t` VALUES (2,NULL);'))
})
