import assert from 'node:assert/strict'
import { test } from 'node:test'
import { customerText } from '../src/client/customer-text.ts'

const diagnostic = (key, params) =>
  ({
    'cell.social.deferred': `Daily limit reached - ${params?.when}`,
    'reason.quota': 'Quota reached. Resume later.',
    'reason.rate_limited': 'Too many provider requests.',
    'reason.other': 'Not available',
    'v3.limitReached': 'Daily build limit reached.'
  })[key] ?? `${key}:${params?.author ?? ''}`

test('customer Find hides social quota and reset times without changing operator text', () => {
  const customer = customerText(diagnostic)
  assert.equal(customer('cell.social.deferred', { when: 'in 8 hours' }), '')
  assert.match(diagnostic('cell.social.deferred', { when: 'in 8 hours' }), /Daily limit reached.*in 8 hours/)
  assert.equal(customer('cell.social.lastPost', { author: 'Lan' }), 'cell.social.lastPost:Lan')
})

test('customer Details uses neutral missing-data text for optional provider quotas', () => {
  const customer = customerText(diagnostic)
  for (const key of ['reason.quota', 'reason.rate_limited']) {
    assert.equal(customer(key), 'Not available')
    assert.doesNotMatch(customer(key), /quota|limit|resume|hours|requests/i)
  }
  assert.equal(
    customer('v3.limitReached'),
    'Daily build limit reached.',
    'build action limits retain their existing behavior'
  )
})
