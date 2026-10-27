/**
 * What a customer reads when a brand extraction or removal fails (#811 F-S5-008): never a raw
 * status (`HTTP 403`), never the engine's own English error text, never a host of `?`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { failureText, hostOfInput, refusalCode } from '../src/client/failure.ts'
import { en } from '../src/client/strings.ts'

const t = (key, params = {}) => {
  const s = en[key]
  if (s === undefined) return key
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

test('a refusal with no code of its own is named by its kind, never as "HTTP <status>"', () => {
  assert.equal(refusalCode(403, {}), 'NOT_ALLOWED')
  assert.equal(refusalCode(401, { code: 'UNAUTHENTICATED' }), 'NOT_ALLOWED')
  assert.equal(refusalCode(502, {}), 'UNAVAILABLE')
  assert.equal(refusalCode(500, null), 'UNAVAILABLE')
  assert.equal(refusalCode(400, { code: 'BAD_URL' }), 'BAD_URL')
})

test('every failure reads as a translated sentence; an unknown code gets the general one', () => {
  for (const code of [
    'NOT_ALLOWED',
    'UNAVAILABLE',
    'EXTRACT_FAILED',
    'NO_SITE',
    'BAD_URL',
    'NO_MATERIAL',
    'ABORTED'
  ]) {
    const text = failureText(code, t)
    assert.ok(!text.startsWith('job.failed.'), `${code} has no sentence`)
  }
  assert.equal(failureText('HTTP 403', t), en['job.failed.other'])
  assert.equal(failureText('SOMETHING_NEW', t), en['job.failed.other'])
  assert.equal(failureText(undefined, t), en['job.failed.other'])
  for (const code of ['HTTP 403', 'SOMETHING_NEW', 'NOT_ALLOWED']) {
    assert.doesNotMatch(failureText(code, t), /HTTP|\d{3}|[A-Z]{2,}_[A-Z]/)
  }
})

test('the job a refusal leaves behind is named by the site it was for, never "?"', () => {
  assert.equal(hostOfInput('https://www.Example.com/about', 'own.tracy.site'), 'example.com')
  assert.equal(hostOfInput('example.com', null), 'example.com')
  assert.equal(hostOfInput(null, 'Shop.Tracy.Site'), 'shop.tracy.site')
  assert.equal(hostOfInput('not an address', null), 'not an address')
})
