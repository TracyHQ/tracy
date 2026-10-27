/**
 * What the ops sheet says about a card's content contract: the status of each platform and the
 * cautions Publish answers with. No database: the index is read from profiles written to a temp dir,
 * and the status must come from the same `contractFor` the provisioning entry uses.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  contractBlockers,
  contractRefusalText,
  contractStatus,
  contractWarnings
} from '../src/lib/brief-support.js'
import { readContracts } from '../src/lib/contracts.js'

function indexWith(versions) {
  const dir = mkdtempSync(path.join(tmpdir(), 'contract-status-'))
  for (const v of versions) {
    const at = path.join(dir, 'tracy-base/wp7', v)
    mkdirSync(at, { recursive: true })
    writeFileSync(
      path.join(at, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 'tracy-quickstart-contract/v1',
        id: `tracy-base/wp7/${v}`,
        platform: 'wordpress',
        quickstart: { release: 'tracy-base/wp7', version: v },
        coworkMinVersion: '0.8.0',
        mode: 'content-recommendation'
      })
    )
  }
  return readContracts(dir)
}

const wp = (version) => ({ platform: 'wordpress', tag: 'tracy-base/wp7', version })

test('exact: a profile sealed for this very version', () => {
  assert.deepEqual(contractStatus(wp('1.0.0'), indexWith(['1.0.0'])), {
    state: 'exact',
    profile: 'tracy-base/wp7/1.0.0',
    version: '1.0.0'
  })
})

test('lower: the nearest lower profile of the same major serves the release, and the status names both', () => {
  assert.deepEqual(contractStatus(wp('1.0.3'), indexWith(['1.0.0', '1.0.2'])), {
    state: 'lower',
    profile: 'tracy-base/wp7/1.0.2',
    version: '1.0.3'
  })
})

test('none: no profile for the release, another major is not a neighbour, and no version is none', () => {
  const index = indexWith(['1.0.0'])
  assert.deepEqual(contractStatus(wp('2.0.0'), index), { state: 'none', profile: null, version: '2.0.0' })
  assert.deepEqual(
    contractStatus({ platform: 'joomla', tag: 'other/j5', version: '1.0.0' }, index).state,
    'none'
  )
  assert.deepEqual(contractStatus({ platform: 'wordpress', tag: 'tracy-base/wp7' }, index), {
    state: 'none',
    profile: null,
    version: null
  })
})

test('not-applicable: EmDash has no component to bind', () => {
  const status = contractStatus(
    { platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0' },
    indexWith([])
  )
  assert.deepEqual(status, { state: 'not-applicable', profile: null, version: '1.0.0' })
})

test('warnings: only a lower profile warns; exact, none and EmDash say nothing here', () => {
  const index = indexWith(['1.0.0'])
  const warnings = contractWarnings(
    [
      wp('1.0.0'),
      wp('1.0.1'),
      { platform: 'joomla', tag: 'tracy-base/j5', version: '1.0.0' },
      { platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.0.0' }
    ],
    index
  )
  assert.deepEqual(
    warnings.map((w) => [w.code, w.tag]),
    [['LOWER_CONTRACT', 'tracy-base/wp7']]
  )
  assert.match(
    warnings[0].text,
    /uses the content contract made for tracy-base\/wp7\/1\.0\.0\. It is not tested on 1\.0\.1 yet\./
  )
})

test('blockers: a Joomla or WordPress platform with no contract, and a refusal that names the way the docs give', () => {
  const index = indexWith(['1.0.0'])
  const blockers = contractBlockers(
    [
      wp('1.0.0'),
      wp('1.0.1'),
      { platform: 'joomla', tag: 'quickstart/ja-nova/j6', version: '1.0.0' },
      { platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '1.0.0' }
    ],
    index
  )
  assert.deepEqual(blockers, [{ platform: 'joomla', tag: 'quickstart/ja-nova/j6' }])
  const text = contractRefusalText(blockers)
  assert.match(text, /^Not published: quickstart\/ja-nova\/j6 has no content contract/)
  assert.match(text, /quickstart-contract skill/)
  assert.match(
    text,
    /merge it to develop, and publish again once CI has deployed this server\. Road to live, step 3, lists every step\.$/
  )
  // batch-contracts only sees published card files, so it can never capture this release.
  assert.doesNotMatch(text, /batch-contracts/)
  assert.doesNotMatch(text, /[—–]/, 'no dashes in copy')
})
