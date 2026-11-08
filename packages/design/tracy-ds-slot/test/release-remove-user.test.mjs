// A quickstart can ship an account left from its own review: every site restored from it carries that
// login. release-joomla --remove-user takes the account out of the database it cuts, with the rows
// Joomla's own delete clears, and refuses when the site would lose its last Super User or an article
// its author. Invented demo rows only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { removeUser } from '../src/release-remove-user.mjs'

const table = (name, cols, rows) =>
  `CREATE TABLE \`xx_${name}\` (\n${cols.map((c) => `  \`${c}\` text,`).join('\n')}\n  PRIMARY KEY (\`${cols[0]}\`)\n) ENGINE=InnoDB;\n` +
  (rows.length ? `INSERT INTO \`xx_${name}\` VALUES\n${rows.join(',\n')};\n` : '')

const USERS = [
  "(5,'Site Owner','owner','owner@example.test',0)",
  "(7,'Quill Marrow','quill','quill@example.test',0)",
  "(9,'Probe Visitor','probe.visitor','probe@example.test',0)"
]
const MAP = ['(5,8)', '(7,2)', '(7,3)', '(9,2)']

const dumpOf = ({ users = USERS, map = MAP, content = ['(30,7)'] } = {}) =>
  table('users', ['id', 'name', 'username', 'email', 'block'], users) +
  table(
    'usergroups',
    ['id', 'parent_id', 'title'],
    ["(1,0,'Public')", "(2,1,'Registered')", "(3,2,'Author')", "(8,1,'Super Users')", "(10,8,'Site Owners')"]
  ) +
  table('assets', ['id', 'name', 'rules'], ['(1,\'root.1\',\'{\\"core.admin\\":{\\"8\\":1}}\')']) +
  table('user_usergroup_map', ['user_id', 'group_id'], map) +
  table(
    'user_profiles',
    ['user_id', 'profile_key', 'profile_value'],
    [
      "(7,'profile.city','\\\"Harbourtown\\\"')",
      "(9,'profile.phone','\\\"+00 000 0000\\\"')",
      "(9,'profile.city','\\\"Harbourtown, (east)\\\"')"
    ]
  ) +
  table('user_keys', ['id', 'user_id', 'token'], ["(1,'probe.visitor','abc')", "(2,'quill','def')"]) +
  table('privacy_consents', ['id', 'user_id', 'subject'], ["(1,9,'Consent granted')"]) +
  table('content', ['id', 'created_by'], content) +
  "INSERT INTO `xx_other` VALUES (1,'');\n"

test("a user's row goes with its group map, profile, keys and consents, every other byte kept", () => {
  const dump = dumpOf()
  const r = removeUser(dump, 'xx_', 'probe.visitor')
  assert.deepEqual(r.removed, {
    id: '9',
    username: 'probe.visitor',
    rows: { users: 1, user_usergroup_map: 1, user_profiles: 2, user_keys: 1, privacy_consents: 1 }
  })
  const expected = dump
    .replace(",\n(9,'Probe Visitor','probe.visitor','probe@example.test',0)", '')
    .replace(',\n(9,2)', '')
    .replace(
      `,\n(9,'profile.phone','\\"+00 000 0000\\"'),\n(9,'profile.city','\\"Harbourtown, (east)\\"')`,
      ''
    )
    .replace("(1,'probe.visitor','abc'),\n", '')
    .replace("INSERT INTO `xx_privacy_consents` VALUES\n(1,9,'Consent granted');\n", '')
  assert.notEqual(expected, dump)
  assert.equal(r.dump, expected)
})

test('a user the dump does not have is refused', () => {
  assert.throws(() => removeUser(dumpOf(), 'xx_', 'nobody'), /nobody: no such user/)
})

test('the author of an article is refused', () => {
  assert.throws(() => removeUser(dumpOf(), 'xx_', 'quill'), /quill: author of 1 articles \(30\)/)
})

test('the only active Super User is refused, also through a child group of Super Users', () => {
  assert.throws(() => removeUser(dumpOf(), 'xx_', 'owner'), /owner: the only active Super User/)
  // a second Super User who is blocked does not count
  const blocked = dumpOf({
    users: [...USERS, "(11,'Spare','spare','spare@example.test',1)"],
    map: [...MAP, '(11,8)']
  })
  assert.throws(() => removeUser(blocked, 'xx_', 'owner'), /the only active Super User/)
  // an active one in a child group of Super Users does
  const another = dumpOf({
    users: [...USERS, "(11,'Spare','spare','spare@example.test',0)"],
    map: [...MAP, '(11,10)']
  })
  assert.equal(removeUser(another, 'xx_', 'owner').removed.id, '5')
})
