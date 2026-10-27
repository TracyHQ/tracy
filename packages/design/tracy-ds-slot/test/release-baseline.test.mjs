// VERIFICATION.json travels with the release: `verify --baseline <dir>` names the version it compared
// with by its release and version, never by the folder it read on the building machine.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baselineAgainst } from '../src/release-baseline.mjs'

test('a baseline release folder is named by its release and version, not its path', () => {
  const against = baselineAgainst(
    {
      release: 'quickstart/ja-diner/j6',
      version: '1.0.3',
      builtFrom: { change: 'repaired: 119 files replaced' }
    },
    'quickstart/other/j6'
  )
  assert.equal(against, 'quickstart/ja-diner/j6@1.0.3 as built locally: repaired: 119 files replaced')
})

test('a baseline manifest without its release or change still names the tag and version', () => {
  assert.equal(
    baselineAgainst({ version: '1.0.0' }, 'quickstart/ja-intranet/j6'),
    'quickstart/ja-intranet/j6@1.0.0 as built locally'
  )
})
