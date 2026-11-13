/**
 * `zip-replace-entry` writes a copy of a quickstart installer with one file replaced (the demo data) and every other
 * entry copied as its exact compressed bytes, so the template files of the blank site are provably the ones the human
 * quickstart ships.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeZip } from './fixtures/blank-site/make-zip.mjs'
import { listEntries, readEntry, replaceEntry } from '../scripts/zip-replace-entry.mjs'

const SOURCE = makeZip([
  ['index.php', '<?php echo "template";', false],
  ['installation/sql/mysql/custom.sql', 'INSERT INTO `#__t` VALUES (1);\n'.repeat(20), true],
  ['templates/ja_bakery/css/template.css', 'body { color: #123456; }\n'.repeat(10), true]
])

test('entries are listed in archive order and read back as their text', () => {
  assert.deepEqual(
    listEntries(SOURCE).map((e) => e.name),
    ['index.php', 'installation/sql/mysql/custom.sql', 'templates/ja_bakery/css/template.css']
  )
  assert.equal(readEntry(SOURCE, 'index.php').toString(), '<?php echo "template";')
  assert.match(readEntry(SOURCE, 'installation/sql/mysql/custom.sql').toString(), /^INSERT INTO/)
  assert.throws(() => readEntry(SOURCE, 'missing.txt'), /no entry missing\.txt/)
})

test('one entry is replaced; every other entry keeps its exact compressed bytes and its time', () => {
  const out = replaceEntry(SOURCE, 'installation/sql/mysql/custom.sql', Buffer.from('-- blank\n'))
  assert.equal(readEntry(out, 'installation/sql/mysql/custom.sql').toString(), '-- blank\n')
  const before = Object.fromEntries(listEntries(SOURCE).map((e) => [e.name, e]))
  for (const entry of listEntries(out)) {
    assert.equal(entry.dosTime, before[entry.name].dosTime, entry.name)
    if (entry.name.endsWith('custom.sql')) continue
    assert.equal(entry.crc, before[entry.name].crc, entry.name)
    assert.deepEqual(entry.raw, before[entry.name].raw, `${entry.name} is copied byte for byte`)
  }
})

test('the same replacement gives the same archive, byte for byte', () => {
  const a = replaceEntry(SOURCE, 'installation/sql/mysql/custom.sql', Buffer.from('-- blank\n'))
  const b = replaceEntry(SOURCE, 'installation/sql/mysql/custom.sql', Buffer.from('-- blank\n'))
  assert.ok(a.equals(b))
  assert.ok(replaceEntry(a, 'installation/sql/mysql/custom.sql', Buffer.from('-- blank\n')).equals(a))
})

test('replacing an entry the archive does not hold is refused', () => {
  assert.throws(() => replaceEntry(SOURCE, 'nope.sql', Buffer.from('')), /no entry nope\.sql/)
})
