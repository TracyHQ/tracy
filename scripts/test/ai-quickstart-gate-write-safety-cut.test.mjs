// A content plugin code a list prints only cut short is judged by no page (ticket #586, review 6 S2): the page neither
// ran it nor printed it whole, so the (place, probe) pair has a result, `not_judged`, and the place is not counted as
// tested from it. The invented tea room build, one heading, on a site in memory whose list cuts every intro.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'

const order = { pages: [{ id: 'home', blocks: [{ id: 'home-b1', block: 'block-1' }] }] }
const build = (options) => {
  const value = options.textOf({
    page: 'home',
    key: 'home-b1/heading',
    code: 'AAB',
    kind: 'heading',
    limit: 80
  })
  const writePlan = {
    ops: [
      {
        key: 'contract:store:module-1',
        values: [
          {
            value,
            entry: 'home.home-b1.heading',
            loc: { entity: 'module-1', column: 'content', slot: 'module-1.0' }
          }
        ]
      }
    ]
  }
  return Promise.resolve({ writePlan, order, gaps: [] })
}
/** A site whose one page prints each stored value cut to `cut` characters, with an ellipsis, or whole. */
const siteOf = (cut) => {
  let last = null
  return {
    reset: async () => {},
    write: async (built) => {
      last = built
      return { report: { status: 'done' }, record: {} }
    },
    pages: async () => [{ pageType: 'home', url: 'http://tearoom.invalid/' }],
    fetch: async () => {
      const v = last.writePlan.ops[0].values[0].value
      return {
        status: 200,
        html: '<html><body><li>' + (cut ? v.slice(0, cut) + '...' : v) + '</li></body></html>'
      }
    }
  }
}
const loadposition = JOOMLA_PROBES.filter((p) => p.id === 'loadposition')

test('S2: a code printed only cut short is not judged, and its place is not tested from it', async () => {
  const result = await writeSafety({
    build,
    site: siteOf(14),
    probes: loadposition,
    limits: { ...LIMITS, steps: 0 }
  })
  const row = result.ledger.find((r) => r.place === 'writer:home/home-b1/heading')
  assert.equal(row.status, 'not_judged', JSON.stringify(row))
  assert.equal(row.why, 'every_print_cut')
  assert.equal(result.places.tested, 0)
  assert.equal(result.findings.length, 0)
  assert.equal(result.status, 'incomplete')
  assert.deepEqual(
    result.ends.untested.map((u) => u.why),
    ['judged_by_no_page']
  )
})

test('S2: the same code printed whole is judged and its place tested', async () => {
  const result = await writeSafety({
    build,
    site: siteOf(0),
    probes: loadposition,
    limits: { ...LIMITS, steps: 0 }
  })
  assert.equal(result.ledger[0].status, 'written')
  assert.equal(result.places.tested, 1)
  assert.equal(result.status, 'passed')
})
