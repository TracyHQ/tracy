// Joomla's core views (com_tags) read the UCM copy of a tagged article, not the article. A demo article
// renamed or archived by SQL keeps its old copy, and its tag page shows a card titled after one article
// that links to another. release-joomla resyncs those copies in the database it cuts. Invented demo rows only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resyncUcmContent } from '../src/release-ucm-sync.mjs'

const MAPPING =
  '{\\"common\\":{\\"core_content_item_id\\":\\"id\\",\\"core_title\\":\\"title\\",\\"core_state\\":\\"state\\",\\"core_alias\\":\\"alias\\",\\"core_body\\":\\"introtext\\",\\"core_hits\\":\\"hits\\",\\"core_metakey\\":\\"metakey\\",\\"note\\":\\"note\\"},\\"special\\":{\\"fulltext\\":\\"fulltext\\"}}'

const SCHEMA = `CREATE TABLE \`xx_content\` (
  \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`title\` varchar(255) NOT NULL DEFAULT '',
  \`alias\` varchar(400) NOT NULL DEFAULT '',
  \`introtext\` mediumtext NOT NULL,
  \`state\` tinyint(4) NOT NULL DEFAULT 0,
  \`hits\` int(10) unsigned NOT NULL DEFAULT 0,
  \`metakey\` text DEFAULT NULL,
  \`note\` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
CREATE TABLE \`xx_content_types\` (
  \`type_id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`type_alias\` varchar(400) NOT NULL DEFAULT '',
  \`field_mappings\` text NOT NULL,
  PRIMARY KEY (\`type_id\`)
) ENGINE=InnoDB;
INSERT INTO \`xx_content_types\` VALUES
(1,'com_content.article','${MAPPING}');
CREATE TABLE \`xx_ucm_content\` (
  \`core_content_id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`core_type_alias\` varchar(400) NOT NULL DEFAULT '',
  \`core_title\` varchar(400) NOT NULL DEFAULT '',
  \`core_alias\` varchar(400) NOT NULL DEFAULT '',
  \`core_body\` mediumtext DEFAULT NULL,
  \`core_state\` tinyint(4) NOT NULL DEFAULT 0,
  \`core_hits\` int(10) unsigned NOT NULL DEFAULT 0,
  \`core_metakey\` text DEFAULT NULL,
  \`core_content_item_id\` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (\`core_content_id\`)
) ENGINE=InnoDB;
`

const ARTICLES = [
  "(10,'Lanterns over the harbour','lanterns-over-the-harbour','<p>Night, \\'bright\\', (long)</p>',2,41,NULL,'')",
  "(11,'A morning in the hills','morning-in-the-hills','<p>Mist.</p>',1,7,'hills','')"
]

const dumpOf = (ucmRows) =>
  `${SCHEMA}INSERT INTO \`xx_content\` VALUES\n${ARTICLES.join(',\n')};\nINSERT INTO \`xx_ucm_content\` VALUES\n${ucmRows.join(',\n')};\nINSERT INTO \`xx_other\` VALUES (1,'');\n`

const FRESH = [
  "(1,'com_content.article','Lanterns over the harbour','lanterns-over-the-harbour','<p>Night, \\'bright\\', (long)</p>',2,0,NULL,10)",
  "(2,'com_content.article','A morning in the hills','morning-in-the-hills','<p>Mist.</p>',1,0,'hills',11)",
  "(3,'com_contact.contact','A morning in the hills','old-alias','',0,0,NULL,11)"
]

test('a dump whose UCM copies match their articles is returned unchanged', () => {
  const dump = dumpOf(FRESH)
  const r = resyncUcmContent(dump, 'xx_')
  assert.equal(r.dump, dump)
  assert.deepEqual(r.resynced, [])
  assert.deepEqual(r.orphans, [])
})

test('a stale copy takes the article fields the content type maps, counters left', () => {
  const dump = dumpOf([
    "(1,'com_content.article','Old harbour title','old-harbour','<p>Old</p>',1,0,'',10)",
    FRESH[1],
    FRESH[2]
  ])
  const r = resyncUcmContent(dump, 'xx_')
  assert.deepEqual(r.resynced, [
    {
      ucm: '1',
      article: '10',
      columns: ['core_title', 'core_state', 'core_alias', 'core_body', 'core_metakey']
    }
  ])
  assert.ok(r.dump.includes(`VALUES\n${FRESH.join(',\n')};\n`), r.dump)
  assert.ok(r.dump.endsWith("INSERT INTO `xx_other` VALUES (1,'');\n"))
})

test('a copy whose article is gone is left and reported', () => {
  const orphan = "(4,'com_content.article','Gone','gone','',1,0,NULL,99)"
  const dump = dumpOf([...FRESH, orphan])
  const r = resyncUcmContent(dump, 'xx_')
  assert.equal(r.dump, dump)
  assert.deepEqual(r.orphans, [{ ucm: '4', article: '99' }])
})

test('copies over several INSERT statements are all resynced', () => {
  const dump = dumpOf([FRESH[0]]).replace(
    'INSERT INTO `xx_other`',
    "INSERT INTO `xx_ucm_content` VALUES\n(2,'com_content.article','Stale','stale','<p>Mist.</p>',1,0,'hills',11);\nINSERT INTO `xx_other`"
  )
  const r = resyncUcmContent(dump, 'xx_')
  assert.deepEqual(
    r.resynced.map((x) => x.ucm),
    ['2']
  )
  assert.ok(r.dump.includes(`VALUES\n${FRESH[1]};\n`), r.dump)
})

test('a dump without a UCM table is returned unchanged', () => {
  const dump = "INSERT INTO `xx_other` VALUES (1,'');\n"
  assert.equal(resyncUcmContent(dump, 'xx_').dump, dump)
})
