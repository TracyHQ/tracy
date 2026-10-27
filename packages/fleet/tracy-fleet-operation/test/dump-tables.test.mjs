/**
 * A point's dump cut to the tables a sync changed (`scripts/lib/dump_tables.py`), what
 * `webroot-backup.sh restore-everything --only-tables` loads instead of the whole point. No database.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/dump-tables.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const CUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib', 'dump_tables.py')
const root = mkdtempSync(join(tmpdir(), 'dump-tables-'))
after(() => rmSync(root, { recursive: true, force: true }))

/** A mariadb-dump of three tables, a trigger on the second, a view, routines and the tail. */
const section = (t, extra = '') =>
  `--\n-- Table structure for table \`${t}\`\n--\n\nDROP TABLE IF EXISTS \`${t}\`;\nCREATE TABLE \`${t}\` (id int);\n\n--\n-- Dumping data for table \`${t}\`\n--\n\nINSERT INTO \`${t}\` VALUES (1);\n${extra}\n`
const DUMP = [
  '-- MariaDB dump 10.19\n/*!40101 SET NAMES utf8mb4 */;\n/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;\n\n',
  section('jos_assets'),
  section(
    'jos_content',
    'DELIMITER ;;\n/*!50003 CREATE*/ /*!50003 TRIGGER `identity` AFTER INSERT ON `jos_content` FOR EACH ROW SET @x = 1 */;;\nDELIMITER ;\n'
  ),
  section('jos_menu'),
  '--\n-- Temporary table structure for view `jos_view`\n--\n\nCREATE TABLE `jos_view` (id int);\n\n',
  "--\n-- Dumping routines for database 'joomla'\n--\nCREATE PROCEDURE p() SELECT 1;\n",
  '/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;\n-- Dump completed on 2026-10-23\n'
].join('')

function cut(tables) {
  const list = join(root, `tables-${tables.length}.txt`)
  const count = join(root, `count-${tables.length}.txt`)
  writeFileSync(list, tables.join('\n'))
  const done = spawnSync('python3', [CUT, '--tables', list, '--count', count], {
    input: DUMP,
    encoding: 'utf8'
  })
  assert.equal(done.status, 0, done.stderr)
  return { sql: done.stdout, kept: Number(readFileSync(count, 'utf8').trim()) }
}

test('the named tables, with their rows and triggers, between the head and the tail', () => {
  const { sql, kept } = cut(['jos_content', 'jos_menu'])
  assert.equal(kept, 2)
  assert.match(sql, /^-- MariaDB dump[\s\S]*SET NAMES utf8mb4/)
  assert.match(sql, /CREATE TABLE `jos_content`[\s\S]*TRIGGER `identity`/)
  assert.match(sql, /INSERT INTO `jos_menu`/)
  assert.doesNotMatch(sql, /jos_assets/)
  assert.doesNotMatch(sql, /jos_view|PROCEDURE/, 'no view, no routine')
  assert.match(sql, /SET TIME_ZONE=@OLD_TIME_ZONE \*\/;\n-- Dump completed/)
})

test('no table named: the head and the tail only', () => {
  const { sql, kept } = cut([])
  assert.equal(kept, 0)
  assert.doesNotMatch(sql, /CREATE TABLE|INSERT/)
  assert.match(sql, /Dump completed/)
})
