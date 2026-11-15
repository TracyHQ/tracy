// The secret scan's rules and its Joomla adapter (ticket #586). Every planted secret is an obviously fake value of an
// invented florist, built at run time from pieces so no scanner of this repository reads one in the source. Each
// rule has a positive and the scan never returns, prints or serializes the value it found.
import assert from 'node:assert/strict'
import test from 'node:test'
import { joomlaFileFindings, joomlaSqlFindings } from '../ai-quickstart/gate/adapters/joomla-secrets.mjs'
import {
  fingerprintOf,
  jsonFindings,
  SECRET_RULES,
  textFindings
} from '../ai-quickstart/gate/secret-rules.mjs'
import { PLANTED } from './fixtures/ai-quickstart-gate/planted-secrets.mjs'

const fake = (word, n) => word.repeat(Math.ceil(n / word.length)).slice(0, n)

test('every value-shape rule finds its invented positive, named by line, never by value', () => {
  assert.deepEqual(Object.keys(PLANTED).sort(), SECRET_RULES.map((r) => r.id).sort())
  for (const [rule, value] of Object.entries(PLANTED)) {
    const found = textFindings('notes.txt', 'first line\nsee ' + value + ' here\n')
    assert.deepEqual(
      found.map((f) => [f.at, f.rule]),
      [['line:2', rule]],
      rule
    )
    assert.match(found[0].fingerprint, /^[0-9a-f]{12}$/)
    assert.ok(!JSON.stringify(found).includes(value), rule + ' value leaked')
  }
})

test('a JSON value is placed by its pointer', () => {
  const found = jsonFindings('kit/mapping.json', { blocks: { 'a/b': [{ note: PLANTED.jwt }] } })
  assert.deepEqual(
    found.map((f) => [f.at, f.rule]),
    [['/blocks/a~1b/0/note', 'jwt']]
  )
  assert.equal(found[0].fingerprint, fingerprintOf(PLANTED.jwt))
})

test('documentation shapes are no finding: placeholders, example hosts, a key header in code', () => {
  const text = [
    'https://user:password@example.com/path',
    'ftp://' + 'admin:secret' + '@host',
    'smtp://' + 'petal:${PASSWORD}' + '@mail.florist.test',
    "return '-----BEGIN " + 'EC PRIVATE KEY-----\' . "\\n";',
    'a sha256 of a file: ' + fake('ab12', 64)
  ].join('\n')
  assert.deepEqual(textFindings('vendor/lib/readme.txt', text), [])
})

const insert = (table, columns, rows) =>
  'INSERT INTO `#__' +
  table +
  '` (' +
  columns.map((c) => '`' + c + '`').join(', ') +
  ') VALUES \n' +
  rows.join('\n,') +
  ';\n'

test('a Joomla dump: private rows, an account with a password, a secret setting, a shaped value in any cell', () => {
  const sql = [
    insert(
      'users',
      ['id', 'name', 'password'],
      ["(42,'Petal Admin','" + PLANTED.bcrypt_hash + "')", "(43,'Shop Window','')"]
    ),
    insert(
      'session',
      ['session_id', 'data'],
      ["('fake01','" + PLANTED.php_session_data.replaceAll('"', '\\"') + "')"]
    ),
    insert(
      'extensions',
      ['extension_id', 'type', 'folder', 'params'],
      ["(7,'plugin','system','{\"api_key\":\"" + 'FakeFloristKey' + '","title":"Petal"}\')']
    ),
    insert('modules', ['id', 'content'], ["(9,'<p>" + PLANTED.uri_credentials + "</p>')"])
  ].join('')
  const found = joomlaSqlFindings('blank-site.zip!installation/sql/mysql/custom.sql', sql)
  const named = found.map((f) => f.at + ' ' + f.rule).sort()
  assert.deepEqual(named, [
    'extensions#7.api_key joomla_setting_secret',
    'modules#9.content uri_credentials',
    'session#@1 joomla_private_row',
    'session#@1.data php_session_data',
    'users#42.password bcrypt_hash',
    'users#42.password joomla_account_password'
  ])
  const setting = found.find((f) => f.rule === 'joomla_setting_secret')
  assert.equal(setting.fingerprint, fingerprintOf('FakeFloristKey'))
  const out = JSON.stringify(found)
  // A session's key is its token: it never names the row.
  for (const v of [
    PLANTED.bcrypt_hash,
    'FakeFloristKey',
    PLANTED.uri_credentials,
    'RmFrZVNlc3Npb24',
    'fake01'
  ])
    assert.ok(!out.includes(v), 'value leaked')
})

test('a shipped configuration and its credentials are found; the installer sample with empty values is not', () => {
  const config =
    "<?php\nclass JConfig {\n\tpublic $secret = '" + 'FakeSiteSecret' + "';\n\tpublic $smtppass = '';\n}\n"
  assert.deepEqual(
    joomlaFileFindings('webroot.zip!configuration.php', config).map((f) => f.at + ' ' + f.rule),
    [
      'configuration.php joomla_configuration_shipped',
      'configuration.php:$secret joomla_configuration_secret'
    ]
  )
  const dist =
    "<?php\nclass JConfig {\n\tpublic $secret = '';\n\tpublic $password = '';\n\tpublic $smtpuser = '';\n}\n"
  assert.deepEqual(joomlaFileFindings('blank-site.zip!installation/configuration.php-dist', dist), [])
  // An extension's own file of the same name is no site configuration.
  assert.deepEqual(joomlaFileFindings('blank-site.zip!components/com_florist/configuration.php', config), [])
})
