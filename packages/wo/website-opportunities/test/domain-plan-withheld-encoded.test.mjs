// The plan's withheld ids (`plan-withheld.mjs withheldIdsOf`, #609, decision D46) see a held name behind character
// references read twice and behind percent escapes, as the write guard does (`draft-write-held.mjs plainFormsOf`): an
// item whose data link writes `Siobhan%20O%27Neill`, or whose caption writes `O&amp;#39;Neill`, never reaches the plan.
// Invented names and addresses only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-withheld-encoded.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withheldIdsOf } from '../domain/plan-withheld.mjs'

const HELD = "Siobhan O'Neill"
const photo = (id, fields) => [id, { what: 'item', kind: 'photo', source: { id, ...fields } }]
const fact = (id, value) => [id, { what: 'fact', kind: 'business.tagline', entry: { value } }]

test('a held name behind double encoded entities or percent escapes is withheld from the plan', () => {
  const data = {
    byId: new Map([
      photo('p1', { url: 'https://img.example/team?who=Siobhan%20O%27Neill' }),
      photo('p2', { caption: 'Siobhan O&amp;#39;Neill at the wheel' }),
      photo('p3', { url: 'https://img.example/team/siobhan%2Do%2Dneill.jpg' }),
      fact('f1', 'Ask Siobhan O&#x27;Neill+about raku'),
      photo('p4', { url: 'https://img.example/team?who=Brannoch%20Vey', caption: 'The kiln room' }),
      fact('f2', '50% off glazing nights')
    ])
  }
  assert.deepEqual([...withheldIdsOf(data, { people: [HELD] })].sort(), ['f1', 'p1', 'p2', 'p3'])
  assert.deepEqual([...withheldIdsOf(data, {})], [])
})
