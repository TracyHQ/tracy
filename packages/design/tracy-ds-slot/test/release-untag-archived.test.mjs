// Joomla's tag pages list archived articles too, and a quickstart contract captures only published ones:
// release-joomla --untag-archived takes the archived demo articles out of the tag map of the database it cuts.
// Invented demo rows only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { untagArchived } from '../src/release-untag-archived.mjs'

const table = (name, cols, rows) =>
  `CREATE TABLE \`xx_${name}\` (\n${cols.map((c) => `  \`${c}\` text,`).join('\n')}\n  PRIMARY KEY (\`${cols[0]}\`)\n) ENGINE=InnoDB;\n` +
  (rows.length ? `INSERT INTO \`xx_${name}\` VALUES\n${rows.join(',\n')};\n` : '')

const dumpOf = (content) =>
  table('content', ['id', 'state', 'title'], content) +
  table(
    'contentitem_tag_map',
    ['type_alias', 'core_content_id', 'content_item_id', 'tag_id'],
    [
      "('com_content.article',1,40,8)",
      "('com_content.article',2,41,8)",
      "('com_content.article',2,41,13)",
      "('com_content.category',3,41,8)"
    ]
  ) +
  "INSERT INTO `xx_other` VALUES (1,'');\n"

test('the tag rows of an archived article go; a published article and a category with the same id keep theirs', () => {
  const dump = dumpOf(["(40,1,'Harbour walk')", "(41,2,'Old lighthouse notes')"])
  const r = untagArchived(dump, 'xx_')
  assert.deepEqual(r.untagged, [{ article: '41', rows: 2 }])
  assert.equal(
    r.dump,
    dump.replace(
      "('com_content.article',1,40,8),\n('com_content.article',2,41,8),\n('com_content.article',2,41,13),\n",
      "('com_content.article',1,40,8),\n"
    )
  )
})

test('a dump with no archived article is left byte for byte', () => {
  const dump = dumpOf(["(40,1,'Harbour walk')", "(41,1,'Old lighthouse notes')"])
  assert.deepEqual(untagArchived(dump, 'xx_'), { dump, untagged: [] })
})
