import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spokenEmail, phoneticEmail, speechParts } from '../src/widget/assets/email-voice.js'
import { speechCursor } from '../src/widget/assets/speech-cursor.js'
import { parseCode } from '../src/widget/assets/auth-panel.js'

test('spoken email retains separators, letters and digits for explicit confirmation', () => {
  assert.equal(spokenEmail('My email is ha+2@gmail.com'), 'ha+2@gmail.com')
  assert.equal(spokenEmail('h a two at gmail dot com'), 'ha2@gmail.com')
  assert.equal(spokenEmail('h as in hotel a as in alpha at gmail dot com'), 'ha@gmail.com')
  assert.equal(spokenEmail('hotel alpha at gmail dot com'), 'ha@gmail.com')
  assert.equal(spokenEmail('email của tôi là h a chấm le a còng gmail chấm com'), 'ha.le@gmail.com')
  assert.equal(spokenEmail('ha at gmail dot'), null)
  assert.equal(spokenEmail('first@example.test or second@example.test'), null)
  assert.equal(spokenEmail('h a gmail dot com'), null)
  assert.equal(spokenEmail('h dot dot a at gmail dot com'), null)
})
test('readback disambiguates Hotel/Alpha, separators and each number without truncating', () => {
  const text = phoneticEmail('ha_2+1@gmail.com')
  assert.match(text, /H as in Hotel/)
  assert.match(text, /A as in Alpha/)
  assert.match(text, /underscore\. two\. plus\. one/)
  assert.match(text, /At\. gmail\. Dot\. com/i)
  const long = phoneticEmail('averylongemailaddresswithseveralseparators@example.test')
  const parts = speechParts(long, 100)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((p) => p.length <= 100))
  assert.equal(parts.join(' '), long)
})
test('a shared speech session does not carry email or OTP chunks into resumed chat', () => {
  const route = speechCursor('chat')
  assert.deepEqual(route('chat', ['architecture studio']), ['architecture studio'])
  assert.deepEqual(route('auth:email', ['architecture studio', 'ha at gmail dot com']), [
    'ha at gmail dot com'
  ])
  assert.deepEqual(route('auth:confirmation', ['architecture studio', 'ha at gmail dot com', 'yes']), ['yes'])
  assert.deepEqual(
    route('auth:code', ['architecture studio', 'ha at gmail dot com', 'yes', 'zero one two three four five']),
    ['zero one two three four five']
  )
  assert.deepEqual(
    route('chat', [
      'architecture studio',
      'ha at gmail dot com',
      'yes',
      'zero one two three four five',
      'keep my design'
    ]),
    ['keep my design']
  )
  assert.equal(parseCode('zero one two three four five'), '012345')
  assert.equal(parseCode('0123456'), null)
})
