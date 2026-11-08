// A demo tag saved without a path (rows inserted by SQL, not through Joomla's Tags screen) gives
// several tags the same identity {path: ""}: the contract capture refuses it (K7) and the Claude
// Cowork plugin, which binds a tag by its path, could not find any of them. release-joomla repairs
// such tags in the database it cuts. Invented demo rows only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repairTagPaths } from '../src/release-tag-paths.mjs'

const CREATE = `CREATE TABLE \`xx_tags\` (
  \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`parent_id\` int(10) unsigned NOT NULL DEFAULT 0,
  \`lft\` int(11) NOT NULL DEFAULT 0,
  \`rgt\` int(11) NOT NULL DEFAULT 0,
  \`level\` int(10) unsigned NOT NULL DEFAULT 0,
  \`path\` varchar(400) NOT NULL DEFAULT '',
  \`title\` varchar(255) NOT NULL,
  \`alias\` varchar(400) NOT NULL DEFAULT '',
  \`note\` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;`

const dumpOf = (rows) =>
  `${CREATE}\nINSERT INTO \`xx_tags\` VALUES\n${rows.join(',\n')};\nINSERT INTO \`xx_other\` VALUES (1,'');\n`

const SOUND = [
  "(1,0,0,7,0,'','ROOT','root','')",
  "(2,1,1,4,1,'harbours','Harbours','harbours','it\\'s, (fine)')",
  "(3,2,2,3,2,'harbours/small','Small','small','')",
  "(4,1,5,6,1,'lakes','Lakes','lakes','')"
]

test('a dump whose tags all have a path is returned unchanged', () => {
  const dump = dumpOf(SOUND)
  const r = repairTagPaths(dump, 'xx_')
  assert.equal(r.dump, dump)
  assert.deepEqual(r.repaired, [])
})

test('a tag without a path takes its parent path and alias, and the nested set is rebuilt', () => {
  const dump = dumpOf([
    "(1,0,0,3,0,'','ROOT','root','')",
    "(2,1,1,2,1,'harbours','Harbours','harbours','it\\'s, (fine)')",
    "(5,1,1,2,1,'','Quiet coves','quiet-coves','')",
    "(6,5,3,4,1,'','Hidden','hidden','')"
  ])
  const r = repairTagPaths(dump, 'xx_')
  assert.deepEqual(r.repaired, [
    { id: '5', path: 'quiet-coves' },
    { id: '6', path: 'quiet-coves/hidden' }
  ])
  assert.ok(
    r.dump.includes(
      [
        "(1,0,0,7,0,'','ROOT','root','')",
        "(2,1,1,2,1,'harbours','Harbours','harbours','it\\'s, (fine)')",
        "(5,1,3,6,1,'quiet-coves','Quiet coves','quiet-coves','')",
        "(6,5,4,5,2,'quiet-coves/hidden','Hidden','hidden','')"
      ].join(',\n')
    ),
    r.dump
  )
  assert.ok(r.dump.endsWith("INSERT INTO `xx_other` VALUES (1,'');\n"))
})

test('a repaired path that another tag already holds stops the cut', () => {
  const dump = dumpOf([
    "(1,0,0,5,0,'','ROOT','root','')",
    "(2,1,1,2,1,'harbours','Harbours','harbours','')",
    "(3,1,3,4,1,'','Harbours again','harbours','')"
  ])
  assert.throws(() => repairTagPaths(dump, 'xx_'), /tag 3.*harbours.*tag 2/)
})

test('a dump without a tags table is returned unchanged', () => {
  const dump = "INSERT INTO `xx_other` VALUES (1,'');\n"
  assert.equal(repairTagPaths(dump, 'xx_').dump, dump)
})
