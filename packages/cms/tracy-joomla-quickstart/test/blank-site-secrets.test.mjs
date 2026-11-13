/**
 * Secret blanking of the blank site (ticket #582): the values a Joomla demo database keeps in settings, found by the
 * name they sit under, blanked in place, everything around them left as it was. All data here is invented.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { blankSecrets, findSecrets } from '../scripts/blank-site-secrets.mjs'
import { parseDump, serializeDump } from '../scripts/joomla-sql-dump.mjs'

const params = (obj) => JSON.stringify(obj).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'")

const dumpOf = (...statements) => parseDump(`${statements.join('\n')}\n`)
const insert = (table, columns, ...rows) =>
  `INSERT INTO \`#__${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES \n${rows.join('\n,')};`
const keysOf = (found) => found.map((s) => `${s.table}:${s.row}:${s.key}`)

test('a bare key, authKey, joomlatoken, cron_key, secretkey, clientsecret and the like are secrets', () => {
  const secrets = {
    key: 'invented-a',
    authKey: 'invented-b',
    joomlatoken: 'invented-c',
    cron_key: 'invented-d',
    secretkey: 'invented-e',
    clientsecret: 'invented-f',
    'Client-Secret': 'invented-g',
    SMTP_PASSWORD: 'invented-h'
  }
  const calm = {
    keywords: 'bread',
    keyboard: 'qwerty',
    key_color: '#123456',
    metakey: 'oven',
    sendpassword: '0'
  }
  const dump = dumpOf(
    insert('modules', ['id', 'title', 'params'], `(5,'Invented','${params({ ...secrets, ...calm })}')`)
  )
  assert.deepEqual(
    keysOf(findSecrets(dump)).sort(),
    Object.keys(secrets)
      .map((k) => `modules:5:${k}`)
      .sort()
  )
})

test('the params of modules, template styles and scheduled tasks are scanned', () => {
  const dump = dumpOf(
    insert('modules', ['id', 'params'], `(5,'${params({ api_key: 'invented-a' })}')`),
    insert('template_styles', ['id', 'params'], `(6,'${params({ cron_key: 'invented-b' })}')`),
    insert('scheduler_tasks', ['id', 'params'], `(7,'${params({ token: 'invented-c' })}')`)
  )
  assert.deepEqual(keysOf(findSecrets(dump)), [
    'modules:5:api_key',
    'scheduler_tasks:7:token',
    'template_styles:6:cron_key'
  ])
})

test('a settings table with more than two columns is read when a name column sits beside a value column', () => {
  const dump = dumpOf(
    insert(
      'invented_settings',
      ['id', 'name', 'value', 'type'],
      "(1,'security_key','invented-a','text')",
      "(2,'colour','blue','text')"
    ),
    insert(
      'invented_config',
      ['config_key', 'config_value'],
      "('client_secret','invented-b')",
      "('layout','wide')"
    )
  )
  assert.deepEqual(keysOf(findSecrets(dump)), [
    'invented_config:client_secret:config_value',
    'invented_settings:security_key:value'
  ])
  blankSecrets(dump)
  const sql = serializeDump(dump)
  assert.ok(!sql.includes('invented-a') && !sql.includes('invented-b'))
  assert.ok(sql.includes("(2,'colour','blue','text')") && sql.includes("('layout','wide')"))
})

test('an UPDATE that sets params cannot bring a secret back', () => {
  const dump = dumpOf(
    insert('modules', ['id', 'params'], `(5,'${params({ note: 'x' })}')`),
    `UPDATE \`#__modules\` SET \`params\` = '${params({ note: "it's", api_key: 'invented-later' })}' WHERE \`id\` = 5;`
  )
  assert.deepEqual(keysOf(findSecrets(dump)), ['modules:5:api_key'])
  blankSecrets(dump)
  const sql = serializeDump(dump)
  assert.ok(!sql.includes('invented-later'))
  assert.deepEqual(findSecrets(parseDump(sql)), [])
  assert.ok(sql.includes("it\\'s"), 'the rest of the assigned text is kept')
})

test('a secret stored as a number is blanked; the rest of the row text stays exactly as it was', () => {
  const original = `(5,'Invented','{\\"zoom\\":\\"12\\",\\"cron_key\\":987654,\\"link\\":\\"https:\\\\/\\\\/maps.example.test\\\\/\\"}',0)`
  const dump = dumpOf(insert('modules', ['id', 'title', 'params', 'client_id'], original))
  assert.deepEqual(keysOf(findSecrets(dump)), ['modules:5:cron_key'])
  blankSecrets(dump)
  const sql = serializeDump(dump)
  assert.ok(sql.includes(original.replace('987654', '\\"\\"')), sql)
  assert.deepEqual(findSecrets(parseDump(sql)), [])
})

test('a module row with no secret is byte for byte as it was', () => {
  const row = `(5,'Invented','{\\"keywords\\":\\"a\\",\\"metakey\\":\\"b\\",\\"key_color\\":\\"#fff\\"}',0)`
  const sql = `${insert('modules', ['id', 'title', 'params', 'client_id'], row)}\n`
  const dump = parseDump(sql)
  blankSecrets(dump)
  assert.equal(serializeDump(dump), sql)
})
