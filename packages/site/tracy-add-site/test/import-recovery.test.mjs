// The import recovery page's address (`src/client/import-recovery.mjs`): the one tracy-web builds in
// `apps/tracy-web/src/lib/import-pending.js` `importRecoveryPath` and sends a person to instead of a
// site whose import never finished.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recoveryAsk } from '../src/client/import-recovery.mjs'

test('the address tracy-web sends names the site to recover', () => {
  assert.equal(recoveryAsk('?tab=tracy:add-site&import=old-shop.example.com'), 'old-shop.example.com')
  assert.equal(
    recoveryAsk(`?tab=tracy:add-site&import=${encodeURIComponent('Old-Shop.Example.com')}`),
    'old-shop.example.com'
  )
})

test('anything that is not a plain host name asks for nothing', () => {
  for (const search of [
    '',
    '?tab=tracy:add-site',
    '?import=',
    '?import=../x',
    '?import=a/b',
    '?import=-bad.com',
    `?import=${'a'.repeat(254)}`
  ])
    assert.equal(recoveryAsk(search), undefined, search)
})
