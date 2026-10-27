// What the main process hands the local waiting page (src/waiting-page.js): the match code, the home
// origin for Cancel, the address typed (email sign-in), whether to draw the Setup frame (first run),
// and the words in the OS language. The page holds no secret: the query never carries one.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { waitingQuery } = require('../src/waiting-page.js')
const strings = require('../src/signin-waiting-strings.json')

const base = { code: 'K7Q-4XM', home: 'https://cowork.example', languages: ['de-AT', 'en'] }

test('a Google round on a later run: code, home, the words in the OS language, no frame', () => {
  const query = waitingQuery({ ...base, setup: false })
  assert.equal(query.code, 'K7Q-4XM')
  assert.equal(query.home, 'https://cowork.example')
  assert.equal(query.lang, 'de')
  assert.deepEqual(JSON.parse(query.t), strings.de)
  assert.equal('setup' in query, false)
  assert.equal('email' in query, false)
})

test('an email round on a first run: the address and the Setup frame', () => {
  const query = waitingQuery({ ...base, email: ' lee@example.com ', setup: true })
  assert.equal(query.email, 'lee@example.com')
  assert.equal(query.setup, '1')
})

test('an OS language outside the eight: English', () => {
  const query = waitingQuery({ ...base, languages: ['ja-JP'], setup: false })
  assert.equal(query.lang, 'en')
  assert.deepEqual(JSON.parse(query.t), strings.en)
})

test('only these keys, so nothing else can ride along', () => {
  const query = waitingQuery({ ...base, email: 'a@b.c', setup: true })
  assert.deepEqual(Object.keys(query).sort(), ['code', 'email', 'home', 'lang', 'setup', 't'])
})
