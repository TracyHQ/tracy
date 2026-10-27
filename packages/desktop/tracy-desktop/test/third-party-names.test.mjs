import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { thirdPartyLines, THIRD_PARTY_NAMES } from '../build/third-party-names.mjs'

test('a line naming a vendor or upstream project is caught, in any case', () => {
  assert.deepEqual(thirdPartyLines('Bump dsh-passwords 2.7.7'), ['Bump dsh-passwords 2.7.7'])
  assert.deepEqual(thirdPartyLines('Updated electron to 39'), ['Updated electron to 39'])
  assert.deepEqual(thirdPartyLines('Ported from Cherry Studio'), ['Ported from Cherry Studio'])
  assert.deepEqual(thirdPartyLines('Uses the DeepSeek harness'), ['Uses the DeepSeek harness'])
})

test('a line written as what the user sees passes', () => {
  assert.deepEqual(thirdPartyLines('Faster sign-in\nSecurity updates'), [])
})

test('a name is matched as a whole word, not inside another word', () => {
  assert.deepEqual(thirdPartyLines('Electronic invoices open in the app'), [])
  assert.deepEqual(thirdPartyLines('Sharper icons on cherry-red themes'), [
    'Sharper icons on cherry-red themes'
  ])
})

test('every tree under vendor/tracy that ships in the app is on the list', () => {
  for (const name of [
    'dsh',
    'deepseek',
    'cherry',
    'electron',
    'squirrel',
    'cordis',
    'dsh-passwords',
    'dsh-better-sidebar'
  ])
    assert.ok(THIRD_PARTY_NAMES.includes(name), name)
})

test('the PR template tells the author to write effects, never vendor names', () => {
  const template = readFileSync(
    new URL('../../../../.github/pull_request_template.md', import.meta.url),
    'utf8'
  )
  assert.match(template, /never a vendor or library name/i)
})
