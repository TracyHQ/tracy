/**
 * The contract-pair rule of the `design-templates` gate (`src/lib/template-profile-contract-pairs.js`): the newest
 * contract of a Joomla/WordPress release needs an exact profile row, and the newest row its contract.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import { contractPairProblems } from '../src/lib/template-profile-contract-pairs.js'
import { TEMPLATE_PROFILES } from '../src/lib/template-profiles.js'

const row = { logos: 'pair', brandReady: true, faviconReady: true }
const index = (...keys) => new Map(keys.map((k) => [k, { id: k }]))
const WP = 'tracy-business/wp7'

test('a newest contract with its exact row, and the row with its contract, is clean', () => {
  const t = { releases: { [WP]: { '1.3.6': row, '1.3.7': row } } }
  assert.deepEqual(contractPairProblems(t, index(`${WP}@1.3.6`, `${WP}@1.3.7`)), [])
})

test('a contract cut for a version the table has no row for is red, naming the newest row', () => {
  const t = { releases: { [WP]: { '1.3.6': row } } }
  const got = contractPairProblems(t, index(`${WP}@1.3.6`, `${WP}@1.3.7`))
  assert.equal(got.length, 1)
  assert.match(
    got[0],
    /tracy-business\/wp7@1\.3\.7 has a contract profile but template-profiles\.json has no row/
  )
  assert.match(got[0], /newest row 1\.3\.6/)
})

test('a row added for a version no contract seals is red, naming the newest contract', () => {
  const t = { releases: { [WP]: { '1.3.6': row, '1.3.7': row } } }
  const got = contractPairProblems(t, index(`${WP}@1.3.6`))
  assert.equal(got.length, 1)
  assert.match(got[0], /tracy-business\/wp7@1\.3\.7 has a template-profiles\.json row but no contract/)
  assert.match(got[0], /newest contract 1\.3\.6/)
})

test('versions compare as numbers, an old missing row is not asked for, and EmDash is skipped', () => {
  const t = { releases: { [WP]: { '1.3.10': row }, 'tracy-business/emdash-0.x': { '1.4.0': row } } }
  assert.deepEqual(contractPairProblems(t, index(`${WP}@1.3.9`, `${WP}@1.3.10`)), [])
})

test('an owed pair is not red while missing, and red once it is paid', () => {
  const contracts = index(`${WP}@1.3.6`, `${WP}@1.3.7`)
  const missing = { releases: { [WP]: { '1.3.6': row } } }
  assert.deepEqual(contractPairProblems(missing, contracts, { owed: [`${WP}@1.3.7`] }), [])
  const paid = { releases: { [WP]: { '1.3.6': row, '1.3.7': row } } }
  const got = contractPairProblems(paid, contracts, { owed: [`${WP}@1.3.7`] })
  assert.equal(got.length, 1)
  assert.match(got[0], /listed as owed but is no longer missing/)
})

test('the repository: every release pairs its newest contract and row, apart from the owed list', () => {
  const owedFile = path.join(import.meta.dirname, '../../../scripts/lib/profile-rows-owed.json')
  const { owed } = JSON.parse(readFileSync(owedFile, 'utf8'))
  assert.deepEqual(contractPairProblems(TEMPLATE_PROFILES, readContracts(), { owed }), [])
})
